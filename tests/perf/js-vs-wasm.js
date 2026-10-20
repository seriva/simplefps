// JS-only vs hybrid throughput benchmark.
// Compiles the real `engine/physics` and `engine/animation` packages twice —
// once with every package forced to JavaScript (`--js-only`) and once as
// shipped (`physics`, `collision` and `animation` in WASM, `mathx` on both
// targets) — and times the per-frame hot paths the game drives across the
// boundary:
//   1. the closest-hit raycast against a 2048-triangle octree floor;
//   2. the fixed-step FPS controller loop (pose in, Update + MoveWithCamera +
//      SyncCamera, pose out);
//   3. one skinned-character frame (AnimationPlayer.Update +
//      ComputeSkinningMatrices + copying the 64-joint palette out of the
//      shared bone buffer).
// Prints per-second rates for both builds plus the hybrid/JS ratio. This is a
// report, not a gate: it never fails on a slowdown.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MIN_GOFRONT = [1, 6, 0];
const gofrontDir = process.env.GOFRONT_DIR;
const gofrontRoot = gofrontDir ? resolve(gofrontDir) : null;
if (!gofrontRoot) {
	const { version } = createRequire(import.meta.url)("gofront/package.json");
	const parts = version.split(".").map(Number);
	const firstDiff = MIN_GOFRONT.findIndex((min, i) => parts[i] !== min);
	const tooOld = firstDiff !== -1 && parts[firstDiff] < MIN_GOFRONT[firstDiff];
	if (tooOld) {
		console.log(
			`skipping: js-vs-wasm benchmark needs gofront >= ${MIN_GOFRONT.join(".")} (found ${version}); set GOFRONT_DIR to a local checkout`,
		);
		process.exit(0);
	}
}
const { compileDir } = await import(
	gofrontRoot
		? pathToFileURL(join(gofrontRoot, "src/compiler.js")).href
		: "gofront/src/compiler.js"
);

