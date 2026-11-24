struct FrameData {
    matViewProj: mat4x4<f32>,
    matInvViewProj: mat4x4<f32>,
    matView: mat4x4<f32>,
    matProjection: mat4x4<f32>,
    cameraPosition: vec4<f32>,  // .w = time
    viewportSize: vec4<f32>,    // .z = doProceduralDetail
}
@group(0) @binding(0) var<uniform> frameData: FrameData;
