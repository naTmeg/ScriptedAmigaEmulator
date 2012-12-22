/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/

function set_special(x) { AMIGA.spcflags |= x; }
function clr_special(x) { AMIGA.spcflags &= ~x; }
 
function Amiga() {
	this.config = new Config();
	this.mem = new Memory();
	this.expansion = new Expansion();
	this.input = new Input();
	this.serial = new Serial();
	this.events = new Events();
	this.disk = new Disk();
	this.cia = new CIA();
	this.rtc = new RTC();
	this.custom = new Custom();
	this.blitter = new Blitter();
	this.copper = new Copper();
	this.playfield = new Playfield();
	this.video = new Vide0();
	this.audio = new Audi0();
	this.cpu = new CPU();

	this.state = CMD_STOP;
	this.delay = 0;
	this.spcflags = 0;
	//this.loading = 0;
		
	this.intena = 0;
	this.intena_internal = 0;
	this.intreq = 0;
	this.intreq_internal = 0;
	this.dmacon = 0;
	this.adkcon = 0;
	
	configSetDefaults(this.config);
	
	/*---------------------------------*/

	this.setup = function() {
		if (this.config.chipset.type == SAEV_Config_Chipset_Type_OCS)
			this.config.chipset.agnus = this.config.video.ntsc ? AGNUS_8370 : AGNUS_8371;

		this.mem.setup();
		this.expansion.setup();
		this.events.setup();
		this.cia.setup();
		this.rtc.setup();
		this.input.setup();
		this.disk.setup();
		this.playfield.setup();
		this.video.setup();
		this.audio.setup();
		this.custom.setup();
		this.cpu.setup();
	}

	this.cleanup = function() {
		this.audio.cleanup();
		this.video.cleanup();
		this.playfield.cleanup();
		this.input.cleanup();
	}

	this.reset = function() { 
		BUG.info('Amiga.reset()');			

		this.delay = 0;
		//this.loading = 0;

		this.intena = 0;
		this.intena_internal = 0;
		this.intreq = 0;
		this.intreq_internal = 0;
		this.dmacon = 0;
		this.adkcon = 0;

		this.expansion.reset();
		this.events.reset();
		this.cia.reset();
		this.disk.reset();
		this.input.reset();
		this.serial.reset();
		this.blitter.reset();
		this.copper.reset();
		this.playfield.reset();
		this.audio.reset();
		this.custom.reset();
		this.cpu.reset(this.mem.rom.lower);
	}

	this.dump = function() {
		this.cpu.dump();
		//this.cia.dump();
	}
	
	/*---------------------------------*/

	/*this.waitForStart = function() {
		if (this.loading)
			setTimeout('AMIGA.waitForStart()', 10);
		else {
			this.reset();
			this.state = CMD_CYCLE;
			setTimeout('AMIGA.cycle()', 0);
		}
	}
	this.start = function() {
		this.setup();
		this.waitForStart();
	}*/
	
	
	this.start = function() {
		if (this.state == CMD_STOP) {
			this.setup();
			this.reset();
			this.state = CMD_CYCLE;
			setTimeout('AMIGA.cycle()', 0);
		}
	}
	
	this.stop = function() {
		if (this.state != CMD_STOP) {
			this.state = CMD_STOP;
			this.cleanup();
		}
	}
	
	this.pause = function(state) {
		if (this.state != CMD_STOP) {
			this.state = state ? CMD_PAUSE : CMD_CYCLE;
			this.audio.pauseResume(state);	
		}
	}
	
	/*this.insert = function(unit, name, data) {
		//this.disk.insert_data(unit, data);		
		this.disk.insert(unit, name, data);
		this.config.floppy.drive[unit].name = name;
	}
	this.eject = function(unit) {
		if (this.config.floppy.drive[unit].name) {
			this.disk.eject(unit);
			//this.disk.eject_data(unit);
			this.config.floppy.drive[unit].name = null;
			BUG.info('amiga.eject() DF%d ejected', unit);
		} else
			BUG.info('amiga.eject() DF%d in empty', unit);
	}
	*/
	
	this.insert = function(unit) {		
		if (this.state != CMD_STOP)
			this.disk.insert(unit);
	}
		
	this.eject = function(unit) {
		if (this.state != CMD_STOP)
			this.disk.eject(unit);
	}

	/*---------------------------------*/
	/* mainloop */		
	
	this.cycle = function() {
		try {
			while (this.state == CMD_CYCLE)
				this.cpu.cycle();
		} catch (e) {
			if (e instanceof FatalError) {
				this.stop();
				this.config.hooks.error(e.error, e.message);
			} else
				console.log(e);		
		}

		if (this.state == CMD_IDLE) {
			this.state = CMD_CYCLE;
			setTimeout('AMIGA.cycle()', this.delay);
		}
		else if (this.state == CMD_PAUSE)
			setTimeout('AMIGA.cyclePause()', 0);
		else
			setTimeout('AMIGA.cycleExit()', 0);
	}

	this.cyclePause = function() {
		if (this.state == CMD_CYCLE)
			setTimeout('AMIGA.cycle()', 0);
		else if (this.state == CMD_PAUSE)
			setTimeout('AMIGA.cyclePause()', 500);
		else
			setTimeout('AMIGA.cycleExit()', 0);
	}
	
	this.cycleExit = function() {
		this.dump();
	}
		
	/*---------------------------------*/

	this.dmaen = function (dmamask) {
		return ((this.dmacon & DMAF_DMAEN) && (this.dmacon & dmamask));
	}

	this.DMACONR = function(hpos) {
		this.dmacon &= ~(0x4000 | 0x2000);
		//this.dmacon |= (this.blitter.state == BLT_STOP ? 0 : 0x4000) | (this.blitter.zero ? 0x2000 : 0); //old
		//this.dmacon |= ((blit_interrupt || (!blit_interrupt && currprefs.cs_agnusbltbusybug && !blt_info.got_cycle)) ? 0 : 0x4000) | (blt_info.blitzero ? 0x2000 : 0); //new org
		var iz = this.blitter.getIntZero();
		this.dmacon |= (iz[0] ? 0 : 0x4000) | (iz[1] ? 0x2000 : 0);
		return this.dmacon;
	}

	this.DMACON = function (v, hpos) {
		var oldcon = this.dmacon;
		
		if (v & INTF_SETCLR)
			this.dmacon |= v & ~INTF_SETCLR;
		else
			this.dmacon &= ~v;
			
		this.dmacon &= 0x1fff;
		
		var changed = this.dmacon ^ oldcon;

		var oldcop = (oldcon & DMAF_COPEN) && (oldcon & DMAF_DMAEN);
		var newcop = (this.dmacon & DMAF_COPEN) && (this.dmacon & DMAF_DMAEN);
		if (oldcop != newcop) {
			if (newcop && !oldcop) {
				this.copper.compute_spcflag_copper(this.events.hpos());
			} else if (!newcop) {
				this.copper.enabled_thisline = false;
				clr_special (SPCFLAG_COPPER);
			}
		}
		//if ((this.dmacon & DMAF_COPEN) > (oldcon & DMAF_COPEN))
			//this.copper.COPJMP(1, 0);
		
		if ((this.dmacon & DMAF_SPREN) > (oldcon & DMAF_SPREN)) {
			for (var i = 0; i < 8; i++)
			this.playfield.sprites.sprite[i].dmastate = 1;
		}
		if ((this.dmacon & DMAF_BLTPRI) > (oldcon & DMAF_BLTPRI) && this.blitter.getState() != BLT_done)
			set_special(SPCFLAG_BLTNASTY);
		if (this.dmaen(DMAF_BLTEN) && this.blitter.getState() == BLT_init)
			this.blitter.setState(BLT_work);
		if ((this.dmacon & (DMAF_BLTPRI | DMAF_BLTEN | DMAF_DMAEN)) != (DMAF_BLTPRI | DMAF_BLTEN | DMAF_DMAEN))
			clr_special(SPCFLAG_BLTNASTY);
		
		if (changed & (DMAF_DMAEN | 0x0f))
			this.audio.state_machine();
		
		/*if (this.copper.active && !this.events.eventtab[EV_COPPER].active) {
			this.events.eventtab[EV_COPPER].active = true;
			this.events.eventtab[EV_COPPER].oldcycles = this.events.currcycle;
			this.events.eventtab[EV_COPPER].evtime = 1 * CYCLE_UNIT + this.events.currcycle;
			this.events.schedule();
		}*/
	}	
	
	/*---------------------------------*/

	this.ADKCONR = function () {
		return this.adkcon;
	}

	this.ADKCON = function (v, hpos) {
		if (this.config.audio.enabled)
			this.audio.update();

		this.disk.update(hpos);
		this.disk.update_adkcon(v);
		
		if (v & INTF_SETCLR)
			this.adkcon |= v & ~INTF_SETCLR;
		else
			this.adkcon &= ~v;
		
		this.audio.update_adkmasks();
	}

	/*---------------------------------*/

	this.INTENAR = function () {
		return this.intena;
	}

	this.INTENA = function(v) {
		var old = this.intena;
		
		if (v & INTF_SETCLR)
			this.intena |= v & ~INTF_SETCLR;
		else
			this.intena &= ~v;

		if (!(v & INTF_SETCLR) && old == this.intena)
			return;

		if (AMIGA.config.cpu.exact) {
			this.events.event2_newevent_xx(-1, INT_PROCESSING_DELAY, this.intena, function(v) { 
				//console.log('INTENA()', v);
				AMIGA.intena_internal = v;
				AMIGA.doint();
			});
		} else {
			this.intena_internal = this.intena;
			if (v & INTF_SETCLR)
				this.doint();
		}
	}

	/*---------------------------------*/

	this.INTREQR = function () {
		return this.intreq; 
	}

	this.INTREQ_0 = function(v) {
		var old = this.intreq;
		
		if (v & INTF_SETCLR)
			this.intreq |= v & ~INTF_SETCLR;
		else
			this.intreq &= ~v;

		if (AMIGA.config.cpu.exact) {
			if (old == this.intreq && this.intreq_internal == this.intreq)
				return;

			this.events.event2_newevent_xx(-1, INT_PROCESSING_DELAY, this.intreq, function(v) { 
				//console.log('INTREQ_0()', v);
				AMIGA.intreq_internal = v;
				AMIGA.doint();
			});
		} else {
			this.intreq_internal = this.intreq;
			if (this.intreq == old)
				return;
			if (v & INTF_SETCLR)
				this.doint();
		}
	}

	this.INTREQ = function(v) {
		this.INTREQ_0(v);
		this.cia.reThink();
	}	
		
	this.intlev = function() {
		var imask = this.intreq_internal & this.intena_internal;
		
		if (imask && (this.intena_internal & INTF_INTEN)) {
			if (imask & 0x2000) return 6;
			if (imask & (0x1000 | 0x0800)) return 5;
			if (imask & (0x0400 | 0x0200 | 0x0100 | 0x0080)) return 4;
			if (imask & (0x0040 | 0x0020 | 0x0010)) return 3;
			if (imask & 0x0008) return 2;
			if (imask & (0x0001 | 0x0002 | 0x0004)) return 1;
		}
		return -1;
	}

	this.doint = function() {
		if (AMIGA.config.cpu.exact) {
			this.cpu.setIPL(this.intlev());
			clr_special(SPCFLAG_INT);
			return;
		}
		if (AMIGA.config.cpu.compatible)
			set_special(SPCFLAG_INT);
		else
			set_special(SPCFLAG_DOINT);
	}
	
	this.send_interrupt = function(num, delay) {
		if (AMIGA.config.cpu.exact && delay > 0) {
			if (!(this.intreq & (1 << num))) {
				this.events.event2_newevent_xx(-1, delay, num, function(v) {
					AMIGA.INTREQ_0(INTF_SETCLR | (1 << v));
				});
			}
		} else
			this.INTREQ_0(INTF_SETCLR | (1 << num));
	}
}

