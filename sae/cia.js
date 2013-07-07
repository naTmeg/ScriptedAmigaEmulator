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

/*const CIAA_DEBUG_R = 0;
const CIAA_DEBUG_W = 0;
const CIAB_DEBUG_R = 0;
const CIAB_DEBUG_W = 0;
const DONGLE_DEBUG = 0;
const KB_DEBUG = 0;
const CLOCK_DEBUG = 0;*/

const TOD_HACK = 1;

/* e-clock is 10 CPU cycles, 4 cycles high, 6 low data transfer happens during 4 high cycles */
const ECLOCK_DATA_CYCLE = 4;
const ECLOCK_WAIT_CYCLE = 6;

const DIV10 = ((ECLOCK_DATA_CYCLE + ECLOCK_WAIT_CYCLE) * CYCLE_UNIT / 2); /* Yes, a bad identifier. */
const CIASTARTCYCLESHI = 3;
const CIASTARTCYCLESCRA = 2;

//console.log('DIV10', CYCLE_UNIT, DIV10);

function CIA() {
	var ciaaicr = 0, ciaaimask = 0, ciabicr = 0, ciabimask = 0;
	var ciaacra = 0, ciaacrb = 0, ciabcra = 0, ciabcrb = 0;
	var ciaastarta = 0, ciaastartb = 0, ciabstarta = 0, ciabstartb = 0;
	var ciaaicr_reg = 0, ciabicr_reg = 0;

	var ciaata = 0, ciaatb = 0, ciabta = 0, ciabtb = 0;
	var ciaata_passed = 0, ciaatb_passed = 0, ciabta_passed = 0, ciabtb_passed = 0;

	var ciaatod = 0, ciabtod = 0, ciaatol = 0, ciabtol = 0, ciaaalarm = 0, ciabalarm = 0;
	var ciaatlatch = 0, ciabtlatch = 0;
	var oldled = false;//, oldovl = false, oldcd32mute = false;
	var led = false;
	var led_old_brightness = 0;
	var led_cycles_on = 0, led_cycles_off = 0, led_cycle = 0;

	var ciaala = 0, ciaalb = 0, ciabla = 0, ciablb = 0;
	var ciaatodon = 0, ciabtodon = 0;
	var ciaapra = 0, ciaaprb = 0, ciaadra = 0, ciaadrb = 0, ciaasdr = 0, ciaasdr_cnt = 0;
	var ciabpra = 0, ciabprb = 0, ciabdra = 0, ciabdrb = 0, ciabsdr = 0, ciabsdr_cnt = 0;
	var div10 = 0;
	//var kbstate = 0, kblostsynccnt = 0, kbcode = 0;

	//var serbits = 0;
	var warned = 10;
	//var rtc_delayed_write = 0;

	/*function setclr (unsigned int *p, unsigned int val) {
		if (val & 0x80) {
			*p |= val & 0x7F;
		} else {
			*p &= ~val;
		}
	}*/

	function setclra(val) {
		if (val & 0x80) {
			ciaaimask |= val & 0x7F;
		} else {
			ciaaimask &= ~val;
		}
	}
	function setclrb(val) {
		if (val & 0x80) {
			ciabimask |= val & 0x7F;
		} else {
			ciabimask &= ~val;
		}
	}

	function RethinkICRA() {
		if (ciaaicr) {
			if (ciaaimask & ciaaicr) {
				ciaaicr |= 0x80;
				AMIGA.INTREQ_0(0x8000 | 0x0008);
			}
			ciaaicr_reg |= ciaaicr;
		}
	}

	function RethinkICRB() {
		if (ciabicr) {
			if (ciabimask & ciabicr) {
				ciabicr |= 0x80;
				AMIGA.INTREQ_0(0x8000 | 0x2000);
			}
			ciabicr_reg |= ciabicr;
		}
	}

	this.SetICRA = function (icr, sdr) {
      ciaaicr |= icr;
      ciaasdr = sdr;
      RethinkICRA();
   };

	this.SetICRB = function (icr, sdr) {
      ciabicr |= icr;
      if (sdr !== null)
         ciabsdr = sdr;
      RethinkICRB();
   };

	this.rethink = function () {
      RethinkICRA();
      RethinkICRB();
   };

	/* Figure out how many CIA timer cycles have passed for each timer since the last call of CIA_calctimers.  */
	function compute_passed_time() {
		var ccount = (AMIGA.events.currcycle - AMIGA.events.eventtab[EV_CIA].oldcycles + div10);
		var ciaclocks = Math.floor(ccount / DIV10);

		ciaata_passed = ciaatb_passed = ciabta_passed = ciabtb_passed = 0;

		/* CIA A timers */
		if ((ciaacra & 0x21) == 0x01) {
			var cc = ciaclocks;
			if (cc > ciaastarta)
				cc -= ciaastarta;
			else
				cc = 0;
			//assert((ciaata + 1) >= cc);
			ciaata_passed = cc;
		}
		if ((ciaacrb & 0x61) == 0x01) {
			var cc = ciaclocks;
			if (cc > ciaastartb)
				cc -= ciaastartb;
			else
				cc = 0;
			//assert((ciaatb + 1) >= cc);
			ciaatb_passed = cc;
		}

		/* CIA B timers */
		if ((ciabcra & 0x21) == 0x01) {
			var cc = ciaclocks;
			if (cc > ciabstarta)
				cc -= ciabstarta;
			else
				cc = 0;
			//assert((ciabta + 1) >= cc);
			ciabta_passed = cc;
		}
		if ((ciabcrb & 0x61) == 0x01) {
			var cc = ciaclocks;
			if (cc > ciabstartb)
				cc -= ciabstartb;
			else
				cc = 0;
			//assert((ciabtb + 1) >= cc);
			ciabtb_passed = cc;
		}
	}

	/* Called to advance all CIA timers to the current time.  This expects that
	one of the timer values will be modified, and CIA_calctimers will be called
	in the same cycle.  */

	function CIA_update_check() {
		var ccount = (AMIGA.events.currcycle - AMIGA.events.eventtab[EV_CIA].oldcycles + div10);
		var ciaclocks = Math.floor(ccount / DIV10);

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
				//assert((ciaata + 1) >= cc);
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
				//assert((ciaatb + 1) >= cc);
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
				//assert((ciabta + 1) >= cc);
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
				//assert((ciabtb + 1) >= cc);
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
		var icr = CIA_update_check ();
		if (icr & 1)
			RethinkICRA();
		if (icr & 2)
			RethinkICRB();
	}

	/* Call this only after CIA_update has been called in the same cycle.  */
	function CIA_calctimers() {
		var ciaatimea = -1, ciaatimeb = -1, ciabtimea = -1, ciabtimeb = -1;
		var div10diff = DIV10 - div10;

		if ((ciaacra & 0x21) == 0x01) ciaatimea = div10diff + DIV10 * (ciaata + ciaastarta);
		if ((ciaacrb & 0x61) == 0x01) ciaatimeb = div10diff + DIV10 * (ciaatb + ciaastartb);
		if ((ciabcra & 0x21) == 0x01) ciabtimea = div10diff + DIV10 * (ciabta + ciabstarta);
		if ((ciabcrb & 0x61) == 0x01) ciabtimeb = div10diff + DIV10 * (ciabtb + ciabstartb);

		AMIGA.events.eventtab[EV_CIA].oldcycles = AMIGA.events.currcycle;
		AMIGA.events.eventtab[EV_CIA].active = (ciaatimea != -1 || ciaatimeb != -1 || ciabtimea != -1 || ciabtimeb != -1);

		if (AMIGA.events.eventtab[EV_CIA].active) {
			var ciatime = CYCLE_MAX;
			if (ciaatimea != -1) ciatime = ciaatimea;
			if (ciaatimeb != -1 && ciaatimeb < ciatime) ciatime = ciaatimeb;
			if (ciabtimea != -1 && ciabtimea < ciatime) ciatime = ciabtimea;
			if (ciabtimeb != -1 && ciabtimeb < ciatime) ciatime = ciabtimeb;
			AMIGA.events.eventtab[EV_CIA].evtime = ciatime + AMIGA.events.currcycle;
		}
		AMIGA.events.schedule();
	}

	this.handler = function () {
      CIA_update();
      CIA_calctimers();
   };

	/*this.diskindex = function() {
		ciabicr |= 0x10;
		RethinkICRB();
	}
	this.parallelack = function() {
		ciaaicr |= 0x10;
		RethinkICRA();
	}*/

	function checkalarm (tod, alarm, inc) {
		if (tod == alarm)
			return 1;
		if (!inc)
			return 0;
		/* emulate buggy TODMED counter.
		* it counts: .. 29 2A 2B 2C 2D 2E 2F 20 30 31 32 ..
		* (2F->20->30 only takes couple of cycles but it will trigger alarm..
		*/
		if (tod & 0x000fff)
			return 0;
		if (((tod - 1) & 0xfff000) == alarm)
			return 1;
		return 0;
	}

	function ciab_checkalarm(inc) {
		if (checkalarm(ciabtod, ciabalarm, inc)) {
			ciabicr |= 4;
			RethinkICRB();
		}
	}

	function ciaa_checkalarm(inc) {
		if (checkalarm(ciaatod, ciaaalarm, inc)) {
			ciaaicr |= 4;
			RethinkICRA();
		}
	}

	function gettimeofday() {
		return Math.floor(new Date().getTime()); 
	}

//#ifdef TOD_HACK
	var tod_hack_tv = 0, tod_hack_tod = 0, tod_hack_tod_last = 0;
	var tod_hack_enabled = -1;
	const TOD_HACK_TIME = 312 * 50 * 10;
	function tod_hack_reset() {
		//var tv;
		//gettimeofday (&tv, NULL);
		//tod_hack_tv = (uae_u64)tv.tv_sec * 1000000 + tv.tv_usec;
		tod_hack_tv = gettimeofday();
		tod_hack_tod = ciaatod;
		tod_hack_tod_last = tod_hack_tod;
	}
//#endif

	/*var heartbeat_cnt = 0;
	function cia_heartbeat() {
		heartbeat_cnt = 10;
	}*/

	var oldrate = 0;
	function do_tod_hack(dotod) {
		//console.log('tod',tod_hack_enabled);
		//var tv;
		var t;
		var rate;
		var docount = 0;

		if (tod_hack_enabled == 0)
			return;
		/*if (!heartbeat_cnt) {
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
				BUG.info('TOD HACK enabled');
				tod_hack_reset();
			}
			return;
		}

		if (AMIGA.config.cia.tod == 0)
			rate = Math.floor(AMIGA.playfield.vblank_hz + 0.5);
		else if (AMIGA.config.cia.tod == 1)
			rate = 50;
		else
			rate = 60;
		if (rate <= 0)
			return;
		if (rate != oldrate || ciaatod != tod_hack_tod_last) {
			if (ciaatod != 0) BUG.info('TOD HACK reset %d,%d %d,%d', rate, oldrate, ciaatod, tod_hack_tod_last);
			tod_hack_reset();
			oldrate = rate;
			docount = 1;
		}
		if (!dotod && AMIGA.config.cia.tod == 0)
			return;

		/*gettimeofday (&tv, NULL); 
		t = (uae_u64)tv.tv_sec * 1000000 + tv.tv_usec;
		if (t - tod_hack_tv >= 1000000 / rate) {
			tod_hack_tv += 1000000 / rate;
			docount = 1;
		}*/
		t = gettimeofday();
		if (t - tod_hack_tv >= Math.floor(1000 / rate)) {
			tod_hack_tv += Math.floor(1000 / rate);
			docount = 1;
		}
		if (docount) {
			ciaatod++;
			ciaatod &= 0x00ffffff;
			tod_hack_tod_last = ciaatod;
			ciaa_checkalarm(0);
		}
	}

	//this.hsync_prehandler = function() {}

	this.hsync_posthandler = function (dotod) {
      if (ciabtodon && dotod) {
         ciabtod++;
         ciabtod &= 0xFFFFFF;
         ciab_checkalarm(1);
      }
      if (AMIGA.config.cia.tod_hack && ciaatodon)
         do_tod_hack(dotod);

      /*if (resetwarning_phase) {
       resetwarning_check ();
       while (keys_available ())
       get_next_key ();
       } else if ((keys_available () || kbstate < 3) && !kblostsynccnt && (hsync_counter & 15) == 0) {
       switch (kbstate) {
       case 0:
       kbcode = 0;
       kbstate++;
       break;
       case 1:
       setcode(AK_INIT_POWERUP);
       kbstate++;
       break;
       case 2:
       setcode(AK_TERM_POWERUP);
       kbstate++;
       break;
       case 3:
       kbcode = ~get_next_key();
       break;
       }
       keyreq();
       }*/
      AMIGA.input.keyboard.hsync();
   };

	function calc_led(old_led) {
		var c = AMIGA.events.currcycle;
		var t = Math.floor((c - led_cycle) * CYCLE_UNIT_INV);
		if (old_led)
			led_cycles_on += t;
		else
			led_cycles_off += t;
		led_cycle = c;
	}

	var powerled_brightness = 255;
	var powerled = true;
	function led_vsync() {
		var v;

		calc_led(led);
		if (led_cycles_on && !led_cycles_off)
			v = 255;
		else if (led_cycles_off && !led_cycles_on)
			v = 0;
		else if (led_cycles_off)
			v = Math.floor(led_cycles_on * 255 / (led_cycles_on + led_cycles_off));
		else
			v = 255;
		if (v < 0) v = 0;
		if (v > 255) v = 255;

		/*gui_data.powerled_brightness = v;
		if (led_old_brightness != gui_data.powerled_brightness) {
			gui_data.powerled = gui_data.powerled_brightness > 127;
			gui_led (LED_POWER, gui_data.powerled);
			led_filter_audio ();
		}
		led_old_brightness = gui_data.powerled_brightness;*/

		powerled_brightness = v;
		if (led_old_brightness != powerled_brightness) {
			powerled = powerled_brightness > 127;
			AMIGA.config.hooks.power_led(powerled);
			AMIGA.audio.filter.led_filter_on = powerled;
		}
		led_old_brightness = powerled_brightness;

		led_cycle = AMIGA.events.currcycle;
		led_cycles_on = 0;
		led_cycles_off = 0;
	}

	this.vsync_prehandler = function () {
      /*if (rtc_delayed_write < 0) {
       rtc_delayed_write = 50;
       } else if (rtc_delayed_write > 0) {
       rtc_delayed_write--;
       if (rtc_delayed_write == 0)
       write_battclock ();
       }*/
      led_vsync();
      this.handler();
      /*if (kblostsynccnt > 0) {
       kblostsynccnt -= maxvpos;
       if (kblostsynccnt <= 0) {
       kblostsynccnt = 0;
       keyreq ();
       write_log (_T('lostsync\n'));
       }
       }*/
      AMIGA.input.keyboard.vsync();
   };

	this.vsync_posthandler = function (dotod) {
      //if (heartbeat_cnt > 0) heartbeat_cnt--;
      if (TOD_HACK) {
         if (AMIGA.config.cia.tod_hack && tod_hack_enabled == 1)
            return;
      }
      if (ciaatodon && dotod) {
         ciaatod++;
         ciaatod &= 0xFFFFFF;
         ciaa_checkalarm(1);
      }
      /*if (vpos == 0) {
       write_log ('%d', vsync_counter);
       this.dump();
       }*/
   };

	function bfe001_change() {
		var v = ciaapra;
		var led2;

		v |= ~ciaadra; /* output is high when pin's direction is input */
		led2 = (v & 2) ? 0 : 1;
		if (led2 != led) {
			calc_led(led);
			led = led2;
			led_old_brightness = -1;
		}
		/*if (currprefs.cs_ciaoverlay && (v & 1) != oldovl) {
			oldovl = v & 1;
			if (!oldovl) {
				map_overlay (1);
			} else {
				//activate_debugger ();
				map_overlay (0);
			}
		}
		if (currprefs.cs_cd32cd && (v & 1) != oldcd32mute) {
			oldcd32mute = v & 1;
			akiko_mute (oldcd32mute ? 0 : 1);
		}*/
	}
	
	function handle_joystick_buttons(pra, dra) {
		var tmp = 0;
		if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Mouse) {
			if (!AMIGA.input.mouse.button[0]) tmp |= 0x40;
			if (dra & 0x40) tmp = (tmp & ~0x40) | (pra & 0x40);
		} else if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Joy0) {
			if (!AMIGA.input.joystick[0].button[0]) tmp |= 0x40;
			if (dra & 0x40) tmp = (tmp & ~0x40) | (pra & 0x40);
		} else tmp |= 0x40;

		if (AMIGA.config.ports[1].type == SAEV_Config_Ports_Type_Joy1) {
			if (!AMIGA.input.joystick[1].button[0]) tmp |= 0x80;
			if (dra & 0x80) tmp = (tmp & ~0x80) | (pra & 0x80);
		} else tmp |= 0x80;

		return tmp;
	}
	
	function handle_parport_joystick (port, pra, dra) {
		var v;
		switch (port) {
			case 0:
				v = (pra & dra) | (dra ^ 0xff);
				return v;
			case 1:
				v = ((pra & dra) | (dra ^ 0xff)) & 0x7;
				return v;
			default:
				return 0;
		}
	}
	
	function ReadCIAA(addr) {
		var tmp;
		var reg = addr & 15;

		compute_passed_time();

		//if (CIAA_DEBUG_R) write_log (_T('R_CIAA: bfe%x01 %08X\n'), reg, M68K_GETPC);

		switch (reg) {
		case 0:
			tmp = AMIGA.disk.status() & 0x3c;
			tmp |= handle_joystick_buttons(ciaapra, ciaadra);
			tmp |= (ciaapra | (ciaadra ^ 3)) & 0x03;
			//tmp = dongle_cia_read (0, reg, tmp);
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE001 R %02X %s\n'), tmp, debuginfo(0));
			return tmp;
		case 1:
/*#ifdef PARALLEL_PORT
			if (isprinter () > 0) {
				tmp = ciaaprb;
			} else if (isprinter () < 0) {
				uae_u8 v;
				parallel_direct_read_data (&v);
				tmp = v;
			} else if (currprefs.win32_samplersoundcard >= 0) {
				tmp = sampler_getsample ((ciabpra & 4) ? 1 : 0);
			} else
#endif*/
			{
				tmp = handle_parport_joystick(0, ciaaprb, ciaadrb);
				//tmp = dongle_cia_read (1, reg, tmp);
				//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE101 R %02X %s\n'), tmp, debuginfo(0));
			}
			if (ciaacrb & 2) {
				var pb7 = 0;
				if (ciaacrb & 4)
					pb7 = ciaacrb & 1;
				tmp &= ~0x80;
				tmp |= pb7 ? 0x80 : 0;
			}
			if (ciaacra & 2) {
				var pb6 = 0;
				if (ciaacra & 4)
					pb6 = ciaacra & 1;
				tmp &= ~0x40;
				tmp |= pb6 ? 0x40 : 0;
			}
			return tmp;
		case 2:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE201 R %02X %s\n'), ciaadra, debuginfo(0));
			return ciaadra;
		case 3:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE301 R %02X %s\n'), ciaadrb, debuginfo(0));
			return ciaadrb;
		case 4:
			return (ciaata - ciaata_passed) & 0xff;
		case 5:
			return ((ciaata - ciaata_passed) >> 8) & 0xff;
		case 6:
			return (ciaatb - ciaatb_passed) & 0xff;
		case 7:
			return ((ciaatb - ciaatb_passed) >> 8) & 0xff;
		case 8:
			if (ciaatlatch) {
				ciaatlatch = 0;
				return ciaatol & 0xff;
			} else
				return ciaatod & 0xff;
		case 9:
			if (ciaatlatch)
				return (ciaatol >> 8) & 0xff;
			else
				return (ciaatod >> 8) & 0xff;
		case 10:
			if (!ciaatlatch) { 
				if (!(ciaacrb & 0x80))
					ciaatlatch = 1;
				ciaatol = ciaatod;
			}
			return (ciaatol >> 16) & 0xff;
		case 12:
			return ciaasdr;
		case 13:
			tmp = ciaaicr_reg;
			ciaaicr &= ~ciaaicr_reg;
			ciaaicr_reg = 0;
			RethinkICRA();
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

		//if ((addr >= 8 && addr <= 10) || CIAB_DEBUG_R > 1) write_log (_T('R_CIAB: bfd%x00 %08X\n'), reg, M68K_GETPC);

		compute_passed_time ();

		switch (reg) {
		case 0:
			//if (currprefs.use_serial)
			tmp = AMIGA.serial.readStatus(ciabdra);
/*#ifdef PARALLEL_PORT
			if (isprinter () > 0) {
				//tmp |= ciabpra & (0x04 | 0x02 | 0x01);
				tmp &= ~3; // clear BUSY and PAPEROUT
				tmp |= 4; // set SELECT
			} else if (isprinter () < 0) {
				uae_u8 v;
				parallel_direct_read_status (&v);
				tmp |= v & 7;
			} else
#endif*/
			{
				tmp |= handle_parport_joystick(1, ciabpra, ciabdra);
				//tmp = dongle_cia_read (1, reg, tmp);
				//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFD000 R %02X %s\n'), tmp, debuginfo(0));
			}
			return tmp;
		case 1:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFD100 R %02X %s\n'), ciabprb, debuginfo(0));
			tmp = ciabprb;
			//tmp = dongle_cia_read(1, reg, tmp);
			if (ciabcrb & 2) {
				var pb7 = 0;
				if (ciabcrb & 4)
					pb7 = ciabcrb & 1;
				tmp &= ~0x80;
				tmp |= pb7 ? 0x80 : 0;
			}
			if (ciabcra & 2) {
				var pb6 = 0;
				if (ciabcra & 4)
					pb6 = ciabcra & 1;
				tmp &= ~0x40;
				tmp |= pb6 ? 0x40 : 0;
			}
			return tmp;
		case 2:
			return ciabdra;
		case 3:
			return ciabdrb;
		case 4:
			return (ciabta - ciabta_passed) & 0xff;
		case 5:
			return ((ciabta - ciabta_passed) >> 8) & 0xff;
		case 6:
			return (ciabtb - ciabtb_passed) & 0xff;
		case 7:
			return ((ciabtb - ciabtb_passed) >> 8) & 0xff;
		case 8:
			if (ciabtlatch) {
				ciabtlatch = 0;
				return ciabtol & 0xff;
			} else
				return ciabtod & 0xff;
		case 9:
			if (ciabtlatch)
				return (ciabtol >> 8) & 0xff;
			else
				return (ciabtod >> 8) & 0xff;
		case 10:
			if (!ciabtlatch) {
				if (!(ciabcrb & 0x80))
					ciabtlatch = 1;
				ciabtol = ciabtod;
			}
			return (ciabtol >> 16) & 0xff;
		case 12:
			return ciabsdr;
		case 13:
			tmp = ciabicr_reg;
			ciabicr &= ~ciabicr_reg;
			ciabicr_reg = 0;
			RethinkICRB();
			return tmp;
		case 14:
			//write_log (_T('CIABCRA READ %d %x\n'), ciabcra, M68K_GETPC);
			return ciabcra;
		case 15:
			return ciabcrb;
		}
		return 0;
	}

	function WriteCIAA(addr, val) {
		var reg = addr & 15;

		//if (CIAA_DEBUG_W) write_log (_T('W_CIAA: bfe%x01 %02X %08X\n'), reg, val, M68K_GETPC);

		/*if (!currprefs.cs_ciaoverlay && oldovl) {
			map_overlay (1);
			oldovl = 0;
		}*/
		switch (reg) {
		case 0:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE001 W %02X %s\n'), val, debuginfo(0));
			ciaapra = (ciaapra & ~0xc3) | (val & 0xc3);
			bfe001_change();
			//handle_cd32_joystick_cia(ciaapra, ciaadra);
			//dongle_cia_write (0, reg, val);
			break;
		case 1:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE101 W %02X %s\n'), val, debuginfo(0));
			ciaaprb = val;
			//dongle_cia_write (0, reg, val);
/*#ifdef PARALLEL_PORT
			if (isprinter() > 0) {
				doprinter (val);
				this.parallelack();
			} else if (isprinter() < 0) {
				parallel_direct_write_data (val, ciaadrb);
				this.parallelack();
			}
#endif*/
			break;
		case 2:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE201 W %02X %s\n'), val, debuginfo(0));
			ciaadra = val;
			//dongle_cia_write (0, reg, val);
			bfe001_change();
			break;
		case 3:
			ciaadrb = val;
			//dongle_cia_write (0, reg, val);
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE301 W %02X %s\n'), val, debuginfo(0));
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
				ciaaalarm = (ciaaalarm & ~0xff) | val;
			} else {
				ciaatod = (ciaatod & ~0xff) | val;
				ciaatodon = 1;
				ciaa_checkalarm(0);
			}
			break;
		case 9:
			if (ciaacrb & 0x80) {
				ciaaalarm = (ciaaalarm & ~0xff00) | (val << 8);
			} else {
				ciaatod = (ciaatod & ~0xff00) | (val << 8);
			}
			break;
		case 10:
			if (ciaacrb & 0x80) {
				ciaaalarm = (ciaaalarm & ~0xff0000) | (val << 16);
			} else {
				ciaatod = (ciaatod & ~0xff0000) | (val << 16);
				ciaatodon = 0;
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
			setclra(val);
			break;
		case 14:
			CIA_update();
			val &= 0x7f; /* bit 7 is unused */
			if ((val & 1) && !(ciaacra & 1))
				ciaastarta = CIASTARTCYCLESCRA;
			if ((val & 0x40) == 0 && (ciaacra & 0x40) != 0) {
				AMIGA.input.keyboard.lostsynccnt = 0;
				//if (KB_DEBUG) BUG.info('KB_ACK %02x->%02x', ciaacra, val);
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

	function WriteCIAB(addr, val)	{
		var reg = addr & 15;

		//if ((addr >= 8 && addr <= 10) || CIAB_DEBUG_W > 1) write_log (_T('W_CIAB: bfd%x00 %02X %08X\n'), reg, val, M68K_GETPC);
		switch (reg) {
		case 0:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFD000 W %02X %s\n'), val, debuginfo(0));
			//dongle_cia_write (1, reg, val);
			ciabpra = val;
			//if (currprefs.use_serial)
			AMIGA.serial.writeStatus(ciabpra, ciabdra);
/*#ifdef PARALLEL_PORT
			if (isprinter () < 0)
				parallel_direct_write_status (val, ciabdra);
#endif*/
			break;
		case 1:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFD100 W %02X %s\n'), val, debuginfo(0));
			//dongle_cia_write (1, reg, val);
			ciabprb = val;
			AMIGA.disk.select(val);
			break;
		case 2:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFD200 W %02X %s\n'), val, debuginfo(0));
			//dongle_cia_write (1, reg, val);
			ciabdra = val;
			//if (currprefs.use_serial)
			AMIGA.serial.writeStatus(ciabpra, ciabdra);
			break;
		case 3:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFD300 W %02X %s\n'), val, debuginfo(0));
			//dongle_cia_write (1, reg, val);
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
			if (ciabcrb & 0x80) {
				ciabalarm = (ciabalarm & ~0xff) | val;
			} else {
				ciabtod = (ciabtod & ~0xff) | val;
				ciabtodon = 1;
				ciab_checkalarm (0);
			}
			break;
		case 9:
			if (ciabcrb & 0x80) {
				ciabalarm = (ciabalarm & ~0xff00) | (val << 8);
			} else {
				ciabtod = (ciabtod & ~0xff00) | (val << 8);
			}
			break;
		case 10:
			if (ciabcrb & 0x80) {
				ciabalarm = (ciabalarm & ~0xff0000) | (val << 16);
			} else {
				ciabtod = (ciabtod & ~0xff0000) | (val << 16);
				ciabtodon = 0;
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
			setclrb(val);
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

	this.setup = function () {
   };

	this.reset = function () {
      if (TOD_HACK) {
         tod_hack_tv = 0;
         tod_hack_tod = 0;
         tod_hack_enabled = 0;
         if (AMIGA.config.cia.tod_hack)
            tod_hack_enabled = TOD_HACK_TIME;
      }
      //kblostsynccnt = 0;
      //serbits = 0;
      //oldcd32mute = 1;
      oldled = true;
      //resetwarning_phase = resetwarning_timer = 0;
      //heartbeat_cnt = 0;

      //oldovl = true;
      //kbstate = 0;
      ciaatlatch = ciabtlatch = 0;
      ciaapra = 0;
      ciaadra = 0;
      ciaatod = ciabtod = 0;
      ciaatodon = ciabtodon = 0;
      ciaaicr = ciabicr = ciaaimask = ciabimask = 0;
      ciaacra = ciaacrb = ciabcra = ciabcrb = 0x4;
      /* outmode = toggle; */
      ciaala = ciaalb = ciabla = ciablb = ciaata = ciaatb = ciabta = ciabtb = 0xFFFF;
      ciaaalarm = ciabalarm = 0;
      ciabpra = 0x8C;
      ciabdra = 0;
      div10 = 0;
      ciaasdr_cnt = 0;
      ciaasdr = 0;
      ciabsdr_cnt = 0;
      ciabsdr = 0;
      ciaata_passed = ciaatb_passed = ciabta_passed = ciabtb_passed = 0;

      CIA_calctimers();
      AMIGA.disk.select_set(ciabprb);

      //map_overlay (0);

      //if (currprefs.use_serial) serial_dtr_off (); NI /* Drop DTR at reset */
   };

	this.dump = function () {
      BUG.info('A: CRA %02x CRB %02x ICR %02x IM %02x TA %04x (%04x) TB %04x (%04x)', ciaacra, ciaacrb, ciaaicr, ciaaimask, ciaata, ciaala, ciaatb, ciaalb);
      BUG.info('TOD %06x (%06x) ALARM %06x %s%s CYC=%.1f', ciaatod, ciaatol, ciaaalarm, ciaatlatch ? 'L' : ' ', ciaatodon ? ' ' : 'S', AMIGA.events.currcycle * CYCLE_UNIT_INV);
      BUG.info('B: CRA %02x CRB %02x ICR %02x IM %02x TA %04x (%04x) TB %04x (%04x)', ciabcra, ciabcrb, ciabicr, ciabimask, ciabta, ciabla, ciabtb, ciablb);
      BUG.info('TOD %06x (%06x) ALARM %06x %s%s CLK=%.1f', ciabtod, ciabtol, ciabalarm, ciabtlatch ? 'L' : ' ', ciabtodon ? ' ' : 'S', div10 * CYCLE_UNIT_INV);
   };

	// Gayle or Fat Gary does not enable CIA /CS lines if both CIAs are selected
	// Old Gary based Amigas enable both CIAs in this situation
	function issinglecia() {
		return false; //currprefs.cs_ide || currprefs.cs_pcmcia || currprefs.cs_mbdmac;
	}
	function isgayle() {
		return false; //currprefs.cs_ide || currprefs.cs_pcmcia;
	}

	function cia_wait_pre() {
		if (!CUSTOM_SIMPLE) {
			var div = (AMIGA.events.currcycle - AMIGA.events.eventtab[EV_CIA].oldcycles) % DIV10;
			var tmp = Math.floor(DIV10 * ECLOCK_DATA_CYCLE / 10);
			var cycles;

			if (div >= tmp)
				cycles = DIV10 - div + tmp;
			else if (div)
				cycles = DIV10 + tmp - div;
			else
				cycles = tmp - div;

			if (cycles)
				AMIGA.events.cycle(cycles);
		}
	}

	function cia_wait_post(value) {
		AMIGA.events.cycle(6 * CYCLE_UNIT / 2);
	}

	function isgaylenocia(addr) {
		// gayle CIA region is only 4096 bytes at 0xbfd000 and 0xbfe000
		if (!isgayle())
			return true;
		var mask = addr & 0xf000;
		return mask == 0xe000 || mask == 0xd000;
	}

	this.load8 = function (addr) {
      var r = (addr & 0xf00) >> 8;
      var v = 0xff;

      if (!isgaylenocia(addr))
         return v;

      cia_wait_pre();
      switch ((addr >> 12) & 3) {
         case 0:
            if (!issinglecia())
               v = (addr & 1) ? ReadCIAA(r) : ReadCIAB(r);
            break;
         case 1:
            v = (addr & 1) ? 0xff : ReadCIAB(r);
            break;
         case 2:
            v = (addr & 1) ? ReadCIAA(r) : 0xff;
            break;
         case 3:
         {
            //if (AMIGA.config.cpu.model == 68000 && AMIGA.config.cpu.compatible) v = (addr & 1) ? regs.irc : regs.irc >> 8;
            if (warned > 0) {
               BUG.info('cia_bget: unknown CIA address %x', addr);
               warned--;
            }
            break;
         }
      }
      cia_wait_post(v);
      return v;
   };

	this.load16 = function (addr) {
      var r = (addr & 0xf00) >> 8;
      var v = 0xffff;

      if (!isgaylenocia(addr))
         return v;

      cia_wait_pre();
      switch ((addr >> 12) & 3) {
         case 0:
            if (!issinglecia())
               v = (ReadCIAB(r) << 8) | ReadCIAA(r);
            break;
         case 1:
            v = (ReadCIAB(r) << 8) | 0xff;
            break;
         case 2:
            v = (0xff << 8) | ReadCIAA(r);
            break;
         case 3:
         {
            //if (AMIGA.config.cpu.model == 68000 && AMIGA.config.cpu.compatible) v = regs.irc;
            if (warned > 0) {
               BUG.info('cia_wget: unknown CIA address %x', addr);
               warned--;
            }
            break;
         }
      }
      cia_wait_post(v);
      return v;
   };

	this.load32 = function (addr) {
      var v = this.load16(addr) << 16;
      v |= this.load16(addr + 2);
      return v >>> 0;
   };

	this.store8 = function (addr, value) {
      var r = (addr & 0xf00) >> 8;

      if (!isgaylenocia(addr))
         return;

      cia_wait_pre();
      if (!issinglecia() || (addr & 0x3000) != 0) {
         if ((addr & 0x2000) == 0)
            WriteCIAB(r, value);
         if ((addr & 0x1000) == 0)
            WriteCIAA(r, value);
         if (((addr & 0x3000) == 0x3000) && warned > 0) {
            BUG.info('cia_bput: unknown CIA address %x %x', addr, value);
            warned--;
         }
      }
      cia_wait_post(value);
   };

	this.store16 = function (addr, value) {
      var r = (addr & 0xf00) >> 8;

      if (!isgaylenocia(addr))
         return;

      cia_wait_pre();
      if (!issinglecia() || (addr & 0x3000) != 0) {
         if ((addr & 0x2000) == 0)
            WriteCIAB(r, value >> 8);
         if ((addr & 0x1000) == 0)
            WriteCIAA(r, value & 0xff);
         if (((addr & 0x3000) == 0x3000) && warned > 0) {
            BUG.info('cia_wput: unknown CIA address %x %x', addr, value);
            warned--;
         }
      }
      cia_wait_post(value);
   };

	this.store32 = function (addr, value) {
		this.store16(addr, value >> 16);
		this.store16(addr + 2, value & 0xffff);
	}
}
