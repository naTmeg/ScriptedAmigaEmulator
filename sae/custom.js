/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/

function Custom() {
	this.last_value = 0;

	this.setup = function () {
   };
	this.reset = function () {
   };

	/*---------------------------------*/
	
	this.load16_real = function (hpos, addr, noput) {
      var writeonly = false;
      var v;

      addr &= 0xfff;

      switch (addr & 0x1fe) {
         case 0x002:
            v = AMIGA.DMACONR(hpos);
            break;
         case 0x004:
            v = AMIGA.playfield.VPOSR();
            break;
         case 0x006:
            v = AMIGA.playfield.VHPOSR();
            break;

         case 0x00A:
            v = AMIGA.input.JOY0DAT();
            break;
         case 0x00C:
            v = AMIGA.input.JOY1DAT();
            break;
         case 0x00E:
            v = AMIGA.playfield.CLXDAT();
            break;
         case 0x010:
            v = AMIGA.ADKCONR();
            break;

         case 0x012:
            v = AMIGA.input.POT0DAT();
            break;
         case 0x014:
            v = AMIGA.input.POT1DAT();
            break;
         case 0x016:
            v = AMIGA.input.POTGOR();
            break;
         case 0x018:
            v = AMIGA.serial.SERDATR();
            break;
         case 0x01A:
            v = AMIGA.disk.DSKBYTR(hpos);
            break;
         case 0x01C:
            v = AMIGA.INTENAR();
            break;
         case 0x01E:
            v = AMIGA.INTREQR();
            break;
         case 0x07C:
         {
            var result = AMIGA.playfield.DENISEID();
            if (result[0])
               writeonly = true;
            else
               v = result[1];
            break;
         }

         /*#ifdef AGA
          case 0x180: case 0x182: case 0x184: case 0x186: case 0x188: case 0x18A:
          case 0x18C: case 0x18E: case 0x190: case 0x192: case 0x194: case 0x196:
          case 0x198: case 0x19A: case 0x19C: case 0x19E: case 0x1A0: case 0x1A2:
          case 0x1A4: case 0x1A6: case 0x1A8: case 0x1AA: case 0x1AC: case 0x1AE:
          case 0x1B0: case 0x1B2: case 0x1B4: case 0x1B6: case 0x1B8: case 0x1BA:
          case 0x1BC: case 0x1BE:
          if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
          writeonly = true;
          v = COLOR_READ ((addr & 0x3E) >> 1);
          break;
          #endif*/

         default:
            writeonly = true;
      }

      if (writeonly) {
         v = this.last_value;
         if (!noput) {
            var l = 0xffff; //AMIGA.config.cpu.compatible && AMIGA.config.cpu.model == 68000 ? regs.irc : 0xffff;
            AMIGA.playfield.decide_line(hpos);
            AMIGA.playfield.decide_fetch(hpos);

            var r = this.store16_real(hpos, addr, l, 1);
            if (r) { /* register don't exist */
               if (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) {
                  v = l;
               } else {
                  if ((addr & 0x1fe) == 0) {
                     /*if (is_cycle_ce())
                      v = this.last_value;
                      else*/
                     v = l;
                  }
               }
            } else {
               if (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)
                  v = 0xffff;
               else
                  v = l;
            }
            //BUG.info('Custom.load16_real() %08x read = %04x. value written = %04x', 0xdff000 | addr, v, l);
            return v;
         }
      }

      this.last_value = v;
      return v;
   };

	this.load16_2 = function (addr) {
      var hpos = AMIGA.playfield.hpos();

      AMIGA.copper.sync_copper_with_cpu(hpos, 1);
      return this.load16_real(hpos, addr, 0);
   };

	this.load16 = function (addr) {
      if (addr & 1) {
         addr &= ~1;
         return (this.load16_2(addr) << 8) | (this.load16_2(addr + 2) >> 8);
      }
      return this.load16_2(addr);
   };

	this.load8 = function (addr) {
      return this.load16_2(addr & ~1) >> ((addr & 1) ? 0 : 8);
   };

	this.load32 = function (addr) {
      return ((this.load16(addr) << 16) | this.load16(addr + 2)) >>> 0;
   };
	
	/*---------------------------------*/
	
	this.store16_real = function (hpos, addr, value, noget) {
      if (!noget) this.last_value = value;

      addr &= 0x1fe;
      value &= 0xffff;

      switch (addr) {
         case 0x00E:
            AMIGA.playfield.CLXDAT();
            break;

         case 0x020:
            AMIGA.disk.DSKPTH(value);
            break;
         case 0x022:
            AMIGA.disk.DSKPTL(value);
            break;
         case 0x024:
            AMIGA.disk.DSKLEN(value, hpos);
            break;
         case 0x026: /* AMIGA.disk.DSKDAT(value). Writing to DMA write registers won't do anything */
            break;

         case 0x02A:
            AMIGA.playfield.VPOSW(value);
            break;
         case 0x02C:
            AMIGA.playfield.VHPOSW(value);
            break;
         case 0x02E:
            AMIGA.copper.COPCON(value);
            break;
         case 0x030:
            AMIGA.serial.SERDAT(value);
            break;
         case 0x032:
            AMIGA.serial.SERPER(value);
            break;
         case 0x034:
            AMIGA.input.POTGO(value);
            break;

         case 0x040:
            AMIGA.blitter.BLTCON0(hpos, value);
            break;
         case 0x042:
            AMIGA.blitter.BLTCON1(hpos, value);
            break;

         case 0x044:
            AMIGA.blitter.BLTAFWM(hpos, value);
            break;
         case 0x046:
            AMIGA.blitter.BLTALWM(hpos, value);
            break;

         case 0x050:
            AMIGA.blitter.BLTAPTH(hpos, value);
            break;
         case 0x052:
            AMIGA.blitter.BLTAPTL(hpos, value);
            break;
         case 0x04C:
            AMIGA.blitter.BLTBPTH(hpos, value);
            break;
         case 0x04E:
            AMIGA.blitter.BLTBPTL(hpos, value);
            break;
         case 0x048:
            AMIGA.blitter.BLTCPTH(hpos, value);
            break;
         case 0x04A:
            AMIGA.blitter.BLTCPTL(hpos, value);
            break;
         case 0x054:
            AMIGA.blitter.BLTDPTH(hpos, value);
            break;
         case 0x056:
            AMIGA.blitter.BLTDPTL(hpos, value);
            break;

         case 0x058:
            AMIGA.blitter.BLTSIZE(hpos, value);
            break;

         case 0x064:
            AMIGA.blitter.BLTAMOD(hpos, value);
            break;
         case 0x062:
            AMIGA.blitter.BLTBMOD(hpos, value);
            break;
         case 0x060:
            AMIGA.blitter.BLTCMOD(hpos, value);
            break;
         case 0x066:
            AMIGA.blitter.BLTDMOD(hpos, value);
            break;

         case 0x070:
            AMIGA.blitter.BLTCDAT(hpos, value);
            break;
         case 0x072:
            AMIGA.blitter.BLTBDAT(hpos, value);
            break;
         case 0x074:
            AMIGA.blitter.BLTADAT(hpos, value);
            break;

         case 0x07E:
            AMIGA.disk.DSKSYNC(value, hpos);
            break;

         case 0x080:
            AMIGA.copper.COP1LCH(value);
            break;
         case 0x082:
            AMIGA.copper.COP1LCL(value);
            break;
         case 0x084:
            AMIGA.copper.COP2LCH(value);
            break;
         case 0x086:
            AMIGA.copper.COP2LCL(value);
            break;

         case 0x088:
            AMIGA.copper.COPJMP(1, 0);
            break;
         case 0x08A:
            AMIGA.copper.COPJMP(2, 0);
            break;

         case 0x08E:
            AMIGA.playfield.DIWSTRT(hpos, value);
            break;
         case 0x090:
            AMIGA.playfield.DIWSTOP(hpos, value);
            break;
         case 0x092:
            AMIGA.playfield.DDFSTRT(hpos, value);
            break;
         case 0x094:
            AMIGA.playfield.DDFSTOP(hpos, value);
            break;

         case 0x096:
            AMIGA.DMACON(value, hpos);
            break;
         case 0x098:
            AMIGA.playfield.CLXCON(value);
            break;
         case 0x09A:
            AMIGA.INTENA(value);
            break;
         case 0x09C:
            AMIGA.INTREQ(value);
            break;
         case 0x09E:
            AMIGA.ADKCON(value, hpos);
            break;

         case 0x0A0:
            AMIGA.audio.AUDxLCH(0, value);
            break;
         case 0x0A2:
            AMIGA.audio.AUDxLCL(0, value);
            break;
         case 0x0A4:
            AMIGA.audio.AUDxLEN(0, value);
            break;
         case 0x0A6:
            AMIGA.audio.AUDxPER(0, value);
            break;
         case 0x0A8:
            AMIGA.audio.AUDxVOL(0, value);
            break;
         case 0x0AA:
            AMIGA.audio.AUDxDAT(0, value);
            break;

         case 0x0B0:
            AMIGA.audio.AUDxLCH(1, value);
            break;
         case 0x0B2:
            AMIGA.audio.AUDxLCL(1, value);
            break;
         case 0x0B4:
            AMIGA.audio.AUDxLEN(1, value);
            break;
         case 0x0B6:
            AMIGA.audio.AUDxPER(1, value);
            break;
         case 0x0B8:
            AMIGA.audio.AUDxVOL(1, value);
            break;
         case 0x0BA:
            AMIGA.audio.AUDxDAT(1, value);
            break;

         case 0x0C0:
            AMIGA.audio.AUDxLCH(2, value);
            break;
         case 0x0C2:
            AMIGA.audio.AUDxLCL(2, value);
            break;
         case 0x0C4:
            AMIGA.audio.AUDxLEN(2, value);
            break;
         case 0x0C6:
            AMIGA.audio.AUDxPER(2, value);
            break;
         case 0x0C8:
            AMIGA.audio.AUDxVOL(2, value);
            break;
         case 0x0CA:
            AMIGA.audio.AUDxDAT(2, value);
            break;

         case 0x0D0:
            AMIGA.audio.AUDxLCH(3, value);
            break;
         case 0x0D2:
            AMIGA.audio.AUDxLCL(3, value);
            break;
         case 0x0D4:
            AMIGA.audio.AUDxLEN(3, value);
            break;
         case 0x0D6:
            AMIGA.audio.AUDxPER(3, value);
            break;
         case 0x0D8:
            AMIGA.audio.AUDxVOL(3, value);
            break;
         case 0x0DA:
            AMIGA.audio.AUDxDAT(3, value);
            break;

         case 0x0E0:
            AMIGA.playfield.BPLxPTH(hpos, value, 0);
            break;
         case 0x0E2:
            AMIGA.playfield.BPLxPTL(hpos, value, 0);
            break;
         case 0x0E4:
            AMIGA.playfield.BPLxPTH(hpos, value, 1);
            break;
         case 0x0E6:
            AMIGA.playfield.BPLxPTL(hpos, value, 1);
            break;
         case 0x0E8:
            AMIGA.playfield.BPLxPTH(hpos, value, 2);
            break;
         case 0x0EA:
            AMIGA.playfield.BPLxPTL(hpos, value, 2);
            break;
         case 0x0EC:
            AMIGA.playfield.BPLxPTH(hpos, value, 3);
            break;
         case 0x0EE:
            AMIGA.playfield.BPLxPTL(hpos, value, 3);
            break;
         case 0x0F0:
            AMIGA.playfield.BPLxPTH(hpos, value, 4);
            break;
         case 0x0F2:
            AMIGA.playfield.BPLxPTL(hpos, value, 4);
            break;
         case 0x0F4:
            AMIGA.playfield.BPLxPTH(hpos, value, 5);
            break;
         case 0x0F6:
            AMIGA.playfield.BPLxPTL(hpos, value, 5);
            break;
         case 0x0F8:
            AMIGA.playfield.BPLxPTH(hpos, value, 6);
            break;
         case 0x0FA:
            AMIGA.playfield.BPLxPTL(hpos, value, 6);
            break;
         case 0x0FC:
            AMIGA.playfield.BPLxPTH(hpos, value, 7);
            break;
         case 0x0FE:
            AMIGA.playfield.BPLxPTL(hpos, value, 7);
            break;

         case 0x100:
            AMIGA.playfield.BPLCON0(hpos, value);
            break;
         case 0x102:
            AMIGA.playfield.BPLCON1(hpos, value);
            break;
         case 0x104:
            AMIGA.playfield.BPLCON2(hpos, value);
            break;
         case 0x106:
            AMIGA.playfield.BPLCON3(hpos, value);
            break;

         case 0x108:
            AMIGA.playfield.BPL1MOD(hpos, value);
            break;
         case 0x10A:
            AMIGA.playfield.BPL2MOD(hpos, value);
            break;
         //case 0x10E: AMIGA.playfield.CLXCON2(value); break; //AGA

         case 0x110:
            AMIGA.playfield.BPLxDAT(hpos, value, 0);
            break;
         case 0x112:
            AMIGA.playfield.BPLxDAT(hpos, value, 1);
            break;
         case 0x114:
            AMIGA.playfield.BPLxDAT(hpos, value, 2);
            break;
         case 0x116:
            AMIGA.playfield.BPLxDAT(hpos, value, 3);
            break;
         case 0x118:
            AMIGA.playfield.BPLxDAT(hpos, value, 4);
            break;
         case 0x11A:
            AMIGA.playfield.BPLxDAT(hpos, value, 5);
            break;
         case 0x11C:
            AMIGA.playfield.BPLxDAT(hpos, value, 6);
            break;
         case 0x11E:
            AMIGA.playfield.BPLxDAT(hpos, value, 7);
            break;

         case 0x180:
         case 0x182:
         case 0x184:
         case 0x186:
         case 0x188:
         case 0x18A:
         case 0x18C:
         case 0x18E:
         case 0x190:
         case 0x192:
         case 0x194:
         case 0x196:
         case 0x198:
         case 0x19A:
         case 0x19C:
         case 0x19E:
         case 0x1A0:
         case 0x1A2:
         case 0x1A4:
         case 0x1A6:
         case 0x1A8:
         case 0x1AA:
         case 0x1AC:
         case 0x1AE:
         case 0x1B0:
         case 0x1B2:
         case 0x1B4:
         case 0x1B6:
         case 0x1B8:
         case 0x1BA:
         case 0x1BC:
         case 0x1BE:
            AMIGA.playfield.COLOR_WRITE(hpos, value & 0xFFF, (addr & 0x3E) >> 1);
            break;

         case 0x120:
         case 0x124:
         case 0x128:
         case 0x12C:
         case 0x130:
         case 0x134:
         case 0x138:
         case 0x13C:
            AMIGA.playfield.SPRxPTH(hpos, value, (addr - 0x120) >> 2);
            break;
         case 0x122:
         case 0x126:
         case 0x12A:
         case 0x12E:
         case 0x132:
         case 0x136:
         case 0x13A:
         case 0x13E:
            AMIGA.playfield.SPRxPTL(hpos, value, (addr - 0x122) >> 2);
            break;
         case 0x140:
         case 0x148:
         case 0x150:
         case 0x158:
         case 0x160:
         case 0x168:
         case 0x170:
         case 0x178:
            AMIGA.playfield.SPRxPOS(hpos, value, (addr - 0x140) >> 3);
            break;
         case 0x142:
         case 0x14A:
         case 0x152:
         case 0x15A:
         case 0x162:
         case 0x16A:
         case 0x172:
         case 0x17A:
            AMIGA.playfield.SPRxCTL(hpos, value, (addr - 0x142) >> 3);
            break;
         case 0x144:
         case 0x14C:
         case 0x154:
         case 0x15C:
         case 0x164:
         case 0x16C:
         case 0x174:
         case 0x17C:
            AMIGA.playfield.SPRxDATA(hpos, value, (addr - 0x144) >> 3);
            break;
         case 0x146:
         case 0x14E:
         case 0x156:
         case 0x15E:
         case 0x166:
         case 0x16E:
         case 0x176:
         case 0x17E:
            AMIGA.playfield.SPRxDATB(hpos, value, (addr - 0x146) >> 3);
            break;

         case 0x36:
            AMIGA.input.JOYTEST(value);
            break;
         case 0x5A:
            AMIGA.blitter.BLTCON0L(hpos, value);
            break;
         case 0x5C:
            AMIGA.blitter.BLTSIZV(hpos, value);
            break;
         case 0x5E:
            AMIGA.blitter.BLTSIZH(hpos, value);
            break;
         case 0x1E4:
            AMIGA.playfield.DIWHIGH(hpos, value);
            break;
         //case 0x10C: AMIGA.playfield.BPLCON4(hpos, value); break; //AGA

         case 0x1DC:
            AMIGA.playfield.BEAMCON0(value);
            break;
         case 0x1C0:
            if (AMIGA.playfield.htotal != value) {
               AMIGA.playfield.htotal = value;
               AMIGA.playfield.varsync();
            }
            break;
         case 0x1C2:
            if (AMIGA.playfield.hsstop != value) {
               AMIGA.playfield.hsstop = value;
               AMIGA.playfield.varsync();
            }
            break;
         case 0x1C4:
            if (AMIGA.playfield.hbstrt != value) {
               AMIGA.playfield.hbstrt = value;
               AMIGA.playfield.varsync();
            }
            break;
         case 0x1C6:
            if (AMIGA.playfield.hbstop != value) {
               AMIGA.playfield.hbstop = value;
               AMIGA.playfield.varsync();
            }
            break;
         case 0x1C8:
            if (AMIGA.playfield.vtotal != value) {
               AMIGA.playfield.vtotal = value;
               AMIGA.playfield.varsync();
            }
            break;
         case 0x1CA:
            if (AMIGA.playfield.vsstop != value) {
               AMIGA.playfield.vsstop = value;
               AMIGA.playfield.varsync();
            }
            break;
         case 0x1CC:
            if (AMIGA.playfield.vbstrt < value || AMIGA.playfield.vbstrt > value + 1) {
               AMIGA.playfield.vbstrt = value;
               AMIGA.playfield.varsync();
            }
            break;
         case 0x1CE:
            if (AMIGA.playfield.vbstop < value || AMIGA.playfield.vbstop > value + 1) {
               AMIGA.playfield.vbstop = value;
               AMIGA.playfield.varsync();
            }
            break;
         case 0x1DE:
            if (AMIGA.playfield.hsstrt != value) {
               AMIGA.playfield.hsstrt = value;
               AMIGA.playfield.varsync();
            }
            break;
         case 0x1E0:
            if (AMIGA.playfield.vsstrt != value) {
               AMIGA.playfield.vsstrt = value;
               AMIGA.playfield.varsync();
            }
            break;
         case 0x1E2:
            if (AMIGA.playfield.hcenter != value) {
               AMIGA.playfield.hcenter = value;
               AMIGA.playfield.varsync();
            }
            break;

         //case 0x1FC: AMIGA.playfield.FMODE(hpos, value); break; //AGA
         //case 0x1FE: FNULL (value); break;
         case 0x1FE:
            break;

         /* writing to read-only register causes read access */
         default:
         {
            if (!noget) {
               //BUG.info('Custom.store16_real() %04x written', addr);
               this.load16_real(hpos, addr, 1);
            }
            return true;
         }
      }
      return false;
   };

	this.store16 = function (addr, value) {
      var hpos = AMIGA.playfield.hpos();
      AMIGA.copper.sync_copper_with_cpu(hpos, 1);
      if (addr & 1) {
         addr &= ~1;
         this.store16_real(hpos, addr, (value >> 8) | (value & 0xff00), 0);
         this.store16_real(hpos, addr + 2, (value << 8) | (value & 0x00ff), 0);
         return;
      }
      this.store16_real(hpos, addr, value, 0);
   };

	this.store8 = function (addr, value) {
      var rval;

      /*if (AMIGA.config.chipset.mask & CSMASK_AGA) {
       if (addr & 1) {
       rval = value & 0xff;
       } else {
       rval = (value << 8) | (value & 0xFF);
       }
       } else*/
      rval = (value << 8) | (value & 0xff);

      /*if (AMIGA.config.cpu.model == 68060) {
       if (addr & 1)
       this.store16(addr & ~1, rval);
       else
       this.store16(addr, value << 8);
       } else*/
      this.store16(addr & ~1, rval);
   };

	this.store32 = function (addr, value) {
		this.store16(addr & 0xfffe, value >>> 16);
		this.store16((addr + 2) & 0xfffe, value & 0xffff);
	}
	
}
