struct GeomVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) normal: vec3<f32>,
    @location(3) lightmapUV: vec2<f32>,
}

@vertex
fn vs_main(input: GeomVertexInput) -> GeomVertexOutput {
    var output: GeomVertexOutput;
    output.worldPosition = objectData.matWorld * vec4<f32>(input.position, 1.0);
    output.uv = input.uv;
    output.lightmapUV = input.lightmapUV;
    output.normal = normalize((objectData.matWorld * vec4<f32>(input.normal, 0.0)).xyz);
    output.clipPosition = frameData.matViewProj * output.worldPosition;
    return output;
}
