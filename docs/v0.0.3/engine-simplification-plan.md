# Engine Simplification Plan

**Goal:** Remove dead code, cut over-engineered subsystems, and decouple tightly coupled modules — no feature changes, no behaviour regressions.

**Tech Stack:** ES6 modules, WebGL 2 / WebGPU, Biome (lint/format).

## Global Constraints

- No `var`. Use `const` (preferred) or `let`.
- No default exports. Named exports only.
- No per-frame allocations in hot paths.
- Log via `Console.log/warn/error`, not `console.*`.
- Run `npm run check` and `npm run format` before every commit.
- No new external dependencies.

---

## Task 1: Drop Trilinear Interpolation → Nearest-Cell in LightGrid

### What & Why

`LightGrid._getAmbient()` samples 8 neighbours and trilinearly interpolates. For baked arena lighting viewed at 60 fps, nearest-cell is visually identical. The trilinear path is ~50 lines of per-frame math (8 array reads × 3 channels, 12 lerps) executed for every visible entity every frame. Replace with a direct single-cell read: compute `(ix, iy, iz)` from world position, clamp, read 3 bytes, normalise.

### Files

- Modify: `app/src/engine/scene/lightgrid.js` — replace `_getAmbient` body

---

- [ ] **Step 1: Replace `_getAmbient` body**

  The current coordinate mapping (note the axis remap — `fy = -relZ / _step[1]`, `fz = relY / _step[2]`) must be preserved exactly:

  ```javascript
  const _getAmbient = (position, outColor = null) => {
      if (!outColor) outColor = _outColorFallback;

      if (!_data) {
          vec3.set(outColor, 1, 1, 1);
          return outColor;
      }

      const fx = (position[0] - _origin[0]) / _step[0];
      const fy = -(position[2] - _origin[2]) / _step[1];   // note: -Z maps to grid Y
      const fz = (position[1] - _origin[1]) / _step[2];    // note: world Y maps to grid Z

      const ix = Math.min(Math.max(Math.floor(fx), 0), _counts[0] - 1);
      const iy = Math.min(Math.max(Math.floor(fy), 0), _counts[1] - 1);
      const iz = Math.min(Math.max(Math.floor(fz), 0), _counts[2] - 1);

      const b = (iz * _strideZ + iy * _strideY + ix) * 3;
      outColor[0] = _data[b]     * 0.00392156862745098;
      outColor[1] = _data[b + 1] * 0.00392156862745098;
      outColor[2] = _data[b + 2] * 0.00392156862745098;

      return outColor;
  };
  ```

  Delete all 8 `_cXXX` pre-allocated scratch arrays at module scope (`_c000` through `_c111`). Delete `_outColorFallback` only if `vec3` import becomes unused — check first.

- [ ] **Step 2: Smoke test**

  `npm run dev`. Walk arena. Confirm ambient shading on entities looks correct — no full-bright or pitch-black artifacts. Subtle smoothness loss between probe cells is acceptable.

- [ ] **Step 3: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/scene/lightgrid.js
  git commit -m "perf(scene): replace trilinear probe interpolation with nearest-cell lookup

  8-sample trilinear lerp replaced with single cell read (3 array accesses).
  Visually indistinguishable in baked arena lighting at 60 fps. Removes ~50
  lines of per-frame math and 8 pre-allocated scratch arrays."
  ```

---

## Task 2: Remove Dead `_probeColor` Variable in renderpasses.js

### What & Why

`_probeColor` is declared at module scope (line 18) as `new Float32Array(3)` but is never read or written after declaration. Dead code.

### Files

- Modify: `app/src/engine/rendering/renderpasses.js` — delete the declaration

---

- [ ] **Step 1: Delete the declaration**

  Remove:
  ```javascript
  const _probeColor = new Float32Array(3);
  ```

- [ ] **Step 2: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/rendering/renderpasses.js
  git commit -m "chore(rendering): remove unused _probeColor scratch variable"
  ```

---

## Task 3: Gate Render Stats Behind Debug Flag

### What & Why

`_renderStats.meshCount`, `.lightCount`, `.triangleCount` are incremented every frame in `renderWorldGeometry` and `renderLighting`, then forwarded to `Stats.setRenderStats()`. In production (or when the stats overlay is hidden) this is wasted accounting. Gate the increments behind `_debugState` so the hot path skips them when not needed.

### Files

- Modify: `app/src/engine/rendering/renderpasses.js` — wrap stat increments in debug guard

---

- [ ] **Step 1: Check what `Stats.setRenderStats()` does when stats are hidden**

  Read `app/src/engine/systems/stats.js`. If `Stats` already no-ops when the overlay is off, this task is lower priority — note that and skip. If it stores values regardless, proceed.

