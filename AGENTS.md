# SimpleFPS Agent Guide

# Part 1: Agent Workflow
> [!IMPORTANT]
> **IMMUTABLE SECTION:** Do not modify Part 1 unless explicitly instructed. This is a universal standard. Only adjust Part 2 (Project Context) for project-specific needs.

## 1. Context & Rules
- **Caveman Speak:** Progress updates and tool-call narration use "caveman" style (extreme density, zero fluff, drop grammar, `->` for correlations). Explanations and answers to the user use normal readable prose.
- **Audiences:** Every file has one reader. *People* read `README.md`, `docs/`, `CHANGELOG.md`, commit bodies, and PR summaries: plain prose, no task/phase/follow-up IDs, no references to plans. *Agents* read `plans/` (plans, `roadmap.md`, `follow-ups.md`): dense, symbol-heavy, ID-heavy text is fine there.
- **Skills Override:** While running a skill (`/design-plan`, `/execute-plan`, `/dev-loop`), its rules override **Audiences**, **Blockers**, **Quality**, **Branches**, and **Commits & PR Titles** here.
- **Plan-first:** Non-trivial features (multi-component, arch-altering, risky) require a design plan created with `/design-plan` and tracked in `plans/roadmap.md`. Active plans live under `plans/` (or milestone subfolders like `plans/vX.Y.Z/`); on completion `/execute-plan` moves continuous plans to `plans/archive/`, while versioned plans stay in their milestone folder. Track execution by checking off tasks (`- [x]`) as they land.
- **TDD:** Write failing tests first for non-trivial logic (if applicable).
- **Quality:** Run format/lint before every commit. Before opening a PR, update `CHANGELOG.md` & `README.md` when user-facing behavior changed.
- **Changelog:** Write for someone upgrading, not for the reviewer: at most two plain sentences per entry saying what is different for them and why it matters. Name only the APIs or flags the reader needs to act on and link to docs for full lists. Never include task, phase, or follow-up IDs, file paths, test fixture names, or internal identifiers, and never paste the commit body. One entry per feature or plan: rewrite it as later work lands instead of appending. Breaking changes go under `### Changed`, start with **Breaking:**, and say what to do. Good: "Collision checks are about twice as fast on large maps." Bad: "Add 4-wide SIMD triangle-packet kernel in `collision/packet.go` behind `useSIMD` (Task 2.3)."
- **Docs:** `README.md` and `docs/` describe how to use the project as it is now: start from what the reader wants to do, show a short example, then the details. No change history (that is the changelog), no plan or task references, and no implementation notes outside docs that are explicitly about internals. Generated tables are fine.
- **Verify:** Run tests/compiler or ask user to visually verify before concluding/commit/PR. Never assume.
- **Blockers:** Stop and ask user on ambiguity; do not guess.
- **Scope:** Stick strictly to requested task/plan. No unrequested features/refactoring. A real bug noticed outside the task goes in `plans/follow-ups.md` with a one-line repro, not into the diff.
- **Dependencies:** Use existing packages/standard lib. Ask before adding new dependencies.
- **Stuck:** If same approach fails twice, stop and ask user. Do not retry blindly.
- **Code Preservation:** Do not delete existing comments, docstrings, or unrelated code unless explicitly instructed.

## 2. Git Standards
- **No Auto-Commit:** Never run `git commit`, `git push`, or history-rewriting commands unless the user explicitly asks in the current turn. Make changes, run quality gates, report, then wait for the user to commit or instruct. Exception: invoking `/dev-loop` or `/execute-plan` is explicit permission to branch, commit, push, and open/merge PRs exactly as that workflow defines, including for the subagents it spawns.
- **Branches:** Default branch is releasable; the pre-commit hook is the gate. Commit directly to it. Use a `<type>/<task-slug>` (`feat/` or `fix/`) branch + PR only when the user asks, via `/dev-loop`, or when the change is risky enough to want CI green before merge. Multi-phase plans use epic branch `feat/<plan-slug>` and phase branches `feat/<plan-slug>-phase-<N>`.
- **Commits & PR Titles:** Conventional Commits (`<type>(<scope>): <summary>`). Subject ≤72 chars, imperative mood. Body explains *why*. One logical change per commit.
- **Artifacts:** Never commit temporary agent session files (e.g., scratchpads, tool-specific session state). Official feature plans (including task checklists) should be committed.
- **Security:** Never commit secrets/API keys. Ensure `.env` is gitignored.
- **Self-Review:** Review `git diff` before commit. Strip debug logs/stray changes.

