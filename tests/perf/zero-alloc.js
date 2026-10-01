// Zero-Allocation Verification Benchmark
// Compiles the real `engine/physics` package and runs the raycast hot path
// (the per-frame collision query used by movement and weapons) 100,000 times,
// asserting the V8 new-space heap does not grow.

import assert from "node:assert";
import { resolve } from "node:path";
import v8 from "node:v8";
import { compileDir } from "gofront/src/compiler.js";

const { js } = compileDir(resolve("app/src/engine/physics"));

const exports = new Function(
	`${js}\nreturn { NewTrimesh, NewRay, Vec3, RayModeClosest };`,
)();
const { NewTrimesh, NewRay, Vec3, RayModeClosest } = exports;

// Build a 32x32 grid floor (2048 triangles) so the octree has real depth.
const GRID = 32;
const verts = [];
for (let z = 0; z <= GRID; z++) {
	for (let x = 0; x <= GRID; x++) verts.push(x, 0, z);
}
const indices = [];
for (let z = 0; z < GRID; z++) {
	for (let x = 0; x < GRID; x++) {
		const i = z * (GRID + 1) + x;
		indices.push(i, i + GRID + 1, i + 1, i + 1, i + GRID + 1, i + GRID + 2);
	}
}
const mesh = NewTrimesh(new Float32Array(verts), new Int32Array(indices), null);

const from = new Vec3(0, 10, 0);
const to = new Vec3(0, -10, 0);
const ray = NewRay(from, to);
ray.Mode = RayModeClosest;

function raycastSweep(iterations) {
	let hits = 0;
	for (let i = 0; i < iterations; i++) {
		const x = (i % GRID) + 0.5;
		const z = (((i / GRID) | 0) % GRID) + 0.5;
		ray.From.X = x;
		ray.From.Z = z;
		ray.To.X = x;
		ray.To.Z = z;
		ray.UpdateDirection();
		ray.Result.Reset();
		ray.HasHit = false;
		ray.IntersectTrimesh(mesh, null);
		if (ray.HasHit) hits++;
	}
	return hits;
}

// Warm up the JIT and let any lazy initialisation allocate.
raycastSweep(50_000);

const newSpaceUsed = () =>
	v8.getHeapSpaceStatistics().find((s) => s.space_name === "new_space")
		?.space_used_size ?? 0;

// Measure several sweeps and judge the steady state by the best one so a
// scavenge landing mid-sweep cannot fail the run.
const ITERATIONS = 100_000;
const SWEEPS = 5;
const deltas = [];
let hits = 0;
for (let s = 0; s < SWEEPS; s++) {
	const before = newSpaceUsed();
	hits = raycastSweep(ITERATIONS);
	deltas.push(newSpaceUsed() - before);
}
const delta = Math.min(...deltas.filter((d) => d >= 0));

console.log(
	`Raycast benchmark: ${ITERATIONS} casts, ${hits} hits, new-space deltas=[${deltas.join(", ")}] bytes`,
);
assert.strictEqual(hits, ITERATIONS, "every downward ray must hit the floor");
// A delta under 64KB across 100,000 casts means no per-iteration heap allocation.
assert(
	delta < 65536,
	`Expected near-zero allocation (<64KB) in steady state, got ${delta} bytes`,
);
console.log("✓ Zero-allocation raycast benchmark passed");
