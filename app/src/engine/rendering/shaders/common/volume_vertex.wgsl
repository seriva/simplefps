struct VolumeOutput {
    @builtin(position) clipPosition: vec4<f32>,
}

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> VolumeOutput {
    var output: VolumeOutput;
    output.clipPosition = frameData.matViewProj * objectData.matWorld * vec4<f32>(position, 1.0);
    return output;
}
