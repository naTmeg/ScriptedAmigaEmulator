/* SAE suite runner: runs vAmigaTS tests one by one in an iframe (run.htm), grabs SAE's
   canvas and compares it pixel by pixel with vAmiga's reference screenshot
   (<name>_68000.raw, 716x285 RGB, Kick 1.3, A500 ECS 1 MB).

   suite.htm?filter=<substring of adf path>   e.g. filter=IPL/MOVEP, alternatives with |
            &from=0&count=20                   slice of the filtered list
            &wait=20                           seconds to run after SAE reports "running"
            &frames=900                        instead of wait: number of emulated frames (use with turbo=1&det=1)
            &tol=48                            max channel difference still counted as equal
            &model=A500P&fast=0                passed through to run.htm

   Results: table on the page, window.suiteResults, and localStorage["suite_results"]
   (merged by test name), plus a diff image of the last test (red = mismatch). */

const RW = 716, RH = 285;
let suite = [], results = {}, running = false;

function param(n, d) { const m = new RegExp("[?&]" + n + "=([^&]*)").exec(location.search); return m ? decodeURIComponent(m[1]) : d; }
function status(s) { document.getElementById("status").textContent = s; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchRaw(url) {
	return fetch(url, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("HTTP " + r.status + " " + url); return r.arrayBuffer(); }).then(b => new Uint8Array(b));
}

/* Grab the emulator canvas of the iframe as RGBA at its native size. */
function grabCanvas(frame) {
	const cv = frame.contentDocument.querySelector("#myVideo canvas");
	if (!cv) return null;
	const c2 = document.createElement("canvas"); c2.width = cv.width; c2.height = cv.height;
	const ctx = c2.getContext("2d"); ctx.drawImage(cv, 0, 0);
	return { w: cv.width, h: cv.height, data: ctx.getImageData(0, 0, cv.width, cv.height).data };
}

/* Compare SAE pixels (x = vx + dx, y = ys * (vy + dy)) with the reference for one offset,
   sampling every `step` pixels. Returns the fraction of matching samples. */
function scoreAt(img, raw, dx, dy, ys, tol, step) {
	let ok = 0, n = 0;
	for (let vy = 0; vy < RH; vy += step) {
		const sy = ys * vy + dy; /* dy in SAE rows, so odd offsets are possible */
		if (sy < 0 || sy >= img.h) continue;
		for (let vx = 0; vx < RW; vx += step) {
			const sx = vx + dx;
			if (sx < 0 || sx >= img.w) continue;
			const si = (sy * img.w + sx) * 4, ri = (vy * RW + vx) * 3;
			n++;
			if (Math.abs(img.data[si] - raw[ri]) <= tol && Math.abs(img.data[si + 1] - raw[ri + 1]) <= tol && Math.abs(img.data[si + 2] - raw[ri + 2]) <= tol) ok++;
		}
	}
	return n ? ok / n : 0;
}

/* Find the best offset in a small window, coarse first, then full-resolution score
   plus the list of reference rows that differ. */
