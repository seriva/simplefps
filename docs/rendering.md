# Rendering Architecture

## Overview

SimpleFPS uses **Deferred Rendering** with WebGL 2 and WebGPU backends, featuring G-Buffer lighting, SSAO, shadow mapping, and post-processing. It includes high-performance optimizations like budget-aware occlusion culling and FidelityFX Super Resolution (FSR).

## File Structure

```
app/src/engine/rendering/
├── backend.js           # Backend selector
├── renderbackend.js     # Abstract API base class
├── renderer.js          # Deferred pipeline orchestrator
├── renderpasses.js      # Render pass implementations
├── shaders.js, material.js, mesh.js, texture.js, shapes.js
├── webgl/               # WebGL 2 implementation + GLSL
└── webgpu/              # WebGPU implementation + WGSL
```

## Backend Abstraction

**RenderBackend** provides a unified API abstracted over WebGL/WebGPU:

| Category | Methods |
|----------|---------|
| **Lifecycle** | `init()`, `dispose()`, `beginFrame()`, `endFrame()` |
| **Resources** | `createTexture()`, `createBuffer()`, `createShaderProgram()`, `createUBO()` |
| **State** | `setBlendState()`, `setDepthState()`, `setCullState()` |
| **Drawing** | `bindShader()`, `bindTexture()`, `drawIndexed()` |

Backend selection at startup:
```javascript
Backend = (Settings.useWebGPU && navigator.gpu) ? new WebGPUBackend() : new WebGLBackend();
```

## Baked Lighting System

### Lightmaps
**Purpose:** Precomputed lighting on static BSP surfaces.

- Stored as RGB texture atlas.
- Multiplied by albedo in geometry pass: `color *= texture(lightmapSampler, vLightmapUV)`.
- `normal.w` stores lightmap flag (1.0 = lightmapped).
- Dynamic lights skip lightmapped surfaces to avoid double-lighting.
- Provides indirect lighting, bounce light, and baked AO at no runtime cost.

### LightGrid
**Purpose:** Volumetric probe lighting for dynamic objects.

- 3D grid of RGB probes (3 bytes each).
- Trilinear interpolation between 8 neighbors.
- CPU-side sampling, result passed to shaders via uniform.
- Dynamic objects sample grid, static objects use lightmaps.

## Deferred Rendering Pipeline

```mermaid
flowchart LR
    Geom[Geometry] --> SSAO --> Shadow --> FPS
    FPS --> Light[Lighting] --> Trans[Transparent] --> Post[Post-Process] --> FSR[FSR Upscaling]
```

### 1. Geometry Pass (G-Buffer)

**G-Buffer Layout:**
| Attachment | Format | Content |
|------------|--------|---------|
| 0 | RGBA16F | World-space position |
| 1 | RGBA8 | View-space normals + lightmap flag (w) |
| 2 | RGBA8 | Albedo |
| 3 | RGBA8 | Emissive |

**Render Order:** Skybox → Occluders → Occlusion Queries → Occludees  
Depth range: 0.1-1.0 (world geometry)

**Advanced Features:**
- **Detail Textures:** Static geometry uses dual-layer parallax mapping with procedural noise for fine-grained surface detail (normals + height).
- **Modulation:** Uses sum-of-sines modulation for macro-variation across large surfaces.
- **Probe Lighting:** Dynamic objects sample the LightGrid, with the result passed via `uProbeColor` in the Object Data UBO.

### 2. SSAO Pass
- 16-sample hemisphere kernel + 4×4 noise.
- Bilateral blur for edge-aware smoothing (half-resolution).

### 3. Shadow Pass
- Depth-only with polygon offset.
- **Optimization:** Skinned entity shadow updates are throttled based on movement and time intervals.
- Kawase blur for soft edges.

### 4. FPS Geometry
- Depth range: 0.0-0.1 (always in front).
- Appends to G-buffer.

### 5. Lighting Pass
- Deferred shading via light volumes.
- Directional (fullscreen quad), Point (sphere), Spot (cone).
- Additive blending (`one`, `one`).
- Skips lightmapped surfaces.

### 6. Transparent Pass
- Forward rendering with blending.
- Depth test enabled, write disabled.
- Includes glass, explosions, and particles.

### 7. Post-Processing
Combines: albedo × (lighting + emissive) + SSAO + shadows + bloom + FXAA.

### 8. FidelityFX Super Resolution (FSR)
If enabled, replaces native resolution output:
1. **EASU (Edge Adaptive Spatial Upsampling):** Upscales from render scale to native resolution.
2. **RCAS (Robust Contrast Adaptive Sharpening):** Applies edge-aware sharpening.

### 9. Debug Pass
Console commands:
- `tbv`: Toggle Bounding Volumes
- `twf`: Toggle Wireframes
- `tlv`: Toggle Light Volumes
- `tsk`: Toggle Skeleton
- `toc`: Toggle Occlusion Culling

## Performance Optimizations

1. **Occlusion Culling (Budget-Aware):**
   - **Occluder/Occludee Split:** Occluders populate depth, then occludees are queried.
   - **Query Budget:** Limits queries to 96 per frame, round-robin through all entities via a cursor.
   - **Ring Buffering:** Uses a 6-slot query buffer per entity to handle GPU readback latency without stalls.
   - **Async Readback:** (WebGPU) 3-buffer ring buffer for non-blocking result retrieval.
   - **Scope:** Culls Meshes, SkinnedMeshes, PointLights, and SpotLights.

2. **WebGPU Backend Optimizations:**
   - **O(1) Uniform Buffer Pooling:** Reuses buffers of various sizes to avoid per-frame allocations.
   - **Dynamic Object Uniform Buffer:** Single large buffer for per-entity data (ObjectData) using dynamic offsets.
   - **Explicit Pipeline Layout Caching:** Persistent and per-frame BindGroup and Pipeline caches.
   - **State Filtering:** Avoids redundant GPU state changes.

3. **Visibility Culling:** Scene maintains type-segregated visible entity cache.
4. **Pre-allocated Arrays:** `Float32Array` reused per-frame (no GC).
5. **Depth Range Partitioning:** World (0.1-1.0) / FPS (0.0-0.1) avoids z-fighting.

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
| **Occlusion** | `getQueryObject` | `resolveQuerySet` + `mapAsync` |

## Extension Example

Add a new render pass in `renderpasses.js`:
```javascript
const renderMyPass = () => {
    Shaders.myShader.bind();
    _renderEntities(EntityTypes.MY_TYPE);
    Backend.unbindShader();
};
```

Integrate in `renderer.js`:
```javascript
_lightingPass();
_myPass();  // Insert here
_postProcessingPass();
```
