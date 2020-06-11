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

const SAEC_Custom_DMAF_AUD0EN	= 1 << 0;
const SAEC_Custom_DMAF_AUD1EN	= 1 << 1;
const SAEC_Custom_DMAF_AUD2EN	= 1 << 2;
const SAEC_Custom_DMAF_AUD3EN	= 1 << 3;
const SAEC_Custom_DMAF_DSKEN	= 1 << 4;
const SAEC_Custom_DMAF_SPREN	= 1 << 5;
const SAEC_Custom_DMAF_BLTEN	= 1 << 6;
const SAEC_Custom_DMAF_COPEN	= 1 << 7;
const SAEC_Custom_DMAF_BPLEN	= 1 << 8;
const SAEC_Custom_DMAF_DMAEN	= 1 << 9;
const SAEC_Custom_DMAF_BLTPRI	= 1 << 10;
const SAEC_Custom_DMAF_BZERO	= 1 << 13;
const SAEC_Custom_DMAF_BBUSY	= 1 << 14;
const SAEC_Custom_DMAF_SETCLR	= 1 << 15;

const SAEC_Custom_INTF_TBE		= 1 << 0;
const SAEC_Custom_INTF_DSKBLK	= 1 << 1;
//const SAEC_Custom_INTF_PORTS	= 1 << 3;
//const SAEC_Custom_INTF_COPER	= 1 << 4;
const SAEC_Custom_INTF_VERTB	= 1 << 5;
const SAEC_Custom_INTF_BLIT	= 1 << 6;
//const SAEC_Custom_INTF_AUD0	= 1 << 7;
//const SAEC_Custom_INTF_AUD1	= 1 << 8;
//const SAEC_Custom_INTF_AUD2	= 1 << 9;
//const SAEC_Custom_INTF_AUD3	= 1 << 10;
const SAEC_Custom_INTF_RBF		= 1 << 11;
const SAEC_Custom_INTF_DSKSYN	= 1 << 12;
//const SAEC_Custom_INTF_EXTER	= 1 << 13;
const SAEC_Custom_INTF_INTEN	= 1 << 14;
const SAEC_Custom_INTF_SETCLR	= 1 << 15;

/*---------------------------------*/
/* global references */

var SAER_Custom_put16_real = null;

/*---------------------------------*/
/* global variables */

var SAEV_Custom_bank = null;

var SAEV_Custom_dmacon = 0;
var SAEV_Custom_intreq = 0;
var SAEV_Custom_intena = 0;
var SAEV_Custom_adkcon = 0;
var SAEV_Custom_last_value = 0;

/*---------------------------------*/
/* global functions */

function SAEF_Custom_dmaen(dmamask) {
	return (SAEV_Custom_dmacon & dmamask) != 0 && (SAEV_Custom_dmacon & SAEC_Custom_DMAF_DMAEN) != 0;
}

/*---------------------------------*/

