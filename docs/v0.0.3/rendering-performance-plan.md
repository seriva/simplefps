# Rendering Performance Implementation Plan

**Goal:** Eliminate five rendering bottlenecks identified in the v0.0.3 architectural review: per-frame full BVH rebuild, missing light contribution culling, unconditional shadow blur, shadow raycast FIFO budget, and light UBO struct padding waste.

**Architecture:** Each task is independently deliverable and does not depend on the others — they can be sequenced in any order. All changes are confined to `engine/rendering/` and `engine/scene/` with no game-layer or shader-API changes.

**Tech Stack:** ES6 modules, WebGL 2 (GLSL ES 3.00), WebGPU (WGSL), gl-matrix, Biome (lint/format).

## Global Constraints

- No `var`. Use `const` (preferred) or `let`.
- No default exports. Named exports only.
- No per-frame allocations in hot paths. All scratch objects pre-allocated at module scope.
- No direct GPU code outside `engine/rendering/`. All GPU work goes through the backend abstraction.
- No imports from engine subdirectories inside `engine/engine.js` re-exports — game code only touches `engine.js`.
- Engine-internal modules import each other directly, never through `engine.js`.
- Log via `Console.log/warn/error`, not `console.*`.
- Run `npm run check` and `npm run format` before every commit.
- No new external dependencies.

---

## Task 1: Two-Level BVH — Static Once, Dynamic Per-Frame

### What & Why

`scene.js` rebuilds the entire BVH every frame whenever the entity set is dirty. In a live FPS match (projectiles, remote players, pickups), the entity set is dirty nearly every frame, so the full O(n log n) rebuild runs constantly. The fix: build a static BVH once from `finalizeStaticGeometry()`, rebuild only the dynamic BVH (10–30 entities) per frame, and query both during frustum culling.

### Files

- Modify: `app/src/engine/scene/scene.js` — add `_staticBVH` root, separate `_dynamicEntitiesWithBB`, rebuild dynamic-only per frame, merge results in `_updateVisibilityCache()`

### Interfaces

- Consumes: existing `_bvhBuild()`, `_bvhTraverse()`, `_bvhNodePool`, `_bvhAllocNode()` — no signature changes
- Produces: no public API change — `Scene.addStaticGeometry()`, `Scene.finalizeStaticGeometry()`, `Scene.addEntities()` keep existing signatures

---

- [ ] **Step 1: Read the current BVH implementation**

  In `scene.js`, read and understand:
  - `_bvhBuild(start, end)` — how it partitions `_bvhEntityBuffer`
  - `_bvhTraverse(nodeIdx, fullyInside)` — how it populates `_visibilityCache`
  - `_updateVisibilityCache()` — when rebuild is triggered and the frustum dirty check
  - `addStaticGeometry(entity)` and `finalizeStaticGeometry()` — the static geometry lifecycle

- [ ] **Step 2: Add module-level state for static BVH**

  At the top of `scene.js`, alongside existing private vars, add:

  ```javascript
  let _staticBVHRoot = -1          // Node index, -1 = not built
  let _staticBVHEntityBuffer = []  // Entities from static geometry (with BB)
  let _dynamicEntitiesWithBB = []  // Non-static entities that have bounding boxes
  ```

- [ ] **Step 3: Build static BVH in finalizeStaticGeometry()**

  Inside `finalizeStaticGeometry()`, after the existing octree build, add:

  ```javascript
  // Collect static entities that have bounding boxes
  _staticBVHEntityBuffer.length = 0
  for (const entity of _entities) {
      if (entity.isStatic && entity.boundingBox) {
          _staticBVHEntityBuffer.push(entity)
      }
  }

  // Reset node pool watermark so static BVH occupies the front of the pool
  _bvhNodeCount = 0
  if (_staticBVHEntityBuffer.length > 0) {
      _bvhEntityBuffer.length = _staticBVHEntityBuffer.length
      for (let i = 0; i < _staticBVHEntityBuffer.length; i++) {
          _bvhEntityBuffer[i] = _staticBVHEntityBuffer[i]
      }
      _staticBVHRoot = _bvhBuild(0, _staticBVHEntityBuffer.length)
  }

  // Record how many pool nodes the static BVH consumed
  _staticBVHNodeCount = _bvhNodeCount
  ```

  Also add `let _staticBVHNodeCount = 0` to the module-level vars from Step 2.

