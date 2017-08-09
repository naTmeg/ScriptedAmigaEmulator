/*-------------------------------------------------------------------------
| SAE - Scripted Amiga Emulator
| https://github.com/naTmeg/ScriptedAmigaEmulator
|
| Copyright (C) 2012-2016 Rupert Hausberger
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

const URL_DATABASE = "http://"+window.location.hostname+"/db";
const URL_DATABASE_GAMES = URL_DATABASE+"/games";
const URL_DATABASE_DEMOS = URL_DATABASE+"/demos";
const URL_DATABASE_DEMOS_AGA = URL_DATABASE+"/demos_aga";
const URL_DATABASE_TOOLS = URL_DATABASE+"/tools";

/*---------------------------------*/

/* dbEntry types */
const DBT_GAME = 1;
const DBT_DEMO = 2;
const DBT_DAGA = 3;
const DBT_TOOL = 4;

/* dbEntry flags */
const DBF_MDC = 1; /* require manual disk-change by user */
const DBF_NOT = 2; /* disable turbo-mode for floppies */
const DBF_COL = 4; /* enable collision-detection */
const DBF_BIM = 8; /* enable immediate blitter */
const DBF_ECS = 16; /* ECS required */
const DBF_AGA = 32; /* AGA required */
const DBF_030 = 64; /* 68030 enabled */

function dbEntry(t,nd, n,d,p,l,y, f,no) {
	this.id = Math.random() * 0xffffffff >>> 0;

	this.type = t;
	this.numdisks = nd;

	this.name = n;
	this.developer = d;
	this.publisher = p;
	this.license = l;
	this.year = y;

	this.flags = f;
	this.notes = no;
}

const DB_IDS = [[
	"cfg_game",
	"cfg_demo",
	"cfg_demo_aga",
	"cfg_tool"
], [
	"cfg_floppy_select_game",
	"cfg_floppy_select_demo",
	"cfg_floppy_select_demo_aga",
	"cfg_floppy_select_tool"
]];
const DB_URLS = [
	URL_DATABASE_GAMES,
	URL_DATABASE_DEMOS,
	URL_DATABASE_DEMOS_AGA,
	URL_DATABASE_TOOLS
];

/*---------------------------------*/

function mkA(url, name) { return '<a target="_blank" href="'+url+'">'+name+'</a>'; }

const URL_ENABLE_SOFTWARE = mkA("http://blockyskies.com", "Enable Software");
const URL_TEAM_HOI = mkA("http://www.sevensheaven.nl", "Team Hoi");
const URL_RETROGURU = mkA("http://www.retroguru.com", "retroguru");
const URL_LOEWENSTEIN = mkA("http://www.richard-loewenstein.de", "Richard Löwenstein");
const URL_HECKMECK = mkA("http://heckmeck.de", "Alexander Grupe");

const URL_AROS = mkA("http://aros.org", "aros.org");
const URL_AROS_LIC = mkA("http://aros.org/license.html", "APL");
const URL_SYSINFO = mkA("http://sysinfo.d0.se", "Nic Wilson");

const db = [
	new dbEntry(DBT_GAME,1, "Air Ace II",         "SEUCK","","PD",                 "1989", 0, "Loading takes very long."),
	new dbEntry(DBT_GAME,1, "Asteroids",          "Vertical Developments","","PD", "1979", 0, ""),
	new dbEntry(DBT_GAME,1, "BlockySkies",        URL_ENABLE_SOFTWARE,"","FW",     "2016", 0, ""),
	new dbEntry(DBT_GAME,1, "Crazy Sue",          "Jumpshoe,Hironymous","","PD",   "1991", 0, "Loading can take some time."),
	new dbEntry(DBT_GAME,1, "Deluxe Galaga 2.4",  "Edgar Vigdal","","FW",          "1994", DBF_COL, ""),
	new dbEntry(DBT_GAME,2, "Hoi",                URL_TEAM_HOI,"Hollyware","FW",   "1992", DBF_MDC, "Press the LMB to skip the intro and insert the 2nd disk manually.<br /><br /><span title=\"After the disk-change, place the \"LVL\"-pointer in the far lower right of the green quarter screen. The bottom \"L\" must be positioned in the corner precisely. Click the LMB, then shift the \"LVL\" pointer to the absolute top left of the screen (as far as it can be moved in that direction). Click the LMB again. Any of the first four levels may now be selected for game play. Press the F4 key during game play for twelve lives. Note: Level 5 can only be accessed by completing level 4.\">Cheat (move mouse-over)</span>"),
	new dbEntry(DBT_GAME,1, "Norse Gods",         URL_LOEWENSTEIN,"","FW",         "1991", 0, ""),
	new dbEntry(DBT_GAME,1, "Pollymorf",          "Andrew Campbell","","PD",       "1993", 0, "Loading takes some time, just wait."),
	new dbEntry(DBT_GAME,1, "Sqrxz",              URL_RETROGURU,"","FW",           "2012", 0, "The color-stripes are normal, just wait..."),
	new dbEntry(DBT_GAME,1, "Sqrxz 2",            URL_RETROGURU,"","FW",           "2012", 0, "After the start, click the RMB for the trainer menu. The color-stripes are normal, just wait..."),
	new dbEntry(DBT_GAME,1, "Super Obliteration", "David Papworth","","FW",        "1993", 0, ""),
	new dbEntry(DBT_GAME,1, "Tanx",               "Robertz Gaz","","PD",           "1991", 0, ""),
	new dbEntry(DBT_GAME,1, "Zerosphere",         URL_HECKMECK,"","FW",            "2015", 0, ""),

	new dbEntry(DBT_DEMO,1, "242",                "Virtual Dreams","","",          "1992", 0, ""),
	new dbEntry(DBT_DEMO,2, "9 Fingers",          "Spaceballs","","",              "1993", DBF_NOT, ""),
	new dbEntry(DBT_DEMO,1, "Alpha and Omega",    "Pure Metal Coders","","",       "1991", DBF_NOT, ""),
	new dbEntry(DBT_DEMO,1, "Copper Master",      "Angels","","",                  "1990", 0, ""),
	new dbEntry(DBT_DEMO,1, "Deja Vu",            "Anarchy","","",                 "1992", 0, ""),
	new dbEntry(DBT_DEMO,1, "Ecliptica",          "TRSI","","",                    "1991", DBF_ECS, "The blue flashing in the beginning is normal. Just wait..."),
	new dbEntry(DBT_DEMO,1, "Elysium",            "Sanity","","",                  "1991", 0, ""),
	new dbEntry(DBT_DEMO,1, "Enigma",             "Phenomena","","",               "1991", 0, ""),
	new dbEntry(DBT_DEMO,1, "Global Trash",       "Silents","","",                 "1992", 0, ""),
	new dbEntry(DBT_DEMO,2, "Hardwired",          "Crionics, Silents","","",       "1992", DBF_MDC|DBF_BIM, "Insert the 2nd disk manually and click the RMB when done."),
	new dbEntry(DBT_DEMO,1, "HipHop Hater",       "Mathias Olsson","","",          "1991", 0, ""),
	new dbEntry(DBT_DEMO,1, "Ice",                "Silents","","",                 "1991", 0, "Press the LMB at the intro-screen."),
	new dbEntry(DBT_DEMO,1, "Lost World",         "Balance DK","","",              "1992", 0, "Press the LMB at the intro-screen."),
	new dbEntry(DBT_DEMO,1, "Mental Hangover",    "Scoopex","","",                 "1992", 0, ""),
	new dbEntry(DBT_DEMO,1, "Multica",            "Andromeda","","",               "1992", 0, "Press the LMB at the intro-screen."),
	new dbEntry(DBT_DEMO,1, "Project-X (demo rolling)", "Team 17","","",           "1992", 0, "Press 'Fire' to skip to the 2nd level anytime."),
	new dbEntry(DBT_DEMO,1, "Rampage",            "TEK","","",                     "1994", DBF_NOT, "Press the LMB at the intro-screen."),
	new dbEntry(DBT_DEMO,1, "State of the Art",   "Spaceballs","","",              "1992", 0, ""),
	new dbEntry(DBT_DEMO,1, "Static Chaos",       "Silents","","",                 "1992", 0, ""),
	new dbEntry(DBT_DEMO,1, "Technological Death","Mad Elks","","",                "1993", DBF_BIM, ""),
	new dbEntry(DBT_DEMO,1, "Total Destruction",  "Crionics","","",                "1990", 0, ""),
	new dbEntry(DBT_DEMO,1, "Wayfarer",           "Spaceballs","","",              "1992", 0, ""),
	new dbEntry(DBT_DEMO,1, "World of Commodore", "Sanity","","",                  "1992", 0, ""),

	new dbEntry(DBT_DAGA,1, "Atome",              "Skarla","","",                        "1996", DBF_AGA|DBF_030, ""),
	new dbEntry(DBT_DAGA,2, "Burning Chrome",     "Haujobb","","",                       "1996", DBF_AGA|DBF_030, "Open the disk AC1: by double-click and then double-click 'BurningChrome' <b>once</b>."),
	new dbEntry(DBT_DAGA,1, "C42",                "Case, Groo, Juliet","","",            "1995", DBF_AGA|DBF_030, ""),
	new dbEntry(DBT_DAGA,2, "Control",            "Oxygene","","",                       "1995", DBF_AGA|DBF_030|DBF_MDC, "When asked, insert the 2nd disk manually."),
	new dbEntry(DBT_DAGA,1, "Crazy Sexy Cool",    "Essence","","",                       "1995", DBF_AGA|DBF_030, ""),
	new dbEntry(DBT_DAGA,2, "Deep",               "CNCD &amp; Parallax","","",           "1995", DBF_AGA, ""),
	new dbEntry(DBT_DAGA,1, "Friday at Eight",    "Polka Brothers","","",                "1994", DBF_AGA, ""),
	new dbEntry(DBT_DAGA,1, "Full Moon",          "Virtual Dreams, Fairlight","","",     "1993", DBF_AGA, ""),
	new dbEntry(DBT_DAGA,1, "Gevalia",            "Polka Brothers","","",                "1994", DBF_AGA, ""),
	new dbEntry(DBT_DAGA,1, "Nexus 7",            "Andromeda","","",                     "1994", DBF_AGA|DBF_030, ""),
	new dbEntry(DBT_DAGA,1, "Not Again",          "Sanity, Complex, Avena, Lego","","",  "1992", DBF_AGA, "Press the RMB to get to the next section anytime."),
	new dbEntry(DBT_DAGA,2, "Origin",             "Complex","","",                       "1993", DBF_AGA|DBF_NOT, ""),
	new dbEntry(DBT_DAGA,1, "Real",               "Complex","","",                       "1994", DBF_AGA|DBF_NOT, "In the last 3d-scene, hold the LMB to rotate and the RMB to walk around. (the scene which does have graphics errors)"),
	new dbEntry(DBT_DAGA,1, "Roots",              "Sanity","","",                        "1994", DBF_AGA, ""),
	new dbEntry(DBT_DAGA,2, "Switchback",         "Rebels","","",                        "1994", DBF_AGA|DBF_030, ""), /* 68030 */
	new dbEntry(DBT_DAGA,4, "Twisted",            "Polka Brothers","","",                "1994", DBF_AGA, ""),
	new dbEntry(DBT_DAGA,2, "Vision",             "Oxygene","","",                       "1995", DBF_AGA, ""),
	new dbEntry(DBT_DAGA,4, "Wild",               "Anadune, Nah Color","","",            "1996", DBF_MDC|DBF_AGA, "When asked, change the disks manually."),

	new dbEntry(DBT_TOOL,1, "AROS Bootdisk",      URL_AROS,"",URL_AROS_LIC,        "2016", 0, "Press 'Cancel' when asked for a Live-CD."),
	new dbEntry(DBT_TOOL,1, "AIBB 6.5",           "Peter LaMonte Koop","","FW",    "1993", 0, "Type 'aibb' at the console. Be very patient at the 'Evaluating System...' screen."),
	new dbEntry(DBT_TOOL,1, "SysInfo 4.0",        URL_SYSINFO,"","FW",             "2012", 0, "Type 'sysinfo' (y=z) at the console."),
	new dbEntry(DBT_TOOL,1, "X-Copy 2.0",         "Cachet","","FW",                "1989", 0, "")
];

var dbUrl = "";
var dbGrp = 0;
var dbNum = 0;

/*---------------------------------*/

const AROS_ROM_FILE = "aros-amiga-m68k-rom.bin";
const AROS_ROM_CRC = 0xE8A40832; /* also edit roms.js on change */
const AROS_EXT_FILE = "aros-amiga-m68k-ext.bin";
const AROS_EXT_CRC = 0x5C39D820;

/*---------------------------------*/

const MAX_FILENAME = 40;

const MODE_Database = 0;
const MODE_Advanced = 1;
var mode = MODE_Database; /* current mode */

/* page-ids in the advanced-mode */
const PID_None = 0;
const PID_Model = 1;
const PID_CPU = 2;
const PID_Chipset = 3;
const PID_RAM = 4;
const PID_ROM = 5;
const PID_ROM_Info = 6;
const PID_Floppy = 7;
const PID_Floppy_Info = 8;
const PID_Mount = 9;
const PID_Mount_Setup = 10;
const PID_Video = 11;
const PID_Audio = 12;
const PID_Ports = 13;
var page = PID_None; /* current page in the advanced-config */

var useAROS = false; /* use AROS in the advanced-config */
var romNum = -1; /* current rom-id if rom-info is shown  */
var defRomInfo = null; /* kickstart rom-info */
var defRomEncrypted = null; /* kickstart-rom is encrypted */
var extRomInfo = null; /* extended rom-info */
var extRomEncrypted = null; /* extended-rom is encrypted */
var romKeyInfo = null; /* romkey-info */
var amaxInfo = null; /* amax rom-info */
var floppyNum = -1; /* current floppy-unit if floppy-info is shown  */
var mountConfigNum = -1; /* current mount-unit if mount-info is shown  */
var paused = false; /* is the emualtion currently paused? */
var muted = false; /* is the audio-output currently muted? */

