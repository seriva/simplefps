struct InstancedBillboardVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) instancePos: vec3<f32>,
    @location(3) instanceScale: f32,
    @location(4) instanceRotation: f32,
    @location(5) instanceOpacity: f32,
}

struct InstancedBillboardVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) opacity: f32,
}

@vertex
fn vs_main(input: InstancedBillboardVertexInput) -> InstancedBillboardVertexOutput {
    var output: InstancedBillboardVertexOutput;
    let right = vec3<f32>(frameData.matView[0].x, frameData.matView[1].x, frameData.matView[2].x);
    let up    = vec3<f32>(frameData.matView[0].y, frameData.matView[1].y, frameData.matView[2].y);
    let c = cos(input.instanceRotation);
    let s = sin(input.instanceRotation);
    let localRight = right * c + up * s;
    let localUp    = -right * s + up * c;
    let worldPos = input.instancePos
    + localRight * input.position.x * input.instanceScale
    + localUp * input.position.y * input.instanceScale;
    output.uv = input.uv * 0.98 + 0.01;
    output.opacity = input.instanceOpacity;
    output.clipPosition = frameData.matViewProj * vec4<f32>(worldPos, 1.0);
    return output;
}

@fragment
fn fs_main(input: InstancedBillboardVertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(billboardTexture, billboardSampler, input.uv);
    let lum = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
    return vec4<f32>(color.rgb * input.opacity, lum * input.opacity);
}
