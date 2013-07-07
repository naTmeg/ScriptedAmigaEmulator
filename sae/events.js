/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/

function Event1() {
	this.active = false;
	this.evtime = 0;
	this.oldcycles = 0;
	this.handler = function(v) {};
}

function Event2() {
	this.active = false;
	this.evtime = 0;
	this.handler = function(v) {};
	this.data = null;
}

function Events() {
	const SYNCBASE = 1000;

	this.eventtab = null;
	this.eventtab2 = null;
	this.currcycle = 0;
	var nextevent = 0;
	var nextevent2 = 0;
		
	var dmal = 0;
	var dmal_hpos = 0;
		
	var vsynctimebase = 0; 
	var vsyncmintime = 0; 
	var vsyncmaxtime = 0;    
	var vsyncwaittime = 0;   
	var vsynctimeperline = 0; 
	var is_syncline = 0;
	var is_syncline_end = 0;
	//var hsync_counter = 0;
	//var vsync_counter = 0;
		
	const MAVG_VSYNC_SIZE = 128;
	var ma_frameskipt = new MAvg(MAVG_VSYNC_SIZE);
	
	const FPSCOUNTER_MAVG_SIZE = 10;
	var fps_mavg = new MAvg(FPSCOUNTER_MAVG_SIZE);
	var idle_mavg = new MAvg(FPSCOUNTER_MAVG_SIZE);
	var timeframes = 0;
	var lastframetime = 0;
	var idletime = 0;
	var frametime = 0;
	var frameskiptime = 0;
	var linecounter = 0;

	var vsync_rendered = false;
	var frame_rendered = false;
	var frame_shown = false;

	var vsyncresume = false;

	/*---------------------------------*/
	
	this.setup = function () {
      if (this.eventtab === null) {
         this.eventtab = new Array(EV_MAX);
         for (var i = 0; i < EV_MAX; i++)
            this.eventtab[i] = new Event1();

         this.eventtab[EV_CIA].handler = function () {
            AMIGA.cia.handler();
         };
         this.eventtab[EV_AUDIO].handler = function () {
            AMIGA.audio.handler();
         };
         this.eventtab[EV_MISC].handler = function () {
            AMIGA.events.misc_handler();
         };
         this.eventtab[EV_HSYNC].handler = function () {
            AMIGA.events.hsync_handler();
         }
      }
      if (this.eventtab2 === null) {
         this.eventtab2 = new Array(EV2_MAX);
         for (var i = 0; i < EV2_MAX; i++)
            this.eventtab2[i] = new Event2();

         this.eventtab2[EV2_BLITTER].handler = function (data) {
            AMIGA.blitter.handler(data);
         };
         this.eventtab2[EV2_DISK].handler = function (data) {
            AMIGA.disk.handler(data);
         };
         this.eventtab2[EV2_DMAL].handler = function (data) {
            AMIGA.events.dmal_handler(data);
         }
      }

      this.calc_vsynctimebase(AMIGA.config.video.ntsc ? 60 : 50);
   };

	this.reset = function () {
      dmal = 0;
      dmal_hpos = 0;

      this.currcycle = 0;
      nextevent = CYCLE_MAX;
      nextevent2 = EV2_MISC;

      vsynctimebase = 0;
      vsyncmintime = 0;
      vsyncmaxtime = 0;
      vsyncwaittime = 0;
      vsynctimeperline = 0;
      is_syncline = 0;
      is_syncline_end = 0;

      this.fpscounter_reset();

      for (var i = 0; i < EV_MAX; i++) {
         this.eventtab[i].active = false;
         this.eventtab[i].evtime = 0;
         this.eventtab[i].oldcycles = 0;
      }
      for (var i = 0; i < EV2_MAX; i++) {
         this.eventtab2[i].active = false;
         this.eventtab2[i].evtime = 0;
      }
      this.eventtab[EV_HSYNC].evtime = 227 * CYCLE_UNIT;
      /* 0xe3 */
      this.eventtab[EV_HSYNC].active = true;

      this.schedule();
   };
	
	this.calc_vsynctimebase = function (hz) {
      vsynctimebase = Math.floor(SYNCBASE / hz);
      //vsynctimebase >>= 1;//(AMIGA.config.video.framerate > 1 ? 1 : 0);
   };
	
	/*---------------------------------*/   

	this.hpos = function () {
      return Math.floor((this.currcycle - this.eventtab[EV_HSYNC].oldcycles) * CYCLE_UNIT_INV);
   };
	
	this.cycles_in_range = function (endcycles) {
      return (endcycles - this.currcycle > 0);
   };

	/*---------------------------------*/

	this.schedule = function () {
      var mintime = CYCLE_MAX;

      for (var i = 0; i < EV_MAX; i++) {
         if (this.eventtab[i].active) {
            var evtime = this.eventtab[i].evtime - this.currcycle;
            if (evtime < mintime) mintime = evtime;
         }
      }
      nextevent = this.currcycle + mintime;
   };
	
	this.cycle = function (cycles) {
      if (vsyncresume) {
         vsyncresume = false;
         this.hsync_handler_post(1);
      }

      while ((nextevent - this.currcycle) <= cycles) {
         if (is_syncline) {
            var rpt = read_processor_time();
            if (is_syncline > 0) {
               var v = rpt - vsyncmintime;
               var v2 = rpt - is_syncline_end;
               if (v > vsynctimebase || v < -vsynctimebase) v = 0;
               if (v < 0 && v2 < 0) return;
            } else if (is_syncline < 0) {
               var v = rpt - is_syncline_end;
               if (v < 0) return;
            }
            is_syncline = 0;
         }

         cycles -= nextevent - this.currcycle;
         this.currcycle = nextevent;

         for (var i = 0; i < EV_MAX; i++) {
            if (this.eventtab[i].active && this.eventtab[i].evtime == this.currcycle)
               this.eventtab[i].handler(this.eventtab[i].data);
         }
         this.schedule();
      }
      this.currcycle += cycles;
   };

	/*---------------------------------*/
	
	var stack = { recursive:0, dorecheck:false };

	this.misc_handler = function () {
      //if (stack.recursive > 1) BUG.info('misc_handler() recursive %d', stack.recursive);
      var mintime;
      var ct = this.currcycle;

      if (stack.recursive) {
         stack.dorecheck = true;
         return;
      }
      stack.recursive++;
      this.eventtab[EV_MISC].active = false;

      var recheck = true;
      while (recheck) {
         recheck = false;
         mintime = CYCLE_MAX;

         for (var i = 0; i < EV2_MAX; i++) {
            if (this.eventtab2[i].active) {
               if (this.eventtab2[i].evtime == ct) {
                  this.eventtab2[i].active = false;
                  this.eventtab2[i].handler(this.eventtab2[i].data);

                  if (stack.dorecheck || this.eventtab2[i].active) {
                     recheck = true;
                     stack.dorecheck = false;
                  }
               } else {
                  var eventtime = this.eventtab2[i].evtime - ct;
                  if (eventtime < mintime)
                     mintime = eventtime;
               }
            }
         }
      }
      if (mintime != CYCLE_MAX) {
         this.eventtab[EV_MISC].active = true;
         this.eventtab[EV_MISC].oldcycles = ct;
         this.eventtab[EV_MISC].evtime = ct + mintime;
         this.schedule();
      }
      stack.recursive--;
   };

	this.newevent2_x = function (t, data, func) {
      var et = this.currcycle + t;
      var no = nextevent2;
      for (; ;) {
         if (!this.eventtab2[no].active)
            break;

         no++;
         if (no == EV2_MAX)
            no = EV2_MISC;
         if (no == nextevent2) {
            BUG.info('newevent2_x() out of events!');
            return;
         }
      }
      nextevent2 = no;

      this.eventtab2[no].active = true;
      this.eventtab2[no].evtime = et;
      this.eventtab2[no].handler = func;
      this.eventtab2[no].data = data;
      this.misc_handler();
   };

	this.newevent2 = function (t, data, func) {
      if (t <= 0)
         func(data);
      else
         this.newevent2_x(t * CYCLE_UNIT, data, func);
   };

	this.newevent = function (id, t, data) {
      this.eventtab2[id].active = true;
      this.eventtab2[id].evtime = this.currcycle + t * CYCLE_UNIT;
      this.eventtab2[id].data = data;
      this.misc_handler();
   };

	this.remevent = function (no) {
      if (this.eventtab2[no].active) {
         this.eventtab2[no].active = false;
         //BUG.info('remevent() %d', no);
      }
   };
	
	/*---------------------------------*/
	
	this.dmal_emu = function (v) {
      if (!(AMIGA.dmacon & DMAF_DMAEN))
         return;

      //var hpos = this.hpos();
      var dat, pt;
      if (v >= 6) {
         v -= 6;
         var nr = v >> 1;
         pt = AMIGA.audio.getpt(nr, (v & 1) != 0);
         //var dat = AMIGA.mem.load16_chip(pt);
         dat = AMIGA.mem.chip.data[pt >>> 1];
         AMIGA.custom.last_value = dat;
         AMIGA.audio.AUDxDAT(nr, dat);
      } else {
         var w = v & 1;
         pt = AMIGA.disk.getpt();
         if (w) {
            if (AMIGA.disk.fifostatus() <= 0) {
               //var dat = AMIGA.mem.load16_chip(pt);
               dat = AMIGA.mem.chip.data[pt >>> 1];
               AMIGA.custom.last_value = dat;
               AMIGA.disk.DSKDAT(dat);
            }
         } else {
            if (AMIGA.disk.fifostatus() >= 0) {
               dat = AMIGA.disk.DSKDATR();
               //AMIGA.mem.store16_chip(pt, dat);
               AMIGA.mem.chip.data[pt >>> 1] = dat;
            }
         }
      }
   };

	this.dmal_handler = function (v) {
      while (dmal) {
         if (dmal & 3)
            this.dmal_emu(dmal_hpos + ((dmal & 2) ? 1 : 0));
         dmal_hpos += 2;
         dmal >>>= 2;
      }
      this.remevent(EV2_DMAL);
   };
	
	this.dmal_hsync = function () {
      if (dmal) BUG.info('dmal_hsync() DMAL error!? %04x', dmal);
      dmal = AMIGA.audio.dmal();
      dmal <<= 6;
      dmal |= AMIGA.disk.dmal();
      if (dmal) {
         dmal_hpos = 0;
         this.newevent(EV2_DMAL, 7, 13);
      }
   };

	/*---------------------------------*/
	
	function sleep(ms) {
		var start = new Date().getTime();
		while ((new Date().getTime() - start) < ms) {}
	}

	function read_processor_time() {
		return (new Date().getTime()); 
		//return window.performance.now(); 
		//return window.performance.webkitNow(); 
	}

	function rpt_vsync(adjust) {
		var curr_time = read_processor_time();
		var v = curr_time - vsyncwaittime + adjust;
		if (v > SYNCBASE || v < -SYNCBASE) {
			vsyncmintime = vsyncmaxtime = vsyncwaittime = curr_time;
			v = 0;
		}
		return v;
	}

	this.framewait = function () {
      var clockadjust = 0;
      var curr_time;

      var frameskipt_avg = ma_frameskipt.set(frameskiptime);
      frameskiptime = 0;

      is_syncline = 0;

      if (AMIGA.config.cpu.speed < 0) {
         if (!frame_rendered)
            frame_rendered = AMIGA.playfield.render_screen(false);

         curr_time = read_processor_time();

         var adjust = 0;
         if (Math.floor(curr_time - vsyncwaittime) > 0 && Math.floor(curr_time - vsyncwaittime) < (vsynctimebase >> 1))
            adjust += curr_time - vsyncwaittime;
         adjust += clockadjust;

         console.log(adjust);

         vsyncwaittime = curr_time + vsynctimebase - adjust;
         vsyncmintime = curr_time;

         var max = Math.floor(vsynctimebase - adjust);
         if (max < 0) {
            max = 0;
            vsynctimeperline = 1;
         } else
            vsynctimeperline = Math.floor(max / (AMIGA.playfield.maxvpos_nom + 1));

         vsyncmaxtime = curr_time + max;
      } else {
         var start;
         var t = 0;

         if (!frame_rendered) {
            start = read_processor_time();
            frame_rendered = AMIGA.playfield.render_screen(false);
            t = read_processor_time() - start;
         }
         while (rpt_vsync(clockadjust) < -4)// / (SYNCBASE / 1000.0);
            sleep(2);

         start = read_processor_time();
         while (rpt_vsync(clockadjust) < 0) {
         }
         idletime += read_processor_time() - start;

         curr_time = read_processor_time();
         vsyncmintime = curr_time;
         vsyncmaxtime = vsyncwaittime = curr_time + vsynctimebase;
         if (frame_rendered) {
            frame_shown = AMIGA.playfield.show_screen();
            t += read_processor_time() - curr_time;
         }
         t += frameskipt_avg;

         vsynctimeperline = Math.floor((vsynctimebase - t) / 3);
         if (vsynctimeperline < 0)
            vsynctimeperline = 0;
         else if (vsynctimeperline > Math.floor(vsynctimebase / 3))
            vsynctimeperline = Math.floor(vsynctimebase / 3);
      }
   };

	this.framewait2 = function () {
      if (AMIGA.config.cpu.speed < 0) {
         if (AMIGA.playfield.is_last_line()) {
            /* really last line, just run the cpu emulation until whole vsync time has been used */
            vsyncmintime = vsyncmaxtime;
            /* emulate if still time left */
            is_syncline_end = read_processor_time() + vsynctimebase;
            /* far enough in future, we never wait that long */
            is_syncline = 1;
         } else {
            /* end of scanline, run cpu emulation as long as we still have time */
            vsyncmintime += vsynctimeperline;
            linecounter++;
            is_syncline = 0;
            if (Math.floor(vsyncmaxtime - vsyncmintime) > 0) {
               if (Math.floor(vsyncwaittime - vsyncmintime) > 0) {
                  var rpt = read_processor_time();
                  /* Extra time left? Do some extra CPU emulation */
                  if (Math.floor(vsyncmintime - rpt) > 0) {
                     is_syncline = 1;
                     /* limit extra time */
                     is_syncline_end = rpt + vsynctimeperline;
                     linecounter = 0;
                  }
               }
               // extra cpu emulation time if previous 10 lines without extra time.
               if (!is_syncline && linecounter >= 10) {
                  is_syncline = -1;
                  is_syncline_end = read_processor_time() + vsynctimeperline;
                  linecounter = 0;
               }
            }
         }
      } else {
         if (AMIGA.playfield.vpos + 1 < AMIGA.playfield.maxvpos + AMIGA.playfield.lof_store && (AMIGA.playfield.vpos == Math.floor(AMIGA.playfield.maxvpos_nom / 3) || AMIGA.playfield.vpos == Math.floor(AMIGA.playfield.maxvpos_nom * 2 / 3))) {
            vsyncmintime += vsynctimeperline;
            var rpt = read_processor_time();
            // sleep if more than 2ms "free" time
            while (Math.floor(vsyncmintime) - Math.floor(rpt + vsynctimebase / 10) > 0 && Math.floor(vsyncmintime - rpt) < vsynctimebase) {
               sleep(1);
               rpt = read_processor_time();
               //console.log('*');
            }
         }
      }
   };
	
	this.fpscounter_reset = function () {
      timeframes = 0;
      fps_mavg.clr();
      idle_mavg.clr();
      lastframetime = read_processor_time();
      idletime = 0;
   };

	this.fpscounter = function () {
      var hz = AMIGA.playfield.vblank_hz;

      var now = read_processor_time();
      var last = now - lastframetime;
      lastframetime = now;

      if (AMIGA.config.video.framerate > 1) {
         last <<= 1;
         hz /= 2;
      }

      fps_mavg.set(last / 10);
      idle_mavg.set(idletime / 10);
      idletime = 0;

      frametime += last;
      timeframes++;

      if ((timeframes & 7) == 0) {
         var idle = 1000 - (idle_mavg.average == 0 ? 0.0 : idle_mavg.average * 1000.0 / vsynctimebase);
         var fps = fps_mavg.average == 0 ? 0 : SYNCBASE * 10 / fps_mavg.average;
         if (fps > 9999) fps = 9999;
         if (idle < 0) idle = 0;
         if (idle > 100 * 10) idle = 100 * 10;
         if (hz * 10 > fps) idle *= (hz * 10 / fps);

         if ((timeframes & 15) == 0) {
            AMIGA.config.hooks.fps(Math.round(fps * 0.1));
            AMIGA.config.hooks.cpu(Math.round(idle * 0.1));
         }
      }
   };
	         
	/*---------------------------------*/

	this.hsync_handler_pre = function (onvsync) {
      //var hpos = this.hpos();
      AMIGA.copper.sync_copper_with_cpu(AMIGA.playfield.maxhpos, 0);
      AMIGA.playfield.hsync_handler_pre();
      AMIGA.disk.hsync();
      if (AMIGA.config.audio.enabled)
         AMIGA.audio.hsync();
      //AMIGA.cia.hsync_prehandler(); //empty
      //hsync_counter++;
      AMIGA.playfield.hsync_handler_pre_next_vpos(onvsync);

      this.eventtab[EV_HSYNC].evtime = this.currcycle + AMIGA.playfield.maxhpos * CYCLE_UNIT;
      this.eventtab[EV_HSYNC].oldcycles = this.currcycle;
   };

	this.vsync_handler_pre = function () {
      //AMIGA.audio.vsync(); //empty
      AMIGA.cia.vsync_prehandler();

      if (!vsync_rendered) {
         var start = read_processor_time();
         AMIGA.playfield.vsync_handle_redraw();
         frameskiptime += read_processor_time() - start;
         //vsync_rendered = true;
      }
      this.framewait();
      if (!frame_rendered)
         frame_rendered = AMIGA.playfield.render_screen(false);
      if (frame_rendered && !frame_shown)
         //frame_shown = AMIGA.playfield.show_screen();
         AMIGA.playfield.show_screen();

      this.fpscounter();
      vsync_rendered = false;
      frame_shown = false;
      frame_rendered = false;

      AMIGA.playfield.checklacecount(null);
   };
	
	var cia_hsync = 256;
	this.hsync_handler_post = function (onvsync) {
      AMIGA.copper.last_copper_hpos = 0;

      var ciasyncs = !(AMIGA.playfield.bplcon0 & 2) || ((AMIGA.playfield.bplcon0 & 2) && AMIGA.config.chipset.genlock);
      AMIGA.cia.hsync_posthandler(ciasyncs);
      if (AMIGA.config.cia.tod > 0) {
         cia_hsync -= 256;
         if (cia_hsync <= 0) {
            AMIGA.cia.vsync_posthandler(1);
            cia_hsync += Math.floor((MAXVPOS_PAL * MAXHPOS_PAL * 50 * 256) / (AMIGA.playfield.maxhpos * (AMIGA.config.cia.tod == 2 ? 60 : 50)));
         }
      } else if (AMIGA.config.cia.tod == 0 && onvsync)
         AMIGA.cia.vsync_posthandler(ciasyncs);

      AMIGA.playfield.hsync_handler_post();
      AMIGA.custom.last_value = 0xffff;

      if (!AMIGA.config.blitter.immediate && AMIGA.blitter.getState() != BLT_done && AMIGA.dmaen(DMAF_BPLEN) && AMIGA.playfield.getDiwstate() == DIW_WAITING_STOP)
         AMIGA.blitter.slowdown();

      if (onvsync) {
         // vpos_count >= MAXVPOS just to not crash if VPOSW writes prevent vsync completely
         /*if ((AMIGA.playfield.bplcon0 & 8) && !lightpen_triggered) {
          vpos_lpen = AMIGA.playfield.vpos - 1;
          hpos_lpen = AMIGA.playfield.maxhpos;
          lightpen_triggered = 1;
          }*/
         AMIGA.playfield.vpos = 0;
         this.vsync_handler_post();
         AMIGA.playfield.vpos_count = 0;
      }
      if (AMIGA.config.chipset.agnus_dip) {
         if (AMIGA.playfield.vpos == 1)
            AMIGA.INTREQ_0(INT_VERTB);
      } else {
         if (AMIGA.playfield.vpos == 0)
            AMIGA.INTREQ_0(INT_VERTB);
      }
      this.dmal_hsync();
      this.framewait2();
      AMIGA.playfield.hsync_handler_post_nextline_how();
      AMIGA.copper.reset2();

      if (CUSTOM_SIMPLE)
         AMIGA.playfield.do_sprites(0);

      //AMIGA.copper.check(2);
      AMIGA.playfield.hsync_handler_post_diw_change();
   };
	
	this.vsync_handler_post = function () {
      //if ((AMIGA.intreq & 0x0020) && (AMIGA.intena & 0x0020)) BUG.info('vblank interrupt not cleared');
      AMIGA.disk.vsync();
      AMIGA.playfield.vsync_handler_post();
   };
	
	this.hsync_handler = function() {
		var vs = AMIGA.playfield.is_custom_vsync();
		this.hsync_handler_pre(vs);
		if (vs) {
			this.vsync_handler_pre();

			if (AMIGA.config.video.framerate > 1) {
				if (AMIGA.playfield.framecnt == AMIGA.config.video.framerate - 1) {
					//vsyncresume = true;
					//throw new VSync(0, 'vsync');
					AMIGA.state = ST_IDLE;
				}
			} else {
				//vsyncresume = true;
				//throw new VSync(0, 'vsync');
				AMIGA.state = ST_IDLE;
			}
		}
		this.hsync_handler_post(vs);
	}	
}
