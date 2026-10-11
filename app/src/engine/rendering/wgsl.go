package rendering

// WGSL sources for every pipeline. Shared header blocks keep the bind-group
// contract in one place:
//
//	group 0  Frame     binding 0 FrameData (uniform)
//	group 1  Material  per-pipeline inputs (material UBO + textures, or pass
//	                   input textures)
//	group 2  Object    binding 0 ObjectData (uniform, dynamic offset);
//	                   binding 1 bones (read-only storage, skinned only)
//	group 3  Lighting  binding 0 LightingData (uniform); binding 1 lights
//	                   (read-only storage)

const wgslFrame = `
struct FrameData {
    matViewProj: mat4x4<f32>,
    matInvViewProj: mat4x4<f32>,
    matView: mat4x4<f32>,
    matProjection: mat4x4<f32>,
    cameraPosition: vec4<f32>,  // .w = time
    viewportSize: vec4<f32>,    // .z = doProceduralDetail
}
@group(0) @binding(0) var<uniform> frameData: FrameData;
`

// ObjectData is the 256-byte per-draw slot of the object ring (see
// ObjectRing). params0..2 are pass-specific: light parameters, sprite frame,
// debug colour, post-processing settings.
const wgslObject = `
struct ObjectData {
    matWorld: mat4x4<f32>,
    probe: vec4<f32>,    // .rgb = probe colour, .a = shadow height
    params0: vec4<f32>,
    params1: vec4<f32>,
    params2: vec4<f32>,
    misc: vec4<f32>,     // .x = bone base index
}
@group(2) @binding(0) var<uniform> objectData: ObjectData;
`

const wgslBones = `
@group(2) @binding(1) var<storage, read> bones: array<mat4x4<f32>>;

fn calcSkinMatrix(jointIndices: vec4<u32>, jointWeights: vec4<f32>) -> mat4x4<f32> {
    let base = u32(objectData.misc.x);
    return bones[base + jointIndices.x] * jointWeights.x +
    bones[base + jointIndices.y] * jointWeights.y +
    bones[base + jointIndices.z] * jointWeights.z +
    bones[base + jointIndices.w] * jointWeights.w;
}
`

const wgslMaterial = `
struct MaterialData {
    flags: vec4<i32>,   // type, doEmissive, doReflection, hasLightmap
    params: vec4<f32>,  // reflectionStrength, opacity, pad, pad
}
@group(1) @binding(0) var<uniform> materialData: MaterialData;
@group(1) @binding(1) var colorSampler: sampler;
@group(1) @binding(2) var colorTexture: texture_2d<f32>;
@group(1) @binding(3) var emissiveTexture: texture_2d<f32>;
@group(1) @binding(4) var lightmapTexture: texture_2d<f32>;
@group(1) @binding(5) var proceduralNoise: texture_2d<f32>;
@group(1) @binding(6) var reflectionTexture: texture_2d<f32>;
@group(1) @binding(7) var reflectionMaskTexture: texture_2d<f32>;
@group(1) @binding(8) var lightmapSampler: sampler;

const MESH: i32 = 1;
const SKYBOX: i32 = 2;
`

const wgslLighting = `
struct LightingData {
    ambient: vec4<f32>,
    counts: vec4<f32>, // x = point count, y = spot count
}
struct Light {
    posRange: vec4<f32>,       // xyz = position, w = range/size
    colorIntensity: vec4<f32>, // xyz = colour, w = intensity
    dirCutoff: vec4<f32>,      // xyz = direction, w = cos cutoff (spot)
}
@group(3) @binding(0) var<uniform> lightingData: LightingData;
@group(3) @binding(1) var<storage, read> lights: array<Light>;
`

const wgslOct = `
fn octEncode(n: vec3<f32>) -> vec2<f32> {
    var v = n / (abs(n.x) + abs(n.y) + abs(n.z));
    if (v.z < 0.0) {
        let ox = v.x;
        let oy = v.y;
        v.x = (1.0 - abs(oy)) * select(-1.0, 1.0, ox >= 0.0);
        v.y = (1.0 - abs(ox)) * select(-1.0, 1.0, oy >= 0.0);
    }
    return v.xy * 0.5 + 0.5;
}

fn octDecode(f_in: vec2<f32>) -> vec3<f32> {
    var f = f_in * 2.0 - 1.0;
    var n = vec3<f32>(f, 1.0 - abs(f.x) - abs(f.y));
    if (n.z < 0.0) {
        let ox = n.x;
        let oy = n.y;
        n.x = (1.0 - abs(oy)) * select(-1.0, 1.0, ox >= 0.0);
        n.y = (1.0 - abs(ox)) * select(-1.0, 1.0, oy >= 0.0);
    }
    return normalize(n);
}
`

