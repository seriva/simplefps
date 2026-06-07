# SimpleFPS Roadmap

The guiding principle is **zero dependencies on the hot path** — rendering, physics, and
game logic run on pre-allocated buffers with no per-frame allocations.

Each release has a subfolder in `docs/` containing design documents for the planned
features (e.g. `docs/v0.0.3/`).

---

## [v0.0.3]

**Theme: Physics & Performance**

| Feature | Difficulty | Status | Notes |
|---------|------------|--------|-------|
| [Physics Improvements](v0.0.3/physics-improvements-plan.md) | Medium | Planned | Iterative wall sliding, Quake-style step-climbing, and 8-directional depenetration |
| [Raycasting Engine Optimizations](v0.0.3/physics-improvements-plan.md#4-raycasting-engine-optimizations) | Medium | Planned | Identity fast path, closest hit truncation, and redundant vec3.sqrDist elimination |

---

## Out of scope

Dedicated game server, matchmaking, anti-cheat, or any server-side infrastructure.
The game is intentionally fully P2P with no backend.
