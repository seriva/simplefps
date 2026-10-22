#!/usr/bin/env node
// SIMD-only-in-WASM check (AGENTS.md "SIMD only in wasm packages").
//
// Walks the given directories (default: app/src) for .go files (except
// _test.go), resolves each package directory's target from its
// `//gofront:target` directive (none = js), and fails with file:line for every
// `gofront/simd` import in a package that is not `wasm`. In js and both
// packages F32x4 lowers to a frozen 4-number array that allocates on every
// operation, so SIMD there is slower than scalar JS and breaks zero-alloc.
//
// Usage: node scripts/check-simd.js [dir ...]

import fs from "node:fs";
import path from "node:path";

const TARGET = /^\/\/gofront:target\s+(\S+)/;
const SIMD_PATH = '"gofront/simd"';

// goFilesByDir maps each directory under root to its non-test .go files.
function goFilesByDir(root, out = new Map()) {
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		const full = path.join(root, entry.name);
		if (entry.isDirectory()) {
			goFilesByDir(full, out);
		} else if (entry.name.endsWith(".go") && !entry.name.endsWith("_test.go")) {
			if (!out.has(root)) out.set(root, []);
			out.get(root).push(full);
		}
	}
	return out;
}

// simdImportLines returns the 1-based lines that import gofront/simd, either
// as `import [name] "gofront/simd"` or inside an `import ( ... )` block.
function simdImportLines(lines) {
	const hits = [];
	let inBlock = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].replace(/\/\/.*$/, "").trim();
		if (inBlock) {
			if (line.startsWith(")")) inBlock = false;
			else if (line.endsWith(SIMD_PATH)) hits.push(i + 1);
		} else if (/^import\s*\($/.test(line)) {
			inBlock = true;
		} else if (/^import\s/.test(line) && line.endsWith(SIMD_PATH)) {
			hits.push(i + 1);
		}
	}
	return hits;
}

const roots = process.argv.slice(2);
if (roots.length === 0) roots.push("app/src");

const violations = [];
let packages = 0;
for (const root of roots) {
	if (!fs.existsSync(root)) {
		console.error(`check-simd: no such directory: ${root}`);
		process.exit(2);
	}
	for (const files of goFilesByDir(root).values()) {
		packages++;
		const sources = files.map((f) => ({
			file: f,
			lines: fs.readFileSync(f, "utf8").split("\n"),
		}));
		let target = "js";
		for (const { lines } of sources) {
			const directive = lines.map((l) => TARGET.exec(l)).find(Boolean);
			if (directive) target = directive[1];
		}
		if (target === "wasm") continue;
		for (const { file, lines } of sources) {
			for (const line of simdImportLines(lines)) {
				violations.push(
					`${file}:${line}: gofront/simd imported in a ${target} package; SIMD is allowed only in //gofront:target wasm packages (the JS fallback allocates per operation)`,
				);
			}
		}
	}
}

if (violations.length > 0) {
	for (const v of violations) console.error(v);
	console.error(`check-simd: ${violations.length} violation(s)`);
	process.exit(1);
}
console.log(`check-simd: ${packages} packages — OK`);
