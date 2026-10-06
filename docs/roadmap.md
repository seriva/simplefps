# SimpleFPS Roadmap

The guiding principle is **zero dependencies on the hot path** — rendering, physics, and
game logic run on pre-allocated buffers with no per-frame allocations.

Design documents for planned features live in `docs/plans/`
(e.g. `docs/plans/<feature>-plan.md`). Completed plans are moved to `docs/plans/archive/`.

---

## Upcoming

| Feature | Difficulty | Status | Notes |
|---|---|---|---|
| [Engine Architecture Cleanup](plans/archive/engine-architecture-cleanup-plan.md) | Medium | Draft | Move the `rendering.SceneSource` seam so `scene` owns pass orchestration instead of `rendering` reaching back into the scene |
| WebAssembly Physics Migration | Medium | Planned | Move `FPSController` and `DynamicBody` into WebAssembly once GoFront v1.6 adds WASM closures/trampolines (e.g. `OnBounce` callbacks) |
| [G-Buffer Depth Reconstruction](plans/gbuffer-depth-reconstruction-plan.md) | Medium | Planned | Reconstruct world/view position from depth buffer; eliminates 16-byte worldPosition render target to cut mobile memory bandwidth |

---

## Completed

Plans for the legacy ES6 engine were removed with the GoFront rewrite; their outcomes are
summarised in `CHANGELOG.md` under *2026-09 — Legacy JavaScript engine*.

| Feature | Difficulty | Status | Notes |
|---------|------------|--------|-------|
| WebAssembly Collision Split | Medium | Completed (2026-10) | Split `mathx` (both) and `collision` (wasm) into WebAssembly via GoFront 1.5.1; Möller–Trumbore raycast benchmark reaches 31,293 rays/s (1.17× JS) with 0.86 B/ray; zero-alloc test passed |
| [GoFront Rewrite](plans/archive/gofront-rewrite-plan.md) | High | Completed (2026-10) | All engine and game packages ported from ES6 to GoFront `.go`/`.templ`; legacy JS deleted; `main.go` boot; recursive `gofront check/test app/src/...`; zero-alloc perf benchmark and Playwright smoke test |
| Physics Improvements | Medium | Completed (2026-09) | Iterative wall sliding, Quake-style step-climbing, 8-directional depenetration, raycasting micro-opts, raycastStatic/Dynamic split |
| Rendering Performance | Medium | Completed (2026-09) | Two-level BVH, light contribution culling, skip shadow blur when idle, priority-queue shadow budget, compact light UBO layout |
| Ambient Probe Acceleration | Low | Completed (2026-09) | Verified in `scene/lightgrid.go`; O(1) 3D grid cell lookup with trilinear interpolation and per-frame caching |
| Transparent Sorting | Low | Completed (2026-09) | Back-to-front depth sort landed in `scene/renderpasses.go`; sort entry pooling and early-out tracked in Code Review Quick Wins (B2, B3) |
| Fixed Timestep Physics | Medium | Completed (2026-09) | 120 Hz accumulator decouples simulation from refresh rate; frame-rate-invariant jump height and movement, prerequisite for consistent P2P simulation |
| Code Review & Engine Improvements | Medium | Completed (2026-09) | Engine review fixes across Rounds 1 & 2: backend GL/WebGPU optimizations, architecture/facade integrity, skinned animation, particle leaks, cull state, WebGPU near culling, audio cache, and zero-allocation hot paths |
---

## Out of scope

Dedicated game server, matchmaking, anti-cheat, or any server-side infrastructure.
The game is intentionally fully P2P with no backend.