var dskchg = false; /* disk-change requester in database-mode */
var dskchgList = []; /* list of floppies to change, created dynamicaly */

var cache = null; /* asynchronous file-cache */

/*---------------------------------*/

var sae = null; /* SAE instance */
var cfg = null; /* reference to the config-object */
var inf = null; /* reference to the info-object */

/*-----------------------------------------------------------------------*/
/* utils */

function decodeURL(url) {
	return decodeURIComponent(url.replace(/\+/g, " "));
}
/*function addItemToURL() {
	if (mode == MODE_Database) {
		var dbe = dbNum > 0 ? db[dbNum - 1] : null;
		if (dbe !== null) {
			var name = dbe.name;
			while (true) {
				var tmp = name.replace(" ", "_");
				if (tmp == name) break;
				name = tmp;
			}
			window.location.hash = name;
		} else
			window.location.hash = "";
	} else
		window.location.hash = "";
}*/

/*---------------------------------*/
/* CRC-32 checksumming */

const crc32Table = (function() {
	var table = new Uint32Array(256);
	var n, c, k;

	for (n = 0; n < 256; n++) {
		c = n;
		for (k = 0; k < 8; k++)
			c = ((c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)) >>> 0;
		table[n] = c;
	}
	return table;
})();

function crc32(data) {
	var length = data.length;
	var offset = 0;
	var crc = 0xffffffff;

	while (length-- > 0)
		crc = crc32Table[(crc ^ data.charCodeAt(offset++)) & 0xff] ^ (crc >>> 8);

	return (crc ^ 0xffffffff) >>> 0;
}

if (crc32("The quick brown fox jumps over the lazy dog") != 0x414fa339)
	alert("CRC32-hash testing failed. SAE will not work. This is an internal bug!?");

/*---------------------------------*/

function isDecKey(event, signed) {
	if (signed === true)
		return (event.charCode >= 48 && event.charCode <= 57) || event.charCode == 45;
	else
		return event.charCode >= 48 && event.charCode <= 57;
}

function isHexKey(event) {
	return (
		(event.charCode >= 48 && event.charCode <= 57) || //0-9
		(event.charCode >= 65 && event.charCode <= 70) || //A-F
		(event.charCode >= 97 && event.charCode <= 102) //a-f
	);
}

function setDisabled(id, d) {
	document.getElementById(id).disabled = d;
}
function setInnerHTML(id, t) {
	document.getElementById(id).innerHTML = t;
}

/*---------------------------------*/
/* checkbox-input */

function getCheckbox(id) {
	return document.getElementById(id).checked;
}
function setCheckbox(id, checked) {
	document.getElementById(id).checked = checked;
}

/*---------------------------------*/
/* select-input */

function getSelect(id, asString) {
	if (typeof asString == "undefined") asString = false;
	var e = document.getElementById(id);
	for (var i = 0; i < e.length; i++) {
		if (e[i].selected)
			return asString ? e[i].value : Number(e[i].value);
	}
	//alert(sprintf("getSelect() ERROR id '%s'", id));
	return false;
}

function setSelect(id, v) {
	var e = document.getElementById(id);
	/*for (var i = 0; i < e.length; i++) {
		if (e[i].selected) {
			e[i].selected = false;
			break;
		}
	}*/
	var vs = String(v);
	for (var i = 0; i < e.length; i++) {
		if (e[i].value === vs) {
			e[i].selected = true;
			//break;
			return;
		}
	}
	//alert(sprintf("setSelect() ERROR id '%s', value '%s'", id, vs));
}

/*---------------------------------*/
/* radio-input */

function getRadio(name, asString) {
	if (typeof asString == "undefined") asString = false;
	var e = document.getElementsByName(name);
	for (var i = 0; i < e.length; i++) {
		if (e[i].checked)
			return asString ? e[i].value : Number(e[i].value);
	}
	//alert(sprintf("getRadio() ERROR name '%s'", name));
	return false;
}

function setRadio(name, v) {
	var e = document.getElementsByName(name);
	for (var i = 0; i < e.length; i++) {
		if (e[i].checked)
			e[i].checked = false;
	}
	var vs = String(v);
	for (var i = 0; i < e.length; i++) {
		if (e[i].value === vs) {
			e[i].checked = true;
			return;
		}
	}
	//alert(sprintf("setRadio() ERROR name '%s', value '%s'", name, vs));
}

/*---------------------------------*/
/* text-input */

function getText(id, asString) {
	if (typeof asString == "undefined") asString = false;
	var e = document.getElementById(id);
	return asString ? e.value : Number(e.value);
}

function setText(id, v) {
	document.getElementById(id).value = typeof v === "string" ? v : String(v);
}

function setText2(id, v) {
	document.getElementById(id).innerHTML = typeof v === "string" ? v : String(v);
}

/*---------------------------------*/
/* style-display */

function styleDisplayBlock(id, show) {
	var e = document.getElementById(id);
	e.style.display = show ? "block" : "none";
}
function styleDisplayInline(id, show) {
	var e = document.getElementById(id);
	e.style.display = show ? "inline" : "none";
}
function styleDisplayTable(id, show) {
	var e = document.getElementById(id);
	e.style.display = show ? "table" : "none";
}
function styleDisplayTableRow(id, show) {
	var e = document.getElementById(id);
	e.style.display = show ? "table-row" : "none";
}
function styleDisplayTableCell(id, show) {
	var e = document.getElementById(id);
	e.style.display = show ? "table-cell" : "none";
}

/*---------------------------------*/

function freezeButtons(f, l) {
	if (f) {
		if (mode == MODE_Database) {
			setDisabled("cfg_database_start", 1);
			setInnerHTML("cfg_database_start", "Loading...");
			setDisabled("cfg_database_config", 1);
		} else {
			setDisabled("cfg_start", 1);
			if (l) setInnerHTML("cfg_start", "Loading...");
			//setDisabled("cfg_back", 1);
		}
	} else {
		if (mode == MODE_Database) {
			setDisabled("cfg_database_start", 0);
			setInnerHTML("cfg_database_start", "Start");
			setDisabled("cfg_database_config", 0);
		} else {
			setDisabled("cfg_start", 0);
			if (l) setInnerHTML("cfg_start", "Start");
			//setDisabled("cfg_back", 0);
		}
	}
}

function switchPauseResume(p) {
	var e = document.getElementById("controls_pr");
	if (p) {
		e.innerHTML = "Resume";
		e.onclick = function() { pause(false); };
	} else {
		e.innerHTML = "Pause";
		e.onclick = function() { pause(true); };
	}
}

function switchMutePlay(m) {
	var e = document.getElementById("controls_mp");
	if (m) {
		e.innerHTML = "Play";
		e.onclick = function() { mute(false); };
	} else {
		e.innerHTML = "Mute";
		e.onclick = function() { mute(true); };
	}
}

function switchBaseEmul(emul) {
	if (emul) {
		document.body.style.backgroundColor = "#000000";
		styleDisplayBlock("base", 0);
		styleDisplayBlock("emul", 1);
	} else {
		styleDisplayBlock("emul", 0);
		styleDisplayBlock("base", 1);
		document.body.style.backgroundColor = "#f8f8f8";
	}
}

/*---------------------------------*/

function fireButtonName(fire) {
	switch (fire) {
		case 0: return "None";
		case 16: return "Shift";
		case 17: return "Ctrl";
		case 13: return "Enter";
		case 32: return "Space";
		case 8: return "Backspace";
		case 96: return "Numpad 0";
		case 106: return "Numpad *";
		case 107: return "Numpad ";
		case 109: return "Numpad -";
		case 110: return "Numpad .";
		case 111: return "Numpad /";
		case 46: return "Delete";
		case 45: return "Insert";
		case 34: return "Page down";
		case 33: return "Page up";
		case 35: return "End";
		case 36: return "Home";
		case 19: return "Pause";
		case 144: return "Num lock";
		case 145: return "Scroll lock";
		case 49: return "1";
		case 50: return "2";
		default: return "ERROR";
	}
}

/*---------------------------------*/

function saee2text(err) {
	switch (err) {
		case SAEE_NotRunning:					return "The emulator is not running.";
		case SAEE_NoTimer:						return "No timing-functions avail. Please upgrade your browser.";
		case SAEE_NoMemory:						return "Out of memory.";
		case SAEE_Assert:							return "Assertiation failed.";
		case SAEE_Internal:						return "Internal emulator error.";
		case SAEE_Config_Invalid:				return "Invalid configuration.";
		case SAEE_Config_Compressed:			return "A ZIP file was detected. Compressed files are not yet supported.";
		case SAEE_CPU_Internal:					return "Internal CPU-error.";
		case SAEE_CPU_Requires68020:			return "The selected kickstart-rom does require a 68020 and 32bit address-space";
		case SAEE_CPU_Requires680EC20:		return "The selected kickstart-rom does require a 68020.";
		case SAEE_CPU_Requires68030:			return "The selected kickstart-rom does require a 68030.";
		case SAEE_CPU_Requires68040:			return "The selected kickstart-rom does require a 68040/68060.";
		case SAEE_Memory_NoKickstartRom:		return "The kickstart-rom is missing.";
		case SAEE_Memory_NoExtendedRom:		return "An extended-rom is required but missing.\n\nGo to the ROM-page and select a rom from disk...";
		case SAEE_Memory_RomSize:				return "The kickstart- or extended-rom does have an invalid size.";
		case SAEE_Memory_RomKey:				return "A ROM-keyfile is required. (Cloanto)";
		case SAEE_Memory_RomDecode:			return "Invalid ROM-keyfile. (Cloanto)";
		case SAEE_Memory_RomChecksum:			return "Checksum-error at the kickstart- or extended-rom.";
		case SAEE_Memory_RomUnknown:			return "Unknown ROM.";
		case SAEE_Video_ElementNotFound:		return "Video DIV-element not found. Check 'cfg.video.id'";
		case SAEE_Video_RequiresCanvas:		return "This browser does not support 'Canvas'. Please upgrade to an actual version.";
		case SAEE_Video_RequiresWegGl:		return "This browser does not support 'WebGL'. Please upgrade to an actual version.";
		case SAEE_Video_ComphileShader:		return "Can not compile the required shader-program.";
		case SAEE_Video_LinkShader:			return "Can not link the required shader-program.";
		case SAEE_Audio_RequiresWebAudio:	return "This browser does not support 'WebAudio'. Please upgrade to an actual version.";
		default: return "("+err+")";
	}
}

/*-----------------------------------------------------------------------*/
/* database */

function dbInit() {
	function addOption(select, text, value) {
		var option = document.createElement("option");
		if (text.length)
			option.text = text;
		option.value = String(value);
		if (value == 0) {
			option.style.fontWeight = "bold";
			option.disabled = "disabled";
		}
		select.add(option, null);
	}
	for (var dbt = 1; dbt <= 4; dbt++) {
		var s = document.getElementById(DB_IDS[0][dbt - 1]);
		for (var i = 0; i < db.length; i++) {
			if (db[i].type == dbt)
				addOption(s, db[i].name, 1 + i);
		}
	}
	for (var dbt = 1; dbt <= 4; dbt++) {
		var s = document.getElementById(DB_IDS[1][dbt - 1]);
		for (var i = 0; i < db.length; i++) {
			if (db[i].type == dbt) {
				if (!(db[i].flags & DBF_MDC)) /* skip items that require manual disk-change */
					addOption(s, db[i].name, 1 + i);
			}
		}
	}
}

function dbFindTypeNamePos(type, name) {
	for (var i = 0; i < db.length; i++) {
		if (db[i].type == type && db[i].name == name)
			return i;
	}
	return -1;
}

function dbFindId(id) {
	for (var i = 0; i < db.length; i++) {
		if (db[i].id == id)
			return db[i];
	}
	return null;
}

/*-----------------------------------------------------------------------*/
/* asynchronous file cache */

const S_PENDING = 1;
const S_ERROR = 2;
const S_VALID = 3;

function CacheItem(url) {
	this.state = S_PENDING;
	this.url = url;
	//this.path = "";
	this.name = "";
	this.data = "";
	this.size = 0;
	this.crc32 = 0;
}
function Cache() {
	var items = [];

	function find(url) {
		for (var i = 0; i < items.length; i++) {
			if (items[i].url == url)
				return items[i];
		}
		return false;
	}

	function load(url, handler) {
		var client = new XMLHttpRequest();
		client.onload = handler;
		client.open("GET", url);
		client.overrideMimeType("text\/plain; charset=x-user-defined"); /* we want binary data */
		client.send();
	}

	this.req = function(path, name, size, crc, dst) {
		var url = path + "/" + name;
		var item = null;

		if (dst !== false)
			dst.clr();

		if ((item = find(url)) !== false) {
			if (dst !== false) {
				//dst.path = item.path;
				dst.name = item.name;
				dst.data = item.data;
				dst.size = item.size;
				dst.crc32 = item.crc32;
			}
			//console.log("cache.req() '"+url+"' is cached.");
			return true;
		}
		item = new CacheItem(url);
		items.push(item);

		//console.log("cache.req() start downloading '"+url+"'...");

		load(url, function() {
			if (this.status == 200) {
				if (this.responseText.length == size) {
					/*if (crc !== false) {
						var hash = crc32(this.responseText);
						if (hash != crc) {
							item.state = S_ERROR;
							alert(sprintf("Wrong checksum for '%s'\n\n(should be $%08x, but is $%08x)\n\nTry to flush the browser-cache with 'Ctrl+Shift+Del' and press F5 to reload...", url, crc, hash));
							return;
						}
					}*/
					//item.path = path;
					item.name = name;
					item.data = this.responseText;
					item.size = size;
					item.crc32 = crc;
					item.state = S_VALID;
					if (dst !== false) {
						//dst.path = item.path;
						dst.name = item.name;
						dst.data = item.data;
						dst.size = item.size;
						dst.crc32 = item.crc32;
					}
					//console.log("cache.req() downloaded of '"+url+"' done.");
				} else {
					item.state = S_ERROR;
					alert(sprintf("Wrong file-length for '%s'\n\n(should be %d, but is %d)", url, size, this.responseText.length));
				}
			} else {
				item.state = S_ERROR;
				alert(sprintf("Error while downloading '%s' (http status: %d)", url, this.status));
			}
		});
		return false;
	}

	this.state = function() {
		for (var i = 0; i < items.length; i++) {
			if (items[i].state != S_VALID)
				return items[i].state;
		}
		return S_VALID;
	}
}

