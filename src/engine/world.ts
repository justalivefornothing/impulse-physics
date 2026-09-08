import { Vec2 } from './vec2.ts'
import { Body, type BodyOptions } from './body.ts'
import type { Shape } from './shapes.ts'
import { SpatialHash } from './spatialHash.ts'
import { Contact, pairKey } from './contact.ts'
import type { Joint } from './joints.ts'
import { IslandBuilder } from './island.ts'

export interface WorldSettings {
  gravity: Vec2
  /** Sequential-impulse passes per step. */
  velocityIterations: number
  baumgarte: number
  linearSlop: number
  restitutionThreshold: number
  /** Broad-phase grid cell size in world units. */
  cellSize: number
  /** Speed clamp (m/s) that stops runaway bodies from tunnelling. */
  maxLinearSpeed: number
  maxAngularSpeed: number
  allowSleep: boolean
  sleepLinearTolerance: number
  sleepAngularTolerance: number
  timeToSleep: number
}

export const DEFAULT_SETTINGS: Readonly<WorldSettings> = {
  gravity: new Vec2(0, -10),
  velocityIterations: 10,
  baumgarte: 0.2,
  linearSlop: 0.005,
  restitutionThreshold: 0.5,
  cellSize: 2,
  maxLinearSpeed: 120,
  maxAngularSpeed: 60,
  allowSleep: true,
  sleepLinearTolerance: 0.05,
  sleepAngularTolerance: (2 * Math.PI) / 180,
  timeToSleep: 0.5,
}

export interface StepStats {
  bodies: number
  awake: number
  sleeping: number
  islands: number
  /** Candidate pairs from the broad phase. */
  pairs: number
  /** Contacts whose shapes actually touch. */
  contacts: number
  contactPoints: number
  joints: number
  /** Milliseconds spent in the last step, split by phase. */
  stepMs: number
  broadMs: number
  narrowMs: number
  solveMs: number
}

const now: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now()

/**
 * The simulation container. `step(dt)` advances every body by one fixed
 * increment; callers are expected to drive it from a fixed-timestep loop.
 */
export class World {
  readonly settings: WorldSettings
  readonly bodies: Body[] = []
  readonly joints: Joint[] = []
  /** Persistent contacts keyed by body pair; insertion order keeps the solve deterministic. */
  readonly contacts = new Map<number, Contact>()
  readonly broadPhase: SpatialHash
  readonly stats: StepStats = {
    bodies: 0,
    awake: 0,
    sleeping: 0,
    islands: 0,
    pairs: 0,
    contacts: 0,
    contactPoints: 0,
    joints: 0,
    stepMs: 0,
    broadMs: 0,
    narrowMs: 0,
    solveMs: 0,
  }
  /** Number of steps taken so far. */
  stepIndex = 0
  /** Simulated seconds elapsed. */
  time = 0

  private nextBodyId = 1
  private readonly islandBuilder = new IslandBuilder()
  private readonly pairBuffer: Body[] = []
  /** Pair keys of bodies linked by a joint with collideConnected = false (value = joint count). */
  private readonly noCollidePairs = new Map<number, number>()

