// In-process A/B benchmark harness.
//
// Compiles the same package twice — side A with a baseline compiler and/or a
// baseline source tree, side B with the current compiler and the current tree
// — loads both into one process and times them interleaved (A and B
// alternate every round after warm-up), so machine drift hits both sides
// equally. Each entry reports speedup = median(A ns) / median(B ns): 1.00× is
// "no change", > 1 means B is faster.
//
// Knobs (each optional):
//   GOFRONT_BASELINE_DIR  gofront checkout/package used to compile side A
//   BASELINE_SRC          repo root (e.g. a worktree of the base branch) whose
//                         app/src is compiled for side A
//   GOFRONT_DIR           gofront checkout used for side B (default: installed)
//
// CLI (`node tests/perf/ab.js --self-test`): runs an A/A-style self-test over
// the raycast, controller and skinning hot paths and gates every entry on
// 0.90–1.10. Flags:
//   --repeat N             re-spawn the run N times, gate on the median ratio
//   --rounds N             interleaved rounds per entry (default 9)
//   --min X / --max X      gate band (default 0.90 / 1.10)
//   --inject-slowdown X    test-only: stretch every side-B sample X times
// With neither GOFRONT_BASELINE_DIR nor BASELINE_SRC set, the self-test prints
// a skip message and exits 0, so `npm run test:perf` works on a bare checkout.
//
// Library: `loadSide`, `abRatio`, `abSides` and `runAB` are reused by
// `js-vs-wasm.js --ab`.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

const compilers = new Map();

async function compilerFor(gofrontDir) {
	const key = gofrontDir ? resolve(gofrontDir) : "";
	if (!compilers.has(key)) {
		compilers.set(
			key,
			await import(
				key
					? pathToFileURL(join(key, "src/compiler.js")).href
					: "gofront/src/compiler.js"
			),
		);
	}
	return compilers.get(key);
}

