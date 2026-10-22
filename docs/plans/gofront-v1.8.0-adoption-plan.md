# GoFront v1.8.0 Adoption — Design Plan

**Version:** continuous  
**Status:** Draft (2026-10-21) — GoFront v1.8.0 is in progress upstream (Phases 0.1–0.5 of its plan have landed; 0.6 onward are open). This plan is written against GoFront `f69c67a` and must be re-checked when v1.8.0 is tagged.  
**Depends on:** GoFront v1.8.0 **tagged and published** ([`gofront/docs/v1.8.0/portable-go-plan.md`](../../../gofront/docs/v1.8.0/portable-go-plan.md)); [`simd-skinning-plan.md`](archive/simd-skinning-plan.md) merged to `master` (A/B perf harness); [`archive/wasm-deferred-features-plan.md`](archive/wasm-deferred-features-plan.md)  
**Replaces:** None  
**Followed by:** [`simd-collision-plan.md`](simd-collision-plan.md) (needs this plan merged to `master`). v1.8.0 is the last feature release of GoFront's JS engine, and v2.0.0 is a byte-identical native port, so this is the last language/stdlib adoption plan before the v2.0.0 toolchain switch.

---

## Goal

GoFront v1.8.0 ("Portable Go completion") makes every language feature behave the same in `js`, `wasm` and `both` packages. It adds a Go-source stdlib, `encoding/json` in WASM, and Go 1.23 iterators, and it completes `gofront/simd` (SIMD adoption has its own plans: [`simd-skinning-plan.md`](archive/simd-skinning-plan.md) and [`simd-collision-plan.md`](simd-collision-plan.md)). SimpleFPS is a mature hybrid engine with strict zero-allocation hot paths, so most of v1.8.0 is **not** something it needs to adopt. The release does carry two real consequences:

1. **A risk.** Strict-mode runtime panics (GoFront Task 0.16) add bounds and nil checks to the JS output of `both` packages. `mathx` is SimpleFPS's only `both` package, and every frame of the JS renderer runs through it. A probe of the planned check shape shows a **4.3× slowdown on `Mat4Multiply`** and **2.0× on `Vec3.Add`** (see the gaps table). The upstream elision rule covers constant indices into *arrays*, but `mathx.Mat4` is a *slice* alias (`type Mat4 = []float32`). As planned today, none of its 441 constant indices would be elided.
2. **A small set of clean-ups.** The `min`/`max` builtins in WASM replace six hand-written helpers in `collision`. One stale GoFront workaround in `engine` can go.

This plan bumps SimpleFPS to v1.8.0 without regressing the zero-allocation or throughput invariants. It adopts the clean-ups and records every v1.8.0 capability that is deliberately not adopted, with the reason. `gofront/simd` needs data-layout changes in `animation` and `collision`, so it is planned separately: skinning in [`simd-skinning-plan.md`](archive/simd-skinning-plan.md) (runs now, on 1.7.0) and collision in [`simd-collision-plan.md`](simd-collision-plan.md) (after this plan).

**Done means:**
- `package.json` depends on `gofront@^1.8.0`, and `npm run test:all` passes with no test changes other than those listed in this plan.
- `npm run test:perf` passes on v1.8.0 (raycast ≤ 3,000 B new-space delta per 100k casts, controller ≤ 0.5 B/frame), and the new `tests/perf/mathx-js.js` A/B benchmark (v1.7.0 vs v1.8.0 compiler, same source) shows a B/A time ratio of **≤ 1.10** on every entry (`Mat4Multiply`, `Mat4Invert`, `Vec3` ops, `BoundingBox.TransformMat4`), as the median of 5 process runs.
- `node tests/perf/js-vs-wasm.js --ab --repeat 5 --max Infinity --gate 'mesh-parse>=0.80'` (v1.7.0 vs v1.8.0 compiler) shows no hybrid entry more than 10% slower (mesh-parse 25%, with an upstream issue). The harness reports A time / B time, so > 1 means v1.8.0 is faster: the default 0.90 floor is the 10% slowdown gate, and `--max Infinity` keeps a speedup from failing the default 1.10 ceiling. A 10% gate is the tightest that measured noise allows (A/A spread up to 6.4% per run). It catches the 2–4× strict-mode risk, but not a 3–9% drift.
- `collision` has no hand-written `min*`/`max*` helpers, and `engine.toggleDebug` no longer uses the callback workaround.
- `AGENTS.md`, `CHANGELOG.md` and `docs/architecture.md` are updated.

