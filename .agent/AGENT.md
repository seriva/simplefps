# SimpleFPS — Antigravity Agent File

## Project Overview
SimpleFPS is an arena-based first-person shooter written in ES6 modules targeting WebGL 2.0 and WebGPU. It is distributed as a PWA and supports Desktop, Android, and iOS. The project has evolved since 2017 and currently uses modern tooling including Microtastic (build/dev server), Biome (lint/format), and Husky (git hooks).

## Tech Stack
- **Language**: ES6 Modules
- **Rendering**: Hybrid WebGL 2 / WebGPU backends (feature-detected at runtime)
- **Physics**: cannon-es
- **Math**: gl-matrix
- **UI / Reactivity**: simple-reactive (bundled at `app/src/dependencies/reactive.js`, sourced from `node_modules/microtastic/reactive.js`)
- **Networking**: PeerJS (WebRTC P2P)
- **Build**: Microtastic (`npm run dev` / `npm run prod`)
- **Linting / Formatting**: Biome (`npm run check` / `npm run format`)
- **Node**: >= 20.0.0, npm >= 9.0.0

## Project Structure
```
app/
├── src/
│   ├── dependencies/     # Bundled 3rd-party libs (reactive.js, etc.)
│   ├── engine/           # Core engine
│   │   ├── engine.js     # Barrel export + game loop entry point
│   │   ├── animation/    # Skeletal animation
│   │   ├── physics/      # FPS controller, collision, octree
│   │   ├── rendering/    # WebGPU & WebGL backends + shaders
│   │   ├── scene/        # Entity system & scene graph
│   │   └── systems/      # Camera, settings, input, audio, resources, console
│   ├── game/             # Game-specific logic
│   │   ├── weapons.js    # Weapon system
│   │   ├── controls.js   # Player input / controls
│   │   ├── arena.js      # Arena / map management
│   │   └── gamedefs.js   # Shared game constants & definitions
│   └── main.js           # Application entry point
├── resources/            # Game assets (textures, models, sounds, maps)
└── index.html
scripts/
├── bsp2map.js            # Quake 3 BSP → game format converter
├── md5tomesh.js          # Doom 3 MD5 → mesh converter
└── obj2mesh.js           # OBJ → mesh converter
docs/
├── rendering.md          # Rendering architecture docs
├── scene.md              # Scene system docs
└── networking.md         # Networking architecture docs
```

## Key Conventions & Patterns
- **No TypeScript** — plain ES6. No JSDoc comments anywhere.
- **No default exports** — prefer named exports.
- **`const` over `let`**, never `var`.
- **Biome**: formatter and linter (`npm run format` / `npm run check`).
- **Entity system**: all scene objects extend a base entity class; entities should be decoupled from the Scene module — pass ambient light, shadow height, etc. as arguments to `render` / `renderShadow` rather than having entities import Scene.
- **Renderer abstraction**: code that touches GPU must branch on WebGPU vs WebGL backends via the renderer interface in `engine/rendering/`.
- **reactive.js**: used for UI state management and component lifecycle. Component flow: `state()` → `init()` → `render()` → `mount()` (→ `onCleanup()` on teardown). Create computed/async signals in `init()`, DOM in `render()`, side-effects in `mount()`.
- **Asset pipeline**: textures, meshes, and maps are pre-processed by scripts in `scripts/`. Do not commit generated binary assets; add them to `.gitignore` if necessary.
- **Imports**: always use relative paths with explicit `.js` extensions (ES module browser semantics).
- **Performance — no per-frame allocations**: never create matrices, vectors, quaternions, or other temporary objects inside functions that run per-frame or per-entity. Pre-allocate all such scratch objects at module level (e.g. `const _tmpMat4 = mat4.create()`) and reuse them via in-place gl-matrix operations (`mat4.multiply(out, a, b)` etc.). Apply this rule to any object that would otherwise be GC'd at high frequency.

## Naming Conventions
- **Classes**: PascalCase (e.g., `PhysicsBody`, `SceneEntity`)
- **Functions / variables**: camelCase (e.g., `loadSettings`, `deltaTime`)
- **Constants / config objects**: UPPER_SNAKE_CASE (e.g., `MAX_LIGHTS`, `DEFAULT_FOV`)
- **Private class fields**: `#` prefix (e.g., `#mesh`, `#pipeline`)
- **Private / scratch module-level variables**: `_` prefix (e.g., `_tmpMat4`, `_activeScene`)

## Common Commands
```bash
npm run dev          # Start Microtastic dev server with hot-reload
npm run prod         # Lint → production build
npm run format       # Auto-format with Biome
npm run check        # Lint with Biome (CI check)
npm run dependencies # Re-bundle 3rd-party dependencies via Microtastic
npm run prepare      # Husky + microtastic prep (run after npm install)
```

> **Workflow**: Always run `npm run check` (lint) and `npm run prod` (production build) before considering any task complete. Never stop at just the dev server.
