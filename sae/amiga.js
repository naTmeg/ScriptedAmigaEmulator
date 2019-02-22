/*-------------------------------------------------------------------------
| SAE - Scripted Amiga Emulator
| https://github.com/naTmeg/ScriptedAmigaEmulator
|
| Copyright (C) 2012 Rupert Hausberger
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
| Notes on the global-namespace
| -----------------------------
| Global object:
| function SAEO_<name>() {}
|
| Global error constant:
| const SAEE_<object_name>_<name>;
|
| Global constant:
| const SAEC_<object_name>_<name>;
|
| Global variable:
| var SAEV_<object_name>_<name>;
|
| Global function:
| function SAEF_<object_name>_<name>() {}
|
| Global reference (pointer) to another object:
| var SAER_<object_name>_<name>;
|
|
| Tags that may appear in comments (use full-word, case-sensitive text-search)
| --------------------------------
| OWN   Own code added.
| ATT   Attention, possible source of error or problem.
| FIX   Need to be fixed or implemented.
| OPT   Need or can be optimized.
| ORG   Original code, e.g. something required to be disabled.
| SECT  Code section.
-------------------------------------------------------------------------*/

const SAEC_Version = 0;
const SAEC_Revision = 9;
const SAEC_Patch = 10;

/*---------------------------------*/
/* errors */

function SAEO_Error(err, msg) {
	this.err = err;
	this.msg = msg;
}
SAEO_Error.prototype = new Error;

const SAEE_None = 0;

const SAEE_AlreadyRunning = 1;
const SAEE_NotRunning = 2;
const SAEE_NoTimer = 3;
const SAEE_NoMemory = 4;
const SAEE_Assert = 5;
const SAEE_Internal = 6;

const SAEE_Config_Invalid = 10;
const SAEE_Config_Compressed = 11;

const SAEE_CPU_Internal = 20;
const SAEE_CPU_Requires68020 = 21;
const SAEE_CPU_Requires680EC20 = 22;
const SAEE_CPU_Requires68030 = 23;
const SAEE_CPU_Requires68040 = 24;

const SAEE_Memory_NoKickstartRom = 30;
const SAEE_Memory_NoExtendedRom = 31;
const SAEE_Memory_RomSize = 32;
const SAEE_Memory_RomKey = 33;
const SAEE_Memory_RomDecode = 34;
const SAEE_Memory_RomChecksum = 35;
const SAEE_Memory_RomUnknown = 36;

const SAEE_Video_ElementNotFound = 40;
const SAEE_Video_RequiresCanvas = 41;
const SAEE_Video_RequiresWegGl = 42;
const SAEE_Video_ComphileShader = 43;
const SAEE_Video_LinkShader = 44;
const SAEE_Video_RequiresFullscreen = 45;

const SAEE_Audio_RequiresWebAudio = 50;

const SAEE_Input_GamepadNotReady = 60;

/*-----------------------------------------------------------------------*/
/* global references */

var SAER = null;

/*---------------------------------*/
/* global constants */

const SAEC_spcflag_STOP = 2;
const SAEC_spcflag_COPPER = 4;
const SAEC_spcflag_INT = 8;
const SAEC_spcflag_BRK = 16;
//const SAEC_spcflag_UAEINT = 32;
const SAEC_spcflag_TRACE = 64;
const SAEC_spcflag_DOTRACE = 128;
const SAEC_spcflag_DOINT = 256;
const SAEC_spcflag_BLTNASTY = 512;
//const SAEC_spcflag_EXEC = 1024;
//const SAEC_spcflag_ACTION_REPLAY = 2048;
//const SAEC_spcflag_TRAP = 4096; /* enforcer-hack */
const SAEC_spcflag_MODE_CHANGE = 8192;
const SAEC_spcflag_CHECK = 32768;

const SAEC_command_Quit = 1;
const SAEC_command_Reset = 2;
const SAEC_command_KeyboardReset = 3;
const SAEC_command_HardReset = 4;
const SAEC_command_Pause = 5;
const SAEC_command_Resume = 6;

