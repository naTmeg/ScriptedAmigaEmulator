/*-------------------------------------------------------------------------
| SAE - Scripted Amiga Emulator
| https://github.com/naTmeg/ScriptedAmigaEmulator
|
| Copyright (C) 2012-2016 Rupert Hausberger
|
| This program is free software; you can redistribute it and/or
| modify it under the terms of the GNU General Public License
| as published by the Free Software Foundation; either version 2
| of the License, or (at your option) any later version.
|
| This program is distributed in the hope that it will be useful,
| but WITHOUT ANY WARRANTY; without even the implied warranty of
| MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
| GNU General Public License for more details.
|
| Note: This file does not contain any emulator-code.
-------------------------------------------------------------------------*/

var sae = null; /* SAE instance */
var cfg = null; /* Reference to the config-object */
var inf = null; /* Reference to the info-object */

var running = false; /* Is the emualtion currently running? */
var paused = false; /* Is the emualtion currently paused? */

/*-----------------------------------------------------------------------*/
/* Helpers */

function getSelect(id, asString) {
	if (typeof asString == "undefined") asString = false;
	var e = document.getElementById(id);
	for (var i = 0; i < e.length; i++) {
		if (e[i].selected)
			return asString ? e[i].value : Number(e[i].value);
	}
	return false;
}

function setSelect(id, v) {
	var e = document.getElementById(id);
	var vs = String(v);
	for (var i = 0; i < e.length; i++) {
		if (e[i].value === vs) {
			e[i].selected = true;
			return;
		}
	}
}

function styleDisplayInline(id, show) {
	var e = document.getElementById(id);
	e.style.display = show ? "inline" : "none";
}

function switchPauseResume(p) {
	var e = document.getElementById("controls_pr");
	if (p) {
		e.innerHTML = "Resume";
		e.onclick = function() { pause(false); };
	} else {
		e.innerHTML = "Pause";
		e.onclick = function() { pause(true); };
	}
}

function saee2text(err) {
	switch (err) {
		case SAEE_AlreadyRunning:				return "The emulator is already running.";
		case SAEE_NotRunning:					return "The emulator is not running.";
		case SAEE_NoTimer:						return "No timing-functions avail. Please upgrade your browser.";
		case SAEE_NoMemory:						return "Out of memory.";
		case SAEE_Internal:						return "Internal emulator error.";
		case SAEE_Config_Invalid:				return "Invalid configuration.";
		case SAEE_CPU_Internal:					return "Internal CPU-error.";
		case SAEE_CPU_Requires68020:			return "The selected kickstart-rom does require a 68020 and 32bit address-space";
		case SAEE_CPU_Requires680EC20:		return "The selected kickstart-rom does require a 68020.";
		case SAEE_CPU_Requires68030:			return "The selected kickstart-rom does require a 68030.";
		case SAEE_CPU_Requires68040:			return "The selected kickstart-rom does require a 68040/68060.";
		case SAEE_Memory_NoKickstartRom:		return "The kickstart-rom is missing.";
		case SAEE_Memory_NoExtendedRom:		return "An extended-rom is required but missing.\n\nGo to the ROM-page and select a rom from disk...";
		case SAEE_Memory_RomSize:				return "The kickstart- or extended-rom does have an invalid size.";
		case SAEE_Memory_RomKey:				return "A ROM-keyfile is required. (Cloanto)";
		case SAEE_Memory_RomDecode:			return "Invalid ROM-keyfile. (Cloanto)";
		case SAEE_Memory_RomChecksum:			return "Checksum-error at the kickstart- or extended-rom.";
		case SAEE_Memory_RomUnknown:			return "Unknown ROM.";
		case SAEE_Video_ElementNotFound:		return "Video DIV-element not found. Check 'cfg.video.id'";
		case SAEE_Video_RequiresCanvas:		return "This browser does not support 'Canvas'. Please upgrade to an actual version.";
		case SAEE_Video_RequiresWegGl:		return "This browser does not support 'WebGL'. Please upgrade to an actual version.";
		case SAEE_Video_ComphileShader:		return "Can not compile the required shader-program.";
		case SAEE_Video_LinkShader:			return "Can not link the required shader-program.";
		case SAEE_Audio_RequiresWebAudio:	return "This browser does not support 'WebAudio'. Please upgrade to an actual version.";
		default: return "("+err+")";
	}
}

