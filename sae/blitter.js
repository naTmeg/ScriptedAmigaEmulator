/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger        
* Commercial use is prohibited.
*
***************************************************************************
* Notes: Ported from WinUAE 2.5.0
* 
**************************************************************************/

function Blitter() {	
	const FAST = true;
	const BLITTER_MAX_WORDS = 2048;

	const blit_cycle_diagram = [
		[2, 0,0,     0,0    ], /* 0   -- */
		[2, 0,0,     0,4    ], /* 1   -D */
		[2, 0,3,     0,3    ], /* 2   -C */
		[3, 0,3,0,   0,3,4  ], /* 3  -CD */
		[3, 0,2,0,   0,2,0  ], /* 4  -B- */
		[3, 0,2,0,   0,2,4  ], /* 5  -BD */
		[3, 0,2,3,   0,2,3  ], /* 6  -BC */
		[4, 0,2,3,0, 0,2,3,4], /* 7 -BCD */
		[2, 1,0,     1,0    ], /* 8   A- */
		[2, 1,0,     1,4    ], /* 9   AD */
		[2, 1,3,	    1,3    ], /* A   AC */
		[3, 1,3,0,   1,3,4  ], /* B  ACD */
		[3, 1,2,0,   1,2,0  ], /* C  AB- */
		[3, 1,2,0,   1,2,4  ], /* D  ABD */
		[3, 1,2,3,   1,2,3  ], /* E  ABC */
		[4, 1,2,3,0, 1,2,3,4]  /* F ABCD */
	];
	const blit_cycle_diagram_fill = [
		[0                  ], /* 0 */
		[3, 0,0,0,   0,4,0  ], /* 1 */
		[0                  ], /* 2 */
		[0                  ], /* 3 */
		[0                  ], /* 4 */
		[4, 0,2,0,0, 0,2,4,0], /* 5 */
		[0                  ], /* 6 */
		[0                  ], /* 7 */
		[0                  ], /* 8 */
		[3, 1,0,0,   1,4,0  ], /* 9 */
		[0                  ], /* A */
		[0                  ], /* B */
		[0                  ], /* C */
		[4, 1,2,0,0, 1,2,4,0], /* D */
		[0                  ], /* E */
		[0                  ]  /* F */
	];
	const blit_cycle_diagram_line = [4, 0,3,5,4, 0,3,5,4];
	//const blit_cycle_diagram_finald = [2, 0,4, 0,4];
	//const blit_cycle_diagram_finalld = [2, 0,0, 0,0];
	
	var blit_filltable = [];
	var blit_masktable = [];
	var blit_interrupt = true;
	var blit_ch = 0;
	var blit_slowdown = 0;
	var blit_stuck = 0;
	var blit_cyclecounter = 0;
	var blit_firstline_cycles = 0;
	var blit_first_cycle = 0;
	var blit_last_cycle = 0, blit_dmacount = 0, blit_dmacount2 = 0;	
	var blit_nod = 0;
	var blit_diag = [];
	var blit_faulty = 0;
	var original_ch = 0, original_fill = 0, original_line = 0;	
	
 	var bltstate = BLT_done;

	var bltcon0 = 0;
	var bltcon1 = 0;
	var bltapt = 0;
	var bltapt_line = null;
	var bltbpt = 0;
	var bltcpt = 0;	
	var bltdpt = 0;	

	var blinea_shift = 0;
	var blinea = 0, blineb = 0;
	var blitline = 0, blitfc = 0, blitfill = 0, blitife = 0, blitsing = 0, blitdesc = 0;
	var blitonedot = 0, blitsign = 0, blitlinepixel = 0;

	var ddat1use = 0, ddat2use = 0;
	var last_blitter_hpos = 0;
	
	var blt_info = {	
		blitzero:0,
		blitashift:0, blitbshift:0, blitdownashift:0, blitdownbshift:0,
		bltadat:0, bltbdat:0, bltcdat:0, bltddat:0,
		bltahold:0, bltbhold:0, bltafwm:0, bltalwm:0,
		vblitsize:0, hblitsize:0,
		bltamod:0, bltbmod:0, bltcmod:0, bltdmod:0,
		got_cycle:0
	};

	//function build_blitfilltable()
	{
		blit_masktable = new Uint16Array(BLITTER_MAX_WORDS);
		for (var i = 0; i < BLITTER_MAX_WORDS; i++)
			blit_masktable[i] = 0xffff;

		blit_filltable = [];
		for (var d = 0; d < 256; d++) {
			blit_filltable[d] = [];
			for (var i = 0; i < 4; i++) {
				var fc = (i & 1) == 1;
				var data = d;
				blit_filltable[d][i] = [];				
				for (var fillmask = 1; fillmask != 0x100; fillmask <<= 1) {
					var tmp = data;
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

	/*---------------------------------*/

	this.reset = function () {
      bltstate = BLT_done;
      blit_interrupt = true;
      blit_stuck = 0;
   };

	/*function blitter_dump() {
		BUG.info('PT A=%08X B=%08X C=%08X D=%08X', bltapt, bltbpt, bltcpt, bltdpt);
		BUG.info('CON0=%04X CON1=%04X DAT A=%04X B=%04X C=%04X', bltcon0, bltcon1, blt_info.bltadat, blt_info.bltbdat, blt_info.bltcdat);
		//BUG.info('AFWM=%04X ALWM=%04X MOD A=%04X B=%04X C=%04X D=%04X', blt_info.bltafwm, blt_info.bltalwm, blt_info.bltamod & 0xffff, blt_info.bltbmod & 0xffff, blt_info.bltcmod & 0xffff, blt_info.bltdmod & 0xffff);
		BUG.info('AFWM=%04X ALWM=%04X MOD A=%04X B=%04X C=%04X D=%04X', blt_info.bltafwm, blt_info.bltalwm, blt_info.bltamod, blt_info.bltbmod, blt_info.bltcmod, blt_info.bltdmod);
	}*/

	function castWord(v) {
		return (v & 0x8000) ? (v - 0x10000) : v;
	}

	function get_ch() {
		if (blit_faulty) {
			console.log('get_ch() blit_faulty');			
			return blit_cycle_diagram[0]; //&blit_diag[0];
		} 
		return blit_diag;
	}

	function channel_state(cycles) {
		//console.log('channel_state()', cycles);
		if (cycles < 0)
			return 0;
		var diag = get_ch();
		if (cycles < diag[0])
			return diag[1 + cycles];
		cycles -= diag[0];
		cycles %= diag[0];
		return diag[1 + diag[0] + cycles];
	}
	
	/*function channel_pos(cycles) {
		if (cycles < 0)
			return 0;
		var diag = get_ch();
		if (cycles < diag[0])
			return cycles;
		cycles -= diag[0];
		cycles %= diag[0];
		return cycles;
	}*/

	function blitter_interrupt() {
		if (blit_interrupt)
			return;
		blit_interrupt = true;
		AMIGA.INTREQ_0(INT_BLIT);
	}

	function blitter_done(hpos) {
		ddat1use = ddat2use = 0;
		bltstate = BLT_done;
		blitter_interrupt();
		AMIGA.copper.blitter_done_notify(hpos);
		AMIGA.events.remevent(EV2_BLITTER);
		clr_special(SPCFLAG_BLTNASTY);
	}
	
	/*---------------------------------*/
	/* ~1500 lines of auto-generated functions are follwing... */
	/*---------------------------------*/
			
	function blitdofast_0(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (0) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (ptd) ptd += b.bltdmod;
		}
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (0) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (ptd) ptd -= b.bltdmod;
		}
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((~srca & srcc)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((~srca & srcc)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc & ~(srca & srcb))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc & ~(srca & srcb))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca & ~srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca & ~srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcb ^ (srca | (srcb ^ srcc)))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcb ^ (srca | (srcb ^ srcc)))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca ^ srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca ^ srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & (srcb | srcc)))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & (srcb | srcc)))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & srcb))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & srcb))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc & (~srca | srcb))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc & (~srca | srcb))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcb & (~srca | srcc))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcb & (~srca | srcc))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & ~srcb))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & ~srcb))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc & (srca | srcb))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc & (srca | srcb))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (srcc) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (srcc) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (~(srca ^ (srcc | (srca ^ srcb)))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (~(srca ^ (srcc | (srca ^ srcb)))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & (srcb ^ srcc)))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & (srcb ^ srcc)))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (srcb) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (ptb) ptb += b.bltbmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (srcb) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (ptb) ptb -= b.bltbmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca ^ (srcc & (srca ^ srcb)))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca ^ (srcc & (srca ^ srcb)))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srcb & (srca ^ srcc)))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srcb & (srca ^ srcc)))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc | (srca & srcb))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc | (srca & srcb))) & 0xffff;
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
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (srca) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptd) ptd += b.bltdmod;
		}
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (srca) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptd) ptd -= b.bltdmod;
		}
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca | srcc)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca | srcc)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca | srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
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
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca | srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

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

	function blit_func(a, b, c, mt) {
		switch (mt) {
			case 0x00: return 0;
			case 0x01: return (~c & ~b & ~a);
			case 0x02: return (c & ~b & ~a);
			case 0x03: return (~b & ~a);
			case 0x04: return (~c & b & ~a);
			case 0x05: return (~c & ~a);
			case 0x06: return (c & ~b & ~a) | (~c & b & ~a);
			case 0x07: return (~b & ~a) | (~c & ~a);
			case 0x08: return (c & b & ~a);
			case 0x09: return (~c & ~b & ~a) | (c & b & ~a);
			case 0x0a: return (c & ~a);
			case 0x0b: return (~b & ~a) | (c & ~a);
			case 0x0c: return (b & ~a);
			case 0x0d: return (~c & ~a) | (b & ~a);
			case 0x0e: return (c & ~a) | (b & ~a);
			case 0x0f: return (~a);
			case 0x10: return (~c & ~b & a);
			case 0x11: return (~c & ~b);
			case 0x12: return (c & ~b & ~a) | (~c & ~b & a);
			case 0x13: return (~b & ~a) | (~c & ~b);
			case 0x14: return (~c & b & ~a) | (~c & ~b & a);
			case 0x15: return (~c & ~a) | (~c & ~b);
			case 0x16: return (c & ~b & ~a) | (~c & b & ~a) | (~c & ~b & a);
			case 0x17: return (~b & ~a) | (~c & ~a) | (~c & ~b);
			case 0x18: return (c & b & ~a) | (~c & ~b & a);
			case 0x19: return (~c & ~b) | (c & b & ~a);
			case 0x1a: return (c & ~a) | (~c & ~b & a);
			case 0x1b: return (~b & ~a) | (c & ~a) | (~c & ~b);
			case 0x1c: return (b & ~a) | (~c & ~b & a);
			case 0x1d: return (~c & ~a) | (b & ~a) | (~c & ~b);
			case 0x1e: return (c & ~a) | (b & ~a) | (~c & ~b & a);
			case 0x1f: return (~a) | (~c & ~b);
			case 0x20: return (c & ~b & a);
			case 0x21: return (~c & ~b & ~a) | (c & ~b & a);
			case 0x22: return (c & ~b);
			case 0x23: return (~b & ~a) | (c & ~b);
			case 0x24: return (~c & b & ~a) | (c & ~b & a);
			case 0x25: return (~c & ~a) | (c & ~b & a);
			case 0x26: return (c & ~b) | (~c & b & ~a);
			case 0x27: return (~b & ~a) | (~c & ~a) | (c & ~b);
			case 0x28: return (c & b & ~a) | (c & ~b & a);
			case 0x29: return (~c & ~b & ~a) | (c & b & ~a) | (c & ~b & a);
			case 0x2a: return (c & ~a) | (c & ~b);
			case 0x2b: return (~b & ~a) | (c & ~a) | (c & ~b);
			case 0x2c: return (b & ~a) | (c & ~b & a);
			case 0x2d: return (~c & ~a) | (b & ~a) | (c & ~b & a);
			case 0x2e: return (c & ~a) | (b & ~a) | (c & ~b);
			case 0x2f: return (~a) | (c & ~b);
			case 0x30: return (~b & a);
			case 0x31: return (~c & ~b) | (~b & a);
			case 0x32: return (c & ~b) | (~b & a);
			case 0x33: return (~b);
			case 0x34: return (~c & b & ~a) | (~b & a);
			case 0x35: return (~c & ~a) | (~b & a);
			case 0x36: return (c & ~b) | (~c & b & ~a) | (~b & a);
			case 0x37: return (~b) | (~c & ~a);
			case 0x38: return (c & b & ~a) | (~b & a);
			case 0x39: return (~c & ~b) | (c & b & ~a) | (~b & a);
			case 0x3a: return (c & ~a) | (~b & a);
			case 0x3b: return (~b) | (c & ~a);
			case 0x3c: return (b & ~a) | (~b & a);
			case 0x3d: return (~c & ~a) | (b & ~a) | (~b & a);
			case 0x3e: return (c & ~a) | (b & ~a) | (~b & a);
			case 0x3f: return (~a) | (~b);
			case 0x40: return (~c & b & a);
			case 0x41: return (~c & ~b & ~a) | (~c & b & a);
			case 0x42: return (c & ~b & ~a) | (~c & b & a);
			case 0x43: return (~b & ~a) | (~c & b & a);
			case 0x44: return (~c & b);
			case 0x45: return (~c & ~a) | (~c & b);
			case 0x46: return (c & ~b & ~a) | (~c & b);
			case 0x47: return (~b & ~a) | (~c & ~a) | (~c & b);
			case 0x48: return (c & b & ~a) | (~c & b & a);
			case 0x49: return (~c & ~b & ~a) | (c & b & ~a) | (~c & b & a);
			case 0x4a: return (c & ~a) | (~c & b & a);
			case 0x4b: return (~b & ~a) | (c & ~a) | (~c & b & a);
			case 0x4c: return (b & ~a) | (~c & b);
			case 0x4d: return (~c & ~a) | (b & ~a) | (~c & b);
			case 0x4e: return (c & ~a) | (b & ~a) | (~c & b);
			case 0x4f: return (~a) | (~c & b);
			case 0x50: return (~c & a);
			case 0x51: return (~c & ~b) | (~c & a);
			case 0x52: return (c & ~b & ~a) | (~c & a);
			case 0x53: return (~b & ~a) | (~c & a);
			case 0x54: return (~c & b) | (~c & a);
			case 0x55: return (~c);
			case 0x56: return (c & ~b & ~a) | (~c & b) | (~c & a);
			case 0x57: return (~b & ~a) | (~c);
			case 0x58: return (c & b & ~a) | (~c & a);
			case 0x59: return (~c & ~b) | (c & b & ~a) | (~c & a);
			case 0x5a: return (c & ~a) | (~c & a);
			case 0x5b: return (~b & ~a) | (c & ~a) | (~c & a);
			case 0x5c: return (b & ~a) | (~c & a);
			case 0x5d: return (~c) | (b & ~a);
			case 0x5e: return (c & ~a) | (b & ~a) | (~c & a);
			case 0x5f: return (~a) | (~c);
			case 0x60: return (c & ~b & a) | (~c & b & a);
			case 0x61: return (~c & ~b & ~a) | (c & ~b & a) | (~c & b & a);
			case 0x62: return (c & ~b) | (~c & b & a);
			case 0x63: return (~b & ~a) | (c & ~b) | (~c & b & a);
			case 0x64: return (~c & b) | (c & ~b & a);
			case 0x65: return (~c & ~a) | (c & ~b & a) | (~c & b);
			case 0x66: return (c & ~b) | (~c & b);
			case 0x67: return (~b & ~a) | (~c & ~a) | (c & ~b) | (~c & b);
			case 0x68: return (c & b & ~a) | (c & ~b & a) | (~c & b & a);
			case 0x69: return (~c & ~b & ~a) | (c & b & ~a) | (c & ~b & a) | (~c & b & a);
			case 0x6a: return (c & ~a) | (c & ~b) | (~c & b & a);
			case 0x6b: return (~b & ~a) | (c & ~a) | (c & ~b) | (~c & b & a);
			case 0x6c: return (b & ~a) | (c & ~b & a) | (~c & b);
			case 0x6d: return (~c & ~a) | (b & ~a) | (c & ~b & a) | (~c & b);
			case 0x6e: return (c & ~a) | (b & ~a) | (c & ~b) | (~c & b);
			case 0x6f: return (~a) | (c & ~b) | (~c & b);
			case 0x70: return (~b & a) | (~c & a);
			case 0x71: return (~c & ~b) | (~b & a) | (~c & a);
			case 0x72: return (c & ~b) | (~b & a) | (~c & a);
			case 0x73: return (~b) | (~c & a);
			case 0x74: return (~c & b) | (~b & a);
			case 0x75: return (~c) | (~b & a);
			case 0x76: return (c & ~b) | (~c & b) | (~b & a);
			case 0x77: return (~b) | (~c);
			case 0x78: return (c & b & ~a) | (~b & a) | (~c & a);
			case 0x79: return (~c & ~b) | (c & b & ~a) | (~b & a) | (~c & a);
			case 0x7a: return (c & ~a) | (~b & a) | (~c & a);
			case 0x7b: return (~b) | (c & ~a) | (~c & a);
			case 0x7c: return (b & ~a) | (~b & a) | (~c & a);
			case 0x7d: return (~c) | (b & ~a) | (~b & a);
			case 0x7e: return (c & ~a) | (b & ~a) | (~b & a) | (~c & a);
			case 0x7f: return (~a) | (~b) | (~c);
			case 0x80: return (c & b & a);
			case 0x81: return (~c & ~b & ~a) | (c & b & a);
			case 0x82: return (c & ~b & ~a) | (c & b & a);
			case 0x83: return (~b & ~a) | (c & b & a);
			case 0x84: return (~c & b & ~a) | (c & b & a);
			case 0x85: return (~c & ~a) | (c & b & a);
			case 0x86: return (c & ~b & ~a) | (~c & b & ~a) | (c & b & a);
			case 0x87: return (~b & ~a) | (~c & ~a) | (c & b & a);
			case 0x88: return (c & b);
			case 0x89: return (~c & ~b & ~a) | (c & b);
			case 0x8a: return (c & ~a) | (c & b);
			case 0x8b: return (~b & ~a) | (c & ~a) | (c & b);
			case 0x8c: return (b & ~a) | (c & b);
			case 0x8d: return (~c & ~a) | (b & ~a) | (c & b);
			case 0x8e: return (c & ~a) | (b & ~a) | (c & b);
			case 0x8f: return (~a) | (c & b);
			case 0x90: return (~c & ~b & a) | (c & b & a);
			case 0x91: return (~c & ~b) | (c & b & a);
			case 0x92: return (c & ~b & ~a) | (~c & ~b & a) | (c & b & a);
			case 0x93: return (~b & ~a) | (~c & ~b) | (c & b & a);
			case 0x94: return (~c & b & ~a) | (~c & ~b & a) | (c & b & a);
			case 0x95: return (~c & ~a) | (~c & ~b) | (c & b & a);
			case 0x96: return (c & ~b & ~a) | (~c & b & ~a) | (~c & ~b & a) | (c & b & a);
			case 0x97: return (~b & ~a) | (~c & ~a) | (~c & ~b) | (c & b & a);
			case 0x98: return (c & b) | (~c & ~b & a);
			case 0x99: return (~c & ~b) | (c & b);
			case 0x9a: return (c & ~a) | (~c & ~b & a) | (c & b);
			case 0x9b: return (~b & ~a) | (c & ~a) | (~c & ~b) | (c & b);
			case 0x9c: return (b & ~a) | (~c & ~b & a) | (c & b);
			case 0x9d: return (~c & ~a) | (b & ~a) | (~c & ~b) | (c & b);
			case 0x9e: return (c & ~a) | (b & ~a) | (~c & ~b & a) | (c & b);
			case 0x9f: return (~a) | (~c & ~b) | (c & b);
			case 0xa0: return (c & a);
			case 0xa1: return (~c & ~b & ~a) | (c & a);
			case 0xa2: return (c & ~b) | (c & a);
			case 0xa3: return (~b & ~a) | (c & a);
			case 0xa4: return (~c & b & ~a) | (c & a);
			case 0xa5: return (~c & ~a) | (c & a);
			case 0xa6: return (c & ~b) | (~c & b & ~a) | (c & a);
			case 0xa7: return (~b & ~a) | (~c & ~a) | (c & a);
			case 0xa8: return (c & b) | (c & a);
			case 0xa9: return (~c & ~b & ~a) | (c & b) | (c & a);
			case 0xaa: return (c);
			case 0xab: return (~b & ~a) | (c);
			case 0xac: return (b & ~a) | (c & a);
			case 0xad: return (~c & ~a) | (b & ~a) | (c & a);
			case 0xae: return (c) | (b & ~a);
			case 0xaf: return (~a) | (c);
			case 0xb0: return (~b & a) | (c & a);
			case 0xb1: return (~c & ~b) | (~b & a) | (c & a);
			case 0xb2: return (c & ~b) | (~b & a) | (c & a);
			case 0xb3: return (~b) | (c & a);
			case 0xb4: return (~c & b & ~a) | (~b & a) | (c & a);
			case 0xb5: return (~c & ~a) | (~b & a) | (c & a);
			case 0xb6: return (c & ~b) | (~c & b & ~a) | (~b & a) | (c & a);
			case 0xb7: return (~b) | (~c & ~a) | (c & a);
			case 0xb8: return (c & b) | (~b & a);
			case 0xb9: return (~c & ~b) | (c & b) | (~b & a);
			case 0xba: return (c) | (~b & a);
			case 0xbb: return (~b) | (c);
			case 0xbc: return (b & ~a) | (~b & a) | (c & a);
			case 0xbd: return (~c & ~a) | (b & ~a) | (~b & a) | (c & a);
			case 0xbe: return (c) | (b & ~a) | (~b & a);
			case 0xbf: return (~a) | (~b) | (c);
			case 0xc0: return (b & a);
			case 0xc1: return (~c & ~b & ~a) | (b & a);
			case 0xc2: return (c & ~b & ~a) | (b & a);
			case 0xc3: return (~b & ~a) | (b & a);
			case 0xc4: return (~c & b) | (b & a);
			case 0xc5: return (~c & ~a) | (b & a);
			case 0xc6: return (c & ~b & ~a) | (~c & b) | (b & a);
			case 0xc7: return (~b & ~a) | (~c & ~a) | (b & a);
			case 0xc8: return (c & b) | (b & a);
			case 0xc9: return (~c & ~b & ~a) | (c & b) | (b & a);
			case 0xca: return (c & ~a) | (b & a);
			case 0xcb: return (~b & ~a) | (c & ~a) | (b & a);
			case 0xcc: return (b);
			case 0xcd: return (~c & ~a) | (b);
			case 0xce: return (c & ~a) | (b);
			case 0xcf: return (~a) | (b);
			case 0xd0: return (~c & a) | (b & a);
			case 0xd1: return (~c & ~b) | (b & a);
			case 0xd2: return (c & ~b & ~a) | (~c & a) | (b & a);
			case 0xd3: return (~b & ~a) | (~c & a) | (b & a);
			case 0xd4: return (~c & b) | (~c & a) | (b & a);
			case 0xd5: return (~c) | (b & a);
			case 0xd6: return (c & ~b & ~a) | (~c & b) | (~c & a) | (b & a);
			case 0xd7: return (~b & ~a) | (~c) | (b & a);
			case 0xd8: return (c & b) | (~c & a);
			case 0xd9: return (~c & ~b) | (c & b) | (b & a);
			case 0xda: return (c & ~a) | (~c & a) | (b & a);
			case 0xdb: return (~b & ~a) | (c & ~a) | (~c & a) | (b & a);
			case 0xdc: return (b) | (~c & a);
			case 0xdd: return (~c) | (b);
			case 0xde: return (c & ~a) | (b) | (~c & a);
			case 0xdf: return (~a) | (~c) | (b);
			case 0xe0: return (c & a) | (b & a);
			case 0xe1: return (~c & ~b & ~a) | (c & a) | (b & a);
			case 0xe2: return (c & ~b) | (b & a);
			case 0xe3: return (~b & ~a) | (c & a) | (b & a);
			case 0xe4: return (~c & b) | (c & a);
			case 0xe5: return (~c & ~a) | (c & a) | (b & a);
			case 0xe6: return (c & ~b) | (~c & b) | (b & a);
			case 0xe7: return (~b & ~a) | (~c & ~a) | (c & a) | (b & a);
			case 0xe8: return (c & b) | (c & a) | (b & a);
			case 0xe9: return (~c & ~b & ~a) | (c & b) | (c & a) | (b & a);
			case 0xea: return (c) | (b & a);
			case 0xeb: return (~b & ~a) | (c) | (b & a);
			case 0xec: return (b) | (c & a);
			case 0xed: return (~c & ~a) | (b) | (c & a);
			case 0xee: return (c) | (b);
			case 0xef: return (~a) | (c) | (b);
			case 0xf0: return (a);
			case 0xf1: return (~c & ~b) | (a);
			case 0xf2: return (c & ~b) | (a);
			case 0xf3: return (~b) | (a);
			case 0xf4: return (~c & b) | (a);
			case 0xf5: return (~c) | (a);
			case 0xf6: return (c & ~b) | (~c & b) | (a);
			case 0xf7: return (~b) | (~c) | (a);
			case 0xf8: return (c & b) | (a);
			case 0xf9: return (~c & ~b) | (c & b) | (a);
			case 0xfa: return (c) | (a);
			case 0xfb: return (~b) | (c) | (a);
			case 0xfc: return (b) | (a);
			case 0xfd: return (~c) | (b) | (a);
			case 0xfe: return (c) | (b) | (a);
			case 0xff: return 0xffff;
         default: return 0;
		}
	}
	
	function blitter_dofast() {
		//console.log('blitter_dofast');
		var i,j;
		var bltadatptr = 0, bltbdatptr = 0, bltcdatptr = 0, bltddatptr = 0;
		var mt = bltcon0 & 0xFF;

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

		if (FAST && blitfunc_dofast[mt] !== 0 && !blitfill)
			blitfunc_dofast[mt](bltadatptr, bltbdatptr, bltcdatptr, bltddatptr, blt_info);
		else {
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
						//blt_info.bltadat = bltadat = AMIGA.mem.load16_chip(bltadatptr);
						blt_info.bltadat = bltadat = AMIGA.mem.chip.data[bltadatptr >>> 1];
						bltadatptr += 2;
					} else
						bltadat = blt_info.bltadat;
					bltadat &= blit_masktable[i];
					blitahold = (((preva << 16) | bltadat) >>> 0) >>> blt_info.blitashift;
					preva = bltadat;

					if (bltbdatptr) {
						//blt_info.bltbdat = bltbdat = AMIGA.mem.load16_chip(bltbdatptr);
						blt_info.bltbdat = bltbdat = AMIGA.mem.chip.data[bltbdatptr >>> 1];
						bltbdatptr += 2;
						blitbhold = (((prevb << 16) | bltbdat) >>> 0) >>> blt_info.blitbshift;
						prevb = bltbdat;
					}

					if (bltcdatptr) {
						//blt_info.bltcdat = AMIGA.mem.load16_chip(bltcdatptr);
						blt_info.bltcdat = AMIGA.mem.chip.data[bltcdatptr >>> 1];
						bltcdatptr += 2;
					}
					if (dodst)
						//AMIGA.mem.store16_chip(dstp, blt_info.bltddat);
						AMIGA.mem.chip.data[dstp >>> 1] = blt_info.bltddat;
						
					blt_info.bltddat = (blit_func(blitahold & 0xffff, blitbhold & 0xffff, blt_info.bltcdat & 0xffff, mt) >>> 0) & 0xffff;
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
			if (dodst)
				//AMIGA.mem.store16_chip(dstp, blt_info.bltddat);
				AMIGA.mem.chip.data[dstp >>> 1] = blt_info.bltddat;

			blt_info.bltbhold = blitbhold;
		}
		blit_masktable[0] = 0xffff;
		blit_masktable[blt_info.hblitsize - 1] = 0xffff;

		bltstate = BLT_done;
	}

	function blitter_dofast_desc() {
		//console.log('blitter_dofast_desc');
		var i,j;
		var bltadatptr = 0, bltbdatptr = 0, bltcdatptr = 0, bltddatptr = 0;
		var mt = bltcon0 & 0xFF;

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

		if (FAST && blitfunc_dofast_desc[mt] !== 0 && !blitfill)
			blitfunc_dofast_desc[mt](bltadatptr, bltbdatptr, bltcdatptr, bltddatptr, blt_info);
		else {
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
						//blt_info.bltadat = bltadat = AMIGA.mem.load16_chip(bltadatptr);
						blt_info.bltadat = bltadat = AMIGA.mem.chip.data[bltadatptr >>> 1];
						bltadatptr -= 2;
					} else
						bltadat = blt_info.bltadat;
					bltadat &= blit_masktable[i];
					blitahold = (((bltadat << 16) | preva) >>> 0) >> blt_info.blitdownashift;
					preva = bltadat;

					if (bltbdatptr) {
						//blt_info.bltbdat = bltbdat = AMIGA.mem.load16_chip(bltbdatptr);
						blt_info.bltbdat = bltbdat = AMIGA.mem.chip.data[bltbdatptr >>> 1];
						bltbdatptr -= 2;
						blitbhold = (((bltbdat << 16) | prevb) >>> 0) >> blt_info.blitdownbshift;
						prevb = bltbdat;
					}

					if (bltcdatptr) {
						//blt_info.bltcdat = blt_info.bltbdat = AMIGA.mem.load16_chip(bltcdatptr);
						blt_info.bltcdat = blt_info.bltbdat = AMIGA.mem.chip.data[bltcdatptr >>> 1];
						bltcdatptr -= 2;
					}
					if (dodst)
						//AMIGA.mem.store16_chip(dstp, blt_info.bltddat);
						AMIGA.mem.chip.data[dstp >>> 1] = blt_info.bltddat;

					blt_info.bltddat = (blit_func(blitahold & 0xffff, blitbhold & 0xffff, blt_info.bltcdat & 0xffff, mt) >>> 0) & 0xffff;
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
			if (dodst)
				//AMIGA.mem.store16_chip(dstp, blt_info.bltddat);
				AMIGA.mem.chip.data[dstp >>> 1] = blt_info.bltddat;

			blt_info.bltbhold = blitbhold;
		}
		blit_masktable[0] = 0xffff;
		blit_masktable[blt_info.hblitsize - 1] = 0xffff;

		bltstate = BLT_done;
	}

	function blitter_read() {
		if (bltcon0 & 0x200) {
			if (AMIGA.dmaen(DMAF_BLTEN))
				//blt_info.bltcdat = AMIGA.mem.load16_chip(bltcpt);
				blt_info.bltcdat = AMIGA.mem.chip.data[bltcpt >>> 1];
		}
		bltstate = BLT_work;
	}

	function blitter_write() {
		if (blt_info.bltddat)
			blt_info.blitzero = 0;
			
		if (bltcon0 & 0x200) {
			if (AMIGA.dmaen(DMAF_BLTEN))
				//AMIGA.mem.store16_chip(bltdpt, blt_info.bltddat);
				AMIGA.mem.chip.data[bltdpt >>> 1] = blt_info.bltddat;
		}
		bltstate = BLT_next;
	}

	function blitter_line() {
		var blitahold = (blinea & blt_info.bltafwm) >>> blinea_shift;
		var blitchold = blt_info.bltcdat;

		blt_info.bltbhold = (blineb & 1) ? 0xffff : 0;
		blitlinepixel = !blitsing || (blitsing && !blitonedot);
		blt_info.bltddat = blit_func(blitahold, blt_info.bltbhold, blitchold, bltcon0 & 0xff);
		blitonedot++;
	}

	/*function blitter_line_incx()	{
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
	}
	function blitter_line_proc() {
		if (bltcon0 & 0x800) {
			if (blitsign)
				bltapt_line += blt_info.bltbmod;
			else
				bltapt_line += blt_info.bltamod;		
		}
		if (!blitsign) {
			if (bltcon1 & 0x10) {
				if (bltcon1 & 0x8) {
					blitter_line_decy();
				} else {
					blitter_line_incy();
				}
			} else {
				if (bltcon1 & 0x8) {
					blitter_line_decx();
				} else {
					blitter_line_incx();
				}
			}
		}
		if (bltcon1 & 0x10) {
			if (bltcon1 & 0x4) {
				blitter_line_decx();
			} else {
				blitter_line_incx();
			}
		} else {
			if (bltcon1 & 0x4) {
				blitter_line_decy();
			} else {
				blitter_line_incy();
			}
		}
		blitsign = 0 > bltapt_line;
		bltstate = BLT_write;
	}*/
	
	function blitter_line_proc_fast() {
		if (bltcon0 & 0x800) {
			if (blitsign)
				bltapt_line += blt_info.bltbmod;
			else
				bltapt_line += blt_info.bltamod;		
		}
		if (!blitsign) {
			if (bltcon1 & 0x10) {
				if (bltcon1 & 0x8) {
					bltcpt -= blt_info.bltcmod;
					blitonedot = 0;
				} else {
					bltcpt += blt_info.bltcmod;
					blitonedot = 0;
				}
			} else {
				if (bltcon1 & 0x8) {
					if (blinea_shift-- == 0) {
						blinea_shift = 15;
						bltcpt -= 2;
					}
				} else {
					if (++blinea_shift == 16) {
						blinea_shift = 0;
						bltcpt += 2;
					}
				}
			}
		}
		if (bltcon1 & 0x10) {
			if (bltcon1 & 0x4) {
				if (blinea_shift-- == 0) {
					blinea_shift = 15;
					bltcpt -= 2;
				}
			} else {
				if (++blinea_shift == 16) {
					blinea_shift = 0;
					bltcpt += 2;
				}
			}
		} else {
			if (bltcon1 & 0x4) {
				bltcpt -= blt_info.bltcmod;
				blitonedot = 0;
			} else {
				bltcpt += blt_info.bltcmod;
				blitonedot = 0;
			}
		}
		blitsign = 0 > bltapt_line;
		bltstate = BLT_write;
	}

	function blitter_nxline()	{
		blineb = ((blineb << 1) | (blineb >> 15)) & 0xffff;
		blt_info.vblitsize--;
		bltstate = BLT_read;
	}

	function actually_do_blit() {
		if (blitline) {
			bltapt_line = bltapt & 0xffff; if (bltapt_line & 0x8000) bltapt_line -= 0x10000;			
			do {
				blitter_read();
				if (ddat1use)
					bltdpt = bltcpt;
				ddat1use = 1;
				blitter_line();
				blitter_line_proc_fast();
				blitter_nxline();
				if (blitlinepixel) {
					blitter_write();
					blitlinepixel = 0;
				}
				if (blt_info.vblitsize <= 0)
					bltstate = BLT_done;
			} while (bltstate != BLT_done);
			//bltapt_line = null;
			bltdpt = bltcpt;
		} else {
			if (blitdesc)
				blitter_dofast_desc();
			else
				blitter_dofast();			
			bltstate = BLT_done;
		}
	}

	function blitter_do() {
		actually_do_blit();
		blitter_done(AMIGA.playfield.hpos());
	}

	/*---------------------------------*/

	this.handler = function (data) {
      if (!AMIGA.dmaen(DMAF_BLTEN)) {
         AMIGA.events.newevent(EV2_BLITTER, 10, 0);
         if (++blit_stuck < 20000 || !AMIGA.config.blitter.immediate)
            return;

         BUG.info('blitter_handler() force-unstuck!');
      }
      blit_stuck = 0;
      if (blit_slowdown > 0 && !AMIGA.config.blitter.immediate) {
         //console.log('Blitter.handler () slowdown', blit_slowdown);
         AMIGA.events.newevent(EV2_BLITTER, blit_slowdown, 0);
         blit_slowdown = -1;
         return;
      }
      blitter_do();
   };

	var changetable = new Uint8Array(32 * 32); for (var i = 0; i < changetable.length; i++) changetable[i] = 0;	
	//var freezes = 10;
	function blit_bltset(con) {
		if (con & 2) {
			blitdesc = bltcon1 & 2;
			blt_info.blitbshift = bltcon1 >> 12;
			blt_info.blitdownbshift = 16 - blt_info.blitbshift;
		}

		if (con & 1) {
			blt_info.blitashift = bltcon0 >> 12;
			blt_info.blitdownashift = 16 - blt_info.blitashift;
		}

		blit_ch = (bltcon0 & 0x0f00) >> 8;
		blitline = (bltcon1 & 1) != 0;
		blitfill = !!(bltcon1 & 0x18);

		if (bltstate != BLT_done && blitline) {
			blitline = 0;
			bltstate = BLT_done;
			blit_interrupt = true;
			BUG.info('blit_bltset() register modification during linedraw! (%d)', bltstate);
		}

		if (blitline) {
			if (blt_info.hblitsize != 2)
				BUG.info('blit_bltset() weird hsize in linemode: %d vsize=%d', blt_info.hblitsize, blt_info.vblitsize);
			blit_diag = blit_cycle_diagram_line;
		} else {
			if (con & 2) {
				blitfc = !!(bltcon1 & 0x4);
				blitife = !!(bltcon1 & 0x8);
				if ((bltcon1 & 0x18) == 0x18) {
					//BUG.info('blit_bltset() weird fill mode');
					blitife = 0;
				}
			}
			//if (blitfill && !blitdesc) BUG.info('blit_bltset() fill without desc');
				
			blit_diag = blitfill && blit_cycle_diagram_fill[blit_ch][0] ? blit_cycle_diagram_fill[blit_ch] : blit_cycle_diagram[blit_ch];
		}
		if ((bltcon1 & 0x80) && (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
			BUG.info('blit_bltset() ECS BLTCON1 DOFF-bit set');

		// on the fly switching from CH=1 to CH=D -> blitter stops writing (Rampage/TEK)
		// currently just switch to no-channels mode, better than crashing the demo..
		if (bltstate != BLT_done) {
			var o = original_ch + (original_fill ? 16 : 0);
			var n = blit_ch + (blitfill ? 16 : 0);
			if (o != n) {
				if (changetable[o * 32 + n] < 10) {
					changetable[o * 32 + n]++;
					BUG.info('blit_bltset() channel mode changed while active (%02x->%02x)', o, n);
				}
			}
			if (blit_ch == 13 && original_ch == 1)
				blit_faulty = 1;
		}
		if (blit_faulty) {
			BUG.info('blit_bltset() blitter faulty!');
			blit_ch = 0;
			blit_diag = blit_cycle_diagram[blit_ch];
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
	}

	function reset_blit(bltcon) {
		if (bltcon & 1)
			blinea_shift = bltcon0 >> 12;
		if (bltcon & 2)
			blitsign = (bltcon1 & 0x40) != 0;
		if (bltstate == BLT_done)
			return;
		if (bltcon)
			blit_bltset(bltcon);
	}

	var warned1 = 10;	
	function waitingblits() {
		var waited = false;
		while (bltstate != BLT_done && AMIGA.dmaen(DMAF_BLTEN)) {
			waited = true;
			AMIGA.events.cycle(8 * CYCLE_UNIT);
		}
		if (warned1 && waited) {
			warned1--;
			BUG.info('waiting_blits detected');
		}
		return bltstate == BLT_done;

	}

	function do_blitter(hpos, copper) {
		var cycles;

		var cleanstart = 0;
		if (bltstate == BLT_done) {
			if (blit_faulty > 0)
				blit_faulty = 0;
			cleanstart = 1;
		}

		blt_info.blitzero = 1;
		blt_info.got_cycle = 0;

		blit_firstline_cycles = blit_first_cycle = AMIGA.events.currcycle;
		blit_last_cycle = 0;
		last_blitter_hpos = hpos + 1;

		blit_bltset(1 | 2);
		ddat1use = ddat2use = 0;
		blit_interrupt = false;

		if (blitline) {
			blinea = blt_info.bltadat;
			blineb = ((blt_info.bltbdat >>> blt_info.blitbshift) | (blt_info.bltbdat << (16 - blt_info.blitbshift))) & 0xffff;
			blitonedot = 0;
			blitlinepixel = 0;
			blitsing = (bltcon1 & 0x2) != 0;
			cycles = blt_info.vblitsize;
		} else {
			blit_firstline_cycles = blit_first_cycle + (blit_diag[0] * blt_info.hblitsize + AMIGA.cpu.cycles) * CYCLE_UNIT;
			cycles = blt_info.vblitsize * blt_info.hblitsize;
		}

		if (cleanstart) {
			original_ch = blit_ch;
			original_fill = blitfill;
			original_line = blitline;
		}

		/*if (0) {
			var ch = 0;
			if (blit_ch & 1) ch++;
			if (blit_ch & 2) ch++;
			if (blit_ch & 4) ch++;
			if (blit_ch & 8) ch++;
			BUG.info('do_blitter2() %dx%d ch=%d %d*%d=%d d=%d f=%d n=%d l=%d dma=%04x %s',
				blt_info.hblitsize, blt_info.vblitsize, ch, blit_diag[0], cycles, blit_diag[0] * cycles,
				blitdesc ? 1 : 0, blitfill ? 1 : 0, AMIGA.dmaen(DMAF_BLTPRI) ? 1 : 0, blitline ? 1 : 0,
				AMIGA.dmacon, AMIGA.dmaen(DMAF_BLTEN) ? 'on' : 'off!');
			blitter_dump();
		}*/

		bltstate = BLT_init;
		blit_slowdown = 0;

		clr_special(SPCFLAG_BLTNASTY);
		if (AMIGA.dmaen(DMAF_BLTPRI))
			set_special(SPCFLAG_BLTNASTY);

		if (AMIGA.dmaen(DMAF_BLTEN))
			bltstate = BLT_work;

		if (blt_info.vblitsize == 0 || (blitline && blt_info.hblitsize != 2)) {
			blitter_done(hpos);
			return;
		}
		blt_info.got_cycle = 1;

		if (AMIGA.config.blitter.immediate) {
			blitter_do();
			return;
		}

		blit_cyclecounter = cycles * (blit_dmacount2 + (blit_nod ? 0 : 1)); 		

		AMIGA.events.newevent(EV2_BLITTER, blit_cyclecounter, 0);

		if (AMIGA.dmaen(DMAF_BLTEN)) {
			if (AMIGA.config.blitter.waiting) {
				// wait immediately if all cycles in use and blitter nastry
				if (blit_dmacount == blit_diag[0] && (AMIGA.spcflags & SPCFLAG_BLTNASTY))
					waitingblits();
			}
		}
	}
	
	var warned2 = 10;
	this.maybe_blit = function (hpos, hack) {
      if (bltstate == BLT_done)
         return;

      if (AMIGA.dmaen(DMAF_BLTEN)) {
         var doit = false;
         if (AMIGA.config.blitter.waiting == 3) { // always
            doit = true;
         } else if (AMIGA.config.blitter.waiting == 2) { // no idle
            if (blit_dmacount == blit_diag[0] && (AMIGA.spcflags & SPCFLAG_BLTNASTY))
               doit = true;
         } else if (AMIGA.config.blitter.waiting == 1) { // automatic
            if (blit_dmacount == blit_diag[0] && (AMIGA.spcflags & SPCFLAG_BLTNASTY))
               doit = true;
            else if (AMIGA.config.cpu.speed < 0)
               doit = true;
         }
         if (doit) {
            if (waitingblits())
               return;
         }
      }

      if (warned2 && AMIGA.dmaen(DMAF_BLTEN) && blt_info.got_cycle) {
         warned2--;
         BUG.info('maybe_blit() program does not wait for blitter tc=%d', blit_cyclecounter);
      }

      if (hack == 1 && AMIGA.events.currcycle < blit_firstline_cycles)
         return;

      AMIGA.blitter.handler(0);
   };

	this.blitnasty = function () {
      if (bltstate == BLT_done || !AMIGA.dmaen(DMAF_BLTEN))
         return 0;
      if (blit_last_cycle >= blit_diag[0] && blit_dmacount == blit_diag[0])
         return 0;

      var cycles = Math.floor((AMIGA.events.currcycle - blit_first_cycle) * CYCLE_UNIT_INV);
      var ccnt = 0;
      while (blit_last_cycle < cycles) {
         if (!channel_state(blit_last_cycle++))
            ccnt++;
      }
      return ccnt;
   };

	/*---------------------------------*/

	var oddfstrt = 0, oddfstop = 0, ototal = 0, ofree = 0, slow = 0;
	this.slowdown = function () {
      var data = AMIGA.playfield.getData();
      var ddfstrt = data[0];
      var ddfstop = data[1];
      var totalcycles = data[2];
      var freecycles = data[3];

      if (!totalcycles || ddfstrt < 0 || ddfstop < 0)
         return;
      if (ddfstrt != oddfstrt || ddfstop != oddfstop || totalcycles != ototal || ofree != freecycles) {
         var linecycles = Math.floor(((ddfstop - ddfstrt + totalcycles - 1) / totalcycles) * totalcycles);
         var freelinecycles = Math.floor(((ddfstop - ddfstrt + totalcycles - 1) / totalcycles) * freecycles);
         var dmacycles = Math.floor((linecycles * blit_dmacount) / blit_diag[0]);

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
   };
		
	/*---------------------------------*/

	this.BLTADAT = function (hpos, v) {
      this.maybe_blit(hpos, 0);
      blt_info.bltadat = v;
   };
	this.BLTBDAT = function (hpos, v) {
      this.maybe_blit(hpos, 0);
      if (bltcon1 & 2)
         blt_info.bltbhold = (v << (bltcon1 >> 12)) & 0xffff;
      else
         blt_info.bltbhold = (v >> (bltcon1 >> 12)) & 0xffff;

      blt_info.bltbdat = v;
   };
	this.BLTCDAT = function (hpos, v) {
      this.maybe_blit(hpos, 0);
      blt_info.bltcdat = v;
      reset_blit(0);
   };

	this.BLTAMOD = function (hpos, v) {
      this.maybe_blit(hpos, 1);
      blt_info.bltamod = castWord(v & 0xfffe);
      reset_blit(0);
   };
	this.BLTBMOD = function (hpos, v) {
      this.maybe_blit(hpos, 1);
      blt_info.bltbmod = castWord(v & 0xfffe);
      reset_blit(0);
   };
	this.BLTCMOD = function (hpos, v) {
      this.maybe_blit(hpos, 1);
      blt_info.bltcmod = castWord(v & 0xfffe);
      reset_blit(0);
   };
	this.BLTDMOD = function (hpos, v) {
      this.maybe_blit(hpos, 1);
      blt_info.bltdmod = castWord(v & 0xfffe);
      reset_blit(0);
   };

	this.BLTCON0 = function (hpos, v) {
      this.maybe_blit(hpos, 2);
      bltcon0 = v;
      reset_blit(1);
   };
	this.BLTCON0L = function (hpos, v) {
      if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)) return;
      this.maybe_blit(hpos, 2);
      bltcon0 = (bltcon0 & 0xFF00) | (v & 0xFF);
      reset_blit(1);
   };
	this.BLTCON1 = function (hpos, v) {
      this.maybe_blit(hpos, 2);
      bltcon1 = v;
      reset_blit(2);
   };

	this.BLTAFWM = function (hpos, v) {
      this.maybe_blit(hpos, 2);
      blt_info.bltafwm = v;
      reset_blit(0);
   };
	this.BLTALWM = function (hpos, v) {
      this.maybe_blit(hpos, 2);
      blt_info.bltalwm = v;
      reset_blit(0);
   };

	this.BLTAPTH = function (hpos, v) {
      this.maybe_blit(hpos, 0);
      bltapt = ((bltapt & 0xffff) | (v << 16)) >>> 0;
   };
	this.BLTAPTL = function (hpos, v) {
      this.maybe_blit(hpos, 0);
      bltapt = ((bltapt & ~0xffff) | (v & 0xfffe)) >>> 0;
   };
	this.BLTBPTH = function (hpos, v) {
      this.maybe_blit(hpos, 0);
      bltbpt = ((bltbpt & 0xffff) | (v << 16)) >>> 0;
   };
	this.BLTBPTL = function (hpos, v) {
      this.maybe_blit(hpos, 0);
      bltbpt = ((bltbpt & ~0xffff) | (v & 0xfffe)) >>> 0;
   };
	this.BLTCPTH = function (hpos, v) {
      this.maybe_blit(hpos, 0);
      bltcpt = ((bltcpt & 0xffff) | (v << 16)) >>> 0;
   };
	this.BLTCPTL = function (hpos, v) {
      this.maybe_blit(hpos, 0);
      bltcpt = ((bltcpt & ~0xffff) | (v & 0xfffe)) >>> 0;
   };
	this.BLTDPTH = function (hpos, v) {
      this.maybe_blit(hpos, 0);
      bltdpt = ((bltdpt & 0xffff) | (v << 16)) >>> 0;
   };
	this.BLTDPTL = function (hpos, v) {
      this.maybe_blit(hpos, 0);
      bltdpt = ((bltdpt & ~0xffff) | (v & 0xfffe)) >>> 0;
   };

	this.BLTSIZE = function (hpos, v) {
      this.maybe_blit(hpos, 0);

      blt_info.vblitsize = v >> 6;
      blt_info.hblitsize = v & 0x3F;
      if (!blt_info.vblitsize)
         blt_info.vblitsize = 1024;
      if (!blt_info.hblitsize)
         blt_info.hblitsize = 64;

      do_blitter(hpos, AMIGA.copper.access);
   };

	this.BLTSIZV = function (hpos, v) {
      if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)) return;
      this.maybe_blit(hpos, 0);
      blt_info.vblitsize = v & 0x7FFF;
   };

	this.BLTSIZH = function (hpos, v) {
      if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)) return;
      this.maybe_blit(hpos, 0);
      blt_info.hblitsize = v & 0x7FF;
      if (!blt_info.vblitsize)
         blt_info.vblitsize = 0x8000;
      if (!blt_info.hblitsize)
         blt_info.hblitsize = 0x0800;

      do_blitter(hpos, AMIGA.copper.access);
   };
	
	/*---------------------------------*/

	this.getState = function () {
      return bltstate;
   };
	this.setState = function (s) {
      bltstate = s;
   };
	this.getIntZero = function() { 
		return [blit_interrupt, blt_info.blitzero];
	}
}
