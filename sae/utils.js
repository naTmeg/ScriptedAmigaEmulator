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
-------------------------------------------------------------------------*/
/* global constants */

const SAEC_LITTLE_ENDIAN = (function() {
	var buffer = new ArrayBuffer(2);
	new DataView(buffer).setInt16(0, 256, true);
	return new Int16Array(buffer)[0] === 256; /* read is LE */
})();
//console.log("Little endian system: "+(SAEC_LITTLE_ENDIAN ? "Yes" : "No"));

/*-----------------------------------------------------------------------*/
/* byte-swapping */

function SAEF_bswap16(v) {
	return ((v & 0x00ff) << 8) | ((v & 0xff00) >> 8);
}
function SAEF_bswap32(v) {
	return (((v & 0x000000ff) << 24) | ((v & 0x0000ff00) << 8) | ((v & 0x00ff0000) >>> 8) | ((v & 0xff000000) >>> 24)) >>> 0;
}

function SAEF_be16toh(v) {
	if (SAEC_LITTLE_ENDIAN)
		return ((v & 0x00ff) << 8) | ((v & 0xff00) >> 8);
	else
		return v;
}
function SAEF_be32toh(v) {
	if (SAEC_LITTLE_ENDIAN)
		return (((v & 0x000000ff) << 24) | ((v & 0x0000ff00) << 8) | ((v & 0x00ff0000) >>> 8) | ((v & 0xff000000) >>> 24)) >>> 0;
	else
		return v;
}

function SAEF_le32toh(v) {
	if (SAEC_LITTLE_ENDIAN)
		return v;
	else
		return (((v & 0x000000ff) << 24) | ((v & 0x0000ff00) << 8) | ((v & 0x00ff0000) >>> 8) | ((v & 0xff000000) >>> 24)) >>> 0;
}
function SAEF_le16toh(v) {
	if (SAEC_LITTLE_ENDIAN)
		return v;
	else
		return ((v & 0x00ff) << 8) | ((v & 0xff00) >> 8);
}

/*-----------------------------------------------------------------------*/
/* moving average */

function SAEO_MAvg(size) {
	var values = new Array(size);
	var size = size;
	var usage = 0;
	var offset = 0;
	var average = 0;

	this.clr = function () {
		usage = 0;
		offset = 0;
		average = 0;
	};

	this.get = function() {
		return average / usage; /* return as float */
	}

	this.set = function(newval) {
		if (usage < size) {
			values[usage++] = newval;
			average += newval;
		} else {
			average -= values[offset];
			values[offset] = newval;
			average += newval;
			if (++offset >= size)
				offset -= size;
		}
		return average / usage; /* return as float */
	}
}

/*-----------------------------------------------------------------------*/
/* CRC checksumming */

var SAEV_crc32Table = new Uint32Array(256);
var SAEV_crc16Table = new Uint16Array(256);
{
	var c, w;
	var n, k;
	for (n = 0; n < 256; n++) {
		c = n;
		w = n << 8;
		for (k = 0; k < 8; k++) {
			c = ((c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)) >>> 0;
			w = ((w << 1) & 0xffff) ^ ((w & 0x8000) ? 0x1021 : 0);
		}
		SAEV_crc32Table[n] = c;
		SAEV_crc16Table[n] = w;
	}
}