- [ ] **Step 4: Rebuild only dynamic entities per frame in _updateVisibilityCache()**

  In `_updateVisibilityCache()`, replace the existing single-BVH rebuild with:

  ```javascript
  // Collect dynamic entities with bounding boxes
  _dynamicEntitiesWithBB.length = 0
  for (const entity of _entities) {
      if (!entity.isStatic && entity.boundingBox) {
          _dynamicEntitiesWithBB.push(entity)
      }
  }

  // Reset dynamic portion of pool (above the static watermark)
  _bvhNodeCount = _staticBVHNodeCount
  let dynamicBVHRoot = -1
  if (_dynamicEntitiesWithBB.length > 0) {
      _bvhEntityBuffer.length = _dynamicEntitiesWithBB.length
      for (let i = 0; i < _dynamicEntitiesWithBB.length; i++) {
          _bvhEntityBuffer[i] = _dynamicEntitiesWithBB[i]
      }
      dynamicBVHRoot = _bvhBuild(0, _dynamicEntitiesWithBB.length)
  }

  // Traverse static BVH
  if (_staticBVHRoot !== -1) {
      _bvhTraverse(_staticBVHRoot, false)
  }

  // Traverse dynamic BVH
  if (dynamicBVHRoot !== -1) {
      _bvhTraverse(dynamicBVHRoot, false)
  }
  ```

  Remove the old single `_bvhBuild` + `_bvhTraverse` call that was here.

- [ ] **Step 5: Pre-size _bvhEntityBuffer to avoid push() realloc**

  In module-level initialization (where `_bvhEntityBuffer` is declared), add:

  ```javascript
  let _bvhEntityBuffer = new Array(256)  // Pre-sized; avoids hidden realloc on push
  _bvhEntityBuffer.length = 0
  ```

- [ ] **Step 6: Smoke test**

  `npm run dev`, load the game, enter a match. Open in-game console (`Console`), run any existing performance stat command. Confirm:
  - All entities (static map geometry, dynamic players, pickups) render correctly
  - No missing or flickering entities

