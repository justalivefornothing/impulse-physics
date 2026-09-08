import type { Shape } from './shapes.ts'

export interface AABB {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function makeAABB(): AABB {
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

export function aabbContainsPoint(a: AABB, x: number, y: number): boolean {
  return x >= a.minX && x <= a.maxX && y >= a.minY && y <= a.maxY
}

/**
 * Writes the world-space bounding box of `shape` placed at (px, py) with
 * rotation (cos, sin) into `out`, inflated by `margin` on every side.
 */
export function computeShapeAABB(
  shape: Shape,
  px: number,
  py: number,
  cos: number,
  sin: number,
  margin: number,
  out: AABB,
): void {
  if (shape.kind === 'circle') {
    const r = shape.radius + margin
    out.minX = px - r
    out.minY = py - r
    out.maxX = px + r
    out.maxY = py + r
    return
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const v of shape.vertices) {
    const x = px + cos * v.x - sin * v.y
    const y = py + sin * v.x + cos * v.y
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  out.minX = minX - margin
  out.minY = minY - margin
  out.maxX = maxX + margin
  out.maxY = maxY + margin
}
