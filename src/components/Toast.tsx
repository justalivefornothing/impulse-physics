import { useSandboxStore } from '../app/store'

/** Transient feedback for scene I/O actions, floated above the toolbar. */
export function Toast() {
  const notice = useSandboxStore((s) => s.notice)
  const dismiss = useSandboxStore((s) => s.dismissNotice)
  if (!notice) return null
  const error = notice.tone === 'error'
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[76px] flex justify-center px-3 sm:bottom-[84px]">
      <div
        role="status"
        aria-live="polite"
        className={
          'pointer-events-auto flex max-w-[min(92vw,520px)] items-center gap-3 rounded-lg border px-3.5 py-2 text-[11px] shadow-[0_8px_30px_rgba(2,6,23,0.55)] backdrop-blur ' +
          (error ? 'border-rose-400/40 bg-rose-950/80 text-rose-100' : 'border-cyan-400/40 bg-slate-900/90 text-cyan-100')
        }
      >
        <span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + (error ? 'bg-rose-400' : 'bg-cyan-400')} />
        <span className="leading-snug">{notice.text}</span>
        <button
          type="button"
          onClick={() => dismiss(notice.id)}
          className="ml-1 rounded px-1 text-slate-400 hover:text-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-400/70"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
