import { useSandboxStore } from '../app/store'
import { getSandbox } from '../app/registry'
import { ToggleButton } from './controls'
import { RewindIcon } from './icons'

/**
 * Timeline over the keyframes the sandbox records every 0.5 s. Dragging the
 * slider pauses and restores that keyframe; resuming from there forks the
 * timeline (later keyframes are dropped), exactly like scrubbing a recording.
 */
export function HistoryScrubber() {
  const history = useSandboxStore((s) => s.history)
  const paused = useSandboxStore((s) => s.paused)
  const setPaused = useSandboxStore((s) => s.setPaused)
  const count = history.count
  const liveIndex = Math.max(0, count - 1)
  const value = history.index ?? liveIndex
  const span = Math.max(0, history.lastTime - history.firstTime)
  const viewedTime = count > 1 ? history.firstTime + (span * value) / liveIndex : history.firstTime
  const scrubbing = history.index !== null

  const scrub = (i: number) => getSandbox()?.rewindTo(i)

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <label htmlFor="history" className="text-slate-300">
          {scrubbing ? 'viewing keyframe' : 'recorded'}
        </label>
        <output htmlFor="history" className={'tabular-nums ' + (scrubbing ? 'text-amber' : 'text-cyan-300')}>
          {scrubbing ? `t = ${viewedTime.toFixed(1)} s` : `${span.toFixed(1)} s · ${count} keyframes`}
        </output>
      </div>
      <input
        id="history"
        type="range"
        min={0}
        max={liveIndex}
        step={1}
        value={value}
        disabled={count < 2}
        onChange={(e) => scrub(Number(e.target.value))}
        style={{ ['--fill' as string]: `${liveIndex > 0 ? (value / liveIndex) * 100 : 100}%` }}
        aria-label="Rewind timeline"
        aria-valuetext={`t = ${viewedTime.toFixed(1)} seconds`}
      />
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <ToggleButton
          onClick={() => scrub(Math.max(0, value - 6))}
          title="Rewind three seconds (six keyframes)"
          className={count < 2 ? 'pointer-events-none opacity-40' : ''}
        >
          <RewindIcon width={14} height={14} />
          rewind 3 s
        </ToggleButton>
        <ToggleButton
          active={scrubbing}
          onClick={() => {
            if (scrubbing) setPaused(false)
            else scrub(liveIndex)
          }}
          title={scrubbing ? 'Resume from this keyframe (later history is discarded)' : 'Pause at the latest keyframe'}
        >
          {scrubbing ? 'resume from here' : paused ? 'latest keyframe' : 'pause at keyframe'}
        </ToggleButton>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        Full solver state (manifolds, warm-start impulses, sleep timers) is snapshotted every 0.5 s. Restoring one and
        stepping is bit-identical to never having paused.
      </p>
    </div>
  )
}