/*---------------------------------*/

function loadFile(e, callback) {
	var reader = new FileReader();
	reader.onload = callback;
	reader.readAsBinaryString(e);
}

/*-----------------------------------------------------------------------*/
/* database cfg */

function setDatabaseConfig() {
	//setSelect("cfg_video_resolution_1", cfg.video.hresolution);
	//setCheckbox("cfg_video_skip_1", cfg.video.framerate != 1);

	styleDisplayBlock("config_database", 1);
	styleDisplayTableCell("controls_disk", 0);
}

function getDatabaseEntryFilename(dbe, disk, adf) {
	if (dbe.numdisks == 1)
		return dbe.name + (adf ? ".adf" : "");
	else
		return dbe.name + " (Disk "+String(disk+1)+")" + (adf ? ".adf" : "");
}
function getDatabaseFloppy() {
	if (dbNum == 0) { /* nothing selected */
		for (var i = 0; i < 4; i++) {
			cfg.floppy.drive[i].type = i == 0 ? SAEC_Config_Floppy_Type_35_DD : SAEC_Config_Floppy_Type_None;
			cfg.floppy.drive[i].file.clr();
		}
		cfg.floppy.speed = SAEC_Config_Floppy_Speed_Original;
		return true;
	}

	if (typeof db[dbNum - 1] == "undefined") {
		//alert("bug!");
		return false;
	}
	var dbe = db[dbNum - 1];

	dskchgList = [];
	if (dbe.flags & DBF_MDC) { /* manual disk-change required */
		if (dbe.numdisks == 1)
			dskchgList.push(dbe.name);
		else {
			for (var n = 0; n < dbe.numdisks; n++)
				dskchgList.push(getDatabaseEntryFilename(dbe, n, false));
		}

		/* request DF0 immediately */
		cfg.floppy.drive[0].type = SAEC_Config_Floppy_Type_35_DD;
		var filename = getDatabaseEntryFilename(dbe, 0, true);
		cache.req(dbUrl, filename, 0xdc000, false, cfg.floppy.drive[0].file);

		/* precache DF1-DF3 for later */
		for (var n = 1; n < dbe.numdisks; n++) {
			cfg.floppy.drive[n].type = SAEC_Config_Floppy_Type_None; /* disable for now. will be enabled when a disk is inserted */
			cfg.floppy.drive[n].file.clr();

			filename = getDatabaseEntryFilename(dbe, n, true);
			cache.req(dbUrl, filename, 0xdc000, false, false);
		}
	} else { /* request all disks immediately */
		for (var n = 0; n < dbe.numdisks; n++) {
			var filename = getDatabaseEntryFilename(dbe, n, true);
			cfg.floppy.drive[n].type = SAEC_Config_Floppy_Type_35_DD;
			cache.req(dbUrl, filename, 0xdc000, false, cfg.floppy.drive[n].file);
		}
		for (var n = dbe.numdisks; n < 4; n++) {
			cfg.floppy.drive[n].type = SAEC_Config_Floppy_Type_None;
			cfg.floppy.drive[n].file.clr();
		}
	}
	cfg.floppy.speed = (dbe.flags & DBF_NOT) == 0 ? SAEC_Config_Floppy_Speed_Turbo : SAEC_Config_Floppy_Speed_Original;
	return true;
}

function getDatabaseConfig() {
	var dbe = dbNum > 0 ? db[dbNum - 1] : null;

	if (dbe !== null) {
		if (dbe.flags & DBF_AGA)
			sae.setModel(SAEC_Model_A1200, 0); /* set an A1200 for AGA */
		else if (dbe.flags & DBF_ECS)
			sae.setModel(SAEC_Model_A500P, 0); /* set an A500+ for ECS */
		else
			sae.setModel(SAEC_Model_A500, 0); /* set an A500 for OCS */

		if (dbe.flags & DBF_030)
			cfg.cpu.model = SAEC_Config_CPU_Model_68030;

		cfg.memory.z2FastSize = 4 << 20; /* give 4MB Zorro2 memory */

		cfg.chipset.colLevel = SAEC_Config_Chipset_ColLevel_None;
		if (dbe.flags & DBF_COL)
			cfg.chipset.colLevel = SAEC_Config_Chipset_ColLevel_Sprite_Playfield; /* enable collision-detection */

		if (dbe.flags & DBF_BIM)
			cfg.chipset.blitter.immediate = true;
	} else {
		sae.setModel(SAEC_Model_A500, 0);

		cfg.memory.z2FastSize = 4 << 20; /* give 4MB Zorro2 memory */
	}
	cache.req(URL_DATABASE, AROS_ROM_FILE, 0x80000, AROS_ROM_CRC, cfg.memory.rom);
	cache.req(URL_DATABASE, AROS_EXT_FILE, 0x80000, AROS_EXT_CRC, cfg.memory.extRom);

	if (!getDatabaseFloppy())
		return false;

	cfg.video.id = "myVideo"; /* html-div element to add video-output */

	/*cfg.video.hresolution = getSelect("cfg_video_resolution_1");
	if (cfg.video.hresolution == SAEC_Config_Video_HResolution_LoRes)
		cfg.video.vresolution = SAEC_Config_Video_VResolution_NonDouble;
	else
		cfg.video.vresolution = SAEC_Config_Video_VResolution_Double;

	cfg.video.framerate = getCheckbox("cfg_video_skip_1") ? 2 : 1;*/

	//cfg.video.size_win.width = SAEC_Video_DEF_AMIGA_WIDTH << cfg.video.hresolution;
	//cfg.video.size_win.height = SAEC_Video_DEF_AMIGA_HEIGHT << cfg.video.hresolution;

	setHooks();
	return true;
}

/*-----------------------------------------------------------------------*/
/* advanced cfg */

function setRomName() {
	var e = document.getElementById("cfg_rom_name");
	if (cfg.memory.rom.name.length) {
		if (defRomInfo !== null) {
			var name = defRomInfo.name;
			e.className = (defRomInfo.type & SAEC_RomType_ALL_KICK) ? "green" : "orange";
			setDisabled("cfg_rom_info", 0);
		} else {
			var name = cfg.memory.rom.name;
			e.className = "orange";
			setDisabled("cfg_rom_info", 1);
		}
		e.innerHTML = name.length > MAX_FILENAME ? name.substr(0, MAX_FILENAME)+" [...]" : name;

		styleDisplayInline("cfg_rom_remove", 1);
		styleDisplayInline("cfg_rom_info", 1);
	} else {
		e.className = "red";
		e.innerHTML = "&lt;unset&gt; (required)";
		styleDisplayInline("cfg_rom_remove", 0);
		styleDisplayInline("cfg_rom_info", 0);
		document.getElementById("cfg_rom_file").value = "";
	}
}

function setExtName() {
	var e = document.getElementById("cfg_ext_name");
	if (cfg.memory.extRom.name.length) {
		if (extRomInfo !== null) {
			var name = extRomInfo.name;
			e.className = (extRomInfo.type & SAEC_RomType_ALL_EXT) ? "green" : "orange";
			setDisabled("cfg_ext_info", 0);
		} else {
			var name = cfg.memory.extRom.name;
			e.className = "orange";
			setDisabled("cfg_ext_info", 1);
		}
		e.innerHTML = name.length > MAX_FILENAME ? name.substr(0, MAX_FILENAME)+" [...]" : name;

		styleDisplayInline("cfg_ext_remove", 1);
		styleDisplayInline("cfg_ext_info", 1);
	} else {
		e.className = "gray";
		e.innerHTML = "&lt;unset&gt;";
		styleDisplayInline("cfg_ext_remove", 0);
		styleDisplayInline("cfg_ext_info", 0);
		document.getElementById("cfg_ext_file").value = "";
	}
}

function setKeyName() {
	var e = document.getElementById("cfg_key_name");
	if (cfg.memory.romKey.name.length) {
		if (romKeyInfo !== null) {
			var name = romKeyInfo.name;
			e.className = (romKeyInfo.type & SAEC_RomType_KEY) ? "green" : "orange";
			setDisabled("cfg_key_info", 0);
		} else {
			var name = cfg.memory.romKey.name;
			e.className = "orange";
			setDisabled("cfg_key_info", 1);
		}
		e.innerHTML = name.length > MAX_FILENAME ? name.substr(0, MAX_FILENAME)+" [...]" : name;

		styleDisplayInline("cfg_key_remove", 1);
		styleDisplayInline("cfg_key_info", 1);
	} else {
		if (defRomEncrypted || extRomEncrypted) {
			e.className = "red";
			e.innerHTML = "&lt;unset&gt; (required)";
		} else {
			e.className = "gray";
			e.innerHTML = "&lt;unset&gt;";
		}
		styleDisplayInline("cfg_key_remove", 0);
		styleDisplayInline("cfg_key_info", 0);
		document.getElementById("cfg_key_file").value = "";
	}
}

function setAMaxName() {
	var e = document.getElementById("cfg_amax_name");
	if (cfg.memory.amaxRom.name.length) {
		if (amaxInfo !== null) {
			var name = amaxInfo.name;
			e.className = (amaxInfo.type & SAEC_RomType_AMAX) ? "green" : "orange";
			setDisabled("cfg_amax_info", 0);
		} else {
			var name = cfg.memory.amaxRom.name;
			e.className = "orange";
			setDisabled("cfg_amax_info", 1);
		}
		e.innerHTML = name.length > MAX_FILENAME ? name.substr(0, MAX_FILENAME)+" [...]" : name;

		styleDisplayInline("cfg_amax_remove", 1);
		styleDisplayInline("cfg_amax_info", 1);
	} else {
		e.className = "gray";
		e.innerHTML = "&lt;unset&gt;";
		styleDisplayInline("cfg_amax_remove", 0);
		styleDisplayInline("cfg_amax_info", 0);
		document.getElementById("cfg_amax_file").value = "";
	}
}

function setFloppyName(n) {
	var e = document.getElementById("cfg_df"+n+"_name");
	if (cfg.floppy.drive[n].file.size) {
		e.className = "";
		if (cfg.floppy.drive[n].file.name.length > MAX_FILENAME)
			e.innerHTML = cfg.floppy.drive[n].file.name.substr(0, MAX_FILENAME)+" [...]";
		else
			e.innerHTML = cfg.floppy.drive[n].file.name;
		styleDisplayInline("cfg_df"+n+"_eject", 1);
		styleDisplayInline("cfg_df"+n+"_info", 1);
	} else {
		e.className = "gray";
		e.innerHTML = "&lt;unset&gt;";
		styleDisplayInline("cfg_df"+n+"_eject", 0);
		styleDisplayInline("cfg_df"+n+"_info", 0);
	}
}

function setMountName(n) {
	var ci = cfg.mount.config[n].ci;
	var e = document.getElementById("cfg_mount_"+n+"_name");

	if (ci.file.name.length) {
		e.className = "";
		if (ci.file.name.length > MAX_FILENAME)
			e.innerHTML = ci.file.name.substr(0, MAX_FILENAME)+" [...]";
		else
			e.innerHTML = ci.file.name;

		styleDisplayInline("cfg_mount_"+n+"_remove", 1);
		if (n < 4) styleDisplayInline("cfg_mount_"+n+"_setup", 1);
	} else {
		e.className = "gray";
		e.innerHTML = "&lt;unset&gt;";
		styleDisplayInline("cfg_mount_"+n+"_remove", 0);
		if (n < 4) styleDisplayInline("cfg_mount_"+n+"_setup", 0);
	}
}

function setAdvandedFloppy(n) {
	if (cfg.floppy.drive[n].type != SAEC_Config_Floppy_Type_None) {
		setCheckbox("cfg_df"+n+"_enabled", true);
		setSelect("cfg_df"+n+"_type", cfg.floppy.drive[n].type);
		setCheckbox("cfg_df"+n+"_wp", cfg.floppy.drive[n].file.prot);
		setFloppyName(n);
		styleDisplayInline("cfg_df"+n+"_grp", 1);
	} else {
		setCheckbox("cfg_df"+n+"_enabled", false);
		styleDisplayInline("cfg_df"+n+"_grp", 0);
	}
}

function setAdvandedMount(n) {
	var ci = cfg.mount.config[n].ci;
	if (ci.controller_type != 0) {
		if (ci.controller_type == SAEC_Config_Mount_Controller_Type_MB_IDE) {
			setSelect("cfg_mount_"+n+"_controller_media", ci.controller_media_type);
			setSelect("cfg_mount_"+n+"_controller_level", ci.unit_feature_level);
		}
		if (ci.controller_type != SAEC_Config_Mount_Controller_Type_PCMCIA_IDE)
			setCheckbox("cfg_mount_"+n+"_readonly", ci.readonly);

		setMountName(n);
		setCheckbox("cfg_mount_"+n+"_enabled", true);
		styleDisplayInline("cfg_mount_"+n+"_grp", 1);
	} else {
		setCheckbox("cfg_mount_"+n+"_enabled", false);
		styleDisplayInline("cfg_mount_"+n+"_grp", 0);
	}
}

