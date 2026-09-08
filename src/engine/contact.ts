import type { Body } from './body.ts'
import { type Manifold, collide, makeManifold } from './collision.ts'

export interface SolverSettings {
  /** Fraction of the penetration error corrected per step (Baumgarte factor). */
  baumgarte: number
  /** Penetration allowed before positional correction kicks in. */
  linearSlop: number
  /** Relative normal speed below which restitution is ignored (prevents jitter). */
  restitutionThreshold: number
}

/** Solver state for one manifold point. Scalars only, so the hot loop never allocates. */
export class ContactPoint {
  x = 0
  y = 0
  penetration = 0
  id = 0
  // Lever arms from each centre of mass to the contact point.
  rAx = 0
  rAy = 0
  rBx = 0
  rBy = 0
  /** Effective masses along the normal and tangent. */
  massNormal = 0
  massTangent = 0
  /** Velocity bias combining Baumgarte correction and restitution. */
  bias = 0
  /** Target separating speed from restitution, sampled before gravity is applied. */
  restitutionBias = 0
  /** Accumulated normal / tangent impulses, carried across frames (warm start). */
  Pn = 0
  Pt = 0
}

/**
 * Order-independent key for a body pair. Ids below 2^15 pack into a small
 * integer (< 2^30); larger ids fall back to a negative wide key so the two
 * regimes can never collide.
 */
export function pairKey(a: Body, b: Body): number {
  const lo = a.id < b.id ? a.id : b.id
  const hi = a.id < b.id ? b.id : a.id
  return hi < 32768 ? lo * 32768 + hi : -(lo * 2097152 + hi)
}

/** Mixing rules: friction is geometric mean, restitution takes the bouncier body. */
export function mixFriction(a: number, b: number): number {
  return Math.sqrt(a * b)
}
export function mixRestitution(a: number, b: number): number {
  return a > b ? a : b
}

const scratch: Manifold = makeManifold()

/**
 * A persistent contact between two bodies. Lives as long as the pair's AABBs
 * overlap so that accumulated impulses can be re-applied ("warm started") the
 * next frame, which is what lets tall stacks settle instead of jittering.
 */
export class Contact {
  readonly a: Body
  readonly b: Body
  readonly key: number = 0
  readonly points: [ContactPoint, ContactPoint] = [new ContactPoint(), new ContactPoint()]
  count = 0
  normalX = 0
  normalY = 0
  friction = 0
  restitution = 0
  /** Step index when this contact was last confirmed by the broad phase. */
  lastStep = 0
  /** Whether the manifold has at least one point (shapes actually touch). */
  touching = false

  constructor(a: Body, b: Body) {
    this.a = a
    this.b = b
    this.key = pairKey(a, b)
    this.friction = mixFriction(a.friction, b.friction)
    this.restitution = mixRestitution(a.restitution, b.restitution)
  }

  /** Runs the narrow phase and matches new points to old ones by feature id. */
  update(): void {
    this.friction = mixFriction(this.a.friction, this.b.friction)
    this.restitution = mixRestitution(this.a.restitution, this.b.restitution)

    if (!collide(this.a, this.b, scratch)) {
      this.count = 0
      this.touching = false
      return
    }

    const oldCount = this.count
    const old0Id = this.points[0].id
    const old0Pn = this.points[0].Pn
    const old0Pt = this.points[0].Pt
    const old1Id = this.points[1].id
    const old1Pn = this.points[1].Pn
    const old1Pt = this.points[1].Pt

    this.normalX = scratch.normalX
    this.normalY = scratch.normalY
    this.count = scratch.count
    for (let i = 0; i < scratch.count; i++) {
      const src = scratch.points[i]!
      const dst = this.points[i]!
      dst.x = src.x
      dst.y = src.y
      dst.penetration = src.penetration
      dst.id = src.id
      dst.Pn = 0
      dst.Pt = 0
      if (oldCount > 0 && old0Id === src.id) {
        dst.Pn = old0Pn
        dst.Pt = old0Pt
      } else if (oldCount > 1 && old1Id === src.id) {
        dst.Pn = old1Pn
        dst.Pt = old1Pt
      }
    }
    this.touching = true
  }

  /**
   * Samples the approach speed at each point *before* this step's gravity is
   * integrated. Using the post-gravity speed would make an e = 1 ball rebound
   * higher than it fell by g*dt every bounce.
   */
  sampleRestitution(settings: SolverSettings): void {
    const a = this.a
    const b = this.b
    const nx = this.normalX
    const ny = this.normalY
    for (let i = 0; i < this.count; i++) {
      const c = this.points[i]!
      const rAx = c.x - a.position.x
      const rAy = c.y - a.position.y
      const rBx = c.x - b.position.x
      const rBy = c.y - b.position.y
      const dvx = b.velocity.x - b.angularVelocity * rBy - a.velocity.x + a.angularVelocity * rAy
      const dvy = b.velocity.y + b.angularVelocity * rBx - a.velocity.y - a.angularVelocity * rAx
      const vn = dvx * nx + dvy * ny
      c.restitutionBias = vn < -settings.restitutionThreshold ? -this.restitution * vn : 0
    }
  }