const wgslLightFuncs = `
fn calcPointLight(lightPos: vec3<f32>, lightSize: f32, fragPos: vec3<f32>, normal: vec3<f32>) -> vec2<f32> {
    let lightDir = lightPos - fragPos;
    let distSq = dot(lightDir, lightDir);
    let sizeSq = lightSize * lightSize;
    if (distSq > sizeSq) { return vec2<f32>(0.0); }

    let normalizedDist = sqrt(distSq) / lightSize;
    let falloff = 1.0 - smoothstep(0.0, 1.0, normalizedDist);

    let L = normalize(lightDir);
    let nDotL = max(0.0, dot(normal, L));

    return vec2<f32>(falloff * falloff, nDotL);
}

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
`

// wgslFullscreen is the vertex stage for pass.draw(3) fullscreen triangles.
const wgslFullscreen = `
struct FullscreenOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> FullscreenOutput {
    var output: FullscreenOutput;
    let x = f32((vertexIndex << 1) & 2);
    let y = f32(vertexIndex & 2);
    output.position = vec4<f32>(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
    output.uv = vec2<f32>(x, 1.0 - y);
    return output;
}
`

const wgslGeometryCommon = `
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
}
`

const wgslGeometryFragment = `
@fragment
fn fs_main(input: GeomVertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    var color = textureSample(colorTexture, colorSampler, input.uv);
    if (color.a < 0.5) {
        discard;
    }

    var N = normalize(input.normal);

    // Probe colour for dynamic (unlightmapped) objects; skybox ignores it.
    if (materialData.flags.w == 0 && materialData.flags.x != SKYBOX) {
        color = vec4<f32>(color.rgb * objectData.probe.rgb, color.a);
    }

    if (materialData.flags.w == 1 && materialData.flags.x != SKYBOX) {
        color = color * textureSample(lightmapTexture, lightmapSampler, input.lightmapUV);
    }

    // Procedural detail (normal + parallax) on lightmapped geometry.
    if (materialData.flags.x != SKYBOX && frameData.viewportSize.z > 0.5 && materialData.flags.w == 1) {
        let dist = distance(frameData.cameraPosition.xyz, input.worldPosition.xyz);
        let detailFade = 1.0 - smoothstep(100.0, 500.0, dist);

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

            let viewDir = normalize(frameData.cameraPosition.xyz - input.worldPosition.xyz);
            let tangentViewDir = normalize(transpose(TBN) * viewDir);

            let uv1 = input.uv * 4.0;
            let rot = mat2x2<f32>(0.829, 0.559, -0.559, 0.829);
            let uv2 = (rot * (input.uv * 7.37)) + vec2<f32>(0.43, 0.81);

            let h1 = textureSampleLevel(proceduralNoise, colorSampler, uv1, 0.0).a;
            let parallaxOffset = tangentViewDir.xy * (h1 * 0.02 * detailFade);

            let s1 = textureSampleLevel(proceduralNoise, colorSampler, uv1 - parallaxOffset, 0.0);
            let s2 = textureSampleLevel(proceduralNoise, colorSampler, uv2 - parallaxOffset, 0.0);

            let detailNormal = normalize((s1.rgb * 2.0 - 1.0) + (s2.rgb * 2.0 - 1.0));
            let height = (s1.a + s2.a) * 0.5;
            let surfaceNormal = normalize(TBN * detailNormal);

            let p = input.worldPosition;
            let macroVar = (sin(p.x * 0.13 + p.z * 0.07) + sin(p.z * 0.11 - p.x * 0.05) + sin(p.y * 0.1));
            let macroFactor = (macroVar / 3.0) * 0.5 + 0.5;

            let occlusion = clamp(dot(surfaceNormal, N), 0.5, 1.0) * mix(0.5, 1.0, height);
            let modFactor = detailFade * (0.3 + 0.7 * macroFactor);

            color = vec4<f32>(color.rgb * mix(1.0, occlusion, modFactor), color.a);
            N = normalize(mix(N, surfaceNormal, 0.5 * detailFade));
        }
    }

    output.emissive = vec4<f32>(0.0);

    let lightmapFlag = select(1.0, f32(materialData.flags.w), materialData.flags.x != SKYBOX);
    if (materialData.flags.x != SKYBOX) {
        output.position = vec4<f32>(input.worldPosition.xyz, 1.0);
        output.normal = vec4<f32>(octEncode(N), 1.0, 0.0); // .b=1: real geometry
    } else {
        output.position = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        output.normal = vec4<f32>(0.5, 0.5, 0.0, 0.0); // .b=0: skybox pixel
    }

    if (materialData.flags.z == 1) {
        color = applyReflection(color, input.uv, input.worldPosition.xyz, N);
    }

    if (materialData.flags.y == 1) {
        output.emissive = textureSample(emissiveTexture, colorSampler, input.uv);
    }

    output.color = vec4<f32>((color + output.emissive).rgb, lightmapFlag);
    return output;
}
`