// loadSide compiles `pkg` (a directory relative to `srcRoot`, e.g.
// "engine/physics") with the compiler in `gofrontDir` (installed gofront when
// unset) and imports the result. `exports` names the package-level symbols to
// expose; a symbol the source does not define comes back `undefined` instead
// of failing the import, so a baseline that predates an export still loads.
export async function loadSide({
	gofrontDir,
	srcRoot = "app/src",
	pkg,
	exports,
	forceTarget,
}) {
	const { compileDir } = await compilerFor(gofrontDir);
	const root = resolve(srcRoot);
	const opts = { rootDir: root };
	if (forceTarget) opts.forceTarget = forceTarget;
	const { js, wasm } = compileDir(join(root, pkg), opts);
	const dir = mkdtempSync(join(tmpdir(), "simplefps-ab-"));
	const bundle = join(dir, `${pkg.replace(/\//g, "_")}.mjs`);
	const getters = exports
		.map(
			(n) =>
				`get ${n}() { return typeof ${n} === "undefined" ? undefined : ${n}; }`,
		)
		.join(",\n");
	writeFileSync(
		bundle,
		`globalThis.window = null; globalThis.document = null;
${wasm ? `globalThis.__GOFRONT_WASM_BYTES = new Uint8Array(${JSON.stringify([...wasm])});` : ""}
${js}
export const __exports = {
${getters}
};`,
	);
	try {
		const mod = await import(pathToFileURL(bundle));
		return { mod: mod.__exports, wasmBytes: wasm?.length ?? 0 };
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

// abSides resolves the compiler and source tree of both sides from the
// environment. `configured` is false when neither baseline knob is set.
export function abSides(env = process.env) {
	const baselineDir = env.GOFRONT_BASELINE_DIR || null;
	const baselineSrc = env.BASELINE_SRC || null;
	return {
		configured: Boolean(baselineDir || baselineSrc),
		a: {
			gofrontDir: baselineDir ?? env.GOFRONT_DIR ?? null,
			srcRoot: join(baselineSrc ?? ".", "app/src"),
		},
		b: { gofrontDir: env.GOFRONT_DIR ?? null, srcRoot: "app/src" },
	};
}

const median = (xs) => {
	const s = [...xs].sort((x, y) => x - y);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function timeRun(fn, iterations, stretch) {
	// Start every sample on an empty young generation, so allocation-heavy
	// entries (asset decoding) do not pay for the other side's garbage. A
	// minor GC leaves old-space layout alone, unlike a full one.
	gc({ type: "minor" });
	const t0 = process.hrtime.bigint();
	fn(iterations);
	let t1 = process.hrtime.bigint();
	if (stretch !== 1) {
		// Test-only slowdown: spin until the sample took `stretch` times as long.
		const until = t0 + BigInt(Math.round(Number(t1 - t0) * stretch));
		while (t1 < until) t1 = process.hrtime.bigint();
	}
	return Number(t1 - t0);
}

// abRatio times every entry `{ name, iterations, a, b }` (a/b take an
// iteration count) interleaved over `rounds` rounds after `warmup` untimed
// runs per side, and returns per-entry medians and the A/B speedup. An entry
// whose `a` is null (the baseline lacks it) is reported as `B-only`.
export function abRatio(
	entries,
	{ rounds = 9, warmup = 2, injectSlowdown = 1 } = {},
) {
	const out = [];
	for (const e of entries) {
		if (!e.a || !e.b) {
			out.push({ name: e.name, status: e.a ? "A-only" : "B-only" });
			continue;
		}
		for (let w = 0; w < warmup; w++) {
			e.a(e.iterations);
			e.b(e.iterations);
		}
		const aNs = [];
		const bNs = [];
		for (let r = 0; r < rounds; r++) {
			// Alternate which side goes first so neither always runs on a
			// freshly scavenged heap.
			if (r % 2 === 0) {
				aNs.push(timeRun(e.a, e.iterations, 1));
				bNs.push(timeRun(e.b, e.iterations, injectSlowdown));
			} else {
				bNs.push(timeRun(e.b, e.iterations, injectSlowdown));
				aNs.push(timeRun(e.a, e.iterations, 1));
			}
		}
		const a = median(aNs) / e.iterations;
		const b = median(bNs) / e.iterations;
		out.push({ name: e.name, status: "ok", aNs: a, bNs: b, ratio: a / b });
	}
	return out;
}

function parseArgs(argv) {
	const opts = {
		repeat: 1,
		rounds: 9,
		min: 0.9,
		max: 1.1,
		injectSlowdown: 1,
		json: false,
		flags: new Set(),
	};
	const num = (i) => {
		const v = Number(argv[i + 1]);
		if (!Number.isFinite(v)) throw new Error(`${argv[i]} needs a number`);
		return v;
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--repeat") opts.repeat = num(i++);
		else if (a === "--rounds") opts.rounds = num(i++);
		else if (a === "--min") opts.min = num(i++);
		else if (a === "--max") opts.max = num(i++);
		else if (a === "--inject-slowdown") opts.injectSlowdown = num(i++);
		else if (a === "--json") opts.json = true;
		else opts.flags.add(a);
	}
	return opts;
}

// Strips --repeat N (and --json) so a child run is a single process run.
function childArgs(argv) {
	const out = [];
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--repeat") i++;
		else if (argv[i] !== "--json") out.push(argv[i]);
	}
	return [...out, "--json"];
}

const JSON_TAG = "AB_RESULT ";

function printTable(title, rows, opts) {
	const w = Math.max(...rows.map((r) => r.name.length), 5);
	console.log(title);
	console.log(
		`${"entry".padEnd(w)}  ${"A ns/op".padStart(12)}  ${"B ns/op".padStart(12)}  ${"A/B".padStart(7)}  runs`,
	);
	let failed = 0;
	for (const r of rows) {
		if (r.status !== "ok") {
			console.log(`${r.name.padEnd(w)}  ${r.status} (not gated)`);
			continue;
		}
		const ok = r.ratio >= opts.min && r.ratio <= opts.max;
		if (!ok) failed++;
		const runs = r.runs ? r.runs.map((x) => x.toFixed(3)).join(" ") : "";
		console.log(
			`${r.name.padEnd(w)}  ${r.aNs.toFixed(1).padStart(12)}  ${r.bNs.toFixed(1).padStart(12)}  ${`${r.ratio.toFixed(3)}×`.padStart(7)}  ${runs}${ok ? "" : "  FAIL"}`,
		);
	}
	return failed;
}

// runAB drives a full A/B run: `buildEntries(sides)` returns the entry list
// for one process. With --repeat N it re-spawns `script` N times and gates on
// the per-entry median of the N ratios; otherwise it gates on this process's
// ratios. Exits non-zero when any entry is outside [min, max].
export async function runAB({ script, argv, title, sides, buildEntries }) {
	const opts = parseArgs(argv);
	if (opts.repeat > 1) {
		const runs = [];
		for (let i = 0; i < opts.repeat; i++) {
			const r = spawnSync(process.execPath, [script, ...childArgs(argv)], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "inherit"],
				maxBuffer: 64 * 1024 * 1024,
			});
			const line = r.stdout.split("\n").find((l) => l.startsWith(JSON_TAG));
			if (r.status !== 0 && !line) {
				process.stdout.write(r.stdout);
				throw new Error(`A/B run ${i + 1} exited with ${r.status}`);
			}
			runs.push(JSON.parse(line.slice(JSON_TAG.length)));
		}
		const rows = runs[0].map((first, idx) => {
			if (first.status !== "ok") return first;
			const per = runs.map((run) => run[idx]);
			return {
				name: first.name,
				status: "ok",
				aNs: median(per.map((p) => p.aNs)),
				bNs: median(per.map((p) => p.bNs)),
				ratio: median(per.map((p) => p.ratio)),
				runs: per.map((p) => p.ratio),
			};
		});
		const failed = printTable(
			`${title} — median of ${opts.repeat} process runs, gate ${opts.min}–${opts.max}`,
			rows,
			opts,
		);
		finish(failed);
		return;
	}
	const entries = await buildEntries(sides, opts);
	const rows = abRatio(entries, {
		rounds: opts.rounds,
		injectSlowdown: opts.injectSlowdown,
	});
	if (opts.json) {
		console.log(JSON_TAG + JSON.stringify(rows));
		return;
	}
	finish(
		printTable(
			`${title} — single process run, gate ${opts.min}–${opts.max}`,
			rows,
			opts,
		),
	);
}

