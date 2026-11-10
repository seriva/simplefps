# GoFront v1.9 Adoption — Design Plan

**Version:** continuous  
**Status:** Draft (2026-11-10) — Phase 1 can run now (it stays on `gofront@^1.8.0`). Phase 2 is **blocked** until `gofront@1.9.1` is on npm with fixes for the five upstream entries logged in `../gofront/plans/follow-ups.md` on 2026-11-10 (`U1`–`U5` below; `U1`–`U3` are required, `U4` gates the size criterion, `U5` is optional). Audited against GoFront tag `1.9.0` (`/home/luuk/dev/gofront`, code-identical to `main` @ `0e80ad3c`); `gofront@1.9.0` is tagged but not published (`npm view gofront versions` ends at `1.8.0`).  
**Related:** [`gofront-v1.8.0-adoption-plan.md`](gofront-v1.8.0-adoption-plan.md) (predecessor; merged in #62, all tasks checked, header still says Draft), [`simd-collision-plan.md`](simd-collision-plan.md) (independent; either order), GoFront [`v1.9.1/follow-ups-2026-11-09-plan.md`](../../gofront/plans/v1.9.1/follow-ups-2026-11-09-plan.md) (the upstream patch release; it does not schedule `U1`–`U5` yet)  
**Release note:** Upgraded the GoFront compiler to `^1.9.1`; the game plays and performs the same, and the settings menu shows the stored slider values as before.  

---

## Goal

GoFront v1.9.0 brings a Go-source standard library, exact `int64`/`uint64` in JavaScript, generic code over named slice and map types, and a stricter type checker that follows Go. SimpleFPS uses almost none of the new features. What matters for SimpleFPS is the stricter type checker and the regressions the audit found:

1. **Three source changes required by the stricter checker.** An `any` no longer assigns to a concrete type without an assertion (`systems/network.go`, two `game` test helpers), and a `switch` on a `string` rejects `uiAction` cases (`game/ui.go`). All three changes are valid Go and compile on 1.8.0 as well, so they land first (Phase 1) without a version bump.
2. **Five upstream regressions or bugs in GoFront, none of them fixable in SimpleFPS without hacks.** `U1` makes `gofront check`/`build` crash on every package that reaches `encoding/json` together with a WebGPU `.d.ts` type, so SimpleFPS cannot build on 1.9.0 at all. `U2` (float32 constants) and `U3` (`fmt` in `.templ`) change runtime behaviour: one test fails, and the settings menu would show a wrong gamma slider value. `U4` makes the release `app.js` 52% larger. `U5` predates 1.9.0 and only keeps a workaround alive. All five are logged upstream with repros. The decision is to **gate the bump on `gofront@1.9.1`**: no local workarounds.

With every upstream bug patched in a scratch copy, everything else holds on 1.9.0: zero-alloc, the SIMD canary, the `mathx` JS A/B, the hybrid A/B and the Playwright smoke test all pass (*Verified Gaps*). The plan therefore makes the source changes now and bumps to `^1.9.1` once it ships. Existing tests already guard `U2` and `U3`, and one more guard is added for `U3`. Each new 1.9 capability that is not adopted is listed below with its reason.

**Done means:**
- `package.json` depends on `gofront@^1.9.1` and `npm run test:all` (check, unit, DOM, perf, Playwright smoke) passes. The only test changes are the two helper assertions from Task 1.3 and the slider guard from Task 2.1. `TestLightSorterAndLightingData` (`app/src/engine/rendering/rendering_test.go`) and `TestUISettingsAndCreditsRows` (`app/src/game/ui_test.go`) pass **unchanged**, which proves `U2`/`U3` are fixed upstream.
- `npm run check` reports `13 packages — OK`, with no `json: cannot spell type kind namespace` error (`U1`).
- `GOFRONT_BASELINE_DIR=<gofront 1.8.0> node tests/perf/mathx-js.js --repeat 5` passes its default gates, and `node tests/perf/js-vs-wasm.js --ab --repeat 5 --max Infinity --gate 'mesh-parse>=0.80'` (1.8.0 vs 1.9.1) passes. On 1.9.0 the measured hybrid medians were all ≥ 0.918; the `mathx` medians were 0.992–1.070.
- `npm run build` gives `public/app.js` ≤ 877,000 B (1.05× the 835,581 B measured on 1.8.0) and `public/app.wasm` ≤ 110,000 B (measured with `wc -c`). If `U4` is still open in 1.9.1, stop and ask (see *Edge Cases*).
- `AGENTS.md` names GoFront ≥ 1.9.1 and documents the new `any` → concrete assertion rule for JS-interop values.

---

## Scope Rule & Boundary Matrix

A v1.9 capability is adopted only if it (a) is required to compile or keep behaviour, or (b) removes a verified SimpleFPS workaround without breaking zero-alloc or a perf gate. Expressiveness alone is not a reason.

| Category | Rule | Examples / Members | Reason (Excluded rows) |
|---|---|---|---|
| **In scope: core** | Source changes the 1.9 type checker requires, the toolchain bump, and the guard tests | `any` → `PeerClient`/`string`/`bool` assertions in `systems/network.go`; `switch uiAction(action)` in `game/ui.go`; `fakeEvent`/`fakeTarget` assertions in `game` tests; `gofront@^1.9.1`; slider-value guard test; `AGENTS.md` version + interop rule | |
| **In scope: target-specific** | Behaviour the bump must keep on each target, guarded by existing tests/benchmarks with no source change | JS float32 rounding (`U2`, `rendering_test.go`); typed `fmt` in `.templ` (`U3`, `ui_test.go`); WASM `uint64` voxel keys in `collision/spatialhash.go` (WASM-internal, never crosses the boundary, so the `BigInt` boundary change does not apply) | |
| **Excluded: runtime / platform** | Breaks a SimpleFPS invariant | Moving hot-path `int` math to `int64` for exactness; `encoding/json` codecs in WASM; `time`/`fmt` in WASM packages | `int64` is `BigInt` in JS (1.9.0 changelog: "Prefer `int` in hot loops"), which would allocate per op and break zero-alloc. JSON and `fmt` are load-time or debug paths in JS packages, and moving them into WASM adds boundary copies |
| **Excluded: deferred** | Valid, but upstream-blocked, unproven, or no consumer | Local workarounds for `U1`–`U4` (native `JSON.parse`, pre-formatted slider strings, tolerance compares); removing the `make([]mat4c, 1)` workaround (`U5`); removing the `skeletonPack` index indirection and the void `ComputeSkinningMatrices` (`animation/skeleton.go:29`, `:205`); new stdlib (`slices`/`maps` on named types, `errors.Join`, `--no-natives`); a bundle-size CI gate | User decision 2026-11-10: gate on 1.9.1 instead of hacks. `U5` still emits invalid WASM on 1.9.0 (probe below). The pack indirection and the void return were 1.7.0 workarounds: a probe of a `main`-package exported struct validates on 1.8.0 and 1.9.0, but that does not exercise the real JS↔WASM facade, and the void-return cost needs an allocation benchmark, so they need their own measured plan. No call site needs the new stdlib. The size gate is new tooling beyond an adoption |

---

## Verified Gaps & Baseline Audit

Probe setup (scratch, deleted afterwards): `git archive HEAD` of SimpleFPS copied to a scratch dir. GoFront 1.9.0 is `node /home/luuk/dev/gofront/src/index.js` (tag `1.9.0`). The "patched 1.9.0" is a scratch `git archive 1.9.0` copy with one change in `src/lower/gen-types.js`, `namespace: () => "any"`, which suppresses `U1` so that later errors become visible. The 1.8.0 baseline is `simplefps/node_modules/gofront`. In the scratch copy, `node_modules/gofront` was symlinked to the patched compiler for the perf and e2e runs.

| Area | Finding | Evidence & Probe Reference |
|---|---|---|
| Version state | `gofront@1.9.0` is tagged but not published; SimpleFPS is on 1.8.0 | `npm view gofront versions --json` → last `"1.8.0"`; `git -C ../gofront tag` → `1.9.0`; `node_modules/gofront/package.json` → `"version": "1.8.0"` |
| `systems` (type checker) | Three `any` → concrete returns are now rejected, and every package that imports `systems` fails | `node ../gofront/src/index.js check app/src/...` → `network.go: cannot use factory(newPeerOptions()) (value of type any) as PeerClient value in return statement: need type assertion`; `network.go:137:9 … id (variable of type any) as string`; `network.go:174:9 … ok (variable of type any) as bool`. Sources: `app/src/engine/systems/network.go:106,136-137,173-174` (`PeerFactory` returns `any`; `deferred.promise` is `any`) |
| `game` (type checker) | `switch action` on the `string` from `getAttribute` rejects `uiAction` cases | Patched 1.9.0 `check app/src/...` → `ui.go:136:10: invalid case actionStart in switch on action (mismatched types uiAction and string)` ×7 (`actionStart` … `actionUpdateNo`). Source `app/src/game/ui.go:134-135`; `type uiAction string` at `ui.go:12`. With `switch uiAction(action)` → `13 packages — OK` |
| `game` tests (type checker) | `var v any = fields; return v` no longer assigns to `UIEvent`/`UIElement` | Patched 1.9.0 `test app/src/...` → `game [build failed]`: `gameplay_test.go:710:9 … any as UIEvent`, `ui_test.go:17:9 … any as UIElement`. With `return v.(UIEvent)` / `v.(UIElement)` → `ok game`. A `.d.ts` interface assertion compiles to an unchecked pass-through (`((__v) => (true ? [__v, true] : …))`), so map stand-ins still work |
| `U1` encoding/json codegen (upstream, **blocker**) | `check`/`build` crash in every package whose closure reaches `encoding/json` and a `.d.ts` type | `check ./app/src/engine/scene` (also `app/src`, `engine`, `game`) → `gofront: json: cannot spell type kind namespace`. Stack: `JsonCodecGen.genEnc` → `TypeSpeller.spell` (`../gofront/src/lower/gen-types.js:175`); offending type `{"kind":"namespace","name":"GPUBuffer"}`. Minimal 12-line repro (struct with a `.d.ts` field + `json.Marshal(any)`) crashes on 1.9.0, `OK` on 1.8.0. Logged in `../gofront/plans/follow-ups.md` |
| `U2` float32 constants in JS (upstream) | 1.9.0 `Math.fround`s float32 arithmetic but not float32 constants | Patched 1.9.0 `test` → `--- FAIL: TestLightSorterAndLightingData` (`ContributionScore(10,0,0,1,cam) != 0.01`, `rendering_test.go:795`). Repro `v := score(10,1); v == 0.01` → 1.9.0 `false` (emits `v === 0.01`), 1.8.0 `true`, Go `true`. Logged upstream |
| `U3` `fmt.Sprintf` in `.templ` (upstream, player-visible) | `.templ` expressions call untyped `Sprintf$$fmt`, so float32 `1` prints as an int | Patched 1.9.0 `test --dom` → `--- FAIL: TestUISettingsAndCreditsRows`; debug print: slider `value` attr `"%!f(int=1)"` (browser falls back to the range midpoint `1.5`), want `"1.0"` (`menus.templ:572`, `ActiveSettings.Gamma = 1`). Compiled output: `.go` uses a typed `gff_main_Sprintf_0`, `.templ` uses `Sprintf$$fmt`; 1.8.0 passes `__ft(g, float32)` in both. Logged upstream |
| `U4` bundle size (upstream) | Release `app.js` +52%, from JSON codecs generated for every program type | `gofront build --pwa --release`: 1.8.0 `app.js` 835,581 B / `app.wasm` 105,478 B; patched 1.9.0 1,273,563 B / 107,424 B. `grep -o gfj public/app.js \| wc -l` → 3,085 vs 0. SimpleFPS has only 5 JSON call sites (`assets/{materialloader,meshloader,resources}.go`, `systems/settings.go`, `game/arena.go`). Logged upstream |
| `U5` WASM SIMD globals (upstream, pre-existing) | Package-level struct of `F32x4` fields still zero-inits with `i32.const` | `var scratch mat4c` in a `//gofront:target wasm` package → `new WebAssembly.Module` → `CompileError: struct.new[0] expected type v128, found i32.const` on 1.8.0 **and** 1.9.0. Keeps `animation/skeleton.go:22-25` `make([]mat4c, 1)`. Logged upstream |
| Zero-alloc & SIMD (patched 1.9.0) | Unchanged | `GOFRONT_DIR=<patched> node tests/perf/zero-alloc.js` → raycast deltas ≤ 2,960 B/100k, controller 0.2 B/frame, skinning 0.15 B/frame, all ✓; `simd-kernels.js` → palette 7.13× bit-identical, jsfb 4.38 MB, ✓ |
| `mathx` JS A/B (1.8.0 vs patched 1.9.0) | No strict-mode regression | `GOFRONT_BASELINE_DIR=…/node_modules/gofront node tests/perf/mathx-js.js --repeat 5` → Mat4Multiply 1.006×, Mat4Invert 1.000×, FromRTS 0.992×, Vec3.TransformMat4 1.028×, BoundingBox.TransformInto 1.033× → `✓ A/B gate passed` |
| Hybrid A/B (1.8.0 vs patched 1.9.0) | Within gates; asset parsing ~7–8% slower | `node tests/perf/js-vs-wasm.js --ab --repeat 5 --max Infinity --gate 'mesh-parse>=0.80'` → controller 0.993×, skinning-total 1.015×, SH-Map 1.033×, SH-Flat 0.998×, mesh-parse 0.918×, anim-parse 0.934× → `✓ A/B gate passed` |
| Playwright smoke (patched 1.9.0) | Boots and renders | `CI=1 npx playwright test` in the scratch copy → `2 passed` |
| Other 1.9.0 breaking changes | Not hit | `grep` over `app/src`: no `TestMain` (async tests only), no hand-written `gom.Node` `Mount(parent, refs)`, no `sort.*`/`rand.Seed`/`sync.*`/`unicode.*`/`binary.Read|Write|Size`/`Sscan*`/`maps.Delete`/`\xNN` literals/`strconv.FormatFloat`; `uint64` only inside the WASM `collision` package |

---

## Approach

### 1. Architecture & Design Decisions
- **Phase 1 is compiler-neutral.** Each change is valid Go that compiles on both 1.8.0 and 1.9.x, so it can merge to `main` before 1.9.1 ships. That shrinks the bump PR to the version change plus guards.
- **`network.go`:** keep the `PeerFactory func(options any) any` signature, because tests in `systems` and `game` assign `func(options any) any` literals to it. Assert at the single use site: `p, _ := factory(newPeerOptions()).(PeerClient); return p`. The comma-ok form keeps the existing `nil` → "PeerJS is not available" path (`network_test.go:117`, `multiplayer_test.go:361`). In `Host`/`Connect` the deferred's resolution is asserted: `return id.(string)` and `return ok.(bool)`. Every `d.resolve` call passes a value of that type (`network.go:127,134,163`). This is not a hot path.
- **`ui.go`:** convert once at the boundary, `switch uiAction(action)`. This matches the existing `uiAction(...)` conversion in `ui_test.go:295`. `getAttribute` keeps its `.d.ts` `string` type.
- **No local workarounds for `U1`–`U5`** (user decision). The bump waits for `gofront@1.9.1`. Tests that already exist guard `U2`/`U3`, and Task 2.1 extends the `U3` guard to every slider so a partial upstream fix cannot slip through.
- Rejected: converting `encoding/json` call sites to native `JSON.parse` to dodge `U1`/`U4`. The change touches 5 loaders, would be reverted once upstream is fixed, and the user declined it.

### 2. Invariants & Safety Bounds
- Zero per-frame allocations: Phase 1 touches only connection setup and a click handler. Phase 2 must keep `tests/perf/zero-alloc.js` passing.
- `mathx` stays `both`, with no source change; its `_ = m[15]` hints must still elide checks on 1.9.1 (`mathx-js.js` gate).
- No `int64`/`uint64` crosses the JS↔WASM boundary, because 1.9.0 makes those `BigInt`. The `collision` `uint64` keys stay internal.

### 3. Edge Cases & Error Handling
- **`U4` not fixed in 1.9.1:** the size criterion fails. Stop and ask the user whether to accept the larger bundle or wait for a later patch. Do not work around it locally.
- **1.9.1 fixes `U1`–`U3` but adds new checker errors:** fix them in Task 2.2 only if they are the same class (missing assertion or conversion, ≤ 3 sites). Otherwise stop and ask.
- **Peer factory returns a non-`PeerClient` JS value:** the assertion to a `.d.ts` interface is unchecked at runtime (see *Verified Gaps*), so behaviour is identical to 1.8.0.
- **Deferred resolved with the wrong type:** impossible today because all `resolve` calls are typed. A future untyped `resolve` would panic at the assertion instead of silently returning garbage. That is acceptable and covered by `network_test.go`.

---

## Implementation Tasks

Commands below use `GF19=/home/luuk/dev/gofront/src/index.js` (a local checkout at tag `1.9.0` or later) for the "fails on 1.9.0 first" step. The pre-commit gate (`npm test`, `npm run test:dom`) always runs on the pinned dependency.

### Phase 1: Source changes for the stricter type checker (lands on 1.8.0)
Small phase (≈ 15 LOC): it is split from the bump because the bump is blocked upstream, and this part is not.

- [ ] Task 1.1: Assert `any` results in `systems.Network` (`createPeer`, `Host`, `Connect`)
  - Files: `app/src/engine/systems/network.go`
  - Test: failing first: `node $GF19 check ./app/src/engine/systems` reports the 3 errors in *Verified Gaps*. Behaviour stays covered by `app/src/engine/systems/network_test.go` (`TestNetworkHostResolvesWhenPeerOpens`, `TestNetworkHostResolvesEmptyOnError` incl. the nil-factory case at `:117`, `TestNetworkClientConnectsAndSendsPositions`, `TestNetworkClientConnectFailsOnError`)
  - Done when: `node $GF19 check ./app/src/engine/systems` → `OK`, and `npm test` + `npm run test:dom` pass on 1.8.0
- [ ] Task 1.2: Switch on `uiAction(action)` in the menu click handler
  - Files: `app/src/game/ui.go`
  - Test: failing first: `node $GF19 check ./app/src/game` reports the 7 `invalid case action…` errors once `U1` is masked (or check the patched compiler). Behaviour stays covered by `TestEveryMenuActionHandled` (`app/src/game/ui_test.go:249`)
  - Done when: `ui.go` has no `switch action {` on a raw `string`, `TestEveryMenuActionHandled` passes on 1.8.0, and the patched-1.9.0 `check app/src/...` has no `ui.go` errors
- [ ] Task 1.3: Assert the `game` test stand-ins to their `UI*` interfaces
  - Files: `app/src/game/gameplay_test.go` (`fakeEvent` → `v.(UIEvent)`), `app/src/game/ui_test.go` (`fakeTarget` → `v.(UIElement)`, and update its comment)
  - Test: failing first: `node $GF19 test ./app/src/game` → `game [build failed]` at `gameplay_test.go:710`, `ui_test.go:17` (patched compiler)
  - Done when: all 19 `fakeTarget(`/`fakeEvent(` call sites compile and `npm test` + `npm run test:dom` pass on 1.8.0

### Phase 2: Bump to GoFront 1.9.1 (blocked on `gofront@1.9.1` with `U1`–`U3` fixed)
- [ ] Task 2.1: Guard every settings slider's rendered value against `fmt`-in-templ typing (`U3`)
  - Files: `app/src/game/ui_test.go`
  - Test: new `TestUISliderValuesFormatted`: set `systems.ActiveSettings` to integral values (`RenderScale = 1`, `Gamma = 2`, `FsrSharpness = 1`, `LookSensitivity = 1`, restored after), then `ui.Show(MenuSettings)` and assert each slider's `getAttribute("value")` equals `"1.00"`, `"2.0"`, `"1.00"`, `"1.00"` (`menus.templ:571-583` formats). It fails first on `$GF19 test --dom ./app/src/game` (gets `%!f(int=…)`) and passes on 1.8.0
  - Done when: the test passes under `npm run test:dom` on 1.8.0 and would fail on 1.9.0
- [ ] Task 2.2: Bump `gofront` to `^1.9.1`
  - Files: `package.json`, `package-lock.json`
  - Test: existing `TestLightSorterAndLightingData` (`U2`), `TestUISettingsAndCreditsRows` + `TestUISliderValuesFormatted` (`U3`) and `npm run check` (`U1`), all **unchanged**
  - Done when: `npm ls gofront` → `1.9.1` (or later 1.9.x); `npm run test:all` passes; both A/B commands in *Done means* pass against a 1.8.0 baseline; `npm run build` sizes are within the *Done means* bounds (else stop per *Edge Cases*)
- [ ] Task 2.3: Update agent docs for 1.9
  - Files: `AGENTS.md` (Part 2 only: `Node` line → "uses GoFront >= 1.9.1"; **Browser interop** rule: values typed `any` from JS (`Reflect.construct`, `await` on a `Promise`, map stand-ins in tests) need an explicit assertion to the `.d.ts` interface or basic type, and the assertion is unchecked at runtime)
  - Test: none (docs); `npm run check` stays green
  - Done when: `grep -n "GoFront >= 1.9.1" AGENTS.md` matches, and the interop rule names the assertion requirement
