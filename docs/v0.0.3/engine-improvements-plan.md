# Engine Improvements Implementation Plan

**Goal:** Fix architectural bugs, eliminate GPU leaks and per-frame GC allocations, and optimize physics raycasts and audio resource usage identified during the September 2026 engine audit.

**Architecture:** Local fixes and optimizations within existing engine modules: `scene/`, `rendering/`, `physics/`, and `systems/`. No new external dependencies.

**Tech Stack:** ES6 modules, gl-matrix, WebGL 2 / WebGPU, Biome (lint/format).

---

## Global Constraints

- No `var`. Use `const` (preferred) or `let`.
- No default exports. Named exports only.
- Engine facade rule: `app/src/game/` imports only from `../engine/engine.js`. Engine-internal modules import each other directly and **never** from `engine.js`.
- Zero per-frame allocations in hot paths. All scratch objects pre-allocated at module scope.
- Log via `Console.log/warn/error`, not `console.*`.
- Run `npm run check` and `npm run format` before every commit.
- Update `CHANGELOG.md` & `README.md` before PR.

---

## Group A: Architecture & Correctness Bugs

- [ ] **A1: Fix Network module facade violation & circular import**

  `app/src/engine/systems/network.js:2` imports `Console` from `../engine.js`:
  ```javascript
  import { Console } from "../engine.js";
  ```
  This violates the core architecture rule ("Engine-internal modules import each other directly and never from `engine.js`") and introduces a circular module dependency between `engine.js` (which imports `network.js`) and `network.js`.

  **Fix:** Import directly from `console.js`:
  ```javascript
  import { Console } from "./console.js";
  ```

- [ ] **A2: SkinnedMesh per-instance bone matrix buffer**

  `app/src/engine/rendering/skinnedmesh.js:102-104` caches `_boneMatrixBuffer` on the `SkinnedMesh` instance:
  ```javascript
  if (!this._boneMatrixBuffer) {
      this._boneMatrixBuffer = new Float32Array(MAX_JOINTS * 16);
  }
  ```
  `SkinnedMesh` instances are shared assets stored in `Resources`. When multiple entities (e.g., remote players, bots) share the same model, each entity's `update()` calls `this.mesh.getBoneMatricesForGPU(pose)`, overwriting the exact same `_boneMatrixBuffer`. At render time, all entities draw with whichever entity's pose was evaluated last.

  **Fix:** Move ownership of the Float32Array buffer to `SkinnedMeshEntity` (e.g. `this._boneMatrixBuffer = new Float32Array(64 * 16)` in constructor) and update `getBoneMatricesForGPU` to write into an entity-provided target buffer, or allocate per `SkinnedMeshEntity`.

- [ ] **A3: ParticleEmitterEntity GPU buffer disposal**

  `app/src/engine/scene/particleemitterentity.js` creates GPU resources on demand in `render()`:
  - `this._instanceBuffer = Backend.createBuffer(this._instanceData, "vertex");`
  - `this._vertexState = Backend.createVertexState({...});`

  However, `ParticleEmitterEntity` does not define a `dispose()` method. When particles finish and the entity is removed (`update()` returns `false`), `scene.js` calls `entity.dispose?.()`, which defaults to `Entity.prototype.dispose()` and leaves `_instanceBuffer` and `_vertexState` allocated in WebGL/WebGPU backend memory.

  **Fix:** Implement `dispose()` in `ParticleEmitterEntity`:
  ```javascript
  dispose() {
      super.dispose();
      if (this._instanceBuffer) {
          Backend.deleteBuffer(this._instanceBuffer);
          this._instanceBuffer = null;
      }
      if (this._vertexState) {
          Backend.deleteVertexState(this._vertexState);
          this._vertexState = null;
      }
      this._particles.length = 0;
  }
  ```

- [ ] **A4: AnimatedBillboardEntity updateBoundingVolume & frustum culling**

  `app/src/engine/scene/animatedbillboardentity.js:52-55`:
  ```javascript
  update(frameTime) {
      this._time += frameTime;
      return this._time < this._duration;
  }
  ```
  The subclass overrides `update()` without calling `super.update(frameTime)` or `this.updateBoundingVolume()`. Because `this.boundingBox` remains `null`, `updateBoundingVolume()` is dead code, and `Scene._updateVisibility()` can never frustum-cull billboards (`if (entity.boundingBox && !entity.boundingBox.isVisible()) continue;` always falls through).

  **Fix:** Invoke `this.updateBoundingVolume()` within `AnimatedBillboardEntity.prototype.update(frameTime)` so bounding boxes update dynamically with entity scale/position.

- [ ] **A5: Web Audio autoplay resumption & single-decode caching**

  `app/src/engine/systems/sound.js`:
  1. `const _audioContext = new (window.AudioContext || window.webkitAudioContext)();` is invoked immediately on module evaluation. Modern desktop and mobile browsers initialize this in `"suspended"` state until user interaction. Without resuming, all audio can remain muted.
  2. In `Sound.constructor`:
     ```javascript
     if (cached) {
         for (let i = 0; i < cacheSize; i++) {
             _load(file, speed, volume, loop).then((sound) => {
                 this._cache[`${file}_${i}`] = sound;
             });
         }
     }
     ```
     Setting `cached: true` (default `cacheSize = 5`) triggers 5 separate HTTP `fetch` calls and 5 separate `decodeAudioData` calls for the exact same file. An `AudioBuffer` is immutable and can be safely shared across multiple `AudioBufferSourceNode`s.

  **Fix:**
  - Add `_resumeAudio()` on first user gesture in `Input` (or on first `Sound.play()`).
  - Cache decoded `AudioBuffer` by URL in a module-level `Map<string, AudioBuffer>`; load and decode once per sound asset.

