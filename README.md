# Impulse Physics

A TypeScript 2D rigid-body simulation with an interactive canvas sandbox. It supports circles, convex polygons, contact friction, restitution and distance, revolute and mouse joints.

The production modules in [src/engine](src/engine) have no external imports. The sandbox uses React, Zustand and Vite. Collision detection and constraint solving are implemented in this repository.

---

## Engine Architecture

```
Simulation Step (dt)
    │
    ▼ [Broadphase]          Rebuild a spatial hash; collect overlapping AABB pairs
    │
    ▼ [Narrowphase]         SAT/clipping for polygons; circle contact routines
    │
    ▼ [Forces]              Sample restitution, then integrate forces into velocity
    │
    ▼ [Pre-step]            Compute constraint biases and apply cached impulses
    │
    ▼ [Velocity Solver]     Iterate joints, then contact friction and normal impulses
    │
    ▼ [Integration]         Clamp speeds; update positions and angles
    │
    ▼ [Sleeping]            Update connected islands and sleep state
```

See [World.step](src/engine/world.ts) for the order of operations. Penetration correction enters the velocity solve as a Baumgarte bias; there is no separate position-projection pass.

### 1. Collision Detection: Separating Axis Theorem (SAT)

- Evaluates overlap along all face normals of both convex polygons.
- Finds the **Minimum Translation Vector (MTV)** specifying the axis and depth of minimal penetration.
- Generates a **Contact Manifold** (1 or 2 contact points) by clipping incident polygon edges against reference edges.

### 2. Constraint Solving: Sequential Impulses

- Uses contact-relative velocity, effective mass and a target separating velocity to compute impulse changes.
- Solves normal impulses sequentially using iterative Projected Gauss-Seidel (PGS).
- Applies clamping to prevent negative impulses (bodies cannot pull on each other).
- Friction is solved along the tangent axis, clamped according to Coulomb's law:
  $$|J_t| \le \mu |J_n|$$

### 3. Penetration correction

- The default Baumgarte factor is `0.2`, with penetration slop `0.005` world units. [Contact.preStep](src/engine/contact.ts) computes `positionBias = beta / dt * max(penetration - slop, 0)` and uses the larger of this bias and the restitution target. This reduces overlap through velocity impulses; it does not guarantee jitter-free stacks or prevent tunnelling.

---

## Implementation notes

### Cached impulses and iteration count

Contact points retain normal and tangent impulses when their feature IDs match across steps. Reapplying these impulses gives the iterative solver a starting estimate. The default is 10 velocity iterations at a `1/60` second timestep in the sandbox. More iterations increase work per step; stability also depends on the scene, masses, speeds and timestep.

### Integration and restitution

Forces update velocities before velocities update positions. Contact and joint impulses, damping and speed clamps also change velocity, so the complete simulation is not an energy-conserving integrator. Restitution samples approach speed before gravity is applied, and its target is combined with penetration correction using a maximum rather than a sum. The [world tests](src/engine/world.test.ts) include ball rebounds, friction on a ramp, a 55-box pyramid and joint constraints; these are specific fixtures, not guarantees for arbitrary scenes.

## Current limits

- Shapes are circles or convex polygons with at most 16 vertices. `makePolygon` takes a convex hull, so concave input loses its indentations; it is not decomposed into multiple shapes. See [shapes.ts](src/engine/shapes.ts).
- Collision detection is discrete. A fast body can cross a thin obstacle between steps; the speed clamp does not provide continuous collision detection.
- The [sandbox](src/app/sandbox.ts) configures the fixed-step loop to allow at most six catch-up steps per rendered frame. The [loop](src/engine/loop.ts) discards remaining accumulated time after reaching that cap. Under sustained load, simulated time can fall behind elapsed time.
- The benchmark measures headless simulation, excluding canvas rendering and UI work. Its 3-second budget for 300 steps with 500 dynamic bodies is a script threshold, not a published performance result.

---

## Running Locally

```bash
npm install
npm test          # Runs collision, manifold, and solver tests
npm run dev       # Starts interactive canvas physics sandbox
npm run build     # Production build
npm run bench     # Headless mixed-body and preset-scene benchmark
```

## License

MIT
