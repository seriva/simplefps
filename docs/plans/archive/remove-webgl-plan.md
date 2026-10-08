# WebGPU Migration & Architecture Restructuring — Design Plan

**Version:** continuous
**Status:** In Progress (2026-10-08)

---

## Goal

Remove the legacy WebGL 2.0 rendering backend completely from SimpleFPS and restructure the engine to natively embrace WebGPU as its sole graphics API. 

Phase 1 & 2 eliminate the dual-shader maintenance tax (GLSL vs WGSL), delete ~2,500 lines of WebGL state diffing and emulation code, and clean up engine boot and settings.
Phase 4 restructures the rendering pipeline to drop WebGL-era workarounds (interface `any` boxing, lazy `BindFramebuffer` pass tearing, dynamic `PipelineState` string hashing, and `SetUniform` emulation) in favour of typed WebGPU constructs (pre-baked render pipelines, native pass descriptors, structured bind groups, storage buffers, and compute shaders).

---

## Out of Scope

- Modifying collision or physics WASM boundaries.
- Creating software WebGL polyfills for WebGPU.
- Network multiplayer protocol changes.

---

## Approach

### 1. WebGL Deletion & Immediate Cleanup (Completed)
- Delete `app/src/engine/rendering/webgl/` (`webglbackend.go`, `glsl.go`, `webgl_test.go`, `webgl_caching_test.go`).
- Drop `IsWebGPU()` from `rendering.RenderBackend` and `systems.Camera`.
- Remove `UseWebGPU` from `EngineSettings`, `menus.templ`, and `ui.go`.
- Remove `webgl.WebGLBackend` branches from `engine.go` and `syncBackendSettings()`.

### 2. WebGPU Native Architecture Restructuring
1. **Merge `webgpu/` into `rendering/` & Eliminate Generic Backend Interface:**
   - The `RenderBackend` interface exists solely to bridge WebGL2 and WebGPU. Handles are boxed as `any` (`indexBuffer any`, `handle any`).
   - Merge `webgpu` directly into `rendering`.
   - `Renderer` talks directly to typed WebGPU browser interfaces (`GPUBuffer`, `GPURenderPipeline`, `GPUTextureView`), eliminating boxing and runtime type assertions.
2. **Native Render Passes (Drop `BindFramebuffer` Emulation):**
   - WebGL binds framebuffers as mutable state; `webgpubackend` currently emulates this by lazily opening and closing `GPURenderPassEncoder`s during draw calls.
   - Refactor render passes (`worldGeomPass`, `lightingPass`, `postProcessingPass`) to own explicit `GPURenderPassDescriptor`s with `loadOp`, `storeOp`, and color/depth attachments.
3. **Pre-Baked `GPURenderPipeline`s vs Dynamic State Hashing:**
   - In WebGL, render state is set dynamically. Currently `webgpubackend` builds string keys from `PipelineState` + vertex layout + shader and queries a runtime cache on every draw call.
   - Pre-create immutable `GPURenderPipeline` instances at startup for each pass and material type. Draw calls simply bind the pre-compiled pipeline.
4. **Structured Bind Groups (Eliminate `SetUniform` Emulation):**
   - Remove legacy `SetUniform` emulation that continuously re-allocates and thrashes `FrameBindGroupCache`.
   - Standardize on a clean 4-slot Bind Group Layout:
     - **Group 0 (Frame):** View/Projection matrices, camera position, time (bound once per pass).
     - **Group 1 (Material):** Texture views and samplers (bound per material).
     - **Group 2 (Object):** World matrix and instance parameters (bound with dynamic offset).
     - **Group 3 (Lighting):** Light data (bound for lighting pass).
5. **Storage Buffers (`var<storage>`) for Skinning & Dynamic Lights:**
   - Replace uniform buffer bone matrices with `var<storage, read> array<mat4x4<f32>>`, lifting the 128-bone limit.
   - Replace fixed 8-point / 4-spot light UBO with a storage buffer supporting dozens of dynamic lights per scene.
6. **Compute Shaders:**
   - Move `ParticleEmitterEntity` CPU updates to a GPU compute shader (`dispatchWorkgroups`).
   - Implement post-processing and Kawase blur as compute shaders using workgroup shared memory (`var<workgroup>`).

---

## Edge Cases

- **Environment without WebGPU (`navigator.gpu == nil` or init failure):**
  - Engine must cleanly report failure via `onReady(false)` and display a user-friendly error overlay / console error rather than panicking or crashing silently.
- **Headless Node / jsdom tests (`npm test`, `npm run test:dom`):**
  - `mockbackend_test.go` and engine unit tests must continue to pass in environments where `navigator` or `navigator.gpu` is absent.
- **Headless Playwright E2E (`npm run test:e2e`):**
  - Headless Chromium in typical CI/Linux environments lacks WebGPU without a GPU. The test strategy must either mock `navigator.gpu` for smoke testing boot/UI, or gate rendering verification.

---

## Implementation Tasks

- [x] Phase 1: WebGL Deletion & Backend Interface Cleanup
  - [x] Delete `app/src/engine/rendering/webgl/`
  - [x] Remove `IsWebGPU()` from `rendering.RenderBackend` and update `renderpasses.go`
  - [x] Update `mockbackend_test.go` and `webgpu_test.go`
  - [x] Update `engine.go`, `engine_test.go`, and `main.go`
- [x] Phase 2: Settings & UI Cleanup
  - [x] Remove `UseWebGPU` from `systems.EngineSettings`
  - [x] Remove renderer selector from `menus.templ` and `ui.go`
- [x] Phase 3: Tests & E2E Stabilization
  - [x] Verify unit tests (`npm test`)
  - [x] Verify DOM tests (`npm run test:dom`)
  - [x] Stabilize Playwright E2E smoke test in headless Chromium
- [x] Phase 4: WebGPU-Native Architecture Restructuring
  - [x] 4.1: Merge `webgpu/` package into `rendering/` & remove generic `any` backend abstraction
  - [x] 4.2: Native Render Passes (explicit `GPURenderPassDescriptor`s, drop lazy `BindFramebuffer`)
  - [x] 4.3: Pre-baked `GPURenderPipeline`s (replace runtime `PipelineState` string key cache)
  - [x] 4.4: 4-slot Bind Group Architecture (remove `SetUniform` and dynamic pool thrashing)
  - [x] 4.5: Storage Buffers for Skinning and Dynamic Lights (`var<storage>`)
  - [x] 4.6: Compute Shader Pipeline (GPU particle simulation and compute post-fx)
- [x] Phase 5: Documentation & Verification
  - [x] Update `docs/architecture.md`
  - [x] Update `README.md`
  - [x] Update `CHANGELOG.md`
  - [x] Update `docs/roadmap.md`
  - [x] Run `npm run check` and all test suites to verify quality gates