---

## Scope Rule & Boundary Matrix

A v1.8.0 capability is adopted only if it (a) removes a verified SimpleFPS workaround, or (b) beats the existing code on a benchmark without breaking zero-alloc. A capability that only adds expressiveness is not adopted.

| Category | Rule | Examples / Members |
|---|---|---|
| **In scope: core** | Toolchain bump with regression gates on every target | `gofront@^1.8.0`; array value semantics, accessor-ref pointers, per-iteration loop vars and universe scope (no source change, guarded by tests/benchmarks); strict-mode checks in `mathx` JS output (gated by the new benchmark) |
| **In scope: target-specific** | Adopted where it replaces existing code | `min`/`max` builtins in `collision` (WASM), `scene.lightgrid`, `game.weapons` (JS); `&d.Field` pointers in `engine` (JS); `gofront/simd` → [`simd-skinning-plan.md`](archive/simd-skinning-plan.md), [`simd-collision-plan.md`](simd-collision-plan.md) |
| **Excluded: runtime / platform** | Breaks a SimpleFPS invariant | `iter.Seq` / range-over-func and `slices.All`-style iterators on hot paths (closure allocation per call breaks zero-alloc); `context` (no async WASM work); `encoding/json` in WASM (see Out of Scope) |
| **Excluded: deferred** | Valid, but no consumer today | `bufio`, `net/url`, `encoding/csv`, `container/*`, `hash/*`, `crypto/*`, `log`, `math/rand/v2` in WASM, complex numbers, generic type aliases, `fmt` `%T`/`Sprint` |

---

## Verified Gaps & Baseline Audit

Probes ran on 2026-10-21 against GoFront v1.7.0 (worktree at tag `1.7.0`) and GoFront HEAD `f69c67a` (v1.8.0 Phases 0.1–0.5), with SimpleFPS `896860b` linked to the local checkout (`"gofront": "file:../gofront"`). Probe sources live in the session scratchpad; the SIMD kernel probes are checked in by `simd-skinning-plan.md` Task 1.3.

