import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { Vec2, clamp, wrapAngle } from './vec2.ts'

const finite = fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true })
const arbVec = fc.tuple(finite, finite).map(([x, y]) => new Vec2(x, y))

describe('Vec2', () => {
  it('adds, subtracts and scales component-wise', () => {
    const a = new Vec2(1, 2)
    const b = new Vec2(3, -5)
    expect(a.add(b)).toEqual(new Vec2(4, -3))
    expect(a.sub(b)).toEqual(new Vec2(-2, 7))
    expect(a.scale(3)).toEqual(new Vec2(3, 6))
    expect(a.addScaled(b, 2)).toEqual(new Vec2(7, -8))
    expect(a.neg()).toEqual(new Vec2(-1, -2))
  })

  it('computes dot and cross products with the right sign conventions', () => {
    const x = new Vec2(1, 0)
    const y = new Vec2(0, 1)
    expect(x.dot(y)).toBe(0)
    expect(x.cross(y)).toBe(1)
    expect(y.cross(x)).toBe(-1)
    // s x v rotates v 90 degrees counter-clockwise when s > 0.
    const ccw = Vec2.crossSV(1, x)
    expect(ccw.x).toBeCloseTo(0)
    expect(ccw.y).toBeCloseTo(1)
    const cw = Vec2.crossVS(x, 1)
    expect(cw.x).toBeCloseTo(0)
    expect(cw.y).toBeCloseTo(-1)
  })

  it('normalizes to unit length and handles the zero vector', () => {
    const v = new Vec2(3, 4)
    expect(v.length()).toBe(5)
    expect(v.lengthSq()).toBe(25)
    const n = v.normalize()
    expect(n.length()).toBeCloseTo(1, 12)
    expect(n.x).toBeCloseTo(0.6)
    expect(n.y).toBeCloseTo(0.8)
    expect(new Vec2(0, 0).normalize()).toEqual(new Vec2(0, 0))
  })

  it('produces perpendiculars and angles', () => {
    const v = new Vec2(2, 0)
    expect(v.perpLeft().y).toBe(2)
    expect(v.perpRight().y).toBe(-2)
    expect(v.perpLeft().dot(v)).toBe(0)
    expect(Vec2.fromAngle(Math.PI / 2).y).toBeCloseTo(1)
    expect(new Vec2(0, -1).angle()).toBeCloseTo(-Math.PI / 2)
  })

  it('interpolates and measures distances', () => {
    const a = new Vec2(0, 0)
    const b = new Vec2(10, -10)
    expect(Vec2.lerp(a, b, 0.25)).toEqual(new Vec2(2.5, -2.5))
    expect(Vec2.distance(a, b)).toBeCloseTo(Math.sqrt(200))
    expect(Vec2.distanceSq(a, b)).toBe(200)
  })

  it('mutators change the receiver and return it for chaining', () => {
    const v = new Vec2(1, 1)
    const r = v.addInPlace(new Vec2(1, 2)).scaleInPlace(2).addScaledInPlace(new Vec2(1, 0), -1)
    expect(r).toBe(v)
    expect(v).toEqual(new Vec2(3, 6))
    v.copy(new Vec2(9, 9))
    expect(v.equals(new Vec2(9, 9))).toBe(true)
    expect(v.clone()).not.toBe(v)
  })

  it('clamps and wraps scalars', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapAngle(0.5)).toBeCloseTo(0.5)
  })

  it('satisfies vector algebra laws for arbitrary inputs', () => {
    fc.assert(
      fc.property(arbVec, arbVec, (a, b) => {
        // dot is commutative, cross anti-commutative
        expect(a.dot(b)).toBeCloseTo(b.dot(a), 6)
        expect(a.cross(b)).toBeCloseTo(-b.cross(a), 6)
        // |a x b|^2 + (a.b)^2 = |a|^2 |b|^2 (Lagrange identity)
        const lhs = a.cross(b) ** 2 + a.dot(b) ** 2
        const rhs = a.lengthSq() * b.lengthSq()
        expect(Math.abs(lhs - rhs) <= 1e-9 * Math.max(1, rhs)).toBe(true)
        // perpendiculars are orthogonal
        expect(a.perpLeft().dot(a)).toBe(0)
      }),
    )
  })
})
