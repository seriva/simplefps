@fragment
fn fs_main(input: GeomVertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    var color = textureSample(colorTexture, colorSampler, input.uv);
    if (color.a < 0.5) {
        discard;
    }

    var N = normalize(input.normal);

    // Probe colour for dynamic (unlightmapped) objects; skybox ignores it.
    if (materialData.flags.w == 0 && materialData.flags.x != SKYBOX) {
        color = vec4<f32>(color.rgb * objectData.probe.rgb, color.a);
    }

    if (materialData.flags.w == 1 && materialData.flags.x != SKYBOX) {
        color = color * textureSample(lightmapTexture, lightmapSampler, input.lightmapUV);
    }

    // Procedural detail (normal + parallax) on lightmapped geometry.
    if (materialData.flags.x != SKYBOX && frameData.viewportSize.z > 0.5 && materialData.flags.w == 1) {
        let dist = distance(frameData.cameraPosition.xyz, input.worldPosition.xyz);
        let detailFade = 1.0 - smoothstep(100.0, 500.0, dist);

        let dp1 = dpdx(input.worldPosition.xyz);
        let dp2 = dpdy(input.worldPosition.xyz);
        let duv1 = dpdx(input.uv);
        let duv2 = dpdy(input.uv);

        if (detailFade > 0.01) {
            let dp2perp = cross(dp2, N);
            let dp1perp = cross(N, dp1);
            let T = dp2perp * duv1.x + dp1perp * duv2.x;
            let B = dp2perp * duv1.y + dp1perp * duv2.y;
            let invmax = inverseSqrt(max(dot(T,T), dot(B,B)));
            let TBN = mat3x3<f32>(T * invmax, B * invmax, N);

            let viewDir = normalize(frameData.cameraPosition.xyz - input.worldPosition.xyz);
            let tangentViewDir = normalize(transpose(TBN) * viewDir);

            let uv1 = input.uv * 4.0;
            let rot = mat2x2<f32>(0.829, 0.559, -0.559, 0.829);
            let uv2 = (rot * (input.uv * 7.37)) + vec2<f32>(0.43, 0.81);

            let h1 = textureSampleLevel(proceduralNoise, colorSampler, uv1, 0.0).a;
            let parallaxOffset = tangentViewDir.xy * (h1 * 0.02 * detailFade);

            let s1 = textureSampleLevel(proceduralNoise, colorSampler, uv1 - parallaxOffset, 0.0);
            let s2 = textureSampleLevel(proceduralNoise, colorSampler, uv2 - parallaxOffset, 0.0);

            let detailNormal = normalize((s1.rgb * 2.0 - 1.0) + (s2.rgb * 2.0 - 1.0));
            let height = (s1.a + s2.a) * 0.5;
            let surfaceNormal = normalize(TBN * detailNormal);

            let p = input.worldPosition;
            let macroVar = (sin(p.x * 0.13 + p.z * 0.07) + sin(p.z * 0.11 - p.x * 0.05) + sin(p.y * 0.1));
            let macroFactor = (macroVar / 3.0) * 0.5 + 0.5;

            let occlusion = clamp(dot(surfaceNormal, N), 0.5, 1.0) * mix(0.5, 1.0, height);
            let modFactor = detailFade * (0.3 + 0.7 * macroFactor);

            color = vec4<f32>(color.rgb * mix(1.0, occlusion, modFactor), color.a);
            N = normalize(mix(N, surfaceNormal, 0.5 * detailFade));
        }
    }

    output.emissive = vec4<f32>(0.0);

    let lightmapFlag = select(1.0, f32(materialData.flags.w), materialData.flags.x != SKYBOX);
    if (materialData.flags.x != SKYBOX) {
        output.position = vec4<f32>(input.worldPosition.xyz, 1.0);
        output.normal = vec4<f32>(octEncode(N), 1.0, 0.0); // .b=1: real geometry
    } else {
        output.position = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        output.normal = vec4<f32>(0.5, 0.5, 0.0, 0.0); // .b=0: skybox pixel
    }

    if (materialData.flags.z == 1) {
        color = applyReflection(color, input.uv, input.worldPosition.xyz, N);
    }

    if (materialData.flags.y == 1) {
        output.emissive = textureSample(emissiveTexture, colorSampler, input.uv);
    }

    output.color = vec4<f32>((color + output.emissive).rgb, lightmapFlag);
    return output;
}
