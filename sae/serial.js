/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
**************************************************************************/

function Serial()
{
	var buf = new Uint8Array(1024);
	var pos = 0, dtr = false;
	var serper = 0, serdat = 0x2000;

	this.reset = function () {
		this.flushBuffer();

		pos = 0;
		dtr = false;
		serper = 0;
		serdat = 0x2000;
	};
	
	this.flushBuffer = function () {
		if (pos > 0) {
			var str = '';
			for (var i = 0; i < pos; i++) {
				/*if (buf[i] == 13)
				 str += '<br/>';
				 else if (buf[i] == 9)
				 str += '&nbsp;&nbsp;&nbsp;';
				 else*/
				str += String.fromCharCode(buf[i]);
			}
			pos = 0;
			BUG.col = 3;
			BUG.info(str);
			BUG.col = 1;
		}
	};

	this.readStatus = function () {
		//ciabpra |= 0x20; //Push up Carrier Detect line
		//ciabpra |= 0x08; //DSR ON
		return 0;
	};

	this.writeStatus = function (old, nw) {
		if ((old & 0x80) == 0x80 && (nw & 0x80) == 0x00) dtr = true;
		if ((old & 0x80) == 0x00 && (nw & 0x80) == 0x80) dtr = false;
		//if ((old & 0x40) != (nw & 0x40)) BUG.info('RTS %s.', (nw & 0x40) == 0x40 ? 'set' : 'clr');
		//if ((old & 0x10) != (nw & 0x10)) BUG.info('CTS %s.', (nw & 0x10) == 0x10 ? 'set' : 'clr');
		return nw;
	};

	this.SERPER = function (v) {
		if (serper != v)
			serper = v;
	};

	this.SERDAT = function (v) {
		//BUG.info('SERDAT $%04x', v);

		if (AMIGA.config.serial.enabled) {
			buf[pos++] = v & 0xff;
			if (pos == 1024)
				this.flushBuffer();
		}
		serdat |= 0x2000;
		/* Set TBE in the SERDATR ... */
		AMIGA.intreq |= 1;
		/* ... and in INTREQ register */
	};

	this.SERDATR = function()
	{
		//BUG.info('SERDATR $%04x', serdat);
		return serdat;
	}
}

