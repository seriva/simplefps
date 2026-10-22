# SIMD Collision (Triangle Packets) — Design Plan

**Version:** continuous  
**Status:** Draft (2026-10-21)  
**Depends on:** [`gofront-v1.8.0-adoption-plan.md`](gofront-v1.8.0-adoption-plan.md) **completed and merged to `master`**. It needs `gofront@^1.8.0` for the array/pointer fixes (GoFront Phase 0.5) and for `Mask32x4`/comparisons/`Select` (GoFront Phase 6.1). It also needs [`simd-skinning-plan.md`](archive/simd-skinning-plan.md) merged, for the A/B harness and the SIMD rule check.  
**Replaces:** Phases 3–4 of the withdrawn `simd-adoption-plan.md`  
**Followed by:** None

---

## Goal

Static raycasts (weapons, movement, projectiles) spend **≈ 45%** of their time on triangle tests. A 4-wide Möller–Trumbore over SoA triangle packets is **2.28× faster** per triangle than scalar WASM on the v1.8.0 toolchain, with identical hits and zero allocations. The current query gathers candidate triangles by index into a deduped list, which suits neither 4-lane loads nor early-out. Adopting SIMD therefore means:
1. Prepacking each flat-grid voxel's triangles into packets of four at build time.
2. Walking voxels front to back and testing packets in place, with closest/any early-out.
3. Keeping the scalar path for `RayModeAll`/`Callback`, which need exact per-triangle dedupe.

The expected whole-cast ceiling is ≈ 1.3–1.45×.

**Done means:**
- The SH (Flat+SIMD) A/B ratio against SH-Flat on the same build is **≥ 1.15×** (median of 5 process runs).
- 10,000 seeded rays against the demo arena give identical `HasHit`, `Distance` (within 1e-5) and hit triangle for scalar vs SIMD in `RayModeClosest`, and identical `HasHit` in `RayModeAny`.
- `tests/perf/zero-alloc.js` passes with SIMD on (raycast ≤ 3,000 B per 100k casts, controller ≤ 0.5 B/frame).
- SIMD is the default in `scene.FinalizeStaticGeometry`. `docs/architecture.md` (collision data layout) and `CHANGELOG.md` are updated.

---

## Scope Rule & Boundary Matrix

| Category | Rule | Examples / Members |
|---|---|---|
| **In scope: core** | Parity with the scalar path | Closest/any hit results identical to scalar; scalar path kept as reference |
| **In scope: target-specific** | WASM `collision`, flat broadphase | `triPacket` SoA build in `BuildSpatialHash`, 4-wide kernel with `Mask32x4`/`Select`, front-to-back packet query, `Trimesh.SetSIMD` |
| **Excluded: runtime / platform** | Breaks an invariant | Packets in `shared.Float32` (startup-sized memory caps arena size); any `F32x4` on the boundary |
| **Excluded: deferred** | Valid, but no case for it | SIMD for `RayModeAll`/`Callback`; SH-Map mode; `aabbQuery`; controller ray packets; `triBoxOverlap` (load time) |

---

## Verified Gaps & Baseline Audit

Probes ran on 2026-10-21 against GoFront HEAD `f69c67a` and 1.7.0, release builds.

