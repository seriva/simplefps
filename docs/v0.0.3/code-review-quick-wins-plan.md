# Code Review & Engine Improvements Plan

**Goal:** Fix correctness/architectural bugs and land high-return performance / zero-allocation optimizations found across engine code reviews for v0.0.3.

**Architecture:** Local fixes and optimizations within existing engine modules: `physics/`, `rendering/`, `scene/`, `animation/`, and `systems/`. Out of scope: large architectural features with standalone plans (Fixed-Timestep Physics, G-Buffer Depth Reconstruction).

**Tech Stack:** ES6 modules, gl-matrix, WebGL 2 / WebGPU, Biome (lint/format).

## Global Constraints

- No `var`. Use `const` (preferred) or `let`.
- No default exports. Named exports only.
- Engine facade rule: `app/src/game/` imports only from `../engine/engine.js`. Engine-internal modules import each other directly and **never** from `engine.js`.
- Zero per-frame allocations in hot paths. All scratch objects pre-allocated at module scope.
- Log via `Console.log/warn/error`, not `console.*`.
- Run `npm run check` and `npm run format` before every commit.
- Update `CHANGELOG.md` & `README.md` before PR.

---

## Round 1: Core Engine & Backend Review (July 2026)

### Group A: Correctness Bugs

- [x] **A1: Fix `triangleFlags` ReferenceError in Trimesh constructor**

  `app/src/engine/physics/trimesh.js:22` — the populated-constructor branch reads
  `triangleFlags`, which is not a parameter (signature is `(vertices, indices)`).
  Any `new Trimesh(verts, indices)` throws a ReferenceError. Currently only the
  empty `new Trimesh()` path is used, so the bug is latent.

  Fix: add `triangleFlags = null` as a third constructor parameter.

- [x] **A2: Guard unknown entity types in visibility update**

  `app/src/engine/scene/scene.js` (`_updateVisibility`) — pushes to
  `_visibilityCache[entity.type]` without checking the key exists. An entity with
  an unregistered type throws a TypeError mid-frame. `_addEntities` already
  guards; mirror that guard here.

- [x] **A3: World-space distance for CLOSEST raycasts against transformed meshes**

  `app/src/engine/physics/ray.js` (`intersectTrimesh` / `reportIntersection`) —
  `scalar` is a local-space distance but CLOSEST mode compares it across
  collidables as if it were world-space. Wrong "closest" hit when a collidable
  has a scaled world matrix. Static world is identity so it currently works.

  Fix: when the matrix is not identity, report `vec3.dist(this.from, _itWorldPoint)`
  instead of `scalar`.

- [x] **A4: DynamicBody bounces early due to minimum lookahead**

  `app/src/engine/physics/dynamicbody.js` — `lookahead = max(dist, 5)` makes
  projectiles bounce when a surface is within 5 units even if this frame's travel
  is far shorter, so grenades visibly bounce before contact.

  Fix: keep the 5-unit ray for detection, but only trigger the bounce when the
  hit distance is actually reached this frame (`hitDist <= dist + radius`);
  otherwise integrate position normally.

- [x] **A5: Depenetration only runs at one height**

  `app/src/engine/physics/fpscontroller.js` (`_resolveDepenetration`) — the 8
  radial rays run at the capsule centre height only, so shins/head can embed in
  sloped or overhanging geometry. Run the radial checks at the same three height
  offsets already used by `_horizontalCheckHeights`.

- [x] **A6: Frame-rate-dependent bob decay**

  `app/src/engine/physics/fpscontroller.js` (`_updateHeadBob`) —
  `this.bobPhase *= 0.9` is a per-frame multiplier, so bob decays ~5× faster at
  144 Hz than at 30 Hz. Replace with dt-scaled decay:
  `this.bobPhase *= Math.exp(-10 * frameTime)`.
  (Superseded automatically if the fixed-timestep plan lands first — still
  correct to fix now.)

### Group B: Rendering / Backend Performance