/*---------------------------------*/

const SAEC_Info_Brower_ID_Unknown = 0;
const SAEC_Info_Brower_ID_Chrome = 1;
const SAEC_Info_Brower_ID_Safari = 2;
const SAEC_Info_Brower_ID_Opera = 3;
const SAEC_Info_Brower_ID_Firefox = 4;
const SAEC_Info_Brower_ID_InternetExplorer = 5;

const SAEC_info = (function() {
	var info = {
		browser: {
			id: SAEC_Info_Brower_ID_Unknown,
			name: "Unknown",
			plat: "Unknown",
			lang: "en"
		},
		memory: {
			maxSize: 0
		},
		audio: {
			webAudio: false
		},
		video: {
			canvas: false,
			webGL: false,
			pointerLock: false,
			requestFullScreen: false
		},
		input: {
			gamepad: false
		}
	};

	/* browser */
	if (navigator.userAgent.indexOf("Chrome") > -1) {
		info.browser.id = SAEC_Info_Brower_ID_Chrome;
		info.browser.name = "Google Chrome";
	}
	else if (navigator.userAgent.indexOf("Safari") > -1) {
		info.browser.id = SAEC_Info_Brower_ID_Safari;
		info.browser.name = "Apple Safari";
	}
	else if (navigator.userAgent.indexOf("Opera") > -1) {
		info.browser.id = SAEC_Info_Brower_ID_Opera;
		info.browser.name = "Opera";
	}
	else if (navigator.userAgent.indexOf("Firefox") > -1) {
		info.browser.id = SAEC_Info_Brower_ID_Firefox;
		info.browser.name = "Mozilla Firefox";
	}
	else if (navigator.userAgent.indexOf("MSIE") > -1) {
		info.browser.id = SAEC_Info_Brower_ID_InternetExplorer;
		info.browser.name = "Microsoft Internet Explorer";
	}
	info.browser.plat = navigator.platform;
	info.browser.lang = navigator.language;

	/* max memory */
	if (0) {
		var size = 1048576;
		while (true) {
			try {
				var data = new Uint8Array(size);
				delete data;
				info.memory.maxSize = size;
			} catch (e) {
				break;
			}
			size *= 2;
		}
	} else
		info.memory.maxSize = 1073741824; //1G

	/* audio */
	if (typeof window.webkitAudioContext != "undefined" || typeof window.AudioContext != "undefined" )
		info.audio.webAudio = true;
	/* disabled because audioContextDriver() does require user-initiation
	var audioContext = null;
	try {
		var audioContextDriver = window.AudioContext || window.webkitAudioContext;
		audioContext = new audioContextDriver();
		var audioProcessor = audioContext.createScriptProcessor(1024, 2, 2);

		info.audio.webAudio = true;

		if (audioContext.close) audioContext.close().then(function() {});
		audioContext = null;
	} catch (e) {
		if (audioContext) {
			if (audioContext.close) audioContext.close().then(function() {});
			audioContext = null;
		}
	}*/

	/* video */
	var canvas = document.createElement("canvas");
	if (canvas && canvas.getContext) {
		try {
			var ctx = canvas.getContext("2d");
			var imageData = ctx.createImageData(16, 16);
			info.video.canvas = true;

			try {
				const glParams = {
					alpha: false,
					depth: true,
					stencil: false,
					antialias: false,
					premultipliedAlpha: false,
					preserveDrawingBuffer: true,
					failIfMajorPerformanceCaveat: false
				};
				ctx = canvas.getContext("webgl", glParams) || canvas.getContext("experimental-webgl", glParams);
				info.video.webGL = true;
			} catch(e) {}

			/* pointerLock API */
			if (canvas.webkitRequestPointerLock !== undefined ||
				canvas.mozRequestPointerLock !== undefined ||
				canvas.msRequestPointerLock !== undefined ||
				canvas.requestPointerLock !== undefined
			) info.video.pointerLock = true;

			/* fullScreen API */
			if (canvas.webkitRequestFullscreen !== undefined ||
				canvas.mozRequestFullScreen !== undefined ||
				canvas.msRequestFullscreen !== undefined ||
				canvas.requestFullScreen !== undefined
			) info.video.requestFullScreen = true;
		} catch(e) {}
	}

	/* gamepad API */
	if (navigator.webkitGetGamepads !== undefined || navigator.getGamepads !== undefined)
		info.input.gamepad = true;

	return info;
})();

