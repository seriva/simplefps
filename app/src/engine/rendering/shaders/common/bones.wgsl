@group(2) @binding(1) var<storage, read> bones: array<mat4x4<f32>>;

fn calcSkinMatrix(jointIndices: vec4<u32>, jointWeights: vec4<f32>) -> mat4x4<f32> {
    let base = u32(objectData.misc.x);
    return bones[base + jointIndices.x] * jointWeights.x +
    bones[base + jointIndices.y] * jointWeights.y +
    bones[base + jointIndices.z] * jointWeights.z +
    bones[base + jointIndices.w] * jointWeights.w;
}
