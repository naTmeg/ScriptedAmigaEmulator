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

var SAER_AutoConf_bank = null;

/*---------------------------------*/
/* global constants */

const SAEC_AutoConf_RTS = 0x4e75;
//const SAEC_AutoConf_RTE = 0x4e73;

/*---------------------------------*/
/* global variables */

var SAEV_AutoConf_base = 0xf00000; //RTAREA_DEFAULT;

var SAEV_AutoConf_boot_rom_type = 0;
var SAEV_AutoConf_boot_rom_size = 0;

/*---------------------------------*/

function SAEO_AutoConf() {
	const RTAREA_DEFAULT = 0xf00000;
	const RTAREA_BACKUP = 0xef0000;
	const RTAREA_BACKUP_2 = 0xdb0000;
	const RTAREA_SIZE = 0x10000;

	const RTAREA_TRAPS = 0x3000;
	const RTAREA_RTG = 0x3800;
	const RTAREA_TRAMPOLINE = 0x3b00;
	const RTAREA_DATAREGION = 0xF000;

	const RTAREA_FSBOARD = 0xFFEC;
	const RTAREA_HEARTBEAT = 0xFFF0;
	const RTAREA_TRAPTASK = 0xFFF4;
	const RTAREA_EXTERTASK = 0xFFF8;
	const RTAREA_INTREQ = 0xFFFC;

	const RTAREA_TRAP_DATA = 0x4000;
	const RTAREA_TRAP_DATA_SIZE = 0x8000;
	const RTAREA_TRAP_DATA_SLOT_SIZE = 0x2000; // 8192
	const RTAREA_TRAP_DATA_SECOND = 80;
	const RTAREA_TRAP_DATA_TASKWAIT = (RTAREA_TRAP_DATA_SECOND - 4);
	const RTAREA_TRAP_DATA_EXTRA = 144;
	const RTAREA_TRAP_DATA_EXTRA_SIZE = (RTAREA_TRAP_DATA_SLOT_SIZE - RTAREA_TRAP_DATA_EXTRA);

	const RTAREA_TRAP_SEND_DATA = 0xc0000;
	const RTAREA_TRAP_SEND_DATA_SIZE = 0x2000;

	const RTAREA_TRAP_STATUS = 0xF000;
	const RTAREA_TRAP_STATUS_SIZE = 8;
	const RTAREA_TRAP_STATUS_SECOND = 4;

	const RTAREA_TRAP_SEND_STATUS = 0xF100;

	const RTAREA_SYSBASE = 0x3FFC;

	const RTAREA_TRAP_DATA_NUM = (RTAREA_TRAP_DATA_SIZE / RTAREA_TRAP_DATA_SLOT_SIZE);



	/* Commonly used autoconfig strings */
	//var EXPANSION_explibname = 0, EXPANSION_doslibname = 0, EXPANSION_uaeversion = 0;
	//var EXPANSION_uaedevname, EXPANSION_explibbase = 0;
	//var EXPANSION_bootcode = 0, EXPANSION_nullfunc = 0;

	/* ROM tag area memory access */
	//var rtarea_base = RTAREA_DEFAULT; --> SAEV_AutoConf_base
	var hardware_trap_event = new Array(RTAREA_TRAP_DATA_SIZE / RTAREA_TRAP_DATA_SLOT_SIZE); //HANDLE

	var rt_trampoline_ptr = 0, trap_entry = 0;
	//var hwtrap_waiting = 0; //extern volatile uae_atomic, in traps
	var filesystem_state = 0; //extern int

	//var uae_boot_rom_type = 0; -> SAEV_AutoConf_boot_rom_type
	//var uae_boot_rom_size = 0; -> SAEV_AutoConf_boot_rom_size

	var uae_int_requested = 0; //volatile uae_atomic

	/*-----------------------------------------------------------------------*/

	function check_boot_rom(p) {
		var b = RTAREA_DEFAULT;

		/*if (currprefs.uaeboard > 1) {
			p.type = 2;
			return 0x00eb0000; // fixme!
		}
		p.type = 0;
		if (currprefs.boot_rom == 1)
			return 0;*/
		p.type = 1;
		/*if (currprefs.cs_cdtvcd || currprefs.cs_cdtvscsi || currprefs.uae_hide > 1)
			b = RTAREA_BACKUP;*/
		if (SAEV_config.chipset.mbdmac == 1)// || currprefs.cpuboard_type)
			b = RTAREA_BACKUP;
		// CSPPC enables MMU at boot and remaps 0xea0000->0xeffff.
		/*if (ISCPUBOARD(BOARD_BLIZZARD, BOARD_BLIZZARD_SUB_PPC))
			b = RTAREA_BACKUP_2;*/
		var ab = SAER_Memory_getBank(RTAREA_DEFAULT);
		if (ab !== null) {
			if (SAER_Memory_check(RTAREA_DEFAULT, 65536))
				b = RTAREA_BACKUP;
		}
		/*if (nr_directory_units(NULL))
			return b;
		if (nr_directory_units(&currprefs))
			return b;
		if (currprefs.socket_emu)
			return b;
		if (currprefs.uaeserial)
			return b;
		if (currprefs.scsi == 1) //uaescsi.device
			return b;
		if (currprefs.sana2)
			return b;
		if (currprefs.input_tablet > 0)
			return b;
		if (currprefs.rtgmem_size && currprefs.rtgmem_type < GFXBOARD_HARDWARE)
			return b;
		if (currprefs.win32_automount_removable)
			return b;*/
		if (SAEV_config.memory.chipSize > 2 * 1024 * 1024)
			return b;
		/*if (currprefs.z3chipmem_size)
			return b;
		if (currprefs.boot_rom >= 3)
			return b;
		if (currprefs.boot_rom == 2 && b == 0xf00000) {
			p.type = -1;
			return b;
		}*/
		p.type = 0;
		return 0;
	}

	this.need_uae_boot_rom = function() {
		var p = { type:0 };
		var v = check_boot_rom(p);
		SAEV_AutoConf_boot_rom_type = p.type;
		SAEF_log("autoconf.need_uae_boot_rom() type %d", SAEV_AutoConf_boot_rom_type);
		if (!SAEV_AutoConf_base) {
			v = 0;
			SAEV_AutoConf_boot_rom_type = 0;
		}
		return v;
	}

	/*-----------------------------------------------------------------------*/

	/*static bool istrapwait(void) {
		for (int i = 0; i < RTAREA_TRAP_DATA_NUM; i++) {
			uae_u8 *data = rtarea_bank.baseaddr + RTAREA_TRAP_DATA + i * RTAREA_TRAP_DATA_SLOT_SIZE;
			uae_u8 *status = rtarea_bank.baseaddr + RTAREA_TRAP_STATUS + i * RTAREA_TRAP_STATUS_SIZE;
			if (get_long_host(data + RTAREA_TRAP_DATA_TASKWAIT) && status[3] && status[2] >= 0x80) {
				return true;
			}
		}
		return false;
	}*/
	this.rethink_traps = function() {
		return false;
		/*if (currprefs.uaeboard < 2)
			return false;
		if (istrapwait()) {
			atomic_or(&uae_int_requested, 0x4000);
			set_special_exter(SPCFLAG_UAEINT);
			return true;
		}
		atomic_and(&uae_int_requested, ~0x4000);
		return false;*/
	}

	/*-----------------------------------------------------------------------*/

	const RTAREA_WRITEOFFSET = 0xfff0;

	function hwtrap_check_int() {
		if (hwtrap_waiting == 0) {
			atomic_and(uae_int_requested, ~0x2000);
		} else {
			atomic_or(uae_int_requested, 0x2000);
			set_special_exter(SPCFLAG_UAEINT);
		}
	}

	function rtarea_trap_data(addr) {
		if (addr >= RTAREA_TRAP_DATA && addr < RTAREA_TRAP_DATA + RTAREA_TRAP_DATA_SIZE)
			return true;
		return false;
	}

	function rtarea_trap_status(addr) {
		if (addr >= RTAREA_TRAP_STATUS && addr < RTAREA_TRAP_STATUS + RTAREA_TRAP_DATA_NUM * RTAREA_TRAP_STATUS_SIZE)
			return true;
		return false;
	}

	/*---------------------------------*/

	function rtarea_get32(addr) {
		addr &= 0xFFFF;
		return ((rtarea_bank.baseaddr[addr] << 24) | (rtarea_bank.baseaddr[addr + 1] << 16) | (rtarea_bank.baseaddr[addr + 2] << 8) | rtarea_bank.baseaddr[addr + 3]) >>> 0;
	}
	function rtarea_get16(addr) {
		addr &= 0xFFFF;
		return (rtarea_bank.baseaddr[addr] << 8) + rtarea_bank.baseaddr[addr + 1];
	}
	function rtarea_get8(addr) {
		addr &= 0xFFFF;

		if (rtarea_trap_status(addr)) {
			var addr2 = addr - RTAREA_TRAP_STATUS;
			var trap_offset = addr2 & (RTAREA_TRAP_STATUS_SIZE - 1);
			var trap_slot = Math.floor(addr2 / RTAREA_TRAP_STATUS_SIZE);
			if (trap_offset == 0) {
				// 0 = busy wait, 1 = Wait()
				rtarea_bank.baseaddr[addr] = filesystem_state ? 1 : 0;
			}
		} else if (addr == RTAREA_INTREQ + 0) {
			rtarea_bank.baseaddr[addr] = atomic_bit_test_and_reset(uae_int_requested, 0);
			//SAEF_log("autoconf.rtarea_get8() %s", rtarea_bank.baseaddr[addr] ? "+" : "-");
		} else if (addr == RTAREA_INTREQ + 1) {
			rtarea_bank.baseaddr[addr] = hwtrap_waiting != 0;
		} else if (addr == RTAREA_INTREQ + 2) {
			/*if (SAER.autoconf.rethink_traps()) //OWN empty
				rtarea_bank.baseaddr[addr] = 1;
			else*/
				rtarea_bank.baseaddr[addr] = 0;
		}
		hwtrap_check_int();
		return rtarea_bank.baseaddr[addr];
	}

	function rtarea_write(addr) {
		if (addr >= RTAREA_WRITEOFFSET)
			return true;
		if (addr >= RTAREA_SYSBASE && addr < RTAREA_SYSBASE + 4)
			return true;
		return rtarea_trap_data(addr) || rtarea_trap_status(addr);
	}
	function rtarea_put8(addr, value) {
		addr &= 0xffff;
		if (!rtarea_write(addr))
			return;
		rtarea_bank.baseaddr[addr] = value;
		if (!rtarea_trap_status(addr))
			return;
		addr -= RTAREA_TRAP_STATUS;
		var trap_offset = addr & (RTAREA_TRAP_STATUS_SIZE - 1);
		var trap_slot = Math.floor(addr / RTAREA_TRAP_STATUS_SIZE);
		if (trap_offset == RTAREA_TRAP_STATUS_SECOND + 3) {
			var v = value;
			if (v != 0xff && v != 0xfe && v != 0x01 && v != 02)
				SAEF_log("autoconf.rtarea_put8() TRAP %d (%02x)", trap_slot, v);
			if (v == 0xfe)
				atomic_dec(hwtrap_waiting);
			if (v == 0x01)
				atomic_dec(hwtrap_waiting);
			if (v == 0x01 || v == 0x02) {
				// signal call_hardware_trap_back()
				// FIXME: OS specific code!
				SetEvent(hardware_trap_event[trap_slot]);
			}
		}
	}
	function rtarea_put16(addr, value) {
		addr &= 0xffff;
		value &= 0xffff;
		if (!rtarea_write(addr))
			return;
		rtarea_put8(addr, value >> 8);
		rtarea_put8(addr + 1, value & 0xff);
		if (!rtarea_trap_status(addr))
			return;
		addr -= RTAREA_TRAP_STATUS;
		var trap_offset = addr & (RTAREA_TRAP_STATUS_SIZE - 1);
		var trap_slot = Math.floor(addr / RTAREA_TRAP_STATUS_SIZE);
		if (trap_offset == 0) {
			SAEF_log("autoconf.rtarea_put16() TRAP %d (%04x)", trap_slot, value);
			call_hardware_trap(rtarea_bank.baseaddr, SAEV_AutoConf_base, trap_slot);
		}
	}
	function rtarea_put32(addr, value) {
		addr &= 0xffff;
		if (!rtarea_write(addr))
			return;
		rtarea_bank.baseaddr[addr + 0] = value >>> 24;
		rtarea_bank.baseaddr[addr + 1] = (value >>> 16) & 0xff;
		rtarea_bank.baseaddr[addr + 2] = (value >>> 8) & 0xff;
		rtarea_bank.baseaddr[addr + 3] = value & 0xff;
	}

	function rtarea_xlate(addr) {
		addr &= 0xFFFF;
		//return rtarea_bank.baseaddr + addr;
		return addr;
	}
	function rtarea_check(addr, size) {
		addr &= 0xFFFF;
		return (addr + size) <= 0xFFFF;
	}

	var rtarea_bank = new SAEO_Memory_addrbank(
		rtarea_get32, rtarea_get16, rtarea_get8,
		rtarea_put32, rtarea_put16, rtarea_put8,
		rtarea_xlate, rtarea_check, null, "rtarea", "UAE Boot ROM",
		rtarea_get32, rtarea_get16,
		SAEC_Memory_addrbank_flag_ROMIN | SAEC_Memory_addrbank_flag_PPCIOSPACE//, S_READ, S_WRITE
	);
	SAER_AutoConf_bank = rtarea_bank;

	/*-----------------------------------------------------------------------*/

	this.reset = function() { //rtarea_reset()
		//memset(rtarea_bank.baseaddr + RTAREA_TRAP_DATA, 0, RTAREA_TRAP_DATA_SIZE);
		//memset(rtarea_bank.baseaddr + RTAREA_TRAP_STATUS, 0, RTAREA_TRAP_STATUS_SIZE * RTAREA_TRAP_DATA_NUM);
		SAEF_memset(rtarea_bank.baseaddr,RTAREA_TRAP_DATA, 0, RTAREA_TRAP_DATA_SIZE);
		SAEF_memset(rtarea_bank.baseaddr,RTAREA_TRAP_STATUS, 0, RTAREA_TRAP_STATUS_SIZE * RTAREA_TRAP_DATA_NUM);
	}

	/*-----------------------------------------------------------------------*/
	/* some quick & dirty code to fill in the rt area and save me a lot of scratch paper */

	var rt_addr = 0;
	var rt_straddr = 0;

	function addr(ptr) {
		//SAEF_log("autoconf.addr() %08x", ptr + SAEV_AutoConf_base);
		//return (uae_u32)ptr + SAEV_AutoConf_base;
		return ptr + SAEV_AutoConf_base;
	}
	this.db = function(data) {
		//SAEF_log("autoconf.db() %02x", data);
		rtarea_bank.baseaddr[rt_addr++] = data;
	}
	this.dw = function(data) {
		//SAEF_log("autoconf.dw() %04x", data);
		rtarea_bank.baseaddr[rt_addr++] = data >> 8;
		rtarea_bank.baseaddr[rt_addr++] = data & 0xff;
	}
	this.dl = function(data) {
		//SAEF_log("autoconf.dl() %08x", data);
		rtarea_bank.baseaddr[rt_addr++] = data >> 24;
		rtarea_bank.baseaddr[rt_addr++] = (data >> 16) & 0xff;
		rtarea_bank.baseaddr[rt_addr++] = (data >> 8) & 0xff;
		rtarea_bank.baseaddr[rt_addr++] = data & 0xff;
	}

	/*this.dbg = function(addr) {
		addr -= SAEV_AutoConf_base;
		return rtarea_bank.baseaddr[addr];
	}*/

	/* store strings starting at the end of the rt area and working backward.  store pointer at current address */
	/*uae_u32 ds_ansi (const uae_char *str) {
		int len;

		if (!str)
			return addr (rt_straddr);
		len = strlen (str) + 1;
		rt_straddr -= len;
		strcpy ((uae_char*)rtarea_bank.baseaddr + rt_straddr, str);
		return addr (rt_straddr);
	}
	uae_u32 ds (const TCHAR *str) {
		char *s = ua (str);
		uae_u32 v = ds_ansi (s);
		xfree (s);
		return v;
	}
	uae_u32 ds_bstr_ansi (const uae_char *str) {
		int len;

		len = strlen (str) + 2;
		rt_straddr -= len;
		while (rt_straddr & 3)
			rt_straddr--;
		rtarea_bank.baseaddr[rt_straddr] = len - 2;
		strcpy ((uae_char*)rtarea_bank.baseaddr + rt_straddr + 1, str);
		return addr (rt_straddr) >> 2;
	}*/

	this.calltrap = function(n) {
		/*if (currprefs.uaeboard > 2) {
			this.dw(0x4eb9); // JSR rt_trampoline_ptr
			this.dl(rt_trampoline_ptr);
			uaecptr a = this.here();
			this.org(rt_trampoline_ptr);
			this.dw(0x3f3c); // MOVE.W #n,-(SP)
			this.dw(n);
			this.dw(0x4ef9); // JMP rt_trampoline_entry
			this.dl(trap_entry);
			this.org(a);
			rt_trampoline_ptr += 3 * 2 + 1 * 4;
		} else*/
			this.dw(0xA000 + n);
	}

	this.org = function(a) {
		if (((a & 0xffff0000) >>> 0 != 0x00f00000) && ((a & 0xffff0000) >>> 0 != SAEV_AutoConf_base))
			SAEF_warn("autoconf.org() corrupt address %08X", a);
		rt_addr = a & 0xffff;
	}

	this.here = function() {
		return addr(rt_addr);
	}

	/*this.align = function(b) {
		rt_addr = (rt_addr + b - 1) & ~(b - 1);
	}*/

	/*-----------------------------------------------------------------------*/

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

	/*static uae_u32 REGPARAM2 nullfunc (TrapContext *ctx) {
		write_log (_T("Null function called\n"));
		return 0;
	}
	static uae_u32 REGPARAM2 getchipmemsize (TrapContext *ctx) {
		trap_set_dreg(ctx, 1, z3chipmem_bank.allocated);
		trap_set_areg(ctx, 1, z3chipmem_bank.start);
		return chipmem_bank.allocated;
	}
	static uae_u32 REGPARAM2 uae_puts (TrapContext *ctx) {
		puts ((char*)get_real_address(trap_get_areg(ctx, 0)));
		return 0;
	}*/

	/* OPT inline ok
	function rtarea_init_mem() {
		if (SAER.autoconf.need_uae_boot_rom())
			rtarea_bank.flags &= ~SAEC_Memory_addrbank_flag_ALLOCINDIRECT;
		else
			rtarea_bank.flags |= SAEC_Memory_addrbank_flag_ALLOCINDIRECT;

		rtarea_bank.allocated = RTAREA_SIZE;
		if (!mapped_malloc(rtarea_bank)) {
			SAEF_fatal(SAEE_NoMemory, "autoconf.init_mem() memory exhausted");
			//abort();
		}
	}*/
	this.setup = function() { //rtarea_init()
		rt_straddr = 0xFF00 - 2;
		rt_addr = 0;

		rt_trampoline_ptr = SAEV_AutoConf_base + RTAREA_TRAMPOLINE;
		trap_entry = 0;

		this.init_traps();

		//rtarea_init_mem();
		{
			if (this.need_uae_boot_rom())
				rtarea_bank.flags &= ~SAEC_Memory_addrbank_flag_ALLOCINDIRECT;
			else
				rtarea_bank.flags |= SAEC_Memory_addrbank_flag_ALLOCINDIRECT;

			rtarea_bank.allocated = RTAREA_SIZE;
			if (!mapped_malloc(rtarea_bank)) {
				SAEF_fatal(SAEE_NoMemory, "autoconf.init_mem() memory exhausted");
				//abort();
			}
		}
		//memset(rtarea_bank.baseaddr, 0, RTAREA_SIZE);
		SAEF_memset(rtarea_bank.baseaddr,0, 0, RTAREA_SIZE);

		/*var uaever = sprintf("uae-%d.%d.%d", UAEMAJOR, UAEMINOR, UAESUBREV);
		var saever = sprintf("sae-%d.%d.%d", SAEC_Version, SAEC_Revision, SAEC_Patch);
		EXPANSION_uaeversion = ds(saever);
		EXPANSION_explibname = ds("expansion.library");
		EXPANSION_doslibname = ds("dos.library");
		EXPANSION_uaedevname = ds("uae.device");*/

		this.dw(0);
		this.dw(0);

		/*#ifdef FILESYS
		filesys_install_code();

		trap_entry = filesys_get_entry(10);
		write_log(_T("TRAP_ENTRY = %08x\n"), trap_entry);

		for (int i = 0; i < RTAREA_TRAP_DATA_SIZE / RTAREA_TRAP_DATA_SLOT_SIZE; i++) {
			hardware_trap_event[i] = CreateEvent(NULL, FALSE, FALSE, NULL);
		}
		#endif*/

		this.define_trap(null, 0, "null"); /* Generic emulator trap */

		/*var a = this.here();
		// Dummy trap - removing this breaks the filesys emulation.
		this.org(SAEV_AutoConf_base + 0xFF00);
		this.calltrap(deftrap2(nullfunc, TRAPFLAG_NO_RETVAL, ""));

		this.org(SAEV_AutoConf_base + 0xFF80);
		this.calltrap(deftrapres(getchipmemsize, TRAPFLAG_DORET, "getchipmemsize"));
		this.dw(SAEC_AutoConf_RTS);

		this.org(SAEV_AutoConf_base + 0xFF10);
		this.calltrap(deftrapres(uae_puts, TRAPFLAG_NO_RETVAL, "uae_puts"));
		this.dw(SAEC_AutoConf_RTS);

		this.org(a);*/

		SAEV_AutoConf_boot_rom_size = this.here() - SAEV_AutoConf_base;
		SAEF_log("autoconf.setup() boot_rom_size %d/%d", SAEV_AutoConf_boot_rom_size, RTAREA_TRAPS);
		if (SAEV_AutoConf_boot_rom_size >= RTAREA_TRAPS) {
			SAEF_fatal(SAEE_NoMemory, "autoconf.setup() RTAREA_TRAPS needs to be increased!");
			//abort();
		}

		/*#ifdef PICASSO96
		uaegfx_install_code(SAEV_AutoConf_base + RTAREA_RTG);
		#endif*/

		this.org(RTAREA_TRAPS | SAEV_AutoConf_base);
		this.init_extended_traps();
	}

	this.cleanup = function() { //rtarea_free()
		mapped_free(rtarea_bank);
		this.free_traps();
	}

	this.init = function() { //rtarea_setup()
		var base = this.need_uae_boot_rom();
		if (base) {
			SAEF_log("autoconf.init() RTAREA located at %08X", base);
			SAEV_AutoConf_base = base;
		}
	}

	/*-----------------------------------------------------------------------*/

	this.makedatatable = function(resid, resname, type, priority, ver, rev) {
		var datatable = this.here();
		this.dw(0xE000); /* INITBYTE */
		this.dw(0x0008); /* LN_TYPE */
		this.dw(type << 8);
		this.dw(0xE000); /* INITBYTE */
		this.dw(0x0009); /* LN_PRI */
		this.dw(priority << 8);
		this.dw(0xC000); /* INITLONG */
		this.dw(0x000A); /* LN_NAME */
		this.dl(resname);
		this.dw(0xE000); /* INITBYTE */
		this.dw(0x000E); /* LIB_FLAGS */
		this.dw(0x0600); /* LIBF_SUMUSED | LIBF_CHANGED */
		this.dw(0xD000); /* INITWORD */
		this.dw(0x0014); /* LIB_VERSION */
		this.dw(ver);
		this.dw(0xD000); /* INITWORD */
		this.dw(0x0016); /* LIB_REVISION */
		this.dw(rev);
		this.dw(0xC000); /* INITLONG */
		this.dw(0x0018); /* LIB_IDSTRING */
		this.dl(resid);
		this.dw(0x0000); /* end of table */
		return datatable;
	}

	/*-----------------------------------------------------------------------*/
	/* SECT Traps */
	/*-----------------------------------------------------------------------*/

	const TRAPFLAG_NO_REGSAVE = 1;
	const TRAPFLAG_NO_RETVAL = 2;
	const TRAPFLAG_EXTRA_STACK = 4;
	const TRAPFLAG_DORET = 8;
	const TRAPFLAG_UAERES = 16;

	function Trap() {
		this.handler = null;	/* Handler function to be invoked for this trap */
		this.flags = 0;		/* Trap attributes */
		this.name = "";		/* For debugging purposes */
		this.addr = 0;
	};
	const MAX_TRAPS = 16; //4096;

	var trap_count = 1;
	var traps = new Array(MAX_TRAPS);
	for (var vi = 0; vi < MAX_TRAPS; vi++)
		traps[vi] = new Trap();

	var hwtrap_waiting = 0; //volatile uae_atomic

	const trace_traps = true;

	/*-----------------------------------------------------------------------*/

	this.find_trap = function(name) {
		for (var i = 0; i < trap_count; i++) {
			var trap = traps[i];
			if ((trap.flags & TRAPFLAG_UAERES) && trap.name.length && trap.name == name)
				return trap.addr;
		}
		return 0;
	}

	/*
	* Define an emulator trap
	*
	* handler_func = host function that will be invoked to handle this trap
	* flags        = trap attributes
	* name         = name for debugging purposes
	*
	* returns trap number of defined trap
	*/
	this.define_trap = function(handler_func, flags, name) {
		if (trap_count == MAX_TRAPS) {
			SAEF_fatal(SAEE_Internal, "define_trap() Ran out of emulator traps. (increase MAX_TRAPS)");
			//abort();
			//return -1;
		} else {
			var addr = this.here();

			for (var i = 0; i < trap_count; i++) {
				if (addr == traps[i].addr)
					return i;
			}

			var trap_num = trap_count++;
			var trap = traps[trap_num];

			trap.handler = handler_func;
			trap.flags   = flags;
			trap.name    = name;
			trap.addr    = addr;

			return trap_num;
		}
	}

	/*
	* This function is called by the 68k interpreter to handle an emulator trap.
	*
	* trap_num = number of trap to invoke
	* regs     = current 68k state
	*/
	this.m68k_handle_trap = function(trap_num) {
		var trap = traps[trap_num];
		var retval = 0;

		var has_retval = (trap.flags & TRAPFLAG_NO_RETVAL) == 0;
		var implicit_rts = (trap.flags & TRAPFLAG_DORET) != 0;

		if (trap.name.length && trace_traps)
			SAEF_log("m68k_handle_trap() TRAP '%s'", trap.name);

		if (trap_num < trap_count) {
			if (trap.flags & TRAPFLAG_EXTRA_STACK) {
				/* Handle an extended trap.
				* Note: the return value of this trap is passed back to 68k
				* space via a separate, dedicated simple trap which the trap
				* handler causes to be invoked when it is done.
				*/
				//trap_HandleExtendedTrap(trap.handler, has_retval); //FIX implement extended-traps
				SAEF_fatal(SAEE_Internal, "m68k_handle_trap() Extended-traps are not implemented.");
			} else {
				/* Handle simple trap */
				//retval = (trap.handler)(null);
				retval = trap.handler(null);

				if (has_retval) {
					SAER_CPU_regs.d[0] = retval;
					SAEF_log("m68k_handle_trap() D0 = %d", retval);
				}
				if (implicit_rts) {
					//m68k_do_rts(); {
						var newpc = SAER_Memory_get32(SAER_CPU_regs.a[7]);
						SAER_CPU_setPC(newpc);
						SAER_CPU_regs.a[7] += 4;
					//}
					SAER_CPU_fill_prefetch();
				}
			}
		} else
			SAEF_warn("m68k_handle_trap() illegal emulator trap");
	}

	/*-----------------------------------------------------------------------*/

	this.init_traps = function() {
		trap_count = 0;
		hwtrap_waiting = 0;
	}
	this.free_traps = function() {

	}
	this.init_extended_traps = function() {

	}
}