function compare(img, raw, tol) {
	const ys = Math.round(img.h / RH) || 1;
	let best = { s: -1, dx: 0, dy: 0 };
	const fdx = param("dx", ""), fdy = param("dy", "");
	if (fdx !== "" && fdy !== "") {
		best = { s: 0, dx: +fdx, dy: +fdy }; /* fixed offset from the URL */
	} else {
		for (let dy = -24; dy <= 24; dy++)
			for (let dx = -80; dx <= 80; dx += 2) {
				const s = scoreAt(img, raw, dx, dy, ys, tol, 4);
				if (s > best.s) best = { s, dx, dy };
			}
		for (let dx = best.dx - 1; dx <= best.dx + 1; dx++) {
			const s = scoreAt(img, raw, dx, best.dy, ys, tol, 2);
			if (s > best.s) best = { s, dx, dy: best.dy };
		}
	}
	/* full comparison at the best offset, per row, and a diff image */
	const diff = document.getElementById("diff"), dctx = diff.getContext("2d");
	const dimg = dctx.createImageData(RW >> 1, RH);
	const badRows = []; let ok = 0, n = 0;
	for (let vy = 0; vy < RH; vy++) {
		const sy = ys * vy + best.dy; let rowBad = 0, rowN = 0;
		for (let vx = 0; vx < RW; vx++) {
			const sx = vx + best.dx; const ri = (vy * RW + vx) * 3;
			if (sy < 0 || sy >= img.h || sx < 0 || sx >= img.w) continue;
			const si = (sy * img.w + sx) * 4; rowN++; n++;
			const same = Math.abs(img.data[si] - raw[ri]) <= tol && Math.abs(img.data[si + 1] - raw[ri + 1]) <= tol && Math.abs(img.data[si + 2] - raw[ri + 2]) <= tol;
			if (same) ok++; else rowBad++;
			if ((vx & 1) == 0) { const di = (vy * (RW >> 1) + (vx >> 1)) * 4; if (same) { dimg.data[di] = raw[ri] >> 1; dimg.data[di + 1] = raw[ri + 1] >> 1; dimg.data[di + 2] = raw[ri + 2] >> 1; } else { dimg.data[di] = 255; dimg.data[di + 1] = 0; dimg.data[di + 2] = 0; } dimg.data[di + 3] = 255; }
		}
		if (rowN && rowBad / rowN > 0.02) badRows.push(vy);
	}
	dctx.putImageData(dimg, 0, 0);
	/* side by side: SAE (mapped with the same offset) and the reference, half width */
	const sc = document.getElementById("sae").getContext("2d"), simg = sc.createImageData(RW >> 1, RH);
	const rc = document.getElementById("ref").getContext("2d"), rimg = rc.createImageData(RW >> 1, RH);
	for (let vy = 0; vy < RH; vy++) for (let vx = 0; vx < RW; vx += 2) {
		const di = (vy * (RW >> 1) + (vx >> 1)) * 4, ri = (vy * RW + vx) * 3;
		rimg.data[di] = raw[ri]; rimg.data[di + 1] = raw[ri + 1]; rimg.data[di + 2] = raw[ri + 2]; rimg.data[di + 3] = 255;
		const sy = ys * vy + best.dy, sx = vx + best.dx;
		if (sy >= 0 && sy < img.h && sx >= 0 && sx < img.w) { const si = (sy * img.w + sx) * 4; simg.data[di] = img.data[si]; simg.data[di + 1] = img.data[si + 1]; simg.data[di + 2] = img.data[si + 2]; }
		simg.data[di + 3] = 255;
	}
	sc.putImageData(simg, 0, 0); rc.putImageData(rimg, 0, 0);
	/* compress bad rows into ranges */
	const ranges = []; for (const y of badRows) { const r = ranges[ranges.length - 1]; if (r && y == r[1] + 1) r[1] = y; else ranges.push([y, y]); }
	return { score: n ? ok / n : 0, dx: best.dx, dy: best.dy, badRows: ranges.map(r => r[0] == r[1] ? String(r[0]) : r[0] + "-" + r[1]).join(" ") };
}

function runOne(t, opts) {
	return new Promise(resolve => {
		const frame = document.getElementById("frame");
		const url = "run.htm?adf=" + encodeURIComponent(t.adf) + "&model=" + opts.model + "&fast=" + opts.fast + opts.extra +
			(opts.frames > 0 ? "&stopframe=" + opts.frames : "") + "&r=" + Date.now();
		const t0 = Date.now();
		let done = false;
		const finish = (res) => { if (done) return; done = true; resolve(res); };
		frame.onload = async () => {
			const w = frame.contentWindow;
			let stalled = null;
			/* wait for the harness to start the emulator */
			for (let i = 0; i < 300; i++) { await sleep(100); if (w.harnessState && (w.harnessState.phase == "running" || w.harnessState.phase == "stopped")) break; if (w.harnessState && w.harnessState.error) return finish({ note: w.harnessState.error }); }
			if (!w.harnessState || (w.harnessState.phase != "running" && w.harnessState.phase != "stopped")) return finish({ note: "did not start" });
			if (opts.frames > 0) {
				/* wait for a number of emulated frames; with turbo=1 this is as fast as the host allows */
				/* if the frame counter stops moving for 15 s (emulation halted or crashed),
				   score the picture as it is and say so */
				let last = -1, since = Date.now();
				while (w.harnessState.phase != "stopped") {
					await sleep(20);
					const f = w.harnessFrames();
					if (f != last) { last = f; since = Date.now(); }
					else if (Date.now() - since > 15000) { stalled = "stalled at frame " + f; break; }
				}
				await sleep(100); /* let the last frame reach the canvas */
			} else
				await sleep(opts.wait * 1000);
			const img = grabCanvas(frame);
			if (!img) return finish({ note: "no canvas" });
			try { const raw = await fetchRaw(t.raw); const r = compare(img, raw, opts.tol); r.secs = Math.round((Date.now() - t0) / 1000); if (stalled) r.note = stalled; finish(r); }
			catch (e) { finish({ note: String(e) }); }
		};
		frame.src = url;
	});
}

