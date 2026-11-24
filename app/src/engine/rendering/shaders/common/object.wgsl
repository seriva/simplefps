struct ObjectData {
    matWorld: mat4x4<f32>,
    probe: vec4<f32>,    // .rgb = probe colour, .a = shadow height
    params0: vec4<f32>,
    params1: vec4<f32>,
    params2: vec4<f32>,
    misc: vec4<f32>,     // .x = bone base index
}
@group(2) @binding(0) var<uniform> objectData: ObjectData;