// WgslGeometry fills the G-buffer from static meshes (and the skybox).
var WgslGeometry = wgslFrame + wgslMaterial + wgslObject + wgslOct + wgslGeometryCommon + `
struct GeomVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) normal: vec3<f32>,
    @location(3) lightmapUV: vec2<f32>,
}

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
` + wgslGeometryFragment

// WgslSkinnedGeometry is WgslGeometry with storage-buffer skinning.
var WgslSkinnedGeometry = wgslFrame + wgslMaterial + wgslObject + wgslBones + wgslOct + wgslGeometryCommon + `
struct SkinnedVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) normal: vec3<f32>,
    @location(4) jointIndices: vec4<u32>,
    @location(5) jointWeights: vec4<f32>,
}

@vertex
fn vs_main(input: SkinnedVertexInput) -> GeomVertexOutput {
    var output: GeomVertexOutput;
    let skinMatrix = calcSkinMatrix(input.jointIndices, input.jointWeights);
    let skinnedPosition = (skinMatrix * vec4<f32>(input.position, 1.0)).xyz;
    let skinnedNormal = (skinMatrix * vec4<f32>(input.normal, 0.0)).xyz;
    output.worldPosition = objectData.matWorld * vec4<f32>(skinnedPosition, 1.0);
    output.uv = input.uv;
    output.lightmapUV = vec2<f32>(0.0);
    output.normal = normalize((objectData.matWorld * vec4<f32>(skinnedNormal, 0.0)).xyz);
    output.clipPosition = frameData.matViewProj * output.worldPosition;
    return output;
}
` + wgslGeometryFragment

// WgslEntityShadows draws flattened drop shadows (probe.rgb = ambient).
var WgslEntityShadows = wgslFrame + wgslObject + `
struct ShadowVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
}

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> ShadowVertexOutput {
    var output: ShadowVertexOutput;
    output.clipPosition = frameData.matViewProj * objectData.matWorld * vec4<f32>(position, 1.0);
    return output;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(objectData.probe.rgb, 1.0);
}
`

// WgslSkinnedEntityShadows flattens the skinned pose to probe.a (shadow height).
var WgslSkinnedEntityShadows = wgslFrame + wgslObject + wgslBones + `
struct SkinnedShadowVertexInput {
    @location(0) position: vec3<f32>,
    @location(4) jointIndices: vec4<u32>,
    @location(5) jointWeights: vec4<f32>,
}

struct ShadowVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
}

@vertex
fn vs_main(input: SkinnedShadowVertexInput) -> ShadowVertexOutput {
    var output: ShadowVertexOutput;
    let skinMatrix = calcSkinMatrix(input.jointIndices, input.jointWeights);
    let skinnedPosition = (skinMatrix * vec4<f32>(input.position, 1.0)).xyz;
    var worldPos = objectData.matWorld * vec4<f32>(skinnedPosition, 1.0);
    worldPos.y = objectData.probe.a;
    output.clipPosition = frameData.matViewProj * worldPos;
    return output;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(objectData.probe.rgb, 1.0);
}
`

const wgslDeferredInputs = `
@group(1) @binding(0) var positionBuffer: texture_2d<f32>;
@group(1) @binding(1) var normalBuffer: texture_2d<f32>;
@group(1) @binding(2) var colorBuffer: texture_2d<f32>;
`

