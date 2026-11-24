@group(1) @binding(0) var blurSampler: sampler;
@group(1) @binding(1) var srcTexture: texture_2d<f32>;
@group(1) @binding(2) var dstTexture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8, 1)
fn cs_main(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = textureDimensions(dstTexture);
    if (id.x >= size.x || id.y >= size.y) { return; }
    let texelSize = 1.0 / vec2<f32>(size);
    let uv = (vec2<f32>(id.xy) + 0.5) * texelSize;
    let offset = objectData.params0.x;
    if (offset < 0.0) {
        textureStore(dstTexture, vec2<i32>(id.xy), textureSampleLevel(srcTexture, blurSampler, uv, 0.0));
        return;
    }
    let o = offset + 0.5;
    var color = textureSampleLevel(srcTexture, blurSampler, uv, 0.0);
    color += textureSampleLevel(srcTexture, blurSampler, uv + vec2<f32>(-o, -o) * texelSize, 0.0);
    color += textureSampleLevel(srcTexture, blurSampler, uv + vec2<f32>( o, -o) * texelSize, 0.0);
    color += textureSampleLevel(srcTexture, blurSampler, uv + vec2<f32>(-o,  o) * texelSize, 0.0);
    color += textureSampleLevel(srcTexture, blurSampler, uv + vec2<f32>( o,  o) * texelSize, 0.0);
    textureStore(dstTexture, vec2<i32>(id.xy), color * 0.2);
}
