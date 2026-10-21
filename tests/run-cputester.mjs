#!/usr/bin/env node
/* Run Toni Wilen's cputester disks (CPU tests checked on real 68000s) in SAE, headless.
 * cputest stops at the first difference; its output is redirected to a file on the floppy
 * and read back through sae.getDisk(), so every disk gives "pass" or the first mismatch.
 *
 *   node tests/run-cputester.mjs                       all disks of the "address" set
 *   node tests/run-cputester.mjs --set all             every set that was fetched, in one pool
 *   node tests/run-cputester.mjs --set basic,address   several sets in one pool
 *   node tests/run-cputester.mjs --filter CLR          disks whose name contains CLR ("CLR|NEG": either)
 *   node tests/run-cputester.mjs --set basic --jobs 8  default: logical CPUs - 4
 *   node tests/run-cputester.mjs --floppy orig         floppy at original speed (default: turbo)
 *   node tests/run-cputester.mjs --check               exit 1 if a disk does worse than tests/cputester-baseline.json
 *   node tests/run-cputester.mjs --write-baseline
 *   node tests/run-cputester.mjs --show                print the mismatch of every failing disk
 *
 * Needs the disks: node tests/tools/fetch-cputester.mjs. Machine: A500, compatible core,
 * 512 KB chip + 512 KB slow + 8 MB fast RAM (cputest needs the fast RAM), AROS ROM.
 *
 * All disks of all requested sets share one pool of pages, the longest first (by the number
 * of tests in the baseline): a single disk cannot be split, so the slowest ones would
 * otherwise start last and leave the other pages idle at the end. */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { readFile, replaceSmallFile, freeBlocks, deleteRootFile, findFile } from "./tools/adf-ofs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
function arg(n, d) {
	const i = process.argv.indexOf("--" + n);
	if (i < 0) return d;
	const v = process.argv[i + 1];
	return v === undefined || v.startsWith("--") ? true : v;
}
const adfRoot = path.resolve(here, ".cache/cputester-src/Cputester/ADF");
const setArg = String(arg("set", "address"));
const sets = setArg == "all" ? (fs.existsSync(adfRoot) ? fs.readdirSync(adfRoot).filter((d) => fs.statSync(path.join(adfRoot, d)).isDirectory()).sort() : []) : setArg.split(",");
const filter = String(arg("filter", ""));
const jobs = Math.max(1, +arg("jobs", Math.max(1, os.cpus().length - 4)));
const timeout = +arg("timeout", 900) * 1000;
/* the floppy in turbo mode saves about 6 s of boot and loading per disk; the CPU tests do not
   depend on it. A faster CPU (cpu.speed maximum) gained nothing: turbo=1 already runs the frames
   back to back, so the host's emulation speed is the limit either way. A disk with DF1 runs at
   the original speed: with turbo and a second drive AROS never writes out.txt (cputest hangs). */
const floppy = String(arg("floppy", "turbo"));
const check = !!arg("check", false), writeBaseline = !!arg("write-baseline", false), show = !!arg("show", false);
const baselineFile = path.join(here, "cputester-baseline.json");
const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, "utf8")) : {};
const END = "CPUTEST-END";

const filters = filter.split("|").filter(Boolean); /* alternatives: --filter "atCLR|atNEG" */
const list = []; /* { set, file, name } */
for (const set of sets) {
	const srcDir = path.join(adfRoot, set);
	if (!fs.existsSync(srcDir)) {
		console.error("missing " + srcDir + ", run: node tests/tools/fetch-cputester.mjs --sets " + set);
		process.exit(2);
	}
	(function walk(d) {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			if (e.isDirectory()) walk(path.join(d, e.name));
			else if (e.name.endsWith(".adf") && (!filters.length || filters.some((x) => e.name.includes(x))))
				list.push({ set, file: path.join(d, e.name), name: path.basename(e.name, ".adf") });
		}
	})(srcDir);
}
/* longest first: the tests a disk got through last time (a timeout counts as long) */
const weight = (t) => { const b = (baseline[t.set] || {})[t.name]; return !b ? 1e6 : b.status == "timeout" ? 1e7 : b.tests || 0; };
list.sort((x, y) => weight(y) - weight(x) || x.name.localeCompare(y.name));

