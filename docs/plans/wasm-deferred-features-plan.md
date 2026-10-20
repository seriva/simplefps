# WASM Deferred Features & Optimizations — Design Plan

**Version:** continuous  
**Status:** Planned  
**Depends on:** `archive/wasm-v1.6.1-adoption-plan.md`

---

## Goal

Address the performance and architecture features deferred during the initial GoFront v1.6.1 WASM gap adoption. This covers:
1. Batching projectile simulation, dispersion, and spark velocity calculations in WASM via shared linear memory, eliminating host-boundary hops.
2. Benchmarking and prototyping static broadphase spatial hashing (`map[[3]int32]T` or flat voxel grids) against Octree traversal for world geometry queries without violating the 120 Hz zero-allocation invariant.
3. Migrating `BinaryReader` and the binary asset decoding pipeline (`.bmesh`, `.sbmesh`, `.banim`) from JS DataView interop to pure Go WASM with `encoding/binary`.

---

## Out of Scope

- **Moving WebGPU or rendering to WASM.** Rendering pipeline state, shaders, and canvas management remain in JavaScript.
- **Dynamic map mutations on the hot path.** GoFront WasmGC map mutations allocate entry nodes on the heap; runtime maps in 120 Hz frame loops remain strictly forbidden.
- **Networking / PeerJS changes.** Multiplayer signalling and packet deserialization remain in `systems.Network`.
- **Async WASM operations.** All WASM execution remains synchronous.

---

## Approach

### 1. Projectile Simulation & Dispersion Batching in WASM (`engine/physics`, `game`) *(Dropped)*

> [!NOTE]
> **Decision: Dropped**  
> Following runtime profiling and architectural review, this feature has been dropped:  
> 1. **Sparks are already GPU-native:** Spark particles are integrated directly on the GPU via compute dispatch (`WgslParticleUpdate` in `ParticleEmitterEntity.Simulate`). Routing visual spark generation through WASM linear memory into intermediate JS CPU buffers introduces an extra bounce-buffer copy and cross-boundary transitions rather than true zero-copy.  
> 2. **Projectiles already execute collision in WASM:** Active grenades (`game.Projectile`) are bouncing rigid bodies with static raycast collision (`DynamicBody`). Because `DynamicBody` and `collision` already run inside WASM, raycasts are already host-hop-free WASM-to-WASM calls. With only 0–3 active grenades in flight at any given time, batching dynamic bodies provides negligible gain while risking layering violations between physics and game VFX.  
> 3. **Non-deterministic PRNG:** Visual spark bursts and explosion billboard scatters in `game` use JS `Math.random()`, ensuring natural non-deterministic explosion patterns across game sessions without WASM PRNG seeding requirements.

**Problem:**  
In the initial v1.6.1 adoption, moving spark bursts and projectile scattering (`game/projectiles.go`) to WASM was deferred. Calling a WASM function per particle or fetching individual particle properties across the JS/WASM boundary generates ~100 boundary hops per explosion, wiping out any compute advantage. Furthermore, delegating `rand.Float32()` across the host boundary via JS `Math.random` introduces additional per-call overhead.

**Design:**
- Implement a batch particle/projectile buffer using `gofront/shared` (or a pre-allocated flat typed slice).
- Move the entire dispersion math, gravity step, and velocity decay into a batch update routine in `engine/physics/dynamicbody.go` (e.g. `StepProjectiles(buffer *shared.Buffer, dt float32)`).
- Execute simulation synchronously in a single WASM call per frame.
- The renderer consumes buffer positions directly for instanced or compute-particle rendering without intermediate JS object creation.
- Ensure deterministic or inline PRNG seeding when available in the GoFront WASM toolchain.

### 2. Static Broad-Phase Spatial Hashing Prototype (`engine/collision`)

**Problem:**  
GoFront v1.6.1 added support for array-typed map keys in WASM (e.g. `map[[3]int32][]uint32`). Spatial voxel grids offer $O(1)$ cell lookups for static geometry culling, potentially improving over Octree tree traversals. However, map insertions allocate in WasmGC, and map lookups have hash overhead that must be measured against flat array indexing.

