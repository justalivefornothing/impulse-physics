import { World, makeBox, makeCircle, Vec2, DistanceJoint, RevoluteJoint } from '../src/engine/index.ts'

function pyramid(rows: number, allowSleep: boolean) {
  const world = new World({ allowSleep })
  world.createBody(makeBox(30, 1), { type: 'static', position: { x: 0, y: -1 } })
  const size = 1
  const half = size / 2
  const bodies = []
  for (let row = 0; row < rows; row++) {
    const count = rows - row
    const y = half + row * size
    const startX = -((count - 1) * size) / 2
    for (let i = 0; i < count; i++) {
      bodies.push(world.createBody(makeBox(half, half), { position: { x: startX + i * size, y }, friction: 0.6, restitution: 0 }))
    }
  }
  const startX = bodies.map((b) => b.position.x)
  let maxDrift = 0
  let minY = Infinity
  const dt = 1 / 60
  for (let i = 0; i < 600; i++) {
    world.step(dt)
    for (let k = 0; k < bodies.length; k++) {
      const b = bodies[k]!
      maxDrift = Math.max(maxDrift, Math.abs(b.position.x - startX[k]!))
      minY = Math.min(minY, b.position.y - half)
    }
  }
  console.log(`pyramid rows=${rows} sleep=${allowSleep}: maxDrift=${maxDrift.toFixed(5)} minY=${minY.toFixed(5)} stepMs=${world.stats.stepMs.toFixed(3)} awake=${world.stats.awake}`)
}

function bounce(e: number, h: number) {
  const world = new World({ allowSleep: false })
  world.createBody(makeBox(30, 1), { type: 'static', position: { x: 0, y: -1 }, restitution: e })
  const r = 0.5
  const ball = world.createBody(makeCircle(r), { position: { x: 0, y: h + r }, restitution: e, friction: 0.3 })
  const dt = 1 / 60
  let apex = -Infinity
  let bounced = false
  let prevVy = 0
  for (let i = 0; i < 400; i++) {
    world.step(dt)
    if (ball.velocity.y > 0) bounced = true
    if (bounced && prevVy > 0 && ball.velocity.y <= 0) {
      apex = ball.position.y - r
      break
    }
    prevVy = ball.velocity.y
  }
  console.log(`bounce e=${e} h=${h}: apex=${apex.toFixed(4)} err=${(((apex - h) / h) * 100).toFixed(2)}%`)
  if (e === 0) {
    for (let i = 0; i < 300; i++) world.step(dt)
    console.log(`  rest: y=${(ball.position.y - r).toFixed(5)} vy=${ball.velocity.y.toFixed(6)}`)
  }
}

function ramp(mu: number) {
  const world = new World({ allowSleep: false })
  const angle = (20 * Math.PI) / 180
  world.createBody(makeBox(10, 0.5), { type: 'static', position: { x: 0, y: 0 }, angle, friction: mu })
  // place box resting on ramp surface at x=0
  const half = 0.5
  const n = new Vec2(-Math.sin(angle), Math.cos(angle))
  const pos = n.scale(0.5 + half)
  const box = world.createBody(makeBox(half, half), { position: pos, angle, friction: mu, restitution: 0 })
  const start = box.position.clone()
  const dt = 1 / 60
  for (let i = 0; i < 300; i++) world.step(dt)
  const d = Vec2.distance(start, box.position)
  console.log(`ramp mu=${mu}: moved=${d.toFixed(5)} v=${box.velocity.length().toFixed(4)}`)
}

function distance() {
  const world = new World({ allowSleep: false })
  const anchor = world.createBody(makeCircle(0.2), { type: 'static', position: { x: 0, y: 10 } })
  const ball = world.createBody(makeCircle(0.5), { position: { x: 3, y: 10 } })
  const j = new DistanceJoint({ bodyA: anchor, bodyB: ball, length: 3 })
  world.addJoint(j)
  let maxErr = 0
  for (let i = 0; i < 300; i++) {
    world.step(1 / 60)
    maxErr = Math.max(maxErr, Math.abs(j.currentLength() - 3) / 3)
  }
  console.log(`distance: final err=${(Math.abs(j.currentLength() - 3) / 3 * 100).toFixed(3)}% max=${(maxErr * 100).toFixed(3)}%`)
}

function pendulum() {
  const world = new World({ allowSleep: false })
  const anchor = world.createBody(makeCircle(0.2), { type: 'static', position: { x: 0, y: 10 } })
  const bob = world.createBody(makeBox(0.3, 0.3), { position: { x: 3, y: 10 } })
  const j = new RevoluteJoint({ bodyA: anchor, bodyB: bob, anchor: new Vec2(0, 10) })
  world.addJoint(j)
  const e0 = world.totalEnergy()
  let maxE = -Infinity
  let maxSep = 0
  for (let i = 0; i < 600; i++) {
    world.step(1 / 60)
    maxE = Math.max(maxE, world.totalEnergy())
    maxSep = Math.max(maxSep, j.separation())
  }
  console.log(`pendulum: e0=${e0.toFixed(3)} eEnd=${world.totalEnergy().toFixed(3)} maxE=${maxE.toFixed(3)} maxSep=${maxSep.toFixed(5)}`)
}

pyramid(10, false)
pyramid(10, true)
bounce(1, 1)
bounce(1, 3)
bounce(1, 5)
bounce(0, 3)
ramp(0.8)
ramp(0)
distance()
pendulum()