/* patch s/startup-sequence: cputest output to out.txt, then an end marker. A few disks are
   full (atAND.L_1: one free block), so out.txt stayed empty and they looked like a hang. Those
   get room by deleting the Stack and Echo commands from their copy; the startup-sequence runs
   them from an unchanged copy of the disk in DF1. (Writing out.txt to an empty disk in DF1
   does not work: AROS's OFS handler keeps the data blocks of the file in its cache.) */
const withDF1 = new Set();
for (const { set, file: f, name } of list) {
	const runDir = path.resolve(here, ".cache/cputester", set);
	fs.mkdirSync(runDir, { recursive: true });
	const adf = new Uint8Array(fs.readFileSync(f));
	const moved = [];
	if (freeBlocks(adf) < 8) {
		withDF1.add(set + "/" + name);
		fs.writeFileSync(path.join(runDir, name + ".df1.adf"), fs.readFileSync(f));
		for (const cmd of ["Stack", "Echo"])
			if (findFile(adf, cmd)) { deleteRootFile(adf, cmd); moved.push(cmd.toLowerCase()); }
	}
	const viaDF1 = (l) => { const w = l.trim().split(/\s+/)[0].toLowerCase(); return moved.includes(w) ? "DF1:" + l.trim() : l; };
	const ss = Buffer.from(readFile(adf, "s/startup-sequence")).toString("latin1");
	const lines = ss.split("\n").filter((l) => l.trim() && !/^echo\b/i.test(l.trim()));
	const out = lines.map((l) => (/^cputest\b/i.test(l.trim()) ? l.trim() + " >out.txt" : viaDF1(l))).join("\n") +
		"\n" + viaDF1("echo \"" + END + "\" >>out.txt") + "\n";
	replaceSmallFile(adf, "s/startup-sequence", Buffer.from(out, "latin1"));
	fs.writeFileSync(path.join(runDir, path.basename(f)), adf);
}

