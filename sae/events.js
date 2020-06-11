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
| Note: ported from WinUAE 3.2.x
-------------------------------------------------------------------------*/
/* global constants */

const SAEC_Events_CYCLE_UNIT = 512;
const SAEC_Events_CYCLE_UNIT_INV = 1.0 / SAEC_Events_CYCLE_UNIT; /* mul is always faster than div */
const SAEC_Events_CYCLE_MAX = 0x100000000 * SAEC_Events_CYCLE_UNIT;

/*---------------------------------*/

const SAEC_Events_EV_CIA = 0;
const SAEC_Events_EV_AUDIO = 1;
const SAEC_Events_EV_HSYNC = 2;

const SAEC_Events_EV2_BLITTER = 0;
const SAEC_Events_EV2_DISK = 1;

const SAEC_Events_syncbase = 1000000;

/*---------------------------------*/

/*const SAEC_Events_cycle_line_REFRESH = 1;
const SAEC_Events_cycle_line_STROBE = 2;
const SAEC_Events_cycle_line_MISC = 3;
const SAEC_Events_cycle_line_SPRITE = 4;
const SAEC_Events_cycle_line_COPPER = 5;
const SAEC_Events_cycle_line_BLITTER = 6;
const SAEC_Events_cycle_line_CPU = 7;
//const SAEC_Events_cycle_line_CPUNASTY	= 8;
const SAEC_Events_cycle_line_COPPER_SPECIAL = 0x10;
const SAEC_Events_cycle_line_MASK = 0x0f;*/

/*---------------------------------*/
/* global references */

var SAER_Events_eventtab = null;

//var SAER_Events_cycle_line = null;

/*---------------------------------*/
/* global variables */

var SAEV_Events_currcycle = 0;
var SAEV_Events_bogusframe = 0;
var SAEV_Events_timeframes = 0;
var SAEV_Events_hsync_counter = 0;
var SAEV_Events_vsync_counter = 0;
var SAEV_Events_frameskiptime = 0;
var SAEV_Events_reflowtime = 0; //OWN

/*---------------------------------*/

