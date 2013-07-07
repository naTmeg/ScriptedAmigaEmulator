/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/

function Board_A2058() {
	const MEM_8MB		= 0x00;
	const MEM_4MB		= 0x07;
	const MEM_2MB		= 0x06;
	const MEM_1MB		= 0x05;
	const MEM_512KB	= 0x04;
	//const MEM_256KB	= 0x03;
	//const MEM_128KB	= 0x02;
	//const MEM_64KB		= 0x01;
 
	//const SAME_SLOT	= 0x08; /* Next card is in the same Slot  */
	//const ROM_CARD		= 0x10; /* Card has valid ROM */
	const ADD_MEMORY	= 0x20; /* Add Memory to List of Free Ram */

	const ZORRO2		= 0xc0; /* Type of Expansion Card */
	//const ZORRO3		= 0x80;

	const CARE_ADDR	= 0x80; /* Adress HAS to be $200000-$9fffff */

	const VENDOR_COMMODORE	= 514;
	const PRODUCT_A2058		= 10;

	this.info = function() {
		//BUG.info('Board_A2058.info()');
		var type;
		switch (AMIGA.mem.fast.size) {
			case 0x080000: type = ZORRO2 + ADD_MEMORY + MEM_512KB; break;
			case 0x100000: type = ZORRO2 + ADD_MEMORY + MEM_1MB; break;
			case 0x200000: type = ZORRO2 + ADD_MEMORY + MEM_2MB; break;
			case 0x400000: type = ZORRO2 + ADD_MEMORY + MEM_4MB; break;
			case 0x800000: type = ZORRO2 + ADD_MEMORY + MEM_8MB; break;
		}
		return {
			name:'Commodore A2058',   
			vendor:VENDOR_COMMODORE, 
			product:PRODUCT_A2058,
			serial:1,			
			type:type,   
			flags:CARE_ADDR,  
			rom:0,			
			ctrl:0			
		};			
	}
}

function Board_Dummy() {
	this.info = function() {
		//BUG.info('Board_Dummy.info()');
		return {
			name:null,
			vendor:0, 
			product:0,
			serial:0,
			type:0,   
			flags:0,  
			rom:0,			
			ctrl:0			
		};			
	}
}

function Expansion() {
	const MAX_EXPANSION_BOARDS	= 5;

	var mem = {
		data:null,
		lo:0,
		hi:0
	};		
	var boards = [];
	var board = 0;

	this.setup = function () {
      mem.data = new Uint16Array(0x8000);
      boards = [];
      if (AMIGA.mem.fast.size > 0)
         boards[0] = new Board_A2058();
      else
         boards[0] = new Board_Dummy();

      for (var i = 1; i < MAX_EXPANSION_BOARDS; i++)
         boards[i] = new Board_Dummy();
   };
	
	this.reset = function () {
      board = 0;
      this.config(board);
   };
	
	this.clear = function () {
      for (var i = 0; i < mem.data.length; i++)
         mem.data[i] = 0;
   };
	
	this.write = function (addr, value) {
      mem.data[(addr >> 1)] = (value & 0xf0) << 8;
      mem.data[(addr >> 1) + 1] = (value & 0x0f) << 12;
   };

	this.load8 = function (addr) {
      addr &= 0xffff;
      var value = (mem.data[addr >>> 1] >> ((addr & 1) ? 0 : 8)) & 0xff;
      if (addr == 0 || addr == 2 || addr == 0x40 || addr == 0x42)
         return value;
      return ~value & 0xff;
   };

	this.store8 = function (addr, value) {
      switch (addr & 0xff) {
         case 0x30:
         case 0x32:
            mem.hi = 0;
            mem.lo = 0;
            this.write(0x48, 0x00);
            break;

         case 0x48:
            mem.hi = value;
            //BUG.info('Expansion.store8() board %d done.', board + 1);
            ++board;
            if (board <= MAX_EXPANSION_BOARDS)
               this.config(board);
            else
               this.clear();
            break;

         case 0x4a:
            mem.lo = value;
            break;

         case 0x4c:
            //BUG.info('Expansion.store8() board %d faild.', board + 1);
            ++board;
            if (board <= MAX_EXPANSION_BOARDS)
               this.config(board);
            else
               this.clear();
            break;
      }
   };
	
	this.config = function(board) {
		var info = boards[board].info();
		
		this.clear();
		if (info.name) {
			BUG.info('Expansion.config() Added \'%s\' into slot %d', info.name, board + 1);
			
			this.write(0x00, info.type); 
			this.write(0x08, info.flags);

			this.write(0x04, info.product);
			this.write(0x10, info.vendor >> 8);
			this.write(0x14, info.vendor & 0x0f);

			this.write(0x18, (info.serial >> 24) & 0xff); 
			this.write(0x1c, (info.serial >> 16) & 0xff);
			this.write(0x20, (info.serial >> 8) & 0xff);
			this.write(0x24, info.serial & 0xff);

			this.write(0x28, (info.rom >> 8) & 0xff);
			this.write(0x2c, info.rom & 0xff); 

			this.write(0x40, info.ctrl);
		}
	}	
}