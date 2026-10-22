# Typed UI Layer — Design Plan

**Version:** continuous  
**Status:** Draft (2026-10-22)  
**Depends on:** None (runs on GoFront 1.7.0, on `master` as of `9630720` plus the uncommitted follow-up SLOC dedup, which added `onSettingChange`/`onSettingInput` and the `sliderRow`/`checkRow`/`creditRow` templ components that this plan builds on)  
**Replaces:** None  
**Followed by:** None planned. The `engine/systems` DOM code (input, console, stats) is a candidate follow-up; see *Out of Scope*.

---

## Goal

The `game` package's UI code (menus, HUD, loading screen, state manager, controls) works on DOM values typed as `any`, and names menus, actions and setting ids with bare strings. `gofront check` cannot see into either one. A typo in a DOM member name compiles. A typo in a menu name silently shows the main menu. A typo in a setting id is a silent no-op. A missing `value` panics on a type assertion at runtime. Translation keys and template refs line up today, but only by convention; no test checks them.

This plan makes the compiler catch those mistakes, at no runtime cost:

1. **Typed identifiers.** Menus become an `int` enum, so a string literal cannot be passed where a menu is expected. Template actions and setting ids become named constants shared by the `.templ` and `.go` files.
2. **Typed DOM.** The DOM values in `game` are typed as small `.d.ts` interfaces (`UIElement`, `UIEvent`, …) in the package's `interop.d.ts`. The probes show GoFront then rejects unknown members, and the emitted JS is the same as today minus the `.(string)`/`.(float64)` assertion wrappers.
3. **Drift tests.** DOM tests check that every template ref is bound after mounting, that no rendered screen shows `*UNKNOWN KEY*`, and that every `data-action` in the menus is handled.

