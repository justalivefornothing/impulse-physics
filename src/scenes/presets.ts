import {
  World,
  Vec2,
  Rng,
  makeBox,
  makeCircle,
  makeRegularPolygon,
  DistanceJoint,
  RevoluteJoint,
  type Body,
  type BodyOptions,
  type Shape,
} from '../engine/index.ts'

/** Presentation hints stored in `body.userData`; the renderer reads them, the engine ignores them. */
export interface BodyTag {
  /** Palette slot for the fill colour. */
  color: number
  /** Wall-clock ms when the body was spawned interactively (drives the pop-in animation). */
  spawnedAt?: number
  /** Soft-body group id; nodes sharing one are drawn as a single filled hull. */
  soft?: number
}

export function tagOf(body: Body): BodyTag | undefined {
  const u = body.userData
  if (u && typeof u === 'object' && 'color' in u) return u as BodyTag
  return undefined
}

/** The world rectangle every scene is designed to fit into (metres). */
export const ARENA = { minX: -21, maxX: 21, floorY: 0, ceilingY: 22 } as const

export interface SceneDef {
  id: string
  name: string
  /** One-line description shown in the panel. */
  blurb: string
  build: (world: World, rng: Rng) => void
}

const STATIC_COLOR = -1

function ground(world: World): Body {
  const width = ARENA.maxX - ARENA.minX
  return world.createBody(makeBox(width / 2 + 4, 1), {
    type: 'static',
    position: { x: 0, y: ARENA.floorY - 1 },
    friction: 0.7,
    userData: { color: STATIC_COLOR } satisfies BodyTag,
  })
}

/** Floor plus two tall side walls so flung bodies stay in view. */
export function addArena(world: World): void {
  ground(world)
  const wallHeight = 40
  for (const x of [ARENA.minX - 1, ARENA.maxX + 1]) {
    world.createBody(makeBox(1, wallHeight / 2), {
      type: 'static',
      position: { x, y: wallHeight / 2 - 2 },
      friction: 0.5,
      userData: { color: STATIC_COLOR } satisfies BodyTag,
    })
  }
}

function dyn(world: World, shape: Shape, opts: BodyOptions, color: number): Body {
  return world.createBody(shape, { ...opts, userData: { color } satisfies BodyTag })
}

function staticBody(world: World, shape: Shape, opts: BodyOptions): Body {
  return world.createBody(shape, { ...opts, type: 'static', userData: { color: STATIC_COLOR } satisfies BodyTag })
}

// ---------------------------------------------------------------- pyramid

export function buildPyramid(world: World, rows: number, boxSize = 1, baseX = 0, baseY = ARENA.floorY): Body[] {
  const half = boxSize / 2
  const bodies: Body[] = []
  for (let row = 0; row < rows; row++) {
    const count = rows - row
    const y = baseY + half + row * boxSize
    const startX = baseX - ((count - 1) * boxSize) / 2
    for (let i = 0; i < count; i++) {
      bodies.push(
        dyn(world, makeBox(half, half), { position: { x: startX + i * boxSize, y }, friction: 0.6, restitution: 0 }, row % 6),
      )
    }
  }
  return bodies
}

// ---------------------------------------------------------------- ragdoll

export interface Ragdoll {
  bodies: Body[]
  joints: RevoluteJoint[]
  head: Body
  torso: Body
}

