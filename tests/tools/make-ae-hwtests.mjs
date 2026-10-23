#!/usr/bin/env node
/* Build test disks for a real A500 that settle the address-error questions where SAE,
 * WinUAE and the SingleStepTests corpus disagree (see tests/README.md).
 *
 * Each disk is vAmigaTS CPU/Exceptions/StackFrame/addrerr2 with the instruction under test
 * replaced: A2 holds the odd address $41424647, then the 4-byte instruction below runs.
 * The program then shows the stack pointer, the stack size and the 14-byte group-0 frame
 * (SSW, access address, IR, SR, PC). The background stays red because the expected values
 * in the program are those of the original test; only the numbers matter.
 *
 *   node tests/tools/make-ae-hwtests.mjs        writes tests/.cache/hwtests/SAE-AE*.adf
 * Needs npm run fetch:vamigats first. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../.cache/vAmigaTS/CPU/Exceptions/StackFrame/addrerr2/addrerr2.adf");
const outDir = path.resolve(here, "../.cache/hwtests");

export const TESTS = [
	{ name: "SAE-AE1", code: [0x4252, 0x4E71], asm: "clr.w (a2) ; nop",            question: "R/W bit of the SSW: does CLR read before it writes?" },
	{ name: "SAE-AE2", code: [0x40D2, 0x4E71], asm: "move sr,(a2) ; nop",          question: "R/W bit of the SSW for MOVE from SR (dummy read first?)" },
	{ name: "SAE-AE3", code: [0x34BC, 0x8000], asm: "move.w #$8000,(a2)",          question: "SR in the frame: is N already set from the moved value?" },
	{ name: "SAE-AE4", code: [0x2500, 0x4E71], asm: "move.l d0,-(a2) ; nop",       question: "IR word for a long MOVE to -(An): this opcode ($2500) or the next ($4E71)?" },
	{ name: "SAE-AE5", code: [0xD58A, 0x4E71], asm: "addx.l -(a2),-(a2) ; nop",    question: "access address: first access at A2-2 ($41424645) or A2-4 ($41424643)?" },
	{ name: "SAE-AE6", code: [0x4ED2, 0x4E71], asm: "jmp (a2) ; nop",              question: "stacked PC and I/N bit for a jump to an odd address" },
	{ name: "SAE-AE7", code: [0x6101, 0x4E71], asm: "bsr.s *+3 ; nop",             question: "stack size 14 or 18 (return address pushed first?), stacked PC, I/N bit" },
	{ name: "SAE-AE8", code: [0x322A, 0x0010], asm: "move.w $10(a2),d1",           question: "stacked PC for a read with (d16,An)" },
];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	if (!fs.existsSync(src)) { console.error("missing " + src + ", run: npm run fetch:vamigats"); process.exit(1); }
	const base = fs.readFileSync(src);
	const at = base.indexOf(Buffer.from("247C4142464734BC0068", "hex"));
	const title = base.indexOf(Buffer.from("ADDRERR2\0"));
	if (at < 0 || title < 0) { console.error("addrerr2.adf does not have the expected layout"); process.exit(1); }
	fs.mkdirSync(outDir, { recursive: true });
	for (const t of TESTS) {
		const adf = Buffer.from(base);
		t.code.forEach((w, i) => adf.writeUInt16BE(w, at + 6 + 2 * i));
		adf.write(t.name.padEnd(8, " ").slice(0, 8) + "\0", title, "latin1");
		fs.writeFileSync(path.join(outDir, t.name + ".adf"), adf);
		console.log(t.name + ".adf  " + t.asm.padEnd(26) + t.question);
	}
}
