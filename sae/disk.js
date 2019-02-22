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
/* global constants */

const SAEC_Disk_Create_Mode_Normal = 1;
const SAEC_Disk_Create_Mode_Custom = 2;

const SAEC_Disk_Create_Type_35_DD = 1;
const SAEC_Disk_Create_Type_35_HD = 2;
const SAEC_Disk_Create_Type_35_DD_PC = 3;
const SAEC_Disk_Create_Type_35_HD_PC = 4;
const SAEC_Disk_Create_Type_525_SD = 5;

/*---------------------------------*/
/* global objects */

function SAEO_DiskInfo() { //struct diskinfo
	this.diskname = "";
	this.hd = false;

	this.crc32 = 0;

	this.bootblock = new Uint8Array(1024);
	this.bootblockChecksum = false;
	this.bootblockChecksumValid = false;
	this.bootblockType = 0;

	this.unreadable = false;

	this.clr = function() {
		this.diskname = "";
		this.hd = false;

		this.crc32 = 0;

		SAEF_memset(this.bootblock,0, 0, 1024);
		this.bootblockChecksum = 0;
		this.bootblockChecksumValid = false;
		this.bootblockType = 0;

		this.unreadable = false;
	};
}

/*---------------------------------*/

function SAEO_Disk() {
	/*#define DISK_DEBUG_DMA_READ 1
	#define DISK_DEBUG_DMA_WRITE 2
	#define DISK_DEBUG_PIO 4
	const disk_debug_mode = 0;
	const disk_debug_track = -1;*/
	const disk_debug_logging = 0;

	const DEBUG_DRIVE_ID = 0;
	const REVOLUTION_DEBUG = 0;

	/*---------------------------------*/

	const FLOPPY_WRITE_MAXLEN  = 0x3800;
	/* writable track length with normal 2us bitcell/300RPM motor, 12667 PAL, 12797 NTSC */
	//function FLOPPY_WRITE_LEN() { return SAEV_config.floppy.writeLength > 256 ? SAEV_config.floppy.writeLength / 2 : (SAEV_config.chipset.ntsc ? (12798 / 2) : (12668 / 2)); }
	//function FLOPPY_WRITE_LEN() { return SAEV_config.chipset.ntsc ? 12798 / 2 : 12668 / 2; }
	function FLOPPY_WRITE_LEN() { return SAEV_config.chipset.ntsc ? 6399 : 6334; }
	//function FLOPPY_GAP_LEN() { return FLOPPY_WRITE_LEN() - 11 * 544; } /* This works out to 350 */
	function FLOPPY_GAP_LEN() { return SAEV_config.chipset.ntsc ? 415 : 350; } /* This works out to 415/350 */

	/* (cycles/bitcell) << 8, normal = ((2us/280ns)<<8) = ~1828.5714 */
	function NORMAL_FLOPPY_SPEED() { return SAEV_config.chipset.ntsc ? 1812 : 1829; }

	const DDHDMULT = 2;
	const MAX_SECTORS = DDHDMULT * 11;
	const MAX_FLOPPY_DRIVES = 4;

	const MIN_STEPLIMIT_CYCLE = 140 * SAEC_Events_CYCLE_UNIT;

	const exeheader = [0x00,0x00,0x03,0xf3,0x00,0x00,0x00,0x00];

	/*---------------------------------*/

	var side = 0, direction = 0, reserved_side = 0;
	var selected = 15, disabled = 0, reserved = 0; //u8

	var writebuffer = new Uint8Array(544 * MAX_SECTORS);
	var longwritemode = 0;

	const DISK_INDEXSYNC = 1;
	const DISK_WORDSYNC = 2;
	const DISK_REVOLUTION = 4; /* 8,16,32,64 */

	const DSKREADY_UP_TIME = 18;
	const DSKREADY_DOWN_TIME = 24;
	const WORDSYNC_TIME = 11;

	const DSKDMA_OFF = 0;
	const DSKDMA_INIT = 1;
	const DSKDMA_READ = 2;
	const DSKDMA_WRITE = 3;

	var dskdmaen = 0, dsklength = 0, dsklength2 = 0, dsklen = 0;
	var dskbytr_val = 0; //u16
	var dskpt = 0; //u32
	var fifo_filled = false;
	var fifo = new Uint16Array(3);
	var fifo_inuse = new Int8Array(3); //int [3]
	var dma_enable = 0, bitoffset = 0, syncoffset = 0;
	var word = 0, dsksync = 0; //u16
	var dsksync_cycles = 0; //ulong
	var disk_hpos = 0;
	var disk_jitter = 0;
	var indexdecay = 0;
	var prev_data = 0; //u8
	var prev_step = 0;
	var initial_disk_statusline = false;
	//var disk_info_data = new SAEO_DiskInfo();
	var amax_enabled = false;
	var linecounter = 0;
	var prev_days = 0, prev_mins = 0, prev_ticks = 0;
	var warned_ext2 = false;
	var warned_trackspeed = 0;
	var driveNames = ["","","",""]; //OWN

	/*---------------------------------*/

	const MAX_TRACKS = 2 * 83;

	const TRACK_AMIGADOS = 0;
	const TRACK_RAW = 1;
	const TRACK_RAW1 = 2;
	const TRACK_PCDOS = 3;
	const TRACK_DISKSPARE = 4;
	const TRACK_NONE = 5;

	function trackid() {
		this.len = 0; //u16
		this.offs = 0; //u32
		this.bitlen = 0;
		this.track = 0;
		this.sync = 0; //u16
		this.type = TRACK_NONE;
		this.revolutions = 0;
	}

	/*---------------------------------*/

	/* We have three kinds of Amiga floppy drives
	* - internal A500/A2000 drive:
	*   ID is always DRIVE_ID_NONE (S.T.A.G expects this)
	* - HD drive (A3000/A4000):
	*   ID is DRIVE_ID_35DD if DD floppy is inserted or drive is empty
	*   ID is DRIVE_ID_35HD if HD floppy is inserted
	* - regular external drive:
	*   ID is always DRIVE_ID_35DD
	*/
	const DRIVE_ID_NONE = 0x00000000;
	const DRIVE_ID_35DD = 0xFFFFFFFF;
	const DRIVE_ID_35HD = 0xAAAAAAAA;
	const DRIVE_ID_525SD = 0x55555555; /* 40 track 5.25 drive , kickstart does not recognize this */

	const ADF_NONE = -1;
	const ADF_NORMAL = 0;
	const ADF_EXT1 = 1;
	const ADF_EXT2 = 2;
	//const ADF_FDI = 3; /* not implemented */
	//const ADF_IPF = 4; /* not implemented */
	const ADF_SCP = 5;
	//const ADF_CATWEASEL = 6; /* not implemented (support not possible with javascript) */
	const ADF_PCDOS = 7;
	const ADF_KICK = 8;
	const ADF_SKICK = 9;

	function drive(num) {
		this.num = num; //OWN
		this.diskfile = null; //zfile *
		this.writediskfile = null;
		this.pcdecodedfile = null;
		this.filetype = ADF_NONE;
		this.trackdata = new Array(MAX_TRACKS);
		this.writetrackdata = new Array(MAX_TRACKS);
		for (var vi = 0; vi < MAX_TRACKS; vi++) {
			this.trackdata[vi] = new trackid();
			this.writetrackdata[vi] = new trackid();
		}
		this.buffered_cyl = 0;
		this.buffered_side = 0;
		this.cyl = 0;
		this.motoroff = false;
		this.motordelay = 0; /* dskrdy needs some clock cycles before it changes after switching off motor */
		this.state = false;
		this.wrprot = false;
		this.forcedwrprot = false;
		this.bigmfmbuf = new Uint16Array(0x4000 * DDHDMULT);
		this.tracktiming = new Uint16Array(0x4000 * DDHDMULT);
		this.multi_revolution = 0;
		this.revolution_check = 0;
		this.skipoffset = 0;
		this.mfmpos = 0;
		this.indexoffset = 0;
		this.tracklen = 0;
		this.revolutions = 0;
		this.prevtracklen = 0;
		this.trackspeed = 0;
		this.num_tracks = 0;
		this.write_num_tracks = 0;
		this.num_secs = 0;
		this.num_heads = 0;
		this.hard_num_cyls = 0;
		this.dskeject = false;
		this.dskchange = false;
		this.dskchange_time = 0;
		this.dskchange_request = false; //OWN
		this.dskready = false;
		this.dskready_up_time = 0;
		this.dskready_down_time = 0;
		this.writtento = 0;
		this.steplimit = 0;
		this.steplimitcycle = 0; //frame_time_t
		this.indexhack = false;
		this.indexhackmode = 0;
		this.ddhd = 0; /* 1=DD 2=HD */
		this.drive_id_scnt = 0; /* drive id shift counter */
		this.idbit = 0;
		this.drive_id = 0; /* drive id to be reported */
		//this.newname = ""; /* storage space for new filename during eject delay */
		//this.newnamewriteprotected = false;
		this.newfile = null; //OWN
		this.crc32 = 0;
		//FDI *fdi;
		this.useturbo = 0;
		this.floppybitcounter = 0; /* number of bits left */
		this.amax = false;
		this.lastdataacesstrack = 0;
		this.lastrev = 0;
		this.track_access_done = false;
	}
	var floppy = new Array(MAX_FLOPPY_DRIVES);
	for (var vi = 0; vi < MAX_FLOPPY_DRIVES; vi++)
		floppy[vi] = new drive(vi);

	var bigmfmbufw = new Uint16Array(0x4000 * DDHDMULT);

	/*-----------------------------------------------------------------------*/
	/* SECT drive AMAX-support */
	/*-----------------------------------------------------------------------*/

	const data_scramble = [ 3, 2, 4, 5, 7, 6, 0, 1 ];
	const addr_scramble = [ 14, 12, 2, 10, 15, 13, 1, 0, 7, 6, 5, 4, 8, 9, 11, 3 ];

	var amax_rom_ptr = 0;
	var amax_rom = null; //u8 *
	var amax_rom_size = 0;
	var amax_rom_oddeven = 0;
	//u8
	var amax_data = 0;
	var amax_bfd100 = 0;
	//var amax_bfe001 = 0;
	var amax_bfe001_ov = 0;
	var amax_select = 0;

	var amax_lastbit = 0;
	var amax_is_active = false;

	const AMAX_LOG = 0;

	function amax_load_byte() {
		var v = 0xff;
		var addr = 0;
		for (var i = 0; i < 16; i++) {
			if (amax_rom_ptr & (1 << i))
				addr |= 1 << addr_scramble[i];
		}
		if (amax_rom_oddeven < 0)
			amax_data = v;
		else {
			var v = amax_rom[addr * 2 + amax_rom_oddeven];
			val = 0;
			for (i = 0; i < 8; i++) {
				if (v & (1 << data_scramble[i]))
					val |= 1 << i;
			}
			amax_data = val;
		}
		if (AMAX_LOG > 0) SAEF_log("disk.amax_load_byte() amax_rom=%d addr=%06x (%06x) data=%02x (%02x) PC=%08x", amax_rom_oddeven, amax_rom_ptr, addr, v, val, SAER_CPU_getPC());
	}

	function amax_check() {
		/* DIR low = reset address counter */
		if (amax_bfd100 & 2) {
			if (amax_rom_ptr && AMAX_LOG > 0) SAEF_log("disk.amax_check() counter reset PC=%08x", SAER_CPU_getPC());
			amax_rom_ptr = 0;
			amax_is_active = false;
		}
	}

	function amax_diskwrite(w) {
		/* this is weird, 1->0 transition in disk write line increases address pointer.. */
		for (var i = 0; i < 16; i++) {
			if (amax_lastbit && !(w & 0x8000)) {
				amax_rom_ptr++;
				if (AMAX_LOG > 0) SAEF_log("disk.amax_diskwrite() counter increase %d PC=%08x", amax_rom_ptr, SAER_CPU_getPC());
			}
			amax_lastbit = (w & 0x8000) ? 1 : 0;
			w = (w << 1) & 0xffff;
		}
		amax_rom_ptr &= amax_rom_size - 1;
		amax_check();
	}

	this.amax_bfe001_write = function(pra, dra) {
		var v = dra & pra;

		//amax_bfe001 = v;

		/* CHNG low -> high: shift data register */
		if ((v & 4) && !(amax_bfe001_ov & 4)) {
			amax_data = ((amax_data << 1) | 1) & 0xff;
			if (AMAX_LOG > 0) SAEF_log("disk.amax_bfe001_write() data shifted");
		}
		/* TK0 = even, WPRO = odd */
		amax_rom_oddeven = -1;
		if ((v & (8 | 16)) != (8 | 16)) {
			amax_rom_oddeven = 0;
			if (!(v & 16))
				amax_rom_oddeven = 1;
		}
		amax_bfe001_ov = v;
		amax_check();
	}

	function amax_disk_select(v, ov, num) {
		amax_bfd100 = v;

		amax_select = 1 << (num + 3);
		if (!(amax_bfd100 & amax_select) && (ov & amax_select)) {
			amax_is_active = true;
			amax_load_byte();
		}
		amax_check();
	}

	function amax_disk_status(st) {
		if (!(amax_data & 0x80))
			st &= ~0x20;
		return st;
	}

	function amax_active() {
		return amax_is_active;
	}

	function amax_reset() {
		amax_rom_ptr = 0;
		amax_rom_oddeven = 0;
		amax_bfe001_ov = 0;
		amax_lastbit = 0;
		amax_data = 0xff;
		//xfree(amax_rom);
		amax_rom = null;
		amax_select = 0;
	}

	function amax_init() {
		//var z = null;

		//if (is_device_rom(&currprefs, SAEC_RomType_AMAX, 0) < 0) return;
		if (SAEV_config.memory.amaxRom.size == 0) return;

		amax_reset();
		//if (is_device_rom(SAEV_config, SAEC_RomType_AMAX, 0) > 0) z = read_device_rom(SAEV_config, SAEC_RomType_AMAX, 0, null);
		var z = SAEF_ZFile_fopen_file(SAEV_config.memory.amaxRom);
		if (z !== null) {
			SAEF_ZFile_fseek(z, 0, SEEK_END);
			amax_rom_size = SAEF_ZFile_ftell(z);
			SAEF_ZFile_fseek(z, 0, SEEK_SET);
		} else {
			SAEF_log("disk.amax_init() failed to load rom");
			amax_rom_size = 262144;
		}
		amax_rom = new Uint8Array(amax_rom_size);
		if (z !== null) {
			SAEF_ZFile_fread(amax_rom,0, amax_rom_size, 1, z);
			SAEF_ZFile_fclose(z);
		}
		SAEF_log("disk.amax_init() loaded %d bytes (%dK ROM)", amax_rom_size, amax_rom_size >> 10);
	}

	/*-----------------------------------------------------------------------*/
	/* SECT drive SCP-support */
	/*-----------------------------------------------------------------------*/

	/* Support for reading .SCP (Supercard Pro) disk flux dumps.
	 * Based on version by Keir Fraser */

	const MAX_REVS = 5;

	//enum pll_mode {
	const PLL_fixed_clock = 0; /* Fixed clock, snap phase to flux transitions. */
	const PLL_variable_clock = 1; /* Variable clock, snap phase to flux transitions. */
	const PLL_authentic = 2; /* Variable clock, do not snap phase to flux transition. */
	//};

	function scpDrive_def(num) {
		this.num = num
		 this.zf = null;

		 this.track = 0; /* Current track number. */

		 this.dat = null; /* u16 *, Raw track data. */
		 this.dat8 = null; //OWN
		 this.dat16 = null; //OWN
		 this.datsz = 0;

		 this.revs = 0; /* stored disk revolutions */
		 this.dat_idx = 0; /* current index into dat[] */
		 this.index_pos = 0; /* next index offset */
		 this.nr_index = 0;
		 this.index_off = new Uint32Array(MAX_REVS); /* data offsets of each index */

		 this.latency = 0; /* u64, Accumulated read latency in nanosecs. */

		 this.pll_mode = 0; /* Flux-based streams: Authentic emulation of FDC PLL behaviour? */

		 this.flux = 0; /* signed, Nanoseconds to next flux reversal */
		 this.clock = 0; /* signed, Clock base value in nanoseconds */
		 this.clock_centre = 0; //signed
		 this.clocked_zeros = 0;

		 this.clr = function() {
			 this.zf = null;
			 this.track = 0;
			 this.dat16 = null;
			 this.dat8 = null;
			 this.dat = null;
			 this.datsz = 0;
			 this.revs = 0;
			 this.dat_idx = 0;
			 this.index_pos = 0;
			 this.nr_index = 0;
			 this.index_off = new Uint32Array(MAX_REVS);
			 this.latency = 0;
			 this.pll_mode = 0;
			 this.flux = 0;
			 this.clock = 0;
			 this.clock_centre = 0;
			 this.clocked_zeros = 0;
		 };
	};
	var scpdrive = new Array(4);
	for (var vi = 0; vi < 4; vi++)
		scpdrive[vi] = new scpDrive_def(-1);

	const CLOCK_CENTRE = 2000; /* 2000ns = 2us */
	const CLOCK_MAX_ADJ = 10;  /* +/- 10% adjustment */
	function CLOCK_MIN(c) { return Math.truncate((c * (100 - CLOCK_MAX_ADJ)) / 100); }
	function CLOCK_MAX(c) { return Math.truncate((c * (100 + CLOCK_MAX_ADJ)) / 100); }

	const SCK_NS_PER_TICK = 25;

	function scp_open(zf, drv) { //, *num_tracks) {
		var d = scpdrive[drv];
		var header = new Uint8Array(0x10); header[0] = 0;

		scp_close(drv);

		SAEF_ZFile_fread(header,0, header.length, 1, zf);
		if (SAEF_CompareArray(header, SAEF_String2Array("SCP"), 3) != 0) {
			SAEF_warn("disk.scp_open() header missing");
			return false;
		}
		if (header[5] == 0) {
			SAEF_warn("disk.scp_open() invalid revolution count (%d)", header[5]);
			return false;
		}
		if (header[9] != 0 && header[9] != 16) {
			SAEF_warn("disk.scp_open() unsupported bit cell time width (%d)", header[9]);
			return false;
		}
		d.zf = zf;
		d.revs = Math.min(header[5], MAX_REVS);

		floppy[drv].num_tracks = header[7] + 1; // *num_tracks = header[7] + 1;
		SAEF_log("disk.scp_open() ok, %d tracks", floppy[drv].num_tracks);
		return true;
	}

	function scp_close(drv) {
		var d = scpdrive[drv];
		if (d.revs) {
			//xfree(d.dat);
			d.clr(); //memset(d, 0, sizeof(*d));
		}
	}

	//function scp_loadtrack(uae_u16 *mfmbuf, uae_u16 *tracktiming, int drv, int track, int *tracklength, int *multirev, int *gapoffset, int *nextrev, bool setrev) {
	function scp_loadtrack(mfmbuf, tracktiming, drv, track, setrev) {
		var d = scpdrive[drv];
		var trk_header = new Uint8Array(4);
		var longwords = new ArrayBuffer(3 * 4);
		var longwords8 = new Uint8Array(longwords);
		var longwords32 = new Uint32Array(longwords);
		var trkoffset = new Uint32Array(MAX_REVS); //uint
		var hdr_offset, tdh_offset; //u32
		var rev;

		floppy[drv].multi_revolution = 1; // *multirev = 1;
		floppy[drv].skipoffset = -1; // *gapoffset = -1;

		//xfree(d.dat);
		d.dat16 = null;
		d.dat8 = null;
		d.dat = null;
		d.datsz = 0;

		//hdr_offset = 0x10 + track * sizeof(uint32_t);
		hdr_offset = 0x10 + track * 4;
		SAEF_ZFile_fseek(d.zf, hdr_offset, SEEK_SET);

		SAEF_ZFile_fread(longwords8,0, longwords.byteLength, 1, d.zf);
		tdh_offset = SAEF_le32toh(longwords32[0]);

		SAEF_ZFile_fseek(d.zf, tdh_offset, SEEK_SET);
		SAEF_ZFile_fread(trk_header,0, trk_header.length, 1, d.zf);
		if (SAEF_CompareArray(trk_header, SAEF_String2Array("TRK"), 3) != 0) {
			SAEF_warn("disk.scp_loadtrack() track header not found");
			return false;
		}
		if (trk_header[3] != track) {
			SAEF_warn("disk.scp_loadtrack() track error (%d != %d)", trk_header[3], track);
			return false;
		}
		for (rev = 0 ; rev < d.revs ; rev++) {
			SAEF_ZFile_fread(longwords8,0, longwords.byteLength, 1, d.zf);
			trkoffset[rev] = tdh_offset + SAEF_le32toh(longwords32[2]);
			d.index_off[rev] = SAEF_le32toh(longwords32[1]);
			d.datsz += d.index_off[rev];
		}

		//d.dat = xmalloc(uint16_t, d.datsz * sizeof(d.dat[0]));
		d.dat = new ArrayBuffer(d.datsz * 2);
		d.dat8 = new Uint8Array(d.dat);
		d.dat16 = new Uint16Array(d.dat);
		d.datsz = 0;

		for (rev = 0 ; rev < d.revs ; rev++) {
			SAEF_ZFile_fseek(d.zf, trkoffset[rev], SEEK_SET);
			SAEF_ZFile_fread(d.dat8,d.datsz * 2, d.index_off[rev] * 2, 1, d.zf);
			d.datsz += d.index_off[rev];
			d.index_off[rev] = d.datsz;
		}

		d.track = track;
		d.pll_mode = PLL_authentic;
		d.dat_idx = 0;
		d.index_pos = d.index_off[0];
		d.clock = d.clock_centre = CLOCK_CENTRE;
		d.nr_index = 0;
		d.flux = 0;
		d.clocked_zeros = 0;

		scp_loadrevolution(mfmbuf, drv, tracktiming); //, tracklength);
		return true;
	}

	function next_flux(d) {
		var val = 0; //u32

		for (;;) {
			if (d.dat_idx >= d.index_pos) {
				var rev = d.nr_index++ % d.revs;
				d.index_pos = d.index_off[rev];
				d.dat_idx = rev ? d.index_off[rev - 1] : 0;
				return -1;
			}

			var t = SAEF_be16toh(d.dat16[d.dat_idx++]);
			if (t == 0) { // overflow
				val += 0x10000; if (val > 0xffffffff) val -= 0x100000000;
				continue;
			}
			val += t; if (val > 0xffffffff) val -= 0x100000000;
			break;
		}
		var flux = val * SCK_NS_PER_TICK; while (flux > 0xffffffff) flux -= 0x100000000;
		return (flux & 0x80000000) ? flux - 0x100000000 : flux;
	}

	function flux_next_bit(d) {
		var new_flux;

		while (d.flux < Math.truncate(d.clock / 2)) { //ATT
			if ((new_flux = next_flux(d)) == -1)
				return -1;

			d.flux += new_flux;
			d.clocked_zeros = 0;
		}
		d.latency += d.clock;
		d.flux -= d.clock;

		if (d.flux >= Math.truncate(d.clock / 2)) { //ATT
			d.clocked_zeros++;
			return 0;
		}

		if (d.pll_mode != PLL_fixed_clock) {
			// PLL: Adjust clock frequency according to phase mismatch.
			if ((d.clocked_zeros >= 1) && (d.clocked_zeros <= 3)) {
				// In sync: adjust base clock by 10% of phase mismatch.
				var diff = Math.truncate(d.flux / (d.clocked_zeros + 1)); //ATT
				d.clock += Math.truncate(diff / 10); //ATT
			} else {
				// Out of sync: adjust base clock towards centre.
				d.clock += Math.truncate((d.clock_centre - d.clock) / 10); //ATT
			}

			// Clamp the clock's adjustment range.
			d.clock = Math.max(CLOCK_MIN(d.clock_centre), Math.min(CLOCK_MAX(d.clock_centre), d.clock));
		} else
			d.clock = d.clock_centre;

		// Authentic PLL: Do not snap the timing window to each flux transition.
		new_flux = d.pll_mode == PLL_authentic ? Math.truncate(d.flux / 2) : 0; //ATT
		d.latency += d.flux - new_flux;
		d.flux = new_flux;
		return 1;
	}

	//void scp_loadrevolution(uae_u16 *mfmbuf, int drv, uae_u16 *tracktiming, int *tracklength) {
	function scp_loadrevolution(mfmbuf, drv, tracktiming) {
		var d = scpdrive[drv];
		var prev_latency; //u64
		var av_latency; //u32
		var i, j, b;

		d.latency = prev_latency = 0;
		for (i = 0; (b = flux_next_bit(d)) != -1; i++) {
			if ((i & 15) == 0)
				mfmbuf[i >> 4] = 0;
			if (b)
				mfmbuf[i >> 4] |= 0x8000 >> (i & 15);

			if ((i & 7) == 7) {
				tracktiming[i >> 3] = d.latency - prev_latency;
				prev_latency = d.latency;
			}
		}
		if (i & 7)
			tracktiming[i >> 3] = Math.floor((d.latency - prev_latency) * 8 / (i & 7)); //ATT

		av_latency = Math.floor(prev_latency / (i >> 3)); //ATT

		for (j = 0; j < (i + 7) >> 3; j++)
			tracktiming[j] = Math.floor((tracktiming[j] * 1000) / av_latency); //ATT

		floppy[drv].tracklen = i; // *tracklength = i;
	}

	/*-----------------------------------------------------------------------*/
	/* SECT drive */
	/*-----------------------------------------------------------------------*/

	function get_floppy_speed() {
		var m = SAEV_config.floppy.speed;
		if (m <= 10) m = 100;
		return Math.floor(NORMAL_FLOPPY_SPEED() * 100 / m);
	}

	function get_floppy_speed2(drv) {
		var m = Math.truncate(get_floppy_speed() * drv.tracklen / (FLOPPY_WRITE_LEN() * 2 * drv.ddhd * 8));
		if (m <= 0)
			m = 1;
		return m;
	}

	function drive_id_name(drv) {
		switch(drv.drive_id) {
			case DRIVE_ID_35HD : return "3.5HD";
			case DRIVE_ID_525SD: return "5.25SD";
			case DRIVE_ID_35DD : return "3.5DD";
			case DRIVE_ID_NONE : return "NONE";
		}
		return "UNKNOWN";
	}

	/* Simulate exact behaviour of an A3000T 3.5 HD disk drive.
	* The drive reports to be a 3.5 DD drive whenever there is no
	* disk or a 3.5 DD disk is inserted. Only 3.5 HD drive id is reported
	* when a real 3.5 HD disk is inserted. -Adil */
	function drive_settype_id(drv) {
		var t = SAEV_config.floppy.drive[drv.num].type;

		switch (t) {
			case SAEC_Config_Floppy_Type_35_HD: {
				if (drv.diskfile === null || drv.ddhd <= 1)
					drv.drive_id = DRIVE_ID_35DD;
				else
					drv.drive_id = DRIVE_ID_35HD;
				break;
			}
			case SAEC_Config_Floppy_Type_35_DD_ESCOM:
			case SAEC_Config_Floppy_Type_35_DD:
			default:
				drv.drive_id = DRIVE_ID_35DD;
				break;
			case SAEC_Config_Floppy_Type_525_SD:
				drv.drive_id = DRIVE_ID_525SD;
				break;
			case SAEC_Config_Floppy_Type_None:
			case SAEC_Config_Floppy_Type_35_DD_PC:
			case SAEC_Config_Floppy_Type_35_HD_PC:
				drv.drive_id = DRIVE_ID_NONE;
				break;
		}
		if (DEBUG_DRIVE_ID) SAEF_log("disk.drive_settype_id() DF%d: set to %s", drv.num, drive_id_name(drv));
	}

	/*-----------------------------------------------------------------------*/

	function drive_image_free(drv) {
		switch (drv.filetype) {
			case ADF_SCP:
				scp_close(drv.num);
				break;
			/*case ADF_FDI:
				fdi2raw_header_free(drv.fdi);
				drv.fdi = 0;
				break;*/
		}
		drv.filetype = ADF_NONE;
		SAEF_ZFile_fclose(drv.diskfile);
		drv.diskfile = null;
		//SAEF_ZFile_fclose(drv.writediskfile);
		drv.writediskfile = null;
		//SAEF_ZFile_fclose(drv.pcdecodedfile);
		drv.pcdecodedfile = null;
	}

	/*-----------------------------------------------------------------------*/

	function reset_drive_gui(num) {
		var gd = SAER.gui.data;

		gd.df[num] = "";
		gd.crc32[num] = 0;
		gd.drive_disabled[num] = false;
		if (SAEV_config.floppy.drive[num].type <= SAEC_Config_Floppy_Type_None)
			gd.drive_disabled[num] = true;
	}

	function update_drive_gui(num, force) {
		var drv = floppy[num];
		var writ = dskdmaen == DSKDMA_WRITE && drv.state && !((selected | disabled) & (1 << num));
		var gd = SAER.gui.data;

		if (!force && drv.state == gd.drive_motor[num]
			&& drv.cyl == gd.drive_track[num]
			&& side == gd.drive_side
			&& drv.crc32 == gd.crc32[num]
			&& writ == gd.drive_writing[num]
			&& gd.df[num] == SAEV_config.floppy.drive[num].file.name
		) return;

		gd.df[num] = SAEV_config.floppy.drive[num].file.name;
		gd.crc32[num] = drv.crc32;
		gd.drive_motor[num] = drv.state;
		gd.drive_track[num] = drv.cyl;
		if (reserved & (1 << num))
			gd.drive_side = reserved_side;
		else
			gd.drive_side = side;
		gd.drive_writing[num] = writ;

		SAER.gui.led(num + SAEC_GUI_LED_DF0, (gd.drive_motor[num] ? 1 : 0) | (gd.drive_writing[num] ? 2 : 0), -1);
	}

	/*-----------------------------------------------------------------------*/
	/* reset */

	function reset_drive(num) {
		var drv = floppy[num];

		drv.amax = false;
		drive_image_free(drv);
		drv.motoroff = true;
		drv.idbit = 0;
		drv.drive_id = 0;
		drv.drive_id_scnt = 0;
		drv.lastdataacesstrack = -1;

		disabled &= ~(1 << num);
		if (SAEV_config.floppy.drive[num].type <= SAEC_Config_Floppy_Type_None || SAEV_config.floppy.drive[num].type >= SAEC_Config_Floppy_Type_35_DD_PC)
			disabled |= 1 << num;
		reserved &= ~(1 << num);
		if (SAEV_config.floppy.drive[num].type >= SAEC_Config_Floppy_Type_35_DD_PC)
			reserved |= 1 << num;

		reset_drive_gui(num);

		/* most internal Amiga floppy drives won't enable
		* diskready until motor is running at full speed
		* and next indexsync has been passed
		*/
		drv.indexhackmode = 0;
		if (num == 0 && SAEV_config.floppy.drive[num].type == SAEC_Config_Floppy_Type_35_DD)
			drv.indexhackmode = 1;
		drv.dskchange_time = 0;
		drv.dskchange_request = false;
		drv.dskchange = false;
		drv.dskready_down_time = 0;
		drv.dskready_up_time = 0;
		drv.buffered_cyl = -1;
		drv.buffered_side = -1;

		SAER.gui.led(num + SAEC_GUI_LED_DF0, 0, -1);
		drive_settype_id(drv);
		//SAEV_config.floppy.drive[num].name = changed_prefs.floppyslots[num].name;
		//drv.newname = "";
		//drv.newnamewriteprotected = false;
		drv.newfile = null;
		if (!drive_insert(drv, SAEV_config, num, SAEV_config.floppy.drive[num].file, false))
			SAER.disk.eject(num);
	}

	function setamax() {
		amax_enabled = false;
		//if (is_device_rom(SAEV_config, SAEC_RomType_AMAX, 0) > 0) {
		if (SAEV_config.memory.amaxRom.data.length > 0) {
			amax_enabled = true;
			// Put A-Max as last drive in drive chain
			var i;
			for (i = 0; i < MAX_FLOPPY_DRIVES; i++)
				if (floppy[i].amax)
					return;
			for (i = 0; i < MAX_FLOPPY_DRIVES; i++) {
				if ((1 << i) & disabled) {
					floppy[i].amax = true;
					SAEF_log("disk.setamax() using DF%d", i);
					return;
				}
			}
			SAEF_warn("disk.setamax() no drive available. (disable an drive to make it working)");
		}
	}

	/*-----------------------------------------------------------------------*/
	/* insert / eject */

	//function DISK_validate_filename(p, fname, leave_open, get_wrprot, get_crc, get_zf) {
	function DISK_validate_filename(p, file, leave_open, get_wrprot, get_crc, get_zf) {
		var wrprot = false;
		var crc32 = 0;
		var zf = null;

		if (get_zf)
			zf = null;
		if (get_crc)
			crc32 = 0;
		if (get_wrprot)
			wrprot = p.floppy.readOnly ? true : false;

		if (leave_open || !get_zf) {
			/*var f = SAEF_ZFile_fopen(fname, "r+b", ZFD_NORMAL | ZFD_DISKHISTORY);
			if (!f) {
				if (get_wrprot) wrprot = true;
				f = SAEF_ZFile_fopen(fname, "rb", ZFD_NORMAL | ZFD_DISKHISTORY);
			}*/
			var f = SAEF_ZFile_fopen_file(file);
			if (f !== null) {
				if (get_crc) {
					if (file.crc32 !== false)
						crc32 = file.crc32;
					else
						crc32 = SAEF_ZFile_crc32(f);
				}
				if (get_zf)
					zf = f;
				else
					SAEF_ZFile_fclose(f);

				return [true, wrprot, crc32, zf];
			}
			return [false, false, 0, null];
		} else {
			/*if (SAEF_ZFile_exists(fname)) {
				if (get_wrprot && !p.floppy.readOnly)
					wrprot = false;
				if (get_crc) {
					var f = SAEF_ZFile_fopen(fname, "rb", ZFD_NORMAL | ZFD_DISKHISTORY);
					if (f) crc32 = SAEF_ZFile_crc32(f);
					SAEF_ZFile_fclose(f);
				}
				return [true, wrprot, crc32, zf];
			} else {
				if (get_wrprot) wrprot = true;
				return [false, wrprot, crc32, zf];
			}*/
		}
	}

	function updatemfmpos(drv) {
		if (drv.prevtracklen) {
			drv.mfmpos = Math.floor(drv.mfmpos * Math.floor(drv.tracklen * 1000 / drv.prevtracklen) / 1000); //ATT
			if (drv.mfmpos >= drv.tracklen)
				drv.mfmpos = drv.tracklen - 1;
		}
		drv.mfmpos %= drv.tracklen;
		drv.prevtracklen = drv.tracklen;
	}

	function track_reset(drv) {
		drv.tracklen = FLOPPY_WRITE_LEN() * 2 * drv.ddhd * 8;
		drv.revolutions = 1;
		drv.trackspeed = get_floppy_speed();
		drv.buffered_side = -1;
		drv.skipoffset = -1;
		drv.tracktiming[0] = 0;
		//memset(drv.bigmfmbuf, 0xaa, FLOPPY_WRITE_LEN() * 2 * drv.ddhd);
		SAEF_memset(drv.bigmfmbuf,0, 0xaaaa, FLOPPY_WRITE_LEN() * 2 * drv.ddhd >> 1);
		updatemfmpos(drv);
	}

	/*---------------------------------*/

	//static int read_header_ext2(struct zfile *diskfile, trackid *trackdata, int *num_tracks, int *ddhd) {
	function read_header_ext2(drv, ddhd) {
		var buffer = new Uint8Array(2 + 2 + 4 + 4);

		SAEF_ZFile_fseek(drv.diskfile, 0, SEEK_SET);
		SAEF_ZFile_fread(buffer,0, 1, 8, drv.diskfile);
		if (SAEF_CompareArray(buffer, SAEF_String2Array("UAE-1ADF"), 8) != 0)
			return 0;
		SAEF_ZFile_fread(buffer,0, 1, 4, drv.diskfile);
		drv.num_tracks = buffer[2] * 256 + buffer[3];
		var offs = 8 + 2 + 2 + drv.num_tracks * (2 + 2 + 4 + 4);

		for (var i = 0; i < drv.num_tracks; i++) {
			var tid = drv.trackdata[i];
			SAEF_ZFile_fread(buffer,0, 2 + 2 + 4 + 4, 1, drv.diskfile);
			tid.type = buffer[3];
			tid.revolutions = buffer[2] + 1;
			tid.len = buffer[5] * 65536 + buffer[6] * 256 + buffer[7];
			tid.bitlen = buffer[9] * 65536 + buffer[10] * 256 + buffer[11];
			tid.offs = offs;
			if (tid.len > 20000 && ddhd)
				drv.ddhd = 2;
			tid.track = i;
			offs += tid.len;
		}
		return 1;
	}

	/*---------------------------------*/

	/*static void saveimagecutpathpart(TCHAR *name) {
		int i;

		i = _tcslen (name) - 1;
		while (i > 0) {
			if (name[i] == '/' || name[i] == '\\') {
				name[i] = 0;
				break;
			}
			if (name[i] == '.') {
				name[i] = 0;
				break;
			}
			i--;
		}
		while (i > 0) {
			if (name[i] == '/' || name[i] == '\\') {
				name[i] = 0;
				break;
			}
			i--;
		}
	}
	static void saveimagecutfilepart(TCHAR *name) {
		TCHAR tmp[MAX_DPATH];
		int i;

		_tcscpy(tmp, name);
		i = _tcslen (tmp) - 1;
		while (i > 0) {
			if (tmp[i] == '/' || tmp[i] == '\\') {
				_tcscpy(name, tmp + i + 1);
				break;
			}
			if (tmp[i] == '.') {
				tmp[i] = 0;
				break;
			}
			i--;
		}
		while (i > 0) {
			if (tmp[i] == '/' || tmp[i] == '\\') {
				_tcscpy(name, tmp + i + 1);
				break;
			}
			i--;
		}
	}
	static void saveimageaddfilename(TCHAR *dst, const TCHAR *src, int type) {
		_tcscat(dst, src);
		if (type)
			_tcscat(dst, _T(".save_adf"));
		else
			_tcscat(dst, _T("_save.adf"));
	}

	static TCHAR *DISK_get_default_saveimagepath (const TCHAR *name) {
		TCHAR name1[MAX_DPATH];
		TCHAR path[MAX_DPATH];
		_tcscpy(name1, name);
		saveimagecutfilepart(name1);
		fetch_saveimagepath (path, sizeof path / sizeof (TCHAR), 1);
		saveimageaddfilename(path, name1, 0);
		return my_strdup(path);
	}
	// -2 = existing, if not, use 0.
	// -1 = as configured
	// 0 = saveimages-dir
	// 1 = image dir
	TCHAR *DISK_get_saveimagepath(const TCHAR *name, int type) {
		int typev = type;

		for (int i = 0; i < 2; i++) {
			if (typev == 1 || (typev == -1 && saveimageoriginalpath) || (typev == -2 && (saveimageoriginalpath || i == 1))) {
				TCHAR si_name[MAX_DPATH], si_path[MAX_DPATH];
				_tcscpy(si_name, name);
				_tcscpy(si_path, name);
				saveimagecutfilepart(si_name);
				saveimagecutpathpart(si_path);
				_tcscat(si_path, FSDB_DIR_SEPARATOR_S);
				saveimageaddfilename(si_path, si_name, 1);
				if (typev != -2 || (typev == -2 && SAEF_ZFile_exists(si_path)))
					return my_strdup(si_path);
			}
			if (typev == 2 || (typev == -1 && !saveimageoriginalpath) || (typev == -2 && (!saveimageoriginalpath || i == 1))) {
				TCHAR *p = DISK_get_default_saveimagepath(name);
				if (typev != -2 || (typev == -2 && SAEF_ZFile_exists(p)))
					return p;
				xfree(p);
			}
		}
		return DISK_get_saveimagepath(name, -1);
	}
	static struct zfile *getexistingwritefile(struct uae_prefs *p, const TCHAR *name, bool *wrprot) {
		struct zfile *zf = null;
		TCHAR *path;
		path = DISK_get_saveimagepath(name, saveimageoriginalpath);
		DISK_validate_filename (p, path, 1, wrprot, null, &zf);
		xfree(path);
		if (zf)
			return zf;
		path = DISK_get_saveimagepath(name, !saveimageoriginalpath);
		DISK_validate_filename (p, path, 1, wrprot, null, &zf);
		xfree(path);
		return zf;
	}
	static int openwritefile (struct uae_prefs *p, drive *drv, int create) {
		bool wrprot = 0;

		drv->writediskfile = getexistingwritefile(p, SAEV_config.floppy.drive[drv.num].name, &wrprot);
		if (drv->writediskfile) {
			drv->wrprot = wrprot;
			if (!read_header_ext2(drv->writediskfile, drv->writetrackdata, &drv->write_num_tracks, 0)) {
				SAEF_ZFile_fclose (drv->writediskfile);
				drv->writediskfile = 0;
				drv->wrprot = 1;
			} else {
				if (drv->write_num_tracks > drv->num_tracks)
					drv->num_tracks = drv->write_num_tracks;
			}
		} else if (SAEF_ZFile_iscompressed (drv->diskfile)) {
			drv->wrprot = 1;
		}
		return drv->writediskfile ? 1 : 0;
	}*/

	/*---------------------------------*/

	function isrecognizedext(name) {
		var last = name.lastIndexOf(".");
		if (last != -1 && last + 1 != name.length) {
			var ext = name.substring(last + 1);
			ext = ext.toLowerCase();
			if (ext == "adf" || ext == "adz" || ext == "st" || ext == "ima" || ext == "img") {
				SAEF_log("disk.isrecognizedext() extention '%s' found", ext);
				return true;
			}
			SAEF_log("disk.isrecognizedext() unknow extention '%s'", ext);
		} else
			SAEF_log("disk.isrecognizedext() no extention");

		return false;
	}

	function update_disk_statusline(num) {
		/*
		drive *drv = &floppy[num];
		if (drv->diskfile === null)
			return;
		const TCHAR *fname = SAEF_ZFile_getoriginalname(drv->diskfile);
		if (!fname)
			fname = SAEF_ZFile_getname(drv->diskfile);
		if (!fname)
			fname = _T("?");
		if (disk_info_data.diskname[0])
			statusline_add_message(_T("DF%d: [%s] %s"), num, disk_info_data.diskname, my_getfilepart(fname));
		else
			statusline_add_message(_T("DF%d: %s"), num, my_getfilepart(fname));*/
	}

	/*---------------------------------*/

	//function drive_insert(drv, p, dnum, fname, fake, forcedwriteprotect) {
	function drive_insert(drv, p, dnum, file, fake) {
		var buffer = new Uint8Array(2 + 2 + 4 + 4);
		var tid = null;

		drive_image_free(drv);
		//if (!fake) examine_image(p, dnum, disk_info_data);
		//DISK_validate_filename(p, fname, 1, &drv.wrprot, &drv.crc32, &drv.diskfile);
		//var result = DISK_validate_filename(p, fname, fdata, true, true, true, true);
		var result = DISK_validate_filename(p, file, true, true, true, true);
		drv.wrprot = result[1];
		drv.crc32 = result[2];
		drv.diskfile = result[3];

		drv.forcedwrprot = file.prot; //forcedwriteprotect;
		if (drv.forcedwrprot)
			drv.wrprot = true;
		drv.ddhd = 1;
		drv.num_heads = 2;
		drv.num_secs = 0;
		drv.hard_num_cyls = p.floppy.drive[dnum].type == SAEC_Config_Floppy_Type_525_SD ? 40 : 80;
		drv.tracktiming[0] = 0;
		drv.useturbo = 0;
		drv.indexoffset = 0;
		if (!fake) {
			drv.dskeject = false;
			//gui_disk_image_change(dnum, fname, drv.wrprot);
		}

		if (!drv.motoroff) {
			drv.dskready_up_time = DSKREADY_UP_TIME * 312 + (Math.decimalRandom() & 511);
			drv.dskready_down_time = 0;
		}

		if (drv.diskfile === null) {
			track_reset(drv);
			return 0;
		}

		if (!fake) {
			//inprec_recorddiskchange(dnum, fname, drv.wrprot);

			//if (SAEV_config.floppy.drive[dnum].name !== fname) SAEV_config.floppy.drive[dnum].name = fname;
			//SAEV_config.floppy.drive[dnum].forcedWriteProtect = forcedwriteprotect;
			//changed_prefs.floppyslots[dnum].name = fname;
			//changed_prefs.floppyslots[dnum].forcedWriteProtect = forcedwriteprotect;

			//drv.newname = fname;
			//drv.newnamewriteprotected = forcedwriteprotect;
			drv.newfile = SAEF_CloneObject(file); //ATT
			//SAER.gui.filename(dnum, file.name); //fname);
		}

		//memset(buffer, 0, sizeof buffer);
		SAEF_memset(buffer,0, 0, buffer.length);

		var size = 0;
		if (drv.diskfile !== null) {
			SAEF_ZFile_fread(buffer,0, 1, 8, drv.diskfile);
			SAEF_ZFile_fseek(drv.diskfile, 0, SEEK_END);
			size = SAEF_ZFile_ftell(drv.diskfile);
			SAEF_ZFile_fseek(drv.diskfile, 0, SEEK_SET);
		}

		var canauto = 0;
		if (isrecognizedext(file.name))
			canauto = 1;
		if (!canauto && drv.diskfile && isrecognizedext(SAEF_ZFile_getname(drv.diskfile)))
			canauto = 1;
		// if PC-only drive, make sure PC-like floppies are alwayss detected
		if (!canauto && SAEV_config.floppy.drive[dnum].type >= SAEC_Config_Floppy_Type_35_DD_PC)
			canauto = 1;

		if (SAEF_CompareArray(buffer, SAEF_String2Array("SCP"), 3) == 0) {
			//var num_tracks;
			drv.wrprot = true;
			//if (!scp_open(drv.diskfile, drv.num, num_tracks)) {
			if (!scp_open(drv.diskfile, drv.num)) {
				SAEF_ZFile_fclose(drv.diskfile);
				drv.diskfile = null;
				return 0;
			}
			//drv.num_tracks = num_tracks;
			drv.filetype = ADF_SCP;
		}
		/*else if ((drv.fdi = fdi2raw_header(drv.diskfile))) {
			drv.wrprot = true;
			drv.num_tracks = fdi2raw_get_last_track(drv.fdi);
			drv.num_secs = fdi2raw_get_num_sector(drv.fdi);
			drv.filetype = ADF_FDI;
		}*/
		else if (SAEF_CompareArray(buffer, SAEF_String2Array("UAE-1ADF"), 8) == 0) {
			//read_header_ext2(drv.diskfile, drv.trackdata, &drv.num_tracks, &drv.ddhd);
			read_header_ext2(drv, drv.ddhd);
			drv.filetype = ADF_EXT2;
			drv.num_secs = 11;
			if (drv.ddhd > 1)
				drv.num_secs = 22;
		}
		else if (SAEF_CompareArray(buffer, SAEF_String2Array("UAE--ADF"), 8) == 0) {
			var offs = 160 * 4 + 8;

			drv.wrprot = true;
			drv.filetype = ADF_EXT1;
			drv.num_tracks = 160;
			drv.num_secs = 11;

			SAEF_ZFile_fseek(drv.diskfile, 8, SEEK_SET);
			for (var i = 0; i < 160; i++) {
				tid = drv.trackdata[i];
				SAEF_ZFile_fread(buffer,0, 4, 1, drv.diskfile);
				tid.sync = buffer[0] * 256 + buffer[1];
				tid.len = buffer[2] * 256 + buffer[3];
				tid.offs = offs;
				tid.revolutions = 1;
				if (tid.sync == 0) {
					tid.type = TRACK_AMIGADOS;
					tid.bitlen = 0;
				} else {
					tid.type = TRACK_RAW1;
					tid.bitlen = tid.len * 8;
				}
				offs += tid.len;
			}
		}
		/*else if (SAEF_CompareArray(buffer, exeheader, 8) == 0) {
			var z = SAEF_ZFile_fopen_empty(null, "", 512 * 1760);
			if (createimagefromexe(drv.diskfile, z)) {
				SAEF_log("disk.drive_insert() converted '%s' to ADF", SAEF_ZFile_getname(drv.diskfile));
				drv.filetype = ADF_NORMAL;
				SAEF_ZFile_fclose(drv.diskfile);
				drv.diskfile = z;
				drv.num_tracks = 160;
				drv.num_secs = 11;
				for (var i = 0; i < drv.num_tracks; i++) {
					tid = drv.trackdata[i];
					tid.type = TRACK_AMIGADOS;
					tid.len = 512 * drv.num_secs;
					tid.bitlen = 0;
					tid.offs = i * 512 * drv.num_secs;
					tid.revolutions = 1;
				}
				drv.useturbo = 1;
			} else
				//SAEF_warn("disk.drive_insert() can't convert '%s' to ADF, because the file is too big", SAEF_ZFile_getname(drv.diskfile));
				alert(sprintf("Can't convert '%s' to ADF. (too big)", SAEF_ZFile_getname(drv.diskfile)));
		}*/
		else if (canauto && (
			// 320k double sided
			size == 8 * 40 * 2 * 512 ||
			// 320k single sided
			size == 8 * 40 * 1 * 512 ||

			// 360k double sided
			size == 9 * 40 * 2 * 512 ||
			// 360k single sided
			size == 9 * 40 * 1 * 512 ||

			// 1.2M double sided
			size == 15 * 80 * 2 * 512 ||

			// 720k/1440k double sided
			size == 9 * 80 * 2 * 512 || size == 18 * 80 * 2 * 512 || size == 10 * 80 * 2 * 512 || size == 20 * 80 * 2 * 512 || size == 21 * 80 * 2 * 512 ||
			size == 9 * 81 * 2 * 512 || size == 18 * 81 * 2 * 512 || size == 10 * 81 * 2 * 512 || size == 20 * 81 * 2 * 512 || size == 21 * 81 * 2 * 512 ||
			size == 9 * 82 * 2 * 512 || size == 18 * 82 * 2 * 512 || size == 10 * 82 * 2 * 512 || size == 20 * 82 * 2 * 512 || size == 21 * 82 * 2 * 512 ||
			// 720k/1440k single sided
			size == 9 * 80 * 1 * 512 || size == 18 * 80 * 1 * 512 || size == 10 * 80 * 1 * 512 || size == 20 * 80 * 1 * 512 ||
			size == 9 * 81 * 1 * 512 || size == 18 * 81 * 1 * 512 || size == 10 * 81 * 1 * 512 || size == 20 * 81 * 1 * 512 ||
			size == 9 * 82 * 1 * 512 || size == 18 * 82 * 1 * 512 || size == 10 * 82 * 1 * 512 || size == 20 * 82 * 1 * 512)
		) {
			/* PC formatted image */
			var side;

			drv.num_secs = 9;
			drv.ddhd = 1;

			for (side = 2; side > 0; side--) {
				if (       size ==  9 * 80 * side * 512 || size ==  9 * 81 * side * 512 || size ==  9 * 82 * side * 512) {
					drv.num_secs = 9;
					drv.ddhd = 1;
					break;
				} else if (size == 18 * 80 * side * 512 || size == 18 * 81 * side * 512 || size == 18 * 82 * side * 512) {
					drv.num_secs = 18;
					drv.ddhd = 2;
					break;
				} else if (size == 10 * 80 * side * 512 || size == 10 * 81 * side * 512 || size == 10 * 82 * side * 512) {
					drv.num_secs = 10;
					drv.ddhd = 1;
					break;
				} else if (size == 20 * 80 * side * 512 || size == 20 * 81 * side * 512 || size == 20 * 82 * side * 512) {
					drv.num_secs = 20;
					drv.ddhd = 2;
					break;
				} else if (size == 21 * 80 * side * 512 || size == 21 * 81 * side * 512 || size == 21 * 82 * side * 512) {
					drv.num_secs = 21;
					drv.ddhd = 2;
					break;
				} else if (size == 9 * 40 * side * 512) {
					drv.num_secs = 9;
					drv.ddhd = 1;
					break;
				} else if (size == 8 * 40 * side * 512) {
					drv.num_secs = 8;
					drv.ddhd = 1;
					break;
				} else if (size == 15 * 80 * side * 512) {
					drv.num_secs = 15;
					drv.ddhd = 1;
					break;
				}
			}
			drv.num_tracks = Math.floor(size / (drv.num_secs * 512));
			drv.filetype = ADF_PCDOS;
			tid = drv.trackdata[0];
			for (var i = 0; i < drv.num_tracks; i++) {
				tid.type = TRACK_PCDOS;
				tid.len = 512 * drv.num_secs;
				tid.bitlen = 0;
				tid.offs = i * 512 * drv.num_secs;
				if (side == 1) {
					tid++;
					tid.type = TRACK_NONE;
					tid.len = 512 * drv.num_secs;
				}
				tid.revolutions = 1;
				tid++;

			}
			drv.num_heads = side;
			if (side == 1)
				drv.num_tracks *= 2;
		} else if ((size == 262144 || size == 524288) && buffer[0] == 0x11 && (buffer[1] == 0x11 || buffer[1] == 0x14)) {
			//256k == Kickstart disk, 512k == SuperKickstart disk
			drv.filetype = size == 262144 ? ADF_KICK : ADF_SKICK;
			drv.num_tracks = 1760 / (drv.num_secs = 11);
			for (var i = 0; i < drv.num_tracks; i++) {
				tid = drv.trackdata[i];
				tid.type = TRACK_AMIGADOS;
				tid.len = 512 * drv.num_secs;
				tid.bitlen = 0;
				tid.offs = i * 512 * drv.num_secs - (drv.filetype == ADF_KICK ? 512 : 262144 + 1024);
				tid.track = i;
				tid.revolutions = 1;
			}
		} else {
			var i;

			var ds = 0;
			drv.filetype = ADF_NORMAL;

			/* High-density or diskspare disk? */
			drv.num_tracks = 0;
			if (size > 160 * 11 * 512 + 511) { // larger than standard adf?
				for (i = 80; i <= 83; i++) {
					if (size == i * 22 * 512 * 2) { // HD
						drv.num_secs = 22;
						drv.num_tracks = size / (22 * 512);
						drv.ddhd = 2;
						break;
					}
					if (size == i * 11 * 512 * 2) { // >80 cyl DD
						drv.num_secs = 11;
						drv.num_tracks = size / (11 * 512);
						break;
					}
					if (size == i * 12 * 512 * 2) { // ds 12 sectors
						drv.num_secs = 12;
						drv.num_tracks = size / (12 * 512);
						ds = 1;
						break;
					}
					if (size == i * 24 * 512 * 2) { // ds 24 sectors
						drv.num_secs = 24;
						drv.num_tracks = size / (24 * 512);
						drv.ddhd = 2;
						ds = 1;
						break;
					}
				}
				if (drv.num_tracks == 0) {
					drv.num_secs = 22;
					drv.num_tracks = Math.floor(size / (22 * 512));
					drv.ddhd = 2;
				}
			} else {
				drv.num_secs = 11;
				drv.num_tracks = Math.floor(size / (11 * 512));
			}
			if (!ds && drv.num_tracks > MAX_TRACKS) {
				SAEF_warn("disk.drive_insert() Your diskfile is too big, %d bytes!", size);
				//OWN
				SAEF_ZFile_fclose(drv.diskfile);
				drv.diskfile = null;
				return 0;
			}
			for (i = 0; i < drv.num_tracks; i++) {
				tid = drv.trackdata[i];
				tid.type = ds ? TRACK_DISKSPARE : TRACK_AMIGADOS;
				tid.len = 512 * drv.num_secs;
				tid.bitlen = 0;
				tid.offs = i * 512 * drv.num_secs;
				tid.revolutions = 1;
			}
		}
		//openwritefile(p, drv, 0);
		drive_settype_id(drv); /* Set DD or HD drive */
		drive_fill_bigbuf(drv, true);
		drv.mfmpos = (((Math.decimalRandom() & 0xffff) << 16) | (Math.decimalRandom() & 0xffff)) >>> 0;
		drv.mfmpos %= drv.tracklen;
		drv.prevtracklen = 0;
		if (!fake) {
			update_drive_gui(drv.num, false);
			update_disk_statusline(drv.num);
		}
		return 1;
	}

	function drive_eject(drv) {
		//if (drv.diskfile || drv.filetype >= 0) statusline_add_message("DF%d: -", drv.num);
		//gui_disk_image_change(drv.num, null, drv.wrprot);
		drive_image_free(drv);
		drv.dskeject = false;
		drv.dskchange = true;
		drv.ddhd = 1;
		drv.dskchange_time = 0;
		drv.dskready = 0;
		drv.dskready_up_time = 0;
		drv.dskready_down_time = 0;
		drv.crc32 = 0;
		drive_settype_id(drv); /* Back to 35 DD */
		if (disk_debug_logging > 0) SAEF_log("disk.drive_eject() %d", drv.num);
		//inprec_recorddiskchange(drv.num, null, false);
	}

	function drive_writeprotected(drv) {
		//SAEF_log("disk.drive_writeprotected() df%d: ro %d  wp %d  fwp %d  %s", drv.num, SAEV_config.floppy.readOnly?1:0, drv.wrprot?1:0, drv.forcedwrprot?1:0, drv.diskfile ? SAEF_ZFile_getname(drv.diskfile) : "none");
		return SAEV_config.floppy.readOnly || drv.wrprot || drv.forcedwrprot || drv.diskfile === null;
	}

	/*-----------------------------------------------------------------------*/
	/* step / motor */

	function rand_shifter(drv) {
		var r = ((Math.decimalRandom() >>> 4) & 7) + 1;
		while (r-- > 0) {
			word <<= 1;
			word |= (Math.decimalRandom() & 0x1000) ? 1 : 0;
			word &= 0xffff; //OWN
			bitoffset++;
			bitoffset &= 15;
		}
	}

	function drive_empty(drv) {
		return drv.diskfile === null && drv.dskchange_time >= 0;
	}

	function set_steplimit(drv) {
		// emulate step limit only if cycle-exact or approximate CPU speed
		if (SAEV_config.cpu.speed == SAEC_Config_CPU_Speed_Original) {
			drv.steplimit = 4;
			drv.steplimitcycle = SAEV_Events_currcycle;
		}
	}

	function drive_step(drv, step_direction) {
		if (!drive_empty(drv))
			drv.dskchange = false;
		if (drv.steplimit && SAEV_Events_currcycle - drv.steplimitcycle < MIN_STEPLIMIT_CYCLE) {
			SAEF_log("disk.drive_step() ignored df%d, cycle %d", drv.num, Math.floor((SAEV_Events_currcycle - drv.steplimitcycle) * SAEC_Events_CYCLE_UNIT_INV));
			return;
		}
		/* A1200's floppy drive needs at least 30 raster lines between steps
		* but we'll use very small value for better compatibility with faster CPU emulation
		* (stupid trackloaders with CPU delay loops)
		*/
		set_steplimit(drv);
		if (step_direction) {
			if (drv.cyl) {
				drv.cyl--;
			}
			/*	else
			SAEF_log("disk.drive_step() program tried to step beyond track zero");
			"no-click" programs does that
			*/
		} else {
			var maxtrack = drv.hard_num_cyls;
			if (drv.cyl < maxtrack + 3) {
				drv.cyl++;
			}
			if (drv.cyl >= maxtrack)
				SAEF_warn("disk.drive_step() program tried to step over track %d", maxtrack);
		}
		rand_shifter(drv);
		if (disk_debug_logging > 2) SAEF_log("disk.drive_step() %d", drv.cyl);
	}

	function drive_track0(drv) {
		return drv.cyl == 0;
	}

	/*---------------------------------*/

	function drive_running(drv) {
		return !drv.motoroff;
	}

	/*function motordelay_func(v) {
		floppy[v].motordelay = 0;
	}*/
	function drive_motor(drv, off) {
		if (drv.motoroff && !off) {
			drv.dskready_up_time = DSKREADY_UP_TIME * 312 + (Math.decimalRandom() & 511);
			rand_shifter(drv);
			if (disk_debug_logging > 2) SAEF_log("disk.drive_motor() on");
		}
		if (!drv.motoroff && off) {
			drv.drive_id_scnt = 0; /* Reset id shift reg counter */
			drv.dskready_down_time = DSKREADY_DOWN_TIME * 312 + (Math.decimalRandom() & 511);
			if (DEBUG_DRIVE_ID) SAEF_log("disk.drive_motor() Selected DF%d: reset id shift reg.", drv.num);
			if (disk_debug_logging > 2) SAEF_log("disk.drive_motor() off");

			if (SAEV_config.cpu.model <= SAEC_Config_CPU_Model_68010 && SAEV_config.cpu.speed == SAEC_Config_CPU_Speed_Original) {
				drv.motordelay = 1;
				//SAER.events.event2_newevent2(30, drv.num, motordelay_func);
				SAER.events.event2_newevent_xx(-1, 30 * SAEC_Events_CYCLE_UNIT, drv.num, function(v) {
					floppy[v].motordelay = 0;
				});
			}
		}
		drv.motoroff = off;
		if (drv.motoroff) {
			drv.dskready = 0;
			drv.dskready_up_time = 0;
		} else
			drv.dskready_down_time = 0;
	}

	/*-----------------------------------------------------------------------*/
	/* read */

	function read_floppy_data(diskfile, type, tid, offset, dst,dsto, len) {
		if (len == 0)
			return;
		if (tid.track == 0) {
			if (type == ADF_KICK) {
				//memset(dst, 0, len > 512 ? 512 : len);
				SAEF_memset(dst,dsto, 0, len > 512 ? 512 : len);
				if (offset == 0) {
					dst.set(SAEF_String2Array("KICK"), dsto);
					len -= 512;
				}
			} else if (type == ADF_SKICK) {
				//memset(dst, 0, len > 512 ? 512 : len);
				SAEF_memset(dst,dsto, 0, len > 512 ? 512 : len);
				if (offset == 0) {
					dst.set(SAEF_String2Array("KICKSUP0"), dsto);
					len -= 1024;
				} else if (offset == 512)
					len -= 512;
			}
		}
		var off = tid.offs + offset;
		if (off >= 0 && len > 0) {
			SAEF_ZFile_fseek(diskfile, off, SEEK_SET);
			SAEF_ZFile_fread(dst,dsto, 1, len, diskfile);
		}
	}

	/* Megalomania does not like zero MFM words... */
	function mfmcode(mfm,mfmo, words) {
		var lastword = 0;
		while (words--) {
			var v = mfm[mfmo] & 0x5555;//5555;
			var lv = ((lastword << 16) | v) >>> 0;
			var nlv = ~lv & 0x55555555;
			var mfmbits = (((nlv << 1) & (nlv >>> 1)) >>> 0) & 0xffff;
			mfm[mfmo++] = v | mfmbits;
			lastword = v;
		}
	}

	/*---------------------------------*/
	/* read amigados */

	function decode_amigados(drv) {
		var tr = drv.cyl * 2 + side;
		var dstmfmoffset = FLOPPY_GAP_LEN();
		//var dstmfmbuf = drv.bigmfmbuf; //u16 *
		var len = drv.num_secs * 544 + FLOPPY_GAP_LEN();
		var ti = drv.trackdata[tr];

		//memset(dstmfmbuf, 0xaa, len * 2);
		SAEF_memset(drv.bigmfmbuf,0, 0xaaaa, len);
		//dstmfmoffset += FLOPPY_GAP_LEN();
		drv.skipoffset = Math.floor((FLOPPY_GAP_LEN() * 8) / 3) * 2; //ATT
		drv.tracklen = len * 2 * 8;

		var prevbit = 0;
		for (var sec = 0; sec < drv.num_secs; sec++) {
			var secbuf = new Uint8Array(544);
			var mfmbuf = new Uint16Array(544 + 1);
			var hck = 0, dck = 0;

			secbuf[0] = secbuf[1] = 0x00;
			secbuf[2] = secbuf[3] = 0xa1;
			secbuf[4] = 0xff;
			secbuf[5] = tr;
			secbuf[6] = sec;
			secbuf[7] = drv.num_secs - sec;

			for (var i = 8; i < 24; i++)
				secbuf[i] = 0;

			read_floppy_data(drv.diskfile, drv.filetype, ti, sec * 512, secbuf,32, 512);

			mfmbuf[0] = prevbit ? 0x2aaa : 0xaaaa;
			mfmbuf[1] = 0xaaaa;
			mfmbuf[2] = mfmbuf[3] = 0x4489;

			var deven = ((secbuf[4] << 24) | (secbuf[5] << 16) | (secbuf[6] << 8) | (secbuf[7])) >>> 0;
			var dodd = deven >>> 1;
			deven &= 0x55555555;
			dodd &= 0x55555555;
			mfmbuf[4] = dodd >>> 16;
			mfmbuf[5] = dodd & 0xffff;
			mfmbuf[6] = deven >>> 16;
			mfmbuf[7] = deven & 0xffff;

			for (i = 8; i < 48; i++)
				mfmbuf[i] = 0xaaaa;
			for (i = 0; i < 512; i += 4) {
				deven = ((secbuf[i + 32] << 24) | (secbuf[i + 33] << 16) | (secbuf[i + 34] << 8) | (secbuf[i + 35])) >>> 0;
				dodd = deven >>> 1;
				deven &= 0x55555555;
				dodd &= 0x55555555;
				mfmbuf[(i >> 1) + 32] = dodd >>> 16;
				mfmbuf[(i >> 1) + 33] = dodd & 0xffff;
				mfmbuf[(i >> 1) + 256 + 32] = deven >>> 16;
				mfmbuf[(i >> 1) + 256 + 33] = deven & 0xffff;
			}

			for (i = 4; i < 24; i += 2)
				hck = (hck ^ ((mfmbuf[i] << 16) | mfmbuf[i + 1]) >>> 0) >>> 0;

			deven = dodd = hck;
			dodd >>>= 1;
			mfmbuf[24] = dodd >>> 16;
			mfmbuf[25] = dodd & 0xffff;
			mfmbuf[26] = deven >>> 16;
			mfmbuf[27] = deven & 0xffff;

			for (i = 32; i < 544; i += 2)
				dck = (dck ^ ((mfmbuf[i] << 16) | mfmbuf[i + 1]) >>> 0) >>> 0;

			deven = dodd = dck;
			dodd >>>= 1;
			mfmbuf[28] = dodd >>> 16;
			mfmbuf[29] = dodd & 0xffff;
			mfmbuf[30] = deven >>> 16;
			mfmbuf[31] = deven & 0xffff;

			mfmbuf[544] = 0;

			mfmcode(mfmbuf,4, 544 - 4 + 1);

			for (i = 0; i < 544; i++) {
				drv.bigmfmbuf[dstmfmoffset % len] = mfmbuf[i];
				dstmfmoffset++;
			}
			prevbit = mfmbuf[i - 1] & 1;
			// so that final word has correct MFM encoding
			drv.bigmfmbuf[dstmfmoffset % len] = mfmbuf[i];
		}

		if (disk_debug_logging > 0) SAEF_log("disk.decode_amigados() read track %d", tr);
	}

	/*---------------------------------*/
	/* read pcdos */

	const mfmencodetable = [
		0x2a, 0x29, 0x24, 0x25, 0x12, 0x11, 0x14, 0x15,
		0x4a, 0x49, 0x44, 0x45, 0x52, 0x51, 0x54, 0x55
	];
	function dos_encode_byte(byte) {
		var word = (mfmencodetable[byte >> 4] << 8) | mfmencodetable[byte & 15];
		return (word | ((word & (256 | 64)) ? 0 : 128));
	}
	function mfmcoder(src, dest,desto, len) {
		var i, srco = 0;

		for (i = 0; i < len; i++) {
			dest[desto] = dos_encode_byte(src[srco++]);
			dest[desto] |= ((dest[desto - 1] & 1) || (dest[desto] & 0x4000)) ? 0: 0x8000;
			desto++;
		}
		return desto;
	}
	function decode_pcdos(drv) {
		var i, len;
		var tr = drv.cyl * 2 + side;
		//uae_u16 *dstmfmbuf, *mfm2;
		var secbuf = new Uint8Array(1000);
		var crc16;
		var ti = drv.trackdata[tr];
		const tracklen = 12500;

		//SAEF_log("disk.decode_pcdos() num_secs %d, hd %d", drv.num_secs, drv.ddhd);

		var mfm2 = drv.bigmfmbuf;
		var mfm2o = 0; //OWN
		var dstmfmbufo = 0; //OWN

		mfm2[mfm2o++] = 0x9254; // *mfm2++ = 0x9254;
		SAEF_memset(secbuf,0, 0x4e, 40);
		SAEF_memset(secbuf,40, 0x00, 12);
		secbuf[52] = 0xc2;
		secbuf[53] = 0xc2;
		secbuf[54] = 0xc2;
		secbuf[55] = 0xfc;
		SAEF_memset(secbuf,56, 0x4e, 40);
		dstmfmbufo = mfmcoder(secbuf, mfm2,mfm2o, 96);
		mfm2[mfm2o + 52] = 0x5224;
		mfm2[mfm2o + 53] = 0x5224;
		mfm2[mfm2o + 54] = 0x5224;
		for (i = 0; i < drv.num_secs; i++) {
			mfm2o = dstmfmbufo;
			SAEF_memset(secbuf,0, 0x00, 12);
			secbuf[12] = 0xa1;
			secbuf[13] = 0xa1;
			secbuf[14] = 0xa1;
			secbuf[15] = 0xfe;
			secbuf[16] = drv.cyl;
			secbuf[17] = side;
			secbuf[18] = 1 + i;
			secbuf[19] = 2; // 128 << 2 = 512
			crc16 = SAEF_crc16(secbuf,12, 3 + 1 + 4);
			secbuf[20] = crc16 >> 8;
			secbuf[21] = crc16 & 0xff;
			SAEF_memset(secbuf,22, 0x4e, 22);
			SAEF_memset(secbuf,44, 0x00, 12);
			secbuf[56] = 0xa1;
			secbuf[57] = 0xa1;
			secbuf[58] = 0xa1;
			secbuf[59] = 0xfb;
			read_floppy_data(drv.diskfile, drv.filetype, ti, i * 512, secbuf,60, 512);
			crc16 = SAEF_crc16(secbuf,56, 3 + 1 + 512);
			secbuf[60 + 512] = crc16 >> 8;
			secbuf[61 + 512] = crc16 & 0xff;
			len = Math.floor((tracklen / 2 - 96) / drv.num_secs) - 574 / drv.ddhd;
			if (len > 0) SAEF_memset(secbuf,512 + 62, 0x4e, len);
			dstmfmbufo = mfmcoder(secbuf, mfm2,mfm2o, 62 + 512 + 76 / drv.ddhd);
			mfm2[mfm2o + 12] = 0x4489;
			mfm2[mfm2o + 13] = 0x4489;
			mfm2[mfm2o + 14] = 0x4489;
			mfm2[mfm2o + 56] = 0x4489;
			mfm2[mfm2o + 57] = 0x4489;
			mfm2[mfm2o + 58] = 0x4489;
		}
		//while (dstmfmbuf - drv.bigmfmbuf < tracklen / 2) *dstmfmbuf++ = 0x9254;
		while (dstmfmbufo < tracklen / 2) drv.bigmfmbuf[dstmfmbufo++] = 0x9254;
		drv.skipoffset = 0;
		//drv.tracklen = (dstmfmbuf - drv.bigmfmbuf) * 16;
		drv.tracklen = dstmfmbufo * 16;
		if (disk_debug_logging > 0) SAEF_log("disk.decode_pcdos() read track %d, len %d bytes", tr, drv.tracklen / 8);
	}

	/*---------------------------------*/
	/* read diskspare
	*
	* 0 <4489> <4489> 0 track sector crchi, crclo, data[512] (520 bytes per sector)
	*
	* 0xAAAA 0x4489 0x4489 0x2AAA oddhi, oddlo, evenhi, evenlo, ...
	*
	* NOTE: data is MFM encoded using same method as ADOS header, not like ADOS data! */

	function decode_diskspare(drv) {
		var tr = drv.cyl * 2 + side;
		var dstmfmoffset = FLOPPY_GAP_LEN();
		//var dstmfmbuf = drv.bigmfmbuf; //u16 *
		var len = drv.num_secs * (512 + 8) + FLOPPY_GAP_LEN(); //12 * 520 + 350 = 6590
		var ti = drv.trackdata[tr];

		//memset(dstmfmbuf, 0xaa, len * 2);
		SAEF_memset(drv.bigmfmbuf,0, 0xaaaa, len);
		//dstmfmoffset += FLOPPY_GAP_LEN();
		drv.skipoffset = Math.floor((FLOPPY_GAP_LEN() * 8) / 3) * 2; //ATT
		drv.tracklen = len * 2 * 8;

		for (var sec = 0; sec < drv.num_secs; sec++) {
			var secbuf = new Uint8Array(512 + 8);
			var mfmbuf = new Uint16Array(512 + 8);
			var i, deven, dodd;

			secbuf[0] = tr;
			secbuf[1] = sec;
			secbuf[2] = 0;
			secbuf[3] = 0;

			read_floppy_data(drv.diskfile, drv.filetype, ti, sec * 512, secbuf,4, 512);

			mfmbuf[0] = 0xaaaa;
			mfmbuf[1] = 0x4489;
			mfmbuf[2] = 0x4489;
			mfmbuf[3] = 0x2aaa;

			for (i = 0; i < 512; i += 4) {
				deven = ((secbuf[i + 4] << 24) | (secbuf[i + 5] << 16) | (secbuf[i + 6] << 8) | (secbuf[i + 7])) >>> 0;
				dodd = deven >>> 1;
				deven &= 0x55555555;
				dodd &= 0x55555555;

				mfmbuf[i + 8 + 0] = dodd >>> 16;
				mfmbuf[i + 8 + 1] = dodd & 0xffff;
				mfmbuf[i + 8 + 2] = deven >>> 16;
				mfmbuf[i + 8 + 3] = deven & 0xffff;
			}
			mfmcode(mfmbuf,8, 512);

			i = 8;
			var chk = mfmbuf[i++] & 0x7fff;
			while (i < 512 + 8) chk ^= mfmbuf[i++];
			secbuf[2] = chk >> 8;
			secbuf[3] = chk;

			deven = ((secbuf[0] << 24) | (secbuf[1] << 16) | (secbuf[2] << 8) | (secbuf[3])) >>> 0;
			dodd = deven >>> 1;
			deven &= 0x55555555;
			dodd &= 0x55555555;

			mfmbuf[4] = dodd >>> 16;
			mfmbuf[5] = dodd & 0xffff;
			mfmbuf[6] = deven >>> 16;
			mfmbuf[7] = deven & 0xffff;
			mfmcode(mfmbuf,4, 4);

			for (i = 0; i < 512 + 8; i++) {
				drv.bigmfmbuf[dstmfmoffset % len] = mfmbuf[i];
				dstmfmoffset++;
			}
		}
		if (disk_debug_logging > 0) SAEF_log("disk.decode_diskspare() read track %d", tr);
	}

	/*---------------------------------*/

	function drive_fill_bigbuf(drv, force) {
		var tr = drv.cyl * 2 + side;
		var ti = drv.trackdata[tr];

		if (drv.diskfile === null || tr >= drv.num_tracks) {
			track_reset(drv);
			return;
		}
		if (!force && drv.buffered_cyl == drv.cyl && drv.buffered_side == side)
			return;

		drv.indexoffset = 0;
		drv.multi_revolution = 0;
		drv.tracktiming[0] = 0;
		drv.skipoffset = -1;
		drv.revolutions = 1;
		var retrytrack = drv.lastdataacesstrack == drv.cyl * 2 + side;
		if (!dskdmaen && !retrytrack)
			drv.track_access_done = false;

		if (drv.writediskfile && drv.writetrackdata[tr].bitlen > 0) {
			var wti = drv.writetrackdata[tr];
			drv.tracklen = wti.bitlen;
			drv.revolutions = wti.revolutions;
			/*read_floppy_data(drv.writediskfile, drv.filetype, wti, 0, (uae_u8 *)drv.bigmfmbuf, (wti.bitlen + 7) / 8);
			for (int i = 0; i < (drv.tracklen + 15) / 16; i++) {
				uae_u16 *mfm = drv.bigmfmbuf + i;
				uae_u8 *data = (uae_u8 *) mfm;
				*mfm = 256 * *data + *(data + 1);
			}*/
			var size = (wti.bitlen + 7) >>> 3;
			var tmp = new Uint8Array(size);
			read_floppy_data(drv.writediskfile, drv.filetype, wti, 0, tmp,0, size);
			size = (drv.tracklen + 15) >> 4;
			for (var i = 0, j = 0; i < size; i++, j += 2)
				drv.bigmfmbuf[i] = (tmp[j] << 8) | tmp[j + 1];

			if (disk_debug_logging > 0) SAEF_log("disk.drive_fill_bigbuf() track %d, length %d read from \"saveimage\"", tr, drv.tracklen);
		}
		else if (drv.filetype == ADF_SCP) {
			//scp_loadtrack(drv.bigmfmbuf, drv.tracktiming, drv - floppy, tr, &drv.tracklen, &drv.multi_revolution, &drv.skipoffset, &drv.lastrev, retrytrack);
			scp_loadtrack(drv.bigmfmbuf, drv.tracktiming, drv.num, tr, retrytrack);
		}
		/*else if (drv.filetype == ADF_FDI) {
			fdi2raw_loadtrack (drv.fdi, drv.bigmfmbuf, drv.tracktiming, tr, &drv.tracklen, &drv.indexoffset, &drv.multi_revolution, 1);
		}*/
		else if (ti.type == TRACK_PCDOS) {
			decode_pcdos(drv);
		}
		else if (ti.type == TRACK_AMIGADOS) {
			decode_amigados(drv);
		}
		else if (ti.type == TRACK_DISKSPARE) {
			decode_diskspare(drv);
		}
		else if (ti.type == TRACK_NONE) {
			;
		} else {
			var wti = drv.writetrackdata[tr];
			var base_offset = ti.type == TRACK_RAW ? 0 : 1;
			drv.tracklen = ti.bitlen + 16 * base_offset;
			drv.bigmfmbuf[0] = ti.sync;
			/*read_floppy_data(drv.diskfile, drv.filetype, ti, 0, (uae_u8*)(drv.bigmfmbuf + base_offset), (ti.bitlen + 7) / 8);
			for (int i = base_offset; i < (drv.tracklen + 15) / 16; i++) {
				uae_u16 *mfm = drv.bigmfmbuf + i;
				uae_u8 *data = (uae_u8 *) mfm;
				*mfm = 256 * *data + *(data + 1);
			}*/
			var size = (wti.bitlen + 7) >>> 3;
			var tmp = new Uint8Array(size);
			read_floppy_data(drv.diskfile, drv.filetype, ti, 0, tmp,0, size);
			size = (drv.tracklen + 15) >> 4;
			for (var i = base_offset, j = 0; i < size; i++, j += 2)
				drv.bigmfmbuf[i] = (tmp[j] << 8) | tmp[j + 1];

			if (disk_debug_logging > 2) SAEF_log("disk.drive_fill_bigbuf() rawtrack %d image offset $%x", tr, ti.offs);
		}
		drv.buffered_side = side;
		drv.buffered_cyl = drv.cyl;
		if (drv.tracklen == 0) {
			drv.tracklen = FLOPPY_WRITE_LEN() * 2 * drv.ddhd * 8;
			//memset(drv.bigmfmbuf, 0, FLOPPY_WRITE_LEN() * 2 * drv.ddhd);
			SAEF_memset(drv.bigmfmbuf,0, 0, FLOPPY_WRITE_LEN() * 2 * drv.ddhd >> 1);
		}
		drv.trackspeed = get_floppy_speed2(drv);
		updatemfmpos(drv);
	}

	/*-----------------------------------------------------------------------*/
	/* write */

	const MFMMASK = 0x55555555;
	function getmfmword(mbuf,mbufo, shift) {
		return ((mbuf[mbufo] << shift) | (mbuf[mbufo + 1] >> (16 - shift))) & 0xffff;
	}
	function getmfmlong(mbuf,mbufo, shift) {
		return (((getmfmword(mbuf,mbufo, shift) << 16) | getmfmword(mbuf,mbufo + 1, shift)) & MFMMASK) >>> 0;
	}

	/*---------------------------------*/
	/* write amigados */

	function check_valid_mfm(mbuf,mbufo, words, sector) {
		var prevbit = 0;
		for (var i = 0; i < words * 8; i++) {
			var wordoffset = i / 8 >>> 0;
			var w = mbuf[mbufo + wordoffset];
			var wp = mbuf[mbufo + wordoffset - 1];
			var bitoffset = (7 - (i & 7)) * 2;
			var clockbit = w & (1 << (bitoffset + 1));
			var databit = w & (1 << (bitoffset + 0));

			if ((clockbit && databit) || (clockbit && !databit && prevbit) || (!clockbit && !databit && !prevbit))
				SAEF_warn("disk.check_valid_mfm() illegal mfm sector %d data %04x %04x, bit %d:%d", sector, wp, w, wordoffset, bitoffset);

			prevbit = databit;
		}
	}
	function decode_buffer(mbuf, cyl, drvsec, ddhd, filetype, drvsecp, sectable, checkmode) {
		var i = 0, secwritten = 0;
		var fwlen = FLOPPY_WRITE_LEN() * ddhd;
		var odd = 0, even = 0, chksum = 0, id = 0, dlong = 0; //u32
		var secbuf = new Uint8Array(544);
		var secbufo = 0; //OWN
		var mbufo = 0; //OWN
		var mend = fwlen * 2 - (4 + 16 + 8 + 512);
		var sechead = new Uint32Array(4);
		var shift = 0;
		var issechead = false;

		//memset(sectable, 0, MAX_SECTORS * sizeof (int));
		SAEF_memset(sectable,0, 0, MAX_SECTORS);
		//memcpy(mbuf + fwlen, mbuf, fwlen * sizeof (uae_u16));
		SAEF_memcpy(mbuf,fwlen, mbuf,0, fwlen);
		//mbuf.copyWithin(fwlen, 0, fwlen);

		while (secwritten < drvsec) {
			while (getmfmword(mbuf,mbufo, shift) != 0x4489) {
				if (mbufo >= mend) {
					SAEF_log("disk.decode_buffer() sync not found (1)");
					return 1;
				}
				shift++;
				if (shift == 16) {
					shift = 0;
					mbufo++;
				}
			}
			while (getmfmword(mbuf,mbufo, shift) == 0x4489) {
				if (mbufo >= mend) {
					SAEF_log("disk.decode_buffer() sync not found (2)");
					return 1;
				}
				mbufo++;
			}

			odd = getmfmlong(mbuf,mbufo, shift);
			even = getmfmlong(mbuf,mbufo + 2, shift);
			mbufo += 4;
			id = ((odd << 1) | even) >>> 0;

			var trackoffs = (id & 0xff00) >> 8;
			if (trackoffs + 1 > drvsec) {
				SAEF_log("disk.decode_buffer() weird sector number %d (id $%08x, offset %d)", trackoffs, id, mbufo);
				if (filetype == ADF_EXT2) return 2;
				continue;
			}

			//check_valid_mfm(mbuf,mbufo - 4, 544 - 4 + 1, trackoffs);

			issechead = false;
			chksum = (odd ^ even) >>> 0;
			for (i = 0; i < 4; i++) {
				odd = getmfmlong(mbuf,mbufo, shift);
				even = getmfmlong(mbuf,mbufo + 8, shift);
				mbufo += 2;

				dlong = ((odd << 1) | even) >>> 0;
				if (dlong && !checkmode)
					issechead = true;

				sechead[i] = dlong;
				chksum = (chksum ^ ((odd ^ even) >>> 0)) >>> 0;
			}
			if (issechead) {
				SAEF_log("disk.decode_buffer() sector %d header: %08X %08X %08X %08X", trackoffs, sechead[0], sechead[1], sechead[2], sechead[3]);
				if (filetype == ADF_EXT2) return 6;
			}
			mbufo += 8;
			odd = getmfmlong(mbuf,mbufo, shift);
			even = getmfmlong(mbuf,mbufo + 2, shift);
			mbufo += 4;
			if ((((odd << 1) | even) >>> 0) != chksum) {
				SAEF_log("disk.decode_buffer() sector %d, header checksum error (%08X != %08X) ", trackoffs, ((odd << 1) | even) >>> 0, chksum);
				if (filetype == ADF_EXT2) return 3;
				continue;
			}
			if (((id & 0x00ff0000) >>> 16) != cyl * 2 + side) {
				SAEF_log("disk.decode_buffer() mismatched track (%d <> %d) on sector %d header (%08X)", (id & 0x00ff0000) >>> 16, cyl * 2 + side, trackoffs, id);
				if (filetype == ADF_EXT2) return 3;
				continue;
			}
			odd = getmfmlong(mbuf,mbufo, shift);
			even = getmfmlong(mbuf,mbufo + 2, shift);
			mbufo += 4;
			chksum = ((odd << 1) | even) >>> 0;
			secbufo = 32;
			for (i = 0; i < 128; i++) {
				odd = getmfmlong(mbuf,mbufo, shift);
				even = getmfmlong(mbuf,mbufo + 256, shift);
				mbufo += 2;
				dlong = ((odd << 1) | even) >>> 0;
				secbuf[secbufo++] = dlong >>> 24;
				secbuf[secbufo++] = (dlong >>> 16) & 0xff;
				secbuf[secbufo++] = (dlong >>> 8) & 0xff;
				secbuf[secbufo++] = dlong & 0xff;
				chksum = (chksum ^ ((odd ^ even) >>> 0)) >>> 0;
			}
			if (chksum) {
				SAEF_log("disk.decode_buffer() sector %d, data checksum error", trackoffs);
				if (filetype == ADF_EXT2) return 4;
				continue;
			}
			mbufo += 256;
			//SAEF_log("disk.decode_buffer() sector %d ok", trackoffs);
			sectable[trackoffs] = 1;
			secwritten++;
			writebuffer.set(secbuf.subarray(32, 32 + 512), trackoffs * 512); //memcpy(writebuffer + trackoffs * 512, secbuf + 32, 512);
		}
		if (filetype == ADF_EXT2 && (secwritten == 0 || secwritten < 0))
			return 5;
		if (secwritten == 0)
			SAEF_log("disk.decode_buffer() unsupported format");
		else if (secwritten < 0)
			SAEF_log("disk.decode_buffer() sector labels ignored");

		drvsecp.value = drvsec;
		return 0;
	}

	/* Update EXT2 track header */
	function diskfile_update(diskfile, ti, len, type) {
		var buf = new Uint8Array(2 + 2 + 4 + 4);

		ti.revolutions = 1;
		ti.bitlen = len;
		ti.type = type;

		buf[0] = 0;
		buf[1] = 0;
		buf[2] = 0;
		buf[3] = ti.type;
		//do_put_mem_long((uae_u32 *)(buf + 4), ti.len);
		buf[4] = ti.len >>> 24;
		buf[5] = (ti.len >>> 16) & 0xff;
		buf[6] = (ti.len >>> 8) & 0xff;
		buf[7] = ti.len & 0xff;
		//do_put_mem_long((uae_u32 *)(buf + 8), ti.bitlen);
		buf[8] = ti.bitlen >>> 24;
		buf[9] = (ti.bitlen >>> 16) & 0xff;
		buf[10] = (ti.bitlen >>> 8) & 0xff;
		buf[11] = ti.bitlen & 0xff;

		SAEF_ZFile_fseek(diskfile, 8 + 4 + (2 + 2 + 4 + 4) * ti.track, SEEK_SET);
		SAEF_ZFile_fwrite(buf,0, buf.length, 1, diskfile);
		if (ti.len > Math.floor((len + 7) / 8)) {
			var zerobuf = new Uint8Array(ti.len);
			//memset(zerobuf, 0, ti.len);
			SAEF_memset(zerobuf,0, 0, ti.len);
			SAEF_ZFile_fseek(diskfile, ti.offs, SEEK_SET);
			SAEF_ZFile_fwrite(zerobuf,0, 1, ti.len, diskfile);
		}
		if (disk_debug_logging > 0) SAEF_log("disk.diskfile_update() track %d, raw track length %d written (total size %d)", ti.track, Math.floor((ti.bitlen + 7) / 8), ti.len);
	}

	function drive_write_adf_amigados(drv) {
		var drvsec = { value:0 };
		var sectable = new Uint8Array(MAX_SECTORS);

		if (decode_buffer(drv.bigmfmbuf, drv.cyl, drv.num_secs, drv.ddhd, drv.filetype, drvsec, sectable, false))
			return 2;
		if (!drvsec.value)
			return 2;

		if (drv.filetype == ADF_EXT2)
			diskfile_update(drv.diskfile, drv.trackdata[drv.cyl * 2 + side], drvsec.value * 512 * 8, TRACK_AMIGADOS);

		for (var i = 0; i < drvsec.value; i++) {
			SAEF_ZFile_fseek(drv.diskfile, drv.trackdata[drv.cyl * 2 + side].offs + i * 512, SEEK_SET);
			SAEF_ZFile_fwrite(writebuffer,i * 512, 1, 512, drv.diskfile);
		}
		return 0;
	}

	/*---------------------------------*/
	/* write EXT2 */

	/* UAE-1ADF (ADF_EXT2)
	* W reserved
	* W number of tracks (default 2*80=160)
	*
	* W reserved
	* W type, 0=normal AmigaDOS track, 1 = raw MFM (upper byte = disk revolutions - 1)
	* L available space for track in bytes (must be even)
	* L track length in bits
	*/

	/* write raw track to disk file */
	function drive_write_ext2(bigmfmbuf, diskfile, ti, tracklen) {
		var len = Math.floor((tracklen + 7) / 8);
		if (len > ti.len) {
			SAEF_warn("disk.drive_write_ext2() image file's track %d is too small (%d < %d)", ti.track, ti.len, len);
			len = ti.len;
		}
		diskfile_update(diskfile, ti, tracklen, TRACK_RAW);
		/*for (var i = 0; i < ti.len / 2; i++) {
			uae_u16 *mfm = bigmfmbuf + i;
			uae_u16 *mfmw = bigmfmbufw + i;
			uae_u8 *data = (uae_u8 *) mfm;
			*mfmw = 256 * *data + *(data + 1);
		}*/
		for (var i = 0; i < ti.len >> 1; i++)
			bigmfmbufw[i] = bigmfmbuf[i]; //ATT

		SAEF_ZFile_fseek(diskfile, ti.offs, SEEK_SET);
		SAEF_ZFile_fwrite(bigmfmbufw,0, 1, len, diskfile);
		return 1;
	}

	/*---------------------------------*/
	/* write pcdos */

	function mfmdecode(mfmp,mfmo, shift) {
		var mfm = getmfmword(mfmp,mfmo, shift);
		var out = 0;

		mfm &= 0x5555; //ATT
		for (var i = 0; i < 8; i++) {
			out >>= 1;
			if (mfm & 1)
				out |= 0x80;
			mfm >>= 2;
		}
		return out;
	}
	function drive_write_pcdos(drv, zf, count) {
		var drvsec = drv.num_secs;
		var fwlen = FLOPPY_WRITE_LEN() * drv.ddhd;
		var mbuf = drv.bigmfmbuf;
		var mbufo = 0; //OWN
		var mend = fwlen * 2 - 518;
		var secwritten = 0, seccnt = 0;
		var shift = 0, sector = -1;
		var sectable = new Uint8Array(24);
		var secbuf = new Uint8Array(3 + 1 + 512);
		var mark = 0; //u8
		var crc = 0; //u16
		var i = 0;

		//memset(sectable, 0, sizeof sectable);
		SAEF_memset(sectable,0, 0, 24);
		//memcpy(mbuf + fwlen, mbuf, fwlen * sizeof (uae_u16));
		SAEF_memcpy(mbuf,fwlen, mbuf,0, fwlen);
		//mbuf.copyWithin(fwlen, 0, fwlen);
		secbuf[0] = secbuf[1] = secbuf[2] = 0xa1;
		secbuf[3] = 0xfb;

		while (seccnt < drvsec) {
			var mfmcount = 0;
			while (getmfmword(mbuf,mbufo, shift) != 0x4489) {
				mfmcount++;
				if (mbufo >= mend)
					return -1;
				shift++;
				if (shift == 16) {
					shift = 0;
					mbufo++;
				}
				if (sector >= 0 && mfmcount / 16 >= 43)
					sector = -1;
			}

			mfmcount = 0;
			while (getmfmword(mbuf,mbufo, shift) == 0x4489) {
				mfmcount++;
				if (mbufo >= mend)
					return -1;
				mbufo++;
			}
			if (mfmcount < 3) // ignore if less than 3 sync markers
				continue;

			mark = mfmdecode(mbuf,mbufo++, shift);
			if (mark == 0xfe) {
				var tmp = new Uint8Array(8);
				var cyl, head, size; //u8

				cyl = mfmdecode(mbuf,mbufo++, shift);
				head = mfmdecode(mbuf,mbufo++, shift);
				sector = mfmdecode(mbuf,mbufo++, shift);
				size = mfmdecode(mbuf,mbufo++, shift);
				crc = (mfmdecode(mbuf,mbufo++, shift) << 8) | mfmdecode(mbuf,mbufo++, shift);

				tmp[0] = tmp[1] = tmp[2] = 0xa1; tmp[3] = mark;
				tmp[4] = cyl; tmp[5] = head; tmp[6] = sector; tmp[7] = size;

				// skip 28 bytes
				for (i = 0; i < 28; i++)
					mfmdecode(mbuf,mbufo++, shift);

				if (SAEF_crc16(tmp,0, 8) != crc || cyl != drv.cyl || head != side || size != 2 || sector < 1 || sector > drv.num_secs || sector >= sectable.length) {
					SAEF_warn("disk.drive_write_pcdos() track %d, corrupted sector header", drv.cyl * 2 + side);
					return -1;
				}
				sector--;
				continue;
			}
			if (mark != 0xfb && mark != 0xfa) {
				SAEF_warn("disk.drive_write_pcdos() track %d: unknown address mark %02X", drv.cyl * 2 + side, mark);
				continue;
			}
			if (sector < 0)
				continue;
			for (i = 0; i < 512; i++)
				secbuf[i + 4] = mfmdecode(mbuf,mbufo++, shift);

			crc = (mfmdecode(mbuf,mbufo++, shift) << 8) | mfmdecode(mbuf,mbufo++, shift);
			if (SAEF_crc16(secbuf,0, 3 + 1 + 512) != crc) {
				SAEF_warn("disk.drive_write_pcdos() track %d, sector %d data checksum error", drv.cyl * 2 + side, sector + 1);
				continue;
			}
			seccnt++;
			if (count && sectable[sector])
				break;
			if (!sectable[sector]) {
				secwritten++;
				sectable[sector] = 1;
				SAEF_ZFile_fseek(zf, drv.trackdata[drv.cyl * 2 + side].offs + sector * 512, SEEK_SET);
				SAEF_ZFile_fwrite(secbuf,4, 1, 512, zf);
				//SAEF_log("disk.drive_write_pcdos() track %d sector %d written", drv.cyl * 2 + side, sector + 1);
			}
			sector = -1;
		}
		if (!count && secwritten != drv.num_secs)
			SAEF_warn("disk.drive_write_pcdos() track %d, %d corrupted sectors ignored", drv.cyl * 2 + side, drv.num_secs - secwritten);

		return secwritten;
	}

	/*---------------------------------*/

	function drive_write_data(drv) {
		var ret = -1;
		var tr = drv.cyl * 2 + side;

		if (drive_writeprotected(drv) || drv.trackdata[tr].type == TRACK_NONE) {
			/* read original track back because we didn't really write anything */
			drv.buffered_side = 2;
			return;
		}
		if (drv.writediskfile)
			drive_write_ext2(drv.bigmfmbuf, drv.writediskfile, drv.writetrackdata[tr], longwritemode ? dsklength2 * 8 : drv.tracklen);

		switch (drv.filetype) {
			case ADF_NORMAL: {
				if (drive_write_adf_amigados(drv)) {
					if (SAEV_config.floppy.autoEXT2)
						convert_adf_to_ext2(drv, SAEV_config.floppy.autoEXT2);
					else {
						if (!warned_ext2) {
							warned_ext2 = true;
							//notify_user(NUMSG_NEEDEXT2);
							alert("Disk in DF"+drv.num+" does use a non-standard floppy disk format.\n"+
								"You may need to use a custom floppy disk image file instead of a standard one\n"+
								"or enable 'Auto convert to EXT2' in the floppy-page.\n\n"+
								"This message will not appear again."
							);
						}
					}
				}
				return;
			}
			case ADF_EXT1:
				break;
			case ADF_EXT2: {
				if (!longwritemode)
					ret = drive_write_adf_amigados(drv);
				if (ret) {
					SAEF_warn("disk.drive_write_data() not an amigados track %d (error %d), writing as raw track", drv.cyl * 2 + side, ret);
					drive_write_ext2(drv.bigmfmbuf, drv.diskfile, drv.trackdata[drv.cyl * 2 + side], longwritemode ? dsklength2 * 8 : drv.tracklen);
				}
				return;
			}
			case ADF_SCP:
				break;
			case ADF_PCDOS: {
				ret = drive_write_pcdos(drv, drv.diskfile, 0);
				if (ret < 0) SAEF_log("disk.drive_write_data() not a PC formatted track %d (error %d)", drv.cyl * 2 + side, ret);
				break;
			}
		}
		drv.tracktiming[0] = 0;
	}

	/*-----------------------------------------------------------------------*/
	/* SECT disk */
	/*-----------------------------------------------------------------------*/

	function setdskchangetime(drv, dsktime) {
		/* prevent multiple disk insertions at the same time */
		if (drv.dskchange_time > 0)
			return;
		for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) {
			if (floppy[i].num != drv.num && floppy[i].dskchange_time > 0 && floppy[i].dskchange_time + 1 >= dsktime)
				dsktime = floppy[i].dskchange_time + 1;
		}
		drv.dskchange_time = dsktime;
		if (disk_debug_logging > 0) SAEF_log("disk.setdskchangetime() delayed insert enable %d", dsktime);
	}

	/*function DISK_reinsert(num) {
		drive_eject(floppy[num]);
		setdskchangetime(floppy[num], 2 * 50 * 312);
	}*/

	/*-----------------------------------------------------------------------*/

	//function disk_insert_2(num, name, forced, forcedwriteprotect) {
	function disk_insert_2(num, file, forced) {
		var drv = floppy[num];

		if (forced) {
			//drive_insert(drv, SAEV_config, num, name, data, false, forcedwriteprotect);
			drive_insert(drv, SAEV_config, num, file, false);
			return;
		}
		/*if (SAEV_config.floppy.drive[num].name === name) {
			SAEF_warn("disk_insert_2() already inserted");
			return;
		}
		SAEV_config.floppy.drive[num].name = name;
		SAEV_config.floppy.drive[num].forcedWriteProtect = forcedwriteprotect;*/

		drv.dskeject = false;
		//drv.newname = name;
		//drv.newnamewriteprotected = forcedwriteprotect;
		drv.newfile = SAEF_CloneObject(file); //ATT

		if (file.size == 0)
			SAER.disk.eject(num);
		else if (!drive_empty(drv) || drv.dskchange_time > 0)
			//delay eject so that it is always called when emulation is active
			drv.dskeject = true;
		else
			setdskchangetime(drv, 1 * 312);
	}
	//this.insert = function(num, name, forcedwriteprotect) { //disk_insert()
	this.insert = function(num, file) { //disk_insert()
		//set_config_changed();
		//target_addtorecent(name, 0);
		disk_insert_2(num, file, false);
	}
	this.insert_force = function(num, file) { //disk_insert_force()
		disk_insert_2(num, file, true);
	}

	this.eject = function(num) { //disk_eject()
		//set_config_changed();
		//SAER.gui.filename(num, "");
		drive_eject(floppy[num]);
		SAEV_config.floppy.drive[num].file.clr();
		//floppy[num].newname = "";
		floppy[num].newfile = null;
		driveNames[num] = ""; //OWN
		update_drive_gui(num, true);
	}

	/*-----------------------------------------------------------------------*/

	function disk_check_change() {
		/*if (SAEV_config.floppy.speed != changed_prefs.floppy_speed)
			SAEV_config.floppy.speed = changed_prefs.floppy_speed;
		if (SAEV_config.floppy.readOnly != changed_prefs.floppy_read_only)
			SAEV_config.floppy.readOnly = changed_prefs.floppy_read_only;*/
		for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) {
			var drv = floppy[i];
			if (drv.dskeject) {
				drive_eject(drv);
				/* set dskchange_time, disk_insert() will be
				* called from disk_check_change() after 2 second delay
				* this makes sure that all programs detect disk change correctly */
				setdskchangetime(drv, 2 * 50 * 312);
			}
			/*if (SAEV_config.floppy.drive[i].type != changed_prefs.floppyslots[i].type) {
				SAEV_config.floppy.drive[i].type = changed_prefs.floppyslots[i].type;
				reset_drive(i);
				#ifdef RETROPLATFORM
				rp_floppy_device_enable (i, SAEV_config.floppy.drive[i].type >= SAEC_Config_Floppy_Type_35_DD);
				#endif
			}*/
		}
	}

	this.vsync = function() { //DISK_vsync()
		disk_check_change();

		for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) {
			if (SAEV_config.floppy.drive[i].type > SAEC_Config_Floppy_Type_None) { //OWN
				var drv = floppy[i];
				var file = SAEV_config.floppy.drive[i].file;
				if (drv.dskchange_time == 0 && file.name !== driveNames[i]) {
					//SAEF_log("disk.vsync() dskchange unit %d ('%s')", i, file.name);
					this.insert_force(i, file);
					driveNames[i] = file.name;
				}
			}
		}
	}

	/*-----------------------------------------------------------------------*/

	/*this.disk_empty = function(num) {
		return drive_empty(floppy[num]);
	}*/

	/*static TCHAR *tobin (uae_u8 v) {
		static TCHAR buf[9];
		for (int i = 7; i >= 0; i--)
			buf[7 - i] = v & (1 << i) ? '1' : '0';
		return buf;
	}*/

	function fetch_DISK_select(data) {
		if (SAEV_config.chipset.compatible == SAEC_Config_Chipset_Compatible_A1000V)
			selected = (data >> 3) & 3;
		else
			selected = (data >> 3) & 15;

		side = 1 - ((data >> 2) & 1);
		direction = (data >> 1) & 1;
	}

	this.select_set = function(data) { //DISK_select_set()
		prev_data = data;
		prev_step = data & 1;

		fetch_DISK_select(data);
	}

	this.select = function(data) { //DISK_select()
		var velvet = SAEV_config.chipset.compatible == SAEC_Config_Chipset_Compatible_A1000V;
		var dr;

		var prev_selected = selected;

		fetch_DISK_select(data);
		var step_pulse = data & 1;

		/*if (disk_debug_logging > 2) {
			if (velvet)
				write_log (_T("%08X %02X.%02X %s drvmask=%x"), SAER_CPU_getPC(), prev_data, data, tobin(data), selected ^ 3);
			else
				write_log (_T("%08X %02X.%02X %s drvmask=%x"), SAER_CPU_getPC(), prev_data, data, tobin(data), selected ^ 15);
		}*/

		if (amax_enabled) {
			for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
				var drv = floppy[dr];
				if (drv.amax)
					amax_disk_select(data, prev_data, dr);
			}
		}

		if (!velvet) {
			if ((prev_data & 0x80) != (data & 0x80)) {
				for (dr = 0; dr < 4; dr++) {
					if (floppy[dr].indexhackmode > 1 && !((selected | disabled) & (1 << dr))) {
						floppy[dr].indexhack = true;
						//if (disk_debug_logging > 2) SAEF_log("indexhack! ");
					}
				}
			}
		}

		/*if (disk_debug_logging > 2) {
			if (velvet) {
				write_log (_T(" %d%d "), (selected & 1) ? 0 : 1, (selected & 2) ? 0 : 1);
				if ((prev_data & 0x08) != (data & 0x08)) write_log (_T(" dsksel0 %d "), (data & 0x08) ? 0 : 1);
				if ((prev_data & 0x10) != (data & 0x10)) write_log (_T(" dsksel1 %d "), (data & 0x10) ? 0 : 1);
				if ((prev_data & 0x20) != (data & 0x20)) write_log (_T(" dskmotor0 %d "), (data & 0x20) ? 0 : 1);
				if ((prev_data & 0x40) != (data & 0x40)) write_log (_T(" dskmotor1 %d "), (data & 0x40) ? 0 : 1);
				if ((prev_data & 0x02) != (data & 0x02)) write_log (_T(" direct %d "), (data & 0x02) ? 1 : 0);
				if ((prev_data & 0x04) != (data & 0x04)) write_log (_T(" side %d "), (data & 0x04) ? 1 : 0);
			} else {
				write_log (_T(" %d%d%d%d "), (selected & 1) ? 0 : 1, (selected & 2) ? 0 : 1, (selected & 4) ? 0 : 1, (selected & 8) ? 0 : 1);
				if ((prev_data & 0x80) != (data & 0x80)) write_log (_T(" dskmotor %d "), (data & 0x80) ? 1 : 0);
				if ((prev_data & 0x02) != (data & 0x02)) write_log (_T(" direct %d "), (data & 0x02) ? 1 : 0);
				if ((prev_data & 0x04) != (data & 0x04)) write_log (_T(" side %d "), (data & 0x04) ? 1 : 0);
			}
		}*/

		// step goes high and drive was selected when step pulse changes: step
		if (prev_step != step_pulse) {
			//if (disk_debug_logging > 2) SAEF_log("step %d ", step_pulse);
			prev_step = step_pulse;
			if (prev_step) { // && !savestate_state) {
				for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
					if (!((prev_selected | disabled) & (1 << dr))) {
						drive_step(floppy[dr], direction);
						if (floppy[dr].indexhackmode > 1 && (data & 0x80))
							floppy[dr].indexhack = true;
					}
				}
			}
		}

		//if (!savestate_state)
		{
			if (velvet) {
				for (dr = 0; dr < 2; dr++) {
					var drv = floppy[dr];
					var motormask = 0x20 << dr;
					var selectmask = 0x08 << dr;
					if (!(selected & (1 << dr)) && !(disabled & (1 << dr))) {
						if (!(prev_data & motormask) && (data & motormask)) {
							drive_motor(drv, 1);
						} else if ((prev_data & motormask) && !(data & motormask)) {
							drive_motor(drv, 0);
						}
					}
				}
			} else {
				for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
					var drv = floppy[dr];
					/* motor on/off workings tested with small assembler code on real Amiga 1200. */
					/* motor/id flipflop is set only when drive select goes from high to low */
					if (!((selected | disabled) & (1 << dr)) && (prev_selected & (1 << dr)) ) {
						drv.drive_id_scnt++;
						drv.drive_id_scnt &= 31;
						drv.idbit = (drv.drive_id & (1 << (31 - drv.drive_id_scnt))) ? 1 : 0;
						if (!(disabled & (1 << dr))) {
							if ((prev_data & 0x80) == 0 || (data & 0x80) == 0) {
								/* motor off: if motor bit = 0 in prevdata or data . turn motor on */
								drive_motor(drv, 0);
							} else if (prev_data & 0x80) {
								/* motor on: if motor bit = 1 in prevdata only (motor flag state in data has no effect). turn motor off */
								drive_motor(drv, 1);
							}
						}
						if (!SAEV_config.chipset.df0idhw && dr == 0)
							drv.idbit = 0;

						if (DEBUG_DRIVE_ID) SAEF_log("disk.select() sel %d id %s ($%08X) [$%08x, bit #%02d: %d]", dr, drive_id_name(drv), drv.drive_id, drv.drive_id << drv.drive_id_scnt >>> 0, 31 - drv.drive_id_scnt, drv.idbit);
					}
				}
			}
		}

		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			floppy[dr].state = (!(selected & (1 << dr))) | !floppy[dr].motoroff;
			update_drive_gui(dr, false);
		}
		prev_data = data;
		//if (disk_debug_logging > 2) SAEF_log("\n");
	}

	/*-----------------------------------------------------------------------*/

	this.status_ciaa = function() { //DISK_status_ciaa()
		var st = 0x3c;

		if (SAEV_config.chipset.compatible == SAEC_Config_Chipset_Compatible_A1000V) {
			for (var dr = 0; dr < 2; dr++) {
				var drv = floppy[dr];
				if (!(((selected >> 3) | disabled) & (1 << dr))) {
					if (drv.dskchange)
						st &= ~0x20;
					if (drive_track0(drv))
						st &= ~0x10;
				}
			}
			if (disk_debug_logging > 2) SAEF_log("disk.status_ciaa() pc $%08x, status $%02x", SAER_CPU_getPC(), st);
			return st;
		}

		for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			var drv = floppy[dr];
			if (drv.amax) {
				if (amax_active())
					st = amax_disk_status(st);
			} else if (!((selected | disabled) & (1 << dr))) {
				if (drive_running(drv)) {
					if (drv.dskready && !drv.indexhack && SAEV_config.floppy.drive[dr].type != SAEC_Config_Floppy_Type_35_DD_ESCOM)
						st &= ~0x20;
				} else {
					if (SAEV_config.chipset.df0idhw || dr > 0) {
						/* report drive ID */
						if (drv.idbit && SAEV_config.floppy.drive[dr].type != SAEC_Config_Floppy_Type_35_DD_ESCOM)
							st &= ~0x20;
					} else {
						/* non-ID internal drive: mirror real dskready */
						if (drv.dskready)
							st &= ~0x20;
					}
					/* dskrdy needs some cycles after switching the motor off.. (Pro Tennis Tour) */
					if (!SAEV_config.chipset.df0idhw && dr == 0 && drv.motordelay)
						st &= ~0x20;
				}
				if (drive_track0(drv))
					st &= ~0x10;
				if (drive_writeprotected(drv))
					st &= ~8;
				if (drv.dskchange && SAEV_config.floppy.drive[dr].type != SAEC_Config_Floppy_Type_525_SD)
					st &= ~4;
			} else if (!((selected | disabled) & (1 << dr))) {
				if (drv.idbit)
					st &= ~0x20;
			}
		}
		return st;
	}

	this.status_ciab = function(st) { //DISK_status_ciab()
		if (SAEV_config.chipset.compatible == SAEC_Config_Chipset_Compatible_A1000V) {
			st |= 0x80;
			for (var dr = 0; dr < 2; dr++) {
				var drv = floppy[dr];
				if (!(((selected >> 3) | disabled) & (1 << dr))) {
					if (drive_writeprotected(drv))
						st &= ~0x80;
				}
			}
			if (disk_debug_logging > 2) SAEF_log("disk.status_ciab() pc $%08x, status $%02x", SAER_CPU_getPC(), st);
		}
		return st;
	}

	/*-----------------------------------------------------------------------*/

	function unformatted(drv) {
		var tr = drv.cyl * 2 + side;
		if (tr >= drv.num_tracks)
			return true;
		if (drv.filetype == ADF_EXT2 && drv.trackdata[tr].bitlen == 0 && drv.trackdata[tr].type != TRACK_AMIGADOS)
			return true;
		if (drv.trackdata[tr].type == TRACK_NONE)
			return true;
		return false;
	}

	/* get one bit from MFM bit stream */
	/*STATIC_INLINE uae_u32 getonebit (uae_u16 * mfmbuf, int mfmpos) {
		uae_u16 *buf = &mfmbuf[mfmpos >> 4];
		return (buf[0] & (1 << (15 - (mfmpos & 15)))) ? 1 : 0;
	}*/
	function getonebit(mfmbuf, mfmpos) {
		return (mfmbuf[mfmpos >> 4] & (1 << (15 - (mfmpos & 15)))) ? 1 : 0;
	}

	function dumpdisk(name) {
		/*var i, j, k, w;

		for (i = 0; i < MAX_FLOPPY_DRIVES; i++) {
			drive *drv = &floppy[i];
			if (!(disabled & (1 << i))) {
				console_out_f (_T("%s: drive %d motor %s cylinder %2d sel %s %s mfmpos %d/%d\n"),
					name, i, drv->motoroff ? _T("off") : _T(" on"), drv->cyl, (selected & (1 << i)) ? _T("no") : _T("yes"),
					drive_writeprotected(drv) ? _T("ro") : _T("rw"), drv->mfmpos, drv->tracklen);
				if (drv->motoroff == 0) {
					w = 0;
					for (j = -4; j < 13; j++) {
						for (k = 0; k < 16; k++) {
							int pos = drv->mfmpos + j * 16 + k;
							if (pos < 0)
								pos += drv->tracklen;
							w <<= 1;
							w |= getonebit(drv->bigmfmbuf, pos);
						}
						console_out_f(_T("%04X%c"), w, j == -1 ? '|' : ' ');
					}
					console_out (_T("\n"));
				}
			}
		}
		console_out_f (_T("side %d dma %d off %d word %04X pt %08X len %04X bytr %04X adk %04X sync %04X\n"),
			side, dskdmaen, bitoffset, word, dskpt, dsklen, dskbytr_val, SAEV_Custom_adkcon, dsksync);*/
		SAEF_log("disk.dumpdisk() %s", name);
	}

	function disk_dmafinished() {
		SAER.custom.INTREQ(SAEC_Custom_INTF_SETCLR | SAEC_Custom_INTF_DSKBLK);
		longwritemode = 0;
		dskdmaen = DSKDMA_OFF;
		dsklength = 0;
		dsklen = 0;
		/*if (disk_debug_logging > 0) {
			write_log (_T("disk dma finished %08X MFMpos="), dskpt);
			for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++)
				write_log (_T("%d%s"), floppy[dr].mfmpos, dr < MAX_FLOPPY_DRIVES - 1 ? _T(",") : _T(""));
			write_log (_T("\n"));
		}*/
	}

	function fetchnextrevolution(drv) {
		if (drv.revolution_check)
			return;
		drv.trackspeed = get_floppy_speed2(drv);
		if (REVOLUTION_DEBUG && (1 || drv.mfmpos != 0)) SAEF_log("disk.fetchnextrevolution() DMA=%d %d %d/%d %d %d %d", dskdmaen, drv.trackspeed, drv.mfmpos, drv.tracklen, drv.indexoffset, drv.floppybitcounter);
		drv.revolution_check = 2;
		if (!drv.multi_revolution)
			return;
		switch (drv.filetype) {
			case ADF_SCP:
				scp_loadrevolution(drv.bigmfmbuf, drv.num, drv.tracktiming); //, &drv.tracklen);
				break;
			/*case ADF_FDI:
				fdi2raw_loadrevolution(drv.fdi, drv.bigmfmbuf, drv.tracktiming, drv.cyl * 2 + side, &drv.tracklen, 1);
				break;*/
		}
	}

	function do_disk_index() {
		if (REVOLUTION_DEBUG) SAEF_log("disk.do_disk_index() %d", indexdecay);
		if (!indexdecay) {
			indexdecay = 2;
			SAER.cia.diskindex();
		}
	}

	this.handler = function(data) { //DISK_handler()
		var flag = data & 255;
		var disk_sync_cycle = data >>> 8;
		var hpos = SAER.events.current_hpos();

		SAER.events.event2_remevent(SAEC_Events_EV2_DISK);
		this.update(disk_sync_cycle);
		if (!dskdmaen) {
			if (flag & (DISK_REVOLUTION << 0)) fetchnextrevolution(floppy[0]);
			if (flag & (DISK_REVOLUTION << 1)) fetchnextrevolution(floppy[1]);
			if (flag & (DISK_REVOLUTION << 2)) fetchnextrevolution(floppy[2]);
			if (flag & (DISK_REVOLUTION << 3)) fetchnextrevolution(floppy[3]);
		}
		if (flag & DISK_WORDSYNC)
			SAER.custom.INTREQ(SAEC_Custom_INTF_SETCLR | SAEC_Custom_INTF_DSKSYN);
		if (flag & DISK_INDEXSYNC)
			do_disk_index();
	}

	function disk_doupdate_write(drv, floppybits) {
		var dr, drives = [0,0,0,0];

		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			var drv2 = floppy[dr];
			drives[dr] = 0;
			if (drv2.motoroff)
				continue;
			if ((selected | disabled) & (1 << dr))
				continue;
			drives[dr] = 1;
		}

		while (floppybits >= drv.trackspeed) {
			for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
				if (drives[dr]) {
					floppy[dr].mfmpos++;
					floppy[dr].mfmpos %= drv.tracklen;
				}
			}
			if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_DSKEN) && dskdmaen == DSKDMA_WRITE && dsklength > 0 && fifo_filled) {
				bitoffset++;
				bitoffset &= 15;
				if (!bitoffset) {
					// fast disk modes, fill the fifo instantly
					if (SAEV_config.floppy.speed > 100 && !fifo_inuse[0] && !fifo_inuse[1] && !fifo_inuse[2]) {
						while (!fifo_inuse[2]) {
							var w = SAER_Memory_chipGet16_indirect(dskpt);
							SAER.disk.DSKDAT(w);
							dskpt += 2;
						}
					}
					if (SAER.disk.fifostatus() >= 0) {
						var w = SAER.disk.DSKDATR();
						for (dr = 0; dr < MAX_FLOPPY_DRIVES ; dr++) {
							var drv2 = floppy[dr];
							if (drives[dr]) {
								drv2.bigmfmbuf[drv2.mfmpos >> 4] = w;
								drv2.bigmfmbuf[(drv2.mfmpos >> 4) + 1] = 0x5555;
								drv2.writtento = 1;
							}
							if (amax_enabled)
								amax_diskwrite(w);
						}
						dsklength--;
						if (dsklength <= 0) {
							disk_dmafinished();
							for (dr = 0; dr < MAX_FLOPPY_DRIVES ; dr++) {
								var drv = floppy[dr];
								drv.writtento = 0;
								if (drv.motoroff)
									continue;
								if ((selected | disabled) & (1 << dr))
									continue;
								drive_write_data(drv);
							}
						}
					}
				}
			}
			floppybits -= drv.trackspeed;
		}
	}

	function update_jitter() {
		if (SAEV_config.floppy.randomBitsMax > 0)
			disk_jitter = ((Math.decimalRandom() >>> 4) % (SAEV_config.floppy.randomBitsMax - SAEV_config.floppy.randomBitsMin + 1)) + SAEV_config.floppy.randomBitsMin;
		else
			disk_jitter = 0;
	}

	function updatetrackspeed(drv, mfmpos) {
		if (dskdmaen < DSKDMA_WRITE) {
			var t = drv.tracktiming[mfmpos >> 3]; //ORG mfmpos / 8
			var ts = Math.floor(get_floppy_speed2(drv) * t / 1000);
			if (ts < 700 || ts > 3000) {
				if (++warned_trackspeed < 50)
					SAEF_warn("disk.updatetrackspeed() corrupted trackspeed value %d %d (%d/%d)", t, ts, mfmpos, drv.tracklen);
			} else
				drv.trackspeed = ts;
		}
	}

	function disk_doupdate_predict(startcycle) {
		var finaleventcycle = SAER.playfield.get_maxhpos() << 8;
		var finaleventflag = 0;
		var noselected = true;

		for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			var drv = floppy[dr];
			if (drv.motoroff)
				continue;
			if (!drv.trackspeed)
				continue;
			if ((selected | disabled) & (1 << dr))
				continue;
			var mfmpos = drv.mfmpos;
			if (drv.tracktiming[0])
				updatetrackspeed(drv, mfmpos);
			var diskevent_flag = 0;
			var tword = word; //u32
			noselected = false;
			//int diff = drv.floppybitcounter % drv.trackspeed; ORG
			var countcycle = startcycle; // + (diff ? drv.trackspeed - diff : 0); ORG
			while (countcycle < (SAER.playfield.get_maxhpos() << 8)) {
				if (drv.tracktiming[0])
					updatetrackspeed(drv, mfmpos);
				countcycle += drv.trackspeed;
				if (dskdmaen != DSKDMA_WRITE || (dskdmaen == DSKDMA_WRITE && !dma_enable)) {
					tword = (tword << 1) >>> 0;
					if (!drive_empty(drv)) {
						if (unformatted(drv))
							tword = (tword | ((Math.decimalRandom() & 0x1000) ? 1 : 0)) >>> 0;
						else
							tword = (tword | getonebit(drv.bigmfmbuf, mfmpos)) >>> 0;
					}
					if (dskdmaen != DSKDMA_READ && (tword & 0xffff) == dsksync && dsksync != 0)
						diskevent_flag |= DISK_WORDSYNC;
				}
				mfmpos++;
				mfmpos %= drv.tracklen;
				if (!dskdmaen) {
					if (mfmpos == 0)
						diskevent_flag |= DISK_REVOLUTION << drv.num;
					if (mfmpos == drv.indexoffset)
						diskevent_flag |= DISK_INDEXSYNC;
				}
				if (dskdmaen != DSKDMA_WRITE && mfmpos == drv.skipoffset) {
					update_jitter();
					var skipcnt = disk_jitter;
					while (skipcnt-- > 0) {
						mfmpos++;
						mfmpos %= drv.tracklen;
						if (!dskdmaen) {
							if (mfmpos == 0)
								diskevent_flag |= DISK_REVOLUTION << drv.num;
							if (mfmpos == drv.indexoffset)
								diskevent_flag |= DISK_INDEXSYNC;
						}
					}
				}
				if (diskevent_flag)
					break;
			}
			if (drv.tracktiming[0])
				updatetrackspeed(drv, drv.mfmpos);
			if (diskevent_flag && countcycle < finaleventcycle) {
				finaleventcycle = countcycle;
				finaleventflag = diskevent_flag;
			}
		}
		if (finaleventflag && (finaleventcycle >> 8) < SAER.playfield.get_maxhpos())
			SAER.events.event2_newevent(SAEC_Events_EV2_DISK, (finaleventcycle - startcycle) >> 8, ((finaleventcycle >> 8) << 8) | finaleventflag);
	}

	this.fifostatus = function() { //disk_fifostatus()
		if (fifo_inuse[0] && fifo_inuse[1] && fifo_inuse[2])
			return 1;
		if (!fifo_inuse[0] && !fifo_inuse[1] && !fifo_inuse[2])
			return -1;
		return 0;
	}

	function doreaddma() {
		if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_DSKEN) && bitoffset == 15 && dma_enable && dskdmaen == DSKDMA_READ && dsklength >= 0) {
			if (dsklength > 0) {
				// DSKLEN == 1: finish without DMA transfer.
				if (dsklength == 1 && dsklength2 == 1) {
					disk_dmafinished();
					return 0;
				}
				// fast disk modes, just flush the fifo
				if (SAEV_config.floppy.speed > 100 && fifo_inuse[0] && fifo_inuse[1] && fifo_inuse[2]) {
					while (fifo_inuse[0]) {
						var w = SAER.disk.DSKDATR();
						SAER_Memory_chipPut16_indirect(dskpt, w);
						dskpt += 2;
					}
				}
				if (SAER.disk.fifostatus() > 0) {
					SAEF_warn("disk.doreaddma() fifo overflow detected, retrying...");
					return -1;
				} else {
					SAER.disk.DSKDAT(word);
					dsklength--;
				}
			}
			return 1;
		}
		return 0;
	}

	function disk_doupdate_read_nothing(floppybits) {
		while (floppybits >= get_floppy_speed()) {
			word <<= 1;
			word &= 0xffff; //OWN
			doreaddma();
			if ((bitoffset & 7) == 7) {
				dskbytr_val = word & 0xff;
				dskbytr_val |= 0x8000;
			}
			bitoffset++;
			bitoffset &= 15;
			floppybits -= get_floppy_speed();
		}
	}

	function wordsync_detected(startup) {
		dsksync_cycles = SAEV_Events_currcycle + WORDSYNC_TIME * SAEC_Events_CYCLE_UNIT;
		if (dskdmaen != DSKDMA_OFF) {
			/*if (disk_debug_logging && dma_enable == 0) {
				int pos = -1;
				for (int i = 0; i < MAX_FLOPPY_DRIVES; i++) {
					drive *drv = &floppy[i];
					if (!(disabled & (1 << i)) && !drv->motoroff) {
						pos = drv->mfmpos;
						break;
					}
				}
				write_log(_T("Sync match %04x mfmpos %d enable %d wordsync %d\n"), dsksync, pos, dma_enable, (SAEV_Custom_adkcon & 0x0400) != 0);
				if (disk_debug_logging > 1)
					dumpdisk(_T("SYNC"));
			}*/
			if (!startup)
				dma_enable = 1;

			SAER.custom.INTREQ(SAEC_Custom_INTF_SETCLR | SAEC_Custom_INTF_DSKSYN);
		}
		if (SAEV_Custom_adkcon & 0x0400)
			bitoffset = 15;
	}
	function disk_doupdate_read(drv, floppybits) {
		/* ORG
		uae_u16 *mfmbuf = drv.bigmfmbuf;
		dsksync = 0x4444;
		SAEV_Custom_adkcon |= 0x400;
		drv.mfmpos = 0;
		memset (mfmbuf, 0, 1000);
		cycles = 0x1000000;
		// 4444 4444 4444 aaaa aaaaa 4444 4444 4444
		// 4444 aaaa aaaa 4444
		mfmbuf[0] = 0x4444;
		mfmbuf[1] = 0x4444;
		mfmbuf[2] = 0x4444;
		mfmbuf[3] = 0xaaaa;
		mfmbuf[4] = 0xaaaa;
		mfmbuf[5] = 0x4444;
		mfmbuf[6] = 0x4444;
		mfmbuf[7] = 0x4444;
		*/
		while (floppybits >= drv.trackspeed) {
			if (drv.tracktiming[0])
				updatetrackspeed(drv, drv.mfmpos);
			word <<= 1;
			word &= 0xffff; //OWN

			if (!drive_empty(drv)) {
				if (unformatted(drv))
					word |= (Math.decimalRandom() & 0x1000) ? 1 : 0;
				else
					word |= getonebit(drv.bigmfmbuf, drv.mfmpos);
			}
			if (doreaddma() < 0) {
				word >>= 1;
				return;
			}
			drv.mfmpos++;
			drv.mfmpos %= drv.tracklen;
			if (drv.mfmpos == drv.indexoffset) {
				if (disk_debug_logging > 2 && drv.indexhack) SAEF_log("disk.disk_doupdate_read() indexhack cleared");
				drv.indexhack = false;
				do_disk_index();
			}
			if (drv.mfmpos == 0) {
				fetchnextrevolution(drv);
				if (drv.tracktiming[0])
					updatetrackspeed(drv, drv.mfmpos);
			}
			if (drv.mfmpos == drv.skipoffset) {
				update_jitter();
				var skipcnt = disk_jitter;
				while (skipcnt-- > 0) {
					drv.mfmpos++;
					drv.mfmpos %= drv.tracklen;
					if (drv.mfmpos == drv.indexoffset) {
						if (disk_debug_logging > 2 && drv.indexhack) SAEF_log("disk.disk_doupdate_read() indexhack cleared");
						drv.indexhack = false;
						do_disk_index();
					}
					if (drv.mfmpos == 0) {
						fetchnextrevolution(drv);
						if (drv.tracktiming[0])
							updatetrackspeed(drv, drv.mfmpos);
					}
				}
			}
			if ((bitoffset & 7) == 7) {
				dskbytr_val = word & 0xff;
				dskbytr_val |= 0x8000;
			}
			if (word == dsksync)
				wordsync_detected(false);
			bitoffset++;
			bitoffset &= 15;
			floppybits -= drv.trackspeed;
		}
	}

	/*function disk_dma_debugmsg() {
		SAEF_log("LEN=%04X (%d) SYNC=%04X PT=%08X ADKCON=%04X INTREQ=%04X PC=%08X", dsklength, dsklength, (SAEV_Custom_adkcon & 0x400) ? dsksync : 0xffff, dskpt, SAEV_Custom_adkcon, SAEV_Custom_intreq, SAER_CPU_getPC());
	}*/
	/* this is very unoptimized. DSKBYTR is used very rarely, so it should not matter. */
	this.DSKBYTR = function(hpos) {
		this.update(hpos);
		var v = dskbytr_val;
		dskbytr_val &= 0x7fff; //ATT ORG ~0x8000;
		//if (word == dsksync && cycles_in_range(dsksync_cycles)) {
		if (word == dsksync && dsksync_cycles - SAEV_Events_currcycle > 0) {
			v |= 0x1000;
			if (disk_debug_logging > 1) dumpdisk("disk.DSKBYTR() SYNC");
		}
		if (dskdmaen != DSKDMA_OFF && SAEF_Custom_dmaen(SAEC_Custom_DMAF_DSKEN))
			v |= 0x4000;
		if (dsklen & 0x4000)
			v |= 0x2000;
		if (disk_debug_logging > 2) SAEF_log("disk.DSKBYTR() $%04X, hpos %d", v, hpos);

		for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			var drv = floppy[dr];
			if (drv.motoroff)
				continue;
			if (!((selected | disabled) & (1 << dr))) {
				drv.lastdataacesstrack = drv.cyl * 2 + side;
				if (REVOLUTION_DEBUG && !drv.track_access_done) SAEF_log("disk.DSKBYTR()");
				drv.track_access_done = true;
				/*if (disk_debug_mode & DISK_DEBUG_PIO) {
					if (disk_debug_track < 0 || disk_debug_track == 2 * drv.cyl + side) {
						//disk_dma_debugmsg();
						SAEF_log("disk.DSKBYTR () $%04X", v);
						//activate_debugger();
						break;
					}
				}*/
			}
		}
		return v;
	}

	function DISK_start() {
		if (disk_debug_logging > 1) dumpdisk("DSKLEN");

		for (var i = 0; i < 3; i++) fifo_inuse[i] = false;
		fifo_filled = 0;

		for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			var drv = floppy[dr];
			if (!((selected | disabled) & (1 << dr))) {
				var tr = drv.cyl * 2 + side;
				var ti = drv.trackdata[tr];

				if (dskdmaen == DSKDMA_WRITE) {
					word = 0;
					drv.tracklen = longwritemode ? FLOPPY_WRITE_MAXLEN : FLOPPY_WRITE_LEN() * drv.ddhd * 8 * 2;
					drv.trackspeed = get_floppy_speed();
					drv.skipoffset = -1;
					updatemfmpos(drv);
				}
				/* Ugh.  A nasty hack.  Assume ADF_EXT1 tracks are always read from the start.  */
				if (ti.type == TRACK_RAW1) {
					drv.mfmpos = 0;
					bitoffset = 0;
					word = 0;
				}
			}
			drv.floppybitcounter = 0;
		}

		dma_enable = (SAEV_Custom_adkcon & 0x400) ? 0 : 1;
		if (word == dsksync)
			wordsync_detected(true);
	}

	/*-----------------------------------------------------------------------*/

	this.hsync = function() { //DISK_hsync()
		for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			var drv = floppy[dr];
			if (drv.steplimit)
				drv.steplimit--;
			if (drv.revolution_check)
				drv.revolution_check--;

			if (drv.dskready_down_time > 0)
				drv.dskready_down_time--;
			/* emulate drive motor turn on time */
			if (drv.dskready_up_time > 0 && !drive_empty(drv)) {
				drv.dskready_up_time--;
				if (drv.dskready_up_time == 0 && !drv.motoroff)
					drv.dskready = true;
			}
			/* delay until new disk image is inserted */
			if (drv.dskchange_time > 0) {
				drv.dskchange_time--;
				if (drv.dskchange_time == 0) {
					drive_insert(drv, SAEV_config, dr, drv.newfile, false);
					if (disk_debug_logging > 0) SAEF_log("disk.hsync() delayed insert, drive %d, image '%s', size %d", dr,  drv.newfile.name, drv.newfile.size);
					update_drive_gui(dr, false);
				}
			}
		}
		if (indexdecay)
			indexdecay--;
		if (linecounter) {
			linecounter--;
			if (!linecounter)
				disk_dmafinished();
			return;
		}
		this.update(SAER.playfield.get_maxhpos());

		// show insert disk in df0: when booting
		if (initial_disk_statusline) {
			initial_disk_statusline = false;
			update_disk_statusline(0);
		}
	}

	/*-----------------------------------------------------------------------*/

	this.update = function(tohpos) { //DISK_update()
		var dr, cycles;

		if (disk_hpos < 0) {
			disk_hpos = -disk_hpos;
			return;
		}

		cycles = (tohpos << 8) - disk_hpos;
		/*#if 0
		if (tohpos == 228) write_log (_T("x"));
		if (tohpos != SAER.playfield.get_maxhpos() || cycles / 256 != SAER.playfield.get_maxhpos()) write_log (_T("%d %d %d\n"), tohpos, cycles / 256, disk_hpos / 256);
		#endif*/
		if (cycles <= 0)
			return;
		disk_hpos += cycles;
		if (disk_hpos >= (SAER.playfield.get_maxhpos() << 8))
			disk_hpos %= 1 << 8;

		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			var drv = floppy[dr];

			if (drv.motoroff || !drv.tracklen || !drv.trackspeed)
				continue;
			drv.floppybitcounter += cycles;
			if ((selected | disabled) & (1 << dr)) {
				drv.mfmpos += Math.floor(drv.floppybitcounter / drv.trackspeed);
				drv.mfmpos %= drv.tracklen;
				drv.floppybitcounter %= drv.trackspeed;
				continue;
			}
			if (drv.diskfile)
				drive_fill_bigbuf(drv, false);
			drv.mfmpos %= drv.tracklen;
		}
		var didaccess = false;
		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			var drv = floppy[dr];
			if (drv.motoroff || !drv.trackspeed)
				continue;
			if ((selected | disabled) & (1 << dr))
				continue;
			/* write dma and wordsync enabled: read until wordsync match found */
			if (dskdmaen == DSKDMA_WRITE && dma_enable)
				disk_doupdate_write(drv, drv.floppybitcounter);
			else
				disk_doupdate_read(drv, drv.floppybitcounter);

			drv.floppybitcounter %= drv.trackspeed;
			didaccess = true;
		}
		/* no floppy selected but read dma */
		if (!didaccess && dskdmaen == DSKDMA_READ)
			disk_doupdate_read_nothing (cycles);

		/* instantly finish dma if dsklen==0 and wordsync detected */
		if (dskdmaen != DSKDMA_OFF && dma_enable && dsklength2 == 0 && dsklength == 0)
			disk_dmafinished();

		disk_doupdate_predict(disk_hpos);
	}

	this.update_adkcon = function(hpos, v) { //DISK_update_adkcon()
		var vold = SAEV_Custom_adkcon;
		var vnew = SAEV_Custom_adkcon;
		if (v & 0x8000)
			 vnew |= v & 0x7FFF;
		else
			vnew &= ~v;
		if ((vnew & 0x400) && !(vold & 0x400))
			bitoffset = 0;
	}

	/*-----------------------------------------------------------------------*/

	this.DSKLEN = function(v, hpos) {
		var dr, prev = dsklen;
		var noselected = 0;
		var motormask;

		this.update(hpos);

		dsklen = v;
		dsklength2 = dsklength = dsklen & 0x3fff;

		if ((v & 0x8000) && (prev & 0x8000)) {
			if (dskdmaen == DSKDMA_READ) {
				// update only currently active DMA length, don't change DMA state
				SAEF_warn("disk.DSKLEN() read DMA length rewrite %d -> %d ($%04x), PC=$%x", prev & 0x3fff, v & 0x3fff, v, SAER_CPU_getPC());
				return;
			}
			dskdmaen = DSKDMA_READ;
			DISK_start();
		}
		if (!(v & 0x8000)) {
			if (dskdmaen != DSKDMA_OFF) {
				/* Megalomania and Knightmare does this */
				if (disk_debug_logging > 0 && dskdmaen == DSKDMA_READ)
					SAEF_warn("disk.DSKLEN() read DMA aborted, %d words left, PC=$%x", dsklength, SAER_CPU_getPC());
				if (dskdmaen == DSKDMA_WRITE) {
					SAEF_warn("disk.DSKLEN() write DMA aborted, %d words left, PC=$%x", dsklength, SAER_CPU_getPC());
					// did program write something that needs to be stored to file?
					for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
						var drv2 = floppy[dr];
						if (!drv2.writtento)
							continue;
						drive_write_data(drv2);
					}
				}
				dskdmaen = DSKDMA_OFF;
			}
		}

		if (dskdmaen == DSKDMA_OFF)
			return;

		if (dsklength == 0 && dma_enable) {
			disk_dmafinished();
			return;
		}

		if ((v & 0x4000) && (prev & 0x4000)) {
			if (dsklength == 0)
				return;
			if (dsklength == 1) {
				disk_dmafinished();
				return;
			}
			if (dskdmaen == DSKDMA_WRITE) {
				SAEF_warn("disk.DSKLEN() write DMA length rewrite %d -> %d, PC=$%x", prev & 0x3fff, v & 0x3fff, SAER_CPU_getPC());
				return;
			}
			dskdmaen = DSKDMA_WRITE;
			DISK_start();
		}

		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			var drv = floppy[dr];
			if (drv.motoroff)
				continue;
			if (selected & (1 << dr))
				continue;
			if (dskdmaen == DSKDMA_READ) {
				drv.lastdataacesstrack = drv.cyl * 2 + side;
				drv.track_access_done = true;
				if (REVOLUTION_DEBUG) SAEF_log("disk.DSKLEN() DMA");
			}
		}

		/*if (((disk_debug_mode & DISK_DEBUG_DMA_READ) && dskdmaen == DSKDMA_READ) ||
			((disk_debug_mode & DISK_DEBUG_DMA_WRITE) && dskdmaen == DSKDMA_WRITE))
		{
			for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
				var drv = floppy[dr];
				if (drv.motoroff)
					continue;
				if (!(selected & (1 << dr))) {
					if (disk_debug_track < 0 || disk_debug_track == 2 * drv.cyl + side) {
						//disk_dma_debugmsg();
						//activate_debugger ();
						break;
					}
				}
			}
		}*/

		motormask = 0;
		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			var drv = floppy[dr];
			drv.writtento = 0;
			if (drv.motoroff)
				continue;
			motormask |= 1 << dr;
			if ((selected & (1 << dr)) == 0)
				break;
		}
		if (dr == 4) {
			if (!amax_enabled)
				SAEF_log("disk.DSKLEN() %s DMA started, drvmask=$%x motormask=$%x PC=$%08x", dskdmaen == DSKDMA_WRITE ? "write" : "read", selected ^ 15, motormask, SAER_CPU_getPC());
			noselected = 1;
		} else {
			if (disk_debug_logging > 0) {
				SAEF_log("disk.DSKLEN() %s DMA started, drvmask=%x track %d mfmpos %d dmaen=%d PC=$%08X", dskdmaen == DSKDMA_WRITE ? "write" : "read", selected ^ 15, floppy[dr].cyl * 2 + side, floppy[dr].mfmpos, dma_enable, SAER_CPU_getPC());
				//disk_dma_debugmsg();
			}
		}

		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++)
			update_drive_gui(dr, false);

		/* Try to make floppy access from Kickstart faster.  */
		if (dskdmaen != DSKDMA_READ && dskdmaen != DSKDMA_WRITE)
			return;

		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			var drv = floppy[dr];
			if (selected & (1 << dr))
				continue;
			if (drv.filetype != ADF_NORMAL && drv.filetype != ADF_KICK && drv.filetype != ADF_SKICK)
				break;
		}
		if (dr < MAX_FLOPPY_DRIVES) /* no turbo mode if any selected drive has non-standard ADF */
			return;
		{
			var done = 0;
			for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
				var i, drv = floppy[dr];

				if (drv.motoroff)
					continue;
				if (!drv.useturbo && SAEV_config.floppy.speed > 0)
					continue;
				if (selected & (1 << dr))
					continue;

				var pos = drv.mfmpos & ~15;
				drive_fill_bigbuf(drv, false);

				if (dskdmaen == DSKDMA_READ) { /* TURBO read */
					if (SAEV_Custom_adkcon & 0x400) {
						for (i = 0; i < drv.tracklen; i += 16) {
							pos += 16;
							pos %= drv.tracklen;
							if (drv.bigmfmbuf[pos >> 4] == dsksync) {
								/* must skip first disk sync marker */
								pos += 16;
								pos %= drv.tracklen;
								break;
							}
						}
						if (i >= drv.tracklen)
							return;
					}
					while (dsklength-- > 0) {
						SAER_Memory_chipPut16_indirect(dskpt, drv.bigmfmbuf[pos >> 4]);
						dskpt += 2;
						pos += 16;
						pos %= drv.tracklen;
					}
					drv.mfmpos = pos;
					SAER.custom.INTREQ(SAEC_Custom_INTF_SETCLR | SAEC_Custom_INTF_DSKSYN);
					done = 2;
				} else if (dskdmaen == DSKDMA_WRITE) { /* TURBO write */
					for (i = 0; i < dsklength; i++) {
						var w = SAER_Memory_chipGet16_indirect(dskpt + i * 2);
						drv.bigmfmbuf[pos >> 4] = w;
						if (amax_enabled)
							amax_diskwrite(w);

						pos += 16;
						pos %= drv.tracklen;
					}
					drv.mfmpos = pos;
					drive_write_data(drv);
					done = 2;
				}
			}
			if (!done && noselected) {
				var bits = -1;
				while (dsklength-- > 0) {
					if (dskdmaen == DSKDMA_WRITE) {
						var w = SAER_Memory_chipGet16_indirect(dskpt);
						if (amax_enabled) {
							amax_diskwrite(w);
							if (w) {
								for (var i = 0; i < 16; i++) {
									if (w & (1 << i))
										bits++;
								}
							}
						}
					} else
						SAER_Memory_chipPut16_indirect(dskpt, 0);

					dskpt += 2;
				}
				if (bits == 0) {
					//AMAX speedup hack
					done = 1;
				} else {
					SAER.custom.INTREQ(SAEC_Custom_INTF_SETCLR | SAEC_Custom_INTF_DSKSYN);
					done = 2;
				}
			}

			if (done) {
				linecounter = done;
				dskdmaen = DSKDMA_OFF;
				return;
			}
		}
	}

	this.DSKSYNC = function(hpos, v) {
		if (v == dsksync)
			return;
		this.update(hpos);
		dsksync = v;
	}

	/*function iswrite() {
		return dskdmaen == DSKDMA_WRITE;
	}*/
	this.DSKDAT = function(v) {
		if (fifo_inuse[2]) {
			SAEF_warn("disk.DSKDAT() FIFO overflow!");
			return;
		}
		fifo_inuse[2] = fifo_inuse[1];
		fifo[2] = fifo[1];
		fifo_inuse[1] = fifo_inuse[0];
		fifo[1] = fifo[0];
		//fifo_inuse[0] = iswrite() ? 2 : 1;
		fifo_inuse[0] = dskdmaen == DSKDMA_WRITE ? 2 : 1;
		fifo[0] = v;
		fifo_filled = 1;
	}
	this.DSKDATR = function() {
		var i, v = 0;

		for (i = 2; i >= 0; i--) {
			if (fifo_inuse[i]) {
				fifo_inuse[i] = 0;
				v = fifo[i];
				break;
			}
		}
		if (i < 0)
			SAEF_warn("disk.DSKDATR() FIFO underflow!");
		else if (dskdmaen > 0 && dskdmaen < 3 && dsklength <= 0 && this.fifostatus() < 0)
			disk_dmafinished();

		return v;
	}

	this.DSKPTH = function(v) {
		v = v & (SAEV_config.chipset.mask == SAEC_Config_Chipset_Mask_OCS ? 7 : 31); //OWN
		dskpt = ((v << 16) | (dskpt & 0xffff)) >>> 0;
	}
	this.DSKPTL = function(v) {
		dskpt = ((dskpt & 0xffff0000) | v) >>> 0;
	}

	/*-----------------------------------------------------------------------*/

	this.dmal = function() { //disk_dmal()
		var dmal = 0;
		if (dskdmaen) {
			if (dskdmaen == 3) {
				dmal = (1 + 2) * (fifo_inuse[0] ? 1 : 0) + (4 + 8) * (fifo_inuse[1] ? 1 : 0) + (16 + 32) * (fifo_inuse[2] ? 1 : 0);
				dmal ^= 63;
				if (dsklength == 2)
					dmal &= ~(16 + 32);
				if (dsklength == 1)
					dmal &= ~(16 + 32 + 4 + 8);
			} else
				dmal = 16 * (fifo_inuse[0] ? 1 : 0) + 4 * (fifo_inuse[1] ? 1 : 0) + 1 * (fifo_inuse[2] ? 1 : 0);
		}
		return dmal;
	}
	this.getpt = function() { //disk_getpt()
		var pt = dskpt;
		dskpt += 2;
		return pt;
	}

	/*-----------------------------------------------------------------------*/

	this.setup = function() { //DISK_init()
		for (var dr = MAX_FLOPPY_DRIVES - 1; dr >= 0; dr--) {
			var drv = floppy[dr];
			/* reset all drive types to 3.5 DD */
			drive_settype_id(drv);
			if (!drive_insert(drv, SAEV_config, dr, SAEV_config.floppy.drive[dr].file, false))
				this.eject(dr);
		}
		if (drive_empty(floppy[0])) //if (disk_empty(0))
			SAEF_log("disk.setup() No disk in drive DF0.");

		amax_init();
	}
	this.cleanup = function() { //DISK_free()
		for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			var drv = floppy[dr];
			drive_image_free(drv);
		}
	}

	this.reset = function() { //DISK_reset()
		disk_hpos = 0;
		dskdmaen = 0;
		disabled = 0;
		//disk_info_data.clr(); //memset(&disk_info_data, 0, sizeof disk_info_data);
		for (var dr = MAX_FLOPPY_DRIVES - 1; dr >= 0; dr--)
			reset_drive(dr);

		initial_disk_statusline = true;
		setamax();

		 //OWN
		linecounter = 0;
		warned_ext2 = false;
		warned_trackspeed = 0;
		driveNames = ["","","",""];
	}

	/*-----------------------------------------------------------------------*/
	/* SECT disk tools */
	/*-----------------------------------------------------------------------*/

	const FS_FLOPPY_BLOCKSIZE = 512;
	const FS_OFS_DATABLOCKSIZE = 488;
	const FS_EXTENSION_BLOCKS = 72;
	const FS_FLOPPY_TOTALBLOCKS = 1760;
	//const FS_FLOPPY_RESERVED = 2;

	const bootblock_ofs = [
		0x44,0x4f,0x53,0x00,0xc0,0x20,0x0f,0x19,0x00,0x00,0x03,0x70,0x43,0xfa,0x00,0x18,
		0x4e,0xae,0xff,0xa0,0x4a,0x80,0x67,0x0a,0x20,0x40,0x20,0x68,0x00,0x16,0x70,0x00,
		0x4e,0x75,0x70,0xff,0x60,0xfa,0x64,0x6f,0x73,0x2e,0x6c,0x69,0x62,0x72,0x61,0x72,
		0x79
	];
	const bootblock_ffs = [
		0x44, 0x4F, 0x53, 0x01, 0xE3, 0x3D, 0x0E, 0x72, 0x00, 0x00, 0x03, 0x70, 0x43, 0xFA, 0x00, 0x3E,
		0x70, 0x25, 0x4E, 0xAE, 0xFD, 0xD8, 0x4A, 0x80, 0x67, 0x0C, 0x22, 0x40, 0x08, 0xE9, 0x00, 0x06,
		0x00, 0x22, 0x4E, 0xAE, 0xFE, 0x62, 0x43, 0xFA, 0x00, 0x18, 0x4E, 0xAE, 0xFF, 0xA0, 0x4A, 0x80,
		0x67, 0x0A, 0x20, 0x40, 0x20, 0x68, 0x00, 0x16, 0x70, 0x00, 0x4E, 0x75, 0x70, 0xFF, 0x4E, 0x75,
		0x64, 0x6F, 0x73, 0x2E, 0x6C, 0x69, 0x62, 0x72, 0x61, 0x72, 0x79, 0x00, 0x65, 0x78, 0x70, 0x61,
		0x6E, 0x73, 0x69, 0x6F, 0x6E, 0x2E, 0x6C, 0x69, 0x62, 0x72, 0x61, 0x72, 0x79, 0x00, 0x00, 0x00
	];

	/*---------------------------------*/

	function disk_checksum(p,po, c,co) {
		var cs = 0;
		for (var i = 0; i < FS_FLOPPY_BLOCKSIZE; i += 4) {
			cs += ((p[po + i] << 24) | (p[po + i + 1] << 16) | (p[po + i + 2] << 8) | p[po + i + 3]) >>> 0;
			if (cs > 0xffffffff) cs -= 0x100000000; //OWN
		}
		cs = -cs;
		if (cs < 0) cs += 0x100000000; //OWN

		if (c !== null) {
			c[co    ] = cs >>> 24;
			c[co + 1] = (cs >>> 16) & 0xff;
			c[co + 2] = (cs >>> 8) & 0xff;
			c[co + 3] = cs & 0xff;
		}
		//SAEF_log('disk.disk_checksum() 0x%08X', cs);
		return cs;
	}

	function disk_date(p,po) {
		var tv = {};
		SAEF_gettimeofday(tv, null);
		//tv.tv_sec -= _timezone;
		var amiga = { days:0, mins:0, ticks:0 };
		SAEF_timeval_to_amiga(tv, amiga, 50);
		if (amiga.days == prev_days && amiga.mins == prev_mins && amiga.ticks == prev_ticks) {
			amiga.ticks++;
			if (amiga.ticks >= 50 * 60) {
				amiga.ticks = 0;
				amiga.mins++;
				if (amiga.mins >= 24 * 60)
					amiga.days++;
			}
		}
		prev_days = amiga.days;
		prev_mins = amiga.mins;
		prev_ticks = amiga.ticks;
		p[po + 0] = amiga.days >>> 24;
		p[po + 1] = (amiga.days >>> 16) & 0xff;
		p[po + 2] = (amiga.days >>> 8) & 0xff;
		p[po + 3] = amiga.days & 0xff;
		p[po + 4] = amiga.mins >>> 24;
		p[po + 5] = (amiga.mins >>> 16) & 0xff;
		p[po + 6] = (amiga.mins >>> 8) & 0xff;
		p[po + 7] = amiga.mins & 0xff;
		p[po + 8] = amiga.ticks >>> 24;
		p[po + 9] = (amiga.ticks >>> 16) & 0xff;
		p[po + 10] = (amiga.ticks >>> 8) & 0xff;
		p[po + 11] = amiga.ticks & 0xff;
	}

	/*---------------------------------*/
	/* DiskInfo */

	function load_track(num, cyl, side, sectable) {
		var drv = floppy[num];
		var oldcyl = drv.cyl;
		var oldside = side;
		var drvsec = { value:0 };
		drv.cyl = cyl;
		side = 0;
		drv.buffered_cyl = -1;
		drive_fill_bigbuf(drv, true);
		decode_buffer(drv.bigmfmbuf, drv.cyl, 11, drv.ddhd, drv.filetype, drvsec, sectable, true);
		drv.cyl = oldcyl;
		side = oldside;
		drv.buffered_cyl = -1;
	}
	function examine_image(p, num, di) { //DISK_examine_image()
		var drv = floppy[num];
		var dos, crc, tmpcrc, crc2; //u32
		var wasdelayed = drv.dskchange_time;
		var drvsec = { value:0 };
		var sectable = new Uint8Array(MAX_SECTORS);
		var i, v = 0; //u32

		var ret = 0;
		di.clr(); //memset(di, 0, sizeof (struct diskinfo));
		di.unreadable = true;
		var oldcyl = drv.cyl;
		var oldside = side;
		drv.cyl = 0;
		side = 0;
		if (!drive_insert(drv, p, num, p.floppy.drive[num].file, true) || drv.diskfile === null) {
			drv.cyl = oldcyl;
			side = oldside;
			return 1;
		}
		//di.crc32 = SAEF_ZFile_crc32(drv.diskfile);
		di.crc32 = drv.crc32;
		di.unreadable = false;
		decode_buffer(drv.bigmfmbuf, drv.cyl, 11, drv.ddhd, drv.filetype, drvsec, sectable, true);
		di.hd = drv.ddhd == 2;
		drv.cyl = oldcyl;
		side = oldside;
		if (sectable[0] == 0 || sectable[1] == 0) {
			ret = 2;
			//goto end2;
		}
		if (ret != 2) {
			crc = crc2 = 0;
			for (i = 0; i < 1024; i += 4) {
				di.bootblock[i    ] = writebuffer[i    ];
				di.bootblock[i + 1] = writebuffer[i + 1];
				di.bootblock[i + 2] = writebuffer[i + 2];
				di.bootblock[i + 3] = writebuffer[i + 3];
				var v = ((writebuffer[i] << 24) | (writebuffer[i + 1] << 16) | (writebuffer[i + 2] << 8) | writebuffer[i + 3]) >>> 0;
				if (i == 0)
					dos = v;
				else if (i == 4) {
					crc2 = v;
					v = 0;
				}
				//if (crc + v < crc) crc++;
				tmpcrc = crc + v; if (tmpcrc > 0xffffffff) tmpcrc -= 0x100000000;
				if (tmpcrc < crc) {
					crc++; if (crc > 0xffffffff) crc -= 0x100000000;
				}
				crc += v; if (crc > 0xffffffff) crc -= 0x100000000;
			}
			if (dos == 0x4b49434b) { /* KICK */
				ret = 10;
				//goto end;
			}
			if (ret != 10) {
				di.bootblockChecksum = crc2;
				crc = (crc ^ 0xffffffff) >>> 0;
				if (crc != crc2) {
					ret = 3;
					//goto end;
				}
				if (ret != 3) {
					di.bootblockChecksumValid = true;
					writebuffer[4] = writebuffer[5] = writebuffer[6] = writebuffer[7] = 0;
					if (SAEF_crc32(writebuffer,0, 0x31) == 0xae5e282c)
						di.bootblockType = 1;

					if (dos == 0x444f5300)
						ret = 10;
					else if (dos == 0x444f5301 || dos == 0x444f5302 || dos == 0x444f5303)
						ret = 11;
					else if (dos == 0x444f5304 || dos == 0x444f5305 || dos == 0x444f5306 || dos == 0x444f5307)
						ret = 12;
					else
						ret = 4;

					v = SAEF_crc32(writebuffer,8, 0x5c - 8);
					if (ret >= 10 && v == 0xe158ca4b)
						di.bootblockType = 2;
				}
			}
			//end:
			load_track(num, 40, 0, sectable);
			if (sectable[0]) {
				if (!disk_checksum(writebuffer,0, null,0) &&
					writebuffer[0] == 0 && writebuffer[1] == 0 && writebuffer[2] == 0 && writebuffer[3] == 2 &&
					writebuffer[508] == 0 && writebuffer[509] == 0 && writebuffer[510] == 0 && writebuffer[511] == 1
				) {

					/*writebuffer[512 - 20 * 4 + 1 + writebuffer[512 - 20 * 4]] = 0;
					TCHAR *n = au((const char*)(writebuffer + 512 - 20 * 4 + 1));
					if (_tcslen (n) >= sizeof (di.diskname)) n[sizeof (di.diskname) - 1] = 0;
					di.diskname = n;
					xfree(n);*/
					var len = writebuffer[512 - 20 * 4]; //BSTR
					var off = 512 - 20 * 4 + 1;
					var n = "";
					while (--len >= 0) n += String.fromCharCode(writebuffer[off++]);
					di.diskname = n;
				}
			}
		}
		//end2:
		drive_image_free(drv);
		if (wasdelayed > 1) {
			drive_eject(drv);
			SAEV_config.floppy.drive[num].file.clr();
			drv.dskchange_time = wasdelayed;
			SAER.disk.insert(num, drv.newfile);
		}
		return ret;
	}
	this.examine = function(di, num) {
		var ret = examine_image(SAEV_config, num, di);
		if (ret != 1)
			return SAEE_None;

		return SAEE_Internal; //FIX better error
	}

	/*---------------------------------*/
	/* EXE -> ADF */

	function writeimageblock(dst, sector, offset) {
		SAEF_ZFile_fseek(dst, offset, SEEK_SET);
		SAEF_ZFile_fwrite(sector,0, FS_FLOPPY_BLOCKSIZE, 1, dst);
	}
	function dirhash(name) {
		name = name.toUpperCase();
		var hash = name.length; //u32
		for (var i = 0; i < name.length; i++) {
			hash = hash * 13;
			hash = hash + name.charCodeAt(i);
			hash = hash & 0x7ff;
		}
		hash = hash % ((FS_FLOPPY_BLOCKSIZE >> 2) - 56);
		//SAEF_log("disk.dirhash() %X", hash);
		return hash;
	}
	function createbootblock(sector, bootable) {
		//memset(sector, 0, FS_FLOPPY_BLOCKSIZE);
		SAEF_memset(sector,0, 0, FS_FLOPPY_BLOCKSIZE);
		if (bootable) {
			//memcpy(sector, bootblock_ofs, sizeof bootblock_ofs);
			sector.set(bootblock_ofs);
		} else {
			//memcpy(sector, "DOS", 3);
			sector.set(SAEF_String2Array("DOS"));
		}
	}
	function createrootblock(sector, disk_name) {
		var dn = disk_name;
		if (dn.length > 30)
			dn = dn.substr(0, 30);
		dn2 = dn;
		if (dn2.length == 0)
			dn2 = "empty";
		//memset(sector, 0, FS_FLOPPY_BLOCKSIZE);
		SAEF_memset(sector,0, 0, FS_FLOPPY_BLOCKSIZE);
		sector[0+3] = 2;
		sector[12+3] = 0x48;
		sector[312] = sector[313] = sector[314] = sector[315] = 0xff;
		sector[316+2] = 881 >> 8;
		sector[316+3] = 881 & 255;
		sector[432] = dn2.length; sector.set(SAEF_String2Array(dn2), 433); //BSTR
		sector[508 + 3] = 1;
		disk_date(sector,420);
		//memcpy(sector + 472, sector + 420, 3 * 4);
		//memcpy(sector + 484, sector + 420, 3 * 4);
		SAEF_memcpy(sector,472, sector,420, 3 * 4);
		SAEF_memcpy(sector,484, sector,420, 3 * 4);
		//sector.copyWithin(472, 420, 420 + 3 * 4);
		//sector.copyWithin(484, 420, 420 + 3 * 4);
	}
	function getblock(bitmap, prev) {
		var i = prev.block;
		while (bitmap[i] != 0xff) {
			if (bitmap[i] == 0) {
				bitmap[i] = 1;
				prev.block = i;
				return i;
			}
			i++;
		}
		i = 0;
		while (bitmap[i] != 0xff) {
			if (bitmap[i] == 0) {
				bitmap[i] = 1;
				prev.block = i;
				return i;
			}
			i++;
		}
		return -1;
	}
	function pl(sector, offset, v) {
		sector[offset + 0] = v >>> 24;
		sector[offset + 1] = (v >>> 16) & 0xff;
		sector[offset + 2] = (v >>> 8) & 0xff;
		sector[offset + 3] = v & 0xff;
	}
	function createdirheaderblock(sector, parent, filename, bitmap, prevblock) {
		var block = getblock(bitmap, prevblock);

		//memset(sector, 0, FS_FLOPPY_BLOCKSIZE);
		SAEF_memset(sector,0, 0, FS_FLOPPY_BLOCKSIZE);
		pl(sector, 0, 2);
		pl(sector, 4, block);
		disk_date(sector, 512 - 92);
		sector[512 - 80] = filename.length; sector.set(SAEF_String2Array(filename), 512 - 79); //BSTR
		pl(sector, 512 - 12, parent);
		pl(sector, 512 - 4, 2);
		return block;
	}
	function createfileheaderblock(z, sector, parent, filename, src, bitmap, prevblock) {
		var sector2 = new Uint8Array(FS_FLOPPY_BLOCKSIZE);
		var sector3 = new Uint8Array(FS_FLOPPY_BLOCKSIZE);
		var block = getblock(bitmap, prevblock);
		var datablock = getblock(bitmap, prevblock);
		var datasec = 1;
		var headerextension = 1;

		SAEF_ZFile_fseek(src, 0, SEEK_END);
		var size = SAEF_ZFile_ftell(src);
		SAEF_ZFile_fseek(src, 0, SEEK_SET);
		var extensions = Math.floor((size + FS_OFS_DATABLOCKSIZE - 1) / FS_OFS_DATABLOCKSIZE);

		//memset(sector, 0, FS_FLOPPY_BLOCKSIZE);
		SAEF_memset(sector,0, 0, FS_FLOPPY_BLOCKSIZE);
		pl(sector, 0, 2);
		pl(sector, 4, block);
		pl(sector, 8, extensions > FS_EXTENSION_BLOCKS ? FS_EXTENSION_BLOCKS : extensions);
		pl(sector, 16, datablock);
		pl(sector, FS_FLOPPY_BLOCKSIZE - 188, size);
		disk_date(sector,FS_FLOPPY_BLOCKSIZE - 92);
		sector[FS_FLOPPY_BLOCKSIZE - 80] = filename.length; sector.set(SAEF_String2Array(filename), FS_FLOPPY_BLOCKSIZE - 79); //BSTR
		pl(sector, FS_FLOPPY_BLOCKSIZE - 12, parent);
		pl(sector, FS_FLOPPY_BLOCKSIZE - 4, -3 >>> 0);
		var extensioncounter = 0;
		var extensionblock = 0;

		while (size > 0) {
			var datablock2 = datablock;
			var extensionblock2 = extensionblock;
			if (extensioncounter == FS_EXTENSION_BLOCKS) {
				extensioncounter = 0;
				extensionblock = getblock(bitmap, prevblock);
				if (datasec > FS_EXTENSION_BLOCKS + 1) {
					pl(sector3, 8, FS_EXTENSION_BLOCKS);
					pl(sector3, FS_FLOPPY_BLOCKSIZE - 8, extensionblock);
					pl(sector3, 4, extensionblock2);
					disk_checksum(sector3,0, sector3,20);
					writeimageblock(z, sector3, extensionblock2 * FS_FLOPPY_BLOCKSIZE);
				} else
					pl(sector, 512 - 8, extensionblock);

				//memset(sector3, 0, FS_FLOPPY_BLOCKSIZE);
				SAEF_memset(sector3,0, 0, FS_FLOPPY_BLOCKSIZE);
				pl(sector3, 0, 16);
				pl(sector3, FS_FLOPPY_BLOCKSIZE - 12, block);
				pl(sector3, FS_FLOPPY_BLOCKSIZE - 4, -3 >>> 0);
			}
			//memset(sector2, 0, FS_FLOPPY_BLOCKSIZE);
			SAEF_memset(sector2,0, 0, FS_FLOPPY_BLOCKSIZE);
			pl(sector2, 0, 8);
			pl(sector2, 4, block);
			pl(sector2, 8, datasec++);
			pl(sector2, 12, size > FS_OFS_DATABLOCKSIZE ? FS_OFS_DATABLOCKSIZE : size);
			SAEF_ZFile_fread(sector2,24, size > FS_OFS_DATABLOCKSIZE ? FS_OFS_DATABLOCKSIZE : size, 1, src);
			size -= FS_OFS_DATABLOCKSIZE;
			datablock = 0;
			if (size > 0) datablock = getblock(bitmap, prevblock);
			pl(sector2, 16, datablock);
			disk_checksum(sector2,0, sector2,20);
			writeimageblock(z, sector2, datablock2 * FS_FLOPPY_BLOCKSIZE);
			if (datasec <= FS_EXTENSION_BLOCKS + 1)
				pl(sector, 512 - 204 - extensioncounter * 4, datablock2);
			else
				pl(sector3, 512 - 204 - extensioncounter * 4, datablock2);
			extensioncounter++;
		}
		if (datasec > FS_EXTENSION_BLOCKS) {
			pl(sector3, 8, extensioncounter);
			disk_checksum(sector3,0, sector3,20);
			writeimageblock(z, sector3, extensionblock * FS_FLOPPY_BLOCKSIZE);
		}
		disk_checksum(sector,0, sector,20);
		writeimageblock(z, sector, block * FS_FLOPPY_BLOCKSIZE);
		return block;
	}
	function createbitmapblock(sector, bitmap) {
		//memset(sector, 0, FS_FLOPPY_BLOCKSIZE);
		SAEF_memset(sector,0, 0, FS_FLOPPY_BLOCKSIZE);
		var i = 0;
		for (;;) {
			var mask = 0;
			for (var j = 0; j < 32; j++) {
				if (bitmap[2 + i * 32 + j] == 0xff)
					break;
				if (!bitmap[2 + i * 32 + j])
					mask |= 1 << j;
			}
			mask >>>= 0;
			sector[4 + i * 4 + 0] = mask >>> 24;
			sector[4 + i * 4 + 1] = (mask >>> 16) & 0xff;
			sector[4 + i * 4 + 2] = (mask >>> 8) & 0xff;
			sector[4 + i * 4 + 3] = mask & 0xff;
			if (bitmap[2 + i * 32 + j] == 0xff)
				break;
			i++;
		}
		disk_checksum(sector,0, sector,0);
	}
	function createimagefromexe(src, dst) {
		var sector1 = new Uint8Array(FS_FLOPPY_BLOCKSIZE)
		var sector2 = new Uint8Array(FS_FLOPPY_BLOCKSIZE)
		var bitmap = new Uint8Array(FS_FLOPPY_TOTALBLOCKS + 8);
		var blocksize = FS_OFS_DATABLOCKSIZE;
		const fname1 = "runme.exe";
		const fname1b = "runme.adf";
		const fname2 = "startup-sequence";
		const dirname1 = "s";
		var prevblock = {
			block:880
		};

		//memset(bitmap, 0, sizeof bitmap);
		SAEF_ZFile_fseek(src, 0, SEEK_END);
		var exesize = SAEF_ZFile_ftell(src);
		var blocks = Math.floor((exesize + blocksize - 1) / blocksize);
		var extensionblocks = Math.floor((blocks + FS_EXTENSION_BLOCKS - 1) / FS_EXTENSION_BLOCKS);
		//bootblock=2, root=1, bitmap=1, startup-sequence=1+1, exefileheader=1
		var totalblocks = 2 + 1 + 1 + 2 + 1 + blocks + extensionblocks;
		if (totalblocks > FS_FLOPPY_TOTALBLOCKS)
			return 0;

		bitmap[880] = 1;
		bitmap[881] = 1;
		bitmap[0] = 1;
		bitmap[1] = 1;
		bitmap[1760] = -1;
		//prevblock = 880;

		var dblock1 = createdirheaderblock(sector2, 880, dirname1, bitmap, prevblock);
		var ss = SAEF_ZFile_fopen_empty(src, fname1b, fname1.length);
		SAEF_ZFile_fwrite(SAEF_String2Array(fname1),0, fname1.length, 1, ss);
		var fblock1 = createfileheaderblock(dst, sector1,  dblock1, fname2, ss, bitmap, prevblock);
		SAEF_ZFile_fclose(ss);
		pl(sector2, 24 + dirhash(fname2) * 4, fblock1);
		disk_checksum(sector2,0, sector2,20);
		writeimageblock(dst, sector2, dblock1 * FS_FLOPPY_BLOCKSIZE);

		fblock1 = createfileheaderblock(dst, sector1, 880, fname1, src, bitmap, prevblock);

		createrootblock(sector1, SAEF_ZFile_getfilename(src));
		pl(sector1, 24 + dirhash(fname1) * 4, fblock1);
		pl(sector1, 24 + dirhash(dirname1) * 4, dblock1);
		disk_checksum(sector1,0, sector1,20);
		writeimageblock(dst, sector1, 880 * FS_FLOPPY_BLOCKSIZE);

		createbitmapblock(sector1, bitmap);
		writeimageblock(dst, sector1, 881 * FS_FLOPPY_BLOCKSIZE);

		createbootblock(sector1, 1);
		writeimageblock(dst, sector1, 0 * FS_FLOPPY_BLOCKSIZE);
		return 1;
	}

	this.EXE2ADF = function(z) {
		var orgname = SAEF_ZFile_getname(z);
		var newname = "";

		var ext = orgname.lastIndexOf('.');
		if (ext != -1) {
			newname = orgname.substr(0, ext);
			newname += ".ADF";
		} else
			newname = orgname + ".ADF";

		var zo = SAEF_ZFile_fopen_empty(z, newname, 1760 * 512);
		if (zo === null)
			return null;

		var ret = createimagefromexe(z, zo);
		if (ret) {
			SAEF_ZFile_fseek(zo, 0, SEEK_SET);

			SAEF_ZFile_fclose(z);
			z = null;

			SAEF_log("disk.EXE2ADF() converted '%s' to '%s'", orgname, newname);
		} else {
			SAEF_ZFile_fclose(zo);
			zo = null;

			//SAEF_warn("disk.EXE2ADF() error converting '%s' (too big)"), orgname);
			alert(sprintf("Can't convert '%s' to ADF. (too big)", orgname));
		}
		return zo;
	}

	/*---------------------------------*/
	/* create ADF */

	function floppy_get_bootblock(dst, ffs, bootable) {
		if (bootable)
			dst.set(ffs ? bootblock_ffs : bootblock_ofs);
		else {
			dst[0] = 68; //D
			dst[1] = 79; //O
			dst[2] = 83; //S
			dst[3] = ffs ? 1 : 0;
		}
	}
	function floppy_get_rootblock(dst, block, label, type) {
		var ls = label.length > 0 ? label : "empty";
		dst[0+3] = 2;
		dst[12+3] = 0x48;
		dst[312] = dst[313] = dst[314] = dst[315] = 0xff;
		dst[316+2] = ((block + 1) >> 8) & 255;
		dst[316+3] = (block + 1) & 255;
		dst[432] = ls.length; dst.set(SAEF_String2Array(ls), 433); //BSTR
		dst[508 + 3] = 1;
		disk_date(dst,420);
		//memcpy(dst + 472, dst + 420, 3 * 4);
		//memcpy(dst + 484, dst + 420, 3 * 4);
		SAEF_memcpy(dst,472, dst,420, 3 * 4);
		SAEF_memcpy(dst,484, dst,420, 3 * 4);
		//dst.copyWithin(472, 420, 420 + 3 * 4);
		//dst.copyWithin(484, 420, 420 + 3 * 4);
		disk_checksum(dst,0, dst,20);
		//bitmap block
		//memset(dst + 512 + 4, 0xff, 2 * block / 8);
		SAEF_memset(dst,512 + 4, 0xff, 2 * block >> 3);
		if (type == SAEC_Disk_Create_Type_35_DD)
			dst[512 + 0x72] = 0x3f;
		else
			dst[512 + 0xdc] = 0x3f;
		disk_checksum(dst,512, dst,512);
	}

	//function creatediskfile(name, mode, type, label, ffs, bootable, copyfrom) {
	function creatediskfile(name, mode, type, label, ffs, bootable, copyfrom) { //disk_creatediskfile()
		const size = 32768;
		var chunk = null; //u8 *
		var ddhd = 1;
		var pos; //u64
		var i;
		var ok = false;

		var tracks = 2 * (mode == SAEC_Disk_Create_Mode_Custom ? 83 : 80);
		var file_size = 880 * 1024;
		var sectors = 11;
		if (type == SAEC_Disk_Create_Type_35_DD_PC || type == SAEC_Disk_Create_Type_35_HD_PC) {
			file_size = 720 * 1024;
			sectors = 9;
		}
		var track_len = FLOPPY_WRITE_LEN() * 2;
		if (type == SAEC_Disk_Create_Type_35_HD || type == SAEC_Disk_Create_Type_35_HD_PC) {
			file_size <<= 1;
			track_len <<= 1;
			ddhd = 2;
		} else if (type == SAEC_Disk_Create_Type_525_SD) {
			file_size >>= 1;
			tracks >>= 1;
		}

		if (copyfrom !== null) {
			pos = SAEF_ZFile_ftell(copyfrom);
			SAEF_ZFile_fseek(copyfrom, 0, SEEK_SET);
		}

		//var f = SAEF_ZFile_fopen(name, "wb", 0);
		var f = SAEF_ZFile_fopen_empty(null, name, file_size);
		chunk = new Uint8Array(size);
		if (f !== null) {
			var cylsize = sectors * 2 * 512;
			//memset(chunk, 0, size);
			SAEF_memset(chunk,0, 0, size);
			if (mode == SAEC_Disk_Create_Mode_Normal) {
				for (i = 0; i < file_size; i += cylsize) {
					//memset(chunk, 0, cylsize);
					SAEF_memset(chunk,0, 0, cylsize);
					if (type <= SAEC_Disk_Create_Type_35_HD) {
						if (i == 0) {
							//boot block
							floppy_get_bootblock(chunk, ffs, bootable);
						} else if (i == file_size >> 1) {
							//root block
							floppy_get_rootblock(chunk, file_size / (2 * 512), label, type);
						}
					}
					SAEF_ZFile_fwrite(chunk,0, cylsize, 1, f);
				}
				ok = true;
			} else {
				var root = new Uint8Array(4);
				var rawtrack = new Uint8Array(3 * 4);
				var dostrack = new Uint8Array(3 * 4);
				var l = track_len;
				SAEF_ZFile_fwrite(SAEF_String2Array("UAE-1ADF"),0, 8, 1, f);
				root[0] = 0; root[1] = 0; //flags (reserved)
				root[2] = 0; root[3] = tracks; //number of tracks
				SAEF_ZFile_fwrite(root,0, 4, 1, f);
				rawtrack[0] = 0; rawtrack[1] = 0; //flags (reserved)
				rawtrack[2] = 0; rawtrack[3] = 1; //track type
				rawtrack[4] = 0; rawtrack[5] = 0; rawtrack[6] = l >> 8; rawtrack[7] = l & 0xff;
				rawtrack[8] = 0; rawtrack[9] = 0; rawtrack[10] = 0; rawtrack[11] = 0;
				dostrack.set(rawtrack);
				dostrack[3] = 0;
				dostrack[9] = ((l * 8) >> 16) & 0xff;
				dostrack[10] = ((l * 8) >> 8) & 0xff;
				dostrack[11] = (l * 8) & 0xff;
				var dodos = ffs || bootable || label.length > 0;
				for (i = 0; i < tracks; i++) {
					var tmp = new Uint8Array(3 * 4);
					if (dodos || copyfrom !== null)
						tmp.set(dostrack);
					else
						tmp.set(rawtrack);
					SAEF_ZFile_fwrite(tmp,0, tmp.length, 1, f);
				}
				for (i = 0; i < tracks; i++) {
					//memset(chunk, 0, size);
					SAEF_memset(chunk,0, 0, size);
					if (copyfrom !== null)
						SAEF_ZFile_fread(chunk,0, 11 * ddhd, 512, copyfrom);
					else {
						if (dodos) {
							if (i == 0)
								floppy_get_bootblock(chunk, ffs, bootable);
							else if (i == 80)
								floppy_get_rootblock(chunk, 80 * 11 * ddhd, label, type);
						}
					}
					SAEF_ZFile_fwrite(chunk,0, l, 1, f);
				}
				ok = true;
			}
		}

		//SAEF_ZFile_fclose(f);

		if (copyfrom !== null)
			SAEF_ZFile_fseek(copyfrom, pos, SEEK_SET);

		//return ok;
		return ok ? f : null;
	}
	this.create = function(unit, name, mode, type, label, ffs, bootable) {
		var f = creatediskfile(name, mode, type, label, ffs, bootable, null);
		if (f !== null) {
			switch (type) {
				case SAEC_Disk_Create_Type_35_DD: SAEV_config.floppy.drive[unit].type = SAEC_Config_Floppy_Type_35_DD; break;
				case SAEC_Disk_Create_Type_35_HD: SAEV_config.floppy.drive[unit].type = SAEC_Config_Floppy_Type_35_HD; break;
				case SAEC_Disk_Create_Type_35_DD_PC: SAEV_config.floppy.drive[unit].type = SAEC_Config_Floppy_Type_35_DD_PC; break;
				case SAEC_Disk_Create_Type_35_HD_PC: SAEV_config.floppy.drive[unit].type = SAEC_Config_Floppy_Type_35_HD_PC; break;
				case SAEC_Disk_Create_Type_525_SD: SAEV_config.floppy.drive[unit].type = SAEC_Config_Floppy_Type_525_SD; break;
			}
			var data = SAEF_ZFile_getdata(f, 0, -1);
			var file = SAEV_config.floppy.drive[unit].file;
			file.name = SAEF_ZFile_getname(f);
			file.data = SAEF_Array2String(data);
			file.size = SAEF_ZFile_size(f);
			file.prot = false;

			SAEF_ZFile_fclose(f);
			return true;
		}
		return false;
	}

	/*---------------------------------*/

	function convert_adf_to_ext2(drv, mode) {
		if (drv.filetype != ADF_NORMAL)
			return false;

		var file = SAEV_config.floppy.drive[drv.num].file;
		var hd = drv.ddhd == 2;
		var name = file.name;
		if (name.length == 0)
			return false;

		var f = null;
		if (mode == 1) {
			/*var p = name.lastIndexOf('.');
			if (p != -1)
				name = name.substr(0, p) + ".extended.adf";
			else
				name += ".extended.adf";*/

			f = creatediskfile(name, SAEC_Disk_Create_Mode_Custom, hd ? SAEC_Disk_Create_Type_35_HD : SAEC_Disk_Create_Type_35_DD, "", false, false, drv.diskfile);
			if (f === null)
				return false;
		} else if (mode == 2) {
			var tmp = SAEF_ZFile_fopen_load_zfile(drv.diskfile);
			if (tmp === null)
				return false;

			SAEF_ZFile_fclose(drv.diskfile);
			drv.diskfile = null;

			f = creatediskfile(name, SAEC_Disk_Create_Mode_Custom, hd ? SAEC_Disk_Create_Type_35_HD : SAEC_Disk_Create_Type_35_DD, "", false, false, tmp);
			if (f === null) {
				SAEF_ZFile_fclose(tmp);
				return false;
			}
		} else
			return false;

		/*var f = SAEF_ZFile_fopen(name, "r+b");
		if (f === null)
			return false;*/

		//file.name = name;
		//changed_prefs.floppyslots[drv.num].file.name = name;
		SAEF_ZFile_fclose(drv.diskfile);

		drv.diskfile = f;
		drv.filetype = ADF_EXT2;
		//read_header_ext2(drv.diskfile, drv.trackdata, &drv.num_tracks, &drv.ddhd);
		read_header_ext2(drv, drv.ddhd);

		drive_write_data(drv);
		/*#ifdef RETROPLATFORM
		rp_disk_image_change(drv - &floppy[0], name, false);
		#endif*/
		drive_fill_bigbuf(drv, true);

		SAEF_log("disk.convert_adf_to_ext2() converted '%s' to ADF-EXT2", file.name);
		return true;
	}

	/*-----------------------------------------------------------------------*/

	/*#define FLOPPY_RATE_500K 0
	#define FLOPPY_RATE_300K 1
	#define FLOPPY_RATE_250K 2
	#define FLOPPY_RATE_1M 3
	struct floppy_reserved {
		int num;
		struct zfile *img;
		bool wrprot;
		int cyl;
		int cyls;
		int heads;
		int secs;
		int drive_cyls;
		bool disk_changed;
		int rate;
	};
	static int get_reserved_id(int num) {
		for (int i = 0; i < MAX_FLOPPY_DRIVES; i++) {
			if (reserved & (1 << i)) {
				if (num > 0) {
					num--;
					continue;
				}
				return i;
			}
		}
		return -1;
	}
	void disk_reserved_setinfo(int num, int cyl, int head, int motor) {
		int i = get_reserved_id(num);
		if (i >= 0) {
			drive *drv = &floppy[i];
			reserved_side = head;
			drv->cyl = cyl;
			drv->state = motor != 0;
			update_drive_gui(i, false);
		}
	}
	bool disk_reserved_getinfo(int num, struct floppy_reserved *fr) {
		int idx = get_reserved_id(num);
		if (idx >= 0) {
			drive *drv = &floppy[idx];
			fr->num = idx;
			fr->img = drv->diskfile;
			fr->wrprot = drv->wrprot;
			if (drv->diskfile && !drv->pcdecodedfile && (drv->filetype == ADF_EXT2 || drv->filetype == ADF_FDI || drv->filetype == ADF_SCP)) {
				int cyl = drv->cyl;
				int side2 = side;
				struct zfile *z = SAEF_ZFile_fopen_empty(null, SAEF_ZFile_getfilename(drv->diskfile));
				if (z) {
					bool ok = false;
					drv->num_secs = 21; // max possible
					drive_fill_bigbuf(drv, true);
					int secs = drive_write_pcdos(drv, z, 1);
					if (secs >= 8) {
						ok = true;
						drv->num_secs = secs;
						for (int i = 0; i < drv->num_tracks; i++) {
							drv->cyl = i / 2;
							side = i & 1;
							drive_fill_bigbuf(drv, true);
							drive_write_pcdos(drv, z, 0);
						}
					}
					drv->cyl = cyl;
					side = side2;
					if (ok) {
						write_log(_T("Created  internal PC disk image cyl=%d secs=%d size=%d\n"), drv->num_tracks / 2, drv->num_secs, SAEF_ZFile_size(z));
						drv->pcdecodedfile = z;
					} else {
						write_log(_T("Failed to create internal PC disk image\n"));
						SAEF_ZFile_fclose(z);
					}
				}
			}
			if (drv->pcdecodedfile) {
				fr->img = drv->pcdecodedfile;
			}
			fr->cyl = drv->cyl;
			fr->cyls = drv->num_tracks / 2;
			fr->drive_cyls = SAEV_config.floppy.drive[idx].type == SAEC_Config_Floppy_Type_35_DD_PC ? 40 : 80;
			fr->secs = drv->num_secs;
			fr->heads = drv->num_heads;
			fr->disk_changed = drv->dskchange || fr->img == null;
			if (SAEV_config.floppy.drive[idx].type == SAEC_Config_Floppy_Type_35_HD_PC) {
				if (fr->cyls < 80) {
					if (drv->num_secs < 9)
						fr->rate = FLOPPY_RATE_250K; // 320k in 80 track drive
					else
						fr->rate = FLOPPY_RATE_300K; // 360k in 80 track drive
				} else {
					if (drv->num_secs > 14)
						fr->rate = FLOPPY_RATE_500K; // 1.2M/1.4M
					else
						fr->rate = FLOPPY_RATE_250K; // 720K
				}
			} else {
				if (drv->num_secs < 9)
					fr->rate = FLOPPY_RATE_300K;// 320k in 40 track drive
				else
					fr->rate = FLOPPY_RATE_250K;// 360k in 40 track drive
				// yes, above values are swapped compared to 1.2M drive case
			}
			return true;
		}
		return false;
	}
	void disk_reserved_reset_disk_change(int num) {
		int i = get_reserved_id(num);
		if (i >= 0) {
			drive *drv = &floppy[i];
			drv->dskchange = false;
		}
	}*/
}
