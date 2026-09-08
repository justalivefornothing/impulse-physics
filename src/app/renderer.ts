import { type Body, type Joint, type World, type DistanceJoint, Vec2, convexHull, lerp, lerpAngle } from '../engine'
import type { Camera } from './camera'
import type { LiveStats, Overlays } from './store'
import { tagOf } from '../scenes/presets'
import { PALETTE, STATIC_STYLE, BACKGROUND } from './palette'

const COLORS = {
  background: BACKGROUND,
  gridMinor: 'rgba(148, 163, 184, 0.07)',
  gridMajor: 'rgba(148, 163, 184, 0.14)',
  aabb: '#fbbf24',
  hashCell: 'rgba(148, 163, 184, 0.9)',
  contactPoint: '#e879f9',
  contactNormal: '#22d3ee',
  velocity: '#4ade80',
  joint: 'rgba(226, 232, 240, 0.75)',
  mouseJoint: '#f472b6',
  text: '#cbd5e1',
  textDim: '#64748b',
} as const

const GRID_PX = 32
const SPAWN_POP_MS = 260

export interface RenderOptions {
  overlays: Overlays
  /** Interpolation factor between previous and current physics state. */
  alpha: number
  paused: boolean
  /** Wall-clock time in ms (for the spawn pop animation). */
  nowMs: number
  stats: LiveStats
}

/** Snapshot of an interpolated body transform, reused across draws. */
interface Pose {
  x: number
  y: number
  angle: number
}

const pose: Pose = { x: 0, y: 0, angle: 0 }

function interpolate(body: Body, alpha: number): Pose {
  if (body.type === 'static' || !body.awake) {
    pose.x = body.position.x
    pose.y = body.position.y
    pose.angle = body.angle
  } else {
    pose.x = lerp(body.prevPosition.x, body.position.x, alpha)
    pose.y = lerp(body.prevPosition.y, body.position.y, alpha)
    pose.angle = lerpAngle(body.prevAngle, body.angle, alpha)
  }
  return pose
}

/** Ease-out-back curve for the spawn pop (overshoots slightly then settles). */
function popScale(t: number): number {
  if (t >= 1) return 1
  const c1 = 1.70158
  const c3 = c1 + 1
  const u = t - 1
  return 1 + c3 * u * u * u + c1 * u * u
}

/**
 * Canvas 2D renderer for the sandbox. It never mutates the world: it reads
 * body transforms (interpolated), contacts and joints, and draws whichever
 * debug overlays are switched on.
 */