/*---------------------------------*/
/* global variables */

var SAEV_spcflags = 0;
var SAEV_command = 0;

/*---------------------------------*/
/* global functions */

function SAEF_setSpcFlags(x) { SAEV_spcflags |= x; };
function SAEF_clrSpcFlags(x) { SAEV_spcflags &= ~x; };

/*---------------------------------*/

function SAEF_now() {
	return Math.floor(performance.now() * 1000); /* micro-seconds since page-load */
}
function SAEF_sleep(ms) {
	var start = performance.now();
	while ((performance.now() - start) < ms) {} /* pretty nasty */
}

/*---------------------------------*/
/* debug */

function SAEF_log() {
	if (SAEV_config.debug.level >= SAEC_Config_Debug_Level_Log && arguments.length) {
		var str = sprintf.apply(this, arguments);
		if (console.log) console.log(str);
	}
}
function SAEF_info() {
	if (SAEV_config.debug.level >= SAEC_Config_Debug_Level_Info && arguments.length) {
		var str = sprintf.apply(this, arguments);
		if (console.info) console.info(str);
	}
}
function SAEF_warn() {
	if (SAEV_config.debug.level >= SAEC_Config_Debug_Level_Warn && arguments.length) {
		var str = sprintf.apply(this, arguments);
		if (console.warn) console.warn(str);

	}
}
function SAEF_error() {
	if (SAEV_config.debug.level >= SAEC_Config_Debug_Level_Error && arguments.length) {
		var str = sprintf.apply(this, arguments);
		if (console.error) console.error(str);
	}
}
function SAEF_fatal() {
	var argumentsArray = Array.prototype.slice.call(arguments);
	var err = argumentsArray[0];
	var str = sprintf.apply(this, argumentsArray.slice(1));
	if (console.error) console.error(str);
	throw new SAEO_Error(err, str);
}

function SAEF_assert(cond) {
	if (!cond) {
		var err = SAEE_Assert;
		var str = "Assertion failed. This is a bug in SAE.";
		if (console.error) console.error(str);
		throw new SAEO_Error(err, str);
	}
}

/*---------------------------------*/

