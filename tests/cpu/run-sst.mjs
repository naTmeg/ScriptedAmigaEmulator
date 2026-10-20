#!/usr/bin/env node
/* Run the SingleStepTests 68000 corpus (https://github.com/SingleStepTests/680x0) against
 * SAE's CPU core in Node. Each test sets registers, SR, PC, prefetch and RAM, executes
 * exactly one instruction and compares registers, SR, PC and RAM with the expected state.
 * Cycle counts and bus transactions are not compared (SAE is not bus-cycle exact).
 *
 *   node tests/cpu/run-sst.mjs                  first 200 tests of every file (quick)
 *   node tests/cpu/run-sst.mjs --limit 0        all ~8000 tests per file (~1 M tests)
 *   node tests/cpu/run-sst.mjs --only ROXL      files whose name contains ROXL
 *   node tests/cpu/run-sst.mjs --show 5         print up to 5 failing tests per file
 *   node tests/cpu/run-sst.mjs --prefetch       also compare the prefetch queue
 *   node tests/cpu/run-sst.mjs --core normal    use the non-compatible core
 *   node tests/cpu/run-sst.mjs --check          exit 1 if any file fails more than tests/cpu/sst-baseline.json
 *   node tests/cpu/run-sst.mjs --write-baseline write the current failure counts as the baseline
 *
 * Test files are downloaded on first use into tests/.cache/sst (about 193 MB for all of them).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { createCpu } from "./sae-cpu-node.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.resolve(here, "../.cache/sst");
const baselineFile = path.join(here, "sst-baseline.json");
const BASE_URL = "https://raw.githubusercontent.com/SingleStepTests/680x0/main/68000/v1/";

const FILES = "ABCD ADD.b ADD.l ADD.w ADDA.l ADDA.w ADDX.b ADDX.l ADDX.w AND.b AND.l AND.w ANDItoCCR ANDItoSR ASL.b ASL.l ASL.w ASR.b ASR.l ASR.w BCHG BCLR BSET BSR BTST Bcc CHK CLR.b CLR.l CLR.w CMP.b CMP.l CMP.w CMPA.l CMPA.w DBcc DIVS DIVU EOR.b EOR.l EOR.w EORItoCCR EORItoSR EXG EXT.l EXT.w JMP JSR LEA LINK LSL.b LSL.l LSL.w LSR.b LSR.l LSR.w MOVE.b MOVE.l MOVE.q MOVE.w MOVEA.l MOVEA.w MOVEM.l MOVEM.w MOVEP.l MOVEP.w MOVEfromSR MOVEfromUSP MOVEtoCCR MOVEtoSR MOVEtoUSP MULS MULU NBCD NEG.b NEG.l NEG.w NEGX.b NEGX.l NEGX.w NOP NOT.b NOT.l NOT.w OR.b OR.l OR.w ORItoCCR ORItoSR PEA RESET ROL.b ROL.l ROL.w ROR.b ROR.l ROR.w ROXL.b ROXL.l ROXL.w ROXR.b ROXR.l ROXR.w RTE RTR RTS SBCD SUB.b SUB.l SUB.w SUBA.l SUBA.w SUBX.b SUBX.l SUBX.w SWAP Scc TAS TRAP TRAPV TST.b TST.l TST.w UNLINK".split(" ");

function arg(name, def) {
	const i = process.argv.indexOf("--" + name);
	if (i < 0) return def;
	const v = process.argv[i + 1];
	return v === undefined || v.startsWith("--") ? true : v;
}
const limit = +arg("limit", 200);
const only = arg("only", "");
const show = +arg("show", 0);
const comparePrefetch = !!arg("prefetch", false);
const core = arg("core", "compatible");
const check = !!arg("check", false);
const writeBaseline = !!arg("write-baseline", false);

async function loadFile(name) {
	fs.mkdirSync(cacheDir, { recursive: true });
	const file = path.join(cacheDir, name + ".json.gz");
	if (!fs.existsSync(file)) {
		const res = await fetch(BASE_URL + encodeURIComponent(name) + ".json.gz");
		if (!res.ok) throw new Error("download " + name + ": HTTP " + res.status);
		fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
	}
	return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
}

const { ctx, ram, run } = createCpu({ model: 68000, compatible: core === "compatible" });
ctx.SAER.gui.led = () => {};
/* RESET pulses the reset line of the rest of the machine; there is none here */
ctx.SAER.m68k.cpureset = () => {};
const regs = ctx.SAER_CPU_regs;
const cpu = ctx.SAER.cpu;
const m68k = ctx.SAER.m68k;
/* SAEC_* are const declarations: lexical, not properties of the context's global object */
const C = run("({ BRK: SAEC_spcflag_BRK, TRACE: SAEC_spcflag_TRACE, DOTRACE: SAEC_spcflag_DOTRACE })", "consts.js");

