#!/usr/bin/env node
/* 68010 exception frames: format $0 for CHK, DIV by zero and TRAPV; format $8 (29 words) for an
 * address error, and RTE back from it; RTE takes only the formats $0 and $8. Exit code 1 on a
 * difference. */
import { createCpu } from "./sae-cpu-node.mjs";

const { ctx, ram, run } = createCpu({ model: 68010, compatible: true });
ctx.SAER.gui.led = () => {};
const regs = ctx.SAER_CPU_regs, cpu = ctx.SAER.cpu, BRK = run("SAEC_spcflag_BRK", "brk.js");
const r16 = (a) => (ram[a] << 8) | ram[a + 1], r32 = (a) => ((r16(a) << 16) | r16(a + 2)) >>> 0;
const hex = (x) => "$" + (x >>> 0).toString(16);
const step = () => { ctx.SAEV_spcflags = BRK; ctx.SAER_CPU_run_func(); };
let bad = 0;
const check = (name, got, want) => {
	const diff = Object.keys(want).filter((k) => got[k] !== want[k]);
	if (diff.length) { bad++; console.log(`${name}: ` + diff.map((k) => `${k} ${hex(got[k])} (expected ${hex(want[k])})`).join(", ")); }
};
const setup = (code, irc) => {
	ram.fill(0, 0x7f00, 0x8000);
	ram.set([...code, 0x4e, 0x71, 0x4e, 0x71], 0x1000);
	regs.s = true; regs.a[7] = regs.isp = 0x8000; regs.vbr = 0; regs.v = true; regs.d[0] = 0xffff; regs.d[1] = 0;
	ctx.SAER.m68k.halted = 0;
	cpu.setPrefetchState(0x1000, (code[0] << 8) | code[1], irc);
};
for (const v of [3, 5, 6, 7, 14]) ram.set([0, 0, 0x20, v * 4], v * 4); /* handler for vector v at $2000 + 4v */
for (const v of [3, 5, 6, 7, 14]) ram.set([0x4e, 0x71, 0x4e, 0x71], 0x2000 + v * 4);
for (const [name, code, vec] of [["CHK.W D1,D0", [0x41, 0x81], 6], ["DIVU.W D1,D0", [0x80, 0xc1], 5], ["TRAPV", [0x4e, 0x76], 7]]) {
	setup(code, 0x4e71); step();
	const sp = regs.a[7];
	check(`68010 ${name}`, { used: 0x8000 - sp, pc: r32(sp + 2), fv: r16(sp + 6) }, { used: 8, pc: 0x1002, fv: vec * 4 });
}
/* MOVE.W D0,(A0) with A0 odd: address error, format $8 */
setup([0x30, 0x80], 0x4e71); regs.a[0] = 0x3001; step();
let sp = regs.a[7];
check("68010 address error frame", { used: 0x8000 - sp, fv: r16(sp + 6), fault: r32(sp + 10), rw: r16(sp + 8) & 0x100, now: cpu.getPC_normal() },
	{ used: 58, fv: 0x8000 | 12, fault: 0x3001, rw: 0, now: 0x200c });
/* RTE from the handler: the whole 58-byte frame goes */
ram.set([0x4e, 0x73], 0x200c);
cpu.setPrefetchState(0x200c, 0x4e73, 0x4e71); step();
check("68010 RTE from format $8", { sp: regs.a[7] }, { sp: 0x8000 });
console.log(bad ? `${bad} wrong` : "68010 frames: all correct");
process.exit(bad ? 1 : 0);
