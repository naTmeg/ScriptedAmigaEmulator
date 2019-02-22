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

//ORG ABFLAG_*
const SAEC_Memory_addrbank_flag_UNK = 0;
const SAEC_Memory_addrbank_flag_RAM = 1;
const SAEC_Memory_addrbank_flag_ROM = 2;
const SAEC_Memory_addrbank_flag_ROMIN = 4;
const SAEC_Memory_addrbank_flag_IO = 8;
const SAEC_Memory_addrbank_flag_NONE = 16;
const SAEC_Memory_addrbank_flag_SAFE = 32;
//const SAEC_Memory_addrbank_flag_INDIRECT = 64;
const SAEC_Memory_addrbank_flag_NOALLOC = 128;
//const SAEC_Memory_addrbank_flag_RTG = 256;
const SAEC_Memory_addrbank_flag_THREADSAFE = 512;
//const SAEC_Memory_addrbank_flag_DIRECTMAP = 1024;
const SAEC_Memory_addrbank_flag_ALLOCINDIRECT = 2048;
const SAEC_Memory_addrbank_flag_CHIPRAM = 4096;
const SAEC_Memory_addrbank_flag_CIA = 8192;
const SAEC_Memory_addrbank_flag_PPCIOSPACE = 16384;

const SAEC_Memory_addrbank_READ = 1;
const SAEC_Memory_addrbank_WRITE = 2;


const SAEC_Memory_banktype_FAST32 = 0; //CE_MEMBANK_FAST32
const SAEC_Memory_banktype_CHIP16 = 1; //CE_MEMBANK_CHIP16
const SAEC_Memory_banktype_CHIP32 = 2; //CE_MEMBANK_CHIP32
const SAEC_Memory_banktype_CIA  = 3;   //CE_MEMBANK_CIA
const SAEC_Memory_banktype_FAST16 = 4; //CE_MEMBANK_FAST16

/*---------------------------------*/
/* global references */

var SAER_Memory_banks = null;
var SAER_Memory_banktype = null;
var SAER_Memory_cachable = null;

var SAER_Memory_getBank = null;
var SAER_Memory_get8 = null;
var SAER_Memory_get16 = null;
var SAER_Memory_getInst16 = null;
var SAER_Memory_get32 = null;
var SAER_Memory_getInst32 = null;
var SAER_Memory_put8 = null;
var SAER_Memory_put16 = null;
var SAER_Memory_put32 = null;
//var SAER_Memory_xlate = null;
var SAER_Memory_check = null; /* autoconf/check_boot_rom() */


var SAER_Memory_chipData = null;

var SAER_Memory_chipGet8_indirect = null;
var SAER_Memory_chipGet16_indirect = null;
var SAER_Memory_chipGet32_indirect = null;
var SAER_Memory_chipPut8_indirect = null;
var SAER_Memory_chipPut16_indirect = null;
var SAER_Memory_chipPut32_indirect = null;
var SAER_Memory_chipCheck_indirect = null;
var SAER_Memory_chipXLate_indirect = null;

var SAER_Memory_mapBanks = null;

/*---------------------------------*/
/* global variables */

//var SAEV_Memory_chipSizeReal = 0;
var SAEV_Memory_chipMask = 0;

var SAEV_Memory_cloantoRom = false;

/*---------------------------------*/
/* global objects */

/*typedef uae_u32 (REGPARAM3 *mem_get_func)(uaecptr) REGPARAM;
typedef void (REGPARAM3 *mem_put_func)(uaecptr, uae_u32) REGPARAM;
typedef uae_u8 *(REGPARAM3 *xlate_func)(uaecptr) REGPARAM;
typedef int (REGPARAM3 *check_func)(uaecptr, uae_u32) REGPARAM;*/

function SAEO_Memory_addrbank_sub(bank,offset) {
	this.bank = bank; //addrbank *
	this.offset = offset; //u32
	this.suboffset = 0;
	this.mask = 0;
	this.maskval = 0;
}
//function SAEO_Memory_addrbank(get32,get16,get8,put32,put16,put8, xlate,check,baseaddr,label,name, getInst32,getInst16, flags,read,write,sub_banks,mask,startmask) {
function SAEO_Memory_addrbank(get32,get16,get8,put32,put16,put8, xlate,check,baseaddr,label,name, getInst32,getInst16, flags,sub_banks,mask,startmask) {
	if (typeof sub_banks == "undefined") sub_banks = null;
	if (typeof mask == "undefined") mask = 0;
	if (typeof startmask == "undefined") startmask = 0;
	this.get32 = get32, this.get16 = get16, this.get8 = get8; //mem_get_func
	this.put32 = put32, this.put16 = put16, this.put8 = put8; //mem_put_func
	this.xlateaddr = xlate; //xlate_func
	this.check = check; //check_func
	this.baseaddr = baseaddr; //u8 *
	this.label = label;
	this.name = name;
	this.getInst32 = getInst32, this.getInst16 = getInst16; //mem_get_func
	this.flags = flags;
	//this.jit_read_flag = read;
	//this.jit_write_flag = write;
	this.sub_banks = sub_banks; //struct addrbank_sub *
	this.mask = mask; //u32
	this.startmask = startmask;
	this.start = 0;
	this.allocated = 0;
}

/*---------------------------------*/
/* global functions */

function SAEF_Memory_defaultCheck(a, b) {
	return 0;
}

var SAEV_Memory_defaultXLate_cnt = 0;
var SAEV_Memory_defaultXLate_recursive = 0;

function SAEF_Memory_defaultXLate(addr) {
	if (SAEV_Memory_defaultXLate_recursive) {
		SAER.m68k.cpu_halt(SAEC_CPU_halt_OPCODE_FETCH_FROM_NON_EXISTING_ADDRESS);
		return kickmem_xlate(2);
	}
	SAEV_Memory_defaultXLate_recursive++;
	var size = SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68020 ? 4 : 2;
	if (SAEV_command == 0) {
		/* do this only in 68010+ mode, there are some tricky A500 programs.. */
		//if ((SAEV_config.cpu.model > SAEC_Config_CPU_Model_68000 || !SAEV_config.cpu.compatible) && !currprefs.mmu_model) {
		if ((SAEV_config.cpu.model > SAEC_Config_CPU_Model_68000 || !SAEV_config.cpu.compatible)) {
			if (++SAEV_Memory_defaultXLate_cnt <= 5) {
				SAEF_warn("memory.default_xlate() Your Amiga program just did something terribly stupid %08X PC=%08X", addr, SAER_CPU_getPC());

				/*var txt = "";
				var a2 = addr - 32;
				var a3 = SAER_CPU_getPC() - 32;
				for (var i = 0; i < 10; i++) {
					txt += sprintf("%08X ", i >= 5 ? a3 : a2);
					for (var j = 0; j < 16; j += 2) {
						txt += sprintf(" %04X", get16(i >= 5 ? a3 : a2));
						if (i >= 5) a3 += 2; else a2 += 2;
					}
					txt += "\n";
				}
				SAEF_warn(txt);*/
				SAER.memory.map_dump();
			}
			/*if (0 || (SAEV_MBRes_gary_toenb && (gary_nonrange(addr) || (size > 1 && gary_nonrange(addr + size - 1)))))
				exception2(addr, false, size, regs.s ? 4 : 0);
			else*/
				SAER.m68k.cpu_halt(SAEC_CPU_halt_OPCODE_FETCH_FROM_NON_EXISTING_ADDRESS);
		}
	}
	SAEV_Memory_defaultXLate_recursive--;
	return kickmem_xlate(2); /* So we don't crash. */
}

/*---------------------------------*/

const SAEC_Memory_dummyGet_NONEXISTINGDATA = 0;

function SAEF_Memory_dummyGet32(addr) {
	SAER.memory.dummylog(0, addr, 4, 0, 0);
	return SAER.memory.dummyGet(addr, 4, false, SAEC_Memory_dummyGet_NONEXISTINGDATA);
}
function SAEF_Memory_dummyGetInst32(addr) {
	SAER.memory.dummylog(0, addr, 4, 0, 1);
	return SAER.memory.dummyGet(addr, 4, true, SAEC_Memory_dummyGet_NONEXISTINGDATA);
}
function SAEF_Memory_dummyGet16(addr) {
	SAER.memory.dummylog(0, addr, 2, 0, 0);
	return SAER.memory.dummyGet(addr, 2, false, SAEC_Memory_dummyGet_NONEXISTINGDATA);
}
function SAEF_Memory_dummyGetInst16(addr) {
	SAER.memory.dummylog(0, addr, 2, 0, 1);
	return SAER.memory.dummyGet(addr, 2, true, SAEC_Memory_dummyGet_NONEXISTINGDATA);
}
function SAEF_Memory_dummyGet8(addr) {
	SAER.memory.dummylog(0, addr, 1, 0, 0);
	return SAER.memory.dummyGet(addr, 1, false, SAEC_Memory_dummyGet_NONEXISTINGDATA);
}
function SAEF_Memory_dummyPut32(addr, l) {
	SAER.memory.dummylog(1, addr, 4, l, 0);
	SAER.memory.dummyPut(addr, 4, l);
}
function SAEF_Memory_dummyPut16(addr, w) {
	SAER.memory.dummylog(1, addr, 2, w, 0);
	SAER.memory.dummyPut(addr, 2, w);
}
function SAEF_Memory_dummyPut8(addr, b) {
	SAER.memory.dummylog(1, addr, 1, b, 0);
	SAER.memory.dummyPut(addr, 1, b);
}
function SAEF_Memory_dummyCheck(addr, size) {
	return 0;
}
var SAEV_Memory_dummyBank = new SAEO_Memory_addrbank(
	SAEF_Memory_dummyGet32, SAEF_Memory_dummyGet16, SAEF_Memory_dummyGet8,
	SAEF_Memory_dummyPut32, SAEF_Memory_dummyPut16, SAEF_Memory_dummyPut8,
	SAEF_Memory_defaultXLate, SAEF_Memory_dummyCheck, null, null, null,
	SAEF_Memory_dummyGetInst32, SAEF_Memory_dummyGetInst16,
	//SAEC_Memory_addrbank_flag_NONE, S_READ, S_WRITE
	SAEC_Memory_addrbank_flag_NONE
);

/*---------------------------------*/

function SAEF_Memory_subBankGet32(addr) {
	var ptr = { value:addr };
	var ab = SAER.memory.getSubBank(ptr);
	return ab.get32(ptr.value);
}
function SAEF_Memory_subBankGet16(addr) {
	var ptr = { value:addr };
	var ab = SAER.memory.getSubBank(ptr);
	return ab.get16(ptr.value);
}
function SAEF_Memory_subBankGet8(addr) {
	var ptr = { value:addr };
	var ab = SAER.memory.getSubBank(ptr);
	return ab.get8(ptr.value);
}
function SAEF_Memory_subBankPut32(addr, v) {
	var ptr = { value:addr };
	var ab = SAER.memory.getSubBank(ptr);
	ab.put32(ptr.value, v);
}
function SAEF_Memory_subBankPut16(addr, v) {
	var ptr = { value:addr };
	var ab = SAER.memory.getSubBank(ptr);
	ab.put16(ptr.value, v);
}
function SAEF_Memory_subBankPut8(addr, v) {
	var ptr = { value:addr };
	var ab = SAER.memory.getSubBank(ptr);
	ab.put8(ptr.value, v);
}
function SAEF_Memory_subBankGetInst32(addr) {
	var ptr = { value:addr };
	var ab = SAER.memory.getSubBank(ptr);
	return ab.getInst32(ptr.value);
}
function SAEF_Memory_subBankGetInst16(addr) {
	var ptr = { value:addr };
	var ab = SAER.memory.getSubBank(ptr);
	return ab.getInst16(ptr.value);
}
function SAEF_Memory_subBankCheck(addr, size) {
	var ptr = { value:addr };
	var ab = SAER.memory.getSubBank(ptr);
	return ab.check(ptr.value, size);
}
function SAEF_Memory_subBankXLate(addr) {
	var ptr = { value:addr };
	var ab = SAER.memory.getSubBank(ptr);
	return ab.xlateaddr(ptr.value);
}

/*---------------------------------*/

