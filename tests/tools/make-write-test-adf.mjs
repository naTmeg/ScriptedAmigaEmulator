#!/usr/bin/env node
/* Build tests/.cache/write-test.adf: a bootable DD disk whose boot block writes 512 bytes
 * ("SAE-WRITE-TEST" repeated) to sector 2 through trackdisk.device and then waits forever.
 * Used to check that writes reach the disk image (sae.getDisk / Save button).
 * The 68000 code is assembled by hand; every line lists mnemonic and encoding. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const W = (...w) => w.flatMap((x) => [(x >> 8) & 0xff, x & 0xff]);
const code = [
	...W(0x2449),                         // movea.l a1,a2          ; IOStdReq from the boot code
	...W(0x41FA, 0x0000),                 // lea     data(pc),a0    ; displacement patched below
	...W(0x357C, 0x0003, 0x001C),         // move.w  #CMD_WRITE,IO_COMMAND(a2)
	...W(0x257C, 0x0000, 0x0200, 0x0024), // move.l  #512,IO_LENGTH(a2)
	...W(0x2548, 0x0028),                 // move.l  a0,IO_DATA(a2)
	...W(0x257C, 0x0000, 0x0400, 0x002C), // move.l  #1024,IO_OFFSET(a2) ; sector 2
	...W(0x224A),                         // movea.l a2,a1
	...W(0x4EAE, 0xFE38),                 // jsr     _LVODoIO(a6)
	...W(0x357C, 0x0004, 0x001C),         // move.w  #CMD_UPDATE,IO_COMMAND(a2)
	...W(0x224A),                         // movea.l a2,a1
	...W(0x4EAE, 0xFE38),                 // jsr     _LVODoIO(a6)
	...W(0x357C, 0x0009, 0x001C),         // move.w  #TD_MOTOR,IO_COMMAND(a2)
	...W(0x42AA, 0x0024),                 // clr.l   IO_LENGTH(a2)  ; motor off
	...W(0x224A),                         // movea.l a2,a1
	...W(0x4EAE, 0xFE38),                 // jsr     _LVODoIO(a6)
	...W(0x60FE),                         // bra.s   *              ; done, wait
];
const boot = new Uint8Array(1024);
boot.set([0x44, 0x4F, 0x53, 0x00]);       // "DOS\0"
boot.set([0, 0, 0x03, 0x70], 8);          // root block 880
boot.set(code, 12);
const DATA = 512;                          // data lives in the second half of the boot block
const leaExt = 12 + 2 + 2;                 // offset of the lea extension word
const disp = DATA - leaExt;                // (d16,PC): relative to the extension word
boot[leaExt] = (disp >> 8) & 0xff; boot[leaExt + 1] = disp & 0xff;
const pattern = Buffer.from("SAE-WRITE-TEST");
for (let i = 0; i < 512; i++) boot[DATA + i] = pattern[i % pattern.length];
/* boot block checksum: add with carry over all longs, store the inverse at offset 4 */
let sum = 0;
for (let i = 0; i < 1024; i += 4) {
	sum += ((boot[i] << 24) | (boot[i + 1] << 16) | (boot[i + 2] << 8) | boot[i + 3]) >>> 0;
	if (sum > 0xffffffff) sum = (sum + 1) >>> 0; else sum >>>= 0;
}
const chk = (~sum) >>> 0;
boot.set([chk >>> 24, (chk >> 16) & 0xff, (chk >> 8) & 0xff, chk & 0xff], 4);

const adf = new Uint8Array(901120);
adf.set(boot);
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../.cache/write-test.adf");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, adf);
console.log("written " + path.relative(process.cwd(), out) + ", code " + code.length + " bytes, checksum " + chk.toString(16));
