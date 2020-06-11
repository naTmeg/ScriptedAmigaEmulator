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

function SAEO_Hardfile_Data() { //hardfiledata
	this.virtsize = 0; //u64, virtual size
	this.physsize = 0; //u64, physical size (dynamic disk)
	this.offset = 0; //u64
	this.ci = new SAEO_Config_Mount_Info();
	this.handle = null; //struct hardfilehandle *
	this.handle_valid = 0;
	//this.dangerous = 0;
	//this.flags = 0;
	this.cache = null; //u8 *
	this.cache_valid = 0;
	this.cache_offset = 0; //u64
	this.vendor_id = ""; //[8 + 1]
	this.product_id = ""; //[16 + 1]
	this.product_rev = ""; //[4 + 1]

	// geometry from possible RDSK block
	//int rdbcylinders;
	//int rdbsectors;
	//int rdbheads;
	this.virtual_rdb = null;
	this.virtual_size = 0; //u64

	//int unitnum; //FS
	this.byteswap = false;
	this.adide = false;
	this.hfd_type = 0;

	//virtual hard disk
	this.vhd_header = null;
	this.vhd_bamoffset = 0; //u32
	this.vhd_bamsize = 0; //u32
	this.vhd_blocksize = 0; //u32
	this.vhd_sectormap = null;
	this.vhd_sectormapblock = 0; //u64
	this.vhd_bitmapsize = 0; //u32
	this.vhd_footerblock = 0; //u64

	//void *chd_handle;

	this.drive_empty = false;
	//TCHAR *emptyname;
};

function SAEO_Hardfile_Data_HD() { //hd_hardfiledata
	this.hfd = new SAEO_Hardfile_Data();
	this.size = 0; //u64
	this.cyls = 0;
	this.heads = 0;
	this.secspertrack = 0;
	this.cyls_def = 0;
	this.secspertrack_def = 0;
	this.heads_def = 0;
	this.ansi_version = 0;
};

/*---------------------------------*/

