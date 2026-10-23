/* Loaded before the emulator scripts. With ?det=1 in the page URL it makes a run reproducible:
 *   - Math.random and Math.decimalRandom become a seeded xorshift PRNG (?seed=<n>, default 1).
 *     prototypes.js only defines Math.decimalRandom if it is missing, so ours wins.
 *   - new Date() / Date.now() return a fixed date (2000-01-01 12:00:00 UTC) that advances
 *     20 ms per emulated frame, independent of the host speed, so the RTC and any date-based
 *     code see the same clock on every machine.
 * Combined with cfg.debug.turbo (no frame pacing, no host-clock TOD hack) and waiting for a
 * number of emulated frames instead of seconds, frame N is the same on every run. */
(function() {
	var q = location.search;
	if (!/[?&]det=1\b/.test(q)) return;
	var m = /[?&]seed=(\d+)/.exec(q);
	var s = (m ? +m[1] : 1) >>> 0 || 1;
	function next() {
		s ^= s << 13; s >>>= 0;
		s ^= s >>> 17;
		s ^= s << 5; s >>>= 0;
		return s / 4294967296;
	}
	Math.random = next;
	Math.decimalRandom = function() { return (next() * 0x100000000) >>> 0; };

	var base = Date.UTC(2000, 0, 1, 12, 0, 0);
	var RealDate = Date;
	function fakeNow() {
		var f = window.SAEV_Events_vsync_counter;
		return base + (typeof f == "number" ? f * 20 : 0);
	}
	function FakeDate(a, b, c, d, e, f, g) {
		if (!(this instanceof FakeDate)) return new RealDate(fakeNow()).toString();
		switch (arguments.length) {
			case 0: return new RealDate(fakeNow());
			case 1: return new RealDate(a);
			default: return new RealDate(a, b, c || 1, d || 0, e || 0, f || 0, g || 0);
		}
	}
	FakeDate.prototype = RealDate.prototype;
	FakeDate.now = fakeNow;
	FakeDate.UTC = RealDate.UTC;
	FakeDate.parse = RealDate.parse;
	window.Date = FakeDate;
	window.__deterministic = true;
})();