function loadFile(e, callback) {
	var reader = new FileReader();
	reader.onload = callback;
	reader.readAsBinaryString(e);
}

/*---------------------------------*/
/* CRC-32 checksumming */

const crc32Table = (function() {
	var table = new Uint32Array(256);
	var n, c, k;

	for (n = 0; n < 256; n++) {
		c = n;
		for (k = 0; k < 8; k++)
			c = ((c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)) >>> 0;
		table[n] = c;
	}
	return table;
})();

function crc32(data) {
	var length = data.length;
	var offset = 0;
	var crc = 0xffffffff;

	while (length-- > 0)
		crc = crc32Table[(crc ^ data.charCodeAt(offset++)) & 0xff] ^ (crc >>> 8);

	return (crc ^ 0xffffffff) >>> 0;
}

if (crc32("The quick brown fox jumps over the lazy dog") != 0x414fa339)
	alert("CRC32-hash testing failed. SAE will not work. This is an internal bug!?");

/*-----------------------------------------------------------------------*/
/* Config */

function fixConfig() {
	/* video */
	if (cfg.video.enabled) {
		if (!inf.video.canvas && !inf.video.webGL)
			cfg.video.enabled = false;
		else if (SAEV_config.video.api == SAEC_Config_Video_API_WebGL && !inf.video.webGL)
			SAEV_config.video.api = SAEC_Config_Video_API_Canvas;
	}
	/* audio */
	if (cfg.audio.mode >= SAEC_Config_Audio_Mode_On) {
		if (!inf.audio.webAudio)
			cfg.audio.mode = SAEC_Config_Audio_Mode_Off_Emul;
	}
}

function setRomName() {
	var e = document.getElementById("cfg_rom_name");
	if (cfg.memory.rom.size) {
		e.className = "";
		e.innerHTML = cfg.memory.rom.name;
		styleDisplayInline("cfg_rom_remove", 1);
	} else {
		e.className = "red";
		e.innerHTML = "&lt;unset&gt; (required)";
		styleDisplayInline("cfg_rom_remove", 0);
		document.getElementById("cfg_rom_file").value = "";
	}
}

function setFloppyName(n) {
	var e = document.getElementById("cfg_df"+n+"_name");
	if (cfg.floppy.drive[n].file.size) {
		e.className = "";
		e.innerHTML = cfg.floppy.drive[n].file.name;
		styleDisplayInline("cfg_df"+n+"_eject", 1);
	} else {
		e.className = "gray";
		e.innerHTML = "&lt;unset&gt;";
		styleDisplayInline("cfg_df"+n+"_eject", 0);
		document.getElementById("cfg_df"+n+"_file").value = "";
	}
}

function setConfig() {
	fixConfig();
	setSelect("cfg_ntsc", cfg.chipset.ntsc ? 1 : 0);
	setRomName();
	setFloppyName(0);
	switch (cfg.video.hresolution) {
		case SAEC_Config_Video_HResolution_LoRes:
			setSelect("cfg_res", 1);
			break;
		case SAEC_Config_Video_HResolution_HiRes:
			setSelect("cfg_res", 2);
			break;
		case SAEC_Config_Video_HResolution_SuperHiRes:
			setSelect("cfg_res", 3);
			break;
	}
}

/*---------------------------------*/