| Area | Finding | Evidence & Probe Reference |
|---|---|---|
| Raycast split | SH-Flat runs 310–324 ns per full cast and 169–178 ns with the candidate loop skipped, so triangle tests are **≈ 45%** of the cast. SH-Map: 414 ns vs 265–304 ns. | Probe `simd/split/`: `count = 0` after `rayQueryLocal` in [`ray.go:188-190`](../../app/src/engine/collision/ray.go#L188-L190), `js-vs-wasm.js` ×2 on demo arena geometry |
| 4-wide kernel (HEAD) | **2.28×** per triangle (7.01 → 3.07 ns), using unexported structs with 9 `F32x4` fields and lane extraction (no masks yet). Hits identical (1,711,427). New-space 2,824 B per 100k rays, which is the harness noise floor. | Probe `simd/tri` + `runtri.mjs` |
| 4-wide kernel (1.7.0) | **Traps** in `Build` (`invalid memory address or nil pointer dereference`) because of the pre-v1.8.0 array/pointer bugs. | Same probe with `GOFRONT_DIR` set to 1.7.0 |
| Candidate gathering | Voxel walk plus a per-triangle stamp dedupe into `out[]`, then gather-order tests via `getNormal`/`getVertex`. | [`spatialhash.go:810-818`](../../app/src/engine/collision/spatialhash.go#L810-L818), [`ray.go:192-209`](../../app/src/engine/collision/ray.go#L192-L209) |
| Ray modes | `RayModeAll` and `Callback` need exact dedupe; `Closest`/`Any` tolerate a triangle being tested twice. | [`ray.go:11-13`](../../app/src/engine/collision/ray.go#L11-L13), [`ray.go:261-284`](../../app/src/engine/collision/ray.go#L261-L284) |
| Grid build | Since [`sloc-reduction-plan.md`](archive/sloc-reduction-plan.md) Phase 2, `newSpatialHash` inserts every non-degenerate triangle through one helper, `sweepDominantAxis` (one call per Y/X/Z dominant axis), and builds `flatGrid` from the finished map at the end. Packets attach after the grid build, in `BuildSpatialHash` once `newSpatialHash` returns, reading `flatGrid` (Approach §1); the sweep itself does not change. | [`spatialhash.go:510-518`](../../app/src/engine/collision/spatialhash.go#L510-L518) (sweep calls), [`spatialhash.go:538-569`](../../app/src/engine/collision/spatialhash.go#L538-L569) (`flatGrid`), [`spatialhash.go:572-580`](../../app/src/engine/collision/spatialhash.go#L572-L580) (`sweepDominantAxis`), [`trimesh.go:255-267`](../../app/src/engine/collision/trimesh.go#L255-L267) (`BuildSpatialHash`) |
| Demo arena size | 1,089 voxels, 7,168 voxel refs, so ≤ ≈ 10.4k padded lanes and ≈ 430 kB of packets. | `js-vs-wasm.js` `SpatialHashStats` |

---

## Out of Scope

- **`RayModeAll`/`Callback` on SIMD.** They keep the stamp-deduped scalar path.
- **SH-Map mode.** `SetSIMD(true)` falls back to scalar there and warns once.
- **Traversal speed-ups that are not SIMD.** The front-to-back walk is required by the packet path and is not measured on its own.
- **`shared.Float32` packet storage.** Its startup-only sizing would cap arena size.

---

## Approach

### 1. Architecture & Design Decisions

- **Packets:** `triPacket` has 9 `F32x4` fields (`v0`, `e1`, `e2`), plus per-lane `int32` triangle ids and a per-lane flag mask (double-sided, filter bits). One flat `[]triPacket` holds all packets, and `voxelPackets[cell]` is an `(offset, count)` range into it. They are built in `BuildSpatialHash` (flat mode) only when `Trimesh.SetSIMD(true)` was called. Padding lanes are degenerate (`det == 0`).
- **Kernel:** branchless with `Mask32x4`. `|det| > ε`, `u ≥ 0`, `v ≥ 0`, `u+v ≤ 1`, `0 < t < best`, then the backface and filter masks combined with `And`, `Select` for the best `t`, and `Bits()` to find the winning lane.
- **Query:** walk voxels in the existing DDA order. `RayModeClosest` stops once the best `t` is below the voxel exit `t`; `RayModeAny` stops on the first hit.
- **Dispatch:** `IntersectTrimesh` takes the packet path for `Closest`/`Any` with no `Callback` when SIMD is on; every other ray uses the scalar path.
- **Rejected:** gathering candidates into packets per query (the gather costs more than the arithmetic it saves); `shared` storage (see the scope matrix).

### 2. Invariants & Safety Bounds

- Closest/any results are identical to scalar; the scalar path is kept.
- Zero per-cast allocations; packets are allocated at build time only.
- No `F32x4` on the boundary. The only boundary change is the `Trimesh.SetSIMD(bool)` setter.

### 3. Edge Cases & Error Handling

- **Degenerate and padding lanes:** the `|det| < ε` mask removes them, matching `parallelRayEpsilon`. A voxel holding only degenerate triangles is tested.
- **`SkipBackfaces` and double-sided:** per-lane mask, matching [`ray.go:201-207`](../../app/src/engine/collision/ray.go#L201-L207).
- **Filter mask:** lane flags are ANDed with `RayOptions.CollisionFilterMask`.
- **Non-identity `worldMatrix`:** the ray is transformed to local space first, as today.
- **A triangle spanning voxels:** it may be tested twice in closest/any. That is harmless, and the parity test covers rays along voxel boundaries.

---

## Implementation Tasks

> **Execution notes:** epic branch `feat/simd-collision` off `master`. **Entry gate for Phase 1:** `npm ls gofront` reports ≥ 1.8.0 on `master`, and `node tests/perf/simd-kernels.js` runs the `tri` kernel instead of skipping it. If either fails, do not branch; report blocked. The pre-commit hook runs only `format`/`check`, so each task's **Test** lists the commands to run. `CHANGELOG.md` is updated per task commit. If a gate is missed, stop and report; do not delete code without the user's decision.

### Phase 1: Triangle packets & 4-wide kernel
- [ ] Task 1.1: Packet build
  - Files: `app/src/engine/collision/packets.go` (new), `app/src/engine/collision/packets_test.go` (new), `app/src/engine/collision/trimesh.go`
  - Test (failing first): for every flat cell of the test arena, the packet lanes hold exactly that cell's triangle ids (multiset equal) with correct `v0`/`e1`/`e2` and flag bits, and padding lanes are degenerate. Run `npm test`.
  - Done when: `SetSIMD(true)` before `BuildSpatialHash` builds the packets, behaviour with SIMD off is unchanged, and the demo-arena packet memory is recorded (≤ 500 kB).
- [ ] Task 1.2: 4-wide kernel
  - Files: `app/src/engine/collision/packets.go`, `app/src/engine/collision/packets_test.go`
  - Test (failing first): for each packet and 1,000 seeded rays, per-lane hit and `t` match the scalar triangle test (`t` within 1e-5). Run `npm test`.
  - Done when: the kernel uses `Mask32x4`/`Select`/`Bits` and extracts only the winning lane.
- [ ] Task 1.3: Lane edge cases
  - Files: `app/src/engine/collision/packets_test.go`
  - Test (failing first): backface lanes with `SkipBackfaces`, double-sided lanes, filter-mask lanes, a voxel of only degenerate triangles, and a ray parallel to a packet's plane all match the scalar result. Run `npm test`.
  - Done when: every case passes.

### Phase 2: Packet query, gate & default
- [ ] Task 2.1: Front-to-back packet query and dispatch
  - Files: `app/src/engine/collision/spatialhash.go`, `app/src/engine/collision/ray.go`, `app/src/engine/collision/ray_test.go`
  - Test (failing first): 10,000 seeded rays against the demo arena (including rays along voxel boundaries) match on `HasHit`/`Distance`/triangle for scalar vs SIMD in Closest, and on `HasHit` in Any. `All`/`Callback` rays are asserted to take the scalar path, and SH-Map with SIMD on falls back with one warning. Run `npm test && npm run test:dom`.
  - Done when: `IntersectTrimesh` dispatches as in Approach §1.
- [ ] Task 2.2: Benchmark and zero-alloc rows
  - Files: `tests/perf/js-vs-wasm.js` (`SH (Flat+SIMD)` entry, A/B against `SH-Flat` in the same build), `tests/perf/zero-alloc.js` (SIMD variant)
  - Test: `npm run test:perf` (SIMD raycast ≤ 3,000 B per 100k casts); `node tests/perf/js-vs-wasm.js --ab --repeat 5`.
  - Note: `ab.js` compares two *builds* (A/B by compiler or source) and gates each entry on 0.90–1.10 unless overridden with `--gate`. A same-build SH (Flat+SIMD) vs SH-Flat ratio is not something it does yet, so this task either adds a paired-entry ratio to the harness or measures SIMD against a pre-change `BASELINE_SRC` with `--gate 'SH-Flat>=1.15'` and the SIMD path forced on in side B. Without a `--gate`, a passing ≥ 1.15× result would fail the default 1.10 ceiling.
  - Done when: both rows report on every run, and the SIMD/flat ratio is recorded under *Verified Gaps*.
- [ ] Task 2.3: Gate and default-on
  - Files: `app/src/engine/scene/scene.go` (`FinalizeStaticGeometry` calls `SetSIMD(true)`), `docs/architecture.md` (collision data layout)
  - Test: `npm run test:all` with SIMD on.
  - Done when: SH (Flat+SIMD) is ≥ 1.15× and zero-alloc passes, so SIMD becomes the default. If it is below 1.15×, stop and report; do not switch the default.

---

## Test & Conformance Plan

- **Unit tests:** `app/src/engine/collision/packets_test.go` (layout, per-lane kernel against scalar, edge lanes), `ray_test.go` (10k-ray closest/any parity, scalar dispatch for `All`/`Callback`, SH-Map fallback).
- **Integration:** `npm run test:all` with SIMD on; the Playwright smoke test covers player movement and weapons in the demo arena.
- **Negative cases:** `SetSIMD(true)` in SH-Map mode falls back with one warning; degenerate-only voxels produce no hits.
- **Benchmarks:** `node tests/perf/js-vs-wasm.js --ab --repeat 5`: SH (Flat+SIMD) ≥ 1.15× SH-Flat. `node tests/perf/zero-alloc.js`: SIMD raycast ≤ 3,000 B per 100k casts. `node tests/perf/simd-kernels.js`: the `tri` kernel ≥ 2.0× (canary, active from v1.8.0).
