// WGSL Shader Sources for WebGPU Backend
// Stage 2: Basic geometry rendering with textures

// Shared structures and bindings
const FrameDataStruct = /* wgsl */ `
struct FrameData {
    matViewProj: mat4x4<f32>,
    matInvViewProj: mat4x4<f32>,
    matView: mat4x4<f32>,
    matProjection: mat4x4<f32>,
    cameraPosition: vec4<f32>,  // .w = time
    viewportSize: vec4<f32>,    // .zw = unused
}
`;

const MaterialDataStruct = /* wgsl */ `
struct MaterialData {
    flags: vec4<i32>,   // type, doEmissive, doReflection, hasLightmap
    params: vec4<f32>,  // reflectionStrength, opacity, pad, pad
}
`;

// Skinning vertex input attributes - shared between all skinned shaders
const SkinnedVertexInputAttribs = /* wgsl */ `
    @location(4) jointIndices: vec4<u32>,
    @location(5) jointWeights: vec4<f32>,`;

// Skinning uniform binding - bone matrices array (for group 1)
const SkinningUniformBinding = /* wgsl */ `
@group(1) @binding(2) var<uniform> boneMatrices: array<mat4x4<f32>, 64>;`;

// Skinning calculation function - compute skin matrix from bone weights
// Call with jointIndices and jointWeights from vertex input
const SkinningCalcFn = /* wgsl */ `
fn calcSkinMatrix(jointIndices: vec4<u32>, jointWeights: vec4<f32>) -> mat4x4<f32> {
    return boneMatrices[jointIndices.x] * jointWeights.x +
           boneMatrices[jointIndices.y] * jointWeights.y +
           boneMatrices[jointIndices.z] * jointWeights.z +
           boneMatrices[jointIndices.w] * jointWeights.w;
}`;

// Shared shadow vertex output struct
const ShadowVertexOutputStruct = /* wgsl */ `
struct ShadowVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
}`;

// Shared debug vertex output struct
const DebugVertexOutputStruct = /* wgsl */ `
struct DebugVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
}`;

// Geometry shader - outputs to G-buffer
const geometryShader = /* wgsl */ `
${FrameDataStruct}
${MaterialDataStruct}

struct GeomVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) normal: vec3<f32>,
    @location(3) lightmapUV: vec2<f32>,
}

struct GeomVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) worldPosition: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) lightmapUV: vec2<f32>,
}

struct FragmentOutput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) color: vec4<f32>,
    @location(3) emissive: vec4<f32>,
}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> materialData: MaterialData;
@group(1) @binding(1) var<uniform> matWorld: mat4x4<f32>;
@group(1) @binding(2) var<uniform> uProbeColor: vec3<f32>;

@group(2) @binding(0) var colorSampler: sampler;
@group(2) @binding(1) var colorTexture: texture_2d<f32>;
@group(2) @binding(2) var emissiveTexture: texture_2d<f32>;
@group(2) @binding(3) var lightmapTexture: texture_2d<f32>;
@group(2) @binding(4) var detailTexture: texture_2d<f32>;
@group(2) @binding(5) var reflectionTexture: texture_2d<f32>;
@group(2) @binding(6) var reflectionMaskTexture: texture_2d<f32>;

const MESH: i32 = 1;
const SKYBOX: i32 = 2;

@vertex
fn vs_main(input: GeomVertexInput) -> GeomVertexOutput {
    var output: GeomVertexOutput;
    output.worldPosition = matWorld * vec4<f32>(input.position, 1.0);
    output.uv = input.uv;
    output.lightmapUV = input.lightmapUV;
    output.normal = normalize((matWorld * vec4<f32>(input.normal, 0.0)).xyz);
    output.clipPosition = frameData.matViewProj * output.worldPosition;
    return output;
}

@fragment
fn fs_main(input: GeomVertexOutput) -> FragmentOutput {
    var output: FragmentOutput;
    
    // Sample albedo
    var color = textureSample(colorTexture, colorSampler, input.uv);
    if (color.a < 0.5) {
        discard;
    }
    
    // Apply Probe Color for dynamic objects (no lightmap)
    // Static objects (lightmapFlag == 1) ignore this as they use texture mixing below
    // Skybox (flag x == SKYBOX) should also ignore this
    if (materialData.flags.w == 0 && materialData.flags.x != SKYBOX) {
        color = vec4<f32>(color.rgb * uProbeColor, color.a);
    }
    
    // Apply lightmap if available and not skybox
    if (materialData.flags.w == 1 && materialData.flags.x != SKYBOX) {
        color = color * textureSample(lightmapTexture, colorSampler, input.lightmapUV);
    }

    // Apply Detail Noise
    if (materialData.flags.x != SKYBOX && frameData.viewportSize.z > 0.5 && materialData.flags.w == 1) {
         let noise = textureSample(detailTexture, colorSampler, input.uv * 4.0).r;
         color = vec4<f32>(color.rgb * (0.9 + 0.2 * noise), color.a);
    }
    
    // Initialize emissive
    output.emissive = vec4<f32>(0.0);
    
    if (materialData.flags.x != SKYBOX) {
        let lightmapFlag = f32(materialData.flags.w);
        output.normal = vec4<f32>(input.normal * 0.5 + 0.5, lightmapFlag);
        output.position = vec4<f32>(input.worldPosition.xyz, 1.0);
    } else {
        output.normal = vec4<f32>(0.5, 0.5, 0.5, 1.0);
        output.position = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    
    // Apply reflection if enabled (flags.z == 1)
    if (materialData.flags.z == 1) {
         let reflMask = textureSample(reflectionMaskTexture, colorSampler, input.uv);
         let maskSum = dot(reflMask.rgb, vec3<f32>(0.333333));
         
         if (maskSum > 0.2) {
             let viewDir = normalize(frameData.cameraPosition.xyz - input.worldPosition.xyz);
             let r = reflect(-viewDir, input.normal);
             let m = 2.0 * sqrt(dot(r.xy, r.xy) + (r.z + 1.0) * (r.z + 1.0)) + 0.00001;
             let reflUV = r.xy / m + 0.5;
             // Use textureSampleLevel to allow calling inside non-uniform control flow
             let reflColor = textureSampleLevel(reflectionTexture, colorSampler, reflUV, 0.0);
             
             // Blend reflection
             color = mix(color, reflColor * reflMask, materialData.params.x * maskSum);
         }
    }

    // Sample emissive if enabled
    if (materialData.flags.y == 1) {
        output.emissive = textureSample(emissiveTexture, colorSampler, input.uv);
    }
    
    output.color = color + output.emissive;
    
    return output;
}
`;

