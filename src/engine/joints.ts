import type { Body } from './body.ts'
import { Vec2 } from './vec2.ts'

export interface JointSettings {
  baumgarte: number
}

export type JointKind = 'distance' | 'revolute' | 'mouse'

/**
 * Common interface for constraints between two bodies (or a body and the
 * world, when `bodyA` is null). Joints follow the same pre-step / iterate
 * pattern as contacts and accumulate impulses for warm starting.
 */
export interface Joint {
  readonly kind: JointKind
  readonly bodyA: Body | null
  readonly bodyB: Body
  /** World-space anchor points, refreshed in `preStep` (used by renderers). */
  readonly anchorA: Vec2
  readonly anchorB: Vec2
  /** Whether the joint links its bodies into one sleep island. */
  readonly connectsIslands: boolean
  /** When false (default), the two jointed bodies do not collide with each other. */
  collideConnected: boolean
  /** Opaque slot for callers. */
  userData?: unknown
  preStep(dt: number, invDt: number, settings: JointSettings): void
  solveVelocity(): void
  /** Accumulated (warm-start) impulses, exposed so snapshots can resume bit-exactly. */
  saveState(): number[]
  loadState(state: readonly number[]): void
}

/** Rigid rod (or, with `frequencyHz > 0`, a damped spring) between two anchor points. */
export interface DistanceJointOptions {
  bodyA: Body
  bodyB: Body
  /** World-space anchor points; default to each body's centre. */
  anchorA?: Vec2
  anchorB?: Vec2
  /** Body-local anchors; when given they take precedence over the world anchors (snapshot restore). */
  localAnchorA?: Vec2
  localAnchorB?: Vec2
  /** Rest length; defaults to the initial anchor distance. */
  length?: number
  /** Soft-constraint spring frequency; 0 means rigid. */
  frequencyHz?: number
  dampingRatio?: number
  collideConnected?: boolean
}

export class DistanceJoint implements Joint {
  readonly kind = 'distance' as const
  readonly bodyA: Body
  readonly bodyB: Body
  readonly connectsIslands = true
  collideConnected = false
  readonly localAnchorA: Vec2
  readonly localAnchorB: Vec2
  readonly anchorA = new Vec2()
  readonly anchorB = new Vec2()
  length = 0
  frequencyHz = 0
  dampingRatio = 0
  userData?: unknown

  private ux = 0
  private uy = 0
  private rAx = 0
  private rAy = 0
  private rBx = 0
  private rBy = 0
  private mass = 0
  private bias = 0
  private gamma = 0
  private impulse = 0

  constructor(opts: DistanceJointOptions) {
    this.bodyA = opts.bodyA
    this.bodyB = opts.bodyB
    const wa = opts.anchorA ?? opts.bodyA.position
    const wb = opts.anchorB ?? opts.bodyB.position
    this.localAnchorA = opts.localAnchorA ? opts.localAnchorA.clone() : this.bodyA.worldToLocal(wa)
    this.localAnchorB = opts.localAnchorB ? opts.localAnchorB.clone() : this.bodyB.worldToLocal(wb)
    this.length = opts.length ?? Math.max(Vec2.distance(wa, wb), 0.005)
    this.frequencyHz = opts.frequencyHz ?? 0
    this.dampingRatio = opts.dampingRatio ?? 0.7
    this.collideConnected = opts.collideConnected ?? false
  }

  saveState(): number[] {
    return [this.impulse]
  }

  loadState(state: readonly number[]): void {
    this.impulse = state[0] ?? 0
  }

  /** Current world distance between the anchors. */
  currentLength(): number {
    return Vec2.distance(this.bodyA.localToWorld(this.localAnchorA), this.bodyB.localToWorld(this.localAnchorB))
  }

