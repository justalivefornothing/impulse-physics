import { Vec2 } from './vec2.ts'
import { type Body } from './body.ts'
import { makeCircle, polygonFromVertices, type Shape } from './shapes.ts'
import { Contact } from './contact.ts'
import { DistanceJoint, RevoluteJoint, type Joint } from './joints.ts'
import type { World, WorldSettings } from './world.ts'

/**
 * Plain-data snapshot of a World. Everything the solver carries between steps
 * is included (contact manifolds with accumulated impulses, joint impulses,
 * sleep timers, step counter), so restoring a snapshot and stepping produces
 * results that are bit-identical to having never stopped. Doubles survive
 * JSON.stringify / JSON.parse exactly, which is what makes the round trip
 * deterministic.
 */
export const SNAPSHOT_VERSION = 1

export type ShapeSnapshot = { k: 'c'; r: number } | { k: 'p'; v: number[] }

export interface BodySnapshot {
  id: number
  /** 's' static, 'd' dynamic. */
  t: 's' | 'd'
  shape: ShapeSnapshot
  /** Position, angle, velocity, angular velocity. */
  p: [number, number]
  a: number
  v: [number, number]
  w: number
  /** Mass and inertia (already scaled by density). */
  m: number
  i: number
  /** Restitution, friction, linear and angular damping. */
  e: number
  f: number
  ld: number
  ad: number
  fixed: boolean
  canSleep: boolean
  awake: boolean
  sleepTime: number
  /** JSON-compatible caller data (renderers store colours here). */
  user?: unknown
}

export interface JointSnapshot {
  kind: 'distance' | 'revolute'
  a: number
  b: number
  la: [number, number]
  lb: [number, number]
  collide: boolean
  /** Distance joint parameters. */
  length?: number
  hz?: number
  damping?: number
  /** Accumulated impulses. */
  state: number[]
}

export interface ContactPointSnapshot {
  id: number
  pn: number
  pt: number
  x: number
  y: number
  pen: number
}

export interface ContactSnapshot {
  a: number
  b: number
  touching: boolean
  lastStep: number
  n: [number, number]
  points: ContactPointSnapshot[]
}

export interface WorldSnapshot {
  version: number
  time: number
  stepIndex: number
  settings: Omit<WorldSettings, 'gravity'> & { gravity: [number, number] }
  bodies: BodySnapshot[]
  joints: JointSnapshot[]
  contacts: ContactSnapshot[]
}

function snapshotShape(shape: Shape): ShapeSnapshot {
  if (shape.kind === 'circle') return { k: 'c', r: shape.radius }
  const v: number[] = []
  for (const p of shape.vertices) v.push(p.x, p.y)
  return { k: 'p', v }
}

function restoreShape(s: ShapeSnapshot): Shape {
  if (s.k === 'c') return makeCircle(s.r)
  const verts: Vec2[] = []
  for (let i = 0; i + 1 < s.v.length; i += 2) verts.push(new Vec2(s.v[i]!, s.v[i + 1]!))
  return polygonFromVertices(verts)
}

function snapshotBody(b: Body): BodySnapshot {
  const out: BodySnapshot = {
    id: b.id,
    t: b.type === 'static' ? 's' : 'd',
    shape: snapshotShape(b.shape),
    p: [b.position.x, b.position.y],
    a: b.angle,
    v: [b.velocity.x, b.velocity.y],
    w: b.angularVelocity,
    m: b.mass,
    i: b.inertia,
    e: b.restitution,
    f: b.friction,
    ld: b.linearDamping,
    ad: b.angularDamping,
    fixed: b.fixedRotation,
    canSleep: b.canSleep,
    awake: b.awake,
    sleepTime: b.sleepTime,
  }
  if (b.userData !== undefined) out.user = b.userData
  return out
}

function snapshotJoint(j: Joint): JointSnapshot | null {
  if (j instanceof DistanceJoint) {
    return {
      kind: 'distance',
      a: j.bodyA.id,
      b: j.bodyB.id,
      la: [j.localAnchorA.x, j.localAnchorA.y],
      lb: [j.localAnchorB.x, j.localAnchorB.y],
      collide: j.collideConnected,
      length: j.length,
      hz: j.frequencyHz,
      damping: j.dampingRatio,
      state: j.saveState(),
    }
  }
  if (j instanceof RevoluteJoint) {
    return {
      kind: 'revolute',
      a: j.bodyA.id,
      b: j.bodyB.id,
      la: [j.localAnchorA.x, j.localAnchorA.y],
      lb: [j.localAnchorB.x, j.localAnchorB.y],
      collide: j.collideConnected,
      state: j.saveState(),
    }
  }
  // Mouse joints are transient interaction state and are not persisted.
  return null
}

function snapshotContact(c: Contact): ContactSnapshot {
  const points: ContactPointSnapshot[] = []
  for (let i = 0; i < c.count; i++) {
    const p = c.points[i]!
    points.push({ id: p.id, pn: p.Pn, pt: p.Pt, x: p.x, y: p.y, pen: p.penetration })
  }
  return { a: c.a.id, b: c.b.id, touching: c.touching, lastStep: c.lastStep, n: [c.normalX, c.normalY], points }
}