// Skinned Geometry shader - outputs to G-buffer with GPU skinning
const skinnedGeometryShader = /* wgsl */ `
${FrameDataStruct}
${MaterialDataStruct}

struct SkinnedVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) normal: vec3<f32>,
    ${SkinnedVertexInputAttribs}
}

struct GeomVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) worldPosition: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

struct FragmentOutput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) color: vec4<f32>,
    @location(3) emissive: vec4<f32>,
}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> materialData: MaterialData;
@group(1) @binding(1) var<uniform> matWorld: mat4x4<f32>;
@group(1) @binding(3) var<uniform> uProbeColor: vec3<f32>;
${SkinningUniformBinding}

@group(2) @binding(0) var colorSampler: sampler;
@group(2) @binding(1) var colorTexture: texture_2d<f32>;
@group(2) @binding(2) var emissiveTexture: texture_2d<f32>;
@group(2) @binding(4) var detailTexture: texture_2d<f32>;
@group(2) @binding(5) var reflectionTexture: texture_2d<f32>;
@group(2) @binding(6) var reflectionMaskTexture: texture_2d<f32>;

const MESH: i32 = 1;
const SKYBOX: i32 = 2;

${SkinningCalcFn}

@vertex
fn vs_main(input: SkinnedVertexInput) -> GeomVertexOutput {
    var output: GeomVertexOutput;
    
    let skinMatrix = calcSkinMatrix(input.jointIndices, input.jointWeights);
    
    // Apply skinning to position and normal
    let skinnedPosition = (skinMatrix * vec4<f32>(input.position, 1.0)).xyz;
    let skinnedNormal = (skinMatrix * vec4<f32>(input.normal, 0.0)).xyz;
    
    output.worldPosition = matWorld * vec4<f32>(skinnedPosition, 1.0);
    output.uv = input.uv;
    output.normal = normalize((matWorld * vec4<f32>(skinnedNormal, 0.0)).xyz);
    output.clipPosition = frameData.matViewProj * output.worldPosition;
    return output;
}

@fragment
fn fs_main(input: GeomVertexOutput) -> FragmentOutput {
    var output: FragmentOutput;
    
    // Sample albedo
    var color = textureSample(colorTexture, colorSampler, input.uv);
    if (color.a < 0.5) {
        discard;
    }

    // Apply Probe Color
    color = vec4<f32>(color.rgb * uProbeColor, color.a);

    // Apply Detail Noise
    if (frameData.viewportSize.z > 0.5) {
         let noise = textureSample(detailTexture, colorSampler, input.uv * 4.0).r;
         color = vec4<f32>(color.rgb * (0.9 + 0.2 * noise), color.a);
    }
    
    // Initialize emissive
    output.emissive = vec4<f32>(0.0);
    
    // Skinned meshes don't have lightmaps, always use deferred lighting
    output.normal = vec4<f32>(input.normal * 0.5 + 0.5, 0.0);
    output.position = vec4<f32>(input.worldPosition.xyz, 1.0);
    
    // Apply reflection if enabled (flags.z == 1)
    if (materialData.flags.z == 1) {
         let reflMask = textureSample(reflectionMaskTexture, colorSampler, input.uv);
         let maskSum = dot(reflMask.rgb, vec3<f32>(0.333333));
         
         if (maskSum > 0.2) {
             let viewDir = normalize(frameData.cameraPosition.xyz - input.worldPosition.xyz);
             let r = reflect(-viewDir, input.normal);
             let m = 2.0 * sqrt(dot(r.xy, r.xy) + (r.z + 1.0) * (r.z + 1.0)) + 0.00001;
             let reflUV = r.xy / m + 0.5;
             let reflColor = textureSampleLevel(reflectionTexture, colorSampler, reflUV, 0.0);
             color = mix(color, reflColor * reflMask, materialData.params.x * maskSum);
         }
    }

    // Sample emissive if enabled
    if (materialData.flags.y == 1) {
        output.emissive = textureSample(emissiveTexture, colorSampler, input.uv);
    }
    
    output.color = color + output.emissive;
    
    return output;
}
`;

// Entity shadows shader
const entityShadowsShader = /* wgsl */ `
${FrameDataStruct}

struct ShadowVertexInput {
    @location(0) position: vec3<f32>,
}

${ShadowVertexOutputStruct}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> matWorld: mat4x4<f32>;
@group(1) @binding(1) var<uniform> ambient: vec3<f32>;

@vertex
fn vs_main(input: ShadowVertexInput) -> ShadowVertexOutput {
    var output: ShadowVertexOutput;
    output.clipPosition = frameData.matViewProj * matWorld * vec4<f32>(input.position, 1.0);
    return output;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(ambient, 1.0);
}
`;