let dirty = [];
function setState(s) {
	for (const a of dirty) ram[a] = 0;
	dirty = [];
	for (const [a, v] of s.ram) { ram[a & 0xffffff] = v; dirty.push(a & 0xffffff); }
	for (let i = 0; i < 8; i++) regs.d[i] = s["d" + i] >>> 0;
	for (let i = 0; i < 7; i++) regs.a[i] = s["a" + i] >>> 0;
	const sr = s.sr;
	regs.t1 = (sr & 0x8000) != 0; regs.t0 = false; regs.m = false;
	regs.s = (sr & 0x2000) != 0;
	regs.intmask = (sr >> 8) & 7;
	regs.x = (sr & 16) != 0; regs.n = (sr & 8) != 0; regs.z = (sr & 4) != 0; regs.v = (sr & 2) != 0; regs.c = (sr & 1) != 0;
	regs.usp = s.usp >>> 0; regs.isp = s.ssp >>> 0;
	regs.a[7] = regs.s ? regs.isp : regs.usp;
	regs.vbr = 0;
	m68k.halted = 0; m68k.stopped = false;
	ctx.SAEV_spcflags = C.BRK | (regs.t1 ? C.TRACE : 0);
	cpu.setPrefetchState(s.pc, s.prefetch[0], s.prefetch[1]);
}
function getState() {
	const sr = (regs.t1 ? 0x8000 : 0) | (regs.s ? 0x2000 : 0) | (regs.intmask << 8) |
		(regs.x ? 16 : 0) | (regs.n ? 8 : 0) | (regs.z ? 4 : 0) | (regs.v ? 2 : 0) | (regs.c ? 1 : 0);
	const st = { sr, pc: cpu.getPC_normal() >>> 0, prefetch: [regs.ir, regs.irc] };
	for (let i = 0; i < 8; i++) st["d" + i] = regs.d[i] >>> 0;
	for (let i = 0; i < 7; i++) st["a" + i] = regs.a[i] >>> 0;
	st.usp = (regs.s ? regs.usp : regs.a[7]) >>> 0;
	st.ssp = (regs.s ? regs.a[7] : regs.isp) >>> 0;
	return st;
}
function step(tracedAtStart) {
	ctx.SAER_CPU_run_func();
	/* With T set when the instruction started, the 68000 takes the trace exception right after
	 * it. SAE queues that as DOTRACE for the next do_specialties() call, so run that call here.
	 * An instruction that only sets T (MOVE to SR, RTE) is not traced itself. */
	if (tracedAtStart && (ctx.SAEV_spcflags & C.DOTRACE)) { ctx.SAEV_spcflags |= C.BRK; m68k.do_specialties(0); }
}
function compare(t) {
	const got = getState(), exp = t.final, diffs = [];
	const keys = ["d0","d1","d2","d3","d4","d5","d6","d7","a0","a1","a2","a3","a4","a5","a6","usp","ssp","sr","pc"];
	for (const k of keys) if ((got[k] >>> 0) !== (exp[k] >>> 0)) diffs.push(`${k} ${hex(got[k])} != ${hex(exp[k])}`);
	for (const [a, v] of exp.ram) if (ram[a & 0xffffff] !== v) diffs.push(`ram[${hex(a)}] ${hex(ram[a & 0xffffff], 2)} != ${hex(v, 2)}`);
	if (comparePrefetch && (got.prefetch[0] !== exp.prefetch[0] || got.prefetch[1] !== exp.prefetch[1]))
		diffs.push(`prefetch ${got.prefetch.map((v) => hex(v, 4))} != ${exp.prefetch.map((v) => hex(v, 4))}`);
	return diffs;
}
const hex = (v, n = 8) => "$" + (v >>> 0).toString(16).padStart(n, "0");

const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, "utf8")) : {};
const results = {};
let totalRun = 0, totalFail = 0, regressions = [];
const t0 = Date.now();
for (const name of FILES.filter((n) => !only || n.includes(only))) {
	const tests = await loadFile(name);
	const list = limit > 0 ? tests.slice(0, limit) : tests;
	let fail = 0, crash = 0, shown = 0, failAe = 0;
	for (const t of list) {
		let diffs;
		try { setState(t.initial); step((t.initial.sr & 0x8000) != 0); diffs = compare(t); }
		catch (e) { crash++; diffs = ["exception: " + (e && e.message)]; }
		if (diffs.length) {
			fail++;
			/* a group-0 exception was expected: address error, 14-byte frame on the supervisor stack */
			if (t.initial.ssp - t.final.ssp === 14) failAe++;
			if (shown < show) { shown++; console.log(`  ${name} | ${t.name}\n      ${diffs.slice(0, 6).join("\n      ")}`); }
		}
	}
	totalRun += list.length; totalFail += fail;
	results[name] = { run: list.length, fail, crash, failAddressError: failAe };
	const base = baseline[name];
	const worse = base !== undefined && limit === base.limit && fail > base.fail;
	if (worse) regressions.push(`${name}: ${fail} > baseline ${base.fail}`);
	const pct = ((list.length - fail) / list.length * 100).toFixed(1).padStart(5);
	console.log(`${name.padEnd(12)} ${String(list.length).padStart(5)} tests  ${pct} % pass${fail ? `  (${fail} fail: ${failAe} address error, ${fail - failAe} other${crash ? `, ${crash} crash` : ""})` : ""}${worse ? "  REGRESSION" : ""}`);
}
const totalAe = Object.values(results).reduce((a, r) => a + r.failAddressError, 0);
console.log(`\nfailures with an expected address-error frame: ${totalAe}, other failures: ${totalFail - totalAe}`);
console.log(`${totalRun} tests, ${totalFail} failed (${((totalRun - totalFail) / totalRun * 100).toFixed(2)} % pass), ${((Date.now() - t0) / 1000).toFixed(1)} s, core: ${core}`);

fs.mkdirSync(path.resolve(here, "../results"), { recursive: true });
fs.writeFileSync(path.resolve(here, "../results/sst.json"), JSON.stringify({ limit, core, results }, null, 1));
if (writeBaseline) {
	const out = {};
	for (const [k, v] of Object.entries(results)) out[k] = { limit, fail: v.fail };
	fs.writeFileSync(baselineFile, JSON.stringify(out, null, 1) + "\n");
	console.log("baseline written: " + path.relative(process.cwd(), baselineFile));
}
if (check && regressions.length) {
	console.error("\nRegressions against the baseline:\n  " + regressions.join("\n  "));
	process.exit(1);
}