const types = { ".htm": "text/html", ".js": "text/javascript", ".json": "application/json" };
const cache = new Map();
const server = http.createServer((req, res) => {
	const p = path.normalize(path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
	if (!p.startsWith(root)) { res.writeHead(403).end(); return; }
	let data = cache.get(p);
	if (!data) {
		try { data = fs.readFileSync(p); } catch { res.writeHead(404).end(); return; }
		if (types[path.extname(p)] || p.endsWith(".bin")) cache.set(p, data);
	}
	res.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" });
	res.end(data);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/tests/browser/run.htm`;
/* the OFS reader, as a plain script for the page */
const reader = "window.__ofs = (function() {\n" +
	fs.readFileSync(path.join(here, "tools/adf-ofs.mjs"), "utf8").replace(/^export /gm, "") +
	"\nreturn { readFile: readFile };\n})();";

function parse(txt) {
	if (txt === null) return { status: "no-output" };
	const m = /All tests complete \(total (\d+)\)/.exec(txt);
	if (m) return { status: "pass", tests: +m[1] };
	const counts = [...txt.matchAll(/^(\d+) \(\d+\/\d+\)/gm)].pop();
	const start = txt.indexOf("\n\n");
	const lines = (start >= 0 ? txt.slice(start + 2) : txt).split("\n");
	const stop = lines.findIndex((l) => /^Registers before/.test(l));
	const mismatch = lines.slice(0, stop >= 0 ? stop : 12).filter((l) => l.trim()).join("\n");
	return { status: txt.includes(END) ? "fail" : "timeout", tests: counts ? +counts[1] : 0, mismatch };
}

const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
const results = {}; /* set -> name -> result */
for (const set of sets) results[set] = {};
let next = 0, done = 0;
const t0 = Date.now();
/* a status line every minute: share of the work done, weighted by the baseline's test counts
   (a disk counts once it has finished), and the time left at that rate */
const work = (t) => { const b = (baseline[t.set] || {})[t.name]; return b && b.tests ? b.tests : 20000; };
const allWork = list.reduce((s, t) => s + work(t), 0);
let doneWork = 0;
const progress = setInterval(() => {
	const s = (Date.now() - t0) / 1000, f = doneWork / allWork;
	const left = f > 0.05 ? `, about ${Math.ceil((s / f) * (1 - f) / 60)} min left` : "";
	console.log(`-- ${Math.floor(s / 60)} min: ${done}/${list.length} disks, ${(f * 100).toFixed(0)} % of the tests${left}`);
}, 60000);
async function worker() {
	const ctx = await browser.newContext();
	await ctx.addInitScript(reader);
	while (next < list.length) {
		const { set, name } = list[next++];
		const page = await ctx.newPage();
		const t1 = Date.now();
		let txt = null;
		try {
			const adf = encodeURIComponent("../.cache/cputester/" + set + "/" + name + ".adf");
			const unit = 0;
			const df1 = withDF1.has(set + "/" + name) ? "&df1=" + encodeURIComponent("../.cache/cputester/" + set + "/" + name + ".df1.adf") : "";
			await page.goto(`${base}?adf=${adf}${df1}&model=A500&compat=1&chip=512&slow=512&fast=8&turbo=1&det=1&video=canvas&speed=${df1 ? "orig" : floppy}`);
			const lim = Date.now() + timeout;
			while (Date.now() < lim) {
				await new Promise((r) => setTimeout(r, 500));
				txt = await page.evaluate((unit) => {
					if (!window.sae || !window.sae.running) return null;
					const d = window.sae.getDisk(unit);
					const out = d && window.__ofs.readFile(d.data, "out.txt");
					return out ? new TextDecoder("latin1").decode(out) : null;
				}, unit);
				/* "All tests complete" is enough: on a disk with DF1 the closing echo (loaded from DF1)
				   never gets its marker into out.txt */
				if (txt && (txt.includes(END) || /All tests complete \(total \d+\)/.test(txt))) break;
			}
		} catch (e) {
			console.error(`[${set}/${name}] ${e.message}`);
		}
		await page.close();
		const r = parse(txt);
		r.seconds = Math.round((Date.now() - t1) / 1000);
		results[set][name] = r;
		done++;
		doneWork += work(list.find((t) => t.set === set && t.name === name));
		console.log(`${String(done).padStart(3)}/${list.length} ${r.status.padEnd(9)} ${sets.length > 1 ? set + "/" : ""}${name}${r.tests !== undefined ? "  (" + r.tests + " tests, " + r.seconds + " s)" : ""}`);
	}
	await ctx.close();
}
await Promise.all(Array.from({ length: Math.min(jobs, list.length) }, worker));
clearInterval(progress);
await browser.close();
server.close();

/* a disk is better the further it gets; passing beats any failure */
const rank = (r) => (r.status === "pass" ? 1e9 + (r.tests || 0) : (r.tests || 0));
const count = (rs, s) => Object.values(rs).filter((r) => r.status === s).length;
const regressions = [], better = [];
const out = { ...baseline };
fs.mkdirSync(path.join(here, "results"), { recursive: true });
for (const set of sets) {
	const rs = results[set], was = baseline[set] || {};
	for (const [n, r] of Object.entries(rs)) {
		const b = was[n];
		if (!b) continue;
		if (rank(r) < rank(b)) regressions.push(`${set}/${n}: ${r.status} after ${r.tests || 0} tests, baseline ${b.status} after ${b.tests || 0}`);
		else if (rank(r) > rank(b)) better.push(`${set}/${n}: ${r.status} after ${r.tests || 0} tests (was ${b.status} after ${b.tests || 0})`);
	}
	console.log(`\n${set}: ${Object.keys(rs).length} disks: ${count(rs, "pass")} pass, ${count(rs, "fail")} fail, ${count(rs, "timeout")} timeout, ${count(rs, "no-output")} no output`);
	if (show) for (const [n, r] of Object.entries(rs)) if (r.status !== "pass") console.log(`\n== ${set}/${n} (${r.status}, ${r.tests || 0} tests)\n${r.mismatch || ""}`);
	fs.writeFileSync(path.join(here, "results/cputester-" + set + ".json"), JSON.stringify(rs, null, 1));
	out[set] = { ...was };
	for (const [n, r] of Object.entries(rs)) out[set][n] = { status: r.status, tests: r.tests || 0 };
	out[set] = Object.fromEntries(Object.entries(out[set]).sort(([a], [b]) => a.localeCompare(b)));
}
console.log(`\n${list.length} disks in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${jobs} jobs`);
if (better.length) console.log("\nBetter than the baseline:\n  " + better.join("\n  "));
if (writeBaseline) {
	fs.writeFileSync(baselineFile, JSON.stringify(out, null, 1) + "\n");
	console.log("baseline written: " + path.relative(process.cwd(), baselineFile));
}
if (regressions.length) {
	console.error("\nWorse than the baseline:\n  " + regressions.join("\n  "));
	if (check) process.exit(1);
}