function ScriptedAmigaEmulator() {
	SAER = this;

	this.audio = new SAEO_Audio();
	this.autoconf = new SAEO_AutoConf();
	this.blitter = new SAEO_Blitter();
	this.cia = new SAEO_CIA();
	this.config = new SAEO_Configuration();
	this.copper = new SAEO_Copper();
	this.cpu = new SAEO_CPU();
	this.custom = new SAEO_Custom();
	this.devices = new SAEO_Devices();
	this.disk = new SAEO_Disk();
	this.dongle = new SAEO_Dongle();
	this.events = new SAEO_Events();
	this.expansion = new SAEO_Expansion();
	this.filesys = new SAEO_Filesys();
	this.gayle = new SAEO_Gayle();
	this.gui = new SAEO_GUI();
	this.hardfile = new SAEO_Hardfile();
	this.ide = new SAEO_IDE();
	this.input = new SAEO_Input();
	this.m68k = new SAEO_M68K();
	this.memory = new SAEO_Memory();
	this.parallel = new SAEO_Parallel();
	this.playfield = new SAEO_Playfield();
	this.roms = new SAEO_Roms();
	this.rtc = new SAEO_RTC();
	this.serial = new SAEO_Serial();
	this.video = new SAEO_Video();

	/*---------------------------------*/

	this.running = false;
	this.paused = false;

	/*-----------------------------------------------------------------------*/

	this.dump = function () {
		this.m68k.dump();
		//this.memory.dump();
		//this.cia.dump();
	};

	/*-----------------------------------------------------------------------*/

	this.do_start_program = function() {
		if (SAEV_command >= 0)
			SAEV_command = SAEC_command_Reset;

		this.m68k.m68k_go(true);
	}

	this.do_leave_program = function() {
		//sampler_free();
		this.video.cleanup();
		this.input.cleanup();
		this.disk.cleanup();
		this.audio.cleanup();
		//dump_counts();
		this.serial.cleanup();
		/*#ifdef CDTV
		cdtv_free();
		cdtvcr_free();
		#endif
		#ifdef CD32
		akiko_free();
		cd32_fmv_free();
		#endif*/
		//this.gui.cleanup(); //empty
		//#ifdef AUTOCONFIG
		this.expansion.cleanup();
		//#endif
		//#ifdef FILESYS
		this.filesys.cleanup();
		//#endif
		this.gayle.cleanup();
		/*idecontroller_free();
		device_func_reset();
		#ifdef WITH_TOCCATA
		sndboard_free();
		#endif*/
		this.memory.cleanup();
		//free_shm();
		this.autoconf.cleanup();
	}

	this.start_program = function() {
		this.do_start_program();

		if (typeof SAEV_config.hook.event.started === "function")
			SAEV_config.hook.event.started();
	}

	this.leave_program = function() {
		this.dump();
		this.do_leave_program();

		if (typeof SAEV_config.hook.event.stopped === "function")
			SAEV_config.hook.event.stopped();
	}

	this.pause_program = function(p) {
		this.audio.pauseResume(p);
		this.events.pauseResume(p);

		if (typeof SAEV_config.hook.event.paused === "function")
			SAEV_config.hook.event.paused(p);
	}

	/*---------------------------------*/
	/* API */

	this.getVersion = function(str) {
		if (str)
			return sprintf("%d.%d.%d", SAEC_Version, SAEC_Revision, SAEC_Patch);
		else
			return [SAEC_Version, SAEC_Revision, SAEC_Patch];
	}
	this.getInfo = function() {
		return SAEC_info;
	}
	this.getConfig = function() {
		return SAEV_config;
	}

	this.setDefaults = function() {
		return this.config.setDefaults();
	}
	this.setModel = function(model, config) {
		return this.config.setModel(model, config);
	}

	this.setMountInfoDefaults = function(num) {
		var ci = SAEV_config.mount.config[num].ci;
		this.filesys.uci_set_defaults(ci, false);
	}

	this.start = function() {
		if (SAER.running) {
			SAEF_warn("sae.start() emulation already running");
			return SAEE_AlreadyRunning;
		}
		SAEF_info("sae.start() starting...");

		var err;
		if ((err = this.config.setup()) != SAEE_None)
			return err;
		if ((err = this.video.obtain()) != SAEE_None)
			return err;
		if ((err = this.audio.obtain()) != SAEE_None)
			return err;
		if ((err = this.input.setup()) != SAEE_None) //inputdevice_init();
			return err;
		if ((err = this.gui.setup()) != SAEE_None)
			return err;

		/*#ifdef PICASSO96
		picasso_reset();
		#endif*/

		//this.config.fixup_prefs(currprefs, true);
		//SAEV_config.audio.mode = 0; /* force sound settings change */

		this.memory.hardreset(2);
		if ((err = this.memory.reset(true)) == SAEE_None)
		{
			/*#ifdef AUTOCONFIG
			native2amiga_install();
			#endif*/
			this.custom.setup(); //OWN
			this.blitter.setup(); //OWN
			this.playfield.setup(); //custom_init();
			//this.serial.setup(); //empty
			this.disk.setup();

			this.events.reset_frame_rate_hack();
			if ((err = this.m68k.setup()) == SAEE_None) /* m68k_init() must come after reset_frame_rate_hack() */
			{
				//this.gui.update(); //empty
				if ((err = this.video.setup(true)) == SAEE_None)
				{
					if ((err = this.audio.setup()) == SAEE_None)
					{
						this.start_program();
						SAEF_info("sae.start() ...done");
						return SAEE_None;
					}
					this.video.cleanup();
				}
			}
		}
		this.input.cleanup();
		SAEF_error("sae.start() ...error %d", err);
		return err;
	}

	this.stop = function() { //uae_quit()
		if (this.running) {
			SAEF_info("sae.stop()");
			if (SAEV_command != -SAEC_command_Quit)
				SAEV_command = -SAEC_command_Quit;

			return SAEE_None;
		} else {
			SAEF_warn("sae.stop() emulation not running");
			return SAEE_NotRunning;
		}
	};

	this.reset = function(hard, keyboard) { //uae_reset(hard, keyboard)
		if (typeof hard == "undefined") var hard = false;
		if (typeof keyboard == "undefined") var keyboard = false;
		if (this.running) {
			SAEF_info("sae.reset() hard %d, keyboard %d", hard?1:0, keyboard?1:0);
			if (SAEV_command == 0) {
				SAEV_command = -SAEC_command_Reset; /* soft */
				if (keyboard)
					SAEV_command = -SAEC_command_KeyboardReset;
				if (hard)
					SAEV_command = -SAEC_command_HardReset;
			}
			return SAEE_None;
		} else {
			SAEF_warn("sae.reset() emulation not running");
			return SAEE_NotRunning;
		}
	};

	this.pause = function(pause) {
		if (this.running) {
			if (!this.paused && pause) {
				SAEF_info("sae.pause() pausing emulation");
				SAEV_command = SAEC_command_Pause;
			}
			else if (this.paused && !pause) {
				SAEF_info("sae.pause() resuming emulation");
				SAEV_command = SAEC_command_Resume;
			}
			return SAEE_None;
		} else {
			SAEF_warn("sae.pause() emulation not running");
			return SAEE_NotRunning;
		}
	};

	this.mute = function(mute) {
		if (this.running) {
			this.audio.mute(mute);
			if (mute)
				SAEF_log("sae.mute() audio muted");
			else
				SAEF_log("sae.mute() playing audio");
			return SAEE_None;
		} else {
			SAEF_warn("sae.mute() emulation not running");
			return SAEE_NotRunning;
		}
	};

	this.screen = function(screen) {
		if (this.running) {
			if (SAEC_info.video.requestFullScreen) {
				this.video.screen(screen);
				if (screen)
					SAEF_log("sae.screen() screen-mode");
				else
					SAEF_log("sae.screen() window-mode");
				return SAEE_None;
			} else {
				SAEF_error("sae.screen() screen-api not supported");
				return SAEE_Video_RequiresFullscreen;
			}
		} else {
			SAEF_warn("sae.screen() emulation not running");
			return SAEE_NotRunning;
		}
	};

	this.insert = function(unit) {
		if (this.running) {
			var file = SAEV_config.floppy.drive[unit].file;
			this.disk.insert(unit, file);
			SAEF_info("sae.insert() unit %d inserted, name '%s', size %d, protected %d", unit, file.name, file.size, file.prot?1:0);
			return SAEE_None;
		} else {
			SAEF_warn("sae.insert() emulation not running");
			return SAEE_NotRunning;
		}
	};

	this.eject = function(unit) {
		if (this.running) {
			this.disk.eject(unit);
			SAEF_info("sae.eject() unit %d ejected", unit);
			return SAEE_None;
		} else {
			SAEF_warn("sae.eject() emulation not running");
			return SAEE_NotRunning;
		}
	};

	this.getRomInfo = function(ri, file) {
		return this.roms.examine(ri, file);
	};

	this.getDiskInfo = function(di, unit) {
		return this.disk.examine(di, unit);
	};

	this.createDisk = function(unit, name, mode, type, label, ffs, bootable) {
		if (!this.disk.create(unit, name, mode, type, label, ffs, bootable))
			return SAEE_NoMemory;
		return SAEE_None;
	};

	this.keyPress = function(e, down) {
		this.input.keyPress(e, down);
		return SAEE_None;
	};

	/*---------------------------------*/

	SAEF_info("SAE %d.%d.%d", SAEC_Version, SAEC_Revision, SAEC_Patch);
}
