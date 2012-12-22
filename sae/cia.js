/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/

function CIA_8520(type) {
	const STARTCYCLESHI = 3;
	const STARTCYCLESCRA = 2;

	this.type = type;

	this.icr = 0;
	this.icrReg = 0;
	this.iMask = 0;
	this.iFlag = type == CIA_A ? INTF_PORTS : INTF_EXTER; /* 0x0008 : 0x2000 */

	this.cra = 0;
	this.crb = 0;
	this.dra = 0;
	this.drb = 0;
	this.pra = 0;
	this.prb = 0;
	this.sdr = 0;
	this.sdrCnt = 0;

	this.ta = 0;
	this.tb = 0;
	this.taPassed = 0;
	this.tbPassed = 0;
	this.la = 0;
	this.lb = 0;
	this.starta = 0;
	this.startb = 0;

	this.todOn = false;
	this.tod = 0;
	this.tol = 0;
	this.tlatch = 0;
	this.alarm = 0;

	this.reset = function() {
		this.icr = this.iMask = 0;
		this.cra = this.crb = 0x4;
		this.dra = this.drb = 0;
		this.pra = this.type == CIA_A ? 0 : 0x8c;
		this.sdr = 0;
		this.sdrCnt = 0;
		this.la = this.lb = this.ta = this.tb = 0xffff;
		this.taPassed = this.tbPassed = 0;
		this.tod = 0;
		this.todOn = false;
		this.tlatch = 0;
		this.alarm = 0;
	}

	this.dump = function() {
		BUG.info('CIA_8520.dump() %s | pra $%02x prb $%02x | dra $%02x drb $%02x | ta %5d (la %5d) tb %5d (lb %5d) | tod %5d (tol %5d) alarm %5d latch %d | sdr $%02x | icr $%02x iMask $%02x | cra $%02x crb $%02x',
		this.type == CIA_A ? 'A' : 'B', this.pra, this.prb, this.dra, this.drb, this.ta, this.la, this.tb, this.lb, this.tod, this.tol, this.alarm, this.latch ? 1 : 0, this.sdr, this.icr, this.iMask, this.cra, this.crb);
	}

	this.setClr = function (val) {
		if (val & 0x80) this.iMask |= val & 0x7f;
		else this.iMask &= ~val;
	}

	this.setICR = function (icr, sdr) {
		if (sdr !== null)
			this.sdr = sdr;

		this.icr |= icr;
		this.reThink();
	}
	
	this.ICR = function() {
		if (this.iMask & this.icr) {
			this.icr |= 0x80;
			AMIGA.INTREQ_0(INTF_SETCLR | this.iFlag);
		}
		this.icrReg |= this.icr;
	}

	this.reThink = function() {
		if (this.icr) {
			if (AMIGA.config.cpu.exact)
				AMIGA.events.event2_newevent_xx(-1, CIA_RETHINK_DELAY, this.type, function(v) { AMIGA.cia.ICR(v); });
			else
				this.ICR();
		}
	}

	this.updateCheck = function (ciaclocks) {
		var ovfla = false;
		var ovflb = false;
		var sp = false;
		var needReThink = false;

		if ((this.cra & 0x21) == 0x01) {
			//BUG.info('CIA.updateCheck() ciaclocks %d, starta %d, ta %d', ciaclocks, this.starta, this.ta);
			var check = true;
			var cc = ciaclocks;
			if (this.starta > 0) {
				if (cc > this.starta) {
					cc -= this.starta;
					this.starta = 0;
				} else {
					this.starta -= cc;
					check = false;
				}
			}
			if (check) {
				//assert ((this.ta + 1) >= cc);
				if ((this.ta + 1) == cc) {
					if ((this.cra & 0x48) == 0x40 && this.sdrCnt > 0 && --this.sdrCnt == 0) sp = true;

					ovfla = true;
					if ((this.crb & 0x61) == 0x41 || (this.crb & 0x61) == 0x61) {
						if (this.tb-- == 0) ovflb = true;
					}
				}
				this.ta -= cc;
			}
		}
		if ((this.crb & 0x61) == 0x01) {
			//BUG.info('CIA.updateCheck() ciaclocks %d, startb %d, tb %d', ciaclocks, this.startb, this.tb);
			var check = true;
			var cc = ciaclocks;
			if (this.startb > 0) {
				if (cc > this.startb) {
					cc -= this.startb;
					this.startb = 0;
				} else {
					this.startb -= cc;
					check = false;
				}
			}
			if (check) {
				//assert ((this.tb + 1) >= cc);
				if ((this.tb + 1) == cc) ovflb = true;
				this.tb -= cc;
			}
		}

		if (ovfla) {
			this.icr |= 1;
			needReThink = true;
			this.ta = this.la;
			if (this.cra & 0x8) {
				this.cra &= ~1;
			}
		}
		if (ovflb) {
			this.icr |= 2;
			needReThink = true;
			this.tb = this.lb;
			if (this.crb & 0x8) {
				this.crb &= ~1;
			}
		}
		if (sp) {
			this.icr |= 8;
			needReThink = true;
		}
		return needReThink;
	}

	this.calcTimers = function (div10diff) {
		var time = [-1, -1];

		if ((this.cra & 0x21) == 0x01) time[0] = div10diff + DIV10 * (this.ta + this.starta);
		if ((this.crb & 0x61) == 0x01) time[1] = div10diff + DIV10 * (this.tb + this.startb);

		//if (time[0] != -1 || time[1] != -1) BUG.info('CIA.calcTimers() div10diff %d, timea %d, timeb %d', div10diff, time[0], time[1]);			
		return time;
	}

	this.checkAlarm = function (inc) {
		var alarm;

		if (this.tod == this.alarm) alarm = true;
		else if (!inc) alarm = false;
		else if (this.tod & 0x000fff) alarm = false;
		else if (((this.tod - 1) & 0xfff000) == this.alarm) alarm = true;
		else alarm = false;

		if (alarm) {
			this.icr |= 4;
			this.reThink();
		}
	}

	this.calcPassedTime = function() {
		var ccount = AMIGA.events.currcycle - AMIGA.events.eventtab[EV_CIA].oldcycles + AMIGA.cia.div10;
		var ciaclocks = Math.floor(ccount / DIV10);

		this.taPassed = this.tbPassed = 0;

		if ((this.cra & 0x21) == 0x01) {
			var cc = ciaclocks;
			if (cc > this.starta) cc -= this.starta;
			else cc = 0;
			//assert ((this.ta + 1) >= cc);
			this.taPassed = cc;
		}
		if ((this.crb & 0x61) == 0x01) {
			var cc = ciaclocks;
			if (cc > this.startb) cc -= this.startb;
			else cc = 0;
			//assert ((this.tb + 1) >= cc);
			this.tbPassed = cc;
		}
	}

	this.read = function (addr) {
		var reg = addr & 15;
		var tmp;

		this.calcPassedTime();

		switch (reg) {
			case 0: {
				if (this.type == CIA_A) {
					tmp = AMIGA.disk.status() & 0x3c;

					if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Mouse) {
						if (!AMIGA.input.mouse.button[0]) tmp |= 0x40;
						if (this.dra & 0x40) tmp = (tmp & ~0x40) | (this.pra & 0x40);
					} else if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Joy0) {
						if (!AMIGA.input.joystick[0].button[0]) tmp |= 0x40;
						if (this.dra & 0x40) tmp = (tmp & ~0x40) | (this.pra & 0x40);
					} else tmp |= 0x40;

					if (AMIGA.config.ports[1].type == SAEV_Config_Ports_Type_Joy1) {
						if (!AMIGA.input.joystick[1].button[0]) tmp |= 0x80;
						if (this.dra & 0x80) tmp = (tmp & ~0x80) | (this.pra & 0x80);
					} else tmp |= 0x80;

					tmp |= (this.pra | (this.dra ^ 3)) & 3;
				} else {
					//tmp = 0xf8;
					tmp = AMIGA.serial.readStatus(this.dra);
				}
				return tmp;
			}
			case 1: {
				if (this.type == CIA_A) {
					tmp = 0;
				} else {
					tmp = this.prb;
				}
				if (this.crb & 2) {
					var pb7 = 0;
					if (this.crb & 4) pb7 = this.crb & 1;
					tmp &= ~0x80;
					tmp |= pb7 ? 0x80 : 0;
				}
				if (this.cra & 2) {
					var pb6 = 0;
					if (this.cra & 4) pb6 = this.cra & 1;
					tmp &= ~0x40;
					tmp |= pb6 ? 0x40 : 0;
				}
				return tmp;
			}
			case 2:
				return this.dra;
			case 3:
				return this.drb;
			case 4:
				return ((this.ta - this.taPassed) & 0xff);
			case 5:
				return ((this.ta - this.taPassed) >> 8) & 0xff;
			case 6:
				return ((this.tb - this.tbPassed) & 0xff);
			case 7:
				return ((this.tb - this.tbPassed) >> 8) & 0xff;
			case 8: {
				if (this.tlatch) {
					this.tlatch = 0;
					return this.tol & 0xff;
				} else return this.tod & 0xff;
			}
			case 9: {
				if (this.tlatch) return (this.tol >> 8) & 0xff;
				else return (this.tod >> 8) & 0xff;
			}
			case 10: {
				if (!this.tlatch) {
					if (!(this.crb & 0x80)) this.tlatch = 1;
					this.tol = this.tod;
				}
				return (this.tol >>> 16) & 0xff;
			}
			case 12:
				return this.sdr;
			case 13: {
				tmp = this.icrReg;
				this.icr &= ~this.icrReg;
				this.icrReg = 0;
				this.reThink();
				return tmp;
			}
			case 14:
				return this.cra;
			case 15:
				return this.crb;
		}
	}

	this.write = function (addr, val) {
		var reg = addr & 15;

		switch (reg) {
			case 0: {
				if (this.type == CIA_A) {
					this.pra = (this.pra & 0x3c) | (val & 0xc3);
					AMIGA.cia.handlePowerLED(this.pra, this.dra);
				} else {
					this.pra = val;
					AMIGA.serial.writeStatus(this.pra, this.dra);
				}
				break;
			}
			case 1: {
				if (this.type == CIA_A) {
					this.prb = val;
				} else {
					this.prb = val;
					AMIGA.disk.select(val);
				}
				break;
			}
			case 2: {
				if (this.type == CIA_A) {
					this.dra = val;
					AMIGA.cia.handlePowerLED(this.pra, this.dra);
				} else {
					this.dra = val;
					AMIGA.serial.writeStatus(this.pra, this.dra);
				}
				break;
			}
			case 3: {
				if (this.type == CIA_A) {
					this.drb = val;
				} else {
					this.drb = val;
				}
				break;
			}
			case 4: {
				AMIGA.cia.update();
				this.la = (this.la & 0xff00) | val;
				AMIGA.cia.calcTimers();
				break;
			}
			case 5: {
				AMIGA.cia.update();
				this.la = (this.la & 0x00ff) | (val << 8);
				if ((this.cra & 1) == 0) this.ta = this.la;
				if (this.cra & 8) {
					this.ta = this.la;
					this.cra |= 1;
					this.starta = STARTCYCLESHI;
				}
				AMIGA.cia.calcTimers();
				break;
			}
			case 6: {
				AMIGA.cia.update();
				this.lb = (this.lb & 0xff00) | val;
				AMIGA.cia.calcTimers();
				break;
			}
			case 7: {
				AMIGA.cia.update();
				this.lb = (this.lb & 0x00ff) | (val << 8);
				if ((this.crb & 1) == 0) this.tb = this.lb;
				if (this.crb & 8) {
					this.tb = this.lb;
					this.crb |= 1;
					this.startb = STARTCYCLESHI;
				}
				AMIGA.cia.calcTimers();
				break;
			}
			case 8: {
				if (this.crb & 0x80) {
					this.alarm = (this.alarm & 0xffff00) | val;
				} else {
					this.tod = (this.tod & 0xffff00) | val;
					this.todOn = true;
					this.checkAlarm(0);
				}
				break;
			}
			case 9: {
				if (this.crb & 0x80) {
					this.alarm = (this.alarm & 0xff00ff) | (val << 8);
				} else {
					this.tod = (this.tod & 0xff00ff) | (val << 8);
				}
				break;
			}
			case 10: {
				if (this.crb & 0x80) {
					this.alarm = (this.alarm & 0x00ffff) | (val << 16);
				} else {
					this.tod = (this.tod & 0x00ffff) | (val << 16);
					this.todOn = false;
				}
				break;
			}
			case 12: {
				AMIGA.cia.update();
				this.sdr = val;
				if (this.type == CIA_B && (this.cra & 0x40) == 0) this.sdrCnt = 0;
				if ((this.cra & 0x41) == 0x41 && this.sdrCnt == 0) this.sdrCnt = 8 * 2;
				AMIGA.cia.calcTimers();
				break;
			}
			case 13: {
				this.setClr(val);
				break;
			}
			case 14: {
				AMIGA.cia.update();
				val &= 0x7f;
				if ((val & 1) && !(this.cra & 1)) this.starta = STARTCYCLESCRA;
				if (this.type == CIA_A && (val & 0x40) != (this.cra & 0x40)) {
					AMIGA.input.keyboard.lostsynccnt = 0;
					//BUG.info('KB_ACK %02x to %02x', val, this.cra);
				}
				this.cra = val;
				if (this.cra & 0x10) {
					this.cra &= ~0x10;
					this.ta = this.la;
				}
				AMIGA.cia.calcTimers();
				break;
			}
			case 15: {
				AMIGA.cia.update();
				if ((val & 1) && !(this.crb & 1)) this.startb = STARTCYCLESCRA;
				this.crb = val;
				if (this.crb & 0x10) {
					this.crb &= ~0x10;
					this.tb = this.lb;
				}
				AMIGA.cia.calcTimers();
				break;
			}
		}
	}
}

