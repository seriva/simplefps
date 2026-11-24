@fragment
fn fs_main(input: VolumeOutput) -> @location(0) vec4<f32> {
    let fragCoord = vec2<i32>(input.clipPosition.xy);
    let position = textureLoad(positionBuffer, fragCoord, 0).xyz;
    let normal = octDecode(textureLoad(normalBuffer, fragCoord, 0).rg);
    let sl = calcSpotLight(objectData.params0.xyz, objectData.params2.xyz, objectData.params2.w, objectData.params0.w, position, normal);
    if (sl.x <= 0.0) { discard; }
    return vec4<f32>(objectData.params1.xyz * objectData.params1.w * sl.x * sl.y * sl.z, 1.0);
}
