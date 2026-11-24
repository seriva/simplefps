struct TransparentVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) normal: vec3<f32>,
}

struct TransparentVertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) worldPosition: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

@vertex
fn vs_main(input: TransparentVertexInput) -> TransparentVertexOutput {
    var output: TransparentVertexOutput;
    output.worldPosition = objectData.matWorld * vec4<f32>(input.position, 1.0);
    output.uv = input.uv;
    output.normal = normalize((objectData.matWorld * vec4<f32>(input.normal, 0.0)).xyz);
    output.clipPosition = frameData.matViewProj * output.worldPosition;
    return output;
}

@fragment
fn fs_main(input: TransparentVertexOutput) -> @location(0) vec4<f32> {
    var baseColor = textureSample(colorTexture, colorSampler, input.uv);
    let emissive = textureSample(emissiveTexture, colorSampler, input.uv);
    baseColor = vec4<f32>(baseColor.rgb + emissive.rgb, baseColor.a * materialData.params.y);

    let normal = normalize(input.normal);
    let fragPos = input.worldPosition.xyz;

    if (materialData.flags.z == 1) {
        let reflMask = textureSample(reflectionMaskTexture, colorSampler, input.uv);
        let maskSum = dot(reflMask.rgb, vec3<f32>(0.333333));
        if (maskSum > 0.1) {
            let viewDir = normalize(frameData.cameraPosition.xyz - fragPos);
            let r = reflect(-viewDir, normal);
            let m = 2.0 * sqrt(dot(r.xy, r.xy) + (r.z + 1.0) * (r.z + 1.0)) + 0.00001;
            let reflUV = r.xy / m + 0.5;
            let reflColor = textureSampleLevel(reflectionTexture, colorSampler, reflUV, 0.0);
            baseColor = mix(baseColor, reflColor * reflMask, materialData.params.x * maskSum);
        }
    }

    var dynamicLighting = vec3<f32>(0.0);
    let numPoint = u32(lightingData.counts.x);
    let numSpot = u32(lightingData.counts.y);
    for (var i = 0u; i < numPoint; i++) {
        let l = lights[i];
        let pl = calcPointLight(l.posRange.xyz, l.posRange.w, fragPos, normal);
        dynamicLighting += l.colorIntensity.rgb * (pl.x * pl.y * l.colorIntensity.w);
    }
    for (var i = 0u; i < numSpot; i++) {
        let l = lights[numPoint + i];
        let sl = calcSpotLight(l.posRange.xyz, l.dirCutoff.xyz, l.dirCutoff.w, l.posRange.w, fragPos, normal);
        dynamicLighting += l.colorIntensity.rgb * (l.colorIntensity.w * 2.0) * sl.x * sl.y * sl.z;
    }

    let finalColor = vec3<f32>(baseColor.rgb * 0.5 + baseColor.rgb * dynamicLighting);
    return vec4<f32>(finalColor, baseColor.a);
}