/** A jointed humanoid; `x, y` is the hip position. */
export function buildRagdoll(world: World, x: number, y: number, color: number, scale = 1): Ragdoll {
  const s = scale
  const opts = { friction: 0.6, restitution: 0.05, angularDamping: 0.5 }
  const torso = dyn(world, makeBox(0.42 * s, 0.7 * s), { ...opts, position: { x, y: y + 0.7 * s } }, color)
  const head = dyn(world, makeCircle(0.38 * s), { ...opts, position: { x, y: y + 1.85 * s } }, color + 1)
  const bodies = [torso, head]
  const joints: RevoluteJoint[] = []
  const pin = (a: Body, b: Body, px: number, py: number) => {
    const j = new RevoluteJoint({ bodyA: a, bodyB: b, anchor: new Vec2(px, py) })
    world.addJoint(j)
    joints.push(j)
  }
  pin(torso, head, x, y + 1.42 * s)

  for (const side of [-1, 1]) {
    const upperArm = dyn(
      world,
      makeBox(0.14 * s, 0.38 * s),
      { ...opts, position: { x: x + side * 0.6 * s, y: y + 0.95 * s } },
      color + 2,
    )
    const lowerArm = dyn(
      world,
      makeBox(0.12 * s, 0.36 * s),
      { ...opts, position: { x: x + side * 0.6 * s, y: y + 0.2 * s } },
      color + 2,
    )
    pin(torso, upperArm, x + side * 0.6 * s, y + 1.3 * s)
    pin(upperArm, lowerArm, x + side * 0.6 * s, y + 0.57 * s)

    const upperLeg = dyn(
      world,
      makeBox(0.17 * s, 0.45 * s),
      { ...opts, position: { x: x + side * 0.22 * s, y: y - 0.45 * s } },
      color + 3,
    )
    const lowerLeg = dyn(
      world,
      makeBox(0.15 * s, 0.45 * s),
      { ...opts, position: { x: x + side * 0.22 * s, y: y - 1.35 * s } },
      color + 3,
    )
    pin(torso, upperLeg, x + side * 0.22 * s, y)
    pin(upperLeg, lowerLeg, x + side * 0.22 * s, y - 0.9 * s)
    bodies.push(upperArm, lowerArm, upperLeg, lowerLeg)
  }
  return { bodies, joints, head, torso }
}

/** Chain of revolute-linked plates hanging from a static anchor; returns the links top to bottom. */
export function buildChain(world: World, x: number, topY: number, links: number, linkLength: number, color: number): Body[] {
  const anchor = staticBody(world, makeCircle(0.15), { position: { x, y: topY } })
  const half = linkLength / 2
  const out: Body[] = []
  let prev = anchor
  let pinY = topY
  for (let i = 0; i < links; i++) {
    const link = dyn(
      world,
      makeBox(0.11, half),
      { position: { x, y: pinY - half }, density: 2, friction: 0.4, angularDamping: 0.2 },
      color,
    )
    world.addJoint(new RevoluteJoint({ bodyA: prev, bodyB: link, anchor: new Vec2(x, pinY) }))
    out.push(link)
    prev = link
    pinY -= linkLength
  }
  return out
}

// ---------------------------------------------------------------- soft bodies

export interface SoftBodyOptions {
  /** Lattice size in nodes. */
  cols: number
  rows: number
  /** Rest distance between neighbouring nodes (m). */
  spacing: number
  /** Node radius (m); keep it under spacing / 2 so non-adjacent nodes do not touch. */
  nodeRadius: number
  /** Spring stiffness as a frequency; lower is squishier. */
  frequencyHz: number
  dampingRatio: number
  color: number
  /** Group id for the renderer's hull fill. */
  group: number
}

/**
 * A soft body approximated by a lattice of small rigid discs joined with soft
 * distance constraints: structural springs along rows and columns plus shear
 * springs across each cell's diagonals, which is what stops the sheet from
 * collapsing into a parallelogram.
 */
export function buildSoftBody(world: World, x: number, y: number, opts: SoftBodyOptions): Body[] {
  const { cols, rows, spacing, nodeRadius, frequencyHz, dampingRatio, color, group } = opts
  const nodes: Body[] = []
  const x0 = x - ((cols - 1) * spacing) / 2
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push(
        world.createBody(makeCircle(nodeRadius), {
          position: { x: x0 + c * spacing, y: y + r * spacing },
          friction: 0.7,
          restitution: 0,
          angularDamping: 2,
          userData: { color, soft: group } satisfies BodyTag,
        }),
      )
    }
  }
  const at = (r: number, c: number): Body => nodes[r * cols + c]!
  const spring = (a: Body, b: Body) => {
    world.addJoint(new DistanceJoint({ bodyA: a, bodyB: b, frequencyHz, dampingRatio }))
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) spring(at(r, c), at(r, c + 1))
      if (r + 1 < rows) spring(at(r, c), at(r + 1, c))
      if (c + 1 < cols && r + 1 < rows) {
        spring(at(r, c), at(r + 1, c + 1))
        spring(at(r, c + 1), at(r + 1, c))
      }
    }
  }
  return nodes
}

