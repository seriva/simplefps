## About
Simple first person arena shooter game written in ES6 and WebGL with a PWA distribution target for Desktop, Android and iOS.

**Project Evolution** (2017-2025): Started as a basic WebGL experiment, evolved through 500+ commits to include physics simulation (Cannon.js), weapon systems, mobile touch controls, PWA capabilities, and modern development tooling with devcontainer support.

**Technology Journey**: Originally used Cordova + NW.js for desktop/mobile packaging, Webpack → Brunch → Rollup for bundling, and Yarn → pnpm → npm for package management. Migrated to modern PWA approach with Microtastic build system and devcontainer for streamlined development.

## Features

- **🎮 Gameplay**: Arena-based FPS with physics-based projectiles, multiple weapons (Grenade Launcher, Minigun), and cross-platform controls
- **⚡ Performance**: Custom WebGL engine with optimized rendering, physics simulation (Cannon.js), and PWA support
- **🏗️ Architecture**: Modular ES6 design with entity system, scene management, and comprehensive input handling
- **📱 Cross-Platform**: Runs on Desktop, Android, and iOS with touch controls and responsive design

## Project Structure

```
app/
├── src/
│   ├── engine/           # Core engine modules
│   │   ├── camera.js     # Camera system
│   │   ├── renderer.js   # WebGL renderer
│   │   ├── physics.js    # Physics integration
│   │   ├── input.js      # Input handling
│   │   └── ...
│   ├── game/             # Game-specific modules
│   │   ├── weapons.js    # Weapon system
│   │   ├── controls.js   # Game controls
│   │   ├── arena.js      # Arena management
│   │   └── ...
│   └── main.js           # Application entry point
├── resources/            # Game assets
└── index.html           # Main HTML file
```

## Tech Stack

**Core**: ES6 Modules, WebGL, Cannon.js (physics), gl-matrix (3D math)  
**UI**: JSS (CSS-in-JS), Maquette (Virtual DOM)  
**Build**: Microtastic (dev server, production builds, hot-reload)  
**Tools**: Biome (linting), Devcontainer (development environment)

## Quick Start

### 🐳 Devcontainer (Recommended)
Open in VS Code with Dev Containers extension - all dependencies are pre-configured.

### 📦 Manual Setup
```bash
npm install  # Node.js >= 18.0.0, npm >= 8.0.0
```

### 🚀 Commands
```bash
npm run dev    # Development server
npm run prod   # Production build  
npm run lint   # Code linting
```
