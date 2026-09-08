import type { Body } from './body.ts'
import { MAX_POLYGON_VERTICES, type PolygonShape } from './shapes.ts'

/** One point of a contact manifold, in world space. */
export interface ManifoldPoint {
  x: number
  y: number
  /** How far the shapes overlap along the normal (>= 0). */
  penetration: number
  /** Feature id used to match points across frames for warm starting. */
  id: number
}

/** Up to two contact points sharing one normal that points from body A to body B. */
export interface Manifold {
  normalX: number
  normalY: number
  count: number
  points: [ManifoldPoint, ManifoldPoint]
}

export function makeManifold(): Manifold {
  return {
    normalX: 0,
    normalY: 0,
    count: 0,
    points: [
      { x: 0, y: 0, penetration: 0, id: 0 },
      { x: 0, y: 0, penetration: 0, id: 0 },
    ],
  }
}

/** Tolerance used when picking the reference face so it does not flip-flop. */
const FACE_FLIP_TOLERANCE = 0.0005

// ---------------------------------------------------------------------------
// Scratch buffers: world-space vertices/normals for the two polygons of the
// current query. The engine is single threaded so module-level reuse is safe.
// ---------------------------------------------------------------------------
const vA = new Float64Array(MAX_POLYGON_VERTICES * 2)
const nA = new Float64Array(MAX_POLYGON_VERTICES * 2)
const vB = new Float64Array(MAX_POLYGON_VERTICES * 2)
const nB = new Float64Array(MAX_POLYGON_VERTICES * 2)

function toWorld(body: Body, poly: PolygonShape, verts: Float64Array, norms: Float64Array): number {
  const { cos, sin } = body
  const px = body.position.x
  const py = body.position.y
  const n = poly.vertices.length
  for (let i = 0; i < n; i++) {
    const v = poly.vertices[i]!
    const m = poly.normals[i]!
    verts[i * 2] = px + cos * v.x - sin * v.y
    verts[i * 2 + 1] = py + sin * v.x + cos * v.y
    norms[i * 2] = cos * m.x - sin * m.y
    norms[i * 2 + 1] = sin * m.x + cos * m.y
  }
  return n
}

let bestEdge = 0
let bestSeparation = 0

/**
 * SAT half: for each face of polygon 1, the separation is the smallest
 * projection of polygon 2's vertices onto that face normal. The face with the
 * largest such separation is the best separating (or least penetrating) axis.
 */
function findMaxSeparation(
  v1: Float64Array,
  n1: Float64Array,
  count1: number,
  v2: Float64Array,
  count2: number,
): void {
  let maxSep = -Infinity
  let edge = 0
  for (let i = 0; i < count1; i++) {
    const nx = n1[i * 2]!
    const ny = n1[i * 2 + 1]!
    const vx = v1[i * 2]!
    const vy = v1[i * 2 + 1]!
    let si = Infinity
    for (let j = 0; j < count2; j++) {
      const s = nx * (v2[j * 2]! - vx) + ny * (v2[j * 2 + 1]! - vy)
      if (s < si) si = s
    }
    if (si > maxSep) {
      maxSep = si
      edge = i
    }
  }
  bestEdge = edge
  bestSeparation = maxSep
}

/** Packs the features that produced a clip point into a stable integer id. */
export function featureId(refEdge: number, incVertex: number, clipPlane: number, flipped: boolean): number {
  return (flipped ? 1 : 0) | (clipPlane << 1) | (refEdge << 3) | (incVertex << 9)
}

// Clip scratch: two input points, up to two output points (x, y, id).
const clipIn = new Float64Array(6)
const clipOut = new Float64Array(6)

/**
 * Sutherland–Hodgman clip of a segment against the half-plane
 * dot(n, p) - offset <= 0. Returns how many points survive.
 */
function clipSegment(
  input: Float64Array,
  output: Float64Array,
  nx: number,
  ny: number,
  offset: number,
  planeIndex: number,
  refEdge: number,
  flipped: boolean,
): number {
  let out = 0
  const d0 = nx * input[0]! + ny * input[1]! - offset
  const d1 = nx * input[3]! + ny * input[4]! - offset
  if (d0 <= 0) {
    output[out * 3] = input[0]!
    output[out * 3 + 1] = input[1]!
    output[out * 3 + 2] = input[2]!
    out++
  }
  if (d1 <= 0) {
    output[out * 3] = input[3]!
    output[out * 3 + 1] = input[4]!
    output[out * 3 + 2] = input[5]!
    out++
  }
  if (d0 * d1 < 0) {
    // The segment crosses the plane: keep the intersection, tagged with the
    // vertex that was clipped away so the id stays stable frame to frame.
    const t = d0 / (d0 - d1)
    output[out * 3] = input[0]! + t * (input[3]! - input[0]!)
    output[out * 3 + 1] = input[1]! + t * (input[4]! - input[1]!)
    const clippedVertex = d0 > 0 ? input[2]! >> 9 : input[5]! >> 9
    output[out * 3 + 2] = featureId(refEdge, clippedVertex, planeIndex, flipped)
    out++
  }
  return out
}