async function loadPackage(pkg, exportNames, forceJs) {
	const opts = { rootDir: resolve("app/src") };
	if (forceJs) opts.forceTarget = "js";
	const { js, wasm } = compileDir(resolve(`app/src/engine/${pkg}`), opts);
	const dir = mkdtempSync(join(tmpdir(), "simplefps-bench-"));
	const bundle = join(dir, `${pkg.replace(/\//g, "_")}.mjs`);
	writeFileSync(
		bundle,
		`globalThis.window = null; globalThis.document = null;
${wasm ? `globalThis.__GOFRONT_WASM_BYTES = new Uint8Array(${JSON.stringify([...wasm])});` : ""}
${js}
export { ${exportNames.join(", ")} };`,
	);
	try {
		return {
			mod: await import(pathToFileURL(bundle)),
			wasmBytes: wasm?.length ?? 0,
		};
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

// 32x32 grid floor (2048 triangles) so the octree has real depth.
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

const CASTS = 200_000;
const FRAMES = 50_000;
const SKIN_FRAMES = 50_000;
const ASSET_OPS = 50;
const JOINTS = 64;
const REPEATS = 5;
const DT = 1 / 120;
const TURN = 600;

const demoMeshBytes = new Uint8Array(
	readFileSync(resolve("app/resources/arenas/demo/geometry.bmesh")),
);
const demoAnimBytes = new Uint8Array(
	readFileSync(resolve("app/resources/models/robot/robot.banim")),
);

function bench(label, fn, iterations) {
	let best = Infinity;
	for (let r = 0; r < REPEATS; r++) {
		const t0 = process.hrtime.bigint();
		fn(iterations);
		const ns = Number(process.hrtime.bigint() - t0);
		best = Math.min(best, ns);
	}
	const perSec = (iterations / best) * 1e9;
	return { label, perSec, nsPer: best / iterations };
}

function setup(m) {
	const [mesh, meshErr] = m.NewTrimesh(
		new Float32Array(verts),
		new Int32Array(indices),
		null,
	);
	if (meshErr) throw meshErr;
	const ray = m.NewRay(new m.Vec3(0, 10, 0), new m.Vec3(0, -10, 0));
	ray.Mode = m.RayModeClosest;
	let hits = 0;
	const raycastSweep = (n) => {
		for (let i = 0; i < n; i++) {
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
	};
	const raycastSpatialHashFlat = (n) => {
		mesh.SetBroadphase(1);
		for (let i = 0; i < n; i++) {
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
	};

	const buildSpatialHash = (n) => {
		for (let i = 0; i < n; i++) mesh.BuildSpatialHash(0);
	};
	const [hashVoxels, hashRefs, flatCells] = mesh.SpatialHashStats();

	const [bigFloor, floorErr] = m.NewTrimesh(
		new Float32Array(verts.map((v) => v * 50)),
		new Int32Array(indices),
		null,
	);
	if (floorErr) throw floorErr;
	const world = m.NewStaticWorld();
	world.Trimesh = bigFloor;
	const ctrl = m.NewFPSController(new m.Vec3(800, 0, 800), null);
	ctrl.Provider = world;
	const camPos = new m.Vec3();
	const camDir = new m.Vec3(1, 0, 0);
	const camUp = new m.Vec3(0, 1, 0);
	const dirX = new Float64Array(TURN);
	const dirZ = new Float64Array(TURN);
	for (let i = 0; i < TURN; i++) {
		dirX[i] = Math.cos((2 * Math.PI * i) / TURN);
		dirZ[i] = Math.sin((2 * Math.PI * i) / TURN);
	}
	let frame = 0;
	const pose = ctrl.Camera;
	const controllerFrames = (n) => {
		for (let i = 0; i < n; i++) {
			const k = frame++ % TURN;
			camDir.X = dirX[k];
			camDir.Z = dirZ[k];
			pose.Position.Copy(camPos);
			pose.Direction.Copy(camDir);
			pose.Up.Copy(camUp);
			ctrl.Update(DT);
			ctrl.MoveWithCamera(0.3, 1, DT);
			ctrl.SyncCamera(DT);
			camPos.Copy(pose.Position);
			camUp.Copy(pose.Up);
		}
	};
	return {
		raycastSweep,
		raycastSpatialHashFlat,
		buildSpatialHash,
		controllerFrames,
		hits: () => hits,
		stats: () => ({
			sh: [hashVoxels, hashRefs, flatCells],
		}),
	};
}

// A 64-joint chain with a 10-frame looping clip, driven the way
// scene.SkinnedMeshEntity.Update does it.
function setupSkinning(m) {
	const defs = [];
	for (let i = 0; i < JOINTS; i++) {
		const d = new m.JointDef();
		d.Name = `j${i}`;
		d.Parent = i === 0 ? -1 : i - 1;
		d.Pos = new Float32Array([1, 0, 0]);
		d.Rot = new Float32Array([0, 0, 0, 1]);
		defs.push(d);
	}
	const skeleton = m.NewSkeleton(defs);
	const poses = [];
	for (let f = 0; f < 10; f++) {
		const p = m.NewPose(JOINTS);
		for (let j = 0; j < JOINTS; j++) {
			p.SetJointTransform(j, 1, f * 0.1, 0, 0, Math.sin(f) * 0.1, 0, 1);
		}
		poses.push(p);
	}
	const player = m.NewAnimationPlayer(skeleton);
	player.Play(m.NewAnimation("walk", 24, poses, null), true);
	const bones = new Float32Array(JOINTS * 16);
	return (n) => {
		for (let i = 0; i < n; i++) {
			const pose = player.Update(1 / 60);
			const floats = skeleton.ComputeSkinningMatrices(pose) * 16;
			for (let k = 0; k < floats; k++) bones[k] = m.SkinMatrices[k];
		}
	};
}

const results = {};
for (const [label, forceJs] of [
	["js-only", true],
	["hybrid", false],
]) {
	const { mod, wasmBytes } = await loadPackage(
		"physics",
		[
			"NewTrimesh",
			"NewRay",
			"Vec3",
			"RayModeClosest",
			"NewStaticWorld",
			"NewFPSController",
		],
		forceJs,
	);
	const s = setup(mod);
	s.raycastSweep(50_000);
	s.controllerFrames(5_000);
	const anim = await loadPackage(
		"animation",
		[
			"JointDef",
			"NewSkeleton",
			"NewPose",
			"NewAnimation",
			"NewAnimationPlayer",
			"SkinMatrices",
		],
		forceJs,
	);
	const skinFrames = setupSkinning(anim.mod);
	skinFrames(5_000);
	const dec = await loadPackage(
		"assets/decoder",
		["ParseBinaryMesh", "ParseBinaryAnimation"],
		forceJs,
	);
	const parseMesh = (n) => {
		for (let i = 0; i < n; i++) dec.mod.ParseBinaryMesh(demoMeshBytes);
	};
	const parseAnim = (n) => {
		for (let i = 0; i < n; i++)
			dec.mod.ParseBinaryAnimation("robot", demoAnimBytes);
	};
	parseMesh(10);
	parseAnim(10);
	results[label] = {
		wasmBytes,
		animWasmBytes: anim.wasmBytes,
		decWasmBytes: dec.wasmBytes,
		raycast: bench("raycast-map", s.raycastSweep, CASTS),
		raycastShFlat: bench("raycast-flat", s.raycastSpatialHashFlat, CASTS),
		buildSpatialHash: bench("build-sh", s.buildSpatialHash, 500),
		controller: bench("controller", s.controllerFrames, FRAMES),
		skinning: bench("skinning", skinFrames, SKIN_FRAMES),
		parseMesh: bench("parse-mesh", parseMesh, ASSET_OPS),
		parseAnim: bench("parse-anim", parseAnim, ASSET_OPS),
		stats: s.stats(),
	};
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const ratio = (a, b) => `${(a / b).toFixed(2)}×`;
const js = results["js-only"];
const hy = results.hybrid;
console.log(`node ${process.version}, gofront ${gofrontRoot ?? "(installed)"}`);
console.log(
	`raycast    js-only ${fmt(js.raycast.perSec)} casts/s (${js.raycast.nsPer.toFixed(0)} ns)  hybrid ${fmt(hy.raycast.perSec)} casts/s (${hy.raycast.nsPer.toFixed(0)} ns)  hybrid/js ${ratio(hy.raycast.perSec, js.raycast.perSec)}`,
);
console.log(
	`controller js-only ${fmt(js.controller.perSec)} frames/s (${js.controller.nsPer.toFixed(0)} ns)  hybrid ${fmt(hy.controller.perSec)} frames/s (${hy.controller.nsPer.toFixed(0)} ns)  hybrid/js ${ratio(hy.controller.perSec, js.controller.perSec)}`,
);
console.log(
	`skinning   js-only ${fmt(js.skinning.perSec)} frames/s (${js.skinning.nsPer.toFixed(0)} ns)  hybrid ${fmt(hy.skinning.perSec)} frames/s (${hy.skinning.nsPer.toFixed(0)} ns)  hybrid/js ${ratio(hy.skinning.perSec, js.skinning.perSec)}`,
);
console.log(
	`mesh-parse js-only ${fmt(js.parseMesh.perSec)} loads/s (${(js.parseMesh.nsPer / 1e6).toFixed(2)} ms)  hybrid ${fmt(hy.parseMesh.perSec)} loads/s (${(hy.parseMesh.nsPer / 1e6).toFixed(2)} ms)  hybrid/js ${ratio(hy.parseMesh.perSec, js.parseMesh.perSec)}`,
);
console.log(
	`anim-parse js-only ${fmt(js.parseAnim.perSec)} loads/s (${(js.parseAnim.nsPer / 1e6).toFixed(2)} ms)  hybrid ${fmt(hy.parseAnim.perSec)} loads/s (${(hy.parseAnim.nsPer / 1e6).toFixed(2)} ms)  hybrid/js ${ratio(hy.parseAnim.perSec, js.parseAnim.perSec)}`,
);
console.log(
	`physics+collision+mathx wasm (unoptimised): ${fmt(hy.wasmBytes)} bytes; animation+mathx wasm: ${fmt(hy.animWasmBytes)} bytes; decoder wasm: ${fmt(hy.decWasmBytes)} bytes`,
);

console.log("\n--- Spatial Hash Broadphase Performance ---");
const sh = hy.stats.sh;
console.log(
	`Structure:    SpatialHash [voxels=${sh[0]}, refs=${sh[1]}, flatCells=${sh[2]}]`,
);
console.log(
	`Construction (500 builds): SpatialHash ${fmt(hy.buildSpatialHash.perSec)} builds/s (${hy.buildSpatialHash.nsPer.toFixed(0)} ns)`,
);
console.log(`Query Throughput (hybrid WASM, 200,000 casts):`);
console.log(
	`  SH (Map):     ${fmt(hy.raycast.perSec)} casts/s (${hy.raycast.nsPer.toFixed(0)} ns)`,
);
console.log(
	`  SH (Flat):    ${fmt(hy.raycastShFlat.perSec)} casts/s (${hy.raycastShFlat.nsPer.toFixed(0)} ns)`,
);
