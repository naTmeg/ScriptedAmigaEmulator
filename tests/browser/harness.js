/* SAE test harness: boots a disk image on an Amiga model with the AROS ROM or a
   Kickstart of your own.

   run.htm?adf=<path relative to this page>   disk image for DF0 (adf, dms, exe); omit to boot the ROM only
          &df1=<path>                         optional second disk in DF1
          &model=A500|A500P|A600|A1200        default A500
          &rom=<path>                         Kickstart ROM instead of AROS, e.g. ../roms/kick13.rom
          &ext=<path>                         extended ROM to go with &rom= (e.g. a newer AROS build)
          &fast=0                             no Zorro-II fast ram (some old games dislike it)
          &chip=512&slow=512                  chip and slow ram in KB (vAmigaTS: 512 chip, 0 slow)
          &compat=1                           cpu.compatible (prefetch core)
          &col=1                              sprite/playfield collision detection (Deluxe Galaga)
   swapDisk(path[, unit]) changes the disk at runtime.
          &speed=orig|turbo                   floppy speed, default orig
          &fakepad=1                          synthetic gamepad on port 1 (see below)
          &turbo=1                            no frame pacing (cfg.debug.turbo), runs as fast as possible
          &det=1[&seed=n]                     seeded Math.random/decimalRandom and fixed Date (determinism.js)
          &stopframe=N                        pause after emulated frame N, harnessState.phase becomes "stopped"
   harnessFrames() returns the number of emulated frames so far (SAEV_Events_vsync_counter).

   Exposes window.sae, window.cfg, window.harnessState, redRuns() for automation. */
var sae = null, cfg = null;
var harnessState = { phase: "init", error: null, frames: 0 };

function log(s) { document.getElementById("log").textContent += s + "\n"; console.log("[harness] " + s); }

function fetchBinary(url, cb) {
	var x = new XMLHttpRequest();
	x.open("GET", url);
	x.overrideMimeType("text/plain; charset=x-user-defined"); /* binary string, same as index.js */
	x.onload = function() {
		if (x.status != 200) { harnessState.error = "HTTP " + x.status + " for " + url; log(harnessState.error); return; }
		cb(x.responseText);
	};
	x.onerror = function() { harnessState.error = "network error for " + url; log(harnessState.error); };
	x.send();
}

/* CRC-32 over a binary string, same algorithm as index.js (SAE identifies ROMs by it) */
var crc32Table = (function() {
	var t = new Uint32Array(256);
	for (var n = 0; n < 256; n++) {
		var c = n;
		for (var k = 0; k < 8; k++) c = ((c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)) >>> 0;
		t[n] = c;
	}
	return t;
})();
function crc32(data) {
	var crc = 0xffffffff;
	for (var i = 0; i < data.length; i++)
		crc = (crc >>> 8) ^ crc32Table[(crc ^ data.charCodeAt(i)) & 0xff];
	return (crc ^ 0xffffffff) >>> 0;
}

function setFile(dst, name, data, crc) {
	dst.clr();
	dst.name = name;
	dst.data = data;
	dst.size = data.length;
	dst.crc32 = (typeof crc == "undefined") ? false : crc;
}

function param(n, d) { var m = new RegExp("[?&]" + n + "=([^&]*)").exec(location.search); return m ? decodeURIComponent(m[1]) : d; }
function basename(p) { return p.split("/").pop(); }

