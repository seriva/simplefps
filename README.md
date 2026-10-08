## About

Simple first person arena shooter written in Go syntax, compiled to a seamless hybrid of JavaScript (ES modules) and WebAssembly (WasmGC) with [GoFront](https://github.com/seriva/gofront), rendering through WebGPU, with a PWA distribution target for Desktop, Android and iOS.

**Project Evolution** (2017-2026): Started as a basic WebGL experiment, evolved through 500+ commits to include physics simulation, weapon systems, mobile touch controls, PWA capabilities, and finally a full rewrite from ES6 modules to type-checked GoFront packages.

**Technology Journey**: Originally used Cordova + NW.js for desktop/mobile packaging, Webpack → Brunch → Rollup for bundling, and Yarn → pnpm → npm for package management. Moved to a PWA approach with the Microtastic build system, then to GoFront, which replaced both the build tooling and the language.

## Features

- **Gameplay**: Arena-based FPS with physics-based projectiles, multiple weapons (Energy Scepter, Plasma Pistol, Pulse Cannon, Laser Gatling), and cross-platform controls
- **Rendering**: WebGPU-native deferred engine with pre-baked pipelines, storage-buffer skinning and lights, GPU-simulated particles, compute post-fx, detail textures, emissive materials and FSR upscaling. See [Architecture — Rendering](docs/architecture.md#rendering).
- **UI**: Menus, HUD, loading screens and debug console as GoFront `.templ` components with a small game state machine
- **Performance**: Zero-allocation hot paths (physics step, raycasts, render frame) guarded by heap-growth tests and a benchmark; linear depth buffer; PWA support
- **Architecture**: Go packages (`engine`, `mathx`, `collision`, `physics`, `rendering`, `scene`, `game`, …) with an entity system, scene management, and comprehensive input handling. Collision runs in WebAssembly (WasmGC), `mathx` runs on both targets, and the rest in JavaScript. See [Architecture](docs/architecture.md).
- **Cross-Platform**: Runs on Desktop, Android, and iOS with touch controls and responsive design
- **Settings**: In-game settings menu with graphics (including renderer selection) and input configuration
- **Networking**: Client-authoritative P2P multiplayer via PeerJS (WebRTC) for simple host/join sessions. See [Architecture — Networking](docs/architecture.md#networking).

## Tech Stack

**Core**: [GoFront](https://github.com/seriva/gofront) (Go syntax compiled to JavaScript and WebAssembly), in-engine 3D math (`mathx.Vec3`/`Mat4`/`Quat`)
**Rendering**: WebGPU
**Build**: GoFront (dev server, production builds, vendor bundling, type-check, tests)
**Tools**: Biome (lint/format for the few JS files), Lefthook (git hooks), jsdom (`--dom` tests), Playwright (E2E smoke test)

## Project Structure

```
app/
├── src/
│   ├── main.go           # package main: resource loading, game boot, render loop
│   ├── interop.d.ts      # Browser globals GoFront does not predeclare
│   ├── dependencies/     # Typings for vendored 3rd party libs (peerjs.d.ts)
│   ├── engine/           # package engine: WebGPU init, update callbacks, render loop
│   │   ├── animation/    # package animation: skeletons, clips, animation player
│   │   ├── assets/       # package assets: mesh/material/resource-list parsing, ResourceManager
│   │   ├── collision/    # package collision: trimesh, octree, raycasts (compiled to WASM)
│   │   ├── mathx/        # package mathx: vec3/mat4/quat/transform/boundingbox (JS + WASM)
│   │   ├── physics/      # package physics: FPS controller, dynamic bodies
│   │   ├── rendering/    # package rendering: WebGPU backend, renderer, passes, pipelines, WGSL, materials
│   │   │   └── fakegpu/  # package fakegpu: in-memory GPUDevice recorder for headless tests
│   │   ├── scene/        # package scene: entities, culling, light grid, draw lists for the renderer
│   │   └── systems/      # package systems: camera, settings, input, audio, console, network
│   └── game/             # package game: state machine, weapons, projectiles, pickups, arena,
│                         #   multiplayer, HUD/menus/loading as .go + .templ
├── resources/            # Game assets (textures, models, sounds)
├── style.css             # All UI/HUD/menu styles (hot-swapped by gofront dev)
├── manifest.json         # PWA manifest
└── index.html            # Main HTML file (loads vendor.js + app.js and linked app.wasm)
tests/
├── e2e/smoke.spec.js     # Playwright smoke test (boot → menu → start game renders a frame)
└── perf/zero-alloc.js    # Zero-allocation raycast benchmark against the compiled physics + collision (WASM) packages
scripts/
├── bsp2map.js            # Quake 3 BSP to game format converter
├── md5tomesh.js          # Doom 3 MD5 to mesh format converter
└── obj2mesh.js           # OBJ to mesh format converter
```

## Quick Start

```bash
# System dependency for texture conversion (bsp2map/obj2mesh)
sudo apt install imagemagick  # or: brew install imagemagick

npm install              # Install dependencies (Node.js >= 24.0.0, npm >= 11.0.0)
npm run prepare          # Setup Lefthook git hooks + bundle dependencies
```

### Commands
```bash
npm run dev          # Start development server (GoFront, live reload)
npm run build        # Production PWA build → public/ (emits public/app.js & public/app.wasm)
npm run format       # Format JS (tests, Playwright config) with Biome
npm run check        # Biome lint + GoFront type-check of every package (gofront check app/src/...)
npm test             # GoFront unit/integration tests for every package (mathx on both JS and WASM, collision in WASM)
npm run test:dom     # Same, with a jsdom window/document (for .templ / DOM code)
npm run test:perf    # Zero-allocation raycast benchmark (tests/perf/zero-alloc.js)
npm run test:e2e     # Playwright smoke test in headless Chromium (WebGPU)
npm run test:all     # check + test + test:dom + test:perf + test:e2e
npm run prep         # Bundle vendor dependencies (peerjs)
```

