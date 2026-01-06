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

@group(2) @binding(0) var colorSampler: sampler;
@group(2) @binding(1) var colorTexture: texture_2d<f32>;
@group(2) @binding(2) var emissiveTexture: texture_2d<f32>;
@group(2) @binding(3) var lightmapTexture: texture_2d<f32>;

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
    
    // Apply lightmap if available and not skybox
    if (materialData.flags.w == 1 && materialData.flags.x != SKYBOX) {
        color = color * textureSample(lightmapTexture, colorSampler, input.lightmapUV);
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

struct ShadowVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
}

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
    
    var color = textureLoad(colorBuffer, fragCoord, 0);
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
    
    // Gamma correction
    fragColor = vec4<f32>(pow(fragColor.rgb, vec3<f32>(1.0 / params.gamma)), fragColor.a);
    
    return fragColor;
}
`;

// Transparent shader (forward rendered)
const transparentShader = /* wgsl */ `
${FrameDataStruct}
${MaterialDataStruct}

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
@group(2) @binding(0) var colorSampler: sampler;
@group(2) @binding(1) var colorTexture: texture_2d<f32>;
@group(2) @binding(2) var emissiveTexture: texture_2d<f32>;

@vertex
fn vs_main(input: TransparentVertexInput) -> TransparentVertexOutput {
    var output: TransparentVertexOutput;
    output.worldPosition = matWorld * vec4<f32>(input.position, 1.0);
    output.uv = input.uv;
    output.normal = normalize((matWorld * vec4<f32>(input.normal, 0.0)).xyz);
    output.clipPosition = frameData.matViewProj * output.worldPosition;
    return output;
}

@fragment
fn fs_main(input: TransparentVertexOutput) -> @location(0) vec4<f32> {
    var color = textureSample(colorTexture, colorSampler, input.uv);
    let emissive = textureSample(emissiveTexture, colorSampler, input.uv);
    color = vec4<f32>(color.rgb + emissive.rgb, color.a * materialData.params.y);
    
    return color;
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
        
        let sampleCoord = vec2<i32>(sampleUV * frameData.viewportSize.xy);
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

// Debug shader
const debugShader = /* wgsl */ `
${FrameDataStruct}
struct DebugOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> frameData: FrameData;
@group(1) @binding(0) var debugSampler: sampler;
@group(1) @binding(1) var debugTexture: texture_2d<f32>;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> DebugOutput {
    var output: DebugOutput;
    let x = f32((vertexIndex << 1) & 2);
    let y = f32(vertexIndex & 2);
    output.position = vec4<f32>(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0 + frameData.viewportSize.x * 0.0);
    output.uv = vec2<f32>(x, 1.0 - y);
    return output;
}

@fragment
fn fs_main(input: DebugOutput) -> @location(0) vec4<f32> {
    return textureSample(debugTexture, debugSampler, input.uv);
}
`;

// Export shader sources in same format as GLSL
// Export shader sources in same format as GLSL
export const WgslShaderSources = {
	geometry: {
		label: "geometry",
		code: geometryShader,
	},
	entityShadows: {
		label: "entityShadows",
		code: entityShadowsShader,
	},
	applyShadows: {
		label: "applyShadows",
		code: applyShadowsShader,
	},
	directionalLight: {
		label: "directionalLight",
		code: directionalLightShader,
	},
	pointLight: {
		label: "pointLight",
		code: pointLightShader,
	},
	spotLight: {
		label: "spotLight",
		code: spotLightShader,
	},
	kawaseBlur: {
		label: "kawaseBlur",
		code: kawaseBlurShader,
	},
	postProcessing: {
		label: "postProcessing",
		code: postProcessingShader,
	},
	transparent: {
		label: "transparent",
		code: transparentShader,
	},
	ssao: {
		label: "ssao",
		code: ssaoShader,
	},
	debug: {
		label: "debug",
		code: debugShader,
	},
};
