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

var SAEV_Audio_vsynctimebase_orig = 0;

/*---------------------------------*/
/* global references */

var SAER_Audio_deactivate = null;

/*---------------------------------*/

function SAEO_Audio() {
	const PAULA_FREQ_PAL = SAEC_Playfield_CLOCK_PAL / 123;
	const PAULA_FREQ_NTSC = SAEC_Playfield_CLOCK_NTSC / 124;

	var driver = {
		context:null,
		processor:null,
		connected:false
	};

	const CACHE_FRAMES_MULT = 16;
	var cache = {
		frames:0,
		buffer:null,
		readoffset:0,
		writeoffset:0,
		wait:false
	};
	const SCALE_FRAMES_MULT = 4;
	var scale = {
		frames:0,
		buffer:null
	};

	const SOUND_SYNC_MULTIPLIER = 1.0;
	var scaled_sample_evtime_orig = 0.0;

	var muted = false;
	var paused = false;
	var have_sound = false;
	var sound_available = false;

	//var avg_correct = 0.0;
   //var cnt_correct = 0.0;

	var used_freq = 0; //OWN

	/*-----------------------------------------------------------------------*/

	this.update_sound = function(clk) {
		if (have_sound) {
			scaled_sample_evtime_orig = clk * SAEC_Events_CYCLE_UNIT * SOUND_SYNC_MULTIPLIER / used_freq;
			scaled_sample_evtime = scaled_sample_evtime_orig;
			SAEF_log("audio.update_sound() freq %f Hz, scaled sample eventtime %f cycles", used_freq, scaled_sample_evtime * SAEC_Events_CYCLE_UNIT_INV);
		}
	}

	/*-----------------------------------------------------------------------*/

	/*const ADJUST_LIMIT = 6;
	const ADJUST_LIMIT2 = 1;

	//->SAEV_Audio_vsynctimebase_orig var vsynctimebase_orig = 0; //int

	function sound_setadjust(v) {
		if (v < -ADJUST_LIMIT) v = -ADJUST_LIMIT;
		else if (v > ADJUST_LIMIT) v = ADJUST_LIMIT;

		vsynctimebase = (SAEV_Audio_vsynctimebase_orig * (1000.0 + v) / 1000.0) >>> 0;
		scaled_sample_evtime = scaled_sample_evtime_orig;
	}

	var tfprev = 0; //fix reset
	function docorrection(s, sndbuf, sync, granulaty) {
		//static int tfprev;

		avg_correct += sync;
		cnt_correct++;

		if (granulaty < 10)
			granulaty = 10;

		if (tfprev != SAEV_Events_timeframes) {
			var avg = avg_correct / cnt_correct;

			var skipmode = sync / 100.0;
			var avgskipmode = avg / (10000.0 / granulaty);

			if ((tfprev % 10) == 0)
				SAEF_log("%+05d S=%.1f AVG=%.1f (IMM=%.1f + AVG=%.1f = %.1f)", sndbuf, sync, avg, skipmode, avgskipmode, skipmode + avgskipmode);

			SAER.gui.data.sndbuf = sndbuf;

			if (skipmode > ADJUST_LIMIT2)
				skipmode = ADJUST_LIMIT2;
			if (skipmode < -ADJUST_LIMIT2)
				skipmode = -ADJUST_LIMIT2;

			sound_setadjust(skipmode + avgskipmode);
			tfprev = SAEV_Events_timeframes;
		}
	}*/

	/*---------------------------------*/

	function cachediff(write, read) {
		var diff = write - read;
		if (diff > cache.frames >> 1)
			diff = cache.frames - write + read;
		else if (diff < -cache.frames >> 1)
			diff = cache.frames - read + write;
		return diff;
	}

	function cachewrite(buffer, frames) {
		var diff = cachediff(cache.writeoffset, cache.readoffset);
		if (diff > cache.frames >> 2) {
			SAEF_warn("audio.cachewrite() full %d", diff + frames);
			return false;
		}

		if (cache.writeoffset + frames > cache.frames) {
			var partsize = cache.frames - cache.writeoffset;
			if (partsize) {
				//SAEF_log("audio.cachewrite() write0 %d %d",  cache.writeoffset, partsize);
				for (var j = 0; j < SAEV_config.audio.channels; j++) {
					//for (var i = 0; i < partsize; i++) cache.buffer[j][cache.writeoffset + i] = buffer[j][i];
					cache.buffer[j].set(buffer[j].subarray(0, partsize), cache.writeoffset);
				}
			}
			if (frames - partsize) {
				//SAEF_log("audio.cachewrite() write1 %d %d",  0, frames - partsize);
				for (var j = 0; j < SAEV_config.audio.channels; j++) {
					//for (var i = 0; i < frames - partsize; i++) cache.buffer[j][i] = buffer[j][partsize + i];
					cache.buffer[j].set(buffer[j].subarray(partsize, partsize + (frames - partsize)));
				}
			}
			cache.writeoffset = frames - partsize;
		} else {
			//SAEF_log("audio.cachewrite() write2 %d %d",  cache.writeoffset, frames);
			for (var j = 0; j < SAEV_config.audio.channels; j++) {
				//for (var i = 0; i < frames; i++) cache.buffer[j][cache.writeoffset + i] = buffer[j][i];
				cache.buffer[j].set(buffer[j].subarray(0, frames), cache.writeoffset);
			}
			cache.writeoffset += frames;
		}
		return true;
	}

	function cacheread(buffer, frames) {
		var diff = cachediff(cache.writeoffset, cache.readoffset + frames);
		if (diff < 0) {
			//SAEF_log("audio.cacheread() clr %d", frames);
			for (var j = 0; j < SAEV_config.audio.channels; j++) {
				//SAEF_memset(buffer[j],0, 0, frames);
				for (var i = 0; i < frames; i++) buffer[j][i] = 0;
			}
			frames -= -diff;
		}
		if (frames > 0) {
			if (cache.readoffset + frames > cache.frames) {
				var partsize = cache.frames - cache.readoffset;
				if (partsize) {
					//SAEF_log("audio.cacheread() read0 %d %d", cache.readoffset, partsize);
					for (var j = 0; j < SAEV_config.audio.channels; j++) {
						//for (var i = 0; i < partsize; i++) buffer[j][i] = cache.buffer[j][cache.readoffset + i];
						buffer[j].set(cache.buffer[j].subarray(cache.readoffset, cache.readoffset + partsize));
					}
				}
				if (frames - partsize) {
					//SAEF_log("audio.cacheread() read1 %d %d", 0, frames - partsize);
					for (var j = 0; j < SAEV_config.audio.channels; j++) {
						//for (var i = 0; i < frames - partsize; i++) buffer[j][partsize + i] = cache.buffer[j][i];
						buffer[j].set(cache.buffer[j].subarray(0, frames - partsize), partsize);
					}
				}
				cache.readoffset = frames - partsize;
			} else {
				//SAEF_log("audio.cacheread() read2 %d %d", cache.readoffset, frames);
				for (var j = 0; j < SAEV_config.audio.channels; j++) {
					//for (var i = 0; i < frames; i++) buffer[j][i] = cache.buffer[j][cache.readoffset + i];
					buffer[j].set(cache.buffer[j].subarray(cache.readoffset, cache.readoffset + frames));
				}
				cache.readoffset += frames;
			}
			return true;
		} else if (frames < 0)
			SAEF_warn("audio.cacheread() empty %d", frames);

		return false;
	}

	/*---------------------------------*/

	const INV32768 = 1.0 / 32768; /* mul is always faster than div */

	function scaleplay(e, buffer, frames) {
		var chn = SAEV_config.audio.channels;
		var z = e.outputBuffer.length;
		if (muted) {
			for (var ch = 0; ch < chn; ch++) {
				var data = e.outputBuffer.getChannelData(ch);
				for (var i = 0; i < z; i++)
					data[i] = 0.0;
			}
			return;
		}
		/*if (driver.context.sampleRate != used_freq) {} else*/
		{
			var step = frames / z;

			for (var ch = 0; ch < chn; ch++) {
				var data = e.outputBuffer.getChannelData(ch);
				var tbuf = buffer[ch];
				for (var i = 0, j = 0.0; i < z; i++, j += step)
					data[i] = tbuf[j >>> 0] * INV32768;
			}
		}
	}

	function process_sound_buffer_webaudio(e) {
		if (paused || cache.wait || paula.currrent == 0)
			var scale_frames = paula.frames;
		else
			var scale_frames = paula.average.set(paula.currrent);

		//SAEF_log("audio.process_sound_buffer_webaudio() %d %d", paula.currrent, scale_frames);
		paula.currrent = 0;

		cacheread(scale.buffer, scale_frames);
		scaleplay(e, scale.buffer, scale_frames);
	}

	function finish_sound_buffer_webaudio(buffer, frames) {
		if (!paused && have_sound) {
			cachewrite(buffer, frames);
			cache.wait = false;
		}
	}

	/*-----------------------------------------------------------------------*/

	function pause_sound() {
		//SAER.gui.data.sndbuf_status = 0;
		//SAER.gui.data.sndbuf = 0;
		if (!paused && have_sound) {
			SAEF_log("audio.pause_sound()");

			paused = true;
			//disconnect_sound();
			//driver.context.suspend().then(function() { SAEF_log("audio.pause_sound() ...done"); });
		}
	}

	function resume_sound() {
		if (paused && have_sound) {
			SAEF_log("audio.resume_sound()");

			//connect_sound();
			//driver.context.resume().then(function() { SAEF_log("audio.resume_sound() ...done"); });
			paused = false;
			cache.wait = true;
		}
	}

	/*-----------------------------------------------------------------------*/

	function connect_sound() {
		if (!driver.connected) {
			driver.processor.onaudioprocess = process_sound_buffer_webaudio;
			driver.processor.connect(driver.context.destination);
			driver.connected = true;
		}
	}

	function disconnect_sound() {
		if (driver.connected) {
			driver.processor.disconnect(driver.context.destination);
			driver.processor.onaudioprocess = function(e) {};
			driver.connected = false;
		}
	}

	function open_sound() {
		driver.context = null;
		try {
			var AudioContextDriver = window.webkitAudioContext || window.AudioContext;
			driver.context = new AudioContextDriver();
			driver.processor = driver.context.createScriptProcessor(paula.frames, SAEV_config.audio.channels, SAEV_config.audio.channels);
		} catch (e) {
			if (driver.context) driver.context.close().then(function() {});
			return false;
		}

		if (SAEV_config.audio.freq == SAEC_Config_Audio_Freq_Auto)
			used_freq = driver.context.sampleRate;
		else
			used_freq = SAEV_config.audio.freq;

		if (cache.buffer === null) {
			cache.frames = paula.frames * CACHE_FRAMES_MULT;
			cache.buffer = new Array(2);
			for (var j = 0; j < cache.buffer.length; j++)
				cache.buffer[j] = new Int16Array(cache.frames);
		}
		if (scale.buffer === null) {
			scale.frames = paula.frames * SCALE_FRAMES_MULT;
			scale.buffer = new Array(2);
			for (var j = 0; j < scale.buffer.length; j++)
				scale.buffer[j] = new Int16Array(scale.frames);
		}

		connect_sound();
		have_sound = true;

		SAEF_info("sae.audio() %d channels, frequency %d/%d Hz, %d frames", SAEV_config.audio.channels, used_freq, driver.context.sampleRate, paula.frames);
		return true;
	}

	function close_sound() {
		//SAER.gui.data.sndbuf_status = 3;
		//SAER.gui.data.sndbuf = 0;
		if (have_sound) {
			SAEF_log("audio.close_sound() initialised...");

			disconnect_sound();
			if (driver.context.close) {
				driver.context.close().then(function() {
					driver.context = null;
					SAEF_log("audio.close_sound() ...done");
				});
			}
			paused = false;
			have_sound = false;
		}
	}

	/*-----------------------------------------------------------------------*/

	function obtain_sound() { //setup_sound()
		if (SAEV_config.audio.mode >= SAEC_Config_Audio_Mode_On) {
			if (SAEC_info.audio.webAudio)
				sound_available = true;
			else {
				/*if (confirm("'WebAudio' is not supported by this browser.\n\nContinue without audio-playback?"))
					SAEV_config.audio.mode = SAEC_Config_Audio_Mode_Off_Emul;
				else*/
				return SAEE_Audio_RequiresWebAudio;
			}
		}
		return SAEE_None;
	}

	function setup_sound() { //init_sound()
		muted = paused = false;
		//SAER.gui.data.sndbuf_status = 3;
		//SAER.gui.data.sndbuf = 0;
		if (!have_sound)
			return open_sound();

		return true;
	}

	function cleanup_sound() { //OWN
		close_sound();
	}

	function reset_sound() { //reset_sound()
		cache.readoffset = 0;
		cache.writeoffset = 0;
		cache.wait = true;

		paula.average.clr();
	}

	function mute_sound(mute) { //OWN
		muted = mute;
	}

	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/

	const MAX_EV = SAEC_Events_CYCLE_MAX;

	const PERIOD_MIN = 4;
	const PERIOD_MIN_NONCE = 60;
	const PERIOD_MAX = SAEC_Events_CYCLE_MAX;

	const AUDIO_CHANNELS_PAULA = 4;
	const AUDIO_CHANNELS_MAX = 4; //8

	const SOUND_MAX_DELAY_BUFFER = 1024;
	const MIXED_STEREO_MAX = 16;
	const MIXED_STEREO_SCALE = 32;

	function audio_channel_data() {
		this.enabled = false;
		//this.adk_mask = 0; //uint
		this.evtime = 0; //uint
		this.dmaenstore = false;
		this.intreq2 = false;
		this.dr = false;
		this.dsr = false;
		this.pbufldl = false;
		this.drhpos = 0;
		this.dat_written = false;
		this.lc = 0; this.pt = 0; //uaecptr
		this.current_sample = 0;
		this.last_sample = 0;
		this.state = 0;
		this.per = 0;
		this.vol = 0;
		this.len = 0;
		this.wlen = 0;
		this.dat = 0; this.dat2 = 0; //u16
		//Anti
		this.sample_accum = 0;
		this.sample_accum_time = 0;
		//too fast cpu fixes
		this.ptx = 0; //uaecptr
		this.ptx_written = false;
		this.ptx_tofetch = false;
		this.dmaofftime_active = false;

		this.clr = function() {
			this.enabled = false;
			//this.adk_mask = 0
			this.evtime = 0;
			this.dmaenstore = false;
			this.intreq2 = false;
			this.dr = false;
			this.dsr = false;
			this.pbufldl = false;
			this.drhpos = 0;
			this.dat_written = false;
			this.lc = this.pt = 0;
			this.current_sample = 0;
			this.last_sample = 0;
			this.state = 0;
			this.per = 0;
			this.vol = 0;
			this.len = 0;
			this.wlen = 0;
			this.dat = this.dat2 = 0;
			//Anti
			this.sample_accum = 0;
			this.sample_accum_time = 0;
			//too fast cpu fixes
			this.ptx = 0;
			this.ptx_written = false;
			this.ptx_tofetch = false;
			this.dmaofftime_active = false;
		};
	}
	var audio_channel = new Array(AUDIO_CHANNELS_MAX);
	for (var vi = 0; vi < AUDIO_CHANNELS_MAX; vi++)
		audio_channel[vi] = new audio_channel_data();

	var audio_channel_mask = 15; //global
	var audio_channel_count = AUDIO_CHANNELS_PAULA;
	var audio_work_to_do = 0;

	var sample_handler = function() {};
	var sample_prehandler = null;

	var sample_evtime = 0.0; //global
	var scaled_sample_evtime = 0.0;

	var last_cycles = 0;
	var next_sample_evtime = 0.0;

	//var paula_buffer = null; //u16 *
	//var paula_pointer = null; //u16 *
	//var paula_size = 0;
	var paula = { //OWN
		frames: 0,
		buffer: null,
		pointer: 0,
		currrent: 0,
		average: new SAEO_MAvg(10)
	};

	var datas = new Int16Array(AUDIO_CHANNELS_PAULA);

	var right_word_saved = new Int16Array(SOUND_MAX_DELAY_BUFFER); //u32 [SOUND_MAX_DELAY_BUFFER]
	var left_word_saved = new Int16Array(SOUND_MAX_DELAY_BUFFER);
	var saved_ptr = 0;
	var mixed_on = 0, mixed_stereo_size = 0, mixed_mul1 = 0, mixed_mul2 = 0;

	var usehacks = false;

	/*-----------------------------------------------------------------------*/

	var led_filter_forced = 0, sound_use_filter = 0, led_filter_on = 0;

	/* denormals are very small floating point numbers that force FPUs into slow
	mode. All lowpass filters using floats are suspectible to denormals unless
	a small offset is added to avoid very small floating point numbers. */
	const DENORMAL_OFFSET = 1E-10;

	function filter_state() {
		this.rc1 = 0.0;
		this.rc2 = 0.0;
		this.rc3 = 0.0;
		this.rc4 = 0.0;
		this.rc5 = 0.0;

		this.clr = function() {
			this.rc1 = 0.0;
			this.rc2 = 0.0;
			this.rc3 = 0.0;
			this.rc4 = 0.0;
			this.rc5 = 0.0;
		}
	}
	var sound_filter_state = new Array(AUDIO_CHANNELS_PAULA);
	for (var vi = 0; vi < AUDIO_CHANNELS_PAULA; vi++)
		sound_filter_state[vi] = new filter_state();

	var a500e_filter1_a0 = 0.0;
	var a500e_filter2_a0 = 0.0;
	var filter_a0 = 0.0; /* a500 and a1200 use the same */

	const FILTER_NONE = 0;
	const FILTER_MODEL_A500 = 1;
	const FILTER_MODEL_A1200 = 2;

	/* Amiga has two separate filtering circuits per channel, a static RC filter
	* on A500 and the LED filter. This code emulates both.
	*
	* The Amiga filtering circuitry depends on Amiga model. Older Amigas seem
	* to have a 6 dB/oct RC filter with cutoff frequency such that the -6 dB
	* point for filter is reached at 6 kHz, while newer Amigas have no filtering.
	*
	* The LED filter is complicated, and we are modelling it with a pair of
	* RC filters, the other providing a highboost. The LED starts to cut
	* into signal somewhere around 5-6 kHz, and there"s some kind of highboost
	* in effect above 12 kHz. Better measurements are required.
	*
	* The current filtering should be accurate to 2 dB with the filter on,
	* and to 1 dB with the filter off. */

	function filter(input, fs) {
		var normal_output, led_output, output;

		//input = (uae_s16)input; //ORG
		//if (input & 0x8000) input -= 0x10000; //OWN

		switch (sound_use_filter) {
			case FILTER_MODEL_A500: {
				fs.rc1 = a500e_filter1_a0 * input  + (1 - a500e_filter1_a0) * fs.rc1 + DENORMAL_OFFSET;
				fs.rc2 = a500e_filter2_a0 * fs.rc1 + (1 - a500e_filter2_a0) * fs.rc2;
				normal_output = fs.rc2;

				fs.rc3 = filter_a0 * normal_output + (1 - filter_a0) * fs.rc3;
				fs.rc4 = filter_a0 * fs.rc3        + (1 - filter_a0) * fs.rc4;
				fs.rc5 = filter_a0 * fs.rc4        + (1 - filter_a0) * fs.rc5;

				led_output = fs.rc5;
				break;
			}
			case FILTER_MODEL_A1200: {
				normal_output = input;

				fs.rc2 = filter_a0 * normal_output + (1 - filter_a0) * fs.rc2 + DENORMAL_OFFSET;
				fs.rc3 = filter_a0 * fs.rc2        + (1 - filter_a0) * fs.rc3;
				fs.rc4 = filter_a0 * fs.rc3        + (1 - filter_a0) * fs.rc4;

				led_output = fs.rc4;
				break;
			}
			case FILTER_NONE:
			default:
				return input;
		}

		if (led_filter_on)
			output = ~~led_output;
		else
			output = ~~normal_output;

		if (output > 32767)
			output = 32767;
		else if (output < -32768)
			output = -32768;

		return output;
		//return output < 0 ? output + 0x10000 : output; //OWN
	}

	this.led_filter_audio = function() {
		led_filter_on = 0;
		if (led_filter_forced > 0 || (SAER.gui.data.powerled && led_filter_forced >= 0))
			led_filter_on = 1;
	}

	/*-----------------------------------------------------------------------*/

	function clear_sound_buffers() {
		//if (!have_sound) return;

		//memset(paula_sndbuffer, 0, paula_size);
		for (var i = 0; i < paula.buffer.length; i++)
			SAEF_memset(paula.buffer[i],0, 0, paula.frames);

		//paula_pointer = paula_buffer;
		paula.pointer = 0;
		paula.currrent = 0;
	}

	function finish_sound_buffer() {
		//paula_pointer = paula_buffer;
		paula.pointer = 0;

		//if (currprefs.turbo_emulation) return;
		//if (!have_sound) return;

		//if (SAER.gui.data.sndbuf_status == 3)
		//	SAER.gui.data.sndbuf_status = 0;

		//if (!paused)
		finish_sound_buffer_webaudio(paula.buffer, paula.frames);
	}

	function check_sound_buffers() {
		//if ((uae_u8*)paula_pointer - (uae_u8*)paula_buffer >= paula_size)
		if (paula.pointer >= paula.frames)
			finish_sound_buffer();
	}

	/*-----------------------------------------------------------------------*/

	//#define PUT_SOUND_WORD(b) do { *(uae_u16 *)paula_pointer = b; paula_pointer = (uae_u16 *)(((uae_u8 *)paula_pointer) + 2); } while (0)
	//#define PUT_SOUND_WORD_MONO(b) PUT_SOUND_WORD(b)

	/* Always put the right word before the left word.  */
	function put_sound_word_right(w) { //u32
		if (mixed_on)
			right_word_saved[saved_ptr] = w;
		else
			//PUT_SOUND_WORD(w);
			paula.buffer[1][paula.pointer] = w;
	}

	function put_sound_word_left(w) {
		if (mixed_on) {
			left_word_saved[saved_ptr] = w;

			var lnew = w;
			var rnew = right_word_saved[saved_ptr];

			saved_ptr = (saved_ptr + 1) & mixed_stereo_size;

			var lold = left_word_saved[saved_ptr];
			var tmp = ~~((rnew * mixed_mul2 + lold * mixed_mul1) / MIXED_STEREO_SCALE);

			var rold = right_word_saved[saved_ptr];
			w = ~~((lnew * mixed_mul2 + rold * mixed_mul1) / MIXED_STEREO_SCALE);

			//PUT_SOUND_WORD(w);
			//PUT_SOUND_WORD(tmp);
			paula.buffer[1][paula.pointer] = w;
			paula.buffer[0][paula.pointer] = tmp;
		} else
			//PUT_SOUND_WORD(w);
			paula.buffer[0][paula.pointer] = w;
	}

	/*---------------------------------*/

	function anti_prehandler(best_evtime) {
		for (var i = 0; i < audio_channel_count; i++) {
			var acd = audio_channel[i];
			//var output = (acd.current_sample * acd.vol) & acd.adk_mask;
			var output = acd.enabled ? acd.current_sample * acd.vol: 0;
			acd.sample_accum += output * best_evtime;
			acd.sample_accum_time += best_evtime;
		}
	}

	function samplexx_anti_handler(datasp, ch_start, ch_num) {
		for (var i = ch_start, j = 0; j < ch_num; i++, j++) {
			datasp[j] = audio_channel[i].sample_accum_time ? Math.floor(audio_channel[i].sample_accum / audio_channel[i].sample_accum_time) : 0;
			audio_channel[i].sample_accum = 0;
			audio_channel[i].sample_accum_time = 0;
		}
	}

	/*---------------------------------*/
	/* Mono */

	function sample16_mono_handler() {
		var data0 = audio_channel[0].enabled ? audio_channel[0].current_sample * audio_channel[0].vol : 0;
		var data1 = audio_channel[1].enabled ? audio_channel[1].current_sample * audio_channel[1].vol : 0;
		var data2 = audio_channel[2].enabled ? audio_channel[2].current_sample * audio_channel[2].vol : 0;
		var data3 = audio_channel[3].enabled ? audio_channel[3].current_sample * audio_channel[3].vol : 0;

		data0 += data1;
		data0 += data2;
		data0 += data3;

		var data = data0;
		if (SAEV_config.audio.filter) data = filter(data, sound_filter_state[0]);

		//PUT_SOUND_WORD_MONO(data);
		paula.buffer[0][paula.pointer++] = data;
		paula.currrent++;
		check_sound_buffers();
	}

	function sample16i_anti_mono_handler() {
		samplexx_anti_handler(datas, 0, AUDIO_CHANNELS_PAULA);
		var data1 = datas[0] + datas[3] + datas[1] + datas[2];

		if (SAEV_config.audio.filter) data1 = filter(data1, sound_filter_state[0]);

		//PUT_SOUND_WORD_MONO(data1);
		paula.buffer[0][paula.pointer++] = data1;
		paula.currrent++;
		check_sound_buffers();
	}

	function sample16i_rh_mono_handler() {
		var data0, data1, data2, data3, data0p, data1p, data2p, data3p;
		var delta, ratio; //ulong
		if (audio_channel[0].enabled) {
			data0 = audio_channel[0].current_sample * audio_channel[0].vol;
			data0p = audio_channel[0].last_sample * audio_channel[0].vol;
		} else data0 = data0p = 0;
		if (audio_channel[1].enabled) {
			data1 = audio_channel[1].current_sample * audio_channel[1].vol;
			data1p = audio_channel[1].last_sample * audio_channel[1].vol;
		} else data1 = data1p = 0;
		if (audio_channel[2].enabled) {
			data2 = audio_channel[2].current_sample * audio_channel[2].vol;
			data2p = audio_channel[2].last_sample * audio_channel[2].vol;
		} else data2 = data2p = 0;
		if (audio_channel[3].enabled) {
			data3 = audio_channel[3].current_sample * audio_channel[3].vol;
			data3p = audio_channel[3].last_sample * audio_channel[3].vol;
		} else data3 = data3p = 0;

		delta = audio_channel[0].per;
		ratio = ~~(((audio_channel[0].evtime % delta) << 8) / delta);
		data0 = (data0 * (256 - ratio) + data0p * ratio) >> 8;
		delta = audio_channel[1].per;
		ratio = ~~(((audio_channel[1].evtime % delta) << 8) / delta);
		data0 += (data1 * (256 - ratio) + data1p * ratio) >> 8;
		delta = audio_channel[2].per;
		ratio = ~~(((audio_channel[2].evtime % delta) << 8) / delta);
		data0 += (data2 * (256 - ratio) + data2p * ratio) >> 8;
		delta = audio_channel[3].per;
		ratio = ~~(((audio_channel[3].evtime % delta) << 8) / delta);
		data0 += (data3 * (256 - ratio) + data3p * ratio) >> 8;

		var data = data0;

		if (SAEV_config.audio.filter) data = filter(data, sound_filter_state[0]);

		//PUT_SOUND_WORD_MONO(data);
		paula.buffer[0][paula.pointer++] = data;
		paula.currrent++;
		check_sound_buffers();
	}

	function sample16i_crux_mono_handler() {
		var data0, data1, data2, data3, data0p, data1p, data2p, data3p;
		if (audio_channel[0].enabled) {
			data0 = audio_channel[0].current_sample * audio_channel[0].vol;
			data0p = audio_channel[0].last_sample * audio_channel[0].vol;
		} else data0 = data0p = 0;
		if (audio_channel[1].enabled) {
			data1 = audio_channel[1].current_sample * audio_channel[1].vol;
			data1p = audio_channel[1].last_sample * audio_channel[1].vol;
		} else data1 = data1p = 0;
		if (audio_channel[2].enabled) {
			data2 = audio_channel[2].current_sample * audio_channel[2].vol;
			data2p = audio_channel[2].last_sample * audio_channel[2].vol;
		} else data2 = data2p = 0;
		if (audio_channel[3].enabled) {
			data3 = audio_channel[3].current_sample * audio_channel[3].vol;
			data3p = audio_channel[3].last_sample * audio_channel[3].vol;
		} else data3 = data3p = 0;

		{
			var cdp, ratio, ratio1;
			var INTERVAL = scaled_sample_evtime * 3;

			cdp = audio_channel[0];
			ratio1 = cdp.per - cdp.evtime;
			ratio = ~~((ratio1 << 12) / INTERVAL);
			if (cdp.evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
				ratio = 4096;
			data0 = (data0 * ratio + data0p * (4096 - ratio)) >> 12;

			cdp = audio_channel[1];
			ratio1 = cdp.per - cdp.evtime;
			ratio = ~~((ratio1 << 12) / INTERVAL);
			if (cdp.evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
				ratio = 4096;
			data1 = (data1 * ratio + data1p * (4096 - ratio)) >> 12;

			cdp = audio_channel[2];
			ratio1 = cdp.per - cdp.evtime;
			ratio = ~~((ratio1 << 12) / INTERVAL);
			if (cdp.evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
				ratio = 4096;
			data2 = (data2 * ratio + data2p * (4096 - ratio)) >> 12;

			cdp = audio_channel[3];
			ratio1 = cdp.per - cdp.evtime;
			ratio = ~~((ratio1 << 12) / INTERVAL);
			if (cdp.evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
				ratio = 4096;
			data3 = (data3 * ratio + data3p * (4096 - ratio)) >> 12;
		}
		data1 += data2;
		data0 += data3;
		data0 += data1;
		var data = data0;

		if (SAEV_config.audio.filter) data = filter(data, sound_filter_state[0]);

		//PUT_SOUND_WORD_MONO (data);
		paula.buffer[0][paula.pointer++] = data;
		paula.currrent++;
		check_sound_buffers();
	}

	/*---------------------------------*/
	/* Stereo */

	function sample16s_handler() {
		var data0 = audio_channel[0].enabled ? audio_channel[0].current_sample * audio_channel[0].vol : 0;
		var data1 = audio_channel[1].enabled ? audio_channel[1].current_sample * audio_channel[1].vol : 0;
		var data2 = audio_channel[2].enabled ? audio_channel[2].current_sample * audio_channel[2].vol : 0;
		var data3 = audio_channel[3].enabled ? audio_channel[3].current_sample * audio_channel[3].vol : 0;

		data0 += data3;
		data1 += data2;
		data2 = data0 << 1;
		data3 = data1 << 1;

		if (SAEV_config.audio.filter) {
			data2 = filter(data2, sound_filter_state[0]);
			data3 = filter(data3, sound_filter_state[1]);
		}

		put_sound_word_right(data2);
		put_sound_word_left(data3);
		paula.pointer++;
		paula.currrent++;
		check_sound_buffers();
	}

	function sample16si_anti_handler() {
		samplexx_anti_handler(datas, 0, AUDIO_CHANNELS_PAULA);
		var data1 = datas[0] + datas[3];
		var data2 = datas[1] + datas[2];
		data1 = data1 << 1;
		data2 = data2 << 1;

		if (SAEV_config.audio.filter) {
			data1 = filter(data1, sound_filter_state[0]);
			data2 = filter(data2, sound_filter_state[1]);
		}

		put_sound_word_right(data1);
		put_sound_word_left(data2);
		paula.pointer++;
		paula.currrent++;
		check_sound_buffers();
	}

	function sample16si_rh_handler() {
		var data0, data1, data2, data3, data0p, data1p, data2p, data3p;
		var delta, ratio; //ulong
		if (audio_channel[0].enabled) {
			data0 = audio_channel[0].current_sample * audio_channel[0].vol;
			data0p = audio_channel[0].last_sample * audio_channel[0].vol;
		} else data0 = data0p = 0;
		if (audio_channel[1].enabled) {
			data1 = audio_channel[1].current_sample * audio_channel[1].vol;
			data1p = audio_channel[1].last_sample * audio_channel[1].vol;
		} else data1 = data1p = 0;
		if (audio_channel[2].enabled) {
			data2 = audio_channel[2].current_sample * audio_channel[2].vol;
			data2p = audio_channel[2].last_sample * audio_channel[2].vol;
		} else data2 = data2p = 0;
		if (audio_channel[3].enabled) {
			data3 = audio_channel[3].current_sample * audio_channel[3].vol;
			data3p = audio_channel[3].last_sample * audio_channel[3].vol;
		} else data3 = data3p = 0;

		delta = audio_channel[0].per;
		ratio = ~~(((audio_channel[0].evtime % delta) << 8) / delta);
		data0 = (data0 * (256 - ratio) + data0p * ratio) >> 8;
		delta = audio_channel[1].per;
		ratio = ~~(((audio_channel[1].evtime % delta) << 8) / delta);
		data1 = (data1 * (256 - ratio) + data1p * ratio) >> 8;
		delta = audio_channel[2].per;
		ratio = ~~(((audio_channel[2].evtime % delta) << 8) / delta);
		data1 += (data2 * (256 - ratio) + data2p * ratio) >> 8;
		delta = audio_channel[3].per;
		ratio = ~~(((audio_channel[3].evtime % delta) << 8) / delta);
		data0 += (data3 * (256 - ratio) + data3p * ratio) >> 8;
		data2 = data0;
		data2 = data2 << 1;
		data3 = data1;
		data3 = data3 << 1;

		if (SAEV_config.audio.filter) {
			data2 = filter(data2, sound_filter_state[0]);
			data3 = filter(data3, sound_filter_state[1]);
		}

		put_sound_word_right(data2);
		put_sound_word_left(data3);
		paula.pointer++;
		paula.currrent++;
		check_sound_buffers();
	}

	function sample16si_crux_handler() {
		var data0, data1, data2, data3, data0p, data1p, data2p, data3p;
		if (audio_channel[0].enabled) {
			data0 = audio_channel[0].current_sample * audio_channel[0].vol;
			data0p = audio_channel[0].last_sample * audio_channel[0].vol;
		} else data0 = data0p = 0;
		if (audio_channel[1].enabled) {
			data1 = audio_channel[1].current_sample * audio_channel[1].vol;
			data1p = audio_channel[1].last_sample * audio_channel[1].vol;
		} else data1 = data1p = 0;
		if (audio_channel[2].enabled) {
			data2 = audio_channel[2].current_sample * audio_channel[2].vol;
			data2p = audio_channel[2].last_sample * audio_channel[2].vol;
		} else data2 = data2p = 0;
		if (audio_channel[3].enabled) {
			data3 = audio_channel[3].current_sample * audio_channel[3].vol;
			data3p = audio_channel[3].last_sample * audio_channel[3].vol;
		} else data3 = data3p = 0;

		{
			var cdp, ratio, ratio1;
			var INTERVAL = scaled_sample_evtime * 3;

			cdp = audio_channel[0];
			ratio1 = cdp.per - cdp.evtime;
			ratio = ~~((ratio1 << 12) / INTERVAL);
			if (cdp.evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
				ratio = 4096;
			data0 = (data0 * ratio + data0p * (4096 - ratio)) >> 12;

			cdp = audio_channel[1];
			ratio1 = cdp.per - cdp.evtime;
			ratio = ~~((ratio1 << 12) / INTERVAL);
			if (cdp.evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
				ratio = 4096;
			data1 = (data1 * ratio + data1p * (4096 - ratio)) >> 12;

			cdp = audio_channel[2];
			ratio1 = cdp.per - cdp.evtime;
			ratio = ~~((ratio1 << 12) / INTERVAL);
			if (cdp.evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
				ratio = 4096;
			data2 = (data2 * ratio + data2p * (4096 - ratio)) >> 12;

			cdp = audio_channel[3];
			ratio1 = cdp.per - cdp.evtime;
			ratio = ~~((ratio1 << 12) / INTERVAL);
			if (cdp.evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
				ratio = 4096;
			data3 = (data3 * ratio + data3p * (4096 - ratio)) >> 12;
		}
		data1 += data2;
		data0 += data3;
		data2 = data0;
		data2 = data2 << 1;
		data3 = data1;
		data3 = data3 << 1;

		if (SAEV_config.audio.filter) {
			data2 = filter(data2, sound_filter_state[0]);
			data3 = filter(data3, sound_filter_state[1]);
		}

		put_sound_word_right(data2);
		put_sound_word_left(data3);
		paula.pointer++;
		paula.currrent++;
		check_sound_buffers();
	}

	/*-----------------------------------------------------------------------*/

	function zerostate(nr) {
		var cdp = audio_channel[nr];
		cdp.state = 0;
		cdp.evtime = MAX_EV;
		cdp.intreq2 = 0;
		cdp.dmaenstore = false;
		cdp.dmaofftime_active = false;
	}

	function schedule_audio() {
		var best = MAX_EV;

		SAER_Events_eventtab[SAEC_Events_EV_AUDIO].active = false;
		SAER_Events_eventtab[SAEC_Events_EV_AUDIO].oldcycles = SAEV_Events_currcycle;
		for (var i = 0; i < audio_channel_count; i++) {
			var cdp = audio_channel[i];
			if (cdp.evtime != MAX_EV) {
				if (best > cdp.evtime) {
					best = cdp.evtime;
					SAER_Events_eventtab[SAEC_Events_EV_AUDIO].active = true;
				}
			}
		}
		SAER_Events_eventtab[SAEC_Events_EV_AUDIO].evtime = SAEV_Events_currcycle + best;
	}

	function audio_event_reset() {
		last_cycles = SAEV_Events_currcycle;
		next_sample_evtime = scaled_sample_evtime;

		for (var i = 0; i < AUDIO_CHANNELS_PAULA; i++)
			zerostate(i);

		schedule_audio();
		SAER.events.schedule();
	}

	function audio_deactivate() {
		//SAER.gui.data.sndbuf_status = 3;
		//SAER.gui.data.sndbuf = 0;
		audio_work_to_do = 0;
		//pause_sound_buffer();
		clear_sound_buffers();
		audio_event_reset();
	}
	SAER_Audio_deactivate = audio_deactivate; /* used by cpu.cpu_halt() */

	function audio_activate() {
		var ret = false;

		if (audio_work_to_do == 0) {
			//restart_sound_buffer();
			audio_event_reset();

			cache.wait = true;
			ret = true;
		}
		audio_work_to_do = 4 * SAER.playfield.get_maxvpos_nom() * 50;
		return ret;
	}

	/*-----------------------------------------------------------------------*/
	/* DMAL */

	this.getpt = function(nr, reset) { //audio_getpt()
		var cdp = audio_channel[nr];
		var p = cdp.pt;
		cdp.pt += 2;
		if (reset)
			cdp.pt = cdp.lc;
		cdp.ptx_tofetch = false;
		return p;
	}
	this.dmal = function() { //audio_dmal()
		var dmal = 0;
		for (var nr = 0; nr < AUDIO_CHANNELS_PAULA; nr++) {
			var cdp = audio_channel[nr];
			if (cdp.dr) dmal |= 1 << (nr * 2);
			if (cdp.dsr) dmal |= 1 << (nr * 2 + 1);
			cdp.dr = cdp.dsr = false;
		}
		return dmal;
	}

	/*-----------------------------------------------------------------------*/

	function isirq(nr) {
		//return (SAER.custom.INTREQR() & (0x80 << nr)) != 0;
		return (SAEV_Custom_intreq & (0x80 << nr)) != 0;
	}

	function setirq(nr, which) {
		SAER.custom.INTREQ_0(SAEC_Custom_INTF_SETCLR | (0x80 << nr));
	}

	function newsample(nr, sample) {
		var cdp = audio_channel[nr];
		//if (!(audio_channel_mask & (1 << nr))) sample = 0;
		if (sample & 0x80) sample -= 0x100; //OWN
		cdp.last_sample = cdp.current_sample;
		cdp.current_sample = sample;
	}

	function setdr(nr) {
		var cdp = audio_channel[nr];
		cdp.drhpos = SAER.events.current_hpos();
		cdp.dr = true;
		if (cdp.wlen == 1)
			cdp.dsr = true;
	}

	function loaddat(nr, modper) {
		var cdp = audio_channel[nr];
		var audav = SAEV_Custom_adkcon & (0x01 << nr);
		var audap = SAEV_Custom_adkcon & (0x10 << nr);
		if (audav || (modper && audap)) {
			if (nr >= 3)
				return;
			var cdp1 = audio_channel[nr + 1]; //OWN
			if (modper && audap) {
				if (cdp.dat == 0)
					cdp1.per = 65536 * SAEC_Events_CYCLE_UNIT;
				else if (cdp.dat > PERIOD_MIN)
					cdp1.per = cdp.dat * SAEC_Events_CYCLE_UNIT;
				else
					cdp1.per = PERIOD_MIN * SAEC_Events_CYCLE_UNIT;
			} else if (audav) {
				cdp1.vol = cdp.dat;
				cdp1.vol &= 127;
				if (cdp1.vol > 64)
					cdp1.vol = 64;
			}
		} else
			cdp.dat2 = cdp.dat;
	}

	function loadper(nr) {
		var cdp = audio_channel[nr];

		cdp.evtime = cdp.per;
		if (cdp.evtime < SAEC_Events_CYCLE_UNIT)
			SAEF_error("audio.LOADPER%d bug %d", nr, cdp.evtime);
	}

	function audio_state_channel2(nr, perfin) {
		var cdp = audio_channel[nr];
		var chan_ena = (SAEV_Custom_dmacon & SAEC_Custom_DMAF_DMAEN) != 0 && (SAEV_Custom_dmacon & (1 << nr)) != 0;
		var old_dma = cdp.dmaenstore;
		var audav = SAEV_Custom_adkcon & (0x01 << nr);
		var audap = SAEV_Custom_adkcon & (0x10 << nr);
		var napnav = (!audav && !audap) || audav;
		var hpos = SAER.events.current_hpos();

		cdp.dmaenstore = chan_ena;

		if (SAEV_config.audio.mode == SAEC_Config_Audio_Mode_Off) {
			zerostate(nr);
			return;
		}
		audio_activate();

		if ((cdp.state == 2 || cdp.state == 3) && usehacks) {
			if (!chan_ena && old_dma) {
				// DMA switched off, state=2/3 and "too fast CPU": set flag
				cdp.dmaofftime_active = true;
			}
			if (cdp.dmaofftime_active && !old_dma && chan_ena) {
				// We are still in state=2/3 and program is going to re-enable
				// DMA. Force state to zero to prevent CPU timed DMA wait
				// routines in common tracker players to lose notes.
				newsample(nr, cdp.dat2 & 0xff);
				/*#if 0
				if (napnav) setirq(nr, 91);
				#endif*/
				zerostate (nr);
			}
		}

		switch (cdp.state) {
			case 0: {
				if (chan_ena) {
					cdp.evtime = MAX_EV;
					cdp.state = 1;
					cdp.dr = true;
					cdp.drhpos = hpos;
					cdp.wlen = cdp.len;
					cdp.ptx_written = false;
					/* Some programs first start short empty sample and then later switch to
					 * real sample, we must not enable the hack in this case */
					if (cdp.wlen > 2)
						cdp.ptx_tofetch = true;
					cdp.dsr = true;
				} else if (cdp.dat_written && !isirq(nr)) {
					cdp.state = 2;
					setirq(nr, 0);
					loaddat(nr, false);
					if (usehacks && cdp.per < 10 * SAEC_Events_CYCLE_UNIT) {
						// make sure audio.device AUDxDAT startup returns to idle state before DMA is enabled
						newsample(nr, cdp.dat2 & 0xff);
						zerostate(nr);
					} else {
						cdp.pbufldl = true;
						audio_state_channel2(nr, false);
					}
				} else {
					zerostate(nr);
				}
				break;
			}
			case 1: {
				cdp.evtime = MAX_EV;
				if (!chan_ena) {
					zerostate(nr);
					return;
				}
				if (!cdp.dat_written)
					return;

				setirq(nr, 10);
				setdr(nr);
				if (cdp.wlen != 1)
					cdp.wlen = ((cdp.wlen - 1) >>> 0) & 0xffff;
				cdp.state = 5;
				break;
			}
			case 5: {
				cdp.evtime = MAX_EV;
				if (!chan_ena) {
					zerostate(nr);
					return;
				}
				if (!cdp.dat_written)
					return;

				if (cdp.ptx_written) {
					cdp.ptx_written = 0;
					cdp.lc = cdp.ptx;
				}
				loaddat(nr, false);
				if (napnav)
					setdr(nr);
				cdp.state = 2;
				loadper(nr);
				cdp.pbufldl = true;
				cdp.intreq2 = 0;
				audio_state_channel2(nr, false);
				break;
			}
			case 2: {
				if (cdp.pbufldl) {
					newsample(nr, (cdp.dat2 >> 8) & 0xff);
					loadper(nr);
					cdp.pbufldl = false;
				}
				if (!perfin)
					return;
				if (audap)
					loaddat(nr, true);
				if (chan_ena) {
					if (audap)
						setdr(nr);
					if (cdp.intreq2 && audap)
						setirq(nr, 21);
				} else {
					if (audap)
						setirq(nr, 22);
				}
				cdp.pbufldl = true;
				cdp.state = 3;
				audio_state_channel2(nr, false);
				break;
			}
			case 3: {
				if (cdp.pbufldl) {
					newsample(nr, cdp.dat2 & 0xff);
					loadper(nr);
					cdp.pbufldl = false;
				}
				if (!perfin)
					return;
				if (chan_ena) {
					loaddat(nr, false);
					if (cdp.intreq2 && napnav)
						setirq(nr, 31);
					if (napnav)
						setdr(nr);
				} else {
					if (isirq(nr)) {
						zerostate(nr);
						return;
					}
					loaddat(nr, false);
					if (napnav)
						setirq(nr, 32);
				}
				cdp.intreq2 = 0;
				cdp.pbufldl = true;
				cdp.state = 2;
				audio_state_channel2(nr, false);
				break;
			}
		}
	}
	function audio_state_channel(nr, perfin) {
		var cdp = audio_channel[nr];
		if (nr < AUDIO_CHANNELS_PAULA) {
			audio_state_channel2(nr, perfin);
			cdp.dat_written = false;
		}
	}

	this.state_machine = function() { //audio_state_machine() called in SAER.custom.DMACON()
		this.update();
		for (var nr = 0; nr < AUDIO_CHANNELS_PAULA; nr++) {
			var cdp = audio_channel[nr];
			audio_state_channel2(nr, false);
			cdp.dat_written = false;
		}
		schedule_audio();
		SAER.events.schedule();
	}

	/*-----------------------------------------------------------------------*/

	this.obtain = function() {
		return obtain_sound();
	}

	/* This computes the 1st order low-pass filter term b0.
	The a1 term is 1.0 - b0. The center frequency marks the -3 dB point. */
	function rc_calculate_a0(sample_rate, cutoff_freq) {
		var omega;
		/* The BLT correction formula below blows up if the cutoff is above nyquist. */
		if (cutoff_freq >= sample_rate >> 1)
			return 1.0;

		omega = 2 * Math.PI * cutoff_freq / sample_rate;
		/* Compensate for the bilinear transformation. This allows us to specify the stop
		frequency more exactly, but the filter becomes less steep further from stopband. */
		omega = Math.tan(omega / 2) * 2;
		return 1.0 / (1.0 + 1.0 / omega);
	}

	/*this.check_prefs_changed_audio = function() {
		if (sound_available) {
			var ch = 1;
			//if (ch > 0) clear_sound_buffers();
			if (ch) {
				this.set_audio();
				audio_activate();
			}
		}
	}*/

	this.setup = function() { //set_audio()
		usehacks = SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68020 || SAEV_config.cpu.speed != SAEC_Config_CPU_Speed_Original;// || (currprefs.cs_hacks & 4);

		//used_freq = SAEV_config.chipset.ntsc ? PAULA_FREQ_NTSC : PAULA_FREQ_PAL;
		used_freq = SAEC_Config_Audio_Freq_44100;

		paula.frames = SAEV_config.audio.bufferFrames;
		paula.buffer = new Array(2); //max channels
		for (var j = 0; j < paula.buffer.length; j++)
			paula.buffer[j] = new Int16Array(paula.frames);

		//paula_size = SAEV_config.audio.bufferFrames * SAEV_config.audio.channels * 2;
		//paula_pointer = paula_buffer;
		paula.pointer = 0;
		paula.currrent = 0;

		if (SAEV_config.audio.mode >= SAEC_Config_Audio_Mode_On) {
			if (!setup_sound())
				return SAEE_Audio_RequiresWebAudio; //can't happen cos we fail on audio.obtain()
		}

		next_sample_evtime = scaled_sample_evtime;
		last_cycles = SAEV_Events_currcycle;
		//SAER.playfield.compute_vsynctime_ext(); //OWN unused SAEV_Audio_vsynctimebase_orig

		var sep = SAEV_config.audio.stereoSeparation * 3 >> 1;
		if (sep >= 15) sep = 16;
		mixed_mul1 = (MIXED_STEREO_SCALE >> 1) - sep;
		mixed_mul2 = (MIXED_STEREO_SCALE >> 1) + sep;

		var delay = SAEV_config.audio.stereoDelay;
		mixed_stereo_size = delay > 0 ? (1 << delay) - 1 : 0;

		mixed_on = sep < MIXED_STEREO_MAX || mixed_stereo_size > 0;
		if (mixed_on) {
			SAEF_log("audio.setup() mixing enabled");
			saved_ptr = 0;
			SAEF_memset(right_word_saved,0, 0, SOUND_MAX_DELAY_BUFFER);
		}

		led_filter_forced = -1; // always off
		sound_use_filter = 0;
		if (SAEV_config.audio.filter) {
			if (SAEV_config.audio.filter == SAEC_Config_Audio_Filter_On)
				led_filter_forced = 1;
			if (SAEV_config.audio.filter == SAEC_Config_Audio_Filter_Emul)
				led_filter_forced = 0;
			if (SAEV_config.audio.filterType == SAEC_Config_Audio_FilterType_A500)
				sound_use_filter = FILTER_MODEL_A500;
			else if (SAEV_config.audio.filterType == SAEC_Config_Audio_FilterType_A1200)
				sound_use_filter = FILTER_MODEL_A1200;
		}
		a500e_filter1_a0 = rc_calculate_a0(used_freq, 6200);
		a500e_filter2_a0 = rc_calculate_a0(used_freq, 20000);
		filter_a0 = rc_calculate_a0(used_freq, 7000);
		this.led_filter_audio();

		switch (SAEV_config.audio.interpol) {
			case SAEC_Config_Audio_Interpol_None: {
				switch (SAEV_config.audio.channels) {
					case SAEC_Config_Audio_Channels_Mono: sample_handler = sample16_mono_handler; break;
					case SAEC_Config_Audio_Channels_Stereo: sample_handler = sample16s_handler; break;
				}
				break;
			}
			case SAEC_Config_Audio_Interpol_Anti: {
				switch (SAEV_config.audio.channels) {
					case SAEC_Config_Audio_Channels_Mono: sample_handler = sample16i_anti_mono_handler; break;
					case SAEC_Config_Audio_Channels_Stereo: sample_handler = sample16si_anti_handler; break;
				}
				break;
			}
			case SAEC_Config_Audio_Interpol_RH: {
				switch (SAEV_config.audio.channels) {
					case SAEC_Config_Audio_Channels_Mono: sample_handler = sample16i_rh_mono_handler; break;
					case SAEC_Config_Audio_Channels_Stereo: sample_handler = sample16si_rh_handler; break;
				}
				break;
			}
			case SAEC_Config_Audio_Interpol_Crux: {
				switch (SAEV_config.audio.channels) {
					case SAEC_Config_Audio_Channels_Mono: sample_handler = sample16i_crux_mono_handler; break;
					case SAEC_Config_Audio_Channels_Stereo: sample_handler = sample16si_crux_handler; break;
				}
				break;
			}
		}
		sample_prehandler = null;
		if (SAEV_config.audio.interpol == SAEC_Config_Audio_Interpol_Anti)
			sample_prehandler = anti_prehandler;

		if (SAEV_config.audio.mode == SAEC_Config_Audio_Mode_Off) {
			SAER_Events_eventtab[SAEC_Events_EV_AUDIO].active = false;
			SAER.events.schedule();
		} else {
			audio_activate();
			//schedule_audio(); //OWN makes no sense
			//SAER.events.schedule();
		}
		return SAEE_None;
	}

	this.cleanup = function() {
		cleanup_sound();
	}

	this.reset = function() {
		reset_sound();

		for (var i = 0; i < sound_filter_state.length; i++)
			sound_filter_state[i].clr();

		for (i = 0; i < AUDIO_CHANNELS_MAX; i++) {
			var cdp = audio_channel[i];
			cdp.clr();
			cdp.per = PERIOD_MAX - 1;
			cdp.vol = 0;
			cdp.evtime = MAX_EV;
		}

		last_cycles = SAEV_Events_currcycle;
		next_sample_evtime = scaled_sample_evtime;
		schedule_audio();
		SAER.events.schedule();

		prevcon = -1; //OWN
	}

	this.pauseResume = function(pause) {
		if (pause)
			pause_sound();
		else
			resume_sound();
	}

	this.mute = function(mute) {
		mute_sound(mute)
	}

	/*-----------------------------------------------------------------------*/

	var prevcon = -1;
	this.update_adkmasks = function() {
		//static int prevcon = -1;
		var t = SAEV_Custom_adkcon | (SAEV_Custom_adkcon >> 4);

		/*audio_channel[0].adk_mask = (((t >> 0) & 1) - 1) >>> 0;
		audio_channel[1].adk_mask = (((t >> 1) & 1) - 1) >>> 0;
		audio_channel[2].adk_mask = (((t >> 2) & 1) - 1) >>> 0;
		audio_channel[3].adk_mask = (((t >> 3) & 1) - 1) >>> 0;*/
		audio_channel[0].enabled = (t & 1) == 0;
		audio_channel[1].enabled = (t & 2) == 0;
		audio_channel[2].enabled = (t & 4) == 0;
		audio_channel[3].enabled = (t & 8) == 0;

		if ((prevcon & 0xff) != (SAEV_Custom_adkcon & 0xff)) {
			audio_activate();
			prevcon = SAEV_Custom_adkcon;
		}
	}

	this.update = function() {
		var n_cycles = 0;

		if (SAEV_config.audio.mode == SAEC_Config_Audio_Mode_Off || audio_work_to_do == 0) {
			last_cycles = SAEV_Events_currcycle;
			return;
		}

		n_cycles = SAEV_Events_currcycle - last_cycles;
		while (n_cycles > 0) {
			var best_evtime = n_cycles + 1;
			var rounded;
			var i;

			for (i = 0; i < audio_channel_count; i++) {
				if (audio_channel[i].evtime != MAX_EV && best_evtime > audio_channel[i].evtime)
					best_evtime = audio_channel[i].evtime;
			}

			/* next_sample_evtime >= 0 so floor() behaves as expected
			rounded = floor(next_sample_evtime);
			if ((next_sample_evtime - rounded) >= 0.5)
				rounded++; */
			rounded = Math.round(next_sample_evtime);

			if (SAEV_config.audio.mode > SAEC_Config_Audio_Mode_Off_Emul && best_evtime > rounded)
				best_evtime = rounded;

			if (best_evtime > n_cycles)
				best_evtime = n_cycles;

			/* Decrease time-to-wait counters */
			next_sample_evtime -= best_evtime;
			if (SAEV_config.audio.mode > SAEC_Config_Audio_Mode_Off_Emul) {
				if (sample_prehandler !== null)
					sample_prehandler(Math.floor(best_evtime * SAEC_Events_CYCLE_UNIT_INV));
			}

			for (i = 0; i < audio_channel_count; i++) {
				if (audio_channel[i].evtime != MAX_EV)
					audio_channel[i].evtime -= best_evtime;
			}

			n_cycles -= best_evtime;

			if (SAEV_config.audio.mode > SAEC_Config_Audio_Mode_Off_Emul) {
				/* Test if new sample needs to be outputted */
				if (rounded == best_evtime) {
					/* Before the following addition, next_sample_evtime is in range [-0.5, 0.5) */
					next_sample_evtime += scaled_sample_evtime;

					sample_handler();
				}
			}

			for (i = 0; i < audio_channel_count; i++) {
				if (audio_channel[i].evtime == 0) {
					audio_state_channel(i, true);
					if (audio_channel[i].evtime == 0) {
						SAEF_error("audio.update() evtime == 0 (channel %d)", i);
						audio_channel[i].evtime = MAX_EV;
					}
				}
			}
		}
		last_cycles = SAEV_Events_currcycle - n_cycles;
	}

	this.handler = function() { //audio_evhandler()
		this.update();
		schedule_audio();
	}

	this.hsync = function() { //audio_hsync()
		//if (SAEV_config.audio.mode == SAEC_Config_Audio_Mode_Off) return; //OWN done in custom/devices_hsync()
		if (audio_work_to_do > 0) {
			audio_work_to_do--;
			if (audio_work_to_do == 0)
				audio_deactivate();
		}
		this.update();
	}

	this.vsync = function() { //audio_vsync()

	}

	this.AUDxDAT = function(nr, v) {
		var cdp = audio_channel[nr];
		var chan_ena = (SAEV_Custom_dmacon & SAEC_Custom_DMAF_DMAEN) != 0 && (SAEV_Custom_dmacon & (1 << nr)) != 0;

		cdp.dat = v;
		cdp.dat_written = true;
		if (cdp.state == 2 || cdp.state == 3) {
			if (chan_ena) {
				if (cdp.wlen == 1) {
					cdp.wlen = cdp.len;
					cdp.intreq2 = true;
				} else
					cdp.wlen = ((cdp.wlen - 1) >>> 0) & 0xffff;
			}
		} else {
			audio_activate();
			this.update();
			audio_state_channel(nr, false);
			schedule_audio();
			SAER.events.schedule();
		}
		cdp.dat_written = false;
	}

	this.AUDxLCH = function(nr, v) {
		var cdp = audio_channel[nr];
		audio_activate();
		this.update();

		v = v & (SAEV_config.chipset.mask == SAEC_Config_Chipset_Mask_OCS ? 7 : 31); //OWN

		/* Someone wants to update PT but DSR has not yet been processed.
		Too fast CPU and some tracker players: enable DMA, CPU delay, update AUDxPT with loop position*/
		if (usehacks && ((cdp.ptx_tofetch && cdp.state == 1) || cdp.ptx_written)) {
			cdp.ptx = cdp.lc;
			cdp.ptx_written = true;
		} else
			cdp.lc = ((v << 16) | (cdp.lc & 0x0000ffff)) >>> 0;
	}

	this.AUDxLCL = function(nr, v) {
		var cdp = audio_channel[nr];
		audio_activate();
		this.update();
		if (usehacks && ((cdp.ptx_tofetch && cdp.state == 1) || cdp.ptx_written)) {
			cdp.ptx = cdp.lc;
			cdp.ptx_written = true;
		} else
			cdp.lc = ((cdp.lc & 0xffff0000) | (v & 0xFFFE)) >>> 0;
	}

	this.AUDxPER = function(nr, v) {
		var cdp = audio_channel[nr];

		audio_activate();
		this.update();

		var per = v * SAEC_Events_CYCLE_UNIT;
		if (per == 0)
			per = PERIOD_MAX - 1;

		if (per < PERIOD_MIN * SAEC_Events_CYCLE_UNIT)
			per = PERIOD_MIN * SAEC_Events_CYCLE_UNIT;
		if (per < PERIOD_MIN_NONCE * SAEC_Events_CYCLE_UNIT && cdp.dmaenstore)
			per = PERIOD_MIN_NONCE * SAEC_Events_CYCLE_UNIT;

		if (cdp.per == PERIOD_MAX - 1 && per != PERIOD_MAX - 1) {
			cdp.evtime = SAEC_Events_CYCLE_UNIT;
			if (SAEV_config.audio.mode != SAEC_Config_Audio_Mode_Off) {
				schedule_audio();
				SAER.events.schedule();
			}
		}
		cdp.per = per;
	}

	this.AUDxLEN = function(nr, v) {
		audio_activate();
		this.update();
		audio_channel[nr].len = v;
	}

	this.AUDxVOL = function(nr, v) {
		v &= 127;
		if (v > 64) v = 64;
		audio_activate();
		this.update();
		audio_channel[nr].vol = v;
	}
}
