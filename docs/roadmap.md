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
| [Physics Improvements](v0.0.3/physics-improvements-plan.md) | Medium | Done | Iterative wall sliding, Quake-style step-climbing, 8-directional depenetration, raycasting micro-opts, raycastStatic/Dynamic split |
| [Rendering Performance](v0.0.3/rendering-performance-plan.md) | Medium | Planned | Depth-reconstructed world position, two-level BVH, light contribution culling, skip shadow blur when idle, priority-queue shadow budget, compact light UBO layout |
| [Ambient Probe Acceleration](v0.0.3/ambient-probe-plan.md) | Low | Planned | O(1) probe lookup via grid cell index or spatial acceleration grid; eliminates linear scan per entity per frame |
| [Transparent Sorting](v0.0.3/transparent-sorting-plan.md) | Low | Planned | Back-to-front sort of glass/transparent draw calls; fixes incorrect blending for ≥3 overlapping surfaces |
| [Worker Asset Parsing](v0.0.3/worker-asset-parsing-plan.md) | High | Planned | Parse binary meshes/animations in a Web Worker via Transferable ArrayBuffers; unblocks main thread during load |

---

## Out of scope

Dedicated game server, matchmaking, anti-cheat, or any server-side infrastructure.
The game is intentionally fully P2P with no backend.