function fixAdvandedConfig() {
	/* video */
	if (cfg.video.enabled) {
		if (!inf.video.canvas && !inf.video.webGL)
			cfg.video.enabled = false;
		else if (SAEV_config.video.api == SAEC_Config_Video_API_WebGL && !inf.video.webGL)
			SAEV_config.video.api = SAEC_Config_Video_API_Canvas;
	}
	/* audio */
	if (cfg.audio.mode >= SAEC_Config_Audio_Mode_On) {
		if (!inf.audio.webAudio)
			cfg.audio.mode = SAEC_Config_Audio_Mode_Off_Emul;
	}
}

function setAdvandedConfig() {
	fixAdvandedConfig();

	/* cpu */
	setRadio("cfg_cpu_model", cfg.cpu.model);
	setRadio("cfg_cpu_speed", cfg.cpu.speed);
	setCheckbox("cfg_cpu_compatible", cfg.cpu.compatible);
	setCheckbox("cfg_cpu_address_space_32", cfg.cpu.addressSpace24 == false);

	/* chipset */
	if (cfg.chipset.mask & SAEC_Config_Chipset_Mask_AGA)
		setRadio("cfg_chipset_mask", 3);
	else if ((cfg.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) && (cfg.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE)) {
		setRadio("cfg_chipset_mask", 2);
		setSelect("cfg_chipset_mask_ecs", 3);
	} else if (cfg.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) {
		setRadio("cfg_chipset_mask", 2);
		setSelect("cfg_chipset_mask_ecs", 1);
	} else if (cfg.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) {
		setRadio("cfg_chipset_mask", 2);
		setSelect("cfg_chipset_mask_ecs", 2);
	} else
		setRadio("cfg_chipset_mask", 1);

	setRadio("cfg_chipset_ntsc", cfg.chipset.ntsc ? 1 : 0);

	setSelect("cfg_chipset_cl", cfg.chipset.colLevel);

	setRadio("cfg_blitter_immediate", cfg.chipset.blitter.immediate ? 0 : 1);
	setSelect("cfg_blitter_waiting", cfg.chipset.blitter.waiting);

	/* chipset features */
	//setSelect("cfg_chipset_features", cfg.chipset.compatible);
	switch (cfg.chipset.compatible) {
		case SAEC_Config_Chipset_Compatible_Generic: setSelect("cfg_chipset_features", "generic"); break;
		case SAEC_Config_Chipset_Compatible_A500: setSelect("cfg_chipset_features", "A500"); break;
		case SAEC_Config_Chipset_Compatible_A500P: setSelect("cfg_chipset_features", "A500P"); break;
		case SAEC_Config_Chipset_Compatible_A600: setSelect("cfg_chipset_features", "A600"); break;
		case SAEC_Config_Chipset_Compatible_A1000: setSelect("cfg_chipset_features", "A1000"); break;
		case SAEC_Config_Chipset_Compatible_A1000V: setSelect("cfg_chipset_features", "A1000V"); break;
		case SAEC_Config_Chipset_Compatible_A1200: setSelect("cfg_chipset_features", "A1200"); break;
		case SAEC_Config_Chipset_Compatible_A2000: setSelect("cfg_chipset_features", "A2000"); break;
		case SAEC_Config_Chipset_Compatible_A3000: setSelect("cfg_chipset_features", "A3000"); break;
		case SAEC_Config_Chipset_Compatible_A4000: setSelect("cfg_chipset_features", "A4000"); break;
		//case SAEC_Config_Chipset_Compatible_A4000T: setSelect("cfg_chipset_features", "A4000T"); break;
		//case SAEC_Config_Chipset_Compatible_CDTV: setSelect("cfg_chipset_features", "CDTV"); break;
		//case SAEC_Config_Chipset_Compatible_CDTVCR: setSelect("cfg_chipset_features", "CDTVCR"); break;
		//case SAEC_Config_Chipset_Compatible_CD32: setSelect("cfg_chipset_features", "CD32"); break;
		case SAEC_Config_Chipset_Compatible_Manual: setSelect("cfg_chipset_features", "manual"); break;
	}
	styleDisplayBlock("cfg_chipset_features_grp", cfg.chipset.compatible == SAEC_Config_Chipset_Compatible_Manual);
	{
		setSelect("cfg_chipset_cia_tod", cfg.chipset.cia.tod);
		setCheckbox("cfg_chipset_cia_todbug", cfg.chipset.cia.todBug);
		setCheckbox("cfg_chipset_cia_overlay", cfg.chipset.cia.overlay);
		setCheckbox("cfg_chipset_cia_type6526", cfg.chipset.cia.type6526);

		setSelect("cfg_chipset_rtc_type", cfg.chipset.rtc.type);

		setSelect("cfg_chipset_ide", cfg.chipset.ide == -1 ? 0 : cfg.chipset.ide);
		setCheckbox("cfg_chipset_pcmcia", cfg.chipset.pcmcia);

		setCheckbox("cfg_chipset_agnus_dip", cfg.chipset.agnusDIP);

		setCheckbox("cfg_rom_mirror_a8", cfg.chipset.mirrorA8);
		setCheckbox("cfg_rom_mirror_e0", cfg.chipset.mirrorE0);

		setCheckbox("cfg_chipset_z3autoconfig", cfg.chipset.z3AutoConfig);
	}

	/* ram */
	setSelect("cfg_mem_chip", cfg.memory.chipSize >> 10);
	setSelect("cfg_mem_slow", cfg.memory.bogoSize >> 10);
	setSelect("cfg_mem_ramsey_low", cfg.memory.ramsey.lowSize >> 10);
	setSelect("cfg_mem_ramsey_high", cfg.memory.ramsey.highSize >> 10);
	setSelect("cfg_mem_z2fast", cfg.memory.z2FastSize >> 10);
	setCheckbox("cfg_mem_z2fastautoconfig", cfg.memory.z2FastAutoConfig);
	setSelect("cfg_mem_z3fast", cfg.memory.z3FastSize >> 10);
	setSelect("cfg_mem_z3mapping", cfg.memory.z3Mapping);

	/* rom */
	setCheckbox("cfg_rom_use_aros", useAROS);
	styleDisplayBlock("cfg_rom_grp", useAROS ? false : true);
	if (!useAROS) {
		setRomName();
		setExtName();
		setKeyName();
		setAMaxName();
	}
	setCheckbox("cfg_rom_kickshifter", cfg.memory.kickShifter);

	/* floppy */
	for (var i = 0; i < 4; i++)
		setAdvandedFloppy(i);
	setSelect("cfg_floppy_speed", cfg.floppy.speed);
	setCheckbox("cfg_floppy_autoext2", cfg.floppy.autoEXT2 != 0);

	/* mount */
	for (var i = 0; i < 6; i++)
		setAdvandedMount(i);

	/* video */
	setCheckbox("cfg_video_enabled", cfg.video.enabled);
	setDisabled("cfg_video_enabled", !inf.video.canvas && !inf.video.webGL);
	//if (cfg.video.enabled)
	{
		setSelect("cfg_video_api", cfg.video.api);
		setDisabled("cfg_video_api", inf.video.webGL == false);
		setSelect("cfg_video_color_mode", cfg.video.colorMode);
		setCheckbox("cfg_video_antialias", cfg.video.antialias);
		//setRadio("cfg_video_fs", cfg.video.apmode[0].gfx_fullscreen);
		//setText("cfg_video_win_width", cfg.video.size_win.width);
		//setText("cfg_video_win_height", cfg.video.size_win.height);
		//setText("cfg_video_fs_width", cfg.video.size_fs.width);
		//setText("cfg_video_fs_height", cfg.video.size_fs.height);
		setSelect("cfg_video_resolution", cfg.video.hresolution);
		setSelect("cfg_video_linemode", cfg.video.pscanlines == 1 ? 2 : cfg.video.vresolution);
		setSelect("cfg_video_interlace", cfg.video.iscanlines);
		setDisabled("cfg_video_interlace", cfg.video.vresolution == SAEC_Config_Video_VResolution_NonDouble);
		setCheckbox("cfg_video_skip", cfg.video.framerate != 1);
		setCheckbox("cfg_video_xcenter", cfg.video.xcenter != 0);
		setCheckbox("cfg_video_ycenter", cfg.video.ycenter != 0);
		setText("cfg_video_brightness", cfg.video.luminance);
		setText("cfg_video_contrast", cfg.video.contrast);
		setText("cfg_video_gamma", cfg.video.gamma);
		setText("cfg_video_alpha", cfg.video.alpha);
		setDisabled("cfg_video_alpha", cfg.video.colorMode < 5);
		setText("cfg_video_background", sprintf("%06X", cfg.video.backgroundColor));
		setDisabled("cfg_video_background", cfg.video.colorMode < 5);
		setCheckbox("cfg_video_blackerthanblack", cfg.video.blackerThanBlack);
		setCheckbox("cfg_video_refreshindicator", cfg.video.refreshIndicator);
		styleDisplayBlock("cfg_video_error_webgl", inf.video.webGL == false);
	}
	styleDisplayBlock("cfg_video_grp", cfg.video.enabled != 0);
	styleDisplayBlock("cfg_video_error_canvas", inf.video.canvas == false && inf.video.webGL == false);

	/* audio */
	setCheckbox("cfg_audio_enabled", cfg.audio.mode != SAEC_Config_Audio_Mode_Off);
	setSelect("cfg_audio_buffer_frames", cfg.audio.bufferFrames);
	setSelect("cfg_audio_mode", cfg.audio.mode);
	setDisabled("cfg_audio_mode", inf.audio.webAudio == false);
	setSelect("cfg_audio_filter", cfg.audio.filter);
	setSelect("cfg_audio_filtertype", cfg.audio.filterType);
	setSelect("cfg_audio_freq", cfg.audio.freq);
	setSelect("cfg_audio_separation", cfg.audio.stereoSeparation);
	setSelect("cfg_audio_delay", cfg.audio.stereoDelay);
	setSelect("cfg_audio_channels", cfg.audio.channels);
	setSelect("cfg_audio_interpolation", cfg.audio.interpol);
	styleDisplayBlock("cfg_audio_grp", cfg.audio.mode != SAEC_Config_Audio_Mode_Off);
	styleDisplayBlock("cfg_audio_error", inf.audio.webAudio == false);

	/* ports */
	setSelect("cfg_ports_0", cfg.ports[0].type);
	setSelect("cfg_ports_0_move", cfg.ports[0].move);
	setSelect("cfg_ports_0_fire_1", cfg.ports[0].fire[0]);
	setSelect("cfg_ports_0_fire_2", cfg.ports[0].fire[1]);
	styleDisplayInline("cfg_ports_0_joyemu_grp", cfg.ports[0].type == SAEC_Config_Ports_Type_JoyEmu);
	styleDisplayInline("cfg_ports_0_joy_grp", cfg.ports[0].type == SAEC_Config_Ports_Type_Joy);
	setAvailableGamepads('cfg_ports_0_joy_device');
	
	setSelect("cfg_ports_1", cfg.ports[1].type);
	setSelect("cfg_ports_1_move", cfg.ports[1].move);
	setSelect("cfg_ports_1_fire_1", cfg.ports[1].fire[0]);
	setSelect("cfg_ports_1_fire_2", cfg.ports[1].fire[1]);
	styleDisplayInline("cfg_ports_1_joyemu_grp", cfg.ports[1].type == SAEC_Config_Ports_Type_JoyEmu);
	styleDisplayInline("cfg_ports_1_joy_grp", cfg.ports[1].type == SAEC_Config_Ports_Type_Joy);
	setAvailableGamepads('cfg_ports_1_joy_device');
	
	setCheckbox("cfg_keyborad_enabled", cfg.keyboard.enabled);

	setCheckbox("cfg_serial_enabled", cfg.serial.enabled);

	styleDisplayTableCell("controls_disk", 1);
}

function setAvailableGamepads( select_id ) {

	var sel = document.getElementById(select_id);
	if (sel) {
		var gamepads = navigator.getGamepads ? navigator.getGamepads() : (navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : []);
	
		/* Clear list */
		for(var i = sel.options.length - 1 ; i >= 0 ; i--) {sel.remove(i);};
	
		/* Add gamepads */
		for (i = 0; i < gamepads.length; i++) {
			if (gamepads[i]) {
				var opt = document.createElement('option');
				opt.value = gamepads[i].index;
				opt.innerHTML = gamepads[i].id + ' #' + i;
				sel.appendChild(opt);
			}
		}
	
	
		/* Add placeholder if no devices found */
		if (sel.options.length == 0) {
			var opt = document.createElement('option');
			opt.value = '';
			opt.innerHTML = 'Not Detected. Press a button on controller';
			sel.appendChild(opt);
		}
	}
}

