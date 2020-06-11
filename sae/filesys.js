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

function SAEO_Filesys() {
	this.uci_set_defaults = function(uci, rdb) {
		//memset(uci, 0, sizeof(struct uaedev_config_info));
		//controller
		//if (uci.controller_type == 0)
		uci.controller_type = SAEC_Config_Mount_Controller_Type_MB_IDE;
		uci.controller_unit = 0; //IDE channel + unit
		uci.controller_media_type = 0; // 1 = CF IDE, 0 = normal
		uci.unit_feature_level = SAEC_Config_Mount_Controller_Level_ATA_2;
		uci.unit_special_flags = 0; //1 = force LBA48
		//file
		//uci.type = UAEDEV_HDF;
		//uci.file.name = "";
		//uci.file.size = 0;
		//uci.file.data = "";
		uci.readonly = false;
		//rdb
		//drive geometry
		uci.blocksize = 512;
		uci.cyls = 0; // calculated/corrected highcyl
		if (!rdb) {
			uci.surfaces = 1;
			uci.sectors = 32;
		}
		//partition
		uci.bootable = true;
		uci.automount = true;
		uci.unit = 0;
		uci.flags = 0;
		uci.devname = "";
		//DosEnvec
		uci.sectorsperblock = 1;
		if (!rdb)
			uci.reserved = 2;
		uci.interleave = false;
		uci.lowcyl = 0;
		uci.highcyl = 0; // zero if detected from size
		uci.buffers = 50;
		uci.bufmemtype = 1;
		uci.maxtransfer = 0x7fffffff;
		uci.mask = 0xffffffff;
		uci.bootpri = 0;
		uci.dostype = 0x444f5301;
		//filesystem
		uci.filesys = "";
		//DeviceNode
		uci.stacksize = 4000;
		uci.priority = -129;
		//uci.device_emu_unit = -1;
	}

	/*-----------------------------------------------------------------------*/

	function allocuci(p, nr, idx, unitnum) {
		if (typeof unitnum == "undefined")
			unitnum = -1;
		var uci = p.mount.config[nr];
		if (idx >= 0) {
			/*var ui = mountinfo.ui[idx];
			ui.configureddrive = 1;*/

			uci.configoffset = idx;
			uci.unitnum = unitnum;
		} else {
			uci.configoffset = -1;
			uci.unitnum = -1;
		}
	}

	/*---------------------------------*/

	function getunittype(uci) {
		return "HD" //uci.type == UAEDEV_CD ? "CD" : (uci.type == UAEDEV_TAPE ? "TAPE" : "HD");
	}
	function ismainboardide() {
		return SAEV_config.chipset.ide != 0;
	}
	/*function isa3000scsi() {
		return SAEV_config.chipset.mbdmac == 1;
	}
	function isa4000tscsi() {
		return SAEV_config.chipset.mbdmac == 2;
	}
	function iscdtvscsi() {
		return currprefs.cs_cdtvscsi != 0;
	}*/
	function add_mainboard_unit_init() {
		if (ismainboardide()) {
			SAEF_log("filesys.add_mainboard_unit_init() Initializing mainboard IDE");
			SAER.gayle.gayle_add_ide_unit(-1, null);
		}
		/*if (isa3000scsi()) {
			SAEF_log("filesys.add_mainboard_unit_init() Initializing A3000 mainboard SCSI");
			a3000_add_scsi_unit(-1, null, null);
		}
		if (isa4000tscsi()) {
			SAEF_log("filesys.add_mainboard_unit_init() Initializing A4000T mainboard SCSI");
			a4000t_add_scsi_unit(-1, null, null);
		}
		if (iscdtvscsi()) {
			SAEF_log("filesys.add_mainboard_unit_init() Initializing CDTV SCSI expansion");
			cdtv_add_scsi_unit(-1, null, null);
		}*/
	}

	function add_ide_unit(type, unit, uci) {
		var added = false;
		if (type == SAEC_Config_Mount_Controller_Type_MB_IDE) {
			if (ismainboardide()) {
				SAEF_log("filesys.add_ide_unit() Adding mainboard IDE %s unit %d ('%s')", getunittype(uci), unit, uci.file.name);
				SAER.gayle.gayle_add_ide_unit(unit, uci);
				added = true;
			}
		}
		return added;
	}

	function initialize_mountinfo() {
		// init all controllers first
		add_mainboard_unit_init();

		for (var nr = 0; nr < 6; nr++) {
			var uci = SAEV_config.mount.config[nr].ci;
			var type = uci.controller_type;
			var unit = uci.controller_unit;
			var added = false;
			if (type == 0 || uci.file.size == 0)
				continue;
			if (type == SAEC_Config_Mount_Controller_Type_MB_IDE)
				added = add_ide_unit(type, unit, uci);
			else if (type == SAEC_Config_Mount_Controller_Type_PCMCIA_SRAM) {
				SAER.gayle.gayle_add_pcmcia_sram_unit(uci);
				added = true;
			}
			else if (type == SAEC_Config_Mount_Controller_Type_PCMCIA_IDE) {
				SAER.gayle.gayle_add_pcmcia_ide_unit(uci);
				added = true;
			}
			if (added)
				allocuci(SAEV_config, nr, -1);
		}
	}
	function free_mountinfo() {
		SAER.gayle.free_units();
	}

	/*-----------------------------------------------------------------------*/

	this.start_threads = function() {} //filesys_start_threads()

	this.cleanup = function() { //filesys_cleanup()
		free_mountinfo();
	}

	this.reset = function() { //filesys_reset()
		free_mountinfo();
		initialize_mountinfo();
	}
	this.prepare_reset = function() {} //filesys_prepare_reset()
}
