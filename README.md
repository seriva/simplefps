## About

Simple first person arena shooter written in Go syntax, compiled to JavaScript with [GoFront](https://github.com/seriva/gofront), rendering through WebGPU or WebGL 2, with a PWA distribution target for Desktop, Android and iOS.

**Project Evolution** (2017-2026): Started as a basic WebGL experiment, evolved through 500+ commits to include physics simulation, weapon systems, mobile touch controls, PWA capabilities, and finally a full rewrite from ES6 modules to type-checked GoFront packages.

**Technology Journey**: Originally used Cordova + NW.js for desktop/mobile packaging, Webpack → Brunch → Rollup for bundling, and Yarn → pnpm → npm for package management. Moved to a PWA approach with the Microtastic build system, then to GoFront, which replaced both the build tooling and the language.

## Features

- **Gameplay**: Arena-based FPS with physics-based projectiles, multiple weapons (Energy Scepter, Plasma Pistol, Pulse Cannon, Laser Gatling), and cross-platform controls
- **Rendering**: Hybrid WebGL/WebGPU engine with PBR-like lighting, UBOs, detail textures, emissive materials, and post-processing pipeline. See [Architecture — Rendering](docs/architecture.md#rendering).
- **UI**: Menus, HUD, loading screens and debug console as GoFront `.templ` components with a small game state machine
- **Performance**: Zero-allocation hot paths (physics step, raycasts, render frame) guarded by heap-growth tests and a benchmark; linear depth buffer; PWA support
- **Architecture**: Go packages (`engine`, `physics`, `rendering`, `scene`, `game`, …) with an entity system, scene management, and comprehensive input handling. See [Architecture](docs/architecture.md).
- **Cross-Platform**: Runs on Desktop, Android, and iOS with touch controls and responsive design
- **Settings**: In-game settings menu with graphics (including renderer selection) and input configuration
- **Networking**: Client-authoritative P2P multiplayer via PeerJS (WebRTC) for simple host/join sessions. See [Architecture — Networking](docs/architecture.md#networking).

## Tech Stack

**Core**: [GoFront](https://github.com/seriva/gofront) (Go syntax compiled to JavaScript), in-engine 3D math (`physics.Vec3`/`Mat4`/`Quat`)
**Rendering**: WebGPU (experimental) & WebGL 2.0 backends
**Build**: GoFront (dev server, production builds, vendor bundling, type-check, tests)
**Tools**: Biome (lint/format for the few JS files), Lefthook (git hooks), jsdom (`--dom` tests), Playwright (E2E smoke test)

## Project Structure

```
app/
├── src/
│   ├── main.go           # package main: backend selection, resource loading, game boot, render loop
│   ├── interop.d.ts      # Browser globals GoFront does not predeclare
│   ├── dependencies/     # Typings for vendored 3rd party libs (peerjs.d.ts)
│   ├── engine/           # package engine: backend selection, update callbacks, render loop
│   │   ├── animation/    # package animation: skeletons, clips, animation player
│   │   ├── assets/       # package assets: mesh/material/resource-list parsing, ResourceManager
│   │   ├── physics/      # package physics: vec3/mat4/quat, FPS controller, collision, octree
│   │   ├── rendering/    # package rendering: RenderBackend interface, renderer, passes, materials
│   │   │   ├── webgl/    # package webgl: WebGL2 backend + GLSL shaders
│   │   │   └── webgpu/   # package webgpu: WebGPU backend + WGSL shaders
│   │   ├── scene/        # package scene: entities, culling, light grid, draw lists for the renderer
│   │   └── systems/      # package systems: camera, settings, input, audio, console, network
│   └── game/             # package game: state machine, weapons, projectiles, pickups, arena,
│                         #   multiplayer, HUD/menus/loading as .go + .templ
├── resources/            # Game assets (textures, models, sounds)
├── style.css             # All UI/HUD/menu styles (hot-swapped by gofront dev)
├── manifest.json         # PWA manifest
└── index.html            # Main HTML file (loads vendor.js + app.js built by GoFront)
tests/
├── e2e/smoke.spec.js     # Playwright smoke test (boot → menu → start game renders a frame)
└── perf/zero-alloc.js    # Zero-allocation raycast benchmark against the compiled physics package
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

> Until the GoFront fixes made during the rewrite are published, this branch needs the local
> checkout: `npm link gofront` from a sibling `gofront/` clone. Re-run it after every `npm install`,
> which replaces the link with the registry package.

### Commands
```bash
npm run dev          # Start development server (GoFront, live reload)
npm run build        # Production PWA build → public/
npm run format       # Format JS (tests, Playwright config) with Biome
npm run check        # Biome lint + GoFront type-check of every package (gofront check app/src/...)
npm test             # GoFront unit/integration tests for every package (gofront test app/src/...)
npm run test:dom     # Same, with a jsdom window/document (for .templ / DOM code)
npm run test:perf    # Zero-allocation raycast benchmark (tests/perf/zero-alloc.js)
npm run test:e2e     # Playwright smoke test in headless Chromium (WebGL2)
npm run test:all     # check + test + test:dom + test:perf + test:e2e
npm run prep         # Bundle vendor dependencies (peerjs)
```

