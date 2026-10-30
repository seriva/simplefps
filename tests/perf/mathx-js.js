// In-process A/B benchmark of the JS half of `engine/mathx`.
//
// `mathx` is a `both` package: the JS renderer runs its JS output every frame.
// GoFront compiles `both` packages in strict mode (bounds-checked slice
// indexes, nil-pointer checks), so this compiles `engine/mathx` exactly as
// shipped, with no forceTarget (a forced `js` build has no strict checks and
// would hide a regression), once per side (see ab.js), and times the JS
// entry points interleaved.
//
// Gated on A/B (A time / B time, > 1 = B faster; no upper bound, so a speedup
// passes): Mat4Multiply, Mat4Invert, Mat4FromRotationTranslationScale and
// BoundingBox.TransformInto at >= 0.91 (B no more than 1.10× slower),
// Vec3.TransformMat4 at >= 0.87 (1.15×: its remaining cost is one nil check
// per pointer access). Vec3.Add and Vec3.Normalize are reported only; A/A
// noise on these few-ns entries is too large to gate.
//
// Needs GOFRONT_BASELINE_DIR and/or BASELINE_SRC (see ab.js); without either
// it prints a skip message and exits 0, so `npm run test:perf` stays green on
// a bare checkout. Runs `--repeat 5` (median of five process runs) unless
// --repeat is given. Other flags as in ab.js (--rounds, --min, --max, --gate).

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { abSides, collectGarbage, loadSides, runAB } from "./ab.js";

const ITERATIONS = 2_000_000;

const MATHX_EXPORTS = [
	"NewMat4",
	"Mat4Multiply",
	"Mat4Invert",
	"Mat4FromRotationTranslationScale",
	"Vec3",
	"Quat",
	"NewBoundingBox",
	"NewBoundingBoxFromValues",
];

// Gate floors per entry (A/B); null = reported, not gated.
const ENTRIES = [
	["Mat4Multiply", 0.91],
	["Mat4Invert", 0.91],
	["Mat4FromRotationTranslationScale", 0.91],
	["Vec3.TransformMat4", 0.87],
	["BoundingBox.TransformInto", 0.91],
	["Vec3.Add", null],
	["Vec3.Normalize", null],
];

function fillMat4(m, values) {
	for (let i = 0; i < 16; i++) m[i] = values[i];
	return m;
}

// mathxWorkloads builds one side's drivers. Each A/B side imports this module
// with its own `?side=` query (as workloads.js does), so every side gets its
// own closures and V8 keeps separate type feedback per side.
export function mathxWorkloads(m) {
	// Bind once: the loadSide exports object resolves each name via a getter.
	const { Mat4Multiply, Mat4Invert, Mat4FromRotationTranslationScale } = m;
	// Invertible affine matrices with rotation, scale and translation.
	const a = fillMat4(
		m.NewMat4(),
		[0.9, 0.3, -0.2, 0, -0.25, 1.1, 0.4, 0, 0.3, -0.35, 1.2, 0, 4, -2, 7, 1],
	);
	const b = fillMat4(
		m.NewMat4(),
		[1.2, -0.1, 0.15, 0, 0.2, 0.8, -0.3, 0, -0.1, 0.25, 1.05, 0, -3, 5, 1, 1],
	);
	const out = m.NewMat4();
	const q = new m.Quat(0.1, 0.2, 0.3, 0.927);
	const t = new m.Vec3(1, 2, 3);
	const s = new m.Vec3(1.5, 1.5, 1.5);
	const p = new m.Vec3(0.5, -1.5, 2.5);
	const p2 = new m.Vec3(-2, 0.25, 1);
	const v = new m.Vec3();
	const box = m.NewBoundingBoxFromValues(
		new m.Vec3(-1, -2, -3),
		new m.Vec3(1, 2, 3),
	);
	const boxOut = m.NewBoundingBox();
	return {
		Mat4Multiply: (n) => {
			for (let i = 0; i < n; i++) Mat4Multiply(out, a, b);
		},
		Mat4Invert: (n) => {
			for (let i = 0; i < n; i++) Mat4Invert(out, a);
		},
		Mat4FromRotationTranslationScale: (n) => {
			for (let i = 0; i < n; i++)
				Mat4FromRotationTranslationScale(out, q, t, s);
		},
		"Vec3.TransformMat4": (n) => {
			for (let i = 0; i < n; i++) v.TransformMat4(p, a);
		},
		"BoundingBox.TransformInto": (n) => {
			for (let i = 0; i < n; i++) box.TransformInto(a, boxOut);
		},
		"Vec3.Add": (n) => {
			for (let i = 0; i < n; i++) v.Add(p, p2);
		},
		"Vec3.Normalize": (n) => {
			for (let i = 0; i < n; i++) v.Normalize(p);
		},
	};
}

const isMain =
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
	new URL(import.meta.url).search === "";

if (isMain) {
	const sides = abSides();
	if (!sides.configured) {
		console.log(
			"skipping: set GOFRONT_BASELINE_DIR and/or BASELINE_SRC to run the mathx JS A/B benchmark",
		);
		process.exit(0);
	}
	const argv = process.argv.slice(2);
	if (!argv.includes("--repeat") && !argv.includes("--json")) {
		argv.push("--repeat", "5");
	}
	const gates = ENTRIES.flatMap(([name, min]) => [
		"--gate",
		min === null ? `${name}=off` : `${name}>=${min}`,
	]);
	await runAB({
		script: fileURLToPath(import.meta.url),
		argv: [...gates, ...argv],
		title: `mathx JS A/B (A: ${sides.a.gofrontDir ?? "installed gofront"} + ${sides.a.srcRoot}; B: ${sides.b.gofrontDir ?? "installed gofront"} + ${sides.b.srcRoot})`,
		sides,
		buildEntries: async (sides) => {
			const mods = await loadSides(sides, {
				mathx: { pkg: "engine/mathx", exports: MATHX_EXPORTS },
			});
			const side = {};
			for (const [name, mod] of Object.entries(mods)) {
				const self = await import(
					new URL(`./mathx-js.js?side=${name}`, import.meta.url).href
				);
				side[name] = self.mathxWorkloads(mod.mathx);
			}
			collectGarbage();
			return ENTRIES.map(([name]) => ({
				name,
				iterations: ITERATIONS,
				a: side.a[name],
				b: side.b[name],
			}));
		},
	});
	process.exit(process.exitCode ?? 0);
}
