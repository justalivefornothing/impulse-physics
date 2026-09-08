import type { Body } from './body.ts'
import { aabbOverlap } from './aabb.ts'

/**
 * Cell coordinates are offset into [0, 2^15) and packed into one integer that
 * stays below 2^30, so every key is a V8 small integer: Map lookups then hash
 * an immediate instead of a boxed double. Cells beyond the range are clamped
 * (that is 32 km from the origin at the default cell size).
 */
const CELL_OFFSET = 16384
const CELL_SPAN = 32768

function clampCell(c: number): number {
  return c < -CELL_OFFSET ? -CELL_OFFSET : c >= CELL_OFFSET ? CELL_OFFSET - 1 : c
}

export function cellKey(cx: number, cy: number): number {
  return (clampCell(cx) + CELL_OFFSET) * CELL_SPAN + (clampCell(cy) + CELL_OFFSET)
}

export function decodeCellKey(key: number): { cx: number; cy: number } {
  const cx = Math.floor(key / CELL_SPAN) - CELL_OFFSET
  const cy = (key % CELL_SPAN) - CELL_OFFSET
  return { cx, cy }
}

/**
 * Early veto for candidate pairs. An object with a method (rather than a bare
 * closure) so the call site inside `queryPairs` stays monomorphic when many
 * worlds share one engine instance.
 */
export interface PairFilter {
  shouldCollide(a: Body, b: Body): boolean
}

/**
 * Uniform grid broad phase. Every body is inserted into each cell its AABB
 * touches; candidate pairs are bodies sharing a cell whose AABBs overlap.
 *
 * Duplicate pairs (two bodies sharing several cells) are avoided without a
 * visited set: a pair is only reported from the cell containing the min
 * corner of the two AABBs' intersection, which is unique per pair.
 */
export class SpatialHash {
  cellSize = 2
  private readonly cells = new Map<number, Body[]>()
  private insertions = 0

  constructor(cellSize = 2) {
    this.cellSize = cellSize
  }

  clear(): void {
    this.cells.clear()
    this.insertions = 0
  }

  /** Number of (body, cell) insertions in the current build. */
  get occupancy(): number {
    return this.insertions
  }

  get cellCount(): number {
    return this.cells.size
  }

  insert(body: Body): void {
    const inv = 1 / this.cellSize
    const bb = body.aabb
    const x0 = Math.floor(bb.minX * inv)
    const y0 = Math.floor(bb.minY * inv)
    const x1 = Math.floor(bb.maxX * inv)
    const y1 = Math.floor(bb.maxY * inv)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = cellKey(cx, cy)
        const list = this.cells.get(key)
        if (list) list.push(body)
        else this.cells.set(key, [body])
        this.insertions++
      }
    }
  }

  /**
   * Collects every unique pair of bodies with overlapping AABBs into `out`
   * (flattened as [a0, b0, a1, b1, ...]). `filter` may veto pairs early.
   */
  queryPairs(out: Body[], filter?: PairFilter): void {
    out.length = 0
    const inv = 1 / this.cellSize
    for (const [key, list] of this.cells) {
      const n = list.length
      if (n < 2) continue
      const cx = Math.floor(key / CELL_SPAN) - CELL_OFFSET
      const cy = (key % CELL_SPAN) - CELL_OFFSET
      for (let i = 0; i < n - 1; i++) {
        const a = list[i]!
        const aa = a.aabb
        for (let j = i + 1; j < n; j++) {
          const b = list[j]!
          if (filter && !filter.shouldCollide(a, b)) continue
          const bb = b.aabb
          if (!aabbOverlap(aa, bb)) continue
          // Report only from the cell owning the intersection's min corner.
          const ix = aa.minX > bb.minX ? aa.minX : bb.minX
          const iy = aa.minY > bb.minY ? aa.minY : bb.minY
          if (clampCell(Math.floor(ix * inv)) !== cx || clampCell(Math.floor(iy * inv)) !== cy) continue
          out.push(a, b)
        }
      }
    }
  }

  /** Iterates occupied cells (for the debug overlay). */
  forEachCell(cb: (cx: number, cy: number, count: number) => void): void {
    for (const [key, list] of this.cells) {
      const cx = Math.floor(key / CELL_SPAN) - CELL_OFFSET
      const cy = (key % CELL_SPAN) - CELL_OFFSET
      cb(cx, cy, list.length)
    }
  }
}