// ---------------------------------------------------------------- scene list

export const SCENES: readonly SceneDef[] = [
  {
    id: 'pyramid',
    name: 'Pyramid',
    blurb: '55 boxes in 10 rows. Warm-started contacts keep it from creeping.',
    build(world) {
      addArena(world)
      buildPyramid(world, 10, 1.3)
    },
  },
  {
    id: 'cradle',
    name: "Newton's cradle",
    blurb: 'Five e = 1 balls on rigid distance joints; momentum passes down the line.',
    build(world) {
      addArena(world)
      const beamY = 17
      const beam = staticBody(world, makeBox(6, 0.25), { position: { x: 0, y: beamY } })
      const r = 0.75
      const gap = 0.012
      const rope = 8
      const n = 5
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * (2 * r + gap)
        let pos = new Vec2(x, beamY - rope)
        if (i === 0) {
          // Pull the first ball out along its arc.
          const a = (52 * Math.PI) / 180
          pos = new Vec2(x - rope * Math.sin(a), beamY - rope * Math.cos(a))
        }
        const ball = dyn(world, makeCircle(r), { position: pos, restitution: 1, friction: 0, density: 2, canSleep: false }, 4)
        world.addJoint(new DistanceJoint({ bodyA: beam, bodyB: ball, anchorA: new Vec2(x, beamY), anchorB: pos, length: rope }))
      }
    },
  },
  {
    id: 'ragdoll',
    name: 'Ragdoll chain',
    blurb: 'Revolute-jointed ragdolls: one dangling from a chain, two tumbling down steps.',
    build(world) {
      addArena(world)
      // Steps on the right.
      for (let i = 0; i < 6; i++) {
        staticBody(world, makeBox(1.6, 0.6), { position: { x: 5 + i * 2.6, y: 0.6 + (5 - i) * 1.2 } })
      }
      const links = buildChain(world, -8, 21, 9, 1.2, 5)
      const hanging = buildRagdoll(world, -8, 8.2, 0)
      const last = links[links.length - 1]!
      world.addJoint(new RevoluteJoint({ bodyA: last, bodyB: hanging.head, anchor: new Vec2(-8, 10.4) }))
      buildRagdoll(world, 6, 12, 2, 0.9)
      buildRagdoll(world, 11, 15, 4, 0.9)
    },
  },
  {
    id: 'wrecking',
    name: 'Wrecking ball',
    blurb: 'A dense ball on a 12 m tether swings into a wall of 84 crates.',
    build(world) {
      addArena(world)
      const cols = 6
      const rows = 14
      const w = 0.7
      const startX = 4
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          dyn(
            world,
            makeBox(w / 2, w / 2),
            { position: { x: startX + c * w, y: w / 2 + r * w }, friction: 0.5, restitution: 0 },
            (r + c) % 2 === 0 ? 1 : 2,
          )
        }
      }
      const pivot = new Vec2(-2, 20)
      const rope = 12.5
      const angle = (72 * Math.PI) / 180
      const pos = new Vec2(pivot.x - rope * Math.sin(angle), pivot.y - rope * Math.cos(angle))
      const anchor = staticBody(world, makeCircle(0.2), { position: pivot })
      const ball = dyn(world, makeCircle(1.3), { position: pos, density: 6, friction: 0.4, restitution: 0.1, canSleep: false }, 3)
      world.addJoint(new DistanceJoint({ bodyA: anchor, bodyB: ball, anchorA: pivot, anchorB: pos }))
    },
  },
  {
    id: 'dominoes',
    name: 'Dominoes',
    blurb: 'A ball rolls off a ramp and knocks over a run of 26 dominoes.',
    build(world) {
      addArena(world)
      staticBody(world, makeBox(4, 0.2), { position: { x: -16, y: 5 }, angle: -0.42, friction: 0.6 })
      dyn(world, makeCircle(0.55), { position: { x: -19, y: 7.4 }, density: 3, friction: 0.6, restitution: 0.1 }, 3)
      const count = 26
      const spacing = 1.25
      const startX = -11
      for (let i = 0; i < count; i++) {
        dyn(
          world,
          makeBox(0.16, 1.1),
          { position: { x: startX + i * spacing, y: 1.1 }, friction: 0.5, restitution: 0 },
          i % 6,
        )
      }
    },
  },
  {
    id: 'plinko',
    name: 'Plinko',
    blurb: 'A cloud of discs and hexagons tumbles through offset pegs into bins.',
    build(world, rng) {
      addArena(world)
      const rows = 8
      const pegSpacing = 2.2
      for (let r = 0; r < rows; r++) {
        const y = 15 - r * 1.5
        const offset = r % 2 === 0 ? 0 : pegSpacing / 2
        for (let x = -15 + offset; x <= 15; x += pegSpacing) {
          staticBody(world, makeCircle(0.22), { position: { x, y }, friction: 0.2, restitution: 0.4 })
        }
      }
      // Bins.
      for (let x = -15; x <= 15; x += 3) {
        staticBody(world, makeBox(0.08, 1.6), { position: { x, y: 1.6 } })
      }
      // Funnel walls.
      staticBody(world, makeBox(6, 0.15), { position: { x: -12.5, y: 19 }, angle: -0.5 })
      staticBody(world, makeBox(6, 0.15), { position: { x: 12.5, y: 19 }, angle: 0.5 })
      const count = 70
      for (let i = 0; i < count; i++) {
        const x = rng.range(-5, 5)
        const y = 18 + rng.range(0, 8)
        const shape = i % 4 === 0 ? makeRegularPolygon(6, 0.34, rng.range(0, Math.PI)) : makeCircle(rng.range(0.22, 0.36))
        dyn(world, shape, { position: { x, y }, friction: 0.2, restitution: 0.35, density: 1 }, rng.int(0, 5))
      }
    },
  },
  {
    id: 'softbody',
    name: 'Jelly & rope',
    blurb: 'Two spring-lattice jellies (soft distance joints) and a 14-link revolute rope swinging a weight into them.',
    build(world) {
      addArena(world)
      buildSoftBody(world, -7, 0.45, { cols: 7, rows: 5, spacing: 0.9, nodeRadius: 0.3, frequencyHz: 4, dampingRatio: 0.35, color: 2, group: 1 })
      buildSoftBody(world, 1.5, 6, { cols: 4, rows: 4, spacing: 0.8, nodeRadius: 0.27, frequencyHz: 6, dampingRatio: 0.3, color: 5, group: 2 })
      const links = buildChain(world, 9, 21, 14, 0.9, 3)
      const last = links[links.length - 1]!
      const ball = dyn(
        world,
        makeCircle(0.75),
        { position: { x: 9, y: last.position.y - 0.45 - 0.75 }, density: 4, friction: 0.5, restitution: 0.1, canSleep: false },
        6,
      )
      world.addJoint(new RevoluteJoint({ bodyA: last, bodyB: ball, anchor: new Vec2(9, last.position.y - 0.45) }))
      ball.setVelocity(-14, 0)
    },
  },
  {
    id: 'stress',
    name: 'Stress test',
    blurb: '260 mixed bodies rain onto the floor. Watch the ms/step readout.',
    build(world, rng) {
      addArena(world)
      for (let i = 0; i < 260; i++) {
        const kind = rng.int(0, 2)
        const shape =
          kind === 0
            ? makeCircle(rng.range(0.25, 0.55))
            : kind === 1
              ? makeBox(rng.range(0.25, 0.6), rng.range(0.25, 0.6))
              : makeRegularPolygon(rng.int(3, 7), rng.range(0.35, 0.65), rng.range(0, Math.PI))
        dyn(
          world,
          shape,
          {
            position: { x: rng.range(-18, 18), y: rng.range(3, 30) },
            angle: rng.range(0, Math.PI * 2),
            friction: 0.5,
            restitution: 0.15,
          },
          rng.int(0, 5),
        )
      }
    },
  },
  {
    id: 'empty',
    name: 'Blank arena',
    blurb: 'Just the floor and walls. Click anywhere to spawn shapes.',
    build(world) {
      addArena(world)
    },
  },
]

export function findScene(id: string): SceneDef | undefined {
  return SCENES.find((s) => s.id === id)
}

/** Builds a scene into a fresh world (helper for tests and benchmarks). */
export function loadScene(world: World, scene: SceneDef, seed = 7): void {
  world.clear()
  scene.build(world, new Rng(seed))
}
