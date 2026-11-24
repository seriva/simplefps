fn octEncode(n: vec3<f32>) -> vec2<f32> {
    var v = n / (abs(n.x) + abs(n.y) + abs(n.z));
    if (v.z < 0.0) {
        let ox = v.x;
        let oy = v.y;
        v.x = (1.0 - abs(oy)) * select(-1.0, 1.0, ox >= 0.0);
        v.y = (1.0 - abs(ox)) * select(-1.0, 1.0, oy >= 0.0);
    }
    return v.xy * 0.5 + 0.5;
}

fn octDecode(f_in: vec2<f32>) -> vec3<f32> {
    var f = f_in * 2.0 - 1.0;
    var n = vec3<f32>(f, 1.0 - abs(f.x) - abs(f.y));
    if (n.z < 0.0) {
        let ox = n.x;
        let oy = n.y;
        n.x = (1.0 - abs(oy)) * select(-1.0, 1.0, ox >= 0.0);
        n.y = (1.0 - abs(ox)) * select(-1.0, 1.0, oy >= 0.0);
    }
    return normalize(n);
}
