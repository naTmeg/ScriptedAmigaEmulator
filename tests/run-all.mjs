#!/usr/bin/env node
/* Run the browser suite and all cputester sets at the same time, sharing the cores.
 * cputester gets most pages: its longest disks decide the total time, while the
 * screenshot tests are short and finish early, leaving their cores to it.
 *
 *   node tests/run-all.mjs                 both, with --check (exit 1 if either regressed)
 *   node tests/run-all.mjs --jobs 24       pages in total (default: logical CPUs - 4)
 *   node tests/run-all.mjs --suite-jobs 6  pages for the browser suite (default: a quarter)
 *
 * The CPU tests that need no browser (npm test) are fast and run separately. */
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
function arg(name, def) {
	const i = process.argv.indexOf("--" + name);
	return i < 0 ? def : process.argv[i + 1];
}
const jobs = Math.max(2, +arg("jobs", Math.max(2, os.cpus().length - 4)));
const suiteJobs = Math.min(jobs - 1, Math.max(1, +arg("suite-jobs", Math.round(jobs / 4))));
const t0 = Date.now();

function run(tag, script, args) {
	return new Promise((resolve) => {
		const p = spawn(process.execPath, [path.join(here, script), ...args], { stdio: ["ignore", "pipe", "pipe"] });
		const prefix = (stream, out) => {
			let rest = "";
			stream.on("data", (d) => {
				const lines = (rest + d).split("\n");
				rest = lines.pop();
				for (const l of lines) out.write(`[${tag}] ${l}\n`);
			});
			stream.on("end", () => { if (rest) out.write(`[${tag}] ${rest}\n`); });
		};
		prefix(p.stdout, process.stdout);
		prefix(p.stderr, process.stderr);
		p.on("close", (code) => resolve({ tag, code, seconds: Math.round((Date.now() - t0) / 1000) }));
	});
}

const res = await Promise.all([
	run("suite", "run-suite.mjs", ["--check", "--jobs", String(suiteJobs)]),
	run("cputester", "run-cputester.mjs", ["--set", "all", "--check", "--jobs", String(jobs - suiteJobs)]),
]);
console.log("");
for (const r of res) console.log(`${r.tag}: ${r.code === 0 ? "ok" : "FAILED (exit " + r.code + ")"} after ${r.seconds} s`);
process.exit(res.some((r) => r.code !== 0) ? 1 : 0);