function SAEO_Custom() {
	var readMap = null;
	var writeMap = null;

	//var last_custom_value = 0; -> SAEV_Custom_last_value

	//var dmacon = 0; -> SAEV_Custom_dmacon
	//var intreq = 0; -> SAEV_Custom_intreq
	//var intena = 0; -> SAEV_Custom_intena
	//var adkcon = 0; -> SAEV_Custom_adkcon
	var intreq_internal = 0;
	var intena_internal = 0;

	const INT_PROCESSING_DELAY = 3 * SAEC_Events_CYCLE_UNIT;

	/*-----------------------------------------------------------------------*/

	this.setup = function () {
		createReadMap();
		createWriteMap();
	}
	this.reset = function () {
		SAEV_Custom_dmacon = 0;
		SAEV_Custom_intena = intena_internal = 0;
		intreq_internal = 0;
	}

	/*-----------------------------------------------------------------------*/

	function DMACONR(hpos) {
		SAER.playfield.decide_line(hpos);
		SAER.playfield.decide_fetch_safe(hpos);
		SAEV_Custom_dmacon &= ~(0x4000 | 0x2000);
		SAEV_Custom_dmacon |= (((SAEV_Blitter_interrupt || (!SAEV_Blitter_interrupt && SAEV_config.chipset.agnusBltBusyBug && !SAER_Blitter_blt_info.got_cycle)) ? 0 : 0x4000) | (SAER_Blitter_blt_info.blitzero ? 0x2000 : 0));
		return SAEV_Custom_dmacon;
	}
	function DMACON(v, hpos) {
		var oldcon = SAEV_Custom_dmacon;

		SAER.playfield.decide_line(hpos);
		SAER.playfield.decide_fetch_safe(hpos);

		if (v & 0x8000) SAEV_Custom_dmacon |= v & 0x7FFF; else SAEV_Custom_dmacon &= ~v;
		SAEV_Custom_dmacon &= 0x07FF;

		var changed = SAEV_Custom_dmacon ^ oldcon;
		var oldcop = (oldcon & SAEC_Custom_DMAF_COPEN) != 0 && (oldcon & SAEC_Custom_DMAF_DMAEN) != 0;
		var newcop = (SAEV_Custom_dmacon & SAEC_Custom_DMAF_COPEN) != 0 && (SAEV_Custom_dmacon & SAEC_Custom_DMAF_DMAEN) != 0;

		if (oldcop != newcop) {
			if (newcop && !oldcop) {
				SAER.copper.compute_spcflag_copper(hpos);
			} else if (!newcop) {
				SAER.copper.copper_stop();
			}
		}

		if ((SAEV_Custom_dmacon & SAEC_Custom_DMAF_BLTPRI) > (oldcon & SAEC_Custom_DMAF_BLTPRI) && SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE)
			SAEF_setSpcFlags(SAEC_spcflag_BLTNASTY);

		if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN) && SAEV_Blitter_bltstate == SAEC_Blitter_bltstate_INIT)
			SAER.blitter.blitter_check_start();

		if ((SAEV_Custom_dmacon & (SAEC_Custom_DMAF_BLTPRI | SAEC_Custom_DMAF_BLTEN | SAEC_Custom_DMAF_DMAEN)) != (SAEC_Custom_DMAF_BLTPRI | SAEC_Custom_DMAF_BLTEN | SAEC_Custom_DMAF_DMAEN))
			SAEF_clrSpcFlags(SAEC_spcflag_BLTNASTY);

		if (changed & (SAEC_Custom_DMAF_DMAEN | 0x0f))
			SAER.audio.state_machine();

		if (changed & (SAEC_Custom_DMAF_DMAEN | SAEC_Custom_DMAF_BPLEN))
			SAER.playfield.set_bitplane_maybe_start_hpos(hpos);
	}

	/*---------------------------------*/

	function INTREQR() {
		return SAEV_Custom_intreq;
	}
	this.INTREQ_0 = function(v) {
		var old = SAEV_Custom_intreq;

		if (v & 0x8000) SAEV_Custom_intreq |= v & 0x7FFF; else SAEV_Custom_intreq &= ~v;

		if ((old & SAEC_Custom_INTF_RBF) && !(SAEV_Custom_intreq & SAEC_Custom_INTF_RBF))
			SAER.serial.rbf_clear();

		var old2 = intreq_internal;
		intreq_internal = SAEV_Custom_intreq;
		if (old == SAEV_Custom_intreq && old2 == intreq_internal)
			return false;
		if (v & 0x8000)
			SAER.m68k.doint();
		return true;
	}
	this.INTREQ = function(v) {
		if (this.INTREQ_0(v)) {
			if (SAEV_config.serial.enabled)
				SAER.serial.check_irq();

			SAER.devices.rethink();
		}
	}

	/*---------------------------------*/

	function INTENAR() {
		return SAEV_Custom_intena;
	}
	function INTENA(v, hpos) {
		var old = SAEV_Custom_intena;

		if (v & 0x8000) SAEV_Custom_intena |= v & 0x7FFF; else SAEV_Custom_intena &= ~v;

		if (!(v & 0x8000) && old == SAEV_Custom_intena && SAEV_Custom_intena == intena_internal)
			return;

		intena_internal = SAEV_Custom_intena;
		if (v & 0x8000)
			SAER.m68k.doint();
	}

	/*---------------------------------*/

	function ADKCONR() {
		return SAEV_Custom_adkcon;
	}
	function ADKCON(v, hpos) {
		if (SAEV_config.audio.mode != SAEC_Config_Audio_Mode_Off)
			SAER.audio.update();

		SAER.disk.update(hpos);
		SAER.disk.update_adkcon(hpos, v);

		if (v & 0x8000) SAEV_Custom_adkcon |= v & 0x7FFF; else SAEV_Custom_adkcon &= ~v;

		SAER.audio.update_adkmasks();
		//if ((v >> 11) & 1) SAER.serial.uartbreak((SAEV_Custom_adkcon >> 11) & 1); /* unused */
	}

	/*---------------------------------*/

	this.send_interrupt = function(num, delay) {
		this.INTREQ_0(SAEC_Custom_INTF_SETCLR | num);
	}

	/*---------------------------------*/

	/*
	var irq_nmi = 0;
	this.NMI_delayed = function() {
		irq_nmi = 1;
	}*/

	this.intlev = function() {
		var imask = intreq_internal & intena_internal;
		/*if (irq_nmi) {
			irq_nmi = 0;
			return 7;
		}*/
		if (imask && (intena_internal & SAEC_Custom_INTF_INTEN)) { //0x4000)) {
			if (imask & (0x4000 | 0x2000)) return 6;							// 13 14
			if (imask & (0x1000 | 0x0800)) return 5;							// 11 12
			if (imask & (0x0400 | 0x0200 | 0x0100 | 0x0080)) return 4;	// 7 8 9 10
			if (imask & (0x0040 | 0x0020 | 0x0010)) return 3;				// 4 5 6
			if (imask & 0x0008) return 2;											// 3
			if (imask & (0x0001 | 0x0002 | 0x0004)) return 1;				// 0 1 2
		}
		return -1;
	}

	/*-----------------------------------------------------------------------*/

	function get16_real(hpos, addr, noput, isbyte) {
		var v = false;

		addr &= 0xfff;
		try {
			v = readMap[(addr & 0x1fe) >> 1](hpos);
		} catch(e) {
			if (!(e instanceof Error))
				throw e;
			/* OCS/ECS:
			* reading write-only register causes write with last value in chip
			* bus (custom registers, chipram, slowram)
			* and finally returns either all ones or something weird if DMA happens
			* in next (or previous) cycle.. FIXME.
			*
			* OCS-only special case: DFF000 (BLTDDAT) will always return whatever was left in bus
			*
			* AGA:
			* Can also return last CPU accessed value
			* Remembers old SAEV_Custom_last_value
			*/
			v = SAEV_Custom_last_value;
			SAER.playfield.set_line_cyclebased();
			if (!noput) {
				var l;

				if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
					l = 0;
				} else {
					// last chip bus value (read or write) is written to register
					/*if (SAEV_config.cpu.compatible && SAEV_config.cpu.model == SAEC_Config_CPU_Model_68000) { //FIX 68000 prefetch not implemented
						if (isbyte)
							l = (SAER_CPU_regs.chipset_latch_rw << 8) | (SAER_CPU_regs.chipset_latch_rw & 0xff);
						else
							l = SAER_CPU_regs.chipset_latch_rw;
					} else
						l = SAER_CPU_regs.chipset_latch_rw;
					*/
					l = 0;
				}
				SAER.playfield.decide_line(hpos);
				SAER.playfield.decide_fetch_safe(hpos);
				var r = put16_real(hpos, addr, l, true);

				/* CPU gets back (OCS/ECS only):
				- if last cycle was DMA cycle: DMA cycle data
				- if last cycle was not DMA cycle: FFFF or some ANDed old data. */

				/*var c = SAER_Events_cycle_line[hpos] & SAEC_Events_cycle_line_MASK;
				var bmdma = SAER.playfield.is_bitplane_dma(hpos);
				if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
					if (bmdma || (c > SAEC_Events_cycle_line_REFRESH && c < SAEC_Events_cycle_line_CPU))
						v = SAEV_Custom_last_value;
					else if (c == SAEC_Events_cycle_line_CPU)
						v = SAER_CPU_regs.db;
					else
						v = SAEV_Custom_last_value >>> ((addr & 2) ? 0 : 16);
				} else {
					if (bmdma || (c > SAEC_Events_cycle_line_REFRESH && c < SAEC_Events_cycle_line_CPU))
						v = SAEV_Custom_last_value;
					else
						// refresh checked because refresh cycles do not always set SAEV_Custom_last_value for performance reasons.
						v = 0xffff;
				}*/
				var bmdma = SAER.playfield.is_bitplane_dma(hpos);
				if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
					if (bmdma)
						v = SAEV_Custom_last_value & 0xffff;
					else
						v = (SAEV_Custom_last_value >>> ((addr & 2) ? 0 : 16)) & 0xffff;
				} else {
					if (bmdma)
						v = SAEV_Custom_last_value & 0xffff;
					else
						v = 0xffff;
				}

				//SAEF_log("Custom.get16_real() %08x read = %04x. value written = %04x", 0xdff000 | addr, v, l);
				return v;
			}
		}
		return v;
	}

	function get16_2(addr, isbyte) {
		var hpos = SAER.events.current_hpos();

		SAER.copper.sync_copper_with_cpu(hpos, 1);
		//var v =
		return get16_real(hpos, addr, false, isbyte);
		/*#ifdef ACTION_REPLAY
		#ifdef ACTION_REPLAY_COMMON
		addr &= 0x1ff;
		ar_custom[addr + 0] = (uae_u8)(v >> 8);
		ar_custom[addr + 1] = (uae_u8)(v);
		#endif
		#endif
		return v;*/
	}
	function get8(addr) {
		if ((addr & 0xffff) < 0x8000 && SAEV_config.chipset.fatGaryRev >= 0)
			return SAER.memory.dummyGet(addr, 1, false, 0);

		return (get16_2(addr & ~1, true) >> (addr & 1 ? 0 : 8)) & 0xff;
	}
	function get16(addr) {
		if ((addr & 0xffff) < 0x8000 && SAEV_config.chipset.fatGaryRev >= 0)
			return SAER.memory.dummyGet(addr, 2, false, 0);

		if (addr & 1) {
			/* think about move.w $dff005,d0.. (68020+ only) */
			addr &= ~1;
			return ((get16_2(addr, false) << 8) & 0xff00) | (get16_2(addr + 2, false) >> 8);
		}
		return get16_2(addr, false);
	}
	function getInst16(addr) {
		if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68020)
			return SAEF_Memory_dummyGetInst16(addr);
		return get16(addr);
	}
	function get32(addr) {
		if ((addr & 0xffff) < 0x8000 && SAEV_config.chipset.fatGaryRev >= 0)
			return SAER.memory.dummyGet(addr, 4, false, 0);

		return ((get16(addr) << 16) | get16(addr + 2)) >>> 0;
	}
	function getInst32(addr) {
		if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68020)
			return SAEF_Memory_dummyGetInst32(addr);
		return get32(addr);
	}

	/*---------------------------------*/

	function put16_real(hpos, addr, value, noget) {
		addr &= 0x1FE;
		value &= 0xffff;

		/*#ifdef ACTION_REPLAY
		#ifdef ACTION_REPLAY_COMMON
		ar_custom[addr+0]=(uae_u8)(value>>8);
		ar_custom[addr+1]=(uae_u8)(value);
		#endif
		#endif*/

		try {
			writeMap[addr >> 1](value, hpos);
		} catch(e) {
			if (!(e instanceof Error))
				throw e;
			/* writing to read-only register causes read access */
			if (!noget) {
				//SAEF_log("Custom.put16_real() %04x written", addr);
				get16_real(hpos, addr, true, false);
			}
			return true;
		}
		return false;
	}
	SAER_Custom_put16_real = put16_real;

	function put16(addr, value) {
		var hpos = SAER.events.current_hpos();
		if ((addr & 0xffff) < 0x8000 && SAEV_config.chipset.fatGaryRev >= 0) {
			SAER.memory.dummyPut(addr, 2, value);
			return;
		}
		SAER.copper.sync_copper_with_cpu(hpos, 1);
		if (addr & 1) {
			addr &= ~1;
			put16_real(hpos, addr, (value >> 8) | (value & 0xff00), 0);
			put16_real(hpos, addr + 2, ((value << 8) & 0xff00) | (value & 0x00ff), 0);
			return;
		}
		put16_real(hpos, addr, value, 0);
	}
	function put8(addr, value) {
		if ((addr & 0xffff) < 0x8000 && SAEV_config.chipset.fatGaryRev >= 0) {
			SAER.memory.dummyPut(addr, 1, value);
			return;
		}
		var rval;
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			if (addr & 1)
				rval = value & 0xff;
			else
				rval = (value << 8) | (value & 0xff);
		} else
			rval = (value << 8) | (value & 0xff);

		/*if (currprefs.cs_bytecustomwritebug) {
			if (addr & 1)
				put16(addr & ~1, rval);
			else
				put16(addr, value << 8);
		} else*/
			put16(addr & ~1, rval);
	}
	function put32(addr, value) {
		if ((addr & 0xffff) < 0x8000 && SAEV_config.chipset.fatGaryRev >= 0) {
			SAER.memory.dummyPut(addr, 4, value);
			return;
		}
		put16(addr & 0xfffe, value >>> 16);
		put16((addr + 2) & 0xfffe, value & 0xffff);
	}

	SAEV_Custom_bank = new SAEO_Memory_addrbank(
		get32, get16, get8,
		put32, put16, put8,
		SAEF_Memory_defaultXLate, SAEF_Memory_defaultCheck, null, null, "Custom chipset",
		getInst32, getInst16,
		//SAEC_Memory_addrbank_flag_IO, S_READ, S_WRITE, null, 0x1ff, 0xdff000
		SAEC_Memory_addrbank_flag_IO, null, 0x1ff, 0xdff000
	);

	/*-----------------------------------------------------------------------*/

	function createReadMap() {
		var i;

		readMap = new Array(0x100);
		for (i = 0; i < readMap.length; i++) readMap[i] = false;

		readMap[0x002 >> 1] = DMACONR;
		readMap[0x004 >> 1] = function() { return SAER.playfield.VPOSR(); };
		readMap[0x006 >> 1] = function() { return SAER.playfield.VHPOSR(); };
		readMap[0x00A >> 1] = function() { return SAER.input.JOY0DAT(); };
		readMap[0x00C >> 1] = function() { return SAER.input.JOY1DAT(); };
		readMap[0x00E >> 1] = function() { return SAER.playfield.CLXDAT(); };
		readMap[0x010 >> 1] = ADKCONR;
		readMap[0x012 >> 1] = function() { return SAER.input.POT0DAT(); };
		readMap[0x014 >> 1] = function() { return SAER.input.POT1DAT(); };
		readMap[0x016 >> 1] = function() { return SAER.input.POTGOR(); };
		readMap[0x018 >> 1] = function() { return SAER.serial.SERDATR(); };
		readMap[0x01A >> 1] = function(hpos) { return SAER.disk.DSKBYTR(hpos); };
		readMap[0x01C >> 1] = INTENAR;
		readMap[0x01E >> 1] = INTREQR;
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE)
			readMap[0x07C >> 1] = function() { return SAER.playfield.DENISEID(); };
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			readMap[0x180 >> 1] = function() { return SAER.playfield.COLOR_READ(0); };
			readMap[0x182 >> 1] = function() { return SAER.playfield.COLOR_READ(1); };
			readMap[0x184 >> 1] = function() { return SAER.playfield.COLOR_READ(2); };
			readMap[0x186 >> 1] = function() { return SAER.playfield.COLOR_READ(3); };
			readMap[0x188 >> 1] = function() { return SAER.playfield.COLOR_READ(4); };
			readMap[0x18A >> 1] = function() { return SAER.playfield.COLOR_READ(5); };
			readMap[0x18C >> 1] = function() { return SAER.playfield.COLOR_READ(6); };
			readMap[0x18E >> 1] = function() { return SAER.playfield.COLOR_READ(7); };
			readMap[0x190 >> 1] = function() { return SAER.playfield.COLOR_READ(8); };
			readMap[0x192 >> 1] = function() { return SAER.playfield.COLOR_READ(9); };
			readMap[0x194 >> 1] = function() { return SAER.playfield.COLOR_READ(10); };
			readMap[0x196 >> 1] = function() { return SAER.playfield.COLOR_READ(11); };
			readMap[0x198 >> 1] = function() { return SAER.playfield.COLOR_READ(12); };
			readMap[0x19A >> 1] = function() { return SAER.playfield.COLOR_READ(13); };
			readMap[0x19C >> 1] = function() { return SAER.playfield.COLOR_READ(14); };
			readMap[0x19E >> 1] = function() { return SAER.playfield.COLOR_READ(15); };
			readMap[0x1A0 >> 1] = function() { return SAER.playfield.COLOR_READ(16); };
			readMap[0x1A2 >> 1] = function() { return SAER.playfield.COLOR_READ(17); };
			readMap[0x1A4 >> 1] = function() { return SAER.playfield.COLOR_READ(18); };
			readMap[0x1A6 >> 1] = function() { return SAER.playfield.COLOR_READ(19); };
			readMap[0x1A8 >> 1] = function() { return SAER.playfield.COLOR_READ(20); };
			readMap[0x1AA >> 1] = function() { return SAER.playfield.COLOR_READ(21); };
			readMap[0x1AC >> 1] = function() { return SAER.playfield.COLOR_READ(22); };
			readMap[0x1AE >> 1] = function() { return SAER.playfield.COLOR_READ(23); };
			readMap[0x1B0 >> 1] = function() { return SAER.playfield.COLOR_READ(24); };
			readMap[0x1B2 >> 1] = function() { return SAER.playfield.COLOR_READ(25); };
			readMap[0x1B4 >> 1] = function() { return SAER.playfield.COLOR_READ(26); };
			readMap[0x1B6 >> 1] = function() { return SAER.playfield.COLOR_READ(27); };
			readMap[0x1B8 >> 1] = function() { return SAER.playfield.COLOR_READ(28); };
			readMap[0x1BA >> 1] = function() { return SAER.playfield.COLOR_READ(29); };
			readMap[0x1BC >> 1] = function() { return SAER.playfield.COLOR_READ(30); };
			readMap[0x1BE >> 1] = function() { return SAER.playfield.COLOR_READ(31); };
		}
	}

	function createWriteMap() {
		var i;

		writeMap = new Array(0x100);
		for (i = 0; i < writeMap.length; i++) writeMap[i] = false;

		writeMap[0x00E >> 1] = function(value, hpos) { SAER.playfield.CLXDAT(); };
		writeMap[0x020 >> 1] = function(value, hpos) { SAER.disk.DSKPTH(value); };
		writeMap[0x022 >> 1] = function(value, hpos) { SAER.disk.DSKPTL(value); };
		writeMap[0x024 >> 1] = function(value, hpos) { SAER.disk.DSKLEN(value, hpos); };
		writeMap[0x026 >> 1] = function(value, hpos) { /* SAER.disk.DSKDAT(value); */ };
		writeMap[0x028 >> 1] = function(value, hpos) { SAER.playfield.REFPTR(value); };
		writeMap[0x02A >> 1] = function(value, hpos) { SAER.playfield.VPOSW(value); };
		writeMap[0x02C >> 1] = function(value, hpos) { SAER.playfield.VHPOSW(value); };
		writeMap[0x02E >> 1] = function(value, hpos) { SAER.copper.COPCON(value); };
		writeMap[0x030 >> 1] = function(value, hpos) { SAER.serial.SERDAT(value); };
		writeMap[0x032 >> 1] = function(value, hpos) { SAER.serial.SERPER(value); };
		writeMap[0x034 >> 1] = function(value, hpos) { SAER.input.POTGO(value); };
		writeMap[0x036 >> 1] = function(value, hpos) { SAER.input.JOYTEST(value); };
		/*			038 	STREQU 	S 	* 	* 	* 	Strobe for horiz sync with VB and EQU
					03A 	STRVBL 	S 	* 	* 	* 	Strobe for horiz sync with VB (vert blank)
					03C 	STRHOR 	S 	* 	* 	* 	Strobe for horiz sync
					03E 	STRLONG 	S 	* 	* 	* 	Strobe for identification of long horiz line*/
		writeMap[0x040 >> 1] = function(value, hpos) { SAER.blitter.BLTCON0(hpos, value); };
		writeMap[0x042 >> 1] = function(value, hpos) { SAER.blitter.BLTCON1(hpos, value); };
		writeMap[0x044 >> 1] = function(value, hpos) { SAER.blitter.BLTAFWM(hpos, value); };
		writeMap[0x046 >> 1] = function(value, hpos) { SAER.blitter.BLTALWM(hpos, value); };
		writeMap[0x048 >> 1] = function(value, hpos) { SAER.blitter.BLTCPTH(hpos, value); };
		writeMap[0x04A >> 1] = function(value, hpos) { SAER.blitter.BLTCPTL(hpos, value); };
		writeMap[0x04C >> 1] = function(value, hpos) { SAER.blitter.BLTBPTH(hpos, value); };
		writeMap[0x04E >> 1] = function(value, hpos) { SAER.blitter.BLTBPTL(hpos, value); };
		writeMap[0x050 >> 1] = function(value, hpos) { SAER.blitter.BLTAPTH(hpos, value); };
		writeMap[0x052 >> 1] = function(value, hpos) { SAER.blitter.BLTAPTL(hpos, value); };
		writeMap[0x054 >> 1] = function(value, hpos) { SAER.blitter.BLTDPTH(hpos, value); };
		writeMap[0x056 >> 1] = function(value, hpos) { SAER.blitter.BLTDPTL(hpos, value); };
		writeMap[0x058 >> 1] = function(value, hpos) { SAER.blitter.BLTSIZE(hpos, value); };
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) {
			writeMap[0x05A >> 1] = function(value, hpos) { SAER.blitter.BLTCON0L(hpos, value); };
			writeMap[0x05C >> 1] = function(value, hpos) { SAER.blitter.BLTSIZV(hpos, value); };
			writeMap[0x05E >> 1] = function(value, hpos) { SAER.blitter.BLTSIZH(hpos, value); };
		}
		writeMap[0x060 >> 1] = function(value, hpos) { SAER.blitter.BLTCMOD(hpos, value); };
		writeMap[0x062 >> 1] = function(value, hpos) { SAER.blitter.BLTBMOD(hpos, value); };
		writeMap[0x064 >> 1] = function(value, hpos) { SAER.blitter.BLTAMOD(hpos, value); };
		writeMap[0x066 >> 1] = function(value, hpos) { SAER.blitter.BLTDMOD(hpos, value); };
		/* - */
		writeMap[0x070 >> 1] = function(value, hpos) { SAER.blitter.BLTCDAT(hpos, value); };
		writeMap[0x072 >> 1] = function(value, hpos) { SAER.blitter.BLTBDAT(hpos, value); };
		writeMap[0x074 >> 1] = function(value, hpos) { SAER.blitter.BLTADAT(hpos, value); };
		/*if (SAEV_config.chipset.mask & (SAEC_Config_Chipset_Mask_ECS_AGNUS | SAEC_Config_Chipset_Mask_ECS_DENISE)) {
					078 	SPRHDAT 	W 		* 	* 	Ext. logic UHRES sprite pointer and data identifier
					07A 	BPLHDAT 	W 		* 	* 	Ext. logic UHRES bit plane identifier
		}*/
		writeMap[0x07E >> 1] = function(value, hpos) { SAER.disk.DSKSYNC(hpos, value); };
		writeMap[0x080 >> 1] = function(value, hpos) { SAER.copper.COP1LCH(value); };
		writeMap[0x082 >> 1] = function(value, hpos) { SAER.copper.COP1LCL(value); };
		writeMap[0x084 >> 1] = function(value, hpos) { SAER.copper.COP2LCH(value); };
		writeMap[0x086 >> 1] = function(value, hpos) { SAER.copper.COP2LCL(value); };
		writeMap[0x088 >> 1] = function(value, hpos) { SAER.copper.COPJMP(1, 0); };
		writeMap[0x08A >> 1] = function(value, hpos) { SAER.copper.COPJMP(2, 0); };
		writeMap[0x08E >> 1] = function(value, hpos) { SAER.playfield.DIWSTRT(hpos, value); };
		writeMap[0x090 >> 1] = function(value, hpos) { SAER.playfield.DIWSTOP(hpos, value); };
		writeMap[0x092 >> 1] = function(value, hpos) { SAER.playfield.DDFSTRT(hpos, value); };
		writeMap[0x094 >> 1] = function(value, hpos) { SAER.playfield.DDFSTOP(hpos, value); };
		writeMap[0x096 >> 1] = DMACON;
		writeMap[0x098 >> 1] = function(value, hpos) { SAER.playfield.CLXCON(value); };
		writeMap[0x09A >> 1] = INTENA;
		writeMap[0x09C >> 1] = function(value, hpos) { SAER.custom.INTREQ(value); };
		writeMap[0x09E >> 1] = ADKCON;
		writeMap[0x0A0 >> 1] = function(value, hpos) { SAER.audio.AUDxLCH(0, value); };
		writeMap[0x0A2 >> 1] = function(value, hpos) { SAER.audio.AUDxLCL(0, value); };
		writeMap[0x0A4 >> 1] = function(value, hpos) { SAER.audio.AUDxLEN(0, value); };
		writeMap[0x0A6 >> 1] = function(value, hpos) { SAER.audio.AUDxPER(0, value); };
		writeMap[0x0A8 >> 1] = function(value, hpos) { SAER.audio.AUDxVOL(0, value); };
		writeMap[0x0AA >> 1] = function(value, hpos) { SAER.audio.AUDxDAT(0, value); };
		writeMap[0x0B0 >> 1] = function(value, hpos) { SAER.audio.AUDxLCH(1, value); };
		writeMap[0x0B2 >> 1] = function(value, hpos) { SAER.audio.AUDxLCL(1, value); };
		writeMap[0x0B4 >> 1] = function(value, hpos) { SAER.audio.AUDxLEN(1, value); };
		writeMap[0x0B6 >> 1] = function(value, hpos) { SAER.audio.AUDxPER(1, value); };
		writeMap[0x0B8 >> 1] = function(value, hpos) { SAER.audio.AUDxVOL(1, value); };
		writeMap[0x0BA >> 1] = function(value, hpos) { SAER.audio.AUDxDAT(1, value); };
		writeMap[0x0C0 >> 1] = function(value, hpos) { SAER.audio.AUDxLCH(2, value); };
		writeMap[0x0C2 >> 1] = function(value, hpos) { SAER.audio.AUDxLCL(2, value); };
		writeMap[0x0C4 >> 1] = function(value, hpos) { SAER.audio.AUDxLEN(2, value); };
		writeMap[0x0C6 >> 1] = function(value, hpos) { SAER.audio.AUDxPER(2, value); };
		writeMap[0x0C8 >> 1] = function(value, hpos) { SAER.audio.AUDxVOL(2, value); };
		writeMap[0x0CA >> 1] = function(value, hpos) { SAER.audio.AUDxDAT(2, value); };
		writeMap[0x0D0 >> 1] = function(value, hpos) { SAER.audio.AUDxLCH(3, value); };
		writeMap[0x0D2 >> 1] = function(value, hpos) { SAER.audio.AUDxLCL(3, value); };
		writeMap[0x0D4 >> 1] = function(value, hpos) { SAER.audio.AUDxLEN(3, value); };
		writeMap[0x0D6 >> 1] = function(value, hpos) { SAER.audio.AUDxPER(3, value); };
		writeMap[0x0D8 >> 1] = function(value, hpos) { SAER.audio.AUDxVOL(3, value); };
		writeMap[0x0DA >> 1] = function(value, hpos) { SAER.audio.AUDxDAT(3, value); };
		writeMap[0x0E0 >> 1] = function(value, hpos) { SAER.playfield.BPLxPTH(hpos, value, 0); };
		writeMap[0x0E2 >> 1] = function(value, hpos) { SAER.playfield.BPLxPTL(hpos, value, 0); };
		writeMap[0x0E4 >> 1] = function(value, hpos) { SAER.playfield.BPLxPTH(hpos, value, 1); };
		writeMap[0x0E6 >> 1] = function(value, hpos) { SAER.playfield.BPLxPTL(hpos, value, 1); };
		writeMap[0x0E8 >> 1] = function(value, hpos) { SAER.playfield.BPLxPTH(hpos, value, 2); };
		writeMap[0x0EA >> 1] = function(value, hpos) { SAER.playfield.BPLxPTL(hpos, value, 2); };
		writeMap[0x0EC >> 1] = function(value, hpos) { SAER.playfield.BPLxPTH(hpos, value, 3); };
		writeMap[0x0EE >> 1] = function(value, hpos) { SAER.playfield.BPLxPTL(hpos, value, 3); };
		writeMap[0x0F0 >> 1] = function(value, hpos) { SAER.playfield.BPLxPTH(hpos, value, 4); };
		writeMap[0x0F2 >> 1] = function(value, hpos) { SAER.playfield.BPLxPTL(hpos, value, 4); };
		writeMap[0x0F4 >> 1] = function(value, hpos) { SAER.playfield.BPLxPTH(hpos, value, 5); };
		writeMap[0x0F6 >> 1] = function(value, hpos) { SAER.playfield.BPLxPTL(hpos, value, 5); };
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			writeMap[0x0F8 >> 1] = function(value, hpos) { SAER.playfield.BPLxPTH(hpos, value, 6); };
			writeMap[0x0FA >> 1] = function(value, hpos) { SAER.playfield.BPLxPTL(hpos, value, 6); };
			writeMap[0x0FC >> 1] = function(value, hpos) { SAER.playfield.BPLxPTH(hpos, value, 7); };
			writeMap[0x0FE >> 1] = function(value, hpos) { SAER.playfield.BPLxPTL(hpos, value, 7); };
		}
		writeMap[0x100 >> 1] = function(value, hpos) { SAER.playfield.BPLCON0(hpos, value); };
		writeMap[0x102 >> 1] = function(value, hpos) { SAER.playfield.BPLCON1(hpos, value); };
		writeMap[0x104 >> 1] = function(value, hpos) { SAER.playfield.BPLCON2(hpos, value); };
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE)
			writeMap[0x106 >> 1] = function(value, hpos) { SAER.playfield.BPLCON3(hpos, value); };
		writeMap[0x108 >> 1] = function(value, hpos) { SAER.playfield.BPL1MOD(hpos, value); };
		writeMap[0x10A >> 1] = function(value, hpos) { SAER.playfield.BPL2MOD(hpos, value); };
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			writeMap[0x10C >> 1] = function(value, hpos) { SAER.playfield.BPLCON4(hpos, value); };
			writeMap[0x10E >> 1] = function(value, hpos) { SAER.playfield.CLXCON2(value); };
		}
		writeMap[0x110 >> 1] = function(value, hpos) { SAER.playfield.BPLxDAT(hpos, 0, value); };
		writeMap[0x112 >> 1] = function(value, hpos) { SAER.playfield.BPLxDAT(hpos, 1, value); };
		writeMap[0x114 >> 1] = function(value, hpos) { SAER.playfield.BPLxDAT(hpos, 2, value); };
		writeMap[0x116 >> 1] = function(value, hpos) { SAER.playfield.BPLxDAT(hpos, 3, value); };
		writeMap[0x118 >> 1] = function(value, hpos) { SAER.playfield.BPLxDAT(hpos, 4, value); };
		writeMap[0x11A >> 1] = function(value, hpos) { SAER.playfield.BPLxDAT(hpos, 5, value); };
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			writeMap[0x11C >> 1] = function(value, hpos) { SAER.playfield.BPLxDAT(hpos, 6, value); };
			writeMap[0x11E >> 1] = function(value, hpos) { SAER.playfield.BPLxDAT(hpos, 7, value); };
		}
		writeMap[0x120 >> 1] = function(value, hpos) { SAER.playfield.SPRxPTH(hpos, value, 0); };
		writeMap[0x122 >> 1] = function(value, hpos) { SAER.playfield.SPRxPTL(hpos, value, 0); };
		writeMap[0x124 >> 1] = function(value, hpos) { SAER.playfield.SPRxPTH(hpos, value, 1); };
		writeMap[0x126 >> 1] = function(value, hpos) { SAER.playfield.SPRxPTL(hpos, value, 1); };
		writeMap[0x128 >> 1] = function(value, hpos) { SAER.playfield.SPRxPTH(hpos, value, 2); };
		writeMap[0x12A >> 1] = function(value, hpos) { SAER.playfield.SPRxPTL(hpos, value, 2); };
		writeMap[0x12C >> 1] = function(value, hpos) { SAER.playfield.SPRxPTH(hpos, value, 3); };
		writeMap[0x12E >> 1] = function(value, hpos) { SAER.playfield.SPRxPTL(hpos, value, 3); };
		writeMap[0x130 >> 1] = function(value, hpos) { SAER.playfield.SPRxPTH(hpos, value, 4); };
		writeMap[0x132 >> 1] = function(value, hpos) { SAER.playfield.SPRxPTL(hpos, value, 4); };
		writeMap[0x134 >> 1] = function(value, hpos) { SAER.playfield.SPRxPTH(hpos, value, 5); };
		writeMap[0x136 >> 1] = function(value, hpos) { SAER.playfield.SPRxPTL(hpos, value, 5); };
		writeMap[0x138 >> 1] = function(value, hpos) { SAER.playfield.SPRxPTH(hpos, value, 6); };
		writeMap[0x13A >> 1] = function(value, hpos) { SAER.playfield.SPRxPTL(hpos, value, 6); };
		writeMap[0x13C >> 1] = function(value, hpos) { SAER.playfield.SPRxPTH(hpos, value, 7); };
		writeMap[0x13E >> 1] = function(value, hpos) { SAER.playfield.SPRxPTL(hpos, value, 7); };
		writeMap[0x140 >> 1] = function(value, hpos) { SAER.playfield.SPRxPOS(hpos, value, 0); };
		writeMap[0x142 >> 1] = function(value, hpos) { SAER.playfield.SPRxCTL(hpos, value, 0); };
		writeMap[0x144 >> 1] = function(value, hpos) { SAER.playfield.SPRxDATA(hpos, value, 0); };
		writeMap[0x146 >> 1] = function(value, hpos) { SAER.playfield.SPRxDATB(hpos, value, 0); };
		writeMap[0x148 >> 1] = function(value, hpos) { SAER.playfield.SPRxPOS(hpos, value, 1); };
		writeMap[0x14A >> 1] = function(value, hpos) { SAER.playfield.SPRxCTL(hpos, value, 1); };
		writeMap[0x14C >> 1] = function(value, hpos) { SAER.playfield.SPRxDATA(hpos, value, 1); };
		writeMap[0x14E >> 1] = function(value, hpos) { SAER.playfield.SPRxDATB(hpos, value, 1); };
		writeMap[0x150 >> 1] = function(value, hpos) { SAER.playfield.SPRxPOS(hpos, value, 2); };
		writeMap[0x152 >> 1] = function(value, hpos) { SAER.playfield.SPRxCTL(hpos, value, 2); };
		writeMap[0x154 >> 1] = function(value, hpos) { SAER.playfield.SPRxDATA(hpos, value, 2); };
		writeMap[0x156 >> 1] = function(value, hpos) { SAER.playfield.SPRxDATB(hpos, value, 2); };
		writeMap[0x158 >> 1] = function(value, hpos) { SAER.playfield.SPRxPOS(hpos, value, 3); };
		writeMap[0x15A >> 1] = function(value, hpos) { SAER.playfield.SPRxCTL(hpos, value, 3); };
		writeMap[0x15C >> 1] = function(value, hpos) { SAER.playfield.SPRxDATA(hpos, value, 3); };
		writeMap[0x15E >> 1] = function(value, hpos) { SAER.playfield.SPRxDATB(hpos, value, 3); };
		writeMap[0x160 >> 1] = function(value, hpos) { SAER.playfield.SPRxPOS(hpos, value, 4); };
		writeMap[0x162 >> 1] = function(value, hpos) { SAER.playfield.SPRxCTL(hpos, value, 4); };
		writeMap[0x164 >> 1] = function(value, hpos) { SAER.playfield.SPRxDATA(hpos, value, 4); };
		writeMap[0x166 >> 1] = function(value, hpos) { SAER.playfield.SPRxDATB(hpos, value, 4); };
		writeMap[0x168 >> 1] = function(value, hpos) { SAER.playfield.SPRxPOS(hpos, value, 5); };
		writeMap[0x16A >> 1] = function(value, hpos) { SAER.playfield.SPRxCTL(hpos, value, 5); };
		writeMap[0x16C >> 1] = function(value, hpos) { SAER.playfield.SPRxDATA(hpos, value, 5); };
		writeMap[0x16E >> 1] = function(value, hpos) { SAER.playfield.SPRxDATB(hpos, value, 5); };
		writeMap[0x170 >> 1] = function(value, hpos) { SAER.playfield.SPRxPOS(hpos, value, 6); };
		writeMap[0x172 >> 1] = function(value, hpos) { SAER.playfield.SPRxCTL(hpos, value, 6); };
		writeMap[0x174 >> 1] = function(value, hpos) { SAER.playfield.SPRxDATA(hpos, value, 6); };
		writeMap[0x176 >> 1] = function(value, hpos) { SAER.playfield.SPRxDATB(hpos, value, 6); };
		writeMap[0x178 >> 1] = function(value, hpos) { SAER.playfield.SPRxPOS(hpos, value, 7); };
		writeMap[0x17A >> 1] = function(value, hpos) { SAER.playfield.SPRxCTL(hpos, value, 7); };
		writeMap[0x17C >> 1] = function(value, hpos) { SAER.playfield.SPRxDATA(hpos, value, 7); };
		writeMap[0x17E >> 1] = function(value, hpos) { SAER.playfield.SPRxDATB(hpos, value, 7); };
		writeMap[0x180 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 0); };
		writeMap[0x182 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 1); };
		writeMap[0x184 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 2); };
		writeMap[0x186 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 3); };
		writeMap[0x188 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 4); };
		writeMap[0x18A >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 5); };
		writeMap[0x18C >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 6); };
		writeMap[0x18E >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 7); };
		writeMap[0x190 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 8); };
		writeMap[0x192 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 9); };
		writeMap[0x194 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 10); };
		writeMap[0x196 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 11); };
		writeMap[0x198 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 12); };
		writeMap[0x19A >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 13); };
		writeMap[0x19C >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 14); };
		writeMap[0x19E >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 15); };
		writeMap[0x1A0 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 16); };
		writeMap[0x1A2 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 17); };
		writeMap[0x1A4 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 18); };
		writeMap[0x1A6 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 19); };
		writeMap[0x1A8 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 20); };
		writeMap[0x1AA >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 21); };
		writeMap[0x1AC >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 22); };
		writeMap[0x1AE >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 23); };
		writeMap[0x1B0 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 24); };
		writeMap[0x1B2 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 25); };
		writeMap[0x1B4 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 26); };
		writeMap[0x1B6 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 27); };
		writeMap[0x1B8 >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 28); };
		writeMap[0x1BA >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 29); };
		writeMap[0x1BC >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 30); };
		writeMap[0x1BE >> 1] = function(value, hpos) { SAER.playfield.COLOR_WRITE(hpos, value & 0xfff, 31); };
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) {
			writeMap[0x1C0 >> 1] = function(value, hpos) { SAER.playfield.HTOTAL(value); };
			writeMap[0x1C2 >> 1] = function(value, hpos) { SAER.playfield.HSSTOP(value); };
			writeMap[0x1C4 >> 1] = function(value, hpos) { SAER.playfield.HBSTRT(value); };
			writeMap[0x1C6 >> 1] = function(value, hpos) { SAER.playfield.HBSTOP(value); };
			writeMap[0x1C8 >> 1] = function(value, hpos) { SAER.playfield.VTOTAL(value); };
			writeMap[0x1CA >> 1] = function(value, hpos) { SAER.playfield.VSSTOP(value); };
			writeMap[0x1CC >> 1] = function(value, hpos) { SAER.playfield.VBSTRT(value); };
			writeMap[0x1CE >> 1] = function(value, hpos) { SAER.playfield.VBSTOP(value); };
		/*			1D0 	SPRHSTRT 	W 		* 	* 	UHRES sprite vertical start
					1D2 	SPRHSTOP 	W 		* 	* 	UHRES sprite vertical stop
					1D4 	BPLHSTRT 	W 		* 	* 	UHRES bit plane vertical start
					1D6 	BPLHSTOP 	W 		* 	* 	UHRES bit plane vertical stop
					1D8 	HHPOSW 	W 		* 	* 	DUAL mode hires H beam counter write
					1DA 	HHPOSR 	R 		* 	* 	DUAL mode hires H beam counter read*/
			writeMap[0x1DC >> 1] = function(value, hpos) { SAER.playfield.BEAMCON0(value); };
			writeMap[0x1DE >> 1] = function(value, hpos) { SAER.playfield.HSSTRT(value); };
			writeMap[0x1E0 >> 1] = function(value, hpos) { SAER.playfield.VSSTRT(value); };
			writeMap[0x1E2 >> 1] = function(value, hpos) { SAER.playfield.HCENTER(value); };
		}
		if (SAEV_config.chipset.mask & (SAEC_Config_Chipset_Mask_ECS_AGNUS | SAEC_Config_Chipset_Mask_ECS_DENISE))
			writeMap[0x1E4 >> 1] = function(value, hpos) { SAER.playfield.DIWHIGH(hpos, value); };
		/*			1E6 	BPLHMOD 	W 		* 	* 	UHRES bit plane modulo
					1E8 	SPRHPTH 	W 		* 	* 	UHRES sprite pointer (high 5 bits)
					1EA 	SPRHPTL 	W 		* 	* 	UHRES sprite pointer (low 15 bits)
					1EC 	BPLHPTH 	W 		* 	* 	VRam (UHRES) bitplane pointer (hi 5 bits)
					1EE 	BPLHPTL 	W 		* 	* 	VRam (UHRES) bitplane pointer (lo 15 bits)
		*/
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA)
			writeMap[0x1FC >> 1] = function(value, hpos) { SAER.playfield.FMODE(hpos, value); };

		writeMap[0x1FE >> 1] = function(value, hpos) { SAER.playfield.FNULL(value); };
	}
}

