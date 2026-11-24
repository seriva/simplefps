@group(1) @binding(0) var bufferSampler: sampler;
@group(1) @binding(1) var colorBuffer: texture_2d<f32>;
@group(1) @binding(2) var lightBuffer: texture_2d<f32>;
@group(1) @binding(3) var emissiveBuffer: texture_2d<f32>;
@group(1) @binding(4) var dirtBuffer: texture_2d<f32>;
@group(1) @binding(5) var shadowBuffer: texture_2d<f32>;
@group(1) @binding(6) var normalBuffer: texture_2d<f32>;

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
