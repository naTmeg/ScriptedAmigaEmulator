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
| Notes: This file consists of two parts: high-level functions,
| ported from WinUAE 3.2.x and low-level functions, written from scratch.
-------------------------------------------------------------------------*/
/* global constants */

/*---------------------------------*/
/* global references */

var SAER_CPU_regs = null;

var SAER_CPU_setPC = null;
var SAER_CPU_getPC = null;

var SAER_CPU_exception = null;

var SAER_CPU_run_func = null;

var SAER_CPU_fill_prefetch = null;

/*---------------------------------*/
/* global variables */

var SAEV_CPU_cycles = 0;

/*---------------------------------*/

function SAEO_CPU() {
	/* Exception 2/3 error */
	function Exception23(num) {
		this.num = num;
	}
	Exception23.prototype = new Error;

	/* Exception 3 info */
	var last_op_for_exception_3 = 0;/* Opcode of faulting instruction */
	var last_addr_for_exception_3 = 0;/* PC at fault time */
	var last_fault_for_exception_3 = 0;/* Address that generated the exception */
	var last_writeaccess_for_exception_3 = false;/* read (0) or write (1) access */
	var last_instructionaccess_for_exception_3 = false;/* instruction (1) or data (0) access */
	var last_notinstruction_for_exception_3 = false;/* not instruction */
	var exception_in_exception = 0; /* set when writing exception stack frame */
	var bus_error_offset = 0;

	/* 68020 cache */
	const CACR020_C  = 1 << 3; /* Clear Cache */
	const CACR020_CE = 1 << 2; /* Clear Entry in Cache */
	const CACR020_F  = 1 << 1; /* Freeze Cache */
	const CACR020_E  = 1 << 0; /* Enable Cache */
	const CACR020_RMASK = 0x3;
	const CACR020_WMASK = 0xf;

	const CACHELINES020 = 64;
	const CACHELINE020_IM = CACHELINES020 - 1;
	const CACHELINE020_TM = ~((CACHELINES020 << 2) - 1) >>> 0;
	function cache020() {
		this.data = 0;
		this.tag = 0;
		this.valid = false;
	}
	var caches020 = new Array(CACHELINES020);
	for (var vi = 0; vi < CACHELINES020; vi++)
		caches020[vi] = new cache020();

	/* 68030 cache */
	const CACR030_WA   = 1 << 13;	/* Write Allocate */
	const CACR030_DBE  = 1 << 12;	/* Data Burst Enable */
	const CACR030_CD   = 1 << 11;	/* Clear Data Cache */
	const CACR030_CED  = 1 << 10;	/* Clear Entry in Data Cache */
	const CACR030_FD   = 1 << 9;	/* Freeze Data Cache */
	const CACR030_ED   = 1 << 8;	/* Enable Data Cache */
	const CACR030_IBE  = 1 << 4;	/* Instruction Burst Enable */
	const CACR030_CI   = 1 << 3;	/* Clear Instruction Cache */
	const CACR030_CEI  = 1 << 2;	/* Clear Entry in Instruction Cache */
	const CACR030_FI   = 1 << 1;	/* Freeze Instruction Cache */
	const CACR030_EI   = 1 << 0;	/* Enable Instruction Cache */
	const CACR030_RMASK = 0x3313;
	const CACR030_WMASK = 0x3f1f;

	const CACHELINES030 = 16;
	const CACHELINE030_IM = CACHELINES030 - 1;
	const CACHELINE030_TM = ~((CACHELINES030 << 4) - 1) >>> 0;
	function cache030() {
		this.data = new Uint32Array(4);
		this.valid = [false, false, false, false];
		this.tag = 0;
	}
	var icaches030 = new Array(CACHELINES030);
	for (var vi = 0; vi < CACHELINES030; vi++)
		icaches030[vi] = new cache030();

	var dcaches030 = new Array(CACHELINES030);
	for (var vi = 0; vi < CACHELINES030; vi++)
		dcaches030[vi] = new cache030();

	/* 68040 cache */
	/*#define CACHESETS040 64
	#define CACHELINES040 4
	struct cache040 {
		uae_u32 data[CACHELINES040][4];
		bool dirty[CACHELINES040][4];
		bool valid[CACHELINES040];
		uae_u32 tag[CACHELINES040];
	};
	static struct cache040 icaches040[CACHESETS040];
	static struct cache040 dcaches040[CACHESETS040];
	var icachelinecnt = 0, dcachelinecnt = 0;*/

	/* 68030 fake MMU */
	//var fake_srp_030 = 0, fake_crp_030 = 0; //64
	var fake_srp_030_hi = 0, fake_srp_030_lo = 0;
	var fake_crp_030_hi = 0, fake_crp_030_lo = 0;
	var fake_tt0_030 = 0, fake_tt1_030 = 0, fake_tc_030 = 0; //32
	var fake_mmusr_030 = 0; //16

	/* shared CPU registers */
	function regstruct() {
		this.a = new Uint32Array(8);
		this.d = new Uint32Array(8);

		this.pc = 0; //u32
		this.pc_p = 0; //u8 *
		this.pc_oldp = 0; //u8 *
		this.opcode = 0; //u16
		this.instruction_pc = 0; //u32

		this.db = 0; //u16
		this.irc = 0, this.ir = 0; //u16
		//this.chipset_latch_rw = 0; //u32
		//this.chipset_latch_read = 0; //u32
		//this.chipset_latch_write = 0; //u32

		this.usp = 0, this.isp = 0, this.msp = 0;

		this.t1 = false;
		this.t0 = false;
		this.s = false;
		this.m = false;
		this.intmask = 0;
		this.x = false;
		this.n = false;
		this.z = false;
		this.v = false;
		this.c = false;
		this.stopped = false;
		this.halted = 0;

		this.vbr = 0, this.sfc = 0, this.dfc = 0; //u32

		this.cacr = 0, this.caar = 0; //u32
		//uae_u32 itt0, itt1, dtt0, dtt1;
		//uae_u32 tcr, mmusr, urp, srp, buscr;

		this.prefetch020 = new Uint32Array(4);
		this.prefetch020addr = 0; //u32
		this.cacheholdingdata020 = 0; //u32
		this.cacheholdingaddr020 = 0; //u32
	};
	var regs = new regstruct();
	SAER_CPU_regs = regs;

	const CYCLES_DIV = 8192;
	var cycles_mult = 0;
	var cpucycleunit = 0;
	var cpu_cycles = 0;

	var illegal_warned = 0;

	/*-----------------------------------------------------------------------*/

	const PC_OFFSET = 2;
	var pc_offset = PC_OFFSET;	//, pc_offset_old = 0;

	var coreGetPC = null;
	var coreSetPC = null;
	var coreSyncPC = null;
	var coreNext16 = null;
	var coreNext32 = null;
	var coreGetInst16 = null;
	var coreGetInst32 = null;
	var coreGet8 = null;
	var coreGet16 = null;
	var coreGet32 = null;
	var corePut8 = null;
	var corePut16 = null;
	var corePut32 = null;

	/*---------------------------------*/

	const M_rdd		=  1; /* Register Direct Data */
	const M_rda		=  2; /* Register Direct Address */
	const M_ria		=  3; /* Register Indirect Address */
	const M_ripo	=  4; /* Register Indirect	Address with Postincrement */
	const M_ripr	=  5; /* Register Indirect	Address with Predecrement */
	const M_rid		=  6; /* Register Indirect	Address with Displacement */
	const M_rii		=  7; /* Address Register Indirect, with Index (8-Bit Displacement) */
	const M_pcid	=  8; /* Program Counter Indirect with Displacement */
	const M_pcii	=  9; /* Program Counter Indirect with Index	(8-Bit Displacement) */
	const M_absw	= 10; /* Absolute Data Addressing */
	const M_absl	= 11; /* Absolute Data Addressing */
	const M_imm		= 12; /* Immediate Data */

	const ccNames = ["T", "F", "HI", "LS", "CC", "CS", "NE", "EQ", "VC", "VS", "PL", "MI", "GE", "LT", "GT", "LE"];

	var iTab = [];
	var ccTab = [];
	var exEAtab = [];
	var ldEA8tab = [], stEA8tab = [];
	var ldEA16tab = [], stEA16tab = [];
	var ldEA32tab = [], stEA32tab = [];

	var model = 0;

	/*-----------------------------------------------------------------------*/
	/* SECT core high-level, ported from WinUAE */
	/*-----------------------------------------------------------------------*/

	this.setup = function() { //init_m68k()
		/*switch (SAEV_config.cpu.model) {
			case SAEC_Config_CPU_Model_68030: cpucycleunit = SAEC_Events_CYCLE_UNIT >> 3; break;
			case SAEC_Config_CPU_Model_68020: cpucycleunit = SAEC_Events_CYCLE_UNIT >> 2; break;
			default: cpucycleunit = SAEC_Events_CYCLE_UNIT >> 1;
		}*/
		update_cycles();

		if (SAEV_config.cpu.model < SAEC_Config_CPU_Model_68020)
			SAER_CPU_run_func = SAEV_config.cpu.compatible ? runPrefetch000 : runNormal;
		else
			SAER_CPU_run_func = SAEV_config.cpu.compatible ? runPrefetch020 : runNormal;

		setup_functions();

		if (!iTab.length || model != SAEV_config.cpu.model) {
			//SAEF_log("cpu.setup_core() no/invalid instruction table, generating...");
			model = SAEV_config.cpu.model;
			if (!mkITab())
				return SAEE_CPU_Internal;
		} else
			SAEF_log("cpu.setup_core() instruction table is cached");

		if (!ccTab.length) mkCCTab();
		if (!exEAtab.length) mkEATabs();

		return SAEE_None;
	}

	/*-----------------------------------------------------------------------*/

	this.reset = function(hardreset) {
		regs.a[7] = SAER_Memory_get32(0);
		this.setPC_normal(SAER_Memory_get32(4));

		regs.t1 = false;
		regs.t0 = false;
		regs.s = true;
		regs.m = false;
		regs.intmask = 7;
		regs.x = regs.n = regs.z = regs.v = regs.c = false;
		regs.vbr = regs.sfc = regs.dfc = 0;
		regs.irc = 0xffff;
		regs.db = 0;

		if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68020) {
			regs.caar = 0;
			regs.cacr = CACR020_C;
			coreSetCaches(false);
		}
		else if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68030) { //OWN
			regs.caar = 0;
			regs.cacr = CACR030_CD|CACR030_CI;
			coreSetCaches(false);
		}

		{
			SAER.memory.a3000_fakekick(false);
			/* only (E)nable bit is zeroed when CPU is reset, A3000 SuperKickstart expects this */
			fake_tc_030 &= ~0x80000000;
			fake_tt0_030 &= ~0x80000000;
			fake_tt1_030 &= ~0x80000000;
			if (hardreset || regs.halted) {
				//fake_srp_030 = fake_crp_030 = 0;
				fake_srp_030_hi = fake_srp_030_lo = 0;
				fake_crp_030_hi = fake_crp_030_lo = 0;
				fake_tt0_030 = fake_tt1_030 = fake_tc_030 = 0;
			}
			fake_mmusr_030 = 0;
		}

		fill_prefetch();

		illegal_warned = 0;
	}

	/*-----------------------------------------------------------------------*/

	this.dump = function() {
		var i, j, out = "";

		for (i = 0; i < 8; i++) out += sprintf("D%d $%08x ", i, regs.d[i]); out += "\n";
		for (i = 0; i < 8; i++) out += sprintf("A%d $%08x ", i, regs.a[i]); out += "\n";

		if (!regs.s) regs.usp = regs.a[7];
		if (regs.s && regs.m) regs.msp = regs.a[7];
		if (regs.s && !regs.m) regs.isp = regs.a[7];
		out += sprintf("PC $%08x USP $%08x ISP $%08x ", getPC(), regs.usp, regs.isp);
		if (model >= SAEC_Config_CPU_Model_68020) out += sprintf("MSP $%08x ", regs.msp);
		if (model >= SAEC_Config_CPU_Model_68010) out += sprintf("SFC $%08x DFC $%08x VBR $%08x", regs.sfc, regs.dfc, regs.vbr);
		out += "\n";
		out += sprintf("SR T=%d%d S=%d M=%d IMASK=%d X=%d N=%d Z=%d V=%d C=%d\n",
			regs.t1?1:0, regs.t0?1:0, regs.s?1:0, regs.m?1:0, regs.intmask,
			regs.x?1:0, regs.n?1:0, regs.z?1:0, regs.v?1:0, regs.c?1:0);

		if (model >= SAEC_Config_CPU_Model_68020)
			out += dump_cache();

		SAEF_log(out);
	}

	/*-----------------------------------------------------------------------*/
	/* caches */

	function dump_cache() {
		if (!SAEV_config.cpu.compatible)
			return "CACHE disabled\n";

		var out = sprintf("CACR $%08x CAAR $%08x\n", regs.cacr, regs.caar);
		if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68020) {
			out += "68020 inst-cache:\n";
			for (var i = 0; i < CACHELINES020; i += 4) {
				for (var j = 0; j < 4; j++) {
					var s = i + j;
					var c = caches020[s];
					var addr = c.tag & ~1;
					addr |= s << 2;
					out += sprintf("%08X:%08X%s ", addr, c.data, c.valid ? "*" : " ");
				}
				out += "\n";
			}
		} else if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68030) {
			out += "68030 inst-cache: ["+((regs.cacr & CACR030_EI) ? "enabled" : "disabled") +"]\n";
			for (var i = 0; i < CACHELINES030; i++) {
				var c = icaches030[i];
				var addr = c.tag & ~1;
				addr |= i << 4;
				out += sprintf("%02d %08X: ", i, addr);
				for (var j = 0; j < 4; j++)
					out += sprintf("%08X%s ", c.data[j], c.valid[j] ? '*' : ' ');

				out += "\n";
			}
			out += "68030 data-cache: ["+((regs.cacr & CACR030_ED) ? "enabled" : "disabled") +"]\n";
			for (var i = 0; i < CACHELINES030; i++) {
				var c = dcaches030[i];
				var addr = c.tag & ~1;
				addr |= i << 4;
				out += sprintf("%02d %08X: ", i, addr);
				for (var j = 0; j < 4; j++)
					out += sprintf("%08X%s ", c.data[j], c.valid[j] ? '*' : ' ');

				out += "\n";
			}
		}
		return out;
	}

	function flush_caches(force) { //flush_cpu_caches()
		var doflush = SAEV_config.cpu.compatible;

		if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68020) {
			if (regs.cacr & CACR020_C) {
				for (var i = 0; i < CACHELINES020; i++)
					caches020[i].valid = false;
				regs.cacr &= ~CACR020_C;
			}
			if (regs.cacr & CACR020_CE) {
				caches020[(regs.caar >>> 2) & CACHELINE020_IM].valid = false;
				regs.cacr &= ~CACR020_CE;
			}
		}
		else if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68030) {
			if (regs.cacr & CACR030_CI) {
				if (doflush) {
					for (var i = 0; i < CACHELINES030; i++) {
						icaches030[i].valid[0] = false;
						icaches030[i].valid[1] = false;
						icaches030[i].valid[2] = false;
						icaches030[i].valid[3] = false;
					}
				}
				regs.cacr &= ~CACR030_CI;
			}
			if (regs.cacr & CACR030_CEI) {
				icaches030[(regs.caar >>> 4) & CACHELINE030_IM].valid[(regs.caar >>> 2) & 3] = 0;
				regs.cacr &= ~CACR030_CEI;
			}
			if (regs.cacr & CACR030_CD) {
				if (doflush) {
					for (var i = 0; i < CACHELINES030; i++) {
						dcaches030[i].valid[0] = false;
						dcaches030[i].valid[1] = false;
						dcaches030[i].valid[2] = false;
						dcaches030[i].valid[3] = false;
					}
				}
				regs.cacr &= ~CACR030_CD;
			}
			if (regs.cacr & CACR030_CED) {
				dcaches030[(regs.caar >>> 4) & CACHELINE030_IM].valid[(regs.caar >>> 2) & 3] = 0;
				regs.cacr &= ~CACR030_CED;
			}
		}
		/*else if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68040) {
			icachelinecnt = 0;
			dcachelinecnt = 0;
			if (doflush) {
				for (var i = 0; i < CACHESETS040; i++) {
					icaches040[i].valid[0] = 0;
					icaches040[i].valid[1] = 0;
					icaches040[i].valid[2] = 0;
					icaches040[i].valid[3] = 0;
				}
			}
		}*/
	}
	/*function flush_cpu_caches_040(opcode) {
		var cache = (opcode >> 6) & 3;
		if (cache & 2)
			flush_caches(true);
	}*/
	function coreSetCaches(flush) { //set_cpu_caches()
		/*if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68020) {
			SAEF_log("cpu.set_caches_68020() C%d CE%d F%d E%d",
				(regs.cacr & CACR020_C )?1:0,
				(regs.cacr & CACR020_CE)?1:0,
				(regs.cacr & CACR020_F )?1:0,
				(regs.cacr & CACR020_E )?1:0
			);
		}
		else if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68030) {
			SAEF_log("cpu.set_caches_68030() WA%d DBE%d CD%d CED%d FD%d ED%d IBE%d CI%d CEI%d FI%d EI%d",
				(regs.cacr & CACR030_WA )?1:0,
				(regs.cacr & CACR030_DBE)?1:0,
				(regs.cacr & CACR030_CD )?1:0,
				(regs.cacr & CACR030_CED)?1:0,
				(regs.cacr & CACR030_FD )?1:0,
				(regs.cacr & CACR030_ED )?1:0,
				(regs.cacr & CACR030_IBE)?1:0,
				(regs.cacr & CACR030_CI )?1:0,
				(regs.cacr & CACR030_CEI)?1:0,
				(regs.cacr & CACR030_FI )?1:0,
				(regs.cacr & CACR030_EI )?1:0
			);
		}*/
		regs.prefetch020addr = 0xffffffff;
		regs.cacheholdingaddr020 = 0xffffffff;
		flush_caches(flush);
	}

	/*---------------------------------*/

	function fill_icache020(addr) {
		addr = (addr & ~3) >>> 0;
		if (regs.cacheholdingaddr020 != addr) {
			var index = (addr >>> 2) & CACHELINE020_IM;
			var tag = ((addr & CACHELINE020_TM) | (regs.s ? 1 : 0)) >>> 0;
			var c = caches020[index];
			if (c.valid && c.tag == tag) {
				// cache hit
				regs.cacheholdingaddr020 = addr;
				regs.cacheholdingdata020 = c.data;
			} else {
				// cache miss
				//var data = SAER_Memory_getInst32(addr);
				var data = SAER_Memory_banks[addr >>> 16].getInst32(addr);
				if (!(regs.cacr & CACR020_F)) {
					c.tag = tag;
					c.valid = (regs.cacr & CACR020_E) != 0;
					c.data = data;
				}
				regs.cacheholdingaddr020 = addr;
				regs.cacheholdingdata020 = data;
			}
		}
	}

	/*---------------------------------*/

	function getcache030(cp, addr, p) {
		addr = (addr & ~3) >>> 0;
		var index = (addr >>> 4) & CACHELINE030_IM;
		p.tag = ((addr & CACHELINE030_TM) | (regs.s ? 1 : 0)) >>> 0;
		p.lws = (addr >>> 2) & 3;
		return cp[index];
	}
	function update_cache030(c, val, tag, lws) {
		if (c.tag != tag)
			c.valid[0] = c.valid[1] = c.valid[2] = c.valid[3] = false;
		c.tag = tag;
		c.valid[lws] = true;
		c.data[lws] = val;
	}

	function fill_icache030(addr) {
		addr = (addr & ~3) >>> 0;
		if (regs.cacheholdingaddr020 == addr)
			return;
		var p = {};
		var c = getcache030(icaches030, addr, p);
		if (c.valid[p.lws] && c.tag == p.tag) {
			// cache hit
			regs.cacheholdingaddr020 = addr;
			regs.cacheholdingdata020 = c.data[p.lws];
			return;
		}
		// cache miss
		//var data = SAER_Memory_getInst32(addr);
		var data = SAER_Memory_banks[addr >>> 16].getInst32(addr);
		if ((regs.cacr & (CACR030_FI|CACR030_EI)) == CACR030_EI) // not frozen and enabled
			update_cache030(c, data, p.tag, p.lws);

		// do burst fetch if cache enabled, not frozen, all slots invalid, no chip ram
		if ((regs.cacr & (CACR030_IBE|CACR030_EI)) == (CACR030_IBE|CACR030_EI) && p.lws == 0 &&
			!c.valid[1] && !c.valid[2] && !c.valid[3] &&
			SAER_Memory_banktype[addr >>> 16] == SAEC_Memory_banktype_FAST32
		) {
			/*c.data[1] = SAER_Memory_getInst32(addr + 4);
			c.data[2] = SAER_Memory_getInst32(addr + 8);
			c.data[3] = SAER_Memory_getInst32(addr + 12);*/
			c.data[1] = SAER_Memory_banks[(addr + 4) >>> 16].getInst32(addr + 4);
			c.data[2] = SAER_Memory_banks[(addr + 8) >>> 16].getInst32(addr + 8);
			c.data[3] = SAER_Memory_banks[(addr + 12) >>> 16].getInst32(addr + 12);
			c.valid[1] = c.valid[2] = c.valid[3] = true;
		}
		regs.cacheholdingaddr020 = addr;
		regs.cacheholdingdata020 = data;
	}
	/*function get16_icache030(addr) { //get_word_icache030()
		fill_icache030(addr);
		if (addr & 2)
			return regs.cacheholdingdata020 & 0xffff;
		else
			return regs.cacheholdingdata020 >>> 16;
	}
	function get32_icache030(addr) { //get_long_icache030()
		fill_icache030(addr);
		if ((addr & 2) == 0)
			return regs.cacheholdingdata020;
		else {
			var v = regs.cacheholdingdata020 << 16;
			fill_icache030(addr + 4);
			v |= regs.cacheholdingdata020 >>> 16;
			return v >>> 0;
		}
	}*/

	function read_dcache030x(addr, size) {
		var aligned = addr & 3;
		var v1, v2;

		var p1 = {};
		var c1 = getcache030(dcaches030, addr, p1);
		addr = (addr & ~3) >>> 0;
		if (!c1.valid[p1.lws] || c1.tag != p1.tag) {
			v1 = SAER_Memory_get32(addr);
			update_cache030(c1, v1, p1.tag, p1.lws);
		} else {
			v1 = c1.data[p1.lws];
			if (SAEV_AutoConf_boot_rom_type > 0) {
				var tv = SAER_Memory_get32(addr);
				if (tv != v1) {
					SAEF_warn("cpu.read_dcache030x() data cache mismatch %d %d %08x %08x != %08x %08x %d PC=%08x", size, aligned, addr, tv, v1, p1.tag, p1.lws, getPC());
					v1 = tv;
				}
			}
		}
		// only one long fetch needed?
		if (size == 0) {
			v1 >>>= (3 - aligned) * 8;
			return v1 & 0xff;
		} else if (size == 1 && aligned <= 2) {
			v1 >>>= (2 - aligned) * 8;
			return v1 & 0xffff;
		} else if (size == 2 && aligned == 0) {
			// do burst fetch if cache enabled, not frozen, all slots invalid, no chip ram
			if ((regs.cacr & (CACR030_DBE|CACR030_ED)) == (CACR030_DBE|CACR030_ED) && p1.lws == 0 &&
				!c1.valid[1] && !c1.valid[2] && !c1.valid[3] &&
				SAER_Memory_banktype[addr >> 16] == SAEC_Memory_banktype_FAST32
			) {
				c1.data[1] = SAER_Memory_get32(addr + 4);
				c1.data[2] = SAER_Memory_get32(addr + 8);
				c1.data[3] = SAER_Memory_get32(addr + 12);
				c1.valid[1] = c1.valid[2] = c1.valid[3] = true;
			}
			return v1 >>> 0;
		}
		// no, need another one
		addr += 4;
		var p2 = {};
		var c2 = getcache030(dcaches030, addr, p2);
		if (!c2.valid[p2.lws] || c2.tag != p2.tag) {
			v2 = SAER_Memory_get32(addr);
			update_cache030(c2, v2, p2.tag, p2.lws);
		} else {
			v2 = c2.data[p2.lws];
			if (SAEV_AutoConf_boot_rom_type > 0) {
				var tv = SAER_Memory_get32(addr);
				if (tv != v2) {
					SAEF_warn("cpu.read_dcache030x() data cache mismatch %d %d %08x %08x != %08x %08x %d PC=%08x", size, aligned, addr, tv, v2, p2.tag, p2.lws, getPC());
					v2 = tv;
				}
			}
		}
		if (size == 1 && aligned == 3)
			return ((v1 << 8) | (v2 >>> 24)) & 0xffff;
		else if (size == 2 && aligned == 1)
			return ((v1 << 8) | (v2 >>> 24)) >>> 0;
		else if (size == 2 && aligned == 2)
			return ((v1 << 16) | (v2 >>> 16)) >>> 0;
		else if (size == 2 && aligned == 3)
			return ((v1 << 24) | (v2 >>> 8)) >>> 0;

		SAEF_warn("cpu.read_dcache030x() weirdness!?");
		return 0;
	}

	function write_dcache030x(addr, val, size) {
		var aligned = addr & 3;
		var wa = (regs.cacr & CACR030_WA) != 0;

		var p1 = {};
		var c1 = getcache030(dcaches030, addr, p1);

		// easy one
		if (size == 2 && aligned == 0 && wa) {
			update_cache030(c1, val, p1.tag, p1.lws);
			return;
		}

		var hit = (c1.tag == p1.tag && c1.valid[p1.lws]);
		if (hit || wa) {
			if (size == 2) {
				if (hit) {
					c1.data[p1.lws] &= ~(0xffffffff >>> (aligned * 8));
					c1.data[p1.lws] |= val >>> (aligned * 8);
				} else
					c1.valid[p1.lws] = false;
			} else if (size == 1) {
				if (hit) {
					c1.data[p1.lws] &= ~(0xffff0000 >>> (aligned * 8));
					c1.data[p1.lws] |= (val << 16) >>> (aligned * 8);
				} else
					c1.valid[p1.lws] = false;
			} else if (size == 0) {
				if (hit) {
					c1.data[p1.lws] &= ~(0xff000000 >>> (aligned * 8));
					c1.data[p1.lws] |= (val << 24) >>> (aligned * 8);
				} else
					c1.valid[p1.lws] = false;
			}
		}

		// do we need to update a 2nd cache entry ?
		if ((size == 0) || (size == 1 && aligned <= 2) || (size == 2 && aligned == 0))
			return;

		var p2 = {};
		var c2 = getcache030(dcaches030, addr + 4, p2);
		hit = (c2.tag == p2.tag && c2.valid[p2.lws]);
		if (hit || wa) {
			if (size == 2) {
				if (hit) {
					c2.data[p2.lws] &= 0xffffffff >>> (aligned * 8);
					c2.data[p2.lws] |= val << ((4 - aligned) * 8);
				} else
					c2.valid[p2.lws] = false;
			} else if (size == 1) {
				if (hit) {
					c2.data[p2.lws] &= 0x00ffffff;
					c2.data[p2.lws] |= val << 24;
				} else
					c2.valid[p2.lws] = false;
			}
		}
	}

	function cancache030(addr) {
		return SAER_Memory_cachable[addr >>> 16] != 0;
	}

	function read_dcache030(addr, size) {
		if ((regs.cacr & CACR030_ED) && cancache030(addr))
			return read_dcache030x(addr, size);

		if (size == 2)
			return SAER_Memory_get32(addr);
		else if (size == 1)
			return SAER_Memory_get16(addr);
		else
			return SAER_Memory_get8(addr);
	}
	function get32_dcache030(addr) { //get_long_030()
		return read_dcache030(addr, 2);
	}
	function get16_dcache030(addr) { //get_word_030()
		return read_dcache030(addr, 1);
	}
	function get8_dcache030(addr) { //get_byte_030()
		return read_dcache030(addr, 0);
	}

	function write_dcache030(addr, v, size) {
		if ((regs.cacr & CACR030_ED) && cancache030(addr))
			write_dcache030x(addr, v, size);

		if (size == 2)
			SAER_Memory_put32(addr, v);
		else if (size == 1)
			SAER_Memory_put16(addr, v);
		else
			SAER_Memory_put8(addr, v);
	}
	function put32_dcache030(addr, v) { //put_long_030()
		write_dcache030(addr, v, 2);
	}
	function put16_dcache030(addr, v) { //put_word_030()
		write_dcache030(addr, v, 1);
	}
	function put8_dcache030(addr, v) { //put_byte_030()
		write_dcache030(addr, v, 0);
	}

	/*---------------------------------*/
	/* prefetch */

	function getInst16_icache020_prefetch(o) { //get_word_020_prefetch()
		var pc = getPC() + o;
		var v;

		if (pc & 2) {
			v = regs.prefetch020[0] & 0xffff;
			regs.prefetch020[0] = regs.prefetch020[1];
			fill_icache020(pc + 2 + 4);
			regs.prefetch020[1] = regs.cacheholdingdata020;

			regs.db = regs.prefetch020[0] >>> 16;
		} else {
			v = regs.prefetch020[0] >>> 16;
			regs.db = regs.prefetch020[0];
		}
		return v;
	}
	function getInst32_icache020_prefetch(o) { //get_long_020_prefetch()
		return ((getInst16_icache020_prefetch(o) << 16) | getInst16_icache020_prefetch(o + 2)) >>> 0;
	}

	function getInst16_icache030_prefetch(o) { //get_word_030_prefetch()
		var pc = getPC() + o;
		var v;

		if (pc & 2) {
			v = regs.prefetch020[0] & 0xffff;
			regs.prefetch020[0] = regs.prefetch020[1];
			fill_icache030(pc + 2 + 4);
			regs.prefetch020[1] = regs.cacheholdingdata020;
		} else
			v = regs.prefetch020[0] >>> 16;

		return v;
	}
	function getInst32_icache030_prefetch(o) { //get_long_030_prefetch()
		return ((getInst16_icache030_prefetch(o) << 16) | getInst16_icache030_prefetch(o + 2)) >>> 0;
	}


	function fill_prefetch_020() {
		var pc = (getPC() & ~3) >>> 0;

		fill_icache020(pc);
		regs.prefetch020[0] = regs.cacheholdingdata020;
		fill_icache020(pc + 4);
		regs.prefetch020[1] = regs.cacheholdingdata020;

		regs.irc = getInst16_icache020_prefetch(0);
	}
	function fill_prefetch_030() {
		var pc = (getPC() & ~3) >>> 0;

		fill_icache030(pc);
		regs.prefetch020[0] = regs.cacheholdingdata020;
		fill_icache030(pc + 4);
		regs.prefetch020[1] = regs.cacheholdingdata020;

		regs.irc = getInst16_icache030_prefetch(0);
	}
	function fill_prefetch() {
		//regs.pipeline_pos = 0;
		if (!SAEV_config.cpu.compatible)
			return;
		/*if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68040) {
			if (SAEV_config.cpu.compatible || currprefs.cpu_memory_cycle_exact) {
				fill_icache040(getPC() + 16);
				fill_icache040(getPC());
			}
		} else*/
		if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68030)
			fill_prefetch_030();
		else if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68020)
			fill_prefetch_020();
		else if (SAEV_config.cpu.model <= SAEC_Config_CPU_Model_68010) {
			var pc = getPC();
			//regs.ir = SAER_Memory_getInst16(pc);
			//regs.irc = SAER_Memory_getInst16(pc + 2);
			regs.ir = SAER_Memory_banks[pc >>> 16].getInst16(pc);
			regs.irc = SAER_Memory_banks[(pc + 2) >>> 16].getInst16(pc + 2);

		}
	}
	SAER_CPU_fill_prefetch = fill_prefetch;

	/*-----------------------------------------------------------------------*/
	/* PC direct (regs.pc_p) access */

	function setPC(newpc) { //m68k_setpc()
		regs.instruction_pc = regs.pc = newpc;
		regs.pc_p = regs.pc_oldp = newpc;
	}
	SAER_CPU_setPC = setPC;

	function getPC() { //m68k_getpc()
		return regs.pc + (regs.pc_p - regs.pc_oldp);
	}
	SAER_CPU_getPC = getPC;

	function incPC(o) { //m68k_incpc()
		regs.pc_p += o;
	}

	function syncPC() {
		setPC(getPC());
	}

	/*function setPC_default(pc) {
		setPC(pc);
		pc_offset = PC_OFFSET;
	}
	function getPC_default() {
		return getPC() + pc_offset;
	}
	function syncPC_default() {
		//pc_offset_old = pc_offset;
		incPC(pc_offset);
		pc_offset = PC_OFFSET;
	}
	function syncPC_default_noreset() { //sync_m68k_pc_noreset()
		coreSyncPC();
		pc_offset = pc_offset_old;
	}
	function clrPC_default() { //clear_m68k_offset()
		pc_offset = 0;
	}*/

	/*---------------------------------*/
	/* PC indirect (regs.pc) access */

	function setPCi(newpc) { //m68k_setpci()
		regs.instruction_pc = regs.pc = newpc;
	}
	function getPCi() { //m68k_getpci()
		return regs.pc;
	}
	function incPCi(o) { //m68k_incpci()
		regs.pc += o;
	}
	//function syncPCi() {}

	function getPC_prefetch() {
		return getPCi() + pc_offset;
	}
	function setPC_prefetch(pc) {
		setPCi(pc);
		pc_offset = PC_OFFSET;
		fill_prefetch();
	}
	function syncPC_prefetch() {
		//pc_offset_old = pc_offset;
		incPCi(pc_offset);
		pc_offset = PC_OFFSET;
		regs.ir = getInst16_prefetch(2);
	}
	function syncPC_icache020_prefetch() {
		//pc_offset_old = pc_offset;
		incPCi(pc_offset);
		pc_offset = PC_OFFSET;
		regs.irc = getInst16_icache020_prefetch(0);
	}
	function syncPC_icache030_prefetch() {
		//pc_offset_old = pc_offset;
		incPCi(pc_offset);
		pc_offset = PC_OFFSET;
		regs.irc = getInst16_icache030_prefetch(0);
	}

	/*-----------------------------------------------------------------------*/
	/* PC common access */

	this.setPC_normal = function(pc) { //m68k_setpc_normal()
		if (SAEV_config.cpu.compatible) {
			regs.pc_p = regs.pc_oldp = 0;
			setPCi(pc);
		} else
			setPC(pc);
	}

	this.getPC_normal = function() { //m68k_getpc_normal()
		if (SAEV_config.cpu.compatible)
			return getPCi();
		else
			return getPC();
	}

	this.incPC_normal = function(o) { //m68k_incpc_normal()
		if (SAEV_config.cpu.compatible)
			incPCi(o);
		else
			incPC(o);
	}

	/*-----------------------------------------------------------------------*/
	/* next instruction direct (regs.pc_p) */

	function nextInst16_default() { //next_diword()
		//var r = SAER_Memory_getInst16(regs.pc_p);
		var r = SAER_Memory_banks[regs.pc_p >>> 16].getInst16(regs.pc_p);
		regs.pc_p += 2; //incPC(2);
		return r;
	}
	function nextInst32_default() { //next_dilong()
		//var r = SAER_Memory_getInst32(regs.pc_p);
		var r = SAER_Memory_banks[regs.pc_p >>> 16].getInst32(regs.pc_p);
		regs.pc_p += 4; //incPC(4);
		return r;
	}
	/*function nextInst16_default() {
		var r = pc_offset;
		pc_offset += 2;
		return SAER_Memory_getInst16(regs.pc_p + r);
	}
	function nextInst32_default() {
		var r = pc_offset;
		pc_offset += 4;
		return SAER_Memory_getInst32(regs.pc_p + r);
	}*/


	function getInst16_default(o) { //get_diword()
		//return SAER_Memory_getInst16(regs.pc_p + o);
		return SAER_Memory_banks[(regs.pc_p + o) >>> 16].getInst16(regs.pc_p + o);
	}
	function getInst32_default(o) { //get_dilong()
		//return SAER_Memory_getInst32(regs.pc_p + o);
		return SAER_Memory_banks[(regs.pc_p + o) >>> 16].getInst32(regs.pc_p + o);
	}

	/*function m68k_do_bsr(oldpc, offset) {
		regs.a[7] -= 4;
		SAER_Memory_put32(regs.a[7], oldpc);
		incPC(offset);
	}
	function m68k_do_rts() {
		uae_u32 newpc = SAER_Memory_get32(regs.a[7]);
		setPC(newpc);
		regs.a[7] += 4;
	}*/

	/*-----------------------------------------------------------------------*/
	/* next instruction indirect (regs.pc) */

	/*function next_iibyte() {
		var r = get_iibyte(0);
		incPCi(2);
		return r;
	}
	function next_iiword() {
		var r = get_iiword(0);
		incPCi(2);
		return r;
	}
	function next_iilong() {
		var r = get_iilong(0);
		incPCi(4);
		return r;
	}
	function next_iiwordi() {
		var r = SAER_Memory_getInst16(getPCi());
		incPCi(2);
		return r;
	}
	function next_iilongi() {
		var r = SAER_Memory_getInst32(getPCi());
		incPCi(4);
		return r;
	}

	function get_iibyte(o) {
		return SAER_Memory_getInst16(getPCi() + o) & 0xff;
	}
	function get_iiword(o) {
		return SAER_Memory_getInst16(getPCi() + o);
	}
	function get_iilong(o) {
		return SAER_Memory_getInst32(getPCi() + o);
	}

	function void m68k_do_bsri(oldpc, offset) {
		regs.a[7] -= 4;
		SAER_Memory_put32(regs.a[7], oldpc);
		incPCi(offset);
	}
	function void m68k_do_rtsi() {
		uae_u32 newpc = SAER_Memory_get32(regs.a[7]);
		setPCi(newpc);
		regs.a[7] += 4;
	}*/

	/*-----------------------------------------------------------------------*/
	/* 68000/68010 prefetch */

	function getInst16_prefetch(o) { //get_word_000_prefetch()
		var v = regs.irc;
		//regs.irc = regs.db = SAER_Memory_getInst16(getPCi() + o);
		//regs.irc = regs.db = SAER_Memory_getInst16(regs.pc + o);
		regs.irc = regs.db = SAER_Memory_banks[(regs.pc + o) >>> 16].getInst16(regs.pc + o);
		return v;
	}
	function getInst32_prefetch(o) { //get_long_000_prefetch()
		return ((getInst16_prefetch(o) << 16) | getInst16_prefetch(o + 2)) >>> 0;
	}

	/*function nextInst16_prefetch() { //OWN
		var r = getInst16_prefetch(0);
		incPCi(2);
		return r;
	}
	function nextInst32_prefetch() { //OWN
		return ((nextInst16_prefetch() << 16) | nextInst16_prefetch()) >>> 0;
	}*/
	function nextInst16_prefetch() {
		var r = pc_offset;
		pc_offset += 2;
		return getInst16_prefetch(r + 2);
	}
	function nextInst32_prefetch() {
		var r = pc_offset;
		pc_offset += 4;
		return getInst32_prefetch(r + 2);
	}

	function get8_prefetch(addr) { //get_byte_000()
		var v = SAER_Memory_get8(addr);
		regs.db = (v << 8) | v;
		return v;
	}
	function get16_prefetch(addr) { //get_word_000()
		var v = SAER_Memory_get16(addr);
		regs.db = v;
		return v;
	}
	function get32_prefetch(addr) { //OWN
		return ((get16_prefetch(addr) << 16) |  get16_prefetch(addr + 2)) >>> 0;
	}

	function put8_prefetch(addr, v) { //put_byte_000()
		regs.db = (v << 8) | v;
		SAER_Memory_put8(addr, v);
	}
	function put16_prefetch(addr, v) { //put_word_000()
		regs.db = v;
		SAER_Memory_put16(addr, v);
	}
	function put32_prefetch(addr, v) { //OWN
		put16_prefetch(addr, v >>> 16);
		put16_prefetch(addr + 2, v & 0xffff);
	}

	/*---------------------------------*/
	/* 68020 prefetch */

	/*function nextInst16_icache020_prefetch() { //next_iword_020_prefetch()
		var r = getInst16_icache020_prefetch(0);
		incPCi(2);
		return r;
	}
	function nextInst32_icache020_prefetch() { //next_ilong_020_prefetch()
		return ((nextInst16_icache020_prefetch() << 16) | nextInst16_icache020_prefetch()) >>> 0;
	}*/
	function nextInst16_icache020_prefetch() {
		var r = pc_offset;
		pc_offset += 2;
		return getInst16_icache020_prefetch(r);
	}
	function nextInst32_icache020_prefetch() {
		var r = pc_offset;
		pc_offset += 4;
		return getInst32_icache020_prefetch(r);
	}

	/*---------------------------------*/
	/* 68030 prefetch */

	/*function nextInst16_icache030_prefetch() { //next_iword_030_prefetch()
		var r = getInst16_icache030_prefetch(0);
		incPCi(2);
		return r;
	}
	function nextInst32_icache030_prefetch() { //next_ilong_030_prefetch()
		var r = getInst32_icache030_prefetch(0);
		incPCi(4);
		return r;
	}*/
	function nextInst16_icache030_prefetch() {
		var r = pc_offset;
		pc_offset += 2;
		return getInst16_icache030_prefetch(r);
	}
	function nextInst32_icache030_prefetch() {
		var r = pc_offset;
		pc_offset += 4;
		return getInst32_icache030_prefetch(r);
	}

	/*function m68k_do_bsr_030(oldpc, offset) {
		regs.a[7] -= 4;
		dcachePut32(regs.a[7], oldpc);
		incPCi(offset);
	}
	function m68k_do_rts_030() {
		setPC(dcacheGet32(regs.a[7]));
		regs.a[7] += 4;
	}*/

	/*---------------------------------*/

	function setup_functions() {
		if (SAEV_config.cpu.compatible) {
			coreGetPC = getPC_prefetch;
			coreSetPC = setPC_prefetch;

			if (SAEV_config.cpu.model < SAEC_Config_CPU_Model_68020) {
				coreSyncPC = syncPC_prefetch;
				coreNext16 = nextInst16_prefetch;
				coreNext32 = nextInst32_prefetch;
				coreGetInst16 = getInst16_prefetch;
				coreGetInst32 = getInst32_prefetch;
				coreGet8  = get8_prefetch;
				coreGet16 = get16_prefetch;
				coreGet32 = get32_prefetch;
				corePut8  = put8_prefetch;
				corePut16 = put16_prefetch;
				corePut32 = put32_prefetch;
			} else if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68020) {
				coreSyncPC = syncPC_icache020_prefetch;
				coreNext16 = nextInst16_icache020_prefetch;
				coreNext32 = nextInst32_icache020_prefetch;
				coreGetInst16 = getInst16_icache020_prefetch;
				coreGetInst32 = getInst32_icache020_prefetch;
				coreGet32 = SAER_Memory_get32;
				corePut32 = SAER_Memory_put32;
				coreGet16 = SAER_Memory_get16;
				corePut16 = SAER_Memory_put16;
				coreGet8  = SAER_Memory_get8;
				corePut8  = SAER_Memory_put8;
			} else if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68030) {
				coreSyncPC = syncPC_icache030_prefetch;
				coreNext16 = nextInst16_icache030_prefetch;
				coreNext32 = nextInst32_icache030_prefetch;
				coreGetInst32 = getInst32_icache030_prefetch;
				coreGetInst16 = getInst16_icache030_prefetch;
				coreGet8  = get8_dcache030;
				coreGet16 = get16_dcache030;
				coreGet32 = get32_dcache030;
				corePut8  = put8_dcache030;
				corePut16 = put16_dcache030;
				corePut32 = put32_dcache030;
			}
		} else {
			//coreGetPC = getPC_default;
			//coreSetPC = setPC_default;
			//coreSyncPC = syncPC_default;
			coreGetPC = getPC;
			coreSetPC = setPC;
			coreSyncPC = syncPC;
			coreNext16 = nextInst16_default;
			coreNext32 = nextInst32_default;
			coreGetInst32 = getInst32_default;
			coreGetInst16 = getInst16_default;
			coreGet32 = SAER_Memory_get32;
			corePut32 = SAER_Memory_put32;
			coreGet16 = SAER_Memory_get16;
			corePut16 = SAER_Memory_put16;
			coreGet8 = SAER_Memory_get8;
			corePut8 = SAER_Memory_put8;
		}
	}

	/*-----------------------------------------------------------------------*/

	function coreReset() {
		SAER.m68k.cpureset();
	}

	function coreStop() {
		SAER.m68k.m68k_setstopped();
	}

	/*-----------------------------------------------------------------------*/

	function coreGetCCR() {
		return (((regs.x ? 1 : 0) << 4) | ((regs.n ? 1 : 0) << 3) | ((regs.z ? 1 : 0) << 2) | ((regs.v ? 1 : 0) << 1) | (regs.c ? 1 : 0));
	}
	function coreSetCCR(ccr) {
		regs.x = ((ccr >> 4) & 1) == 1;
		regs.n = ((ccr >> 3) & 1) == 1;
		regs.z = ((ccr >> 2) & 1) == 1;
		regs.v = ((ccr >> 1) & 1) == 1;
		regs.c = (ccr & 1) == 1;
	}

	/*-----------------------------------------------------------------------*/

	function coreGetSR() {
		return (
			((regs.t1 ? 1 : 0) << 15) | ((regs.t0 ? 1 : 0) << 14) |
			((regs.s ? 1 : 0) << 13) | ((regs.m ? 1 : 0) << 12) | (regs.intmask << 8) |
			((regs.x ? 1 : 0) << 4) | ((regs.n ? 1 : 0) << 3) | ((regs.z ? 1 : 0) << 2) | ((regs.v ? 1 : 0) << 1) | (regs.c ? 1 : 0)
		);
	}
	function coreSetSR(sr) {
		var oldm = regs.m;
		var olds = regs.s;

		regs.x = ((sr >> 4) & 1) == 1;
		regs.n = ((sr >> 3) & 1) == 1;
		regs.z = ((sr >> 2) & 1) == 1;
		regs.v = ((sr >> 1) & 1) == 1;
		regs.c = (sr & 1) == 1;

		var t1 = ((sr >> 15) & 1) == 1;
		var t0 = ((sr >> 14) & 1) == 1;
		var s = ((sr >> 13) & 1) == 1;
		var m = ((sr >> 12) & 1) == 1;
		var intmask = ((sr >> 8) & 7);
		if (regs.t1 == t1 && regs.t0 == t0 && regs.s == s && regs.m == m && regs.intmask == intmask) {
			//SAEF_log("cpu.coreSetSR() mode ok!");
			return;
		}
		regs.t1 = t1;
		regs.t0 = t0;
		regs.s = s;
		regs.m = m;
		regs.intmask = intmask;

		if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68020) {
			if (olds != regs.s) {
				if (olds) {
					if (oldm)
						regs.msp = regs.a[7];
					else
						regs.isp = regs.a[7];
					regs.a[7] = regs.usp;
				} else {
					regs.usp = regs.a[7];
					regs.a[7] = regs.m ? regs.msp : regs.isp;
				}
			} else if (olds && oldm != regs.m) {
				if (oldm) {
					regs.msp = regs.a[7];
					regs.a[7] = regs.isp;
				} else {
					regs.isp = regs.a[7];
					regs.a[7] = regs.msp;
				}
			}
		} else {
			regs.t0 = regs.m = 0;
			if (olds != regs.s) {
				if (olds) {
					regs.isp = regs.a[7];
					regs.a[7] = regs.usp;
				} else {
					regs.usp = regs.a[7];
					regs.a[7] = regs.isp;
				}
			}
		}

		SAER.m68k.doint_trace(regs.t1 || regs.t0); /*{
			if (regs.t1 || regs.t0)
				SAEF_setSpcFlags(SAEC_spcflag_TRACE);
			else
				SAEF_clrSpcFlags(SAEC_spcflag_TRACE);
		}*/
	}

	/*-----------------------------------------------------------------------*/
	/* exception */

	function exception_trace(nr) {
		SAEF_clrSpcFlags(SAEC_spcflag_TRACE | SAEC_spcflag_DOTRACE);
		if (regs.t1 && !regs.t0) {
			if (nr == 5 || nr == 6 || nr == 7 || (nr >= 32 && nr <= 47))
				SAEF_setSpcFlags(SAEC_spcflag_DOTRACE);
		}
		regs.t1 = regs.t0 = regs.m = false;
	}

	function exception_pc(nr) {
		// bus error, address error, illegal instruction, privilege violation, a-line, f-line
		if (nr == 2 || nr == 3 || nr == 4 || nr == 8 || nr == 10 || nr == 11)
			return regs.instruction_pc;
		return getPC();
	}

	function add_approximate_exception_cycles(nr) {
		var cycles;

		if (SAEV_config.cpu.model > SAEC_Config_CPU_Model_68000)
			return;

		if (nr >= 24 && nr <= 31) {
			/* Interrupts */
			cycles = 44 + 4;
		} else if (nr >= 32 && nr <= 47) {
			/* Trap (total is 34, but cpuemux.c already adds 4) */
			cycles = 34; //- 4;
		} else {
			switch (nr) {
				case 2: cycles = 50; break; /* Bus error */
				case 3: cycles = 50; break; /* Address error */
				case 4: cycles = 34; break; /* Illegal instruction */
				case 5: cycles = 38; break; /* Division by zero */
				case 6: cycles = 40; break; /* CHK */
				case 7: cycles = 34; break; /* TRAPV */
				case 8: cycles = 34; break; /* Privilege violation */
				case 9: cycles = 34; break; /* Trace */
				case 10: cycles = 34; break; /* Line-A */
				case 11: cycles = 34; break; /* Line-F */
				default: cycles = 4;
			}
		}
		//SAEF_log("cpu.add_approximate_exception_cycles() nr %d, cycles %d", nr, cycles);
		//cycles = cycles * cpucycleunit;
		//cycles = adjust_cycles(cycles * SAEC_Events_CYCLE_UNIT / 2);
		cycles = adjust_cycles((cycles * SAEC_Events_CYCLE_UNIT) >> 1);
		SAER.events.do_cycles(cycles);
	}

	function add_approximate_exception_cycles_020(nr) { //OWN
		var cycles;

		if (nr >= 24 && nr <= 31) {
			/* Interrupts */
			cycles = regs.m ? 41 : 26;
		} else if (nr >= 32 && nr <= 47) {
			/* Trap */
			cycles = 20;
		} else {
			switch (nr) {
				case 2: cycles = 50; break; /* Bus error */
				case 3: cycles = 50; break; /* Address error */
				case 4: cycles = 20; break; /* Illegal instruction */
				case 5: cycles = 20; break; /* Division by zero */
				case 6: cycles = 20; break; /* CHK */
				case 7: cycles = 23; break; /* TRAPV */
				case 8: cycles = 20; break; /* Privilege violation */
				case 9: cycles = 25; break; /* Trace */
				case 10: cycles = 20; break; /* Line-A */
				case 11: cycles = 20; break; /* Line-F */
				default: cycles = 4;
			}
		}
		//SAEF_log("cpu.add_approximate_exception_cycles_020() nr %d, cycles %d", nr, cycles);
		cycles = cycles * cpucycleunit;
		SAER.events.do_cycles(cycles);
	}

	function exception(nr) {
		var currpc;
		var sv = regs.s;
		var vector_nr = nr;
		var kludge_me_do = true;

		var interrupt = nr >= 24 && nr < 24 + 8;

		if (interrupt && SAEV_config.cpu.model <= SAEC_Config_CPU_Model_68010)
			vector_nr = coreGet8(0x00fffff1 | ((nr - 24) << 1));

		var sr = coreGetSR();

		if (!regs.s) {
			regs.usp = regs.a[7];
			if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68020) {
				regs.a[7] = regs.m ? regs.msp : regs.isp;
			} else {
				regs.a[7] = regs.isp;
			}
			regs.s = true;
		}

		if ((regs.a[7] & 1) && SAEV_config.cpu.model < SAEC_Config_CPU_Model_68020) {
			if (nr == 2 || nr == 3)
				SAER.m68k.cpu_halt(SAEC_CPU_halt_DOUBLE_FAULT);
			else
				exception3_notinstruction(regs.ir, regs.a[7]);
			return;
		}
		if ((nr == 2 || nr == 3) && exception_in_exception < 0) {
			SAER.m68k.cpu_halt(SAEC_CPU_halt_DOUBLE_FAULT);
			return;
		}

		if (SAEV_config.cpu.model > SAEC_Config_CPU_Model_68000) {
			/*if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68020) //OWN
				add_approximate_exception_cycles_020(nr);
			else
				add_approximate_exception_cycles(nr);*/

			currpc = exception_pc(nr);
			if (nr == 2 || nr == 3) {
				var ssw = (sv ? 4 : 0) | (last_instructionaccess_for_exception_3 ? 2 : 1);
				ssw |= last_writeaccess_for_exception_3 ? 0 : 0x40;
				ssw |= 0x20;
				/*for (var i = 0 ; i < 36; i++) {
					regs.a[7] -= 2; corePut16(regs.a[7], 0);
				}
				regs.a[7] -= 4; corePut32(regs.a[7], last_fault_for_exception_3);
				regs.a[7] -= 2; corePut16(regs.a[7], 0);
				regs.a[7] -= 2; corePut16(regs.a[7], 0);
				regs.a[7] -= 2; corePut16(regs.a[7], 0);
				regs.a[7] -= 2; corePut16(regs.a[7], ssw);
				regs.a[7] -= 2; corePut16(regs.a[7], 0xb000 + vector_nr * 4);*/

				for (var i = 0 ; i < 36; i++) stackPut16(0);
				stackPut32(last_fault_for_exception_3);
				stackPut16(0);
				stackPut16(0);
				stackPut16(0);
				stackPut16(ssw);
				stackPut16(0xb000 + vector_nr * 4);

				SAEF_log("cpu.exception() %d (%x) at %x -> %x!", nr, regs.instruction_pc, currpc, SAER_Memory_get32(regs.vbr + 4 * vector_nr));
			} else if (nr == 5 || nr == 6 || nr == 7 || nr == 9) {
				//regs.a[7] -= 4; corePut32(regs.a[7], regs.instruction_pc);
				//regs.a[7] -= 2; corePut16(regs.a[7], 0x2000 + vector_nr * 4);
				stackPut32(regs.instruction_pc);
				stackPut16(0x2000 + vector_nr * 4);
			} else if (regs.m && interrupt) { // M + Interrupt
				//regs.a[7] -= 2; corePut16(regs.a[7], vector_nr * 4);
				//regs.a[7] -= 4; corePut32(regs.a[7], currpc);
				//regs.a[7] -= 2; corePut16(regs.a[7], sr);
				stackPut16(vector_nr * 4);
				stackPut32(currpc);
				stackPut16(sr);
				//sr |= (1 << 13);
				regs.s = true;
				regs.msp = regs.a[7];
				regs.m = false;
				regs.a[7] = regs.isp;
				//regs.a[7] -= 2; corePut16(regs.a[7], 0x1000 + vector_nr * 4);
				stackPut16(0x1000 + vector_nr * 4);
			} else {
				//regs.a[7] -= 2; corePut16(regs.a[7], vector_nr * 4);
				stackPut16(vector_nr * 4);
			}
		} else {
			add_approximate_exception_cycles(nr);
			//currpc = getPC();
			currpc = exception_pc(nr);
			if (nr == 2 || nr == 3) {
				var mode = (sv ? 4 : 0) | (last_instructionaccess_for_exception_3 ? 2 : 1);
				mode |= last_writeaccess_for_exception_3 ? 0 : 16;
				mode |= last_notinstruction_for_exception_3 ? 8 : 0;
				mode |= last_op_for_exception_3 & ~31;// undocumented bits seem to contain opcode
				exception_in_exception = -1;
				/*regs.a[7] -= 14;
				corePut16(regs.a[7] + 0, mode);
				corePut32(regs.a[7] + 2, last_fault_for_exception_3);
				corePut16(regs.a[7] + 6, last_op_for_exception_3);
				corePut16(regs.a[7] + 8, sr);
				corePut32(regs.a[7] + 10, last_addr_for_exception_3);*/
				stackPut32(last_addr_for_exception_3);
				stackPut16(sr);
				stackPut16(last_op_for_exception_3);
				stackPut32(last_fault_for_exception_3);
				stackPut16(mode);

				SAEF_log("cpu.exception() %d (%x) at %x -> %x!", nr, last_fault_for_exception_3, currpc, SAER_Memory_get32(regs.vbr + 4 * vector_nr));
				//goto kludge_me_do;
				kludge_me_do = false;
			} //else
				//SAEF_log("cpu.exception() %d at %x -> %x!", nr, currpc, SAER_Memory_get32(regs.vbr + 4 * vector_nr));
		}
		if (kludge_me_do) {
			//regs.a[7] -= 4; corePut32(regs.a[7], currpc);
			//regs.a[7] -= 2; corePut16(regs.a[7], sr);
			stackPut32(currpc);
			stackPut16(sr);
		}
		//kludge_me_do:
		var newpc = coreGet32(regs.vbr + 4 * vector_nr);
		//SAEF_log("cpu.exception() %08x -> %08x", currpc, newpc);
		exception_in_exception = 0;
		if (newpc & 1) {
			if (nr == 2 || nr == 3)
				SAER.m68k.cpu_halt(SAEC_CPU_halt_DOUBLE_FAULT);
			else
				exception3_notinstruction(regs.ir, newpc);
			return;
		}
		setPC(newpc);
		fill_prefetch();
		exception_trace(nr);
	}
	SAER_CPU_exception = exception;
	function coreException(nr) {
		if (!(nr == 2 || nr == 3 || nr == 4 || nr == 8 || nr == 10 || nr == 11))
			coreSyncPC();

		exception(nr);
		return [0,0,0];
	}

	function exception3f(opcode, addr, writeaccess, instructionaccess, notinstruction, pc, plus2) {
		if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68020) {
			if (pc == 0xffffffff)
				last_addr_for_exception_3 = regs.instruction_pc;
			else
				last_addr_for_exception_3 = pc;
		} else if (pc == 0xffffffff) {
			last_addr_for_exception_3 = getPC();
			if (plus2)
				last_addr_for_exception_3 += 2;
		} else {
			last_addr_for_exception_3 = pc;
		}
		last_fault_for_exception_3 = addr;
		last_op_for_exception_3 = opcode;
		last_writeaccess_for_exception_3 = writeaccess;
		last_instructionaccess_for_exception_3 = instructionaccess;
		last_notinstruction_for_exception_3 = notinstruction;
		exception(3);
	}
	function exception3_notinstruction(opcode, addr) {
		exception3f(opcode, addr, true, false, true, 0xffffffff, false);
	}
	function exception3i(opcode, addr) {
		exception3f(opcode, addr, 0, 1, false, 0xffffffff, true);
	}
	/*this.exception3b = function(opcode, addr, w, i, pc) {
		exception3f(opcode, addr, w, i, false, pc, true);
	}
	this.exception3_read = function(opcode, addr) {
		exception3f(opcode, addr, false, 0, false, 0xffffffff, false);
	}
	this.exception3_write = function(opcode, addr) {
		exception3f(opcode, addr, true, 0, false, 0xffffffff, false);
	}*/
	function coreException3i(opcode, addr) {
		exception3i(opcode, addr)
		return [0,0,0];
	}

	this.exception2 = function(addr, read, size, fc) {
		last_addr_for_exception_3 = getPC() + bus_error_offset;
		last_fault_for_exception_3 = addr;
		last_writeaccess_for_exception_3 = read == 0;
		last_instructionaccess_for_exception_3 = (fc & 1) == 0;
		last_op_for_exception_3 = regs.opcode;
		last_notinstruction_for_exception_3 = exception_in_exception != 0;
		throw new Exception23(2);
	}

	/*-----------------------------------------------------------------------*/
	/* illegal instruction */

	function munge24(x) {
		return (x & (SAEV_config.cpu.addressSpace24 ? 0x00ffffff : 0xffffffff)) >>> 0;
	}
	function in_rom(pc) {
		return (munge24(pc) & 0xFFF80000) >>> 0 == 0xF80000;
	}
	function in_rtarea(pc) {
		return (munge24(pc) & 0xFFFF0000) >>> 0 == SAEV_AutoConf_base && SAEV_AutoConf_boot_rom_type;
	}
	this.pc_in_rom = function() { /* used in cia.ciab_checkalarm() */
		var pc = getPC();
		return (munge24(pc) & 0xFFF80000) == 0xF80000;
	}

	function illegal(opcode) {
		var pc = getPC();
		var inrom = in_rom(pc);
		var inrt = in_rtarea(pc);

		if (SAEV_Memory_cloantoRom && (opcode & 0xF100) == 0x7100) {
			regs.d[(opcode >> 9) & 7] = extByte(opcode & 0xFF);
			SAER.cpu.incPC_normal(2);
			fill_prefetch();
			return true;
		}

		if (opcode == 0x4E7B && inrom) {
			if (SAER_Memory_get32(0x10) == 0) {
				SAEF_fatal(SAEE_CPU_Requires68020, "The selected kickstart-rom does require a 68020 and 32bit address-space");
				//notify_user (NUMSG_KS68020);
				//uae_restart(-1, null);
			}
		}

		//#ifdef AUTOCONFIG
		if (opcode == 0xFF0D && inrt) {
			// User-mode STOP replacement
			SAEF_log("cpu.illegal() STOP replacement, pc %08x", pc);
			m68k_setstopped();
			return true;
		}
		if ((opcode & 0xF000) == 0xA000 && inrt) {
			// Calltrap.
			SAEF_log("cpu.illegal() Trap %03X at %08X, call...", opcode & 0xFFF, pc);
			SAER.cpu.incPC_normal(2);
			SAER.autoconf.m68k_handle_trap(opcode & 0xFFF);
			fill_prefetch();
			return true;
		}
		//#endif

		if ((opcode & 0xF000) == 0xF000) {
			if (++illegal_warned < 20)
				SAEF_log("cpu.illegal() B-Trap %04X at %08X -> %08X (VBR %08X)", opcode, pc, SAER_Memory_get32(regs.vbr + 0x2c), regs.vbr);

			coreException(0xB);
			return false;
		}
		if ((opcode & 0xF000) == 0xA000) {
			if (++illegal_warned < 20)
				SAEF_log("cpu.illegal() A-Trap %04X at %08X -> %08X (VBR %08X)", opcode, pc, SAER_Memory_get32(regs.vbr + 0x28), regs.vbr);

			coreException(0xA);
			return false;
		}
		if (++illegal_warned < 20)
			SAEF_log("cpu.illegal() op %04x, pc %08x -> %08x", opcode, pc, SAER_Memory_get32(regs.vbr + 0x10));

		coreException(4);
		return false;
	}
	function coreIllegal(op) {
		coreSyncPC();
		if (illegal(op))
			return [4,0,0]; /* no exception */
		else
			return [0,0,0];
	}

	/*-----------------------------------------------------------------------*/
	/* core-loop */

	function update_cycles() { //update_68k_cycles()
		cycles_mult = 0;
		if (SAEV_config.cpu.speed != SAEC_Config_CPU_Speed_Maximum) { //&& !currprefs.cpu_cycle_exact) {
			if (SAEV_config.cpu.speedThrottle < 0.0)
				cycles_mult = Math.floor(CYCLES_DIV * 1000 / (1000 + SAEV_config.cpu.speedThrottle));
			else if (SAEV_config.cpu.speedThrottle > 0)
				cycles_mult = Math.floor(CYCLES_DIV * 1000 / (1000 + SAEV_config.cpu.speedThrottle));
		}
		/*if (SAEV_config.cpu.speed == SAEC_Config_CPU_Speed_Original) {
			//if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68040) {
			if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68030) {
				if (!cycles_mult)
					cycles_mult = CYCLES_DIV / 8; // == 1024
				else
					cycles_mult = Math.floor(cycles_mult / 8);
			} else if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68020) {
				if (!cycles_mult)
					cycles_mult = CYCLES_DIV / 4; // == 2048
				else
					cycles_mult = Math.floor(cycles_mult / 4);
			} else { //OWN
				if (!cycles_mult)
					cycles_mult = CYCLES_DIV / 2; // == 4096
				else
					cycles_mult = Math.floor(cycles_mult / 2);
			}
		}*/

		cpucycleunit = SAEC_Events_CYCLE_UNIT / 2;
		if (SAEV_config.cpu.clock.multiplier) {
			if (SAEV_config.cpu.clock.multiplier >= 256)
				cpucycleunit = SAEC_Events_CYCLE_UNIT / (SAEV_config.cpu.clock.multiplier >> 8);
			else
				cpucycleunit = SAEC_Events_CYCLE_UNIT * SAEV_config.cpu.clock.multiplier;

			//if (SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68040) cpucycleunit >>= 1;
		}
		else if (SAEV_config.cpu.clock.frequency) {
			var baseclock = (SAEV_config.chipset.ntsc ? SAEC_Playfield_CLOCK_NTSC : SAEC_Playfield_CLOCK_PAL) * 8; //28 MHz
			cpucycleunit = Math.floor(SAEC_Events_CYCLE_UNIT * baseclock / SAEV_config.cpu.clock.frequency);
		}
		/*else if (currprefs.cpu_cycle_exact && SAEV_config.cpu.clock.multiplier == 0) {
			if (SAEV_config.cpu.model >= 68040)
				cpucycleunit = SAEC_Events_CYCLE_UNIT / 16;
			if (SAEV_config.cpu.model == 68030)
				cpucycleunit = SAEC_Events_CYCLE_UNIT / 8;
			else if (SAEV_config.cpu.model == 68020)
				cpucycleunit = SAEC_Events_CYCLE_UNIT / 4;
			else
				cpucycleunit = SAEC_Events_CYCLE_UNIT / 2;
		}*/

		if (cpucycleunit < 1)
			cpucycleunit = 1;

		SAEF_log("cpu.update_cycles() cycleunit: %d (%.3f), cycles_mult %d", cpucycleunit, cpucycleunit / SAEC_Events_CYCLE_UNIT, cycles_mult);
	}

	function adjust_cycles(cycles) {
		if (cycles_mult == 0 || SAEV_config.cpu.speed == SAEC_Config_CPU_Speed_Maximum)
			return cycles;
		/*cycles *= cycles_mult;
		cycles /= CYCLES_DIV;
		return cycles;*/
		return Math.floor((cycles * cycles_mult) / CYCLES_DIV);
	}

	function bus_error() {
		SAEF_warn("cpu.bus_error() PC %08x", getPC());
		try {
			exception(2);
		} catch(e) {
			if (e instanceof Exception23)
				SAER.m68k.cpu_halt(SAEC_CPU_halt_BUS_ERROR_DOUBLE_FAULT);
			else
				throw e;
		}
	}

	function runPrefetch000() { //m68k_run_2p()
		var exit = false;

		while (!exit) {
			try {
				while (!exit) {
					regs.instruction_pc = getPC();
					regs.opcode = regs.ir;

					SAER.events.do_cycles(cpu_cycles);
					//regs.instruction_pc = getPC();

					var orw_cycles = iTab[regs.opcode].f(iTab[regs.opcode].p);
					cpu_cycles = orw_cycles[0] * cpucycleunit;
					//cpu_cycles = adjust_cycles(orw_cycles[0] * cpucycleunit);
					SAEV_CPU_cycles = cpu_cycles;

					if (SAEV_spcflags) {
						if (SAER.m68k.do_specialties(cpu_cycles))
							exit = true;
					}
				}
			} catch(e) {
				if (e instanceof Exception23) {
					bus_error();
					if (SAEV_spcflags) {
						if (SAER.m68k.do_specialties(cpu_cycles))
							exit = true;
					}
				} else
					throw e;
			}
		}
	}

	function runPrefetch020() { //m68k_run_2p()
		var exit = false;

		while (!exit) {
			try {
				while (!exit) {
					regs.instruction_pc = getPC();
					regs.opcode = regs.irc;

					SAER.events.do_cycles(cpu_cycles);

					var orw_cycles = iTab[regs.opcode].f(iTab[regs.opcode].p);
					cpu_cycles = orw_cycles[0] * cpucycleunit;
					//cpu_cycles = adjust_cycles(orw_cycles[0] * cpucycleunit);
					SAEV_CPU_cycles = cpu_cycles;

					if (SAEV_spcflags) {
						if (SAER.m68k.do_specialties(cpu_cycles))
							exit = true;
					}
				}
			} catch(e) {
				if (e instanceof Exception23) {
					bus_error();
					if (SAEV_spcflags) {
						if (SAER.m68k.do_specialties(cpu_cycles))
							exit = true;
					}
				} else
					throw e;
			}
		}
	}

	function runNormal() { //m68k_run_2()
		var exit = false;

		while (!exit) {
			try {
				while (!exit) {
					regs.instruction_pc = getPC();
					//regs.opcode = getInst16_default(0);
					regs.opcode = nextInst16_default();
					SAER.events.do_cycles(cpu_cycles);
					var orw_cycles = iTab[regs.opcode].f(iTab[regs.opcode].p);
					cpu_cycles = orw_cycles[0] * cpucycleunit;
					//cpu_cycles = adjust_cycles(orw_cycles[0] * cpucycleunit);
					SAEV_CPU_cycles = cpu_cycles;

					if (SAEV_spcflags) {
						if (SAER.m68k.do_specialties(cpu_cycles))
							exit = true;
					}
				}
			} catch(e) {
				if (e instanceof Exception23) {
					bus_error();
					if (SAEV_spcflags) {
						if (SAER.m68k.do_specialties(cpu_cycles))
							exit = true;
					}
				} else
					throw e;
			}
		}
	}

	/*-----------------------------------------------------------------------*/
	/* SECT core support functions, ported from WinUAE  */
	/*-----------------------------------------------------------------------*/
	/* MULx/DIVx >= 68020 */

	function mul64(src1, src2) {
		var r0 = (src1 & 0xffff) * (src2 & 0xffff);
		var r1 = ((src1 >>> 16) & 0xffff) * (src2 & 0xffff);
		var r2 = (src1 & 0xffff) * ((src2 >>> 16) & 0xffff);
		var r3 = ((src1 >>> 16) & 0xffff) * ((src2 >>> 16) & 0xffff);

		var lo = r0 + (((r1 << 16) & 0xffff0000) >>> 0); if (lo > 0xffffffff) lo -= 0x100000000;
		if (lo < r0) r3++;
		r0 = lo;
		lo = r0 + (((r2 << 16) & 0xffff0000) >>> 0); if (lo > 0xffffffff) lo -= 0x100000000;
		if (lo < r0) r3++;
		r3 += ((r1 >>> 16) & 0xffff) + ((r2 >>> 16) & 0xffff); if (r3 > 0xffffffff) r3 -= 0x100000000;
		return [lo, r3];
	}

	function divu64(hi, lo, div) {
		var i, quo = 0, cbit = false;
		if (div <= hi) return [1,0,0];

		for (i = 0 ; i < 32 ; i++) {
			cbit = (hi & 0x80000000) != 0;
			hi = (hi << 1) >>> 0;
			if (lo & 0x80000000) hi++;
			lo = (lo << 1) >>> 0;
			quo = (quo << 1) >>> 0;
			if (cbit || div <= hi) {
				quo = (quo | 1) >>> 0;
				hi -= div;
			}
		}
		return [0, quo, hi];
	}

	/*---------------------------------*/
	/* Bitfield >= 68020 */

	const ID_BFCHG  = 1; /* <ea> {offset:width} */
	const ID_BFCLR  = 2; /* <ea> {offset:width} */
	const ID_BFEXTS = 3; /* <ea> {offset:width},Dn */
	const ID_BFEXTU = 4; /* <ea> {offset:width},Dn */
	const ID_BFFFO  = 5; /* <ea> {offset:width},Dn */
	const ID_BFINS  = 6; /* Dn, <ea> {offset:width} */
	const ID_BFSET  = 7; /* <ea> {offset:width} */
	const ID_BFTST  = 8; /* <ea> {offset:width} */

	function bfName(id) {
		switch (id) {
			case ID_BFCHG: return "BFCHG";
			case ID_BFCLR: return "BFCLR";
			case ID_BFEXTS: return "BFEXTS";
			case ID_BFEXTU: return "BFEXTU";
			case ID_BFFFO: return "BFFFO";
			case ID_BFINS: return "BFINS";
			case ID_BFSET: return "BFSET";
			case ID_BFTST: return "BFTST";
		}
	}

	function getBitfield(addr, offset, width) {
		var tmp, res, mask;
		var data = [0,0];

		offs = offset & 7;
		mask = (0xffffffff << (32 - width)) >>> 0;

		switch ((offs + width + 7) >> 3) {
			case 1:
				tmp = coreGet8(addr);
				res = tmp << (24 + offs);
				data[0] = tmp & ~(mask >>> (24 + offs));
				//SAEF_log(("get_bitfield_1 {%d:%d}, data $%08x $%08x, val $%x\n", offset,width, data[0],data[1],res >>> 0));
				break;
			case 2:
				tmp = coreGet16(addr);
				res = tmp << (16 + offs);
				data[0] = tmp & ~(mask >>> (16 + offs));
				//SAEF_log(("get_bitfield_2 {%d:%d}, data $%08x $%08x, val $%x\n", offset,width, data[0],data[1],res >>> 0));
				break;
			case 3:
				tmp = coreGet16(addr);
				res = tmp << (16 + offs);
				data[0] = tmp & ~(mask >>> (16 + offs));
				tmp = coreGet8(addr + 2);
				res |= tmp << (8 + offs);
				data[1] = tmp & ~(mask >>> (8 + offs));
				//SAEF_log(("get_bitfield_3 {%d:%d}, data $%08x $%08x, val $%x\n", offset,width, data[0],data[1],res >>> 0));
				break;
			case 4:
				tmp = coreGet32(addr);
				res = tmp << offs;
				data[0] = tmp & ~(mask >>> offs);
				//SAEF_log(("get_bitfield_4 {%d:%d}, data $%08x $%08x, val $%x\n", offset,width, data[0],data[1],res >>> 0));
				break;
			case 5:
				tmp = coreGet32(addr);
				res = tmp << offs;
				data[0] = tmp & ~(mask >>> offs);
				tmp = coreGet8(addr + 4);
				res |= tmp >> (8 - offs);
				data[1] = tmp & ~(mask << (8 - offs));
				//SAEF_log(("get_bitfield_5 {%d:%d}, data $%08x $%08x, val $%x\n", offset,width, data[0],data[1],res >>> 0));
				break;
			default:
				//SAEF_log(("get_bitfield2() cant happen %d\n", (offs + width + 7) >> 3));
				SAEF_fatal(SAEE_CPU_Internal, "cpu.get_bitfield2() invalid mode (%d)", (offs + width + 7) >> 3);
		}
		return [res >>> 0, data];
	}

	function putBitfield(addr, offset, width, data, val) {
		var out8, out16, out32;

		offs = (offset & 7) + width;
		switch ((offs + 7) >> 3) {
			case 1:
				out8 = ((data[0] | (val << (8 - offs))) >>> 0) & 0xff;
				corePut8(addr, out8); //data[0] | (val << (8 - offs)));
				//SAEF_log(("put_bitfield_1 {%d:%d}, data $%08x $%08x, val $%x, out8 $%x\n", offset,width, data[0],data[1],val, out8));
				break;
			case 2:
				out16 = ((data[0] | (val << (16 - offs))) >>> 0) & 0xffff;
				corePut16(addr, out16); //data[0] | (val << (16 - offs)));
				//SAEF_log(("put_bitfield_2 {%d:%d}, data $%08x $%08x, val $%x, out16 $%x\n", offset,width, data[0],data[1],val, out16));
				break;
			case 3:
				out16 = ((data[0] | (val >> (offs - 16))) >>> 0) & 0xffff;
				out8 = ((data[1] | (val << (24 - offs))) >>> 0) & 0xff;
				corePut16(addr, out16); //data[0] | (val >> (offs - 16)));
				corePut8(addr + 2, out8); //data[1] | (val << (24 - offs)));
				//SAEF_log(("put_bitfield_3 {%d:%d}, data $%08x $%08x, val $%x, out16 $%x out8 $%x\n", offset,width, data[0],data[1],val, out16,out8));
				break;
			case 4:
				out32 = (data[0] | (val << (32 - offs))) >>> 0;
				corePut32(addr, out32); //data[0] | (val << (32 - offs)));
				//SAEF_log(("put_bitfield_4 {%d:%d}, data $%08x $%08x, val $%x, out32 $%x\n", offset,width, data[0],data[1],val, out32));
				break;
			case 5:
				out32 = (data[0] | (val >> (offs - 32))) >>> 0;
				out8 = ((data[1] | (val << (40 - offs))) >>> 0) & 0xff;
				corePut32(addr, out32); //data[0] | (val >> (offs - 32)));
				corePut8(addr + 4, out8); //data[1] | (val << (40 - offs)));
				//SAEF_log(("put_bitfield_5 {%d:%d}, data $%08x $%08x, val $%x, out32 $%x out8 $%x\n", offset,width, data[0],data[1],val, out32,out8));
				break;
			default:
				//SAEF_log(("put_bitfield() cant happen %d\n", (offs + 7) >> 3));
				SAEF_fatal(SAEE_CPU_Internal, "cpu.put_bitfield2() invalid mode (%d)", (offs + 7) >> 3);
		}
	}

	/*---------------------------------*/
	/* MOVEC >= 68010 */

	function movecRegName(cr) {
		switch (cr) {
			//68010/68020/68030/68040
			case 0x000: return "SFC"; //Source Function Code
			case 0x001: return "DFC"; //Destination Function Code
			case 0x800: return "USP"; //User Stack Pointer
			case 0x801: return "VBR"; //Vector Base Register
			//68020/68030/68040
			case 0x002: return "CACR"; //Cache Control Register
			case 0x802: return "CAAR"; //Cache Address Register
			case 0x803: return "MSP"; //Master Stack Pointer
			case 0x804: return "ISP"; //Interrupt Stack Pointer
			//68040/68LC040
			case 0x003: return "TC"; //MMU Translation Control Register
			case 0x004: return "ITT0"; //Instruction Transparent Translation Register 0
			case 0x005: return "ITT1"; //Instruction Transparent Translation Register 1
			case 0x006: return "DTT0"; //Data Transparent Translation Register 0
			case 0x007: return "DTT1"; //Data Transparent Translation Register 1
			case 0x805: return "MMUSR"; //MMU Status Register
			case 0x806: return "URP"; //User Root Pointer
			case 0x807: return "SRP"; //Supervisor Root Pointer
			//68EC040 only
			//case 0x004: return "IACR0"; //Instruction Access Control Register 0
			//case 0x005: return "IACR1"; //Instruction Access Control Register 1
			//case 0x006: return "DACR1"; //Data Access Control Register 0
			//case 0x007: return "DACR1"; //Data Access Control Register 1
		}
		return "???";
	}

	/*function movec_illg(regno) {
		var regno2 = regno & 0x7ff;

		if (model == 68010) {
			if (regno2 < 2)
				return 0;
			return 1;
		}
		else if (model == 68020) {
			if (regno == 3)
				return 1; //68040/060 only
			if (regno2 < 4 || regno == 0x804) //4 is >=68040, but 0x804 is in 68020
				return 0;
			return 1;
		}
		else if (model == 68030) {
			if (regno2 <= 2)
				return 0;
			if (regno == 0x803 || regno == 0x804)
				return 0;
			return 1;
		}
		else if (model == 68040) {
			if (regno == 0x802)
				return 1; //68020/030 only
			if (regno2 < 8) return 0;
			return 1;
		}
		else if (model == 68060) {
			if (regno <= 8)
				return 0;
			if (regno == 0x800 || regno == 0x801 || regno == 0x806 || regno == 0x807 || regno == 0x808)
				return 0;
			return 1;
		}
		return 1;
	}*/
	function movecValid(r) {
		switch (r) {
			//MC68010/MC68020/MC68030/MC68040
			case 0x000: return model >= 68010; //Source Function Code (SFC)
			case 0x001: return model >= 68010; //Destination Function Code (DFC)
			case 0x800: return model >= 68010; //User Stack Pointer (USP)
			case 0x801: return model >= 68010; //Vector Base Register (VBR)
			//MC68020/MC68030/MC68040
			case 0x002: return model >= 68020; //Cache Control Register (CACR)
			case 0x802: return model == 68020 || model == 68030; //Cache Address Register (CAAR) !MC68040
			case 0x803: return model >= 68020; //Master Stack Pointer (MSP)
			case 0x804: return model >= 68020; //Interrupt Stack Pointer (ISP)
			//MC68040/MC68LC040
			/*case 0x003: return model >= 68040; //MMU Translation Control Register (TC)
			case 0x004: return model >= 68040; //Instruction Transparent Translation Register 0 (ITT0)
			case 0x005: return model >= 68040; //Instruction Transparent Translation Register 1 (ITT1)
			case 0x006: return model >= 68040; //Data Transparent Translation Register 0 (DTT0)
			case 0x007: return model >= 68040; //Data Transparent Translation Register 1 (DTT1)
			case 0x805: return model >= 68040; //MMU Status Register (MMUSR)
			case 0x806: return model >= 68040; //User Root Pointer (URP)
			case 0x807: return model >= 68040; //Supervisor Root Pointer (SRP)
			//MC68EC040 only
			case 0x004: return model >= 68040; //Instruction Access Control Register 0 (IACR0)
			case 0x005: return model >= 68040; //Instruction Access Control Register 1 (IACR1)
			case 0x006: return model >= 68040; //Data Access Control Register 0 (DACR1)
			case 0x007: return model >= 68040; //Data Access Control Register 1 (DACR1)
			*/
		}
		return false;
	}

	function movec2C(cr, data) {
		switch (cr) {
			case 0: regs.sfc = data & 7; break;
			case 1: regs.dfc = data & 7; break;
			case 2: {
				switch (model) {
					case 68020: regs.cacr = data & CACR020_WMASK; break;
					case 68030: regs.cacr = data & CACR030_WMASK; break;
					//case 68040: regs.cacr = (data & 0x80008000) >>> 0; break;
					//case 68060: regs.cacr = (data & 0xf8e0e000) >>> 0; break;
					default: regs.cacr = 0;
				}
				coreSetCaches(false);
				break;
			}
			/*case 3: {
				regs.tcr = data & (model == 68060 ? 0xfffe : 0xc000);
				if (currprefs.mmu_model)
					mmu_set_tc(regs.tcr);
				break;
			}
			case 4: regs.itt0 = data & 0xffffe364; mmu_tt_modified(); break;
			case 5: regs.itt1 = data & 0xffffe364; mmu_tt_modified(); break;
			case 6: regs.dtt0 = data & 0xffffe364; mmu_tt_modified(); break;
			case 7: regs.dtt1 = data & 0xffffe364; mmu_tt_modified(); break;
			case 8: regs.buscr = data & 0xf0000000; break;*/

			case 0x800: regs.usp = data; break;
			case 0x801: regs.vbr = data; break;
			case 0x802: regs.caar = data; break;
			case 0x803: regs.msp = data; if ( regs.m) regs.a[7] = regs.msp; break;
			case 0x804: regs.isp = data; if (!regs.m) regs.a[7] = regs.isp; break;
			/*case 0x805: regs.mmusr = data; break;
			case 0x806: regs.urp = data & 0xfffffe00; break;
			case 0x807: regs.srp = data & 0xfffffe00; break;
			case 0x808: {
				var opcr = regs.pcr;
				regs.pcr &= ~(0x40 | 2 | 1);
				regs.pcr |= data & (0x40 | 2 | 1);
				if (currprefs.fpu_model <= 0)
					regs.pcr |= 2;
				if (((opcr ^ regs.pcr) & 2) == 2) {
					SAEF_log("68060 FPU state: %s", regs.pcr & 2 ? "disabled" : "enabled");
					//flush possible already translated FPU instructions
					flush_icache(0, 3);
				}
				break;
			}*/
			default: SAEF_fatal(SAEE_CPU_Internal, "cpu.movec2C() invalid register %d", cr);
		}
	}

	function movecC2(cr) {
		var data = null;
		switch (cr) {
			case 0: data = regs.sfc; break;
			case 1: data = regs.dfc; break;
			case 2: {
				switch (model) {
					case 68020: data = regs.cacr & CACR020_RMASK; break;
					case 68030: data = regs.cacr & CACR030_RMASK; break;
					//case 68040: data = (regs.cacr & 0x80008000) >>> 0; break;
					//case 68060: data = (regs.cacr & 0xf880e000) >>> 0; break;
					default: data = 0;
				}
				break;
			}
			//case 3: data = regs.tcr; break;
			//case 4: data = regs.itt0; break;
			//case 5: data = regs.itt1; break;
			//case 6: data = regs.dtt0; break;
			//case 7: data = regs.dtt1; break;
			//case 8: data = regs.buscr; break;

			case 0x800: data = regs.usp; break;
			case 0x801: data = regs.vbr; break;
			case 0x802: data = regs.caar; break;
			case 0x803: data = regs.m == 1 ? regs.a[7] : regs.msp; break;
			case 0x804: data = regs.m == 0 ? regs.a[7] : regs.isp; break;
			//case 0x805: data = regs.mmusr; break;
			//case 0x806: data = regs.urp; break;
			//case 0x807: data = regs.srp; break;
			//case 0x808: data = regs.pcr; break;
			default: SAEF_fatal(SAEE_CPU_Internal, "cpu.movecC2() invalid register %d", cr);
		}
		return data;
	}

	/*---------------------------------*/
	/* 68030 fake MMU */

	const MMUOP_DEBUG = false;

	function mmu_op30fake_pmove(pc, op, ext, addr) {
		var preg = (ext >> 10) & 31;
		var rw = (ext >> 9) & 1;
		var fd = (ext >> 8) & 1;
		var reg = null;
		var otc = fake_tc_030;
		var siz;

		switch (preg) {
			case 0x10:
				reg = "TC";
				siz = 4;
				if (rw)
					corePut32(addr, fake_tc_030);
				else
					fake_tc_030 = coreGet32(addr);
				break;
			case 0x12:
				reg = "SRP";
				siz = 8;
				if (rw) {
					//corePut32(addr, fake_srp_030 >> 32);
					//corePut32(addr + 4, (uae_u32)fake_srp_030);
					corePut32(addr, fake_srp_030_hi);
					corePut32(addr + 4, fake_srp_030_lo);
				} else {
					//fake_srp_030 = (uae_u64)coreGet32(addr) << 32;
					//fake_srp_030 |= coreGet32(addr + 4);
					fake_srp_030_hi = coreGet32(addr);
					fake_srp_030_lo = coreGet32(addr + 4);
				}
				break;
			case 0x13:
				reg = "CRP";
				siz = 8;
				if (rw) {
					//corePut32(addr, fake_crp_030 >> 32);
					//corePut32(addr + 4, (uae_u32)fake_crp_030);
					corePut32(addr, fake_crp_030_hi);
					corePut32(addr + 4, fake_crp_030_lo);
				} else {
					//fake_crp_030 = (uae_u64)coreGet32(addr) << 32;
					//fake_crp_030 |= coreGet32(addr + 4);
					fake_crp_030_hi = coreGet32(addr);
					fake_crp_030_lo = coreGet32(addr + 4);
				}
				break;
			case 0x18:
				reg = "MMUSR";
				siz = 2;
				if (rw)
					corePut16(addr, fake_mmusr_030);
				else
					fake_mmusr_030 = coreGet16(addr);
				break;
			case 0x02:
				reg = "TT0";
				siz = 4;
				if (rw)
					corePut32(addr, fake_tt0_030);
				else
					fake_tt0_030 = coreGet32(addr);
				break;
			case 0x03:
				reg = "TT1";
				siz = 4;
				if (rw)
					corePut32(addr, fake_tt1_030);
				else
					fake_tt1_030 = coreGet32(addr);
				break;
		}

		if (reg === null)
			return true;

		if (MMUOP_DEBUG) {
			if (siz == 8) {
				var val2 = coreGet32(addr);
				var val = coreGet32(addr + 4);
				if (rw)
					SAEF_log("I_MMU_PMOVE %s,%08X%08X PC=%08X", reg, val2, val, pc);
				else
					SAEF_log("I_MMU_PMOVE %08X%08X,%s PC=%08X", val2, val, reg, pc);
			} else {
				if (siz == 4)
					var val = coreGet32(addr);
				else
					var val = coreGet16(addr);
				if (rw)
					SAEF_log("I_MMU_PMOVE %s,%08X PC=%08X", reg, val, pc);
				else
					SAEF_log("I_MMU_PMOVE %08X,%s PC=%08X", val, reg, pc);
			}
		}

		if ((SAEV_config.chipset.mbdmac & 1) && SAEV_config.memory.ramsey.lowSize > 0) {
			if (otc != fake_tc_030)
				SAER.memory.a3000_fakekick((fake_tc_030 & 0x80000000) != 0);
		}
		return false;
	}

	function mmu_op30fake_ptest(pc, op, ext, addr) {
		if (MMUOP_DEBUG) {
			var tmp = "";
			if ((ext >> 8) & 1)
				tmp = sprintf(",A%d", (ext >> 4) & 15);
			SAEF_log("I_MMU_PTEST%c %02X,%08X,#%X%s PC=%08X", ((ext >> 9) & 1) ? 'W' : 'R', (ext & 15), addr, (ext >> 10) & 7, tmp, pc);
		}
		fake_mmusr_030 = 0;
		return false;
	}

	function mmu_op30fake_pflush(pc, op, ext, addr) {
		var flushmode = (ext >> 10) & 7;
		var fc = ext & 31;
		var mask = (ext >> 5) & 3;
		var fname = "";

		switch (flushmode) {
			case 6:
				fname = sprintf("FC=%x MASK=%x EA=%08x", fc, mask, 0);
				break;
			case 4:
				fname = sprintf("FC=%x MASK=%x", fc, mask);
				break;
			case 1:
				fname = "ALL";
				break;
			default:
				return true;
		}
		if (MMUOP_DEBUG) SAEF_log("I_MMU_PFLUSH %s PC=%08X", fname, pc);
		return false;
	}

	function mmu_op30(pc, opcode, ext, addr) {
		/*if (currprefs.mmu_model) {
			if (ext & 0x8000)
				return mmu_op30_ptest(pc, opcode, ext, addr);
			else if ((ext & 0xE000) == 0x2000 && (ext & 0x1C00))
				return mmu_op30_pflush(pc, opcode, ext, addr);
			else if ((ext & 0xE000) == 0x2000 && !(ext & 0x1C00))
				return mmu_op30_pload(pc, opcode, ext, addr);
			else
				return mmu_op30_pmove(pc, opcode, ext, addr);
		}*/
		var type = ext >> 13;
		switch (type) {
			case 0:
			case 2:
			case 3:
				return mmu_op30fake_pmove(pc, opcode, ext, addr);
			case 1:
				return mmu_op30fake_pflush(pc, opcode, ext, addr);
			case 4:
				return mmu_op30fake_ptest(pc, opcode, ext, addr);
			default:
				return true;
		}
	}

	/*-----------------------------------------------------------------------*/
	/* SECT dissassembling */
	/*-----------------------------------------------------------------------*/

	const D_RDD 			= 1;
	const D_RDA 			= 2;
	const D_RIPR 			= 3;
	const D_RIPO 			= 4;
	const D_RID 			= 5;
	const D_IMD 			= 6;
	const D_IME				= 7;
	const D_IME_DP			= 8;
	const D_EA  			= 10;
	const D_CCR 			= 11;
	const D_SR 				= 12;
	const D_USP 			= 13;
	const D_EXT_BITFIELD	= 20;
	const D_EXT_MOVEM		= 21;
	const D_EXT_MOVEC		= 22;
	const D_EXT_MUL64		= 23;
	const D_EXT_DIV64		= 24;
	const D_EXT_MMU		= 25;

	function regs_da_def() {
		this.memory = null;
		this.pc = 0;
		this.io = 0;
		this.fmt8 = "%x";
		this.fmt16 = "%x";
		this.fmt32 = "%x";
	}
	var regs_da = new regs_da_def();
	var inst_mn = null;

	function config_da_def() {
		this.code = "";
		this.offset = 0;
		this.limit = 32;

		this.radix = 16;
		this.prefx = "$";
		this.width = 0;
		this.reloc = true;
	}
	config_da = new config_da_def();

	function setPC_da(pc) {
		regs_da.pc = pc;
		regs_da.io = 0;
	}
	function getPC_da() {
		return regs_da.pc + regs_da.io;
	}
	function incPC_da(o) {
		regs_da.io += o;
	}
	function syncPC_da() {
		regs_da.pc += regs_da.io;
		regs_da.io = 0;
	}

	function get16_da(addr) {
		return (regs_da.memory[addr] << 8) | regs_da.memory[addr+1];
	}
	function get32_da(addr) {
		return ((regs_da.memory[addr] << 24) | (regs_da.memory[addr+1] << 16) | (regs_da.memory[addr+2] << 8) | regs_da.memory[addr+3]) >>> 0;
	}
	function next16_da() {
		var r = get16_da(regs_da.pc + regs_da.io);
		incPC_da(2);
		return r;
	}
	function next32_da() {
		var r = get32_da(regs_da.pc + regs_da.io);
		incPC_da(4);
		return r;
	}

	function szChr(z) {
		switch (z) {
			case 0: return "s";
			case 1: return "b";
			case 2: return "w";
			case 4: return "l";
			//default: SAEF_fatal(SAEE_CPU_Internal, "cpu.szChr() invalid size (%d)", z);
			default: return "?";
		}
	}

	function printMovec(ext, dir) {
		var o;
		var xn = (ext >> 12) & 7;
		var reg = movecRegName(ext & 0xfff);
		reg = reg.toLowerCase();
		if (dir) {
			if (ext & 0x8000)
				o = reg+",a"+xn;
			else
				o = reg+",d"+xn;
		} else {
			if (ext & 0x8000)
				o = "a"+xn+","+reg;
			else
				o = "d"+xn+","+reg;
		}
		return o;
	}
	function printMovem(ext, inv) {
		var d = [0,0,0,0,0,0,0,0];
		var a = [0,0,0,0,0,0,0,0];
		var i, o = "";
		for (i = 0; i < 16; i++) {
			if (ext & (1 << (inv ? 15-i : i))) {
				if (i < 8)
					d[i] = 1;
				else
					a[i - 8] = 1;
			}
		}
		var fi = d.indexOf(1);
		var li = d.lastIndexOf(1);
		if (fi != -1) {
			o += "d"+fi;
			if (li != fi)
				o += "-d"+li;
		}
		fi = a.indexOf(1);
		li = a.lastIndexOf(1);
		if (fi != -1) {
			if (o.length) o += "/";
			o += "a"+fi;
			if (li != fi)
				o += "-a"+li;
		}
		return o;
	}
	function printMul64(ext) {
		var Dl = (ext >> 12) & 7;
		var Dh = ext & 7;
		inst_mn = (ext & 0x800) ? "muls" : "mulu";

		return (ext & 0x400) ? "d"+Dh+"-d"+Dl : "d"+Dl;
	}
	function printDiv64(ext) {
		var Dq = (ext >> 12) & 7;
		var Dr = ext & 7;
		inst_mn = (ext & 0x800) ? "divs" : "divu";

		return (ext & 0x400) ? "d"+Dr+":d"+Dq : "d"+Dq;
	}
	function printMMU(ext) {
		return "FIXME"; //FIX not implemented
	}

	function printII(base, dp, ar) {
		var o = "";
		var reg = (dp >> 12) & 7;
		var cycles = 0;
		var v;
		var regd = (dp & 0x8000) ? regs.a[reg] : regs.d[reg];
		var scale = (dp >> 9) & 3;

		if ((dp & 0x800) == 0)
			regd = extWord(regd & 0xffff);

		if (scale) regd = ((regd << scale) & 0xffffffff) >>> 0;

		if (dp & 0x100) {
			var outer = 0;

			if (dp & 0x80) base = 0;
			if (dp & 0x40) regd = 0;

			if ((dp & 0x30) == 0x20) {
				base = add32(base, extWord(next16_da()));
				cycles++;
			}
			if ((dp & 0x30) == 0x30) {
				base = add32(base, next32_da());
				cycles++;
			}

			if ((dp & 0x3) == 0x2) {
				outer = extWord(next16_da());
				cycles++;
			}
			if ((dp & 0x3) == 0x3) {
				outer = next32_da();
				cycles++;
			}

			if ((dp & 0x4) == 0) {
				base = add32(base, regd);
				cycles++;
			}
			if (dp & 0x3) {
				base = get32_da(base);
				cycles++;
			}
			if (dp & 0x4) {
				base = add32(base, regd);
				cycles++;
			}
			v = add32(base, outer);
		} else
			v = add32(add32(base, extByte(dp & 0xff)), regd);

		/*if (ar != -1)
			o += sprintf("(%d,A%d,%s%d.%s*%d)[$%08x]", castByte(dp & 0xff), ar, (dp & 0x8000)?"A":"D",reg, (dp & 0x800)?"L":"W", 1 << scale, v);
		else
			o += sprintf("(%d,PC,%s%d.%s*%d)[$%08x]", castByte(dp & 0xff), (dp & 0x8000)?"A":"D",reg, (dp & 0x800)?"L":"W", 1 << scale, v);
		*/
		if (ar != -1)
			o += sprintf("(%d,a%d,%s%d.%s*%d)", castByte(dp & 0xff), ar, (dp & 0x8000)?"a":"d",reg, (dp & 0x800)?"l":"w", 1 << scale);
		else
			o += sprintf("(%d,pc,%s%d.%s*%d)", castByte(dp & 0xff), (dp & 0x8000)?"a":"d",reg, (dp & 0x800)?"l":"w", 1 << scale);

		return o;
	}

	function printEA(ea, z) {
		var m = ea >> 3;
		if (m == 7) {
			switch (ea & 7) {
				case 0: { //absw
					var dp = next16_da();
					return sprintf(config_da.radix == 10 ? "(%d)" : "("+regs_da.fmt16+")", dp);
				}
				case 1: { //absl
					var dp = next32_da();
					return sprintf(config_da.radix == 10 ? "(%d)" : "("+regs_da.fmt32+")", dp);
				}
				case 2: { //pcid
					var pc = getPC_da();
					var dp = extWord(next16_da());
					if (config_da.reloc)
						return sprintf(regs_da.fmt32, add32(pc, dp));
					else
						return sprintf(config_da.radix == 10 ? "%d(pc)" : regs_da.fmt32+"(pc)", castLong(dp));
				}
				case 3: { //pcii
					var pc = getPC_da();
					var dp = next16_da();
					return printII(pc, dp, -1);
				}
				case 4: { //imm
					var dp = 0;
					switch (z) {
						case 1:
							dp = next16_da() & 0xff;
							return sprintf(config_da.radix == 10 ? "#%d" : "#"+regs_da.fmt8, castByte(dp));
						case 2:
							dp = next16_da();
							return sprintf(config_da.radix == 10 ? "#%d" : "#"+regs_da.fmt16, castWord(dp));
						case 4:
							dp = next32_da();
							return sprintf(config_da.radix == 10 ? "#%d" : "#"+regs_da.fmt32, castLong(dp));
					}
				}
			}
		} else {
			var r = ea & 7;
			switch (m) {
				case 0: return sprintf("d%d", r); //rdd
				case 1: return sprintf("a%d", r); //rda
				case 2: return sprintf("(a%d)", r); //ria
				case 3: return sprintf("(a%d)+", r); //ripo
				case 4: return sprintf("-(a%d)", r); //ripr
				case 5: { //rid
					var dp = extWord(next16_da());
					//return sprintf(config_da.radix == 10 ? "%d(A%d)[$%08x]" : "$%08x(A%d)[$%08x]", castLong(dp), r, add32(regs.a[r], dp));
					return sprintf(config_da.radix == 10 ? "%d(a%d)" : regs_da.fmt32+"(a%d)", dp, r);
				}
				case 6: { //rii
					var dp = next16_da();
					return printII(regs.a[r], dp, r);
				}
			}
		}
		return "???";
	}

	function printI2(ext, mode, value, z) {
		switch (mode) {
			case D_RDD: return sprintf("d%d", value);
			case D_RDA: return sprintf("a%d", value);
			case D_RIPR: return sprintf("-(a%d)", value);
			case D_RIPO: return sprintf("(a%d)+", value);
			case D_RID: {
				var dp = castLong(extWord(next16_da()));
				//return sprintf("%d(A%d)[$%08x]", dp, value, regs.a[value] + dp);
				return sprintf("%d(A%d)", dp, value);
			}
			case D_IMD: return sprintf(config_da.radix == 10 ? "#%d" : "#"+regs_da.fmt8, value);
			case D_IME: {
				var imm = value == 1 ? next16_da() : next32_da();
				return sprintf(config_da.radix == 10 ? "#%d" : (value == 1 ? "#"+regs_da.fmt16 : "#"+regs_da.fmt32), imm);
			}
			case D_IME_DP: {
				var pc = getPC_da();
				if (value == 0) dp = castLong(extWord(next16_da()));
				else if (value == 255) dp = castLong(next32_da());
				else dp = castLong(extByte(value));
				if (config_da.reloc)
					return sprintf("<"+regs_da.fmt32+">", pc + dp);
				else
					return sprintf("<%d>", dp);
			}
			case D_EA: return printEA(value, z);
			case D_CCR: return "ccr";
			case D_SR: return "sr";
			case D_USP: return "usp";
			case D_EXT_BITFIELD: {
				var offset = (ext & 0x800) ?  regs.d[(ext >> 6) & 7] : (ext >> 6) & 0x1f;
				var width = (ext & 0x20) ? regs.d[ext & 7] & 0x1f : ext & 0x1f; if (width == 0) width = 32;
				return sprintf("{%d:%d}", offset, width);
			}
			case D_EXT_MOVEM: return printMovem(ext, value);
			case D_EXT_MOVEC: return printMovec(ext, value);
			case D_EXT_MUL64: return printMul64(ext);
			case D_EXT_DIV64: return printDiv64(ext);
			case D_EXT_MMU: return printMMU(ext);
		}
	}

	function printI(i) {
		var mn = i.mn;

		mn = mn.toLowerCase();
		if (mn == "illegal")
			return mn;

		inst_mn = null;

		var o = "";
		if (i.d) {
			var ext = i.d.ext == 0 ? false : (i.d.ext == 1 ? next16_da() : next32_da());

			if (i.d.z)
				o += "." + szChr(i.d.z);
			else if (1 && i.d.z2)
				o += "." + szChr(i.d.z2);


			if (i.d.sm && i.d.dm) {
				o += " ";
				o += printI2(ext, i.d.sm, i.d.s, i.d.z);
				o += ",";
				o += printI2(ext, i.d.dm, i.d.d, i.d.z);
			}
			else if (i.d.dm) {
				o += " ";
				o += printI2(ext, i.d.dm, i.d.d, i.d.z);
			}
		}
		if (inst_mn !== null)
			return inst_mn + o;
		else
			return mn + o;
	}

	this.getConfig_da = function() {
		return config_da;
	}
	this.setup_da = function(m) {
		model = m;
		if (!mkITab())
			return SAEE_CPU_Internal;

		mkCCTab();
		mkEATabs();
		return SAEE_None;
	}

	function fixup_da() {
		if (config_da.code.length > 0) {
			regs_da.memory = new Uint8Array(config_da.code.length);
			regs_da.memory.set(SAEF_String2Array(config_da.code, 0, config_da.code.length));
			config_da.code = "";
		}
		if (regs_da.memory === null)
			throw 1;

		if (getPC_da() >= regs_da.memory.length)
			regs_da.pc = regs_da.io = 0x0;

		if (config_da.limit <= 0)
			config_da.limit = 8;

		regs_da.fmt8 = regs_da.fmt16 = regs_da.fmt32 = config_da.prefx;
		if (config_da.width == 0) {
			regs_da.fmt8 += "%x";
			regs_da.fmt16 += "%x";
			regs_da.fmt32 += "%x";
		} else {
			regs_da.fmt8 += "%02x";
			regs_da.fmt16 += "%04x";
			regs_da.fmt32 += config_da.width == 24 ? "%06x" : "%08x";
		}

	}

	this.disassemble = function() {
		fixup_da();

		setPC_da(config_da.offset);

		var op, addr, code, words, inst;

		var out = [];
		var cnt = 0;
		while (cnt++ < config_da.limit) {
			addr = regs_da.pc;
			code = []; for (var i = 0; i < 5; i++) code.push(get16_da(addr + i * 2));

			op = next16_da();
			inst = printI(iTab[op]);
			words = regs_da.io >> 1;

			out.push([addr, code, words, inst]);

			syncPC_da();
		}
		return out;
	}

	this.diss = function(addr, limit) {
		if (typeof addr == "undefined") addr = coreGetPC();
		if (typeof limit == "undefined" || limit == 0) limit = 8;

		var bank = SAER_Memory_getBank(addr);
		regs_da.memory = bank.baseaddr;
		setPC_da(addr - bank.start);

		var cnt = 0;
		while (cnt++ < limit) {
			var o = "";

			if (1) {
				o += sprintf("$%08x: ", regs_da.pc + bank.start);
				for (var i = 0; i < 5; i++)
					o += sprintf("$%04x ", get16_da(regs_da.pc + i * 2));
			}
			var op = next16_da();
			o += printI(iTab[op]);
			o += sprintf(" (%d)", regs_da.io >> 1);
			SAEF_log(o);

			syncPC_da();
		}
	};

	/*-----------------------------------------------------------------------*/
	/* SECT instruction core. Implementation based on M68000PRM.pdf          */
	/*-----------------------------------------------------------------------*/

	function stackPut16(v) {
		regs.a[7] -= 2; /* pre-decrement */
		corePut16(regs.a[7], v);
	}
	function stackPut32(v) {
		regs.a[7] -= 4; /* pre-decrement */
		corePut32(regs.a[7], v);
	}
	function stackGet16() {
		var v = coreGet16(regs.a[7]);
		regs.a[7] += 2; /* post-increment */
		return v;
	}
	function stackGet32() {
		var v = coreGet32(regs.a[7]);
		regs.a[7] += 4; /* post-increment */
		return v;
	}

	/*-----------------------------------------------------------------------*/

	const aIncDec = [
		[],
		[1,1,1,1,1,1,1,2],
		[2,2,2,2,2,2,2,2],
		[],
		[4,4,4,4,4,4,4,4]
	];

	function castByte(v) {
		return (v & 0x80) ? (v - 0x100) : v;
	}
	function castWord(v) {
		return (v & 0x8000) ? (v - 0x10000) : v;
	}
	function castLong(v) {
		return (v & 0x80000000) ? (v - 0x100000000) : v;
	}

	function extByteToWord(v) {
		return (v & 0x80) ? (0xff00 | v) : v;
	}
	function extByte(v) {
		return (v & 0x80) ? ((0xffffff00 | v) >>> 0) : v;
	}
	function extWord(v) {
		return (v & 0x8000) ? ((0xffff0000 | v) >>> 0) : v;
	}

	function add32(a, b) {
		var r = a + b;
		return r > 0xffffffff ? r - 0x100000000 : r;
	}

	function sub32(a, b) {
		var r = a - b;
		return r < 0 ? r + 0x100000000 : r;
	}

	/*-----------------------------------------------------------------------*/
	/* Condition codes */

	function flgAdd(S, D, R, m, isADDX) { /* ADD, ADDI, ADDQ, ADDX */
		var Sn = (S & m) != 0;
		var Dn = (D & m) != 0;
		var Rn = (R & m) != 0;
		regs.v = (Sn && Dn && !Rn) || (!Sn && !Dn && Rn);
		regs.c = (Sn && Dn) || (!Rn && Dn) || (Sn && !Rn);
		regs.x = regs.c;
		regs.n = Rn;
		if (isADDX) {
			if (R != 0)
				regs.z = false;
		} else
			regs.z = R == 0;
	}

	function flgSub(S, D, R, m, isSUBX) { /* SUB, SUBI, SUBQ, SUBX */
		var Sn = (S & m) != 0;
		var Dn = (D & m) != 0;
		var Rn = (R & m) != 0;
		regs.v = (!Sn && Dn && !Rn) || (Sn && !Dn && Rn);
		regs.c = (Sn && !Dn) || (Rn && !Dn) || (Sn && Rn);
		regs.x = regs.c;
		regs.n = Rn;
		if (isSUBX) {
			if (R != 0)
				regs.z = false;
		} else
			regs.z = R == 0;
	}

	function flgCmp(S, D, R, m) { /* CAS, CAS2, CMP, CMPA, CMPI, CMPM */
		var Sn = (S & m) != 0;
		var Dn = (D & m) != 0;
		var Rn = (R & m) != 0;
		regs.v = (!Sn && Dn && !Rn) || (Sn && !Dn && Rn);
		regs.c = (Sn && !Dn) || (Rn && !Dn) || (Sn && Rn);
		regs.n = Rn;
		regs.z = R == 0;
	}

	function flgNeg(D, R, m, isNEGX) { /* NEG, NEGX */
		var Dn = (D & m) != 0;
		var Rn = (R & m) != 0;
		regs.v = Dn && Rn;
		regs.c = Dn || Rn;
		regs.x = regs.c;
		regs.n = Rn;
		if (isNEGX) {
			if (R != 0)
				regs.z = false;
		} else
			regs.z = R == 0;
	}

	function flgLogical(R, m) { /* AND ANDI OR ORI EOR EORI MOVE MOVEQ EXT NOT TST */
		regs.n = (R & m) != 0;
		regs.z = R == 0;
		regs.v = regs.c = false;
	}

	/*-----------------------------------------------------------------------*/
	/* Instructions ---------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/* Data Movement */

	function I_EXG_DD(p) {
		var t = regs.d[p.Rx];
		regs.d[p.Rx] = regs.d[p.Ry];
		regs.d[p.Ry] = t;
		//ccna
		coreSyncPC();
		return p.cyc;
	}
	function I_EXG_AA(p) {
		var t = regs.a[p.Rx];
		regs.a[p.Rx] = regs.a[p.Ry];
		regs.a[p.Ry] = t;
		//ccna
		coreSyncPC();
		return p.cyc;
	}
	function I_EXG_DA(p) {
		var t = regs.d[p.Rx];
		regs.d[p.Rx] = regs.a[p.Ry];
		regs.a[p.Ry] = t;
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	function I_LEA(p) {
		regs.a[p.An] = exEAtab[p.ea](4);
		//SAEF_log("I_LEA.L $%08x %d/%d", regs.a[p.An], p.ea>>3,p.ea&7);
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	function I_PEA(p) {
		var a = exEAtab[p.ea](4);
		stackPut32(a);
		//SAEF_log(("I_PEA.L $%08x", a));
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	function I_LINK(p) {
		var dp = extWord(coreNext16());
		stackPut32(regs.a[p.An]);
		regs.a[p.An] = regs.a[7];
		regs.a[7] = add32(regs.a[7], dp);
		//SAEF_log(("I_LINK.W A%d, dp $%04x", p.An, dp));
		//ccna
		coreSyncPC();
		return p.cyc;
	}
	function I_LINK_32(p) { /* >= 68020 */
		var dp = coreNext32();
		stackPut32(regs.a[p.An]);
		regs.a[p.An] = regs.a[7];
		regs.a[7] = add32(regs.a[7], dp);
		//SAEF_log(("I_LINK.L A%d, dp $%04x", p.An, dp));
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	function I_UNLK(p) {
		regs.a[7] = regs.a[p.An];
		regs.a[p.An] = stackGet32();
		//SAEF_log(("I_UNLK A%d", p.An));
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	function I_MOVE_8(p) {
		var s = ldEA8tab[p.sea]();
		stEA8tab[p.dea](s);
		flgLogical(s, p.zm);
		//SAEF_log(("I_MOVE.B $%08x", s));
		coreSyncPC();
		return p.cyc;
	}
	function I_MOVE_16(p) {
		var s = ldEA16tab[p.sea]();
		stEA16tab[p.dea](s);
		flgLogical(s, p.zm);
		//SAEF_log(("I_MOVE.W $%08x", s));
		coreSyncPC();
		return p.cyc;
	}
	function I_MOVE_32(p) {
		var s = ldEA32tab[p.sea]();
		stEA32tab[p.dea](s);
		flgLogical(s, p.zm);
		//SAEF_log(("I_MOVE.L $%08x", s));
		coreSyncPC();
		return p.cyc;
	}

	function I_MOVEA_16(p) {
		var s = ldEA16tab[p.ea]();
		regs.a[p.An] = extWord(s);
		//SAEF_log(("I_MOVEA.W $%08x A%d", extWord(s), p.An));
		//ccna
		coreSyncPC();
		return p.cyc;
	}
	function I_MOVEA_32(p) {
		var s = ldEA32tab[p.ea]();
		regs.a[p.An] = s;
		//SAEF_log(("I_MOVEA.L $%08x A%d", s, p.An));
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	function I_MOVEQ(p) {
		var s = extByte(p.data);
		regs.d[p.Dn] = s;
		flgLogical(s, p.zm);
		//SAEF_log(("I_MOVEQ.L $%08x,D%d", s, p.Dn));
		coreSyncPC();
		return p.cyc;
	}

	function I_MOVEM_R2M_16(p) {
		var list = coreNext16();
		var ripr = p.ea >> 3 == 4;
		var Xn, An = p.ea & 7;
		var a = exEAtab[ripr ? (2<<3|An) : p.ea](2);
		var pre, inv = ripr ? 15 : 0;
		var n = 0;

		if (ripr) { /* pre-decrement */
			pre = 0;
			for (Xn = 0; Xn < 16; Xn++) {
				if (list & (1 << Xn)) pre += 2;
			}
			a -= pre;
			/* p. 4-128: The MC68000 and MC68010 write the initial register value (not decremented). */
			if (model >= 68020) regs.a[An] -= pre;
		}
		for (Xn = 0; Xn < 16; Xn++) {
			if (list & (1 << (Xn ^ inv))) {
				if (Xn < 8)
					corePut16(a, regs.d[Xn] & 0xffff);
				else
					corePut16(a, regs.a[Xn & 7] & 0xffff);

				a += 2;
				n++;
			}
		}
		if (ripr && model < 68020) regs.a[An] -= pre;
		//ccna
		coreSyncPC();
		return [p.cyc[0]+4*n,p.cyc[1],n];
	}
	function I_MOVEM_R2M_32(p) {
		var list = coreNext16();
		var ripr = p.ea >> 3 == 4;
		var Xn, An = p.ea & 7;
		var a = exEAtab[ripr ? (2<<3|An) : p.ea](4);
		var pre, inv = ripr ? 15 : 0;
		var n = 0;

		if (ripr) { /* pre-decrement */
			pre = 0;
			for (Xn = 0; Xn < 16; Xn++) {
				if (list & (1 << Xn)) pre += 4;
			}
			a -= pre;
			/* p. 4-128: The MC68000 and MC68010 write the initial register value (not decremented). */
			if (model >= 68020) regs.a[An] -= pre;
		}
		for (Xn = 0; Xn < 16; Xn++) {
			if (list & (1 << (Xn ^ inv))) {
				if (Xn < 8)
					corePut32(a, regs.d[Xn]);
				else
					corePut32(a, regs.a[Xn & 7]);

				a += 4;
				n++;
			}
		}
		if (ripr && model < 68020) regs.a[An] -= pre;
		//ccna
		coreSyncPC();
		return [p.cyc[0]+8*n,p.cyc[1],2*n];
	}

	function I_MOVEM_M2R_16(p) {
		var list = coreNext16();
		var ripo = p.ea >> 3 == 3;
		var An = p.ea & 7;
		var a = exEAtab[ripo ? (2<<3|An) : p.ea](2);
		var n = 0;

		for (var Xn = 0; Xn < 16; Xn++) {
			if (list & (1 << Xn)) {
				if (Xn < 8)
					regs.d[Xn] = extWord(coreGet16(a));
				else
					regs.a[Xn & 7] = extWord(coreGet16(a));

				a += 2;
				n++;
			}
		}
		if (ripo) regs.a[An] = a; /* post-increment */
		//ccna
		coreSyncPC();
		return [p.cyc[0]+4*n,p.cyc[1]+n,0];
	}
	function I_MOVEM_M2R_32(p) {
		var list = coreNext16();
		var ripo = p.ea >> 3 == 3;
		var An = p.ea & 7;
		var a = exEAtab[ripo ? (2<<3|An) : p.ea](4);
		var n = 0;

		for (var Xn = 0; Xn < 16; Xn++) {
			if (list & (1 << Xn)) {
				if (Xn < 8)
					regs.d[Xn] = coreGet32(a);
				else
					regs.a[Xn & 7] = coreGet32(a);

				a += 4;
				n++;
			}
		}
		if (ripo) regs.a[An] = a; /* post-increment */
		//ccna
		coreSyncPC();
		return [p.cyc[0]+8*n,p.cyc[1]+2*n,0];
	}

	function I_MOVEP_R2M_16(p) {
		var dp = coreNext16();
		var s = regs.d[p.Dn] & 0xffff;
		var a = add32(regs.a[p.An], extWord(dp));
		//SAEF_log("I_MOVEP_R2M_16 D%d A%d addr $%08x <- $%04x", p.Dn, p.An, a, s);
		corePut8(a, s >> 8);
		corePut8(a+2, s & 0xff);
		//ccna
		coreSyncPC();
		return p.cyc;
	}
	function I_MOVEP_R2M_32(p) {
		var dp = coreNext16();
		var s = regs.d[p.Dn];
		var a = add32(regs.a[p.An], extWord(dp));
		//SAEF_log("I_MOVEP_R2M_32 D%d A%d addr $%08x <- $%08x", p.Dn, p.An, a, s);
		corePut8(a, s >>> 24);
		corePut8(a+2, (s >>> 16) & 0xff);
		corePut8(a+4, (s >>> 8) & 0xff);
		corePut8(a+6, s & 0xff);
		//ccna
		coreSyncPC();
		return p.cyc;
	}
	function I_MOVEP_M2R_16(p) {
		var dp = coreNext16();
		var a = add32(regs.a[p.An], extWord(dp));
		var d = (coreGet8(a) << 8) | corePut8(a+2);
		//SAEF_log("I_MOVEP_M2R_16 A%d D%d addr $%08x -> $%04x", p.An, p.Dn, a, d);
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | d;
		//ccna
		coreSyncPC();
		return p.cyc;
	}
	function I_MOVEP_M2R_32(p) {
		var dp = coreNext16();
		var a = add32(regs.a[p.An], extWord(dp));
		var d = ((coreGet8(a) << 24) | (coreGet8(a+2) << 16) | (coreGet8(a+4) << 8) | corePut8(a+6)) >>> 0;
		//SAEF_log("I_MOVEP_M2R_32 A%d D%d addr $%08x -> $%08x", p.An, p.Dn, a, d);
		regs.d[p.Dn] = d;
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Integer Arithmetic - Basic */

	function I_ADD_ED_32(p) {
		var s = ldEA32tab[p.ea]();
		var d = regs.d[p.Dn];
		var r = s + d; if (r > 0xffffffff) r -= 0x100000000;
		regs.d[p.Dn] = r;
		flgAdd(s, d, r, 0x80000000, false);
		//SAEF_log(("I_ADD_ED.L %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADD_DE_32(p) {
		var a = exEAtab[p.ea](4);
		var s = regs.d[p.Dn];
		var d = coreGet32(a);
		var r = s + d; if (r > 0xffffffff) r -= 0x100000000;
		corePut32(a, r);
		flgAdd(s, d, r, 0x80000000, false);
		//SAEF_log(("I_ADD_DE.L %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADD_ED_16(p) {
		var s = ldEA16tab[p.ea]();
		var d = regs.d[p.Dn] & 0xffff;
		var r = s + d; if (r > 0xffff) r -= 0x10000;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		flgAdd(s, d, r, 0x8000, false);
		//SAEF_log(("I_ADD_ED.W %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADD_DE_16(p) {
		var a = exEAtab[p.ea](2);
		var s = regs.d[p.Dn] & 0xffff;
		var d = coreGet16(a);
		var r = s + d; if (r > 0xffff) r -= 0x10000;
		corePut16(a, r);
		flgAdd(s, d, r, 0x8000, false);
		//SAEF_log(("I_ADD_DE.W %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADD_ED_8(p) {
		var s = ldEA8tab[p.ea]();
		var d = regs.d[p.Dn] & 0xff;
		var r = s + d; if (r > 0xff) r -= 0x100;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffffff00) | r;
		flgAdd(s, d, r, 0x80, false);
		//SAEF_log(("I_ADD_ED.B %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADD_DE_8(p) {
		var a = exEAtab[p.ea](1);
		var s = regs.d[p.Dn] & 0xff;
		var d = coreGet8(a);
		var r = s + d; if (r > 0xff) r -= 0x100;
		corePut8(a, r);
		flgAdd(s, d, r, 0x80, false);
		//SAEF_log(("I_ADD_DE.B %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_SUB_ED_32(p) {
		var s = ldEA32tab[p.ea]();
		var d = regs.d[p.Dn];
		var r = d - s; if (r < 0) r += 0x100000000;
		regs.d[p.Dn] = r;
		flgSub(s, d, r, 0x80000000, false);
		//SAEF_log(("I_SUB_ED.L %08x - %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUB_DE_32(p) {
		var a = exEAtab[p.ea](4);
		var s = regs.d[p.Dn];
		var d = coreGet32(a);
		var r = d - s; if (r < 0) r += 0x100000000;
		corePut32(a, r);
		flgSub(s, d, r, 0x80000000, false);
		//SAEF_log(("I_SUB_DE.L %08x - %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUB_ED_16(p) {
		var s = ldEA16tab[p.ea]();
		var d = regs.d[p.Dn] & 0xffff;
		var r = d - s; if (r < 0) r += 0x10000;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		flgSub(s, d, r, 0x8000, false);
		//SAEF_log(("I_SUB_ED.W %08x - %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUB_DE_16(p) {
		var a = exEAtab[p.ea](2);
		var s = regs.d[p.Dn] & 0xffff;
		var d = coreGet16(a);
		var r = d - s; if (r < 0) r += 0x10000;
		corePut16(a, r);
		flgSub(s, d, r, 0x8000, false);
		//SAEF_log(("I_SUB_DE.W %08x - %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUB_ED_8(p) {
		var s = ldEA8tab[p.ea]();
		var d = regs.d[p.Dn] & 0xff;
		var r = d - s; if (r < 0) r += 0x100;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffffff00) | r;
		flgSub(s, d, r, 0x80, false);
		//SAEF_log(("I_SUB_ED.B %08x - %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUB_DE_8(p) {
		var a = exEAtab[p.ea](1);
		var s = regs.d[p.Dn] & 0xff;
		var d = coreGet8(a);
		var r = d - s; if (r < 0) r += 0x100;
		corePut8(a, r);
		flgSub(s, d, r, 0x80, false);
		//SAEF_log(("I_SUB_DE.B %08x - %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_CMP_32(p) {
		var s = ldEA32tab[p.ea]();
		var d = regs.d[p.Dn];
		var r = d - s; if (r < 0) r += 0x100000000;
		flgCmp(s, d, r, 0x80000000);
		//SAEF_log(("I_CMP.L %08x - %08x", d, s));
		coreSyncPC();
		return p.cyc;
	}
	function I_CMP_16(p) {
		var s = ldEA16tab[p.ea]();
		var d = regs.d[p.Dn] & 0xffff;
		var r = d - s; if (r < 0) r += 0x10000;
		flgCmp(s, d, r, 0x8000);
		//SAEF_log(("I_CMP.W %08x - %08x", d, s));
		coreSyncPC();
		return p.cyc;
	}
	function I_CMP_8(p) {
		var s = ldEA8tab[p.ea]();
		var d = regs.d[p.Dn] & 0xff;
		var r = d - s; if (r < 0) r += 0x100;
		flgCmp(s, d, r, 0x80);
		//SAEF_log(("I_CMP.B %08x - %08x", d, s));
		coreSyncPC();
		return p.cyc;
	}

	function I_CLR_32(p) {
		stEA32tab[p.ea](0);
		regs.z = true; regs.n = regs.v = regs.c = false;
		coreSyncPC();
		return p.cyc;
	}
	function I_CLR_16(p) {
		stEA16tab[p.ea](0);
		regs.z = true; regs.n = regs.v = regs.c = false;
		coreSyncPC();
		return p.cyc;
	}
	function I_CLR_8(p) {
		stEA8tab[p.ea](0);
		regs.z = true; regs.n = regs.v = regs.c = false;
		coreSyncPC();
		return p.cyc;
	}

	function I_NEG_D_32(p) {
		var d = regs.d[p.Dn];
		var r = 0 - d; if (r < 0) r += 0x100000000;
		regs.d[p.Dn] = r;
		flgNeg(d, r, 0x80000000, false);
		//SAEF_log(("I_NEG_D.L -%08x = %08x", d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_NEG_D_16(p) {
		var d = regs.d[p.Dn] & 0xffff;
		var r = 0 - d; if (r < 0) r += 0x10000;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		flgNeg(d, r, 0x8000, false);
		//SAEF_log(("I_NEG_D.W -%08x = %08x", d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_NEG_D_8(p) {
		var d = regs.d[p.Dn] & 0xff;
		var r = 0 - d; if (r < 0) r += 0x100;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffffff00) | r;
		flgNeg(d, r, 0x80, false);
		//SAEF_log(("I_NEG_D.B -%08x = %08x", d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_NEG_E_32(p) {
		var a = exEAtab[p.ea](4);
		var d = coreGet32(a);
		var r = 0 - d; if (r < 0) r += 0x100000000;
		corePut32(a, r);
		flgNeg(d, r, 0x80000000, false);
		//SAEF_log(("I_NEG_E.L -%08x = %08x", d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_NEG_E_16(p) {
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a);
		var r = 0 - d; if (r < 0) r += 0x10000;
		corePut16(a, r);
		flgNeg(d, r, 0x8000, false);
		//SAEF_log(("I_NEG_E.W -%08x = %08x", d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_NEG_E_8(p) {
		var a = exEAtab[p.ea](1);
		var d = coreGet8(a);
		var r = 0 - d; if (r < 0) r += 0x100;
		corePut8(a, r);
		flgNeg(d, r, 0x80, false);
		//SAEF_log(("I_NEG_E.B -%08x = %08x", d, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_MULS(p) {
		var s = ldEA16tab[p.ea]();
		var d = regs.d[p.Dn] & 0xffff;
		var sign = s ^ d;
		if (s & 0x8000) s = -s + 0x10000;
		if (d & 0x8000) d = -d + 0x10000;
		var r = s * d; if (r && (sign & 0x8000)) r = -r + 0x100000000;
		regs.d[p.Dn] = r;
		regs.n = (r & 0x80000000) != 0;
		regs.z = r == 0;
		regs.v = false;
		regs.c = false;
		//if (regs.n) SAEF_log(("I_MULS.W %08x * %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_MULU(p) {
		var s = ldEA16tab[p.ea]();
		var d = regs.d[p.Dn] & 0xffff;
		var r = s * d;
		regs.d[p.Dn] = r;
		regs.n = (r & 0x80000000) != 0;
		regs.z = r == 0;
		regs.v = false;
		regs.c = false;
		//SAEF_log(("I_MULU.W %08x * %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_MULx(p) { /* >= 68020 */
		var ext = coreNext16();
		var multiplier = ldEA32tab[p.ea]();
		var Dl = (ext >> 12) & 7;
		var multiplicand = regs.d[Dl];
		var productLo, productHi;
		var _a = multiplier, _b = multiplicand; //debug

		if (ext & 0x800) {
			var sign = ((multiplier ^ multiplicand) & 0x80000000) != 0;
			if (multiplier & 0x80000000) multiplier = -multiplier + 0x100000000;
			if (multiplicand & 0x80000000) multiplicand = -multiplicand + 0x100000000;
			if (multiplier < 0x8000 && multiplicand < 0x8000) {
				productLo = multiplier * multiplicand;
				productHi = 0;
				if (productLo && sign) {
					productLo = -productLo + 0x100000000;
					productHi = 0xffffffff;
				}
				regs.v = false;
				//SAEF_log("I_MULS.L $%04x, %d * %d = [%08x:%08x] | PC %08x", ext, castLong(_a),castLong(_b), productHi,productLo, getPC());
			} else {
				var result = mul64(multiplier, multiplicand);
				productLo = result[0];
				productHi = result[1];
				if (sign) {
					productHi = ~productHi >>> 0;
					if (productLo) productLo = -productLo + 0x100000000;
					if (productLo == 0) { productHi++; if (productHi > 0xffffffff) productHi -= 0x100000000; }
				}
				regs.v = (ext & 0x400) == 0 && (productHi != 0 || (productLo & 0x80000000) != 0) && ((productHi & 0xffffffff) != 0xffffffff || (productLo & 0x80000000) != 0x80000000);
				//SAEF_log("I_MULS64.L $%04x, %d * %d = [%08x:%08x] | v %d, PC %08x", ext, castLong(_a),castLong(_b), productHi,productLo, regs.v?1:0, getPC());
			}
		} else {
			if (multiplier < 0x10000 && multiplicand < 0x10000) {
				productLo = multiplier * multiplicand;
				productHi = 0;
				regs.v = false;
				//SAEF_log("I_MULU.L $%04x, %d * %d = [%08x:%08x] | PC %08x", ext, _a,_b, productHi,productLo, getPC());
			} else {
				var result = mul64(multiplier, multiplicand);
				productLo = result[0];
				productHi = result[1];
				//SAEF_log("I_MULU64.L $%04x, %d * %d = [%08x:%08x] | PC %08x", ext, _a,_b, productHi,productLo, getPC());
			}
			regs.v = (ext & 0x400) == 0 && productHi != 0;
		}
		regs.d[Dl] = productLo;
		if (ext & 0x400) regs.d[ext & 7] = productHi;
		regs.n = (productHi & 0x80000000) != 0;
		regs.z = productHi == 0 && productLo == 0;
		regs.c = false;

		coreSyncPC();
		return p.cyc;
	}

	function I_DIVS(p) {
		var s = ldEA16tab[p.ea]();

		regs.c = false;
		if (s == 0) {
			//SAEF_log(("I_DIVS.W %08x / 0 (coreException 5)", regs.d[p.Dn]));
			//coreSyncPC();
			return coreException(5);
		} else {
			var d = regs.d[p.Dn], ds = d;
			var sign = ((d & 0x80000000) ? 1 : 0) ^ ((s & 0x8000) ? 1 : 0);
			if (s & 0x8000) s = -s + 0x10000;
			if (d & 0x80000000) d = -d + 0x100000000;
			var quo = (d / s) >>> 0;
			if (sign ? quo > 0x8000 : quo > 0x7fff) {
				regs.v = true;
				//SAEF_log(("I_DIVS.W %d / %d = %d OVERFLOW", d,s, quo));
			} else {
				var rem = d % s;
				if (quo && sign) quo = -quo + 0x10000;
				if (rem && (rem >> 15) != (ds >>> 31)) rem = -rem + 0x10000;
				regs.d[p.Dn] = (rem << 16) | quo;
				regs.v = false;
				regs.z = quo == 0;
				regs.n = (quo & 0x8000) != 0;
				//SAEF_log(("I_DIVS.W %d / %d = %d[%04x:%04x] sign %x", d,s,regs.d[p.Dn], rem,quo, sign));
			}
			coreSyncPC();
			return p.cyc;
		}
	}

	function I_DIVU(p) {
		var s = ldEA16tab[p.ea]();

		regs.c = false;
		if (s == 0) {
			//SAEF_log(("I_DIVU.%s %08x / 0 (coreException 5)", regs.d[p.Dn]));
			//coreSyncPC();
			return coreException(5);
		} else {
			var d = regs.d[p.Dn];
			var quo = (d / s) >>> 0;
			if (quo > 0xffff) {
				regs.v = true;
				//SAEF_log(("I_DIVU.W %d / %d = %d OVERFLOW", d,s, quo));
			} else {
				var rem = d % s;
				regs.d[p.Dn] = (rem << 16) | quo;
				regs.v = false;
				regs.z = quo == 0;
				regs.n = (quo & 0x8000) != 0;
				//SAEF_log(("I_DIVU.W %d / %d = %d[%d:%d]", d,s,regs.d[p.Dn], rem,quo));
			}
			coreSyncPC();
			return p.cyc;
		}
	}

	function I_DIVx(p) {  /* >= 68020 */
		var ext = coreNext16();
		var divisor = ldEA32tab[p.ea]();
		var Dq = (ext >> 12) & 7;
		var Dr = ext & 7;
		var quo, rem;
		//var quotient, remainder;

		regs.c = false;
		if (divisor == 0) {
			//SAEF_log(("I_DIV%s.L %08x / 0 (coreException 5)", (ext&0x800)?"S":"U", divisor));
			//coreSyncPC();
			return coreException(5);
		}

		if (ext & 0x800) {
			if (ext & 0x400) {
				var dividendLo = regs.d[Dq];
				var dividendHi = regs.d[Dr], orgDividendHi = dividendHi;
				var sign = ((dividendHi ^ divisor) & 0x80000000) != 0;

				if (dividendHi & 0x80000000) {
					dividendHi = ~dividendHi >>> 0;
					if (dividendLo) dividendLo = -dividendLo + 0x100000000;
					if (dividendLo == 0) { dividendHi++; if (dividendHi > 0xffffffff) dividendHi -= 0x100000000; }
				}
				if (divisor & 0x80000000) divisor = -divisor + 0x100000000;

				var result = divu64(dividendHi, dividendLo, divisor);
				quo = result[1];
				rem = result[2];
				if (result[0] || sign ? quo > 0x80000000 : quo > 0x7fffffff) {
					regs.v = true;
					//SAEF_log("I_DIVS64.L %d:%d / %d OVERFLOW", dividendHi,dividendLo,divisor);
					coreSyncPC();
					return p.cyc;
				}
				if (quo && sign) quo = -quo + 0x100000000;
				if (rem && (rem & 0x80000000) != (orgDividendHi & 0x80000000)) rem = -rem + 0x100000000;
				//SAEF_log("I_DIVS64.L %d:%d / %d = [%08x:%08x] | PC %08x", dividendHi,dividendLo,divisor, rem,quo, getPC());
			} else {
				var dividend = regs.d[Dq], orgDividend = dividend;
				var sign = ((dividend ^ divisor) & 0x80000000) != 0;

				if (dividend & 0x80000000) dividend = -dividend + 0x100000000;
				if (divisor & 0x80000000) divisor = -divisor + 0x100000000;

				quo = (dividend / divisor) >>> 0;
				if (sign ? quo > 0x80000000 : quo > 0x7fffffff) {
					regs.v = true;
					//SAEF_log("I_DIVS.L %d / %d OVERFLOW", dividend,divisor);
					coreSyncPC();
					return p.cyc;
				}
				rem = dividend % divisor;
				if (quo && sign) quo = -quo + 0x100000000;
				if (rem && (rem & 0x80000000) != (orgDividend & 0x80000000)) rem = -rem + 0x100000000;
				//SAEF_log("I_DIVS.L %d / %d = [%08x:%08x] | PC %08x", dividend,divisor, rem,quo, getPC());
			}
		} else {
			if (ext & 0x400) {
				var result = divu64(regs.d[Dr], regs.d[Dq], divisor);
				if (result[0]) {
					regs.v = true;
					//SAEF_log("I_DIVU64.L %d:%d / %d OVERFLOW", regs.d[Dr],regs.d[Dq],divisor);
					coreSyncPC();
					return p.cyc;
				}
				quo = result[1];
				rem = result[2];
				//SAEF_log("I_DIVU64.L %d:%d / %d = [%08x:%08x] | PC %08x", regs.d[Dr],regs.d[Dq],divisor, rem,quo, getPC());
			} else {
				quo = (regs.d[Dq] / divisor) >>> 0;
				rem = regs.d[Dq] % divisor;
				//SAEF_log("I_DIVU.L %d / %d = [%08x:%08x] | PC %08x", regs.d[Dq],divisor, rem,quo, getPC());
			}
		}
		regs.d[Dq] = quo;
		if (Dr != Dq) regs.d[Dr] = rem;
		regs.v = false;
		regs.z = quo == 0;
		regs.n = (quo & 0x80000000) != 0;

		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/*  Integer Arithmetic - Extended */

	function I_ADDX_D_32(p) {
		var s = regs.d[p.Ry];
		var d = regs.d[p.Rx];
		var r = s + d + (regs.x ? 1:0); if (r > 0xffffffff) r -= 0x100000000;
		regs.d[p.Rx] = r;
		//SAEF_log(("I_ADDX_D.L %08x + %08x + %d = %08x", s, d, regs.x?1:0, r));
		flgAdd(s, d, r, 0x80000000, true);
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDX_D_16(p) {
		var s = regs.d[p.Ry] & 0xffff;
		var d = regs.d[p.Rx] & 0xffff;
		var r = s + d + (regs.x ? 1:0); if (r > 0xffff) r -= 0x10000;
		regs.d[p.Rx] = (regs.d[p.Rx] & 0xffff0000) | r;
		//SAEF_log(("I_ADDX_D.W %08x + %08x + %d = %08x", s, d, regs.x?1:0, r));
		flgAdd(s, d, r, 0x8000, true);
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDX_D_8(p) {
		var s = regs.d[p.Ry] & 0xff;
		var d = regs.d[p.Rx] & 0xff;
		var r = s + d + (regs.x ? 1:0); if (r > 0xff) r -= 0x100;
		regs.d[p.Rx] = (regs.d[p.Rx] & 0xffffff00) | r;
		//SAEF_log(("I_ADDX_D.B %08x + %08x + %d = %08x", s, d, regs.x?1:0, r));
		flgAdd(s, d, r, 0x80, true);
		coreSyncPC();
		return p.cyc;
	}

	function I_ADDX_M_32(p) {
		regs.a[p.Ry] -= 4; var s = coreGet32(regs.a[p.Ry]);
		regs.a[p.Rx] -= 4; var d = coreGet32(regs.a[p.Rx]);
		var r = s + d + (regs.x ? 1:0); if (r > 0xffffffff) r -= 0x100000000;
		corePut32(regs.a[p.Rx], r);
		//SAEF_log(("I_ADDX_M.L %08x + %08x + %d = %08x", s, d, regs.x?1:0, r));
		flgAdd(s, d, r, 0x80000000, true);
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDX_M_16(p) {
		regs.a[p.Ry] -= 2; var s = coreGet16(regs.a[p.Ry]);
		regs.a[p.Rx] -= 2; var d = coreGet16(regs.a[p.Rx]);
		var r = s + d + (regs.x ? 1:0); if (r > 0xffff) r -= 0x10000;
		corePut16(regs.a[p.Rx], r);
		//SAEF_log(("I_ADDX_M.W %08x + %08x + %d = %08x", s, d, regs.x?1:0, r));
		flgAdd(s, d, r, 0x8000, true);
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDX_M_8(p) {
		regs.a[p.Ry] -= aIncDec[1][p.Ry]; var s = coreGet8(regs.a[p.Ry]);
		regs.a[p.Rx] -= aIncDec[1][p.Rx]; var d = coreGet8(regs.a[p.Rx]);
		var r = s + d + (regs.x ? 1:0); if (r > 0xff) r -= 0x100;
		corePut8(regs.a[p.Rx], r);
		//SAEF_log(("I_ADDX_M.B %08x + %08x + %d = %08x", s, d, regs.x?1:0, r));
		flgAdd(s, d, r, 0x80, true);
		coreSyncPC();
		return p.cyc;
	}

	function I_SUBX_D_32(p) {
		var s = regs.d[p.Rx];
		var d = regs.d[p.Ry];
		var r = d - s - (regs.x ? 1:0); if (r < 0) r += 0x100000000;
		regs.d[p.Ry] = r;
		//SAEF_log(("I_SUBX_D.L %08x - %08x - %d = %08x", d, s, regs.x?1:0, r));
		flgSub(s, d, r, 0x80000000, true);
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBX_D_16(p) {
		var s = regs.d[p.Rx] & 0xffff;
		var d = regs.d[p.Ry] & 0xffff;
		var r = d - s - (regs.x ? 1:0); if (r < 0) r += 0x10000;
		regs.d[p.Ry] = (regs.d[p.Ry] & 0xffff0000) | r;
		//SAEF_log(("I_SUBX_D.W %08x - %08x - %d = %08x", d, s, regs.x?1:0, r));
		flgSub(s, d, r, 0x8000, true);
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBX_D_8(p) {
		var s = regs.d[p.Rx] & 0xff;
		var d = regs.d[p.Ry] & 0xff;
		var r = d - s - (regs.x ? 1:0); if (r < 0) r += 0x100;
		regs.d[p.Ry] = (regs.d[p.Ry] & 0xffffff00) | r;
		//SAEF_log(("I_SUBX_D.B %08x - %08x - %d = %08x", d, s, regs.x?1:0, r));
		flgSub(s, d, r, 0x80, true);
		coreSyncPC();
		return p.cyc;
	}

	function I_SUBX_M_32(p) {
		regs.a[p.Rx] -= 4; var s = coreGet32(regs.a[p.Rx]);
		regs.a[p.Ry] -= 4; var d = coreGet32(regs.a[p.Ry]);
		var r = d - s - (regs.x ? 1:0); if (r < 0) r += 0x100000000;
		corePut32(regs.a[p.Ry], r);
		//SAEF_log(("I_SUBX_M.L %08x - %08x - %d = %08x", d, s, regs.x?1:0, r));
		flgSub(s, d, r, 0x80000000, true);
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBX_M_16(p) {
		regs.a[p.Rx] -= 2; var s = coreGet16(regs.a[p.Rx]);
		regs.a[p.Ry] -= 2; var d = coreGet16(regs.a[p.Ry]);
		var r = d - s - (regs.x ? 1:0); if (r < 0) r += 0x10000;
		corePut16(regs.a[p.Ry], r);
		//SAEF_log(("I_SUBX_M.W %08x - %08x - %d = %08x", d, s, regs.x?1:0, r));
		flgSub(s, d, r, 0x8000, true);
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBX_M_8(p) {
		regs.a[p.Rx] -= aIncDec[1][p.Rx]; var s = coreGet8(regs.a[p.Rx]);
		regs.a[p.Ry] -= aIncDec[1][p.Ry]; var d = coreGet8(regs.a[p.Ry]);
		var r = d - s - (regs.x ? 1:0); if (r < 0) r += 0x100;
		corePut8(regs.a[p.Ry], r);
		//SAEF_log(("I_SUBX_M.B %08x - %08x - %d = %08x", d, s, regs.x?1:0, r));
		flgSub(s, d, r, 0x80, true);
		coreSyncPC();
		return p.cyc;
	}

	function I_NEGX_D_32(p) {
		var d = regs.d[p.Dn];
		var r = 0 - d - (regs.x ? 1:0); if (r < 0) r += 0x100000000;
		regs.d[p.Dn] = r;
		//SAEF_log(("I_NEGX_D.L 0 - %08x - %d = %08x", d, regs.x?1:0, r));
		flgNeg(d, r, 0x80000000, true);
		coreSyncPC();
		return p.cyc;
	}
	function I_NEGX_D_16(p) {
		var d = regs.d[p.Dn] & 0xffff;
		var r = 0 - d - (regs.x ? 1:0); if (r < 0) r += 0x10000;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		//SAEF_log(("I_NEGX_D.W 0 - %08x - %d = %08x", d, regs.x?1:0, r));
		flgNeg(d, r, 0x8000, true);
		coreSyncPC();
		return p.cyc;
	}
	function I_NEGX_D_8(p) {
		var d = regs.d[p.Dn] & 0xff;
		var r = 0 - d - (regs.x ? 1:0); if (r < 0) r += 0x100;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffffff00) | r;
		//SAEF_log(("I_NEGX_D.B 0 - %08x - %d = %08x", d, regs.x?1:0, r));
		flgNeg(d, r, 0x80, true);
		coreSyncPC();
		return p.cyc;
	}
	function I_NEGX_E_32(p) {
		var a = exEAtab[p.ea](4);
		var d = coreGet32(a);
		var r = 0 - d - (regs.x ? 1:0); if (r < 0) r += 0x100000000;
		corePut32(a, r);
		//SAEF_log(("I_NEGX_E.L 0 - %08x - %d = %08x", d, regs.x?1:0, r));
		flgNeg(d, r, 0x80000000, true);
		coreSyncPC();
		return p.cyc;
	}
	function I_NEGX_E_16(p) {
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a);
		var r = 0 - d - (regs.x ? 1:0); if (r < 0) r += 0x10000;
		corePut16(a, r);
		//SAEF_log(("I_NEGX_E.W 0 - %08x - %d = %08x", d, regs.x?1:0, r));
		flgNeg(d, r, 0x8000, true);
		coreSyncPC();
		return p.cyc;
	}
	function I_NEGX_E_8(p) {
		var a = exEAtab[p.ea](1);
		var d = coreGet8(a);
		var r = 0 - d - (regs.x ? 1:0); if (r < 0) r += 0x100;
		corePut8(a, r);
		//SAEF_log(("I_NEGX_E.B 0 - %08x - %d = %08x", d, regs.x?1:0, r));
		flgNeg(d, r, 0x80, true);
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/*  Integer Arithmetic - Address */

	function I_ADDA_32(p) {
		var s = ldEA32tab[p.ea]();
		var d = regs.a[p.An];
		var r = s + d; if (r > 0xffffffff) r -= 0x100000000;
		regs.a[p.An] = r;
		//SAEF_log(("I_ADDA.L %08x + %08x = %08x", s, d, r));
		//ccna
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDA_16(p) {
		var s = extWord(ldEA16tab[p.ea]());
		var d = regs.a[p.An];
		var r = s + d; if (r > 0xffffffff) r -= 0x100000000;
		regs.a[p.An] = r;
		//SAEF_log(("I_ADDA.W %08x + %08x = %08x", s, d, r));
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	function I_SUBA_32(p) {
		var s = ldEA32tab[p.ea]();
		var d = regs.a[p.An];
		var r = d - s; if (r < 0) r += 0x100000000;
		regs.a[p.An] = r;
		//SAEF_log(("I_SUBA.L %08x - %08x = %08x", d, s, r));
		//ccna
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBA_16(p) {
		var s = extWord(ldEA16tab[p.ea]());
		var d = regs.a[p.An];
		var r = d - s; if (r < 0) r += 0x100000000;
		regs.a[p.An] = r;
		//SAEF_log(("I_SUBA.W %08x - %08x = %08x", d, s, r));
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	function I_CMPA_32(p) {
		var s = ldEA32tab[p.ea]();
		var d = regs.a[p.An];
		var r = d - s; if (r < 0) r += 0x100000000;
		flgCmp(s, d, r, 0x80000000);
		//SAEF_log(("I_CMPA.L %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_CMPA_16(p) {
		var s = extWord(ldEA16tab[p.ea]());
		var d = regs.a[p.An];
		var r = d - s; if (r < 0) r += 0x100000000;
		flgCmp(s, d, r, 0x80000000);
		//SAEF_log(("I_CMPA.W %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/*  Integer Arithmetic - Immediate */

	function I_ADDI_D_32(p) {
		var s = coreNext32();
		var d = regs.d[p.Dn];
		var r = s + d; if (r > 0xffffffff) r -= 0x100000000;
		regs.d[p.Dn] = r;
		flgAdd(s, d, r, 0x80000000, false);
		//SAEF_log(("I_ADDI_D.L %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDI_D_16(p) {
		var s = coreNext16();
		var d = regs.d[p.Dn] & 0xffff;
		var r = s + d; if (r > 0xffff) r -= 0x10000;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		flgAdd(s, d, r, 0x8000, false);
		//SAEF_log(("I_ADDI_D.W %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDI_D_8(p) {
		var s = coreNext16() & 0xff;
		var d = regs.d[p.Dn] & 0xff;
		var r = s + d; if (r > 0xff) r -= 0x100;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffffff00) | r;
		flgAdd(s, d, r, 0x80, false);
		//SAEF_log(("I_ADDI_D.B %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDI_E_32(p) {
		var s = coreNext32();
		var a = exEAtab[p.ea](4);
		var d = coreGet32(a);
		var r = s + d; if (r > 0xffffffff) r -= 0x100000000;
		corePut32(a, r);
		flgAdd(s, d, r, 0x80000000, false);
		//SAEF_log(("I_ADDI_E.L %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDI_E_16(p) {
		var s = coreNext16();
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a);
		var r = s + d; if (r > 0xffff) r -= 0x10000;
		corePut16(a, r);
		flgAdd(s, d, r, 0x8000, false);
		//SAEF_log(("I_ADDI_E.W %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDI_E_8(p) {
		var s = coreNext16() & 0xff;
		var a = exEAtab[p.ea](1);
		var d = coreGet8(a);
		var r = s + d; if (r > 0xff) r -= 0x100;
		corePut8(a, r);
		flgAdd(s, d, r, 0x80, false);
		//SAEF_log(("I_ADDI_E.B %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_SUBI_D_32(p) {
		var s = coreNext32();
		var d = regs.d[p.Dn];
		var r = d - s; if (r < 0) r += 0x100000000;
		regs.d[p.Dn] = r;
		flgSub(s, d, r, 0x80000000, false);
		//SAEF_log(("I_SUBI_D.L %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBI_D_16(p) {
		var s = coreNext16();
		var d = regs.d[p.Dn] & 0xffff;
		var r = d - s; if (r < 0) r += 0x10000;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		flgSub(s, d, r, 0x8000, false);
		//SAEF_log(("I_SUBI_D.W %08x - %08x = %08x", d, s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBI_D_8(p) {
		var s = coreNext16() & 0xff;
		var d = regs.d[p.Dn] & 0xff;
		var r = d - s; if (r < 0) r += 0x100;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffffff00) | r;
		flgSub(s, d, r, 0x80, false);
		//SAEF_log(("I_SUBI_D.B %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBI_E_32(p) {
		var s = coreNext32();
		var a = exEAtab[p.ea](4);
		var d = coreGet32(a);
		var r = d - s; if (r < 0) r += 0x100000000;
		corePut32(a, r);
		flgSub(s, d, r, 0x80000000, false);
		//SAEF_log(("I_SUBI_E.L %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBI_E_16(p) {
		var s = coreNext16();
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a);
		var r = d - s; if (r < 0) r += 0x10000;
		corePut16(a, r);
		flgSub(s, d, r, 0x8000, false);
		//SAEF_log(("I_SUBI_E.W %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBI_E_8(p) {
		var s = coreNext16() & 0xff;
		var a = exEAtab[p.ea](1);
		var d = coreGet8(a);
		var r = d - s; if (r < 0) r += 0x100;
		corePut8(a, r);
		flgSub(s, d, r, 0x80, false);
		//SAEF_log(("I_SUBI_E.B %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_CMPI_32(p) {
		var s = coreNext32();
		var d = ldEA32tab[p.ea]();
		var r = d - s; if (r < 0) r += 0x100000000;
		flgCmp(s, d, r, 0x80000000);
		//SAEF_log(("I_CMPI.L %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_CMPI_16(p) {
		var s = coreNext16();
		var d = ldEA16tab[p.ea]();
		var r = d - s; if (r < 0) r += 0x10000;
		flgCmp(s, d, r, 0x8000);
		//SAEF_log(("I_CMPI.W %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_CMPI_8(p) {
		var s = coreNext16() & 0xff;
		var d = ldEA8tab[p.ea]();
		var r = d - s; if (r < 0) r += 0x100;
		flgCmp(s, d, r, 0x80);
		//SAEF_log(("I_CMPI.B %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/*  Integer Arithmetic - Quick */

	function I_ADDQ_D_32(p) {
		var s = p.data;
		var d = regs.d[p.Dn];
		var r = s + d; if (r > 0xffffffff) r -= 0x100000000;
		regs.d[p.Dn] = r;
		flgAdd(s, d, r, 0x80000000, false);
		//SAEF_log(("I_ADDQ_D.L %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDQ_A_32(p) {
		var s = p.data;
		var d = regs.a[p.An];
		var r = s + d; if (r > 0xffffffff) r -= 0x100000000;
		regs.a[p.An] = r;
		//ccna
		//SAEF_log(("I_ADDQ_A.L %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDQ_E_32(p) {
		var a = exEAtab[p.ea](4);
		var s = p.data;
		var d = coreGet32(a);
		var r = s + d; if (r > 0xffffffff) r -= 0x100000000;
		corePut32(a, r);
		flgAdd(s, d, r, 0x80000000, false);
		//SAEF_log(("I_ADDQ_E.L %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDQ_D_16(p) {
		var s = p.data;
		var d = regs.d[p.Dn] & 0xffff;
		var r = s + d; if (r > 0xffff) r -= 0x10000;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		flgAdd(s, d, r, 0x8000, false);
		//SAEF_log(("I_ADDQ_D.W %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDQ_E_16(p) {
		var a = exEAtab[p.ea](2);
		var s = p.data;
		var d = coreGet16(a);
		var r = s + d; if (r > 0xffff) r -= 0x10000;
		corePut16(a, r);
		flgAdd(s, d, r, 0x8000, false);
		//SAEF_log(("I_ADDQ_E.W %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDQ_D_8(p) {
		var s = p.data;
		var d = regs.d[p.Dn] & 0xff;
		var r = s + d; if (r > 0xff) r -= 0x100;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffffff00) | r;
		flgAdd(s, d, r, 0x80, false);
		//SAEF_log(("I_ADDQ_D.B %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_ADDQ_E_8(p) {
		var a = exEAtab[p.ea](1);
		var s = p.data;
		var d = coreGet8(a);
		var r = s + d; if (r > 0xff) r -= 0x100;
		corePut8(a, r);
		flgAdd(s, d, r, 0x80, false);
		//SAEF_log(("I_ADDQ_E.B %08x + %08x = %08x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_SUBQ_D_32(p) {
		var s = p.data;
		var d = regs.d[p.Dn];
		var r = d - s; if (r < 0) r += 0x100000000;
		regs.d[p.Dn] = r;
		flgSub(s, d, r, 0x80000000, false);
		//SAEF_log(("I_SUBQ_D.L %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBQ_A_32(p) {
		var s = p.data;
		var d = regs.a[p.An];
		var r = d - s; if (r < 0) r += 0x100000000;
		regs.a[p.An] = r;
		//ccna
		//SAEF_log(("I_SUBQ_A.L %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBQ_E_32(p) {
		var a = exEAtab[p.ea](4);
		var s = p.data;
		var d = coreGet32(a);
		var r = d - s; if (r < 0) r += 0x100000000;
		corePut32(a, r);
		flgSub(s, d, r, 0x80000000, false);
		//SAEF_log(("I_SUBQ_E.L %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBQ_D_16(p) {
		var s = p.data;
		var d = regs.d[p.Dn] & 0xffff;
		var r = d - s; if (r < 0) r += 0x10000;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		flgSub(s, d, r, 0x8000, false);
		//SAEF_log(("I_SUBQ_D.W %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBQ_E_16(p) {
		var a = exEAtab[p.ea](2);
		var s = p.data;
		var d = coreGet16(a);
		var r = d - s; if (r < 0) r += 0x10000;
		corePut16(a, r);
		flgSub(s, d, r, 0x8000, false);
		//SAEF_log(("I_SUBQ_E.W %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBQ_D_8(p) {
		var s = p.data;
		var d = regs.d[p.Dn] & 0xff;
		var r = d - s; if (r < 0) r += 0x100;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffffff00) | r;
		flgSub(s, d, r, 0x80, false);
		//SAEF_log(("I_SUBQ_D.B %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_SUBQ_E_8(p) {
		var a = exEAtab[p.ea](1);
		var s = p.data;
		var d = coreGet8(a);
		var r = d - s; if (r < 0) r += 0x100;
		corePut8(a, r);
		flgSub(s, d, r, 0x80, false);
		//SAEF_log(("I_SUBQ_E.B %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/*  Integer Arithmetic - Misc */

	function I_CMPM_32(p) {
		var s = coreGet32(regs.a[p.Ay]); regs.a[p.Ay] += 4;
		var d = coreGet32(regs.a[p.Ax]); regs.a[p.Ax] += 4;
		var r = d - s; if (r < 0) r += 0x100000000;
		flgCmp(s, d, r, 0x80000000);
		//SAEF_log(("I_CMPM.L %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_CMPM_16(p) {
		var s = coreGet16(regs.a[p.Ay]); regs.a[p.Ay] += 2;
		var d = coreGet16(regs.a[p.Ax]); regs.a[p.Ax] += 2;
		var r = d - s; if (r < 0) r += 0x10000;
		flgCmp(s, d, r, 0x8000);
		//SAEF_log(("I_CMPM.W %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_CMPM_8(p) {
		var s = coreGet8(regs.a[p.Ay]); regs.a[p.Ay] += aIncDec[1][p.Ay];
		var d = coreGet8(regs.a[p.Ax]); regs.a[p.Ax] += aIncDec[1][p.Ax];
		var r = d - s; if (r < 0) r += 0x100;
		flgCmp(s, d, r, 0x80);
		//SAEF_log(("I_CMPM.B %08x - %08x = %08x", d, s, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_EXT_16(p) {
		var d = regs.d[p.Dn] & 0xff;
		var r = (d & 0x80) ? 0xff00 | d : d;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		flgLogical(r, 0x8000);
		//SAEF_log(("I_EXT.W %08x -> %08x", d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_EXT_32(p) {
		var d = regs.d[p.Dn] & 0xffff;
		var r = (d & 0x8000) ? ((0xffff0000 | d) >>> 0) : d;
		regs.d[p.Dn] = r;
		flgLogical(r, 0x80000000);
		//SAEF_log(("I_EXT.L %08x -> %08x", d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_EXTB(p) { /* >= 68020 */
		var d = regs.d[p.Dn] & 0xff;
		var r = (d & 0x80) ? ((0xffffff00 | d) >>> 0) : d;
		regs.d[p.Dn] = r;
		flgLogical(r, 0x80000000);
		//SAEF_log(("I_EXTB.L %08x -> %08x", d, r));
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Logical */

	function I_AND_D_32(p) {
		var r = (ldEA32tab[p.ea]() & regs.d[p.Dn]) >>> 0;
		regs.d[p.Dn] = r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_AND_D_16(p) {
		var r = ldEA16tab[p.ea]() & (regs.d[p.Dn] & 0xffff);
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_AND_D_8(p) {
		var r = ldEA8tab[p.ea]() & (regs.d[p.Dn] & 0xff);
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffffff00) | r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_AND_E_32(p) {
		var a = exEAtab[p.ea](4);
		var r = (regs.d[p.Dn] & coreGet32(a)) >>> 0;
		corePut32(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_AND_E_16(p) {
		var a = exEAtab[p.ea](2);
		var r = (regs.d[p.Dn] & 0xffff) & coreGet16(a);
		corePut16(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_AND_E_8(p) {
		var a = exEAtab[p.ea](1);
		var r = (regs.d[p.Dn] & 0xff) & coreGet8(a);
		corePut8(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}

	function I_EOR_D_32(p) {
		var r = (regs.d[p.Dd] ^ regs.d[p.Dn]) >>> 0;
		regs.d[p.Dd] = r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_EOR_D_16(p) {
		var r = (regs.d[p.Dd] & 0xffff) ^ (regs.d[p.Dn] & 0xffff);
		regs.d[p.Dd] = (regs.d[p.Dd] & 0xffff0000) | r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_EOR_D_8(p) {
		var r = (regs.d[p.Dd] & 0xff) ^ (regs.d[p.Dn] & 0xff);
		regs.d[p.Dd] = (regs.d[p.Dd] & 0xffffff00) | r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_EOR_E_32(p) {
		var a = exEAtab[p.ea](4);
		var r = (coreGet32(a) ^ regs.d[p.Dn]) >>> 0;
		corePut32(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_EOR_E_16(p) {
		var a = exEAtab[p.ea](2);
		var r = coreGet16(a) ^ (regs.d[p.Dn] & 0xffff);
		corePut16(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_EOR_E_8(p) {
		var a = exEAtab[p.ea](1);
		var r = coreGet8(a) ^ (regs.d[p.Dn] & 0xff);
		corePut8(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}

	function I_NOT_D_32(p) {
		var r = ~regs.d[p.Dn] >>> 0;
		regs.d[p.Dn] = r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_NOT_D_16(p) {
		var r = ~(regs.d[p.Dn] & 0xffff) & p.m;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_NOT_D_8(p) {
		var r = ~(regs.d[p.Dn] & 0xff) & p.m;
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffffff00) | r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_NOT_E_32(p) {
		var a = exEAtab[p.ea](4);
		var r = ~coreGet32(a) >>> 0;
		corePut32(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_NOT_E_16(p) {
		var a = exEAtab[p.ea](2);
		var r = ~coreGet16(a) & p.m;
		corePut16(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_NOT_E_8(p) {
		var a = exEAtab[p.ea](1);
		var r = ~coreGet8(a) & p.m;
		corePut8(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}

	function I_OR_D_32(p) {
		var r = (ldEA32tab[p.ea]() | regs.d[p.Dn]) >>> 0;
		regs.d[p.Dn] = r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_OR_D_16(p) {
		var r = ldEA16tab[p.ea]() | (regs.d[p.Dn] & 0xffff);
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_OR_D_8(p) {
		var r = ldEA8tab[p.ea]() | (regs.d[p.Dn] & 0xff);
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffffff00) | r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_OR_E_32(p) {
		var a = exEAtab[p.ea](4);
		var r = (regs.d[p.Dn] | coreGet32(a)) >>> 0;
		corePut32(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_OR_E_16(p) {
		var a = exEAtab[p.ea](2);
		var r = (regs.d[p.Dn] & 0xffff) | coreGet16(a);
		corePut16(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_OR_E_8(p) {
		var a = exEAtab[p.ea](1);
		var r = (regs.d[p.Dn] & 0xff) | coreGet8(a);
		corePut8(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Logical - Immediate */

	function I_ANDI_D_32(p) {
		var r = (coreNext32() & regs.d[p.Dn]) >>> 0;
		regs.d[p.Dn] = r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_ANDI_D_16(p) {
		var r = coreNext16() & (regs.d[p.Dn] & 0xffff);
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_ANDI_D_8(p) {
		var r = (coreNext16() & 0xff) & (regs.d[p.Dn] & 0xff);
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffffff00) | r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_ANDI_E_32(p) {
		var s = coreNext32();
		var a = exEAtab[p.ea](4);
		var d = coreGet32(a);
		var r = (s & d) >>> 0;
		corePut32(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_ANDI_E_16(p) {
		var s = coreNext16();
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a);
		var r = s & d;
		corePut16(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_ANDI_E_8(p) {
		var s = coreNext16() & 0xff;
		var a = exEAtab[p.ea](1);
		var d = coreGet8(a);
		var r = s & d;
		corePut8(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}

	function I_EORI_D_32(p) {
		var r = (coreNext32() ^ regs.d[p.Dn]) >>> 0;
		regs.d[p.Dn] = r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_EORI_D_16(p) {
		var r = coreNext16() ^ (regs.d[p.Dn] & 0xffff);
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_EORI_D_8(p) {
		var r = (coreNext16() & 0xff) ^ (regs.d[p.Dn] & 0xff);
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffffff00) | r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_EORI_E_32(p) {
		var s = coreNext32();
		var a = exEAtab[p.ea](4);
		var d = coreGet32(a);
		var r = (s ^ d) >>> 0;
		corePut32(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_EORI_E_16(p) {
		var s = coreNext16();
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a);
		var r = s ^ d;
		corePut16(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_EORI_E_8(p) {
		var s = coreNext16() & 0xff;
		var a = exEAtab[p.ea](1);
		var d = coreGet8(a);
		var r = s ^ d;
		corePut8(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}

	function I_ORI_D_32(p) {
		var r = (coreNext32() | regs.d[p.Dn]) >>> 0;
		regs.d[p.Dn] = r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_ORI_D_16(p) {
		var r = coreNext16() | (regs.d[p.Dn] & 0xffff);
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_ORI_D_8(p) {
		var r = (coreNext16() & 0xff) | (regs.d[p.Dn] & 0xff);
		regs.d[p.Dn] = (regs.d[p.Dn] & 0xffffff00) | r;
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_ORI_E_32(p) {
		var s = coreNext32();
		var a = exEAtab[p.ea](4);
		var d = coreGet32(a);
		var r = (s | d) >>> 0;
		corePut32(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_ORI_E_16(p) {
		var s = coreNext16();
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a);
		var r = s | d;
		corePut16(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}
	function I_ORI_E_8(p) {
		var s = coreNext16() & 0xff;
		var a = exEAtab[p.ea](1);
		var d = coreGet8(a);
		var r = s | d;
		corePut8(a, r);
		flgLogical(r, p.zm);
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Shift and Rotate */

	function I_ASL_32(p) {
		var d = regs.d[p.Dy], _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			var sign = (d & 0x80000000) != 0;
			var mask = ~((1 << (32 - n)) - 1) >>> 0;
			//var mask = (0xffffffff << (31 - n)) >>> 0;
			regs.x = regs.c = (d & (1 << (32-n))) != 0;
			regs.v = sign ? (((d & mask) >>> 0) != mask) : (((d & mask) >>> 0) != 0);
			//regs.v = ((d & mask) >>> 0) != mask && ((d & mask) >>> 0) != 0;
			d = ((d << n) & 0xffffffff) >>> 0;
			regs.d[p.Dy] = d;
		} else regs.v = regs.c = false;
		regs.n = (d & 0x80000000) != 0;
		regs.z = d == 0;
		//if (sign) SAEF_log(("I_ASL.L %08x << %d = %08x, sign %d, mask %x, V %d -> %08x", _d, n, d, sign?1:0, mask, regs.v?1:0, (_d & mask)>>>0));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ASL_16(p) {
		var d = regs.d[p.Dy] & 0xffff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			var sign = (d & 0x8000) != 0;
			var mask = ~((1 << (16 - n)) - 1) & 0xffff;
			//var mask = (0xffff << (15 - n)) & 0xffff;
			regs.x = regs.c = (d & (1 << (16-n))) != 0;
			regs.v = sign ? (d & mask) != mask : (d & mask) != 0;
			//regs.v = (d & mask) != mask && (d & mask) != 0;
			d = ((d << n) & 0xffff) >>> 0;
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffff0000) | d;
		} else regs.v = regs.c = false;
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		//if (sign) SAEF_log(("I_ASL.W %08x << %d = %08x, sign %d, mask %x, V %d", _d, n, d, sign?1:0, mask, regs.v?1:0));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ASL_8(p) {
		var d = regs.d[p.Dy] & 0xff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			var sign = (d & 0x80) != 0;
			var mask = ~((1 << (8 - n)) - 1) & 0xff;
			//var mask = (0xff << (7 - n)) & 0xff;
			regs.x = regs.c = (d & (1 << (8-n))) != 0;
			regs.v = sign ? (d & mask) != mask : (d & mask) != 0;
			//regs.v = (d & mask) != mask && (d & mask) != 0;
			d = ((d << n) & 0xff) >>> 0;
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffffff00) | d;
		} else regs.v = regs.c = false;
		regs.n = (d & 0x80) != 0;
		regs.z = d == 0;
		//if (sign) SAEF_log(("I_ASL.B %08x << %d = %08x, sign %d, mask %x, V %d", _d, n, d, sign?1:0, mask, regs.v?1:0));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ASR_32(p) {
		var d = regs.d[p.Dy], _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.x = regs.c = (d & (1 << (n-1))) != 0;
			d = (d >> n) >>> 0; //js 32
			regs.d[p.Dy] = d;
		} else regs.c = false;
		regs.n = (d & 0x80000000) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ASR.L %08x >> %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ASR_16(p) {
		var d = regs.d[p.Dy] & 0xffff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.x = regs.c = (d & (1 << (n-1))) != 0;
			d = extWord(d); d = ((d >> n) & 0xffff) >>> 0; //js 32
			//d >>= n;
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffff0000) | d;
		} else regs.c = false;
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ASR.W %08x >> %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ASR_8(p) {
		var d = regs.d[p.Dy] & 0xff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.x = regs.c = (d & (1 << (n-1))) != 0;
			d = extByte(d); d = ((d >> n) & 0xff) >>> 0; //js 32
			//d >>= n;
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffffff00) | d;
		} else regs.c = false;
		regs.n = (d & 0x80) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ASR.B %08x >> %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ASL_M(p) {
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a), _d = d;
		regs.x = regs.c = (d & 0x8000) != 0;
		regs.v = regs.c != ((d & 0x4000) != 0);
		d = (d << 1) & 0xffff;
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		corePut16(a, d);
		//SAEF_log(("I_ASL_M.W %08x << 1 = %08x", _d, d));
		coreSyncPC();
		return p.cyc;
	}
	function I_ASR_M(p) {
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a), _d = d;
		var sign = d & 0x8000;
		regs.x = regs.c = (d & 1) != 0;
		regs.v = false;
		d = sign | (d >> 1);
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		corePut16(a, d);
		//SAEF_log(("I_ASR_M.W %08x >> 1 = %08x", _d, d));
		coreSyncPC();
		return p.cyc;
	}

	function I_LSL_32(p) {
		var d = regs.d[p.Dy], _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.x = regs.c = (d & (1 << (32-n))) != 0;
			d = ((d << n) & 0xffffffff) >>> 0;
			regs.d[p.Dy] = d;
		} else regs.c = false;
		regs.n = (d & 0x80000000) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_LSL.L %08x << %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_LSL_16(p) {
		var d = regs.d[p.Dy] & 0xffff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.x = regs.c = (d & (1 << (16-n))) != 0;
			d = ((d << n) & 0xffff) >>> 0;
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffff0000) | d;
		} else regs.c = false;
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_LSL.W %08x << %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_LSL_8(p) {
		var d = regs.d[p.Dy] & 0xff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.x = regs.c = (d & (1 << (8-n))) != 0;
			d = ((d << n) & 0xff) >>> 0;
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffffff00) | d;
		} else regs.c = false;
		regs.n = (d & 0x80) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_LSL.B %08x << %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_LSR_32(p) {
		var d = regs.d[p.Dy], _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.x = regs.c = (d & (1 << (n-1))) != 0;
			d = d >>> n;
			regs.d[p.Dy] = d;
		} else regs.c = false;
		regs.n = (d & 0x80000000) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_LSR.L %08x >> %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_LSR_16(p) {
		var d = regs.d[p.Dy] & 0xffff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.x = regs.c = (d & (1 << (n-1))) != 0;
			d >>= n;
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffff0000) | d;
		} else regs.c = false;
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_LSR.W %08x >> %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_LSR_8(p) {
		var d = regs.d[p.Dy] & 0xff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.x = regs.c = (d & (1 << (n-1))) != 0;
			d >>= n;
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffffff00) | d;
		} else regs.c = false;
		regs.n = (d & 0x80) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_LSR.B %08x >> %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_LSL_M(p) {
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a), _d = d;
		regs.x = regs.c = (d & 0x8000) != 0;
		d = (d << 1) & 0xffff;
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		regs.v = false;
		corePut16(a, d);
		//SAEF_log(("I_LSL_M.W %08x << 1 = %08x", _d, d));
		coreSyncPC();
		return p.cyc;
	}
	function I_LSR_M(p) {
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a), _d = d;
		regs.x = regs.c = (d & 1) != 0;
		d >>= 1;
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		regs.v = false;
		corePut16(a, d);
		//SAEF_log(("I_LSR_M.W %08x >> 1 = %08x", _d, d));
		coreSyncPC();
		return p.cyc;
	}

	function I_ROL_32(p) {
		var d = regs.d[p.Dy], _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.c = (d & (1 << (32-n))) != 0;
			d = (((d << n) | (d >>> (32-n))) & 0xffffffff) >>> 0;
			regs.d[p.Dy] = d;
		} else regs.c = false;
		regs.n = (d & 0x80000000) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ROL.L %08x << %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ROL_16(p) {
		var d = regs.d[p.Dy] & 0xffff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.c = (d & (1 << (16-n))) != 0;
			d = (((d << n) | (d >> (16-n))) & 0xffff) >>> 0;
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffff0000) | d;
		} else regs.c = false;
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ROL.W %08x << %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ROL_8(p) {
		var d = regs.d[p.Dy] & 0xff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.c = (d & (1 << (8-n))) != 0;
			d = (((d << n) | (d >> (8-n))) & 0xff) >>> 0;
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffffff00) | d;
		} else regs.c = false;
		regs.n = (d & 0x80) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ROL.B %08x << %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ROR_32(p) {
		var d = regs.d[p.Dy], _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.c = (d & (1 << (n-1))) != 0;
			d = (((d << (32-n)) | (d >>> n)) & 0xffffffff) >>> 0;
			regs.d[p.Dy] = d;
		} else regs.c = false;
		regs.n = (d & 0x80000000) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ROR.L %08x >> %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ROR_16(p) {
		var d = regs.d[p.Dy] & 0xffff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.c = (d & (1 << (n-1))) != 0;
			d = (((d << (16-n)) | (d >>> n)) & 0xffff) >>> 0;
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffff0000) | d;
		} else regs.c = false;
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ROR.W %08x >> %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ROR_8(p) {
		var d = regs.d[p.Dy] & 0xff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.c = (d & (1 << (n-1))) != 0;
			d = (((d << (8-n)) | (d >>> n)) & 0xff) >>> 0;
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffffff00) | d;
		} else regs.c = false;
		regs.n = (d & 0x80) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ROR.B %08x >> %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ROL_M(p) {
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a), _d = d;
		regs.c = (d & 0x8000) != 0;
		d = ((d << 1) & 0xffff) | (regs.c ? 1:0);
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		regs.v = false;
		corePut16(a, d);
		//SAEF_log(("I_ROL_M.W %08x << 1 = %08x", _d, d));
		coreSyncPC();
		return p.cyc;
	}
	function I_ROR_M(p) {
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a), _d = d;
		regs.c = (d & 1) != 0;
		d = (regs.c ? 0x8000 : 0) | (d >> 1);
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		regs.v = false;
		corePut16(a, d);
		//SAEF_log(("I_ROR_M.W %08x >> 1 = %08x", _d, d));
		coreSyncPC();
		return p.cyc;
	}

	function I_ROXL_32(p) {
		var d = regs.d[p.Dy], _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.c = (d & (1 << (32-n))) != 0;
			d = (((d << n) | (d >>> (32-n))) & 0xffffffff) >>> 0;
			d = ((d & 0xfffffffe) | (regs.x ? 1 : 0)) >>> 0;
			regs.d[p.Dy] = d;
			regs.x = regs.c;
		} else regs.c = regs.x;
		regs.n = (d & 0x80000000) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ROXL.L %08x << %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ROXL_16(p) {
		var d = regs.d[p.Dy] & 0xffff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.c = (d & (1 << (16-n))) != 0;
			d = ((d << n) | (d >> (16-n))) & 0xffff;
			d = (d & 0xfffe) | (regs.x ? 1 : 0);
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffff0000) | d;
			regs.x = regs.c;
		} else regs.c = regs.x;
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ROXL.W %08x << %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ROXL_8(p) {
		var d = regs.d[p.Dy] & 0xff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.c = (d & (1 << (8-n))) != 0;
			d = ((d << n) | (d >> (8-n))) & 0xff;
			d = (d & 0xfe) | (regs.x ? 1 : 0);
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffffff00) | d;
			regs.x = regs.c;
		} else regs.c = regs.x;
		regs.n = (d & 0x80) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ROXL.B %08x << %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ROXR_32(p) {
		var d = regs.d[p.Dy], _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.c = (d & (1 << (n-1))) != 0;
			d = (((d << (32-n)) | (d >>> n)) & 0xffffffff) >>> 0;
			d = ((regs.x ? 0x80000000 : 0) | (d & 0x7fffffff)) >>> 0;
			regs.d[p.Dy] = d;
			regs.x = regs.c;
		} else regs.c = regs.x;
		regs.n = (d & 0x80000000) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ROXR.L %08x >> %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ROXR_16(p) {
		var d = regs.d[p.Dy] & 0xffff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.c = (d & (1 << (n-1))) != 0;
			d = ((d << (16-n)) | (d >>> n)) & 0xffff;
			d = (regs.x ? 0x8000 : 0) | (d & 0x7fff);
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffff0000) | d;
			regs.x = regs.c;
		} else regs.c = regs.x;
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ROXR.W %08x >> %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ROXR_8(p) {
		var d = regs.d[p.Dy] & 0xff, _d = d;
		var n = p.ir ? regs.d[p.cr] & 63 : p.cr;
		if (n) {
			regs.c = (d & (1 << (n-1))) != 0;
			d = ((d << (8-n)) | (d >>> n)) & 0xff;
			d = (regs.x ? 0x80 : 0) | (d & 0x7f);
			regs.d[p.Dy] = (regs.d[p.Dy] & 0xffffff00) | d;
			regs.x = regs.c;
		} else regs.c = regs.x;
		regs.n = (d & 0x80) != 0;
		regs.z = d == 0;
		regs.v = false;
		//SAEF_log(("I_ROXR.B %08x >> %d = %08x", _d, n, d));
		coreSyncPC();
		return [p.cyc[0]+2*n,p.cyc[1],p.cyc[2]];
	}
	function I_ROXL_M(p) {
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a), _d = d;
		regs.c = (d & 0x8000) != 0;
		d = ((d << 1) & 0xffff) | (regs.x ? 1:0);
		regs.x = regs.c;
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		regs.v = false;
		corePut16(a, d);
		//SAEF_log(("I_ROXL_M.W %08x << 1 = %08x", _d, d));
		coreSyncPC();
		return p.cyc;
	}
	function I_ROXR_M(p) {
		var a = exEAtab[p.ea](2);
		var d = coreGet16(a), _d = d;
		regs.c = (d & 1) != 0;
		d = (regs.x ? 0x8000 : 0) | (d >> 1);
		regs.x = regs.c;
		regs.n = (d & 0x8000) != 0;
		regs.z = d == 0;
		regs.v = false;
		corePut16(a, d);
		//SAEF_log(("I_ROXR_M.W %08x >> 1 = %08x", _d, d));
		coreSyncPC();
		return p.cyc;
	}

	function I_SWAP(p) {
		var d = regs.d[p.Dn];
		var r = (((d & 0xffff) << 16) | (d >>> 16)) >>> 0;
		regs.d[p.Dn] = r;
		regs.n = (r & 0x80000000) != 0;
		regs.z = r == 0;
		regs.v = regs.c = false;
		//SAEF_log(("I_SWAP.W %08x <> %08x", d, r));
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Bit Manipulation */

	function I_BCHG_DD_32(p) {
		var s = regs.d[p.Dn] & 31;
		var d = regs.d[p.Dd];
		var m = (1 << s) >>> 0;
		regs.z = (d & m) == 0;
		var r = (d ^ m) >>> 0;
		regs.d[p.Dd] = r;
		//SAEF_log(("I_BCHG1.L s %08x == m %08x, d %08x, r %08x", s, m, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_BCHG_DE_8(p) {
		var a = exEAtab[p.ea](1);
		var s = regs.d[p.Dn] & 7;
		var d = coreGet8(a);
		var m = 1 << s;
		regs.z = (d & m) == 0;
		var r = d ^ m;
		corePut8(a, r);
		//SAEF_log(("I_BCHG1.B s %08x == m %08x, d %08x, r %08x", s, m, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_BCHG_ID_32(p) {
		var s = coreNext16() & 31;
		var d = regs.d[p.Dd];
		var m = (1 << s) >>> 0;
		regs.z = (d & m) == 0;
		var r = (d ^ m) >>> 0;
		regs.d[p.Dd] = r;
		//SAEF_log(("I_BCHG2.L s %08x == m %08x, d %08x, r %08x", s, m, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_BCHG_IE_8(p) {
		var s = coreNext16() & 7;
		var a = exEAtab[p.ea](1);
		var d = coreGet8(a);
		var m = 1 << s;
		regs.z = (d & m) == 0;
		var r = d ^ m;
		corePut8(a, r);
		//SAEF_log(("I_BCHG2.B s %08x == m %08x, d %08x, r %08x", s, m, d, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_BCLR_DD_32(p) {
		var s = regs.d[p.Dn] & 31;
		var d = regs.d[p.Dd];
		var m = (1 << s) >>> 0;
		regs.z = (d & m) == 0;
		var r = (d & ~m) >>> 0;
		regs.d[p.Dd] = r;
		//SAEF_log(("I_BCLR1.L s %08x == m %08x, d %08x, r %08x", s, m, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_BCLR_DE_8(p) {
		var a = exEAtab[p.ea](1);
		var s = regs.d[p.Dn] & 7;
		var d = coreGet8(a);
		var m = 1 << s;
		regs.z = (d & m) == 0;
		var r = d & ~m;
		corePut8(a, r);
		//SAEF_log(("I_BCLR1.B s %08x == m %08x, d %08x, r %08x", s, m, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_BCLR_ID_32(p) {
		var s = coreNext16() & 31;
		var d = regs.d[p.Dd];
		var m = (1 << s) >>> 0;
		regs.z = (d & m) == 0;
		var r = (d & ~m) >>> 0;
		regs.d[p.Dd] = r;
		//SAEF_log(("I_BCLR2.L s %08x == m %08x, d %08x, r %08x", s, m, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_BCLR_IE_8(p) {
		var s = coreNext16() & 7;
		var a = exEAtab[p.ea](1);
		var d = coreGet8(a);
		var m = 1 << s;
		regs.z = (d & m) == 0;
		var r = d & ~m;
		corePut8(a, r);
		//SAEF_log(("I_BCLR2.B s %08x == m %08x, d %08x, r %08x", s, m, d, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_BSET_DD_32(p) {
		var s = regs.d[p.Dn] & 31;
		var d = regs.d[p.Dd];
		var m = (1 << s) >>> 0;
		regs.z = (d & m) == 0;
		var r = (d | m) >>> 0;
		regs.d[p.Dd] = r;
		//SAEF_log(("I_BSET1.L s %08x == m %08x, d %08x, r %08x", s, m, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_BSET_DE_8(p) {
		var a = exEAtab[p.ea](1);
		var s = regs.d[p.Dn] & 7;
		var d = coreGet8(a);
		var m = 1 << s;
		regs.z = (d & m) == 0;
		var r = d | m;
		corePut8(a, r);
		//SAEF_log(("I_BSET1.B s %08x == m %08x, d %08x, r %08x", s, m, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_BSET_ID_32(p) {
		var s = coreNext16() & 31;
		var d = regs.d[p.Dd];
		var m = (1 << s) >>> 0;
		regs.z = (d & m) == 0;
		var r = (d | m) >>> 0;
		regs.d[p.Dd] = r;
		//SAEF_log(("I_BSET2.L s %08x == m %08x, d %08x, r %08x", s, m, d, r));
		coreSyncPC();
		return p.cyc;
	}
	function I_BSET_IE_8(p) {
		var s = coreNext16() & 7;
		var a = exEAtab[p.ea](1);
		var d = coreGet8(a);
		var m = 1 << s;
		regs.z = (d & m) == 0;
		var r = d | m;
		corePut8(a, r);
		//SAEF_log(("I_BSET2.B s %08x == m %08x, d %08x, r %08x", s, m, d, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_BTST_DD_32(p) {
		var s = regs.d[p.Dn] & 31;
		var d = regs.d[p.Dd];
		var m = (1 << s) >>> 0;
		regs.z = (d & m) == 0;
		//SAEF_log(("I_BTST1.L s %08x == m %08x, d %08x, zero %d", s, m, d, regs.z?1:0));
		coreSyncPC();
		return p.cyc;
	}
	function I_BTST_DE_8(p) {
		var s = regs.d[p.Dn] & 7;
		var d = ldEA8tab[p.ea]();
		var m = 1 << s;
		regs.z = (d & m) == 0;
		//SAEF_log(("I_BTST1.B s %08x == m %08x, d %08x, zero %d", s, m, d, regs.z?1:0));
		coreSyncPC();
		return p.cyc;
	}
	function I_BTST_ID_32(p) {
		var s = coreNext16() & 31;
		var d = regs.d[p.Dd];
		var m = (1 << s) >>> 0;
		regs.z = (d & m) == 0;
		//SAEF_log(("I_BTST2.L s %08x == m %08x, d %08x, zero %d", s, m, d, regs.z?1:0));
		coreSyncPC();
		return p.cyc;
	}
	function I_BTST_IE_8(p) {
		var s = coreNext16() & 7;
		var d = ldEA8tab[p.ea]();
		var m = 1 << s;
		regs.z = (d & m) == 0;
		//SAEF_log(("I_BTST2.B s %08x == m %08x, d %08x, zero %d", s, m, d, regs.z?1:0));
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Bitfield >= 68020 (ported from WinUAE) */

	function I_BFXXX(p) {
		var ext = coreNext16();
		var offset = (ext & 0x800) ?  regs.d[(ext >> 6) & 7] : (ext >> 6) & 0x1f;
		var width = (ext & 0x20) ? regs.d[ext & 7] & 0x1f : ext & 0x1f; if (width == 0) width = 32;
		var tmp, bdata = [0,0];

		if (p.ea >> 3 == 0) {
			tmp = regs.d[p.ea & 7];
			offset &= 0x1f;
			tmp = ((tmp << offset) | (tmp >>> (32 - offset))) >>> 0;
			bdata[0] = (tmp & ((1 << (32 - width)) - 1)) >>> 0;
		} else {
			if (offset & 0x80000000) offset -= 0x100000000;
			addr = exEAtab[p.ea](1);
			if (offset) addr += Math.truncate(offset / 8);
			var bf = getBitfield(addr, Math.abs(offset), width);
			tmp = bf[0];
			bdata = bf[1];
		}

		regs.n = (tmp & 0x80000000) != 0;
		if (p.id == ID_BFEXTS)
			tmp >>= (32 - width); /* having fun with javascript signed-shift feature */
		else
			tmp >>>= (32 - width);

		regs.z = tmp == 0;
		regs.v = false;
		regs.c = false;

		switch (p.id) {
			case ID_BFTST:
				break;
			case ID_BFEXTU:
			case ID_BFEXTS:
				regs.d[(ext >> 12) & 7] = tmp;
				break;
			case ID_BFCHG:
				tmp = (tmp ^ (0xffffffff >>> (32 - width))) >>> 0;
				break;
			case ID_BFCLR:
				tmp = 0;
				break;
			case ID_BFFFO: {
				var mask = (1 << (width - 1)) >>> 0;
				while (mask) { if (tmp & mask) break; mask >>>= 1; offset++; }}
				if (offset < 0) offset += 0x100000000;
				regs.d[(ext >> 12) & 7] = offset;
				break;
			case ID_BFSET:
				tmp = 0xffffffff >>> (32 - width);
				break;
			case ID_BFINS:
				tmp = regs.d[(ext >> 12) & 7] & (0xffffffff >>> (32 - width));
				regs.n = (tmp & (1 << (width - 1))) != 0;
				regs.z = tmp == 0;
				break;
		}
		if (p.id == ID_BFCHG || p.id == ID_BFCLR || p.id == ID_BFSET || p.id == ID_BFINS) {
			if (p.ea >> 3 == 0) {
				tmp = bdata[0] | (tmp << (32 - width));
				regs.d[p.ea & 7] = (tmp >>> offset) | (tmp << (32 - offset));
			} else {
				putBitfield(addr, Math.abs(offset), width, bdata, tmp);
			}
		}
		/*if (p.ea >> 3 == 0)
			SAEF_log(("I_%s at D%d Do %d Dw %d {%d:%d} | s %08x data %08x:%08x | N=%d Z=%d", bfName(p.id), p.ea&7, (ext & 0x800)?1:0,(ext & 0x20)?1:0, offset,width, tmp,bdata[0],bdata[1], regs.n?1:0, regs.z?1:0));
		else
			SAEF_log(("I_%s at %08x Do %d Dw %d {%d:%d} | s %08x data %08x:%08x | N=%d Z=%d", bfName(p.id), addr, (ext & 0x800)?1:0,(ext & 0x20)?1:0, offset,width, tmp,bdata[0],bdata[1], regs.n?1:0, regs.z?1:0));
		*/
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Binary-Coded Decimal */

	function I_ABCD_D(p) {
		var s = regs.d[p.Ry] & 0xff;
		var d = regs.d[p.Rx] & 0xff;
		var lo = (s & 0x0f) + (d & 0x0f) + (regs.x?1:0);
		var hi = (s & 0xf0) + (d & 0xf0);
		var r = hi + lo;
		if (lo > 9) r += 6;
		if ((r & 0x3f0) > 0x90) {
			r = (r + 0x60) & 0xff;
			regs.x = regs.c = true;
		} else regs.x = regs.c = false;
		if (r) regs.z = false;
		//n,v undef
		regs.d[p.Rx] = (regs.d[p.Rx] & 0xffffff00) | r;
		//SAEF_log(("I_ABCD_D.B %02x + %02x = %02x carry %d", s,d,r,regs.c?1:0));
		coreSyncPC();
		return p.cyc;
	}
	function I_ABCD_A(p) {
		regs.a[p.Ry] -= aIncDec[1][p.Ry]; var s = coreGet8(regs.a[p.Ry]);
		regs.a[p.Rx] -= aIncDec[1][p.Rx]; var d = coreGet8(regs.a[p.Rx]);
		var lo = (s & 0x0f) + (d & 0x0f) + (regs.x?1:0);
		var hi = (s & 0xf0) + (d & 0xf0);
		var r = hi + lo;
		if (lo > 9) r += 6;
		if ((r & 0x3f0) > 0x90) {
			r = (r + 0x60) & 0xff;
			regs.x = regs.c = true;
		} else regs.x = regs.c = false;
		if (r) regs.z = false;
		//n,v undef
		corePut8(regs.a[p.Rx], r);
		//SAEF_log(("I_ABCD_A.B %02x + %02x = %02x carry %d", s,d,r,regs.c?1:0));
		coreSyncPC();
		return p.cyc;
	}

	function I_SBCD_D(p) {
		var s = regs.d[p.Rx] & 0xff;
		var d = regs.d[p.Ry] & 0xff;
		var lo = (d & 0x0f) - (s & 0x0f) - (regs.x?1:0);
		var hi = (d & 0xf0) - (s & 0xf0);
		var r = hi + lo, bcd = 0;
		if (lo & 0xf0) { r -= 6; bcd = 6; };
		if ((((d & 0xff) - (s & 0xff) - (regs.x?1:0)) & 0x100) > 0xff) r = (r - 0x60) & 0xff;
		regs.x = regs.c = (((d & 0xff) - (s & 0xff) - bcd - (regs.x?1:0)) & 0x300) > 0xff;
		if (r) regs.z = false;
		//n,v undef
		regs.d[p.Ry] = (regs.d[p.Ry] & 0xffffff00) | r;
		//SAEF_log(("I_SBCD_D.B %02x - %02x = %02x carry %d", d,s,r,regs.c?1:0));
		coreSyncPC();
		return p.cyc;
	}
	function I_SBCD_A(p) {
		regs.a[p.Rx] -= aIncDec[1][p.Rx]; var s = coreGet8(regs.a[p.Rx]);
		regs.a[p.Ry] -= aIncDec[1][p.Ry]; var d = coreGet8(regs.a[p.Ry]);
		var lo = (d & 0x0f) - (s & 0x0f) - (regs.x?1:0);
		var hi = (d & 0xf0) - (s & 0xf0);
		var r = hi + lo, bcd = 0;
		if (lo & 0xf0) { r -= 6; bcd = 6; };
		if ((((d & 0xff) - (s & 0xff) - (regs.x?1:0)) & 0x100) > 0xff) r = (r - 0x60) & 0xff;
		regs.x = regs.c = (((d & 0xff) - (s & 0xff) - bcd - (regs.x?1:0)) & 0x300) > 0xff;
		if (r) regs.z = false;
		//n,v undef
		corePut8(regs.a[p.Ry], r);
		//SAEF_log(("I_SBCD_A.B %02x - %02x = %02x carry %d", d,s,r,regs.c?1:0));
		coreSyncPC();
		return p.cyc;
	}

	function I_NBCD_D(p) {
		var d = regs.d[p.Dd] & 0xff;
		var lo = -(d & 0x0f) - (regs.x?1:0);
		var hi = -(d & 0xf0);
		if (lo > 9) { lo -= 6; }
		var r = hi + lo;
		if ((r & 0x1f0) > 0x90) {
			r = (r - 0x60) & 0xff;
			regs.x = regs.c = true;
		} else regs.x = regs.c = false;
		if (r) regs.z = false;
		//n,v undef
		regs.d[p.Dd] = (regs.d[p.Dd] & 0xffffff00) | r;
		//SAEF_log(("I_NBCD_D.B 0 - %02x = %02x carry %d", d,r,regs.c?1:0));
		coreSyncPC();
		return p.cyc;
	}
	function I_NBCD_E(p) {
		var a = exEAtab[p.ea](1);
		var d = coreGet8(a);
		var lo = -(d & 0x0f) - (regs.x?1:0);
		var hi = -(d & 0xf0);
		if (lo > 9) { lo -= 6; }
		var r = hi + lo;
		if ((r & 0x1f0) > 0x90) {
			r = (r - 0x60) & 0xff;
			regs.x = regs.c = true;
		} else regs.x = regs.c = false;
		if (r) regs.z = false;
		//n,v undef
		corePut8(a, r);
		//SAEF_log(("I_NBCD_E.B 0 - %02x = %02x carry %d", d,r,regs.c?1:0));
		coreSyncPC();
		return p.cyc;
	}

	function I_PACK_D(p) { /* >= 68020 */
		var adj = coreNext16();
		var s = (regs.d[p.Rx] & 0xffff) + adj; if (s > 0xffff) s -= 0x10000;
		var d = ((s >> 4) & 0xf0) | (s & 0xf);
		regs.d[p.Ry] = (regs.d[p.Ry] & 0xffffff00) | d;
		//SAEF_log(("I_PACK D%d,D%d,#%04x | %04x -> %02x", p.Rx,p.Ry,adj, s,d));
		//ccna
		coreSyncPC();
		return p.cyc;
	}
	function I_PACK_A(p) { /* >= 68020 */
		var adj = coreNext16();
		regs.a[p.Rx] -= aIncDec[1][p.Rx]; var s_hi = coreGet8(regs.a[p.Rx]);
		regs.a[p.Rx] -= aIncDec[1][p.Rx]; var s_lo = coreGet8(regs.a[p.Rx]);
		var s = (((s_hi & 0xf) << 8) | (s_lo & 0xf)) + adj; if (s > 0xffff) s -= 0x10000;
		var d = (((s >> 4) & 0xf0) | (s & 0xf));
		regs.a[p.Ry] -= aIncDec[1][p.Ry]; corePut8(regs.a[p.Ry], d);
		//SAEF_log(("I_PACK -(A%d),-(A%d),#%04x | %04x -> %02x", p.Rx,p.Ry,adj, s,d));
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	function I_UNPK_D(p) { /* >= 68020 */
		var adj = coreNext16();
		var s = regs.d[p.Rx] & 0xffff;
		var d = (((s << 4) & 0xf00) | (s & 0xf)) + adj; if (d > 0xffff) d -= 0x10000;
		regs.d[p.Ry] = (regs.d[p.Ry] & 0xffff0000) | d;
		//SAEF_log(("I_UNPK D%d,D%d,#%04x | %02x -> %04x", p.Rx,p.Ry,adj, s&0xff,d));
		//ccna
		coreSyncPC();
		return p.cyc;
	}
	function I_UNPK_A(p) { /* >= 68020 */
		var adj = coreNext16();
		regs.a[p.Rx] -= aIncDec[1][p.Rx]; var s = coreGet8(regs.a[p.Rx]);
		var d = (((s << 4) & 0xf00) | (s & 0xf)) + adj; if (d > 0xffff) d -= 0x10000;
		regs.a[p.Ry] -= aIncDec[1][p.Ry]; corePut8(regs.a[p.Ry], d >> 8);
		regs.a[p.Ry] -= aIncDec[1][p.Ry]; corePut8(regs.a[p.Ry], d & 0xff);
		//SAEF_log(("I_UNPK -(A%d),-(A%d),#%04x | %02x -> %04x", p.Rx,p.Ry,adj, s,d));
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Program Control */

	function I_Bcc(p) {
		var pc = coreGetPC();
		var dp;

		if (p.dp == 0) dp = coreNext16();
		else if (p.dp == 255) dp = coreNext32(); /* 68020 only*/

		if (ccTab[p.cc]()) {
			if (p.dp == 0) pc = add32(pc, extWord(dp));
			else if (p.dp == 255) pc = add32(pc, dp);
			else pc = add32(pc, extByte(p.dp));
			//SAEF_log(("I_Bcc pc $%08x", pc));
			if (pc & 1) return coreException3i(p.op, pc);
			coreSetPC(pc);
			return p.cycTaken;
		}
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	function I_DBcc(p) {
		var pc = coreGetPC();
		var dp = coreNext16();
		var cyc;

		if (!ccTab[p.cc]()) {
			var dr = (regs.d[p.Dn] & 0xffff) - 1; if (dr < 0) dr += 0x10000;
			regs.d[p.Dn] = (regs.d[p.Dn] & 0xffff0000) | dr;

			if (dr != 0xffff) {
				pc = add32(pc, extWord(dp));
				if (pc & 1) return coreException3i(p.op, pc);
				coreSetPC(pc);
				return p.cyc;
			}
			cyc = p.cycNotTakenFalse;
		} else cyc = p.cycNotTakenTrue;
		//ccna
		coreSyncPC();
		return cyc;
	}

	function I_Scc(p) {
		var rdd = (p.ea >> 3) == 0;
		var isTrue = ccTab[p.cc]();

		if (rdd) {
			var Dn = p.ea & 7;
			regs.d[Dn] = (regs.d[Dn] & 0xffffff00) | (isTrue ? 0xff : 0x00);
		} else {
			var a = exEAtab[p.ea](1);
			/* page 4-173: In the MC68000 and MC68008 a memory location is read before it is cleared. */
			if (model < 68020) {
				var foo = coreGet8(a);
			}
			corePut8(a, isTrue ? 0xff : 0x00);
		}
		//ccna
		//SAEF_log(("I_S%s, cc %d, ccTrue %d", ccNames[p.cc], p.cc, isTrue?1:0));
		coreSyncPC();
		return isTrue ? (rdd ? p.cycTrue : p.cyc) : (rdd ? p.cycFalse : p.cyc);
	}

	function I_BRA(p) {
		var dp, pc = coreGetPC();

		if (p.dp == 0) dp = extWord(coreNext16());
		else if (p.dp == 255) dp = coreNext32(); /* 68020 only */
		else dp = extByte(p.dp);
		pc = add32(pc, dp);
		if (pc & 1) return coreException3i(p.op, pc);
		coreSetPC(pc);
		//ccna
		return p.cyc;
	}

	function I_BSR(p) {
		var dp, pc = coreGetPC();

		if (p.dp == 0) dp = extWord(coreNext16());
		else if (p.dp == 255) dp = coreNext32(); /* 68020 only */
		else dp = extByte(p.dp);
		pc = add32(pc, dp);
		if (pc & 1) return coreException3i(p.op, pc);
		//SAEF_log(("I_BSR $%08x -> $%08x", coreGetPC(), pc));
		stackPut32(coreGetPC());
		coreSetPC(pc);
		//ccna
		return p.cyc;
	}

	function I_JMP(p) {
		var pc = exEAtab[p.ea](4);
		if (pc & 1) return coreException3i(p.op, pc);
		coreSetPC(pc);
		//ccna
		//SAEF_log(("I_JMP $%08x", pc));
		return p.cyc;
	}

	function I_JSR(p) {
		var pc = exEAtab[p.ea](4);
		if (pc & 1) return coreException3i(p.op, pc);
		stackPut32(coreGetPC());
		coreSetPC(pc);
		//ccna
		//SAEF_log(("I_JSR $%08x", pc));
		return p.cyc;
	}

	function I_NOP(p) {
		//SAEF_log("I_NOP");
		coreSyncPC();
		return p.cyc;
	}

	function I_RTD(p) { /* >= 68010 */
		var pc = stackGet32();
		var dp = coreNext16();

		pc = add32(pc, extWord(dp));
		//SAEF_log(("I_RTD oldpc $%08x newpc $%08x dp %d", regs.pc, pc, castWord(dp)));
		if (pc & 1) return coreException3i(p.op, pc);
		coreSetPC(pc);
		//ccna
		return p.cyc;
	}

	function I_RTR(p) {
		var ccr = stackGet16() & 0xff;
		var pc = stackGet32();
		coreSetCCR(ccr);
		//SAEF_log(("I_RTR crr $%04x pc $%08x", crr, pc));
		if (pc & 1) return coreException3i(p.op, pc);
		coreSetPC(pc);
		return p.cyc;
	}

	function I_RTS(p) {
		var pc = stackGet32();
		//SAEF_log("I_RTS regs.pc $%08x newpc $%08x", regs.pc, pc);
		if (pc & 1) return coreException3i(p.op, pc);
		coreSetPC(pc);
		//ccna
		return p.cyc;
	}

	function I_TST_8(p) {
		var r = ldEA8tab[p.ea]();
		flgLogical(r, p.zm);
		//SAEF_log(("I_TST.B r $%08x", r));
		coreSyncPC();
		return p.cyc;
	}
	function I_TST_16(p) {
		var r = ldEA16tab[p.ea]();
		flgLogical(r, p.zm);
		//SAEF_log(("I_TST.W r $%08x", r));
		coreSyncPC();
		return p.cyc;
	}
	function I_TST_32(p) {
		var r = ldEA32tab[p.ea]();
		flgLogical(r, p.zm);
		//SAEF_log(("I_TST.L r $%08x", r));
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* System Control - CCR */

	function I_ANDI_CCR(p) {
		var s = coreNext16() & 0xff;
		var d = coreGetCCR();
		var r = s & d;
		coreSetCCR(r);
		//SAEF_log(("I_ANDI_CCR.B val $%02x, old $%02x new $%02x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_EORI_CCR(p) {
		var s = coreNext16() & 0xff;
		var d = coreGetCCR();
		var r = s ^ d;
		coreSetCCR(r);
		//SAEF_log(("I_EORI_CCR.B val $%02x, old $%02x new $%02x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_ORI_CCR(p) {
		var s = coreNext16() & 0xff;
		var d = coreGetCCR();
		var r = s | d;
		coreSetCCR(r);
		//SAEF_log(("I_ORI_CCR.B val $%02x, old $%02x new $%02x", s, d, r));
		coreSyncPC();
		return p.cyc;
	}

	function I_MOVE_2CCR(p) {
		var ccr = ldEA16tab[p.ea]() & 0xff;
		//SAEF_log(("I_MOVE_2CCR.W old $%02x new $%02x", coreGetCCR(), ccr));
		coreSyncPC();
		coreSetCCR(ccr);
		return p.cyc;
	}

	function I_MOVE_CCR2(p) { /* >= 68010 */
		var ccr = coreGetCCR();
		stEA16tab[p.ea](ccr);
		//SAEF_log(("I_MOVE_CCR2.W $%02x", ccr));
		coreSyncPC();
		//ccna
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* System Control - SR */

	function I_ANDI_SR(p) {
		if (regs.s) {
			var s = coreNext16();
			var d = coreGetSR();
			var r = s & d;
			//SAEF_log(("I_ANDI_SR.W val $%04x, old $%04x new $%04x", s, d, r));
			coreSetSR(r);
			coreSyncPC();
			//ccna
			return p.cyc;
		} else {
			//SAEF_log("I_ANDI_SR PRIVILIG VIOLATION");
			//coreClrPC();
			return coreException(8);
		}
	}

	function I_EORI_SR(p) {
		if (regs.s) {
			var s = coreNext16();
			var d = coreGetSR();
			var r = s ^ d;
			//SAEF_log(("I_EORI_SR.W val $%04x, old $%04x new $%04x", s, d, r));
			coreSetSR(r);
			coreSyncPC();
			//ccna
			return p.cyc;
		} else {
			//SAEF_log("I_EORI_SR PRIVILIG VIOLATION");
			//coreClrPC();
			return coreException(8);
		}
	}

	function I_ORI_SR(p) {
		if (regs.s) {
			var s = coreNext16();
			var d = coreGetSR();
			var r = s | d;
			//SAEF_log(("I_ORI_SR.W val $%04x, old $%04x new $%04x", s, d, r));
			coreSetSR(r);
			coreSyncPC();
			//ccna
			return p.cyc;
		} else {
			//SAEF_log("I_ORI_SR PRIVILIG VIOLATION");
			//coreClrPC();
			return coreException(8);
		}
	}

	function I_MOVE_2SR(p) {
		if (regs.s) {
			var sr = ldEA16tab[p.ea]();
			//SAEF_log(("I_MOVE_2SR.W sr $%04x", sr));
			coreSetSR(sr);
			coreSyncPC();
			//ccna
			return p.cyc;
		} else {
			//SAEF_log("I_MOVE_2SR PRIVILIG VIOLATION");
			//coreClrPC();
			return coreException(8);
		}
	}
	function I_MOVE_SR2(p) {
		if (regs.s || model == 68000) { /* This instruction is not privileged for the MC68000 and MC68008 */
			var sr = coreGetSR();
			//SAEF_log(("I_MOVE_SR2.W sr $%04x", sr));
			stEA16tab[p.ea](sr);
			coreSyncPC();
			//ccna
			return p.cyc;
		} else {
			//SAEF_log("I_MOVE_2SR PRIVILIG VIOLATION");
			//coreClrPC();
			return coreException(8);
		}
	}

	/*-----------------------------------------------------------------------*/
	/* System Control - USP */

	function I_MOVE_USP2A(p) {
		if (regs.s) {
			//SAEF_log(("I_MOVE_USP2A.L usp $%08x", regs.usp));
			regs.a[p.An] = regs.usp;
			coreSyncPC();
			return p.cyc;
		} else {
			//SAEF_log("I_MOVE_USP PRIVILIG VIOLATION");
			//coreClrPC();
			return coreException(8);
		}
	}

	function I_MOVE_A2USP(p) {
		if (regs.s) {
			regs.usp = regs.a[p.An];
			//SAEF_log(("I_MOVE_A2USP.L usp $%08x", regs.usp));
			coreSyncPC();
			return p.cyc;
		} else {
			//SAEF_log("I_MOVE_USP PRIVILIG VIOLATION");
			//coreClrPC();
			return coreException(8);
		}
	}

	/*-----------------------------------------------------------------------*/
	/* System Control - MOVEC */

	function I_MOVE_2C(p) { /* >= 68010 */
		var ext = coreNext16();
		if (regs.s) {
			var cr = ext & 0xfff;

			if (movecValid(cr)) {
				if (ext & 0x8000)
					var data = regs.a[(ext >> 12) & 7];
				else
					var data = regs.d[(ext >> 12) & 7];

				movec2C(cr, data);
				//SAEF_log("I_MOVE_2C.L %s%d,%s [%08x]", (ext&0x8000)?"A":"D",(ext>>12)&7, movecRegName(cr), data);

				coreSyncPC();
				//ccna
				return p.cyc;
			} else {
				//coreSyncPC();
				return coreIllegal(p.op);
			}
		} else {
			//SAEF_log("I_MOVE_2C PRIVILIG VIOLATION");
			//coreClrPC();
			return coreException(8);
		}
	}

	function I_MOVE_C2(p) { /* >= 68010 */
		var ext = coreNext16();
		if (regs.s) {
			var cr = ext & 0xfff;

			if (movecValid(cr)) {
				var data = movecC2(cr);
				//SAEF_log("I_MOVE_C2.L %s,%s%d [%08x]", movecRegName(cr), (ext&0x8000)?"A":"D", (ext>>12)&7, data);

				if (ext & 0x8000)
					regs.a[(ext >> 12) & 7] = data;
				else
					regs.d[(ext >> 12) & 7] = data;

				coreSyncPC();
				//ccna
				return p.cyc;
			} else {
				//coreSyncPC();
				return coreIllegal(p.op);
			}
		} else {
			//SAEF_log("I_MOVE_C2 PRIVILIG VIOLATION");
			//coreClrPC();
			return coreException(8);
		}
	}

	/*-----------------------------------------------------------------------*/
	/* System Control - MOVES, ignore the registers SFC/DFC for now */

	function I_MOVES_32(p) { /* >= 68010 */
		if (regs.s) {
			var args = coreNext16();
			//SAEF_log(("I_MOVES.L %04x", args));
			if (args & 0x800) {
				var s = (args & 0x8000) ? regs.a[(args >> 12) & 7] : regs.d[(args >> 12) & 7];
				stEA32tab[p.ea](s);
			} else {
				if (args & 0x8000) regs.a[(args >> 12) & 7] = ldEA32tab[p.ea]();
				else regs.d[(args >> 12) & 7] = ldEA32tab[p.ea]();
			}
			//ccna
			coreSyncPC();
			return p.cyc;
		} else {
			//SAEF_log("I_MOVES PRIVILIG VIOLATION");
			//coreClrPC();
			return coreException(8);
		}
	}
	function I_MOVES_16(p) { /* >= 68010 */
		if (regs.s) {
			var args = coreNext16();
			//SAEF_log(("I_MOVES.W %04x", args));
			if (args & 0x800) {
				var s = (args & 0x8000) ? regs.a[(args >> 12) & 7] : regs.d[(args >> 12) & 7];
				stEA16tab[p.ea](s & 0xffff);
			} else {
				var s = ldEA16tab[p.ea]();
				if (args & 0x8000)
					regs.a[(args >> 12) & 7] = extWord(s);
				else
					regs.d[(args >> 12) & 7] = (regs.d[(args >> 12) & 7] & 0xffff0000) | s;
			}
			//ccna
			coreSyncPC();
			return p.cyc;
		} else {
			//SAEF_log("I_MOVES PRIVILIG VIOLATION");
			//coreClrPC();
			return coreException(8);
		}
	}
	function I_MOVES_8(p) { /* >= 68010 */
		if (regs.s) {
			var args = coreNext16();
			//SAEF_log(("I_MOVES.B %04x", args));
			if (args & 0x800) {
				var s = (args & 0x8000) ? regs.a[(args >> 12) & 7] : regs.d[(args >> 12) & 7];
				stEA8tab[p.ea](s & 0xff);
			} else {
				var s = ldEA8tab[p.ea]();
				if (args & 0x8000)
					regs.a[(args >> 12) & 7] = extByte(s);
				else
					regs.d[(args >> 12) & 7] = (regs.d[(args >> 12) & 7] & 0xffffff00) | s;
			}
			//ccna
			coreSyncPC();
			return p.cyc;
		} else {
			//SAEF_log("I_MOVES PRIVILIG VIOLATION");
			//coreClrPC();
			return coreException(8);
		}
	}

	/*-----------------------------------------------------------------------*/
	/* System Control */

	function I_BKPT(p) { /* >= 68010, FIX not implemented */
		//SAEF_log(("I_BKPT vec %d", p.v));
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	function I_CHK_16(p) {
		var s = castWord(ldEA16tab[p.ea]());
		var d = castWord(regs.d[p.Dn] & 0xffff);

		if (d < 0) {
			//SAEF_log(("I_CHK.W YES (%d < 0)", d));
			regs.n = true;
			//coreSyncPC();
			return coreException(6);
		}
		else if (d > s) {
			//SAEF_log(("I_CHK.W YES (%d > %d)", d, s));
			regs.n = false;
			//coreSyncPC();
			return coreException(6);
		}
		//else n undef
		//z v c undef
		//SAEF_log(("I_CHK.W no (%d >= 0 && %d < %d)", d, d, s));
		coreSyncPC();
		return p.cyc;
	}
	function I_CHK_32(p) {
		var s = castLong(ldEA32tab[p.ea]());
		var d = castLong(regs.d[p.Dn]);

		if (d < 0) {
			//SAEF_log(("I_CHK.L YES (%d < 0)", d));
			regs.n = true;
			//coreSyncPC();
			return coreException(6);
		}
		else if (d > s) {
			//SAEF_log(("I_CHK.L YES (%d > %d)", d, s));
			regs.n = false;
			//coreSyncPC();
			return coreException(6);
		}
		//else n undef
		//z v c undef
		//SAEF_log(("I_CHK.L no (%d >= 0 && %d < %d)", d, d, s));
		coreSyncPC();
		return p.cyc;
	}

	function I_CHK2_32(p) { /* >= 68020 */
		var ext = coreNext16();
		var a = exEAtab[p.ea](4);
		var lb = coreGet32(a);
		var ub = coreGet32(a + 4);
		var Rn;
		if (ext & 0x8000)
			Rn = regs.a[(ext >> 12) & 7];
		else {
			Rn = castLong(regs.d[(ext >> 12) & 7]);
			lb = castLong(lb); ub = castLong(ub);
		}
		regs.z = ub == Rn || lb == Rn;
		regs.c = lb <= ub ? Rn < lb || Rn > ub : Rn < ub || Rn > lb; // Rn > ub || Rn < lb;
		//n v undef
		//SAEF_log("I_%s2.L (%d < %d || %d > %d) -> %s", (ext&0x800)?"CHK":"CMP", Rn, lb<=ub?lb:ub, Rn, lb<=ub?ub:lb, regs.c?"true":"false");
		if ((ext & 0x800) && regs.c) {
			//coreSyncPC();
			return coreException(6);
		}
		coreSyncPC();
		return p.cyc;
	}
	function I_CHK2_16(p) { /* >= 68020 */
		var ext = coreNext16();
		var a = exEAtab[p.ea](2);
		var lb = coreGet16(a);
		var ub = coreGet16(a + 2);
		var Rn;
		if (ext & 0x8000) {
			Rn = extWord(regs.a[(ext >> 12) & 7] & 0xffff);
			lb = extWord(lb); ub = extWord(ub);
		} else {
			Rn = castWord(regs.d[(ext >> 12) & 7] & 0xffff);
			lb = castWord(lb); ub = castWord(ub);
		}
		regs.z = ub == Rn || lb == Rn;
		regs.c = lb <= ub ? Rn < lb || Rn > ub : Rn < ub || Rn > lb; // Rn > ub || Rn < lb;
		//n v undef
		//SAEF_log("I_%s2.W (%d < %d || %d > %d) -> %s", (ext&0x800)?"CHK":"CMP", Rn, lb<=ub?lb:ub, Rn, lb<=ub?ub:lb, regs.c?"true":"false");
		if ((ext & 0x800) && regs.c) {
			//coreSyncPC();
			return coreException(6);
		}
		coreSyncPC();
		return p.cyc;
	}
	function I_CHK2_8(p) { /* >= 68020 */
		var ext = coreNext16();
		var a = exEAtab[p.ea](1);
		var lb = coreGet8(a);
		var ub = coreGet8(a + 1);
		var Rn;
		if (ext & 0x8000) {
			Rn = extByte(regs.a[(ext >> 12) & 7] & 0xff);
			lb = extByte(lb); ub = extByte(ub);
		} else {
			Rn = castByte(regs.d[(ext >> 12) & 7] & 0xff);
			lb = castByte(lb); ub = castByte(ub);
		}
		regs.z = ub == Rn || lb == Rn;
		regs.c = lb <= ub ? Rn < lb || Rn > ub : Rn < ub || Rn > lb; // Rn > ub || Rn < lb;
		//n v undef
		//SAEF_log("I_%s2.B (%d < %d || %d > %d) -> %s", (ext&0x800)?"CHK":"CMP", Rn, lb<=ub?lb:ub, Rn, lb<=ub?ub:lb, regs.c?"true":"false");
		if ((ext & 0x800) && regs.c) {
			//coreSyncPC();
			return coreException(6);
		}
		coreSyncPC();
		return p.cyc;
	}

	function I_ILLEGAL(p) {
		//SAEF_log("I_ILLEGAL op $%04x, pc $%08x", p.op, regs.instruction_pc);
		//coreSyncPC();
		return coreIllegal(p.op);
	}

	function I_RESET(p) {
		if (regs.s) {
			SAEF_log("I_RESET pc $%08x", regs.instruction_pc);
			coreReset();
			coreSyncPC();
			return p.cyc;
		} else {
			//SAEF_log("I_RESET PRIVILIG VIOLATION");
			//coreClrPC();
			return coreException(8);
		}
	}

	function I_RTE(p) {
		if (regs.s) {
			var sr = stackGet16();
			var pc = stackGet32();

			if (model == 68000) {
				//SAEF_log("I_RTE000 sr $%04x newpc $%08x oldpc $%08x", sr, pc, regs.pc);
			} else {
				var fmt = stackGet16();
				var frame = fmt >> 12;
				var offset = 0; //8

				//if (frame > 1) SAEF_log("I_RTE010 fmt %04x frame %x sr $%04x newpc $%08x oldpc $%08x", fmt, frame, sr, pc, regs.pc);

					  if (frame == 0x0) {}//regs.a[7] += offset;
				else if (frame == 0x1) {}//regs.a[7] += offset;
				else if (frame == 0x2) regs.a[7] += offset + 4;
				else if (frame == 0x4) regs.a[7] += offset + 8;
				else if (frame == 0x8) regs.a[7] += offset + 50;
				else if (frame == 0x9) regs.a[7] += offset + 12;
				else if (frame == 0xa) regs.a[7] += offset + 24;
				else if (frame == 0xb) regs.a[7] += offset + 84;
				else 						{ regs.a[7] += offset;
					//coreSyncPC();
					return coreException(14);
				}
			}
			coreSetSR(sr);
			if (pc & 1) return coreException3i(p.op, pc);
			coreSetPC(pc);
			return p.cyc;
		} else {
			//SAEF_log("I_RTE PRIVILEG VIOLATION");
			//coreClrPC();
			return coreException(8);
		}
	}

	function I_STOP(p) {
		if (regs.s) {
			var sr = coreNext16();
			coreSetSR(sr);
			coreStop();
			//SAEF_log("I_STOP new sr $%04x", sr);
			coreSyncPC();
			return p.cyc;
		} else {
			//coreClrPC();
			return coreException(8);
		}
	}

	function I_TRAP(p) {
		//SAEF_log(("I_TRAP coreException 32 + %d", p.v));
		//ccna
		//coreSyncPC();
		return coreException(32 + p.v);
	}

	function I_TRAPCC(p) { /* 68020 */
		if (ccTab[p.cc]()) {
			//SAEF_log(("I_TRAP%s coreException 7 -> take", ccNames(p.cc)));
			stackPut32(coreGetPC());
			//coreSyncPC();
			return coreException(7);
		} //else SAEF_log(("I_TRAP%s coreException 7 -> abort", ccNames(p.cc)));
		//ccna
		coreSyncPC();
		return p.cyc;
	}
	function I_TRAPCC_16(p) { /* 68020 */
		var entry = coreNext16();
		if (ccTab[p.cc]()) {
			//SAEF_log(("I_TRAP%s.W coreException 7 -> take", ccNames(p.cc)));
			stackPut32(coreGetPC());
			//coreSyncPC();
			return coreException(7);
		} //else SAEF_log(("I_TRAP%s.W coreException 7 -> abort", ccNames(p.cc)));
		//ccna
		coreSyncPC();
		return p.cyc;
	}
	function I_TRAPCC_32(p) { /* 68020 */
		var entry = coreNext32();
		if (ccTab[p.cc]()) {
			//SAEF_log(("I_TRAP%s.L coreException 7 -> take", ccNames(p.cc)));
			stackPut32(coreGetPC());
			//coreSyncPC();
			return coreException(7);
		} //else SAEF_log(("I_TRAP%s.L coreException 7 -> abort", ccNames(p.cc)));
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	function I_TRAPV(p) {
		if (regs.v) {
			//SAEF_log("I_TRAPV coreException 7");
			//coreSyncPC();
			return coreException(7);
		}
		//ccna
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Multiprocessor */

	function I_CAS_32(p) { /* >= 68020 */
		var ext = coreNext16();
		var a = exEAtab[p.ea](4);
		var c = regs.d[ext & 7];
		var d = coreGet32(a);
		var r = d - c; if (r < 0) r += 0x100000000;
		flgCmp(c, d, r, 0x80000000);
		if (regs.z) corePut32(a, regs.d[(ext >> 6) & 7]);
		else regs.d[ext & 7] = d;
		//SAEF_log(("I_CAS.L %04x", ext));
		coreSyncPC();
		return p.cyc;
	}
	function I_CAS_16(p) { /* >= 68020 */
		var ext = coreNext16();
		var a = exEAtab[p.ea](2);
		var c = regs.d[ext & 7] & 0xffff;
		var d = coreGet16(a);
		var r = d - c; if (r < 0) r += 0x10000;
		flgCmp(c, d, r, 0x8000);
		if (regs.z) corePut16(a, regs.d[(ext >> 6) & 7] & 0xffff);
		else regs.d[ext & 7] = (regs.d[ext & 7] & 0xffff0000) | d;
		//SAEF_log(("I_CAS.W %04x", ext));
		coreSyncPC();
		return p.cyc;
	}
	function I_CAS_8(p) { /* >= 68020 */
		var ext = coreNext16();
		var a = exEAtab[p.ea](1);
		var c = regs.d[ext & 7] & 0xff;
		var d = coreGet8(a);
		var r = d - c; if (r < 0) r += 0x100;
		flgCmp(c, d, r, 0x80);
		if (regs.z) corePut8(a, regs.d[(ext >> 6) & 7] & 0xff);
		else regs.d[ext & 7] = (regs.d[ext & 7] & 0xffffff00) | d;
		//SAEF_log(("I_CAS.B %04x", ext));
		coreSyncPC();
		return p.cyc;
	}

	function I_CAS2_32(p) { /* >= 68020 */
		var ext1 = coreNext16();
		var ext2 = coreNext16();
		var Rn1 = (ext1 >> 12) & 7;
		var Rn2 = (ext2 >> 12) & 7;
		var Du1 = (ext1 >> 6) & 7;
		var Du2 = (ext2 >> 6) & 7;
		var Dc1 = ext1 & 7;
		var Dc2 = ext2 & 7;
		var c1 = regs.d[Dc1];
		var c2 = regs.d[Dc2];
		var d1 = (ext1 & 0x8000) ?  coreGet32(regs.a[Rn1]) : regs.d[Rn1];
		var d2 = (ext2 & 0x8000) ?  coreGet32(regs.a[Rn2]) : regs.d[Rn2];
		var upd = false;
		var r = d1 - c1; if (r < 0) r += 0x100000000;
		flgCmp(c1, d1, r, 0x80000000);
		if (regs.z) {
			r = d2 - c2; if (r < 0) r += 0x100000000;
			flgCmp(c2, d2, r, 0x80000000);
			upd = regs.z;
		}
		if (upd) {
			if (ext1 & 0x8000) corePut32(regs.a[Rn1], regs.d[Du1]);
			else regs.d[Rn1] = regs.d[Du1];
			if (ext2 & 0x8000) corePut32(regs.a[Rn2], regs.d[Du2]);
			else regs.d[Rn2] = regs.d[Du2];
		} else {
			regs.d[Dc1] = d1;
			regs.d[Dc2] = d2;
		}
		//SAEF_log(("I_CAS2.L %04x %04x", ext1, ext2));
		coreSyncPC();
		return p.cyc;
	}
	function I_CAS2_16(p) { /* >= 68020 */
		var ext1 = coreNext16();
		var ext2 = coreNext16();
		var Rn1 = (ext1 >> 12) & 7;
		var Rn2 = (ext2 >> 12) & 7;
		var Du1 = (ext1 >> 6) & 7;
		var Du2 = (ext2 >> 6) & 7;
		var Dc1 = ext1 & 7;
		var Dc2 = ext2 & 7;
		var c1 = regs.d[Dc1] & 0xffff;
		var c2 = regs.d[Dc2] & 0xffff;
		var d1 = (ext1 & 0x8000) ?  coreGet16(regs.a[Rn1]) : regs.d[Rn1] & 0xffff;
		var d2 = (ext2 & 0x8000) ?  coreGet16(regs.a[Rn2]) : regs.d[Rn2] & 0xffff;
		var upd = false;
		var r = d1 - c1; if (r < 0) r += 0x10000;
		flgCmp(c1, d1, r, 0x8000);
		if (regs.z) {
			r = d2 - c2; if (r < 0) r += 0x10000;
			flgCmp(c2, d2, r, 0x8000);
			upd = regs.z;
		}
		if (upd) {
			if (ext1 & 0x8000) corePut16(regs.a[Rn1], regs.d[Du1] & 0xffff);
			else regs.d[Rn1] = (regs.d[Rn1] & 0xffff0000) | (regs.d[Du1] & 0xffff);
			if (ext2 & 0x8000) corePut16(regs.a[Rn2], regs.d[Du2] & 0xffff);
			else regs.d[Rn2] = (regs.d[Rn2] & 0xffff0000) | (regs.d[Du2] & 0xffff);
		} else {
			regs.d[Dc1] = (regs.d[Dc1] & 0xffff0000) | d1;
			regs.d[Dc2] = (regs.d[Dc2] & 0xffff0000) | d2;
		}
		//SAEF_log(("I_CAS2.W %04x %04x", ext1, ext2));
		coreSyncPC();
		return p.cyc;
	}

	function I_TAS(p) {
		var d = ldEA8tab[p.ea]();
		stEA8tab[p.ea](0x80 | d);
		regs.n = (d & 0x80) != 0;
		regs.z = d == 0;
		regs.v = false;
		regs.c = false;
		//SAEF_log(("I_TAS.B $%02x", d));
		coreSyncPC();
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* 68020 only */

	function I_CALLM(p) { /* FIX not implemented */
		var ext = coreNext16() & 0xff;
		SAEF_warn("I_CALLM not implemented (ext %d)", ext);
		//coreSyncPC();
		return coreIllegal(p.op);
	}

	function I_RTM(p) { /* FIX not implemented */
		SAEF_warn("I_RTM not implemented");
		//coreSyncPC();
		return coreIllegal(p.op);
	}

	/*-----------------------------------------------------------------------*/
	/* 68030 fake MMU */

	function I_MMU(p) {
		if (regs.s) {
			var pc = coreGetPC();
			var ext = coreNext16();
			var a = exEAtab[p.ea](4);

			if (mmu_op30(pc, p.op, ext, a)) {
				//coreSyncPC();
				return coreIllegal(p.op);
			}
			coreSyncPC();
			//ccna
			return p.cyc;
		} else {
			//coreClrPC();
			return coreException(8);
		}
	}

	/*-----------------------------------------------------------------------*/
	/* Coprocessor 68020/68030 */

	function I_cpBcc(p) {
		//SAEF_warn("I_cpBcc.%s not implemented, cid %d, ccc %d, pc %08x", szChr(p.z), p.cid, p.ccc, regs.instruction_pc);
		return coreIllegal(p.op);
		//ccna
		//return p.cyc;
	}
	function I_cpDBcc(p) {
		//SAEF_warn("I_cpDBcc.w not implemented, cid %d, dn %d, pc %08x", p.cid, p.dn, regs.instruction_pc);
		return coreIllegal(p.op);
		//ccna
		//return p.cyc;
	}
	function I_cpGEN(p) {
		//SAEF_warn("I_cpGEN not implemented, cid %d, ea %d(%d:%d), pc %08x", p.cid, p.ea,p.ea>>3,p.ea&7, regs.instruction_pc);
		return coreIllegal(p.op);
		//var cmd = coreNext16();
		//ccna
		//return p.cyc;
	}
	function I_cpRESTORE(p) {
		//SAEF_warn("I_cpRESTORE not implemented, cid %d, pc %08x", p.cid, regs.instruction_pc);
		return coreIllegal(p.op);
		if (regs.s) {
			//var data = ldEA32tab[p.ea]();
			//ccna
			//return p.cyc;
		} else {
			//coreClrPC();
			return coreException(8);
		}
	}
	function I_cpSAVE(p) {
		//SAEF_warn("I_cpSAVE not implemented, cid %d, pc %08x", p.cid, regs.instruction_pc);
		return coreIllegal(p.op);
		if (regs.s) {
			//var data = 12345;
			//stEA32tab[p.ea](data);
			//ccna
			//return p.cyc;
		} else {
			//coreClrPC();
			return coreException(8);
		}
	}
	function I_cpScc(p) {
		//SAEF_warn("I_cpScc not implemented, cid %d, pc %08x", p.cid, regs.instruction_pc);
		return coreIllegal(p.op);
		//var data = ldEA32tab[p.ea]();
		//ccna
		//return p.cyc;
	}
	function I_cpTRAPcc(p) {
		//SAEF_warn("I_cpTRAPcc not implemented, cid %d, opm %d, pc %08x", p.cid, p.opm, regs.instruction_pc);
		return coreIllegal(p.op);
		//var ext coreNext16();
		//var ext2 = p.opm == 2 ? coreNext16() : (p.opm == 3 ? coreNext32() : 0);
		//ccna
		//return p.cyc;
	}
	/*function I_cpXXX(p) {
		//var cmd = coreNext16();
		SAEF_warn("I_cpXXX not implemented, cid %d, xxx %x, pc %08x", p.cid, p.xxx, regs.instruction_pc);
		//ccna
		//return p.cyc;
		return coreIllegal(p.op);
	}*/

	/*-----------------------------------------------------------------------*/
	/* real illegal/undefined instruction */

	function ILLEGAL(op) {
		/*if (typeof SAER != "undefined") {
			SAEF_warn("ILLEGAL op $%04x", op);
			SAER.cpu.diss(regs.instruction_pc,0);
		}*/
		//coreSyncPC();
		return coreIllegal(op);
	}

	/*-----------------------------------------------------------------------*/
	/* SECT core tables */
	/*-----------------------------------------------------------------------*/
	/*  Condition-code table */

	function mkCCTab() {
		var i = 0;

		ccTab = new Array(16);
		ccTab[i++] = function() { return true; }; //T
		ccTab[i++] = function() { return false; }; //F
		ccTab[i++] = function() { return !regs.c && !regs.z; }; //HI
		ccTab[i++] = function() { return regs.c || regs.z; }; //LS
		ccTab[i++] = function() { return !regs.c; }; //CC
		ccTab[i++] = function() { return regs.c; }; //CS
		ccTab[i++] = function() { return !regs.z; }; //NE
		ccTab[i++] = function() { return regs.z; }; //EQ
		ccTab[i++] = function() { return !regs.v; }; //VC
		ccTab[i++] = function() { return regs.v; }; //VV
		ccTab[i++] = function() { return !regs.n; }; //PL
		ccTab[i++] = function() { return regs.n; }; //MI
		ccTab[i++] = function() { return regs.n == regs.v; }; //GE
		ccTab[i++] = function() { return regs.n != regs.v; }; //LT
		ccTab[i++] = function() { return !regs.z && (regs.n == regs.v); }; //GT
		ccTab[i  ] = function() { return regs.z || (regs.n != regs.v); }; //LE
	}

	/*-----------------------------------------------------------------------*/
	/* Effective-Address tables */

	function exII(base, dp) {
		var reg = (dp >> 12) & 7;
		//var cycles = 0;
		var v;
		var regd = (dp & 0x8000) ? regs.a[reg] : regs.d[reg];
		var scale = (dp >> 9) & 3;

		if ((dp & 0x800) == 0)
			//regd = (uae_s32)(uae_s16)regd;
			regd = extWord(regd & 0xffff);

		//regd <<= (dp >> 9) & 3;
		if (scale) regd = ((regd << scale) & 0xffffffff) >>> 0;

		if (dp & 0x100) {
			var outer = 0;

			if (dp & 0x80) base = 0;
			if (dp & 0x40) regd = 0;

			if ((dp & 0x30) == 0x20) {
				//base += (uae_s32)(uae_s16)coreNext16();
				base = add32(base, extWord(coreNext16()));
				//cycles++;
			}
			if ((dp & 0x30) == 0x30) {
				//base += coreNext32();
				base = add32(base, coreNext32());
				//cycles++;
			}

			if ((dp & 0x3) == 0x2) {
				//outer = (uae_s32)(uae_s16)coreNext16();
				outer = extWord(coreNext16());
				//cycles++;
			}
			if ((dp & 0x3) == 0x3) {
				//outer = coreNext32();
				outer = coreNext32();
				//cycles++;
			}

			if ((dp & 0x4) == 0) {
				//base += regd;
				base = add32(base, regd);
				//cycles++;
			}
			if (dp & 0x3) {
				base = coreGet32(base);
				//cycles++;
			}
			if (dp & 0x4) {
				//base += regd;
				base = add32(base, regd);
				//cycles++;
			}
			//v = base + outer;
			v = add32(base, outer);
		} else {
			//v = base + (uae_s32)((uae_s8)dp) + regd;
			v = add32(add32(base, extByte(dp & 0xff)), regd);
		}
		return v;
	}

	function mkEATabs() {
		exEAtab = new Array(64);
		exEAtab[(2<<3)|0] = function() { return regs.a[0]; } //ria
		exEAtab[(2<<3)|1] = function() { return regs.a[1]; }
		exEAtab[(2<<3)|2] = function() { return regs.a[2]; }
		exEAtab[(2<<3)|3] = function() { return regs.a[3]; }
		exEAtab[(2<<3)|4] = function() { return regs.a[4]; }
		exEAtab[(2<<3)|5] = function() { return regs.a[5]; }
		exEAtab[(2<<3)|6] = function() { return regs.a[6]; }
		exEAtab[(2<<3)|7] = function() { return regs.a[7]; }
		exEAtab[(3<<3)|0] = function(z) { var a = regs.a[0]; regs.a[0] += aIncDec[z][0]; return a; };  //ripo
		exEAtab[(3<<3)|1] = function(z) { var a = regs.a[1]; regs.a[1] += aIncDec[z][1]; return a; };
		exEAtab[(3<<3)|2] = function(z) { var a = regs.a[2]; regs.a[2] += aIncDec[z][2]; return a; };
		exEAtab[(3<<3)|3] = function(z) { var a = regs.a[3]; regs.a[3] += aIncDec[z][3]; return a; };
		exEAtab[(3<<3)|4] = function(z) { var a = regs.a[4]; regs.a[4] += aIncDec[z][4]; return a; };
		exEAtab[(3<<3)|5] = function(z) { var a = regs.a[5]; regs.a[5] += aIncDec[z][5]; return a; };
		exEAtab[(3<<3)|6] = function(z) { var a = regs.a[6]; regs.a[6] += aIncDec[z][6]; return a; };
		exEAtab[(3<<3)|7] = function(z) { var a = regs.a[7]; regs.a[7] += aIncDec[z][7]; return a; };
		exEAtab[(4<<3)|0] = function(z) { regs.a[0] -= aIncDec[z][0]; return regs.a[0]; } //ripr
		exEAtab[(4<<3)|1] = function(z) { regs.a[1] -= aIncDec[z][1]; return regs.a[1]; }
		exEAtab[(4<<3)|2] = function(z) { regs.a[2] -= aIncDec[z][2]; return regs.a[2]; }
		exEAtab[(4<<3)|3] = function(z) { regs.a[3] -= aIncDec[z][3]; return regs.a[3]; }
		exEAtab[(4<<3)|4] = function(z) { regs.a[4] -= aIncDec[z][4]; return regs.a[4]; }
		exEAtab[(4<<3)|5] = function(z) { regs.a[5] -= aIncDec[z][5]; return regs.a[5]; }
		exEAtab[(4<<3)|6] = function(z) { regs.a[6] -= aIncDec[z][6]; return regs.a[6]; }
		exEAtab[(4<<3)|7] = function(z) { regs.a[7] -= aIncDec[z][7]; return regs.a[7]; }
		exEAtab[(5<<3)|0] = function() { return add32(regs.a[0], extWord(coreNext16())); } //rid
		exEAtab[(5<<3)|1] = function() { return add32(regs.a[1], extWord(coreNext16())); }
		exEAtab[(5<<3)|2] = function() { return add32(regs.a[2], extWord(coreNext16())); }
		exEAtab[(5<<3)|3] = function() { return add32(regs.a[3], extWord(coreNext16())); }
		exEAtab[(5<<3)|4] = function() { return add32(regs.a[4], extWord(coreNext16())); }
		exEAtab[(5<<3)|5] = function() { return add32(regs.a[5], extWord(coreNext16())); }
		exEAtab[(5<<3)|6] = function() { return add32(regs.a[6], extWord(coreNext16())); }
		exEAtab[(5<<3)|7] = function() { return add32(regs.a[7], extWord(coreNext16())); }
		exEAtab[(6<<3)|0] = function() { return exII(regs.a[0], coreNext16()); } //rii
		exEAtab[(6<<3)|1] = function() { return exII(regs.a[1], coreNext16()); }
		exEAtab[(6<<3)|2] = function() { return exII(regs.a[2], coreNext16()); }
		exEAtab[(6<<3)|3] = function() { return exII(regs.a[3], coreNext16()); }
		exEAtab[(6<<3)|4] = function() { return exII(regs.a[4], coreNext16()); }
		exEAtab[(6<<3)|5] = function() { return exII(regs.a[5], coreNext16()); }
		exEAtab[(6<<3)|6] = function() { return exII(regs.a[6], coreNext16()); }
		exEAtab[(6<<3)|7] = function() { return exII(regs.a[7], coreNext16()); }
		exEAtab[(7<<3)|0] = function() { return extWord(coreNext16()); } //absw
		exEAtab[(7<<3)|1] = function() { return coreNext32(); } //absl
		exEAtab[(7<<3)|2] = function() { return add32(coreGetPC(), extWord(coreNext16())); } //pcid
		exEAtab[(7<<3)|3] = function() { return exII(coreGetPC(), coreNext16()); } //pcii
		exEAtab[(7<<3)|4] = function() { SAEF_error("cpu.exEAtab() invalid EA 60 (7|4) (imm)"); } //imm

		/*-----------------------------------------------------------------------*/

		ldEA8tab = new Array(64);
		ldEA8tab[       0] = function() { return regs.d[0] & 0xff; } //rdd
		ldEA8tab[       1] = function() { return regs.d[1] & 0xff; }
		ldEA8tab[       2] = function() { return regs.d[2] & 0xff; }
		ldEA8tab[       3] = function() { return regs.d[3] & 0xff; }
		ldEA8tab[       4] = function() { return regs.d[4] & 0xff; }
		ldEA8tab[       5] = function() { return regs.d[5] & 0xff; }
		ldEA8tab[       6] = function() { return regs.d[6] & 0xff; }
		ldEA8tab[       7] = function() { return regs.d[7] & 0xff; }
		ldEA8tab[(1<<3)|0] = function() { SAEF_error("cpu.ldEA8tab() invalid EA  8 (1|0)"); } //rda
		ldEA8tab[(1<<3)|1] = function() { SAEF_error("cpu.ldEA8tab() invalid EA  9 (1|1)"); }
		ldEA8tab[(1<<3)|2] = function() { SAEF_error("cpu.ldEA8tab() invalid EA 10 (1|2)"); }
		ldEA8tab[(1<<3)|3] = function() { SAEF_error("cpu.ldEA8tab() invalid EA 11 (1|3)"); }
		ldEA8tab[(1<<3)|4] = function() { SAEF_error("cpu.ldEA8tab() invalid EA 12 (1|4)"); }
		ldEA8tab[(1<<3)|5] = function() { SAEF_error("cpu.ldEA8tab() invalid EA 13 (1|5)"); }
		ldEA8tab[(1<<3)|6] = function() { SAEF_error("cpu.ldEA8tab() invalid EA 14 (1|6)"); }
		ldEA8tab[(1<<3)|7] = function() { SAEF_error("cpu.ldEA8tab() invalid EA 15 (1|7)"); }
		ldEA8tab[(2<<3)|0] = function() { return coreGet8(regs.a[0]); } //ria
		ldEA8tab[(2<<3)|1] = function() { return coreGet8(regs.a[1]); }
		ldEA8tab[(2<<3)|2] = function() { return coreGet8(regs.a[2]); }
		ldEA8tab[(2<<3)|3] = function() { return coreGet8(regs.a[3]); }
		ldEA8tab[(2<<3)|4] = function() { return coreGet8(regs.a[4]); }
		ldEA8tab[(2<<3)|5] = function() { return coreGet8(regs.a[5]); }
		ldEA8tab[(2<<3)|6] = function() { return coreGet8(regs.a[6]); }
		ldEA8tab[(2<<3)|7] = function() { return coreGet8(regs.a[7]); }
		ldEA8tab[(3<<3)|0] = function() { var a = regs.a[0]; regs.a[0] += 1; return coreGet8(a); } //ripo
		ldEA8tab[(3<<3)|1] = function() { var a = regs.a[1]; regs.a[1] += 1; return coreGet8(a); }
		ldEA8tab[(3<<3)|2] = function() { var a = regs.a[2]; regs.a[2] += 1; return coreGet8(a); }
		ldEA8tab[(3<<3)|3] = function() { var a = regs.a[3]; regs.a[3] += 1; return coreGet8(a); }
		ldEA8tab[(3<<3)|4] = function() { var a = regs.a[4]; regs.a[4] += 1; return coreGet8(a); }
		ldEA8tab[(3<<3)|5] = function() { var a = regs.a[5]; regs.a[5] += 1; return coreGet8(a); }
		ldEA8tab[(3<<3)|6] = function() { var a = regs.a[6]; regs.a[6] += 1; return coreGet8(a); }
		ldEA8tab[(3<<3)|7] = function() { var a = regs.a[7]; regs.a[7] += 2; return coreGet8(a); }
		ldEA8tab[(4<<3)|0] = function() { regs.a[0] -= 1; return coreGet8(regs.a[0]); } //ripr
		ldEA8tab[(4<<3)|1] = function() { regs.a[1] -= 1; return coreGet8(regs.a[1]); }
		ldEA8tab[(4<<3)|2] = function() { regs.a[2] -= 1; return coreGet8(regs.a[2]); }
		ldEA8tab[(4<<3)|3] = function() { regs.a[3] -= 1; return coreGet8(regs.a[3]); }
		ldEA8tab[(4<<3)|4] = function() { regs.a[4] -= 1; return coreGet8(regs.a[4]); }
		ldEA8tab[(4<<3)|5] = function() { regs.a[5] -= 1; return coreGet8(regs.a[5]); }
		ldEA8tab[(4<<3)|6] = function() { regs.a[6] -= 1; return coreGet8(regs.a[6]); }
		ldEA8tab[(4<<3)|7] = function() { regs.a[7] -= 2; return coreGet8(regs.a[7]); }
		ldEA8tab[(5<<3)|0] = function() { return coreGet8(add32(regs.a[0], extWord(coreNext16()))); } //rid
		ldEA8tab[(5<<3)|1] = function() { return coreGet8(add32(regs.a[1], extWord(coreNext16()))); }
		ldEA8tab[(5<<3)|2] = function() { return coreGet8(add32(regs.a[2], extWord(coreNext16()))); }
		ldEA8tab[(5<<3)|3] = function() { return coreGet8(add32(regs.a[3], extWord(coreNext16()))); }
		ldEA8tab[(5<<3)|4] = function() { return coreGet8(add32(regs.a[4], extWord(coreNext16()))); }
		ldEA8tab[(5<<3)|5] = function() { return coreGet8(add32(regs.a[5], extWord(coreNext16()))); }
		ldEA8tab[(5<<3)|6] = function() { return coreGet8(add32(regs.a[6], extWord(coreNext16()))); }
		ldEA8tab[(5<<3)|7] = function() { return coreGet8(add32(regs.a[7], extWord(coreNext16()))); }
		ldEA8tab[(6<<3)|0] = function() { return coreGet8(exII(regs.a[0], coreNext16())); } //rii
		ldEA8tab[(6<<3)|1] = function() { return coreGet8(exII(regs.a[1], coreNext16())); }
		ldEA8tab[(6<<3)|2] = function() { return coreGet8(exII(regs.a[2], coreNext16())); }
		ldEA8tab[(6<<3)|3] = function() { return coreGet8(exII(regs.a[3], coreNext16())); }
		ldEA8tab[(6<<3)|4] = function() { return coreGet8(exII(regs.a[4], coreNext16())); }
		ldEA8tab[(6<<3)|5] = function() { return coreGet8(exII(regs.a[5], coreNext16())); }
		ldEA8tab[(6<<3)|6] = function() { return coreGet8(exII(regs.a[6], coreNext16())); }
		ldEA8tab[(6<<3)|7] = function() { return coreGet8(exII(regs.a[7], coreNext16())); }
		ldEA8tab[(7<<3)|0] = function() { return coreGet8(extWord(coreNext16())); } //absw
		ldEA8tab[(7<<3)|1] = function() { return coreGet8(coreNext32()); } //absl
		ldEA8tab[(7<<3)|2] = function() { return coreGet8(add32(coreGetPC(), extWord(coreNext16()))); } //pcid
		ldEA8tab[(7<<3)|3] = function() { return coreGet8(exII(coreGetPC(), coreNext16())); } //pcii
		ldEA8tab[(7<<3)|4] = function() { return coreNext16() & 0xff; } //imm

		ldEA16tab = new Array(64);
		ldEA16tab[       0] = function() { return regs.d[0] & 0xffff; } //rdd
		ldEA16tab[       1] = function() { return regs.d[1] & 0xffff; }
		ldEA16tab[       2] = function() { return regs.d[2] & 0xffff; }
		ldEA16tab[       3] = function() { return regs.d[3] & 0xffff; }
		ldEA16tab[       4] = function() { return regs.d[4] & 0xffff; }
		ldEA16tab[       5] = function() { return regs.d[5] & 0xffff; }
		ldEA16tab[       6] = function() { return regs.d[6] & 0xffff; }
		ldEA16tab[       7] = function() { return regs.d[7] & 0xffff; }
		ldEA16tab[(1<<3)|0] = function() { return regs.a[0] & 0xffff; } //rda
		ldEA16tab[(1<<3)|1] = function() { return regs.a[1] & 0xffff; }
		ldEA16tab[(1<<3)|2] = function() { return regs.a[2] & 0xffff; }
		ldEA16tab[(1<<3)|3] = function() { return regs.a[3] & 0xffff; }
		ldEA16tab[(1<<3)|4] = function() { return regs.a[4] & 0xffff; }
		ldEA16tab[(1<<3)|5] = function() { return regs.a[5] & 0xffff; }
		ldEA16tab[(1<<3)|6] = function() { return regs.a[6] & 0xffff; }
		ldEA16tab[(1<<3)|7] = function() { return regs.a[7] & 0xffff; }
		ldEA16tab[(2<<3)|0] = function() { return coreGet16(regs.a[0]); } //ria
		ldEA16tab[(2<<3)|1] = function() { return coreGet16(regs.a[1]); }
		ldEA16tab[(2<<3)|2] = function() { return coreGet16(regs.a[2]); }
		ldEA16tab[(2<<3)|3] = function() { return coreGet16(regs.a[3]); }
		ldEA16tab[(2<<3)|4] = function() { return coreGet16(regs.a[4]); }
		ldEA16tab[(2<<3)|5] = function() { return coreGet16(regs.a[5]); }
		ldEA16tab[(2<<3)|6] = function() { return coreGet16(regs.a[6]); }
		ldEA16tab[(2<<3)|7] = function() { return coreGet16(regs.a[7]); }
		ldEA16tab[(3<<3)|0] = function() { var a = regs.a[0]; regs.a[0] += 2; return coreGet16(a); } //ripo
		ldEA16tab[(3<<3)|1] = function() { var a = regs.a[1]; regs.a[1] += 2; return coreGet16(a); }
		ldEA16tab[(3<<3)|2] = function() { var a = regs.a[2]; regs.a[2] += 2; return coreGet16(a); }
		ldEA16tab[(3<<3)|3] = function() { var a = regs.a[3]; regs.a[3] += 2; return coreGet16(a); }
		ldEA16tab[(3<<3)|4] = function() { var a = regs.a[4]; regs.a[4] += 2; return coreGet16(a); }
		ldEA16tab[(3<<3)|5] = function() { var a = regs.a[5]; regs.a[5] += 2; return coreGet16(a); }
		ldEA16tab[(3<<3)|6] = function() { var a = regs.a[6]; regs.a[6] += 2; return coreGet16(a); }
		ldEA16tab[(3<<3)|7] = function() { var a = regs.a[7]; regs.a[7] += 2; return coreGet16(a); }
		ldEA16tab[(4<<3)|0] = function() { regs.a[0] -= 2; return coreGet16(regs.a[0]); } //ripr
		ldEA16tab[(4<<3)|1] = function() { regs.a[1] -= 2; return coreGet16(regs.a[1]); }
		ldEA16tab[(4<<3)|2] = function() { regs.a[2] -= 2; return coreGet16(regs.a[2]); }
		ldEA16tab[(4<<3)|3] = function() { regs.a[3] -= 2; return coreGet16(regs.a[3]); }
		ldEA16tab[(4<<3)|4] = function() { regs.a[4] -= 2; return coreGet16(regs.a[4]); }
		ldEA16tab[(4<<3)|5] = function() { regs.a[5] -= 2; return coreGet16(regs.a[5]); }
		ldEA16tab[(4<<3)|6] = function() { regs.a[6] -= 2; return coreGet16(regs.a[6]); }
		ldEA16tab[(4<<3)|7] = function() { regs.a[7] -= 2; return coreGet16(regs.a[7]); }
		ldEA16tab[(5<<3)|0] = function() { return coreGet16(add32(regs.a[0], extWord(coreNext16()))); } //rid
		ldEA16tab[(5<<3)|1] = function() { return coreGet16(add32(regs.a[1], extWord(coreNext16()))); }
		ldEA16tab[(5<<3)|2] = function() { return coreGet16(add32(regs.a[2], extWord(coreNext16()))); }
		ldEA16tab[(5<<3)|3] = function() { return coreGet16(add32(regs.a[3], extWord(coreNext16()))); }
		ldEA16tab[(5<<3)|4] = function() { return coreGet16(add32(regs.a[4], extWord(coreNext16()))); }
		ldEA16tab[(5<<3)|5] = function() { return coreGet16(add32(regs.a[5], extWord(coreNext16()))); }
		ldEA16tab[(5<<3)|6] = function() { return coreGet16(add32(regs.a[6], extWord(coreNext16()))); }
		ldEA16tab[(5<<3)|7] = function() { return coreGet16(add32(regs.a[7], extWord(coreNext16()))); }
		ldEA16tab[(6<<3)|0] = function() { return coreGet16(exII(regs.a[0], coreNext16())); } //rii
		ldEA16tab[(6<<3)|1] = function() { return coreGet16(exII(regs.a[1], coreNext16())); }
		ldEA16tab[(6<<3)|2] = function() { return coreGet16(exII(regs.a[2], coreNext16())); }
		ldEA16tab[(6<<3)|3] = function() { return coreGet16(exII(regs.a[3], coreNext16())); }
		ldEA16tab[(6<<3)|4] = function() { return coreGet16(exII(regs.a[4], coreNext16())); }
		ldEA16tab[(6<<3)|5] = function() { return coreGet16(exII(regs.a[5], coreNext16())); }
		ldEA16tab[(6<<3)|6] = function() { return coreGet16(exII(regs.a[6], coreNext16())); }
		ldEA16tab[(6<<3)|7] = function() { return coreGet16(exII(regs.a[7], coreNext16())); }
		ldEA16tab[(7<<3)|0] = function() { return coreGet16(extWord(coreNext16())); } //absw
		ldEA16tab[(7<<3)|1] = function() { return coreGet16(coreNext32()); } //absl
		ldEA16tab[(7<<3)|2] = function() { return coreGet16(add32(coreGetPC(), extWord(coreNext16()))); } //pcid
		ldEA16tab[(7<<3)|3] = function() { return coreGet16(exII(coreGetPC(), coreNext16())); } //pcii
		ldEA16tab[(7<<3)|4] = function() { return coreNext16(); } //imm

		ldEA32tab = new Array(64);
		ldEA32tab[       0] = function() { return regs.d[0]; } //rdd
		ldEA32tab[       1] = function() { return regs.d[1]; }
		ldEA32tab[       2] = function() { return regs.d[2]; }
		ldEA32tab[       3] = function() { return regs.d[3]; }
		ldEA32tab[       4] = function() { return regs.d[4]; }
		ldEA32tab[       5] = function() { return regs.d[5]; }
		ldEA32tab[       6] = function() { return regs.d[6]; }
		ldEA32tab[       7] = function() { return regs.d[7]; }
		ldEA32tab[(1<<3)|0] = function() { return regs.a[0]; } //rda
		ldEA32tab[(1<<3)|1] = function() { return regs.a[1]; }
		ldEA32tab[(1<<3)|2] = function() { return regs.a[2]; }
		ldEA32tab[(1<<3)|3] = function() { return regs.a[3]; }
		ldEA32tab[(1<<3)|4] = function() { return regs.a[4]; }
		ldEA32tab[(1<<3)|5] = function() { return regs.a[5]; }
		ldEA32tab[(1<<3)|6] = function() { return regs.a[6]; }
		ldEA32tab[(1<<3)|7] = function() { return regs.a[7]; }
		ldEA32tab[(2<<3)|0] = function() { return coreGet32(regs.a[0]); } //ria
		ldEA32tab[(2<<3)|1] = function() { return coreGet32(regs.a[1]); }
		ldEA32tab[(2<<3)|2] = function() { return coreGet32(regs.a[2]); }
		ldEA32tab[(2<<3)|3] = function() { return coreGet32(regs.a[3]); }
		ldEA32tab[(2<<3)|4] = function() { return coreGet32(regs.a[4]); }
		ldEA32tab[(2<<3)|5] = function() { return coreGet32(regs.a[5]); }
		ldEA32tab[(2<<3)|6] = function() { return coreGet32(regs.a[6]); }
		ldEA32tab[(2<<3)|7] = function() { return coreGet32(regs.a[7]); }
		ldEA32tab[(3<<3)|0] = function() { var a = regs.a[0]; regs.a[0] += 4; return coreGet32(a); } //ripo
		ldEA32tab[(3<<3)|1] = function() { var a = regs.a[1]; regs.a[1] += 4; return coreGet32(a); }
		ldEA32tab[(3<<3)|2] = function() { var a = regs.a[2]; regs.a[2] += 4; return coreGet32(a); }
		ldEA32tab[(3<<3)|3] = function() { var a = regs.a[3]; regs.a[3] += 4; return coreGet32(a); }
		ldEA32tab[(3<<3)|4] = function() { var a = regs.a[4]; regs.a[4] += 4; return coreGet32(a); }
		ldEA32tab[(3<<3)|5] = function() { var a = regs.a[5]; regs.a[5] += 4; return coreGet32(a); }
		ldEA32tab[(3<<3)|6] = function() { var a = regs.a[6]; regs.a[6] += 4; return coreGet32(a); }
		ldEA32tab[(3<<3)|7] = function() { var a = regs.a[7]; regs.a[7] += 4; return coreGet32(a); }
		ldEA32tab[(4<<3)|0] = function() { regs.a[0] -= 4; return coreGet32(regs.a[0]); } //ripr
		ldEA32tab[(4<<3)|1] = function() { regs.a[1] -= 4; return coreGet32(regs.a[1]); }
		ldEA32tab[(4<<3)|2] = function() { regs.a[2] -= 4; return coreGet32(regs.a[2]); }
		ldEA32tab[(4<<3)|3] = function() { regs.a[3] -= 4; return coreGet32(regs.a[3]); }
		ldEA32tab[(4<<3)|4] = function() { regs.a[4] -= 4; return coreGet32(regs.a[4]); }
		ldEA32tab[(4<<3)|5] = function() { regs.a[5] -= 4; return coreGet32(regs.a[5]); }
		ldEA32tab[(4<<3)|6] = function() { regs.a[6] -= 4; return coreGet32(regs.a[6]); }
		ldEA32tab[(4<<3)|7] = function() { regs.a[7] -= 4; return coreGet32(regs.a[7]); }
		ldEA32tab[(5<<3)|0] = function() { return coreGet32(add32(regs.a[0], extWord(coreNext16()))); } //rid
		ldEA32tab[(5<<3)|1] = function() { return coreGet32(add32(regs.a[1], extWord(coreNext16()))); }
		ldEA32tab[(5<<3)|2] = function() { return coreGet32(add32(regs.a[2], extWord(coreNext16()))); }
		ldEA32tab[(5<<3)|3] = function() { return coreGet32(add32(regs.a[3], extWord(coreNext16()))); }
		ldEA32tab[(5<<3)|4] = function() { return coreGet32(add32(regs.a[4], extWord(coreNext16()))); }
		ldEA32tab[(5<<3)|5] = function() { return coreGet32(add32(regs.a[5], extWord(coreNext16()))); }
		ldEA32tab[(5<<3)|6] = function() { return coreGet32(add32(regs.a[6], extWord(coreNext16()))); }
		ldEA32tab[(5<<3)|7] = function() { return coreGet32(add32(regs.a[7], extWord(coreNext16()))); }
		ldEA32tab[(6<<3)|0] = function() { return coreGet32(exII(regs.a[0], coreNext16())); } //rii0
		ldEA32tab[(6<<3)|1] = function() { return coreGet32(exII(regs.a[1], coreNext16())); }
		ldEA32tab[(6<<3)|2] = function() { return coreGet32(exII(regs.a[2], coreNext16())); }
		ldEA32tab[(6<<3)|3] = function() { return coreGet32(exII(regs.a[3], coreNext16())); }
		ldEA32tab[(6<<3)|4] = function() { return coreGet32(exII(regs.a[4], coreNext16())); }
		ldEA32tab[(6<<3)|5] = function() { return coreGet32(exII(regs.a[5], coreNext16())); }
		ldEA32tab[(6<<3)|6] = function() { return coreGet32(exII(regs.a[6], coreNext16())); }
		ldEA32tab[(6<<3)|7] = function() { return coreGet32(exII(regs.a[7], coreNext16())); }
		ldEA32tab[(7<<3)|0] = function() { return coreGet32(extWord(coreNext16())); } //absw
		ldEA32tab[(7<<3)|1] = function() { return coreGet32(coreNext32()); } //absl
		ldEA32tab[(7<<3)|2] = function() { return coreGet32(add32(coreGetPC(), extWord(coreNext16()))); } //pcid
		ldEA32tab[(7<<3)|3] = function() { return coreGet32(exII(coreGetPC(), coreNext16())); } //pcii
		ldEA32tab[(7<<3)|4] = function() { return coreNext32(); } //imm

		stEA8tab = new Array(64);
		stEA8tab[       0] = function(v) { regs.d[0] = (regs.d[0] & 0xffffff00) | v; } //rdd
		stEA8tab[       1] = function(v) { regs.d[1] = (regs.d[1] & 0xffffff00) | v; }
		stEA8tab[       2] = function(v) { regs.d[2] = (regs.d[2] & 0xffffff00) | v; }
		stEA8tab[       3] = function(v) { regs.d[3] = (regs.d[3] & 0xffffff00) | v; }
		stEA8tab[       4] = function(v) { regs.d[4] = (regs.d[4] & 0xffffff00) | v; }
		stEA8tab[       5] = function(v) { regs.d[5] = (regs.d[5] & 0xffffff00) | v; }
		stEA8tab[       6] = function(v) { regs.d[6] = (regs.d[6] & 0xffffff00) | v; }
		stEA8tab[       7] = function(v) { regs.d[7] = (regs.d[7] & 0xffffff00) | v; }
		stEA8tab[(1<<3)|0] = function(v) { SAEF_error("cpu.stEA8tab() invalid EA  8 (1|0)"); } //rda
		stEA8tab[(1<<3)|1] = function(v) { SAEF_error("cpu.stEA8tab() invalid EA  9 (1|1)"); }
		stEA8tab[(1<<3)|2] = function(v) { SAEF_error("cpu.stEA8tab() invalid EA 10 (1|2)"); }
		stEA8tab[(1<<3)|3] = function(v) { SAEF_error("cpu.stEA8tab() invalid EA 11 (1|3)"); }
		stEA8tab[(1<<3)|4] = function(v) { SAEF_error("cpu.stEA8tab() invalid EA 12 (1|4)"); }
		stEA8tab[(1<<3)|5] = function(v) { SAEF_error("cpu.stEA8tab() invalid EA 13 (1|5)"); }
		stEA8tab[(1<<3)|6] = function(v) { SAEF_error("cpu.stEA8tab() invalid EA 14 (1|6)"); }
		stEA8tab[(1<<3)|7] = function(v) { SAEF_error("cpu.stEA8tab() invalid EA 15 (1|7)"); }
		stEA8tab[(2<<3)|0] = function(v) { corePut8(regs.a[0], v); } //ria
		stEA8tab[(2<<3)|1] = function(v) { corePut8(regs.a[1], v); }
		stEA8tab[(2<<3)|2] = function(v) { corePut8(regs.a[2], v); }
		stEA8tab[(2<<3)|3] = function(v) { corePut8(regs.a[3], v); }
		stEA8tab[(2<<3)|4] = function(v) { corePut8(regs.a[4], v); }
		stEA8tab[(2<<3)|5] = function(v) { corePut8(regs.a[5], v); }
		stEA8tab[(2<<3)|6] = function(v) { corePut8(regs.a[6], v); }
		stEA8tab[(2<<3)|7] = function(v) { corePut8(regs.a[7], v); }
		stEA8tab[(3<<3)|0] = function(v) { corePut8(regs.a[0], v); regs.a[0] += 1; } //ripo
		stEA8tab[(3<<3)|1] = function(v) { corePut8(regs.a[1], v); regs.a[1] += 1; }
		stEA8tab[(3<<3)|2] = function(v) { corePut8(regs.a[2], v); regs.a[2] += 1; }
		stEA8tab[(3<<3)|3] = function(v) { corePut8(regs.a[3], v); regs.a[3] += 1; }
		stEA8tab[(3<<3)|4] = function(v) { corePut8(regs.a[4], v); regs.a[4] += 1; }
		stEA8tab[(3<<3)|5] = function(v) { corePut8(regs.a[5], v); regs.a[5] += 1; }
		stEA8tab[(3<<3)|6] = function(v) { corePut8(regs.a[6], v); regs.a[6] += 1; }
		stEA8tab[(3<<3)|7] = function(v) { corePut8(regs.a[7], v); regs.a[7] += 2; }
		stEA8tab[(4<<3)|0] = function(v) { regs.a[0] -= 1; corePut8(regs.a[0], v); } //ripr
		stEA8tab[(4<<3)|1] = function(v) { regs.a[1] -= 1; corePut8(regs.a[1], v); }
		stEA8tab[(4<<3)|2] = function(v) { regs.a[2] -= 1; corePut8(regs.a[2], v); }
		stEA8tab[(4<<3)|3] = function(v) { regs.a[3] -= 1; corePut8(regs.a[3], v); }
		stEA8tab[(4<<3)|4] = function(v) { regs.a[4] -= 1; corePut8(regs.a[4], v); }
		stEA8tab[(4<<3)|5] = function(v) { regs.a[5] -= 1; corePut8(regs.a[5], v); }
		stEA8tab[(4<<3)|6] = function(v) { regs.a[6] -= 1; corePut8(regs.a[6], v); }
		stEA8tab[(4<<3)|7] = function(v) { regs.a[7] -= 2; corePut8(regs.a[7], v); }
		stEA8tab[(5<<3)|0] = function(v) { corePut8(add32(regs.a[0], extWord(coreNext16())), v); } //rid
		stEA8tab[(5<<3)|1] = function(v) { corePut8(add32(regs.a[1], extWord(coreNext16())), v); }
		stEA8tab[(5<<3)|2] = function(v) { corePut8(add32(regs.a[2], extWord(coreNext16())), v); }
		stEA8tab[(5<<3)|3] = function(v) { corePut8(add32(regs.a[3], extWord(coreNext16())), v); }
		stEA8tab[(5<<3)|4] = function(v) { corePut8(add32(regs.a[4], extWord(coreNext16())), v); }
		stEA8tab[(5<<3)|5] = function(v) { corePut8(add32(regs.a[5], extWord(coreNext16())), v); }
		stEA8tab[(5<<3)|6] = function(v) { corePut8(add32(regs.a[6], extWord(coreNext16())), v); }
		stEA8tab[(5<<3)|7] = function(v) { corePut8(add32(regs.a[7], extWord(coreNext16())), v); }
		stEA8tab[(6<<3)|0] = function(v) { corePut8(exII(regs.a[0], coreNext16()), v); } //rii
		stEA8tab[(6<<3)|1] = function(v) { corePut8(exII(regs.a[1], coreNext16()), v); }
		stEA8tab[(6<<3)|2] = function(v) { corePut8(exII(regs.a[2], coreNext16()), v); }
		stEA8tab[(6<<3)|3] = function(v) { corePut8(exII(regs.a[3], coreNext16()), v); }
		stEA8tab[(6<<3)|4] = function(v) { corePut8(exII(regs.a[4], coreNext16()), v); }
		stEA8tab[(6<<3)|5] = function(v) { corePut8(exII(regs.a[5], coreNext16()), v); }
		stEA8tab[(6<<3)|6] = function(v) { corePut8(exII(regs.a[6], coreNext16()), v); }
		stEA8tab[(6<<3)|7] = function(v) { corePut8(exII(regs.a[7], coreNext16()), v); }
		stEA8tab[(7<<3)|0] = function(v) { corePut8(extWord(coreNext16()), v); } //absw
		stEA8tab[(7<<3)|1] = function(v) { corePut8(coreNext32(), v); } //absl
		stEA8tab[(7<<3)|2] = function(v) { corePut8(add32(coreGetPC(), extWord(coreNext16())), v); } //pcid
		stEA8tab[(7<<3)|3] = function(v) { corePut8(exII(coreGetPC(), coreNext16()), v); }	//pcii
		stEA8tab[(7<<3)|4] = function(v) { SAEF_error("cpu.stEA8tab() invalid EA 60 (7|4)"); } //imm

		stEA16tab = new Array(64);
		stEA16tab[       0] = function(v) { regs.d[0] = (regs.d[0] & 0xffff0000) | v; } //rdd
		stEA16tab[       1] = function(v) { regs.d[1] = (regs.d[1] & 0xffff0000) | v; }
		stEA16tab[       2] = function(v) { regs.d[2] = (regs.d[2] & 0xffff0000) | v; }
		stEA16tab[       3] = function(v) { regs.d[3] = (regs.d[3] & 0xffff0000) | v; }
		stEA16tab[       4] = function(v) { regs.d[4] = (regs.d[4] & 0xffff0000) | v; }
		stEA16tab[       5] = function(v) { regs.d[5] = (regs.d[5] & 0xffff0000) | v; }
		stEA16tab[       6] = function(v) { regs.d[6] = (regs.d[6] & 0xffff0000) | v; }
		stEA16tab[       7] = function(v) { regs.d[7] = (regs.d[7] & 0xffff0000) | v; }
		stEA16tab[(1<<3)|0] = function(v) { regs.a[0] = v; } //rda
		stEA16tab[(1<<3)|1] = function(v) { regs.a[1] = v; }
		stEA16tab[(1<<3)|2] = function(v) { regs.a[2] = v; }
		stEA16tab[(1<<3)|3] = function(v) { regs.a[3] = v; }
		stEA16tab[(1<<3)|4] = function(v) { regs.a[4] = v; }
		stEA16tab[(1<<3)|5] = function(v) { regs.a[5] = v; }
		stEA16tab[(1<<3)|6] = function(v) { regs.a[6] = v; }
		stEA16tab[(1<<3)|7] = function(v) { regs.a[7] = v; }
		stEA16tab[(2<<3)|0] = function(v) { corePut16(regs.a[0], v); } //ria
		stEA16tab[(2<<3)|1] = function(v) { corePut16(regs.a[1], v); }
		stEA16tab[(2<<3)|2] = function(v) { corePut16(regs.a[2], v); }
		stEA16tab[(2<<3)|3] = function(v) { corePut16(regs.a[3], v); }
		stEA16tab[(2<<3)|4] = function(v) { corePut16(regs.a[4], v); }
		stEA16tab[(2<<3)|5] = function(v) { corePut16(regs.a[5], v); }
		stEA16tab[(2<<3)|6] = function(v) { corePut16(regs.a[6], v); }
		stEA16tab[(2<<3)|7] = function(v) { corePut16(regs.a[7], v); }
		stEA16tab[(3<<3)|0] = function(v) { corePut16(regs.a[0], v); regs.a[0] += 2; } //ripo
		stEA16tab[(3<<3)|1] = function(v) { corePut16(regs.a[1], v); regs.a[1] += 2; }
		stEA16tab[(3<<3)|2] = function(v) { corePut16(regs.a[2], v); regs.a[2] += 2; }
		stEA16tab[(3<<3)|3] = function(v) { corePut16(regs.a[3], v); regs.a[3] += 2; }
		stEA16tab[(3<<3)|4] = function(v) { corePut16(regs.a[4], v); regs.a[4] += 2; }
		stEA16tab[(3<<3)|5] = function(v) { corePut16(regs.a[5], v); regs.a[5] += 2; }
		stEA16tab[(3<<3)|6] = function(v) { corePut16(regs.a[6], v); regs.a[6] += 2; }
		stEA16tab[(3<<3)|7] = function(v) { corePut16(regs.a[7], v); regs.a[7] += 2; }
		stEA16tab[(4<<3)|0] = function(v) { regs.a[0] -= 2; corePut16(regs.a[0], v); }	//ripr
		stEA16tab[(4<<3)|1] = function(v) { regs.a[1] -= 2; corePut16(regs.a[1], v); }
		stEA16tab[(4<<3)|2] = function(v) { regs.a[2] -= 2; corePut16(regs.a[2], v); }
		stEA16tab[(4<<3)|3] = function(v) { regs.a[3] -= 2; corePut16(regs.a[3], v); }
		stEA16tab[(4<<3)|4] = function(v) { regs.a[4] -= 2; corePut16(regs.a[4], v); }
		stEA16tab[(4<<3)|5] = function(v) { regs.a[5] -= 2; corePut16(regs.a[5], v); }
		stEA16tab[(4<<3)|6] = function(v) { regs.a[6] -= 2; corePut16(regs.a[6], v); }
		stEA16tab[(4<<3)|7] = function(v) { regs.a[7] -= 2; corePut16(regs.a[7], v); }
		stEA16tab[(5<<3)|0] = function(v) { corePut16(add32(regs.a[0], extWord(coreNext16())), v); } //rid
		stEA16tab[(5<<3)|1] = function(v) { corePut16(add32(regs.a[1], extWord(coreNext16())), v); }
		stEA16tab[(5<<3)|2] = function(v) { corePut16(add32(regs.a[2], extWord(coreNext16())), v); }
		stEA16tab[(5<<3)|3] = function(v) { corePut16(add32(regs.a[3], extWord(coreNext16())), v); }
		stEA16tab[(5<<3)|4] = function(v) { corePut16(add32(regs.a[4], extWord(coreNext16())), v); }
		stEA16tab[(5<<3)|5] = function(v) { corePut16(add32(regs.a[5], extWord(coreNext16())), v); }
		stEA16tab[(5<<3)|6] = function(v) { corePut16(add32(regs.a[6], extWord(coreNext16())), v); }
		stEA16tab[(5<<3)|7] = function(v) { corePut16(add32(regs.a[7], extWord(coreNext16())), v); }
		stEA16tab[(6<<3)|0] = function(v) { corePut16(exII(regs.a[0], coreNext16()), v); }	//rii
		stEA16tab[(6<<3)|1] = function(v) { corePut16(exII(regs.a[1], coreNext16()), v); }
		stEA16tab[(6<<3)|2] = function(v) { corePut16(exII(regs.a[2], coreNext16()), v); }
		stEA16tab[(6<<3)|3] = function(v) { corePut16(exII(regs.a[3], coreNext16()), v); }
		stEA16tab[(6<<3)|4] = function(v) { corePut16(exII(regs.a[4], coreNext16()), v); }
		stEA16tab[(6<<3)|5] = function(v) { corePut16(exII(regs.a[5], coreNext16()), v); }
		stEA16tab[(6<<3)|6] = function(v) { corePut16(exII(regs.a[6], coreNext16()), v); }
		stEA16tab[(6<<3)|7] = function(v) { corePut16(exII(regs.a[7], coreNext16()), v); }
		stEA16tab[(7<<3)|0] = function(v) { corePut16(extWord(coreNext16()), v); } //absw
		stEA16tab[(7<<3)|1] = function(v) { corePut16(coreNext32(), v); } //absl
		stEA16tab[(7<<3)|2] = function(v) { corePut16(add32(coreGetPC(), extWord(coreNext16())), v); } //pcid
		stEA16tab[(7<<3)|3] = function(v) { corePut16(exII(coreGetPC(), coreNext16()), v); }	//pcii
		stEA16tab[(7<<3)|4] = function(v) { SAEF_error("cpu.stEA16tab() invalid EA 60 (7|4)"); } //imm

		stEA32tab = new Array(64);
		stEA32tab[       0] = function(v) { regs.d[0] = v; } //rdd
		stEA32tab[       1] = function(v) { regs.d[1] = v; }
		stEA32tab[       2] = function(v) { regs.d[2] = v; }
		stEA32tab[       3] = function(v) { regs.d[3] = v; }
		stEA32tab[       4] = function(v) { regs.d[4] = v; }
		stEA32tab[       5] = function(v) { regs.d[5] = v; }
		stEA32tab[       6] = function(v) { regs.d[6] = v; }
		stEA32tab[       7] = function(v) { regs.d[7] = v; }
		stEA32tab[(1<<3)|0] = function(v) { regs.a[0] = v; } //rda
		stEA32tab[(1<<3)|1] = function(v) { regs.a[1] = v; }
		stEA32tab[(1<<3)|2] = function(v) { regs.a[2] = v; }
		stEA32tab[(1<<3)|3] = function(v) { regs.a[3] = v; }
		stEA32tab[(1<<3)|4] = function(v) { regs.a[4] = v; }
		stEA32tab[(1<<3)|5] = function(v) { regs.a[5] = v; }
		stEA32tab[(1<<3)|6] = function(v) { regs.a[6] = v; }
		stEA32tab[(1<<3)|7] = function(v) { regs.a[7] = v; }
		stEA32tab[(2<<3)|0] = function(v) { corePut32(regs.a[0], v); } //ria
		stEA32tab[(2<<3)|1] = function(v) { corePut32(regs.a[1], v); }
		stEA32tab[(2<<3)|2] = function(v) { corePut32(regs.a[2], v); }
		stEA32tab[(2<<3)|3] = function(v) { corePut32(regs.a[3], v); }
		stEA32tab[(2<<3)|4] = function(v) { corePut32(regs.a[4], v); }
		stEA32tab[(2<<3)|5] = function(v) { corePut32(regs.a[5], v); }
		stEA32tab[(2<<3)|6] = function(v) { corePut32(regs.a[6], v); }
		stEA32tab[(2<<3)|7] = function(v) { corePut32(regs.a[7], v); }
		stEA32tab[(3<<3)|0] = function(v) { corePut32(regs.a[0], v); regs.a[0] += 4; } //ripo
		stEA32tab[(3<<3)|1] = function(v) { corePut32(regs.a[1], v); regs.a[1] += 4; }
		stEA32tab[(3<<3)|2] = function(v) { corePut32(regs.a[2], v); regs.a[2] += 4; }
		stEA32tab[(3<<3)|3] = function(v) { corePut32(regs.a[3], v); regs.a[3] += 4; }
		stEA32tab[(3<<3)|4] = function(v) { corePut32(regs.a[4], v); regs.a[4] += 4; }
		stEA32tab[(3<<3)|5] = function(v) { corePut32(regs.a[5], v); regs.a[5] += 4; }
		stEA32tab[(3<<3)|6] = function(v) { corePut32(regs.a[6], v); regs.a[6] += 4; }
		stEA32tab[(3<<3)|7] = function(v) { corePut32(regs.a[7], v); regs.a[7] += 4; }
		stEA32tab[(4<<3)|0] = function(v) { regs.a[0] -= 4; corePut32(regs.a[0], v); } //ripr
		stEA32tab[(4<<3)|1] = function(v) { regs.a[1] -= 4; corePut32(regs.a[1], v); }
		stEA32tab[(4<<3)|2] = function(v) { regs.a[2] -= 4; corePut32(regs.a[2], v); }
		stEA32tab[(4<<3)|3] = function(v) { regs.a[3] -= 4; corePut32(regs.a[3], v); }
		stEA32tab[(4<<3)|4] = function(v) { regs.a[4] -= 4; corePut32(regs.a[4], v); }
		stEA32tab[(4<<3)|5] = function(v) { regs.a[5] -= 4; corePut32(regs.a[5], v); }
		stEA32tab[(4<<3)|6] = function(v) { regs.a[6] -= 4; corePut32(regs.a[6], v); }
		stEA32tab[(4<<3)|7] = function(v) { regs.a[7] -= 4; corePut32(regs.a[7], v); }
		stEA32tab[(5<<3)|0] = function(v) { corePut32(add32(regs.a[0], extWord(coreNext16())), v); } //rid
		stEA32tab[(5<<3)|1] = function(v) { corePut32(add32(regs.a[1], extWord(coreNext16())), v); }
		stEA32tab[(5<<3)|2] = function(v) { corePut32(add32(regs.a[2], extWord(coreNext16())), v); }
		stEA32tab[(5<<3)|3] = function(v) { corePut32(add32(regs.a[3], extWord(coreNext16())), v); }
		stEA32tab[(5<<3)|4] = function(v) { corePut32(add32(regs.a[4], extWord(coreNext16())), v); }
		stEA32tab[(5<<3)|5] = function(v) { corePut32(add32(regs.a[5], extWord(coreNext16())), v); }
		stEA32tab[(5<<3)|6] = function(v) { corePut32(add32(regs.a[6], extWord(coreNext16())), v); }
		stEA32tab[(5<<3)|7] = function(v) { corePut32(add32(regs.a[7], extWord(coreNext16())), v); }
		stEA32tab[(6<<3)|0] = function(v) { corePut32(exII(regs.a[0], coreNext16()), v); } //rii
		stEA32tab[(6<<3)|1] = function(v) { corePut32(exII(regs.a[1], coreNext16()), v); }
		stEA32tab[(6<<3)|2] = function(v) { corePut32(exII(regs.a[2], coreNext16()), v); }
		stEA32tab[(6<<3)|3] = function(v) { corePut32(exII(regs.a[3], coreNext16()), v); }
		stEA32tab[(6<<3)|4] = function(v) { corePut32(exII(regs.a[4], coreNext16()), v); }
		stEA32tab[(6<<3)|5] = function(v) { corePut32(exII(regs.a[5], coreNext16()), v); }
		stEA32tab[(6<<3)|6] = function(v) { corePut32(exII(regs.a[6], coreNext16()), v); }
		stEA32tab[(6<<3)|7] = function(v) { corePut32(exII(regs.a[7], coreNext16()), v); }
		stEA32tab[(7<<3)|0] = function(v) { corePut32(extWord(coreNext16()), v); } //absw
		stEA32tab[(7<<3)|1] = function(v) { corePut32(coreNext32(), v); } //absl
		stEA32tab[(7<<3)|2] = function(v) { corePut32(add32(coreGetPC(), extWord(coreNext16())), v); } //pcid
		stEA32tab[(7<<3)|3] = function(v) { corePut32(exII(coreGetPC(), coreNext16()), v); }	//pcii
		stEA32tab[(7<<3)|4] = function(v) { SAEF_error("cpu.stEA32tab() invalid EA 60 (7|4)"); } //imm
	}

	/*-----------------------------------------------------------------------*/
	/* Instruction table */

	/*function mkEA(m,r) {
		switch (m) {
			case M_rdd:		return (0 << 3) | r;
			case M_rda:		return (1 << 3) | r;
			case M_ria:		return (2 << 3) | r;
			case M_ripo:	return (3 << 3) | r;
			case M_ripr:	return (4 << 3) | r;
			case M_rid:		return (5 << 3) | r;
			case M_rii:		return (6 << 3) | r;
			case M_absw:	return (7 << 3) | 0;
			case M_absl:	return (7 << 3) | 1;
			case M_pcid:	return (7 << 3) | 2;
			case M_pcii:	return (7 << 3) | 3;
			case M_imm:		return (7 << 3) | 4;
		}
		SAEF_error("cpu.mkEA() ERROR m "+m+", r "+r);
		return -1;
	}*/

	function getEAMode(ea) {
		var m = ea >> 3;
		if (m == 7) {
			switch (ea & 7) {
				case 0: return M_absw;
				case 1: return M_absl;
				case 2: return M_pcid;
				case 3: return M_pcii;
				case 4: return M_imm;
			}
		} else {
			switch (m) {
				case 0: return M_rdd;
				case 1: return M_rda;
				case 2: return M_ria;
				case 3: return M_ripo;
				case 4: return M_ripr;
				case 5: return M_rid;
				case 6: return M_rii;
			}
		}
		SAEF_error("cpu.getEAMode() ERROR ea "+ea);
		return -1;
	}

	function isEA(ea, en) {
		var m = ea >> 3;
		if (m == 7) {
			var r = ea & 7;
			if (r == 0 && en.indexOf(M_absw) != -1) return true;
			if (r == 1 && en.indexOf(M_absl) != -1) return true;
			if (r == 2 && en.indexOf(M_pcid) != -1) return true;
			if (r == 3 && en.indexOf(M_pcii) != -1) return true;
			if (r == 4 && en.indexOf(M_imm) != -1) return true;
		} else {
			if (m == 0 && en.indexOf(M_rdd) != -1) return true;
			if (m == 1 && en.indexOf(M_rda) != -1) return true;
			if (m == 2 && en.indexOf(M_ria) != -1) return true;
			if (m == 3 && en.indexOf(M_ripo) != -1) return true;
			if (m == 4 && en.indexOf(M_ripr) != -1) return true;
			if (m == 5 && en.indexOf(M_rid) != -1) return true;
			if (m == 6 && en.indexOf(M_rii) != -1) return true;
		}
		return false;
	}

	function getEACycs(ea, z) {
		var m = ea >> 3;
		if (m == 7) {
			switch (ea & 7) {
				case 0: return z == 4 ? [12,3,0] : [ 8,2,0]; //absw
				case 1: return z == 4 ? [16,4,0] : [12,3,0]; //absl
				case 2: return z == 4 ? [12,3,0] : [ 8,2,0]; //pcid
				case 3: return z == 4 ? [14,3,0] : [10,2,0]; //pcii
				case 4: return z == 4 ? [ 8,2,0] : [ 4,1,0]; //imm
			}
		} else {
			switch (m) {
				case 0: return [0,0,0]; //rdd
				case 1: return [0,0,0]; //rda
				case 2: return z == 4 ? [ 8,2,0] : [ 4,1,0]; //ria
				case 3: return z == 4 ? [ 8,2,0] : [ 4,1,0]; //ripo
				case 4: return z == 4 ? [10,2,0] : [ 6,1,0]; //ripr
				case 5: return z == 4 ? [12,3,0] : [ 8,2,0]; //rid
				case 6: return z == 4 ? [14,3,0] : [10,2,0]; //rii
			}
		}
	}
	function addCycs(c1, c2) {
		c1[0] += c2[0];
		c1[1] += c2[1];
		c1[2] += c2[2];
		return c1;
	}

	function mkI(op, mn, cyc) {
		return {
			op: op,
			mn: mn,
			p: {
				op:op,
				cyc:cyc
			}
		};
	}

	function mkDiss(ext, sm, s, dm, d, z, z2) {
		if (sm && dm)
			return {
				ext:ext,
				sm:sm,
				s:s,
				dm:dm,
				d:d,
				z:z,
				z2:z2
			};
		else if (dm)
			return {
				ext:ext,
				dm:dm,
				d:d,
				z:z,
				z2:z2
			};
		else
			return {
				ext:ext,
				z:z,
				z2:z2
			};
	}

	function mkITab() {
		var op, cnt = 0; //45827
		var old = 0;

		iTab = new Array(0x10000);
		for (op = 0; op < 0x10000; op++) {
			iTab[op] = {
				op: -1,
				mn: "ILLEGAL",
				p: op, /* opcode as param for ILLEGAL or real param if function */
				f: ILLEGAL
			};
		}

		/*-----------------------------------------------------------------------*/
		/* Data Movement */

		//EXG
		{
			for (var m = 0; m < 3; m++) {
				var opm = m == 0 ? 8 : (m == 1 ? 9 : 17);
				for (var Rx = 0; Rx < 8; Rx++) {
					for (var Ry = 0; Ry < 8; Ry++) {
						op = (12 << 12) | (Rx << 9) | (1 << 8) | (opm << 3) | Ry;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, "EXG", [6,1,0]);
							iTab[op].p.Rx = Rx;
							iTab[op].p.Ry = Ry;
							if (m == 0) {
								iTab[op].f = I_EXG_DD;
								iTab[op].d = mkDiss(0, D_RDD,Rx, D_RDD,Ry, 4,0);
							} else if (m == 1) {
								iTab[op].f = I_EXG_AA;
								iTab[op].d = mkDiss(0, D_RDA,Rx, D_RDA,Ry, 4,0);
							} else {
								iTab[op].f = I_EXG_DA;
								iTab[op].d = mkDiss(0, D_RDD,Rx, D_RDA,Ry, 4,0);
							}
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists EXG "+op);
							return false;
						}
					}
				}
			}
		}
		//LEA
		{
			var en = [M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (var An = 0; An < 8; An++) {
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (4 << 12) | (An << 9) | (7 << 6) | ea;
						if (iTab[op].op === -1) {
							var cyc;
							switch (getEAMode(ea)) {
								case M_ria:  cyc = [ 4,1,0]; break;
								case M_rid:  cyc = [ 8,2,0]; break;
								case M_rii:  cyc = [12,2,0]; break;
								case M_pcid: cyc = [ 8,2,0]; break;
								case M_pcii: cyc = [12,2,0]; break;
								case M_absw: cyc = [ 8,2,0]; break;
								case M_absl: cyc = [12,3,0]; break;
							}
							iTab[op] = mkI(op, "LEA", cyc);
							iTab[op].p.An = An;
							iTab[op].p.ea = ea;
							iTab[op].f = I_LEA;
							iTab[op].d = mkDiss(0, D_EA,ea, D_RDA,An, 4,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists LEA "+op);
							return false;
						}
					}
				}
			}
		}
		//PEA
		{
			var en = [M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (289 << 6) | ea;
					if (iTab[op].op === -1) {
						var cyc;
						switch (getEAMode(ea)) {
							case M_ria:  cyc = [12,1,2]; break;
							case M_rid:  cyc = [16,2,2]; break;
							case M_rii:  cyc = [20,2,2]; break;
							case M_pcid: cyc = [16,2,2]; break;
							case M_pcii: cyc = [20,2,2]; break;
							case M_absw: cyc = [16,2,2]; break;
							case M_absl: cyc = [20,3,2]; break;
						}
						iTab[op] = mkI(op, "PEA", cyc);
						iTab[op].p.ea = ea;
						iTab[op].f = I_PEA;
						iTab[op].d = mkDiss(0, false,false, D_EA,ea, 4,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists PEA " + op);
						return false;
					}
				}
			}
		}
		//LINK
		{
			for (var An = 0; An < 8; An++) {
				op = (2506 << 3) | An;
				if (iTab[op].op === -1) {
					iTab[op] = mkI(op, "LINK", [16,2,2]);
					iTab[op].p.An = An;
					iTab[op].f = I_LINK;
					iTab[op].d = mkDiss(0, D_RDA,An, D_IME,1, 2,0);
					cnt++;
				} else {
					SAEF_error("cpu.mkITab() op exists LINK "+op);
					return false;
				}
			}
			if (model >= 68020) {
				for (var An = 0; An < 8; An++) {
					op = (2305 << 3) | An;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "LINK", [16,2,2]); //FIXME cycles
						iTab[op].p.An = An;
						iTab[op].f = I_LINK_32;
						iTab[op].d = mkDiss(0, D_RDA,An, D_IME,2, 4,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists LINK "+op);
						return false;
					}
				}
			}
		}
		//UNLK
		{
			for (var An = 0; An < 8; An++) {
				op = (2507 << 3) | An;
				if (iTab[op].op === -1) {
					iTab[op] = mkI(op, "UNLK", [12,3,0]);
					iTab[op].p.An = An;
					iTab[op].f = I_UNLK;
					iTab[op].d = mkDiss(0, false,false, D_RDA,An, 0,0);
					cnt++;
				} else {
					SAEF_error("cpu.mkITab() op exists UNLK "+op);
					return false;
				}
			}
		}
		//MOVE
		{
			var tab2 = [
				[[ 4,1,0],null,[ 8,1,1],[ 8,1,1],[ 8,1,1],[12,2,1],[14,2,1],null,null,[12,2,1],[16,3,1],null],
				[[ 4,1,0],null,[ 8,1,1],[ 8,1,1],[ 8,1,1],[12,2,1],[14,2,1],null,null,[12,2,1],[16,3,1],null],
				[[ 8,2,0],null,[12,2,1],[12,2,1],[12,2,1],[16,3,1],[18,3,1],null,null,[16,3,1],[20,4,1],null],
				[[ 8,2,0],null,[12,2,1],[12,2,1],[12,2,1],[16,3,1],[18,3,1],null,null,[16,3,1],[20,4,1],null],
				[[10,2,0],null,[14,2,1],[14,2,1],[14,2,1],[18,3,1],[20,4,1],null,null,[18,3,1],[22,4,1],null],
				[[12,3,0],null,[16,3,1],[16,3,1],[16,3,1],[20,4,1],[22,4,1],null,null,[20,4,1],[24,5,1],null],
				[[14,3,0],null,[18,3,1],[18,3,1],[18,3,1],[22,4,1],[24,4,1],null,null,[22,4,1],[26,5,1],null],
				[[12,3,0],null,[16,3,1],[16,3,1],[16,3,1],[20,4,1],[22,4,1],null,null,[20,4,1],[24,5,1],null],
				[[14,3,0],null,[18,3,1],[18,3,1],[18,3,1],[22,4,1],[24,4,1],null,null,[22,4,1],[26,5,1],null],
				[[12,3,0],null,[16,3,1],[16,3,1],[16,3,1],[20,4,1],[22,4,1],null,null,[20,4,1],[24,5,1],null],
				[[16,4,0],null,[20,4,1],[20,4,1],[20,4,1],[24,5,1],[26,5,1],null,null,[24,5,1],[28,6,1],null],
				[[ 8,2,0],null,[12,2,1],[12,2,1],[12,2,1],[16,3,1],[18,3,1],null,null,[16,3,1],[20,4,1],null]
			];
			var tab4 = [
				[[ 4,1,0],null,[12,1,2],[12,1,2],[12,1,2],[16,2,2],[18,2,2],null,null,[16,2,2],[20,3,2],null],
				[[ 4,1,0],null,[12,1,2],[12,1,2],[12,1,2],[16,2,2],[18,2,2],null,null,[16,2,2],[20,3,2],null],
				[[12,3,0],null,[20,3,2],[20,3,2],[20,3,2],[24,4,2],[26,4,2],null,null,[24,4,2],[28,5,2],null],
				[[12,3,0],null,[20,3,2],[20,3,2],[20,3,2],[24,4,2],[26,4,2],null,null,[24,4,2],[28,5,2],null],
				[[14,3,0],null,[22,3,2],[22,3,2],[22,3,2],[26,4,2],[28,4,2],null,null,[26,4,2],[30,5,2],null],
				[[16,4,0],null,[24,4,2],[24,4,2],[24,4,2],[28,5,2],[30,5,2],null,null,[28,5,2],[32,6,2],null],
				[[18,4,0],null,[26,4,2],[26,4,2],[26,4,2],[30,5,2],[32,5,2],null,null,[30,5,2],[34,6,2],null],
				[[16,4,0],null,[24,4,2],[24,4,2],[24,4,2],[28,5,2],[30,5,2],null,null,[28,5,2],[32,5,2],null],
				[[18,4,0],null,[26,4,2],[26,4,2],[26,4,2],[30,5,2],[32,5,2],null,null,[30,5,2],[34,6,2],null],
				[[16,4,0],null,[24,4,2],[24,4,2],[24,4,2],[28,5,2],[30,5,2],null,null,[28,5,2],[32,6,2],null],
				[[20,5,0],null,[28,5,2],[28,5,2],[28,5,2],[32,6,2],[34,6,2],null,null,[32,6,2],[36,7,2],null],
				[[12,3,0],null,[20,3,2],[20,3,2],[20,3,2],[24,4,2],[26,4,2],null,null,[24,4,2],[28,5,2],null]
			];
			var den = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				var z3 = z == 0 ? 1 : (z == 1 ? 3 : 2);
				for (var dea = 0; dea < 61; dea++) {
					if (isEA(dea, den)) {
						for (var sea = 0; sea < 61; sea++) {
							if (z2 == 1 && sea >> 3 == 1) continue; //For byte size operation, address register direct is not allowed.
							var deainv = ((dea & 7) << 3) | (dea >> 3);
							op = (z3 << 12) | (deainv << 6) | sea;
							if (iTab[op].op === -1) {
								iTab[op] = mkI(op, "MOVE", z2 == 4 ? tab4[getEAMode(sea)-1][getEAMode(dea)-1] : tab2[getEAMode(sea)-1][getEAMode(dea)-1]);
								iTab[op].p.sea = sea;
								iTab[op].p.dea = dea;
								iTab[op].p.zm = z2 == 1 ? 0x80 : (z2 == 2 ? 0x8000 : 0x80000000);
								iTab[op].f = z2 == 4 ? I_MOVE_32 : (z2 == 2 ? I_MOVE_16 : I_MOVE_8);
								iTab[op].d = mkDiss(0, D_EA,sea, D_EA,dea, z2,0);
								cnt++;
							} else {
								SAEF_error("cpu.mkITab() op exists MOVE "+op);
								return false;
							}
						}
					}
				}
			}
		}
		//MOVEA
		{
			var tab2 = [[4,1,0],[4,1,0],[ 8,2,0],[ 8,2,0],[10,2,0],[12,3,0],[14,3,0],[12,3,0],[14,3,0],[12,3,0],[16,4,0],[ 8,2,0]];
			var tab4 = [[4,1,0],[4,1,0],[12,3,0],[12,3,0],[14,3,0],[16,4,0],[18,4,0],[16,4,0],[18,4,0],[16,4,0],[20,5,0],[12,3,0]];
			for (var z = 1; z < 3; z++) {
				var z2 = z == 1 ? 2 : 4;
				var z3 = z == 1 ? 3 : 2;
				for (var An = 0; An < 8; An++) {
					for (var ea = 0; ea < 61; ea++) {
						op = (z3 << 12) | (An << 9) | (1 << 6) | ea;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, "MOVEA", z2 == 4 ? tab4[getEAMode(ea)-1] : tab2[getEAMode(ea)-1]);
							iTab[op].p.An = An;
							iTab[op].p.ea = ea;
							iTab[op].f = z2 == 4 ? I_MOVEA_32 : I_MOVEA_16;
							iTab[op].d = mkDiss(0, D_EA,ea, D_RDA,An, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists MOVEA "+op);
							return false;
						}
					}
				}
			}
		}
		//MOVEQ
		{
			for (var Dn = 0; Dn < 8; Dn++) {
				for (var d = 0; d < 256; d++) {
					op = (7 << 12) | (Dn << 9) | d;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "MOVEQ", [4,1,0]);
						iTab[op].p.Dn = Dn;
						iTab[op].p.data = d;
						iTab[op].p.zm = 0x80000000;
						iTab[op].f = I_MOVEQ;
						iTab[op].d = mkDiss(0, D_IMD,d, D_RDD,Dn, 4,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists MOVEQ " + op);
						return false;
					}
				}
			}
		}
		//MOVEM
		/*
				size	(An)		(An)+			-(An)		d(An)			d(An,ix)+	xxx.W		xxx.L		d(PC)		d(PC,ix)*
		---------------------------------------------------------------------------------------------------------------
		R->M	word	8+4n	   -		  		8+4n	  	12+4n			14+4n      12+4n      16+4n	-			-
						(2/n)	   -		 		(2/n)	  	(3/n)       (3/n)      (3/n)      (4/n)	-			-

				long	8+8n	   -		  		8+8n	  	12+8n       14+8n      12+8n      16+8n	-			-
					(2/2n)	   -				(2/2n)	(3/2n)		(3/2n)     (3/2n)     (4/2n)	-			-

		M->R	word	12+4n		12+4n			-	  		16+4n			18+4n      	16+4n    20+4n	   16+4n		18+4n
						(3+n/0)	(3+n/0)		-			(4+n/0)     (4+n/0)    	(4+n/0)  (5+n/0)	(4+n/0)  (4+n/0)

				long	12+8n		12+8n	  		-	  		16+8n       18+8n      	16+8n    20+8n	   16+8n    18+8n
						(3+2n/0)	(3+2n/0)	  	-    		(4+2n/0)    (4+2n/0)   	(4+2n/0) (5+2n/0)	(4+2n/0) (4+2n/0)
		*/
		{
			for (var z = 0; z < 2; z++) {
				var z2 = z == 0 ? 2 : 4;
				for (var dr = 0; dr < 2; dr++) {
					if (dr == 0) en = [M_ria, M_ripr, M_rid, M_rii, M_absw, M_absl];
					else en = [M_ria, M_ripo, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
					for (var ea = 0; ea < 61; ea++) {
						if (isEA(ea, en)) {
							op = (9 << 11) | (dr << 10) | (1 << 7) | (z << 6) | ea;
							if (iTab[op].op === -1) {
								var cyc, m = getEAMode(ea);
								if (dr == 0) {
									switch (m) {
										case M_ria: cyc = [8,2,0]; break;
										case M_ripr: cyc = [8,2,0]; break;
										case M_rid: cyc = [12,3,0]; break;
										case M_rii: cyc = [14,3,0]; break;
										case M_absw: cyc = [12,3,0]; break;
										case M_absl: cyc = [16,4,0]; break;
									}
									iTab[op] = mkI(op, "MOVEM", cyc);
									iTab[op].f = z2 == 2 ? I_MOVEM_R2M_16 : I_MOVEM_R2M_32;
									iTab[op].d = mkDiss(1, D_EXT_MOVEM,m == M_ripr, D_EA,ea, z2,0);
								} else {
									switch (m) {
										case M_ria: cyc = [12,3,0]; break;
										case M_ripo: cyc = [12,3,0]; break;
										case M_rid: cyc = [16,4,0]; break;
										case M_rii: cyc = [18,4,0]; break;
										case M_pcid: cyc = [16,4,0]; break;
										case M_pcii: cyc = [20,5,0]; break;
										case M_absw: cyc = [16,4,0]; break;
										case M_absl: cyc = [18,4,0]; break;
									}
									iTab[op] = mkI(op, "MOVEM", cyc);
									iTab[op].f = z2 == 2 ? I_MOVEM_M2R_16 : I_MOVEM_M2R_32;
									iTab[op].d = mkDiss(1, D_EA,ea, D_EXT_MOVEM,m == M_ripr, z2,0);
								}
								iTab[op].p.ea = ea;
								cnt++;
							} else {
								SAEF_error("cpu.mkITab() op exists MOVEM " + op);
								return false;
							}
						}
					}
				}
			}
		}
		//MOVEP
		{
			for (var m = 4; m < 8; m++) {
				for (var Dn = 0; Dn < 8; Dn++) {
					for (var An = 0; An < 8; An++) {
						op = (Dn << 9) | (m << 6) | (1 << 3) | An;
						if (iTab[op].op === -1) {
							if (m == 4) {
								iTab[op] = mkI(op, "MOVEP", [16,4,0]);
								iTab[op].f = I_MOVEP_M2R_16;
								iTab[op].d = mkDiss(0, D_RID,An, D_RDD,Dn, 2,0);
							}
							else if (m == 5) {
								iTab[op] = mkI(op, "MOVEP", [24,6,0]);
								iTab[op].f = I_MOVEP_M2R_32;
								iTab[op].d = mkDiss(0, D_RID,An, D_RDD,Dn, 4,0);
							}
							else if (m == 6) {
								iTab[op] = mkI(op, "MOVEP", [16,2,2]);
								iTab[op].f = I_MOVEP_R2M_16;
								iTab[op].d = mkDiss(0, D_RDD,Dn, D_RID,An, 2,0);
							}
							else {
								iTab[op] = mkI(op, "MOVEP", [24,2,4]);
								iTab[op].f = I_MOVEP_R2M_32;
								iTab[op].d = mkDiss(0, D_RDD,Dn, D_RID,An, 4,0);
							}
							iTab[op].p.Dn = Dn;
							iTab[op].p.An = An;
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists MOVEP " + op);
							return false;
						}
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* Integer - Basic */

		//ADD
		{
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var dir = 0; dir < 2; dir++) {
					for (var Dn = 0; Dn < 8; Dn++) {
						for (var ea = 0; ea < 61; ea++) {
							if (dir == 0 || (dir == 1 && isEA(ea, en))) {
								var m = getEAMode(ea);
								if (dir == 0 && m == M_rda && z == 0) continue; //An word and long only
								op = (13 << 12) | (Dn << 9) | (dir << 8) | (z << 6) | ea;
		  						if (iTab[op].op === -1) {
									iTab[op] = mkI(op, "ADD", []);
									iTab[op].p.Dn = Dn;
									iTab[op].p.ea = ea;
									iTab[op].p.zm = z2 == 4 ? 0x80000000 : (z2 == 2 ? 0x8000 : 0x80);
									if (dir == 0) {
										iTab[op].p.cyc = addCycs(z2 == 4 ? (m == M_rdd || m == M_imm ? [8,1,0]:[6,1,0]) : [4,1,0], getEACycs(ea, z2));
										iTab[op].f = z2 == 4 ? I_ADD_ED_32 : (z2 == 2 ? I_ADD_ED_16 : I_ADD_ED_8);
										iTab[op].d = mkDiss(0, D_EA,ea, D_RDD,Dn, z2,0);
									} else {
										iTab[op].p.cyc = addCycs(z2 == 4 ? [12,1,2] : [8,1,1], getEACycs(ea, z2));
										iTab[op].f = z2 == 4 ? I_ADD_DE_32 : (z2 == 2 ? I_ADD_DE_16 : I_ADD_DE_8);
										iTab[op].d = mkDiss(0, D_RDD,Dn, D_EA,ea, z2,0);
									}
									cnt++;
								} else {
									SAEF_error("cpu.mkITab() op exists ADD " + op);
									return false;
								}
							}
						}
					}
				}
			}
		}
		//SUB
		{
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var dir = 0; dir < 2; dir++) {
					for (var Dn = 0; Dn < 8; Dn++) {
						for (var ea = 0; ea < 61; ea++) {
							if (dir == 0 || (dir == 1 && isEA(ea, en))) {
								var m = getEAMode(ea);
								if (dir == 0 && m == M_rda && z == 0) continue; //An word and long only
								op = (9 << 12) | (Dn << 9) | (dir << 8) | (z << 6) | ea;
								if (iTab[op].op === -1) {
									iTab[op] = mkI(op, "SUB", []);
									iTab[op].p.Dn = Dn;
									iTab[op].p.ea = ea;
									iTab[op].p.zm = z2 == 4 ? 0x80000000 : (z2 == 2 ? 0x8000 : 0x80);
									if (dir == 0) {
										iTab[op].p.cyc = addCycs(z2 == 4 ? (m == M_rdd || m == M_imm ? [8,1,0]:[6,1,0]) : [4,1,0], getEACycs(ea, z2));
										iTab[op].f = z2 == 4 ? I_SUB_ED_32 : (z2 == 2 ? I_SUB_ED_16 : I_SUB_ED_8);
										iTab[op].d = mkDiss(0, D_EA,ea, D_RDD,Dn, z2,0);
									} else {
										iTab[op].p.cyc = addCycs(z2 == 4 ? [12,1,2] : [8,1,1], getEACycs(ea, z2));
										iTab[op].f = z2 == 4 ? I_SUB_DE_32 : (z2 == 2 ? I_SUB_DE_16 : I_SUB_DE_8);
										iTab[op].d = mkDiss(0, D_RDD,Dn, D_EA,ea, z2,0);
									}
									cnt++;
								} else {
									SAEF_error("cpu.mkITab() op exists SUB "+op);
									return false;
								}
							}
						}
					}
				}
			}
		}
		//CMP
		{
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var Dn = 0; Dn < 8; Dn++) {
					for (var ea = 0; ea < 61; ea++) {
						var m = getEAMode(ea);
						if (m == M_rda && z == 0) continue; //An word and long only
						op = (11 << 12) | (Dn << 9) | (z << 6) | ea;
						if (iTab[op].op === -1) {
							var cyc = z2 == 4 ? [6,1,0] : [4,1,0];
							if (!(m == M_rdd || m == M_rda)) cyc = addCycs(cyc, getEACycs(ea, z2));
							iTab[op] = mkI(op, "CMP", cyc);
							iTab[op].p.Dn = Dn;
							iTab[op].p.ea = ea;
							iTab[op].f = z2 == 4 ? I_CMP_32 : (z2 == 2 ? I_CMP_16 : I_CMP_8);
							iTab[op].d = mkDiss(0, D_EA,ea, D_RDD,Dn, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists CMP "+op);
							return false;
						}
					}
				}
			}
		}
		//CLR
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (66 << 8) | (z << 6) | ea;
						if (iTab[op].op === -1) {
							var m = getEAMode(ea);
							var cyc = m == M_rdd ? (z2 == 4 ? [6,1,0]:[4,1,0]) : (z2 == 4 ? [12,1,2]:[8,1,1]);
							if (m == M_rdd) cyc = addCycs(cyc, getEACycs(ea, z2));
							iTab[op] = mkI(op, "CLR", cyc);
							iTab[op].p.ea = ea;
							iTab[op].f = z2 == 4 ? I_CLR_32 : (z2 == 2 ? I_CLR_16 : I_CLR_8);
							iTab[op].d = mkDiss(0, false,false, D_EA,ea, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists CLR "+op);
							return false;
						}
					}
				}
			}
		}
		//NEG
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (68 << 8) | (z << 6) | ea;
						if (iTab[op].op === -1) {
							var m = getEAMode(ea);
							var cyc = m == M_rdd ? (z2 == 4 ? [6,1,0]:[4,1,0]) : (z2 == 4 ? [12,1,2]:[8,1,1]);
							iTab[op] = mkI(op, "NEG", cyc);
							if (m == M_rdd) {
								iTab[op].p.Dn = ea & 7;
								iTab[op].f = z2 == 4 ? I_NEG_D_32 : (z2 == 2 ? I_NEG_D_16 : I_NEG_D_8);
							} else {
								iTab[op].p.ea = ea;
								iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, z2));
								iTab[op].f = z2 == 4 ? I_NEG_E_32 : (z2 == 2 ? I_NEG_E_16 : I_NEG_E_8);
							}
							iTab[op].d = mkDiss(0, false,false, D_EA,ea, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists NEG "+op);
							return false;
						}
					}
				}
			}
		}
		//MULS
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			for (var Dn = 0; Dn < 8; Dn++) {
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (12 << 12) | (Dn << 9) | (7 << 6) | ea;
						if (iTab[op].op === -1) {
							var avg = ((70 - 38) / 2 + 38) >>> 0; /* average */
							var cyc = getEAMode(ea) == M_rdd ? [70,1,0] : addCycs([70,1,0], getEACycs(ea, z2));
							iTab[op] = mkI(op, "MULS", cyc);
							iTab[op].p.Dn = Dn;
							iTab[op].p.ea = ea;
							iTab[op].f = I_MULS;
							iTab[op].d = mkDiss(0, D_EA,ea, D_RDD,Dn, 2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists MULS "+op);
							return false;
						}
					}
				}
			}
		}
		//MULU
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			for (var Dn = 0; Dn < 8; Dn++) {
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (12 << 12) | (Dn << 9) | (3 << 6) | ea;
						if (iTab[op].op === -1) {
							var avg = ((70 - 38) / 2 + 38) >>> 0; /* average */
							var cyc = getEAMode(ea) == M_rdd ? [avg,1,0] : addCycs([avg,1,0], getEACycs(ea, z2));
							iTab[op] = mkI(op, "MULU", cyc);
							iTab[op].p.Dn = Dn;
							iTab[op].p.ea = ea;
							iTab[op].f = I_MULU;
							iTab[op].d = mkDiss(0, D_EA,ea, D_RDD,Dn, 2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists MULU "+op);
							return false;
						}
					}
				}
			}
		}
		//MULx
		if (model >= 68020) {
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (304 << 6) | ea;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "MULx", [40,0,0]); //FIXME cycles
						iTab[op].p.ea = ea;
						iTab[op].f = I_MULx;
						iTab[op].d = mkDiss(1, D_EA,ea, D_EXT_MUL64,0, 4,0); //FIXME
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists MULx "+op);
						return false;
					}
				}
			}
		}
		//DIVS
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			for (var Dn = 0; Dn < 8; Dn++) {
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (8 << 12) | (Dn << 9) | (7 << 6) | ea;
						if (iTab[op].op === -1) {
							var avg = (156 - (156 - 120) / 2) >>> 0; /* average */
							var cyc = getEAMode(ea) == M_rdd ? [avg,1,0] : addCycs([avg,1,0], getEACycs(ea, z2));
							iTab[op] = mkI(op, "DIVS", cyc);
							iTab[op].p.Dn = Dn;
							iTab[op].p.ea = ea;
							iTab[op].f = I_DIVS;
							iTab[op].d = mkDiss(0, D_EA,ea, D_RDD,Dn, 2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists DIVS "+op);
							return false;
						}
					}
				}
			}
		}
		//DIVU
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			for (var Dn = 0; Dn < 8; Dn++) {
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (8 << 12) | (Dn << 9) | (3 << 6) | ea;
						if (iTab[op].op === -1) {
							var avg = (136 - (136 - 76) / 2) >>> 0; /* average */
							var cyc = getEAMode(ea) == M_rdd ? [avg,1,0] : addCycs([avg,1,0], getEACycs(ea, z2));
							iTab[op] = mkI(op, "DIVU", cyc);
							iTab[op].p.Dn = Dn;
							iTab[op].p.ea = ea;
							iTab[op].f = I_DIVU;
							iTab[op].d = mkDiss(0, D_EA,ea, D_RDD,Dn, 2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists DIVU "+op);
							return false;
						}
					}
				}
			}
		}
		//DIVx
		if (model >= 68020) {
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (305 << 6) | ea;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "DIVx", [70,0,0]); //FIXME cycles
						iTab[op].p.ea = ea;
						iTab[op].f = I_DIVx;
						iTab[op].d = mkDiss(1, D_EA,ea, D_EXT_DIV64,0, 4,0); //FIXME
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists DIVx "+op);
						return false;
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* Integer - Extended */

		//ADDX
		{
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var rm = 0; rm < 2; rm++) {
					for (var Rx = 0; Rx < 8; Rx++) {
						for (var Ry = 0; Ry < 8; Ry++) {
							op = (13 << 12) | (Rx << 9) | (1 << 8) | (z << 6) | (rm << 3) | Ry;
							if (iTab[op].op === -1) {
								var cyc = rm == 0 ? (z2 == 4 ? [8,1,0] : [4,1,0]) : (z2 == 4 ? [30,5,2] : [18,3,1]);
								iTab[op] = mkI(op, "ADDX", cyc);
								iTab[op].p.Rx = Rx;
								iTab[op].p.Ry = Ry;
								if (rm == 0) {
									iTab[op].f = z2 == 4 ? I_ADDX_D_32 : (z2 == 2 ? I_ADDX_D_16 : I_ADDX_D_8);
									iTab[op].d = mkDiss(0, D_RDD,Ry, D_RDD,Rx, z2,0);
								} else {
									iTab[op].f = z2 == 4 ? I_ADDX_M_32 : (z2 == 2 ? I_ADDX_M_16 : I_ADDX_M_8);
									iTab[op].d = mkDiss(0, D_RIPR,Ry, D_RIPR,Rx, z2,0);
								}
								cnt++;
							} else {
								SAEF_error("cpu.mkITab() op exists ADDX "+op);
								return false;
							}
						}
					}
				}
			}
		}
		//SUBX
		{
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var rm = 0; rm < 2; rm++) {
					for (var Rx = 0; Rx < 8; Rx++) {
						for (var Ry = 0; Ry < 8; Ry++) {
							op = (9 << 12) | (Ry << 9) | (1 << 8) | (z << 6) | (rm << 3) | Rx;
							if (iTab[op].op === -1) {
								var cyc = rm == 0 ? (z2 == 4 ? [8,1,0] : [4,1,0]) : (z2 == 4 ? [30,5,2] : [18,3,1]);
								iTab[op] = mkI(op, "SUBX", cyc);
								iTab[op].p.Rx = Rx;
								iTab[op].p.Ry = Ry;
								if (rm == 0) {
									iTab[op].f = z2 == 4 ? I_SUBX_D_32 : (z2 == 2 ? I_SUBX_D_16 : I_SUBX_D_8);
									iTab[op].d = mkDiss(0, D_RDD,Rx, D_RDD,Ry, z2,0);
								} else {
									iTab[op].f = z2 == 4 ? I_SUBX_M_32 : (z2 == 2 ? I_SUBX_M_16 : I_SUBX_M_8);
									iTab[op].d = mkDiss(0, D_RIPR,Rx, D_RIPR,Ry, z2,0);
								}
								cnt++;
							} else {
								SAEF_error("cpu.mkITab() op exists SUBX "+op);
								return false;
							}
						}
					}
				}
			}
		}
		//NEGX
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (64 << 8) | (z << 6) | ea;
						if (iTab[op].op === -1) {
							var m = getEAMode(ea);
							var cyc = m == M_rdd ? (z2 == 4 ? [6,1,0]:[4,1,0]) : (z2 == 4 ? [12,1,2]:[8,1,1]);
							iTab[op] = mkI(op, "NEGX", cyc);
							if (m == M_rdd) {
								iTab[op].p.Dn = ea & 7;
								iTab[op].f = z2 == 4 ? I_NEGX_D_32 : (z2 == 2 ? I_NEGX_D_16 : I_NEGX_D_8);
							} else {
								iTab[op].p.ea = ea;
								iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, z2));
								iTab[op].f = z2 == 4 ? I_NEGX_E_32 : (z2 == 2 ? I_NEGX_E_16 : I_NEGX_E_8);
							}
							iTab[op].d = mkDiss(0, false,false, D_EA,ea, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists NEGX "+op);
							return false;
						}
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* Integer - Address */

		//ADDA
		{
			for (var z = 1; z < 3; z++) {
				var z2 = z == 1 ? 2 : 4;
				var z3 = z == 1 ? 3 : 7;
				for (var An = 0; An < 8; An++) {
					for (var ea = 0; ea < 61; ea++) {
						op = (13 << 12) | (An << 9) | (z3 << 6) | ea;
						if (iTab[op].op === -1) {
							var cyc = z2 == 4 ? (m == M_rdd || m == M_rda || m == M_imm ? [8,1,0] : [6,1,0]) : [8,1,0];
							if (!(m == M_rdd || m == M_rda)) cyc = addCycs(cyc, getEACycs(ea, z2));
							iTab[op] = mkI(op, "ADDA", cyc);
							iTab[op].p.An = An;
							iTab[op].p.ea = ea;
							iTab[op].f = z2 == 4 ? I_ADDA_32 : I_ADDA_16;
							iTab[op].d = mkDiss(0, D_EA,ea, D_RDA,An, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists ADDA "+op);
							return false;
						}
					}
				}
			}
		}
		//SUBA
		{
			for (var z = 1; z < 3; z++) {
				var z2 = z == 1 ? 2 : 4;
				var z3 = z == 1 ? 3 : 7;
				for (var An = 0; An < 8; An++) {
					for (var ea = 0; ea < 61; ea++) {
						op = (9 << 12) | (An << 9) | (z3 << 6) | ea;
						if (iTab[op].op === -1) {
							var cyc = z2 == 4 ? (m == M_rdd || m == M_rda || m == M_imm ? [8,1,0] : [6,1,0]) : [8,1,0];
							if (!(m == M_rdd || m == M_rda)) cyc = addCycs(cyc, getEACycs(ea, z2));
							iTab[op] = mkI(op, "SUBA", cyc);
							iTab[op].p.An = An;
							iTab[op].p.ea = ea;
							iTab[op].f = z2 == 4 ? I_SUBA_32 : I_SUBA_16;
							iTab[op].d = mkDiss(0, D_EA,ea, D_RDA,An, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists SUBA "+op);
							return false;
						}
					}
				}
			}
		}
		//CMPA
		{
			for (var z = 1; z < 3; z++) {
				var z2 = z == 1 ? 2 : 4;
				var z3 = z == 1 ? 3 : 7;
				for (var An = 0; An < 8; An++) {
					for (var ea = 0; ea < 61; ea++) {
						op = (11 << 12) | (An << 9) | (z3 << 6) | ea;
						if (iTab[op].op === -1) {
							var cyc = [6,1,0];
							if (!(m == M_rdd || m == M_rda)) cyc = addCycs(cyc, getEACycs(ea, z2));
							iTab[op] = mkI(op, "CMPA", cyc);
							iTab[op].p.An = An;
							iTab[op].p.ea = ea;
							iTab[op].f = z2 == 4 ? I_CMPA_32 : I_CMPA_16;
							iTab[op].d = mkDiss(0, D_EA,ea, D_RDA,An, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists CMPA "+op);
							return false;
						}
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* Integer - Immediate */

		//ADDI
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (6 << 8) | (z << 6) | ea;
						if (iTab[op].op === -1) {
							var m = getEAMode(ea);
							var cyc = m == M_rdd ? (z2 == 4 ? [16,3,0]:[8,2,0]) : (z2 == 4 ? [20,3,2]:[12,2,1]);
							iTab[op] = mkI(op, "ADDI", cyc);
							if (m == M_rdd) {
								iTab[op].p.Dn = ea & 7;
								iTab[op].f = z2 == 4 ? I_ADDI_D_32 : (z2 == 2 ? I_ADDI_D_16 : I_ADDI_D_8);
							} else {
								iTab[op].p.ea = ea;
								iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, z2));
								iTab[op].f = z2 == 4 ? I_ADDI_E_32 : (z2 == 2 ? I_ADDI_E_16 : I_ADDI_E_8);
							}
							iTab[op].d = mkDiss(0, D_IME,z2 == 4 ? 2 : 1, D_EA,ea, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists ADDI "+op);
							return false;
						}
					}
				}
			}
		}
		//SUBI
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (4 << 8) | (z << 6) | ea;
						if (iTab[op].op === -1) {
							var m = getEAMode(ea);
							var cyc = m == M_rdd ? (z2 == 4 ? [16,3,0]:[8,2,0]) : (z2 == 4 ? [20,3,2]:[12,2,1]);
							iTab[op] = mkI(op, "SUBI", cyc);
							if (m == M_rdd) {
								iTab[op].p.Dn = ea & 7;
								iTab[op].f = z2 == 4 ? I_SUBI_D_32 : (z2 == 2 ? I_SUBI_D_16 : I_SUBI_D_8);
							} else {
								iTab[op].p.ea = ea;
								iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, z2));
								iTab[op].f = z2 == 4 ? I_SUBI_E_32 : (z2 == 2 ? I_SUBI_E_16 : I_SUBI_E_8);
							}
							iTab[op].d = mkDiss(0, D_IME,z2 == 4 ? 2 : 1, D_EA,ea, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists SUBI "+op);
							return false;
						}
					}
				}
			}
		}
		//CMPI
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			if (model >= 68020) en.push(M_pcid, M_pcii);
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (12 << 8) | (z << 6) | ea;
						if (iTab[op].op === -1) {
							var m = getEAMode(ea);
							var cyc = m == M_rdd ? (z2 == 4 ? [14,3,0]:[8,2,0]) : (z2 == 4 ? [12,3,0]:[8,2,0]);
							if (m != M_rdd) cyc = addCycs(cyc, getEACycs(ea, z2));
							iTab[op] = mkI(op, "CMPI", cyc);
							iTab[op].p.ea = ea;
							iTab[op].f = z2 == 4 ? I_CMPI_32 : (z2 == 2 ? I_CMPI_16 : I_CMPI_8);
							iTab[op].d = mkDiss(0, D_IME,z2 == 4 ? 2 : 1, D_EA,ea, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists CMPI "+op);
							return false;
						}
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* Integer - Quick */

		//ADDQ
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var id = 0; id < 8; id++) {
					for (var ea = 0; ea < 61; ea++) {
						if (isEA(ea, en)) {
							var m = getEAMode(ea);
							if (m == M_rda && z == 0) continue; //An word and long only
							op = (5 << 12) | (id << 9) | (z << 6) | ea;
							if (iTab[op].op === -1) {
								var cyc = m == M_rda ? [8,1,0] : (m == M_rdd ? (z2 == 4 ? [8,1,0]:[4,1,0]) : (z2 == 4 ? [12,1,2]:[8,1,1]));
								iTab[op] = mkI(op, "ADDQ", cyc);
								iTab[op].p.data = id == 0 ? 8 : id;
								if (m == M_rdd) {
									iTab[op].p.Dn = ea & 7;
									iTab[op].f = z2 == 4 ? I_ADDQ_D_32 : (z2 == 2 ? I_ADDQ_D_16 : I_ADDQ_D_8);
								}
								else if (m == M_rda) {
									iTab[op].p.An = ea & 7;
									iTab[op].f = I_ADDQ_A_32;
								}
								else {
									iTab[op].p.ea = ea;
									iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, z2));
									iTab[op].f = z2 == 4 ? I_ADDQ_E_32 : (z2 == 2 ? I_ADDQ_E_16 : I_ADDQ_E_8);
								}
								iTab[op].d = mkDiss(0, D_IMD,id == 0 ? 8 : id, D_EA,ea, z2,0);
								cnt++;
							} else {
								SAEF_error("cpu.mkITab() op exists ADDQ " + op);
								return false;
							}
						}
					}
				}
			}
		}
		//SUBQ
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var id = 0; id < 8; id++) {
					for (var ea = 0; ea < 61; ea++) {
						if (isEA(ea, en)) {
							var m = getEAMode(ea);
							if (m == M_rda && z == 0) continue; //An word and long only
							op = (5 << 12) | (id << 9) | (1 << 8) | (z << 6) | ea;
							if (iTab[op].op === -1) {
								var cyc = m == M_rda ? [8,1,0] : (m == M_rdd ? (z2 == 4 ? [8,1,0]:[4,1,0]) : (z2 == 4 ? [12,1,2]:[8,1,1]));
								iTab[op] = mkI(op, "SUBQ", cyc);
								iTab[op].p.data = id == 0 ? 8 : id;
								if (m == M_rdd) {
									iTab[op].p.Dn = ea & 7;
									iTab[op].f = z2 == 4 ? I_SUBQ_D_32 : (z2 == 2 ? I_SUBQ_D_16 : I_SUBQ_D_8);
								}
								else if (m == M_rda) {
									iTab[op].p.An = ea & 7;
									iTab[op].f = I_SUBQ_A_32;
								}
								else {
									iTab[op].p.ea = ea;
									iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, z2));
									iTab[op].f = z2 == 4 ? I_SUBQ_E_32 : (z2 == 2 ? I_SUBQ_E_16 : I_SUBQ_E_8);
								}
								iTab[op].d = mkDiss(0, D_IMD,id == 0 ? 8 : id, D_EA,ea, z2,0);
								cnt++;
							} else {
								SAEF_error("cpu.mkITab() op exists SUBQ " + op);
								return false;
							}
						}
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* Integer - Misc */

		//CMPM
		{
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var Ax = 0; Ax < 8; Ax++) {
					for (var Ay = 0; Ay < 8; Ay++) {
						op = (11 << 12) | (Ax << 9) | (1 << 8) | (z << 6) | (1 << 3) | Ay;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, "CMPM", z2 == 4 ? [20,5,0] : [12,3,0]);
							iTab[op].p.Ax = Ax;
							iTab[op].p.Ay = Ay;
							iTab[op].f = z2 == 4 ? I_CMPM_32 : (z2 == 2 ? I_CMPM_16 : I_CMPM_8);
							iTab[op].d = mkDiss(0, D_RIPO,Ay, D_RIPO,Ax, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists CMPM "+op);
							return false;
						}
					}
				}
			}
		}
		//EXT
		{
			for (var z = 1; z < 3; z++) {
				var z2 = z == 1 ? 2 : 4;
				var opm = z == 1 ? 2 : 3;
				for (var Dn = 0; Dn < 8; Dn++) {
					op = (36 << 9) | (opm << 6) | Dn;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "EXT", [4,1,0]);
						iTab[op].p.Dn = Dn;
						iTab[op].f = z2 == 4 ? I_EXT_32 : I_EXT_16;
						iTab[op].d = mkDiss(0, false,false, D_RDD,Dn, z2,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists EXT "+op);
						return false;
					}
				}
			}
		}
		//EXTB
		if (model >= 68020) {
			for (var Dn = 0; Dn < 8; Dn++) {
				op = (36 << 9) | (7 << 6) | Dn;
				if (iTab[op].op === -1) {
					iTab[op] = mkI(op, "EXTB", [4,1,0]);
					iTab[op].p.Dn = Dn;
					iTab[op].f = I_EXTB;
					iTab[op].d = mkDiss(0, false,false, D_RDD,Dn, 4,0);
					cnt++;
				} else {
					SAEF_error("cpu.mkITab() op exists EXTB "+op);
					return false;
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* Logical */

		//AND
		{
			var en0 = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var en1 = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var dir = 0; dir < 2; dir++) {
					for (var Dn = 0; Dn < 8; Dn++) {
						for (var ea = 0; ea < 61; ea++) {
							if (isEA(ea, dir == 0 ? en0 : en1)) {
								op = (12 << 12) | (Dn << 9) | (dir << 8) | (z << 6) | ea;
								if (iTab[op].op === -1) {
									iTab[op] = mkI(op, "AND", []);
									iTab[op].p.Dn = Dn;
									iTab[op].p.ea = ea;
									iTab[op].p.zm = z2 == 4 ? 0x80000000 : (z2 == 2 ? 0x8000 : 0x80);
									if (dir == 0) {
										var m = getEAMode(ea);
										iTab[op].p.cyc = addCycs(z2 == 4 ? (m == M_rdd || m == M_imm ? [8,1,0]:[6,1,0]) : [4,1,0], getEACycs(ea, z2));
										iTab[op].f = z2 == 4 ? I_AND_D_32 : (z2 == 2 ? I_AND_D_16 : I_AND_D_8);
										iTab[op].d = mkDiss(0, D_EA,ea, D_RDD,Dn, z2,0);
									} else {
										iTab[op].p.cyc = addCycs(z2 == 4 ? [12,1,2] : [8,1,1], getEACycs(ea, z2));
										iTab[op].f = z2 == 4 ? I_AND_E_32 : (z2 == 2 ? I_AND_E_16 : I_AND_E_8);
										iTab[op].d = mkDiss(0, D_RDD,Dn, D_EA,ea, z2,0);
									}
									cnt++;
								} else {
									SAEF_error("cpu.mkITab() op exists AND "+op);
									return false;
								}
							}
						}
					}
				}
			}
		}
		//EOR
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				var z3 = z == 0 ? 4 : (z == 1 ? 5 : 6);
				for (var Dn = 0; Dn < 8; Dn++) {
					for (var ea = 0; ea < 61; ea++) {
						if (isEA(ea, en)) {
							op = (11 << 12) | (Dn << 9) | (z3 << 6) | ea;
							if (iTab[op].op === -1) {
								var m = getEAMode(ea);
								iTab[op] = mkI(op, "EOR", z2 == 4 ? [8,1,0] : [4,1,0]);
								iTab[op].p.Dn = Dn;
								iTab[op].p.zm = z2 == 4 ? 0x80000000 : (z2 == 2 ? 0x8000 : 0x80);
								if (m == M_rdd) {
									iTab[op].p.Dd = ea & 7;
									iTab[op].f = z2 == 4 ? I_EOR_D_32 : (z2 == 2 ? I_EOR_D_16 : I_EOR_D_8);
								} else {
									iTab[op].p.ea = ea;
									iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, z2));
									iTab[op].f = z2 == 4 ? I_EOR_E_32 : (z2 == 2 ? I_EOR_E_16 : I_EOR_E_8);
								}
								iTab[op].d = mkDiss(0, D_RDD,Dn, D_EA,ea, z2,0);
								cnt++;
							} else {
								SAEF_error("cpu.mkITab() op exists EOR "+op);
								return false;
							}
						}
					}
				}
			}
		}
		//OR
		{
			var en0 = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var en1 = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var dir = 0; dir < 2; dir++) {
					for (var Dn = 0; Dn < 8; Dn++) {
						for (var ea = 0; ea < 61; ea++) {
							if (isEA(ea,  dir == 0 ? en0 : en1)) {
								op = (8 << 12) | (Dn << 9) | (dir << 8) | (z << 6) | ea;
								if (iTab[op].op === -1) {
									iTab[op] = mkI(op, "OR", []);
									iTab[op].p.Dn = Dn;
									iTab[op].p.ea = ea;
									iTab[op].p.zm = z2 == 4 ? 0x80000000 : (z2 == 2 ? 0x8000 : 0x80);
									if (dir == 0) {
										var m = getEAMode(ea);
										iTab[op].p.cyc = addCycs(z2 == 4 ? (m == M_rdd || m == M_imm ? [8,1,0]:[6,1,0]) : [4,1,0], getEACycs(ea, z2));
										iTab[op].f = z2 == 4 ? I_OR_D_32 : (z2 == 2 ? I_OR_D_16 : I_OR_D_8);
										iTab[op].d = mkDiss(0, D_EA,ea, D_RDD,Dn, z2,0);
									} else {
										iTab[op].p.cyc = addCycs(z2 == 4 ? [12,1,2] : [8,1,1], getEACycs(ea, z2));
										iTab[op].f = z2 == 4 ? I_OR_E_32 : (z2 == 2 ? I_OR_E_16 : I_OR_E_8);
										iTab[op].d = mkDiss(0, D_RDD,Dn, D_EA,ea, z2,0);
									}
									cnt++;
								} else {
									SAEF_error("cpu.mkITab() op exists OR " + op);
									return false;
								}
							}
						}
					}
				}
			}
		}
		//NOT
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (70 << 8) | (z << 6) | ea;
						if (iTab[op].op === -1) {
							var m = getEAMode(ea);
							var cyc = m == M_rdd ? (z2 == 4 ? [6,1,0]:[4,1,0]) : (z2 == 4 ? [12,1,2]:[8,1,1]);
							iTab[op] = mkI(op, "NOT", cyc);
							if (m == M_rdd) {
								iTab[op].p.Dn = ea & 7;
								iTab[op].f = z2 == 4 ? I_NOT_D_32 : (z2 == 2 ? I_NOT_D_16 : I_NOT_D_8);
							} else {
								iTab[op].p.ea = ea;
								iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, z2));
								iTab[op].f = z2 == 4 ? I_NOT_E_32 : (z2 == 2 ? I_NOT_E_16 : I_NOT_E_8);
							}
							iTab[op].p.m = z2 == 4 ? 0xffffffff : (z2 == 2 ? 0xffff : 0xff);
							iTab[op].p.zm = z2 == 4 ? 0x80000000 : (z2 == 2 ? 0x8000 : 0x80);
							iTab[op].d = mkDiss(0, false,false, D_EA,ea, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists NOT "+op);
							return false;
						}
					}
				}
			}
		}
		//ANDI
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (2 << 8) | (z << 6) | ea;
						if (iTab[op].op === -1) {
							var m = getEAMode(ea);
							var cyc = m == M_rdd ? (z2 == 4 ? [16,3,0]:[8,2,0]) : (z2 == 4 ? [20,3,1]:[12,2,1])
							iTab[op] = mkI(op, "ANDI", cyc);
							if (m == M_rdd) {
								iTab[op].p.Dn = ea & 7;
								iTab[op].f = z2 == 4 ? I_ANDI_D_32 : (z2 == 2 ? I_ANDI_D_16 : I_ANDI_D_8);
							} else {
								iTab[op].p.ea = ea;
								iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, z2));
								iTab[op].f = z2 == 4 ? I_ANDI_E_32 : (z2 == 2 ? I_ANDI_E_16 : I_ANDI_E_8);
							}
							iTab[op].p.zm = z2 == 4 ? 0x80000000 : (z2 == 2 ? 0x8000 : 0x80);
							iTab[op].d = mkDiss(0, D_IME,z2 == 4 ? 2 : 1, D_EA,ea, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists ANDI "+op);
							return false;
						}
					}
				}
			}
		}
		//EORI
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (10 << 8) | (z << 6) | ea;
						if (iTab[op].op === -1) {
							var m = getEAMode(ea);
							var cyc = m == M_rdd ? (z2 == 4 ? [16,3,0]:[8,2,0]) : (z2 == 4 ? [20,3,1]:[12,2,1])
							iTab[op] = mkI(op, "EORI", cyc);
							if (m == M_rdd) {
								iTab[op].p.Dn = ea & 7;
								iTab[op].f = z2 == 4 ? I_EORI_D_32 : (z2 == 2 ? I_EORI_D_16 : I_EORI_D_8);
							} else {
								iTab[op].p.ea = ea;
								iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, z2));
								iTab[op].f = z2 == 4 ? I_EORI_E_32 : (z2 == 2 ? I_EORI_E_16 : I_EORI_E_8);
							}
							iTab[op].p.zm = z2 == 4 ? 0x80000000 : (z2 == 2 ? 0x8000 : 0x80);
							iTab[op].d = mkDiss(0, D_IME,z2 == 4 ? 2 : 1, D_EA,ea, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists EORI "+op);
							return false;
						}
					}
				}
			}
		}
		//ORI
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (z << 6) | ea;
						if (iTab[op].op === -1) {
							var m = getEAMode(ea);
							var cyc = m == M_rdd ? (z2 == 4 ? [16,3,0]:[8,2,0]) : (z2 == 4 ? [20,3,1]:[12,2,1])
							iTab[op] = mkI(op, "ORI", cyc);
							if (m == M_rdd) {
								iTab[op].p.Dn = ea & 7;
								iTab[op].f = z2 == 4 ? I_ORI_D_32 : (z2 == 2 ? I_ORI_D_16 : I_ORI_D_8);
							} else {
								iTab[op].p.ea = ea;
								iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, z2));
								iTab[op].f = z2 == 4 ? I_ORI_E_32 : (z2 == 2 ? I_ORI_E_16 : I_ORI_E_8);
							}
							iTab[op].p.zm = z2 == 4 ? 0x80000000 : (z2 == 2 ? 0x8000 : 0x80);
							iTab[op].d = mkDiss(0, D_IME,z2 == 4 ? 2 : 1, D_EA,ea, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists ORI "+op);
							return false;
						}
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* Shift and Rotate */

		//ASL,ASR
		{
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var dr = 0; dr < 2; dr++) {
					for (var ir = 0; ir < 2; ir++) {
						for (var cr = 0; cr < 8; cr++) {
							for (var Dy = 0; Dy < 8; Dy++) {
								op = (14 << 12) | (cr << 9) | (dr << 8) | (z << 6) | (ir << 5) | Dy;
								if (iTab[op].op === -1) {
									iTab[op] = mkI(op, dr == 0 ? "ASR" : "ASL", z2 == 4 ? [8,1,0] : [6,1,0]);
									iTab[op].p.ir = ir;
									iTab[op].p.cr = ir == 0 ? (cr == 0 ? 8 : cr) : cr;
									iTab[op].p.Dy = Dy;
									if (dr == 0)
										iTab[op].f = z2 == 4 ? I_ASR_32 : (z2 == 2 ? I_ASR_16 : I_ASR_8);
									else
										iTab[op].f = z2 == 4 ? I_ASL_32 : (z2 == 2 ? I_ASL_16 : I_ASL_8);

									iTab[op].d = mkDiss(0, ir == 0 ? D_IMD : D_RDD,ir == 0 ? (cr == 0 ? 8 : cr) : cr, D_RDD,Dy, z2,0);
									cnt++;
								} else {
									SAEF_error("cpu.mkITab() op exists ASx "+op);
									return false;
								}
							}
						}
					}
				}
			}
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var dr = 0; dr < 2; dr++) {
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (112 << 9) | (dr << 8) | (3 << 6) | ea;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, dr == 0 ? "ASR" : "ASL", addCycs([8,1,1], getEACycs(ea, 2)));
							iTab[op].p.ea = ea;
							iTab[op].f = dr == 0 ? I_ASR_M : I_ASL_M;
							iTab[op].d = mkDiss(0, false,false, D_EA,ea, 2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists ASx "+op);
							return false;
						}
					}
				}
			}
		}
		//LSL,LSR
		{
			for (var z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var dr = 0; dr < 2; dr++) {
					for (var ir = 0; ir < 2; ir++) {
						for (var cr = 0; cr < 8; cr++) {
							for (var Dy = 0; Dy < 8; Dy++) {
								op = (14 << 12) | (cr << 9) | (dr << 8) | (z << 6) | (ir << 5) | (1 << 3) | Dy;
								if (iTab[op].op === -1) {
									iTab[op] = mkI(op, dr == 0 ? "LSR" : "LSL", z2 == 4 ? [8,1,0] : [6,1,0]);
									iTab[op].p.ir = ir;
									iTab[op].p.cr = ir == 0 ? (cr == 0 ? 8 : cr) : cr;
									iTab[op].p.Dy = Dy;
									if (dr == 0)
										iTab[op].f = z2 == 4 ? I_LSR_32 : (z2 == 2 ? I_LSR_16 : I_LSR_8);
									else
										iTab[op].f = z2 == 4 ? I_LSL_32 : (z2 == 2 ? I_LSL_16 : I_LSL_8);

									iTab[op].d = mkDiss(0, ir == 0 ? D_IMD : D_RDD,ir == 0 ? (cr == 0 ? 8 : cr) : cr, D_RDD,Dy, z2,0);
									cnt++;
								} else {
									SAEF_error("cpu.mkITab() op exists LSx "+op);
									return false;
								}
							}
						}
					}
				}
			}
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var dr = 0; dr < 2; dr++) {
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (113 << 9) | (dr << 8) | (3 << 6) | ea;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, dr == 0 ? "LSR" : "LSL", addCycs([8,1,1], getEACycs(ea, 2)));
							iTab[op].p.ea = ea;
							iTab[op].f = dr == 0 ? I_LSR_M : I_LSL_M;
							iTab[op].d = mkDiss(0, false,false, D_EA,ea, 2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists LSx "+op);
							return false;
						}
					}
				}
			}
		}
		//ROL,ROR
		{
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var dr = 0; dr < 2; dr++) {
					for (var ir = 0; ir < 2; ir++) {
						for (var cr = 0; cr < 8; cr++) {
							for (var Dy = 0; Dy < 8; Dy++) {
								op = (14 << 12) | (cr << 9) | (dr << 8) | (z << 6) | (ir << 5) | (3 << 3) | Dy;
								if (iTab[op].op === -1) {
									iTab[op] = mkI(op, dr == 0 ? "ROR" : "ROL", z2 == 4 ? [8,1,0] : [6,1,0]);
									iTab[op].p.ir = ir;
									iTab[op].p.cr = ir == 0 ? (cr == 0 ? 8 : cr) : cr;
									iTab[op].p.Dy = Dy;
									if (dr == 0)
										iTab[op].f = z2 == 4 ? I_ROR_32 : (z2 == 2 ? I_ROR_16 : I_ROR_8);
									else
										iTab[op].f = z2 == 4 ? I_ROL_32 : (z2 == 2 ? I_ROL_16 : I_ROL_8);

									iTab[op].d = mkDiss(0, ir == 0 ? D_IMD : D_RDD,ir == 0 ? (cr == 0 ? 8 : cr) : cr, D_RDD,Dy, z2,0);
									cnt++;
								} else {
									SAEF_error("cpu.mkITab() op exists ROx "+op);
									return false;
								}
							}
						}
					}
				}
			}
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var dr = 0; dr < 2; dr++) {
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (115 << 9) | (dr << 8) | (3 << 6) | ea;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, dr == 0 ? "ROR" : "ROL", addCycs([8,1,1], getEACycs(ea, 2)));
							iTab[op].p.ea = ea;
							iTab[op].f = dr == 0 ? I_ROR_M : I_ROL_M;
							iTab[op].d = mkDiss(0, false,false, D_EA,ea, 2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists ROx "+op);
							return false;
						}
					}
				}
			}
		}
		//ROXL,ROXR
		{
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var dr = 0; dr < 2; dr++) {
					for (var ir = 0; ir < 2; ir++) {
						for (var cr = 0; cr < 8; cr++) {
							for (var Dy = 0; Dy < 8; Dy++) {
								op = (14 << 12) | (cr << 9) | (dr << 8) | (z << 6) | (ir << 5) | (2 << 3) | Dy;
								if (iTab[op].op === -1) {
									iTab[op] = mkI(op, dr == 0 ? "ROR" : "ROL", z2 == 4 ? [8,1,0] : [6,1,0]);
									iTab[op].p.ir = ir;
									iTab[op].p.cr = ir == 0 ? (cr == 0 ? 8 : cr) : cr;
									iTab[op].p.Dy = Dy;
									if (dr == 0)
										iTab[op].f = z2 == 4 ? I_ROXR_32 : (z2 == 2 ? I_ROXR_16 : I_ROXR_8);
									else
										iTab[op].f = z2 == 4 ? I_ROXL_32 : (z2 == 2 ? I_ROXL_16 : I_ROXL_8);

									iTab[op].d = mkDiss(0, ir == 0 ? D_IMD : D_RDD,ir == 0 ? (cr == 0 ? 8 : cr) : cr, D_RDD,Dy, z2,0);
									cnt++;
								} else {
									SAEF_error("cpu.mkITab() op exists ROx "+op);
									return false;
								}
							}
						}
					}
				}
			}
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var dr = 0; dr < 2; dr++) {
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (114 << 9) | (dr << 8) | (3 << 6) | ea;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, dr == 0 ? "ROXR" : "ROXL", addCycs([8,1,1], getEACycs(ea, 2)));
							iTab[op].p.ea = ea;
							iTab[op].f = dr == 0 ? I_ROXR_M : I_ROXL_M;
							iTab[op].d = mkDiss(0, false,false, D_EA,ea, 2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists ROx "+op);
							return false;
						}
					}
				}
			}
		}
		//SWAP
		{
			for (var Dn = 0; Dn < 8; Dn++) {
				op = (2312 << 3) | Dn;
				if (iTab[op].op === -1) {
					iTab[op] = mkI(op, "SWAP", [4,1,0]);
					iTab[op].p.Dn = Dn;
					iTab[op].f = I_SWAP;
					iTab[op].d = mkDiss(0, false,false, D_RDD,Dn, 2,0);
					cnt++;
				} else {
					SAEF_error("cpu.mkITab() op exists SWAP "+op);
					return false;
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* Bit Manipulation */

		//BCHG
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var Dn = 0; Dn < 8; Dn++) {
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (Dn << 9) | (5 << 6) | ea;
						if (iTab[op].op === -1) {
							var m = getEAMode(ea);
							iTab[op] = mkI(op, "BCHG", m == M_rdd ? [8,1,0]:[8,1,1]);
							iTab[op].p.Dn = Dn;
							if (m == M_rdd) {
								iTab[op].p.Dd = ea & 7;
								iTab[op].f = I_BCHG_DD_32;
							} else {
								iTab[op].p.ea = ea;
								iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, 1));
								iTab[op].f = I_BCHG_DE_8;
							}
							iTab[op].d = mkDiss(0, D_RDD,Dn, D_EA,ea, m == M_rdd ? 4 : 1,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists BCHG1 "+op);
							return false;
						}
					}
				}
			}
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (33 << 6) | ea;
					if (iTab[op].op === -1) {
						var m = getEAMode(ea);
						iTab[op] = mkI(op, "BCHG", m == M_rdd ? [12,2,0]:[12,2,1]);
						if (m == M_rdd) {
							iTab[op].p.Dd = ea & 7;
							iTab[op].f = I_BCHG_ID_32;
						} else {
							iTab[op].p.ea = ea;
							iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, 1));
							iTab[op].f = I_BCHG_IE_8;
						}
						iTab[op].d = mkDiss(0, D_IME,1, D_EA,ea, m == M_rdd ? 4 : 1,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists BCHG "+op);
						return false;
					}
				}
			}
		}
		//BCLR
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var Dn = 0; Dn < 8; Dn++) {
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (Dn << 9) | (6 << 6) | ea;
						if (iTab[op].op === -1) {
							var m = getEAMode(ea);
							iTab[op] = mkI(op, "BCLR", m == M_rdd ? [10,1,0]:[8,1,1]);
							iTab[op].p.Dn = Dn;
							if (m == M_rdd) {
								iTab[op].p.Dd = ea & 7;
								iTab[op].f = I_BCLR_DD_32;
							} else {
								iTab[op].p.ea = ea;
								iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, 1));
								iTab[op].f = I_BCLR_DE_8;
							}
							iTab[op].d = mkDiss(0, D_RDD,Dn, D_EA,ea, m == M_rdd ? 4 : 1,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists BCLR "+op);
							return false;
						}
					}
				}
			}
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (34 << 6) | ea;
					if (iTab[op].op === -1) {
						var m = getEAMode(ea);
						iTab[op] = mkI(op, "BCLR", m == M_rdd ? [14,2,0]:[12,2,1]);
						if (m == M_rdd) {
							iTab[op].p.Dd = ea & 7;
							iTab[op].f = I_BCLR_ID_32;
						} else {
							iTab[op].p.ea = ea;
							iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, 1));
							iTab[op].f = I_BCLR_IE_8;
						}
						iTab[op].d = mkDiss(0, D_IME,1, D_EA,ea, m == M_rdd ? 4 : 1,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists BCLR "+op);
						return false;
					}
				}
			}
		}
		//BSET
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var Dn = 0; Dn < 8; Dn++) {
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (Dn << 9) | (7 << 6) | ea;
						if (iTab[op].op === -1) {
							var m = getEAMode(ea);
							iTab[op] = mkI(op, "BSET", m == M_rdd ? [8,1,0]:[8,1,1]);
							iTab[op].p.Dn = Dn;
							if (m == M_rdd) {
								iTab[op].p.Dd = ea & 7;
								iTab[op].f = I_BSET_DD_32;
							} else {
								iTab[op].p.ea = ea;
								iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, 1));
								iTab[op].f = I_BSET_DE_8;
							}
							iTab[op].d = mkDiss(0, D_RDD,Dn, D_EA,ea, m == M_rdd ? 4 : 1,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists BSET "+op);
							return false;
						}
					}
				}
			}
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (35 << 6) | ea;
					if (iTab[op].op === -1) {
						var m = getEAMode(ea);
						iTab[op] = mkI(op, "BSET", m == M_rdd ? [12,2,0]:[12,2,1]);
						if (m == M_rdd) {
							iTab[op].p.Dd = ea & 7;
							iTab[op].f = I_BSET_ID_32;
						} else {
							iTab[op].p.ea = ea;
							iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, 1));
							iTab[op].f = I_BSET_IE_8;
						}
						iTab[op].d = mkDiss(0, D_IME,1, D_EA,ea, m == M_rdd ? 4 : 1,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists BSET "+op);
						return false;
					}
				}
			}
		}
		//BTST
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			for (var Dn = 0; Dn < 8; Dn++) {
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (Dn << 9) | (4 << 6) | ea;
						if (iTab[op].op === -1) {
							var m = getEAMode(ea);
							iTab[op] = mkI(op, "BTST", m == M_rdd ? [6,1,0]:[4,1,0]);
							iTab[op].p.Dn = Dn;
							if (m == M_rdd) {
								iTab[op].p.Dd = ea & 7;
								iTab[op].f = I_BTST_DD_32;
							} else {
								iTab[op].p.ea = ea;
								iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, 1));
								iTab[op].f = I_BTST_DE_8;
							}
							iTab[op].d = mkDiss(0, D_RDD,Dn, D_EA,ea, m == M_rdd ? 4 : 1,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists BTST "+op);
							return false;
						}
					}
				}
			}
			en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (32 << 6) | ea;
					if (iTab[op].op === -1) {
						var m = getEAMode(ea);
						iTab[op] = mkI(op, "BTST", m == M_rdd ? [12,2,0]:[8,2,0]);
						if (m == M_rdd) {
							iTab[op].p.Dd = ea & 7;
							iTab[op].f = I_BTST_ID_32;
						} else {
							iTab[op].p.ea = ea;
							iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, 1));
							iTab[op].f = I_BTST_IE_8;
						}
						iTab[op].d = mkDiss(0, D_IME,1, D_EA,ea, m == M_rdd ? 4 : 1,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists BTST "+op);
						return false;
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* Bitfield >= 68020 */

		//BFCHG
		if (model >= 68020) {
			var en = [M_rdd, M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (939 << 6) | ea;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "BFCHG", [4,1,0]); //FIXME cycles
						iTab[op].p.id = ID_BFCHG;
						iTab[op].p.ea = ea;
						iTab[op].f = I_BFXXX;
						iTab[op].d = mkDiss(1, D_EA,ea, D_EXT_BITFIELD,0, 0,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists BFCHG "+op);
						return false;
					}
				}
			}
		}
		//BFCLR
		if (model >= 68020) {
			var en = [M_rdd, M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (947 << 6) | ea;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "BFCLR", [4,1,0]); //FIXME cycles
						iTab[op].p.id = ID_BFCLR;
						iTab[op].p.ea = ea;
						iTab[op].f = I_BFXXX;
						iTab[op].d = mkDiss(1, D_EA,ea, D_EXT_BITFIELD,0, 0,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists BFCLR "+op);
						return false;
					}
				}
			}
		}
		//BFEXTS
		if (model >= 68020) {
			var en = [M_rdd, M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (943 << 6) | ea;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "BFEXTS", [4,1,0]); //FIXME cycles
						iTab[op].p.id = ID_BFEXTS;
						iTab[op].p.ea = ea;
						iTab[op].f = I_BFXXX;
						iTab[op].d = mkDiss(1, D_EA,ea, D_EXT_BITFIELD,0, 0,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists BFEXTS "+op);
						return false;
					}
				}
			}
		}
		//BFEXTU
		if (model >= 68020) {
			var en = [M_rdd, M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (935 << 6) | ea;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "BFEXTU", [4,1,0]); //FIXME cycles
						iTab[op].p.id = ID_BFEXTU;
						iTab[op].p.ea = ea;
						iTab[op].f = I_BFXXX;
						iTab[op].d = mkDiss(1, D_EA,ea, D_EXT_BITFIELD,0, 0,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists BFEXTU "+op);
						return false;
					}
				}
			}
		}
		//BFFFO
		if (model >= 68020) {
			var en = [M_rdd, M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (951 << 6) | ea;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "BFFFO", [4,1,0]); //FIXME cycles
						iTab[op].p.id = ID_BFFFO;
						iTab[op].p.ea = ea;
						iTab[op].f = I_BFXXX;
						iTab[op].d = mkDiss(1, D_EA,ea, D_EXT_BITFIELD,0, 0,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists BFFFO "+op);
						return false;
					}
				}
			}
		}
		//BFINS
		if (model >= 68020) {
			var en = [M_rdd, M_ria, M_rid, M_rii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (959 << 6) | ea;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "BFINS", [4,1,0]); //FIXME cycles
						iTab[op].p.id = ID_BFINS;
						iTab[op].p.ea = ea;
						iTab[op].f = I_BFXXX;
						iTab[op].d = mkDiss(1, D_EA,ea, D_EXT_BITFIELD,0, 0,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists BFINS "+op);
						return false;
					}
				}
			}
		}
		//BFSET
		if (model >= 68020) {
			var en = [M_rdd, M_ria, M_rid, M_rii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (955 << 6) | ea;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "BFSET", [4,1,0]); //FIXME cycles
						iTab[op].p.id = ID_BFSET;
						iTab[op].p.ea = ea;
						iTab[op].f = I_BFXXX;
						iTab[op].d = mkDiss(1, D_EA,ea, D_EXT_BITFIELD,0, 0,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists BFSET "+op);
						return false;
					}
				}
			}
		}
		//BFTST
		if (model >= 68020) {
			var en = [M_rdd, M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (931 << 6) | ea;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "BFTST", [4,1,0]); //FIXME cycles
						iTab[op].p.id = ID_BFTST;
						iTab[op].p.ea = ea;
						iTab[op].f = I_BFXXX;
						iTab[op].d = mkDiss(1, D_EA,ea, D_EXT_BITFIELD,0, 0,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists BFTST "+op);
						return false;
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* Binary-Coded Decimal */

		//ABCD
		{
			for (var Rx = 0; Rx < 8; Rx++) {
				for (var rm = 0; rm < 2; rm++) {
					for (var Ry = 0; Ry < 8; Ry++) {
						op = (12 << 12) | (Rx << 9) | (1 << 8) | (rm << 3) | Ry;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, "ABCD", rm == 0 ? [6,1,0] : [18,3,1]);
							iTab[op].p.Rx = Rx;
							iTab[op].p.Ry = Ry;
							if (rm == 0) {
								iTab[op].f = I_ABCD_D;
								iTab[op].d = mkDiss(0, D_RDD,Ry, D_RDD,Rx, 1,0);
							} else {
								iTab[op].f = I_ABCD_A;
								iTab[op].d = mkDiss(0, D_RIPR,Ry, D_RIPR,Rx, 1,0);
							}
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists ABCD "+op);
							return false;
						}
					}
				}
			}
		}
		//SBCD
		{
			for (var Ry = 0; Ry < 8; Ry++) {
				for (var rm = 0; rm < 2; rm++) {
					for (var Rx = 0; Rx < 8; Rx++) {
						op = (8 << 12) | (Ry << 9) | (1 << 8) | (rm << 3) | Rx;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, "SBCD", rm == 0 ? [6,1,0] : [18,3,1]);
							iTab[op].p.Ry = Ry;
							iTab[op].p.Rx = Rx;
							if (rm == 0) {
								iTab[op].f = I_SBCD_D;
								iTab[op].d = mkDiss(0, D_RDD,Rx, D_RDD,Ry, 1,0);
							} else {
								iTab[op].f = I_SBCD_A;
								iTab[op].d = mkDiss(0, D_RIPR,Rx, D_RIPR,Ry, 1,0);
							}
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists SBCD "+op);
							return false;
						}
					}
				}
			}
		}
		//NBCD
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (288 << 6) | ea;
					if (iTab[op].op === -1) {
						var m = getEAMode(ea);
						iTab[op] = mkI(op, "NBCD", m == M_rdd ? [6,1,0] : [8,1,1]);
						if (m == M_rdd) {
							iTab[op].p.Dd = ea & 7;
							iTab[op].f = I_NBCD_D;
						} else {
							iTab[op].p.ea = ea;
							iTab[op].p.cyc = addCycs(iTab[op].p.cyc, getEACycs(ea, 1));
							iTab[op].f = I_NBCD_E;
						}
						iTab[op].d = mkDiss(0, false,false, D_EA,ea, 1,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists NBCD "+op);
						return false;
					}
				}
			}
		}
		//PACK
		if (model >= 68020) {
			for (var Ry = 0; Ry < 8; Ry++) {
				for (var rm = 0; rm < 2; rm++) {
					for (var Rx = 0; Rx < 8; Rx++) {
						op = (8 << 12) | (Ry << 9) | (20 << 4) | (rm << 3) | Rx;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, "PACK", [4,0,0]); //FIXME cycles
							iTab[op].p.Ry = Ry;
							iTab[op].p.Rx = Rx;
							if (rm == 0) {
								iTab[op].f = I_PACK_D;
								iTab[op].d = mkDiss(1, D_RDD,Rx, D_RDD,Ry, 0,0); //FIXME adjustment
							} else {
								iTab[op].f = I_PACK_A;
								iTab[op].d = mkDiss(1, D_RIPR,Rx, D_RIPR,Ry, 0,0); //FIXME adjustment
							}
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists PACK "+op);
							return false;
						}
					}
				}
			}
		}
		//UNPK
		if (model >= 68020) {
			for (var Ry = 0; Ry < 8; Ry++) {
				for (var rm = 0; rm < 2; rm++) {
					for (var Rx = 0; Rx < 8; Rx++) {
						op = (8 << 12) | (Ry << 9) | (24 << 4) | (rm << 3) | Rx;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, "PACK", [4,0,0]); //FIXME cycles
							iTab[op].p.Ry = Ry;
							iTab[op].p.Rx = Rx;
							if (rm == 0) {
								iTab[op].f = I_UNPK_D;
								iTab[op].d = mkDiss(1, D_RDD,Rx, D_RDD,Ry, 0,0); //FIXME adjustment
							} else {
								iTab[op].f = I_UNPK_A;
								iTab[op].d = mkDiss(1, D_RIPR,Rx, D_RIPR,Ry, 0,0); //FIXME adjustment
							}
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists UNPK " + op);
							return false;
						}
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* Program Control */

		//Bcc
		{
			for (var cc = 2; cc < 16; cc++) {
				for (var dp = 0; dp < (model >= 68020 ? 256 : 255); dp++) { /* 0xff = long, 68020 only */
					op = (6 << 12) | (cc << 8) | dp;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "B"+ccNames[cc], dp == 255 ? [12,1,0] : [8,1,0]);
						iTab[op].p.cc = cc;
						iTab[op].p.dp = dp;
						iTab[op].p.cycTaken = [10,2,2];
						iTab[op].f = I_Bcc;
						iTab[op].d = mkDiss(0, false,false, D_IME_DP,dp, dp == 255 ? 2 : 1,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists B"+ccNames[cc]+" "+op);
						return false;
					}
				}
			}
		}
		//DBcc
		{
			for (var cc = 0; cc < 16; cc++) {
				for (var Dn = 0; Dn < 8; Dn++) {
					op = (5 << 12) | (cc << 8) | (25 << 3) | Dn;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "DB"+ccNames[cc], [10,2,0]);
						iTab[op].p.cc = cc;
						iTab[op].p.Dn = Dn;
						iTab[op].p.cycNotTakenTrue = [12,2,0];
						iTab[op].p.cycNotTakenFalse = [14,3,0];
						iTab[op].f = I_DBcc;
						iTab[op].d = mkDiss(0, D_RDD,Dn, D_IME_DP,0, 2,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists DB"+ccNames[cc]+" "+op);
						return false;
					}
				}
			}
		}
		//Scc
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var cc = 0; cc < 16; cc++) {
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (5 << 12) | (cc << 8) | (3 << 6) | ea;
						if (iTab[op].op === -1) {
							var cyc = getEAMode(ea) == M_rdd ? [8,1,1] : addCycs([8,1,1], getEACycs(ea, 1));
							iTab[op] = mkI(op, "S"+ccNames[cc], cyc);
							iTab[op].p.cc = cc;
							iTab[op].p.ea = ea;
							iTab[op].p.cycFalse = [4,1,0];
							iTab[op].p.cycTrue = [6,1,0];
							iTab[op].f = I_Scc;
							iTab[op].d = mkDiss(0, false,false, D_EA,ea, 1,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists S"+ccNames[cc]+" "+op);
							return false;
						}
					}
				}
			}
		}
		//BRA
		{
			for (var dp = 0; dp < (model >= 68020 ? 256 : 255); dp++) { /* 0xff = 68020 only */
				op = (96 << 8) | dp;
				if (iTab[op].op === -1) {
					iTab[op] = mkI(op, "BRA", [10,2,0]);
					iTab[op].p.dp = dp;
					iTab[op].f = I_BRA;
					iTab[op].d = mkDiss(0, false,false, D_IME_DP,dp, dp == 0 ? 2 : (dp == 255 ? 4 : 1),0);
					cnt++;
				} else {
					SAEF_error("cpu.mkITab() op exists BRA "+op);
					return false;
				}
			}
		}
		//BSR
		{
			for (var dp = 0; dp < (model >= 68020 ? 256 : 255); dp++) { /* 0xff = 68020 only */
				op = (97 << 8) | dp;
				if (iTab[op].op === -1) {
					iTab[op] = mkI(op, "BSR", [18,2,2]);
					iTab[op].p.dp = dp;
					iTab[op].f = I_BSR;
					iTab[op].d = mkDiss(0, false,false, D_IME_DP,dp, dp == 0 ? 2 : (dp == 255 ? 4 : 1),0);
					cnt++;
				} else {
					SAEF_error("cpu.mkITab() op exists BSR " + op);
					return false;
				}
			}
		}
		//JMP
		{
			var en = [M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (315 << 6) | ea;
					if (iTab[op].op === -1) {
						var cyc;
						switch (getEAMode(ea)) {
							case M_ria:  cyc = [ 8,2,0]; break;
							case M_rid:  cyc = [10,2,0]; break;
							case M_rii:  cyc = [14,3,0]; break;
							case M_pcid: cyc = [10,2,0]; break;
							case M_pcii: cyc = [14,3,0]; break;
							case M_absw: cyc = [10,2,0]; break;
							case M_absl: cyc = [12,3,0]; break;
						}
						iTab[op] = mkI(op, "JMP", cyc);
						iTab[op].p.ea = ea;
						iTab[op].f = I_JMP;
						iTab[op].d = mkDiss(0, false,false, D_EA,ea, 0,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists JMP "+op);
						return false;
					}
				}
			}
		}
		//JSR
		{
			var en = [M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (314 << 6) | ea;
					if (iTab[op].op === -1) {
						var cyc;
						switch (getEAMode(ea)) {
							case M_ria:  cyc = [16,2,2]; break;
							case M_rid:  cyc = [18,2,2]; break;
							case M_rii:  cyc = [22,2,2]; break;
							case M_pcid: cyc = [18,2,2]; break;
							case M_pcii: cyc = [22,2,2]; break;
							case M_absw: cyc = [18,2,2]; break;
							case M_absl: cyc = [20,3,2]; break;
						}
						iTab[op] = mkI(op, "JSR", cyc);
						iTab[op].p.ea = ea;
						iTab[op].f = I_JSR;
						iTab[op].d = mkDiss(0, false,false, D_EA,ea, 0,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists JSR " + op);
						return false;
					}
				}
			}
		}
		//NOP
		{
			op = 0x4E71;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "NOP", [4,1,0]);
				iTab[op].f = I_NOP;
				iTab[op].d = mkDiss(0, false,false, false,false, 0,0);
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists NOP "+op);
				return false;
			}
		}
		//RTD
		if (model >= 68010) {
			op = 0x4E74;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "RTD", [4,0,0]); //FIXME cycles
				iTab[op].f = I_RTD;
				iTab[op].d = mkDiss(0, false,false, D_IME,1, 0,0); //FIXME
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists RTD "+op);
				return false;
			}
		}
		//RTR
		{
			op = 0x4E77;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "RTR", [20,5,0]);
				iTab[op].f = I_RTR;
				iTab[op].d = mkDiss(0, false,false, false,false, 0,0);
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists RTR "+op);
				return false;
			}
		}
		//RTS
		{
			op = 0x4E75;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "RTS", [16,4,0]);
				iTab[op].f = I_RTS;
				iTab[op].d = mkDiss(0, false,false, false,false, 0,0);
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists RTS "+op);
				return false;
			}
		}
		//TST
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl, M_imm];
			if (model >= 68020) en.push(M_pcid, M_pcii);
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						var m = getEAMode(ea);
						if (model >= 68020 && z == 0 && m == M_rda) continue; //68020 An word and long only
						op = (74 << 8) | (z << 6) | ea;
						if (iTab[op].op === -1) {
							cyc = m == M_rdd || m == M_rda ? [4,1,0] : addCycs([4,1,0], getEACycs(ea, z2));
							iTab[op] = mkI(op, "TST", cyc);
							iTab[op].p.ea = ea;
							iTab[op].p.zm = z2 == 4 ? 0x80000000 : (z2 == 2 ? 0x8000 : 0x80);
							iTab[op].f = z2 == 4 ? I_TST_32 : (z2 == 2 ? I_TST_16 : I_TST_8);
							iTab[op].d = mkDiss(0, false,false, D_EA,ea, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists TST "+op);
							return false;
						}
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* System Control - CCR */

		//ANDI_CCR
		{
			op = 0x23C;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "ANDI", [20,3,0]);
				iTab[op].f = I_ANDI_CCR;
				iTab[op].d = mkDiss(0, D_IME,1, D_CCR,0, 1,0);
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists ANDI_CCR "+op);
				return false;
			}
		}
		//EORI_CCR
		{
			op = 0xA3C;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "EORI", [20,3,0]);
				iTab[op].f = I_EORI_CCR;
				iTab[op].d = mkDiss(0, D_IME,1, D_CCR,0, 1,0);
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists EORI "+op);
				return false;
			}
		}
		//ORI_CCR
		{
			op = 0x3C;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "ORI", [20,3,0]);
				iTab[op].f = I_ORI_CCR;
				iTab[op].d = mkDiss(0, D_IME,1, D_CCR,0, 1,0);
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists ORI_CCR "+op);
				return false;
			}
		}
		//MOVE_CCR2
		if (model >= 68010) {
			var en = [M_rdd,M_ria,M_ripo,M_ripr,M_rid,M_rii,M_absw,M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (267 << 6) | ea;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "MOVE", [4,1,0]);
						iTab[op].p.ea = ea;
						iTab[op].f = I_MOVE_CCR2;
						iTab[op].d = mkDiss(0, D_CCR,0, D_EA,ea, 2,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists MOVE_CCR2 "+op);
						return false;
					}
				}
			}
		}
		//MOVE_2CCR
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (275 << 6) | ea;
					if (iTab[op].op === -1) {
						var cyc = getEAMode(ea) == M_rdd ? [12,1,0] : addCycs([12,1,0], getEACycs(ea, 2));
						iTab[op] = mkI(op, "MOVE", cyc);
						iTab[op].p.ea = ea;
						iTab[op].f = I_MOVE_2CCR;
						iTab[op].d = mkDiss(0, D_EA,ea, D_CCR,0, 2,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists MOVE_2CCR "+op);
						return false;
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* System Control - SR */

		//ANDI_SR
		{
			op = 0x27C;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "ANDI", [20,3,0]);
				iTab[op].f = I_ANDI_SR;
				iTab[op].d = mkDiss(0, D_IME,1, D_SR,0, 2,0);
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists ANDI_SR "+op);
				return false;
			}
		}
		//EORI_SR
		{
			op = 0xA7C;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "EORI", [20,3,0]);
				iTab[op].f = I_EORI_SR;
				iTab[op].d = mkDiss(0, D_IME,1, D_SR,0, 2,0);
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists EORI "+op);
				return false;
			}
		}
		//ORI_SR
		{
			op = 0x7C;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "ORI", [20,3,0]);
				iTab[op].f = I_ORI_SR;
				iTab[op].d = mkDiss(0, D_IME,1, D_SR,0, 2,0);
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists ORI_SR "+op);
				return false;
			}
		}
		//MOVE_SR2
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (259 << 6) | ea;
					if (iTab[op].op === -1) {
						var cyc = getEAMode(ea) == M_rdd ? [6,1,0] : addCycs([8,1,1], getEACycs(ea, 2));
						iTab[op] = mkI(op, "MOVE", cyc);
						iTab[op].p.ea = ea;
						iTab[op].f = I_MOVE_SR2;
						iTab[op].d = mkDiss(0, D_SR,0, D_EA,ea, 2,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists MOVE_SR2 " + op);
						return false;
					}
				}
			}
		}
		//MOVE_2SR
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (283 << 6) | ea;
					if (iTab[op].op === -1) {
						var cyc = getEAMode(ea) == M_rdd ? [12,1,0] : addCycs([12,1,0], getEACycs(ea, 2));
						iTab[op] = mkI(op, "MOVE", cyc);
						iTab[op].p.ea = ea;
						iTab[op].f = I_MOVE_2SR;
						iTab[op].d = mkDiss(0, D_EA,ea, D_SR,0, 2,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists MOVE_2SR " + op);
						return false;
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* System Control - USP */

		//MOVE_USP
		{
			for (var dr = 0; dr < 2; dr++) {
				for (var An = 0; An < 8; An++) {
					op = (1254 << 4) | (dr << 3) | An;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "MOVE", [4,1,0]);
						iTab[op].p.An = An;
						if (dr == 0) {
							iTab[op].f = I_MOVE_A2USP;
							iTab[op].d = mkDiss(0, D_RDA,An, D_USP,0, 4,0);
						} else {
							iTab[op].f = I_MOVE_USP2A;
							iTab[op].d = mkDiss(0, D_USP,0, D_RDA,An, 4,0);
						}
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists MOVE_USP "+op);
						return false;
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* System Control - MOVEC */

		//MOVEC
		if (model >= 68010) {
			for (var dr = 0; dr < 2; dr++) {
				op = (10045 << 1) | dr;
				if (iTab[op].op === -1) {
					iTab[op] = mkI(op, "MOVEC", [4,0,0]); //FIXME cycles
					iTab[op].f = dr == 0 ? I_MOVE_C2 : I_MOVE_2C;
					iTab[op].d = mkDiss(1, false,false, D_EXT_MOVEC,dr == 0, 4,0);
					cnt++;
				} else {
					SAEF_error("cpu.mkITab() op exists MOVEC "+op);
					return false;
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* System Control - MOVES */

		//MOVES
		if (model >= 68010) {
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (14 << 8) | (z << 6) | ea;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, "MOVES", [4,0,0]); //FIXME cycles
							iTab[op].p.ea = ea;
							iTab[op].f = z2 == 4 ? I_MOVES_32 : (z2 == 2 ? I_MOVES_16 : I_MOVES_8);
							iTab[op].d = mkDiss(1, false,false, D_EA,ea, z2,0); //FIXME
							//iTab[op].d = mkDiss(1, D_EA,ea, false,false, z2,0); //FIXME
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists MOVES " + op);
							return false;
						}
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* System Control */

		//BKPT
		if (model >= 68010) {
			for (var vec = 0; vec < 8; vec++) {
				op = (2313 << 3) | vec;
				if (iTab[op].op === -1) {
					iTab[op] = mkI(op, "BKPT", [45,5,4]);
					iTab[op].p.v = vec;
					iTab[op].f = I_BKPT;
					iTab[op].d = mkDiss(0, false,false, D_IMD,vec, 0,0);
					cnt++;
				} else {
					SAEF_error("cpu.mkITab() op exists BKPT " + op);
					return false;
				}
			}
		}
		//CHK
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			for (var Dn = 0; Dn < 8; Dn++) {
				for (var z = 0; z < (model >= 68020 ? 2 : 1); z++) {
					var z2 = z == 0 ? 2 : 4;
					var z3 = z == 0 ? 3 : 2;
					for (var ea = 0; ea < 61; ea++) {
						if (isEA(ea, en)) {
							op = (4 << 12) | (Dn << 9) | (z3 << 7) | ea;
							if (iTab[op].op === -1) {
								var cyc = getEAMode(ea) == M_rdd ? [10,1,0] : addCycs([10,1,0], getEACycs(ea, z2));
								iTab[op] = mkI(op, "CHK", cyc);
								iTab[op].p.Dn = Dn;
								iTab[op].p.ea = ea;
								iTab[op].f = z2 == 2 ? I_CHK_16 : I_CHK_32;
								iTab[op].d = mkDiss(0, D_EA,ea, D_RDD,Dn, z2,0);
								cnt++;
							} else {
								SAEF_error("cpu.mkITab() op exists CHK "+op);
								return false;
							}
						}
					}
				}
			}
		}
		//CHK2
		if (model >= 68020) {
			var en = [M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (z << 9) | (3 << 6) | ea;
						if (iTab[op].op === -1) {
							var cyc = getEAMode(ea) == M_rdd ? [10,1,0] : addCycs([10,1,0], getEACycs(ea, z2));
							iTab[op] = mkI(op, "CHK2", cyc);
							iTab[op].p.ea = ea;
							iTab[op].f = z2 == 4 ? I_CHK2_32 : (z2 == 2 ? I_CHK2_16 : I_CHK2_8);
							//iTab[op].d = mkDiss(1, D_EA,ea, false,false, z2,0); //FIXME
							iTab[op].d = mkDiss(1, false,false, D_EA,ea, z2,0); //FIXME
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists CHK2 "+op);
							return false;
						}
					}
				}
			}
		}
		//ILLEGAL
		{
			op = 0x4AFC;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "ILLEGAL", [0,0,0]);
				iTab[op].f = I_ILLEGAL;
				iTab[op].d = mkDiss(0, false,false, false,false, 0,0);
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists ILLEGAL "+op);
				return false;
			}
		}
		//RESET
		{
			op = 0x4E70;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "RESET", [132,1,0]);
				iTab[op].f = I_RESET;
				iTab[op].d = mkDiss(0, false,false, false,false, 0,0);
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists RESET "+op);
				return false;
			}
		}
		//RTE
		{
			op = 0x4E73;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "RTE", [20,5,0]);
				iTab[op].f = I_RTE;
				iTab[op].d = mkDiss(0, false,false, false,false, 0,0);
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists RTE "+op);
				return false;
			}
		}
		//STOP
		{
			op = 0x4E72;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "STOP", [4,0,0]);
				iTab[op].f = I_STOP;
				iTab[op].d = mkDiss(0, false,false, D_IME,1, 0,0);
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists STOP "+op);
				return false;
			}
		}
		//TRAP
		{
			for (var v = 0; v < 16; v++) {
				op = (1252 << 4) | v;
				if (iTab[op].op === -1) {
					iTab[op] = mkI(op, "TRAP", [38,4,3]);
					iTab[op].p.v = v;
					iTab[op].f = I_TRAP;
					iTab[op].d = mkDiss(0, false,false, D_IMD,v, 0,0);
					cnt++;
				} else {
					SAEF_error("cpu.mkITab() op exists TRAP "+op);
					return false;
				}
			}
		}
		//TRAPCC
		if (model >= 68020) {
			for (var z = 0; z < 3; z++) {
				var z2 = z == 0 ? 0 : (z == 1 ? 2 : 4);
				var opm = z == 0 ? 4 : (z == 1 ? 2 : 3);
				for (var cc = 0; cc < 16; cc++) {
					op = (5 << 12) | (cc << 8) | (31 << 3) | opm;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "TRAP"+ccNames[cc], [4,1,0]);
						iTab[op].p.cc = cc;
						iTab[op].f = z2 == 4 ? I_TRAPCC_32 : (z2 == 2 ? I_TRAPCC_16 : I_TRAPCC);
						if (z2)
							iTab[op].d = mkDiss(0, false,false, D_IMD,z2 == 2 ? 1 : 2, z2,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists TRAP"+ccNames[cc]+" "+op);
						return false;
					}
				}
			}
		}
		//TRAPV
		{
			op = 0x4E76;
			if (iTab[op].op === -1) {
				iTab[op] = mkI(op, "TRAPV", [4,1,0]);
				iTab[op].f = I_TRAPV;
				iTab[op].d = mkDiss(0, false,false, false,false, 0,0);
				cnt++;
			} else {
				SAEF_error("cpu.mkITab() op exists TRAPV "+op);
				return false;
			}
		}

		/*-----------------------------------------------------------------------*/
		/* Multiprocessor */

		//CAS
		if (model >= 68020) {
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var z = 1; z <= 3; z++) {
				var z2 = z == 1 ? 1 : (z == 2 ? 2 : 4);
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (1 << 11) | (z << 9) | (3 << 6) | ea;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, "CAS", [4,0,0]); //FIXME cycles
							iTab[op].p.ea = ea;
							iTab[op].f = z2 == 4 ? I_CAS_32 : (z2 == 2 ? I_CAS_16 : I_CAS_8);
							iTab[op].d = mkDiss(1, false,false, D_EA,ea, z2,0); //FIXME
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists CAS "+op);
							return false;
						}
					}
				}
			}
		}
		//CAS2
		if (model >= 68020) {
			for (var z = 2; z <= 3; z++) {
				var z2 = z == 2 ? 2 : 4;
				op = (1 << 11) | (z << 9) | 252;
				if (iTab[op].op === -1) {
					iTab[op] = mkI(op, "CAS2", [4,0,0]); //FIXME cycles
					iTab[op].f = z2 == 4 ? I_CAS2_32 : I_CAS2_16;
					iTab[op].d = mkDiss(2, false,false, false,false, z2,0); //FIXME
					cnt++;
				} else {
					SAEF_error("cpu.mkITab() op exists CAS2 "+op);
					return false;
				}
			}
		}
		//TAS
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (299 << 6) | ea;
					if (iTab[op].op === -1) {
						var cyc = getEAMode(ea) == M_rdd ? [4,1,0] : addCycs([10,1,1], getEACycs(ea, 1));
						iTab[op] = mkI(op, "TAS", cyc);
						iTab[op].p.ea = ea;
						iTab[op].f = I_TAS;
						iTab[op].d = mkDiss(0, false,false, D_EA,ea, 1,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists TAS "+op);
						return false;
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/

		//CALLM
		if (model == 68020) {
			var en = [M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (27 << 6) | ea;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "CALLM", [4,0,0]); //FIXME cycles
						iTab[op].p.ea = ea;
						iTab[op].f = I_CALLM;
						iTab[op].d = mkDiss(0, D_IME,1, D_EA,ea, 0,0); //FIXME
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists CALLM "+op);
						return false;
					}
				}
			}
		}
		//RTM
		if (model == 68020) {
			for (var da = 0; da < 1; da++) {
				for (var Rn = 0; Rn < 8; Rn++) {
					op = (108 << 4) | (da << 3) | Rn;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "RTM", [4,0,0]); //FIXME cycles
						iTab[op].p.da = da;
						iTab[op].p.Rn = Rn;
						iTab[op].f = I_RTM;
						iTab[op].d = mkDiss(0, false,false, da ? D_RDD : D_RDA,Rn, 0,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists RTM "+op);
						return false;
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* MMU 68851/68030/68040 */
		/*
		S PBcc		1
		S PDBcc		1
		S PFLUSH		1 3 4
		S PFLUSHA	1 3
		S PFLUSHR	1
		S PFLUSHS	1
		S PLOAD		1 3
		S PMOVE		1 3
		S PRESTORE	1
		S PSAVE		1
		S PScc		1
		S PTEST		1 3 4
		S PTRAPcc	1
		  PVALID		1 */

		if (model == 68030) {
			var cid = 0; /* page 4-86: coprocessor ID of 000 is reserved for MMU instructions for the MC68030 */
			var en = [M_ria, M_rid, M_rii, M_absw, M_absl];
			for (var ea = 0; ea < 61; ea++) {
				if (isEA(ea, en)) {
					op = (15 << 12) | (cid << 9) | ea;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "MMU", [4,0,0]); //FIXME name, cycles
						iTab[op].p.ea = ea;
						iTab[op].f = I_MMU;
						iTab[op].d = mkDiss(1, D_EA,ea, D_EXT_MMU,false, 0,0);
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists PFLUSH "+op);
						return false;
					}
				}
			}
		}

		/*-----------------------------------------------------------------------*/
		/* 68040 */
		/*
		S CINV (cache)
		S CPUSH (cache)
		  MOVE16
		*/

		/*-----------------------------------------------------------------------*/
		/* Coprocessor 68020/68030 */

		//cpBcc
		if (model == 68020 || model == 68030) {
			for (var cid = 0; cid < 8; cid++) {
				if (cid == 0 && model == 68030) /* page 4-86: coprocessor ID of 000 is reserved for MMU instructions for the MC68030 */
					continue;
				for (var z = 0; z < 2; z++) {
					var z2 = z == 0 ? 2 : 4;
					for (var ccc = 0; ccc < 64; ccc++) {
						op = (15 << 12) | (cid << 9) | (1 << 7) | (z << 6) | ccc;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, "cpBcc", [4,0,0]); //FIXME cycles
							iTab[op].p.cid = cid;
							iTab[op].p.ccc = ccc;
							iTab[op].p.z = z2;
							iTab[op].f = I_cpBcc;
							iTab[op].d = mkDiss(1 + (z2 == 2 ? 1 : 2), false,false, D_IME_DP,z == 0 ? 0 : 255, z2,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists cpBcc "+op);
							return false;
						}
					}
				}
			}
		}
		//cpDBcc
		if (model == 68020 || model == 68030) {
			for (var cid = 0; cid < 8; cid++) {
				if (cid == 0 && model == 68030)
					continue;
				for (var dn = 0; dn < 8; dn++) {
					op = (15 << 12) | (cid << 9) | (1 << 6) | (1 << 3) | dn;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "cpDBcc", [4,0,0]); //FIXME cycles
						iTab[op].p.cid = cid;
						iTab[op].p.dn = dn;
						iTab[op].f = I_cpDBcc;
						iTab[op].d = mkDiss(2, D_RDD,dn, false,false, 2,0); //FIXME
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists cpDBcc "+op);
						return false;
					}
				}
			}
		}
		//cpGEN
		if (model == 68020 || model == 68030) {
			for (var cid = 0; cid < 8; cid++) {
				if (cid == 0 && model == 68030)
					continue;
				for (var ea = 0; ea < 61; ea++) {
					op = (15 << 12) | (cid << 9) | ea;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "cpGEN", [4,0,0]); //FIXME cycles
						iTab[op].p.cid = cid;
						iTab[op].p.ea = ea;
						iTab[op].f = I_cpGEN;
						iTab[op].d = mkDiss(2, false,false, false,false, 0,0); //FIXME
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists cpGEN "+op);
						return false;
					}
				}
			}
		}
		//cpRESTORE
		if (model == 68020 || model == 68030) {
			var en = [M_ria, M_ripo, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			for (var cid = 0; cid < 8; cid++) {
				if (cid == 0 && model == 68030)
					continue;
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (15 << 12) | (cid << 9) | (5 << 6) | ea;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, "cpRESTORE", [4,0,0]); //FIXME cycles
							iTab[op].p.cid = cid;
							iTab[op].p.ea = ea;
							iTab[op].f = I_cpRESTORE;
							iTab[op].d = mkDiss(0, false,false, D_EA,ea, 0,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists cpRESTORE "+op);
							return false;
						}
					}
				}
			}
		}
		//cpSAVE
		if (model == 68020 || model == 68030) {
			var en = [M_ria, M_ripo, M_rid, M_rii, M_absw, M_absl];
			for (var cid = 0; cid < 8; cid++) {
				if (cid == 0 && model == 68030)
					continue;
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (15 << 12) | (cid << 9) | (4 << 6) | ea;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, "cpSAVE", [4,0,0]); //FIXME cycles
							iTab[op].p.cid = cid;
							iTab[op].p.ea = ea;
							iTab[op].f = I_cpSAVE;
							iTab[op].d = mkDiss(0, false,false, D_EA,ea, 0,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists cpSAVE "+op);
							return false;
						}
					}
				}
			}
		}
		//cpScc
		if (model == 68020 || model == 68030) {
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			for (var cid = 0; cid < 8; cid++) {
				if (cid == 0 && model == 68030)
					continue;
				for (var ea = 0; ea < 61; ea++) {
					if (isEA(ea, en)) {
						op = (15 << 12) | (cid << 9) | (1 << 6) | ea;
						if (iTab[op].op === -1) {
							iTab[op] = mkI(op, "cpScc", [4,0,0]); //FIXME cycles
							iTab[op].p.cid = cid;
							iTab[op].p.ea = ea;
							iTab[op].f = I_cpScc;
							iTab[op].d = mkDiss(2, false,false, D_EA,ea, 1,0);
							cnt++;
						} else {
							SAEF_error("cpu.mkITab() op exists cpScc "+op);
							return false;
						}
					}
				}
			}
		}
		//cpTRAPcc
		if (model == 68020 || model == 68030) {
			for (var cid = 0; cid < 8; cid++) {
				if (cid == 0 && model == 68030)
					continue;
				for (var opm = 2; opm <= 4; opm++) {
					var z2 = opm == 2 ? 2 : (opm = 3 ? 4 : 0);
					op = (15 << 12) | (cid << 9) | (1 << 6) | (7 << 3) | opm;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "cpTRAPcc", [4,0,0]); //FIXME cycles
						iTab[op].p.cid = cid;
						iTab[op].p.opm = opm;
						iTab[op].f = I_cpTRAPcc;
						iTab[op].d = mkDiss(1 + (z2 == 1 ? 0 : (z2 == 2 ? 2 : 4)), false,false, false,false, z2,0); //FIXME
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists cpTRAPcc "+op);
						return false;
					}
				}
			}
		}

		//cpXXX
		/*if (model == 68020 || model == 68030) {
			for (var cid = 0; cid < 8; cid++) {
				if (cid == 0 && model == 68030)
					continue;
				for (var args = 0; args < 512; args++) {
					op = (15 << 12) | (cid << 9) | args;
					if (iTab[op].op === -1) {
						iTab[op] = mkI(op, "cpXXX", [4,0,0]); //FIXME cycles
						iTab[op].p.cid = cid;
						iTab[op].p.args = args;
						iTab[op].f = I_cpXXX;
						iTab[op].d = mkDiss(0, false,false, false,false, 0,0); //FIXME
						cnt++;
					} else {
						SAEF_error("cpu.mkITab() op exists cpXXX "+op);
						return false;
					}
				}
			}
		}*/

		/*-----------------------------------------------------------------------*/

		if (typeof SAER != "undefined")
			SAEF_log("cpu.mkiTab() %d instructions created", cnt);

		return true;
	}
}
