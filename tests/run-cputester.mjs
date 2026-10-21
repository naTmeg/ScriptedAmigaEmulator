#!/usr/bin/env node
/* Run Toni Wilen's cputester disks (CPU tests checked on real 68000s) in SAE, headless.
 * cputest stops at the first difference; its output is redirected to a file on the floppy
 * and read back through sae.getDisk(), so every disk gives "pass" or the first mismatch.
 *
 *   node tests/run-cputester.mjs                       all disks of the "address" set
 *   node tests/run-cputester.mjs --filter CLR          disks whose name contains CLR ("CLR|NEG": either)
 *   node tests/run-cputester.mjs --set basic --jobs 8
 *   node tests/run-cputester.mjs --check               exit 1 if a disk does worse than tests/cputester-baseline.json
 *   node tests/run-cputester.mjs --write-baseline
 *   node tests/run-cputester.mjs --show                print the mismatch of every failing disk
 *
 * Needs the disks: node tests/tools/fetch-cputester.mjs. Machine: A500, compatible core,
 * 512 KB chip + 512 KB slow + 8 MB fast RAM (cputest needs the fast RAM), AROS ROM. */
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
const set = String(arg("set", "address"));
const filter = String(arg("filter", ""));
const jobs = Math.max(1, +arg("jobs", Math.min(12, Math.max(1, os.cpus().length >> 1))));
const timeout = +arg("timeout", 900) * 1000;
const check = !!arg("check", false), writeBaseline = !!arg("write-baseline", false), show = !!arg("show", false);
const srcDir = path.resolve(here, ".cache/cputester-src/Cputester/ADF", set);
const runDir = path.resolve(here, ".cache/cputester", set);
const baselineFile = path.join(here, "cputester-baseline.json");
const END = "CPUTEST-END";

if (!fs.existsSync(srcDir)) {
	console.error("missing " + srcDir + ", run: node tests/tools/fetch-cputester.mjs --sets " + set);
	process.exit(2);
}
const disks = [];
(function walk(d) {
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		if (e.isDirectory()) walk(path.join(d, e.name));
		else if (e.name.endsWith(".adf")) disks.push(path.join(d, e.name));
	}
})(srcDir);
disks.sort();
const filters = filter.split("|").filter(Boolean); /* alternatives: --filter "atCLR|atNEG" */
const list = disks.filter((f) => !filters.length || filters.some((x) => path.basename(f).includes(x)));

/* patch s/startup-sequence: cputest output to out.txt, then an end marker. A few disks are
   full (atAND.L_1: one free block), so out.txt stayed empty and they looked like a hang. Those
   get room by deleting the Stack and Echo commands from their copy; the startup-sequence runs
   them from an unchanged copy of the disk in DF1. (Writing out.txt to an empty disk in DF1
   does not work: AROS's OFS handler keeps the data blocks of the file in its cache.) */
fs.mkdirSync(runDir, { recursive: true });
const withDF1 = new Set();
for (const f of list) {
	const adf = new Uint8Array(fs.readFileSync(f));
	const name = path.basename(f, ".adf");
	const moved = [];
	if (freeBlocks(adf) < 8) {
		withDF1.add(name);
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
const results = {};
let next = 0, done = 0;
const t0 = Date.now();
async function worker() {
	const ctx = await browser.newContext();
	await ctx.addInitScript(reader);
	while (next < list.length) {
		const f = list[next++], name = path.basename(f, ".adf");
		const page = await ctx.newPage();
		let txt = null;
		try {
			const adf = encodeURIComponent("../.cache/cputester/" + set + "/" + name + ".adf");
			const unit = 0;
			const df1 = withDF1.has(name) ? "&df1=" + encodeURIComponent("../.cache/cputester/" + set + "/" + name + ".df1.adf") : "";
			await page.goto(`${base}?adf=${adf}${df1}&model=A500&compat=1&chip=512&slow=512&fast=8&turbo=1&det=1&video=canvas`);
			const lim = Date.now() + timeout;
			while (Date.now() < lim) {
				await new Promise((r) => setTimeout(r, 2000));
				txt = await page.evaluate((unit) => {
					if (!window.sae || !window.sae.running) return null;
					const d = window.sae.getDisk(unit);
					const out = d && window.__ofs.readFile(d.data, "out.txt");
					return out ? new TextDecoder("latin1").decode(out) : null;
				}, unit);
				if (txt && txt.includes(END)) break;
			}
		} catch (e) {
			console.error(`[${name}] ${e.message}`);
		}
		await page.close();
		const r = parse(txt);
		results[name] = r;
		done++;
		console.log(`${String(done).padStart(3)}/${list.length} ${r.status.padEnd(9)} ${name}${r.tests !== undefined ? "  (" + r.tests + " tests)" : ""}`);
	}
	await ctx.close();
}
await Promise.all(Array.from({ length: Math.min(jobs, list.length) }, worker));
await browser.close();
server.close();

const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, "utf8")) : {};
const was = baseline[set] || {};
/* a disk is better the further it gets; passing beats any failure */
const rank = (r) => (r.status === "pass" ? 1e9 + (r.tests || 0) : (r.tests || 0));
const regressions = [], better = [];
for (const [n, r] of Object.entries(results)) {
	const b = was[n];
	if (!b) continue;
	if (rank(r) < rank(b)) regressions.push(`${n}: ${r.status} after ${r.tests || 0} tests, baseline ${b.status} after ${b.tests || 0}`);
	else if (rank(r) > rank(b)) better.push(`${n}: ${r.status} after ${r.tests || 0} tests (was ${b.status} after ${b.tests || 0})`);
}
const count = (s) => Object.values(results).filter((r) => r.status === s).length;
console.log(`\n${list.length} disks: ${count("pass")} pass, ${count("fail")} fail, ${count("timeout")} timeout, ${count("no-output")} no output, ` +
	`${((Date.now() - t0) / 1000).toFixed(0)} s, ${jobs} jobs`);
if (show) for (const [n, r] of Object.entries(results)) if (r.status !== "pass") console.log(`\n== ${n} (${r.status}, ${r.tests || 0} tests)\n${r.mismatch || ""}`);
if (better.length) console.log("\nBetter than the baseline:\n  " + better.join("\n  "));
fs.mkdirSync(path.join(here, "results"), { recursive: true });
fs.writeFileSync(path.join(here, "results/cputester-" + set + ".json"), JSON.stringify(results, null, 1));
if (writeBaseline) {
	const out = { ...baseline, [set]: { ...was } };
	for (const [n, r] of Object.entries(results)) out[set][n] = { status: r.status, tests: r.tests || 0 };
	out[set] = Object.fromEntries(Object.entries(out[set]).sort(([a], [b]) => a.localeCompare(b)));
	fs.writeFileSync(baselineFile, JSON.stringify(out, null, 1) + "\n");
	console.log("baseline written: " + path.relative(process.cwd(), baselineFile));
}
if (regressions.length) {
	console.error("\nWorse than the baseline:\n  " + regressions.join("\n  "));
	if (check) process.exit(1);
}
