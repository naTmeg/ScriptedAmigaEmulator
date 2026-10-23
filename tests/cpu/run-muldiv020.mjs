#!/usr/bin/env node
/* MULU.L/MULS.L/DIVU.L/DIVS.L (68020, 32- and 64-bit forms) in SAE's CPU core against BigInt.
 * Random operands, biased towards sign and overflow edges; both cores (prefetch and normal).
 * Compares the result registers and N, Z, V, C (after an overflow only V and the untouched
 * registers). In the 32-bit MUL form N and Z describe the 32-bit result.
 *
 *   node tests/cpu/run-muldiv020.mjs            40000 cases per core
 *   node tests/cpu/run-muldiv020.mjs --n 1000   fewer
 * Exit code 1 on any difference. */
import { createCpu } from "./sae-cpu-node.mjs";

const ai = process.argv.indexOf("--n");
const N = ai < 0 ? 40000 : +process.argv[ai + 1];
const S32 = (x) => BigInt.asIntN(32, BigInt(x)), U32 = (x) => BigInt.asUintN(32, BigInt(x));
const hex = (x) => (x >>> 0).toString(16).padStart(8, "0");
let failed = 0;

for (const compatible of [true, false]) {
	const { ctx, ram, run } = createCpu({ model: 68020, compatible });
	ctx.SAER.gui.led = () => {};
	const regs = ctx.SAER_CPU_regs, cpu = ctx.SAER.cpu, BRK = run("SAEC_spcflag_BRK", "brk.js");
	let seed = 1;
	const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed; };
	const pick = () => { const v = rnd() ^ (rnd() << 13); return [v, v & 0xffff, v | 0x80000000, -(v & 0xffff), 0x80000000, 0xffffffff, 1][rnd() % 7] >>> 0; };
	/* one instruction at $1000: op, ext; operands in D0 (source), D1 (Dl/Dq), D2 (Dh/Dr) */
	const exec = (op, ext, d) => {
		ram.set([op >> 8, op & 0xff, ext >> 8, ext & 0xff, 0x4e, 0x71], 0x1000);
		for (let i = 0; i < 8; i++) regs.d[i] = d[i] >>> 0;
		regs.s = true; regs.a[7] = regs.isp = 0x8000; regs.vbr = 0;
		regs.x = regs.n = regs.z = regs.v = regs.c = false;
		ctx.SAER.m68k.halted = 0;
		cpu.setPrefetchState(0x1000, op, ext);
		ctx.SAEV_spcflags = BRK;
		ctx.SAER_CPU_run_func();
		return { d1: regs.d[1] >>> 0, d2: regs.d[2] >>> 0, n: regs.n, z: regs.z, v: regs.v, c: regs.c };
	};
	const bad = {};
	const note = (k, s) => { const b = (bad[k] = bad[k] || { n: 0, ex: [] }); b.n++; if (b.ex.length < 3) b.ex.push(s); };
	for (let t = 0; t < N; t++) {
		const signed = (t & 1) != 0, long64 = (t & 2) != 0, div = (t & 4) != 0;
		const src = pick(), dl = pick(), dh = pick();
		const ext = (1 << 12) | (signed ? 0x800 : 0) | (long64 ? 0x400 : 0) | 2;
		const name = (div ? "DIV" : "MUL") + (signed ? "S" : "U") + ".L" + (long64 ? " 64" : " 32");
		if (!div) {
			const r = exec(0x4c00, ext, [src, dl, dh]); /* MULx.L D0,[D2:]D1 */
			const p = signed ? S32(src) * S32(dl) : U32(src) * U32(dl);
			const lo = Number(BigInt.asUintN(32, p)), hi = Number(BigInt.asUintN(32, p >> 32n));
			const v = !long64 && (signed ? p !== BigInt.asIntN(32, p) : p !== BigInt.asUintN(32, p));
			const n = long64 ? (hi & 0x80000000) != 0 : (lo & 0x80000000) != 0;
			const z = long64 ? p === 0n : lo === 0;
			const tag = `${hex(src)} * ${hex(dl)}`;
			if (r.d1 !== lo || r.d2 !== (long64 ? hi : dh)) note(name + " result", `${tag}: ${hex(r.d2)}:${hex(r.d1)}, expected ${hex(long64 ? hi : dh)}:${hex(lo)}`);
			if (r.n !== n || r.z !== z || r.v !== v || r.c) note(name + " flags", `${tag}: NZVC ${+r.n}${+r.z}${+r.v}${+r.c}, expected ${+n}${+z}${+v}0`);
		} else {
			if (src === 0) continue; /* division by zero is an exception, not checked here */
			const dividend = long64 ? (signed ? BigInt.asIntN(64, (U32(dh) << 32n) | U32(dl)) : (U32(dh) << 32n) | U32(dl)) : (signed ? S32(dl) : U32(dl));
			const divisor = signed ? S32(src) : U32(src);
			const q = dividend / divisor, rem = dividend % divisor;
			const ovf = signed ? q !== BigInt.asIntN(32, q) : q !== BigInt.asUintN(32, q);
			const r = exec(0x4c40, ext, [src, dl, dh]); /* DIVx.L D0,D2:D1 */
			const tag = `${long64 ? hex(dh) + ":" : ""}${hex(dl)} / ${hex(src)}`;
			if (r.v !== ovf) { note(name + " overflow", `${tag}: V ${+r.v}, expected ${+ovf}`); continue; }
			if (ovf) { if (r.d1 !== dl || r.d2 !== dh) note(name + " overflow changes registers", tag); continue; }
			const qq = Number(BigInt.asUintN(32, q)), rr = Number(BigInt.asUintN(32, rem));
			if (r.d1 !== qq || r.d2 !== rr) note(name + " result", `${tag}: q ${hex(r.d1)} r ${hex(r.d2)}, expected q ${hex(qq)} r ${hex(rr)}`);
			if (r.n !== ((qq & 0x80000000) != 0) || r.z !== (qq === 0) || r.c) note(name + " flags", `${tag}: NZC ${+r.n}${+r.z}${+r.c}, quotient ${hex(qq)}`);
		}
	}
	const keys = Object.keys(bad);
	console.log(`${compatible ? "prefetch" : "normal  "} core: ${N} cases, ${keys.length ? keys.reduce((s, k) => s + bad[k].n, 0) + " differences" : "no differences"}`);
	for (const k of keys) console.log(`  ${k}: ${bad[k].n}\n    ${bad[k].ex.join("\n    ")}`);
	if (keys.length) failed++;
}
process.exit(failed ? 1 : 0);
