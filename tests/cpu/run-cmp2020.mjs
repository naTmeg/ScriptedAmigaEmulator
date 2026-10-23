#!/usr/bin/env node
/* 68020 CMP2 with An and Dn in both cores: with An the bounds are sign-extended and compared with
 * all 32 bits of An (MC68020 User's Manual), with Dn at the operand size. Exit code 1 on a difference. */
import { createCpu } from "./sae-cpu-node.mjs";
const cases = [ /* size, reg ("a1"/"d1"), value, lb, ub, expected Z, C */
	["b", "a1", 0x00001234, 0x30, 0x40, 0, 1], /* low byte $34 in range, An itself not */
	["b", "a1", 0x00000034, 0x30, 0x40, 0, 0],
	["b", "a1", 0xffffff90, 0x80, 0xa0, 0, 0], /* -112 in -128..-96 */
	["b", "a1", 0x00000090, 0x80, 0xa0, 0, 1], /* +144 not in -128..-96 */
	["w", "a1", 0x00018000, 0x7000, 0x7fff, 0, 1],
	["w", "a1", 0xffff8000, 0x8000, 0x9000, 1, 0],
	["l", "a1", 0x80000000, 0x80000000, 0x00000010, 1, 0], /* signed: -2^31 .. 16 */
	["l", "a1", 0x00000020, 0x80000000, 0x00000010, 0, 1],
	["l", "a1", 0xfffffff0, 0xffffff00, 0x00000010, 0, 0], /* -16 in -256..16 */
	["b", "d1", 0x12345634, 0x30, 0x40, 0, 0], /* Dn: only the low byte */
	["w", "d1", 0x00008001, 0x8000, 0x8000, 0, 1],
	["l", "d1", 0xfffffff0, 0xffffff00, 0x00000010, 0, 0],
];
let bad = 0;
for (const compatible of [true, false]) {
	const { ctx, ram, run } = createCpu({ model: 68020, compatible });
	ctx.SAER.gui.led = () => {};
	const regs = ctx.SAER_CPU_regs, cpu = ctx.SAER.cpu, BRK = run("SAEC_spcflag_BRK", "b.js");
	for (const [size, reg, value, lb, ub, z, c] of cases) {
		const n = { b: 1, w: 2, l: 4 }[size];
		const op = { b: 0x00d0, w: 0x02d0, l: 0x04d0 }[size]; /* CMP2.x (A0),Rn */
		const ext = (reg[0] == "a" ? 0x8000 : 0) | (1 << 12);
		ram.set([op >> 8, op & 0xff, ext >> 8, ext & 0xff, 0x4e, 0x71], 0x1000);
		for (let i = 0; i < n; i++) { ram[0x3000 + i] = (lb >>> (8 * (n - 1 - i))) & 0xff; ram[0x3000 + n + i] = (ub >>> (8 * (n - 1 - i))) & 0xff; }
		regs.a[0] = 0x3000; regs.a[1] = value; regs.d[1] = value; regs.s = true; regs.a[7] = regs.isp = 0x8000;
		cpu.setPrefetchState(0x1000, op, ext); ctx.SAEV_spcflags = BRK; ctx.SAER_CPU_run_func();
		if (+regs.z !== z || +regs.c !== c) { bad++; console.log(`${compatible ? "prefetch" : "normal"} CMP2.${size} ${reg}=$${value.toString(16)} [$${lb.toString(16)},$${ub.toString(16)}]: ZC ${+regs.z}${+regs.c}, expected ${z}${c}`); }
	}
}
console.log(cases.length * 2, "cases,", bad ? bad + " wrong" : "all correct");
process.exit(bad ? 1 : 0);