// Skinned entity shadows shader
const skinnedEntityShadowsShader = /* wgsl */ `
${FrameDataStruct}

struct SkinnedShadowVertexInput {
    @location(0) position: vec3<f32>,
    ${SkinnedVertexInputAttribs}
}

${ShadowVertexOutputStruct}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> matWorld: mat4x4<f32>;
@group(1) @binding(1) var<uniform> ambient: vec3<f32>;
${SkinningUniformBinding}

${SkinningCalcFn}

@vertex
fn vs_main(input: SkinnedShadowVertexInput) -> ShadowVertexOutput {
    var output: ShadowVertexOutput;
    
    let skinMatrix = calcSkinMatrix(input.jointIndices, input.jointWeights);
    
    // Apply skinning to position
    let skinnedPosition = (skinMatrix * vec4<f32>(input.position, 1.0)).xyz;
    
    output.clipPosition = frameData.matViewProj * matWorld * vec4<f32>(skinnedPosition, 1.0);
    return output;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(ambient, 1.0);
}
`;

// Apply shadows shader (fullscreen)
const applyShadowsShader = /* wgsl */ `
${FrameDataStruct}

struct FSQuadOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var shadowSampler: sampler;
@group(1) @binding(1) var shadowBuffer: texture_2d<f32>;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> FSQuadOutput {
    var output: FSQuadOutput;
    let x = f32((vertexIndex << 1) & 2);
    let y = f32(vertexIndex & 2);
    output.position = vec4<f32>(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
    output.uv = vec2<f32>(x, 1.0 - y);
    return output;
}

@fragment
fn fs_main(input: FSQuadOutput) -> @location(0) vec4<f32> {
    let uv = input.position.xy / frameData.viewportSize.xy;
    return textureSample(shadowBuffer, shadowSampler, uv);
}
`;

// Directional light shader
const directionalLightShader = /* wgsl */ `
${FrameDataStruct}

struct DirectionalLight {
    direction: vec3<f32>,
    _pad1: f32,
    color: vec3<f32>,
    _pad2: f32,
}

struct DirLightOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> directionalLight: DirectionalLight;
@group(1) @binding(2) var normalBuffer: texture_2d<f32>;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> DirLightOutput {
    var output: DirLightOutput;
    let x = f32((vertexIndex << 1) & 2);
    let y = f32(vertexIndex & 2);
    output.position = vec4<f32>(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0 + frameData.viewportSize.x * 0.0000001);
    output.uv = vec2<f32>(x, 1.0 - y);
    return output;
}

@fragment
fn fs_main(input: DirLightOutput) -> @location(0) vec4<f32> {
    let fragCoord = vec2<i32>(input.position.xy);
    let normalData = textureLoad(normalBuffer, fragCoord, 0);
    let normal = normalData.xyz * 2.0 - 1.0;
    let lightmapFlag = normalData.w;
    
    // Skip lightmapped surfaces
    if (lightmapFlag > 0.5) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }
    
    let lightIntensity = directionalLight.color * max(dot(normalize(normal), normalize(directionalLight.direction)), 0.0);
    return vec4<f32>(lightIntensity, 1.0);
}
`;

// Point light shader
const pointLightShader = /* wgsl */ `
${FrameDataStruct}

struct PointLight {
    position: vec3<f32>,
    size: f32,
    color: vec3<f32>,
    intensity: f32,
}

struct PointLightVertexInput {
    @location(0) position: vec3<f32>,
}

struct PointLightVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> matWorld: mat4x4<f32>;
@group(1) @binding(1) var<uniform> pointLight: PointLight;
@group(1) @binding(3) var positionBuffer: texture_2d<f32>;
@group(1) @binding(4) var normalBuffer: texture_2d<f32>;

fn calcPointLight(lightPos: vec3<f32>, lightSize: f32, fragPos: vec3<f32>, normal: vec3<f32>) -> vec2<f32> {
    let lightDir = lightPos - fragPos;
    let distSq = dot(lightDir, lightDir);
    let sizeSq = lightSize * lightSize;
    if (distSq > sizeSq) { return vec2<f32>(0.0); }
    
    let normalizedDist = sqrt(distSq) / lightSize;
    var falloff = 1.0 - smoothstep(0.0, 1.0, normalizedDist);
    falloff = falloff * falloff;
    
    let L = normalize(lightDir);
    let nDotL = max(0.0, dot(normal, L));
    
    return vec2<f32>(falloff * falloff, nDotL);
}

@vertex
fn vs_main(input: PointLightVertexInput) -> PointLightVertexOutput {
    var output: PointLightVertexOutput;
    output.clipPosition = frameData.matViewProj * matWorld * vec4<f32>(input.position, 1.0);
    return output;
}

@fragment
fn fs_main(input: PointLightVertexOutput) -> @location(0) vec4<f32> {
    let fragCoord = vec2<i32>(input.clipPosition.xy);
    
    let position = textureLoad(positionBuffer, fragCoord, 0).rgb;
    let normalData = textureLoad(normalBuffer, fragCoord, 0);
    let normal = normalize(normalData.xyz * 2.0 - 1.0);
    
    let pl = calcPointLight(pointLight.position, pointLight.size, position, normal);
    if (pl.x <= 0.0) { discard; }
    
    return vec4<f32>(pointLight.color * pl.x * pl.y * pointLight.intensity, 1.0);
}
`;

