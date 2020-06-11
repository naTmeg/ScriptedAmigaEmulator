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
/* global references */

var SAER_Expansion_expamem_bank = null;
var SAER_Expansion_z3fastmem_bank = null;

/*---------------------------------*/

function SAEO_Expansion() {
	const BOARD_AUTOCONFIG_Z2 = 2;
	const BOARD_AUTOCONFIG_Z3 = 3;
	const BOARD_NONAUTOCONFIG_BEFORE = 4;
	const BOARD_NONAUTOCONFIG_AFTER_Z2 = 5;
	const BOARD_NONAUTOCONFIG_AFTER_Z3 = 6;
	const BOARD_IGNORE = 7;

	const MAX_EXPANSION_BOARD_SPACE = 16;
	//const KS12_BOOT_HACK = 1;
	//const EXP_DEBUG = 0;

	/*---------------------------------*/
	/* 00 / 02 */
	/* er_Type */

	const Z2_MEM_8MB		= 0x00; /* Size of Memory Block */
	const Z2_MEM_4MB		= 0x07;
	const Z2_MEM_2MB		= 0x06;
	const Z2_MEM_1MB		= 0x05;
	const Z2_MEM_512KB	= 0x04;
	const Z2_MEM_256KB	= 0x03;
	const Z2_MEM_128KB	= 0x02;
	const Z2_MEM_64KB		= 0x01;
	/* extended definitions */
	const Z3_MEM_16MB		= 0x00;
	const Z3_MEM_32MB		= 0x01;
	const Z3_MEM_64MB		= 0x02;
	const Z3_MEM_128MB	= 0x03;
	const Z3_MEM_256MB	= 0x04;
	const Z3_MEM_512MB	= 0x05;
	const Z3_MEM_1GB		= 0x06;

	const chainedconfig	= 0x08; /* Next config is part of the same card */
	const rom_card			= 0x10; /* ROM vector is valid */
	const add_memory		= 0x20; /* Link RAM into free memory list */

	/* Type of Expansion Card */
	const protoautoconfig	= 0x40;
	const zorroII				= 0xc0;
	const zorroIII				= 0x80;

	/*---------------------------------*/
	/* 04 - 06 & 10-16 */

	/* Manufacturer */
	const commodore_g	= 513; /* Commodore Braunschweig (Germany) */
	const commodore	= 514; /* Commodore West Chester */
	const gvp			= 2017; /* GVP */
	const ass			= 2102; /* Advanced Systems & Software */
	const hackers_id	= 2011; /* Special ID for test cards */

	/* Card Type */
	const commodore_a2091		= 3; /* A2091 / A590 Card from C= */
	const commodore_a2091_ram	= 10; /* A2091 / A590 Ram on HD-Card */
	const commodore_a2232		= 70; /* A2232 Multiport Expansion */
	const ass_nexus_scsi			= 1; /* Nexus SCSI Controller */

	const gvp_series_2_scsi	= 11;
	const gvp_iv_24_gfx		= 32;

	/*---------------------------------*/
	/* 08 - 0A  */
	/* er_Flags */

	const Z3_SS_MEM_SAME			= 0x00;
	const Z3_SS_MEM_AUTO			= 0x01;
	const Z3_SS_MEM_64KB			= 0x02;
	const Z3_SS_MEM_128KB		= 0x03;
	const Z3_SS_MEM_256KB		= 0x04;
	const Z3_SS_MEM_512KB		= 0x05;
	const Z3_SS_MEM_1MB			= 0x06; /* Zorro III card subsize */
	const Z3_SS_MEM_2MB			= 0x07;
	const Z3_SS_MEM_4MB			= 0x08;
	const Z3_SS_MEM_6MB			= 0x09;
	const Z3_SS_MEM_8MB			= 0x0a;
	const Z3_SS_MEM_10MB			= 0x0b;
	const Z3_SS_MEM_12MB			= 0x0c;
	const Z3_SS_MEM_14MB			= 0x0d;
	const Z3_SS_MEM_defunct1	= 0x0e;
	const Z3_SS_MEM_defunct2	= 0x0f;

	const force_z3		= 0x10; /* *MUST* be set if card is Z3 */
	const ext_size		= 0x20; /* Use extended size table for bits 0-2 of er_Type */
	const no_shutup	= 0x40; /* Card cannot receive Shut_up_forever */
	const care_addr	= 0x80; /* Z2=Adress HAS to be $200000-$9fffff Z3=1->mem,0=io */

	/*---------------------------------*/
	/* 40-42 */
	/* ec_interrupt (unused) */

	const enable_irq	= 0x01; /* enable Interrupt */
	const reset_card	= 0x04; /* Reset of Expansion Card - must be 0 */
	const card_int2	= 0x10; /* READ ONLY: IRQ 2 active */
	const card_irq6	= 0x20; /* READ ONLY: IRQ 6 active */
	const card_irq7	= 0x40; /* READ ONLY: IRQ 7 active */
	const does_irq		= 0x80; /* READ ONLY: Card currently throws IRQ */

	/*---------------------------------*/
	/* ROM defines (DiagVec) */

	const rom_4bit		= (0x00<<14); /* ROM width */
	const rom_8bit		= (0x01<<14);
	const rom_16bit	= (0x02<<14);

	const rom_never	= (0x00<<12); /* Never run Boot Code */
	const rom_install	= (0x01<<12); /* run code at install time */
	const rom_binddrv	= (0x02<<12); /* run code with binddrivers */

	//var chipdone = false;

	/*const FILESYS_DIAGPOINT = 0x01e0;
	const FILESYS_BOOTPOINT = 0x01e6;
	const FILESYS_DIAGAREA = 0x2000;
	uaecptr ROM_filesys_resname, ROM_filesys_resid;
	uaecptr ROM_filesys_diagentry;
	uaecptr ROM_hardfile_resname, ROM_hardfile_resid;
	uaecptr ROM_hardfile_init;*/

	/*---------------------------------*/

	function card_data() {
		this.initrc = null; //addrbank *(*initrc)(struct romconfig*);
		this.initnum = null; //addrbank *(*initnum)(int);
		this.map = null; //addrbank *(*map)(void);
		this.rc = null; //struct romconfig *
		this.name = "";
		this.flags = 0;
		this.zorro = 0;
	}
	var cards = new Array(MAX_EXPANSION_BOARD_SPACE);
	for (var vi = 0; vi < MAX_EXPANSION_BOARD_SPACE; vi++)
		cards[vi] = new card_data();

	var ecard = 0, cardno = 0, cardid = 0;

	/* Autoconfig address space at 0xE80000 */
	const Z3BASE_UAE = 0x10000000;
	const Z3BASE_REAL = 0x40000000;

	var expamem = new Uint8Array(65536);
	var expamem_lo = 0; //u8
	var expamem_hi = 0; //u16
	var expamem_z2_pointer = 0;
	var expamem_z2_size = 0;
	var expamem_z3_pointer = 0;
	var expamem_z3_size = 0;
	var expamem_z3_sum = 0;
	var expamem_board_size = 0;
	var expamem_board_pointer = 0
	var expamem_bank_current = null;

	var z3hack_override = false;
	//var z3num = 0;

	/*-----------------------------------------------------------------------*/
	/* Autoconfig base */

	function isnonautoconfig(v) {
		return v == BOARD_NONAUTOCONFIG_AFTER_Z2 ||
			v == BOARD_NONAUTOCONFIG_AFTER_Z3 ||
			v == BOARD_NONAUTOCONFIG_BEFORE;
	}

	/* Ugly hack for >2M chip RAM in single pool
	 * We can't add it any later or early boot menu
	 * stops working because it sets kicktag at the end
	 * of chip ram...
	 */
	/*function addextrachip(sysbase) {
		var cs = SAEV_config.memory.chipSize;
		if (cs <= 0x00200000)
			return;
		if (sysbase & 0x80000001)
			return;
		if (!SAER_Memory_check(sysbase, 1000))
			return;
		var ml = SAER_Memory_get32(sysbase + 322);
		if (!SAER_Memory_check(ml, 32))
			return;
		var next = 0;
		while ((next = SAER_Memory_get32(ml))) {
			if (!SAER_Memory_check(ml, 32))
				return;
			var upper = SAER_Memory_get32(ml + 24);
			var lower = SAER_Memory_get32(ml + 20);
			if (lower & 0xffff0000) {
				ml = next;
				continue;
			}
			var attr = SAER_Memory_get16(ml + 14);
			if ((attr & 0x8002) != 2) {
				ml = next;
				continue;
			}
			if (upper >= cs)
				return;
			var added = cs - upper;
			var first = SAER_Memory_get32(ml + 16);
			SAER_Memory_put32(ml + 24, cs); // mh_Upper
			SAER_Memory_put32(ml + 28, SAER_Memory_get32(ml + 28) + added); // mh_Free
			while (first) {
				next = first;
				first = SAER_Memory_get32(next);
			}
			var bytes = SAER_Memory_get32(next + 4);
			if (next + bytes == 0x00200000) {
				SAER_Memory_put32 (next + 4, cs - next);
			} else {
				SAER_Memory_put32(0x00200000 + 0, 0);
				SAER_Memory_put32(0x00200000 + 4, added);
				SAER_Memory_put32(next, 0x00200000);
			}
			return;
		}
	}*/

	/*this.set_expamem_z3_hack_override = function(overridenoz3hack) {
		z3hack_override = overridenoz3hack;
	}*/
	function expamem_z3hack(p) {
		if (z3hack_override) return false;
		return p.memory.z3Mapping == SAEC_Config_Memory_z3Mapping_Auto || p.memory.z3Mapping == SAEC_Config_Memory_z3Mapping_SAE; // || cpuboard_memorytype(p) == BOARD_MEMORY_BLIZZARD_12xx;
	}

	function expamem_map_clear() {
		SAEF_warn("expamem_map_clear() got called. Shouldn't happen.");
		return null;
	}

	function expamem_init_clear() {
		//memset(expamem, 0xff, sizeof expamem);
		SAEF_memset(expamem,0, 0xff, 65536);
	}
	/* autoconfig area is "non-existing" after last device */
	function expamem_init_clear_zero() {
		SAER_Memory_mapBanks(SAEV_Memory_dummyBank, 0xe8, 1, 0);
		if (!SAEV_config.cpu.addressSpace24)
			SAER_Memory_mapBanks(SAEV_Memory_dummyBank, 0xff000000 >>> 16, 1, 0);
	}

	function expamem_init_clear2() {
		expamem_bank.name = "Autoconfig Z2";
		expamemz3_bank.name = "Autoconfig Z3";
		expamem_init_clear_zero();
		ecard = cardno;
	}

	function expamem_init_last() {
		expamem_init_clear2();
		SAEF_log("Memory map after autoconfig:");
		SAER.memory.map_dump();
		return null;
	}

	function expamem_read(addr) {
		var b = (expamem[addr] & 0xf0) | (expamem[addr + 2] >> 4);
		if (addr == 0 || addr == 2 || addr == 0x40 || addr == 0x42)
			return b;
		b = ~b;
		return b & 0xff;
	}

	function expamem_write(addr, value) {
		addr &= 0xffff;
		if (addr == 0 || addr == 2 || addr == 0x40 || addr == 0x42) {
			expamem[addr] = (value & 0xf0);
			expamem[addr + 2] = (value & 0x0f) << 4;
		} else {
			expamem[addr] = ~(value & 0xf0);
			expamem[addr + 2] = ~((value & 0x0f) << 4);
		}
	}

	function expamem_type() {
		return expamem_read(0) & 0xc0;
	}

	function call_card_init(index) {
		var ab;

		expamem_bank.name = cards[ecard].name ? cards[ecard].name : "None";
		if (cards[ecard].initnum)
			ab = cards[ecard].initnum(0);
		else
			ab = cards[ecard].initrc(cards[ecard].rc);

		expamem_z3_size = 0;
		/*if (ab === expamem_none) { //cpu-boards
			expamem_init_clear();
			expamem_init_clear_zero();
			SAER_Memory_mapBanks(expamem_bank, 0xE8, 1, 0);
			if (!SAEV_config.cpu.addressSpace24)
				SAER_Memory_mapBanks(SAEV_Memory_dummyBank, 0xff000000 >>> 16, 1, 0);
			expamem_bank_current = null;
			return;
		}*/
		if (ab === false) { //expamem_null) {
			expamem_next(null, null);
			return;
		}

		var abe = ab;
		if (abe === null)
			abe = expamem_bank;
		if (abe !== expamem_bank) {
			for (var i = 0; i < 16 * 4; i++)
				expamem[i] = abe.get8(i);
		}

		var code = expamem_read(0);
		if ((code & 0xc0) == zorroII) {
			// Z2
			code &= 7;
			if (code == 0)
				expamem_z2_size = 8 * 1024 * 1024;
			else
				expamem_z2_size = 32768 << code;

			expamem_board_size = expamem_z2_size;
			expamem_board_pointer = expamem_z2_pointer;

		} else if ((code & 0xc0) == zorroIII) {
			// Z3
			if (expamem_z3_sum < Z3BASE_UAE) {
				expamem_z3_sum = SAEV_config.memory.z3AutoConfigStart;
				if (SAEV_config.memory.ramsey.highSize >= 128 * 1024 * 1024 && expamem_z3_sum == Z3BASE_UAE)
					expamem_z3_sum += (SAEV_config.memory.ramsey.highSize - 128 * 1024 * 1024) + 16 * 1024 * 1024;
				if (!expamem_z3hack(SAEV_config))
					expamem_z3_sum = Z3BASE_REAL;
				//if (expamem_z3_sum == Z3BASE_UAE)
				//	expamem_z3_sum += currprefs.z3chipmem_size;
			}

			expamem_z3_pointer = expamem_z3_sum;

			code &= 7;
			if (expamem_read(8) & ext_size)
				expamem_z3_size = (16 * 1024 * 1024) << code;
			else
				expamem_z3_size = 16 * 1024 * 1024;
			expamem_z3_sum += expamem_z3_size;

			var expamem_z3_pointer_old = expamem_z3_pointer;
			// align 32M boards (FastLane is 32M and needs to be aligned)
			if (expamem_z3_size <= 32 * 1024 * 1024)
				expamem_z3_pointer = ((expamem_z3_pointer + expamem_z3_size - 1) & ~(expamem_z3_size - 1)) >>> 0;

			expamem_z3_sum += expamem_z3_pointer - expamem_z3_pointer_old;

			expamem_board_size = expamem_z3_size;
			expamem_board_pointer = expamem_z3_pointer;

		} else if ((code & 0xc0) == 0x40) {
			// 0x40 = "Box without init/diagnostic code"
			// proto autoconfig "box" size.
			//expamem_z2_size = (1 << ((code >> 3) & 7)) * 4096;
			// much easier this way, all old-style boards were made for
			// A1000 and didn"t have passthrough connector.
			expamem_z2_size = 65536;
			expamem_board_size = expamem_z2_size;
			expamem_board_pointer = expamem_z2_pointer;
		}

		if (ab !== null) {
			// non-null: not using expamem_bank
			expamem_bank_current = ab;
			if ((cards[ecard].flags & 1) && SAEV_config.chipset.z3AutoConfig && !SAEV_config.cpu.addressSpace24) {
				SAER_Memory_mapBanks(expamemz3_bank, 0xff000000 >>> 16, 1, 0);
				SAER_Memory_mapBanks(SAEV_Memory_dummyBank, 0xE8, 1, 0);
			} else {
				SAER_Memory_mapBanks(expamem_bank, 0xE8, 1, 0);
				if (!SAEV_config.cpu.addressSpace24)
					SAER_Memory_mapBanks(SAEV_Memory_dummyBank, 0xff000000 >>> 16, 1, 0);
			}
		} else {
			if ((cards[ecard].flags & 1) && SAEV_config.chipset.z3AutoConfig && !SAEV_config.cpu.addressSpace24) {
				expamem_bank_current = expamem_bank;
				SAER_Memory_mapBanks(expamemz3_bank, 0xff000000 >>> 16, 1, 0);
				SAER_Memory_mapBanks(SAEV_Memory_dummyBank, 0xE8, 1, 0);
			} else {
				expamem_bank_current = null;
				SAER_Memory_mapBanks(expamem_bank, 0xE8, 1, 0);
				if (!SAEV_config.cpu.addressSpace24)
					SAER_Memory_mapBanks(SAEV_Memory_dummyBank, 0xff000000 >>> 16, 1, 0);
			}
		}
	}

	function boardmessage(mapped, success) {
		var type = expamem_read(0);
		var size = expamem_board_size;
		var sizemod = "K";

		//size /= 1024;
		size >>>= 10;
		if (size > 8 * 1024) {
			sizemod = "M";
			//size /= 1024;
			size >>>= 10;
		}
		SAEF_log("memory.boardmessage() Card %d: Z%d 0x%08x %4d%s %s %s%s",
			ecard + 1, (type & 0xc0) == zorroII ? 2 : ((type & 0xc0) == zorroIII ? 3 : 1),
			expamem_board_pointer, size, sizemod,
			type & rom_card ? "ROM" : (type & add_memory ? "RAM" : "IO "),
			mapped.name,
			success ? "" : " SHUT UP"
		);
		/*#if 0
		for (var i = 0; i < 16; i++) {
			SAEF_log("%s%02X", i > 0 ? "." : "", expamem_read(i * 4));
		}
		SAEF_log("\n");
		#endif*/
	}

	function expamem_shutup(mapped) {
		if (mapped)
			boardmessage(mapped, false);
	}

	function expamem_next(mapped, next) {
		if (mapped)
			boardmessage(mapped, true);

		expamem_init_clear();
		expamem_init_clear_zero();
		for (;;) {
			++ecard;
			if (ecard >= cardno)
				break;
			var ec = cards[ecard];
			if (ec.initrc && isnonautoconfig(ec.zorro)) {
				ec.initrc(cards[ecard].rc);
			} else {
				call_card_init(ecard);
				break;
			}
		}
		if (ecard >= cardno) {
			expamem_init_clear2();
			expamem_init_last();
		}
	}

	/*-----------------------------------------------------------------------*/
	/* BANK Z2-Fast memory */

	function fastmem_get32(addr) {
		addr = (addr & fastmem_bank.mask) >>> 0;
		//var m = fastmem_bank.baseaddr + addr; return do_get_mem_long ((uae_u32 *)m);
		return ((fastmem_bank.baseaddr[addr] << 24) | (fastmem_bank.baseaddr[addr+1] << 16) | (fastmem_bank.baseaddr[addr+2] << 8) | fastmem_bank.baseaddr[addr+3]) >>> 0;
	}
	function fastmem_get16(addr) {
		addr = (addr & fastmem_bank.mask) >>> 0;
		//var m = fastmem_bank.baseaddr + addr; return do_get_mem_word ((uae_u16 *)m);
		return (fastmem_bank.baseaddr[addr] << 8) | fastmem_bank.baseaddr[addr+1];
	}
	function fastmem_get8(addr) {
		addr = (addr & fastmem_bank.mask) >>> 0;
		return fastmem_bank.baseaddr[addr];
	}
	function fastmem_put32(addr, l) {
		addr = (addr & fastmem_bank.mask) >>> 0;
		//var m = fastmem_bank.baseaddr + addr; do_put_mem_long ((uae_u32 *)m, l);
		fastmem_bank.baseaddr[addr] = l >>> 24;
		fastmem_bank.baseaddr[addr+1] = (l >>> 16) & 0xff;
		fastmem_bank.baseaddr[addr+2] = (l >>> 8) & 0xff;
		fastmem_bank.baseaddr[addr+3] = l & 0xff;
	}
	function fastmem_put16(addr, w) {
		addr = (addr & fastmem_bank.mask) >>> 0;
		//var m = fastmem_bank.baseaddr + addr; do_put_mem_word ((uae_u16 *)m, w);
		fastmem_bank.baseaddr[addr] = w >> 8;
		fastmem_bank.baseaddr[addr+1] = w & 0xff;
	}
	function fastmem_put8(addr, b) {
		addr = (addr & fastmem_bank.mask) >>> 0;
		fastmem_bank.baseaddr[addr] = b;
	}
	function fastmem_check(addr, size) {
		addr = (addr & fastmem_bank.mask) >>> 0;
		return (addr + size) <= fastmem_bank.allocated;
	}
	function fastmem_xlate(addr) {
		addr = (addr & fastmem_bank.mask) >>> 0;
		//return fastmem_bank.baseaddr + addr;
		return addr;
	}
	var fastmem_bank = new SAEO_Memory_addrbank(
		fastmem_get32, fastmem_get16, fastmem_get8,
		fastmem_put32, fastmem_put16, fastmem_put8,
		fastmem_xlate, fastmem_check, null, "fast", "Fast memory",
		fastmem_get32, fastmem_get16,
		//SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE, 0, 0
		SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE
	);

	/*---------------------------------*/

	/*var fastmem2_bank = new SAEO_Memory_addrbank(
		fastmem2_get32, fastmem2_get16, fastmem2_get8,
		fastmem2_put32, fastmem2_put16, fastmem2_put8,
		fastmem2_xlate, fastmem2_check, null, "fast2", "Fast memory 2",
		fastmem2_get32, fastmem2_get16,
		//SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE, 0, 0
		SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE
	};*/

	/*-----------------------------------------------------------------------*/

	function fastmem_autoconfig(boardnum, zorro, type, serial, allocated) {
		var mid = 0;
		var pid;
		var flags = care_addr;
		//DEVICE_MEMORY_CALLBACK dmc = null;
		//struct romconfig *dmc_rc = null;
		var ac = new Uint8Array(16);

		/*if (boardnum == 1) {

		} else if (boardnum == 0) {
			for (int i = 0; expansionroms[i].name; i++) {
				const struct expansionromtype *erc = &expansionroms[i];
				if (((erc->zorro == zorro) || (zorro < 0 && erc->zorro >= BOARD_NONAUTOCONFIG_BEFORE)) && cfgfile_board_enabled(&currprefs, erc->romtype, 0)) {
					struct romconfig *rc = get_device_romconfig(&currprefs, erc->romtype, 0);
					if (erc->subtypes) {
						const struct expansionsubromtype *srt = &erc->subtypes[rc->subtype];
						if (srt->memory_mid) {
							mid = srt->memory_mid;
							pid = srt->memory_pid;
							serial = srt->memory_serial;
							if (!srt->memory_after)
								type |= chainedconfig;
						}
					} else {
						if (erc->memory_mid) {
							mid = erc->memory_mid;
							pid = erc->memory_pid;
							serial = erc->memory_serial;
							if (!erc->memory_after)
								type |= chainedconfig;
						}
					}
					dmc = erc->memory_callback;
					dmc_rc = rc;
					break;
				}
			}
		}*/

		if (!mid) {
			if (zorro <= 2) {
				//pid = SAEV_config.memory.maprom ? 1 : 81;
				pid = 81;
			} else {
				var subsize = (allocated == 0x100000 ? Z3_SS_MEM_1MB
								: allocated == 0x200000 ? Z3_SS_MEM_2MB
								: allocated == 0x400000 ? Z3_SS_MEM_4MB
								: allocated == 0x800000 ? Z3_SS_MEM_8MB
								: Z3_SS_MEM_SAME);

				//pid = SAEV_config.memory.maprom ? 3 : 83;
				pid = 83;
				flags |= force_z3 | (allocated > 0x800000 ? ext_size : subsize);
			}
			mid = cardid;
		}

		ac[0x00 / 4] = type;
		ac[0x04 / 4] = pid;
		ac[0x08 / 4] = flags;
		ac[0x10 / 4] = mid >> 8;
		ac[0x14 / 4] = mid & 0xff;
		ac[0x18 / 4] = serial >>> 24;
		ac[0x1c / 4] = (serial >>> 16) & 0xff;
		ac[0x20 / 4] = (serial >>> 8) & 0xff;
		ac[0x24 / 4] = serial & 0xff;

		//if (dmc && dmc_rc) dmc(dmc_rc, ac, allocated);

		expamem_write(0x00, ac[0x00 / 4]);
		expamem_write(0x04, ac[0x04 / 4]);
		expamem_write(0x08, ac[0x08 / 4]);
		expamem_write(0x10, ac[0x10 / 4]);
		expamem_write(0x14, ac[0x14 / 4]);

		expamem_write(0x18, ac[0x18 / 4]); /* ser.no. Byte 0 */
		expamem_write(0x1c, ac[0x1c / 4]); /* ser.no. Byte 1 */
		expamem_write(0x20, ac[0x20 / 4]); /* ser.no. Byte 2 */
		expamem_write(0x24, ac[0x24 / 4]); /* ser.no. Byte 3 */

		expamem_write(0x28, 0x00); /* ROM-Offset hi */
		expamem_write(0x2c, 0x00); /* ROM-Offset lo */

		expamem_write(0x40, 0x00); /* Ctrl/Statusreg.*/
	}

	/*---------------------------------*/
	/* Expansion Card (ZORRO II) */

	function expamem_map_fastcard_2(boardnum) {
		var start = ((expamem_hi | (expamem_lo >> 4)) << 16) >>> 0;
		//var ab = fastbanks[boardnum * 2 + ((start < 0x00A00000) ? 0 : 1)];
		var ab = fastmem_bank;
		var size = ab.allocated;
		ab.start = start;
		if (ab.start)
			SAER.memory.map_banks_z2(ab, ab.start >>> 16, size >>> 16);

		return ab;
	}

	function expamem_init_fastcard_2(boardnum) {
		var type = add_memory | zorroII;
		//var allocated = boardnum ? fastmem2_bank.allocated : fastmem_bank.allocated;
		var allocated = fastmem_bank.allocated;
		var serial = 1;

		if (allocated == 0)
			return false; //expamem_null;

		expamem_init_clear();

		     if (allocated == 65536) type |= Z2_MEM_64KB;
		else if (allocated == 131072) type |= Z2_MEM_128KB;
		else if (allocated == 262144) type |= Z2_MEM_256KB;
		else if (allocated == 524288) type |= Z2_MEM_512KB;
		else if (allocated == 0x100000) type |= Z2_MEM_1MB;
		else if (allocated == 0x200000) type |= Z2_MEM_2MB;
		else if (allocated == 0x400000) type |= Z2_MEM_4MB;
		else if (allocated == 0x800000) type |= Z2_MEM_8MB;

		/*if (boardnum == 1) {
			const a2630_autoconfig = [ 0xe7, 0x51, 0x40, 0x00, 0x02, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ];

			if (ISCPUBOARD(BOARD_COMMODORE, BOARD_COMMODORE_SUB_A26x0)) {
				for (int i = 1; i < 16; i++)
					expamem_write(i * 4, a2630_autoconfig[i]);
				type &= 7;
				type |= a2630_autoconfig[0] & ~7;
				expamem_write(0, type);
				return null;
			}
		}*/

		fastmem_autoconfig(boardnum, BOARD_AUTOCONFIG_Z2, type, serial, allocated);
		fastmem_autoconfig(boardnum, -1, type, serial, allocated);
		return null;
	}

	function expamem_init_fastcard(boardnum) {
		return expamem_init_fastcard_2(0);
	}
	function expamem_map_fastcard() {
		return expamem_map_fastcard_2(0);
	}

	/*function expamem_init_fastcard2(boardnum) {
		return expamem_init_fastcard_2(1);
	}
	function expamem_map_fastcard2() {
		return expamem_map_fastcard_2(1);
	}*/

	/*this.expansion_is_next_board_fastram = function() {
		return ecard + 1 < MAX_EXPANSION_BOARD_SPACE && cards[ecard + 1].map == expamem_map_fastcard;
	}*/

	/*---------------------------------*/
	/* Expansion Card (Zorro III) */

	function expamem_map_z3fastmem_2(bank, ptr, size, allocated, chip) {
		var z3fs = expamem_z3_pointer;
		var start = ptr.start;

		if (expamem_z3hack(SAEV_config)) {
			if (z3fs && start != z3fs) {
				SAEF_warn("memory.expamem_map_z3fastmem_2() Z3MEM mapping changed from $%08x to $%08x", start, z3fs);
				map_banks(SAEV_Memory_dummyBank, start >>> 16, size >>> 16, allocated);
				ptr.start = z3fs;
				SAER.memory.map_banks_z3(bank, start >>> 16, size >>> 16);
			}
		} else {
			SAER.memory.map_banks_z3(bank, z3fs >>> 16, size >>> 16);
			//start = z3fs; //OWN unneeded
			ptr.start = z3fs;
		}
		return bank;
	}
	function expamem_map_z3fastmem() {
		var ptr = { start:z3fastmem_bank.start };
		var bank = expamem_map_z3fastmem_2(z3fastmem_bank, ptr, SAEV_config.memory.z3FastSize, z3fastmem_bank.allocated, 0);
		z3fastmem_bank.start = ptr.start;
		return bank;
	}
	/*function expamem_map_z3fastmem2() {
		var ptr = { start:z3fastmem2_bank.start };
		var bank = expamem_map_z3fastmem_2(z3fastmem2_bank, ptr, currprefs.z3fastmem2_size, z3fastmem2_bank.allocated, 0);
		z3fastmem2_bank.start = ptr.start;
		return bank;
	}*/

	function expamem_init_z3fastmem_2(boardnum, bank, start, size, allocated) {
		var code = (allocated == 0x100000 ? Z2_MEM_1MB
			: allocated == 0x200000 ? Z2_MEM_2MB
			: allocated == 0x400000 ? Z2_MEM_4MB
			: allocated == 0x800000 ? Z2_MEM_8MB
			: allocated == 0x1000000 ? Z3_MEM_16MB
			: allocated == 0x2000000 ? Z3_MEM_32MB
			: allocated == 0x4000000 ? Z3_MEM_64MB
			: allocated == 0x8000000 ? Z3_MEM_128MB
			: allocated == 0x10000000 ? Z3_MEM_256MB
			: allocated == 0x20000000 ? Z3_MEM_512MB
			: Z3_MEM_1GB);

		if (allocated < 0x1000000)
			code = Z3_MEM_16MB; /* Z3 physical board size is always at least 16M */

		expamem_init_clear();
		fastmem_autoconfig(boardnum, BOARD_AUTOCONFIG_Z3, add_memory | zorroIII | code, 1, allocated);
		SAER.memory.map_banks_z3(bank, start >>> 16, size >>> 16);
		return null;
	}
	function expamem_init_z3fastmem(devnum) {
		return expamem_init_z3fastmem_2(0, z3fastmem_bank, z3fastmem_bank.start, SAEV_config.memory.z3FastSize, z3fastmem_bank.allocated);
	}
	/*function expamem_init_z3fastmem2(devnum) {
		return expamem_init_z3fastmem_2(1, z3fastmem2_bank, z3fastmem2_bank.start, currprefs.z3fastmem2_size, z3fastmem2_bank.allocated);
	}*/

	/*---------------------------------*/
	/* BANK Z3 memory */

	function z3fastmem_get32(addr) {
		addr = (addr & z3fastmem_bank.mask) >>> 0;
		//var m = z3fastmem_bank.baseaddr + addr; return do_get_mem_long ((uae_u32 *)m);
		return ((z3fastmem_bank.baseaddr[addr] << 24) | (z3fastmem_bank.baseaddr[addr+1] << 16) | (z3fastmem_bank.baseaddr[addr+2] << 8) | z3fastmem_bank.baseaddr[addr+3]) >>> 0;
	}
	function z3fastmem_get16(addr) {
		addr = (addr & z3fastmem_bank.mask) >>> 0;
		//var m = z3fastmem_bank.baseaddr + addr; return do_get_mem_word ((uae_u16 *)m);
		return (z3fastmem_bank.baseaddr[addr] << 8) | z3fastmem_bank.baseaddr[addr+1];
	}
	function z3fastmem_get8(addr) {
		addr = (addr & z3fastmem_bank.mask) >>> 0;
		return z3fastmem_bank.baseaddr[addr];
	}
	function z3fastmem_put32(addr, l) {
		addr = (addr & z3fastmem_bank.mask) >>> 0;
		//var m = z3fastmem_bank.baseaddr + addr; do_put_mem_long ((uae_u32 *)m, l);
		z3fastmem_bank.baseaddr[addr] = l >>> 24;
		z3fastmem_bank.baseaddr[addr+1] = (l >>> 16) & 0xff;
		z3fastmem_bank.baseaddr[addr+2] = (l >>> 8) & 0xff;
		z3fastmem_bank.baseaddr[addr+3] = l & 0xff;
	}
	function z3fastmem_put16(addr, w) {
		addr = (addr & z3fastmem_bank.mask) >>> 0;
		//var m = z3fastmem_bank.baseaddr + addr; do_put_mem_word ((uae_u16 *)m, w);
		z3fastmem_bank.baseaddr[addr] = w >> 8;
		z3fastmem_bank.baseaddr[addr+1] = w & 0xff;
	}
	function z3fastmem_put8(addr, b) {
		addr = (addr & z3fastmem_bank.mask) >>> 0;
		z3fastmem_bank.baseaddr[addr] = b;
	}
	function z3fastmem_check(addr, size) {
		addr = (addr & z3fastmem_bank.mask) >>> 0;
		return (addr + size) <= z3fastmem_bank.allocated;
	}
	function z3fastmem_xlate(addr) {
		addr = (addr & z3fastmem_bank.mask) >>> 0;
		//return z3fastmem_bank.baseaddr + addr;
		return addr;
	}
	var z3fastmem_bank = new SAEO_Memory_addrbank(
		z3fastmem_get32, z3fastmem_get16, z3fastmem_get8,
		z3fastmem_put32, z3fastmem_put16, z3fastmem_put8,
		z3fastmem_xlate, z3fastmem_check, null, "z3", "Zorro III Fast RAM",
		z3fastmem_get32, z3fastmem_get16,
		//SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE, 0, 0
		SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE
	);
	SAER_Expansion_z3fastmem_bank = z3fastmem_bank;

	/*MEMORY_FUNCTIONS(z3fastmem2);
	var z3fastmem2_bank = new SAEO_Memory_addrbank(
		z3fastmem2_get32, z3fastmem2_get16, z3fastmem2_get8,
		z3fastmem2_put32, z3fastmem2_put16, z3fastmem2_put8,
		z3fastmem2_xlate, z3fastmem2_check, null, "z3_2", "Zorro III Fast RAM #2",
		z3fastmem2_get32, z3fastmem2_get16,
		//SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE, 0, 0
		SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE
	);

	MEMORY_FUNCTIONS(z3chipmem);
	var z3chipmem_bank = new SAEO_Memory_addrbank(
		z3chipmem_get32, z3chipmem_get16, z3chipmem_get8,
		z3chipmem_put32, z3chipmem_put16, z3chipmem_put8,
		z3chipmem_xlate, z3chipmem_check, null, "z3_chip", "MegaChipRAM",
		z3chipmem_get32, z3chipmem_get16,
		//SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE, 0, 0
		SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE
	);*/

	/*-----------------------------------------------------------------------*/
	/* Autoconfig setup/cleanup/reset */

	function mapped_malloc(ab) {
		ab.startmask = ab.start;
		try {
			//ab.baseaddr = xcalloc(uae_u8, ab.allocated + 4);
			ab.baseaddr = new Uint8Array(ab.allocated + 4);
			return true;
		} catch (e) {
			ab.baseaddr = null;
			return false;
		}
	}
	function mapped_free(ab) {
		//xfree(ab.baseaddr);
		ab.baseaddr = null;
	}

	function free_fastmemory(boardnum) {
		if (boardnum == 0)
			mapped_free(fastmem_bank);
		//else
			//mapped_free(fastmem2_bank);
	}
	this.free_fastmemory_ext = function(boardnum) {
		free_fastmemory(boardnum);
	}

	//function mapped_malloc_dynamic(curr, changed, bank, max, name) {
	function mapped_malloc_dynamic(curr, bank, max, name) {
		var alloc = curr.size;

		bank.allocated = 0;
		bank.baseaddr = null;
		bank.mask = 0;

		if (!alloc)
			return false;

		while (alloc >= max * 1024 * 1024) {
			bank.mask = alloc - 1;
			bank.allocated = alloc;
			bank.label = name;
			if (mapped_malloc(bank)) {
				curr.size = alloc;
				//changed.size = alloc;
				return true;
			}
			SAEF_warn("expansion.mapped_malloc_dynamic() out of memory for '%s'. (%d bytes)", name, alloc);
			alloc >>>= 1;
		}
		return false;
	}

	/*uaecptr expansion_startaddress(uaecptr addr, uae_u32 size) {
		if (!size)
			return addr;
		if (size < 16 * 1024 * 1024)
			size = 16 * 1024 * 1024;
		if (!expamem_z3hack(SAEV_config))
			return (addr + size - 1) & ~(size - 1);
		return addr;
	}*/

	function allocate() { //allocate_expamem
		/*z3chipmem_bank.start = Z3BASE_UAE;
		if (SAEV_config.memory.ramsey.highSize >= 128 * 1024 * 1024)
			z3chipmem_bank.start += (SAEV_config.memory.ramsey.highSize - 128 * 1024 * 1024) + 16 * 1024 * 1024;*/

		z3fastmem_bank.start = SAEV_config.memory.z3AutoConfigStart;
		if (!expamem_z3hack(SAEV_config))
			z3fastmem_bank.start = Z3BASE_REAL;
		if (z3fastmem_bank.start == Z3BASE_UAE) {
			if (SAEV_config.memory.ramsey.highSize >= 128 * 1024 * 1024)
				z3fastmem_bank.start += (SAEV_config.memory.ramsey.highSize - 128 * 1024 * 1024) + 16 * 1024 * 1024;
			//z3fastmem_bank.start += currprefs.z3chipmem_size;
		}
		/*z3fastmem2_bank.start = z3fastmem_bank.start + SAEV_config.memory.z3FastSize;

		if (currprefs.z3chipmem_size && z3fastmem_bank.start - z3chipmem_bank.start < currprefs.z3chipmem_size)
			currprefs.z3chipmem_size = changed_prefs.z3chipmem_size = 0;*/

		if (fastmem_bank.allocated != SAEV_config.memory.z2FastSize) {
			free_fastmemory(0);

			fastmem_bank.allocated = SAEV_config.memory.z2FastSize;
			fastmem_bank.mask = fastmem_bank.allocated - 1;

			//fastmem_nojit_bank.allocated = fastmem_bank.allocated;
			//fastmem_nojit_bank.mask = fastmem_bank.mask;

			if (fastmem_bank.allocated) {
				mapped_malloc(fastmem_bank);
				/*fastmem_nojit_bank.baseaddr = fastmem_bank.baseaddr;
				if (fastmem_bank.baseaddr == 0) {
					SAEF_error("Out of memory for fastmem card.");
					fastmem_bank.allocated = 0;
					fastmem_nojit_bank.allocated = 0;
				}*/
			}
			SAER.memory.hardreset(1);
		}

		/*if (fastmem2_bank.allocated != currprefs.fastmem2_size) {
			free_fastmemory(1);

			fastmem2_bank.allocated = currprefs.fastmem2_size;
			fastmem2_bank.mask = fastmem2_bank.allocated - 1;

			fastmem2_nojit_bank.allocated = fastmem2_bank.allocated;
			fastmem2_nojit_bank.mask = fastmem2_bank.mask;

			if (fastmem2_bank.allocated) {
				mapped_malloc (&fastmem2_bank);
				fastmem2_nojit_bank.baseaddr = fastmem2_bank.baseaddr;
				if (fastmem2_bank.baseaddr == 0) {
					SAEF_error("Out of memory for fastmem2 card.");
					fastmem2_bank.allocated = 0;
					fastmem2_nojit_bank.allocated = 0;
				}
			}
			SAER.memory.hardreset(1);
		}*/

		if (z3fastmem_bank.allocated != SAEV_config.memory.z3FastSize) {
			mapped_free(z3fastmem_bank);
			//mapped_malloc_dynamic(SAEV_config.memory.z3FastSize, &changed_prefs.z3fastmem_size, z3fastmem_bank, 1, "z3");
			var curr = { size:SAEV_config.memory.z3FastSize };
			mapped_malloc_dynamic(curr, z3fastmem_bank, 1, "z3");
			SAEV_config.memory.z3FastSize = curr.size;
			SAER.memory.hardreset(1);
		}
		/*if (z3fastmem2_bank.allocated != currprefs.z3fastmem2_size) {
			mapped_free (&z3fastmem2_bank);

			z3fastmem2_bank.allocated = currprefs.z3fastmem2_size;
			z3fastmem2_bank.mask = z3fastmem2_bank.allocated - 1;

			if (z3fastmem2_bank.allocated) {
				mapped_malloc (&z3fastmem2_bank);
				if (z3fastmem2_bank.baseaddr == 0) {
					SAEF_error("Out of memory for 32 bit fast memory #2.");
					z3fastmem2_bank.allocated = 0;
				}
			}
			SAER.memory.hardreset(1);
		}
		if (z3chipmem_bank.allocated != currprefs.z3chipmem_size) {
			mapped_free (&z3chipmem_bank);
			mapped_malloc_dynamic(&currprefs.z3chipmem_size, &changed_prefs.z3chipmem_size, &z3chipmem_bank, 16, "z3_chip");
			SAER.memory.hardreset(1);
		}*/
	}

	/*-----------------------------------------------------------------------*/

	/*static bool add_fastram_after_expansion(int zorro)
	{
		for (int i = 0; expansionroms[i].name; i++) {
			const struct expansionromtype *ert = &expansionroms[i];
			if (ert->zorro == zorro) {
				for (int j = 0; j < MAX_DUPLICATE_EXPANSION_BOARDS; j++) {
					struct romconfig *rc = get_device_romconfig(&currprefs, ert->romtype, j);
					if (rc) {
						if (ert->subtypes) {
							const struct expansionsubromtype *srt = &ert->subtypes[rc->subtype];
							return srt->memory_after;
						}
						return ert->memory_after;
					}
				}
			}
		}
		return false;
	}

	static void add_expansions(int zorro)
	{
		for (int i = 0; expansionroms[i].name; i++) {
			const struct expansionromtype *ert = &expansionroms[i];
			if (ert->zorro == zorro) {
				for (int j = 0; j < MAX_DUPLICATE_EXPANSION_BOARDS; j++) {
					struct romconfig *rc = get_device_romconfig(&currprefs, ert->romtype, j);
					if (rc) {
						if (zorro == 1) {
							ert->init(rc);
							if (ert->init2)
								ert->init2(rc);
						} else {
							cards[cardno].flags = 0;
							cards[cardno].name = ert->name;
							cards[cardno].initrc = ert->init;
							cards[cardno].rc = rc;
							cards[cardno].zorro = zorro;
							cards[cardno++].map = null;
							if (ert->init2) {
								cards[cardno].flags = 0;
								cards[cardno].name = ert->name;
								cards[cardno].initrc = ert->init2;
								cards[cardno].rc = rc;
								cards[cardno].zorro = zorro;
								cards[cardno++].map = null;
							}
						}
					}
				}
			}
		}
	}*/

	this.reset = function() { //expamem_reset()
		var do_mount = 1;

		ecard = 0;
		cardno = 0;
		//cardid = currprefs.uae_hide ? commodore : hackers_id;
		cardid = true ? commodore : hackers_id;

		//chipdone = false;

		allocate();
		expamem_bank.name = "Autoconfig [reset]";

		if (SAER.autoconf.need_uae_boot_rom() == 0)
			do_mount = 0;
		if (SAEV_AutoConf_boot_rom_type <= 0)
			do_mount = 0;

		/* check if Kickstart version is below 1.3 */
		if (SAER.memory.ks12orolder() && do_mount) { //&& currprefs.uaeboard < 2) {
			/*#if KS12_BOOT_HACK
			do_mount = -1;
			if (SAER.memory.ks11orolder()) {
				filesys_start = 0xe90000;
				SAER.memory.map_banks_z2(&filesys_bank, filesys_start >>> 16, 1);
				expamem_init_filesys(0);
				expamem_map_filesys_update();
			}
			#else*/
			SAEF_log("expansion.reset() Kickstart version is below 1.3! Disabling automount devices.");
			do_mount = 0;
			//#endif
		}

		//add possible non-autoconfig boards
		//add_expansions(BOARD_NONAUTOCONFIG_BEFORE);

		var fastmem_after = false;
		if (SAEV_config.memory.z2FastAutoConfig) {
			//fastmem_after = add_fastram_after_expansion(BOARD_AUTOCONFIG_Z2);
			if (!fastmem_after && fastmem_bank.baseaddr !== null && (fastmem_bank.allocated <= 262144 || SAEV_config.memory.chipSize <= 2 * 1024 * 1024)) {
				cards[cardno].flags = 0;
				cards[cardno].name = "Z2Fast";
				cards[cardno].initnum = expamem_init_fastcard;
				cards[cardno++].map = expamem_map_fastcard;
			}
			/*if (fastmem2_bank.baseaddr !== null && (fastmem2_bank.allocated <= 262144  || SAEV_config.memory.chipSize <= 2 * 1024 * 1024)) {
				cards[cardno].flags = 0;
				cards[cardno].name = "Z2Fast2";
				cards[cardno].initnum = expamem_init_fastcard2;
				cards[cardno++].map = expamem_map_fastcard2;
			}*/
		} else {
			if (fastmem_bank.baseaddr !== null) {
				fastmem_bank.name = "Fast memory (non-autoconfig)";
				SAER_Memory_mapBanks(fastmem_bank, 0x00200000 >>> 16, fastmem_bank.allocated >>> 16, 0);
			}
			/*if (fastmem2_bank.baseaddr !== null) {
				fastmem2_bank.name = "Fast memory 2 (non-autoconfig)";
				SAER_Memory_mapBanks(fastmem2_bank, (0x00200000 + fastmem_bank.allocated) >>> 16, fastmem2_bank.allocated >>> 16, 0);
			}*/
		}

		// immediately after Z2Fast so that they can be emulated as A590/A2091 with fast ram.
		//add_expansions(BOARD_AUTOCONFIG_Z2);
		//add_expansions(BOARD_NONAUTOCONFIG_AFTER_Z2);

		/*if (fastmem_after && SAEV_config.memory.z2FastAutoConfig) {
			if (fastmem_bank.baseaddr != null && (fastmem_bank.allocated <= 262144 || SAEV_config.memory.chipSize <= 2 * 1024 * 1024)) {
				cards[cardno].flags = 0;
				cards[cardno].name = "Z2Fast";
				cards[cardno].initnum = expamem_init_fastcard;
				cards[cardno++].map = expamem_map_fastcard;
			}
		}*/

		/*#ifdef CDTV
		if (currprefs.cs_cdtvcd && !currprefs.cs_cdtvcr) {
			cards[cardno].flags = 0;
			cards[cardno].name = "CDTV DMAC";
			cards[cardno].initrc = cdtv_init;
			cards[cardno++].map = null;
		}
		#endif
		#ifdef CD32
		if (currprefs.cs_cd32cd && SAEV_config.memory.z2FastSize == 0 && SAEV_config.memory.chipSize <= 0x200000 && currprefs.cs_cd32fmv) {
			cards[cardno].flags = 0;
			cards[cardno].name = "CD32MPEG";
			cards[cardno].initnum = expamem_init_cd32fmv;
			cards[cardno++].map = expamem_map_cd32fmv;
		}
		#endif
		#ifdef A2065
		if (currprefs.a2065name[0]) {
			cards[cardno].flags = 0;
			cards[cardno].name = "A2065";
			cards[cardno].initnum = a2065_init;
			cards[cardno++].map = null;
		}
		#endif
		#ifdef FILESYS
		if (do_mount && currprefs.uaeboard < 2) {
			cards[cardno].flags = 0;
			cards[cardno].name = "UAEFS";
			cards[cardno].initnum = expamem_init_filesys;
			cards[cardno++].map = expamem_map_filesys;
		}
		if (currprefs.uaeboard) {
			cards[cardno].flags = 0;
			cards[cardno].name = "UAEBOARD";
			cards[cardno].initnum = expamem_init_uaeboard;
			cards[cardno++].map = expamem_map_uaeboard;
		}
		#endif
		#ifdef WITH_TOCCATA
		if (currprefs.sound_toccata) {
			cards[cardno].flags = 0;
			cards[cardno].name = "Toccata";
			cards[cardno++].initnum = sndboard_init;
		}
		#endif
		if (currprefs.monitoremu == MONITOREMU_FIRECRACKER24) {
			cards[cardno].flags = 0;
			cards[cardno].name = "FireCracker24";
			cards[cardno++].initnum = specialmonitor_autoconfig_init;
		}*/

		/* Z3 boards last */
		if (!SAEV_config.cpu.addressSpace24) {
			if (z3fastmem_bank.baseaddr !== null) {
				var alwaysmapz3 = SAEV_config.memory.z3Mapping != SAEC_Config_Memory_z3Mapping_Real;
				z3num = 0;
				cards[cardno].flags = 2 | 1;
				cards[cardno].name = "Z3Fast";
				cards[cardno].initnum = expamem_init_z3fastmem;
				cards[cardno++].map = expamem_map_z3fastmem;
				if (alwaysmapz3 || expamem_z3hack(SAEV_config))
					SAER.memory.map_banks_z3(z3fastmem_bank, z3fastmem_bank.start >>> 16, SAEV_config.memory.z3FastSize >>> 16);

				/*if (z3fastmem2_bank.baseaddr != null) {
					cards[cardno].flags = 2 | 1;
					cards[cardno].name = "Z3Fast2";
					cards[cardno].initnum = expamem_init_z3fastmem2;
					cards[cardno++].map = expamem_map_z3fastmem2;
					if (alwaysmapz3 || expamem_z3hack(SAEV_config))
						SAER.memory.map_banks_z3(z3fastmem2_bank, z3fastmem2_bank.start >>> 16, currprefs.z3fastmem2_size >>> 16);
				}*/
			}
			/*if (z3chipmem_bank.baseaddr != null)
				SAER.memory.map_banks_z3(z3chipmem_bank, z3chipmem_bank.start >>> 16, currprefs.z3chipmem_size >>> 16);

			add_expansions(BOARD_AUTOCONFIG_Z3);*/
		}

		//add_expansions(BOARD_NONAUTOCONFIG_AFTER_Z3);

		expamem_z2_pointer = 0;
		expamem_z3_pointer = 0;
		expamem_z3_sum = 0;

		if (cardno == 0)
			expamem_init_clear_zero();
		else
			call_card_init(0);
	}

	this.setup = function() { //expansion_init()
		fastmem_bank.allocated = 0;
		fastmem_bank.mask = fastmem_bank.start = 0;
		fastmem_bank.baseaddr = null;
		/*fastmem_nojit_bank.allocated = 0;
		fastmem_nojit_bank.mask = fastmem_nojit_bank.start = 0;
		fastmem_nojit_bank.baseaddr = null;

		fastmem2_bank.allocated = 0;
		fastmem2_bank.mask = fastmem2_bank.start = 0;
		fastmem2_bank.baseaddr = null;
		fastmem2_nojit_bank.allocated = 0;
		fastmem2_nojit_bank.mask = fastmem2_nojit_bank.start = 0;
		fastmem2_nojit_bank.baseaddr = null;

		z3fastmem_bank.allocated = 0;
		z3fastmem_bank.mask = z3fastmem_bank.start = 0;
		z3fastmem_bank.baseaddr = null;

		z3fastmem2_bank.allocated = 0;
		z3fastmem2_bank.mask = z3fastmem2_bank.start = 0;
		z3fastmem2_bank.baseaddr = null;

		z3chipmem_bank.allocated = 0;
		z3chipmem_bank.mask = z3chipmem_bank.start = 0;
		z3chipmem_bank.baseaddr = null;*/

		/*#ifdef FILESYS
		filesys_start = 0;
		#endif*/

		allocate();

		/*#ifdef FILESYS
		if (currprefs.uaeboard < 2) {
			filesys_bank.allocated = 0x10000;
			if (!mapped_malloc (&filesys_bank)) {
				SAEF_error("virtual memory exhausted (filesysory)!");
				exit(0);
			}
		}
		#endif
		if (currprefs.uaeboard) {
			uaeboard_bank.allocated = 0x10000;
			mapped_malloc(&uaeboard_bank);
		}*/
	}

	this.cleanup = function() {
		mapped_free(fastmem_bank);
		/*mapped_free(fastmem2_bank);
		mapped_free(z3fastmem_bank);
		mapped_free(z3fastmem2_bank);
		mapped_free(z3chipmem_bank);

		fastmem_nojit_bank.baseaddr = null;
		fastmem2_nojit_bank.baseaddr = null;*/

		/*#ifdef FILESYS
		mapped_free (&filesys_bank);
		#endif
		if (currprefs.uaeboard)
			mapped_free(&uaeboard_bank);*/
	}

	function clear_bank(ab) {
		if (ab.baseaddr !== null && ab.allocated) {
			//memset(ab->baseaddr, 0, ab->allocated > 0x800000 ? 0x800000 : ab->allocated);
			SAEF_memset(ab.baseaddr,0, 0, ab.allocated > 0x800000 ? 0x800000 : ab.allocated);
		}
	}
	this.clear = function() { //expansion_clear()
		clear_bank(fastmem_bank);
		/*clear_bank(fastmem2_bank);
		clear_bank(z3fastmem_bank);
		clear_bank(z3fastmem2_bank);
		clear_bank(z3chipmem_bank);*/
	}

	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/

	/*var expamem_null = new SAEO_Memory_addrbank(
		null, null, null,
		null, null, null,
		null, null, null, null, "",
		null, null,
		//0, 0, 0
		0
	);
	var expamem_none = new SAEO_Memory_addrbank(
		null, null, null,
		null, null, null,
		null, null, null, null, "",
		null, null,
		//0, 0, 0
		0
	);*/

	/*-----------------------------------------------------------------------*/
	/* BANK Autoconfig Z2 */

	function expamem_get32(addr) {
		if (expamem_bank_current && expamem_bank_current !== expamem_bank)
			return expamem_bank_current.get32(addr);
		SAEF_warn("expamem_get32() Z2 READ.L from address $%08x PC=%x", addr, SAER_CPU_getPC());
		return ((expamem_get16(addr) << 16) | expamem_get16(addr + 2)) >>> 0;
	}
	function expamem_get16(addr) {
		if (expamem_bank_current && expamem_bank_current !== expamem_bank)
			return expamem_bank_current.get16(addr);
		if (expamem_type() != zorroIII) {
			if (expamem_bank_current && expamem_bank_current !== expamem_bank)
				return expamem_bank_current.get8(addr) << 8;
		}
		SAEF_warn("expamem_get16() READ.W from address $%08x PC=%x", addr, SAER_CPU_getPC());
		return (expamem_get8(addr) << 8) | expamem_get8(addr + 1);
	}
	function expamem_get8(addr) {
		/*if (!chipdone) {
			chipdone = true;
			addextrachip(SAER_Memory_get32(4));
		}*/
		if (expamem_bank_current && expamem_bank_current !== expamem_bank)
			return expamem_bank_current.get8(addr);

		return expamem[addr & 0xffff];
		/*addr &= 0xFFFF;
		var b = expamem[addr];
		#if EXP_DEBUG
		SAEF_log("expamem_get8 %x %x", addr, b);
		#endif
		return b;*/
	}
	function expamem_put32(addr, value) {
		if (expamem_bank_current && expamem_bank_current !== expamem_bank) {
			expamem_bank_current.put32(addr, value);
			return;
		}
		SAEF_warn("expamem_put32() Z2 WRITE.L to address $%08x : value $%08x", addr, value);
	}
	function expamem_put16(addr, value) {
		/*#if EXP_DEBUG
		SAEF_log("expamem_put16 %x %x", addr, value);
		#endif*/
		value &= 0xffff;
		if (ecard >= cardno)
			return;
		if (expamem_type() != zorroIII)
			SAEF_warn("expamem_put16() WRITE.W to address $%08x : value $%x PC=%08x", addr, value, SAER_CPU_getPC());

		switch (addr & 0xff) {
			case 0x48:
				// A2630 boot rom writes WORDs to Z2 boards!
				if (expamem_type() == zorroII) {
					expamem_lo = 0;
					expamem_hi = (value >> 8) & 0xff;
					expamem_z2_pointer = (expamem_hi | (expamem_lo >> 4)) << 16;
					expamem_board_pointer = expamem_z2_pointer;
					if (cards[ecard].map) {
						expamem_next(cards[ecard].map(), null);
						return;
					}
					if (expamem_bank_current && expamem_bank_current !== expamem_bank) {
						expamem_bank_current.put8(addr, value >> 8);
						return;
					}
				}
				break;
			case 0x44:
				if (expamem_type() == zorroIII) {
					expamem_hi = value & 0xff00;
					var addr = ((expamem_hi | (expamem_lo >> 4)) << 16) >>> 0;
					if (!expamem_z3hack(SAEV_config))
						expamem_z3_pointer = addr;
					else {
						if (addr != expamem_z3_pointer) {
							SAEF_warn("expansion.expamem_put16() hack %08x %08x", addr, expamem_z3_pointer);
							SAER_Memory_put16(SAER_CPU_regs.a[3] + 0x20, expamem_z3_pointer >>> 16); //ATT regs.regs[11]
							SAER_Memory_put16(SAER_CPU_regs.a[3] + 0x28, expamem_z3_pointer >>> 16);
						}
					}
					expamem_board_pointer = expamem_z3_pointer;
				}
				if (cards[ecard].map) {
					expamem_next(cards[ecard].map(), null);
					return;
				}
				break;
			case 0x4c:
				if (cards[ecard].map) {
					expamem_next(null, null);
					return;
				}
				break;
		}
		if (expamem_bank_current && expamem_bank_current !== expamem_bank)
			expamem_bank_current.put16(addr, value);
	}
	function expamem_put8(addr, value) {
		/*#if EXP_DEBUG
		SAEF_log("expamem_put8 %x %x", addr, value);
		#endif*/
		value &= 0xff;
		if (ecard >= cardno)
			return;
		if (expamem_type() == protoautoconfig) {
			switch (addr & 0xff) {
				case 0x22: {
					expamem_hi = value & 0x7f;
					expamem_z2_pointer = 0xe80000 | (expamem_hi * 4096);
					expamem_board_pointer = expamem_z2_pointer;
					if (cards[ecard].map) {
						expamem_next(cards[ecard].map(), null);
						return;
					}
				}
			}
		} else {
			switch (addr & 0xff) {
			case 0x48:
				if (expamem_type() == zorroII) {
					expamem_hi = value & 0xff;
					expamem_z2_pointer = (expamem_hi | (expamem_lo >> 4)) << 16;
					expamem_board_pointer = expamem_z2_pointer;
					if (cards[ecard].map) {
						expamem_next(cards[ecard].map(), null);
						return;
					}
				} else {
					expamem_lo = value & 0xff;
				}
				break;

			case 0x4a:
				if (expamem_type() == zorroII)
					expamem_lo = value & 0xff;
				break;

			case 0x4c:
				if (cards[ecard].map) {
					expamem_next(expamem_bank_current, null);
					return;
				}
				break;
			}
		}
		if (expamem_bank_current && expamem_bank_current !== expamem_bank)
			expamem_bank_current.put8(addr, value);
	}

	var expamem_bank = new SAEO_Memory_addrbank(
		expamem_get32, expamem_get16, expamem_get8,
		expamem_put32, expamem_put16, expamem_put8,
		SAEF_Memory_defaultXLate, SAEF_Memory_defaultCheck, null, null, "Autoconfig Z2",
		SAEF_Memory_dummyGetInst32, SAEF_Memory_dummyGetInst16,
		//SAEC_Memory_addrbank_flag_IO | SAEC_Memory_addrbank_flag_SAFE | SAEC_Memory_addrbank_flag_PPCIOSPACE, S_READ, S_WRITE
		SAEC_Memory_addrbank_flag_IO | SAEC_Memory_addrbank_flag_SAFE | SAEC_Memory_addrbank_flag_PPCIOSPACE
	);
	SAER_Expansion_expamem_bank = expamem_bank;

	/*-----------------------------------------------------------------------*/
	/* BANK Autoconfig Z3 */

	function expamemz3_get8(addr) {
		if (!expamem_bank_current)
			return 0;
		var reg = addr & 0xff;
		if (addr & 0x100)
			reg += 2;
		return expamem_bank_current.get8(reg);
	}
	function expamemz3_get16(addr) {
		SAEF_warn("expansion.expamemz3_get16() READ.W from address $%08x PC=%x", addr, SAER_CPU_getPC());
		return (expamemz3_get8(addr) << 8) | expamemz3_get8(addr + 1);
	}
	function expamemz3_get32(addr) {
		SAEF_warn("expansion.expamemz3_get32() READ.L from address $%08x PC=%x", addr, SAER_CPU_getPC());
		return ((expamemz3_get16(addr) << 16) | expamemz3_get16(addr + 2)) >>> 0;
	}
	function expamemz3_put8(addr, value) {
		if (!expamem_bank_current)
			return;
		var reg = addr & 0xff;
		if (addr & 0x100)
			reg += 2;
		if (reg == 0x48) {
			if (expamem_type() == zorroII) {
				expamem_hi = value & 0xff;
				expamem_z2_pointer = ((expamem_hi | (expamem_lo >> 4)) << 16) >>> 0;
				expamem_board_pointer = expamem_z2_pointer;
			} else {
				expamem_lo = value & 0xff;
			}
		} else if (reg == 0x4a) {
			if (expamem_type() == zorroII)
				expamem_lo = value & 0xff;
		}
		expamem_bank_current.put8(reg, value);
	}
	function expamemz3_put16(addr, value) {
		if (!expamem_bank_current)
			return;
		var reg = addr & 0xff;
		if (addr & 0x100)
			reg += 2;
		if (reg == 0x44) {
			if (expamem_type() == zorroIII) {
				expamem_hi = value & 0xff00;
				var z3_pointer = ((expamem_hi | (expamem_lo >> 4)) << 16) >>> 0;
				if (!expamem_z3hack(SAEV_config))
					expamem_z3_pointer = z3_pointer;
				else {
					if (z3_pointer != expamem_z3_pointer) {
						SAEF_warn("expansion.expamemz3_put16() hack %08x %08x", addr, expamem_z3_pointer);
						SAER_Memory_put16(SAER_CPU_regs.a[3] + 0x20, expamem_z3_pointer >>> 16); //ATT regs.regs[11]
						SAER_Memory_put16(SAER_CPU_regs.a[3] + 0x28, expamem_z3_pointer >>> 16);
					}
				}
				expamem_board_pointer = expamem_z3_pointer;
			}
		}
		expamem_bank_current.put16(reg, value);
	}
	function expamemz3_put32(addr, value) {
		SAEF_warn("expansion.expamemz3_put32() WRITE.L to address $%08x, value $%08x", addr, value);
	}
	var expamemz3_bank = new SAEO_Memory_addrbank(
		expamemz3_get32, expamemz3_get16, expamemz3_get8,
		expamemz3_put32, expamemz3_put16, expamemz3_put8,
		SAEF_Memory_defaultXLate, SAEF_Memory_defaultCheck, null, null, "Autoconfig Z3",
		SAEF_Memory_dummyGetInst32, SAEF_Memory_dummyGetInst16,
		//SAEC_Memory_addrbank_flag_IO | SAEC_Memory_addrbank_flag_SAFE | SAEC_Memory_addrbank_flag_PPCIOSPACE, S_READ, S_WRITE
		SAEC_Memory_addrbank_flag_IO | SAEC_Memory_addrbank_flag_SAFE | SAEC_Memory_addrbank_flag_PPCIOSPACE
	);

	/*-----------------------------------------------------------------------*/

	/*#ifdef CD32
	static addrbank *expamem_map_cd32fmv (void) {
		return cd32_fmv_init (expamem_z2_pointer);
	}
	static addrbank *expamem_init_cd32fmv (int devnum) {
		int ids[] = { 23, -1 };
		struct romlist *rl = getromlistbyids (ids, NULL);
		struct romdata *rd;
		struct zfile *z;

		expamem_init_clear ();
		if (!rl)
			return NULL;
		write_log (_T("CD32 FMV ROM '%s' %d.%d\n"), rl->path, rl->rd->ver, rl->rd->rev);
		rd = rl->rd;
		z = read_rom (rd);
		if (z) {
			zfile_fread (expamem, 128, 1, z);
			zfile_fclose (z);
		}
		return NULL;
	}
	#endif*/
}
