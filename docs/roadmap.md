# SimpleFPS Roadmap

The guiding principle is **zero dependencies on the hot path** — rendering, physics, and
game logic run on pre-allocated buffers with no per-frame allocations.

Design documents for planned features live in `docs/plans/`
(e.g. `docs/plans/<feature>-plan.md`). Completed plans are moved to `docs/plans/archive/`.

---

## Upcoming

| Feature | Difficulty | Status | Notes |
|---|---|---|---|
| [G-Buffer Depth Reconstruction](plans/gbuffer-depth-reconstruction-plan.md) | Medium | Planned | Reconstruct world/view position from depth buffer; eliminates 16-byte worldPosition render target to cut mobile memory bandwidth |

---

## Completed

| Feature | Difficulty | Status | Notes |
|---------|------------|--------|-------|
| [Physics Improvements](plans/archive/physics-improvements-plan.md) | Medium | Completed (2026-09) | Iterative wall sliding, Quake-style step-climbing, 8-directional depenetration, raycasting micro-opts, raycastStatic/Dynamic split |
| [Rendering Performance](plans/archive/rendering-performance-plan.md) | Medium | Completed (2026-09) | Two-level BVH, light contribution culling, skip shadow blur when idle, priority-queue shadow budget, compact light UBO layout |
| [Ambient Probe Acceleration](plans/archive/ambient-probe-plan.md) | Low | Completed (2026-09) | Verified in lightgrid.js; O(1) 3D grid cell lookup with trilinear interpolation and per-frame caching |
| [Transparent Sorting](plans/archive/transparent-sorting-plan.md) | Low | Completed (2026-09) | Back-to-front depth sort landed in renderpasses.js; sort entry pooling and early-out tracked in Code Review Quick Wins (B2, B3) |
| [Fixed Timestep Physics](plans/archive/fixed-timestep-plan.md) | Medium | Completed (2026-09) | 120 Hz accumulator decouples simulation from refresh rate; frame-rate-invariant jump height and movement, prerequisite for consistent P2P simulation |
| [Code Review & Engine Improvements](plans/archive/code-review-quick-wins-plan.md) | Medium | Completed (2026-09) | Engine review fixes across Rounds 1 & 2: backend GL/WebGPU optimizations, architecture/facade integrity, skinned animation, particle leaks, cull state, WebGPU near culling, audio cache, and zero-allocation hot paths |
---

## Out of scope

Dedicated game server, matchmaking, anti-cheat, or any server-side infrastructure.
The game is intentionally fully P2P with no backend.