// Spot light shader
const spotLightShader = /* wgsl */ `
${FrameDataStruct}

struct SpotLight {
    position: vec3<f32>,
    cutoff: f32,
    direction: vec3<f32>,
    range: f32,
    color: vec3<f32>,
    intensity: f32,
}

struct SpotLightVertexInput {
    @location(0) position: vec3<f32>,
}

struct SpotLightVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> matWorld: mat4x4<f32>;
@group(1) @binding(1) var<uniform> spotLight: SpotLight;
@group(1) @binding(3) var positionBuffer: texture_2d<f32>;
@group(1) @binding(4) var normalBuffer: texture_2d<f32>;

fn calcSpotLight(lightPos: vec3<f32>, lightDir: vec3<f32>, cutoff: f32, range: f32, fragPos: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
    let toLight = lightPos - fragPos;
    let dist = length(toLight);
    if (dist > range) { return vec3<f32>(0.0); }
    
    let toLightNorm = normalize(toLight);
    let spotEffect = dot(toLightNorm, -normalize(lightDir));
    if (spotEffect < cutoff) { return vec3<f32>(0.0); }
    
    var spotFalloff = (spotEffect - cutoff) / (1.0 - cutoff);
    spotFalloff = smoothstep(0.0, 1.0, spotFalloff);
    
    let attenuation = 1.0 - pow(dist / range, 1.5);
    let nDotL = max(0.0, dot(normal, toLightNorm));
    
    return vec3<f32>(attenuation, spotFalloff, nDotL);
}

@vertex
fn vs_main(input: SpotLightVertexInput) -> SpotLightVertexOutput {
    var output: SpotLightVertexOutput;
    output.clipPosition = frameData.matViewProj * matWorld * vec4<f32>(input.position, 1.0);
    return output;
}

@fragment
fn fs_main(input: SpotLightVertexOutput) -> @location(0) vec4<f32> {
    let fragCoord = vec2<i32>(input.clipPosition.xy);
    
    let position = textureLoad(positionBuffer, fragCoord, 0).rgb;
    let normalData = textureLoad(normalBuffer, fragCoord, 0);
    let normal = normalize(normalData.xyz * 2.0 - 1.0);
    
    let sl = calcSpotLight(spotLight.position, spotLight.direction, spotLight.cutoff, spotLight.range, position, normal);
    if (sl.x <= 0.0) { discard; }
    
    return vec4<f32>(spotLight.color * spotLight.intensity * sl.x * sl.y * sl.z, 1.0);
}
`;

// Kawase blur shader
const kawaseBlurShader = /* wgsl */ `
${FrameDataStruct}

struct BlurParams {
    offset: f32,
    _pad: vec3<f32>,
}

struct BlurOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> blurParams: BlurParams;
@group(1) @binding(1) var colorSampler: sampler;
@group(1) @binding(2) var colorBuffer: texture_2d<f32>;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> BlurOutput {
    var output: BlurOutput;
    let x = f32((vertexIndex << 1) & 2);
    let y = f32(vertexIndex & 2);
    output.position = vec4<f32>(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
    output.uv = vec2<f32>(x, 1.0 - y);
    return output;
}

@fragment
fn fs_main(input: BlurOutput) -> @location(0) vec4<f32> {
    let texelSize = 1.0 / frameData.viewportSize.xy;
    let uv = input.position.xy * texelSize;
    
    let o = blurParams.offset + 0.5;
    
    var color = textureSample(colorBuffer, colorSampler, uv);
    color += textureSample(colorBuffer, colorSampler, uv + vec2<f32>(-o, -o) * texelSize);
    color += textureSample(colorBuffer, colorSampler, uv + vec2<f32>( o, -o) * texelSize);
    color += textureSample(colorBuffer, colorSampler, uv + vec2<f32>(-o,  o) * texelSize);
    color += textureSample(colorBuffer, colorSampler, uv + vec2<f32>( o,  o) * texelSize);
    
    return color * 0.2;
}
`;

