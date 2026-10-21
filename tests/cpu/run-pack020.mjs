#!/usr/bin/env node
/* 68020 PACK/UNPK, register and -(Ax),-(Ay) forms, both cores, random operands and adjustments
 * against the MC68020 manual: PACK adds the adjustment to the 16-bit source and packs bits
 * 11-8 and 3-0 into a byte; UNPK spreads the nibbles of a byte to bits 11-8 and 3-0 and adds the
 * adjustment. In memory the word is big-endian, read or written from the higher address down.
 * Exit code 1 on any difference. */
import { createCpu } from "./sae-cpu-node.mjs";

const N = 4000;
let failed = 0;
for (const compatible of [true, false]) {
	const { ctx, ram, run } = createCpu({ model: 68020, compatible });
	ctx.SAER.gui.led = () => {};
	const regs = ctx.SAER_CPU_regs, cpu = ctx.SAER.cpu, BRK = run("SAEC_spcflag_BRK", "brk.js");
	let seed = 7;
	const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed >>> 8; };
	const hex = (x, n) => "$" + (x >>> 0).toString(16).padStart(n, "0");
	let bad = 0;
	const fail = (s) => { if (bad++ < 5) console.log(`  ${compatible ? "prefetch" : "normal"} core: ${s}`); };
	for (let t = 0; t < N; t++) {
		const unpk = (t & 1) != 0, mem = (t & 2) != 0;
		const adj = rnd() & 0xffff, src = rnd() & 0xffff, dst = rnd() >>> 0;
		/* PACK: 1000 yyy1 0100 mxxx, UNPK: 1000 yyy1 1000 mxxx; Rx = 1, Ry = 2 */
		const op = 0x8000 | (2 << 9) | (unpk ? 0x180 : 0x140) | (mem ? 8 : 0) | 1;
		ram.set([op >> 8, op & 0xff, adj >> 8, adj & 0xff, 0x4e, 0x71], 0x1000);
		ram.fill(0, 0x3000, 0x3010); ram.fill(0, 0x4000, 0x4010);
		regs.d[1] = 0x55550000 | src; regs.d[2] = dst;
		regs.a[1] = 0x3008; regs.a[2] = 0x4008;
		if (mem) { if (unpk) ram[0x3007] = src & 0xff; else { ram[0x3006] = src >> 8; ram[0x3007] = src & 0xff; } }
		regs.s = true; regs.a[7] = regs.isp = 0x8000;
		ctx.SAER.m68k.halted = 0;
		cpu.setPrefetchState(0x1000, op, adj);
		ctx.SAEV_spcflags = BRK;
		ctx.SAER_CPU_run_func();
		const name = `${unpk ? "UNPK" : "PACK"} ${mem ? "-(A1),-(A2)" : "D1,D2"},#${hex(adj, 4)} src ${hex(unpk ? src & 0xff : src, unpk ? 2 : 4)}`;
		if (!unpk) {
			const s = (src + adj) & 0xffff, want = ((s >> 4) & 0xf0) | (s & 0xf);
			if (mem) {
				if (ram[0x4007] !== want || regs.a[1] !== 0x3006 || regs.a[2] !== 0x4007) fail(`${name}: ${hex(ram[0x4007], 2)} A1 ${hex(regs.a[1], 4)} A2 ${hex(regs.a[2], 4)}, expected ${hex(want, 2)}`);
			} else if ((regs.d[2] >>> 0) !== (((dst & 0xffffff00) | want) >>> 0)) fail(`${name}: D2 ${hex(regs.d[2], 8)}, expected low byte ${hex(want, 2)}`);
		} else {
			const b = src & 0xff, want = ((((b << 4) & 0xf00) | (b & 0xf)) + adj) & 0xffff;
			if (mem) {
				const got = (ram[0x4006] << 8) | ram[0x4007];
				if (got !== want || regs.a[1] !== 0x3007 || regs.a[2] !== 0x4006) fail(`${name}: ${hex(got, 4)} A1 ${hex(regs.a[1], 4)} A2 ${hex(regs.a[2], 4)}, expected ${hex(want, 4)}`);
			} else if ((regs.d[2] >>> 0) !== (((dst & 0xffff0000) | want) >>> 0)) fail(`${name}: D2 ${hex(regs.d[2], 8)}, expected low word ${hex(want, 4)}`);
		}
	}
	console.log(`${compatible ? "prefetch" : "normal  "} core: ${N} cases, ${bad ? bad + " differences" : "no differences"}`);
	if (bad) failed++;
}
process.exit(failed ? 1 : 0);
