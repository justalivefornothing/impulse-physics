import { describe, expect, it } from 'vitest'
import { Vec2 } from './vec2.ts'
import {
  makeBox,
  makeCircle,
  makePolygon,
  makeRegularPolygon,
  computeMassData,
  convexHull,
  polygonArea,
  shapeContainsLocalPoint,
} from './shapes.ts'
import { Body } from './body.ts'
import { computeShapeAABB, makeAABB } from './aabb.ts'

describe('shapes', () => {
  it('builds a CCW box centred on its centroid with outward normals', () => {
    const box = makeBox(1, 0.5)
    expect(box.vertices).toHaveLength(4)
    expect(polygonArea(box.vertices)).toBeCloseTo(2)
    for (let i = 0; i < 4; i++) {
      const v = box.vertices[i]!
      const n = box.normals[i]!
      // Outward normal points the same way as the vertex it starts from.
      expect(n.dot(v)).toBeGreaterThan(0)
      expect(n.length()).toBeCloseTo(1)
    }
    expect(box.radius).toBeCloseTo(Math.hypot(1, 0.5))
  })

  it('regular n-gons have n vertices at the requested circumradius', () => {
    const hex = makeRegularPolygon(6, 2)
    expect(hex.vertices).toHaveLength(6)
    for (const v of hex.vertices) expect(v.length()).toBeCloseTo(2)
    expect(() => makeRegularPolygon(2, 1)).toThrow()
  })

  it('makePolygon hulls unordered points and rejects degenerate input', () => {
    const poly = makePolygon([new Vec2(0, 0), new Vec2(2, 0), new Vec2(2, 2), new Vec2(0, 2), new Vec2(1, 1)])
    expect(poly.vertices).toHaveLength(4) // interior point discarded
    expect(polygonArea(poly.vertices)).toBeCloseTo(4)
    expect(() => makePolygon([new Vec2(0, 0), new Vec2(1, 1), new Vec2(2, 2)])).toThrow()
  })

  it('convex hull is CCW and contains every input point', () => {
    const pts = [new Vec2(0, 0), new Vec2(3, 1), new Vec2(1, 3), new Vec2(2, 2), new Vec2(-1, 1), new Vec2(0, 0)]
    const hull = convexHull(pts)
    expect(hull).toHaveLength(4)
    expect(polygonArea(hull)).toBeGreaterThan(0) // positive area <=> CCW
    // Every input point lies on or inside every hull edge's half-plane.
    for (const p of pts) {
      for (let i = 0; i < hull.length; i++) {
        const a = hull[i]!
        const b = hull[(i + 1) % hull.length]!
        const side = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
        expect(side).toBeGreaterThanOrEqual(-1e-12)
      }
    }
  })

  it('computes mass data matching closed-form formulas', () => {
    const circle = computeMassData(makeCircle(2), 3)
    expect(circle.mass).toBeCloseTo(3 * Math.PI * 4)
    expect(circle.inertia).toBeCloseTo(0.5 * circle.mass * 4)

    const box = computeMassData(makeBox(1, 2), 2) // 2 x 4 rectangle
    expect(box.area).toBeCloseTo(8)
    expect(box.mass).toBeCloseTo(16)
    // I = m (w^2 + h^2) / 12
    expect(box.inertia).toBeCloseTo((16 * (4 + 16)) / 12)
  })

  it('point containment works for circles and polygons', () => {
    expect(shapeContainsLocalPoint(makeCircle(1), 0.5, 0.5)).toBe(true)
    expect(shapeContainsLocalPoint(makeCircle(1), 1, 1)).toBe(false)
    const box = makeBox(1, 1)
    expect(shapeContainsLocalPoint(box, 0.99, -0.99)).toBe(true)
    expect(shapeContainsLocalPoint(box, 1.01, 0)).toBe(false)
  })

  it('AABB of a rotated box grows to its diagonal', () => {
    const out = makeAABB()
    const a = Math.PI / 4
    computeShapeAABB(makeBox(1, 1), 5, 5, Math.cos(a), Math.sin(a), 0, out)
    expect(out.minX).toBeCloseTo(5 - Math.SQRT2)
    expect(out.maxX).toBeCloseTo(5 + Math.SQRT2)
    expect(out.minY).toBeCloseTo(5 - Math.SQRT2)
    expect(out.maxY).toBeCloseTo(5 + Math.SQRT2)
  })

  it('body mass properties follow type, density and explicit mass', () => {
    const s = new Body(1, makeBox(1, 1), { type: 'static' })
    expect(s.invMass).toBe(0)
    expect(s.invInertia).toBe(0)
    const d = new Body(2, makeBox(1, 1), { density: 2 })
    expect(d.mass).toBeCloseTo(8)
    expect(d.invMass).toBeCloseTo(1 / 8)
    const m = new Body(3, makeCircle(1), { mass: 10 })
    expect(m.mass).toBeCloseTo(10)
    expect(m.inertia).toBeCloseTo(5)
    const f = new Body(4, makeCircle(1), { fixedRotation: true })
    expect(f.invInertia).toBe(0)
  })

  it('body transforms round-trip between local and world space', () => {
    const b = new Body(1, makeBox(1, 1), { position: { x: 3, y: -2 }, angle: 0.7 })
    const p = new Vec2(0.4, -0.9)
    const w = b.localToWorld(p)
    expect(b.worldToLocal(w).equals(p, 1e-12)).toBe(true)
    expect(b.containsPoint(3, -2)).toBe(true)
    expect(b.containsPoint(3 + 3, -2)).toBe(false)
  })
})