// Post-processing shader
const postProcessingShader = /* wgsl */ `
${FrameDataStruct}

struct PostProcessParams {
    gamma: f32,
    emissiveMult: f32,
    ssaoStrength: f32,
    dirtIntensity: f32,
    doFXAA: i32,
    _pad: vec3<f32>,
    ambient: vec3<f32>,
    _pad2: f32,
}

struct PostOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> params: PostProcessParams;
@group(1) @binding(1) var bufferSampler: sampler;
@group(1) @binding(2) var colorBuffer: texture_2d<f32>;
@group(1) @binding(3) var lightBuffer: texture_2d<f32>;
@group(1) @binding(4) var normalBuffer: texture_2d<f32>;
@group(1) @binding(5) var emissiveBuffer: texture_2d<f32>;
@group(1) @binding(6) var dirtBuffer: texture_2d<f32>;
@group(1) @binding(7) var aoBuffer: texture_2d<f32>;

// FXAA constants
const FXAA_EDGE_THRESHOLD_MIN: f32 = 0.0312;
const FXAA_EDGE_THRESHOLD_MAX: f32 = 0.125;

// Luma weights for perceived brightness
const LUMA: vec3<f32> = vec3<f32>(0.299, 0.587, 0.114);

// Simplified FXAA - samples center + 4 neighbors
// Uses textureSampleLevel to allow calling from non-uniform control flow
fn applyFXAA(fragCoord: vec2<f32>) -> vec4<f32> {
    let inverseVP = 1.0 / frameData.viewportSize.xy;
    let uv = fragCoord * inverseVP;
    
    // Sample center and 4 neighbors (use textureSampleLevel for non-uniform control flow)
    let rgbM = textureSampleLevel(colorBuffer, bufferSampler, uv, 0.0).rgb;
    let rgbN = textureSampleLevel(colorBuffer, bufferSampler, uv + vec2<f32>(0.0, -1.0) * inverseVP, 0.0).rgb;
    let rgbS = textureSampleLevel(colorBuffer, bufferSampler, uv + vec2<f32>(0.0, 1.0) * inverseVP, 0.0).rgb;
    let rgbE = textureSampleLevel(colorBuffer, bufferSampler, uv + vec2<f32>(1.0, 0.0) * inverseVP, 0.0).rgb;
    let rgbW = textureSampleLevel(colorBuffer, bufferSampler, uv + vec2<f32>(-1.0, 0.0) * inverseVP, 0.0).rgb;
    
    // Compute luma for each sample
    let lumaM = dot(rgbM, LUMA);
    let lumaN = dot(rgbN, LUMA);
    let lumaS = dot(rgbS, LUMA);
    let lumaE = dot(rgbE, LUMA);
    let lumaW = dot(rgbW, LUMA);
    
    // Compute local contrast
    let lumaMin = min(lumaM, min(min(lumaN, lumaS), min(lumaE, lumaW)));
    let lumaMax = max(lumaM, max(max(lumaN, lumaS), max(lumaE, lumaW)));
    let lumaRange = lumaMax - lumaMin;
    
    // Early exit if contrast is too low
    if (lumaRange < max(FXAA_EDGE_THRESHOLD_MIN, lumaMax * FXAA_EDGE_THRESHOLD_MAX)) {
        return vec4<f32>(rgbM, 1.0);
    }
    
    // Determine edge direction
    let edgeH = abs(lumaN + lumaS - 2.0 * lumaM);
    let edgeV = abs(lumaE + lumaW - 2.0 * lumaM);
    let isHorizontal = edgeH > edgeV;
    
    // Choose blend direction
    var luma1: f32;
    var luma2: f32;
    var stepDir: vec2<f32>;
    
    if (isHorizontal) {
        luma1 = lumaN;
        luma2 = lumaS;
        stepDir = vec2<f32>(0.0, inverseVP.y);
    } else {
        luma1 = lumaW;
        luma2 = lumaE;
        stepDir = vec2<f32>(inverseVP.x, 0.0);
    }
    
    let gradient1 = abs(luma1 - lumaM);
    let gradient2 = abs(luma2 - lumaM);
    
    if (gradient1 < gradient2) {
        stepDir = -stepDir;
    }
    
    // Blend along edge
    let rgbBlend = textureSampleLevel(colorBuffer, bufferSampler, uv + stepDir * 0.5, 0.0).rgb;
    let blendFactor = smoothstep(0.0, 1.0, lumaRange / lumaMax);
    
    return vec4<f32>(mix(rgbM, rgbBlend, blendFactor * 0.5), 1.0);
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> PostOutput {
    var output: PostOutput;
    let x = f32((vertexIndex << 1) & 2);
    let y = f32(vertexIndex & 2);
    output.position = vec4<f32>(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
    output.uv = vec2<f32>(x, 1.0 - y);
    return output;
}

@fragment
fn fs_main(input: PostOutput) -> @location(0) vec4<f32> {
    let uv = input.position.xy / frameData.viewportSize.xy;
    let fragCoord = vec2<i32>(input.position.xy);
    
    // Apply FXAA if enabled, otherwise use direct texture load
    var color: vec4<f32>;
    if (params.doFXAA != 0) {
        color = applyFXAA(input.position.xy);
    } else {
        color = textureLoad(colorBuffer, fragCoord, 0);
    }
    
    let light = textureLoad(lightBuffer, fragCoord, 0);
    let normalData = textureLoad(normalBuffer, fragCoord, 0);
    let emissive = textureLoad(emissiveBuffer, fragCoord, 0);
    let dirt = textureSample(dirtBuffer, bufferSampler, uv);
    let ao = textureLoad(aoBuffer, fragCoord, 0);
    
    let hasLightmap = normalData.w;
    
    // Add dynamic lighting
    let dynamicLight = max(light.rgb - params.ambient, vec3<f32>(0.0));
    var fragColor = vec4<f32>(color.rgb + dynamicLight, color.a);
    
    // Apply SSAO
    let aoFactor = mix(1.0, ao.r, params.ssaoStrength);
    fragColor = vec4<f32>(fragColor.rgb * aoFactor, fragColor.a);
    
    // Add emissive
    fragColor = fragColor + emissive * params.emissiveMult;
    
    // Apply dirt effect with emissive protection
    if (params.dirtIntensity > 0.0) {
        // Protect emissive materials from dirt overlay
        let emissiveStrength = length(emissive.rgb);
        let emissiveMask = 1.0 - clamp(emissiveStrength * 10.0, 0.0, 1.0);
        
        // Invert dirt texture (darker = more dirt) and scale by intensity
        var dirtAmount = (1.0 - dirt.rgb) * params.dirtIntensity;
        dirtAmount = clamp(dirtAmount, vec3<f32>(0.0), vec3<f32>(1.0));
        
        // Apply dirt by darkening
        let dirtened = fragColor.rgb * (1.0 - dirtAmount);
        
        // Mix based on emissive mask (0 = emissive/no dirt, 1 = apply dirt)
        fragColor = vec4<f32>(mix(fragColor.rgb, dirtened, emissiveMask), fragColor.a);
    }
    
    // Gamma correction
    fragColor = vec4<f32>(pow(fragColor.rgb, vec3<f32>(1.0 / params.gamma)), fragColor.a);
    
    return fragColor;
}
`;