  preStep(dt: number, invDt: number, settings: JointSettings): void {
    const a = this.bodyA
    const b = this.bodyB
    this.rAx = a.cos * this.localAnchorA.x - a.sin * this.localAnchorA.y
    this.rAy = a.sin * this.localAnchorA.x + a.cos * this.localAnchorA.y
    this.rBx = b.cos * this.localAnchorB.x - b.sin * this.localAnchorB.y
    this.rBy = b.sin * this.localAnchorB.x + b.cos * this.localAnchorB.y
    this.anchorA.set(a.position.x + this.rAx, a.position.y + this.rAy)
    this.anchorB.set(b.position.x + this.rBx, b.position.y + this.rBy)

    let ux = this.anchorB.x - this.anchorA.x
    let uy = this.anchorB.y - this.anchorA.y
    const len = Math.hypot(ux, uy)
    if (len > 1e-9) {
      ux /= len
      uy /= len
    } else {
      ux = 1
      uy = 0
    }
    this.ux = ux
    this.uy = uy

    const crA = this.rAx * uy - this.rAy * ux
    const crB = this.rBx * uy - this.rBy * ux
    let invMass = a.invMass + b.invMass + a.invInertia * crA * crA + b.invInertia * crB * crB
    const C = len - this.length

    if (this.frequencyHz > 0) {
      // Soft constraint: fold a spring-damper into the effective mass.
      const m = invMass > 0 ? 1 / invMass : 0
      const omega = 2 * Math.PI * this.frequencyHz
      const d = 2 * m * this.dampingRatio * omega
      const k = m * omega * omega
      const g = dt * (d + dt * k)
      this.gamma = g > 0 ? 1 / g : 0
      this.bias = C * dt * k * this.gamma
      invMass += this.gamma
    } else {
      this.gamma = 0
      this.bias = settings.baumgarte * invDt * C
    }
    this.mass = invMass > 0 ? 1 / invMass : 0

    // Warm start.
    const px = this.impulse * ux
    const py = this.impulse * uy
    a.velocity.x -= px * a.invMass
    a.velocity.y -= py * a.invMass
    a.angularVelocity -= a.invInertia * (this.rAx * py - this.rAy * px)
    b.velocity.x += px * b.invMass
    b.velocity.y += py * b.invMass
    b.angularVelocity += b.invInertia * (this.rBx * py - this.rBy * px)
  }

  solveVelocity(): void {
    const a = this.bodyA
    const b = this.bodyB
    const dvx = b.velocity.x - b.angularVelocity * this.rBy - a.velocity.x + a.angularVelocity * this.rAy
    const dvy = b.velocity.y + b.angularVelocity * this.rBx - a.velocity.y - a.angularVelocity * this.rAx
    const cdot = dvx * this.ux + dvy * this.uy
    const lambda = -this.mass * (cdot + this.bias + this.gamma * this.impulse)
    this.impulse += lambda
    const px = lambda * this.ux
    const py = lambda * this.uy
    a.velocity.x -= px * a.invMass
    a.velocity.y -= py * a.invMass
    a.angularVelocity -= a.invInertia * (this.rAx * py - this.rAy * px)
    b.velocity.x += px * b.invMass
    b.velocity.y += py * b.invMass
    b.angularVelocity += b.invInertia * (this.rBx * py - this.rBy * px)
  }
}

/** Pin joint: both bodies share one world point and rotate freely about it. */
export interface RevoluteJointOptions {
  bodyA: Body
  bodyB: Body
  /** World-space pivot (required unless both local anchors are given). */
  anchor?: Vec2
  /** Body-local pivots, used when restoring a snapshot. */
  localAnchorA?: Vec2
  localAnchorB?: Vec2
  collideConnected?: boolean
}

export class RevoluteJoint implements Joint {
  readonly kind = 'revolute' as const
  readonly bodyA: Body
  readonly bodyB: Body
  readonly connectsIslands = true
  collideConnected = false
  readonly localAnchorA: Vec2
  readonly localAnchorB: Vec2
  readonly anchorA = new Vec2()
  readonly anchorB = new Vec2()
  userData?: unknown

  private rAx = 0
  private rAy = 0
  private rBx = 0
  private rBy = 0
  // Inverse of the 2x2 effective mass matrix.
  private m11 = 0
  private m12 = 0
  private m22 = 0
  private biasX = 0
  private biasY = 0
  private impulseX = 0
  private impulseY = 0

  constructor(opts: RevoluteJointOptions) {
    this.bodyA = opts.bodyA
    this.bodyB = opts.bodyB
    if (opts.localAnchorA && opts.localAnchorB) {
      this.localAnchorA = opts.localAnchorA.clone()
      this.localAnchorB = opts.localAnchorB.clone()
    } else if (opts.anchor) {
      this.localAnchorA = this.bodyA.worldToLocal(opts.anchor)
      this.localAnchorB = this.bodyB.worldToLocal(opts.anchor)
    } else {
      throw new Error('RevoluteJoint needs a world anchor or both local anchors')
    }
    this.collideConnected = opts.collideConnected ?? false
  }