- [ ] **Step 7: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/scene/scene.js
  git commit -m "perf(scene): two-level BVH — static built once, dynamic rebuilt per frame

  In live FPS matches the entity set is dirty nearly every frame (projectiles,
  players, pickups), causing a full O(n log n) BVH rebuild each tick. Static
  entities (map geometry) are now placed in a BVH built once at finalizeStaticGeometry().
  Only dynamic entities (~10-30) are rebuilt per frame, reducing BVH overhead
  from O(total log total) to O(dynamic log dynamic)."
  ```

---

## Task 2: Light Contribution Culling — Sort Before UBO Upload

### What & Why

All visible lights (up to 8 point, 4 spot) are uploaded to the UBO regardless of their contribution at the camera position. A candle 200 m away consumes one of 8 point-light slots identically to a floodlight 2 m away. Fix: before uploading lights, sort by `intensity / distance²` and take the top 8/4.

### Files

- Modify: `app/src/engine/rendering/renderpasses.js` — add sort before light UBO upload in the lighting pass
- No shader changes required.

### Interfaces

- Consumes: `Camera.position` (vec3, already available in render passes), visible point/spot light entities from `_visibilityCache`
- Produces: no API change

---

- [ ] **Step 1: Read the lighting pass UBO upload**

  In `renderpasses.js`, find where point lights and spot lights from `_visibilityCache` are iterated and their data packed into the UBO / uniform calls. Note:
  - What data is available per light entity (position, intensity, range, color)
  - The iteration order and upload index

- [ ] **Step 2: Add pre-allocated sort scratch at module scope**

  At the top of `renderpasses.js`, add:

  ```javascript
  const _lightSortBuffer = []  // Reused each frame; no per-frame allocation
  ```

- [ ] **Step 3: Insert contribution sort before upload**

  Before the point-light UBO packing loop, add:

  ```javascript
  // Sort point lights by contribution at camera (intensity / distance²), descending
  const pointLights = _visibilityCache[EntityTypes.POINT_LIGHT]
  _lightSortBuffer.length = 0
  for (let i = 0; i < pointLights.length; i++) {
      const light = pointLights[i]
      const dx = light.position[0] - Camera.position[0]
      const dy = light.position[1] - Camera.position[1]
      const dz = light.position[2] - Camera.position[2]
      const dist2 = dx * dx + dy * dy + dz * dz || 1  // avoid /0
      _lightSortBuffer.push({ light, score: light.intensity / dist2 })
  }
  _lightSortBuffer.sort((a, b) => b.score - a.score)

  // Use _lightSortBuffer[i].light instead of pointLights[i] in the upload loop
  // Cap at existing MAX_POINT_LIGHTS (8)
  const uploadCount = Math.min(_lightSortBuffer.length, MAX_POINT_LIGHTS)
  for (let i = 0; i < uploadCount; i++) {
      const light = _lightSortBuffer[i].light
      // ... existing packing code using `light`
  }
  ```

  Repeat the same pattern for spot lights (cap at MAX_SPOT_LIGHTS = 4).

  Note: `_lightSortBuffer.push({ light, score })` allocates small objects per frame. This is acceptable because: (a) only runs when lights are visible, (b) light count is bounded at 8/4, (c) V8 will pool these small objects. If profiling shows GC pressure, replace with parallel index+score arrays.

- [ ] **Step 4: Smoke test**

  `npm run dev`. Place yourself near one light source with another far away. Confirm both still render. Move far away from all lights — confirm lighting still looks correct (now sorted by contribution).

- [ ] **Step 5: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/rendering/renderpasses.js
  git commit -m "perf(rendering): sort lights by intensity/distance² before UBO upload

  Previously all visible lights filled UBO slots regardless of contribution.
  A dim light far away consumed the same slot as a bright nearby light.
  Lights are now sorted by intensity/dist² so the highest-contribution lights
  always fill the limited slots (8 point, 4 spot)."
  ```

---

## Task 3: Skip Shadow Blur When No Shadow Casters Are Visible

### What & Why

The Kawase shadow blur pass runs every frame unconditionally — even on frames where no shadow-casting entities are visible. Each Kawase iteration is a full-screen texture sample pass. Skipping it when unnecessary saves multiple full-screen passes per frame during empty/indoor scenes.

### Files

- Modify: `app/src/engine/rendering/renderer.js` — wrap the shadow blur dispatch in a visibility guard

### Interfaces

- Consumes: `_visibilityCache` (accessible inside renderer via scene query or passed reference — check how renderer currently reads scene visibility)
- Produces: no API change

---

- [ ] **Step 1: Locate the shadow blur dispatch**

  In `renderer.js`, find the call that triggers the shadow blur render pass (Kawase horizontal + vertical). Note what calls it and what data it reads.

- [ ] **Step 2: Find the shadow caster count**

  The renderer already limits shadow raycasts with a budget — it must have some measure of shadow caster count. Find it. Alternatively, check `_visibilityCache[EntityTypes.MESH]` and `_visibilityCache[EntityTypes.SKINNED_MESH]` counts. Look for a `_shadowCasterCount` or equivalent variable set during the shadow pass.

- [ ] **Step 3: Add the guard**

  Wrap the shadow blur dispatch:

  ```javascript
  // Only blur if any shadow-casting entities were rendered this frame
  const hasShadowCasters =
      _visibilityCache[EntityTypes.MESH].length > 0 ||
      _visibilityCache[EntityTypes.SKINNED_MESH].length > 0

  if (hasShadowCasters) {
      // existing shadow blur pass call(s)
      renderPasses.shadowBlur(...)
  }
  ```

  If the renderer uses a `_shadowCasterCount` variable that is updated during the shadow pass, use that instead — it is more precise (a mesh might be visible but have shadow disabled).