/**
 * Polygon vs polygon. Finds the axis of least penetration with SAT, picks the
 * reference face on that polygon and the most anti-parallel (incident) face
 * on the other, clips the incident face to the reference face's side planes
 * and keeps the clipped points that lie behind the reference face.
 */
export function collidePolygons(a: Body, b: Body, out: Manifold): boolean {
  const pa = a.shape as PolygonShape
  const pb = b.shape as PolygonShape
  const countA = toWorld(a, pa, vA, nA)
  const countB = toWorld(b, pb, vB, nB)

  findMaxSeparation(vA, nA, countA, vB, countB)
  const edgeA = bestEdge
  const sepA = bestSeparation
  if (sepA > 0) return false

  findMaxSeparation(vB, nB, countB, vA, countA)
  const edgeB = bestEdge
  const sepB = bestSeparation
  if (sepB > 0) return false

  let refV: Float64Array
  let refN: Float64Array
  let refCount: number
  let incV: Float64Array
  let incN: Float64Array
  let incCount: number
  let refEdge: number
  let flipped: boolean
  if (sepB > sepA + FACE_FLIP_TOLERANCE) {
    refV = vB
    refN = nB
    refCount = countB
    incV = vA
    incN = nA
    incCount = countA
    refEdge = edgeB
    flipped = true
  } else {
    refV = vA
    refN = nA
    refCount = countA
    incV = vB
    incN = nB
    incCount = countB
    refEdge = edgeA
    flipped = false
  }

  // Reference face.
  const r1 = refEdge
  const r2 = (refEdge + 1) % refCount
  const v11x = refV[r1 * 2]!
  const v11y = refV[r1 * 2 + 1]!
  const v12x = refV[r2 * 2]!
  const v12y = refV[r2 * 2 + 1]!
  const refNx = refN[r1 * 2]!
  const refNy = refN[r1 * 2 + 1]!
  let tx = v12x - v11x
  let ty = v12y - v11y
  const tl = Math.hypot(tx, ty)
  if (tl < 1e-12) return false
  tx /= tl
  ty /= tl

  // Incident face: the one whose normal is most opposed to the reference normal.
  let incEdge = 0
  let minDot = Infinity
  for (let i = 0; i < incCount; i++) {
    const d = refNx * incN[i * 2]! + refNy * incN[i * 2 + 1]!
    if (d < minDot) {
      minDot = d
      incEdge = i
    }
  }
  const i1 = incEdge
  const i2 = (incEdge + 1) % incCount
  clipIn[0] = incV[i1 * 2]!
  clipIn[1] = incV[i1 * 2 + 1]!
  clipIn[2] = featureId(refEdge, i1, 0, flipped)
  clipIn[3] = incV[i2 * 2]!
  clipIn[4] = incV[i2 * 2 + 1]!
  clipIn[5] = featureId(refEdge, i2, 0, flipped)

  // Side plane 1: keep points with dot(-t, p) <= dot(-t, v11)  (i.e. beyond v11 along t).
  const off1 = -(tx * v11x + ty * v11y)
  if (clipSegment(clipIn, clipOut, -tx, -ty, off1, 1, refEdge, flipped) < 2) return false
  // Side plane 2: keep points with dot(t, p) <= dot(t, v12).
  const off2 = tx * v12x + ty * v12y
  if (clipSegment(clipOut, clipIn, tx, ty, off2, 2, refEdge, flipped) < 2) return false

  // Manifold normal always points from A to B.
  const sign = flipped ? -1 : 1
  out.normalX = refNx * sign
  out.normalY = refNy * sign
  const frontOffset = refNx * v11x + refNy * v11y

  let count = 0
  for (let i = 0; i < 2; i++) {
    const px = clipIn[i * 3]!
    const py = clipIn[i * 3 + 1]!
    const separation = refNx * px + refNy * py - frontOffset
    if (separation <= 0) {
      const mp = out.points[count]!
      // Place the point halfway between the incident vertex and the reference face.
      const half = -separation * 0.5
      mp.x = px + refNx * half
      mp.y = py + refNy * half
      mp.penetration = -separation
      mp.id = clipIn[i * 3 + 2]!
      count++
    }
  }
  out.count = count
  return count > 0
}

/**
 * Polygon (body A) vs circle (body B). Works in the polygon's local frame:
 * finds the face the circle centre is most in front of, then handles the
 * face region and the two vertex regions separately.
 */
