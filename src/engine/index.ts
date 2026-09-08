/**
 * Impulse — a dependency-free 2D rigid-body physics engine.
 *
 * Pipeline per step:
 *   broad phase (spatial hash) -> narrow phase (SAT + clipping) ->
 *   integrate forces -> warm start -> sequential impulses -> integrate positions ->
 *   islands & sleep
 */
export { Vec2, clamp, wrapAngle } from './vec2.ts'
export {
  type Shape,
  type CircleShape,
  type PolygonShape,
  type MassData,
  MAX_POLYGON_VERTICES,
  makeCircle,
  makeBox,
  makeRegularPolygon,
  makePolygon,
  polygonFromVertices,
  convexHull,
  polygonArea,
  polygonCentroid,
  computeMassData,
  shapeContainsLocalPoint,
} from './shapes.ts'
export { type AABB, makeAABB, aabbOverlap, aabbContainsPoint, computeShapeAABB } from './aabb.ts'
export { Body, type BodyType, type BodyOptions, AABB_MARGIN } from './body.ts'
export { SpatialHash, cellKey, decodeCellKey, type PairFilter } from './spatialHash.ts'
export {
  type Manifold,
  type ManifoldPoint,
  makeManifold,
  collide,
  collideCircles,
  collidePolygonCircle,
  collidePolygons,
  featureId,
} from './collision.ts'
export { Contact, ContactPoint, pairKey, mixFriction, mixRestitution, type SolverSettings } from './contact.ts'
export {
  type Joint,
  type JointKind,
  type JointSettings,
  DistanceJoint,
  type DistanceJointOptions,
  RevoluteJoint,
  type RevoluteJointOptions,
  MouseJoint,
  type MouseJointOptions,
} from './joints.ts'
export { IslandBuilder, updateIslands, type SleepSettings, type IslandStats } from './island.ts'
export { World, DEFAULT_SETTINGS, type WorldSettings, type StepStats } from './world.ts'
export { FixedStepper, lerp, lerpAngle } from './loop.ts'
export {
  SNAPSHOT_VERSION,
  snapshotWorld,
  restoreWorld,
  serializeWorld,
  parseSnapshot,
  type WorldSnapshot,
  type BodySnapshot,
  type JointSnapshot,
  type ContactSnapshot,
  type ShapeSnapshot,
} from './serialize.ts'
export { Rng } from './random.ts'