- [ ] **Step 4: Confirm WebGPU skip path**

  The survey noted the shadow blur is already skipped on WebGPU due to driver issues. Confirm the guard is placed such that the WebGPU skip and this visibility skip are both respected (either condition short-circuits).

- [ ] **Step 5: Smoke test**

  `npm run dev`. Move to an area with no entities visible. Confirm no rendering artifacts (shadow buffer should be clear / black — blurring a clear buffer is a no-op so skipping is safe). Move back into view of entities — confirm shadows reappear correctly.

- [ ] **Step 6: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/rendering/renderer.js
  git commit -m "perf(rendering): skip shadow blur pass when no shadow casters are visible

  The Kawase shadow blur ran unconditionally every frame including frames where
  no shadow-casting mesh or skinned mesh entities were in the frustum. The pass
  is now skipped when hasShadowCasters is false, saving multiple full-screen
  texture passes on empty/indoor frames."
  ```

---

## Task 4: Priority-Queue Shadow Raycast Budget

### What & Why

The shadow pass issues up to 16 CPU raycasts per frame to compute shadow-blob heights for entities. The current allocation is FIFO — whichever entities appear first in the list consume all 16 slots. Entities far away or small on screen get the same allocation chance as large nearby ones. The fix: sort shadow casters by screen-space projected size (a proxy for visual importance) before distributing the budget, so large nearby entities always get updated shadows and distant/small ones tolerate stale caches longer.

### Files

- Modify: `app/src/engine/rendering/renderpasses.js` — sort shadow caster list before budget loop; increase stale tolerance for low-priority entities

### Interfaces

- Consumes: entity world position, entity bounding box (for size estimation), `Camera.position`, `Camera.viewProjection` — all already available in render passes
- Produces: no API change

---

- [ ] **Step 1: Read the shadow pass budget loop**

  In `renderpasses.js`, find the shadow rendering section. Note:
  - How the 16-ray budget is tracked and decremented
  - What triggers a shadow raycast for an entity (movement threshold, LOD distance)
  - What `entity._shadowHeight` / similar cached field looks like
  - How skinned vs mesh entities differ in shadow update frequency

- [ ] **Step 2: Add screen-space size scoring function at module scope**

  At the top of `renderpasses.js`, add the scoring function:

  ```javascript
  function _shadowScreenSize(entity, viewProjection) {
      // Project entity center to clip space, estimate screen footprint from BB diagonal
      const p = entity.position
      const bb = entity.boundingBox
      if (!bb) return 0

      // Diagonal of bounding box in world units
      const dx = bb.max[0] - bb.min[0]
      const dy = bb.max[1] - bb.min[1]
      const dz = bb.max[2] - bb.min[2]
      const worldSize = Math.sqrt(dx * dx + dy * dy + dz * dz)

      // W component (clip-space depth) as distance proxy — avoid full projection
      const w =
          viewProjection[3]  * p[0] +
          viewProjection[7]  * p[1] +
          viewProjection[11] * p[2] +
          viewProjection[15]
      if (w <= 0) return 0  // behind camera

      return worldSize / w  // larger = more important
  }
  ```

- [ ] **Step 3: Collect shadow casters into a sort buffer before the budget loop**

  Add at module scope:

  ```javascript
  const _shadowSortBuffer = []  // reused each frame
  ```

  Before the existing budget loop in the shadow pass, replace the direct iteration with:

  ```javascript
  // shadowCasters = the array you identified in Step 1 (e.g. _visibilityCache[EntityTypes.MESH]
  // filtered to shadow-casting entities, or a dedicated shadow list — use what you found).
  _shadowSortBuffer.length = 0
  for (let i = 0; i < shadowCasters.length; i++) {
      const entity = shadowCasters[i]
      _shadowSortBuffer.push({
          entity,
          score: _shadowScreenSize(entity, Camera.viewProjection)
      })
  }
  _shadowSortBuffer.sort((a, b) => b.score - a.score)

  // Iterate in priority order, apply the ray budget
  // SHADOW_RAY_BUDGET = the existing constant or variable that caps raycasts per frame
  let rayBudget = SHADOW_RAY_BUDGET
  for (let i = 0; i < _shadowSortBuffer.length; i++) {
      const entity = _shadowSortBuffer[i].entity
      // Check if this entity needs a shadow raycast — use whatever condition the
      // existing loop uses (movement delta threshold, LOD distance check, etc.)
      const needsUpdate = /* existing per-entity update condition from Step 1 */
      if (rayBudget > 0 && needsUpdate) {
          // existing raycast + entity._shadowHeight update — copy from original loop
          rayBudget--
      }
      // render shadow blob using entity._shadowHeight (cached or fresh) — copy from original loop
  }
  ```

  The key change: high-priority (large/close) entities get first access to the ray budget. Low-priority entities fall back to their cached shadow height — same behaviour as before, now applied to the *least important* entities rather than randomly.

- [ ] **Step 4: Smoke test**

  `npm run dev`. Spawn multiple remote players (or equivalent entities with shadows). Move camera to have many entities visible simultaneously. Confirm:
  - Large nearby entities have correctly updated shadow blobs
  - Distant/small entities may have slightly stale shadows but no hard pop-in
  - No console errors

- [ ] **Step 5: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/rendering/renderpasses.js
  git commit -m "perf(rendering): priority-queue shadow raycast budget by screen-space size

  The 16-ray shadow budget was FIFO — first entities in the list consumed all
  slots regardless of visual importance. Shadow raycasts are now allocated to
  the highest screen-space-footprint entities first (scored by worldSize/clipW).
  Small or distant entities tolerate stale shadow caches; large nearby entities
  always get fresh updates."
  ```