function getConfig() {
	var model = SAEC_Model_A2000; /* Default model after page-load*/
	var modelSubConfig = 0; /* See config.js */

	switch (getSelect("cfg_model", true)) {
		case "A500": model = SAEC_Model_A500; break;
		case "A500P": model = SAEC_Model_A500P; break;
		case "A600": model = SAEC_Model_A600; break;
		case "A1000": model = SAEC_Model_A1000; break;
		case "A1200": model = SAEC_Model_A1200; break;
		case "A2000": model = SAEC_Model_A2000; break;
		case "A3000": model = SAEC_Model_A3000; break;
		case "A4000": model = SAEC_Model_A4000; break;
		case "A4000T": model = SAEC_Model_A4000T; break;
		/*  future. do not use. cd-emulation is not implemented yet.
		case "CDTV": model = SAEC_Model_CDTV; break;
		case "CD32": model = SAEC_Model_CD32; break; */
	}
	/* Set the defaults for the selected model.
		ROMs and Floppies are not affected. */
	sae.setModel(model, modelSubConfig);

	/* After here, you may tweak additional settings */

	cfg.chipset.ntsc = getSelect("cfg_ntsc") == 1;

	cfg.memory.z2FastSize = 2 << 20; /* Give 2mb zorro2 fast-ram */

	/* Do we have rom-data? */
	if (cfg.memory.rom.size == 0) {
		alert(saee2text(SAEE_Memory_NoKickstartRom));
		return false;
	}

	cfg.floppy.speed = SAEC_Config_Floppy_Speed_Turbo; /* Set speed to turbo. This is not always compatible */

	cfg.video.id = "myVideo"; /* Set the id-name of the desired output-div or output-canvas */

	switch (getSelect("cfg_res")) {
		case 1: /* Lores */
			cfg.video.hresolution = SAEC_Config_Video_HResolution_LoRes;
			cfg.video.vresolution = SAEC_Config_Video_VResolution_NonDouble;
			cfg.video.size_win.width = SAEC_Video_DEF_AMIGA_WIDTH; /* 360 */
			cfg.video.size_win.height = SAEC_Video_DEF_AMIGA_HEIGHT; /* 284 */
			break;
		case 2: /* Hires */
			cfg.video.hresolution = SAEC_Config_Video_HResolution_HiRes;
			cfg.video.vresolution = SAEC_Config_Video_VResolution_Double;
			cfg.video.size_win.width = SAEC_Video_DEF_AMIGA_WIDTH << 1; /* 720 */
			cfg.video.size_win.height = SAEC_Video_DEF_AMIGA_HEIGHT << 1; /* 568 */
			break;
		case 3: /* SuperHires */
			cfg.video.hresolution = SAEC_Config_Video_HResolution_SuperHiRes;
			cfg.video.vresolution = SAEC_Config_Video_VResolution_Double;
			cfg.video.size_win.width = SAEC_Video_DEF_AMIGA_WIDTH << 2; /* 1440 */
			cfg.video.size_win.height = SAEC_Video_DEF_AMIGA_HEIGHT << 1; /* 568 */
			break;
	}

	/* Set hooks */
	cfg.hook.log.error = hook_log_error;

	cfg.hook.event.started = hook_event_started;
	cfg.hook.event.stopped = hook_event_stopped;
	cfg.hook.event.reseted = hook_event_reseted;
	cfg.hook.event.paused = hook_event_paused;

	cfg.hook.led.power = hook_led_power;
	cfg.hook.led.hd = hook_led_hd;
	cfg.hook.led.df = hook_led_df;
	cfg.hook.led.fps = hook_led_fps;
	cfg.hook.led.cpu = hook_led_cpu;

	/* Enable debug-log to developer-console */
	cfg.debug.level = SAEC_Config_Debug_Level_Log;

	/* NOTE:
		DO NOT ALTER the config-object while the emulator is running.

		I will release a detailed description of the config-object soon.
	*/
	return true;
}

/*---------------------------------*/
/* Control buttons */

function start() {
	if (getConfig()) {
		/* Start the emulator. This does take some time.
		Once started, the hook SAEV_config.hook.event.started will be called. (new 0.9.1) */
		var err = sae.start();
		if (err == SAEE_None) {
			/* ... */
		} else
			alert(saee2text(err));
	}
}

