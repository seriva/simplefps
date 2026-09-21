# Changelog

All notable changes to this project will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

## [2026-09]

### Changed
- Moved completed feature plans into `docs/plans/archive/` to keep active planning directory uncluttered.
- Reconfigured project structure as versionless (unversioned feature plans, removed semver metadata).
- Synced agent workflow and bridge files with bootstrap.
- Updated npm dependencies to latest versions (`@biomejs/biome`, `lefthook`).
- Decoupled player movement and projectile simulation from render frame rate with a 120 Hz fixed-timestep accumulator.
- Disabled `preserveDrawingBuffer` in WebGL backend to avoid backbuffer copies on mobile/tiled GPUs.
- Reused pooled sort entries and consolidated light contribution sorting to run once per frame.
- Early-out transparent render pass when no visible meshes contain translucent materials.
- Cached scalar `int` and `float` uniform values per shader in WebGL backend to eliminate redundant GL calls.
- Flattened `Backend` proxy at initialization to enable monomorphic inline-cached method calls.
- Evicted WebGPU persistent bind-group cache upon canvas resize to prevent GPU memory leaks.
- Allocated full mip chains for mipmapped immutable textures in WebGL backend.
- Baked index buffers into VAOs for single-group meshes and tracked bound index buffers to eliminate redundant bindings.
- Eliminated framebuffer attachment swapping during Kawase blur in favor of persistent ping-pong framebuffers.
- Passed engine clock time into the camera frame data UBO.
- Removed per-material debug logging during static geometry loading.
- Replaced repurposed scratch vector in octree ray query with dedicated `_invDir` vector.

### Fixed
- Latent `ReferenceError` in populated `Trimesh` constructor by adding missing `triangleFlags` parameter.
- Potential `TypeError` during mid-frame visibility updates by guarding unregistered entity types.
- Raycast hit distance comparison in CLOSEST mode for transformed meshes with non-identity world matrices.
- Early bouncing of `DynamicBody` projectiles before contact by requiring hit distance to be reached within the current frame.
- Player capsule embedding in sloped or overhanging geometry by checking depenetration across three height offsets.
- Frame-rate-dependent head bob decay in `FPSController` by switching to dt-scaled exponential decay.
- Network module architectural facade violation and circular dependency by importing `Console` from `./console.js`.
- Multi-entity animation pose corruption when sharing `SkinnedMesh` models by moving GPU bone matrix buffers to `SkinnedMeshEntity`.
- GPU buffer and vertex array leak upon particle emitter completion by implementing `ParticleEmitterEntity.dispose()`.
- Frustum culling bypass and dead code in `AnimatedBillboardEntity` by properly invoking `updateBoundingVolume()`.
- Web Audio autoplay suspension on initial launch and redundant parallel network fetches by caching decoded `AudioBuffer`s.
- Per-frame Array allocations in `AnimatedBillboardEntity` by pre-allocating uniform and bounding box scratch arrays.
- High particle allocation GC churn by converting `ParticleEmitterEntity` to flat TypedArray Structure-of-Arrays storage.
- Duplicate floating-point division in octree ray traversal by forwarding pre-computed inverse directions.
- Redundant 24-ray depenetration overhead when stationary on ground in `FPSController`.
- Near frustum plane extraction in WebGPU clip space by using row 2 instead of row 3 + row 2.
- Cull state bleed after rendering double-sided materials by restoring backface culling in `Material.unBind()`, `Mesh.renderIndices()`, and `RenderPasses.renderWorldGeometry()`.
- Stale or frozen bounding box in `SkinnedMeshEntity` when switching to animations without precomputed bounds by falling back to mesh bounding box.
- Per-frame Array allocations and duplicate world matrix multiplication in `PointLightEntity`.
- Per-frame probe color Array allocation in `SkyboxEntity`.
- Per-mutation matrix allocations in `SpotLightEntity` by pre-allocating scratch transform vectors and matrices.
- Redundant 60/120 Hz reactive signal and DOM updates in `Stats.update()` when stats HUD is hidden.
- V8 object shape dictionary de-optimization in `Input` on key up by using boolean assignment instead of `delete`.
- Polymorphic array overhead in `DynamicBody` by storing position and velocity as `vec3` Float32Arrays.

### Added
- Initial release.