  saveState(): number[] {
    return [this.impulseX, this.impulseY]
  }

  loadState(state: readonly number[]): void {
    this.impulseX = state[0] ?? 0
    this.impulseY = state[1] ?? 0
  }

  /** Distance between the two anchors (should stay near zero). */
  separation(): number {
    return Vec2.distance(this.bodyA.localToWorld(this.localAnchorA), this.bodyB.localToWorld(this.localAnchorB))
  }

  preStep(_dt: number, invDt: number, settings: JointSettings): void {
    const a = this.bodyA
    const b = this.bodyB
    this.rAx = a.cos * this.localAnchorA.x - a.sin * this.localAnchorA.y
    this.rAy = a.sin * this.localAnchorA.x + a.cos * this.localAnchorA.y
    this.rBx = b.cos * this.localAnchorB.x - b.sin * this.localAnchorB.y
    this.rBy = b.sin * this.localAnchorB.x + b.cos * this.localAnchorB.y
    this.anchorA.set(a.position.x + this.rAx, a.position.y + this.rAy)
    this.anchorB.set(b.position.x + this.rBx, b.position.y + this.rBy)

    // K = [mA + mB + iA*rA.y^2 + iB*rB.y^2,   -iA*rA.x*rA.y - iB*rB.x*rB.y]
    //     [sym,                                mA + mB + iA*rA.x^2 + iB*rB.x^2]
    const mSum = a.invMass + b.invMass
    const k11 = mSum + a.invInertia * this.rAy * this.rAy + b.invInertia * this.rBy * this.rBy
    const k12 = -a.invInertia * this.rAx * this.rAy - b.invInertia * this.rBx * this.rBy
    const k22 = mSum + a.invInertia * this.rAx * this.rAx + b.invInertia * this.rBx * this.rBx
    const det = k11 * k22 - k12 * k12
    const invDet = Math.abs(det) > 1e-18 ? 1 / det : 0
    this.m11 = k22 * invDet
    this.m12 = -k12 * invDet
    this.m22 = k11 * invDet

    const cx = this.anchorB.x - this.anchorA.x
    const cy = this.anchorB.y - this.anchorA.y
    this.biasX = settings.baumgarte * invDt * cx
    this.biasY = settings.baumgarte * invDt * cy

    // Warm start.
    const px = this.impulseX
    const py = this.impulseY
    a.velocity.x -= px * a.invMass
    a.velocity.y -= py * a.invMass
    a.angularVelocity -= a.invInertia * (this.rAx * py - this.rAy * px)
    b.velocity.x += px * b.invMass
    b.velocity.y += py * b.invMass
    b.angularVelocity += b.invInertia * (this.rBx * py - this.rBy * px)
  }

  solveVelocity(): void {
    const a = this.bodyA
    const b = this.bodyB
    const cdx = b.velocity.x - b.angularVelocity * this.rBy - a.velocity.x + a.angularVelocity * this.rAy + this.biasX
    const cdy = b.velocity.y + b.angularVelocity * this.rBx - a.velocity.y - a.angularVelocity * this.rAx + this.biasY
    const px = -(this.m11 * cdx + this.m12 * cdy)
    const py = -(this.m12 * cdx + this.m22 * cdy)
    this.impulseX += px
    this.impulseY += py
    a.velocity.x -= px * a.invMass
    a.velocity.y -= py * a.invMass
    a.angularVelocity -= a.invInertia * (this.rAx * py - this.rAy * px)
    b.velocity.x += px * b.invMass
    b.velocity.y += py * b.invMass
    b.angularVelocity += b.invInertia * (this.rBx * py - this.rBy * px)
  }
}

/**
 * Soft spring that pulls a point on a body towards a moving target. Used for
 * mouse dragging: the spring keeps the interaction stable and the force clamp
 * stops a fast drag from launching the body through walls.
 */
export interface MouseJointOptions {
  body: Body
  /** World-space grab point on the body. */
  anchor: Vec2
  target?: Vec2
  frequencyHz?: number
  dampingRatio?: number
  /** Maximum force, defaults to 1000 x body mass (in gravity units). */
  maxForce?: number
}