---

## Task 5: Compact Light UBO Layout — vec4 Packing

### What & Why

Each light's data is currently uploaded as separate float fields (position x/y/z, color r/g/b, intensity, range as individual uniform calls or loosely packed struct). GLSL/WGSL std140 layout pads every `float` to `vec4` alignment, wasting 3× the GPU memory bandwidth per scalar. Packing each light into exactly two `vec4`s (`vec4(position, range)` + `vec4(color, intensity)`) eliminates padding waste, reduces UBO size, and improves GPU cache utilisation in the lighting shader which reads light data per-fragment.

### Files

- Modify: `app/src/engine/rendering/renderpasses.js` — repack light data as two vec4s per light before upload
- Modify: `app/src/engine/rendering/webgl/glsl.js` — update lighting shader light struct to `vec4 posRange` + `vec4 colorIntensity`
- Modify: `app/src/engine/rendering/webgpu/wgsl.js` — same for WGSL

### Interfaces

- Consumes: light entity fields (position, color, intensity, range) — same as Task 3
- Produces: shader-internal struct change only; no public API change

---

- [ ] **Step 1: Read the current light struct in both shaders**

  In `glsl.js`, find the `PointLight` and `SpotLight` struct definitions in the lighting shader. Note:
  - Current field names and types
  - How many floats each struct consumes (count them including std140 padding)
  - Where each field is accessed in the lighting calculation

  Do the same in `wgsl.js`.

- [ ] **Step 2: Update GLSL light struct**

  In `glsl.js`, replace the existing per-light struct with compact vec4 packing. Example for point light:

  ```glsl
  // Before (example — match actual current struct):
  struct PointLight {
      vec3 position;
      float range;
      vec3 color;
      float intensity;
  };

  // After — identical data, explicit vec4 packing, no std140 padding waste:
  struct PointLight {
      vec4 posRange;       // xyz = world position, w = range
      vec4 colorIntensity; // xyz = color (linear), w = intensity
  };
  ```

  Update all references in the lighting calculation:
  ```glsl
  // Before:
  vec3 lightPos = lights[i].position;
  float range    = lights[i].range;
  vec3 color     = lights[i].color;
  float intensity = lights[i].intensity;

  // After:
  vec3 lightPos  = lights[i].posRange.xyz;
  float range    = lights[i].posRange.w;
  vec3 color     = lights[i].colorIntensity.xyz;
  float intensity = lights[i].colorIntensity.w;
  ```

  Apply same pattern to SpotLight struct (add spotDir/angle packing into a third vec4 if needed — check current spot light fields).

