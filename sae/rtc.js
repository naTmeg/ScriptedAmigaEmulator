/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/

function RTC() {
	const RF5C01A_RAM_SIZE = 16;

	var clock_control_d;
	var clock_control_e;
	var clock_control_f;

	var rtc_memory = null;
	var rtc_alarm = null;

	this.read = function () {
      /*struct zfile *f;
       f = zfile_fopen (currprefs.flashfile, "rb", ZFD_NORMAL);
       if (f) {
       zfile_fread (rtc_memory, RF5C01A_RAM_SIZE, 1, f);
       zfile_fread (rtc_alarm, RF5C01A_RAM_SIZE, 1, f);
       zfile_fclose (f);
       }*/
   };
	this.write = function () {
      /*struct zfile *f = zfile_fopen (currprefs.flashfile, L"rb+", ZFD_NORMAL);
       if (!f) {
       f = zfile_fopen (currprefs.flashfile, L"wb", 0);
       if (f) {
       zfile_fwrite (rtc_memory, RF5C01A_RAM_SIZE, 1, f);
       zfile_fwrite (rtc_alarm, RF5C01A_RAM_SIZE, 1, f);
       zfile_fclose (f);
       }
       return;
       }
       zfile_fseek (f, 0, SEEK_END);
       if (zfile_ftell (f) <= 2 * RF5C01A_RAM_SIZE) {
       zfile_fseek (f, 0, SEEK_SET);
       zfile_fwrite (rtc_memory, RF5C01A_RAM_SIZE, 1, f);
       zfile_fwrite (rtc_alarm, RF5C01A_RAM_SIZE, 1, f);
       }
       zfile_fclose (f);*/
   };

	this.setup = function () {
      BUG.info('RTC.setup() type ' + (AMIGA.config.rtc.type == SAEV_Config_RTC_Type_MSM6242B ? 'MSM6242B' : 'RF5C01A'));

      if (AMIGA.config.rtc.type == SAEV_Config_RTC_Type_MSM6242B) {
         clock_control_d = 0x1;
         clock_control_e = 0;
         clock_control_f = 0x4;
         /* 24/12 */
      } else if (AMIGA.config.rtc.type == SAEV_Config_RTC_Type_RF5C01A) {
         clock_control_d = 0x4;
         /* Timer EN */
         clock_control_e = 0;
         clock_control_f = 0;

         rtc_memory = new Uint8Array(RF5C01A_RAM_SIZE);
         rtc_alarm = new Uint8Array(RF5C01A_RAM_SIZE);

         for (var i = 0; i < RF5C01A_RAM_SIZE; i++)
            rtc_memory[i] = rtc_alarm[i] = 0;

         this.read();
      }
   };

	this.load8 = function (addr) {
      addr &= 0x3f;
      if ((addr & 3) == 2 || (addr & 3) == 0 || AMIGA.config.rtc.type == SAEV_Config_RTC_Type_None) {
         if (AMIGA.config.cpu.model == 68000 && AMIGA.config.cpu.compatible)
            return 0xff; //regs.irc >> 8;
         return 0;
      }
      var t = new Date();

      addr >>= 2;
      if (AMIGA.config.rtc.type == SAEV_Config_RTC_Type_MSM6242B) {
         switch (addr) {
            case 0x0:
               return t.getSeconds() % 10;
            case 0x1:
               return Math.floor(t.getSeconds() / 10);
            case 0x2:
               return t.getMinutes() % 10;
            case 0x3:
               return Math.floor(t.getMinutes() / 10);
            case 0x4:
               return t.getHours() % 10;
            case 0x5:
               return Math.floor(t.getHours() / 10);
            case 0x6:
               return t.getDate() % 10;
            case 0x7:
               return Math.floor(t.getDate() / 10);
            case 0x8:
               return (t.getMonth() + 1) % 10;
            case 0x9:
               return Math.floor((t.getMonth() + 1) / 10);
            case 0xA:
               return (t.getFullYear() - 1900) % 10;
            case 0xB:
               return Math.floor((t.getFullYear() - 1900) / 10);
            case 0xC:
               return t.getDay();
            case 0xD:
               return clock_control_d;
            case 0xE:
               return clock_control_e;
            case 0xF:
               return clock_control_f;
         }
      } else if (AMIGA.config.rtc.type == SAEV_Config_RTC_Type_RF5C01A) {
         var bank = clock_control_d & 3;

         if (bank >= 2 && addr < 0x0d) return (rtc_memory[addr] >> ((bank == 2) ? 0 : 4)) & 0x0f;
         if (bank == 1 && addr < 0x0d) return rtc_alarm[addr];

         switch (addr) {
            case 0x0:
               return t.getSeconds() % 10;
            case 0x1:
               return Math.floor(t.getSeconds() / 10);
            case 0x2:
               return t.getMinutes() % 10;
            case 0x3:
               return Math.floor(t.getMinutes() / 10);
            case 0x4:
               return t.getHours() % 10;
            case 0x5:
               return Math.floor(t.getHours() / 10);
            case 0x6:
               return t.getDate() % 10;
            case 0x7:
               return Math.floor(t.getDate() / 10);
            case 0x8:
               return (t.getMonth() + 1) % 10;
            case 0x9:
               return Math.floor((t.getMonth() + 1) / 10);
            case 0xA:
               return (t.getFullYear() - 1900) % 10;
            case 0xB:
               return Math.floor((t.getFullYear() - 1900) / 10);
            case 0xC:
               return t.getDay();
            case 0xD:
               return clock_control_d;
            /* E and F = write-only */
         }
      }
      return 0;
   };

	this.load16 = function (addr) {
      return (this.load8(addr) << 8) | this.load8(addr + 1);
   };

	this.load32 = function (addr) {
      return ((this.load16(addr) << 16) | this.load16(addr + 2)) >>> 0;
   };

	this.store8 = function (addr, value) {
      addr &= 0x3f;
      if ((addr & 1) != 1 || AMIGA.config.rtc.type == SAEV_Config_RTC_Type_None) return;

      addr >>= 2;
      value &= 0x0f;
      if (AMIGA.config.rtc.type == SAEV_Config_RTC_Type_MSM6242B) {
         switch (addr) {
            case 0xD:
               clock_control_d = value & (1 | 8);
               break;
            case 0xE:
               clock_control_e = value;
               break;
            case 0xF:
               clock_control_f = value;
               break;
         }
      } else if (AMIGA.config.rtc.type == SAEV_Config_RTC_Type_RF5C01A) {
         var bank = clock_control_d & 3;

         if (bank >= 2 && addr < 0x0d) {
            rtc_memory[addr] &= ((bank == 2) ? 0xf0 : 0x0f);
            rtc_memory[addr] |= value << ((bank == 2) ? 0 : 4);

            //var ov = rtc_memory[addr];
            if (rtc_memory[addr] != value) this.write();
            return;
         }
         if (bank == 1 && addr < 0x0d) {
            rtc_alarm[addr] = value;
            rtc_alarm[0] = rtc_alarm[1] = rtc_alarm[9] = rtc_alarm[12] = 0;
            rtc_alarm[3] &= ~0x8;
            rtc_alarm[5] &= ~0xc;
            rtc_alarm[6] &= ~0x8;
            rtc_alarm[8] &= ~0xc;
            rtc_alarm[10] &= ~0xe;
            rtc_alarm[11] &= ~0xc;

            //var ov = rtc_alarm[addr];
            if (rtc_alarm[addr] != value) this.write();
            return;
         }
         switch (addr) {
            case 0xD:
               clock_control_d = value;
               break;
            case 0xE:
               clock_control_e = value;
               break;
            case 0xF:
               clock_control_f = value;
               break;
         }
      }

   };

	this.store16 = function (addr, value) {
      this.store8(addr, (value >> 8) & 0xff);
      this.store8(addr + 1, value & 0xff);
   };

	this.store32 = function (addr, value) {
		this.store16(addr, (value >>> 16) & 0xffff);
		this.store16(addr + 2, value & 0xffff);
	}
}