function CIA() {
	this.A = new CIA_8520(CIA_A);
	this.B = new CIA_8520(CIA_B);
	this.div10 = 0;

	var led = true;

	var todHack = {
		active: true,
		enabled: false,
		rate: 0.0,
		tv: 0.0
	};

	this.setup = function() {
		if (todHack.active) todHack.rate = 1000.0 / AMIGA.events.hz;
	}

	this.reset = function() {
		this.A.reset();
		this.B.reset();
		this.div10 = 0;
		this.calcTimers(); 

		led = true;
		AMIGA.disk.select_set(this.B.prb);

		if (todHack.active) {
			todHack.enabled = AMIGA.events.maxvpos * AMIGA.events.hz * 10;
			todHack.tv = 0.0;
		}
	}

	this.dump = function() {
		this.A.dump();
		this.B.dump();
	}

	this.handlePowerLED = function (pra, dra) {
		var v = pra | (~dra & 0xff);
		var newled = (v & 2) ? 0 : 1;

		if (led != newled) {
			led = newled;
			AMIGA.audio.filter.led_filter_on = led;
			AMIGA.config.hooks.power_led(led);
		}
	}

	this.setICR = function (type, icr, sdr) {
		if (type == CIA_A)
			this.A.setICR(icr, sdr);
		else
			this.B.setICR(icr, sdr);
	}

	this.ICR = function(type) {
		if (type == CIA_A)
			this.A.ICR();
		else
			this.B.ICR();
	}

	this.reThink = function() {
		this.A.reThink();
		this.B.reThink();
	}

	this.update = function() {
		var ccount = AMIGA.events.currcycle - AMIGA.events.eventtab[EV_CIA].oldcycles + this.div10;
		var ciaclocks = Math.floor(ccount / DIV10);

		this.div10 = ccount % DIV10;

		//BUG.info('CIA.update() %d %d', ciaclocks, this.div10);		

		var a = this.A.updateCheck(ciaclocks);
		var b = this.B.updateCheck(ciaclocks);
		if (a) this.A.reThink();
		if (b) this.B.reThink();
	}

	this.calcTimers = function() {
		AMIGA.events.eventtab[EV_CIA].oldcycles = AMIGA.events.currcycle;

		var div10diff = DIV10 - this.div10;
		var a = this.A.calcTimers(div10diff);
		var b = this.B.calcTimers(div10diff);

		AMIGA.events.eventtab[EV_CIA].active = (a[0] != -1 || a[1] != -1 || b[0] != -1 || b[1] != -1);
		if (AMIGA.events.eventtab[EV_CIA].active) {
			var evtime = 0xffffffff;

			if (a[0] != -1) evtime = a[0];
			if (a[1] != -1 && a[1] < evtime) evtime = a[1];
			if (b[0] != -1 && b[0] < evtime) evtime = b[0];
			if (b[1] != -1 && b[1] < evtime) evtime = b[1];

			AMIGA.events.eventtab[EV_CIA].evtime = evtime + AMIGA.events.currcycle;
			//BUG.info('CIA.calcTimers() evtime %d', evtime);		
		}
		AMIGA.events.schedule();
	}

	this.handler = function() {
		this.update();
		this.calcTimers();
	}

	this.handleTodHack = function() {
		if (todHack.enabled > 1) {
			todHack.enabled--;
			if (todHack.enabled == 1) {
				todHack.tv = new Date().getTime();
				BUG.info('CIA.handleTodHack() enabled');
			}
			return;
		}
		if (new Date().getTime() - todHack.tv >= todHack.rate) {
			this.A.tod++;
			this.A.tod &= 0xffffff;
			this.A.checkAlarm(0);
			todHack.tv += todHack.rate;
		}
	}

	this.hSyncPre = function() {

	}

	this.hSyncPost = function (doTod) {
		if (this.B.todOn && doTod) {
			this.B.tod++;
			this.B.tod &= 0xffffff;
			this.B.checkAlarm(1);
		}

		if (todHack.active && this.A.todOn) this.handleTodHack();

		AMIGA.input.keyboard.hsync();
	}

	this.vSyncPre = function() {
		this.handler();
		AMIGA.input.keyboard.vsync();
	}

	this.vSyncPost = function (doTod) {
		if (todHack.active && todHack.enabled == 1) return;

		if (this.A.todOn && doTod) {
			this.A.tod++;
			this.A.tod &= 0xffffff;
			this.A.checkAlarm(1);
		}
	}

	this.waitPre = function() {
		//if (AMIGA.config.cpu.cachesize) return;

//#ifndef CUSTOM_SIMPLE
		/*var div = (AMIGA.events.currcycle - AMIGA.events.eventtab[EV_CIA].oldcycles) % DIV10;
		var div2 = Math.floor(DIV10 * ECLOCK_DATA_CYCLE / 10);
		var cycles;

		if (div >= div2)
			cycles = DIV10 - div + div2;
		else if (div)
			cycles = DIV10 + div2 - div;
		else 
			cycles = div2 - div;

		//BUG.info('CIA.waitPre() %d %d', div, cycles);		

		if (cycles) {
			if (AMIGA.config.cpu.exact)
				AMIGA.events.cycle(cycles);
			else
				AMIGA.events.cycle(cycles);
		}*/
//#endif
	}

	this.waitPost = function () {
		AMIGA.events.cycle(6 * CYCLE_UNIT / 2);

		/*if (AMIGA.config.cpu.cachesize)
			AMIGA.events.cycle(8 * CYCLE_UNIT /2);
		else*/ {
			var c = 6 * CYCLE_UNIT / 2;
			if (AMIGA.config.cpu.exact)
				AMIGA.events.cycle(c);
			else
				AMIGA.events.cycle(c);
		}
	}

	this.load8 = function (addr) {
		var v, r = (addr & 0xf00) >> 8;

		this.waitPre();
		switch ((addr >> 12) & 3) {
			case 0:
				v = (addr & 1) ? this.A.read(r) : this.B.read(r);
				break;
			case 1:
				v = (addr & 1) ? 0xff : this.B.read(r);
				break;
			case 2:
				v = (addr & 1) ? this.A.read(r) : 0xff;
				break;
			case 3: {
				v = 0xff;
				//if (AMIGA.config.cpu.model == 68000 && AMIGA.config.cpu.compatible) v = (addr & 1) ? regs.irc : regs.irc >> 8;
				BUG.info('CIA.load8() unknown CIA address $%08x', addr);
				break;
			}
		}
		this.waitPost();
		return v;
	}

	this.load16 = function (addr) {
		var v, r = (addr & 0xf00) >> 8;

		this.waitPre();
		switch ((addr >> 12) & 3) {
			case 0:
				v = (this.B.read(r) << 8) | this.A.read(r);
				break;
			case 1:
				v = (this.B.read(r) << 8) | 0xff;
				break;
			case 2:
				v = (0xff << 8) | this.A.read(r);
				break;
			case 3: {
				v = 0xffff;
				//if (AMIGA.config.cpu.model == 68000 && AMIGA.config.cpu.compatible) v = regs.irc;
				BUG.info('CIA.load16() unknown CIA address $%08x', addr);
				break;
			}
		}
		this.waitPost();
		return v;
	}

	this.load32 = function (addr) {
		return ((this.load16(addr) << 16) | this.load16(addr + 2)) >>> 0;
	}

	this.store8 = function (addr, value) {
		var r = (addr & 0xf00) >> 8;

		this.waitPre();
		if ((addr & 0x3000) != 0) {
			if ((addr & 0x2000) == 0) this.B.write(r, value);
			if ((addr & 0x1000) == 0) this.A.write(r, value);
		}
		this.waitPost();
	}

	this.store16 = function (addr, value) {
		var r = (addr & 0xf00) >> 8;

		this.waitPre();
		if ((addr & 0x3000) != 0) {
			if ((addr & 0x2000) == 0) this.B.write(r, value >> 8);
			if ((addr & 0x1000) == 0) this.A.write(r, value & 0xff);
		}
		this.waitPost();
	}

	this.store32 = function (addr, value) {
		this.store16(addr, value >>> 16);
		this.store16(addr + 2, value & 0xffff);
	}
}
