import { Vec2 } from './vec2.ts'
import { type AABB, makeAABB, computeShapeAABB } from './aabb.ts'
import { type Shape, computeMassData, shapeContainsLocalPoint } from './shapes.ts'

export type BodyType = 'static' | 'dynamic'

export interface BodyOptions {
  type?: BodyType
  position?: Vec2 | { x: number; y: number }
  angle?: number
  velocity?: Vec2 | { x: number; y: number }
  angularVelocity?: number
  /** Mass per unit area; ignored when `mass` is given. Default 1. */
  density?: number
  /** Explicit mass (inertia is scaled to match). */
  mass?: number
  restitution?: number
  friction?: number
  linearDamping?: number
  angularDamping?: number
  /** Locks rotation (infinite inertia). */
  fixedRotation?: boolean
  /** Whether the island sleep system may put this body to sleep. Default true. */
  canSleep?: boolean
  /** Opaque slot for callers (renderers store colours here). */
  userData?: unknown
}

/** Extra padding on every AABB so grazing contacts survive a frame of separation. */
export const AABB_MARGIN = 0.02

/**
 * A rigid body: one shape, a transform, velocities and mass properties.
 * Bodies are created through `World.createBody`, which assigns the id.
 */
export class Body {
  readonly id: number = 0
  type: BodyType = 'dynamic'
  shape: Shape

  readonly position: Vec2
  angle = 0
  /** Cached rotation, kept in sync with `angle` via `syncRotation()`. */
  cos = 1
  sin = 0

  /** Transform at the start of the last step, for render interpolation. */
  readonly prevPosition: Vec2
  prevAngle = 0

  readonly velocity: Vec2
  angularVelocity = 0
  readonly force = new Vec2()
  torque = 0

  mass = 0
  invMass = 0
  inertia = 0
  invInertia = 0

  restitution = 0
  friction = 0
  linearDamping = 0
  angularDamping = 0
  fixedRotation = false

  awake = true
  canSleep = true
  sleepTime = 0
  /** Scratch slot used by the island builder. */
  islandId = -1

  readonly aabb: AABB = makeAABB()
  userData: unknown

  constructor(id: number, shape: Shape, opts: BodyOptions = {}) {
    this.id = id
    this.shape = shape
    this.type = opts.type ?? 'dynamic'
    this.position = new Vec2(opts.position?.x ?? 0, opts.position?.y ?? 0)
    this.angle = opts.angle ?? 0
    this.prevPosition = this.position.clone()
    this.prevAngle = this.angle
    this.velocity = new Vec2(opts.velocity?.x ?? 0, opts.velocity?.y ?? 0)
    this.angularVelocity = opts.angularVelocity ?? 0
    this.restitution = opts.restitution ?? 0.2
    this.friction = opts.friction ?? 0.5
    this.linearDamping = opts.linearDamping ?? 0
    this.angularDamping = opts.angularDamping ?? 0
    this.fixedRotation = opts.fixedRotation ?? false
    this.canSleep = opts.canSleep ?? true
    this.userData = opts.userData
    this.syncRotation()
    this.resetMass(opts.density ?? 1, opts.mass)
    this.updateAABB()
  }

  get isStatic(): boolean {
    return this.type === 'static'
  }

  /** Recomputes mass and inertia from the shape and density (or explicit mass). */
  resetMass(density = 1, explicitMass?: number): void {
    if (this.type === 'static') {
      this.mass = 0
      this.invMass = 0
      this.inertia = 0
      this.invInertia = 0
      return
    }
    const md = computeMassData(this.shape, density)
    let mass = md.mass
    let inertia = md.inertia
    if (explicitMass !== undefined && explicitMass > 0) {
      inertia *= explicitMass / mass
      mass = explicitMass
    }
    this.mass = mass
    this.invMass = mass > 0 ? 1 / mass : 0
    if (this.fixedRotation || inertia <= 0) {
      this.inertia = 0
      this.invInertia = 0
    } else {
      this.inertia = inertia
      this.invInertia = 1 / inertia
    }
  }

