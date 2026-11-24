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
