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
