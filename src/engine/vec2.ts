/**
 * Minimal 2D vector type used throughout the engine.
 *
 * Methods return fresh vectors (value semantics) except for the explicitly
 * named in-place mutators (`set`, `copy`, `addInPlace`, ...). Hot solver loops
 * work on unpacked scalars instead, so allocation here is never on the
 * critical path.
 */
/**
 * Fields carry initializers on purpose: with ES2022 class-field semantics an
 * uninitialized declaration is defined as `undefined` first, which makes V8
 * pick a boxed (Tagged) representation for every vector component. Starting
 * from a number keeps x/y as unboxed doubles in optimized code.
 */
export class Vec2 {
  x = 0
  y = 0

  constructor(x = 0, y = 0) {
    this.x = x
    this.y = y
  }

  static zero(): Vec2 {
    return new Vec2(0, 0)
  }

  static fromAngle(angle: number, length = 1): Vec2 {
    return new Vec2(Math.cos(angle) * length, Math.sin(angle) * length)
  }

  /** Cross product of a vector with a scalar (z-axis): v × s = (s·y, −s·x). */
  static crossVS(v: Vec2, s: number): Vec2 {
    return new Vec2(s * v.y, -s * v.x)
  }

  /** Cross product of a scalar (z-axis) with a vector: s × v = (−s·y, s·x). */
  static crossSV(s: number, v: Vec2): Vec2 {
    return new Vec2(-s * v.y, s * v.x)
  }

  static lerp(a: Vec2, b: Vec2, t: number): Vec2 {
    return new Vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
  }

  static distance(a: Vec2, b: Vec2): number {
    const dx = b.x - a.x
    const dy = b.y - a.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  static distanceSq(a: Vec2, b: Vec2): number {
    const dx = b.x - a.x
    const dy = b.y - a.y
    return dx * dx + dy * dy
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y)
  }

  set(x: number, y: number): this {
    this.x = x
    this.y = y
    return this
  }

  copy(v: Vec2): this {
    this.x = v.x
    this.y = v.y
    return this
  }

  addInPlace(v: Vec2): this {
    this.x += v.x
    this.y += v.y
    return this
  }

  addScaledInPlace(v: Vec2, s: number): this {
    this.x += v.x * s
    this.y += v.y * s
    return this
  }

  scaleInPlace(s: number): this {
    this.x *= s
    this.y *= s
    return this
  }

  add(v: Vec2): Vec2 {
    return new Vec2(this.x + v.x, this.y + v.y)
  }

  sub(v: Vec2): Vec2 {
    return new Vec2(this.x - v.x, this.y - v.y)
  }

  scale(s: number): Vec2 {
    return new Vec2(this.x * s, this.y * s)
  }

  addScaled(v: Vec2, s: number): Vec2 {
    return new Vec2(this.x + v.x * s, this.y + v.y * s)
  }

  neg(): Vec2 {
    return new Vec2(-this.x, -this.y)
  }

  dot(v: Vec2): number {
    return this.x * v.x + this.y * v.y
  }

  /** 2D cross product (z component of the 3D cross product). */
  cross(v: Vec2): number {
    return this.x * v.y - this.y * v.x
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y
  }

  /** Unit vector in the same direction, or the zero vector for near-zero input. */
  normalize(): Vec2 {
    const len = this.length()
    if (len < 1e-12) return new Vec2(0, 0)
    const inv = 1 / len
    return new Vec2(this.x * inv, this.y * inv)
  }

  /** Perpendicular rotated 90° counter-clockwise: (−y, x). */
  perpLeft(): Vec2 {
    return new Vec2(-this.y, this.x)
  }

  /** Perpendicular rotated 90° clockwise: (y, −x). */
  perpRight(): Vec2 {
    return new Vec2(this.y, -this.x)
  }

  angle(): number {
    return Math.atan2(this.y, this.x)
  }

  equals(v: Vec2, eps = 1e-9): boolean {
    return Math.abs(this.x - v.x) <= eps && Math.abs(this.y - v.y) <= eps
  }

  isFinite(): boolean {
    return Number.isFinite(this.x) && Number.isFinite(this.y)
  }

  toString(): string {
    return `(${this.x.toFixed(4)}, ${this.y.toFixed(4)})`
  }
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

/** Wraps an angle into (−π, π]. */
export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2
  let r = a % twoPi
  if (r <= -Math.PI) r += twoPi
  else if (r > Math.PI) r -= twoPi
  return r
}