// WgslDirectionalLight: fullscreen, params0 = direction, params1 = colour.
var WgslDirectionalLight = wgslFrame + wgslDeferredInputs + wgslObject + wgslOct + wgslFullscreen + `
@fragment
fn fs_main(input: FullscreenOutput) -> @location(0) vec4<f32> {
    let fragCoord = vec2<i32>(input.position.xy);
    let hasLightmap = textureLoad(colorBuffer, fragCoord, 0).a;
    if (hasLightmap > 0.5) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }
    let normal = octDecode(textureLoad(normalBuffer, fragCoord, 0).rg);
    let lightIntensity = objectData.params1.rgb * max(dot(normal, normalize(objectData.params0.xyz)), 0.0);
    return vec4<f32>(lightIntensity, 1.0);
}
`

const wgslVolumeVertex = `
struct VolumeOutput {
    @builtin(position) clipPosition: vec4<f32>,
}

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> VolumeOutput {
    var output: VolumeOutput;
    output.clipPosition = frameData.matViewProj * objectData.matWorld * vec4<f32>(position, 1.0);
    return output;
}
`

// WgslPointLight: sphere volume, params0 = posRange, params1 = colorIntensity.
var WgslPointLight = wgslFrame + wgslDeferredInputs + wgslObject + wgslOct + wgslLightFuncs + wgslVolumeVertex + `
@fragment
fn fs_main(input: VolumeOutput) -> @location(0) vec4<f32> {
    let fragCoord = vec2<i32>(input.clipPosition.xy);
    let position = textureLoad(positionBuffer, fragCoord, 0).xyz;
    let normal = octDecode(textureLoad(normalBuffer, fragCoord, 0).rg);
    let pl = calcPointLight(objectData.params0.xyz, objectData.params0.w, position, normal);
    if (pl.x <= 0.0) { discard; }
    return vec4<f32>(objectData.params1.xyz * pl.x * pl.y * objectData.params1.w, 1.0);
}
`

// WgslSpotLight: cone volume, params0 = posRange, params1 = colorIntensity,
// params2 = dirCutoff.
var WgslSpotLight = wgslFrame + wgslDeferredInputs + wgslObject + wgslOct + wgslLightFuncs + wgslVolumeVertex + `
@fragment
fn fs_main(input: VolumeOutput) -> @location(0) vec4<f32> {
    let fragCoord = vec2<i32>(input.clipPosition.xy);
    let position = textureLoad(positionBuffer, fragCoord, 0).xyz;
    let normal = octDecode(textureLoad(normalBuffer, fragCoord, 0).rg);
    let sl = calcSpotLight(objectData.params0.xyz, objectData.params2.xyz, objectData.params2.w, objectData.params0.w, position, normal);
    if (sl.x <= 0.0) { discard; }
    return vec4<f32>(objectData.params1.xyz * objectData.params1.w * sl.x * sl.y * sl.z, 1.0);
}
`

// WgslKawaseBlur is the compute Kawase blur: params0.x = offset (negative =
// identity copy). Group 1: sampler, source texture, destination storage.
var WgslKawaseBlur = wgslFrame + wgslObject + `
@group(1) @binding(0) var blurSampler: sampler;
@group(1) @binding(1) var srcTexture: texture_2d<f32>;
@group(1) @binding(2) var dstTexture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8, 1)
fn cs_main(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = textureDimensions(dstTexture);
    if (id.x >= size.x || id.y >= size.y) { return; }
    let texelSize = 1.0 / vec2<f32>(size);
    let uv = (vec2<f32>(id.xy) + 0.5) * texelSize;
    let offset = objectData.params0.x;
    if (offset < 0.0) {
        textureStore(dstTexture, vec2<i32>(id.xy), textureSampleLevel(srcTexture, blurSampler, uv, 0.0));
        return;
    }
    let o = offset + 0.5;
    var color = textureSampleLevel(srcTexture, blurSampler, uv, 0.0);
    color += textureSampleLevel(srcTexture, blurSampler, uv + vec2<f32>(-o, -o) * texelSize, 0.0);
    color += textureSampleLevel(srcTexture, blurSampler, uv + vec2<f32>( o, -o) * texelSize, 0.0);
    color += textureSampleLevel(srcTexture, blurSampler, uv + vec2<f32>(-o,  o) * texelSize, 0.0);
    color += textureSampleLevel(srcTexture, blurSampler, uv + vec2<f32>( o,  o) * texelSize, 0.0);
    textureStore(dstTexture, vec2<i32>(id.xy), color * 0.2);
}
`

