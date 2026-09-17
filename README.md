# Impulse Physics

A from-scratch 2D rigid-body physics engine with SAT collision, sequential-impulse solving, and joints — wrapped in an interactive playground.

## What’s in it

- Rigid bodies with position / velocity / angular velocity
- Separating Axis Theorem (SAT) collision detection
- Sequential impulse solver for contacts and joints
- Interactive canvas so you can drop, drag, and watch the simulation

No third-party physics library. The interesting parts are the collision and constraint solver, not the UI shell.

## Status

Core engine is the focus. The default Vite scaffold is gone from the README; the project itself is still being tightened.

## Run

```bash
npm install
npm run dev
npm test
npm run build
```

## License

MIT
