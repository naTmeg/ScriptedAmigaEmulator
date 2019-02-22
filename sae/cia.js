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
/* global variables */

var SAEV_CIA_bank = null;

/*---------------------------------*/

function SAEO_CIA() {
	const TOD_HACK = true;

	/* e-clock is 10 CPU cycles, 4 cycles high, 6 low data transfer happens during 4 high cycles */
	const ECLOCK_DATA_CYCLE = 4;
	const ECLOCK_WAIT_CYCLE = 6;

	const DIV10 = (ECLOCK_DATA_CYCLE + ECLOCK_WAIT_CYCLE) * SAEC_Events_CYCLE_UNIT >> 1; /* Yes, a bad identifier. */
	const CIASTARTCYCLESHI = 3;
	const CIASTARTCYCLESCRA = 2;

	var ciaaicr = 0, ciaaimask = 0, ciabicr = 0, ciabimask = 0; //uint
	var ciaacra = 0, ciaacrb = 0, ciabcra = 0, ciabcrb = 0; //uint
	var ciaastarta = 0, ciaastartb = 0, ciabstarta = 0, ciabstartb = 0; //uint

	/* Values of the CIA timers.  */
	var ciaata = 0, ciaatb = 0, ciabta = 0, ciabtb = 0; //ulong
	/* Computed by compute_passed_time.  */
	var ciaata_passed = 0, ciaatb_passed = 0, ciabta_passed = 0, ciabtb_passed = 0; //ulong

	var ciaatod = 0, ciabtod = 0, ciaatol = 0, ciabtol = 0, ciaaalarm = 0, ciabalarm = 0; //ulong
	var ciaatlatch = 0, ciabtlatch = 0; //int
	var oldovl = false; //, oldcd32mute = false; //bool
	var led = false; //bool
	var led_old_brightness = 0; //int
	var led_cycles_on = 0, led_cycles_off = 0, led_cycle = 0; //ulong

	var ciabpra = 0; //uint

	var ciaala = 0, ciaalb = 0, ciabla = 0, ciablb = 0; //ulong
	var ciaatodon = 0, ciabtodon = 0; //int
	var ciaapra = 0, ciaaprb = 0, ciaadra = 0, ciaadrb = 0, ciaasdr = 0, ciaasdr_cnt = 0; //ulong
	var ciabprb = 0, ciabdra = 0, ciabdrb = 0, ciabsdr = 0, ciabsdr_cnt = 0; //ulong
	var div10 = 0; //int
	var kbstate = 0, kblostsynccnt = 0; //int
	var kbcode = 0; //u8

	var serbits = 0; //u8
	var warned = 10; //int

	/*static void setclr (unsigned int *p, unsigned int val) {
		if (val & 0x80) {
			*p |= val & 0x7F;
		} else {
			*p &= ~val;
		}
	}*/

	/* delay interrupt after current CIA register access if interrupt would have triggered mid access */
	var cia_interrupt_disabled = 0; //int
	var cia_interrupt_delay = 0; //int

	/*-----------------------------------------------------------------------*/

	function ICR(data) {
		SAER.custom.INTREQ_0(SAEC_Custom_INTF_SETCLR | data);
	}

	function ICRA(data) {
		ciaaicr |= 0x40;
		ciaaicr |= 0x20;
		ICR(0x0008);
	}

	function ICRB(data) {
		ciabicr |= 0x40;
		ciabicr |= 0x20;
		if (SAEV_config.chipset.compatible == SAEC_Config_Chipset_Compatible_A1000V)
			ICR(0x0008); /* Both CIAs in Velvet are connected to level 2 */
		else
			ICR(0x2000);
	}

	function RethinkICRA() {
		if (ciaaicr & ciaaimask) {
			if (!(ciaaicr & 0x80)) {
				ciaaicr |= 0x80;
				ICRA(0x0008);
			}
		}
	}

	function RethinkICRB() {
		if (ciabicr & ciabimask) {
			if (!(ciabicr & 0x80)) {
				ciabicr |= 0x80;
				ICRB(0);
			}
		}
	}

	this.rethink = function() { //rethink_cias()
		if (ciaaicr & 0x40) ICRA(0);
		if (ciabicr & 0x40) ICRB(0);
	}

	/* Figure out how many CIA timer cycles have passed for each timer since the last call of CIA_calctimers.  */

	function compute_passed_time() {
		var ccount = SAEV_Events_currcycle - SAER_Events_eventtab[SAEC_Events_EV_CIA].oldcycles + div10;
		var ciaclocks = ccount / DIV10 >>> 0;

		ciaata_passed = ciaatb_passed = ciabta_passed = ciabtb_passed = 0;

		/* CIA A timers */
		if ((ciaacra & 0x21) == 0x01) {
			var cc = ciaclocks;
			if (cc > ciaastarta)
				cc -= ciaastarta;
			else
				cc = 0;
			SAEF_assert((ciaata + 1) >= cc);
			ciaata_passed = cc;
		}
		if ((ciaacrb & 0x61) == 0x01) {
			var cc = ciaclocks;
			if (cc > ciaastartb)
				cc -= ciaastartb;
			else
				cc = 0;
			SAEF_assert((ciaatb + 1) >= cc);
			ciaatb_passed = cc;
		}

		/* CIA B timers */
		if ((ciabcra & 0x21) == 0x01) {
			var cc = ciaclocks;
			if (cc > ciabstarta)
				cc -= ciabstarta;
			else
				cc = 0;
			SAEF_assert((ciabta + 1) >= cc);
			ciabta_passed = cc;
		}
		if ((ciabcrb & 0x61) == 0x01) {
			var cc = ciaclocks;
			if (cc > ciabstartb)
				cc -= ciabstartb;
			else
				cc = 0;
			SAEF_assert((ciabtb + 1) >= cc);
			ciabtb_passed = cc;
		}
	}

	/* Called to advance all CIA timers to the current time.  This expects that
	one of the timer values will be modified, and CIA_calctimers will be called
	in the same cycle.  */
	function CIA_update_check() {
		var ccount = SAEV_Events_currcycle - SAER_Events_eventtab[SAEC_Events_EV_CIA].oldcycles + div10;
		var ciaclocks = ccount / DIV10 >>> 0;

		var aovfla = 0, aovflb = 0, asp = 0, bovfla = 0, bovflb = 0, bsp = 0;
		var icr = 0;

		div10 = ccount % DIV10;

		/* CIA A timers */
		if ((ciaacra & 0x21) == 0x01) {
			var check = true;
			var cc = ciaclocks;
			if (ciaastarta > 0) {
				if (cc > ciaastarta) {
					cc -= ciaastarta;
					ciaastarta = 0;
				} else {
					ciaastarta -= cc;
					check = false;
				}
			}
			if (check) {
				SAEF_assert((ciaata + 1) >= cc);
				if ((ciaata + 1) == cc) {
					if ((ciaacra & 0x48) == 0x40 && ciaasdr_cnt > 0 && --ciaasdr_cnt == 0)
						asp = 1;
					aovfla = 1;
					if ((ciaacrb & 0x61) == 0x41 || (ciaacrb & 0x61) == 0x61) {
						if (ciaatb-- == 0)
							aovflb = 1;
					}
				}
				ciaata -= cc;
			}
		}
		if ((ciaacrb & 0x61) == 0x01) {
			var check = true;
			var cc = ciaclocks;
			if (ciaastartb > 0) {
				if (cc > ciaastartb) {
					cc -= ciaastartb;
					ciaastartb = 0;
				} else {
					ciaastartb -= cc;
					check = false;
				}
			}
			if (check) {
				SAEF_assert((ciaatb + 1) >= cc);
				if ((ciaatb + 1) == cc)
					aovflb = 1;
				ciaatb -= cc;
			}
		}

		/* CIA B timers */
		if ((ciabcra & 0x21) == 0x01) {
			var check = true;
			var cc = ciaclocks;
			if (ciabstarta > 0) {
				if (cc > ciabstarta) {
					cc -= ciabstarta;
					ciabstarta = 0;
				} else {
					ciabstarta -= cc;
					check = false;
				}
			}
			if (check) {
				SAEF_assert((ciabta + 1) >= cc);
				if ((ciabta + 1) == cc) {
					if ((ciabcra & 0x48) == 0x40 && ciabsdr_cnt > 0 && --ciabsdr_cnt == 0)
						bsp = 1;
					bovfla = 1;
					if ((ciabcrb & 0x61) == 0x41 || (ciabcrb & 0x61) == 0x61) {
						if (ciabtb-- == 0)
							bovflb = 1;
					}
				}
				ciabta -= cc;
			}
		}
		if ((ciabcrb & 0x61) == 0x01) {
			var check = true;
			var cc = ciaclocks;
			if (ciabstartb > 0) {
				if (cc > ciabstartb) {
					cc -= ciabstartb;
					ciabstartb = 0;
				} else {
					ciabstartb -= cc;
					check = false;
				}
			}
			if (check) {
				SAEF_assert((ciabtb + 1) >= cc);
				if ((ciabtb + 1) == cc)
					bovflb = 1;
				ciabtb -= cc;
			}
		}

		if (aovfla) {
			ciaaicr |= 1; icr = 1;
			ciaata = ciaala;
			if (ciaacra & 0x8) {
				ciaacra &= ~1;
			}
		}
		if (aovflb) {
			ciaaicr |= 2; icr = 1;
			ciaatb = ciaalb;
			if (ciaacrb & 0x8) {
				ciaacrb &= ~1;
			}
		}
		if (asp) {
			ciaaicr |= 8; icr = 1;
		}
		if (bovfla) {
			ciabicr |= 1; icr |= 2;
			ciabta = ciabla;
			if (ciabcra & 0x8) {
				ciabcra &= ~1;
			}
		}
		if (bovflb) {
			ciabicr |= 2; icr |= 2;
			ciabtb = ciablb;
			if (ciabcrb & 0x8) {
				ciabcrb &= ~1;
			}
		}
		if (bsp) {
			ciabicr |= 8; icr |= 2;
		}
		return icr;
	}
	function CIA_update() {
		var icr = CIA_update_check();
		if (icr & 1) RethinkICRA();
		if (icr & 2) RethinkICRB();
	}

	/* Call this only after CIA_update has been called in the same cycle.  */
	function CIA_calctimers() {
		var ciaatimea = -1, ciaatimeb = -1, ciabtimea = -1, ciabtimeb = -1;
		var div10diff = DIV10 - div10;

		SAER_Events_eventtab[SAEC_Events_EV_CIA].oldcycles = SAEV_Events_currcycle;

		if ((ciaacra & 0x21) == 0x01) {
			ciaatimea = div10diff + DIV10 * (ciaata + ciaastarta);
		}
		/*#if 0
		if ((ciaacrb & 0x61) == 0x41) {
			// Timer B will not get any pulses if Timer A is off.
			if (ciaatimea >= 0) {
				// If Timer A is in one-shot mode, and Timer B needs more than one pulse, it will not underflow.
				if (ciaatb == 0 || (ciaacra & 0x8) == 0) {
					// Otherwise, we can determine the time of the underflow.
					// This may overflow, however.  So just ignore this timer and use the fact that we"ll call CIA_handler for the A timer.
					// ciaatimeb = ciaatimea + ciaala * DIV10 * ciaatb;
				}
			}
		}
		#endif*/
		if ((ciaacrb & 0x61) == 0x01) {
			ciaatimeb = div10diff + DIV10 * (ciaatb + ciaastartb);
		}

		if ((ciabcra & 0x21) == 0x01) {
			ciabtimea = div10diff + DIV10 * (ciabta + ciabstarta);
		}
		/*#if 0
		if ((ciabcrb & 0x61) == 0x41) {
			// Timer B will not get any pulses if Timer A is off.
			if (ciabtimea >= 0) {
				// If Timer A is in one-shot mode, and Timer B needs more than one pulse, it will not underflow.
				if (ciabtb == 0 || (ciabcra & 0x8) == 0) {
					// Otherwise, we can determine the time of the underflow.
					// ciabtimeb = ciabtimea + ciabla * DIV10 * ciabtb;
				}
			}
		}
		#endif*/
		if ((ciabcrb & 0x61) == 0x01) {
			ciabtimeb = div10diff + DIV10 * (ciabtb + ciabstartb);
		}

		SAER_Events_eventtab[SAEC_Events_EV_CIA].active = (ciaatimea != -1 || ciaatimeb != -1 || ciabtimea != -1 || ciabtimeb != -1);
		if (SAER_Events_eventtab[SAEC_Events_EV_CIA].active) {
			var ciatime = SAEC_Events_CYCLE_MAX;
			if (ciaatimea != -1)
				ciatime = ciaatimea;
			if (ciaatimeb != -1 && ciaatimeb < ciatime)
				ciatime = ciaatimeb;
			if (ciabtimea != -1 && ciabtimea < ciatime)
				ciatime = ciabtimea;
			if (ciabtimeb != -1 && ciabtimeb < ciatime)
				ciatime = ciabtimeb;
			SAER_Events_eventtab[SAEC_Events_EV_CIA].evtime = SAEV_Events_currcycle + ciatime;
		}
		SAER.events.schedule();
	}

	this.handler = function() { //CIA_handler()
		CIA_update();
		CIA_calctimers();
	}

	this.parallelack = function() { //cia_parallelack()
		ciaaicr |= 0x10;
		RethinkICRA();
	}
	this.diskindex = function() { //cia_diskindex()
		ciabicr |= 0x10;
		RethinkICRB();
	}

	function checkalarm(tod, alarm, inc, ab) {
		if (tod == alarm)
			return true;
		/*#if 0
		if (!ab)
			return false;
		#endif*/
		if (!SAEV_config.chipset.cia.todBug)
			return false;
		if (!inc)
			return false;
		/* emulate buggy TODMED counter.
		* it counts: .. 29 2A 2B 2C 2D 2E 2F 20 30 31 32 ..
		* (2F->20->30 only takes couple of cycles but it will trigger alarm... */
		if (tod & 0x000fff)
			return false;

		return (((tod - 1) >>> 0) & 0xfff000) == alarm;
	}

	//function munge24(x) { return x & (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68000 ? 0x00ffffff : 0xffffffff); }

	function ciab_checkalarm(inc, irq) {
		// hack: do not trigger alarm interrupt if KS code and both
		// tod and alarm == 0. This incorrectly triggers on non-cycle exact
		// modes. Real hardware value written to ciabtod by KS is always
		// at least 1 or larger due to bus cycle delays when reading old value.
		//#if 1
		//if ((munge24(SAER.cpu.m68k_getpc2()) & 0xFFF80000) != 0xF80000) {
		if (!SAER.cpu.pc_in_rom()) {
			if (ciabtod == 0 && ciabalarm == 0)
				return false;
		}
		//#endif
		if (checkalarm(ciabtod, ciabalarm, inc, 1)) {
			if (irq) {
				ciabicr |= 4;
				RethinkICRB();
			}
			return true;
		}
		return false;
	}

	function ciaa_checkalarm(inc) {
		if (checkalarm (ciaatod, ciaaalarm, inc, 0)) {
			ciaaicr |= 4;
			RethinkICRA();
		}
	}

	//#ifdef TOD_HACK
	var tod_hack_tv = 0, tod_hack_tod = 0, tod_hack_tod_last = 0; //u64
	var tod_hack_enabled = 0; //all int
	var tod_hack_delay = 0;
	var tod_diff_cnt = 0;
	const TOD_HACK_DELAY = 50;
	const TOD_HACK_TIME = 312 * 50 * 10;
	function tod_hack_reset() {
		var tv = {};
		SAEF_gettimeofday(tv, null);
		tod_hack_tv = tv.tv_sec * 1000000 + tv.tv_usec;
		tod_hack_tod = ciaatod;
		tod_hack_tod_last = tod_hack_tod;
		tod_diff_cnt = 0;
	}
	//#endif

	var heartbeat_cnt = 0; //int
	/*this.cia_heartbeat = function() {
		heartbeat_cnt = 10;
	}*/

	var oldrate = 0;
	function do_tod_hack(dotod) {
		//struct timeval tv;
		//static int oldrate;
		var rate;
		var docount = false;

		if (tod_hack_enabled == 0)
			return;
		/*OWN
		if (!heartbeat_cnt) {
			if (tod_hack_enabled > 0)
				tod_hack_enabled = -1;
			return;
		}*/
		if (tod_hack_enabled < 0) {
			tod_hack_enabled = TOD_HACK_TIME;
			return;
		}
		if (tod_hack_enabled > 1) {
			tod_hack_enabled--;
			if (tod_hack_enabled == 1) {
				SAEF_log("cia.do_tod_hack() enabled");
				tod_hack_reset();
			}
			return;
		}

		if (SAEV_config.chipset.cia.tod == SAEC_Config_Chipset_CIA_TOD_VSync) {
			rate = Math.floor(SAER.playfield.get_vblank_hz() + 0.5);
			if (rate >= 59 && rate <= 61)
				rate = 60;
			if (rate >= 49 && rate <= 51)
				rate = 50;
		} else if (SAEV_config.chipset.cia.tod == SAEC_Config_Chipset_CIA_TOD_50Hz)
			rate = 50;
		else
			rate = 60;

		if (rate <= 0)
			return;
		if (rate != oldrate || (ciaatod & 0xfff) != (tod_hack_tod_last & 0xfff)) {
			SAEF_log("cia.do_tod_hack() reset");
			tod_hack_reset();
			oldrate = rate;
			docount = true;
		}

		if (!dotod && SAEV_config.chipset.cia.tod == SAEC_Config_Chipset_CIA_TOD_VSync)
			return;

		if (tod_hack_delay > 0) {
			tod_hack_delay--;
			if (tod_hack_delay > 0)
				return;
			tod_hack_delay = TOD_HACK_DELAY;
		}

		var tv = {};
		SAEF_gettimeofday(tv, null);
		var t = tv.tv_sec * 1000000 + tv.tv_usec;
		var base = 1000000 / rate >>> 0;
		if (t - tod_hack_tv >= base) {
			tod_hack_tv += base;
			tod_diff_cnt += 1000000 - base * rate;
			tod_hack_tv += (tod_diff_cnt / rate >>> 0);
			tod_diff_cnt %= rate;
			docount = true;
		}
		if (docount) {
			ciaatod++;
			ciaatod &= 0x00ffffff;
			tod_hack_tod_last = ciaatod;
			ciaa_checkalarm(false);
		}
	}

	/*var resetwarning_phase = 0, resetwarning_timer = 0; //int

	function sendrw() {
		setcode(AK_RESETWARNING);
		ciaasdr = kbcode;
		kblostsynccnt = 8 * maxvpos * 8; // 8 frames * 8 bits.
		ciaaicr |= 8;
		RethinkICRA ();
		SAEF_log("cia.sendrw() sent reset warning code (phase=%d)", resetwarning_phase);
	}
	int resetwarning_do (int canreset) {
		if (resetwarning_phase || SAR.m68k.halted > 0) {
			if (canreset) {
				resetwarning_phase = 0;
				resetwarning_timer = 0;
			}
			return 0;
		}
		resetwarning_phase = 1;
		resetwarning_timer = maxvpos_nom * 5;
		SAEF_log("cia.resetwarning_do() triggered");
		sendrw();
		return 1;
	}
	static void resetwarning_check (void) {
		if (resetwarning_timer > 0) {
			resetwarning_timer--;
			if (resetwarning_timer <= 0) {
				SAEF_log("cia.resetwarning_check() forced reset. phase=%d", resetwarning_phase);
				resetwarning_phase = -1;
				kblostsynccnt = 0;
				send_internalevent(INTERNALEVENT_KBRESET);
				uae_reset(0, 1);
			}
		}
		if (resetwarning_phase == 1) {
			if (!kblostsynccnt) { // first AK_RESETWARNING handshake received
				SAEF_log("cia.resetwarning_check() second phase...");
				resetwarning_phase = 2;
				resetwarning_timer = maxvpos_nom * 5;
				sendrw();
			}
		} else if (resetwarning_phase == 2) {
			if (ciaacra & 0x40) { // second AK_RESETWARNING handshake active
				resetwarning_phase = 3;
				SAEF_log("cia.resetwarning_check() reset warning SP = output");
				/* System won"t reset until handshake signal becomes inactive or 10s has passed
				resetwarning_timer = 10 * maxvpos_nom * SAER.playfield.get_vblank_hz();
			}
		} else if (resetwarning_phase == 3) {
			if (!(ciaacra & 0x40)) { // second AK_RESETWARNING handshake disabled
				SAEF_log("cia.resetwarning_check() reset warning end by software. reset.");
				resetwarning_phase = -1;
				kblostsynccnt = 0;
				send_internalevent(INTERNALEVENT_KBRESET);
				uae_reset (0, 1);
			}
		}
	}*/

	//this.hsync = function() {} //CIA_hsync_prehandler()

	function setcode(keycode) {
		kbcode = ~((keycode << 1) | (keycode >> 7)) & 0xff;
	}

	function keyreq() {
		ciaasdr = kbcode;
		kblostsynccnt = 8 * SAER.playfield.get_maxvpos() * 8; // 8 frames * 8 bits.
		ciaaicr |= 8;
		RethinkICRA();
	}

	/* All this complexity to lazy evaluate TOD increase.
	 * Only increase it cycle-exactly if it is visible to running program:
	 * causes interrupt or program is reading or writing TOD registers
	 */

	var ciab_tod_hoffset = 0; //int
	var ciab_tod_event_state = 0; //int
	// TOD increase has extra 14-16 E-clock delay
	// Possibly TICK input pin has built-in debounce circuit
	const TOD_INC_DELAY = 14 * (ECLOCK_DATA_CYCLE + ECLOCK_WAIT_CYCLE) >> 1;

	function CIAB_tod_inc(irq) {
		ciab_tod_event_state = 3; // done
		if (!ciabtodon)
			return;
		ciabtod++;
		ciabtod &= 0xFFFFFF;
		ciab_checkalarm(true, irq);
	}

	function CIAB_tod_inc_event(v) {
		if (ciab_tod_event_state != 2)
			return;
		CIAB_tod_inc(true);
	}

	// Someone reads or writes TOD registers, sync TOD increase
	function CIAB_tod_check() {
		if (ciab_tod_event_state != 1 || !ciabtodon)
			return;
		var hpos = SAER.events.current_hpos();
		hpos -= ciab_tod_hoffset;
		if (hpos >= 0 || SAEV_config.cpu.speed < 0) {
			// Program should see the changed TOD
			CIAB_tod_inc(true);
			return;
		}
		// Not yet, add event to guarantee exact TOD inc position
		ciab_tod_event_state = 2; // event active
		SAER.events.event2_newevent_xx(-1, -hpos, 0, CIAB_tod_inc_event);
	}

	this.b_tod_handler = function(hoffset) { //CIAB_tod_handler()
		if (!ciabtodon)
			return;
		ciab_tod_hoffset = hoffset + TOD_INC_DELAY;
		ciab_tod_event_state = 1; // TOD inc needed
		if (checkalarm((ciabtod + 1) & 0xffffff, ciabalarm, true, 1)) {
			// causes interrupt on this line, add event
			ciab_tod_event_state = 2; // event active
			SAER.events.event2_newevent_xx (-1, ciab_tod_hoffset, 0, CIAB_tod_inc_event);
		}
	}

	//const RAWKEY_RESETWARNING = 0x78;
 	const RAWKEY_INIT_POWER_UP = 0xFD;
 	const RAWKEY_TERM_POWER_UP = 0xFE;

	function check_keyboard() {
		if ((SAER.input.keyboard.keysAvail() || kbstate < 3) && !kblostsynccnt ) {
			switch (kbstate) {
				case 0:
					kbcode = 0; //powerup resync
					kbstate++;
					break;
				case 1:
					setcode(RAWKEY_INIT_POWER_UP);
					kbstate++;
					break;
				case 2:
					setcode(RAWKEY_TERM_POWER_UP);
					kbstate++;
					break;
				case 3:
					kbcode = ~SAER.input.keyboard.nextKey() & 0xff;
					break;
			}
			keyreq();
		}
	}

	this.hsync_post = function(dotod) { //CIA_hsync_posthandler()
		// Previous line was supposed to increase TOD but no one cared. Do it now.
		if (ciab_tod_event_state == 1)
			CIAB_tod_inc(false);
		ciab_tod_event_state = 0;

		if (SAEV_config.chipset.cia.todHack && ciaatodon)
			do_tod_hack(dotod);

		/*if (resetwarning_phase) {
			resetwarning_check();
			while (keys_available())
				get_next_key();
		} else*/ {
			if ((SAEV_Events_hsync_counter & 15) == 0)
				check_keyboard();
		}
	}

	function calc_led(old_led) {
		var c = SAEV_Events_currcycle;
		var t = ((c - led_cycle) * SAEC_Events_CYCLE_UNIT_INV) >>> 0;
		if (old_led)
			led_cycles_on += t;
		else
			led_cycles_off += t;
		led_cycle = c;
	}
	function led_vsync() {
		calc_led(led);

		if (led_cycles_on && !led_cycles_off)
			var v = 255;
		else if (led_cycles_off && !led_cycles_on)
			var v = 0;
		else if (led_cycles_off)
			var v = ~~(led_cycles_on * 255 / (led_cycles_on + led_cycles_off));
		else
			var v = 255;

		if (v < 0)
			v = 0;
		else if (v > 255)
			v = 255;

		led_cycles_on = 0;
		led_cycles_off = 0;
		SAER.gui.data.powerled_brightness = v;
		if (led_old_brightness != SAER.gui.data.powerled_brightness) {
			SAER.gui.data.powerled = SAER.gui.data.powerled_brightness > 127;
			SAER.gui.led(SAEC_GUI_LED_POWER, SAER.gui.data.powerled, SAER.gui.data.powerled_brightness);
			SAER.audio.led_filter_audio();
		}
		led_old_brightness = v;
		led_cycle = SAEV_Events_currcycle;
	}

	this.vsync = function() { //CIA_vsync_prehandler()
		if (heartbeat_cnt > 0)
			heartbeat_cnt--;
		if (SAEV_RTC_delayed_write < 0)
			SAEV_RTC_delayed_write = 50;
		else if (SAEV_RTC_delayed_write > 0) {
			SAEV_RTC_delayed_write--;
			if (SAEV_RTC_delayed_write == 0)
				SAER.rtc.write();
		}
		led_vsync();
		this.handler();

		if (kblostsynccnt > 0) {
			kblostsynccnt -= SAER.playfield.get_maxvpos();
			if (kblostsynccnt <= 0) {
				kblostsynccnt = 0;
				keyreq();
			}
		}
	}

	function CIAA_tod_handler(v) {
		ciaatod++;
		ciaatod &= 0xFFFFFF;
		ciaa_checkalarm(true);
	}

	this.a_tod_inc = function(cycles) { //CIAA_tod_inc()
		//#ifdef TOD_HACK
		if (SAEV_config.chipset.cia.todHack && tod_hack_enabled == 1)
			return;
		//#endif
		if (!ciaatodon)
			return;

		SAER.events.event2_newevent_xx(-1, cycles + TOD_INC_DELAY, 0, CIAA_tod_handler);
	}

	function check_led() {
		var v = ciaapra;
		v |= ~ciaadra; /* output is high when pin's direction is input */
		var led2 = (v & 2) ? 0 : 1;
		if (led2 != led) {
			calc_led(led);
			led = led2;
			led_old_brightness = -1;
		}
	}

	function bfe001_change() {
		var v = ciaapra;
		check_led();
		if (SAEV_config.chipset.cia.overlay && (v & 1) != oldovl) {
			oldovl = v & 1;
			if (!oldovl)
				SAER.memory.mapOverlay(true);
			else
				SAER.memory.mapOverlay(false);
		}
		/*if (currprefs.cs_cd32cd && (v & 1) != oldcd32mute) {
			oldcd32mute = v & 1;
			akiko_mute (oldcd32mute ? 0 : 1);
		}*/
	}

	function getciatod(tod) {
		if (SAEV_config.chipset.cia.type6526) {
			var bcdtod = 0; //u32
			for (var i = 0; i < 4; i++) {
				var val = tod % 10;
				bcdtod *= 16; if (bcdtod > 0xffffffff) bcdtod -= 0x100000000;
				bcdtod += val; if (bcdtod > 0xffffffff) bcdtod -= 0x100000000;
				tod = tod / 10 >>> 0;
			}
			return bcdtod;
		}
		return tod;
	}

	function calc_bintod(v) { //OWN
		var bintod = 0;
		for (var i = 0; i < 4; i++) {
			var val = v / 16 >>> 0;
			bintod *= 10; if (bintod > 0xffffffff) bintod -= 0x100000000;
			bintod += val; if (bintod > 0xffffffff) bintod -= 0x100000000;
			v = v / 16 >>> 0;
		}
		return bintod;
	}
	//function setciatod(*tod, v) {
	function setciatod_ciaatod(v) {
		ciaatod = SAEV_config.chipset.cia.type6526 ? calc_bintod(v) : v;
	}
	function setciatod_ciaaalarm(v) {
		ciaaalarm = SAEV_config.chipset.cia.type6526 ? calc_bintod(v) : v;
	}
	function setciatod_ciabtod(v) {
		ciabtod = SAEV_config.chipset.cia.type6526 ? calc_bintod(v) : v;
	}
	function setciatod_ciabalarm(v) {
		ciabalarm = SAEV_config.chipset.cia.type6526 ? calc_bintod(v) : v;
	}

	function ReadCIAA(addr) {
		var tmp;
		var reg = addr & 15;

		compute_passed_time();

		switch (reg) {
		case 0:
			/*#ifdef ACTION_REPLAY
			action_replay_cia_access(false);
			#endif*/
			tmp = SAER.disk.status_ciaa() & 0x3c;
			tmp |= SAER.input.handle_joystick_buttons(ciaapra, ciaadra);
			tmp |= (ciaapra | (ciaadra ^ 3)) & 0x03;
			//tmp = SAER.dongle.cia_read(0, reg, tmp); /* unused */
			return tmp;
		case 1:
			//#ifdef PARALLEL_PORT
			if (SAEV_config.parallel.enabled) {
				tmp = SAER.parallel.direct_read_data();
				/*var isp = SAER.parallel.isprinter();
				if (isp > 0)
					tmp = ciaaprb;
				else if (isp < 0)
					tmp = SAER.parallel.direct_read_data();
				#ifdef ARCADIA
				else if (arcadia_bios) tmp = arcadia_parport (0, ciaaprb, ciaadrb);
				#endif
				else if (currprefs.win32_samplersoundcard >= 0) tmp = sampler_getsample ((ciabpra & 4) ? 1 : 0);
				else
					tmp = SAER.input.handle_parport_joystick(0, ciaaprb, ciaadrb);*/
			} else
			//#endif
				tmp = (ciaaprb & ciaadrb) | (ciaadrb ^ 0xff);

			//tmp = SAER.dongle.cia_read(1, reg, tmp); /* BUG (no effect) */
			//tmp = SAER.dongle.cia_read(0, reg, tmp); /* unused */
			if (ciaacrb & 2) {
				var pb7 = 0;
				if (ciaacrb & 4)
					pb7 = ciaacrb & 1;
				tmp &= ~0x80;
				tmp |= pb7 ? 0x80 : 00;
			}
			if (ciaacra & 2) {
				var pb6 = 0;
				if (ciaacra & 4)
					pb6 = ciaacra & 1;
				tmp &= ~0x40;
				tmp |= pb6 ? 0x40 : 00;
			}
			return tmp;
		case 2:
			return ciaadra;
		case 3:
			return ciaadrb;
		case 4:
			return (ciaata - ciaata_passed) & 0xff;
		case 5:
			return ((ciaata - ciaata_passed) >>> 8) & 0xff;
		case 6:
			return (ciaatb - ciaatb_passed) & 0xff;
		case 7:
			return ((ciaatb - ciaatb_passed) >>> 8) & 0xff;
		case 8:
			if (ciaatlatch) {
				ciaatlatch = 0;
				return getciatod(ciaatol) & 0xff;
			} else
				return getciatod(ciaatod) & 0xff;
		case 9:
			if (ciaatlatch)
				return (getciatod(ciaatol) >>> 8) & 0xff;
			else
				return (getciatod(ciaatod) >>> 8) & 0xff;
		case 10:
			/* only if not already latched. A1200 confirmed. (TW) */
			if (!SAEV_config.chipset.cia.type6526) {
				if (!ciaatlatch) {
					/* no latching if ALARM is set */
					if (!(ciaacrb & 0x80))
						ciaatlatch = 1;
					ciaatol = ciaatod;
				}
				return (getciatod(ciaatol) >>> 16) & 0xff;
			} else {
				if (ciaatlatch)
					return (getciatod(ciaatol) >>> 16) & 0xff;
				else
					return (getciatod(ciaatod) >>> 16) & 0xff;
			}
			break;
		case 11:
			if (SAEV_config.chipset.cia.type6526) {
				if (!ciaatlatch) {
					if (!(ciaacrb & 0x80))
						ciaatlatch = 1;
					ciaatol = ciaatod;
				}
				if (ciaatlatch)
					return getciatod(ciaatol) >>> 24;
				else
					return getciatod(ciaatod) >>> 24;
			}
			break;
		case 12:
			return ciaasdr;
		case 13:
			tmp = ciaaicr & ~(0x40 | 0x20);
			ciaaicr = 0;
			return tmp;
		case 14:
			return ciaacra;
		case 15:
			return ciaacrb;
		}
		return 0;
	}

	function ReadCIAB(addr) {
		var tmp;
		var reg = addr & 15;

		compute_passed_time();

		switch (reg) {
		case 0:
			tmp = 0;
			/*#ifdef ARCADIA
			// CD inactive, Arcadia bios 4.00 does not detect printer
			if (arcadia_bios && !SAEV_config.serial.enabled)
				tmp = 0x20;
			#endif*/
			if (SAEV_config.serial.enabled)
				tmp = SAER.serial.readstatus(ciabdra);
			//#ifdef PARALLEL_PORT
			if (SAEV_config.parallel.enabled) {
				tmp |= SAER.parallel.direct_read_status() & 7;
				/*var isp = SAER.parallel.isprinter();
				if (isp > 0) {
					//tmp |= ciabpra & (0x04 | 0x02 | 0x01);
					tmp &= ~3; // clear BUSY and PAPEROUT
					tmp |= 4; // set SELECT
				} else if (isp < 0)
					tmp |= SAER.parallel.direct_read_status() & 7;
				else
					tmp |= SAER.input.handle_parport_joystick(1, ciabpra, ciabdra);*/
			}
			//#endif
			tmp = SAER.dongle.cia_read(1, reg, tmp);
			return tmp;
		case 1:
			tmp = ciabprb;
			tmp = SAER.disk.status_ciab(tmp);
			//tmp = SAER.dongle.cia_read(1, reg, tmp); /* unused */
			if (ciabcrb & 2) {
				var pb7 = 0;
				if (ciabcrb & 4)
					pb7 = ciabcrb & 1;
				tmp &= ~0x80;
				tmp |= pb7 ? 0x80 : 00;
			}
			if (ciabcra & 2) {
				var pb6 = 0;
				if (ciabcra & 4)
					pb6 = ciabcra & 1;
				tmp &= ~0x40;
				tmp |= pb6 ? 0x40 : 00;
			}
			return tmp;
		case 2:
			return ciabdra;
		case 3:
			return ciabdrb;
		case 4:
			return (ciabta - ciabta_passed) & 0xff;
		case 5:
			return ((ciabta - ciabta_passed) >>> 8) & 0xff;
		case 6:
			return (ciabtb - ciabtb_passed) & 0xff;
		case 7:
			return ((ciabtb - ciabtb_passed) >>> 8) & 0xff;
		case 8:
			CIAB_tod_check();
			if (ciabtlatch) {
				ciabtlatch = 0;
				return getciatod(ciabtol) & 0xff;
			} else
				return getciatod(ciabtod) & 0xff;
		case 9:
			CIAB_tod_check();
			if (ciabtlatch)
				return (getciatod(ciabtol) >>> 8) & 0xff;
			else
				return (getciatod(ciabtod) >>> 8) & 0xff;
		case 10:
			CIAB_tod_check();
			if (!SAEV_config.chipset.cia.type6526) {
				if (!ciabtlatch) {
					/* no latching if ALARM is set */
					if (!(ciabcrb & 0x80))
						ciabtlatch = 1;
					ciabtol = ciabtod;
				}
				return (getciatod(ciabtol) >>> 16) & 0xff;
			} else {
				if (ciabtlatch)
					return (getciatod(ciabtol) >>> 16) & 0xff;
				else
					return (getciatod(ciabtod) >>> 16) & 0xff;
			}
		case 11:
			if (SAEV_config.chipset.cia.type6526) {
				if (!ciabtlatch) {
					if (!(ciabcrb & 0x80))
						ciabtlatch = 1;
					ciabtol = ciabtod;
				}
				if (ciabtlatch)
					return getciatod(ciabtol) >>> 24;
				else
					return getciatod(ciabtod) >>> 24;
			}
			break;
		case 12:
			return ciabsdr;
		case 13:
			tmp = ciabicr & ~(0x40 | 0x20);
			ciabicr = 0;
			return tmp;
		case 14:
			return ciabcra;
		case 15:
			return ciabcrb;
		}
		return 0;
	}

	function WriteCIAA(addr, val) {
		var reg = addr & 15;

		/*#ifdef ACTION_REPLAY
		ar_ciaa[reg] = val;
		#endif*/
		if (!SAEV_config.chipset.cia.overlay && oldovl) {
			SAER.memory.mapOverlay(true);
			oldovl = 0;
		}
		switch (reg) {
		case 0:
			ciaapra = (ciaapra & ~0xc3) | (val & 0xc3);
			bfe001_change();
			//SAER.input.handle_cd32_joystick_cia(ciaapra, ciaadra);
			SAER.dongle.cia_write(0, reg, val);

			//if (is_device_rom(SAEV_config, SAEC_RomType_AMAX, 0) > 0)
			if (SAEV_config.memory.amaxRom.size > 0)
				SAER.disk.amax_bfe001_write(val, ciaadra);

			break;
		case 1:
			ciaaprb = val;
			//SAER.dongle.cia_write(0, reg, val); /* unused */
			//#ifdef PARALLEL_PORT
			if (SAEV_config.parallel.enabled) {
				SAER.parallel.direct_write_data(ciaaprb, ciaadrb);
				/*var isp = SAER.parallel.isprinter();
				if (isp > 0) {
					SAER.parallel.doprinter(val);
					SAER.cia.parallelack();
				} else if (isp < 0) {
					SAER.parallel.direct_write_data(ciaaprb, ciaadrb);
					//SAER.cia.parallelack(); //OWN enabled elsewhere
				}
				#ifdef ARCADIA
				else if (arcadia_bios) arcadia_parport (1, ciaaprb, ciaadrb);
				#endif*/
			}
			//#endif
			break;
		case 2:
			ciaadra = val;
			//SAER.dongle.cia_write(0, reg, val); /* unused */
			bfe001_change();
			break;
		case 3:
			ciaadrb = val;
			//SAER.dongle.cia_write(0, reg, val); /* unused */
			/*#ifdef ARCADIA
			if (arcadia_bios)
				arcadia_parport (1, ciaaprb, ciaadrb);
			#endif*/
			break;
		case 4:
			CIA_update();
			ciaala = (ciaala & 0xff00) | val;
			CIA_calctimers();
			break;
		case 5:
			CIA_update();
			ciaala = (ciaala & 0xff) | (val << 8);
			if ((ciaacra & 1) == 0)
				ciaata = ciaala;
			if (ciaacra & 8) {
				ciaata = ciaala;
				ciaacra |= 1;
				ciaastarta = CIASTARTCYCLESHI;
			}
			CIA_calctimers();
			break;
		case 6:
			CIA_update();
			ciaalb = (ciaalb & 0xff00) | val;
			CIA_calctimers();
			break;
		case 7:
			CIA_update();
			ciaalb = (ciaalb & 0xff) | (val << 8);
			if ((ciaacrb & 1) == 0)
				ciaatb = ciaalb;
			if (ciaacrb & 8) {
				ciaatb = ciaalb;
				ciaacrb |= 1;
				ciaastartb = CIASTARTCYCLESHI;
			}
			CIA_calctimers();
			break;
		case 8:
			if (ciaacrb & 0x80) {
				//setciatod(&ciaaalarm, (getciatod(ciaaalarm) & ~0xff) | val);
				setciatod_ciaaalarm(((getciatod(ciaaalarm) & 0xffffff00) | val) >>> 0);
			} else {
				//setciatod(&ciaatod, (getciatod(ciaatod) & ~0xff) | val);
				setciatod_ciaatod(((getciatod(ciaatod) & 0xffffff00) | val) >>> 0);
				ciaatodon = 1;
				ciaa_checkalarm(false);
			}
			break;
		case 9:
			if (ciaacrb & 0x80) {
				//setciatod(&ciaaalarm, (getciatod(ciaaalarm) & ~0xff00) | (val << 8));
				setciatod_ciaaalarm(((getciatod(ciaaalarm) & 0xffff00ff) | (val << 8)) >>> 0);
			} else {
				//setciatod(&ciaatod, (getciatod(ciaatod) & ~0xff00) | (val << 8));
				setciatod_ciaatod(((getciatod(ciaatod) & 0xffff00ff) | (val << 8)) >>> 0);
			}
			break;
		case 10:
			if (ciaacrb & 0x80) {
				//setciatod(&ciaaalarm, (getciatod(ciaaalarm) & ~0xff0000) | (val << 16));
				setciatod_ciaaalarm(((getciatod(ciaaalarm) & 0xff00ffff) | (val << 16)) >>> 0);
			} else {
				//setciatod(&ciaatod, (getciatod(ciaatod) & ~0xff0000) | (val << 16));
				setciatod_ciaatod(((getciatod(ciaatod) & 0xff00ffff) | (val << 16)) >>> 0);
				if (!SAEV_config.chipset.cia.type6526)
					ciaatodon = 0;
			}
			break;
		case 11:
			if (SAEV_config.chipset.cia.type6526) {
				if (ciaacrb & 0x80) {
					//setciatod(&ciaaalarm, (getciatod(ciaaalarm) & ~0xff000000) | (val << 24));
					setciatod_ciaaalarm(((getciatod(ciaaalarm) & 0x00ffffff) | (val << 24)) >>> 0);
				} else {
					//setciatod(&ciaatod, (getciatod(ciaatod) & ~0xff000000) | (val << 24));
					setciatod_ciaatod(((getciatod(ciaatod) & 0x00ffffff) | (val << 24)) >>> 0);
					ciaatodon = 0;
				}
			}
			break;
		case 12:
			CIA_update();
			ciaasdr = val;
			if ((ciaacra & 0x41) == 0x41 && ciaasdr_cnt == 0)
				ciaasdr_cnt = 8 * 2;

			CIA_calctimers();
			break;
		case 13:
			//setclr(&ciaaimask, val);
			if (val & 0x80) ciaaimask |= val & 0x7F; else ciaaimask &= ~val;
			RethinkICRA();
			break;
		case 14:
			CIA_update();
			val &= 0x7f; /* bit 7 is unused */
			if ((val & 1) && !(ciaacra & 1))
				ciaastarta = CIASTARTCYCLESCRA;
			if ((val & 0x40) == 0 && (ciaacra & 0x40) != 0) {
				/* todo: check if low to high or high to low only */
				kblostsynccnt = 0;
			}
			ciaacra = val;
			if (ciaacra & 0x10) {
				ciaacra &= ~0x10;
				ciaata = ciaala;
			}
			CIA_calctimers();
			break;
		case 15:
			CIA_update();
			if ((val & 1) && !(ciaacrb & 1))
				ciaastartb = CIASTARTCYCLESCRA;
			ciaacrb = val;
			if (ciaacrb & 0x10) {
				ciaacrb &= ~0x10;
				ciaatb = ciaalb;
			}
			CIA_calctimers();
			break;
		}
	}

	function WriteCIAB(addr, val) {
		var reg = addr & 15;

		/*#ifdef ACTION_REPLAY
		ar_ciab[reg] = val;
		#endif*/
		switch (reg) {
		case 0:
			SAER.dongle.cia_write(1, reg, val);
			ciabpra = val;
			if (SAEV_config.serial.enabled)
				SAER.serial.writestatus(ciabpra, ciabdra);
			//#ifdef PARALLEL_PORT
			if (SAEV_config.parallel.enabled) {
				//if (SAER.parallel.isprinter() < 0) //OWN always true
				SAER.parallel.direct_write_status(ciabpra, ciabdra);
			}
			//#endif
			break;
		case 1:
			/*#ifdef ACTION_REPLAY
			action_replay_cia_access(true);
			#endif*/
			//SAER.dongle.cia_write(1, reg, val); /* unused */
			ciabprb = val;
			SAER.disk.select(val);
			break;
		case 2:
			//SAER.dongle.cia_write(1, reg, val); /* unused */
			ciabdra = val;
			if (SAEV_config.serial.enabled)
				SAER.serial.writestatus(ciabpra, ciabdra);
			break;
		case 3:
			//SAER.dongle.cia_write(1, reg, val); /* unused */
			ciabdrb = val;
			break;
		case 4:
			CIA_update();
			ciabla = (ciabla & 0xff00) | val;
			CIA_calctimers();
			break;
		case 5:
			CIA_update();
			ciabla = (ciabla & 0xff) | (val << 8);
			if ((ciabcra & 1) == 0)
				ciabta = ciabla;
			if (ciabcra & 8) {
				ciabta = ciabla;
				ciabcra |= 1;
				ciabstarta = CIASTARTCYCLESHI;
			}
			CIA_calctimers();
			break;
		case 6:
			CIA_update();
			ciablb = (ciablb & 0xff00) | val;
			CIA_calctimers();
			break;
		case 7:
			CIA_update();
			ciablb = (ciablb & 0xff) | (val << 8);
			if ((ciabcrb & 1) == 0)
				ciabtb = ciablb;
			if (ciabcrb & 8) {
				ciabtb = ciablb;
				ciabcrb |= 1;
				ciabstartb = CIASTARTCYCLESHI;
			}
			CIA_calctimers();
			break;
		case 8:
			CIAB_tod_check();
			if (ciabcrb & 0x80) {
				//setciatod(&ciabalarm, (getciatod(ciabalarm) & ~0xff) | val);
				setciatod_ciabalarm(((getciatod(ciabalarm) & 0xffffff00) | val) >>> 0);
			} else {
				//setciatod(&ciabtod, (getciatod(ciabtod) & ~0xff) | val);
				setciatod_ciabtod(((getciatod(ciabtod) & 0xffffff00) | val) >>> 0);
				ciabtodon = 1;
				ciab_checkalarm(false, true);
			}
			break;
		case 9:
			CIAB_tod_check ();
			if (ciabcrb & 0x80) {
				//setciatod(&ciabalarm, (getciatod(ciabalarm) & ~0xff00) | (val << 8));
				setciatod_ciabalarm(((getciatod(ciabalarm) & 0xffff00ff) | (val << 8)) >>> 0);
			} else {
				//setciatod(&ciabtod, (getciatod(ciabtod) & ~0xff00) | (val << 8));
				setciatod_ciabtod(((getciatod(ciabtod) & 0xffff00ff) | (val << 8)) >>> 0);
			}
			break;
		case 10:
			CIAB_tod_check();
			if (ciabcrb & 0x80) {
				//setciatod(&ciabalarm, (getciatod(ciabalarm) & ~0xff0000) | (val << 16));
				setciatod_ciabalarm(((getciatod(ciabalarm) & 0xff00ffff) | (val << 16)) >>> 0);
			} else {
				//setciatod(&ciabtod, (getciatod(ciabtod) & ~0xff0000) | (val << 16));
				setciatod_ciabtod(((getciatod(ciabtod) & 0xff00ffff) | (val << 16)) >>> 0);
				if (!SAEV_config.chipset.cia.type6526)
					ciabtodon = 0;
			}
			break;
		case 11:
			if (SAEV_config.chipset.cia.type6526) {
				CIAB_tod_check();
				if (ciabcrb & 0x80) {
					//setciatod(&ciabalarm, (getciatod(ciabalarm) & ~0xff000000) | (val << 24));
					setciatod_ciabalarm(((getciatod(ciabalarm) & 0x00ffffff) | (val << 24)) >>> 0);
				} else {
					//setciatod(&ciabtod, (getciatod(ciabtod) & ~0xff000000) | (val << 24));
					setciatod_ciabtod(((getciatod(ciabtod) & 0x00ffffff) | (val << 24)) >>> 0);
					ciabtodon = 0;
				}
			}
			break;
		case 12:
			CIA_update();
			ciabsdr = val;
			if ((ciabcra & 0x40) == 0)
				ciabsdr_cnt = 0;
			if ((ciabcra & 0x41) == 0x41 && ciabsdr_cnt == 0)
				ciabsdr_cnt = 8 * 2;
			CIA_calctimers();
			break;
		case 13:
			//setclr(&ciabimask, val);
			if (val & 0x80) ciabimask |= val & 0x7F; else ciabimask &= ~val;
			RethinkICRB();
			break;
		case 14:
			CIA_update();
			val &= 0x7f; /* bit 7 is unused */
			if ((val & 1) && !(ciabcra & 1))
				ciabstarta = CIASTARTCYCLESCRA;
			ciabcra = val;
			if (ciabcra & 0x10) {
				ciabcra &= ~0x10;
				ciabta = ciabla;
			}
			CIA_calctimers();
			break;
		case 15:
			CIA_update();
			if ((val & 1) && !(ciabcrb & 1))
				ciabstartb = CIASTARTCYCLESCRA;
			ciabcrb = val;
			if (ciabcrb & 0x10) {
				ciabcrb &= ~0x10;
				ciabtb = ciablb;
			}
			CIA_calctimers();
			break;
		}
	}

	/*this.cia_set_overlay = function(overlay) {
		oldovl = overlay;
	}*/

	/*-----------------------------------------------------------------------*/

	//this.setup = function () {}

	this.reset = function() { //CIA_reset()
		//#ifdef TOD_HACK
		tod_hack_tv = 0;
		tod_hack_tod = 0;
		tod_hack_enabled = 0;
		if (SAEV_config.chipset.cia.todHack)
			tod_hack_enabled = TOD_HACK_TIME;
		//#endif

		kblostsynccnt = 0;
		serbits = 0;
		//oldcd32mute = 1;
		//resetwarning_phase = resetwarning_timer = 0;
		heartbeat_cnt = 0;
		ciab_tod_event_state = 0;

		{
			oldovl = true;
			kbstate = 0;
			ciaatlatch = ciabtlatch = 0;
			ciaapra = 0; ciaadra = 0;
			ciaatod = ciabtod = 0; ciaatodon = ciabtodon = 0;
			ciaaicr = ciabicr = ciaaimask = ciabimask = 0;
			ciaacra = ciaacrb = ciabcra = ciabcrb = 0x4; /* outmode = toggle; */
			ciaala = ciaalb = ciabla = ciablb = ciaata = ciaatb = ciabta = ciabtb = 0xFFFF;
			ciaaalarm = ciabalarm = 0;
			ciabpra = 0x8C; ciabdra = 0;
			div10 = 0;
			ciaasdr_cnt = 0; ciaasdr = 0;
			ciabsdr_cnt = 0; ciabsdr = 0;
			ciaata_passed = ciaatb_passed = ciabta_passed = ciabtb_passed = 0;
			CIA_calctimers();
			SAER.disk.select_set(ciabprb);
		}
		SAER.memory.mapOverlay(false);
		check_led();

		if (SAEV_config.serial.enabled)
			SAER.serial.dtr_off(); // Drop DTR at reset

		/*#ifdef CD32
		akiko_reset ();
		if (!akiko_init ())
			currprefs.cs_cd32cd = changed_prefs.cs_cd32cd = 0;
		#endif*/
	}

	this.dump = function() { //dumpcia()
		SAEF_log("cia.dump() A: CRA %02x CRB %02x ICR %02x IM %02x TA %04x (%04x) TB %04x (%04x)", ciaacra, ciaacrb, ciaaicr, ciaaimask, ciaata, ciaala, ciaatb, ciaalb);
		SAEF_log("cia.dump() TOD %06x (%06x) ALARM %06x %c%c CYC=%08X", ciaatod, ciaatol, ciaaalarm, ciaatlatch ? "L" : " ", ciaatodon ? " " : "S", SAEV_Events_currcycle);
		SAEF_log("cia.dump() B: CRA %02x CRB %02x ICR %02x IM %02x TA %04x (%04x) TB %04x (%04x)", ciabcra, ciabcrb, ciabicr, ciabimask, ciabta, ciabla, ciabtb, ciablb);
		SAEF_log("cia.dump() TOD %06x (%06x) ALARM %06x %c%c CLK=%d", ciabtod, ciabtol, ciabalarm, ciabtlatch ? "L" : " ", ciabtodon ? " " : "S", div10 / SAEC_Events_CYCLE_UNIT);
	}

	/*-----------------------------------------------------------------------*/
	// Gayle or Fat Gary does not enable CIA /CS lines if both CIAs are selected
	// Old Gary based Amigas enable both CIAs in this situation

	function issinglecia() {
		return SAEV_config.chipset.ide || SAEV_config.chipset.pcmcia || SAEV_config.chipset.mbdmac;
	}
	function isgayle() {
		return SAEV_config.chipset.ide || SAEV_config.chipset.pcmcia;
	}

	function iscia(addr) {
		var mask = addr & 0xf000;
		return mask == 0xe000 || mask == 0xd000;
	}
	function isgaylenocia(addr) {
		if (!isgayle())
			return true;
		// gayle CIA region is only 4096 bytes at 0xbfd000 and 0xbfe000
		return iscia(addr);
	}
	function isgarynocia(addr) {
		return !iscia(addr) && SAEV_config.chipset.fatGaryRev >= 0;
	}

	/*---------------------------------*/

	function cia_wait_pre(cianummask) {
		var div = (SAEV_Events_currcycle - SAER_Events_eventtab[SAEC_Events_EV_CIA].oldcycles) % DIV10;
		var help = DIV10 * ECLOCK_DATA_CYCLE / 10 >>> 0;
		var cycles;

		if (div >= help) {
			cycles = DIV10 - div;
			cycles += help;
		} else if (div)
			cycles = DIV10 + help - div;
		else
			cycles = help - div;

		if (cycles)
			SAER.events.do_cycles(cycles);
	}

	function cia_wait_post(cianummask, value) {
		SAER.events.do_cycles(6 * SAEC_Events_CYCLE_UNIT >> 1);

		if (cia_interrupt_delay) {
			var v = cia_interrupt_delay;
			cia_interrupt_delay = 0;
			if (v & 1) ICR(0x0008);
			if (v & 2) ICR(0x2000);
		}
	}

	/*---------------------------------*/

	function get8(addr) {
		var r = (addr & 0xf00) >> 8;
		var v = 0xff;

		if (isgarynocia(addr))
			return SAER.memory.dummyGet(addr, 1, false, 0);
		if (!isgaylenocia(addr))
			return v;

		switch ((addr >> 12) & 3) {
		case 0:
			if (!issinglecia()) {
				cia_wait_pre(1 | 2);
				v = (addr & 1) ? ReadCIAA(r) : ReadCIAB(r);
				cia_wait_post(1 | 2, v);
			}
			break;
		case 1:
			cia_wait_pre(2);
			if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68000 && SAEV_config.cpu.compatible) {
				v = (addr & 1) ? SAER_CPU_regs.irc & 0xff : ReadCIAB(r);
			} else {
				v = (addr & 1) ? 0xff : ReadCIAB(r);
			}
			cia_wait_post(2, v);
			break;
		case 2:
			cia_wait_pre(1);
			if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68000 && SAEV_config.cpu.compatible)
				v = (addr & 1) ? ReadCIAA(r) : SAER_CPU_regs.irc >> 8;
			else
				v = (addr & 1) ? ReadCIAA(r) : 0xff;

			cia_wait_post(1, v);
			break;
		case 3:
			if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68000 && SAEV_config.cpu.compatible) {
				cia_wait_pre(0);
				v = (addr & 1) ? SAER_CPU_regs.irc & 0xff : SAER_CPU_regs.irc >> 8;
				cia_wait_post(0, v);
			}
			break;
		}

		return v;
	}

	function get16(addr) {
		var r = (addr & 0xf00) >> 8;
		var v = 0xffff;

		if (isgarynocia(addr))
			return SAER.memory.dummyGet(addr, 2, false, 0);
		if (!isgaylenocia (addr))
			return v;

		switch ((addr >> 12) & 3) {
			case 0:
				if (!issinglecia()) {
					cia_wait_pre(1 | 2);
					v = (ReadCIAB(r) << 8) | ReadCIAA(r);
					cia_wait_post(1 | 2, v);
				}
				break;
			case 1:
				cia_wait_pre(2);
				v = (ReadCIAB(r) << 8) | 0xff;
				cia_wait_post(2, v);
				break;
			case 2:
				cia_wait_pre(1);
				v = (0xff << 8) | ReadCIAA (r);
				cia_wait_post(1, v);
				break;
			case 3:
				if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68000 && SAEV_config.cpu.compatible) {
					cia_wait_pre(0);
					v = SAER_CPU_regs.irc;
					cia_wait_post(0, v);
				}
				break;
		}
		return v;
	}

	function get32(addr) {
		return ((get16(addr) << 16) | get16(addr + 2)) >>> 0;
	}

	function put8(addr, value) {
		var r = (addr & 0xf00) >> 8;

		if (isgarynocia(addr)) {
			SAER.memory.dummyPut(addr, 1, 0);
			return;
		}
		if (!isgaylenocia (addr))
			return;

		if (!issinglecia() || (addr & 0x3000) != 0) {
			cia_wait_pre(((addr & 0x2000) == 0 ? 1 : 0) | ((addr & 0x1000) == 0 ? 2 : 0));
			if ((addr & 0x2000) == 0)
				WriteCIAB(r, value);
			if ((addr & 0x1000) == 0)
				WriteCIAA(r, value);
			cia_wait_post(((addr & 0x2000) == 0 ? 1 : 0) | ((addr & 0x1000) == 0 ? 2 : 0), value);
		}
	}

	function put16(addr, value) {
		var r = (addr & 0xf00) >> 8;

		if (isgarynocia(addr)) {
			SAER.memory.dummyPut(addr, 2, 0);
			return;
		}
		if (!isgaylenocia (addr))
			return;

		if (!issinglecia() || (addr & 0x3000) != 0) {
			cia_wait_pre(((addr & 0x2000) == 0 ? 1 : 0) | ((addr & 0x1000) == 0 ? 2 : 0));
			if ((addr & 0x2000) == 0)
				WriteCIAB(r, value >> 8);
			if ((addr & 0x1000) == 0)
				WriteCIAA(r, value & 0xff);
			cia_wait_post(((addr & 0x2000) == 0 ? 1 : 0) | ((addr & 0x1000) == 0 ? 2 : 0), value);
		}
	}

	function put32(addr, value) {
		put16(addr, value >>> 16);
		put16(addr + 2, value & 0xffff);
	}

	function getInst32(addr) {
		if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68020) return SAEF_Memory_dummyGetInst32(addr);
		return get32(addr);
	}
	function getInst16(addr) {
		if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68020) return SAEF_Memory_dummyGetInst16(addr);
		return get16(addr);
	}
	SAEV_CIA_bank = new SAEO_Memory_addrbank(
		get32, get16, get8,
		put32, put16, put8,
		SAEF_Memory_defaultXLate, SAEF_Memory_defaultCheck, null, null, "CIA",
		getInst32, getInst16,
		//SAEC_Memory_addrbank_flag_IO | SAEC_Memory_addrbank_flag_CIA, S_READ, S_WRITE, null, 0x3f01, 0xbfc000
		SAEC_Memory_addrbank_flag_IO | SAEC_Memory_addrbank_flag_CIA, null, 0x3f01, 0xbfc000
	);
}