function init() {
	var adf = param("adf", "");
	var df1 = param("df1", "");
	var rom = param("rom", "");
	var model = param("model", "A500");

	sae = new ScriptedAmigaEmulator();
	cfg = sae.getConfig();
	var modelId = { A500: SAEC_Model_A500, A500P: SAEC_Model_A500P, A600: SAEC_Model_A600, A1200: SAEC_Model_A1200 }[model];
	sae.setModel(modelId, 0);
	var fastMB = param("fast", "1"); /* 0: none, 1: 4 MB (AROS likes some), n: n MB (up to 8) */
	cfg.memory.z2FastSize = fastMB == "0" ? 0 : (fastMB == "1" ? 4 : +fastMB) << 20;
	if (param("compat", "") == "1") cfg.cpu.compatible = true; /* prefetch core with address errors etc. */
	if (param("turbo", "") == "1") cfg.debug.turbo = true;     /* frames back to back, no host clock */
	if (param("video", "") == "canvas") cfg.video.api = SAEC_Config_Video_API_Canvas; /* 2D canvas instead of WebGL */
	if (param("col", "") == "1") cfg.chipset.colLevel = SAEC_Config_Chipset_ColLevel_Sprite_Playfield; /* hardware collisions */
	if (param("chip", "")) cfg.memory.chipSize = (+param("chip", "512")) << 10; /* KB */
	if (param("slow", "")) cfg.memory.bogoSize = (+param("slow", "0")) << 10;  /* KB, $C00000 */
	cfg.video.id = "myVideo";
	cfg.video.cursor = SAEC_Config_Video_Cursor_Show; /* no pointer-lock, the canvas can be clicked and screenshotted freely */
	cfg.video.pauseInBackground = false; /* tests often run in background tabs */
	/* collect everything the Amiga sends to the serial port (cputester output via SER:) */
	window.harnessSerial = "";
	cfg.hook.serial.put = function(c) { window.harnessSerial += String.fromCharCode(c & 0xff); };
	cfg.audio.mode = param("audio", "") == "1" ? SAEC_Config_Audio_Mode_On : SAEC_Config_Audio_Mode_Off; /* ?audio=1: sound on */
	cfg.floppy.speed = param("speed", "orig") == "turbo" ? SAEC_Config_Floppy_Speed_Turbo : SAEC_Config_Floppy_Speed_Original;
	cfg.floppy.drive[0].type = SAEC_Config_Floppy_Type_35_DD;
	cfg.floppy.drive[1].type = df1 ? SAEC_Config_Floppy_Type_35_DD : SAEC_Config_Floppy_Type_None;
	cfg.floppy.drive[2].type = cfg.floppy.drive[3].type = SAEC_Config_Floppy_Type_None;

	/* ?fakepad=1: replace the Gamepad API with a synthetic standard-mapping pad on
	   index 0 (window.fakePad) and put it on port 1, to test the polling code. */
	if (param("fakepad", "") == "1") {
		window.fakePad = { id: "fake standard pad", index: 0, connected: true, mapping: "standard",
			axes: [0, 0, 0, 0], buttons: [] };
		for (var b = 0; b < 17; b++) window.fakePad.buttons.push({ pressed: false, value: 0 });
		window.fakePadPresent = true;
		navigator.getGamepads = function() { return [window.fakePadPresent ? window.fakePad : null]; };
		cfg.ports[1].type = SAEC_Config_Ports_Type_Joy;
		cfg.ports[1].device = 0;
		log("fake gamepad installed on port 1");
	}

	harnessState.phase = "loading";

	var start = function() {
		var err = sae.start();
		if (err != SAEE_None) { harnessState.error = "start() failed: " + err; log(harnessState.error); return; }
		harnessState.phase = "running";
		/* ?stopframe=N: pause right after emulated frame N, so the picture is exactly that frame
		   (the run loop checks the pause command at the next vsync) */
		var stopFrame = +param("stopframe", "0");
		if (stopFrame > 0) {
			/* only the last frames matter: skip the canvas upload before that. In headless
			   Chromium all pages share one software-rendering GPU process, which otherwise
			   limits how many tests can run in parallel */
			var show = SAER.video.show_screen;
			SAER.video.show_screen = function() {
				if (harnessFrames() >= stopFrame - 2) return show.apply(this, arguments);
			};
			var fw = SAER.events.framewait;
			SAER.events.framewait = function() {
				var r = fw.apply(this, arguments);
				if (harnessState.phase == "running" && harnessFrames() >= stopFrame) {
					sae.pause(true);
					harnessState.phase = "stopped";
				}
				return r;
			};
		}
		log("running: " + (adf || "(no disk)") + (df1 ? " + DF1 " + df1 : "") + " on " + model + " with " + cfg.memory.rom.name);
	};
	var loadDisks = function() {
		if (!adf) return start();
		fetchBinary(adf, function(disk) {
			setFile(cfg.floppy.drive[0].file, basename(adf), disk);
			if (!df1) return start();
			fetchBinary(df1, function(disk1) {
				setFile(cfg.floppy.drive[1].file, basename(df1), disk1);
				start();
			});
		});
	};
	if (rom) {
		/* a Kickstart of your own: SAE identifies it by CRC32; &ext= adds an extended ROM
		   (another AROS build needs both) */
		fetchBinary(rom, function(data) {
			setFile(cfg.memory.rom, basename(rom), data, crc32(data));
			cfg.memory.extRom.clr();
			log("kickstart " + basename(rom) + " " + data.length + " bytes crc " + crc32(data).toString(16));
			var ext = param("ext", "");
			if (!ext)
				return loadDisks();
			fetchBinary(ext, function(edata) {
				setFile(cfg.memory.extRom, basename(ext), edata, crc32(edata));
				log("extended rom " + basename(ext) + " " + edata.length + " bytes crc " + crc32(edata).toString(16));
				loadDisks();
			});
		});
	} else {
		fetchBinary("../../db/aros-amiga-m68k-rom.bin", function(data) {
			setFile(cfg.memory.rom, "aros-amiga-m68k-rom.bin", data, 0x3F4FCC0A);
			fetchBinary("../../db/aros-amiga-m68k-ext.bin", function(ext) {
				setFile(cfg.memory.extRom, "aros-amiga-m68k-ext.bin", ext, 0xF2E52B07);
				loadDisks();
			});
		});
	}
}
window.addEventListener("load", init);

