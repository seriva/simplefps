struct ShadowVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
}

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> ShadowVertexOutput {
    var output: ShadowVertexOutput;
    output.clipPosition = frameData.matViewProj * objectData.matWorld * vec4<f32>(position, 1.0);
    return output;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(objectData.probe.rgb, 1.0);
}
