import {
  World,
  FixedStepper,
  MouseJoint,
  Vec2,
  Rng,
  makeBox,
  makeCircle,
  makeRegularPolygon,
  snapshotWorld,
  restoreWorld,
  serializeWorld,
  parseSnapshot,
  type Body,
  type Shape,
  type WorldSnapshot,
} from '../engine'
import { findScene, SCENES, type BodyTag } from '../scenes/presets'
import { Camera } from './camera'
import { Renderer } from './renderer'
import { PALETTE_SIZE } from './palette'
import { registerSandbox, type SandboxActions } from './registry'
import { buildShareUrl, decodeFromUrl, encodeForUrl, readSharedFromLocation } from './share'
import { downloadSvg, worldToSvg } from './svgExport'
import { useSandboxStore, type LiveStats, type SandboxState, type ShapeTool } from './store'

const STATS_INTERVAL_MS = 120
/** Keyframe cadence for the rewind buffer: one snapshot every 0.5 s of simulation. */
const KEYFRAME_EVERY_STEPS = 30
/** 120 keyframes x 0.5 s = one minute of rewindable history. */
const MAX_KEYFRAMES = 120
const STORAGE_KEY = 'impulse.scene.v1'
/** Beyond this many characters a share URL stops being practical. */
const MAX_SHARE_URL = 32_000

/**
 * Glue between the pure engine and the browser: owns the World, the fixed
 * step loop, the renderer and pointer interaction, and mirrors the Zustand
 * store's settings into the simulation.
 */
export class Sandbox implements SandboxActions {
  readonly world = new World()
  readonly stepper = new FixedStepper(1 / 60, 6)
  readonly camera = new Camera()
  private readonly renderer: Renderer
  private readonly canvas: HTMLCanvasElement
  private readonly rng = new Rng(1234)

  private raf = 0
  private lastFrameMs = 0
  private lastStatsMs = 0
  private fpsAccum = 0
  private fpsFrames = 0
  private fps = 0

  private mouseJoint: MouseJoint | null = null
  private activePointer: number | null = null
  private pointerDownAt: { x: number; y: number; time: number } | null = null

  /** Rewind buffer, oldest first. */
  private readonly history: WorldSnapshot[] = []
  private stepsSinceKeyframe = 0
  /** Keyframe currently shown while scrubbing, or null when live. */
  private scrubIndex: number | null = null

  private unsubscribe: (() => void) | null = null
  private lastApplied: Pick<SandboxState, 'sceneNonce' | 'stepRequests' | 'clearRequests' | 'wakeRequests'> = {
    sceneNonce: -1,
    stepRequests: 0,
    clearRequests: 0,
    wakeRequests: 0,
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new Renderer(canvas, this.camera)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerUp)
    canvas.addEventListener('contextmenu', this.onContextMenu)

