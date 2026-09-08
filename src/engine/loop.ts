/**
 * Fixed-timestep accumulator. Rendering runs at whatever rate the display
 * provides; the simulation only ever advances in exact `dt` increments, and
 * the leftover fraction (`alpha`) tells the renderer how far between the
 * previous and current physics states to interpolate.
 */
export class FixedStepper {
  /** Physics step in seconds (default 60 Hz). */
  readonly dt: number = 1 / 60
  /** Simulation speed multiplier; 0 effectively pauses. */
  timeScale = 1
  /** Upper bound on steps per frame, so a long stall cannot spiral. */
  maxStepsPerFrame = 5
  /** Real time that has not yet been consumed by a step (already time-scaled). */
  accumulator = 0
  /** Blend factor for interpolation, updated by `advance`. */
  alpha = 0
  /** Steps taken during the last `advance` call. */
  lastStepCount = 0

  constructor(dt = 1 / 60, maxStepsPerFrame = 5) {
    this.dt = dt
    this.maxStepsPerFrame = maxStepsPerFrame
  }

  /**
   * Feeds a frame's worth of real time and runs `step` zero or more times.
   * Returns the interpolation alpha in [0, 1).
   */
  advance(frameSeconds: number, step: (dt: number) => void): number {
    // Clamp huge gaps (tab switch, debugger) so we do not try to catch up forever.
    const clamped = frameSeconds > 0.25 ? 0.25 : frameSeconds < 0 ? 0 : frameSeconds
    this.accumulator += clamped * this.timeScale
    let steps = 0
    while (this.accumulator >= this.dt && steps < this.maxStepsPerFrame) {
      step(this.dt)
      this.accumulator -= this.dt
      steps++
    }
    if (steps === this.maxStepsPerFrame && this.accumulator >= this.dt) {
      // Still behind after the cap: drop the remainder rather than stall.
      this.accumulator = 0
    }
    this.lastStepCount = steps
    this.alpha = this.dt > 0 ? this.accumulator / this.dt : 0
    return this.alpha
  }

  reset(): void {
    this.accumulator = 0
    this.alpha = 0
    this.lastStepCount = 0
  }
}

/** Linear interpolation helper for positions. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Interpolates angles along the shortest arc so spinning bodies do not flicker. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  const twoPi = Math.PI * 2
  d = ((((d + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI
  return a + d * t
}
