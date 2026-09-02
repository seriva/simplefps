# Code Review Quick Wins Implementation Plan

**Goal:** Fix the correctness bugs and land the low-effort / high-return performance items found in the July 2026 engine code review. Every item here is small, independent, and safe to ship incrementally — one commit per item (or per small group).

**Architecture:** No new systems. All changes are local fixes inside existing modules: `physics/`, `rendering/`, `scene/`. The two larger review findings (fixed-timestep physics, G-buffer position reconstruction) have their own plan documents and are explicitly out of scope here.

**Tech Stack:** ES6 modules, gl-matrix, Biome (lint/format).

## Global Constraints

- No `var`. Use `const` (preferred) or `let`.
- No default exports. Named exports only.
- No per-frame allocations in hot paths. All scratch objects pre-allocated at module scope.
- Log via `Console.log/warn/error`, not `console.*`.
- Run `npm run check` and `npm run format` before every commit.
- No new external dependencies.

---

## Group A: Correctness Bugs

- [ ] **A1: Fix `triangleFlags` ReferenceError in Trimesh constructor**

  `app/src/engine/physics/trimesh.js:22` — the populated-constructor branch reads
  `triangleFlags`, which is not a parameter (signature is `(vertices, indices)`).
  Any `new Trimesh(verts, indices)` throws a ReferenceError. Currently only the
  empty `new Trimesh()` path is used, so the bug is latent.

  Fix: add `triangleFlags = null` as a third constructor parameter.

- [ ] **A2: Guard unknown entity types in visibility update**

  `app/src/engine/scene/scene.js` (`_updateVisibility`) — pushes to
  `_visibilityCache[entity.type]` without checking the key exists. An entity with
  an unregistered type throws a TypeError mid-frame. `_addEntities` already
  guards; mirror that guard here.

- [ ] **A3: World-space distance for CLOSEST raycasts against transformed meshes**

  `app/src/engine/physics/ray.js` (`intersectTrimesh` / `reportIntersection`) —
  `scalar` is a local-space distance but CLOSEST mode compares it across
  collidables as if it were world-space. Wrong "closest" hit when a collidable
  has a scaled world matrix. Static world is identity so it currently works.

  Fix: when the matrix is not identity, report `vec3.dist(this.from, _itWorldPoint)`
  instead of `scalar`.

- [ ] **A4: DynamicBody bounces early due to minimum lookahead**

  `app/src/engine/physics/dynamicbody.js` — `lookahead = max(dist, 5)` makes
  projectiles bounce when a surface is within 5 units even if this frame's travel
  is far shorter, so grenades visibly bounce before contact.

  Fix: keep the 5-unit ray for detection, but only trigger the bounce when the
  hit distance is actually reached this frame (`hitDist <= dist + radius`);
  otherwise integrate position normally.

- [ ] **A5: Depenetration only runs at one height**

  `app/src/engine/physics/fpscontroller.js` (`_resolveDepenetration`) — the 8
  radial rays run at the capsule centre height only, so shins/head can embed in
  sloped or overhanging geometry. Run the radial checks at the same three height
  offsets already used by `_horizontalCheckHeights`.

- [ ] **A6: Frame-rate-dependent bob decay**

  `app/src/engine/physics/fpscontroller.js` (`_updateHeadBob`) —
  `this.bobPhase *= 0.9` is a per-frame multiplier, so bob decays ~5× faster at
  144 Hz than at 30 Hz. Replace with dt-scaled decay:
  `this.bobPhase *= Math.exp(-10 * frameTime)`.
  (Superseded automatically if the fixed-timestep plan lands first — still
  correct to fix now.)

## Group B: Rendering / Backend Performance

- [ ] **B1: Disable `preserveDrawingBuffer`**

  `app/src/engine/rendering/webgl/webglbackend.js` — `preserveDrawingBuffer: true`
  forces the browser to copy (rather than swap) the backbuffer every frame.
  Expensive on tiled mobile GPUs, which are a PWA target. Nothing in the codebase
  reads the drawing buffer after present.

  Fix: set to `false`. If screenshots are ever needed, capture within the same
  frame before returning to the browser.

- [ ] **B2: Pool render-pass sort entries and sort lights once per frame**

  `app/src/engine/rendering/renderpasses.js` — three per-frame allocation sites:
  `{entity, depth}` per visible mesh (transparent sort), `{light, score}` per
  light (contribution sort — computed **twice** per frame, once in
  `renderLighting` and again in `renderTransparent`), and `{entity, score}` per
  mesh (shadow priority sort). At 200 visible entities × 144 fps that is ~90k
  short-lived objects/sec of GC pressure.

  Fix: reuse entry objects from module-level pools (grow, never shrink; reset a
  count each frame), and compute the light contribution sort once per frame,
  consumed by both passes.

