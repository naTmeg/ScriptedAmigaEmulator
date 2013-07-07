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
	this.info = {
		version: SAEV_Version+'.'+SAEV_Revision+'.'+SAEV_Revision_Sub,
		browser_name: BrowserDetect.browser,
		browser_version: BrowserDetect.version,
		os: BrowserDetect.OS,
		video:0,
		audio:0
	};
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

	this.state = ST_STOP;
	this.delay = 0;
	this.spcflags = 0;
	//this.loading = 0;
		
	this.intena = 0;
	this.intreq = 0;
	this.dmacon = 0;
	this.adkcon = 0;
	
	this.info.video = this.video.available; 
	this.info.audio = this.audio.available; 
	
	/*---------------------------------*/

	this.setup = function () {
      this.mem.setup();
      this.expansion.setup();
      this.events.setup();
      this.playfield.setup();
      this.video.setup();
      this.cia.setup();
      this.rtc.setup();
      this.input.setup();
      this.disk.setup();
      this.audio.setup();
      this.custom.setup();
      this.cpu.setup();
   };

	this.cleanup = function () {
      this.audio.cleanup();
      this.video.cleanup();
      this.playfield.cleanup();
      this.input.cleanup();
   };

	this.reset = function () {
      BUG.info('Amiga.reset()');

      this.delay = 0;
      this.spcflags = 0;
      //this.loading = 0;

      this.intena = 0;
      this.intreq = 0;
      this.dmacon = 0;
      this.adkcon = 0;

      this.expansion.reset();
      this.events.reset();
      this.playfield.reset();
      this.cia.reset();
      this.disk.reset();
      this.input.reset();
      this.serial.reset();
      this.blitter.reset();
      this.copper.reset();
      this.audio.reset();
      this.custom.reset();
      this.cpu.reset(this.mem.rom.lower);
   };

	this.dump = function () {
      this.cpu.dump();
      //this.cia.dump();
   };
	
	/*---------------------------------*/

	/*this.waitForStart = function() {
		if (this.loading)
			setTimeout('AMIGA.waitForStart()', 10);
		else {
			this.reset();
			this.state = ST_CYCLE;
			setTimeout('AMIGA.cycle()', 0);
		}
	}
	this.start = function() {
		this.setup();
		this.waitForStart();
	}*/
	
	
	this.start = function () {
      if (this.state == ST_STOP) {
         this.setup();
         this.reset();
         this.state = ST_CYCLE;
         setTimeout('AMIGA.cycle()', 0);
      }
   };
	
	this.stop = function () {
      if (this.state != ST_STOP) {
         this.state = ST_STOP;
         this.cleanup();
      }
   };
	
	this.pause = function (state) {
      if (this.state != ST_STOP) {
         this.state = state ? ST_PAUSE : ST_CYCLE;
         this.audio.pauseResume(state);
      }
   };
	
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
	
	this.insert = function (unit) {
      if (this.state != ST_STOP)
         this.disk.insert(unit);
   };
		
	this.eject = function (unit) {
      if (this.state != ST_STOP)
         this.disk.eject(unit);
   };

	/*---------------------------------*/
	/* mainloop */	
	
	this.cycle = function () {
      try {
         this.cpu.cycle();
      } catch (e) {
         if (e instanceof VSync) {
            //console.log(e.error, e.message);
            this.state = ST_IDLE;
         } else if (e instanceof FatalError) {
            this.state = ST_STOP;
            this.stop();
            this.config.hooks.error(e.error, e.message);
         } else /* normal exception */ {
            this.state = ST_STOP;
            this.stop();
            console.log(e);
         }
      }
      if (this.state == ST_IDLE) {
         this.state = ST_CYCLE;
         setTimeout('AMIGA.cycle()', this.delay);
      }
      else if (this.state == ST_PAUSE)
         AMIGA.cyclePause();
      else
         AMIGA.cycleExit();
   };

	this.cyclePause = function () {
      if (this.state == ST_CYCLE)
         setTimeout('AMIGA.cycle()', 0);
      else if (this.state == ST_PAUSE)
         setTimeout('AMIGA.cyclePause()', 500);
      else
         AMIGA.cycleExit();
   };
	
	this.cycleExit = function () {
      this.dump();
      //this.cia.dump();
   };
		
	/*---------------------------------*/

	this.dmaen = function (dmamask) {
      return ((this.dmacon & DMAF_DMAEN) != 0 && (this.dmacon & dmamask) != 0);
   };

	this.DMACONR = function (hpos) {
      this.playfield.decide_line(hpos);
      this.playfield.decide_fetch(hpos);
      this.dmacon &= ~(0x4000 | 0x2000);
      var iz = this.blitter.getIntZero();
      this.dmacon |= ((iz[0] ? 0 : 0x4000) | (iz[1] ? 0x2000 : 0));
      return this.dmacon;
   };

	this.DMACON = function (v, hpos) {
      var oldcon = this.dmacon;

      this.playfield.decide_line(hpos);
      this.playfield.decide_fetch(hpos);

      if (v & INTF_SETCLR)
         this.dmacon |= v & ~INTF_SETCLR;
      else
         this.dmacon &= ~v;

      this.dmacon &= 0x1fff;

      var changed = this.dmacon ^ oldcon;

      var oldcop = (oldcon & DMAF_COPEN) != 0 && (oldcon & DMAF_DMAEN) != 0;
      var newcop = (this.dmacon & DMAF_COPEN) != 0 && (this.dmacon & DMAF_DMAEN) != 0;
      if (oldcop != newcop) {
         if (newcop && !oldcop) {
            this.copper.compute_spcflag_copper(this.events.hpos());
         } else if (!newcop) {
            this.copper.enabled_thisline = false;
            clr_special(SPCFLAG_COPPER);
         }
      }
      if ((this.dmacon & DMAF_BLTPRI) > (oldcon & DMAF_BLTPRI) && this.blitter.getState() != BLT_done)
         set_special(SPCFLAG_BLTNASTY);
      if (this.dmaen(DMAF_BLTEN) && this.blitter.getState() == BLT_init)
         this.blitter.setState(BLT_work);
      if ((this.dmacon & (DMAF_BLTPRI | DMAF_BLTEN | DMAF_DMAEN)) != (DMAF_BLTPRI | DMAF_BLTEN | DMAF_DMAEN))
         clr_special(SPCFLAG_BLTNASTY);

      if (changed & (DMAF_DMAEN | 0x0f))
         this.audio.state_machine();

      if (changed & (DMAF_DMAEN | DMAF_BPLEN)) {
         this.playfield.update_ddf_change();
         if (this.dmaen(DMAF_BPLEN))
            this.playfield.maybe_start_bpl_dma(hpos);
      }
      this.events.schedule();
   };
	
	/*---------------------------------*/

	this.ADKCONR = function () {
      return this.adkcon;
   };

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
   };

	/*---------------------------------*/

	this.INTENAR = function () {
      return this.intena;
   };

	this.INTENA = function (v) {
      if (v & INTF_SETCLR)
         this.intena |= v & ~INTF_SETCLR;
      else
         this.intena &= ~v;

      if (v & INTF_SETCLR)
         this.doint();
   };

	/*---------------------------------*/

	this.INTREQR = function () {
      return this.intreq;
   };

	this.INTREQ_0 = function (v) {
      var old = this.intreq;

      if (v & INTF_SETCLR)
         this.intreq |= v & ~INTF_SETCLR;
      else
         this.intreq &= ~v;

      if ((v & INTF_SETCLR) && this.intreq != old)
         this.doint();
   };

	this.INTREQ = function (v) {
      this.INTREQ_0(v);
      this.cia.rethink();
   };

	/*---------------------------------*/

	this.intlev = function () {
      var imask = this.intreq & this.intena;

      if (imask && (this.intena & INTF_INTEN)) {
         if (imask & 0x2000) return 6;
         if (imask & 0x1800) return 5;
         if (imask & 0x0780) return 4;
         if (imask & 0x0070) return 3;
         if (imask & 0x0008) return 2;
         if (imask & 0x0007) return 1;
      }
      return -1;
   };

	this.doint = function() {
		if (AMIGA.config.cpu.compatible)
			set_special(SPCFLAG_INT);
		else
			set_special(SPCFLAG_DOINT);        
	}
}

/*-----------------------------------------------------------------------*/
/* This API will change in the future. */

var BUG = null;
var AMIGA = null;

function SAE(x) {
	try {
		switch (x.cmd) {
			case 'init':
				BUG = new Debug();
				BUG.info('API.init() SEA %d.%d.%d', SAEV_Version, SAEV_Revision, SAEV_Revision_Sub);

				AMIGA = new Amiga();
				//return AMIGA.config;
				break;
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
			case 'getInfo':
				BUG.info('API.getInfo()');
				return AMIGA.info;
			case 'getConfig':
				BUG.info('API.getConfig()');
				return AMIGA.config;
			/*case 'setConfig':
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
   return 0;
}
