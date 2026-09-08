import type { Body } from './body.ts'
import type { Contact } from './contact.ts'
import type { Joint } from './joints.ts'

export interface SleepSettings {
  allowSleep: boolean
  /** Bodies slower than this (m/s) accumulate sleep time. */
  sleepLinearTolerance: number
  /** Bodies rotating slower than this (rad/s) accumulate sleep time. */
  sleepAngularTolerance: number
  /** Seconds an entire island must stay quiet before it sleeps. */
  timeToSleep: number
}

export interface IslandStats {
  islands: number
  sleeping: number
}

/**
 * Groups dynamic bodies into islands connected through touching contacts and
 * joints (static bodies never bridge islands). An island sleeps only when every
 * body in it has been quiet for `timeToSleep`; a single awake body wakes the
 * whole island, so a stack cannot be half asleep.
 *
 * Implemented as a union-find over dense body indices with reusable typed
 * arrays, so a step allocates nothing once the buffers have grown to fit.
 */
export class IslandBuilder {
  private parent = new Int32Array(64)
  private anyAwake = new Uint8Array(64)
  private minSleep = new Float64Array(64)
  private dynamic: Body[] = []

  private ensure(n: number): void {
    if (this.parent.length >= n) return
    let size = this.parent.length
    while (size < n) size *= 2
    this.parent = new Int32Array(size)
    this.anyAwake = new Uint8Array(size)
    this.minSleep = new Float64Array(size)
  }

  private find(i: number): number {
    const parent = this.parent
    let root = i
    while (parent[root] !== root) root = parent[root]!
    // Path compression keeps later lookups O(1) amortised.
    while (parent[i] !== root) {
      const next = parent[i]!
      parent[i] = root
      i = next
    }
    return root
  }

  private union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[ra < rb ? rb : ra] = ra < rb ? ra : rb
  }

  update(
    bodies: readonly Body[],
    contacts: Iterable<Contact>,
    joints: readonly Joint[],
    dt: number,
    settings: SleepSettings,
  ): IslandStats {
    const dynamic = this.dynamic
    dynamic.length = 0
    for (const b of bodies) {
      if (b.type === 'dynamic') {
        b.islandId = dynamic.length
        dynamic.push(b)
      } else {
        b.islandId = -1
      }
    }
    const n = dynamic.length
    this.ensure(n)
    const parent = this.parent
    const anyAwake = this.anyAwake
    const minSleep = this.minSleep
    for (let i = 0; i < n; i++) {
      parent[i] = i
      anyAwake[i] = 0
      minSleep[i] = Infinity
    }

    // 1. Connectivity through constraints.
    for (const c of contacts) {
      if (!c.touching) continue
      if (c.a.type !== 'dynamic' || c.b.type !== 'dynamic') continue
      this.union(c.a.islandId, c.b.islandId)
    }
    for (const j of joints) {
      if (!j.connectsIslands || !j.bodyA) continue
      if (j.bodyA.type !== 'dynamic' || j.bodyB.type !== 'dynamic') continue
      this.union(j.bodyA.islandId, j.bodyB.islandId)
    }

    // 2. Flatten to roots and find which islands contain anything awake.
    let islands = 0
    for (let i = 0; i < n; i++) {
      const r = this.find(i)
      parent[i] = r
      if (r === i) islands++
      if (dynamic[i]!.awake) anyAwake[r] = 1
    }

    // 3. Per-body sleep timers, folded into a per-island minimum.
    const linTolSq = settings.sleepLinearTolerance * settings.sleepLinearTolerance
    const angTol = settings.sleepAngularTolerance
    let sleeping = 0
    for (let i = 0; i < n; i++) {
      const b = dynamic[i]!
      const r = parent[i]!
      if (anyAwake[r] === 0) {
        sleeping++
        continue
      }
      if (!b.awake) {
        // Touched by something awake: wake it so it gets simulated next step.
        b.awake = true
        b.sleepTime = 0
      }
      if (!settings.allowSleep || !b.canSleep) {
        b.sleepTime = 0
        minSleep[r] = 0
        continue
      }
      const w = b.angularVelocity
      if (b.velocity.lengthSq() > linTolSq || w * w > angTol * angTol) {
        b.sleepTime = 0
        minSleep[r] = 0
      } else {
        b.sleepTime += dt
        if (b.sleepTime < minSleep[r]!) minSleep[r] = b.sleepTime
      }
    }

    // 4. Put whole islands to sleep once every member has been quiet long enough.
    if (settings.allowSleep) {
      for (let i = 0; i < n; i++) {
        const r = parent[i]!
        if (anyAwake[r] === 1 && minSleep[r]! >= settings.timeToSleep) {
          dynamic[i]!.sleep()
          sleeping++
        }
      }
    }

    // Leave `islandId` holding the island root so debug views can colour by island.
    for (let i = 0; i < n; i++) dynamic[i]!.islandId = parent[i]!

    return { islands, sleeping }
  }
}

const shared = new IslandBuilder()

/** Convenience wrapper around a shared `IslandBuilder` (see the class for details). */
export function updateIslands(
  bodies: readonly Body[],
  contacts: Iterable<Contact>,
  joints: readonly Joint[],
  dt: number,
  settings: SleepSettings,
): IslandStats {
  return shared.update(bodies, contacts, joints, dt, settings)
}
