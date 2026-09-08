import { describe, expect, it } from 'vitest'
import { World } from './world.ts'
import { Vec2 } from './vec2.ts'
import { makeBox, makeCircle } from './shapes.ts'
import { DistanceJoint, MouseJoint, RevoluteJoint } from './joints.ts'
import { FixedStepper, lerpAngle } from './loop.ts'
import { Rng } from './random.ts'
import type { Body } from './body.ts'

const DT = 1 / 60

function addGround(world: World, friction = 0.6, restitution = 0): Body {
  return world.createBody(makeBox(40, 1), { type: 'static', position: { x: 0, y: -1 }, friction, restitution })
}

function pyramid(world: World, rows: number, size = 1): Body[] {
  const half = size / 2
  const bodies: Body[] = []
  for (let row = 0; row < rows; row++) {
    const count = rows - row
    const y = half + row * size
    const startX = -((count - 1) * size) / 2
    for (let i = 0; i < count; i++) {
      bodies.push(world.createBody(makeBox(half, half), { position: { x: startX + i * size, y }, friction: 0.6, restitution: 0 }))
    }
  }
  return bodies
}

describe('stacking stability', () => {
  it('a 10-row pyramid holds for 600 steps with < 0.02 drift and nothing below the ground (sleep disabled)', () => {
    const world = new World({ allowSleep: false })
    addGround(world)
    const boxes = pyramid(world, 10)
    expect(boxes).toHaveLength(55)
    const startX = boxes.map((b) => b.position.x)
    let maxDrift = 0
    let lowest = Infinity
    for (let step = 0; step < 600; step++) {
      world.step(DT)
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i]!
        maxDrift = Math.max(maxDrift, Math.abs(b.position.x - startX[i]!))
        lowest = Math.min(lowest, b.position.y - 0.5)
      }
    }
    expect(maxDrift).toBeLessThan(0.02)
    // Resting contacts settle inside the solver's slop; nothing sinks through.
    expect(lowest).toBeGreaterThan(-world.settings.linearSlop)
    // The pyramid is still a pyramid: every row is roughly where it started.
    for (const b of boxes) expect(Math.abs(b.angle)).toBeLessThan(0.02)
  })

  it('the same pyramid falls asleep when sleeping is enabled and stays put', () => {
    const world = new World()
    addGround(world)
    const boxes = pyramid(world, 10)
    for (let step = 0; step < 240; step++) world.step(DT)
    expect(world.stats.awake).toBe(0)
    expect(world.stats.sleeping).toBe(55)
    const before = boxes.map((b) => b.position.clone())
    for (let step = 0; step < 120; step++) world.step(DT)
    boxes.forEach((b, i) => expect(b.position.equals(before[i]!, 1e-12)).toBe(true))
    // Sleeping steps are cheap: nothing is solved.
    expect(world.stats.solveMs).toBeLessThan(world.stats.stepMs + 1)
  })
})

describe('restitution', () => {
  function dropBall(e: number, h: number): { world: World; ball: Body } {
    const world = new World({ allowSleep: false })
    addGround(world, 0.3, e)
    const r = 0.5
    const ball = world.createBody(makeCircle(r), { position: { x: 0, y: h + r }, restitution: e, friction: 0.3 })
    return { world, ball }
  }

  it('an e = 1 ball rebounds to within 5% of its drop height', () => {
    for (const h of [1, 2.5, 5]) {
      const { world, ball } = dropBall(1, h)
      let bounced = false
      let prevVy = 0
      let apex = NaN
      for (let i = 0; i < 600 && Number.isNaN(apex); i++) {
        world.step(DT)
        if (ball.velocity.y > 0) bounced = true
        if (bounced && prevVy > 0 && ball.velocity.y <= 0) apex = ball.position.y - 0.5
        prevVy = ball.velocity.y
      }
      expect(apex).not.toBeNaN()
      expect(Math.abs(apex - h) / h).toBeLessThan(0.05)
    }
  })

  it('an e = 0 ball comes to rest on the ground', () => {
    const { world, ball } = dropBall(0, 3)
    for (let i = 0; i < 300; i++) world.step(DT)
    expect(Math.abs(ball.velocity.y)).toBeLessThan(1e-3)
    expect(Math.abs(ball.position.y - 0.5)).toBeLessThan(world.settings.linearSlop)
    // It never bounced back up above its resting height after first touching down.
    let maxYAfterLanding = -Infinity
    for (let i = 0; i < 120; i++) {
      world.step(DT)
      maxYAfterLanding = Math.max(maxYAfterLanding, ball.position.y)
    }
    expect(maxYAfterLanding - 0.5).toBeLessThan(0.01)
  })
})