function render(list) {
	const tb = document.querySelector("#results tbody"); tb.innerHTML = "";
	list.forEach((t, i) => {
		const r = results[t.id]; if (!r) return;
		const tr = document.createElement("tr");
		const cls = r.score == null ? "bad" : r.score >= 0.995 ? "ok" : r.score >= 0.97 ? "meh" : "bad";
		tr.innerHTML = `<td>${i}</td><td>${t.id}</td><td class="${cls}">${r.score == null ? "-" : (r.score * 100).toFixed(2) + "%"}</td><td>${r.dx ?? ""}</td><td>${r.dy ?? ""}</td><td>${r.badRows ?? ""}</td><td>${r.note ?? ""}</td>`;
		tb.appendChild(tr);
	});
}

async function main() {
	suite = await fetch("suite.json", { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("suite.json missing, run: npm run fetch:vamigats"); return r.json(); })
		.catch(e => { status(String(e)); window.suiteError = String(e); window.suiteDone = true; return []; });
	const filter = param("filter", ""), from = +param("from", "0"), count = +param("count", "100000");
	const opts = { wait: +param("wait", "20"), frames: +param("frames", "0"), tol: +param("tol", "48"), model: param("model", "A500P"), fast: param("fast", "0"), extra: "" };
	for (const k of ["chip", "slow", "rom", "speed", "compat", "turbo", "det", "seed", "video"]) if (param(k, "")) opts.extra += "&" + k + "=" + encodeURIComponent(param(k, ""));
	try { results = JSON.parse(localStorage.getItem("suite_results") || "{}"); } catch (e) { results = {}; }
	const filters = filter.split("|").filter(Boolean); /* alternatives: filter=CPU/Misc|CPU/Prefetch */
	const list = suite.filter(t => !filters.length || filters.some(f => (t.adf + " " + t.group).indexOf(f) >= 0)).slice(from, from + count);
	window.suiteList = list; window.suiteResults = results;
	status(`${list.length} tests (filter "${filter}"), wait ${opts.wait}s, tol ${opts.tol}, ${opts.model} fast=${opts.fast}`);
	if (!list.length) return;
	/* ?reload=1: refetch the emulator scripts so edited files are not served from the browser cache */
	if (param("reload", "") == "1") {
		const html = await fetch("run.htm", { cache: "reload" }).then(r => r.text());
		const srcs = [...html.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
		for (const u of srcs) await fetch(u, { cache: "reload" });
		status("reloaded " + srcs.length + " scripts");
	}
	running = true;
	for (let i = 0; i < list.length; i++) {
		const t = list[i];
		status(`running ${i + 1}/${list.length}: ${t.id}`);
		const r = await runOne(t, opts);
		r.when = new Date().toISOString();
		results[t.id] = r;
		try { localStorage.setItem("suite_results", JSON.stringify(results)); } catch (e) {}
		render(list);
	}
	running = false;
	const scored = list.filter(t => results[t.id] && results[t.id].score != null);
	const bad = scored.filter(t => results[t.id].score < 0.995);
	status(`done: ${list.length} tests, ${scored.length} scored, ${bad.length} below 99.5%: ${bad.map(t => t.id + " " + (results[t.id].score * 100).toFixed(1) + "%").join(", ")}`);
	window.suiteDone = true;
}
window.addEventListener("load", main);
