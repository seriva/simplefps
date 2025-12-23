# GitHub Copilot Instructions: SimpleFPS

## Project Overview
SimpleFPS is a WebGL-based arena shooter built with minimal tooling and maximum performance. The project uses a modular ES6 architecture with a clean separation between the game engine and game logic.

## Core Development Guidelines

### Module System
- **Always use default exports**: `export default ModuleName`
- Import modules with: `import ModuleName from "./module.js"`
- Maintain clean separation: engine code in `app/src/engine/`, game code in `app/src/game/`

### Code Organization & Naming Conventions

#### Module-level Private Items (use `_` prefix)
- Private variables, functions, and constants at module scope get `_` prefix
- Examples:
  ```javascript
  const _audioContext = new AudioContext();
  let _privateVar = value;
  function _parseCommand(cmd) { }
  class _InternalHelper { }
  ```

#### Class-level Private Members (use `#` prefix)
- Private fields and methods inside classes use JavaScript's `#` syntax
- Examples:
  ```javascript
  class MyClass {
    #privateField = value;
    #privateMethod() { }
    
    publicMethod() {
      this.#privateMethod();
    }
  }
  ```

#### File Structure Template
```javascript
// Imports
import Module from "./module.js";

// ============================================================================
// Private
// ============================================================================

const _privateConst = value;
let _privateVar = value;

function _privateHelper() { }

class _PrivateClass { }

// ============================================================================
// Public API
// ============================================================================

class PublicClass {
  #privateMethod() { }
  #privateField = value;
  
  publicMethod() { }
}

const PublicObject = {
  method() { }
};

export default PublicObject;
```

### Architecture Layers

#### Engine Layer (`app/src/engine/`)
Core WebGL engine modules:
- **Rendering**: `renderer.js`, `camera.js`, `scene.js`, `shaders.js`, `mesh.js`, `material.js`, `texture.js`
- **Physics**: `physics.js` (Cannon.js integration)
- **Input**: `input.js` (keyboard, mouse, touch, gamepad)
- **Resources**: `resources.js` (asset loading)
- **Entities**: `entity.js`, `meshentity.js`, `fpsmeshentity.js`
- **Lights**: `directionallightentity.js`, `pointlightentity.js`, `spotlightentity.js`
- **Systems**: `sound.js`, `console.js`, `stats.js`, `settings.js`, `loading.js`, `utils.js`

#### Game Layer (`app/src/game/`)
Game-specific logic:
- **Core**: `arena.js`, `weapons.js`, `controls.js`, `state.js`, `update.js`
- **UI**: `ui.js`, `hud.js`, `translations.js`
- **Systems**: `pickups.js`

### Performance Patterns

#### Critical Performance Rules
1. **No allocations in hot paths**: Avoid creating objects in render loops or update loops
2. **Use object pooling**: For frequently created/destroyed objects (projectiles, particles)
3. **Batch WebGL calls**: Group draw calls where possible
4. **Optimize physics**: Minimize body creation/destruction
5. **Profile regularly**: Use browser DevTools Performance tab and the Stats module

#### WebGL Best Practices
- Minimize state changes
- Batch similar draw calls
- Reuse buffers and textures
- Use appropriate texture sizes
- Enable frustum culling (already implemented in Scene)

### Key Engine Patterns

#### Game Loop
Located in `engine.js`, the `loop()` function handles:
- Frame timing and delta calculation
- Stats updates
- Input processing
- Camera updates
- Scene updates (entities, physics)
- Rendering

#### Entity System
- Extend base `Entity` class from `entity.js`
- Register entities with `Scene` for rendering
- Implement required methods: `update()`, `render()`, `updateBoundingVolume()`
- Use entity types from `EntityTypes` enum

#### Physics Integration
- Create Cannon.js bodies via `Physics` module
- Sync physics bodies with render entities in update loop
- Use `Physics.update()` in game loop

#### Resource Loading
- Load assets via `Resources.load(path)` before use
- Resources are cached automatically
- Support for meshes (.mesh, .bmesh), materials (.mat), textures, sounds (.sfx)

#### Input Handling
- Use `Input` module for all input (keyboard, mouse, touch, gamepad)
- Register key events with `Input.addKeyDownEvent()`, `Input.addKeyUpEvent()`
- Check key states with `Input.isDown(keyCode)`
- Get cursor movement with `Input.cursorMovement()`

### Technology Stack

#### Core Dependencies
- **ES6 Modules**: Native browser module support
- **WebGL 2.0**: Graphics rendering
- **Cannon.js**: Physics simulation (bundled in `dependencies/`)
- **gl-matrix**: 3D math operations (bundled in `dependencies/`)

#### Build & Development
- **Microtastic**: Dev server, production builds, dependency bundling
- **Biome**: Linting and formatting (replaces ESLint/Prettier)
- **Husky**: Git hooks for quality checks

### Common Commands
```bash
npm install          # Install dependencies (Node.js >= 18, npm >= 8)
npm run prepare      # Setup husky + bundle dependencies
npm run dev          # Start dev server with hot-reload
npm run format       # Format code with Biome
npm run check        # Lint code with Biome (must pass before commit)
npm run prod         # Production build (runs lint → build)
```

### Quality Requirements

#### Pre-commit Checks
- All code must pass `npm run check` (Biome linting)
- Format code with `npm run format` before committing
- No allocations in render/update loops
- Follow module organization patterns

#### Code Review Checklist
- [ ] Uses default exports consistently
- [ ] Private items properly prefixed (`_` for module-level, `#` for class-level)
- [ ] File structure follows template (Private section, then Public API)
- [ ] No allocations in hot paths
- [ ] Passes `npm run check`
- [ ] README.md updated if adding features

### Don't Do This
- ❌ Don't introduce heavy frameworks or build tools
- ❌ Don't mix export patterns (always use default exports)
- ❌ Don't allocate objects in render or update loops
- ❌ Don't bypass the entity system for rendering
- ❌ Don't modify Microtastic config without good reason
- ❌ Don't skip linting checks
- ❌ Don't use `eval()` or similar unsafe code execution
- ❌ Don't create global variables (use modules)

### Progressive Web App (PWA)
- Targets Desktop, Android, and iOS
- `app/manifest.json` contains PWA configuration
- Service worker support for offline capability
- Responsive design for mobile touch controls

### Asset Structure
```
app/resources/
├── arenas/          # Arena definitions and meshes
├── meshes/          # 3D models (.mesh, .bmesh)
├── skybox/          # Skybox textures and materials
└── sounds/          # Audio files (.sfx)
```

### Debugging Tools
- **Console**: In-game debug console (toggle with `)
- **Stats**: Performance monitoring (FPS, frame time)
- **Wireframe**: Entity bounding box visualization
- **Browser DevTools**: Performance profiling, network monitoring

## When Suggesting Code

### Always Consider
1. Is this in a hot path? (render loop, update loop)
2. Does it follow the module organization pattern?
3. Are private items properly prefixed?
4. Does it use default exports?
5. Will it pass Biome linting?
6. Is it WebGL/performance best practice?

### Prefer
- Object pooling over repeated allocations
- Typed arrays for large datasets
- Direct property access over getters/setters in hot paths
- Batch operations over individual calls
- Early returns for performance checks

### Code Snippet Style
Always include proper imports and follow the project patterns:
```javascript
import Module from "./module.js";

// Private helper
const _helper = () => {
  // implementation
};

// Public API
const MyModule = {
  method() {
    _helper();
  }
};

export default MyModule;
```
