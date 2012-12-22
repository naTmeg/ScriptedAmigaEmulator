/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/

//copper_states
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
const COP_strobe_extra = 14;
const COP_start_delay = 15;

function Copper() {
	this.cop1lc = 0;
	this.cop2lc = 0,
	this.copcon = 0;
	this.enabled_thisline = false;
	this.access = false;

	var cop_state = {
		/* The current instruction words.  */
		i1:0, i2:0,
		saved_i1:0, saved_i2:0,
		state:0, state_prev:0,
		/* Instruction pointer.  */
		ip:0, saved_ip:0,
		hpos:0, vpos:0,
		ignore_next:0,
		vcmp:0, hcmp:0,

		strobe:0, /* COPJMP1 / COPJMP2 accessed */
		last_write:0, last_write_hpos:0,
		moveaddr:0, movedata:0, movedelay:0
	};
	var last_copper_hpos = 0;


	this.reset = function () {
		this.copcon = 0;
		cop_state.state = COP_stop;
	}

	this.reset2 = function () {
		cop_state.hpos = 0;
		cop_state.last_write = 0;
		this.compute_spcflag_copper(AMIGA.events.maxhpos);		
	}

	this.COPCON = function (v) {
		this.copcon = v;
	}
	this.COP1LCH = function (v) {
		this.cop1lc = ((v << 16) | (this.cop1lc & 0xffff)) >>> 0;
	}
	this.COP1LCL = function (v) {
		this.cop1lc = ((this.cop1lc & 0xffff0000) | (v & 0xfffe)) >>> 0;
	}
	this.COP2LCH = function (v) {
		this.cop2lc = ((v << 16) | (this.cop2lc & 0xffff)) >>> 0;
	}
	this.COP2LCL = function (v) {
		this.cop2lc = ((this.cop2lc & 0xffff0000) | (v & 0xfffe)) >>> 0;
	}

	this.COPJMP = function (num, vblank) {
		var oldstrobe = cop_state.strobe;

		//if (AMIGA.dmaen(DMAF_COPEN) && (cop_state.saved_i1 != 0xffff || cop_state.saved_i2 != 0xfffe))
			//BUG.info('COPJMP(%d) vblank without copper ending %08x (%08x %08x) (%08x %08x)', num, cop_state.ip, this.cop1lc, this.cop2lc, cop_state.saved_i1, cop_state.saved_i2);

		clr_special(SPCFLAG_COPPER);
		cop_state.ignore_next = 0;
		if (!oldstrobe)
			cop_state.state_prev = cop_state.state;

		if ((cop_state.state == COP_wait || cop_state.state == COP_waitforever) && !vblank)
			cop_state.state = COP_strobe_delay1x;
		else
			cop_state.state = vblank ? COP_start_delay : (this.access ? COP_strobe_delay1 : COP_strobe_extra);

		//BUG.info('COPJMP(%d) %d', num, cop_state.state);
		
		cop_state.vpos = AMIGA.events.vpos;
		cop_state.hpos = AMIGA.events.hpos() & ~1;
		this.enabled_thisline = false;
		cop_state.strobe = num;

		if (0) {
			this.immediate_copper(num);
			return;
		}

		if (AMIGA.dmaen(DMAF_COPEN))
			this.compute_spcflag_copper(AMIGA.events.hpos());
		else if (oldstrobe > 0 && oldstrobe != num && cop_state.state_prev == COP_wait) {
			/* dma disabled, copper idle and accessed both COPxJMPs -> copper stops! */
			cop_state.state = COP_stop;
			//BUG.info('COPJMP(%d) COP_stop');
		}
	}

	/*function get_copper_address(copno) {
		switch (copno) {
			case 1: return this.cop1lc;
			case 2: return this.cop2lc;
			case -1: return cop_state.ip;
			default: return 0;
		}
	}*/

	this.test_copper_dangerous = function (address) {
		var addr = address & 0x1fe;
		if (addr < ((this.copcon & 2) ? ((AMIGA.config.chipset.type == SAEV_Config_Chipset_Type_ECS) ? 0 : 0x40) : 0x80)) {
			cop_state.state = COP_stop;
			this.enabled_thisline = false;
			clr_special(SPCFLAG_COPPER);
			return true;
		}
		return false;
	}

	this.immediate_copper = function (num) {
		var pos = 0;
		var oldpos = 0;

		cop_state.state = COP_stop;
		cop_state.vpos = AMIGA.events.vpos;
		cop_state.hpos = AMIGA.events.hpos() & ~1;
		cop_state.ip = num == 1 ? this.cop1lc : this.cop2lc;

		while (pos < (AMIGA.events.maxvpos << 5)) {
			if (oldpos > pos)
				pos = oldpos;
			if (!AMIGA.dmaen(DMAF_COPEN))
				break;
			if (cop_state.ip >= AMIGA.mem.chip.size)
				break;
			pos++;
			oldpos = pos;
			cop_state.i1 = AMIGA.mem.load16_chip(cop_state.ip);
			cop_state.i2 = AMIGA.mem.load16_chip(cop_state.ip + 2);
			cop_state.ip += 4;
			if (!(cop_state.i1 & 1)) { // move
				cop_state.i1 &= 0x1fe;
				if (cop_state.i1 == 0x88) {
					cop_state.ip = this.cop1lc;
					continue;
				}
				if (cop_state.i1 == 0x8a) {
					cop_state.ip = this.cop2lc;
					continue;
				}
				if (this.test_copper_dangerous(cop_state.i1))
					break;
				AMIGA.custom.store16_real(0, cop_state.i1, cop_state.i2, 0);
			} else { // wait or skip
				if ((cop_state.i1 >> 8) > ((pos >> 5) & 0xff))
					pos = (((pos >> 5) & 0x100) | ((cop_state.i1 >> 8)) << 5) | ((cop_state.i1 & 0xff) >> 3);
				if (cop_state.i1 >= 0xffdf && cop_state.i2 == 0xfffe)
					break;
			}
		}
		cop_state.state = COP_stop;
		clr_special(SPCFLAG_COPPER);
	}

	this.copper_cant_read = function (hpos, alloc) {
		//BUG.info('copper_cant_read2() hpos %d / %d', hpos, AMIGA.events.maxhpos);
		if (hpos + 1 >= AMIGA.events.maxhpos) // first refresh slot
			return 1;
		if ((hpos == AMIGA.events.maxhpos - 3) && (AMIGA.events.maxhpos & 1) && alloc >= 0) {
			//if (alloc) alloc_cycle (hpos, CYCLE_COPPER);
			return -1;
		}
		return AMIGA.playfield.is_bitplane_dma(hpos);
	}

	/*this.copper_cant_read = function (hpos, alloc) {
		var cant = this.copper_cant_read2(hpos, alloc);
		//if (cant && debug_dma) record_dma_event (DMA_EVENT_COPPERWANTED, hpos, vpos);
		return cant;
	}*/

	this.custom_store16_copper = function (hpos, addr, value, noget) {
		//if (addr == 0x88 || addr == 0x8a)
		//BUG.info('custom_store16_copper() addr %08x, value %04x | vpos %d hpos %d %d cvcmp %d chcmp %d chpos %d cvpos %d', addr, value, AMIGA.events.vpos, AMIGA.events.hpos(), hpos, cop_state.vcmp, cop_state.hcmp, cop_state.hpos, cop_state.vpos);
		//value = debug_wputpeekdma (0xdff000 + addr, value);
		this.access = true;
		var v = AMIGA.custom.store16_real(hpos, addr, value, noget);
		this.access = false;
		return v;
	}

	this.dump_copper = function (error, until_hpos) {
		BUG.info('\n');
		BUG.info('%s: vpos=%d until_hpos=%d vp=%d', error, AMIGA.events.vpos, until_hpos, AMIGA.events.vpos & (((cop_state.saved_i2 >> 8) & 0x7f) | 0x80));
		BUG.info('cvcmp=%d chcmp=%d chpos=%d cvpos=%d ci1=%04X ci2=%04X', cop_state.vcmp, cop_state.hcmp, cop_state.hpos, cop_state.vpos, cop_state.saved_i1, cop_state.saved_i2);
		BUG.info('cstate=%d ip=%x SPCFLAGS=%x iscline=%d', cop_state.state, cop_state.ip, AMIGA.spcflags, this.enabled_thisline?1:0);
		BUG.info('\n');
	}

	// 'emulate' chip internal delays, not the right place but fast and 99.9% programs
	// use only copper to write BPLCON1 etc.. (exception is HulkaMania/TSP..)
	// this table should be filled with zeros and done somewhere else..
	var customdelay = [
		1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,1,1,1,0,0,0,0,0,0,0,0, /* 32 0x00 - 0x3e */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, /* 0x40 - 0x5e */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, /* 0x60 - 0x7e */
		0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0, /* 0x80 - 0x9e */
		1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, /* 32 0xa0 - 0xde */
		/* BPLxPTH/BPLxPTL */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, /* 16 */
		/* BPLCON0-3,BPLMOD1-2 */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, /* 16 */
		/* SPRxPTH/SPRxPTL */
		1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, /* 16 */
		/* SPRxPOS/SPRxCTL/SPRxDATA/SPRxDATB */
		1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
		/* COLORxx */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
		/* RESERVED */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	];

	/*this.copper_write = function (v) {
		this.custom_store16_copper(AMIGA.events.hpos(), v >> 16, v & 0xffff, 0);
	}*/

	this.update_copper = function (until_hpos) {
		var vp = AMIGA.events.vpos & (((cop_state.saved_i2 >> 8) & 0x7f) | 0x80);
		var c_hpos = cop_state.hpos;

		//BUG.info('update_copper() until_hpos %d, vp %d', until_hpos, vp);

		if (cop_state.state == COP_wait && vp < cop_state.vcmp) {
			this.dump_copper('error2', until_hpos);
			this.enabled_thisline = false;
			cop_state.state = COP_stop;
			clr_special(SPCFLAG_COPPER);
			return;
		}

		if (until_hpos <= last_copper_hpos)
			return;

		if (until_hpos > (AMIGA.events.maxhpos & ~1))
			until_hpos = AMIGA.events.maxhpos & ~1;

		for (;;) {
			var old_hpos = c_hpos;
			var hp;

			if (c_hpos >= until_hpos)
				break;

			/* So we know about the fetch state.  */
			//decide_line (c_hpos);
			//decide_fetch (c_hpos);

			if (cop_state.movedelay > 0) {
				cop_state.movedelay--;
				if (cop_state.movedelay == 0) {
					this.custom_store16_copper(c_hpos, cop_state.moveaddr, cop_state.movedata, 0);
				}
			}

			if ((c_hpos == AMIGA.events.maxhpos - 3) && (AMIGA.events.maxhpos & 1))
				c_hpos += 1;
			else
				c_hpos += 2;

			switch (cop_state.state) {
				case COP_wait_in2: {
					if (this.copper_cant_read(old_hpos, 0))
						continue;
					cop_state.state = COP_wait1;
					break;
				}
				case COP_skip_in2: {
					if (this.copper_cant_read(old_hpos, 0))
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
					if (this.copper_cant_read(old_hpos, 1))
						continue;
					cop_state.state = COP_strobe_delay2;
					//alloc_cycle(old_hpos, CYCLE_COPPER);
					//if (debug_dma) record_dma (0x8c, AMIGA.mem.load16_chip(cop_state.ip), cop_state.ip, old_hpos, vpos, DMARECORD_COPPER);
					cop_state.ip += 2;
					break;
				}
				case COP_strobe_delay2: {
					// Second cycle after COPJMP. This is the strange one.
					// This cycle does not need to be free
					// But it still gets allocated by copper if it is free = CPU and blitter can't use it.
					/*if (this.copper_cant_read(old_hpos, 1)) {
						alloc_cycle (old_hpos, CYCLE_COPPER);
						if (debug_dma) record_dma (0x1fe, AMIGA.mem.load16_chip(cop_state.ip), cop_state.ip, old_hpos, vpos, DMARECORD_COPPER);
					}*/
					cop_state.state = COP_read1;
					// Next cycle finally reads from new pointer
					if (cop_state.strobe == 1)
						cop_state.ip = this.cop1lc;
					else
						cop_state.ip = this.cop2lc;
					cop_state.strobe = 0;
					break;
				}
				case COP_strobe_delay1x: {
					// First cycle after COPJMP and Copper was waiting. This is the buggy one.
					// Cycle can be free and copper won't allocate it.
					// If Blitter uses this cycle = Copper's address gets copied blitter DMA pointer..
					cop_state.state = COP_strobe_delay2x;
					break;
				}
				case COP_strobe_delay2x: {
					// Second cycle fetches following word and tosses it away. Must be free cycle
					// but is not allocated, blitter or cpu can still use it.
					if (this.copper_cant_read(old_hpos, 1))
						continue;
					//cycle_line[old_hpos] |= CYCLE_COPPER_SPECIAL;
					//if (debug_dma) record_dma (0x1fe, AMIGA.mem.load16_chip(cop_state.ip), cop_state.ip, old_hpos, vpos, DMARECORD_COPPER);
					cop_state.state = COP_read1;
					// Next cycle finally reads from new pointer
					if (cop_state.strobe == 1)
						cop_state.ip = this.cop1lc;
					else
						cop_state.ip = this.cop2lc;
					cop_state.strobe = 0;
					break;
				}
				case COP_start_delay: {
					if (this.copper_cant_read(old_hpos, 1))
						continue;
					cop_state.state = COP_read1;
					//alloc_cycle(old_hpos, CYCLE_COPPER);
					//if (debug_dma) record_dma (0x1fe, 0, 0xffffffff, old_hpos, vpos, DMARECORD_COPPER);
					cop_state.ip = this.cop1lc;
					break;
				}
				case COP_read1: {
					if (this.copper_cant_read(old_hpos, 1))
						continue;
					/* workaround for a bug in kick 1.x */
					if (cop_state.ip == 0x00000004 || cop_state.ip == 0x00000676 || cop_state.ip == 0x00c00276) {
						//BUG.info('COP_read1() invalid addr $%08x', cop_state.ip);
						cop_state.state = COP_stop;
						this.enabled_thisline = false;
						clr_special(SPCFLAG_COPPER);
						return;
					}	
					cop_state.i1 = AMIGA.mem.load16_chip(cop_state.ip);
					//alloc_cycle(old_hpos, CYCLE_COPPER);
					//if (debug_dma) record_dma (0x8c, cop_state.i1, cop_state.ip, old_hpos, vpos, DMARECORD_COPPER);
					cop_state.ip += 2;
					cop_state.state = COP_read2;
					break;
				}
				case COP_read2: {
					if (this.copper_cant_read(old_hpos, 1))
						continue;
					cop_state.i2 = AMIGA.mem.load16_chip(cop_state.ip);
					//alloc_cycle(old_hpos, CYCLE_COPPER);
					cop_state.ip += 2;					
					cop_state.saved_i1 = cop_state.i1;
					cop_state.saved_i2 = cop_state.i2;
					cop_state.saved_ip = cop_state.ip;

					if (cop_state.i1 & 1) { // WAIT or SKIP
						cop_state.ignore_next = 0;
						if (cop_state.i2 & 1)
							cop_state.state = COP_skip_in2;
						else
							cop_state.state = COP_wait_in2;
						//if (debug_dma) record_dma (0x8c, cop_state.i2, cop_state.ip - 2, old_hpos, vpos, DMARECORD_COPPER);
					} else { // MOVE
						//uaecptr debugip = cop_state.ip;
						var reg = cop_state.i1 & 0x1fe;
						var data = cop_state.i2;
						cop_state.state = COP_read1;
						//if (debug_dma) record_dma (reg, data, cop_state.ip - 2, old_hpos, vpos, DMARECORD_COPPER);
						this.test_copper_dangerous(reg);
						if (!this.enabled_thisline) {
							//goto out; // was 'dangerous' register -> copper stopped
							cop_state.hpos = c_hpos;
							last_copper_hpos = until_hpos;
							return;
						}
						if (cop_state.ignore_next)
							reg = 0x1fe;

						cop_state.last_write = reg;
						cop_state.last_write_hpos = old_hpos;
						if (reg == 0x88) {
							cop_state.strobe = 1;
							cop_state.state = COP_strobe_delay1;
						} else if (reg == 0x8a) {
							cop_state.strobe = 2;
							cop_state.state = COP_strobe_delay1;
						} else {
							/*#if 0
							event2_newevent2 (1, (reg << 16) | data, copper_write);
							#else*/
							// FIX: all copper writes happen 1 cycle later than CPU writes
							if (customdelay[reg >> 1]) {
								cop_state.moveaddr = reg;
								cop_state.movedata = data;
								cop_state.movedelay = customdelay[cop_state.moveaddr >> 1];
							} else {
								var hpos2 = old_hpos;
								this.custom_store16_copper(hpos2, reg, data, 0);
								hpos2++;
								//if (reg >= 0x140 && reg < 0x180 && hpos2 >= SPR0_HPOS && hpos2 < SPR0_HPOS + 4 * MAX_SPRITES) do_sprites(hpos2);
							}
							//#endif
						}
						//if (debug_copper && !cop_state.ignore_next) record_copper (debugip - 4, old_hpos, vpos);
						cop_state.ignore_next = 0;
					}
					break;
				}
				case COP_wait1: {
					/*#if 0
					if (c_hpos >= (AMIGA.events.maxhpos & ~1) || (c_hpos & 1)) break;
					#endif*/
					cop_state.state = COP_wait;

					cop_state.vcmp = (cop_state.saved_i1 & (cop_state.saved_i2 | 0x8000)) >> 8;
					cop_state.hcmp = (cop_state.saved_i1 & cop_state.saved_i2 & 0xfe);

					vp = AMIGA.events.vpos & (((cop_state.saved_i2 >> 8) & 0x7f) | 0x80);

					if (cop_state.saved_i1 == 0xffff && cop_state.saved_i2 == 0xfffe) {
						cop_state.state = COP_waitforever;
						this.enabled_thisline = false;
						clr_special(SPCFLAG_COPPER);
						//goto out;
						cop_state.hpos = c_hpos;
						last_copper_hpos = until_hpos;
						return;
					}
					if (vp < cop_state.vcmp) {
						this.enabled_thisline = false;
						clr_special(SPCFLAG_COPPER);
						//goto out;
						cop_state.hpos = c_hpos;
						last_copper_hpos = until_hpos;
						return;
					}
				}
				/* fall through */
				case COP_wait: {
					var ch_comp = c_hpos;
					if (ch_comp & 1)
						ch_comp = 0;

					if (this.copper_cant_read(old_hpos, 0))
						continue;

					hp = ch_comp & (cop_state.saved_i2 & 0xfe);
					if (vp == cop_state.vcmp && hp < cop_state.hcmp)
						break;

					/* Now we know that the comparisons were successful.  We might still have to wait for the blitter though.  */
					if ((cop_state.saved_i2 & 0x8000) == 0) {
						//decide_blitter (old_hpos);
						if (AMIGA.blitter.getState() != BLT_done) {
							//We need to wait for the blitter.
							cop_state.state = COP_bltwait;
							this.enabled_thisline = false;
							clr_special(SPCFLAG_COPPER);
							//goto out;
							cop_state.hpos = c_hpos;
							last_copper_hpos = until_hpos;
							return;
						} /*else {
							if (debug_dma) record_dma_event (DMA_EVENT_COPPERWAKE, old_hpos, vp);
						}*/
					}
					//if (debug_copper) record_copper (cop_state.ip - 4, old_hpos, vpos);
					cop_state.state = COP_read1;
					break;
				}
				case COP_skip1: {
					var vcmp, hcmp, vp1, hp1;

					if (c_hpos >= (AMIGA.events.maxhpos & ~1) || (c_hpos & 1))
						break;

					if (this.copper_cant_read(old_hpos, 0))
						continue;

					vcmp = (cop_state.saved_i1 & (cop_state.saved_i2 | 0x8000)) >> 8;
					hcmp = (cop_state.saved_i1 & cop_state.saved_i2 & 0xfe);
					vp1 = AMIGA.events.vpos & (((cop_state.saved_i2 >> 8) & 0x7f) | 0x80);
					hp1 = c_hpos & (cop_state.saved_i2 & 0xfe);

					if ((vp1 > vcmp || (vp1 == vcmp && hp1 >= hcmp)) && ((cop_state.saved_i2 & 0x8000) != 0 || AMIGA.blitter.getState() == BLT_done))
						cop_state.ignore_next = 1;

					cop_state.state = COP_read1;
					//if (debug_copper) record_copper (cop_state.ip - 4, old_hpos, vpos);
					break;
				}
			}
		}

		//out:
		cop_state.hpos = c_hpos;
		last_copper_hpos = until_hpos;
	}

	this.compute_spcflag_copper = function (hpos) {
		//BUG.info('compute_spcflag_copper() hpos %d', hpos);
		var wasenabled = this.enabled_thisline;

		this.enabled_thisline = false;
		clr_special(SPCFLAG_COPPER);
		if (!AMIGA.dmaen(DMAF_COPEN) || cop_state.state == COP_stop || cop_state.state == COP_waitforever || cop_state.state == COP_bltwait)
			return;

		if (cop_state.state == COP_wait) {
			var vp = AMIGA.events.vpos & (((cop_state.saved_i2 >> 8) & 0x7f) | 0x80);

			if (vp < cop_state.vcmp)
				return;
		}
		// do not use past cycles if starting for the first time in this line
		// (write to DMACON for example) hpos+1 for long lines
		if (!wasenabled && cop_state.hpos < hpos && hpos < AMIGA.events.maxhpos) {
			hpos = (hpos + 2) & ~1;
			if (hpos > 226)
				hpos = 226;
			cop_state.hpos = hpos;
		}

		// if COPJMPx was written while DMA was disabled, advance to next state,
		// COP_strobe_extra is single cycle only and does not need free bus.
		// (copper state emulation does not run if DMA is disabled)
		if (!wasenabled && cop_state.state == COP_strobe_extra)
			cop_state.state = COP_strobe_delay1;

		this.enabled_thisline = true;
		set_special(SPCFLAG_COPPER);
	}

	this.blitter_done_notify = function (hpos) {
		if (cop_state.state != COP_bltwait)
			return;

		//BUG.info('blitter_done_notify() hpos %d', hpos);

		var vp = AMIGA.events.vpos;
		hpos += 3;
		hpos &= ~1;
		if (hpos >= AMIGA.events.maxhpos) {
			hpos -= AMIGA.events.maxhpos;
			vp++;
		}
		cop_state.hpos = hpos;
		cop_state.vpos = vp;
		cop_state.state = COP_read1;
		//if (debug_dma) record_dma_event (DMA_EVENT_COPPERWAKE, hpos, vp);

		if (AMIGA.dmaen(DMAF_COPEN) && vp == AMIGA.events.vpos) {
			this.enabled_thisline = true;
			set_special(SPCFLAG_COPPER);
		}
	}

	this.cycle = function () {
		this.update_copper(AMIGA.events.hpos());
	}

	this.sync_copper_with_cpu = function (hpos, do_schedule) {
		/* Need to let the copper advance to the current position.  */
		if (this.enabled_thisline)
			this.update_copper(hpos);
	}

	this.check = function (n) {
		if (cop_state.state == COP_wait) {
			var vp = AMIGA.events.vpos & (((cop_state.saved_i2 >> 8) & 0x7f) | 0x80);
			if (vp < cop_state.vcmp) {
				if (this.enabled_thisline)
					BUG.info('COPPER BUG %d: vp=%d vpos=%d vcmp=%d thisline=%d', n, vp, AMIGA.events.vpos, cop_state.vcmp, this.enabled_thisline?1:0);
			}
		}
	}
}		