/** Captures the complete solver state of `world`. */
export function snapshotWorld(world: World): WorldSnapshot {
  const s = world.settings
  const joints: JointSnapshot[] = []
  for (const j of world.joints) {
    const js = snapshotJoint(j)
    if (js) joints.push(js)
  }
  return {
    version: SNAPSHOT_VERSION,
    time: world.time,
    stepIndex: world.stepIndex,
    settings: { ...s, gravity: [s.gravity.x, s.gravity.y] },
    bodies: world.bodies.map(snapshotBody),
    joints,
    contacts: [...world.contacts.values()].map(snapshotContact),
  }
}

/**
 * Replaces the contents of `world` with the snapshot. Bodies keep their ids so
 * pair keys, contact ordering and therefore the solve order are preserved.
 */
export function restoreWorld(world: World, snap: WorldSnapshot): void {
  if (snap.version !== SNAPSHOT_VERSION) throw new Error(`unsupported snapshot version ${snap.version}`)
  world.clear()
  const s = world.settings
  const { gravity, ...rest } = snap.settings
  Object.assign(s, rest)
  s.gravity.set(gravity[0], gravity[1])

  const byId = new Map<number, Body>()
  const snapById = new Map<number, BodySnapshot>()
  for (const bs of snap.bodies) {
    snapById.set(bs.id, bs)
    const body = world.createBody(
      restoreShape(bs.shape),
      {
        type: bs.t === 's' ? 'static' : 'dynamic',
        position: { x: bs.p[0], y: bs.p[1] },
        angle: bs.a,
        velocity: { x: bs.v[0], y: bs.v[1] },
        angularVelocity: bs.w,
        restitution: bs.e,
        friction: bs.f,
        linearDamping: bs.ld,
        angularDamping: bs.ad,
        fixedRotation: bs.fixed,
        canSleep: bs.canSleep,
        userData: bs.user,
      },
      bs.id,
    )
    if (body.type === 'dynamic') body.setMassData(bs.m, bs.i)
    body.awake = body.type === 'dynamic' ? bs.awake : true
    body.sleepTime = bs.sleepTime
    byId.set(body.id, body)
  }

  for (const js of snap.joints) {
    const a = byId.get(js.a)
    const b = byId.get(js.b)
    if (!a || !b) continue
    const la = new Vec2(js.la[0], js.la[1])
    const lb = new Vec2(js.lb[0], js.lb[1])
    let joint: DistanceJoint | RevoluteJoint
    if (js.kind === 'distance') {
      joint = new DistanceJoint({
        bodyA: a,
        bodyB: b,
        localAnchorA: la,
        localAnchorB: lb,
        length: js.length,
        frequencyHz: js.hz,
        dampingRatio: js.damping,
        collideConnected: js.collide,
      })
    } else {
      joint = new RevoluteJoint({ bodyA: a, bodyB: b, localAnchorA: la, localAnchorB: lb, collideConnected: js.collide })
    }
    joint.loadState(js.state)
    world.addJoint(joint)
    // addJoint wakes both bodies; the snapshot knows better.
    const sa = snapById.get(js.a)
    const sb = snapById.get(js.b)
    if (sa && a.type === 'dynamic') a.awake = sa.awake
    if (sb && b.type === 'dynamic') b.awake = sb.awake
    if (sa) a.sleepTime = sa.sleepTime
    if (sb) b.sleepTime = sb.sleepTime
  }

  for (const cs of snap.contacts) {
    const a = byId.get(cs.a)
    const b = byId.get(cs.b)
    if (!a || !b) continue
    const c = new Contact(a, b)
    c.touching = cs.touching
    c.lastStep = cs.lastStep
    c.normalX = cs.n[0]
    c.normalY = cs.n[1]
    c.count = Math.min(cs.points.length, 2)
    for (let i = 0; i < c.count; i++) {
      const src = cs.points[i]!
      const dst = c.points[i]!
      dst.id = src.id
      dst.Pn = src.pn
      dst.Pt = src.pt
      dst.x = src.x
      dst.y = src.y
      dst.penetration = src.pen
    }
    world.contacts.set(c.key, c)
  }

  world.time = snap.time
  world.stepIndex = snap.stepIndex
}

/** Serialises a snapshot to JSON. */
export function serializeWorld(world: World): string {
  return JSON.stringify(snapshotWorld(world))
}

/** Parses JSON produced by `serializeWorld` and validates the outer shape. */
export function parseSnapshot(json: string): WorldSnapshot {
  const data: unknown = JSON.parse(json)
  if (!data || typeof data !== 'object') throw new Error('snapshot is not an object')
  const snap = data as Partial<WorldSnapshot>
  if (snap.version !== SNAPSHOT_VERSION) throw new Error(`unsupported snapshot version ${String(snap.version)}`)
  if (!Array.isArray(snap.bodies) || !Array.isArray(snap.joints) || !Array.isArray(snap.contacts) || !snap.settings) {
    throw new Error('snapshot is missing required sections')
  }
  return snap as WorldSnapshot
}
