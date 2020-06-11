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
| Note: ported from WinUAE 3.2.x
-------------------------------------------------------------------------*/

function SAEO_Serial() {
	const DEBUGIO = 0; /* 0-3 */
	const DEBUGHS = 0; /* 0-2 */

	var data_in_serdat = 0; /* new data written to SERDAT */
	var data_in_serdatr = 0; /* new data received */
	var data_in_sershift = 0; /* data transferred from SERDAT to shift register */
	var serdatshift = 0; //u16 /* serial shift register */
	var serdatshift_masked = 0; //u16 /* stop bit masked */
	var ovrun = false;
	var dtr = false;
	var oldserbits = 0; //u8

	var serper = 0, serdat = 0, serdatr = 0; //u16

	/*---------------------------------*/

	function dochar(v) {
		v &= 0xff;
		if (v >= 32 && v < 127)
			return v;
		return 46; //'.'
	}

	/*---------------------------------*/

	function serdatcopy() {
		if (data_in_sershift || !data_in_serdat)
			return;
		serdatshift = serdat;
		var bits = ((serdatshift & 0xff80) == 0x80) ? 8 : 7;
		serdatshift_masked = serdatshift & ((1 << bits) - 1);
		data_in_sershift = 1;
		data_in_serdat = 0;

		SAEV_config.hook.serial.put(serdatshift_masked);

		SAER.custom.INTREQ(SAEC_Custom_INTF_SETCLR | SAEC_Custom_INTF_TBE);
	}

	this.hsync = function() { //serial_hsynchandler()
		if (!data_in_serdatr) {
			var ch = SAEV_config.hook.serial.get();
			if (ch > 0) {
				ch &= 0xff; //OWN
				serdatr = ch | 0x100;
				data_in_serdatr = 1;
				this.check_irq();
			}
		}

		//if (!first_write) return;

		if (data_in_sershift) {
			data_in_sershift = 0;
			serdatcopy();
		}
	}

	this.rbf_clear = function() { //serial_rbf_clear()
		ovrun = false;
	}

	this.check_irq = function() { //serial_check_irq()
		if (data_in_serdatr)
			SAER.custom.INTREQ_0(SAEC_Custom_INTF_SETCLR | SAEC_Custom_INTF_RBF);
	}

	/*this.uartbreak = function(v) { //serial_uartbreak()
	}*/

	/*---------------------------------*/
	/* CIA access */

	function status_debug(s) {
		SAEF_log("%s DTR=%d RTS=%d CD=%d CTS=%d DSR=%d", s,
			(oldserbits & 0x80) ? 0 : 1, (oldserbits & 0x40) ? 0 : 1,
			(oldserbits & 0x20) ? 0 : 1, (oldserbits & 0x10) ? 0 : 1, (oldserbits & 0x08) ? 0 : 1);
	}

	this.dtr_on = function() { //serial_dtr_on()
		if (DEBUGHS > 0) SAEF_log("serial.writestatus() DTR on");
		dtr = true;
	}

	this.dtr_off = function() { //serial_dtr_off()
		if (DEBUGHS > 0) SAEF_log("serial.writestatus() DTR off");
		dtr = false;
	}

	this.readstatus = function(dir) { //serial_readstatus()
		var status = 0;
		var serbits = oldserbits; //u8

		/*getserstat (&status);
		if (!(status & TIOCM_CAR)) {
			if (!(serbits & 0x20)) {
				serbits |= 0x20;
				if (DEBUGHS > 0) SAEF_log("serial.readstatus() CD off");
			}
		} else {
			if (serbits & 0x20) {
				serbits &= ~0x20;
				if (DEBUGHS > 0) SAEF_log("serial.readstatus() CD on");
			}
		}
		if (!(status & TIOCM_DSR)) {
			if (!(serbits & 0x08)) {
				serbits |= 0x08;
				if (DEBUGHS > 0) SAEF_log("serial.readstatus() DSR off");
			}
		} else {
			if (serbits & 0x08) {
				serbits &= ~0x08;
				if (DEBUGHS > 0) SAEF_log("serial.readstatus() DSR on");
			}
		}
		if (!(status & TIOCM_CTS)) {
			if (!(serbits & 0x10)) {
				serbits |= 0x10;
				if (DEBUGHS > 0) SAEF_log("serial.readstatus() CTS off");
			}
		} else {
			if (serbits & 0x10) {
				serbits &= ~0x10;
				if (DEBUGHS > 0) SAEF_log("serial.readstatus() CTS on");
			}
		}*/

		serbits &= 0x08 | 0x10 | 0x20;
		oldserbits &= ~(0x08 | 0x10 | 0x20);
		oldserbits |= serbits;

		if (DEBUGHS > 1) status_debug("serial.readstatus()");
		return oldserbits;
	}

	this.writestatus = function(newstate, dir) { //serial_writestatus()
		oldserbits &= ~(0x80 | 0x40);
		newstate &= 0x80 | 0x40;
		oldserbits |= newstate;

		if (DEBUGHS > 1) status_debug("serial.writestatus()");
		return oldserbits;
	}

	/*---------------------------------*/

	this.SERPER = function(w) {
		if (!SAEV_config.serial.enabled)
			return;
		if (serper == w)  /* don't set baudrate if it's already ok */
			return;

		serper = w;
		//first_write = 1;

		if (DEBUGIO > 1) {
			const allowed_baudrates = [
				0, 110, 300, 600, 1200, 2400, 4800, 9600, 14400,
				19200, 31400, 38400, 57600, 115200, 128000, 256000, -1
			];
			var ninebit = (w & 0x8000) != 0;
			w &= 0x7fff;
			if (w < 13) w = 13;
			var per = w;
			if (per == 0) per = 1;
			//per = 3546895 / (per + 1);
			per = ((SAEV_config.video.ntsc ? SAEC_Playfield_CLOCK_NTSC : SAEC_Playfield_CLOCK_PAL) / (per + 1)) >>> 0; //OWN
			if (per == 0) per = 1;
			var i = 0;
			while (allowed_baudrates[i] >= 0 && per > (allowed_baudrates[i] * 100 / 97) >>> 0) i++;
			var baud = allowed_baudrates[i];
			SAEF_log("serial.SERPER() period=%d, baud=%d, bits=%d", w, baud, ninebit ? 9 : 8);
		}
	}

	this.SERDAT = function(w) {
		if (!SAEV_config.serial.enabled)
			return;
		if (DEBUGIO > 2) SAEF_log("serial.SERDAT() write 0x%04x (%c)", w, dochar(w));

		serdatcopy();

		serdat = w;

		if (!w) {
			if (DEBUGIO > 1) SAEF_log("serial.SERDAT() zero serial word written?!");
			return;
		}
		if (DEBUGIO > 1 && data_in_serdat) SAEF_log("serial.SERDAT() program wrote to SERDAT but old byte wasn't fetched yet");

		data_in_serdat = 1;
		serdatcopy();
	}

	this.SERDATR = function() {
		if (!SAEV_config.serial.enabled)
			return 0x2000;

		serdatr &= 0x03ff;
		if (!data_in_serdat)
			serdatr |= 0x2000;
		if (!data_in_sershift)
			serdatr |= 0x1000;
		if (data_in_serdatr)
			serdatr |= 0x4000;
		if (ovrun)
			serdatr |= 0x8000;

		if (DEBUGIO > 2) SAEF_log("serial.SERDATR() read 0x%04x (%c)", serdatr, dochar(serdatr));

		data_in_serdatr = 0;
		return serdatr;
	}

	/*---------------------------------*/

	/*this.setup = function() { //serial_init()
	}*/

	this.cleanup = function() { //serial_exit()
		dtr = false;
		oldserbits = 0;
	}
}

