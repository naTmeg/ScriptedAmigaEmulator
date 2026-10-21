/* Minimal Amiga OFS (DOS\0) file access for ADF images: find a file by path, read it and
 * replace the contents of a small file (at most one data block, 488 bytes) in place.
 * Enough to patch s/startup-sequence on test disks. */
const BS = 512;
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const put32 = (b, o, v) => { b[o] = v >>> 24; b[o + 1] = (v >>> 16) & 0xff; b[o + 2] = (v >>> 8) & 0xff; b[o + 3] = v & 0xff; };
const block = (adf, n) => adf.subarray(n * BS, n * BS + BS);

function hashName(name) {
	let h = name.length;
	for (const ch of name.toUpperCase()) h = ((h * 13 + ch.charCodeAt(0)) & 0x7ff);
	return h % 72;
}
function blockName(b) { return String.fromCharCode(...b.subarray(BS - 79, BS - 79 + b[BS - 80])); }
/* the standard block checksum: the sum of all longs is 0, checksum long at offset 20 */
function setChecksum(b) {
	put32(b, 20, 0);
	let sum = 0;
	for (let i = 0; i < BS; i += 4) sum = (sum + u32(b, i)) >>> 0;
	put32(b, 20, (-sum) >>> 0);
}

export function findFile(adf, path) {
	if (String.fromCharCode(adf[0], adf[1], adf[2]) !== "DOS" || adf[3] !== 0) throw new Error("not an OFS disk");
	let dir = 880;
	for (const part of path.split("/")) {
		const d = block(adf, dir);
		let n = u32(d, 24 + 4 * hashName(part));
		while (n && blockName(block(adf, n)).toLowerCase() !== part.toLowerCase()) n = u32(block(adf, n), BS - 16); /* hash chain */
		if (!n) return 0;
		dir = n;
	}
	return dir;
}

export function readFile(adf, path) {
	const h = findFile(adf, path);
	if (!h) return null;
	const hdr = block(adf, h);
	const size = u32(hdr, BS - 188);
	const out = [];
	for (let n = u32(hdr, 16); n && out.length < size; n = u32(block(adf, n), 16)) {
		const db = block(adf, n);
		out.push(...db.subarray(24, 24 + u32(db, 12)));
	}
	return Uint8Array.from(out.slice(0, size));
}

export function replaceSmallFile(adf, path, content) {
	const h = findFile(adf, path);
	if (!h) throw new Error(path + " not found");
	if (content.length > 488) throw new Error("content larger than one OFS data block");
	const hdr = block(adf, h);
	const first = u32(hdr, 16);
	if (!first || u32(block(adf, first), 16) !== 0) throw new Error(path + " spans more than one data block");
	const db = block(adf, first);
	db.fill(0, 24);
	db.set(content, 24);
	put32(db, 12, content.length);
	setChecksum(db);
	put32(hdr, BS - 188, content.length);
	setChecksum(hdr);
}

/* free data blocks according to the bitmap (bit set = free; bit i is block i + 2) */
export function freeBlocks(adf) {
	const bm = block(adf, u32(block(adf, 880), BS - 196));
	let free = 0;
	for (let i = 0; i < 1758; i++)
		if ((u32(bm, 4 + ((i >> 5) << 2)) >>> (i & 31)) & 1) free++;
	return free;
}

/* delete a file in the root directory (no extension blocks, at most 72 data blocks): unlink it
 * from the hash chain and free its header and data blocks in the bitmap */
export function deleteRootFile(adf, name) {
	const root = block(adf, 880);
	const slot = 24 + 4 * hashName(name);
	let prev = null, n = u32(root, slot);
	while (n && blockName(block(adf, n)).toLowerCase() !== name.toLowerCase()) { prev = n; n = u32(block(adf, n), BS - 16); }
	if (!n) throw new Error(name + " not found");
	const hdr = block(adf, n);
	if (u32(hdr, BS - 4) !== 0xfffffffd) throw new Error(name + " is not a file");
	if (u32(hdr, BS - 8)) throw new Error(name + " has extension blocks");
	const next = u32(hdr, BS - 16);
	if (prev) { const pb = block(adf, prev); put32(pb, BS - 16, next); setChecksum(pb); } else put32(root, slot, next);
	setChecksum(root);
	const blocks = [n];
	for (let k = 0; k < 72; k++) { const b = u32(hdr, BS - 204 - 4 * k); if (b) blocks.push(b); }
	const bm = block(adf, u32(root, BS - 196));
	for (const b of blocks) { const i = b - 2, o = 4 + ((i >> 5) << 2); put32(bm, o, (u32(bm, o) | (1 << (i & 31))) >>> 0); }
	let sum = 0;
	for (let i = 4; i < BS; i += 4) sum = (sum + u32(bm, i)) >>> 0;
	put32(bm, 0, (-sum) >>> 0);
	return blocks.length;
}