function SAEF_crc32(buf,bufo, len) {
	var crc = 0xffffffff;
	if (typeof buf === "string") {
		while (len-- > 0)
			crc = SAEV_crc32Table[(crc ^ buf.charCodeAt(bufo++)) & 0xff] ^ (crc >>> 8);
	} else {
		while (len-- > 0)
			crc = SAEV_crc32Table[(crc ^ buf[bufo++]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function SAEF_crc16(buf,bufo, len) {
	var crc = 0xffff;
	while (len-- > 0)
		crc = ((crc << 8) & 0xffff) ^ SAEV_crc16Table[((crc >> 8) ^ buf[bufo++]) & 0xff];
	return crc;
}

/*-----------------------------------------------------------------------*/
/* Date/Time conversion */

function SAEF_gettimeofday(tv, tz) {
	var now = performance.now();
	now += performance.timing.navigationStart;
	now = Math.floor(now * 1000);
	tv.tv_sec = Math.floor(now / 1000000);
	tv.tv_usec = now % 1000000;
}

function SAEF_timeval_to_amiga(tv, amiga, tickcount) {
	/* tv.tv_sec is secs since 1-1-1970 */
	/* days since 1-1-1978 */
	/* mins since midnight */
	/* ticks past minute @ 50Hz */
	const msecs_per_day = 24 * 60 * 60 * 1000;

	var t = tv.tv_sec * 1000 + Math.floor(tv.tv_usec / 1000);
	t -= (8 * 365 + 2) * 24 * 60 * 60 * 1000;

	if (t < 0)
		t = 0;
	amiga.days = Math.floor(t / msecs_per_day);
	t -= amiga.days * msecs_per_day;
	amiga.mins = Math.floor(t / (60 * 1000));
	t -= amiga.mins * (60 * 1000);
	amiga.ticks = Math.floor(t / (1000 / tickcount));
}

/*function SAEF_amiga_to_timeval(tv, days, mins, ticks, tickcount) {
	if (days < 0)
		days = 0;
	if (days > 9900 * 365)
		days = 9900 * 365; // in future far enough?
	if (mins < 0 || mins >= 24 * 60)
		mins = 0;
	if (ticks < 0 || ticks >= 60 * tickcount)
		ticks = 0;

	var t = ticks * 20;
	t += mins * 60 * 1000;
	t += days * 24 * 60 * 60 * 1000;
	t += (8 * 365 + 2) * 24 * 60 * 60 * 1000;

	tv.tv_sec = Math.floor(t / 1000);
	tv.tv_usec = (t % 1000) * 1000;
}*/

/*-----------------------------------------------------------------------*/

function SAEF_memset(dst,dsto, value, length) {
	for (var i = dsto, j = dsto + length; i < j; i++)
		dst[i] = value;
}

function SAEF_memcpy(dst,dsto, src,srco, length) {
	for (var i = 0; i < length; i++)
		dst[dsto + i] = src[srco + i];
}

/*-----------------------------------------------------------------------*/

function SAEF_CloneObject(object) {
	return Object.assign({}, object);
}

function SAEF_Array2String(array, start, end) {
	if (typeof end == "undefined") end = array.length;
	if (typeof start == "undefined") start = 0;
	var string = "";
	for (var i = start; i < end; i++)
		string += String.fromCharCode(array[i]);
	return string;
}

function SAEF_String2Array(string, start, end) {
	if (typeof end == "undefined") end = string.length;
	if (typeof start == "undefined") start = 0;
	var array = new Uint8Array(end - start);
	for (var i = start; i < end; i++)
		array[i - start] = string.charCodeAt(i);
	return array;
}

/*function SAEF_CopyArray(dst_array, src_array, src_end) {
	if (typeof src_end == "undefined") src_end = src_array.length;
	for (var i = 0; i < src_end; i++) {
		if (typeof dst_array[i] == "undefined" || typeof src_array[i] == "undefined")
			return 1;
		dst_array[i] = src_array[i];
	}
	return 0;
}*/

function SAEF_CompareArray(array1, array2, end2) {
	if (typeof end2 == "undefined") end2 = array2.length;
	for (var i = 0; i < end2; i++) {
		if (typeof array1[i] == "undefined" || typeof array2[i] == "undefined")
			return 1;
		if (array1[i] != array2[i])
			return 1;
	}
	return 0;
}
function SAEF_CompareArrayAfter(array1, start1, array2, end2) {
	if (typeof end2 == "undefined") end2 = array2.length;
	for (var i = 0; i < end2; i++) {
		if (typeof array1[start1 + i] == "undefined" || typeof array2[i] == "undefined")
			return 1;
		if (array1[start1 + i] != array2[i])
			return 1;
	}
	return 0;
}

/*-----------------------------------------------------------------------*/
/* Javascript sprintf - http://www.webtoolkit.info
   This is the only function that does not correspond to the global name space
*/
var sprintfWrapper = {
	init: function () {
		if (typeof arguments == "undefined") {
			return null;
		}
		if (arguments.length < 1) {
			return null;
		}
		if (typeof arguments[0] != "string") {
			return null;
		}
		if (typeof RegExp == "undefined") {
			return null;
		}

		var string = arguments[0];
		var exp = new RegExp(/(%([%]|(\-)?(\+|\x20)?(0)?(\d+)?(\.(\d)?)?([bcdfosxX])))/g);
		var matches = [];
		var strings = [];
		var convCount = 0;
		var stringPosStart = 0;
		var stringPosEnd = 0;
		var matchPosEnd = 0;
		var newString = "";
		var match;

		while (match = exp.exec(string)) {
			if (match[9]) {
				convCount += 1;
			}

			stringPosStart = matchPosEnd;
			stringPosEnd = exp.lastIndex - match[0].length;
			strings[strings.length] = string.substring(stringPosStart, stringPosEnd);

			matchPosEnd = exp.lastIndex;
			matches[matches.length] = {
				match: match[0],
				left: match[3] ? true : false,
				sign: match[4] || "",
				pad: match[5] || " ",
				min: match[6] || 0,
				precision: match[8],
				code: match[9] || "%",
				negative: !!(parseInt(arguments[convCount]) < 0),
				argument: String(arguments[convCount])
			};
		}
		strings[strings.length] = string.substring(matchPosEnd);

		if (matches.length == 0) {
			return string;
		}
		if ((arguments.length - 1) < convCount) {
			return null;
		}

		for (var i = 0; i < matches.length; i++) {
			var substitution;

			if (matches[i].code == "%") {
				substitution = "%"
			} else if (matches[i].code == "b") {
				matches[i].argument = String(Math.abs(parseInt(matches[i].argument)).toString(2));
				substitution = sprintfWrapper.convert(matches[i], true);
			} else if (matches[i].code == "c") {
				matches[i].argument = String(String.fromCharCode(parseInt(Math.abs(parseInt(matches[i].argument)))));
				substitution = sprintfWrapper.convert(matches[i], true);
			} else if (matches[i].code == "d") {
				matches[i].argument = String(Math.abs(parseInt(matches[i].argument)));
				substitution = sprintfWrapper.convert(matches[i]);
			} else if (matches[i].code == "f") {
				matches[i].argument = String(Math.abs(parseFloat(matches[i].argument)).toFixed(matches[i].precision ? matches[i].precision : 6));
				substitution = sprintfWrapper.convert(matches[i]);
			} else if (matches[i].code == "o") {
				matches[i].argument = String(Math.abs(parseInt(matches[i].argument)).toString(8));
				substitution = sprintfWrapper.convert(matches[i]);
			} else if (matches[i].code == "s") {
				matches[i].argument = matches[i].argument.substring(0, matches[i].precision ? matches[i].precision : matches[i].argument.length);
				substitution = sprintfWrapper.convert(matches[i], true);
			} else if (matches[i].code == "x") {
				matches[i].argument = String(Math.abs(parseInt(matches[i].argument)).toString(16));
				substitution = sprintfWrapper.convert(matches[i]);
			} else if (matches[i].code == "X") {
				matches[i].argument = String(Math.abs(parseInt(matches[i].argument)).toString(16));
				substitution = sprintfWrapper.convert(matches[i]).toUpperCase();
			} else {
				substitution = matches[i].match;
			}
			newString += strings[i];
			newString += substitution;

		}
		newString += strings[i];

		return newString;
	},
	convert: function (match, nosign) {
		if (nosign) {
			match.sign = "";
		} else {
			match.sign = match.negative ? "-" : match.sign;
		}
		var l = match.min - match.argument.length + 1 - match.sign.length;
		var pad = new Array(l < 0 ? 0 : l).join(match.pad);
		if (!match.left) {
			if (match.pad == "0" || nosign) {
				return match.sign + pad + match.argument;
			} else {
				return pad + match.sign + match.argument;
			}
		} else {
			if (match.pad == "0" || nosign) {
				return match.sign + match.argument + pad.replace(/0/g, " ");
			} else {
				return match.sign + match.argument + pad;
			}
		}
	}
};
var sprintf = sprintfWrapper.init;

/*-----------------------------------------------------------------------*/
/* Z wrapper */

const SEEK_SET	= 0; /* set file offset to offset */
const SEEK_CUR	= 1; /* set file offset to current plus offset */
const SEEK_END	= 2; /* set file offset to EOF plus offset */

/*struct zfile {
	TCHAR *name;
	TCHAR *originalname;
	uae_u8 *data; // unpacked data
	int dataseek; // use seek position even if real file

	uae_s64 size; // real size
	uae_s64 datasize; // available size (not yet unpacked completely?)
	uae_s64 allocsize; // memory allocated before realloc() needed again
	uae_s64 seek; // seek position

	int opencnt;
};*/
function SAEO_ZFile() {
	this.name = "";
	this.originalname = "";
	this.data = null; // unpacked data
	this.dataseek = 0; // use seek position even if real file

	this.size = 0; // real size
	this.datasize = 0; // available size (not yet unpacked completely?)
	this.allocsize = 0; // memory allocated before realloc() needed again
	this.seek = 0; // seek position

	this.opencnt = 0;
}

/*---------------------------------*/

function SAEF_ZFile_create(prev, originalname) {
	var z = new SAEO_ZFile();
	z.opencnt = 1;

	if (prev !== null && prev.originalname)
		z.originalname = prev.originalname;
	else if (originalname.length)
		z.originalname = originalname;

	return z;
}

function SAEF_ZFile_free(f) {
	f.name = "";
	f.originalname = "";
	f.data = null;
}

/*---------------------------------*/

function SAEF_ZFile_fopen_empty(prev, name, size) {
	var l = SAEF_ZFile_create(prev, "");
	l.name = name.length ? name : "";
	if (size) {
		l.data = new Uint8Array(size);
		/*if (!l.data)  {
			xfree(l);
			return null;
		}*/
		l.size = size;
		l.datasize = size;
		l.allocsize = size;
	} else {
		l.data = new Uint8Array(1000);
		l.size = 0;
		l.allocsize = 1000;
	}
	return l;
}

function SAEF_ZFile_fopen_load_zfile(f) {
	var l = SAEF_ZFile_fopen_empty(f, f.name, f.size);
	if (l === null)
		return null;
	SAEF_ZFile_fseek(f, 0, SEEK_SET);
	SAEF_ZFile_fread(l.data,0, f.size, 1, f);
	return l;
}

/*function SAEF_ZFile_fopen_data(name, size, data) {
	if (size) {
		var l = SAEF_ZFile_create(null, name);
		l.name = name.length ? name : "";
		if (1) { // ptr
			l.data = data;
		} else {
			l.data = new Uint8Array(size);
			l.data.set(data); //memcpy(l.data, data, size);
		}
		l.size = size;
		l.datasize = size;
		l.allocsize = size; //OWN
		return l;
	}
	return null;
}*/

function SAEF_ZFile_fopen_file(file) {
	if (file.size) {
		var l = SAEF_ZFile_create(null, file.name);
		l.name = file.name.length ? file.name : "";

		if (0) { /* reference-mode. do not enable */
			l.data = file.data;
		} else {
			l.data = new Uint8Array(file.size);
			//memcpy(l.data, data, size);
			if (typeof file.data === "string")
				l.data.set(SAEF_String2Array(file.data, 0, file.size));
			else
				l.data.set(file.data);
		}
		l.size = file.size;
		l.datasize = file.size;
		l.allocsize = file.size; //OWN

		var magic = ((l.data[0] << 24) | (l.data[1] << 16) | (l.data[2] << 8) | (l.data[3])) >>> 0;

		//SAEF_log("SAEF_ZFile_fopen_file() opening '%s', %d/%d bytes, crc32 0x%08x, magic %08x", l.name, l.size, l.data.length, file.crc32 !== false ? file.crc32 : 0, magic);

		if (magic == 0x504B0304 || magic == 0x04034B50)
			SAEF_fatal(SAEE_Config_Compressed, "A ZIP file was detected. Compressed files are not yet supported.");

		//if (l.data[0] == 68 && l.data[1] == 77 && l.data[2] == 83 && l.data[3] == 33) { /* DMS! */
		if (SAEF_CompareArray(l.data, SAEF_String2Array("DMS!"), 4) == 0) {
			var dms = new SAEO_DMS();
			var f = dms.DMS2ADF(l);
			if (f !== null) {
				var data = SAEF_ZFile_getdata(f, 0, -1);
				file.name = SAEF_ZFile_getname(f);
				file.data = SAEF_Array2String(data);
				file.size = SAEF_ZFile_size(f);
				file.prot = false;
				return f;
			}
		}
		else if (SAEF_CompareArray(l.data, [0x00,0x00,0x03,0xf3,0x00,0x00,0x00,0x00], 8) == 0) {
			var f = SAER.disk.EXE2ADF(l);
			if (f !== null) {
				var data = SAEF_ZFile_getdata(f, 0, -1);
				file.name = SAEF_ZFile_getname(f);
				file.data = SAEF_Array2String(data);
				file.size = SAEF_ZFile_size(f);
				file.prot = false;
				return f;
			}
		}
		return l;
	}
	return null;
}

function SAEF_ZFile_fclose(f) {
	if (!f)
		return;
	if (f.opencnt < 0) {
		SAEF_warn("SAEF_ZFile_fclose() tried to free already closed filehandle!");
		return;
	}
	f.opencnt--;
	if (f.opencnt > 0)
		return;
	f.opencnt = -100;

	SAEF_ZFile_free(f);
}

/*---------------------------------*/

function SAEF_ZFile_iscompressed(z) {
	return false; //z.data !== null ? 1 : 0; //ATT
}

/*---------------------------------*/

/*function SAEF_ZFile_truncate(z, size) {
	if (size < z.size) {
		z.size = size;
		if (z.size < z.datasize)
			z.datasize = z.size;
		if (z.size < z.seek)
			z.seek = z.size;
		return 1;
	}
	return 0;
}*/

function SAEF_ZFile_resize(z, newsize) { //OWN
	if (newsize > z.allocsize) {
		z.allocsize = newsize;

		SAEF_log("SAEF_ZFile_resize() increase %d -> %d bytes", z.size, z.allocsize);

		var tmp = new Uint8Array(z.allocsize);
		tmp.set(z.data);
		z.data = tmp;
		z.datasize = z.size = newsize;
		return 1;
	}
	if (newsize < z.allocsize) {
		z.allocsize = newsize;

		SAEF_log("SAEF_ZFile_resize() decrease %d -> %d bytes", z.size, z.allocsize);

		var tmp = new Uint8Array(z.allocsize);
		tmp.set(z.data.subarray(0, z.allocsize));
		z.data = tmp;
		z.datasize = z.size = newsize;
		return 1;
	}
	return 0;
}

function SAEF_ZFile_size(z) {
	return z.size;
}

/*---------------------------------*/

function SAEF_ZFile_ftell(z) {
	return z.seek;
}

function SAEF_ZFile_fseek(z, offset, mode) {
	var ret = 0;
	switch (mode) {
		case SEEK_SET:
			z.seek = offset;
			break;
		case SEEK_CUR:
			z.seek += offset;
			break;
		case SEEK_END:
			z.seek = z.size + offset;
			break;
	}
	if (z.seek < 0) {
		z.seek = 0;
		ret = 1;
	}
	if (z.seek > z.size) {
		z.seek = z.size;
		ret = 1;
	}
	return ret;
}

/*---------------------------------*/

/*function SAEF_ZFile_fread(b,bo, l1, l2, z) {
	var l = l1 * l2;
	if (z.datasize < z.size && z.seek + l > z.datasize) {
		SAEF_warn("SAEF_ZFile_fread() read beyond size");
		return 0;
	}
	if (z.seek + l > z.size) {
		l2 = l1 ? Math.truncate((z.size - z.seek) / l1) : 0;
		if (l2 < 0) l2 = 0;
		l = l1 * l2;
	}
	//memcpy(b, z.data + z.seek, l1 * l2);
	if (typeof b === "string") {
		SAEF_warn("SAEF_ZFile_fread() string");
		return 0;
	} else {
		var o = z.seek;
		if (typeof z.data === "string") {
			while (l-- > 0)
				b[bo++] = z.data.charCodeAt(o++);
		} else {
			while (l-- > 0)
				b[bo++] = z.data[o++];
		}
	}
	z.seek += l1 * l2;
	return l2;
}

function SAEF_ZFile_fwrite(b,bo, l1, l2, z) {
	var off = z.seek + l1 * l2;
	if (z.allocsize == 0) {
		SAEF_warn("SAEF_ZFile_fwrite() allocsize == 0, aborting...");
		return 0;
	}
	if (off > z.allocsize) {
		//if (z.allocsize < off)
		z.allocsize = off;
		z.allocsize += Math.floor(z.size / 2);
		if (z.allocsize < 10000)
			z.allocsize = 10000;

		SAEF_log("SAEF_ZFile_fwrite() relocate %d -> %d bytes", z.size, z.allocsize);
		var tmp = new Uint8Array(z.allocsize);
		tmp.cpy(z.data, z.size);
		z.data = tmp;
		z.datasize = z.size = off;
	}
	//memcpy(z.data + z.seek, b, l1 * l2);
	if (typeof b === "string") {
		SAEF_warn("SAEF_ZFile_fwrite() string");
		return 0;
	} else {
		var l = l1 * l2;
		if (typeof z.data === "string") {
			var txt = "", len = l;
			while (l-- > 0) txt += String.fromCharCode(b[bo++]);
			var tmp = z.data.substr(0, z.seek) + txt + z.data.substr(z.seek + len);
			z.data = tmp;
		} else {
			var o = z.seek;
			while (l-- > 0)
				z.data[o++] = b[bo++];
		}
	}
	z.seek += l1 * l2;
	if (z.seek > z.size)
		z.size = z.seek;
	if (z.size > z.datasize)
		z.datasize = z.size;
	return l2;
}*/

function SAEF_ZFile_fread(b,bo, l1, l2, z) {
	if (z.datasize < z.size && z.seek + l1 * l2 > z.datasize) {
		SAEF_warn("SAEF_ZFile_fread() read beyond size");
		return 0;
	}
	if (z.seek + l1 * l2 > z.size) {
		l2 = l1 ? Math.truncate((z.size - z.seek) / l1) : 0;
		if (l2 < 0) l2 = 0;
	}
	b.set(z.data.subarray(z.seek, z.seek + l1 * l2), bo); //memcpy (b, z.data + z.offset + z.seek, l1 * l2);
	z.seek += l1 * l2;
	return l2;
}

function SAEF_ZFile_fwrite(b,bo, l1, l2, z) {
	var off = z.seek + l1 * l2; //s64
	if (z.allocsize == 0) {
		SAEF_warn("SAEF_ZFile_fwrite() allocsize == 0, aborting...");
		return 0;
	}
	if (off > z.allocsize) {
		if (z.allocsize < off)
			z.allocsize = off;
		z.allocsize += (z.size >> 1);
		if (z.allocsize < 10000)
			z.allocsize = 10000;

		//z.data = xrealloc (uae_u8, z.data, z.allocsize);

		SAEF_log("SAEF_ZFile_fwrite() relocate %d -> %d bytes", z.size, z.allocsize);
		var tmp = new Uint8Array(z.allocsize);
		tmp.set(z.data);
		z.data = tmp;

		z.datasize = z.size = off;
	}

	z.data.set(b.subarray(bo, bo + l1 * l2), z.seek); //memcpy (z.data + z.seek, b, l1 * l2);

	z.seek += l1 * l2;
	if (z.seek > z.size)
		z.size = z.seek;
	if (z.size > z.datasize)
		z.datasize = z.size;
	return l2;
}

/*---------------------------------*/

/*function SAEF_ZFile_ferror(z) {
	return 0;
}*/

function SAEF_ZFile_getdata(z, offset, len) {
	var pos = SAEF_ZFile_ftell(z);
	if (len < 0) {
		SAEF_ZFile_fseek(z, 0, SEEK_END);
		len = SAEF_ZFile_ftell(z);
		SAEF_ZFile_fseek(z, 0, SEEK_SET);
	}
	var b = new Uint8Array(len);
	SAEF_ZFile_fseek(z, offset, SEEK_SET);
	SAEF_ZFile_fread(b,0, len, 1, z);
	SAEF_ZFile_fseek(z, pos, SEEK_SET);
	return b;
}

function SAEF_ZFile_getname(f) {
	return f ? f.name : null;
}

function SAEF_ZFile_getoriginalname(f) {
	return f ? f.originalname : null;
}

function SAEF_ZFile_getfilename(f) {
	/*if (!f.name.length)
		return null;
	for (var i = f.name.length - 1; i >= 0; i--) {
		if (f.name[i] == '\\' || f.name[i] == '/' || f.name[i] == ':') {
			i++;
			return &f.name[i];
		}
	}*/
	return f.name;
}

/*---------------------------------*/

function SAEF_ZFile_crc32(f) {
	if (f === null)
		return 0;
	//if (f.dataBuffer)
		return SAEF_crc32(f.data,0, f.size);

	/*var pos = SAEF_ZFile_ftell (f);
	SAEF_ZFile_fseek (f, 0, SEEK_END);
	var size = SAEF_ZFile_ftell (f);
	var p = xmalloc (uae_u8, size);
	if (!p)
		return 0;
	memset (p, 0, size);
	SAEF_ZFile_fseek (f, 0, SEEK_SET);
	SAEF_ZFile_fread (p, 1, size, f);
	SAEF_ZFile_fseek (f, pos, SEEK_SET);
	var crc = p.crc32(size);
	xfree (p);
	return crc;*/
}

/*-----------------------------------------------------------------------*/
/*-----------------------------------------------------------------------*/
/*-----------------------------------------------------------------------*/
/* some testing stuff */

function CreateEvent(lpEventAttributes, bManualReset, bInitialState, lpName) {
	var hEvent = new uae_sem_t();
	hEvent.manual = bManualReset != 0;
	hEvent.signaled = bInitialState != 0;
	return hEvent;
}

function SetEvent(hEvent) {
	hEvent.signaled = true;
	return true;
}

function ResetEvent(hEvent) {
	hEvent.signaled = false;
	return true;
}

const INFINITE = 0xFFFFFFFF;
const WAIT_ABANDONED = 0x00000080;
const WAIT_OBJECT_0 = 0x00000000;
const WAIT_TIMEOUT = 0x00000102;
const WAIT_FAILED = 0xFFFFFFFF;

function WaitForSingleObject(hEvent, dwMilliseconds) {
	if (!hEvent.signaled) {
		if (dwMilliseconds == INFINITE) {
			var cnt = 0;
			while (!hEvent.signaled && cnt++ < 200)
				SAEF_sleep(5);
		}
		else if (dwMilliseconds > 0)
			SAEF_sleep(dwMilliseconds);
	}
	if (hEvent.signaled) {
		if (!hEvent.manual) //&& waiting > 0
			ResetEvent(hEvent);

		return WAIT_OBJECT_0;
	}
	return WAIT_TIMEOUT;
}

/*---------------------------------*/

function uae_sem_init(event, manual_reset, initial_state) {
	if (event.handle) {
		if (initial_state)
			SetEvent(event.handle);
		else
			ResetEvent(event.handle);
	} else
		event.handle = CreateEvent(null, manual_reset, initial_state, null);
}

function uae_sem_wait(event) {
	WaitForSingleObject(event.handle, INFINITE);
}

function uae_sem_post(event) {
	SetEvent(event.handle);
}

/*function uae_sem_trywait(event) {
	return WaitForSingleObject(event.handle, 0) == WAIT_OBJECT_0 ? 0 : -1;
}*/

/*function uae_sem_destroy(event) {
	if (event.handle) {
		//CloseHandle(event);
		event.handle = null;
	}
}*/

/*---------------------------------*/

//typedef HANDLE uae_sem_t;
//typedef HANDLE uae_thread_id;
function uae_sem_t() {
	this.value = null;
	this.manual = false;
	this.signaled = false;
}

/*typedef union {
	int i;
	uae_u32 u32;
	void *pv;
} uae_pt;*/

function smp_comm_pipe() {
	//this.lock = new uae_sem_t();
	//this.reader_wait = new uae_sem_t();
	//this.writer_wait = new uae_sem_t();
	this.lock = { handle:null };
	this.reader_wait = { handle:null };
	this.writer_wait = { handle:null };
	this.data = null; //uae_pt *
	this.dataView = null; //OWN
	this.size = 0;
	this.chunks = 0;
	this.rdp = 0; //volatile
	this.wrp = 0; //volatile
	this.reader_waiting = 0; //volatile
	this.writer_waiting = 0; //volatile
}

function init_comm_pipe(p, size, chunks) {
	//p.data = (uae_pt *)malloc (size*sizeof (uae_pt));
	p.lock = { handle:null };
	p.reader_wait = { handle:null };
	p.writer_wait = { handle:null };
	p.data = new ArrayBuffer(size * 4);
	p.dataView = new DataView(p.data);
	p.size = size;
	p.chunks = chunks;
	p.rdp = p.wrp = 0;
	p.reader_waiting = 0;
	p.writer_waiting = 0;
	uae_sem_init(p.lock, 0, 1);
	uae_sem_init(p.reader_wait, 0, 0);
	uae_sem_init(p.writer_wait, 0, 0);
}

/*function destroy_comm_pipe(p) {
	uae_sem_destroy(p.lock);
	uae_sem_destroy(p.reader_wait);
	uae_sem_destroy(p.writer_wait);
}*/

/*function comm_pipe_has_data(p) {
	return p.rdp != p.wrp;
}*/

function read_comm_pipe_pt_blocking(p, type) {
	var data;

	uae_sem_wait(p.lock);
	if (p.rdp == p.wrp) {
		/* Pipe empty */
		p.reader_waiting = 1;
		uae_sem_post(p.lock);
		uae_sem_wait(p.reader_wait);
		uae_sem_wait(p.lock);
	}
	switch (type) {
		case 1: data = p.dataView.getInt32(p.rdp << 2, false); break;
		case 2:
		case 3: data = p.dataView.getUint32(p.rdp << 2, false); break;
	}
	p.rdp = (p.rdp + 1) % p.size;

	/* We ignore chunks here. If this is a problem, make the size bigger in the init call. */
	if (p.writer_waiting) {
		p.writer_waiting = 0;
		uae_sem_post(p.writer_wait);
	}
	uae_sem_post(p.lock);
	return data;
}
function read_comm_pipe_int_blocking(p) {
	//var foo = read_comm_pipe_pt_blocking(p); return foo.i;
	return read_comm_pipe_pt_blocking(p, 1);
}
function read_comm_pipe_u32_blocking(p) {
	//var foo = read_comm_pipe_pt_blocking(p); return foo.u32;
	return read_comm_pipe_pt_blocking(p, 2);
}
function read_comm_pipe_pvoid_blocking(p) {
	//var foo = read_comm_pipe_pt_blocking(p); return foo.pv;
	return read_comm_pipe_pt_blocking(p, 3);
}

function maybe_wake_reader(p, no_buffer) {
	if (p.reader_waiting && (no_buffer || ((p.wrp - p.rdp + p.size) % p.size) >= p.chunks)) {
		p.reader_waiting = 0;
		uae_sem_post(p.reader_wait);
	}
}
function write_comm_pipe_pt(p, type, data, no_buffer) {
	var nxwrp = (p.wrp + 1) % p.size;

	if (p.reader_waiting) {
		/* No need to do all the locking */
		switch (type) {
			case 1: p.dataView.setInt32(p.wrp << 2, data, SAEC_LITTLE_ENDIAN); break;
			case 2:
			case 3: p.dataView.setUint32(p.wrp << 2, data, SAEC_LITTLE_ENDIAN); break;
		}
		p.wrp = nxwrp;
		maybe_wake_reader(p, no_buffer);
		return;
	}
	uae_sem_wait(p.lock);
	if (nxwrp == p.rdp) {
		/* Pipe full */
		p.writer_waiting = 1;
		uae_sem_post(p.lock);
		uae_sem_wait(p.writer_wait);
		uae_sem_wait(p.lock);
	}
	switch (type) {
		case 1: p.dataView.setInt32(p.wrp << 2, data, SAEC_LITTLE_ENDIAN); break;
		case 2:
		case 3: p.dataView.setUint32(p.wrp << 2, data, SAEC_LITTLE_ENDIAN); break;
	}
	p.wrp = nxwrp;
	maybe_wake_reader(p, no_buffer);
	uae_sem_post(p.lock);
}
function write_comm_pipe_int(p, data, no_buffer) {
	//var foo; foo.i = data; write_comm_pipe_pt(p, foo, no_buffer);
	write_comm_pipe_pt(p, 1, data, no_buffer);
}
function write_comm_pipe_u32(p, data, no_buffer) {
	//var foo; foo.u32 = data; write_comm_pipe_pt(p, foo, no_buffer);
	write_comm_pipe_pt(p, 2, data, no_buffer);
}
function write_comm_pipe_pvoid (p, data, no_buffer) {
	//var foo; foo.pv = data; write_comm_pipe_pt(p, foo, no_buffer);
	write_comm_pipe_pt(p, 3, data, no_buffer);
}

/*-----------------------------------------------------------------------*/

//extern HANDLE AVTask;

//typedef unsigned (__stdcall *BEGINTHREADEX_FUNCPTR)(void *);

/*struct thparms {
	void *(*f)(void*);
	void *arg;
};

static unsigned __stdcall thread_init (void *f) {
	struct thparms *thp = (struct thparms*)f;
	void *(*fp)(void*) = thp->f;
	void *arg = thp->arg;

	xfree (f);

	__try {
		fp (arg);
	} __except (WIN32_ExceptionFilter (GetExceptionInformation (), GetExceptionCode ())) {}

	return 0;
}

void uae_end_thread (uae_thread_id *tid) {
	if (tid) {
		CloseHandle (*tid);
		*tid = NULL;
	}
}

STATIC_INLINE void uae_wait_thread (uae_thread_id tid)
{
    WaitForSingleObject (tid, INFINITE);
    CloseHandle (tid);
}

int uae_start_thread (const TCHAR *name, void *(*f)(void *), void *arg, uae_thread_id *tid) {
	HANDLE hThread;
	int result = 1;
	unsigned foo;
	struct thparms *thp;

	thp = xmalloc (struct thparms, 1);
	thp->f = f;
	thp->arg = arg;
	hThread = (HANDLE)_beginthreadex (NULL, 0, thread_init, thp, 0, &foo);
	if (hThread) {
		if (name) {
			//write_log (_T("Thread '%s' started (%d)\n"), name, hThread);
			if (!AVTask) {
				SetThreadPriority (hThread, THREAD_PRIORITY_HIGHEST);
			} else {
				AvSetMmThreadPriority(AVTask, AVRT_PRIORITY_HIGH);
			}
		}
	} else {
		result = 0;
		write_log (_T("Thread '%s' failed to start!?\n"), name ? name : _T("<unknown>"));
	}
	if (tid)
		*tid = hThread;
	else
		CloseHandle (hThread);
	return result;
}*/

/*int uae_start_thread_fast (void *(*f)(void *), void *arg, uae_thread_id *tid) {
	int v = uae_start_thread (NULL, f, arg, tid);
	if (*tid) {
		if (!AVTask) {
			SetThreadPriority (*tid, THREAD_PRIORITY_HIGHEST);
		} else {
			AvSetMmThreadPriority(AVTask, AVRT_PRIORITY_HIGH);
		}
	}
	return v;
}*/

/*DWORD_PTR cpu_affinity = 1, cpu_paffinity = 1;
void uae_set_thread_priority (uae_thread_id *tid, int pri) {
	#if 0
	int pri2;
	HANDLE th;

	if (tid)
		th = *tid;
	else
		th = GetCurrentThread ();
	pri2 = GetThreadPriority (th);
	if (pri2 == THREAD_PRIORITY_ERROR_RETURN)
		pri2 = 0;
	if (pri > 0)
		pri2 = THREAD_PRIORITY_HIGHEST;
	else
		pri2 = THREAD_PRIORITY_ABOVE_NORMAL;
	pri2 += pri;
	if (pri2 > 1)
		pri2 = 1;
	if (pri2 < -1)
		pri2 = -1;
	SetThreadPriority (th, pri2);
	#endif
	if (!AVTask) {
		if (!SetThreadPriority (GetCurrentThread(), THREAD_PRIORITY_HIGHEST))
			SetThreadPriority (GetCurrentThread(), THREAD_PRIORITY_ABOVE_NORMAL);
	} else {
		AvSetMmThreadPriority(AVTask, AVRT_PRIORITY_HIGH);
	}
}*/

/*-----------------------------------------------------------------------*/

