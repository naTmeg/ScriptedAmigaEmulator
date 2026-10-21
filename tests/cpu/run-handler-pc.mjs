#!/usr/bin/env node
/* Compatible core: after an exception the handler must run from its first word, also when the
 * trapping instruction had fetched extension words (MOVEC in user mode) or jumped to an odd
 * address. Runs the exception and the first two handler instructions. Exit code 1 on a difference. */
import { createCpu } from "./sae-cpu-node.mjs";
const cases = [ /* model, name, code, user mode, vector */
	[68010, "MOVEC VBR,D0 (user)", [0x4e, 0x7a, 0x08, 0x01], true, 8],
	[68000, "BRA.S odd", [0x60, 0x01], false, 3],
	[68000, "BSR.W odd", [0x61, 0x00, 0x00, 0x03], false, 3],
	[68000, "DBRA odd", [0x51, 0xc8, 0x00, 0x03], false, 3],
	[68010, "RTD odd", [0x4e, 0x74, 0x00, 0x00], false, 3],
	[68020, "MOVEC VBR,D0 (user)", [0x4e, 0x7a, 0x08, 0x01], true, 8],
	[68020, "BRA.S odd", [0x60, 0x01], false, 3],
	[68000, "ILLEGAL", [0x4a, 0xfc], false, 4],
	[68000, "MOVE SR (user, 010 only priv)", [0x46, 0xfc, 0x27, 0x00], true, 8],
];
let bad = 0;
for (const [model, name, code, user, vec] of cases) {
	const { ctx, ram, run } = createCpu({ model, compatible: true });
	ctx.SAER.gui.led = () => {};
	const regs = ctx.SAER_CPU_regs, cpu = ctx.SAER.cpu, BRK = run("SAEC_spcflag_BRK", "b.js");
	ram.set([0, 0, 0x20, 0], vec * 4);
	ram.set([0x74, 0x07, 0x76, 0x09, 0x4e, 0x71], 0x2000); /* moveq #7,d2; moveq #9,d3 */
	ram.set([...code, 0x4e, 0x71, 0x4e, 0x71], 0x1000);
	ram.set([0, 0, 0x30, 0x01], 0x7000); /* odd return address for RTD */
	regs.s = !user; regs.a[7] = user ? 0x7000 : 0x7000; regs.usp = 0x7000; regs.isp = 0x8000; if (user) { regs.a[7] = 0x7000; } regs.vbr = 0; regs.d[0] = 0; regs.d[2] = 0; regs.d[3] = 0;
	cpu.setPrefetchState(0x1000, (code[0] << 8) | code[1], (code[2] << 8) | (code[3] | 0));
	const step = () => { ctx.SAEV_spcflags = BRK; ctx.SAER_CPU_run_func(); };
	step(); const pc1 = cpu.getPC_normal();
	step(); step();
	const ok = regs.d[2] == 7 && regs.d[3] == 9 && cpu.getPC_normal() == 0x2004;
	if (!ok) bad++;
	if (!ok || process.argv.includes("-v")) console.log((ok ? "ok    " : "WRONG ") + `${model} ${name.padEnd(30)} after exception PC $${pc1.toString(16)}; then D2=${regs.d[2]} D3=${regs.d[3]} PC $${cpu.getPC_normal().toString(16)}`);
}
console.log(`${cases.length} cases, ${bad ? bad + " wrong" : "all correct"}`);
process.exit(bad ? 1 : 0);
