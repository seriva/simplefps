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
