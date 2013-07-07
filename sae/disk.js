/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
***************************************************************************
* Notes: Ported from WinUAE 2.5.0
* 
**************************************************************************/

const LONGWRITEMODE = 0;
 
const FLOPPY_DRIVE_HD = 1;
const FLOPPY_WRITE_MAXLEN = 0x3800;

const DDHDMULT = FLOPPY_DRIVE_HD ? 2 : 1;

const MAX_FLOPPY_DRIVES = 4;
const MAX_SECTORS = DDHDMULT * 11;
const MAX_TRACKS = 2 * 83;

const MIN_STEPLIMIT_CYCLE = CYCLE_UNIT * 250;

const DISK_INDEXSYNC = 1;
const DISK_WORDSYNC = 2;
const DISK_REVOLUTION = 4; /* 8,16,32,64 */

const DSKREADY_UP_TIME = 20;
const DSKREADY_DOWN_TIME = 50;
const WORDSYNC_TIME = 11;

const DSKDMA_OFF = 0;
const DSKDMA_READ = 1;
const DSKDMA_WRITE = 2;

const DRIVE_ID_NONE  = 0x00000000;
const DRIVE_ID_35DD  = 0xFFFFFFFF;
const DRIVE_ID_35HD  = 0xAAAAAAAA;
const DRIVE_ID_525SD = 0x55555555;

const TRACK_AMIGADOS	= 0;
const TRACK_RAW		= 1;
const TRACK_RAW1		= 2;
const TRACK_PCDOS		= 3;
const TRACK_DISKSPARE= 4;
const TRACK_NONE		= 5;

const ADF_NONE		= -1;
const ADF_NORMAL	= 0;
const ADF_EXT1		= 1;
const ADF_EXT2		= 2;
/*const ADF_FDI		= 3;
const ADF_IPF		= 4;
const ADF_PCDOS	= 5;*/

function Track() {
	this.len = 0;
	this.offs = 0;
	this.bitlen = 0;
	this.sync = 0;
	this.type = TRACK_NONE;
}

function get_floppy_speed() {
	var speed = AMIGA.config.floppy.speed == SAEV_Config_Floppy_Speed_Turbo ? 100 : AMIGA.config.floppy.speed;
	return Math.floor((AMIGA.config.video.ntsc ? 1812 : 1829) * 100 / speed);
}    

function uaerand() {
	var l = 0, u = 0xffffffff;
	return Math.floor((Math.random() * (u - l + 1)) + l);	
}

