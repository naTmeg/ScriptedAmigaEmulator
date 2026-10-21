#!/usr/bin/env node
/* 68020 bit field instructions (BFTST BFEXTU BFCHG BFEXTS BFCLR BFFFO BFSET BFINS) in both cores
 * against a bit-by-bit model of the MC68020 manual: memory form with signed offsets from a data
 * register (-200 ... +200 bits around (A0)) and register form (offset modulo 32, wrapping).
 * Compares memory, registers and N, Z, V, C. Exit code 1 on any difference. */
import { createCpu } from "./sae-cpu-node.mjs";

const N = 8000;
const OPS = ["BFTST", "BFEXTU", "BFCHG", "BFEXTS", "BFCLR", "BFFFO", "BFSET", "BFINS"]; /* $E8C0 + i * $100 */
const BASE = 0x4000, LO = BASE - 32, HI = BASE + 32;
let failed = 0;
for (const compatible of [true, false]) {
	const { ctx, ram, run } = createCpu({ model: 68020, compatible });
	ctx.SAER.gui.led = () => {};
	const regs = ctx.SAER_CPU_regs, cpu = ctx.SAER.cpu, BRK = run("SAEC_spcflag_BRK", "brk.js");
	let seed = 3;
	const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed >>> 8; };
	const r32 = () => ((rnd() << 16) ^ rnd()) >>> 0;
	let bad = 0;
	const fail = (s) => { if (bad++ < 6) console.log(`  ${compatible ? "prefetch" : "normal"} core: ${s}`); };
	for (let t = 0; t < N; t++) {
		const id = t % 8, op = OPS[id], memForm = (t & 8) == 0;
		const width = 1 + (rnd() % 32);
		const offset = memForm ? (rnd() % 401) - 200 : (id == 5 ? rnd() % 32 : r32() | 0);
		const ins = r32(), target = r32();
		/* model: bits as an array, MSB of the field first */
		const mem = Array.from({ length: HI - LO }, () => rnd() & 0xff);
		const bitPos = (i) => memForm ? { byte: BASE + Math.floor((offset + i) / 8), bit: 7 - (((offset + i) % 8) + 8) % 8 }
			: { bit: 31 - ((((offset + i) % 32) + 32) % 32) };
		const getBit = (m, d, i) => { const p = bitPos(i); return memForm ? (m[p.byte - LO] >> p.bit) & 1 : (d >>> p.bit) & 1; };
		let field = 0;
		for (let i = 0; i < width; i++) field = field * 2 + getBit(mem, target, i);
		const msb = width == 32 ? 2 ** 31 : 2 ** (width - 1);
		const insField = width == 32 ? ins : ins & (2 ** width - 1);
		const flagSrc = id == 7 ? insField : field;
		const want = { n: flagSrc >= msb, z: flagSrc == 0 };
		const newBit = (i, old) => { /* bit i (0 = MSB) after the operation */
			switch (op) {
				case "BFCHG": return old ^ 1;
				case "BFCLR": return 0;
				case "BFSET": return 1;
				case "BFINS": return Math.floor(insField / 2 ** (width - 1 - i)) & 1;
				default: return old;
			}
		};
		const wantMem = mem.slice();
		let wantTarget = target;
		for (let i = 0; i < width; i++) {
			const p = bitPos(i), old = getBit(mem, target, i), nb = newBit(i, old);
			if (memForm) wantMem[p.byte - LO] = (wantMem[p.byte - LO] & ~(1 << p.bit)) | (nb << p.bit);
			else wantTarget = ((wantTarget & ~(1 << p.bit)) | (nb << p.bit)) >>> 0;
		}
		let wantD4 = 0x11111111;
		if (op == "BFEXTU") wantD4 = field >>> 0;
		if (op == "BFEXTS") wantD4 = (field >= msb ? field - 2 * msb : field) >>> 0;
		if (op == "BFFFO") { let i = 0; while (i < width && !getBit(mem, target, i)) i++; wantD4 = (offset + i) >>> 0; }
		if (op == "BFINS") wantD4 = ins;
		/* <op> <ea>{D3:#width}, D4; ea = (A0) or D5 */
		const opcode = 0xe8c0 + id * 0x100 + (memForm ? 0x10 : 5);
		const ext = (4 << 12) | 0x800 | (3 << 6) | (width & 31);
		ram.set([opcode >> 8, opcode & 0xff, ext >> 8, ext & 0xff, 0x4e, 0x71], 0x1000);
		ram.set(mem, LO);
		regs.a[0] = BASE; regs.d[3] = offset >>> 0; regs.d[4] = op == "BFINS" ? ins : 0x11111111; regs.d[5] = target;
		regs.s = true; regs.a[7] = regs.isp = 0x8000;
		regs.x = regs.n = regs.z = regs.v = regs.c = true;
		ctx.SAER.m68k.halted = 0;
		cpu.setPrefetchState(0x1000, opcode, ext);
		ctx.SAEV_spcflags = BRK;
		ctx.SAER_CPU_run_func();
		const name = `${op} ${memForm ? "(A0)" : "D5"}{${offset}:${width}}`;
		const diffs = [];
		if (memForm) { for (let a = LO; a < HI; a++) if (ram[a] !== wantMem[a - LO]) { diffs.push(`mem $${a.toString(16)} $${ram[a].toString(16)} (expected $${wantMem[a - LO].toString(16)})`); break; } }
		else if ((regs.d[5] >>> 0) !== wantTarget) diffs.push(`D5 $${(regs.d[5] >>> 0).toString(16)} (expected $${wantTarget.toString(16)})`);
		if ((regs.d[4] >>> 0) !== wantD4) diffs.push(`D4 $${(regs.d[4] >>> 0).toString(16)} (expected $${wantD4.toString(16)})`);
		if (regs.n !== want.n || regs.z !== want.z || regs.v || regs.c || !regs.x) diffs.push(`XNZVC ${+regs.x}${+regs.n}${+regs.z}${+regs.v}${+regs.c} (expected 1${+want.n}${+want.z}00)`);
		if (diffs.length) fail(`${name}: ${diffs.join(", ")}`);
	}
	console.log(`${compatible ? "prefetch" : "normal  "} core: ${N} cases, ${bad ? bad + " differences" : "no differences"}`);
	if (bad) failed++;
}
process.exit(failed ? 1 : 0);
