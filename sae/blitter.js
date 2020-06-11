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

var SAER_Blitter_blt_info = null;

/*---------------------------------*/
/* global constants */

const SAEC_Blitter_bltstate_DONE = 0;
const SAEC_Blitter_bltstate_INIT = 1;
const SAEC_Blitter_bltstate_READ = 2;
const SAEC_Blitter_bltstate_WORK = 3;
const SAEC_Blitter_bltstate_WRITE = 4;
const SAEC_Blitter_bltstate_NEXT = 5;

/*---------------------------------*/
/* global variables */

var SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_DONE;
var SAEV_Blitter_interrupt = false;
var SAEV_Blitter_dangerous = false;

/*---------------------------------*/

function SAEO_Blitter() {
	//const BLITTER_DEBUG = 0;
	// 1 = logging
	// 2 = no wait detection
	// 4 = no D
	// 8 = instant
	// 16 = activate debugger if weird things
	/*var log_blitter;
	if (BLITTER_DEBUG)
		log_blitter = 1 | 16;
	else
		log_blitter = 0;*/

	const blit_cycle_diagram = [
		[ 2, 0,0,       0,0 ],     /* 0   -- */
		[ 2, 0,0,       0,4 ],     /* 1   -D */
		[ 2, 0,3,       0,3 ],     /* 2   -C */
		[ 3, 0,3,0,     0,3,4 ],   /* 3  -CD */
		[ 3, 0,2,0,	    0,2,0 ],   /* 4  -B- */
		[ 3, 0,2,0,	    0,2,4 ],   /* 5  -BD */
		[ 3, 0,2,3,	    0,2,3 ],   /* 6  -BC */
		[ 4, 0,2,3,0,   0,2,3,4 ], /* 7 -BCD */
		[ 2, 1,0,       1,0 ],     /* 8   A- */
		[ 2, 1,0,       1,4 ],     /* 9   AD */
		[ 2, 1,3,       1,3 ],     /* A   AC */
		[ 3, 1,3,0,     1,3,4, ],  /* B  ACD */
		[ 3, 1,2,0,	    1,2,0 ],   /* C  AB- */
		[ 3, 1,2,0,	    1,2,4 ],   /* D  ABD */
		[ 3, 1,2,3,	    1,2,3 ],   /* E  ABC */
		[ 4, 1,2,3,0,   1,2,3,4 ]  /* F ABCD */
	];
	const blit_cycle_diagram_fill = [
		[ 0 ],                     /* 0 */
		[ 3, 0,0,0,	    0,4,0 ],   /* 1 */
		[ 0 ],                     /* 2 */
		[ 0 ],                     /* 3 */
		[ 0 ],                     /* 4 */
		[ 4, 0,2,0,0,   0,2,4,0 ], /* 5 */
		[ 0 ],                     /* 6 */
		[ 0 ],                     /* 7 */
		[ 0 ],                     /* 8 */
		[ 3, 1,0,0,	    1,4,0 ],   /* 9 */
		[ 0 ],                     /* A */
		[ 0 ],                     /* B */
		[ 0 ],                     /* C */
		[ 4, 1,2,0,0,   1,2,4,0 ], /* D */
		[ 0 ],                     /* E */
		[ 0 ],                     /* F */
	];
	const blit_cycle_diagram_line		= [4, 0,3,5,4,	 0,3,5,4];
	const blit_cycle_diagram_finald	= [2, 0,4,	    0,4];
	const blit_cycle_diagram_finalld	= [2, 0,0,	    0,0];

	const DT_NONE = 0, DT_BLOCK = 1, DT_BLOCKFILL = 2, DT_LINE = 3; //OWN

	function blitter_info() {
		 this.blitzero = 0; //all int
		 this.blitashift = 0;
		 this.blitbshift = 0;
		 this.blitdownashift = 0;
		 this.blitdownbshift = 0;
		 this.bltadat = 0; //all u16
		 this.bltbdat = 0;
		 this.bltcdat = 0;
		 this.bltddat = 0;
		 this.bltahold = 0;
		 this.bltbhold = 0;
		 this.bltafwm = 0;
		 this.bltalwm = 0;
		 this.vblitsize = 0; //all int
		 this.hblitsize = 0;
		 this.bltamod = 0;
		 this.bltbmod = 0;
		 this.bltcmod = 0;
		 this.bltdmod = 0;
		 this.got_cycle = 0;
	};
	var blt_info = new blitter_info();
	SAER_Blitter_blt_info = blt_info;

	var blitter_cycle_exact = false;
	var immediate_blits = false;
	var blt_statefile_type = 0;

	var bltcon0 = 0, bltcon1 = 0; //global u16
	var bltapt = 0, bltbpt = 0, bltcpt = 0, bltdpt = 0; //global u32
	var bltptx = 0; //global u32
	var bltptxpos = 0, bltptxc = 0; //global
	var blitter_nasty = 0; //global
	//var blitter_dangerous_bpl = false; ->SAEV_Blitter_dangerous

	var original_ch = 0, original_fill = 0, original_line = 0;

	var blinea_shift = 0;
	var blinea = 0, blineb = 0; //u16
	var blitline = 0, blitfc = 0, blitfill = 0, blitife = 0, blitsing = 0, blitdesc = 0;
	var blitline_started = 0;
	var blitonedot = 0, blitsign = false, blitlinepixel = 0;
	var blit_add = 0;
	var blit_modadda = 0, blit_modaddb = 0, blit_modaddc = 0, blit_modaddd = 0;
	var blit_ch = 0;

	var blitter_dontdo = 0;
	var blitter_delayed_debug = 0;

	var blit_func_tab = null; //OWN
	var blit_filltable = null; //u8 [256][4][2]
	var blit_masktable = null; //global u32 [BLITTER_MAX_WORDS]
	//var bltstate = 0; -> SAEV_Blitter_bltstate
	//var blit_interrupt = false; -> SAEV_Blitter_interrupt

	var blit_cyclecounter = 0, blit_waitcyclecounter = 0;
	var blit_maxcyclecounter = 0, blit_slowdown = 0, blit_totalcyclecounter = 0;
	var blit_startcycles = 0, blit_misscyclecounter = 0;

	var blit_firstline_cycles = 0; //long
	var blit_first_cycle = 0; //long
	var blit_last_cycle = 0, blit_dmacount = 0, blit_dmacount2 = 0;
	var blit_linecycles = 0, blit_extracycles = 0, blit_nod = 0;
	var blit_diag = null; //int *
	var blit_diag_type = 0; //OWN
	var blit_frozen = 0, blit_faulty = 0;
	var blit_final = 0;
	var blt_delayed_irq = 0;
	var ddat1 = 0, ddat2 = 0; //u16
	var ddat1use = 0, ddat2use = 0;

	var preva = 0, prevb = 0; //u32

	var last_blitter_hpos = 0;

	const BLITTER_STARTUP_CYCLES = 2;

	var blitter_cyclecounter = 0;
	var blitter_hcounter1 = 0, blitter_hcounter2 = 0;
	var blitter_vcounter1 = 0, blitter_vcounter2 = 0;

	var blitter_stuck = 0;

	var oddfstrt = 0, oddfstop = 0, ototal = 0, ofree = 0, slow = 0;

	var changetable = new Uint8Array(32 * 32);
	var freezes = 10;
	var warned1 = 10;
	var warned2 = 10;

	/*-----------------------------------------------------------------------*/

	this.setup = function() {
		build_blitfilltable();
		build_blitfunctable();
		return SAEE_None;
	}

	this.reset = function() { //blitter_reset()
		bltptxpos = -1;
		blit_diag_type = DT_NONE;

		preva = 0, prevb = 0; //blitter_doblit()

		for (var i = 0; i < changetable.length; i++) changetable[i] = 0; //blit_bltset()
		freezes = 10;

		warned1 = 10; //waitingblits()
		warned2 = 10; //maybe_blit()

		blitter_cyclecounter = 0; //blitter_dodma()
		blitter_hcounter1 = blitter_hcounter2 = 0;
		blitter_vcounter1 = blitter_vcounter2 = 0;

		blitter_stuck = 0; //handler()

		oddfstrt = oddfstop = ototal = ofree = slow = 0; //blitter_slowdown()
	}

	/*function blitter_dump() {
		var chipsize = SAEV_config.memory.chipSize;
		SAEF_log("PT A=%08X B=%08X C=%08X D=%08X", bltapt, bltbpt, bltcpt, bltdpt);
		SAEF_log("CON0=%04X CON1=%04X DAT A=%04X B=%04X C=%04X", bltcon0, bltcon1, blt_info.bltadat, blt_info.bltbdat, blt_info.bltcdat);
		SAEF_log("AFWM=%04X ALWM=%04X MOD A=%04X B=%04X C=%04X D=%04X", blt_info.bltafwm, blt_info.bltalwm, blt_info.bltamod & 0xffff, blt_info.bltbmod & 0xffff, blt_info.bltcmod & 0xffff, blt_info.bltdmod & 0xffff);
		SAEF_log("PC=%08X DMA=%d", SAER_CPU_getPC(), SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN));
		if (((bltcon0 & 0x800) && bltapt >= chipsize) || ((bltcon0 & 0x400) && bltbpt >= chipsize) || ((bltcon0 & 0x200) && bltcpt >= chipsize) || ((bltcon0 & 0x100) && bltdpt >= chipsize))
			SAEF_log("PT outside of chipram");
	}*/

	/*-----------------------------------------------------------------------*/

	function get_ch() { //int *
		if (blit_faulty) {
			//return &blit_diag[0]; //ORG
			switch (blit_diag_type) {
				case DT_BLOCK: return blit_cycle_diagram[0];
				case DT_BLOCKFILL: return blit_cycle_diagram_fill[0];
				case DT_LINE: return blit_cycle_diagram_line;
				default: return blit_cycle_diagram[0];
			}
		}
		if (blit_final)
			return blitline || blit_nod ? blit_cycle_diagram_finalld : blit_cycle_diagram_finald;

		return blit_diag;
	}

	function channel_state(cycles) {
		if (cycles < 0)
			return 0;
		var diag = get_ch();
		if (cycles < diag[0])
			return diag[1 + cycles];
		cycles -= diag[0];
		cycles %= diag[0];
		return diag[1 + diag[0] + cycles];
	}
	function channel_pos(cycles) {
		if (cycles < 0)
			return 0;
		var diag =  get_ch();
		if (cycles < diag[0])
			return cycles;
		cycles -= diag[0];
		cycles %= diag[0];
		return cycles;
	}
	/*this.blitter_channel_state = function() {
		return channel_state(blit_cyclecounter);
	}*/

	function canblit(hpos) {
		if (!SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN))
			return -1;
		if (SAER.playfield.is_bitplane_dma(hpos))
			return 0;
		/*if (SAER_Events_cycle_line[hpos] & SAEC_Events_cycle_line_MASK) {
			#if 0
			if ((SAEV_Custom_dmacon & SAEC_Custom_DMAF_BLTPRI) && SAER_Events_cycle_line[hpos] == SAEC_Events_cycle_line_CPU)
				SAEF_warn("blitter.canblit() CPU stole cycle from blitter without nasty!?");
			#endif
			return 0;
		}*/
		return 1;
	}

	function reset_channel_mods() {
		if (bltptxpos < 0)
			return;
		bltptxpos = -1;
		switch (bltptxc) {
			case 1: bltapt = bltptx; break;
			case 2: bltbpt = bltptx; break;
			case 3: bltcpt = bltptx; break;
			case 4: bltdpt = bltptx; break;
		}
	}
	function check_channel_mods(hpos, ch) {
		if (bltptxpos != hpos)
			return;
		if (ch == bltptxc) {
			bltptxpos = -1;
			SAEF_warn("blitter.check_channel_mods() %08x write to %d ignored!", bltptx, ch);
		}
	}

	// blitter interrupt is set (and busy bit cleared) when
	// last "main" cycle has been finished, any non-linedraw
	// D-channel blit still needs 2 more cycles before final
	// D is written (idle cycle, final D write)
	//
	// line draw interrupt triggers when last D is written
	// (or cycle where last D write would have been if
	// ONEDOT was active)

	function blitter_interrupt(hpos, done) {
		if (SAEV_Blitter_interrupt)
			return;
		if (!done && (!blitter_cycle_exact || immediate_blits || SAEV_config.cpu.speed < 0 || SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68030))
			return;
		SAEV_Blitter_interrupt = true;
		SAER.custom.send_interrupt(SAEC_Custom_INTF_BLIT, 4 * SAEC_Events_CYCLE_UNIT);
	}

	function blitter_done(hpos) {
		ddat1use = ddat2use = 0;
		SAEV_Blitter_bltstate = blit_startcycles == 0 || !blitter_cycle_exact || immediate_blits ? SAEC_Blitter_bltstate_DONE : SAEC_Blitter_bltstate_INIT;
		blitter_interrupt(hpos, 1);
		SAER.copper.blitter_done_notify(hpos);
		SAER.events.event2_remevent(SAEC_Events_EV2_BLITTER);
		SAEF_clrSpcFlags(SAEC_spcflag_BLTNASTY);
		//if (log_blitter & 1) SAEF_log("blitter.blitter_done() cycles %d, missed %d, total %d", blit_totalcyclecounter, blit_misscyclecounter, blit_totalcyclecounter + blit_misscyclecounter);
		SAEV_Blitter_dangerous = false;
	}

	/*OWN opt inline
	function chipmem_agnus_wput2(addr, w) {
		//SAEV_Custom_last_value = w; blitter writes are not stored
		//if (!(log_blitter & 4))
		{
			//SAER_Memory_chipPut16_indirect(addr, w);
			SAER_Memory_chipData[addr] = w >> 8;
			SAER_Memory_chipData[addr+1] = w & 0xff;
		}
	}*/

	function blitter_dofast() {
		var i, j;
		var bltadatptr = 0, bltbdatptr = 0, bltcdatptr = 0, bltddatptr = 0;
		var mt = bltcon0 & 0xff;

		blit_masktable[0] = blt_info.bltafwm;
		blit_masktable[blt_info.hblitsize - 1] &= blt_info.bltalwm;

		if (bltcon0 & 0x800) {
			bltadatptr = bltapt;
			bltapt += (blt_info.hblitsize * 2 + blt_info.bltamod) * blt_info.vblitsize;
		}
		if (bltcon0 & 0x400) {
			bltbdatptr = bltbpt;
			bltbpt += (blt_info.hblitsize * 2 + blt_info.bltbmod) * blt_info.vblitsize;
		}
		if (bltcon0 & 0x200) {
			bltcdatptr = bltcpt;
			bltcpt += (blt_info.hblitsize * 2 + blt_info.bltcmod) * blt_info.vblitsize;
		}
		if (bltcon0 & 0x100) {
			bltddatptr = bltdpt;
			bltdpt += (blt_info.hblitsize * 2 + blt_info.bltdmod) * blt_info.vblitsize;
		}

		if (blitfunc_dofast[mt] !== 0 && !blitfill) {
			blitfunc_dofast[mt](bltadatptr, bltbdatptr, bltcdatptr, bltddatptr, blt_info);
		} else {
			var blitbhold = blt_info.bltbhold;
			var preva = 0, prevb = 0;
			var dstp = 0;
			var dodst = 0;

			for (j = 0; j < blt_info.vblitsize; j++) {
				blitfc = !!(bltcon1 & 0x4);
				for (i = 0; i < blt_info.hblitsize; i++) {
					var bltadat, blitahold;
					var bltbdat;
					if (bltadatptr) {
						//blt_info.bltadat = bltadat = SAER_Memory_chipGet16_indirect(bltadatptr);
						blt_info.bltadat = bltadat = (SAER_Memory_chipData[bltadatptr] << 8) | SAER_Memory_chipData[bltadatptr + 1];
						bltadatptr += 2;
					} else
						bltadat = blt_info.bltadat;
					bltadat &= blit_masktable[i];
					blitahold = (((preva << 16) | bltadat) >>> 0) >>> blt_info.blitashift;
					preva = bltadat;

					if (bltbdatptr) {
						//blt_info.bltbdat = bltbdat = SAER_Memory_chipGet16_indirect(bltbdatptr);
						blt_info.bltbdat = bltbdat = (SAER_Memory_chipData[bltbdatptr] << 8) | SAER_Memory_chipData[bltbdatptr + 1];
						bltbdatptr += 2;
						blitbhold = (((prevb << 16) | bltbdat) >>> 0) >>> blt_info.blitbshift;
						prevb = bltbdat;
					}

					if (bltcdatptr) {
						//blt_info.bltcdat = SAER_Memory_chipGet16_indirect(bltcdatptr);
						blt_info.bltcdat = (SAER_Memory_chipData[bltcdatptr] << 8) | SAER_Memory_chipData[bltcdatptr + 1];
						bltcdatptr += 2;
					}
					//if (dodst) chipmem_agnus_wput2(dstp, blt_info.bltddat);
					//if (dodst) SAER_Memory_chipPut16_indirect(dstp, blt_info.bltddat);
					if (dodst) {
						SAER_Memory_chipData[dstp] = blt_info.bltddat >> 8;
						SAER_Memory_chipData[dstp+1] = blt_info.bltddat & 0xff;
					}
					blt_info.bltddat = blit_func_tab[mt](blitahold, blitbhold, blt_info.bltcdat) & 0xffff;
					if (blitfill) {
						var d = blt_info.bltddat;
						var ifemode = blitife ? 2 : 0;
						var fc1 = blit_filltable[d & 255][ifemode + blitfc][1];
						blt_info.bltddat = (blit_filltable[d & 255][ifemode + blitfc][0] + (blit_filltable[d >> 8][ifemode + fc1][0] << 8));
						blitfc = blit_filltable[d >> 8][ifemode + fc1][1];
					}
					if (blt_info.bltddat)
						blt_info.blitzero = 0;
					if (bltddatptr) {
						dodst = 1;
						dstp = bltddatptr;
						bltddatptr += 2;
					}
				}
				if (bltadatptr) bltadatptr += blt_info.bltamod;
				if (bltbdatptr) bltbdatptr += blt_info.bltbmod;
				if (bltcdatptr) bltcdatptr += blt_info.bltcmod;
				if (bltddatptr) bltddatptr += blt_info.bltdmod;
			}
			//if (dodst) chipmem_agnus_wput2(dstp, blt_info.bltddat);
			//if (dodst) SAER_Memory_chipPut16_indirect(dstp, blt_info.bltddat);
			if (dodst) {
				SAER_Memory_chipData[dstp] = blt_info.bltddat >> 8;
				SAER_Memory_chipData[dstp+1] = blt_info.bltddat & 0xff;
			}
			blt_info.bltbhold = blitbhold;
		}
		blit_masktable[0] = 0xffff;
		blit_masktable[blt_info.hblitsize - 1] = 0xffff;

		SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_DONE;
	}

	function blitter_dofast_desc() {
		var i, j;
		var bltadatptr = 0, bltbdatptr = 0, bltcdatptr = 0, bltddatptr = 0;
		var mt = bltcon0 & 0xff;

		blit_masktable[0] = blt_info.bltafwm;
		blit_masktable[blt_info.hblitsize - 1] &= blt_info.bltalwm;

		if (bltcon0 & 0x800) {
			bltadatptr = bltapt;
			bltapt -= (blt_info.hblitsize * 2 + blt_info.bltamod) * blt_info.vblitsize;
		}
		if (bltcon0 & 0x400) {
			bltbdatptr = bltbpt;
			bltbpt -= (blt_info.hblitsize * 2 + blt_info.bltbmod) * blt_info.vblitsize;
		}
		if (bltcon0 & 0x200) {
			bltcdatptr = bltcpt;
			bltcpt -= (blt_info.hblitsize * 2 + blt_info.bltcmod) * blt_info.vblitsize;
		}
		if (bltcon0 & 0x100) {
			bltddatptr = bltdpt;
			bltdpt -= (blt_info.hblitsize * 2 + blt_info.bltdmod) * blt_info.vblitsize;
		}
		if (blitfunc_dofast_desc[mt] !== 0 && !blitfill) {
			blitfunc_dofast_desc[mt](bltadatptr, bltbdatptr, bltcdatptr, bltddatptr, blt_info);
		} else {
			var blitbhold = blt_info.bltbhold;
			var preva = 0, prevb = 0;
			var dstp = 0;
			var dodst = 0;

			for (j = 0; j < blt_info.vblitsize; j++) {
				blitfc = !!(bltcon1 & 0x4);
				for (i = 0; i < blt_info.hblitsize; i++) {
					var bltadat, blitahold;
					var bltbdat;
					if (bltadatptr) {
						//blt_info.bltadat = bltadat = SAER_Memory_chipGet16_indirect(bltadatptr);
						blt_info.bltadat = bltadat = (SAER_Memory_chipData[bltadatptr] << 8) | SAER_Memory_chipData[bltadatptr + 1];
						bltadatptr -= 2;
					} else
						bltadat = blt_info.bltadat;
					bltadat &= blit_masktable[i];
					blitahold = (((bltadat << 16) | preva) >>> 0) >>> blt_info.blitdownashift;
					preva = bltadat;

					if (bltbdatptr) {
						//blt_info.bltbdat = bltbdat = SAER_Memory_chipGet16_indirect(bltbdatptr);
						blt_info.bltbdat = bltbdat = (SAER_Memory_chipData[bltbdatptr] << 8) | SAER_Memory_chipData[bltbdatptr + 1];
						bltbdatptr -= 2;
						blitbhold = (((bltbdat << 16) | prevb) >>> 0) >>> blt_info.blitdownbshift;
						prevb = bltbdat;
					}

					if (bltcdatptr) {
						//blt_info.bltcdat = blt_info.bltbdat = SAER_Memory_chipGet16_indirect(bltcdatptr);
						blt_info.bltcdat = (SAER_Memory_chipData[bltcdatptr] << 8) | SAER_Memory_chipData[bltcdatptr + 1];
						bltcdatptr -= 2;
					}
					//if (dodst) chipmem_agnus_wput2(dstp, blt_info.bltddat);
					//if (dodst) SAER_Memory_chipPut16_indirect(dstp, blt_info.bltddat);
					if (dodst) {
						SAER_Memory_chipData[dstp] = blt_info.bltddat >> 8;
						SAER_Memory_chipData[dstp+1] = blt_info.bltddat & 0xff;
					}
					blt_info.bltddat = blit_func_tab[mt](blitahold, blitbhold, blt_info.bltcdat) & 0xffff;
					if (blitfill) {
						var d = blt_info.bltddat;
						var ifemode = blitife ? 2 : 0;
						var fc1 = blit_filltable[d & 255][ifemode + blitfc][1];
						blt_info.bltddat = (blit_filltable[d & 255][ifemode + blitfc][0] + (blit_filltable[d >> 8][ifemode + fc1][0] << 8));
						blitfc = blit_filltable[d >> 8][ifemode + fc1][1];
					}
					if (blt_info.bltddat)
						blt_info.blitzero = 0;
					if (bltddatptr) {
						dstp = bltddatptr;
						dodst = 1;
						bltddatptr -= 2;
					}
				}
				if (bltadatptr) bltadatptr -= blt_info.bltamod;
				if (bltbdatptr) bltbdatptr -= blt_info.bltbmod;
				if (bltcdatptr) bltcdatptr -= blt_info.bltcmod;
				if (bltddatptr) bltddatptr -= blt_info.bltdmod;
			}
			//if (dodst) chipmem_agnus_wput2(dstp, blt_info.bltddat);
			//if (dodst) SAER_Memory_chipPut16_indirect(dstp, blt_info.bltddat);
			if (dodst) {
				SAER_Memory_chipData[dstp] = blt_info.bltddat >> 8;
				SAER_Memory_chipData[dstp+1] = blt_info.bltddat & 0xff;
			}
			blt_info.bltbhold = blitbhold;
		}
		blit_masktable[0] = 0xffff;
		blit_masktable[blt_info.hblitsize - 1] = 0xffff;

		SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_DONE;
	}

	function blitter_read() {
		if (bltcon0 & 0x200) {
			if (!SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN))
				return;
			//blt_info.bltcdat = SAER_Memory_chipGet16_indirect(bltcpt);
			blt_info.bltcdat = (SAER_Memory_chipData[bltcpt] << 8) | SAER_Memory_chipData[bltcpt + 1];
			SAEV_Custom_last_value = blt_info.bltcdat;
		}
		SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_WORK;
	}

	function blitter_write() {
		if (blt_info.bltddat)
			blt_info.blitzero = 0;
		/* D-channel state has no effect on linedraw, but C must be enabled or nothing is drawn! */
		if (bltcon0 & 0x200) {
			if (!SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN))
				return;
			//SAEV_Custom_last_value = blt_info.bltddat; blitter writes are not stored
			//SAER_Memory_chipPut16_indirect(bltdpt, blt_info.bltddat);
			SAER_Memory_chipData[bltdpt] = blt_info.bltddat >> 8;
			SAER_Memory_chipData[bltdpt+1] = blt_info.bltddat & 0xff;
		}
		SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_NEXT;
	}

	function blitter_line() {
		var blitahold = (blinea & blt_info.bltafwm) >> blinea_shift;
		var blitchold = blt_info.bltcdat;

		blt_info.bltbhold = (blineb & 1) ? 0xffff : 0;
		blitlinepixel = !blitsing || (blitsing && !blitonedot);
		blt_info.bltddat = blit_func_tab[bltcon0 & 0xff](blitahold, blt_info.bltbhold, blitchold) & 0xffff;
		blitonedot++;
	}

	/*function blitter_line_incx() {
		if (++blinea_shift == 16) {
			blinea_shift = 0;
			bltcpt += 2;
		}
	}
	function blitter_line_decx() {
		if (blinea_shift-- == 0) {
			blinea_shift = 15;
			bltcpt -= 2;
		}
	}
	function blitter_line_decy() {
		bltcpt -= blt_info.bltcmod;
		blitonedot = 0;
	}
	function blitter_line_incy() {
		bltcpt += blt_info.bltcmod;
		blitonedot = 0;
	}*/
	function blitter_line_proc() {
		/* ORG
		if (bltcon0 & 0x800) {
			if (blitsign)
				bltapt += (uae_s16)blt_info.bltbmod;
			else
				bltapt += (uae_s16)blt_info.bltamod;
		}*/
		if (bltcon0 & 0x800) {
			if (blitsign)
				bltapt += blt_info.bltbmod;
			else
				bltapt += blt_info.bltamod;
		}

		if (!blitsign) {
			if (bltcon1 & 0x10) {
				if (bltcon1 & 0x8) {
					//blitter_line_decy();
					bltcpt -= blt_info.bltcmod;
					blitonedot = 0;
				} else {
					//blitter_line_incy();
					bltcpt += blt_info.bltcmod;
					blitonedot = 0;
				}
			} else {
				if (bltcon1 & 0x8) {
					//blitter_line_decx();
					if (blinea_shift-- == 0) {
						blinea_shift = 15;
						bltcpt -= 2;
					}
				} else {
					//blitter_line_incx();
					if (++blinea_shift == 16) {
						blinea_shift = 0;
						bltcpt += 2;
					}
				}
			}
		}
		if (bltcon1 & 0x10) {
			if (bltcon1 & 0x4) {
				//blitter_line_decx();
				if (blinea_shift-- == 0) {
					blinea_shift = 15;
					bltcpt -= 2;
				}
			} else {
				//blitter_line_incx();
				if (++blinea_shift == 16) {
					blinea_shift = 0;
					bltcpt += 2;
				}
			}
		} else {
			if (bltcon1 & 0x4) {
				//blitter_line_decy();
				bltcpt -= blt_info.bltcmod;
				blitonedot = 0;
			} else {
				//blitter_line_incy();
				bltcpt += blt_info.bltcmod;
				blitonedot = 0;
			}
		}

		//blitsign = 0 > (uae_s16)bltapt; //ORG
		blitsign = (bltapt & 0x8000) != 0;
		SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_WRITE;
	}

	function blitter_nxline() {
		blineb = ((blineb << 1) | (blineb >> 15)) & 0xffff;
		blt_info.vblitsize--;
		SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_READ;
	}

	//#ifdef CPUEMU_13
	function decide_blitter_line(hsync, hpos) {
		var ptr = { val:0 };

		if (blit_final && blt_info.vblitsize)
			blit_final = 0;
		while (last_blitter_hpos < hpos) {
			var c = channel_state(blit_cyclecounter);

			for (;;) {
				var v = canblit(last_blitter_hpos);

				if (blit_waitcyclecounter) {
					blit_waitcyclecounter = 0;
					break;
				}

				// final 2 idle cycles? does not need free bus
				if (blit_final) {
					blit_cyclecounter++;
					blit_totalcyclecounter++;
					if (blit_cyclecounter >= 2) {
						blitter_done(last_blitter_hpos);
						return;
					}
					break;
				}

				if (v <= 0) {
					blit_misscyclecounter++;
					blitter_nasty++;
					break;
				}

				blit_cyclecounter++;
				blit_totalcyclecounter++;

				check_channel_mods(last_blitter_hpos, c);

				if (c == 3) {
					blitter_read();
					ptr.val = bltcpt;
					//SAER.events.alloc_cycle_blitter(last_blitter_hpos, ptr, 3);
					bltcpt = ptr.val;
					blitter_nasty++;
				} else if (c == 5) {
					if (ddat1use) {
						bltdpt = bltcpt;
					}
					ddat1use = 1;
					blitter_line();
					blitter_line_proc();
					blitter_nxline();
				} else if (c == 4) {
					/* onedot mode and no pixel = bus write access is skipped */
					if (blitlinepixel) {
						blitter_write();
						ptr.val = bltdpt;
						//SAER.events.alloc_cycle_blitter(last_blitter_hpos, ptr, 4);
						bltdpt = ptr.val;
						blitlinepixel = 0;
						blitter_nasty++;
					}
					if (blt_info.vblitsize == 0) {
						bltdpt = bltcpt;
						blit_final = 1;
						blit_cyclecounter = 0;
						blit_waitcyclecounter = 0;
						// blit finished bit is set and interrupt triggered
						// immediately after last D write
						blitter_interrupt(last_blitter_hpos, 0);
						break;
					}
				}
				break;
			}
			last_blitter_hpos++;
		}
		if (hsync)
			last_blitter_hpos = 0;

		reset_channel_mods();
	}
	//#endif

	function actually_do_blit() {
		if (blitline) {
			do {
				blitter_read();
				if (ddat1use)
					bltdpt = bltcpt;
				ddat1use = 1;
				blitter_line();
				blitter_line_proc();
				blitter_nxline();
				if (blitlinepixel) {
					blitter_write();
					blitlinepixel = 0;
				}
				if (blt_info.vblitsize == 0)
					SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_DONE;
			} while (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE);
			bltdpt = bltcpt;
		} else {
			if (blitdesc)
				blitter_dofast_desc();
			else
				blitter_dofast();

			SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_DONE;
		}
	}

	function blitter_doit() {
		if (blt_info.vblitsize == 0 || (blitline && blt_info.hblitsize != 2)) {
			blitter_done(SAER.events.current_hpos());
			return;
		}
		/*if (log_blitter) {
			if (!blitter_dontdo)
				actually_do_blit();
			else
				SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_DONE;
		} else*/
			actually_do_blit();

		blitter_done(SAER.events.current_hpos());
	}

	this.handler = function(data) { //blitter_handler
		//static int blitter_stuck;

		if (!SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN)) {
			SAER.events.event2_newevent(SAEC_Events_EV2_BLITTER, 10, 0);
			blitter_stuck++;
			if (blitter_stuck < 20000 || !immediate_blits)
				return; /* gotta come back later. */
			//debugtest (DEBUGTEST_BLITTER, "force-unstuck!");
		}
		blitter_stuck = 0;
		if (blit_slowdown > 0 && !immediate_blits) {
			SAER.events.event2_newevent(SAEC_Events_EV2_BLITTER, blit_slowdown, 0);
			blit_slowdown = -1;
			return;
		}
		blitter_doit();
	}

	/*-----------------------------------------------------------------------*/

	//#ifdef CPUEMU_13

	function blitter_doblit() {
		var blitahold;
		var bltadat, ddat;

		bltadat = blt_info.bltadat;
		if (blitter_hcounter1 == 0)
			bltadat &= blt_info.bltafwm;
		if (blitter_hcounter1 == blt_info.hblitsize - 1)
			bltadat &= blt_info.bltalwm;
		if (blitdesc)
			blitahold = (((bltadat << 16) | preva) >>> 0) >>> blt_info.blitdownashift;
		else
			blitahold = (((preva << 16) | bltadat) >>> 0) >>> blt_info.blitashift;

		preva = bltadat;
		ddat = blit_func_tab[bltcon0 & 0xff](blitahold, blt_info.bltbhold, blt_info.bltcdat) & 0xffff;

		if ((bltcon1 & 0x18)) {
			var d = ddat;
			var ifemode = blitife ? 2 : 0;
			var fc1 = blit_filltable[d & 255][ifemode + blitfc][1];
			ddat = (blit_filltable[d & 255][ifemode + blitfc][0] + (blit_filltable[d >> 8][ifemode + fc1][0] << 8));
			blitfc = blit_filltable[d >> 8][ifemode + fc1][1];
		}
		if (ddat) blt_info.blitzero = 0;
		return ddat;
	}

	function blitter_doddma(hpos) {
		var d, ptr = { val:0 };

		if (blit_dmacount2 == 0) {
			d = blitter_doblit();
		} else if (ddat2use) {
			d = ddat2;
			ddat2use = 0;
		} else if (ddat1use) {
			d = ddat1;
			ddat1use = 0;
		} else {
			/*static int warn = 10;
			if (warn > 0) {
				warn--;
				SAEF_warn("blitter.blitter_doddma() D-channel without nothing to do?");
			}*/
			return;
		}
		//SAEV_Custom_last_value = d; blitter writes are not stored
		//chipmem_agnus_wput2(bltdpt, d);
		//SAER_Memory_chipPut16_indirect(bltdpt, d);
		SAER_Memory_chipData[bltdpt] = d >> 8;
		SAER_Memory_chipData[bltdpt+1] = d & 0xff;
		ptr.val = bltdpt;
		//SAER.events.alloc_cycle_blitter(hpos, ptr, 4);
		bltdpt = ptr.val;
		bltdpt += blit_add;
		blitter_hcounter2++;
		if (blitter_hcounter2 == blt_info.hblitsize) {
			blitter_hcounter2 = 0;
			bltdpt += blit_modaddd;
			blitter_vcounter2++;
			if (blit_dmacount2 == 0) // d-only
				blitter_vcounter1++;
			if (blitter_vcounter2 > blitter_vcounter1)
				blitter_vcounter1 = blitter_vcounter2;
		}
		if (blit_ch == 1)
			blitter_hcounter1 = blitter_hcounter2;
	}

	function blitter_dodma(ch, hpos) {
		var dat, reg;
		var addr;
		var ptr = { val:0 };

		switch (ch) {
			case 1:
				//blt_info.bltadat = dat = SAER_Memory_chipGet16_indirect(bltapt);
				blt_info.bltadat = (SAER_Memory_chipData[bltapt] << 8) | SAER_Memory_chipData[bltapt + 1];
				SAEV_Custom_last_value = blt_info.bltadat;
				addr = bltapt;
				bltapt += blit_add;
				reg = 0x74;
				ptr.val = bltapt;
				//SAER.events.alloc_cycle_blitter(hpos, ptr, 1);
				bltapt = ptr.val;
				break;
			case 2:
				//blt_info.bltbdat = dat = SAER_Memory_chipGet16_indirect(bltbpt);
				blt_info.bltbdat = (SAER_Memory_chipData[bltbpt] << 8) | SAER_Memory_chipData[bltbpt + 1];
				SAEV_Custom_last_value = blt_info.bltbdat;
				addr = bltbpt;
				bltbpt += blit_add;
				if (blitdesc)
					blt_info.bltbhold = (((blt_info.bltbdat << 16) | prevb) >>> 0) >>> blt_info.blitdownbshift;
				else
					blt_info.bltbhold = (((prevb << 16) | blt_info.bltbdat) >>> 0) >>> blt_info.blitbshift;
				prevb = blt_info.bltbdat;
				reg = 0x72;
				ptr.val = bltbpt;
				//SAER.events.alloc_cycle_blitter(hpos, ptr, 2);
				bltbpt = ptr.val;
				break;
			case 3:
				//blt_info.bltcdat = dat = SAER_Memory_chipGet16_indirect(bltcpt);
				blt_info.bltcdat = (SAER_Memory_chipData[bltcpt] << 8) | SAER_Memory_chipData[bltcpt + 1];
				SAEV_Custom_last_value = blt_info.bltcdat;
				addr = bltcpt;
				bltcpt += blit_add;
				reg = 0x70;
				ptr.val = bltcpt;
				//SAER.events.alloc_cycle_blitter(hpos, ptr, 3);
				bltcpt = ptr.val;
				break;
			//default: abort();
		}

		blitter_cyclecounter++;
		if (blitter_cyclecounter >= blit_dmacount2) {
			blitter_cyclecounter = 0;
			ddat2 = ddat1;
			ddat2use = ddat1use;
			ddat1use = 0;
			ddat1 = blitter_doblit();
			if (bltcon0 & 0x100)
				ddat1use = 1;
			blitter_hcounter1++;
			if (blitter_hcounter1 == blt_info.hblitsize) {
				blitter_hcounter1 = 0;
				if (bltcon0 & 0x800) bltapt += blit_modadda;
				if (bltcon0 & 0x400) bltbpt += blit_modaddb;
				if (bltcon0 & 0x200) bltcpt += blit_modaddc;
				blitter_vcounter1++;
				blitfc = !!(bltcon1 & 0x4);
			}
		}
	}

	/*this.blitter_need = function(hpos) {
		if (SAEV_Blitter_bltstate == SAEC_Blitter_bltstate_DONE)
			return 0;
		if (!SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN))
			return 0;
		return channel_state(blit_cyclecounter);
	}*/

	function do_startcycles(hpos) {
		var vhpos = last_blitter_hpos;
		while (vhpos < hpos) {
			var v = canblit(vhpos);
			vhpos++;
			if (v > 0) {
				blit_startcycles--;
				if (blit_startcycles == 0) {
					if (blit_faulty)
						blit_faulty = -1;
					SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_DONE;
					blit_final = 0;
					do_blitter(vhpos, 0);
					blit_startcycles = 0;
					blit_cyclecounter = 0;
					blit_waitcyclecounter = 0;
					if (blit_faulty)
						blit_faulty = 1;
					return;
				}
			}
		}
	}

	this.decide_blitter = function(hpos) {
		var hsync = hpos < 0;

		if (immediate_blits) {
			if (SAEV_Blitter_bltstate == SAEC_Blitter_bltstate_DONE)
				return;
			if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN))
				blitter_doit();
			return;
		}

		if (blit_startcycles > 0)
			do_startcycles(hpos);

		if (blt_delayed_irq > 0 && hsync) {
			blt_delayed_irq--;
			if (!blt_delayed_irq)
				SAER.custom.send_interrupt(SAEC_Custom_INTF_BLIT, 2 * SAEC_Events_CYCLE_UNIT);
		}

		if (SAEV_Blitter_bltstate == SAEC_Blitter_bltstate_DONE)
			return;

		/*if (log_blitter && blitter_delayed_debug) {
			blitter_delayed_debug = 0;
			blitter_dump ();
		}*/

		if (!blitter_cycle_exact)
			return;

		if (hpos < 0)
			hpos = SAER.playfield.get_maxhpos();

		if (blitline) {
			blt_info.got_cycle = 1;
			decide_blitter_line(hsync, hpos);
			return;
		}

		while (last_blitter_hpos < hpos) {
			var c = channel_state(blit_cyclecounter);

			for (;;) {
				var v = canblit(last_blitter_hpos);

				// copper bltsize write needs one cycle (any cycle) delay
				if (blit_waitcyclecounter) {
					blit_waitcyclecounter = 0;
					break;
				}
				// idle cycles require free bus.
				// Final empty cycle does not, unless it is fill mode that requires extra idle cycle
				// (CPU can still use this cycle)
				if ((c == 0 && v == 0) || v < 0) {
					if (blit_cyclecounter < 0 || !blit_final) {
						blit_misscyclecounter++;
						break;
					}
					if (blitfill && blit_cycle_diagram_fill[blit_ch][0]) {
						blit_misscyclecounter++;
						blitter_nasty++;
						break;
					}
				}

				if (blit_frozen) {
					blit_misscyclecounter++;
					break;
				}

				if (c == 0) {
					blt_info.got_cycle = 1;
					blit_cyclecounter++;
					if (blit_cyclecounter == 0)
						blit_final = 0;
					blit_totalcyclecounter++;
					/* check if blit with zero channels has ended  */
					if (blit_ch == 0 && blit_cyclecounter >= blit_maxcyclecounter) {
						blitter_done(last_blitter_hpos);
						return;
					}
					break;
				}

				blitter_nasty++;

				if (v <= 0) {
					blit_misscyclecounter++;
					break;
				}

				blt_info.got_cycle = 1;
				if (c == 4) {
					blitter_doddma(last_blitter_hpos);
					blit_cyclecounter++;
					blit_totalcyclecounter++;
				} else {
					if (blitter_vcounter1 < blt_info.vblitsize) {
						blitter_dodma(c, last_blitter_hpos);
					}
					blit_cyclecounter++;
					blit_totalcyclecounter++;
				}

				if (blitter_vcounter1 >= blt_info.vblitsize && blitter_vcounter2 >= blt_info.vblitsize) {
					if (!ddat1use && !ddat2use) {
						blitter_done(last_blitter_hpos);
						return;
					}
				}
				// check this after end check because last D write won't cause any problems.
				check_channel_mods(last_blitter_hpos, c);
				break;
			}

			if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN) && !blit_final && (blitter_vcounter1 == blt_info.vblitsize || (blitter_vcounter1 == blt_info.vblitsize - 1 && blitter_hcounter1 == blt_info.hblitsize - 1 && blit_dmacount2 == 0))) {
				if (channel_pos(blit_cyclecounter - 1) == blit_diag[0] - 1) {
					blitter_interrupt(last_blitter_hpos, 0);
					blit_cyclecounter = 0;
					blit_final = 1;
				}
			}
			last_blitter_hpos++;
		}
		reset_channel_mods();
		if (hsync)
			last_blitter_hpos = 0;
	}
	/*#else
	this.decide_blitter = function(hpos) { }
	#endif*/

	/*-----------------------------------------------------------------------*/

	function blitter_force_finish() {
		if (SAEV_Blitter_bltstate == SAEC_Blitter_bltstate_DONE)
			return;
		if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE) {
			/* blitter is currently running
			* force finish (no blitter state support yet)
			*/
			var odmacon = SAEV_Custom_dmacon;
			SAEV_Custom_dmacon |= (SAEC_Custom_DMAF_DMAEN | SAEC_Custom_DMAF_BLTEN);
			SAEF_log("blitter.blitter_force_finish() forcing finish");
			if (blitter_cycle_exact && !immediate_blits) {
				var rounds = 10000;
				while (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && rounds > 0) {
					//SAER_Events_cycle_line.clr();
					SAER.blitter.decide_blitter(-1);
					rounds--;
				}
				if (rounds == 0) SAEF_warn("blitter.blitter_force_finish() froze!?");
				blit_startcycles = 0;
			} else
				actually_do_blit();

			blitter_done(SAER.events.current_hpos());
			SAEV_Custom_dmacon = odmacon;
		}
	}

	/*function invstate() { //OPT inline, ok
		return SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_INIT;
	}*/

	function blit_bltset(con) {
		//const int *olddiag = blit_diag;
		var old_diag_type = blit_diag_type;

		if (con & 2) {
			blitdesc = bltcon1 & 2;
			blt_info.blitbshift = bltcon1 >> 12;
			blt_info.blitdownbshift = 16 - blt_info.blitbshift;
			if ((bltcon1 & 1) && !blitline_started) {
				SAEF_warn("blitter.blit_bltset() linedraw enabled after starting normal blit!");
				return;
			}
		}
		if (con & 1) {
			blt_info.blitashift = bltcon0 >> 12;
			blt_info.blitdownashift = 16 - blt_info.blitashift;
		}

		blit_ch = (bltcon0 & 0x0f00) >> 8;
		blitline = bltcon1 & 1;
		blitfill = !!(bltcon1 & 0x18);

		// disable line draw if bltcon0 is written while it is active
		if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_INIT && blitline && blitline_started) {
			blitline = 0;
			SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_DONE;
			SAEV_Blitter_interrupt = true;
			SAEF_warn("blitter.blit_bltset() register modification during linedraw!");
		}

		if (blitline) {
			/*if (blt_info.hblitsize != 2) {
				debugtest (DEBUGTEST_BLITTER, "weird blt_info.hblitsize in linemode: %d vsize=%d", blt_info.hblitsize, blt_info.vblitsize);
			}*/
			blit_diag = blit_cycle_diagram_line;
			blit_diag_type = DT_LINE; //OWN
		} else {
			if (con & 2) {
				blitfc = !!(bltcon1 & 0x4);
				blitife = !!(bltcon1 & 0x8);
				if ((bltcon1 & 0x18) == 0x18) {
					//debugtest (DEBUGTEST_BLITTER, "weird fill mode");
					blitife = 0;
				}
			}
			/*if (blitfill && !blitdesc) {
				debugtest (DEBUGTEST_BLITTER, "fill without desc");
			}*/
			if (blitfill && blit_cycle_diagram_fill[blit_ch][0]) {
				blit_diag = blit_cycle_diagram_fill[blit_ch];
				blit_diag_type = DT_BLOCKFILL;
			} else {
				blit_diag = blit_cycle_diagram[blit_ch];
				blit_diag_type = DT_BLOCK;
			}
		}
		/*if ((bltcon1 & 0x80) && (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS)) {
			debugtest (DEBUGTEST_BLITTER, "ECS BLTCON1 DOFF-bit set");
		}*/

		// on the fly switching fillmode from extra cycle to non-extra: blitter freezes
		// non-extra cycle to extra cycle: does not freeze but cycle diagram goes weird,
		// extra free cycle changes to another D write..
		// (Absolute Inebriation vector cube inside semi-filled vector object requires freezing blitter.)
		//if (invstate()) {
		if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_INIT) {
			//static int freezes = 10;
			//var isen = blit_diag >= &blit_cycle_diagram_fill[0][0] && blit_diag <= &blit_cycle_diagram_fill[15][0];
			//var iseo = olddiag >= &blit_cycle_diagram_fill[0][0] && olddiag <= &blit_cycle_diagram_fill[15][0];
			var isen = blit_diag_type == DT_BLOCKFILL; //OWN
			var iseo = old_diag_type == DT_BLOCKFILL; //OWN
			if (iseo != isen) {
				if (freezes > 0) {
					SAEF_warn("blitter.blit_bltset() on the fly %d (%d) -> %d (%d) switch!", original_ch, iseo, blit_ch, isen);
					freezes--;
				}
			}
			if (original_fill == isen) {
				blit_frozen = 0; // switched back to original fill mode? unfreeze
			} else if (iseo && !isen) {
				blit_frozen = 1;
				SAEF_warn("blitter.blit_bltset() frozen! %d (%d) -> %d (%d)", original_ch, iseo, blit_ch, isen);
			} else if (!iseo && isen) {
				if (!SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN)) // subtle shades / nuance bootblock bug
					blit_frozen = 1;
				//if (log_blitter) onsole.log(sprintf("blit_bltset() on the fly %d (%d) -> %d (%d) switch", original_ch, iseo, blit_ch, isen));
			}
		}

		// on the fly switching from CH=1 to CH=D -> blitter stops writing (Rampage/TEK)
		// currently just switch to no-channels mode, better than crashing the demo..
		// if (invstate()) {
		if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_INIT) {
			//static uae_u8 changetable[32 * 32];
			var o = original_ch + (original_fill ? 16 : 0);
			var n = blit_ch + (blitfill ? 16 : 0);
			if (o != n) {
				if (changetable[o * 32 + n] < 10) {
					changetable[o * 32 + n]++;
					SAEF_warn("blitter.blit_bltset() channel mode changed while active (%02x->%02x)", o, n);
				}
			}
			if (blit_ch == 13 && original_ch == 1)
				blit_faulty = 1;
		}

		if (blit_faulty) {
			blit_ch = 0;
			blit_diag = blit_cycle_diagram[blit_ch];
			blit_diag_type = DT_BLOCK;	//OWN
		}

		blit_dmacount = blit_dmacount2 = 0;
		blit_nod = 1;
		for (var i = 0; i < blit_diag[0]; i++) {
			var v = blit_diag[1 + blit_diag[0] + i];
			if (v <= 4)
				blit_dmacount++;
			if (v > 0 && v < 4)
				blit_dmacount2++;
			if (v == 4)
				blit_nod = 0;
		}
		if (blit_dmacount2 == 0) {
			ddat2use = 0;
			ddat1use = 0;
		}
	}

	function blit_modset() {
		blit_add = blitdesc ? -2 : 2;
		var mult = blitdesc ? -1 : 1;
		blit_modadda = mult * blt_info.bltamod;
		blit_modaddb = mult * blt_info.bltbmod;
		blit_modaddc = mult * blt_info.bltcmod;
		blit_modaddd = mult * blt_info.bltdmod;
	}

	function reset_blit(bltcon) {
		if (bltcon & 1)
			blinea_shift = bltcon0 >> 12;
		if (bltcon & 2)
			blitsign = !!(bltcon1 & 0x40);
		if (SAEV_Blitter_bltstate == SAEC_Blitter_bltstate_DONE)
			return;
		if (bltcon)
			blit_bltset(bltcon);
		blit_modset();
	}

	function waitingblits() {
		var waited = false;
		while (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN)) {
			waited = true;
			SAER.events.do_cycles(8 * SAEC_Events_CYCLE_UNIT);
		}
		if (warned1 && waited) {
			warned1--;
			SAEF_warn("blitter.waitingblits() waiting blits detected");
		}
		return SAEV_Blitter_bltstate == SAEC_Blitter_bltstate_DONE;
	}

	function blitter_start_init() {
		blt_info.blitzero = 1;
		preva = 0;
		prevb = 0;
		blit_frozen = 0;
		blitline_started = bltcon1 & 1;

		blit_bltset(1 | 2);
		blit_modset();
		ddat1use = ddat2use = 0;
		SAEV_Blitter_interrupt = false;

		if (blitline) {
			blinea = blt_info.bltadat;
			blineb = (blt_info.bltbdat >> blt_info.blitbshift) | ((blt_info.bltbdat << (16 - blt_info.blitbshift)) & 0xffff);
			blitonedot = 0;
			blitlinepixel = 0;
			blitsing = bltcon1 & 0x2;
		}
	}

	function do_blitter2(hpos, copper) {
		var cycles;

		/*if ((log_blitter & 2)) {
			if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE) {
				if (blit_final)
					SAEF_log("blitter.do_blitter2() blitter was already active!");
			}
		}*/

		var cleanstart = 0;
		if (SAEV_Blitter_bltstate == SAEC_Blitter_bltstate_DONE) {
			if (blit_faulty > 0)
				blit_faulty = 0;
			cleanstart = 1;
		}

		SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_DONE;

		blitter_cycle_exact = SAEV_config.chipset.blitter.cycle_exact;
		immediate_blits = SAEV_config.chipset.blitter.immediate;
		blt_info.got_cycle = 0;
		last_blitter_hpos = hpos + 1;
		blit_firstline_cycles = blit_first_cycle = SAEV_Events_currcycle;
		blit_misscyclecounter = 0;
		blit_last_cycle = 0;
		blit_maxcyclecounter = 0;
		blit_cyclecounter = 0;
		blit_totalcyclecounter = 0;

		blitter_start_init();

		if (blitline) {
			cycles = blt_info.vblitsize;
		} else {
			cycles = blt_info.vblitsize * blt_info.hblitsize;
			blit_firstline_cycles = blit_first_cycle + (blit_diag[0] * blt_info.hblitsize) * SAEC_Events_CYCLE_UNIT + SAEV_CPU_cycles;
		}

		if (cleanstart) {
			original_ch = blit_ch;
			original_fill = blitfill;
			original_line = blitline;
		}

		/*if (log_blitter & 1) {
			blitter_dontdo = 0;
			if (1) {
				var ch = 0;
				if (blit_ch & 1) ch++;
				if (blit_ch & 2) ch++;
				if (blit_ch & 4) ch++;
				if (blit_ch & 8) ch++;
				SAEF_log("blitter.do_blitter2() blitstart: %dx%d ch=%d %d*%d=%d d=%d f=%02x n=%d pc=%08x l=%d dma=%04x %s",
					blt_info.hblitsize, blt_info.vblitsize, ch, blit_diag[0], cycles, blit_diag[0] * cycles,
					blitdesc ? 1 : 0, blitfill, SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTPRI) ? 1 : 0, SAER_CPU_getPC(), blitline,
					SAEV_Custom_dmacon, ((SAEV_Custom_dmacon & (SAEC_Custom_DMAF_DMAEN | SAEC_Custom_DMAF_BLTEN)) == (SAEC_Custom_DMAF_DMAEN | SAEC_Custom_DMAF_BLTEN)) ? "" : " off!");
				blitter_dump();
			}
		}*/

		SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_INIT;
		blit_slowdown = 0;

		SAEF_clrSpcFlags(SAEC_spcflag_BLTNASTY);
		if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTPRI))
			SAEF_setSpcFlags(SAEC_spcflag_BLTNASTY);

		if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN))
			SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_WORK;

		blit_maxcyclecounter = 0x7fffffff;
		blit_waitcyclecounter = 0;

		if (blitter_cycle_exact) {
			if (immediate_blits) {
				if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN))
					blitter_doit();
				return;
			}
			/*if (log_blitter & 8)
				SAER.blitter.handler(0);
			else*/
			{
				blitter_hcounter1 = blitter_hcounter2 = 0;
				blitter_vcounter1 = blitter_vcounter2 = 0;
				if (blit_nod)
					blitter_vcounter2 = blt_info.vblitsize;
				blit_cyclecounter = -BLITTER_STARTUP_CYCLES;
				blit_waitcyclecounter = copper;
				blit_startcycles = 0;
				blit_maxcyclecounter = blt_info.hblitsize * blt_info.vblitsize + 2;
			}
			return;
		}

		if (blt_info.vblitsize == 0 || (blitline && blt_info.hblitsize != 2)) {
			if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN))
				blitter_done(hpos);
			return;
		}

		if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN))
			blt_info.got_cycle = 1;

		if (immediate_blits) {
			if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN))
				blitter_doit();
			return;
		}

		blit_cyclecounter = cycles * (blit_dmacount2 + (blit_nod ? 0 : 1));
		SAER.events.event2_newevent(SAEC_Events_EV2_BLITTER, blit_cyclecounter, 0);

		if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN)) {
			if (SAEV_config.chipset.blitter.waiting) {
				// wait immediately if all cycles in use and blitter nastry
				if (blit_dmacount == blit_diag[0] && (SAEV_spcflags & SAEC_spcflag_BLTNASTY)) {
					waitingblits();
				}
			}
		}
	}

	this.blitter_check_start = function() {
		if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_INIT)
			return;
		blitter_start_init();
		SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_WORK;
		if (immediate_blits)
			blitter_doit();
	}

	function do_blitter(hpos, copper) {
		if (SAEV_Blitter_bltstate == SAEC_Blitter_bltstate_DONE || !blitter_cycle_exact) {
			do_blitter2(hpos, copper);
			return;
		}
		if (!SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN) || !blt_info.got_cycle)
			return;
		// previous blit may have last write cycle left
		// and we must let it finish
		blit_startcycles = BLITTER_STARTUP_CYCLES;
		blit_waitcyclecounter = copper;
	}

	function maybe_blit(hpos, hack) {
		reset_channel_mods();

		if (SAEV_Blitter_bltstate == SAEC_Blitter_bltstate_DONE)
			return;

		if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN)) {
			var doit = false;
			if (SAEV_config.chipset.blitter.waiting == 3) { // always
				doit = true;
			} else if (SAEV_config.chipset.blitter.waiting == 2) { // noidle
				if (blit_dmacount == blit_diag[0] && (SAEV_spcflags & SAEC_spcflag_BLTNASTY))
					doit = true;
			} else if (SAEV_config.chipset.blitter.waiting == 1) { // automatic
				if (blit_dmacount == blit_diag[0] && (SAEV_spcflags & SAEC_spcflag_BLTNASTY))
					doit = true;
				else if (SAEV_config.cpu.speed < 0)
					doit = true;
			} //else {} never

			if (doit) {
				if (waitingblits())
					return;
			}
		}

		if (warned2 && SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN) && blt_info.got_cycle) {
			warned2--;
			//debugtest (DEBUGTEST_BLITTER, "program does not wait for blitter tc=%d", blit_cyclecounter);
			//if (log_blitter) warned2 = 0;
			//if (log_blitter & 2)
			{
				//warned2 = 10;
				SAEF_warn("blitter.maybe_blit() program does not wait for blitter");
				//blitter_done(hpos);
			}
		}

		if (blitter_cycle_exact) {
			SAER.blitter.decide_blitter(hpos);
			//if (log_blitter) blitter_delayed_debug = 1;
			return;
		}
		if (hack == 1 && SAEV_Events_currcycle - blit_firstline_cycles < 0) {
			//if (log_blitter) blitter_delayed_debug = 1;
			return;
		}
		SAER.blitter.handler(0);
	}

	this.check_is_blit_dangerous = function(bplpt, planes, words) {
		SAEV_Blitter_dangerous = false;
		if (SAEV_Blitter_bltstate == SAEC_Blitter_bltstate_DONE || !blitter_cycle_exact)
			return;
		for (var i = 0; i < planes; i++) {
			var bpl = bplpt[i];
			//var dpt = bltdpt & chipmem_bank.mask;
			var dpt = (bltdpt & SAEV_Memory_chipMask) >>> 0;
			if (dpt >= bpl - 2 * words && dpt < bpl + 2 * words) {
				SAEV_Blitter_dangerous = true;
				return;
			}
		}
	}

	this.blitnasty = function() {
		if (SAEV_Blitter_bltstate == SAEC_Blitter_bltstate_DONE)
			return 0;
		if (!SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN))
			return 0;
		if (blitter_cycle_exact) {
			blitter_force_finish();
			return -1;
		}
		if (blit_last_cycle >= blit_diag[0] && blit_dmacount == blit_diag[0])
			return 0;
		var cycles = ((SAEV_Events_currcycle - blit_first_cycle) * SAEC_Events_CYCLE_UNIT_INV) >>> 0;
		var ccnt = 0;
		while (blit_last_cycle < cycles) {
			var c = channel_state(blit_last_cycle++);
			if (!c) ccnt++;
		}
		return ccnt;
	}

	/* very approximate emulation of blitter slowdown caused by bitplane DMA */
	this.blitter_slowdown = function(ddfstrt, ddfstop, totalcycles, freecycles) {
		//static int oddfstrt, oddfstop, ototal, ofree, slow;

		if (!totalcycles || ddfstrt < 0 || ddfstop < 0)
			return;
		if (ddfstrt != oddfstrt || ddfstop != oddfstop || totalcycles != ototal || ofree != freecycles) {
			var linecycles = (((ddfstop - ddfstrt + totalcycles - 1) / totalcycles) * totalcycles) >>> 0;
			var freelinecycles = (((ddfstop - ddfstrt + totalcycles - 1) / totalcycles) * freecycles) >>> 0;
			var dmacycles = ((linecycles * blit_dmacount) / blit_diag[0]) >>> 0;
			oddfstrt = ddfstrt;
			oddfstop = ddfstop;
			ototal = totalcycles;
			ofree = freecycles;
			slow = 0;
			if (dmacycles > freelinecycles)
				slow = dmacycles - freelinecycles;
		}
		if (blit_slowdown < 0 || blitline)
			return;
		blit_slowdown += slow;
		blit_misscyclecounter += slow;
	}

	/*-----------------------------------------------------------------------*/

	this.BLTADAT = function(hpos, v) {
		maybe_blit(hpos, 0);
		blt_info.bltadat = v;
	}
	this.BLTBDAT = function(hpos, v) {
		maybe_blit(hpos, 0);
		if (bltcon1 & 2)
			blt_info.bltbhold = (v << (bltcon1 >> 12)) & 0xffff;
		else
			blt_info.bltbhold = (v >> (bltcon1 >> 12)) & 0xffff;
		blt_info.bltbdat = v;
	}
	this.BLTCDAT = function(hpos, v) {
		maybe_blit(hpos, 0);
		blt_info.bltcdat = v;
		reset_blit(0);
	}

	this.BLTAMOD = function(hpos, v) {
		maybe_blit(hpos, 1);
		//blt_info.bltamod = (uae_s16)(v & 0xFFFE); //ORG
		blt_info.bltamod = v & 0xfffe; if (blt_info.bltamod & 0x8000) blt_info.bltamod -= 0x10000; //OWN
		reset_blit(0);
	}
	this.BLTBMOD = function(hpos, v) {
		maybe_blit(hpos, 1);
		//blt_info.bltbmod = (uae_s16)(v & 0xFFFE); //ORG
		blt_info.bltbmod = v & 0xfffe; if (blt_info.bltbmod & 0x8000) blt_info.bltbmod -= 0x10000; //OWN
		reset_blit(0);
	}
	this.BLTCMOD = function(hpos, v) {
		maybe_blit(hpos, 1);
		//blt_info.bltcmod = (uae_s16)(v & 0xFFFE); //ORG
		blt_info.bltcmod = v & 0xfffe; if (blt_info.bltcmod & 0x8000) blt_info.bltcmod -= 0x10000; //OWN
		reset_blit(0);
	}
	this.BLTDMOD = function(hpos, v) {
		maybe_blit(hpos, 1);
		//blt_info.bltdmod = (uae_s16)(v & 0xFFFE); //ORG
		blt_info.bltdmod = v & 0xfffe; if (blt_info.bltdmod & 0x8000) blt_info.bltdmod -= 0x10000; //OWN
		reset_blit(0);
	}

	this.BLTCON0 = function(hpos, v) {
		maybe_blit(hpos, 2);
		bltcon0 = v;
		reset_blit(1);
	}
	this.BLTCON0L = function(hpos, v) {
		//if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS)) return;
		maybe_blit(hpos, 2);
		bltcon0 = (bltcon0 & 0xFF00) | (v & 0xFF);
		reset_blit(1);
	}
	this.BLTCON1 = function(hpos, v) {
		maybe_blit(hpos, 2);
		bltcon1 = v;
		reset_blit(2);
	}

	this.BLTAFWM = function(hpos, v) {
		maybe_blit(hpos, 2);
		blt_info.bltafwm = v;
		reset_blit(0);
	}
	this.BLTALWM = function(hpos, v) {
		maybe_blit(hpos, 2);
		blt_info.bltalwm = v;
		reset_blit(0);
	}

	this.BLTAPTH = function(hpos, v) {
		v = v & (SAEV_config.chipset.mask == SAEC_Config_Chipset_Mask_OCS ? 7 : 31); //OWN
		maybe_blit(hpos, 0);
		if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && SAEV_config.chipset.blitter.cycle_exact) {
			bltptx = ((bltapt & 0xffff) | (v << 16)) >>> 0;
			bltptxpos = hpos;
			bltptxc = 1;
		} else {
			bltapt = ((bltapt & 0xffff) | (v << 16)) >>> 0;
		}
	}
	this.BLTAPTL = function(hpos, v) {
		maybe_blit(hpos, 0);
		if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && SAEV_config.chipset.blitter.cycle_exact) {
			bltptx = ((bltapt & 0xffff0000) | (v & 0xfffe)) >>> 0;
			bltptxpos = hpos;
			bltptxc = 1;
		} else {
			bltapt = ((bltapt & 0xffff0000) | (v & 0xfffe)) >>> 0;
		}
	}
	this.BLTBPTH = function(hpos, v) {
		v = v & (SAEV_config.chipset.mask == SAEC_Config_Chipset_Mask_OCS ? 7 : 31); //OWN
		maybe_blit(hpos, 0);
		if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && SAEV_config.chipset.blitter.cycle_exact) {
			bltptx = ((bltbpt & 0xffff) | (v << 16)) >>> 0;
			bltptxpos = hpos;
			bltptxc = 2;
		} else {
			bltbpt = ((bltbpt & 0xffff) | (v << 16)) >>> 0;
		}
	}
	this.BLTBPTL = function(hpos, v) {
		maybe_blit(hpos, 0);
		if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && SAEV_config.chipset.blitter.cycle_exact) {
			bltptx = ((bltbpt & 0xffff0000) | (v & 0xfffe)) >>> 0;
			bltptxpos = hpos;
			bltptxc = 2;
		} else {
			bltbpt = ((bltbpt & 0xffff0000) | (v & 0xfffe)) >>> 0;
		}
	}
	this.BLTCPTH = function(hpos, v) {
		v = v & (SAEV_config.chipset.mask == SAEC_Config_Chipset_Mask_OCS ? 7 : 31); //OWN
		maybe_blit(hpos, 0);
		if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && SAEV_config.chipset.blitter.cycle_exact) {
			bltptx = ((bltcpt & 0xffff) | (v << 16)) >>> 0;
			bltptxpos = hpos;
			bltptxc = 3;
		} else {
			bltcpt = ((bltcpt & 0xffff) | (v << 16)) >>> 0;
		}
	}
	this.BLTCPTL = function(hpos, v) {
		maybe_blit(hpos, 0);
		if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && SAEV_config.chipset.blitter.cycle_exact) {
			bltptx = ((bltcpt & 0xffff0000) | (v & 0xfffe)) >>> 0;
			bltptxpos = hpos;
			bltptxc = 3;
		} else {
			bltcpt = ((bltcpt & 0xffff0000) | (v & 0xfffe)) >>> 0;
		}
	}
	this.BLTDPTH = function(hpos, v) {
		v = v & (SAEV_config.chipset.mask == SAEC_Config_Chipset_Mask_OCS ? 7 : 31); //OWN
		maybe_blit(hpos, 0);
		if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && SAEV_config.chipset.blitter.cycle_exact) {
			bltptx = ((bltdpt & 0xffff) | (v << 16)) >>> 0;
			bltptxpos = hpos;
			bltptxc = 4;
		} else {
			bltdpt = ((bltdpt & 0xffff) | (v << 16)) >>> 0;
		}
	}
	this.BLTDPTL = function(hpos, v) {
		maybe_blit(hpos, 0);
		if (SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && SAEV_config.chipset.blitter.cycle_exact) {
			bltptx = ((bltdpt & 0xffff0000) | (v & 0xfffe)) >>> 0;
			bltptxpos = hpos;
			bltptxc = 4;
		} else {
			bltdpt = ((bltdpt & 0xffff0000) | (v & 0xfffe)) >>> 0;
		}
	}

	this.BLTSIZE = function(hpos, v) {
		maybe_blit(hpos, 0);

		blt_info.vblitsize = v >> 6;
		blt_info.hblitsize = v & 0x3F;
		if (!blt_info.vblitsize)
			blt_info.vblitsize = 1024;
		if (!blt_info.hblitsize)
			blt_info.hblitsize = 64;
		do_blitter(hpos, SAEV_Copper_access);
		SAER.playfield.dcheck_is_blit_dangerous();
	}

	this.BLTSIZV = function(hpos, v) {
		//if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS)) return;
		maybe_blit(hpos, 0);
		blt_info.vblitsize = v & 0x7FFF;
	}

	this.BLTSIZH = function(hpos, v) {
		//if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS)) return;
		maybe_blit(hpos, 0);
		blt_info.hblitsize = v & 0x7FF;
		if (!blt_info.vblitsize)
			blt_info.vblitsize = 0x8000;
		if (!blt_info.hblitsize)
			blt_info.hblitsize = 0x0800;
		do_blitter(hpos, SAEV_Copper_access);
	}

	/*-----------------------------------------------------------------------*/

	function build_blitfilltable() {
		const BLITTER_MAX_WORDS = 2048;

		if (blit_masktable !== null) return;

		blit_masktable = new Uint32Array(BLITTER_MAX_WORDS);
		for (var i = 0; i < blit_masktable.length; i++)
			blit_masktable[i] = 0xFFFF;

		blit_filltable = new Array(256);
		for (var d = 0; d < 256; d++) {
			blit_filltable[d] = new Array(4);
			for (var i = 0; i < 4; i++) {
				var fc = i & 1;
				var data = d; //u8
				blit_filltable[d][i] = new Uint8Array(2);
				for (var fillmask = 1; fillmask != 0x100; fillmask <<= 1) {
					var tmp = data; //u16
					if (fc) {
						if (i & 2)
							data |= fillmask;
						else
							data ^= fillmask;
					}
					if (tmp & fillmask) fc = !fc;
				}
				blit_filltable[d][i][0] = data;
				blit_filltable[d][i][1] = fc;
			}
		}
	}

	function build_blitfunctable() {
		if (blit_func_tab !== null) return;

		var i = 0;
		blit_func_tab = new Array(256);
		blit_func_tab[i++] = function(a, b, c) { return 0; };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (~c & b & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (c & b & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (b & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (b & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (b & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (~a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (~c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & ~b); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b & ~a) | (~c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (~c & ~b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (~c & b & ~a) | (~c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & ~a) | (~c & ~b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b & ~a) | (~c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (c & b & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (~c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & ~a) | (~c & ~b); };
		blit_func_tab[i++] = function(a, b, c) { return (b & ~a) | (~c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (b & ~a) | (~c & ~b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (b & ~a) | (~c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~a) | (~c & ~b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & ~b); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b & ~a) | (c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (~c & b & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & ~a) | (c & ~b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b & ~a) | (c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (c & b & ~a) | (c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (c & ~b); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & ~a) | (c & ~b); };
		blit_func_tab[i++] = function(a, b, c) { return (b & ~a) | (c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (b & ~a) | (c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (b & ~a) | (c & ~b); };
		blit_func_tab[i++] = function(a, b, c) { return (~a) | (c & ~b); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b & ~a) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (~c & b & ~a) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b) | (~c & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b & ~a) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (c & b & ~a) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b) | (c & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (b & ~a) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (b & ~a) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (b & ~a) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~a) | (~b); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & ~a) | (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b & ~a) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (c & b & ~a) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & ~a) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (b & ~a) | (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (b & ~a) | (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (b & ~a) | (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~a) | (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (~c & b) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b & ~a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (c & b & ~a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & ~a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (b & ~a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c) | (b & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (b & ~a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~a) | (~c); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & a) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (c & ~b & a) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & ~b) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b) | (c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (c & ~b & a) | (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & ~a) | (c & ~b) | (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b & ~a) | (c & ~b & a) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (c & b & ~a) | (c & ~b & a) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (c & ~b) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & ~a) | (c & ~b) | (~c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (b & ~a) | (c & ~b & a) | (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (b & ~a) | (c & ~b & a) | (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (b & ~a) | (c & ~b) | (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~a) | (c & ~b) | (~c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (~b & a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (~b & a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (~c & b) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b) | (~c); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b & ~a) | (~b & a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (c & b & ~a) | (~b & a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (~b & a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b) | (c & ~a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (b & ~a) | (~b & a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c) | (b & ~a) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (b & ~a) | (~b & a) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~a) | (~b) | (~c); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b & ~a) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (~c & b & ~a) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & ~a) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & ~a) | (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (b & ~a) | (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (b & ~a) | (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (b & ~a) | (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~a) | (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & a) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (~c & ~b & a) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & ~b) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b & ~a) | (~c & ~b & a) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (~c & ~b) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (~c & b & ~a) | (~c & ~b & a) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & ~a) | (~c & ~b) | (c & b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b) | (~c & ~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (~c & ~b & a) | (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & ~a) | (~c & ~b) | (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (b & ~a) | (~c & ~b & a) | (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (b & ~a) | (~c & ~b) | (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (b & ~a) | (~c & ~b & a) | (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (~a) | (~c & ~b) | (c & b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b & ~a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (~c & b & ~a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & ~a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (c & b) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c); };
		blit_func_tab[i++] = function(a, b, c) { return (b & ~a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (b & ~a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c) | (b & ~a); };
		blit_func_tab[i++] = function(a, b, c) { return (~a) | (c); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (~b & a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (~b & a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b & ~a) | (~b & a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (~b & a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (~c & b & ~a) | (~b & a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b) | (~c & ~a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (c & b) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b) | (c); };
		blit_func_tab[i++] = function(a, b, c) { return (b & ~a) | (~b & a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (b & ~a) | (~b & a) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c) | (b & ~a) | (~b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~a) | (~b) | (c); };
		blit_func_tab[i++] = function(a, b, c) { return (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (~c & b) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & ~a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (c & b) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & ~a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (b); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (b); };
		blit_func_tab[i++] = function(a, b, c) { return (~a) | (b); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (~c & a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b) | (~c & a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b & ~a) | (~c & b) | (~c & a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (c & b) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (~c & a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & ~a) | (~c & a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (b) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c) | (b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~a) | (b) | (~c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~a) | (~c) | (b); };
		blit_func_tab[i++] = function(a, b, c) { return (c & a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (c & a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c & a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (c & a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (~c & b) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (~c & ~a) | (c & a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b) | (c & a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b & ~a) | (c & b) | (c & a) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b & ~a) | (c) | (b & a); };
		blit_func_tab[i++] = function(a, b, c) { return (b) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~a) | (b) | (c & a); };
		blit_func_tab[i++] = function(a, b, c) { return (c) | (b); };
		blit_func_tab[i++] = function(a, b, c) { return (~a) | (c) | (b); };
		blit_func_tab[i++] = function(a, b, c) { return (a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b) | (a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & b) | (a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c) | (a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & ~b) | (~c & b) | (a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b) | (~c) | (a); };
		blit_func_tab[i++] = function(a, b, c) { return (c & b) | (a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c & ~b) | (c & b) | (a); };
		blit_func_tab[i++] = function(a, b, c) { return (c) | (a); };
		blit_func_tab[i++] = function(a, b, c) { return (~b) | (c) | (a); };
		blit_func_tab[i++] = function(a, b, c) { return (b) | (a); };
		blit_func_tab[i++] = function(a, b, c) { return (~c) | (b) | (a); };
		blit_func_tab[i++] = function(a, b, c) { return (c) | (b) | (a); };
		blit_func_tab[i  ] = function(a, b, c) { return 0xffff; };
	}

	/*-----------------------------------------------------------------------*/
	/* auto-generated speedup-functions */

	const blitfunc_dofast = [
		blitdofast_0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_a, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_2a, 0, 0, 0, 0, 0,
		blitdofast_30, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_3a, 0, blitdofast_3c, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_4a, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_6a, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_8a, 0, blitdofast_8c, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_9a, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		blitdofast_a8, 0, blitdofast_aa, 0, 0, 0, 0, 0,
		0, blitdofast_b1, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_ca, 0, blitdofast_cc, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		blitdofast_d8, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_e2, 0, 0, 0, 0, 0,
		0, 0, blitdofast_ea, 0, 0, 0, 0, 0,
		blitdofast_f0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_fa, 0, blitdofast_fc, 0, 0, 0
	];

	const blitfunc_dofast_desc = [
		blitdofast_desc_0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_desc_a, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_desc_2a, 0, 0, 0, 0, 0,
		blitdofast_desc_30, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_desc_3a, 0, blitdofast_desc_3c, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_desc_4a, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_desc_6a, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_desc_8a, 0, blitdofast_desc_8c, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_desc_9a, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		blitdofast_desc_a8, 0, blitdofast_desc_aa, 0, 0, 0, 0, 0,
		0, blitdofast_desc_b1, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_desc_ca, 0, blitdofast_desc_cc, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0,
		blitdofast_desc_d8, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_desc_e2, 0, 0, 0, 0, 0,
		0, 0, blitdofast_desc_ea, 0, 0, 0, 0, 0,
		blitdofast_desc_f0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, blitdofast_desc_fa, 0, blitdofast_desc_fc, 0, 0, 0
	];

	function blitdofast_0(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = 0 & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (ptd) ptd += b.bltdmod;
		}
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_0(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = 0 & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (ptd) ptd -= b.bltdmod;
		}
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_a(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (~srca & srcc) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_a(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (~srca & srcc) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_2a(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc & ~(srca & srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_2a(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc & ~(srca & srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_30(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srca & ~srcb) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_30(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srca & ~srcb) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_3a(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcb ^ (srca | (srcb ^ srcc))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_3a(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcb ^ (srca | (srcb ^ srcc))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_3c(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srca ^ srcb) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_3c(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srca ^ srcb) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_4a(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc ^ (srca & (srcb | srcc))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_4a(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc ^ (srca & (srcb | srcc))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_6a(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc ^ (srca & srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_6a(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc ^ (srca & srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_8a(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc & (~srca | srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_8a(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc & (~srca | srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_8c(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcb & (~srca | srcc)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_8c(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcb & (~srca | srcc)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_9a(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc ^ (srca & ~srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_9a(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc ^ (srca & ~srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_a8(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc & (srca | srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_a8(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc & (srca | srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_aa(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = srcc & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_aa(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = srcc & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_b1(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = ~(srca ^ (srcc | (srca ^ srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_b1(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = ~(srca ^ (srcc | (srca ^ srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_ca(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc ^ (srca & (srcb ^ srcc))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_ca(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc ^ (srca & (srcb ^ srcc))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_cc(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = srcb & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (ptb) ptb += b.bltbmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_cc(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = srcb & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (ptb) ptb -= b.bltbmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_d8(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srca ^ (srcc & (srca ^ srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_d8(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srca ^ (srcc & (srca ^ srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_e2(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc ^ (srcb & (srca ^ srcc))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_e2(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc ^ (srcb & (srca ^ srcc))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_ea(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc | (srca & srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_ea(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srcc | (srca & srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_f0(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = srca & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptd) ptd += b.bltdmod;
		}
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_f0(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = srca & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptd) ptd -= b.bltdmod;
		}
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_fa(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc += 2; }
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srca | srcc) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_fa(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = (SAER_Memory_chipData[ptc] << 8) | SAER_Memory_chipData[ptc + 1]; ptc -= 2; }
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srca | srcc) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_fc(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb += 2;
					srcb = (((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((preva << 16) | bltadat) >>> 0) >>> b.blitashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srca | srcb) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_fc(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptb) {
					var bltbdat = blt_info.bltbdat = (SAER_Memory_chipData[ptb] << 8) | SAER_Memory_chipData[ptb + 1]; ptb -= 2;
					srcb = (((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = (SAER_Memory_chipData[pta] << 8) | SAER_Memory_chipData[pta + 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = (((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift;
				preva = bltadat;
				if (dstp) {
					SAER_Memory_chipData[dstp] = dstd >> 8;
					SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
				}
				dstd = (srca | srcb) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) {
			SAER_Memory_chipData[dstp] = dstd >> 8;
			SAER_Memory_chipData[dstp + 1] = dstd & 0xff;
		}
		if (totald != 0) b.blitzero = 0;
	}
}
