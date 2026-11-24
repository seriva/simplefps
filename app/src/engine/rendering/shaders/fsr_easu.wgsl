fn easuWeight(sampleOff: vec2<f32>, dir: vec2<f32>, stretch: f32) -> f32 {
    let along = abs(sampleOff.x * dir.x + sampleOff.y * dir.y);
    let perp  = abs(sampleOff.x * dir.y - sampleOff.y * dir.x);
    let d = sqrt(along * along + perp * perp * stretch * stretch);
    if d < 1.0 {
        return (1.5 * d - 2.5) * d * d + 1.0;
    } else if d < 2.0 {
        return ((-0.5 * d + 2.5) * d - 4.0) * d + 2.0;
    }
    return 0.0;
}

@fragment
fn fs_main(input: FullscreenOutput) -> @location(0) vec4<f32> {
    let inputSize = objectData.params0.xy;
    let outputSize = objectData.params0.zw;
    let invInput = 1.0 / inputSize;

    let srcPos = input.position.xy * inputSize / outputSize - 0.5;
    let base = floor(srcPos);
    let f = srcPos - base;
    let tc = (base + 0.5) * invInput;
    let dx = vec2<f32>(invInput.x, 0.0);
    let dy = vec2<f32>(0.0, invInput.y);

    let b  = textureSampleLevel(colorBuffer, bufferSampler, tc - dy, 0.0).rgb;
    let c  = textureSampleLevel(colorBuffer, bufferSampler, tc + dx - dy, 0.0).rgb;
    let d  = textureSampleLevel(colorBuffer, bufferSampler, tc - dx, 0.0).rgb;
    let e  = textureSampleLevel(colorBuffer, bufferSampler, tc, 0.0).rgb;
    let fS = textureSampleLevel(colorBuffer, bufferSampler, tc + dx, 0.0).rgb;
    let g  = textureSampleLevel(colorBuffer, bufferSampler, tc + 2.0 * dx, 0.0).rgb;
    let h  = textureSampleLevel(colorBuffer, bufferSampler, tc - dx + dy, 0.0).rgb;
    let iS = textureSampleLevel(colorBuffer, bufferSampler, tc + dy, 0.0).rgb;
    let j  = textureSampleLevel(colorBuffer, bufferSampler, tc + dx + dy, 0.0).rgb;
    let k  = textureSampleLevel(colorBuffer, bufferSampler, tc + 2.0 * dx + dy, 0.0).rgb;
    let l  = textureSampleLevel(colorBuffer, bufferSampler, tc + 2.0 * dy, 0.0).rgb;
    let m  = textureSampleLevel(colorBuffer, bufferSampler, tc + dx + 2.0 * dy, 0.0).rgb;

    let luma = vec3<f32>(0.299, 0.587, 0.114);
    let le = dot(e, luma);  let lf = dot(fS, luma);
    let li = dot(iS, luma); let lj = dot(j, luma);
    let lb = dot(b, luma);  let lc = dot(c, luma);
    let ld = dot(d, luma);  let lg = dot(g, luma);
    let lh = dot(h, luma);  let lk = dot(k, luma);
    let ll = dot(l, luma);  let lm = dot(m, luma);

    let dirX = (lc-lb) + (lf-le) + (lj-li) + (lm-ll) + (lg-ld) + (lk-lh);
    let dirY = (lh-ld) + (li-le) + (lj-lf) + (lk-lg) + (ll-lb) + (lm-lc);
    let dirLen = max(abs(dirX), abs(dirY));
    let invDirLen = 1.0 / (dirLen + 1.0e-8);
    let dir = vec2<f32>(dirX * invDirLen, dirY * invDirLen);

    let minEdge = min(min(le, lf), min(li, lj));
    let maxEdge = max(max(le, lf), max(li, lj));
    let edgeAmount = clamp((maxEdge - minEdge) / max(maxEdge, 1.0e-5), 0.0, 1.0);
    let stretch = 1.0 + edgeAmount * 0.5;

    let we  = easuWeight(vec2<f32>( 0.0,  0.0) - f, dir, stretch);
    let wfS = easuWeight(vec2<f32>( 1.0,  0.0) - f, dir, stretch);
    let wiS = easuWeight(vec2<f32>( 0.0,  1.0) - f, dir, stretch);
    let wj  = easuWeight(vec2<f32>( 1.0,  1.0) - f, dir, stretch);
    let wb  = easuWeight(vec2<f32>( 0.0, -1.0) - f, dir, stretch);
    let wc  = easuWeight(vec2<f32>( 1.0, -1.0) - f, dir, stretch);
    let wd  = easuWeight(vec2<f32>(-1.0,  0.0) - f, dir, stretch);
    let wg  = easuWeight(vec2<f32>( 2.0,  0.0) - f, dir, stretch);
    let wh  = easuWeight(vec2<f32>(-1.0,  1.0) - f, dir, stretch);
    let wk  = easuWeight(vec2<f32>( 2.0,  1.0) - f, dir, stretch);
    let wl  = easuWeight(vec2<f32>( 0.0,  2.0) - f, dir, stretch);
    let wm  = easuWeight(vec2<f32>( 1.0,  2.0) - f, dir, stretch);

    let color = e*we + fS*wfS + iS*wiS + j*wj
    + b*wb + c*wc + d*wd + g*wg
    + h*wh + k*wk + l*wl + m*wm;
    let totalW = we+wfS+wiS+wj+wb+wc+wd+wg+wh+wk+wl+wm;

    let nMin = min(min(min(b,c),min(d,e)),min(min(fS,g),min(min(h,iS),min(min(j,k),min(l,m)))));
    let nMax = max(max(max(b,c),max(d,e)),max(max(fS,g),max(max(h,iS),max(max(j,k),max(l,m)))));

    return vec4<f32>(clamp(color / totalW, nMin, nMax), 1.0);
}
