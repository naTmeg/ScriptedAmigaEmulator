/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/

function Config() {
	this.init = false;

	this.cpu = {
		model: 0,
		speed: 0,
		compatible: false
	};
	this.blitter = {
		immediate: false,
		waiting: 0
	};
	this.chipset = {
		mask: 0,
		agnus_dip: 0,
		agnus_rev: 0,
		denise_rev: 0,
		collision_level: 0,
		genlock: false,
		refreshrate: 0
	};
	this.ram = {
		chip: {
			size: 0
		},
		slow: {
			size: 0
      },
		fast: {
			size: 0
      }
	};
	this.rom = {
		size: 0,
		data: null
	};
	this.ext = {
		addr: 0,
		size: 0,
		data: null
	};
	this.floppy = {
		drive:[{
			type: 0,
			name: null,
			data: null
		}, {
			type: 0,
			name: null,
			data: null
		}, {
			type: 0,
			name: null,
			data: null
		}, {
			type: 0,
			name: null,
			data: null
		}],
		speed:0
	};		
	this.video = {
		id: '',		
		enabled: false,
		scale: false,
		ntsc: false, //~
		framerate: 0,
		hresolution: 0,
		vresolution: 0,
		scandoubler: false,	
		scanlines: false,
		extrawidth: 0,
		xcenter: 0,
		ycenter: 0  
	};
	this.audio = {
		enabled: false,
		mode:0,
		channels: 0,
		rate: 0,
		filter: false
	};
	this.ports = [{
		type: 0,
		move: 0,
		fire: [0,0]		
	}, {
		type: 0,
		move: 0,
		fire: [0,0]				
	}];
	this.keyboard = {
		enabled: false,
		mapShift: false
	};
	this.serial = {
		enabled: false
	};
	this.rtc = {
		type: 0
	};
	this.cia = {
		tod: 0,
		tod_hack: 0
	};
	this.hooks = {
		error: null,
		power_led: null,
		floppy_motor: null,
		floppy_step: null,
		fps: null,
		cpu: null
	};

	function configSetDefaults(c) {
		c.init = true;

		c.cpu.model = 68000;
		c.cpu.speed = SAEV_Config_CPU_Speed_Original;
		c.cpu.compatible = false;

		//c.chipset.mask = CSMASK_ECS_AGNUS | CSMASK_ECS_DENISE;
		//c.chipset.mask = CSMASK_ECS_AGNUS;
		c.chipset.mask = 0;
		c.chipset.agnus_dip = false; /* A1000 */
		c.chipset.agnus_rev = -1;
		c.chipset.denise_rev = -1;
		c.chipset.collision_level = SAEV_Config_Chipset_ColLevel_None;
		c.chipset.genlock = false;
		c.chipset.refreshrate = -1;
		
		c.blitter.immediate = 0 ? true : false;
		c.blitter.waiting = 1; /* 0 if blitter.immediate */ 
		
		c.ram.chip.size = SAEV_Config_RAM_Chip_Size_512K;
		c.ram.slow.size = SAEV_Config_RAM_Slow_Size_512K;
		c.ram.fast.size = SAEV_Config_RAM_Fast_Size_1M;

		c.rom.size = SAEV_Config_ROM_Size_None;
		c.rom.data = null;
		c.ext.addr = SAEV_Config_EXT_Addr_E0;
		c.ext.size = SAEV_Config_EXT_Size_None;
		c.ext.data = null;

		c.floppy.drive[0].type = SAEV_Config_Floppy_Type_35_DD;
		c.floppy.drive[0].name = null;						
		c.floppy.drive[0].data = null;						
		c.floppy.drive[1].type = SAEV_Config_Floppy_Type_35_DD;
		c.floppy.drive[1].name = null;						
		c.floppy.drive[1].data = null;						
		c.floppy.drive[2].type = SAEV_Config_Floppy_Type_None;
		c.floppy.drive[2].name = null;						
		c.floppy.drive[2].data = null;						
		c.floppy.drive[3].type = SAEV_Config_Floppy_Type_None;
		c.floppy.drive[3].name = null;						
		c.floppy.drive[3].data = null;						
		c.floppy.speed = SAEV_Config_Floppy_Speed_Original;						

		c.video.id = 'video';
		c.video.enabled = true;
		c.video.scale = false;
		c.video.ntsc = false;
		c.video.framerate = 2;
		c.video.hresolution = 1 ? RES_HIRES : RES_LORES;
		c.video.vresolution = 1 ? VRES_DOUBLE : VRES_NONDOUBLE;
		c.video.scandoubler = 0 ? true : false;	
		c.video.scanlines = 0 ? true : false;
		c.video.extrawidth = 0;
		c.video.xcenter = 0;
		c.video.ycenter = 0;
	
		c.audio.enabled = true;
		//c.audio.mode = SAEV_Config_Audio_Mode_Play_Best;
		c.audio.mode = SAEV_Config_Audio_Mode_Play;
		c.audio.channels = SAEV_Config_Audio_Channels_Stereo;
		c.audio.rate = SAEV_Config_Audio_Rate_44100;
		c.audio.filter = false;

		c.ports[0].type = SAEV_Config_Ports_Type_Mouse;
		c.ports[0].move = SAEV_Config_Ports_Move_WASD;
		c.ports[0].fire[0] = 49;
		c.ports[0].fire[1] = 50;
		c.ports[1].type = SAEV_Config_Ports_Type_Joy1;
		c.ports[1].move = SAEV_Config_Ports_Move_Arrows;
		c.ports[1].fire[0] = 16;
		c.ports[1].fire[1] = 17;

		c.keyboard.enabled = true;
		c.keyboard.mapShift = false;

		c.rtc.type = 1 ? SAEV_Config_RTC_Type_MSM6242B : SAEV_Config_RTC_Type_RF5C01A; 
		  
		c.cia.tod = 0;   
		c.cia.tod_hack = true;   

		c.hooks.error = function (err, msg) {
      };
		c.hooks.power_led = function (on) {
      };
		c.hooks.floppy_motor = function (unit, on) {
      };
		c.hooks.floppy_step = function (unit, cyl) {
      };
		c.hooks.fps = function (fps) {
      };
		c.hooks.cpu = function(usage) {}	
	}
	configSetDefaults(this);
}