/*-----------------------------------------------------------------------*/

function SAEO_Devices() {
	this.virtualdevice_init = function() {
		//#ifdef AUTOCONFIG
		SAER.autoconf.init(); //rtarea_setup
		//#endif
		//#ifdef FILESYS
		SAER.autoconf.setup(); //rtarea_init
		/*uaeres_install();
		hardfile_install();
		#endif
		#ifdef AUTOCONFIG*/
		SAER.expansion.setup();
		/*emulib_install();
		uaeexe_install();
		#endif
		#ifdef FILESYS
		filesys_install();
		#endif
		#ifdef CDTV
		cdtvcr_reset();
		#endif*/
	}

	this.reset = function(hardreset) {
		SAER.gayle.reset(hardreset);
		//idecontroller_reset();
		SAER.memory.a1000_reset();
		SAER.disk.reset();
		SAER.cia.reset();
		SAER.gayle.reset(0);
		/*#ifdef WITH_TOCCATA
		sndboard_reset();
		#endif*/
		//#ifdef AUTOCONFIG
		SAER.expansion.reset();
		SAER.autoconf.reset();
		//#endif
	}

	this.vsync_pre = function() {
		//SAER.audio.vsync(); empty
		SAER.cia.vsync();
		SAER.input.vsync(); //inputdevice_vsync() EMPTY
		/*filesys_vsync();
		sampler_vsync();
		clipboard_vsync();
		#ifdef RETROPLATFORM
		rp_vsync();
		#endif
		#ifdef CD32
		cd32_fmv_vsync_handler();
		#endif
		statusline_vsync();
		*/
	}

	this.vsync_post = function() {
		/*#ifdef WITH_TOCCATA
		sndboard_vsync();
		#endif*/
	}

	this.hsync = function(onvsync) {
		/*#ifdef CD32
		AKIKO_hsync_handler();
		cd32_fmv_hsync_handler();
		#endif
		#ifdef CDTV
		CDTV_hsync_handler();
		CDTVCR_hsync_handler();
		#endif*/
		SAER.blitter.decide_blitter(-1);
		/*#ifdef PICASSO96
		picasso_handle_hsync();
		#endif
		#ifdef WITH_TOCCATA
		sndboard_hsync();
		#endif*/
		SAER.disk.hsync();
		if (SAEV_config.audio.mode != SAEC_Config_Audio_Mode_Off)
			SAER.audio.hsync();

		//SAER.cia.hsync(); //OWN empty
		if (SAEV_config.serial.enabled)
			SAER.serial.hsync();
		if (SAEV_config.chipset.ide >= 0 || SAEV_config.chipset.pcmcia) //OWN ATT
			SAER.gayle.hsync();
		//idecontroller_hsync();
	}

	this.rethink = function() {
		SAER.cia.rethink();
		/*#ifdef CDTV
		rethink_cdtv();
		rethink_cdtvcr();
		#endif
		#ifdef CD32
		rethink_akiko();
		rethink_cd32fmv();
		#endif
		#ifdef WITH_TOCCATA
		sndboard_rethink();
		#endif*/
		SAER.gayle.rethink();
		//idecontroller_rethink();
		//SAER.autoconf.rethink_traps(); //empty
	}

	this.update_sound = function(clk, syncadjust) {
		SAER.audio.update_sound(clk);
		//update_sndboard_sound (clk / syncadjust);
		//update_cda_sound(clk / syncadjust);
	}

	/*this.update_sync = function(svpos, syncadjust) {
		cd32_fmv_set_sync(svpos, syncadjust);
	}*/
}
