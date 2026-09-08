/**
 * Headless benchmark: 500 mixed bodies stepped for 300 ticks at 60 Hz.
 * Run with `npm run bench`. Exits non-zero if the budget (3 s) is exceeded.
 */
import { World, Rng, makeBox, makeCircle, makeRegularPolygon } from '../src/engine/index.ts'
import { SCENES, loadScene } from '../src/scenes/presets.ts'

const BODIES = 500
const TICKS = 300
const DT = 1 / 60
const BUDGET_MS = 3000

function buildWorld(seed: number, allowSleep: boolean): World {
  const world = new World({ allowSleep })
  const rng = new Rng(seed)
  world.createBody(makeBox(40, 1), { type: 'static', position: { x: 0, y: -1 }, friction: 0.6 })
  world.createBody(makeBox(1, 40), { type: 'static', position: { x: -30, y: 20 } })
  world.createBody(makeBox(1, 40), { type: 'static', position: { x: 30, y: 20 } })
  for (let i = 0; i < BODIES; i++) {
    const kind = rng.int(0, 2)
    const shape =
      kind === 0
        ? makeCircle(rng.range(0.25, 0.6))
        : kind === 1
          ? makeBox(rng.range(0.25, 0.6), rng.range(0.25, 0.6))
          : makeRegularPolygon(rng.int(3, 8), rng.range(0.3, 0.7), rng.range(0, Math.PI))
    world.createBody(shape, {
      position: { x: rng.range(-27, 27), y: rng.range(1, 40) },
      angle: rng.range(0, Math.PI * 2),
      friction: 0.5,
      restitution: 0.1,
    })
  }
  return world
}

function run(label: string, world: World): number {
  const phase = { broad: 0, narrow: 0, solve: 0 }
  let maxContacts = 0
  const t0 = performance.now()
  for (let i = 0; i < TICKS; i++) {
    world.step(DT)
    phase.broad += world.stats.broadMs
    phase.narrow += world.stats.narrowMs
    phase.solve += world.stats.solveMs
    if (world.stats.contacts > maxContacts) maxContacts = world.stats.contacts
  }
  const total = performance.now() - t0
  const perStep = total / TICKS
  console.log(
    `${label.padEnd(26)} ${total.toFixed(0).padStart(6)} ms total  ${perStep.toFixed(3)} ms/step  ` +
      `(broad ${(phase.broad / TICKS).toFixed(3)}, narrow ${(phase.narrow / TICKS).toFixed(3)}, solve ${(phase.solve / TICKS).toFixed(3)})  ` +
      `peak contacts ${maxContacts}, awake at end ${world.stats.awake}`,
  )
  return total
}

console.log(`Impulse benchmark — ${BODIES} mixed bodies x ${TICKS} ticks @ 60 Hz, 10 velocity iterations`)
console.log(`node ${process.version}\n`)

// Warm up the JIT on a throwaway world so the measured run is representative.
run('warm-up (sleep on)', buildWorld(1, true))

const main = run('500 bodies, sleep off', buildWorld(7, false))
run('500 bodies, sleep on', buildWorld(7, true))

console.log('\nPreset scenes (300 ticks each, sleep on):')
for (const scene of SCENES) {
  const world = new World()
  loadScene(world, scene)
  run(`  ${scene.name} (${world.bodies.length} bodies)`, world)
}

console.log(`\nBudget: ${BUDGET_MS} ms for the 500-body / sleep-off run -> ${main < BUDGET_MS ? 'PASS' : 'FAIL'} (${main.toFixed(0)} ms)`)
if (main >= BUDGET_MS) process.exit(1)
