/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/
/*
0x0000 0000 	2024.0 	Chip RAM 
0x00C0 0000 	1536.0 	Slow RAM

0x00F8 0000 	256.0 	256K System ROM (Kickstart 2.04 or higher)
0x00FC 0000 	256.0 	256K System ROM

0x00DF F000 	4.0 		Custom chip registers
0x00BF D000 	3.8 		8520-B (even-byte addresses)
0x00BF E001 	3.8 		8520-A (odd-byte addresses)
0x00DC 0000 	64.0 		Real time clock

0x00F0 0000 	512.0 	Reserved 512K System ROM (CDTV or CD³²)
0x00E0 0000 	512.0 	Reserved
0x00A0 0000 	1984.0 	Reserved
0x00D8 0000 	256.0 	Reserved
0x00DD 0000 	188.0 	Reserved

0x0020 0000 	8192.0 	Primary auto-config space (Fast RAM)
0x00E8 0000 	64.0 		Zorro II auto-config space (before relocation)
0x00E9 0000 	448.0 	Secondary auto-config space (usually 64K I/O boards)
*/

function Memory() {   
	const NULL8 = 0xff;
	const NULL16 = 0xffff;
	const NULL32 = 0xffffffff;

	this.chip = {
		size: 0,
		align: 0,
		data: null,
		lower: 0,
		upper: 0
   };
	this.slow = {
		enabled: false,
		size: 0,
		align: 0,
		data: null,
		lower: 0x00C00000,
		upper: 0
	};	
	this.fast = {
		enabled: false,
		size: 0,
		align: 0,
		data: null,
		lower: 0x00200000,
		upper: 0
	};	
	this.rom = {
		size: 0,
		align: 0,
		data: null,
		lower: 0xf80000,
		upper: 0x1000000
	};
	this.res_d8 = {
		size: 0x40000,
		align: 0x20000,
		data: null,
		lower: 0x00D80000,
		upper: 0x00DC0000
	};
	this.res_e0 = {
		size: 0x80000,
		align: 0x40000,
		data: null,
		lower: 0x00E00000,
		upper: 0x00E80000
	};
	this.res_f0 = {
		size: 0x80000,
		align: 0x40000,
		data: null,
		lower: 0x00F00000,
		upper: 0x00F80000
	};
	this.ac_z2 = {
		size: 0x10000,
		lower: 0x00E80000,
		upper: 0x00E90000
	};
	/*this.aros = {
		cached: false,
		rom: '',
		ext: ''
	};*/
	
	function getChipSize(v) {
		switch (v) {
			case SAEV_Config_RAM_Chip_Size_256K: return 256 << 10;
			case SAEV_Config_RAM_Chip_Size_512K: return 512 << 10;
			case SAEV_Config_RAM_Chip_Size_1M: return 1024 << 10;
			case SAEV_Config_RAM_Chip_Size_2M: return 2048 << 10;
			default: return false;
		}		
	} 
	
	function getSlowSize(v) {
		switch (v) {
			case SAEV_Config_RAM_Slow_Size_None: return 0;
			case SAEV_Config_RAM_Slow_Size_256K: return 256 << 10;
			case SAEV_Config_RAM_Slow_Size_512K: return 512 << 10;
			case SAEV_Config_RAM_Slow_Size_1M: return 1024 << 10;
			case SAEV_Config_RAM_Slow_Size_1536K: return 1536 << 10;
			default: return false;
		}		
	} 
	
	function getFastSize(v) {
		switch (v) {
			case SAEV_Config_RAM_Fast_Size_None: return 0;
			case SAEV_Config_RAM_Fast_Size_512K: return 512 << 10;
			case SAEV_Config_RAM_Fast_Size_1M: return 1024 << 10;
			case SAEV_Config_RAM_Fast_Size_2M: return 2048 << 10;
			case SAEV_Config_RAM_Fast_Size_4M: return 4096 << 10;
			case SAEV_Config_RAM_Fast_Size_8M: return 8192 << 10;
			default: return false;
		}		
	} 
	
	function getROMSize(v) {
		switch (v) {
			case SAEV_Config_ROM_Size_256K: return 256 << 10;
			case SAEV_Config_ROM_Size_512K: return 512 << 10;
			default: return false;
		}		
	} 
	
	/*function getEXTSize(v) {
		switch (v) {
			case SAEV_Config_EXT_Size_256K: return 256 << 10;
			case SAEV_Config_EXT_Size_512K: return 512 << 10;
			default: return false;
		}		
	} 
	function getEXTAddr(v) {
		switch (v) {
			case SAEV_Config_EXT_Addr_A0: return 0xa00000;
			case SAEV_Config_EXT_Addr_E0: return 0xe00000;
			case SAEV_Config_EXT_Addr_F0: return 0xf00000;
			default: return false;
		}		
	}*/ 
	
	this.setup = function () {
      this.chip.size = getChipSize(AMIGA.config.ram.chip.size);
      this.chip.align = this.chip.size >>> 1;
      this.chip.data = new Uint16Array(this.chip.align);
      for (var i = 0; i < this.chip.align; i++) this.chip.data[i] = 0;
      this.chip.lower = 0;
      this.chip.upper = this.chip.size;

      if (AMIGA.config.ram.slow.size) {
         this.slow.enabled = true;
         this.slow.size = getSlowSize(AMIGA.config.ram.slow.size);
         this.slow.align = this.slow.size >>> 1;
         this.slow.data = new Uint16Array(this.slow.align);
         for (var i = 0; i < this.slow.align; i++) this.slow.data[i] = 0;
         this.slow.upper = this.slow.lower + this.slow.size;
      } else {
         this.slow.enabled = false;
         this.slow.size = 0;
         this.slow.align = 0;
         this.slow.data = null;
         this.slow.upper = 0;
      }
      if (AMIGA.config.ram.fast.size) {
         this.fast.enabled = true;
         this.fast.size = getFastSize(AMIGA.config.ram.fast.size);
         this.fast.align = this.fast.size >>> 1;
         this.fast.data = new Uint16Array(this.fast.align);
         for (var i = 0; i < this.fast.align; i++) this.fast.data[i] = 0;
         this.fast.upper = this.fast.lower + this.fast.size;
      } else {
         this.fast.enabled = false;
         this.fast.size = 0;
         this.fast.align = 0;
         this.fast.data = null;
         this.fast.upper = 0;
      }
      BUG.info('Memory.init() chip %d, slow %d, fast %d', this.chip.size >>> 10, this.slow.size >>> 10, this.fast.size >>> 10);

      this.rom.size = getROMSize(AMIGA.config.rom.size);
      this.rom.align = this.rom.size >>> 1;
      this.rom.data = new Uint16Array(this.rom.align);
      for (var i = 0; i < this.rom.align; i++) this.rom.data[i] = 0;

      this.res_d8.data = new Uint16Array(this.res_d8.align);
      for (var i = 0; i < this.res_d8.align; i++) this.res_d8.data[i] = 0;
      this.res_e0.data = new Uint16Array(this.res_e0.align);
      for (var i = 0; i < this.res_e0.align; i++) this.res_e0.data[i] = 0;
      this.res_f0.data = new Uint16Array(this.res_f0.align);
      for (var i = 0; i < this.res_f0.align; i++) this.res_f0.data[i] = 0;

      this.copy_rom(AMIGA.config.rom.data);

      if (AMIGA.config.ext.size != SAEV_Config_EXT_Size_None) {
         if (AMIGA.config.ext.addr == SAEV_Config_EXT_Addr_E0)
            this.copy_e0(AMIGA.config.ext.data);
         else if (AMIGA.config.ext.addr == SAEV_Config_EXT_Addr_F0)
            this.copy_f0(AMIGA.config.ext.data);
      }
      //this.mirror_rom_to_chipram();

      /*if (AMIGA.config.rom.mode == 1) {
       if (!this.aros.cached) {
       BUG.info('Memory.setup() AROS-ROM is not cached, downloading...');
       AMIGA.loading += 2;
       loadRemote('aros-amiga-m68k-rom.bin', 0xfc4635e1, function(data) {
       AMIGA.mem.aros.cached = true;
       AMIGA.mem.aros.rom = data;
       AMIGA.mem.copy_rom(data);
       AMIGA.loading--;
       });
       loadRemote('aros-amiga-m68k-ext.bin', 0xc612f82e, function(data) {
       AMIGA.mem.aros.cached = true;
       AMIGA.mem.aros.ext = data;
       AMIGA.mem.copy_e0(data);
       AMIGA.loading--;
       });
       } else {
       BUG.info('Memory.setup() AROS-ROM is cached, download skipped.');
       this.copy_rom(this.aros.rom);
       this.copy_e0(this.aros.ext);
       }
       } else {
       AMIGA.loading++;
       loadLocal('cfg_rom_name', function(event) {
       AMIGA.mem.copy_rom(event.target.result);
       AMIGA.loading--;
       });
       if (AMIGA.config.ext.size > 0) {
       AMIGA.loading++;
       loadLocal('cfg_ext_name', function(event) {
       if (AMIGA.config.ext.addr == 0xe00000)
       AMIGA.mem.copy_e0(event.target.result);
       else
       AMIGA.mem.copy_f0(event.target.result);

       AMIGA.loading--;
       });
       }
       }*/
   };

	this.load8 = function (addr) {
      //BUG.info('Memory.load8() addr $%08x', addr);

      if (addr >= 0x000000 && addr < this.chip.size) {
         return (addr & 1) ? (this.chip.data[addr >>> 1] & 0xff) : (this.chip.data[addr >>> 1] >> 8);
      }
      else if (this.slow.enabled && addr >= this.slow.lower && addr < this.slow.upper) {
         return (addr & 1) ? (this.slow.data[(addr - this.slow.lower) >>> 1] & 0xff) : (this.slow.data[(addr - this.slow.lower) >>> 1] >> 8);
      }
      else if (this.fast.enabled && addr >= this.fast.lower && addr < this.fast.upper) {
         return (addr & 1) ? (this.fast.data[(addr - this.fast.lower) >>> 1] & 0xff) : (this.fast.data[(addr - this.fast.lower) >>> 1] >> 8);
      }
      else if (addr >= this.rom.lower && addr < this.rom.upper) {
         return (addr & 1) ? (this.rom.data[(addr - this.rom.lower) >>> 1] & 0xff) : (this.rom.data[(addr - this.rom.lower) >>> 1] >> 8);
      }
      else if (addr >= 0xdff000 && addr < 0xe00000) {
         return AMIGA.custom.load8(addr);
      }
      else if (addr >= 0xbfd000 && addr < 0xbfdf01) {
         return AMIGA.cia.load8(addr);
      }
      else if (addr >= 0xbfe001 && addr < 0xbfef02) {
         return AMIGA.cia.load8(addr);
      }
      else if (addr >= 0xdc0000 && addr < 0xdd0000) {
         return AMIGA.rtc.load8(addr);
      }
      else if (addr >= this.res_e0.lower && addr < this.res_e0.upper) {
         return (addr & 1) ? (this.res_e0.data[(addr - this.res_e0.lower) >>> 1] & 0xff) : (this.res_e0.data[(addr - this.res_e0.lower) >>> 1] >> 8);
      }
      else if (addr >= this.res_f0.lower && addr < this.res_f0.upper) {
         return (addr & 1) ? (this.res_f0.data[(addr - this.res_f0.lower) >>> 1] & 0xff) : (this.res_f0.data[(addr - this.res_f0.lower) >>> 1] >> 8);
      }
      else if (addr >= this.res_d8.lower && addr < this.res_d8.upper) {
         return (addr & 1) ? (this.res_d8.data[(addr - this.res_d8.lower) >>> 1] & 0xff) : (this.res_d8.data[(addr - this.res_d8.lower) >>> 1] >> 8);
      }
      else if (addr >= this.ac_z2.lower && addr < this.ac_z2.upper) {
         return AMIGA.expansion.load8(addr);
      }
      //else BUG.info('Memory.load8() ILLEGAL MEMORY ACCESS addr $%08x', addr);

      return NULL8;
   };

	this.load16 = function (addr) {
      //BUG.info('Memory.load16() addr $%08x', addr);

      if (addr >= 0 && addr < this.chip.size - 1) {
         return this.chip.data[addr >>> 1];
      }
      else if (this.slow.enabled && addr >= this.slow.lower && addr < this.slow.upper - 1) {
         return this.slow.data[(addr - this.slow.lower) >>> 1];
      }
      else if (this.fast.enabled && addr >= this.fast.lower && addr < this.fast.upper - 1) {
         return this.fast.data[(addr - this.fast.lower) >>> 1];
      }
      else if (addr >= this.rom.lower && addr < this.rom.upper - 1) {
         return this.rom.data[(addr - this.rom.lower) >>> 1];
      }
      else if (addr >= 0xdff000 && addr < 0xe00000 - 1) {
         return AMIGA.custom.load16(addr);
      }
      else if (addr >= 0xbfd000 && addr < 0xbfdf01 - 1) {
         return AMIGA.cia.load16(addr);
      }
      else if (addr >= 0xbfe001 && addr < 0xbfef02 - 1) {
         return AMIGA.cia.load16(addr);
      }
      else if (addr >= 0xdc0000 && addr < 0xdd0000 - 1) {
         return AMIGA.rtc.load16(addr);
      }
      else if (addr >= this.res_e0.lower && addr < this.res_e0.upper - 1) {
         return this.res_e0.data[(addr - this.res_e0.lower) >>> 1];
      }
      else if (addr >= this.res_f0.lower && addr < this.res_f0.upper - 1) {
         return this.res_f0.data[(addr - this.res_f0.lower) >>> 1];
      }
      else if (addr >= this.res_d8.lower && addr < this.res_d8.upper - 1) {
         return this.res_d8.data[(addr - this.res_d8.lower) >>> 1];
      }
      //else BUG.info('Memory.load16() ILLEGAL MEMORY ACCESS addr $%08x', addr);

      return NULL16;
   };

	this.load32 = function (addr) {
      //BUG.info('Memory.load32() addr $%08x', addr);

      if (addr >= 0 && addr < this.chip.size - 3) {
         addr >>>= 1;
         return ((this.chip.data[addr] << 16) | this.chip.data[addr + 1]) >>> 0;
      }
      else if (this.slow.enabled && addr >= this.slow.lower && addr < this.slow.upper - 3) {
         addr = (addr - this.slow.lower) >>> 1;
         return ((this.slow.data[addr] << 16) | this.slow.data[addr + 1]) >>> 0;
      }
      else if (this.fast.enabled && addr >= this.fast.lower && addr < this.fast.upper - 3) {
         addr = (addr - this.fast.lower) >>> 1;
         return ((this.fast.data[addr] << 16) | this.fast.data[addr + 1]) >>> 0;
      }
      else if (addr >= this.rom.lower && addr < this.rom.upper - 3) {
         addr = (addr - this.rom.lower) >>> 1;
         return ((this.rom.data[addr] << 16) | this.rom.data[addr + 1]) >>> 0;
      }
      else if (addr >= 0xdff000 && addr < 0xe00000 - 3) {
         return AMIGA.custom.load32(addr);
      }
      else if (addr >= 0xbfd000 && addr < 0xbfdf01 - 3) {
         return AMIGA.cia.load32(addr);
      }
      else if (addr >= 0xbfe001 && addr < 0xbfef02 - 3) {
         return AMIGA.cia.load32(addr);
      }
      else if (addr >= 0xdc0000 && addr < 0xdd0000 - 3) {
         return AMIGA.rtc.load32(addr);
      }
      else if (addr >= this.res_e0.lower && addr < this.res_e0.upper - 3) {
         addr = (addr - this.res_e0.lower) >>> 1;
         return ((this.res_e0.data[addr] << 16) | this.res_e0.data[addr + 1]) >>> 0;
      }
      else if (addr >= this.res_f0.lower && addr < this.res_f0.upper - 3) {
         addr = (addr - this.res_f0.lower) >>> 1;
         return ((this.res_f0.data[addr] << 16) | this.res_f0.data[addr + 1]) >>> 0;
      }
      else if (addr >= this.res_d8.lower && addr < this.res_d8.upper - 3) {
         addr = (addr - this.res_d8.lower) >>> 1;
         return ((this.res_d8.data[addr] << 16) | this.res_d8.data[addr + 1]) >>> 0;
      }
      //else BUG.info('Memory.load32() ILLEGAL MEMORY ACCESS addr $%08x', addr);

      return NULL32;
   };

	this.store8 = function (addr, value) {
      //BUG.info('Memory.store8() addr $%08x, val $%02x', addr, value);

      if (addr >= 0 && addr < this.chip.size) {
         if (addr & 1) {
            addr >>>= 1;
            this.chip.data[addr] = (this.chip.data[addr] & 0xff00) | value;
         } else {
            addr >>>= 1;
            this.chip.data[addr] = (value << 8) | (this.chip.data[addr] & 0x00ff);
         }
      }
      else if (this.slow.enabled && addr >= this.slow.lower && addr < this.slow.upper) {
         if (addr & 1) {
            addr = (addr - this.slow.lower) >>> 1;
            this.slow.data[addr] = (this.slow.data[addr] & 0xff00) | value;
         } else {
            addr = (addr - this.slow.lower) >>> 1;
            this.slow.data[addr] = (value << 8) | (this.slow.data[addr] & 0x00ff);
         }
      }
      else if (this.fast.enabled && addr >= this.fast.lower && addr < this.fast.upper) {
         if (addr & 1) {
            addr = (addr - this.fast.lower) >>> 1;
            this.fast.data[addr] = (this.fast.data[addr] & 0xff00) | value;
         } else {
            addr = (addr - this.fast.lower) >>> 1;
            this.fast.data[addr] = (value << 8) | (this.fast.data[addr] & 0x00ff);
         }
      }
      else if (addr >= 0xdff000 && addr < 0xe00000) {
         AMIGA.custom.store8(addr, value);
      }
      else if (addr >= 0xbfd000 && addr < 0xbfdf01) {
         AMIGA.cia.store8(addr, value);
      }
      else if (addr >= 0xbfe001 && addr < 0xbfef02) {
         AMIGA.cia.store8(addr, value);
      }
      else if (addr >= 0xdc0000 && addr < 0xdd0000) {
         AMIGA.rtc.store8(addr, value);
      }
      else if (addr >= this.res_e0.lower && addr < this.res_e0.upper) {
         if (addr & 1) {
            addr = (addr - this.res_e0.lower) >>> 1;
            this.res_e0.data[addr] = (this.res_e0.data[addr] & 0xff00) | value;
         } else {
            addr = (addr - this.res_e0.lower) >>> 1;
            this.res_e0.data[addr] = (value << 8) | (this.res_e0.data[addr] & 0x00ff);
         }
      }
      else if (addr >= this.res_f0.lower && addr < this.res_f0.upper) {
         if (addr & 1) {
            addr = (addr - this.res_f0.lower) >>> 1;
            this.res_f0.data[addr] = (this.res_f0.data[addr] & 0xff00) | value;
         } else {
            addr = (addr - this.res_f0.lower) >>> 1;
            this.res_f0.data[addr] = (value << 8) | (this.res_f0.data[addr] & 0x00ff);
         }
      }
      else if (addr >= this.res_d8.lower && addr < this.res_d8.upper) {
         if (addr & 1) {
            addr = (addr - this.res_d8.lower) >>> 1;
            this.res_d8.data[addr] = (this.res_d8.data[addr] & 0xff00) | value;
         } else {
            addr = (addr - this.res_d8.lower) >>> 1;
            this.res_d8.data[addr] = (value << 8) | (this.res_d8.data[addr] & 0x00ff);
         }
      }
      else if (addr >= this.ac_z2.lower && addr < this.ac_z2.upper) {
         AMIGA.expansion.store8(addr, value);
      }
      //else BUG.info('Memory.store8() ILLEGAL MEMORY ACCESS addr $%08x, val %02x', addr, value);
   };
	
	this.store16 = function (addr, value) {
      //BUG.info('Memory.store16() addr $%08x, val $%04x', addr, value);

      if (addr >= 0 && addr < this.chip.size - 1) {
         this.chip.data[addr >>> 1] = value;
      }
      else if (this.slow.enabled && addr >= this.slow.lower && addr < this.slow.upper - 1) {
         this.slow.data[(addr - this.slow.lower) >>> 1] = value;
      }
      else if (this.fast.enabled && addr >= this.fast.lower && addr < this.fast.upper - 1) {
         this.fast.data[(addr - this.fast.lower) >>> 1] = value;
      }
      else if (addr >= 0xdff000 && addr < 0xe00000 - 1) {
         AMIGA.custom.store16(addr, value);
      }
      else if (addr >= 0xbfd000 && addr < 0xbfdf01 - 1) {
         AMIGA.cia.store16(addr, value);
      }
      else if (addr >= 0xbfe001 && addr < 0xbfef02 - 1) {
         AMIGA.cia.store16(addr, value);
      }
      else if (addr >= 0xdc0000 && addr < 0xdd0000 - 1) {
         AMIGA.rtc.store16(addr, value);
      }
      else if (addr >= this.res_e0.lower && addr < this.res_e0.upper - 1) {
         this.res_e0.data[(addr - this.res_e0.lower) >>> 1] = value;
      }
      else if (addr >= this.res_f0.lower && addr < this.res_f0.upper - 1) {
         this.res_f0.data[(addr - this.res_f0.lower) >>> 1] = value;
      }
      else if (addr >= this.res_d8.lower && addr < this.res_d8.upper - 1) {
         this.res_d8.data[(addr - this.res_d8.lower) >>> 1] = value;
      }
      //else BUG.info('Memory.store16() ILLEGAL MEMORY ACCESS addr $%08x, val %04x', addr, value);
   };

	this.store32 = function (addr, value) {
      //BUG.info('Memory.store32() addr $%08x, val $%08x', addr, value);

      if (addr >= 0 && addr < this.chip.size - 3) {
         addr >>>= 1;
         this.chip.data[addr] = value >>> 16;
         this.chip.data[addr + 1] = value & 0xffff;
      }
      else if (this.slow.enabled && addr >= this.slow.lower && addr < this.slow.upper - 3) {
         addr = (addr - this.slow.lower) >>> 1;
         this.slow.data[addr] = value >>> 16;
         this.slow.data[addr + 1] = value & 0xffff;
      }
      else if (this.fast.enabled && addr >= this.fast.lower && addr < this.fast.upper - 3) {
         addr = (addr - this.fast.lower) >>> 1;
         this.fast.data[addr] = value >>> 16;
         this.fast.data[addr + 1] = value & 0xffff;
      }
      else if (addr >= 0xdff000 && addr < 0xe00000 - 3) {
         AMIGA.custom.store32(addr, value);
      }
      else if (addr >= 0xbfd000 && addr < 0xbfdf01 - 3) {
         AMIGA.cia.store32(addr, value);
      }
      else if (addr >= 0xbfe001 && addr < 0xbfef02 - 3) {
         AMIGA.cia.store32(addr, value);
      }
      else if (addr >= 0xdc0000 && addr < 0xdd0000 - 3) {
         AMIGA.rtc.store32(addr, value);
      }
      else if (addr >= this.res_e0.lower && addr < this.res_e0.upper - 3) {
         addr = (addr - this.res_e0.lower) >>> 1;
         this.res_e0.data[addr] = value >>> 16;
         this.res_e0.data[addr + 1] = value & 0xffff;
      }
      else if (addr >= this.res_f0.lower && addr < this.res_f0.upper - 3) {
         addr = (addr - this.res_f0.lower) >>> 1;
         this.res_f0.data[addr] = value >>> 16;
         this.res_f0.data[addr + 1] = value & 0xffff;
      }
      else if (addr >= this.res_d8.lower && addr < this.res_d8.upper - 3) {
         addr = (addr - this.res_d8.lower) >>> 1;
         this.res_d8.data[addr] = value >>> 16;
         this.res_d8.data[addr + 1] = value & 0xffff;
      }
      //else if (!(addr & 0xc80000)) BUG.info('Memory.store32() ILLEGAL MEMORY ACCESS addr $%08x, val %08x', addr, value);
   };

	/*this.check16_chip = function (addr, size) {
      return (addr >= 0 && addr + size < this.chip.size - 1);
   };*/
   /*this.load16_chip = function (addr) {
		if (this.check16_chip(addr, 1)) {
			var v = this.chip.data[addr >>> 1];
			AMIGA.custom.last_value = v;
			return v;
		} else BUG.info('load16_chip() ILLEGAL MEMORY ACCESS addr %x', addr);
		return 0xffff;
	}
	this.store16_chip = function (addr, value) { 
		if (this.check16_chip(addr, 1)) {
			this.chip.data[addr >>> 1] = value;
			AMIGA.custom.last_value = value;
		} else BUG.info('store16_chip() ILLEGAL MEMORY ACCESS addr %x, value %x', addr, value);
	}
	this.load16_chip = function (addr) { 
		if (addr < this.chip.size - 1)
			AMIGA.custom.last_value = this.chip.data[addr >>> 1];
		else
			AMIGA.custom.last_value = 0xffff;

		return AMIGA.custom.last_value;
	}
	this.store16_chip = function (addr, value) { 
		if (addr < this.chip.size - 1)
			this.chip.data[addr >>> 1] = AMIGA.custom.last_value = value;
		else
			AMIGA.custom.last_value = 0xffff;
	}*/

	this.copy_rom = function (data) {
      //BUG.info('copyrom() size %d', data.length);
      //BUG.info('copyrom() crc32 $%08x', crc32(data));

      if (data.length == 0x80000) {
         /*var lo = crc32(data.substr(0, 0x40000));
          var hi = crc32(data.substr(0x40000, 0x80000));
          if (lo != hi) {
          BUG.info('copyrom() lo crc32 $%08x', lo);
          BUG.info('copyrom() hi crc32 $%08x', hi);
          }*/
         for (var i = 0; i < data.length; i++) {
            var v = data.charCodeAt(i) & 0xff;
            if (i & 1) {
               var j = i >>> 1;
               this.rom.data[j] = (this.rom.data[j] & 0xff00) | v;
            } else {
               var j = i >>> 1;
               this.rom.data[j] = (v << 8) | (this.rom.data[j] & 0x00ff);
            }
         }
         this.rom.lower = 0xf80000;
      }
      else if (data.length == 0x40000) {
         for (var i = 0; i < data.length; i++) {
            var v = data.charCodeAt(i) & 0xff;
            if (i & 1) {
               var j = i >>> 1;
               this.rom.data[j] = (this.rom.data[j] & 0xff00) | v;
               this.rom.data[0x20000 + j] = (this.rom.data[0x20000 + j] & 0xff00) | v;
            } else {
               var j = i >>> 1;
               this.rom.data[j] = (v << 8) | (this.rom.data[j] & 0x00ff);
               this.rom.data[0x20000 + j] = (v << 8) | (this.rom.data[0x20000 + j] & 0x00ff);
            }
         }
         this.rom.lower = 0xfc0000;
      }
   };
	
	this.copy_e0 = function (data) {
      if (data.length <= 0x80000) {
         for (var i = 0; i < data.length; i++) {
            var v = data.charCodeAt(i) & 0xff;
            if (i & 1) {
               var j = i >>> 1;
               this.res_e0.data[j] = (this.res_e0.data[j] & 0xff00) | v;
            } else {
               var j = i >>> 1;
               this.res_e0.data[j] = (v << 8) | (this.res_e0.data[j] & 0x00ff);
            }
         }
      }
   };
	this.copy_f0 = function (data) {
      if (data.length <= 0x80000) {
         for (var i = 0; i < data.length; i++) {
            var v = data.charCodeAt(i) & 0xff;
            if (i & 1) {
               var j = i >>> 1;
               this.res_f0.data[j] = (this.res_f0.data[j] & 0xff00) | v;
            } else {
               var j = i >>> 1;
               this.res_f0.data[j] = (v << 8) | (this.res_f0.data[j] & 0x00ff);
            }
         }
      }
   };
	
	/*this.mirror_rom_to_chipram = function() {
		for (var i = 0; i < this.rom.size; i++)
			this.chip.data[i] = this.rom.data[i];
	}*/
}