## About

Simple first person arena shooter game written in ES6 and WebGL with a PWA distribution target for Desktop, Android and iOS.

**Project Evolution** (2017-2026): Started as a basic WebGL experiment, evolved through 500+ commits to include physics simulation, weapon systems, mobile touch controls, PWA capabilities, and modern development tooling with devcontainer support.

**Technology Journey**: Originally used Cordova + NW.js for desktop/mobile packaging, Webpack → Brunch → Rollup for bundling, and Yarn → pnpm → npm for package management. Migrated to modern PWA approach with Microtastic build system and devcontainer for streamlined development.

## Features

- **Gameplay**: Arena-based FPS with physics-based projectiles, multiple weapons (Energy Scepter, Plasma Pistol, Pulse Cannon, Laser Gatling), and cross-platform controls
- **Rendering**: Hybrid WebGL/WebGPU engine with PBR-like lighting, UBOs, detail textures, emissive materials, and post-processing pipeline. See [Rendering Architecture](docs/rendering.md).
- **UI**: Modern, reactive UI system with state management for menus and HUD
- **Performance**: Optimized rendering with linear depth buffer, physics simulation, and PWA support
- **Architecture**: Modular ES6 design with entity system, scene management, and comprehensive input handling. See [Scene System](docs/scene.md).
- **Cross-Platform**: Runs on Desktop, Android, and iOS with touch controls and responsive design
- **Settings**: In-game settings menu with graphics (including renderer selection) and input configuration
- **Networking**: Client-authoritative P2P multiplayer via PeerJS (WebRTC) for simple host/join sessions. See [Networking Architecture](docs/networking.md).

## Tech Stack

**Core**: [GoFront](https://github.com/seriva/gofront) (Go syntax compiled to JavaScript), in-engine 3D math (`physics.Vec3`/`Mat4`/`Quat`)
**Rendering**: WebGPU (experimental) & WebGL 2.0 backends
**Build**: GoFront (dev server, production builds, vendor bundling, tests)
**Tools**: Biome (linting/formatting), Lefthook (git hooks), Devcontainer (development environment)

> The GoFront rewrite is in progress on the `gofront` branch: the `physics` and `systems` engine packages are ported and tested; rendering, scene, UI and game code are still the legacy ES6 modules. See [docs/plans/gofront-rewrite-plan.md](docs/plans/gofront-rewrite-plan.md).

## Project Structure

```
app/
├── src/
│   ├── dependencies/     # Bundled 3rd party libs (peerjs)
│   ├── engine/           # Core engine modules
│   │   ├── engine.js     # Single entry point (barrel export + game loop)
│   │   ├── animation/    # Skeletal animation system
│   │   ├── physics/      # package physics: vec3/mat4/quat, FPS controller, collision, octree
│   │   ├── rendering/    # WebGPU/WebGL backends, shaders
│   │   ├── scene/        # Entity system & scene graph
│   │   └── systems/      # package systems: camera, settings, input, audio, binary reader
│   ├── game/             # Game-specific modules
│   │   ├── weapons.js    # Weapon system
│   │   ├── controls.js   # Game controls
│   │   ├── arena.js      # Arena management
│   │   └── ...
│   └── main.js           # Application entry point
├── resources/            # Game assets (textures, models, sounds)
└── index.html            # Main HTML file
scripts/
├── bsp2map.js            # Quake 3 BSP to game format converter
├── md5tomesh.js          # Doom 3 MD5 to mesh format converter
└── obj2mesh.js           # OBJ to mesh format converter
```

## Quick Start

### Devcontainer (Recommended)
Open in VS Code with Dev Containers extension - all dependencies are pre-configured.

### Manual Setup
```bash
# System dependency for texture conversion (bsp2map/obj2mesh)
sudo apt install imagemagick  # or: brew install imagemagick

npm install              # Install dependencies (Node.js >= 24.0.0, npm >= 11.0.0)
npm run prepare          # Setup Lefthook git hooks + bundle dependencies
```

### Commands
```bash
npm run dev          # Start development server (GoFront)
npm run build        # Production PWA build
npm run format       # Format code with Biome
npm run check        # Biome lint + GoFront type-check of physics and systems
npm test             # Run GoFront unit/integration tests for physics and systems
npm run test:dom     # Same, with a JSDOM window/document for the systems package
npm run prep         # Bundle vendor dependencies (peerjs)
```

