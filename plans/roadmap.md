# SimpleFPS Roadmap

The guiding principle is **zero dependencies on the hot path** — rendering, physics, and
game logic run on pre-allocated buffers with no per-frame allocations.

Design documents for planned features live in `plans/`
(e.g. `plans/<feature>-plan.md`). Completed plans stay in place with `Status: Completed`.

---

## Upcoming

| Feature | Difficulty | Status | Notes |
|---|---|---|---|
| [GoFront v1.8.0 Adoption](gofront-v1.8.0-adoption-plan.md) | Medium | Draft | Blocked on the v1.8.0 tag (SIMD Skinning's A/B harness is in). Bump behind JS/WASM perf gates: landed strict-mode checks make `mathx` JS 3.0× slower on `Mat4Multiply` (GoFront `e3a1a62`), so the bump also needs an upstream elision fix; hybrid A/B and zero-alloc already pass. Builtin `min`/`max` in `collision`; drop stale field-pointer workaround |
| [SIMD Collision](simd-collision-plan.md) | High | Draft | After the v1.8.0 adoption: per-voxel SoA triangle packets with front-to-back early-out (2.28× kernel, triangle tests ≈ 45% of a cast); gate ≥ 1.15× raycast |
| [G-Buffer Depth Reconstruction](gbuffer-depth-reconstruction-plan.md) | Medium | Planned | Reconstruct world/view position from depth buffer; eliminates 16-byte worldPosition render target to cut mobile memory bandwidth |

---

## Completed

Plans for the legacy ES6 engine were removed with the GoFront rewrite; their outcomes are
summarised in `CHANGELOG.md` under *2026-09 — Legacy JavaScript engine*.

| Feature | Difficulty | Status | Notes |
|---|---|---|---|
| [Typed UI Layer](typed-ui-plan.md) | Low | Completed (2026-10) | Menus are a `MenuID` int enum: a string literal fails `gofront check`, and `changestate` names go through `menuFromName`, which warns on an unknown name. Action and setting-id constants are shared by `menus.templ` and `ui.go`; templ expressions are not type-checked, so the drift tests cover that side. The DOM values in `game` use `.d.ts` `UI*` interfaces, so a member typo fails `check` and no `.(string)`/`.(float64)` assertions remain. Drift tests cover refs, translation keys and actions. `app.js` 642,547 → 641,848 B. `engine/systems` DOM is deferred |
| [SLOC Reduction](sloc-reduction-plan.md) | Low | Completed (2026-10) | Deleted code with no callers (mostly unused `mathx`), merged the duplicated ray/AABB slab test, collapsed the three `newSpatialHash` axis sweeps into one helper behind a grid-identity test; non-test `app/src` 20,862 → 19,969 lines (−893), `app.js` 659,152 → 645,653 B, `app.wasm` 103,648 → 93,839 B; every A/B entry 0.96–1.07×; demo-arena `NewTrimesh` ≈ 15% slower (≈ 0.57 → 0.67 ms, load time only). Flat grid and `min3`/`max3` kept for the follow-up plans |
| [SIMD Skinning & Perf Harness](simd-skinning-plan.md) | Medium | Completed (2026-10) | In-process A/B perf harness (`tests/perf/ab.js`, per-entry `--gate`), SIMD-only-in-WASM check, SIMD kernel canary; skinning world chain and palette on `F32x4` column packets: skinning-total 2.08×, bit-identical, 0.15 B/frame; `ComputeSkinningMatrices` is void (`SkinJointCount()`). Follow-ups listed in the plan |
| [WASM Deferred Features](wasm-deferred-features-plan.md) | Medium | Completed (2026-10) | Adopted static voxel broadphase (14.8× raycast speedup, Octree removed) and pure WASM asset decoders (`assets/decoder`, 14–17× speedup); spark/projectile batching dropped (already WebGPU compute-native) |
| [WASM v1.6.1 Gap Adoption](wasm-v1.6.1-adoption-plan.md) | Medium | Completed (2026-10) | Adopted GoFront v1.6.1 WASM capabilities: const expressions (`fpscontroller.go`, `ray.go`, `mathx.DegToRad`), boundary `error` handling in `collision` & `scene`, `slices.Contains`, Binaryen release optimizations (80.1 kB wasm, 0.1 B/frame zero-alloc verified). Deferred items moved to follow-up plan. |
| WebAssembly Physics Migration | Medium | Completed (2026-10) | `physics` (`FPSController`, `DynamicBody`) and `animation` (skinning via a `gofront/shared` bone buffer) run in WASM next to `collision`; `BinaryReader` and `ParseBinaryAnimation` moved to `assets`; `npm run bench` compares `--js-only` vs hybrid: raycasts ≈1.15×, controller step ≈2.4×, skinning ≈1.2×, `app.wasm` ≈100 → ≈80 kB with `--release` |
| [WebGPU Migration & Architecture Restructuring](remove-webgl-plan.md) | High | Completed (2026-10) | WebGL2 backend removed; `rendering` is WebGPU-native: typed `Backend`, explicit render passes, pre-baked pipelines, 4-slot bind groups with `ObjectData`/bone rings, storage-buffer lights and skinning, compute particles and Kawase blur; `rendering/fakegpu` test device |
| WebAssembly Collision Split | Medium | Completed (2026-10) | Split `mathx` (both) and `collision` (wasm) into WebAssembly via GoFront 1.5.1; Möller–Trumbore raycast benchmark reaches 31,293 rays/s (1.17× JS) with 0.86 B/ray; zero-alloc test passed |
| [GoFront Rewrite](gofront-rewrite-plan.md) | High | Completed (2026-10) | All engine and game packages ported from ES6 to GoFront `.go`/`.templ`; legacy JS deleted; `main.go` boot; recursive `gofront check/test app/src/...`; zero-alloc perf benchmark and Playwright smoke test |
| [Engine Architecture Cleanup](engine-architecture-cleanup-plan.md) | Medium | Completed (2026-10) | Renderer alone owns pass order, shader selection and GPU state, pulling per-frame data through `rendering.SceneSource`; `scene` is pure data (culling, spatial queries, entity lifetime) |
| Physics Improvements | Medium | Completed (2026-09) | Iterative wall sliding, Quake-style step-climbing, 8-directional depenetration, raycasting micro-opts, raycastStatic/Dynamic split |
| Rendering Performance | Medium | Completed (2026-09) | Two-level BVH, light contribution culling, skip shadow blur when idle, priority-queue shadow budget, compact light UBO layout |
| Ambient Probe Acceleration | Low | Completed (2026-09) | Verified in `scene/lightgrid.go`; O(1) 3D grid cell lookup with trilinear interpolation and per-frame caching |
| Transparent Sorting | Low | Completed (2026-09) | Back-to-front depth sort landed in `scene/drawlists.go` |
| Fixed Timestep Physics | Medium | Completed (2026-09) | 120 Hz accumulator decouples simulation from refresh rate; frame-rate-invariant jump height and movement, prerequisite for consistent P2P simulation |
| Code Review & Engine Improvements | Medium | Completed (2026-09) | Engine review fixes across Rounds 1 & 2: backend GL/WebGPU optimizations, architecture/facade integrity, skinned animation, particle leaks, cull state, WebGPU near culling, audio cache, and zero-allocation hot paths |

---

## Out of scope

Dedicated game server, matchmaking, anti-cheat, or any server-side infrastructure.
The game is intentionally fully P2P with no backend.
