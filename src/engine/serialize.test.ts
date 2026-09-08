import { describe, expect, it } from 'vitest'
import { World } from './world.ts'
import { Vec2 } from './vec2.ts'
import { makeBox, makeCircle, makeRegularPolygon } from './shapes.ts'
import { DistanceJoint, RevoluteJoint } from './joints.ts'
import { Rng } from './random.ts'
import { parseSnapshot, restoreWorld, serializeWorld, snapshotWorld } from './serialize.ts'

const DT = 1 / 60

/** A busy little world: stack, loose bodies, both joint kinds, a sleeping island. */
function buildScene(): World {
  const world = new World()
  world.createBody(makeBox(30, 1), { type: 'static', position: { x: 0, y: -1 }, friction: 0.6, userData: { color: -1 } })
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i < 5 - row; i++) {
      world.createBody(makeBox(0.5, 0.5), {
        position: { x: -8 + i - row * 0.5 + row * 0.5, y: 0.5 + row },
        friction: 0.6,
        restitution: 0,
        userData: { color: row },
      })
    }
  }
  const rng = new Rng(11)
  for (let i = 0; i < 25; i++) {
    const shape =
      i % 3 === 0
        ? makeCircle(rng.range(0.2, 0.5))
        : i % 3 === 1
          ? makeBox(rng.range(0.2, 0.5), rng.range(0.2, 0.5))
          : makeRegularPolygon(rng.int(3, 7), rng.range(0.3, 0.6), rng.range(0, 3))
    world.createBody(shape, { position: { x: rng.range(-2, 10), y: rng.range(2, 12) }, angle: rng.range(0, 6) })
  }
  const pivot = world.createBody(makeCircle(0.2), { type: 'static', position: { x: 14, y: 10 } })
  const bob = world.createBody(makeBox(0.3, 0.3), { position: { x: 17, y: 10 } })
  world.addJoint(new RevoluteJoint({ bodyA: pivot, bodyB: bob, anchor: new Vec2(14, 10) }))
  const ball = world.createBody(makeCircle(0.4), { position: { x: 17, y: 7 }, density: 2 })
  world.addJoint(new DistanceJoint({ bodyA: bob, bodyB: ball, frequencyHz: 2, dampingRatio: 0.3 }))
  // A lone box far away that will fall asleep early.
  world.createBody(makeBox(0.5, 0.5), { position: { x: -20, y: 0.5 } })
  return world
}

function stateOf(world: World): number[] {
  const out: number[] = []
  for (const b of world.bodies) {
    out.push(b.position.x, b.position.y, b.angle, b.velocity.x, b.velocity.y, b.angularVelocity, b.awake ? 1 : 0)
  }
  return out
}

describe('world snapshots', () => {
  it('restoring a snapshot and stepping is bit-identical to never having stopped', () => {
    const live = buildScene()
    for (let i = 0; i < 90; i++) live.step(DT)
    // Take the snapshot through JSON so we also prove the text round trip is exact.
    const json = serializeWorld(live)
    const restored = new World({ allowSleep: false, gravity: new Vec2(3, 3) }) // deliberately wrong settings
    restoreWorld(restored, parseSnapshot(json))

    expect(restored.bodies.length).toBe(live.bodies.length)
    expect(restored.joints.length).toBe(live.joints.length)
    expect(restored.contacts.size).toBe(live.contacts.size)
    expect(restored.settings.allowSleep).toBe(live.settings.allowSleep)
    expect(restored.settings.gravity.y).toBe(live.settings.gravity.y)
    expect(stateOf(restored)).toEqual(stateOf(live))

    for (let i = 0; i < 240; i++) {
      live.step(DT)
      restored.step(DT)
      // toBe on every scalar: no tolerance, this must be exact.
      const a = stateOf(live)
      const b = stateOf(restored)
      for (let k = 0; k < a.length; k++) expect(b[k]).toBe(a[k])
    }
    expect(restored.stepIndex).toBe(live.stepIndex)
    expect(restored.time).toBe(live.time)
    // Something actually happened during those 330 steps.
    expect(live.stats.contacts).toBeGreaterThan(5)
  })

  it('keeps ids, shapes, mass properties, joints and user data', () => {
    const world = buildScene()
    for (let i = 0; i < 10; i++) world.step(DT)
    const snap = snapshotWorld(world)
    const copy = new World()
    restoreWorld(copy, snap)
    for (let i = 0; i < world.bodies.length; i++) {
      const a = world.bodies[i]!
      const b = copy.bodies[i]!
      expect(b.id).toBe(a.id)
      expect(b.type).toBe(a.type)
      expect(b.shape.kind).toBe(a.shape.kind)
      if (a.shape.kind === 'polygon' && b.shape.kind === 'polygon') {
        expect(b.shape.vertices.map((v) => [v.x, v.y])).toEqual(a.shape.vertices.map((v) => [v.x, v.y]))
        expect(b.shape.normals.map((v) => [v.x, v.y])).toEqual(a.shape.normals.map((v) => [v.x, v.y]))
      }
      expect(b.mass).toBe(a.mass)
      expect(b.inertia).toBe(a.inertia)
      expect(b.invInertia).toBe(a.invInertia)
      expect(b.userData).toEqual(a.userData)
    }
    const j0 = copy.joints[0] as RevoluteJoint
    const j1 = copy.joints[1] as DistanceJoint
    expect(j0.kind).toBe('revolute')
    expect(j1.kind).toBe('distance')
    expect(j1.frequencyHz).toBe(2)
    expect(j1.length).toBe((world.joints[1] as DistanceJoint).length)
    // New bodies created after a restore never reuse an id.
    const fresh = copy.createBody(makeCircle(0.1))
    expect(copy.bodies.filter((b) => b.id === fresh.id)).toHaveLength(1)
    expect(fresh.id).toBeGreaterThan(Math.max(...snap.bodies.map((b) => b.id)))
  })

  it('rejects malformed input', () => {
    expect(() => parseSnapshot('42')).toThrow()
    expect(() => parseSnapshot('{"version":99}')).toThrow(/version/)
    expect(() => parseSnapshot('{"version":1}')).toThrow(/missing/)
  })
})