| Area | Finding | Evidence & Probe Reference |
|---|---|---|
| Toolchain regression (HEAD) | No functional regression. `npm run check` and `npm test` pass on all 13 packages (`mathx [js]` and `mathx [wasm]` both ok). | `npm run check` → `13 packages — OK`; `npm test` → `ok` for every package |
| Zero-alloc (HEAD) | Unchanged from v1.7.0. Raycast SH-Map/SH-Flat 2,960 B per 100k casts on both versions; controller 0.2 B/frame on both. Array value semantics (Task 0.8a) does not add copies for `_radialDirs[i][0]` / `_horizontalCheckHeights[h]` in [`fpscontroller.go:39-40`](../../app/src/engine/physics/fpscontroller.go#L39-L40). | `GOFRONT_DIR=<v> node tests/perf/zero-alloc.js` |
| Throughput (HEAD vs v1.7.0) | Three runs each. Controller hybrid 2,812–3,022 ns vs 2,841–2,856 ns; skinning 7,033–7,351 vs 6,827–7,155 ns; SH-Map 418–421 vs 413–442 ns; SH-Flat 309–310 vs 305–347 ns: all within noise. **Watch item:** mesh-parse hybrid is consistently slower, 1.09–1.15 ms vs 0.97–1.03 ms (≈ +10%). It is load time only, but needs a cause. | `GOFRONT_DIR=<v> node tests/perf/js-vs-wasm.js` ×3 |
| Wasm size | Identical: physics+collision+mathx 98,479 B, animation+mathx 62,533 B, decoder 76,180 B (unoptimised). | Same bench output |
| Strict-mode index checks (Task 0.16, not landed) | **Major JS regression risk.** A simulation of the planned `__at`/`__set` helpers on the emitted `Mat4Multiply` runs 148.8 ns vs 34.2 ns per call (**4.35×**; second run 4.20×). `mathx.Mat4` is `[]float32`, and the upstream elision covers only `range`/`i < len(xs)` loops and constant indices into **arrays**. [`mat4.go`](../../app/src/engine/mathx/mat4.go) has 441 constant slice indices (665 before [`sloc-reduction-plan.md`](sloc-reduction-plan.md) deleted 13 unused `Mat4*` functions; re-counted with `grep -oE '[A-Za-z_][A-Za-z0-9_]*\[[0-9]+\]' app/src/engine/mathx/mat4.go \| wc -l`, which gives 665 on `b70d968`). | Probe `strict/bench.mjs`: regex-rewrites the GoFront-emitted `Mat4Multiply` to the Task 0.16a helper shape; `gofront/docs/v1.8.0/portable-go-plan.md:161` |
| Strict-mode nil-deref checks (Task 0.16, not landed) | **2.0×** on `Vec3.Add` (4.43 vs 2.21 ns) when every pointer field access goes through a nil check. `vec3.go` and `quat.go` have 212 and 116 receiver/argument field accesses. | Probe `strict/deref.mjs` |
| `min`/`max` builtins in WASM | Not available yet on HEAD or v1.7.0 (`Unresolved identifier: min` in a `both` package); planned in GoFront Phase 0.6. SimpleFPS works around it with `minFloat32`, `maxFloat32`, `min3`, `max3`, `min4`, `max4`. Their callers are `triBoxOverlap`, `sweepDominantAxis` (`min4`/`max4`) and, since [`sloc-reduction-plan.md`](sloc-reduction-plan.md), `triBounds` (`min3`/`max3`), which both triangle-bounds loops in `newSpatialHash` share. | Probe `p2`; [`spatialhash.go:320-382`](../../app/src/engine/collision/spatialhash.go#L320-L382), [`triBounds`](../../app/src/engine/collision/spatialhash.go#L386-L394) |
| `min`/`max` in JS packages | Already work, but unused: [`weapons.go:339`](../../app/src/game/weapons.go#L339) round-trips through `float64(math.Max(...))`, and [`lightgrid.go:79-95`](../../app/src/engine/scene/lightgrid.go#L79-L95) hand-rolls clamps. | Source |
| Pointer to bool field (JS) | **Stale workaround.** [`engine.go:212`](../../app/src/engine/engine.go#L212) says `&d.ShowSkeleton` "would be a detached box". In a `js` package, `flip(&o.Show)` writes through on both v1.7.0 and HEAD; the detached box was a WASM-only bug, fixed by Task 0.1b. | Probe `p1` `TestFieldPtr` passes on both versions |
| Map field zero value (JS) | **Not fixed in v1.8.0.** A zero `map` struct field is `{}`, not `nil`, on v1.7.0 and HEAD. The workaround at [`pipelines.go:225-227`](../../app/src/engine/rendering/pipelines.go#L225-L227) (`hasDepth`) must stay. The v1.8.0 plan has no task for this. | Probe `p1` `TestMapNil` fails on both versions |
| Reslice allocation (JS) | Not addressed by v1.8.0 (boundary slice borrowing was dropped from it). The `DrawList` design at [`drawable.go:43`](../../app/src/engine/rendering/drawable.go#L43) and the index loops at [`renderer.go:314`](../../app/src/engine/rendering/renderer.go#L314) stay. | `portable-go-plan.md` Out of Scope |
| `encoding/json` in WASM | Rejected on HEAD (`'json.Unmarshal' is not yet available in wasm packages`); planned in GoFront Phase 5. All five SimpleFPS JSON call sites (`assets/resources.go`, `materialloader.go`, `meshloader.go`, `systems/settings.go`, `game/arena.go`) are in JS packages and run at load time only. | Probe `p3`; grep `json\.` |
| `gofront/simd` in exported structs | An exported struct with an `F32x4` field still fails the build on HEAD (`cannot cross the JS↔WASM boundary in 1.7.0`). Unexported SIMD structs work, with two limits found in the skinning plan: an unexported `F32x4` field inside an *exported* struct is also rejected, and a package-level `var x <simd struct>` fails WebAssembly validation (use `make([]T, 1)`). See [`simd-skinning-plan.md`](archive/simd-skinning-plan.md) and [`simd-collision-plan.md`](simd-collision-plan.md) for the SIMD probes. | Probe `p4` |
| Breaking: `maps.Keys`/`Values` → `iter.Seq` | No impact. SimpleFPS does not import `maps`. | grep `maps\.` → none |
| Shadowed builtins | `rayAABBInterval` declares locals named `min`/`max` (`min := &aabb.Min`). This is legal Go, but it blocks the builtin inside that function. It is the only one left: [`sloc-reduction-plan.md`](sloc-reduction-plan.md) Task 2.2 merged the former second case, `intersectRayAABB` in `ray.go`, into it. | [`spatialhash.go:85-86`](../../app/src/engine/collision/spatialhash.go#L85-L86) |
| Zero-value package-level arrays (WASM, 1.7.0) | On GoFront 1.7.0 a zero-value package-level array (`var x [3]float32`), or a zero-value struct with array fields, is nil in WASM and panics on first index. `collision` works around it by declaring `_shTri` (the `sweepDominantAxis` scratch, a struct of `[3]float32`/`[3]int32` fields) as `_shTri = shTri{}`. Not re-probed on HEAD; it may be one of the Phase 0.5 array fixes. | Found in [`sloc-reduction-plan.md`](sloc-reduction-plan.md) Task 2.4; [`spatialhash.go:30-35`](../../app/src/engine/collision/spatialhash.go#L30-L35) |

---

## Out of Scope

- **`encoding/json` in WASM.** Every JSON parse is a one-off at load time in a JS package. The JS backend uses native `JSON.parse`, which a WASM codec will not beat, and moving the loaders into WASM would add boundary copies of every decoded slice. (The legacy JSON mesh path, used by one `.mesh` file, should be retired by converting that asset to `.bmesh`. That is a separate change.)
- **Iterators (`iter`, range-over-func, `slices.All`/`Values`/`Sorted`, `strings.SplitSeq`).** Each iteration allocates a yield closure. Hot paths keep the "write into a caller buffer, return a count" contract. Load-time code gains nothing that justifies the churn.
- **New pure packages (`bufio`, `net/url`, `context`, `encoding/csv`, `container/*`, `hash/*`, `crypto/*`, `log`, `math/rand/v2`).** No consumer exists. `math/rand/v2` in WASM was considered for projectile scatter and is moot: the [deferred-features plan](archive/wasm-deferred-features-plan.md) dropped that batching.
- **Map-field `nil` and reslice allocation.** v1.8.0 does not change either. Upstream issues are prerequisites P2/P3 (see *Implementation Tasks*); the workarounds stay.
- **`gofront/simd`.** It needs data-layout changes in `animation` and `collision`, and skinning can adopt it on 1.7.0 already, so it is planned separately in [`simd-skinning-plan.md`](archive/simd-skinning-plan.md) and [`simd-collision-plan.md`](simd-collision-plan.md).
- **Changing `mathx.Mat4` to `[16]float32`.** That would get constant-index elision for free, but with v1.8.0 array value semantics every `Mat4` assignment or argument becomes a copy, and the whole JS renderer would need rewriting. It is the fallback only if the upstream fix (prerequisite P1) is rejected (see Approach §1).
- **v2.0.0 native-engine adoption.** It is a separate plan once v2.0.0 ships; the output is byte-identical by design.

---

## Approach

### 1. Architecture & Design Decisions

- **The bump comes first, and it is gated by measurement.** The A/B harness from [`simd-skinning-plan.md`](archive/simd-skinning-plan.md) compiles the same source with two compilers (`GOFRONT_BASELINE_DIR` = 1.7.0, current = 1.8.0) and interleaves them in one process, so there are no machine-dependent baselines in git. The same harness can re-measure each upstream GoFront milestone before the tag (`GOFRONT_DIR=../gofront`, Task 0.16 in particular); that check is manual and not a task here.
- **New benchmark `tests/perf/mathx-js.js`.** It compiles `engine/mathx` with `forceTarget: "js"` (the same `compileDir` path as `js-vs-wasm.js`) and times `Mat4Multiply`, `Mat4Invert`, `Mat4FromRotationTranslationScale`, `Vec3.Add`/`Normalize`/`TransformMat4` and `BoundingBox.TransformMat4`, interleaving A and B over 9 rounds of 2M calls. It runs through `tests/perf/ab.js` and fails if any entry's median B/A time ratio over 5 process runs exceeds 1.10. With no baseline compiler configured, it skips.
- **Strict mode in `mathx` is resolved upstream, not worked around locally.** `mathx` must stay `both` (shared by the JS renderer and the WASM physics). The preferred fix is a GoFront change to Task 0.16b: elide the check for a constant index `k` once the same function has proven `len(xs) > k`. The proof is either the Go bounds-check-elimination hint `_ = xs[k]` or an explicit `if len(xs) < k+1 { panic(...) }`. One check per argument then replaces sixteen. SimpleFPS adds `_ = out[15]; _ = a[15]; _ = b[15]` at the top of each `Mat4*` function, which is idiomatic Go and is also BCE-friendly under real `gc`. Pointer field access gets the same treatment upstream: one nil check per pointer per function, after which the pointer is treated as proven non-nil.
- **Decision rule for the bump.** If the v1.8.0 `mathx-js.js` ratio is above 1.10 after the hints, the bump does not merge: SimpleFPS stays on `^1.7.0` and the numbers go to the upstream issue. GoFront's own release gate (no hybrid-raycast regression above 3%) does not cover the JS renderer path, so SimpleFPS has to enforce this itself.
- **`min`/`max` replace helpers, without changing semantics on finite input.** Go's `min` on floats propagates NaN, while `a < b ? a : b` returns `b` when `a` is NaN. Collision inputs are finite triangle coordinates, so behaviour on real geometry is unchanged. The NaN case gets its own test so the difference is a deliberate, recorded change rather than an accident.

**Rejected alternatives:**
- *Splitting `mathx` into `mathx` (js) and `mathxw` (wasm).* This duplicates 1,900 lines and breaks the single-source invariant from the [v1.6.1 adoption](archive/wasm-v1.6.1-adoption-plan.md).
- *Asking upstream to make strict mode opt-out per package.* The GoFront plan rules this out explicitly ("the checks are never shipped disabled").

### 2. Invariants & Safety Bounds

- **Zero per-frame allocations:** `tests/perf/zero-alloc.js` thresholds stay as they are.
- **`mathx` stays `both` and keeps no mutable package state**, as required by AGENTS.md.
- **The boundary API is unchanged:** no exported signature in `collision`, `physics`, `animation` or `decoder` changes.
- **Generated assets are untouched.**
- **Single source of truth for numbers:** gates compare A and B in the same process; this document records the measured ratios.

### 3. Edge Cases & Error Handling

- **Shadowed `min`/`max` locals:** in `rayAABBInterval` (the only function left that declares them), rename `min`/`max` to `lo`/`hi` *before* introducing the builtins. Otherwise the builtin silently resolves to the local `*mathx.Vec3`, and the result is a type error or, worse, a valid call to the wrong thing.
- **NaN through `min`/`max`:** add a `spatialhash_test.go` case for a degenerate ray (NaN direction component) that asserts the query returns 0 hits without panicking, on both the old and new helpers.
- **The mesh-parse watch item:** if the ≈ 10% `decoder` slowdown persists on v1.8.0, bisect GoFront commits `38147aa..f69c67a` (Phase 0.5: array copies, Task 0.8a/b) and file the result upstream. It is load time only, so it does not block the bump unless it exceeds 25%.

---

## Implementation Tasks

> **Execution notes (for `/execute-plan` and `/dev-loop`):**
> - **Do not start before both entry gates hold:** (1) `npm view gofront@1.8.0 version` succeeds; (2) [`simd-skinning-plan.md`](archive/simd-skinning-plan.md) is merged to `master` (`tests/perf/ab.js` exists there). If either fails, do not create `feat/gofront-v1.8.0-adoption`; report blocked. After that, `/execute-plan --auto` is safe: neither phase waits on anything external.
> - **Prerequisites owned by the user** (outside the dev-loop; filing issues on another repository is not part of its authorization): (P1) a GoFront issue asking strict mode to elide constant-index checks after a `_ = xs[k]` / `len` proof and to hoist nil checks per function, with the `strict/bench.mjs` numbers. This blocks Task 1.4's gate unless it is resolved or explicitly waived. (P2) a GoFront issue for the map-field zero value `{}` vs `nil`. (P3) the mesh-parse watch item, if Task 1.2 reproduces it.
> - The pre-commit hook runs only `format` and `check`, and CI runs only on `master` pushes. Each task's **Test** names the commands that must be green before its commit.
> - `CHANGELOG.md` is updated in every task commit (dev-loop step 4). Archiving the plan and updating the roadmap happen in `/execute-plan` Phase 4, so there is no close-out task.
> - **The working tree must be clean:** no `file:` link in `package.json`. The baseline compiler is a 1.7.0 checkout passed as `GOFRONT_BASELINE_DIR`.
> - **Gate misses:** if a benchmark `Done when` is not met, stop and report (AGENTS *Blockers*). Do not revert or rework without the user's decision.

### Phase 1: Toolchain bump & strict-mode gate
- [ ] Task 1.1: Workaround guard tests (on 1.7.0, before the bump)
  - Files: `app/src/engine/engine_test.go`, `app/src/engine/rendering/pipelines_test.go`
  - Test (*characterization*): `TestToggleDebugFieldPointer` flips `ActiveRenderer.Debug.ShowSkeleton` through a `*bool` helper and asserts the write is visible; `TestZeroMapFieldIsNotNil` documents the `{}` zero value (it fails once GoFront fixes it, which signals that `hasDepth` can go). Run `npm test && npm run test:dom`.
  - Done when: both pass on 1.7.0, and each comments on the workaround it guards.
- [ ] Task 1.2: Bump the dependency
  - Files: `package.json`, `package-lock.json`
  - Test: `npm ci && npm run test:all`, then `GOFRONT_BASELINE_DIR=<1.7.0 checkout> node tests/perf/js-vs-wasm.js --ab --repeat 5 --max Infinity --gate 'mesh-parse>=0.80'`.
  - Done when: `"gofront": "^1.8.0"`; `test:all` is green, including Task 1.1's guards and the zero-alloc thresholds; every hybrid A/B entry passes the gate above (no more than 10% slower; mesh-parse 25%); the ratios are recorded under *Verified Gaps*.
- [ ] Task 1.3: `mathx` JS A/B benchmark
  - Files: `tests/perf/mathx-js.js` (new), `package.json` (`test:perf` runs it)
  - Test: A/A (`GOFRONT_BASELINE_DIR` = the current compiler) gives every entry 0.90–1.10; the real A/B against 1.7.0 is expected to **fail** before Task 1.4 if strict-mode checks are not elided.
  - Done when: the script reports the median ratio for the 7 entries over 5 process runs, gates at a B/A time ratio of 1.10 (A/B ≥ 0.91 in `ab.js`'s convention, so a speedup passes), and skips without a baseline compiler.
- [ ] Task 1.4: BCE hints in `mathx`
  - Files: `app/src/engine/mathx/mat4.go`, `app/src/engine/mathx/boundingbox.go`, `app/src/engine/mathx/mat4_test.go`
  - Test: `mat4_test.go` checks that a 15-element `Mat4` passed to `Mat4Multiply` panics with `index out of range [15] with length 15` on `[js]` and `[wasm]`. Run `npm test`, then `node tests/perf/mathx-js.js --repeat 5` against 1.7.0.
  - Done when: every `Mat4*` function that indexes constants starts with `_ = x[15]` per `Mat4` parameter, and every `mathx-js` entry is ≤ 1.10. If it is above 1.10, stop and report: SimpleFPS stays on `^1.7.0` until P1 is resolved (decision rule, Approach §1).
- [ ] Task 1.5: Docs and release size
  - Files: `AGENTS.md` (Part 2: "uses GoFront >= 1.8.0", plus `min`/`max` and strict-mode notes under *Zero per-frame allocations*), `docs/plans/gofront-v1.8.0-adoption-plan.md` (record sizes)
  - Test: `npm run build` on 1.7.0 and on 1.8.0; compare the sizes of `public/app.wasm` and `public/app.js`. Run `npm run check`.
  - Done when: the release `app.wasm` is ≤ 82 kB (80.1 kB in the v1.6.1 adoption), and the `app.js` growth from strict-mode helpers is recorded.

### Phase 2: Language clean-ups
- [ ] Task 2.1: Rename shadowing locals in `collision`
  - Files: `app/src/engine/collision/spatialhash.go` (`rayAABBInterval`)
  - Test (*characterization*): the existing `ray_test.go` and `spatialhash_test.go` stay green. Run `npm test`.
  - Done when: no local in `collision` is named `min` or `max` (`grep -nE '\b(min|max) :?=' app/src/engine/collision` is empty).
- [ ] Task 2.2: Builtin `min`/`max` in `collision`
  - Files: `app/src/engine/collision/spatialhash.go`, `app/src/engine/collision/spatialhash_test.go`
  - Test (*characterization*): a NaN-direction degenerate ray returns 0 hits and does not panic, both before and after the change. Run `npm test && npm run test:perf`, then `BASELINE_SRC=<worktree of the epic branch before this task> node tests/perf/js-vs-wasm.js --ab --repeat 5 --max Infinity`.
  - Done when: `minFloat32`, `maxFloat32`, `min3`, `max3`, `min4` and `max4` are deleted (callers: `triBoxOverlap`, `triBounds`, the auto cell-size loop in `newSpatialHash`, `sweepDominantAxis`), the `_shTri = shTri{}` workaround is reduced to `var _shTri shTri` if the zero-value array bug (*Verified Gaps*) is fixed in 1.8.0 (keep the literal and its comment otherwise), and SH-Map/SH-Flat are no more than 10% slower (A/B ratio ≥ 0.90). If they are slower (f32.min NaN handling can cost more than a select), stop and report.
- [ ] Task 2.3: JS clean-ups
  - Files: `app/src/engine/scene/lightgrid.go`, `app/src/game/weapons.go`, `app/src/engine/engine.go`
  - Test: Task 1.1's `TestToggleDebugFieldPointer` and the existing `lightgrid` tests. Run `npm test && npm run test:dom`.
  - Done when: `clamp01`/`clampIndex` use `min(max(...))` or are removed; `weapons.go:339` uses `max(1.8, aspect)`; `toggleDebug` takes a `*bool` (`toggleDebug("skeleton", &ActiveRenderer.Debug.ShowSkeleton)`) and the stale comment is removed.

---

## Test & Conformance Plan

- **Unit tests:** `app/src/engine/mathx/mat4_test.go` (short-slice panic parity on `[js]`/`[wasm]`); `app/src/engine/collision/spatialhash_test.go` (NaN degenerate ray); `app/src/engine/engine_test.go` and `rendering/pipelines_test.go` (workaround guards).
- **Integration:** `npm run test:all` (check, unit, DOM, perf, Playwright smoke) on a clean `npm ci` with `gofront@^1.8.0`.
- **Negative cases:** `Mat4Multiply` on a 15-element slice panics with Go's message on both backends; `TestZeroMapFieldIsNotNil` flips when upstream fixes the map zero value.
- **Benchmarks:**
  - `node tests/perf/mathx-js.js --repeat 5` (A = 1.7.0 compiler via `GOFRONT_BASELINE_DIR`): ≤ 1.10 per entry.
  - `node tests/perf/js-vs-wasm.js --ab --repeat 5 --max Infinity --gate 'mesh-parse>=0.80'`: no hybrid entry more than 10% slower (mesh-parse 25%, with an upstream issue).
  - `node tests/perf/zero-alloc.js`: raycast ≤ 3,000 B per 100k casts, controller ≤ 0.5 B/frame.