function getAdvandedFloppy() {
	for (var n = 0; n < 4; n++) {
		if (getCheckbox("cfg_df"+n+"_enabled")) {
			cfg.floppy.drive[n].type = getSelect("cfg_df"+n+"_type");
			cfg.floppy.drive[n].file.prot = getCheckbox("cfg_df"+n+"_wp");
		}
	}
	cfg.floppy.speed = getSelect("cfg_floppy_speed");
	cfg.floppy.autoEXT2 = getCheckbox("cfg_floppy_autoext2") ? 1 : 0;
}
function getAdvandedMount() {
	for (var n = 0; n < 6; n++) {
		var ci = cfg.mount.config[n].ci;
		if (getCheckbox("cfg_mount_"+n+"_enabled")) {
			if (n < 4) {
				ci.controller_type = SAEC_Config_Mount_Controller_Type_MB_IDE;
				ci.controller_unit = n;
				ci.controller_media_type = getSelect("cfg_mount_"+n+"_controller_media");
				ci.unit_feature_level = getSelect("cfg_mount_"+n+"_controller_level");
			} else if (n == 4)
				ci.controller_type = SAEC_Config_Mount_Controller_Type_PCMCIA_SRAM;
			else
				ci.controller_type = SAEC_Config_Mount_Controller_Type_PCMCIA_IDE;
			if (n != 5)
				ci.readonly = getCheckbox("cfg_mount_"+n+"_readonly");
		} else
			ci.controller_type = 0;
	}
}
function getAdvandedConfig() {
	/* cpu */
	cfg.cpu.model = getRadio("cfg_cpu_model");
	cfg.cpu.speed = getRadio("cfg_cpu_speed");
	cfg.cpu.compatible = getCheckbox("cfg_cpu_compatible");
	cfg.cpu.addressSpace24 = getCheckbox("cfg_cpu_address_space_32") ? false : true;

	/* chipset */
	cfg.chipset.mask = SAEC_Config_Chipset_Mask_OCS;
	switch (getRadio("cfg_chipset_mask")) {
		case 1: break;
		case 2: {
			switch (getSelect("cfg_chipset_mask_ecs")) {
				case 1: cfg.chipset.mask |= SAEC_Config_Chipset_Mask_ECS_AGNUS; break;
				case 2: cfg.chipset.mask |= SAEC_Config_Chipset_Mask_ECS_DENISE; break;
				case 3: cfg.chipset.mask |= (SAEC_Config_Chipset_Mask_ECS_AGNUS | SAEC_Config_Chipset_Mask_ECS_DENISE); break;
			}
			break;
		}
		case 3: cfg.chipset.mask |= (SAEC_Config_Chipset_Mask_ECS_AGNUS | SAEC_Config_Chipset_Mask_ECS_DENISE | SAEC_Config_Chipset_Mask_AGA); break;
	}
	cfg.chipset.ntsc = getRadio("cfg_chipset_ntsc") == 1;

	cfg.chipset.colLevel = getSelect("cfg_chipset_cl");

	cfg.chipset.blitter.immediate = getRadio("cfg_blitter_immediate") == 0;
	cfg.chipset.blitter.waiting = getSelect("cfg_blitter_waiting");

	//cfg.chipset.compatible = getSelect("cfg_chipset_features");
	switch (getSelect("cfg_chipset_features", true)) {
		case "generic": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_Generic; break;
		case "A500": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_A500; break;
		case "A500P": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_A500P; break;
		case "A600": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_A600; break;
		case "A1000": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_A1000; break;
		case "A1000V": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_A1000V; break;
		case "A1200": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_A1200; break;
		case "A2000": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_A2000; break;
		case "A3000": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_A3000; break;
		case "A4000": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_A4000; break;
		//case "A4000T": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_A4000T; break;
		//case "CDTV": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_CDTV; break;
		//case "CDTVCR": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_CDTVCR; break;
		//case "CD32": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_CD32; break;
		case "manual": cfg.chipset.compatible = SAEC_Config_Chipset_Compatible_Manual; break;
	}
	if (cfg.chipset.compatible == SAEC_Config_Chipset_Compatible_Manual) {
		cfg.chipset.cia.tod = getSelect("cfg_chipset_cia_tod");
		cfg.chipset.cia.todBug = getCheckbox("cfg_chipset_cia_todbug");
		cfg.chipset.cia.overlay = getCheckbox("cfg_chipset_cia_overlay");
		cfg.chipset.cia.type6526 = getCheckbox("cfg_chipset_cia_type6526");

		cfg.chipset.rtc.type = getSelect("cfg_chipset_rtc_type");

		cfg.chipset.ide = getSelect("cfg_chipset_ide");
		cfg.chipset.pcmcia = getCheckbox("cfg_chipset_pcmcia");

		cfg.chipset.agnusDIP = getCheckbox("cfg_chipset_agnus_dip");
		cfg.chipset.mirrorA8 = getCheckbox("cfg_rom_mirror_a8");
		cfg.chipset.mirrorE0 = getCheckbox("cfg_rom_mirror_e0");

		cfg.chipset.z3AutoConfig = getCheckbox("cfg_chipset_z3autoconfig");
	}

	/* ram */
	cfg.memory.chipSize = getSelect("cfg_mem_chip") << 10;
	cfg.memory.bogoSize = getSelect("cfg_mem_slow") << 10;
	cfg.memory.ramsey.lowSize = getSelect("cfg_mem_ramsey_low") << 10;
	cfg.memory.ramsey.highSize = getSelect("cfg_mem_ramsey_high") << 10;
	cfg.memory.z2FastSize = getSelect("cfg_mem_z2fast") << 10;
	cfg.memory.z2FastAutoConfig = getCheckbox("cfg_mem_z2fastautoconfig");
	cfg.memory.z3FastSize = getSelect("cfg_mem_z3fast") << 10;
	cfg.memory.z3Mapping = getSelect("cfg_mem_z3mapping");

	/* rom */
	useAROS = getCheckbox("cfg_rom_use_aros");
	if (useAROS) {
		cache.req(URL_DATABASE, AROS_ROM_FILE, 0x80000, AROS_ROM_CRC, cfg.memory.rom);
		cache.req(URL_DATABASE, AROS_EXT_FILE, 0x80000, AROS_EXT_CRC, cfg.memory.extRom);
		cfg.memory.romKey.clr();
	} else {
		if (cfg.memory.rom.size == 0) {
			alert(saee2text(SAEE_Memory_NoKickstartRom));
			changePage(PID_ROM);
			return false;
		}
	}
	cfg.memory.kickShifter = getCheckbox("cfg_rom_kickshifter");

	/* floppy */
	getAdvandedFloppy();

	/* mount */
	getAdvandedMount()

	/* video */
	cfg.video.id = "myVideo";
	cfg.video.enabled = getCheckbox("cfg_video_enabled");
	if (cfg.video.enabled) {
		cfg.video.api = getSelect("cfg_video_api");
		cfg.video.colorMode = getSelect("cfg_video_color_mode");
		cfg.video.antialias = getCheckbox("cfg_video_antialias");
		//cfg.video.apmode[0].gfx_fullscreen = getRadio("cfg_video_fs");
		//cfg.video.size_win.width = getText("cfg_video_win_width");
		//cfg.video.size_win.height = getText("cfg_video_win_height");
		//cfg.video.size_fs.width = getText("cfg_video_fs_width");
		//cfg.video.size_fs.height = getText("cfg_video_fs_height");
		cfg.video.hresolution = getSelect("cfg_video_resolution");
		switch (getSelect("cfg_video_linemode")) {
			case 0:
				cfg.video.vresolution = SAEC_Config_Video_VResolution_NonDouble;
				cfg.video.pscanlines = 0;
				cfg.video.iscanlines = 0;
				break;
			case 1:
				cfg.video.vresolution = SAEC_Config_Video_VResolution_Double;
				cfg.video.pscanlines = 0;
				cfg.video.iscanlines = getSelect("cfg_video_interlace");
				break;
			case 2:
				cfg.video.vresolution = SAEC_Config_Video_VResolution_Double;
				cfg.video.pscanlines = 1;
				cfg.video.iscanlines = getSelect("cfg_video_interlace");
				break;
		}
		cfg.video.framerate = getCheckbox("cfg_video_skip") ? 2 : 1;
		cfg.video.xcenter = getCheckbox("cfg_video_xcenter") ? 2 : 0;
		cfg.video.ycenter = getCheckbox("cfg_video_ycenter") ? 2 : 0;
		cfg.video.luminance = getText("cfg_video_brightness");
		cfg.video.contrast = getText("cfg_video_contrast");
		cfg.video.gamma = getText("cfg_video_gamma");
		cfg.video.backgroundColor = Number("0x"+getText("cfg_video_background", true));
		cfg.video.alpha = getText("cfg_video_alpha");
		cfg.video.blackerThanBlack = getCheckbox("cfg_video_blackerthanblack");
		cfg.video.refreshIndicator = getCheckbox("cfg_video_refreshindicator");
		cfg.video.size_win.width = SAEC_Video_DEF_AMIGA_WIDTH << cfg.video.hresolution;
		cfg.video.size_win.height = SAEC_Video_DEF_AMIGA_HEIGHT << cfg.video.vresolution;
	}

	/* audio */
	if (getCheckbox("cfg_audio_enabled"))
		cfg.audio.mode = getSelect("cfg_audio_mode");
	else
		cfg.audio.mode = SAEC_Config_Audio_Mode_Off;

	if (cfg.audio.mode != SAEC_Config_Audio_Mode_Off) {
		cfg.audio.bufferFrames = getSelect("cfg_audio_buffer_frames");
		cfg.audio.filter = getSelect("cfg_audio_filter");
		cfg.audio.filterType = getSelect("cfg_audio_filtertype");
		cfg.audio.freq = getSelect("cfg_audio_freq");
		cfg.audio.stereoSeparation = getSelect("cfg_audio_separation");
		cfg.audio.stereoDelay = getSelect("cfg_audio_delay");
		cfg.audio.channels = getSelect("cfg_audio_channels");
		cfg.audio.interpol = getSelect("cfg_audio_interpolation");
	}

	/* ports */
	cfg.ports[0].type = getSelect("cfg_ports_0");
	if (cfg.ports[0].type == SAEC_Config_Ports_Type_JoyEmu) {
		cfg.ports[0].move = getSelect("cfg_ports_0_move");
		cfg.ports[0].fire[0] = getSelect("cfg_ports_0_fire_1");
		cfg.ports[0].fire[1] = getSelect("cfg_ports_0_fire_2");
		if (cfg.ports[0].fire[0] != SAEC_Config_Ports_Fire_None && cfg.ports[0].fire[0] == cfg.ports[0].fire[1]) {
			alert("Fire-button 1/2 on port 0 can\"t be the same.");
			return false;
		}
	}
	if (cfg.ports[0].type == SAEC_Config_Ports_Type_Joy) {
		cfg.ports[0].device = getSelect("cfg_ports_0_joy_device");
	}
  
	cfg.ports[1].type = getSelect("cfg_ports_1");
	if (cfg.ports[1].type == SAEC_Config_Ports_Type_JoyEmu) {
		cfg.ports[1].move = getSelect("cfg_ports_1_move");
		cfg.ports[1].fire[0] = getSelect("cfg_ports_1_fire_1");
		cfg.ports[1].fire[1] = getSelect("cfg_ports_1_fire_2");
		if (cfg.ports[1].fire[0] != SAEC_Config_Ports_Fire_None && cfg.ports[1].fire[0] == cfg.ports[1].fire[1]) {
			alert("Fire-button 1/2 on port 1 can\"t be the same.");
			return false;
		}
	}
	if (cfg.ports[1].type == SAEC_Config_Ports_Type_Joy) {
		cfg.ports[1].device = getSelect("cfg_ports_1_joy_device");
		if (cfg.ports[0].type == SAEC_Config_Ports_Type_Joy && cfg.ports[1].device == cfg.ports[0].device) {
			alert("Joystick device on port 2 can't be the same device used on port 1.");
			return false;
		}
	}
	cfg.keyboard.enabled = getCheckbox("cfg_keyborad_enabled");

	cfg.serial.enabled = getCheckbox("cfg_serial_enabled");

	/* hooks */
	setHooks();
	return true;
}

/*-----------------------------------------------------------------------*/
/* main */

function start() {
	var s = cache.state();
	if (s == S_VALID) { /* all files are downloaded or cached, go! */
		freezeButtons(false, true);

		var err = sae.start(); /* this does start the emulator */
		if (err != SAEE_None)
			alert(saee2text(err));
	}
	else if (s == S_PENDING) { /* files are still downloading, wait... */
		setTimeout(start, 250);
	}
	else /*if (s == S_ERROR)*/ { /* XMLHttpRequest-error */
		freezeButtons(false, true);
	}
}
/*function delayedStart() {
	if (SAEC_Info.browser.id == SAEC_Info_Brower_ID_Firefox) {	// Thanks "dmcoles"
		console.log("delayedStart() enabling audio-start delay for Firefox...");
		setTimeout(start, 50);
	} else
		start();
}*/

function databaseStart() {
	if (getDatabaseConfig()) {
		freezeButtons(true, true);
		//addItemToURL();
		//delayedStart();
		start();
	}
}

function advandedStart() {
	if (getAdvandedConfig()) {
		freezeButtons(true, true);
 		//delayedStart();
		start();
	}
}

function stop() {
	sae.stop(); /* send stop-request */
}

function pause(p) {
	sae.pause(p); /* send pause-request */
}

function reset() {
	sae.reset(false, false);
}

function mute(m) {
	sae.mute(m);

	muted = m;
	switchMutePlay(muted);
}

/*---------------------------------*/

function init() {
	cache = new Cache();

	sae = new ScriptedAmigaEmulator(); /* create emulator */
	inf = sae.getInfo(); /* reference to cfg */
	cfg = sae.getConfig(); /* reference to cfg */

	//console.log(inf);
	//console.log(cfg);

	initHooks();

	dbInit();
	setDatabaseConfig();

	if (window.location.hash.length > 1) {
		var start = false;
		var name = decodeURL(window.location.hash.substr(1));
		while (true) {
			var tmp = name.replace("_", " ");
			if (tmp == name) break;
			name = tmp;
		}
		var pos;
		if ((pos = dbFindTypeNamePos(DBT_GAME, name)) != -1) {
			setSelect("cfg_game", pos+1);
			preSelect(DBT_GAME);
			start = true;
		}
		if (!start) {
			if ((pos = dbFindTypeNamePos(DBT_DEMO, name)) != -1) {
				setSelect("cfg_demo", pos+1);
				preSelect(DBT_DEMO);
				start = true;
			}
		}
		if (!start) {
			if ((pos = dbFindTypeNamePos(DBT_DAGA, name)) != -1) {
				setSelect("cfg_demo_aga", pos+1);
				preSelect(DBT_DAGA);
				start = true;
			}
		}
		if (!start) {
			if ((pos = dbFindTypeNamePos(DBT_TOOL, name)) != -1) {
				//document.getElementById("cfg_tool")[pos+1].selected = true;
				setSelect("cfg_tool", pos+1);
				preSelect(DBT_TOOL);
				start = true;
			}
		}
		if (start)
			databaseStart();
	}
}

/*-----------------------------------------------------------------------*/
/*-----------------------------------------------------------------------*/
/*-----------------------------------------------------------------------*/

