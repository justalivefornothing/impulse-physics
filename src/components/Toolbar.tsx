import { useSandboxStore, type ShapeTool } from '../app/store'
import { BoxIcon, CircleIcon, PolygonIcon } from './icons'

const TOOLS: ReadonlyArray<{ id: ShapeTool; label: string; key: string; Icon: typeof CircleIcon }> = [
  { id: 'circle', label: 'Circle', key: '1', Icon: CircleIcon },
  { id: 'box', label: 'Box', key: '2', Icon: BoxIcon },
  { id: 'polygon', label: 'Polygon', key: '3', Icon: PolygonIcon },
]

/** Floating bottom toolbar: which shape a click on empty space spawns. */
export function Toolbar() {
  const tool = useSandboxStore((s) => s.tool)
  const setTool = useSandboxStore((s) => s.setTool)
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3 sm:bottom-4">
      <div
        role="radiogroup"
        aria-label="Shape to spawn"
        className="pointer-events-auto flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-900/85 p-1 shadow-[0_8px_30px_rgba(2,6,23,0.55)] backdrop-blur"
      >
        {TOOLS.map(({ id, label, key, Icon }) => {
          const active = tool === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              title={`${label} (${key})`}
              onClick={() => setTool(id)}
              className={
                'group flex h-10 min-w-10 items-center justify-center gap-2 rounded-lg px-2.5 text-xs transition-colors duration-150 sm:min-w-[92px] ' +
                'outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 ' +
                (active
                  ? 'bg-cyan-400/15 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.5)]'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100')
              }
            >
              <Icon className={active ? 'text-cyan-300' : 'text-slate-400 group-hover:text-slate-200'} />
              <span className="hidden sm:inline">{label}</span>
              <kbd className="hidden rounded border border-slate-700 px-1 text-[9px] text-slate-500 sm:inline">{key}</kbd>
            </button>
          )
        })}
        <div className="mx-1 hidden h-6 w-px bg-slate-700 md:block" />
        <p className="hidden pr-2 text-[10px] leading-tight text-slate-500 md:block">
          click empty space to spawn
          <br />
          drag a body to fling it
        </p>
      </div>
    </div>
  )
}