---

## Group B: Hot-Path Performance & Zero Allocations

- [ ] **B1: Zero per-frame allocations in AnimatedBillboardEntity**

  `app/src/engine/scene/animatedbillboardentity.js:121-124`:
  ```javascript
  shader.setVec2("uFrameOffset", [col * cellSize, row * cellSize]);
  shader.setVec2("uFrameScale", [cellSize, cellSize]);
  ```
  And in `updateBoundingVolume()`:
  ```javascript
  this.boundingBox.set(
      [_worldPos[0] - r, _worldPos[1] - r, _worldPos[2] - r],
      [_worldPos[0] + r, _worldPos[1] + r, _worldPos[2] + r],
  );
  ```
  Every billboard allocates four JavaScript Array objects per frame during render and bounding update.

  **Fix:**
  - Allocate module-level `_frameOffset = new Float32Array(2)` and `_frameScale = new Float32Array(2)`.
  - Add `BoundingBox.prototype.setMinMax(minX, minY, minZ, maxX, maxY, maxZ)` or use module-level scratch vectors to avoid array allocation in `updateBoundingVolume`.

- [ ] **B2: ParticleEmitterEntity SoA / particle pooling**

  `app/src/engine/scene/particleemitterentity.js:45-57`:
  ```javascript
  this._particles.push({
      x: position[0], y: position[1], z: position[2],
      vx: velocity[0], vy: velocity[1], vz: velocity[2],
      durationMs, lifeMs: durationMs, startScale, gravity, rotation,
  });
  ```
  Every emitted particle allocates an individual JS object, which is then popped and collected upon expiration.

  **Fix:** Replace object allocation with a pre-allocated Structure-of-Arrays (SoA) layout using flat typed arrays (e.g. `_x`, `_y`, `_z`, `_vx`, `_vy`, `_vz`, `_lifeMs`, etc.) or reuse an object pool for active particles.

- [ ] **B3: Eliminate duplicate inverse-direction calculation in Octree ray queries**

  In `app/src/engine/physics/ray.js:132-142`:
  ```javascript
  _itInvDir[0] = 1.0 / _itLocalDir[0];
  _itInvDir[1] = 1.0 / _itLocalDir[1];
  _itInvDir[2] = 1.0 / _itLocalDir[2];

  if (!_intersectRayAABB(mesh.aabb, _itLocalFrom, _itInvDir, maxDist)) return;

  mesh.tree.rayQueryLocal(_itLocalFrom, _itLocalDir, maxDist, _itTriangles);
  ```
  And then in `app/src/engine/physics/octree.js:172-178`:
  ```javascript
  rayQueryLocal(origin, direction, maxDist, result) {
      const invDirX = 1.0 / direction[0];
      const invDirY = 1.0 / direction[1];
      const invDirZ = 1.0 / direction[2];
  ```
  The floating-point inversions `1.0 / dir[x,y,z]` are computed twice for every trimesh intersection query.

  **Fix:** Pass `_itInvDir` directly into `rayQueryLocal(origin, direction, invDir, maxDist, result)`.

- [ ] **B4: FPSController depenetration early-out**

  `app/src/engine/physics/fpscontroller.js:419-447`:
  `_resolveDepenetration` casts 24 static rays (3 height offsets × 8 directions) every frame, even when the player is airborne or resting on a flat floor with zero horizontal movement. If `_tryStepClimb` triggers, it runs another 24 rays.

  **Fix:**
  - Skip `_resolveDepenetration` when horizontal displacement and velocity are negligible.
  - Test center height (0) first: if no collision is found in any of the 8 directions at center, skip the upper and lower check heights unless vertical velocity indicates head/shin clearance risks.

---

## Group C: Existing Roadmap Tracking

- [ ] **C1: G-Buffer Depth Reconstruction**
  - Tracked in [`docs/v0.0.3/gbuffer-depth-reconstruction-plan.md`](gbuffer-depth-reconstruction-plan.md).
  - Eliminates 16-byte `_g.worldPosition` RGBA16F render target; reconstructs world position from depth buffer in lighting pass to minimize mobile GPU memory bandwidth.

---

## Verification Plan

### Automated Verification
- Run Biome check and formatter:
  ```bash
  npm run check
  npm run format
  ```

### Manual & Behavioral Verification
1. **Multiplayer/Skinned Mesh Test**:
   - Spawn multiple remote player meshes with distinct animations; confirm no pose bleeding or jumping between entities.
2. **GPU Memory & Particle Stress**:
   - Fire continuous rocket/plasma bursts; verify via Chrome DevTools Memory / Performance that GPU buffer allocations and JavaScript heap remain flat.
3. **Billboard Culling & Allocation Check**:
   - Enable bounding volume debug mode (`tbv` in console); verify billboards show bounding boxes and are culled when looking away.
   - Profile with allocation instrumentation to verify zero allocations in `AnimatedBillboardEntity.render()`.
4. **Audio Playback**:
   - Launch in fresh browser session; verify audio starts cleanly on first user interaction without browser warnings or repeated 5x network requests.
5. **Physics Regression**:
   - Test walking into corners, jumping against slopes, and step-climbing to ensure depenetration early-outs introduce no clipping or snagging.