function switchCfg(m) {
	if (m == MODE_Database) {
		if (mode == MODE_Advanced) {
			if (!confirm("Going back to the database will reset the current configuration.\n\nAre you sure?"))
				return;
		} else {
			alert("Click this logo in the advanced-config, if you want to return here.");
			return;
		}
	}
	mode = m;

	styleDisplayBlock("config_database", m == MODE_Database);
	styleDisplayBlock("config_advanced", m == MODE_Advanced);

	sae.setDefaults();

	if (m == MODE_Database) {
		if (page == PID_Floppy_Info && floppyNum != -1)
			floppyCloseInfo();
		else if (page == PID_Mount_Setup && mountConfigNum != -1)
			mountCloseSetup(false);

		setDatabaseConfig();
		changePage(PID_None);
	} else /*if (m == MODE_Advanced)*/ {
		preSelect(0);

		setAdvandedConfig();
		if (page == PID_None)
			changePage(PID_Model);
	}
}

/*-----------------------------------------------------------------------*/
/* database cfg */

function preSelect(grp) {
	function insertRow1(table, item) {
		var row = table.insertRow(-1);
		var cell = row.insertCell(-1);
		cell.innerHTML = item;
		cell.colSpan = 4;
	}
	function insertRow2(table, item) {
		var row = table.insertRow(-1);
		var cell1 = row.insertCell(-1);
		var cell2 = row.insertCell(-1);
		cell1.className = "arm";
		cell1.innerHTML = '<span class="label">'+item[0]+'</span>';
		cell2.className = "alm";
		cell2.innerHTML = item[1];
		cell2.colSpan = 3;
		cell2.style.width = "100%";
	}
	function insertRow4(table, item1, item2) {
		var row = table.insertRow(-1);
		var cell1 = row.insertCell(-1);
		var cell2 = row.insertCell(-1);
		if (item1 !== false) {
			cell1.className = "arm";
			cell1.innerHTML = '<span class="label">'+item1[0]+'</span>';
			cell2.className = "alm";
			cell2.innerHTML = item1[1];
		}
		cell1 = row.insertCell(-1);
		cell2 = row.insertCell(-1);
		cell2.style.width = "50%";
		if (item2 !== false) {
			cell1.className = "arm";
			cell1.innerHTML = '<span class="label">'+item2[0]+'</span>';
			cell2.className = "alm";
			cell2.innerHTML = item2[1];
		}
	}

	/* remove old box */
	var div = document.getElementById("config_database_info");
	var table = document.getElementById("config_database_info_content");
	if (table)
		div.removeChild(table);

	var id = "";
	if (dbGrp > 0 && dbGrp != grp) {
		id = DB_IDS[0][dbGrp - 1];
		setSelect(id, 0);
	}

	if (grp > 0) {
		id = DB_IDS[0][grp - 1];
		dbUrl = DB_URLS[grp - 1];
		dbGrp = grp;
		dbNum = getSelect(id);
	} else {
		dbGrp = 0;
		dbNum = 0;
		dbUrl = "";
		return; /* no group selected */
	}
	if (dbNum == 0) /* no entry selected */
		return;

	/* create new box */
	var dbe = db[dbNum - 1];

	styleDisplayTableCell("controls_disk", (dbe.flags & DBF_MDC) != 0);

	var href = dbe.name;
	while (true) {
		var tmp = href.replace(" ", "_");
		if (tmp == href) break;
		href = tmp;
	}
	href = "http://" + window.location.hostname + "/#" + href;
	var nameLink = dbe.name+" (<a target=\"_blank\" href=\""+href+"\">share</a>)";

	var license = "";
	if (dbe.license.length) {
		if (dbe.license == "PD") license = "Public Domain";
		else if (dbe.license == "FW") license = "Freeware";
		else license = dbe.license;
	}

	if (grp == DBT_GAME) {
		var keys = [
			["Movement","Arrows"],
			["Fire", fireButtonName(16)],
			["Alt-fire", fireButtonName(17)]
		];
		var ctrl = "";
		for (var i = 0; i < keys.length; i++)
			ctrl += keys[i][0]+": "+keys[i][1]+"<br/>";

		var ctrl = "<table class=\"ctrl\">";
		for (var i = 0; i < keys.length; i++)
			ctrl += "<tr><td class=\"arm\">"+keys[i][0]+":</td><td>"+keys[i][1]+"</td></tr>";
		ctrl += "</table>";
	}

	table = document.createElement("table");
	table.id = "config_database_info_content";
	table.style.width = "100%";
	table.style.whiteSpace = "normal";

	insertRow1(table, "<div style=\"height:5px\"></div>");
	insertRow1(table, "<div class=\"linehoriz\"></div>");
	insertRow1(table, "<div style=\"height:5px\"></div>");

	insertRow4(table, ["Name", nameLink], dbe.license.length ? ["License", license] : false);
	insertRow4(table, ["Developer", dbe.developer], dbe.publisher.length ? ["Publisher", dbe.publisher] : false);
	insertRow2(table, ["Year", dbe.year]);
	if (grp == DBT_GAME)
		insertRow2(table, ["Controls", ctrl]);
	if (dbe.notes.length)
		insertRow2(table, ["Notes", dbe.notes]);

	div.appendChild(table);
}

/*-----------------------------------------------------------------------*/
/* advanced cfg */

function getPageElementID(pid) {
	switch (pid) {
		case PID_Model: return "cfg_page_model";
		case PID_CPU: return "cfg_page_cpu";
		case PID_Chipset: return "cfg_page_chipset";
		case PID_RAM: return "cfg_page_ram";
		case PID_ROM: return "cfg_page_rom";
		case PID_ROM_Info: return "cfg_page_rom_info";
		case PID_Floppy: return "cfg_page_floppy";
		case PID_Floppy_Info: return "cfg_page_floppy_info";
		case PID_Mount: return "cfg_page_mount";
		case PID_Mount_Setup: return "cfg_page_mount_setup";
		case PID_Video: return "cfg_page_video";
		case PID_Audio: return "cfg_page_audio";
		case PID_Ports: return "cfg_page_ports";
	}
}
function changePage(pid) {
	if (page != PID_None && page == pid)
		return;
	if (page != PID_None) {
		if (page == PID_ROM_Info && romNum != -1)
			closeRomInfo();
		else if (page == PID_Floppy_Info && floppyNum != -1)
			floppyCloseInfo();
		else if (page == PID_Mount_Setup && mountConfigNum != -1)
			mountCloseSetup(false);

		var id = getPageElementID(page);
		styleDisplayBlock(id, false);
	}
	page = pid;
	if (page != PID_None) {
		var id = getPageElementID(page);
		styleDisplayBlock(id, true);
	}
}

/*---------------------------------*/

function selectModel() {
	var v = getRadio("cfg_model", true);
	if (v === false)
		alert("Please select a model.");
	else {
		var model, modelConfig = 0;
		var e = document.getElementById("cfg_model_select");
		e.disabled = "disabled";
		e.innerHTML = "DONE";

		switch (v) {
			case "A500": model = SAEC_Model_A500; modelConfig = getSelect("cfg_model_a500");  break;
			case "A500P": model = SAEC_Model_A500P; modelConfig = getSelect("cfg_model_a500p"); break;
			case "A600": model = SAEC_Model_A600; modelConfig = getSelect("cfg_model_a600"); break;
			case "A1000": model = SAEC_Model_A1000; modelConfig = getSelect("cfg_model_a1000"); break;
			case "A1200": model = SAEC_Model_A1200; modelConfig = getSelect("cfg_model_a1200"); break;
			case "A2000": model = SAEC_Model_A2000; break;
			case "A3000": model = SAEC_Model_A3000; break;
			case "A4000": model = SAEC_Model_A4000; break;
			//case "A4000T": model = SAEC_Model_A4000T; break;
			//case "CDTV": model = SAEC_Model_CDTV; break; modelConfig = getSelect("cfg_model_cdtv"); break;
			//case "CD32": model = SAEC_Model_CD32; break;
			default: return;
		}
		sae.setModel(model, modelConfig);
		setAdvandedConfig();
		setTimeout(selectModelDone, 250);
	}
}
function selectModelUpdate(model) {
	setRadio("cfg_model", model);
}
function selectModelDone() {
	var e = document.getElementById("cfg_model_select");
	e.disabled = "";
	e.innerHTML = "Set";
}

/*---------------------------------*/

function featuresUpdate() {
	var manual = getSelect("cfg_chipset_features", true) == "manual";
	styleDisplayBlock("cfg_chipset_features_grp", manual);
}

function immediateUpdate(imm) {
	if (imm) {
		setSelect("cfg_blitter_waiting", 0);
		setDisabled("cfg_blitter_waiting", true);
	} else
		setDisabled("cfg_blitter_waiting", false);
}

/*---------------------------------*/

function romUpdate() {
	var aros = getCheckbox("cfg_rom_use_aros");

	styleDisplayBlock("cfg_rom_grp", aros ? false : true);
	if (!aros) {
		cfg.memory.rom.clr();
		cfg.memory.extRom.clr();
		cfg.memory.romKey.clr();
		cfg.memory.amaxRom.clr();

		setRomName();
		setExtName();
		setKeyName();
		setAMaxName();
	}
}

function getRomType(ri) {
	var type = "";

	if (ri.type & SAEC_RomType_ALL_KICK)
		type = "Kickstart";
	else if (ri.type & SAEC_RomType_ALL_EXT)
		type = "Extended";
	else if (ri.type & SAEC_RomType_ALL_CART)
		type = "Cartridge";
	else if (ri.type & SAEC_RomType_KEY)
		type = "Keyfile";
	else if (ri.type & SAEC_RomType_AMAX)
		type = "Macintosh";

	return type;
}

function openRomInfo(ri) {
	const NA = "&lt;na&gt;";
	const NONE = "&lt;none&gt;";
	function span(cn, str) {
		return '<span class="'+cn+'">'+str+'</span>';
	}
	//sprintf("%08X%08X%08X%08X%08X", ri.sha1[0], ri.sha1[1], ri.sha1[2], ri.sha1[3], ri.sha1[4])
	var isKey = (ri.type & SAEC_RomType_KEY) != 0;

	if (isKey) {
		//setText2("cfg_rom_info_name", ri.name);
		setText2("cfg_rom_info_models", "All");

		setText2("cfg_rom_info_size", sprintf("%d (%dK)", ri.size, ri.size >> 10));
		setText2("cfg_rom_info_crc32", sprintf("%08X", ri.crc32));

		setText2("cfg_rom_info_checksum", span("gray", NA));

		setText2("cfg_rom_info_version", span("gray", NA));
		setText2("cfg_rom_info_encrytion", "Cloanto");

		setText2("cfg_rom_info_type", getRomType(ri));
		setText2("cfg_rom_info_cpu", span("gray", NA));

		setText2("cfg_rom_info_partnumber", span("gray", NA));
	} else {
		var cpu = String(ri.cpu);
		if (ri.cpu == 68020 && ri.addressSpace24)
			cpu = "68EC020";
		else if (ri.cpu == 68000)
			cpu = "All";
		else {
			if (ri.cpuExact)
				cpu += " only";
			else
				cpu += " minimum";
			if (!ri.addressSpace24)
				cpu += " / 32bit";
		}
		//setText2("cfg_rom_info_name", ri.name);
		setText2("cfg_rom_info_models", ri.models);

		setText2("cfg_rom_info_size", sprintf("%d (%dK)", ri.size, ri.size >> 10));
		setText2("cfg_rom_info_crc32", sprintf("%08X", ri.crc32));

		if (ri.checksum !== false)
			setText2("cfg_rom_info_checksum", sprintf("%08X (%s)", ri.checksum, ri.checksumValid ? span("green", "valid") : span("orange", "invalid")));
		else
			setText2("cfg_rom_info_checksum", span("gray", NA));

		if (ri.type & SAEC_RomType_AMAX)
			setText2("cfg_rom_info_version", sprintf("%03x %04x %04x", ri.ver, ri.rev, ri.subVer));
		else if (ri.type & SAEC_RomType_ALL_KICK)
			setText2("cfg_rom_info_version", sprintf("%d.%d (exec.library %d.%d)", ri.ver, ri.rev, ri.subVer, ri.subRev));
		else
			setText2("cfg_rom_info_version", sprintf("%d.%d (%d.%d)", ri.ver, ri.rev, ri.subVer, ri.subRev));

		setText2("cfg_rom_info_encrytion", ri.cloanto ? "Cloanto" : span("gray", NONE));

		setText2("cfg_rom_info_type", getRomType(ri));
		setText2("cfg_rom_info_cpu", cpu);

		setText2("cfg_rom_info_partnumber", ri.partNumber.length ? ri.partNumber : span("gray", NA));
	}
	romNum = 0;
	freezeButtons(true, false);
	changePage(PID_ROM_Info);
}
function closeRomInfo() {
	romNum = -1;
	changePage(PID_ROM);
	freezeButtons(false, false);
}

function romSelect() {
	var e = document.getElementById("cfg_rom_file").files[0];
	if (e) {
		loadFile(e, function (event) {
			//cfg.memory.rom.path = e.path;
			cfg.memory.rom.name = e.name;
			cfg.memory.rom.data = event.target.result;
			cfg.memory.rom.size = e.size;
			cfg.memory.rom.crc32 = crc32(event.target.result);

			defRomInfo = new SAEO_RomInfo();
			var err = sae.getRomInfo(defRomInfo, cfg.memory.rom);
			if (err == SAEE_None) {
				defRomEncrypted = defRomInfo.cloanto;
				if (!(defRomInfo.type & SAEC_RomType_ALL_KICK))
					alert("A 'Kickstart'-ROM is required, but you selected a/an '"+getRomType(defRomInfo)+"'-ROM.");
			} else {
				defRomInfo = null;
				if (err != SAEE_Memory_RomUnknown) {
					if (err == SAEE_Memory_RomKey || err == SAEE_Memory_RomDecode) {
						defRomEncrypted = true;
						setKeyName();
						if (err == SAEE_Memory_RomDecode)
							alert(saee2text(err));
					}
				}
			}
			setRomName();
		});
	}
}
function romRemove() {
	cfg.memory.rom.clr();
	setRomName();
	if (defRomEncrypted) {
		defRomEncrypted = false;
		setKeyName();
	}
}
function romOpenInfo() {
	if (defRomInfo !== null)
		openRomInfo(defRomInfo);
}