- [x] **B1: Disable `preserveDrawingBuffer`**

  `app/src/engine/rendering/webgl/webglbackend.js` — `preserveDrawingBuffer: true`
  forces the browser to copy (rather than swap) the backbuffer every frame.
  Expensive on tiled mobile GPUs, which are a PWA target. Nothing in the codebase
  reads the drawing buffer after present.

  Fix: set to `false`. If screenshots are ever needed, capture within the same
  frame before returning to the browser.

- [x] **B2: Pool render-pass sort entries and sort lights once per frame**

  `app/src/engine/rendering/renderpasses.js` — three per-frame allocation sites:
  `{entity, depth}` per visible mesh (transparent sort), `{light, score}` per
  light (contribution sort — computed **twice** per frame, once in
  `renderLighting` and again in `renderTransparent`), and `{entity, score}` per
  mesh (shadow priority sort). At 200 visible entities × 144 fps that is ~90k
  short-lived objects/sec of GC pressure.

  Fix: reuse entry objects from module-level pools (grow, never shrink; reset a
  count each frame), and compute the light contribution sort once per frame,
  consumed by both passes.

- [x] **B3: Early-out the transparent pass when nothing is translucent**

  `app/src/engine/rendering/renderpasses.js` (`renderTransparent`) — currently
  sorts all lights, uploads the 464-byte lighting UBO, and depth-sorts every
  visible mesh even when zero translucent surfaces are visible. Cache a
  per-mesh `hasTranslucent` flag (the data already exists in
  `_groupedIndices.translucent`) and skip the entire pass when no visible mesh
  has translucent groups.

- [x] **B4: Cache scalar uniform values per shader**

  `app/src/engine/rendering/webgl/webglbackend.js` (`setUniform`) — uniform
  locations are cached but values are not; constant sampler bindings like
  `setInt("colorBuffer", 0)` are re-issued every frame. Store the last value for
  `int`/`float` uniforms in the per-shader cache and skip redundant `gl.uniform*`
  calls.

- [x] **B5: Flatten the Backend proxy after init**

  `app/src/engine/rendering/backend.js` — every `Backend.foo()` goes through a
  Proxy `get` trap, defeating inline caching on the hottest call path in the
  engine. After the backend resolves, copy the bound methods onto a plain
  exported object (`Object.assign(Backend, resolved)`) so post-init calls are
  ordinary property lookups. Keep the Proxy only for the pre-init window, or
  export a plain object mutated once at resolve time.

- [x] **B6: Evict WebGPU persistent bind-group cache on resize**

  `app/src/engine/rendering/webgpu/webgpubackend.js` — `_persistentBindGroupCache`
  is keyed on resource IDs and never evicted. Resizing recreates G-buffer
  textures with new IDs, so bind groups referencing destroyed textures accumulate
  forever. Add a `clearBindGroupCaches()` backend method and call it from
  `Renderer.resize()`.

- [x] **B7: Allocate full mip chain for mipmapped immutable textures**

  `app/src/engine/rendering/webgl/webglbackend.js` (`createTexture`) — immutable
  path always allocates 1 mip level (`texStorage2D(…, 1, …)`), so
  `generateMipmaps` and anisotropy on the procedural noise texture are silent
  no-ops and the texture aliases at distance. Add a `mips` flag to the
  descriptor; when set, allocate
  `Math.floor(Math.log2(Math.max(w, h))) + 1` levels.

- [x] **B8: Bake index buffers into VAOs**

  `app/src/engine/rendering/webgl/webglbackend.js` (`drawIndexed`) — binds
  `ELEMENT_ARRAY_BUFFER` on every draw, mutating bound-VAO state and paying a
  redundant bind. Bind the index buffer during `createVertexState` (before
  unbinding the VAO) where possible, and track the current index buffer to skip
  redundant binds for multi-group meshes.

- [x] **B9: Blur ping-pong via two persistent framebuffers**

  `app/src/engine/rendering/renderer.js` (`_swapBlur`) — swaps framebuffer
  attachments every blur iteration; attachment changes trigger framebuffer
  revalidation on several drivers. Create two persistent scratch framebuffers at
  resize and ping-pong with `bindFramebuffer` only.

