/* Load SAE's 68000 core into a Node vm context, without the browser.
 *
 * The emulator is written as classic browser scripts that share globals, so they are
 * evaluated in one vm context in index.htm order. Only the modules the CPU needs are loaded;
 * memory, events and the rest of the machine are replaced by small stand-ins:
 *   - a flat 16 MB address space (24-bit bus), byte array, big-endian access
 *   - events.do_cycles() is a no-op (cycle counts are not checked)
 *   - the real SAEO_M68K provides do_specialties() (trace, interrupts, STOP)
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const saeDir = path.resolve(here, "../../sae");

export function createCpu({ model = 68000, compatible = true } = {}) {
	const ram = new Uint8Array(1 << 24);
	const MASK = 0xffffff;
	const g8 = (a) => ram[a & MASK];
	const g16 = (a) => (ram[a & MASK] << 8) | ram[(a + 1) & MASK];
	const g32 = (a) => ((g16(a) << 16) | g16(a + 2)) >>> 0;
	const p8 = (a, v) => { ram[a & MASK] = v & 0xff; };
	const p16 = (a, v) => { ram[a & MASK] = (v >>> 8) & 0xff; ram[(a + 1) & MASK] = v & 0xff; };
	const p32 = (a, v) => { p16(a, v >>> 16); p16(a + 2, v & 0xffff); };
	const bank = { get8: g8, get16: g16, get32: g32, put8: p8, put16: p16, put32: p32, getInst16: g16, getInst32: g32, check: () => true, xlateaddr: (a) => a };

	const noop = () => {};
	const canvasStub = { getContext: () => null };
	const sandbox = {
		console, performance, setTimeout, clearTimeout, Math, Date,
		navigator: { userAgent: "node", platform: "node", getGamepads: () => [] },
		document: { createElement: () => canvasStub, addEventListener: noop, removeEventListener: noop, getElementById: () => null },
		AudioContext: undefined, alert: (m) => { throw new Error("alert: " + m); },
	};
	sandbox.window = sandbox;
	sandbox.requestAnimationFrame = noop;
	sandbox.cancelAnimationFrame = noop;
	sandbox.screen = { width: 800, height: 600, availWidth: 800, availHeight: 600 };
	const ctx = vm.createContext(sandbox);
	const run = (code, name) => vm.runInContext(code, ctx, { filename: name });
	/* all emulator files in index.htm order; at load time they only define constants and constructors */
	const html = fs.readFileSync(path.join(saeDir, "..", "index.htm"), "utf8");
	const files = [...html.matchAll(/src="sae\/([a-z0-9]+\.js)"/g)].map((m) => m[1]);
	for (const f of files)
		run(fs.readFileSync(path.join(saeDir, f), "utf8"), f);

	/* configuration and the parts of SAER the CPU touches */
	run(`
		SAER = { events: { do_cycles: function(){}, do_cycles_post: function(){} },
		         memory: { a3000_fakekick: function(){} },
		         custom: { intlev: function(){ return -1; } },
		         copper: { cycle: function(){} },
		         gui: { data: {} },
		         playfield: { get_vblank_hz: function(){ return 50; }, get_maxvpos: function(){ return 313; } } };
		SAER.config = new SAEO_Configuration();
		SAER.config.setDefaults();
		SAEV_config.cpu.model = ${model};
		SAEV_config.cpu.compatible = ${compatible};
		SAEV_config.cpu.speed = SAEC_Config_CPU_Speed_Original;
		SAER.m68k = new SAEO_M68K();
		SAER.cpu = new SAEO_CPU();
	`, "setup.js");
	ctx.SAER_Memory_get8 = g8; ctx.SAER_Memory_get16 = g16; ctx.SAER_Memory_get32 = g32;
	ctx.SAER_Memory_put8 = p8; ctx.SAER_Memory_put16 = p16; ctx.SAER_Memory_put32 = p32;
	ctx.SAER_Memory_getInst16 = g16; ctx.SAER_Memory_getInst32 = g32;
	ctx.SAER_Memory_banks = new Array(65536).fill(bank);
	ctx.SAER_Memory_getBank = () => bank;
	ctx.SAER_Memory_banktype = new Uint8Array(65536);
	ctx.SAER_Memory_cachable = new Uint8Array(65536);
	const err = run("SAER.cpu.setup()", "setup2.js");
	if (err) throw new Error("cpu.setup() failed: " + err);
	return { ctx, ram, run };
}
