import { ARENA } from '../scenes/presets'

/** World rectangle we try to keep in view (walls plus a little breathing room). */
const VIEW_W = ARENA.maxX - ARENA.minX + 4 // 46 m
const VIEW_H = ARENA.ceilingY - ARENA.floorY + 1 // 23 m
/** Below this many pixels per metre, stop trying to show the whole arena. */
const MIN_PPM = 14
/** Narrow screens always show at least this much width. */
const MIN_VIEW_W = 22
/** Screen-space margins: the floating toolbar sits over the bottom edge, the brand chip over the top. */
const BOTTOM_INSET_PX = 92
const TOP_INSET_PX = 16

/**
 * Maps world metres (y up) to canvas CSS pixels (y down). The scale adapts to
 * the canvas so the whole arena fits on desktop while phones zoom in on the
 * middle of the floor instead of shrinking everything to a smudge. The floor
 * is always pinned just above the toolbar so stacks never hide behind it.
 */
export class Camera {
  width = 1
  height = 1
  /** Pixels per metre. */
  ppm = 20
  centerX = 0
  centerY = 0

  resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    const usableH = Math.max(1, this.height - BOTTOM_INSET_PX - TOP_INSET_PX)
    const fitAll = Math.min(this.width / VIEW_W, usableH / VIEW_H)
    this.ppm = fitAll >= MIN_PPM ? fitAll : Math.max(fitAll, Math.min(this.width / MIN_VIEW_W, usableH / VIEW_H))
    this.centerX = (ARENA.minX + ARENA.maxX) / 2
    // Solve toScreenY(floorY) = height - BOTTOM_INSET_PX for centerY.
    this.centerY = ARENA.floorY + (this.height / 2 - BOTTOM_INSET_PX) / this.ppm
  }

  toScreenX(x: number): number {
    return this.width / 2 + (x - this.centerX) * this.ppm
  }

  toScreenY(y: number): number {
    return this.height / 2 - (y - this.centerY) * this.ppm
  }

  toWorldX(sx: number): number {
    return this.centerX + (sx - this.width / 2) / this.ppm
  }

  toWorldY(sy: number): number {
    return this.centerY - (sy - this.height / 2) / this.ppm
  }

  /** World-space bounds currently visible. */
  visibleBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    return {
      minX: this.toWorldX(0),
      maxX: this.toWorldX(this.width),
      minY: this.toWorldY(this.height),
      maxY: this.toWorldY(0),
    }
  }
}
