/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/

/* moving average algorithm */

function MAvg(size) {
	this.values = new Array(size);
	this.size = size;
	this.usage = 0;
	this.offset = 0;
	this.average = 0;

	this.clr = function () {
      this.usage = 0;
      this.offset = 0;
      this.average = 0;
   };

	this.set = function(newval) {
		if (this.usage < this.size) {
			this.values[this.usage++] = newval;
			this.average += newval;
		} else {
			this.average -= this.values[this.offset];
			this.values[this.offset] = newval;
			this.average += newval;
			if (++this.offset >= this.size)
				this.offset -= this.size;
		}
		return Math.floor(this.average / this.usage);
	}
}

/*-----------------------------------------------------------------------*/

/*function crc32(str, crc) {
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
}*/

/*-----------------------------------------------------------------------*/
/*
*  Javascript sprintf
*  http://www.webtoolkit.info/
*/
 
sprintfWrapper = {
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
      var newString = '';
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
            sign: match[4] || '',
            pad: match[5] || ' ',
            min: match[6] || 0,
            precision: match[8],
            code: match[9] || '%',
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

         if (matches[i].code == '%') {
            substitution = '%'
         } else if (matches[i].code == 'b') {
            matches[i].argument = String(Math.abs(parseInt(matches[i].argument)).toString(2));
            substitution = sprintfWrapper.convert(matches[i], true);
         } else if (matches[i].code == 'c') {
            matches[i].argument = String(String.fromCharCode(parseInt(Math.abs(parseInt(matches[i].argument)))));
            substitution = sprintfWrapper.convert(matches[i], true);
         } else if (matches[i].code == 'd') {
            matches[i].argument = String(Math.abs(parseInt(matches[i].argument)));
            substitution = sprintfWrapper.convert(matches[i]);
         } else if (matches[i].code == 'f') {
            matches[i].argument = String(Math.abs(parseFloat(matches[i].argument)).toFixed(matches[i].precision ? matches[i].precision : 6));
            substitution = sprintfWrapper.convert(matches[i]);
         } else if (matches[i].code == 'o') {
            matches[i].argument = String(Math.abs(parseInt(matches[i].argument)).toString(8));
            substitution = sprintfWrapper.convert(matches[i]);
         } else if (matches[i].code == 's') {
            matches[i].argument = matches[i].argument.substring(0, matches[i].precision ? matches[i].precision : matches[i].argument.length);
            substitution = sprintfWrapper.convert(matches[i], true);
         } else if (matches[i].code == 'x') {
            matches[i].argument = String(Math.abs(parseInt(matches[i].argument)).toString(16));
            substitution = sprintfWrapper.convert(matches[i]);
         } else if (matches[i].code == 'X') {
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
         match.sign = '';
      } else {
         match.sign = match.negative ? '-' : match.sign;
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
            return match.sign + match.argument + pad.replace(/0/g, ' ');
         } else {
            return match.sign + match.argument + pad;
         }
      }
   }
};

sprintf = sprintfWrapper.init;

/*-----------------------------------------------------------------------*/
/*
 * http://www.quirksmode.org/js/detect.html
 */

var BrowserDetect = {
	init: function () {
		this.browser = this.searchString(this.dataBrowser) || 'An unknown browser';
		this.version = this.searchVersion(navigator.userAgent) || this.searchVersion(navigator.appVersion) || 'an unknown version';
		this.OS = this.searchString(this.dataOS) || 'an unknown OS';
	},
	searchString: function (data) {
		for (var i = 0; i < data.length; i++) {
			var dataString = data[i].string;
			var dataProp = data[i].prop;
			this.versionSearchString = data[i].versionSearch || data[i].identity;
			if (dataString) {
				if (dataString.indexOf(data[i].subString) != -1) return data[i].identity;
			} else if (dataProp) return data[i].identity;
		}
      return '';
	},
	searchVersion: function (dataString) {
		var index = dataString.indexOf(this.versionSearchString);
		if (index == -1) return 0.0;
		return parseFloat(dataString.substring(index + this.versionSearchString.length + 1));
	},
	dataBrowser: [{
		string: navigator.userAgent,
		subString: 'Chrome',
		identity: 'Chrome'
	}, {
		string: navigator.userAgent,
		subString: 'OmniWeb',
		versionSearch: 'OmniWeb/',
		identity: 'OmniWeb'
	}, {
		string: navigator.vendor,
		subString: 'Apple',
		identity: 'Safari',
		versionSearch: 'Version'
	}, {
		prop: window.opera,
		identity: 'Opera',
		versionSearch: 'Version'
	}, {
		string: navigator.vendor,
		subString: 'iCab',
		identity: 'iCab'
	}, {
		string: navigator.vendor,
		subString: 'KDE',
		identity: 'Konqueror'
	}, {
		string: navigator.userAgent,
		subString: 'Firefox',
		identity: 'Firefox'
	}, {
		string: navigator.vendor,
		subString: 'Camino',
		identity: 'Camino'
	}, { // for newer Netscapes (6+)
		string: navigator.userAgent,
		subString: 'Netscape',
		identity: 'Netscape'
	}, {
		string: navigator.userAgent,
		subString: 'MSIE',
		identity: 'Explorer',
		versionSearch: 'MSIE'
	}, {
		string: navigator.userAgent,
		subString: 'Gecko',
		identity: 'Mozilla',
		versionSearch: 'rv'
	}, { // for older Netscapes (4-)
		string: navigator.userAgent,
		subString: 'Mozilla',
		identity: 'Netscape',
		versionSearch: 'Mozilla'
	}],
	dataOS: [{
		string: navigator.platform,
		subString: 'Win',
		identity: 'Windows'
	}, {
		string: navigator.platform,
		subString: 'Mac',
		identity: 'Mac'
	}, {
		string: navigator.userAgent,
		subString: 'iPhone',
		identity: 'iPhone/iPod'
	}, {
		string: navigator.platform,
		subString: 'Linux',
		identity: 'Linux'
	}]

};
BrowserDetect.init();

