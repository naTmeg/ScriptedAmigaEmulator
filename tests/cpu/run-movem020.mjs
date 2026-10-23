#!/usr/bin/env node
/* MOVEM Rn-list,-(An) with An in the list: the MC68000/010 store the initial An, the MC68020+
 * the initial An decremented by the operand size (M68000 PRM, MOVEM, p. 4-128). Also checks the
 * final An and the other registers. Both cores, 68000 and 68020. Exit code 1 on a difference. */
import { createCpu } from "./sae-cpu-node.mjs";

let bad = 0;
for (const [model, compatible] of [[68000, true], [68000, false], [68020, true], [68020, false]]) {
	const { ctx, ram, run } = createCpu({ model, compatible });
	ctx.SAER.gui.led = () => {};
	const regs = ctx.SAER_CPU_regs, cpu = ctx.SAER.cpu, BRK = run("SAEC_spcflag_BRK", "brk.js");
	const rd = (a, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + ram[a + i]; return v; };
	for (const size of [2, 4]) {
		/* MOVEM.x D0/D1/A2/A3,-(A2): list for -(An) is reversed, bit 15 = D0 */
		const op = size == 2 ? 0x48a2 : 0x48e2, list = 0xc000 | (1 << (15 - 10)) | (1 << (15 - 11));
		ram.set([op >> 8, op & 0xff, list >> 8, list & 0xff, 0x4e, 0x71], 0x1000);
		ram.fill(0, 0x2f00, 0x3000);
		regs.d[0] = 0x11111111; regs.d[1] = 0x22222222; regs.a[2] = 0x3000; regs.a[3] = 0x33333333;
		regs.s = true; regs.a[7] = regs.isp = 0x8000;
		cpu.setPrefetchState(0x1000, op, list); ctx.SAEV_spcflags = BRK; ctx.SAER_CPU_run_func();
		const mask = size == 2 ? 0xffff : 0xffffffff, base = 0x3000 - 4 * size;
		const want = [0x11111111, 0x22222222, model >= 68020 ? 0x3000 - size : 0x3000, 0x33333333].map((v) => (v & mask) >>> 0);
		const got = [0, 1, 2, 3].map((i) => rd(base + i * size, size));
		const tag = `${model} ${compatible ? "prefetch" : "normal"} MOVEM.${size == 2 ? "W" : "L"}`;
		if (got.some((v, i) => v !== want[i]) || regs.a[2] !== base) {
			bad++;
			console.log(`${tag}: stored ${got.map((v) => v.toString(16)).join(" ")}, A2 ${regs.a[2].toString(16)}; expected ${want.map((v) => v.toString(16)).join(" ")}, A2 ${base.toString(16)}`);
		}
	}
}
console.log(bad ? bad + " of 8 wrong" : "8 cases, all correct");
process.exit(bad ? 1 : 0);
