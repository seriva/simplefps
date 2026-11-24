@fragment
fn fs_main(input: FullscreenOutput) -> @location(0) vec4<f32> {
    let p = vec2<i32>(input.position.xy);
    let sharpness = objectData.params0.x;

    let b = textureLoad(colorBuffer, p + vec2<i32>(0, -1), 0).rgb;
    let d = textureLoad(colorBuffer, p + vec2<i32>(-1, 0), 0).rgb;
    let e = textureLoad(colorBuffer, p, 0).rgb;
    let f = textureLoad(colorBuffer, p + vec2<i32>(1, 0), 0).rgb;
    let h = textureLoad(colorBuffer, p + vec2<i32>(0, 1), 0).rgb;

    let bL = b.g * 0.5 + (b.r + b.b) * 0.25;
    let dL = d.g * 0.5 + (d.r + d.b) * 0.25;
    let eL = e.g * 0.5 + (e.r + e.b) * 0.25;
    let fL = f.g * 0.5 + (f.r + f.b) * 0.25;
    let hL = h.g * 0.5 + (h.r + h.b) * 0.25;

    let nz = 0.25 * (bL + dL + fL + hL) - eL;
    let rangeL = max(max(bL, dL), max(eL, max(fL, hL)))
    - min(min(bL, dL), min(eL, min(fL, hL)));
    let nzC = clamp(abs(nz) / max(rangeL, 1e-6), 0.0, 1.0);
    let nzW = -0.5 * nzC + 1.0;

    let mn4 = min(min(b, d), min(f, h));
    let mx4 = max(max(b, d), max(f, h));

    let peakC = 1.0 / (-4.0 * sharpness + 8.0);

    let hitMinR = min(mn4.r, e.r) / (4.0 * max(mx4.r, e.r) + 1e-6);
    let hitMinG = min(mn4.g, e.g) / (4.0 * max(mx4.g, e.g) + 1e-6);
    let hitMinB = min(mn4.b, e.b) / (4.0 * max(mx4.b, e.b) + 1e-6);
    let hitMaxR = (peakC - max(mx4.r, e.r)) / (4.0 * min(mn4.r, e.r) + peakC);
    let hitMaxG = (peakC - max(mx4.g, e.g)) / (4.0 * min(mn4.g, e.g) + peakC);
    let hitMaxB = (peakC - max(mx4.b, e.b)) / (4.0 * min(mn4.b, e.b) + peakC);

    let lobeR = max(-hitMinR, hitMaxR);
    let lobeG = max(-hitMinG, hitMaxG);
    let lobeB = max(-hitMinB, hitMaxB);

    var lobe = max(-peakC, min(max(lobeR, max(lobeG, lobeB)), 0.0));
    lobe *= nzW;

    var color = (b + d + f + h) * lobe + e;
    color = color / (4.0 * lobe + 1.0);

    return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
