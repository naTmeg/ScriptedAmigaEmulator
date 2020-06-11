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
/* global variables */

var SAEV_RTC_bank = null;

var SAEV_RTC_delayed_write = 0;

/*---------------------------------*/

function SAEO_RTC() {
	const RTC_DEBUG = false;

	var clock_control_d = 0;
	var clock_control_e = 0;
	var clock_control_f = 0;

	const RF5C01A_RAM_SIZE = 16;
	var rtc_memory = null;
	var rtc_alarm = null;

	/*---------------------------------*/

	function localtime(t) {
		this.tm_sec = t.getSeconds(); //seconds [0,61]
		this.tm_min = t.getMinutes();  //minutes [0,59]
		this.tm_hour = t.getHours(); //hour [0,23]
		this.tm_mday = t.getDate(); //day of month [1,31]
		this.tm_mon = t.getMonth(); //month of year [0,11]
		this.tm_year = t.getFullYear() - 1900; //years since 1900
		this.tm_wday = t.getDay(); //day of week [0,6] (Sunday = 0)
		this.tm_yday = 0; //day of year [0,365]
		this.tm_isdst = false; //daylight savings flag
	}

	function getct() {
		var d = new Date();
		if (SAEV_config.chipset.rtc.adjust) {
			var n = d.valueOf();
			d.setTime(n + SAEV_config.chipset.rtc.adjust * 1000);
		}
		return new localtime(d);
	}

	/*---------------------------------*/

	function getclockreg(addr, ct) {
		var v = 0;

		if (SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_MSM6242B || SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_MSM6242B_A2000) { /* MSM6242B */
			switch (addr) {
				case 0x0: v = ct.tm_sec % 10; break;
				case 0x1: v = ct.tm_sec / 10 >>> 0; break;
				case 0x2: v = ct.tm_min % 10; break;
				case 0x3: v = ct.tm_min / 10 >>> 0; break;
				case 0x4: v = ct.tm_hour % 10; break;
				case 0x5: {
					if (clock_control_f & 4)
						v = ct.tm_hour / 10 >>> 0; /* 24h */
					else {
						v = (ct.tm_hour % 12) / 10 >>> 0; /* 12h */
						v |= ct.tm_hour >= 12 ? 4 : 0; /* AM/PM bit */
					}
					break;
				}
				case 0x6: v = ct.tm_mday % 10; break;
				case 0x7: v = ct.tm_mday / 10 >>> 0; break;
				case 0x8: v = (ct.tm_mon + 1) % 10; break;
				case 0x9: v = (ct.tm_mon + 1) / 10 >>> 0; break;
				case 0xA: v = ct.tm_year % 10; break;
				case 0xB: v = ((ct.tm_year / 10) >>> 0) & 0x0f;  break;
				case 0xC: v = ct.tm_wday; break;
				case 0xD: v = clock_control_d; break;
				case 0xE: v = clock_control_e; break;
				case 0xF: v = clock_control_f; break;
			}
		} else if (SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_RF5C01A) { /* RF5C01A */
			var bank = clock_control_d & 3;
			/* memory access */
			if (bank >= 2 && addr < 0x0d)
				return (rtc_memory[addr] >> ((bank == 2) ? 0 : 4)) & 0x0f;
			/* alarm */
			if (bank == 1 && addr < 0x0d) {
				v = rtc_alarm[addr];
				if (RTC_DEBUG) SAEF_log("rtc.get8(0x%X, ct) ALARM (0x%x)", addr, v);
				return v;
			}
			switch (addr) {
				case 0x0: v = ct.tm_sec % 10; break;
				case 0x1: v = ct.tm_sec / 10 >>> 0; break;
				case 0x2: v = ct.tm_min % 10; break;
				case 0x3: v = ct.tm_min / 10 >>> 0; break;
				case 0x4: v = ct.tm_hour % 10; break;
				case 0x5: {
					if (rtc_alarm[10] & 1)
						v = ct.tm_hour / 10 >>> 0; /* 24h */
					else {
						v = (ct.tm_hour % 12) / 10 >>> 0; /* 12h */
						v |= ct.tm_hour >= 12 ? 2 : 0; /* AM/PM bit */
					}
					break;
				}
				case 0x6: v = ct.tm_wday; break;
				case 0x7: v = ct.tm_mday % 10; break;
				case 0x8: v = ct.tm_mday / 10 >>> 0; break;
				case 0x9: v = (ct.tm_mon + 1) % 10; break;
				case 0xA: v = (ct.tm_mon + 1) / 10 >>> 0; break;
				case 0xB: v = (ct.tm_year % 100) % 10; break;
				case 0xC: v = (ct.tm_year % 100) / 10 >>> 0; break;
				case 0xD: v = clock_control_d; break;
				case 0xE: v = 0; break; //E and F = write-only, reads as zero
				case 0xF: v = 0; break;
			}
		}
		if (RTC_DEBUG) SAEF_log("rtc.get8(0x%X, ct) (0x%x)", addr, v);
		return v;
	}

	/*---------------------------------*/

	function read() { //read_battclock()
		//if (SAEV_config.chipset.rtc.file.length)
		{
			var f = null; //SAEF_ZFile_fopen(SAEV_config.chipset.rtc.file, "rb");
			if (f) {
				var data = new Uint8Array(16);
				SAEF_ZFile_fread(data,0, 16, 1, f);
				clock_control_d = data[13];
				clock_control_e = data[14];
				clock_control_f = data[15];
				if (SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_RF5C01A) {
					SAEF_ZFile_fread(rtc_alarm,0, RF5C01A_RAM_SIZE, 1, f);
					SAEF_ZFile_fread(rtc_memory,0, RF5C01A_RAM_SIZE, 1, f);
				}
				SAEF_ZFile_fclose(f);
			}
		}
	}
	this.write = function() { //write_battclock() called from cia.vsync()
		if (SAEV_config.chipset.rtc.type != SAEC_Config_RTC_Type_None) {
			//if (SAEV_config.chipset.rtc.file.length)
			{
				var f = null; //SAEF_ZFile_fopen(SAEV_config.chipset.rtc.file, "wb");
				if (f) {
					var ct = getct();
					var data = new Uint8Array(16);
					var od = clock_control_d;
					if (SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_RF5C01A)
						clock_control_d &= ~3;
					for (var i = 0; i < 13; i++)
						data[i] = getclockreg(i, ct);
					clock_control_d = od;
					data[i] = clock_control_d;
					data[i] = clock_control_e;
					data[i] = clock_control_f;
					SAEF_ZFile_fwrite(data,0, 16, 1, f);
					if (SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_RF5C01A) {
						SAEF_ZFile_fwrite(rtc_alarm,0, RF5C01A_RAM_SIZE, 1, f);
						SAEF_ZFile_fwrite(rtc_memory,0, RF5C01A_RAM_SIZE, 1, f);
					}
					SAEF_ZFile_fclose(f);
				}
			}
		}
	}

	/*---------------------------------*/

	this.hardreset = function() { //rtc_hardreset()
		switch (SAEV_config.chipset.rtc.type) {
			case SAEC_Config_RTC_Type_None: type = "none"; break;
			case SAEC_Config_RTC_Type_MSM6242B: type = "MSM6242B"; break;
			case SAEC_Config_RTC_Type_RF5C01A: type = "RF5C01A"; break;
			case SAEC_Config_RTC_Type_MSM6242B_A2000: type = "MSM6242B A2000"; break;
		}
		SAEF_log("rtc.hardreset() type '%s'", type);

		SAEV_RTC_delayed_write = 0;
		if (SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_MSM6242B || SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_MSM6242B_A2000) { /* MSM6242B */
			clock_control_d = 0x1;
			clock_control_e = 0;
			clock_control_f = 0x4; /* 24/12 */
			rtc_memory = null;
			rtc_alarm = null;
		} else if (SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_RF5C01A) { /* RF5C01A */
			clock_control_d = 0x8; /* Timer EN */
			clock_control_e = 0;
			clock_control_f = 0;
			rtc_memory = new Uint8Array(RF5C01A_RAM_SIZE);
			rtc_alarm = new Uint8Array(RF5C01A_RAM_SIZE);
			for (var i = 0; i < RF5C01A_RAM_SIZE; i++)
				rtc_memory[i] = rtc_alarm[i] = 0;

			rtc_alarm[10] = 1; /* 24H mode */
		}
		SAEV_RTC_bank.name = "Battery backed up clock ("+type+")";
		read();
	}

	/*---------------------------------*/

	function get32(addr) {
		if ((addr & 0xffff) >= 0x8000 && SAEV_config.chipset.fatGaryRev >= 0)
			return SAER.memory.dummyGet(addr, 4, false, 0);

		return ((get16(addr) << 16) | get16(addr + 2)) >>> 0;
	}

	function get16(addr) {
		if ((addr & 0xffff) >= 0x8000 && SAEV_config.chipset.fatGaryRev >= 0)
			return SAER.memory.dummyGet(addr, 2, false, 0);

		return (get8(addr) << 8) | get8(addr + 1);
	}

	function get8(addr) {
		if ((addr & 0xffff) >= 0x8000 && SAEV_config.chipset.fatGaryRev >= 0)
			return SAER.memory.dummyGet(addr, 1, false, 0);
		/*#ifdef CDTV
		if (currprefs.cs_cdtvram && (addr & 0xffff) >= 0x8000)
			return cdtv_battram_read(addr);
		#endif*/

		addr &= 0x3f;
		if ((addr & 3) == 2 || (addr & 3) == 0 || SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_None)
			return SAER.memory.dummyGet(addr, 1, false, 0);

		var ct = getct();
		return getclockreg(addr >> 2, ct);
	}

	function put32(addr, value) {
		if ((addr & 0xffff) >= 0x8000 && SAEV_config.chipset.fatGaryRev >= 0) {
			SAER.memory.dummyPut(addr, 4, value);
			return;
		}
		put16(addr, value >>> 16);
		put16(addr + 2, value & 0xffff);
	}

	function put16(addr, value) {
		if ((addr & 0xffff) >= 0x8000 && SAEV_config.chipset.fatGaryRev >= 0) {
			SAER.memory.dummyPut(addr, 2, value);
			return;
		}
		put8(addr, value >> 8);
		put8(addr + 1, value & 0xff);
	}

	function put8(addr, value) {
		if ((addr & 0xffff) >= 0x8000 && SAEV_config.chipset.fatGaryRev >= 0) {
			SAER.memory.dummyPut(addr, 1, value);
			return;
		}
		/*#ifdef CDTV
		if (currprefs.cs_cdtvram && (addr & 0xffff) >= 0x8000) {
			cdtv_battram_write(addr, value);
			return;
		}
		#endif*/

		addr &= 0x3f;
		if ((addr & 1) != 1 || SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_None)
			return;
		addr >>= 2;
		value &= 0x0f;
		if (SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_MSM6242B || SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_MSM6242B_A2000) { /* MSM6242B */
			if (RTC_DEBUG) SAEF_log("rtc.put8(0x%X, 0x%x)", addr, value);
			switch (addr) {
				case 0xD: clock_control_d = value & (1|8); break;
				case 0xE: clock_control_e = value; break;
				case 0xF: clock_control_f = value; break;
			}
		} else if (SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_RF5C01A) { /* RF5C01A */
			var bank = clock_control_d & 3;
			/* memory access */
			if (bank >= 2 && addr < 0x0d) {
				var ov = rtc_memory[addr];
				rtc_memory[addr] &= ((bank == 2) ? 0xf0 : 0x0f);
				rtc_memory[addr] |= value << ((bank == 2) ? 0 : 4);
				if (rtc_memory[addr] != ov) SAEV_RTC_delayed_write = -1;
				return;
			}
			/* alarm */
			if (bank == 1 && addr < 0x0d) {
				if (RTC_DEBUG) SAEF_log("rtc.put8(0x%X, 0x%x) ALARM", addr, value);
				var ov = rtc_alarm[addr];
				rtc_alarm[addr] = value;
				rtc_alarm[0] = rtc_alarm[1] = rtc_alarm[9] = rtc_alarm[12] = 0;
				rtc_alarm[3] &= ~0x8;
				rtc_alarm[5] &= ~0xc;
				rtc_alarm[6] &= ~0x8;
				rtc_alarm[8] &= ~0xc;
				rtc_alarm[10] &= ~0xe;
				rtc_alarm[11] &= ~0xc;
				if (rtc_alarm[addr] != ov) SAEV_RTC_delayed_write = -1;
				return;
			}
			if (RTC_DEBUG) SAEF_log("rtc.put8(0x%X, 0x%x)", addr, value);
			switch (addr) {
				case 0xD: clock_control_d = value; break;
				case 0xE: clock_control_e = value; break;
				case 0xF: clock_control_f = value; break;
			}
		}
		SAEV_RTC_delayed_write = -1;
	}

	SAEV_RTC_bank = new SAEO_Memory_addrbank(
		get32, get16, get8,
		put32, put16, put8,
		SAEF_Memory_defaultXLate, SAEF_Memory_defaultCheck, null, null, "Battery backed up clock (none)",
		SAEF_Memory_dummyGetInst32, SAEF_Memory_dummyGetInst16,
		//SAEC_Memory_addrbank_flag_IO, S_READ, S_WRITE, null, 0x3f, 0xd80000
		SAEC_Memory_addrbank_flag_IO, null, 0x3f, 0xd80000
	);
}
