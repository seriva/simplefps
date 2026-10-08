# SimpleFPS Agent Guide

# Part 1: Agent Workflow
> [!IMPORTANT]
> **IMMUTABLE SECTION:** Do not modify Part 1 unless explicitly instructed. This is a universal standard. Only adjust Part 2 (Project Context) for project-specific needs.

## 1. Context & Rules
- **Caveman Speak:** Communicate in "caveman" style (extreme density, zero fluff, drop grammar, `->` for correlations). Exception: human-facing docs (`README`, `CHANGELOG`, plans) must remain readable.
- **Plan-first:** Create `docs/vX.Y.Z/<feature>-plan.md` & update roadmap for non-trivial (multi-component, arch-altering, risky) features. Track execution by checking off tasks (`- [x]`) as they land.
- **TDD:** Write failing tests first for non-trivial logic (if applicable).
- **Quality:** Run format/lint before every commit. Update `CHANGELOG.md` & `README.md` before PR.
- **Verify:** Run tests/compiler or ask user to visually verify before concluding/PR. Never assume.
- **Blockers:** Stop and ask user on ambiguity; do not guess.
- **Scope:** Stick strictly to requested task/plan. No unrequested features/refactoring.
- **Dependencies:** Use existing packages/standard lib. Ask before adding new dependencies.
- **Stuck:** If same approach fails twice, stop and ask user. Do not retry blindly.
- **Code Preservation:** Do not delete existing comments, docstrings, or unrelated code unless explicitly instructed.

## 2. Git Standards
- **No Auto-Commit:** Never run `git commit`, `git push`, or history-rewriting commands unless the user explicitly asks in the current turn. Make changes, run quality gates, report, then wait for the user to commit or instruct.
- **Branches:** Default branch is releasable; the pre-commit hook is the gate. Commit directly to it. Use a `feat/` or `fix/` branch + PR only when the user asks or the change is risky enough to want CI green before merge.
- **Commits:** Conventional Commits (`type(scope): subject`). Subject ≤72 chars, imperative mood. Body explains *why*. One logical change per commit.
- **Artifacts:** Never commit temporary agent session files (e.g., scratchpads, tool-specific session state). Official feature plans (including task checklists) should be committed.
- **Security:** Never commit secrets/API keys. Ensure `.env` is gitignored.
- **Self-Review:** Review `git diff` before commit. Strip debug logs/stray changes.

---

# Part 2: Project Context

## Project Identity
SimpleFPS is an arena-based first-person shooter with WebGPU rendering, distributed as a PWA for Desktop, Android, and iOS. It is written in [GoFront](https://github.com/seriva/gofront) (Go syntax compiled to a seamless hybrid of JavaScript and WebAssembly); collision runs in WebAssembly (WasmGC), mathx in both targets, and the rest in JavaScript. The rewrite from ES6 modules is complete — see `docs/plans/archive/gofront-rewrite-plan.md` for the design decisions and phase history.

## Tech Stack
- **Language**: GoFront (`.go` packages compiled to ES modules and WebAssembly GC modules; `.templ` for UI components). No JavaScript under `app/src`; the only JS files are `tests/**` , `playwright.config.js` and the asset converters in `scripts/`.
- **Rendering**: WebGPU (sole graphics API)
- **Math**: in-engine `mathx.Vec3` / `Mat4` / `Quat` (`app/src/engine/mathx/`, compiled for both JS and WASM), no third-party math library
- **Networking**: PeerJS (WebRTC P2P), bundled via `gofront prep`
- **Build**: GoFront (`npm run dev` / `npm run build`)
- **Test**: `npm test` (`gofront test app/src/...`, every package), `npm run test:dom` (same with a jsdom `window`/`document`), `npm run test:perf` (zero-allocation raycast benchmark), `npm run test:e2e` (Playwright smoke test), `npm run test:all`
- **Lint / Format / Type-check**: `npm run check` = Biome lint (JS files only) + `gofront check app/src/...`; `npm run format` = Biome format
- **Node**: >= 24.0.0, npm >= 11.0.0; uses GoFront >= 1.5.1.

## Architecture
Game code lives in `app/src/game/` (package `game`), the engine in `app/src/engine/` (package `engine` plus `animation/`, `assets/`, `collision/` (WASM), `mathx/` (JS + WASM), `physics/`, `rendering/`, `rendering/fakegpu/` (test-only fake `GPUDevice`), `scene/`, `systems/`), and typings for vendored libs in `app/src/dependencies/`. `app/src/main.go` is the application entry point: it initialises the WebGPU backend, loads resources, boots the game and registers the update/render callbacks with `engine`. Asset-conversion scripts live in `scripts/` (BSP, MD5, OBJ converters). The architecture is documented in `docs/architecture.md` (package layout, dependency rules, frame loop, rendering passes, scene, networking, performance invariants).

## Core Rules & Anti-Patterns
- **Dependency direction:** `game` and `main` may import any engine package; engine packages import only each other (never `game`) and never form cycles. Only `rendering` touches WebGPU; `rendering/fakegpu` is imported by `_test.go` files alone.
- **Zero per-frame allocations:** pre-allocate all scratch vectors/matrices/quaternions at package level (e.g. `var _tmpMat4 Mat4`) and reuse via in-place methods. Queries write into caller-provided slices and return a count. In GoFront, `[N]T` literals, `append`, reslicing, comma-ok type assertions, and assigning struct-typed fields all allocate — keep them out of hot paths.
- **JS ↔ WASM boundary discipline:** keep boundary calls coarse and per-frame (e.g. raycasting, collision queries). Passing `any` or returning struct values allocates; pass pointers (`*mathx.Vec3`, `*collision.RaycastResult`) using caller-provided buffers. Packages targeting `both` (`mathx`) must not contain mutable package-level state.
- **Browser interop:** globals GoFront does not predeclare (`Reflect`, `globalThis`, `process`, `Image`, `GPU*` constants, …) are declared in a per-package `interop.d.ts` imported via `import "js:./interop.d.ts"`. Do not redeclare predeclared ones (`window`, `document`, `navigator`, `location`, `performance`, `console`, `Math`, `URL`, typed arrays, `WebGL2RenderingContext`) — it only shadows their built-in typing. Guard `window == nil` so packages stay testable headless.
- **Keep docs current:** changes to package boundaries, the frame loop, rendering passes, scene, or networking → update `docs/architecture.md`. New player-visible features → update `README.md`. File-tree changes → update the Project Structure tree in `README.md`.
- **Use the in-game console:** log via `systems.GlobalConsole.Log` / `.Warn` / `.Error`, not `console.*`. The only exceptions are `systems` internals and the render backends, which run before the console exists.
- **Test every package:** new `.go` code gets `*_test.go` next to it; hot paths get a heap-growth test (see `physics/integration_test.go` and `collision/integration_test.go`). Skip DOM-dependent assertions when `document != nil` only if jsdom noise makes them meaningless.
- **No direct GPU code outside the renderer:** all WebGPU work goes through `rendering.Backend` and the renderer in `engine/rendering/`; entities only fill `ObjectData` slots and issue draws through `Renderer` helpers.
- **No entity↔Scene coupling:** pass ambient light, shadow height, etc. as arguments to `render()` / `renderShadow()` rather than importing Scene from within entities.
- **Generated assets are committed, never hand-edited:** `app/resources/**` (`.bmesh`, `.bin`, `.mesh`, textures, `config.arena`) is produced by the converters in `scripts/`; regenerate from the source asset instead of patching the output. Build output (`public/`, `app/app.js`, `app/app.wasm`, `app/vendor.js`) stays `.gitignore`d.