/*-----------------------------------------------------------------------*/
/* This API will change in the future. */

function SAE(x) {
	try {
		switch (x.cmd) {
			case 'init':
				BUG = new Debug();
				BUG.info('API.init() SEA %d.%d.%d', SAEV_Version, SAEV_Revision, SAEV_Revision_Sub);

				AMIGA = new Amiga();
				return AMIGA.config;
			case 'reset':
				BUG.info('API.reset()');
				AMIGA.reset();
				break;
			case 'start':
				BUG.info('API.start()');
				AMIGA.start();
				break;
			case 'stop':
				BUG.info('API.stop()');
				AMIGA.stop();
				break;
			case 'reset':
				BUG.info('API.reset()');
				AMIGA.reset();
				break;
			case 'pause':
				BUG.info('API.pause() %d', x.state);
				AMIGA.pause(x.state);
				break;
			/*case 'insert':
				BUG.info('API.insert() DF%d, name "%s", length %d', x.unit, x.name, x.data.length);
				AMIGA.insert(x.unit, x.name, x.data);
				break;*/
			case 'insert':
				BUG.info('API.insert() DF%d', x.unit);
				AMIGA.insert(x.unit);
				break;
			case 'eject':
				BUG.info('API.eject() DF%d', x.unit);
				AMIGA.eject(x.unit);
				break;
			/*case 'getConfig':
				BUG.info('API.getConfig()');
				return AMIGA.config;
			case 'setConfig':
				BUG.info('API.setConfig() size '+x.data.ext.size);
				AMIGA.config = x.data;
				break;*/
		}		
	} catch (e) {
		if (e instanceof FatalError) {
			AMIGA.stop();
			//return { error:e.error, message:e.message };
			AMIGA.config.hooks.error(e.error, e.message);
		} else
			console.log(e);		
	}
	//return SAEE_None;
	//return { error:SAEE_None, message:'' };
}
