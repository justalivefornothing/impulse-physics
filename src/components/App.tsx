import { useEffect, useState } from 'react'
import { useSandboxStore, OVERLAY_META } from '../app/store'
import { SandboxCanvas } from './SandboxCanvas'
import { Toolbar } from './Toolbar'
import { ControlPanel } from './ControlPanel'
import { Toast } from './Toast'
import { CloseIcon, Logo, MenuIcon } from './icons'
import { getSandbox } from '../app/registry'

/** Global hotkeys. Ignored while typing into a form control. */
function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const s = useSandboxStore.getState()
      const key = e.key.toLowerCase()
      if (e.key === ' ') {
        e.preventDefault()
        s.togglePaused()
        return
      }
      if (e.key === '.') return s.requestStep()
      if (e.key === ',') {
        const h = s.history
        const at = h.index ?? h.count - 1
        return getSandbox()?.rewindTo(Math.max(0, at - 6))
      }
      if (key === 'r') return s.reloadScene()
      if (key === 'c') return s.requestClear()
      if (key === 'w') return s.requestWakeAll()
      if (key === '1') return s.setTool('circle')
      if (key === '2') return s.setTool('box')
      if (key === '3') return s.setTool('polygon')
      const overlay = OVERLAY_META.find((o) => o.hotkey.toLowerCase() === key)
      if (overlay) s.toggleOverlay(overlay.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function App() {
  useHotkeys()
  const [panelOpen, setPanelOpen] = useState(false)
  const paused = useSandboxStore((s) => s.paused)

  return (
    <div className="blueprint flex h-full w-full flex-col md:flex-row">
      <main className="relative min-h-0 flex-1 basis-[56dvh] md:basis-auto">
        <SandboxCanvas />

        {/* Brand chip */}
        <header className="pointer-events-none absolute top-3 left-3 flex items-center gap-2.5 rounded-lg border border-slate-700/70 bg-slate-900/80 px-3 py-2 backdrop-blur sm:top-4 sm:left-4">
          <Logo />
          <div className="leading-tight">
            <h1 className="font-sans text-[13px] font-bold tracking-[0.08em] text-slate-100 uppercase">Impulse</h1>
            <p className="hidden text-[10px] text-slate-400 sm:block">2D rigid-body engine · SAT + sequential impulses</p>
          </div>
          {paused && (
            <span className="ml-1 rounded border border-amber/50 bg-amber/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-amber uppercase">
              paused
            </span>
          )}
        </header>

        <Toolbar />
        <Toast />

        {/* Mobile: open the control drawer */}
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-expanded={panelOpen}
          aria-controls="control-panel"
          className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/70 bg-slate-900/85 text-slate-200 backdrop-blur transition-colors hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400/70 md:hidden"
          aria-label="Open controls"
        >
          <MenuIcon />
        </button>
      </main>

      {/* Desktop side panel */}
      <aside
        id="control-panel"
        className={
          'panel-scroll shrink-0 overflow-y-auto border-slate-800 bg-panel/95 backdrop-blur ' +
          'md:static md:block md:h-full md:w-[320px] md:border-l lg:w-[340px] ' +
          (panelOpen
            ? 'fixed inset-y-0 right-0 z-30 block w-[min(92vw,340px)] border-l shadow-[-20px_0_60px_rgba(2,6,23,0.7)]'
            : 'hidden md:block')
        }
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 md:hidden">
          <span className="text-[10px] font-semibold tracking-[0.18em] text-slate-400 uppercase">Controls</span>
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400/70"
            aria-label="Close controls"
          >
            <CloseIcon />
          </button>
        </div>
        <ControlPanel />
      </aside>

      {panelOpen && (
        <button
          type="button"
          aria-label="Close controls"
          onClick={() => setPanelOpen(false)}
          className="fixed inset-0 z-20 bg-slate-950/50 md:hidden"
        />
      )}
    </div>
  )
}
