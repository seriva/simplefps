// SIMD kernel canary.
// Compiles the probe packages under tests/perf/fixtures/simd/ with the current
// compiler (GOFRONT_DIR or the installed gofront) and checks the numbers the
// SIMD rule in AGENTS.md rests on:
//   kern - 64-joint skinning palette (world × inverseBind into a
//          shared.Float32), scalar vs gofront/simd F32x4 columns: outputs
//          must be bit-identical and SIMD must stay >= 3.0× faster;
//   jsfb - F32x4 mul+add in a `js` package: the JS fallback must still
//          allocate (> 1 MB new-space growth per 1M ops), otherwise the
//          "SIMD only in wasm packages" rule needs revisiting;
//   tri  - 4-wide ray/triangle test, scalar vs SIMD (report only). Skipped
//          below GoFront 1.8.0 (the original probe trapped on 1.7.0).
// Fails (exit 1) if the palette speedup drops below 3.0×, the outputs differ,
// or the fallback stops allocating.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import v8 from "node:v8";
import { abRatio, loadSide, minorGC } from "./ab.js";

const FIXTURES = "tests/perf/fixtures/simd";
const PALETTE_MIN = 3.0;
const FALLBACK_OPS = 1_000_000;
const FALLBACK_MIN_BYTES = 1_000_000;
const TRI_MIN_GOFRONT = [1, 8, 0];

const gofrontDir = process.env.GOFRONT_DIR ?? null;
const version = gofrontDir
	? JSON.parse(readFileSync(join(resolve(gofrontDir), "package.json"), "utf8"))
			.version
	: createRequire(import.meta.url)("gofront/package.json").version;
const atLeast = (min) => {
	const parts = version.split(/[.-]/).map(Number);
	for (let i = 0; i < min.length; i++) {
		if (parts[i] !== min[i]) return parts[i] > min[i];
	}
	return true;
};

const load = (pkg, exports) =>
	loadSide({ gofrontDir, srcRoot: FIXTURES, pkg, exports }).then((s) => s.mod);

const sameBits = (x, y) => {
	if (x.length !== y.length) return false;
	for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i])) return false;
	return true;
};

let failed = 0;
console.log(`node ${process.version}, gofront ${version}`);

// --- kern: palette --------------------------------------------------------
const kern = await load("kern", [
	"Seed",
	"PaletteScalar",
	"PaletteSimd",
	"OutScalar",
	"OutSimd",
]);
kern.Seed(42);
kern.PaletteScalar(1);
kern.PaletteSimd(1);
const identical = sameBits(kern.OutScalar, kern.OutSimd);
const [palette] = abRatio(
	[
		{
			name: "palette",
			iterations: 5_000,
			a: kern.PaletteScalar,
			b: kern.PaletteSimd,
		},
	],
	{ rounds: 9 },
);
const paletteOk = identical && palette.ratio >= PALETTE_MIN;
if (!paletteOk) failed++;
console.log(
	`kern palette: scalar ${palette.aNs.toFixed(0)} ns/frame, SIMD ${palette.bNs.toFixed(0)} ns/frame, ${palette.ratio.toFixed(2)}× (gate >= ${PALETTE_MIN.toFixed(1)}×), ${identical ? "bit-identical" : "OUTPUT DIFFERS"}${paletteOk ? "" : "  FAIL"}`,
);

// --- jsfb: JS fallback allocation -----------------------------------------
const jsfb = await load("jsfb", ["MulAdd"]);
const newSpaceUsed = () =>
	v8.getHeapSpaceStatistics().find((s) => s.space_name === "new_space")
		?.space_used_size ?? 0;
jsfb.MulAdd(FALLBACK_OPS); // warm up
const deltas = [];
const t0 = process.hrtime.bigint();
for (let s = 0; s < 5; s++) {
	minorGC();
	const before = newSpaceUsed();
	jsfb.MulAdd(FALLBACK_OPS);
	deltas.push(newSpaceUsed() - before);
}
const fallbackNs = Number(process.hrtime.bigint() - t0) / (5 * FALLBACK_OPS);
// A scavenge mid-run can only shrink a delta, so the largest one is the
// closest to the true growth.
const growth = Math.max(...deltas);
const fallbackOk = growth > FALLBACK_MIN_BYTES;
if (!fallbackOk) failed++;
console.log(
	`jsfb fallback: ${(growth / 1e6).toFixed(2)} MB new-space per ${FALLBACK_OPS.toLocaleString("en-US")} F32x4 mul+add (gate > ${(FALLBACK_MIN_BYTES / 1e6).toFixed(2)} MB), ~${fallbackNs.toFixed(1)} ns/op, deltas=[${deltas.join(", ")}]${fallbackOk ? "" : "  FAIL"}`,
);

// --- tri: 4-wide triangle test (report only) ------------------------------
if (!atLeast(TRI_MIN_GOFRONT)) {
	console.log(
		`tri: skipped, needs GoFront >= ${TRI_MIN_GOFRONT.join(".")} (found ${version}; the SIMD collision work it previews targets 1.8.0)`,
	);
} else {
	const tri = await load("tri", ["Seed", "Scalar", "Simd", "Dist"]);
	tri.Seed(7);
	const ray = [0, 0, -10, 0.01, 0.02, 1];
	const scalar = (n) => tri.Scalar(n, ...ray);
	const simd = (n) => tri.Simd(n, ...ray);
	scalar(1);
	simd(1);
	const same = Object.is(tri.Dist[0], tri.Dist[1]);
	const [r] = abRatio([{ name: "tri", iterations: 20, a: scalar, b: simd }], {
		rounds: 9,
	});
	console.log(
		`tri: scalar ${(r.aNs / 1e3).toFixed(1)} µs/ray, SIMD ${(r.bNs / 1e3).toFixed(1)} µs/ray, ${r.ratio.toFixed(2)}× (report only), ${same ? "same closest hit" : `HIT DIFFERS (${tri.Dist[0]} vs ${tri.Dist[1]})`}`,
	);
}

if (failed) {
	console.log(`✗ SIMD kernel canary failed (${failed})`);
	process.exitCode = 1;
} else {
	console.log("✓ SIMD kernel canary passed");
}
