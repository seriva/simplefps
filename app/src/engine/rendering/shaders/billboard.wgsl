struct BillboardVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
}

struct BillboardVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(input: BillboardVertexInput) -> BillboardVertexOutput {
    var output: BillboardVertexOutput;
    let worldPos = objectData.matWorld * vec4<f32>(input.position, 1.0);
    let insetUV = input.uv * 0.98 + 0.01;
    output.uv = objectData.params0.xy + insetUV * objectData.params0.zw;
    output.clipPosition = frameData.matViewProj * worldPos;
    return output;
}

@fragment
fn fs_main(input: BillboardVertexOutput) -> @location(0) vec4<f32> {
    let opacity = objectData.params1.x;
    let color = textureSample(billboardTexture, billboardSampler, input.uv);
    let lum = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
    return vec4<f32>(color.rgb * opacity, lum * opacity);
}
