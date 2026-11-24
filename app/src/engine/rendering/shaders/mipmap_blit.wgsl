struct VSOutput {
	@builtin(position) position: vec4<f32>,
	@location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VSOutput {
	var pos = array<vec2<f32>, 4>(
		vec2(-1.0, 1.0), vec2(1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, -1.0)
	);
	var uv = array<vec2<f32>, 4>(
		vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0)
	);
	var out: VSOutput;
	out.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
	out.uv = uv[vertexIndex];
	return out;
}

@group(0) @binding(0) var imgSampler: sampler;
@group(0) @binding(1) var img: texture_2d<f32>;

@fragment
fn fs_main(in: VSOutput) -> @location(0) vec4<f32> {
	return textureSample(img, imgSampler, in.uv);
}
