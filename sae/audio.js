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

/*const DEBUG_CHANNEL_MASK = 15
function debugchannel(ch) {
	return ((1 << ch) & DEBUG_CHANNEL_MASK) != 0;
}*/

function Filter() {
	const DENORMAL_OFFSET = 1E-10;

	this.on = false;
	this.led_filter_on = false;

	var filter_state = [
		{ rc1:0,rc2:0,rc3:0,rc4:0,rc5:0 },
		{ rc1:0,rc2:0,rc3:0,rc4:0,rc5:0 },
		{ rc1:0,rc2:0,rc3:0,rc4:0,rc5:0 },
		{ rc1:0,rc2:0,rc3:0,rc4:0,rc5:0 }
	];
	var filter1_a0 = 0;
	var filter2_a0 = 0;
	var filter_a0 = 0;

	function getRate(v) {
		switch (v) {
			case SAEV_Config_Audio_Rate_11025: return 11025;
			case SAEV_Config_Audio_Rate_22050: return 22050;
			case SAEV_Config_Audio_Rate_44100: return 44100;
			case SAEV_Config_Audio_Rate_48000: return 48000;
			default: return 44100;
		}		
	} 

	function calc(sample_rate, cutoff_freq) {
		if (cutoff_freq >= sample_rate / 2)
			return 1.0;

		var omega = 2 * Math.PI * cutoff_freq / sample_rate;
		omega = Math.tan(omega / 2) * 2;
		return 1 / (1 + 1 / omega);
	}

	this.setup = function (on) {
      this.on = on;
      var rate = getRate(AMIGA.config.audio.rate);
      filter1_a0 = calc(rate, 6200);
      filter2_a0 = calc(rate, 20000);
      filter_a0 = calc(rate, 7000);
      /*console.log(rate);
       console.log(filter1_a0);
       console.log(filter2_a0);
       console.log(filter_a0);*/
   };

	this.reset = function () {
      filter_state = [
         { rc1: 0, rc2: 0, rc3: 0, rc4: 0, rc5: 0 },
         { rc1: 0, rc2: 0, rc3: 0, rc4: 0, rc5: 0 },
         { rc1: 0, rc2: 0, rc3: 0, rc4: 0, rc5: 0 },
         { rc1: 0, rc2: 0, rc3: 0, rc4: 0, rc5: 0 }
      ];
   };

	this.filter = function(input, state) {
		//if (!this.on) return input;
		var o, fs = filter_state[state];

		fs.rc1 = filter1_a0 * input  + (1 - filter1_a0) * fs.rc1 + DENORMAL_OFFSET;
		fs.rc2 = filter2_a0 * fs.rc1 + (1 - filter2_a0) * fs.rc2;
		var no = fs.rc2;

		if (this.led_filter_on) {
			fs.rc3 = filter_a0 * no     + (1 - filter_a0) * fs.rc3;
			fs.rc4 = filter_a0 * fs.rc3 + (1 - filter_a0) * fs.rc4;
			fs.rc5 = filter_a0 * fs.rc4 + (1 - filter_a0) * fs.rc5;
			o = Math.floor(fs.rc5);
		} else
			o = Math.floor(no);

		return o > 32767 ? 32767 : (o < -32768 ? -32768 : o);
	}
}