  constructor(settings: Partial<WorldSettings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings, gravity: (settings.gravity ?? DEFAULT_SETTINGS.gravity).clone() }
    this.broadPhase = new SpatialHash(this.settings.cellSize)
  }

  /** Broad-phase veto (PairFilter): skip static-static pairs and jointed pairs that opted out. */
  shouldCollide(a: Body, b: Body): boolean {
    if (a.type !== 'dynamic' && b.type !== 'dynamic') return false
    return this.noCollidePairs.size === 0 || !this.noCollidePairs.has(pairKey(a, b))
  }

  // ------------------------------------------------------------------ bodies

  /** Creates a body; `id` is only passed when restoring a snapshot and must be unique. */
  createBody(shape: Shape, opts: BodyOptions = {}, id?: number): Body {
    let bodyId: number
    if (id === undefined) {
      bodyId = this.nextBodyId++
    } else {
      bodyId = id
      if (id >= this.nextBodyId) this.nextBodyId = id + 1
    }
    const body = new Body(bodyId, shape, opts)
    this.bodies.push(body)
    return body
  }

  removeBody(body: Body): void {
    const i = this.bodies.indexOf(body)
    if (i === -1) return
    this.bodies.splice(i, 1)
    for (const [key, c] of this.contacts) {
      if (c.a === body || c.b === body) {
        this.contacts.delete(key)
        // Whatever the removed body was resting on should re-settle.
        if (c.a !== body) c.a.wake()
        if (c.b !== body) c.b.wake()
      }
    }
    for (let j = this.joints.length - 1; j >= 0; j--) {
      const joint = this.joints[j]!
      if (joint.bodyA === body || joint.bodyB === body) this.removeJoint(joint)
    }
  }

  addJoint(joint: Joint): void {
    this.joints.push(joint)
    joint.bodyA?.wake()
    joint.bodyB.wake()
    if (joint.bodyA && !joint.collideConnected) {
      const key = pairKey(joint.bodyA, joint.bodyB)
      this.noCollidePairs.set(key, (this.noCollidePairs.get(key) ?? 0) + 1)
      this.contacts.delete(key)
    }
  }

  removeJoint(joint: Joint): void {
    const i = this.joints.indexOf(joint)
    if (i === -1) return
    this.joints.splice(i, 1)
    joint.bodyA?.wake()
    joint.bodyB.wake()
    if (joint.bodyA && !joint.collideConnected) {
      const key = pairKey(joint.bodyA, joint.bodyB)
      const n = (this.noCollidePairs.get(key) ?? 1) - 1
      if (n <= 0) this.noCollidePairs.delete(key)
      else this.noCollidePairs.set(key, n)
    }
  }

  clear(): void {
    this.nextBodyId = 1
    this.bodies.length = 0
    this.joints.length = 0
    this.contacts.clear()
    this.noCollidePairs.clear()
    this.broadPhase.clear()
    this.time = 0
    this.stepIndex = 0
  }

  wakeAll(): void {
    for (const b of this.bodies) b.wake()
  }

  /** Topmost (last added) dynamic body containing the world point, or null. */
  queryPoint(x: number, y: number, includeStatic = false): Body | null {
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i]!
      if (!includeStatic && b.type === 'static') continue
      const bb = b.aabb
      if (x < bb.minX || x > bb.maxX || y < bb.minY || y > bb.maxY) continue
      if (b.containsPoint(x, y)) return b
    }
    return null
  }

  // ------------------------------------------------------------------ stepping

  step(dt: number): void {
    const t0 = now()
    const s = this.settings
    const invDt = dt > 0 ? 1 / dt : 0

    // 1. Remember the previous transform for render interpolation.
    for (const b of this.bodies) {
      b.prevPosition.copy(b.position)
      b.prevAngle = b.angle
    }

    // 2. Broad phase: rebuild the grid and collect overlapping pairs.
    const bp = this.broadPhase
    bp.cellSize = s.cellSize
    bp.clear()
    for (const b of this.bodies) bp.insert(b)
    const pairs = this.pairBuffer
    bp.queryPairs(pairs, this)
    const t1 = now()

    // 3. Narrow phase: update persistent contacts, create new ones, prune stale ones.
    this.stepIndex++
    const stepIndex = this.stepIndex
    let touching = 0
    let points = 0
    for (let i = 0; i < pairs.length; i += 2) {
      const a = pairs[i]!
      const b = pairs[i + 1]!
      const key = pairKey(a, b)
      let c = this.contacts.get(key)
      if (!c) {
        c = new Contact(a, b)
        this.contacts.set(key, c)
      }
      c.lastStep = stepIndex
      // Sleeping pairs keep their old manifold (and warm-start impulses) untouched.
      if (!isActive(a) && !isActive(b)) {
        if (c.touching) {
          touching++
          points += c.count
        }
        continue
      }
      c.update()
      if (c.touching) {
        touching++
        points += c.count
        // An awake body touching a sleeper wakes it up.
        if (!a.awake && a.type === 'dynamic') a.wake()
        if (!b.awake && b.type === 'dynamic') b.wake()
        c.sampleRestitution(s)
      }
    }
    for (const [key, c] of this.contacts) {
      if (c.lastStep !== stepIndex) this.contacts.delete(key)
    }
    const t2 = now()

    // 4. Integrate forces -> velocities (semi-implicit Euler, part one).
    const gx = s.gravity.x
    const gy = s.gravity.y
    for (const b of this.bodies) {
      if (b.type !== 'dynamic' || !b.awake) continue
      b.velocity.x += dt * (gx + b.force.x * b.invMass)
      b.velocity.y += dt * (gy + b.force.y * b.invMass)
      b.angularVelocity += dt * b.torque * b.invInertia
      // Damping as a stable implicit decay: v *= 1 / (1 + dt * c)
      if (b.linearDamping > 0) b.velocity.scaleInPlace(1 / (1 + dt * b.linearDamping))
      if (b.angularDamping > 0) b.angularVelocity /= 1 + dt * b.angularDamping
    }

    // 5. Constraint pre-step (effective masses, biases, warm starting).
    for (const c of this.contacts.values()) {
      if (!c.touching) continue
      if (!isActive(c.a) && !isActive(c.b)) continue
      c.preStep(invDt, s)
    }
    for (const j of this.joints) {
      if (!isActive(j.bodyB) && !(j.bodyA && isActive(j.bodyA))) continue
      j.preStep(dt, invDt, s)
    }

    // 6. Sequential impulses.
    for (let iter = 0; iter < s.velocityIterations; iter++) {
      for (const j of this.joints) {
        if (!isActive(j.bodyB) && !(j.bodyA && isActive(j.bodyA))) continue
        j.solveVelocity()
      }
      for (const c of this.contacts.values()) {
        if (!c.touching) continue
        if (!isActive(c.a) && !isActive(c.b)) continue
        c.solveVelocity()
      }
    }

    // 7. Integrate velocities -> positions (semi-implicit Euler, part two).
    const maxV = s.maxLinearSpeed
    const maxW = s.maxAngularSpeed
    for (const b of this.bodies) {
      if (b.type !== 'dynamic' || !b.awake) continue
      const speedSq = b.velocity.lengthSq()
      if (speedSq > maxV * maxV) b.velocity.scaleInPlace(maxV / Math.sqrt(speedSq))
      if (b.angularVelocity > maxW) b.angularVelocity = maxW
      else if (b.angularVelocity < -maxW) b.angularVelocity = -maxW
      b.position.x += b.velocity.x * dt
      b.position.y += b.velocity.y * dt
      b.angle += b.angularVelocity * dt
      b.syncRotation()
      b.updateAABB()
      b.force.set(0, 0)
      b.torque = 0
    }
    const t3 = now()

    // 8. Islands and sleeping.
    const islandStats = this.islandBuilder.update(this.bodies, this.contacts.values(), this.joints, dt, s)

    this.time += dt
    const t4 = now()

    let awake = 0
    for (const b of this.bodies) if (b.type === 'dynamic' && b.awake) awake++
    const st = this.stats
    st.bodies = this.bodies.length
    st.awake = awake
    st.sleeping = islandStats.sleeping
    st.islands = islandStats.islands
    st.pairs = pairs.length / 2
    st.contacts = touching
    st.contactPoints = points
    st.joints = this.joints.length
    st.broadMs = t1 - t0
    st.narrowMs = t2 - t1
    st.solveMs = t3 - t2
    st.stepMs = t4 - t0
  }

  /** Total mechanical energy relative to y = 0 (useful for tests). */
  totalEnergy(): number {
    let e = 0
    const g = this.settings.gravity
    for (const b of this.bodies) {
      if (b.type !== 'dynamic') continue
      e += b.kineticEnergy() - b.mass * (g.x * b.position.x + g.y * b.position.y)
    }
    return e
  }
}

/** A body takes part in the solve only when it is dynamic and awake. */
function isActive(b: Body): boolean {
  return b.type === 'dynamic' && b.awake
}
