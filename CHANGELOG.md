# Changelog

All notable changes to this project will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [Unreleased]

### Added

- Complete port to GoFront: rewritten entire engine, simulation, and game logic in Go and WebAssembly.
- Pure WebAssembly binary asset decoding for levels and animations, accelerating model loading times by over 14×.
- SIMD-accelerated skeletal animation pipeline for character models.
- Automated performance regression testing and A/B benchmarking suite.

### Changed

- Transitioned rendering exclusively to WebGPU, eliminating legacy WebGL2 fallback overhead.
- Moved collision, physics, and character animation loops into WebAssembly for zero-allocation per-frame simulation.
- Migrated user interface, HUD, and settings menus to GoFront template components with typed state management.
- Improved collision loading reliability with strict geometry validation and error reporting.
- Reduced overall bundle and binary sizes by trimming redundant math and entity utilities.
- Upgraded the GoFront compiler to `^1.8.0` and refreshed project dependencies; physics runs at the same speed and the renderer's matrix math stays within about 10% of the previous compiler.

### Removed

- Removed legacy JavaScript/ES6 engine code and obsolete Microtastic build tooling.
- Removed WebGL2 backend, shaders, and legacy abstraction layers.
- Removed unused math, animation, and scene helpers to simplify the codebase.

### Fixed

- Fixed startup crash when WebGPU is unavailable by displaying a friendly compatibility notice.
- Fixed GPU particle buffer alignment issues that caused visual corruption in particle effects.
- Fixed wireframe debug bounding box rendering on collision meshes and lights.
- Fixed unnecessary skinned mesh draw passes on static objects without bones.
- Fixed WebGPU texture mipmap generation and depth-stencil binding issues.

## [2026-09] — Legacy JavaScript engine

Final iteration of the ES6 codebase prior to the GoFront rewrite.

### Added

- 120 Hz fixed-timestep physics accumulator for framerate-independent simulation.
- Quake-style character movement with step climbing, wall sliding, and collision depenetration.
- Dynamic light contribution culling, spatial partitioning, and transparent sorting.
- Zero-allocation runtime optimizations across particles, scratch matrices, and GPU resources.

## [2026-05]

### Added

- Initial release.
