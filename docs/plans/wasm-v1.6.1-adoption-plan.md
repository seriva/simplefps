# WASM v1.6.1 Gap Adoption — Design Plan

**Version:** continuous
**Status:** Draft

---

## Goal

Adopt the newly available WebAssembly capabilities from GoFront v1.6.1 across SimpleFPS. This leverages pure-Go WASM stdlib expansions (`math/rand`, `slices`), compile-time constant folding, boundary `error` marshalling, and array-typed map keys in the engine's WASM packages (`engine/physics`, `engine/collision`, `engine/animation`), while maintaining the project's strict zero-allocation hot-path performance invariant.

---

## Out of Scope

- **Moving WebGPU or rendering to WASM.** Rendering stays in JavaScript by architecture design (DOM, canvas, WebGPU pipeline state).
- **Moving UI (`.templ`, DOM, CSS) to WASM.** UI stays in JS/DOM.
- **Networking / WebRTC / PeerJS changes.** Networking remains in `systems.Network` on the JS side.
- **Async WASM operations.** WASM execution remains strictly synchronous.

---

## Approach

### 1. Non-Literal Package Constants (`engine/physics`, `engine/collision`)
GoFront v1.6.0 required numeric constants in WASM packages to be typed literals, forcing hand-calculated magic numbers (e.g. `Gravity float32 = 785.6 // 9.82 * 80`).
- Restore idiomatic compile-time constant expressions in [`fpscontroller.go`](file:///home/coder/workspace/simplefps/app/src/engine/physics/fpscontroller.go) and [`ray.go`](file:///home/coder/workspace/simplefps/app/src/engine/collision/ray.go).
- Define constants with expressions: `Gravity = 9.82 * 80`, damping rates, angle radians (`math.Pi / 180`).

### 2. Move Projectile Simulation & Dispersion into WASM (`engine/physics`)
Currently, [`projectiles.go`](file:///home/coder/workspace/simplefps/app/src/game/projectiles.go) performs spark burst calculations, explosion scatter, and weapon spread in JavaScript because `math/rand` was unavailable in WASM packages.
- Move projectile dispersion and spark velocity calculations into `engine/physics/dynamicbody.go` or a dedicated physics projectile helper.
- Utilize WASM-native `math/rand` (`rand.Float32()`, `rand.Intn()`) without host calls.

### 3. Native `slices` Adoption (`engine/collision`, `engine/physics`)
GoFront v1.6.1 provides pure inline WASM implementations for the `slices` standard library:
- Replace manual linear search and sort routines (e.g. candidate filtering, nearest checks) with `slices.Contains`, `slices.Index`, `slices.SortFunc`, `slices.Min`, `slices.Max`.
- Verify code generation compiles to inline WASM without boundary crossings.

### 4. Boundary Error Handling (`engine/collision`, `engine/physics`)
Previously, methods crossing the JS/WASM boundary could not return Go `error` values.
- Allow collision asset decoders and Trimesh/Octree constructors to return idiomatic `error` values.
- JS callers receive native `Error` instances with `.message` preservation and `errors.Is` support.

### 5. Array-Keyed Maps for Broad-Phase Spatial Hashing (`engine/collision`)
GoFront v1.6.1 supports array-typed map keys (e.g. `map[[3]int32]T`) in WASM:
- Prototype spatial grid indexing using `[3]int32` discrete voxel coordinates for dynamic entity broadphase culling, replacing or complementing octree queries where dynamic insertions occur.

---

## Edge Cases

- **Zero-Allocation Hot-Path Guard:** Every change to the 120 Hz controller loop and raycasting must pass [`tests/perf/zero-alloc.js`](file:///home/coder/workspace/simplefps/tests/perf/zero-alloc.js) under the 128 B/frame budget.
- **Boundary Marshalling:** Avoid passing maps or structs by value across the frame boundary. Large data must continue to use out-parameters or `gofront/shared` buffers.
- **Float Precision in Constant Folding:** Ensure compile-time folded constants in WASM match 32-bit floating point precision identically to previous manual literals.

---

## Implementation Tasks

- [ ] **Phase 1: Const Expression Cleanup**
  - [ ] Replace precomputed literals in [`fpscontroller.go`](file:///home/coder/workspace/simplefps/app/src/engine/physics/fpscontroller.go) with constant expressions (`Gravity`, damping factors).
  - [ ] Replace magic numeric literals in [`ray.go`](file:///home/coder/workspace/simplefps/app/src/engine/collision/ray.go).
  - [ ] Verify `mathx [wasm]`, `collision [wasm]`, and `physics [wasm]` unit tests pass.

- [ ] **Phase 2: Projectile Simulation & Randomness in WASM**
  - [ ] Implement projectile burst/dispersion calculation in `engine/physics/dynamicbody.go` using `math/rand`.
  - [ ] Wire [`projectiles.go`](file:///home/coder/workspace/simplefps/app/src/game/projectiles.go) to use WASM projectile helpers.
  - [ ] Verify deterministic particle emission and benchmark performance.

- [ ] **Phase 3: `slices` Standard Library Adoption**
  - [ ] Adopt `slices.Contains`, `slices.Index`, and `slices.Min`/`Max` in `engine/collision` queries.
  - [ ] Replace custom sorting loops in non-allocating candidate lists where applicable.

- [ ] **Phase 4: Boundary Error Handling**
  - [ ] Update `collision.NewTrimesh` / validation routines to return `error` across the boundary.
  - [ ] Verify JS callers in `engine/scene` handle returned errors gracefully.

- [ ] **Phase 5: Spatial Hashing Prototype**
  - [ ] Prototype `map[[3]int32][]int` voxel broadphase for candidate triangle/body lookups.
  - [ ] Benchmark against existing Octree traversal.

- [ ] **Phase 6: Verification & Benchmarking**
  - [ ] Run full test suites (`npm test`, `npm run test:dom`, `npm run test:e2e`).
  - [ ] Run `npm run test:perf` (`zero-alloc.js`) and `npm run bench` (`js-vs-wasm.js`) to verify zero degradation.

---

## Test Plan

- **Unit:**
  - `gofront test app/src/engine/physics/...`
  - `gofront test app/src/engine/collision/...`
  - `gofront test app/src/engine/animation/...`
- **Performance & Regressions:**
  - `npm run test:perf`: `tests/perf/zero-alloc.js` (100k raycasts under 64 KB, 20k controller frames under 128 B/frame).
  - `npm run bench`: `tests/perf/js-vs-wasm.js` (ensure hybrid/JS ratios remain ≥ 1.25× raycast, ≥ 2.5× controller).
- **Integration & E2E:**
  - `npm run test:e2e`: Playwright smoke test.
  - `npm run check`: Biome + `gofront check app/src/...`.