function stop() {
	/* Send stop-request. This does take some time.
	Once stopped, the hook SAEV_config.hook.event.stopped will be called. (new 0.9.1) */
	var err = sae.stop();
	if (err == SAEE_None) {
		/* ... */
	} else
		alert(saee2text(err));
}

function reset() {
	/* Send soft-reset request. This does take some time.
	Once done, the hook SAEV_config.hook.event.reseted will be called. (new 0.9.1) */
	var hard = false, keyboard = false;
	var err = sae.reset(hard, keyboard);
	if (err == SAEE_None) {
		/* ... */
	} else
		alert(saee2text(err));
}

function pause(p) {
	/* Send Pause- or Resume-request. This does take some time.
	Once paused or resumed, the hook SAEV_config.hook.event.paused will be called. (new 0.9.1)
	true == pause, false == resume */
	var err = sae.pause(p);
	if (err == SAEE_None) {
		/* ... */
	} else
		alert(saee2text(err));
}

function romSelect() {
	var e = document.getElementById("cfg_rom_file").files[0];
	if (e) {
		loadFile(e, function (event) {
			//cfg.memory.rom.path = e.path; currently unused in SAE
			cfg.memory.rom.name = e.name; /* filename */
			cfg.memory.rom.data = event.target.result; /* typeof 'String' or 'Uint8Array' */
			cfg.memory.rom.size = e.size; /* size in bytes */
			cfg.memory.rom.crc32 = crc32(event.target.result); /* pre-calculate crc32 for a faster start */
			setRomName();

			/*ri = new SAEO_RomInfo();
			var err = sae.getRomInfo(ri, cfg.memory.rom);
			if (err == SAEE_None) {
				examine 'ri'...
			}*/
		});
	}
}
function romRemove() {
	cfg.memory.rom.clr();
	setRomName();
}

function floppyInsert(n) {
	var e = document.getElementById("cfg_df"+n+"_file").files[0];
	if (e) {
		loadFile(e, function(event) {
			var file = cfg.floppy.drive[n].file;
			//file.path = e.path; currently unused in SAE
			file.name = e.name; /* filename */
			file.data = event.target.result; /* typeof 'String' or 'Uint8Array' */
			file.size = e.size; /* size in bytes */
			file.crc32 = crc32(event.target.result); /* pre-calculate crc32 for a faster start */
			setFloppyName(n);

			/*var di = new SAEO_DiskInfo();
			var err = sae.getDiskInfo(di, n);
			if (err == SAEE_None) {
				examine 'di'...
			}*/

			/* If the emulator is running, notify about the disk-change */
			if (running)
				sae.insert(n);
		});
	}
}
function floppyEject(n) {
	cfg.floppy.drive[n].file.clr();
	setFloppyName(n);

	/* If the emulator is running, notify about the disk-change */
	if (running)
		sae.eject(n);
}

/*---------------------------------*/
/* Init-routine, called once on page-load */

function init() {
	/* Create the emulator */
	sae = new ScriptedAmigaEmulator();

	/* Get the reference to the info-object.
		As alternative, you can use the constant 'SAEC_info' directly,
		defined in amiga.js */
	inf = sae.getInfo(); /* or */
	//inf = SAEC_info;
	//console.dir(inf);

	/* Get the reference to the config-object.
		As alternative, you can use the variable 'SAEV_config' directly,
		defined in config.js */
	cfg = sae.getConfig(); /* or */
	//cfg = SAEV_config;
	//console.dir(cfg);

	initLEDs();
	setConfig();
}

/*-----------------------------------------------------------------------*/
/* Hooks (callbacks) */

/*---------------------------------*/
/* Logging */

/* There is currently only one log-hook, if a fatal error
	does occure while the emulator is running. */

function hook_log_error(err, msg) {
	/* err is a number type. See SAEE_* for the error code. */
	running = false;
	if (msg.length)
		alert(msg);
}

