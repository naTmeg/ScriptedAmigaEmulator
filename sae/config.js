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
| Notes:
| - Ported from WinUAE 3.2.x
| - There is many comment in this file. I did not strip it,
| because it's easier to enable features in the future...
-------------------------------------------------------------------------*/
/* global variables */

var SAEV_config = {};

/*---------------------------------*/
/* models */

const SAEC_Model_A500 = 1;
const SAEC_Model_A500P = 2;
const SAEC_Model_A600 = 3;
const SAEC_Model_A1000 = 4;
const SAEC_Model_A1200 = 5;
const SAEC_Model_A2000 = 6;
const SAEC_Model_A3000 = 7;
const SAEC_Model_A4000 = 8;
const SAEC_Model_A4000T = 9;
/* future (cd-emulation is not implemented) */
const SAEC_Model_CDTV = 10;
const SAEC_Model_CD32 = 11;

/*---------------------------------*/
/* file */

function SAEO_Config_File() {
	//this.path = "";
	this.name = "";
	this.data = "";
	this.size = 0;
	this.crc32 = false;
	this.prot = false;

	this.clr = function() {
		//this.path = "";
		this.name = "";
		this.data = "";
		this.size = 0;
		this.crc32 = false;
		this.prot = false;
	}
}

/*---------------------------------*/
/* cpu */

const SAEC_Config_CPU_Model_68000 = 68000;
const SAEC_Config_CPU_Model_68010 = 68010;
const SAEC_Config_CPU_Model_68020 = 68020;
const SAEC_Config_CPU_Model_68030 = 68030;
const SAEC_Config_CPU_Model_68040 = 68040; /* future */
const SAEC_Config_CPU_Model_68060 = 68060; /* future */

const SAEC_Config_CPU_Speed_Maximum = -1;
const SAEC_Config_CPU_Speed_Original = 0;

/*---------------------------------*/
/* chipset */

const SAEC_Config_Chipset_Mask_OCS = 0;
const SAEC_Config_Chipset_Mask_ECS_AGNUS = 1;
const SAEC_Config_Chipset_Mask_ECS_DENISE = 2;
const SAEC_Config_Chipset_Mask_AGA = 4;

const SAEC_Config_Chipset_ColLevel_None = 0;
const SAEC_Config_Chipset_ColLevel_Sprite_Sprite = 1;
const SAEC_Config_Chipset_ColLevel_Sprite_Playfield = 2;
const SAEC_Config_Chipset_ColLevel_Full = 3;


const SAEC_Config_Chipset_CR_MAX = 10;
const SAEC_Config_Chipset_CR_PAL = SAEC_Config_Chipset_CR_MAX + 0;
const SAEC_Config_Chipset_CR_NTSC = SAEC_Config_Chipset_CR_MAX + 1;
const SAEC_Config_Chipset_CR_TOTAL = SAEC_Config_Chipset_CR_MAX + 2;

function SAEO_Config_Chipset_Refresh() {
	this.index = 0;
	this.locked = false;
	this.rtg = false;
	this.horiz = 0;
	this.vert = 0;
	this.lace = 0;
	this.ntsc = false;
	this.vsync = 0;
	this.framelength = 0;
	this.rate = 0.0;
	this.label = "";
	this.commands = "";
}

/*--------------*/
/* features */

const SAEC_Config_Chipset_Compatible_Manual = 0;
const SAEC_Config_Chipset_Compatible_Generic = 1;
const SAEC_Config_Chipset_Compatible_A500 = 2;
const SAEC_Config_Chipset_Compatible_A500P = 3;
const SAEC_Config_Chipset_Compatible_A600 = 4;
const SAEC_Config_Chipset_Compatible_A1000 = 5;
const SAEC_Config_Chipset_Compatible_A1000V = 6;
const SAEC_Config_Chipset_Compatible_A1200 = 7;
const SAEC_Config_Chipset_Compatible_A2000 = 8;
const SAEC_Config_Chipset_Compatible_A3000 = 9;
const SAEC_Config_Chipset_Compatible_A4000 = 10;
const SAEC_Config_Chipset_Compatible_A4000T = 11;
const SAEC_Config_Chipset_Compatible_CDTV = 12;
const SAEC_Config_Chipset_Compatible_CDTVCR = 13;
const SAEC_Config_Chipset_Compatible_CD32 = 14;

const SAEC_Config_Chipset_CIA_TOD_VSync = 0;
const SAEC_Config_Chipset_CIA_TOD_50Hz = 1;
const SAEC_Config_Chipset_CIA_TOD_60Hz = 2;

const SAEC_Config_RTC_Type_None = 0;
const SAEC_Config_RTC_Type_MSM6242B = 1;
const SAEC_Config_RTC_Type_RF5C01A = 2; /* A3000(T)/A4000(T) */
const SAEC_Config_RTC_Type_MSM6242B_A2000 = 3;

const SAEC_Config_Chipset_IDE_A600A1200 = 1;
const SAEC_Config_Chipset_IDE_A4000 = 2;

/*---------------------------------*/
/* memory */

/* DEPRECATED
const SAEC_Config_RAM_Chip_Size_256K = 256 << 10;
const SAEC_Config_RAM_Chip_Size_512K = 512 << 10;
const SAEC_Config_RAM_Chip_Size_1M = 1024 << 10;
const SAEC_Config_RAM_Chip_Size_2M = 2048 << 10;

const SAEC_Config_RAM_Slow_Size_None = 0;
const SAEC_Config_RAM_Slow_Size_256K = 256 << 10;
const SAEC_Config_RAM_Slow_Size_512K = 512 << 10;
const SAEC_Config_RAM_Slow_Size_1M = 1024 << 10;
const SAEC_Config_RAM_Slow_Size_1536K = 1536 << 10;

const SAEC_Config_RAM_Fast_Size_None = 0;
const SAEC_Config_RAM_Fast_Size_512K = 512 << 10;
const SAEC_Config_RAM_Fast_Size_1M = 1024 << 10;
const SAEC_Config_RAM_Fast_Size_2M = 2048 << 10;
const SAEC_Config_RAM_Fast_Size_4M = 4096 << 10;
const SAEC_Config_RAM_Fast_Size_8M = 8192 << 10;*/

const SAEC_Config_Memory_z3Mapping_Auto = 0;
const SAEC_Config_Memory_z3Mapping_SAE = 1;
const SAEC_Config_Memory_z3Mapping_Real = 2;

//const SAEC_Config_Memory_Custom_MAX = 2; //MAX_CUSTOM_MEMORY_ADDRS

/*---------------------------------*/
/* disk */

const SAEC_Config_Floppy_Type_None = 0;
const SAEC_Config_Floppy_Type_35_DD = 1;
const SAEC_Config_Floppy_Type_35_HD = 2;
const SAEC_Config_Floppy_Type_35_DD_ESCOM = 3;
const SAEC_Config_Floppy_Type_35_DD_PC = 4;
const SAEC_Config_Floppy_Type_35_HD_PC = 5;
const SAEC_Config_Floppy_Type_525_SD = 6;

const SAEC_Config_Floppy_Speed_Turbo = 0;
const SAEC_Config_Floppy_Speed_Original = 100;

function SAEO_Config_Floppy_Drive() { //floppyslot
	this.type = SAEC_Config_Floppy_Type_None; //dfxtype
	this.file = new SAEO_Config_File();
	//this.name = ""; //df
	//this.prot = false; //forcedwriteprotect
	//this.dfxclick = 0;
	//this.dfxclickexternal = "";
}

/*---------------------------------*/
/* mount */

const SAEC_Config_Mount_Controller_Type_MB_IDE = 1;
const SAEC_Config_Mount_Controller_Type_PCMCIA_SRAM = 2;
const SAEC_Config_Mount_Controller_Type_PCMCIA_IDE = 3;

const SAEC_Config_Mount_Controller_Level_ATA_1 = 0;
const SAEC_Config_Mount_Controller_Level_ATA_2 = 1;
const SAEC_Config_Mount_Controller_Level_ATA_2S = 2;

const SAEC_Config_Mount_Controller_Level_SCSI_1 = 0;
const SAEC_Config_Mount_Controller_Level_SCSI_2 = 1;
const SAEC_Config_Mount_Controller_Level_SASI = 2;
const SAEC_Config_Mount_Controller_Level_SASI_ENHANCED = 2;
const SAEC_Config_Mount_Controller_Level_SASI_CHS = 3;

const SAEC_Config_Mount_Bootpri_NOAUTOBOOT = -128;
const SAEC_Config_Mount_Bootpri_NOAUTOMOUNT = -129;

function SAEO_Config_Mount_Info() { //uaedev_config_info
	//controller
	this.controller_type = 0;
	this.controller_unit = 0; //IDE channel + unit
	this.controller_media_type = 0; // 1 = CF IDE, 0 = normal
	this.unit_feature_level = 0;
	this.unit_special_flags = 0; //1 = force LBA48
	//file
	this.type = 0;
	//this.rootdir = "";
	this.file = new SAEO_Config_File(); //OWN
	this.readonly = false;
	//rdb drive geometry
	this.blocksize = 0;
	this.cyls = 0; // calculated/corrected highcyl
	this.surfaces = 0; //heads
	this.sectors = 0;
	this.interleave = false;
	this.physical_geometry = false; // if false: use defaults
	this.pcyls = 0, this.pheads = 0, this.psecs = 0;
	//partition
	this.bootable = false;
	this.automount = false;
	this.unit = 0;
	this.flags = 0;
	this.devname = "";
	//partition DosEnvec
	this.sectorsperblock = 0;
	this.reserved = 0;
	this.lowcyl = 0;
	this.highcyl = 0; // zero if detected from size
	this.buffers = 0;
	this.bufmemtype = 0;
	this.maxtransfer = 0;
	this.mask = 0; //u32
	this.bootpri = 0;
	this.dostype = 0; //u32
	//filesystem
	this.filesys = "";
	//filesystem DeviceNode
	this.stacksize = 0;
	this.priority = 0;
	//misc
	//this.device_emu_unit = 0; //CD
}
function SAEO_Config_Mount_Data() { //uaedev_config_data
	this.ci = new SAEO_Config_Mount_Info();
	this.configoffset = 0;
	this.unitnum = 0;
}

/*---------------------------------*/
/* video */

const SAEC_Config_Video_API_Canvas = 0;
const SAEC_Config_Video_API_WebGL = 1;

const SAEC_Config_Video_Cursor_Show = 0;
const SAEC_Config_Video_Cursor_Hide = 1;
const SAEC_Config_Video_Cursor_Lock = 2;

const SAEC_Config_Video_HResolution_LoRes = 0;
const SAEC_Config_Video_HResolution_HiRes = 1;
const SAEC_Config_Video_HResolution_SuperHiRes = 2;

const SAEC_Config_Video_VResolution_NonDouble = 0;
const SAEC_Config_Video_VResolution_Double = 1;

const SAEC_Config_Video_AP_Fullscreen_WINDOW = 0; //GFX_WINDOW
const SAEC_Config_Video_AP_Fullscreen_FULLSCREEN = 1; //GFX_FULLSCREEN
const SAEC_Config_Video_AP_Fullscreen_FULLWINDOW = 2; //GFX_FULLWINDOW

function SAEO_Config_Video_WH() { //struct wh
	this.x = 0;
	this.y = 0;
	this.width = 0;
	this.height = 0;
	this.special = false;
}

function SAEO_Config_Video_APMode() { //struct apmode
	this.gfx_fullscreen = 0;
	this.gfx_display = 0;
	this.gfx_vsync = 0;
	// 0 = immediate flip
	// -1 = wait for flip, before frame ends
	// 1 = wait for flip, after new frame has started
	this.gfx_vflip = 0;
	this.gfx_strobo = false; //doubleframemode strobo
	this.gfx_vsyncmode = 0;
	this.gfx_backbuffers = 0;
	this.gfx_interlaced = false;
	this.gfx_refreshrate = 0;
}

const MAX_FILTERSHADERS = 4;
function SAEO_Config_Video_FilterData() { //struct gfx_filterdata
	this.gfx_filter = 0;
	this.gfx_filtershader = new Array(2 * MAX_FILTERSHADERS + 1);
	this.gfx_filtermask = new Array(2 * MAX_FILTERSHADERS + 1);
	this.gfx_filteroverlay = ""; //char
	this.gfx_filteroverlay_pos = new SAEO_Config_Video_WH();
	this.gfx_filteroverlay_overscan = 0;
	this.gfx_filter_scanlines = 0; //0, 100, 1,
	this.gfx_filter_scanlineratio = 0;
	this.gfx_filter_scanlinelevel = 0; //0, 100, 10,
	this.gfx_filter_horiz_zoom = 0.0; this.gfx_filter_vert_zoom = 0.0; //float
	this.gfx_filter_horiz_zoom_mult = 0.0; this.gfx_filter_vert_zoom_mult = 0.0; //float
	this.gfx_filter_horiz_offset = 0.0; this.gfx_filter_vert_offset = 0.0; //float
	this.gfx_filter_left_border = 0; this.gfx_filter_right_border = 0;
	this.gfx_filter_top_border = 0; this.gfx_filter_bottom_border = 0;
	this.gfx_filter_filtermode = 0;
	this.gfx_filter_bilinear = 0; //0, 1, 1,
	this.gfx_filter_noise = 0; //0, 100, 10,
	this.gfx_filter_blur = 0; //0, 2000, 10,
	this.gfx_filter_saturation = 0; this.gfx_filter_luminance = 0; this.gfx_filter_contrast = 0;
	this.gfx_filter_gamma = 0;
	this.gfx_filter_gamma_ch = [0,0,0];
	this.gfx_filter_keep_aspect = 0; this.gfx_filter_aspect = 0;
	this.gfx_filter_autoscale = 0;
	this.gfx_filter_integerscalelimit = 0;
	this.gfx_filter_keep_autoscale_aspect = 0;

	for (var i = 0; i < 2 * MAX_FILTERSHADERS + 1; i++) {
		this.gfx_filtershader[i] = "";
		this.gfx_filtermask[i] = "";
	}
};