// WgslPostProcessing composites the frame. params0 = (gamma, emissiveMult,
// dirtIntensity, shadowIntensity), params1 = ambient.
var WgslPostProcessing = wgslFrame + wgslObject + `
@group(1) @binding(0) var bufferSampler: sampler;
@group(1) @binding(1) var colorBuffer: texture_2d<f32>;
@group(1) @binding(2) var lightBuffer: texture_2d<f32>;
@group(1) @binding(3) var emissiveBuffer: texture_2d<f32>;
@group(1) @binding(4) var dirtBuffer: texture_2d<f32>;
@group(1) @binding(5) var shadowBuffer: texture_2d<f32>;
@group(1) @binding(6) var normalBuffer: texture_2d<f32>;
` + wgslFullscreen + `
@fragment
fn fs_main(input: FullscreenOutput) -> @location(0) vec4<f32> {
    let uv = input.uv;
    let fragCoord = vec2<i32>(input.position.xy);
    let gamma = objectData.params0.x;
    let emissiveMult = objectData.params0.y;
    let dirtIntensity = objectData.params0.z;
    let shadowIntensity = objectData.params0.w;

    let color = textureLoad(colorBuffer, fragCoord, 0);
    let light = textureLoad(lightBuffer, fragCoord, 0);
    let emissive = textureLoad(emissiveBuffer, fragCoord, 0);
    let dirt = textureSample(dirtBuffer, bufferSampler, uv);

    let dynamicLight = max(light.rgb - objectData.params1.xyz, vec3<f32>(0.0));
    var fragColor = vec4<f32>(color.rgb + dynamicLight, 1.0);

    let skyFlag = textureLoad(normalBuffer, fragCoord, 0).b;
    let shadow = textureLoad(shadowBuffer, fragCoord, 0).rrr;
    if (skyFlag > 0.5) {
        let softShadow = mix(vec3<f32>(1.0), shadow, shadowIntensity);
        fragColor = vec4<f32>(fragColor.rgb * softShadow, fragColor.a);
    }

    fragColor = fragColor + emissive * emissiveMult;

    if (dirtIntensity > 0.0) {
        let emissiveStrength = length(emissive.rgb);
        let emissiveMask = 1.0 - clamp(emissiveStrength * 10.0, 0.0, 1.0);
        var dirtAmount = (1.0 - dirt.rgb) * dirtIntensity;
        dirtAmount = clamp(dirtAmount, vec3<f32>(0.0), vec3<f32>(1.0));
        let dirtened = fragColor.rgb * (1.0 - dirtAmount);
        fragColor = vec4<f32>(mix(fragColor.rgb, dirtened, emissiveMask), fragColor.a);
    }

    fragColor = vec4<f32>(pow(fragColor.rgb, vec3<f32>(1.0 / gamma)), fragColor.a);
    return fragColor;
}
`

const wgslSampledInput = `
@group(1) @binding(0) var bufferSampler: sampler;
@group(1) @binding(1) var colorBuffer: texture_2d<f32>;
`