function Channel(num) {
	this.num = num;
	this.enabled = false;
	this.evtime = 0;
	this.dmaenstore = false;
	this.intreq = false;
	this.dr = false;
	this.dsr = false;
	this.pbufldl = false;
	this.dat_written = false;
	this.state = 0;
	this.lc = 0;
	this.pt = 0;
	this.per = 0;
	this.vol = 0;
	this.len = 0;
	this.wlen = 0;
	this.dat = 0;
	this.dat2 = 0;
	this.current_sample = 0;
	this.last_sample = 0;
	this.ptx = 0;
	this.ptx_written = false;
	this.ptx_tofetch = false;
	
	this.reset = function () {
      this.enabled = false;
      this.evtime = CYCLE_MAX;
      this.dmaenstore = false;
      this.intreq = false;
      this.dr = false;
      this.dsr = false;
      this.pbufldl = false;
      this.dat_written = false;
      this.state = 0;
      this.lc = 0;
      this.pt = 0;
      this.per = PERIOD_MAX - 1;
      this.vol = 0;
      this.len = 0;
      this.wlen = 0;
      this.dat = 0;
      this.dat2 = 0;
      this.current_sample = 0;
      this.last_sample = 0;
      this.ptx = 0;
      this.ptx_written = false;
      this.ptx_tofetch = false;
   };
	
	//const audio_channel_mask = 15;
	this.newsample = function (sample) {
      //if (debugchannel(this.num)) BUG.info('Audio.channel[%d].newsample() %02x', nr, sample);
      //if (!(audio_channel_mask & (1 << this.num))) sample = 0;
      if (sample & 0x80) sample -= 0x100;
      this.last_sample = this.current_sample;
      this.current_sample = sample;
   };
	
	this.isirq = function () {
      return (AMIGA.INTREQR() & (0x80 << this.num)) != 0;
   };

	this.setirq = function (which) {
      //if (debugchannel(this.num) && this.wlen > 1) BUG.info('Audio.channel[%d].setirq() %d, %d', this.num, which, this.isirq() ? 1 : 0);
      AMIGA.INTREQ_0(INTF_SETCLR | (0x80 << this.num));
   };

	this.zerostate = function () {
      //if (debugchannel(this.num)) BUG.info('Audio.channel[%d].zerostate()', this.num);
      this.state = 0;
      this.evtime = CYCLE_MAX;
      this.intreq = false;
      this.dmaenstore = false;
   };
	
	this.setdr = function () {
      //if (debugchannel(this.num) && this.dr) BUG.info('Audio.channel[%d].setdr() DR already active (STATE %d)', this.num, this.state);
      this.dr = true;
      if (this.wlen == 1) {
         this.dsr = true;
         //if (debugchannel(this.num) && this.wlen > 1) BUG.info('Audio.channel[%d].setdr() DSR on, pt %08x', this.num, this.pt);
      }
   };

	this.loaddat = function (modper) {
      var audav = (AMIGA.adkcon & (0x01 << this.num)) != 0;
      var audap = (AMIGA.adkcon & (0x10 << this.num)) != 0;
      if (audav || (modper && audap)) {
         if (this.num >= 3)
            return;
         if (modper && audap) {
            if (this.dat == 0)
               AMIGA.audio.channel[this.num + 1].per = PERIOD_MAX;
            else if (this.dat > PERIOD_MIN)
               AMIGA.audio.channel[this.num + 1].per = this.dat * CYCLE_UNIT;
            else
               AMIGA.audio.channel[this.num + 1].per = PERIOD_MIN * CYCLE_UNIT;
         } else if (audav) {
            AMIGA.audio.channel[this.num + 1].vol = this.dat;
            AMIGA.audio.channel[this.num + 1].vol &= 127;
            if (AMIGA.audio.channel[this.num + 1].vol > 64)
               AMIGA.audio.channel[this.num + 1].vol = 64;
         }
      } else {
         //if (debugchannel(this.num)) BUG.info('Audio.channel[%d].loaddat() new %04x, old %04x', this.num, this.dat, this.dat2);
         this.dat2 = this.dat;
      }
   };

	this.loadper = function () {
      this.evtime = this.per;
      if (this.evtime < CYCLE_UNIT)
         BUG.info('Audio.channel[%d].loadper() bug %d', this.num, this.evtime);
   };
	
	this.state_channel = function (perfin) {
      this.state_channel2(perfin);
      this.dat_written = false;
   };

	this.state_channel2 = function(perfin) {
		var chan_ena = ((AMIGA.dmacon & DMAF_DMAEN) && (AMIGA.dmacon & (1 << this.num))) ? true : false;
		var old_dma = this.dmaenstore;
		var audav = (AMIGA.adkcon & (0x01 << this.num)) != 0;
		var audap = (AMIGA.adkcon & (0x10 << this.num)) != 0;
		var napnav = (!audav && !audap) || audav;
		this.dmaenstore = chan_ena;

		if (!AMIGA.config.audio.enabled) {
			this.zerostate();
			return;
		}
		AMIGA.audio.activate();

		if ((this.state == 2 || this.state == 3) && AMIGA.config.cpu.speed == SAEV_Config_CPU_Speed_Maximum && !chan_ena && old_dma) {
			//if (debugchannel(this.num)) BUG.info('Audio.channel[%d].state_channel2() INSTADMAOFF', this.num);
			this.newsample(this.dat2 & 0xff);
			if (napnav)
				this.setirq(91);
			this.zerostate();
			return;
		}

		//if (debugchannel(this.num) && old_dma != chan_ena) BUG.info('Audio.channel[%d].state_channel2() DMA %d, IRQ %d', this.num, chan_ena ? 1 : 0, this.isirq() ? 1 : 0);
		
		switch (this.state) {
			case 0: {
				if (chan_ena) {
					this.evtime = CYCLE_MAX;
					this.state = 1;
					this.dr = true;
					this.wlen = this.len;
					this.ptx_written = false;
					if (this.wlen > 2)
						this.ptx_tofetch = true;
					this.dsr = true;
					//if (debugchannel(this.num)) BUG.info('Audio.channel[%d].state_channel2() 0>1, LEN %d', this.num, this.wlen);
				} else if (this.dat_written && !this.isirq()) {
					this.state = 2;
					this.setirq(0);
					this.loaddat(false);
					if (AMIGA.config.cpu.speed == SAEV_Config_CPU_Speed_Maximum && this.per < 10 * CYCLE_UNIT) {
						this.newsample(this.dat2 & 0xff);
						this.zerostate();
					} else {
						this.pbufldl = true;
						this.state_channel2(false);
					}
				} else {
					this.zerostate();
				}
				break;
			}
			case 1: {
				this.evtime = CYCLE_MAX;
				if (!chan_ena) {
					this.zerostate();
					return;
				}
				if (!this.dat_written)
					return;
				this.setirq(10);
				this.setdr();
				if (this.wlen != 1) {
					//this.wlen = (this.wlen - 1) & 0xffff;
					if ((--this.wlen) < 0) this.wlen = 0xffff;
				}
				this.state = 5;
				break;
			}
			case 5: {
				this.evtime = CYCLE_MAX;
				if (!chan_ena) {
					this.zerostate();
					return;
				}
				if (!this.dat_written)
					return;
				//if (debugchannel(this.num)) BUG.info('Audio.channel[%d].state_channel2() >5, LEN %d', this.num, this.wlen);
				if (this.ptx_written) {
					this.ptx_written = false;
					this.lc = this.ptx;
				}
				this.loaddat(false);
				if (napnav)
					this.setdr();
				this.state = 2;
				this.loadper();
				this.pbufldl = true;
				this.intreq = false;
				this.state_channel2(false);
				break;
			}
			case 2: {
				if (this.pbufldl) {
					this.newsample((this.dat2 >> 8) & 0xff);
					this.loadper();
					this.pbufldl = false;
				}
				if (!perfin)
					return;
				if (audap)
					this.loaddat(true);
				if (chan_ena) {
					if (audap)
						this.setdr();
					if (this.intreq && audap)
						this.setirq(21);
				} else {
					if (audap)
						this.setirq(22);
				}
				this.pbufldl = true;
				this.state = 3;
				this.state_channel2(false);
				break;
			}
			case 3: {
				if (this.pbufldl) {
					this.newsample((this.dat2 >> 0) & 0xff);
					this.loadper();
					this.pbufldl = false;
				}
				if (!perfin)
					return;
				if (chan_ena) {
					this.loaddat(false);
					if (this.intreq && napnav)
						this.setirq(31);
					if (napnav)
						this.setdr();
				} else {
					if (this.isirq()) {
						//if (debugchannel(this.num)) BUG.info('Audio.channel[%d].state_channel2() IDLE', this.num);
						this.zerostate();
						return;
					}
					this.loaddat(false);
					if (napnav)
						this.setirq(32);
				}
				this.intreq = false;
				this.pbufldl = true;
				this.state = 2;
				this.state_channel2(false);
				break;
			}
		}
	}
}