  /** Precomputes effective masses and biases, then re-applies last frame's impulses. */
  preStep(invDt: number, settings: SolverSettings): void {
    const a = this.a
    const b = this.b
    const nx = this.normalX
    const ny = this.normalY
    // Tangent is the normal rotated 90 degrees clockwise.
    const tx = ny
    const ty = -nx
    const invMassSum = a.invMass + b.invMass

    for (let i = 0; i < this.count; i++) {
      const c = this.points[i]!
      c.rAx = c.x - a.position.x
      c.rAy = c.y - a.position.y
      c.rBx = c.x - b.position.x
      c.rBy = c.y - b.position.y

      const rnA = c.rAx * ny - c.rAy * nx
      const rnB = c.rBx * ny - c.rBy * nx
      const kNormal = invMassSum + a.invInertia * rnA * rnA + b.invInertia * rnB * rnB
      c.massNormal = kNormal > 0 ? 1 / kNormal : 0

      const rtA = c.rAx * ty - c.rAy * tx
      const rtB = c.rBx * ty - c.rBy * tx
      const kTangent = invMassSum + a.invInertia * rtA * rtA + b.invInertia * rtB * rtB
      c.massTangent = kTangent > 0 ? 1 / kTangent : 0

      // Baumgarte: push apart proportionally to penetration beyond the slop.
      const excess = c.penetration - settings.linearSlop
      const positionBias = excess > 0 ? settings.baumgarte * invDt * excess : 0

      // Taking the larger of the two (not the sum) keeps bounces from being
      // inflated by whatever penetration was detected this frame.
      c.bias = c.restitutionBias > positionBias ? c.restitutionBias : positionBias

      // Warm start.
      const px = c.Pn * nx + c.Pt * tx
      const py = c.Pn * ny + c.Pt * ty
      a.velocity.x -= px * a.invMass
      a.velocity.y -= py * a.invMass
      a.angularVelocity -= a.invInertia * (c.rAx * py - c.rAy * px)
      b.velocity.x += px * b.invMass
      b.velocity.y += py * b.invMass
      b.angularVelocity += b.invInertia * (c.rBx * py - c.rBy * px)
    }
  }

  /** One sequential-impulse iteration: Coulomb friction first, then non-penetration. */
  solveVelocity(): void {
    const a = this.a
    const b = this.b
    const nx = this.normalX
    const ny = this.normalY
    const tx = ny
    const ty = -nx
    const va = a.velocity
    const vb = b.velocity

    for (let i = 0; i < this.count; i++) {
      const c = this.points[i]!

      // --- friction ---
      let dvx = vb.x - b.angularVelocity * c.rBy - va.x + a.angularVelocity * c.rAy
      let dvy = vb.y + b.angularVelocity * c.rBx - va.y - a.angularVelocity * c.rAx
      const vt = dvx * tx + dvy * ty
      let dPt = c.massTangent * -vt
      const maxPt = this.friction * c.Pn
      const oldPt = c.Pt
      let newPt = oldPt + dPt
      if (newPt > maxPt) newPt = maxPt
      else if (newPt < -maxPt) newPt = -maxPt
      dPt = newPt - oldPt
      c.Pt = newPt

      let px = dPt * tx
      let py = dPt * ty
      va.x -= px * a.invMass
      va.y -= py * a.invMass
      a.angularVelocity -= a.invInertia * (c.rAx * py - c.rAy * px)
      vb.x += px * b.invMass
      vb.y += py * b.invMass
      b.angularVelocity += b.invInertia * (c.rBx * py - c.rBy * px)

      // --- non-penetration ---
      dvx = vb.x - b.angularVelocity * c.rBy - va.x + a.angularVelocity * c.rAy
      dvy = vb.y + b.angularVelocity * c.rBx - va.y - a.angularVelocity * c.rAx
      const vn = dvx * nx + dvy * ny
      let dPn = c.massNormal * (-vn + c.bias)
      const oldPn = c.Pn
      const newPn = oldPn + dPn > 0 ? oldPn + dPn : 0
      dPn = newPn - oldPn
      c.Pn = newPn

      px = dPn * nx
      py = dPn * ny
      va.x -= px * a.invMass
      va.y -= py * a.invMass
      a.angularVelocity -= a.invInertia * (c.rAx * py - c.rAy * px)
      vb.x += px * b.invMass
      vb.y += py * b.invMass
      b.angularVelocity += b.invInertia * (c.rBx * py - c.rBy * px)
    }
  }
}