function SAEO_Parallel() {
	const DEBUGIO = 0; /* 0-1 */
	const DEBUGHS = 0; /* 0-1 */

	var status = 4; /* SEL */

	/*---------------------------------*/
	/* direct */

	this.direct_write_status = function(v, dir) {
		if (DEBUGHS) SAEF_log("parallel.WS(%02x, %02x)", v, dir);

		//status = 0; if ((dir & 4) && !(v & 4)) status = 4;
		SAER.cia.parallelack();
	}

	this.direct_read_status = function() {
		if (DEBUGHS) SAEF_log("parallel.RS() %02x", status);

		SAER.cia.parallelack();
		return status;
	}

	this.direct_write_data = function(v, dir) {
		if (DEBUGIO) SAEF_log("parallel.WD(%02x, %02x)", v, dir);

		SAEV_config.hook.parallel.put(v);
		SAER.cia.parallelack();
	}

	this.direct_read_data = function() {
		var v = SAEV_config.hook.parallel.get() & 0xff;
		SAER.cia.parallelack();

		if (DEBUGIO) SAEF_log("parallel.RD() %02x", v);
		return v;
	}

	/*---------------------------------*/
	/* printer */

	/*this.doprinter = function() {}*/

	/*---------------------------------*/

	/*this.isprinter = function() {
		If enabled parport-joystick can not work, but parport-joystick is not enabled anyway.
		0 = disabled, -1 = direct, 1 = printer
		return -1;
	}*/

	/*---------------------------------*/

	/*this.reset = function() { //initparallel()
	}*/
}
