# GoFront v1.8.0 Adoption — Design Plan

**Version:** continuous  
**Status:** Draft (2026-10-21; re-audited 2026-10-23) — GoFront v1.8.0 is in progress upstream. Its plan was restructured into `Phase <major>.<minor>` dev-loops (GoFront `bc1db13`); under that scheme Phases 0.1–0.9 are merged into `feat/portable-go` (`6aba777`) and Phase 0.10 (JS slice views) is in review (`e3a1a62`). Phases 1.1–7.2 are open, and `gofront@1.8.0` is not published. This plan was re-probed against `e3a1a62` and must be re-checked when v1.8.0 is tagged.  
**Depends on:** GoFront v1.8.0 **tagged and published** ([`gofront/docs/v1.8.0/portable-go-plan.md`](../../../gofront/docs/v1.8.0/portable-go-plan.md)); [`simd-skinning-plan.md`](archive/simd-skinning-plan.md) merged to `master` (A/B perf harness — done, `b70d968`); [`archive/wasm-deferred-features-plan.md`](archive/wasm-deferred-features-plan.md)  
**Replaces:** None  
**Followed by:** [`simd-collision-plan.md`](simd-collision-plan.md) (needs this plan merged to `master`). v1.8.0 is the last feature release of GoFront's JS engine, and v2.0.0 is a byte-identical native port, so this is the last language/stdlib adoption plan before the v2.0.0 toolchain switch.

> **GoFront numbering used in this plan.** GoFront phases are `Phase <major>.<minor>` (e.g. Phase 0.7); GoFront tasks keep their own ids, which are *not* the phase number (Task 0.16a lives in Phase 0.7). SimpleFPS phases and tasks are plain `Phase N` / `Task N.M`. Where both appear, GoFront ids are always prefixed "GoFront".

---

## Goal

GoFront v1.8.0 ("Portable Go completion") makes every language feature behave the same in `js`, `wasm` and `both` packages. It adds a Go-source stdlib, `encoding/json` in WASM, and Go 1.23 iterators, and it completes `gofront/simd` (SIMD adoption has its own plans: [`simd-skinning-plan.md`](archive/simd-skinning-plan.md) and [`simd-collision-plan.md`](simd-collision-plan.md)). SimpleFPS is a mature hybrid engine with strict zero-allocation hot paths, so most of v1.8.0 is **not** something it needs to adopt. The release does carry two real consequences:

1. **A measured regression.** Strict-mode runtime panics (GoFront Tasks 0.16a/b, Phase 0.7, landed) route the JS output of every `both` package through bounds-checked `__at`/`__ix` helpers and `__nilcall` guards. `mathx` is SimpleFPS's only `both` package, and every frame of the JS renderer runs through it. On GoFront `e3a1a62` the JS half of `mathx` is **3.0× slower on `Mat4Multiply`** and **2.3× slower on `Vec3.TransformMat4` and `BoundingBox.TransformInto`** (see the gaps table). The landed elision covers loop indices and constant indices into *arrays*, but `mathx.Mat4` is a *slice* alias (`type Mat4 = []float32`), so none of its 441 constant indices are elided.
2. **A small set of clean-ups.** The `min`/`max` builtins in WASM (GoFront Task 0.11, Phase 0.6, landed) replace six hand-written helpers in `collision`. One stale GoFront workaround in `engine` can go.

This plan bumps SimpleFPS to v1.8.0 without regressing the zero-allocation or throughput invariants. It adopts the clean-ups and records every v1.8.0 capability that is deliberately not adopted, with the reason. `gofront/simd` needs data-layout changes in `animation` and `collision`, so it is planned separately: skinning in [`simd-skinning-plan.md`](archive/simd-skinning-plan.md) (completed on 1.7.0) and collision in [`simd-collision-plan.md`](simd-collision-plan.md) (after this plan).

