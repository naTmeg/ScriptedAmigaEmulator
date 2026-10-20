#!/usr/bin/env node
/* Scan tests/.cache/vAmigaTS for test disks that come with a vAmiga reference screenshot
 * (<name>_68000.raw, 716x285 RGB) and write tests/browser/suite.json for suite.htm.
 * Paths in suite.json are relative to tests/browser/; `id` (the test directory) is the key
 * for results and the baseline. Called by fetch-vamigats.mjs. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../.cache/vAmigaTS");
const out = path.resolve(here, "../browser/suite.json");
const prefix = "../.cache/vAmigaTS/";

if (!fs.existsSync(root)) {
	console.error("missing " + root + ", run: npm run fetch:vamigats");
	process.exit(1);
}
const tests = [];
(function walk(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const names = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
	for (const e of entries) {
		if (e.isDirectory()) { if (e.name !== ".git") walk(path.join(dir, e.name)); continue; }
		if (!e.name.toLowerCase().endsWith(".adf")) continue;
		const name = e.name.slice(0, -4), raw = name + "_68000.raw";
		if (!names.has(raw)) continue;
		const rel = path.relative(root, dir).split(path.sep).join("/");
		const parts = rel.split("/");
		tests.push({
			id: rel, /* unique; names repeat across groups (CPU/IPL/MOVEC1 and CPU/Timing/...) */
			group: parts.length > 1 ? parts[0] + "/" + parts[1] : parts[0],
			name,
			adf: prefix + rel + "/" + e.name,
			raw: prefix + rel + "/" + raw,
			src: names.has(name + ".s") ? prefix + rel + "/" + name + ".s" : null,
			size: fs.statSync(path.join(dir, raw)).size,
		});
	}
})(root);
tests.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(out, JSON.stringify(tests, null, 1) + "\n");

const groups = {};
for (const t of tests) groups[t.group] = (groups[t.group] || 0) + 1;
console.log(tests.length + " tests with a _68000.raw reference -> " + path.relative(process.cwd(), out));
for (const [g, n] of Object.entries(groups)) console.log("  " + g.padEnd(28) + " " + n);
const bad = tests.filter((t) => t.size !== 716 * 285 * 3);
if (bad.length) console.log("raw files with unexpected size: " + bad.map((t) => t.name).join(", "));