function finish(failed) {
	if (failed) {
		console.log(
			`✗ ${failed} A/B entr${failed === 1 ? "y" : "ies"} outside the gate`,
		);
		process.exitCode = 1;
	} else {
		console.log("✓ A/B gate passed");
	}
}

// --- Self-test --------------------------------------------------------------

// workloadsFor imports `workloads.js` as a separate module instance per side
// (see the note there on V8 type feedback).
export function workloadsFor(side) {
	return import(new URL(`./workloads.js?side=${side}`, import.meta.url).href);
}

// collectGarbage runs a full GC so the compile garbage of both sides is gone
// before workloads build their data; otherwise the side built later lands in a
// different heap state and its data layout alone can bias it by 10-15%.
const gc = (() => {
	setFlagsFromString("--expose-gc");
	return runInNewContext("gc");
})();
export function collectGarbage() {
	gc();
	gc();
}

// loadSides compiles and imports every `specs` package ({ key: { pkg,
// exports, forceTarget? } }) for each side first, then collects garbage, and
// returns { side: { key: exports } }.
export async function loadSides(sides, specs) {
	const out = {};
	for (const [name, s] of Object.entries(sides)) {
		out[name] = {};
		for (const [key, spec] of Object.entries(specs)) {
			out[name][key] = (await loadSide({ ...s, ...spec })).mod;
		}
	}
	collectGarbage();
	return out;
}

// buildSides calls `build(workloads, mods)` per side with that side's own
// `workloads.js` instance, then collects garbage once both are built.
export async function buildSides(mods, build) {
	const out = {};
	for (const [name, m] of Object.entries(mods)) {
		out[name] = build(await workloadsFor(name), m);
	}
	collectGarbage();
	return out;
}

export const PHYSICS_EXPORTS = [
	"NewTrimesh",
	"NewRay",
	"Vec3",
	"RayModeClosest",
	"NewStaticWorld",
	"NewFPSController",
];
export const ANIMATION_EXPORTS = [
	"JointDef",
	"NewSkeleton",
	"NewPose",
	"NewAnimation",
	"NewAnimationPlayer",
	"SkinMatrices",
];

async function selfTestEntries(sides) {
	const mods = await loadSides(sides, {
		phys: { pkg: "engine/physics", exports: PHYSICS_EXPORTS },
		anim: { pkg: "engine/animation", exports: ANIMATION_EXPORTS },
	});
	const side = await buildSides(mods, (w, m) => ({
		...w.physicsWorkloads(m.phys),
		skinning: w.skinningWorkloads(m.anim).total,
	}));
	return [
		{
			name: "raycast",
			iterations: 20_000,
			a: side.a.raycastMap,
			b: side.b.raycastMap,
		},
		{
			name: "controller",
			iterations: 5_000,
			a: side.a.controller,
			b: side.b.controller,
		},
		{
			name: "skinning",
			iterations: 2_000,
			a: side.a.skinning,
			b: side.b.skinning,
		},
	];
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const argv = process.argv.slice(2);
	if (!argv.includes("--self-test")) {
		console.log(
			"usage: node tests/perf/ab.js --self-test [--repeat N] [--rounds N] [--min X] [--max X] [--inject-slowdown X]",
		);
		process.exit(2);
	}
	const sides = abSides();
	if (!sides.configured) {
		console.log(
			"skipping: set GOFRONT_BASELINE_DIR and/or BASELINE_SRC to run the A/B self-test",
		);
		process.exit(0);
	}
	await runAB({
		script: fileURLToPath(import.meta.url),
		argv,
		title: `A/B self-test (A: ${sides.a.gofrontDir ?? "installed gofront"} + ${sides.a.srcRoot}; B: ${sides.b.gofrontDir ?? "installed gofront"} + ${sides.b.srcRoot})`,
		sides,
		buildEntries: selfTestEntries,
	});
}