function Drive(number) {
	this.num = number;
	this.diskdata = null;
	this.diskfile = null;
	//this.writediskfile = null;
	this.filetype = 0; //drive_filetype
	this.trackdata = new Array(MAX_TRACKS); for (var i = 0; i < MAX_TRACKS; i++) this.trackdata[i] = new Track();
	//this.writetrackdata = new Array(MAX_TRACKS);	for (var i = 0; i < MAX_TRACKS; i++) this.trackdata[i] = new Track();
	this.writebuffer = new Uint8Array(544 * MAX_SECTORS); for (var i = 0; i < 544 * MAX_SECTORS; i++) this.writebuffer[i] = 0;
	this.buffered_cyl = 0;
	this.buffered_side = 0;
	this.cyl = 0;
	this.motoroff = true;
	this.motordelay = false; /* dskrdy needs some clock cycles before it changes after switching off motor */
	//this.state = 0;
	this.wrprot = false;
	this.bigmfmbuf = new Uint16Array(0x4000 * DDHDMULT); for (var i = 0; i < 0x4000 * DDHDMULT; i++) this.bigmfmbuf[i] = 0;  
	this.tracktiming = new Uint16Array(0x4000 * DDHDMULT); for (var i = 0; i < 0x4000 * DDHDMULT; i++) this.tracktiming[i] = 0;
	this.skipoffset = 0;
	this.mfmpos = 0;
	this.indexoffset = 0;
	this.tracklen = 0;
	this.prevtracklen = 0;
	this.trackspeed = 0;
	this.num_tracks = 0;
	this.num_secs = 0;
	this.hard_num_cyls = 0;
	this.dskchange = false;
	this.dskchange_time = 0;
	this.dskready = false;
	this.dskready_up_time = 0;
	this.dskready_down_time = 0;
	this.writtento = 0;
	this.steplimit = 0;
	this.steplimitcycle = 0;
	this.indexhack = 0;
	this.indexhackmode = 0;
	this.ddhd = 0;
	this.idbit = 0;
	this.drive_id_scnt = 0;
	this.drive_id = DRIVE_ID_NONE;
	this.useturbo = false;
	this.floppybitcounter = 0;
	
	/*this.id_name = function () {
      switch (this.drive_id) {
         case DRIVE_ID_35HD :
            return '3.5HD';
         case DRIVE_ID_525SD:
            return '5.25SD';
         case DRIVE_ID_35DD :
            return '3.5DD';
         case DRIVE_ID_NONE :
            return 'NONE';
      }
      return 'UNKNOWN';
   };*/

	this.set_id = function () {
      switch (AMIGA.config.floppy.drive[this.num].type) {
         case SAEV_Config_Floppy_Type_35_HD:
         {
            if (FLOPPY_DRIVE_HD) {
               if (!this.diskfile || this.ddhd <= 1)
                  this.drive_id = DRIVE_ID_35DD;
               else
                  this.drive_id = DRIVE_ID_35HD;
            } else
               this.drive_id = DRIVE_ID_35DD;

            break;
         }
         case SAEV_Config_Floppy_Type_35_DD:
            this.drive_id = DRIVE_ID_35DD;
            break;
         case SAEV_Config_Floppy_Type_525_SD:
            this.drive_id = DRIVE_ID_525SD;
            break;
         case SAEV_Config_Floppy_Type_None:
            this.drive_id = DRIVE_ID_NONE;
            break;
         default:
            this.drive_id = DRIVE_ID_35DD;
      }
      //BUG.info('Drive.set_id() DF%d set to %s', this.num, this.id_name());
   };
	
	this.get_floppy_speed2 = function () {
      var m = Math.floor(get_floppy_speed() * this.tracklen / (2 * 8 * (AMIGA.config.video.ntsc ? 6399 : 6334) * this.ddhd));
      if (m <= 0) m = 1;
      return m;
   };
	
	this.reset = function () {
      //BUG.info('Drive.reset() DF%d', this.num);
      this.filetype = ADF_NONE;
      this.diskfile = null;
      //this.writediskfile = null;
      this.motoroff = true;
      this.idbit = 0;
      this.drive_id = 0;
      this.drive_id_scnt = 0;
      this.indexhackmode = 0;
      this.dskchange_time = 0;
      this.dskchange = false;
      this.dskready_down_time = 0;
      this.dskready_up_time = 0;
      this.buffered_cyl = -1;
      this.buffered_side = -1;
      if (this.num == 0 && AMIGA.config.floppy.drive[this.num].type == SAEV_Config_Floppy_Type_35_DD)
         this.indexhackmode = 1;
      this.set_id();
   };
	
	this.updatemfmpos = function () {
      if (this.prevtracklen)
         this.mfmpos = this.mfmpos * Math.floor(Math.floor(this.tracklen * 1000 / this.prevtracklen) / 1000);
      this.mfmpos %= this.tracklen;
      this.prevtracklen = this.tracklen;
   };
	
	this.reset_track = function () {
      //BUG.info('Drive.reset_track() DF%d', this.num);
      this.tracklen = (AMIGA.config.video.ntsc ? 6399 : 6334) * this.ddhd * 2 * 8;
      this.trackspeed = get_floppy_speed();
      this.buffered_side = -1;
      this.skipoffset = -1;
      this.tracktiming[0] = 0;
      for (var i = 0; i < (AMIGA.config.video.ntsc ? 6399 : 6334) * this.ddhd; i++) this.bigmfmbuf[i] = 0xaaaa; //memset (this.bigmfmbuf, 0xaa, (AMIGA.config.video.ntsc ? 6399 : 6334) * 2 * this.ddhd);
      this.updatemfmpos();
   };
	
	function strncmp_as(str1, str2, n) {
		for (var i = 0; i < n; i++) {
			if (str1[i] != (str2.charCodeAt(i) & 0xff))
				return 1;
		}
		return 0;
	}	
	/*function strncmp_aa(str1, str2, n) {
		for (var i = 0; i < n; i++) {
			if (str1[i] != str2[i])
				return 1;
		}
		return 0;
	}*/
	this.insert = function () {
      //BUG.info('DF%d.insert()', this.num);
      //const exeheader = [0x00,0x00,0x03,0xf3,0x00,0x00,0x00,0x00];

      this.filetype = ADF_NONE;
      this.diskfile = null;
      //this.writediskfile = null;
      this.ddhd = 1;
      this.num_secs = 0;
      this.hard_num_cyls = AMIGA.config.floppy.drive[this.num].type == SAEV_Config_Floppy_Type_525_SD ? 40 : 80;
      this.tracktiming[0] = 0;
      this.useturbo = false;
      this.indexoffset = 0;

      var size = 0;
      if (this.diskdata !== null) {
         this.diskfile = new Uint8Array(this.diskdata.length);
         for (var i = 0; i < this.diskdata.length; i++)
            this.diskfile[i] = this.diskdata[i];
         size = this.diskfile.length;
      }

      if (!this.motoroff) {
         this.dskready_up_time = DSKREADY_UP_TIME;
         this.dskready_down_time = 0;
      }
      if (this.diskfile === null) {
         this.reset_track();
         return 0;
      }

      if (strncmp_as(this.diskfile, 'UAE-1ADF', 8) == 0) {
         //BUG.info('DF%d.insert() UAE-1ADF', this.num);

         //read_header_ext2 (drv->diskfile, drv->trackdata, &drv->num_tracks, &drv->ddhd);
         this.filetype = ADF_EXT2;
         this.num_secs = 11;
         if (this.ddhd > 1)
            this.num_secs = 22;
      }
      else if (strncmp_as(this.diskfile, 'UAE--ADF', 8) == 0) {
         //BUG.info('DF%d.insert() UAE--ADF', this.num);
         var offs = 160 * 4 + 8;

         this.wrprot = true;
         this.filetype = ADF_EXT1;
         this.num_tracks = 160;
         this.num_secs = 11;

         for (var i = 0; i < this.num_tracks; i++) {
            var buffer = [];
            for (var j = 0; j < 4; j++)
               buffer[j] = this.diskfile[8 + i * 4 + j];

            this.trackdata[i].sync = buffer[0] * 256 + buffer[1];
            this.trackdata[i].len = buffer[2] * 256 + buffer[3];
            this.trackdata[i].offs = offs;

            if (this.trackdata[i].sync == 0) {
               this.trackdata[i].type = TRACK_AMIGADOS;
               this.trackdata[i].bitlen = 0;
            } else {
               this.trackdata[i].type = TRACK_RAW1;
               this.trackdata[i].bitlen = this.trackdata[i].len * 8;
            }
            offs += this.trackdata[i].len;
         }
      }
      /*else if (strncmp_aa(this.diskfile, exeheader, 8) == 0) {
       //BUG.info('DF%d.insert() EXE', this.num);
       //struct zfile *z = zfile_fopen_empty(NULL, "", 512 * 1760);
       //createimagefromexe (drv->diskfile, z);
       //zfile_fclose (drv->diskfile);

       //this.diskfile = z;
       this.filetype = ADF_NORMAL;
       this.num_tracks = 160;
       this.num_secs = 11;

       for (var i = 0; i < this.num_tracks; i++) {
       this.trackdata[i].type = TRACK_AMIGADOS;
       this.trackdata[i].len = 512 * this.num_secs;
       this.trackdata[i].bitlen = 0;
       this.trackdata[i].offs = i * 512 * this.num_secs;
       }
       this.useturbo = true;
       }*/
      else {
         this.filetype = ADF_NORMAL;

         /* high-density or diskspare disk? */
         var ds = false;
         this.num_tracks = 0;
         if (size > 160 * 11 * 512 + 511) { /* larger than standard adf? */
            for (var i = 80; i <= 83; i++) {
               if (size == i * 22 * 512 * 2) { // HD
                  this.ddhd = 2;
                  this.num_tracks = Math.floor(size / (512 * (this.num_secs = 22)));
                  break;
               }
               if (size == i * 11 * 512 * 2) { // >80 cyl DD
                  this.num_tracks = Math.floor(size / (512 * (this.num_secs = 11)));
                  break;
               }
               if (size == i * 12 * 512 * 2) { // ds 12 sectors
                  this.num_tracks = Math.floor(size / (512 * (this.num_secs = 12)));
                  ds = true;
                  break;
               }
               if (size == i * 24 * 512 * 2) { // ds 24 sectors
                  this.num_tracks = Math.floor(size / (512 * (this.num_secs = 24)));
                  this.ddhd = 2;
                  ds = true;
                  break;
               }
            }
            if (this.num_tracks == 0) {
               this.num_tracks = Math.floor(size / (512 * (this.num_secs = 22)));
               this.ddhd = 2;
            }
         } else
            this.num_tracks = Math.floor(size / (512 * (this.num_secs = 11)));

         if (!ds && this.num_tracks > MAX_TRACKS)
            Fatal(SAEE_Disk_File_Too_Big, sprintf('The diskfile in DF%d is too big. (%d tracks)', this.num, this.num_tracks));

         for (var i = 0; i < this.num_tracks; i++) {
            this.trackdata[i].type = ds ? TRACK_DISKSPARE : TRACK_AMIGADOS;
            this.trackdata[i].len = 512 * this.num_secs;
            this.trackdata[i].bitlen = 0;
            this.trackdata[i].offs = i * 512 * this.num_secs;
         }
      }
      this.set_id();
      this.fill_bigbuf(AMIGA.disk.side, 1);

      this.mfmpos = uaerand();
      this.mfmpos |= (uaerand() << 16);
      this.mfmpos %= this.tracklen;
      this.prevtracklen = 0;
      return 1;
   };
	
	this.eject = function () {
      //BUG.info('DF%d.eject()', this.num);
      this.filetype = ADF_NONE;
      this.diskfile = null;
      //this.writediskfile = null;
      this.dskchange = true;
      this.dskchange_time = 0;
      this.dskready = false;
      this.dskready_up_time = 0;
      this.dskready_down_time = 0;
      this.ddhd = 1;
      this.set_id();
   };
	
	this.is_empty = function () {
      return this.diskfile === null;
   };

	this.set_steplimit = function () {
      this.steplimit = 10;
      this.steplimitcycle = AMIGA.events.currcycle;
   };
	
	this.step = function () {
      if (!this.is_empty())
         this.dskchange = 0;

      if (this.steplimit && AMIGA.events.currcycle - this.steplimitcycle < MIN_STEPLIMIT_CYCLE) {
         BUG.info('Drive.step() DF%d, ignoring step %d', this.num, Math.floor((AMIGA.events.currcycle - this.steplimitcycle) * CYCLE_UNIT_INV));
         return;
      }

      this.set_steplimit();

      if (AMIGA.disk.direction) {
         if (this.cyl)
            this.cyl--;
         //else BUG.info('Drive.step() DF%d, program tried to step beyond track zero', this.num); //'no-click' programs does that
      } else {
         var maxtrack = this.hard_num_cyls;
         if (this.cyl < maxtrack + 3)
            this.cyl++;
         //if (this.cyl >= maxtrack) BUG.info('Drive.step() DF%d, program tried to step over track %d', this.num, maxtrack); //'no-click' programs does that
      }
      AMIGA.disk.rand_shifter();
      AMIGA.config.hooks.floppy_step(this.num, this.cyl);
   };

	this.is_track0 = function () {
      return this.cyl == 0;
   };

	this.is_writeprotected = function () {
      return this.wrprot || this.diskfile === null;
   };

	this.is_running = function () {
      return !this.motoroff;
   };
	
	this.set_motor = function (off) {
      if (this.motoroff && !off) {
         this.dskready_up_time = DSKREADY_UP_TIME;
         AMIGA.disk.rand_shifter();
      }
      if (!this.motoroff && off) {
         this.drive_id_scnt = 0;
         /* Reset id shift reg counter */
         this.dskready_down_time = DSKREADY_DOWN_TIME;

         if (AMIGA.config.cpu.model <= 68010 && AMIGA.config.cpu.speed == SAEV_Config_CPU_Speed_Original) {
            this.motordelay = true;
            AMIGA.events.newevent2(30, this.num, function (v) {
               AMIGA.disk.motordelay_func(v);
            });
         }
      }
      this.motoroff = off;
      if (this.motoroff) {
         this.dskready = false;
         this.dskready_up_time = 0;
      } else {
         this.dskready_down_time = 0;
      }
   };
	
	/* get one bit from MFM bit stream */
	this.getonebit = function (mfmpos) {
      return (this.bigmfmbuf[mfmpos >> 4] & (1 << (15 - (mfmpos & 15)))) ? 1 : 0;
   };
	this.decode_amigados = function () {
      var gap_len = AMIGA.config.video.ntsc ? 415 : 350;
      var tr = this.cyl * 2 + AMIGA.disk.side;
      var len = this.num_secs * 544 + gap_len;
      var bigmfmpos = gap_len;
      var sec;
      var i;

      for (i = 0; i < len; i++)
         this.bigmfmbuf[i] = 0xaaaa;

      this.skipoffset = Math.floor((gap_len * 8) / 3) * 2;
      this.tracklen = len * 2 * 8;

      for (sec = 0; sec < this.num_secs; sec++) {
         var secbuf = new Uint8Array(544);
         var mfmbuf = new Uint16Array(544);
         var deven, dodd;
         var hck = 0, dck = 0;

         secbuf[0] = secbuf[1] = 0x00;
         secbuf[2] = secbuf[3] = 0xa1;
         secbuf[4] = 0xff;
         secbuf[5] = tr;
         secbuf[6] = sec;
         secbuf[7] = this.num_secs - sec;

         for (i = 8; i < 24; i++)
            secbuf[i] = 0;

         //read_floppy_data (this.diskfile, ti, sec * 512, &secbuf[32], 512);
         {
            var offset = this.trackdata[tr].offs + sec * 512;
            for (i = 0; i < 512; i++) secbuf[32 + i] = this.diskfile[offset + i];
         }

         mfmbuf[0] = mfmbuf[1] = 0xaaaa;
         mfmbuf[2] = mfmbuf[3] = 0x4489;

         deven = ((secbuf[4] << 24) | (secbuf[5] << 16) | (secbuf[6] << 8) | (secbuf[7])) >>> 0;
         dodd = deven >>> 1;
         deven &= 0x55555555;
         dodd &= 0x55555555;

         mfmbuf[4] = dodd >>> 16;
         mfmbuf[5] = dodd & 0xffff;
         mfmbuf[6] = deven >>> 16;
         mfmbuf[7] = deven & 0xffff;

         for (i = 8; i < 48; i++)
            mfmbuf[i] = 0xaaaa;
         for (i = 0; i < 512; i += 4) {
            deven = ((secbuf[i + 32] << 24) | (secbuf[i + 33] << 16) | (secbuf[i + 34] << 8) | (secbuf[i + 35])) >>> 0;
            dodd = deven >>> 1;
            deven &= 0x55555555;
            dodd &= 0x55555555;
            mfmbuf[(i >> 1) + 32] = dodd >>> 16;
            mfmbuf[(i >> 1) + 33] = dodd & 0xffff;
            mfmbuf[(i >> 1) + 256 + 32] = deven >>> 16;
            mfmbuf[(i >> 1) + 256 + 33] = deven & 0xffff;
         }

         for (i = 4; i < 24; i += 2)
            hck ^= ((mfmbuf[i] << 16) | mfmbuf[i + 1]) >>> 0;

         deven = dodd = hck;
         dodd >>>= 1;
         mfmbuf[24] = dodd >>> 16;
         mfmbuf[25] = dodd & 0xffff;
         mfmbuf[26] = deven >>> 16;
         mfmbuf[27] = deven & 0xffff;

         for (i = 32; i < 544; i += 2)
            dck ^= ((mfmbuf[i] << 16) | mfmbuf[i + 1]) >>> 0;

         deven = dodd = dck;
         dodd >>>= 1;
         mfmbuf[28] = dodd >>> 16;
         mfmbuf[29] = dodd & 0xffff;
         mfmbuf[30] = deven >>> 16;
         mfmbuf[31] = deven & 0xffff;

         //mfmcode (mfmbuf + 4, 544 - 4); static this.mfmcode (var * mfm, var words)
         {
            var words = 540, lastword = 0, pos = 4;
            while (words--) {
               //var v = *mfm;
               var v = mfmbuf[pos];
               var lv = ((lastword << 16) | v) >>> 0;
               var nlv = (0x55555555 & ~lv) >>> 0;
               var mfmbits = (((nlv << 1) & (nlv >>> 1)) >>> 0) & 0xffff;
               //*mfm++ = v | mfmbits;
               mfmbuf[pos] = v | mfmbits;
               lastword = v;
               pos++;
            }
         }

         for (i = 0; i < 544; i++) {
            this.bigmfmbuf[bigmfmpos % len] = mfmbuf[i];
            bigmfmpos++;
         }
      }
   };

	this.decode_raw = function () {
      var tr = this.cyl * 2 + AMIGA.disk.side;

      var base_offset = this.trackdata[tr].type == TRACK_RAW ? 0 : 1;
      this.tracklen = this.trackdata[tr].bitlen + 16 * base_offset;
      this.bigmfmbuf[0] = this.trackdata[tr].sync;
      var len = Math.floor((this.trackdata[tr].bitlen + 7) / 8);
      var buf = new Uint8Array(len);

      //read_floppy_data (this.diskfile, ti, 0, (var*)(this.bigmfmbuf + base_offset), Math.floor((ti->bitlen + 7) / 8));
      {
         var offset = this.trackdata[tr].offs;
         for (var i = 0; i < len; i++)
            buf[i] = this.diskfile[offset + i];
      }

      for (var i = base_offset; i < Math.floor((this.tracklen + 15) / 16); i++)
         this.bigmfmbuf[i] = 256 * buf[(i - base_offset) << 1] + buf[((i - base_offset) << 1) + 1];

      //BUG.info('DF%d.decode_raw() rawtrack %d, offset %d', this.num, tr, this.trackdata[tr].offs);
   };
	
	this.fill_bigbuf = function (force) {
      var tr = this.cyl * 2 + AMIGA.disk.side;

      if (!this.diskfile || tr >= this.num_tracks) {
         this.reset_track();
         return;
      }
      if (!force && this.buffered_cyl == this.cyl && this.buffered_side == AMIGA.disk.side)
         return;

      this.indexoffset = 0;
      this.tracktiming[0] = 0;
      this.skipoffset = -1;

      /*if (this.writediskfile && this.writetrackdata[tr].bitlen > 0) {
       var i;
       Track *wti = &this.writetrackdata[tr];
       this.tracklen = wti->bitlen;
       read_floppy_data (this.writediskfile, wti, 0, (var*)this.bigmfmbuf, Math.floor((wti->bitlen + 7) / 8));
       for (i = 0; i < Math.floor((this.tracklen + 15) / 16); i++) {
       var *mfm = this.bigmfmbuf + i;
       var *data = (var *) mfm;
       *mfm = 256 * *data + *(data + 1);
       }
       write_log ('track %d, length %d read from \'saveimage\'\n', tr, this.tracklen);
       } else*/
      if (this.trackdata[tr].type == TRACK_NONE) {
      }
      else if (this.trackdata[tr].type == TRACK_AMIGADOS)
         this.decode_amigados();
      else if (this.trackdata[tr].type == TRACK_DISKSPARE)
         this.decode_diskspare();
      else if (this.trackdata[tr].type == TRACK_PCDOS)
         this.decode_pcdos();
      else
         this.decode_raw();

      this.buffered_side = AMIGA.disk.side;
      this.buffered_cyl = this.cyl;
      if (this.tracklen == 0) {
         this.tracklen = (AMIGA.config.video.ntsc ? 6399 : 6334) * this.ddhd * 2 * 8;
         for (var i = 0; i < (AMIGA.config.video.ntsc ? 6399 : 6334) * this.ddhd; i++) this.bigmfmbuf[i] = 0; //memset (this.bigmfmbuf, 0, (AMIGA.config.video.ntsc ? 6399 : 6334) * 2 * this.ddhd);
      }

      this.trackspeed = this.get_floppy_speed2();
      this.updatemfmpos();
   };

	this.getmfmword = function (mbuf, shift) {
      return (((this.bigmfmbuf[mbuf] << shift) | (this.bigmfmbuf[mbuf + 1] >>> (16 - shift))) >>> 0) & 0xffff;
   };
	this.getmfmlong = function (mbuf, shift) {
      return (((this.getmfmword(mbuf, shift) << 16) | this.getmfmword(mbuf + 1, shift)) >>> 0) & 0x55555555;
   };
	this.decode_buffer = function (checkmode) {
      var mbuf = 0;
      var cyl = this.cyl;
      var drvsec = this.num_secs;
      var ddhd = this.ddhd;
      var filetype = this.filetype;

      var i, secwritten = 0;
      var fwlen = (AMIGA.config.video.ntsc ? 6399 : 6334) * ddhd;
      var length = 2 * fwlen;
      var odd, even, chksum, id, dlong;
      var secbuf = new Uint8Array(544);
      var sectable = new Array(22);
      var mend = length - (4 + 16 + 8 + 512);
      var shift = 0;

      for (i = 0; i < sectable.length; i++) sectable[i] = 0; //memset (sectable, 0, sizeof (sectable));
      for (i = 0; i < fwlen; i++) this.bigmfmbuf[fwlen + i] = this.bigmfmbuf[i]; //memcpy (mbuf + fwlen, mbuf, fwlen * sizeof(uae_u16));

      while (secwritten < drvsec) {
         while (this.getmfmword(mbuf, shift) != 0x4489) {
            if (mbuf >= mend) return 1;
            shift++;
            if (shift == 16) {
               shift = 0;
               mbuf++;
            }
         }
         while (this.getmfmword(mbuf, shift) == 0x4489) {
            if (mbuf >= mend) return 10;
            mbuf++;
         }

         odd = this.getmfmlong(mbuf, shift);
         even = this.getmfmlong(mbuf + 2, shift);
         mbuf += 4;
         id = (((odd << 1) | even) >>> 0) & 0xffffffff;

         var trackoffs = (id & 0xff00) >>> 8;
         if (trackoffs + 1 > drvsec) {
            BUG.info('DF%d.decode_buffer() weird sector number %d', this.num, trackoffs);
            if (filetype == ADF_EXT2) return 2;
            continue;
         }
         chksum = (odd ^ even) >>> 0;
         for (i = 0; i < 4; i++) {
            odd = this.getmfmlong(mbuf, shift);
            even = this.getmfmlong(mbuf + 8, shift);
            mbuf += 2;

            dlong = (((odd << 1) | even) >>> 0) & 0xffffffff;
            if (dlong && !checkmode) {
               if (filetype == ADF_EXT2) return 6;
               secwritten = -200;
            }
            chksum ^= odd ^ even;
            chksum &= 0xffffffff;
         }
         mbuf += 8;
         odd = this.getmfmlong(mbuf, shift);
         even = this.getmfmlong(mbuf + 2, shift);
         mbuf += 4;
         if (((((odd << 1) | even) >>> 0) & 0xffffffff) != chksum || ((id & 0x00ff0000) >> 16) != cyl * 2 + AMIGA.disk.side) {
            BUG.info('DF%d.decode_buffer() checksum error on sector %d header', this.num, trackoffs);
            if (filetype == ADF_EXT2) return 3;
            continue;
         }
         odd = this.getmfmlong(mbuf, shift);
         even = this.getmfmlong(mbuf + 2, shift);
         mbuf += 4;
         chksum = (((odd << 1) | even) >>> 0) & 0xffffffff;
         for (i = 0; i < 512; i += 4) {
            odd = this.getmfmlong(mbuf, shift);
            even = this.getmfmlong(mbuf + 256, shift);
            mbuf += 2;
            dlong = (((odd << 1) | even) >>> 0) & 0xffffffff;
            secbuf[32 + i] = (dlong >>> 24) & 0xff;
            secbuf[33 + i] = (dlong >>> 16) & 0xff;
            secbuf[34 + i] = (dlong >>> 8) & 0xff;
            secbuf[35 + i] = dlong & 0xff;
            chksum ^= odd ^ even;
            chksum &= 0xffffffff;
         }
         if (chksum) {
            BUG.info('DF%d.decode_buffer() sector %d, data checksum error', this.num, trackoffs);
            if (filetype == ADF_EXT2) return 4;
            continue;
         }
         mbuf += 256;
         sectable[trackoffs] = 1;
         secwritten++;

         for (i = 0; i < 512; i++) this.writebuffer[trackoffs * 512 + i] = secbuf[32 + i]; //memcpy (writebuffer + trackoffs * 512, secbuf + 32, 512);
      }
      if (filetype == ADF_EXT2 && (secwritten == 0 || secwritten < 0))
         return 5;
      if (secwritten == 0) BUG.info('DF%d.decode_buffer() unsupported format', this.num);
      if (secwritten < 0) BUG.info('DF%d.decode_buffer() sector labels ignored', this.num);

      return 0;
   };
	
	this.write_adf_amigados = function () {
      //var drvsec, i;
      //var sectable[MAX_SECTORS];

      if (this.decode_buffer(0)) //drv->bigmfmbuf, drv->cyl, drv->num_secs, drv->ddhd, drv->filetype, &drvsec, sectable, 0))
         return 2;
      //if (!drvsec) return 2;

      /*for (i = 0; i < drvsec; i++) {
       zfile_fseek (drv->diskfile, drv->trackdata[drv->cyl * 2 + AMIGA.disk.side].offs + i * 512, SEEK_SET);
       zfile_fwrite (writebuffer + i * 512, sizeof (var), 512, drv->diskfile);
       }*/
      for (var i = 0; i < this.num_secs; i++) {
         var offset = this.trackdata[this.cyl * 2 + AMIGA.disk.side].offs + i * 512;
         for (var j = 0; j < 512; j++)
            this.diskfile[offset + j] = this.diskdata[offset + j] = this.writebuffer[i * 512 + j];
      }
      return 0;
   };

	this.write_data = function () {
      var tr = this.cyl * 2 + AMIGA.disk.side;

      if (this.is_writeprotected() || this.trackdata[tr].type == TRACK_NONE) {
         this.buffered_side = 2;
         return;
      }
      //if (this.writediskfile) drive_write_ext2 (this.bigmfmbuf, this.writediskfile, &this.writetrackdata[tr], LONGWRITEMODE ? dsklength2 * 8 : this.tracklen);

      switch (this.filetype) {
         case ADF_NORMAL:
         {
            if (this.write_adf_amigados()) {
               //notify_user (NUMSG_NEEDEXT2);
            }
            return;
         }
      }
      this.tracktiming[0] = 0;
   };
	
	this.is_unformatted = function () {
      var tr = this.cyl * 2 + AMIGA.disk.side;
      if (tr >= this.num_tracks) return true;
      if (this.filetype == ADF_EXT2 && this.trackdata[tr].bitlen == 0 && this.trackdata[tr].type != TRACK_AMIGADOS)
         return true;

      return this.trackdata[tr].type == TRACK_NONE;
   };
	
	this.vsync = function() {
		if (this.dskready_down_time > 0)
			this.dskready_down_time--;
		/* emulate drive motor turn on time */
		if (this.dskready_up_time > 0 && !this.is_empty()) {
			if ((--this.dskready_up_time) == 0 && !this.motoroff)
				this.dskready = true;
		}
		/* delay until new disk image is inserted */
		if (this.dskchange_time) {
			if ((--this.dskchange_time) == 0)
				this.insert();
		}
	}
}