/*---------------------------------*/
/* Events (new 0.9.1) */

/* Get call after the emulator has finished the starting-process. */
function hook_event_started() {
	running = true;
}

/* Get call after the emulator has finished the stopping-process. */
function hook_event_stopped() {
	running = false;

	if (paused) {
		paused = false;
		switchPauseResume(paused);
	}
	resetLEDs();
}

/* Get call after the emulator has finished the reset-routine. */
function hook_event_reseted(hard) {
	if (paused) {
		paused = false;
		switchPauseResume(paused);
	}
}

/* Get call after the emulator has finished switching between pause-resume. */
function hook_event_paused(p) {
	paused = p;
	switchPauseResume(p);
}

/*---------------------------------*/
/* LEDs */

const COL_GRAY = "#000";
const COL_GREEN = "#8C8";
const COL_RED = "#E88";
const COL_ORANGE = "#CC8";

/* cache elements */
var e_led_power = null;
var e_led_hd = null;
var e_led_df = [null,null,null,null];
var e_led_fps = null;
var e_led_cpu = null;

/* Power LED: boolean On/Off */
function hook_led_power(on) {
	e_led_power.style.color = on ? COL_GREEN : COL_GRAY;
}

/* Harddisk-LED */
function hook_led_hd(rw) {
	/* rw 0=Off, 1=Read, 2=Write */
	e_led_hd.style.color = rw == 1 ? COL_GREEN : (rw == 2 ? COL_RED : COL_GRAY);
}

/* Floppy-LED */
function hook_led_df(unit, disabled, cylinder, side, rw) {
	/* unit 0-3 */
	/* cylinder 0-81 */
	/* side 0-1 */
	/* rw 0=Off, 1=Read, 2=Write */
	if (disabled) {
		e_led_df[unit].innerHTML = "-";
		e_led_df[unit].style.color = COL_GRAY;
	} else {
		e_led_df[unit].innerHTML = String(cylinder);
		e_led_df[unit].style.color = rw == 1 ? COL_GREEN : (rw == 2 ? COL_RED : COL_GRAY);
	}
}

/* FPS (Frames Per Second) */
function hook_led_fps(fps, paused) {
	/* fps is a float-number, 0-50, in frames */
	e_led_fps.innerHTML = paused ? "0.0" : fps.toFixed(1);
	e_led_fps.style.color = COL_GRAY;
}

/* CPU-usage */
function hook_led_cpu(usage, paused) {
	/* usage is a float-number, 0-1000, in percent */
	if (paused) {
		e_led_cpu.innerHTML = "0&#37;";
		e_led_cpu.style.color = COL_GRAY;
	} else {
		e_led_cpu.innerHTML = usage.toFixed(0) + "&#37;";
		if (usage < 90)
			e_led_cpu.style.color = COL_GREEN;
		else if (usage < 110)
			e_led_cpu.style.color = COL_ORANGE;
		else
			e_led_cpu.style.color = COL_RED;
	}
}

function resetLEDs() {
	hook_led_power(false);
	hook_led_hd(0);
	hook_led_df(0, true, 0, 0, 0);
	hook_led_df(1, true, 0, 0, 0);
	hook_led_df(2, true, 0, 0, 0);
	hook_led_df(3, true, 0, 0, 0);
	hook_led_fps(0, false);
	hook_led_cpu(0, false);
}

function initLEDs() {
	e_led_power = document.getElementById("status_led_power");
	e_led_hd = document.getElementById("status_led_hd");
	e_led_df[0] = document.getElementById("status_led_df0");
	e_led_df[1] = document.getElementById("status_led_df1");
	e_led_df[2] = document.getElementById("status_led_df2");
	e_led_df[3] = document.getElementById("status_led_df3");
	e_led_fps = document.getElementById("status_led_fps");
	e_led_cpu = document.getElementById("status_led_cpu");

	resetLEDs();
}