describe('friction', () => {
  function rampBox(mu: number): { world: World; box: Body; start: Vec2 } {
    const world = new World({ allowSleep: false })
    const angle = (20 * Math.PI) / 180
    world.createBody(makeBox(12, 0.5), { type: 'static', position: { x: 0, y: 0 }, angle, friction: mu })
    const normal = new Vec2(-Math.sin(angle), Math.cos(angle))
    const box = world.createBody(makeBox(0.5, 0.5), { position: normal.scale(1.0), angle, friction: mu, restitution: 0 })
    return { world, box, start: box.position.clone() }
  }

  it('a box on a 20 degree ramp with friction 0.8 stays put', () => {
    const { world, box, start } = rampBox(0.8)
    for (let i = 0; i < 300; i++) world.step(DT)
    expect(Vec2.distance(start, box.position)).toBeLessThan(0.01)
    expect(box.velocity.length()).toBeLessThan(1e-3)
  })

  it('the same box with zero friction slides down at roughly g sin(theta)', () => {
    const { world, box, start } = rampBox(0)
    const steps = 120
    for (let i = 0; i < steps; i++) world.step(DT)
    const moved = Vec2.distance(start, box.position)
    expect(moved).toBeGreaterThan(1)
    // s = 0.5 a t^2 with a = g sin(20deg) ~ 3.42 m/s^2 -> ~6.8 m in 2 s.
    const expected = 0.5 * 10 * Math.sin((20 * Math.PI) / 180) * (steps * DT) ** 2
    expect(moved / expected).toBeGreaterThan(0.9)
    expect(moved / expected).toBeLessThan(1.1)
    // The ramp rises to the right, so down-slope is to the left and down; it never sinks through.
    expect(box.position.x).toBeLessThan(start.x)
    expect(box.position.y).toBeLessThan(start.y)
    const normal = new Vec2(-Math.sin((20 * Math.PI) / 180), Math.cos((20 * Math.PI) / 180))
    expect(box.position.dot(normal)).toBeGreaterThan(1.0 - 0.02)
  })
})