function Audi0() {
	const SAMPLE_BUFFER_SIZE = 8192 >> 0;
	this.available = 0;

	var channel = null;

	var last_cycles = 0;
	var next_sample_evtime = 0;
	var scaled_sample_evtime_orig = 0;
	var scaled_sample_evtime = 0;

	var work_to_do = 0;
	var prevcon = -1;
	
	var driver = {
		ctx: null,
		moz: {
			/*currentWritePosition: 0,
			prebufferSize: 0,
			tail: null,
			tailPosition: null,*/
			interval: null
		},
		def: {
			node: null
		},
		paused:false
	};
	var sampleBuffer = {
		size: 0,
		realSize: 0,
		data:0,
		pos: 0,
		rate: new MAvg(10)
	};	
	var ringBuffer = {
		size: 0,
		data:0,
		usage:0,
		readPos: 0,
		writePos: 0
	};	
	
	this.filter = new Filter();

	/*---------------------------------*/

	//this.init = function()
	{
		var test;		

		try {
			test = new AudioContext();
			if (test && test.createJavaScriptNode)
				this.available |= SAEI_Audio_Default;
			test = null;
		} catch (e) {
			try {
				test = new webkitAudioContext(); 
				if (test && test.createJavaScriptNode)
					this.available |= SAEI_Audio_Webkit;
				test = null;
			} catch (e) {}							
		}		

		try {
			test = new Audio();
			if (test && test.mozSetup)
				this.available |= SAEI_Audio_Mozilla;
			test = null;
		} catch (e) {}				

 		//console.log(this.available);		
	}		

	/*---------------------------------*/

	function getRate(v) {
		switch (v) {
			case SAEV_Config_Audio_Rate_11025: return 11025;
			case SAEV_Config_Audio_Rate_22050: return 22050;
			case SAEV_Config_Audio_Rate_44100: return 44100;
			case SAEV_Config_Audio_Rate_48000: return 48000;
			default: return 44100;
		}		
	} 
			
	this.calc_sample_evtime = function (freq, longframe, linetoggle) {
      var lines = 0.0;
      var hpos;

      if (linetoggle) {
         hpos = AMIGA.playfield.maxhpos_short + 0.5;
         lines += 0.5;
      } else {
         hpos = AMIGA.playfield.maxhpos_short + 0.0;
         if (longframe < 0)
            lines += 0.5;
         else if (longframe > 0)
            lines += 1.0;
      }
      lines += AMIGA.playfield.maxvpos_nom;
      scaled_sample_evtime_orig = Math.floor(hpos * lines * freq * CYCLE_UNIT / getRate(AMIGA.config.audio.rate));
      scaled_sample_evtime = scaled_sample_evtime_orig;
      /*#if 0
       lines -= AMIGA.playfield.maxvpos_nom;
       BUG.info('%d.%d %d.%d %.2f', maxhpos_short, linetoggle ? 5 : 0, maxvpos_nom + (lines == 1.0 ? 1 : 0), lines > 0 && lines < 1 ? 5 : 0, scaled_sample_evtime);
       #endif*/
      BUG.info('Audio.calc_sample_evtime() scaled_sample_evtime %f (%f) | hpos %d, lines %d', scaled_sample_evtime, scaled_sample_evtime * CYCLE_UNIT_INV, hpos, lines);
   };

	this.setup = function () {
      if (channel === null) {
         channel = [];
         for (var i = 0; i < 4; i++)
            channel[i] = new Channel(i);
      }
      if (!AMIGA.config.audio.enabled || AMIGA.config.audio.mode == SAEV_Config_Audio_Mode_Emul)
         return;

      if (driver.ctx === null) {
         if (this.available & SAEI_Audio_Default)
            driver.ctx = new AudioContext();
         else if (this.available & SAEI_Audio_Webkit)
      		driver.ctx = new webkitAudioContext();
         else if (this.available & SAEI_Audio_Mozilla)
            driver.ctx = new Audio();
      }
      if (driver.ctx === null) {
         if (confirm('Can\'t initialise WebAudio. Continue without audio-playback?')) {
            AMIGA.config.audio.mode = SAEV_Config_Audio_Mode_Emul;
            return;
         } else
            Fatal(SAEE_Audio_WebAudio_Not_Avail, null);
      }

      this.filter.setup(AMIGA.config.audio.filter);
      /* A500 lowpass-filter */

      var hz = AMIGA.config.video.ntsc ? 60 : 50;
      this.calc_sample_evtime(hz, 1, AMIGA.config.video.ntsc);

      sampleBuffer.size = SAMPLE_BUFFER_SIZE;
      sampleBuffer.realSize = sampleBuffer.size << 1;
      sampleBuffer.data = new Float32Array(sampleBuffer.realSize << (AMIGA.config.audio.channels - 1));

      ringBuffer.size = sampleBuffer.size + (sampleBuffer.size >> 1);
      ringBuffer.data = new Float32Array(ringBuffer.size << (AMIGA.config.audio.channels - 1));

      if ((this.available & SAEI_Audio_Default) || (this.available & SAEI_Audio_Webkit)) {
         var inputs = BrowserDetect.browser == 'Safari' ? 1 : 0;
         //if (inputs == 1) BUG.info('Audio.setup() Safari fix enabled.');

         driver.def.node = driver.ctx.createJavaScriptNode(sampleBuffer.size, inputs, AMIGA.config.audio.channels);
         driver.def.node.onaudioprocess = defFill;
         driver.def.node.connect(driver.ctx.destination);
         BUG.info('Audio.setup() enabled webkit audio, channels %d, rate %d', AMIGA.config.audio.channels, getRate(AMIGA.config.audio.rate));
      }
      else if (this.available & SAEI_Audio_Mozilla) {
         driver.ctx.mozSetup(AMIGA.config.audio.channels, getRate(AMIGA.config.audio.rate));

         /*driver.moz.currentWritePosition = 0;
          driver.moz.prebufferSize = getRate(AMIGA.config.audio.rate) >> 1; //prebuffer 500ms
          driver.moz.tail = null;*/
         //driver.moz.interval = setInterval(mozHandler, Math.floor(1000 / (getRate(AMIGA.config.audio.rate) / sampleBuffer.size)));
         driver.moz.interval = setInterval(mozHandler, Math.floor(1000 / hz * (sampleBuffer.size / (getRate(AMIGA.config.audio.rate) / hz))));

         BUG.info('Audio.setup() enabled mozilla audio, channels %d, rate %d', AMIGA.config.audio.channels, getRate(AMIGA.config.audio.rate));
      }
   };

	this.cleanup = function () {
      if (driver.ctx !== null) {
         if ((this.available & SAEI_Audio_Default) || (this.available & SAEI_Audio_Webkit)) {
            driver.def.node.disconnect(0);
            driver.def.node = null;
         }
         else if (this.available & SAEI_Audio_Mozilla) {
            clearInterval(driver.moz.interval);
         }
      }
   };
		
	this.pauseResume = function (pause) {
      if (!AMIGA.config.audio.enabled || AMIGA.config.audio.mode == SAEV_Config_Audio_Mode_Emul) return;

      if (driver.ctx !== null) {
         if ((this.available & SAEI_Audio_Default) || (this.available & SAEI_Audio_Webkit)) {
            if (driver.def.node) {
               if (pause && !driver.paused) {
                  driver.def.node.disconnect(0);
                  driver.paused = true;
               } else if (!pause && driver.paused) {
                  driver.def.node.connect(driver.ctx.destination);
                  driver.paused = false;
               }
            }
         }
         else if (this.available & SAEI_Audio_Mozilla) {
            if (pause && !driver.paused) {
               clearInterval(driver.moz.interval);
               driver.paused = true;
            } else if (!pause && driver.paused) {
               driver.moz.interval = setInterval(mozHandler, 100);
               driver.paused = false;
            }
         }
      }
   };

	this.reset = function () {
      for (var i = 0; i < 4; i++)
         channel[i].reset();

      last_cycles = AMIGA.events.currcycle;
      next_sample_evtime = scaled_sample_evtime;
      this.schedule();
      AMIGA.events.schedule();

      work_to_do = 0;
      prevcon = 0;

      sampleBuffer.pos = 0;
      sampleBuffer.rate.clr();

      ringBuffer.usage = 0;
      ringBuffer.readPos = 0;
      ringBuffer.writePos = 0;

      this.filter.reset();
   };
	
	/*---------------------------------*/

	this.event_reset = function () {
      for (var i = 0; i < 4; i++)
         channel[i].zerostate();

      last_cycles = AMIGA.events.currcycle;
      next_sample_evtime = scaled_sample_evtime;
      this.schedule();
      AMIGA.events.schedule();
   };

	this.activate = function () {
      //BUG.info('Audio.activate()');
      var ret = 0;

      if (!work_to_do) {
         this.pauseResume(0);
         ret = 1;
         this.event_reset();
      }
      work_to_do = 4 * AMIGA.playfield.maxvpos_nom * 50;
      return ret;
   };

	this.deactivate = function () {
      //BUG.info('Audio.deactivate()');
      this.pauseResume(1);
      sampleBuffer.pos = 0;
      sampleBuffer.rate.clr();
      this.event_reset();
   };

	this.state_machine = function () {
      this.update();
      for (var i = 0; i < 4; i++)
         channel[i].state_channel(false);

      this.schedule();
      AMIGA.events.schedule();
   };

	this.schedule = function () {
      var best = CYCLE_MAX;

      AMIGA.events.eventtab[EV_AUDIO].active = false;
      AMIGA.events.eventtab[EV_AUDIO].oldcycles = AMIGA.events.currcycle;

      for (var i = 0; i < 4; i++) {
         if (channel[i].evtime != CYCLE_MAX) {
            if (best > channel[i].evtime) {
               best = channel[i].evtime;
               AMIGA.events.eventtab[EV_AUDIO].active = true;
            }
         }
      }
      AMIGA.events.eventtab[EV_AUDIO].evtime = AMIGA.events.currcycle + best;
   };

	this.update = function () {
      if (!AMIGA.config.audio.enabled || !work_to_do) {
         last_cycles = AMIGA.events.currcycle;
         return;
      }

      var n_cycles = AMIGA.events.currcycle - last_cycles;
      while (n_cycles > 0) {
         var best_evtime = n_cycles + 1;
         var i, rounded;

         for (i = 0; i < 4; i++) {
            if (channel[i].evtime != CYCLE_MAX && best_evtime > channel[i].evtime)
               best_evtime = channel[i].evtime;
         }

         rounded = Math.floor(next_sample_evtime);
         if ((next_sample_evtime - rounded) >= 0.5)
            rounded++;

         if (AMIGA.config.audio.mode != SAEV_Config_Audio_Mode_Emul && best_evtime > rounded)
            best_evtime = rounded;

         if (best_evtime > n_cycles)
            best_evtime = n_cycles;

         next_sample_evtime -= best_evtime;

         /*if (AMIGA.config.audio.mode != SAEV_Config_Audio_Mode_Emul) {
          if (sample_prehandler)
          sample_prehandler (best_evtime / CYCLE_UNIT);
          }*/

         for (i = 0; i < 4; i++) {
            if (channel[i].evtime != CYCLE_MAX)
               channel[i].evtime -= best_evtime;
         }
         n_cycles -= best_evtime;

         if (AMIGA.config.audio.mode != SAEV_Config_Audio_Mode_Emul) {
            if (rounded == best_evtime) {
               next_sample_evtime += scaled_sample_evtime;

               this.sample_handler_def();
               //this.sample_handler_crux();
               //this.sample_handler_rh();
            }
         }

         for (i = 0; i < 4; i++) {
            if (channel[i].evtime == 0) {
               channel[i].state_channel(true);
               if (channel[i].evtime == 0) {
                  BUG.info('Audio.update() sound bug in channel %d (evtime == 0)', i);
                  channel[i].evtime = CYCLE_MAX;
               }
            }
         }
      }
      last_cycles = AMIGA.events.currcycle - n_cycles;
   };

	this.update_adkmasks = function () {
      var t = AMIGA.adkcon | (AMIGA.adkcon >> 4);

      channel[0].enabled = ((t >> 0) & 1) == 0;
      channel[1].enabled = ((t >> 1) & 1) == 0;
      channel[2].enabled = ((t >> 2) & 1) == 0;
      channel[3].enabled = ((t >> 3) & 1) == 0;

      if ((prevcon & 0xff) != (AMIGA.adkcon & 0xff)) {
         this.activate();
         prevcon = AMIGA.adkcon;
      }
   };

	this.handler = function () {
      this.update();
      this.schedule();
   };

	this.hsync = function () {
      if (work_to_do > 0) {
         //work_to_do--;
         if (--work_to_do == 0)
            this.deactivate();
      }
      this.update();
   };
	
	this.vsync = function () {
   };
	
	/*---------------------------------*/

	this.AUDxDAT = function (nr, v) {
      //BUG.info('AUD%dDAT %x', nr, v);
      channel[nr].dat = v;
      channel[nr].dat_written = true;
      if (channel[nr].state == 2 || channel[nr].state == 3) {
         var chan_ena = ((AMIGA.dmacon & DMAF_DMAEN) && (AMIGA.dmacon & (1 << nr))) ? true : false;
         if (chan_ena) {
            if (channel[nr].wlen == 1) {
               channel[nr].wlen = channel[nr].len;
               channel[nr].intreq = true;
            } else {
               //channel[nr].wlen = (channel[nr].wlen - 1) & 0xffff;
               if ((--channel[nr].wlen) < 0) channel[nr].wlen = 0xffff;
            }
         }
      } else {
         this.activate();
         this.update();
         channel[nr].state_channel(false);
         this.schedule();
         AMIGA.events.schedule();
      }
      channel[nr].dat_written = false;
   };

	this.AUDxPER = function (nr, v) {
      this.activate();
      this.update();

      var per = v * CYCLE_UNIT;
      if (per == 0)
         per = PERIOD_MAX - 1;

      if (per < PERIOD_MIN * CYCLE_UNIT)
         per = PERIOD_MIN * CYCLE_UNIT;
      if (per < PERIOD_MIN_NONCE * CYCLE_UNIT && channel[nr].dmaenstore)
         per = PERIOD_MIN_NONCE * CYCLE_UNIT;

      if (channel[nr].per == PERIOD_MAX - 1 && per != PERIOD_MAX - 1) {
         channel[nr].evtime = CYCLE_UNIT;
         if (AMIGA.config.audio.enabled) {
            this.schedule();
            AMIGA.events.schedule();
         }
      }
      channel[nr].per = per;
      //if (debugchannel(nr)) BUG.info('AUD%dPER() %x', nr, v);
   };

	this.AUDxLEN = function (nr, v) {
      this.activate();
      this.update();
      channel[nr].len = v;
      //if (debugchannel(nr)) BUG.info('AUD%dLEN() %x', nr, v);
   };

	this.AUDxVOL = function (nr, v) {
      v &= 127;
      if (v > 64) v = 64;
      this.activate();
      this.update();
      channel[nr].vol = v;
      //if (debugchannel(nr)) BUG.info('AUD%dVOL() %x', nr, v);
   };

	this.AUDxLCH = function (nr, v) {
      this.activate();
      this.update();

      if (AMIGA.config.cpu.speed == SAEV_Config_CPU_Speed_Maximum && ((channel[nr].ptx_tofetch && channel[nr].state == 1) || channel[nr].ptx_written)) {
         channel[nr].ptx = channel[nr].lc;
         channel[nr].ptx_written = true;
      } else
         channel[nr].lc = ((channel[nr].lc & 0xffff) | (v << 16)) >>> 0;
   };

	this.AUDxLCL = function (nr, v) {
      this.activate();
      this.update();

      if (AMIGA.config.cpu.speed == SAEV_Config_CPU_Speed_Maximum && ((channel[nr].ptx_tofetch && channel[nr].state == 1) || channel[nr].ptx_written)) {
         channel[nr].ptx = channel[nr].lc;
         channel[nr].ptx_written = true;
      } else
         channel[nr].lc = ((channel[nr].lc & ~0xffff) | (v & 0xfffe)) >>> 0;
   };

	/*---------------------------------*/

	this.getpt = function (nr, reset) {
      var p = channel[nr].pt;
      channel[nr].pt += 2;
      if (reset)
         channel[nr].pt = channel[nr].lc;
      channel[nr].ptx_tofetch = false;
      return p;
   };
	  
	this.dmal = function () {
      var dmal = 0;
      for (var nr = 0; nr < 4; nr++) {
         if (channel[nr].dr)
            dmal |= (1 << (nr * 2));
         if (channel[nr].dsr)
            dmal |= (1 << (nr * 2 + 1));
         channel[nr].dr = channel[nr].dsr = false;
      }
      //if (dmal) BUG.info('Audio.dmal() %d', dmal);
      return dmal;
   };
	
	/*---------------------------------*/
		
	const inv32768 = 1.0 / 32768;		

	this.sample_handler_def = function () {
      var data0 = channel[0].enabled ? (channel[0].current_sample * channel[0].vol) : 0;
      var data1 = channel[1].enabled ? (channel[1].current_sample * channel[1].vol) : 0;
      var data2 = channel[2].enabled ? (channel[2].current_sample * channel[2].vol) : 0;
      var data3 = channel[3].enabled ? (channel[3].current_sample * channel[3].vol) : 0;

      data0 += data3;
      data1 += data2;
      data2 = data0 << 1;
      data3 = data1 << 1;
      if (AMIGA.config.audio.filter) {
         data2 = this.filter.filter(data2, 0);
         data3 = this.filter.filter(data3, 1);
      }

      if (sampleBuffer.pos < sampleBuffer.realSize) {
         if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
            sampleBuffer.data[(sampleBuffer.pos << 1)    ] = inv32768 * data2;
            sampleBuffer.data[(sampleBuffer.pos << 1) + 1] = inv32768 * data3;
            sampleBuffer.pos++;
         } else
            sampleBuffer.data[sampleBuffer.pos++] = inv32768 * ((data2 + data3) * 0.5);
      } else
         BUG.info('Audio.sample_handler() audio buffer over-run!');
   };
	
	this.sample_handler_crux = function () {
      var data0 = channel[0].enabled ? (channel[0].current_sample * channel[0].vol) : 0;
      var data1 = channel[1].enabled ? (channel[1].current_sample * channel[1].vol) : 0;
      var data2 = channel[2].enabled ? (channel[2].current_sample * channel[2].vol) : 0;
      var data3 = channel[3].enabled ? (channel[3].current_sample * channel[3].vol) : 0;

      var data0p = channel[0].enabled ? (channel[0].last_sample * channel[0].vol) : 0;
      var data1p = channel[1].enabled ? (channel[1].last_sample * channel[1].vol) : 0;
      var data2p = channel[2].enabled ? (channel[2].last_sample * channel[2].vol) : 0;
      var data3p = channel[3].enabled ? (channel[3].last_sample * channel[3].vol) : 0;

      {
         const INTERVAL = scaled_sample_evtime * 3;
         var ratio, ratio1;

         ratio1 = channel[0].per - channel[0].evtime;
         ratio = Math.floor((ratio1 << 12) / INTERVAL);
         if (channel[0].evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
            ratio = 4096;
         data0 = (data0 * ratio + data0p * (4096 - ratio)) >> 12;

         ratio1 = channel[1].per - channel[1].evtime;
         ratio = Math.floor((ratio1 << 12) / INTERVAL);
         if (channel[1].evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
            ratio = 4096;
         data1 = (data1 * ratio + data1p * (4096 - ratio)) >> 12;

         ratio1 = channel[2].per - channel[2].evtime;
         ratio = Math.floor((ratio1 << 12) / INTERVAL);
         if (channel[2].evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
            ratio = 4096;
         data2 = (data2 * ratio + data2p * (4096 - ratio)) >> 12;

         ratio1 = channel[3].per - channel[3].evtime;
         ratio = Math.floor((ratio1 << 12) / INTERVAL);
         if (channel[3].evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
            ratio = 4096;
         data3 = (data3 * ratio + data3p * (4096 - ratio)) >> 12;
      }
      data0 += data3;
      data1 += data2;
      data2 = data0 << 1;
      data3 = data1 << 1;
      if (AMIGA.config.audio.filter) {
         data2 = this.filter.filter(data2, 0);
         data3 = this.filter.filter(data3, 1);
      }

      if (sampleBuffer.pos < sampleBuffer.realSize) {
         if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
            sampleBuffer.data[(sampleBuffer.pos << 1)    ] = inv32768 * data2;
            sampleBuffer.data[(sampleBuffer.pos << 1) + 1] = inv32768 * data3;
            sampleBuffer.pos++;
         } else
            sampleBuffer.data[sampleBuffer.pos++] = inv32768 * ((data2 + data3) * 0.5);
      } else
         BUG.info('Audio.sample_handler_crux() audio buffer over-run!');
   };

	this.sample_handler_rh = function () {
      var data0 = channel[0].enabled ? (channel[0].current_sample * channel[0].vol) : 0;
      var data1 = channel[1].enabled ? (channel[1].current_sample * channel[1].vol) : 0;
      var data2 = channel[2].enabled ? (channel[2].current_sample * channel[2].vol) : 0;
      var data3 = channel[3].enabled ? (channel[3].current_sample * channel[3].vol) : 0;
      var data0p = channel[0].enabled ? (channel[0].last_sample * channel[0].vol) : 0;
      var data1p = channel[1].enabled ? (channel[1].last_sample * channel[1].vol) : 0;
      var data2p = channel[2].enabled ? (channel[2].last_sample * channel[2].vol) : 0;
      var data3p = channel[3].enabled ? (channel[3].last_sample * channel[3].vol) : 0;

      {
         var delta, ratio;

         delta = channel[0].per;
         ratio = Math.floor(((channel[0].evtime % delta) << 8) / delta);
         data0 = (data0 * (256 - ratio) + data0p * ratio) >> 8;
         delta = channel[1].per;
         ratio = Math.floor(((channel[1].evtime % delta) << 8) / delta);
         data1 = (data1 * (256 - ratio) + data1p * ratio) >> 8;
         delta = channel[2].per;
         ratio = Math.floor(((channel[2].evtime % delta) << 8) / delta);
         data1 += (data2 * (256 - ratio) + data2p * ratio) >> 8;
         delta = channel[3].per;
         ratio = Math.floor(((channel[3].evtime % delta) << 8) / delta);
         data0 += (data3 * (256 - ratio) + data3p * ratio) >> 8;
      }

      data2 = data0 << 1;
      data3 = data1 << 1;
      if (AMIGA.config.audio.filter) {
         data2 = this.filter.filter(data2, 0);
         data3 = this.filter.filter(data3, 1);
      }

      if (sampleBuffer.pos < sampleBuffer.realSize) {
         if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
            sampleBuffer.data[(sampleBuffer.pos << 1)    ] = inv32768 * data2;
            sampleBuffer.data[(sampleBuffer.pos << 1) + 1] = inv32768 * data3;
            sampleBuffer.pos++;
         } else
            sampleBuffer.data[sampleBuffer.pos++] = inv32768 * ((data2 + data3) * 0.5);
      } else
         BUG.info('Audio.sample_handler_rh() audio buffer over-run!');
   };
	
	/*---------------------------------*/
	
	//var avg = 0, cnt = 0;
		
	function fillRingBuffer() {
		if (sampleBuffer.pos == 0) return false;
		
		/*avg += sampleBuffer.pos;
		if ((++cnt) == 7) {
			var newrate = Math.floor(avg / 7);
			sampleBuffer.rate = Math.floor(sampleBuffer.rate + newrate >> 1);     
			avg = cnt = 0;
		}		
		if (sampleBuffer.rate == 0) {
			sampleBuffer.pos = 0;
			return false;
		}
		var rate	= sampleBuffer.rate;*/	
		var rate = sampleBuffer.rate.set(sampleBuffer.pos);
		var drop = false;
		
		if (ringBuffer.usage + sampleBuffer.pos < ringBuffer.size) {
			for (var i = 0; i < sampleBuffer.pos; i++) {
				var pos = ringBuffer.writePos + i < ringBuffer.size ? ringBuffer.writePos + i : ringBuffer.writePos + i - ringBuffer.size;			
				if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
					ringBuffer.data[(pos << 1)    ] = sampleBuffer.data[(i << 1)    ];
					ringBuffer.data[(pos << 1) + 1] = sampleBuffer.data[(i << 1) + 1];
				} else
					ringBuffer.data[pos] = sampleBuffer.data[i];
			}
			ringBuffer.writePos += sampleBuffer.pos; if (ringBuffer.writePos >= ringBuffer.size) ringBuffer.writePos -= ringBuffer.size;		
			ringBuffer.usage += sampleBuffer.pos;		
		} else {
			//console.log('ringBuffer overflow', ringBuffer.usage, rate, ringBuffer.size - ringBuffer.usage);	

			/* fill rest until full */			
			var rest = ringBuffer.size - ringBuffer.usage;
			for (var i = 0; i < rest; i++) {
				var pos = ringBuffer.writePos + i < ringBuffer.size ? ringBuffer.writePos + i : ringBuffer.writePos + i - ringBuffer.size;			
				if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
					ringBuffer.data[(pos << 1)    ] = sampleBuffer.data[(i << 1)    ];
					ringBuffer.data[(pos << 1) + 1] = sampleBuffer.data[(i << 1) + 1];
				} else
					ringBuffer.data[pos] = sampleBuffer.data[i];
			}
			ringBuffer.writePos += rest; if (ringBuffer.writePos >= ringBuffer.size) ringBuffer.writePos -= ringBuffer.size;		
			ringBuffer.usage += rest;						

			rate = sampleBuffer.size;// + (sampleBuffer.size >> 1);
			drop = true;
		}
		if (ringBuffer.usage - rate < 0) {
			//console.log('ringBuffer underflow', ringBuffer.usage, rate);	
			rate += ringBuffer.usage - rate;
			drop = false;
		}

		var playBuffer = new Float32Array(rate << (AMIGA.config.audio.channels - 1)); 
		if (ringBuffer.usage - rate >= 0) {
			for (var i = 0; i < rate; i++) {
				var pos = ringBuffer.readPos + i < ringBuffer.size ? ringBuffer.readPos + i : ringBuffer.readPos + i - ringBuffer.size;			
				if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
					playBuffer[(i << 1)    ] = ringBuffer.data[(pos << 1)    ];
					playBuffer[(i << 1) + 1] = ringBuffer.data[(pos << 1) + 1];
				} else
					playBuffer[i] = ringBuffer.data[pos];
			}
			ringBuffer.readPos += rate; if (ringBuffer.readPos >= ringBuffer.size) ringBuffer.readPos -= ringBuffer.size;			
			ringBuffer.usage -= rate;	
			
			if (drop) {
				ringBuffer.readPos += ringBuffer.usage; if (ringBuffer.readPos >= ringBuffer.size) ringBuffer.readPos -= ringBuffer.size;			
				ringBuffer.usage = 0;	
			}	
		} 
		//console.log(sampleBuffer.pos, ringBuffer.usage, rate);	
		sampleBuffer.pos = 0;
		return [playBuffer, rate];
	}
	
	function defFill(e) {	
		var rb = fillRingBuffer();
		if (rb === false) return;
		var playBuffer = rb[0];
		var rate = rb[1];
			
		var step = rate /  sampleBuffer.size;						

		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
			var data1 = e.outputBuffer.getChannelData(0);
			var data2 = e.outputBuffer.getChannelData(1);
		
			for (var i = 0, j = 0.0; i <  sampleBuffer.size; i++, j += step) {
				data1[i] = playBuffer[(j >> 0) << 1];
				data2[i] = playBuffer[((j >> 0) << 1) + 1];
			}
		} else {
			var data = e.outputBuffer.getChannelData(0);
			
			for (var i = 0, j = 0.0; i < sampleBuffer.size; i++, j += step)
				data[i] = playBuffer[j >> 0];
		}
	}

	function mozFill(data) {
		var rb = fillRingBuffer();
		if (rb === false) return;
		var playBuffer = rb[0];
		var rate = rb[1];		
		
		var step = rate / sampleBuffer.size;						
		
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
			for (var i = 0, j = 0.0; i < sampleBuffer.size; i++, j += step) {
				data[i*2] = playBuffer[(j >> 0)*2];
				data[i*2+1] = playBuffer[(j >> 0)*2+1];
			}
		} else {
			for (var i = 0, j = 0.0; i < data.length; i++, j += step)
				data[i] = playBuffer[j >> 0];    
		}
	}		

	function mozHandler() {
		var soundData = new Float32Array(sampleBuffer.realSize);
		mozFill(soundData);
		driver.ctx.mozWriteAudio(soundData);
	}
	
	/*function mozHandler_full() {
		var written;
		
		if (driver.moz.tail) {
			written = driver.ctx.mozWriteAudio(driver.moz.tail.subarray(driver.moz.tailPosition));
			driver.moz.currentWritePosition += written;
			driver.moz.tailPosition += written;
			if (driver.moz.tailPosition < driver.moz.tail.length) return;
			driver.moz.tail = null;
		}

		var currentPosition = driver.ctx.mozCurrentSampleOffset();
		var available = currentPosition + driver.moz.prebufferSize - driver.moz.currentWritePosition;
		if (available > 0) {
			var soundData = new Float32Array(available);
			mozFill(soundData);

			written = driver.ctx.mozWriteAudio(soundData);
			if (written < soundData.length) {
				driver.moz.tail = soundData;
				driver.moz.tailPosition = written;
			}
			driver.moz.currentWritePosition += written;
		}
	}*/
}