function Disk() {
	this.side = 0;
	this.direction = 0;
	var selected = 15;
	var disabled = 0;	
	var dskdmaen = DSKDMA_OFF;
	var dsklength = 0;
	var dsklength2 = 0;
	var dsklen = 0;
	var dskbytr_val = 0;
	var dskpt = 0;
	var fifo = new Array(3); for (var i = 0; i < 3; i++) fifo[i] = 0;   
	var fifo_inuse = new Array(3); for (var i = 0; i < 3; i++) fifo_inuse[i] = 0;   
	var fifo_filled = false;
	var dma_enable = false;
	var bitoffset = 0;
	var word = 0;
	var dsksync = 0;
	var dsksync_cycles = 0;
	var disk_hpos = 0;
	var disk_jitter = 0;
	var indexdecay = 0;
	var prev_data = 0;
	var prev_step = 0;
	var linecounter = 0;
	var random_bits_min = 1;
	var random_bits_max = 3;
	var ledstate = new Array(MAX_FLOPPY_DRIVES); for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) ledstate[i] = false;		
	var floppy = new Array(MAX_FLOPPY_DRIVES); for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) floppy[i] = new Drive(i);

	this.setup = function () {
   };

	this.reset = function () {
      disk_hpos = 0;
      dskdmaen = DSKDMA_OFF;
      disabled = 0;
      for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) {
         floppy[i].reset();
         ledstate[i] = false;
         AMIGA.config.hooks.floppy_motor(i, false);
         AMIGA.config.hooks.floppy_step(i, floppy[i].cyl);
      }
      this.DSKLEN(0, 0);
      for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) {
         this.eject(i);
         this.insert(i);
      }
   };
	
	this.rand_shifter = function () {
      var r = ((uaerand() >>> 4) & 7) + 1;
      while (r-- > 0) {
         word <<= 1;
         word |= (uaerand() & 0x1000) ? 1 : 0;
         bitoffset++;
         bitoffset &= 15;
      }
   };

	this.setdskchangetime = function (num, dsktime) {
      if (floppy[num].dskchange_time > 0)
         return;

      for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) {
         if (floppy[i].num != num && floppy[i].dskchange_time > 0 && floppy[i].dskchange_time + 1 >= dsktime)
            dsktime = floppy[i].dskchange_time + 1;
      }
      floppy[num].dskchange_time = dsktime;
      //BUG.info('Disk.setdskchangetime() delayed insert enable %d', dsktime);
   };

	this.insert2 = function (num, forced) {
      //BUG.info('Disk.insert() DF%d', num);

      if (AMIGA.config.floppy.drive[num].name && AMIGA.config.floppy.drive[num].data) {
         floppy[num].diskdata = new Uint8Array(AMIGA.config.floppy.drive[num].data.length);
         for (var i = 0; i < AMIGA.config.floppy.drive[num].data.length; i++)
            floppy[num].diskdata[i] = AMIGA.config.floppy.drive[num].data.charCodeAt(i) & 0xff;
      }

      if (forced) {
         if (!floppy[num].is_empty())
            floppy[num].eject();
         floppy[num].insert(null);
         return;
      }

      if (!floppy[num].is_empty() || floppy[num].dskchange_time > 0) {
         floppy[num].eject();
         this.setdskchangetime(num, 100);
      } else
         this.setdskchangetime(num, 1);
   };
	this.insert = function (num) {
      this.insert2(num, false);
   };
			
	this.eject = function (num) {
      floppy[num].eject();
      floppy[num].diskdata = null;
   };
	
	this.is_empty = function (num) {
      return floppy[num].is_empty();
   };

	this.select_fetch = function (data) {
      selected = (data >> 3) & 15;
      this.side = 1 - ((data >> 2) & 1);
      this.direction = (data >> 1) & 1;
   };
	
	this.select_set = function (data) {
      prev_data = data;
      prev_step = data & 1;

      this.select_fetch(data);
   };
	
	this.select = function (data) {
      //BUG.info('Disk.select() $%02x', data);
      var step_pulse, prev_selected, dr;

      prev_selected = selected;
      this.select_fetch(data);
      step_pulse = data & 1;

      if ((prev_data & 0x80) != (data & 0x80)) {
         for (dr = 0; dr < 4; dr++) {
            if (floppy[dr].indexhackmode > 1 && !(selected & (1 << dr))) {
               floppy[dr].indexhack = 1;
               BUG.info('Disk.select() indexhack!');
            }
         }
      }
      if (prev_step != step_pulse) {
         prev_step = step_pulse;
         if (prev_step) {
            for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
               if (!((prev_selected | disabled) & (1 << dr))) {
                  floppy[dr].step();
                  if (floppy[dr].indexhackmode > 1 && (data & 0x80))
                     floppy[dr].indexhack = 1;
               }
            }
         }
      }
      for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
         if (!(selected & (1 << dr)) && (prev_selected & (1 << dr))) {
            floppy[dr].drive_id_scnt++;
            floppy[dr].drive_id_scnt &= 31;
            floppy[dr].idbit = (floppy[dr].drive_id & (1 << (31 - floppy[dr].drive_id_scnt))) ? 1 : 0;

            if (!(disabled & (1 << dr))) {
               if ((prev_data & 0x80) == 0 || (data & 0x80) == 0)
                  floppy[dr].set_motor(0); /* motor off: if motor bit = 0 in prevdata or data -> turn motor on */
               else if (prev_data & 0x80)
                  floppy[dr].set_motor(1);
               /* motor on: if motor bit = 1 in prevdata only (motor flag state in data has no effect) -> turn motor off */
            }
            if (dr == 0)
               floppy[dr].idbit = 0;
         }
      }
      for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
         var state = (!(selected & (1 << dr))) | !floppy[dr].motoroff;
         if (ledstate[dr] != state) {
            ledstate[dr] = state;
            AMIGA.config.hooks.floppy_motor(dr, ledstate[dr]);
         }
      }
      prev_data = data;
   };

	this.status = function () {
      var st = 0x3c;

      for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
         if (!((selected | disabled) & (1 << dr))) {
            if (floppy[dr].is_running()) {
               if (floppy[dr].dskready && !floppy[dr].indexhack)
                  st &= ~0x20;
            } else {
               if (dr > 0) {
                  if (floppy[dr].idbit)
                     st &= ~0x20;
               } else {
                  /* non-ID internal drive: mirror real dskready */
                  if (floppy[dr].dskready)
                     st &= ~0x20;
               }
               /* dskrdy needs some cycles after switching the motor off.. (Pro Tennis Tour) */
               if (dr == 0 && floppy[dr].motordelay)
                  st &= ~0x20;
            }
            if (floppy[dr].is_track0())
               st &= ~0x10;
            if (floppy[dr].is_writeprotected())
               st &= ~8;
            if (floppy[dr].dskchange && AMIGA.config.floppy.drive[dr].type != SAEV_Config_Floppy_Type_525_SD)
               st &= ~4;
         } else if (!(selected & (1 << dr))) {
            if (floppy[dr].idbit)
               st &= ~0x20;
         }
      }
      //BUG.info('Disk.status() $%02x', st);
      return st;
   };
	
	this.fetchnextrevolution = function (num) {
      floppy[num].trackspeed = floppy[num].get_floppy_speed2();
   };

	this.handler = function (data) {
      var flag = data & 255;
      var disk_sync_cycle = data >> 8;
      //BUG.info('Disk.handler() data $%x, flag %d, disk_sync_cycle %d', data, flag, disk_sync_cycle);

      AMIGA.events.remevent(EV2_DISK);

      this.update(disk_sync_cycle);

      if (flag & (DISK_REVOLUTION << 0)) this.fetchnextrevolution(0);
      if (flag & (DISK_REVOLUTION << 1)) this.fetchnextrevolution(1);
      if (flag & (DISK_REVOLUTION << 2)) this.fetchnextrevolution(2);
      if (flag & (DISK_REVOLUTION << 3)) this.fetchnextrevolution(3);
      if (flag & DISK_WORDSYNC)
         AMIGA.INTREQ(INT_DSKSYN);
      if (flag & DISK_INDEXSYNC) {
         if (!indexdecay) {
            indexdecay = 2;
            //AMIGA.cia.setICR(CIA_B, 0x10, null);
            //AMIGA.cia.diskindex();
            AMIGA.cia.SetICRB(0x10, null);
         }
      }
   };
	
	this.update_jitter = function () {
      if (random_bits_max > 0)
         disk_jitter = ((uaerand() >>> 4) % (random_bits_max - random_bits_min + 1)) + random_bits_min;
      else
         disk_jitter = 0;
   };

	this.updatetrackspeed = function (num, mfmpos) {
      if (dskdmaen < DSKDMA_WRITE) {
         var t = floppy[num].tracktiming[Math.floor(mfmpos / 8)];
         floppy[num].trackspeed = Math.floor(floppy[num].get_floppy_speed2() * t / 1000);
         if (floppy[num].trackspeed < 700 || floppy[num].trackspeed > 3000) {
            BUG.info('Disk.updatetrackspeed() corrupted trackspeed value %d', floppy[num].trackspeed);
            floppy[num].trackspeed = 1000;
         }
      }
   };

	this.fifostatus = function () {
      if (fifo_inuse[0] && fifo_inuse[1] && fifo_inuse[2])
         return 1;
      else if (!fifo_inuse[0] && !fifo_inuse[1] && !fifo_inuse[2])
         return -1;
      return 0;
   };
	
	this.dmafinished = function () {
      //BUG.info('Disk.dmafinished()');
      AMIGA.INTREQ(INT_DSKBLK);
      //LONGWRITEMODE = 0;
      dskdmaen = DSKDMA_OFF;
      dsklength = 0;
   };

	this.readdma = function () {
      if (AMIGA.dmaen(DMAF_DSKEN) && bitoffset == 15 && dma_enable && dskdmaen == DSKDMA_READ && dsklength >= 0) {
         if (dsklength > 0) {
            if (dsklength == 1 && dsklength2 == 1) {
               this.dmafinished();
               return 0;
            }
            /* fast disk modes, just flush the fifo */
            if (AMIGA.config.floppy.speed > SAEV_Config_Floppy_Speed_Original && fifo_inuse[0] && fifo_inuse[1] && fifo_inuse[2]) {
               while (fifo_inuse[0]) {
                  var w = this.DSKDATR();
                  AMIGA.mem.store16(dskpt, w);
                  dskpt += 2;
               }
            }
            if (this.fifostatus() > 0) {
               BUG.info('Disk.readdma() fifo overflow detected, retrying...');
               return -1;
            } else {
               this.DSKDAT(word);
               dsklength--;
            }
         }
         return 1;
      }
      return 0;
   };

	this.update_read_nothing = function (floppybits) {
      //BUG.info('Disk.update_read_nothing() floppybits %d', floppybits);

      while (floppybits >= get_floppy_speed()) {
         word <<= 1;
         this.readdma();
         word &= 0xffff;
         if ((bitoffset & 7) == 7) {
            dskbytr_val = word & 0xff;
            dskbytr_val |= 0x8000;
         }
         bitoffset++;
         bitoffset &= 15;
         floppybits -= get_floppy_speed();
      }
   };

	/*static this.read_floppy_data (struct zfile *diskfile, Track *tid, var offset, var *dst, var len) {
		if (len == 0)
			return;
		zfile_fseek (diskfile, tid->offs + offset, SEEK_SET);
		zfile_fread (dst, 1, len, diskfile);
	}*/

	this.update_read = function (num, floppybits) {
      //BUG.info('Disk.update_read() DF%d, floppybits %d', num, floppybits);

      while (floppybits >= floppy[num].trackspeed) {
         var oldmfmpos = floppy[num].mfmpos;
         if (floppy[num].tracktiming[0])
            this.updatetrackspeed(num, floppy[num].mfmpos);

         word <<= 1;
         if (!floppy[num].is_empty()) {
            if (floppy[num].is_unformatted())
               word |= ((uaerand() & 0x1000) ? 1 : 0);
            else
               word |= floppy[num].getonebit(floppy[num].mfmpos);
         }
         word &= 0xffff;

         floppy[num].mfmpos++;
         floppy[num].mfmpos %= floppy[num].tracklen;
         if (floppy[num].mfmpos == floppy[num].indexoffset) {
            //if (floppy[num].indexhack) BUG.info('Disk.update_read() indexhack cleared');
            floppy[num].indexhack = 0;
         }
         if (floppy[num].mfmpos == floppy[num].skipoffset) {
            this.update_jitter();
            floppy[num].mfmpos += disk_jitter;
            floppy[num].mfmpos %= floppy[num].tracklen;
         }
         if (this.readdma() < 0) {
            floppy[num].mfmpos = oldmfmpos;
            return;
         }
         if ((bitoffset & 7) == 7) {
            dskbytr_val = word & 0xff;
            dskbytr_val |= 0x8000;
         }
         if (word == dsksync) {
            dsksync_cycles = AMIGA.events.currcycle + WORDSYNC_TIME * CYCLE_UNIT;
            if (dskdmaen != DSKDMA_OFF) {
               //if (!dma_enable) BUG.info('Disk.update_read() Sync match, DMA started at %d', floppy[num].mfmpos);
               dma_enable = true;
            }
            if (AMIGA.adkcon & 0x400) {
               bitoffset = 15;
            }
         }
         bitoffset++;
         bitoffset &= 15;
         floppybits -= floppy[num].trackspeed;
      }
   };
	
	this.update_write = function (num, floppybits) {
      var dr, drives = [0, 0, 0, 0];

      for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
         drives[dr] = 0;
         if (floppy[dr].motoroff)
            continue;
         if (selected & (1 << dr))
            continue;
         drives[dr] = 1;
      }
      while (floppybits >= floppy[num].trackspeed) {
         for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
            if (drives[dr]) {
               floppy[dr].mfmpos++;
               floppy[dr].mfmpos %= floppy[num].tracklen;
            }
         }
         if (AMIGA.dmaen(DMAF_DSKEN) && dskdmaen == DSKDMA_WRITE && dsklength > 0 && fifo_filled) {
            bitoffset++;
            bitoffset &= 15;
            if (!bitoffset) {
               /* fast disk modes, fill the fifo instantly */
               if (AMIGA.config.floppy.speed > SAEV_Config_Floppy_Speed_Original && !fifo_inuse[0] && !fifo_inuse[1] && !fifo_inuse[2]) {
                  while (!fifo_inuse[2]) {
                     var w = AMIGA.mem.load16(dskpt);
                     this.DSKDAT(w);
                     dskpt += 2;
                  }
               }
               if (this.fifostatus() >= 0) {
                  var w = this.DSKDATR();
                  for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
                     if (drives[dr]) {
                        floppy[dr].bigmfmbuf[floppy[dr].mfmpos >> 4] = w;
                        floppy[dr].bigmfmbuf[(floppy[dr].mfmpos >> 4) + 1] = 0x5555;
                        floppy[dr].writtento = 1;
                     }
                  }
                  dsklength--;
                  if (dsklength <= 0) {
                     this.dmafinished();
                     for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
                        floppy[dr].writtento = 0;
                        if (floppy[dr].motoroff)
                           continue;
                        if (selected & (1 << dr))
                           continue;
                        floppy[dr].write_data();
                     }
                  }
               }
            }
         }
         floppybits -= floppy[num].trackspeed;
      }
   };
	
	this.doupdate_predict = function (startcycle) {
      //BUG.info('Disk.doupdate_predict() startcycle %d', startcycle);
      var finaleventcycle = AMIGA.playfield.maxhpos << 8;
      var finaleventflag = 0;

      for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
         if (selected & (1 << dr))
            continue;
         else if (floppy[dr].motoroff || !floppy[dr].trackspeed)
            continue;

         var diskevent_flag = 0;
         var tword = word;
         var countcycle = startcycle + (floppy[dr].floppybitcounter % floppy[dr].trackspeed);
         var mfmpos = floppy[dr].mfmpos;
         while (countcycle < (AMIGA.playfield.maxhpos << 8)) {
            if (floppy[dr].tracktiming[0])
               this.updatetrackspeed(dr, mfmpos);
            if (dskdmaen != DSKDMA_WRITE || (dskdmaen == DSKDMA_WRITE && !dma_enable)) {
               tword <<= 1;
               if (!floppy[dr].is_empty()) {
                  if (floppy[dr].is_unformatted())
                     tword |= ((uaerand() & 0x1000) ? 1 : 0);
                  else
                     tword |= floppy[dr].getonebit(mfmpos);
               }
               tword &= 0xffff;
               if (tword == dsksync && dsksync != 0)
                  diskevent_flag |= DISK_WORDSYNC;
            }
            mfmpos++;
            mfmpos %= floppy[dr].tracklen;
            if (mfmpos == 0)
               diskevent_flag |= (DISK_REVOLUTION << dr);
            if (mfmpos == floppy[dr].indexoffset)
               diskevent_flag |= DISK_INDEXSYNC;
            if (dskdmaen != DSKDMA_WRITE && mfmpos == floppy[dr].skipoffset) {
               this.update_jitter();
               var skipcnt = disk_jitter;
               while (skipcnt-- > 0) {
                  mfmpos++;
                  mfmpos %= floppy[dr].tracklen;
                  if (mfmpos == 0)
                     diskevent_flag |= (DISK_REVOLUTION << dr);
                  if (mfmpos == floppy[dr].indexoffset)
                     diskevent_flag |= DISK_INDEXSYNC;
               }
            }
            if (diskevent_flag)
               break;
            countcycle += floppy[dr].trackspeed;
         }
         if (floppy[dr].tracktiming[0])
            this.updatetrackspeed(dr, floppy[dr].mfmpos);
         if (diskevent_flag && countcycle < finaleventcycle) {
            finaleventcycle = countcycle;
            finaleventflag = diskevent_flag;
         }
      }

      if (finaleventflag && (finaleventcycle >>> 8) < AMIGA.playfield.maxhpos)
         AMIGA.events.newevent(EV2_DISK, (finaleventcycle - startcycle) >>> 8, ((finaleventcycle >>> 8) << 8) | finaleventflag);
   };

	this.update = function (tohpos) {
      //if (tohpos != 227) BUG.info('Disk.update() disk_hpos %f, to hpos %d', disk_hpos / CYCLE_UNIT, tohpos);
      var dr;
      var cycles;

      if (disk_hpos < 0) {
         disk_hpos = -disk_hpos;
         return;
      }
      cycles = (tohpos << 8) - disk_hpos;
      if (cycles <= 0)
         return;

      disk_hpos += cycles;
      if (disk_hpos >= (AMIGA.playfield.maxhpos << 8))
         disk_hpos %= (1 << 8);

      for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
         if (floppy[dr].motoroff || !floppy[dr].tracklen || !floppy[dr].trackspeed)
            continue;
         floppy[dr].floppybitcounter += cycles;
         if (selected & (1 << dr)) {
            floppy[dr].mfmpos += Math.floor(floppy[dr].floppybitcounter / floppy[dr].trackspeed);
            floppy[dr].mfmpos %= floppy[dr].tracklen;
            floppy[dr].floppybitcounter %= floppy[dr].trackspeed;
            continue;
         }
         if (floppy[dr].diskfile)
            floppy[dr].fill_bigbuf(0);
         floppy[dr].mfmpos %= floppy[dr].tracklen;
      }
      var didaccess = 0;
      for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
         if (selected & (1 << dr))
            continue;
         else if (floppy[dr].motoroff || !floppy[dr].trackspeed)
            continue;
         /* write dma and wordsync enabled: read until wordsync match found */
         if (dskdmaen == DSKDMA_WRITE && dma_enable)
            this.update_write(dr, floppy[dr].floppybitcounter);
         else
            this.update_read(dr, floppy[dr].floppybitcounter);

         floppy[dr].floppybitcounter %= floppy[dr].trackspeed;
         didaccess = 1;
      }
      /* no floppy selected but read dma */
      if (!didaccess && dskdmaen == DSKDMA_READ)
         this.update_read_nothing(cycles);

      /* instantly finish dma if dsklen==0 and wordsync detected */
      if (dskdmaen != DSKDMA_OFF && dma_enable && dsklength2 == 0 && dsklength == 0)
         this.dmafinished();

      this.doupdate_predict(disk_hpos);
   };
	
	this.dma_debugmsg = function () {
      BUG.info('Disk.dma_debugmsg() LEN=%04x (%d) SYNC=%04x PT=%08x ADKCON=%04x', dsklength, dsklength, (AMIGA.adkcon & 0x400) ? dsksync : 0xffff, dskpt, AMIGA.adkcon);
   };
	
	this.start = function () {
      fifo_filled = false;
      for (var i = 0; i < 3; i++)
         fifo_inuse[i] = 0;

      for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
         if (!(selected & (1 << dr))) {
            if (dskdmaen == DSKDMA_WRITE) {
               floppy[dr].tracklen = LONGWRITEMODE ? FLOPPY_WRITE_MAXLEN : (AMIGA.config.video.ntsc ? 6399 : 6334) * floppy[dr].ddhd * 8 * 2;
               floppy[dr].trackspeed = get_floppy_speed();
               floppy[dr].skipoffset = -1;
               floppy[dr].updatemfmpos();
            }

            var tr = floppy[dr].cyl * 2 + this.side;
            if (floppy[dr].trackdata[tr].type == TRACK_RAW1) {
               floppy[dr].mfmpos = 0;
               bitoffset = 0;
            }
         }
         floppy[dr].floppybitcounter = 0;
      }
      dma_enable = (AMIGA.adkcon & 0x400) ? false : true;
   };

	this.check_change = function () {
      //if (currprefs.floppy_speed != changed_prefs.floppy_speed) currprefs.floppy_speed = changed_prefs.floppy_speed;
      /*for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) {
       if (currprefs.floppyslots[i].dfxtype != changed_prefs.floppyslots[i].dfxtype) {
       currprefs.floppyslots[i].dfxtype = changed_prefs.floppyslots[i].dfxtype;
       floppy[i].reset();
       }
       }*/
   };
	
	this.vsync = function () {
      this.check_change();

      for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) {
         //if (drv->dskchange_time == 0 && _tcscmp (currprefs.floppyslots[i].df, changed_prefs.floppyslots[i].df)) this.insert(i, changed_prefs.floppyslots[i].df);
         floppy[i].vsync();
      }
   };
	
	this.hsync = function () {
      for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
         if (floppy[dr].steplimit)
            floppy[dr].steplimit--;
      }
      if (indexdecay)
         indexdecay--;
      if (linecounter) {
         if (!(--linecounter))
            this.dmafinished();
         return;
      }
      this.update(AMIGA.playfield.maxhpos);
   };
	
	this.update_adkcon = function (v) {
      var vold = AMIGA.adkcon;
      var vnew = AMIGA.adkcon;
      if (v & 0x8000)
         vnew |= v & 0x7FFF;
      else
         vnew &= ~v;

      if ((vnew & 0x400) && !(vold & 0x400))
         bitoffset = 0;
   };
	
	this.motordelay_func = function (unit) {
      //BUG.info('Disk.motordelay_func(%d)', unit);
      floppy[unit].motordelay = false;
   };
	
	this.DSKLEN = function (v, hpos) {
      //BUG.info('Disk.DSKLEN() $%04x', v);
      var dr, prev = dsklen;

      this.update(hpos);

      if ((v & 0x8000) && (dsklen & 0x8000)) {
         dskdmaen = DSKDMA_READ;
         this.start();
      }
      if (!(v & 0x8000)) {
         if (dskdmaen != DSKDMA_OFF) {
            if (dskdmaen == DSKDMA_READ)
               BUG.info('Disk.DSKLEN() warning: Disk read DMA aborted, %d words left', dsklength);
            else if (dskdmaen == DSKDMA_WRITE) {
               BUG.info('Disk.DSKLEN() warning: Disk write DMA aborted, %d words left', dsklength);
               for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
                  if (floppy[dr].writtento) floppy[dr].write_data();
               }
            }
            dskdmaen = DSKDMA_OFF;
         }
      }
      dsklen = v;
      dsklength2 = dsklength = dsklen & 0x3fff;

      if (dskdmaen == DSKDMA_OFF)
         return;
      if (dsklength == 0 && dma_enable) {
         this.dmafinished();
         return;
      }
      if ((v & 0x4000) && (prev & 0x4000)) {
         if (dsklength == 0)
            return;
         if (dsklength == 1) {
            this.dmafinished();
            return;
         }
         dskdmaen = DSKDMA_WRITE;
         this.start();
      }

      var motormask = 0;
      for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
         floppy[dr].writtento = 0;
         if (floppy[dr].motoroff)
            continue;
         motormask |= 1 << dr;
         if ((selected & (1 << dr)) == 0)
            break;
      }
      var noselected = dr == 4;

      /* Try to make floppy access from Kickstart faster.  */
      if (dskdmaen != DSKDMA_READ && dskdmaen != DSKDMA_WRITE)
         return;

      /* no turbo mode if any selected drive has non-standard ADF */
      for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
         if (selected & (1 << dr))
            continue;
         if (floppy[dr].filetype != ADF_NORMAL)
            break;
      }
      if (dr < MAX_FLOPPY_DRIVES)
         return;

      {
         var done = false;
         for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
            var pos, i;

            if (selected & (1 << dr))
               continue;
            else if (floppy[dr].motoroff)
               continue;
            else if (!floppy[dr].useturbo && AMIGA.config.floppy.speed != SAEV_Config_Floppy_Speed_Turbo)
               continue;

            pos = floppy[dr].mfmpos & ~15;
            floppy[dr].fill_bigbuf(0);

            if (dskdmaen == DSKDMA_READ) { //TURBO read
               if (AMIGA.adkcon & 0x400) {
                  for (i = 0; i < floppy[dr].tracklen; i += 16) {
                     pos += 16;
                     pos %= floppy[dr].tracklen;
                     if (floppy[dr].bigmfmbuf[pos >> 4] == dsksync) {
                        pos += 16;
                        pos %= floppy[dr].tracklen;
                        break;
                     }
                  }
                  if (i >= floppy[dr].tracklen)
                     return;
               }
               while (dsklength-- > 0) {
                  AMIGA.mem.store16(dskpt, floppy[dr].bigmfmbuf[pos >> 4]);
                  dskpt += 2;
                  pos += 16;
                  pos %= floppy[dr].tracklen;
               }
               AMIGA.INTREQ(INT_DSKSYN);
               done = true;
            } else if (dskdmaen == DSKDMA_WRITE) { //TURBO write
               for (i = 0; i < dsklength; i++) {
                  floppy[dr].bigmfmbuf[pos >> 4] = AMIGA.mem.load16(dskpt + i * 2);
                  pos += 16;
                  pos %= floppy[dr].tracklen;
               }
               floppy[dr].write_data();
               done = true;
            }
         }
         if (!done && noselected) {
            while (dsklength-- > 0) {
               if (dskdmaen == DSKDMA_WRITE)
                  AMIGA.mem.load16(dskpt);
               else
                  AMIGA.mem.store16(dskpt, 0);
               dskpt += 2;
            }
            AMIGA.INTREQ(INT_DSKSYN);
            done = true;
         }
         if (done) {
            linecounter = 2;
            dskdmaen = DSKDMA_OFF;
         }
      }
   };
		
	this.DSKBYTR = function (hpos) {
      this.update(hpos);

      var v = dskbytr_val;
      dskbytr_val &= ~0x8000;
      if (word == dsksync && AMIGA.events.cycles_in_range(dsksync_cycles))
         v |= 0x1000;
      if (dskdmaen != DSKDMA_OFF && AMIGA.dmaen(DMAF_DSKEN))
         v |= 0x4000;
      if (dsklen & 0x4000)
         v |= 0x2000;

      //BUG.info('Disk.DSKBYTR() %x', v);
      return v;
   };

	this.DSKSYNC = function (v, hpos) {
      if (v == dsksync)
         return;

      this.update(hpos);
      dsksync = v;
   };

	this.DSKDAT = function (v) {
      if (fifo_inuse[2]) {
         BUG.info('Disk.DSKDAT() FIFO overflow!');
         return;
      }
      fifo_inuse[2] = fifo_inuse[1];
      fifo[2] = fifo[1];
      fifo_inuse[1] = fifo_inuse[0];
      fifo[1] = fifo[0];
      fifo_inuse[0] = dskdmaen == DSKDMA_WRITE ? 2 : 1;
      fifo[0] = v;
      fifo_filled = true;
   };

	this.DSKDATR = function () {
      var i, v = 0;

      for (i = 2; i >= 0; i--) {
         if (fifo_inuse[i]) {
            fifo_inuse[i] = 0;
            v = fifo[i];
            break;
         }
      }
      if (i < 0)
         BUG.info('Disk.DSKDATR() FIFO underflow!');
      else if (dskdmaen > 0 && dskdmaen < 3 && dsklength <= 0 && this.fifostatus() < 0)
         this.dmafinished();

      //BUG.info('Disk.DSKDATR() %x', v);
      return v;
   };

	this.DSKPTH = function (v) {
      dskpt = ((v << 16) | (dskpt & 0xffff)) >>> 0;
   };

	this.DSKPTL = function (v) {
      dskpt = ((dskpt & 0xffff0000) | v) >>> 0;
   };
	
	this.getpt = function () {
      var pt = dskpt;
      dskpt += 2;
      return pt;
   };

	this.dmal = function() {
		var dmal = 0;
		if (dskdmaen != DSKDMA_OFF) {
			if (dskdmaen == DSKDMA_WRITE) {
				dmal = (1 + 2) * (fifo_inuse[0] ? 1 : 0) + (4 + 8) * (fifo_inuse[1] ? 1 : 0) + (16 + 32) * (fifo_inuse[2] ? 1 : 0);
				dmal ^= 63;
				if (dsklength == 2)
					dmal &= ~(16 + 32);
				if (dsklength == 1)
					dmal &= ~(16 + 32 + 4 + 8);
			} else {
				dmal = 16 * (fifo_inuse[0] ? 1 : 0) + 4 * (fifo_inuse[1] ? 1 : 0) + (fifo_inuse[2] ? 1 : 0);
			}
		}
		return dmal;
	}
}
