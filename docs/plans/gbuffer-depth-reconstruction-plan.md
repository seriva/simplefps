# G-Buffer Depth Reconstruction Implementation Plan (Detailed)

**Goal:** Eliminate the 16-byte `worldPosition` G-buffer render target to reduce mobile VRAM usage and memory bandwidth. We will reconstruct the world position mathematically from the hardware depth buffer in the deferred lighting passes.

**Constraint Checklist & Confidence Score:**
1. No per-frame allocations? Yes.
2. Log via `systems.GlobalConsole.Log/Warn/Error`? Yes.
3. No new external dependencies? Yes.
4. GPU work stays behind `rendering.RenderBackend`? Yes.
Confidence Score: 5/5

> **Note:** This plan was written against the pre-GoFront JavaScript sources. File paths below have
> been updated to the Go port, but the quoted line numbers and JS snippets are approximate — locate
> the equivalent Go code (`allocateBuffers`, `lightingPass`, `Shaders.*`) before editing.

---

## Task 1: Renderer Pipeline Updates
We need to remove the `worldPosition` texture from the G-buffer and bind the existing depth texture during lighting. 
*Note: `matInvViewProj` is already present in the Frame Data UBO in both backends, so no UBO layout changes are required.*

**File:** `app/src/engine/rendering/renderer.go`
- **Lines ~174:** Delete the line `_g.worldPosition = new Texture({ format: "rgba16f", width, height });`
- **Lines ~74:** Delete the disposal logic `if (_g.worldPosition) { _g.worldPosition.dispose(); _g.worldPosition = null; }`
- **Lines ~181:** In `Backend.createFramebuffer` for `_g.framebuffer`, remove `_g.worldPosition.getHandle(),` from the `colorAttachments` array.
- **Lines ~522:** In `_lightingPass()`, change `_g.worldPosition.bind(0);` to `_depth.bind(0);`.

---

## Task 2: WebGL 2 (GLSL) Shaders
Update the GLSL shaders to stop writing position and instead read depth to reconstruct position.

**File:** `app/src/engine/rendering/webgl/glsl.go`
- **Geometry Passes (`deferred_geometry`, `skinned_deferred_geometry`)** (approx lines 135, 990):
  - Delete `layout(location=0) out vec4 fragPosition;`
  - Renumber the remaining locations:
    - `layout(location=0) out vec4 fragNormal;`
    - `layout(location=1) out vec4 fragColor;`
    - `layout(location=2) out vec4 fragEmissive;`
  - In `void main()`: Delete `fragPosition = vec4(vPosition.xyz, 1.0);` (or similar assignments).
- **Lighting Passes (`deferred_directional`, `deferred_point`, `deferred_spot`)** (approx lines 400+, 450+, 490+):
  - Change `uniform sampler2D worldPosition;` to `uniform sampler2D depthTexture;`
  - Find where `fragPos` is read from the texture: e.g., `vec3 fragPos = texture(worldPosition, uv).xyz;` or `worldPos = texture(worldPosition, uv).xyz;`
  - Replace it with the depth reconstruction math:
    ```glsl
    float z = texture(depthTexture, uv).r;
    vec4 clipSpace = vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
    vec4 worldSpace = matInvViewProj * clipSpace;
    vec3 fragPos = (worldSpace / worldSpace.w).xyz;
    // (If the local variable was named `worldPos`, assign it to worldPos instead of fragPos)
    ```

---

## Task 3: WebGPU (WGSL) Shaders
Update the WGSL shaders. WebGPU clip space Z is `[0, 1]` and Y points up, but screen UV Y points down.

**File:** `app/src/engine/rendering/webgpu/wgsl.go`
- **Geometry Passes (`entityShader`, `skinnedEntityShader` etc.)**:
  - In the output struct (e.g., `GbufferOutput`), delete `@location(0) worldPosition: vec4<f32>,` (approx lines 153, 318, 984).
  - Renumber the locations: `normal` becomes `@location(0)`, `color` becomes `@location(1)`, `emissive` becomes `@location(2)`.
  - In `vs_main()`: Delete assignments to `output.worldPosition` (but keep `output.clipPosition = frameData.matViewProj * ...`).
  - In `fs_main()`: Delete the field `worldPosition` from the returned struct, e.g., `worldPosition: vec4<f32>(input.worldPosition.xyz, 1.0),` (approx lines 280, 389, 1070).
- **Lighting Passes (`bindings_deferred` string, approx line 670)**:
  - Find `@group(1) @binding(0) var worldPosition: texture_2d<f32>;`
  - Change it to `@group(1) @binding(0) var depthTexture: texture_depth_2d;`
- **Lighting Passes (`fs_main` for Directional, Point, Spot)** (approx lines 512, 562, 611):
  - Find where position is read (e.g., `let fragPos = textureLoad(worldPosition, fragCoord, 0).xyz;`).
  - Replace it with:
    ```wgsl
    let z = textureLoad(depthTexture, fragCoord, 0);
    let clipSpace = vec4<f32>(input.uv.x * 2.0 - 1.0, (1.0 - input.uv.y) * 2.0 - 1.0, z, 1.0);
    let worldSpace = frameData.matInvViewProj * clipSpace;
    let fragPos = (worldSpace / worldSpace.w).xyz;
    ```
  - *(Note: Ensure `input.uv` is available in the fragment shader input struct; if not, use `fragCoord` to compute UV: `let uv = vec2<f32>(fragCoord.xy) / vec2<f32>(frameData.viewportSize.xy);`)*

---

## Verification
1. Run `npm run check` and `npm test` (`TestAllocateBuffersResolvesEveryFormat` and `TestRenderFrameDoesNotAllocate` in `rendering/renderer_test.go` must still pass; update the expected attachment list).
2. Run `npm run dev` in WebGL mode and verify identical geometry/lighting to before; `npm run test:e2e` must still see a lit frame.
3. Run `npm run dev` in WebGPU mode (using Chrome Canary or Edge) and verify identical rendering.
4. Verify using Spectre.js / WebGPU Inspector that the G-buffer only has 3 color attachments plus depth.
