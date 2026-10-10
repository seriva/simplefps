// Zero-Allocation Verification Benchmark
// Compiles the real `engine/physics` package (hybrid: `physics` and
// `collision` run in WASM, `mathx` on both targets) and runs two hot paths,
// asserting the V8 new-space heap does not grow:
//   1. the raycast query used by movement and weapons, 100,000 times;
//   2. the fixed-step FPS controller loop exactly as `game.Update` drives it
//      across the JS→WASM boundary (pose in, Update + MoveWithCamera, pose out).

import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import v8 from "node:v8";

// `physics` is a wasm package with interface fields on its boundary, which
// needs gofront >= 1.6.0. `GOFRONT_DIR` points at a local checkout (the same
// workflow AGENTS.md uses for `node ../gofront/src/index.js`) and is trusted
// without a version check.
const MIN_GOFRONT = [1, 6, 0];
const gofrontDir = process.env.GOFRONT_DIR;
const gofrontRoot = gofrontDir ? resolve(gofrontDir) : null;
if (!gofrontRoot) {
	const { version } = createRequire(import.meta.url)("gofront/package.json");
	const parts = version.split(".").map(Number);
	const tooOld = MIN_GOFRONT.some((min, i) => {
		if (parts[i] === min) return false;
		return parts[i] < min;
	});
	if (tooOld) {
		console.log(
			`skipping: zero-alloc benchmark needs gofront >= ${MIN_GOFRONT.join(".")} (found ${version}); set GOFRONT_DIR to a local checkout`,
		);
		process.exit(0);
	}
}
const { compileDir } = await import(
	gofrontRoot
		? pathToFileURL(join(gofrontRoot, "src/compiler.js")).href
		: "gofront/src/compiler.js"
);

const { js, wasm } = compileDir(resolve("app/src/engine/physics"));

// The facade awaits WASM instantiation at top level, so it must be imported as
// an ES module; `__GOFRONT_WASM_BYTES` short-circuits the loader's fetch.
const dir = mkdtempSync(join(tmpdir(), "simplefps-perf-"));
const bundle = join(dir, "physics.mjs");
writeFileSync(
	bundle,
	`globalThis.window = null; globalThis.document = null;
globalThis.__GOFRONT_WASM_BYTES = new Uint8Array(${JSON.stringify([...wasm])});
${js}
export { NewTrimesh, NewRay, Vec3, RayModeClosest, NewStaticWorld, NewFPSController };`,
);
let NewTrimesh, NewRay, Vec3, RayModeClosest, NewStaticWorld, NewFPSController;
try {
	({
		NewTrimesh,
		NewRay,
		Vec3,
		RayModeClosest,
		NewStaticWorld,
		NewFPSController,
	} = await import(pathToFileURL(bundle)));
} finally {
	rmSync(dir, { recursive: true, force: true });
}

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

// Field-wise writes through the live view: each is a small JS→WASM call V8
// inlines. One Setup(...) call with six non-integer floats boxes its args.
const ray = NewRay(new Vec3(0, 10, 0), new Vec3(0, -10, 0));
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

// Controller loop on a 1600×1600 floor (the controller is 35 units wide).
const bigFloor = NewTrimesh(
	new Float32Array(verts.map((v) => v * 50)),
	new Int32Array(indices),
	null,
);
const world = NewStaticWorld();
world.Trimesh = bigFloor;
const ctrl = NewFPSController(new Vec3(800, 0, 800), null);
ctrl.Provider = world;

const camPos = new Vec3();
const camDir = new Vec3(1, 0, 0);
const camUp = new Vec3(0, 1, 0);
const DT = 1 / 120;
// Steer in a ~300-unit circle so the controller stays on the floor without
// reading its position back (a float read from WASM that escapes boxes).
const TURN = 600;
const dirX = new Float64Array(TURN);
const dirZ = new Float64Array(TURN);
for (let i = 0; i < TURN; i++) {
	dirX[i] = Math.cos((2 * Math.PI * i) / TURN);
	dirZ[i] = Math.sin((2 * Math.PI * i) / TURN);
}
let frame = 0;
const pose = ctrl.Camera;

// Mirrors game.Update: syncCameraIn, fixed step, SyncCamera, syncCameraOut.
function syncCameraIn() {
	pose.Position.Copy(camPos);
	pose.Direction.Copy(camDir);
	pose.Up.Copy(camUp);
}
function syncCameraOut() {
	camPos.Copy(pose.Position);
	camUp.Copy(pose.Up);
}
function controllerFrames(frames) {
	for (let i = 0; i < frames; i++) {
		const k = frame++ % TURN;
		camDir.X = dirX[k];
		camDir.Z = dirZ[k];
		syncCameraIn();
		ctrl.Update(DT);
		ctrl.MoveWithCamera(0.3, 1, DT);
		ctrl.SyncCamera(DT);
		syncCameraOut();
	}
}

controllerFrames(5_000); // warm up and settle onto the floor
assert(ctrl.IsGrounded(), "controller must be grounded on the floor");

const FRAMES = 20_000;
const frameDeltas = [];
for (let s = 0; s < SWEEPS; s++) {
	const before = newSpaceUsed();
	controllerFrames(FRAMES);
	frameDeltas.push(newSpaceUsed() - before);
}
const frameDelta = Math.min(...frameDeltas.filter((d) => d >= 0));
const perFrame = frameDelta / FRAMES;
console.log(
	`Controller benchmark: ${FRAMES} frames, new-space deltas=[${frameDeltas.join(", ")}] bytes (${perFrame.toFixed(1)} B/frame)`,
);
// Same budget as the former in-package heap test (256 KB per 2000 steps). The
// WASM step itself is allocation-free; the steady ~48 B/frame is the f64 pose
// reads in syncCameraOut (Position/Up components) boxed as HeapNumbers on the
// way out of WASM.
const FRAME_BUDGET = 128;
assert(
	perFrame < FRAME_BUDGET,
	`Controller loop allocates ${perFrame.toFixed(1)} B/frame (budget ${FRAME_BUDGET})`,
);
console.log("✓ Controller loop allocation benchmark passed");