**Design:**
- Prototype a static world broadphase using discrete `[3]int32` voxel coordinates during arena loading (`Trimesh.Finalize`).
- **Load-time only:** Construct voxel grid index arrays strictly at scene initialization.
- **Runtime query discipline:** Frame queries must be read-only or utilize a pre-allocated flat grid array if map lookup overhead is measurable.
- Benchmark raycast throughput and cache behavior against the current static Octree in [`tests/perf/js-vs-wasm.js`](file:///home/coder/workspace/simplefps/tests/perf/js-vs-wasm.js). If voxel hashing does not beat Octree traversal by $\ge 1.15\times$, retain the Octree.
- **Results & Decision:**
  - **Query throughput (hybrid WASM, 200,000 casts):**
    - Octree: 94,988 casts/s (10,528 ns/cast)
    - SpatialHash (Map `[3]int32`): 1,363,270 casts/s (734 ns/cast) — **14.35× speedup**
    - SpatialHash (Flat Array): 1,405,388 casts/s (712 ns/cast) — **14.80× speedup**
  - **Construction throughput (500 builds):**
    - Octree: 1,392 builds/s (718 µs)
    - SpatialHash: 2,064 builds/s (484 µs) — **1.48× faster to build**
  - **Zero-allocation verification:**
    - Verified via `tests/perf/zero-alloc.js` (0 B/op in steady-state across 100,000 casts for both Map and Flat modes).
  - **Decision:** **ADOPTED**. Spatial hashing exceeds the $\ge 1.15\times$ threshold by more than $10\times$ while building faster and meeting all zero-allocation invariants. The legacy Octree has been completely removed in favor of Spatial Hashing, eliminating duplicate tree construction overhead on arena load and shrinking WASM binary size.

### 3. Pure WASM Asset Decoding (`BinaryReader`, `engine/assets`)

**Problem:**  
`app/src/engine/assets/binaryreader.go` currently relies on JavaScript interop (`DataView` via `js:./interop.d.ts`). Porting `BinaryReader` alone to WASM previously introduced high data-marshalling overhead because callers in JS (`meshloader.go`, `animloader.go`) had to pass chunks back and forth.

**Design:**
- Migrate the entire asset decoding pipeline to WASM as a unified subsystem (`//gofront:target wasm`).
- Use `encoding/binary` (`binary.LittleEndian`) for decoding `.bmesh`, `.sbmesh`, and `.banim` formats.
- Decode directly from fetched `ArrayBuffer` payloads (passed via a single shared memory view) into preallocated flat geometry slices.
- Eliminates `interop.d.ts` and `DataView` bindings in `engine/assets`.

---

## Edge Cases

- **Zero-Allocation Hot-Path Invariant:** All projectile steps and collision queries must continue to satisfy [`tests/perf/zero-alloc.js`](file:///home/coder/workspace/simplefps/tests/perf/zero-alloc.js) ($\le 128$ B/frame at 120 Hz).
- **Map Allocation in WasmGC:** Any map lookup in WASM must be verified to ensure the GoFront compiler does not emit transient boxed keys or iterator allocations.
- **Endianness & Byte Alignment:** Pure WASM binary reading must handle unaligned multi-byte float/int reads safely.
- **Sparse vs Dense Voxels:** Large arenas with sparse geometry could inflate memory if voxel grids are stored as flat 3D arrays; hash maps trade lookup speed for memory density.

---

## Implementation Tasks

- [x] **Phase 1: Projectile & Dispersion Batching** *(Dropped)*
  - [x] Evaluate shared buffer layout and dispersion in WASM.
  - [x] Conclude architectural evaluation: sparks are GPU compute-native and dynamic bodies already execute raycasts in WASM; dropped to avoid unnecessary memory hops and layering violations.

- [x] **Phase 2: Spatial Hashing Benchmark & Prototype**
  - [x] Prototype `[3]int32` spatial hashing for static trimesh triangles.
  - [x] Measure construction time and memory overhead against `Octree`.
  - [x] Run benchmark in `tests/perf/js-vs-wasm.js` comparing query throughput.
  - [x] Decide on adoption or rejection based on performance threshold (Adopted: 14.80× speedup vs 1.15× target).

- [ ] **Phase 3: Pure WASM Asset Decoding**
  - [ ] Implement pure Go `BinaryReader` using `encoding/binary`.
  - [ ] Target `.bmesh`, `.sbmesh`, and `.banim` loaders to WASM.
  - [ ] Remove `app/src/engine/assets/interop.d.ts` DataView shims.
  - [ ] Benchmark asset parse time during arena load.

- [ ] **Phase 4: Optimization & Verification**
  - [ ] Run full test suites (`npm test`, `npm run test:dom`, `npm run check`).
  - [ ] Verify zero-alloc performance test (`npm run test:perf`).
  - [ ] Run end-to-end smoke tests (`npm run test:e2e`).

---

## Test Plan

- **Unit:**
  - `gofront test app/src/engine/physics/...`
  - `gofront test app/src/engine/collision/...`
  - `gofront test app/src/engine/assets/...`
- **Performance & Invariants:**
  - `npm run test:perf`: `tests/perf/zero-alloc.js` ($\le 128$ B/frame, 0 B/op raycast).
  - `npm run bench`: `tests/perf/js-vs-wasm.js` (verify speedup ratios).
- **Integration & E2E:**
  - `npm run test:e2e`: Playwright suite covering asset loading, spawning, and projectile firing.
  - `npm run check`: Biome and recursive `gofront check`.
