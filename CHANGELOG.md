# Changelog

All notable changes to this project will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [Unreleased]

### Fixed
- Latent `ReferenceError` in populated `Trimesh` constructor by adding missing `triangleFlags` parameter.
- Potential `TypeError` during mid-frame visibility updates by guarding unregistered entity types.
- Raycast hit distance comparison in CLOSEST mode for transformed meshes with non-identity world matrices.
- Early bouncing of `DynamicBody` projectiles before contact by requiring hit distance to be reached within the current frame.
- Player capsule embedding in sloped or overhanging geometry by checking depenetration across three height offsets.
- Frame-rate-dependent head bob decay in `FPSController` by switching to dt-scaled exponential decay.

### Changed
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

## [0.0.2] - 2026-05-07

### Added

- Initial release.