**Done means:**
- `grep -rn '"[A-Z_]*_MENU"' app/src/main.go app/src/game/*.go` (non-test) matches only translation keys (the `translations.go` entry and the `Translate("MAIN_MENU")` header in `ui.go`) and the external `changestate` name table (`menuFromName`) in `state.go`. `EnterMenu`/`Show` take a `MenuID`, and passing a string literal fails `npm run check` (negative check recorded under *Verified Gaps*).
- In `ui.go`, `hud.go`, `loading.go`, `state.go` and `controls.go`, no DOM element field, ref or event parameter is typed `any`, and `grep -nE '\.\((string|float64)\)'` finds no assertion on a DOM value (`translations.go`'s `navigator.language` is the only remaining match). A deliberate member typo (`classList.ad`) in each converted file fails `npm run check` (negative check recorded).
- The new drift tests (`TestUIRefsBound`, `TestRenderedScreensHaveNoUnknownKeys`, `TestEveryMenuActionHandled`) pass. Each one is shown to fail once on a deliberate break, then reverted.
- `npm run test:all` passes. `public/app.js` is no larger than the Task 1.1 baseline.
- `AGENTS.md` (Part 2), `docs/architecture.md` and `CHANGELOG.md` are updated.

---

## Scope Rule & Boundary Matrix

A change is in scope if it lets `gofront check` or a test catch a UI mistake that is silent today, **without changing what the player sees or does**. DOM typing is declared only as wide as the code uses: one interface member per member accessed, no full `lib.dom` port.

| Category | Rule | Examples / Members |
|---|---|---|
| **In scope: core** | Typed identifiers and drift tests in `game` | `MenuID` enum (`MenuMain`, `MenuSettings`, `MenuCredits`, `MenuUpdate`) at all 17 string uses; `uiAction` and setting-id constants used in `menus.templ` and `ui.go`; ref/key/action drift tests |
| **In scope: target-specific (JS, `game` package)** | `.d.ts` interfaces for the DOM members `game` uses | `UIElement`, `UIClassList`, `UIStyle`, `UIEvent`, `UIStateDetail` in `game/interop.d.ts`; fields and handlers in `ui.go`, `hud.go`, `loading.go`, `state.go`, `controls.go` |
| **Excluded: runtime / platform** | Not expressible, or no gain | Typing `document`/`window` themselves (predeclared by GoFront; AGENTS.md forbids redeclaring them); runtime validation of DOM values (the browser guarantees `value` is a string, and the probe shows the typed form drops the check) |
| **Excluded: deferred** | Valid, but a separate change | `engine/systems` DOM (`input.go`, `console.go`, `stats.go`); `update.go` service-worker code; typed translation keys; removing the `changestate` hook; the global singletons (see *Out of Scope*) |

---

## Verified Gaps & Baseline Audit

Probes ran on 2026-10-22 against `master` `9630720` plus the uncommitted SLOC follow-up, on GoFront 1.7.0. Probe packages live in the session scratchpad (`uiprobe/`). In-package probes were temporary `_test.go` files, deleted after the run.

| Area | Finding | Evidence & Probe Reference |
|---|---|---|
| `any` member access | `gofront check` accepts any member name on an `any` value: `el.addEventLisener(...)` and `el.vaule.(string)` compile with no error. | Probe `uiprobe/anyp`: `gofront check` → `OK` |
| `.d.ts` interface access | On a value typed as a `.d.ts` interface, unknown members are rejected: `No member 'addEventLisener' in namespace UIInput`, `No member 'chcked' in namespace UIInput`. | Probe `uiprobe/dts` |
| `any` → interface conversion | An `any` (e.g. `refs["x"]`, `document.getElementById(...)`) assigns to an interface-typed field with no assertion. A missing ref compares `== nil`. `v.(UIInput)` also works. A `map[string]any` **literal** does not assign (`Cannot assign map[string]any to UIElement`); it has to go through an `any` variable first, which affects how tests build fake targets. | Probes `uiprobe/conv` (test passes), `uiprobe/erg` |
| Nested interfaces and callbacks | `classList.add/contains`, `closest()` returning `UIElement`, `getAttribute`, and `addEventListener` with a typed `func(e UIEvent)` callback all check and run under jsdom. `t.addEventListener != nil` (the feature check at [`hud.go:54`](../../app/src/game/hud.go#L54)) still compiles. | Probe `uiprobe/nest` (`gofront test --dom` → PASS), `uiprobe/erg` |
| Emitted JS | The typed and `any` versions of the same handler emit identical JS, except that `btn.getAttribute(...).(string)` on `any` becomes an inline closure that throws on a non-string and the typed form becomes a plain read. Typing removes code; it never adds any. | `gofront uiprobe/nest` vs `gofront uiprobe/anyp`, `function New` diff |
| Menu names | Menus are bare strings at 17 non-test sites: 8 `EnterMenu` calls ([`main.go:86`](../../app/src/main.go#L86), [`controls.go:42,75,83`](../../app/src/game/controls.go#L42), [`hud.go:68`](../../app/src/game/hud.go#L68), [`update.go:40,51,86`](../../app/src/game/update.go#L40)), the `changestate` default at [`state.go:160`](../../app/src/game/state.go#L160), and 8 in [`ui.go`](../../app/src/game/ui.go) (`currentMenu` init, 3 click-handler `Show` calls, the `Show` empty-name default, 3 `renderCurrentMenu` cases). `Show("SETINGS_MENU")` leaves `currentMenu="SETINGS_MENU"`, renders the main menu with the "Main Menu" header and raises no error. | Temporary probe test `TestProbeTypos` (`--dom`): `typo menu: currentMenu="SETINGS_MENU" header=Main Menu settingsRendered=false` |
| `int` enum safety | With `type MenuID int`, `Show("SETTINGS_MENU")` fails `gofront check`. A `type MenuID string` would not: an untyped string constant converts implicitly. | Probe `uiprobe/tplbad` → type error at the literal |
| Constants in templates | `data-action={ string(actionStart) }` in a `.templ` renders `data-action="start"`. | Probe `uiprobe/tpl` (`--dom` → PASS) |
| Setting ids | `onSettingChange` with id `"setting-fssr"` is a silent no-op. The ids are spelled out twice: in [`menus.templ`](../../app/src/game/menus.templ) (`@sliderRow`/`@checkRow` arguments) and in the `switch` cases at [`ui.go:151`](../../app/src/game/ui.go#L151). | `TestProbeTypos`: `typo id: no-op, no error` |
| DOM assertions | A missing or non-string `value` panics: `interface conversion: type assertion failed` from `sliderValue` ([`ui.go:197`](../../app/src/game/ui.go#L197)). Six such assertions on DOM values sit in `game`: [`ui.go:198`](../../app/src/game/ui.go#L198), [`state.go:158,162`](../../app/src/game/state.go#L158), [`controls.go:90,96,105,123`](../../app/src/game/controls.go#L90). | `TestProbeTypos`: `recovered=interface conversion: type assertion failed`; `grep -nE '\.\((string\|float32\|float64\|bool\|int)\)'` |
| `any` inventory | `any`-typed DOM fields: `ui.go` 10, `hud.go` 8, `controls.go` 8 (handler funcs), `state.go` 2, `update.go` 2, `loading.go` 1. Outside `game`: `systems/input.go` 9, `console.go` 6, `stats.go` 3. | `grep -cE '^\s+[a-zA-Z]+\s+any\b'` per file |
| Translation keys | Consistent today: 26 keys defined in `en-US`, 26 used (`Translate("…")` literals plus the `@sliderRow`/`@checkRow`/`@creditRow` label arguments), none missing or unused. Nothing enforces this. A missing key renders `*UNKNOWN KEY*` at runtime. | Static cross-check script (scratchpad); `TestProbeTypos`: `missing key: "*UNKNOWN KEY*"` |
| Template refs | Consistent today: `menus.templ` ↔ `ui.go` 10/10, `hud.templ` ↔ `hud.go` 8/8, `loading.templ` ↔ `loading.go` 1/1. A ref typo leaves a nil field and the matching handler silently not attached. No test asserts that the refs are bound. | Static cross-check script (scratchpad) |
| `changestate` hook | [`state.go:154-169`](../../app/src/game/state.go#L154-L169) listens for a `window` `changestate` CustomEvent with string `detail.state`/`detail.menu`. Nothing in `app/`, `tests/` or `scripts/` dispatches it. It was added in `5359004` ("changing of game state by event") as an external hook. | `grep -rn changestate app tests scripts`; `git log -S changestate` |
| `app.js` baseline (Task 1.1) | `npm run build` on `feat/typed-ui` `35915fb` (GoFront 1.7.0): `wc -c public/app.js` → **642,547 B**. Phase 2 must not exceed it. | `npm run build && wc -c public/app.js` |
| Drift tests (Task 1.1) | `TestUIRefsBound` (`ui_test.go`), `TestHUDRefsBound` (`hud_test.go`, desktop and mobile) and `TestLoadingRefsBound` (`loading_test.go`) cover the ref check; `TestRenderedScreensHaveNoUnknownKeys` and `TestEveryMenuActionHandled` are in `ui_test.go`. All pass on unchanged code. Negative checks, each reverted: `ref="armorEl"` → `"armorElX"` in `hud.templ` fails `TestHUDRefsBound` (`ref "armorEl" not bound`); `Translate("VERSION_CHECK")` → `"VERSION_CHEK"` in `menus.templ` fails `TestRenderedScreensHaveNoUnknownKeys` (`main menu renders *UNKNOWN KEY*`); `data-action="credits"` → `"credit"` fails `TestEveryMenuActionHandled` (`unhandled data-action "credit"`, `"credits" is not rendered by any menu`). | `gofront test --dom -v -run 'RefsBound\|UnknownKeys\|MenuAction' app/src/game` |
| Phase 1 results (Tasks 1.2–1.5) | Task 1.3 negative check: `GlobalState.EnterMenu("MAIN_MENU")` put back in `hud.go` fails `npm run check` (`Type error in hud.go at line 68:27: Cannot assign untyped string to MenuID`), reverted. The *Done means* menu `grep` now matches only `translations.go`, the two `Translate("MAIN_MENU")` header lines in `ui.go` and `menuFromName` in `state.go`. Deviation: Task 1.2 kept `EnterMenu(name string)` as a shim over `menuFromName` so that commit still compiled; Task 1.3 switched it to `MenuID` with its 8 callers and `state_test.go`. The ref drift test is split into `TestUIRefsBound`/`TestHUDRefsBound`/`TestLoadingRefsBound` (one per file, unique names in one package). The click handler's `switch action` compares the `any` from `getAttribute` with `uiAction` constants (a plain `===` in JS); Phase 2 types `getAttribute` as `string`. After Phase 1, `app.js` is **642,891 B** (+344 B over the baseline, from `menuFromName` and its warning); Phase 2 must bring it to ≤ 642,547 B. `npm run test:all`: `check`, `test`, `test:dom` and `test:e2e` (2/2) pass; `test:perf` fails only in the `simd-kernels.js` `jsfb` fallback gate (0.43 MB vs > 1.00 MB per 1M ops), which fails identically on `feat/typed-ui` with no Phase 1 changes, on Node 22.23.4 (the repo requires ≥ 24), so it is environmental, not caused by this phase. | `npm run check`; `npm run build && wc -c public/app.js`; `node tests/perf/simd-kernels.js` on a `feat/typed-ui` worktree |

---

## Out of Scope

- **`engine/systems` DOM (`input.go`, `console.go`, `stats.go`):** 18 `any` fields and 14 listeners, mostly touch and pointer input. It needs its own `interop.d.ts` (AGENTS.md: one per package; `systems` cannot import `game`), and the touch paths can only be verified on mobile or with a touch e2e test this repo lacks. It should be a follow-up plan built on this one's interfaces.
- **`update.go` service-worker code:** typing it means declaring `ServiceWorkerContainer`/`ServiceWorkerRegistration` and Promise `then`/`catch`. It runs only in a real browser with a service worker, so no unit test covers it today. Converting it would be typing without verification. Its three `EnterMenu` call sites *are* in scope (Task 1.3).
- **Typed translation keys (`type TrKey string`):** an untyped string literal still converts to a string-based type, so it would not catch `Translate("GAMA")`. The render sweep test (Task 1.1) catches it for every key a screen shows, and an `int` key enum would mean rewriting the translation table. Not worth it for 26 keys and one language.
- **Removing the `changestate` hook:** nothing in the repo dispatches it, but it is an external interface (devtools, embedding pages). Removing it is a product decision. This plan keeps it, parses its string `menu` through one name table (`menuFromName`), and falls back to the main menu with a console warning instead of silently.
- **Global singletons (`GlobalUI`, `GlobalState`, `ActiveSettings`):** the root cause of the save/restore in the UI tests, but injecting them changes construction in `main.go`, `game.go` and every system. That is an architectural plan, not a typing pass.
- **`game:jump` dispatch via `Reflect.construct`** ([`controls.go:127`](../../app/src/game/controls.go#L127)): it works, and typing it means declaring `Event` constructors. No gain.

---

## Approach

### 1. Architecture & Design Decisions

- **`MenuID` is an `int` enum,** not a string type, because only an `int` type rejects string literals at compile time (probe `tplbad`). It lives in `state.go` next to `GameState`:
  ```go
  type MenuID int
  const (
      MenuMain MenuID = iota
      MenuSettings
      MenuCredits
      MenuUpdate
  )
  ```
  `UIManager.currentMenu`, `Show` and `StateManager.EnterMenu` take a `MenuID`. `renderCurrentMenu` switches on it, and its `default` stays the main menu. `Show("")` (empty means main) becomes the zero value `MenuMain`. The only string boundary left is the `changestate` event: `menuFromName(name string) (MenuID, bool)` maps `"MAIN_MENU"`, `"SETTINGS_MENU"`, `"CREDITS_MENU"`, `"UPDATE_MENU"`. An unknown name logs `GlobalConsole.Warn` and shows the main menu (today that happens silently).
- **Actions and setting ids are typed string constants** in `ui.go` (`type uiAction string`, `actionStart`, …, and `settingGamma = "setting-gamma"`, …). They are used in `menus.templ` as `data-action={ string(actionStart) }` and as `@sliderRow(…, settingGamma, …)`, and in the `switch` cases in `ui.go`. A misspelled constant name fails to compile. They stay strings because they are DOM attribute values.
- **DOM interfaces go in `game/interop.d.ts`,** the package's existing interop file (AGENTS.md "Browser interop"). They declare only members `game` uses:
  - `UIClassList { add; remove; contains }`, `UIStyle { filter: string; transition: string }`
  - `UIElement { id; value; checked; textContent; tagName; classList: UIClassList; style: UIStyle; closest(sel): UIElement; getAttribute(name): string; addEventListener(type, fn, capture?) }`
  - `UIEvent { target: UIElement; key: string; keyCode: number; repeat: boolean; button: number; deltaY: number; detail: UIStateDetail; preventDefault(): void }`; `UIStateDetail { state: string; menu: string }`

  One `UIEvent` covers keyboard, mouse, wheel and custom events. That is looser than the DOM's subtypes, but it matches what the handlers read, and splitting it has no checking benefit for 8 handlers. `number` maps to `float64`, so `int(e.keyCode)` and `c.Scroll(e.deltaY)` drop their assertions.
- **Conversion at the ref boundary:** `refs` stays `map[string]any` (the `gom` API). Assigning `refs["x"]` to a `UIElement` field needs no assertion (probe `conv`), and a missing ref stays `nil`. Handler fields in `controls.go` become `func(e UIEvent)`. `document`/`window.addEventListener` still accept them, because `document`/`window` are untyped predeclared globals.
- **Drift tests come first (Phase 1)** and pin today's behaviour, so both phases are refactors against a fixed reference:
  - `TestUIRefsBound`: after `Mount`, every cached element field in `UIManager`, `HUD` (desktop and mobile) and `LoadingManager` is non-nil.
  - `TestRenderedScreensHaveNoUnknownKeys`: render main (before and after start), settings (both tabs), credits, the update menu, the dialog, the HUD and the loading screen, and assert `document.body.textContent` never contains `*UNKNOWN KEY*`. Keys used only from Go (`WEBGPU_REQUIRED`) get an explicit `Translate` assertion.
  - `TestEveryMenuActionHandled`: for every `[data-action]` in each rendered menu, click it and assert the expected effect (menu changed, state changed, or the callback fired). An unknown action fails the test.
- **Rejected alternatives:** a `scripts/check-ui-keys.js` static checker (it duplicates template parsing and misses dynamic labels; the render sweep tests what the player actually sees); a string-based `MenuID` (does not reject literals); a full `lib.dom.d.ts` (thousands of declarations GoFront's `.d.ts` parser would have to digest, for a dozen members).

### 2. Invariants & Safety Bounds

- **No player-visible change:** same menus, headers, settings and actions. The one intentional difference is a console warning for an unknown `changestate` menu name.
- **No runtime cost:** typed member access emits the same JS as `any` (probe). `app.js` must not grow over the Task 1.1 baseline.
- **Hot paths untouched:** `HUD.Update` is per-frame and must stay allocation-free when values are unchanged (its existing test). Retyping its fields does not change the emitted reads.
- **Dependency direction:** the interfaces are `game`-only. Nothing in `engine` imports them.
- **AGENTS.md interop rule:** `document`, `window` and `navigator` are not redeclared. The new interfaces are new names (`UI*`), so they shadow nothing.

### 3. Edge Cases & Error Handling

- **`getAttribute` returns `null` for an absent attribute,** but is declared `string`. Every current caller (`data-tab`, `data-action`) reads an attribute it just matched with `closest("[data-…]")`, so it is always present. The declaration's comment says so, and new callers must check `closest` first.
- **Test fakes:** a `map[string]any` literal does not assign to `UIElement` (probe `erg`). `TestUISettingHandlers` builds targets through a helper `fakeTarget(fields map[string]any) UIElement { var v any = fields; return v }`.
- **`hud.go:54` feature check** (`iconEl.addEventListener != nil`): still compiles on the interface (probe `erg`), and is kept as-is.
- **jsdom vs real browser:** the drift tests run under `npm run test:dom`. Pointer lock and focus handlers are covered only by the existing e2e smoke test, which must stay green.
- **`changestate` with a missing `detail.menu`:** `UIStateDetail.menu` reads as `undefined`. `menuFromName("")` must not match any name (unknown → main menu), and in that case there is no warning, so today's "no menu given → main menu" path stays quiet.

---

## Implementation Tasks

> **Execution notes:** epic branch `feat/typed-ui` off `master`, phase branches `feat/typed-ui-phase-<N>`. Each task is one commit: `refactor(typed-ui): <summary> (Task N.M)` (tests: `test(typed-ui): …`). Gates per task: `npm run check`, `npm test`, `npm run test:dom`. End of phase: `npm run test:all`. Both phases change only the `game` package, `main.go`, tests and docs (≈ 200–350 net LOC per phase).

### Phase 1: Typed Identifiers & Drift Tests

- [x] Task 1.1: Drift tests and baseline.
  - Files: `app/src/game/ui_test.go`, `hud_test.go`, `loading_test.go`
  - Test: write `TestUIRefsBound`, `TestRenderedScreensHaveNoUnknownKeys`, `TestEveryMenuActionHandled` (see *Approach*) against unchanged code; they must pass. Negative checks, one at a time and reverted: rename one `ref=` in `hud.templ`, change one `Translate` key in `menus.templ`, change one `data-action` value; each must fail its test. Record `wc -c public/app.js` after `npm run build`.
  - Done when: the three tests pass on unchanged code, each negative check failed, and the baseline size is recorded under *Verified Gaps*.
- [x] Task 1.2: `MenuID` enum in the UI and state manager.
  - Files: `app/src/game/state.go`, `ui.go`, `ui_test.go`
  - Test (first): `TestMenuFromName` (the four names map; `""` and `"SETINGS_MENU"` do not), and `TestShowMenuID` (`Show(MenuSettings)` renders `#setting-gamma`; `Show(MenuID(99))` renders the main menu). Update `TestUIModalAndMenus` and `state_test.go`'s `EnterMenu` call to `MenuID`s.
  - Done when: `EnterMenu`, `Show` and `currentMenu` use `MenuID`; `changestate` goes through `menuFromName` and warns on an unknown non-empty name; the tests pass.
- [x] Task 1.3: Convert the remaining menu call sites.
  - Files: `app/src/game/controls.go`, `hud.go`, `update.go`, `app/src/main.go` (one-line changes at 8 sites)
  - Test: `npm run check` (string literals no longer compile); the existing `hud_test`, `gameplay_test` and e2e smoke test pass. Negative check: put `GlobalState.EnterMenu("MAIN_MENU")` back once and confirm `npm run check` fails, then revert.
  - Done when: the *Done means* `grep` matches only the translation keys and `menuFromName`.
- [x] Task 1.4: Action and setting-id constants.
  - Files: `app/src/game/ui.go`, `menus.templ`, `ui_test.go`
  - Test (first): `TestUISettingHandlers` and `TestEveryMenuActionHandled` use the constants instead of literals; they keep passing through the change.
  - Done when: no `data-action="…"` or `"setting-…"` string literal remains in `menus.templ` or `ui.go` outside the constant block; the tests pass.
- [x] Task 1.5: Phase 1 docs.
  - Files: `CHANGELOG.md`, this plan
  - Test: `npm run test:all`.
  - Done when: the CHANGELOG has a `### Changed` entry under `## [Unreleased]`, and Tasks 1.1–1.4 are checked off with any findings recorded.

### Phase 2: Typed DOM in `game`

- [x] Task 2.1: Declare the DOM interfaces.
  - Files: `app/src/game/interop.d.ts`, `ui_test.go`
  - Test: `npm run check` passes with the declarations unused. Add the `fakeTarget` test helper.
  - Done when: `UIElement`, `UIClassList`, `UIStyle`, `UIEvent` and `UIStateDetail` are declared with the members listed in *Approach*, including the `getAttribute` nullability comment.
- [x] Task 2.2: Type `UIManager`.
  - Files: `app/src/game/ui.go`, `ui_test.go`
  - Test: existing UI tests and the Phase 1 drift tests pass; `TestUISettingHandlers` uses `fakeTarget`. Negative check: `ui.backdropEl.classList.ad("visible")` fails `npm run check` (reverted).
  - Done when: the 10 element fields, the click/change/input handlers, `onSettingChange`, `onSettingInput` and `sliderValue` use `UIElement`/`UIEvent`, and `sliderValue` has no `.(string)`.
- [x] Task 2.3: Type `HUD`, `LoadingManager` and the state manager's canvas and event.
  - Files: `app/src/game/hud.go`, `loading.go`, `state.go`
  - Test: `hud_test`, `loading_test`, `state_test` and the drift tests pass. `TestHUDMountAndUpdate`'s zero-allocation assertion is unchanged. Negative check per file (member typo fails `npm run check`, reverted).
  - Done when: no `any`-typed DOM field remains in the three files, and `state.go`'s two `.(string)` assertions are gone (`e.detail.state`/`e.detail.menu` read through `UIStateDetail`).
- [ ] Task 2.4: Type the `Controls` event handlers.
  - Files: `app/src/game/controls.go`, `gameplay_test.go` (only if a handler test needs `fakeTarget`)
  - Test: `gameplay_test` and the e2e smoke test pass. Negative check: `e.keyCod` fails `npm run check` (reverted).
  - Done when: the 8 handler fields are `func(e UIEvent)`, and the four assertions at `controls.go:90,96,105,123` are gone.
- [ ] Task 2.5: Docs and final numbers.
  - Files: `AGENTS.md` (Part 2 "Browser interop": DOM values in `game` use the `UI*` interfaces in `game/interop.d.ts`, never `any`; menus use `MenuID`), `docs/architecture.md` (UI section), `CHANGELOG.md`, this plan
  - Test: `npm run test:all`; `npm run build` and compare `wc -c public/app.js` with the Task 1.1 baseline.
  - Done when: every *Done means* item holds, `app.js` is not larger, the numbers and negative checks are recorded under *Verified Gaps*, and the plan is marked Completed and moved to `docs/plans/archive/` with the roadmap relinked.

---

## Test & Conformance Plan

- **Unit tests (`npm test`):** `game/state_test.go` (`TestMenuFromName`), `game/ui_test.go` (`TestShowMenuID`, `TestUISettingHandlers` on `fakeTarget`).
- **DOM drift tests (`npm run test:dom`):** `TestUIRefsBound` (`ui_test.go`, `hud_test.go`, `loading_test.go`), `TestRenderedScreensHaveNoUnknownKeys` and `TestEveryMenuActionHandled` (`ui_test.go`). They are written against unchanged code in Task 1.1 and must stay green through both phases.
- **Negative checks (by hand, reverted, recorded in this plan):** a ref rename, a key change and an action change each fail a drift test (Task 1.1); a string menu literal fails `npm run check` (Task 1.3); a member typo fails `npm run check` in each converted file (Tasks 2.2–2.4).
- **Integration:** `npm run test:e2e` (boot to the main menu, start a game, HUD visible) at the end of each phase. It covers pointer lock and the real-browser event paths that jsdom does not.
- **Size check:** `public/app.js` after `npm run build` is no larger than the Task 1.1 baseline (typed access drops the assertion wrappers).