// WgslFsrEasu upscales; params0 = con0 (xy = input size, zw = output size).
var WgslFsrEasu = wgslFrame + wgslObject + wgslSampledInput + wgslFullscreen + `
fn easuWeight(sampleOff: vec2<f32>, dir: vec2<f32>, stretch: f32) -> f32 {
    let along = abs(sampleOff.x * dir.x + sampleOff.y * dir.y);
    let perp  = abs(sampleOff.x * dir.y - sampleOff.y * dir.x);
    let d = sqrt(along * along + perp * perp * stretch * stretch);
    if d < 1.0 {
        return (1.5 * d - 2.5) * d * d + 1.0;
    } else if d < 2.0 {
        return ((-0.5 * d + 2.5) * d - 4.0) * d + 2.0;
    }
    return 0.0;
}

@fragment
fn fs_main(input: FullscreenOutput) -> @location(0) vec4<f32> {
    let inputSize = objectData.params0.xy;
    let outputSize = objectData.params0.zw;
    let invInput = 1.0 / inputSize;

    let srcPos = input.position.xy * inputSize / outputSize - 0.5;
    let base = floor(srcPos);
    let f = srcPos - base;
    let tc = (base + 0.5) * invInput;
    let dx = vec2<f32>(invInput.x, 0.0);
    let dy = vec2<f32>(0.0, invInput.y);

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

    let dirX = (lc-lb) + (lf-le) + (lj-li) + (lm-ll) + (lg-ld) + (lk-lh);
    let dirY = (lh-ld) + (li-le) + (lj-lf) + (lk-lg) + (ll-lb) + (lm-lc);
    let dirLen = max(abs(dirX), abs(dirY));
    let invDirLen = 1.0 / (dirLen + 1.0e-8);
    let dir = vec2<f32>(dirX * invDirLen, dirY * invDirLen);

    let minEdge = min(min(le, lf), min(li, lj));
    let maxEdge = max(max(le, lf), max(li, lj));
    let edgeAmount = clamp((maxEdge - minEdge) / max(maxEdge, 1.0e-5), 0.0, 1.0);
    let stretch = 1.0 + edgeAmount * 0.5;

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

    let nMin = min(min(min(b,c),min(d,e)),min(min(fS,g),min(min(h,iS),min(min(j,k),min(l,m)))));
    let nMax = max(max(max(b,c),max(d,e)),max(max(fS,g),max(max(h,iS),max(max(j,k),max(l,m)))));

    return vec4<f32>(clamp(color / totalW, nMin, nMax), 1.0);
}
`

// WgslFsrRcas sharpens; params0.x = sharpness.
var WgslFsrRcas = wgslFrame + wgslObject + wgslSampledInput + wgslFullscreen + `
@fragment
fn fs_main(input: FullscreenOutput) -> @location(0) vec4<f32> {
    let p = vec2<i32>(input.position.xy);
    let sharpness = objectData.params0.x;

    let b = textureLoad(colorBuffer, p + vec2<i32>(0, -1), 0).rgb;
    let d = textureLoad(colorBuffer, p + vec2<i32>(-1, 0), 0).rgb;
    let e = textureLoad(colorBuffer, p, 0).rgb;
    let f = textureLoad(colorBuffer, p + vec2<i32>(1, 0), 0).rgb;
    let h = textureLoad(colorBuffer, p + vec2<i32>(0, 1), 0).rgb;

    let bL = b.g * 0.5 + (b.r + b.b) * 0.25;
    let dL = d.g * 0.5 + (d.r + d.b) * 0.25;
    let eL = e.g * 0.5 + (e.r + e.b) * 0.25;
    let fL = f.g * 0.5 + (f.r + f.b) * 0.25;
    let hL = h.g * 0.5 + (h.r + h.b) * 0.25;

    let nz = 0.25 * (bL + dL + fL + hL) - eL;
    let rangeL = max(max(bL, dL), max(eL, max(fL, hL)))
    - min(min(bL, dL), min(eL, min(fL, hL)));
    let nzC = clamp(abs(nz) / max(rangeL, 1e-6), 0.0, 1.0);
    let nzW = -0.5 * nzC + 1.0;

    let mn4 = min(min(b, d), min(f, h));
    let mx4 = max(max(b, d), max(f, h));

    let peakC = 1.0 / (-4.0 * sharpness + 8.0);

    let hitMinR = min(mn4.r, e.r) / (4.0 * max(mx4.r, e.r) + 1e-6);
    let hitMinG = min(mn4.g, e.g) / (4.0 * max(mx4.g, e.g) + 1e-6);
    let hitMinB = min(mn4.b, e.b) / (4.0 * max(mx4.b, e.b) + 1e-6);
    let hitMaxR = (peakC - max(mx4.r, e.r)) / (4.0 * min(mn4.r, e.r) + peakC);
    let hitMaxG = (peakC - max(mx4.g, e.g)) / (4.0 * min(mn4.g, e.g) + peakC);
    let hitMaxB = (peakC - max(mx4.b, e.b)) / (4.0 * min(mn4.b, e.b) + peakC);

    let lobeR = max(-hitMinR, hitMaxR);
    let lobeG = max(-hitMinG, hitMaxG);
    let lobeB = max(-hitMinB, hitMaxB);

    var lobe = max(-peakC, min(max(lobeR, max(lobeG, lobeB)), 0.0));
    lobe *= nzW;

    var color = (b + d + f + h) * lobe + e;
    color = color / (4.0 * lobe + 1.0);

    return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`

