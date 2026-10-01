# Rendering Architecture

## Overview

SimpleFPS uses **Deferred Rendering** with WebGL 2 and WebGPU backends, featuring G-Buffer lighting, shadow mapping, and post-processing. It includes FidelityFX Super Resolution (FSR) upscaling and a zero-allocation per-frame path.

## File Structure

```
app/src/engine/
├── engine.go                # SelectBackend(): WebGPU if preferred+available, else WebGL2
└── rendering/               # package rendering
    ├── renderbackend.go     # RenderBackend interface + shared types (TextureDesc, BlendState, …)
    ├── renderer.go          # Deferred pipeline orchestrator (G-buffer, lighting, post, FSR)
    ├── renderpasses.go      # Renderer.Render(): pass sequencing, RenderStats, SceneSource interface
    ├── shaders.go           # Shader wrapper (Bind/SetUniform) over backend programs; Shaders registry
    ├── material.go, mesh.go, skinnedmesh.go, texture.go, shapes.go, noise.go
    ├── webgl/               # package webgl: WebGLBackend + GLSL
    └── webgpu/              # package webgpu: WebGPUBackend + WGSL
```

## Backend Abstraction

**`rendering.RenderBackend`** is a Go interface implemented by `webgl.WebGLBackend` and `webgpu.WebGPUBackend`:

| Category | Methods |
|----------|---------|
| **Lifecycle** | `init()`, `dispose()`, `beginFrame()`, `endFrame()` |
| **Resources** | `createTexture()`, `createBuffer()`, `createShaderProgram()`, `createUBO()` |
| **State** | `setBlendState()`, `setDepthState()`, `setCullState()` |
| **Drawing** | `bindShader()`, `bindTexture()`, `drawIndexed()` |

Backend selection lives in `engine.SelectBackend(preferWebGPU, onReady)`: WebGPU is only attempted when the setting prefers it **and** `navigator.gpu` exists; if its async `Init` reports failure the engine falls back to WebGL2. The chosen backend is published as `engine.CurrentBackend` / `rendering.ActiveBackend` and everything outside `engine` talks to it through the interface only — `webgl` and `webgpu` are imported by `engine.go` alone.

## Baked Lighting System

### Lightmaps
**Purpose:** Precomputed lighting on static BSP surfaces.

- Stored as RGB texture atlas.
- Multiplied by albedo in the geometry pass.
- The lightmap flag is stored in `color.a` (1.0 = lightmapped/skybox).
- Dynamic lights skip lightmapped surfaces to avoid double-lighting.
- Provides indirect lighting, bounce light, and baked AO at no runtime cost.

### LightGrid
**Purpose:** Volumetric probe lighting for dynamic objects.

- 3D grid of RGB probes (3 bytes each).
- Trilinear interpolation between 8 neighbors using 8 pre-allocated scratch arrays (no GC).
- **Pre-computed strides:** Y and Z strides are computed once at load time and reused for every probe address calculation, avoiding per-sample multiplications.
- CPU-side sampling, result passed to shaders via uniform.
- Dynamic objects sample grid, static objects use lightmaps.

## Deferred Rendering Pipeline

Pass order: Geometry → Shadow → FPS Geometry → Lighting → Transparent → Post-Process → FSR Upscaling

### 1. Geometry Pass (G-Buffer)

**G-Buffer Layout:**
| Attachment | Format | Content |
|------------|--------|---------|
| 0 | RGBA16F | World-space position |
| 1 | RG8 | Oct-encoded normals (xy = octahedral encoding of world-space normal) |
| 2 | RGBA8 | Albedo (a = lightmap flag: 1.0 = lightmapped/skybox, 0.0 = dynamic) |
| 3 | RGBA8 | Emissive |

**Render Order:** Skybox → static meshes → skinned meshes; the per-type entity loops live in `scene/renderpasses.go`, which `Renderer` drives through the `SceneSource` interface.  
Depth range: 0.1-1.0 (world geometry)

**Advanced Features:**
- **Detail Textures:** Static geometry uses dual-layer parallax mapping with procedural noise for fine-grained surface detail (normals + height).
- **Modulation:** Uses sum-of-sines modulation for macro-variation across large surfaces.
- **Probe Lighting:** Dynamic objects sample the LightGrid; the result is passed via the Object Data UBO.

### 2. Shadow Pass
- Depth-only with polygon offset.
- **Skinned throttle:** Shadow raycasts for skinned entities are throttled based on movement and time intervals (closer = more frequent).
- **Raycast budget:** Static-mesh shadow raycasts are capped at 16 per frame to prevent performance spikes in large scenes.
- Kawase blur for soft edges.

### 3. FPS Geometry
- Depth range: 0.0-0.1 (always in front).
- Appends to G-buffer.

### 4. Lighting Pass
- Deferred shading via light volumes.
- Directional (fullscreen quad), Point (sphere), Spot (cone).
- Additive blending (`one`, `one`).
- Skips lightmapped surfaces.

### 5. Transparent Pass
- Forward rendering with blending.
- Depth test enabled, write disabled.
- Includes glass, explosions, and particles.

### 6. Post-Processing
Combines: albedo × (lighting + emissive) + shadows + bloom + FXAA.

### 7. FidelityFX Super Resolution (FSR)
If enabled, replaces native resolution output:
1. **EASU (Edge Adaptive Spatial Upsampling):** Upscales from render scale to native resolution.
2. **RCAS (Robust Contrast Adaptive Sharpening):** Applies edge-aware sharpening.

### 8. Debug Pass
Console commands:
- `tbv`: Toggle Bounding Volumes
- `twf`: Toggle Wireframes
- `tlv`: Toggle Light Volumes
- `tsk`: Toggle Skeleton

## Performance Optimizations

1. **Frustum Culling:** `Scene.UpdateVisibility` rebuilds a type-segregated visible-entity cache once per frame from each entity's bounding box, so every render pass iterates only the entities of the type it needs.

2. **WebGPU Backend Optimizations:**
   - **O(1) Uniform Buffer Pooling:** Reuses buffers of various sizes to avoid per-frame allocations.
   - **Dynamic Object Uniform Buffer:** Single large buffer for per-entity data (ObjectData) using dynamic offsets.
   - **Explicit Pipeline Layout Caching:** Persistent and per-frame BindGroup and Pipeline caches.
   - **State Filtering:** Avoids redundant GPU state changes.

3. **Zero Per-Frame Allocations:** Scratch vectors/matrices and sort buffers are package-level and reused; the render path is covered by heap-growth tests (`rendering_test.go`, `scene_test.go`) and the raycast benchmark in `tests/perf/zero-alloc.js`.
4. **Depth Range Partitioning:** World (0.1-1.0) / FPS (0.0-0.1) avoids z-fighting.

## Uniform Buffer Objects (UBOs)

**Frame Data UBO** (Binding 0):
- `matViewProj`, `matInvViewProj`, `matView`, `matProjection`
- `cameraPosition` (w: time)
- `viewportSize` (z: proceduralDetail flag)

**Object Data UBO** (Binding 1 - Dynamic):
- `matWorld`
- `color` / `params`

**Lighting UBO** (Binding 2):
- Data for up to 8 point lights and 4 spot lights.
- Includes light counts and specific attenuation parameters.

## WebGL vs WebGPU

| Aspect | WebGL | WebGPU |
|--------|-------|--------|
| **Shaders** | GLSL | WGSL |
| **Uniforms** | Individual `setUniform` | UBOs / Dynamic Offsets |
| **State** | Global state machine | Pipeline objects |