### Group C: Hygiene

- [x] **C1: Remove or pass the dead `time` uniform**

  `app/src/engine/rendering/renderer.js` — `render(time = 0)` is never passed a
  value from `engine.js`, so `cameraPosition.w` is always 0 and no shader reads
  it. Either pass the engine clock through or delete the slot (and the UBO
  comment).

- [x] **C2: Remove per-material debug log from static geometry build**

  `app/src/engine/scene/scene.js` (`_addStaticGeometry`) — a `Console.log` per
  material group spams the console on every map load. Delete it or demote behind
  a debug flag.

- [x] **C3: Dedicated inverse-direction scratch in octree ray query**

  `app/src/engine/physics/octree.js` (`rayQueryLocal`) — repurposes
  `_tmpAABB.max` (which is also the caller's `direction` argument) as invDir
  storage, with a comment that names the wrong field. The aliasing is currently
  safe but is a trap. Add a dedicated module-level `_invDir` vec3.

---

## Round 2: Architecture, Scene & Zero-Allocation Review (September 2026)

### Group D: Architecture & Correctness Bugs

- [x] **D1: Fix Network module facade violation & circular import**

  `app/src/engine/systems/network.js:2` imported `Console` from `../engine.js`, violating the engine facade rule and creating a circular dependency. Fixed by importing directly from `./console.js`.

- [x] **D2: SkinnedMesh per-instance bone matrix buffer**

  `app/src/engine/rendering/skinnedmesh.js:102-104` cached `_boneMatrixBuffer` on the shared `SkinnedMesh` instance, causing multi-entity pose overwrites. Fixed by moving buffer ownership to `SkinnedMeshEntity` and passing it into `getBoneMatricesForGPU(pose, targetBuffer)`.

- [x] **D3: ParticleEmitterEntity GPU buffer disposal**

  `app/src/engine/scene/particleemitterentity.js` created `_instanceBuffer` and `_vertexState` without a `dispose()` method, leaking buffers on emitter removal. Implemented `dispose()` calling `Backend.deleteBuffer` and `Backend.deleteVertexState`.

- [x] **D4: AnimatedBillboardEntity updateBoundingVolume & frustum culling**

  `app/src/engine/scene/animatedbillboardentity.js` overrode `update()` without calling `updateBoundingVolume()`, keeping bounding boxes `null` and disabling frustum culling. Restored bounding volume updates in `update()` and constructor.

- [x] **D5: Web Audio autoplay resumption & single-decode caching**

  `app/src/engine/systems/sound.js` evaluated `AudioContext` in suspended state without resuming, and fetched/decoded sounds up to 5 times in parallel. Added auto-resumption on user gestures and cached decoded `AudioBuffer`s by URL in a module-level Map.

- [x] **D6: Fix WebGPU near frustum plane extraction in Camera**

  `app/src/engine/systems/camera.js:174-180` extracted the near frustum plane using OpenGL `row3 + row2` (`m[3] + m[2]`). In WebGPU (`perspectiveZO`, `0 <= z <= w`), near plane is `z >= 0` (`row2`: `m[2], m[6], m[10], m[14]`). Branched near plane calculation by backend.

- [x] **D7: Prevent cull state bleed & restore backface culling after double-sided materials**

  `app/src/engine/rendering/material.js:95-99` disabled culling for double-sided materials without restoring it upon unbind, causing subsequent passes (FPS weapons, skinned meshes) to lose backface culling. Added restoration in `Material.unBind()`, `Mesh.renderIndices()`, and `RenderPasses.renderWorldGeometry()`.

- [x] **D8: SkinnedMeshEntity fallback bounding box when animation bounds missing**

  `app/src/engine/scene/skinnedmeshentity.js:169-179` returned early without updating or clearing `this.boundingBox` when playing animations without bounds. Added fallback to `this.mesh.boundingBox`.

### Group E: Hot-Path Performance & Zero Allocations

- [x] **E1: Zero per-frame allocations in AnimatedBillboardEntity**

  `app/src/engine/scene/animatedbillboardentity.js` allocated four Array objects per frame for UV offsets/scales and bounding box updates. Pre-allocated module-level Float32Array scratch arrays.

- [x] **E2: ParticleEmitterEntity Structure-of-Arrays (SoA)**

  `app/src/engine/scene/particleemitterentity.js` allocated individual JavaScript objects per particle. Replaced with flat TypedArray Structure-of-Arrays storage (11 floats/particle) and swap-and-pop removal.

- [x] **E3: Eliminate duplicate inverse-direction calculation in Octree ray queries**

  `app/src/engine/physics/ray.js` and `app/src/engine/physics/octree.js` computed `1.0 / dir[x,y,z]` twice per raycast. Forwarded pre-computed `_itInvDir` from Ray into `rayQueryLocal`.

- [x] **E4: FPSController depenetration early-out**

  `app/src/engine/physics/fpscontroller.js` cast 24 static rays every tick even when stationary on flat floors. Added early-out when horizontal displacement and velocity are negligible.

- [x] **E5: PointLightEntity transform allocation & redundant multiply**

  `app/src/engine/scene/pointlightentity.js` allocated `[size, size, size]` per point light every frame and computed `base_matrix * ani_matrix` twice. Pre-allocated static scale vector and reused unscaled transform.

- [x] **E6: SkyboxEntity per-frame probe color allocation**

  `app/src/engine/scene/skyboxentity.js` allocated `[1, 1, 1]` on every frame. Pre-allocated module-level `_WHITE_PROBE` Float32Array.

- [x] **E7: SpotLightEntity transform matrix construction**

  `app/src/engine/scene/spotlightentity.js` allocated quaternions, matrices, and arrays on position/direction mutation. Pre-allocated module-level scratch objects and updated `base_matrix` in-place.

- [x] **E8: Bypass Stats HUD reactive signal & DOM updates when hidden**

  `app/src/engine/systems/stats.js` fired reactive signals and updated DOM text at 60/120Hz even when the stats HUD was hidden. Added early-out when `!this.visible.get()`.

- [x] **E9: DynamicBody typed vector storage & Input keyup object de-optimization**

  `app/src/engine/physics/dynamicbody.js` stored position/velocity as plain JS arrays; converted to `vec3` Float32Arrays. `app/src/engine/systems/input.js` used `delete` on `_pressed[keyCode]`; replaced with boolean assignment.

---

## Part 3: Roadmap Feature Tracking

- [ ] **F1: G-Buffer Depth Reconstruction**
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
   - Switch animations on skinned entities; verify bounding volumes stay valid and correctly cull/uncull.
2. **GPU Memory & Particle Stress**:
   - Fire continuous rocket/plasma bursts; verify via Chrome DevTools Memory / Performance that GPU buffer allocations and JavaScript heap remain flat.
3. **Billboard Culling & Allocation Check**:
   - Enable bounding volume debug mode (`tbv` in console); verify billboards show bounding boxes and are culled when looking away.
   - Profile with allocation instrumentation to verify zero allocations in `AnimatedBillboardEntity.render()`.
4. **Audio Playback**:
   - Launch in fresh browser session; verify audio starts cleanly on first user interaction without browser warnings or repeated 5x network requests.
5. **Physics Regression**:
   - Test walking into corners, jumping against slopes, and step-climbing to ensure depenetration early-outs introduce no clipping or snagging.
6. **WebGPU vs WebGL Near Culling**:
   - Walk right up to static geometry and entities in WebGPU mode; verify near clipping behaves identically to WebGL.
7. **Cull State & Double-Sided Materials**:
   - Verify double-sided materials render on both faces without causing subsequent opaque or FPS meshes to lose backface culling.
8. **Point Light & Skybox Zero Allocation**:
   - Profile with DevTools Allocation Profiler over 60 frames; verify zero Array objects created by `PointLightEntity` and `SkyboxEntity`.
