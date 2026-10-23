#!/usr/bin/env node
/* Run the vAmigaTS screenshot suite (tests/browser/suite.htm) headless in Chromium via Playwright.
 * Every test runs in turbo mode with a fixed random seed and clock and stops after exactly
 * --frames emulated frames, so a run is reproducible. Scores are compared with
 * tests/browser-baseline.json: only tests that got worse count as failures.
 *
 *   node tests/run-suite.mjs                         all tests in suite.json
 *   node tests/run-suite.mjs --filter CPU/Exceptions only tests whose path or group contains this
 *   node tests/run-suite.mjs --filter "CPU/Misc|CPU/Prefetch"   several alternatives
 *   node tests/run-suite.mjs --jobs 4                parallel browser pages (default: logical CPUs - 4)
 *   node tests/run-suite.mjs --frames 1200           emulated frames per test (default 1200, about 24 s of A500 time)
 *   node tests/run-suite.mjs --core normal           use the fast core (default: compatible, the only one with address errors)
 *   node tests/run-suite.mjs --extra "&model=A1200"  more run.htm parameters (no baseline comparison then)
 *   node tests/run-suite.mjs --check                 exit 1 on a regression against the baseline
 *   node tests/run-suite.mjs --write-baseline        store the scores of this run in the baseline (merged)
 *   node tests/run-suite.mjs --headed                show the browser
 *
 * Needs tests/browser/suite.json: npm run fetch:vamigats */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const baselineFile = path.join(here, "browser-baseline.json");
const suiteFile = path.join(here, "browser/suite.json");

function arg(name, def) {
	const i = process.argv.indexOf("--" + name);
	if (i < 0) return def;
	const v = process.argv[i + 1];
	return v === undefined || v.startsWith("--") ? true : v;
}
const filter = String(arg("filter", ""));
const frames = +arg("frames", 1200);
const core = String(arg("core", "compatible"));
const jobs = Math.max(1, +arg("jobs", Math.max(1, os.cpus().length - 4)));
const check = !!arg("check", false);
const writeBaseline = !!arg("write-baseline", false);
const headed = !!arg("headed", false);
/* 2D canvas: with WebGL all pages wait on the one software-rendering GPU process */
/* The suite boots the AROS build of 2019, not the one SAE ships: the vAmigaTS programs rely on
   the hardware state the Kickstart leaves behind, and the newer AROS leaves interrupts and its
   display running, which disturbs the screenshots (the IPL tests drop from ~80 % to ~18 %). The
   baseline was recorded with this pair. --extra "&rom=...&ext=..." boots another one. */
const suiteRom = /[?&]rom=/.test(String(arg("extra", ""))) ? "" : "&rom=../roms/aros-2019-svn55696-rom.bin&ext=../roms/aros-2019-svn55696-ext.bin";
const extra = (core === "compatible" ? "&compat=1" : "") + "&video=canvas" + suiteRom + String(arg("extra", ""));
const TOLERANCE = 0.005; /* a score may drop by this much before it counts as a regression */

if (!fs.existsSync(suiteFile)) { console.error("missing tests/browser/suite.json, run: npm run fetch:vamigats"); process.exit(2); }
const suite = JSON.parse(fs.readFileSync(suiteFile, "utf8"));
const filters = filter.split("|").filter(Boolean);
const list = suite.filter((t) => !filters.length || filters.some((f) => (t.adf + " " + t.group).includes(f)));
if (!list.length) { console.error("no tests match " + JSON.stringify(filter)); process.exit(2); }

/* minimal static file server for the repository. Shared files are read once and kept in memory:
   with many pages loading the same scripts at once, reading them again for every request
   occasionally failed (a missing prototypes.js then showed up as "Math.truncate is not a
   function" and a test that did not start). Failed requests are logged. */