    this.applyState(useSandboxStore.getState())
    this.unsubscribe = useSandboxStore.subscribe((s) => this.applyState(s))
    registerSandbox(this)
    void this.loadSharedFromUrl()
    this.raf = requestAnimationFrame(this.frame)
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    this.unsubscribe?.()
    registerSandbox(null)
    const c = this.canvas
    c.removeEventListener('pointerdown', this.onPointerDown)
    c.removeEventListener('pointermove', this.onPointerMove)
    c.removeEventListener('pointerup', this.onPointerUp)
    c.removeEventListener('pointercancel', this.onPointerUp)
    c.removeEventListener('contextmenu', this.onContextMenu)
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.renderer.resize(cssWidth, cssHeight, Math.min(window.devicePixelRatio || 1, 2))
  }

  // ------------------------------------------------------------ store sync

  private applyState(s: SandboxState): void {
    const w = this.world
    w.settings.gravity.set(0, -s.gravity)
    w.settings.velocityIterations = s.iterations
    if (w.settings.allowSleep !== s.allowSleep) {
      w.settings.allowSleep = s.allowSleep
      if (!s.allowSleep) w.wakeAll()
    }
    this.stepper.timeScale = s.timeScale

    if (s.sceneNonce !== this.lastApplied.sceneNonce) {
      this.lastApplied.sceneNonce = s.sceneNonce
      this.loadScene(s.sceneId)
    }
    if (s.stepRequests !== this.lastApplied.stepRequests) {
      this.lastApplied.stepRequests = s.stepRequests
      this.beforeStepping()
      this.stepOnce(this.stepper.dt)
    }
    if (s.clearRequests !== this.lastApplied.clearRequests) {
      this.lastApplied.clearRequests = s.clearRequests
      this.clearDynamic()
    }
    if (s.wakeRequests !== this.lastApplied.wakeRequests) {
      this.lastApplied.wakeRequests = s.wakeRequests
      this.world.wakeAll()
    }
  }

  loadScene(id: string): void {
    const scene = findScene(id) ?? SCENES[0]!
    this.releaseMouseJoint()
    this.world.clear()
    scene.build(this.world, new Rng(7))
    this.stepper.reset()
    // Run one step so contacts and joint anchors exist for the first frame.
    this.world.step(this.stepper.dt)
    this.resetHistory()
  }

  /** Removes every dynamic body (and thus every joint touching one); keeps the arena. */
  clearDynamic(): void {
    this.releaseMouseJoint()
    const dynamic = this.world.bodies.filter((b) => b.type === 'dynamic')
    for (const b of dynamic) this.world.removeBody(b)
    this.resetHistory()
  }

  // ------------------------------------------------------------ history (rewind)

  private resetHistory(): void {
    this.history.length = 0
    this.stepsSinceKeyframe = 0
    this.scrubIndex = null
    this.history.push(snapshotWorld(this.world))
    this.publishHistory()
  }

  private publishHistory(): void {
    const first = this.history[0]
    const last = this.history[this.history.length - 1]
    useSandboxStore.getState().setHistory({
      count: this.history.length,
      index: this.scrubIndex,
      firstTime: first?.time ?? 0,
      lastTime: last?.time ?? 0,
    })
  }

  /** Stepping forward from a scrubbed keyframe discards the future that came after it. */
  private beforeStepping(): void {
    if (this.scrubIndex !== null) {
      this.history.length = this.scrubIndex + 1
      this.scrubIndex = null
      this.stepsSinceKeyframe = 0
      this.publishHistory()
    }
  }

  private stepOnce(dt: number): void {
    this.world.step(dt)
    if (++this.stepsSinceKeyframe >= KEYFRAME_EVERY_STEPS) {
      this.stepsSinceKeyframe = 0
      this.history.push(snapshotWorld(this.world))
      if (this.history.length > MAX_KEYFRAMES) this.history.splice(0, this.history.length - MAX_KEYFRAMES)
      this.publishHistory()
    }
  }

  rewindTo(index: number): void {
    const i = Math.max(0, Math.min(this.history.length - 1, Math.round(index)))
    const snap = this.history[i]
    if (!snap) return
    this.releaseMouseJoint()
    useSandboxStore.getState().setPaused(true)
    restoreWorld(this.world, snap)
    this.stepper.reset()
    this.scrubIndex = i
    this.publishHistory()
  }

  // ------------------------------------------------------------ scene I/O

  private notify(text: string, tone: 'info' | 'error' = 'info'): void {
    useSandboxStore.getState().notify(text, tone)
  }

  /** Loads a snapshot as the live scene and restarts the rewind buffer from it. */
  private adoptSnapshot(snap: WorldSnapshot): void {
    this.releaseMouseJoint()
    restoreWorld(this.world, snap)
    this.stepper.reset()
    this.resetHistory()
    // Mirror the restored world's tunables back into the panel.
    const s = useSandboxStore.getState()
    s.setGravity(-this.world.settings.gravity.y)
    s.setIterations(this.world.settings.velocityIterations)
    s.setAllowSleep(this.world.settings.allowSleep)
  }

  saveToBrowser(): void {
    try {
      const json = serializeWorld(this.world)
      window.localStorage.setItem(STORAGE_KEY, json)
      this.notify(`Saved ${this.world.bodies.length} bodies to this browser (${(json.length / 1024).toFixed(0)} KB)`)
    } catch (err) {
      this.notify(`Could not save: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  loadFromBrowser(): void {
    try {
      const json = window.localStorage.getItem(STORAGE_KEY)
      if (!json) {
        this.notify('Nothing saved in this browser yet', 'error')
        return
      }
      this.adoptSnapshot(parseSnapshot(json))
      this.notify(`Loaded saved scene: ${this.world.bodies.length} bodies at t = ${this.world.time.toFixed(1)} s`)
    } catch (err) {
      this.notify(`Could not load: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  async copyShareLink(): Promise<void> {
    try {
      const json = serializeWorld(this.world)
      const encoded = await encodeForUrl(json)
      const url = buildShareUrl(encoded)
      if (url.length > MAX_SHARE_URL) {
        this.notify(`Scene is too large to share by URL (${(url.length / 1024).toFixed(0)} KB); use Save instead`, 'error')
        return
      }
      window.history.replaceState(null, '', url)
      let copied = false
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url)
        copied = true
      }
      this.notify(copied ? `Share link copied (${(url.length / 1024).toFixed(1)} KB)` : 'Share link is now in the address bar')
    } catch (err) {
      this.notify(`Could not build link: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  private async loadSharedFromUrl(): Promise<void> {
    const shared = readSharedFromLocation()
    if (!shared) return
    try {
      const json = await decodeFromUrl(shared)
      this.adoptSnapshot(parseSnapshot(json))
      this.notify(`Loaded shared scene: ${this.world.bodies.length} bodies`)
    } catch (err) {
      this.notify(`Shared link could not be read: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  exportSvg(): void {
    const overlays = useSandboxStore.getState().overlays
    const svg = worldToSvg(this.world, this.camera, overlays)
    downloadSvg(svg, `impulse-t${this.world.time.toFixed(2)}s.svg`)
    this.notify(`Exported frame as SVG (${(svg.length / 1024).toFixed(0)} KB)`)
  }

  // ------------------------------------------------------------ main loop

  private readonly frame = (nowMs: number): void => {
    this.raf = requestAnimationFrame(this.frame)
    const state = useSandboxStore.getState()

    const frameDt = this.lastFrameMs === 0 ? 1 / 60 : (nowMs - this.lastFrameMs) / 1000
    this.lastFrameMs = nowMs
    this.fpsAccum += frameDt
    this.fpsFrames++
    if (this.fpsAccum >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccum
      this.fpsAccum = 0
      this.fpsFrames = 0
    }

    let alpha = 1
    if (!state.paused) {
      this.beforeStepping()
      alpha = this.stepper.advance(frameDt, (dt) => this.stepOnce(dt))
    } else {
      this.stepper.lastStepCount = 0
    }

    const stats: LiveStats = {
      ...this.world.stats,
      fps: this.fps,
      alpha,
      stepsLastFrame: this.stepper.lastStepCount,
    }
    this.renderer.draw(this.world, {
      overlays: state.overlays,
      alpha,
      paused: state.paused,
      nowMs,
      stats,
    })

    if (nowMs - this.lastStatsMs >= STATS_INTERVAL_MS) {
      this.lastStatsMs = nowMs
      state.setStats(stats)
    }
  }

  // ------------------------------------------------------------ input

  private toWorld(e: PointerEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect()
    return new Vec2(this.camera.toWorldX(e.clientX - rect.left), this.camera.toWorldY(e.clientY - rect.top))
  }

  private readonly onContextMenu = (e: Event): void => e.preventDefault()

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.activePointer !== null) return
    this.activePointer = e.pointerId
    this.canvas.setPointerCapture(e.pointerId)
    this.canvas.focus()
    const p = this.toWorld(e)
    const body = this.world.queryPoint(p.x, p.y)
    if (body) {
      this.grab(body, p)
    } else {
      this.pointerDownAt = { x: p.x, y: p.y, time: performance.now() }
    }
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return
    const p = this.toWorld(e)
    if (this.mouseJoint) this.mouseJoint.setTarget(p.x, p.y)
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return
    this.activePointer = null
    const p = this.toWorld(e)
    if (this.mouseJoint) {
      // Releasing keeps whatever velocity the spring imparted: the fling.
      this.releaseMouseJoint()
    } else if (this.pointerDownAt) {
      const d = Math.hypot(p.x - this.pointerDownAt.x, p.y - this.pointerDownAt.y)
      // A drag on empty space launches the new body along the drag vector.
      const vx = d > 0.3 ? (p.x - this.pointerDownAt.x) * 3 : 0
      const vy = d > 0.3 ? (p.y - this.pointerDownAt.y) * 3 : 0
      this.spawn(useSandboxStore.getState().tool, this.pointerDownAt.x, this.pointerDownAt.y, vx, vy)
    }
    this.pointerDownAt = null
  }

  private grab(body: Body, at: Vec2): void {
    this.releaseMouseJoint()
    const joint = new MouseJoint({ body, anchor: at, frequencyHz: 4, dampingRatio: 0.8, maxForce: 800 * body.mass })
    this.world.addJoint(joint)
    this.mouseJoint = joint
    useSandboxStore.getState().setPaused(false)
  }

  private releaseMouseJoint(): void {
    if (this.mouseJoint) {
      this.world.removeJoint(this.mouseJoint)
      this.mouseJoint = null
    }
  }

  /** Spawns the selected shape with a random size and colour at a world point. */
  spawn(tool: ShapeTool, x: number, y: number, vx = 0, vy = 0): Body {
    // Spawning while scrubbed forks the timeline from the viewed keyframe.
    this.beforeStepping()
    const rng = this.rng
    let shape: Shape
    if (tool === 'circle') shape = makeCircle(rng.range(0.3, 0.8))
    else if (tool === 'box') shape = makeBox(rng.range(0.3, 0.9), rng.range(0.3, 0.9))
    else shape = makeRegularPolygon(rng.int(3, 8), rng.range(0.45, 0.95), rng.range(0, Math.PI))
    const tag: BodyTag = { color: rng.int(0, PALETTE_SIZE - 1), spawnedAt: performance.now() }
    const body = this.world.createBody(shape, {
      position: { x, y },
      angle: tool === 'circle' ? 0 : rng.range(-0.3, 0.3),
      velocity: { x: vx, y: vy },
      friction: 0.5,
      restitution: 0.2,
      userData: tag,
    })
    return body
  }
}
