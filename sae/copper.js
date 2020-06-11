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
/* global references */

var SAER_Copper_cop_state = null;

/*---------------------------------*/
/* global variables */

var SAEV_Copper_access = false;
var SAEV_Copper_last_hpos = 0;
var SAEV_Copper_enabled_thisline = 0;

/*---------------------------------*/

function SAEO_Copper() {
	const customdelay = [
		1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,1,1,1,0,0,0,0,0,0,0,0, /* 32 0x00 - 0x3e */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, /* 0x40 - 0x5e */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, /* 0x60 - 0x7e */
		0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0, /* 0x80 - 0x9e */
		1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, /* 32 0xa0 - 0xde */
		/* BPLxPTH/BPLxPTL */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, /* 16 */
		/* BPLCON0-3,BPLMOD1-2 */
		0,0,0,0,0,0,0,0, /* 8 */
		/* BPLxDAT */
		0,0,0,0,0,0,0,0, /* 8 */
		/* SPRxPTH/SPRxPTL */
		1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, /* 16 */
		/* SPRxPOS/SPRxCTL/SPRxDATA/SPRxDATB */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
		/* COLORxx */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
		/* RESERVED */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	];

	const COP_stop = 0;
	const COP_waitforever = 1;
	const COP_read1 = 2;
	const COP_read2 = 3;
	const COP_bltwait = 4;
	const COP_wait_in2 = 5;
	const COP_skip_in2 = 6;
	const COP_wait1 = 7;
	const COP_wait = 8;
	const COP_skip1 = 9;
	const COP_strobe_delay1 = 10;
	const COP_strobe_delay2 = 11;
	const COP_strobe_delay1x = 12;
	const COP_strobe_delay2x = 13;
	const COP_strobe_extra = 14; /* just to skip current cycle when CPU wrote to COPJMP */
	const COP_start_delay = 15;

	function copper_state() {
		this.i1 = 0; this.saved_i1 = 0; /* The current instruction words. */
		this.i2 = 0; this.saved_i2 = 0;
		this.state = COP_stop;
		this.state_prev = COP_stop;
		this.ip = 0; this.saved_ip = 0; /* Instruction pointer */
		this.hpos = 0;
		this.vpos = 0;
		this.ignore_next = false;
		this.vcmp = 0;
		this.hcmp = 0;
		this.strobe = 0; /* COPJMP1 / COPJMP2 accessed */
		this.moveaddr = 0;
		this.movedata = 0;
		this.movedelay = 0;
	};

	var cop_state = new copper_state();
	SAER_Copper_cop_state = cop_state;

	var cop1lc = 0, cop2lc = 0, copcon = 0;

	//var last_copper_hpos = 0; -> SAEV_Copper_last_hpos
	//var copper_access = false; -> SAEV_Copper_access
	//var copper_enabled_thisline = 0; -> SAEV_Copper_enabled_thisline

	/*-----------------------------------------------------------------------*/

	this.reset = function() {
		copcon = 0;
		cop_state.state = COP_stop;
		cop_state.movedelay = 0;
		cop_state.strobe = 0;
		cop_state.ignore_next = false;
	}

	/*-----------------------------------------------------------------------*/

	this.clr_copcon = function() { //OWN used in playfield.reset_cutom()
		copcon = 0;
	}
	/*this.get_copxlc = function() { //OWN used in events.alloc_cycle_blitter()
		return cop_state.strobe == 1 ? cop1lc : cop2lc;
	}*/

	/*this.get_copper_address = function(copno) {
		switch (copno) {
			case 1: return cop1lc;
			case 2: return cop2lc;
			case -1: return cop_state.ip;
			default: return 0;
		}
	}*/

	this.copper_stop = function() { //called in custom.DMACON()
		if (SAEV_Copper_enabled_thisline) {
			// let MOVE to finish
			switch (cop_state.state) {
				case COP_read2:
					SAEV_Copper_enabled_thisline = -1;
					break;
			}
		}
		if (SAEV_Copper_enabled_thisline >= 0) {
			SAEV_Copper_enabled_thisline = 0;
			SAEF_clrSpcFlags(SAEC_spcflag_COPPER);
		}
	}

	function check_copper_stop() {
		//if (SAEV_Copper_enabled_thisline < 0 && !((SAEV_Custom_dmacon & SAEC_Custom_DMAF_COPEN) && (SAEV_Custom_dmacon & SAEC_Custom_DMAF_DMAEN))) {
		if (SAEV_Copper_enabled_thisline < 0 && !SAEF_Custom_dmaen(SAEC_Custom_DMAF_COPEN)) {
			SAEV_Copper_enabled_thisline = 0;
			SAEF_clrSpcFlags(SAEC_spcflag_COPPER);
		}
	}

	/*-> playfield
	function copper_cant_read(hpos, alloc) {
		if (hpos + 1 >= maxhpos) // first refresh slot
			return 1;
		if ((hpos == maxhpos - 3) && (maxhpos & 1) && alloc >= 0) {
			//if (alloc) SAER.events.alloc_cycle(hpos, SAEC_Events_cycle_line_COPPER);
			return -1;
		}
		return is_bitplane_dma_inline(hpos);
	}*/

	function put16_copper(hpos, addr, value, noget) {
		SAEV_Copper_access = true;
		//var v = custom_wput_1(hpos, addr, value, noget);
		var v = SAER_Custom_put16_real(hpos, addr, value, noget);
		SAEV_Copper_access = false;
		return v;
	}

	/*function dump(error, until_hpos) {
		SAEF_log("copper.dump() %s: vpos=%d until_hpos=%d vp=%d", error, vpos, until_hpos, vpos & (((cop_state.saved_i2 >> 8) & 0x7F) | 0x80));
		SAEF_log("copper.dump() cvcmp=%d chcmp=%d chpos=%d cvpos=%d ci1=%04X ci2=%04X", cop_state.vcmp, cop_state.hcmp, cop_state.hpos, cop_state.vpos, cop_state.saved_i1, cop_state.saved_i2);
		SAEF_log("copper.dump() cstate=%d ip=%x SPCFLAGS=%x iscline=%d", cop_state.state, cop_state.ip, SAEV_spcflags, SAEV_Copper_enabled_thisline);
	}*/

	function update_copper(until_hpos) {
		var vp = SAER.playfield.get_vpos() & (((cop_state.saved_i2 >> 8) & 0x7F) | 0x80);
		var c_hpos = cop_state.hpos;
		var maxhpos;

		//if (nocustom()) return;

		if (cop_state.state == COP_wait && vp < cop_state.vcmp) {
			//dump("error2", until_hpos);
			SAEV_Copper_enabled_thisline = 0;
			cop_state.state = COP_stop;
			SAEF_clrSpcFlags(SAEC_spcflag_COPPER);
			return;
		}

		if (until_hpos <= SAEV_Copper_last_hpos)
			return;

		maxhpos = SAER.playfield.get_maxhpos();
		if (until_hpos > (maxhpos & ~1))
			until_hpos = maxhpos & ~1;

		for (;;) {
			var old_hpos = c_hpos;
			var hp;

			if (c_hpos >= until_hpos)
				break;


			/* So we know about the fetch state.  */
			SAER.playfield.decide_line(c_hpos);
			// bitplane only, don't want blitter to steal our cycles.
			SAER.playfield.decide_fetch(c_hpos);

			if (cop_state.movedelay > 0) {
				cop_state.movedelay--;
				if (cop_state.movedelay == 0) {
					put16_copper(c_hpos, cop_state.moveaddr, cop_state.movedata, 0);
				}
			}

			maxhpos = SAER.playfield.get_maxhpos();
			if ((c_hpos == maxhpos - 3) && (maxhpos & 1))
				c_hpos += 1;
			else
				c_hpos += 2;

			switch (cop_state.state) {
				case COP_wait_in2: {
					if (SAER.playfield.copper_cant_read(old_hpos, 0))
						continue;
					cop_state.state = COP_wait1;
					break;
				}
				case COP_skip_in2: {
					if (SAER.playfield.copper_cant_read(old_hpos, 0))
						continue;
					cop_state.state = COP_skip1;
					break;
				}
				case COP_strobe_extra: {
					// Wait 1 copper cycle doing nothing
					cop_state.state = COP_strobe_delay1;
					break;
				}
				case COP_strobe_delay1: {
					// First cycle after COPJMP is just like normal first read cycle
					// Cycle is used and needs to be free.
					if (SAER.playfield.copper_cant_read(old_hpos, 1))
						continue;
					//SAER.events.alloc_cycle(old_hpos, SAEC_Events_cycle_line_COPPER);
					maxhpos = SAER.playfield.get_maxhpos();
					if (old_hpos == maxhpos - 2) {
						// if COP_strobe_delay2 would cross scanlines (positioned immediately
						// after first strobe/refresh slot) it will disappear!
						cop_state.state = COP_read1;
						if (cop_state.strobe == 1)
							cop_state.ip = cop1lc;
						else
							cop_state.ip = cop2lc;
						cop_state.strobe = 0;
					} else {
						cop_state.state = COP_strobe_delay2;
						cop_state.ip += 2;
					}
					break;
				}
				case COP_strobe_delay2: {
					// Second cycle after COPJMP. This is the strange one.
					// This cycle does not need to be free
					// But it still gets allocated by copper if it is free = CPU and blitter can't use it.
					//if (!SAER.playfield.copper_cant_read(old_hpos, 0)) SAER.events.alloc_cycle(old_hpos, SAEC_Events_cycle_line_COPPER);

					cop_state.state = COP_read1;
					// Next cycle finally reads from new pointer
					if (cop_state.strobe == 1)
						cop_state.ip = cop1lc;
					else
						cop_state.ip = cop2lc;
					cop_state.strobe = 0;
					break;
				}
				case COP_strobe_delay1x: {
					// First cycle after COPJMP and Copper was waiting. This is the buggy one.
					// Cycle can be free and copper won"t allocate it.
					// If Blitter uses this cycle = Copper"s PC gets copied to blitter DMA pointer..
					cop_state.state = COP_strobe_delay2x;
					break;
				}
				case COP_strobe_delay2x: {
					// Second cycle fetches following word and tosses it away. Must be free cycle
					// but it is not allocated, blitter or cpu can still use it.
					if (SAER.playfield.copper_cant_read(old_hpos, 1))
						continue;
					//SAER_Events_cycle_line[old_hpos] |= SAEC_Events_cycle_line_COPPER_SPECIAL;
					cop_state.state = COP_read1;
					// Next cycle finally reads from new pointer
					if (cop_state.strobe == 1)
						cop_state.ip = cop1lc;
					else
						cop_state.ip = cop2lc;
					cop_state.strobe = 0;
					break;
				}
				case COP_start_delay: {
					// cycle after vblank strobe fetches word from old pointer first
					if (SAER.playfield.copper_cant_read(old_hpos, 1))
						continue;
					cop_state.state = COP_read1;
					//cop_state.i1 = SAEV_Custom_last_value = SAER_Memory_chipGet16_indirect(cop_state.ip);
					cop_state.i1 = SAEV_Custom_last_value = (SAER_Memory_chipData[cop_state.ip] << 8) | SAER_Memory_chipData[cop_state.ip + 1];
					//SAER.events.alloc_cycle(old_hpos, SAEC_Events_cycle_line_COPPER);
					cop_state.ip = cop1lc;
					break;
				}
				case COP_read1: {
					if (SAER.playfield.copper_cant_read(old_hpos, 1))
						continue;
					//cop_state.i1 = SAEV_Custom_last_value = SAER_Memory_chipGet16_indirect(cop_state.ip);
					cop_state.i1 = SAEV_Custom_last_value = (SAER_Memory_chipData[cop_state.ip] << 8) | SAER_Memory_chipData[cop_state.ip + 1];
					//SAER.events.alloc_cycle(old_hpos, SAEC_Events_cycle_line_COPPER);
					cop_state.ip += 2;
					cop_state.state = COP_read2;
					break;
				}
				case COP_read2: {
					if (SAER.playfield.copper_cant_read(old_hpos, 1))
						continue;
					//cop_state.i2 = SAEV_Custom_last_value = SAER_Memory_chipGet16_indirect(cop_state.ip);
					cop_state.i2 = SAEV_Custom_last_value = (SAER_Memory_chipData[cop_state.ip] << 8) | SAER_Memory_chipData[cop_state.ip + 1];
					//SAER.events.alloc_cycle(old_hpos, SAEC_Events_cycle_line_COPPER);
					cop_state.ip += 2;
					cop_state.saved_i1 = cop_state.i1;
					cop_state.saved_i2 = cop_state.i2;
					cop_state.saved_ip = cop_state.ip;

					if (cop_state.i1 & 1) { // WAIT or SKIP
						cop_state.ignore_next = false;
						if (cop_state.i2 & 1)
							cop_state.state = COP_skip_in2;
						else
							cop_state.state = COP_wait_in2;
					} else { // MOVE
						var reg = cop_state.i1 & 0x1FE;
						var data = cop_state.i2;
						cop_state.state = COP_read1;
						test_copper_dangerous(reg);
						if (!SAEV_Copper_enabled_thisline) {
							//goto out; //was "dangerous" register -> copper stopped
							cop_state.hpos = c_hpos;
							SAEV_Copper_last_hpos = until_hpos;
							return;
						}
						if (cop_state.ignore_next)
							reg = 0x1fe;

						if (reg == 0x88) {
							cop_state.strobe = 1;
							cop_state.state = COP_strobe_delay1;
						} else if (reg == 0x8a) {
							cop_state.strobe = 2;
							cop_state.state = COP_strobe_delay1;
						} else {
							if (customdelay[reg >> 1]) {
								cop_state.moveaddr = reg;
								cop_state.movedata = data;
								cop_state.movedelay = customdelay[reg >> 1];
							} else
								put16_copper(old_hpos, reg, data, 0);
						}
						cop_state.ignore_next = false;
					}
					check_copper_stop();
					break;
				}
				case COP_wait1: {
					cop_state.state = COP_wait;

					cop_state.vcmp = (cop_state.saved_i1 & (cop_state.saved_i2 | 0x8000)) >> 8;
					cop_state.hcmp = (cop_state.saved_i1 & cop_state.saved_i2 & 0xFE);

					vp = SAER.playfield.get_vpos() & (((cop_state.saved_i2 >> 8) & 0x7F) | 0x80);

					if (cop_state.saved_i1 == 0xFFFF && cop_state.saved_i2 == 0xFFFE) {
						cop_state.state = COP_waitforever;
						SAEV_Copper_enabled_thisline = 0;
						SAEF_clrSpcFlags(SAEC_spcflag_COPPER);
						//goto out;
						cop_state.hpos = c_hpos;
						SAEV_Copper_last_hpos = until_hpos;
						return;
					}
					if (vp < cop_state.vcmp) {
						SAEV_Copper_enabled_thisline = 0;
						SAEF_clrSpcFlags(SAEC_spcflag_COPPER);
						//goto out;
						cop_state.hpos = c_hpos;
						SAEV_Copper_last_hpos = until_hpos;
						return;
					}
					/* fall through */
				}
				case COP_wait: {
					var ch_comp = c_hpos;
					if (ch_comp & 1)
						ch_comp = 0;

					/* First handle possible blitter wait
					 * Must be before following free cycle check */
					if ((cop_state.saved_i2 & 0x8000) == 0) {
						SAER.blitter.decide_blitter(old_hpos);
						if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE) {
							/* We need to wait for the blitter.  */
							cop_state.state = COP_bltwait;
							SAEV_Copper_enabled_thisline = 0;
							SAEF_clrSpcFlags(SAEC_spcflag_COPPER);
							//goto out;
							cop_state.hpos = c_hpos;
							SAEV_Copper_last_hpos = until_hpos;
							return;
						}
					}

					if (SAER.playfield.copper_cant_read(old_hpos, 0))
						continue;

					hp = ch_comp & (cop_state.saved_i2 & 0xFE);
					if (vp == cop_state.vcmp && hp < cop_state.hcmp)
						break;

					cop_state.state = COP_read1;
					break;
				}
				case COP_skip1: {
					var vcmp, hcmp, vp1, hp1;

					maxhpos = SAER.playfield.get_maxhpos();
					if (c_hpos >= (maxhpos & ~1) || (c_hpos & 1))
						break;

					if (SAER.playfield.copper_cant_read(old_hpos, 0))
						continue;

					vcmp = (cop_state.saved_i1 & (cop_state.saved_i2 | 0x8000)) >> 8;
					hcmp = (cop_state.saved_i1 & cop_state.saved_i2 & 0xFE);
					vp1 = SAER.playfield.get_vpos() & (((cop_state.saved_i2 >> 8) & 0x7F) | 0x80);
					hp1 = c_hpos & (cop_state.saved_i2 & 0xFE);

					if ((vp1 > vcmp || (vp1 == vcmp && hp1 >= hcmp)) && ((cop_state.saved_i2 & 0x8000) != 0 || SAEV_Blitter_bltstate == SAEC_Blitter_bltstate_DONE))
						cop_state.ignore_next = true;

					cop_state.state = COP_read1;
					break;
				}
				default:
					break;
			}
		}

		//out:
		cop_state.hpos = c_hpos;
		SAEV_Copper_last_hpos = until_hpos;
	}

	this.compute_spcflag_copper = function(hpos) {
		var wasenabled = SAEV_Copper_enabled_thisline;

		SAEV_Copper_enabled_thisline = 0;
		SAEF_clrSpcFlags(SAEC_spcflag_COPPER);
		if (!SAEF_Custom_dmaen(SAEC_Custom_DMAF_COPEN) || cop_state.state == COP_stop || cop_state.state == COP_waitforever || cop_state.state == COP_bltwait) //|| nocustom())
			return;

		if (cop_state.state == COP_wait) {
			var vp = SAER.playfield.get_vpos() & (((cop_state.saved_i2 >> 8) & 0x7F) | 0x80);
			if (vp < cop_state.vcmp)
				return;
		}
		// do not use past cycles if starting for the first time in this line
		// (write to DMACON for example) hpos+1 for long lines
		if (!wasenabled && cop_state.hpos < hpos && hpos < SAER.playfield.get_maxhpos()) {
			var maxhpos_short = SAER.playfield.get_maxhpos_short();
			hpos = (hpos + 2) & ~1;
			if (hpos > (maxhpos_short & ~1))
				hpos = maxhpos_short & ~1;
			cop_state.hpos = hpos;
		}
		// if COPJMPx was written while DMA was disabled, advance to next state,
		// COP_strobe_extra is single cycle only and does not need free bus.
		// (copper state emulation does not run if DMA is disabled)
		if (!wasenabled && cop_state.state == COP_strobe_extra)
			cop_state.state = COP_strobe_delay1;

		SAEV_Copper_enabled_thisline = 1;
		SAEF_setSpcFlags(SAEC_spcflag_COPPER);
	}

	this.blitter_done_notify = function(hpos) {
		if (cop_state.state != COP_bltwait)
			return;

		var vpos = SAER.playfield.get_vpos();
		var vp_wait = vpos & (((cop_state.saved_i2 >> 8) & 0x7F) | 0x80);
		var vp = vpos;
		var maxhpos = SAER.playfield.get_maxhpos();

		hpos++;
		hpos &= ~1;
		if (hpos >= maxhpos) {
			hpos -= maxhpos;
			vp++;
		}
		cop_state.hpos = hpos;
		cop_state.vpos = vp;
		cop_state.state = COP_wait;
		/* No need to check blitter state again */
		cop_state.saved_i2 |= 0x8000;

		if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_COPEN) && vp_wait >= cop_state.vcmp) {
			SAEV_Copper_enabled_thisline = 1;
			SAEF_setSpcFlags(SAEC_spcflag_COPPER);
		} else
			SAEF_clrSpcFlags(SAEC_spcflag_COPPER);
	}

	this.cycle = function() { //do_copper()
		var hpos = SAER.events.current_hpos();
		update_copper(hpos);
	}

	this.sync_copper_with_cpu = function(hpos, do_schedule) {
		/* Need to let the copper advance to the current position.  */
		if (SAEV_Copper_enabled_thisline)
			update_copper(hpos);
	}

	/*-----------------------------------------------------------------------*/

	function test_copper_dangerous(address) {
		var addr = address & 0x01fe;
		if (addr < ((copcon & 2) ? ((SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) ? 0 : 0x40) : 0x80)) {
			cop_state.state = COP_stop;
			SAEV_Copper_enabled_thisline = 0;
			SAEF_clrSpcFlags(SAEC_spcflag_COPPER);
			return true;
		}
		return false;
	}

	/*function immediate_copper(num) {
		var pos = 0;
		var oldpos = 0;

		cop_state.state = COP_stop;
		cop_state.vpos = SAER.playfield.get_vpos();
		cop_state.hpos = SAER.events.current_hpos() & ~1;
		cop_state.ip = num == 1 ? cop1lc : cop2lc;

		while (pos < (maxvpos << 5)) {
			if (oldpos > pos)
				pos = oldpos;
			if (!SAEF_Custom_dmaen(SAEC_Custom_DMAF_COPEN))
				break;
			if (cop_state.ip >= SAEV_config.memory.chipSize && cop_state.ip < currprefs.z3chipmem_start && cop_state.ip >= currprefs.z3chipmem_start + currprefs.z3chipmem_size)
				break;
			pos++;
			oldpos = pos;
			//cop_state.i1 = SAER_Memory_chipGet16_indirect(cop_state.ip);
			//cop_state.i2 = SAER_Memory_chipGet16_indirect(cop_state.ip + 2);
			cop_state.i1 = (SAER_Memory_chipData[cop_state.ip    ] << 8) | SAER_Memory_chipData[cop_state.ip + 1];
			cop_state.i2 = (SAER_Memory_chipData[cop_state.ip + 2] << 8) | SAER_Memory_chipData[cop_state.ip + 3];
			cop_state.ip += 4;
			if (!(cop_state.i1 & 1)) { // move
				cop_state.i1 &= 0x1fe;
				if (cop_state.i1 == 0x88) {
					cop_state.ip = cop1lc;
					continue;
				}
				if (cop_state.i1 == 0x8a) {
					cop_state.ip = cop2lc;
					continue;
				}
				if (test_copper_dangerous(cop_state.i1))
					break;

				//custom_wput_1(0, cop_state.i1, cop_state.i2, 0);
				SAER_Custom_put16_real(0, addr, value, 0);
			} else { // wait or skip
				if ((cop_state.i1 >> 8) > ((pos >> 5) & 0xff))
					pos = (((pos >> 5) & 0x100) | ((cop_state.i1 >> 8)) << 5) | ((cop_state.i1 & 0xff) >> 3);
				if (cop_state.i1 >= 0xffdf && cop_state.i2 == 0xfffe)
					break;
			}
		}
		cop_state.state = COP_stop;
		SAEF_clrSpcFlags(SAEC_spcflag_COPPER);
	}*/

	this.COP1LCH = function(v) {
		v = v & (SAEV_config.chipset.mask == SAEC_Config_Chipset_Mask_OCS ? 7 : 31); //OWN
		cop1lc = ((cop1lc & 0x0000ffff) | (v << 16)) >>> 0;
	}
	this.COP1LCL = function(v) {
		cop1lc = ((cop1lc & 0xffff0000) | (v & 0xfffe)) >>> 0;
	}
	this.COP2LCH = function(v) {
		v = v & (SAEV_config.chipset.mask == SAEC_Config_Chipset_Mask_OCS ? 7 : 31); //OWN
		cop2lc = ((cop2lc & 0x0000ffff) | (v << 16)) >>> 0;
	}
	this.COP2LCL = function(v) {
		cop2lc = ((cop2lc & 0xffff0000) | (v & 0xfffe)) >>> 0;
	}

	// vblank = copper starts at hpos=2
	// normal COPJMP write: takes 2 more cycles
	this.COPJMP = function(num, vblank) {
		var oldstrobe = cop_state.strobe;
		var wasstopped = cop_state.state == COP_stop && !vblank;

		/*if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_COPEN) && (cop_state.saved_i1 != 0xffff || cop_state.saved_i2 != 0xfffe))
			SAEF_warn("copper.COPJMP vblank without copper ending %08x (%08x %08x)", cop_state.ip, cop1lc, cop2lc);*/

		SAEF_clrSpcFlags(SAEC_spcflag_COPPER);
		cop_state.ignore_next = false;

		if (!oldstrobe)
			cop_state.state_prev = cop_state.state;
		if ((cop_state.state == COP_wait || cop_state.state == COP_waitforever) && !vblank && SAEF_Custom_dmaen(SAEC_Custom_DMAF_COPEN)) {
			cop_state.state = COP_strobe_delay1x;
		} else {
			cop_state.state = vblank ? COP_start_delay : (SAEV_Copper_access ? COP_strobe_delay1 : COP_strobe_extra);
		}
		cop_state.vpos = SAER.playfield.get_vpos();
		cop_state.hpos = SAER.events.current_hpos() & ~1;
		SAEV_Copper_enabled_thisline = 0;
		cop_state.strobe = num;

		/*if (nocustom()) {
			immediate_copper(num);
			return;
		}*/
		if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_COPEN)) {
			this.compute_spcflag_copper(SAER.events.current_hpos());
		} else if (wasstopped || (oldstrobe > 0 && oldstrobe != num && cop_state.state_prev == COP_wait)) {
			/* dma disabled, copper idle and accessed both COPxJMPs -> copper stops! */
			cop_state.state = COP_stop;
		}
	}

	this.COPCON = function(a) {
		copcon = a;
	}
}
