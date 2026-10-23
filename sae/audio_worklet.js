/*-------------------------------------------------------------------------
| SAE - Scripted Amiga Emulator
| https://github.com/naTmeg/ScriptedAmigaEmulator
|
| Paula output stage, running on the dedicated audio-rendering thread
| (AudioWorkletGlobalScope) instead of the main thread. Runs completely
| standalone: this file cannot see any of the SAER/SAEV_/SAEC_ globals
| from the other sae js files (separate JS realm), so everything it
| needs travels over the port as plain messages.
|
| Design: audio.js (main thread) keeps generating Paula samples exactly
| as before and, whenever a buffer's worth is ready, posts a copy over to
| this processor instead of writing it into a main-thread ring buffer.
| This processor holds its own small ring buffer ("fifo" below) and
| drains it at the *audio hardware's own pace* inside process(), which
| the browser calls on a realtime thread that is never blocked by main-
| thread work (CPU/blitter/video emulation, GC, canvas painting, ...).
| That's the actual fix for jank-driven crackle: previously the
| equivalent pull (ScriptProcessorNode's onaudioprocess) ran on the main
| thread and could be delayed by exactly that work.
|
| Paula's generation rate (used_freq) and the AudioContext's rendering
| rate (sampleRate) are usually identical (SAEC_Config_Audio_Freq_Auto,
| the default), but don't have to be if the user pins a fixed frequency
| in the config UI while the audio device runs at a different native
| rate. `resampleRatio` compensates for that with linear interpolation
| (a fixed, known ratio here - unlike the old scaleplay()/paula.average
| dance in audio.js, which existed to guess a *varying* ratio caused by
| the old consumer's own timing jitter; that problem doesn't exist here
| since this processor is pulled at a rock-steady rate by the browser).
-------------------------------------------------------------------------*/

class SAEPaulaProcessor extends AudioWorkletProcessor {
	constructor(options) {
		super();

		var opts = (options && options.processorOptions) || {};
		this.channels = opts.channels || 2;
		this.capacity = opts.fifoFrames || 32768;
		this.resampleRatio = opts.resampleRatio || 1.0;

		this.fifo = new Array(this.channels);
		for (var ch = 0; ch < this.channels; ch++)
			this.fifo[ch] = new Float32Array(this.capacity);

		this.totalWritten = 0; /* frames ever pushed in, monotonic (absolute index) */
		this.readPos = 0.0; /* fractional absolute read position */
		this.muted = false;
		this.underruns = 0;

		/* Jitter buffer: rather than trailing the writer by a fixed small
		amount (which underruns again on the very next hiccup, right after
		recovering from the last one), wait for a real cushion of buffered
		audio before playing, and rebuild that whole cushion again after any
		underrun instead of resuming with zero slack. */
		this.playing = false;
		this.prebufferTarget = opts.prebufferTarget || Math.floor(this.capacity / 2);

		this.reportEvery = 8; /* ~once per emulated PAL line-rate frame at 128-frame quanta/48kHz */
		this.quantaSinceReport = 0;

		this.port.onmessage = (e) => this.handleMessage(e.data);
	}

	handleMessage(msg) {
		switch (msg.type) {
			case "data": {
				var frames = msg.frames;
				var base = this.totalWritten;
				/* if the producer is far enough ahead that this chunk would
				overwrite still-unread data, snap the read position forward
				so we never read stale/overwritten samples. This trades a
				short jump for never reading garbage. */
				if (base + frames - this.readPos > this.capacity)
					this.readPos = base + frames - this.capacity + 1;

				for (var ch = 0; ch < this.channels; ch++) {
					var src = msg.channels[ch];
					var dst = this.fifo[ch];
					for (var i = 0; i < frames; i++)
						dst[(base + i) % this.capacity] = src[i] * (1.0 / 32768);
				}
				this.totalWritten += frames;
				break;
			}
			case "mute":
				this.muted = !!msg.value;
				break;
			case "reset":
				this.totalWritten = 0;
				this.readPos = 0.0;
				this.underruns = 0;
				this.playing = false;
				break;
			case "resampleRatio":
				this.resampleRatio = msg.value;
				break;
			case "prebufferTarget": /* live tuning hook, e.g. for quick latency experiments from devtools */
				this.prebufferTarget = msg.value;
				break;
		}
	}

	process(inputs, outputs) {
		var output = outputs[0];
		var frames = output[0].length;

		for (var i = 0; i < frames; i++) {
			/* not currently playing (initial startup, or rebuffering after an
			underrun): stay silent and let totalWritten build up ahead of the
			frozen readPos. Once a full prebufferTarget's worth has piled up,
			resume reading from exactly where we paused - no jump, and a real
			cushion ahead of us again instead of the zero slack that caused
			the previous fix to immediately underrun on the next hiccup. */
			if (!this.playing) {
				this.underruns++;
				for (var ch = 0; ch < this.channels; ch++)
					output[ch][i] = 0.0;
				if (this.totalWritten - this.readPos >= this.prebufferTarget)
					this.playing = true;
				continue;
			}

			var i0 = Math.floor(this.readPos);
			var have = (i0 + 1) < this.totalWritten;

			if (have && !this.muted) {
				var frac = this.readPos - i0;
				var idx0 = i0 % this.capacity;
				var idx1 = (i0 + 1) % this.capacity;
				for (var ch = 0; ch < this.channels; ch++) {
					var buf = this.fifo[ch];
					output[ch][i] = buf[idx0] * (1.0 - frac) + buf[idx1] * frac;
				}
				this.readPos += this.resampleRatio;
			} else {
				if (!have) {
					this.underruns++;
					this.playing = false; /* ran dry mid-stream -> rebuffer before resuming */
				}
				for (var ch = 0; ch < this.channels; ch++)
					output[ch][i] = 0.0;
			}
		}

		if (++this.quantaSinceReport >= this.reportEvery) {
			this.quantaSinceReport = 0;
			this.port.postMessage({
				type: "fill",
				frames: Math.max(0, this.totalWritten - this.readPos),
				capacity: this.capacity,
				underruns: this.underruns
			});
			this.underruns = 0;
		}

		return true; /* keep the processor alive */
	}
}

registerProcessor("sae-paula-processor", SAEPaulaProcessor);