export class MouseJoint implements Joint {
  readonly kind = 'mouse' as const
  readonly bodyA = null
  readonly bodyB: Body
  readonly connectsIslands = false
  collideConnected = true
  readonly localAnchor: Vec2
  readonly target: Vec2
  readonly anchorA = new Vec2()
  readonly anchorB = new Vec2()
  frequencyHz = 0
  dampingRatio = 0
  maxForce = 0
  userData?: unknown

  private rx = 0
  private ry = 0
  private m11 = 0
  private m12 = 0
  private m22 = 0
  private biasX = 0
  private biasY = 0
  private gamma = 0
  private maxImpulse = 0
  private impulseX = 0
  private impulseY = 0

  constructor(opts: MouseJointOptions) {
    this.bodyB = opts.body
    this.localAnchor = opts.body.worldToLocal(opts.anchor)
    this.target = (opts.target ?? opts.anchor).clone()
    this.frequencyHz = opts.frequencyHz ?? 5
    this.dampingRatio = opts.dampingRatio ?? 0.7
    this.maxForce = opts.maxForce ?? 1000 * opts.body.mass
    this.anchorA.copy(this.target)
    this.anchorB.copy(opts.anchor)
  }

  saveState(): number[] {
    return [this.impulseX, this.impulseY]
  }

  loadState(state: readonly number[]): void {
    this.impulseX = state[0] ?? 0
    this.impulseY = state[1] ?? 0
  }

  setTarget(x: number, y: number): void {
    this.target.set(x, y)
    this.bodyB.wake()
  }

  preStep(dt: number, _invDt: number, _settings: JointSettings): void {
    const b = this.bodyB
    this.rx = b.cos * this.localAnchor.x - b.sin * this.localAnchor.y
    this.ry = b.sin * this.localAnchor.x + b.cos * this.localAnchor.y
    this.anchorB.set(b.position.x + this.rx, b.position.y + this.ry)
    this.anchorA.copy(this.target)

    const mass = b.mass
    const omega = 2 * Math.PI * this.frequencyHz
    const d = 2 * mass * this.dampingRatio * omega
    const k = mass * omega * omega
    const g = dt * (d + dt * k)
    this.gamma = g > 0 ? 1 / g : 0
    const beta = dt * k * this.gamma

    const k11 = b.invMass + b.invInertia * this.ry * this.ry + this.gamma
    const k12 = -b.invInertia * this.rx * this.ry
    const k22 = b.invMass + b.invInertia * this.rx * this.rx + this.gamma
    const det = k11 * k22 - k12 * k12
    const invDet = Math.abs(det) > 1e-18 ? 1 / det : 0
    this.m11 = k22 * invDet
    this.m12 = -k12 * invDet
    this.m22 = k11 * invDet

    this.biasX = (this.anchorB.x - this.target.x) * beta
    this.biasY = (this.anchorB.y - this.target.y) * beta
    this.maxImpulse = this.maxForce * dt

    // Warm start.
    b.velocity.x += this.impulseX * b.invMass
    b.velocity.y += this.impulseY * b.invMass
    b.angularVelocity += b.invInertia * (this.rx * this.impulseY - this.ry * this.impulseX)
  }

  solveVelocity(): void {
    const b = this.bodyB
    const cdx = b.velocity.x - b.angularVelocity * this.ry + this.biasX + this.gamma * this.impulseX
    const cdy = b.velocity.y + b.angularVelocity * this.rx + this.biasY + this.gamma * this.impulseY
    let px = -(this.m11 * cdx + this.m12 * cdy)
    let py = -(this.m12 * cdx + this.m22 * cdy)

    const oldX = this.impulseX
    const oldY = this.impulseY
    this.impulseX += px
    this.impulseY += py
    const mag = Math.hypot(this.impulseX, this.impulseY)
    if (mag > this.maxImpulse) {
      const s = this.maxImpulse / mag
      this.impulseX *= s
      this.impulseY *= s
    }
    px = this.impulseX - oldX
    py = this.impulseY - oldY

    b.velocity.x += px * b.invMass
    b.velocity.y += py * b.invMass
    b.angularVelocity += b.invInertia * (this.rx * py - this.ry * px)
  }
}
