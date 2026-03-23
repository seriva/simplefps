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
    viewportSize: vec4<f32>,    // .zw = doProceduralDetail, unused
}
`;

const MaterialDataStruct = /* wgsl */ `
struct MaterialData {
    flags: vec4<i32>,   // type, doEmissive, doReflection, hasLightmap
    params: vec4<f32>,  // reflectionStrength, opacity, pad, pad
}
`;

const ObjectDataStruct = /* wgsl */ `
struct ObjectData {
    matWorld: mat4x4<f32>,
    uProbeColor: vec4<f32>, // .rgb = color, .a = unused/pad
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

// Point light falloff calculation - shared between deferred and forward paths
const PointLightCalcFn = /* wgsl */ `
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
}`;

// Spot light attenuation calculation - shared between deferred and forward paths
const SpotLightCalcFn = /* wgsl */ `
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
}`;

// Sphere-map reflection calculation - shared between geometry/skinned/transparent
const ReflectionCalcFn = /* wgsl */ `
fn applyReflection(baseColor: vec4<f32>, uv: vec2<f32>, worldPos: vec3<f32>, N: vec3<f32>) -> vec4<f32> {
    let reflMask = textureSampleLevel(reflectionMaskTexture, colorSampler, uv, 0.0);
    let maskSum = dot(reflMask.rgb, vec3<f32>(0.333333));
    if (maskSum <= 0.2) { return baseColor; }
    
    let viewDir = normalize(frameData.cameraPosition.xyz - worldPos);
    let r = reflect(-viewDir, N);
    let m = 2.0 * sqrt(dot(r.xy, r.xy) + (r.z + 1.0) * (r.z + 1.0)) + 0.00001;
    let reflUV = r.xy / m + 0.5;
    let reflColor = textureSampleLevel(reflectionTexture, colorSampler, reflUV, 0.0);
    return mix(baseColor, reflColor * reflMask, materialData.params.x * maskSum);
}`;

// Geometry shader - outputs to G-buffer
const geometryShader = /* wgsl */ `
${FrameDataStruct}
${MaterialDataStruct}
${ObjectDataStruct}

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
@group(1) @binding(1) var<uniform> objectData: ObjectData;

@group(2) @binding(0) var colorSampler: sampler;
@group(2) @binding(1) var colorTexture: texture_2d<f32>;
@group(2) @binding(2) var emissiveTexture: texture_2d<f32>;
@group(2) @binding(3) var lightmapTexture: texture_2d<f32>;
@group(2) @binding(4) var proceduralNoise: texture_2d<f32>;
@group(2) @binding(5) var reflectionTexture: texture_2d<f32>;
@group(2) @binding(6) var reflectionMaskTexture: texture_2d<f32>;
@group(2) @binding(7) var lightmapSampler: sampler;

const MESH: i32 = 1;
const SKYBOX: i32 = 2;

@vertex
fn vs_main(input: GeomVertexInput) -> GeomVertexOutput {
    var output: GeomVertexOutput;
    output.worldPosition = objectData.matWorld * vec4<f32>(input.position, 1.0);
    output.uv = input.uv;
    output.lightmapUV = input.lightmapUV;
    output.normal = normalize((objectData.matWorld * vec4<f32>(input.normal, 0.0)).xyz);
    output.clipPosition = frameData.matViewProj * output.worldPosition;
    return output;
}

${ReflectionCalcFn}

@fragment
fn fs_main(input: GeomVertexOutput) -> FragmentOutput {
    var output: FragmentOutput;
    
    // Sample albedo
    var color = textureSample(colorTexture, colorSampler, input.uv);
    if (color.a < 0.5) {
        discard;
    }
    
    var N = normalize(input.normal);
    
    // Apply Probe Color for dynamic objects (no lightmap)
    // Static objects (lightmapFlag == 1) ignore this as they use texture mixing below
    // Skybox (flag x == SKYBOX) should also ignore this
    if (materialData.flags.w == 0 && materialData.flags.x != SKYBOX) {
        color = vec4<f32>(color.rgb * objectData.uProbeColor.rgb, color.a);
    }
    
    // Apply lightmap if available and not skybox
    if (materialData.flags.w == 1 && materialData.flags.x != SKYBOX) {
        color = color * textureSample(lightmapTexture, lightmapSampler, input.lightmapUV);
    }

    // Apply Detail Texture (Normal + Parallax)
    if (materialData.flags.x != SKYBOX && frameData.viewportSize.z > 0.5 && materialData.flags.w == 1) {
         let dist = distance(frameData.cameraPosition.xyz, input.worldPosition.xyz);
         let detailFade = 1.0 - smoothstep(100.0, 500.0, dist);
         
         // Calculate TBN (Must be done in uniform control flow)
         let dp1 = dpdx(input.worldPosition.xyz);
         let dp2 = dpdy(input.worldPosition.xyz);
         let duv1 = dpdx(input.uv);
         let duv2 = dpdy(input.uv);

         if (detailFade > 0.01) {
             let dp2perp = cross(dp2, N);
             let dp1perp = cross(N, dp1);
             let T = dp2perp * duv1.x + dp1perp * duv2.x;
             let B = dp2perp * duv1.y + dp1perp * duv2.y;
             let invmax = inverseSqrt(max(dot(T,T), dot(B,B)));
             let TBN = mat3x3<f32>(T * invmax, B * invmax, N);
             
             // Parallax Mapping - Dual Layer
             let viewDir = normalize(frameData.cameraPosition.xyz - input.worldPosition.xyz);
             let tangentViewDir = normalize(transpose(TBN) * viewDir);
             
             let uv1 = input.uv * 4.0;
             // Rotated second layer (~34 deg)
             let rot = mat2x2<f32>(0.829, 0.559, -0.559, 0.829); 
             let uv2 = (rot * (input.uv * 7.37)) + vec2<f32>(0.43, 0.81);
             
             let h1 = textureSampleLevel(proceduralNoise, colorSampler, uv1, 0.0).a;
             let parallaxOffset = tangentViewDir.xy * (h1 * 0.02 * detailFade);
             
             // Sample both layers with offset
             let s1 = textureSampleLevel(proceduralNoise, colorSampler, uv1 - parallaxOffset, 0.0);
             let s2 = textureSampleLevel(proceduralNoise, colorSampler, uv2 - parallaxOffset, 0.0);
             
             // Blend Normals & Height
             let detailNormal = normalize((s1.rgb * 2.0 - 1.0) + (s2.rgb * 2.0 - 1.0));
             let height = (s1.a + s2.a) * 0.5;
             let surfaceNormal = normalize(TBN * detailNormal);
             
             // Modulation: Sum of Sines
             let p = input.worldPosition;
             let macroVar = (sin(p.x * 0.13 + p.z * 0.07) + sin(p.z * 0.11 - p.x * 0.05) + sin(p.y * 0.1));
             let macroFactor = (macroVar / 3.0) * 0.5 + 0.5;
             
             // Combine Occlusion (Slope + Height)
             let occlusion = clamp(dot(surfaceNormal, N), 0.5, 1.0) * mix(0.5, 1.0, height);
             let modFactor = detailFade * (0.3 + 0.7 * macroFactor);
             
             color = vec4<f32>(color.rgb * mix(1.0, occlusion, modFactor), color.a);
             N = normalize(mix(N, surfaceNormal, 0.5 * detailFade));
         }
    }
    
    // Initialize emissive
    output.emissive = vec4<f32>(0.0);
    
    if (materialData.flags.x != SKYBOX) {
        let lightmapFlag = f32(materialData.flags.w);
        output.normal = vec4<f32>(N * 0.5 + 0.5, lightmapFlag);
        output.position = vec4<f32>(input.worldPosition.xyz, 1.0);
    } else {
        output.normal = vec4<f32>(0.5, 0.5, 0.5, 1.0);
        output.position = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    
    // Apply reflection if enabled (flags.z == 1)
    if (materialData.flags.z == 1) {
         color = applyReflection(color, input.uv, input.worldPosition.xyz, N);
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
${ObjectDataStruct}

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
@group(1) @binding(1) var<uniform> objectData: ObjectData;
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
${ReflectionCalcFn}

@vertex
fn vs_main(input: SkinnedVertexInput) -> GeomVertexOutput {
    var output: GeomVertexOutput;
    
    let skinMatrix = calcSkinMatrix(input.jointIndices, input.jointWeights);
    
    // Apply skinning to position and normal
    let skinnedPosition = (skinMatrix * vec4<f32>(input.position, 1.0)).xyz;
    let skinnedNormal = (skinMatrix * vec4<f32>(input.normal, 0.0)).xyz;
    
    output.worldPosition = objectData.matWorld * vec4<f32>(skinnedPosition, 1.0);
    output.uv = input.uv;
    output.normal = normalize((objectData.matWorld * vec4<f32>(skinnedNormal, 0.0)).xyz);
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
    color = vec4<f32>(color.rgb * objectData.uProbeColor.rgb, color.a);

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
         color = applyReflection(color, input.uv, input.worldPosition.xyz, input.normal);
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
${ObjectDataStruct}

struct ShadowVertexInput {
    @location(0) position: vec3<f32>,
}

${ShadowVertexOutputStruct}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> objectData: ObjectData;

@vertex
fn vs_main(input: ShadowVertexInput) -> ShadowVertexOutput {
    var output: ShadowVertexOutput;
    output.clipPosition = frameData.matViewProj * objectData.matWorld * vec4<f32>(input.position, 1.0);
    return output;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(objectData.uProbeColor.rgb, 1.0);
}
`;

// Skinned entity shadows shader
const skinnedEntityShadowsShader = /* wgsl */ `
${FrameDataStruct}
${ObjectDataStruct}

struct SkinnedShadowVertexInput {
    @location(0) position: vec3<f32>,
    ${SkinnedVertexInputAttribs}
}

${ShadowVertexOutputStruct}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> objectData: ObjectData;
${SkinningUniformBinding}

${SkinningCalcFn}

@vertex
fn vs_main(input: SkinnedShadowVertexInput) -> ShadowVertexOutput {
    var output: ShadowVertexOutput;
    
    let skinMatrix = calcSkinMatrix(input.jointIndices, input.jointWeights);
    
    // Apply skinning to position
    let skinnedPosition = (skinMatrix * vec4<f32>(input.position, 1.0)).xyz;
    
    // Transform to world space
    var worldPos = objectData.matWorld * vec4<f32>(skinnedPosition, 1.0);
    
    output.clipPosition = frameData.matViewProj * worldPos;
    return output;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(objectData.uProbeColor.rgb, 1.0);
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
@group(1) @binding(2) var<uniform> directionalLight: DirectionalLight;
@group(1) @binding(3) var normalBuffer: texture_2d<f32>;

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
${ObjectDataStruct}

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
@group(1) @binding(1) var<uniform> objectData: ObjectData;
@group(1) @binding(2) var<uniform> pointLight: PointLight;
@group(1) @binding(3) var positionBuffer: texture_2d<f32>;
@group(1) @binding(4) var normalBuffer: texture_2d<f32>;

${PointLightCalcFn}

@vertex
fn vs_main(input: PointLightVertexInput) -> PointLightVertexOutput {
    var output: PointLightVertexOutput;
    output.clipPosition = frameData.matViewProj * objectData.matWorld * vec4<f32>(input.position, 1.0);
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
${ObjectDataStruct}

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
@group(1) @binding(1) var<uniform> objectData: ObjectData;
@group(1) @binding(2) var<uniform> spotLight: SpotLight;
@group(1) @binding(3) var positionBuffer: texture_2d<f32>;
@group(1) @binding(4) var normalBuffer: texture_2d<f32>;

${SpotLightCalcFn}

@vertex
fn vs_main(input: SpotLightVertexInput) -> SpotLightVertexOutput {
    var output: SpotLightVertexOutput;
    output.clipPosition = frameData.matViewProj * objectData.matWorld * vec4<f32>(input.position, 1.0);
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

// Bilateral blur shader for edge-aware SSAO blurring
const bilateralBlurShader = /* wgsl */ `
${FrameDataStruct}

struct BilateralParams {
    depthThreshold: f32,
    normalThreshold: f32,
    gBufferScale: f32,
    _pad: f32,
}

struct BilateralOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> params: BilateralParams;
@group(1) @binding(2) var aoBuffer: texture_2d<f32>;
@group(1) @binding(3) var positionBuffer: texture_2d<f32>;
@group(1) @binding(4) var normalBuffer: texture_2d<f32>;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> BilateralOutput {
    var output: BilateralOutput;
    let x = f32((vertexIndex << 1) & 2);
    let y = f32(vertexIndex & 2);
    output.position = vec4<f32>(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
    output.uv = vec2<f32>(x, 1.0 - y);
    return output;
}

@fragment
fn fs_main(input: BilateralOutput) -> @location(0) vec4<f32> {
    let fragCoord = vec2<i32>(input.position.xy);
    let texelSize = 1.0 / frameData.viewportSize.xy;
    
    // Get center pixel data
    let centerAO = textureLoad(aoBuffer, fragCoord, 0).r;
    
    // Calculate G-buffer coordinates (full res)
    let gBufferCoord = vec2<i32>(input.position.xy * params.gBufferScale);
    
    let centerPos = textureLoad(positionBuffer, gBufferCoord, 0).xyz;
    let centerNormal = textureLoad(normalBuffer, gBufferCoord, 0).xyz * 2.0 - 1.0;
    let centerDepth = length(centerPos - frameData.cameraPosition.xyz);
    
    // If center is sky or invalid, just return the center value
    if (length(centerNormal) < 0.1) {
        return vec4<f32>(centerAO, centerAO, centerAO, 1.0);
    }
    
    var totalWeight = 1.0;
    var totalAO = centerAO;
    
    // Sample in a 5x5 pattern with bilateral weights
    for (var y = -2; y <= 2; y++) {
        for (var x = -2; x <= 2; x++) {
            if (x == 0 && y == 0) { continue; }
            
            let sampleCoord = fragCoord + vec2<i32>(x, y);
            
            // Bounds check (against half-res effective size)
            // viewportSize is full-res (e.g. 1920).
            // We are rendering to a half-res target (e.g. 960).
            // So valid range is 0..960.
            // gBufferScale is 2.0. So 1920 / 2.0 = 960.
            if (sampleCoord.x < 0 || sampleCoord.y < 0 || 
                f32(sampleCoord.x) >= frameData.viewportSize.x / params.gBufferScale || 
                f32(sampleCoord.y) >= frameData.viewportSize.y / params.gBufferScale) {
                continue;
            }
            
            let sampleAO = textureLoad(aoBuffer, sampleCoord, 0).r;
            
            // Sample G-Buffer at full res
            let gSampleCoord = vec2<i32>(vec2<f32>(sampleCoord) * params.gBufferScale);
            
            let samplePos = textureLoad(positionBuffer, gSampleCoord, 0).xyz;
            let sampleNormal = textureLoad(normalBuffer, gSampleCoord, 0).xyz * 2.0 - 1.0;
            let sampleDepth = length(samplePos - frameData.cameraPosition.xyz);
            
            // Skip invalid samples (sky)
            if (length(sampleNormal) < 0.1) { continue; }
            
            // Spatial weight (Gaussian falloff)
            let dist = length(vec2<f32>(f32(x), f32(y)));
            let spatialWeight = exp(-dist * dist / 4.0);
            
            // Depth weight - reject samples across depth discontinuities
            let depthDiff = abs(centerDepth - sampleDepth);
            let depthWeight = exp(-depthDiff * depthDiff / (params.depthThreshold * params.depthThreshold));
            
            // Normal weight - reject samples with different normals
            let normalDot = max(0.0, dot(centerNormal, sampleNormal));
            let normalWeight = pow(normalDot, params.normalThreshold);
            
            // Combined weight
            let weight = spatialWeight * depthWeight * normalWeight;
            
            totalAO += sampleAO * weight;
            totalWeight += weight;
        }
    }
    
    let result = totalAO / totalWeight;
    return vec4<f32>(result, result, result, 1.0);
}
`;

// Post-processing shader
const postProcessingShader = /* wgsl */ `
struct PostProcessParams {
    gamma: f32,
    emissiveMult: f32,
    ssaoStrength: f32,
    dirtIntensity: f32,
    shadowIntensity: f32,
    _pad: f32,
    ambient: vec4<f32>,
}

struct PostOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(1) @binding(0) var<uniform> params: PostProcessParams;
@group(1) @binding(1) var bufferSampler: sampler;
@group(1) @binding(2) var colorBuffer: texture_2d<f32>;
@group(1) @binding(3) var lightBuffer: texture_2d<f32>;
@group(1) @binding(4) var normalBuffer: texture_2d<f32>;
@group(1) @binding(5) var emissiveBuffer: texture_2d<f32>;
@group(1) @binding(6) var dirtBuffer: texture_2d<f32>;
@group(1) @binding(7) var aoBuffer: texture_2d<f32>;
@group(1) @binding(8) var shadowBuffer: texture_2d<f32>;
@group(1) @binding(9) var positionBuffer: texture_2d<f32>;

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
    // uv is in [0, 1] range
    let uv = input.uv;
    let fragCoord = vec2<i32>(input.position.xy);
    
    // Direct texture load for color (no FXAA)
    let color = textureLoad(colorBuffer, fragCoord, 0);
    
    let light = textureLoad(lightBuffer, fragCoord, 0);
    let normalData = textureLoad(normalBuffer, fragCoord, 0);
    let emissive = textureLoad(emissiveBuffer, fragCoord, 0);
    let dirt = textureSample(dirtBuffer, bufferSampler, uv);
    // Sample AO with linear filtering (textureSample instead of textureLoad) to smoothly upscale from half-res
    let ao = textureSample(aoBuffer, bufferSampler, uv);
    
    let hasLightmap = normalData.w;
    
    // Add dynamic lighting
    let dynamicLight = max(light.rgb - params.ambient.xyz, vec3<f32>(0.0));
    var fragColor = vec4<f32>(color.rgb + dynamicLight, color.a);

    // Apply shadows - multiply by shadow buffer
    // Skip shadows for sky (position.w == 0)
    let position = textureLoad(positionBuffer, fragCoord, 0);
    let shadow = textureLoad(shadowBuffer, fragCoord, 0).rgb;
    if (position.w > 0.0) {
        // Soften shadows - mix between full brightness and shadow value
        let softShadow = mix(vec3<f32>(1.0), shadow, params.shadowIntensity);
        fragColor = vec4<f32>(fragColor.rgb * softShadow, fragColor.a);
    }
    
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

// FSR 1.0 EASU shader
const fsrEasuShader = /* wgsl */ `
struct EasuParams {
    con0: vec4<f32>, // xy = inputSize, zw = outputSize
    con1: vec4<f32>,
    con2: vec4<f32>,
    con3: vec4<f32>,
}

struct PostOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(1) @binding(0) var<uniform> params: EasuParams;
@group(1) @binding(1) var bufferSampler: sampler;
@group(1) @binding(2) var colorBuffer: texture_2d<f32>;

// Anisotropic Lanczos-like weight: positive only, stretched perpendicular to edge
fn easuWeight(sampleOff: vec2<f32>, dir: vec2<f32>, stretch: f32) -> f32 {
    let along = abs(sampleOff.x * dir.x + sampleOff.y * dir.y);
    let perp  = abs(sampleOff.x * dir.y - sampleOff.y * dir.x);
    let d2 = along * along + perp * perp * stretch * stretch;
    let w = max(1.0 - d2 * 0.25, 0.0);
    return w * w;
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
    let inputSize = params.con0.xy;
    let outputSize = params.con0.zw;
    let invInput = 1.0 / inputSize;

    let srcPos = input.position.xy * inputSize / outputSize - 0.5;
    let base = floor(srcPos);
    let f = srcPos - base;
    let tc = (base + 0.5) * invInput;
    let dx = vec2<f32>(invInput.x, 0.0);
    let dy = vec2<f32>(0.0, invInput.y);

    //   b c
    // d e f g
    // h i j k
    //   l m
    let b  = textureSampleLevel(colorBuffer, bufferSampler, tc - dy, 0.0).rgb;
    let c  = textureSampleLevel(colorBuffer, bufferSampler, tc + dx - dy, 0.0).rgb;
    let d  = textureSampleLevel(colorBuffer, bufferSampler, tc - dx, 0.0).rgb;
    let e  = textureSampleLevel(colorBuffer, bufferSampler, tc, 0.0).rgb;
    let fS = textureSampleLevel(colorBuffer, bufferSampler, tc + dx, 0.0).rgb;
    let g  = textureSampleLevel(colorBuffer, bufferSampler, tc + 2.0 * dx, 0.0).rgb;
    let h  = textureSampleLevel(colorBuffer, bufferSampler, tc - dx + dy, 0.0).rgb;
    let iS = textureSampleLevel(colorBuffer, bufferSampler, tc + dy, 0.0).rgb;
    let j  = textureSampleLevel(colorBuffer, bufferSampler, tc + dx + dy, 0.0).rgb;
    let k  = textureSampleLevel(colorBuffer, bufferSampler, tc + 2.0 * dx + dy, 0.0).rgb;
    let l  = textureSampleLevel(colorBuffer, bufferSampler, tc + 2.0 * dy, 0.0).rgb;
    let m  = textureSampleLevel(colorBuffer, bufferSampler, tc + dx + 2.0 * dy, 0.0).rgb;

    let luma = vec3<f32>(0.299, 0.587, 0.114);
    let le = dot(e, luma);  let lf = dot(fS, luma);
    let li = dot(iS, luma); let lj = dot(j, luma);
    let lb = dot(b, luma);  let lc = dot(c, luma);
    let ld = dot(d, luma);  let lg = dot(g, luma);
    let lh = dot(h, luma);  let lk = dot(k, luma);
    let ll = dot(l, luma);  let lm = dot(m, luma);

    // Edge direction from full 12-tap neighborhood
    let dirX = (lc-lb) + (lf-le) + (lj-li) + (lm-ll) + (lg-ld) + (lk-lh);
    let dirY = (lh-ld) + (li-le) + (lj-lf) + (lk-lg) + (ll-lb) + (lm-lc);
    let dirLen = max(abs(dirX), abs(dirY));
    let invDirLen = 1.0 / (dirLen + 1.0e-8);
    let dir = vec2<f32>(dirX * invDirLen, dirY * invDirLen);

    // Stretch: anisotropy from local edge contrast
    let minEdge = min(min(le, lf), min(li, lj));
    let maxEdge = max(max(le, lf), max(li, lj));
    let edgeAmount = clamp((maxEdge - minEdge) / max(maxEdge, 1.0e-5), 0.0, 1.0);
    let stretch = 1.0 + edgeAmount * 1.0;

    // Positive-only anisotropic weights for all 12 taps
    let we  = easuWeight(vec2<f32>( 0.0,  0.0) - f, dir, stretch);
    let wfS = easuWeight(vec2<f32>( 1.0,  0.0) - f, dir, stretch);
    let wiS = easuWeight(vec2<f32>( 0.0,  1.0) - f, dir, stretch);
    let wj  = easuWeight(vec2<f32>( 1.0,  1.0) - f, dir, stretch);
    let wb  = easuWeight(vec2<f32>( 0.0, -1.0) - f, dir, stretch);
    let wc  = easuWeight(vec2<f32>( 1.0, -1.0) - f, dir, stretch);
    let wd  = easuWeight(vec2<f32>(-1.0,  0.0) - f, dir, stretch);
    let wg  = easuWeight(vec2<f32>( 2.0,  0.0) - f, dir, stretch);
    let wh  = easuWeight(vec2<f32>(-1.0,  1.0) - f, dir, stretch);
    let wk  = easuWeight(vec2<f32>( 2.0,  1.0) - f, dir, stretch);
    let wl  = easuWeight(vec2<f32>( 0.0,  2.0) - f, dir, stretch);
    let wm  = easuWeight(vec2<f32>( 1.0,  2.0) - f, dir, stretch);

    let color = e*we + fS*wfS + iS*wiS + j*wj
              + b*wb + c*wc + d*wd + g*wg
              + h*wh + k*wk + l*wl + m*wm;
    let totalW = we+wfS+wiS+wj+wb+wc+wd+wg+wh+wk+wl+wm;

    return vec4<f32>(color / totalW, 1.0);
}
`;

// FSR 1.0 RCAS shader
const fsrRcasShader = /* wgsl */ `
struct RcasParams {
    sharpness: f32,
    _pad: vec3<f32>,
}

struct PostOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(1) @binding(0) var<uniform> params: RcasParams;
@group(1) @binding(2) var colorBuffer: texture_2d<f32>;

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
    let p = vec2<i32>(input.position.xy);

    let b = textureLoad(colorBuffer, p + vec2<i32>(0, -1), 0).rgb;
    let d = textureLoad(colorBuffer, p + vec2<i32>(-1, 0), 0).rgb;
    let e = textureLoad(colorBuffer, p, 0).rgb;
    let f = textureLoad(colorBuffer, p + vec2<i32>(1, 0), 0).rgb;
    let h = textureLoad(colorBuffer, p + vec2<i32>(0, 1), 0).rgb;

    // Luma (green-weighted, matching AMD FSR reference)
    let bL = b.g * 0.5 + (b.r + b.b) * 0.25;
    let dL = d.g * 0.5 + (d.r + d.b) * 0.25;
    let eL = e.g * 0.5 + (e.r + e.b) * 0.25;
    let fL = f.g * 0.5 + (f.r + f.b) * 0.25;
    let hL = h.g * 0.5 + (h.r + h.b) * 0.25;

    // Noise detection: suppress sharpening on noisy pixels
    let nz = 0.25 * (bL + dL + fL + hL) - eL;
    let rangeL = max(max(bL, dL), max(eL, max(fL, hL)))
               - min(min(bL, dL), min(eL, min(fL, hL)));
    let nzC = clamp(abs(nz) / max(rangeL, 1e-6), 0.0, 1.0);
    let nzW = -0.5 * nzC + 1.0;

    // Per-channel min/max of the 4-tap cross
    let mn4 = min(min(b, d), min(f, h));
    let mx4 = max(max(b, d), max(f, h));

    // peakC controls maximum sharpening from user setting
    let peakC = 1.0 / (-4.0 * params.sharpness + 8.0);

    // Adaptive per-pixel limiters (per-channel)
    let hitMinR = min(mn4.r, e.r) / (4.0 * max(mx4.r, e.r) + 1e-6);
    let hitMinG = min(mn4.g, e.g) / (4.0 * max(mx4.g, e.g) + 1e-6);
    let hitMinB = min(mn4.b, e.b) / (4.0 * max(mx4.b, e.b) + 1e-6);
    let hitMaxR = (peakC - max(mx4.r, e.r)) / (4.0 * min(mn4.r, e.r) + peakC);
    let hitMaxG = (peakC - max(mx4.g, e.g)) / (4.0 * min(mn4.g, e.g) + peakC);
    let hitMaxB = (peakC - max(mx4.b, e.b)) / (4.0 * min(mn4.b, e.b) + peakC);

    let lobeR = max(-hitMinR, hitMaxR);
    let lobeG = max(-hitMinG, hitMaxG);
    let lobeB = max(-hitMinB, hitMaxB);

    // Most conservative lobe across channels, clamped to non-positive
    var lobe = max(-peakC, min(max(lobeR, max(lobeG, lobeB)), 0.0));
    lobe *= nzW;

    var color = (b + d + f + h) * lobe + e;
    color = color / (4.0 * lobe + 1.0);

    return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

// Transparent shader (forward rendered)
const transparentShader = /* wgsl */ `
${FrameDataStruct}
${MaterialDataStruct}
${ObjectDataStruct}

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
@group(1) @binding(1) var<uniform> objectData: ObjectData;
@group(1) @binding(2) var<uniform> lightingData: LightingData;

@group(2) @binding(0) var colorSampler: sampler;
@group(2) @binding(1) var colorTexture: texture_2d<f32>;
@group(2) @binding(2) var emissiveTexture: texture_2d<f32>;
@group(2) @binding(3) var reflectionTexture: texture_2d<f32>;
@group(2) @binding(4) var reflectionMaskTexture: texture_2d<f32>;

@vertex
fn vs_main(input: TransparentVertexInput) -> TransparentVertexOutput {
    var output: TransparentVertexOutput;
    output.worldPosition = objectData.matWorld * vec4<f32>(input.position, 1.0);
    output.uv = input.uv;
    output.normal = normalize((objectData.matWorld * vec4<f32>(input.normal, 0.0)).xyz);
    output.clipPosition = frameData.matViewProj * output.worldPosition;
    return output;
}

${PointLightCalcFn}
${SpotLightCalcFn}

@fragment
fn fs_main(input: TransparentVertexOutput) -> @location(0) vec4<f32> {
    var baseColor = textureSample(colorTexture, colorSampler, input.uv);
    let emissive = textureSample(emissiveTexture, colorSampler, input.uv);
    
    // Base ambient/emissive
    baseColor = vec4<f32>(baseColor.rgb + emissive.rgb, baseColor.a * materialData.params.y);
    
    let normal = normalize(input.normal);
    let fragPos = input.worldPosition.xyz;
    
    // Reflections (Environment Mapping)
    if (materialData.flags.z == 1) {
        let reflMask = textureSample(reflectionMaskTexture, colorSampler, input.uv);
        let maskSum = dot(reflMask.rgb, vec3<f32>(0.333333));
        
        if (maskSum > 0.1) {
            let viewDir = normalize(frameData.cameraPosition.xyz - fragPos);
            let r = reflect(-viewDir, normal);
            let m = 2.0 * sqrt(dot(r.xy, r.xy) + (r.z + 1.0) * (r.z + 1.0)) + 0.00001;
            let reflUV = r.xy / m + 0.5;
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
    gBufferScale: f32,
    _pad: vec3<f32>,
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
    // Calculate UVs based on effective viewport size (which is scaled down by gBufferScale = 2.0)
    // input.position.xy is in pixels (half-res).
    // viewportSize is full-res.
    // UV = (fragCoord * scale) / viewportSize
    let uv = (input.position.xy * params.gBufferScale) / frameData.viewportSize.xy;
    let fragCoord = vec2<i32>(input.position.xy);
    
    // Scale for G-buffer reads (full res)
    let gCoord = vec2<i32>(input.position.xy * params.gBufferScale);
    
    let fragPos = textureLoad(positionBuffer, gCoord, 0).rgb;
    let normalData = textureLoad(normalBuffer, gCoord, 0);
    let normal = normalData.xyz * 2.0 - 1.0;
    let hasLightmap = normalData.w;
    
    // Sample noise BEFORE any non-uniform branches (WGSL requirement)
    var randomVec = textureSample(noiseTexture, bufferSampler, uv * params.noiseScale).xyz;
    randomVec = randomVec * 2.0 - 1.0;
    
    // Skip skybox and dynamic objects (no lightmap) — early out
    let isSkybox = length(normal) < 0.1;
    if (isSkybox || hasLightmap < 0.5) {
        return vec4<f32>(1.0, 1.0, 1.0, 1.0);
    }
    
    let currentLinearDepth = length(fragPos - frameData.cameraPosition.xyz);
    
    let tangent = normalize(randomVec - normal * dot(randomVec, normal));
    let bitangent = cross(normal, tangent);
    let TBN = mat3x3<f32>(tangent, bitangent, normal);
    
    var occlusion = 0.0;
    var validSamples = 0.0;
    
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
        
        // Scale to full-res viewport size for sample lookup
        // frameData.viewportSize is already full resolution (canvas size).
        // So we don't need to scale it.
        let fullWidth = frameData.viewportSize.x;
        let fullHeight = frameData.viewportSize.y;
        
        let rawCoord = vec2<i32>(i32(sampleUV.x * fullWidth), i32(flippedY * fullHeight));
        let sampleCoord = clamp(rawCoord, vec2<i32>(0, 0), vec2<i32>(i32(fullWidth) - 1, i32(fullHeight) - 1));
        
        // Check if sample crosses static/dynamic boundary - reject if so
        let sampleNormalData = textureLoad(normalBuffer, sampleCoord, 0);
        let sampleHasLightmap = sampleNormalData.w;
        
        // Skip samples that cross the lightmap boundary (static <-> dynamic)
        // This prevents floor from getting false occlusion from pickups
        if ((hasLightmap > 0.5 && sampleHasLightmap < 0.5) || (hasLightmap < 0.5 && sampleHasLightmap > 0.5)) {
            continue;
        }
        
        validSamples += 1.0;
        
        let sampleWorldPos = textureLoad(positionBuffer, sampleCoord, 0).rgb;
        let sampleLinearDepth = length(sampleWorldPos - frameData.cameraPosition.xyz);
        
        let sampleDist = length(samplePos - frameData.cameraPosition.xyz);
        let rangeCheck = smoothstep(0.0, 1.0, params.radius / abs(currentLinearDepth - sampleLinearDepth));
        
        if (sampleLinearDepth <= sampleDist - params.bias) {
            occlusion += rangeCheck;
        }
    }
    
    // Divide by actual valid samples to avoid flickering when many samples are rejected
    // Use max to avoid division by zero
    occlusion = 1.0 - (occlusion / max(validSamples, 1.0));
    
    return vec4<f32>(occlusion, occlusion, occlusion, 1.0);
}
`;

// Debug shader - for wireframes, bounding boxes, light volumes
const debugShader = /* wgsl */ `
${FrameDataStruct}
${ObjectDataStruct}

struct DebugVertexInput {
    @location(0) position: vec3<f32>,
}

${DebugVertexOutputStruct}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(1) var<uniform> objectData: ObjectData;
@group(1) @binding(2) var<uniform> debugColor: vec4<f32>;

@vertex
fn vs_main(input: DebugVertexInput) -> DebugVertexOutput {
    var output: DebugVertexOutput;
    output.clipPosition = frameData.matViewProj * objectData.matWorld * vec4<f32>(input.position, 1.0);
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
${ObjectDataStruct}

struct SkinnedDebugVertexInput {
    @location(0) position: vec3<f32>,
    ${SkinnedVertexInputAttribs}
}

${DebugVertexOutputStruct}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(1) var<uniform> objectData: ObjectData;
@group(1) @binding(2) var<uniform> debugColor: vec4<f32>;
${SkinningUniformBinding}

${SkinningCalcFn}

@vertex
fn vs_main(input: SkinnedDebugVertexInput) -> DebugVertexOutput {
    var output: DebugVertexOutput;
    
    let skinMatrix = calcSkinMatrix(input.jointIndices, input.jointWeights);
    
    // Apply skinning to position
    let skinnedPosition = (skinMatrix * vec4<f32>(input.position, 1.0)).xyz;
    
    output.clipPosition = frameData.matViewProj * objectData.matWorld * vec4<f32>(skinnedPosition, 1.0);
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
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 0, type: "ubo", id: 1 }, // MaterialData
				{ binding: 1, type: "uniform", name: "objectData" },
			],
			group2: [
				{ binding: 0, type: "sampler", unit: 0 },
				{ binding: 1, type: "texture", unit: 0 }, // Albedo
				{ binding: 2, type: "texture", unit: 1 }, // Emissive
				{ binding: 3, type: "texture", unit: 4 }, // Lightmap
				{ binding: 4, type: "texture", unit: 5 }, // Detail Noise
				{ binding: 5, type: "texture", unit: 2 }, // Reflection
				{ binding: 6, type: "texture", unit: 3 }, // Reflection Mask
				{ binding: 7, type: "sampler", unit: 4 }, // lightmapSampler
			],
		},
	},
	skinnedGeometry: {
		label: "skinnedGeometry",
		code: skinnedGeometryShader,
		bindings: {
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 0, type: "ubo", id: 1 },
				{ binding: 1, type: "uniform", name: "objectData" },
				{ binding: 2, type: "uniform", name: "boneMatrices" },
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
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [{ binding: 0, type: "uniform", name: "objectData" }],
		},
	},
	skinnedEntityShadows: {
		label: "skinnedEntityShadows",
		code: skinnedEntityShadowsShader,
		bindings: {
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 0, type: "uniform", name: "objectData" },
				{ binding: 2, type: "uniform", name: "boneMatrices" },
			],
		},
	},
	directionalLight: {
		label: "directionalLight",
		code: directionalLightShader,
		bindings: {
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 2, type: "uniform", name: "directionalLight" },
				{ binding: 3, type: "texture", unit: 1 },
			],
		},
	},
	pointLight: {
		label: "pointLight",
		code: pointLightShader,
		bindings: {
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 1, type: "uniform", name: "objectData" },
				{ binding: 2, type: "uniform", name: "pointLight" },
				{ binding: 3, type: "texture", unit: 0 },
				{ binding: 4, type: "texture", unit: 1 },
			],
		},
	},
	spotLight: {
		label: "spotLight",
		code: spotLightShader,
		bindings: {
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 1, type: "uniform", name: "objectData" },
				{ binding: 2, type: "uniform", name: "spotLight" },
				{ binding: 3, type: "texture", unit: 0 },
				{ binding: 4, type: "texture", unit: 1 },
			],
		},
	},
	kawaseBlur: {
		label: "kawaseBlur",
		code: kawaseBlurShader,
		bindings: {
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 0, type: "uniform", name: "blurParams" },
				{ binding: 1, type: "sampler", unit: 0 },
				{ binding: 2, type: "texture", unit: 0 },
			],
		},
	},
	bilateralBlur: {
		label: "bilateralBlur",
		code: bilateralBlurShader,
		bindings: {
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 0, type: "uniform", name: "bilateralParams" },
				{ binding: 2, type: "texture", unit: 0 }, // aoBuffer
				{ binding: 3, type: "texture", unit: 1 }, // positionBuffer
				{ binding: 4, type: "texture", unit: 2 }, // normalBuffer
			],
		},
	},
	postProcessing: {
		label: "postProcessing",
		code: postProcessingShader,
		bindings: {
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 0, type: "uniform", name: "postProcessParams" },
				{ binding: 1, type: "sampler", unit: 0 },
				{ binding: 2, type: "texture", unit: 0 },
				{ binding: 3, type: "texture", unit: 1 },
				{ binding: 4, type: "texture", unit: 2 },
				{ binding: 5, type: "texture", unit: 3 },
				{ binding: 6, type: "texture", unit: 4 },
				{ binding: 7, type: "texture", unit: 5 },
				{ binding: 8, type: "texture", unit: 6 },
				{ binding: 9, type: "texture", unit: 7 },
			],
		},
	},
	fsrEasu: {
		label: "fsrEasu",
		code: fsrEasuShader,
		bindings: {
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 0, type: "uniform", name: "easuParams" },
				{ binding: 1, type: "sampler", unit: 0 },
				{ binding: 2, type: "texture", unit: 0 },
			],
		},
	},
	fsrRcas: {
		label: "fsrRcas",
		code: fsrRcasShader,
		bindings: {
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 0, type: "uniform", name: "rcasParams" },
				{ binding: 2, type: "texture", unit: 0 },
			],
		},
	},
	transparent: {
		label: "transparent",
		code: transparentShader,
		bindings: {
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 0, type: "ubo", id: 1 },
				{ binding: 1, type: "uniform", name: "objectData" },
				{ binding: 2, type: "uniform", name: "lightingData" },
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
			group0: [{ binding: 0, type: "ubo", id: 0 }],
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
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 1, type: "uniform", name: "objectData" },
				{ binding: 2, type: "uniform", name: "debugColor" },
			],
		},
	},
	skinnedDebug: {
		label: "skinnedDebug",
		code: skinnedDebugShader,
		bindings: {
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 1, type: "uniform", name: "objectData" },
				{ binding: 2, type: "uniform", name: "debugColor" },
				{ binding: 3, type: "uniform", name: "boneMatrices" },
			],
		},
	},
	billboard: {
		label: "billboard",
		code: /* wgsl */ `
${FrameDataStruct}

struct BillboardVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
}

struct BillboardVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

struct BillboardParams {
    matWorld: mat4x4<f32>, // offset 0 (64 bytes)
    frameOffset: vec2<f32>, // offset 64 (8 bytes)
    frameScale: vec2<f32>, // offset 72 (8 bytes)
    opacity: f32, // offset 80 (4 bytes)
    _pad0: f32, // offset 84 (4 bytes)
    _pad1: f32, // offset 88 (4 bytes)
    _pad2: f32, // offset 92 (4 bytes)
}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var<uniform> params: BillboardParams;
@group(2) @binding(0) var billboardSampler: sampler;
@group(2) @binding(1) var billboardTexture: texture_2d<f32>;

@vertex
fn vs_main(input: BillboardVertexInput) -> BillboardVertexOutput {
    var output: BillboardVertexOutput;

    let worldPos = params.matWorld * vec4<f32>(input.position, 1.0);
    // Inset UVs slightly (1% on all sides) to prevent texture bleeding
    // from adjacent frames in the sprite sheet due to linear filtering
    let insetUV = input.uv * 0.98 + 0.01;
    output.uv = params.frameOffset + insetUV * params.frameScale;
    output.clipPosition = frameData.matViewProj * worldPos;
    return output;
}

@fragment
fn fs_main(input: BillboardVertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(billboardTexture, billboardSampler, input.uv);
    let lum = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
    return vec4<f32>(color.rgb * params.opacity, lum * params.opacity);
}
`,
		bindings: {
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [{ binding: 0, type: "uniform", name: "billboardParams" }],
			group2: [
				{ binding: 0, type: "sampler", unit: 0 },
				{ binding: 1, type: "texture", unit: 0 },
			],
		},
	},
	instancedBillboard: {
		label: "instancedBillboard",
		code: /* wgsl */ `
${FrameDataStruct}

struct InstancedBillboardVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) instancePos: vec3<f32>,
    @location(3) instanceScale: f32,
    @location(4) instanceRotation: f32,
    @location(5) instanceOpacity: f32,
}

struct InstancedBillboardVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) opacity: f32,
}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var billboardSampler: sampler;
@group(1) @binding(1) var billboardTexture: texture_2d<f32>;

@vertex
fn vs_main(input: InstancedBillboardVertexInput) -> InstancedBillboardVertexOutput {
    var output: InstancedBillboardVertexOutput;

    // View right and up vectors
    let right = vec3<f32>(frameData.matView[0].x, frameData.matView[1].x, frameData.matView[2].x);
    let up    = vec3<f32>(frameData.matView[0].y, frameData.matView[1].y, frameData.matView[2].y);
    
    let c = cos(input.instanceRotation);
    let s = sin(input.instanceRotation);
    
    let localRight = right * c + up * s;
    let localUp    = -right * s + up * c;

    let worldPos = input.instancePos 
                 + localRight * input.position.x * input.instanceScale 
                 + localUp * input.position.y * input.instanceScale;

    let insetUV = input.uv * 0.98 + 0.01;
    output.uv = insetUV;
    output.opacity = input.instanceOpacity;
    output.clipPosition = frameData.matViewProj * vec4<f32>(worldPos, 1.0);
    return output;
}

@fragment
fn fs_main(input: InstancedBillboardVertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(billboardTexture, billboardSampler, input.uv);
    let lum = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
    return vec4<f32>(color.rgb * input.opacity, lum * input.opacity);
}
`,
		bindings: {
			group0: [{ binding: 0, type: "ubo", id: 0 }],
			group1: [
				{ binding: 0, type: "sampler", unit: 0 },
				{ binding: 1, type: "texture", unit: 0 },
			],
		},
	},
};