const types = { ".htm": "text/html", ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css" };
const fileCache = new Map();
const server = http.createServer((req, res) => {
	const p = path.normalize(path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
	if (!p.startsWith(root)) { res.writeHead(403).end(); return; }
	let data = fileCache.get(p);
	if (!data) {
		try { data = fs.readFileSync(p); } catch (err) {
			console.error(`[server] ${req.url}: ${err.code || err.message}`);
			res.writeHead(err.code === "ENOENT" ? 404 : 500).end();
			return;
		}
		/* only what every test loads: scripts, pages, the ROMs (not the 507 disk images) */
		if (types[path.extname(p)] || p.endsWith(".bin")) fileCache.set(p, data);
	}
	res.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" });
	res.end(data);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/tests/browser/suite.htm`;

const browser = await chromium.launch({
	headless: !headed,
	/* hidden or occluded pages must keep running at full speed */
	args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--autoplay-policy=no-user-gesture-required"],
});
const t0 = Date.now();
const progress = setInterval(() => {
	const s = (Date.now() - t0) / 1000, f = finished / list.length;
	const left = f > 0.05 ? `, about ${Math.ceil((s / f) * (1 - f) / 60)} min left` : "";
	console.log(`-- ${Math.floor(s / 60)} min: ${finished}/${list.length} tests${left}`);
}, 60000);
const results = {};
let finished = 0;
/* a queue of small chunks: a fixed share per page would leave the pages that got the quick
   tests idle while the others still work */
const chunk = Math.max(1, Math.min(4, Math.ceil(list.length / jobs)));
let nextFrom = 0;
await Promise.all(Array.from({ length: Math.min(jobs, Math.ceil(list.length / chunk)) }, async (_, j) => {
	/* one context per job: pages of one context share a renderer process (same site) and
	   with it one main thread, so they would not really run in parallel */
	const context = await browser.newContext();
	const page = await context.newPage();
	page.on("pageerror", (e) => console.error(`[page ${j}] ${e.message}`));
	page.on("requestfailed", (r) => console.error(`[page ${j}] request failed: ${r.url().replace(/^https?:\/\/[^/]+/, "")} ${r.failure() ? r.failure().errorText : ""}`));
	while (nextFrom < list.length) {
		const from = nextFrom, count = Math.min(chunk, list.length - from);
		nextFrom += count;
		const url = `${base}?filter=${encodeURIComponent(filter)}&from=${from}&count=${count}&frames=${frames}&turbo=1&det=1${extra}`;
		await page.goto(url);
		let seen = 0;
		for (;;) {
			const st = await page.evaluate(() => ({ done: !!window.suiteDone, error: window.suiteError || null, results: window.suiteResults || {} }));
			if (st.error) throw new Error(st.error);
			for (const t of list.slice(from, from + count)) {
				const r = st.results[t.id];
				if (r && !results[t.id]) {
					results[t.id] = r; finished++; seen++;
					const s = r.score == null ? "  -   " : (r.score * 100).toFixed(2).padStart(6) + "%";
					console.log(`${String(finished).padStart(4)}/${list.length} ${s}  ${t.id}${r.note ? "  (" + r.note + ")" : ""}`);
				}
			}
			if (st.done) { if (seen < count) console.error(`[page ${j}] finished with ${count - seen} results missing`); break; }
			await new Promise((r) => setTimeout(r, 500));
		}
	}
	await context.close();
}));
clearInterval(progress);
await browser.close();
server.close();

/* the baseline only applies to runs with the same frame count and core */
const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, "utf8")) : { frames, core, scores: {} };
const comparable = baseline.frames === frames && baseline.core === core && !arg("extra", "");
const regressions = [], improvements = [];
for (const t of list) {
	const was = baseline.scores[t.id], now = results[t.id] && results[t.id].score;
	if (was == null || !comparable) continue;
	if (now == null || now < was - TOLERANCE) regressions.push(`${t.id}: ${now == null ? "no score" : (now * 100).toFixed(2) + "%"} < baseline ${(was * 100).toFixed(2)}%`);
	else if (now > was + TOLERANCE) improvements.push(`${t.id}: ${(now * 100).toFixed(2)}% > baseline ${(was * 100).toFixed(2)}%`);
}
const scored = list.filter((t) => results[t.id] && results[t.id].score != null);
const perfect = scored.filter((t) => results[t.id].score >= 0.995);
console.log(`\n${list.length} tests, ${scored.length} scored, ${perfect.length} at 99.5 % or better, ${((Date.now() - t0) / 1000).toFixed(0)} s, ${jobs} jobs, ${frames} frames, ${core} core`);
if (!comparable) console.log(`baseline was recorded with ${baseline.frames} frames and the ${baseline.core} core, not compared`);
if (improvements.length) console.log("Better than the baseline:\n  " + improvements.join("\n  "));

fs.mkdirSync(path.join(here, "results"), { recursive: true });
fs.writeFileSync(path.join(here, "results/browser.json"), JSON.stringify({ frames, core, filter, results }, null, 1));
if (writeBaseline) {
	if (arg("extra", "")) { console.error("not writing a baseline for a run with --extra"); process.exit(2); }
	const out = { frames, core, scores: comparable ? { ...baseline.scores } : {} };
	for (const t of scored) out.scores[t.id] = Math.round(results[t.id].score * 10000) / 10000;
	out.scores = Object.fromEntries(Object.entries(out.scores).sort(([a], [b]) => a.localeCompare(b)));
	fs.writeFileSync(baselineFile, JSON.stringify(out, null, 1) + "\n");
	console.log("baseline written: " + path.relative(process.cwd(), baselineFile));
}
if (regressions.length) {
	console.error("\nWorse than the baseline:\n  " + regressions.join("\n  "));
	if (check) process.exit(1);
}