// WgslTransparent forward-shades translucent meshes with the light storage
// buffer (points first, then spots).
var WgslTransparent = wgslFrame + wgslMaterial + wgslObject + wgslLighting + wgslLightFuncs + `
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

@vertex
fn vs_main(input: TransparentVertexInput) -> TransparentVertexOutput {
    var output: TransparentVertexOutput;
    output.worldPosition = objectData.matWorld * vec4<f32>(input.position, 1.0);
    output.uv = input.uv;
    output.normal = normalize((objectData.matWorld * vec4<f32>(input.normal, 0.0)).xyz);
    output.clipPosition = frameData.matViewProj * output.worldPosition;
    return output;
}

@fragment
fn fs_main(input: TransparentVertexOutput) -> @location(0) vec4<f32> {
    var baseColor = textureSample(colorTexture, colorSampler, input.uv);
    let emissive = textureSample(emissiveTexture, colorSampler, input.uv);
    baseColor = vec4<f32>(baseColor.rgb + emissive.rgb, baseColor.a * materialData.params.y);

    let normal = normalize(input.normal);
    let fragPos = input.worldPosition.xyz;

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

    var dynamicLighting = vec3<f32>(0.0);
    let numPoint = u32(lightingData.counts.x);
    let numSpot = u32(lightingData.counts.y);
    for (var i = 0u; i < numPoint; i++) {
        let l = lights[i];
        let pl = calcPointLight(l.posRange.xyz, l.posRange.w, fragPos, normal);
        dynamicLighting += l.colorIntensity.rgb * (pl.x * pl.y * l.colorIntensity.w);
    }
    for (var i = 0u; i < numSpot; i++) {
        let l = lights[numPoint + i];
        let sl = calcSpotLight(l.posRange.xyz, l.dirCutoff.xyz, l.dirCutoff.w, l.posRange.w, fragPos, normal);
        dynamicLighting += l.colorIntensity.rgb * (l.colorIntensity.w * 2.0) * sl.x * sl.y * sl.z;
    }

    let finalColor = vec3<f32>(baseColor.rgb * 0.5 + baseColor.rgb * dynamicLighting);
    return vec4<f32>(finalColor, baseColor.a);
}
`

// WgslDebug draws lines in params0 (debug colour).
var WgslDebug = wgslFrame + wgslObject + wgslVolumeVertex + `
@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return objectData.params0;
}
`

// WgslSkinnedDebug is WgslDebug through the skinning matrices.
var WgslSkinnedDebug = wgslFrame + wgslObject + wgslBones + `
struct SkinnedDebugVertexInput {
    @location(0) position: vec3<f32>,
    @location(4) jointIndices: vec4<u32>,
    @location(5) jointWeights: vec4<f32>,
}

struct VolumeOutput {
    @builtin(position) clipPosition: vec4<f32>,
}

@vertex
fn vs_main(input: SkinnedDebugVertexInput) -> VolumeOutput {
    var output: VolumeOutput;
    let skinMatrix = calcSkinMatrix(input.jointIndices, input.jointWeights);
    let skinnedPosition = (skinMatrix * vec4<f32>(input.position, 1.0)).xyz;
    output.clipPosition = frameData.matViewProj * objectData.matWorld * vec4<f32>(skinnedPosition, 1.0);
    return output;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return objectData.params0;
}
`

const wgslSprite = `
@group(1) @binding(0) var billboardSampler: sampler;
@group(1) @binding(1) var billboardTexture: texture_2d<f32>;
`

// WgslBillboard: params0 = (frameOffset.xy, frameScale.xy), params1.x = opacity.
var WgslBillboard = wgslFrame + wgslSprite + wgslObject + `
struct BillboardVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
}

struct BillboardVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(input: BillboardVertexInput) -> BillboardVertexOutput {
    var output: BillboardVertexOutput;
    let worldPos = objectData.matWorld * vec4<f32>(input.position, 1.0);
    let insetUV = input.uv * 0.98 + 0.01;
    output.uv = objectData.params0.xy + insetUV * objectData.params0.zw;
    output.clipPosition = frameData.matViewProj * worldPos;
    return output;
}

@fragment
fn fs_main(input: BillboardVertexOutput) -> @location(0) vec4<f32> {
    let opacity = objectData.params1.x;
    let color = textureSample(billboardTexture, billboardSampler, input.uv);
    let lum = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
    return vec4<f32>(color.rgb * opacity, lum * opacity);
}
`

