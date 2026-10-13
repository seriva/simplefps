# WASM v1.6.1 Gap Adoption — Design Plan

**Version:** continuous  
**Status:** Draft  

---

## Goal

Adopt the newly available WebAssembly capabilities and gap closures from GoFront v1.6.1 across SimpleFPS. This leverages pure-Go WASM stdlib expansions (`math/rand` with inline PRNG, `slices`, `encoding/binary`), compile-time constant folding, boundary `error` marshalling, pure WASM asset decoding, and array-typed map keys in the engine's WASM packages (`engine/physics`, `engine/collision`, `engine/animation`, `engine/assets`), while strictly maintaining the project's zero-allocation hot-path performance invariant (128 B/frame at 120 Hz).

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
- *Note:* Ensure constants used are supported by the GoFront checker's registered math constants.

### 2. Move Projectile Simulation & Dispersion into WASM (`engine/physics`)
Currently, [`projectiles.go`](file:///home/coder/workspace/simplefps/app/src/game/projectiles.go) performs spark burst calculations, explosion scatter, and weapon spread in JavaScript.
- Move projectile dispersion and spark velocity calculations into `engine/physics/dynamicbody.go` or a dedicated physics projectile helper.
- **Prerequisite:** Depends on GoFront closing the pure inline PRNG gap in WASM. Current GoFront WASM delegates `rand.Float32()` to JS `Math.random` across a host call on every invocation (causing ~100 boundary hops per explosion) and leaves `rand.Seed` as a no-op. Once the inline PRNG is available, projectile randomness will run host-call-free and support deterministic seeding.

### 3. Native `slices` Adoption (`engine/collision`, `engine/physics`)
GoFront v1.6.1 provides pure inline WASM implementations for the `slices` standard library:
- Replace manual linear search and sort routines (e.g. candidate filtering, nearest checks) with `slices.Contains`, `slices.Index`, `slices.SortFunc`, `slices.Min`, `slices.Max`.
- Verify code generation compiles to inline WASM without boundary crossings.

### 4. Boundary Error Handling (`engine/collision`, `engine/physics`)
Previously, methods crossing the JS/WASM boundary could not return Go `error` values.
- Allow collision asset decoders and Trimesh/Octree constructors to return idiomatic `error` values across the boundary.
- JS callers receive native `Error` instances with `.message` preservation and `errors.Is` support.

### 5. Static Broad-Phase Spatial Hashing (`engine/collision`)
GoFront v1.6.1 supports array-typed map keys (e.g. `map[[3]int32]T`) in WASM:
- Prototype spatial grid indexing using `[3]int32` discrete voxel coordinates for static world geometry broadphase culling, complementing or replacing Octree traversal where advantageous.
- **Memory Discipline:** In WasmGC, map inserts allocate entry nodes on the heap. Spatial hashing using `map` must be restricted to **load-time static geometry**. Dynamic 120 Hz per-frame lookups must avoid map mutations to preserve the 128 B/frame budget (using pre-allocated flat arrays/buffers instead).

### 6. Port `BinaryReader` & Asset Decoders to Pure WASM (`engine/assets`)
Currently, [`binaryreader.go`](file:///home/coder/workspace/simplefps/app/src/engine/assets/binaryreader.go) relies on JS interop (`DataView` and `Reflect.construct`), trapping model and animation decoding in JavaScript.
- Once GoFront implements `encoding/binary` (`binary.LittleEndian`), rewrite `BinaryReader` in pure Go without `js:./interop.d.ts`.
- Move binary mesh (`.bmesh`, `.sbmesh`) and skeletal animation (`.banim`) parsing to WASM (`//gofront:target wasm`) for fast native asset loading.

### 7. Value-Struct Returns & Out-Parameter Discipline (`engine/mathx`)
- GoFront's codegen fix avoids duplicate cloning (`emitCloneStruct`) when assigning return values of functions (`CallExpr`).
- Intermediate math calls returning value structs (`Vec3`) no longer pay double-allocation penalties.
- However, for the 120 Hz hot path (controller and raycasting), mutable out-parameters (`out *Vec3`) must remain the standard to maintain 0-byte allocations.

### 8. Binaryen Optimization Pipeline (`--closed-world`, `--traps-never-happen`)
- Leverage the enhanced Binaryen pipeline (`--closed-world`, `--traps-never-happen`) in `gofront build --release`.
- Verify module size reduction beyond the current 79.7 kB baseline and ensure boundary bindings remain intact.

---

## Edge Cases

- **Zero-Allocation Hot-Path Guard:** Every change to the 120 Hz controller loop and raycasting must pass [`tests/perf/zero-alloc.js`](file:///home/coder/workspace/simplefps/tests/perf/zero-alloc.js) under the 128 B/frame budget.
- **No Dynamic Map Mutations in Hot Paths:** `map[[3]int32]T` must never be populated during the frame loop.
- **Randomness Host Call Hazard:** Avoid moving particle random generation to WASM until the pure inline PRNG is confirmed in the GoFront build.
- **Boundary Marshalling:** Avoid passing maps or structs by value across the frame boundary. Large data must continue to use out-parameters or `gofront/shared` buffers.
- **Float Precision in Constant Folding:** Ensure compile-time folded constants in WASM match 32-bit floating point precision identically to previous manual literals.

---

## Implementation Tasks

- [ ] **Phase 1: Const Expression Cleanup**
  - [ ] Replace precomputed literals in [`fpscontroller.go`](file:///home/coder/workspace/simplefps/app/src/engine/physics/fpscontroller.go) with constant expressions (`Gravity`, damping factors).
  - [ ] Replace magic numeric literals in [`ray.go`](file:///home/coder/workspace/simplefps/app/src/engine/collision/ray.go).
  - [ ] Verify `mathx [wasm]`, `collision [wasm]`, and `physics [wasm]` unit tests pass.

- [ ] **Phase 2: Projectile Simulation & Randomness in WASM**
  - [ ] Prerequisite: Verify GoFront provides inline pure PRNG with working `rand.Seed` (no host `Math.random` imports).
  - [ ] Implement projectile burst/dispersion calculation in `engine/physics/dynamicbody.go` using `math/rand`.
  - [ ] Wire [`projectiles.go`](file:///home/coder/workspace/simplefps/app/src/game/projectiles.go) to use WASM projectile helpers without boundary hops per particle.
  - [ ] Verify deterministic particle emission and benchmark performance.

- [ ] **Phase 3: `slices` Standard Library Adoption**
  - [ ] Adopt `slices.Contains`, `slices.Index`, and `slices.Min`/`Max` in `engine/collision` queries.
  - [ ] Replace custom sorting loops in non-allocating candidate lists where applicable.

- [ ] **Phase 4: Boundary Error Handling**
  - [ ] Update `collision.NewTrimesh` / validation routines to return `error` across the boundary.
  - [ ] Verify JS callers in `engine/scene` handle returned errors gracefully.

- [ ] **Phase 5: Static Spatial Hashing Prototype**
  - [ ] Prototype `map[[3]int32][]int` voxel broadphase for static triangle/body lookups at load time.
  - [ ] Ensure zero map allocations during the runtime tick loop.
  - [ ] Benchmark against existing Octree traversal.

- [ ] **Phase 6: Port Asset Loading (`BinaryReader`) to Pure WASM**
  - [ ] Prerequisite: GoFront `encoding/binary` support.
  - [ ] Rewrite `engine/assets/binaryreader.go` using pure `binary.LittleEndian`, removing `DataView` and `js:./interop.d.ts`.
  - [ ] Mark binary mesh (`.bmesh`, `.sbmesh`) and skeletal animation (`.banim`) loaders as `wasm`.
  - [ ] Measure load-time speedup on character and map assets.

- [ ] **Phase 7: Optimization Pipeline Verification & Benchmarking**
  - [ ] Run full test suites (`npm test`, `npm run test:dom`, `npm run test:e2e`).
  - [ ] Run `npm run test:perf` (`zero-alloc.js`) and `npm run bench` (`js-vs-wasm.js`) to verify zero degradation.
  - [ ] Measure release bundle size with `--release` and verify Binaryen `--closed-world` optimization.

---

## Test Plan

- **Unit:**
  - `gofront test app/src/engine/physics/...`
  - `gofront test app/src/engine/collision/...`
  - `gofront test app/src/engine/animation/...`
  - `gofront test app/src/engine/assets/...`
- **Performance & Regressions:**
  - `npm run test:perf`: `tests/perf/zero-alloc.js` (100k raycasts under 64 KB, 20k controller frames under 128 B/frame).
  - `npm run bench`: `tests/perf/js-vs-wasm.js` (ensure hybrid/JS ratios remain ≥ 1.25× raycast, ≥ 2.5× controller).
- **Integration & E2E:**
  - `npm run test:e2e`: Playwright smoke test.
  - `npm run check`: Biome + `gofront check app/src/...`.