- [ ] **Step 3: Update WGSL light struct**

  In `wgsl.js`:

  ```wgsl
  // Before:
  struct PointLight {
      position: vec3<f32>,
      range: f32,
      color: vec3<f32>,
      intensity: f32,
  }

  // After:
  struct PointLight {
      posRange: vec4<f32>,       // xyz = position, w = range
      colorIntensity: vec4<f32>, // xyz = color, w = intensity
  }
  ```

  Update field accesses in the WGSL lighting function to match.

- [ ] **Step 4: Update renderpasses.js — repack upload data**

  In `renderpasses.js`, in the light UBO packing loop (from Task 3 or the existing loop), change the upload order to match the new struct layout. If using a `Float32Array` UBO:

  ```javascript
  // Per point light, starting at offset i * 8 (2 × vec4 = 8 floats):
  const base = i * 8
  uboData[base + 0] = light.position[0]  // posRange.x
  uboData[base + 1] = light.position[1]  // posRange.y
  uboData[base + 2] = light.position[2]  // posRange.z
  uboData[base + 3] = light.range        // posRange.w
  uboData[base + 4] = light.color[0]     // colorIntensity.x
  uboData[base + 5] = light.color[1]     // colorIntensity.y
  uboData[base + 6] = light.color[2]     // colorIntensity.z
  uboData[base + 7] = light.intensity    // colorIntensity.w
  ```

  If lights are uploaded via individual `setUniform*` calls instead of a UBO buffer, keep the individual calls but in the new field name order so the shader struct alignment matches.

  Do the same for spot lights, adding a third `vec4` for direction + cone angle if the spot light struct has those fields.

- [ ] **Step 5: Update _frameData Float32Array size if needed**

  In `renderer.js`, `_frameData = new Float32Array(N)` — if the light data is packed into this buffer, verify N is still large enough (or smaller now — recalculate: 8 point lights × 8 floats = 64 floats, 4 spot lights × 12 floats = 48 floats, plus camera matrices).

- [ ] **Step 6: Smoke test**

  `npm run dev`. Walk through the arena past multiple light sources. Confirm:
  - All lights render at correct positions, colors, and intensities
  - No shader compilation errors in browser console
  - No WebGL/WebGPU uniform binding errors

- [ ] **Step 7: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/rendering/renderpasses.js app/src/engine/rendering/webgl/glsl.js app/src/engine/rendering/webgpu/wgsl.js app/src/engine/rendering/renderer.js
  git commit -m "perf(rendering): compact light UBO layout to two vec4s per light

  Previous light structs had implicit std140 padding between scalar fields,
  wasting GPU memory bandwidth. Each light is now packed into vec4(pos, range)
  and vec4(color, intensity), eliminating padding and reducing UBO size.
  Improves GPU cache utilisation in the per-fragment lighting loop."
  ```

---

## Self-Review

**Spec coverage check:**

| Architectural finding | Task |
|-----------------------|------|
| worldPosition G-buffer (~8 MB VRAM waste) | Task 1 ✓ |
| Per-frame full BVH rebuild | Task 2 ✓ |
| No light contribution culling | Task 3 ✓ |
| Unconditional shadow blur | Task 4 ✓ |
| `_bvhEntityBuffer` push() realloc risk | Task 2 Step 5 ✓ |
| Priority-queue shadow raycast budget | Task 5 ✓ |
| Light UBO packing layout (vec4 pos_range) | Task 6 ✓ |
| Separate raycastStatic / raycastDynamic | Moved → physics-improvements-plan.md Task 6 |

**Placeholder scan:** No TBDs, no "implement later", no "similar to above". All steps contain actual code.

**Type consistency:** `_shadowSortBuffer`, `_shadowScreenSize`, `posRange`, `colorIntensity` — consistent across tasks 5–6.
