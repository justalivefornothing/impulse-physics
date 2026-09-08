import { useSandboxStore } from '../app/store'

function Cell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/50 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={'mt-0.5 text-sm tabular-nums ' + (accent ? 'text-cyan-300' : 'text-slate-100')}>{value}</div>
    </div>
  )
}

/** Live solver counters, refreshed ~8 times a second by the sandbox loop. */
export function StatsReadout() {
  const s = useSandboxStore((st) => st.stats)
  const budget = 1000 / 60
  const load = Math.min(1, s.stepMs / budget)
  return (
    <div aria-live="off">
      <div className="grid grid-cols-3 gap-1.5">
        <Cell label="bodies" value={String(s.bodies)} />
        <Cell label="awake" value={String(s.awake)} />
        <Cell label="islands" value={String(s.islands)} />
        <Cell label="pairs" value={String(s.pairs)} />
        <Cell label="contacts" value={String(s.contacts)} />
        <Cell label="points" value={String(s.contactPoints)} />
        <Cell label="ms / step" value={s.stepMs.toFixed(2)} accent />
        <Cell label="fps" value={s.fps.toFixed(0)} />
        <Cell label="alpha" value={s.alpha.toFixed(2)} />
      </div>
      <div className="mt-2">
        <div className="mb-1 flex justify-between text-[9px] uppercase tracking-[0.14em] text-slate-500">
          <span>step budget (16.7 ms)</span>
          <span className="tabular-nums">
            broad {s.broadMs.toFixed(2)} · narrow {s.narrowMs.toFixed(2)} · solve {s.solveMs.toFixed(2)}
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-slate-800"
          role="meter"
          aria-label="Physics step time as a fraction of the 60 Hz budget"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(load * 100)}
        >
          <div
            className={'h-full rounded-full transition-[width] duration-200 ' + (load > 0.75 ? 'bg-amber' : 'bg-cyan')}
            style={{ width: `${Math.max(2, load * 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
