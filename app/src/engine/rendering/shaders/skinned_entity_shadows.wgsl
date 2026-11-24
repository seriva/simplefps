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
