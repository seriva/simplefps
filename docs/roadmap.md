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
| [Rendering Performance](v0.0.3/rendering-performance-plan.md) | Medium | Done | Two-level BVH, light contribution culling, skip shadow blur when idle, priority-queue shadow budget, compact light UBO layout |
| [Ambient Probe Acceleration](v0.0.3/ambient-probe-plan.md) | Low | Done | Verified in lightgrid.js; O(1) 3D grid cell lookup with trilinear interpolation and per-frame caching |
| [Transparent Sorting](v0.0.3/transparent-sorting-plan.md) | Low | Done | Back-to-front depth sort landed in renderpasses.js; sort entry pooling and early-out tracked in Code Review Quick Wins (B2, B3) |
| [Fixed Timestep Physics](v0.0.3/fixed-timestep-plan.md) | Medium | Done | 120 Hz accumulator decouples simulation from refresh rate; frame-rate-invariant jump height and movement, prerequisite for consistent P2P simulation |
| [Code Review & Engine Improvements](v0.0.3/code-review-quick-wins-plan.md) | Medium | Done | Engine review fixes across Rounds 1 & 2: backend GL/WebGPU optimizations, architecture/facade integrity, skinned animation, particle leaks, cull state, WebGPU near culling, audio cache, and zero-allocation hot paths |

---

## [v0.0.4]

| Feature | Difficulty | Status | Notes |
|---|---|---|---|
| [G-Buffer Depth Reconstruction](v0.0.4/gbuffer-depth-reconstruction-plan.md) | Medium | Planned | Reconstruct world/view position from depth buffer; eliminates 16-byte worldPosition render target to cut mobile memory bandwidth |
---

## Out of scope

Dedicated game server, matchmaking, anti-cheat, or any server-side infrastructure.
The game is intentionally fully P2P with no backend.
