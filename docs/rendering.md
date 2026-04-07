# Rendering Architecture

## Overview

SimpleFPS uses **Deferred Rendering** with WebGL 2 and WebGPU backends, featuring G-Buffer lighting, shadow mapping, and post-processing. It includes high-performance optimizations like budget-aware occlusion culling and FidelityFX Super Resolution (FSR).

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

Backend selection is **asynchronous** and uses a transparent `Proxy` so the rest of the codebase can `import { Backend }` unchanged. WebGPU is tried first; if `init()` throws or returns false, it falls back to WebGL automatically and saves the updated setting. After the backend resolves, all prototype methods are pre-bound to the instance (`_bindMethods`) so `this` references inside methods are correct without re-entering the proxy trap on every call.

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

**Render Order:** Skybox → Occluders → Occlusion Queries → Occludees  
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

3. **Incremental Visibility Culling:** Scene maintains a type-segregated visible entity cache that is only rebuilt when the camera frustum or the set of bounded entities has actually changed. A flat copy of the last frustum planes is compared each frame; if unchanged, the rebuild is skipped entirely.
4. **Pre-allocated Arrays:** Scratch buffers reused per-frame for FSR passes and frustum comparisons (no GC).
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

