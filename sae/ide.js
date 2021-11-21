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

function SAEO_IDE_threadState() { //ide_thread_state
	this.idetable = null; //**
	this.idetotal = 0;
	this.state = 0; //volatile
	this.requests = new smp_comm_pipe();
};

/*---------------------------------*/

/*#define IDE_MEMORY_FUNCTIONS(x, y, z) \
static void REGPARAM2 x ## _put8(uaecptr addr, uae_u32 b) \
{ \
	y ## _write_byte(z, addr, b); \
} \
static void REGPARAM2 x ## _put16(uaecptr addr, uae_u32 b) \
{ \
	y ## _write_word(z, addr, b); \
} \
static void REGPARAM2 x ## _put32(uaecptr addr, uae_u32 b) \
{ \
	y ## _write_word(z, addr, b >> 16); \
	y ## _write_word(z, addr + 2, b); \
} \
static uae_u32 REGPARAM2 x ## _get8(uaecptr addr) \
{ \
return y ## _read_byte(z, addr); \
} \
static uae_u32 REGPARAM2 x ## _get16(uaecptr addr) \
{ \
return y ## _read_word(z, addr); \
} \
static uae_u32 REGPARAM2 x ## _get32(uaecptr addr) \
{ \
	uae_u32 v = y ## _read_word(z, addr) << 16; \
	v |= y ## _read_word(z, addr + 2); \
	return v; \
}*/

