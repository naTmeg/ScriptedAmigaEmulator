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

var SAEV_Gayle_bank = null;
var SAEV_Gayle2_bank = null;

var SAEV_MBRes_bank = null;
var SAEV_MBRes_gary_timeout = 0;
var SAEV_MBRes_gary_toenb = 0;

/*---------------------------------*/

function SAEO_Gayle() {
	/*
	600000 to 9FFFFF	4 MB	Credit Card memory if CC present
	A00000 to A1FFFF	128 KB	Credit Card Attributes
	A20000 to A3FFFF	128 KB	Credit Card I/O
	A40000 to A5FFFF	128 KB	Credit Card Bits
	A60000 to A7FFFF	128 KB	PC I/O

	D80000 to D8FFFF	64 KB SPARE chip select
	D90000 to D9FFFF	64 KB ARCNET chip select
	DA0000 to DA3FFF	16 KB IDE drive
	DA4000 to DA4FFF	16 KB IDE reserved
	DA8000 to DAFFFF	32 KB Credit Card and IDE configregisters
	DB0000 to DBFFFF	64 KB Not used (reserved for external IDE)
	* DC0000 to DCFFFF	64 KB Real Time Clock (RTC)
	DD0000 to DDFFFF	64 KB A3000 DMA controller
	DD0000 to DD1FFF        A4000 DMAC
	DD2000 to DDFFFF        A4000 IDE
	DE0000 to DEFFFF	64 KB Motherboard resources*/


	const PCMCIA_COMMON_START = 0x600000;
	const PCMCIA_COMMON_SIZE = 0x400000;

	const GAYLE_LOG = 0; //0-6
	const MBRES_LOG = 1; //0-1
	const PCMCIA_LOG = 0; //0-3

	const PCMCIA_SRAM = 1;
	const PCMCIA_IDE = 2;

	/* A4000T NCR */
	const NCR_OFFSET = 0x40;
	const NCR_ALT_OFFSET = 0x80;
	const NCR_MASK = 0x3f;

	/* Gayle definitions from Linux drivers and preliminary Gayle datasheet */

	/* PCMCIA stuff */

	const GAYLE_RAM				= 0x600000;
	const GAYLE_RAMSIZE			= 0x400000;
	const GAYLE_ATTRIBUTE		= 0xa00000;
	const GAYLE_ATTRIBUTESIZE	= 0x020000;
	const GAYLE_IO					= 0xa20000; /* 16bit and even 8bit registers */
	const GAYLE_IOSIZE			= 0x010000;
	const GAYLE_IO_8BITODD		= 0xa30000; /* odd 8bit registers */

	const GAYLE_ADDRESS	= 0xda8000; /* gayle main registers base address */
	const GAYLE_RESET		= 0xa40000; /* write 0x00 to start reset, read 1 byte to stop reset */

	/*  Bases of the IDE interfaces */
	const GAYLE_BASE_4000 = 0xdd2020; /* A4000/A4000T */
	const GAYLE_BASE_1200 = 0xda0000; /* A1200/A600 and E-Matrix 530 */

	/* These are at different offsets from the base */
	const GAYLE_IRQ_4000 = 0x3020; /* WORD register MSB = 1, Harddisk is source of interrupt */
	const GAYLE_CS_1200  = 0x8000;
	const GAYLE_IRQ_1200 = 0x9000;
	const GAYLE_INT_1200 = 0xA000;
	const GAYLE_CFG_1200	= 0xB000;

	/* DA8000 */
	const GAYLE_CS_IDE	= 0x80; /* IDE int status */
	const GAYLE_CS_CCDET	= 0x40; /* credit card detect */
	const GAYLE_CS_BVD1	= 0x20; /* battery voltage detect 1 */
	const GAYLE_CS_SC		= 0x20; /* credit card status change */
	const GAYLE_CS_BVD2	= 0x10; /* battery voltage detect 2 */
	const GAYLE_CS_DA		= 0x10; /* digital audio */
	const GAYLE_CS_WR		= 0x08; /* write enable (1 == enabled) */
	const GAYLE_CS_BSY	= 0x04; /* credit card busy */
	const GAYLE_CS_IRQ	= 0x04; /* interrupt request */
	const GAYLE_CS_DAEN	= 0x02; /* enable digital audio */
	const GAYLE_CS_DIS	= 0x01; /* disable PCMCIA slot */

	/* DA9000 */
	const GAYLE_IRQ_IDE		= 0x80;
	const GAYLE_IRQ_CCDET	= 0x40; /* credit card detect */
	const GAYLE_IRQ_BVD1		= 0x20; /* battery voltage detect 1 */
	const GAYLE_IRQ_SC		= 0x20; /* credit card status change */
	const GAYLE_IRQ_BVD2		= 0x10; /* battery voltage detect 2 */
	const GAYLE_IRQ_DA		= 0x10; /* digital audio */
	const GAYLE_IRQ_WR		= 0x08; /* write enable (1 == enabled) */
	const GAYLE_IRQ_BSY		= 0x04; /* credit card busy */
	const GAYLE_IRQ_IRQ		= 0x04; /* interrupt request */
	const GAYLE_IRQ_RESET	= 0x02; /* reset machine after CCDET change */
	const GAYLE_IRQ_BERR		= 0x01; /* generate bus error after CCDET change */

	/* DAA000 */
	const GAYLE_INT_IDE		= 0x80; /* IDE interrupt enable */
	const GAYLE_INT_CCDET	= 0x40; /* credit card detect change enable */
	const GAYLE_INT_BVD1		= 0x20; /* battery voltage detect 1 change enable */
	const GAYLE_INT_SC		= 0x20; /* credit card status change enable */
	const GAYLE_INT_BVD2		= 0x10; /* battery voltage detect 2 change enable */
	const GAYLE_INT_DA		= 0x10; /* digital audio change enable */
	const GAYLE_INT_WR		= 0x08; /* write enable change enabled */
	const GAYLE_INT_BSY		= 0x04; /* credit card busy */
	const GAYLE_INT_IRQ		= 0x04; /* credit card interrupt request */
	const GAYLE_INT_BVD_LEV	= 0x02; /* BVD int level, 0=lev2,1=lev6 */
	const GAYLE_INT_BSY_LEV	= 0x01; /* BSY int level, 0=lev2,1=lev6 */

	/* 0xDAB000 GAYLE_CONFIG */
	const GAYLE_CFG_0V		= 0x00;
	const GAYLE_CFG_5V		= 0x01;
	const GAYLE_CFG_12V		= 0x02;
	const GAYLE_CFG_100NS	= 0x08;
	const GAYLE_CFG_150NS	= 0x04;
	const GAYLE_CFG_250NS   = 0x00;
	const GAYLE_CFG_720NS	= 0x0c;

	const TOTAL_IDE = 3;
	const GAYLE_IDE_ID = 0;
	const PCMCIA_IDE_ID = 2;

	/* copied from ide.js */
	const IDE_DATA			= 0x00;
	const IDE_ERROR		= 0x01;
	const IDE_STATUS		= 0x07;
	const IDE_SECONDARY	= 0x0400;
	const IDE_DEVCON		= 0x0406;
	const IDE_DRVADDR		= 0x0407;

	/*---------------------------------*/

	var idedrive = new Array(TOTAL_IDE * 2); //struct ide_hdf *
	for (var vi = 0; vi < TOTAL_IDE * 2; vi++)
		idedrive[vi] = null;

	var pcmcia_sram = null; //struct hd_hardfiledata *, global

	var pcmcia_card = 0;
	var pcmcia_readonly = false;
	var pcmcia_type = 0;
	var pcmcia_configuration = new Uint8Array(20);
	var pcmcia_configured = 0;

	var gayle_id_cnt = 0;
	var gayle_irq = 0, gayle_int = 0, gayle_cs = 0, gayle_cs_mask = 0, gayle_cfg = 0; //u8
	var ide_splitter = 0;

	var gayle_its = null; //new SAEO_IDE_threadState();

	var dataflyer_state = 0;
	var dataflyer_disable_irq = 0;
	var dataflyer_byte = 0; //u8

	/*-----------------------------------------------------------------------*/

	function pcmcia_reset() {
		//memset(pcmcia_configuration, 0, sizeof pcmcia_configuration);
		SAEF_memset(pcmcia_configuration,0, 0, 20);
		pcmcia_configured = -1;
		if (PCMCIA_LOG > 0) SAEF_log("gayle.pcmcia_reset()");
	}

	/*-----------------------------------------------------------------------*/

	function checkpcmciaideirq() {
		if (idedrive[PCMCIA_IDE_ID * 2] === null || pcmcia_type != PCMCIA_IDE || pcmcia_configured < 0)
			return 0;
		if (idedrive[PCMCIA_IDE_ID * 2].regs0 === null || (idedrive[PCMCIA_IDE_ID * 2].regs0.ide_devcon & 2))
			return 0;
		if (idedrive[PCMCIA_IDE_ID * 2].irq)
			return GAYLE_IRQ_BSY;
		return 0;
	}

	function checkgayleideirq() {
		var irq = false;

		if (dataflyer_disable_irq) {
			gayle_irq &= ~GAYLE_IRQ_IDE;
			return 0;
		}
		for (var i = 0; i < 2; i++) {
			if (idedrive[i] !== null) {
				if (!(idedrive[i].regs.ide_devcon & 2) && (idedrive[i].irq || (idedrive[i + 2] && idedrive[i + 2].irq)))
					irq = true;
				/* IDE killer feature. Do not eat interrupt to make booting faster. */
				if (idedrive[i].irq && !SAER.ide.ide_isdrive(idedrive[i]))
					idedrive[i].irq = 0;
				if (idedrive[i + 2] && idedrive[i + 2].irq && !SAER.ide.ide_isdrive(idedrive[i + 2]))
					idedrive[i + 2].irq = 0;
			}
		}
		return irq ? GAYLE_IRQ_IDE : 0;
	}

	this.rethink = function() { //rethink_gayle()
		var lev2 = 0;
		var lev6 = 0;
		var mask; //u8

		if (SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A4000) {
			gayle_irq |= checkgayleideirq();
			if ((gayle_irq & GAYLE_IRQ_IDE) && !(SAEV_Custom_intreq & 0x0008))
				SAER.custom.INTREQ_0(0x8000 | 0x0008);
			return;
		}
		if (SAEV_config.chipset.ide != SAEC_Config_Chipset_IDE_A600A1200 && !SAEV_config.chipset.pcmcia)
			return;
		gayle_irq |= checkgayleideirq();
		gayle_irq |= checkpcmciaideirq();
		mask = gayle_int & gayle_irq;
		if (mask & (GAYLE_IRQ_IDE | GAYLE_IRQ_WR))
			lev2 = 1;
		if (mask & GAYLE_IRQ_CCDET)
			lev6 = 1;
		if (mask & (GAYLE_IRQ_BVD1 | GAYLE_IRQ_BVD2)) {
			if (gayle_int & GAYLE_INT_BVD_LEV)
				lev6 = 1;
			else
				lev2 = 1;
		}
		if (mask & GAYLE_IRQ_BSY) {
			if (gayle_int & GAYLE_INT_BSY_LEV)
				lev6 = 1;
			else
				lev2 = 1;
		}
		if (lev2 && !(SAEV_Custom_intreq & 0x0008))
			SAER.custom.INTREQ_0(0x8000 | 0x0008);
		if (lev6 && !(SAEV_Custom_intreq & 0x2000))
			SAER.custom.INTREQ_0(0x8000 | 0x2000);
	}

	this.hsync = function() { //gayle_hsync()
		if (SAER.ide.ide_interrupt_hsync(idedrive[0]) || SAER.ide.ide_interrupt_hsync(idedrive[2]) || SAER.ide.ide_interrupt_hsync(idedrive[4]))
			this.rethink();
	}

	/*-----------------------------------------------------------------------*/
	/* Gayle (low) */

	function gayle_cs_change(mask, onoff) {
		var changed = false;
		if ((gayle_cs & mask) && !onoff) {
			gayle_cs &= ~mask;
			changed = true;
		} else if (!(gayle_cs & mask) && onoff) {
			gayle_cs |= mask;
			changed = true;
		}
		if (changed) {
			gayle_irq |= mask;
			SAER.gayle.rethink();
			if ((mask & GAYLE_CS_CCDET) && (gayle_irq & (GAYLE_IRQ_RESET | GAYLE_IRQ_BERR)) != (GAYLE_IRQ_RESET | GAYLE_IRQ_BERR)) {
				if (gayle_irq & GAYLE_IRQ_RESET)
					SAER.reset(0, 0);
				if (gayle_irq & GAYLE_IRQ_BERR)
					SAER_CPU_exception(2);
			}
		}
	}

	function card_trigger(insert) {
		if (insert) {
			if (pcmcia_card) {
				gayle_cs_change(GAYLE_CS_CCDET, 1);
				gayle_cfg = GAYLE_CFG_100NS;
				if (!pcmcia_readonly)
					gayle_cs_change(GAYLE_CS_WR, 1);
			}
		} else {
			gayle_cfg = 0;
			gayle_cs_change(GAYLE_CS_CCDET, 0);
			gayle_cs_change(GAYLE_CS_BVD2, 0);
			gayle_cs_change(GAYLE_CS_BVD1, 0);
			gayle_cs_change(GAYLE_CS_WR, 0);
			gayle_cs_change(GAYLE_CS_BSY, 0);
		}
		SAER.gayle.rethink();
	}

	function write_gayle_cfg(val) {
		gayle_cfg = val;
	}
	function read_gayle_cfg() {
		return gayle_cfg & 0x0f;
	}
	function write_gayle_irq(val) {
		gayle_irq = (gayle_irq & val) | (val & (GAYLE_IRQ_RESET | GAYLE_IRQ_BERR));
		if ((gayle_irq & (GAYLE_IRQ_RESET | GAYLE_IRQ_BERR)) == (GAYLE_IRQ_RESET | GAYLE_IRQ_BERR))
			pcmcia_reset();
	}
	function read_gayle_irq() {
		return gayle_irq;
	}
	function write_gayle_int(val) {
		gayle_int = val;
	}
	function read_gayle_int() {
		return gayle_int;
	}
	function write_gayle_cs(val) {
		var ov = gayle_cs;

		gayle_cs_mask = val & ~3;
		gayle_cs &= ~3;
		gayle_cs |= val & 3;
		if ((ov & 1) != (gayle_cs & 1)) {
			SAER.gayle.map_pcmcia();
			/* PCMCIA disable -> enable */
			card_trigger(!(gayle_cs & GAYLE_CS_DIS) ? 1 : 0);
			if (PCMCIA_LOG)
				SAEF_log("gayle.write_gayle_cs() %s, PC %x", !(gayle_cs & 1) ? "enabled" : "disabled", SAER_CPU_getPC());
		}
	}
	function read_gayle_cs() {
		var v = gayle_cs_mask | gayle_cs; //u8
		v |= checkgayleideirq();
		v |= checkpcmciaideirq();
		return v;
	}

	/*---------------------------------*/

	function get_gayle_ide_reg(addr) { //, struct ide_hdf **ide)
		addr &= 0xffff;
		// *ide = NULL;
		if (addr >= GAYLE_IRQ_4000 && addr <= GAYLE_IRQ_4000 + 1 && SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A4000)
			return { addr:-1, unit:-1 };
		addr &= ~0x2020;
		addr >>= 2;
		var ide2 = 0;
		if (addr & IDE_SECONDARY) {
			if (ide_splitter) {
				ide2 = 2;
				addr &= ~IDE_SECONDARY;
			}
		}
		// *ide = idedrive[ide2 + idedrive[ide2]->ide_drv];
		//return addr;
		return { addr:addr, unit:ide2 + idedrive[ide2].ide_drv };
	}

	function gayle_read2(addr) {
		addr &= 0xffff;
		if ((GAYLE_LOG > 3 && (addr != 0x2000 && addr != 0x2001 && addr != 0x3020 && addr != 0x3021 && addr != GAYLE_IRQ_1200)) || GAYLE_LOG > 5)
			SAEF_log("gayle.gayle_read2(%08x) PC %x", addr, SAER_CPU_getPC());

		if (SAEV_config.chipset.ide <= 0) {
			if (addr == 0x201c) // AR1200 IDE detection hack
				return 0x7f;
			return 0xff;
		}
		if (addr >= GAYLE_IRQ_4000 && addr <= GAYLE_IRQ_4000 + 1 && SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A4000) {
			var v = gayle_irq;
			gayle_irq = 0;
			return v;
		}
		if (addr >= 0x4000) {
			if (addr == GAYLE_IRQ_1200) {
				if (SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A600A1200)
					return read_gayle_irq();
				return 0;
			} else if (addr == GAYLE_INT_1200) {
				if (SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A600A1200)
					return read_gayle_int();
				return 0;
			}
			return 0;
		}
		var query = get_gayle_ide_reg(addr);
		/* Emulated "ide killer". Prevents long KS boot delay if no drives installed */
		if (!SAER.ide.ide_isdrive(idedrive[0]) && !SAER.ide.ide_isdrive(idedrive[1]) && !SAER.ide.ide_isdrive(idedrive[2]) && !SAER.ide.ide_isdrive(idedrive[3])) {
			if (query.addr == IDE_STATUS)
				return 0x7f;
			return 0xff;
		}
		if (query.addr != -1) //OWN
			return SAER.ide.ide_read_reg(idedrive[query.unit], query.addr);

		return 0; //OWN
	}

	function gayle_write2(addr, val) {
		if ((GAYLE_LOG > 3 && (addr != 0x2000 && addr != 0x2001 && addr != 0x3020 && addr != 0x3021 && addr != GAYLE_IRQ_1200)) || GAYLE_LOG > 5)
			SAEF_log("gayle.gayle_write2(%08x, %02x) PC %x", addr, val & 0xff, SAER_CPU_getPC());

		if (SAEV_config.chipset.ide <= 0)
			return;
		if (SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A600A1200) {
			if (addr == GAYLE_IRQ_1200) {
				write_gayle_irq(val);
				return;
			}
			if (addr == GAYLE_INT_1200) {
				write_gayle_int(val);
				return;
			}
		}
		if (addr >= 0x4000)
			return;
		var query = get_gayle_ide_reg(addr);
		if (query.addr != -1) //OWN
			SAER.ide.ide_write_reg(idedrive[query.unit], query.addr, val);
	}

	function gayle_read(addr) {
		var oaddr = addr;
		var v = 0; //u32
		var got = false;
		if (SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A600A1200) {
			if ((addr & 0xA0000) != 0xA0000)
				return 0;
		}
		addr &= 0xffff;
		if (SAEV_config.chipset.pcmcia) {
			if (SAEV_config.chipset.ide != SAEC_Config_Chipset_IDE_A600A1200) {
				if (addr == GAYLE_IRQ_1200) {
					v = read_gayle_irq();
					got = true;
				} else if (addr == GAYLE_INT_1200) {
					v = read_gayle_int();
					got = true;
				}
			}
			if (addr == GAYLE_CS_1200) {
				v = read_gayle_cs();
				got = true;
				if (PCMCIA_LOG)
					SAEF_log("gayle.gayle_read(%08x) PCMCIA STATUS %02x, PC %x", oaddr, v & 0xff, SAER_CPU_getPC());
			} else if (addr == GAYLE_CFG_1200) {
				v = read_gayle_cfg();
				got = true;
				if (PCMCIA_LOG)
					SAEF_log("gayle.gayle_read(%08x) PCMCIA CONFIG %02x, PC %x", oaddr, v & 0xff, SAER_CPU_getPC());
			}
		}
		if (!got)
			v = gayle_read2(addr);
		if (GAYLE_LOG)
			SAEF_log("gayle.gayle_read(%08x) %02x, PC %x", oaddr, v & 0xff, SAER_CPU_getPC());
		return v;
	}

	function gayle_write(addr, val) {
		var oaddr = addr;
		var got = false;
		if (SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A600A1200) {
			if ((addr & 0xA0000) != 0xA0000)
				return;
		}
		addr &= 0xffff;
		if (SAEV_config.chipset.pcmcia) {
			if (SAEV_config.chipset.ide != SAEC_Config_Chipset_IDE_A600A1200) {
				if (addr == GAYLE_IRQ_1200) {
					write_gayle_irq(val);
					got = true;
				} else if (addr == GAYLE_INT_1200) {
					write_gayle_int(val);
					got = true;
				}
			}
			if (addr == GAYLE_CS_1200) {
				write_gayle_cs(val);
				got = true;
				if (PCMCIA_LOG > 1)
					SAEF_log("gayle.gayle_write(%08x, %02x) PCMCIA STATUS PC %x", oaddr, val & 0xff, SAER_CPU_getPC());
			} else if (addr == GAYLE_CFG_1200) {
				write_gayle_cfg(val);
				got = 1;
				if (PCMCIA_LOG > 1)
					SAEF_log("gayle.gayle_write(%08x, %02x) PCMCIA CONFIG PC %x", oaddr, val & 0xff, SAER_CPU_getPC());
			}
		}

		if (GAYLE_LOG)
			SAEF_log("gayle.gayle_write(%08x, %02x) PC %x", oaddr, val & 0xff, SAER_CPU_getPC());
		if (!got)
			gayle_write2(addr, val);
	}

	this.gayle_dataflyer_enable = function(enable) {
		if (!enable) {
			dataflyer_state = 0;
			dataflyer_disable_irq = 0;
		} else
			dataflyer_state = 1;
	}

	//function isdataflyerscsiplus(uaecptr addr, uae_u32 *v, int size)
	function isdataflyerscsiplus(addr, v, size) {
		if (!dataflyer_state)
			return false;
		/*uaecptr addrmask = addr & 0xffff;
		if (addrmask >= GAYLE_IRQ_4000 && addrmask <= GAYLE_IRQ_4000 + 1 && SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A4000)
			return false;
		uaecptr addrbase = (addr & ~0xff) & ~0x1020;
		int reg = ((addr & 0xffff) & ~0x2020) >> 2;
		if (reg >= IDE_SECONDARY) {
			reg &= ~IDE_SECONDARY;
			if (reg >= 6) // normal IDE registers
				return false;
			if (size < 0) {
				switch (reg)
				{
					case 0: // 53C80 fake dma port
					soft_scsi_put(addrbase | 8, 1, *v);
					break;
					case 3:
					dataflyer_byte = *v;
					break;
				}
			} else {
				switch (reg)
				{
					case 0: // 53C80 fake dma port
					*v = soft_scsi_get(addrbase | 8, 1);
					break;
					case 3:
					*v = 0;
					if (ide_irq_check(idedrive[0], false))
						*v = dataflyer_byte;
					break;
					case 4: // select SCSI
					dataflyer_disable_irq = 1;
					dataflyer_state |= 2;
					break;
					case 5: // select IDE
					dataflyer_disable_irq = 1;
					dataflyer_state &= ~2;
					break;
				}
			}
			#if 0
			if (size < 0)
				write_log(_T("SECONDARY BASE PUT(%d) %08x %08x PC=%08x\n"), -size, addr, *v, SAER_CPU_getPC());
			else
				write_log(_T("SECONDARY BASE GET(%d) %08x PC=%08x\n"), size, addr, SAER_CPU_getPC());
			#endif
			return true;
		}
		if (!(dataflyer_state & 2))
			return false;
		if (size < 0)
			soft_scsi_put(addrbase | reg, -size, *v);
		else
			*v = soft_scsi_get(addrbase | reg, size);*/
		return true;
	}

	/*function isa4000t(*paddr) {
		if (SAEV_config.chipset.mbdmac != 2)
			return false;
		uaecptr addr = *paddr;
		if ((addr & 0xffff) >= (GAYLE_BASE_4000 & 0xffff))
			return false;
		addr &= 0xff;
		*paddr = addr;
		return true;
	}*/

	function gayle_get32(addr) {
		/*#ifdef NCR
		var v;
		if (SAEV_config.chipset.mbdmac == 2 && (addr & 0xffff) == 0x3000)
			return 0xffffffff; // NCR DIP BANK
		if (isdataflyerscsiplus(addr, &v, 4)) {
			return v;
		}
		if (isa4000t(&addr)) {
			if (addr >= NCR_ALT_OFFSET) {
				addr &= NCR_MASK;
				v = (ncr710_io_get8_a4000t(addr + 3) << 0) | (ncr710_io_get8_a4000t(addr + 2) << 8) |
					(ncr710_io_get8_a4000t(addr + 1) << 16) | (ncr710_io_get8_a4000t(addr + 0) << 24);
			} else if (addr >= NCR_OFFSET) {
				addr &= NCR_MASK;
				v = (ncr710_io_get8_a4000t(addr + 3) << 0) | (ncr710_io_get8_a4000t(addr + 2) << 8) |
					(ncr710_io_get8_a4000t(addr + 1) << 16) | (ncr710_io_get8_a4000t(addr + 0) << 24);
			}
			return v;
		}
		#endif*/
		var query = get_gayle_ide_reg(addr);
		if (query.addr == IDE_DATA) {
			var ide = idedrive[query.unit];
			return ((SAER.ide.ide_get_data(ide) << 16) | SAER.ide.ide_get_data(ide)) >>> 0;
		}
		return ((gayle_get16(addr) << 16) | gayle_get16(addr + 2)) >>> 0;
	}
	function gayle_get16(addr) {
		/*#ifdef NCR
		var v;
		if (SAEV_config.chipset.mbdmac == 2 && (addr & (0xffff - 1)) == 0x3000)
			return 0xffff; // NCR DIP BANK
		if (isdataflyerscsiplus(addr, &v, 2)) {
			return v;
		}
		if (isa4000t(&addr)) {
			if (addr >= NCR_OFFSET) {
				addr &= NCR_MASK;
				v = (ncr710_io_get8_a4000t(addr) << 8) | ncr710_io_get8_a4000t(addr + 1);
			}
			return v;
		}
		#endif*/
		var query = get_gayle_ide_reg(addr);
		if (query.addr == IDE_DATA) {
			var ide = idedrive[query.unit];
			return SAER.ide.ide_get_data(ide);
		}
		return (gayle_get8(addr) << 8) | gayle_get8(addr + 1);
	}
	function gayle_get8(addr) {
		/*#ifdef NCR
		var v;
		if (SAEV_config.chipset.mbdmac == 2 && (addr & (0xffff - 3)) == 0x3000)
			return 0xff; // NCR DIP BANK
		if (isdataflyerscsiplus(addr, &v, 1)) {
			return v;
		}
		if (isa4000t(&addr)) {
			if (addr >= NCR_OFFSET) {
				addr &= NCR_MASK;
				return ncr710_io_get8_a4000t(addr);
			}
			return 0;
		}
		#endif*/
		return gayle_read(addr); //ATT limits
	}

	function gayle_put32(addr, value) {
		/*if (isdataflyerscsiplus(addr, &value, -4))
			return;
		if (isa4000t(&addr)) {
			if (addr >= NCR_ALT_OFFSET) {
				addr &= NCR_MASK;
				ncr710_io_put8_a4000t(addr + 3, value >> 0);
				ncr710_io_put8_a4000t(addr + 2, value >> 8);
				ncr710_io_put8_a4000t(addr + 1, value >> 16);
				ncr710_io_put8_a4000t(addr + 0, value >> 24);
			} else if (addr >= NCR_OFFSET) {
				addr &= NCR_MASK;
				ncr710_io_put8_a4000t(addr + 3, value >> 0);
				ncr710_io_put8_a4000t(addr + 2, value >> 8);
				ncr710_io_put8_a4000t(addr + 1, value >> 16);
				ncr710_io_put8_a4000t(addr + 0, value >> 24);
			}
			return;
		}*/
		var query = get_gayle_ide_reg(addr);
		if (query.addr == IDE_DATA) {
			var ide = idedrive[query.unit];
			SAER.ide.ide_put_data(ide, value >>> 16);
			SAER.ide.ide_put_data(ide, value & 0xffff);
			return;
		}
		gayle_put16(addr, value >>> 16);
		gayle_put16(addr + 2, value & 0xffff);
	}
	function gayle_put16(addr, value) {
		/*#ifdef NCR
		if (isdataflyerscsiplus(addr, &value, -2)) {
			return;
		}
		if (isa4000t(&addr)) {
			if (addr >= NCR_OFFSET) {
				addr &= NCR_MASK;
				ncr710_io_put8_a4000t(addr, value >> 8);
				ncr710_io_put8_a4000t(addr + 1, value);
			}
			return;
		}
		#endif*/
		var query = get_gayle_ide_reg(addr);
		if (query.addr == IDE_DATA) {
			var ide = idedrive[query.unit];
			SAER.ide.ide_put_data(ide, value);
			return;
		}
		gayle_put8(addr, value >> 8);
		gayle_put8(addr + 1, value & 0xff);
	}
	function gayle_put8(addr, value) {
		/*#ifdef NCR
		if (isdataflyerscsiplus(addr, &value, -1)) {
			return;
		}
		if (isa4000t(&addr)) {
			if (addr >= NCR_OFFSET) {
				addr &= NCR_MASK;
				ncr710_io_put8_a4000t(addr, value);
			}
			return;
		}
		#endif*/
		gayle_write(addr, value); //ATT limits
	}

	//DECLARE_MEMORY_FUNCTIONS(gayle);
	//addrbank gayle_bank = {
	SAEV_Gayle_bank = new SAEO_Memory_addrbank(
		gayle_get32, gayle_get16, gayle_get8,
		gayle_put32, gayle_put16, gayle_put8,
		SAEF_Memory_defaultXLate, SAEF_Memory_defaultCheck, null, null, "Gayle (low)",
		SAEF_Memory_dummyGetInst32, SAEF_Memory_dummyGetInst16,
		SAEC_Memory_addrbank_flag_IO //, S_READ, S_WRITE
	);

	/*---------------------------------*/
	/* Gayle (high) */

	function gayle2_read(addr) {
		var v = 0; //u8
		if ((addr & 0xffff) == 0x1000) {
			/* Gayle ID. Gayle = 0xd0. AA Gayle = 0xd1 */
			if (gayle_id_cnt == 0 || gayle_id_cnt == 1 || gayle_id_cnt == 3 || ((SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) && gayle_id_cnt == 7)
				// || (currprefs.cs_cd32cd && !SAEV_config.chipset.ide && !SAEV_config.chipset.pcmcia && gayle_id_cnt == 2)
			) v = 0x80;
			gayle_id_cnt++;
		}
		return v;
	}

	function gayle2_write(addr, v) {
		gayle_id_cnt = 0;
	}

	function gayle2_get32(addr) {
		return ((gayle2_get16(addr) << 16) | gayle2_get16(addr + 2)) >>> 0;
	}
	function gayle2_get16(addr) {
		return (gayle2_get8(addr) << 8) | gayle2_get8(addr + 1);
	}
	function gayle2_get8(addr) {
		return gayle2_read(addr);
	}

	function gayle2_put32(addr, value) {
		gayle2_put16(addr, value >>> 16);
		gayle2_put16(addr + 2, value & 0xffff);
	}
	function gayle2_put16(addr, value) {
		gayle2_put8(addr, value >> 8);
		gayle2_put8(addr + 1, value & 0xff);
	}
	function gayle2_put8(addr, value) {
		gayle2_write(addr, value);
	}

	//DECLARE_MEMORY_FUNCTIONS(gayle2);
	//addrbank gayle2_bank = {
	SAEV_Gayle2_bank = new SAEO_Memory_addrbank(
		gayle2_get32, gayle2_get16, gayle2_get8,
		gayle2_put32, gayle2_put16, gayle2_put8,
		SAEF_Memory_defaultXLate, SAEF_Memory_defaultCheck, null, null, "Gayle (high)",
		SAEF_Memory_dummyGetInst32, SAEF_Memory_dummyGetInst16,
		SAEC_Memory_addrbank_flag_IO //, S_READ, S_WRITE
	);

	/*-----------------------------------------------------------------------*/
	/* Motherboard Resources */

	var ramsey_config = 0; //u8
	var garyidoffset = 0;
	var gary_coldboot = 0;
	//var gary_timeout = 0; -> SAEV_MBRes_gary_timeout
	//var gary_toenb = 0; -> SAEV_MBRes_gary_toenb

	function mbres_read(addr, size) {
		var v = 0;
		addr &= 0xffff;
		if (1 || SAER_CPU_regs.s) { /* CPU FC = supervisor only (only newest ramsey/gary? never implemented?) */
			var addr2 = addr & 3;
			var addr64 = (addr >> 6) & 3;
			/* Gary ID (I don't think this exists in real chips..) */
			if (addr == 0x1002 && SAEV_config.chipset.fatGaryRev >= 0) {
				garyidoffset++;
				garyidoffset &= 7;
				v = (SAEV_config.chipset.fatGaryRev << garyidoffset) & 0x80;
			}
			for (;;) {
				if (addr64 == 1 && addr2 == 0x03) { /* RAMSEY revision */
					if (SAEV_config.chipset.ramseyRev >= 0)
						v = SAEV_config.chipset.ramseyRev;
					break;
				}
				if (addr64 == 0 && addr2 == 0x03) { /* RAMSEY config */
					if (SAEV_config.chipset.ramseyRev >= 0)
						v = ramsey_config;
					break;
				}
				if (addr2 == 0x03) {
					v = 0xff;
					break;
				}
				if (addr2 == 0x02) { /* coldreboot flag */
					if (SAEV_config.chipset.fatGaryRev >= 0)
						v = gary_coldboot ? 0x80 : 0x00;
				}
				if (addr2 == 0x01) { /* toenb flag */
					if (SAEV_config.chipset.fatGaryRev >= 0)
						v = SAEV_MBRes_gary_toenb ? 0x80 : 0x00;
				}
				if (addr2 == 0x00) { /* timeout flag */
					if (SAEV_config.chipset.fatGaryRev >= 0)
						v = SAEV_MBRes_gary_timeout ? 0x80 : 0x00;
				}
				v |= 0x7f;
				break;
			}
		} else {
			v = 0xff;
		}
		if (MBRES_LOG > 0)
			SAEF_log("gayle.mbres_read(%08x, %d) %08x, PC %x, S %d", addr, size, v, SAER_CPU_getPC(), SAER_CPU_regs.s ? 1 : 0);
		return v;
	}

	function mbres_write(addr, val, size) {
		addr &= 0xffff;
		if (MBRES_LOG > 0)
			SAEF_log("gayle.mbres_write(%08x, %08x, %d) PC %x, S %d", addr, val, size, SAER_CPU_getPC(), SAER_CPU_regs.s ? 1 : 0);
		if (addr < 0x8000 && (1 || SAER_CPU_regs.s)) { /* CPU FC = supervisor only */
			var addr2 = addr & 3;
			var addr64 = (addr >> 6) & 3;
			if (addr == 0x1002)
				garyidoffset = -1;
			if (addr64 == 0 && addr2 == 0x03)
				ramsey_config = val;
			if (addr2 == 0x02)
				gary_coldboot = (val & 0x80) ? 1 : 0;
			if (addr2 == 0x01)
				SAEV_MBRes_gary_toenb = (val & 0x80) ? 1 : 0;
			if (addr2 == 0x00)
				SAEV_MBRes_gary_timeout = (val & 0x80) ? 1 : 0;
		}
	}

	function mbres_get32(addr) {
		return ((mbres_get16(addr) << 16) | mbres_get16(addr + 2)) >>> 0;
	}
	function mbres_get16(addr) {
		return mbres_read(addr, 2);
	}
	function mbres_get8(addr) {
		return mbres_read(addr, 1);
	}

	function mbres_put32(addr, value) {
		mbres_put16(addr, value >>> 16);
		mbres_put16(addr + 2, value & 0xffff);
	}
	function mbres_put16(addr, value) {
		mbres_write(addr, value, 2);
	}
	function mbres_put8(addr, value) {
		mbres_write(addr, value, 1);
	}

	var mbres_sub_bank = new SAEO_Memory_addrbank(
		mbres_get32, mbres_get16, mbres_get8,
		mbres_put32, mbres_put16, mbres_put8,
		SAEF_Memory_defaultXLate, SAEF_Memory_defaultCheck, null, null, "Motherboard Resources",
		SAEF_Memory_dummyGetInst32, SAEF_Memory_dummyGetInst16,
		SAEC_Memory_addrbank_flag_IO //, S_READ, S_WRITE,
	);
	SAEV_MBRes_bank = new SAEO_Memory_addrbank( //mbres_bank
		SAEF_Memory_subBankGet32, SAEF_Memory_subBankGet16, SAEF_Memory_subBankGet8,
		SAEF_Memory_subBankPut32, SAEF_Memory_subBankPut16, SAEF_Memory_subBankPut8,
		SAEF_Memory_subBankXLate, SAEF_Memory_subBankCheck, null, null, "Motherboard Resources",
		SAEF_Memory_subBankGetInst32, SAEF_Memory_subBankGetInst16,
		SAEC_Memory_addrbank_flag_IO, /* S_READ, S_WRITE, */ [
			new SAEO_Memory_addrbank_sub(mbres_sub_bank, 0x0000),
			new SAEO_Memory_addrbank_sub(SAEV_Memory_dummyBank, 0x8000),
			new SAEO_Memory_addrbank_sub(null, 0)
		]
	);

	/*-----------------------------------------------------------------------*/
	/* PCMCIA support */

	var pcmcia_common_size = 0, pcmcia_attrs_size = 0;
	var pcmcia_common = null; //u8 *
	var pcmcia_attrs = null; //u8 *
	var pcmcia_write_min = 0, pcmcia_write_max = 0;
	var pcmcia_idedata = 0; //u16

	function get_pcmcmia_ide_reg(addr, width) { //, struct ide_hdf **ide)
		// *ide = NULL;
		addr &= 0x80000 - 1;
		if (addr < 0x20000)
			return { reg:-1, unit:-1 }; /* attribute */
		if (addr >= 0x40000)
			return { reg:-1, unit:-1 };
		addr -= 0x20000;
		// 8BITODD
		if (addr >= 0x10000) {
			addr &= ~0x10000;
			addr |= 1;
		}
		// *ide = idedrive[PCMCIA_IDE_ID * 2];
		var unit = PCMCIA_IDE_ID * 2;
		//if ((*ide)->ide_drv)
		if (idedrive[unit].ide_drv)
			//*ide = idedrive[PCMCIA_IDE_ID * 2 + 1];
			unit = PCMCIA_IDE_ID * 2 + 1;

		var reg = -1;
		if (pcmcia_configured == 1) {
			// IO mapped linear
			reg = addr & 15;
			if (reg < 8)
				return reg;
			if (reg == 8)
				reg = IDE_DATA;
			else if (reg == 9)
				reg = IDE_DATA;
			else if (reg == 13)
				reg = IDE_ERROR;
			else if (reg == 14)
				reg = IDE_DEVCON;
			else if (reg == 15)
				reg = IDE_DRVADDR;
			else
				reg = -1;
		} else if (pcmcia_configured == 2) {
			// primary io mapped (PC)
			if (addr >= 0x1f0 && addr <= 0x1f7)
				reg = addr - 0x1f0;
			else if (addr == 0x3f6)
				reg = IDE_DEVCON;
			else if (addr == 0x3f7)
				reg = IDE_DRVADDR;
			else
				reg = -1;
		}
		return { reg:reg, unit:unit };
	}

	function checkflush(addr) {
		if (pcmcia_card == 0 || pcmcia_sram === null)
			return;
		if (addr >= 0 && pcmcia_common[0] == 0 && pcmcia_common[1] == 0 && pcmcia_common[2] == 0)
			return; // do not flush periodically if used as a ram expension
		if (addr < 0) {
			pcmcia_write_min = 0;
			pcmcia_write_max = pcmcia_common_size;
		}
		if (pcmcia_write_min >= 0) {
			if (Math.abs(pcmcia_write_min - addr) >= 512 || Math.abs(pcmcia_write_max - addr) >= 512) {
				var blocksize = pcmcia_sram.hfd.ci.blocksize;
				var mask = ~(blocksize - 1) >>> 0;
				var start = (pcmcia_write_min & mask) >>> 0;
				var end = ((pcmcia_write_max + blocksize - 1) & mask) >>> 0;
				var len = end - start;
				if (len > 0) {
					//SAER.hardfile.hdf_write(pcmcia_sram.hfd, pcmcia_common + start, start, len); //ATT +
					SAER.hardfile.hdf_write(pcmcia_sram.hfd, pcmcia_common.subarray(start), start, len);
					pcmcia_write_min = -1;
					pcmcia_write_max = -1;
				}
			}
		}
		if (pcmcia_write_min < 0 || pcmcia_write_min > addr)
			pcmcia_write_min = addr;
		if (pcmcia_write_max < 0 || pcmcia_write_max < addr)
			pcmcia_write_max = addr;
	}

	/*-----------------------------------------------------------------------*/
	/* PCMCIA Common */

	function gayle_common_read(addr) {
		if (PCMCIA_LOG > 2)
			SAEF_log("gayle.gayle_common_read(%x) PC %x", addr, SAER_CPU_getPC());
		if (!pcmcia_common_size)
			return 0;
		addr -= PCMCIA_COMMON_START & (PCMCIA_COMMON_SIZE - 1);
		addr &= PCMCIA_COMMON_SIZE - 1;
		if (addr < pcmcia_common_size)
			return pcmcia_common[addr];
		return 0;
	}

	function gayle_common_write(addr, v) {
		if (PCMCIA_LOG > 2)
			SAEF_log("gayle.gayle_common_write(%x, %x) PC %x", addr, v, SAER_CPU_getPC());
		if (!pcmcia_common_size)
			return;
		if (pcmcia_readonly)
			return;
		addr -= PCMCIA_COMMON_START & (PCMCIA_COMMON_SIZE - 1);
		addr &= PCMCIA_COMMON_SIZE - 1;
		if (addr < pcmcia_common_size) {
			if (pcmcia_common[addr] != v) {
				checkflush(addr);
				pcmcia_common[addr] = v;
			}
		}
	}

	function gayle_common_get32(addr) {
		return ((gayle_common_get16(addr) << 16) | gayle_common_get16(addr + 2)) >>> 0;
	}
	function gayle_common_get16(addr) {
		return (gayle_common_get8(addr) << 8) | gayle_common_get8(addr + 1);
	}
	function gayle_common_get8(addr) {
		return gayle_common_read(addr);
	}
	function gayle_common_put32(addr, value) {
		gayle_common_put16(addr, value >>> 16);
		gayle_common_put16(addr + 2, value & 0xffff);
	}
	function gayle_common_put16(addr, value) {
		gayle_common_put8(addr, value >> 8);
		gayle_common_put8(addr + 1, value & 0xff);
	}
	function gayle_common_put8(addr, value) {
		gayle_common_write(addr, value);
	}

	function gayle_common_check(addr, size) {
		if (!pcmcia_common_size)
			return 0;
		addr -= PCMCIA_COMMON_START & (PCMCIA_COMMON_SIZE - 1);
		addr &= PCMCIA_COMMON_SIZE - 1;
		return (addr + size) <= PCMCIA_COMMON_SIZE;
	}

	function gayle_common_xlate(addr) {
		addr -= PCMCIA_COMMON_START & (PCMCIA_COMMON_SIZE - 1);
		addr &= PCMCIA_COMMON_SIZE - 1;
		//return pcmcia_common + addr;
		return addr;
	}

	var gayle_common_bank = new SAEO_Memory_addrbank(
		gayle_common_get32, gayle_common_get16, gayle_common_get8,
		gayle_common_put32, gayle_common_put16, gayle_common_put8,
		gayle_common_xlate, gayle_common_check, null, null, "Gayle PCMCIA Common",
		gayle_common_get32, gayle_common_get16,
		SAEC_Memory_addrbank_flag_RAM | SAEC_Memory_addrbank_flag_SAFE //, S_READ, S_WRITE
	);

	/*-----------------------------------------------------------------------*/
	/* PCMCIA Attribute/Misc */

	function gayle_attr_read(addr) {
		if (PCMCIA_LOG > 1)
			SAEF_log("gayle.gayle_attr_read(%x) PCMCIA ATTR, PC %x", addr, SAER_CPU_getPC());
		addr &= 0x80000 - 1;
		if (addr >= 0x40000) {
			if (PCMCIA_LOG > 0)
				SAEF_log("gayle.gayle_attr_read() reset disabled");
			return 0;
		}
		if (addr >= pcmcia_attrs_size)
			return 0;
		if (pcmcia_type == PCMCIA_IDE) {
			if (addr >= 0x200 && addr < 0x200 + pcmcia_configuration.length * 2) {
				var offset = (addr - 0x200) >> 1;
				return pcmcia_configuration[offset];
			}
			if (pcmcia_configured >= 0) {
				var query = get_pcmcmia_ide_reg(addr, 1);
				if (query.reg >= 0) {
					var ide = idedrive[query.unit];
					if (query.reg == 0) {
						if (addr >= 0x30000) {
							return pcmcia_idedata & 0xff;
						} else {
							pcmcia_idedata = SAER.ide.ide_get_data(ide);
							return (pcmcia_idedata >> 8) & 0xff;
						}
					} else
						return SAER.ide.ide_read_reg(ide, query.reg);
				}
			}
		}
		return pcmcia_attrs[addr >> 1];
	}

	function gayle_attr_write(addr, v) {
		if (PCMCIA_LOG > 1)
			SAEF_log("gayle.gayle_attr_write(%x, %x) PCMCIA ATTR, PC %x", addr, v, SAER_CPU_getPC());
		addr &= 0x80000 - 1;
		if (addr >= 0x40000) {
			if (PCMCIA_LOG > 0)
				SAEF_log("gayle.gayle_attr_write() reset enabled");
			pcmcia_reset();
		} else if (addr < pcmcia_attrs_size) {
			 if (pcmcia_type == PCMCIA_IDE) {
				 if (addr >= 0x200 && addr < 0x200 + pcmcia_configuration.length * 2) {
					var offset = (addr - 0x200) >> 1;
					pcmcia_configuration[offset] = v;
					if (offset == 0) {
						if (v & 0x80) {
							pcmcia_reset();
						} else {
							var index = v & 0x3f;
							if (index != 1 && index != 2) {
								SAEF_warn("gayle.gayle_attr_write() only config index 1 and 2 emulated, attempted to select %d!", index);
							} else {
								pcmcia_configured = index;
								SAEF_log("gayle.gayle_attr_write() PCMCIA IO configured = %02x", v);
							}
						}
					}
				}
				if (pcmcia_configured >= 0) {
					var query = get_pcmcmia_ide_reg(addr, 1);
					if (query.reg >= 0) {
						var ide = idedrive[query.unit];
						if (query.reg == 0) {
							if (addr >= 0x30000) {
								pcmcia_idedata = (v & 0xff) << 8;
							} else {
								pcmcia_idedata &= 0xff00;
								pcmcia_idedata |= v & 0xff;
								SAER.ide.ide_put_data(ide, pcmcia_idedata);
							}
							return;
						}
						SAER.ide.ide_write_reg(ide, query.reg, v);
					}
				 }
			 }
		}
	}

	function gayle_attr_get32(addr) {
		return ((gayle_attr_get16(addr) << 16) | gayle_attr_get16(addr + 2)) >>> 0;
	}
	function gayle_attr_get16(addr) {
		if (pcmcia_type == PCMCIA_IDE && pcmcia_configured >= 0) {
			var query = get_pcmcmia_ide_reg(addr, 2);
			if (query.reg == IDE_DATA) {
				// 16-bit register
				pcmcia_idedata = SAER.ide.ide_get_data(idedrive[query.unit]);
				return pcmcia_idedata;
			}
		}
		return (gayle_attr_get8(addr) << 8) | gayle_attr_get8(addr + 1);
	}
	function gayle_attr_get8(addr) {
		return gayle_attr_read(addr);
	}

	function gayle_attr_put32(addr, value) {
		gayle_attr_put16(addr, value >>> 16);
		gayle_attr_put16(addr + 2, value & 0xffff);
	}
	function gayle_attr_put16 (addr, value) {
		if (pcmcia_type == PCMCIA_IDE && pcmcia_configured >= 0) {
			var query = get_pcmcmia_ide_reg(addr, 2);
			if (query.reg == IDE_DATA) {
				// 16-bit register
				pcmcia_idedata = value;
				SAER.ide.ide_put_data(idedrive[query.unit], pcmcia_idedata);
				return;
			}
		}
		gayle_attr_put8(addr, value >> 8);
		gayle_attr_put8(addr + 1, value & 0xff);
	}
	function gayle_attr_put8 (addr, value) {
		gayle_attr_write(addr, value);
	}

	var gayle_attr_bank = new SAEO_Memory_addrbank(
		gayle_attr_get32, gayle_attr_get16, gayle_attr_get8,
		gayle_attr_put32, gayle_attr_put16, gayle_attr_put8,
		SAEF_Memory_defaultXLate, SAEF_Memory_defaultCheck, null, null, "Gayle PCMCIA Attribute/Misc",
		SAEF_Memory_dummyGetInst32, SAEF_Memory_dummyGetInst16,
		SAEC_Memory_addrbank_flag_IO | SAEC_Memory_addrbank_flag_SAFE //, S_READ, S_WRITE
	);

	/*-----------------------------------------------------------------------*/
	/* setup/cleanup/reset */

	function setCSTR(p, po, s) { //OWN
		var sl = s.length;
		p.set(SAEF_String2Array(s, 0, sl), po);
		p[po + sl] = 0;
		return sl + 1;
	}
	function initscideattr(readonly) {
		var p = pcmcia_attrs;
		var po = 0; //OWN
		//var hfd = pcmcia_sram.hfd;

		/* Mostly just copied from real CF cards.. */

		/* CISTPL_DEVICE */
		p[po++] = 0x01;
		p[po++] = 0x04;
		p[po++] = 0xdf;
		p[po++] = 0x4a;
		p[po++] = 0x01;
		p[po++] = 0xff;

		/* CISTPL_DEVICEOC */
		p[po++] = 0x1c;
		p[po++] = 0x04;
		p[po++] = 0x02;
		p[po++] = 0xd9;
		p[po++] = 0x01;
		p[po++] = 0xff;

		/* CISTPL_JEDEC */
		p[po++] = 0x18;
		p[po++] = 0x02;
		p[po++] = 0xdf;
		p[po++] = 0x01;

		/* CISTPL_VERS_1 */
		p[po++]= 0x15;
		var rp = po++;
		p[po++]= 4; /* PCMCIA 2.1 */
		p[po++]= 1;
		po += setCSTR(p, po, "UAE");
		po += setCSTR(p, po, "68000");
		po += setCSTR(p, po, "Generic Emulated PCMCIA IDE");
		p[po++]= 0xff;
		p[rp] = po - rp - 1;

		/* CISTPL_FUNCID */
		p[po++] = 0x21;
		p[po++] = 0x02;
		p[po++] = 0x04;
		p[po++] = 0x01;

		/* CISTPL_FUNCE */
		p[po++] = 0x22;
		p[po++] = 0x02;
		p[po++] = 0x01;
		p[po++] = 0x01;

		/* CISTPL_FUNCE */
		p[po++] = 0x22;
		p[po++] = 0x03;
		p[po++] = 0x02;
		p[po++] = 0x0c;
		p[po++] = 0x0f;

		/* CISTPL_CONFIG */
		p[po++] = 0x1a;
		p[po++] = 0x05;
		p[po++] = 0x01;
		p[po++] = 0x01;
		p[po++] = 0x00;
		p[po++] = 0x02;
		p[po++] = 0x0f;

		/* CISTPL_CFTABLEENTRY */
		p[po++] = 0x1b;
		p[po++] = 0x06;
		p[po++] = 0xc0;
		p[po++] = 0x01;
		p[po++] = 0x21;
		p[po++] = 0xb5;
		p[po++] = 0x1e;
		p[po++] = 0x4d;

		/* CISTPL_NO_LINK */
		p[po++] = 0x14;
		p[po++] = 0x00;

		/* CISTPL_END */
		p[po] = 0xff;
	}

	function initsramattr(size, readonly) {
		var p = pcmcia_attrs;
		var po = 0; //OWN
		var hfd = pcmcia_sram.hfd;
		var real = false; //hfd.flags & HFD_FLAGS_REALDRIVE;

		var code = 0;
		var su = 512;
		var sm = 16384;
		while (size > sm) {
			sm *= 4;
			su *= 4;
			code++;
		}
		var units = 31 - Math.floor((sm - size) / su);

		/* CISTPL_DEVICE */
		p[po++] = 0x01;
		p[po++] = 3;
		p[po++] = (6 /* DTYPE_SRAM */ << 4) | (readonly ? 8 : 0) | (4 /* SPEED_100NS */);
		p[po++] = (units << 3) | code; /* memory card size in weird units */
		p[po++] = 0xff;

		/* CISTPL_DEVICEGEO */
		p[po++] = 0x1e;
		p[po++] = 7;
		p[po++] = 2; /* 16-bit PCMCIA */
		p[po++] = 0;
		p[po++] = 1;
		p[po++] = 1;
		p[po++] = 1;
		p[po++] = 1;
		p[po++] = 0xff;

		/* CISTPL_VERS_1 */
		p[po++]= 0x15;
		var rp = po++;
		p[po++]= 4; /* PCMCIA 2.1 */
		p[po++]= 1;
		if (real) {
			po += setCSTR(p, po, hfd.product_id);
			po += setCSTR(p, po, hfd.product_rev);
		} else {
			po += setCSTR(p, po, "UAE");
			po += setCSTR(p, po, "68000");
		}
		po += setCSTR(p, po, sprintf("Generic Emulated %dKB PCMCIA SRAM Card", size >> 10));
		p[po++]= 0xff;
		p[rp] = po - rp - 1;

		/* CISTPL_FUNCID */
		p[po++] = 0x21;
		p[po++] = 2;
		p[po++] = 1; /* Memory Card */
		p[po++] = 0;

		/* CISTPL_MANFID */
		p[po++] = 0x20;
		p[po++] = 4;
		p[po++] = 0xff;
		p[po++] = 0xff;
		p[po++] = 1;
		p[po++] = 1;

		/* CISTPL_END */
		p[po++] = 0xff;
	}

	function initpcmcia(path, data, readonly, type, reset, uci) {
		if (!SAEV_config.chipset.pcmcia)
			return 0;
		freepcmcia(reset);
		if (pcmcia_sram === null)
			pcmcia_sram = new SAEO_Hardfile_Data_HD();
		if (!pcmcia_sram.hfd.handle_valid)
			reset = true;

		//pcmcia_sram.hfd.ci.rootdir = path;
		pcmcia_sram.hfd.ci.file.name = path; //OWN
		pcmcia_sram.hfd.ci.file.size = data.length;
		pcmcia_sram.hfd.ci.file.data = data;
		pcmcia_sram.hfd.ci.readonly = readonly;
		pcmcia_sram.hfd.ci.blocksize = 512;

		if (type == PCMCIA_SRAM) {
			if (reset) {
				if (path.length)
					SAER.hardfile.hdf_hd_open(pcmcia_sram);
			} else
				pcmcia_sram.hfd.drive_empty = false;

			if (pcmcia_sram.hfd.ci.readonly)
				readonly = true;
			pcmcia_common_size = 0;
			pcmcia_readonly = readonly;
			pcmcia_attrs_size = 256;
			pcmcia_attrs = new Uint8Array(pcmcia_attrs_size);
			pcmcia_type = type;

			if (!pcmcia_sram.hfd.drive_empty) {
				pcmcia_common_size = pcmcia_sram.hfd.virtsize;
				if (pcmcia_sram.hfd.virtsize > 4 * 1024 * 1024) {
					SAEF_warn("gayle.initpcmcia() PCMCIA SRAM: too large device (%d bytes)", pcmcia_sram.hfd.virtsize);
					pcmcia_common_size = 4 * 1024 * 1024;
				}
				pcmcia_common = new Uint8Array(pcmcia_common_size);
				SAEF_log("gayle.initpcmcia() PCMCIA SRAM: '%s' open, size %d", path, pcmcia_common_size);
				SAER.hardfile.hdf_read(pcmcia_sram.hfd, pcmcia_common, 0, pcmcia_common_size);
				pcmcia_card = 1;
				initsramattr(pcmcia_common_size, readonly);
				if (!(gayle_cs & GAYLE_CS_DIS)) {
					SAER.gayle.map_pcmcia();
					card_trigger(1);
				}
			}
		} else if (type == PCMCIA_IDE) {
			if (reset && path.length)
				SAER.ide.add_ide_unit(idedrive, TOTAL_IDE * 2, PCMCIA_IDE_ID * 2, uci, null);

			SAER.ide.ide_initialize(idedrive, PCMCIA_IDE_ID);

			pcmcia_common_size = 0;
			pcmcia_readonly = uci.readonly;
			pcmcia_attrs_size = 0x40000;
			pcmcia_attrs = new Uint8Array(pcmcia_attrs_size);
			pcmcia_type = type;

			SAEF_log("gayle.initpcmcia() PCMCIA IDE: '%s' open", path);
			pcmcia_card = 1;
			initscideattr(pcmcia_readonly);
			if (!(gayle_cs & GAYLE_CS_DIS)) {
				SAER.gayle.map_pcmcia();
				card_trigger(1);
			}
		}
		pcmcia_write_min = -1;
		pcmcia_write_max = -1;
		return 1;
	}

	function freepcmcia(reset) {
		SAEF_log("gayle.freepcmcia() reset %d", reset?1:0);
		if (pcmcia_sram !== null) {
			checkflush(-1);
			if (reset) {
				SAER.hardfile.hdf_hd_close(pcmcia_sram);
				//xfree(pcmcia_sram);
				pcmcia_sram = null;
			} else
				pcmcia_sram.hfd.drive_empty = true;
		}
		SAER.ide.remove_ide_unit(idedrive, PCMCIA_IDE_ID * 2);
		if (pcmcia_card)
			gayle_cs_change(GAYLE_CS_CCDET, 0);

		pcmcia_reset();
		pcmcia_card = 0;

		//xfree(pcmcia_common);
		//xfree(pcmcia_attrs);
		pcmcia_common = null;
		pcmcia_attrs = null;
		pcmcia_common_size = 0;
		pcmcia_attrs_size = 0;

		gayle_cfg = 0;
		gayle_cs = 0;
		return 1;
	}

	/*---------------------------------*/

	this.map_pcmcia = function() { //gayle_map_pcmcia()
		if (!SAEV_config.chipset.pcmcia)
			return;
		if (pcmcia_card == 0 || (gayle_cs & GAYLE_CS_DIS)) {
			SAER.memory.map_banks_cond(SAEV_Memory_dummyBank, 0xa0, 8, 0);
			if (SAEV_config.memory.chipSize <= 4 * 1024 * 1024 && SAER.memory.getz2endaddr() <= 4 * 1024 * 1024)
				SAER.memory.map_banks_cond(SAEV_Memory_dummyBank, PCMCIA_COMMON_START >> 16, PCMCIA_COMMON_SIZE >> 16, 0);
		} else {
			SAER.memory.map_banks_cond(gayle_attr_bank, 0xa0, 8, 0);
			if (SAEV_config.memory.chipSize <= 4 * 1024 * 1024 && SAER.memory.getz2endaddr() <= 4 * 1024 * 1024)
				SAER.memory.map_banks_cond(gayle_common_bank, PCMCIA_COMMON_START >> 16, PCMCIA_COMMON_SIZE >> 16, 0);
		}
	}

	this.free_units = function() { //gayle_free_units()
		for (var i = 0; i < TOTAL_IDE * 2; i++) {
			SAER.ide.remove_ide_unit(idedrive, i);
		}
		freepcmcia(true);
	}

	/*---------------------------------*/

	/*#if 0
	#include "zfile.h"
	static void dumphdf (struct hardfiledata *hfd) {
		int i;
		uae_u8 buf[512];
		int off;
		struct zfile *zf;

		zf = zfile_fopen("c:\\d\\tmp.dmp", "wb");
		off = 0;
		for (i = 0; i < 128; i++) {
			SAER.hardfile.hdf_read(hfd, buf, off, 512);
			zfile_fwrite(buf, 1, 512, zf);
			off += 512;
		}
		zfile_fclose(zf);
	}
	#endif*/

	/*---------------------------------*/

	this.gayle_add_ide_unit = function(ch, ci) {
		if (ch >= 2 * 2)
			return -1;
		var ide = SAER.ide.add_ide_unit(idedrive, TOTAL_IDE * 2, ch, ci, null);
		if (ide === null)
			return 0;
		//dumphdf(ide.hdhfd.hfd);
		return 1;
	}

	this.gayle_add_pcmcia_sram_unit = function(uci) {
		return initpcmcia(uci.file.name, uci.file.data, uci.readonly, PCMCIA_SRAM, true, null);
	}
	this.gayle_add_pcmcia_ide_unit = function(uci) {
		return initpcmcia(uci.file.name, uci.file.data, false, PCMCIA_IDE, true, uci);
	}

	this.gayle_modify_pcmcia_sram_unit = function(uci, insert) {
		if (insert)
			return initpcmcia(uci.file.name, uci.file.data, uci.readonly, PCMCIA_SRAM, pcmcia_sram === null, null);
		else
			return freepcmcia(false);
	}
	this.gayle_modify_pcmcia_ide_unit = function(uci, insert) {
		if (insert)
			return initpcmcia(uci.file.name, uci.file.data, false, PCMCIA_IDE, pcmcia_sram === null, uci);
		else
			return freepcmcia(false);
	}

	function initide() {
		//gayle_its.idetable = idedrive;
		//gayle_its.idetotal = TOTAL_IDE * 2;
		//SAER.ide.start_ide_thread(gayle_its);
		SAER.ide.alloc_ide_mem(idedrive, TOTAL_IDE * 2, gayle_its);
		SAER.ide.ide_initialize(idedrive, GAYLE_IDE_ID);
		SAER.ide.ide_initialize(idedrive, GAYLE_IDE_ID + 1);

		ide_splitter = 0;
		if (SAER.ide.ide_isdrive(idedrive[2]) || SAER.ide.ide_isdrive(idedrive[3])) {
			ide_splitter = 1;
			SAEF_log("gayle.initide() IDE splitter enabled");
		}
		gayle_irq = gayle_int = 0;
	}

	this.cleanup = function() { //gayle_free()
		//SAER.ide.stop_ide_thread(gayle_its);
	}

	/*---------------------------------*/

	this.reset = function(hardreset) { //gayle_reset()
		initide();
		if (hardreset) {
			ramsey_config = 0;
			gary_coldboot = 1;
			SAEV_MBRes_gary_timeout = 0;
			SAEV_MBRes_gary_toenb = 0;
		}
		var bankname = "Gayle (low)";
		if (SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A4000)
			bankname = "A4000 IDE";
		/*#ifdef NCR
		if (SAEV_config.chipset.mbdmac == 2) {
			bankname += " + NCR53C710 SCSI";
			ncr_init();
			ncr_reset();
		}
		#endif*/
		SAEV_Gayle_bank.name = bankname;
		this.gayle_dataflyer_enable(false);
	}
}
