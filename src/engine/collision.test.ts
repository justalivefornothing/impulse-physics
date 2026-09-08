import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { Vec2 } from './vec2.ts'
import { Body } from './body.ts'
import { makeBox, makeCircle, makeRegularPolygon, type Shape } from './shapes.ts'
import { collide, collidePolygons, makeManifold, type Manifold } from './collision.ts'
import type { BodyOptions } from './body.ts'

let nextId = 1
function body(shape: Shape, opts: BodyOptions = {}): Body {
  return new Body(nextId++, shape, opts)
}

function run(a: Body, b: Body): Manifold | null {
  const m = makeManifold()
  return collide(a, b, m) ? m : null
}

describe('SAT: box vs box', () => {
  it('reports no contact for separated boxes', () => {
    const a = body(makeBox(1, 1), { position: { x: 0, y: 0 } })
    const b = body(makeBox(1, 1), { position: { x: 2.5, y: 0 } })
    expect(run(a, b)).toBeNull()
    const c = body(makeBox(1, 1), { position: { x: 0, y: 2.01 } })
    expect(run(a, c)).toBeNull()
  })

  it('finds the axis of least penetration with a normal from A to B', () => {
    const a = body(makeBox(1, 1), { position: { x: 0, y: 0 } })
    // Overlaps 0.3 horizontally, 1.5 vertically: the x axis is the shallow one.
    const b = body(makeBox(1, 1), { position: { x: 1.7, y: 0.5 } })
    const m = run(a, b)!
    expect(m).not.toBeNull()
    expect(m.normalX).toBeCloseTo(1)
    expect(m.normalY).toBeCloseTo(0)
    for (let i = 0; i < m.count; i++) expect(m.points[i]!.penetration).toBeCloseTo(0.3, 6)
    // Contact points sit in the overlap band.
    for (let i = 0; i < m.count; i++) {
      expect(m.points[i]!.x).toBeGreaterThan(0.69)
      expect(m.points[i]!.x).toBeLessThan(1.01)
    }
  })

  it('flips the normal when the arguments are swapped', () => {
    const a = body(makeBox(1, 1), { position: { x: 0, y: 0 } })
    const b = body(makeBox(1, 1), { position: { x: 0, y: 1.8 } })
    const ab = run(a, b)!
    const ba = run(b, a)!
    expect(ab.normalY).toBeCloseTo(1)
    expect(ba.normalY).toBeCloseTo(-1)
    expect(ab.points[0]!.penetration).toBeCloseTo(0.2)
    expect(ba.points[0]!.penetration).toBeCloseTo(0.2)
  })

  it('face-face contact between stacked boxes yields two clipped points', () => {
    const ground = body(makeBox(5, 0.5), { type: 'static', position: { x: 0, y: -0.5 } })
    const box = body(makeBox(0.5, 0.5), { position: { x: 0, y: 0.45 } })
    const m = run(ground, box)!
    expect(m.count).toBe(2)
    expect(m.normalX).toBeCloseTo(0)
    expect(m.normalY).toBeCloseTo(1)
    const xs = m.points.map((p) => p.x).sort((p, q) => p - q)
    expect(xs[0]).toBeCloseTo(-0.5)
    expect(xs[1]).toBeCloseTo(0.5)
    for (const p of m.points) {
      expect(p.penetration).toBeCloseTo(0.05)
      // Midway between the incident vertex (y=-0.05) and the reference face (y=0).
      expect(p.y).toBeCloseTo(-0.025)
    }
    expect(m.points[0]!.id).not.toBe(m.points[1]!.id)
  })

  it('a box resting on its corner gives a single point', () => {
    const ground = body(makeBox(5, 0.5), { type: 'static', position: { x: 0, y: -0.5 } })
    const tilted = body(makeBox(0.5, 0.5), { position: { x: 0, y: Math.SQRT1_2 - 0.02 }, angle: Math.PI / 4 })
    const m = run(ground, tilted)!
    expect(m.count).toBe(1)
    expect(m.normalY).toBeCloseTo(1)
    expect(m.points[0]!.penetration).toBeCloseTo(0.02, 5)
    expect(m.points[0]!.x).toBeCloseTo(0, 5)
  })

  it('rotated polygons: normal and depth match the analytic overlap', () => {
    // A 45-degree box (diamond) sitting 0.1 into the top face of a wide box.
    const base = body(makeBox(4, 1), { position: { x: 0, y: 0 } })
    const diamond = body(makeBox(1, 1), { position: { x: 0.5, y: 1 + Math.SQRT2 - 0.1 }, angle: Math.PI / 4 })
    const m = run(base, diamond)!
    expect(m).not.toBeNull()
    expect(m.normalX).toBeCloseTo(0, 6)
    expect(m.normalY).toBeCloseTo(1, 6)
    expect(m.count).toBe(1)
    expect(m.points[0]!.penetration).toBeCloseTo(0.1, 6)
    expect(m.points[0]!.x).toBeCloseTo(0.5, 6)
  })

  it('separated rotated polygons report nothing (hexagon vs triangle)', () => {
    const hex = body(makeRegularPolygon(6, 1), { angle: 0.3 })
    const tri = body(makeRegularPolygon(3, 1), { position: { x: 2.2, y: 0 }, angle: 1.1 })
    expect(run(hex, tri)).toBeNull()
  })

  it('the manifold normal always points from A towards B for random overlapping polygons', () => {
    const arbAngle = fc.double({ min: -Math.PI, max: Math.PI, noNaN: true })
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 8 }),
        fc.integer({ min: 3, max: 8 }),
        arbAngle,
        arbAngle,
        fc.double({ min: 0.2, max: 1.7, noNaN: true }),
        arbAngle,
        (na, nb, ra, rb, dist, dir) => {
          const a = body(makeRegularPolygon(na, 1), { angle: ra })
          const b = body(makeRegularPolygon(nb, 1), {
            position: { x: Math.cos(dir) * dist, y: Math.sin(dir) * dist },
            angle: rb,
          })
          const m = makeManifold()
          if (!collidePolygons(a, b, m)) return
          const len = Math.hypot(m.normalX, m.normalY)
          expect(len).toBeCloseTo(1, 9)
          // The normal must have a positive component along the A->B centre line.
          const ab = new Vec2(b.position.x - a.position.x, b.position.y - a.position.y)
          expect(m.normalX * ab.x + m.normalY * ab.y).toBeGreaterThan(0)
          for (let i = 0; i < m.count; i++) {
            expect(m.points[i]!.penetration).toBeGreaterThanOrEqual(0)
            expect(m.points[i]!.penetration).toBeLessThan(2.1)
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})

describe('circle contacts', () => {
  it('circle-circle: normal along the centre line, point in the lens', () => {
    const a = body(makeCircle(1), { position: { x: 0, y: 0 } })
    const b = body(makeCircle(0.5), { position: { x: 1.2, y: 0 } })
    const m = run(a, b)!
    expect(m.count).toBe(1)
    expect(m.normalX).toBeCloseTo(1)
    expect(m.points[0]!.penetration).toBeCloseTo(0.3)
    expect(m.points[0]!.x).toBeCloseTo(0.85) // midpoint of the overlap [0.7, 1.0]
    expect(run(a, body(makeCircle(0.5), { position: { x: 1.6, y: 0 } }))).toBeNull()
  })

  it('circle-polygon face region: normal is the face normal, point between the surfaces', () => {
    const box = body(makeBox(2, 0.5), { position: { x: 0, y: 0 } })
    const ball = body(makeCircle(0.5), { position: { x: 0.7, y: 0.9 } }) // bottom at 0.4, box top at 0.5
    const m = run(box, ball)!
    expect(m.count).toBe(1)
    expect(m.normalX).toBeCloseTo(0)
    expect(m.normalY).toBeCloseTo(1)
    expect(m.points[0]!.penetration).toBeCloseTo(0.1)
    expect(m.points[0]!.x).toBeCloseTo(0.7)
    expect(m.points[0]!.y).toBeCloseTo(0.45)
  })

  it('circle-polygon vertex region: normal points from the corner to the centre', () => {
    const box = body(makeBox(1, 1), { position: { x: 0, y: 0 } })
    const d = 0.3
    const ball = body(makeCircle(0.5), { position: { x: 1 + d, y: 1 + d } })
    const m = run(box, ball)!
    expect(m.count).toBe(1)
    expect(m.normalX).toBeCloseTo(Math.SQRT1_2)
    expect(m.normalY).toBeCloseTo(Math.SQRT1_2)
    expect(m.points[0]!.penetration).toBeCloseTo(0.5 - Math.hypot(d, d))
    // Far corner: no contact.
    expect(run(box, body(makeCircle(0.5), { position: { x: 1.4, y: 1.4 } }))).toBeNull()
  })

  it('circle-polygon with the circle as body A flips the normal', () => {
    const box = body(makeBox(2, 0.5), { position: { x: 0, y: 0 } })
    const ball = body(makeCircle(0.5), { position: { x: 0, y: 0.9 } })
    const m = run(ball, box)!
    expect(m.normalY).toBeCloseTo(-1)
    expect(m.points[0]!.penetration).toBeCloseTo(0.1)
  })

  it('circle centre inside a rotated polygon is pushed out through the nearest face', () => {
    const box = body(makeBox(1, 1), { position: { x: 0, y: 0 }, angle: Math.PI / 6 })
    const ball = body(makeCircle(0.3), { position: { x: 0.2, y: 0.1 } })
    const m = run(box, ball)!
    expect(m.count).toBe(1)
    expect(Math.hypot(m.normalX, m.normalY)).toBeCloseTo(1)
    expect(m.points[0]!.penetration).toBeGreaterThan(0.3)
  })
})
