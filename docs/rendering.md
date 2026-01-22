# Rendering Architecture

## Overview

SimpleFPS uses **Deferred Rendering** with WebGL 2 and WebGPU backends, featuring G-Buffer lighting, SSAO, shadow mapping, and post-processing.

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

- Stored as RGB texture atlas
- Multiplied by albedo in geometry pass: `color *= texture(lightmapSampler, vLightmapUV)`
- `normal.w` stores lightmap flag (1.0 = lightmapped)
- Dynamic lights skip lightmapped surfaces to avoid double-lighting
- Provides indirect lighting, bounce light, and baked AO at no runtime cost

### LightGrid
**Purpose:** Volumetric probe lighting for dynamic objects.

- 3D grid of RGB probes (3 bytes each)
- Trilinear interpolation between 8 neighbors
- CPU-side sampling, result passed to shaders via uniform
- Dynamic objects sample grid, static objects use lightmaps

## Deferred Rendering Pipeline

```mermaid
flowchart LR
    Geom[Geometry] --> SSAO --> Shadow --> FPS
    FPS --> Light[Lighting] --> Trans[Transparent] --> Post[Post-Process]
```

### 1. Geometry Pass (G-Buffer)

**G-Buffer Layout:**
| Attachment | Format | Content |
|------------|--------|---------|
| 0 | RGBA16F | World-space position |
| 1 | RGBA8 | View-space normals + lightmap flag (w) |
| 2 | RGBA8 | Albedo |
| 3 | RGBA8 | Emissive |

Renders: Skybox → Opaque meshes → Skinned meshes  
Depth range: 0.1-1.0 (world geometry)

### 2. SSAO Pass
- 16-sample hemisphere kernel + 4×4 noise
- Bilateral blur for edge-aware smoothing

### 3. Shadow Pass
- Depth-only with polygon offset
- Kawase blur for soft edges

### 4. FPS Geometry
- Depth range: 0.0-0.1 (always in front)
- Appends to G-buffer

### 5. Lighting Pass
- Deferred shading via light volumes
- Directional (fullscreen quad), Point (sphere), Spot (cone)
- Additive blending (`one`, `one`)
- Skips lightmapped surfaces

### 6. Transparent Pass
- Forward rendering with blending
- Depth test enabled, write disabled

### 7. Post-Processing
Combines: albedo × (lighting + emissive) + SSAO + shadows + bloom + FXAA

### 8. Debug Pass
Console commands: `tbv` (bounds), `twf` (wireframe), `tlv` (lights), `tsk` (skeleton)

## Uniform Buffer Objects

**Frame Data UBO** (Binding 0): View-proj matrices, camera position, viewport size  
**Lighting UBO** (Binding 2): Up to 8 point lights + 4 spot lights

## Performance Optimizations

1. **Visibility Culling:** Scene maintains type-segregated visible entity cache
2. **Pre-allocated Arrays:** `Float32Array` reused per-frame (no GC)
3. **Depth Range Partitioning:** World (0.1-1.0) / FPS (0.0-0.1) avoids z-fighting
4. **Kawase Blur:** Iterative passes instead of large kernels
5. **Bilateral SSAO Blur:** Edge-aware smoothing

## WebGL vs WebGPU

| Aspect | WebGL | WebGPU |
|--------|-------|--------|
| **Shaders** | GLSL | WGSL |
| **Uniforms** | Individual `setUniform` | UBOs |
| **State** | Global state machine | Pipeline objects |

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
