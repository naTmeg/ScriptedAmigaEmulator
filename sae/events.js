/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/

function Event() {
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

	this.lofChanged = false;
	this.lofStore = 0;
	this.lof = 0;
	this.lol = 0;
	
	this.vpos = 0;
	this.vpos_previous = 0;
	this.hpos_previous = 0;

	this.maxhpos = 0;
	this.maxvpos = 0;
	this.hz = 0;
	
	var dmal = 0
	var dmal_hpos = 0;
		
	var vsynctimebase = 0;	
	var vsyncmintime = 0;
	var vsynctimeperline = 0;
	var vsyncmaxtime = 0;
	var vsyncwaittime = 0;
	var vsync_rendered = false;
	var is_syncline = 0;
	var is_syncline_end = 0;

	var frameskip = new mavg(128);
	var frameskiptime = 0;
	
	var counter = {	
		lasttime:0,
		frametime:0,
		frames:0,
		fps:new mavg(10),
		idle:new mavg(10),		
		idletime:0,
		bogus:0
	};	
	this.timeframes = 0;
			
	this.eventtab = null;
	this.eventtab2 = null;
	this.currcycle = 0;
	var nextEvent = 0;
	var nextEvent2 = EV2_MISC;
	
	this.setup = function() {
		if (this.eventtab === null) {
			this.eventtab = new Array(EV_MAX);
			for (var i = 0; i < EV_MAX; i++)
				this.eventtab[i] = new Event();

			this.eventtab[EV_CIA].handler = function() { AMIGA.cia.handler(); }
			this.eventtab[EV_AUDIO].handler = function() { AMIGA.audio.handler(); }
			this.eventtab[EV_MISC].handler = function() { var stack = { recursive:0, dorecheck:false }; AMIGA.events.MISC_handler(stack); }
			this.eventtab[EV_HSYNC].handler = function() { AMIGA.events.hSync(); }
			//this.eventtab[EV_COPPER].handler = function() { AMIGA.copper.handler(); }
			//this.eventtab[EV_BLITTER].handler = function() { AMIGA.blitter.handler(); }
			//this.eventtab[EV_RENDER].handler = function() { AMIGA.playfield.hSync(); }

			BUG.info('Events.setup() set %d event handlers', EV_MAX);
		} else		
			BUG.info('Events.setup() event handlers are cached...');
			
		if (this.eventtab2 === null) {
			this.eventtab2 = new Array(EV2_MAX);
			for (var i = 0; i < EV2_MAX; i++)
				this.eventtab2[i] = new Event2();

			//this.eventtab[EV2_BLITTER].handler = function(data) { AMIGA.blitter.handler(data); }
			//this.eventtab[EV2_DISK].handler = function(data) { AMIGA.disk.handler(data); }

			BUG.info('Events.setup() set %d event2 handlers', EV2_MAX);
		} else		
			BUG.info('Events.setup() event2 handlers are cached...');
			
		this.initHz();			
	}

	this.reset = function() {
		this.lofStore = 1;
		this.lof = 1;
		this.lol = 0;
		this.vpos = 0;
		
		dmal = 0
		dmal_hpos = 0;

		frameskip.clr();
		frameskiptime = 0;
		this.fpscounter_reset();	
			
		this.initHz();			
				
		this.currcycle = 0;
		
		for (var i = 0; i < EV_MAX; i++) {
			this.eventtab[i].active = false;
			this.eventtab[i].evtime = 0;
			this.eventtab[i].oldcycles = 0;
		}
		for (var i = 0; i < EV2_MAX; i++) {
			this.eventtab2[i].active = false;
			this.eventtab2[i].evtime = 0;
		}
		this.eventtab[EV_HSYNC].evtime = this.maxhpos * CYCLE_UNIT; /* 0xe3 */
		this.eventtab[EV_HSYNC].active = true;
		/*if (AMIGA.config.video.enabled) {
			//this.eventtab[EV_RENDER].evtime = 0x38 * CYCLE_UNIT;
			this.eventtab[EV_RENDER].evtime = 0xd4 * CYCLE_UNIT;
			this.eventtab[EV_RENDER].active = true;
		}*/
		this.schedule();
	}

	/*---------------------------------*/   

	this.initHz = function() {
 		if (!AMIGA.config.video.ntsc) {
			this.maxvpos = 312;
			this.maxhpos = 227;
			this.hz = 50;
		} else {
			this.maxvpos = 262;
			this.maxhpos = 227;
			this.hz = 60;
		}	
		vsynctimebase = SYNCBASE / this.hz;
	}

	this.hpos = function() {
		return Math.floor((this.currcycle - this.eventtab[EV_HSYNC].oldcycles) * CYCLE_UNIT_INV);
	}	
	
	this.cycles_in_range = function(endcycles) {
		return (endcycles - this.currcycle > 0);
	}	

	/*this.get_cycles = function() {
		return this.currcycle;
	}

	this.set_cycles = function(x) {
		this.currcycle = x;
		this.eventtab[EV_HSYNC].oldcycles = x;
	}*/

	/*---------------------------------*/

	this.MISC_handler = function(stack) {
		//console.log('MISC_handler() recursive %d', stack.recursive);
		var mintime;
		var recheck;
		var ct = AMIGA.events.currcycle;

		if (stack.recursive) {
			stack.dorecheck = true;
			return;
		}
		stack.recursive++;
		AMIGA.events.eventtab[EV_MISC].active = false;
		recheck = true;
		while (recheck) {
			recheck = false;
			mintime = CYCLE_MAX;
			
			for (var i = 0; i < EV2_MAX; i++) {
				if (AMIGA.events.eventtab2[i].active) {
					if (AMIGA.events.eventtab2[i].evtime == ct) {
						AMIGA.events.eventtab2[i].active = false;

						if (i == EV2_BLITTER)
							AMIGA.blitter.handler(AMIGA.events.eventtab2[i].data); 
						else if (i == EV2_DISK)
							AMIGA.disk.handler(AMIGA.events.eventtab2[i].data); 
						else
							AMIGA.events.eventtab2[i].handler(AMIGA.events.eventtab2[i].data);

						if (stack.dorecheck || AMIGA.events.eventtab2[i].active) {
							recheck = true;
							stack.dorecheck = false;
						}
					} else {
						var eventtime = AMIGA.events.eventtab2[i].evtime - ct;
						if (eventtime < mintime)
							mintime = eventtime;
					}
				}
			}
		}
		if (mintime != CYCLE_MAX) {
			AMIGA.events.eventtab[EV_MISC].active = true;
			AMIGA.events.eventtab[EV_MISC].oldcycles = ct;
			AMIGA.events.eventtab[EV_MISC].evtime = ct + mintime;
			AMIGA.events.schedule();
		}
		stack.recursive--;
	}	

	this.event2_newevent_xx = function(no, t, data, func) {
		var et = this.currcycle + t;
		if (no < 0) {
			no = nextEvent2;
			for (;;) {
				if (!this.eventtab2[no].active)
					break;
				//if (this.eventtab2[no].evtime == et && this.eventtab2[no].handler == func && this.eventtab2[no].data == data)
				if (this.eventtab2[no].evtime == et && this.eventtab2[no].data == data)
					break;

				no++;				
				if (no == EV2_MAX)
					no = EV2_MISC;
				if (no == nextEvent2) {
					BUG.info('event2_newevent_xx() out of event2\'s!');
					return;
				}				
			}
			nextEvent2 = no;
		}
		this.eventtab2[no].active = true;
		this.eventtab2[no].evtime = et;
		this.eventtab2[no].handler = func;
		this.eventtab2[no].data = data;
		
		var stack = { recursive:0, dorecheck:false };
		this.MISC_handler(stack);
	}
	
	this.event2_newevent_x = function(no, t, data, func) {
		if (t <= 0) {
			if (no == EV2_BLITTER)
				AMIGA.blitter.handler(data); 
			else if (no == EV2_DISK)
				AMIGA.disk.handler(data); 
			else
				func(data);
		} else
			this.event2_newevent_xx(no, t * CYCLE_UNIT, data, func);
	}

	this.event2_newevent2 = function(t, data, func) {
		this.event2_newevent_x(-1, t, data, func);
	}

	this.event2_newevent = function(no, t, data) {
		this.event2_newevent_x(no, t, data, null); //this.eventtab2[no].handler);
	}
    
	this.event2_remevent = function(no) {
		this.eventtab2[no].active = false;
	}	
   
	/*---------------------------------*/

	this.schedule = function() {
		var mintime = CYCLE_MAX;

		for (var i = 0; i < EV_MAX; i++) {
			if (this.eventtab[i].active) {
				var evtime = this.eventtab[i].evtime - this.currcycle;
				if (evtime < mintime) mintime = evtime;
			}
		}
		nextEvent = this.currcycle + mintime;
	}
	
	this.cycle = function (cycles) { 
		while ((nextEvent - this.currcycle) <= cycles) {
			if (is_syncline) {
				var rpt = new Date().getTime();
				var v = rpt - vsyncmintime;
				var v2 = rpt - is_syncline_end;
				if (v > vsynctimebase || v < -vsynctimebase) v = 0;
				if (v < 0 && v2 < 0) return;
				is_syncline = 0;
			}

			cycles -= nextEvent - this.currcycle;
			this.currcycle = nextEvent;

			for (var i = 0; i < EV_MAX; i++) {
				if (this.eventtab[i].active && this.eventtab[i].evtime == this.currcycle)
					this.eventtab[i].handler(this.eventtab[i].data);
			}
			this.schedule();
		}
		this.currcycle += cycles;
	}
	
	/*---------------------------------*/
	
	this.dmal_emu = function(v) {
		if (!(AMIGA.dmacon & DMAF_DMAEN))
			return;
			
		//BUG.info('Events.dmal_emu() %d', v);
		var hpos = this.hpos();
		if (v >= 6) {
			v -= 6;
			var nr = v >>> 1;
			var pt = AMIGA.audio.getpt(nr, (v & 1) != 0);
			var dat = AMIGA.mem.load16_chip(pt);
			AMIGA.audio.AUDxDAT(nr, dat);
		} else {
			var w = v & 1;
			var pt = AMIGA.disk.getpt();
			if (w) {
				if (AMIGA.disk.fifostatus() <= 0) {
					var dat = AMIGA.mem.load16_chip(pt);
					AMIGA.disk.DSKDAT(dat);
				}
			} else {
				if (AMIGA.disk.fifostatus() >= 0) {
					var dat = AMIGA.disk.DSKDATR();
					AMIGA.mem.store16_chip(pt, dat);
				}
			}
		}
	}

	this.dmal_func = function(v) {
		this.dmal_emu(v);
		this.dmal_handle(0);
	}

	this.dmal_func2 = function(v) {
		while (dmal) {
			if (dmal & 3)
				this.dmal_emu(dmal_hpos + ((dmal & 2) ? 1 : 0));
			dmal_hpos += 2;
			dmal >>>= 2;
		}
	}

	this.dmal_handle = function(hp) {
		if (!dmal)
			return;
		if (AMIGA.config.cpu.exact) {
			while (dmal) {
				if (dmal & 3)
					break;
				hp += 2;
				dmal >>>= 2;
				dmal_hpos += 2;
			}
			this.event2_newevent2(hp, dmal_hpos + ((dmal & 2) ? 1 : 0), function(v) { AMIGA.events.dmal_func(v); });
			dmal &= ~3;
		} else {
			this.event2_newevent2(hp, 13, function(v) { AMIGA.events.dmal_func2(v); });
		}
	}

	this.dmal_hsync = function() {
		if (dmal) BUG.info('Events.dmal_hsync() DMAL error!? %04x', dmal);
		dmal = AMIGA.audio.dmal();
		dmal <<= 6;
		dmal |= AMIGA.disk.dmal();
		if (!dmal)
			return;
		//BUG.info('Events.dmal_hsync() %04x', dmal);
		dmal_hpos = 0;
		this.dmal_handle(7);
	}

	/*---------------------------------*/

	this.fpscounter_reset = function() {
		counter.frames = 0;
		counter.lasttime = new Date().getTime();	
		counter.fps.clr();
		counter.idle.clr();
		counter.idletime = 0;
		counter.bogus = 2;
		this.timeframes = 0;
	}

	this.fpscounter = function(frameok) {
		var now = new Date().getTime();
		var last = now - counter.lasttime;
		counter.lasttime = now;

		if (counter.bogus || last < 0)
			return;

		counter.fps.set(last / 10);
		counter.idle.set(counter.idletime / 10);
		counter.idletime = 0;

		counter.frametime += last;
		counter.frames++;
		this.timeframes++;
		if ((counter.frames & 7) == 0) {
			var idle = 1000 - (counter.idle.average == 0 ? 0 : counter.idle.average * 1000 / vsynctimebase);
			var fps = counter.fps.average == 0 ? 0 : SYNCBASE * 10 / counter.fps.average;
			if (fps > 9999) fps = 9999;
			if (idle < 0) idle = 0;
			if (idle > 100 * 10) idle = 100 * 10;
			if (fps < this.hz * 10) idle *= (this.hz * 10 / fps);
				
			if ((counter.frames & 15) == 0) {
				AMIGA.config.hooks.fps(Math.round(fps * 0.1));
				AMIGA.config.hooks.cpu(Math.round(idle * 0.1));
			}
		}
	}

	var lastskiptime = new Date().getTime();
	this.testFrameSkip = function() {
		var now = new Date().getTime();
		var time = now - lastskiptime;
		lastskiptime = now;
	
		var fps = Math.floor(SYNCBASE / (time * 0.1)) * 0.1;
		if (fps < this.hz) {			
			if (AMIGA.playfield.frame.skip) {
				if (++AMIGA.playfield.frame.skipcount >= MAX_FRAMESKIP_COUNT) {
					if (!AMIGA.playfield.state.ilace || (AMIGA.playfield.state.ilace && this.lof == 1)) {
						AMIGA.playfield.frame.skipcount = 0;
						AMIGA.playfield.frame.skip = false;
						//BUG.info('Events.vSyncPost() force frameskip disable');
					}
				}
			} else {
				if (!AMIGA.playfield.state.ilace || (AMIGA.playfield.state.ilace && this.lof == 0))
					AMIGA.playfield.frame.skip = true;
			}
		} else {
			AMIGA.playfield.frame.skip = false;
			AMIGA.playfield.frame.skipcount = 0;		
		}	
		//AMIGA.playfield.frame.skip = (AMIGA.playfield.frame.count & 1) == 1;
	}
	
	/*---------------------------------*/
	
	/*function getTime() {
		return new Date().getTime(); 
	}*/

	this.sleep = function(ms) {
		//console.log('sleep');		
		var start = new Date().getTime();
		while ((new Date().getTime() - start) < ms);
	}

	this.rpt_vsync = function(adjust) {
		var t = new Date().getTime();
		var v = t - vsyncwaittime + adjust;
		if (v > SYNCBASE || v < -SYNCBASE) {
			vsyncmintime = vsyncmaxtime = vsyncwaittime = t;
			v = 0;
		}
		return v;
	}
		
	this.framewait = function() {
		var curr_time;
		var clockadjust = 0;
		var vstb = vsynctimebase;
		
		is_syncline = 0;
		
		var frameskip_avg = frameskip.set(frameskiptime);
		frameskiptime = 0;
		//BUG.info(frameskip_avg);

		if (AMIGA.config.cpu.speed == SAEV_Config_CPU_Speed_Maximum) {
			curr_time = new Date().getTime();

			var adjust = 0;
			if (curr_time - vsyncwaittime > 0 && curr_time - vsyncwaittime < vstb / 2)
				adjust += curr_time - vsyncwaittime;
			adjust += clockadjust;
			
			var max = Math.floor(vstb * (1.0 - adjust));
			vsyncwaittime = curr_time + vstb - adjust;
			vsyncmintime = curr_time;

			if (max < 0) {
				max = 0;
				vsynctimeperline = 1;
			} else {
				vsynctimeperline = Math.floor(max / (this.maxvpos + 1));
			}
			vsyncmaxtime = curr_time + max;

			//BUG.info("%06d:%06d/%06d", adjust, vsynctimeperline, vstb);
		} else {
			var start = new Date().getTime();
			while (true) {
				var v = this.rpt_vsync(clockadjust);//   / (SYNCBASE / 1000.0);
				if (v >= -4) break;
				this.sleep(2);
			}
			curr_time = start = new Date().getTime();
			while (this.rpt_vsync(clockadjust) < 0);
			counter.idletime += new Date().getTime() - start;
			
			curr_time = new Date().getTime();
			vsyncmintime = curr_time;
			vsyncmaxtime = vsyncwaittime = curr_time + vstb;

			var t = frameskip_avg;
			vsynctimeperline = (vstb - t) / 3;
			if (vsynctimeperline < 0)
				vsynctimeperline = 0;
			else if (vsynctimeperline > vstb / 3)
				vsynctimeperline = vstb / 3;
		}
	}
	
	this.is_last_line = function() {
		return this.vpos + 1 == this.maxvpos + this.lof_store;
	}
	this.framewait2 = function() {
		if (AMIGA.config.cpu.speed == SAEV_Config_CPU_Speed_Maximum) {
			if (this.is_last_line()) {
				vsyncmintime = vsyncmaxtime;
				is_syncline_end = new Date().getTime() + vsynctimebase;
				is_syncline = 1;
			} else {
				vsyncmintime += vsynctimeperline;
				is_syncline = 0;
				if (vsyncmaxtime - vsyncmintime > 0) {
					if (vsyncwaittime - vsyncmintime > 0) {
						var rpt = new Date().getTime();
						if (vsyncmintime - rpt > 0) {
							is_syncline = 1;
							is_syncline_end = rpt + vsynctimeperline;
						}
					}
				}
			}
		} else {
			if (this.is_last_line() && (this.vpos == Math.floor(this.maxvpos * 1 / 3) || this.vpos == Math.floor(this.maxvpos * 2 / 3))) {
				vsyncmintime += vsynctimeperline;
				var rpt = new Date().getTime();
				while (vsyncmintime - (rpt + vsynctimebase / 10) > 0 && vsyncmintime - rpt < vsynctimebase) {
					this.sleep(1);
					rpt = new Date().getTime();
				}
			}
		}
	}	
			         
	/*---------------------------------*/

	this.vSyncPre = function() {
		if (counter.bogus > 0)
			counter.bogus--;

		AMIGA.cia.vSyncPre();		

		if (!vsync_rendered) {
			var start = new Date().getTime();
			if (AMIGA.config.video.enabled) {
				AMIGA.playfield.vSync();
				if (AMIGA.config.video.skip) this.testFrameSkip(); 		 		
			}
			frameskiptime += new Date().getTime() - start;
		}

		this.framewait();
		this.fpscounter();

		vsync_rendered = false;
	}
	
 	this.vSyncPost = function() {	
		AMIGA.disk.vsync();
		
		if (AMIGA.playfield.bplcon0 & 4)
			this.lofStore = this.lofStore ? 0 : 1;
		this.lof = this.lofStore;
								
		//if ((this.beamcon0 & (0x20|0x80)) != (this.new_beamcon0 & (0x20|0x80)) || this.hack_vpos)
		//if ((this.beamcon0 & (0x20|0x80)) != (this.new_beamcon0 & (0x20|0x80)) || (abs (vpos_count - vpos_count_prev)  > 1)) this.initHz();		
		//if (this.lofChanged) this.compute_vsynctime();				
				
		this.lofChanged = false;
	
		AMIGA.copper.COPJMP(1, 1);

		if (!AMIGA.playfield.state.ilace || (AMIGA.playfield.state.ilace && this.lof == 1))
			AMIGA.state = CMD_IDLE;
	}

	this.hSyncPre = function(isvsync) {
		AMIGA.copper.sync_copper_with_cpu(this.maxhpos, 0);

		if (AMIGA.config.video.enabled)
			AMIGA.playfield.hSync();

		AMIGA.disk.hsync();

		if (AMIGA.config.audio.enabled)
			AMIGA.audio.hsync();
		
		//AMIGA.cia.hSyncPre(); //empty
						
		if (AMIGA.config.video.ntsc) {
			this.lol ^= 1;
			this.maxhpos = 227 + this.lol;
		} else {
			this.lol = 0;
			this.maxhpos = 227;
		}
		this.vpos++;
		if (isvsync)
			this.vpos = 0;

		AMIGA.playfield.sprites.clear();

		this.eventtab[EV_HSYNC].oldcycles = this.currcycle;
		this.eventtab[EV_HSYNC].evtime = this.maxhpos * CYCLE_UNIT + this.currcycle;
	}

 	this.hSyncPost = function(isvsync) {
		AMIGA.cia.hSyncPost(1);
		if (isvsync)
			AMIGA.cia.vSyncPost(1);

		AMIGA.custom.last_value = 0xffff;

		//if (!AMIGA.config.blitter.exact && AMIGA.blitter.getState() != BLT_done && AMIGA.dmaen(DMAF_BPLEN))// && diwstate == DIW_waiting_stop) AMIGA.blitter.slowdown();
		
		if (isvsync) {
			this.vpos = 0;
			this.vSyncPost();
		}		
		
		if (AMIGA.config.chipset.agnus == AGNUS_8361) { 
			if (this.vpos == 1)
				AMIGA.send_interrupt(5, 1 * CYCLE_UNIT);
		} else {
			if (this.vpos == 0)
				AMIGA.send_interrupt(5, 1 * CYCLE_UNIT);
		}

		this.dmal_hsync();
	
		AMIGA.copper.reset2();
		//AMIGA.copper.check(2);

		this.framewait2();

		AMIGA.playfield.sprites.cycle(0);
		
		if (this.vpos + 1 == this.maxvpos + this.lof_store && AMIGA.config.cpu.speed == SAEV_Config_CPU_Speed_Maximum && !vsync_rendered) {
			var start = new Date().getTime();
			if (AMIGA.config.video.enabled) {
				AMIGA.playfield.vSync();
				if (AMIGA.config.video.skip) this.testFrameSkip(); 		 		
			}
			frameskiptime += new Date().getTime() - start;
			vsync_rendered = true;
		}		
	}

	this.hSync = function() {
		var cvp = this.vpos + 1;
		var mvp = this.maxvpos + this.lofStore;
		var vsync = cvp == mvp || cvp == mvp + 1;
		
		this.hSyncPre(vsync);
		if (vsync)
			this.vSyncPre();

		this.hSyncPost(vsync);
	}	

	/*---------------------------------*/
	
	this.GETVPOS = function() {
		return ((AMIGA.playfield.bplcon0 & 2) ? this.vpos_previous : this.vpos);
	}
	this.GETHPOS = function() {
		return ((AMIGA.playfield.bplcon0 & 2) ? this.hpos_previous : this.hpos());
	}
	
	this.VPOSR = function() {
		var chipset = 0;

		switch (AMIGA.config.chipset.agnus) {
			case AGNUS_8367:
			case AGNUS_8371:
				chipset = 0;
				break;
			case AGNUS_8361:
			case AGNUS_8370:
				chipset = 10;
				break;
			case AGNUS_8372: {
				if (AMIGA.config.chipset.agnus_rev <= 4)
					chipset = AMIGA.config.video.ntsc ? 30 : 20;
				else
					chipset = AMIGA.config.video.ntsc ? 31 : 21;
				break;
			}
			/*AGA
			case AGNUS_8374: {
				if (AMIGA.config.chipset.agnus_rev <= 2)
					chipset = AMIGA.config.video.ntsc ? 32 : 22;
				else
					chipset = AMIGA.config.video.ntsc ? 33 : 23;
				break;
			}*/
		}   
		var vp = this.GETVPOS();
		var hp = this.GETHPOS();

		if (hp + 3 >= this.maxhpos) {
			vp++;
			if (vp >= this.maxvpos + this.lofStore)
				vp = 0;
		}
		vp = (vp >> 8) & 7;
		vp &= 1;
				         
		//vp = (vp >> 8) & 1;

		var vpos = (this.lofStore << 15) | (chipset << 8) | (this.lol << 7) | vp;

		//BUG.info('Custom.VPOSR() vp %d, hp %d, vpos $%04x', this.vpos, this.hpos(), vpos);
		return vpos;
	}

	this.VPOSW = function (v) {
		//BUG.info('Custom.VPOSW() $%04x', v);

		if (this.lofStore != ((v & 0x8000) ? 1 : 0)) {
			this.lofChanged = true;
			this.lofStore = (v & 0x8000) ? 1 : 0;
		}
		if (AMIGA.config.video.ntsc)
			this.lol = (v & 0x0080) ? 1 : 0;

		if (this.lofChanged)
			return;
			
		this.vpos &= 0x00ff;
		this.vpos |= ((v & 1) << 8);
	}

	this.VHPOSW = function (v) {
		//BUG.info('Custom.VHPOSW() $%04x', v);

		this.vpos &= 0xff00;
		this.vpos |= (v >> 8);
	}

	this.VHPOSR = function() {
		var vp = this.GETVPOS();
		var hp = this.GETHPOS();

		if (hp >= this.maxhpos) {
			//console.log(hp);
			hp -= this.maxhpos;
			vp++;
			if (vp >= this.maxvpos + this.lofStore)
				vp = 0;
		}
		hp += 1;
		if (hp >= this.maxhpos)
			hp -= this.maxhpos;
      
		var vhpos = ((vp & 0xff) << 8) | ((hp >> 1) & 0xff);

		//BUG.info('Custom.VHPOSR() vp %d, hp %d, vhpos $%04x', vp, hp, vhpos);
		return vhpos;
	}	
	
	this.BEAMCON0 = function (v) {
		BUG.info('BEAMCON0() $%04x', v);
	}
}