function SAEO_IDE() {
	const IDE_LOG = 0; //0-3

	const IDE_DATA		= 0x00;
	const IDE_ERROR	= 0x01; /* see err-bits */
	const IDE_NSECTOR	= 0x02; /* sector count, nr of sectors to read/write */
	const IDE_SECTOR	= 0x03; /* starting sector */
	const IDE_LCYL		= 0x04; /* starting cylinder */
	const IDE_HCYL		= 0x05; /* high byte of starting cyl */
	const IDE_SELECT	= 0x06; /* 101dhhhh , d=drive, hhhh=head */
	const IDE_STATUS	= 0x07; /* see status-bits */

	const IDE_SECONDARY	= 0x0400;
	const IDE_DEVCON		= 0x0406;
	const IDE_DRVADDR		= 0x0407;

	/* STATUS bits */
	const IDE_STATUS_ERR = 0x01; // 0
	const IDE_STATUS_IDX = 0x02; // 1
	const IDE_STATUS_DRQ = 0x08; // 3
	const IDE_STATUS_DSC = 0x10; // 4
	const IDE_STATUS_DRDY = 0x40;// 6
	const IDE_STATUS_BSY = 0x80; // 7
	//const ATAPI_STATUS_CHK = IDE_STATUS_ERR;

	/* ERROR bits */
	const IDE_ERR_UNC = 0x40;
	const IDE_ERR_MC = 0x20;
	const IDE_ERR_IDNF = 0x10;
	const IDE_ERR_MCR = 0x08;
	const IDE_ERR_ABRT = 0x04;
	const IDE_ERR_NM = 0x02;

	const ATAPI_ERR_EOM = 0x02;
	const ATAPI_ERR_ILI = 0x01;

	/* ATAPI interrupt reason (Sector Count) */
	/*const ATAPI_IO = 0x02;
	const ATAPI_CD = 0x01;
	const ATAPI_MAX_TRANSFER = 32768;*/
	const MAX_IDE_MULTIPLE_SECTORS = 128;

	function ide_registers() { //all u8
		this.ide_select = 0;
		this.ide_nsector = 0;
		this.ide_sector = 0;
		this.ide_lcyl = 0;
		this.ide_hcyl = 0;
		this.ide_devcon = 0;
		this.ide_error = 0;
		this.ide_feat = 0;

		this.ide_nsector2 = 0;
		this.ide_sector2 = 0;
		this.ide_lcyl2 = 0;
		this.ide_hcyl2 = 0;
		this.ide_feat2 = 0;

		this.ide_status = 0;
	};

	/*const MAX_IDE_PORTS_BOARD = 2;
	function ide_board() {
		uae_u8 *rom;
		uae_u8 acmemory[128];
		int rom_size;
		int rom_start;
		int rom_mask;
		uaecptr baseaddress;
		int configured;
		bool keepautoconfig;
		int mask;
		addrbank *bank;
		struct ide_hdf *ide[MAX_IDE_PORTS_BOARD];
		bool irq;
		bool intena;
		bool enabled;
		int state;
		int type;
		int userdata;
		int subtype;
		uae_u16 data_latch;
		struct romconfig *rc, *original_rc;
		struct ide_board **self_ptr;
	};*/

	function ide_hdf() {
		this.hdhfd = new SAEO_Hardfile_Data_HD();
		//struct ide_board *board;
		this.regs = new ide_registers();
		this.regs0 = null;
		this.regs1 = null;
		this.pair = null; // master<>slave
		this.its = null; //new SAEO_IDE_threadState()
		this.byteswap = false;
		this.byteswapped_buffer = 0;
		this.adide = false;

		this.secbuf = null; //u8 *
		this.secbuf_size = 0;
		this.buffer_offset = 0;
		this.data_offset = 0;
		this.data_size = 0;
		this.data_multi = 0;
		this.direction = 0; // 0 = read, 1 = write
		this.intdrq = false;
		this.lba48 = false;
		this.lba48cmd = false;
		this.start_lba = 0; //u64
		this.start_nsec = 0;
		this.multiple_mode = 0; //u8
		this.irq_delay = 0;
		this.irq = 0;
		this.irq_new = false;
		this.num = 0;
		this.blocksize = 0;
		this.maxtransferstate = 0;
		this.ata_level = 0;
		this.ide_drv = 0;
		this.media_type = 0;
		this.mode_8bit = false;

		this.atapi = false;
		this.atapi_drdy = false;
		this.cd_unit_num = 0;

		this.packet_state = 0;
		this.packet_data_size = 0;
		this.packet_data_offset = 0;
		this.packet_transfer_size = 0;

		//struct scsi_data *scsi;*/
	};

	/*-----------------------------------------------------------------------*/

	this.adide_decode_word = function(w) {
		var o = 0;
		if (w & 0x8000) o |= 0x0001;
		if (w & 0x0001) o |= 0x0002;
		if (w & 0x4000) o |= 0x0004;
		if (w & 0x0002) o |= 0x0008;
		if (w & 0x2000) o |= 0x0010;
		if (w & 0x0004) o |= 0x0020;
		if (w & 0x1000) o |= 0x0040;
		if (w & 0x0008) o |= 0x0080;
		if (w & 0x0800) o |= 0x0100;
		if (w & 0x0010) o |= 0x0200;
		if (w & 0x0400) o |= 0x0400;
		if (w & 0x0020) o |= 0x0800;
		if (w & 0x0200) o |= 0x1000;
		if (w & 0x0040) o |= 0x2000;
		if (w & 0x0100) o |= 0x4000;
		if (w & 0x0080) o |= 0x8000;
		return o;
	}
	this.adide_encode_word = function(w) {
		var o = 0;
		if (w & 0x0001) o |= 0x8000;
		if (w & 0x0002) o |= 0x0001;
		if (w & 0x0004) o |= 0x4000;
		if (w & 0x0008) o |= 0x0002;
		if (w & 0x0010) o |= 0x2000;
		if (w & 0x0020) o |= 0x0004;
		if (w & 0x0040) o |= 0x1000;
		if (w & 0x0080) o |= 0x0008;
		if (w & 0x0100) o |= 0x0800;
		if (w & 0x0200) o |= 0x0010;
		if (w & 0x0400) o |= 0x0400;
		if (w & 0x0800) o |= 0x0020;
		if (w & 0x1000) o |= 0x0200;
		if (w & 0x2000) o |= 0x0040;
		if (w & 0x4000) o |= 0x0100;
		if (w & 0x8000) o |= 0x0080;
		return o;
	}

	function pw(ide, offset, w) {
		if (ide.byteswap)
			w = ((w << 8) & 0xffff) | (w >> 8);
		if (ide.adide)
			w = SAER.ide.adide_decode_word(w);
		ide.secbuf[offset * 2 + 0] = w & 0xff;
		ide.secbuf[offset * 2 + 1] = w >> 8;
	}
	function ps(ide, offset, src, max) {
		var s = src; //ua(src);
		var len = s.length; //strlen(s);

		for (var i = 0; i < max; i += 2) {
			var c1 = ' ';
			if (i < len)
				c1 = s.charCodeAt(i);
			var c2 = ' ';
			if (i + 1 < len)
				c2 = s.charCodeAt(i + 1);
			var w = (c2 << 8) | c1;
			if (ide.byteswap)
				w = ((w << 8) & 0xffff) | (w >> 8);
			if (ide.adide)
				w = SAER.ide.adide_decode_word(w);
			ide.secbuf[offset * 2 + 0] = w >> 8;
			ide.secbuf[offset * 2 + 1] = w & 0xff;
			offset++;
		}
		//xfree(s);
	}

	this.ide_isdrive = function(ide) {
		return ide !== null && (ide.hdhfd.size != 0 || ide.atapi);
	}

	function ide_grow_buffer(ide, newsize) {
		if (ide.secbuf_size >= newsize)
			return;
		var oldbuf = ide.secbuf;
		var oldsize = ide.secbuf_size;
		ide.secbuf_size = newsize + 16384;
		ide.secbuf = new Uint8Array(ide.secbuf_size);
		if (oldsize) {
			ide.secbuf.set(oldbuf); //memcpy(ide->secbuf, oldbuf, oldsize);
			SAEF_log("ide.ide_grow_buffer() IDE%d buffer %d -> %d", ide.num, oldsize, ide.secbuf_size);
		}
	}

	function ide_interrupt_do(ide) {
		var os = ide.regs.ide_status;
		ide.regs.ide_status &= ~IDE_STATUS_DRQ;
		if (ide.intdrq)
			ide.regs.ide_status |= IDE_STATUS_DRQ;
		ide.regs.ide_status &= ~IDE_STATUS_BSY;
		if (IDE_LOG > 1)
			SAEF_log("ide.ide_interrupt_do() INT %02X -> %02X", os, ide.regs.ide_status);
		ide.intdrq = false;
		ide.irq_delay = 0;
		if (ide.regs.ide_devcon & 2)
			return false;
		ide.irq_new = true;
		ide.irq = 1;
		return true;
	}

	/*bool ide_drq_check(struct ide_hdf *idep) {
		for (int i = 0; idep && i < 2; i++) {
			struct ide_hdf *ide = i == 0 ? idep : idep->pair;
			if (ide) {
				if (ide->regs.ide_status & IDE_STATUS_DRQ)
					return true;
			}
		}
		return false;
	}
	bool ide_irq_check(struct ide_hdf *idep, bool edge_triggered) {
		for (int i = 0; idep && i < 2; i++) {
			struct ide_hdf *ide = i == 0 ? idep : idep->pair;
			if (ide->irq) {
				if (edge_triggered) {
					if (ide->irq_new) {
						ide->irq_new = false;
						return true;
					}
					continue;
				}
				return true;
			}
		}
		return false;
	}*/

	this.ide_interrupt_hsync = function(idep) {
		var irq = false;
		for (var i = 0; idep && i < 2; i++) {
			var ide = i == 0 ? idep : idep.pair;
			if (ide) {
				if (ide.irq_delay > 0) {
					ide.irq_delay--;
					if (ide.irq_delay == 0) {
						ide_interrupt_do(ide);
					}
				}
				if (ide.irq && !(ide.regs.ide_devcon & 2))
					irq = true;
			}
		}
		return irq;
	}

	/*-----------------------------------------------------------------------*/

	function ide_interrupt(ide) {
		ide.regs.ide_status |= IDE_STATUS_BSY;
		ide.regs.ide_status &= ~IDE_STATUS_DRQ;
		ide.irq_delay = 2;
	}
	function ide_fast_interrupt(ide) {
		ide.regs.ide_status |= IDE_STATUS_BSY;
		ide.regs.ide_status &= ~IDE_STATUS_DRQ;
		ide.irq_delay = 1;
	}

	function ide_fail_err(ide, err) {
		ide.regs.ide_error |= err;
		if (ide.ide_drv == 1 && !SAER.ide.ide_isdrive(ide.pair)) {
			ide.pair.regs.ide_status |= IDE_STATUS_ERR;
		}
		ide.regs.ide_status |= IDE_STATUS_ERR;
		ide_interrupt(ide);
	}
	function ide_fail(ide) {
		ide_fail_err(ide, IDE_ERR_ABRT);
	}

	function ide_data_ready(ide) {
		//memset(ide.secbuf, 0, ide.blocksize);
		SAEF_memset(ide.secbuf,0, 0, ide.blocksize);
		ide.data_offset = 0;
		ide.data_size = ide.blocksize;
		ide.data_multi = 1;
		ide.intdrq = true;
		ide_interrupt(ide);
	}

	function ide_recalibrate(ide) {
		SAEF_log("ide.ide_recalibrate() IDE%d recalibrate", ide.num);
		ide.regs.ide_sector = 0;
		ide.regs.ide_lcyl = ide.regs.ide_hcyl = 0;
		ide_interrupt(ide);
	}

	function ide_identify_drive(ide) {
		var totalsecs; //u64
		var v;
		//var buf = ide.secbuf;
		var tmp = "";
		var atapi = ide.atapi;
		var cf = ide.media_type > 0;

		if (!SAER.ide.ide_isdrive(ide)) {
			ide_fail(ide);
			return;
		}
		//memset(buf, 0, ide.blocksize);
		SAEF_memset(ide.secbuf,0, 0, ide.blocksize);
		ide.byteswapped_buffer = 1;
		if (IDE_LOG > 0)
			SAEF_log("ide.ide_identify_drive() IDE%d identify drive", ide.num);
		ide_data_ready(ide);
		ide.direction = 0;
		pw(ide, 0, atapi ? 0x85c0 : (cf ? 0x848a : (1 << 6)));
		pw(ide, 1, ide.hdhfd.cyls_def);
		pw(ide, 2, 0xc837);
		pw(ide, 3, ide.hdhfd.heads_def);
		pw(ide, 4, ide.blocksize * ide.hdhfd.secspertrack_def);
		pw(ide, 5, ide.blocksize);
		pw(ide, 6, ide.hdhfd.secspertrack_def);
		ps(ide, 10, "68000", 20); /* serial */
		pw(ide, 20, 3);
		pw(ide, 21, ide.blocksize);
		pw(ide, 22, 4);
		ps(ide, 23, "0.7", 8); /* firmware revision */
		if (ide.atapi) //OPT
			tmp = "UAE-ATAPI";
		else
			tmp = sprintf("UAE-IDE %s", ide.hdhfd.hfd.product_id);
		ps(ide, 27, tmp, 40); /* model */
		pw(ide, 47, MAX_IDE_MULTIPLE_SECTORS >> (ide.blocksize / 512 - 1)); /* max sectors in multiple mode */
		pw(ide, 48, 1);
		pw(ide, 49, (1 << 9) | (1 << 8)); /* LBA and DMA supported */
		pw(ide, 51, 0x200); /* PIO cycles */
		pw(ide, 52, 0x200); /* DMA cycles */
		pw(ide, 53, 1 | 2 | 4);
		pw(ide, 54, ide.hdhfd.cyls);
		pw(ide, 55, ide.hdhfd.heads);
		pw(ide, 56, ide.hdhfd.secspertrack);
		totalsecs = ide.hdhfd.cyls * ide.hdhfd.heads * ide.hdhfd.secspertrack;
		pw(ide, 57, totalsecs & 0xffff);
		pw(ide, 58, totalsecs >>> 16);
		v = ide.multiple_mode;
		pw(ide, 59, (v > 0 ? 0x100 : 0) | v);
		totalsecs = ide.blocksize ? Math.floor(ide.hdhfd.size / ide.blocksize) : 0;
		if (totalsecs > 0x0fffffff)
			totalsecs = 0x0fffffff;
		pw(ide, 60, totalsecs & 0xffff);
		pw(ide, 61, totalsecs >>> 16);
		pw(ide, 62, 0x0f);
		pw(ide, 63, 0x0f);
		if (ide.ata_level) {
			pw(ide, 64, ide.ata_level ? 0x03 : 0x00); /* PIO4|PIO3 */
			pw(ide, 65, 120); /* MDMA2 supported */
			pw(ide, 66, 120);
			pw(ide, 67, 120);
			pw(ide, 68, 120);
			pw(ide, 80, (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5) | (1 << 6)); /* ATA-1 to ATA-6 */
			pw(ide, 81, 0x1c); /* ATA revision */
			pw(ide, 82, (1 << 14) | (atapi ? 0x10 | 4 : 0)); /* NOP, ATAPI: PACKET and Removable media features supported */
			pw(ide, 83, (1 << 14) | (1 << 13) | (1 << 12) | (ide.lba48 ? (1 << 10) : 0)); /* cache flushes, LBA 48 supported */
			pw(ide, 84, 1 << 14);
			pw(ide, 85, 1 << 14);
			pw(ide, 86, (1 << 14) | (1 << 13) | (1 << 12) | (ide.lba48 ? (1 << 10) : 0)); /* cache flushes, LBA 48 enabled */
			pw(ide, 87, 1 << 14);
			pw(ide, 88, (1 << 5) | (1 << 4) | (1 << 3) | (1 << 2) | (1 << 1) | (1 << 0)); /* UDMA modes */
			pw(ide, 93, (1 << 14) | (1 << 13) | (1 << 0));
			if (ide.lba48) { //ATT
				totalsecs = Math.floor(ide.hdhfd.size / ide.blocksize);
				var hi = Math.floor(totalsecs / 0x100000000);
				var lo = totalsecs % 0x100000000;
				pw(ide, 100, lo & 0xffff);
				pw(ide, 101, lo >>> 16);
				pw(ide, 102, hi & 0xffff);
				pw(ide, 103, hi >>> 16);
			}
		}
	}

	function set_signature(ide) {
		if (ide.atapi) {
			ide.regs.ide_sector = 1;
			ide.regs.ide_nsector = 1;
			ide.regs.ide_lcyl = 0x14;
			ide.regs.ide_hcyl = 0xeb;
			ide.regs.ide_status = 0;
			ide.atapi_drdy = false;
		} else {
			ide.regs.ide_nsector = 1;
			ide.regs.ide_sector = 1;
			ide.regs.ide_lcyl = 0;
			ide.regs.ide_hcyl = 0;
			ide.regs.ide_status = 0;
		}
		ide.regs.ide_error = 0x01; // device ok
		ide.packet_state = 0;
	}
	function reset_device(ide, both) {
		set_signature(ide);
		if (both)
			set_signature(ide.pair);
	}
	/*this.ide_reset_device = function(ide) {
		reset_device(ide, true);
	}*/

	function ide_execute_drive_diagnostics(ide, irq) {
		reset_device(ide, irq);
		if (irq)
			ide_interrupt(ide);
		else
			ide.regs.ide_status &= ~IDE_STATUS_BSY;
	}

	function ide_initialize_drive_parameters(ide) {
		var p = ide.hdhfd;
		if (p.size) {
			p.secspertrack = ide.regs.ide_nsector == 0 ? 256 : ide.regs.ide_nsector;
			p.heads = (ide.regs.ide_select & 15) + 1;
			if (p.hfd.ci.pcyls)
				p.cyls = p.hfd.ci.pcyls;
			else
				p.cyls = Math.floor(Math.floor(p.size / ide.blocksize) / (p.secspertrack * p.heads));
			if (p.heads * p.cyls * p.secspertrack > 16515072 || ide.lba48) {
				p.cyls = p.hfd.ci.pcyls ? p.hfd.ci.pcyls : p.cyls_def;
				p.heads = p.heads_def;
				p.secspertrack = p.secspertrack_def;
			}
		} else {
			ide.regs.ide_error |= IDE_ERR_ABRT;
			ide.regs.ide_status |= IDE_STATUS_ERR;
		}
		SAEF_log("ide.ide_initialize_drive_parameters() IDE%d initialize drive parameters, CYL=%d,SPT=%d,HEAD=%d", ide.num, p.cyls, p.secspertrack, p.heads);
		ide_interrupt(ide);
	}

	function ide_set_multiple_mode(ide) {
		SAEF_log("ide.ide_set_multiple_mode() IDE%d drive multiple mode = %d", ide.num, ide.regs.ide_nsector);
		ide.multiple_mode = ide.regs.ide_nsector;
		ide_interrupt(ide);
	}

	function ide_set_features(ide) {
		var type = ide.regs.ide_nsector >> 3;
		var mode = ide.regs.ide_nsector & 7;

		SAEF_log("ide.ide_set_features() IDE%d set features %02X (%02X)", ide.num, ide.regs.ide_feat, ide.regs.ide_nsector);
		switch (ide.regs.ide_feat) {
			// 8-bit mode
			case 1:
				ide.mode_8bit = true;
				ide_interrupt(ide);
				break;
			case 0x81:
				ide.mode_8bit = false;
				ide_interrupt(ide);
				break;
			// write cache
			case 2:
			case 0x82:
				ide_interrupt(ide);
				break;
			default:
				ide_fail(ide);
		}
	}








	function get_nsec(ide) {
		if (ide.lba48 && ide.lba48cmd)
			//return (ide.regs.ide_nsector == 0 && ide.regs.ide_nsector2 == 0) ? 65536 : (ide.regs.ide_nsector2 * 256 + ide.regs.ide_nsector);
			return (ide.regs.ide_nsector == 0 && ide.regs.ide_nsector2 == 0) ? 65536 : ((ide.regs.ide_nsector2 << 8) | ide.regs.ide_nsector);
		else
			return ide.regs.ide_nsector == 0 ? 256 : ide.regs.ide_nsector;
	}
	function dec_nsec(ide, v) {
		if (ide.lba48 && ide.lba48cmd) {
			var nsec = (ide.regs.ide_nsector2 << 8) | ide.regs.ide_nsector;
			nsec -= v;
			if (nsec < 0) nsec += 0x10000;
			ide.regs.ide_nsector2 = nsec >> 8;
			ide.regs.ide_nsector = nsec & 0xff;
			return nsec;
		} else {
			ide.regs.ide_nsector -= v;
			if (ide.regs.ide_nsector < 0) ide.regs.ide_nsector += 0x100;
			return ide.regs.ide_nsector;
		}
	}

	//function get_lbachs(ide, uae_u64 *lbap, unsigned int *cyl, unsigned int *head, unsigned int *sec) {
	function get_lbachs(ide, ptr) {
		if (ide.lba48 && ide.lba48cmd && (ide.regs.ide_select & 0x40)) {
			/*ATT
			uae_u64 lba;
			lba = (ide.regs.ide_hcyl << 16) | (ide.regs.ide_lcyl << 8) | ide.regs.ide_sector;
			lba |= ((ide.regs.ide_hcyl2 << 16) | (ide.regs.ide_lcyl2 << 8) | ide.regs.ide_sector2) << 24;
			ptr.lba = lba;*/
			var lo = (ide.regs.ide_hcyl << 16) | (ide.regs.ide_lcyl << 8) | ide.regs.ide_sector;
			var hi = (ide.regs.ide_hcyl2 << 16) | (ide.regs.ide_lcyl2 << 8) | ide.regs.ide_sector2;
			ptr.lba = hi * 0x1000000 + lo;
		} else {
			if (ide.regs.ide_select & 0x40) {
				ptr.lba = (((ide.regs.ide_select & 15) << 24) | (ide.regs.ide_hcyl << 16) | (ide.regs.ide_lcyl << 8) | ide.regs.ide_sector) >>> 0;
			} else {
				ptr.cyl = (ide.regs.ide_hcyl << 8) | ide.regs.ide_lcyl;
				ptr.head = ide.regs.ide_select & 15;
				ptr.sec = ide.regs.ide_sector;
				ptr.lba = ((ptr.cyl * ide.hdhfd.heads + ptr.head) * ide.hdhfd.secspertrack) + ptr.sec - 1;
			}
		}
	}
	function put_lbachs(ide, lba, cyl, head, sec, inc) {
		if (ide.lba48 && ide.lba48cmd) {
			lba += inc;
			/*ATT
			ide.regs.ide_hcyl = (lba >> 16) & 0xff;
			ide.regs.ide_lcyl = (lba >> 8) & 0xff;
			ide.regs.ide_sector = lba & 0xff;
			lba >>= 24;
			ide.regs.ide_hcyl2 = (lba >> 16) & 0xff;
			ide.regs.ide_lcyl2 = (lba >> 8) & 0xff;
			ide.regs.ide_sector2 = lba & 0xff;*/
			var lo = lba % 0x1000000;
			var hi = Math.floor(lba / 0x1000000);
			ide.regs.ide_hcyl = (lo >>> 16) & 0xff;
			ide.regs.ide_lcyl = (lo >>> 8) & 0xff;
			ide.regs.ide_sector = lo & 0xff;
			ide.regs.ide_hcyl2 = (hi >>> 16) & 0xff;
			ide.regs.ide_lcyl2 = (hi >>> 8) & 0xff;
			ide.regs.ide_sector2 = hi & 0xff;
		} else {
			if (ide.regs.ide_select & 0x40) {
				lba += inc;
				ide.regs.ide_select &= ~15;
				ide.regs.ide_select |= (lba >>> 24) & 15;
				ide.regs.ide_hcyl = (lba >>> 16) & 0xff;
				ide.regs.ide_lcyl = (lba >>> 8) & 0xff;
				ide.regs.ide_sector = lba & 0xff;
			} else {
				sec += inc;
				while (sec >= ide.hdhfd.secspertrack) {
					sec -= ide.hdhfd.secspertrack;
					head++;
					if (head >= ide.hdhfd.heads) {
						head -= ide.hdhfd.heads;
						cyl++;
					}
				}
				ide.regs.ide_select &= ~15;
				ide.regs.ide_select |= head;
				ide.regs.ide_sector = sec;
				ide.regs.ide_hcyl = cyl >> 8;
				ide.regs.ide_lcyl = cyl & 0xff;
			}
		}
	}

	function check_maxtransfer(ide, state) {
		if (state == 1) {
			// transfer was started
			if (ide.maxtransferstate < 2 && ide.regs.ide_nsector == 0)
				ide.maxtransferstate = 1;
			else if (ide.maxtransferstate == 2) {
				// second transfer was started (part of split)
				SAEF_log("ide.check_maxtransfer() maxtransfer check detected split >256 block transfer");
				ide.maxtransferstate = 0;
			} else
				ide.maxtransferstate = 0;
		} else if (state == 2) {
			// address was read
			if (ide.maxtransferstate == 1)
				ide.maxtransferstate++;
			else
				ide.maxtransferstate = 0;
		}
	}

	function setdrq(ide) {
		ide.regs.ide_status |= IDE_STATUS_DRQ;
		ide.regs.ide_status &= ~IDE_STATUS_BSY;
	}
	function setbsy(ide) {
		ide.regs.ide_status |= IDE_STATUS_BSY;
		ide.regs.ide_status &= ~IDE_STATUS_DRQ;
	}

	function process_rw_command(ide) {
		setbsy(ide);
		//write_comm_pipe_u32(ide.its.requests, ide.num, 1);
		do_process_rw_command(ide);
	}
	function process_packet_command(ide) {
		setbsy(ide);
		write_comm_pipe_u32(ide.its.requests, ide.num | 0x80, 1);
	}

	/*static void atapi_data_done (struct ide_hdf *ide) {
		ide->regs.ide_nsector = ATAPI_IO | ATAPI_CD;
		ide->regs.ide_status = IDE_STATUS_DRDY;
		ide->data_size = 0;
		ide->packet_data_offset = 0;
		ide->data_offset = 0;
	}
	static bool atapi_set_size (struct ide_hdf *ide) {
		int size;
		size = ide->data_size;
		ide->data_offset = 0;
		if (!size) {
			ide->packet_state = 0;
			ide->packet_transfer_size = 0;
			return false;
		}
		if (ide->packet_state == 2) {
			if (size > ide->packet_data_size)
				size = ide->packet_data_size;
			if (size > ATAPI_MAX_TRANSFER)
				size = ATAPI_MAX_TRANSFER;
			ide->packet_transfer_size = size & ~1;
			ide->regs.ide_lcyl = size & 0xff;
			ide->regs.ide_hcyl = size >> 8;
		} else {
			ide->packet_transfer_size = 12;
		}
		if (IDE_LOG > 1)
			write_log (_T("ATAPI data transfer %d/%d bytes\n"), ide->packet_transfer_size, ide->data_size);
		return true;
	}
	static void atapi_packet (struct ide_hdf *ide) {
		ide->packet_data_offset = 0;
		ide->packet_data_size = (ide->regs.ide_hcyl << 8) | ide->regs.ide_lcyl;
		if (ide->packet_data_size == 65535)
			ide->packet_data_size = 65534;
		ide->data_size = 12;
		if (IDE_LOG > 0)
			write_log (_T("ATAPI packet command. Data size = %d\n"), ide->packet_data_size);
		ide->packet_state = 1;
		ide->data_multi = 1;
		ide->data_offset = 0;
		ide->regs.ide_nsector = ATAPI_CD;
		ide->regs.ide_error = 0;
		if (atapi_set_size (ide))
			setdrq (ide);
	}*/

	/*static void do_packet_command (struct ide_hdf *ide) {
		memcpy (ide->scsi->cmd, ide->secbuf, 12);
		ide->scsi->cmd_len = 12;
		if (IDE_LOG > 0) {
			uae_u8 *c = ide->scsi->cmd;
			write_log (_T("ATASCSI %02x.%02x.%02x.%02x.%02x.%02x.%02x.%02x.%02x.%02x.%02x.%02x\n"),
				c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11]);
		}
		ide->direction = 0;
		scsi_emulate_analyze (ide->scsi);
		if (ide->scsi->direction <= 0) {
			// data in
			scsi_emulate_cmd (ide->scsi);
			ide->data_size = ide->scsi->data_len;
			ide->regs.ide_status = 0;
			if (ide->scsi->status) {
				// error
				ide->regs.ide_error = (ide->scsi->sense[2] << 4) | 4;
				atapi_data_done (ide);
				ide->regs.ide_status |= ATAPI_STATUS_CHK;
				atapi_set_size (ide);
				return;
			} else if (ide->scsi->data_len) {
				// data in
				ide_grow_buffer(ide, ide->scsi->data_len);
				memcpy (ide->secbuf, ide->scsi->buffer, ide->scsi->data_len);
				ide->regs.ide_nsector = ATAPI_IO;
			} else {
				// no data
				atapi_data_done (ide);
			}
		} else {
			// data out
			ide->direction = 1;
			ide->regs.ide_nsector = 0;
			ide->data_size = ide->scsi->data_len;
		}
		ide->packet_state = 2; // data phase
		if (atapi_set_size (ide))
			ide->intdrq = true;
	}*/

	/*static void do_process_packet_command (struct ide_hdf *ide) {
		if (ide->packet_state == 1) {
			do_packet_command (ide);
		} else {
			ide->packet_data_offset += ide->packet_transfer_size;
			if (!ide->direction) {
				// data still remaining, next transfer
				if (atapi_set_size (ide))
					ide->intdrq = true;
			} else {
				if (atapi_set_size (ide)) {
					ide->intdrq = true;
				} else {
					if (IDE_LOG > 1)
						write_log(_T("IDE%d ATAPI write finished, %d bytes\n"), ide->num, ide->data_size);
					memcpy (&ide->scsi->buffer, ide->secbuf, ide->data_size);
					ide->scsi->data_len = ide->data_size;
					scsi_emulate_cmd (ide->scsi);
				}
			}
		}
		ide_fast_interrupt (ide);
	}*/

	function do_process_rw_command(ide) {
		//SAEF_log("ide.do_process_rw_command()");
		//unsigned int cyl, head, sec;
		//uae_u64 lba;
		var ptr = {};

		ide.data_offset = 0;
		var nsec = get_nsec(ide);
		//get_lbachs(ide, &lba, &cyl, &head, &sec);
		get_lbachs(ide, ptr);
		if (IDE_LOG > 1)
			SAEF_log("ide.do_process_rw_command() IDE%d off=%d, nsec=%d (%d) lba48=%d bs=%d", ide.num, ptr.lba, nsec, ide.multiple_mode, ide.lba48 + ide.lba48cmd, ide.blocksize);

		if (nsec * ide.blocksize > ide.hdhfd.size - ptr.lba * ide.blocksize) {
			nsec = Math.truncate((ide.hdhfd.size - ptr.lba * ide.blocksize) / ide.blocksize);
			if (IDE_LOG > 1)
				SAEF_log("ide.do_process_rw_command() IDE%d nsec changed to %d", ide.num, nsec);
		}
		if (nsec <= 0) {
			ide_data_ready(ide);
			ide_fail_err(ide, IDE_ERR_IDNF);
			return;
		}
		var nsec_total = nsec;
		ide_grow_buffer(ide, nsec_total * ide.blocksize);

		if (nsec > ide.data_multi)
			nsec = ide.data_multi;

		if (ide.buffer_offset == 0) {
			// store initial lba and number of sectors to transfer
			ide.start_lba = ptr.lba;
			ide.start_nsec = nsec_total;
		}

		if (ide.direction) {
			if (IDE_LOG > 1)
				SAEF_log("ide.do_process_rw_command() IDE%d write, %d/%d bytes, buffer offset %d", ide.num, nsec * ide.blocksize, nsec_total * ide.blocksize, ide.buffer_offset);
		} else {
			if (ide.buffer_offset == 0) {
				SAER.hardfile.hdf_read(ide.hdhfd.hfd, ide.secbuf, ide.start_lba * ide.blocksize, ide.start_nsec * ide.blocksize);
				if (IDE_LOG > 1)
					SAEF_log("ide.do_process_rw_command() IDE%d initial read, %d bytes", ide.num, nsec_total * ide.blocksize);
			}
			if (IDE_LOG > 1)
				SAEF_log("ide.do_process_rw_command() IDE%d read, read %d/%d bytes, buffer offset=%d", ide.num, nsec * ide.blocksize, nsec_total * ide.blocksize, ide.buffer_offset);
		}
		ide.intdrq = true;
		var last = dec_nsec(ide, nsec) == 0;
		// ATA-2 spec says CHS/LBA does only need to be updated if error condition
		if (ide.ata_level != SAEC_Config_Mount_Controller_Level_ATA_2S || !last)
			put_lbachs(ide, ptr.lba, ptr.cyl, ptr.head, ptr.sec, last ? nsec - 1 : nsec);

		if (last && ide.direction) {
			if (IDE_LOG > 1)
				SAEF_log("ide.do_process_rw_command() IDE%d write finished, %d bytes", ide.num, ide.start_nsec * ide.blocksize);
			ide.intdrq = false;
			SAER.hardfile.hdf_write(ide.hdhfd.hfd, ide.secbuf, ide.start_lba * ide.blocksize, ide.start_nsec * ide.blocksize);
		}

		if (ide.direction) {
			if (last)
				ide_fast_interrupt(ide);
			else
				ide.irq_delay = 1;
		} else {
			if (ide.buffer_offset == 0)
				ide_fast_interrupt(ide);
			else
				ide.irq_delay = 1;
		}
	}

	function ide_read_sectors(ide, flags) {
		//unsigned int cyl, head, sec, nsec;
		//uae_u64 lba;
		var ptr = {};
		var multi = flags & 1;

		ide.lba48cmd = (flags & 2) != 0;
		if (multi && ide.multiple_mode == 0) {
			ide_fail(ide);
			return;
		}
		check_maxtransfer(ide, 1);
		SAER.gui.flicker_led(SAEC_GUI_LED_HD, ide.num, 1);
		var nsec = get_nsec(ide);
		//get_lbachs(ide, &lba, &cyl, &head, &sec);
		get_lbachs(ide, ptr);
		if (ptr.lba * ide.blocksize >= ide.hdhfd.size) {
			ide_data_ready(ide);
			ide_fail_err(ide, IDE_ERR_IDNF);
			return;
		}
		if (IDE_LOG > 0)
			SAEF_log("ide.ide_read_sectors() IDE%d %s off=%d, sec=%d (%d) lba48=%d", ide.num, (flags & 4) ? "verify" : "read", ptr.lba, nsec, ide.multiple_mode, ide.lba48 + ide.lba48cmd);
		if (flags & 4) {
			// verify
			ide_interrupt(ide);
			return;
		}
		ide.data_multi = multi ? ide.multiple_mode : 1;
		ide.data_offset = 0;
		ide.data_size = nsec * ide.blocksize;
		ide.direction = 0;
		ide.buffer_offset = 0;
		// read start: preload sector(s), then trigger interrupt.
		process_rw_command(ide);
	}
	function ide_write_sectors(ide, flags) {
		//unsigned int cyl, head, sec, nsec;
		//uae_u64 lba;
		var ptr = {};
		var multi = flags & 1;

		ide.lba48cmd = (flags & 2) != 0;
		if (multi && ide.multiple_mode == 0) {
			ide_fail(ide);
			return;
		}
		check_maxtransfer(ide, 1);
		SAER.gui.flicker_led(SAEC_GUI_LED_HD, ide.num, 2);
		nsec = get_nsec(ide);
		//get_lbachs(ide, &lba, &cyl, &head, &sec);
		get_lbachs(ide, ptr);
		if (ptr.lba * ide.blocksize >= ide.hdhfd.size) {
			ide_data_ready(ide);
			ide_fail_err(ide, IDE_ERR_IDNF);
			return;
		}
		if (IDE_LOG > 0)
			SAEF_log("ide.ide_write_sectors() IDE%d write off=%d, sec=%d (%d) lba48=%d", ide.num, ptr.lba, nsec, ide.multiple_mode, ide.lba48 + ide.lba48cmd);
		if (nsec * ide.blocksize > ide.hdhfd.size - ptr.lba * ide.blocksize)
			nsec = Math.truncate((ide.hdhfd.size - ptr.lba * ide.blocksize) / ide.blocksize);
		if (nsec <= 0) {
			ide_data_ready(ide);
			ide_fail_err(ide, IDE_ERR_IDNF);
			return;
		}
		ide.data_multi = multi ? ide.multiple_mode : 1;
		ide.data_offset = 0;
		ide.data_size = nsec * ide.blocksize;
		ide.direction = 1;
		ide.buffer_offset = 0;
		// write start: set DRQ and clear BSY. No interrupt.
		ide.regs.ide_status |= IDE_STATUS_DRQ;
		ide.regs.ide_status &= ~IDE_STATUS_BSY;
	}

	function ide_do_command(ide, cmd) {
		var lba48 = ide.lba48;

		if (IDE_LOG > 1)
			SAEF_log("ide.ide_do_command() IDE%d command %02X", ide.num, cmd);

		ide.regs.ide_status &= ~ (IDE_STATUS_DRDY | IDE_STATUS_DRQ | IDE_STATUS_ERR);
		ide.regs.ide_error = 0;
		ide.intdrq = false;
		ide.lba48cmd = false;
		ide.byteswapped_buffer = 0;

		if (ide.atapi) {
			//SAER.gui.flicker_led(SAEC_GUI_LED_CD, ide.num, 1);
			ide.atapi_drdy = true;
			if (cmd == 0x00) { /* nop */
				ide_interrupt(ide);
			} else if (cmd == 0x08) { /* device reset */
				ide_execute_drive_diagnostics(ide, true);
			} else if (cmd == 0xa1) { /* identify packet device */
				ide_identify_drive(ide);
			} else if (cmd == 0xa0) { /* packet */
				atapi_packet(ide);
			} else if (cmd == 0x90) { /* execute drive diagnostics */
				ide_execute_drive_diagnostics(ide, true);
			} else {
				ide_execute_drive_diagnostics(ide, false);
				ide.atapi_drdy = false;
				ide_fail(ide);
				SAEF_warn("ide.ide_do_command() IDE%d: unknown ATAPI command 0x%02x", ide.num, cmd);
			}
		} else {
			if (cmd == 0x10) { /* recalibrate */
				ide_recalibrate (ide);
			} else if (cmd == 0xec) { /* identify drive */
				ide_identify_drive(ide);
			} else if (cmd == 0x90) { /* execute drive diagnostics */
				ide_execute_drive_diagnostics(ide, true);
			} else if (cmd == 0x91) { /* initialize drive parameters */
				ide_initialize_drive_parameters(ide);
			} else if (cmd == 0xc6) { /* set multiple mode */
				ide_set_multiple_mode(ide);
			} else if (cmd == 0x20 || cmd == 0x21) { /* read sectors */
				ide_read_sectors(ide, 0);
			} else if (cmd == 0x40 || cmd == 0x41) { /* verify sectors */
				ide_read_sectors(ide, 4);
			} else if (cmd == 0x24 && lba48) { /* read sectors ext */
				ide_read_sectors(ide, 2);
			} else if (cmd == 0xc4) { /* read multiple */
				ide_read_sectors(ide, 1);
			} else if (cmd == 0x29 && lba48) { /* read multiple ext */
				ide_read_sectors(ide, 1|2);
			} else if (cmd == 0x30 || cmd == 0x31) { /* write sectors */
				ide_write_sectors(ide, 0);
			} else if (cmd == 0x34 && lba48) { /* write sectors ext */
				ide_write_sectors(ide, 2);
			} else if (cmd == 0xc5) { /* write multiple */
				ide_write_sectors(ide, 1);
			} else if (cmd == 0x39 && lba48) { /* write multiple ext */
				ide_write_sectors(ide, 1|2);
			} else if (cmd == 0x50) { /* format track (nop) */
				ide_interrupt(ide);
			} else if (cmd == 0xef) { /* set features  */
				ide_set_features(ide);
			} else if (cmd == 0x00) { /* nop */
				ide_fail(ide);
			} else if (cmd == 0x70) { /* seek */
				ide_interrupt(ide);
			} else if (cmd == 0xe0 || cmd == 0xe1 || cmd == 0xe7 || cmd == 0xea) { /* standby now/idle/flush cache/flush cache ext */
				ide_interrupt(ide);
			} else if (cmd == 0xe5) { /* check power mode */
				ide.regs.ide_nsector = 0xff;
				ide_interrupt(ide);
			} else {
				ide_fail(ide);
				SAEF_warn("ide.ide_do_command() IDE%d: unknown ATA command 0x%02x", ide.num, cmd);
			}
		}
	}

	/*-----------------------------------------------------------------------*/

	function ide_get_data_2(ide, bussize) {
		var irq = false;
		var v;
		var inc = bussize ? 2 : 1;

		if (ide.data_size == 0) {
			if (IDE_LOG > 0)
				SAEF_warn("ide.ide_get_data_2() IDE%d DATA but no data left!? 0x%02X, PC 0x%08X", ide.num, ide.regs.ide_status, SAER_CPU_getPC());
			if (!SAER.ide.ide_isdrive(ide))
				return 0xffff;
			return 0;
		}
		if (ide.packet_state) {
			if (bussize)
				v = (ide.secbuf[ide.packet_data_offset + ide.data_offset] << 8) | ide.secbuf[ide.packet_data_offset + ide.data_offset + 1];
			else
				v = ide.secbuf[ide.packet_data_offset + ide.data_offset];

			if (IDE_LOG > 4)
				SAEF_log("ide.ide_get_data_2() IDE%d DATA read 0x%04x", ide.num, v);
			ide.data_offset += inc;
			if (ide.data_size < 0)
				ide.data_size += inc;
			else
				ide.data_size -= inc;
			if (ide.data_offset == ide.packet_transfer_size) {
				if (IDE_LOG > 1)
					SAEF_log("ide.ide_get_data_2() IDE%d ATAPI partial read finished, %d bytes remaining", ide.num, ide.data_size);
				if (ide.data_size == 0) {
					ide.packet_state = 0;
					atapi_data_done(ide);
					if (IDE_LOG > 1)
						SAEF_log("ide.ide_get_data_2() IDE%d ATAPI read finished, %d bytes", ide.num, ide.packet_data_offset + ide.data_offset);
					irq = true;
				} else
					process_packet_command(ide);
			}
		} else {
			if (bussize)
				v = (ide.secbuf[ide.buffer_offset + ide.data_offset] << 8) | ide.secbuf[ide.buffer_offset + ide.data_offset + 1];
			else
				v = ide.secbuf[ide.buffer_offset + ide.data_offset];

			if (IDE_LOG > 4)
				SAEF_log("ide.ide_get_data_2() IDE%d DATA read 0x%04x %d/%d", ide.num, v, ide.data_offset, ide.data_size);
			ide.data_offset += inc;
			if (ide.data_size < 0)
				ide.data_size += inc;
			else {
				ide.data_size -= inc;
				if (((ide.data_offset % ide.blocksize) == 0) && (Math.floor(ide.data_offset / ide.blocksize) % ide.data_multi) == 0) {
					if (ide.data_size) {
						ide.buffer_offset += ide.data_offset;
						do_process_rw_command(ide);
					}
				}
			}
			if (ide.data_size == 0) {
				if (!(ide.regs.ide_status & IDE_STATUS_DRQ)) {
					SAEF_warn("ide.ide_get_data_2() IDE%d read finished but DRQ was not active?", ide.num);
				}
				ide.regs.ide_status &= ~IDE_STATUS_DRQ;
				if (IDE_LOG > 1)
					SAEF_log("ide.ide_get_data_2() IDE%d read finished", ide.num);
			}
		}
		if (irq)
			ide_fast_interrupt(ide);
		return v;
	}
	this.ide_get_data = function(ide) {
		return ide_get_data_2(ide, 1);
	}
	/*this.ide_get_data_8bit = function(ide) {
		return ide_get_data_2(ide, 0) & 0xff;
	}*/

	function ide_put_data_2(ide, v, bussize) {
		var inc = bussize ? 2 : 1;
		if (IDE_LOG > 4)
			SAEF_log("ide.ide_put_data_2() IDE%d DATA write 0x%04x %d/%d", ide.num, v, ide.data_offset, ide.data_size);
		if (ide.data_size == 0) {
			if (IDE_LOG > 0)
				SAEF_warn("ide.ide_put_data_2() IDE%d DATA write without request!? 0x%02X, PC 0x%08X", ide.num, ide.regs.ide_status, SAER_CPU_getPC());
			return;
		}
		ide_grow_buffer(ide, ide.packet_data_offset + ide.data_offset + 2);
		if (ide.packet_state) {
			if (bussize) {
				ide.secbuf[ide.packet_data_offset + ide.data_offset + 1] = v & 0xff;
				ide.secbuf[ide.packet_data_offset + ide.data_offset    ] = v >> 8;
			} else
				ide.secbuf[(ide.packet_data_offset + ide.data_offset) ^ 1] = v;
		} else {
			if (bussize) {
				ide.secbuf[ide.buffer_offset + ide.data_offset + 1] = v & 0xff;
				ide.secbuf[ide.buffer_offset + ide.data_offset    ] = v >> 8;
			} else
				ide.secbuf[ide.buffer_offset + ide.data_offset] = v;

		}
		ide.data_offset += inc;
		ide.data_size -= inc;
		if (ide.packet_state) {
			if (ide.data_offset == ide.packet_transfer_size) {
				if (IDE_LOG > 0) {
					var v = (ide.regs.ide_hcyl << 8) | ide.regs.ide_lcyl;
					SAEF_warn("ide.ide_put_data_2() Data size after command received = %d (%d)", v, ide.packet_data_size);
				}
				process_packet_command(ide);
			}
		} else {
			if (ide.data_size == 0) {
				process_rw_command(ide);
			} else if (((ide.data_offset % ide.blocksize) == 0) && (Math.floor(ide.data_offset / ide.blocksize) % ide.data_multi) == 0) {
				var off = ide.data_offset;
				do_process_rw_command(ide);
				ide.buffer_offset += off;
			}
		}
	}
	this.ide_put_data = function(ide, v) {
		ide_put_data_2(ide, v, 1);
	}
	this.ide_put_data_8bit = function(ide, v) {
		ide_put_data_2(ide, v, 0);
	}

	/*-----------------------------------------------------------------------*/

	this.ide_read_reg = function(ide, ide_reg) {
		var isdrv = this.ide_isdrive(ide);
		var v = 0;

		if (ide === null) {
			SAEF_warn("ide.ide_read_reg() no handle");
			//goto end;
			return v;
		}
		if (ide.regs.ide_status & IDE_STATUS_BSY)
			ide_reg = IDE_STATUS;
		if (!this.ide_isdrive(ide)) {
			if (ide_reg == IDE_STATUS) {
				if (ide.pair.irq)
					ide.pair.irq = 0;
				if (this.ide_isdrive(ide.pair))
					v = 0x01;
				else
					v = 0xff;
			} else
				v = 0;

			//goto end;
			if (IDE_LOG > 2 && ide_reg > 0 && (1 || ide.num > 0))
				SAEF_log("ide.ide_read_reg() IDE%d GET register %d=%02X (%08X)", ide.num, ide_reg, v & 0xff, SAER_CPU_getPC());
			return v;
		}

		switch (ide_reg) {
			case IDE_SECONDARY:
			case IDE_SECONDARY + 1:
			case IDE_SECONDARY + 2:
			case IDE_SECONDARY + 3:
			case IDE_SECONDARY + 4:
			case IDE_SECONDARY + 5:
				v = 0xff;
				break;
			case IDE_DRVADDR:
				v = ((ide.ide_drv ? 2 : 1) | ((ide.regs.ide_select & 15) << 2)) ^ 0xff;
				break;
			case IDE_DATA:
				break;
			case IDE_ERROR:
				v = ide.regs.ide_error;
				break;
			case IDE_NSECTOR:
				if (isdrv) {
					if (ide.regs.ide_devcon & 0x80)
						v = ide.regs.ide_nsector2;
					else
						v = ide.regs.ide_nsector;
				}
				break;
			case IDE_SECTOR:
				if (isdrv) {
					if (ide.regs.ide_devcon & 0x80)
						v = ide.regs.ide_sector2;
					else
						v = ide.regs.ide_sector;
					check_maxtransfer(ide, 2);
				}
				break;
			case IDE_LCYL:
				if (isdrv) {
					if (ide.regs.ide_devcon & 0x80)
						v = ide.regs.ide_lcyl2;
					else
						v = ide.regs.ide_lcyl;
				}
				break;
			case IDE_HCYL:
				if (isdrv) {
					if (ide.regs.ide_devcon & 0x80)
						v = ide.regs.ide_hcyl2;
					else
						v = ide.regs.ide_hcyl;
				}
				break;
			case IDE_SELECT:
				v = ide.regs.ide_select;
				break;
			case IDE_STATUS:
				ide.irq = 0;
				ide.irq_new = false;
				// fall through
			case IDE_DEVCON: // ALTSTATUS when reading
				if (!isdrv) {
					v = 0;
					if (ide.regs.ide_error)
						v |= IDE_STATUS_ERR;
				} else {
					v = ide.regs.ide_status;
					if (!ide.atapi || (ide.atapi && ide.atapi_drdy))
						v |= IDE_STATUS_DRDY | IDE_STATUS_DSC;
				}
				break;
		}
		//end:
		if (IDE_LOG > 2 && ide_reg > 0 && (1 || ide.num > 0))
			SAEF_log("ide.ide_read_reg() IDE%d GET register %d=%02X (%08X)", ide.num, ide_reg, v & 0xff, SAER_CPU_getPC());

		return v;
	}

	this.ide_write_reg = function(ide, ide_reg, val) {
		if (ide === null) {
			SAEF_warn("ide.ide_write_reg() no handle");
			return;
		}
		ide.regs1.ide_devcon &= ~0x80; // clear HOB
		ide.regs0.ide_devcon &= ~0x80; // clear HOB
		if (IDE_LOG > 2 && ide_reg > 0 && (1 || ide.num > 0))
			SAEF_log("ide.ide_write_reg() IDE%d PUT register %d=%02X (%08X)", ide.num, ide_reg, val & 0xff, SAER_CPU_getPC());

		switch (ide_reg) {
			case IDE_DRVADDR:
				break;
			case IDE_DEVCON:
				if ((ide.regs.ide_devcon & 4) == 0 && (val & 4) != 0) {
					reset_device(ide, true);
					if (IDE_LOG > 1)
						SAEF_log("ide.ide_write_reg() IDE%d: SRST", ide.num);
				}
				ide.regs0.ide_devcon = val;
				ide.regs1.ide_devcon = val;
				break;
			case IDE_DATA:
				break;
			case IDE_ERROR:
				ide.regs0.ide_feat2 = ide.regs0.ide_feat;
				ide.regs0.ide_feat = val;
				ide.regs1.ide_feat2 = ide.regs1.ide_feat;
				ide.regs1.ide_feat = val;
				break;
			case IDE_NSECTOR:
				ide.regs0.ide_nsector2 = ide.regs0.ide_nsector;
				ide.regs0.ide_nsector = val;
				ide.regs1.ide_nsector2 = ide.regs1.ide_nsector;
				ide.regs1.ide_nsector = val;
				break;
			case IDE_SECTOR:
				ide.regs0.ide_sector2 = ide.regs0.ide_sector;
				ide.regs0.ide_sector = val;
				ide.regs1.ide_sector2 = ide.regs1.ide_sector;
				ide.regs1.ide_sector = val;
				break;
			case IDE_LCYL:
				ide.regs0.ide_lcyl2 = ide.regs0.ide_lcyl;
				ide.regs0.ide_lcyl = val;
				ide.regs1.ide_lcyl2 = ide.regs1.ide_lcyl;
				ide.regs1.ide_lcyl = val;
				break;
			case IDE_HCYL:
				ide.regs0.ide_hcyl2 = ide.regs0.ide_hcyl;
				ide.regs0.ide_hcyl = val;
				ide.regs1.ide_hcyl2 = ide.regs1.ide_hcyl;
				ide.regs1.ide_hcyl = val;
				break;
			case IDE_SELECT:
				ide.regs0.ide_select = val;
				ide.regs1.ide_select = val;
				if (IDE_LOG > 2) {
					if (ide.ide_drv != (val & 0x10) ? 1 : 0)
						SAEF_log("ide.ide_write_reg() DRIVE=%d", (val & 0x10) ? 1 : 0);
				}
				ide.pair.ide_drv = ide.ide_drv = (val & 0x10) ? 1 : 0;
				break;
			case IDE_STATUS:
				ide.irq = 0;
				ide.irq_new = false;
				if (this.ide_isdrive(ide)) {
					ide.regs.ide_status |= IDE_STATUS_BSY;
					ide_do_command(ide, val);
				}
				break;
		}
	}

	/*-----------------------------------------------------------------------*/

	//function ide_thread(idedata) {
	this.ide_thread = function(its) {
		//struct ide_thread_state *its = (struct ide_thread_state*)idedata;
		var quit = false; //OWN

		//for (;;)
		{
			var unit = read_comm_pipe_u32_blocking(its.requests);
			if (unit) SAEF_log("ide.ide_thread() unit 0x%08x", unit);

			if (its.state == 0 || unit == 0xfffffff) {
				SAEF_log("ide.ide_thread() QUIT");
				quit = true;
				//break;
			} else {
				var ide = its.idetable[unit & 0x7f];
				if (SAER.ide.ide_isdrive(ide)) //OWN
				{
					if (unit & 0x80)
						do_process_packet_command(ide);
					else
						do_process_rw_command(ide);
				} else  {
					//SAEF_fatal(SAEE_Internal, "ide.ide_thread() no ide");
				}
			}
		}
		if (quit) {
			its.state = -1;
			return 0;
		}
		setTimeout(function() { SAER.ide.ide_thread(its); }, 10);
	}

	this.start_ide_thread = function(its) {
		if (!its.state) {
			SAEF_log("ide.start_ide_thread() state %d", its.state);
			its.state = 1;
			init_comm_pipe(its.requests, 100, 1);
			//uae_start_thread("ide", ide_thread, its, null);
			setTimeout(function() { SAER.ide.ide_thread(its); }, 0);
		}
	}

	this.stop_ide_thread = function(its) {
		if (its.state > 0) {
			SAEF_log("ide.stop_ide_thread() state %d", its.state);
			its.state = 0;
			write_comm_pipe_u32(its.requests, 0xffffffff, 1);
			//while (its.state == 0) SAEF_sleep(10); //FIX will never break
			its.state = 0;
		}
	}

	/*-----------------------------------------------------------------------*/

	this.ide_initialize = function(idetable, chpair) {
		var ide0 = idetable[chpair * 2 + 0];
		var ide1 = idetable[chpair * 2 + 1];

		ide0.regs0 = ide0.regs;
		ide0.regs1 = ide1.regs;
		ide0.pair = ide1;

		ide1.regs1 = ide1.regs;
		ide1.regs0 = ide0.regs;
		ide1.pair = ide0;

		ide0.num = chpair * 2 + 0;
		ide1.num = chpair * 2 + 1;

		reset_device(ide0, true);
	}

	this.alloc_ide_mem = function(idetable, max, its) {
		for (var i = 0; i < max; i++) {
			var ide;
			if (idetable[i] === null) {
				ide = idetable[i] = new ide_hdf();
				ide.cd_unit_num = -1;
			}
			ide = idetable[i];
			ide_grow_buffer(ide, 1024);
			if (its !== null)
				ide.its = its;
		}
	}

	this.add_ide_unit = function(idetable, max, ch, ci, rc) {
		this.alloc_ide_mem(idetable, max, null);
		if (ch < 0)
			return null;
		var ide = idetable[ch];
		if (ci !== null) {
			ide.hdhfd.hfd.ci = SAEF_CloneObject(ci); //memcpy(&ide.hdhfd.hfd.ci, ci, sizeof(struct uaedev_config_info)); //ATT
		}
		/*if (ci.type == UAEDEV_CD && ci.device_emu_unit >= 0) {
			device_func_init (0);
			ide.scsi = scsi_alloc_cd (ch, ci.device_emu_unit, true);
			if (!ide.scsi) {
				SAEF_log("ide.add_ide_unit() IDE: CD EMU unit %d failed to open", ide.cd_unit_num);
				return null;
			}
			ide.cd_unit_num = ci.device_emu_unit;
			ide.atapi = true;
			ide.blocksize = 512;
			SAER.gui.flicker_led(SAEC_GUI_LED_CD, ch, -1);

			SAEF_log("ide.add_ide_unit() IDE%d CD %d", ch, ide.cd_unit_num);
		} else if (ci.type == UAEDEV_HDF)*/
		{
			if (!SAER.hardfile.hdf_hd_open(ide.hdhfd))
				return null;
			ide.blocksize = ide.hdhfd.hfd.ci.blocksize;
			ide.lba48 = (ide.hdhfd.hfd.ci.unit_special_flags & 1) || ide.hdhfd.size >= 128 * 0x40000000 ? 1 : 0;
			SAER.gui.flicker_led(SAEC_GUI_LED_HD, ch, -1);
			ide.cd_unit_num = -1;
			ide.media_type = ci.controller_media_type;
			ide.ata_level = ci.unit_feature_level;
			if (ide.ata_level == SAEC_Config_Mount_Controller_Level_ATA_1 && (ide.hdhfd.size >= 4 * 0x40000000 || ide.media_type))
				ide.ata_level = SAEC_Config_Mount_Controller_Level_ATA_2;

			SAEF_log("ide.add_ide_unit() IDE%d HD '%s', LCHS=%d/%d/%d. PCHS=%d/%d/%d %dM. LBA48=%d",
				ch, ide.hdhfd.hfd.ci.file.name,
				ide.hdhfd.cyls, ide.hdhfd.heads, ide.hdhfd.secspertrack,
				ide.hdhfd.hfd.ci.pcyls, ide.hdhfd.hfd.ci.pheads, ide.hdhfd.hfd.ci.psecs,
				Math.floor(ide.hdhfd.size / (1024 * 1024)), ide.lba48);

		}
		ide.regs.ide_status = 0;
		ide.data_offset = 0;
		ide.data_size = 0;
		return ide;
	}

	this.remove_ide_unit = function(idetable, ch) {
		if (idetable === null)
			return;
		var ide = idetable[ch];
		if (ide) {
			SAER.hardfile.hdf_hd_close(ide.hdhfd);
			//scsi_free(ide.scsi);
			//xfree(ide.secbuf);
			var its = ide.its;
			//clear(ide); //memset(ide, 0, sizeof(struct ide_hdf));
			ide.its = its;
		}
	}
}
