import { Vec2 } from './vec2.ts'

/** Hard cap so the narrow phase can use fixed-size scratch buffers. */
export const MAX_POLYGON_VERTICES = 16

export interface CircleShape {
  readonly kind: 'circle'
  readonly radius: number
}

/**
 * Convex polygon in body-local space. Vertices are counter-clockwise and
 * centred on the centroid, so a body's origin is always its centre of mass.
 * `normals[i]` is the outward unit normal of edge `vertices[i] -> vertices[i+1]`.
 */
export interface PolygonShape {
  readonly kind: 'polygon'
  readonly vertices: readonly Vec2[]
  readonly normals: readonly Vec2[]
  /** Distance from the centroid to the farthest vertex. */
  readonly radius: number
}

export type Shape = CircleShape | PolygonShape

export interface MassData {
  mass: number
  /** Rotational inertia about the shape's centroid. */
  inertia: number
  area: number
}

export function makeCircle(radius: number): CircleShape {
  if (!(radius > 0)) throw new Error('circle radius must be positive')
  return { kind: 'circle', radius }
}

/** Axis-aligned box from half extents. */
export function makeBox(halfWidth: number, halfHeight: number): PolygonShape {
  return makePolygon([
    new Vec2(-halfWidth, -halfHeight),
    new Vec2(halfWidth, -halfHeight),
    new Vec2(halfWidth, halfHeight),
    new Vec2(-halfWidth, halfHeight),
  ])
}

/** Regular n-gon with the given circumradius; the first vertex sits at `startAngle`. */
export function makeRegularPolygon(sides: number, radius: number, startAngle = 0): PolygonShape {
  if (sides < 3) throw new Error('a polygon needs at least 3 sides')
  const pts: Vec2[] = []
  for (let i = 0; i < sides; i++) {
    const a = startAngle + (i / sides) * Math.PI * 2
    pts.push(new Vec2(Math.cos(a) * radius, Math.sin(a) * radius))
  }
  return makePolygon(pts)
}

/**
 * Builds a convex polygon from an arbitrary point cloud: computes the convex
 * hull (monotone chain), orders it counter-clockwise, re-centres it on its
 * centroid and precomputes edge normals.
 */
export function makePolygon(points: readonly Vec2[]): PolygonShape {
  const hull = convexHull(points)
  if (hull.length < 3) throw new Error('polygon points are degenerate (collinear)')
  if (hull.length > MAX_POLYGON_VERTICES) throw new Error(`polygon has more than ${MAX_POLYGON_VERTICES} vertices`)

  const c = polygonCentroid(hull)
  const vertices = hull.map((p) => new Vec2(p.x - c.x, p.y - c.y))
  const normals: Vec2[] = []
  let radius = 0
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!
    const b = vertices[(i + 1) % vertices.length]!
    // Edge direction rotated clockwise gives the outward normal of a CCW polygon.
    normals.push(new Vec2(b.y - a.y, -(b.x - a.x)).normalize())
    radius = Math.max(radius, a.length())
  }
  return { kind: 'polygon', vertices, normals, radius }
}

/**
 * Builds a polygon from vertices that are already convex, counter-clockwise
 * and centred on their centroid (e.g. ones produced by `makePolygon`). No
 * hull or re-centring pass runs, so the values round-trip bit-for-bit through
 * a snapshot.
 */
export function polygonFromVertices(verts: readonly Vec2[]): PolygonShape {
  if (verts.length < 3) throw new Error('polygon needs at least 3 vertices')
  if (verts.length > MAX_POLYGON_VERTICES) throw new Error(`polygon has more than ${MAX_POLYGON_VERTICES} vertices`)
  const vertices = verts.map((p) => new Vec2(p.x, p.y))
  const normals: Vec2[] = []
  let radius = 0
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!
    const b = vertices[(i + 1) % vertices.length]!
    normals.push(new Vec2(b.y - a.y, -(b.x - a.x)).normalize())
    radius = Math.max(radius, a.length())
  }
  return { kind: 'polygon', vertices, normals, radius }
}

/** Andrew's monotone chain. Returns CCW hull without duplicate/collinear points. */
export function convexHull(input: readonly Vec2[]): Vec2[] {
  const pts = input
    .map((p) => new Vec2(p.x, p.y))
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  // remove exact duplicates
  const unique: Vec2[] = []
  for (const p of pts) {
    const last = unique[unique.length - 1]
    if (!last || last.x !== p.x || last.y !== p.y) unique.push(p)
  }
  if (unique.length < 3) return unique

  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Vec2[] = []
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 1e-12) lower.pop()
    lower.push(p)
  }
  const upper: Vec2[] = []
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 1e-12) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

export function polygonArea(verts: readonly Vec2[]): number {
  let twice = 0
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]!
    const b = verts[(i + 1) % verts.length]!
    twice += a.x * b.y - a.y * b.x
  }
  return twice * 0.5
}

export function polygonCentroid(verts: readonly Vec2[]): Vec2 {
  let cx = 0
  let cy = 0
  let area = 0
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]!
    const b = verts[(i + 1) % verts.length]!
    const w = a.x * b.y - a.y * b.x
    area += w
    cx += (a.x + b.x) * w
    cy += (a.y + b.y) * w
  }
  area *= 0.5
  const inv = 1 / (6 * area)
  return new Vec2(cx * inv, cy * inv)
}

/** Mass, area and centroidal inertia for a shape of uniform density. */
export function computeMassData(shape: Shape, density: number): MassData {
  if (shape.kind === 'circle') {
    const area = Math.PI * shape.radius * shape.radius
    const mass = density * area
    return { mass, inertia: 0.5 * mass * shape.radius * shape.radius, area }
  }
  // Polygon is centred on its centroid, so sum triangle (origin, v_i, v_i+1) contributions.
  let area = 0
  let inertia = 0
  const v = shape.vertices
  for (let i = 0; i < v.length; i++) {
    const a = v[i]!
    const b = v[(i + 1) % v.length]!
    const cross = a.x * b.y - a.y * b.x
    const triArea = 0.5 * cross
    area += triArea
    // Second moment of a triangle with one vertex at the origin.
    inertia += (cross / 12) * (a.x * a.x + a.x * b.x + b.x * b.x + a.y * a.y + a.y * b.y + b.y * b.y)
  }
  return { mass: density * area, inertia: density * inertia, area }
}

/** Point-in-shape test in shape-local coordinates. */
export function shapeContainsLocalPoint(shape: Shape, x: number, y: number): boolean {
  if (shape.kind === 'circle') return x * x + y * y <= shape.radius * shape.radius
  const v = shape.vertices
  const n = shape.normals
  for (let i = 0; i < v.length; i++) {
    const vi = v[i]!
    const ni = n[i]!
    if (ni.x * (x - vi.x) + ni.y * (y - vi.y) > 0) return false
  }
  return true
}
