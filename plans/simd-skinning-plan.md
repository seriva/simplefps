# SIMD Skinning & Perf Harness — Design Plan

**Version:** continuous  
**Status:** Completed (2026-10-22)  
**Depends on:** GoFront ≥ 1.7.0 (current). No upstream wait; this plan can run now.  
**Replaces:** Phases 1–2 of the withdrawn `simd-adoption-plan.md` (split by toolchain readiness so the epic branch can merge without waiting for GoFront v1.8.0)  
**Followed by:** [`gofront-v1.8.0-adoption-plan.md`](gofront-v1.8.0-adoption-plan.md) (uses this plan's A/B harness), then [`simd-collision-plan.md`](simd-collision-plan.md)

---

## Goal

This plan does two things:
1. **It builds the shared perf harness.** That is an in-process A/B benchmark runner, a SIMD kernel canary, and a check that keeps `gofront/simd` out of JS packages. The GoFront v1.8.0 adoption plan and the SIMD collision plan both gate on it, so it lands on `master` first.
2. **It moves skinning to `gofront/simd`.** On GoFront 1.7.0, a 4-column `F32x4` multiply over the 64-joint palette is several times faster than scalar WASM, with bit-identical results (3.79–3.93× in the planning probe, 6.6–7.5× in the checked-in canary). Skinning in WASM today runs at 0.90–1.04× of JS-only, so WASM buys it nothing yet. Reaching SIMD takes a data-layout change: the matrices live in `[]mathx.Mat4` GC slices, which cannot be loaded as `v128`, and `mathx.Mat4Multiply` is in a `both` package.

**Done means:**
- `node tests/perf/ab.js --self-test` (A/A, same compiler and source on both sides) reports every entry within 0.90–1.10 as the median of 5 process runs, so the harness can tell the 10% gates it serves apart from noise.
- The skinning hybrid A/B ratio against `master` source is **≥ 1.30×** (median of 5 process runs). `SkinMatrices` output is bit-identical to the scalar path on the 3-pose fixture.
- `tests/perf/zero-alloc.js` has a skinning case (world chain + palette on a pre-built pose; see Task 2.4) at ≤ 0.5 B/frame. The existing raycast and controller thresholds are unchanged.
- `npm run check` fails on any `gofront/simd` import in a package without `//gofront:target wasm`.
- `AGENTS.md` (SIMD rule), `docs/architecture.md` (skinning data layout, perf harness) and `CHANGELOG.md` are updated.

---

## Scope Rule & Boundary Matrix

SIMD is allowed only in `wasm` packages, only in unexported types and functions, and only behind a measured gate. No `F32x4` crosses the JS↔WASM boundary.

| Category | Rule | Examples / Members |
|---|---|---|
| **In scope: core** | Test tooling and invariants | `tests/perf/ab.js` (A/B runner), `tests/perf/simd-kernels.js` (canary), `scripts/check-simd.js`, the AGENTS SIMD rule |
| **In scope: target-specific** | WASM `animation` | `mat4c` column packets; SIMD world chain and palette, stored straight into `SkinMatrices` (`shared.Float32`) |
| **Excluded: runtime / platform** | The JS fallback breaks zero-alloc | `F32x4` in `mathx`/`rendering`/`scene`/`game` is a frozen array that allocates per operation (≈ 180–194 ns/op, measured) |
| **Excluded: deferred** | Valid, but handled elsewhere or not worth it | Collision SIMD ([`simd-collision-plan.md`](simd-collision-plan.md)); `PoseLerp` slerp (bound by transcendentals, and nlerp would be a visual change); controller ray packets (order dependent, ≈ 3 µs per step) |

---

## Verified Gaps & Baseline Audit

Probes ran on 2026-10-21: GoFront 1.7.0 (worktree at tag `1.7.0`) and HEAD `f69c67a`, release builds. The original probe sources were not kept. Task 1.3 recreated them as `tests/perf/fixtures/simd/{kern,jsfb,tri}`; their numbers differ where noted.

| Area | Finding | Evidence & Probe Reference |
|---|---|---|
| Palette kernel | 64 joints, world × inverseBind into a `shared.Float32`. Scalar 1,814–1,838 ns/frame vs SIMD 467–479 ns/frame, **3.79× (1.7.0) and 3.93× (HEAD)**, bit-identical. The recreated `kern` measures 6.6–7.5×: its scalar side mirrors the real layout (`[]float32` matrices plus a 16-float copy). An all-in-shared-buffer variant measured 2.43×, so the ratio depends on the layout compared. | Probe `simd/kern` + `run.mjs` |
| Current layout | `InverseBindMatrices`/`worldMatrices` are `[]mathx.Mat4` (GC slices), and the multiply goes through the `both`-package `mathx.Mat4Multiply`. Neither can reach `v128`. | [`skeleton.go:42-44`](../app/src/engine/animation/skeleton.go#L42-L44), [`skeleton.go:147`](../app/src/engine/animation/skeleton.go#L147), [`skeleton.go:172-177`](../app/src/engine/animation/skeleton.go#L172-L177) |
| Skinning cost | Hybrid 6,827–7,351 ns/frame, 0.90–1.04× of JS-only. The demo arena has 5 NPCs (6 spawn points minus the player's). | `npm run bench` ×3 on both versions; [`arena.go:358-366`](../app/src/game/arena.go#L358-L366) |
| JS fallback | 1M `F32x4` mul+add in a `js` package: ≈ 2.87 MB new-space per run, 180.5 ns/op (HEAD) and 193.5 ns/op (1.7.0). The recreated `jsfb` measures ≈ 4.4 MB and ≈ 141–154 ns/op. | Probe `simd/jsfb` |
| Debug consumer | `DrawSkeleton` reads `GetWorldMatrices` (`[]mathx.Mat4`) from JS. | [`skinnedmeshentity.go:183-189`](../app/src/engine/scene/skinnedmeshentity.go#L183-L189) |
| Benchmark noise | Separate process runs of one build vary by up to ±7% (controller hybrid 2,812–3,022 ns). An interleaved in-process A/A of one `Mat4Multiply` gives B/A ratios of 0.936–1.020 across 6 runs (median 0.985). A single run cannot resolve a 3–5% gate; a median of 5 runs against a 10% gate can. | `js-vs-wasm.js` ×3; probe `strict/aa.mjs` ×6 |
| Existing harness | `tests/perf/*.js` compile with `compileDir` from `GOFRONT_DIR` (or the installed package), and they compare absolute numbers between separate runs. There is no in-process A/B and no baseline-source option. | [`js-vs-wasm.js:23-60`](../tests/perf/js-vs-wasm.js#L23-L60) |
| Task 2.4 A/B result (2026-10-22) | Against a worktree of `4c18bdf` (pre-Phase-2), median of 5 runs: **skinning-total 2.078×** (2.027–2.171; 6,143 → 2,934 ns/op), skinning-palette 2.834×, skinning-world 1.118× (`GetWorldMatrices` also unpacks `worldC`). Every other entry is within 0.90–1.10. Side A still pays the ≈ 24 B `int` return, so the total credits the void-return change and SIMD together. Output is bit-identical to the scalar 3-pose fixtures. | `node tests/perf/js-vs-wasm.js --ab --repeat 5 --gate 'skinning-total>=1.30' --gate skinning-world=off --gate skinning-palette=off` |
| Task 2.4 zero-alloc result (2026-10-22) | **0.15 B/frame** (budget 0.5): 20,000 frames of `ComputeSkinningMatrices` on a pre-built 64-joint pose plus palette copy-out. A full-frame case first measured 62–72 B/frame, the same as pre-Phase-2 (72.1), from two existing costs: any `int` return across the boundary allocates ≈ 24 B per call on GoFront 1.7.0, and `AnimationPlayer.Update` costs ≈ 48 B/frame. By user decision the first is fixed here (void `ComputeSkinningMatrices`, cached `SkinJointCount()`); the second is a follow-up. | `node tests/perf/zero-alloc.js`; per-call probes against the `4c18bdf` worktree |
| Quality gates | `lefthook` pre-commit runs only `format` and `check`, and CI runs `check` and `test` on `master` pushes only. Perf gates exist only where a task runs them. | [`lefthook.yml`](../lefthook.yml), `.github/workflows/ci.yml` |

---

## Out of Scope

- **SIMD outside `wasm` packages.** The fallback allocates and is slower than scalar JS. Task 1.4 enforces this.
- **Collision SIMD.** It needs GoFront v1.8.0 (the collision plan's 4-wide triangle probe traps on 1.7.0), so it lives in [`simd-collision-plan.md`](simd-collision-plan.md).
- **`PoseLerp` and controller packets.** See the scope matrix.
- **Absolute-number baselines checked into git.** They depend on the machine. The harness compares A and B in the same process on the same machine.

---

## Approach

### 1. Architecture & Design Decisions

**A/B harness (`tests/perf/ab.js`).**
- `loadSide({ gofrontDir, srcRoot, pkg, exports, forceTarget })` compiles one package with a given compiler and a given source tree, reusing the `loadPackage` pattern from `js-vs-wasm.js`.
- Side A defaults to `GOFRONT_BASELINE_DIR` (compiler) and `BASELINE_SRC` (a worktree of the base branch). Side B is the current tree and the current compiler. Each knob is optional, so you can compare compilers, sources, or both.
- `abRatio(entries, { rounds: 9 })` interleaves A and B per round (ABAB…) after warm-up and reports `median(A)/median(B)` as a speedup (> 1 means B is faster).
- `--repeat 5` re-spawns the script 5 times and gates on the **median of the 5 ratios**, because one process run spreads up to 6.4% (A/A probe).
- With neither knob set, the script prints `skipping: set GOFRONT_BASELINE_DIR and/or BASELINE_SRC` and exits 0, so `test:perf` keeps working on a bare checkout.

**SIMD rule check (`scripts/check-simd.js`).**
- It walks `app/src/**/*.go` (except `_test.go`), reads each file's package directory target from the `//gofront:target` line, and fails with `file:line` if `gofront/simd` is imported in a non-`wasm` package. Tests use fixture directories under `tests/fixtures/check-simd/`, so no real package is touched.

**Skinning (`engine/animation`).**
- An unexported `mat4c struct{ c0, c1, c2, c3 simd.F32x4 }` (column-major, matching `mathx.Mat4`), with `fromMat4`/`toMat4` and `mulMat4c(out *mat4c, a, b *mat4c)`, which computes `out.cK = a.c0·Splat(b.cK.x) + a.c1·Splat(b.cK.y) + a.c2·Splat(b.cK.z) + a.c3·Splat(b.cK.w)`. The operation order matches `mathx.Mat4Multiply`, so results are bit-identical.
- **As built, the packed data lives outside `Skeleton`.** GoFront 1.7.0 checks every field of an exported wasm struct for the boundary, unexported ones included, and rejects `F32x4`. So `invBindC`/`worldC` live in an unexported `skeletonPack`, held in the package-level `_packs` and referenced by `Skeleton.pack` (an index). One pack is created per `NewSkeleton` and never freed.
- A package-level `var x mat4c` fails WebAssembly validation on 1.7.0, so the scratch local matrix is `_scratchC = make([]mat4c, 1)`.
- `computeWorldMatrices` builds the local matrix from the quaternion as four `NewF32x4` columns and chains with `mulMat4c`. `ComputeSkinningMatrices` multiplies by `invBindC` column by column and stores each column with `simd.StoreF32x4(SkinMatrices, …)`, replacing the 16-iteration copy loop.
- `ComputeSkinningMatrices` is void (user decision in Task 2.4): an `int` return costs ≈ 24 B per call. Callers read the new `SkinJointCount()` (`JointCount` capped at `MaxSkinJoints`) once at load. The exported `[]mathx.Mat4` fields stay, but `InverseBindMatrices` is copied into `invBindC` at construction, so later writes to it do not affect skinning.
- `GetWorldMatrices` (the debug path) recomputes the chain and unpacks `worldC` into the `[]mathx.Mat4` only when it is called.

**Rejected alternatives:** SoA in `shared.Float32` (startup-sized memory caps the number of skeletons); SIMD in `mathx` (a `both` package, so it would take the JS fallback); checked-in absolute baselines (they depend on the machine).

### 2. Invariants & Safety Bounds

- SIMD only in `wasm` packages, and no `F32x4` in exported API.
- Zero per-frame allocations: `mat4c` slices are allocated in `NewSkeleton`, never per frame.
- `SkinMatrices` and `GetWorldMatrices` output are bit-identical to the scalar path.
- `test:perf` stays green without A/B configuration (the harness skips instead of failing).

### 3. Edge Cases & Error Handling

- **Joints over `MaxSkinJoints` (64):** same clamp as today; only `n` palettes are stored.
- **Root joints (`parent < 0`):** `worldC[i] = localC`, a struct copy of 4 `v128` values.
- **`GetWorldMatrices` called between frames:** the lazy copy reads the last computed `worldC`, matching today's "overwritten on next call" contract.
- **A/B with mismatched exports:** if side A's source lacks an export that side B has (for example a new benchmark entry), the harness reports that entry as `B-only` and does not gate on it.

---

## Implementation Tasks

> **Execution notes (for `/execute-plan` and `/dev-loop`):**
> - Epic branch `feat/simd-skinning` off `master`, phases on `feat/simd-skinning-phase-<N>`. There are no external entry gates, so `/execute-plan --auto` is safe.
> - The pre-commit hook runs only `format` and `check`. Each task's **Test** names the commands that must be green before its commit.
> - `CHANGELOG.md` is updated in every task commit (dev-loop step 4). There is no separate changelog or close-out task, because `/execute-plan` Phase 4 archives the plan and updates the roadmap.
> - **The working tree must be clean.** Local GoFront checkouts are passed through `GOFRONT_DIR` / `GOFRONT_BASELINE_DIR`, never through `package.json`.
> - **Gate misses:** if a benchmark `Done when` is not met, stop and report it (AGENTS *Blockers*). Do not delete or rework the code without the user's decision.
> - Refactor tasks marked *characterization* write a test that is green before and after the change. That is the TDD step for behaviour-preserving work.

### Phase 1: Perf harness & SIMD rule
- [x] Task 1.1: A/B runner with self-test
  - Files: `tests/perf/ab.js` (new), `package.json` (`test:perf` runs `ab.js --self-test`)
  - Test: `GOFRONT_BASELINE_DIR=$(npm root)/gofront BASELINE_SRC=. node tests/perf/ab.js --self-test --repeat 5` (A/A) gives every entry a median ratio within 0.90–1.10. An injected 1.5× slowdown on side B (`--inject-slowdown 1.5`, test-only flag) fails the gate. With no env set, it exits 0 with the skip message.
  - Done when: all three behaviours hold, and `npm run test:perf` is green on a bare checkout.
- [x] Task 1.2: A/B mode for `js-vs-wasm.js`, with a skinning split
  - Files: `tests/perf/js-vs-wasm.js`, `tests/perf/ab.js`
  - Test: `node tests/perf/js-vs-wasm.js --ab --repeat 5` in A/A mode gives every hybrid entry (controller, skinning-world, skinning-palette, skinning-total, mesh-parse, anim-parse, SH-Map, SH-Flat) within 0.90–1.10.
  - Done when: the A/B table prints per-entry ratios, the skinning row is split into world (`GetWorldMatrices`), palette and total, and plain mode (no `--ab`) is unchanged.
- [x] Task 1.3: SIMD kernel canary
  - Files: `tests/perf/simd-kernels.js` (new), `tests/perf/fixtures/simd/` (the `kern`, `tri` and `jsfb` probe packages)
  - Test: `node tests/perf/simd-kernels.js` reports palette SIMD/scalar ≥ 3.0× and JS-fallback new-space growth > 1 MB per 1M ops. The `tri` kernel is skipped with a message below GoFront 1.8.0 (the original probe trapped on 1.7.0; the recreated one does not).
  - Done when: the canary runs in `test:perf` and fails if the palette speedup drops below 3.0×.
- [x] Task 1.4: SIMD-only-in-WASM check and rule docs
  - Files: `scripts/check-simd.js` (new), `tests/fixtures/check-simd/` (a `wasm` package with simd → pass, a `js` package with simd → fail), `package.json` (`check` runs it), `AGENTS.md` (Part 2 *Core Rules*: SIMD rule with the measured fallback cost)
  - Test: `node scripts/check-simd.js tests/fixtures/check-simd/bad` exits non-zero with a `file:line` message; `…/good` exits 0; `npm run check` on the repo is green.
  - Done when: `npm run check` runs the script on `app/src`, and the AGENTS rule is in place.

### Phase 2: SIMD skinning
- [x] Task 2.1: `mat4c` and `mulMat4c`
  - Files: `app/src/engine/animation/mat4c.go` (new), `app/src/engine/animation/mat4c_test.go` (new)
  - Test (failing first): for 1,000 seeded random matrix pairs, `mulMat4c` equals `mathx.Mat4Multiply` bit for bit (`math.Float32bits` per element), and `fromMat4`/`toMat4` round-trip. Run `npm test`.
  - Done when: the tests pass on `[wasm]`.
- [x] Task 2.2: Packed inverse-bind and world chain
  - Files: `app/src/engine/animation/skeleton.go`, `app/src/engine/animation/skeleton_test.go`
  - Test (*characterization*): for the test skeleton across 3 poses, `GetWorldMatrices` output is bit-identical to a fixture captured from the scalar path before the change. Run `npm test`.
  - Done when: `NewSkeleton` builds `invBindC`, `computeWorldMatrices` writes `worldC`, and `GetWorldMatrices` copies lazily.
- [x] Task 2.3: SIMD palette store
  - Files: `app/src/engine/animation/skeleton.go`, `app/src/engine/animation/skeleton_test.go`
  - Test (*characterization*): `SkinMatrices` after `ComputeSkinningMatrices` is bit-identical to the scalar fixture for 3 poses, and `n` is clamped at 64. Run `npm test && npm run test:dom`.
  - Done when: the copy loop is replaced by `simd.StoreF32x4`.
- [x] Task 2.4: Zero-alloc case and gate
  - Files: `tests/perf/zero-alloc.js` (skinning case), `plans/simd-skinning-plan.md` (record the result)
  - Test: `npm run test:perf` with a 20,000-frame skinning case at ≤ 0.5 B/frame; `BASELINE_SRC=<worktree of feat/simd-skinning before Phase 2> node tests/perf/js-vs-wasm.js --ab --repeat 5 --gate 'skinning-total>=1.30' --gate skinning-world=off --gate skinning-palette=off` (skinning-total gated on ≥ 1.30× only; world and palette are expected to speed up too and are reported ungated; every other entry stays on the 0.90–1.10 band).
  - Done when: skinning-total is ≥ 1.30× and zero-alloc passes, with the numbers recorded under *Verified Gaps*. If it is below 1.30×, stop and report (see execution notes).
  - Note (2026-10-22): the full-frame case first missed at 62–72 B/frame because of costs that predate this plan. By user decision, `ComputeSkinningMatrices` became void (callers cache `SkinJointCount()`), and the case is scoped to the palette and world chain on a pre-built pose: 0.15 B/frame. `AnimationPlayer.Update` (≈ 48 B/frame) is a follow-up outside this plan. Results are under *Verified Gaps*.

---

## Follow-ups (outside this plan)

- **`AnimationPlayer.Update` allocates ≈ 48 B/frame** with a clip playing (sampling/`PoseLerp`). It is not covered by the zero-alloc skinning case.
- **`int` returns across the JS↔WASM boundary allocate ≈ 24 B per call** on GoFront 1.7.0 (the `Pose.JointCount` getter too). This is a GoFront issue; recheck on v1.8.0.
- **`Skeleton.pack` defaults to 0, which is a valid index.** A `Skeleton` not built by `NewSkeleton` silently uses skeleton 0's pack, and the JS facade exposes a `pack` setter. Fix: 1-based index with a panic on 0.
- **`_packs` is never freed.** It is bounded today (one per loaded skinned mesh) and matters only if meshes are reloaded.
- **`npm run bench` skinning js-only now uses the allocating `F32x4` fallback** (≈ 409 µs vs ≈ 4.2 µs hybrid per frame), so its hybrid/js skinning ratio no longer compares like with like.
- **`scripts/check-simd.js` misses some import forms** that GoFront accepts (one-line grouped `import (…; …)`, a trailing `/* */` or `;`) and does not scan `.templ` files.
- **Harness hardening:** `ab.js --inject-slowdown` is accepted outside `--self-test`, and `--repeat` children do not inherit `process.execArgv`.

---

## Test & Conformance Plan

- **Unit tests:** `app/src/engine/animation/mat4c_test.go` (bit-exact against `mathx.Mat4Multiply`, round-trips), `skeleton_test.go` (world and palette fixtures across 3 poses, joint clamp).
- **Integration:** `npm run test:all`; the Playwright smoke test renders the skinned NPCs in the demo arena.
- **Negative cases:** `scripts/check-simd.js` on `tests/fixtures/check-simd/bad` fails with `file:line`; `ab.js --inject-slowdown 1.5` fails its gate; `ab.js` without env skips with exit 0.
- **Benchmarks:**
  - `node tests/perf/ab.js --self-test --repeat 5`: A/A within 0.90–1.10.
  - `node tests/perf/js-vs-wasm.js --ab --repeat 5 --gate 'skinning-total>=1.30' --gate skinning-world=off --gate skinning-palette=off` (against the pre-Phase-2 source): skinning-total ≥ 1.30×, other gated entries within 0.90–1.10.
  - `node tests/perf/simd-kernels.js`: palette ≥ 3.0× (canary).
  - `node tests/perf/zero-alloc.js`: skinning ≤ 0.5 B/frame; raycast < 64 KB per 100k casts and controller < 128 B/frame (thresholds unchanged; measured ≈ 3 KB and 0.2 B/frame).
