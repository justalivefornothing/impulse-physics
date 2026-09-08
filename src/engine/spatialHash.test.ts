import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { Body } from './body.ts'
import { makeBox, makeCircle } from './shapes.ts'
import { SpatialHash, cellKey, decodeCellKey } from './spatialHash.ts'
import { aabbOverlap } from './aabb.ts'
import { pairKey } from './contact.ts'
import { Rng } from './random.ts'

function randomBodies(rng: Rng, count: number, extent: number): Body[] {
  const bodies: Body[] = []
  for (let i = 0; i < count; i++) {
    const shape = rng.next() < 0.5 ? makeCircle(rng.range(0.1, 1.5)) : makeBox(rng.range(0.1, 2), rng.range(0.1, 2))
    bodies.push(
      new Body(i + 1, shape, {
        position: { x: rng.range(-extent, extent), y: rng.range(-extent, extent) },
        angle: rng.range(0, Math.PI * 2),
      }),
    )
  }
  return bodies
}

function bruteForcePairs(bodies: Body[]): Set<number> {
  const out = new Set<number>()
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if (aabbOverlap(bodies[i]!.aabb, bodies[j]!.aabb)) out.add(pairKey(bodies[i]!, bodies[j]!))
    }
  }
  return out
}

function hashPairs(bodies: Body[], cellSize: number): { keys: Set<number>; count: number } {
  const hash = new SpatialHash(cellSize)
  for (const b of bodies) hash.insert(b)
  const flat: Body[] = []
  hash.queryPairs(flat)
  const keys = new Set<number>()
  for (let i = 0; i < flat.length; i += 2) keys.add(pairKey(flat[i]!, flat[i + 1]!))
  return { keys, count: flat.length / 2 }
}

describe('SpatialHash', () => {
  it('cell keys round-trip, including negative cells', () => {
    for (const [cx, cy] of [
      [0, 0],
      [-1, -1],
      [123, -456],
      [-16384, 16383],
    ] as const) {
      expect(decodeCellKey(cellKey(cx, cy))).toEqual({ cx, cy })
    }
    expect(cellKey(1, 2)).not.toBe(cellKey(2, 1))
    // Every key is a V8 small integer (< 2^30), so Map lookups never box the key.
    expect(cellKey(16383, 16383)).toBeLessThan(2 ** 30)
    expect(cellKey(-16384, -16384)).toBeGreaterThanOrEqual(0)
    // Out-of-range cells clamp instead of aliasing onto a neighbour's key.
    expect(cellKey(99999, 0)).toBe(cellKey(16383, 0))
  })

  it('reports exactly the brute-force pair set for a random cloud (no misses, no duplicates)', () => {
    const rng = new Rng(42)
    const bodies = randomBodies(rng, 300, 25)
    const expected = bruteForcePairs(bodies)
    for (const cellSize of [0.5, 1, 2, 5, 20]) {
      const { keys, count } = hashPairs(bodies, cellSize)
      expect(keys).toEqual(expected)
      expect(count).toBe(expected.size) // every pair reported exactly once
    }
    expect(expected.size).toBeGreaterThan(50)
  })

  it('matches brute force for arbitrary seeds, counts and cell sizes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 120 }),
        fc.double({ min: 0.3, max: 8, noNaN: true }),
        (seed, count, cellSize) => {
          const bodies = randomBodies(new Rng(seed), count, 12)
          const expected = bruteForcePairs(bodies)
          const { keys, count: reported } = hashPairs(bodies, cellSize)
          expect(keys).toEqual(expected)
          expect(reported).toBe(expected.size)
        },
      ),
      { numRuns: 60 },
    )
  })

  it('applies the pair filter and clears between builds', () => {
    const a = new Body(1, makeBox(1, 1), { type: 'static' })
    const b = new Body(2, makeBox(1, 1), { type: 'static', position: { x: 0.5, y: 0 } })
    const c = new Body(3, makeBox(1, 1), { position: { x: -0.5, y: 0 } })
    const hash = new SpatialHash(2)
    for (const body of [a, b, c]) hash.insert(body)
    const flat: Body[] = []
    hash.queryPairs(flat, { shouldCollide: (p, q) => p.type === 'dynamic' || q.type === 'dynamic' })
    expect(flat.length / 2).toBe(2) // a-c and b-c, not a-b
    hash.clear()
    expect(hash.cellCount).toBe(0)
    hash.queryPairs(flat)
    expect(flat.length).toBe(0)
  })
})

describe('pairKey', () => {
  it('is symmetric, unique and Smi-sized for ordinary ids', () => {
    const mk = (id: number) => new Body(id, makeCircle(0.5))
    const seen = new Set<number>()
    for (let i = 1; i < 40; i++) {
      for (let j = i + 1; j < 40; j++) {
        const k = pairKey(mk(i), mk(j))
        expect(pairKey(mk(j), mk(i))).toBe(k)
        expect(seen.has(k)).toBe(false)
        seen.add(k)
      }
    }
    expect(pairKey(mk(32766), mk(32767))).toBeLessThan(2 ** 30)
    // Huge ids fall back to the negative regime and stay distinct.
    const wide = pairKey(mk(1), mk(40000))
    expect(wide).toBeLessThan(0)
    expect(wide).not.toBe(pairKey(mk(2), mk(40000)))
  })
})
