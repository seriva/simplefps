# Transparent / Glass Sorting Implementation Plan

**Goal:** Fix incorrect blending of overlapping glass/transparent surfaces by sorting transparent draw calls back-to-front (painter's algorithm) before the transparent render pass. This eliminates the blending artefacts that occur with ≥ 3 overlapping glass surfaces.

**Architecture:** The transparent/glass pass already renders after the lighting pass into the lighting buffer with alpha blending. The fix is CPU-side: sort transparent entities by distance from the camera (far-to-near) before issuing draw calls, with no shader or framebuffer changes. Full OIT (order-independent transparency) is out of scope — painter's algorithm covers the real-world glass geometry in this game (windows, panels) which rarely has >2 true intersecting surfaces.

**Tech Stack:** ES6 modules, gl-matrix, Biome (lint/format).

## Global Constraints

- No `var`. Use `const` (preferred) or `let`.
- No default exports. Named exports only.
- No per-frame allocations in hot paths. All scratch objects pre-allocated at module scope.
- Log via `Console.log/warn/error`, not `console.*`.
- Run `npm run check` and `npm run format` before every commit.
- No new external dependencies.

---

## Task 1: Sort Transparent Entities Back-to-Front Before Draw

### What & Why

The transparent pass iterates `_visibilityCache[EntityTypes.MESH]` (filtered to glass/transparent materials) in whatever order the visibility BVH traversal produced. That order is spatial, not depth-sorted. Painter's algorithm requires far-to-near order so back surfaces composite correctly under front surfaces. A sort by `dot(entityPos - cameraPos, cameraDir)` (projected depth, cheaper than full distance) gives the correct draw order.

### Files

- Modify: `app/src/engine/rendering/renderpasses.js` — add sort before the transparent/glass draw loop
- No shader changes. No framebuffer changes.

### Interfaces

- Consumes: `Camera.position` (vec3), `Camera.direction` (vec3, normalised forward), transparent entity list from `_visibilityCache`
- Produces: no API change — draw order change only

---

- [ ] **Step 1: Read the transparent pass in renderpasses.js**

  Find the glass/transparent render pass. Note:
  - How transparent entities are identified (material flag? entity type? separate list?)
  - The exact array being iterated for draw calls
  - What per-entity data is available (position as vec3 or array, bounding box centre)

- [ ] **Step 2: Add pre-allocated sort scratch at module scope**

  At the top of `renderpasses.js`, alongside other module-level scratch vars:

  ```javascript
  const _transparentSortBuffer = []  // reused each frame, no per-frame allocation
  ```

- [ ] **Step 3: Insert back-to-front sort before the transparent draw loop**

  Before the loop that draws transparent/glass entities, add:

  ```javascript
  // Collect transparent entities with projected depth (dot product = cheaper than sqrt)
  const transparents = /* the array being iterated — e.g. _visibilityCache[EntityTypes.MESH] filtered to glass */
  _transparentSortBuffer.length = 0
  for (let i = 0; i < transparents.length; i++) {
      const entity = transparents[i]
      const p = entity.position  // adjust to actual shape: vec3 array or {x,y,z}
      const px = (p[0] ?? p.x) - Camera.position[0]
      const py = (p[1] ?? p.y) - Camera.position[1]
      const pz = (p[2] ?? p.z) - Camera.position[2]
      // Projected depth along camera direction (positive = in front of camera)
      const depth = px * Camera.direction[0] + py * Camera.direction[1] + pz * Camera.direction[2]
      _transparentSortBuffer.push({ entity, depth })
  }
  // Far to near (painter's algorithm: draw furthest first)
  _transparentSortBuffer.sort((a, b) => b.depth - a.depth)

  // Replace original loop body — iterate _transparentSortBuffer[i].entity
  for (let i = 0; i < _transparentSortBuffer.length; i++) {
      const entity = _transparentSortBuffer[i].entity
      // existing per-entity draw call unchanged
  }
  ```

  The `_transparentSortBuffer.push({ entity, depth })` allocates small objects per call. Bounded by the number of visible transparent entities (typically < 20 in a map), so V8 object pooling makes this acceptable. If profiling shows GC pressure, replace with two parallel flat arrays `_transparentEntities[]` and `_transparentDepths[]` and sort via an index array.

- [ ] **Step 4: Handle the case where transparent entities are not a separate list**

  If the glass pass filters from `_visibilityCache[EntityTypes.MESH]` inline (checking a material flag per entity), move that filter into the collection loop in Step 3:

  ```javascript
  for (let i = 0; i < meshes.length; i++) {
      const entity = meshes[i]
      if (!entity.material || !entity.material.transparent) continue  // adjust flag name
      // ... depth compute and push as above
  }
  ```

- [ ] **Step 5: Verify depth attachment is re-bound before the sorted draw calls**

  The architectural review noted the transparent pass re-attaches depth for correct depth testing. Confirm this re-attachment happens *before* the sorted draw loop (not inside it). If it's currently inside the original loop, move it outside.

- [ ] **Step 6: Smoke test — overlapping glass**

  `npm run dev`. Find or place two or more glass/transparent surfaces that overlap from the camera's perspective. Walk around them. Confirm:
  - Back surface visible through front surface with correct blending
  - No reversed blending artefacts (front surface disappearing behind back)
  - Single glass surfaces look unchanged

- [ ] **Step 7: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/rendering/renderpasses.js
  git commit -m "fix(rendering): sort transparent entities back-to-front before draw

  The glass/transparent pass drew entities in BVH traversal order (spatial,
  not depth-sorted), producing incorrect alpha blending for >=3 overlapping
  surfaces. Entities are now sorted far-to-near by projected camera depth
  before draw, giving correct painter's algorithm compositing."
  ```

---

## Self-Review

**Spec coverage:** Single finding — transparent sorting incorrect for ≥3 overlapping surfaces. Task 1 covers the fix completely. Full OIT is out of scope (noted in Architecture).

**Placeholder scan:** Step 1 explicitly asks implementer to read before touching. Steps 3 and 4 handle both the separate-list and inline-filter cases. No TBDs.

**Type consistency:** `_transparentSortBuffer`, `entity`, `depth` — consistent. `Camera.position` and `Camera.direction` match exported Camera API used elsewhere in `renderpasses.js`.