**Done means:**
- `package.json` depends on `gofront@^1.8.0`, and `npm run test:all` passes with no test changes other than those listed in this plan.
- `npm run test:perf` passes on v1.8.0 (raycast ≤ 3,000 B new-space delta per 100k casts, controller ≤ 0.5 B/frame), and the new `tests/perf/mathx-js.js` A/B benchmark (v1.7.0 vs v1.8.0 compiler, same source, `mathx` compiled as `both`) shows a B/A time ratio of **≤ 1.10** on every gated entry (`Mat4Multiply`, `Mat4Invert`, `Mat4FromRotationTranslationScale`, `Vec3.TransformMat4`, `BoundingBox.TransformInto`), as the median of 5 process runs.
- `node tests/perf/js-vs-wasm.js --ab --repeat 5 --max Infinity --gate 'mesh-parse>=0.80'` (v1.7.0 vs v1.8.0 compiler) shows no hybrid entry more than 10% slower (mesh-parse 25%). The harness reports A time / B time, so > 1 means v1.8.0 is faster: the default 0.90 floor is the 10% slowdown gate, and `--max Infinity` keeps a speedup from failing the default 1.10 ceiling. A 10% gate is the tightest that measured noise allows (A/A spread up to 6.4% per run). It catches the 2–3× strict-mode regression, but not a 3–9% drift.
- `collision` has no hand-written `min*`/`max*` helpers, and `engine.toggleDebug` no longer uses the callback workaround.
- `AGENTS.md` and `docs/architecture.md` are updated, and each phase has its `CHANGELOG.md` entry.

---

## Scope Rule & Boundary Matrix

A v1.8.0 capability is adopted only if it (a) removes a verified SimpleFPS workaround, or (b) beats the existing code on a benchmark without breaking zero-alloc. A capability that only adds expressiveness is not adopted.

| Category | Rule | Examples / Members |
|---|---|---|
| **In scope: core** | Toolchain bump with regression gates on every target | `gofront@^1.8.0`; array value semantics, accessor-ref pointers, per-iteration loop vars, universe scope and JS slice views (no source change, guarded by tests/benchmarks); strict-mode checks in `mathx` JS output (gated by the new benchmark) |
| **In scope: target-specific** | Adopted where it replaces existing code | `min`/`max` builtins in `collision` (WASM), `scene.lightgrid`, `game.weapons` (JS); `&d.Field` pointers in `engine` (JS); `gofront/simd` → [`simd-skinning-plan.md`](archive/simd-skinning-plan.md), [`simd-collision-plan.md`](simd-collision-plan.md) |
| **Excluded: runtime / platform** | Breaks a SimpleFPS invariant | `iter.Seq` / range-over-func and `slices.All`-style iterators on hot paths (closure allocation per call breaks zero-alloc); `context` (no async WASM work); `encoding/json` in WASM (see Out of Scope) |
| **Excluded: deferred** | Valid, but no consumer today | `bufio`, `net/url`, `encoding/csv`, `container/*`, `hash/*`, `crypto/*`, `log`, `math/rand/v2` in WASM, complex numbers, generic type aliases, `fmt` `%T`/`Sprint` |

---

## Verified Gaps & Baseline Audit

The first probes ran on 2026-10-21 against GoFront v1.7.0 and `f69c67a` (the pre-restructure "Phase 0.5" merge). They were re-run on **2026-10-23** against GoFront v1.7.0 (worktree at tag `1.7.0`, `6b396cb`) and GoFront `e3a1a62` (`feat/portable-go-phase-0.10`, new-scheme Phases 0.1–0.10), with SimpleFPS `00e87c4` and no `package.json` change: `GOFRONT_DIR` / `GOFRONT_BASELINE_DIR` point at the worktrees, and `gofront check`/`test` run through the HEAD worktree's CLI. Probe sources live in the session scratchpad; the A/B probe imports `loadSide`/`abRatio` from `tests/perf/ab.js`. Rows marked *(2026-10-21)* were not re-run.

