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
| Note: ported from WinUAE 3.2.x
-------------------------------------------------------------------------*/

function SAEO_Serial() {
	const WARN_SERIAL = true;
	const DEBUG_SERIAL = 0; /* 0,1,2,3 */

	var inbuf = new Uint8Array(1024);
	var outbuf = new Uint8Array(1024);
	var inptr = 0, inlast = 0, outlast = 0;

	var waitqueue = false;
	var dsr = false;
	var dtr = false;
	//var carrier = false;
	var notify = false;
	var serdev = false;

	var serper = 0, serdat = 0;

	/*---------------------------------*/

	function open() { //serial_open()
		if (serdev)
			return;

		/*if ((sd = open(currprefs.sername, O_RDWR|O_NONBLOCK|O_BINARY, 0)) < 0) {
			SAEF_log("serial.open() Could not open Device %s", currprefs.sername);
			return;
		}
		serdev = true;

		if (tcgetattr (sd, &tios) < 0) {
			SAEF_log("serial.open() TCGETATTR failed");
			return;
		}
		cfmakeraw(&tios);

		#ifndef MODEMTEST
		tios.c_cflag &= ~CRTSCTS;
		#else
		tios.c_cflag |= CRTSCTS;
		#endif

		if (tcsetattr (sd, TCSADRAIN, &tios) < 0)
			SAEF_log("serial.open() TCSETATTR failed");*/
	}
	function close() { //serial_close()
		//if (sd >= 0) close(sd);
		serdev = false;
	}

	/*---------------------------------*/

	function read_buffer() {
		if (inptr < inlast)
			return inbuf[inptr++];

		/*if (serdev) {
			inlast = read(sd, inbuf, 1024);
			inptr = 0;
			if (inptr < inlast)
				return inbuf[inptr++];
		}*/
		return false;
	}

	function flush_buffer() {
		if (outlast > 0) { //OWN
			var str = "";
			for (var i = 0; i < outlast; i++)
				str += String.fromCharCode(outbuf[i]);

			//SAEF_info(str);
			console.log(str);
		}
		if (serdev) {
			/*if (outlast) {
				if (sd != 0)
					write(sd, outbuf, outlast);
			}*/
			outlast = 0;
		} else {
		  outlast = 0;
		  inptr = 0;
		  inlast = 0;
		}
	}

	/*---------------------------------*/

	this.SERPER = function(w) {
		var baud, pspeed;

		if (!SAEV_config.serial.enabled)
			return;
		if (serper == w)  /* don't set baudrate if it's already ok */
			return;

		serper = w;
		if (WARN_SERIAL && (w & 0x8000)) SAEF_warn("serial.SERPER() 9bit transmission not implemented.");

		switch (w & 0x7fff) {
			case 0x2e9b:
			case 0x2e14: baud = 300; pspeed = 300; break;
			case 0x170a:
			case 0x0b85: baud = 1200; pspeed = 1200; break;
			case 0x05c2:
			case 0x05b9: baud = 2400; pspeed = 2400; break;
			case 0x02e9:
			case 0x02e1: baud = 4800; pspeed = 4800; break;
			case 0x0174:
			case 0x0170: baud = 9600; pspeed = 9600; break;
			case 0x00b9:
			case 0x00b8: baud = 19200; pspeed = 19200; break;
			case 0x005c:
			case 0x005d: baud = 38400; pspeed = 38400; break;
			case 0x003d: baud = 57600; pspeed = 57600; break;
			case 0x001e: baud = 115200; pspeed = 115200; break;
			case 0x000f: baud = 230400; pspeed = 230400; break;
			default: {
				if (WARN_SERIAL) SAEF_warn("serial.SERPER() unsupported baudrate (0x%04x) %d", w & 0x7fff, ~~(3579546.471 / ((w & 0x7fff) + 1)));
				return;
			}
		}
		if (serdev) {
			/*if (tcgetattr(sd, &tios) < 0) {
				if (WARN_SERIAL) SAEF_warn("serial.SERPER() TCGETATTR failed");
				return;
			}
			if (cfsetispeed(&tios, pspeed) < 0) {
				if (WARN_SERIAL) SAEF_warn("serial.SERPER() CFSETISPEED (%d bps) failed", baud);
				return;
			}
			if (cfsetospeed(&tios, pspeed) < 0) {
				if (WARN_SERIAL) SAEF_warn("serial.SERPER() CFSETOSPEED (%d bps) failed", baud);
				return;
			}
			if (tcsetattr(sd, TCSADRAIN, &tios) < 0) {
				if (WARN_SERIAL) SAEF_warn("serial.SERPER() TCSETATTR failed");
				return;
			}*/
		}
		if (DEBUG_SERIAL > 0) SAEF_log("serial.SERPER() baudrate set to %d bit/sec", baud);
	}

	this.SERDAT = function(w) {
		if (!SAEV_config.serial.enabled)
			return;

		var z = w & 0xff;

		if (SAEV_config.serial.demand && !dtr) {
			if (!notify) {
				if (WARN_SERIAL) SAEF_warn("serial.SERDAT() Your software needs SERIAL ALWAYS to work properly. (disable 'serial.demand' in the config)");
				notify = true;
			}
			return;
		} else {
			outbuf[outlast++] = z;
			if (outlast == outbuf.length)
				flush_buffer();
		}

		if (DEBUG_SERIAL > 2) SAEF_log("serial.SERDAT() wrote 0x%04x", w);

		serdat |= 0x2000; /* Set TBE in the SERDATR ... */
		SAEV_Custom_intreq |= SAEC_Custom_INTF_TBE;	/* ... and in INTREQ register */
		return;
	}

	this.SERDATR = function() {
		if (!SAEV_config.serial.enabled)
			return 0x2000;

		if (DEBUG_SERIAL > 2) SAEF_log("serial.SERDATR() read 0x%04x", serdat);
		waitqueue = false;
		return serdat;
	}

	this.SERDATS = function() {
		if (!serdev) /* || (serdat & 0x4000)) */
			return 0;

		if (waitqueue) {
			SAEV_Custom_intreq |= SAEC_Custom_INTF_RBF;
			return 1;
		}
		var z;
		if ((z = read_buffer()) !== false) {
			waitqueue = true;
			serdat = 0x4100; /* RBF and STP set! */
			serdat |= (z & 0xff);
			SAEV_Custom_intreq |= SAEC_Custom_INTF_RBF; /* Set RBF flag (Receive Buffer full) */

			if (DEBUG_SERIAL > 1) SAEF_log("serial.SERDATS() received 0x%02x --> serdat 0x%04x", z, serdat);
			return 1;
		}
		return 0;
	}

	/*---------------------------------*/

	this.dtr_on = function() {
		if (DEBUG_SERIAL > 0) SAEF_log("serial.dtr_on()");
		dtr = true;
		if (SAEV_config.serial.demand)
			open();
	}
	this.dtr_off = function() {
		if (DEBUG_SERIAL > 0) SAEF_log("serial.dtr_off()");
		dtr = false;
		if (SAEV_config.serial.demand)
			close();
	}

	this.readstatus = function(ignored) {
		var status = 0;

		/*ioctl (sd, TIOCMGET, &status);
		if (status & TIOCM_CAR) {
			if (!carrier) {
				ciabpra |= 0x20;
				carrier = true;
				if (DEBUG_SERIAL > 0) SAEF_log("serial.readstatus() Carrier detect");
			}
		} else {
			if (carrier) {
				ciabpra &= ~0x20;
				carrier = false;
				if (DEBUG_SERIAL > 0) SAEF_log("serial.readstatus() Carrier lost");
			}
		}
		if (status & TIOCM_DSR) {
			if (!dsr) {
				ciabpra |= 0x08;
				dsr = true;
			}
		} else {
			if (dsr) {
				ciabpra &= ~0x08;
				dsr = false;
			}
		}*/
		return status;
	}

	this.writestatus = function(old, nw) {
		if ((old & 0x80) == 0x80 && (nw & 0x80) == 0x00) this.dtr_on();
		if ((old & 0x80) == 0x00 && (nw & 0x80) == 0x80) this.dtr_off();

		if (DEBUG_SERIAL > 0) {
			if ((old & 0x40) != (nw & 0x40)) SAEF_log("serial.writestatus() RTS %s", ((nw & 0x40) == 0x40) ? "set" : "cleared");
			if ((old & 0x10) != (nw & 0x10)) SAEF_log("serial.writestatus() CTS %s", ((nw & 0x10) == 0x10) ? "set" : "cleared");
		}
		return nw;
	}

	/*---------------------------------*/

	this.setup = function() { //serial_init()
		if (!SAEV_config.serial.enabled)
			return;
		if (!SAEV_config.serial.demand)
			open();

		serdat = 0x2000;
	}
	this.cleanup = function() { //serial_exit()
		close();
		dtr = false;
	}

	this.reset = function() {
		inptr = 0, inlast = 0, outlast = 0

		waitqueue = false;
		dsr = false;
		dtr = false;
		//carrier = false;
		notify = false;

		serper = 0;
		serdat = 0x2000;
	};
}
