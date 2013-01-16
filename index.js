/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
***************************************************************************
* Note: This file does not contain any emulator-code. 
* It is just for the SAE-calls and some GUI-stuff...
* 
**************************************************************************/

const db = [
	/* name company year [disks] [change, turbo] [en,f1,f2,map] load [keys] immediate */			
	[
		['Agony', 'Psygnosis', '1992',
			['Agony (Disk 1).adf',
			'Agony (Disk 2).adf',
			'Agony (Disk 3).adf',
			false], [false, true],
			[true, 16, 17, false],
			['Press the LMB to skip the intro.'], [['Weapon menu', 'Space']], false 
		],
		['Alien Breed', 'Team 17', '1991',
			['Alien Breed (Disk 1).adf',
			'Alien Breed (Disk 2).adf',
			false, false], [true, true],
			[true, 16, 17, false],
			['Insert the 2nd disk manualy and HOLD the fire button.'], [['Show map', 'M']], false 
		],
		['Alien Breed II - The Horror Continues', 'Team 17', '1993',
			['Alien Breed II - The Horror Continues (Disk 1).adf',
			'Alien Breed II - The Horror Continues (Disk 2).adf',
			'Alien Breed II - The Horror Continues (Disk 3).adf', false], [false, false],
			[true, 16, 17, false],
			['Press the LMB to skip the intro.'], [['Show map', 'M']], false 
		],
		['Alien Breed - Tower Assault', 'Team 17', '1994',
			['Alien Breed - Tower Assault (Disk 1).adf',
			'Alien Breed - Tower Assault (Disk 2).adf',
			'Alien Breed - Tower Assault (Disk 3).adf',
			'Alien Breed - Tower Assault (Disk 4).adf'], [false, true],
			[true, 8, 17, false],
			['Press ESC to skip the intro.'], [['Show map', 'M']], false 
		],
		/*['Another World', 'Delphine - U.S. Gold', '1991',
			['Another World (Disk 1).adf',
			'Another World (Disk 2).adf',
			false, false], [false, true],
			[true, 16, 17, false], ['Select 2x OK when asked.'], [], true 
		],*/
		['Blood Money', 'DMA Design', '1989',
			['Blood Money (Disk 1).adf',
			'Blood Money (Disk 2).adf',
			false, false], [true, false],
			[true, 16, 17, false],
			['Press the LMB until the main-nemu<br />and insert the 2nd disk manualy.'], [], false 
		],
		['Body Blows Galactic', 'Team 17', '1993',
			['Body Blows Galactic (Disk 1).adf',
			'Body Blows Galactic (Disk 2).adf',
			'Body Blows Galactic (Disk 3).adf',
			false], [false, false],
			[true, 16, 17, false], ['Press the LMB to skip the intro.'], [], false 
		],
		/*['Dyna Blaster', 'Ubi Soft', '1992',
			['Dyna Blaster.adf',
			false, false, false], [false, false],
			[true, 16, 17, false], ['Press the LMB to skip the intro.'], [], false 
		],*/
		['Lemmings', 'Psygnosis', '1991',
			['Lemmings (Disk 1).adf',
			'Lemmings (Disk 2).adf',
			false, false], [false, true],
			[false, 0, 0, false], [], [['with','Mouse']], false 
		],
		['Lotus Turbo Challenge 2', 'Gremlin', '1991',
			['Lotus Turbo Challenge 2.adf',
			false, false, false], [false, true],
			[true, 16, 17, false], ['Press the LMB to skip the intro.'], [], false 
		],
		['Pac-Mania', 'Grandslam', '1988',
			['Pac-Mania.adf',
			false, false, false], [false, true],
			[true, 16, 17, false], [], [], false 
		],
		['Pinball Dreams', 'DICE', '1992',
			['Pinball Dreams (Disk 1).adf',
			'Pinball Dreams (Disk 2).adf',
			false, false], [false, true],
			[false, 0, 0, true], [], [['Select table','F1-F4'],['Start game','F1-F8'],['Shoot Ball','Down-Arrow'],['Flip','L/R-Arrows'],['Shake table','Space'],['Change table','ESC and then y/z'],['En/Disable music','M']], false 
		],
		['Pinball Fantasies', 'DICE', '1992',
			['Pinball Fantasies (Disk 1).adf',
			'Pinball Fantasies (Disk 2).adf',
			'Pinball Fantasies (Disk 3).adf',
			false], [true, true],
			[false, 0, 0, true],
			['When asked to remove write protection from disk, press the LMB.'],
			[['Select table','F1-F4'],['Start game','F1-F8'],['Shoot Ball','Down-Arrow'],['Flip','L/R-Arrows'],['Shake table','Space'],['Change table','ESC and then y/z'],['En/Disable music','M']], false 
		],
		['Prince of Persia', 'Domark', '1991',
			['Prince of Persia.adf',
			false, false, false], [false, true],
			[true, 16, 17, false], ['Press the LMB to skip the intro.'], [], false 
		],
		['Project-X - Special Edition 93', 'Team 17', '1993',
			['Project-X - Special Edition 93 (Disk 1).adf',
			'Project-X - Special Edition 93 (Disk 2).adf',
			'Project-X - Special Edition 93 (Disk 3).adf',
			false], [false, true],
			[true, 16, 17, false],
			['Press the LMB to skip the intro.'], [['Select weapon', 'Space (not in trainer mode)']], false 
		],
		['Rick Dangerous', 'Firebird', '1989',
			['Rick Dangerous.adf',
			false, false, false], [false, true],
			[true, 16, 17, false], [], [], false 
		],
		['Shadow of the Beast II', 'Reflections', '1990',
			['Shadow of the Beast II (Disk 1).adf',
			'Shadow of the Beast II (Disk 2).adf',
			'Shadow of the Beast II (Disk 3).adf',
			false], [true, true],
			[true, 16, 17, false],
			['Change the disks manualy when asked.'], [], false 
		],
		['Superfrog', 'Team 17', '1993',
			['Superfrog (Disk 1).adf',
			'Superfrog (Disk 2).adf',
			'Superfrog (Disk 3).adf',
			'Superfrog (Disk 4).adf'], [true, false],
			[true, 16, 17, false],
			['Change the disks manualy when asked.'], [], false 
		],
		['Terminator 2 - Judgment Day', 'Ocean', '1991',
			['Terminator 2 - Judgment Day (Disk 1).adf',
			'Terminator 2 - Judgment Day (Disk 2).adf',
			false, false], [true, false],
			[true, 16, 17, false],
			['Press the LMB to skip the intro<br />and insert the 2nd disk manualy.'], [], true 
		],
		['Turrican II - The Final Fight', 'Rainbow Arts', '1991',
			['Turrican II - The Final Fight (Disk 1).adf',
			'Turrican II - The Final Fight (Disk 2).adf',
			false, false], [false, true],
			[true, 16, 17, false], [], [['Fire-beam','Hold Fire 1'],['Roll on floor', 'Down-arrow + Fire 1'],['Bomb', 'Fire 2'],['Super-Bomb', 'Fire 1 + Fire 2']], false 
		],
		['Wings of Death', 'Thalion', '1990',
			['Wings of Death (Disk 1).adf',
			'Wings of Death (Disk 2).adf',
			false, false], [true, true],
			[true, 16, 17, false],
			['Press the LMB until the main-menu<br />and insert the 2nd disk manualy.'], [], false 
		],
	],
	[
		['242', 'Virtual Dreams', '1992',
			['242.adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [], false
		], 
		['9 Fingers', 'Spaceballs', '1993',
			['9 Fingers (Disk 1).adf',
			'9 Fingers (Disk 2).adf',false,false], [false, true],
			[true, 16, 17, false], [], [], false
		], 
		['Alpha and Omega', 'Pure Metal Coders', '1991',
			['Alpha and Omega.adf',
			false,false,false], [false, false],
			[true, 16, 17, false], [], [], false
		], 
		['Copper Master', 'Angels', '1990',
			['Copper Master.adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [], false
		], 
		['Deja Vu', 'Anarchy', '1992',
			['Deja Vu.adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [], false
		], 
		['Elysium', 'Sanity', '1991',
			['Elysium.adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [], false
		], 
		['Ecliptica', 'TRSI', '1991',
			['Ecliptica.adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [], false
		], 
		['Enigma', 'Phenomena', '1991',
			['Enigma.adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [], false
		], 
		['Global Trash', 'Silents', '1992',
			['Global Trash.adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [], false
		], 
		['Hardwired', 'Crionics, Silents', '1992',
			['Hardwired (Disk 1).adf',
			'Hardwired (Disk 2).adf',
			false,false], [true, true],
			[true, 16, 17, false],
			['Insert the 2nd disk manualy,<br />click RMB when done.'], [], true
		], 
		['Ice', 'Silents', '1991',
			['Ice.adf',false,false,false], [false, true],
			[true, 16, 17, false], ['Press LMB at the intro-screen'], [], false
		], 
		['Lost World', 'Balance DK', '1992',
			['Lost World.adf',false,false,false], [false, true],
			[true, 16, 17, false], ['Press LMB at the intro-screen'], [], false
		], 
		['Mental Hangover', 'Scoopex', '1992',
			['Mental Hangover.adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [], false
		], 
		['Multica', 'Andromeda', '1992',
			['Multica.adf',false,false,false], [false, true],
			[true, 16, 17, false], ['Press LMB at the intro-screen'], [], false
		], 
		['Project-X (demo rolling)', 'Team 17', '1992',
			['Project-X (demo-rolling).adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [['Skip level','Fire']], false
		], 
		['Rampage', 'TEK', '1994',
			['Rampage.adf',false,false,false], [false, false],
			[true, 16, 17, false], ['Press LMB at the intro-screen'], [], false
		], 
		['State of the Art', 'Spaceballs', '1992',
			['State of the Art.adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [], false
		], 
		['Static Chaos', 'Silents', '1992',
			['Static Chaos.adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [], false
		], 
		['Technological Death', 'Mad Elks', '1993',
			['Technological Death.adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [], true
		], 
		['Total Destruction', 'Crionics', '1990',
			['Total Destruction.adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [], false
		], 
		['Wayfarer', 'Spaceballs', '1992',
			['Wayfarer.adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [], false
		], 
		['World of Commodore', 'Sanity', '1992',
			['World of Commodore.adf',false,false,false], [false, true],
			[true, 16, 17, false], [], [], false
		], 
	]
];
var dbGrp = 0;
var dbNum = 0;
		
const aros_rom_file = 'aros-amiga-m68k-rom.bin';
const aros_rom_url = 'http://'+window.location.hostname+'/db/'+aros_rom_file;
const aros_rom_size = 0x80000;
const aros_rom_crc = 0xea48b4d1; //0xfc4635e1;
const aros_ext_file = 'aros-amiga-m68k-ext.bin';
const aros_ext_url = 'http://'+window.location.hostname+'/db/'+aros_ext_file;
const aros_ext_size = 0x80000;
const aros_ext_crc = 0x60871435; //0xc612f82e;
	
var mode = 0;
var paused = false;
var dskchg = false;
var dskchgList = [];

var cache = null;
var info = null;
var config = null;

/*-----------------------------------------------------------------------*/

function urldecode(url) {
	return decodeURIComponent(url.replace(/\+/g, ' '));
}

function dechex(dec) { 
	return dec.toString(16);
}
	
function Cache() {
	var roms = [null,null];
	var disks = [];

	this.loadRom = function(num) {
		if (roms[num]) { 
			console.log('loadRom.loadRom() %d is cached', num);
			return roms[num];
		}
		console.log('loadRom.loadRom() downloading %d', num);
		
		var url, size, crc;
		switch (num) {
			case 0:
				url = aros_rom_url;
				size = aros_rom_size;
				crc = aros_rom_crc; 
				break;
			case 1:
				url = aros_ext_url;
				size = aros_ext_size;
				crc = aros_ext_crc;
				break;
		}		
		var data = loadRemoteSync(url);
		if (typeof(data) == 'number') {
			alert('Can\'t download '+url+' (http status: '+data+')');				
		} else {
			if (data.length == size) {
				//console.log(dechex(crc32(data)));
				if (crc32(data) == crc) { 
					roms[num] = data;
					return data;
				} else
					alert('Wrong checksum for '+url+' (is $'+dechex(crc32(data))+', should $'+dechex(crc)+')'); 
			} else
				alert('Wrong file-length for '+url+' ('+size+')');					
		}
		return null;
	}			
	
	this.loadDisk = function(url) {
		for (var i = 0; i < disks.length; i++) {
			if (disks[i][0] == url) {
				console.log('Cache.loadDisk() %s is cached', url);
				return disks[i][1];
			}
		}
		console.log('Cache.loadDisk() downloading %s', url);

		var size = 0xdc000, crc = false;
		var data = loadRemoteSync(url);
		if (typeof(data) == 'number') {
			alert('Can\'t download '+url+' (http status: '+data+')');				
		} else {
			if (data.length == size) {
				if (crc === false || crc32(data) == crc) { 
					disks.push([url, data]);
					return data;
				} else
					alert('Wrong checksum for '+url+' (is $'+dechex(crc32(data))+', should $'+dechex(crc)+')'); 
			} else
				alert('Wrong file-length for '+url+' ('+size+')');					
		} 					
		return null;
	}			
}

/*-----------------------------------------------------------------------*/
/* utils */
		
function dump(obj) {
	var out = '';
	if (obj) {
		for (var i in obj) {
			out += i + ': ' + obj[i] + '\n';
		}         
	}
	alert(out);
	/*var pre = document.createElement('pre');
	pre.innerHTML = out;
	document.body.appendChild(pre);*/
}

function crc32(str, crc) {

	const tab =
	'00000000 77073096 EE0E612C 990951BA 076DC419 706AF48F E963A535 9E6495A3 '+
	'0EDB8832 79DCB8A4 E0D5E91E 97D2D988 09B64C2B 7EB17CBD E7B82D07 90BF1D91 '+
	'1DB71064 6AB020F2 F3B97148 84BE41DE 1ADAD47D 6DDDE4EB F4D4B551 83D385C7 '+
	'136C9856 646BA8C0 FD62F97A 8A65C9EC 14015C4F 63066CD9 FA0F3D63 8D080DF5 '+ 
	'3B6E20C8 4C69105E D56041E4 A2677172 3C03E4D1 4B04D447 D20D85FD A50AB56B '+ 
	'35B5A8FA 42B2986C DBBBC9D6 ACBCF940 32D86CE3 45DF5C75 DCD60DCF ABD13D59 '+ 
	'26D930AC 51DE003A C8D75180 BFD06116 21B4F4B5 56B3C423 CFBA9599 B8BDA50F '+ 
	'2802B89E 5F058808 C60CD9B2 B10BE924 2F6F7C87 58684C11 C1611DAB B6662D3D '+ 
	'76DC4190 01DB7106 98D220BC EFD5102A 71B18589 06B6B51F 9FBFE4A5 E8B8D433 '+ 
	'7807C9A2 0F00F934 9609A88E E10E9818 7F6A0DBB 086D3D2D 91646C97 E6635C01 '+
	'6B6B51F4 1C6C6162 856530D8 F262004E 6C0695ED 1B01A57B 8208F4C1 F50FC457 '+ 
	'65B0D9C6 12B7E950 8BBEB8EA FCB9887C 62DD1DDF 15DA2D49 8CD37CF3 FBD44C65 '+ 
	'4DB26158 3AB551CE A3BC0074 D4BB30E2 4ADFA541 3DD895D7 A4D1C46D D3D6F4FB '+ 
	'4369E96A 346ED9FC AD678846 DA60B8D0 44042D73 33031DE5 AA0A4C5F DD0D7CC9 '+ 
	'5005713C 270241AA BE0B1010 C90C2086 5768B525 206F85B3 B966D409 CE61E49F '+ 
	'5EDEF90E 29D9C998 B0D09822 C7D7A8B4 59B33D17 2EB40D81 B7BD5C3B C0BA6CAD '+ 
	'EDB88320 9ABFB3B6 03B6E20C 74B1D29A EAD54739 9DD277AF 04DB2615 73DC1683 '+ 
	'E3630B12 94643B84 0D6D6A3E 7A6A5AA8 E40ECF0B 9309FF9D 0A00AE27 7D079EB1 '+ 
	'F00F9344 8708A3D2 1E01F268 6906C2FE F762575D 806567CB 196C3671 6E6B06E7 '+ 
	'FED41B76 89D32BE0 10DA7A5A 67DD4ACC F9B9DF6F 8EBEEFF9 17B7BE43 60B08ED5 '+ 
	'D6D6A3E8 A1D1937E 38D8C2C4 4FDFF252 D1BB67F1 A6BC5767 3FB506DD 48B2364B '+ 
	'D80D2BDA AF0A1B4C 36034AF6 41047A60 DF60EFC3 A867DF55 316E8EEF 4669BE79 '+
	'CB61B38C BC66831A 256FD2A0 5268E236 CC0C7795 BB0B4703 220216B9 5505262F '+ 
	'C5BA3BBE B2BD0B28 2BB45A92 5CB36A04 C2D7FFA7 B5D0CF31 2CD99E8B 5BDEAE1D '+ 
	'9B64C2B0 EC63F226 756AA39C 026D930A 9C0906A9 EB0E363F 72076785 05005713 '+ 
	'95BF4A82 E2B87A14 7BB12BAE 0CB61B38 92D28E9B E5D5BE0D 7CDCEFB7 0BDBDF21 '+ 
	'86D3D2D4 F1D4E242 68DDB3F8 1FDA836E 81BE16CD F6B9265B 6FB077E1 18B74777 '+ 
	'88085AE6 FF0F6A70 66063BCA 11010B5C 8F659EFF F862AE69 616BFFD3 166CCF45 '+ 
	'A00AE278 D70DD2EE 4E048354 3903B3C2 A7672661 D06016F7 4969474D 3E6E77DB '+ 
	'AED16A4A D9D65ADC 40DF0B66 37D83BF0 A9BCAE53 DEBB9EC5 47B2CF7F 30B5FFE9 '+ 
	'BDBDF21C CABAC28A 53B39330 24B4A3A6 BAD03605 CDD70693 54DE5729 23D967BF '+ 
	'B3667A2E C4614AB8 5D681B02 2A6F2B94 B40BBE37 C30C8EA1 5A05DF1B 2D02EF8D';

	if (crc == window.undefined) crc = 0;

	crc = crc ^ (-1);
	for (var i = 0, len = str.length; i < len; i++)
		crc = (crc >>> 8) ^ parseInt(tab.substr(((crc ^ str.charCodeAt(i)) & 0xff) * 9, 8), 16);
	crc = crc ^ (-1);
	
	return crc < 0 ? crc + 0x100000000 : crc;
}

function openNewTab(url) {
	window.open(url, '_blank');
	window.focus();
}

function getSelectValue(e) {
	for (var i = 0; i < e.length; i++) {
		if (e[i].selected) return e[i].value;
	}
	return false;
}
function unselect(e) {
	for (var i = 0; i < e.length; i++) {
		if (e[i].selected) {
			e[i].selected = false;
			break;
		}
	}
}
		
function styleDisplayBlock(id, show) {
	var e = document.getElementById(id);
	e.style.display = show ? 'block' : 'none';		
}	
function styleDisplayInline(id, show) {
	var e = document.getElementById(id);
	e.style.display = show ? 'inline' : 'none';		
}	
function styleDisplayTable(id, show) {
	var e = document.getElementById(id);
	e.style.display = show ? 'table' : 'none';		
}	
function styleDisplayTableRow(id, show) {
	var e = document.getElementById(id);
	e.style.display = show ? 'table-row' : 'none';		
}	
function disabled(id, d) {
	document.getElementById(id).disabled = d ? 'disabled' : '';				
}	
	
function toggleFullScreen() {
  if ((document.fullScreenElement && document.fullScreenElement !== null) ||    // alternative standard method
      (!document.mozFullScreenElement && !document.webkitFullScreenElement)) {  // current working methods
    if (document.documentElement.requestFullScreen) {
      document.documentElement.requestFullScreen();
    } else if (document.documentElement.mozRequestFullScreen) {
      document.documentElement.mozRequestFullScreen();
    } else if (document.documentElement.webkitRequestFullScreen) {
      document.documentElement.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);
    }
  } else {
    if (document.cancelFullScreen) {
      document.cancelFullScreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitCancelFullScreen) {
      document.webkitCancelFullScreen();
    }
  }
}

function loadLocalId(id, callback) {
	var e = document.getElementById(id).files[0];
	var reader = new FileReader();
	reader.onload = callback;
	reader.readAsBinaryString(e);
}
function loadLocal(e, callback) {
	var reader = new FileReader();
	reader.onload = callback;
	reader.readAsBinaryString(e);
}

function loadRemote(url, size, crc, callback) {
	var req = new XMLHttpRequest();
	req.open('GET', url, true);	
	req.overrideMimeType('text\/plain; charset=x-user-defined');
	req.onreadystatechange = function(e) {
		if (req.readyState == 4) {
			if (req.status == 200) {
				if (req.responseText.length == size) {
					if (crc === false || crc32(req.responseText) == crc)
						callback(0, req.responseText);
					else
						callback(1, crc32(req.responseText));
				} else
					callback(2, req.responseText.length);
			} else
				callback(3, req.status);
		}
	}
	req.send(null);			
}
function loadRemoteSync(url) {
	var req = new XMLHttpRequest();
	req.open('GET', url, false);	
	req.overrideMimeType('text\/plain; charset=x-user-defined');
	req.send(null);		
	return req.status == 200 ? req.responseText : parseInt(req.status);	
}

/*-----------------------------------------------------------------------*/
/* simple config */

function setSimpleConfig() {
	//document.getElementById('info_name').innerHTML = info.browser_name+' '+info.browser_version+' ('+info.os+')';
	var e = document.getElementById('info_video');
	if (info.video) {
		var t = '';
		if (info.video & SAEI_Video_WebGL) t += 'WebGL, '; 		
		if (info.video & SAEI_Video_Canvas2D) t += 'Canvas, '; 
		e.innerHTML = t.substr(0, t.length - 2);
		e.style.color = (info.video & SAEI_Video_WebGL) ? 'green' : 'orange';
	} else {
		e.innerHTML = 'None';
		e.style.color = 'orange';		
	}
	e = document.getElementById('info_audio');
	if (info.audio) {
		var t = '';
		if (info.audio & SAEI_Audio_Webkit) t += 'Webkit, '; 		
		if (info.audio & SAEI_Audio_Mozilla) t += 'Mozilla, '; 
		e.innerHTML = t.substr(0, t.length - 2);
		e.style.color = 'green';
	} else {
		e.innerHTML = 'None';
		e.style.color = 'orange';		
	}
	e = document.getElementById('info_version').innerHTML = info.version;	
	
		
	var s = document.getElementById('cfg_game');
	if (s.length == 1) {
		for (var i = 0; i < db[0].length; i++) {	
			var e = document.createElement('option');
			e.value = String(1 + i);
			e.text = db[0][i][0];
			s.add(e, null);
		}
	}		
	s = document.getElementById('cfg_demo');
	if (s.length == 1) {
		for (var i = 0; i < db[1].length; i++) {	
			var e = document.createElement('option');
			e.value = String(1 + i);
			e.text = db[1][i][0];
			s.add(e, null);
		}		
	}	
	styleDisplayBlock('config_simple', 1);
	document.getElementById('cfg_audio_enabled_1').checked = config.audio.enabled;
	document.getElementById('cfg_video_enabled_1').checked = config.video.enabled;
	document.getElementById('cfg_video_skip_1').checked = config.video.framerate != 1;	
	document.getElementById('cfg_video_scale_1').checked = false;
	unselect(document.getElementById('cfg_demo'));		
	unselect(document.getElementById('cfg_game'));		
	styleDisplayTable('cfg_info', 0);
	
	styleDisplayInline('dskchg_grp', 0);
}

function getSimpleFloppy() {
	//console.log('loadDisks() %d %d', dbGrp, dbNum);
	
	if (dbNum == 0) { /* nothing selected */
		config.floppy.drive[0].type = SAEV_Config_Floppy_Type_35_DD;
		config.floppy.drive[0].name = null;						
		config.floppy.drive[0].data = null;
		config.floppy.drive[1].type = SAEV_Config_Floppy_Type_None;
		config.floppy.drive[1].name = null;						
		config.floppy.drive[1].data = null;
		config.floppy.drive[2].type = SAEV_Config_Floppy_Type_None;
		config.floppy.drive[2].name = null;						
		config.floppy.drive[2].data = null;
		config.floppy.drive[3].type = SAEV_Config_Floppy_Type_None;
		config.floppy.drive[3].name = null;						
		config.floppy.drive[3].data = null;
		config.floppy.speed = SAEV_Config_Floppy_Speed_Original;
		return true;
	}

	if (db[dbGrp - 1][dbNum - 1] == window.undefined) {
		//alert('bug!');
		return false;
	}
	var item = db[dbGrp - 1][dbNum - 1];
	var baseUrl = 'http://'+window.location.hostname+'/db/';
	if (dbGrp == 1) baseUrl += 'games/';
	else if (dbGrp == 2) baseUrl += 'demos/';


	dskchgList = [];
	if (item[4][0]) {
		var i, filename, url;

		for (i = 0; i < 4; i++) {
			filename = item[3][i];
			if (filename !== false) {
				filename = filename.substr(0, filename.search('.adf'));
				dskchgList.push(filename);
			}
		}
		filename = item[3][0];
		url = baseUrl + filename;
		if ((config.floppy.drive[0].data = cache.loadDisk(url)) !== null) {
			config.floppy.drive[0].type = SAEV_Config_Floppy_Type_35_DD;
			config.floppy.drive[0].name = filename;
		} else
			return false;

		for (i = 1; i < 4; i++) {
			filename = item[3][i];
			if (filename !== false) {
				url = baseUrl + filename;
				if (cache.loadDisk(url) === null) 
					return false;
			}			
			config.floppy.drive[i].type = SAEV_Config_Floppy_Type_None;
			config.floppy.drive[i].name = null;						
			config.floppy.drive[i].data = null;
		}
	} else {
		for (var i = 0; i < 4; i++) {
			var filename = item[3][i];
			if (filename !== false) {
				var url = baseUrl + filename;
				if ((config.floppy.drive[i].data = cache.loadDisk(url)) !== null) {
					config.floppy.drive[i].type = SAEV_Config_Floppy_Type_35_DD;
					config.floppy.drive[i].name = filename;
				} else
					return false;
			} else {
				config.floppy.drive[i].type = SAEV_Config_Floppy_Type_None;
				config.floppy.drive[i].name = null;						
				config.floppy.drive[i].data = null;
			}
		}		
	}
	config.floppy.speed = item[4][1] ? SAEV_Config_Floppy_Speed_Turbo : SAEV_Config_Floppy_Speed_Original;
	
	return true;						
}		
function getSimpleConfig() {
	var item = dbNum > 0 ? db[dbGrp - 1][dbNum - 1] : null;

	config.cpu.speed = SAEV_Config_CPU_Speed_Original;
	config.cpu.compatible = true;

	config.chipset.mask = SAEV_Config_Chipset_Mask_OCS;
	config.chipset.agnus_dip = false; /* A1000 */
	config.chipset.collision_level = SAEV_Config_Chipset_ColLevel_None;

	config.blitter.immediate = (item !== null && item[8]) ? true : false;
	config.blitter.waiting = config.blitter.immediate ? 0 : 1;
	
	config.ram.chip.size = SAEV_Config_RAM_Chip_Size_512K;
	config.ram.slow.size = SAEV_Config_RAM_Slow_Size_512K;
	config.ram.fast.size = SAEV_Config_RAM_Fast_Size_1M;

	config.rom.name = aros_rom_file;
	config.rom.size = SAEV_Config_ROM_Size_512K;
	if ((config.rom.data = cache.loadRom(0)) === null)
		return false;	
	
	config.ext.name = aros_ext_file;
	config.ext.size = SAEV_Config_EXT_Size_512K;
	config.ext.addr = SAEV_Config_EXT_Addr_E0;
	if ((config.ext.data = cache.loadRom(1)) === null)
		return false;	
	
	if (!getSimpleFloppy())
		return false;
			
	config.audio.enabled = document.getElementById('cfg_audio_enabled_1').checked ? true : false;
	if (config.audio.enabled) {
		config.audio.mode = SAEV_Config_Audio_Mode_Play_Best;
		config.audio.channels = SAEV_Config_Audio_Channels_Stereo;
		config.audio.rate = SAEV_Config_Audio_Rate_44100;
	}
	/*if (info.audio == 0) {
		config.audio.enabled = false;
		document.getElementById('cfg_audio_enabled_1').checked = config.audio.enabled;
	}*/
		
	config.video.id = 'myVideo';
	config.video.enabled = document.getElementById('cfg_video_enabled_1').checked ? true : false;
	config.video.scale = document.getElementById('cfg_video_scale_1').checked ? true : false;
	config.video.framerate = document.getElementById('cfg_video_skip_1').checked ? 2 : 1;
	config.video.ntsc = false;

	config.keyboard.enabled = true;
	config.keyboard.mapShift = (item !== null && item[5][3]) ? true : false;

	config.ports[0].type = SAEV_Config_Ports_Type_Mouse;
	/*config.ports[0].type = SAEV_Config_Ports_Type_Joy0;
	config.ports[0].move = ;
	config.ports[0].fire[0] = ;
	config.ports[0].fire[1] = ;*/
	if (item !== null && item[5][0]) {
		config.ports[1].type = SAEV_Config_Ports_Type_Joy1;
		config.ports[1].move = SAEV_Config_Ports_Move_Arrows;
		config.ports[1].fire[0] = item[5][1];
		config.ports[1].fire[1] = item[5][2];
	} else {
		config.ports[1].type = SAEV_Config_Ports_Type_None;
		config.ports[1].move = SAEV_Config_Ports_Move_None;
		config.ports[1].fire[0] = SAEV_Config_Ports_Fire_None;
		config.ports[1].fire[1] = SAEV_Config_Ports_Fire_None;		
	}
	config.serial.enabled = false;

	config.hooks.error = hooks_error;
	config.hooks.power_led = hooks_power_led;
	config.hooks.floppy_motor = hooks_floppy_motor;
	config.hooks.floppy_step = hooks_floppy_step;
	config.hooks.fps = hooks_fps;
	config.hooks.cpu = hooks_cpu;
	
	return true;	
}	

/*-----------------------------------------------------------------------*/
/* advanced config */

function setRomName(name) {
	document.getElementById('cfg_rom_name').className = name === null ? 'red' : '';
	document.getElementById('cfg_rom_name').innerHTML = name === null ? 'unset (required)' : name;
}
function setExtName(name) {
	document.getElementById('cfg_ext_name').className = name === null ? 'gray' : '';
	document.getElementById('cfg_ext_name').innerHTML = name === null ? 'unset (optional)' : name;
}
function setFloppyName(n, name) {
	document.getElementById('cfg_df'+n+'_name').className = name === null ? 'gray' : '';
	document.getElementById('cfg_df'+n+'_name').innerHTML = name === null ? 'unset (optional)' : name;
}

function setFireButton(id, fire) {
	var e = document.getElementById(id);
	switch (fire) {
		case 0: e[0].selected = true; break;
		case 16: e[1].selected = true; break;
		case 17: e[2].selected = true; break;
		case 13: e[3].selected = true; break;
		case 32: e[4].selected = true; break;
		case 8: e[5].selected = true; break;
		case 96: e[6].selected = true; break;
		case 106: e[7].selected = true; break;
		case 107: e[8].selected = true; break;
		case 109: e[9].selected = true; break;
		case 110: e[10].selected = true; break;
		case 111: e[11].selected = true; break;
		case 46: e[12].selected = true; break;
		case 45: e[13].selected = true; break;
		case 34: e[14].selected = true; break;
		case 33: e[15].selected = true; break;
		case 35: e[16].selected = true; break;
		case 36: e[17].selected = true; break;
		case 19: e[18].selected = true; break;
		case 144: e[19].selected = true; break;
		case 145: e[20].selected = true; break;
		case 49: e[21].selected = true; break;
		case 50: e[22].selected = true; break;
	}
}

function fireButtonName(fire) {
	switch (fire) {
		case 0: return 'None';
		case 16: return 'Shift'; 
		case 17: return 'Ctrl'; 
		case 13: return 'Enter'; 
		case 32: return 'Space'; 
		case 8: return 'Backspace'; 
		case 96: return 'Numpad 0'; 
		case 106: return 'Numpad *'; 
		case 107: return 'Numpad '; 
		case 109: return 'Numpad -'; 
		case 110: return 'Numpad .'; 
		case 111: return 'Numpad /'; 
		case 46: return 'Delete'; 
		case 45: return 'Insert'; 
		case 34: return 'Page down'; 
		case 33: return 'Page up'; 
		case 35: return 'End'; 
		case 36: return 'Home'; 
		case 19: return 'Pause'; 
		case 144: return 'Num lock'; 
		case 145: return 'Scroll lock';
		case 49: return '1';
		case 50: return '2';
	}
}

function setFloppy(n) {	
	if (config.floppy.drive[n].type != SAEV_Config_Floppy_Type_None) {
		document.getElementById('cfg_df'+n+'_enabled').checked = true;
		switch (config.floppy.drive[n].type) {
			case SAEV_Config_Floppy_Type_35_DD:	document.getElementById('cfg_df'+n+'_type')[0].selected = true; break;
			case SAEV_Config_Floppy_Type_35_HD:	document.getElementById('cfg_df'+n+'_type')[1].selected = true; break;
			case SAEV_Config_Floppy_Type_525_SD: document.getElementById('cfg_df'+n+'_type')[2].selected = true; break;
		}
		if (config.floppy.drive[n].name) {
			setFloppyName(n, config.floppy.drive[n].name);
			styleDisplayInline('cfg_df'+n+'_eject', 1); 	
		} else {
			setFloppyName(n, null);
			styleDisplayInline('cfg_df'+n+'_eject', 0); 	
		}
		styleDisplayInline('cfg_df'+n+'_grp', 1); 	
	} else {
		document.getElementById('cfg_df'+n+'_enabled').checked = false;		
		styleDisplayInline('cfg_df'+n+'_grp', 0); 	
	}	
	switch (config.floppy.speed) {
		case SAEV_Config_Floppy_Speed_Turbo: document.getElementById('cfg_floppy_speed')[0].selected = true; break;
		case SAEV_Config_Floppy_Speed_Original: document.getElementById('cfg_floppy_speed')[1].selected = true; break;
		case 200: document.getElementById('cfg_floppy_speed')[2].selected = true; break;
		case 500: document.getElementById('cfg_floppy_speed')[3].selected = true; break;
		case 1000: document.getElementById('cfg_floppy_speed')[4].selected = true; break;
	}
}

function setConfig() {	
	var e = document.getElementById('cfg_cpu_speed');
	switch (config.cpu.speed) {
		case SAEV_Config_CPU_Speed_Original: e[0].selected = true; break;
		case SAEV_Config_CPU_Speed_Maximum: e[1].selected = true; break;
	}	
	
	e = document.getElementById('cfg_chipset_type');
	switch (config.chipset.mask) {
		case SAEV_Config_Chipset_Mask_OCS: e[0].selected = true; break
		case SAEV_Config_Chipset_Mask_ECS_AGNUS: e[1].selected = true; break
		case SAEV_Config_Chipset_Mask_ECS_DENISE: e[2].selected = true; break
	}
	document.getElementById('cfg_chipset_cl_enabled').checked = config.chipset.collision_level != SAEV_Config_Chipset_ColLevel_None;		
	switch (config.chipset.collision_level) {
		case SAEV_Config_Chipset_ColLevel_Sprite_Sprite: document.getElementById('cfg_chipset_cl')[0].selected = true; break;
		case SAEV_Config_Chipset_ColLevel_Sprite_Playfield: document.getElementById('cfg_chipset_cl')[1].selected = true; break;
		case SAEV_Config_Chipset_ColLevel_Full: document.getElementById('cfg_chipset_cl')[2].selected = true; break;
	}
	document.getElementById('cfg_chipset_agnus_dip').checked = config.chipset.agnus_dip != 0;	
	document.getElementById('cfg_blitter_immediate').checked = config.blitter.immediate != 0;	
	styleDisplayInline('cfg_chipset_cl_grp', config.chipset.collision_level != SAEV_Config_Chipset_ColLevel_None);

	var e = document.getElementById('cfg_mem_chip');
	switch (config.ram.chip.size) {
		case SAEV_Config_RAM_Chip_Size_256K: e[0].selected = true; break;
		case SAEV_Config_RAM_Chip_Size_512K: e[1].selected = true; break;
		case SAEV_Config_RAM_Chip_Size_1M: e[2].selected = true; break;
		case SAEV_Config_RAM_Chip_Size_2M: e[3].selected = true; break;
	}
	e = document.getElementById('cfg_mem_slow');
	switch (config.ram.slow.size) {
		case SAEV_Config_RAM_Slow_Size_None: e[0].selected = true; break;
		case SAEV_Config_RAM_Slow_Size_256K: e[1].selected = true; break;
		case SAEV_Config_RAM_Slow_Size_512K: e[2].selected = true; break;
		case SAEV_Config_RAM_Slow_Size_1M: e[3].selected = true; break;
		case SAEV_Config_RAM_Slow_Size_1536K: e[4].selected = true; break;
	}
	e = document.getElementById('cfg_mem_fast');
	switch (config.ram.fast.size) {
		case SAEV_Config_RAM_Fast_Size_None: e[0].selected = true; break;
		case SAEV_Config_RAM_Fast_Size_512K: e[1].selected = true; break;
		case SAEV_Config_RAM_Fast_Size_1M: e[2].selected = true; break;
		case SAEV_Config_RAM_Fast_Size_2M: e[3].selected = true; break;
		case SAEV_Config_RAM_Fast_Size_4M: e[4].selected = true; break;
		case SAEV_Config_RAM_Fast_Size_8M: e[5].selected = true; break;
	}
	
	setRomName(config.rom.size ? config.rom.name : null);
	
	if (config.ext.size) {
		setExtName(config.ext.name);
		styleDisplayInline('cfg_ext_remove', 1);
		switch (config.ext.addr) {
			case SAEV_Config_EXT_Addr_E0: document.getElementById('cfg_ext_addr')[0].selected = true; break;
			case SAEV_Config_EXT_Addr_F0: document.getElementById('cfg_ext_addr')[1].selected = true; break;
		}
		styleDisplayTableRow('cfg_ext_addr_grp', 1); 			
	} else {
		setExtName(null);
		styleDisplayInline('cfg_ext_remove', 0);
		styleDisplayTableRow('cfg_ext_addr_grp', 0);		
	}
	
	for (var i = 0; i < 4; i++)
		setFloppy(i); 
	
	document.getElementById('cfg_audio_enabled').checked = config.audio.enabled;	
	switch (config.audio.mode) {
		case SAEV_Config_Audio_Mode_Emul: document.getElementById('cfg_audio_mode')[0].selected = true; break;
		case SAEV_Config_Audio_Mode_Play: document.getElementById('cfg_audio_mode')[1].selected = true; break;
		case SAEV_Config_Audio_Mode_Play_Best: document.getElementById('cfg_audio_mode')[2].selected = true; break;
	}
	switch (config.audio.channels) {
		case SAEV_Config_Audio_Channels_Mono: document.getElementById('cfg_audio_channels')[0].selected = true; break;
		case SAEV_Config_Audio_Channels_Stereo: document.getElementById('cfg_audio_channels')[1].selected = true; break;
	}
	switch (config.audio.rate) {
		case SAEV_Config_Audio_Rate_11025: document.getElementById('cfg_audio_rate')[0].selected = true; break;
		case SAEV_Config_Audio_Rate_22050: document.getElementById('cfg_audio_rate')[1].selected = true; break;
		case SAEV_Config_Audio_Rate_44100: document.getElementById('cfg_audio_rate')[2].selected = true; break;
		case SAEV_Config_Audio_Rate_48000: document.getElementById('cfg_audio_rate')[3].selected = true; break;
	}
	document.getElementById('cfg_audio_filter').checked = config.audio.filter != 0;		
	styleDisplayTable('cfg_audio_grp', config.audio.enabled);

	document.getElementById('cfg_video_enabled').checked = config.video.enabled != 0;	
	document.getElementById('cfg_video_scale').checked = config.video.scale;	
	document.getElementById('cfg_video_ntsc').checked = config.video.ntsc != 0;	
	document.getElementById('cfg_video_skip').checked = config.video.framerate != 1;	
	styleDisplayBlock('cfg_video_grp', config.video.enabled != 0); 	
		
	document.getElementById('cfg_keyborad_enabled').checked = config.keyboard.enabled != 0;	
	document.getElementById('cfg_keyborad_mapshift').checked = config.keyboard.mapShift != 0;	
	styleDisplayBlock('cfg_keyborad_grp', config.keyboard.enabled != 0); 	
	
	document.getElementById('cfg_ports_0_enabled').checked = config.ports[0].type != SAEV_Config_Ports_Type_None;
	e = document.getElementById('cfg_ports_0');
	switch (config.ports[0].type) {
		case SAEV_Config_Ports_Type_Mouse: document.getElementById('cfg_ports_0')[0].selected = true; break;
		case SAEV_Config_Ports_Type_Joy0: document.getElementById('cfg_ports_0')[1].selected = true; break;
	}	
	switch (config.ports[0].move) {
		case SAEV_Config_Ports_Move_Arrows: document.getElementById('cfg_ports_0_move')[0].selected = true; break;
		case SAEV_Config_Ports_Move_Numpad: document.getElementById('cfg_ports_0_move')[1].selected = true; break;
		case SAEV_Config_Ports_Move_WASD: document.getElementById('cfg_ports_0_move')[2].selected = true; break;
	}
	setFireButton('cfg_ports_0_fire_1', config.ports[0].fire[0]);
	setFireButton('cfg_ports_0_fire_2', config.ports[0].fire[1]);
	styleDisplayInline('cfg_ports_0_grp', config.ports[0].type != SAEV_Config_Ports_Type_None); 	
	styleDisplayInline('cfg_ports_0_grp2', config.ports[0].type == SAEV_Config_Ports_Type_Joy0); 
	
	e = document.getElementById('cfg_ports_1_enabled').checked = config.ports[1].type != SAEV_Config_Ports_Type_None;
	e = document.getElementById('cfg_ports_1');
	switch (config.ports[1].type) {
		case SAEV_Config_Ports_Type_Joy1: document.getElementById('cfg_ports_1')[0].selected = true; break;
	}	
	switch (config.ports[1].move) {
		case SAEV_Config_Ports_Move_Arrows: document.getElementById('cfg_ports_1_move')[0].selected = true; break;
		case SAEV_Config_Ports_Move_Numpad: document.getElementById('cfg_ports_1_move')[1].selected = true; break;
		case SAEV_Config_Ports_Move_WASD: document.getElementById('cfg_ports_1_move')[2].selected = true; break;
	}
	setFireButton('cfg_ports_1_fire_1', config.ports[1].fire[0]);
	setFireButton('cfg_ports_1_fire_2', config.ports[1].fire[1]);
	styleDisplayInline('cfg_ports_1_grp', config.ports[1].type == SAEV_Config_Ports_Type_Joy1); 	
	
	e = document.getElementById('cfg_serial_enabled').checked = config.serial.enabled != 0;	

	styleDisplayInline('dskchg_grp', 1);
}

function getMask(type) {
	switch (type) {
		case SAEV_Config_Chipset_Type_OCS: return SAEV_Config_Chipset_Mask_OCS;
		case SAEV_Config_Chipset_Type_ECS_AGNUS: return SAEV_Config_Chipset_Mask_ECS_AGNUS;
		case SAEV_Config_Chipset_Type_ECS_DENISE: return SAEV_Config_Chipset_Mask_ECS_DENISE;
	}
}

function getConfig() {
	var e;

	e = document.getElementById('cfg_cpu_speed');
	config.cpu.speed = parseInt(getSelectValue(e));
	
	e = document.getElementById('cfg_chipset_type');
	config.chipset.mask = getMask(parseInt(getSelectValue(e)));
	e = document.getElementById('cfg_chipset_cl_enabled');
	if (e.checked) {
		e = document.getElementById('cfg_chipset_cl');
		config.chipset.collision_level = parseInt(getSelectValue(e));
	} else
		config.chipset.collision_level = SAEV_Config_Chipset_ColLevel_None;
	config.chipset.agnus_dip = document.getElementById('cfg_chipset_agnus_dip').checked ? true : false;	
	config.blitter.immediate = document.getElementById('cfg_blitter_immediate').checked ? true : false;	
	config.blitter.waiting = config.blitter.immediate ? 0: 1;
		
	e = document.getElementById('cfg_mem_chip');
	config.ram.chip.size = parseInt(getSelectValue(e));
	e = document.getElementById('cfg_mem_slow');
	config.ram.slow.size = parseInt(getSelectValue(e));
	e = document.getElementById('cfg_mem_fast');
	config.ram.fast.size = parseInt(getSelectValue(e));

	if (!config.rom.name) {
		alert('No Kickstart ROM.');
		return false;
	}
	e = document.getElementById('cfg_ext_addr');
	config.ext.addr = parseInt(getSelectValue(e));

	e = document.getElementById('cfg_floppy_speed');
	config.floppy.speed = parseInt(getSelectValue(e));

	config.audio.enabled = document.getElementById('cfg_audio_enabled').checked ? true : false;
	if (config.audio.enabled) {
		e = document.getElementById('cfg_audio_mode');
		config.audio.mode = parseInt(getSelectValue(e));
		e = document.getElementById('cfg_audio_channels');
		config.audio.channels = parseInt(getSelectValue(e));
		e = document.getElementById('cfg_audio_rate');
		config.audio.rate = parseInt(getSelectValue(e));		
		config.audio.filter = document.getElementById('cfg_audio_filter').checked ? true : false;
	}

	config.video.id = 'myVideo';
	config.video.enabled = document.getElementById('cfg_video_enabled').checked ? true : false;
	config.video.scale = document.getElementById('cfg_video_scale').checked ? true : false;
	config.video.ntsc = document.getElementById('cfg_video_ntsc').checked ? true : false;
	config.video.framerate = document.getElementById('cfg_video_skip').checked ? 2 : 1;

	config.keyboard.enabled = document.getElementById('cfg_keyborad_enabled').checked ? true : false;
	config.keyboard.mapShift = document.getElementById('cfg_keyborad_mapshift').checked ? true : false;

	e = document.getElementById('cfg_ports_0');
	config.ports[0].type = parseInt(getSelectValue(e));
	if (config.ports[0].type == SAEV_Config_Ports_Type_Joy0) {
		e = document.getElementById('cfg_ports_0_move');
		config.ports[0].move = parseInt(getSelectValue(e));
		e = document.getElementById('cfg_ports_0_fire_1');
		config.ports[0].fire[0] = parseInt(getSelectValue(e));
		e = document.getElementById('cfg_ports_0_fire_2');
		config.ports[0].fire[1] = parseInt(getSelectValue(e));
		if (config.ports[0].fire[0] != SAEV_Config_Ports_Fire_None && config.ports[0].fire[0] == config.ports[0].fire[1]) {
			alert('Fire-button 1/2 on port 0 can\'t be the same.');
			return false;
		}
	}
	e = document.getElementById('cfg_ports_1');
	config.ports[1].type = parseInt(getSelectValue(e));
	if (config.ports[1].type == SAEV_Config_Ports_Type_Joy1) {
		e = document.getElementById('cfg_ports_1_move');
		config.ports[1].move = parseInt(getSelectValue(e));
		e = document.getElementById('cfg_ports_1_fire_1');
		config.ports[1].fire[0] = parseInt(getSelectValue(e));
		e = document.getElementById('cfg_ports_1_fire_2');
		config.ports[1].fire[1] = parseInt(getSelectValue(e));
		if (config.ports[1].fire[0] != SAEV_Config_Ports_Fire_None && config.ports[1].fire[0] == config.ports[1].fire[1]) {
			alert('Fire-button 1/2 on port 1 can\'t be the same.');
			return false;
		}
	}		

	config.serial.enabled = document.getElementById('cfg_serial_enabled').checked ? true : false;

	config.hooks.error = hooks_error;
	config.hooks.power_led = hooks_power_led;
	config.hooks.floppy_motor = hooks_floppy_motor;
	config.hooks.floppy_step = hooks_floppy_step;
	config.hooks.fps = hooks_fps;					
	config.hooks.cpu = hooks_cpu;		
		
	if (config.chipset.mask != SAEV_Config_Chipset_Mask_OCS)
		config.chipset.agnus_dip = false;

	return true;	
}	

/*-----------------------------------------------------------------------*/
/* main */

function init() {
	cache = new Cache();
	
	SAE({cmd:'init'});		

	info = SAE({cmd:'getInfo'}); 
	config = SAE({cmd:'getConfig'}); 
	//console.log(info);	
	//console.log(config);	
	
	setSimpleConfig();

	if (window.location.hash.length > 0) {
		var name = urldecode(window.location.hash.substr(1));
		var start = false;
	
		for (var i = 0; i < db[0].length; i++) {
			if (db[0][i][0] == name) {
				document.getElementById('cfg_game')[i+1].selected = true;
				preSelect(1);
				start = true;
				break;
			}		
		}		
		if (!start) {
			for (var i = 0; i < db[1].length; i++) {
				if (db[1][i][0] == name) {
					document.getElementById('cfg_demo')[i+1].selected = true;
					preSelect(2);
					start = true;
					break;
				}		
			}		
		}
		if (start)
			simpleStart();
	}
}	

function start() {
	document.body.style.backgroundColor = '#000';
	styleDisplayBlock('base', 0);
	styleDisplayBlock('emul', 1);
	
	if (mode == 0) {	
		var item = dbNum > 0 ? db[dbGrp - 1][dbNum - 1] : null;
		if (item)
			window.location.hash = item[0];
		else
			window.location.hash = '';
	} else	
		window.location.hash = '';
	
	//SAE({cmd:'setConfig',data:config});
	/*var result = SAE({cmd:'start'});
	if (result.error != SAEE_None) {
		stop();
		alert(result.message);		
	}*/	
	SAE({cmd:'start'});
}	

function simpleStart2() {
	if (getSimpleConfig())
		start();	
	else {
		disabled('cfg_simple_start', 0);				
		document.getElementById('cfg_simple_start').innerHTML = 'Play';
	}
}
function simpleStart() {
	disabled('cfg_simple_start', 1);				
	document.getElementById('cfg_simple_start').innerHTML = 'Loading...';
	setTimeout('simpleStart2()', 1);
}

function advandedStart2() {
	if (getConfig())
		start();
	else {
		disabled('cfg_start', 0);				
		document.getElementById('cfg_start').innerHTML = 'Start';
	}	
}	
function advandedStart() {
	disabled('cfg_start', 1);				
	document.getElementById('cfg_start').innerHTML = 'Loading...';
	setTimeout('advandedStart2()', 1);
}	
	
function stop() {
	SAE({cmd:'stop'});	

	if (paused) {
		var e = document.getElementById('status_pr');
		e.value = 'pause';	
		e.onclick = function() { pause(1); }
		paused = false;
	}
	if (dskchg)
		dskchgClose();

	disabled('cfg_simple_start', 0);				
	disabled('cfg_start', 0);				
	document.getElementById('cfg_simple_start').innerHTML = 'Play';
	document.getElementById('cfg_start').innerHTML = 'Start';

	if (mode == 1)
		setConfig();

	styleDisplayBlock('emul', 0);
	styleDisplayBlock('base', 1);
	document.body.style.backgroundColor = '#fff';
}	

function reset(p) {
	SAE({cmd:'reset'});		
}	

function pause(p) {
	var e = document.getElementById('status_pr');
	e.innerHTML = p ? 'Resume' : 'Pause';	
	e.onclick = function() { pause(1 - p); }
		
	paused = p;

	SAE({cmd:'pause',state:p});		
}	

/*-----------------------------------------------------------------------*/
/* config */

function switchCfg(m)
{
	styleDisplayBlock('config_advanced', m == 1);
	styleDisplayBlock('config_simple', m != 1);
	if (m == 0)
		setSimpleConfig();		
	else
		setConfig();
	
	mode = m;
}

/*-----------------------------------------------------------------------*/
/* simple config */

function preSelect(grp)
{
	var num;
	if (grp == 1) {
		num = parseInt(getSelectValue(document.getElementById('cfg_game')));
		unselect(document.getElementById('cfg_demo'));		
	} else {
		unselect(document.getElementById('cfg_game'));		
		num = parseInt(getSelectValue(document.getElementById('cfg_demo')));
	}	
	dbGrp = grp;
	dbNum = num;	

	if (num == 0) {
		styleDisplayTable('cfg_info', 0);
		return;
	}	
	var item = db[grp - 1][num - 1];
		
	document.getElementById('cfg_info_name').innerHTML = item[0];
	document.getElementById('cfg_info_comp').innerHTML = item[1];
	document.getElementById('cfg_info_year').innerHTML = item[2];
	styleDisplayTable('cfg_info', 1);
	styleDisplayInline('dskchg_grp', item[4][0] ? 1 : 0);	

	if (item[6].length) {
		document.getElementById('cfg_info_load').innerHTML = item[6];	
		styleDisplayTableRow('cfg_info_load_grp', 1);
	} else
		styleDisplayTableRow('cfg_info_load_grp', 0);
	
	if (grp == 2) {
		styleDisplayTableRow('cfg_info_ctrl_grp', 0);	
	} else {
		var keys = [];
		if (item[5][0]) {
			var input = [
				['Movement','Arrows'],
				['Fire 1',fireButtonName(item[5][1])],
				['Fire 2',fireButtonName(item[5][2])]
			];
			keys = keys.concat(input);
		}
		if (item[7].length)
			keys = keys.concat(item[7]);

		var ctrl = '';
		for (var i = 0; i < keys.length; i++)
			ctrl += keys[i][0]+': '+keys[i][1]+'<br/>';						

		var ctrl = '<table style="border:1px solid #ccc;padding:2px;background-color:#fcfcfc">';
		for (var i = 0; i < keys.length; i++)
			ctrl += '<tr><td class="armsb">'+keys[i][0]+':</td><td>'+keys[i][1]+'</td></tr>';						
		ctrl += '</table>';

		document.getElementById('cfg_info_ctrl').innerHTML = ctrl;
		styleDisplayTableRow('cfg_info_ctrl_grp', 1);
	}
}

/*-----------------------------------------------------------------------*/
/* advanced config */

function romAROS() {
	//document.getElementById('cfg_rom_aros').innerHTML = 'Loading...';				
	disabled('cfg_rom_aros', 1);				
	
	config.rom.name = aros_rom_file;
	config.rom.size = SAEV_Config_ROM_Size_512K;
	if ((config.rom.data = cache.loadRom(0)) === null)
		return false;	
	
	config.ext.name = aros_ext_file;
	config.ext.size = SAEV_Config_EXT_Size_512K;
	config.ext.addr = SAEV_Config_EXT_Addr_E0;
	if ((config.ext.data = cache.loadRom(1)) === null)
		return false;	

	/*document.getElementById('cfg_rom_aros').style.visibility = 'hidden';*/	

	setRomName(config.rom.name);
	setExtName(config.ext.name);
	document.getElementById('cfg_ext_addr')[0].selected = true;
	styleDisplayInline('cfg_ext_remove', 1);
	styleDisplayTableRow('cfg_ext_addr_grp', 1); 	
	disabled('cfg_rom_aros', 0);				
}

function romSelect() {
	var e = document.getElementById('cfg_rom_file').files[0];
	if (!e) return;
	if (!(e.size == 0x40000 || e.size == 0x80000)) {
		alert('Invalid rom-size, 256 or 512kb.');	
		return;
	}
	loadLocal(e, function (event) {  
		/*
		document.getElementById('cfg_rom_aros').style.visibility = 'visible';	
		document.getElementById('cfg_rom_aros').innerHTML = 'Set AROS';				
		disabled('cfg_rom_aros', 0);*/				
		config.rom.name = e.name;
		config.rom.size = e.size == 0x40000 ? SAEV_Config_ROM_Size_256K : SAEV_Config_ROM_Size_512K;	
		config.rom.data = event.target.result;
		setRomName(config.rom.name);
	});
}		

function extSelect() {
	var e = document.getElementById('cfg_ext_file').files[0];
	if (!e) return;
	if (!(e.size == 0x40000 || e.size == 0x80000)) {
		alert('Invalid extended rom-size, 256 or 512kb.');	
		return;
	}
	loadLocal(e, function (event) {  
		/*document.getElementById('cfg_rom_aros').style.visibility = 'visible';	
		document.getElementById('cfg_rom_aros').innerHTML = 'Set AROS';				
		disabled('cfg_rom_aros', 0);*/ 	
		config.ext.name = e.name;
		config.ext.size = e.size == 0x40000 ? SAEV_Config_EXT_Size_256K : SAEV_Config_EXT_Size_512K;	
		config.ext.data = event.target.result;
		setExtName(config.ext.name);
		styleDisplayInline('cfg_ext_remove', 1);
		styleDisplayTableRow('cfg_ext_addr_grp', 1); 	
	});
}		

function extRemove() {
	/*document.getElementById('cfg_rom_aros').style.visibility = 'visible';	
	document.getElementById('cfg_rom_aros').innerHTML = 'Set AROS';				
	disabled('cfg_rom_aros', 0);*/ 	
	config.ext.name = null;
	config.ext.size = SAEV_Config_EXT_Size_None;
	config.ext.data = null;
	setExtName(config.ext.name);
	styleDisplayInline('cfg_ext_remove', 0);
	styleDisplayTableRow('cfg_ext_addr_grp', 0); 	
}

function floppyUpdate(n) {
	if (document.getElementById('cfg_df'+n+'_enabled').checked) {
		styleDisplayInline('cfg_df'+n+'_grp', 1);
		 	
		var e = document.getElementById('cfg_df'+n+'_type');
		config.floppy.drive[n].type = parseInt(getSelectValue(e));
		floppyEject(n);		
	} else {
		styleDisplayInline('cfg_df'+n+'_grp', 0); 	
		floppyEject(n);		
		config.floppy.drive[n].type = SAEV_Config_Floppy_Type_None;
	}
}

function floppyInsert(n) {
	var e = document.getElementById('cfg_df'+n+'_file').files[0];
	var ok = false;	

	if (!e) return;
	/*if (e.size == 0xDC000)  {
		if (AMIGA.config.floppy.drive[n].type == SAEV_Config_Floppy_Type_35_DD) 
			ok = true;
		else
			alert('DF'+n+' is configured as HD-drive (1760kb), but you selected a DD-diskimage (880kb).');
	}
	else if (e.size == 0x1B8000) {
		if (AMIGA.config.floppy.drive[n].type == SAEV_Config_Floppy_Type_35_HD) 
			ok = true;
		else
			alert('DF'+n+' is configured as DD-drive (880kb), but you selected a HD-diskimage (1760kb).');
	} else 
		alert('Invalid diskimage-size, 880 or 1460 kb.');
	*/
	ok = true;
	if (ok)
		loadLocal(e, function (event) {  
			config.floppy.drive[n].name = e.name;						
			config.floppy.drive[n].data = event.target.result;						
			setFloppyName(n, config.floppy.drive[n].name);
			styleDisplayInline('cfg_df'+n+'_eject', 1); 				
		});
}

function floppyEject(n) {
	config.floppy.drive[n].name = null;						
	config.floppy.drive[n].data = null;						
	setFloppyName(n, null);
	styleDisplayInline('cfg_df'+n+'_eject', 0); 		
}

function audioUpdate() {
	styleDisplayTable('cfg_audio_grp', document.getElementById('cfg_audio_enabled').checked);
}

function videoUpdate() {
	styleDisplayBlock('cfg_video_grp', document.getElementById('cfg_video_enabled').checked);
}

function spritesUpdate() {
	styleDisplayInline('cfg_chipset_cl_grp', document.getElementById('cfg_chipset_cl_enabled').checked);
}

function keyboradUpdate() {
	styleDisplayBlock('cfg_keyborad_grp', document.getElementById('cfg_keyborad_enabled').checked);
}

function portUpdate(n) {
	var v = document.getElementById('cfg_ports_'+n+'_enabled').checked;
	styleDisplayInline('cfg_ports_'+n+'_grp', v); 	
	if (n == 0) {
		if (v)
			portUpdate2();
		else
			styleDisplayInline('cfg_ports_0_grp2', 0); 	
	}
}
function portUpdate2() {
	var e = document.getElementById('cfg_ports_0');
	var v = parseInt(getSelectValue(e));
	styleDisplayInline('cfg_ports_0_grp2', v == 2); 	
}

/*-----------------------------------------------------------------------*/
/* status hooks */

function hooks_error(err, msg) {
	stop();
	if (msg !== null)
		alert(msg);
}	

function hooks_power_led(on) {
	var e = document.getElementById('led_pwr');
	if (e) e.style.color = on ? '#8c8' : '#888';
}
function hooks_floppy_motor(unit, on) {
	var e;
	switch (unit) {
		case 0: e = document.getElementById('led_df0'); break;
		case 1: e = document.getElementById('led_df1'); break;
		case 2: e = document.getElementById('led_df2'); break;
		case 3: e = document.getElementById('led_df3'); break;
	}
	if (e) e.style.color = on ? '#8c8' : '#888';
}
function hooks_floppy_step(unit, cyl) {
	var e;
	switch (unit) {
		case 0: e = document.getElementById('led_df0'); break;
		case 1: e = document.getElementById('led_df1'); break;
		case 2: e = document.getElementById('led_df2'); break;
		case 3: e = document.getElementById('led_df3'); break;
	}
	if (e) e.innerHTML = cyl;
}
function hooks_fps(fps) {
	var e = document.getElementById('led_fps');
	if (e) e.innerHTML = fps;//+'/'+(config.video.ntsc?'60.0':'50.0');
}	
function hooks_cpu(usage) {
	var e = document.getElementById('led_cpu');
	if (e) {
		e.style.color = usage <= 100 ? '#8c8' : (usage > 100 && usage < 120 ? '#cc8' : '#d88');
		e.innerHTML = usage+'%';
	}
}	
	
/*-----------------------------------------------------------------------*/
/* disk change */

function dskchgOpen() {
	if (!dskchg) {
		if (mode == 0) {
			var s = document.getElementById('cfg_dskchg_select');
			for (var i = 0; i < dskchgList.length; i++) {
				var filename = dskchgList[i];
				var e = document.createElement('option');
				e.value = filename;
				e.text = filename;
				s.add(e, null);
			}
			styleDisplayBlock('dskchg_simple', 1);                                                     
		} else
			styleDisplayBlock('dskchg', 1); 
			                                                    
		dskchg = true;
	} else
		dskchgClose();
}

function dskchgClose() {
	if (dskchg) {
		if (mode == 0) {
			styleDisplayBlock('dskchg_simple', 0); 
			var s = document.getElementById('cfg_dskchg_select');
			for (var i = s.length - 1; i > 0; i--)
				s.remove(i);
  		} else
			styleDisplayBlock('dskchg', 0);
			 
		dskchg = false;
	}
}

function dskchgEject() {
	if (dskchg) {
		var n = getSelectValue(document.getElementById('cfg_dskchg_unit'));
		dskchgClose();	
		
		SAE({cmd:'eject',unit:n});			
		floppyEject(n);
	}
}

function dskchgInsert() {
	if (!dskchg) return;
	var n = getSelectValue(document.getElementById('cfg_dskchg_unit'));
	var e = document.getElementById('cfg_dskchg_file').files[0];
	var ok = false;

	if (!e) return;
	/*if (e.size == 0xDC000)  {
		if (AMIGA.config.floppy.drive[n].type == SAEV_Config_Floppy_Type_35_DD) 
			ok = true;
		else
			alert('DF'+n+' is configured as HD-drive (1760kb), but you selected a DD-diskimage (880kb).');
	} else if (e.size == 0x1B8000) {
		if (AMIGA.config.floppy.drive[n].type == SAEV_Config_Floppy_Type_35_HD) 
			ok = true;
		else
			alert('DF'+n+' is configured as DD-drive (880kb), but you selected a HD-diskimage (1760kb).');
	} else 
		alert('Invalid diskimage-size, 880 or 1460 kb.');
	*/	       
	ok = true;
	if (ok) {
		loadLocal(e, function (event) {  
			dskchgClose();		
			
			setFloppyName(n, e.name);
			styleDisplayInline('cfg_df'+n+'_eject', 1); 				
			
			config.floppy.drive[n].type = SAEV_Config_Floppy_Type_35_DD;
			config.floppy.drive[n].name = e.name;						
			config.floppy.drive[n].data = event.target.result;						

			/*SAE({
				cmd:'insert',
				unit:n,
				name:e.name,
				data:event.target.result
			});*/			
			SAE({
				cmd:'insert',
				unit:n
			});			
		});
	}				
}

function dskchgSelect() {
	if (!dskchg) return;
	var filename = getSelectValue(document.getElementById('cfg_dskchg_select'));
	var url = 'http://'+window.location.hostname+'/db/' + (dbGrp == 1 ? 'games/' : 'demos/') + filename + '.adf';
	var n = 0;

	if ((config.floppy.drive[n].data = cache.loadDisk(url)) !== null) {
		dskchgClose();		
		config.floppy.drive[n].type = SAEV_Config_Floppy_Type_35_DD;
		config.floppy.drive[n].name = filename;

		SAE({
			cmd:'insert',
			unit:n
		});			
	}
}