describe('joints', () => {
  it('distance joint keeps the bodies within 1% of the target length after 300 steps', () => {
    const world = new World({ allowSleep: false })
    const anchor = world.createBody(makeCircle(0.2), { type: 'static', position: { x: 0, y: 10 } })
    const ball = world.createBody(makeCircle(0.5), { position: { x: 3, y: 10 } })
    const joint = new DistanceJoint({ bodyA: anchor, bodyB: ball, length: 3 })
    world.addJoint(joint)
    for (let i = 0; i < 300; i++) world.step(DT)
    expect(Math.abs(joint.currentLength() - 3) / 3).toBeLessThan(0.01)
    // Still swinging (or hanging) below the anchor.
    expect(ball.position.y).toBeLessThan(10)
  })

  it('distance joint between two dynamic bodies also holds its length', () => {
    const world = new World({ allowSleep: false })
    addGround(world)
    const a = world.createBody(makeBox(0.4, 0.4), { position: { x: 0, y: 6 } })
    const b = world.createBody(makeCircle(0.3), { position: { x: 2, y: 8 }, density: 3 })
    const joint = new DistanceJoint({ bodyA: a, bodyB: b })
    const target = joint.length
    world.addJoint(joint)
    for (let i = 0; i < 300; i++) world.step(DT)
    expect(Math.abs(joint.currentLength() - target) / target).toBeLessThan(0.01)
  })

  it('revolute pendulum conserves energy approximately (no growth over 600 steps)', () => {
    const world = new World({ allowSleep: false })
    const pivot = world.createBody(makeCircle(0.2), { type: 'static', position: { x: 0, y: 10 } })
    const bob = world.createBody(makeBox(0.3, 0.3), { position: { x: 3, y: 10 } })
    const joint = new RevoluteJoint({ bodyA: pivot, bodyB: bob, anchor: new Vec2(0, 10) })
    world.addJoint(joint)
    const e0 = world.totalEnergy()
    let maxEnergy = -Infinity
    let maxSeparation = 0
    let minX = Infinity
    for (let i = 0; i < 600; i++) {
      world.step(DT)
      maxEnergy = Math.max(maxEnergy, world.totalEnergy())
      maxSeparation = Math.max(maxSeparation, joint.separation())
      minX = Math.min(minX, bob.position.x)
    }
    expect(maxEnergy).toBeLessThan(e0 * 1.01)
    expect(world.totalEnergy()).toBeGreaterThan(e0 * 0.9)
    expect(maxSeparation).toBeLessThan(0.05)
    // It actually swung through to the other side.
    expect(minX).toBeLessThan(-2.5)
  })

  it('mouse joint pulls a body to the target and releases it with velocity', () => {
    const world = new World({ allowSleep: false, gravity: new Vec2(0, 0) })
    const box = world.createBody(makeBox(0.5, 0.5), { position: { x: 0, y: 0 } })
    const joint = new MouseJoint({ body: box, anchor: new Vec2(0, 0) })
    world.addJoint(joint)
    joint.setTarget(5, 0)
    for (let i = 0; i < 120; i++) world.step(DT)
    expect(Math.abs(box.position.x - 5)).toBeLessThan(0.1)
    // Drag towards a new target, then release mid-flight: momentum is kept.
    joint.setTarget(5, 8)
    for (let i = 0; i < 6; i++) world.step(DT)
    expect(box.velocity.y).toBeGreaterThan(1)
    world.removeJoint(joint)
    const v = box.velocity.clone()
    world.step(DT)
    expect(box.velocity.equals(v, 1e-9)).toBe(true)
  })

  it('jointed bodies do not collide with each other unless asked to', () => {
    const world = new World({ allowSleep: false, gravity: new Vec2(0, 0) })
    const a = world.createBody(makeBox(1, 1), { position: { x: 0, y: 0 } })
    const b = world.createBody(makeBox(1, 1), { position: { x: 1, y: 0 } })
    world.addJoint(new RevoluteJoint({ bodyA: a, bodyB: b, anchor: new Vec2(0.5, 0) }))
    world.step(DT)
    expect(world.stats.contacts).toBe(0)
    const c = world.createBody(makeBox(1, 1), { position: { x: 6, y: 0 } })
    const d = world.createBody(makeBox(1, 1), { position: { x: 7, y: 0 } })
    world.addJoint(new RevoluteJoint({ bodyA: c, bodyB: d, anchor: new Vec2(6.5, 0), collideConnected: true }))
    world.step(DT)
    expect(world.stats.contacts).toBe(1)
  })
})

describe('sleeping and islands', () => {
  it('a resting body sleeps and is woken by an impact', () => {
    const world = new World()
    addGround(world)
    const box = world.createBody(makeBox(0.5, 0.5), { position: { x: 0, y: 0.5 } })
    for (let i = 0; i < 90; i++) world.step(DT)
    expect(box.awake).toBe(false)
    expect(world.stats.islands).toBe(1)
    const ball = world.createBody(makeCircle(0.3), { position: { x: 0, y: 4 } })
    let woke = false
    for (let i = 0; i < 90; i++) {
      world.step(DT)
      if (box.awake) woke = true
    }
    expect(woke).toBe(true)
    expect(ball.position.y).toBeGreaterThan(1.2)
  })

  it('wakeAll wakes every sleeping body', () => {
    const world = new World()
    addGround(world)
    const boxes = pyramid(world, 3)
    for (let i = 0; i < 120; i++) world.step(DT)
    expect(boxes.every((b) => !b.awake)).toBe(true)
    world.wakeAll()
    expect(boxes.every((b) => b.awake)).toBe(true)
    world.step(DT)
    expect(world.stats.awake).toBe(6)
  })

  it('bodies with canSleep = false keep their island awake', () => {
    const world = new World()
    addGround(world)
    world.createBody(makeBox(0.5, 0.5), { position: { x: 0, y: 0.5 }, canSleep: false })
    world.createBody(makeBox(0.5, 0.5), { position: { x: 0, y: 1.5 } })
    for (let i = 0; i < 120; i++) world.step(DT)
    expect(world.stats.awake).toBe(2)
  })
})