// Transparent shader (forward rendered)
const transparentShader = /* wgsl */ `
${FrameDataStruct}
${MaterialDataStruct}

struct LightingData {
    pointLightPositions: array<vec4<f32>, 8>,
    pointLightColors: array<vec4<f32>, 8>,
    pointLightParams: array<vec4<f32>, 8>, // x=intensity, y=size
    spotLightPositions: array<vec4<f32>, 4>,
    spotLightDirections: array<vec4<f32>, 4>,
    spotLightColors: array<vec4<f32>, 4>,
    spotLightParams: array<vec4<f32>, 4>, // x=intensity, y=cutoff, z=range
    counts: vec4<f32>, // x=numPoint, y=numSpot
}

struct TransparentVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) normal: vec3<f32>,
}

struct TransparentVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) worldPosition: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> materialData: MaterialData;
@group(1) @binding(1) var<uniform> matWorld: mat4x4<f32>;
@group(1) @binding(2) var<uniform> lightingData: LightingData;

@group(2) @binding(0) var colorSampler: sampler;
@group(2) @binding(1) var colorTexture: texture_2d<f32>;
@group(2) @binding(2) var emissiveTexture: texture_2d<f32>;
@group(2) @binding(3) var reflectionTexture: texture_2d<f32>;
@group(2) @binding(4) var reflectionMaskTexture: texture_2d<f32>;

@vertex
fn vs_main(input: TransparentVertexInput) -> TransparentVertexOutput {
    var output: TransparentVertexOutput;
    output.worldPosition = matWorld * vec4<f32>(input.position, 1.0);
    output.uv = input.uv;
    output.normal = normalize((matWorld * vec4<f32>(input.normal, 0.0)).xyz);
    output.clipPosition = frameData.matViewProj * output.worldPosition;
    return output;
}

fn calcPointLight(pos: vec3<f32>, size: f32, fragPos: vec3<f32>, normal: vec3<f32>) -> vec2<f32> {
    let lightDir = pos - fragPos;
    let distSq = dot(lightDir, lightDir);
    let sizeSq = size * size;
    
    if (distSq > sizeSq) {
        return vec2<f32>(0.0);
    }
    
    let normalizedDist = sqrt(distSq) / size;
    var falloff = 1.0 - smoothstep(0.0, 1.0, normalizedDist);
    falloff = falloff * falloff;
    
    let L = normalize(lightDir);
    let NdotL = max(dot(normal, L), 0.0);
    
    return vec2<f32>(falloff * falloff, NdotL);
}

fn calcSpotLight(pos: vec3<f32>, dir: vec3<f32>, cutoff: f32, range: f32, fragPos: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
    let toLight = pos - fragPos;
    let dist = length(toLight);
    
    if (dist > range) {
        return vec3<f32>(0.0);
    }
    
    let lightDir = normalize(toLight);
    
    let spotEffect = dot(lightDir, -normalize(dir));
    if (spotEffect < cutoff) {
        return vec3<f32>(0.0);
    }
    
    var spotFalloff = (spotEffect - cutoff) / (1.0 - cutoff);
    spotFalloff = smoothstep(0.0, 1.0, spotFalloff);
    
    let attenuation = 1.0 - pow(dist / range, 1.5);
    
    let NdotL = max(dot(normal, lightDir), 0.0);
    
    return vec3<f32>(attenuation, spotFalloff, NdotL);
}

@fragment
fn fs_main(input: TransparentVertexOutput) -> @location(0) vec4<f32> {
    var baseColor = textureSample(colorTexture, colorSampler, input.uv);
    let emissive = textureSample(emissiveTexture, colorSampler, input.uv);
    
    // Base ambient/emissive
    baseColor = vec4<f32>(baseColor.rgb + emissive.rgb, baseColor.a * materialData.params.y);
    
    let normal = normalize(input.normal);
    let fragPos = input.worldPosition.xyz;
    
    // Reflections (Environment Mapping)
    if (materialData.flags.z == 1) { // doReflection
        let reflMask = textureSample(reflectionMaskTexture, colorSampler, input.uv);
        let maskSum = dot(reflMask.rgb, vec3<f32>(0.333333));
        
        if (maskSum > 0.1) {
            let viewDir = normalize(frameData.cameraPosition.xyz - fragPos);
            let r = reflect(-viewDir, normal);
            let m = 2.0 * sqrt(dot(r.xy, r.xy) + (r.z + 1.0) * (r.z + 1.0)) + 0.00001;
            let reflUV = r.xy / m + 0.5;
            
            // Use textureSampleLevel for non-uniform control flow
            let reflColor = textureSampleLevel(reflectionTexture, colorSampler, reflUV, 0.0);
            
            baseColor = mix(baseColor, reflColor * reflMask, materialData.params.x * maskSum);
        }
    }
    
    // Dynamic Lighting (Additive)
    var dynamicLighting = vec3<f32>(0.0);
    
    // Point Lights
    let numPoint = i32(lightingData.counts.x);
    for (var i = 0; i < 8; i++) {
        if (i >= numPoint) { break; }
        
        let pos = lightingData.pointLightPositions[i].xyz;
        let color = lightingData.pointLightColors[i].rgb;
        let intensity = lightingData.pointLightParams[i].x;
        let size = lightingData.pointLightParams[i].y;
        
        let pl = calcPointLight(pos, size, fragPos, normal);
        dynamicLighting += color * (pl.x * pl.y * intensity);
    }
    
    // Spot Lights
    let numSpot = i32(lightingData.counts.y);
    for (var i = 0; i < 4; i++) {
        if (i >= numSpot) { break; }
        
        let pos = lightingData.spotLightPositions[i].xyz;
        let dir = lightingData.spotLightDirections[i].xyz;
        let color = lightingData.spotLightColors[i].rgb;
        let intensity = lightingData.spotLightParams[i].x;
        let cutoff = lightingData.spotLightParams[i].y;
        let range = lightingData.spotLightParams[i].z;
        
        let sl = calcSpotLight(pos, dir, cutoff, range, fragPos, normal);
        dynamicLighting += color * (intensity * 2.0) * sl.x * sl.y * sl.z;
    }
    
    // Apply lighting
    // Hardcoded ambient approximation (similar to GLSL)
    let finalColor = vec3<f32>(baseColor.rgb * 0.5 + baseColor.rgb * dynamicLighting);
    
    return vec4<f32>(finalColor, baseColor.a);
}
`;