// WgslInstancedBillboard draws particle quads from the per-instance buffer.
var WgslInstancedBillboard = wgslFrame + wgslSprite + wgslObject + `
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

@vertex
fn vs_main(input: InstancedBillboardVertexInput) -> InstancedBillboardVertexOutput {
    var output: InstancedBillboardVertexOutput;
    let right = vec3<f32>(frameData.matView[0].x, frameData.matView[1].x, frameData.matView[2].x);
    let up    = vec3<f32>(frameData.matView[0].y, frameData.matView[1].y, frameData.matView[2].y);
    let c = cos(input.instanceRotation);
    let s = sin(input.instanceRotation);
    let localRight = right * c + up * s;
    let localUp    = -right * s + up * c;
    let worldPos = input.instancePos
    + localRight * input.position.x * input.instanceScale
    + localUp * input.position.y * input.instanceScale;
    output.uv = input.uv * 0.98 + 0.01;
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
`

// WgslParticleUpdate integrates one particle per invocation and writes the
// instance record. Group 1: particles (rw), instances (rw), curve LUT.
// params0 = (dtSeconds, frameTimeMs, particleCount, lutSize).
var WgslParticleUpdate = wgslFrame + wgslObject + `
struct Particle {
    pos: vec3<f32>,
    duration: f32,
    vel: vec3<f32>,
    life: f32,
    scale: f32,
    gravity: f32,
    rotation: f32,
    pad: f32,
}

// Scalars only: a vec3 member would pad the struct to 32 bytes and break
// the 24-byte ParticleInstanceStride vertex layout.
struct Instance {
    px: f32,
    py: f32,
    pz: f32,
    scale: f32,
    rotation: f32,
    opacity: f32,
}

@group(1) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(1) @binding(1) var<storage, read_write> instances: array<Instance>;
// curve.x = scale multiplier, curve.y = opacity multiplier sampled by progress.
@group(1) @binding(2) var<storage, read> curve: array<vec2<f32>>;

@compute @workgroup_size(64, 1, 1)
fn cs_main(@builtin(global_invocation_id) id: vec3<u32>) {
    let count = u32(objectData.params0.z);
    let i = id.x;
    if (i >= count) { return; }
    var p = particles[i];
    let dt = objectData.params0.x;
    p.life -= objectData.params0.y;
    var inst: Instance;
    inst.px = p.pos.x;
    inst.py = p.pos.y;
    inst.pz = p.pos.z;
    if (p.life <= 0.0) {
        inst.scale = 0.0;
        inst.rotation = 0.0;
        inst.opacity = 0.0;
        instances[i] = inst;
        particles[i] = p;
        return;
    }
    p.vel.y -= p.gravity * dt;
    p.pos += p.vel * dt;
    particles[i] = p;

    let progress = clamp(1.0 - p.life / p.duration, 0.0, 1.0);
    let lutSize = objectData.params0.w;
    let fi = progress * (lutSize - 1.0);
    let i0 = u32(floor(fi));
    let i1 = min(i0 + 1u, u32(lutSize) - 1u);
    let t = fi - f32(i0);
    let c = mix(curve[i0], curve[i1], t);
    inst.px = p.pos.x;
    inst.py = p.pos.y;
    inst.pz = p.pos.z;
    inst.scale = p.scale * c.x;
    inst.rotation = p.rotation;
    inst.opacity = c.y;
    instances[i] = inst;
}
`

// mipmapBlitWGSL downsamples one mip level from the previous.
const mipmapBlitWGSL = `
struct VSOutput {
	@builtin(position) position: vec4<f32>,
	@location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VSOutput {
	var pos = array<vec2<f32>, 4>(
		vec2(-1.0, 1.0), vec2(1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, -1.0)
	);
	var uv = array<vec2<f32>, 4>(
		vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0)
	);
	var out: VSOutput;
	out.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
	out.uv = uv[vertexIndex];
	return out;
}

@group(0) @binding(0) var imgSampler: sampler;
@group(0) @binding(1) var img: texture_2d<f32>;

@fragment
fn fs_main(in: VSOutput) -> @location(0) vec4<f32> {
	return textureSample(img, imgSampler, in.uv);
}
`
