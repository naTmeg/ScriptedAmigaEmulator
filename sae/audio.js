/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
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

	function calc(sample_rate, cutoff_freq) {
		if (cutoff_freq >= sample_rate / 2)
			return 1.0;

		var omega = 2 * Math.PI * cutoff_freq / sample_rate;
		omega = Math.tan(omega / 2) * 2;
		return 1 / (1 + 1 / omega);
	}

	this.setup = function (on, sample_rate) {
		this.on = on;
		filter1_a0 = calc(sample_rate, 6200);
		filter2_a0 = calc(sample_rate, 20000);
		filter_a0 = calc(sample_rate, 7000);
		/*console.log(sample_rate);
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
	const SAMPLE_BUFFER_SIZE = 8192;
	this.available = 0;

	var channel = null;

	var last_cycles = 0;
	var next_sample_evtime = 0;
	var scaled_sample_evtime_orig = 0;
	var scaled_sample_evtime = 0;

	var amiga_sample_rate = 0;
	
	var work_to_do = 0;
	var prevcon = -1;
	
	var driver = {
		ctx: null,
		node: null,
		paused:false
	};
	var sampleBuffer = {
		size: 0,
		data: {
			left: null,
			right: null
		},
		pos: 0
	};	
	var resampleBuffer = {
		size: 0,
		data: {
			left: null,
			right: null
		},
		len: 0
	};		
	var queueBuffer = {
		size: 0,
		data: {
			left: null,
			right: null
		},
		usage: 0
	};	
	var outputBuffer = {
		size: 0,
		data: {
			left: null,
			right: null
		},
		len: 0
	};	
	
	this.filter = new Filter();

	/*---------------------------------*/

	//this.init = function()	
	{
		var test;

		try {
			test = new AudioContext();
			if (test && (test.createJavaScriptNode || test.createScriptProcessor))
				this.available |= SAEI_Audio_WebAudio;
			test = null;
		} catch (e) {}

		//console.log(this.available);
	}		

	/*---------------------------------*/
			
	/*this.calc_sample_evtime = function (hz, longframe, linetoggle) {
		var lines = AMIGA.playfield.maxvpos_nom;
		var hpos = AMIGA.playfield.maxhpos_short;
 
		if (Math.abs(hz-50) < 2)
			amiga_sample_rate	= CHIPSET_CLOCK_PAL / 123;
		else
			amiga_sample_rate	= CHIPSET_CLOCK_NTSC / 124;
		
		if (linetoggle) {
			hpos += 0.5;
			lines += 0.5;
		} else {
			if (longframe < 0)
				lines += 0.5;
			else if (longframe > 0)
				lines += 1.0;
		}	
		scaled_sample_evtime_orig = hpos * lines * hz / amiga_sample_rate * CYCLE_UNIT;			
		scaled_sample_evtime = scaled_sample_evtime_orig;
		
		BUG.info('Audio.calc_sample_evtime() hmax %d, vmax %d, hz %f, rate %f | scaled_sample_evtime %f', hpos, lines, hz, amiga_sample_rate, scaled_sample_evtime * CYCLE_UNIT_INV);
	};*/
	
	this.calc_sample_evtime = function (hz, longframe, linetoggle) {
		if (Math.abs(hz - 50.0) <= 1.5) {
			amiga_sample_rate	= CHIPSET_CLOCK_PAL / 123;
			scaled_sample_evtime_orig = 123 * CYCLE_UNIT;	
			BUG.info('Audio.calc_sample_evtime() PAL mode, rate %f, scaled_sample_evtime %f', amiga_sample_rate, scaled_sample_evtime_orig * CYCLE_UNIT_INV);
		} else {
			amiga_sample_rate	= CHIPSET_CLOCK_NTSC / 124;
			scaled_sample_evtime_orig = 124 * CYCLE_UNIT;	
			BUG.info('Audio.calc_sample_evtime() NTSC mode, rate %f, scaled_sample_evtime %f', amiga_sample_rate, scaled_sample_evtime_orig * CYCLE_UNIT_INV);
		}		
		scaled_sample_evtime = scaled_sample_evtime_orig;
		
		this.filter.setup(AMIGA.config.audio.filter, amiga_sample_rate); /* A500 lowpass-filter */		
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
			if (this.available & SAEI_Audio_WebAudio)
				driver.ctx = new AudioContext();
		}
		if (driver.ctx === null) {
			if (confirm('Can\'t initialise WebAudio. Continue without audio-playback?')) {
				AMIGA.config.audio.mode = SAEV_Config_Audio_Mode_Emul;
				return;
			} else
				Fatal(SAEE_Audio_WebAudio_Not_Avail, null);
		}
	
		this.calc_sample_evtime(AMIGA.config.video.ntsc ? 60 : 50, 1, AMIGA.config.video.ntsc);

		sampleBuffer.size = SAMPLE_BUFFER_SIZE * 2;
		sampleBuffer.data.left = new Float32Array(sampleBuffer.size);
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo)
			sampleBuffer.data.right = new Float32Array(sampleBuffer.size);
		
		resampleBuffer.size = SAMPLE_BUFFER_SIZE * 2;
		resampleBuffer.data.left = new Float32Array(resampleBuffer.size);
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo)
			resampleBuffer.data.right = new Float32Array(resampleBuffer.size);
		
		queueBuffer.size = SAMPLE_BUFFER_SIZE * 8;
		queueBuffer.data.left = new Float32Array(queueBuffer.size);
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo)
			queueBuffer.data.right = new Float32Array(queueBuffer.size);
		
		outputBuffer.size = SAMPLE_BUFFER_SIZE;
		outputBuffer.data.left = new Float32Array(outputBuffer.size);
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo)
			outputBuffer.data.right = new Float32Array(outputBuffer.size);
		
		if (this.available & SAEI_Audio_WebAudio) {
			if (driver.ctx.createJavaScriptNode)
				driver.node = driver.ctx.createJavaScriptNode(SAMPLE_BUFFER_SIZE, 1, AMIGA.config.audio.channels);
			else if (driver.ctx.createScriptProcessor)
				driver.node = driver.ctx.createScriptProcessor(SAMPLE_BUFFER_SIZE, 1, AMIGA.config.audio.channels);

			if (driver.node) {
				driver.node.onaudioprocess = audioProcess;
				driver.node.connect(driver.ctx.destination);
			}	
		}
	};

	this.cleanup = function () {
		if (driver.ctx !== null) {
			if (this.available & SAEI_Audio_WebAudio) {
				if (driver.node) {
					driver.node.disconnect(driver.ctx.destination);
					driver.node.onaudioprocess = null;
					driver.node = null;
				}
			}	  
		}
	};
		
	this.pauseResume = function (pause) {
		if (!AMIGA.config.audio.enabled || AMIGA.config.audio.mode == SAEV_Config_Audio_Mode_Emul) return;

		if (driver.ctx !== null) {
			if (this.available & SAEI_Audio_WebAudio) {
				if (driver.node) {
					if (pause && !driver.paused) {
						driver.node.disconnect(driver.ctx.destination);
						driver.node.onaudioprocess = null;
						driver.paused = true;
					} else if (!pause && driver.paused) {
						driver.node.onaudioprocess = audioProcess;
						driver.node.connect(driver.ctx.destination);
						driver.paused = false;
					}
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
		queueBuffer.usage = 0;
		
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
		queueBuffer.usage = 0;		
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
		
		if (sampleBuffer.pos < sampleBuffer.size) {
			if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
				sampleBuffer.data.left[sampleBuffer.pos] = inv32768 * data2;
				sampleBuffer.data.right[sampleBuffer.pos] = inv32768 * data3;
				sampleBuffer.pos++;
			} else
				sampleBuffer.data.left[sampleBuffer.pos++] = inv32768 * ((data2 + data3) * 0.5);
		} //else
			//BUG.info('Audio.sample_handler() audio buffer over-run!');
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

		if (sampleBuffer.pos < sampleBuffer.size) {
			if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
				sampleBuffer.data.left[sampleBuffer.pos] = inv32768 * data2;
				sampleBuffer.data.right[sampleBuffer.pos] = inv32768 * data3;
				sampleBuffer.pos++;
			} else
				sampleBuffer.data.left[sampleBuffer.pos++] = inv32768 * ((data2 + data3) * 0.5);
		} //else
			//BUG.info('Audio.sample_handler_crux() audio buffer over-run!');
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

		if (sampleBuffer.pos < sampleBuffer.size) {
			if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
				sampleBuffer.data.left[sampleBuffer.pos] = inv32768 * data2;
				sampleBuffer.data.right[sampleBuffer.pos] = inv32768 * data3;
				sampleBuffer.pos++;
			} else
				sampleBuffer.data.left[sampleBuffer.pos++] = inv32768 * ((data2 + data3) * 0.5);
		} //else
			//BUG.info('Audio.sample_handler_rh() audio buffer over-run!');
	};
	
	/*---------------------------------*/
	
	function queuePush() {	
		if (queueBuffer.usage + resampleBuffer.len >= queueBuffer.size) 		
			return;
	
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
			for (var i = 0; i < resampleBuffer.len; i++) {
				queueBuffer.data.left[queueBuffer.usage + i] = resampleBuffer.data.left[i];
				queueBuffer.data.right[queueBuffer.usage + i] = resampleBuffer.data.right[i];
			}
		} else {
			for (var i = 0; i < resampleBuffer.len; i++)
				queueBuffer.data.left[queueBuffer.usage + i] = resampleBuffer.data.left[i];
		}
		queueBuffer.usage += resampleBuffer.len;
		if (queueBuffer.usage > SAMPLE_BUFFER_SIZE * 4)
			queueBuffer.usage = 0;			
	}
	
	function queuePop(bytes) {			
		if (queueBuffer.usage - bytes < 0)
			bytes = queueBuffer.usage;
		if (bytes <= 0) {
			outputBuffer.len = 0;
			return;
		}
	
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
			for (var i = 0; i < bytes; i++) {
				outputBuffer.data.left[i] = queueBuffer.data.left[i];
				outputBuffer.data.right[i] = queueBuffer.data.right[i];
			}
		} else {
			for (var i = 0; i < bytes; i++)
				outputBuffer.data.left[i] = queueBuffer.data.left[i];
		}
		outputBuffer.len = bytes;

		queueBuffer.usage -= bytes;
		
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
			for (var i = 0; i < queueBuffer.usage; i++) {
				queueBuffer.data.left[i] = queueBuffer.data.left[bytes + i];
				queueBuffer.data.right[i] = queueBuffer.data.right[bytes + i];
			}			
		} else {			
			for (var i = 0; i < queueBuffer.usage; i++)
				queueBuffer.data.left[i] = queueBuffer.data.left[bytes + i];
		}			
	}
	
	function resample() {
		var step = amiga_sample_rate / driver.ctx.sampleRate;			
		
		resampleBuffer.len = Math.floor(sampleBuffer.pos / step);

		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {		
			for (var i = 0, j = 0.0; i < resampleBuffer.len; i++, j += step) {
				resampleBuffer.data.left[i] = sampleBuffer.data.left[j >> 0];
				resampleBuffer.data.right[i] = sampleBuffer.data.right[j >> 0];
			}			
		} else {
			for (var i = 0, j = 0.0; i < resampleBuffer.len; i++, j += step)
				resampleBuffer.data.left[i] = sampleBuffer.data.left[j >> 0];
		}		
		sampleBuffer.pos = 0;		
	}	
	
	function audioProcess(e) {			
		if (sampleBuffer.pos == 0)
				return;
			
		//var _pos = sampleBuffer.pos;

		resample();

		queuePush();
		queuePop(SAMPLE_BUFFER_SIZE);

		//console.log(_pos, resampleBuffer.len, queueBuffer.usage, outputBuffer.len);
	
		if (outputBuffer.len == 0)
			return;

		var step = outputBuffer.len / SAMPLE_BUFFER_SIZE;	
		
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
			var data1 = e.outputBuffer.getChannelData(0);
			var data2 = e.outputBuffer.getChannelData(1);
		
			for (var i = 0, j = 0.0; i <  SAMPLE_BUFFER_SIZE; i++, j += step) {
				data1[i] = outputBuffer.data.left[j >> 0];
				data2[i] = outputBuffer.data.right[j >> 0];
			}
		} else {
			var data = e.outputBuffer.getChannelData(0);
			
			for (var i = 0, j = 0.0; i < SAMPLE_BUFFER_SIZE; i++, j += step)
				data[i] = outputBuffer.data.left[j >> 0];
		}
	}	
}