// SSAO shader
const ssaoShader = /* wgsl */ `
${FrameDataStruct}

struct SSAOParams {
    radius: f32,
    bias: f32,
    noiseScale: vec2<f32>,
    kernel: array<vec4<f32>, 16>,  // vec3 + padding
}

struct SSAOOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> params: SSAOParams;
@group(1) @binding(1) var bufferSampler: sampler;
@group(1) @binding(2) var positionBuffer: texture_2d<f32>;
@group(1) @binding(3) var normalBuffer: texture_2d<f32>;
@group(1) @binding(4) var noiseTexture: texture_2d<f32>;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> SSAOOutput {
    var output: SSAOOutput;
    let x = f32((vertexIndex << 1) & 2);
    let y = f32(vertexIndex & 2);
    output.position = vec4<f32>(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
    output.uv = vec2<f32>(x, 1.0 - y);
    return output;
}

@fragment
fn fs_main(input: SSAOOutput) -> @location(0) vec4<f32> {
    let uv = input.position.xy / frameData.viewportSize.xy;
    let fragCoord = vec2<i32>(input.position.xy);
    
    let fragPos = textureLoad(positionBuffer, fragCoord, 0).rgb;
    let normalData = textureLoad(normalBuffer, fragCoord, 0);
    let normal = normalData.xyz * 2.0 - 1.0;
    let hasLightmap = normalData.w;
    
    // Sample noise BEFORE any non-uniform branches (WGSL requirement)
    var randomVec = textureSample(noiseTexture, bufferSampler, uv * params.noiseScale).xyz;
    randomVec = randomVec * 2.0 - 1.0;
    
    // Skip skybox or non-lightmapped - but calculate AO conditionally instead of early return
    let skipAO = length(normal) < 0.1 || hasLightmap < 0.5;
    
    let currentLinearDepth = length(fragPos - frameData.cameraPosition.xyz);
    
    let tangent = normalize(randomVec - normal * dot(randomVec, normal));
    let bitangent = cross(normal, tangent);
    let TBN = mat3x3<f32>(tangent, bitangent, normal);
    
    var occlusion = 0.0;
    
    for (var i = 0; i < 16; i++) {
        var samplePos = TBN * params.kernel[i].xyz;
        samplePos = fragPos + samplePos * params.radius;
        
        var offset = vec4<f32>(samplePos, 1.0);
        offset = frameData.matViewProj * offset;
        let offsetXY = offset.xy / offset.w;
        let sampleUV = offsetXY * 0.5 + 0.5;
        
        // WebGPU: Flip Y when converting from NDC to pixel coords
        // NDC Y=0 maps to bottom of screen, but pixel Y=0 is at top in WebGPU
        let flippedY = 1.0 - sampleUV.y;
        let rawCoord = vec2<i32>(i32(sampleUV.x * frameData.viewportSize.x), i32(flippedY * frameData.viewportSize.y));
        let sampleCoord = clamp(rawCoord, vec2<i32>(0, 0), vec2<i32>(i32(frameData.viewportSize.x) - 1, i32(frameData.viewportSize.y) - 1));
        let sampleWorldPos = textureLoad(positionBuffer, sampleCoord, 0).rgb;
        let sampleLinearDepth = length(sampleWorldPos - frameData.cameraPosition.xyz);
        
        let sampleDist = length(samplePos - frameData.cameraPosition.xyz);
        let rangeCheck = smoothstep(0.0, 1.0, params.radius / abs(currentLinearDepth - sampleLinearDepth));
        
        if (sampleLinearDepth <= sampleDist - params.bias) {
            occlusion += rangeCheck;
        }
    }
    
    occlusion = 1.0 - (occlusion / 16.0);
    
    // Return 1.0 (no AO) for skipped pixels, otherwise return calculated occlusion
    let result = select(occlusion, 1.0, skipAO);
    return vec4<f32>(result, result, result, 1.0);
}
`;

// Debug shader - for wireframes, bounding boxes, light volumes
const debugShader = /* wgsl */ `
${FrameDataStruct}

struct DebugVertexInput {
    @location(0) position: vec3<f32>,
}

${DebugVertexOutputStruct}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> matWorld: mat4x4<f32>;
@group(1) @binding(1) var<uniform> debugColor: vec4<f32>;

@vertex
fn vs_main(input: DebugVertexInput) -> DebugVertexOutput {
    var output: DebugVertexOutput;
    output.clipPosition = frameData.matViewProj * matWorld * vec4<f32>(input.position, 1.0);
    return output;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return debugColor;
}
`;

// Skinned debug shader - for animated wireframes
const skinnedDebugShader = /* wgsl */ `
${FrameDataStruct}

struct SkinnedDebugVertexInput {
    @location(0) position: vec3<f32>,
    ${SkinnedVertexInputAttribs}
}

${DebugVertexOutputStruct}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> matWorld: mat4x4<f32>;
@group(1) @binding(1) var<uniform> debugColor: vec4<f32>;
${SkinningUniformBinding}

${SkinningCalcFn}

@vertex
fn vs_main(input: SkinnedDebugVertexInput) -> DebugVertexOutput {
    var output: DebugVertexOutput;
    
    let skinMatrix = calcSkinMatrix(input.jointIndices, input.jointWeights);
    
    // Apply skinning to position
    let skinnedPosition = (skinMatrix * vec4<f32>(input.position, 1.0)).xyz;
    
    output.clipPosition = frameData.matViewProj * matWorld * vec4<f32>(skinnedPosition, 1.0);
    return output;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return debugColor;
}
`;