---

# Part 2: Project Context

## Project Identity

- **Release Model**: Continuous (`plans/`)

SimpleFPS is an arena-based first-person shooter with WebGPU rendering, distributed as a PWA for Desktop, Android, and iOS. It is written in [GoFront](https://github.com/seriva/gofront) (Go syntax compiled to a seamless hybrid of JavaScript and WebAssembly); collision and physics run in WebAssembly (WasmGC), mathx in both targets, and the rest in JavaScript. The rewrite from ES6 modules is complete — see `plans/archive/gofront-rewrite-plan.md` for the design decisions and phase history.

## Tech Stack
- **Language**: GoFront (`.go` packages compiled to ES modules and WebAssembly GC modules; `.templ` for UI components). No JavaScript under `app/src`; the only JS files are `tests/**` , `playwright.config.js` and the asset converters in `scripts/`.
- **Rendering**: WebGPU (sole graphics API)
- **Math**: in-engine `mathx.Vec3` / `Mat4` / `Quat` (`app/src/engine/mathx/`, compiled for both JS and WASM), no third-party math library
- **Networking**: PeerJS (WebRTC P2P), bundled via `gofront prep`
- **Build**: GoFront (`npm run dev` / `npm run build`)
- **Test**: `npm test` (`gofront test app/src/...`, every package), `npm run test:dom` (same with a jsdom `window`/`document`), `npm run test:perf` (zero-allocation raycast, controller and SIMD skinning benchmark + `tests/perf/simd-kernels.js` SIMD canary + `tests/perf/ab.js` A/B self-test + `tests/perf/mathx-js.js` `mathx` JS A/B gate; both A/B runs skip unless `GOFRONT_BASELINE_DIR`/`BASELINE_SRC` is set), `npm run test:e2e` (Playwright smoke test), `npm run test:all`
- **Lint / Format / Type-check**: `npm run check` = Biome lint (JS files only) + `scripts/check-simd.js` (SIMD-only-in-WASM) + `gofront check app/src/...`; `npm run format` = Biome format
- **Node**: >= 24.0.0, npm >= 11.0.0; uses GoFront >= 1.8.0 (`gofront/simd` in `animation`).

## Commands

- **Test**: `npm test`, `npm run test:dom`, `npm run test:perf`, `npm run test:e2e`; everything: `npm run test:all`
- **Lint**: `npm run check` (Biome + SIMD-only-in-WASM check + `gofront check`)
- **Format**: `npm run format`
- **Build**: `npm run build`
- **Pre-commit gate**: `lefthook run pre-commit && npm test && npm run test:dom` (lefthook runs format → lint only)

## Architecture
Game code lives in `app/src/game/` (package `game`), the engine in `app/src/engine/` (package `engine` plus `animation/`, `assets/`, `collision/` (WASM), `mathx/` (JS + WASM), `physics/` (WASM), `rendering/`, `rendering/fakegpu/` (test-only fake `GPUDevice`), `scene/`, `systems/`), and typings for vendored libs in `app/src/dependencies/`. `app/src/main.go` is the application entry point: it initialises the WebGPU backend, loads resources, boots the game and registers the update/render callbacks with `engine`. Asset-conversion scripts live in `scripts/` (BSP, MD5, OBJ converters). The architecture is documented in `docs/architecture.md` (package layout, dependency rules, frame loop, rendering passes, scene, networking, performance invariants).

## Core Rules & Anti-Patterns
- **Dependency direction:** `game` and `main` may import any engine package; engine packages import only each other (never `game`) and never form cycles. Only `rendering` touches WebGPU; `rendering/fakegpu` is imported by `_test.go` files alone.
- **Zero per-frame allocations:** pre-allocate all scratch vectors/matrices/quaternions at package level (e.g. `var _tmpMat4 Mat4`) and reuse via in-place methods. Queries write into caller-provided slices and return a count. In GoFront, `[N]T` literals, `append`, reslicing, comma-ok type assertions, and assigning struct-typed fields all allocate — keep them out of hot paths. The `min`/`max` builtins work in every target and do not allocate; use them instead of hand-written helpers (never name a local `min`/`max`).
- **JS ↔ WASM boundary discipline:** keep boundary calls coarse and per-frame (e.g. raycasting, collision queries). Passing `any` or returning struct values allocates; pass pointers (`*mathx.Vec3`, `*collision.RaycastResult`) using caller-provided buffers. Packages targeting `both` (`mathx`) must not contain mutable package-level state.
- **Strict mode in `both` packages:** GoFront compiles the JS half of a `both` package with Go's runtime checks (every slice index bounds-checked, every field access through a pointer nil-checked), roughly 3× slower on `mathx` matrix code without help. A function that indexes a `Mat4` with constants starts with `_ = m[15]` for each `Mat4` it indexes, which lets GoFront drop those index checks. The proof is per identifier: hint the name actually indexed, so for an alias (`m := matrix`) put `_ = m[15]` after the alias. `tests/perf/mathx-js.js` gates this against a baseline compiler.
- **SIMD only in WASM:** import `gofront/simd` only in `//gofront:target wasm` packages, keep `F32x4` in unexported types/functions (never across the JS↔WASM boundary), and land it only behind a measured gate (`tests/perf/ab.js`). In `js`/`both` packages `F32x4` is a frozen array that allocates per operation (measured ≈ 4.4 MB new-space and ≈ 145–195 ns/op per 1M mul+add) — slower than scalar JS and it breaks zero-alloc. `npm run check` fails on violations (`scripts/check-simd.js`); `tests/perf/simd-kernels.js` re-measures the cost.
- **Browser interop:** globals GoFront does not predeclare (`Reflect`, `globalThis`, `process`, `Image`, `GPU*` constants, …) are declared in a per-package `interop.d.ts` imported via `import "js:./interop.d.ts"`. Do not redeclare predeclared ones (`window`, `document`, `navigator`, `location`, `performance`, `console`, `Math`, `URL`, typed arrays, `WebGL2RenderingContext`) — it only shadows their built-in typing. Guard `window == nil` so packages stay testable headless. DOM values in `game` (element refs, event handlers) use the `UI*` interfaces in `game/interop.d.ts` (`UIElement`, `UIClassList`, `UIStyle`, `UIEvent`, `UIStateDetail`), never `any`: declare one member per member read, so `gofront check` rejects a misspelled one, and read typed members without `.(string)`/`.(float64)` assertions. Menus are a `MenuID` enum (`MenuMain`, …), never a string; `menuFromName` is the only string boundary (the `changestate` event).
- **Keep docs current:** changes to package boundaries, the frame loop, rendering passes, scene, or networking → update `docs/architecture.md`. New player-visible features → update `README.md`. File-tree changes → update the Project Structure tree in `README.md`.
- **Use the in-game console:** log via `systems.GlobalConsole.Log` / `.Warn` / `.Error`, not `console.*`. The only exceptions are `systems` internals and the render backends, which run before the console exists.
- **Test every package:** new `.go` code gets `*_test.go` next to it; hot paths get a heap-growth test (see `rendering/rendering_test.go`; WASM packages are covered by `tests/perf/zero-alloc.js`, since `process`/`document` are unavailable in WASM tests). Skip DOM-dependent assertions when `document != nil` only if jsdom noise makes them meaningless.
- **No direct GPU code outside the renderer:** all WebGPU work goes through `rendering.Backend` and the renderer in `engine/rendering/`; entities only fill `ObjectData` slots and issue draws through `Renderer` helpers.
- **No entity↔Scene coupling:** pass ambient light, shadow height, etc. as arguments to `render()` / `renderShadow()` rather than importing Scene from within entities.
- **Generated assets are committed, never hand-edited:** `app/resources/**` (`.bmesh`, `.bin`, `.mesh`, textures, `config.arena`) is produced by the converters in `scripts/`; regenerate from the source asset instead of patching the output. Build output (`public/`, `app/app.js`, `app/app.wasm`, `app/vendor.js`) stays `.gitignore`d.