- [ ] **B3: Early-out the transparent pass when nothing is translucent**

  `app/src/engine/rendering/renderpasses.js` (`renderTransparent`) — currently
  sorts all lights, uploads the 464-byte lighting UBO, and depth-sorts every
  visible mesh even when zero translucent surfaces are visible. Cache a
  per-mesh `hasTranslucent` flag (the data already exists in
  `_groupedIndices.translucent`) and skip the entire pass when no visible mesh
  has translucent groups.

- [ ] **B4: Cache scalar uniform values per shader**

  `app/src/engine/rendering/webgl/webglbackend.js` (`setUniform`) — uniform
  locations are cached but values are not; constant sampler bindings like
  `setInt("colorBuffer", 0)` are re-issued every frame. Store the last value for
  `int`/`float` uniforms in the per-shader cache and skip redundant `gl.uniform*`
  calls.

- [ ] **B5: Flatten the Backend proxy after init**

  `app/src/engine/rendering/backend.js` — every `Backend.foo()` goes through a
  Proxy `get` trap, defeating inline caching on the hottest call path in the
  engine. After the backend resolves, copy the bound methods onto a plain
  exported object (`Object.assign(Backend, resolved)`) so post-init calls are
  ordinary property lookups. Keep the Proxy only for the pre-init window, or
  export a plain object mutated once at resolve time.

- [ ] **B6: Evict WebGPU persistent bind-group cache on resize**

  `app/src/engine/rendering/webgpu/webgpubackend.js` — `_persistentBindGroupCache`
  is keyed on resource IDs and never evicted. Resizing recreates G-buffer
  textures with new IDs, so bind groups referencing destroyed textures accumulate
  forever. Add a `clearBindGroupCaches()` backend method and call it from
  `Renderer.resize()`.

- [ ] **B7: Allocate full mip chain for mipmapped immutable textures**

  `app/src/engine/rendering/webgl/webglbackend.js` (`createTexture`) — immutable
  path always allocates 1 mip level (`texStorage2D(…, 1, …)`), so
  `generateMipmaps` and anisotropy on the procedural noise texture are silent
  no-ops and the texture aliases at distance. Add a `mips` flag to the
  descriptor; when set, allocate
  `Math.floor(Math.log2(Math.max(w, h))) + 1` levels.

- [ ] **B8: Bake index buffers into VAOs**

  `app/src/engine/rendering/webgl/webglbackend.js` (`drawIndexed`) — binds
  `ELEMENT_ARRAY_BUFFER` on every draw, mutating bound-VAO state and paying a
  redundant bind. Bind the index buffer during `createVertexState` (before
  unbinding the VAO) where possible, and track the current index buffer to skip
  redundant binds for multi-group meshes.

- [ ] **B9: Blur ping-pong via two persistent framebuffers**

  `app/src/engine/rendering/renderer.js` (`_swapBlur`) — swaps framebuffer
  attachments every blur iteration; attachment changes trigger framebuffer
  revalidation on several drivers. Create two persistent scratch framebuffers at
  resize and ping-pong with `bindFramebuffer` only.

## Group C: Hygiene

- [ ] **C1: Remove or pass the dead `time` uniform**

  `app/src/engine/rendering/renderer.js` — `render(time = 0)` is never passed a
  value from `engine.js`, so `cameraPosition.w` is always 0 and no shader reads
  it. Either pass the engine clock through or delete the slot (and the UBO
  comment).

- [ ] **C2: Remove per-material debug log from static geometry build**

  `app/src/engine/scene/scene.js` (`_addStaticGeometry`) — a `Console.log` per
  material group spams the console on every map load. Delete it or demote behind
  a debug flag.

- [ ] **C3: Dedicated inverse-direction scratch in octree ray query**

  `app/src/engine/physics/octree.js` (`rayQueryLocal`) — repurposes
  `_tmpAABB.max` (which is also the caller's `direction` argument) as invDir
  storage, with a comment that names the wrong field. The aliasing is currently
  safe but is a trap. Add a dedicated module-level `_invDir` vec3.

---

## Verification

- [ ] `npm run check` and `npm run format` clean.
- [ ] `npm run dev` smoke test per group:
  - Group A: walk into sloped/overhanging geometry, fire projectiles at floors and walls, confirm no regressions in movement or pickups.
  - Group B: confirm identical visuals (geometry, lights, shadows, glass, blur, FSR) on both WebGL and WebGPU backends; check noise texture no longer shimmers at distance after B7.
  - Group C: map load console output clean.
- [ ] Update `CHANGELOG.md` before PR.
