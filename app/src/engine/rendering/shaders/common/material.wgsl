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
