import type { ReactNode } from 'react'

/** Shared button styling for the panel; `active` renders the pressed state. */
export function ToggleButton({
  active,
  onClick,
  children,
  title,
  className = '',
  ariaLabel,
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
  title?: string
  className?: string
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      className={
        'inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] leading-none tracking-wide transition-colors duration-150 ' +
        'outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 ' +
        (active
          ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]'
          : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500 hover:bg-slate-800 hover:text-slate-100') +
        ' ' +
        className
      }
    >
      {children}
    </button>
  )
}

/** Segmented control: a row of mutually exclusive or independently toggled options. */
export function Segmented({ children, columns = 3 }: { children: ReactNode; columns?: number }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {children}
    </div>
  )
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-b border-slate-800/80 px-4 py-4 last:border-b-0">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</h2>
        {hint && <span className="truncate text-[10px] text-slate-500">{hint}</span>}
      </header>
      {children}
    </section>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  id,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format: (v: number) => string
  id: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[11px] text-slate-300">
          {label}
        </label>
        <output htmlFor={id} className="text-[11px] tabular-nums text-cyan-300">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--fill' as string]: `${pct}%` }}
        aria-valuetext={format(value)}
      />
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-slate-700 bg-slate-900 px-1 py-px text-[9px] leading-none text-slate-400">
      {children}
    </kbd>
  )
}