function SAEO_Events() {
	const EV_MISC = 3;
	const EV_MAX = 4;
	function Event() {
		this.active = false;
		this.evtime = 0;
		this.oldcycles = 0;
		this.handler = null;
	};
	var eventtab = new Array(EV_MAX); for (i = 0; i < EV_MAX; i++) eventtab[i] = new Event();
	SAER_Events_eventtab = eventtab;

	const EV2_MISC = 2;
	const EV2_MAX = 12;
	function Event2() {
		this.active = false;
		this.evtime = 0;
		this.data = null;
		this.handler = null;
	};
	var eventtab2 = new Array(EV2_MAX); for (i = 0; i < EV2_MAX; i++) eventtab2[i] = new Event2();

	//var currcycle = 0; -> SAEV_Events_currcycle
	var nextevent = 0;
	var is_syncline = 0, is_syncline_end = 0;
	//var vblank_found_chipset = false;
	//var sleeps_remaining = 0;
	var linecounter = 0;

	//var syncbase = 0; -> SAEC_Events_syncbase
	var vsyncmintime = 0, vsyncmaxtime = 0, vsyncwaittime = 0;
	var vsynctimebase = 0;
	//var rpt_did_reset = 0;

	//var frameskiptime = 0; -> SAEV_Events_frameskiptime
	var vsynctimeperline = 0; //global

	var dmal = 0, dmal_hpos = 0; //u16

	//in framewait()
	const MAVG_VSYNC_SIZE = 128;
	var ma_frameskipt = new SAEO_MAvg(MAVG_VSYNC_SIZE);
	//var ma_adjust = new mavg_data();
	//var ma_legacy = new mavg_data();
	//var ma_skip = new mavg_data();
	var ma_reflowt = new SAEO_MAvg(10); //OWN
	//var vsync_time = 0;

	//in MISC_handler()
	var dorecheck = false;
	var recursive = 0;

	/* Statistics */
	const FPSCOUNTER_MAVG_SIZE = 10
	var fps_mavg = new SAEO_MAvg(FPSCOUNTER_MAVG_SIZE);
	var idle_mavg = new SAEO_MAvg(FPSCOUNTER_MAVG_SIZE);

	//var bogusframe = 0; //-> SAEV_Events_bogusframe
	//var timeframes = 0; //-> SAEV_Events_timeframes
	var frametime = 0, lastframetime = 0; //global
	var idletime = 0; //global
	//var hsync_counter = 0; -> SAEV_Events_hsync_counter
	//var vsync_counter = 0; -> SAEV_Events_vsync_counter

	//event2_newevent_xx()
	var nextno = EV2_MISC;

	const PISSOFF_NOJIT_VALUE = 256 * SAEC_Events_CYCLE_UNIT;
	var pissoff = 0;
	//#define countdown pissoff

	//#ifdef CPUEMU_13
	//var cycle_line = new Uint8Array(256 + 1);
	//SAER_Events_cycle_line = cycle_line;
	//#endif

	/*-----------------------------------------------------------------------*/

	this.reset = function() { //init_eventtab()
		if (eventtab[SAEC_Events_EV_HSYNC].handler === null) { //OWN
			eventtab[SAEC_Events_EV_CIA].handler = function() { SAER.cia.handler(); };
			eventtab[SAEC_Events_EV_HSYNC].handler = function() { SAER.playfield.hsync_handler(); };
			eventtab[SAEC_Events_EV_AUDIO].handler = function() { SAER.audio.handler(); };
			eventtab[EV_MISC].handler = MISC_handler;

			eventtab2[SAEC_Events_EV2_BLITTER].handler = function(data) { SAER.blitter.handler(data); };
			eventtab2[SAEC_Events_EV2_DISK].handler = function(data) { SAER.disk.handler(data); };
		}

		nextevent = 0;
		nextno = EV2_MISC; //OWN
		for (var i = 0; i < EV_MAX; i++) {
			eventtab[i].active = false;
			eventtab[i].oldcycles = SAEV_Events_currcycle;
		}
		eventtab[SAEC_Events_EV_HSYNC].evtime = SAEV_Events_currcycle + SAER.playfield.get_maxhpos() * SAEC_Events_CYCLE_UNIT;
		eventtab[SAEC_Events_EV_HSYNC].active = true;

		for (i = 0; i < EV2_MAX; i++)
			eventtab2[i].active = false;

		this.schedule();

		//OWN
		dorecheck = false;
		recursive = 0;
		//nextno = EV2_MISC;
		fpscounter_reset();
		ma_frameskipt.clr();
		ma_reflowt.clr();
		//reset_frame_rate_hack();
		//sleeps_remaining = 0;
		linecounter = 0;
	}

	this.clr_dmal = function() {
		dmal = 0;
	}

	this.pauseResume = function(pause) {
		if (pause) {
			SAER.gui.data.fps = 0;
			SAER.gui.data.idle = 0;
			SAER.gui.fps(0, 0, 1);
		} else {
			dmal = 0;
			fpscounter_reset();
			ma_frameskipt.clr();
		}
	}

	/*-----------------------------------------------------------------------*/

	this.reset_frame_rate_hack = function() {
		if (SAEV_config.cpu.speed < 0) {
			//rpt_did_reset = 1;
			is_syncline = 0;
			vsyncmintime = SAEF_now() + vsynctimebase;
			//SAEF_log("events.reset_frame_rate_hack() %d", vsyncmintime);
		}
	}
	this.calc_vsynctimebase = function(hz) {
		vsynctimebase = SAEC_Events_syncbase / hz >>> 0;
		SAEF_log("events.calc_vsynctimebase() %d us (%f)", vsynctimebase, hz);
		this.reset_frame_rate_hack();
		return vsynctimebase;
	}

	this.schedule = function() {
		var mintime = SAEC_Events_CYCLE_MAX;
		for (var i = 0; i < EV_MAX; i++) {
			if (eventtab[i].active) {
				var eventtime = eventtab[i].evtime - SAEV_Events_currcycle;
				if (eventtime < mintime)
					mintime = eventtime;
			}
		}
		nextevent = SAEV_Events_currcycle + mintime;
	}

	/*this.get_cycles = function() { //OPT inline ok
		return SAEV_Events_currcycle;
	}
	this.set_cycles = function(x) {
		SAEV_Events_currcycle = x;
		eventtab[SAEC_Events_EV_HSYNC].oldcycles = x;
	}
	this.cycles_in_range = function(endcycles) { //OPT inline ok, used in disk.DSKBYTR()
		return endcycles - SAEV_Events_currcycle > 0;
	}*/

	/*function current_hpos_safe() { //OPT inline ok
		return ((SAEV_Events_currcycle - eventtab[SAEC_Events_EV_HSYNC].oldcycles) * SAEC_Events_CYCLE_UNIT_INV) >>> 0;
	}*/
	this.current_hpos = function() {
		//var hp = current_hpos_safe();
		var hp = ((SAEV_Events_currcycle - eventtab[SAEC_Events_EV_HSYNC].oldcycles) * SAEC_Events_CYCLE_UNIT_INV) >>> 0;
		if (hp < 0 || hp > 256) {
			SAEF_error("events.current_hpos() hpos = %d !?", hp);
			hp = 0;
		}
		return hp;
	}

	/*-----------------------------------------------------------------------*/

	this.do_cycles = function(cycles_to_add) { //do_cycles_slow()
		if ((pissoff -= cycles_to_add) >= 0)
			return;

		cycles_to_add = -pissoff;
		pissoff = 0;

		//if (cycles_to_add == 0) SAEF_warn("event.do_cycles() cycles_to_add == 0");

		while ((nextevent - SAEV_Events_currcycle) <= cycles_to_add) {
			// Keep only CPU emulation running while waiting for sync point.
			if (is_syncline) {
				//if (!vblank_found_chipset) {
					if (is_syncline > 0) {
						var rpt = SAEF_now();
						var v = rpt - vsyncmintime;
						var v2 = rpt - is_syncline_end;
						if (v > vsynctimebase || v < -vsynctimebase) v = 0;
						if (v < 0 && v2 < 0) {
							pissoff = PISSOFF_NOJIT_VALUE;
							return;
						}
					} else if (is_syncline < 0) {
						var rpt = SAEF_now();
						var v = rpt - is_syncline_end;
						if (v < 0) {
							pissoff = PISSOFF_NOJIT_VALUE;
							return;
						}
					}
				//}
				is_syncline = 0;
			}

			cycles_to_add -= nextevent - SAEV_Events_currcycle;
			SAEV_Events_currcycle = nextevent;

			for (var i = 0; i < EV_MAX; i++) {
				if (eventtab[i].active && eventtab[i].evtime == SAEV_Events_currcycle) {
					/*if (eventtab[i].handler === null) {
						SAEF_error("events.eventtab[%d].handler is null!", i);
						eventtab[i].active = false;
					} else*/
						eventtab[i].handler();
				}
			}
			this.schedule();
		}
		SAEV_Events_currcycle += cycles_to_add;
	}
	this.do_cycles_post = function(cycles, v) {
		this.do_cycles(cycles);
	}

	/*-----------------------------------------------------------------------*/

	function MISC_handler() {
		var mintime = SAEC_Events_CYCLE_MAX;
		var ct = SAEV_Events_currcycle;

		if (recursive) {
			dorecheck = true;
			return;
		}
		recursive++;
		SAER_Events_eventtab[EV_MISC].active = false;

		var recheck = true;
		while (recheck) {
			recheck = false;
			mintime = SAEC_Events_CYCLE_MAX;
			for (var i = 0; i < EV2_MAX; i++) {
				if (eventtab2[i].active) {
					if (eventtab2[i].evtime == ct) {
						eventtab2[i].active = false;
						eventtab2[i].handler(eventtab2[i].data);
						if (dorecheck || eventtab2[i].active) {
							recheck = true;
							dorecheck = false;
						}
					} else {
						var eventtime = eventtab2[i].evtime - ct;
						if (eventtime < mintime)
							mintime = eventtime;
					}
				}
			}
		}
		if (mintime != SAEC_Events_CYCLE_MAX) {
			SAER_Events_eventtab[EV_MISC].active = true;
			SAER_Events_eventtab[EV_MISC].oldcycles = ct;
			SAER_Events_eventtab[EV_MISC].evtime = ct + mintime;
			SAER.events.schedule();
		}
		recursive--;
	}

	this.event2_newevent_xx = function(no, t, data, func) {
		var et = SAEV_Events_currcycle + t;
		if (no < 0) {
			no = nextno;
			for (;;) {
				if (!eventtab2[no].active)
					break;
				if (eventtab2[no].evtime == et && eventtab2[no].data == data && eventtab2[no].handler === func)
					break;
				no++;
				if (no == EV2_MAX)
					no = EV2_MISC;
				if (no == nextno) {
					SAEF_error("events.event2_newevent_xx() out of events!");
					return;
				}
			}
			nextno = no;
		}
		eventtab2[no].active = true;
		eventtab2[no].evtime = et;
		eventtab2[no].handler = func;
		eventtab2[no].data = data;
		MISC_handler();
	}
	function event2_newevent_x(no, t, data, func) {
		if (t <= 0) {
			func(data);
			return;
		}
		SAER.events.event2_newevent_xx(no, t * SAEC_Events_CYCLE_UNIT, data, func);
	}
	this.event2_newevent = function(no, t, data) {
		event2_newevent_x(no, t, data, eventtab2[no].handler);
	}
	/*this.event2_newevent2 = function(t, data, func) {
		event2_newevent_x(-1, t, data, func);
	}*/

	this.event2_remevent = function(no) {
		eventtab2[no].active = false;
	}

	/*-----------------------------------------------------------------------*/
	/* events dmal */

	function dmal_emu(v) {
		// Disk and Audio DMA bits are ignored by Agnus, Agnus only checks DMAL and master bit
		if (!(SAEV_Custom_dmacon & SAEC_Custom_DMAF_DMAEN))
			return;

		var hpos = SAER.events.current_hpos();
		if (v >= 6) {
			v -= 6;
			var nr = v >> 1;
			var pt = SAER.audio.getpt(nr, (v & 1) != 0);
			var dat = SAER_Memory_chipGet16_indirect(pt);
			SAEV_Custom_last_value = dat;
			SAER.audio.AUDxDAT(nr, dat);
		} else {
			var w = v & 1;
			var pt = SAER.disk.getpt();
			// disk_fifostatus() needed in >100% disk speed modes
			if (w) {
				// write to disk
				if (SAER.disk.fifostatus() <= 0) {
					var dat = SAER_Memory_chipGet16_indirect(pt);
					SAEV_Custom_last_value = dat;
					SAER.disk.DSKDAT(dat);
				}
			} else {
				// read from disk
				if (SAER.disk.fifostatus() >= 0) {
					var dat = SAER.disk.DSKDATR();
					SAER_Memory_chipPut16_indirect(pt, dat);
				}
			}
		}
	}

	this.events_dmal_hsync = function() {
		if (dmal) SAEF_error("events.events_dmal_hsync() DMAL error!? %04x", dmal);
		dmal = SAER.audio.dmal();
		dmal = (dmal << 6) & 0xffff;
		dmal |= SAER.disk.dmal();
		if (dmal) {
			dmal_hpos = 0;
			//SAER.events.event2_newevent2(7, 13, function(v) {
			SAER.events.event2_newevent_xx(-1, 7 * SAEC_Events_CYCLE_UNIT, 13, function(v) {
				while (dmal) {
					if (dmal & 3)
						dmal_emu(dmal_hpos + ((dmal & 2) ? 1 : 0));
					dmal_hpos += 2;
					dmal >>>= 2;
				}
			});
		}
	}

	/*-----------------------------------------------------------------------*/
	/* fps counter */

	function fpscounter_reset() { //global
		fps_mavg.clr();
		idle_mavg.clr();
		SAEV_Events_bogusframe = 2;
		SAEV_Events_timeframes = 0;
		lastframetime = SAEF_now();
		idletime = 0;
	}

	this.fpscounter = function(frameok) {
		var now = SAEF_now();
		var last = now - lastframetime;
		lastframetime = now;

		if (SAEV_Events_bogusframe || last < 0)
			return;

		fps_mavg.set(last);
		idle_mavg.set(idletime);
		idletime = 0;

		frametime += last;
		SAEV_Events_timeframes++;

		if ((SAEV_Events_timeframes & 7) == 0) {
			var avg = idle_mavg.get();
			var idle = 100.0 - (avg == 0 ? 0 : avg * 100 / vsynctimebase);
			if (idle < 0)
				idle = 0.0;
			else if (idle > 100)
				idle = 100.0;

			avg = fps_mavg.get();
			var fps = avg == 0 ? 0 : SAEC_Events_syncbase / avg;
			if (fps > 999)
				fps = 999.0;

			if (SAEV_Playfield_fake_vblank_hz > fps) idle *= SAEV_Playfield_fake_vblank_hz / fps;
			//if (currprefs.turbo_emulation && idle < 100) idle = 100.0;

			SAER.gui.data.fps = fps;
			//SAER.gui.data.idle = (int)idle;
			SAER.gui.data.idle = idle;
			SAER.gui.data.fps_color = frameok ? 0 : 1;
			if ((SAEV_Events_timeframes & 15) == 0) {
				//SAER.gui.fps(fps, (int)idle, frameok ? 0 : 1);
				SAER.gui.fps(fps, idle, frameok ? 0 : 1);
			}
		}
	}

	/*-----------------------------------------------------------------------*/
	/* synchronization */

	this.framewait2_maximum = function(ll) {
		//static int sleeps_remaining;
		//if (is_last_line()) {
		if (ll) {
			/*sleeps_remaining = (165 - currprefs.cpu_idle) / 6;
			if (sleeps_remaining < 0)
				sleeps_remaining = 0;
			// really last line, just run the cpu emulation until whole vsync time has been used
			if (SAER.m68k.stopped && currprefs.cpu_idle) {
				// CPU in STOP state: sleep if enough time left.
				var rpt = SAEF_now();
				while (!vsync_isdone () && ~~vsyncmintime - ~~(rpt + vsynctimebase / 10) > 0 && ~~vsyncmintime - ~~rpt < vsynctimebase) {
					//if (!execute_other_cpu(rpt + vsynctimebase / 10))
						SAEF_sleep(1);
					rpt = SAEF_now();
				}
			} else*/ if (SAEV_config.cpu.speedThrottle) {
				vsyncmintime = SAEF_now(); // end of CPU emulation time
				is_syncline = 0;
			} else {
				vsyncmintime = vsyncmaxtime; // emulate if still time left
				is_syncline_end = SAEF_now() + vsynctimebase; // far enough in future, we never wait that long
				is_syncline = 2;
			}
		} else {
			//static int linecounter;
			// end of scanline, run cpu emulation as long as we still have time
			vsyncmintime += vsynctimeperline;
			linecounter++;
			is_syncline = 0;
			//if (!vsync_isdone() && !currprefs.turbo_emulation)
			{
				if (vsyncmaxtime - vsyncmintime > 0) {
					if (vsyncwaittime - vsyncmintime > 0) {
						var rpt = SAEF_now();
						// Extra time left? Do some extra CPU emulation
						if (vsyncmintime - rpt > 0) {
							/*if (SAER.m68k.stopped && currprefs.cpu_idle && sleeps_remaining > 0) {
								// STOP STATE: sleep.
								SAEF_sleep(1);
								sleeps_remaining--;
							} else*/ {
								is_syncline = 1;
								// limit extra time
								is_syncline_end = rpt + vsynctimeperline;
								linecounter = 0;
							}
						}
					}
					if (!SAER_Playfield_isvsync()) {
						// extra cpu emulation time if previous 10 lines without extra time.
						if (!is_syncline && linecounter >= 10 && (!SAER.m68k.stopped)) { // || !currprefs.cpu_idle)) {
							is_syncline = -1;
							is_syncline_end = SAEF_now() + vsynctimeperline;
							linecounter = 0;
						}
					}
				}
			}
		}
	}
	this.framewait2_normal = function() {
		vsyncmintime += vsynctimeperline;
		//if (!vsync_isdone() && !currprefs.turbo_emulation)
		{
			var rpt = SAEF_now();
			// sleep if more than 2ms "free" time
			//while (!vsync_isdone() && vsyncmintime - Math.floor(rpt + vsynctimebase / 10) > 0 && vsyncmintime - rpt < vsynctimebase) {
			while (vsyncmintime - Math.floor(rpt + vsynctimebase / 10) > 0 && vsyncmintime - rpt < vsynctimebase) {
				//if (!execute_other_cpu(rpt + vsynctimebase / 10))
				SAEF_sleep(1);
				rpt = SAEF_now();
				//SAEF_log("*");
			}
		}
	}

	/*---------------------------------*/

	function rpt_vsync(adjust) {
		var curr_time = SAEF_now();
		var v = curr_time - vsyncwaittime + adjust;
		if (v > SAEC_Events_syncbase || v < -SAEC_Events_syncbase) {
			vsyncmintime = vsyncmaxtime = vsyncwaittime = curr_time;
			v = 0;
		}
		return v;
	}
	/*function rtg_vsync() {
		#ifdef PICASSO96
		var start = SAEF_now();
		picasso_handle_vsync();
		var end = SAEF_now();
		SAEV_Events_frameskiptime += end - start;
		#endif
	}
	function rtg_vsynccheck() {
		if (vblank_found_rtg) {
			vblank_found_rtg = false;
			rtg_vsync();
		}
	}*/

	this.framewait = function() {
		var curr_time;
		var start;
		var vs = SAER_Playfield_isvsync_chipset();
		var status = 0;

		is_syncline = 0;

		//static struct mavg_data ma_frameskipt;
		var frameskipt_avg = ~~ma_frameskipt.set(SAEV_Events_frameskiptime); SAEV_Events_frameskiptime = 0;
		var reflowt_avg = ~~ma_reflowt.set(SAEV_Events_reflowtime);

		/*OWN stripped
		if (vs > 0) {} else if (vs < 0) {}*/

		status = 1;

		var clockadjust = 0;
		var vstb = vsynctimebase;

		if (SAEV_config.cpu.speed < 0) { //max
			if (!SAEV_Playfield_frame_rendered && !SAEV_Playfield_picasso_on)
				SAEV_Playfield_frame_rendered = SAER.video.render_screen(false);

			if (SAEV_config.cpu.speedThrottle) {
				// this delay can safely overshoot frame time by 1-2 ms, following code will compensate for it.
				for (;;) {
					curr_time = SAEF_now();
					if (vsyncwaittime - curr_time <= 0 || vsyncwaittime - curr_time > 2 * vsynctimebase)
						break;
					//rtg_vsynccheck();
					SAEF_sleep(1);
				}
			} else
				curr_time = SAEF_now();

			var adjust = 0, max;
			if (curr_time - vsyncwaittime > 0 && curr_time - vsyncwaittime < (vstb >> 1))
				adjust += curr_time - vsyncwaittime;
			adjust += clockadjust;
			if (SAEV_config.cpu.speedThrottle)
				max = Math.truncate(vstb * (1000.0 + SAEV_config.cpu.speedThrottle) / 1000.0 - adjust);
			else
				max = vstb - adjust;
			vsyncwaittime = curr_time + vstb - adjust;
			vsyncmintime = curr_time;

			if (max < 0) {
				max = 0;
				vsynctimeperline = 1;
			} else
				vsynctimeperline = max / (SAER.playfield.get_maxvpos_display() + 1) >>> 0;

			vsyncmaxtime = curr_time + max;

			//SAEF_info("%06d:%06d/%06d", adjust, vsynctimeperline, vstb);
		} else {
			const syncbase1000inv = 1.0 / (SAEC_Events_syncbase / 1000); //OWN
			var t = reflowt_avg; //OWN

			if (!SAEV_Playfield_frame_rendered && !SAEV_Playfield_picasso_on) {
				start = SAEF_now();
				SAEV_Playfield_frame_rendered = SAER.video.render_screen(false);
				t += SAEF_now() - start;
			}
			start = SAEF_now();
			while (true) { //while (!currprefs.turbo_emulation) {
				var v = rpt_vsync(clockadjust) * syncbase1000inv; //double
				if (v >= -4) break;
				//rtg_vsynccheck();
				SAEF_sleep(2);
			}
			while (rpt_vsync(clockadjust) < 0) {
				//rtg_vsynccheck();
			}
			curr_time = SAEF_now();
			idletime += curr_time - start;

			vsyncmintime = curr_time;
			vsyncmaxtime = vsyncwaittime = curr_time + vstb;

			if (SAEV_Playfield_frame_rendered) {
				SAER.video.show_screen(0);
				t += SAEF_now() - curr_time;
			}
			t += frameskipt_avg;
			vsynctimeperline = ~~((vstb - t) / 3);
			if (vsynctimeperline < 0)
				vsynctimeperline = 0;
			else if (vsynctimeperline > vstb / 3 >>> 0)
				vsynctimeperline = vstb / 3 >>> 0;

			SAEV_Playfield_frame_shown = true;
		}
		return status != 0;
	}

	/*-----------------------------------------------------------------------*/
	/* exact cycling */

	/*this.alloc_cycle = function(hpos, type) {
		//#ifdef CPUEMU_13
		//#if 0
		//if (cycle_line[hpos]) SAEF_log("events.alloc_cycle() hpos=%d, old=%d, new=%d", hpos, cycle_line[hpos], type);
		//if ((type == SAEC_Events_cycle_line_COPPER) && (hpos & 1) && hpos != SAER.playfield.get_maxhpos() - 2) SAEF_log("events.alloc_cycle() odd %d cycle %d", hpos);
		//if (!(hpos & 1) && (type == SAEC_Events_cycle_line_SPRITE || type == SAEC_Events_cycle_line_REFRESH || type == SAEC_Events_cycle_line_MISC)) SAEF_log("events.alloc_cycle() even %d cycle %d", type, hpos);
		//#endif
		cycle_line[hpos] = type;
		//#endif
	}
	this.alloc_cycle_maybe = function(hpos, type) {
		if ((cycle_line[hpos] & SAEC_Events_cycle_line_MASK) == 0)
			this.alloc_cycle(hpos, type);
	}
	this.alloc_cycle_blitter = function(hpos, ptr, chnum) {
		if (cycle_line[hpos] & SAEC_Events_cycle_line_COPPER_SPECIAL) {
			//static int warned = 100;
			var srcptr = SAER.copper.get_copxlc(); //cop_state.strobe == 1 ? cop1lc : cop2lc;
			//if (warned > 0)
			{
				SAEF_warn("events.alloc_cycle_blitter() buggy copper cycle conflict with blitter ch %d", chnum);
				//warned--;
			}
			//if ((currprefs.cs_hacks & 1) && SAEV_config.cpu.model == SAEC_Config_CPU_Model_68000)
			if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68000 && SAEV_config.chipset.blitter.cycle_exact)
				ptr.val = srcptr;
		}
		this.alloc_cycle(hpos, SAEC_Events_cycle_line_BLITTER);
	}*/
}
