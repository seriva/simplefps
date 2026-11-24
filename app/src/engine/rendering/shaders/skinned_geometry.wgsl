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
