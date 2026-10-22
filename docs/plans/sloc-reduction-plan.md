# SLOC Reduction — Design Plan

**Version:** continuous  
**Status:** Draft (2026-10-22)  
**Depends on:** None (runs on GoFront 1.7.0, on `master` as of `b70d968`)  
**Replaces:** None  
**Followed by:** [`gofront-v1.8.0-adoption-plan.md`](gofront-v1.8.0-adoption-plan.md) and [`simd-collision-plan.md`](simd-collision-plan.md). This plan should merge before either starts: it shrinks `mathx` ahead of the v1.8.0 strict-mode measurement, and it reshapes `newSpatialHash` before the SIMD packet build is added on top of it.

---

## Goal

Non-test source under `app/src` is 20,862 lines (`.go` + `.templ`). An audit found code that nothing calls, a duplicated ray/AABB slab test, and a spatial-hash constructor that repeats the same logic three times. This plan removes that code with **no change in behaviour**: the same frames are rendered, the same collision grid is built, and the hot paths keep their throughput and zero-allocation guarantees.

The target is about 800 fewer lines, from three sources: about 550 lines of functions with no callers (mostly `mathx`), about 85 lines from the duplicated slab test, and about 150 lines in `newSpatialHash`.

**Done means:**
- Every function listed under *Phase 1* is deleted, and a re-run of the dead-code scan (Task 1.5) finds no new candidates outside the *Out of Scope* list.
- `intersectRayAABB` is gone; `IntersectTrimesh` calls `rayAABBInterval`.
- `newSpatialHash` computes triangle bounds through one helper and fills the grid through one axis-parameterised sweep instead of three copies.
- A characterization test proves the voxel grid (every key and every triangle list, in order) is identical before and after Phase 2 on a fixed set of meshes, including the demo arena.
- `npm run test:all` passes. `node tests/perf/js-vs-wasm.js --ab --repeat 5` with `BASELINE_SRC` set to a `master` worktree reports every entry within 0.90–1.10, and `tests/perf/zero-alloc.js` passes unchanged.
- The non-test line count and the `public/app.js` / `public/app.wasm` sizes before and after are recorded under *Verified Gaps*.
- `CHANGELOG.md`, the roadmap, and the line references in the two follow-up plans are updated.

---

## Scope Rule & Boundary Matrix

A function is removed only if **nothing calls it**: no Go or `.templ` code, no `_test.go`, no JS under `tests/` or `scripts/`, and no interface it has to satisfy. Code is restructured only where the result is provably identical (same grid, same hit results) and the hot path is gated by the A/B harness.

| Category | Rule | Examples / Members |
|---|---|---|
| **In scope: core** | Functions with no callers anywhere | Unused `Mat4*` functions, `Quat.Conjugate/Invert`, `Vec3.RotateX/RotateZ/Subtract`, `BoundingBox.SetFromPoints/GetCorners`, unused `SkinnedMeshEntity` animation setters, `UIManager.HasStarted/SetStarted` |
| **In scope: target-specific (WASM `collision`)** | Dedup and restructure with identical output | `intersectRayAABB` → `rayAABBInterval`; triangle-bounds helper; one sweep for the Y/X/Z dominant-axis branches in `newSpatialHash` |
| **Excluded: used by tests or tooling** | Kept; tests and the perf harness call them | WASM exports used by `tests/perf/*.js` (`NewTrimesh`, `SetBroadphase`, `Broadphase`, `SpatialHashStats`, `AABBQuery`); accessors called only from `_test.go` (`Scene.GetEntities`, `EntityCount`, `Raycast`, `RaycastDynamic`, `BinaryReader.ReadInt8/16`, `Sound.SetVolume/SetSpeed`, …) |
| **Excluded: needed by planned work** | Kept for the follow-up plans | Flat-grid broadphase (`flatGrid`, `getVoxelTrisFlat`, `spatialHashModeFlat`): the base of `simd-collision-plan.md`; the `min3/max3/min4/max4` helpers: replaced with builtins by `gofront-v1.8.0-adoption-plan.md` |

