# Impulse Physics

**A 2D rigid-body physics engine built from scratch in TypeScript, featuring Separating Axis Theorem (SAT) collision detection, sequential-impulse constraint solving, and contact manifold generation.**

Impulse is a zero-dependency physics engine written from fundamental mathematical principles. It implements numerical integration, polygon collision manifolds, friction, restitution, and positional stabilization without relying on external libraries (such as Matter.js or Box2D).

---

## Engine Architecture

```
Simulation Step (dt)
    │
    ▼ [Broadphase]          Axis-Aligned Bounding Box (AABB) culling
    │
    ▼ [Narrowphase (SAT)]   Separating Axis Theorem + Contact Manifold generation
    │
    ▼ [Warm Starting]       Apply accumulated impulses from previous frame
    │
    ▼ [Velocity Solver]     Sequential impulse iterations for normal & tangent (friction)
    │
    ▼ [Integration]         Semi-implicit Euler integration: x' = x + v * dt
    │
    ▼ [Position Solver]     Baumgarte stabilization / pseudo-velocity position correction
```

### 1. Collision Detection: Separating Axis Theorem (SAT)
- Evaluates overlap along all face normals of both convex polygons.
- Finds the **Minimum Translation Vector (MTV)** specifying the axis and depth of minimal penetration.
- Generates a **Contact Manifold** (1 or 2 contact points) by clipping incident polygon edges against reference edges.

### 2. Constraint Solving: Sequential Impulses
- Formulates non-penetration and Coulomb friction as velocity constraints:
  $$J v + b = 0$$
- Solves normal impulses sequentially using iterative Projected Gauss-Seidel (PGS).
- Applies clamping to prevent negative impulses (bodies cannot pull on each other).
- Friction is solved along the tangent axis, clamped according to Coulomb's law:
  $$|J_t| \le \mu |J_n|$$

### 3. Penetration & Stability (Baumgarte vs. Position Projections)
- High-velocity impacts and stacking stability are stabilized using Baumgarte stabilization factor $\beta \approx 0.2$ and a small penetration slop threshold to eliminate jitter while preventing sinking under gravity.

---

## Architectural Decision Records (ADRs)

### ADR 1: Sequential Impulses vs. Penalty Methods
* **Context:** Rigid-body contact resolution can be implemented via penalty forces (spring-damper models) or constraint impulses.
* **Decision:** Implement a sequential impulse solver (Velocity-level Linear Complementarity Problem).
* **Rationale:** Penalty methods require extremely small timesteps ($dt < 0.001\text{s}$) to avoid explosive instability under high restitution or heavy stacking. Sequential impulses remain stable at 60 Hz ($dt = 1/60\text{s}$) with multiple iterations.

### ADR 2: Semi-Implicit Euler vs. Explicit Euler
* **Context:** Numerical integration technique for updating velocities and positions.
* **Decision:** Semi-implicit Euler ($v_{t+1} = v_t + a \cdot dt$, $x_{t+1} = x_t + v_{t+1} \cdot dt$).
* **Rationale:** Explicit Euler gains artificial kinetic energy over time, causing orbits and pendulums to spiral outward. Semi-implicit Euler is symplectic (conserves phase space volume) and provides long-term energy stability at zero computational penalty.

---

## Running Locally

```bash
npm install
npm test          # Runs collision, manifold, and solver tests
npm run dev       # Starts interactive canvas physics sandbox
npm run build     # Production build
```

## License

MIT