// Export shader sources with co-located binding metadata
// This eliminates duplication between shaders and backend binding code
export const WgslShaderSources = {
	geometry: {
		label: "geometry",
		code: geometryShader,
		bindings: {
			group1: [
				{ binding: 0, type: "ubo", id: 1 }, // MaterialData
				{ binding: 1, type: "uniform", name: "matWorld" },
				{ binding: 2, type: "uniform", name: "uProbeColor" },
			],
			group2: [
				{ binding: 0, type: "sampler", unit: 0 },
				{ binding: 1, type: "texture", unit: 0 }, // Albedo
				{ binding: 2, type: "texture", unit: 1 }, // Emissive
				{ binding: 3, type: "texture", unit: 4 }, // Lightmap
				{ binding: 4, type: "texture", unit: 5 }, // Detail Noise
				{ binding: 5, type: "texture", unit: 2 }, // Reflection
				{ binding: 6, type: "texture", unit: 3 }, // Reflection Mask
			],
		},
	},
	skinnedGeometry: {
		label: "skinnedGeometry",
		code: skinnedGeometryShader,
		bindings: {
			group1: [
				{ binding: 0, type: "ubo", id: 1 },
				{ binding: 1, type: "uniform", name: "matWorld" },
				{ binding: 2, type: "uniform", name: "boneMatrices" },
				{ binding: 3, type: "uniform", name: "uProbeColor" },
			],
			group2: [
				{ binding: 0, type: "sampler", unit: 0 },
				{ binding: 1, type: "texture", unit: 0 },
				{ binding: 2, type: "texture", unit: 1 },
				{ binding: 4, type: "texture", unit: 5 },
				{ binding: 5, type: "texture", unit: 2 },
				{ binding: 6, type: "texture", unit: 3 },
			],
		},
	},
	entityShadows: {
		label: "entityShadows",
		code: entityShadowsShader,
		bindings: {
			group1: [
				{ binding: 0, type: "uniform", name: "matWorld" },
				{ binding: 1, type: "uniform", name: "ambient" },
			],
		},
	},
	skinnedEntityShadows: {
		label: "skinnedEntityShadows",
		code: skinnedEntityShadowsShader,
		bindings: {
			group1: [
				{ binding: 0, type: "uniform", name: "matWorld" },
				{ binding: 1, type: "uniform", name: "ambient" },
				{ binding: 2, type: "uniform", name: "boneMatrices" },
			],
		},
	},
	applyShadows: {
		label: "applyShadows",
		code: applyShadowsShader,
		bindings: {
			group1: [
				{ binding: 0, type: "sampler", unit: 2 },
				{ binding: 1, type: "texture", unit: 2 },
			],
		},
	},
	directionalLight: {
		label: "directionalLight",
		code: directionalLightShader,
		bindings: {
			group1: [
				{ binding: 0, type: "uniform", name: "directionalLight" },
				{ binding: 2, type: "texture", unit: 1 },
			],
		},
	},
	pointLight: {
		label: "pointLight",
		code: pointLightShader,
		bindings: {
			group1: [
				{ binding: 0, type: "uniform", name: "matWorld" },
				{ binding: 1, type: "uniform", name: "pointLight" },
				{ binding: 3, type: "texture", unit: 0 },
				{ binding: 4, type: "texture", unit: 1 },
			],
		},
	},
	spotLight: {
		label: "spotLight",
		code: spotLightShader,
		bindings: {
			group1: [
				{ binding: 0, type: "uniform", name: "matWorld" },
				{ binding: 1, type: "uniform", name: "spotLight" },
				{ binding: 3, type: "texture", unit: 0 },
				{ binding: 4, type: "texture", unit: 1 },
			],
		},
	},
	kawaseBlur: {
		label: "kawaseBlur",
		code: kawaseBlurShader,
		bindings: {
			group1: [
				{ binding: 0, type: "uniform", name: "blurParams" },
				{ binding: 1, type: "sampler", unit: 0 },
				{ binding: 2, type: "texture", unit: 0 },
			],
		},
	},
	postProcessing: {
		label: "postProcessing",
		code: postProcessingShader,
		bindings: {
			group1: [
				{ binding: 0, type: "uniform", name: "postProcessParams" },
				{ binding: 1, type: "sampler", unit: 0 },
				{ binding: 2, type: "texture", unit: 0 },
				{ binding: 3, type: "texture", unit: 1 },
				{ binding: 4, type: "texture", unit: 2 },
				{ binding: 5, type: "texture", unit: 3 },
				{ binding: 6, type: "texture", unit: 4 },
				{ binding: 7, type: "texture", unit: 5 },
			],
		},
	},
	transparent: {
		label: "transparent",
		code: transparentShader,
		bindings: {
			group1: [
				{ binding: 0, type: "ubo", id: 1 },
				{ binding: 1, type: "uniform", name: "matWorld" },
				{ binding: 2, type: "ubo", id: 2 },
			],
			group2: [
				{ binding: 0, type: "sampler", unit: 0 },
				{ binding: 1, type: "texture", unit: 0 },
				{ binding: 2, type: "texture", unit: 1 },
				{ binding: 3, type: "texture", unit: 2 },
				{ binding: 4, type: "texture", unit: 3 },
			],
		},
	},
	ssao: {
		label: "ssao",
		code: ssaoShader,
		bindings: {
			group1: [
				{ binding: 0, type: "uniform", name: "ssaoParams" },
				{ binding: 1, type: "sampler", unit: 0 },
				{ binding: 2, type: "texture", unit: 1 },
				{ binding: 3, type: "texture", unit: 0 },
				{ binding: 4, type: "texture", unit: 2 },
			],
		},
	},
	debug: {
		label: "debug",
		code: debugShader,
		bindings: {
			group1: [
				{ binding: 0, type: "uniform", name: "matWorld" },
				{ binding: 1, type: "uniform", name: "debugColor" },
			],
		},
	},
	skinnedDebug: {
		label: "skinnedDebug",
		code: skinnedDebugShader,
		bindings: {
			group1: [
				{ binding: 0, type: "uniform", name: "matWorld" },
				{ binding: 1, type: "uniform", name: "debugColor" },
				{ binding: 2, type: "uniform", name: "boneMatrices" },
			],
		},
	},
};