export function collidePolygonCircle(poly: Body, circle: Body, out: Manifold): boolean {
  const shape = poly.shape as PolygonShape
  const radius = circle.shape.kind === 'circle' ? circle.shape.radius : 0
  const cx = circle.position.x
  const cy = circle.position.y

  // Circle centre in polygon-local coordinates.
  const dx = cx - poly.position.x
  const dy = cy - poly.position.y
  const lx = poly.cos * dx + poly.sin * dy
  const ly = -poly.sin * dx + poly.cos * dy

  const verts = shape.vertices
  const norms = shape.normals
  const n = verts.length
  let best = 0
  let maxSep = -Infinity
  for (let i = 0; i < n; i++) {
    const v = verts[i]!
    const m = norms[i]!
    const s = m.x * (lx - v.x) + m.y * (ly - v.y)
    if (s > radius) return false
    if (s > maxSep) {
      maxSep = s
      best = i
    }
  }

  const v1 = verts[best]!
  const v2 = verts[(best + 1) % n]!
  let nlx: number
  let nly: number
  let penetration: number
  let id: number

  if (maxSep < 1e-9) {
    // Centre inside the polygon: push out through the closest face.
    nlx = norms[best]!.x
    nly = norms[best]!.y
    penetration = radius - maxSep
    id = best << 1
  } else {
    const u1 = (lx - v1.x) * (v2.x - v1.x) + (ly - v1.y) * (v2.y - v1.y)
    const u2 = (lx - v2.x) * (v1.x - v2.x) + (ly - v2.y) * (v1.y - v2.y)
    if (u1 <= 0 || u2 <= 0) {
      // Vertex region.
      const vx = u1 <= 0 ? v1.x : v2.x
      const vy = u1 <= 0 ? v1.y : v2.y
      const ddx = lx - vx
      const ddy = ly - vy
      const dist = Math.hypot(ddx, ddy)
      if (dist > radius) return false
      if (dist < 1e-9) {
        nlx = norms[best]!.x
        nly = norms[best]!.y
      } else {
        nlx = ddx / dist
        nly = ddy / dist
      }
      penetration = radius - dist
      maxSep = dist
      id = ((u1 <= 0 ? best : (best + 1) % n) << 1) | 1
    } else {
      // Face region.
      nlx = norms[best]!.x
      nly = norms[best]!.y
      penetration = radius - maxSep
      id = best << 1
    }
  }

  // Rotate the local normal back to world space.
  const nx = poly.cos * nlx - poly.sin * nly
  const ny = poly.sin * nlx + poly.cos * nly
  out.normalX = nx
  out.normalY = ny
  out.count = 1
  const mp = out.points[0]!
  // Midway between the polygon surface (centre - n*maxSep) and the circle's deepest point (centre - n*radius).
  const mid = (maxSep + radius) * 0.5
  mp.x = cx - nx * mid
  mp.y = cy - ny * mid
  mp.penetration = penetration
  mp.id = id
  return true
}

export function collideCircles(a: Body, b: Body, out: Manifold): boolean {
  const ra = a.shape.kind === 'circle' ? a.shape.radius : 0
  const rb = b.shape.kind === 'circle' ? b.shape.radius : 0
  const dx = b.position.x - a.position.x
  const dy = b.position.y - a.position.y
  const distSq = dx * dx + dy * dy
  const r = ra + rb
  if (distSq > r * r) return false
  const dist = Math.sqrt(distSq)
  let nx = 1
  let ny = 0
  if (dist > 1e-9) {
    nx = dx / dist
    ny = dy / dist
  }
  out.normalX = nx
  out.normalY = ny
  out.count = 1
  const mp = out.points[0]!
  const penetration = r - dist
  // Midpoint of the overlapping lens.
  const along = ra - penetration * 0.5
  mp.x = a.position.x + nx * along
  mp.y = a.position.y + ny * along
  mp.penetration = penetration
  mp.id = 0
  return true
}

/**
 * Dispatches on shape kinds. The resulting normal always points from `a`
 * towards `b`, regardless of which shape pair handled the query.
 */
export function collide(a: Body, b: Body, out: Manifold): boolean {
  const ka = a.shape.kind
  const kb = b.shape.kind
  if (ka === 'circle' && kb === 'circle') return collideCircles(a, b, out)
  if (ka === 'polygon' && kb === 'polygon') return collidePolygons(a, b, out)
  if (ka === 'polygon') return collidePolygonCircle(a, b, out)
  // a is the circle: run the query the other way round and flip the normal.
  if (!collidePolygonCircle(b, a, out)) return false
  out.normalX = -out.normalX
  out.normalY = -out.normalY
  return true
}