function extSelect() {
	var e = document.getElementById("cfg_ext_file").files[0];
	if (e) {
		loadFile(e, function (event) {
			//cfg.memory.extRom.path = e.path;
			cfg.memory.extRom.name = e.name;
			cfg.memory.extRom.data = event.target.result;
			cfg.memory.extRom.size = e.size;
			cfg.memory.extRom.crc32 = crc32(event.target.result);

			extRomInfo = new SAEO_RomInfo();
			var err = sae.getRomInfo(extRomInfo, cfg.memory.extRom);
			if (err == SAEE_None) {
				extRomEncrypted = extRomInfo.cloanto;
				if (!(extRomInfo.type & SAEC_RomType_ALL_EXT))
					alert("A 'Extended'-ROM is required, but you selected a/an '"+getRomType(extRomInfo)+"'-ROM.");
			} else {
				extRomInfo = null;
				if (err != SAEE_Memory_RomUnknown) {
					if (err == SAEE_Memory_RomKey || err == SAEE_Memory_RomDecode) {
						extRomEncrypted = true;
						setKeyName();
						if (err == SAEE_Memory_RomDecode)
							alert(saee2text(err));
					}
				}
			}
			setExtName();
		});
	}
}
function extRemove() {
	cfg.memory.extRom.clr();
	setExtName();
	if (extRomEncrypted) {
		extRomEncrypted = false;
		setKeyName();
	}
}
function extOpenInfo() {
	if (extRomInfo !== null)
		openRomInfo(extRomInfo);
}

function keySelect() {
	var e = document.getElementById("cfg_key_file").files[0];
	if (e) {
		loadFile(e, function (event) {
			//cfg.memory.romKey.path = e.path;
			cfg.memory.romKey.name = e.name;
			cfg.memory.romKey.data = event.target.result;
			cfg.memory.romKey.size = e.size;
			cfg.memory.romKey.crc32 = crc32(event.target.result);

			romKeyInfo = new SAEO_RomInfo();
			var err = sae.getRomInfo(romKeyInfo, cfg.memory.romKey);
			if (err != SAEE_None)
				romKeyInfo = null;

			setKeyName();

			if (cfg.memory.rom.size && defRomEncrypted) {
				defRomInfo = new SAEO_RomInfo();
				var err = sae.getRomInfo(defRomInfo, cfg.memory.rom);
				if (err != SAEE_None) {
					defRomInfo = null;
					if (err != SAEE_Memory_RomUnknown)
						alert(saee2text(err));
				}
				setRomName();
			}
			if (cfg.memory.extRom.size && extRomEncrypted) {
				extRomInfo = new SAEO_RomInfo();
				var err = sae.getRomInfo(extRomInfo, cfg.memory.extRom);
				if (err != SAEE_None) {
					extRomInfo = null;
					if (err != SAEE_Memory_RomUnknown)
						alert(saee2text(err));
				}
				setExtName();
			}
		});
	}
}
function keyRemove() {
	cfg.memory.romKey.clr();
	setKeyName();

	if (defRomInfo !== null && defRomEncrypted) {
		defRomInfo = null;
		setRomName();
	}
	if (extRomInfo !== null && extRomEncrypted) {
		extRomInfo = null;
		setExtName();
	}
}
function keyOpenInfo() {
	if (romKeyInfo !== null)
		openRomInfo(romKeyInfo);
}

function amaxSelect() {
	var e = document.getElementById("cfg_amax_file").files[0];
	if (e) {
		loadFile(e, function (event) {
			//cfg.memory.amaxRom.path = e.path;
			cfg.memory.amaxRom.name = e.name;
			cfg.memory.amaxRom.data = event.target.result;
			cfg.memory.amaxRom.size = e.size;
			cfg.memory.amaxRom.crc32 = crc32(event.target.result);

			amaxInfo = new SAEO_RomInfo();
			var err = sae.getRomInfo(amaxInfo, cfg.memory.amaxRom);
			if (err == SAEE_None) {
				if (!(amaxInfo.type & SAEC_RomType_AMAX))
					alert("A 'Macintosh'-ROM is required, but you selected a/an '"+getRomType(amaxInfo)+"'-ROM.");
			} else
				amaxInfo = null;

			setAMaxName();
		});
	}
}
function amaxRemove() {
	cfg.memory.amaxRom.clr();
	amaxInfo = null;
	setAMaxName();
}
function amaxOpenInfo() {
	if (amaxInfo !== null)
		openRomInfo(amaxInfo);
}

/*---------------------------------*/

function floppyEnable(n) {
	if (getCheckbox("cfg_df"+n+"_enabled")) {
		styleDisplayInline("cfg_df"+n+"_grp", 1);
		cfg.floppy.drive[n].type = getSelect("cfg_df"+n+"_type");
		cfg.floppy.drive[n].file.prot = getCheckbox("cfg_df"+n+"_wp");
	} else {
		styleDisplayInline("cfg_df"+n+"_grp", 0);
		cfg.floppy.drive[n].type = SAEC_Config_Floppy_Type_None;
		cfg.floppy.drive[n].file.prot = false;
	}
	floppyEject(n);
}

function floppyIsUsed(n) {
	return (
		cfg.floppy.drive[n].type != SAEC_Config_Floppy_Type_None &&
		cfg.floppy.drive[n].file.size
	);
}
function floppyWaitSelect() {
	var s = cache.state();
	if (s == S_VALID) { /* all files are downloaded or cached, go! */
		for (var n = 0; n < 4; n++) {
			if (floppyIsUsed(n))
				setFloppyName(n);
		}
		freezeButtons(false, false);
	}
	else if (s == S_PENDING) { /* files are still downloading, wait... */
		setTimeout(floppyWaitSelect, 250);
	}
	else /*if (s == S_ERROR)*/ { /* XMLHttpRequest-error */
		for (var n = 0; n < 4; n++) {
			if (cfg.floppy.drive[n].type == SAEC_Config_Floppy_Type_None)
				floppyEject(n);
		}
		freezeButtons(false, false);
	}
}
function floppySelect(grp) {
	var id = DB_IDS[1][grp - 1];
	var url = DB_URLS[grp - 1];
	var num = getSelect(id);
	var dbe = db[num - 1];

	for (var n = 0; n < 4; n++) {
		if (floppyIsUsed(n))
			floppyEject(n);
	}
	for (n = 0; n < dbe.numdisks; n++) {
		if (cfg.floppy.drive[n].type == SAEC_Config_Floppy_Type_None) {
			setCheckbox("cfg_df"+n+"_enabled", true);
			floppyEnable(n);
		}

		var filename = getDatabaseEntryFilename(dbe, n, true);
		cfg.floppy.drive[n].type = SAEC_Config_Floppy_Type_35_DD;
		cache.req(url, filename, 0xdc000, false, cfg.floppy.drive[n].file);

		var e = document.getElementById("cfg_df"+n+"_name");
		e.className = "orange";
		e.innerHTML = "&lt;Downloading, please wait...&gt;";
	}
	cfg.floppy.speed = (dbe.flags & DBF_NOT) == 0 ? SAEC_Config_Floppy_Speed_Turbo : SAEC_Config_Floppy_Speed_Original;
	setSelect("cfg_floppy_speed", cfg.floppy.speed);

	setSelect(id, 0);
	freezeButtons(true, false);
	floppyWaitSelect();
}

function floppyInsert(n) {
	var e = document.getElementById("cfg_df"+n+"_file").files[0];
	if (e) {
		loadFile(e, function(event) {
			var file = cfg.floppy.drive[n].file;
			//file.path = e.path;
			file.name = e.name;
			file.data = event.target.result;
			file.size = e.size;
			file.crc32 = crc32(event.target.result);
			setFloppyName(n);
		});
	}
}

function floppyEject(n) {
	cfg.floppy.drive[n].file.clr();
	setFloppyName(n);
	document.getElementById("cfg_df"+n+"_file").value = "";
}

/*function floppyInfo(n) {
	var file = cfg.floppy.drive[n].file;
	if (file.size != 0) {
		var di = sae.info(n);
		var txt = "";
		var i, j;

		//txt += "Disk is: " + (di.unreadable ? "Unreadable" : "Ready") + "\n";
		txt += "Label: " + (di.diskname.length ? "'"+di.diskname+"'" : "<unnamed>") + "\n";
		txt += "Disksize: " + String(file.size) + " ("+String(file.size >> 10)+"K)\n";
		txt += "Disktype: " + (di.hd ? "High Density (HD)" : "Double Density (DD)") + "\n";
		txt += "Bootblock checksum: " + (di.bootblockChecksumValid ? "Valid" : "Invalid") + "\n";
		txt += "Bootblock type: " + (di.bootblockType == 0 ? "Custom" : (di.bootblockType == 1 ? "Standard 1.x" : "Standard 2.x+")) + "\n";
		txt += sprintf("CRC32: 0x%08x\n", di.crc32);
		txt += "\n";
		txt += "Press F12 if you want to see the bootblock in the developer-console...";

		var bb = "Bootblock of '"+file.name+"' in DF"+String(n)+":\n";
		for (j = 0; j < 32; j++) {
			for (i = 0; i < 32; i++) {
				var chr = di.bootblock[j * 32 + i];
				bb += sprintf("%02X", chr);
			}
			bb += " ";
			for (i = 0; i < 32; i++) {
				var chr = di.bootblock[j * 32 + i];
				if (chr >= 32 && chr <= 126)
					bb += String.fromCharCode(chr);
				else
					bb += ".";
			}
			bb += "\n";
		}
		console.log(bb);

		alert(txt);
	}
}*/

function floppyOpenInfo(n) {
	const NA = "&lt;na&gt;";
	function span(cn, str) {
		return '<span class="'+cn+'">'+str+'</span>';
	}
	var file = cfg.floppy.drive[n].file;
	var di = new SAEO_DiskInfo();
	var err = sae.getDiskInfo(di, n);
	if (err != SAEE_None)
		alert(saee2text(err));

	floppyNum = n;

	setText2("cfg_floppy_info_label", di.diskname.length ? di.diskname : span("gray", NA));
	setText2("cfg_floppy_info_size", sprintf("%d (%dK)", file.size, file.size >> 10));
	setText2("cfg_floppy_info_disktype", di.hd ? "High Density (HD)" : "Double Density (DD)");

	if (di.bootblockChecksum !== false && di.bootblockChecksum !== 0)
		setText2("cfg_floppy_info_checksum", sprintf("%08X (%s)", di.bootblockChecksum, di.bootblockChecksumValid ? span("green", "valid") : span("orange", "invalid")));
	else
		setText2("cfg_floppy_info_checksum", span("gray", NA));

	setText2("cfg_floppy_info_boottype", di.bootblockType == 0 ? "Custom" : (di.bootblockType == 1 ? span("green", "Standard 1.x") : span("green", "Standard 2.x+")));
	setText2("cfg_floppy_info_crc32", sprintf("%08X", di.crc32));

	var bb = "";
	for (j = 0; j < 42; j++) {
		for (i = 0; i < 24; i++) {
			var chr = di.bootblock[j * 24 + i];
			bb += sprintf("%02X", chr);
		}
		bb += " ";
		for (i = 0; i < 24; i++) {
			var chr = di.bootblock[j * 24 + i];
			if (chr >= 32 && chr <= 126)
				bb += String.fromCharCode(chr);
			else
				bb += ".";
		}
		bb += "\n";
	}
	setText("cfg_floppy_info_bootblock", bb);
	if (inf.browser.id != SAEC_Info_Brower_ID_Chrome)
		document.getElementById("cfg_floppy_info_bootblock").style.fontSize = "12px";

	freezeButtons(true, false);
	changePage(PID_Floppy_Info);
}

function floppyCloseInfo() {
	floppyNum = -1;
	changePage(PID_Floppy);
	freezeButtons(false, false);
}

function floppyUpdate() {
	var v = getSelect("fc_type");
	var dis = v > SAEC_Disk_Create_Type_35_HD;
	if (dis) {
		document.getElementById("fc_label").value = "";
		setCheckbox("fc_ffs", false);
		setCheckbox("fc_bootable", false);
	}
	setDisabled("fc_label", dis);
	setDisabled("fc_ffs", dis);
	setDisabled("fc_bootable", dis);
}
function floppyCreate(mode) {
	var n = getSelect("fc_unit");
	var type = getSelect("fc_type");
	var label = document.getElementById("fc_label").value;
	var ffs = getCheckbox("fc_ffs");
	var bootable = getCheckbox("fc_bootable");

	var name = label.length ? label : "empty"+String(n);
	name = name.split(' ').join('_');
	name = name.toLowerCase();
	name += (type == SAEC_Disk_Create_Type_35_DD_PC || type == SAEC_Disk_Create_Type_35_HD_PC ? ".img" : ".adf");

	if (sae.createDisk(n, name, mode, type, label, ffs, bootable) == SAEE_None)
		setAdvandedFloppy(n);
}

/*---------------------------------*/