/*---------------------------------*/
/* audio */

/* DEPRECATED
const SAEC_Config_Audio_Mode_Emul = 0;
const SAEC_Config_Audio_Mode_Play = 1;
const SAEC_Config_Audio_Mode_Play_Best = 2;*/

const SAEC_Config_Audio_Mode_Off = 0;
const SAEC_Config_Audio_Mode_Off_Emul = 1;
const SAEC_Config_Audio_Mode_On = 2;
const SAEC_Config_Audio_Mode_On_Best = 3;

const SAEC_Config_Audio_Freq_Auto = 0;
const SAEC_Config_Audio_Freq_11025 = 11025;
const SAEC_Config_Audio_Freq_22050 = 22050;
const SAEC_Config_Audio_Freq_44100 = 44100;
const SAEC_Config_Audio_Freq_48000 = 48000;

const SAEC_Config_Audio_Channels_Mono = 1;
const SAEC_Config_Audio_Channels_Stereo = 2;

const SAEC_Config_Audio_Filter_Off = 0;
const SAEC_Config_Audio_Filter_Emul = 1;
const SAEC_Config_Audio_Filter_On = 2;
const SAEC_Config_Audio_FilterType_A500 = 0;
const SAEC_Config_Audio_FilterType_A1200 = 1;

const SAEC_Config_Audio_Interpol_None = 0;
const SAEC_Config_Audio_Interpol_Anti = 1;
const SAEC_Config_Audio_Interpol_RH = 2;
const SAEC_Config_Audio_Interpol_Crux = 3;

/*---------------------------------*/
/* input */

const SAEC_Config_Ports_Type_None = 0;
const SAEC_Config_Ports_Type_Mouse = 1;
const SAEC_Config_Ports_Type_Joy = 2;
const SAEC_Config_Ports_Type_JoyEmu = 3;

const SAEC_Config_Ports_Move_None = 0;
const SAEC_Config_Ports_Move_Arrows = 1;
const SAEC_Config_Ports_Move_Numpad = 2;
const SAEC_Config_Ports_Move_WASD = 3;

const SAEC_Config_Ports_Fire_None = 0;

const SAEC_Config_Ports_Device_None = -1;

/*---------------------------------*/
/* debug */

const SAEC_Config_Debug_Level_Fatal = 0;
const SAEC_Config_Debug_Level_Error = 1;
const SAEC_Config_Debug_Level_Warn = 2;
const SAEC_Config_Debug_Level_Info = 3;
const SAEC_Config_Debug_Level_Log = 4;

/*---------------------------------*/
/* the main config-object */

function SAEO_Config() {
	//int turbo_emulation;
	//int turbo_emulation_limit;

	this.cpu = {
		model: 0, //cpu_model
		speed: 0, //m68k_speed
		speedThrottle: 0.0, //m68k_speed_throttle (0.0 - 1000.0)
		clock: { //cpu_frequency
			multiplier: 0, //cpu_clock_multiplier
			frequency: 0 //cpu_frequency
		},
		compatible: false, //cpu_compatible
		addressSpace24: false, //address_space_24
		resetDelay: false //reset_delay;
		/*int cpu_idle;
		bool cpu_cycle_exact;
		bool cpu_memory_cycle_exact;
		bool int_no_unimplemented; 68060*/
	};
	/*this.fpu = { future
		int fpu_model;
		int fpu_revision;
		bool fpu_strict;
		bool fpu_softfloat;
		bool fpu_no_unimplemented;
	};*/

	this.chipset = {
		mask: 0, //chipset_mask
		ntsc: false, //ntscmode
		genlock: false, //genlock
		colLevel: 0, //collision_level
		refreshRate: 0.0, //chipset_refreshrate
		refresh: null, //cr[SAEC_Config_Chipset_CR_TOTAL]
		/*int cr_selected;
		int genlock_image;
		int genlock_mix;
		TCHAR genlock_image_file[MAX_DPATH];*/
		blitter: {
			immediate: false, //immediate_blits
			waiting: 0, //waiting_blits
			cycle_exact: false //blitter_cycle_exact
		},
		cia: {
			todHack: false, //tod_hack
			todBug: false, //cs_ciatodbug
			tod: 0, //cs_ciaatod
			overlay: false, //cs_ciaoverlay
			type6526: false //cs_cia6526
		},
		rtc: {
			type: 0, //cs_rtc
			adjust: 0 //cs_rtc_adjust
			//file: "" //rtcfile
		},
		//features
		compatible: 0, //cs_compatible
		mirrorE0: false, //cs_ksmirror_e0
		mirrorA8: false, //cs_ksmirror_a8
		a1000ram: false, //cs_a1000ram
		agnusRev: 0, //cs_agnusrev
		agnusDIP: false, //cs_dipagnus
		agnusBltBusyBug: false, //cs_agnusbltbusybug
		deniseRev: 0, //cs_deniserev
		deniseNoEHB: false, //cs_denisenoehb
		fatGaryRev: 0, //cs_fatgaryrev
		ramseyRev: 0, //cs_ramseyrev
		df0idhw: false, //cs_df0idhw
		ide: 0, //cs_ide
		pcmcia: false, //cs_pcmcia
		mbdmac: 0, //cs_mbdmac
		jumper1MbChip: false, //cs_1mchipjumper
		bogomemIsFast: false, //cs_slowmemisfast
		z3AutoConfig: false //cs_z3autoconfig
		/*bool cs_cd32cd;
		bool cs_cd32c2p;
		bool cs_cd32nvram;
		int cs_cd32nvram_size;
		bool cs_cd32fmv;
		bool cs_cdtvcd;
		bool cs_cdtvram;
		int cs_cdtvcard;
		bool cs_cdtvscsi;
		bool cs_cdtvcr;
		bool cs_resetwarning;
		bool cs_bytecustomwritebug; // >= 68040
		bool cs_color_burst;
		int cs_hacks;*/
	};

	this.memory = {
		rom: new SAEO_Config_File(), //romfile[MAX_DPATH], romident[256];
		extRom: new SAEO_Config_File(), //romextfile[MAX_DPATH], romextident[256];
		romKey: new SAEO_Config_File(),
		amaxRom: new SAEO_Config_File(),
		kickShifter: false, //kickshifter
		//maprom: 0, //BlizKick
		/*struct boardromconfig expansionboard[MAX_EXPANSION_BOARDS];
		uae_u32 romextfile2addr;
		TCHAR romextfile2[MAX_DPATH];
		TCHAR flashfile[MAX_DPATH];
		TCHAR cartfile[MAX_DPATH];
		TCHAR cartident[256];
		TCHAR a2065name[MAX_DPATH];
		TCHAR picassoivromfile[MAX_DPATH];
		int uaeboard;
		int boot_rom;*/

		chipSize: 0, //chipmem_size
		bogoSize: 0, //bogomem_size
		z2FastSize: 0, //fastmem_size
		z2FastAutoConfig: false, //fastmem_autoconfig
		z3FastSize: 0, //z3fastmem_size
		z3Mapping: 0, //z3_mapping_mode
		z3AutoConfigStart: 0, //z3autoconfig_start
		ramsey: {
			lowSize: 0, //mbresmem_low_size /* mainboard */
			highSize: 0 //mbresmem_high_size /* processor-slot */
		},
		custom: [{
			addr: 0, //custom_memory_addrs[SAEC_Config_Memory_Custom_MAX]
			size: 0, //custom_memory_sizes[SAEC_Config_Memory_Custom_MAX]
			mask: 0  //custom_memory_mask[SAEC_Config_Memory_Custom_MAX]
		}, {
			addr: 0,
			size: 0,
			mask: 0
		}],
		logIllegal: false //illegal_mem
		/*uae_u32 z3fastmem2_size;
		uae_u32 z3chipmem_size;
		uae_u32 z3chipmem_start;
		uae_u32 fastmem2_size;
		uae_u32 mem25bit_size;
		uae_u32 rtgmem_size;
		bool rtg_hardwareinterrupt;
		bool rtg_hardwaresprite;
		int rtgmem_type;
		bool rtg_more_compatible;
		bool picasso96_nocustom;
		int picasso96_modeflags;*/
	};

	this.floppy = {
		drive: null, //floppyslots[4]
		readOnly: false, //floppy_read_only
		//writeLength: 0, //floppy_write_length
		randomBitsMin: 0, //floppy_random_bits_min
		randomBitsMax: 0, //floppy_random_bits_max
		speed: 0, //floppy_speed
		autoEXT2: 0 //floppy_auto_ext2
		/*int nr_floppies;
		int dfxclickvolume_disk[4];
		int dfxclickvolume_empty[4];
		int dfxclickchannelmask;*/
	};

	this.mount = {
		items: 0, //mountitems
		config: null //mountconfig
	};

	/*struct cdslot cdslots[MAX_TOTAL_SCSI_DEVICES];
	int cd_speed;
	TCHAR inprecfile[MAX_DPATH];
	bool inprec_autoplay;
	int filesys_limit;
	int filesys_max_name;
	int filesys_max_file_size;
	bool filesys_inject_icons;
	TCHAR filesys_inject_icons_tool[MAX_DPATH];
	TCHAR filesys_inject_icons_project[MAX_DPATH];
	TCHAR filesys_inject_icons_drawer[MAX_DPATH];
	bool filesys_no_uaefsdb;
	bool filesys_custom_uaefsdb;*/

	this.video = {
		id: "",
		enabled: false,
		cursor: 0,

		scandoubler: false, //gfx_scandoubler
		framerate: 0, //gfx_framerate
		hresolution: 0, //gfx_resolution
		vresolution: 0, //gfx_vresolution
		pscanlines: 0, //gfx_pscanlines
		iscanlines: 0, //gfx_iscanlines
		xcenter: 0, //gfx_xcenter
		ycenter: 0, //gfx_ycenter
		lores_mode: false, //gfx_lores_mode
		extrawidth: 0, //gfx_extrawidth
		backgroundColor: 0,
		//saturation: 0, //gfx_saturation -1000, 1000, 10,
		luminance: 0, //gfx_luminance -1000, 1000, 10,
		contrast: 0, //gfx_contrast -1000, 1000, 10,
		gamma: 0, //gfx_gamma -1000, 1000, 10,
		gammaCh: [0,0,0], //gfx_gamma_ch[3]
		alpha: 0,
		antialias: false,
		size: new SAEO_Config_Video_WH(), //gfx_size
		size_win: new SAEO_Config_Video_WH(), //gfx_size_win
		//size_win_xtra: new Array(6), //gfx_size_win_xtra[6];
		size_fs: new SAEO_Config_Video_WH(), //gfx_size_fs;
		//size_fs_xtra: new Array(6), //gfx_size_fs_xtra[6];
		apmode: null, //gfx_apmode[2]
		gf: null, //gf[2]
		api: 0, //gfx_api
		colorMode: 0, //color_mode
		blackerThanBlack: false, //gfx_blackerthanblack
		refreshIndicator: false //refresh_indicator
		/*int gfx_autoframerate;
		bool gfx_autoresolution_vga;
		int gfx_autoresolution;
		int gfx_autoresolution_delay;
		int gfx_autoresolution_minv, gfx_autoresolution_minh;
		int gfx_xcenter_pos, gfx_ycenter_pos;
		int gfx_xcenter_size, gfx_ycenter_size;
		int gfx_max_horizontal, gfx_max_vertical;
		bool gfx_threebitcolors;
		bool gfx_grayscale;
		bool lightboost_strobo;
		float rtg_horiz_zoom_mult; //p96
		float rtg_vert_zoom_mult; //p96
		int monitoremu;*/
	};

	this.audio = {
		bufferFrames: 0,
		mode: 0, //produce_sound
		channels: 0, //sound_stereo
		freq: 0, //sound_freq
		stereoSeparation: 0, //sound_stereo_separation
		stereoDelay: 0, //sound_mixed_stereo_delay
		interpol: 0, //sound_interpol
		filter: 0, //sound_filter
		filterType: 0 //sound_filter_type
		/*int sound_maxbsiz;
		int sound_volume_master;
		int sound_volume_paula;
		int sound_volume_cd;
		int sound_volume_board;
		bool sound_stereo_swap_paula;
		bool sound_stereo_swap_ahi;
		bool sound_auto;
		bool sound_cdaudio;
		bool sound_toccata;
		bool sound_toccata_mixer;*/
	};

	/*struct jport jports[MAX_JPORTS];
	struct jport_custom jports_custom[MAX_JPORTS_CUSTOM];
	int input_selected_setting;
	int input_joymouse_multiplier;
	int input_joymouse_deadzone;
	int input_joystick_deadzone;
	int input_joymouse_speed;
	int input_analog_joystick_mult;
	int input_analog_joystick_offset;
	int input_autofire_linecnt;
	int input_mouse_speed;
	int input_tablet;
	bool tablet_library;
	bool input_magic_mouse;
	int input_magic_mouse_cursor;
	int input_keyboard_type;
	int input_autoswitch;
	struct uae_input_device joystick_settings[MAX_INPUT_SETTINGS][MAX_INPUT_DEVICES];
	struct uae_input_device mouse_settings[MAX_INPUT_SETTINGS][MAX_INPUT_DEVICES];
	struct uae_input_device keyboard_settings[MAX_INPUT_SETTINGS][MAX_INPUT_DEVICES];
	struct uae_input_device internalevent_settings[MAX_INPUT_SETTINGS][INTERNALEVENT_COUNT];
	TCHAR input_config_name[GAMEPORT_INPUT_SETTINGS][256];
	int input_contact_bounce;*/

	this.dongle = 0;

	this.ports = [{
		type: SAEC_Config_Ports_Type_Mouse,
		move: SAEC_Config_Ports_Move_WASD,
		fire: [49,50],
		device: SAEC_Config_Ports_Device_None
	}, {
		type: SAEC_Config_Ports_Type_JoyEmu,
		move: SAEC_Config_Ports_Move_Arrows,
		fire: [16,17],
		device: SAEC_Config_Ports_Device_None
	}];

	this.keyboard = {
		enabled: true
		//KbdLang keyboard_lang;
	};

	this.serial = {
		enabled: false //use_serial
		/*bool serial_demand;
		bool serial_hwctsrts;
		bool serial_direct;
		int serial_stopbits;
		int serial_crlf;
		TCHAR sername[256];*/
	};

	this.parallel = {
		enabled: false //OWN
		/*bool parallel_demand;
		int parallel_matrix_emulation;
		bool parallel_postscript_emulation;
		bool parallel_postscript_detection;
		int parallel_autoflush_time;
		TCHAR ghostscript_parameters[256];
		TCHAR prtname[256];*/
	};

	/*int leds_on_screen;
	int leds_on_screen_mask[2];
	struct wh osd_pos;
	int keyboard_leds[3];
	bool keyboard_leds_in_use;*/

	this.hook = {
		log: {
			error: function(err, msg) {}
		},
		led: {
			power: function(on) {},
			hd: function(rw) {},
			df: function(unit, dis, cyl, side, rw) {},
			fps: function(fps, paused) {},
			cpu: function(usage, paused) {}
		},
		event: {
			started: function() {},
			stopped: function() {},
			reseted: function(hard) {},
			paused: function(paused) {},
			screened: function(screened) {}
		},
		serial: {
			get: function() { return -1; },
			put: function(charCode) {}
		},
		parallel: {
			get: function() { return 0; },
			put: function(charCode) {}
		}
	};

	this.debug = {
		level: 0
	};

	this.chipset.refresh = new Array(SAEC_Config_Chipset_CR_TOTAL);
	for (var vi = 0; vi < SAEC_Config_Chipset_CR_TOTAL; vi++)
		this.chipset.refresh[vi] = new SAEO_Config_Chipset_Refresh();

	this.floppy.drive = new Array(4);
	for (vi = 0; vi < 4; vi++)
		this.floppy.drive[vi] = new SAEO_Config_Floppy_Drive();

	this.mount.config = new Array(6);
	for (vi = 0; vi < 6; vi++)
		this.mount.config[vi] = new SAEO_Config_Mount_Data();

	this.video.apmode = new Array(2);
	for (vi = 0; vi < 2; vi++)
		this.video.apmode[vi] = new SAEO_Config_Video_APMode();

	this.video.gf = new Array(2);
	for (vi = 0; vi < 2; vi++)
		this.video.gf[vi] = new SAEO_Config_Video_FilterData();
};