  /** Overrides mass and inertia directly (used when restoring a snapshot). */
  setMassData(mass: number, inertia: number): void {
    this.mass = mass
    this.invMass = mass > 0 ? 1 / mass : 0
    this.inertia = inertia
    this.invInertia = inertia > 0 ? 1 / inertia : 0
  }

  syncRotation(): void {
    this.cos = Math.cos(this.angle)
    this.sin = Math.sin(this.angle)
  }

  setTransform(x: number, y: number, angle: number): void {
    this.position.set(x, y)
    this.angle = angle
    this.prevPosition.set(x, y)
    this.prevAngle = angle
    this.syncRotation()
    this.updateAABB()
    this.wake()
  }

  updateAABB(): void {
    computeShapeAABB(this.shape, this.position.x, this.position.y, this.cos, this.sin, AABB_MARGIN, this.aabb)
  }

  /** Applies a force at the centre of mass, or at a world point if given. */
  applyForce(fx: number, fy: number, atX?: number, atY?: number): void {
    if (this.type !== 'dynamic') return
    this.force.x += fx
    this.force.y += fy
    if (atX !== undefined && atY !== undefined) {
      this.torque += (atX - this.position.x) * fy - (atY - this.position.y) * fx
    }
    this.wake()
  }

  applyTorque(t: number): void {
    if (this.type !== 'dynamic') return
    this.torque += t
    this.wake()
  }

  /** Instantaneous change of momentum at a world point (defaults to the centre). */
  applyImpulse(px: number, py: number, atX?: number, atY?: number): void {
    if (this.type !== 'dynamic') return
    this.velocity.x += px * this.invMass
    this.velocity.y += py * this.invMass
    if (atX !== undefined && atY !== undefined) {
      this.angularVelocity += this.invInertia * ((atX - this.position.x) * py - (atY - this.position.y) * px)
    }
    this.wake()
  }

  setVelocity(vx: number, vy: number, angular?: number): void {
    if (this.type !== 'dynamic') return
    this.velocity.set(vx, vy)
    if (angular !== undefined) this.angularVelocity = angular
    this.wake()
  }

  wake(): void {
    if (this.type !== 'dynamic') return
    this.awake = true
    this.sleepTime = 0
  }

  sleep(): void {
    this.awake = false
    this.sleepTime = 0
    this.velocity.set(0, 0)
    this.angularVelocity = 0
    this.force.set(0, 0)
    this.torque = 0
  }

  /** Velocity of the material point currently at world position (x, y). */
  velocityAt(x: number, y: number): Vec2 {
    const rx = x - this.position.x
    const ry = y - this.position.y
    return new Vec2(this.velocity.x - this.angularVelocity * ry, this.velocity.y + this.angularVelocity * rx)
  }

  localToWorld(local: Vec2): Vec2 {
    return new Vec2(
      this.position.x + this.cos * local.x - this.sin * local.y,
      this.position.y + this.sin * local.x + this.cos * local.y,
    )
  }

  worldToLocal(world: Vec2): Vec2 {
    const dx = world.x - this.position.x
    const dy = world.y - this.position.y
    return new Vec2(this.cos * dx + this.sin * dy, -this.sin * dx + this.cos * dy)
  }

  /** Rotates a local-space vector (no translation) into world space. */
  rotate(local: Vec2): Vec2 {
    return new Vec2(this.cos * local.x - this.sin * local.y, this.sin * local.x + this.cos * local.y)
  }

  containsPoint(x: number, y: number): boolean {
    const dx = x - this.position.x
    const dy = y - this.position.y
    const lx = this.cos * dx + this.sin * dy
    const ly = -this.sin * dx + this.cos * dy
    return shapeContainsLocalPoint(this.shape, lx, ly)
  }

  /** Kinetic energy, handy for tests and the stats overlay. */
  kineticEnergy(): number {
    const v2 = this.velocity.lengthSq()
    return 0.5 * this.mass * v2 + 0.5 * this.inertia * this.angularVelocity * this.angularVelocity
  }
}
