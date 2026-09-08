import { useSandboxStore, OVERLAY_META } from '../app/store'
import { SCENES } from '../scenes/presets'
import { Kbd, Section, Segmented, Slider, ToggleButton } from './controls'
import { PauseIcon, PlayIcon, ResetIcon, StepIcon, TrashIcon, WakeIcon } from './icons'
import { StatsReadout } from './StatsReadout'
import { HistoryScrubber } from './HistoryScrubber'
import { SceneIO } from './SceneIO'

export function ControlPanel() {
  const sceneId = useSandboxStore((s) => s.sceneId)
  const loadScene = useSandboxStore((s) => s.loadScene)
  const reloadScene = useSandboxStore((s) => s.reloadScene)
  const paused = useSandboxStore((s) => s.paused)
  const togglePaused = useSandboxStore((s) => s.togglePaused)
  const requestStep = useSandboxStore((s) => s.requestStep)
  const requestClear = useSandboxStore((s) => s.requestClear)
  const requestWakeAll = useSandboxStore((s) => s.requestWakeAll)
  const gravity = useSandboxStore((s) => s.gravity)
  const setGravity = useSandboxStore((s) => s.setGravity)
  const timeScale = useSandboxStore((s) => s.timeScale)
  const setTimeScale = useSandboxStore((s) => s.setTimeScale)
  const iterations = useSandboxStore((s) => s.iterations)
  const setIterations = useSandboxStore((s) => s.setIterations)
  const allowSleep = useSandboxStore((s) => s.allowSleep)
  const setAllowSleep = useSandboxStore((s) => s.setAllowSleep)
  const overlays = useSandboxStore((s) => s.overlays)
  const toggleOverlay = useSandboxStore((s) => s.toggleOverlay)

  const scene = SCENES.find((s) => s.id === sceneId)

  return (
    <div className="flex h-full flex-col">
      <Section title="Scenes">
        <Segmented columns={2}>
          {SCENES.map((s) => (
            <ToggleButton key={s.id} active={s.id === sceneId} onClick={() => loadScene(s.id)} title={s.blurb}>
              <span className="truncate">{s.name}</span>
            </ToggleButton>
          ))}
        </Segmented>
        {scene && (
          <p className="mt-3 text-[10.5px] leading-relaxed text-slate-400" aria-live="polite">
            {scene.blurb}
          </p>
        )}
      </Section>

      <Section title="Playback">
        <Segmented columns={4}>
          <ToggleButton
            active={paused}
            onClick={togglePaused}
            title={paused ? 'Resume (space)' : 'Pause (space)'}
            ariaLabel={paused ? 'Resume simulation' : 'Pause simulation'}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
          </ToggleButton>
          <ToggleButton onClick={requestStep} title="Advance one 1/60 s step (.)" ariaLabel="Step one tick">
            <StepIcon />
          </ToggleButton>
          <ToggleButton onClick={reloadScene} title="Rebuild the current scene (R)" ariaLabel="Reset scene">
            <ResetIcon />
          </ToggleButton>
          <ToggleButton onClick={requestClear} title="Remove every dynamic body (C)" ariaLabel="Clear bodies">
            <TrashIcon />
          </ToggleButton>
        </Segmented>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <ToggleButton onClick={requestWakeAll} title="Wake every sleeping island (W)">
            <WakeIcon width={14} height={14} />
            wake all
          </ToggleButton>
          <ToggleButton
            active={allowSleep}
            onClick={() => setAllowSleep(!allowSleep)}
            title="Let quiet islands stop being solved"
          >
            sleeping {allowSleep ? 'on' : 'off'}
          </ToggleButton>
        </div>
      </Section>

      <Section title="World">
        <Slider
          id="gravity"
          label="gravity"
          min={-20}
          max={30}
          step={0.5}
          value={gravity}
          onChange={setGravity}
          format={(v) => `${v.toFixed(1)} m/s²`}
        />
        <Slider
          id="timescale"
          label="time scale"
          min={0}
          max={2}
          step={0.05}
          value={timeScale}
          onChange={setTimeScale}
          format={(v) => `${v.toFixed(2)}×`}
        />
        <Slider
          id="iterations"
          label="solver iterations"
          min={1}
          max={30}
          step={1}
          value={iterations}
          onChange={setIterations}
          format={(v) => `${v}`}
        />
      </Section>

      <Section title="Overlays">
        <Segmented columns={3}>
          {OVERLAY_META.map((o) => (
            <ToggleButton key={o.key} active={overlays[o.key]} onClick={() => toggleOverlay(o.key)} title={`${o.hint} (${o.hotkey})`}>
              {o.label}
            </ToggleButton>
          ))}
        </Segmented>
        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-500">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-magenta" /> contact point
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-px w-3 bg-cyan" /> contact normal
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 border border-dashed border-amber" /> AABB
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-px w-3 bg-green-400" /> velocity
          </li>
        </ul>
      </Section>

      <Section title="Stats">
        <StatsReadout />
      </Section>

      <Section title="History">
        <HistoryScrubber />
      </Section>

      <Section title="Scene">
        <SceneIO />
      </Section>

      <Section title="Keys">
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] text-slate-400">
          <span>
            <Kbd>space</Kbd> pause
          </span>
          <span>
            <Kbd>.</Kbd> step
          </span>
          <span>
            <Kbd>,</Kbd> rewind 3 s
          </span>
          <span>
            <Kbd>R</Kbd> reset
          </span>
          <span>
            <Kbd>C</Kbd> clear
          </span>
          <span>
            <Kbd>W</Kbd> wake
          </span>
          <span>
            <Kbd>1</Kbd>-<Kbd>3</Kbd> shape
          </span>
          {OVERLAY_META.map((o) => (
            <span key={o.key}>
              <Kbd>{o.hotkey}</Kbd> {o.label.toLowerCase()}
            </span>
          ))}
        </div>
      </Section>
    </div>
  )
}