| Area | Finding | Evidence & Probe Reference |
|---|---|---|
| Toolchain regression (HEAD) | No functional regression. `gofront check` passes on all 13 packages and `gofront test app/src/...` passes. | `node <gf-head>/src/index.js check app/src/...` → `13 packages — OK`; `… test app/src/...` → `PASS` |
| Zero-alloc (HEAD) | Unchanged from v1.7.0: raycast SH-Map/SH-Flat 2,960 B per 100k casts, controller 0.2 B/frame, skinning 0.15 B/frame. Array value semantics (GoFront Task 0.8a) does not add copies for `_radialDirs[i][0]` / `_horizontalCheckHeights[h]` in [`fpscontroller.go:39-40`](../../app/src/engine/physics/fpscontroller.go#L39-L40). | `GOFRONT_DIR=<gf-head> node tests/perf/zero-alloc.js` |
| Hybrid throughput (HEAD vs v1.7.0) | Every entry within noise, median of 5 process runs (A/B, > 1 = HEAD faster): controller 1.018, skinning-world 1.015, skinning-palette 0.989, skinning-total 0.992, mesh-parse 0.989, anim-parse 1.008, SH-Map 0.983, SH-Flat 0.987. Gate passed. **The mesh-parse watch item from 2026-10-21 (≈ +10% on `f69c67a`) is gone.** | `GOFRONT_BASELINE_DIR=<gf-170> GOFRONT_DIR=<gf-head> node tests/perf/js-vs-wasm.js --ab --repeat 5 --max Infinity --gate 'mesh-parse>=0.80'` |
| Wasm size | Identical *(2026-10-21)*: physics+collision+mathx 98,479 B, animation+mathx 62,533 B, decoder 76,180 B (unoptimised). | Same bench output |
| Strict-mode index checks (GoFront Tasks 0.16a/b, landed) | **Measured JS regression.** The JS half of `mathx` compiled as `both` on HEAD contains 204 `__at` and 276 `__ix` call sites (0 on 1.7.0). B/A time, two runs: `Mat4Multiply` **2.99–3.02×**, `Mat4Invert` 1.70–1.74×, `Mat4FromRotationTranslationScale` 1.73–1.79×, `Vec3.TransformMat4` 2.31–2.33×, `BoundingBox.TransformInto` 2.30–2.33×. The landed elision ([`gofront/src/lower/bounds.js`](../../../gofront/src/lower/bounds.js)) marks only `for i := range xs`, `for i := K; i < len(xs); i++`, and constant indices into **arrays**. It has no rule for a `_ = xs[k]` or `len` guard proof, so BCE hints in SimpleFPS source do nothing on their own. [`mat4.go`](../../app/src/engine/mathx/mat4.go) has 441 constant slice indices (`grep -oE '[A-Za-z_][A-Za-z0-9_]*\[[0-9]+\]' app/src/engine/mathx/mat4.go \| wc -l`). | Probe `mathx-ab.mjs`: `loadSide({pkg: "engine/mathx"})` with no `forceTarget`, 2M calls × 9 interleaved rounds; probe `emit.mjs` counts helpers in the emitted JS |
| Strict mode needs `both` | The checks are emitted only when the package target is `both` (`isStrict = options.strict \|\| pkgTarget === "both"`). Compiling `mathx` with `forceTarget: "js"` emits **no** checks on HEAD, so a benchmark built that way would show no regression at all. | [`gofront/src/compiler.js:657`](../../../gofront/src/compiler.js#L657); probe `emit.mjs <gf-head> js` → 0 `__at` |
| Strict-mode nil-deref checks (landed) | 451 `__nilcall` guards in the `mathx` JS. `Vec3.Add` measured 1.13–1.19× and `Vec3.Normalize` 1.06–1.21×. These entries are too small to gate: an **A/A run of HEAD against itself gave `Vec3.Add` 1.38×** and `Vec3.Normalize` 1.03×. | Probe `mathx-ab.mjs` (A/B and A/A) |
| `min`/`max` builtins in WASM | Landed upstream (GoFront Task 0.11, Phase 0.6, `a7fae0d`); not available on v1.7.0 (`Unresolved identifier: min` in a `both` package). SimpleFPS works around it with `minFloat32`, `maxFloat32`, `min3`, `max3`, `min4`, `max4` ([`spatialhash.go:320-382`](../../app/src/engine/collision/spatialhash.go#L320-L382)). Their callers are `triBoxOverlap`, `sweepDominantAxis` (`min4`/`max4`) and `triBounds` (`min3`/`max3`, [`spatialhash.go:386`](../../app/src/engine/collision/spatialhash.go#L386)), which both triangle-bounds loops in `newSpatialHash` share. | Probe `p2` *(2026-10-21)*; GoFront plan Task 0.11 `[x]` on `feat/portable-go` |
| `min`/`max` in JS packages | Already work, but unused: [`weapons.go:339`](../../app/src/game/weapons.go#L339) round-trips through `float32(math.Max(1.8, float64(aspect)))`, and [`lightgrid.go:79-95`](../../app/src/engine/scene/lightgrid.go#L79-L95) hand-rolls `clampIndex`/`clamp01`. | Source |
| Pointer to bool field (JS) | **Stale workaround.** [`engine.go:212`](../../app/src/engine/engine.go#L212) says `&d.ShowSkeleton` "would be a detached box". In a `js` package, `flip(&o.Show)` writes through on v1.7.0 and HEAD; the detached box was a WASM-only bug, fixed by GoFront Task 0.1b (Phase 0.1). | Probe `p1` `TestFieldPtr` *(2026-10-21)* |
| Map field zero value (JS) | **Not fixed in v1.8.0 for `js` packages.** A zero `map` struct field is `{}`, not `nil`. GoFront Task 0.16a's frozen `__nilmap` sentinel applies only to strict (`both`) packages, and `rendering` is `js`. The workaround at [`pipelines.go:225-228`](../../app/src/engine/rendering/pipelines.go#L225-L228) (`hasDepth`) must stay. | Probe `p1` `TestMapNil` *(2026-10-21)*; GoFront plan Task 0.16a *Landed* note |
| Reslice allocation (JS) | Changed but still allocating. GoFront Task 0.20 (Phase 0.10, in review) makes `b[i:j]` on plain JS arrays a `Proxy` view sharing the backing store instead of a `.slice()` copy. Each reslice still allocates a view, so the `DrawList` design and the index loops stay. Their comments now describe the old mechanism: [`drawable.go:42-44`](../../app/src/engine/rendering/drawable.go#L42-L44) ("as `.slice()`") and [`renderer.go:314`](../../app/src/engine/rendering/renderer.go#L314). SimpleFPS JS packages have no reslice expressions, so behaviour does not change. | GoFront plan Task 0.20 *Landed* note; `grep -nE '\[[a-zA-Z0-9_]*:[a-zA-Z0-9_]*\]'` over `rendering`, `scene`, `engine`, `game` → comments only |
| `encoding/json` in WASM | Rejected on v1.7.0 and HEAD (`'json.Unmarshal' is not yet available in wasm packages`); planned in GoFront Phases 5.1–5.2. All five SimpleFPS JSON call sites (`assets/resources.go`, `materialloader.go`, `meshloader.go`, `systems/settings.go`, `game/arena.go`) are in JS packages and run at load time only. | Probe `p3` *(2026-10-21)*; grep `json\.` |
| `gofront/simd` in exported structs | An exported struct with an `F32x4` field fails the build (`cannot cross the JS↔WASM boundary in 1.7.0`); the fix is GoFront Task 6.2 (Phase 6.1, open). Unexported SIMD structs work, with two limits found in the skinning plan: an unexported `F32x4` field inside an *exported* struct is also rejected, and a package-level `var x <simd struct>` fails WebAssembly validation (use `make([]T, 1)`). | Probe `p4` *(2026-10-21)*; see [`simd-skinning-plan.md`](archive/simd-skinning-plan.md), [`simd-collision-plan.md`](simd-collision-plan.md) |
| Breaking: `maps.Keys`/`Values` → `iter.Seq` | No impact. SimpleFPS does not import `maps`. | grep `maps\.` → none |
| Shadowed builtins | `rayAABBInterval` declares locals named `min`/`max` (`min := &aabb.Min`). This is legal Go, but it blocks the builtin inside that function. It is the only one left. | [`spatialhash.go:85-86`](../../app/src/engine/collision/spatialhash.go#L85-L86) |
| Zero-value package-level arrays (WASM, 1.7.0) | On GoFront 1.7.0 a zero-value package-level array, or a zero-value struct with array fields, is nil in WASM and panics on first index. `collision` works around it with `_shTri = shTri{}`. GoFront Phases 0.5 (Tasks 0.8a/b) and 0.9 (Task 0.19b, array type completion) target this area; not re-probed. | [`spatialhash.go:30-35`](../../app/src/engine/collision/spatialhash.go#L30-L35) |

---

## Out of Scope

- **`encoding/json` in WASM.** Every JSON parse is a one-off at load time in a JS package. The JS backend uses native `JSON.parse`, which a WASM codec will not beat, and moving the loaders into WASM would add boundary copies of every decoded slice. (The legacy JSON mesh path, used by one `.mesh` file, should be retired by converting that asset to `.bmesh`. That is a separate change.)
- **Iterators (`iter`, range-over-func, `slices.All`/`Values`/`Sorted`, `strings.SplitSeq`).** Each iteration allocates a yield closure. Hot paths keep the "write into a caller buffer, return a count" contract. Load-time code gains nothing that justifies the churn.
- **New pure packages (`bufio`, `net/url`, `context`, `encoding/csv`, `container/*`, `hash/*`, `crypto/*`, `log`, `math/rand/v2`).** No consumer exists. `math/rand/v2` in WASM was considered for projectile scatter and is moot: the [deferred-features plan](archive/wasm-deferred-features-plan.md) dropped that batching.
- **Map-field `nil` and reslice allocation.** v1.8.0 does not remove either cost for SimpleFPS. The map-field issue is prerequisite P2 (see *Implementation Tasks*); the workarounds stay, and only their comments are updated.
- **`gofront/simd`.** It needs data-layout changes in `animation` and `collision`, so it is planned separately in [`simd-skinning-plan.md`](archive/simd-skinning-plan.md) and [`simd-collision-plan.md`](simd-collision-plan.md).
- **Changing `mathx.Mat4` to `[16]float32`.** That would get constant-index elision for free, but with v1.8.0 array value semantics every `Mat4` assignment or argument becomes a copy, and the whole JS renderer would need rewriting. It is the fallback only if the upstream fix (prerequisite P1) is rejected (see Approach §1).
- **v2.0.0 native-engine adoption.** It is a separate plan once v2.0.0 ships; the output is byte-identical by design.

---

## Approach

### 1. Architecture & Design Decisions

- **The bump comes first, and it is gated by measurement.** The A/B harness from [`simd-skinning-plan.md`](archive/simd-skinning-plan.md) compiles the same source with two compilers (`GOFRONT_BASELINE_DIR` = 1.7.0, current = 1.8.0) and interleaves them in one process, so there are no machine-dependent baselines in git. The same harness can re-measure each upstream GoFront phase before the tag (`GOFRONT_DIR=../gofront`); that check is manual and not a task here.
- **New benchmark `tests/perf/mathx-js.js`.** It compiles `engine/mathx` as the `both` package it is (no `forceTarget`; strict mode exists only for `both`, see *Verified Gaps*) and times the JS half: `Mat4Multiply`, `Mat4Invert`, `Mat4FromRotationTranslationScale`, `Vec3.TransformMat4` and `BoundingBox.TransformInto` (gated), plus `Vec3.Add`/`Normalize` (report-only, since A/A noise on sub-10 ns entries reaches 1.38×). It interleaves A and B over 9 rounds of 2M calls, runs through `tests/perf/ab.js`, and fails if a gated entry's median B/A time ratio over 5 process runs exceeds 1.10. With no baseline compiler configured, it skips.
- **Strict mode in `mathx` is resolved upstream, not worked around locally.** `mathx` must stay `both` (shared by the JS renderer and the WASM physics). The landed elision cannot be extended from SimpleFPS, so the fix is a GoFront change to `src/lower/bounds.js` (prerequisite P1): elide the check for a constant index `k` once the same function has proven `len(xs) > k`. The proof is either the Go bounds-check-elimination hint `_ = xs[k]` or an explicit `if len(xs) < k+1 { panic(...) }`. One check per argument then replaces sixteen. Pointer field access gets the same treatment: one nil check per pointer per function, after which the pointer is treated as proven non-nil. Once P1 lands, SimpleFPS adds `_ = out[15]; _ = a[15]; _ = b[15]` at the top of each `Mat4*` function, which is idiomatic Go and is also BCE-friendly under real `gc`.
- **Decision rule for the bump.** If the v1.8.0 `mathx-js.js` ratio is above 1.10 on a gated entry after the hints (or P1 has not landed by the tag), the bump does not merge: SimpleFPS stays on `^1.7.0` and the numbers go to the upstream issue. GoFront's own release gate (no hybrid-raycast regression above 3%) runs in WASM and does not cover the JS renderer path. The 2026-10-23 probe shows that gate passing while `mathx` JS is 3× slower, so SimpleFPS has to enforce this itself.
- **`min`/`max` replace helpers, without changing semantics on finite input.** Go's `min` on floats propagates NaN, while `a < b ? a : b` returns `b` when `a` is NaN. Collision inputs are finite triangle coordinates, so behaviour on real geometry is unchanged. The NaN case gets its own test so the difference is a deliberate, recorded change rather than an accident.

**Rejected alternatives:**
- *Splitting `mathx` into `mathx` (js) and `mathxw` (wasm).* This duplicates 1,900 lines and breaks the single-source invariant from the [v1.6.1 adoption](archive/wasm-v1.6.1-adoption-plan.md).
- *Asking upstream to make strict mode opt-out per package.* The GoFront plan rules this out explicitly ("the checks are never shipped disabled").
- *Hoisting `Mat4` elements into locals by hand.* `Mat4Multiply` already reads `a` into locals (`let [a00, …] = [__at(a, 0), …]`) and still measures 3.0×: every read is checked once, and there is no cheaper form without an elision proof.

### 2. Invariants & Safety Bounds

- **Zero per-frame allocations:** `tests/perf/zero-alloc.js` thresholds stay as they are.
- **`mathx` stays `both` and keeps no mutable package state**, as required by AGENTS.md.
- **The boundary API is unchanged:** no exported signature in `collision`, `physics`, `animation` or `decoder` changes.
- **Generated assets are untouched.**
- **Single source of truth for numbers:** gates compare A and B in the same process; this document records the measured ratios.

### 3. Edge Cases & Error Handling

- **Shadowed `min`/`max` locals:** in `rayAABBInterval` (the only function left that declares them), rename `min`/`max` to `lo`/`hi` *before* introducing the builtins. Otherwise the builtin silently resolves to the local `*mathx.Vec3`, and the result is a type error or, worse, a valid call to the wrong thing.
- **NaN through `min`/`max`:** add a `spatialhash_test.go` case for a degenerate ray (NaN direction component) that asserts the query returns 0 hits without panicking, on both the old and new helpers.
- **The mesh-parse watch item:** resolved on `e3a1a62` (0.989×). If it returns on the tagged release, bisect GoFront from `f69c67a` and file the result upstream. It is load time only, so it does not block the bump unless it exceeds 25% (the `--gate 'mesh-parse>=0.80'`).
- **JS slice views:** if the Playwright smoke test or a DOM test fails on 1.8.0 in code that reslices a plain array (e.g. a `Proxy` view reaching a browser API that rejects it), stop and report it upstream against GoFront Task 0.20. Do not rewrite SimpleFPS around it.

---

## Implementation Tasks

> **Execution notes (for `/execute-plan` and `/dev-loop`):**
> - **Do not start before both entry gates hold:** (1) `npm view gofront@1.8.0 version` succeeds (fails on 2026-10-23); (2) [`simd-skinning-plan.md`](archive/simd-skinning-plan.md) is merged to `master` (`tests/perf/ab.js` exists there; holds). If either fails, do not create `feat/gofront-v1.8.0-adoption`; report blocked. After that, `/execute-plan --auto` is safe: neither phase waits on anything external once P1 is resolved or waived.
> - **Prerequisites owned by the user** (outside the dev-loop; filing issues on another repository is not part of its authorization): (P1) a GoFront issue asking strict-mode elision (`src/lower/bounds.js`) to accept a `_ = xs[k]` / `len` guard proof for constant slice indices and to hoist nil checks per function, with the 2026-10-23 `mathx-ab.mjs` numbers (3.0× `Mat4Multiply`). It blocks Task 1.4's gate unless it is resolved or explicitly waived. (P2) a GoFront issue for the map-field zero value `{}` vs `nil` in `js` packages.
> - `/dev-loop` runs the `AGENTS.md` pre-commit gate (`lefthook run pre-commit && npm test && npm run test:dom`) on every task. Each task's **Test** names only the extra commands (perf, build, e2e) that gate does not cover.
> - `/dev-loop` writes one `CHANGELOG.md` entry per phase on the phase's last task (`/dev-loop` Step 2). Archiving the plan and updating the roadmap happen in `/execute-plan` Step 4, so there is no close-out task.
> - **The working tree must be clean:** no `file:` link in `package.json`. The baseline compiler is a 1.7.0 checkout passed as `GOFRONT_BASELINE_DIR`.
> - **Gate misses:** if a benchmark `Done when` is not met, stop and report (AGENTS *Blockers*). Do not revert or rework without the user's decision.

### Phase 1: Toolchain bump & strict-mode gate
- [ ] Task 1.1: Workaround guard tests (on 1.7.0, before the bump)
  - Files: `app/src/engine/engine_test.go`, `app/src/engine/rendering/pipelines_test.go`
  - Test (*characterization*): `TestToggleDebugFieldPointer` flips `ActiveRenderer.Debug.ShowSkeleton` through a `*bool` helper and asserts the write is visible; `TestZeroMapFieldIsNotNil` documents the `{}` zero value (it fails once GoFront fixes it, which signals that `hasDepth` can go).
  - Done when: both pass on 1.7.0, and each comments on the workaround it guards.
- [ ] Task 1.2: Bump the dependency
  - Files: `package.json`, `package-lock.json`, `AGENTS.md` (Part 2 *Tech Stack*: "uses GoFront >= 1.8.0")
  - Test: `npm ci && npm run test:all`, then `GOFRONT_BASELINE_DIR=<1.7.0 checkout> node tests/perf/js-vs-wasm.js --ab --repeat 5 --max Infinity --gate 'mesh-parse>=0.80'`, then `npm run build` on 1.7.0 and on 1.8.0 to compare `public/app.wasm` and `public/app.js`.
  - Done when: `"gofront": "^1.8.0"`; `test:all` is green, including Task 1.1's guards, the zero-alloc thresholds and the `tri` SIMD canary (no longer skipped on 1.8.0); every hybrid A/B entry passes the gate above (no more than 10% slower; mesh-parse 25%); the release `app.wasm` is ≤ 82 kB (80.1 kB in the v1.6.1 adoption); the hybrid ratios, both release sizes and the `app.js` growth from strict-mode helpers are recorded under *Verified Gaps*.
- [ ] Task 1.3: `mathx` JS A/B benchmark
  - Files: `tests/perf/mathx-js.js` (new), `package.json` (`test:perf` runs it)
  - Test: A/A (`GOFRONT_BASELINE_DIR` = the current compiler) gives every gated entry 0.90–1.10. The real A/B against 1.7.0 is expected to show ≈ 3× on `Mat4Multiply` until P1 lands and Task 1.4 adds the hints. That result is recorded here, not committed as a red test: `npm run test:perf` skips the benchmark without a baseline compiler, so the quality gate stays green.
  - Done when: the script compiles `engine/mathx` with no `forceTarget`, reports the median ratio for the 5 gated and 2 report-only entries over 5 process runs, gates at a B/A time ratio of 1.10 (A/B ≥ 0.91 in `ab.js`'s convention, so a speedup passes), and skips without a baseline compiler.
- [ ] Task 1.4: BCE hints in `mathx`
  - Files: `app/src/engine/mathx/mat4.go`, `app/src/engine/mathx/boundingbox.go`, `app/src/engine/mathx/mat4_test.go`
  - Test: `mat4_test.go` checks that a 15-element `Mat4` passed to `Mat4Multiply` panics with `index out of range [15] with length 15` on `[js]` and `[wasm]`. Then run `node tests/perf/mathx-js.js --repeat 5` against 1.7.0.
  - Done when: every `Mat4*` function that indexes constants starts with `_ = x[15]` per `Mat4` parameter, and every gated `mathx-js` entry is ≤ 1.10. This needs P1 in the tagged compiler: the landed elision ignores the hints. If P1 has not landed, or an entry stays above 1.10, stop and report: SimpleFPS stays on `^1.7.0` (decision rule, Approach §1).

### Phase 2: Language clean-ups
- [ ] Task 2.1: Rename shadowing locals in `collision`
  - Files: `app/src/engine/collision/spatialhash.go` (`rayAABBInterval`)
  - Test (*characterization*): the existing `ray_test.go` and `spatialhash_test.go` stay green under the pre-commit gate.
  - Done when: no local in `collision` is named `min` or `max` (`grep -nE '\b(min|max) :?=' app/src/engine/collision` is empty).
- [ ] Task 2.2: Builtin `min`/`max` in `collision`
  - Files: `app/src/engine/collision/spatialhash.go`, `app/src/engine/collision/spatialhash_test.go`
  - Test (*characterization*): a NaN-direction degenerate ray returns 0 hits and does not panic, both before and after the change. Then run `npm run test:perf` and `BASELINE_SRC=<worktree of the epic branch before this task> node tests/perf/js-vs-wasm.js --ab --repeat 5 --max Infinity`.
  - Done when: `minFloat32`, `maxFloat32`, `min3`, `max3`, `min4` and `max4` are deleted (callers: `triBoxOverlap`, `triBounds`, the auto cell-size loop in `newSpatialHash`, `sweepDominantAxis`), the `_shTri = shTri{}` workaround is reduced to `var _shTri shTri` if the zero-value array bug (*Verified Gaps*) is fixed in 1.8.0 (keep the literal and its comment otherwise), and SH-Map/SH-Flat are no more than 10% slower (A/B ratio ≥ 0.90). If they are slower (f32.min NaN handling can cost more than a select), stop and report.
- [ ] Task 2.3: JS clean-ups
  - Files: `app/src/engine/scene/lightgrid.go`, `app/src/game/weapons.go`, `app/src/engine/engine.go`
  - Test: Task 1.1's `TestToggleDebugFieldPointer` and the existing `lightgrid` tests, under the pre-commit gate.
  - Done when: `clamp01`/`clampIndex` use `min(max(...))` or are removed; `weapons.go:339` uses `max(1.8, aspect)`; `toggleDebug` takes a `*bool` (`toggleDebug("skeleton", &ActiveRenderer.Debug.ShowSkeleton)`) and the stale comment is removed.
- [ ] Task 2.4: Docs and stale toolchain comments
  - Files: `AGENTS.md` (Part 2 *Zero per-frame allocations*: `min`/`max` are builtins in every target; strict-mode checks in `both` packages and the `_ = x[15]` hint rule for `mathx`), `docs/architecture.md` (performance invariants: strict mode in `mathx` and the `mathx-js.js` gate), `app/src/engine/rendering/drawable.go` + `renderer.go` (reslice comments)
  - Test: `grep -n 'as .slice()' app/src/engine/rendering` is empty; `npm run check`.
  - Done when: the docs describe the v1.8.0 rules, and the `DrawList` and index-loop comments say a reslice allocates a view (GoFront Task 0.20), with no claim that it copies.

---

## Test & Conformance Plan

- **Unit tests:** `app/src/engine/mathx/mat4_test.go` (short-slice panic parity on `[js]`/`[wasm]`); `app/src/engine/collision/spatialhash_test.go` (NaN degenerate ray); `app/src/engine/engine_test.go` and `rendering/pipelines_test.go` (workaround guards).
- **Integration:** `npm run test:all` (check, unit, DOM, perf, Playwright smoke) on a clean `npm ci` with `gofront@^1.8.0`.
- **Negative cases:** `Mat4Multiply` on a 15-element slice panics with Go's message on both backends; `TestZeroMapFieldIsNotNil` flips when upstream fixes the map zero value.
- **Benchmarks:**
  - `node tests/perf/mathx-js.js --repeat 5` (A = 1.7.0 compiler via `GOFRONT_BASELINE_DIR`, `mathx` compiled as `both`): ≤ 1.10 on each gated entry; `Vec3.Add`/`Normalize` report-only.
  - `node tests/perf/js-vs-wasm.js --ab --repeat 5 --max Infinity --gate 'mesh-parse>=0.80'`: no hybrid entry more than 10% slower (mesh-parse 25%).
  - `node tests/perf/zero-alloc.js`: raycast ≤ 3,000 B per 100k casts, controller ≤ 0.5 B/frame.