/*---------------------------------*/

function SAEO_Configuration() {
	/*---------------------------------*/
	/* rom */

	/*const MAX_DUPLICATE_EXPANSION_BOARDS = 4;
	const MAX_EXPANSION_BOARDS = 4;
	struct romconfig {
		TCHAR romfile[MAX_DPATH];
		TCHAR romident[256];
		uae_u32 board_ram_size;
		bool autoboot_disabled;
		int device_id;
		int device_settings;
		int subtype;
		void *unitdata;
	};
	const MAX_BOARD_ROMS = 2;
	struct boardromconfig {
		int device_type;
		int device_num;
		struct romconfig roms[MAX_BOARD_ROMS];
	};*/


	/*---------------------------------*/
	/* mount */

	/*const MAX_TOTAL_SCSI_DEVICES = 8;
	function cdslot() {
		this.name = "";
		this.inuse = false;
		this.delayed = false;
		this.temporary = false;
		this.type = 0;
	};*/

	/*---------------------------------*/
	/* video */

	//const APMODE_NATIVE = 0;
	//const APMODE_RTG = 1;

	/*const MONITOREMU_NONE = 0;
	const MONITOREMU_AUTO = 1;
	const MONITOREMU_A2024 = 2;
	const MONITOREMU_GRAFFITI = 3;
	const MONITOREMU_HAM_E = 4;
	const MONITOREMU_HAM_E_PLUS = 5;
	const MONITOREMU_VIDEODAC18 = 6;
	const MONITOREMU_AVIDEO12 = 7;
	const MONITOREMU_AVIDEO24 = 8;
	const MONITOREMU_FIRECRACKER24 = 9;
	const MONITOREMU_DCTV = 10;*/

	/*const AUTOSCALE_NONE = 0;
	const AUTOSCALE_STATIC_AUTO = 1;
	const AUTOSCALE_STATIC_NOMINAL = 2;
	const AUTOSCALE_STATIC_MAX = 3;
	const AUTOSCALE_NORMAL = 4;
	const AUTOSCALE_RESIZE = 5;
	const AUTOSCALE_CENTER = 6;
	const AUTOSCALE_MANUAL = 7; // use gfx_xcenter_pos and gfx_ycenter_pos
	const AUTOSCALE_INTEGER = 8;
	const AUTOSCALE_INTEGER_AUTOSCALE = 9;
	const AUTOSCALE_SEPARATOR = 10;
	const AUTOSCALE_OVERSCAN_BLANK = 11;*/

	/*---------------------------------*/
	/* input */

	/*const MAX_INPUT_DEVICES 20 // maximum number native input devices supported (single type)
	const MAX_INPUT_DEVICE_EVENTS 256 // maximum number of native input device"s buttons and axles supported
	const MAX_INPUT_SETTINGS 4 // 4 different customization settings
	const GAMEPORT_INPUT_SETTINGS 3 // last slot is for gameport panel mappings
	const INTERNALEVENT_COUNT 1

	const MAX_INPUT_SUB_EVENT 8
	const MAX_INPUT_SUB_EVENT_ALL 9
	const SPARE_SUB_EVENT 8

	struct uae_input_device {
		TCHAR *name;
		TCHAR *configname;
		uae_s16 eventid[MAX_INPUT_DEVICE_EVENTS][MAX_INPUT_SUB_EVENT_ALL];
		TCHAR *custom[MAX_INPUT_DEVICE_EVENTS][MAX_INPUT_SUB_EVENT_ALL];
		uae_u64 flags[MAX_INPUT_DEVICE_EVENTS][MAX_INPUT_SUB_EVENT_ALL];
		uae_s8 port[MAX_INPUT_DEVICE_EVENTS][MAX_INPUT_SUB_EVENT_ALL];
		uae_s16 extra[MAX_INPUT_DEVICE_EVENTS];
		uae_s8 enabled;
	};

	const MAX_JPORTS_CUSTOM 6
	const MAX_JPORTS 4
	const NORMAL_JPORTS 2
	const MAX_JPORTNAME 128
	struct jport_custom {
		TCHAR custom[MAX_DPATH];
	};
	struct inputdevconfig {
		TCHAR name[MAX_JPORTNAME];
		TCHAR configname[MAX_JPORTNAME];
	};
	struct jport {
		int id;
		int mode; // 0=def,1=mouse,2=joy,3=anajoy,4=lightpen
		int autofire;
		struct inputdevconfig idc;
		bool nokeyboardoverride;
	};
	const JPORT_NONE -1

	const JPORT_AF_NORMAL 1
	const JPORT_AF_TOGGLE 2
	const JPORT_AF_ALWAYS 3

	typedef enum { KBD_LANG_US, KBD_LANG_DK, KBD_LANG_DE, KBD_LANG_SE, KBD_LANG_FR, KBD_LANG_IT, KBD_LANG_ES } KbdLang;
	const KBTYPE_AMIGA 0
	const KBTYPE_PC1 1
	const KBTYPE_PC2 2

	const TABLET_OFF 0
	const TABLET_MOUSEHACK 1
	const TABLET_REAL 2*/

	/*-----------------------------------------------------------------------*/

	SAEV_config = new SAEO_Config();
	default_prefs(SAEV_config);

	/*---------------------------------*/

	this.setup = function() {
		if (fixup_prefs(SAEV_config))
			return SAEE_None;

		return SAEE_Config_Invalid;
	}

	this.setModel = function(model, config) {
		built_in_prefs(SAEV_config, model, config, 2, 0);
		return SAEE_None;
	}

	this.setDefaults = function() {
		default_prefs(SAEV_config);
		return SAEE_None;
	}

	/*-----------------------------------------------------------------------*/

	function default_prefs(p) {
		//var roms = [ 6, 7, 8, 9, 10, 14, 5, 4, 3, 2, 1, -1 ];
		//var i;

		//reset_inputdevice_config(p);
		//memset(p, 0, sizeof(*p));


		//p.turbo_emulation = 0;
		//p.turbo_emulation_limit = 0;

		p.cpu.model = SAEC_Config_CPU_Model_68000;
		p.cpu.speed = SAEC_Config_CPU_Speed_Original;
		p.cpu.speedThrottle = 0.0;
		p.cpu.clock.multiplier = 0;
		p.cpu.clock.frequency = 0;
		p.cpu.compatible = 0 ? true : false;
		p.cpu.addressSpace24 = true;
		/*p.cpu_cycle_exact = 0;
		p.cpu_memory_cycle_exact = 0;
		p.cpu_idle = 0;
		p.mmu_model = 0;*/

		/*p.fpu_model = 0;
		p.fpu_revision = 0;
		p.fpu_strict = 0;
		p.fpu_softfloat = 0;*/

		p.chipset.mask = SAEC_Config_Chipset_Mask_ECS_AGNUS;
		p.chipset.colLevel = SAEC_Config_Chipset_ColLevel_Sprite_Playfield;
		p.chipset.ntsc = false;
		p.chipset.genlock = false;

		var cr;
		for (var i = 0; i < p.chipset.refresh.length; i++) {
			cr = p.chipset.refresh[i];
			cr.index = i;
			cr.rate = -1;
		}
		cr = p.chipset.refresh[SAEC_Config_Chipset_CR_PAL];
		cr.index = SAEC_Config_Chipset_CR_PAL;
		cr.horiz = -1;
		cr.vert = -1;
		cr.lace = -1;
		cr.vsync = -1;
		cr.framelength = -1;
		cr.rate = 50.0;
		cr.ntsc = false;
		cr.locked = false;
		cr.label = "PAL";
		cr = p.chipset.refresh[SAEC_Config_Chipset_CR_NTSC];
		cr.index = SAEC_Config_Chipset_CR_NTSC;
		cr.horiz = -1;
		cr.vert = -1;
		cr.lace = -1;
		cr.vsync = -1;
		cr.framelength = -1;
		cr.rate = 60.0;
		cr.ntsc = true;
		cr.locked = false;
		cr.label = "NTSC";
		/*p.cr_selected = -1;
		p.genlock_image = 0;
		p.genlock_mix = 0;*/

		p.chipset.blitter.immediate = false;
		p.chipset.blitter.waiting = 0;
		p.chipset.blitter.cycle_exact = false;

		p.chipset.cia.todHack = false;
		p.chipset.cia.todBug = false;
		p.chipset.cia.tod = SAEC_Config_Chipset_CIA_TOD_VSync;
		p.chipset.cia.overlay = true;

		//p.chipset.rtc.type = SAEC_Config_RTC_Type_RF5C01A;
		p.chipset.rtc.type = SAEC_Config_RTC_Type_None;
		//p.chipset.rtc.file = "";

		p.chipset.compatible = SAEC_Config_Chipset_Compatible_Generic;
		p.chipset.a1000ram = 0;
		p.chipset.mirrorE0 = true;
		p.chipset.mirrorA8 = false;
		p.chipset.agnusRev = -1;
		p.chipset.deniseRev = -1;
		p.chipset.fatGaryRev = -1;
		p.chipset.ramseyRev = -1;
		p.chipset.df0idhw = true;
		p.chipset.ide = 0;
		p.chipset.pcmcia = false;
		p.chipset.mbdmac = 0;
		p.chipset.z3AutoConfig = false;
		p.chipset.bogomemIsFast = false;
		/*p.cs_cd32c2p = p.cs_cd32cd = p.cs_cd32nvram = p.cs_cd32fmv = false;
		p.cs_cd32nvram_size = 1024;
		p.cs_cdtvcd = p.cs_cdtvram = false;
		p.cs_cdtvcard = 0;
		p.cs_resetwarning = 1;
		p.cs_color_burst = false;*/

		//configure_rom(p, roms, 0);
		p.memory.rom.clr();
		p.memory.extRom.clr();
		p.memory.romKey.clr();
		p.memory.amaxRom.clr();
		//p.memory.maprom = 0; //0x0f000000
		/*p.romextfile, "";
		p.romextfile2, """;
		p.romextfile2addr = 0;
		p.flashfile, "";
		p.cartfile, "";
		p.boot_rom = 0;
		*/

		p.memory.chipSize = 0x00080000;
		p.memory.bogoSize = 0x00080000;
		p.memory.z2FastSize = 0x00000000;
		p.memory.z2FastAutoConfig = true;
		p.memory.z3FastSize = 0x00000000;
		p.memory.z3Mapping = SAEC_Config_Memory_z3Mapping_Auto;
		p.memory.z3AutoConfigStart = 0x10000000;
		p.memory.ramsey.lowSize = 0x00000000;
		p.memory.ramsey.highSize = 0x00000000;
		p.memory.custom[0].addr = 0;
		p.memory.custom[0].size = 0;
		p.memory.custom[1].addr = 0;
		p.memory.custom[1].size = 0;
		p.logIllegal = false;
		/*p.fastmem2_size = 0x00000000;
		p.mem25bit_size = 0x00000000;
		p.z3fastmem2_size = 0x00000000;
		p.rtgmem_size = 0x00000000;
		p.rtgmem_type = GFXBOARD_UAE_Z3;*/

		p.floppy.drive[0].type = SAEC_Config_Floppy_Type_35_DD;
		p.floppy.drive[1].type = SAEC_Config_Floppy_Type_35_DD;
		p.floppy.drive[2].type = SAEC_Config_Floppy_Type_None;
		p.floppy.drive[3].type = SAEC_Config_Floppy_Type_None;
		p.floppy.drive[0].file.clr();
		p.floppy.drive[1].file.clr();
		p.floppy.drive[2].file.clr();
		p.floppy.drive[3].file.clr();
		p.floppy.readOnly = false;
		//p.floppy.writeLength = 0;
		p.floppy.randomBitsMin = 1;
		p.floppy.randomBitsMax = 3;
		p.floppy.speed = 100;
		//c.floppy.speed = SAEC_Config_Floppy_Speed_Original;
		//c.floppy.speed = SAEC_Config_Floppy_Speed_Turbo;
		p.floppy.autoEXT2 = 0;
		/*p.nr_floppies = 2;
		p.dfxclickvolume_disk[0] = 33;
		p.dfxclickvolume_disk[1] = 33;
		p.dfxclickvolume_empty[0] = 33;
		p.dfxclickvolume_empty[1] = 33;
		p.dfxclickchannelmask = 0xffff;*/

		//p.mount.items = 0;
		for (var i = 0; i < 6; i++) {
			p.mount.config[i].configoffset = -1;
			p.mount.config[i].unitnum = -1;
		}
		/*p.cd_speed = 100;
		p.inprec_autoplay = true;
		p.filesys_limit = 0;
		p.filesys_max_name = 107;
		p.filesys_max_file_size = 0x7fffffff;
		p.filesys_no_uaefsdb = 0;
		p.filesys_custom_uaefsdb = 1;*/

		p.video.id = "video";
		p.video.enabled = true;
		p.video.cursor = SAEC_Config_Video_Cursor_Lock;
		p.video.scandoubler = false;
		p.video.framerate = 1;
		p.video.hresolution = SAEC_Config_Video_HResolution_HiRes;
		p.video.vresolution = SAEC_Config_Video_VResolution_Double;
		p.video.pscanlines = 0; //1 enabled, 2 double fields, 3 double fields+
		p.video.iscanlines = 0; //0 normal, 1 fields, 2 fields+
		p.video.xcenter = 0;
		p.video.ycenter = 0;
		p.video.backgroundColor = 0x000000;
		p.video.luminance = 0;
		p.video.contrast = 0;
		p.video.gamma = 0;
		p.video.alpha = 255;
		p.video.antialias = true;
		p.video.size_fs.width = screen.width; //800;
		p.video.size_fs.height = screen.height; //600;
		//p.video.size_win.width = 768;
		//p.video.size_win.height = 576;
		//p.video.size_win.width = 720;
		//p.video.size_win.height = 568;
		p.video.size_win.width = SAEC_Video_DEF_AMIGA_WIDTH << 1;
		p.video.size_win.height = SAEC_Video_DEF_AMIGA_HEIGHT << 1;
		p.video.apmode[0].gfx_display = 1;
		p.video.apmode[0].gfx_fullscreen = SAEC_Config_Video_AP_Fullscreen_WINDOW;
		p.video.apmode[1].gfx_fullscreen = SAEC_Config_Video_AP_Fullscreen_WINDOW;
		p.video.apmode[0].gfx_backbuffers = 0; //2; //1 double, 2 tripple
		p.video.apmode[1].gfx_backbuffers = 0;
		for (var i = 0; i <= 1; i++) {
			var f = p.video.gf[i];
			f.gfx_filter = 0;
			f.gfx_filter_scanlineratio = (1 << 4) | 1;
			for (var j = 0; j <= 2 * MAX_FILTERSHADERS; j++) {
				f.gfx_filtershader[i][0] = 0;
				f.gfx_filtermask[i][0] = 0;
			}
			f.gfx_filter_horiz_zoom_mult = 1.0;
			f.gfx_filter_vert_zoom_mult = 1.0;
			f.gfx_filter_bilinear = 0;
			f.gfx_filter_filtermode = 0;
			f.gfx_filter_keep_aspect = 0;
			f.gfx_filter_autoscale = 0; //AUTOSCALE_STATIC_AUTO;
			f.gfx_filter_keep_autoscale_aspect = false;
			f.gfx_filteroverlay_overscan = 0;
		}
		p.video.api = SAEC_Config_Video_API_WebGL;
		p.video.colorMode = 2; /* < 5 == 16 bit else 32 bit */
		p.video.blackerThanBlack = false;
		/*for (i = 0; i < 4; i++) {
			p.gfx_size_fs_xtra[i].width = 0;
			p.gfx_size_fs_xtra[i].height = 0;
			p.gfx_size_win_xtra[i].width = 0;
			p.gfx_size_win_xtra[i].height = 0;
		}
		p.gfx_xcenter_pos = -1;
		p.gfx_ycenter_pos = -1;
		p.gfx_xcenter_size = -1;
		p.gfx_ycenter_size = -1;
		p.gfx_max_horizontal = SAEC_Config_Video_HResolution_HiRes;
		p.gfx_max_vertical = SAEC_Config_Video_VResolution_Double;
		p.gfx_autoresolution_minv = 0;
		p.gfx_autoresolution_minh = 0;
		p.gfx_autoresolution_vga = true;
		p.gfx_autoframerate = 50; //unused by winuae
		p.rtg_horiz_zoom_mult = 1.0;
		p.rtg_vert_zoom_mult = 1.0;
		p.picasso96_nocustom = 1;*/

		p.audio.bufferFrames = 4096;
		p.audio.mode = SAEC_Config_Audio_Mode_On_Best;
		p.audio.channels = SAEC_Config_Audio_Channels_Stereo;
		p.audio.stereoSeparation = 10; /* 0-10 resp. 0-100%, 10 == no separation */
		p.audio.stereoDelay = 0; /* 0-10, 0 == no delay */
		p.audio.freq = SAEC_Config_Audio_Freq_Auto;
		//p.audio.interpol = SAEC_Config_Audio_Interpol_Anti;
		p.audio.interpol = SAEC_Config_Audio_Interpol_None; /* use no interpolation, for more speed */
		p.audio.filter = SAEC_Config_Audio_Filter_Emul;
		p.audio.filterType = 0;
		/*p.sound_maxbsiz = DEFAULT_SOUND_MAXB;
		p.sound_auto = 1;
		p.sound_cdaudio = false;*/

		p.dongle = 0;

		p.ports[0].type = SAEC_Config_Ports_Type_Mouse;
		p.ports[0].move = SAEC_Config_Ports_Move_WASD;
		p.ports[0].fire = [49,50];
		p.ports[0].device = SAEC_Config_Ports_Device_None;
		p.ports[1].type = SAEC_Config_Ports_Type_JoyEmu;
		p.ports[1].move = SAEC_Config_Ports_Move_Arrows;
		p.ports[1].fire = [16,17];
		p.ports[1].device = SAEC_Config_Ports_Device_None;
		/*memset (&p.jports[0], 0, sizeof (struct jport));
		memset (&p.jports[1], 0, sizeof (struct jport));
		memset (&p.jports[2], 0, sizeof (struct jport));
		memset (&p.jports[3], 0, sizeof (struct jport));
		p.jports[0].id = JSEM_MICE;
		p.jports[1].id = JSEM_KBDLAYOUT;
		p.jports[2].id = -1;
		p.jports[3].id = -1;
		p.input_tablet = TABLET_OFF;
		p.tablet_library = false;
		p.input_magic_mouse = 0;
		p.input_magic_mouse_cursor = 0;
		inputdevice_default_prefs (p);*/

		p.keyboard.enabled = true;
		//p.keyboard_lang = KBD_LANG_US;

		p.serial.enabled = false;
		//p.serial_demand = false;
		//p.serial_hwctsrts = 1;
		//p.serial_stopbits = 0;
		//p.sername[0] = 0;

		p.parallel.enabled = false;
		/*p.parallel_demand = 0;
		p.parallel_matrix_emulation = 0;
		p.parallel_postscript_emulation = 0;
		p.parallel_postscript_detection = 0;
		p.parallel_autoflush_time = 5;
		p.ghostscript_parameters[0] = 0;
		p.prtname[0] = 0;*/

		/*p.leds_on_screen = 0;
		p.leds_on_screen_mask[0] = p.leds_on_screen_mask[1] = (1 << SAEC_GUI_LED_MAX) - 1;
		p.keyboard_leds_in_use = 0;
		p.keyboard_leds[0] = p.keyboard_leds[1] = p.keyboard_leds[2] = 0;*/

		//p.debug.level = SAEC_Config_Debug_Level_Error;
		p.debug.level = SAEC_Config_Debug_Level_Warn;
		//p.debug.level = SAEC_Config_Debug_Level_Info;
		//p.debug.level = SAEC_Config_Debug_Level_Log;
	}

	/*-----------------------------------------------------------------------*/

	function buildin_default_prefs_68020(p) {
		p.cpu.model = SAEC_Config_CPU_Model_68020;
		p.cpu.speed = SAEC_Config_CPU_Speed_Original; //SAEC_Config_CPU_Speed_Maximum;
		p.cpu.compatible = 0 ? true : false;
		p.cpu.addressSpace24 = true;
		p.chipset.mask = SAEC_Config_Chipset_Mask_ECS_AGNUS | SAEC_Config_Chipset_Mask_ECS_DENISE | SAEC_Config_Chipset_Mask_AGA;
		p.memory.chipSize = 0x200000;
		p.memory.bogoSize = 0;
	}

	function buildin_default_prefs(p) {
		p.cpu.model = SAEC_Config_CPU_Model_68000;
		p.cpu.speed = SAEC_Config_CPU_Speed_Original;
		p.cpu.clock.multiplier = 0;
		p.cpu.clock.frequency = 0;
		p.cpu.compatible = false; //true;
		p.cpu.addressSpace24 = true;
		/*p.fpu_model = 0;
		p.fpu_revision = -1;
		p.cpu_cycle_exact = 0;
		p.cpu_memory_cycle_exact = 0;
		p.cpu_idle = 0;
		p.turbo_emulation = 0;
		p.turbo_emulation_limit = 0;
		*/

		p.chipset.mask = SAEC_Config_Chipset_Mask_ECS_AGNUS;
		p.chipset.colLevel = SAEC_Config_Chipset_ColLevel_Sprite_Playfield;

		p.chipset.blitter.immediate = false;
		p.chipset.blitter.waiting = 0;
		p.chipset.blitter.cycle_exact = false;

		p.chipset.cia.todHack = false;
		p.chipset.cia.todBug = false;
		p.chipset.cia.tod = SAEC_Config_Chipset_CIA_TOD_VSync;
		p.chipset.cia.overlay = true;

		p.chipset.rtc.type = SAEC_Config_RTC_Type_None;

		p.chipset.compatible = SAEC_Config_Chipset_Compatible_Generic;
		p.chipset.a1000ram = false;
		p.chipset.mirrorE0 = true;
		p.chipset.mirrorA8 = false;
		p.chipset.agnusRev = -1;
		p.chipset.deniseRev = -1;
		p.chipset.fatGaryRev = -1;
		p.chipset.ramseyRev = -1;
		p.chipset.df0idhw = true;
		p.chipset.ide = 0;
		p.chipset.pcmcia = false;
		p.chipset.mbdmac = 0;
		p.chipset.jumper1MbChip = false;
		/*p.cs_cd32c2p = p.cs_cd32cd = p.cs_cd32nvram = p.cs_cd32fmv = false;
		p.cs_cdtvcd = p.cs_cdtvram = false;
		p.cs_cdtvcard = 0;
		p.cs_resetwarning = 0;
		*/

		p.memory.chipSize = 0x00080000;
		p.memory.bogoSize = 0x00080000;
		p.memory.z2FastSize = 0x00000000;
		p.memory.z3FastSize = 0x00000000;
		p.memory.ramsey.lowSize = 0x00000000;
		p.memory.ramsey.highSize = 0x00000000;
		//p.memory.maprom = 0;
		/*p.mem25bit_size = 0x00000000;
		p.z3fastmem2_size = 0x00000000;
		p.z3chipmem_size = 0x00000000;
		p.rtgmem_size = 0x00000000;
		p.rtgmem_type = GFXBOARD_UAE_Z3;*/

		/*p.romextfile, "";
		p.romextfile2, "";
		set_device_rom(p, NULL, SAEC_RomType_CPUBOARD, 0);*/

		p.floppy.drive[0].type = SAEC_Config_Floppy_Type_35_DD;
		//if (p.nr_floppies != 1 && p.nr_floppies != 2) p.nr_floppies = 2;
		//p.floppy.drive[1].type = p.nr_floppies >= 2 ? SAEC_Config_Floppy_Type_35_DD : SAEC_Config_Floppy_Type_None;
		p.floppy.drive[1].type = SAEC_Config_Floppy_Type_35_DD;
		p.floppy.drive[2].type = SAEC_Config_Floppy_Type_None;
		p.floppy.drive[3].type = SAEC_Config_Floppy_Type_None;
		p.floppy.speed = 100;

		//p.mount.items = 0;

		if (p.audio.mode == SAEC_Config_Audio_Mode_Off) p.audio.mode = SAEC_Config_Audio_Mode_Off_Emul;
		/*p.sound_volume_master = 0;
		p.sound_volume_paula = 0;
		p.sound_volume_cd = 0;*/

		/*p.prtname[0] = 0;
		p.sername[0] = 0;*/
	}

	function built_in_chipset_prefs(p) {
		if (p.chipset.compatible == SAEC_Config_Chipset_Compatible_Manual)
			return 1;

		p.chipset.cia.todBug = false;
		p.chipset.cia.tod = SAEC_Config_Chipset_CIA_TOD_VSync;
		p.chipset.cia.overlay = true;
		p.chipset.cia.type6526 = false;
		p.chipset.rtc.type = SAEC_Config_RTC_Type_None;
		p.chipset.rtc.adjust = 0;
		p.chipset.a1000ram = 0;
		p.chipset.mirrorE0 = true;
		p.chipset.mirrorA8 = false;
		p.chipset.agnusRev = -1;
		p.chipset.agnusDIP = false;
		p.chipset.agnusBltBusyBug = false;
		p.chipset.deniseRev = -1;
		p.chipset.deniseNoEHB = false;
		p.chipset.fatGaryRev = -1;
		p.chipset.ramseyRev = -1;
		p.chipset.df0idhw = true;
		p.chipset.ide = 0;
		p.chipset.pcmcia = false;
		p.chipset.mbdmac = 0;
		p.chipset.z3AutoConfig = false;
		p.chipset.bogomemIsFast = false;
		/*p.cs_cd32c2p = p.cs_cd32cd = p.cs_cd32nvram = 0;
		p.cs_cdtvcd = p.cs_cdtvram = p.cs_cdtvscsi = p.cs_cdtvcr = 0;
		p.cs_resetwarning = 1;
		p.cs_bytecustomwritebug = false;*/

		switch (p.chipset.compatible) {
			case SAEC_Config_Chipset_Compatible_Generic: // generic
				if (p.cpu.model >= SAEC_Config_CPU_Model_68020) {
					// big box-like
					p.chipset.rtc.type = SAEC_Config_RTC_Type_RF5C01A;
					p.chipset.fatGaryRev = 0;
					p.chipset.ramseyRev = 0x0f;
					p.chipset.ide = -1;
					p.chipset.mbdmac = -1;
				} else if (p.cpu.compatible) {
					// very A500-like
					p.chipset.df0idhw = false;
					//p.cs_resetwarning = 0;
					if (p.memory.bogoSize || p.memory.chipSize > 0x80000 || p.memory.z2FastSize)
						p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
					p.chipset.cia.todBug = true;
				} else {
					// sort of A500-like
					p.chipset.ide = -1;
					p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
				}
				break;
			case SAEC_Config_Chipset_Compatible_CDTV: // CDTV
				p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
				//p.cs_cdtvcd = p.cs_cdtvram = 1;
				p.chipset.df0idhw = true;
				p.chipset.mirrorE0 = false;
				break;
			case SAEC_Config_Chipset_Compatible_CDTVCR: // CDTV-CR
				p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
				//p.cs_cdtvcd = p.cs_cdtvram = 1;
				//p.cs_cdtvcr = true;
				p.chipset.df0idhw = true;
				p.chipset.mirrorE0 = false;
				p.chipset.ide = SAEC_Config_Chipset_IDE_A600A1200;
				p.chipset.pcmcia = true;
				p.chipset.mirrorA8 = true;
				p.chipset.cia.overlay = false;
				//p.cs_resetwarning = 0;
				p.chipset.cia.todBug = true;
				break;
			case SAEC_Config_Chipset_Compatible_CD32: // CD32
				//p.cs_cd32c2p = p.cs_cd32cd = p.cs_cd32nvram = true;
				p.chipset.mirrorE0 = false;
				p.chipset.mirrorA8 = true;
				p.chipset.cia.overlay = false;
				//p.cs_resetwarning = 0;
				break;
			case SAEC_Config_Chipset_Compatible_A500: // A500
				p.chipset.df0idhw = false;
				//p.cs_resetwarning = 0;
				if (p.memory.bogoSize || p.memory.chipSize > 0x80000 || p.memory.z2FastSize)
					p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
				p.chipset.cia.todBug = true;
				break;
			case SAEC_Config_Chipset_Compatible_A500P: // A500+
				p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
				//p.cs_resetwarning = 0;
				p.chipset.cia.todBug = true;
				break;
			case SAEC_Config_Chipset_Compatible_A600: // A600
				p.chipset.ide = SAEC_Config_Chipset_IDE_A600A1200;
				p.chipset.pcmcia = true;
				p.chipset.mirrorA8 = true;
				p.chipset.cia.overlay = false;
				//p.cs_resetwarning = 0;
				p.chipset.cia.todBug = true;
				break;
			case SAEC_Config_Chipset_Compatible_A1000: // A1000
				p.chipset.a1000ram = 1;
				p.chipset.cia.tod = p.chipset.ntsc ? SAEC_Config_Chipset_CIA_TOD_60Hz : SAEC_Config_Chipset_CIA_TOD_50Hz;
				p.chipset.mirrorE0 = false;
				p.chipset.agnusBltBusyBug = true;
				p.chipset.agnusDIP = true;
				p.chipset.cia.todBug = true;
				break;
			case SAEC_Config_Chipset_Compatible_A1000V: // A1000 Prototype
				p.chipset.cia.tod = p.chipset.ntsc ? SAEC_Config_Chipset_CIA_TOD_60Hz : SAEC_Config_Chipset_CIA_TOD_50Hz;
				p.chipset.mirrorE0 = false;
				p.chipset.agnusBltBusyBug = true;
				p.chipset.agnusDIP = true;
				p.chipset.deniseNoEHB = true;
				break;
			case SAEC_Config_Chipset_Compatible_A1200: // A1200
				p.chipset.ide = SAEC_Config_Chipset_IDE_A600A1200;
				p.chipset.pcmcia = true;
				p.chipset.mirrorA8 = true;
				p.chipset.cia.overlay = false;
				if (p.memory.z2FastSize || p.memory.z3FastSize)
					p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
				break;
			case SAEC_Config_Chipset_Compatible_A2000: // A2000
				//p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
				p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B_A2000; //OWN
				p.chipset.cia.tod = p.chipset.ntsc ? SAEC_Config_Chipset_CIA_TOD_60Hz : SAEC_Config_Chipset_CIA_TOD_50Hz;
				p.chipset.cia.todBug = true;
				break;
			case SAEC_Config_Chipset_Compatible_A3000: // A3000
				p.chipset.rtc.type = SAEC_Config_RTC_Type_RF5C01A;
				p.chipset.fatGaryRev = 0;
				p.chipset.ramseyRev = 0x0d;
				p.chipset.mbdmac = 1;
				p.chipset.mirrorE0 = false;
				p.chipset.cia.tod = p.chipset.ntsc ? SAEC_Config_Chipset_CIA_TOD_60Hz : SAEC_Config_Chipset_CIA_TOD_50Hz;
				p.chipset.z3AutoConfig = true;
				break;
			case SAEC_Config_Chipset_Compatible_A4000: // A4000
				p.chipset.rtc.type = SAEC_Config_RTC_Type_RF5C01A;
				p.chipset.fatGaryRev = 0;
				p.chipset.ramseyRev = 0x0f;
				p.chipset.ide = SAEC_Config_Chipset_IDE_A4000;
				p.chipset.mbdmac = 0;
				p.chipset.mirrorA8 = false;
				p.chipset.mirrorE0 = false;
				p.chipset.cia.overlay = false;
				p.chipset.z3AutoConfig = true;
				break;
			case SAEC_Config_Chipset_Compatible_A4000T: // A4000T
				p.chipset.rtc.type = SAEC_Config_RTC_Type_RF5C01A;
				p.chipset.fatGaryRev = 0;
				p.chipset.ramseyRev = 0x0f;
				p.chipset.ide = SAEC_Config_Chipset_IDE_A4000;
				p.chipset.mbdmac = 2;
				p.chipset.mirrorA8 = false;
				p.chipset.mirrorE0 = false;
				p.chipset.cia.overlay = false;
				p.chipset.z3AutoConfig = true;
				break;
		}
		//if (p.cpu.model >= SAEC_Config_CPU_Model_68040) p.cs_bytecustomwritebug = true;
		return 1;
	}

	/* 0: cycle-exact
	* 1: more compatible
	* 2: no more compatible, no 100% sound
	* 3: no more compatible, waiting blits, no 100% sound
	*/
	function set_68000_compa(p, compa) {
		p.cpu.clock.multiplier = 2 << 8;
		switch (compa) {
			case 0:
				p.chipset.blitter.cycle_exact = true; //p.cpu_cycle_exact = p.cpu_memory_cycle_exact = p.chipset.blitter.cycle_exact = true;
				break;
			case 1:
				p.cpu.compatible = true;
				break;
			case 2: //used
				p.cpu.compatible = false;
				break;
			/*case 3:
				p.audio.mode = SAEC_Config_Audio_Mode_On;
				p.cpu.compatible = false;
				break;*/
		}
	}
	function set_68020_compa(p, compa, cd32) {
		switch (compa) {
			case 0:
				p.chipset.blitter.cycle_exact = true;
				//p.cpu.speed = SAEC_Config_CPU_Speed_Original;
				/*if (p.cpu.model == SAEC_Config_CPU_Model_68020) {
					p.cpu_cycle_exact = 1;
					p.cpu_memory_cycle_exact = 1;
					p.cpu.clock.multiplier = 4 << 8;
				}*/
				break;
			case 1:
				p.cpu.compatible = true;
				//p.cpu.speed = SAEC_Config_CPU_Speed_Original;
				break;
			case 2: //used
				p.cpu.compatible = false;
				//p.cpu.speed = SAEC_Config_CPU_Speed_Maximum;
				//p.cpu.addressSpace24 = false;
				break;
			/*case 3:
				p.cpu.compatible = false;
				p.cpu.addressSpace24 = false;
				break;*/
		}
	}

	function bip_a3000(p, config, compa, romcheck) {
		/*int roms[2];
		if (config == 2) roms[0] = 61;
		else if (config == 1) roms[0] = 71;
		else roms[0] = 59;
		roms[1] = -1;*/

		p.memory.bogoSize = 0;
		p.memory.chipSize = 0x200000;
		//p.memory.ramsey.lowSize = 8 * 1024 * 1024;
		p.memory.ramsey.lowSize = 2 * 1024 * 1024; //OWN
		p.cpu.model = SAEC_Config_CPU_Model_68030;
		//p.cpu.speed = SAEC_Config_CPU_Speed_Maximum; //OWN
		p.cpu.compatible = p.cpu.addressSpace24 = false;
		/*p.fpu_model = 68882;
		p.fpu_no_unimplemented = true;
		if (compa == 0)
			p.mmu_model = 68030;
		else
			p.cachesize = MAX_JIT_CACHE;*/
		p.chipset.mask = SAEC_Config_Chipset_Mask_ECS_AGNUS | SAEC_Config_Chipset_Mask_ECS_DENISE;
		p.chipset.blitter.immediate = false;
		p.audio.mode = SAEC_Config_Audio_Mode_On;
		p.floppy.drive[0].type = SAEC_Config_Floppy_Type_35_HD;
		p.floppy.speed = 0;
		//p.cpu_idle = 150;
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_A3000;
		built_in_chipset_prefs(p);
		p.chipset.cia.tod = p.chipset.ntsc ? SAEC_Config_Chipset_CIA_TOD_60Hz : SAEC_Config_Chipset_CIA_TOD_50Hz;
		return 1; //configure_rom(p, roms, romcheck);
	}
	function bip_a4000(p, config, compa, romcheck) {
		/*int roms[8];
		roms[0] = 16;
		roms[1] = 31;
		roms[2] = 13;
		roms[3] = 12;
		roms[4] = -1;*/

		p.memory.bogoSize = 0;
		p.memory.chipSize = 0x200000;
		p.memory.ramsey.lowSize = 8 * 1024 * 1024;
		p.cpu.model = SAEC_Config_CPU_Model_68030;
		//p.cpu.speed = SAEC_Config_CPU_Speed_Maximum; //OWN
		p.cpu.compatible = p.cpu.addressSpace24 = false;
		//p.fpu_model = 68882;
		/*if (config == 1) {
			p.cpu.model = SAEC_Config_CPU_Model_68040;
			//p.fpu_model = 68040;
		}*/
		p.chipset.mask = SAEC_Config_Chipset_Mask_AGA | SAEC_Config_Chipset_Mask_ECS_AGNUS | SAEC_Config_Chipset_Mask_ECS_DENISE;
		p.chipset.blitter.immediate = false;
		p.audio.mode = SAEC_Config_Audio_Mode_On;
		p.floppy.drive[0].type = SAEC_Config_Floppy_Type_35_HD;
		p.floppy.drive[1].type = SAEC_Config_Floppy_Type_35_HD;
		p.floppy.speed = 0;
		//p.cpu_idle = 150;
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_A4000;
		built_in_chipset_prefs(p);
		p.chipset.cia.tod = p.chipset.ntsc ? SAEC_Config_Chipset_CIA_TOD_60Hz : SAEC_Config_Chipset_CIA_TOD_50Hz;
		return 1; //configure_rom (p, roms, romcheck);
	}
	function bip_a4000t(p, config, compa, romcheck) {
		/*int roms[8];
		roms[0] = 16;
		roms[1] = 31;
		roms[2] = 13;
		roms[3] = -1;*/

		p.memory.bogoSize = 0;
		p.memory.chipSize = 0x200000;
		p.memory.ramsey.lowSize = 8 * 1024 * 1024;
		p.cpu.model = SAEC_Config_CPU_Model_68030;
		//p.cpu.speed = SAEC_Config_CPU_Speed_Maximum; //OWN
		p.cpu.compatible = p.cpu.addressSpace24 = false;
		//p.fpu_model = 68882;
		/*if (config == 1) {
			p.cpu.model = SAEC_Config_CPU_Model_68040;
			//p.fpu_model = 68040;
		}*/
		p.chipset.mask = SAEC_Config_Chipset_Mask_AGA | SAEC_Config_Chipset_Mask_ECS_AGNUS | SAEC_Config_Chipset_Mask_ECS_DENISE;
		p.chipset.blitter.immediate = false;
		p.audio.mode = SAEC_Config_Audio_Mode_On;
		p.floppy.drive[0].type = SAEC_Config_Floppy_Type_35_HD;
		p.floppy.drive[1].type = SAEC_Config_Floppy_Type_35_HD;
		p.floppy.speed = 0;
		//p.cpu_idle = 150;
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_A4000T;
		built_in_chipset_prefs(p);
		p.chipset.cia.tod = p.chipset.ntsc ? SAEC_Config_Chipset_CIA_TOD_60Hz : SAEC_Config_Chipset_CIA_TOD_50Hz;
		return 1; //configure_rom (p, roms, romcheck);
	}

	function bip_velvet(p, config, compa, romcheck) {
		p.chipset.mask = 0;
		p.memory.bogoSize = 0;
		p.audio.filter = SAEC_Config_Audio_Filter_On;
		set_68000_compa(p, compa);
		p.floppy.drive[1].type = SAEC_Config_Floppy_Type_None;
		p.chipset.bogomemIsFast = true;
		p.chipset.agnusDIP = true;
		p.chipset.agnusBltBusyBug = true;
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_A1000V;
		built_in_chipset_prefs(p);
		p.chipset.deniseNoEHB = true;
		p.chipset.cia.type6526 = true;
		p.memory.chipSize = 0x40000;
	}

	function bip_a1000(p, config, compa, romcheck) {
		/*int roms[2];
		roms[0] = 24;
		roms[1] = -1;*/
		p.chipset.mask = 0;
		p.memory.bogoSize = 0;
		p.audio.filter = SAEC_Config_Audio_Filter_On;
		set_68000_compa(p, compa);
		p.floppy.drive[1].type = SAEC_Config_Floppy_Type_None;
		p.chipset.bogomemIsFast = true;
		p.chipset.agnusDIP = true;
		p.chipset.agnusBltBusyBug = true;
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_A1000;
		built_in_chipset_prefs(p);
		if (config == 1)
			p.memory.chipSize = 0x40000;
		else if (config == 2) {
			p.chipset.deniseNoEHB = true;
			p.memory.chipSize = 0x40000;
		} else if (config == 3) {
			//roms[0] = 125;
			//roms[1] = -1;
			bip_velvet(p, config, compa, romcheck);
		}
		return 1; //configure_rom (p, roms, romcheck);
	}

	function bip_cdtvcr(p, config, compa, romcheck) {
		//int roms[4];
		p.memory.bogoSize = 0;
		p.memory.chipSize = 0x100000;
		p.chipset.mask = SAEC_Config_Chipset_Mask_ECS_AGNUS | SAEC_Config_Chipset_Mask_ECS_DENISE;
		//p.cs_cdtvcd = p.cs_cdtvram = true;
		//p.cs_cdtvcr = true;
		p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
		//p.nr_floppies = 0;
		p.floppy.drive[0].type = SAEC_Config_Floppy_Type_None;
		p.floppy.drive[1].type = SAEC_Config_Floppy_Type_None;
		set_68000_compa(p, compa);
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_CDTVCR;
		built_in_chipset_prefs(p);
		/*fetch_datapath (p.flashfile, sizeof (p.flashfile) / sizeof (TCHAR));
		p.flashfile = "cdtv-cr.nvr";
		roms[0] = 9;
		roms[1] = 10;
		roms[2] = -1;
		if (!configure_rom (p, roms, romcheck)) return 0;
		roms[0] = 108;
		roms[1] = 107;
		roms[2] = -1;
		if (!configure_rom (p, roms, romcheck)) return 0;*/
		return 1;
	}
	function bip_cdtv(p, config, compa, romcheck) {
		//int roms[4];
		if (config == 1)
			return bip_cdtvcr(p, config - 2, compa, romcheck);

		p.memory.bogoSize = 0;
		p.memory.chipSize = 0x100000;
		p.chipset.mask = SAEC_Config_Chipset_Mask_ECS_AGNUS;
		//p.cs_cdtvcd = p.cs_cdtvram = 1;
		//if (config > 0) p.cs_cdtvcard = 64;
		p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
		//p.nr_floppies = 0;
		p.floppy.drive[0].type = SAEC_Config_Floppy_Type_None;
		p.floppy.drive[1].type = SAEC_Config_Floppy_Type_None;
		set_68000_compa(p, compa);
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_CDTV;
		built_in_chipset_prefs(p);
		/*fetch_datapath (p.flashfile, sizeof (p.flashfile) / sizeof (TCHAR));
		_tcscat (p.flashfile, "cdtv.nvr";
		roms[0] = 6;
		roms[1] = 32;
		roms[2] = -1;
		if (!configure_rom (p, roms, romcheck)) return 0;
		roms[0] = 20;
		roms[1] = 21;
		roms[2] = 22;
		roms[3] = -1;
		if (!configure_rom (p, roms, romcheck)) return 0;*/
		return 1;
	}

	function bip_cd32(p, config, compa, romcheck) {
		//int roms[3];
		buildin_default_prefs_68020(p);
		//p.cs_cd32c2p = p.cs_cd32cd = p.cs_cd32nvram = true;
		//p.nr_floppies = 0;
		p.floppy.drive[0].type = SAEC_Config_Floppy_Type_None;
		p.floppy.drive[1].type = SAEC_Config_Floppy_Type_None;
		set_68020_compa(p, compa, true);
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_CD32;
		built_in_chipset_prefs(p);
		/*fetch_datapath (p.flashfile, sizeof (p.flashfile) / sizeof (TCHAR));
		_tcscat (p.flashfile, "cd32.nvr";
		roms[0] = 64;
		roms[1] = -1;
		if (!configure_rom (p, roms, 0)) {
			roms[0] = 18;
			roms[1] = -1;
			if (!configure_rom (p, roms, romcheck))
				return 0;
			roms[0] = 19;
			if (!configure_rom (p, roms, romcheck))
				return 0;
		}
		if (config > 0) {
			//p.cs_cd32fmv = true;
			roms[0] = 74;
			roms[1] = 23;
			roms[2] = -1;
			if (!configure_rom (p, roms, romcheck))
				return 0;
		}*/
		return 1;
	}

	function bip_a1200(p, config, compa, romcheck) {
		/*int roms[4];
		roms[0] = 11;
		roms[1] = 15;
		roms[2] = 31;
		roms[3] = -1;*/
		buildin_default_prefs_68020(p);
		p.chipset.rtc.type = SAEC_Config_RTC_Type_None;
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_A1200;
		built_in_chipset_prefs(p);
		if (config == 1) { //4mb fastram extended
			p.memory.z2FastSize = 0x400000;
			p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
		}
		set_68020_compa(p, compa, false);
		return 1; //configure_rom (p, roms, romcheck);
	}

	function bip_a600(p, config, compa, romcheck) {
		/*int roms[4];
		roms[0] = 10;
		roms[1] = 9;
		roms[2] = 8;
		roms[3] = -1;*/
		set_68000_compa(p, compa);
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_A600;
		built_in_chipset_prefs(p);
		p.memory.bogoSize = 0;
		p.memory.chipSize = 0x100000;
		if (config == 1) {
			p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
			p.memory.chipSize = 0x200000;
		}
		else if (config == 2) {
			p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
			p.memory.chipSize = 0x200000;
			p.memory.z2FastSize = 0x400000;
		}
		p.chipset.mask = SAEC_Config_Chipset_Mask_ECS_AGNUS | SAEC_Config_Chipset_Mask_ECS_DENISE;
		return 1; //configure_rom (p, roms, romcheck);
	}

	function bip_a500p(p, config, compa, romcheck) {
		/*int roms[2];
		roms[0] = 7;
		roms[1] = -1;*/
		set_68000_compa(p, compa);
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_A500P;
		built_in_chipset_prefs(p);
		p.memory.bogoSize = 0;
		p.memory.chipSize = 0x100000;
		if (config == 1) {
			//p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
			p.memory.chipSize = 0x200000;
		}
		else if (config == 2) {
			//p.chipset.rtc.type = SAEC_Config_RTC_Type_MSM6242B;
			p.memory.chipSize = 0x200000;
			p.memory.z2FastSize = 0x400000;
		}
		p.chipset.mask = SAEC_Config_Chipset_Mask_ECS_AGNUS | SAEC_Config_Chipset_Mask_ECS_DENISE;
		return 1; //configure_rom (p, roms, romcheck);
	}
	function bip_a500(p, config, compa, romcheck) {
		//int roms[4]; roms[0] = roms[1] = roms[2] = roms[3] = -1;
		switch (config) {
			case 0: // KS 1.3, OCS Agnus, 0.5M Chip + 0.5M Slow
				//roms[0] = 6;
				//roms[1] = 32;
				p.chipset.mask = 0;
				break;
			case 1: // KS 1.3, ECS Agnus, 0.5M Chip + 0.5M Slow
				//roms[0] = 6;
				//roms[1] = 32;
				break;
			case 2: // KS 1.3, ECS Agnus, 1.0M Chip
				//roms[0] = 6;
				//roms[1] = 32;
				p.memory.bogoSize = 0;
				p.memory.chipSize = 0x100000;
				break;
			/*case 3: // KS 1.3, OCS Agnus, 0.5M Chip
				//roms[0] = 6;
				//roms[1] = 32;
				p.memory.bogoSize = 0;
				p.chipset.mask = 0;
				p.chipset.rtc.type = SAEC_Config_RTC_Type_None;
				p.floppy.drive[1].type = SAEC_Config_Floppy_Type_None;
				break;
			case 4: // KS 1.2, OCS Agnus, 0.5M Chip
				//roms[0] = 5;
				//roms[1] = 4;
				//roms[2] = 3;
				p.memory.bogoSize = 0;
				p.chipset.mask = 0;
				p.chipset.rtc.type = SAEC_Config_RTC_Type_None;
				p.floppy.drive[1].type = SAEC_Config_Floppy_Type_None;
				break;
			case 5: // KS 1.2, OCS Agnus, 0.5M Chip + 0.5M Slow
				//roms[0] = 5;
				//roms[1] = 4;
				//roms[2] = 3;
				p.chipset.mask = 0;
				break;*/
		}
		set_68000_compa(p, compa);
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_A500;
		built_in_chipset_prefs(p);
		return 1; //configure_rom (p, roms, romcheck);
	}

	function bip_a2000(p, config, compa, romcheck) {
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_A2000;
		built_in_chipset_prefs(p);
		return 1;
	}

	/*function bip_super(p, config, compa, romcheck) {
		int roms[7];
		roms[0] = 16;
		roms[1] = 31;
		roms[2] = 15;
		roms[3] = 14;
		roms[4] = 12;
		roms[5] = 11;
		roms[6] = -1;
		p.memory.bogoSize = 0;
		p.memory.chipSize = 0x400000;
		p.memory.z3FastSize = 8 * 1024 * 1024;
		//p.rtgmem_size = 16 * 1024 * 1024;
		p.cpu.model = SAEC_Config_CPU_Model_68040;
		//p.fpu_model = 68040;
		p.chipset.mask = SAEC_Config_Chipset_Mask_AGA | SAEC_Config_Chipset_Mask_ECS_AGNUS | SAEC_Config_Chipset_Mask_ECS_DENISE;
		p.cpu.compatible = p.cpu.addressSpace24 = false;
		p.cpu.speed = SAEC_Config_CPU_Speed_Maximum;
		p.chipset.blitter.immediate = true;
		p.audio.mode = SAEC_Config_Audio_Mode_On;
		p.floppy.drive[0].type = SAEC_Config_Floppy_Type_35_HD;
		p.floppy.drive[1].type = SAEC_Config_Floppy_Type_35_HD;
		p.floppy.speed = 0;
		//p.cpu_idle = 150;
		//p.picasso96_nocustom = 1;
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_Generic;
		built_in_chipset_prefs(p);
		p.chipset.ide = -1;
		p.chipset.cia.tod = p.chipset.ntsc ? SAEC_Config_Chipset_CIA_TOD_60Hz : SAEC_Config_Chipset_CIA_TOD_50Hz;
		//_tcscat(p.flashfile, "battclock.nvr";
		return 1; //configure_rom (p, roms, romcheck);
	}
	function bip_arcadia(p, config, compa, romcheck) {
		int roms[4], i;
		struct romlist **rl;
		p.memory.bogoSize = 0;
		p.chipset.mask = 0;
		p.chipset.rtc.type = SAEC_Config_RTC_Type_None;
		p.nr_floppies = 0;
		p.floppy.drive[0].type = SAEC_Config_Floppy_Type_None;
		p.floppy.drive[1].type = SAEC_Config_Floppy_Type_None;
		set_68000_compa (p, compa);
		p.chipset.compatible = SAEC_Config_Chipset_Compatible_A500;
		built_in_chipset_prefs(p);
		fetch_datapath (p.flashfile, sizeof (p.flashfile) / sizeof (TCHAR));
		_tcscat (p.flashfile, "arcadia.nvr";
		roms[0] = 5;
		roms[1] = 4;
		roms[2] = -1;
		if (!configure_rom (p, roms, romcheck))
			return 0;
		roms[0] = 51;
		roms[1] = 49;
		roms[2] = -1;
		if (!configure_rom (p, roms, romcheck))
			return 0;
		rl = getarcadiaroms ();
		for (i = 0; rl[i]; i++) {
			if (config-- == 0) {
				roms[0] = rl[i]->rd->id;
				roms[1] = -1;
				configure_rom (p, roms, 0);
				break;
			}
		}
		xfree (rl);
		return 1;
	}*/

	function built_in_prefs(p, model, config, compa, romcheck) {
		var v = 0;

		buildin_default_prefs(p);
		switch (model) {
			case SAEC_Model_A500: v = bip_a500(p, config, compa, romcheck); break;
			case SAEC_Model_A500P: v = bip_a500p(p, config, compa, romcheck); break;
			case SAEC_Model_A600: v = bip_a600(p, config, compa, romcheck); break;
			case SAEC_Model_A1000: v = bip_a1000(p, config, compa, romcheck); break;
			case SAEC_Model_A1200: v = bip_a1200(p, config, compa, romcheck); break;
			case SAEC_Model_A2000: v = bip_a2000(p, config, compa, romcheck); break; //OWN
			case SAEC_Model_A3000: v = bip_a3000(p, config, compa, romcheck); break;
			case SAEC_Model_A4000: v = bip_a4000(p, config, compa, romcheck); break;
			case SAEC_Model_A4000T: v = bip_a4000t(p, config, compa, romcheck); break;
			case SAEC_Model_CD32: v = bip_cd32(p, config, compa, romcheck); break;
			case SAEC_Model_CDTV: v = bip_cdtv(p, config, compa, romcheck); break;
			/*case 10: v = bip_arcadia(p, config , compa, romcheck); break;
			case 11: v = bip_super(p, config, compa, romcheck); break;*/
		}
		//if ((p.cpu.model >= SAEC_Config_CPU_Model_68020 || !p.cpu_cycle_exact || !p.cpu_memory_cycle_exact) && !p.chipset.blitter.immediate)
		if (p.cpu.model >= SAEC_Config_CPU_Model_68020 && !p.chipset.blitter.immediate)
			p.chipset.blitter.waiting = 1;

		if (p.audio.filterType == SAEC_Config_Audio_FilterType_A500 && (p.chipset.mask & SAEC_Config_Chipset_Mask_AGA))
			p.audio.filterType = SAEC_Config_Audio_FilterType_A1200;
		else if (p.audio.filterType == SAEC_Config_Audio_FilterType_A1200 && !(p.chipset.mask & SAEC_Config_Chipset_Mask_AGA))
			p.audio.filterType = SAEC_Config_Audio_FilterType_A500;

		//if (p.cpu.model >= SAEC_Config_CPU_Model_68040) p.cs_bytecustomwritebug = true;
		return v;
	}

	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/

	function fixup_prefs_dim2(wh) {
		if (wh.special)
			return;
		if (wh.width < SAEC_Video_MIN_UAE_WIDTH) {
			SAEF_warn("config.fixup_prefs_dim2() Width (%d) min is %d.", wh.width, SAEC_Video_MIN_UAE_WIDTH);
			wh.width = SAEC_Video_MIN_UAE_WIDTH;
		}
		if (wh.height < SAEC_Video_MIN_UAE_HEIGHT) {
			SAEF_warn("config.fixup_prefs_dim2() Height (%d) min is %d.", wh.height, SAEC_Video_MIN_UAE_HEIGHT);
			wh.height = SAEC_Video_MIN_UAE_HEIGHT;
		}
		if (wh.width > SAEC_Video_MAX_UAE_WIDTH) {
			SAEF_warn("config.fixup_prefs_dim2() Width (%d) max is %d.", wh.width, SAEC_Video_MAX_UAE_WIDTH);
			wh.width = SAEC_Video_MAX_UAE_WIDTH;
		}
		if (wh.height > SAEC_Video_MAX_UAE_HEIGHT) {
			SAEF_warn("config.fixup_prefs_dim2() Height (%d) max is %d.", wh.height, SAEC_Video_MAX_UAE_HEIGHT);
			wh.height = SAEC_Video_MAX_UAE_HEIGHT;
		}
	}

	function fixup_prefs_dimensions(p) {
		fixup_prefs_dim2(p.video.size_win);
		fixup_prefs_dim2(p.video.size_fs);

		if (p.video.apmode[1].gfx_vsync)
			p.video.apmode[1].gfx_vsyncmode = 1;

		for (var i = 0; i < 2; i++) {
			var ap = p.video.apmode[i];
			ap.gfx_vflip = 0;
			ap.gfx_strobo = false;
			if (ap.gfx_vsync) {
				if (ap.gfx_vsyncmode) {
					// low latency vsync: no flip only if no-buffer
					if (ap.gfx_backbuffers >= 1)
						ap.gfx_vflip = 1;
					if (!i && ap.gfx_backbuffers == 2)
						ap.gfx_vflip = 1;
					ap.gfx_strobo = p.lightboost_strobo;
				} else {
					// legacy vsync: always wait for flip
					ap.gfx_vflip = -1;
					if (p.video.api == SAEC_Config_Video_API_WebGL && ap.gfx_backbuffers < 1)
						ap.gfx_backbuffers = 1;
					if (ap.gfx_vflip)
						ap.gfx_strobo = p.lightboost_strobo;
				}
			} else {
				// no vsync: wait if triple bufferirng
				if (ap.gfx_backbuffers >= 2)
					ap.gfx_vflip = -1;
			}

			/*var f = p.video.gf[i];
			if (f.gfx_filter == 0 && ((f.gfx_filter_autoscale && p.video.api == SAEC_Config_Video_API_Canvas) || (p.video.apmode[0].gfx_vsyncmode))) {
				SAEF_warn("config.fixup_prefs_dimensions() Current settings require at least null filter enabled. Enabling filter...");
				f.gfx_filter = 1;
			}*/
			/*if (i == 0) {
				if (f.gfx_filter == 0 && p.monitoremu) {
					SAEF_warn("config.fixup_prefs_dimensions() Display port adapter emulation require at least null filter enabled. Enabling filter...");
					f.gfx_filter = 1;
				}
				if (f.gfx_filter == 0 && p.cs_cd32fmv) {
					SAEF_warn("config.fixup_prefs_dimensions() CD32 MPEG module overlay support require at least null filter enabled. Enabling filter...");
					f.gfx_filter = 1;
				}
				if (f.gfx_filter == 0 && (p.chipset.genlock && p.genlock_image)) {
					SAEF_warn("config.fixup_prefs_dimensions() Genlock emulation require at least null filter enabled. Enabling filter...");
					f.gfx_filter = 1;
				}
			}*/
		}
	}
	this.fixup_prefs_dimensions_ext = function(p) {
		fixup_prefs_dimensions(p);
	}

	function fixup_cpu(p) {
		switch (p.cpu.model) { //OWN
			case SAEC_Config_CPU_Model_68000:
			case SAEC_Config_CPU_Model_68010:
				p.cpu.clock.multiplier = 2 << 8;
				break;
			case SAEC_Config_CPU_Model_68020:
				p.cpu.clock.multiplier = 4 << 8;
				break;
			case SAEC_Config_CPU_Model_68030:
				p.cpu.clock.multiplier = 8 << 8;
				//p.cpu.clock.multiplier = 0;
				//p.cpu.clock.frequency = 25000000;
				break;
		}

		if (p.cpu.clock.frequency == 1000000)
			p.cpu.clock.frequency = 0;

		/*if (p.cpu.model >= SAEC_Config_CPU_Model_68040 && p.cpu.addressSpace24) {
			SAEF_error("24-bit address space is not supported with 68040/060 configurations.");
			p.cpu.addressSpace24 = false;
		}
		if (p.cpu.model < SAEC_Config_CPU_Model_68020 && p.fpu_model && (p.cpu.compatible || p.cpu_memory_cycle_exact)) {
			SAEF_error("FPU is not supported with 68000/010 configurations.");
			p.fpu_model = 0;
		}
		switch (p.cpu.model) {
			case SAEC_Config_CPU_Model_68000:
			case SAEC_Config_CPU_Model_68010:
			case SAEC_Config_CPU_Model_68020:
			case SAEC_Config_CPU_Model_68030:
				break;
			case SAEC_Config_CPU_Model_68040:
				if (p.fpu_model)
					p.fpu_model = 68040;
				break;
			case SAEC_Config_CPU_Model_68060:
				if (p.fpu_model)
					p.fpu_model = 68060;
				break;
		}

		if ((p.cpu.model < SAEC_Config_CPU_Model_68030 || p.cachesize) && p.mmu_model) {
			SAEF_warn("config.fixup_cpu() MMU emulation requires 68030/040/060 and it is not JIT compatible.");
			p.mmu_model = 0;
		}

		if (!p.cpu_memory_cycle_exact && p.cpu_cycle_exact)
			p.cpu_memory_cycle_exact = true;
		#if 0
		if (p.cpu_cycle_exact && p.cpu.speed < 0 && currprefs.cpu.model <= SAEC_Config_CPU_Model_68020)
			p.cpu.speed = SAEC_Config_CPU_Speed_Original;
		#endif
		#if 0
		if (p.chipset.blitter.immediate && p.chipset.blitter.cycle_exact) {
			SAEF_error("Cycle-exact and immediate blitter can't be enabled simultaneously.");
			p.chipset.blitter.immediate = false;
		}
		#endif*/
		if (p.chipset.blitter.immediate && p.chipset.blitter.waiting) {
			SAEF_warn("config.fixup_cpu() Immediate blitter and waiting blits can't be enabled simultaneously. Disabling waiting blits...");
			p.chipset.blitter.waiting = 0;
		}
		/*if (p.cpu_memory_cycle_exact)
			p.cpu.compatible = true;

		if (p.cpu_memory_cycle_exact && p.audio.mode == SAEC_Config_Audio_Mode_Off) {
			p.audio.mode = SAEC_Config_Audio_Mode_Off_Emul;
			SAEF_error("Cycle-exact mode requires at least Disabled but emulated sound setting.");
		}*/
	}

	function fixup_prefs(p) {
		//var max_z3fastmem = SAEC_info.memory.maxSize;
		//var err = 0;

		built_in_chipset_prefs(p);
		fixup_cpu(p);

		if (((p.memory.chipSize & (p.memory.chipSize - 1)) != 0 && p.memory.chipSize != 0x180000)
			|| p.memory.chipSize < 0x20000
			|| p.memory.chipSize > 0x800000)
		{
			SAEF_warn("config.fixup_prefs() Unsupported chipmem size %d (0x%x). Setting to 2M...", p.memory.chipSize, p.memory.chipSize);
			p.memory.chipSize = 0x200000;
			//err = 1;
		}

		if ((p.memory.z2FastSize & (p.memory.z2FastSize - 1)) != 0 || (p.memory.z2FastSize != 0 && (p.memory.z2FastSize < 0x10000 || p.memory.z2FastSize > 0x800000))) {
			SAEF_warn("config.fixup_prefs() Unsupported Zorro II fastmem size %d (0x%x). Disabling fastmem...", p.memory.z2FastSize, p.memory.z2FastSize);
			p.memory.z2FastSize = 0;
			//err = 1;
		}
		/*if ((p.fastmem2_size & (p.fastmem2_size - 1)) != 0 || (p.fastmem2_size != 0 && (p.fastmem2_size < 0x10000 || p.fastmem2_size > 0x800000))) {
			SAEF_error("Unsupported fastmem2 size %d (0x%x).", p.fastmem2_size, p.fastmem2_size);
			p.fastmem2_size = 0;
			err = 1;
		}*/

		/*if (p.rtgmem_size > max_z3fastmem && p.rtgmem_type == GFXBOARD_UAE_Z3) {
			SAEF_error("Graphics card memory size %d (0x%x) larger than maximum reserved %d (0x%x).", p.rtgmem_size, p.rtgmem_size, max_z3fastmem, max_z3fastmem);
			p.rtgmem_size = max_z3fastmem;
			err = 1;
		}
		if ((p.rtgmem_size & (p.rtgmem_size - 1)) != 0 || (p.rtgmem_size != 0 && (p.rtgmem_size < 0x100000))) {
			SAEF_error("Unsupported graphics card memory size %d (0x%x).", p.rtgmem_size, p.rtgmem_size);
			if (p.rtgmem_size > max_z3fastmem)
				p.rtgmem_size = max_z3fastmem;
			else
				p.rtgmem_size = 0;
			err = 1;
		}*/

		/*if (p.memory.z3FastSize > max_z3fastmem) {
			SAEF_error("Zorro III fastmem size %d (0x%x) larger than max reserved %d (0x%x).", p.memory.z3FastSize, p.memory.z3FastSize, max_z3fastmem, max_z3fastmem);
			p.memory.z3FastSize = max_z3fastmem;
			err = 1;
		}*/
		if ((p.memory.z3FastSize & (p.memory.z3FastSize - 1)) != 0 || (p.memory.z3FastSize != 0 && p.memory.z3FastSize < 0x100000)) {
			SAEF_warn("config.fixup_prefs() Unsupported Zorro III fastmem size %d (0x%x). Disabling fastmem...", p.memory.z3FastSize, p.memory.z3FastSize);
			p.memory.z3FastSize = 0;
			//err = 1;
		}
		/*if (p.z3fastmem2_size > max_z3fastmem) {
			SAEF_error("Zorro III fastmem2 size %d (0x%x) larger than max reserved %d (0x%x).", p.z3fastmem2_size, p.z3fastmem2_size, max_z3fastmem, max_z3fastmem);
			p.z3fastmem2_size = max_z3fastmem;
			err = 1;
		}
		if ((p.z3fastmem2_size & (p.z3fastmem2_size - 1)) != 0 || (p.z3fastmem2_size != 0 && p.z3fastmem2_size < 0x100000)) {
			SAEF_error("Unsupported Zorro III fastmem2 size %x (%x).", p.z3fastmem2_size, p.z3fastmem2_size);
			p.z3fastmem2_size = 0;
			err = 1;
		}*/
		p.memory.z3AutoConfigStart = (p.memory.z3AutoConfigStart & 0xffff0000) >>> 0;
		if (p.memory.z3AutoConfigStart < 0x1000000)
			p.memory.z3AutoConfigStart = 0x1000000;

		/*if (p.z3chipmem_size > max_z3fastmem) {
			SAEF_error("Zorro III fake chipmem size %d (0x%x) larger than max reserved %d (0x%x).", p.z3chipmem_size, p.z3chipmem_size, max_z3fastmem, max_z3fastmem);
			p.z3chipmem_size = max_z3fastmem;
			err = 1;
		}
		if (((p.z3chipmem_size & (p.z3chipmem_size - 1)) != 0 &&  p.z3chipmem_size != 0x18000000 && p.z3chipmem_size != 0x30000000) || (p.z3chipmem_size != 0 && p.z3chipmem_size < 0x100000)) {
			SAEF_error("Unsupported 32-bit chipmem size %d (0x%x).", p.z3chipmem_size, p.z3chipmem_size);
			p.z3chipmem_size = 0;
			err = 1;
		}*/
		//if (p.cpu.addressSpace24 && (p.memory.z3FastSize != 0 || p.z3fastmem2_size != 0 || p.z3chipmem_size != 0)) {
		if (p.cpu.addressSpace24 && (p.memory.z3FastSize != 0)) {
			//p.memory.z3FastSize = p.z3fastmem2_size = p.z3chipmem_size = 0;
			p.memory.z3FastSize = 0;
			//SAEF_error("Can't use a Z3 graphics card or 32-bit memory when using a 24 bit address space.");
			SAEF_warn("config.fixup_prefs() Can't use Zorro III memory when using a 24 bit address space. Disabling memory...");
		}

		if (p.memory.bogoSize != 0 && p.memory.bogoSize != 0x80000 && p.memory.bogoSize != 0x100000 && p.memory.bogoSize != 0x180000 && p.memory.bogoSize != 0x1c0000) {
			SAEF_warn("config.fixup_prefs() Unsupported bogomem size %d (0x%x). Disabling bogomem...", p.memory.bogoSize, p.memory.bogoSize);
			p.memory.bogoSize = 0;
			//err = 1;
		}
		if (p.memory.bogoSize > 0x180000 && (p.chipset.fatGaryRev >= 0 || p.chipset.ide || p.chipset.ramseyRev >= 0)) {
			p.memory.bogoSize = 0x180000;
			SAEF_warn("config.fixup_prefs() Possible Gayle bogomem conflict fixed.");
		}
		if (p.memory.chipSize > 0x200000 && p.memory.z2FastSize > 262144) {
			SAEF_warn("config.fixup_prefs() Can't use Zorro II fastmem and more than 2M chipmem at the same time. Limiting chipmem to 2M...");
			p.memory.chipSize = 0x200000;
			//err = 1;
		}
		/*if (p.memory.chipSize > 0x200000 && p.rtgmem_size && gfxboard_get_configtype(p.rtgmem_type) == 2) {
			SAEF_error("You can't use Zorro II RTG and more than 2MB chip at the same time.");
			p.memory.chipSize = 0x200000;
			err = 1;
		}
		if (p.mem25bit_size > 128 << 20 || (p.mem25bit_size & 0xfffff)) {
			p.mem25bit_size = 0;
			SAEF_error("Unsupported 25bit RAM size");
		}*/
		if (p.memory.ramsey.lowSize > 64 << 20 || (p.memory.ramsey.lowSize & 0xfffff)) {
			p.memory.ramsey.lowSize = 0;
			SAEF_warn("config.fixup_prefs() Unsupported Mainboard fastmem size. Disabling fastmem... (RAMSEY low)");
		}
		if (p.memory.ramsey.highSize > 128 << 20 || (p.memory.ramsey.highSize & 0xfffff)) {
			p.memory.ramsey.highSize = 0;
			SAEF_warn("config.fixup_prefs() Unsupported CPU-Board fastmem size. Disabling fastmem... (RAMSEY high)");
		}

		/*if (p.rtgmem_type >= GFXBOARD_HARDWARE) {
			if (gfxboard_get_vram_min(p.rtgmem_type) > 0 && p.rtgmem_size < gfxboard_get_vram_min (p.rtgmem_type)) {
				SAEF_error("Graphics card memory size %d (0x%x) smaller than minimum hardware supported %d (0x%x).",
					p.rtgmem_size, p.rtgmem_size, gfxboard_get_vram_min(p.rtgmem_type), gfxboard_get_vram_min(p.rtgmem_type));
				p.rtgmem_size = gfxboard_get_vram_min (p.rtgmem_type);
			}
			if (p.cpu.addressSpace24 && gfxboard_get_configtype(p.rtgmem_type) == 3) {
				p.rtgmem_type = GFXBOARD_UAE_Z2;
				p.rtgmem_size = 0;
				SAEF_error("Z3 RTG and 24-bit address space are not compatible."));
			}
			if (gfxboard_get_vram_max(p.rtgmem_type) > 0 && p.rtgmem_size > gfxboard_get_vram_max(p.rtgmem_type)) {
				SAEF_error("Graphics card memory size %d (0x%x) larger than maximum hardware supported %d (0x%x).",
					p.rtgmem_size, p.rtgmem_size, gfxboard_get_vram_max(p.rtgmem_type), gfxboard_get_vram_max(p.rtgmem_type));
				p.rtgmem_size = gfxboard_get_vram_max(p.rtgmem_type);
			}
		}
		if (p.cpu.addressSpace24 && p.rtgmem_size && p.rtgmem_type == GFXBOARD_UAE_Z3) {
			SAEF_error("Z3 RTG and 24bit address space are not compatible.");
			p.rtgmem_type = GFXBOARD_UAE_Z2;
		}
		if (p.rtgmem_type == GFXBOARD_UAE_Z2 && (p.memory.chipSize > 2 * 1024 * 1024 || getz2size (p) > 8 * 1024 * 1024 || getz2size (p) < 0)) {
			p.rtgmem_size = 0;
			SAEF_error("Too large Z2 RTG memory size.");
		}*/



		/*#if 0
		if (p.cpu.speed < -1 || p.cpu.speed > 20) {
			SAEF_error("Bad value for -w parameter: must be -1, 0, or within 1..20.\n");
			p.cpu.speed = 4;
			err = 1;
		}
		#endif*/

		if (p.audio.mode < SAEC_Config_Audio_Mode_Off || p.audio.mode > SAEC_Config_Audio_Mode_On_Best) {
			SAEF_warn("config.fixup_prefs() Bad 'config.audio.mode'. Disabling audio...");
			p.audio.mode = SAEC_Config_Audio_Mode_Off;
			//err = 1;
		}

		if (p.chipset.z3AutoConfig && p.cpu.addressSpace24) {
			p.chipset.z3AutoConfig = false;
			SAEF_warn("config.fixup_prefs() Zorro III autoconfig and 24bit address space are not compatible. Disabling Zorro III autoconfig...");
		}
		//if ((p.memory.z3FastSize || p.z3fastmem2_size || p.z3chipmem_size) && p.cpu.addressSpace24) {
		if ((p.memory.z3FastSize) && p.cpu.addressSpace24) {
			SAEF_warn("config.fixup_prefs() Zorro III memory can't be used if address space is 24-bit., Disabling Zorro III memory...");
			p.memory.z3FastSize = 0;
			//p.z3fastmem2_size = 0;
			//p.z3chipmem_size = 0;
			//err = 1;
		}
		/*if ((p.rtgmem_size > 0 && p.rtgmem_type == GFXBOARD_UAE_Z3) && p.cpu.addressSpace24) {
			SAEF_error("UAEGFX RTG can't be used if address space is 24-bit.");
			p.rtgmem_size = 0;
			err = 1;
		}*/

		/*if (p.nr_floppies < 0 || p.nr_floppies > 4) {
			SAEF_error("Invalid number of floppies.  Using 2.");
			p.nr_floppies = 2;
			p.floppy.drive[0].type = SAEC_Config_Floppy_Type_35_DD;
			p.floppy.drive[1].type = SAEC_Config_Floppy_Type_35_DD;
			p.floppy.drive[2].type = SAEC_Config_Floppy_Type_None;
			p.floppy.drive[3].type = SAEC_Config_Floppy_Type_None;
			err = 1;
		}*/
		if (p.floppy.speed > 0 && p.floppy.speed < 10) {
			SAEF_warn("config.fixup_prefs() Invalid floppy speed. Setting to 'Turbo' (100)...");
			p.floppy.speed = 100;
		}

		/*if (p.input_mouse_speed < 1 || p.input_mouse_speed > 1000) {
			SAEF_error("Invalid mouse speed.");
			p.input_mouse_speed = 100;
		}*/
		if (p.chipset.colLevel < SAEC_Config_Chipset_ColLevel_None || p.chipset.colLevel > SAEC_Config_Chipset_ColLevel_Full) {
			SAEF_warn("config.fixup_prefs() Invalid collision support level. Using Sprite-Sprite...");
			p.chipset.colLevel = SAEC_Config_Chipset_ColLevel_Sprite_Sprite;
			//err = 1;
		}
		//if (p.parallel_postscript_emulation) p.parallel_postscript_detection = 1;
		if (p.chipset.compatible == SAEC_Config_Chipset_Compatible_Generic) {
			p.chipset.fatGaryRev = p.chipset.ramseyRev = -1;
			p.chipset.ide = 0;
			p.chipset.mbdmac = -1;
			if (p.cpu.model >= SAEC_Config_CPU_Model_68020) {
				p.chipset.fatGaryRev = 0;
				p.chipset.ramseyRev = 0x0f;
				p.chipset.ide = -1;
				p.chipset.mbdmac = 0;
			}
		} else if (p.chipset.compatible == SAEC_Config_Chipset_Compatible_Manual) {
			if (p.chipset.ide == SAEC_Config_Chipset_IDE_A4000) {
				if (p.chipset.fatGaryRev < 0)
					p.chipset.fatGaryRev = 0;
				if (p.chipset.ramseyRev < 0)
					p.chipset.ramseyRev = 0x0f;
			}
		}
		if (p.memory.chipSize >= 0x100000)
			p.chipset.jumper1MbChip = true;

		/* Can"t fit genlock and A2024 or Graffiti at the same time,
		 * also Graffiti uses genlock audio bit as an enable signal
		 */
		/*if (p.chipset.genlock && p.monitoremu) {
			SAEF_error("Genlock and A2024 or Graffiti can't be active simultaneously.");
			p.chipset.genlock = false;
		}
		if (p.cs_hacks) {
			SAEF_error("chipset_hacks is nonzero (0x%04x).", p.cs_hacks);
		}*/

		fixup_prefs_dimensions(p);

		//OWN
		if (p.video.api == SAEC_Config_Video_API_Canvas && p.video.colorMode != 5) {
			p.video.colorMode = 5;
			SAEF_warn("config.fixup_prefs() p.video.colorMode must 5 if 'Canvas' is used. (set to 5)");
		}
		//OWN
		if (p.video.luminance < -1000 || p.video.luminance > 1000) {
			p.video.luminance = 0;
			SAEF_warn("config.fixup_prefs() p.video.luminance must be between -1000 and 1000. (reset to 0)");
		}
		if (p.video.contrast < -1000 || p.video.contrast > 1000) {
			p.video.contrast = 0;
			SAEF_warn("config.fixup_prefs() p.video.contrast must be between -1000 and 1000. (reset to 0)");
		}
		if (p.video.gamma < -1000 || p.video.gamma > 1000) {
			p.video.gamma = 0;
			SAEF_warn("config.fixup_prefs() p.video.gamma must be between -1000 and 1000. (reset to 0)");
		}
		if (p.video.alpha < 0 || p.video.alpha > 255) {
			p.video.alpha = 255;
			SAEF_warn("config.fixup_prefs() p.video.gamma must be between 0 and 255. (reset to 255)");
		}

		/*#if !defined (CPUEMU_13)
		p.cpu_cycle_exact = p.chipset.blitter.cycle_exact = false;
		#endif*/

		/*#ifndef AUTOCONFIG
		p.memory.z2FastSize = 0;
		p.memory.z3FastSize = 0;
		p.rtgmem_size = 0;
		#endif*/

		/*if (p.cpu_cycle_exact) {
			if (p.video.framerate > 1) {
				SAEF_error("Cycle-exact requires disabled frameskip.");
				p.video.framerate = 1;
			}
		}*/

		/*if (p.memory.maprom && !p.cpu.addressSpace24)
			p.memory.maprom = 0x0f000000;
		if (((p.memory.maprom & 0xff000000) && p.cpu.addressSpace24) || (p.memory.maprom && p.memory.ramsey.highSize >= 0x08000000))
			p.memory.maprom = 0x00e00000;*/

		if (p.chipset.cia.todHack && p.chipset.cia.tod == SAEC_Config_Chipset_CIA_TOD_VSync)
			p.chipset.cia.tod = p.chipset.ntsc ? SAEC_Config_Chipset_CIA_TOD_60Hz : SAEC_Config_Chipset_CIA_TOD_50Hz;

		built_in_chipset_prefs(p);

		//inputdevice_fix_prefs(p);
		if (p.ports[0].type == SAEC_Config_Ports_Type_Joy && p.ports[0].device == SAEC_Config_Ports_Device_None) {
			p.ports[0].type = SAEC_Config_Ports_Type_JoyEmu;
			SAEF_warn("config.fixup_prefs() p.ports[0].device is invalid. (falling back to joystick-emulation)");
		}
		if (p.ports[1].type == SAEC_Config_Ports_Type_Joy && p.ports[1].device == SAEC_Config_Ports_Device_None) {
			p.ports[1].type = SAEC_Config_Ports_Type_JoyEmu;
			SAEF_warn("config.fixup_prefs() p.ports[1].device is invalid. (falling back to joystick-emulation)");
		}

		return true; //err == 0;
	}
}
