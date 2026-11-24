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