function mountEnable(n) {
	var ci = cfg.mount.config[n].ci;
	if (getCheckbox("cfg_mount_"+n+"_enabled")) {
		SAER.setMountInfoDefaults(n);

		if (n < 4) {
			ci.controller_type = SAEC_Config_Mount_Controller_Type_MB_IDE;
			ci.controller_unit = n;
			setSelect("cfg_mount_"+n+"_controller_media", ci.controller_media_type);
			setSelect("cfg_mount_"+n+"_controller_level", ci.unit_feature_level);
		} else if (n == 4) {
			ci.controller_type = SAEC_Config_Mount_Controller_Type_PCMCIA_SRAM;
			ci.controller_unit = 0;
		} else {
			ci.controller_type = SAEC_Config_Mount_Controller_Type_PCMCIA_IDE;
			ci.controller_unit = 0;
		}
		setMountName(n);
		styleDisplayInline("cfg_mount_"+n+"_grp", 1);
	} else {
		ci.controller_type = 0;
		mountRemove(n);
		styleDisplayInline("cfg_mount_"+n+"_grp", 0);
	}
	//setAdvandedMount(n);
}

function mountSelect(n) {
	var e = document.getElementById("cfg_mount_"+n+"_file").files[0];
	if (e) {
		loadFile(e, function(event) {
			var ci = cfg.mount.config[n].ci;

			var ok = true;
			if (e.size < 512) {
				alert("The selected hard-file is too small. (512 bytes minimum)")
				ok = false;
			}
			if (ci.controller_type == SAEC_Config_Mount_Controller_Type_PCMCIA_SRAM && e.size > 4 * 1024 * 1024) {
				alert("The selected hard-file is too large for a PCMCIA SRAM-card. (4096K maximum)")
				ok = false;
			}
			if (ok) {
				ci.file.name = e.name;
				ci.file.data = event.target.result;
				ci.file.size = e.size;
				ci.file.crc32 = false;

				if (n < 4) {
					var haveRDB = ci.file.data.substr(0, 4) == "RDSK";
					if (haveRDB)
						;//queryRDB(ci);
					else {
						var blocks = Math.floor(ci.file.size / ci.blocksize);
						ci.highcyl = Math.floor(blocks / (ci.surfaces * ci.sectors));
						ci.devname = "IDE"+String(n);
					}
					setDisabled("cfg_mount_"+n+"_setup", haveRDB);
				}
				setMountName(n);
			} else
				document.getElementById("cfg_mount_"+n+"_file").value = "";
		});
	}
}

function mountRemove(n) {
	cfg.mount.config[n].ci.file.clr();
	setMountName(n);
	document.getElementById("cfg_mount_"+n+"_file").value = "";
}

function mountOpenSetup(n) {
	mountConfigNum = n;
	var ci = cfg.mount.config[n].ci;
	setText("cfg_mount_surfaces", ci.surfaces);
	setText("cfg_mount_sectors", ci.sectors);
	setText("cfg_mount_blocksize", ci.blocksize);
	//setText("cfg_mount_highcyl", ci.highcyl);
	setText("cfg_mount_reserved", ci.reserved);
	setText("cfg_mount_bootpri", ci.bootpri);
	setText("cfg_mount_devname", ci.devname);

	freezeButtons(true, false);
	changePage(PID_Mount_Setup);
}

function mountCloseSetup(use) {
	if (use) {
		var ci = cfg.mount.config[mountConfigNum].ci;
		var surfaces = getText("cfg_mount_surfaces");
		var sectors = getText("cfg_mount_sectors");
		var blocksize = getText("cfg_mount_blocksize");
		var reserved = getText("cfg_mount_reserved");
		var bootpri = getText("cfg_mount_bootpri");
		var devname = getText("cfg_mount_devname", true);

		if (blocksize < 512 || blocksize > 65536 || (blocksize & 511) != 0) {
			alert("'Blocksize' must be smaller or equal 65536 and a multiple of 512.");
			document.getElementById("cfg_mount_blocksize").focus();
			return;
		}
		var blocks = Math.floor(ci.file.size / blocksize);
		if (reserved >= blocks) {
			alert("Number of 'Reserved'-blocks is beyond the disk-size.");
			document.getElementById("cfg_mount_reserved").focus();
			return;
		}
		if (isNaN(bootpri)) {
			alert("The value at 'Bootpri' is not a number.");
			document.getElementById("cfg_mount_bootpri").focus();
			return;
		}
		else if (bootpri < -128 || bootpri > 127) {
			alert("'Bootpri' must between -128 and 127.");
			document.getElementById("cfg_mount_bootpri").focus();
			return;
		}
		if (devname.length == 0) {
			alert("'Name' is empty.");
			document.getElementById("cfg_mount_devname").focus();
			return;
		}
		ci.surfaces = surfaces;
		ci.sectors = sectors;
		ci.blocksize = blocksize;
		//ci.highcyl = Math.floor(blocks / (surfaces * sectors));
		ci.reserved = reserved;
		ci.bootpri = bootpri;
		ci.devname = devname;
	}
	mountConfigNum = -1;
	changePage(PID_Mount);
	freezeButtons(false, false);
}

/*---------------------------------*/

function videoUpdate() {
	styleDisplayBlock("cfg_video_grp", getCheckbox("cfg_video_enabled"));
}
function videoUpdateAPI() {
	if (getSelect("cfg_video_api") == SAEC_Config_Video_API_WebGL) {
		setDisabled("cfg_video_color_mode", false);
		setDisabled("cfg_video_antialias", false);
	} else {
		setSelect("cfg_video_color_mode", 5);
		setDisabled("cfg_video_color_mode", true);
		setDisabled("cfg_video_antialias", true);
	}
	videoUpdateCM();
}
function videoUpdateCM() {
	if (getSelect("cfg_video_color_mode") < 5) {
		setDisabled("cfg_video_background", true);
		setDisabled("cfg_video_alpha", true);
	} else {
		setDisabled("cfg_video_background", false);
		setDisabled("cfg_video_alpha", false);
	}
}
function videoUpdateLineMode() {
	setDisabled("cfg_video_interlace", getSelect("cfg_video_linemode") == SAEC_Config_Video_VResolution_NonDouble);
}

/*---------------------------------*/

function audioUpdate() {
	styleDisplayBlock("cfg_audio_grp", getCheckbox("cfg_audio_enabled"));
}

function filterUpdate() {
	var v = getSelect("cfg_audio_filter");
	document.getElementById("cfg_audio_filtertype").disabled = v == 0;
}

function channelsUpdate() {
	var v = getSelect("cfg_audio_channels");
	document.getElementById("cfg_audio_separation").disabled = v == 1;
	document.getElementById("cfg_audio_delay").disabled = v == 1;
}

/*---------------------------------*/

function portUpdate(n) {
	var v = getSelect("cfg_ports_" + n);
	if (n == 0) {
		styleDisplayInline("cfg_ports_0_joyemu_grp", v == SAEC_Config_Ports_Type_JoyEmu);
		styleDisplayInline("cfg_ports_0_joy_grp", v == SAEC_Config_Ports_Type_Joy);
		if (v == SAEC_Config_Ports_Type_Joy) {
			setAvailableGamepads("cfg_ports_0_joy_device");
		}
	} else {
		styleDisplayInline("cfg_ports_1_joyemu_grp", v == SAEC_Config_Ports_Type_JoyEmu);
		styleDisplayInline("cfg_ports_1_joy_grp", v == SAEC_Config_Ports_Type_Joy);
		if (v == SAEC_Config_Ports_Type_Joy) {
			setAvailableGamepads("cfg_ports_1_joy_device");
		}
	}
}

/*-----------------------------------------------------------------------*/
/* hooks */

function hook_log_error(err, msg) {
	stop();
	if (msg.length)
		alert(msg);
}

/*---------------------------------*/

function hook_event_started() {
	switchBaseEmul(true);
}

function hook_event_stopped() {
	if (paused) {
		paused = false;
		switchPauseResume(paused);
	}
	if (muted) {
		muted = false;
		switchMutePlay(muted);
	}
	if (dskchg)
		dskchgClose();

	if (mode == MODE_Advanced)
		setAdvandedConfig();

	switchBaseEmul(false);
}

function hook_event_reseted(hard) {
	if (paused) {
		paused = false;
		switchPauseResume(paused);
	}
	if (muted) {
		muted = false;
		switchMutePlay(muted);
	}
	if (dskchg)
		dskchgClose();
}

function hook_event_paused(p) {
	paused = p;
	switchPauseResume(p);
}

/*---------------------------------*/

const COL_GRAY = "#888";
const COL_GREEN = "#8C8";
const COL_RED = "#E88";
const COL_ORANGE = "#CC8";

var e_led_power = null;
var e_led_hd = null;
var e_led_df = [null,null,null,null];
var e_led_fps = null;
var e_led_cpu = null;

function hook_led_power(on) {
	e_led_power.style.color = on ? COL_GREEN : COL_GRAY;
}
function hook_led_hd(rw) {
	e_led_hd.style.color = rw == 1 ? COL_GREEN : (rw == 2 ? COL_RED : COL_GRAY);
}
function hook_led_df(unit, dis, cyl, side, rw) {
	if (dis) {
		e_led_df[unit].innerHTML = "-";
		e_led_df[unit].style.color = COL_GRAY;
	} else {
		//e_led_df[unit].innerHTML = sprintf("%02d", cyl);
		//e_led_df[unit].innerHTML = String(80 * side + cyl);
		//e_led_df[unit].innerHTML = String(cyl)+"'"+String(side);
		e_led_df[unit].innerHTML = String(cyl);
		e_led_df[unit].style.color = rw == 1 ? COL_GREEN : (rw == 2 ? COL_RED : COL_GRAY);
	}
}
function hook_led_fps(fps, paused) {
	if (paused) {
		e_led_fps.innerHTML = "0.0"; //"PAUSE";
	} else {
		//e_led_fps.innerHTML = sprintf("%.1f", fps);
		e_led_fps.innerHTML = fps.toFixed(1);
	}
	e_led_fps.style.color = COL_GRAY;
}
function hook_led_cpu(usage, paused) {
	if (paused) {
		e_led_cpu.innerHTML = "0&#37;"; //"PAUSE";
		e_led_cpu.style.color = COL_GRAY;
	} else {
		//e_led_cpu.innerHTML = sprintf("%.0f", usage) + "&#37;";
		e_led_cpu.innerHTML = usage.toFixed(0) + "&#37;";
		if (usage < 90)
			e_led_cpu.style.color = COL_GREEN;
		else if (usage < 110)
			e_led_cpu.style.color = COL_ORANGE;
		else
			e_led_cpu.style.color = COL_RED;
	}
}

function initHooks() {
	e_led_power = document.getElementById("status_led_power");
	e_led_hd = document.getElementById("status_led_hd");
	e_led_df[0] = document.getElementById("status_led_df0");
	e_led_df[1] = document.getElementById("status_led_df1");
	e_led_df[2] = document.getElementById("status_led_df2");
	e_led_df[3] = document.getElementById("status_led_df3");
	e_led_fps = document.getElementById("status_led_fps");
	e_led_cpu = document.getElementById("status_led_cpu");
}
function setHooks() {
	cfg.hook.log.error = hook_log_error;

	cfg.hook.event.started = hook_event_started;
	cfg.hook.event.stopped = hook_event_stopped;
	cfg.hook.event.reseted = hook_event_reseted;
	cfg.hook.event.paused = hook_event_paused;

	cfg.hook.led.power = hook_led_power;
	cfg.hook.led.hd = hook_led_hd;
	cfg.hook.led.df = hook_led_df;
	cfg.hook.led.fps = hook_led_fps;
	cfg.hook.led.cpu = hook_led_cpu;
}

/*-----------------------------------------------------------------------*/
/* disk change */

function dskchgOpen() {
	if (!dskchg) {
		if (mode == MODE_Database) {
			var s = document.getElementById("dskchg_select");
			for (var i = 0; i < dskchgList.length; i++) {
				var filename = dskchgList[i];
				var e = document.createElement("option");
				e.value = filename;
				e.text = filename;
				s.add(e, null);
			}
			styleDisplayBlock("dskchg_database", 1);
		} else
			styleDisplayBlock("dskchg_advanced", 1);

		dskchg = true;
	} else
		dskchgClose();
}

function dskchgClose() {
	if (dskchg) {
		if (mode == MODE_Database) {
			styleDisplayBlock("dskchg_database", 0);
			var s = document.getElementById("dskchg_select");
			for (var i = s.length - 1; i > 0; i--)
				s.remove(i);
  		} else
			styleDisplayBlock("dskchg_advanced", 0);

		dskchg = false;
	}
}

function dskchgEject() {
	if (dskchg) {
		var n = getSelect("dskchg_unit");
		dskchgClose();

		floppyEject(n);
		sae.eject(n);
	}
}

function dskchgInsert() {
	if (dskchg) {
		var e = document.getElementById("dskchg_file").files[0];
		if (e) {
			loadFile(e, function(event) {
				var n = getSelect("dskchg_unit");

				dskchgClose();

				cfg.floppy.drive[n].type = SAEC_Config_Floppy_Type_35_DD;
				var file = cfg.floppy.drive[n].file;
				//file.path = e.path;
				file.name = e.name;
				file.data = event.target.result;
				file.size = e.size;
				file.crc32 = crc32(event.target.result);
				sae.insert(n);
			});
		}
	}
}

function dskchgSelect() {
	if (dskchg) {
		var filename = getSelect("dskchg_select", true) + ".adf";
		var n = 0; /* DF0 */

		dskchgClose();

		if (cache.req(dbUrl, filename, 0xdc000, false, cfg.floppy.drive[n].file))
			sae.insert(n);
	}
}

/* Detect changes in connected gamepads/joysticks */
window.addEventListener("gamepadconnected", function(e) {
	SAEF_log("New gamepad " + e.gamepad.id + " connected");
	setAvailableGamepads('cfg_ports_0_joy_device'); 
	setAvailableGamepads('cfg_ports_1_joy_device');
});
window.addEventListener("gamepaddisconnected", function(e) {
	window.setTimeout(function(){
		SAEF_log("Gamepad " + e.gamepad.id + " disconnected");
		setAvailableGamepads('cfg_ports_0_joy_device');
		setAvailableGamepads('cfg_ports_1_joy_device');
	}, 100);
});