function SAEO_Memory() {
	const ADDRESS_SPACE_24BIT = false; /* limit address-bus to 24bit */
	const MEMORY_BANKS = ADDRESS_SPACE_24BIT ? 256 : 65536;
	const MEMORY_RANGE_MASK = ADDRESS_SPACE_24BIT ? 0x00FFFFFF : 0xFFFFFFFF;

	//const S_READ = 1;
	//const S_WRITE = 2;

	//const FLASHEMU = 0;

	const ROM_SIZE_512 = 524288;
	const ROM_SIZE_256 = 262144;
	const ROM_SIZE_128 = 131072;

	const chipmem_start_addr = 0x00000000;
	const bogomem_start_addr = 0x00C00000;
	const cardmem_start_addr = 0x00E00000;
	const kickmem_start_addr = 0x00F80000;

	var kickstart_version = 0;
	//var kickstart_rom = false; //68060
	//var cloanto_rom = false; -> SAEV_Memory_cloantoRom

	var rom_write_enabled = false;
	var mem_hardreset = 0;
	var bogomem_aliasing = 0;
	var bogomem_aliasing_offset = 0; //OWN
	//var need_hardreset = false; //unused in whole source
	//var lastAaddressSpace24 = false;

	var mem_banks = new Array(MEMORY_BANKS); //addrbank *mem_banks[MEMORY_BANKS];
	for (var vi = 0; vi < MEMORY_BANKS; vi++) mem_banks[vi] = null;
	SAER_Memory_banks = mem_banks;

	var ce_banktype = new Uint8Array(65536); SAER_Memory_banktype = ce_banktype;
	var ce_cachable = new Uint8Array(65536); SAER_Memory_cachable = ce_cachable;

	/* This has two functions. It either holds a host address that, when added
	to the 68k address, gives the host address corresponding to that 68k
	address (in which case the value in this array is even), OR it holds the
	same value as mem_banks, for those banks that have baseaddr==0. In that
	case, bit 0 is set (the memory access routines will take care of it).

	var baseaddr = new Uint32Array(MEMORY_BANKS); //u8 *baseaddr[MEMORY_BANKS];*/

	var aros = true; //OWN

	/*-----------------------------------------------------------------------*/

	function get_mem_bank(addr) { return mem_banks[addr >>> 16]; }
	SAER_Memory_getBank = get_mem_bank;

	function get32(addr) { return mem_banks[addr >>> 16].get32(addr); } //get_long()
	function getInst32(addr) { return mem_banks[addr >>> 16].getInst32(addr); } //get_longi()
	function get16(addr) { return mem_banks[addr >>> 16].get16(addr); } //get_word()
	function getInst16(addr) { return mem_banks[addr >>> 16].getInst16(addr); } //get_wordi()
	function get8(addr) { return mem_banks[addr >>> 16].get8(addr); } //get_byte()
	function put32(addr, l) { mem_banks[addr >>> 16].put32(addr, l); } //put_long()
	function put16(addr, w) { mem_banks[addr >>> 16].put16(addr, w); } //put_word()
	function put8(addr, b) { mem_banks[addr >>> 16].put8(addr, b); } //put_byte()
	function xlate_address(addr) { return mem_banks[addr >>> 16].xlateaddr(addr); } //get_real_address()
	function check_address(addr, size) { return mem_banks[addr >>> 16].check(addr, size); } //valid_address()

	SAER_Memory_get8 = get8;
	SAER_Memory_get16 = get16;
	SAER_Memory_getInst16 = getInst16;
	SAER_Memory_get32 = get32;
	SAER_Memory_getInst32 = getInst32;
	SAER_Memory_put8 = put8;
	SAER_Memory_put16 = put16;
	SAER_Memory_put32 = put32;
	//SAER_Memory_xlate = xlate_address;
	SAER_Memory_check = check_address;

	//function get_pointer(addr) { return mem_banks[addr >>> 16].get32(addr); }
	//function put_pointer(addr, p) { mem_banks[addr >>> 16].put32(addr, p); }

	/*-----------------------------------------------------------------------*/
	/* BANK dummy */

	/* A dummy bank that only contains zeros */
	const MAX_ILG = 1000;
	const NONEXISTINGDATA = 0;
	var dummylog_cnt = 0;

	this.dummylog = function(rw, addr, size, val, ins) {
		if (!SAEV_config.memory.logIllegal)
			return;
		if (dummylog_cnt >= MAX_ILG && MAX_ILG > 0)
			return;
		/* ignore Zorro3 expansion space */
		if (addr >= 0xff000000 && addr <= 0xff000200)
			return;
		/* autoconfig and extended rom */
		if (addr >= 0xe00000 && addr <= 0xf7ffff)
			return;
		/* motherboard ram */
		if (addr >= 0x08000000 && addr <= 0x08000007)
			return;
		if (addr >= 0x07f00000 && addr <= 0x07f00007)
			return;
		if (addr >= 0x07f7fff0 && addr <= 0x07ffffff)
			return;
		if (MAX_ILG >= 0)
			dummylog_cnt++;

		if (ins)
			SAEF_log("memory.geti%s(0x%08x) illegal access (PC 0x%x)", size == 2 ? "16" : "32", addr, SAER_CPU_getPC());
		else if (rw)
			SAEF_log("memory.put%s(0x%08x, 0x%x) illegal access (PC 0x%x)", size == 1 ? "8" : size == 2 ? "16" : "32", addr, val, SAER_CPU_getPC());
		else
			SAEF_log("memory.get%s(0x%08x) illegal access (PC 0x%x)", size == 1 ? "8" : size == 2 ? "16" : "32", addr, SAER_CPU_getPC());
	}

	// 250ms delay
	var gary_wait_cnt = 50;
	function gary_wait(addr, size, write) {
		/*#if 0
		var lines = 313 * 12;
		while (lines-- > 0) SAER.events.do_cycles(228 * SAEC_Events_CYCLE_UNIT); //x_do_cycles
		#endif*/

		if (gary_wait_cnt > 0) {
			SAEF_log("memory.gary_wait() Gary timeout: %08x %d %s PC=%08x", addr, size, write ? "W" : "R", SAER_CPU_getPC());
			gary_wait_cnt--;
		}
	}
	function gary_nonrange(addr) {
		if (SAEV_config.chipset.fatGaryRev < 0)
			return false;
		if (addr < 0xb80000)
			return false;
		if (addr >= 0xd00000 && addr < 0xdc0000)
			return true;
		if (addr >= 0xdd0000 && addr < 0xde0000)
			return true;
		if (addr >= 0xdf8000 && addr < 0xe00000)
			return false;
		if (addr >= 0xe80000 && addr < 0xf80000)
			return false;
		return true;
	}

	function dummy_get_safe(addr, size, inst, defvalue) {
		var v = defvalue;
		if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68040)
			return v;
		if (!SAEV_config.cpu.compatible)
			return v;
		if (SAEV_config.cpu.addressSpace24)
			addr &= 0x00ffffff;
		if (addr >= 0x10000000)
			return v;
		if ((SAEV_config.cpu.model <= SAEC_Config_CPU_Model_68010) || (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68020 && (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) != 0 && SAEV_config.cpu.addressSpace24)) {
			if (size == 4) {
				v = SAER_CPU_regs.db & 0xffff;
				if (addr & 1)
					v = ((v << 8) & 0xffff) | (v >> 8);
				v = ((v << 16) | v) >>> 0;
			} else if (size == 2) {
				v = SAER_CPU_regs.db & 0xffff;
				if (addr & 1)
					v = ((v << 8) & 0xffff) | (v >> 8);
			} else {
				v = SAER_CPU_regs.db;
				v = (addr & 1) ? (v & 0xff) : ((v >> 8) & 0xff);
			}
		}
		return v;
	}
	this.dummyGet = function(addr, size, inst, defvalue) {
		var v = defvalue;
		/*#if FLASHEMU
		if (addr >= 0xf00000 && addr < 0xf80000 && size < 2) {
			if (addr < 0xf60000) return flash_read(addr);
			return 8;
		}
		#endif*/
		if (gary_nonrange(addr) || (size > 1 && gary_nonrange(addr + size - 1))) {
			if (SAEV_MBRes_gary_timeout) gary_wait(addr, size, false);
			if (SAEV_MBRes_gary_toenb) SAER.cpu.exception2(addr, false, size, (SAER_CPU_regs.s ? 4 : 0) | (inst ? 0 : 1));
			return v;
		}
		return dummy_get_safe(addr, size, inst, defvalue);
	}

	this.dummyPut = function(addr, size, val) {
		/*#if FLASHEMU
		if (addr >= 0xf00000 && addr < 0xf80000 && size < 2) flash_write(addr, val);
		#endif*/
		if (gary_nonrange(addr) || (size > 1 && gary_nonrange(addr + size - 1))) {
			if (SAEV_MBRes_gary_timeout) gary_wait(addr, size, true);
			//if (SAEV_MBRes_gary_toenb && currprefs.mmu_model) SAER.cpu.exception2(addr, true, size, SAER_CPU_regs.s ? 4 : 0);
		}
	}

	/*-----------------------------------------------------------------------*/
	/* BANK Ones */

	/*function none_put(addr, v) {}
	function ones_get(addr) {
		return 0xffffffff;
	}
	var ones_bank = new SAEO_Memory_addrbank(
		ones_get, ones_get, ones_get,
		none_put, none_put, none_put,
		SAEF_Memory_defaultXLate, SAEF_Memory_defaultXLate, null, null, "Ones",
		SAEF_Memory_dummyGetInst32, SAEF_Memory_dummyGetInst16,
		//SAEC_Memory_addrbank_flag_NONE, S_READ, S_WRITE
		SAEC_Memory_addrbank_flag_NONE
	);*/

	/*-----------------------------------------------------------------------*/
	/* BANK Sub */

	this.getSubBank = function(ptr) {
		var i, addr = ptr.value;
		//var ab = get_mem_bank(addr);
		var ab = mem_banks[addr >>> 16];
		var sb = ab.sub_banks; //struct addrbank_sub *
		if (sb === null)
			return SAEV_Memory_dummyBank;
		for (i = 0; sb[i].bank !== null; i++) {
			var offset = addr & 65535;
			if (offset < sb[i + 1].offset) {
				var mask = sb[i].mask; //u32
				var maskval = sb[i].maskval; //u32
				if ((offset & mask) >>> 0 == maskval) {
					ptr.value = addr - sb[i].suboffset;
					return sb[i].bank;
				}
			}
		}
		ptr.value = addr - sb[i - 1].suboffset;
		return sb[i - 1].bank;
	}

	/*-----------------------------------------------------------------------*/
	/* BANK Chip memory */

	function chipmem_dummy() {
		return (0xffff & ~((1 << (Math.decimalRandom() & 31)) | (1 << (Math.decimalRandom() & 31)))) >>> 0;
	}
	function chipmem_dummy_put8(addr, b) {}
	function chipmem_dummy_put16(addr, w) {}
	function chipmem_dummy_put32(addr, l) {}
	function chipmem_dummy_get8(addr) { return chipmem_dummy(); }
	function chipmem_dummy_get16(addr) { return chipmem_dummy(); }
	function chipmem_dummy_get32(addr) { return ((chipmem_dummy() << 16) | chipmem_dummy()) >>> 0; }

	var chipmem_dummy_bank = new SAEO_Memory_addrbank(
		chipmem_dummy_get32, chipmem_dummy_get16, chipmem_dummy_get8,
		chipmem_dummy_put32, chipmem_dummy_put16, chipmem_dummy_put8,
		SAEF_Memory_defaultXLate, SAEF_Memory_defaultXLate, null, null, "Dummy Chip memory",
		SAEF_Memory_dummyGetInst32, SAEF_Memory_dummyGetInst16,
		//SAEC_Memory_addrbank_flag_IO | SAEC_Memory_addrbank_flag_CHIPRAM, S_READ, S_WRITE
		SAEC_Memory_addrbank_flag_IO | SAEC_Memory_addrbank_flag_CHIPRAM
	);

	/*---------------------------------*/

	var chipmem_full_mask = 0;
	var chipmem_full_size = 0;

	function chipmem_get32(addr) {
		addr = (addr & chipmem_bank.mask) >>> 0;
		//var m = (uae_u32 *)(chipmem_bank.baseaddr + addr); return do_get_mem_long (m);
		return ((chipmem_bank.baseaddr[addr] << 24) | (chipmem_bank.baseaddr[addr+1] << 16) | (chipmem_bank.baseaddr[addr+2] << 8) | chipmem_bank.baseaddr[addr+3]) >>> 0;
	}
	function chipmem_get16(addr) {
		addr = (addr & chipmem_bank.mask) >>> 0;
		//var m = (uae_u16 *)(chipmem_bank.baseaddr + addr); return do_get_mem_word (m);
		return (chipmem_bank.baseaddr[addr] << 8) | chipmem_bank.baseaddr[addr+1];
	}
	function chipmem_get8(addr) {
		addr = (addr & chipmem_bank.mask) >>> 0;
		return chipmem_bank.baseaddr[addr];
	}
	function chipmem_put32(addr, l) {
		addr = (addr & chipmem_bank.mask) >>> 0;
		//var m = (uae_u32 *)(chipmem_bank.baseaddr + addr); do_put_mem_long (m, l);
		chipmem_bank.baseaddr[addr] = l >>> 24;
		chipmem_bank.baseaddr[addr+1] = (l >>> 16) & 0xff;
		chipmem_bank.baseaddr[addr+2] = (l >>> 8) & 0xff;
		chipmem_bank.baseaddr[addr+3] = l & 0xff;
	}
	function chipmem_put16(addr, w) {
		addr = (addr & chipmem_bank.mask) >>> 0;
		//var m = (uae_u16 *)(chipmem_bank.baseaddr + addr); do_put_mem_word (m, w);
		chipmem_bank.baseaddr[addr] = w >> 8;
		chipmem_bank.baseaddr[addr+1] = w & 0xff;
	}
	function chipmem_put8(addr, b) {
		addr = (addr & chipmem_bank.mask) >>> 0;
		chipmem_bank.baseaddr[addr] = b;
	}
	function chipmem_check(addr, size) {
		addr = (addr & chipmem_bank.mask) >>> 0;
		return (addr + size) <= chipmem_full_size;
	}
	function chipmem_xlate(addr) {
		addr = (addr & chipmem_bank.mask) >>> 0;
		//return chipmem_bank.baseaddr + addr;
		return addr;
	}
	var chipmem_bank = new SAEO_Memory_addrbank(
		chipmem_get32, chipmem_get16, chipmem_get8,
		chipmem_put32, chipmem_put16, chipmem_put8,
		chipmem_xlate, chipmem_check, null, "chip", "Chip memory",
		chipmem_get32, chipmem_get16,
		//SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE | SAEC_Memory_addrbank_flag_CHIPRAM, 0, 0
		SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE | SAEC_Memory_addrbank_flag_CHIPRAM
	);

	/*---------------------------------*/

	/*function chipmem_agnus_get32(addr) {
		addr = (addr & chipmem_full_mask) >>> 0;
		if (addr >= chipmem_full_size - 3)
			return 0;
		return ((chipmem_bank.baseaddr[addr] << 24) | (chipmem_bank.baseaddr[addr+1] << 16) | (chipmem_bank.baseaddr[addr+2] << 8) | chipmem_bank.baseaddr[addr+3]) >>> 0;
	}*/
	function chipmem_agnus_get16(addr) {
		addr = (addr & chipmem_full_mask) >>> 0;
		if (addr >= chipmem_full_size - 1)
			return 0;
		return (chipmem_bank.baseaddr[addr] << 8) | chipmem_bank.baseaddr[addr+1];
	}
	function chipmem_agnus_get8(addr) {
		addr = (addr & chipmem_full_mask) >>> 0;
		if (addr >= chipmem_full_size)
			return 0;
		return chipmem_bank.baseaddr[addr];
	}
	/*function chipmem_agnus_put32(addr, l) {
		addr = (addr & chipmem_full_mask) >>> 0;
		if (addr >= chipmem_full_size - 3)
			return;
		chipmem_bank.baseaddr[addr] = l >>> 24;
		chipmem_bank.baseaddr[addr+1] = (l >>> 16) & 0xff;
		chipmem_bank.baseaddr[addr+2] = (l >>> 8) & 0xff;
		chipmem_bank.baseaddr[addr+3] = l & 0xff;
	}*/
	function chipmem_agnus_put16(addr, w) {
		addr = (addr & chipmem_full_mask) >>> 0;
		if (addr >= chipmem_full_size - 1)
			return;
		chipmem_bank.baseaddr[addr] = w >> 8;
		chipmem_bank.baseaddr[addr+1] = w & 0xff;
	}
	function chipmem_agnus_put8(addr, b) {
		addr = (addr & chipmem_full_mask) >>> 0;
		if (addr >= chipmem_full_size)
			return;
		chipmem_bank.baseaddr[addr] = b;
	}

	/*---------------------------------*/

	/*function chipmem_put32_bigmem(addr, v) { mem_banks[addr >>> 16].put32(addr, v); }
	function chipmem_put16_bigmem(addr, v) { mem_banks[addr >>> 16].put16(addr, v); }
	function chipmem_put8_bigmem(addr, v) { mem_banks[addr >>> 16].put8(addr, v); }
	function chipmem_get32_bigmem(addr) { return mem_banks[addr >>> 16].get32(addr); }
	function chipmem_get16_bigmem(addr) { return mem_banks[addr >>> 16].get16(addr); }
	function chipmem_get8_bigmem(addr) { return mem_banks[addr >>> 16].get8(addr); }
	function chipmem_check_bigmem(addr, size) { return mem_banks[addr >>> 16].check(addr, size); }
	function chipmem_xlate_bigmem(addr) { return mem_banks[addr >>> 16].xlateaddr(addr); }*/

	/*---------------------------------*/

	function chipmem_setindirect() {
		/*if (currprefs.z3chipmem_size) {
			chipmem_get32_indirect = chipmem_get32_bigmem;
			chipmem_get16_indirect = chipmem_get16_bigmem;
			chipmem_get8_indirect = chipmem_get8_bigmem;
			chipmem_put32_indirect = chipmem_put32_bigmem;
			chipmem_put16_indirect = chipmem_put16_bigmem;
			chipmem_put8_indirect = chipmem_put8_bigmem;
			chipmem_check_indirect = chipmem_check_bigmem;
			chipmem_xlate_indirect = chipmem_xlate_bigmem;
		} else {
			/*chipmem_get32_indirect = chipmem_get32;
			chipmem_get16_indirect = chipmem_agnus_get16;
			chipmem_get8_indirect = chipmem_agnus_get8;
			chipmem_put32_indirect = chipmem_put32;
			chipmem_put16_indirect = chipmem_agnus_put16;
			chipmem_put8_indirect = chipmem_agnus_put8;
			chipmem_check_indirect = chipmem_check;
			chipmem_xlate_indirect = chipmem_xlate;
		}*/

		SAER_Memory_chipGet8_indirect = chipmem_agnus_get8;
		SAER_Memory_chipGet16_indirect = chipmem_agnus_get16;
		SAER_Memory_chipGet32_indirect = chipmem_get32;
		SAER_Memory_chipPut8_indirect = chipmem_agnus_put8;
		SAER_Memory_chipPut16_indirect = chipmem_agnus_put16;
		SAER_Memory_chipPut32_indirect = chipmem_put32;
		SAER_Memory_chipCheck_indirect = chipmem_check;
		SAER_Memory_chipXLate_indirect = chipmem_xlate;
	}

	/*-----------------------------------------------------------------------*/
	/* BANK Slow/Bogo memory */

	function bogomem_get32(addr) {
		addr = (addr & bogomem_bank.mask) + bogomem_aliasing_offset;
		//var m = bogomem_bank.baseaddr + addr; return do_get_mem_long ((uae_u32 *)m);
		return ((bogomem_bank.baseaddr[addr] << 24) | (bogomem_bank.baseaddr[addr+1] << 16) | (bogomem_bank.baseaddr[addr+2] << 8) | bogomem_bank.baseaddr[addr+3]) >>> 0;
	}
	function bogomem_get16(addr) {
		addr = (addr & bogomem_bank.mask) + bogomem_aliasing_offset;
		//var m = bogomem_bank.baseaddr + addr; return do_get_mem_word ((uae_u16 *)m);
		return (bogomem_bank.baseaddr[addr] << 8) | bogomem_bank.baseaddr[addr+1];
	}
	function bogomem_get8(addr) {
		addr = (addr & bogomem_bank.mask) + bogomem_aliasing_offset;
		return bogomem_bank.baseaddr[addr];
	}
	function bogomem_put32(addr, l) {
		addr = (addr & bogomem_bank.mask) + bogomem_aliasing_offset;
		//var m = bogomem_bank.baseaddr + addr; do_put_mem_long ((uae_u32 *)m, l);
		bogomem_bank.baseaddr[addr] = l >>> 24;
		bogomem_bank.baseaddr[addr+1] = (l >>> 16) & 0xff;
		bogomem_bank.baseaddr[addr+2] = (l >>> 8) & 0xff;
		bogomem_bank.baseaddr[addr+3] = l & 0xff;
	}
	function bogomem_put16(addr, w) {
		addr = (addr & bogomem_bank.mask) + bogomem_aliasing_offset;
		//var m = bogomem_bank.baseaddr + addr; do_put_mem_word ((uae_u16 *)m, w);
		bogomem_bank.baseaddr[addr] = w >> 8;
		bogomem_bank.baseaddr[addr+1] = w & 0xff;
	}
	function bogomem_put8(addr, b) {
		addr = (addr & bogomem_bank.mask) + bogomem_aliasing_offset;
		bogomem_bank.baseaddr[addr] = b;
	}
	function bogomem_check(addr, size) {
		addr = (addr & bogomem_bank.mask);// + bogomem_aliasing_offset;
		return (addr + size) <= bogomem_bank.allocated;
	}
	function bogomem_xlate(addr) {
		addr = (addr & bogomem_bank.mask) + bogomem_aliasing_offset;
		//return bogomem_bank.baseaddr + addr;
		return addr;
	}
	var bogomem_bank = new SAEO_Memory_addrbank(
		bogomem_get32, bogomem_get16, bogomem_get8,
		bogomem_put32, bogomem_put16, bogomem_put8,
		bogomem_xlate, bogomem_check, null, "bogo", "Slow memory",
		bogomem_get32, bogomem_get16,
		//SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE, 0, 0
		SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE
	);

	/*-----------------------------------------------------------------------*/
	/* BANK CDTV memory card */

	/*MEMORY_FUNCTIONS(cardmem);
	var cardmem_bank = new SAEO_Memory_addrbank(
		cardmem_get32, cardmem_get16, cardmem_get8,
		cardmem_put32, cardmem_put16, cardmem_put8,
		cardmem_xlate, cardmem_check, null, "rom_e0", "CDTV memory card",
		cardmem_get32, cardmem_get16,
		//SAEC_Memory_addrbank_flag_RAM, 0, 0
		SAEC_Memory_addrbank_flag_RAM
	);*/

	/*-----------------------------------------------------------------------*/
	/* BANK A3000 motherboard fast memory */

	function a3000lmem_get32(addr) {
		addr = (addr & a3000lmem_bank.mask) >>> 0;
		//var m = a3000lmem_bank.baseaddr + addr; return do_get_mem_long ((uae_u32 *)m);
		return ((a3000lmem_bank.baseaddr[addr] << 24) | (a3000lmem_bank.baseaddr[addr+1] << 16) | (a3000lmem_bank.baseaddr[addr+2] << 8) | a3000lmem_bank.baseaddr[addr+3]) >>> 0;
	}
	function a3000lmem_get16(addr) {
		addr = (addr & a3000lmem_bank.mask) >>> 0;
		//var m = a3000lmem_bank.baseaddr + addr; return do_get_mem_word ((uae_u16 *)m);
		return (a3000lmem_bank.baseaddr[addr] << 8) | a3000lmem_bank.baseaddr[addr+1];
	}
	function a3000lmem_get8(addr) {
		addr = (addr & a3000lmem_bank.mask) >>> 0;
		return a3000lmem_bank.baseaddr[addr];
	}
	function a3000lmem_put32(addr, l) {
		addr = (addr & a3000lmem_bank.mask) >>> 0;
		//var m = a3000lmem_bank.baseaddr + addr; do_put_mem_long ((uae_u32 *)m, l);
		a3000lmem_bank.baseaddr[addr] = l >>> 24;
		a3000lmem_bank.baseaddr[addr+1] = (l >>> 16) & 0xff;
		a3000lmem_bank.baseaddr[addr+2] = (l >>> 8) & 0xff;
		a3000lmem_bank.baseaddr[addr+3] = l & 0xff;
	}
	function a3000lmem_put16(addr, w) {
		addr = (addr & a3000lmem_bank.mask) >>> 0;
		//var m = a3000lmem_bank.baseaddr + addr; do_put_mem_word ((uae_u16 *)m, w);
		a3000lmem_bank.baseaddr[addr] = w >> 8;
		a3000lmem_bank.baseaddr[addr+1] = w & 0xff;
	}
	function a3000lmem_put8(addr, b) {
		addr = (addr & a3000lmem_bank.mask) >>> 0;
		a3000lmem_bank.baseaddr[addr] = b;
	}
	function a3000lmem_check(addr, size) {
		addr = (addr & a3000lmem_bank.mask) >>> 0;
		return (addr + size) <= a3000lmem_bank.allocated;
	}
	function a3000lmem_xlate(addr) {
		addr = (addr & a3000lmem_bank.mask) >>> 0;
		//return a3000lmem_bank.baseaddr + addr;
		return addr;
	}
	var a3000lmem_bank = new SAEO_Memory_addrbank(
		a3000lmem_get32, a3000lmem_get16, a3000lmem_get8,
		a3000lmem_put32, a3000lmem_put16, a3000lmem_put8,
		a3000lmem_xlate, a3000lmem_check, null, "ramsey_low", "RAMSEY memory (low)",
		a3000lmem_get32, a3000lmem_get16,
		//SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE, 0, 0
		SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE
	);


	function a3000hmem_get32(addr) {
		addr = (addr & a3000hmem_bank.mask) >>> 0;
		//var m = a3000hmem_bank.baseaddr + addr; return do_get_mem_long ((uae_u32 *)m);
		return ((a3000hmem_bank.baseaddr[addr] << 24) | (a3000hmem_bank.baseaddr[addr+1] << 16) | (a3000hmem_bank.baseaddr[addr+2] << 8) | a3000hmem_bank.baseaddr[addr+3]) >>> 0;
	}
	function a3000hmem_get16(addr) {
		addr = (addr & a3000hmem_bank.mask) >>> 0;
		//var m = a3000hmem_bank.baseaddr + addr; return do_get_mem_word ((uae_u16 *)m);
		return (a3000hmem_bank.baseaddr[addr] << 8) | a3000hmem_bank.baseaddr[addr+1];
	}
	function a3000hmem_get8(addr) {
		addr = (addr & a3000hmem_bank.mask) >>> 0;
		return a3000hmem_bank.baseaddr[addr];
	}
	function a3000hmem_put32(addr, l) {
		addr = (addr & a3000hmem_bank.mask) >>> 0;
		//var m = a3000hmem_bank.baseaddr + addr; do_put_mem_long ((uae_u32 *)m, l);
		a3000hmem_bank.baseaddr[addr] = l >>> 24;
		a3000hmem_bank.baseaddr[addr+1] = (l >>> 16) & 0xff;
		a3000hmem_bank.baseaddr[addr+2] = (l >>> 8) & 0xff;
		a3000hmem_bank.baseaddr[addr+3] = l & 0xff;
	}
	function a3000hmem_put16(addr, w) {
		addr = (addr & a3000hmem_bank.mask) >>> 0;
		//var m = a3000hmem_bank.baseaddr + addr; do_put_mem_word ((uae_u16 *)m, w);
		a3000hmem_bank.baseaddr[addr] = w >> 8;
		a3000hmem_bank.baseaddr[addr+1] = w & 0xff;
	}
	function a3000hmem_put8(addr, b) {
		addr = (addr & a3000hmem_bank.mask) >>> 0;
		a3000hmem_bank.baseaddr[addr] = b;
	}
	function a3000hmem_check(addr, size) {
		addr = (addr & a3000hmem_bank.mask) >>> 0;
		return (addr + size) <= a3000hmem_bank.allocated;
	}
	function a3000hmem_xlate(addr) {
		addr = (addr & a3000hmem_bank.mask) >>> 0;
		//return a3000hmem_bank.baseaddr + addr;
		return addr;
	}
	var a3000hmem_bank = new SAEO_Memory_addrbank(
		a3000hmem_get32, a3000hmem_get16, a3000hmem_get8,
		a3000hmem_put32, a3000hmem_put16, a3000hmem_put8,
		a3000hmem_xlate, a3000hmem_check, null, "ramsey_high", "RAMSEY memory (high)",
		a3000hmem_get32, a3000hmem_get16,
		//SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE, 0, 0
		SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE
	);

	/*-----------------------------------------------------------------------*/
	/* BANK 25bit memory (0x01000000) */

	/*MEMORY_FUNCTIONS(mem25bit);
	var mem25bit_bank = new SAEO_Memory_addrbank(
		mem25bit_get32, mem25bit_get16, mem25bit_get8,
		mem25bit_put32, mem25bit_put16, mem25bit_put8,
		mem25bit_xlate, mem25bit_check, null, "25bitmem", "25bit memory",
		mem25bit_get32, mem25bit_get16,
		//SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE, 0, 0
		SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE
	);*/

	/*-----------------------------------------------------------------------*/
	/* BANK Kickstart ROM */

	/* A1000 kickstart RAM handling
	*
	* RESET instruction unhides boot ROM and disables write protection
	* write access to boot ROM hides boot ROM and enables write protection */

	var a1000_kickstart_mode = false; //int
	var a1000_bootrom = null; //u8 *
	function a1000_handle_kickstart(mode) {
		if (a1000_bootrom !== null) {
			//protect_roms(false);
			if (mode == 0) {
				a1000_kickstart_mode = false;
				//memcpy(kickmem_bank.baseaddr, kickmem_bank.baseaddr + ROM_SIZE_256, ROM_SIZE_256);
				SAEF_memcpy(kickmem_bank.baseaddr,0, kickmem_bank.baseaddr,ROM_SIZE_256, ROM_SIZE_256);
				//kickmem_bank.baseaddr.copyWithin(0, ROM_SIZE_256, ROM_SIZE_256 + ROM_SIZE_256);
				kickstart_version = (kickmem_bank.baseaddr[ROM_SIZE_256 + 12] << 8) | kickmem_bank.baseaddr[ROM_SIZE_256 + 13];
			} else {
				a1000_kickstart_mode = true;
				kickmem_bank.baseaddr.set(a1000_bootrom); //memcpy (kickmem_bank.baseaddr, a1000_bootrom, ROM_SIZE_256);
				kickstart_version = 0;
			}
			if (kickstart_version == 0xffff)
				kickstart_version = 0;
		}
	}
	this.a1000_reset = function() {
		a1000_handle_kickstart(1);
	}

	/*---------------------------------*/

	function kickmem_get32(addr) {
		addr = (addr & kickmem_bank.mask) >>> 0;
		//var m = kickmem_bank.baseaddr + addr; return do_get_mem_long ((uae_u32 *)m);
		return ((kickmem_bank.baseaddr[addr] << 24) | (kickmem_bank.baseaddr[addr+1] << 16) | (kickmem_bank.baseaddr[addr+2] << 8) | kickmem_bank.baseaddr[addr+3]) >>> 0;
	}
	function kickmem_get16(addr) {
		addr = (addr & kickmem_bank.mask) >>> 0;
		//var m = kickmem_bank.baseaddr + addr; return do_get_mem_word ((uae_u16 *)m);
		return (kickmem_bank.baseaddr[addr] << 8) | kickmem_bank.baseaddr[addr+1];
	}
	function kickmem_get8(addr) {
		addr = (addr & kickmem_bank.mask) >>> 0;
		return kickmem_bank.baseaddr[addr];
	}
	function kickmem_put32(addr, l) {
		if (rom_write_enabled) {
			addr = (addr & kickmem_bank.mask) >>> 0;
			//var m = (uae_u32 *)(kickmem_bank.baseaddr + addr); do_put_mem_long(m, l);
			kickmem_bank.baseaddr[addr] = l >>> 24;
			kickmem_bank.baseaddr[addr+1] = (l >>> 16) & 0xff;
			kickmem_bank.baseaddr[addr+2] = (l >>> 8) & 0xff;
			kickmem_bank.baseaddr[addr+3] = l & 0xff;
		} else if (a1000_kickstart_mode) {
			if (addr >= 0xfc0000) {
				addr = (addr & kickmem_bank.mask) >>> 0;
				//var m = (uae_u32 *)(kickmem_bank.baseaddr + addr); do_put_mem_long(m, l);
				kickmem_bank.baseaddr[addr] = l >>> 24;
				kickmem_bank.baseaddr[addr+1] = (l >>> 16) & 0xff;
				kickmem_bank.baseaddr[addr+2] = (l >>> 8) & 0xff;
				kickmem_bank.baseaddr[addr+3] = l & 0xff;
				//return;
			} else
				a1000_handle_kickstart(0);
		} else if (SAEV_config.memory.logIllegal)
			SAEF_warn("Illegal kickmem put32 at %08x", addr);
	}
	function kickmem_put16(addr, w) {
		if (rom_write_enabled) {
			addr = (addr & kickmem_bank.mask) >>> 0;
			//var m = (uae_u16 *)(kickmem_bank.baseaddr + addr); do_put_mem_word(m, w);
			kickmem_bank.baseaddr[addr] = w >> 8;
			kickmem_bank.baseaddr[addr+1] = w & 0xff;
		} else if (a1000_kickstart_mode) {
			if (addr >= 0xfc0000) {
				addr = (addr & kickmem_bank.mask) >>> 0;
				//var m = (uae_u16 *)(kickmem_bank.baseaddr + addr); do_put_mem_word(m, w);
				kickmem_bank.baseaddr[addr] = w >> 8;
				kickmem_bank.baseaddr[addr+1] = w & 0xff;
				//return;
			} else
				a1000_handle_kickstart(0);
		} else if (SAEV_config.memory.logIllegal)
			SAEF_warn("Illegal kickmem put16 at %08x", addr);
	}
	function kickmem_put8(addr, b) {
		if (rom_write_enabled) {
			addr = (addr & kickmem_bank.mask) >>> 0;
			kickmem_bank.baseaddr[addr] = b;
		} else if (a1000_kickstart_mode) {
			if (addr >= 0xfc0000) {
				addr = (addr & kickmem_bank.mask) >>> 0;
				kickmem_bank.baseaddr[addr] = b;
				//return;
			} else
				a1000_handle_kickstart(0);
		} else if (SAEV_config.memory.logIllegal)
			SAEF_warn("Illegal kickmem put8 at %08x", addr);
	}
	function kickmem_check(addr, size) {
		addr = (addr & kickmem_bank.mask) >>> 0;
		return (addr + size) <= kickmem_bank.allocated;
	}
	function kickmem_xlate(addr) {
		addr = (addr & kickmem_bank.mask) >>> 0;
		//return kickmem_bank.baseaddr + addr;
		return addr;
	}
	var kickmem_bank = new SAEO_Memory_addrbank(
		kickmem_get32, kickmem_get16, kickmem_get8,
		kickmem_put32, kickmem_put16, kickmem_put8,
		kickmem_xlate, kickmem_check, null, "kick", "Kickstart ROM",
		kickmem_get32, kickmem_get16,
		//SAEC_Memory_addrbank_flag_ROM | SAEC_Memory_addrbank_flag_THREADSAFE, 0, S_WRITE
		SAEC_Memory_addrbank_flag_ROM | SAEC_Memory_addrbank_flag_THREADSAFE
	);

	/*-----------------------------------------------------------------------*/
	/* BANK Kickstart Shadow RAM (maprom) */

	/*function kickmem2_put32(addr, l) {
		addr = (addr & kickmem_bank.mask) >>> 0;
		//var m = (uae_u32 *)(kickmem_bank.baseaddr + addr); do_put_mem_long (m, l);
		kickmem_bank.baseaddr[addr] = l >>> 24;
		kickmem_bank.baseaddr[addr+1] = (l >>> 16) & 0xff;
		kickmem_bank.baseaddr[addr+2] = (l >>> 8) & 0xff;
		kickmem_bank.baseaddr[addr+3] = l & 0xff;
	}
	function kickmem2_put16(addr, w) {
		addr = (addr & kickmem_bank.mask) >>> 0;
		//var m = (uae_u16 *)(kickmem_bank.baseaddr + addr); do_put_mem_word (m, w);
		kickmem_bank.baseaddr[addr] = w >> 8;
		kickmem_bank.baseaddr[addr+1] = w & 0xff;
	}
	function kickmem2_put8(addr, b) {
		addr = (addr & kickmem_bank.mask) >>> 0;
		kickmem_bank.baseaddr[addr] = b;
	}
	var kickram_bank = new SAEO_Memory_addrbank(
		kickmem_get32, kickmem_get16, kickmem_get8,
		kickmem2_put32, kickmem2_put16, kickmem2_put8,
		kickmem_xlate, kickmem_check, null, null, "Kickstart Shadow RAM",
		kickmem_get32, kickmem_get16,
		//SAEC_Memory_addrbank_flag_UNK | SAEC_Memory_addrbank_flag_SAFE, 0, S_WRITE
		SAEC_Memory_addrbank_flag_UNK | SAEC_Memory_addrbank_flag_SAFE
	);*/

	/*-----------------------------------------------------------------------*/
	/* BANK Extended Kickstart ROM */

	var extendedkickmem_type = 0;

	const EXTENDED_ROM_CD32 = 1;
	const EXTENDED_ROM_CDTV = 2;
	const EXTENDED_ROM_KS = 3;
	const EXTENDED_ROM_ARCADIA = 4;

	function extendedkickmem_get32(addr) {
		addr = (addr & extendedkickmem_bank.mask) >>> 0;
		//var m = extendedkickmem_bank.baseaddr + addr; return do_get_mem_long ((uae_u32 *)m);
		return ((extendedkickmem_bank.baseaddr[addr] << 24) | (extendedkickmem_bank.baseaddr[addr+1] << 16) | (extendedkickmem_bank.baseaddr[addr+2] << 8) | extendedkickmem_bank.baseaddr[addr+3]) >>> 0;
	}
	function extendedkickmem_get16(addr) {
		addr = (addr & extendedkickmem_bank.mask) >>> 0;
		//var m = extendedkickmem_bank.baseaddr + addr; return do_get_mem_word ((uae_u16 *)m);
		return (extendedkickmem_bank.baseaddr[addr] << 8) | extendedkickmem_bank.baseaddr[addr+1];
	}
	function extendedkickmem_get8(addr) {
		addr = (addr & extendedkickmem_bank.mask) >>> 0;
		return extendedkickmem_bank.baseaddr[addr];
	}
	function extendedkickmem_put32(addr, b) {
		if (SAEV_config.memory.logIllegal)
			SAEF_warn("Illegal extendedkickmem put32 at %08x", addr);
	}
	function extendedkickmem_put16(addr, b) {
		if (SAEV_config.memory.logIllegal)
			SAEF_warn("Illegal extendedkickmem put16 at %08x", addr);
	}
	function extendedkickmem_put8(addr, b) {
		if (SAEV_config.memory.logIllegal)
			SAEF_warn("Illegal extendedkickmem put32 at %08x", addr);
	}
	function extendedkickmem_check(addr, size) {
		addr = (addr & extendedkickmem_bank.mask) >>> 0;
		return (addr + size) <= extendedkickmem_bank.allocated;
	}
	function extendedkickmem_xlate(addr) {
		addr = (addr & extendedkickmem_bank.mask) >>> 0;
		//return extendedkickmem_bank.baseaddr + addr;
		return addr;
	}
	var extendedkickmem_bank = new SAEO_Memory_addrbank(
		extendedkickmem_get32, extendedkickmem_get16, extendedkickmem_get8,
		extendedkickmem_put32, extendedkickmem_put16, extendedkickmem_put8,
		extendedkickmem_xlate, extendedkickmem_check, null, null, "Extended Kickstart ROM",
		extendedkickmem_get32, extendedkickmem_get16,
		//SAEC_Memory_addrbank_flag_ROM | SAEC_Memory_addrbank_flag_THREADSAFE, 0, S_WRITE
		SAEC_Memory_addrbank_flag_ROM | SAEC_Memory_addrbank_flag_THREADSAFE
	);

	/*-----------------------------------------------------------------------*/
	/* BANK Extended 2nd Kickstart ROM */

	function extendedkickmem2_get32(addr) {
		addr = ((addr - extendedkickmem2_bank.start) & extendedkickmem2_bank.mask) >>> 0;
		//var m = extendedkickmem2_bank.baseaddr + addr; return do_get_mem_long ((uae_u32 *)m);
		return ((extendedkickmem2_bank.baseaddr[addr] << 24) | (extendedkickmem2_bank.baseaddr[addr+1] << 16) | (extendedkickmem2_bank.baseaddr[addr+2] << 8) | extendedkickmem2_bank.baseaddr[addr+3]) >>> 0;
	}
	function extendedkickmem2_get16(addr) {
		addr = ((addr - extendedkickmem2_bank.start) & extendedkickmem2_bank.mask) >>> 0;
		//var m = extendedkickmem2_bank.baseaddr + addr; return do_get_mem_word ((uae_u16 *)m);
		return (extendedkickmem2_bank.baseaddr[addr] << 8) | extendedkickmem2_bank.baseaddr[addr+1];
	}
	function extendedkickmem2_get8(addr) {
		addr = ((addr - extendedkickmem2_bank.start) & extendedkickmem2_bank.mask) >>> 0;
		return extendedkickmem2_bank.baseaddr[addr];
	}
	function extendedkickmem2_put32(addr, b) {
		if (SAEV_config.memory.logIllegal)
			SAEF_warn("Illegal extendedkickmem2 put32 at %08x", addr);
	}
	function extendedkickmem2_put16(addr, b) {
		if (SAEV_config.memory.logIllegal)
			SAEF_warn("Illegal extendedkickmem2 put16 at %08x", addr);
	}
	function extendedkickmem2_put8(addr, b) {
		if (SAEV_config.memory.logIllegal)
			SAEF_warn("Illegal extendedkickmem2 put32 at %08x", addr);
	}
	function extendedkickmem2_check(addr, size) {
		addr = ((addr - extendedkickmem2_bank.start) & extendedkickmem2_bank.mask) >>> 0;
		return (addr + size) <= extendedkickmem2_bank.allocated;
	}
	function extendedkickmem2_xlate(addr) {
		addr = ((addr - extendedkickmem2_bank.start) & extendedkickmem2_bank.mask) >>> 0;
		//return extendedkickmem2_bank.baseaddr + addr;
		return addr;
	}
	var extendedkickmem2_bank = new SAEO_Memory_addrbank(
		extendedkickmem2_get32, extendedkickmem2_get16, extendedkickmem2_get8,
		extendedkickmem2_put32, extendedkickmem2_put16, extendedkickmem2_put8,
		extendedkickmem2_xlate, extendedkickmem2_check, null, "rom_a8", "Extended 2nd Kickstart ROM",
		extendedkickmem2_get32, extendedkickmem2_get16,
		//SAEC_Memory_addrbank_flag_ROM | SAEC_Memory_addrbank_flag_THREADSAFE, 0, S_WRITE
		SAEC_Memory_addrbank_flag_ROM | SAEC_Memory_addrbank_flag_THREADSAFE
	);

	/*-----------------------------------------------------------------------*/
	/* BANK Non-autoconfig RAM */

	function custmem1_get32(addr) {
		addr = (addr & custmem1_bank.mask) >>> 0;
		//var m = custmem1_bank.baseaddr + addr; return do_get_mem_long ((uae_u32 *)m);
		return ((custmem1_bank.baseaddr[addr] << 24) | (custmem1_bank.baseaddr[addr+1] << 16) | (custmem1_bank.baseaddr[addr+2] << 8) | custmem1_bank.baseaddr[addr+3]) >>> 0;
	}
	function custmem1_get16(addr) {
		addr = (addr & custmem1_bank.mask) >>> 0;
		//var m = custmem1_bank.baseaddr + addr; return do_get_mem_word ((uae_u16 *)m);
		return (custmem1_bank.baseaddr[addr] << 8) | custmem1_bank.baseaddr[addr+1];
	}
	function custmem1_get8(addr) {
		addr = (addr & custmem1_bank.mask) >>> 0;
		return custmem1_bank.baseaddr[addr];
	}
	function custmem1_put32(addr, l) {
		addr = (addr & custmem1_bank.mask) >>> 0;
		//var m = custmem1_bank.baseaddr + addr; do_put_mem_long ((uae_u32 *)m, l);
		custmem1_bank.baseaddr[addr] = l >>> 24;
		custmem1_bank.baseaddr[addr+1] = (l >>> 16) & 0xff;
		custmem1_bank.baseaddr[addr+2] = (l >>> 8) & 0xff;
		custmem1_bank.baseaddr[addr+3] = l & 0xff;
	}
	function custmem1_put16(addr, w) {
		addr = (addr & custmem1_bank.mask) >>> 0;
		//var m = custmem1_bank.baseaddr + addr; do_put_mem_word ((uae_u16 *)m, w);
		custmem1_bank.baseaddr[addr] = w >> 8;
		custmem1_bank.baseaddr[addr+1] = w & 0xff;
	}
	function custmem1_put8(addr, b) {
		addr = (addr & custmem1_bank.mask) >>> 0;
		custmem1_bank.baseaddr[addr] = b;
	}
	function custmem1_check(addr, size) {
		addr = (addr & custmem1_bank.mask) >>> 0;
		return (addr + size) <= custmem1_bank.allocated;
	}
	function custmem1_xlate(addr) {
		addr = (addr & custmem1_bank.mask) >>> 0;
		//return custmem1_bank.baseaddr + addr;
		return addr;
	}
	var custmem1_bank = new SAEO_Memory_addrbank(
		custmem1_get32, custmem1_get16, custmem1_get8,
		custmem1_put32, custmem1_put16, custmem1_put8,
		custmem1_xlate, custmem1_check, null, "custmem1", "Non-autoconfig RAM #1",
		custmem1_get32, custmem1_get16,
		//SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE, 0, 0
		SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE
	);

	/*---------------------------------*/

	function custmem2_get32(addr) {
		addr = (addr & custmem2_bank.mask) >>> 0;
		//var m = custmem2_bank.baseaddr + addr; return do_get_mem_long ((uae_u32 *)m);
		return ((custmem2_bank.baseaddr[addr] << 24) | (custmem2_bank.baseaddr[addr+1] << 16) | (custmem2_bank.baseaddr[addr+2] << 8) | custmem2_bank.baseaddr[addr+3]) >>> 0;
	}
	function custmem2_get16(addr) {
		addr = (addr & custmem2_bank.mask) >>> 0;
		//var m = custmem2_bank.baseaddr + addr; return do_get_mem_word ((uae_u16 *)m);
		return (custmem2_bank.baseaddr[addr] << 8) | custmem2_bank.baseaddr[addr+1];
	}
	function custmem2_get8(addr) {
		addr = (addr & custmem2_bank.mask) >>> 0;
		return custmem2_bank.baseaddr[addr];
	}
	function custmem2_put32(addr, l) {
		addr = (addr & custmem2_bank.mask) >>> 0;
		//var m = custmem2_bank.baseaddr + addr; do_put_mem_long ((uae_u32 *)m, l);
		custmem2_bank.baseaddr[addr] = l >>> 24;
		custmem2_bank.baseaddr[addr+1] = (l >>> 16) & 0xff;
		custmem2_bank.baseaddr[addr+2] = (l >>> 8) & 0xff;
		custmem2_bank.baseaddr[addr+3] = l & 0xff;
	}
	function custmem2_put16(addr, w) {
		addr = (addr & custmem2_bank.mask) >>> 0;
		//var m = custmem2_bank.baseaddr + addr; do_put_mem_word ((uae_u16 *)m, w);
		custmem2_bank.baseaddr[addr] = w >> 8;
		custmem2_bank.baseaddr[addr+1] = w & 0xff;
	}
	function custmem2_put8(addr, b) {
		addr = (addr & custmem2_bank.mask) >>> 0;
		custmem2_bank.baseaddr[addr] = b;
	}
	function custmem2_check(addr, size) {
		addr = (addr & custmem2_bank.mask) >>> 0;
		return (addr + size) <= custmem2_bank.allocated;
	}
	function custmem2_xlate(addr) {
		addr = (addr & custmem2_bank.mask) >>> 0;
		//return custmem2_bank.baseaddr + addr;
		return addr;
	}
	var custmem2_bank = new SAEO_Memory_addrbank(
		custmem2_get32, custmem2_get16, custmem2_get8,
		custmem2_put32, custmem2_put16, custmem2_put8,
		custmem2_xlate, custmem2_check, null, "custmem2", "Non-autoconfig RAM #2",
		custmem2_get32, custmem2_get16,
		//SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE, 0, 0
		SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_THREADSAFE
	);

	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/* Kickstart handling */

	const fkickmem_size = ROM_SIZE_512;
	const fkickmem_halfsize = fkickmem_size >> 1; //OWN
	var kickstore = null;
	var a3000_f0 = false;

	this.a3000_fakekick = function(map) {
		//protect_roms(false);
		SAEF_log("memory.a3000_fakekick() map %d", map?1:0);
		if (map) {
			//var fkickmemory = a3000lmem_bank.baseaddr + a3000lmem_bank.allocated - fkickmem_size; //u8 * ATT bomb +
			var fkickmemory = a3000lmem_bank.baseaddr;
			var fkickoffset = a3000lmem_bank.allocated - fkickmem_size; //OWN

			//if (fkickmemory[2] == 0x4e && fkickmemory[3] == 0xf9 && fkickmemory[4] == 0x00) {
			if (fkickmemory[fkickoffset + 2] == 0x4e && fkickmemory[fkickoffset + 3] == 0xf9 && fkickmemory[fkickoffset + 4] == 0x00) {
				if (kickstore === null)
					kickstore = new Uint8Array(fkickmem_size);
				kickstore.set(kickmem_bank.baseaddr.subarray(0, fkickmem_size)); //memcpy (kickstore, kickmem_bank.baseaddr, fkickmem_size);

				//if (fkickmemory[5] == 0xfc) {
				if (fkickmemory[fkickoffset + 5] == 0xfc) {
					kickmem_bank.baseaddr.set(fkickmemory.subarray(0, fkickmem_halfsize)); //memcpy (kickmem_bank.baseaddr, fkickmemory, fkickmem_size / 2);
					kickmem_bank.baseaddr.set(fkickmemory.subarray(0, fkickmem_halfsize), fkickmem_halfsize); //memcpy (kickmem_bank.baseaddr + fkickmem_size / 2, fkickmemory, fkickmem_size / 2);
					extendedkickmem_bank.allocated = 65536;
					extendedkickmem_bank.label = "rom_f0";
					extendedkickmem_bank.mask = extendedkickmem_bank.allocated - 1;
					mapped_malloc(extendedkickmem_bank);
					extendedkickmem_bank.baseaddr.set(fkickmemory.subarray(fkickmem_halfsize, fkickmem_halfsize + 65536)); //memcpy (extendedkickmem_bank.baseaddr, fkickmemory + fkickmem_size / 2, 65536);
					map_banks(extendedkickmem_bank, 0xf0, 1, 1);
					a3000_f0 = true;
				} else
					kickmem_bank.baseaddr.set(fkickmemory.subarray(0, fkickmem_size)); //memcpy (kickmem_bank.baseaddr, fkickmemory, fkickmem_size);
			}
		} else {
			if (a3000_f0) {
				map_banks(SAEV_Memory_dummyBank, 0xf0, 1, 1);
				mapped_free(extendedkickmem_bank);
				a3000_f0 = false;
			}
			if (kickstore !== null) {
				kickmem_bank.baseaddr.set(kickstore); //memcpy (kickmem_bank.baseaddr, kickstore, fkickmem_size);
				kickstore = null;
			}
		}
		//protect_roms(true);
	}

	/*-----------------------------------------------------------------------*/

	function read_kickstart(f, mem,memo, size, dochecksum, noalias) {
		const kickstring = SAEF_String2Array("exec.library");
		const kickstring_length = kickstring.length;
		var buffer = new Uint8Array(20);
		var i, j, oldpos;
		var cr = 0, kickdisk = 0;

		if (size < 0) {
			SAEF_ZFile_fseek(f, 0, SEEK_END);
			size = SAEF_ZFile_ftell(f) & ~0x3ff >>> 0;
			SAEF_ZFile_fseek(f, 0, SEEK_SET);
		}
		oldpos = SAEF_ZFile_ftell(f);
		i = SAEF_ZFile_fread(buffer,0, 1, 11, f);
		if (SAEF_CompareArray(buffer, SAEF_String2Array("KICK"), 4) == 0) {
			SAEF_ZFile_fseek(f, 512, SEEK_SET);
			kickdisk = 1;
		/*#if 0
		} else if (size >= ROM_SIZE_512 && SAEF_CompareArray(buffer, SAEF_String2Array("AMIG"), 4) == 0) {
			//ReKick
			SAEF_ZFile_fseek(f, oldpos + 0x6c, SEEK_SET);
			cr = 2;
		#endif*/
		} else if (SAEF_CompareArray(buffer, SAEF_String2Array("AMIROMTYPE1"), 11) == 0) {
			SAEV_Memory_cloantoRom = true;
			cr = 1;
		} else {
			SAEF_ZFile_fseek(f, oldpos, SEEK_SET);
		}
		//memset(mem, 0, size);
		SAEF_memset(mem,memo, 0, size);
		for (i = 0; i < 8; i++)
			mem[memo + size - 16 + i * 2 + 1] = 0x18 + i;
		mem[memo + size - 20] = size >>> 24;
		mem[memo + size - 19] = (size >>> 16) & 0xff;
		mem[memo + size - 18] = (size >>> 8) & 0xff;
		mem[memo + size - 17] = size & 0xff;

		i = SAEF_ZFile_fread(mem,memo, 1, size, f);

		if (kickdisk && i > ROM_SIZE_256)
			i = ROM_SIZE_256;
		/*#if 0
		if (i >= ROM_SIZE_256 && (i != ROM_SIZE_256 && i != ROM_SIZE_512 && i != ROM_SIZE_512 * 2 && i != ROM_SIZE_512 * 4)) {
			notify_user (NUMSG_KSROMREADERROR);
			return -123;
		}
		#endif*/
		if (i < size - 20)
			SAER.roms.kickstart_fix_checksum(mem,memo, size);

		j = 1;
		while (j < i) j <<= 1;
		i = j;



		if (!noalias && i == size >> 1) {
			//memcpy(mem + size / 2, mem, size / 2);
			SAEF_memcpy(mem,size >> 1, mem,0, size >> 1);
			//mem.copyWithin(memo + (size >> 1), memo, memo + (size >> 1));
		}
		if (cr) {
			var err = SAER.roms.decode_rom(mem,memo, size, cr, i);
			if (err == -1)
				return -SAEE_Memory_RomDecode;
			if (err == -2)
				return -SAEE_Memory_RomKey;
		}
		if (SAEV_config.chipset.a1000ram && i < ROM_SIZE_256) {
			var off = 0;
			if (a1000_bootrom === null)
				a1000_bootrom = new Uint8Array(ROM_SIZE_256);
			while (off + i < ROM_SIZE_256) {
				a1000_bootrom.set(kickmem_bank.baseaddr.subarray(0, i), off); //memcpy (a1000_bootrom + off, kickmem_bank.baseaddr, i);
				off += i;
			}
			//memset(kickmem_bank.baseaddr, 0, kickmem_bank.allocated);
			SAEF_memset(kickmem_bank.baseaddr,0, 0, kickmem_bank.allocated);
			a1000_handle_kickstart(1);
			dochecksum = 0;
			i = ROM_SIZE_512;
		}

		for (j = 0; j < 256 && i >= ROM_SIZE_256; j++) {
			if (SAEF_CompareArrayAfter(mem, memo + j, kickstring, kickstring_length) == 0)
				break;
		}
		if (j == 256 || i < ROM_SIZE_256)
			dochecksum = 0;
		if (dochecksum) {
			if (!SAER.roms.kickstart_verify_checksum(mem,memo, size))
				return -SAEE_Memory_RomChecksum;
		}
		return i > 0 ? i : -SAEE_Memory_RomSize;
	}

	function load_extendedkickstart(romextfile, type) {
		var err = SAEE_None;

		if (romextfile.size == 0)
			return err; //SAEE_Memory_NoExtendedRom;

		/*if (is_arcadia_rom(romextfile) == ARCADIA_BIOS) {
			extendedkickmem_type = EXTENDED_ROM_ARCADIA;
			return false;
		}*/
		//var f = read_rom_name(romextfile);
		var f = SAEF_ZFile_fopen_file(romextfile);
		if (f === null) {
			//notify_user(NUMSG_NOEXTROM);
			return SAEE_Memory_NoExtendedRom;
		}
		SAEF_ZFile_fseek(f, 0, SEEK_END);
		var size = SAEF_ZFile_ftell(f);
		extendedkickmem_bank.allocated = ROM_SIZE_512;

		if (type == 0) {
			/*if (currprefs.cs_cd32cd) {
				extendedkickmem_type = EXTENDED_ROM_CD32;
			} else if (currprefs.cs_cdtvcd || currprefs.cs_cdtvram) {
				extendedkickmem_type = EXTENDED_ROM_CDTV;
			} else*/ if (size > 300000) {
				extendedkickmem_type = EXTENDED_ROM_CD32;
			} else if (SAER.autoconf.need_uae_boot_rom() != 0xf00000) {
				extendedkickmem_type = EXTENDED_ROM_CDTV;
			}
		} else {
			extendedkickmem_type = type;
		}
		SAEF_log("memory.load_extendedkickstart() type %d", extendedkickmem_type);
		if (extendedkickmem_type) {
			var off = 0;
			SAEF_ZFile_fseek(f, off, SEEK_SET);
			switch (extendedkickmem_type) {
				case EXTENDED_ROM_CDTV:
					extendedkickmem_bank.label = "rom_f0";
					mapped_malloc(extendedkickmem_bank);
					extendedkickmem_bank.start = 0xf00000;
					break;
				case EXTENDED_ROM_CD32:
					extendedkickmem_bank.label = "rom_e0";
					mapped_malloc(extendedkickmem_bank);
					extendedkickmem_bank.start = 0xe00000;
					break;
			}

			if (extendedkickmem_bank.baseaddr !== null) {
				extendedkickmem_bank.mask = extendedkickmem_bank.allocated - 1;
				size = read_kickstart(f, extendedkickmem_bank.baseaddr,0, extendedkickmem_bank.allocated, 0, 1);
				if (size < 0)
					err = -size;
			}
		}
		SAEF_ZFile_fclose(f);
		return err;
	}

	function patch_shapeshifter(kickmemory) {
		/* Patch Kickstart ROM for ShapeShifter - from Christian Bauer.
		* Changes "lea $400,a0" and "lea $1000,a0" to "lea $3000,a0" for
		* ShapeShifter compatability. */
		var kickshift1 = [ 0x41, 0xf8, 0x04, 0x00 ];
		var kickshift2 = [ 0x41, 0xf8, 0x10, 0x00 ];
		var kickshift3 = [ 0x43, 0xf8, 0x04, 0x00 ];
		var patched = 0;

		for (var i = 0x200; i < 0x300; i++) {
			if (!SAEF_CompareArrayAfter(kickmemory, i, kickshift1, 4) ||
				 !SAEF_CompareArrayAfter(kickmemory, i, kickshift2, 4) ||
				 !SAEF_CompareArrayAfter(kickmemory, i, kickshift3, 4)
			) {
				kickmemory[i + 2] = 0x30;
				SAEF_log("memory.patch_shapeshifter() KickShifted at %04X", i);
				patched++;
			}
		}
		return patched;
	}

	/* disable incompatible drivers */
	function patch_residents(kickmemory, size) {
		//const residents = [ "NCR scsi.device", "scsi.device", "carddisk.device", "card.resource" ];
		var residents = [];
		var base = size == ROM_SIZE_512 ? 0xf80000 : 0xfc0000;
		var i, j, patched = 0;

		//OWN
		if (SAEV_config.chipset.mbdmac & 1)
			residents.push(SAEF_String2Array("scsi.device"));
		if (SAEV_config.chipset.mbdmac & 2)
			residents.push(SAEF_String2Array("NCR scsi.device"));

		//if (SAEV_config.chipset.mbdmac != 2) //ORG
		if (residents.length) //OWN
		{
			for (i = 0; i < size - 100; i++) {
				if (kickmemory[i] == 0x4a && kickmemory[i + 1] == 0xfc) {
					var addr = (kickmemory[i + 2] << 24) | (kickmemory[i + 3] << 16) | (kickmemory[i + 4] << 8) | (kickmemory[i + 5] << 0);
					if (addr != i + base)
						continue;
					addr = (kickmemory[i + 14] << 24) | (kickmemory[i + 15] << 16) | (kickmemory[i + 16] << 8) | (kickmemory[i + 17] << 0);
					if (addr >= base && addr < base + size) {
						for (j = 0; j < residents.length; j++) {
							if (SAEF_CompareArrayAfter(kickmemory, addr - base, residents[j]) == 0) {
								SAEF_log("memory.patch_residents() '%s' at %08X disabled", SAEF_Array2String(residents[j]), i + base);
								kickmemory[i] = 0x4b; /* destroy RTC_MATCHWORD */
								patched++;
								break;
							}
						}
					}
				}
			}
		}
		return patched;
	}

	function patch_kick() {
		var patched = 0;
		if (kickmem_bank.allocated >= ROM_SIZE_512 && SAEV_config.memory.kickShifter)
			patched += patch_shapeshifter(kickmem_bank.baseaddr);
		patched += patch_residents(kickmem_bank.baseaddr, kickmem_bank.allocated);
		if (extendedkickmem_bank.baseaddr !== null) {
			patched += patch_residents(extendedkickmem_bank.baseaddr, extendedkickmem_bank.allocated);
			if (patched)
				SAER.roms.kickstart_fix_checksum(extendedkickmem_bank.baseaddr,0, extendedkickmem_bank.allocated);
		}
		if (patched)
			SAER.roms.kickstart_fix_checksum(kickmem_bank.baseaddr,0, kickmem_bank.allocated);
	}


	function load_kickstart_replacement() {
		/*extern unsigned char arosrom[];
		extern unsigned int arosrom_len;
		var f = SAEF_ZFile_fopen_data("aros.gz", arosrom_len, arosrom);
		if (!f) return false;
		f = zfile_gunzip(f);
		if (!f) return false;*/

		var f = SAEF_ZFile_fopen_file(SAEV_config.memory.extRom);
		if (!f) return SAEE_Memory_NoExtendedRom;
		extendedkickmem_bank.allocated = ROM_SIZE_512;
		extendedkickmem_bank.mask = ROM_SIZE_512 - 1;
		extendedkickmem_bank.label = "rom_e0";
		extendedkickmem_type = EXTENDED_ROM_KS;
		mapped_malloc(extendedkickmem_bank);
		var size = read_kickstart(f, extendedkickmem_bank.baseaddr,0, ROM_SIZE_512, 0, 1);
		SAEF_ZFile_fclose(f);
		if (size < 0) return -size;

		f = SAEF_ZFile_fopen_file(SAEV_config.memory.rom);
		kickmem_bank.allocated = ROM_SIZE_512;
		kickmem_bank.mask = ROM_SIZE_512 - 1;
		size = read_kickstart(f, kickmem_bank.baseaddr,0, ROM_SIZE_512, 1, 0);
		SAEF_ZFile_fclose(f);
		if (size < 0) return -size;

		// if 68000-68020 config without any other fast ram with m68k aros: enable special extra RAM.
		if (
			SAEV_config.cpu.model <= SAEC_Config_CPU_Model_68020 &&
			SAEV_config.memory.z2FastSize == 0 &&
			SAEV_config.memory.z3FastSize == 0 &&
			SAEV_config.memory.ramsey.highSize == 0 &&
			SAEV_config.memory.ramsey.lowSize == 0
		) {
			var ptr = SAEV_config.memory.custom[0];
			ptr.addr = 0xa80000;
			ptr.size = 512 * 1024;
			ptr.mask = 0;
			ptr = SAEV_config.memory.custom[1];
			ptr.addr = 0xb00000;
			ptr.size = 512 * 1024;
			ptr.mask = 0;
			SAEF_log("memory.load_kickstart_replacement() enabled 1M extra-memory");
		}
		aros = true; //OWN
		return SAEE_None;
	}

	function load_kickstart() {
		SAEV_Memory_cloantoRom = false;
		aros = false; //OWN
		//if (currprefs.romfile == ":AROS")
		if (SAEV_config.memory.rom.name.indexOf("aros") != -1)
			return load_kickstart_replacement();

		//var f = read_rom_name(currprefs.romfile);
		var f = SAEF_ZFile_fopen_file(SAEV_config.memory.rom);
		if (f !== null) {
			var filesize, size, maxsize;
			var kspos = ROM_SIZE_512;
			var extpos = 0;

			maxsize = ROM_SIZE_512;
			SAEF_ZFile_fseek(f, 0, SEEK_END);
			filesize = SAEF_ZFile_ftell(f);
			SAEF_ZFile_fseek(f, 0, SEEK_SET);
			if (filesize == 1760 * 512) {
				filesize = ROM_SIZE_256;
				maxsize = ROM_SIZE_256;
			}
			if (filesize == ROM_SIZE_512 + 8) {
				/* GVP 0xf0 kickstart */
				SAEF_ZFile_fseek(f, 8, SEEK_SET);
			}
			if (filesize >= ROM_SIZE_512 * 2) {
				SAEF_ZFile_fseek(f, kspos, SEEK_SET);
			}
			if (filesize >= ROM_SIZE_512 * 4) {
				kspos = ROM_SIZE_512 * 3;
				extpos = 0;
				SAEF_ZFile_fseek(f, kspos, SEEK_SET);
			}
			size = read_kickstart(f, kickmem_bank.baseaddr,0, maxsize, 1, 0);
			if (size < 0) {
				SAEF_ZFile_fclose(f);
				return -size;
			}
			kickmem_bank.mask = size - 1;
			kickmem_bank.allocated = size;
			if (filesize >= ROM_SIZE_512 * 2 && !extendedkickmem_type) {
				extendedkickmem_bank.allocated = ROM_SIZE_512;
				/*if (currprefs.cs_cdtvcd || currprefs.cs_cdtvram) {
					extendedkickmem_type = EXTENDED_ROM_CDTV;
					extendedkickmem_bank.allocated *= 2;
					extendedkickmem_bank.label = "rom_f0";
					extendedkickmem_bank.start = 0xf00000;
				} else*/ {
					extendedkickmem_type = EXTENDED_ROM_KS;
					extendedkickmem_bank.label = "rom_e0";
					extendedkickmem_bank.start = 0xe00000;
				}
				mapped_malloc(extendedkickmem_bank);
				SAEF_ZFile_fseek(f, extpos, SEEK_SET);
				size = read_kickstart(f, extendedkickmem_bank.baseaddr,0, extendedkickmem_bank.allocated, 0, 1);
				if (size < 0) {
					SAEF_ZFile_fclose(f);
					return -size;
				}
				extendedkickmem_bank.mask = extendedkickmem_bank.allocated - 1;
			}
			if (filesize > ROM_SIZE_512 * 2) {
				extendedkickmem2_bank.allocated = ROM_SIZE_512 * 2;
				mapped_malloc(extendedkickmem2_bank);
				SAEF_ZFile_fseek(f, extpos + ROM_SIZE_512, SEEK_SET);
				size = read_kickstart(f, extendedkickmem2_bank.baseaddr,0, ROM_SIZE_512, 0, 1);
				if (size < 0) {
					SAEF_ZFile_fclose(f);
					return -size;
				}
				SAEF_ZFile_fseek(f, extpos + ROM_SIZE_512 * 2, SEEK_SET);
				size = read_kickstart(f, extendedkickmem2_bank.baseaddr,ROM_SIZE_512, ROM_SIZE_512, 0, 1);
				if (size < 0) {
					SAEF_ZFile_fclose(f);
					return -size;
				}
				extendedkickmem2_bank.mask = extendedkickmem2_bank.allocated - 1;
				extendedkickmem2_bank.start = 0xa80000;
			}
		} else
			return SAEE_Memory_NoKickstartRom;

		kickstart_version = (kickmem_bank.baseaddr[12] << 8) | kickmem_bank.baseaddr[13];
		if (kickstart_version == 0xffff) {
			// 1.0-1.1 and older
			kickstart_version = (kickmem_bank.baseaddr[16] << 8) | kickmem_bank.baseaddr[17];
			if (kickstart_version > 33)
				kickstart_version = 0;
		}
		SAEF_log("memory.load_kickstart() kickstart version %d", kickstart_version);

		SAEF_ZFile_fclose(f);
		return SAEE_None;
	}

	/*-----------------------------------------------------------------------*/
	/* setup/reset */

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

		if (bogomem_aliasing_offset && ab.label == "bogo") //OWN
			bogomem_aliasing_offset = 0;
	}

	function init_mem_banks() {
		// unsigned so i << 16 won't overflow to negative when i >= 32768
		for (var i = 0; i < MEMORY_BANKS; i++)
			//put_mem_bank(i << 16, SAEV_Memory_dummyBank, 0);
			mem_banks[i] = SAEV_Memory_dummyBank;
	}

	function singlebit(v) {
		while (v && !(v & 1)) v >>>= 1;
		return (v & ~1) >>> 0 == 0;
	}

	function allocate() { //allocate_memory()
		bogomem_aliasing = 0;

		var bogoreset = (bogomem_bank.flags & SAEC_Memory_addrbank_flag_NOALLOC) != 0 && (chipmem_bank.allocated != SAEV_config.memory.chipSize || bogomem_bank.allocated != SAEV_config.memory.bogoSize);
		if (bogoreset) {
			mapped_free(chipmem_bank);
			mapped_free(bogomem_bank);
		}

		/* emulate 0.5M+0.5M with 1M Agnus chip ram aliasing */
		if (SAEV_config.memory.chipSize == 0x80000 && SAEV_config.memory.bogoSize >= 0x80000 && SAEV_config.cpu.model < 68020) {
			if ((SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) != 0 && (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) == 0) {
				if ((chipmem_bank.allocated != SAEV_config.memory.chipSize || bogomem_bank.allocated != SAEV_config.memory.bogoSize)) {
					mapped_free(chipmem_bank);
					mapped_free(bogomem_bank);
					//bogomem_bank.allocated = 0;
					var memsize1 = chipmem_bank.allocated = SAEV_config.memory.chipSize;
					var memsize2 = bogomem_bank.allocated = SAEV_config.memory.bogoSize;
					chipmem_bank.mask = chipmem_bank.allocated - 1;
					chipmem_bank.start = chipmem_start_addr;
					chipmem_full_mask = bogomem_bank.allocated * 2 - 1;
					chipmem_full_size = 0x80000 * 2;
					chipmem_bank.allocated = memsize1 + memsize2;
					mapped_malloc(chipmem_bank);
					chipmem_bank.allocated = SAEV_config.memory.chipSize;

					//bogomem_bank.baseaddr = chipmem_bank.baseaddr + memsize1; //ATT +
					bogomem_bank.baseaddr = chipmem_bank.baseaddr;
					bogomem_bank.mask = bogomem_bank.allocated - 1;
					bogomem_bank.start = bogomem_start_addr;
					bogomem_bank.flags |= SAEC_Memory_addrbank_flag_NOALLOC;

					bogomem_aliasing_offset = memsize1; //OWN
					//need_hardreset = true;
				}
				bogomem_aliasing = 1;
			} else if ((SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) == 0 && SAEV_config.chipset.jumper1MbChip) {
				if ((chipmem_bank.allocated != SAEV_config.memory.chipSize || bogomem_bank.allocated != SAEV_config.memory.bogoSize)) {
					mapped_free(chipmem_bank);
					mapped_free(bogomem_bank);
					//bogomem_bank.allocated = 0;
					var memsize1 = chipmem_bank.allocated = SAEV_config.memory.chipSize;
					var memsize2 = bogomem_bank.allocated = SAEV_config.memory.bogoSize;
					chipmem_bank.mask = chipmem_bank.allocated - 1;
					chipmem_bank.start = chipmem_start_addr;
					chipmem_full_mask = chipmem_bank.allocated - 1;
					chipmem_full_size = chipmem_bank.allocated;
					chipmem_bank.allocated = memsize1 + memsize2;
					mapped_malloc(chipmem_bank);
					chipmem_bank.allocated = SAEV_config.memory.chipSize;

					//bogomem_bank.baseaddr = chipmem_bank.baseaddr + memsize1; //ATT +
					bogomem_bank.baseaddr = chipmem_bank.baseaddr;
					bogomem_bank.mask = bogomem_bank.allocated - 1;
					bogomem_bank.start = chipmem_bank.start + SAEV_config.memory.chipSize;
					bogomem_bank.flags |= SAEC_Memory_addrbank_flag_NOALLOC;

					bogomem_aliasing_offset = memsize1; //OWN
					//need_hardreset = true;
				}
				bogomem_aliasing = 2;
			}
		}
		if (bogomem_aliasing)
			SAEF_log("memory.allocate() %dK chip/%dK bogo-ram to %dK chip-ram aliasing enabled", SAEV_config.memory.chipSize >> 10,  SAEV_config.memory.bogoSize >> 10, chipmem_full_size >> 10);

		if (chipmem_bank.allocated != SAEV_config.memory.chipSize || bogoreset) {
			mapped_free(chipmem_bank);
			chipmem_bank.flags &= ~SAEC_Memory_addrbank_flag_NOALLOC;
			if (SAEV_config.memory.chipSize > 2 * 1024 * 1024) {
				if (SAEV_config.memory.z2FastSize >= 524288) SAER.expansion.free_fastmemory_ext(0);
				//if (currprefs.fastmem2_size >= 524288) SAER.expansion.free_fastmemory_ext(1);
			}

			var memsize = chipmem_bank.allocated = chipmem_full_size = SAEV_config.memory.chipSize;
			chipmem_full_mask = chipmem_bank.mask = chipmem_bank.allocated - 1;
			chipmem_bank.start = chipmem_start_addr;
			if (memsize < 0x100000)
				memsize = 0x100000;
			if (memsize > 0x100000 && memsize < 0x200000)
				memsize = 0x200000;
			chipmem_bank.allocated = memsize;
			mapped_malloc(chipmem_bank);
			chipmem_bank.allocated = SAEV_config.memory.chipSize;
			/*if (chipmem_bank.baseaddr == 0) {
				SAEF_error("Fatal error: out of memory for chipmem.");
				chipmem_bank.allocated = 0;
			} else*/ {
				//need_hardreset = true;
				if (memsize > chipmem_bank.allocated) {
					//memset(chipmem_bank.baseaddr + chipmem_bank.allocated, 0xff, memsize - chipmem_bank.allocated);
					SAEF_memset(chipmem_bank.baseaddr,chipmem_bank.allocated, 0xff, memsize - chipmem_bank.allocated);
				}
			}
			chipmem_full_mask = chipmem_bank.allocated - 1;
			if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) {
				if (chipmem_bank.allocated < 0x100000)
					chipmem_full_mask = 0x100000 - 1;
				if (chipmem_bank.allocated > 0x100000 && chipmem_bank.allocated < 0x200000)
					chipmem_full_mask = chipmem_bank.mask = 0x200000 - 1;
			}
			else if (SAEV_config.chipset.jumper1MbChip)
				chipmem_full_mask = 0x80000 - 1;
		}
		SAER_Memory_chipData = chipmem_bank.baseaddr;
		//SAEV_Memory_chipSizeReal = chipmem_full_size;
		SAEV_Memory_chipMask = chipmem_full_mask;

		if (bogomem_bank.allocated != SAEV_config.memory.bogoSize || bogoreset) {
			if (!(bogomem_bank.allocated == 0x200000 && SAEV_config.memory.bogoSize == 0x180000)) {
				mapped_free(bogomem_bank);
				bogomem_bank.flags &= ~SAEC_Memory_addrbank_flag_NOALLOC;
				bogomem_bank.allocated = 0;

				bogomem_bank.allocated = SAEV_config.memory.bogoSize;
				if (bogomem_bank.allocated >= 0x180000)
					bogomem_bank.allocated = 0x200000;
				bogomem_bank.mask = bogomem_bank.allocated - 1;
				bogomem_bank.start = bogomem_start_addr;

				if (bogomem_bank.allocated) {
					if (!mapped_malloc(bogomem_bank)) {
						//SAEF_error("Out of memory for bogomem.");
						//bogomem_bank.allocated = 0;
					}
				}
				//need_hardreset = true;
			}
		}
		/*if (mem25bit_bank.allocated != currprefs.mem25bit_size) {
			mapped_free(mem25bit_bank);

			mem25bit_bank.allocated = currprefs.mem25bit_size;
			mem25bit_bank.mask = mem25bit_bank.allocated - 1;
			mem25bit_bank.start = 0x01000000;
			if (mem25bit_bank.allocated) {
				if (!mapped_malloc(mem25bit_bank)) {
					SAEF_error("Out of memory for 25 bit memory.");
					mem25bit_bank.allocated = 0;
				}
			}
			need_hardreset = true;
		}*/
		if (a3000lmem_bank.allocated != SAEV_config.memory.ramsey.lowSize) {
			mapped_free(a3000lmem_bank);

			a3000lmem_bank.allocated = SAEV_config.memory.ramsey.lowSize;
			a3000lmem_bank.mask = a3000lmem_bank.allocated - 1;
			a3000lmem_bank.start = 0x08000000 - a3000lmem_bank.allocated;
			if (a3000lmem_bank.allocated) {
				if (!mapped_malloc(a3000lmem_bank)) {
					//SAEF_error("Out of memory for a3000lowmem.");
					//a3000lmem_bank.allocated = 0;
				}
			}
			//need_hardreset = true;
		}
		if (a3000hmem_bank.allocated != SAEV_config.memory.ramsey.highSize) {
			mapped_free(a3000hmem_bank);

			a3000hmem_bank.allocated = SAEV_config.memory.ramsey.highSize;
			a3000hmem_bank.mask = a3000hmem_bank.allocated - 1;
			a3000hmem_bank.start = 0x08000000;
			if (a3000hmem_bank.allocated) {
				if (!mapped_malloc(a3000hmem_bank)) {
					//SAEF_error("Out of memory for a3000highmem.");
					//a3000hmem_bank.allocated = 0;
				}
			}
			//need_hardreset = true;
		}
		/*#ifdef CDTV
		if (cardmem_bank.allocated != currprefs.cs_cdtvcard * 1024) {
			mapped_free(cardmem_bank);
			cardmem_bank.baseaddr = null;

			cardmem_bank.allocated = currprefs.cs_cdtvcard * 1024;
			cardmem_bank.mask = cardmem_bank.allocated - 1;
			cardmem_bank.start = 0xe00000;
			if (cardmem_bank.allocated) {
				if (!mapped_malloc(cardmem_bank)) {
					SAEF_error("Out of memory for cardmem.");
					cardmem_bank.allocated = 0;
				}
			}
			cdtv_loadcardmem(cardmem_bank.baseaddr, cardmem_bank.allocated);
		}
		#endif*/

		if (custmem1_bank.allocated != SAEV_config.memory.custom[0].size) {
			mapped_free(custmem1_bank);
			custmem1_bank.allocated = SAEV_config.memory.custom[0].size;
			// custmem1 and 2 can have non-power of 2 size so only set correct mask if size is power of 2.
			custmem1_bank.mask = singlebit(custmem1_bank.allocated) ? custmem1_bank.allocated - 1 : -1;
			custmem1_bank.start = SAEV_config.memory.custom[0].addr;
			if (custmem1_bank.allocated) {
				if (!mapped_malloc(custmem1_bank))
					custmem1_bank.allocated = 0;
			}
		}
		if (custmem2_bank.allocated != SAEV_config.memory.custom[1].size) {
			mapped_free(custmem2_bank);
			custmem2_bank.allocated = SAEV_config.memory.custom[1].size;
			custmem2_bank.mask = singlebit(custmem2_bank.allocated) ? custmem2_bank.allocated - 1 : -1;
			custmem2_bank.start = SAEV_config.memory.custom[1].addr;
			if (custmem2_bank.allocated) {
				if (!mapped_malloc(custmem2_bank))
					custmem2_bank.allocated = 0;
			}
		}

		/*#ifdef AGA
		chipmem_bank_ce2.baseaddr = chipmem_bank.baseaddr;
		#endif*/

		//cpuboard_init();
	}

	function fill_ce_banks() {
		var i = 0;

		if (SAEV_config.cpu.model <= SAEC_Config_CPU_Model_68010) {
			//memset(ce_banktype, SAEC_Memory_banktype_FAST16, sizeof ce_banktype);
			SAEF_memset(ce_banktype,0, SAEC_Memory_banktype_FAST16, 65536);
		} else {
			//memset(ce_banktype, SAEC_Memory_banktype_FAST32, sizeof ce_banktype);
			SAEF_memset(ce_banktype,0, SAEC_Memory_banktype_FAST32, 65536);
		}

		/*memset(ce_cachable, 0, sizeof ce_cachable);
		memset(ce_cachable + (0x00200000 >> 16), 1 | 2, currprefs.fastmem_size >> 16);
		memset(ce_cachable + (0x00c00000 >> 16), 1, currprefs.bogomem_size >> 16);
		memset(ce_cachable + (z3fastmem_bank.start >> 16), 1 | 2, currprefs.z3fastmem_size >> 16);
		memset(ce_cachable + (z3fastmem2_bank.start >> 16), 1 | 2, currprefs.z3fastmem2_size >> 16);
		memset(ce_cachable + (a3000hmem_bank.start >> 16), 1 | 2, currprefs.mbresmem_high_size >> 16);
		memset(ce_cachable + (a3000lmem_bank.start >> 16), 1 | 2, currprefs.mbresmem_low_size >> 16);
		memset(ce_cachable + (mem25bit_bank.start >> 16), 1 | 2, currprefs.mem25bit_size >> 16);*/

		SAEF_memset(ce_cachable,0, 0, 65536);
		SAEF_memset(ce_cachable,0x00200000 >>> 16, 1 | 2, SAEV_config.memory.z2FastSize >>> 16);
		SAEF_memset(ce_cachable,0x00c00000 >>> 16, 1, SAEV_config.memory.bogoSize >>> 16);
		SAEF_memset(ce_cachable,SAER_Expansion_z3fastmem_bank.start >>> 16, 1 | 2, SAEV_config.memory.z3FastSize >>> 16);
		//SAEF_memset(ce_cachable,z3fastmem2_bank.start >>> 16, 1 | 2, currprefs.z3fastmem2_size >>> 16);
		SAEF_memset(ce_cachable,a3000hmem_bank.start >>> 16, 1 | 2, SAEV_config.memory.ramsey.highSize >>> 16);
		SAEF_memset(ce_cachable,a3000lmem_bank.start >>> 16, 1 | 2, SAEV_config.memory.ramsey.lowSize >>> 16);
		//SAEF_memset(ce_cachable,mem25bit_bank.start >>> 16, 1 | 2, currprefs.mem25bit_size >>> 16);

		//if (get_mem_bank(0).flags & SAEC_Memory_addrbank_flag_CHIPRAM) {
		if (mem_banks[0].flags & SAEC_Memory_addrbank_flag_CHIPRAM) {
			for (i = 0; i < (0x200000 >>> 16); i++) {
				ce_banktype[i] = (SAEV_config.chipset.mbdmac || (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA)) ? SAEC_Memory_banktype_CHIP32 : SAEC_Memory_banktype_CHIP16;
			}
		}
		if (!SAEV_config.chipset.bogomemIsFast) {
			for (i = (0xc00000 >>> 16); i < (0xe00000 >>> 16); i++)
				ce_banktype[i] = ce_banktype[0];
			for (i = (bogomem_bank.start >>> 16); i < ((bogomem_bank.start + bogomem_bank.allocated) >>> 16); i++)
				ce_banktype[i] = ce_banktype[0];
		}
		for (i = (0xd00000 >>> 16); i < (0xe00000 >>> 16); i++)
			ce_banktype[i] = SAEC_Memory_banktype_CHIP16;
		for (i = (0xa00000 >>> 16); i < (0xc00000 >>> 16); i++) {
			ce_banktype[i] = SAEC_Memory_banktype_CIA;
			//var b = get_mem_bank(i << 16);
			var b = mem_banks[i];
			if (!(b.flags & SAEC_Memory_addrbank_flag_CIA)) {
				ce_banktype[i] = SAEC_Memory_banktype_FAST32;
				ce_cachable[i] = 1;
			}
		}
		// CD32 ROM is 16-bit
		/*if (currprefs.cs_cd32cd) {
			for (i = (0xe00000 >>> 16); i < (0xe80000 >>> 16); i++)
				ce_banktype[i] = SAEC_Memory_banktype_FAST16;
			for (i = (0xf80000 >>> 16); i <= (0xff0000 >>> 16); i++)
				ce_banktype[i] = SAEC_Memory_banktype_FAST16;
		}*/
		// A4000T NCR is 32-bit
		if (SAEV_config.chipset.mbdmac == 2) {
			ce_banktype[0xdd0000 >>> 16] = SAEC_Memory_banktype_FAST32;
		}
		if (SAEV_config.cpu.addressSpace24) {
			for (i = 1; i < 256; i++) {
				//memcpy(&ce_banktype[i * 256], &ce_banktype[0], 256);
				for (var j = 0; j < 256; j++) ce_banktype[i * 256 + j] = ce_banktype[j];
			}
		}
	}

	this.mapOverlay = function(chip) {
		var size = chipmem_bank.allocated >= 0x180000 ? (chipmem_bank.allocated >>> 16) : 32;
		if (bogomem_aliasing)
			size = 8;

		var cb = chipmem_bank;
		if (chip) {
			map_banks(SAEV_Memory_dummyBank, 0, size, 0);
			if ((SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) && bogomem_bank.allocated == 0) {
				map_banks(cb, 0, size, chipmem_bank.allocated);
				var start = chipmem_bank.allocated >>> 16;
				if (chipmem_bank.allocated < 0x100000) {
					if (SAEV_config.chipset.jumper1MbChip) {
						var dummy = (0x100000 - chipmem_bank.allocated) >>> 16;
						map_banks(chipmem_dummy_bank, start, dummy, 0);
						map_banks(chipmem_dummy_bank, start + 16, dummy, 0);
					}
				} else if (chipmem_bank.allocated < 0x200000 && chipmem_bank.allocated > 0x100000) {
					var dummy = (0x200000 - chipmem_bank.allocated) >>> 16;
					map_banks(chipmem_dummy_bank, start, dummy, 0);
				}
			} else
				map_banks(cb, 0, 32, chipmem_bank.allocated);
		} else {
			var rb = null;
			if (size < 32 && bogomem_aliasing == 0)
				size = 32;
			//cb = get_mem_bank_real(0xf00000);
			cb = mem_banks[0xf00000 >>> 16];
			if (rb === null && cb && (cb.flags & SAEC_Memory_addrbank_flag_ROM) && get16(0xf00000) == 0x1114)
				rb = cb;
			//cb = get_mem_bank_real(0xe00000);
			cb = mem_banks[0xe00000 >>> 16];
			if (rb === null && cb && (cb.flags & SAEC_Memory_addrbank_flag_ROM) && get16(0xe00000) == 0x1114)
				rb = cb;
			if (rb === null)
				rb = kickmem_bank;
			map_banks(rb, 0, size, 0x80000);
		}
		fill_ce_banks();
		//cpuboard_overlay_override();
		if (check_address(SAER_CPU_regs.pc, 4))
			SAER.cpu.setPC_normal(SAER_CPU_getPC());
	}

	this.getz2size = function(p) {
		var start = p.memory.z2FastSize;
		/*if (p.rtgmem_size && gfxboard_get_configtype(p.rtgmem_type) == 2) {
			while (start & (p.rtgmem_size - 1) && start < 8 * 1024 * 1024)
				start += 1024 * 1024;
			if (start + p.rtgmem_size > 8 * 1024 * 1024)
				return -1;
		}
		start += p.rtgmem_size;*/
		return start;
	}
	this.getz2endaddr = function() {
		var start = SAEV_config.memory.z2FastSize;
		/*if (currprefs.rtgmem_size && gfxboard_get_configtype(currprefs.rtgmem_type) == 2) {
			if (!start)
				start = 0x00200000;
			while (start & (currprefs.rtgmem_size - 1) && start < 4 * 1024 * 1024)
				start += 1024 * 1024;
		}*/
		return start + 2 * 1024 * 1024;
	}

	function restore_roms() {
		var err;

		//protect_roms(false);
		SAEF_log("memory.restore_roms() loading '%s'...", SAEV_config.memory.rom.name);
		//kickstart_rom = true;

		a1000_handle_kickstart(0);
		//xfree(a1000_bootrom);
		a1000_bootrom = null;
		a1000_kickstart_mode = false;

		//need_hardreset = true;
		mapped_free(extendedkickmem_bank); extendedkickmem_bank.allocated = 0;
		mapped_free(extendedkickmem2_bank); extendedkickmem2_bank.allocated = 0;
		extendedkickmem_type = 0;
		err = load_extendedkickstart(SAEV_config.memory.extRom, 0);
		if (err != SAEE_None) return err;
		//load_extendedkickstart(currprefs.romextfile, 0);
		//load_extendedkickstart(currprefs.romextfile2, EXTENDED_ROM_CDTV);

		kickmem_bank.mask = ROM_SIZE_512 - 1;
		if ((err = load_kickstart()) == SAEE_None) {
			if (!aros) {
				var rd = SAER.roms.getromdatabydata(kickmem_bank.baseaddr, kickmem_bank.allocated);
				if (rd !== null) {
					SAEF_log("memory.restore_roms() identified rom as '%s'", rd.name);
					if ((rd.cpu & 8) && SAEV_config.cpu.model < SAEC_Config_CPU_Model_68030) {
						//notify_user(NUMSG_KS68030PLUS); uae_restart(-1, null);
						return SAEE_CPU_Requires68030;
					} else if ((rd.cpu & 3) == 3 && SAEV_config.cpu.model != SAEC_Config_CPU_Model_68030) {
						//notify_user(NUMSG_KS68030); uae_restart(-1, null);
						return SAEE_CPU_Requires68030;
					} else if ((rd.cpu & 3) == 1 && SAEV_config.cpu.model < SAEC_Config_CPU_Model_68020) {
						//notify_user(NUMSG_KS68EC020); uae_restart(-1, null);
						return SAEE_CPU_Requires680EC20;
					} else if ((rd.cpu & 3) == 2 && (SAEV_config.cpu.model < SAEC_Config_CPU_Model_68020 || SAEV_config.cpu.addressSpace24)) {
						//notify_user(NUMSG_KS68020); uae_restart(-1, null);
						return SAEE_CPU_Requires68020;
					}
					if (rd.cloanto)
						SAEV_Memory_cloantoRom = true;
					/*kickstart_rom = false;
					if ((rd.type & (SAEC_RomType_SPECIALKICK | SAEC_RomType_KICK)) == SAEC_RomType_KICK)
						kickstart_rom = true;*/
					if ((rd.cpu & 4) && SAEV_config.chipset.compatible != SAEC_Config_Chipset_Compatible_Manual) {
						//A4000 ROM = need ramsey, gary and ide
						if (SAEV_config.chipset.ramseyRev < 0)
							SAEV_config.chipset.ramseyRev = 0x0f;
						SAEV_config.chipset.fatGaryRev = 0;
						if (SAEV_config.chipset.ide != SAEC_Config_Chipset_IDE_A4000)
							SAEV_config.chipset.ide = -1;
					}
				} else
					SAEF_log("memory.restore_roms() unknown rom '%s' loaded", SAEV_config.memory.rom.name);
			}
		} else {
			/*if (SAEV_config.memory.rom.name.length > 0) {
				SAEF_error("Failed to open '%s'", SAEV_config.memory.rom.name);
				notify_user(NUMSG_NOROM);
			}*/
			//load_kickstart_replacement();
		}
		if (err == SAEE_None) //OWN
			patch_kick();

		SAEF_log("memory.restore_roms() ...done.");
		//protect_roms(true);
		return err;
	}

	function setup() { //memory_init()
		init_mem_banks();
		SAER.devices.virtualdevice_init();

		chipmem_bank.allocated = 0;
		chipmem_bank.baseaddr = null;

		bogomem_bank.allocated = 0;
		bogomem_bank.baseaddr = null;
		//bogomem_aliasing_offset = 0; //OWN

		extendedkickmem_bank.allocated = 0;
		extendedkickmem_bank.baseaddr = null;
		extendedkickmem2_bank.allocated = 0;
		extendedkickmem2_bank.baseaddr = null;
		extendedkickmem_type = 0;

		//mem25bit_bank.allocated = 0;
		//mem25bit_bank.baseaddr = null;
		a3000lmem_bank.allocated = 0;
		a3000lmem_bank.baseaddr = null;
		a3000hmem_bank.allocated = 0;
		a3000hmem_bank.baseaddr = null;

		//cardmem_bank.allocated = 0;
		//cardmem_bank.baseaddr = null;
		custmem1_bank.allocated = 0;
		custmem1_bank.baseaddr = null;
		custmem2_bank.allocated = 0;
		custmem2_bank.baseaddr = null;

		kickmem_bank.allocated = ROM_SIZE_512;
		kickmem_bank.baseaddr = null;
		mapped_malloc(kickmem_bank);
		//memset(kickmem_bank.baseaddr, 0, ROM_SIZE_512);
		SAEF_memset(kickmem_bank.baseaddr,0, 0, ROM_SIZE_512);

		//currprefs.romfile = "<none>";
		//currprefs.romextfile = "";

		//cpuboard_reset();

		/*#ifdef ACTION_REPLAY
		action_replay_unload (0);
		action_replay_load ();
		action_replay_init (1);
		#ifdef ACTION_REPLAY_HRTMON
		hrtmon_load();
		#endif
		#endif*/
	}

	this.cleanup = function() { //memory_cleanup()
		//mapped_free(mem25bit_bank); mem25bit_bank.baseaddr = null;
		mapped_free(a3000lmem_bank); a3000lmem_bank.baseaddr = null;
		mapped_free(a3000hmem_bank); a3000hmem_bank.baseaddr = null;
		mapped_free(bogomem_bank); bogomem_bank.baseaddr = null;
		mapped_free(kickmem_bank); kickmem_bank.baseaddr = null;
		//xfree(a1000_bootrom);
		a1000_bootrom = null;
		a1000_kickstart_mode = false;
		mapped_free(chipmem_bank); chipmem_bank.baseaddr = null;
		/*#ifdef CDTV
		if (cardmem_bank.baseaddr !== null) {
			cdtv_savecardmem(cardmem_bank.baseaddr, cardmem_bank.allocated);
			mapped_free(cardmem_bank); cardmem_bank.baseaddr = null;
		}
		#endif*/
		mapped_free(custmem1_bank); custmem1_bank.baseaddr = null;
		mapped_free(custmem2_bank); custmem2_bank.baseaddr = null;

		//cpuboard_cleanup();

		/*#ifdef ACTION_REPLAY
		action_replay_cleanup();
		#endif
		#ifdef ARCADIA
		arcadia_unmap();
		#endif*/
	}

	function map_banks_set(bank, start, size, realsize) {
		bank.start = start << 16; //OWN
		bank.startmask = start << 16;
		map_banks(bank, start, size, realsize);
	}
	this.reset = function(hardreset) { //memory_reset()
		//need_hardreset = false;
		rom_write_enabled = true;
		/* Use changed_prefs, as m68k_reset is called later.  */
		/*if (lastAaddressSpace24 != SAEV_config.cpu.addressSpace24) {
			lastAaddressSpace24 = SAEV_config.cpu.addressSpace24;
			need_hardreset = true;
		}*/

		if (mem_hardreset > 2)
			setup();

		SAEV_Memory_defaultXLate_cnt = 0; //OWN
		SAEV_Memory_defaultXLate_recursive = 0; //OWN
		dummylog_cnt = 0; //OWN
		gary_wait_cnt = 50; //OWN

		/*SAEV_config.memory.chipSize = changed_prefs.chipmem_size;
		SAEV_config.memory.bogoSize  = changed_prefs.bogomem_size;
		SAEV_config.memory.ramsey.lowSize = changed_prefs.mbresmem_low_size;
		SAEV_config.memory.ramsey.highSize = changed_prefs.mbresmem_high_size;
		SAEV_config.chipset.mirrorE0 = changed_prefs.cs_ksmirror_e0;
		SAEV_config.chipset.mirrorA8 = changed_prefs.cs_ksmirror_a8;
		currprefs.cs_cdtvram = changed_prefs.cs_cdtvram;
		currprefs.cs_cdtvcard = changed_prefs.cs_cdtvcard;
		SAEV_config.chipset.a1000ram = changed_prefs.cs_a1000ram;
		SAEV_config.chipset.ide = changed_prefs.cs_ide;
		SAEV_config.chipset.fatGaryRev = changed_prefs.cs_fatgaryrev;
		SAEV_config.chipset.ramseyRev = changed_prefs.cs_ramseyrev;*/

		//cpuboard_reset();

		var gayleorfatgary = (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) != 0 || SAEV_config.chipset.pcmcia || SAEV_config.chipset.ide > 0 || SAEV_config.chipset.mbdmac;

		init_mem_banks();
		allocate();
		chipmem_setindirect();

		if (mem_hardreset > 1 || (a1000_bootrom !== null && hardreset && SAER.cpu.is_hardreset())
			// || _tcscmp (currprefs.romfile, changed_prefs.romfile) != 0
			// || _tcscmp (currprefs.romextfile, changed_prefs.romextfile) != 0
		) {
			var err = restore_roms();
			if (err != SAEE_None) return err;
		}
		/*if ((SAEV_Memory_cloantoRom || extendedkickmem_bank.allocated) && SAEV_config.memory.maprom && SAEV_config.memory.maprom < 0x01000000) {
			SAEV_config.memory.maprom = 0x00a80000;
			if (extendedkickmem2_bank.allocated) // can't do if 2M ROM
				SAEV_config.memory.maprom = 0;
		}*/

		map_banks(SAEV_Custom_bank, 0xC0, 0xE0 - 0xC0, 0);
		map_banks(SAEV_CIA_bank, 0xA0, 32, 0);
		if (!SAEV_config.chipset.a1000ram && SAEV_config.chipset.rtc.type != SAEC_Config_RTC_Type_MSM6242B_A2000)
			/* D80000 - DDFFFF not mapped (A1000 or A2000 = custom chips) */
			map_banks(SAEV_Memory_dummyBank, 0xD8, 6, 0);

		/* map "nothing" to 0x200000 - 0x9FFFFF (0xBEFFFF if Gayle or Fat Gary) */
		var bnk = chipmem_bank.allocated >>> 16;
		if (bnk < 0x20 + (SAEV_config.memory.z2FastSize >>> 16))
			bnk = 0x20 + (SAEV_config.memory.z2FastSize >>> 16);
		var bnk_end = gayleorfatgary ? 0xBF : 0xA0;
		map_banks(SAEV_Memory_dummyBank, bnk, bnk_end - bnk, 0);
		if (gayleorfatgary) {
			 // a3000 or a4000 = custom chips from 0xc0 to 0xd0
			if (SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A4000 || SAEV_config.chipset.mbdmac)
				map_banks(SAEV_Memory_dummyBank, 0xd0, 8, 0);
			else
				map_banks(SAEV_Memory_dummyBank, 0xc0, 0xd8 - 0xc0, 0);
		}

		if (bogomem_bank.baseaddr !== null) {
			var t = SAEV_config.memory.bogoSize >>> 16;
			if (t > 0x1C)
				t = 0x1C;
			if (t > 0x18 && ((SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) || (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68020 && SAEV_config.cpu.addressSpace24 == false)))
				t = 0x18;
			if (bogomem_aliasing == 2)
				map_banks(bogomem_bank, 0x08, t, 0);
			else
				map_banks(bogomem_bank, 0xC0, t, 0);
		}
		if (SAEV_config.chipset.ide || SAEV_config.chipset.pcmcia) {
			if (SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A600A1200 || SAEV_config.chipset.pcmcia) {
				map_banks(SAEV_Gayle_bank, 0xD8, 6, 0);
				map_banks(SAEV_Gayle2_bank, 0xDD, 2, 0);
			}
			SAER.gayle.map_pcmcia();
			if (SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A4000 || SAEV_config.chipset.mbdmac == 2)
				map_banks(SAEV_Gayle_bank, 0xDD, 1, 0);
			if (SAEV_config.chipset.ide < 0 && !SAEV_config.chipset.pcmcia)
				map_banks(SAEV_Gayle_bank, 0xD8, 6, 0);
			if (SAEV_config.chipset.ide < 0)
				map_banks(SAEV_Gayle_bank, 0xDD, 1, 0);
		}
		if (SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_MSM6242B_A2000) // A2000 clock
			map_banks(SAEV_RTC_bank, 0xD8, 4, 0);
		//if (SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_MSM6242B || SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_RF5C01A || currprefs.cs_cdtvram)
		if (SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_MSM6242B || SAEV_config.chipset.rtc.type == SAEC_Config_RTC_Type_RF5C01A)
			map_banks(SAEV_RTC_bank, 0xDC, 1, 0);
		else if (SAEV_config.chipset.mirrorA8 || SAEV_config.chipset.ide > 0 || SAEV_config.chipset.pcmcia)
			map_banks(SAEV_RTC_bank, 0xDC, 1, 0); /* none clock */

		if (SAEV_config.chipset.fatGaryRev >= 0 || SAEV_config.chipset.ramseyRev >= 0)
			map_banks(SAEV_MBRes_bank, 0xDE, 1, 0);

		/*#ifdef CD32
		if (currprefs.cs_cd32c2p || currprefs.cs_cd32cd || currprefs.cs_cd32nvram) {
			map_banks(akiko_bank, AKIKO_BASE >>> 16, 1, 0);
			map_banks(SAEV_Gayle2_bank, 0xDD, 2, 0);
		}
		#endif
		#ifdef CDTV
		if (currprefs.cs_cdtvcr) {
			map_banks(cdtvcr_bank, 0xB8, 1, 0);
		} else if (currprefs.cs_cdtvcd) {
			cdtv_check_banks();
		}
		#endif
		#ifdef A2091
		if (SAEV_config.chipset.mbdmac == 1)
			a3000scsi_reset();
		#endif*/

		//if (mem25bit_bank.baseaddr !== null) map_banks(mem25bit_bank, mem25bit_bank.start >>> 16, mem25bit_bank.allocated >>> 16, 0);
		if (a3000lmem_bank.baseaddr !== null) map_banks(a3000lmem_bank, a3000lmem_bank.start >>> 16, a3000lmem_bank.allocated >>> 16, 0);
		if (a3000hmem_bank.baseaddr !== null) map_banks(a3000hmem_bank, a3000hmem_bank.start >>> 16, a3000hmem_bank.allocated >>> 16, 0);
		/*#ifdef CDTV
		if (cardmem_bank.baseaddr !== null) map_banks(cardmem_bank, cardmem_bank.start >>> 16, cardmem_bank.allocated >>> 16, 0);
		#endif*/
		//cpuboard_map();
		map_banks_set(kickmem_bank, 0xF8, 8, 0);
		/*if (SAEV_config.memory.maprom) {
			if (!cpuboard_maprom())
				map_banks_set(kickram_bank, SAEV_config.memory.maprom >>> 16, extendedkickmem2_bank.allocated ? 32 : (extendedkickmem_bank.allocated ? 16 : 8), 0);
		}*/
		/* map beta Kickstarts at 0x200000/0xC00000/0xF00000 */
		if (kickmem_bank.baseaddr[0] == 0x11 && kickmem_bank.baseaddr[2] == 0x4e && kickmem_bank.baseaddr[3] == 0xf9 && kickmem_bank.baseaddr[4] == 0x00) {
			var addr = kickmem_bank.baseaddr[5];
			if (addr == 0x20 && SAEV_config.memory.chipSize <= 0x200000 && SAEV_config.memory.z2FastSize == 0)
				map_banks_set(kickmem_bank, addr, 8, 0);
			if (addr == 0xC0 && SAEV_config.memory.bogoSize == 0)
				map_banks_set(kickmem_bank, addr, 8, 0);
			if (addr == 0xF0)
				map_banks_set(kickmem_bank, addr, 8, 0);
		}

		if (a1000_bootrom !== null)
			a1000_handle_kickstart(1);

		//#ifdef AUTOCONFIG
		map_banks(SAER_Expansion_expamem_bank, 0xE8, 1, 0);
		//#endif

		if (a3000_f0)
			map_banks_set(extendedkickmem_bank, 0xf0, 1, 0);

		/* Map the chipmem into all of the lower 8MB */
		this.mapOverlay(true);

		switch (extendedkickmem_type) {
			case EXTENDED_ROM_KS:
				map_banks_set(extendedkickmem_bank, 0xE0, 8, 0);
				break;
			//#ifdef CDTV
			case EXTENDED_ROM_CDTV:
				map_banks_set(extendedkickmem_bank, 0xF0, extendedkickmem_bank.allocated == 2 * ROM_SIZE_512 ? 16 : 8, 0);
				break;
			//#endif
			//#ifdef CD32
			case EXTENDED_ROM_CD32:
				map_banks_set(extendedkickmem_bank, 0xE0, 8, 0);
				break;
			//#endif
		}

		//#ifdef AUTOCONFIG
		if (SAER.autoconf.need_uae_boot_rom()) // && currprefs.uaeboard < 2)
			map_banks_set(SAER_AutoConf_bank, SAEV_AutoConf_base >>> 16, 1, 0);
		//#endif

		//if ((SAEV_Memory_cloantoRom || SAEV_config.chipset.mirrorE0) && SAEV_config.memory.maprom != 0xe00000 && !extendedkickmem_type)
		if ((SAEV_Memory_cloantoRom || SAEV_config.chipset.mirrorE0) && !extendedkickmem_type)
			map_banks(kickmem_bank, 0xE0, 8, 0);

		if (SAEV_config.chipset.mirrorA8) {
			if (extendedkickmem2_bank.allocated) {
				map_banks_set(extendedkickmem2_bank, 0xa8, 16, 0);
			} else {
				//var rd = getromdatabypath(currprefs.cartfile);
				//if (!rd || rd.id != 63)
				{
					if (extendedkickmem_type == EXTENDED_ROM_CD32 || extendedkickmem_type == EXTENDED_ROM_KS)
						map_banks(extendedkickmem_bank, 0xb0, 8, 0);
					else
						map_banks(kickmem_bank, 0xb0, 8, 0);
					map_banks(kickmem_bank, 0xa8, 8, 0);
				}
			}
		}

		/*#ifdef ARCADIA
		if (is_arcadia_rom (currprefs.romextfile) == ARCADIA_BIOS) {
			if (_tcscmp (currprefs.romextfile, changed_prefs.romextfile) != 0)
				memcpy (currprefs.romextfile, changed_prefs.romextfile, sizeof currprefs.romextfile);
			if (_tcscmp (currprefs.cartfile, changed_prefs.cartfile) != 0)
				memcpy (currprefs.cartfile, changed_prefs.cartfile, sizeof currprefs.cartfile);
			arcadia_unmap ();
			is_arcadia_rom (currprefs.romextfile);
			is_arcadia_rom (currprefs.cartfile);
			arcadia_map_banks ();
		}
		#endif
		#ifdef ACTION_REPLAY
		#ifdef ARCADIA
		if (!arcadia_bios) {
		#endif
			action_replay_memory_reset ();
		#ifdef ARCADIA
		}
		#endif
		#endif*/

		for (var i = 0; i < 2; i++) {
			var ptr = SAEV_config.memory.custom[i];
			if (ptr.size) {
				map_banks(i == 0 ? custmem1_bank : custmem2_bank, ptr.addr >>> 16, ptr.size >>> 16, 0);
				if (ptr.mask) {
					for (var j = ptr.addr; j & ptr.mask; j += ptr.size) {
						map_banks(i == 0 ? custmem1_bank : custmem2_bank, j >>> 16, ptr.size >>> 16, 0);
					}
				}
			}
		}

		if (mem_hardreset)
			this.clear();

		return SAEE_None;
	}

	this.clear = function() { //memory_clear()
		mem_hardreset = 0;

		/*if (chipmem_bank.baseaddr) memset(chipmem_bank.baseaddr, 0, chipmem_bank.allocated);
		if (bogomem_bank.baseaddr) memset(bogomem_bank.baseaddr, 0, bogomem_bank.allocated);
		if (mem25bit_bank.baseaddr) memset(mem25bit_bank.baseaddr, 0, mem25bit_bank.allocated);
		if (a3000lmem_bank.baseaddr) memset(a3000lmem_bank.baseaddr, 0, a3000lmem_bank.allocated);
		if (a3000hmem_bank.baseaddr) memset(a3000hmem_bank.baseaddr, 0, a3000hmem_bank.allocated);*/

		if (chipmem_bank.baseaddr !== null) SAEF_memset(chipmem_bank.baseaddr,0, 0, chipmem_bank.allocated);
		if (bogomem_bank.baseaddr !== null) SAEF_memset(bogomem_bank.baseaddr,0, 0, bogomem_bank.allocated);
		//if (mem25bit_bank.baseaddr !== null) SAEF_memset(mem25bit_bank.baseaddr,0, 0, mem25bit_bank.allocated);
		if (a3000lmem_bank.baseaddr !== null) SAEF_memset(a3000lmem_bank.baseaddr,0, 0, a3000lmem_bank.allocated);
		if (a3000hmem_bank.baseaddr !== null) SAEF_memset(a3000hmem_bank.baseaddr,0, 0, a3000hmem_bank.allocated);

		SAER.expansion.clear();
		//cpuboard_clear();
	}

	this.hardreset = function(mode) { //memory_hardreset()
		if (mode + 1 > mem_hardreset)
			mem_hardreset = mode + 1;
	}

	/*-----------------------------------------------------------------------*/

	this.ks12orolder = function() {
		return kickstart_version > 0 && kickstart_version < 34; /* < 1.3 */
	}
	this.ks11orolder = function() {
		return kickstart_version > 0 && kickstart_version < 33; /* < 1.2 */
	}

	/*-----------------------------------------------------------------------*/

	// do not map if it conflicts with custom banks
	this.map_banks_cond = function(bank, start, size, realsize) {
		for (var i = 0; i < SAEV_config.memory.custom.length; i++) {
			var cstart = SAEV_config.memory.custom[i].addr >>> 16;
			if (!cstart)
				continue;
			var csize = SAEV_config.memory.custom[i].size >>> 16;
			if (!csize)
				continue;
			if (start <= cstart && start + size >= cstart)
				return;
			if (cstart <= start && (cstart + size >= start || start + size > cstart))
				return;
		}
		map_banks(bank, start, size, realsize);
	}

	function map_banks2(bank, start, size, realsize, quick) {
		var bnr, old;
		var hioffs = 0, endhioffs = 0x100;
		var realstart = start;
		var orig_bank = null;

		//if (quick <= 0) old = debug_bankchange (-1);
		//flush_icache_hard(0, 3); /* JIT, Sure don't want to keep any old mappings around! */

		if (!realsize)
			realsize = size << 16;

		if ((size << 16) < realsize)
			SAEF_warn("memory.map_banks2() Broken mapping, size=%x, realsize=%x, start=%x", size, realsize, start);

		if (!ADDRESS_SPACE_24BIT) {
			if (start >= 0x100) {
				var real_left = 0;
				for (bnr = start; bnr < start + size; bnr++) {
					if (!real_left) {
						realstart = bnr;
						real_left = realsize >>> 16;
					}
					mem_banks[bnr] = bank; //put_mem_bank(bnr << 16, bank, realstart << 16);
					real_left--;
				}
				//if (quick <= 0) debug_bankchange (old);
				return;
			}
		}
		//if (lastAaddressSpace24)
		if (SAEV_config.cpu.addressSpace24)
			endhioffs = 0x10000;
		if (ADDRESS_SPACE_24BIT)
			endhioffs = 0x100;

		for (hioffs = 0; hioffs < endhioffs; hioffs += 0x100) {
			var real_left = 0;
			for (bnr = start; bnr < start + size; bnr++) {
				if (!real_left) {
					realstart = bnr + hioffs;
					real_left = realsize >>> 16;
				}
				//put_mem_bank((bnr + hioffs) << 16, bank, realstart << 16);
				mem_banks[bnr + hioffs] = bank;
				real_left--;
			}
		}
		//if (quick <= 0) debug_bankchange (old);
		fill_ce_banks();
	}
	function map_banks(bank, start, size, realsize) {
		map_banks2(bank, start, size, realsize, 0);
	}
	SAER_Memory_mapBanks = map_banks;


	function validate_banks_z2(bank, start, size) {
		if (start < 0x20 || (start >= 0xa0 && start < 0xe9) || start >= 0xf0) {
			SAEF_error("memory.validate_banks_z2() bank '%s' with invalid start address %08X", bank.name, start << 16);
			SAER.m68k.cpu_halt(SAEC_CPU_halt_AUTOCONFIG_CONFLICT);
			return false;
		}
		if (start >= 0xe9) {
			if (start + size > 0xf0) {
				SAEF_error("memory.validate_banks_z2() bank '%s' with invalid region %08x - %08X", bank.name, start << 16, (start + size) << 16);
				SAER.m68k.cpu_halt(SAEC_CPU_halt_AUTOCONFIG_CONFLICT);
				return false;
			}
		} else {
			if (start + size > 0xa0) {
				SAEF_error("memory.validate_banks_z2() bank '%s' with invalid region %08x - %08X", bank.name, start << 16, (start + size) << 16);
				SAER.m68k.cpu_halt(SAEC_CPU_halt_AUTOCONFIG_CONFLICT);
				return false;
			}
		}
		if (size <= 0 || size > 0x80) {
			SAEF_error("memory.validate_banks_z2() bank '%s' with invalid size %08x", bank.name, size);
			SAER.m68k.cpu_halt(SAEC_CPU_halt_AUTOCONFIG_CONFLICT);
			return false;
		}
		for (var i = start; i < start + size; i++) {
			//var ab = get_mem_bank(start << 16);
			var ab = mem_banks[start];
			if (ab !== SAEV_Memory_dummyBank) {
				SAEF_error("memory.validate_banks_z2() bank '%s' attempting to override existing memory bank '%s' at %08X", bank.name, ab.name, i << 16);
				return false;
			}
		}
		return true;
	}
	this.map_banks_z2 = function(bank, start, size) {
		if (validate_banks_z2(bank, start, size))
			map_banks(bank, start, size, 0);
	}

	function validate_banks_z3(bank, start, size) {
		if (start < 0x1000 || size <= 0) {
			SAEF_error("memory.validate_banks_z3() invalid bank '%s' start=%08x size=%08x", bank.name, start << 16, size << 16);
			SAER.m68k.cpu_halt(SAEC_CPU_halt_AUTOCONFIG_CONFLICT);
			return false;
		}
		if (size > 0x4000 || start + size > 0xf000) {
			SAEF_error("memory.validate_banks_z3() invalid bank '%s' start=%08x size=%08x", bank.name, start << 16, size << 16);
			return false;
		}
		for (var i = start; i < start + size; i++) {
			//var ab = get_mem_bank(start << 16);
			var ab = mem_banks[start];
			if (ab !== SAEV_Memory_dummyBank && ab !== bank) {
				SAEF_error("memory.validate_banks_z3() bank '%s' attempting to override existing memory bank '%s' at %08X", bank.name, ab.name, i << 16);
				return false;
			}
		}
		return true;
	}
	this.map_banks_z3 = function(bank, start, size) {
		if (validate_banks_z3(bank, start, size))
			map_banks(bank, start, size, 0);
	}

	/*void map_banks_quick (addrbank *bank, int start, int size, int realsize) {
		map_banks2 (bank, start, size, realsize, 1);
	}
	void map_banks_nojitdirect (addrbank *bank, int start, int size, int realsize) {
		map_banks2 (bank, start, size, realsize, -1);
	}*/

	/*-----------------------------------------------------------------------*/

	function dump_xlate(addr) {
		if (!mem_banks[addr >>> 16].check(addr, 1))
			return null;
		return mem_banks[addr >>> 16].xlateaddr(addr);
	}

	//const UAE_MEMORY_REGION_NAME_LENGTH = 64;
	const UAE_MEMORY_REGIONS_MAX = 64;
	const UAE_MEMORY_REGION_RAM = 1 << 0;
	const UAE_MEMORY_REGION_ALIAS = 1 << 1;
	const UAE_MEMORY_REGION_MIRROR = 1 << 2;

	const MEMORY_MIN_SUBBANK = 1024;

	function UaeMemoryRegion() {
		this.start = 0;
		this.size = 0;
		this.name = ""; //[UAE_MEMORY_REGION_NAME_LENGTH];
		this.rom_name = ""; //[UAE_MEMORY_REGION_NAME_LENGTH];
		this.alias = 0;
		this.flags = 0;
	}
	function UaeMemoryMap() {
		this.regions = new Array(UAE_MEMORY_REGIONS_MAX);
		this.num_regions = 0;
	}

	function memory_map_dump_3(map, log) {
		var i, j;
		var a1 = mem_banks[0];
		var txt = "";

		var imold = SAEV_config.memory.logIllegal;
		SAEV_config.memory.logIllegal = false;
		var max = SAEV_config.cpu.addressSpace24 ? 256 : 65536;
		map.num_regions = 0;
		j = 0;
		for (i = 0; i < max + 1; i++) {
			var a2 = null;
			if (i < max)
				a2 = mem_banks[i];
			if (a1 !== a2) {
				var k, mirrored, mirrored2, size, size_out;
				var size_ext;
				var caddr;
				var tmp;
				var name = a1.name;
				var sb = a1.sub_banks;
				var sbi = 0; //OWN
				var bankoffset = 0;
				var region_size;

				k = j;
				caddr = dump_xlate(k << 16);
				mirrored = caddr !== null ? 1 : 0;
				k++;
				while (k < i && caddr !== null) {
					if (dump_xlate(k << 16) === caddr) {
						mirrored++;
					}
					k++;
				}
				mirrored2 = mirrored;
				if (mirrored2 == 0)
					mirrored2 = 1;

				while (bankoffset < 65536) {
					var bankoffset2 = bankoffset;
					if (sb !== null) {
						if (sb[sbi].bank === null)
							break;
						var daddr = ((j << 16) | bankoffset) >>> 0;
						//a1 = get_sub_bank(&daddr);
						a1 = SAER.memory.getSubBank({ value:daddr });
						name = a1.name;
						for (;;) {
							bankoffset2 += MEMORY_MIN_SUBBANK;
							if (bankoffset2 >= 65536)
								break;
							daddr = ((j << 16) | bankoffset2) >>> 0;
							//var dab = get_sub_bank(&daddr);
							var dab = SAER.memory.getSubBank({ value:daddr });
							if (dab !== a1)
								break;
						}
						//sb++;
						sbi++;
						size = (bankoffset2 - bankoffset) >> 10;// / 1024;
						region_size = size << 10; // * 1024;
					} else {
						size = (i - j) << (16 - 10);
						region_size = Math.floor(((i - j) << 16) / mirrored2);
					}

					if (name === null)
						name = "<none>";

					size_out = size;
					size_ext = 'K';
					if (j >= 256 && (Math.floor(size_out / mirrored2) >= 1024) && !(Math.floor(size_out / mirrored2) & 1023)) {
						//size_out /= 1024;
						size_out >>= 10;
						size_ext = 'M';
					}
					//#if 1
					txt = sprintf("%08X %7d%s/%d = %7d%s %s", ((j << 16) | bankoffset) >>> 0, size_out, size_ext, mirrored, mirrored ? Math.floor(size_out / mirrored) : size_out, size_ext, name);
					//#endif
					tmp = "";
					if (0 && (a1.flags & SAEC_Memory_addrbank_flag_ROM) && mirrored) {
						var crc = 0xffffffff;
						var crcAddr = ((j << 16) | bankoffset) >>> 0;
						var crcSize = Math.floor((size * 1024) / mirrored);
						if (a1.check(crcAddr, crcSize)) {
							crcAddr = a1.xlateaddr(crcAddr, crcSize);
							//crc = get_crc32(crcAddr);
							{
								var crcData = new Uint8Array(crcSize);
								for (var o = 0; o < crcSize; o++) crcData[o] = a1.get8(crcAddr + o);
								crc = SAEF_crc32(crcData,0, crcSize);
							}
						}
						txt += sprintf(" (%08X)", crc);

						var rd = SAER.roms.getromdatabycrc(crc);
						/*if (rd !== null) {
							tmp = "=";
							tmp += SAER.roms.getromname(rd);
							tmp += "\n";
						}*/
						if (rd !== null) {
							txt += " = "+SAER.roms.getromname(rd);
						}
					}

					/*if (a1 !== SAEV_Memory_dummyBank) {
						for (var m = 0; m < mirrored2; m++) {
							UaeMemoryRegion *r = &map->regions[map->num_regions];
							r->start = (j << 16) + bankoffset + region_size * m;
							r->size = region_size;
							r->flags = 0;
							r->memory = NULL;
							r->memory = dump_xlate((j << 16) | bankoffset);
							if (r->memory)
								r->flags |= UAE_MEMORY_REGION_RAM;
							// just to make it easier to spot in debugger
							r->alias = 0xffffffff;
							if (m >= 0) {
								r->alias = j << 16;
								r->flags |= UAE_MEMORY_REGION_ALIAS | UAE_MEMORY_REGION_MIRROR;
							}
							_stprintf(r->name, _T("%s"), name);
							_stprintf(r->rom_name, _T("%s"), tmp);
							map->num_regions += 1;
						}
					}*/
					//#if 1
					txt += "\n";
					if (log > 0)
						SAEF_log(txt);
					else if (log == 0)
						console.log(txt);

					if (tmp.length) {
						if (log > 0)
							SAEF_log(tmp);
						else if (log == 0)
							console.log(tmp);
					}
					//#endif
					if (sb === null)
						break;
					bankoffset = bankoffset2;
				}
				j = i;
				a1 = a2;
			}
		}
		//pci_dump(log);
		SAEV_config.memory.logIllegal = imold;
	}
	function memory_map_dump_2(log) {
		var map = new UaeMemoryMap();
		memory_map_dump_3(map, log);

		/*for (int i = 0; i < map.num_regions; i++) {
			TCHAR txt[256];
			UaeMemoryRegion *r = &map.regions[i];
			int size = r->size / 1024;
			TCHAR size_ext = 'K';
			int mirrored = 1;
			int size_out = 0;
			_stprintf (txt, _T("%08X %7u%c/%d = %7u%c %s\n"), r->start, size, size_ext, r->flags & UAE_MEMORY_REGION_RAM, size, size_ext, r->name);
			if (log)
				write_log (_T("%s"), txt);
			else
				console_out (txt);
			if (r->rom_name[0]) {
				if (log)
					write_log (_T("%s"), r->rom_name);
				else
					console_out (r->rom_name);
			}
		}*/
	}
	this.map_dump = function() { //memory_map_dump()
	if (SAEV_config.debug.level == SAEC_Config_Debug_Level_Log)
		memory_map_dump_2(1);
	}
}