function SAEO_Hardfile() {
	const HFD_VHD_FIXED = 2;
	const HFD_VHD_DYNAMIC = 3;

	//const WITH_CHD = 1;
	//const HFD_CHD_HD = 4;
	//const HFD_CHD_OTHER = 5;

	/*---------------------------------*/

	function getchsgeometry(size, ptr, mode) { //int *pcyl, int *phead, int *psectorspertrack, int mode) {
		var spt, head, cyl;
		var total = Math.floor(size / 512);

		if (typeof mode == "undefined") mode = 0;

		if (mode == 1) {
			// old-style head=1, spt=32 always mode
			head = 1;
			spt = 32;
			cyl = Math.floor(total / (head * spt));
		} else {
			var sptt = new Array(4);
			sptt[0] = 63;
			sptt[1] = 127;
			sptt[2] = 255;
			sptt[3] = -1;

			for (var i = 0; sptt[i] >= 0; i++) {
				var maxhead = sptt[i] < 255 ? 16 : 255;
				spt = sptt[i];
				for (head = 4; head <= maxhead; head++) {
					cyl = Math.floor(total / (head * spt));
					if (size <= 512 * 1024 * 1024) {
						if (cyl <= 1023)
							break;
					} else {
						if (cyl < 16383)
							break;
						if (cyl < 32767 && head >= 5)
							break;
						if (cyl <= 65535)
							break;
					}
					if (maxhead > 16) {
						head *= 2;
						head--;
					}
				}
				if (head <= 16)
					break;
			}
		}
		if (head > 16)
			head--;

		ptr.cyl = cyl;
		ptr.head = head;
		ptr.sectorspertrack = spt;
	}

	/*void getchsgeometry_hdf(struct hardfiledata *hfd, uae_u64 size, int *pcyl, int *phead, int *psectorspertrack) {
		uae_u8 block[512];
		int i;
		uae_u64 minsize = 512 * 1024 * 1024;

		if (size <= minsize) {
			*phead = 1;
			*psectorspertrack = 32;
		}
		memset (block, 0, sizeof block);
		if (hfd) {
			hdf_read(hfd, block, 0, 512);
			if (block[0] == 'D' && block[1] == 'O' && block[2] == 'S') {
				int mode;
				for (mode = 0; mode < 2; mode++) {
					uae_u32 rootblock;
					uae_u32 chk = 0;
					getchsgeometry(size, pcyl, phead, psectorspertrack, mode);
					rootblock = (2 + ((*pcyl) * (*phead) * (*psectorspertrack) - 1)) / 2;
					memset (block, 0, sizeof block);
					hdf_read(hfd, block, (uae_u64)rootblock * 512, 512);
					for (i = 0; i < 512; i += 4)
						chk += (block[i] << 24) | (block[i + 1] << 16) | (block[i + 2] << 8) | (block[i + 3] << 0);
					if (!chk && block[0] == 0 && block[1] == 0 && block[2] == 0 && block[3] == 2 &&
						block[4] == 0 && block[5] == 0 && block[6] == 0 && block[7] == 0 &&
						block[8] == 0 && block[9] == 0 && block[10] == 0 && block[11] == 0 &&
						block[508] == 0 && block[509] == 0 && block[510] == 0 && block[511] == 1) {
							return;
					}
				}
			}
		}
		getchsgeometry(size, pcyl, phead, psectorspertrack, size <= minsize ? 1 : 2);
	}*/

	function getchspgeometry(total, ptr, idegeometry) { //, int *pcyl, int *phead, int *psectorspertrack, bool idegeometry)
		blocks = Math.floor(total / 512);

		if (blocks > 16515072) {
			/* >8G, CHS=16383/16/63 */
			ptr.cyl = 16383;
			ptr.head = 16;
			ptr.sectorspertrack = 63;
			return;
		}
		if (idegeometry) {
			ptr.head = 16;
			ptr.sectorspertrack = 63;
			ptr.cyl = Math.floor(blocks / (ptr.sectorspertrack * ptr.head));
			return;
		}
		//getchsgeometry(total, pcyl, phead, psectorspertrack);
		getchsgeometry(total, ptr);
	}
	function getchshd(hfd, ptr) { //int *pcyl, int *phead, int *psectorspertrack) {
		//getchspgeometry(hfd.virtsize, pcyl, phead, psectorspertrack, false);
		getchspgeometry(hfd.virtsize, ptr, false);
	}

	/*---------------------------------*/

	function gl(p, po) { //OPT
		return ((p[po] << 24) | (p[po+1] << 16) | (p[po+2] << 8) | p[po+3]) >>> 0;
	}

	/*-----------------------------------------------------------------------*/

	function rl(p, po) {
		po <<= 2;
		return ((p[po] << 24) | (p[po+1] << 16) | (p[po+2] << 8) | p[po+3]) >>> 0;
	}
	function pl(p, po, v) {
		po <<= 2;
		p[po  ] = v >>> 24;
		p[po+1] = (v >>> 16) & 0xff;
		p[po+2] = (v >>> 8) & 0xff;
		p[po+3] = v & 0xff;
	}
	function ps(p, po, max, src) { //OWN
		const space = ' '.charCodeAt(0);
		var len = src.length;
		po <<= 2;
		p[po++] = Math.min(len, max);
		for (var i = 0; i < max; i++)
			p[po++] = i < len ? src.charCodeAt(i) : space;
	}
	function rdb_crc(p,po) {
		var sum = 0; //u32
		var blocksize = rl(p, po + 1);
		for (var i = 0; i < blocksize; i++) {
			sum += rl(p, po + i);
			if (sum > 0xffffffff) sum -= 0x100000000;
		}
		sum = -sum; if (sum < 0) sum += 0x100000000;
		pl(p, po + 2, sum);
	}
	function create_virtual_rdb(hfd) {
		var cyl = hfd.ci.surfaces * hfd.ci.sectors;
		var cyls = 262144 / (cyl * 512);
		var size = cyl * cyls * 512;

		SAEF_log("hardfile.create_virtual_rdb() cyl %d, cyls %d, size %d", cyl, cyls, size);

		var rdb = new Uint8Array(size);
		SAEF_memset(rdb,0, 0, size); //OWN
		hfd.virtual_rdb = rdb;
		hfd.virtual_size = size;

		pl(rdb, 0, 0x5244534b);
		pl(rdb, 1, 64);
		pl(rdb, 2, 0); // chksum
		pl(rdb, 3, 7); // hostid
		pl(rdb, 4, 512); // blockbytes
		pl(rdb, 5, 0); // flags
		pl(rdb, 6, -1); // badblock
		pl(rdb, 7, 1); // part
		pl(rdb, 8, -1); // fs
		pl(rdb, 9, -1); // driveinit
		pl(rdb, 10, -1); // reserved
		pl(rdb, 11, -1); // reserved
		pl(rdb, 12, -1); // reserved
		pl(rdb, 13, -1); // reserved
		pl(rdb, 14, -1); // reserved
		pl(rdb, 15, -1); // reserved
		pl(rdb, 16, hfd.ci.highcyl);
		pl(rdb, 17, hfd.ci.sectors);
		pl(rdb, 18, hfd.ci.surfaces);
		pl(rdb, 19, hfd.ci.interleave ? 1 : 0); // interleave
		pl(rdb, 20, 0); // park
		pl(rdb, 21, -1); // res
		pl(rdb, 22, -1); // res
		pl(rdb, 23, -1); // res
		pl(rdb, 24, 0); // writeprecomp
		pl(rdb, 25, 0); // reducedwrite
		pl(rdb, 26, 0); // steprate
		pl(rdb, 27, -1); // res
		pl(rdb, 28, -1); // res
		pl(rdb, 29, -1); // res
		pl(rdb, 30, -1); // res
		pl(rdb, 31, -1); // res
		pl(rdb, 32, 0); // rdbblockslo
		pl(rdb, 33, cyl * cyls); // rdbblockshi
		pl(rdb, 34, cyls); // locyl
		pl(rdb, 35, hfd.ci.highcyl + cyls); // hicyl
		pl(rdb, 36, cyl); // cylblocks
		pl(rdb, 37, 0); // autopark
		pl(rdb, 38, 2); // highrdskblock
		pl(rdb, 39, -1); // res
		ps(rdb, 40,  8, hfd.vendor_id);
		ps(rdb, 42, 16, hfd.product_id);
		ps(rdb, 46,  4, hfd.product_rev);
		rdb_crc(rdb, 0);

		//var part = rdb + 512;
		var part = 512 >> 2;
		pl(rdb, part+0, 0x50415254);
		pl(rdb, part+1, 64);
		pl(rdb, part+2, 0);
		pl(rdb, part+3, 0);
		pl(rdb, part+4, -1);
		pl(rdb, part+5, 1); // 1 = bootable, 3 = bootable + noautomount
		pl(rdb, part+6, -1);
		pl(rdb, part+7, -1);
		pl(rdb, part+8, 0); // devflags
		ps(rdb, part+9, 30, hfd.ci.devname);

		//denv = part + 128;
		var denv = part + (128 >> 2);
		pl(rdb, denv+0, 80);
		pl(rdb, denv+1, 512 >> 2);
		pl(rdb, denv+2, 0); // secorg
		pl(rdb, denv+3, hfd.ci.surfaces);
		pl(rdb, denv+4, hfd.ci.blocksize >> 9); // / 512);
		pl(rdb, denv+5, hfd.ci.sectors);
		pl(rdb, denv+6, hfd.ci.reserved);
		pl(rdb, denv+7, 0); // prealloc
		pl(rdb, denv+8, hfd.ci.interleave ? 1 : 0); // interleave
		pl(rdb, denv+9, cyls); // lowcyl
		pl(rdb, denv+10, hfd.ci.highcyl + cyls - 1);
		pl(rdb, denv+11, hfd.ci.buffers);
		pl(rdb, denv+12, hfd.ci.bufmemtype);
		pl(rdb, denv+13, hfd.ci.maxtransfer);
		pl(rdb, denv+14, hfd.ci.mask);
		pl(rdb, denv+15, hfd.ci.bootpri);
		pl(rdb, denv+16, hfd.ci.dostype);
		rdb_crc(rdb, part);

		hfd.virtsize += size;
	}

	/*-----------------------------------------------------------------------*/

	this.hdf_hd_open = function(hfd) {
		if (hdf_open(hfd.hfd) <= 0)
			return 0;
		var ci = hfd.hfd.ci;
		if (ci.physical_geometry) {
			hfd.cyls = ci.pcyls;
			hfd.heads = ci.pheads;
			hfd.secspertrack = ci.psecs;
		} else if (ci.highcyl && ci.surfaces && ci.sectors) {
			hfd.cyls = ci.highcyl;
			hfd.heads = ci.surfaces;
			hfd.secspertrack = ci.sectors;
		} else {
			var ptr = {};
			getchshd(hfd.hfd, ptr); //&hfd.cyls, &hfd.heads, &hfd.secspertrack);
			hfd.cyls = ptr.cyl;
			hfd.heads = ptr.head;
			hfd.secspertrack = ptr.sectorspertrack;
		}
		hfd.cyls_def = hfd.cyls;
		hfd.secspertrack_def = hfd.secspertrack;
		hfd.heads_def = hfd.heads;

		if (ci.surfaces && ci.sectors) {
			var buf = new Uint8Array(512); buf[0] = 0;
			this.hdf_read(hfd.hfd, buf, 0, 512);
			if (buf[0] != 0 && SAEF_CompareArray(buf, SAEF_String2Array("RDSK"), 4) != 0) {
				ci.highcyl = Math.floor(Math.floor(hfd.hfd.virtsize / ci.blocksize) / (ci.sectors * ci.surfaces));
				ci.dostype = rl(buf,0);
				SAEF_warn("hardfile.hdf_hd_open() no RDSK, dostype 0x%08x, highcyl %d", ci.dostype, ci.highcyl);
				create_virtual_rdb(hfd.hfd);
				while (ci.highcyl * ci.surfaces * ci.sectors > hfd.cyls_def * hfd.secspertrack_def * hfd.heads_def)
					hfd.cyls_def++;
			}
		}
		hfd.size = hfd.hfd.virtsize;
		return 1;
	}

	this.hdf_hd_close = function(hfd) {
		if (hfd !== null)
			hdf_close(hfd.hfd);
	}

	/*-----------------------------------------------------------------------*/

	//function hdf_open(hfd, pname) {
	function hdf_open(hfd, file) {
		if (typeof file == "undefined") file = null;

		//if ((!pname || pname[0] == 0) && hfd.ci.rootdir[0] == 0)
		//if (!pname) pname = hfd.ci.rootdir;

		if (file === null) { //OWN
			if (hfd.ci.file.size == 0)
				return 0;

			file = SAEF_CloneObject(hfd.ci.file);
		}
		hfd.byteswap = false;
		hfd.adide = false;
		hfd.hfd_type = 0;

		/*#ifdef WITH_CHD
		TCHAR nametmp[MAX_DPATH];
		_tcscpy (nametmp, pname);
		TCHAR *ext = _tcsrchr (nametmp, '.');
		if (ext && !_tcsicmp (ext, _T(".chd"))) {
			bool chd_readonly = false;
			struct zfile *zf = null;
			if (!hfd.ci.readonly)
				zf = SAEF_ZFile_fopen(nametmp, "rb+");
			if (!zf) {
				chd_readonly = true;
				zf = SAEF_ZFile_fopen(nametmp, "rb");
			}
			if (zf) {
				int err = CHDERR_FILE_NOT_WRITEABLE;
				hard_disk_file *chdf;
				chd_file *cf = new chd_file();
				if (!chd_readonly)
					err = cf.open(*zf, true, null);
				if (err == CHDERR_FILE_NOT_WRITEABLE) {
					chd_readonly = true;
					err = cf.open(*zf, false, null);
				}
				if (err != CHDERR_NONE) {
					SAEF_ZFile_fclose(zf);
					delete cf;
					goto end;
				}
				chdf = hard_disk_open(cf);
				if (!chdf) {
					hfd.ci.readonly = true;
					hfd.hfd_type = HFD_CHD_OTHER;
					hfd.chd_handle = cf;
				} else {
					hfd.hfd_type = HFD_CHD_HD;
					hfd.chd_handle = chdf;
				}
				if (chd_readonly)
					hfd.ci.readonly = true;
				hfd.virtsize = cf.logical_bytes();
				hfd.handle_valid = -1;
				write_log(_T("CHD '%s' mounted as %s, %s.\n"), pname, chdf ? _T("HD") : _T("OTHER"), hfd.ci.readonly ? _T("read only") : _T("read/write"));
				return 1;
			}
		}
		#endif*/
		var ret = hdf_open_target(hfd, file);
		if (ret <= 0)
			return ret;
		var tmp = new Uint8Array(512);
		if (hdf_read_target(hfd, tmp,0, 0, 512) != 512) {
			//goto nonvhd;
			SAEF_log("hardfile.hdf_open() no VHD-image, file samller than 512 bytes");
			hfd.hfd_type = 0;
			return 1;
		}
		var v = gl(tmp, 8); // features
		if ((v & 3) != 2) {
			SAEF_log("hardfile.hdf_open() no VHD-image, wrong file features %d != 2", v & 3);
			//goto nonvhd;
			hfd.hfd_type = 0;
			return 1;
		}
		v = gl(tmp, 8 + 4); // version
		if ((v >>> 16) != 1) {
			SAEF_log("hardfile.hdf_open() no VHD-image, wrong file version %d != 1", v >>> 16);
			//goto nonvhd;
			hfd.hfd_type = 0;
			return 1;
		}
		hfd.hfd_type = gl(tmp, 8 + 4 + 4 + 8 + 4 + 4 + 4 + 4 + 8 + 8 + 4);
		if (hfd.hfd_type != HFD_VHD_FIXED && hfd.hfd_type != HFD_VHD_DYNAMIC) {
			SAEF_log("hardfile.hdf_open() no VHD-image, wrong file type %d", hfd.hfd_type);
			//goto nonvhd;
			hfd.hfd_type = 0;
			return 1;
		}
		v = gl(tmp, 8 + 4 + 4 + 8 + 4 + 4 + 4 + 4 + 8 + 8 + 4 + 4);
		if (v == 0) {
			SAEF_log("hardfile.hdf_open() no VHD-image, error 1");
			//goto nonvhd;
			hfd.hfd_type = 0;
			return 1;
		}
		var cs = vhd_checksum(tmp, 8 + 4 + 4 + 8 + 4 + 4 + 4 + 4 + 8 + 8 + 4 + 4);
		if (cs != v) {
			SAEF_log("hardfile.hdf_open() no VHD-image, wrong file checksum 0x%08x != 0x%08x", cs, v);
			//goto nonvhd;
			hfd.hfd_type = 0;
			return 1;
		}
		var tmp2 = new Uint8Array(512);
		if (hdf_read_target(hfd, tmp2,0, hfd.physsize - tmp2.length, 512) != 512) {
			SAEF_warn("hardfile.hdf_open() file read error");
			hdf_close_target(hfd); return 0;
			//goto end;
		}
		if (SAEF_CompareArray(tmp, tmp2) != 0) {
			SAEF_log("hardfile.hdf_open() no VHD-image, error 2");
			//goto nonvhd;
			hfd.hfd_type = 0;
			return 1;
		}
		hfd.vhd_footerblock = hfd.physsize - 512;
		//hfd.virtsize = gl(tmp, 8 + 4 + 4 + 8 + 4 + 4 + 4 + 4 + 8) << 32; //ATT
		//hfd.virtsize |= gl(tmp, 8 + 4 + 4 + 8 + 4 + 4 + 4 + 4 + 8 + 4);
		hfd.virtsize = gl(tmp, 8 + 4 + 4 + 8 + 4 + 4 + 4 + 4 + 8) * 0x100000000;
		hfd.virtsize += gl(tmp, 8 + 4 + 4 + 8 + 4 + 4 + 4 + 4 + 8 + 4);

		if (hfd.hfd_type == HFD_VHD_DYNAMIC) {
			var fail = true;
			hfd.vhd_bamoffset = gl(tmp, 8 + 4 + 4 + 4);
			if (hfd.vhd_bamoffset > 0 && hfd.vhd_bamoffset < hfd.physsize) {
				if (hdf_read_target(hfd, tmp,0, hfd.vhd_bamoffset, 512) == 512) {
					v = gl(tmp, 8 + 8 + 8 + 4 + 4 + 4);
					if (vhd_checksum(tmp, 8 + 8 + 8 + 4 + 4 + 4) == v) {
						v = gl(tmp, 8 + 8 + 8);
						if ((v >>> 16) == 1) { //version
							hfd.vhd_blocksize = gl(tmp, 8 + 8 + 8 + 4 + 4);
							hfd.vhd_bamoffset = gl(tmp, 8 + 8 + 4);
							hfd.vhd_bamsize = (Math.floor((hfd.virtsize + hfd.vhd_blocksize - 1) / hfd.vhd_blocksize) * 4 + 511) & ~511;
							var size = hfd.vhd_bamoffset + hfd.vhd_bamsize;
							hfd.vhd_header = new Uint8Array(size);
							if (hdf_read_target(hfd, hfd.vhd_header,0, 0, size) == size) {
								hfd.vhd_sectormap = new Uint8Array(512);
								hfd.vhd_sectormapblock = -1;
								hfd.vhd_bitmapsize = (Math.floor(hfd.vhd_blocksize / (8 * 512)) + 511) & ~511;
								fail = false;
							}
						}
					}
				}
			}
			if (fail) {
				hdf_close_target(hfd);
				return 0;
			}
		}
		SAEF_log("hardfile.hdf_open() HDF is VHD %s image, virtual size=%dK (%x %d)", hfd.hfd_type == HFD_VHD_FIXED ? "fixed" : "dynamic", Math.floor(hfd.virtsize / 1024), hfd.virtsize, hfd.virtsize);
		hdf_init_cache(hfd);
		return 1;
		/*nonvhd:
		hfd.hfd_type = 0;
		return 1;
		end:
		hdf_close_target (hfd);
		return 0;*/
	}

	function hdf_close(hfd) {
		hdf_flush_cache(hfd);
		hdf_close_target(hfd);
		/*
		#ifdef WITH_CHD
		if (hfd.hfd_type == HFD_CHD_OTHER) {
			chd_file *cf = (chd_file*)hfd.chd_handle;
			cf.close();
			delete cf;
		} else if (hfd.hfd_type == HFD_CHD_HD) {
			hard_disk_file *chdf = (hard_disk_file*)hfd.chd_handle;
			chd_file *cf = hard_disk_get_chd(chdf);
			hard_disk_close(chdf);
			cf.close();
			delete cf;
		}
		hfd.chd_handle = null;
		#endif*/
		hfd.hfd_type = 0;
		//xfree(hfd.vhd_header);
		hfd.vhd_header = null;
		//xfree(hfd.vhd_sectormap);
		hfd.vhd_sectormap = null;
	}

	/*int hdf_dup(struct hardfiledata *dhfd, const struct hardfiledata *shfd) {
		return hdf_dup_target(dhfd, shfd);
	}*/

	/*-----------------------------------------------------------------------*/

	function vhd_checksum(p, offset) {
		var sum = 0; //u32
		for (var i = 0; i < 512; i++) {
			if (offset >= 0 && i >= offset && i < offset + 4)
				continue;
			sum += p[i];
			if (sum > 0xffffffff) sum -= 0x100000000;
		}
		return ~sum >>> 0;
	}

	function vhd_read(hfd, data, offset, len) {
		//uae_u8 *dataptr = (uae_u8*)data;
		var dataptr = 0;

		//SAEF_log("hardfile.vhd_read() %08x %08x", offset, len);
		//SAEF_log("hardfile.vhd_read() %d %d", offset, len);

		var read = 0; //u64
		if (offset & 511)
			return read;
		if (len & 511)
			return read;
		while (len > 0) {
			var bamoffset = Math.floor(offset / hfd.vhd_blocksize) * 4 + hfd.vhd_bamoffset; //u32
			var sectoroffset = gl(hfd.vhd_header, bamoffset); //u32
			if (sectoroffset == 0xffffffff) {
				//memset(dataptr, 0, 512);
				SAEF_memset(data,dataptr, 0, 512);
				read += 512;
			} else {
				var bitmapoffsetbits = Math.floor(offset / 512) % (hfd.vhd_blocksize >> 9); //int
				var bitmapoffsetbytes = Math.floor(bitmapoffsetbits / 8); //int
				var sectormapblock = sectoroffset * 512 + (bitmapoffsetbytes & ~511); //u64
				if (hfd.vhd_sectormapblock != sectormapblock) {
					// read sector bitmap
					//SAEF_log("hardfile.vhd_read() BM %08x", sectormapblock);
					if (hdf_read_target(hfd, hfd.vhd_sectormap,0, sectormapblock, 512) != 512) {
						SAEF_warn("hardfile.vhd_read() bitmap read error");
						return read;
					}
					hfd.vhd_sectormapblock = sectormapblock;
				}
				// block allocated in bitmap?
				if (hfd.vhd_sectormap[bitmapoffsetbytes & 511] & (1 << (7 - (bitmapoffsetbits & 7)))) {
					// read data block
					var block = sectoroffset * 512 + hfd.vhd_bitmapsize + bitmapoffsetbits * 512; //u64
					//SAEF_log("hardfile.vhd_read() DB %08x", block);
					if (hdf_read_target(hfd, data,dataptr, block, 512) != 512) {
						SAEF_warn("hardfile.vhd_read() data read error");
						return read;
					}
				} else {
					//memset(dataptr, 0, 512);
					SAEF_memset(data,dataptr, 0, 512);
				}
				read += 512;
			}
			len -= 512;
			dataptr += 512;
			offset += 512;
		}
		return read;
	}

	function vhd_write_enlarge(hfd, bamoffset) {
		var len = hfd.vhd_blocksize + hfd.vhd_bitmapsize + 512;
		if (!hdf_resize_target(hfd, hfd.physsize + len - 512)) {
			SAEF_warn("hardfile.vhd_write_enlarge() failure");
			return false;
		}
		// add footer (same as 512 byte header)
		var buf = new Uint8Array(len);
		SAEF_memset(buf,0, 0, len - 512); //OWN
		buf.set(hfd.vhd_header.subarray(0, 512), len - 512); //memcpy (buf + len - 512, hfd->vhd_header, 512);
		var v = hdf_write_target(hfd, buf,0, hfd.vhd_footerblock, len);
		delete buf;
		if (v != len) {
			SAEF_warn("hardfile.vhd_write_enlarge() footer write error");
			return false;
		}
		// write new offset to BAM
		var block = Math.floor(hfd.vhd_footerblock / 512);
		hfd.vhd_header[bamoffset + 0] = block >>> 24;
		hfd.vhd_header[bamoffset + 1] = (block >>> 16) & 0xff;
		hfd.vhd_header[bamoffset + 2] = (block >>>  8) & 0xff;
		hfd.vhd_header[bamoffset + 3] = block & 0xff;
		// write to disk
		if (hdf_write_target(hfd, hfd.vhd_header,hfd.vhd_bamoffset, hfd.vhd_bamoffset, hfd.vhd_bamsize) != hfd.vhd_bamsize) {
			SAEF_warn("hardfile.vhd_write_enlarge() bam write error");
			return false;
		}
		hfd.vhd_footerblock += len - 512;
		return true;
	}
	function vhd_write(hfd, data, offset, len) {
		//uae_u8 *dataptr = (uae_u8*)v;
		var dataptr = 0;

		//SAEF_log("hardfile.vhd_read() %08x %08x", offset, len);
		//SAEF_log("hardfile.vhd_write() %d %d", offset, len);

		var written = 0; //u64
		if (offset & 511)
			return written;
		if (len & 511)
			return written;
		while (len > 0) {
			var bamoffset = Math.floor(offset / hfd.vhd_blocksize) * 4 + hfd.vhd_bamoffset; //u32
			var sectoroffset = gl(hfd.vhd_header, bamoffset); //u32
			if (sectoroffset == 0xffffffff) {
				if (!vhd_write_enlarge(hfd, bamoffset))
					return written;
				continue;
			} else {
				var bitmapoffsetbits = Math.floor(offset / 512) % (hfd.vhd_blocksize >> 9); //int
				var bitmapoffsetbytes = Math.floor(bitmapoffsetbits / 8); //int
				var sectormapblock = sectoroffset * 512 + (bitmapoffsetbytes & ~511); //u64
				if (hfd.vhd_sectormapblock != sectormapblock) {
					// read sector bitmap
					//SAEF_log("hardfile.vhd_write() BM %08x", sectormapblock);
					if (hdf_read_target(hfd, hfd.vhd_sectormap,0, sectormapblock, 512) != 512) {
						SAEF_warn("hardfile.vhd_write() bitmap read error");
						return written;
					}
					hfd.vhd_sectormapblock = sectormapblock;
				}
				// write data
				var block = sectoroffset * 512 + hfd.vhd_bitmapsize + bitmapoffsetbits * 512; //u64
				//SAEF_log("hardfile.vhd_write() DB %08x", block);
				if (hdf_write_target(hfd, data,dataptr, block, 512) != 512) {
					SAEF_warn("hardfile.vhd_write() data write error");
					return written;
				}
				// block already allocated in bitmap?
				if (!(hfd.vhd_sectormap[bitmapoffsetbytes & 511] & (1 << (7 - (bitmapoffsetbits & 7))))) {
					// no, we need to mark it allocated and write the modified bitmap back to the disk
					hfd.vhd_sectormap[bitmapoffsetbytes & 511] |= (1 << (7 - (bitmapoffsetbits & 7)));
					if (hdf_write_target(hfd, hfd.vhd_sectormap,0, sectormapblock, 512) != 512) {
						SAEF_warn("hardfile.vhd_write() bam write error");
						return written;
					}
				}
				written += 512;
			}
			len -= 512;
			dataptr += 512;
			offset += 512;
		}
		return written;
	}

	/*int vhd_create (const TCHAR *name, uae_u64 size, uae_u32 dostype) {
		struct hardfiledata hfd;
		struct zfile *zf;
		uae_u8 *b;
		int cyl, cylsec, head, tracksec;
		uae_u32 crc, blocksize, batsize, batentrysize;
		int ret, i;
		time_t tm;

		if (size >= (uae_u64)10 * 1024 * 1024 * 1024)
			blocksize = 2 * 1024 * 1024;
		else
			blocksize = 512 * 1024;
		batsize = (size + blocksize - 1) / blocksize;
		batentrysize = batsize;
		batsize *= 4;
		batsize += 511;
		batsize &= ~511;
		ret = 0;
		b = NULL;
		zf = SAEF_ZFile_fopen(name, "wb", 0);
		if (!zf)
			goto end;
		b = xcalloc (uae_u8, 512 + 1024 + batsize + 512);
		if (SAEF_ZFile_fwrite(b,0, 512 + 1024 + batsize + 512, 1, zf) != 1)
			goto end;

		memset (&hfd, 0, sizeof hfd);
		hfd.virtsize = hfd.physsize = size;
		hfd.ci.blocksize = 512;
		strcpy ((char*)b, "conectix"); // cookie
		b[0x0b] = 2; // features
		b[0x0d] = 1; // version
		b[0x10 + 6] = 2; // data offset
		// time stamp
		tm = time (NULL) - 946684800;
		b[0x18] = tm >> 24;
		b[0x19] = tm >> 16;
		b[0x1a] = tm >>  8;
		b[0x1b] = tm >>  0;
		strcpy ((char*)b + 0x1c, "vpc "); // creator application
		b[0x21] = 5; // creator version
		strcpy ((char*)b + 0x24, "Wi2k"); // creator host os
		// original and current size
		b[0x28] = b[0x30] = size >> 56;
		b[0x29] = b[0x31] = size >> 48;
		b[0x2a] = b[0x32] = size >> 40;
		b[0x2b] = b[0x33] = size >> 32;
		b[0x2c] = b[0x34] = size >> 24;
		b[0x2d] = b[0x35] = size >> 16;
		b[0x2e] = b[0x36] = size >>  8;
		b[0x2f] = b[0x37] = size >>  0;
		getchs2 (&hfd, &cyl, &cylsec, &head, &tracksec);
		// cylinders
		b[0x38] = cyl >> 8;
		b[0x39] = cyl;
		// heads
		b[0x3a] = head;
		// sectors per track
		b[0x3b] = tracksec;
		// disk type
		b[0x3c + 3] = HFD_VHD_DYNAMIC;
		get_guid_target (b + 0x44);
		crc = vhd_checksum (b, -1);
		b[0x40] = crc >> 24;
		b[0x41] = crc >> 16;
		b[0x42] = crc >>  8;
		b[0x43] = crc >>  0;

		// write header
		SAEF_ZFile_fseek(zf, 0, SEEK_SET);
		SAEF_ZFile_fwrite(b,0, 512, 1, zf);
		// write footer
		SAEF_ZFile_fseek(zf, 512 + 1024 + batsize, SEEK_SET);
		SAEF_ZFile_fwrite(b,0, 512, 1, zf);

		// dynamic disk header
		memset (b, 0, 1024);
		// cookie
		strcpy ((char*)b, "cxsparse");
		// data offset
		for (i = 0; i < 8; i++)
			b[0x08 + i] = 0xff;
		// table offset (bat)
		b[0x10 + 6] = 0x06;
		// version
		b[0x19] = 1;
		// max table entries
		b[0x1c] = batentrysize >> 24;
		b[0x1d] = batentrysize >> 16;
		b[0x1e] = batentrysize >>  8;
		b[0x1f] = batentrysize >>  0;
		b[0x20] = blocksize >> 24;
		b[0x21] = blocksize >> 16;
		b[0x22] = blocksize >>  8;
		b[0x23] = blocksize >>  0;
		crc = vhd_checksum (b, -1);
		b[0x24] = crc >> 24;
		b[0x25] = crc >> 16;
		b[0x26] = crc >>  8;
		b[0x27] = crc >>  0;

		// write dynamic header
		SAEF_ZFile_fseek(zf, 512, SEEK_SET);
		SAEF_ZFile_fwrite(b,0, 1024, 1, zf);

		// bat
		memset (b, 0, batsize);
		memset (b, 0xff, batentrysize * 4);
		SAEF_ZFile_fwrite(b,0, batsize, 1, zf);

		SAEF_ZFile_fclose(zf);
		zf = NULL;

		if (dostype) {
			uae_u8 bootblock[512] = { 0 };
			bootblock[0] = dostype >> 24;
			bootblock[1] = dostype >> 16;
			bootblock[2] = dostype >>  8;
			bootblock[3] = dostype >>  0;
			if (hdf_open(&hfd, file) > 0) {
				vhd_write(&hfd, bootblock, 0, 512);
				hdf_close(&hfd);
			}
		}

		ret = 1;

		end:
		xfree (b);
		SAEF_ZFile_fclose(zf);
		return ret;
	}*/

	/*-----------------------------------------------------------------------*/

	function hdf_read2(hfd, buffer, offset, len) {
		if (hfd.hfd_type == HFD_VHD_DYNAMIC)
			return vhd_read(hfd, buffer, offset, len);
		else if (hfd.hfd_type == HFD_VHD_FIXED)
			return hdf_read_target(hfd, buffer,0, offset + 512, len);
		/*
		#ifdef WITH_CHD
		else if (hfd.hfd_type == HFD_CHD_OTHER) {
			chd_file *cf = (chd_file*)hfd.chd_handle;
			if (cf.read_bytes(offset, buffer, len) == CHDERR_NONE)
				return len;
			return 0;
		} else if (hfd.hfd_type == HFD_CHD_HD) {
			hard_disk_file *chdf = (hard_disk_file*)hfd.chd_handle;
			hard_disk_info *chdi = hard_disk_get_info(chdf);
			chd_file *cf = hard_disk_get_chd(chdf);
			uae_u8 *buf = (uae_u8*)buffer;
			int got = 0;
			offset /= chdi.sectorbytes;
			while (len > 0) {
				if (cf.read_units(offset, buf) != CHDERR_NONE)
					return got;
				got += chdi.sectorbytes;
				buf += chdi.sectorbytes;
				len -= chdi.sectorbytes;
				offset++;
			}
			return got;
		}
		#endif*/
		else
			return hdf_read_target(hfd, buffer,0, offset, len);
	}

	function hdf_write2(hfd, buffer, offset, len) {
		if (hfd.hfd_type == HFD_VHD_DYNAMIC)
			return vhd_write(hfd, buffer, offset, len);
		else if (hfd.hfd_type == HFD_VHD_FIXED)
			return hdf_write_target(hfd, buffer,0, offset + 512, len);
		/*
		#ifdef WITH_CHD
		else if (hfd.hfd_type == HFD_CHD_OTHER)
			return 0;
		else if (hfd.hfd_type == HFD_CHD_HD) {
			if (hfd.ci.readonly)
				return 0;
			hard_disk_file *chdf = (hard_disk_file*)hfd.chd_handle;
			hard_disk_info *chdi = hard_disk_get_info(chdf);
			chd_file *cf = hard_disk_get_chd(chdf);
			uae_u8 *buf = (uae_u8*)buffer;
			int got = 0;
			offset /= chdi.sectorbytes;
			while (len > 0) {
				if (cf.write_units(offset, buf) != CHDERR_NONE)
					return got;
				got += chdi.sectorbytes;
				buf += chdi.sectorbytes;
				len -= chdi.sectorbytes;
				offset++;
			}
			return got;
		}
		#endif*/
		else
			return hdf_write_target(hfd, buffer,0, offset, len);
	}

	function hdf_cache_read(hfd, buffer, offset, len) {
		return hdf_read2(hfd, buffer, offset, len);
	}
	function hdf_cache_write(hfd, buffer, offset, len) {
		return hdf_write2(hfd, buffer, offset, len);
	}
	function hdf_init_cache(hfd) {}
	function hdf_flush_cache(hdf) {}

	/*-----------------------------------------------------------------------*/

	function adide_decode(v, len) {
		SAEF_warn("hardfile.adide_decode() 0x%04x %d", v, len);
		/*int i;
		uae_u8 *buffer = (uae_u8*)v;
		for (i = 0; i < len; i += 2) {
			uae_u8 *b =  buffer + i;
			uae_u16 w = (b[0] << 8) | (b[1] << 0);
			uae_u16 o = SAER.ide.adide_decode_word(w);
			b[0] = o >> 8;
			b[1] = o >> 0;
		}*/
	}
	function adide_encode(v, len) {
		SAEF_warn("hardfile.adide_encode() 0x%04x %d", v, len);
		/*int i;
		uae_u8 *buffer = (uae_u8*)v;
		for (i = 0; i < len; i += 2) {
			uae_u8 *b =  buffer + i;
			uae_u16 w = (b[0] << 8) | (b[1] << 0);
			uae_u16 o = SAER.ide.adide_encode_word(w);
			b[0] = o >> 8;
			b[1] = o >> 0;
		}*/
	}
	function hdf_byteswap(v, len) {
		SAEF_warn("hardfile.hdf_byteswap() 0x%04x %d", v, len);
		/*int i;
		uae_u8 *b = (uae_u8*)v;
		for (i = 0; i < len; i += 2) {
			uae_u8 tmp = b[i];
			b[i] = b[i + 1];
			b[i + 1] = tmp;
		}*/
	}

	/*int hdf_read_rdb (struct hardfiledata *hfd, void *buffer, uae_u64 offset, int len) {
		int v;
		v = hdf_read (hfd, buffer, offset, len);
		if (v > 0 && offset < 16 * 512 && !hfd.byteswap && !hfd.adide)  {
			uae_u8 *buf = (uae_u8*)buffer;
			bool changed = false;
			if (buf[0] == 0x39 && buf[1] == 0x10 && buf[2] == 0xd3 && buf[3] == 0x12) { // AdIDE encoded "CPRM"
				hfd.adide = true;
				changed = true;
				write_log (_T("HDF: adide scrambling detected\n"));
			} else if (!memcmp (buf, "DRKS", 4)) {
				hfd.byteswap = true;
				changed = true;
				write_log (_T("HDF: byteswapped RDB detected\n"));
			}
			if (changed)
				v = hdf_read (hfd, buffer, offset, len);
		}
		return v;
	}*/

	this.hdf_read = function(hfd, buffer, offset, len) {
		var v;

		//SAEF_log("hardfile.hdf_read() %04x-%08x (%d) %08x (%d)", Math.floor(offset / 0x100000000), Math.floor(offset % 0x100000000), Math.floor(offset / hfd.ci.blocksize), len >>> 0, Math.floor(len / hfd.ci.blocksize));

		if (!hfd.adide) {
			v = hdf_cache_read(hfd, buffer, offset, len);
		} else {
			offset += 512;
			v = hdf_cache_read(hfd, buffer, offset, len);
			adide_decode(buffer, len);
		}
		if (hfd.byteswap)
			hdf_byteswap(buffer, len);
		return v;
	}

	this.hdf_write = function(hfd, buffer, offset, len) {
		var v;

		//SAEF_log("hardfile.hdf_write() %04x-%08x (%d) %08x (%d)", Math.floor(offset / 0x100000000), Math.floor(offset % 0x100000000), Math.floor(offset / hfd.ci.blocksize), len >>> 0, Math.floor(len / hfd.ci.blocksize));

		if (hfd.byteswap)
			hdf_byteswap(buffer, len);
		if (!hfd.adide)
			v = hdf_cache_write(hfd, buffer, offset, len);
		else {
			offset += 512;
			adide_encode(buffer, len);
			v = hdf_cache_write(hfd, buffer, offset, len);
			adide_decode(buffer, len);
		}
		if (hfd.byteswap)
			hdf_byteswap(buffer, len);
		return v;
	}

	/*-----------------------------------------------------------------------*/
	/* target */

	const CACHE_SIZE = 16384;

	function hardfilehandle() {
		this.zf = null;
		this.firstwrite = false;
	};

	//function hdf_open_target(hfd, pname) {
	function hdf_open_target(hfd, file) {
		//hfd.flags = 0;
		hfd.drive_empty = false;
		hdf_close(hfd);
		hfd.cache = new Uint8Array(CACHE_SIZE); //(uae_u8*)VirtualAlloc (null, CACHE_SIZE, MEM_COMMIT, PAGE_READWRITE);
		/*if (!hfd.cache) {
			SAEF_warn("VirtualAlloc(%d) failed, error %d", CACHE_SIZE, GetLastError());
			hdf_close(hfd);
			return -1;
		}*/
		hfd.cache_valid = 0;
		hfd.virtual_size = 0;
		hfd.virtual_rdb = null;

		hfd.vendor_id = "UAE";
		hfd.product_id = file.name.substr(0, Math.min(file.name.length, 16-1));
		hfd.product_rev = "0.1";

		SAEF_log("hardfile.hdf_open_target() attempting to open HDF '%s'... (%d bytes)", file.name, file.size);
		hfd.handle = new hardfilehandle();
		//hfd.handle.zf = SAEF_ZFile_fopen(pname, "rb", ZFD_NORMAL);
		hfd.handle.zf = SAEF_ZFile_fopen_file(file);
		if (hfd.handle.zf === null) {
			hdf_close(hfd);
			return -1;
		}
		SAEF_ZFile_fseek(hfd.handle.zf, 0, SEEK_END);
		hfd.physsize = hfd.virtsize = SAEF_ZFile_ftell(hfd.handle.zf);
		SAEF_ZFile_fseek(hfd.handle.zf, 0, SEEK_SET);
		hfd.handle_valid = 1;

		SAEF_log("hardfile.hdf_open_target() HDF '%s' opened (size %dK, empty %d)", file.name, Math.floor(hfd.physsize / 1024), hfd.drive_empty ? 1:0);
		return 1;

		/*if (hfd.handle_valid || hfd.drive_empty) {
			SAEF_log("hardfile.hdf_open_target() HDF '%s' opened (size %dK, mode %d, empty %d)", file.name, Math.floor(hfd.physsize / 1024), hfd.handle_valid, hfd.drive_empty);
			return 1;
		}
		hdf_close(hfd);
		return -1;*/
	}

	function freehandle(h) {
		if (h !== null) {
			if (h.zf !== null) {
				SAEF_ZFile_fclose(h.zf);
				h.zf = null;
			}
		}
	}

	function hdf_close_target(hfd) {
		freehandle(hfd.handle);
		//xfree(hfd.handle);
		//xfree(hfd.emptyname);
		//hfd.emptyname = null;
		hfd.handle = null;
		hfd.handle_valid = 0;
		//if (hfd.cache) VirtualFree(hfd.cache, 0, MEM_RELEASE);
		hfd.cache = null;
		hfd.cache_valid = 0;
		//xfree(hfd.virtual_rdb);
		hfd.virtual_rdb = null;
		hfd.virtual_size = 0;
		hfd.drive_empty = false;
		//hfd.dangerous = 0;
	}

	/*---------------------------------*/

	/*int hdf_dup_target(struct hardfiledata *dhfd, const struct hardfiledata *shfd) {
		if (!shfd.handle_valid)
			return 0;
		freehandle (dhfd.handle);

		struct zfile *zf = SAEF_ZFile_dup(shfd.handle.zf);
		if (!zf)
			return 0;
		dhfd.handle.zf = zf;
		dhfd.handle_valid = 1;

		dhfd.cache = (uae_u8*)VirtualAlloc (null, CACHE_SIZE, MEM_COMMIT, PAGE_READWRITE);
		dhfd.cache_valid = 0;
		if (!dhfd.cache) {
			hdf_close(dhfd);
			return 0;
		}
		return 1;
	}*/

	function hdf_resize_target(hfd, newsize) {
		/*DWORD ret, err;
		if (newsize >= 0x80000000) {
			LONG highword = (DWORD)(newsize >> 32);
			ret = SetFilePointer (hfd.handle.h, (DWORD)newsize, &highword, FILE_BEGIN);
		} else {
			ret = SetFilePointer (hfd.handle.h, (DWORD)newsize, null, FILE_BEGIN);
		}
		err = GetLastError ();
		if (ret == INVALID_SET_FILE_POINTER && err != NO_ERROR) {
			write_log (_T("hdf_resize_target: SetFilePointer() %d\n"), err);
			return 0;
		}
		if (SetEndOfFile (hfd.handle.h)) {
			hfd.physsize = newsize;
			return 1;
		}
		err = GetLastError ();
		write_log (_T("hdf_resize_target: SetEndOfFile() %d\n"), err);
		return 0;*/

		SAEF_ZFile_resize(hfd.handle.zf, newsize);
		hfd.physsize = newsize;
		return true;
	}

	/*---------------------------------*/

	function hdf_seek(hfd, offset) {
		if (hfd.handle_valid == 0) {
			SAEF_warn("hardfile.hdf_seek() hdf handle is not valid. bug.");
			//abort();
			return -1;
		}
		if (offset >= hfd.physsize - hfd.virtual_size) {
			SAEF_warn("hardfile.hdf_seek() tried to seek out of bounds! (%X >= %X - %X)", offset, hfd.physsize, hfd.virtual_size);
			//abort();
			return -1;
		}
		offset += hfd.offset;
		if (offset & (hfd.ci.blocksize - 1)) {
			SAEF_warn("hardfile.hdf_seek() fail, offset = %X not aligned to blocksize %d! (%X & %04X = %04X)", offset, hfd.ci.blocksize, offset, hfd.ci.blocksize, offset & (hfd.ci.blocksize - 1));
			//abort();
			return -1;
		}
		if (SAEF_ZFile_fseek(hfd.handle.zf, offset, SEEK_SET) != 0) {
			SAEF_warn("hardfile.hdf_seek() common seek error");
			return -1;
		}
		return 0;
	}

	/*---------------------------------*/

	function poscheck(hfd, len) {
		var pos = SAEF_ZFile_ftell(hfd.handle.zf);
		if (len < 0) {
			SAEF_warn("hardfile.poscheck() fail, negative length! (%d)", len);
			//abort();
			return -1;
		}
		if (pos < hfd.offset) {
			SAEF_warn("hardfile.poscheck() fail, offset out of bounds! (%d < %d)", pos, hfd.offset);
			//abort();
			return -1;
		}
		if (pos >= hfd.offset + hfd.physsize - hfd.virtual_size || pos >= hfd.offset + hfd.physsize + len - hfd.virtual_size) {
			SAEF_warn("hardfile.poscheck() fail, offset out of bounds! (%d >= %d, LEN=%d)", pos, hfd.offset + hfd.physsize, len);
			//abort();
			return -1;
		}
		if (pos & (hfd.ci.blocksize - 1)) {
			SAEF_warn("hardfile.poscheck() fail, offset not aligned to blocksize! (%X & %X = %04X)", pos, hfd.ci.blocksize, pos & hfd.ci.blocksize);
			//abort();
			return -1;
		}
		return 0;
	}

	/*---------------------------------*/

	function isincache(hfd, offset, len) {
		if (!hfd.cache_valid)
			return -1;
		if (offset >= hfd.cache_offset && offset + len <= hfd.cache_offset + CACHE_SIZE)
			return offset - hfd.cache_offset;
		return -1;
	}

	function hdf_read_target_2(hfd, buffer,buffero, offset, len) { //hdf_read_2()
		if (offset == 0)
			hfd.cache_valid = 0;
		var coffset = isincache(hfd, offset, len);
		if (coffset >= 0) {
			buffer.set(hfd.cache.subarray(coffset, coffset + len), buffero); //memcpy (buffer, hfd->cache + coffset, len);
			return len;
		}
		hfd.cache_offset = offset;
		if (offset + CACHE_SIZE > hfd.offset + (hfd.physsize - hfd.virtual_size))
			hfd.cache_offset = hfd.offset + (hfd.physsize - hfd.virtual_size) - CACHE_SIZE;
		if (hdf_seek(hfd, hfd.cache_offset) == -1)
			return -1;
		if (poscheck(hfd, CACHE_SIZE) == -1)
			return -1;
		var outlen = SAEF_ZFile_fread(hfd.cache,0, 1, CACHE_SIZE, hfd.handle.zf);
		hfd.cache_valid = 0;
		if (outlen != CACHE_SIZE)
			return 0;
		hfd.cache_valid = 1;
		coffset = isincache(hfd, offset, len);
		if (coffset >= 0) {
			buffer.set(hfd.cache.subarray(coffset, coffset + len), buffero); //memcpy (buffer, hfd->cache + coffset, len);
			return len;
		}
		SAEF_error("hardfile.hdf_read_target_2() cache bug! offset %d, len %d", offset, len);
		hfd.cache_valid = 0;
		return 0;
	}

	function hdf_read_target(hfd, buffer,buffero, offset, len) {
		var got = 0;
		//var p = buffer;
		var p = buffero;

		if (hfd.drive_empty)
			return 0;
		if (offset < hfd.virtual_size) {
			var len2 = offset + len <= hfd.virtual_size ? len : hfd.virtual_size - offset;
			if (!hfd.virtual_rdb)
				return 0;
			buffer.set(hfd.virtual_rdb.subarray(offset, offset + len2), p); //memcpy(buffer, hfd.virtual_rdb + offset, len2);
			return len2;
		}
		offset -= hfd.virtual_size;
		while (len > 0) {
			var maxlen;
			var ret;
			if (hfd.physsize < CACHE_SIZE) {
				hfd.cache_valid = 0;
				if (hdf_seek(hfd, offset) == -1)
					return -1;
				if (poscheck(hfd, len) == -1)
					return -1;
				ret = SAEF_ZFile_fread(buffer,p, 1, len, hfd.handle.zf);
				maxlen = len;
			} else {
				maxlen = len > CACHE_SIZE ? CACHE_SIZE : len;
				ret = hdf_read_target_2(hfd, buffer,p, offset, maxlen);
			}
			if (ret < 0)
				return ret;
			got += ret;
			if (ret != maxlen)
				return got;
			offset += maxlen;
			p += maxlen;
			len -= maxlen;
		}
		return got;
	}

	/*---------------------------------*/

	function hdf_write_target_2(hfd, buffer,buffero, offset, len) { //hdf_write_2()
		if (hfd.ci.readonly)
			return 0;
		//if (hfd.dangerous)
			//return 0;
		hfd.cache_valid = 0;
		if (hdf_seek(hfd, offset) == -1)
			return -1;
		if (poscheck(hfd, len) == -1)
			return -1;
		hfd.cache.set(buffer.subarray(buffero, buffero + len)); //memcpy(hfd.cache, buffer, len);
		return SAEF_ZFile_fwrite(hfd.cache,0, 1, len, hfd.handle.zf);
	}

	function hdf_write_target(hfd, buffer,buffero, offset, len) {
		var got = 0;
		//var p = buffer;
		var p = buffero;

		if (hfd.drive_empty)
			return 0;
		if (offset < hfd.virtual_size)
			return len;
		offset -= hfd.virtual_size;
		while (len > 0) {
			var maxlen = len > CACHE_SIZE ? CACHE_SIZE : len;
			var ret = hdf_write_target_2(hfd, buffer,p, offset, maxlen);
			if (ret < 0)
				return ret;
			got += ret;
			if (ret != maxlen)
				return got;
			offset += maxlen;
			p += maxlen;
			len -= maxlen;
		}
		return got;
	}

	/*-----------------------------------------------------------------------*/

	this.reset = function() {} //hardfile_reset()
}