function harnessFrames() { return typeof SAEV_Events_vsync_counter == "number" ? SAEV_Events_vsync_counter : 0; }

/* Swap the disk in DF0 at runtime (manual disk change): swapDisk("../images/Hoi (Disk 2).adf") */
function swapDisk(path, unit) {
	unit = unit || 0;
	return new Promise(function(resolve) {
		fetchBinary(path, function(data) {
			sae.eject(unit);
			setFile(cfg.floppy.drive[unit].file, basename(path), data);
			var err = sae.insert(unit);
			log("swapDisk DF" + unit + " <- " + basename(path) + " (" + data.length + " bytes) err=" + err);
			resolve(err);
		});
	});
}

/* Count horizontal runs of pure-red pixels per canvas row (COLOR00 = $F00 marks
   the IRQ handler in the vAmigaTS timer tests). Returns {row: [[x, width], ...]}.
   maxRow limits the scan to the top of the screen (below is the test image). */
function redRuns(maxRow) {
	var cv = document.querySelector("#myVideo canvas");
	if (!cv) return "no canvas";
	var c2 = document.createElement("canvas"); c2.width = cv.width; c2.height = cv.height;
	var ctx = c2.getContext("2d"); ctx.drawImage(cv, 0, 0);
	var h = Math.min(c2.height, maxRow || c2.height);
	var d = ctx.getImageData(0, 0, c2.width, h).data;
	var rows = {};
	for (var y = 0; y < h; y++) {
		var runs = [], inRun = false, start = 0;
		for (var x = 0; x < c2.width; x++) {
			var i = (y * c2.width + x) * 4;
			var red = d[i] > 180 && d[i + 1] < 90 && d[i + 2] < 90;
			if (red && !inRun) { inRun = true; start = x; }
			if (!red && inRun) { inRun = false; runs.push([start, x - start]); }
		}
		if (inRun) runs.push([start, c2.width - start]);
		if (runs.length) rows[y] = runs;
	}
	return rows;
}

/* --- Amiga mouse helpers (AROS/Kickstart with intuition.library) ------------------------
   amigaPointer()        current pointer position from IntuitionBase (MouseX/MouseY)
   amigaMoveTo(x, y)     move the pointer there by feeding relative motion, self-calibrating
   amigaClick([button])  press and release a mouse button (0 = left, 2 = right) */
function intuitionBase() {
	var g = SAER_Memory_get8;
	var w = function(a) { return (g(a) << 8) | g(a + 1); };
	var l = function(a) { return ((w(a) << 16) | w(a + 2)) >>> 0; };
	var rs = function(a) { var s = ""; for (var i = 0; i < 40; i++) { var c = g(a + i); if (!c) break; s += String.fromCharCode(c); } return s; };
	var node = l(l(4) + 0x17a);
	for (var i = 0; i < 80 && node; i++) { if (rs(l(node + 10)) == "intuition.library") return node; node = l(node); }
	return 0;
}
function amigaPointer() {
	var ib = intuitionBase(); if (!ib) return null;
	var g = SAER_Memory_get8, w = function(a) { return ((g(a) << 8) | g(a + 1)) << 16 >> 16; };
	return [w(ib + 0x46), w(ib + 0x44)];
}
async function amigaMoveTo(tx, ty) {
	/* small, slow relative steps: AROS applies mouse acceleration to large deltas */
	var sleep = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };
	var cv = document.querySelector("#myVideo canvas"), rc = cv.getBoundingClientRect();
	var mv = function(x, y) { cv.dispatchEvent(new MouseEvent("mousemove", { clientX: rc.left + x, clientY: rc.top + y, bubbles: true })); };
	var p = amigaPointer();
	if (!p) return { error: "intuition.library not found" };
	var cx = 300, cy = 300;
	mv(cx, cy); await sleep(40);
	for (var it = 0; it < 200; it++) {
		p = amigaPointer();
		var dx = tx - p[0], dy = ty - p[1];
		if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) break;
		var sx = Math.max(-3, Math.min(3, dx)), sy = Math.max(-3, Math.min(3, dy));
		cx += sx; cy += sy; mv(cx, cy);
		await sleep(40);
	}
	return { pointer: amigaPointer(), steps: it };
}
async function amigaClick(button) {
	var cv = document.querySelector("#myVideo canvas");
	cv.dispatchEvent(new MouseEvent("mousedown", { button: button || 0, bubbles: true }));
	await new Promise(function(r) { setTimeout(r, 200); });
	cv.dispatchEvent(new MouseEvent("mouseup", { button: button || 0, bubbles: true }));
	return "clicked";
}