export class Renderer {
  private readonly canvas: HTMLCanvasElement
  private readonly camera: Camera
  private readonly ctx: CanvasRenderingContext2D
  private dpr = 1

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas
    this.camera = camera
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D is not available')
    this.ctx = ctx
  }

  /** Resizes the backing store to match CSS size and device pixel ratio. */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.dpr = dpr
    const w = Math.max(1, Math.round(cssWidth * dpr))
    const h = Math.max(1, Math.round(cssHeight * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.camera.resize(cssWidth, cssHeight)
  }

  draw(world: World, opts: RenderOptions): void {
    const ctx = this.ctx
    const cam = this.camera
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = COLORS.background
    ctx.fillRect(0, 0, cam.width, cam.height)

    this.drawGrid()
    if (opts.overlays.grid) this.drawHashCells(world)

    // Bodies: statics first so dynamic shapes sit on top.
    for (const b of world.bodies) if (b.type === 'static') this.drawBody(b, opts)
    this.drawSoftHulls(world, opts)
    for (const b of world.bodies) if (b.type !== 'static') this.drawBody(b, opts)

    for (const j of world.joints) this.drawJoint(j)

    if (opts.overlays.aabb) this.drawAABBs(world)
    if (opts.overlays.velocity) this.drawVelocities(world, opts.alpha)
    if (opts.overlays.contacts) this.drawContacts(world)
    if (opts.paused) this.drawPauseVignette()
    if (opts.overlays.stats) this.drawStats(opts.stats, world)
  }

  // ------------------------------------------------------------ backdrop

  private drawGrid(): void {
    const ctx = this.ctx
    const cam = this.camera
    // Anchor the grid to the world origin so the floor line lands on a grid line.
    const ox = ((cam.toScreenX(0) % GRID_PX) + GRID_PX) % GRID_PX
    const oy = ((cam.toScreenY(0) % GRID_PX) + GRID_PX) % GRID_PX
    const majorEvery = 4
    const startI = -Math.round(cam.toScreenX(0) / GRID_PX)
    const startJ = -Math.round(cam.toScreenY(0) / GRID_PX)

    ctx.lineWidth = 1
    for (const major of [false, true]) {
      ctx.strokeStyle = major ? COLORS.gridMajor : COLORS.gridMinor
      ctx.beginPath()
      let i = startI
      for (let x = ox; x <= cam.width; x += GRID_PX, i++) {
        if ((((i % majorEvery) + majorEvery) % majorEvery === 0) !== major) continue
        const px = Math.round(x) + 0.5
        ctx.moveTo(px, 0)
        ctx.lineTo(px, cam.height)
      }
      let j = startJ
      for (let y = oy; y <= cam.height; y += GRID_PX, j++) {
        if ((((j % majorEvery) + majorEvery) % majorEvery === 0) !== major) continue
        const py = Math.round(y) + 0.5
        ctx.moveTo(0, py)
        ctx.lineTo(cam.width, py)
      }
      ctx.stroke()
    }
  }

  private drawHashCells(world: World): void {
    const ctx = this.ctx
    const cam = this.camera
    const size = world.broadPhase.cellSize
    ctx.lineWidth = 1
    world.broadPhase.forEachCell((cx, cy, count) => {
      const x0 = cam.toScreenX(cx * size)
      const y0 = cam.toScreenY((cy + 1) * size)
      const w = size * cam.ppm
      const alpha = Math.min(0.06 + count * 0.05, 0.4)
      ctx.fillStyle = `rgba(148, 163, 184, ${alpha.toFixed(3)})`
      ctx.fillRect(x0, y0, w, w)
      ctx.strokeStyle = COLORS.hashCell
      ctx.globalAlpha = 0.25
      ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(w), Math.round(w))
      ctx.globalAlpha = 1
      if (w >= 28) {
        ctx.fillStyle = COLORS.textDim
        ctx.font = '10px "JetBrains Mono", ui-monospace, monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(String(count), x0 + 3, y0 + 2)
      }
    })
  }

  // ------------------------------------------------------------ bodies

  private drawBody(body: Body, opts: RenderOptions): void {
    const ctx = this.ctx
    const cam = this.camera
    const p = interpolate(body, opts.alpha)
    const sx = cam.toScreenX(p.x)
    const sy = cam.toScreenY(p.y)
    const tag = tagOf(body)

    let scale = 1
    if (tag?.spawnedAt !== undefined) {
      const t = (opts.nowMs - tag.spawnedAt) / SPAWN_POP_MS
      if (t < 1) scale = 0.35 + 0.65 * popScale(Math.max(0, t))
      else delete tag.spawnedAt
    }

    // Sleeping bodies keep their tint but go translucent with a dashed outline,
    // so a settled stack still reads as a stack while clearly being 'off'.
    const asleep = body.type === 'dynamic' && !body.awake && opts.overlays.sleep
    let fill: string
    let stroke: string
    if (body.type === 'static') {
      fill = STATIC_STYLE.fill
      stroke = STATIC_STYLE.stroke
    } else {
      const slot = PALETTE[Math.abs(tag?.color ?? 0) % PALETTE.length]!
      fill = slot.fill
      stroke = slot.stroke
    }

    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(-p.angle) // canvas y is down, so world CCW is screen CW
    ctx.scale(scale, scale)
    ctx.beginPath()
    const shape = body.shape
    if (shape.kind === 'circle') {
      const r = shape.radius * cam.ppm
      ctx.arc(0, 0, r, 0, Math.PI * 2)
    } else {
      const v = shape.vertices
      ctx.moveTo(v[0]!.x * cam.ppm, -v[0]!.y * cam.ppm)
      for (let i = 1; i < v.length; i++) ctx.lineTo(v[i]!.x * cam.ppm, -v[i]!.y * cam.ppm)
      ctx.closePath()
    }
    ctx.fillStyle = fill
    const softNode = tag?.soft !== undefined
    ctx.globalAlpha = body.type === 'static' ? 1 : asleep ? 0.3 : softNode ? 0.55 : 0.86
    ctx.fill()
    ctx.globalAlpha = asleep ? 0.65 : 1
    ctx.lineWidth = 1.5 / scale
    ctx.strokeStyle = stroke
    if (asleep) ctx.setLineDash([4, 3])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // A spoke on circles so rolling is visible (not on soft-body nodes, which never roll far).
    if (shape.kind === 'circle' && body.type === 'dynamic' && tag?.soft === undefined) {
      const r = shape.radius * cam.ppm
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(r * 0.85, 0)
      ctx.lineWidth = 1 / scale
      ctx.strokeStyle = asleep ? 'rgba(148, 163, 184, 0.35)' : 'rgba(15, 23, 42, 0.45)'
      ctx.stroke()
    }
    ctx.restore()
  }

  /**
   * Soft bodies are lattices of small discs; drawing the convex hull of each
   * group with a thick round-joined stroke gives them a continuous, puffy
   * silhouette so they read as one jelly instead of a grid of beads.
   */
  private drawSoftHulls(world: World, opts: RenderOptions): void {
    const groups = new Map<number, { pts: Vec2[]; radius: number; color: number; asleep: boolean }>()
    for (const b of world.bodies) {
      const tag = tagOf(b)
      if (b.type !== 'dynamic' || tag?.soft === undefined) continue
      const p = interpolate(b, opts.alpha)
      let g = groups.get(tag.soft)
      if (!g) {
        g = { pts: [], radius: b.shape.kind === 'circle' ? b.shape.radius : 0.25, color: tag.color, asleep: true }
        groups.set(tag.soft, g)
      }
      g.pts.push(new Vec2(p.x, p.y))
      if (b.awake) g.asleep = false
    }
    const ctx = this.ctx
    const cam = this.camera
    for (const g of groups.values()) {
      if (g.pts.length < 3) continue
      const hull = convexHull(g.pts)
      if (hull.length < 3) continue
      const slot = PALETTE[Math.abs(g.color) % PALETTE.length]!
      const dim = g.asleep && opts.overlays.sleep
      ctx.beginPath()
      ctx.moveTo(cam.toScreenX(hull[0]!.x), cam.toScreenY(hull[0]!.y))
      for (let i = 1; i < hull.length; i++) ctx.lineTo(cam.toScreenX(hull[i]!.x), cam.toScreenY(hull[i]!.y))
      ctx.closePath()
      ctx.lineJoin = 'round'
      ctx.lineWidth = g.radius * 2 * cam.ppm
      ctx.strokeStyle = slot.fill
      ctx.fillStyle = slot.fill
      ctx.globalAlpha = dim ? 0.18 : 0.42
      ctx.stroke()
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.lineJoin = 'miter'
    }
  }

  private drawJoint(joint: Joint): void {
    const ctx = this.ctx
    const cam = this.camera
    const ax = cam.toScreenX(joint.anchorA.x)
    const ay = cam.toScreenY(joint.anchorA.y)
    const bx = cam.toScreenX(joint.anchorB.x)
    const by = cam.toScreenY(joint.anchorB.y)
    ctx.lineWidth = 1.25
    if (joint.kind === 'distance') {
      // Soft springs (frequency > 0) are drawn as faint threads without end caps.
      const soft = (joint as DistanceJoint).frequencyHz > 0
      ctx.strokeStyle = soft ? 'rgba(226, 232, 240, 0.28)' : COLORS.joint
      ctx.lineWidth = soft ? 1 : 1.25
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.stroke()
      if (!soft) {
        this.dot(ax, ay, 2.5, COLORS.joint)
        this.dot(bx, by, 2.5, COLORS.joint)
      }
    } else if (joint.kind === 'revolute') {
      ctx.strokeStyle = COLORS.joint
      ctx.beginPath()
      ctx.arc(bx, by, Math.max(2.5, cam.ppm * 0.09), 0, Math.PI * 2)
      ctx.stroke()
      this.dot(bx, by, 1.2, COLORS.joint)
    } else {
      ctx.strokeStyle = COLORS.mouseJoint
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(ax, ay)
      ctx.stroke()
      ctx.setLineDash([])
      // Target cross-hair.
      ctx.beginPath()
      ctx.moveTo(ax - 6, ay)
      ctx.lineTo(ax + 6, ay)
      ctx.moveTo(ax, ay - 6)
      ctx.lineTo(ax, ay + 6)
      ctx.stroke()
      this.dot(bx, by, 3, COLORS.mouseJoint)
    }
  }

  // ------------------------------------------------------------ overlays

  private drawAABBs(world: World): void {
    const ctx = this.ctx
    const cam = this.camera
    ctx.strokeStyle = COLORS.aabb
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    for (const b of world.bodies) {
      const bb = b.aabb
      const x = cam.toScreenX(bb.minX)
      const y = cam.toScreenY(bb.maxY)
      const w = (bb.maxX - bb.minX) * cam.ppm
      const h = (bb.maxY - bb.minY) * cam.ppm
      ctx.rect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h))
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }

  private drawContacts(world: World): void {
    const ctx = this.ctx
    const cam = this.camera
    const arrow = Math.max(14, cam.ppm * 0.5)
    for (const c of world.contacts.values()) {
      if (!c.touching) continue
      for (let i = 0; i < c.count; i++) {
        const p = c.points[i]!
        const sx = cam.toScreenX(p.x)
        const sy = cam.toScreenY(p.y)
        // Normal arrow (cyan), pointing from A to B; screen y is flipped.
        const nx = c.normalX
        const ny = -c.normalY
        const ex = sx + nx * arrow
        const ey = sy + ny * arrow
        ctx.strokeStyle = COLORS.contactNormal
        ctx.lineWidth = 1.25
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(ex, ey)
        // Arrow head.
        const hx = -ny
        const hy = nx
        ctx.moveTo(ex, ey)
        ctx.lineTo(ex - nx * 5 + hx * 3, ey - ny * 5 + hy * 3)
        ctx.moveTo(ex, ey)
        ctx.lineTo(ex - nx * 5 - hx * 3, ey - ny * 5 - hy * 3)
        ctx.stroke()
        this.dot(sx, sy, 3, COLORS.contactPoint)
      }
    }
  }

  private drawVelocities(world: World, alpha: number): void {
    const ctx = this.ctx
    const cam = this.camera
    const lookAhead = 0.15 // seconds
    ctx.strokeStyle = COLORS.velocity
    ctx.lineWidth = 1.25
    for (const b of world.bodies) {
      if (b.type !== 'dynamic' || !b.awake) continue
      const speedSq = b.velocity.lengthSq()
      if (speedSq < 0.01) continue
      const p = interpolate(b, alpha)
      const sx = cam.toScreenX(p.x)
      const sy = cam.toScreenY(p.y)
      const ex = cam.toScreenX(p.x + b.velocity.x * lookAhead)
      const ey = cam.toScreenY(p.y + b.velocity.y * lookAhead)
      const dx = ex - sx
      const dy = ey - sy
      const len = Math.hypot(dx, dy)
      if (len < 2) continue
      const ux = dx / len
      const uy = dy / len
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(ex, ey)
      ctx.moveTo(ex, ey)
      ctx.lineTo(ex - ux * 6 - uy * 3, ey - uy * 6 + ux * 3)
      ctx.moveTo(ex, ey)
      ctx.lineTo(ex - ux * 6 + uy * 3, ey - uy * 6 - ux * 3)
      ctx.stroke()
    }
  }

  private drawPauseVignette(): void {
    const ctx = this.ctx
    const cam = this.camera
    const r = Math.hypot(cam.width, cam.height) / 2
    const g = ctx.createRadialGradient(cam.width / 2, cam.height / 2, r * 0.35, cam.width / 2, cam.height / 2, r)
    g.addColorStop(0, 'rgba(15, 23, 42, 0.25)')
    g.addColorStop(1, 'rgba(2, 6, 23, 0.8)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, cam.width, cam.height)
    ctx.fillStyle = COLORS.text
    ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const label = 'PAUSED  ·  space to resume  ·  . to step'
    const w = ctx.measureText(label).width + 28
    const x = cam.width / 2
    const y = 22
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y - 13, w, 26, 6)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = COLORS.text
    ctx.fillText(label, x, y + 0.5)
  }

  private drawStats(stats: LiveStats, world: World): void {
    const ctx = this.ctx
    const cam = this.camera
    const lines = [
      `bodies   ${String(stats.bodies).padStart(5)}   awake ${String(stats.awake).padStart(4)}`,
      `pairs    ${String(stats.pairs).padStart(5)}   islands ${String(stats.islands).padStart(3)}`,
      `contacts ${String(stats.contacts).padStart(5)}   points ${String(stats.contactPoints).padStart(4)}`,
      `step     ${stats.stepMs.toFixed(2).padStart(5)} ms  ${stats.fps.toFixed(0).padStart(3)} fps`,
      `alpha    ${stats.alpha.toFixed(2).padStart(5)}   t ${world.time.toFixed(1)} s`,
    ]
    ctx.font = '11px "JetBrains Mono", ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const lineH = 15
    const pad = 9
    let w = 0
    for (const l of lines) w = Math.max(w, ctx.measureText(l).width)
    const boxW = w + pad * 2
    const boxH = lines.length * lineH + pad * 2 - 3
    const x = cam.width - boxW - 12
    // On phones the control-drawer button occupies the top-right corner.
    const y = cam.width < 768 ? 56 : 12
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)'
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x, y, boxW, boxH, 6)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = COLORS.text
    lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad + i * lineH))
  }

  private dot(x: number, y: number, r: number, color: string): void {
    const ctx = this.ctx
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}
