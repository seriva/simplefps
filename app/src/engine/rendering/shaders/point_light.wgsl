@fragment
fn fs_main(input: VolumeOutput) -> @location(0) vec4<f32> {
    let fragCoord = vec2<i32>(input.clipPosition.xy);
    let position = textureLoad(positionBuffer, fragCoord, 0).xyz;
    let normal = octDecode(textureLoad(normalBuffer, fragCoord, 0).rg);
    let pl = calcPointLight(objectData.params0.xyz, objectData.params0.w, position, normal);
    if (pl.x <= 0.0) { discard; }
    return vec4<f32>(objectData.params1.xyz * pl.x * pl.y * objectData.params1.w, 1.0);
}
