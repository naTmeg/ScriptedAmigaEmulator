#!/usr/bin/env node
/* 68020 format $2 exception frames in both cores: CHK, DIVU by zero (word and long), TRAPV and
 * TRAPcc (no operand, .W, .L). Each frame is 12 bytes: SR, PC of the next instruction, format/
 * vector word $2xxx, address of the instruction that trapped. Exit code 1 on any difference. */
import { createCpu } from "./sae-cpu-node.mjs";

const cases = [
	/* name, code, vector, length */
	["CHK.W D1,D0", [0x41, 0x81], 6, 2],
	["DIVU.W D1,D0", [0x80, 0xc1], 5, 2],
	["DIVU.W #0,D0", [0x80, 0xfc, 0, 0], 5, 4],
	["DIVU.L D1,D0", [0x4c, 0x41, 0x00, 0x00], 5, 4],
	["TRAPV", [0x4e, 0x76], 7, 2],
	["TRAPT", [0x50, 0xfc], 7, 2],
	["TRAPT.W #$1234", [0x50, 0xfa, 0x12, 0x34], 7, 4],
	["TRAPT.L #$12345678", [0x50, 0xfb, 0x12, 0x34, 0x56, 0x78], 7, 6],
];
let bad = 0;
for (const compatible of [true, false]) {
	const { ctx, ram, run } = createCpu({ model: 68020, compatible });
	ctx.SAER.gui.led = () => {};
	const regs = ctx.SAER_CPU_regs, cpu = ctx.SAER.cpu, BRK = run("SAEC_spcflag_BRK", "brk.js");
	const r16 = (a) => (ram[a] << 8) | ram[a + 1], r32 = (a) => ((r16(a) << 16) | r16(a + 2)) >>> 0;
	const hex = (x) => "$" + (x >>> 0).toString(16);
	for (const v of [5, 6, 7]) ram.set([0, 0, 0x20, 0], v * 4); /* handlers at $2000 */
	ram.set([0x4e, 0x71], 0x2000);
	for (const [name, code, vec, len] of cases) {
		ram.set([...code, 0x4e, 0x71], 0x1000);
		regs.s = true; regs.m = false; regs.a[7] = regs.isp = 0x8000; regs.vbr = 0;
		regs.x = regs.n = regs.z = regs.c = false; regs.v = true; /* V for TRAPV */
		regs.d[0] = 0xffff; regs.d[1] = 0; /* CHK: -1 < 0; DIVU: divisor 0 */
		ctx.SAER.m68k.halted = 0;
		cpu.setPrefetchState(0x1000, (code[0] << 8) | code[1], (code[2] << 8) | (code[3] | 0));
		ctx.SAEV_spcflags = BRK;
		ctx.SAER_CPU_run_func();
		const sp = regs.a[7] >>> 0;
		const got = { used: 0x8000 - sp, pc: r32(sp + 2), fv: r16(sp + 6), addr: r32(sp + 8), now: cpu.getPC_normal() >>> 0 };
		const want = { used: 12, pc: 0x1000 + len, fv: 0x2000 + vec * 4, addr: 0x1000, now: 0x2000 };
		const diff = Object.keys(want).filter((k) => got[k] !== want[k]);
		if (diff.length) {
			bad++;
			console.log(`${compatible ? "prefetch" : "normal"} core ${name}: ` + diff.map((k) => `${k} ${hex(got[k])} (expected ${hex(want[k])})`).join(", "));
		}
	}
}
console.log(`${cases.length * 2} frames, ${bad ? bad + " wrong" : "all correct"}`);
process.exit(bad ? 1 : 0);
