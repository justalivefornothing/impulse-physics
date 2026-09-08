import { create } from 'zustand'
import type { StepStats } from '../engine'
import { SCENES } from '../scenes/presets'

export type ShapeTool = 'circle' | 'box' | 'polygon'

export interface Overlays {
  aabb: boolean
  grid: boolean
  contacts: boolean
  velocity: boolean
  sleep: boolean
  stats: boolean
}

export type OverlayKey = keyof Overlays

export const OVERLAY_META: ReadonlyArray<{ key: OverlayKey; label: string; hint: string; hotkey: string }> = [
  { key: 'aabb', label: 'AABBs', hint: 'Dashed amber bounding boxes used by the broad phase', hotkey: 'A' },
  { key: 'grid', label: 'Hash cells', hint: 'Occupied spatial-hash cells; brighter = more bodies', hotkey: 'G' },
  { key: 'contacts', label: 'Contacts', hint: 'Manifold points (magenta) with normals (cyan)', hotkey: 'N' },
  { key: 'velocity', label: 'Velocity', hint: 'Linear velocity vectors, 0.15 s ahead', hotkey: 'V' },
  { key: 'sleep', label: 'Sleep', hint: 'Sleeping islands drawn hollow and dim', hotkey: 'Z' },
  { key: 'stats', label: 'Stats', hint: 'Solver counters and timings on the canvas', hotkey: 'T' },
]

export interface LiveStats extends StepStats {
  fps: number
  /** Interpolation alpha of the last rendered frame. */
  alpha: number
  /** Physics steps run during the last frame. */
  stepsLastFrame: number
}

export const EMPTY_STATS: LiveStats = {
  bodies: 0,
  awake: 0,
  sleeping: 0,
  islands: 0,
  pairs: 0,
  contacts: 0,
  contactPoints: 0,
  joints: 0,
  stepMs: 0,
  broadMs: 0,
  narrowMs: 0,
  solveMs: 0,
  fps: 0,
  alpha: 0,
  stepsLastFrame: 0,
}

export interface Notice {
  id: number
  text: string
  tone: 'info' | 'error'
}

export interface HistoryState {
  /** Number of keyframes currently held (oldest first). */
  count: number
  /** Index being viewed while scrubbing, or null when live. */
  index: number | null
  /** Simulation time of the first and last keyframe, for labels. */
  firstTime: number
  lastTime: number
}

export const EMPTY_HISTORY: HistoryState = { count: 0, index: null, firstTime: 0, lastTime: 0 }

export interface SandboxState {
  tool: ShapeTool
  overlays: Overlays
  paused: boolean
  /** Downward gravity in m/s^2 (negative values pull upwards). */
  gravity: number
  timeScale: number
  iterations: number
  allowSleep: boolean
  sceneId: string
  /** Increments every time the scene should be (re)built. */
  sceneNonce: number
  stats: LiveStats
  /** Number of one-off "step" requests issued while paused. */
  stepRequests: number
  /** Increments to request a full clear of dynamic bodies. */
  clearRequests: number
  /** Increments to request waking every body. */
  wakeRequests: number
  history: HistoryState
  notice: Notice | null

  setTool: (tool: ShapeTool) => void
  toggleOverlay: (key: OverlayKey) => void
  setPaused: (paused: boolean) => void
  togglePaused: () => void
  setGravity: (g: number) => void
  setTimeScale: (t: number) => void
  setIterations: (n: number) => void
  setAllowSleep: (v: boolean) => void
  loadScene: (id: string) => void
  reloadScene: () => void
  requestStep: () => void
  requestClear: () => void
  requestWakeAll: () => void
  setStats: (stats: LiveStats) => void
  setHistory: (history: HistoryState) => void
  /** Shows a transient toast; the previous one is replaced. */
  notify: (text: string, tone?: Notice['tone']) => void
  dismissNotice: (id: number) => void
}

/** Initial scene from `?scene=<id>` so a link can open straight onto a preset. */
function initialSceneId(): string {
  if (typeof window !== 'undefined') {
    const id = new URLSearchParams(window.location.search).get('scene')
    if (id && SCENES.some((s) => s.id === id)) return id
  }
  return SCENES[0]!.id
}

let noticeSeq = 0

export const useSandboxStore = create<SandboxState>((set) => ({
  tool: 'box',
  overlays: { aabb: false, grid: false, contacts: true, velocity: false, sleep: true, stats: true },
  paused: false,
  gravity: 10,
  timeScale: 1,
  iterations: 10,
  allowSleep: true,
  sceneId: initialSceneId(),
  sceneNonce: 0,
  stats: EMPTY_STATS,
  stepRequests: 0,
  clearRequests: 0,
  wakeRequests: 0,
  history: EMPTY_HISTORY,
  notice: null,

  setTool: (tool) => set({ tool }),
  toggleOverlay: (key) => set((s) => ({ overlays: { ...s.overlays, [key]: !s.overlays[key] } })),
  setPaused: (paused) => set({ paused }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  setGravity: (gravity) => set({ gravity }),
  setTimeScale: (timeScale) => set({ timeScale }),
  setIterations: (iterations) => set({ iterations }),
  setAllowSleep: (allowSleep) => set({ allowSleep }),
  loadScene: (sceneId) => set((s) => ({ sceneId, sceneNonce: s.sceneNonce + 1, paused: false })),
  reloadScene: () => set((s) => ({ sceneNonce: s.sceneNonce + 1 })),
  requestStep: () => set((s) => ({ stepRequests: s.stepRequests + 1, paused: true })),
  requestClear: () => set((s) => ({ clearRequests: s.clearRequests + 1 })),
  requestWakeAll: () => set((s) => ({ wakeRequests: s.wakeRequests + 1 })),
  setStats: (stats) => set({ stats }),
  setHistory: (history) => set({ history }),
  notify: (text, tone = 'info') => {
    const id = ++noticeSeq
    set({ notice: { id, text, tone } })
    setTimeout(() => set((s) => (s.notice?.id === id ? { notice: null } : {})), 3200)
  },
  dismissNotice: (id) => set((s) => (s.notice?.id === id ? { notice: null } : {})),
}))