---

## Verified Gaps & Baseline Audit

Probes ran on 2026-10-22 against `master` `b70d968` (GoFront 1.7.0). The dead-code scan script lives in the session scratchpad. It lists every top-level `func` and method in non-test `app/src/**/*.go`, counts word matches in non-test `.go`/`.templ` files other than the definition line, and then cross-checks `_test.go`, `tests/`, `scripts/`, `interop.d.ts` files, and every `interface` method set.

| Area | Finding | Evidence & Probe Reference |
|---|---|---|
| `mathx` dead code | 22 exported functions/methods with no callers anywhere, about 460 lines of bodies (about 510 with doc comments). `mat4.go` alone accounts for about 370 of them. | Scan; e.g. `Mat4TargetTo`, `Mat4Rotate`, `Mat4FromRotationTranslationScaleOrigin` ([`mat4.go`](../../app/src/engine/mathx/mat4.go)) |
| Other dead code | 11 methods outside `mathx` with no callers, about 75 lines with comments. | Scan; see the Task 1.4 list |
| Interface safety | None of the candidates is part of an interface (`Drawable`, `LightDrawable`, `SceneSource`, `Entity`, `RaycastProvider`). | `awk` over every `interface {` block in `app/src` |
| JS callers | `Trimesh.Broadphase` is called by [`tests/perf/js-vs-wasm.js`](../../tests/perf/js-vs-wasm.js); it stays. The scan's `Camera.Rotate` hit in `scripts/md5tomesh.js` is an unrelated JS identifier. | `grep -rw` over `tests/`, `scripts/` |
| Duplicated slab test | `intersectRayAABB` ([`ray.go:138`](../../app/src/engine/collision/ray.go#L138)) and `rayAABBInterval` ([`spatialhash.go:70`](../../app/src/engine/collision/spatialhash.go#L70)) have identical bodies except for the return. `intersectRayAABB` returns `tmax >= 0 && tmin <= maxDist`; `rayAABBInterval` returns `false` under exactly the negation of that condition. Its only caller is [`ray.go:269`](../../app/src/engine/collision/ray.go#L269). | `diff` of the two function bodies |
| Triangle bounds | `newSpatialHash` computes each triangle's min/max with 36 lines of `if` chains, twice (auto cell-size loop at [`spatialhash.go:375`](../../app/src/engine/collision/spatialhash.go#L375), insertion loop at [`spatialhash.go:486`](../../app/src/engine/collision/spatialhash.go#L486)). `min3`/`max3` exist in the same file but are unused there. | Source |
| Axis sweeps | The Y, X and Z dominant-axis branches ([`spatialhash.go:584`](../../app/src/engine/collision/spatialhash.go#L584), [`:633`](../../app/src/engine/collision/spatialhash.go#L633), [`:682`](../../app/src/engine/collision/spatialhash.go#L682)) are about 49 lines each. They differ only in which axis is solved from the plane equation and which two axes are iterated. | Source |
| Stale line reference | `simd-collision-plan.md` cites [`ray.go:281-283`](../../app/src/engine/collision/ray.go#L281-L283) for the `rayQueryLocal` call, which is now at line 276. Phase 2 shifts it by about 85 lines. | Source |
| Baseline (Task 1.1) | Base `feat/sloc-reduction` `09b70cc`: `npm run test:all` green. Non-test `app/src` lines: **20,862**. `public/app.js` **659,152 B**, `public/app.wasm` **103,648 B** (`npm run build`). | `git ls-files 'app/src/*.go' 'app/src/*.templ' \| grep -v _test \| xargs cat \| wc -l`; `wc -c public/app.js public/app.wasm` |
| Open branches (Task 1.1) | All local `feat/` branches (`feat/simd-skinning*`, `feat/wasm-asset-decoding`) are merged PRs; none uses a Phase 1 candidate. Nothing kept for this reason. | `git branch -a` |
| Fixed-point scan (Task 1.5) | Re-running the scan after Tasks 1.2–1.4 found two newly orphaned private helpers, `BoundingBox.frameCorners` and `BoundingBox.corner` (only callers were `ToLocalFrame`/`ToWorldFrame`/`GetCorners`); both deleted. Newly orphaned but called from tests, so kept: `AnimationPlayer.GetProgress`, `AnimationPlayer.Stop`, `NewTransform`, `Transform.PointToLocal`/`PointToWorld`. A second run finds nothing new; the remaining hits are the base audit's test-only or *Out of Scope* entries. Non-test `app/src` lines after Phase 1: **20,214** (−648); `public/app.js` **645,821 B** (−13,331), `public/app.wasm` **94,886 B** (−8,762). | `dead.sh` diffed against a scan of the base worktree; every identifier in the removed lines re-checked for remaining non-test references |
| Pre-existing scan hits, not in this plan (Task 1.5) | `BoundingBox.Clone`, `Quat.Clone` (the scan's `test=2` comes from `Vec3.Clone` in `vec3_test.go`; neither is called anywhere), and `FakeShaderModule.Code` / `FakePipeline.Desc` in the test-only `rendering/fakegpu` package. These were dead before Phase 1 and not in any task list; deleted on user decision (2026-10-22) in the Phase 1 PR, together with the `code`/`desc` fields only `Code`/`Desc` read. Non-test `app/src` lines after that: **20,193** (−669). | `grep -rn 'Clone()' app/src`; `grep -rn '\.Code()\|\.Desc()' app/src tests` |
| Grid characterization (Task 2.1) | `TestSpatialHashGridCharacterization` pins digests for 10 fixtures: `floor16` (explicit and auto cell size), tilted walls facing X and Z, a tilted floor, `ramp45` (every dominant-axis tie: y=z, x=y, x=z, x+y+z=c), `huge` (one triangle per dominant axis plus a collinear one, each hitting `maxVoxelsPerTri`; refs = 5 × 4096), `degenerate` (collinear, single point, area under the `1e-7` guard), and 300 pseudo-random triangles (cell 2 and auto). The demo arena is **not** included: `collision` tests run as WASM, where there is no file-system access (`process` is unavailable, GoFront has no `embed`), so the `.bmesh` cannot be loaded from a Go test; procedural meshes only. Digests recorded from `feat/sloc-reduction` `9d5fd6b`. Negative check: re-keying triangle 3's first voxel to `vx+1` in the Y branch failed `floor16`, `floor16-auto`, `floorY` and `degenerate` (reverted, not committed). | `npx gofront test -run Characterization -v app/src/engine/collision` |

---

## Out of Scope

- **Functions called only from tests:** about 580 lines. They are test hooks or small accessors (counts, getters); removing them means rewriting tests for little gain.
- **`Renderer.CaptureSnapshot`, `Scene.RaycastDynamic`, `Scene.Raycast`:** documented as API in [`architecture.md`](../architecture.md) (lines 146, 217, 235). Removing them is a product decision, not dead-code cleanup.
- **The flat-grid broadphase:** unused in production today (only `SetBroadphase` selects it, and only the perf harness and tests call that), but `simd-collision-plan.md` builds its packets on it.
- **Builtin `min`/`max`:** not available on 1.7.0; `gofront-v1.8.0-adoption-plan.md` does this.
- **Folding the X/Y/Z slab blocks inside `rayAABBInterval` into a loop:** hot path on every raycast; not worth the throughput risk for about 40 lines.
- **The second slab test per cast:** `IntersectTrimesh` tests `mesh.AABB` and then `rayQueryLocal` tests the spatial hash's slightly padded copy of the same box. Removing one is a behaviour change and a perf experiment, not a cleanup.
- **Tests (8.1k lines) and `scripts/` (about 3k lines):** not part of the shipped game.
- **Cosmetic changes** (separator comments, blank lines): not worth the diff noise.

---

## Approach

### 1. Architecture & Design Decisions

- **Phase 1 is deletion only.** No signatures change. Each task deletes one group, then runs `npm run check` and `npm test`. Some deleted functions may be the only callers of other code, such as `AnimationPlayer` setters reached only through `SkinnedMeshEntity.SetAnimationLoop`. Task 1.5 re-runs the scan until it finds nothing new, and checks each new candidate against the same rules.
- **Slab test:** `IntersectTrimesh` becomes `if _, _, hit := rayAABBInterval(...); !hit { return }`. The comment at `ray.go:262` that names `intersectRayAABB` is updated, and the doc comment moves to `rayAABBInterval`. The function stays in `spatialhash.go`, where its main caller is. The two-value return is an internal WASM call that `rayQueryLocal` already makes on every cast, so it adds no new allocation pattern; the A/B and zero-alloc gates confirm this.
- **Triangle bounds:** one unexported helper, `triBounds(vertices []float32, indices []int32, i int) (minX, minY, minZ, maxX, maxY, maxZ float32)`, built on `min3`/`max3`. Both loops call it. When the v1.8.0 plan deletes `min3`/`max3`, its builtin replacement touches one place instead of two `if` blocks.
- **Axis sweep:** the three dominant-axis branches become one function. It takes the triangle as package-level scratch (`_shTri`: vertices `a`, `b`, `c` and normal `n` per axis), plus the solved axis `w` and the two iterated axes `u`, `v`. It solves `w` from the plane equation at the four corners of each `(u, v)` cell, clamps, and walks `w`. Before calling `triBoxOverlap` and `voxelKey`, it maps the cell back to `(x, y, z)`, so both keep their current signatures. Mapping:
  - Y dominant: `u = x`, `v = z`, `w = y`
  - X dominant: `u = y`, `v = z`, `w = x` (current loop order: `vz` outer, `vy` inner)
  - Z dominant: `u = x`, `v = y`, `w = z` (current loop order: `vy` outer, `vx` inner)

  The current loops differ in which axis is the outer loop. The helper must keep each branch's original loop nesting so that triangles are appended to each voxel's list in the same order and the `maxVoxelsPerTri` cutoff hits the same voxels. The characterization test enforces this. The degenerate fallback (no dominant axis) stays as it is.
- **Scratch storage:** `newSpatialHash` runs at load time, not per frame, but the helper still uses package-level scratch (no `[N]T` literals), as the `collision` package does elsewhere. `collision` is a `wasm` package, so package-level mutable state is allowed (the rule against it applies to `both` packages).
- **Rejected:** a generic helper using function values per axis (an indirect call per cell, and closures allocate in GoFront); moving `rayAABBInterval` to `ray.go` (churn with no gain).

### 2. Invariants & Safety Bounds

- **Identical grid:** for every test mesh, `sh.grid` has the same key set, and each key's `[]int32` has the same elements in the same order. `voxelCount`, `totalRefs`, `hasFlat`, `dim*` and `min/maxV*` are equal.
- **Identical hits:** existing collision tests (`ray_test.go`, `spatialhash_test.go`, `integration_test.go`, `staticworld_test.go`) pass unchanged.
- **Zero-alloc:** `tests/perf/zero-alloc.js` thresholds are unchanged: raycast at most 3,000 B new-space per 100k casts, controller as before.
- **Throughput:** the A/B gate is 0.90–1.10 on every `js-vs-wasm.js --ab` entry, median of 5 runs, against a `master` baseline.
- **Public API:** nothing used by `game`, `main`, `tests/` or `scripts/` is removed.

### 3. Edge Cases & Error Handling

- **`maxVoxelsPerTri` cutoff:** the sweep must check `triRefs < maxVoxelsPerTri` at the same three loop levels as today; otherwise very large triangles keep different subsets. The fixture includes one triangle large enough to hit the cap.
- **Ties in the dominant axis** (`anx == any`, etc.): the branch order (Y, then X, then Z, then degenerate) and the `> 1e-7` guards are kept exactly, so tied normals pick the same branch. The fixture includes a 45° triangle.
- **Empty mesh / `cellSize <= 0`:** the auto cell-size path still uses `triBounds`, and the `<= 0.001 → 1.0` fallback is kept.
- **A deleted function turns out to be needed by an open branch:** check `git branch -a` for open `feat/` branches before Phase 1; if one uses a candidate, keep that function and note it here.

---

## Implementation Tasks

> **Execution notes:** epic branch `feat/sloc-reduction` off `master`, phase branches `feat/sloc-reduction-phase-<N>`. Each task is one commit: `refactor(sloc-reduction): <summary> (Task N.M)`. The pre-commit hook runs only `format`/`check`, so each task's **Test** lists the commands to run. If a gate is missed, stop and report; do not loosen a gate or delete code outside this plan's lists.

### Phase 1: Remove Unused Code

- [x] Task 1.1: Record the baseline.
  - Files: `docs/plans/sloc-reduction-plan.md` (*Verified Gaps*)
  - Test: `npm run test:all` green on `master`; `npm run build`, then record `wc -c public/app.js public/app.wasm` and the non-test `app/src` line count.
  - Done when: the three numbers are in *Verified Gaps* and no open `feat/` branch uses a Phase 1 candidate.
- [x] Task 1.2: Delete unused `mat4.go` functions: `Mat4Determinant`, `Mat4Transpose`, `Mat4Rotate`, `Mat4FromXRotation`, `Mat4FromYRotation`, `Mat4FromZRotation`, `Mat4Perspective`, `Mat4Ortho`, `Mat4OrthoZO`, `Mat4TargetTo`, `Mat4FromValues`, `Mat4Mul`, `Mat4FromRotationTranslationScaleOrigin`.
  - Files: `app/src/engine/mathx/mat4.go`
  - Test: `npm run check`, `npm test`.
  - Done when: the functions are gone and both commands pass.
- [x] Task 1.3: Delete other unused `mathx` code: `Quat.Conjugate`, `Quat.Invert`, `NewQuat`, `Vec3.RotateX`, `Vec3.RotateZ`, `Vec3.Subtract`, `BoundingBox.GetCorners`, `SetFromPoints`, `ToLocalFrame`, `ToWorldFrame`, `NewTransformFromValues`.
  - Files: `app/src/engine/mathx/quat.go`, `vec3.go`, `boundingbox.go` (+ `transform.go`)
  - Test: `npm run check`, `npm test`, `node tests/perf/zero-alloc.js` (`mathx` compiles into WASM).
  - Done when: the functions are gone and all three commands pass.
- [x] Task 1.4: Delete unused engine/game functions and methods: `rendering.HasShadowCasters`, `AnimatedBillboardEntity.Time`, `SpotLightEntity.SetDirection`, `SkinnedMeshEntity.GetAnimationProgress` / `SetAnimationLoop` / `SetAnimationSpeed` / `StopAnimation`, `Camera.Rotate`, `InputManager.SetCursorVisible`, `UIManager.HasStarted` / `SetStarted`.
  - Files: `rendering/drawable.go`, `scene/{animatedbillboardentity,lightentities,skinnedmeshentity}.go`, `systems/{camera,input}.go`, `game/ui.go`
  - Test: `npm run check`, `npm test`, `npm run test:dom`.
  - Done when: the methods are gone and all three commands pass. Fields used only by deleted methods are removed too; fields with other readers stay.
- [x] Task 1.5: Re-run the dead-code scan to a fixed point.
  - Files: whatever the scan finds (within the scope rule), `docs/plans/sloc-reduction-plan.md`
  - Test: run the scan; every new candidate (code orphaned by Tasks 1.2–1.4) is checked against `tests/`, `scripts/`, interfaces and the *Out of Scope* list, then deleted or recorded as kept.
  - Done when: the scan reports nothing outside the *Out of Scope* list; `npm run test:all` is green.

### Phase 2: Collision Dedup

- [x] Task 2.1: Characterization test for the voxel grid.
  - Files: `app/src/engine/collision/spatialhash_test.go`
  - Test (written first, against unchanged code): build `newSpatialHash` for a fixed set of meshes (`gridFloor`, a wall facing X, a wall facing Z, a 45° ramp, a triangle large enough to hit `maxVoxelsPerTri`, a degenerate triangle, and the demo arena if test fixtures can load it). For each, fold the grid into a deterministic digest (keys sorted, each list in stored order) plus `voxelCount`, `totalRefs`, `hasFlat` and the bounds, and assert them against constants recorded from `master`.
  - Done when: the test passes on unchanged code and fails if any single triangle id is moved between voxels (checked once by hand, then reverted).
- [x] Task 2.2: Merge `intersectRayAABB` into `rayAABBInterval`.
  - Files: `app/src/engine/collision/ray.go`, `spatialhash.go`
  - Test: `npm test` (`TestRayMeshBoundarySlabNaN`, `TestRayIntersectTrimesh*`), `node tests/perf/zero-alloc.js`.
  - Done when: `intersectRayAABB` is gone, comments that referred to it are updated, and both commands pass.
- [ ] Task 2.3: Triangle-bounds helper.
  - Files: `app/src/engine/collision/spatialhash.go`
  - Test: Task 2.1's test, `npm test`.
  - Done when: both loops in `newSpatialHash` call `triBounds`, and the digest is unchanged.
- [ ] Task 2.4: Single axis-parameterised sweep.
  - Files: `app/src/engine/collision/spatialhash.go`
  - Test: Task 2.1's test, `npm test`.
  - Done when: the Y/X/Z branches call one helper with each branch's original loop nesting, and the digest is unchanged.
- [ ] Task 2.5: Perf gate.
  - Files: `docs/plans/sloc-reduction-plan.md` (*Verified Gaps*)
  - Test: `BASELINE_SRC=<master worktree> node tests/perf/js-vs-wasm.js --ab --repeat 5`, then `npm run test:perf`. Also time `NewTrimesh` + `Finalize` on the demo arena before and after (report only, load time).
  - Done when: every A/B entry is within 0.90–1.10 and zero-alloc passes; the ratios and the construction time are recorded. If an entry falls below 0.90, stop and report.

### Phase 3: Docs & Close-out

- [ ] Task 3.1: Update follow-up plans.
  - Files: `docs/plans/gofront-v1.8.0-adoption-plan.md` (the shadowed `min`/`max` row and the matching Approach note now cover only `rayAABBInterval`; fix line refs; re-count the constant slice indices in `mat4.go`, last counted at 665), `docs/plans/simd-collision-plan.md` (the `ray.go` line refs; note that `newSpatialHash` now uses one sweep helper)
  - Test: every changed `file#Lx` link points at the cited code.
  - Done when: both plans cite current lines.
- [ ] Task 3.2: Final numbers, `CHANGELOG.md`, roadmap.
  - Files: `CHANGELOG.md` (`### Removed` / `### Changed` under `## [Unreleased]`), `docs/roadmap.md`, this plan
  - Test: `npm run build`; record the new line count and bundle sizes next to the Task 1.1 baseline. `npm run test:all`.
  - Done when: the numbers are recorded, the plan is marked Completed, moved to `docs/plans/archive/`, and the roadmap links to the archived file.

---

## Test & Conformance Plan

- **Unit tests:** `npm test` and `npm run test:dom` after every task; Phase 1 changes no tests (nothing it deletes is tested).
- **Characterization:** `collision/spatialhash_test.go` grid digest (Task 2.1), recorded from `master`, which must stay unchanged through Tasks 2.2–2.4.
- **Negative check:** Task 2.1's test is shown to fail on a deliberate one-triangle change before it is trusted.
- **Benchmarks:** `node tests/perf/js-vs-wasm.js --ab --repeat 5` against a `master` `BASELINE_SRC`: every entry 0.90–1.10. `node tests/perf/zero-alloc.js`: thresholds unchanged.
- **Integration:** `npm run test:all` (check, unit, DOM, perf, Playwright smoke) at the end of each phase.
