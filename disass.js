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
| Note: This file does not contain any emulator-code.
-------------------------------------------------------------------------*/

var sda = null; /* SDA instance */
var cfg = null; /* reference to the config-object */


var filesize = 0;

var showAddr = true;
var showCode = true;
var upperCase = false;

var result = [];

/*---------------------------------*/

function isHex(str) {
	var str_uc = str.toUpperCase();
	for (var i = 0; i < str_uc.length; i++) {
		var chr = str_uc.charCodeAt(i);
		if (!((chr >= 48 && chr <= 57) || (chr >= 65 && chr <= 70)))
			return false;
	}
	return true;
}

/*---------------------------------*/

function getSelectValue(id) {
	var e = document.getElementById(id);
	for (var i = 0; i < e.length; i++) {
		if (e[i].selected) return e[i].value;
	}
	return false;
}

/*---------------------------------*/

function loadFile(e, callback) {
	var reader = new FileReader();
	reader.onload = callback;
	reader.readAsBinaryString(e);
}

/*---------------------------------*/

function result2text() {
	var i, j, text = "";
	for (i = 0; i < result.length; i++) {
		var addr = result[i][0];
		var code = result[i][1];
		var words = result[i][2];
		var inst = result[i][3];

		if (showAddr)
			text += sprintf(upperCase ? "$%06X " : "$%06x ", addr);
		if (showCode) {
			for (j = 0; j < words; j++) text += sprintf(upperCase ? "%04X " : "%04x ", code[j]);
			//for (j = words; j < 5; j++) text += "&nbsp;&nbsp;&nbsp;&nbsp; ";
			for (j = words; j < 5; j++) text += "     ";
		}
		text += upperCase ? inst.toUpperCase() : inst;
		//text += "<br/>";
		text += "\n";

		if (addr + words*2 >= filesize) break;
	}
	return text;
}

/*---------------------------------*/

function init() {
	try {
		sda = new ScriptedDisAssembler();
		cfg = sda.getConfig(); /* reference to config */
		//console.log(cfg);
	} catch(e) {
		throw e;
	}
}

function disass() {
	try {
		result = sda.disassemble();
		//console.log(result);

		document.getElementById("disass_code").value = result2text();
		document.getElementById("disass_cfg").style.display = "table";
		document.getElementById("disass_code").style.display = "inline";
	} catch(e) {
		throw e;
	}
}

/*---------------------------------*/

function updFile() {
	var e = document.getElementById("cfg_file").files[0];
	if (!e) return;

	loadFile(e, function (event) {
		cfg.code = event.target.result;
		cfg.offset = 0;

		filesize = event.target.result.length;

		var fn = document.getElementById("cfg_filename");
		fn.className = "";
		fn.innerHTML = e.name;
		document.getElementById("cfg_offset").value = "0";

		disass();
	});
}

function updOffset() {
	var offset = document.getElementById("cfg_offset");
	if (isHex(offset.value)) {
		var newoffset = parseInt(offset.value, 16);

		if (newoffset < filesize) {
			cfg.offset = newoffset;
			disass();
		} else {
			alert(sprintf("The value at 'Offset' is behing the file-size. (max $%x)", filesize - 1));
			offset.focus();
		}
	} else {
		alert("The value at 'Offset' in not a hexadecimal number.");
		offset.focus();
	}
}

function updLimit() {
	var limit = document.getElementById("cfg_limit");
	//if (isDec(limit.value)) {
		cfg.limit = parseInt(limit.value);
		disass();
	/*} else {
		alert("The value at "Limit" in not a decimal number.");
		limit.focus();
	}*/
}

function updNext() {
	var addr = result[result.length - 1][0];
	var words = result[result.length - 1][2];

	cfg.offset = addr + words*2;
	document.getElementById("cfg_offset").value = sprintf("%x", cfg.offset);
	disass();
}

function updRadix() {
	cfg.radix = parseInt(getSelectValue("cfg_radix"));
	disass();
}
function updPrefx() {
	cfg.prefx = parseInt(getSelectValue("cfg_prefx")) == 1 ? "$" : "0x";
	disass();
}
function updWidth() {
	cfg.width = parseInt(getSelectValue("cfg_width"));
	disass();
}

function updCase() {
	upperCase = document.getElementById("cfg_case").checked;
	disass();
}

function updReloc() {
	cfg.reloc = document.getElementById("cfg_reloc").checked;
	disass();
}

function updShowAddr() {
	showAddr = document.getElementById("cfg_showAddr").checked;
	disass();
}
function updShowCode() {
	showCode = document.getElementById("cfg_showCode").checked;
	disass();
}