/*-----------------------------------------------------------------------*/

/*function dump(obj) {
	var out = '';
	if (obj) {
		for (var i in obj) {
			out += i + ': ' + obj[i] + '\n';
		}     
	} else
		out = 'undefined';

	alert(out);
}*/

/*-----------------------------------------------------------------------*/

function VSync(err, msg) {
	this.error = err;
	this.message = msg;
}
VSync.prototype = new Error;   

function FatalError(err, msg) {
	this.error = err;
	this.message = msg;
}
FatalError.prototype = new Error;

function Fatal(err, msg) {
	//alert(str);
	throw new FatalError(err, msg);
}

/*function SafeFatal(str) {
	alert(str);
	console.log(str);		
	//API_stop();	
	API({cmd:'stop'});
}*/

/*-----------------------------------------------------------------------*/

/*function loadLocal(id, callback) {
	var e = document.getElementById(id).files[0];
	var reader = new FileReader();
	reader.onload = callback;
	reader.readAsBinaryString(e);
}

function loadRemote(file, crc, callback) {
	//var url = 'http://'+window.location.hostname+'/'+file;
	var url = file;

	var req = new XMLHttpRequest();
	req.open('GET', url, true);	
	req.overrideMimeType('text\/plain; charset=x-user-defined');
	req.onreadystatechange = function(e) {
		if (req.readyState == 4) {
			if (req.status == 200) {
				var newcrc = crc32(req.responseText, 0);
				BUG.info('loadRemote() %s (length %d, crc32 $%08x)', file, req.responseText.length, newcrc);
				if (newcrc == crc)
					callback(req.responseText);
				else
					SafeFatal('Wrong checksum for file '+file);				
			} else
				SafeFatal('Can\'t download file '+file+' (http status: '+req.status+')');			
		}
	}
	req.send(null);			
}*/

/*-----------------------------------------------------------------------*/

function Debug() {
	//this.col = 1;
	this.on = 1;

	this.say = function (str) {
      if (this.on) {
         /*var e = document.createElement('span');
          e.style.color = this.col == 1 ? '#888' : (this.col == 2 ? '#448' : '#484');
          e.innerHTML = buf;
          this.debug.appendChild(e);
          this.debug.appendChild(document.createElement('br'));
          this.debug.scrollTop = this.debug.scrollHeight;*/

         console.log(str);
         /*console.info(str);
          console.warn(str);
          console.error(str);
          console.assert(str);*/
      }
   };
	
	this.info = function () {
		if (this.on) {
			var str = sprintf.apply(this, arguments);
			console.log(str);
		}
	}	
}

/*-----------------------------------------------------------------------*/

/*function Uint64(hi, lo) {
	this.hi = hi;
	this.lo = lo;

	this.or = function (v) {
      this.hi = (this.hi | v.hi) >>> 0;
      this.lo = (this.lo | v.lo) >>> 0;
   };

	this.lshift = function (n) {
      if (n) {
         if (n < 32) {
            var m = Math.pow(2, n) - 1;
            var t = this.lo & m;
            this.hi = ((this.hi << n) | t) >>> 0;
            this.lo = (this.lo << n) >>> 0;

            //BUG.info('lshift %d %x', n, m, t);
         } else {
            var t = this.lo;
            this.hi = (t << (n - 32)) >>> 0;
            this.lo = 0;

            //BUG.info('lshift %d %x', n, t);
         }
      }
   };

	this.rshift = function (n) {
      if (n) {
         if (n < 32) {
            var m = Math.pow(2, n) - 1;
            var t = this.hi & m;
            this.hi = (this.hi >>> n) >>> 0;
            this.lo = ((t << (32 - n)) | (this.lo >>> n)) >>> 0;

            //BUG.info('rshift %d %x %x', n, m, t);
         } else {
            var t = this.hi;
            this.hi = 0;
            this.lo = (t >>> (n - 32)) >>> 0;

            //BUG.info('rshift %d %x %x', n, t);
         }
      }
   };

	this.print = function() {
		BUG.info('$%08x%08x', this.hi, this.lo);
	} 	
}*/


