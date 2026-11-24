fn calcPointLight(lightPos: vec3<f32>, lightSize: f32, fragPos: vec3<f32>, normal: vec3<f32>) -> vec2<f32> {
    let lightDir = lightPos - fragPos;
    let distSq = dot(lightDir, lightDir);
    let sizeSq = lightSize * lightSize;
    if (distSq > sizeSq) { return vec2<f32>(0.0); }

    let normalizedDist = sqrt(distSq) / lightSize;
    let falloff = 1.0 - smoothstep(0.0, 1.0, normalizedDist);

    let L = normalize(lightDir);
    let nDotL = max(0.0, dot(normal, L));

    return vec2<f32>(falloff * falloff, nDotL);
}

fn calcSpotLight(lightPos: vec3<f32>, lightDir: vec3<f32>, cutoff: f32, range: f32, fragPos: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
    let toLight = lightPos - fragPos;
    let dist = length(toLight);
    if (dist > range) { return vec3<f32>(0.0); }

    let toLightNorm = normalize(toLight);
    let spotEffect = dot(toLightNorm, -normalize(lightDir));
    if (spotEffect < cutoff) { return vec3<f32>(0.0); }

    var spotFalloff = (spotEffect - cutoff) / (1.0 - cutoff);
    spotFalloff = smoothstep(0.0, 1.0, spotFalloff);

    let attenuation = 1.0 - pow(dist / range, 1.5);
    let nDotL = max(0.0, dot(normal, toLightNorm));

    return vec3<f32>(attenuation, spotFalloff, nDotL);
}
