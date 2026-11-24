struct Particle {
    pos: vec3<f32>,
    duration: f32,
    vel: vec3<f32>,
    life: f32,
    scale: f32,
    gravity: f32,
    rotation: f32,
    pad: f32,
}

// Scalars only: a vec3 member would pad the struct to 32 bytes and break
// the 24-byte ParticleInstanceStride vertex layout.
struct Instance {
    px: f32,
    py: f32,
    pz: f32,
    scale: f32,
    rotation: f32,
    opacity: f32,
}

@group(1) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(1) @binding(1) var<storage, read_write> instances: array<Instance>;
// curve.x = scale multiplier, curve.y = opacity multiplier sampled by progress.
@group(1) @binding(2) var<storage, read> curve: array<vec2<f32>>;

@compute @workgroup_size(64, 1, 1)
fn cs_main(@builtin(global_invocation_id) id: vec3<u32>) {
    let count = u32(objectData.params0.z);
    let i = id.x;
    if (i >= count) { return; }
    var p = particles[i];
    let dt = objectData.params0.x;
    p.life -= objectData.params0.y;
    var inst: Instance;
    inst.px = p.pos.x;
    inst.py = p.pos.y;
    inst.pz = p.pos.z;
    if (p.life <= 0.0) {
        inst.scale = 0.0;
        inst.rotation = 0.0;
        inst.opacity = 0.0;
        instances[i] = inst;
        particles[i] = p;
        return;
    }
    p.vel.y -= p.gravity * dt;
    p.pos += p.vel * dt;
    particles[i] = p;

    let progress = clamp(1.0 - p.life / p.duration, 0.0, 1.0);
    let lutSize = objectData.params0.w;
    let fi = progress * (lutSize - 1.0);
    let i0 = u32(floor(fi));
    let i1 = min(i0 + 1u, u32(lutSize) - 1u);
    let t = fi - f32(i0);
    let c = mix(curve[i0], curve[i1], t);
    inst.px = p.pos.x;
    inst.py = p.pos.y;
    inst.pz = p.pos.z;
    inst.scale = p.scale * c.x;
    inst.rotation = p.rotation;
    inst.opacity = c.y;
    instances[i] = inst;
}