- [ ] **Step 2: Wrap stat increments**

  In `renderWorldGeometry`:
  ```javascript
  // Before:
  _renderStats.meshCount++;
  _renderStats.triangleCount += entity.mesh?.triangleCount || 0;

  // After:
  if (_debugState.showStats) {
      _renderStats.meshCount++;
      _renderStats.triangleCount += entity.mesh?.triangleCount || 0;
  }
  ```

  Add `showStats: false` to `_debugState` and a `toggleStats` command:
  ```javascript
  Console.registerCmd("tst", _makeDebugToggle("showStats"));
  ```

  Move the `Stats.setRenderStats()` call inside the same guard.

- [ ] **Step 3: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/rendering/renderpasses.js
  git commit -m "perf(rendering): gate render stat accounting behind debug flag

  Mesh/triangle/light counters were incremented every frame unconditionally.
  Now only run when stats overlay is active (tst console command). Hot path
  skips the accounting when stats are off."
  ```

---

## Task 4: Invert Resource Type Registration

### What & Why

`resources.js` currently imports `Mesh`, `SkinnedMesh`, `Animation`, `Texture`, `Material`, and `Sound` at the top — 6 engine subsystems coupled into one file. Adding a new asset type requires editing `resources.js`. Invert: `resources.js` exposes `Resources.registerType(ext, handler)`. Each subsystem registers its own handler at engine init. `resources.js` becomes zero-knowledge of asset types.

### Files

- Modify: `app/src/engine/systems/resources.js` — replace `_RESOURCE_TYPES` constant with `registerType()`, remove all subsystem imports
- Modify: `app/src/engine/engine.js` (or wherever engine init lives) — call `registerType` for each asset type after subsystem imports

---

- [ ] **Step 1: Read engine.js init sequence**

  Find where `Resources` is initialised. Confirm there is a single init point where all subsystems are already imported (so handlers can be registered there without creating new import cycles).

- [ ] **Step 2: Replace `_RESOURCE_TYPES` with a runtime registry**

  In `resources.js`, replace:
  ```javascript
  const _RESOURCE_TYPES = { ... }
  ```
  with:
  ```javascript
  const _resourceTypes = new Map();

  // Called once at engine init per asset type
  const _registerType = (ext, handler) => {
      _resourceTypes.set(ext, handler);
  };
  ```

  In `Resources.fetch()` dispatch, replace `_RESOURCE_TYPES[ext]` with `_resourceTypes.get(ext)`.

  Remove all subsystem imports from `resources.js`.

  Add `registerType: _registerType` to the `Resources` export.

- [ ] **Step 3: Register handlers at engine init**

  In `engine.js` (after all subsystem imports), add:
  ```javascript
  Resources.registerType('webp',  (data, ctx, opts) => new Texture({ data, ...opts }));
  Resources.registerType('mesh',  (data, ctx) => { const m = new Mesh(JSON.parse(data), ctx); return m.ready.then(() => m); });
  Resources.registerType('smesh', (data, ctx) => { const m = new SkinnedMesh(JSON.parse(data), ctx); return m.ready.then(() => m); });
  Resources.registerType('bmesh', (data, ctx) => { const m = new Mesh(data, ctx); return m.ready.then(() => m); });
  Resources.registerType('sbmesh',(data, ctx) => { const m = new SkinnedMesh(data, ctx); return m.ready.then(() => m); });
  Resources.registerType('anim',  (data) => { const a = new Animation(JSON.parse(data)); return a.ready.then(() => a); });
  Resources.registerType('banim', (data) => { const a = new Animation(data); return a.ready.then(() => a); });
  Resources.registerType('mat',   (data, ctx) => Material.loadLibrary(JSON.parse(data), ctx));
  Resources.registerType('sfx',   (data) => new Sound(JSON.parse(data)));
  Resources.registerType('list',  /* existing list handler, extracted from _RESOURCE_TYPES */);
  Resources.registerType('bin',   (data) => data);
  ```

- [ ] **Step 4: Smoke test**

  `npm run dev`. Load map. Confirm all asset types load (meshes, textures, animations, materials, sounds). No missing resources.

- [ ] **Step 5: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/systems/resources.js app/src/engine/engine.js
  git commit -m "refactor(resources): invert asset type registration to remove subsystem coupling

  resources.js previously imported Mesh, SkinnedMesh, Animation, Texture,
  Material, and Sound directly. Now exposes Resources.registerType(ext, fn)
  so each subsystem registers its own handler at engine init. resources.js
  has zero knowledge of asset types."
  ```

---

## Self-Review

| Finding | Task | Risk |
|---------|------|------|
| Trilinear probe interpolation — per-frame, ~50 lines | Task 1 | Low — axis remap must be preserved exactly |
| `_probeColor` dead variable | Task 2 | None |
| Render stat accounting always-on | Task 3 | Low — gated, not removed |
| `resources.js` coupled to 6 subsystems | Task 4 | Medium — init order matters; handler registration must happen before first `Resources.load()` |