describe('world bookkeeping', () => {
  it('is deterministic: two worlds built from the same seed stay bit-identical', () => {
    const build = (seed: number) => {
      const world = new World()
      addGround(world)
      const rng = new Rng(seed)
      for (let i = 0; i < 60; i++) {
        world.createBody(rng.next() < 0.5 ? makeCircle(rng.range(0.2, 0.6)) : makeBox(rng.range(0.2, 0.6), rng.range(0.2, 0.6)), {
          position: { x: rng.range(-5, 5), y: rng.range(1, 15) },
          angle: rng.range(0, 6),
        })
      }
      return world
    }
    const a = build(3)
    const b = build(3)
    for (let i = 0; i < 240; i++) {
      a.step(DT)
      b.step(DT)
    }
    for (let i = 0; i < a.bodies.length; i++) {
      expect(a.bodies[i]!.position.x).toBe(b.bodies[i]!.position.x)
      expect(a.bodies[i]!.position.y).toBe(b.bodies[i]!.position.y)
      expect(a.bodies[i]!.angle).toBe(b.bodies[i]!.angle)
    }
  })

  it('removes bodies along with their contacts and joints', () => {
    const world = new World()
    addGround(world)
    const a = world.createBody(makeBox(0.5, 0.5), { position: { x: 0, y: 0.5 } })
    const b = world.createBody(makeBox(0.5, 0.5), { position: { x: 0, y: 1.5 } })
    world.addJoint(new DistanceJoint({ bodyA: a, bodyB: b }))
    for (let i = 0; i < 10; i++) world.step(DT)
    expect(world.contacts.size).toBeGreaterThan(0)
    world.removeBody(a)
    expect(world.bodies).not.toContain(a)
    expect(world.joints).toHaveLength(0)
    for (const c of world.contacts.values()) expect(c.a !== a && c.b !== a).toBe(true)
    world.step(DT)
    expect(world.queryPoint(0, 1.5)).toBe(b)
    expect(world.queryPoint(20, 20)).toBeNull()
  })

  it('reports solver stats every step', () => {
    const world = new World({ allowSleep: false })
    addGround(world)
    pyramid(world, 4)
    world.step(DT)
    expect(world.stats.bodies).toBe(11)
    expect(world.stats.pairs).toBeGreaterThanOrEqual(world.stats.contacts)
    expect(world.stats.contacts).toBeGreaterThan(0)
    expect(world.stats.contactPoints).toBeGreaterThanOrEqual(world.stats.contacts)
    expect(world.stats.stepMs).toBeGreaterThanOrEqual(0)
  })
})

describe('FixedStepper', () => {
  it('accumulates frame time into fixed steps and exposes the interpolation alpha', () => {
    const stepper = new FixedStepper(1 / 60)
    let steps = 0
    const step = () => steps++
    // A 24 ms frame -> one 16.67 ms step, ~7.3 ms left over.
    let alpha = stepper.advance(0.024, step)
    expect(steps).toBe(1)
    expect(alpha).toBeCloseTo((0.024 - 1 / 60) * 60, 9)
    // Another 24 ms: 7.3 + 24 = 31.3 ms -> one more step, 14.6 ms left over.
    alpha = stepper.advance(0.024, step)
    expect(steps).toBe(2)
    expect(alpha).toBeCloseTo((0.048 - 2 / 60) * 60, 9)
    // A third 24 ms frame: 14.6 + 24 = 38.6 ms -> two steps.
    alpha = stepper.advance(0.024, step)
    expect(steps).toBe(4)
    expect(alpha).toBeGreaterThanOrEqual(0)
    expect(alpha).toBeLessThan(1)
  })

  it('honours time scale and caps catch-up steps', () => {
    const stepper = new FixedStepper(1 / 60, 4)
    let steps = 0
    stepper.timeScale = 0.5
    stepper.advance(1 / 60, () => steps++)
    expect(steps).toBe(0) // half speed: half a step accumulated
    stepper.advance(1 / 60, () => steps++)
    expect(steps).toBe(1)
    stepper.timeScale = 1
    stepper.advance(1, () => steps++) // a one-second stall
    expect(steps).toBe(5) // capped at 4 more, remainder dropped
    expect(stepper.accumulator).toBe(0)
  })

  it('lerpAngle takes the short way round', () => {
    expect(lerpAngle(0.1, -0.1, 0.5)).toBeCloseTo(0)
    expect(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI)
  })
})
