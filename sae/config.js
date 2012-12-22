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
		model: 68000,
		speed: 0, /* 0 if cpu.exact */
		exact: false, 
		compatible: true
	};
	this.blitter = {
		exact: false, /* do not change */
		immediate: false, /* false if blitter.exact */
		waiting: 1 /* 0 if cpu.exact or blitter.immediate */
	};
	this.chipset = {
		type: 0,
		agnus: 0,
		agnus_rev: 0,
		denise: 0,
		paula: 0,
		colLevel: 0
	};
	this.ram = {
		chip: {
			size: 0
		},
		slow: {
			size: 0,
		},
		fast: {
			size: 0,
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
		enabled: false,
		scale: false,
		ntsc: false,
		skip: false,
		id: ''
	};
	this.audio = {
		enabled: false,
		mode:0,
		channels: 0,
		rate: 0
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
	this.hooks = {
		error: null,
		power_led: null,
		floppy_motor: null,
		floppy_step: null,
		fps: null,
		cpu: null
	};
}

function configSetDefaults(c) {
	c.init = true;

	c.cpu.speed = SAEV_Config_CPU_Speed_Original;

	c.chipset.type = SAEV_Config_Chipset_Type_OCS;
	if (c.chipset.type == SAEV_Config_Chipset_Type_OCS) {
		c.chipset.agnus = c.video.ntsc ? AGNUS_8370 : AGNUS_8371;
		c.chipset.agnus_rev = 0;
		c.chipset.denise = DENISE_8362;
	} else if (c.chipset.type == SAEV_Config_Chipset_Type_ECS) {
		c.chipset.agnus = AGNUS_8372;
		c.chipset.agnus_rev = 5;
		c.chipset.denise = DENISE_8373;
	}
	c.chipset.paula = PAULA_8364; 
	c.chipset.colLevel = SAEV_Config_Chipset_ColLevel_None;

	c.ram.chip.size = SAEV_Config_RAM_Chip_Size_512K;
	c.ram.slow.size = SAEV_Config_RAM_Slow_Size_512K;
	c.ram.fast.size = SAEV_Config_RAM_Fast_Size_512K;

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

	c.video.enabled = true;
	c.video.scale = false;
	c.video.ntsc = false;
	c.video.skip = true;
	c.video.id = 'video';

	c.audio.enabled = true;
	c.audio.mode = SAEV_Config_Audio_Mode_Play_Best;
	c.audio.channels = SAEV_Config_Audio_Channels_Stereo;
	c.audio.rate = SAEV_Config_Audio_Rate_44100;

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

	c.hooks.error = function(err, msg) {}
	c.hooks.power_led = function(on) {}
	c.hooks.floppy_motor = function(unit, on) {}
	c.hooks.floppy_step = function(unit, cyl) {}
	c.hooks.fps = function(fps) {}	
	c.hooks.cpu = function(usage) {}	
}
