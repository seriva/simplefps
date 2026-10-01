# Changelog

All notable changes to this project will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

## [Unreleased]

### Changed
- **Rewrote SimpleFPS in [GoFront](https://github.com/seriva/gofront).** Every engine and game module under `app/src` is now a Go package or `.templ` component compiled by `gofront`; no JavaScript remains in the app source. The module layout is preserved 1-to-1: `engine/{physics,systems,animation,rendering,rendering/webgl,rendering/webgpu,scene,assets}`, `game/`, and `main.go`. Design decisions and phase history are in `docs/plans/archive/gofront-rewrite-plan.md`.
- Hot paths (physics step, raycasts, render passes, HUD) are zero-allocation: out-parameter math (`Vec3`/`Mat4`/`Quat`), caller-provided query buffers, fixed-capacity entity/active lists with swap-remove, package-level scratch state, and cached-DOM HUD writes. Heap-growth guards in the `physics`, `rendering` and `scene` test suites enforce this.
- UI (`menus`, `loading`, `hud`, `console`, `stats`, `virtual_input`) is authored in `.templ` with a plain Go state machine; `Reactive.js` is gone. All CSS lives in `app/style.css` so `gofront dev` hot-swaps it.
- Build tooling switched from Microtastic to GoFront (`dev`, `build --pwa`, `prep`, `check`, `test`, `test:dom`), using recursive `app/src/...` package patterns. `gl-matrix` removed; `peerjs` bundled via GoFront's vendor bundler; `jsdom` added for `--dom` tests. Requires `gofront` ≥ 1.3.8 (`^1.3.9` pinned).
- Test suite: `gofront test` (headless and `--dom`) across all packages, `tests/perf/zero-alloc.js` (`npm run test:perf`, 100k raycasts < 64 KB new-space growth) and a Playwright smoke test `tests/e2e/smoke.spec.js` (`npm run test:e2e`, WebGL2 boot → menu → lit frame). `npm run test:all` chains everything.
- Documentation (`AGENTS.md`, `README.md`, `docs/roadmap.md`) updated for the GoFront platform; rewrite plan archived.

### Removed
- All legacy ES6 modules under `app/src/` and the Microtastic/`gl-matrix` dependencies.
- Archived feature plans for the ES6 engine (`docs/plans/archive/*`, except the GoFront rewrite plan); the roadmap keeps their summaries as plain rows.

### Fixed
- Debug console commands `tbv`/`twf`/`tlv`/`tsk` were never registered outside tests; `ConsoleManager.ExecuteCmd` also accepts the legacy call syntax (`twf()`, `rscale(0.5)`).
- WebGPU backend: shader modules carry a `label` so bind-group layouts resolve; textures recreate on image upload with full mip chains; `GenerateMipmaps` never encodes into an open pass; depth compare state and lightmap vertex attribute binding fixed.
- `Ray.IntersectTrimesh` no longer boxes a `float32` per cast (writes `Ray.Result` directly).
- Octree `Insert` rolls back an unused subdivision and `RemoveEmptyNodes` compacts in place.
- Several GoFront compiler bugs surfaced by the port were fixed upstream in 1.3.7–1.3.9 (pointer receiver typing, imported struct literals, `sort.Slice` index semantics, `rand.Float32` type, multi-assign temporaries, generic-vs-index parsing, minifier regex misdetection, SVG namespace in `.templ`).

## [2026-09] — Legacy JavaScript engine

Final iteration of the ES6/Microtastic codebase before the GoFront rewrite. Highlights, all carried over into the Go port:

- 120 Hz fixed-timestep accumulator decoupling simulation from refresh rate.
- Quake-style `FPSController` step-climbing, iterative wall sliding and multi-height depenetration.
- Two-level BVH, light contribution culling, pooled transparent sorting, shadow raycast budget, compact light UBO layout.
- Backend optimisations: cached scalar uniforms, VAO-baked index buffers, persistent Kawase ping-pong framebuffers, WebGPU bind-group cache eviction on resize, full mip chains for immutable textures.
- Zero-allocation fixes across entities (SoA particles, pre-allocated scratch matrices, pooled sort entries) and GPU resource disposal for emitters and skinned meshes.
- Completed feature plans moved to `docs/plans/archive/`; project made versionless.

## [2026-05]

### Added
- Initial release.
