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
/* global constants */

var SAEC_Playfield_CLOCK_PAL  = 3546895;
var SAEC_Playfield_CLOCK_NTSC = 3579545;

/*---------------------------------*/
/* global variables */

var SAEV_Playfield_fake_vblank_hz = 0.0;
var SAEV_Playfield_frame_rendered = false;
var SAEV_Playfield_frame_shown = false;

var SAEV_Playfield_picasso_requested_on = false;
var SAEV_Playfield_picasso_on = false;

/*---------------------------------*/
/* global references */

var SAER_Playfield_gfxvidinfo = null;

var SAER_Playfield_isvsync_chipset = null;
var SAER_Playfield_isvsync = null;

var SAER_Playfield_init_row_map = null;
var SAER_Playfield_current_maxvpos = null;

/*---------------------------------*/

function SAEF_Playfield_getvsyncrate(hz, result) { //double getvsyncrate(double hz, int *mult)
	if (hz < 0) {
		result.mult = 0;
		result.hz = 0;
	}
	else if (hz > 85) {
		result.mult = -1;
		result.hz = hz / 2;
	}
	else if (hz < 35 && hz > 0) {
		var ap = SAEV_config.video.apmode[SAEV_Playfield_picasso_on ? 1 : 0];
		result.mult = ap.gfx_interlaced ? 0 : 1;
		result.hz = hz * 2;
	} else {
		result.mult = 0;
		result.hz = hz;
	}
}

/*---------------------------------*/

function SAEO_Playfield() {
	/* SECT drawing defs */
	const SMART_UPDATE = true; //OPT
	const SPEEDUP = true;

	const MAX_SPRITES = 8;

	//#ifdef AGA
	const MAX_PLANES = 8;
	/*#else
	const MAX_PLANES = 6;
	#endif*/

	/* 100 words give you 1600 horizontal pixels. Should be more than enough for
	* superhires. Don't forget to update the definition in genp2c.c as well.
	* needs to be larger for superhires support */
	const MAX_WORDS_PER_LINE = 100;

	/* maximums for statically allocated tables */
	/*#ifdef UAE_MINI
	const MAXHPOS = 227; //absolute minimums for basic A500/A1200-emulation
	const MAXVPOS = 312;
	#else*/
	const MAXHPOS = 256;
	const MAXVPOS = 592;
	//#endif

	//-->SAEC_Config_Video_HResolution_LoRes  const RES_LORES = 0;
	//-->SAEC_Config_Video_HResolution_HiRes  const RES_HIRES = 1;
	//-->SAEC_Config_Video_HResolution_SuperHiRes  const RES_SUPERHIRES = 2;
	const RES_MAX = 2;
	//-->SAEC_Config_Video_VResolution_NonDouble  const VRES_NONDOUBLE = 0;
	//-->SAEC_Config_Video_VResolution_Double  const VRES_DOUBLE = 1;
	const VRES_QUAD = 2;
	const VRES_MAX = 1;

	/*const NEWHSYNC = 0;
	#ifdef NEWHSYNC
	const DIW_DDF_OFFSET = 9;
	const HBLANK_OFFSET = 13;
	const DISPLAY_LEFT_SHIFT = 0x40;
	#else*/
	/* According to the HRM, pixel data spends a couple of cycles somewhere in the chips before it appears on-screen. (TW: display emulation now does this automatically)  */
	const DIW_DDF_OFFSET = 1;
	/* this many cycles starting from hpos=0 are visible on right border */
	const HBLANK_OFFSET = 9;
	/* We ignore that many lores pixels at the start of the display. These are invisible anyway due to hardware DDF limits. */
	const DISPLAY_LEFT_SHIFT = 0x38;
	//#endif

	//enum diw_states
	const DIW_WAITING_START = 0;
	const DIW_WAITING_STOP = 1;

	function PIXEL_XPOS(HPOS) { return ((HPOS * 2 - DISPLAY_LEFT_SHIFT + DIW_DDF_OFFSET - 1) << lores_shift); }

	const min_diwlastword = 0;
	function max_diwlastword() { return PIXEL_XPOS(0x1d4 >> 1); } //ATT

	function coord_hw_to_window_x(x) {
		x -= DISPLAY_LEFT_SHIFT;
		return x << lores_shift;
	}

	function coord_window_to_hw_x(x) {
		x >>= lores_shift;
		return x + DISPLAY_LEFT_SHIFT;
	}

	function coord_diw_to_window_x(x) {
		return (x - DISPLAY_LEFT_SHIFT + DIW_DDF_OFFSET - 1) << lores_shift;
	}

	function coord_window_to_diw_x(x) {
		x = coord_window_to_hw_x(x);
		return x - DIW_DDF_OFFSET;
	}

	/* color values in two formats: 12 (OCS/ECS) or 24 (AGA) bit Amiga RGB (color_regs),
	* and the native color value; both for each Amiga hardware color register.
	* !!! See color_reg_xxx functions below before touching !!! */

	const CE_BORDERBLANK = 0;
	const CE_BORDERNTRANS = 1;
	const CE_BORDERSPRITE = 2;
	const CE_SHRES_DELAY = 4;

	function ce_is_borderblank(data) {
		return (data & (1 << CE_BORDERBLANK)) != 0;
	}
	function ce_is_bordersprite(data) {
		return (data & (1 << CE_BORDERSPRITE)) != 0;
	}
	function ce_is_borderntrans(data) {
		return (data & (1 << CE_BORDERNTRANS)) != 0;
	}

	function color_entry() {
		this.color_regs_ecs = new Uint16Array(32); //u16
		/*#ifndef AGA
		this.acolors = new Uint32Array(32); //u32
		#else*/
		this.acolors = new Uint32Array(256); //u32
		this.color_regs_aga = new Uint32Array(256); //u32
		//#endif
		this.extra = 0; //u8
	};

	/* convert 24 bit AGA Amiga RGB to native color, warning: this is still ugly, but now works with either byte order */
	/*#ifdef AGA
		#ifdef WORDS_BIGENDIAN
		#define CONVERT_RGB(c) ( xbluecolors[((uae_u8*)(&c))[3]] | xgreencolors[((uae_u8*)(&c))[2]] | xredcolors[((uae_u8*)(&c))[1]] )
		#else
		#define CONVERT_RGB(c) ( xbluecolors[((uae_u8*)(&c))[0]] | xgreencolors[((uae_u8*)(&c))[1]] | xredcolors[((uae_u8*)(&c))[2]] )
		#endif
	#else
	#define CONVERT_RGB(c) 0
	#endif*/
	function CONVERT_RGB(c) {
		if (SAEC_LITTLE_ENDIAN)
			return (xbluecolors[c & 0xff] | xgreencolors[(c >>> 8) & 0xff] | xredcolors[(c >>> 16) & 0xff]) >>> 0;
		else
			return (xbluecolors[(c >>> 24) & 0xff] | xgreencolors[(c >>> 16) & 0xff] | xredcolors[(c >>> 8) & 0xff]) >>> 0;
	}
	function getxcolor(c) {
		//#ifdef AGA
		if (direct_rgb)
			return CONVERT_RGB(c);
		else
		//#endif
			return xcolors[c];
	}

	/* functions for reading, writing, copying and comparing struct color_entry */
	function color_reg_get(ce, c) {
		//#ifdef AGA
		if (aga_mode)
			return ce.color_regs_aga[c];
		else
		//#endif
			return ce.color_regs_ecs[c];
	}
	function color_reg_set(ce, c, v) {
		//#ifdef AGA
		if (aga_mode)
			ce.color_regs_aga[c] = v;
		else
		//#endif
			ce.color_regs_ecs[c] = v;
	}
	function color_reg_cmp(ce1, ce2) {
		//#ifdef AGA
		if (aga_mode) {
			for (var i = 0; i < 256; i++) {
				if (ce1.color_regs_aga[i] != ce2.color_regs_aga[i]) return 1;
			}
		} else {
		//#endif
			for (var i = 0; i < 32; i++) {
				if (ce1.color_regs_ecs[i] != ce2.color_regs_ecs[i]) return 1;
			}
		}
		return (ce1.extra == ce2.extra) ? 0 : 1;
	}
	/* ugly copy hack, is there better solution? */
	function color_reg_cpy(dst, src) {
		//#ifdef AGA
		if (aga_mode) {
			/* copy acolors and color_regs_aga */
			for (var i = 0; i < 256; i++) {
				dst.acolors[i] = src.acolors[i];
				dst.color_regs_aga[i] = src.color_regs_aga[i];
			}
		} else {
		//#endif
			/* copy first 32 acolors and color_regs_ecs */
			for (var i = 0; i < 32; i++) {
				dst.color_regs_ecs[i] = src.color_regs_ecs[i];
				dst.acolors[i] = src.acolors[i];
			}
		}
		dst.extra = src.extra;
	}

	/*
	* The idea behind this code is that at some point during each horizontal
	* line, we decide how to draw this line. There are many more-or-less
	* independent decisions, each of which can be taken at a different horizontal
	* position.
	* Sprites and color changes are handled specially: There isn"t a single decision,
	* but a list of structures containing information on how to draw the line.
	*/
	const COLOR_CHANGE_BRDBLANK = 0x80000000;
	const COLOR_CHANGE_SHRES_DELAY = 0x40000000;
	function color_change() {
		this.linepos = 0; //int
		this.regno = 0; //int
		this.value = 0; //uint
	};
	function cpy_color_change(d, s) { //OWN
		d.linepos = s.linepos;
		d.regno = s.regno;
		d.value = s.value;
	}
	function cmp_color_change(cc1, cc2) { //OWN
		return cc1.linepos == cc2.linepos && cc1.regno == cc2.regno && cc1.value == cc2.value ? 0 : 1;
	}

	/* 440 rather than 880, since sprites are always lores.  */
	/*#ifdef UAE_MINI
	const MAX_PIXELS_PER_LINE = 880;
	#else*/
	const MAX_PIXELS_PER_LINE = 1760;
	//#endif

	/* No divisors for MAX_PIXELS_PER_LINE; we support AGA and SHRES sprites */
	const MAX_SPR_PIXELS = ((MAXVPOS + 1) * 2 + 1) * MAX_PIXELS_PER_LINE;

	function sprite_entry() {
		this.pos = 0; //ushort
		this.max = 0; //ushort
		this.first_pixel = 0; //uint
		this.has_attached = false; //bool
	};
	/*union sps_union {
		uae_u8 bytes[2 * MAX_SPR_PIXELS];
		uae_u32 words[2 * MAX_SPR_PIXELS / 4];
	};*/
	function sps_union() {
		this.bytes = new Uint8Array(2 * MAX_SPR_PIXELS); //u8
	};

	/* Way too much... */
	const MAX_REG_CHANGE = (MAXVPOS + 1) * 2 * MAXHPOS;

	/* struct decision contains things we save across drawing frames for comparison (smart update stuff). */
	function decision() {
		this.plfleft = 0; this.plfright = 0; this.plflinelen = 0; //int /* Records the leftmost access of BPL1DAT.  */
		this.diwfirstword = 0; this.diwlastword = 0; //int /* Display window: native coordinates, depend on lores state.  */
		this.ctable = 0; //int

		this.bplcon0 = 0; this.bplcon2 = 0; //u16
		//#ifdef AGA
		this.bplcon3 = 0; this.bplcon4 = 0; //u16
		//#endif
		this.nr_planes = 0; //u8
		this.bplres = 0; //u8
		this.ehb_seen = false; //bool
		this.ham_seen = false; //bool
		this.ham_at_start = false; //bool
		this.bordersprite_seen = false; //bool

		this.clr = function() {
			this.plfleft = 0;
			this.plfright = 0;
			this.plflinelen = 0;
			this.diwfirstword = 0;
			this.diwlastword = 0;
			this.ctable = 0;
			this.bplcon0 = 0;
			this.bplcon2 = 0;
			//#ifdef AGA
			this.bplcon3 = 0;
			this.bplcon4 = 0;
			//#endif
			this.nr_planes = 0;
			this.bplres = 0;
			this.ehb_seen = false;
			this.ham_seen = false;
			this.ham_at_start = false;
			this.bordersprite_seen = false;
		}
	};
	function cpy_decision(d, s) { //OWN
		d.plfleft = s.plfleft;
		d.plfright = s.plfright;
		d.plflinelen = s.plflinelen;
		d.diwfirstword = s.diwfirstword;
		d.diwlastword = s.diwlastword;
		d.ctable = s.ctable;
		d.bplcon0 = s.bplcon0;
		d.bplcon2 = s.bplcon2;
		//#ifdef AGA
		d.bplcon3 = s.bplcon3;
		d.bplcon4 = s.bplcon4;
		//#endif
		d.nr_planes = s.nr_planes;
		d.bplres = s.bplres;
		d.ehb_seen = s.ehb_seen;
		d.ham_seen = s.ham_seen;
		d.ham_at_start = s.ham_at_start;
		d.bordersprite_seen = s.bordersprite_seen;
	};

	/* Anything related to changes in hw registers during the DDF for one line. */
	function draw_info() {
		this.first_sprite_entry = 0; //all int
		this.last_sprite_entry = 0;
		this.first_color_change = 0;
		this.last_color_change = 0;
		this.nr_color_changes = 0;
		this.nr_sprites = 0;

		this.clr = function() {
			this.first_sprite_entry = 0;
			this.last_sprite_entry = 0;
			this.first_color_change = 0;
			this.last_color_change = 0;
			this.nr_color_changes = 0;
			this.nr_sprites = 0;
		}
	};

	/* Determine how to draw a scan line.  */
	//enum nln_how
	const nln_normal = 0; /* All lines on a non-doubled display. */
	const nln_doubled = 1; /* Non-interlace, doubled display.  */
	const nln_upper = 2; /* Interlace, doubled display, upper line.  */
	const nln_lower = 3; /* Interlace, doubled display, lower line.  */
	const nln_nblack = 4; /* This line normal, next one black.  */
	const nln_upper_black = 5;
	const nln_lower_black = 6;
	const nln_upper_black_always = 7;
	const nln_lower_black_always = 8;

	const IHF_SCROLLLOCK = 0;
	const IHF_QUIT_PROGRAM = 1;
	const IHF_PICASSO = 2;

	function set_inhibit_frame(bit) {
		inhibit_frame |= 1 << bit;
	}
	function clear_inhibit_frame(bit) {
		inhibit_frame &= ~(1 << bit);
	}
	function toggle_inhibit_frame(bit) {
		inhibit_frame ^= 1 << bit;
	}

	/* drawing defs */
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/* SECT drawing code */

	/* There are a couple of concepts of "coordinates" in this file.
	- DIW coordinates
	- DDF coordinates (essentially cycles, resolution lower than lores by a factor of 2)
	- Pixel coordinates
	* in the Amiga"s resolution as determined by BPLCON0 ("Amiga coordinates")
	* in the window resolution as determined by the preferences ("window coordinates").
	* in the window resolution, and with the origin being the topmost left corner of
	the window ("native coordinates")
	One note about window coordinates.  The visible area depends on the width of the
	window, and the centering code.  The first visible horizontal window coordinate is
	often _not_ 0, but the value of VISIBLE_LEFT_BORDER instead.

	One important thing to remember: DIW coordinates are in the lowest possible
	resolution.

	To prevent extremely bad things (think pixels cut in half by window borders) from
	happening, all ports should restrict window widths to be multiples of 16 pixels.  */

	const BG_COLOR_DEBUG = 0;

	var lores_factor = 0; //int
	var lores_shift = 0; //global int

	function lores_set(lores) {
		var old = lores;
		lores_shift = lores;
		if (lores_shift != old)
			pfield_set_linetoscr();
	}

	function lores_reset() {
		lores_factor = SAEV_config.video.hresolution ? 2 : 1;
		lores_set(SAEV_config.video.hresolution);
		if (doublescan > 0) {
			if (lores_shift < 2)
				lores_shift++;
			lores_factor = 2;
			lores_set(lores_shift);
		}
		sprite_buffer_res = SAEV_config.video.hresolution;
		if (doublescan > 0 && sprite_buffer_res < SAEC_Config_Video_HResolution_SuperHiRes)
			sprite_buffer_res++;
	}

	var aga_mode = false; //global bool /* mirror of chipset_mask & SAEC_Config_Chipset_Mask_AGA */
	var direct_rgb = false; //global bool

	/* The shift factor to apply when converting between Amiga coordinates and window
	coordinates.  Zero if the resolution is the same, positive if window coordinates
	have a higher resolution (i.e. we"re stretching the image), negative if window
	coordinates have a lower resolution (i.e. we"re shrinking the image).  */
	var res_shift = 0; //int

	var linedbl = 0, linedbld = 0; //int

	var interlace_seen = 0; //int
	const AUTO_LORES_FRAMES = 10;
	var can_use_lores = 0, frame_res = 0, frame_res_lace = 0; //int
	var resolution_count = new Int32Array(RES_MAX + 1); //int
	var lines_count = 0; //int
	var center_reset = false; //bool
	var need_genlock_data = false; //bool
	var init_genlock_data = false; //bool

	/* Lookup tables for dual playfields.  The dblpf_*1 versions are for the case
	that playfield 1 has the priority, dbplpf_*2 are used if playfield 2 has
	priority.  If we need an array for non-dual playfield mode, it has no number.  */
	/* The dbplpf_ms? arrays contain a shift value.  plf_spritemask is initialized
	to contain two 16 bit words, with the appropriate mask if pf1 is in the
	foreground being at bit offset 0, the one used if pf2 is in front being at
	offset 16.  */
	const dblpfofs = [0, 2, 4, 8, 16, 32, 64, 128]; //int

	var dblpf_ms1 = null, dblpf_ms2 = null, dblpf_ms = null; //int [256]
	var dblpf_ind1 = null, dblpf_ind2 = null; //int [256]
	var dblpf_2nd1 = null, dblpf_2nd2 = null; //int [256]
	//#ifdef AGA /* AGA mode color lookup tables */
	var dblpf_ind1_aga = null, dblpf_ind2_aga = null; //int [256]
	/*#else
	var dblpf_ind1_aga = null, dblpf_ind2_aga = null; //int [1]
	#endif*/
	var sprite_offs = null; //int [256]
	var clxtab = null; //u32 [256]

	/* The graphics code has a choice whether it wants to use a large buffer
	* for the whole display, or only a small buffer for a single line.
	* If you use a large buffer:
	*   - set bufmem to point at it
	*   - set linemem to 0
	*   - if memcpy within bufmem would be very slow, i.e. because bufmem is
	*     in graphics card memory, also set emergmem to point to a buffer
	*     that is large enough to hold a single line.
	*   - implement flush_line to be a no-op.
	* If you use a single line buffer:
	*   - set bufmem and emergmem to 0
	*   - set linemem to point at your buffer
	*   - implement flush_line to copy a single line to the screen
	*/
	function vidbuffer() {
		/* Function implemented by graphics driver */
		this.flush_line = function(gfxinfo, vb, line_no) {};
		this.flush_block = function(gfxinfo, vb, first_line, last_line) {};
		this.flush_screen = function(gfxinfo, vb, first_line, last_line) {};
		this.flush_clear_screen = function(gfxinfo, vb) {};
		this.lockscr = function(gfxinfo, vb) { return 1; };
		this.unlockscr = function(gfxinfo, vb) {};

		this.linemem = null; //u8 *
		this.emergmem = null; //u8 *

		this.bufmem = null; //u8 *
		this.bufmem_pos = 0; //OWN
		this.bufmemend = 0; //u8 *
		this.bufmemend_pos = 0; //OWN
		this.realbufmem = null; //u8 *
		this.bufmem_allocated = null; //u8 *
		this.bufmem_lockable = false; //bool
		this.rowbytes = 0; //int /* Bytes per row in the memory pointed at by bufmem. */
		this.pixbytes = 0; //int /* Bytes per pixel. */

		this.width_allocated = 0; //int /* size of this buffer */
		this.height_allocated = 0; //int

		this.outwidth = 0; //int /* size of max visible image */
		this.outheight = 0; //int

		this.inwidth = 0; //int /* nominal size of image for centering */
		this.inheight = 0; //int

		this.inwidth2 = 0; //int /* same but doublescan multiplier included */
		this.inheight2 = 0; //int

		this.nativepositioning = false; //bool /* use drawbuffer instead */
		this.tempbufferinuse = false; //bool /* tempbuffer in use */

		this.extrawidth = 0; //int /* extra width, chipset hpos extra in right border */

		this.xoffset = 0; //int /* superhires pixels from left edge */
		this.yoffset = 0; //int /* lines from top edge */

		this.inxoffset = 0; //int /* positive if sync positioning */
		this.inyoffset = 0; //int

		this.clr = function() {
			this.linemem = null;
			this.emergmem = null;

			this.bufmem = null;
			this.bufmem_pos = 0;
			this.bufmemend = 0;
			this.bufmemend_pos = 0;
			this.realbufmem = null;
			this.bufmem_allocated = null;
			this.bufmem_lockable = false;
			this.rowbytes = 0;
			this.pixbytes = 0;

			this.width_allocated = 0;
			this.height_allocated = 0;

			this.outwidth = 0;
			this.outheight = 0;

			this.inwidth = 0;
			this.inheight = 0;

			this.inwidth2 = 0;
			this.inheight2 = 0;

			this.nativepositioning = false;
			this.tempbufferinuse = false;

			this.extrawidth = 0;

			this.xoffset = 0;
			this.yoffset = 0;

			this.inxoffset = 0;
			this.inyoffset = 0;
		}
	};
	/* Video buffer description structure. Filled in by the graphics system dependent code. */
	function vidbuf_description() {
		this.maxblocklines = 0; //int /* Set to 0 if you want calls to flush_line after each drawn line, or the number of lines that flush_block wants to/can handle (it isn"t really useful to use another value than maxline here). */
		this.drawbuffer = new vidbuffer(); //struct vidbuffer
		this.tempbuffer = new vidbuffer(); //struct vidbuffer /* output buffer when using A2024 emulation */
		this.inbuffer = null; //struct vidbuffer *
		this.outbuffer = null; //struct vidbuffer *
		this.gfx_resolution_reserved = 0; //int
		this.gfx_vresolution_reserved = 0; //int
		this.xchange = 0; //int /* how many superhires pixels in one pixel in buffer */
		this.ychange = 0; //int /* how many interlaced lines in one line in buffer */
	};
	var gfxvidinfo = new vidbuf_description(); //struct vidbuf_description
	SAER_Playfield_gfxvidinfo = gfxvidinfo;

	function spritepixelsbuf() {
		this.attach = 0; //u8
		this.stdata = 0; //u8
		this.data = 0; //u16

		this.clr = function() {
			this.attach = 0;
			this.stdata = 0;
			this.data = 0;
		}
	};
	var spritepixels_buffer = new Array(MAX_PIXELS_PER_LINE); //struct spritepixelsbuf [MAX_PIXELS_PER_LINE]
	for (var vi = 0; vi < MAX_PIXELS_PER_LINE; vi++)
		spritepixels_buffer[vi] = new spritepixelsbuf();

	var spritepixels = null; //struct spritepixelsbuf *
	var spritepixels_pos = 0; //OWN
	var sprite_first_x = 0, sprite_last_x = 0; //int

	/* OCS/ECS color lookup table */
	//typedef uae_u32 xcolnr;
	var xcolors = new Uint32Array(4096); //xcolnr
	/* AGA mode color lookup tables */
	var xredcolors = new Uint32Array(256); //global uint
	var xgreencolors = new Uint32Array(256); //global uint
	var xbluecolors = new Uint32Array(256); //global uint

	var xredcolor_s = 0, xredcolor_b = 0, xredcolor_m = 0; //global int
	var xgreencolor_s = 0, xgreencolor_b = 0, xgreencolor_m = 0; //global int
	var xbluecolor_s = 0, xbluecolor_b = 0, xbluecolor_m = 0; //global int

	var colors_for_drawing = new color_entry(); //global struct color_entry
	var direct_colors_for_drawing = new color_entry(); //struct color_entry

	var p_acolors = null; //xcolnr *
	var p_xcolors = null; //xcolnr *

	/* The size of these arrays is pretty arbitrary; it was chosen to be "more
	than enough".  The coordinates used for indexing into these arrays are
	almost, but not quite, Amiga coordinates (there"s a constant offset).  */
	/*static union {
		double uupzuq;
		long int cruxmedo;
		uae_u8 apixels[MAX_PIXELS_PER_LINE * 2];
		uae_u16 apixels_w[MAX_PIXELS_PER_LINE * 2 / sizeof (uae_u16)];
		uae_u32 apixels_l[MAX_PIXELS_PER_LINE * 2 / sizeof (uae_u32)];
	} pixdata;*/
	function pixdata_union() {
		this.apixelsBuffer = new ArrayBuffer(MAX_PIXELS_PER_LINE * 2);
		this.apixels = new Uint8Array(this.apixelsBuffer);
		this.apixels_l = new Uint32Array(this.apixelsBuffer);
	}
	var pixdata = new pixdata_union();

	var refresh_indicator_buffer = null; //u8 *
	var refresh_indicator_changed = null, refresh_indicator_changed_prev = null; //u8 *
	var refresh_indicator_height = 0; //int

	var spixels = new Uint16Array(2 * MAX_SPR_PIXELS);

	/* Eight bits for every pixel.  */
	var spixstate = new sps_union(); //global union sps_union

	var ham_linebuf = new Uint32Array(MAX_PIXELS_PER_LINE * 2); //u32

	var real_bplpt = new Array(8); //u8 *

	var all_ones = new Uint8Array(MAX_PIXELS_PER_LINE); //u8
	SAEF_memset(all_ones,0, 0xff, MAX_PIXELS_PER_LINE);
	var all_zeros = new Uint8Array(MAX_PIXELS_PER_LINE); //u8

	var xlinebuffer = null;//, xlinebuffer_genlock = null; //u8 *
	var xlinebuffer_pos = 0; //OWN

	var amiga2aspect_line_map = null, native2amiga_line_map = null; //int *
	var max_drawn_amiga_line = 0; //int

	var row_map = null; //u8 **
	//var row_map_genlock = null; //global u8 **
	//var row_map_genlock_buffer = null; //u8 *
	var row_map_color_burst_buffer = null; //global u8 *
	var row_tmp = new ArrayBuffer(MAX_PIXELS_PER_LINE * 32 / 8); //u8 []

	/* line_draw_funcs: pfield_do_linetoscr, pfield_do_fill_line, decode_ham */
	//typedef void (*line_draw_func)(int, int, bool);
	var line_draw_func = function(a,b,c) {}; //func *

	const LINE_UNDECIDED = 1;
	const LINE_DECIDED = 2;
	const LINE_DECIDED_DOUBLE = 3;
	const LINE_AS_PREVIOUS = 4;
	const LINE_BLACK = 5;
	const LINE_REMEMBERED_AS_BLACK = 6;
	const LINE_DONE = 7;
	const LINE_DONE_AS_PREVIOUS = 8;
	const LINE_REMEMBERED_AS_PREVIOUS = 9;

	const LINESTATE_SIZE = (MAXVPOS + 2) * 2 + 1;
	var linestate = new Uint8Array(LINESTATE_SIZE); //u8

	const MAX_WORDS_PER_LINE_FULL = MAX_WORDS_PER_LINE * 2 >> 2; //OWN
	var line_data = new Array((MAXVPOS + 2) * 2); //u8 [(MAXVPOS + 2) * 2][MAX_PLANES * MAX_WORDS_PER_LINE * 2]
	for (var vi = 0; vi < line_data.length; vi++)
		line_data[vi] = new Uint32Array(MAX_PLANES * MAX_WORDS_PER_LINE_FULL); //u8

	/* Centering variables.  */
	var min_diwstart = 0, max_diwstop = 0; //int
	/* The visible window: VISIBLE_LEFT_BORDER contains the left border of the visible area, VISIBLE_RIGHT_BORDER the right border.  These are in window coordinates.  */
	var visible_left_border = 0, visible_right_border = 0; //global int
	/* Pixels outside of visible_start and visible_stop are always black */
	var visible_left_start = 0, visible_right_stop = 0; //int
	var visible_top_start = 0, visible_bottom_stop = 0; //int
	/* same for hblank */
	var hblank_left_start = 0, hblank_right_stop = 0; //int

	var linetoscr_x_adjust_pixbytes = 0, linetoscr_x_adjust_pixels = 0; //int
	var thisframe_y_adjust = 0; //int
	var thisframe_y_adjust_real = 0, max_ypos_thisframe = 0, min_ypos_for_screen = 0; //int
	var thisframe_first_drawn_line = 0, thisframe_last_drawn_line = 0; //global int

	/* A frame counter that forces a redraw after at least one skipped frame in interlace mode.  */
	var last_redraw_point = 0; //int

	const MAX_STOP = 30000;
	var first_drawn_line = 0, last_drawn_line = 0; //int
	//var first_block_line = 0, last_block_line = 0; //int, OWN flush_block() is not used

	const NO_BLOCK = -3;

	/* These are generated by the drawing code from the line_decisions array for
	each line that needs to be drawn.  These are basically extracted out of
	bit fields in the hardware registers.  */
	var bplehb = false, bplham = false, bpldualpf = false, bpldualpfpri = false, bpldualpf2of = 0, bplplanecnt = 0, ecsshres = false; //int
	var bplbypass = false, bplcolorburst = false, bplcolorburst_field = false; //int
	var issprites = false; //bool
	var bplres = 0; //int
	var plf1pri = 0, plf2pri = 0, bplxor = 0, bpland = 0, bpldelay_sh = 0; //int
	var plf_sprite_mask = 0; //u32
	var sbasecol = [16, 16]; //int
	var hposblank = 0; //int
	var specialmonitoron = false; //bool
	var ecs_genlock_features_active = false; //bool
	var ecs_genlock_features_mask = 0; //u8
	var ecs_genlock_features_colorkey = false; //bool

	//var picasso_requested_on = false; --> SAEV_Playfield_picasso_requested_on
	//var picasso_on = false; -> SAEV_Playfield_picasso_on

	var inhibit_frame = 0; //global int

	var framecnt = 0; //global int
	var custom_frame_redraw_necessary = 0; //global int
	var frame_redraw_necessary = 0; //int
	var picasso_redraw_necessary = 0; //int

	var warned_pfield_draw_line = 0; //OWN

	/*-----------------------------------------------------------------------*/

	var gamma = new Array(256 * 3); //u32 [256 * 3][3]
	for (var vi = 0; vi < 256 * 3; vi++)
		gamma[vi] = new Uint32Array(3);

	var blur_lf = 0, blur_hf = 0; //int

	/*extern uae_s32 tyhrgb[65536];
	extern uae_s32 tylrgb[65536];
	extern uae_s32 tcbrgb[65536];
	extern uae_s32 tcrrgb[65536];
	extern uae_u32 redc[3 * 256], grec[3 * 256], bluc[3 * 256];*/

	function bits_in_mask(mask) {
		var n = 0;
		while (mask) {
			n += mask & 1;
			mask >>>= 1;
		}
		return n;
	}
	function mask_shift(mask) {
		var n = 0;
		if (!mask)
			return 0;
		while (!(mask & 1)) {
			n++;
			mask >>>= 1;
		}
		return n;
	}

	function doMask(p, bits, shift) {
		if (bits == 0) return 0;
		/* scale to 0..255, shift to align msb with mask, and apply mask */
		//if (flashscreen) p ^= 0xff;
		var val = p << 24;
		val >>>= (32 - bits);
		val <<= shift;
		return val >>> 0;
	}
	/*function doMask256(p, bits, shift) {
		if (bits == 0) return 0;
		* p is a value from 0 to 255 (Amiga color value)
		* shift to align msb with mask, and apply mask
		var val = p * 0x01010101 >>> 0;
		val >>= (32 - bits);
		val <<= shift;
		return val;
	}*/
	function doColor(i, bits, shift) {
		//if (flashscreen) i = (i ^ 0xffffffff) >>> 0;
		if (bits >= 8)
			return (i << shift) >>> 0;
		else
			return ((i >> (8 - bits)) << shift) >>> 0;
	}
	function doAlpha(alpha, bits, shift) {
		return ((alpha & ((1 << bits) - 1)) << shift) >>> 0;
	}

	function calc_gamma(value, gamma, bri, con) { //video_gamma() all float
		value += bri;
		value *= con;

		if (value <= 0.0)
			return 0.0;

		var factor = Math.pow(255.0, 1.0 - gamma); //double
		var ret = factor * Math.pow(value, gamma); //float

		if (ret < 0.0)
			ret = 0.0;

		return ret;
	}

	function calc_gammatable() { //video_calc_gammatable()
		var bri = SAEV_config.video.luminance * (128 / 1000);
		var con = (SAEV_config.video.contrast + 1000) / 1000;
		var gam = (1000 - SAEV_config.video.gamma) / 1000;

		var gams = new Array(3);
		gams[0] = gam + (1000 - SAEV_config.video.gammaCh[0]) / 1000;
		gams[1] = gam + (1000 - SAEV_config.video.gammaCh[1]) / 1000;
		gams[2] = gam + (1000 - SAEV_config.video.gammaCh[2]) / 1000;

		blur_lf = Math.floor(64 * SAEV_config.video.gf[SAEV_Playfield_picasso_on ? 1 : 0].gfx_filter_blur / 1000);
		//blur_lf = 0;
		blur_hf = 256 - blur_lf * 2;

		for (var i = 0; i < (256 * 3); i++) {
			for (var j = 0; j < 3; j++) {
				var v = calc_gamma(i - 256, gams[j], bri, con);
				//var vi = Math.floor(v);
				var vi = v >>> 0;

				if (SAEV_config.video.luminance == 0 && SAEV_config.video.contrast == 0 && SAEV_config.video.gamma == 0)
					vi = i & 0xff;
				//if (currprefs.gfx_threebitcolors) vi *= 2;
				if (vi > 255)
					vi = 255;

				gamma[i][j] = vi;
				//SAEF_log("video.calc_gammatable() %03x : %08x (%f)", i, vi, v);
			}
		}
	}

	/*static uae_u32 limit256 (double v) {
		v = v * (double)(SAEV_config.video.gf[SAEV_Playfield_picasso_on ? 1 : 0].gfx_filter_contrast + 1000) / 1000.0 + SAEV_config.video.gf[SAEV_Playfield_picasso_on ? 1 : 0].gfx_filter_luminance / 10.0;
		if (v < 0)
			v = 0;
		if (v > 255)
			v = 255;
		return ((uae_u32)v) & 0xff;
	}
	static uae_u32 limit256rb (double v) {
		v *= (double)(SAEV_config.video.gf[SAEV_Playfield_picasso_on ? 1 : 0].gfx_filter_saturation + 1000) / 1000.0;
		if (v < -128)
			v = -128;
		if (v > 127)
			v = 127;
		return ((uae_u32)v) & 0xff;
	}
	static double get_y (int r, int g, int b) {
		return 0.2989f * r + 0.5866f * g + 0.1145f * b;
	}
	static uae_u32 get_yh (int r, int g, int b) {
		return limit256(get_y (r, g, b) * blur_hf / 256);
	}
	static uae_u32 get_yl (int r, int g, int b) {
		return limit256(get_y (r, g, b) * blur_lf / 256);
	}
	static uae_u32 get_cb (int r, int g, int b) {
		return limit256rb(-0.168736f * r - 0.331264f * g + 0.5f * b);
	}
	static uae_u32 get_cr (int r, int g, int b) {
		return limit256rb(0.5f * r - 0.418688f * g - 0.081312f * b);
	}*/

	function lowbits(v, shift, lsize) {
		return ((v >>> shift) & ((1 << lsize) - 1)) >>> 0;
	}

	/*void alloc_colors_picasso (int rw, int gw, int bw, int rs, int gs, int bs, int rgbfmt) {
		#ifdef PICASSO96
		int byte_swap = 0;
		int i;
		int red_bits = 0, green_bits, blue_bits;
		int red_shift, green_shift, blue_shift;
		int bpp = rw + gw + bw;

		switch (rgbfmt)
		{
		case RGBFB_R5G6B5PC:
			red_bits = 5;
			green_bits = 6;
			blue_bits = 5;
			red_shift = 11;
			green_shift = 5;
			blue_shift = 0;
			break;
		case RGBFB_R5G5B5PC:
			red_bits = green_bits = blue_bits = 5;
			red_shift = 10;
			green_shift = 5;
			blue_shift = 0;
			break;
		case RGBFB_R5G6B5:
			red_bits = 5;
			green_bits = 6;
			blue_bits = 5;
			red_shift = 11;
			green_shift = 5;
			blue_shift = 0;
			byte_swap = 1;
			break;
		case RGBFB_R5G5B5:
			red_bits = green_bits = blue_bits = 5;
			red_shift = 10;
			green_shift = 5;
			blue_shift = 0;
			byte_swap = 1;
			break;
		case RGBFB_B5G6R5PC:
			red_bits = 5;
			green_bits = 6;
			blue_bits = 5;
			red_shift = 0;
			green_shift = 5;
			blue_shift = 11;
			break;
		case RGBFB_B5G5R5PC:
			red_bits = green_bits = blue_bits = 5;
			red_shift = 0;
			green_shift = 5;
			blue_shift = 10;
			break;
		default:
			red_bits = rw;
			green_bits = gw;
			blue_bits = bw;
			red_shift = rs;
			green_shift = gs;
			blue_shift = bs;
			break;
		}

		#ifdef WORDS_BIGENDIAN
		byte_swap = !byte_swap;
		#endif

		memset (p96_rgbx16, 0, sizeof p96_rgbx16);

		if (red_bits) {
			int lrbits = 8 - red_bits;
			int lgbits = 8 - green_bits;
			int lbbits = 8 - blue_bits;
			int lrmask = (1 << red_bits) - 1;
			int lgmask = (1 << green_bits) - 1;
			int lbmask = (1 << blue_bits) - 1;
			for (i = 65535; i >= 0; i--) {
				uae_u32 r, g, b, c;
				uae_u32 j = byte_swap ? bswap_16 (i) : i;
				r = (((j >>   red_shift) & lrmask) << lrbits) | lowbits (j,   red_shift, lrbits);
				g = (((j >> green_shift) & lgmask) << lgbits) | lowbits (j, green_shift, lgbits);
				b = (((j >>  blue_shift) & lbmask) << lbbits) | lowbits (j,  blue_shift, lbbits);
				c = doMask(r, rw, rs) | doMask(g, gw, gs) | doMask(b, bw, bs);
				if (bpp <= 16)
					c *= 0x00010001;
				p96_rgbx16[i] = c;
			}
		}
		#endif
	}*/

	this.alloc_colors_rgb = function(rw, gw, bw, rs, gs, bs, aw, as, alpha, byte_swap, rc, gc, bc) {
		var bpp = rw + gw + bw + aw;
		for (var i = 0; i < 256; i++) {
			var j = 0;
			if (SAEV_config.video.blackerThanBlack)
				j = Math.floor(i * 15 / 16) + 15;
			else
				j = i;

			j += 256;

			rc[i] = doColor(gamma[j][0], rw, rs) | doAlpha(alpha, aw, as);
			gc[i] = doColor(gamma[j][1], gw, gs) | doAlpha(alpha, aw, as);
			bc[i] = doColor(gamma[j][2], bw, bs) | doAlpha(alpha, aw, as);
			if (byte_swap) {
				if (bpp <= 16) {
					rc[i] = SAEF_bswap16(rc[i]);
					gc[i] = SAEF_bswap16(gc[i]);
					bc[i] = SAEF_bswap16(bc[i]);
				} else {
					rc[i] = SAEF_bswap32(rc[i]);
					gc[i] = SAEF_bswap32(gc[i]);
					bc[i] = SAEF_bswap32(bc[i]);
				}
			}
			if (bpp <= 16) {
				/* Fill upper 16 bits of each colour value with a copy of the colour */
				rc[i] = (rc[i] * 0x00010001) >>> 0;
				gc[i] = (gc[i] * 0x00010001) >>> 0;
				bc[i] = (bc[i] * 0x00010001) >>> 0;
			}
			//SAEF_log("playfield.alloc_colors_rgb() %02x : %08x %08x %08x", i, rc[i], gc[i], bc[i]);
		}
	}

	this.alloc_colors64k = function(rw, gw, bw, rs, gs, bs, aw, as, alpha, byte_swap) {
		var bpp = rw + gw + bw + aw;

		calc_gammatable();
		var j = 256;
		for (var i = 0; i < 4096; i++) {
			var r = ((i >> 8) << 4) | (i >> 8);
			var g = (((i >> 4) & 0xf) << 4) | ((i >> 4) & 0x0f);
			var b = ((i & 0xf) << 4) | (i & 0x0f);
			r = gamma[r + j][0];
			g = gamma[g + j][1];
			b = gamma[b + j][2];
			xcolors[i] = doMask(r, rw, rs) | doMask(g, gw, gs) | doMask(b, bw, bs) | doAlpha(alpha, aw, as);
			if (byte_swap) {
				if (bpp <= 16)
					xcolors[i] = SAEF_bswap16(xcolors[i]);
				else
					xcolors[i] = SAEF_bswap32(xcolors[i]);
			}
			if (bpp <= 16)
				xcolors[i] = ((xcolors[i] * 0x00010001) | xcolors[i]) >>> 0;

		}

		//#if defined(AGA) || defined(GFXFILTER)
		this.alloc_colors_rgb(rw, gw, bw, rs, gs, bs, aw, as, alpha, byte_swap, xredcolors, xgreencolors, xbluecolors);
		/* copy original color table */
		/*for (i = 0; i < 256; i++) {
			redc[0 * 256 + i] = xredcolors[0];
			grec[0 * 256 + i] = xgreencolors[0];
			bluc[0 * 256 + i] = xbluecolors[0];
			redc[1 * 256 + i] = xredcolors[i];
			grec[1 * 256 + i] = xgreencolors[i];
			bluc[1 * 256 + i] = xbluecolors[i];
			redc[2 * 256 + i] = xredcolors[255];
			grec[2 * 256 + i] = xgreencolors[255];
			bluc[2 * 256 + i] = xbluecolors[255];
		}*/

		/*if (usedfilter !== null && usedfilter.yuv) {
			// create internal 5:6:5 color tables
			for (i = 0; i < 256; i++) {
				j = i + 256;
				xredcolors[i] = doColor(gamma[j][0], 5, 11);
				xgreencolors[i] = doColor(gamma[j][1], 6, 5);
				xbluecolors[i] = doColor(gamma[j][2], 5, 0);
				if (bpp <= 16) {
					xredcolors  [i] = (xredcolors  [i] * 0x00010001) >>> 0;
					xgreencolors[i] = (xgreencolors[i] * 0x00010001) >>> 0;
					xbluecolors [i] = (xbluecolors [i] * 0x00010001) >>> 0;
				}
			}
			for (i = 0; i < 4096; i++) {
				var r = ((i >> 8) << 4) | (i >> 8);
				var g = (((i >> 4) & 0xf) << 4) | ((i >> 4) & 0x0f);
				var b = ((i & 0xf) << 4) | (i & 0x0f);
				r = gamma[r + 256][0];
				g = gamma[g + 256][1];
				b = gamma[b + 256][2];
				xcolors[i] = doMask(r, 5, 11) | doMask(g, 6, 5) | doMask(b, 5, 0);
				if (byte_swap) {
					if (bpp <= 16)
						xcolors[i] = SAEF_bswap16(xcolors[i]);
					else
						xcolors[i] = SAEF_bswap32(xcolors[i]);
				}
				if (bpp <= 16)
					xcolors[i] = ((xcolors[i] * 0x00010001) | xcolors[i]) >>> 0;
			}
			// create RGB 5:6:5 -> YUV tables
			for (i = 0; i < 65536; i++) {
				uae_u32 r, g, b;
				r = (((i >> 11) & 31) << 3) | lowbits (i, 11, 3);
				r = gamma[r + 256][0];
				g = (((i >>  5) & 63) << 2) | lowbits (i,  5, 2);
				g = gamma[g + 256][1];
				b = (((i >>  0) & 31) << 3) | lowbits (i,  0, 3);
				b = gamma[b + 256][2];
				tyhrgb[i] = get_yh (r, g, b) * 256 * 256;
				tylrgb[i] = get_yl (r, g, b) * 256 * 256;
				tcbrgb[i] = ((uae_s8)get_cb (r, g, b)) * 256;
				tcrrgb[i] = ((uae_s8)get_cr (r, g, b)) * 256;
			}
		}*/
		//#endif

		//used by playfield.merge_2pixel16()
		xredcolor_b = rw;
		xgreencolor_b = gw;
		xbluecolor_b = bw;
		xredcolor_s = rs;
		xgreencolor_s = gs;
		xbluecolor_s = bs;
		xredcolor_m = (((1 << rw) - 1) << xredcolor_s) >>> 0;
		xgreencolor_m = (((1 << gw) - 1) << xgreencolor_s) >>> 0;
		xbluecolor_m = (((1 << bw) - 1) << xbluecolor_s) >>> 0;
	}

	/*-----------------------------------------------------------------------*/

	function clearbuffer(dst) {
		if (dst.bufmem_allocated !== null) {
			/*uae_u8 *p = dst->bufmem_allocated;
			for (int y = 0; y < dst->height_allocated; y++) {
				memset(p, 0, dst->width_allocated * dst->pixbytes);
				p += dst->rowbytes;
			}*/
			for (var i = 0; i < dst.bufmem_allocated.length; i++)
				dst.bufmem_allocated[i] = 0;
		}
	}

	function reset_decision_table() {
		//for (var i = 0; i < sizeof linestate / sizeof *linestate; i++)
		for (var i = 0; i < LINESTATE_SIZE; i++)
			linestate[i] = LINE_UNDECIDED;
	}

	function count_frame() {
		framecnt++;
		if (framecnt >= SAEV_config.video.framerate)
			framecnt = 0;
		if (inhibit_frame)
			framecnt = 1;
	}

	function xshift(x, shift) {
		if (shift < 0)
			return x >> (-shift);
		else
			return x << shift;
	}

	function coord_native_to_amiga_x(x) {
		x += visible_left_border;
		x = xshift(x, 1 - lores_shift);
		return x + 2 * DISPLAY_LEFT_SHIFT - 2 * DIW_DDF_OFFSET;
	}
	function coord_native_to_amiga_y(y) {
		return native2amiga_line_map[y] + thisframe_y_adjust - minfirstline;
	}

	function res_shift_from_window(x) {
		if (res_shift >= 0)
			return x >> res_shift;
		return x << (-res_shift);
	}
	function res_shift_from_amiga(x) {
		if (res_shift >= 0)
			return x >> res_shift;
		return x << (-res_shift);
	}

	function notice_screen_contents_lost() {
		picasso_redraw_necessary = 1;
		frame_redraw_necessary = 2;
	}


	const MIN_DISPLAY_W = 256;
	const MIN_DISPLAY_H = 192;
	const MAX_DISPLAY_W = 362;
	const MAX_DISPLAY_H = 283;

	var gclow = 0, gcloh = 0, gclox = 0, gcloy = 0, gclorealh = 0; //int
	var stored_left_start = 0, stored_top_start = 0, stored_width = 0, stored_height = 0; //int

	this.isnativevidbuf = function() {
		if (gfxvidinfo.outbuffer === null)
			return false;
		if (gfxvidinfo.outbuffer === gfxvidinfo.drawbuffer)
			return true;
		return gfxvidinfo.outbuffer.nativepositioning;
	}

	/*void get_custom_topedge(int *xp, int *yp, bool max) {
		if (this.isnativevidbuf() && !max) {
			var x, y;
			x = visible_left_border + (DISPLAY_LEFT_SHIFT << SAEV_config.video.hresolution);
			y = minfirstline << SAEV_config.video.vresolution;
			#if 0
			var dbl1, dbl2;
			dbl2 = dbl1 = SAEV_config.video.vresolution;
			if (doublescan > 0 && interlace_seen <= 0) {
				dbl1--; dbl2--;
			}
			x = -(visible_left_border + (DISPLAY_LEFT_SHIFT << SAEV_config.video.hresolution));
			y = -minfirstline << SAEV_config.video.vresolution;
			y = xshift(y, dbl2);
			#endif
			*xp = x;
			*yp = y;
		} else {
			*xp = 0;
			*yp = 0;
		}
	}*/

	function reset_custom_limits() { //global
		gclow = gcloh = gclox = gcloy = 0;
		gclorealh = -1;
		center_reset = true;
	}

	function set_blanking_limits() { //global
		hblank_left_start = visible_left_start;
		hblank_right_stop = visible_right_stop;

		if (programmedmode) {
			if (hblank_left_start < coord_hw_to_window_x(hsyncendpos * 2))
				hblank_left_start = coord_hw_to_window_x(hsyncendpos * 2);
			if (hblank_right_stop > coord_hw_to_window_x(hsyncstartpos * 2))
				hblank_right_stop = coord_hw_to_window_x(hsyncstartpos * 2);
		}
	}

	/*void get_custom_raw_limits (int *pw, int *ph, int *pdx, int *pdy) {
		if (stored_width > 0) {
			*pw = stored_width;
			*ph = stored_height;
			*pdx = stored_left_start;
			*pdy = stored_top_start;
		} else {
			int x = visible_left_border;
			if (x < visible_left_start)
				x = visible_left_start;
			*pdx = x;
			int x2 = visible_right_border;
			if (x2 > visible_right_stop)
				x2 = visible_right_stop;
			*pw = x2 - x;
			int y = min_ypos_for_screen;
			if (y < visible_top_start)
				y = visible_top_start;
			*pdy = y;
			int y2 = max_ypos_thisframe;
			if (y2 > visible_bottom_stop)
				y2 = visible_bottom_stop;
			*ph = y2 - y;
		}
	}*/
	this.check_custom_limits = function() {
		var vls = visible_left_start;
		var vrs = visible_right_stop;
		var vts = visible_top_start;
		var vbs = visible_bottom_stop;

		var fd = SAEV_config.video.gf[0];
		var left = fd.gfx_filter_left_border >> (RES_MAX - SAEV_config.video.hresolution);
		var right = fd.gfx_filter_right_border >> (RES_MAX - SAEV_config.video.hresolution);
		var top = fd.gfx_filter_top_border;
		var bottom = fd.gfx_filter_bottom_border;

		if (left > visible_left_start)
			visible_left_start = left;
		if (right > left && right < visible_right_stop)
			visible_right_stop = right;

		if (top > visible_top_start)
			visible_top_start = top;
		if (bottom > top && bottom < visible_bottom_stop)
			visible_bottom_stop = bottom;

		set_blanking_limits();
	}
	this.set_custom_limits = function(w, h, dx, dy) {
		var vls = visible_left_start;
		var vrs = visible_right_stop;
		var vts = visible_top_start;
		var vbs = visible_bottom_stop;

		if (w <= 0 || dx < 0) {
			visible_left_start = 0;
			visible_right_stop = MAX_STOP;
		} else {
			visible_left_start = visible_left_border + dx;
			visible_right_stop = visible_left_start + w;
		}
		if (h <= 0 || dy < 0) {
			visible_top_start = 0;
			visible_bottom_stop = MAX_STOP;
		} else {
			visible_top_start = min_ypos_for_screen + dy;
			visible_bottom_stop = visible_top_start + h;
		}

		if (vls != visible_left_start || vrs != visible_right_stop || vts != visible_top_start || vbs != visible_bottom_stop)
			notice_screen_contents_lost();

		this.check_custom_limits();
	}
	this.store_custom_limits = function(w, h, x, y) {
		stored_left_start = x;
		stored_top_start = y;
		stored_width = w;
		stored_height = h;
	}
	/*int get_custom_limits (int *pw, int *ph, int *pdx, int *pdy, int *prealh) {
		int w, h, dx, dy, y1, y2, dbl1, dbl2;
		int ret = 0;

		if (!pw || !ph || !pdx || !pdy) {
			reset_custom_limits();
			return 0;
		}

		if (!this.isnativevidbuf()) {
			*pw = gfxvidinfo.outbuffer->outwidth;
			*ph = gfxvidinfo.outbuffer->outheight;
			*pdx = 0;
			*pdy = 0;
			*prealh = -1;
			return 1;
		}

		*pw = gclow;
		*ph = gcloh;
		*pdx = gclox;
		*pdy = gcloy;
		*prealh = gclorealh;

		if (gclow > 0 && gcloh > 0)
			ret = -1;

		if (interlace_seen) {
			static int interlace_count;
			// interlace = only use long frames
			if (lof_store && (interlace_count & 1) == 0)
				interlace_count++;
			if (!lof_store && (interlace_count & 1) != 0)
				interlace_count++;
			if (interlace_count < 3)
				return ret;
			if (!lof_store)
				return ret;
			interlace_count = 0;
			// program may have set last visible line as last possible line (CD32 boot screen)
			if (last_planes_vpos < maxvpos)
				last_planes_vpos++;
			if (plflastline_total < maxvpos)
				plflastline_total++;
		}

		if (plflastline_total < 4)
			plflastline_total = last_planes_vpos;

		ddffirstword_total = coord_hw_to_window_x (ddffirstword_total * 2 + DIW_DDF_OFFSET);
		ddflastword_total = coord_hw_to_window_x (ddflastword_total * 2 + DIW_DDF_OFFSET);

		if (doublescan <= 0 && !programmedmode) {
			int min = coord_diw_to_window_x (92);
			int max = coord_diw_to_window_x (460);
			if (diwfirstword_total < min)
				diwfirstword_total = min;
			if (diwlastword_total > max)
				diwlastword_total = max;
			if (ddffirstword_total < min)
				ddffirstword_total = min;
			if (ddflastword_total > max)
				ddflastword_total = max;
			if (0 && !(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA)) {
				if (ddffirstword_total > diwfirstword_total)
					diwfirstword_total = ddffirstword_total;
				if (ddflastword_total < diwlastword_total)
					diwlastword_total = ddflastword_total;
			}
		}

		w = diwlastword_total - diwfirstword_total;
		dx = diwfirstword_total - visible_left_border;

		y2 = plflastline_total;
		if (y2 > last_planes_vpos)
			y2 = last_planes_vpos;
		y1 = plffirstline_total;
		if (first_planes_vpos > y1)
			y1 = first_planes_vpos;
		if (minfirstline > y1)
			y1 = minfirstline;

		dbl2 = dbl1 = SAEV_config.video.vresolution;
		if (doublescan > 0 && interlace_seen <= 0) {
			dbl1--;
			dbl2--;
		}

		h = y2 - y1;
		dy = y1 - minfirstline;

		if (first_planes_vpos == 0) {
			// no planes enabled during frame
			if (ret < 0)
				return 1;
			h = SAEV_config.chipset.ntsc ? 200 : 240;
			w = 320 << SAEV_config.video.hresolution;
			dy = 36 / 2;
			dx = 58;
		}

		if (dx < 0)
			dx = 0;

		*prealh = -1;
		if (!programmedmode && first_planes_vpos) {
			int th = (maxvpos - minfirstline) * 95 / 100;
			if (th > h) {
				th = xshift (th, dbl1);
				*prealh = th;
			}
		}

		dy = xshift (dy, dbl2);
		h = xshift (h, dbl1);

		if (w == 0 || h == 0)
			return 0;

		if (doublescan <= 0 && !programmedmode) {
			if ((w >> SAEV_config.video.hresolution) < MIN_DISPLAY_W) {
				dx += (w - (MIN_DISPLAY_W << SAEV_config.video.hresolution)) / 2;
				w = MIN_DISPLAY_W << SAEV_config.video.hresolution;
			}
			if ((h >> dbl1) < MIN_DISPLAY_H) {
				dy += (h - (MIN_DISPLAY_H << dbl1)) / 2;
				h = MIN_DISPLAY_H << dbl1;
			}
			if ((w >> SAEV_config.video.hresolution) > MAX_DISPLAY_W) {
				dx += (w - (MAX_DISPLAY_W << SAEV_config.video.hresolution)) / 2;
				w = MAX_DISPLAY_W << SAEV_config.video.hresolution;
			}
			if ((h >> dbl1) > MAX_DISPLAY_H) {
				dy += (h - (MAX_DISPLAY_H << dbl1)) / 2;
				h = MAX_DISPLAY_H << dbl1;
			}
		}

		if (gclow == w && gcloh == h && gclox == dx && gcloy == dy)
			return ret;

		if (w <= 0 || h <= 0 || dx < 0 || dy < 0)
			return ret;
		if (doublescan <= 0 && !programmedmode) {
			if (dx > gfxvidinfo.outbuffer->inwidth / 3)
				return ret;
			if (dy > gfxvidinfo.outbuffer->inheight / 3)
				return ret;
		}

		gclow = w;
		gcloh = h;
		gclox = dx;
		gcloy = dy;
		gclorealh = *prealh;
		*pw = w;
		*ph = h;
		*pdx = dx;
		*pdy = dy;
		center_reset = true;
		return 1;
	}*/

	/*void get_custom_mouse_limits (int *pw, int *ph, int *pdx, int *pdy, int dbl) {
		int delay1, delay2;
		int w, h, dx, dy, dbl1, dbl2, y1, y2;

		w = diwlastword_total - diwfirstword_total;
		dx = diwfirstword_total - visible_left_border;

		y2 = plflastline_total;
		if (y2 > last_planes_vpos)
			y2 = last_planes_vpos;
		y1 = plffirstline_total;
		if (first_planes_vpos > y1)
			y1 = first_planes_vpos;
		if (minfirstline > y1)
			y1 = minfirstline;

		h = y2 - y1;
		dy = y1 - minfirstline;

		if (*pw > 0)
			w = *pw;

		w = xshift (w, res_shift);

		if (*ph > 0)
			h = *ph;

		delay1 = (firstword_bplcon1 & 0x0f) | ((firstword_bplcon1 & 0x0c00) >> 6);
		delay2 = ((firstword_bplcon1 >> 4) & 0x0f) | (((firstword_bplcon1 >> 4) & 0x0c00) >> 6);
		//	if (delay1 == delay2)
		//		dx += delay1;

		dx = xshift (dx, res_shift);

		dbl2 = dbl1 = SAEV_config.video.vresolution;
		if ((doublescan > 0 || interlace_seen > 0) && !dbl) {
			dbl1--;
			dbl2--;
		}
		if (interlace_seen > 0)
			dbl2++;
		if (interlace_seen <= 0 && dbl)
			dbl2--;
		h = xshift (h, dbl1);
		dy = xshift (dy, dbl2);

		if (w < 1)
			w = 1;
		if (h < 1)
			h = 1;
		if (dx < 0)
			dx = 0;
		if (dy < 0)
			dy = 0;
		*pw = w; *ph = h;
		*pdx = dx; *pdy = dy;
	}*/



	var dp_for_drawing = null; //struct decision *
	var dip_for_drawing = null; //struct draw_info *

	/* Record DIW of the current line for use by centering code.  */
	function record_diw_line(plfstrt, first, last) {
		if (last > max_diwstop)
			max_diwstop = last;
		if (first < min_diwstart) {
			min_diwstart = first;
			/*if (plfstrt * 2 > min_diwstart)
				min_diwstart = plfstrt * 2;*/
		}
	}

	function get_shdelay_add() {
		if (bplres == SAEC_Config_Video_HResolution_SuperHiRes)
			return 0;
		/*var add = bpldelay_sh;
		add >>= RES_MAX - SAEV_config.video.hresolution;
		return add;*/
		return bpldelay_sh >> (RES_MAX - SAEV_config.video.hresolution);
	}

	/*
	* Screen update macros/functions
	*/

	/* The important positions in the line: where do we start drawing the left border,
	where do we start drawing the playfield, where do we start drawing the right border.
	All of these are forced into the visible window (VISIBLE_LEFT_BORDER .. VISIBLE_RIGHT_BORDER).
	PLAYFIELD_START and PLAYFIELD_END are in window coordinates.  */
	var playfield_start = 0, playfield_end = 0; //int
	var real_playfield_start = 0, real_playfield_end = 0; //int
	var sprite_playfield_start = 0; //int
	var may_require_hard_way = false; //bool
	var linetoscr_diw_start = 0, linetoscr_diw_end = 0; //int
	var native_ddf_left = 0, native_ddf_right = 0; //int

	var pixels_offset = 0; //int
	var src_pixel = 0; //int
	var unpainted = 0; //int /* How many pixels in window coordinates which are to the left of the left border.  */

	function getbgc(blank) {
		/*#if BG_COLOR_DEBUG
		if (blank)
			return xcolors[0x088];
		else if (hposblank == 1)
			return xcolors[0xf00];
		else if (hposblank == 2)
			return xcolors[0x0f0];
		else if (hposblank == 3)
			return xcolors[0x00f];
		else if (ce_is_borderblank(colors_for_drawing.extra))
			return xcolors[0x880];
		//return colors_for_drawing.acolors[0];
		return xcolors[0xf0f];
		#endif*/
		return (blank || hposblank || ce_is_borderblank(colors_for_drawing.extra)) ? 0 : colors_for_drawing.acolors[0];
	}

	function set_res_shift(shift) {
		var old = res_shift;
		res_shift = shift;
		if (res_shift != old)
			pfield_set_linetoscr();
	}

	/* Initialize the variables necessary for drawing a line. This involves setting up start/stop positions and display window borders. */
	function pfield_init_linetoscr(border) {
		/* First, get data fetch start/stop in DIW coordinates.  */
		var ddf_left = dp_for_drawing.plfleft * 2 + DIW_DDF_OFFSET;
		var ddf_right = dp_for_drawing.plfright * 2 + DIW_DDF_OFFSET;
		var leftborderhidden;
		var native_ddf_left2;

		if (border)
			ddf_left = DISPLAY_LEFT_SHIFT;

		/* Compute datafetch start/stop in pixels; native display coordinates.  */
		native_ddf_left = coord_hw_to_window_x(ddf_left);
		native_ddf_right = coord_hw_to_window_x(ddf_right);

		// Blerkenwiegel/Scoopex workaround
		native_ddf_left2 = native_ddf_left;
		if (native_ddf_left < 0)
			native_ddf_left = 0;

		if (native_ddf_right < native_ddf_left)
			native_ddf_right = native_ddf_left;

		linetoscr_diw_start = dp_for_drawing.diwfirstword;
		linetoscr_diw_end = dp_for_drawing.diwlastword;

		/* Perverse cases happen. */
		if (linetoscr_diw_end < linetoscr_diw_start)
			linetoscr_diw_end = linetoscr_diw_start;

		set_res_shift(lores_shift - bplres);

		playfield_start = linetoscr_diw_start;
		playfield_end = linetoscr_diw_end;

		if (playfield_start < native_ddf_left)
			playfield_start = native_ddf_left;
		if (playfield_end > native_ddf_right)
			playfield_end = native_ddf_right;

		if (playfield_start < visible_left_border)
			playfield_start = visible_left_border;
		if (playfield_start > visible_right_border)
			playfield_start = visible_right_border;
		if (playfield_end < visible_left_border)
			playfield_end = visible_left_border;
		if (playfield_end > visible_right_border)
			playfield_end = visible_right_border;

		real_playfield_start = playfield_start;
		sprite_playfield_start = playfield_start;
		real_playfield_end = playfield_end;

		// Sprite hpos don't include DIW_DDF_OFFSET and can appear 1 lores pixel
		// before first bitplane pixel appears.
		// This means "bordersprite" condition is possible under OCS/ECS too. Argh!
		if (dip_for_drawing.nr_sprites) {
			if (!ce_is_borderblank(colors_for_drawing.extra)) {
				/* bordersprite off or not supported: sprites are visible until diw_end */
				if (playfield_end < linetoscr_diw_end && hblank_right_stop > playfield_end) {
					playfield_end = linetoscr_diw_end;
				}
				var left = coord_hw_to_window_x(dp_for_drawing.plfleft * 2);
				if (left < visible_left_border)
					left = visible_left_border;
				if (left < playfield_start && left >= linetoscr_diw_start) {
					playfield_start = left;
				}
			} else {
				sprite_playfield_start = 0;
				if (playfield_end < linetoscr_diw_end && hblank_right_stop > playfield_end) {
					playfield_end = linetoscr_diw_end;
				}
			}
		}

		//#ifdef AGA
		may_require_hard_way = false;
		if (dp_for_drawing.bordersprite_seen && !ce_is_borderblank(colors_for_drawing.extra) && dip_for_drawing.nr_sprites) {
			var min = visible_right_border, max = visible_left_border, i;
			for (i = 0; i < dip_for_drawing.nr_sprites; i++) {
				var x;
				x = curr_sprite_entries[dip_for_drawing.first_sprite_entry + i].pos;
				if (x < min)
					min = x;
				// include max extra pixels, sprite may be 2x or 4x size: 4x - 1.
				x = curr_sprite_entries[dip_for_drawing.first_sprite_entry + i].max + (4 - 1);
				if (x > max)
					max = x;
			}
			min = coord_hw_to_window_x(min >> sprite_buffer_res) + (DIW_DDF_OFFSET << lores_shift);
			max = coord_hw_to_window_x(max >> sprite_buffer_res) + (DIW_DDF_OFFSET << lores_shift);

			if (min < playfield_start)
				playfield_start = min;
			if (playfield_start < visible_left_border)
				playfield_start = visible_left_border;
			if (max > playfield_end)
				playfield_end = max;
			if (playfield_end > visible_right_border)
				playfield_end = visible_right_border;
			sprite_playfield_start = 0;
			may_require_hard_way = true;
		}
		//#endif

		unpainted = visible_left_border < playfield_start ? 0 : visible_left_border - playfield_start;
		unpainted = res_shift_from_window(unpainted);

		var first_x = sprite_first_x;
		var last_x = sprite_last_x;
		if (first_x < last_x) {
			if (dp_for_drawing.bordersprite_seen && !ce_is_borderblank(colors_for_drawing.extra)) {
				if (first_x > visible_left_border)
					first_x = visible_left_border;
				if (last_x < visible_right_border)
					last_x = visible_right_border;
			}
			if (first_x < 0)
				first_x = 0;
			if (last_x > MAX_PIXELS_PER_LINE - 2)
				last_x = MAX_PIXELS_PER_LINE - 2;
			if (first_x < last_x) {
				//memset(spritepixels + first_x, 0, sizeof (struct spritepixelsbuf) * (last_x - first_x + 1));
				for (var i = first_x; i <= last_x; i++) spritepixels[i].clr();
			}
		}

		sprite_last_x = 0;
		sprite_first_x = MAX_PIXELS_PER_LINE - 1;

		/* Now, compute some offsets.  */
		ddf_left -= DISPLAY_LEFT_SHIFT;
		pixels_offset = MAX_PIXELS_PER_LINE - (ddf_left << bplres);
		ddf_left <<= bplres;

		leftborderhidden = playfield_start - native_ddf_left2;
		if (hblank_left_start > playfield_start)
			leftborderhidden += hblank_left_start - playfield_start;
		src_pixel = MAX_PIXELS_PER_LINE + res_shift_from_window(leftborderhidden);

		if (dip_for_drawing.nr_sprites == 0)
			return;

		if (aga_mode) {
			var add = get_shdelay_add();
			if (add) {
				if (sprite_playfield_start > 0)
					sprite_playfield_start -= add;
				else
					playfield_start -= add;
			}
		}

		/* We need to clear parts of apixels.  */
		if (linetoscr_diw_start < native_ddf_left) {
			var len = res_shift_from_window(native_ddf_left - linetoscr_diw_start);
			var start = MAX_PIXELS_PER_LINE - len;
			var end = start + len;
			for (var i = start; i < end; i++) pixdata.apixels[i] = 0;
			linetoscr_diw_start = native_ddf_left;
		}
		if (linetoscr_diw_end > native_ddf_right) {
			var start = MAX_PIXELS_PER_LINE + res_shift_from_window(native_ddf_right - native_ddf_left);
			var end = start + res_shift_from_window(linetoscr_diw_end - native_ddf_right);
			for (var i = start; i < end; i++) pixdata.apixels[i] = 0;
			linetoscr_diw_start = native_ddf_left;
		}
	}

	// erase sprite graphics in pixdata if they were outside of ddf
	function pfield_erase_hborder_sprites() {
		if (sprite_first_x < native_ddf_left) {
			var len = res_shift_from_window(native_ddf_left - sprite_first_x);
			var start = MAX_PIXELS_PER_LINE - len;
			var end = start + len;
			for (var i = start; i < end; i++) pixdata.apixels[i] = 0;
		}
		if (sprite_last_x > native_ddf_right) {
			var start = MAX_PIXELS_PER_LINE + res_shift_from_window(native_ddf_right - native_ddf_left);
			var end = start + res_shift_from_window(sprite_last_x - native_ddf_right);
			for (var i = start; i < end; i++) pixdata.apixels[i] = 0;
		}
	}

	// erase whole viewable area if sprite in upper or lower border
	function pfield_erase_vborder_sprites() {
		if (visible_right_border <= visible_left_border)
			return;
		var pos = 0, len = 0;
		if (visible_left_border < native_ddf_left) {
			len = res_shift_from_window(native_ddf_left - visible_left_border);
			pos = -len;
		}
		if (visible_right_border > native_ddf_left)
			len += res_shift_from_window(visible_right_border - native_ddf_left);

		var start = MAX_PIXELS_PER_LINE - pos;
		var end = start + len;
		for (var i = start; i < end; i++) pixdata.apixels[i] = 0;
	}

	/*STATIC_INLINE void fill_line_16 (uae_u8 *buf, int start, int stop, bool blank) {
		uae_u16 *b = (uae_u16 *)buf;
		unsigned int i;
		unsigned int rem = 0;
		xcolnr col = getbgc (blank);
		if (((uintptr_t)&b[start]) & 1)
			b[start++] = (uae_u16) col;
		if (start >= stop)
			return;
		if (((uintptr_t)&b[stop]) & 1) {
			rem++;
			stop--;
		}
		for (i = start; i < stop; i += 2) {
			uae_u32 *b2 = (uae_u32 *)&b[i];
			*b2 = col;
		}
		if (rem)
			b[stop] = (uae_u16)col;
	}
	STATIC_INLINE void fill_line_32 (uae_u8 *buf, int start, int stop, bool blank) {
		uae_u32 *b = (uae_u32 *)buf;
		unsigned int i;
		xcolnr col = getbgc (blank);
		for (i = start; i < stop; i++)
			b[i] = col;
	}
	static void pfield_do_fill_line (int start, int stop, bool blank) {
		switch (gfxvidinfo.drawbuffer.pixbytes) {
		case 2: fill_line_16 (xlinebuffer, start, stop, blank); break;
		case 4: fill_line_32 (xlinebuffer, start, stop, blank); break;
		}
		if (need_genlock_data)
			memset(xlinebuffer_genlock + start, 0, stop - start);
	}*/
	function pfield_do_fill_line(start, stop, blank) {
		//xlinebuffer.fill(getbgc(blank), start + xlinebuffer_pos, stop + xlinebuffer_pos);
		//SAEF_memset(xlinebuffer,start + xlinebuffer_pos, getbgc(blank), stop - start);
		var col = getbgc(blank);
		for (var i = start + xlinebuffer_pos, j = stop + xlinebuffer_pos; i < j; i++) xlinebuffer[i] = col;

		/*if (need_genlock_data)
			memset(xlinebuffer_genlock + start, 0, stop - start);*/
	}

	/*static void fill_line2 (int startpos, int len) {
		int shift, nints, nrem, *start;
		xcolnr val;

		shift = 0;
		if (gfxvidinfo.drawbuffer.pixbytes == 2) shift = 1;
		if (gfxvidinfo.drawbuffer.pixbytes == 4) shift = 2;

		nints = len >> (2 - shift);
		nrem = nints & 7;
		nints &= ~7;
		start = (int *)(((uae_u8*)xlinebuffer) + (startpos << shift));
		val = getbgc (false);
		for (; nints > 0; nints -= 8, start += 8) {
			*start = val;
			*(start+1) = val;
			*(start+2) = val;
			*(start+3) = val;
			*(start+4) = val;
			*(start+5) = val;
			*(start+6) = val;
			*(start+7) = val;
		}
		switch (nrem) {
			case 7: *start++ = val;
			case 6: *start++ = val;
			case 5: *start++ = val;
			case 4: *start++ = val;
			case 3: *start++ = val;
			case 2: *start++ = val;
			case 1: *start = val;
		}
	}*/
	/*function fill_line2(startpos, len) {
		var shift = 0;
		if (gfxvidinfo.drawbuffer.pixbytes == 2) shift = 1;
		if (gfxvidinfo.drawbuffer.pixbytes == 4) shift = 2;

		var nints = len >> (2 - shift);
		var nrem = nints & 7;
		nints &= ~7;

		//var start = (int *)(((uae_u8*)xlinebuffer) + (startpos << shift));
		var start = startpos + xlinebuffer_pos;
		var val = getbgc(false);
		for (; nints > 0; nints -= 8, start += 8) {
			xlinebuffer[start    ] = val;
			xlinebuffer[start + 1] = val;
			xlinebuffer[start + 2] = val;
			xlinebuffer[start + 3] = val;
			xlinebuffer[start + 4] = val;
			xlinebuffer[start + 5] = val;
			xlinebuffer[start + 6] = val;
			xlinebuffer[start + 7] = val;
		}
		switch (nrem) {
			case 7: xlinebuffer[start++] = val;
			case 6: xlinebuffer[start++] = val;
			case 5: xlinebuffer[start++] = val;
			case 4: xlinebuffer[start++] = val;
			case 3: xlinebuffer[start++] = val;
			case 2: xlinebuffer[start++] = val;
			case 1: xlinebuffer[start] = val;
		}
	}*/
	function fill_line2(startpos, len) {
		//xlinebuffer.fill(getbgc(false), startpos + xlinebuffer_pos, startpos + xlinebuffer_pos + len);
		//SAEF_memset(xlinebuffer,startpos + xlinebuffer_pos, getbgc(false), len);
		var col = getbgc(false);
		for (var i = startpos + xlinebuffer_pos, j = startpos + xlinebuffer_pos + len; i < j; i++) xlinebuffer[i] = col;
	}

	function fill_line_border(lineno) {
		var lastpos = visible_left_border;
		var endpos = visible_left_border + gfxvidinfo.drawbuffer.inwidth;

		if (lineno < visible_top_start || lineno >= visible_bottom_stop) {
			var b = hposblank;
			hposblank = 3;
			fill_line2(lastpos, gfxvidinfo.drawbuffer.inwidth);
			/*if (need_genlock_data) {
				memset(xlinebuffer_genlock + lastpos, 0, gfxvidinfo.drawbuffer.inwidth);
			}*/
			hposblank = b;
			return;
		}

		// full hblank
		if (hposblank) {
			hposblank = 3;
			fill_line2(lastpos, gfxvidinfo.drawbuffer.inwidth);
			/*if (need_genlock_data) {
				memset(xlinebuffer_genlock + lastpos, 0, gfxvidinfo.drawbuffer.inwidth);
			}*/
			return;
		}
		// hblank not visible
		if (hblank_left_start <= lastpos && hblank_right_stop >= endpos) {
			fill_line2(lastpos, gfxvidinfo.drawbuffer.inwidth);
			/*if (need_genlock_data) {
				memset(xlinebuffer_genlock + lastpos, 0, gfxvidinfo.drawbuffer.inwidth);
			}*/
			return;
		}

		// left, right or both hblanks visible
		if (lastpos < hblank_left_start) {
			var t = hblank_left_start < endpos ? hblank_left_start : endpos;
			pfield_do_fill_line(lastpos, t, true);
			lastpos = t;
		}
		if (lastpos < hblank_right_stop) {
			var t = hblank_right_stop < endpos ? hblank_right_stop : endpos;
			pfield_do_fill_line(lastpos, t, false);
			lastpos = t;
		}
		if (lastpos < endpos)
			pfield_do_fill_line(lastpos, endpos, true);
	}

	var sprite_shdelay = 0; //int

	function render_sprites(pos, dualpf, apixel, aga) {
		//struct spritepixelsbuf *spb = &spritepixels[pos];
		var spb = spritepixels[pos];
		var v = spb.data; //uint
		var shift_lookup = dualpf ? (bpldualpfpri ? dblpf_ms2 : dblpf_ms1) : dblpf_ms; //int *
		var maskshift, plfmask; //int

		// shdelay hack, above &spritepixels[pos] is correct.
		pos += sprite_shdelay;
		/* The value in the shift lookup table is _half_ the shift count we
		need.  This is because we can't shift 32 bits at once (undefined behaviour in C).  */
		maskshift = shift_lookup[apixel];
		plfmask = (plf_sprite_mask >>> maskshift) >>> maskshift;
		v &= ~plfmask;
		/* Extra 1 sprite pixel at DDFSTRT is only possible if at least 1 plane is active */
		if ((bplplanecnt > 0 || pos >= sprite_playfield_start) && v != 0) {
			var vlo, vhi, col; //uint
			var v1 = v & 255; //uint
			/* OFFS determines the sprite pair with the highest priority that has
			any bits set.  E.g. if we have 0xFF00 in the buffer, we have sprite
			pairs 01 and 23 cleared, and pairs 45 and 67 set, so OFFS will
			have a value of 4.
			2 * OFFS is the bit number in V of the sprite pair, and it also
			happens to be the color offset for that pair.
			*/
			var offs;
			if (v1 == 0)
				offs = 4 + sprite_offs[v >> 8];
			else
				offs = sprite_offs[v1];

			/* Shift highest priority sprite pair down to bit zero.  */
			v >>>= offs * 2;
			v &= 15;

			if (spb.attach && (spb.stdata & (3 << offs))) {
				col = v;
				if (aga)
					col += sbasecol[1];
				else
					col += 16;
			} else {
				/* This sequence computes the correct color value.  We have to select
				either the lower-numbered or the higher-numbered sprite in the pair.
				We have to select the high one if the low one has all bits zero.
				If the lower-numbered sprite has any bits nonzero, (VLO - 1) is in
				the range of 0..2, and with the mask and shift, VHI will be zero.
				If the lower-numbered sprite is zero, (VLO - 1) is a mask of
				0xFFFFFFFF, and we select the bits of the higher numbered sprite in VHI.
				This is _probably_ more efficient than doing it with branches.  */
				vlo = v & 3;
				//vhi = (v & (vlo - 1)) >> 2; col = vlo | vhi; //ATT

				vhi = v >> 2;
				if (vlo)
					col = vlo;
				else
					col = vhi;

				if (aga) {
					if (vhi > 0)
						col += sbasecol[1];
					else
						col += sbasecol[0];
				} else {
					col += 16;
				}
				col += offs * 2;
			}
			return col;
		}
		return 0;
	}

	function get_genlock_very_rare_and_complex_case(v) {
		// border color without BRDNTRAN bit set = transparent
		if (v == 0 && !ce_is_borderntrans(colors_for_drawing.extra))
			return false;
		if (ecs_genlock_features_colorkey) {
			// color key match?
			if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
				if (colors_for_drawing.color_regs_aga[v] & 0x80000000)
					return false;
			} else {
				if (colors_for_drawing.color_regs_ecs[v] & 0x8000)
					return false;
			}
		}
		// plane mask match?
		if (v & ecs_genlock_features_mask)
			return false;
		return true;
	}
	// false = transparent
	function get_genlock_transparency(v) {
		if (!ecs_genlock_features_active) {
			if (v == 0)
				return false;
			return true;
		} else
			return get_genlock_very_rare_and_complex_case(v);
	}

	function merge_2pixel16(p1, p2) {
		return ( //u16
			(((((p1 >> xredcolor_s) & xredcolor_m) + ((p2 >> xredcolor_s) & xredcolor_m)) >> 1) << xredcolor_s) |
			(((((p1 >> xbluecolor_s) & xbluecolor_m) + ((p2 >> xbluecolor_s) & xbluecolor_m)) >> 1) << xbluecolor_s) |
			(((((p1 >> xgreencolor_s) & xgreencolor_m) + ((p2 >> xgreencolor_s) & xgreencolor_m)) >> 1) << xgreencolor_s)
		);
	}
	function merge_2pixel32(p1, p2) {
		return ( //u32
			(((((p1 >> 16) & 0xff) + ((p2 >> 16) & 0xff)) >> 1) << 16) |
			(((((p1 >>  8) & 0xff) + ((p2 >>  8) & 0xff)) >> 1) <<  8) |
			(((((p1 >>  0) & 0xff) + ((p2 >>  0) & 0xff)) >> 1) <<  0)
		) >>> 0;
	}

	//typedef int(*call_linetoscr)(int spix, int dpix, int dpix_end);

	var pfield_do_linetoscr_normal = function(spix, dpix, dpix_end) {}; //call_linetoscr
	var pfield_do_linetoscr_sprite = function(spix, dpix, dpix_end) {};
	var pfield_do_linetoscr_spriteonly = function(spix, dpix, dpix_end) {};

	function pfield_do_linetoscr(start, stop, blank) {
		src_pixel = pfield_do_linetoscr_normal(src_pixel, start, stop);
	}
	function pfield_do_linetoscr_spr(start, stop, blank) {
		src_pixel = pfield_do_linetoscr_sprite(src_pixel, start, stop);
	}
	function pfield_do_nothing(start, stop, blank) {
		return start;
	}
	/* AGA subpixel delay hack */
	var pfield_do_linetoscr_shdelay_normal = function(a,b,c) {}; //call_linetoscr
	var pfield_do_linetoscr_shdelay_sprite = function(a,b,c) {};

	function pfield_do_linetoscr_normal_shdelay(spix, dpix, dpix_end) {
		var add = get_shdelay_add();
		//var add2 = add * gfxvidinfo.drawbuffer.pixbytes;
		if (add)
			pfield_do_linetoscr_shdelay_sprite(spix, dpix, dpix + add);

		//xlinebuffer += add2; //ORG
		xlinebuffer_pos += add; //OWN
		var out = pfield_do_linetoscr_shdelay_normal(spix, dpix, dpix_end);
		//xlinebuffer -= add2; //ORG
		xlinebuffer_pos -= add; //OWN
		return out;
	}
	function pfield_do_linetoscr_sprite_shdelay(spix, dpix, dpix_end) {
		var out = spix;
		if (dpix < real_playfield_start && dpix_end > real_playfield_start) {
			// Crosses real_playfield_start.
			// Render only from dpix to real_playfield_start.
			var len = real_playfield_start - dpix;
			out = pfield_do_linetoscr_spriteonly(out, dpix, dpix + len);
			dpix = real_playfield_start;
		} else if (dpix_end <= real_playfield_start) {
			// Does not cross real_playfield_start, nothing special needed.
			out = pfield_do_linetoscr_spriteonly(out, dpix, dpix_end);
			return out;
		}
		// Render bitplane with subpixel scroll, from real_playfield_start to end.
		var add = get_shdelay_add();
		//var add2 = add * gfxvidinfo.drawbuffer.pixbytes;
		if (add)
			pfield_do_linetoscr_shdelay_sprite(out, dpix, dpix + add);

		sprite_shdelay = add;
		//spritepixels += add;
		spritepixels_pos += add; //OWN
		//xlinebuffer += add2;
		xlinebuffer_pos += add; //OWN
		out = pfield_do_linetoscr_shdelay_sprite(out, dpix, dpix_end);
		//xlinebuffer -= add2; //ORG
		xlinebuffer_pos -= add; //OWN
		//spritepixels -= add;
		spritepixels_pos -= add; //OWN
		sprite_shdelay = 0;
		return out;
	}

	function pfield_set_linetoscr() {
		p_acolors = colors_for_drawing.acolors;
		p_xcolors = xcolors;
		bpland = 0xff;
		if (bplbypass)
			p_acolors = direct_colors_for_drawing.acolors;

		spritepixels = spritepixels_buffer;
		spritepixels_pos = 0; //OWN
		pfield_do_linetoscr_spriteonly = pfield_do_nothing;

		//#ifdef AGA
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			if (res_shift == 0) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2:
					pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_16_aga_genlock : linetoscr_16_aga;
					pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_16_aga_spr_genlock : linetoscr_16_aga_spr;
					pfield_do_linetoscr_spriteonly = linetoscr_16_aga_spronly;
					break;
					case 4:
					pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_32_aga_genlock : linetoscr_32_aga;
					pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_32_aga_spr_genlock : linetoscr_32_aga_spr;
					pfield_do_linetoscr_spriteonly = linetoscr_32_aga_spronly;
					break;
				}
			} else if (res_shift == 2) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2:
					pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_16_stretch2_aga_genlock : linetoscr_16_stretch2_aga;
					pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_16_stretch2_aga_spr_genlock : linetoscr_16_stretch2_aga_spr;
					pfield_do_linetoscr_spriteonly = linetoscr_16_stretch2_aga_spronly;
					break;
					case 4:
					pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_32_stretch2_aga_genlock : linetoscr_32_stretch2_aga;
					pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_32_stretch2_aga_spr_genlock : linetoscr_32_stretch2_aga_spr;
					pfield_do_linetoscr_spriteonly = linetoscr_32_stretch2_aga_spronly;
					break;
				}
			} else if (res_shift == 1) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2:
					pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_16_stretch1_aga_genlock : linetoscr_16_stretch1_aga;
					pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_16_stretch1_aga_spr_genlock : linetoscr_16_stretch1_aga_spr;
					pfield_do_linetoscr_spriteonly = linetoscr_16_stretch1_aga_spronly;
					break;
					case 4:
					pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_32_stretch1_aga_genlock : linetoscr_32_stretch1_aga;
					pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_32_stretch1_aga_spr_genlock : linetoscr_32_stretch1_aga_spr;
					pfield_do_linetoscr_spriteonly = linetoscr_32_stretch1_aga_spronly;
					break;
				}
			} else if (res_shift == -1) {
				if (SAEV_config.video.lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2:
						pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_16_shrink1f_aga_genlock : linetoscr_16_shrink1f_aga;
						pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_16_shrink1f_aga_spr_genlock : linetoscr_16_shrink1f_aga_spr;
						pfield_do_linetoscr_spriteonly = linetoscr_16_shrink1f_aga_spronly;
						break;
						case 4:
						pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_32_shrink1f_aga_genlock : linetoscr_32_shrink1f_aga;
						pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_32_shrink1f_aga_spr_genlock : linetoscr_32_shrink1f_aga_spr;
						pfield_do_linetoscr_spriteonly = linetoscr_32_shrink1f_aga_spronly;
						break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2:
						pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_16_shrink1_aga_genlock : linetoscr_16_shrink1_aga;
						pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_16_shrink1_aga_spr_genlock : linetoscr_16_shrink1_aga_spr;
						pfield_do_linetoscr_spriteonly = linetoscr_16_shrink1_aga_spronly;
						break;
						case 4:
						pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_32_shrink1_aga_genlock : linetoscr_32_shrink1_aga;
						pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_32_shrink1_aga_spr_genlock : linetoscr_32_shrink1_aga_spr;
						pfield_do_linetoscr_spriteonly = linetoscr_32_shrink1_aga_spronly;
						break;
					}
				}
			} else if (res_shift == -2) {
				if (SAEV_config.video.lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2:
						pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_16_shrink2f_aga_genlock : linetoscr_16_shrink2f_aga;
						pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_16_shrink2f_aga_spr_genlock : linetoscr_16_shrink2f_aga_spr;
						pfield_do_linetoscr_spriteonly = linetoscr_16_shrink2f_aga_spronly;
						break;
						case 4:
						pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_32_shrink2f_aga_genlock : linetoscr_32_shrink2f_aga;
						pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_32_shrink2f_aga_spr_genlock : linetoscr_32_shrink2f_aga_spr;
						pfield_do_linetoscr_spriteonly = linetoscr_32_shrink2f_aga_spronly;
						break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2:
						pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_16_shrink2_aga_genlock : linetoscr_16_shrink2_aga;
						pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_16_shrink2_aga_spr_genlock : linetoscr_16_shrink2_aga_spr;
						pfield_do_linetoscr_spriteonly = linetoscr_16_shrink2_aga_spronly;
						break;
						case 4:
						pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_32_shrink2_aga_genlock : linetoscr_32_shrink2_aga;
						pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_32_shrink2_aga_spr_genlock : linetoscr_32_shrink2_aga_spr;
						pfield_do_linetoscr_spriteonly = linetoscr_32_shrink2_aga_spronly;
						break;
					}
				}
			}
			if (get_shdelay_add()) {
				pfield_do_linetoscr_shdelay_normal = pfield_do_linetoscr_normal;
				pfield_do_linetoscr_shdelay_sprite = pfield_do_linetoscr_sprite;
				pfield_do_linetoscr_normal = pfield_do_linetoscr_normal_shdelay;
				pfield_do_linetoscr_sprite = pfield_do_linetoscr_sprite_shdelay;
			}
		}
		//#endif /* AGA */
		//#ifdef ECS_DENISE
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) && ecsshres) {
			// TODO: genlock support
			if (res_shift == 0) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2:
					pfield_do_linetoscr_normal = linetoscr_16_sh;
					pfield_do_linetoscr_sprite = linetoscr_16_sh_spr;
					break;
					case 4:
					pfield_do_linetoscr_normal = linetoscr_32_sh;
					pfield_do_linetoscr_sprite = linetoscr_32_sh_spr;
					break;
				}
			} else if (res_shift == -1) {
				if (SAEV_config.video.lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2:
						pfield_do_linetoscr_normal = linetoscr_16_shrink1f_sh;
						pfield_do_linetoscr_sprite = linetoscr_16_shrink1f_sh_spr;
						break;
						case 4:
						pfield_do_linetoscr_normal = linetoscr_32_shrink1f_sh;
						pfield_do_linetoscr_sprite = linetoscr_32_shrink1f_sh_spr;
						break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2:
						pfield_do_linetoscr_normal = linetoscr_16_shrink1_sh;
						pfield_do_linetoscr_sprite = linetoscr_16_shrink1_sh_spr;
						break;
						case 4:
						pfield_do_linetoscr_normal = linetoscr_32_shrink1_sh;
						pfield_do_linetoscr_sprite = linetoscr_32_shrink1_sh_spr;
						break;
					}
				}
			} else if (res_shift == -2) {
				if (SAEV_config.video.lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2:
						pfield_do_linetoscr_normal = linetoscr_16_shrink2f_sh;
						pfield_do_linetoscr_sprite = linetoscr_16_shrink2f_sh_spr;
						break;
						case 4:
						pfield_do_linetoscr_normal = linetoscr_32_shrink2f_sh;
						pfield_do_linetoscr_sprite = linetoscr_32_shrink2f_sh_spr;
						break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2:
						pfield_do_linetoscr_normal = linetoscr_16_shrink2_sh;
						pfield_do_linetoscr_sprite = linetoscr_16_shrink2_sh_spr;
						break;
						case 4:
						pfield_do_linetoscr_normal = linetoscr_32_shrink2_sh;
						pfield_do_linetoscr_sprite = linetoscr_32_shrink2_sh_spr;
						break;
					}
				}
			}
		}
		//#endif /* ECS_DENISE */
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) && !ecsshres) {
			if (res_shift == 0) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2:
					pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_16_genlock : linetoscr_16;
					pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_16_spr_genlock : linetoscr_16_spr;
					break;
					case 4:
					pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_32_genlock : linetoscr_32;
					pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_32_spr_genlock : linetoscr_32_spr;
					break;
				}
			} else if (res_shift == 2) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2:
					pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_16_stretch2_genlock : linetoscr_16_stretch2;
					pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_16_stretch2_spr_genlock : linetoscr_16_stretch2_spr;
					break;
					case 4:
					pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_32_stretch2_genlock : linetoscr_32_stretch2;
					pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_32_stretch2_spr_genlock : linetoscr_32_stretch2_spr;
					break;
				}
			} else if (res_shift == 1) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2:
					pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_16_stretch1_genlock : linetoscr_16_stretch1;
					pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_16_stretch1_spr_genlock : linetoscr_16_stretch1_spr;
					break;
					case 4:
					pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_32_stretch1_genlock : linetoscr_32_stretch1;
					pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_32_stretch1_spr_genlock : linetoscr_32_stretch1_spr;
					break;
				}
			} else if (res_shift == -1) {
					if (SAEV_config.video.lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2:
						pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_16_shrink1f_genlock : linetoscr_16_shrink1f;
						pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_16_shrink1f_spr_genlock : linetoscr_16_shrink1f_spr;
						break;
						case 4:
						pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_32_shrink1f_genlock : linetoscr_32_shrink1f;
						pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_32_shrink1f_spr_genlock : linetoscr_32_shrink1f_spr;
						break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2:
						pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_16_shrink1_genlock : linetoscr_16_shrink1;
						pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_16_shrink1_spr_genlock : linetoscr_16_shrink1_spr;
						break;
						case 4:
						pfield_do_linetoscr_normal = need_genlock_data ? linetoscr_32_shrink1_genlock : linetoscr_32_shrink1;
						pfield_do_linetoscr_sprite = need_genlock_data ? linetoscr_32_shrink1_spr_genlock : linetoscr_32_shrink1_spr;
						break;
					}
				}
			}
		}
	}

	// left or right AGA border sprite
	function pfield_do_linetoscr_bordersprite_aga(start, stop, blank) {
		if (blank) {
			pfield_do_fill_line(start, stop, blank);
			return;
		}
		pfield_do_linetoscr_spriteonly(src_pixel, start, stop);
	}

	function dummy_worker(start, stop, blank)	{}

	var ham_decode_pixel = 0; //int
	var ham_lastcolor = 0; //uint

	/* Decode HAM in the invisible portion of the display (left of VISIBLE_LEFT_BORDER),
	 * but don't draw anything in.  This is done to prepare HAM_LASTCOLOR for later, when decode_ham runs. */
	function init_ham_decoding() {
		var unpainted_amiga = unpainted;

		ham_decode_pixel = src_pixel;
		ham_lastcolor = color_reg_get(colors_for_drawing, 0);

		if (!bplham) {
			if (unpainted_amiga > 0) {
				var pv = pixdata.apixels[ham_decode_pixel + unpainted_amiga - 1];
				//#ifdef AGA
				if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA)
					ham_lastcolor = colors_for_drawing.color_regs_aga[pv ^ bplxor] & 0xffffff;
				else
				//#endif
					ham_lastcolor = colors_for_drawing.color_regs_ecs[pv] & 0xfff;
			}
		//#ifdef AGA
		} else if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			if (bplplanecnt >= 7) { /* AGA mode HAM8 */
				while (unpainted_amiga-- > 0) {
					var pv = pixdata.apixels[ham_decode_pixel++] ^ bplxor;
					switch (pv & 0x3) {
						case 0x0: ham_lastcolor = colors_for_drawing.color_regs_aga[pv >> 2] & 0xffffff; break;
						case 0x1: ham_lastcolor &= 0xFFFF03; ham_lastcolor |= (pv & 0xFC); break;
						case 0x2: ham_lastcolor &= 0x03FFFF; ham_lastcolor |= (pv & 0xFC) << 16; break;
						case 0x3: ham_lastcolor &= 0xFF03FF; ham_lastcolor |= (pv & 0xFC) << 8; break;
					}
				}
			} else { /* AGA mode HAM6 */
				while (unpainted_amiga-- > 0) {
					var pv = pixdata.apixels[ham_decode_pixel++] ^ bplxor;
					switch (pv & 0x30) {
						case 0x00: ham_lastcolor = colors_for_drawing.color_regs_aga[pv] & 0xffffff; break;
						case 0x10: ham_lastcolor &= 0xFFFF00; ham_lastcolor |= (pv & 0xF) << 4; break;
						case 0x20: ham_lastcolor &= 0x00FFFF; ham_lastcolor |= (pv & 0xF) << 20; break;
						case 0x30: ham_lastcolor &= 0xFF00FF; ham_lastcolor |= (pv & 0xF) << 12; break;
					}
				}
			}
		//#endif
		} else {
			/* OCS/ECS mode HAM6 */
			while (unpainted_amiga-- > 0) {
				var pv = pixdata.apixels[ham_decode_pixel++];
				switch (pv & 0x30) {
					case 0x00: ham_lastcolor = colors_for_drawing.color_regs_ecs[pv] & 0xfff; break;
					case 0x10: ham_lastcolor &= 0xFF0; ham_lastcolor |= (pv & 0xF); break;
					case 0x20: ham_lastcolor &= 0x0FF; ham_lastcolor |= (pv & 0xF) << 8; break;
					case 0x30: ham_lastcolor &= 0xF0F; ham_lastcolor |= (pv & 0xF) << 4; break;
				}
			}
		}
	}

	function decode_ham(pix, stoppos, blank) {
		var todraw_amiga = res_shift_from_window(stoppos - pix);
		var hdp = ham_decode_pixel;

		if (!bplham) {
			while (todraw_amiga-- > 0) {
				var pv = pixdata.apixels[ham_decode_pixel];
				//#ifdef AGA
				if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA)
					ham_lastcolor = colors_for_drawing.color_regs_aga[pv ^ bplxor] & 0xffffff;
				else
				//#endif
					ham_lastcolor = colors_for_drawing.color_regs_ecs[pv] & 0xfff;

				ham_linebuf[ham_decode_pixel++] = ham_lastcolor;
			}
		//#ifdef AGA
		} else if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			if (bplplanecnt >= 7) { /* AGA mode HAM8 */
				while (todraw_amiga-- > 0) {
					var pv = pixdata.apixels[ham_decode_pixel] ^ bplxor;
					switch (pv & 0x3) {
						case 0x0: ham_lastcolor = colors_for_drawing.color_regs_aga[pv >> 2] & 0xffffff; break;
						case 0x1: ham_lastcolor &= 0xFFFF03; ham_lastcolor |= (pv & 0xFC); break;
						case 0x2: ham_lastcolor &= 0x03FFFF; ham_lastcolor |= (pv & 0xFC) << 16; break;
						case 0x3: ham_lastcolor &= 0xFF03FF; ham_lastcolor |= (pv & 0xFC) << 8; break;
					}
					ham_linebuf[ham_decode_pixel++] = ham_lastcolor;
				}
			} else { /* AGA mode HAM6 */
				while (todraw_amiga-- > 0) {
					var pv = pixdata.apixels[ham_decode_pixel] ^ bplxor;
					switch (pv & 0x30) {
						case 0x00: ham_lastcolor = colors_for_drawing.color_regs_aga[pv] & 0xffffff; break;
						case 0x10: ham_lastcolor &= 0xFFFF00; ham_lastcolor |= (pv & 0xF) << 4; break;
						case 0x20: ham_lastcolor &= 0x00FFFF; ham_lastcolor |= (pv & 0xF) << 20; break;
						case 0x30: ham_lastcolor &= 0xFF00FF; ham_lastcolor |= (pv & 0xF) << 12; break;
					}
					ham_linebuf[ham_decode_pixel++] = ham_lastcolor;
				}
			}
		//#endif
		} else {
			/* OCS/ECS mode HAM6 */
			while (todraw_amiga-- > 0) {
				var pv = pixdata.apixels[ham_decode_pixel];
				switch (pv & 0x30) {
					case 0x00: ham_lastcolor = colors_for_drawing.color_regs_ecs[pv] & 0xfff; break;
					case 0x10: ham_lastcolor &= 0xFF0; ham_lastcolor |= (pv & 0xF); break;
					case 0x20: ham_lastcolor &= 0x0FF; ham_lastcolor |= (pv & 0xF) << 8; break;
					case 0x30: ham_lastcolor &= 0xF0F; ham_lastcolor |= (pv & 0xF) << 4; break;
				}
				ham_linebuf[ham_decode_pixel++] = ham_lastcolor;
			}
		}
	}

	/*function erase_ham_right_border(pix, stoppos, blank) {
		if (stoppos < playfield_end)
			return;
		// erase right border in HAM modes or old HAM data may be visible
		// if DDFSTOP < DIWSTOP (Uridium II title screen)
		var todraw_amiga = res_shift_from_window(stoppos - pix);
		while (todraw_amiga-- > 0)
			ham_linebuf[ham_decode_pixel++] = 0;
	}*/

	function gen_pfield_tables() {
		if (dblpf_ms1 !== null)
			return;

		dblpf_ms1 = new Array(256)
		dblpf_ms2 = new Array(256)
		dblpf_ms = new Array(256);
		dblpf_ind1 = new Array(256)
		dblpf_ind2 = new Array(256);
		dblpf_2nd1 = new Array(256)
		dblpf_2nd2 = new Array(256);
		//#ifdef AGA
		dblpf_ind1_aga = new Array(256);
		dblpf_ind2_aga = new Array(256);
		//#endif
		sprite_offs = new Array(256);
		clxtab = new Uint32Array(256);

		for (var i = 0; i < 256; i++) {
			var plane1 = ((i >> 0) & 1) | ((i >> 1) & 2) | ((i >> 2) & 4) | ((i >> 3) & 8);
			var plane2 = ((i >> 1) & 1) | ((i >> 2) & 2) | ((i >> 3) & 4) | ((i >> 4) & 8);

			dblpf_2nd1[i] = plane1 == 0 && plane2 != 0;
			dblpf_2nd2[i] = plane2 != 0;

			//#ifdef AGA
			dblpf_ind1_aga[i] = plane1 == 0 ? plane2 : plane1;
			dblpf_ind2_aga[i] = plane2 == 0 ? plane1 : plane2;
			//#endif

			dblpf_ms1[i] = plane1 == 0 ? (plane2 == 0 ? 16 : 8) : 0;
			dblpf_ms2[i] = plane2 == 0 ? (plane1 == 0 ? 16 : 0) : 8;
			dblpf_ms[i] = i == 0 ? 16 : 8;

			if (plane2 > 0)
				plane2 += 8;
			dblpf_ind1[i] = i >= 128 ? i & 0x7F : (plane1 == 0 ? plane2 : plane1);
			dblpf_ind2[i] = i >= 128 ? i & 0x7F : (plane2 == 0 ? plane1 : plane2);

			// Hack for OCS/ECS-only dualplayfield chipset bug.
			// If PF2P2 is invalid (>5), playfield color becomes transparent but
			// playfield still hides playfield under it! (if plfpri is set)
			if (i & 64) {
				dblpf_ind2[i] = 0;
				dblpf_ind1[i] = 0;
			}

			sprite_offs[i] = (i & 15) ? 0 : 2;

			clxtab[i] = ((((i & 3) && (i & 12)) << 9)
				| (((i & 3) && (i & 48)) << 10)
				| (((i & 3) && (i & 192)) << 11)
				| (((i & 12) && (i & 48)) << 12)
				| (((i & 12) && (i & 192)) << 13)
				| (((i & 48) && (i & 192)) << 14));

		}
		//memset(all_ones, 0xff, MAX_PIXELS_PER_LINE);
		//SAEF_memset(all_ones,0, 0xff, MAX_PIXELS_PER_LINE);
	}

	/* When looking at this function and the ones that inline it, bear in mind
	what an optimizing compiler will do with this code.  All callers of this
	function only pass in constant arguments (except for E).  This means
	that many of the if statements will go away completely after inlining. */
	/*STATIC_INLINE void draw_sprites_1 (struct sprite_entry *e, int dualpf, int has_attach) {
		uae_u16 *buf = spixels + e->first_pixel;
		uae_u8 *stbuf = spixstate.bytes + e->first_pixel;
		int spr_pos, pos;

		buf -= e->pos;
		stbuf -= e->pos;

		spr_pos = e->pos + ((DIW_DDF_OFFSET - DISPLAY_LEFT_SHIFT) << sprite_buffer_res);

		if (spr_pos < sprite_first_x)
			sprite_first_x = spr_pos;

		for (pos = e->pos; pos < e->max; pos++, spr_pos++) {
			if (spr_pos >= 0 && spr_pos < MAX_PIXELS_PER_LINE) {
				spritepixels[spr_pos].data = buf[pos];
				spritepixels[spr_pos].stdata = stbuf[pos];
				spritepixels[spr_pos].attach = has_attach;
			}
		}

		if (spr_pos > sprite_last_x)
			sprite_last_x = spr_pos;
	}*/
	function draw_sprites_1(e, dualpf, has_attach) {
		/*uae_u16 *buf = spixels + e->first_pixel;
		uae_u8 *stbuf = spixstate.bytes + e->first_pixel;
		buf -= e->pos;
		stbuf -= e->pos;*/

		var spr_pos = e.pos + ((DIW_DDF_OFFSET - DISPLAY_LEFT_SHIFT) << sprite_buffer_res);

		if (spr_pos < sprite_first_x)
			sprite_first_x = spr_pos;

		for (var pos = e.pos; pos < e.max; pos++, spr_pos++) {
			if (spr_pos >= 0 && spr_pos < MAX_PIXELS_PER_LINE) {
				//spritepixels[spr_pos].data = buf[pos];
				//spritepixels[spr_pos].stdata = stbuf[pos];
				//spritepixels[spr_pos].attach = has_attach;
				spritepixels[spr_pos].data = spixels[e.first_pixel - e.pos + pos];
				spritepixels[spr_pos].stdata = spixstate.bytes[e.first_pixel - e.pos + pos];
				spritepixels[spr_pos].attach = has_attach;
			}
		}

		if (spr_pos > sprite_last_x)
			sprite_last_x = spr_pos;
	}

	/* OPT inline, ok
	function draw_sprites_normal_sp_nat(e) { draw_sprites_1(e, 0, 0); }
	function draw_sprites_normal_dp_nat(e) { draw_sprites_1(e, 1, 0); }
	function draw_sprites_normal_sp_at(e) { draw_sprites_1(e, 0, 1); }
	function draw_sprites_normal_dp_at(e) { draw_sprites_1(e, 1, 1); }
	function draw_sprites_ecs(e) {
		if (e->has_attached) {
			if (bpldualpf)
				draw_sprites_normal_dp_at(e);
			else
				draw_sprites_normal_sp_at(e);
		} else {
			if (bpldualpf)
				draw_sprites_normal_dp_nat(e);
			else
				draw_sprites_normal_sp_nat(e);
		}
	}*/
	/*OPT inline, ok
	function draw_sprites_ecs(e) {
		draw_sprites_1(e, bpldualpf, e.has_attached);
	}
	//#ifdef AGA
	function draw_sprites_aga(e, aga) {
		draw_sprites_1(e, bpldualpf, e.has_attached);
	}
	//#endif*/

	//#ifdef AGA
	/* clear possible bitplane data outside DIW area */
	function clear_bitplane_border_aga() {
		const v = 0;
		var shift = res_shift;
		var i, start, end;

		if (shift < 0) {
			shift = -shift;
			start = pixels_offset + (playfield_start << shift);
			end = start + ((real_playfield_start - playfield_start) << shift);
			for (i = start; i < end; i++) pixdata.apixels[i] = v;

			start = pixels_offset + (real_playfield_end << shift),
			end = start + ((playfield_end - real_playfield_end) << shift);
			for (i = start; i < end; i++) pixdata.apixels[i] = v;
		} else {
			start = pixels_offset + (playfield_start >> shift);
			end = start + ((real_playfield_start - playfield_start) >> shift);
			for (i = start; i < end; i++) pixdata.apixels[i] = v;

			start = pixels_offset + (real_playfield_end >> shift);
			end = start + ((playfield_end - real_playfield_end) >> shift);
			for (i = start; i < end; i++) pixdata.apixels[i] = v;
		}
	}
	//#endif

	function weird_bitplane_fix(start, end) {
		var sh = lores_shift;
		//uae_u8 *p = pixdata.apixels + pixels_offset;

		start >>= sh;
		end >>= sh;
		/*if (bplplanecnt == 5 && !bpldualpf) {
			for (var i = start; i < end; i++) {
				if (p[i] & 16) p[i] = 16;
			}
		} else if (bpldualpf && bpldualpfpri) {
			for (var i = start; i < end; i++) {
				if (p[i] & (2 | 8 | 32)) p[i] |= 0x40;
			}
		} else if (bpldualpf && !bpldualpfpri) {
			for (var i = start; i < end; i++) {
				p[i] &= ~(2 | 8 | 32);
			}
		}*/
		if (bplplanecnt == 5 && !bpldualpf) {
			/* emulate OCS/ECS only undocumented "SWIV" hardware feature */
			for (var i = pixels_offset + start; i < pixels_offset + end; i++) {
				if (pixdata.apixels[i] & 16) pixdata.apixels[i] = 16;
			}
		} else if (bpldualpf && bpldualpfpri) {
			/* in dualplayfield mode this feature is even more strange.. */
			for (var i = pixels_offset + start; i < pixels_offset + end; i++) {
				if (pixdata.apixels[i] & (2 | 8 | 32)) pixdata.apixels[i] |= 0x40;
			}
		} else if (bpldualpf && !bpldualpfpri) {
			for (var i = pixels_offset + start; i < pixels_offset + end; i++) {
				pixdata.apixels[i] &= ~(2 | 8 | 32);
			}
		}
	}

	/* We use the compiler"s inlining ability to ensure that PLANES is in effect a compile time
	constant.  That will cause some unnecessary code to be optimized away.
	Don't touch this if you don't know what you are doing.  */

	/*#define MERGE(a,b,mask,shift) do {\
		uae_u32 tmp = mask & (a ^ (b >> shift)); \
		a ^= tmp; \
		b ^= (tmp << shift); \
	} while (0)

	#define GETLONG(P) (*(uae_u32 *)P)

	STATIC_INLINE void pfield_doline_1 (uae_u32 *pixels, int wordcount, int planes) {
		while (wordcount-- > 0) {
			uae_u32 b0, b1, b2, b3, b4, b5, b6, b7;

			b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, b7 = 0;
			switch (planes) {
			#ifdef AGA
			case 8: b0 = GETLONG (real_bplpt[7]); real_bplpt[7] += 4;
			case 7: b1 = GETLONG (real_bplpt[6]); real_bplpt[6] += 4;
			#endif
			case 6: b2 = GETLONG (real_bplpt[5]); real_bplpt[5] += 4;
			case 5: b3 = GETLONG (real_bplpt[4]); real_bplpt[4] += 4;
			case 4: b4 = GETLONG (real_bplpt[3]); real_bplpt[3] += 4;
			case 3: b5 = GETLONG (real_bplpt[2]); real_bplpt[2] += 4;
			case 2: b6 = GETLONG (real_bplpt[1]); real_bplpt[1] += 4;
			case 1: b7 = GETLONG (real_bplpt[0]); real_bplpt[0] += 4;
			}

			MERGE (b0, b1, 0x55555555, 1);
			MERGE (b2, b3, 0x55555555, 1);
			MERGE (b4, b5, 0x55555555, 1);
			MERGE (b6, b7, 0x55555555, 1);

			MERGE (b0, b2, 0x33333333, 2);
			MERGE (b1, b3, 0x33333333, 2);
			MERGE (b4, b6, 0x33333333, 2);
			MERGE (b5, b7, 0x33333333, 2);

			MERGE (b0, b4, 0x0f0f0f0f, 4);
			MERGE (b1, b5, 0x0f0f0f0f, 4);
			MERGE (b2, b6, 0x0f0f0f0f, 4);
			MERGE (b3, b7, 0x0f0f0f0f, 4);

			MERGE (b0, b1, 0x00ff00ff, 8);
			MERGE (b2, b3, 0x00ff00ff, 8);
			MERGE (b4, b5, 0x00ff00ff, 8);
			MERGE (b6, b7, 0x00ff00ff, 8);

			MERGE (b0, b2, 0x0000ffff, 16);
			do_put_mem_long (pixels, b0);
			do_put_mem_long (pixels + 4, b2);
			MERGE (b1, b3, 0x0000ffff, 16);
			do_put_mem_long (pixels + 2, b1);
			do_put_mem_long (pixels + 6, b3);
			MERGE (b4, b6, 0x0000ffff, 16);
			do_put_mem_long (pixels + 1, b4);
			do_put_mem_long (pixels + 5, b6);
			MERGE (b5, b7, 0x0000ffff, 16);
			do_put_mem_long (pixels + 3, b5);
			do_put_mem_long (pixels + 7, b7);
			pixels += 8;
		}
	}

	// See above for comments on inlining.  These functions should _not_ be inlined themselves.
	static void NOINLINE pfield_doline_n1 (uae_u32 *data, int count) { pfield_doline_1 (data, count, 1); }
	static void NOINLINE pfield_doline_n2 (uae_u32 *data, int count) { pfield_doline_1 (data, count, 2); }
	static void NOINLINE pfield_doline_n3 (uae_u32 *data, int count) { pfield_doline_1 (data, count, 3); }
	static void NOINLINE pfield_doline_n4 (uae_u32 *data, int count) { pfield_doline_1 (data, count, 4); }
	static void NOINLINE pfield_doline_n5 (uae_u32 *data, int count) { pfield_doline_1 (data, count, 5); }
	static void NOINLINE pfield_doline_n6 (uae_u32 *data, int count) { pfield_doline_1 (data, count, 6); }
	#ifdef AGA
	static void NOINLINE pfield_doline_n7 (uae_u32 *data, int count) { pfield_doline_1 (data, count, 7); }
	static void NOINLINE pfield_doline_n8 (uae_u32 *data, int count) { pfield_doline_1 (data, count, 8); }
	#endif

	static void pfield_doline (int lineno) {
		int wordcount = dp_for_drawing->plflinelen;
		uae_u32 *data = pixdata.apixels_l + MAX_PIXELS_PER_LINE / 4;

		#ifdef SMART_UPDATE
		#define DATA_POINTER(n) ((debug_bpl_mask & (1 << n)) ? (line_data[lineno] + (n) * MAX_WORDS_PER_LINE * 2) : (debug_bpl_mask_one ? all_ones : all_zeros))
		real_bplpt[0] = DATA_POINTER (0);
		real_bplpt[1] = DATA_POINTER (1);
		real_bplpt[2] = DATA_POINTER (2);
		real_bplpt[3] = DATA_POINTER (3);
		real_bplpt[4] = DATA_POINTER (4);
		real_bplpt[5] = DATA_POINTER (5);
		#ifdef AGA
		real_bplpt[6] = DATA_POINTER (6);
		real_bplpt[7] = DATA_POINTER (7);
		#endif
		#endif

		switch (bplplanecnt) {
		default: break;
		case 0: memset (data, 0, wordcount * 32); break;
		case 1: pfield_doline_n1 (data, wordcount); break;
		case 2: pfield_doline_n2 (data, wordcount); break;
		case 3: pfield_doline_n3 (data, wordcount); break;
		case 4: pfield_doline_n4 (data, wordcount); break;
		case 5: pfield_doline_n5 (data, wordcount); break;
		case 6: pfield_doline_n6 (data, wordcount); break;
		#ifdef AGA
		case 7: pfield_doline_n7 (data, wordcount); break;
		case 8: pfield_doline_n8 (data, wordcount); break;
		#endif
		}

		if (refresh_indicator_buffer && refresh_indicator_height > lineno) {
			uae_u8 *opline = refresh_indicator_buffer + lineno * MAX_PIXELS_PER_LINE * 2;
			wordcount *= 32;
			if (!memcmp(opline, data, wordcount)) {
				if (refresh_indicator_changed[lineno] != 0xff) {
					refresh_indicator_changed[lineno]++;
					if (refresh_indicator_changed[lineno] > refresh_indicator_changed_prev[lineno]) {
						refresh_indicator_changed_prev[lineno] = refresh_indicator_changed[lineno];
					}
				}
			} else {
				memcpy(opline, data, wordcount);
				if (refresh_indicator_changed[lineno] != refresh_indicator_changed_prev[lineno])
					refresh_indicator_changed_prev[lineno] = 0;
				refresh_indicator_changed[lineno] = 0;
			}
		}
	}*/

	const PLANE_OFFS1 = MAX_WORDS_PER_LINE_FULL * 1;
	const PLANE_OFFS2 = MAX_WORDS_PER_LINE_FULL * 2;
	const PLANE_OFFS3 = MAX_WORDS_PER_LINE_FULL * 3;
	const PLANE_OFFS4 = MAX_WORDS_PER_LINE_FULL * 4;
	const PLANE_OFFS5 = MAX_WORDS_PER_LINE_FULL * 5;
	const PLANE_OFFS6 = MAX_WORDS_PER_LINE_FULL * 6;
	const PLANE_OFFS7 = MAX_WORDS_PER_LINE_FULL * 7;

	function pfield_doline(lineno) {
		var wordcount = dp_for_drawing.plflinelen;
		//var pixels = MAX_PIXELS_PER_LINE;
		var pixels_l = MAX_PIXELS_PER_LINE >> 2;

		if (bplplanecnt == 0) {
			//for (var i = pixels, j = pixels + wordcount * 32; i < j; i++) pixdata.apixels[i] = 0;
			for (var i = pixels_l, j = pixels_l + wordcount * 8; i < j; i++) pixdata.apixels_l[i] = 0;
			return;
		}

		var data = line_data[lineno];
		var off0 = 0;
		var off1 = PLANE_OFFS1;
		var off2 = PLANE_OFFS2;
		var off3 = PLANE_OFFS3;
		var off4 = PLANE_OFFS4;
		var off5 = PLANE_OFFS5;
		var off6 = PLANE_OFFS6;
		var off7 = PLANE_OFFS7;

		while (wordcount-- > 0) {
			var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, b7 = 0; //u32

			switch (bplplanecnt) {
				case 8: b0 = data[off7++];
				case 7: b1 = data[off6++];
				case 6: b2 = data[off5++];
				case 5: b3 = data[off4++];
				case 4: b4 = data[off3++];
				case 3: b5 = data[off2++];
				case 2: b6 = data[off1++];
				case 1: b7 = data[off0++];
			}

			var tmp = (b0 ^ (b1 >>> 1)) & 0x55555555; b0 ^= tmp; b1 ^= (tmp << 1);
			tmp = (b2 ^ (b3 >>> 1)) & 0x55555555; b2 ^= tmp; b3 ^= (tmp << 1);
			tmp = (b4 ^ (b5 >>> 1)) & 0x55555555; b4 ^= tmp; b5 ^= (tmp << 1);
			tmp = (b6 ^ (b7 >>> 1)) & 0x55555555; b6 ^= tmp; b7 ^= (tmp << 1);

			tmp = (b0 ^ (b2 >>> 2)) & 0x33333333; b0 ^= tmp; b2 ^= (tmp << 2);
			tmp = (b1 ^ (b3 >>> 2)) & 0x33333333; b1 ^= tmp; b3 ^= (tmp << 2);
			tmp = (b4 ^ (b6 >>> 2)) & 0x33333333; b4 ^= tmp; b6 ^= (tmp << 2);
			tmp = (b5 ^ (b7 >>> 2)) & 0x33333333; b5 ^= tmp; b7 ^= (tmp << 2);

			tmp = (b0 ^ (b4 >>> 4)) & 0x0f0f0f0f; b0 ^= tmp; b4 ^= (tmp << 4);
			tmp = (b1 ^ (b5 >>> 4)) & 0x0f0f0f0f; b1 ^= tmp; b5 ^= (tmp << 4);
			tmp = (b2 ^ (b6 >>> 4)) & 0x0f0f0f0f; b2 ^= tmp; b6 ^= (tmp << 4);
			tmp = (b3 ^ (b7 >>> 4)) & 0x0f0f0f0f; b3 ^= tmp; b7 ^= (tmp << 4);

			tmp = (b0 ^ (b1 >>> 8)) & 0x00ff00ff; b0 ^= tmp; b1 ^= (tmp << 8);
			tmp = (b2 ^ (b3 >>> 8)) & 0x00ff00ff; b2 ^= tmp; b3 ^= (tmp << 8);
			tmp = (b4 ^ (b5 >>> 8)) & 0x00ff00ff; b4 ^= tmp; b5 ^= (tmp << 8);
			tmp = (b6 ^ (b7 >>> 8)) & 0x00ff00ff; b6 ^= tmp; b7 ^= (tmp << 8);

			tmp = (b0 ^ (b2 >>> 16)) & 0x0000ffff; b0 ^= tmp; b2 ^= (tmp << 16);
			tmp = (b1 ^ (b3 >>> 16)) & 0x0000ffff; b1 ^= tmp; b3 ^= (tmp << 16);
			tmp = (b4 ^ (b6 >>> 16)) & 0x0000ffff; b4 ^= tmp; b6 ^= (tmp << 16);
			tmp = (b5 ^ (b7 >>> 16)) & 0x0000ffff; b5 ^= tmp; b7 ^= (tmp << 16);

			/*pixdata.apixels[pixels     ] = b0 >>> 24;
			pixdata.apixels[pixels +  1] = b0 >>> 16;
			pixdata.apixels[pixels +  2] = b0 >>> 8;
			pixdata.apixels[pixels +  3] = b0;
			pixdata.apixels[pixels +  4] = b4 >>> 24;
			pixdata.apixels[pixels +  5] = b4 >>> 16;
			pixdata.apixels[pixels +  6] = b4 >>> 8;
			pixdata.apixels[pixels +  7] = b4;
			pixdata.apixels[pixels +  8] = b1 >>> 24;
			pixdata.apixels[pixels +  9] = b1 >>> 16;
			pixdata.apixels[pixels + 10] = b1 >>> 8;
			pixdata.apixels[pixels + 11] = b1;
			pixdata.apixels[pixels + 12] = b5 >>> 24;
			pixdata.apixels[pixels + 13] = b5 >>> 16;
			pixdata.apixels[pixels + 14] = b5 >>> 8;
			pixdata.apixels[pixels + 15] = b5;
			pixdata.apixels[pixels + 16] = b2 >>> 24;
			pixdata.apixels[pixels + 17] = b2 >>> 16;
			pixdata.apixels[pixels + 18] = b2 >>> 8;
			pixdata.apixels[pixels + 19] = b2;
			pixdata.apixels[pixels + 20] = b6 >>> 24;
			pixdata.apixels[pixels + 21] = b6 >>> 16;
			pixdata.apixels[pixels + 22] = b6 >>> 8;
			pixdata.apixels[pixels + 23] = b6;
			pixdata.apixels[pixels + 24] = b3 >>> 24;
			pixdata.apixels[pixels + 25] = b3 >>> 16;
			pixdata.apixels[pixels + 26] = b3 >>> 8;
			pixdata.apixels[pixels + 27] = b3;
			pixdata.apixels[pixels + 28] = b7 >>> 24;
			pixdata.apixels[pixels + 29] = b7 >>> 16;
			pixdata.apixels[pixels + 30] = b7 >>> 8;
			pixdata.apixels[pixels + 31] = b7;
			pixels += 32;
			*/

			if (SAEC_LITTLE_ENDIAN) { //byte-swap
				pixdata.apixels_l[pixels_l    ] =  ((b0 & 0x000000ff) << 24) | ((b0 & 0x0000ff00) << 8) | ((b0 & 0x00ff0000) >>> 8) | ((b0 & 0xff000000) >>> 24);
				pixdata.apixels_l[pixels_l + 1] =  ((b4 & 0x000000ff) << 24) | ((b4 & 0x0000ff00) << 8) | ((b4 & 0x00ff0000) >>> 8) | ((b4 & 0xff000000) >>> 24);
				pixdata.apixels_l[pixels_l + 2] =  ((b1 & 0x000000ff) << 24) | ((b1 & 0x0000ff00) << 8) | ((b1 & 0x00ff0000) >>> 8) | ((b1 & 0xff000000) >>> 24);
				pixdata.apixels_l[pixels_l + 3] =  ((b5 & 0x000000ff) << 24) | ((b5 & 0x0000ff00) << 8) | ((b5 & 0x00ff0000) >>> 8) | ((b5 & 0xff000000) >>> 24);
				pixdata.apixels_l[pixels_l + 4] =  ((b2 & 0x000000ff) << 24) | ((b2 & 0x0000ff00) << 8) | ((b2 & 0x00ff0000) >>> 8) | ((b2 & 0xff000000) >>> 24);
				pixdata.apixels_l[pixels_l + 5] =  ((b6 & 0x000000ff) << 24) | ((b6 & 0x0000ff00) << 8) | ((b6 & 0x00ff0000) >>> 8) | ((b6 & 0xff000000) >>> 24);
				pixdata.apixels_l[pixels_l + 6] =  ((b3 & 0x000000ff) << 24) | ((b3 & 0x0000ff00) << 8) | ((b3 & 0x00ff0000) >>> 8) | ((b3 & 0xff000000) >>> 24);
				pixdata.apixels_l[pixels_l + 7] =  ((b7 & 0x000000ff) << 24) | ((b7 & 0x0000ff00) << 8) | ((b7 & 0x00ff0000) >>> 8) | ((b7 & 0xff000000) >>> 24);
			} else {
				pixdata.apixels_l[pixels_l    ] =  b0;
				pixdata.apixels_l[pixels_l + 1] =  b4;
				pixdata.apixels_l[pixels_l + 2] =  b1;
				pixdata.apixels_l[pixels_l + 3] =  b5;
				pixdata.apixels_l[pixels_l + 4] =  b2;
				pixdata.apixels_l[pixels_l + 5] =  b6;
				pixdata.apixels_l[pixels_l + 6] =  b3;
				pixdata.apixels_l[pixels_l + 7] =  b7;
			}
			pixels_l += 8;
		}

		if (refresh_indicator_buffer !== null && refresh_indicator_height > lineno) {
			wordcount = dp_for_drawing.plflinelen;

			//uae_u8 *opline = refresh_indicator_buffer + lineno * MAX_PIXELS_PER_LINE * 2;
			//wordcount *= 32;

			var opline = new Uint32Array(refresh_indicator_buffer, lineno * MAX_PIXELS_PER_LINE * 2);
			wordcount *= 8; // * 32 / 4

			var same = true;
			for (var i = 0; i < wordcount; i++) {
				if (opline[i] != data[i]) {
					same = false;
					break;
				}
			}
			//if (!memcmp(opline, data, wordcount)) {
			if (same) {
				if (refresh_indicator_changed[lineno] != 0xff) {
					refresh_indicator_changed[lineno]++;
					if (refresh_indicator_changed[lineno] > refresh_indicator_changed_prev[lineno]) {
						refresh_indicator_changed_prev[lineno] = refresh_indicator_changed[lineno];
					}
				}
			} else {
				//memcpy(opline, data, wordcount);
				for (i = 0; i < wordcount; i++)
					opline[i] = data[i];

				if (refresh_indicator_changed[lineno] != refresh_indicator_changed_prev[lineno])
					refresh_indicator_changed_prev[lineno] = 0;
				refresh_indicator_changed[lineno] = 0;
			}
		}
	}


	var oldbufmem = null; //u8 *
	var oldheight = 0, oldpitch = 0; //int
	var oldgenlock = false; //bool

	function init_row_map() {
		//static uae_u8 *oldbufmem;
		//static int oldheight, oldpitch;
		//static bool oldgenlock;
		var vb = gfxvidinfo.drawbuffer;
		var bpp16 = vb.pixbytes == 2; //OWN
		var i, j;

		if (vb.height_allocated > SAEC_Video_MAX_UAE_HEIGHT) {
			SAEF_fatal(SAEE_Internal, "playfield.init_row_map() resolution too high, aborting...");
			//abort();
		}
		if (row_map === null) {
			//row_map = xmalloc(uae_u8*, SAEC_Video_MAX_UAE_HEIGHT + 1);
			//row_map_genlock = xmalloc(uae_u8*, SAEC_Video_MAX_UAE_HEIGHT + 1);
			row_map = new Array(SAEC_Video_MAX_UAE_HEIGHT + 1);
			//row_map_genlock = new Array(SAEC_Video_MAX_UAE_HEIGHT + 1);
		}

		if (oldbufmem !== null && oldbufmem === vb.bufmem &&
			oldheight == vb.height_allocated &&
			oldpitch == vb.rowbytes &&
			oldgenlock == init_genlock_data
		) return;

		/*xfree(row_map_genlock_buffer);
		row_map_genlock_buffer = null;
		if (init_genlock_data)
			row_map_genlock_buffer = xcalloc(uae_u8, vb.width_allocated * (vb.height_allocated + 2));*/

		//xfree(row_map_color_burst_buffer);
		row_map_color_burst_buffer = null;
		/*if (currprefs.cs_color_burst) {
			//row_map_color_burst_buffer = xcalloc(uae_u8, vb.height_allocated + 2);
			row_map_color_burst_buffer = new Uint8Array(vb.height_allocated + 2);
		}*/

		j = oldheight == 0 ? SAEC_Video_MAX_UAE_HEIGHT : oldheight;
		for (i = vb.height_allocated; i < SAEC_Video_MAX_UAE_HEIGHT + 1 && i < j + 1; i++) {
			//row_map[i] = row_tmp;
			if (bpp16)
				row_map[i] = new Uint16Array(row_tmp);
			else
				row_map[i] = new Uint32Array(row_tmp);
			//row_map_genlock[i] = row_tmp;
		}
		if (vb.bufmem !== null) {
			var maxbytes = vb.bufmem.byteLength;
			//try {
				for (i = 0, j = vb.bufmem_pos; i < vb.height_allocated; i++, j += vb.rowbytes) {
					//row_map[i] = vb.bufmem + j; //ATT +
					if (j + vb.rowbytes <= maxbytes) {
						if (bpp16)
							row_map[i] = new Uint16Array(vb.bufmem, j, vb.rowbytes >> 1);
						else
							row_map[i] = new Uint32Array(vb.bufmem, j, vb.rowbytes >> 2);
					} else {
						if (bpp16)
							row_map[i] = new Uint16Array(row_tmp);
						else
							row_map[i] = new Uint32Array(row_tmp);
					}
					/*if (init_genlock_data)
						row_map_genlock[i] = row_map_genlock_buffer + vb.width_allocated * (i + 1); //ATT +
					else
						row_map_genlock[i] = null;*/
				}
			/*} catch(e) {
				throw e;
			}*/
		}

		oldbufmem = vb.bufmem;
		oldheight = vb.height_allocated;
		oldpitch = vb.rowbytes;
		oldgenlock = init_genlock_data;
	}
	SAER_Playfield_init_row_map = init_row_map;

	function init_aspect_maps() {
		var i, maxl, h;

		h = gfxvidinfo.drawbuffer.height_allocated;

		if (h == 0) /* Do nothing if the gfx driver hasn"t initialized the screen yet */
			return;

		linedbld = linedbl = SAEV_config.video.vresolution;
		if (doublescan > 0 && interlace_seen <= 0) {
			linedbl = 0;
			linedbld = 1;
		}

		//if (native2amiga_line_map) xfree (native2amiga_line_map);
		//if (amiga2aspect_line_map) xfree (amiga2aspect_line_map);
		/* At least for this array the +1 is necessary. */
		//amiga2aspect_line_map = xmalloc (int, (MAXVPOS + 1) * 2 + 1);
		//native2amiga_line_map = xmalloc (int, h);
		amiga2aspect_line_map = new Array((MAXVPOS + 1) * 2 + 1);
		native2amiga_line_map = new Array(h);

		maxl = (MAXVPOS + 1) << linedbld;
		min_ypos_for_screen = minfirstline << linedbl;
		max_drawn_amiga_line = -1;
		for (i = 0; i < maxl; i++) {
			var v = i - min_ypos_for_screen;
			if (v >= h && max_drawn_amiga_line < 0)
				max_drawn_amiga_line = v;
			if (i < min_ypos_for_screen || v >= h)
				v = -1;
			amiga2aspect_line_map[i] = v;
		}
		if (max_drawn_amiga_line < 0)
			max_drawn_amiga_line = maxl - min_ypos_for_screen;

		for (i = 0; i < h; i++)
			native2amiga_line_map[i] = -1;

		for (i = maxl - 1; i >= min_ypos_for_screen; i--) {
			if (amiga2aspect_line_map[i] == -1)
				continue;
			for (var j = amiga2aspect_line_map[i]; j < h && native2amiga_line_map[j] == -1; j++)
				native2amiga_line_map[j] = i >> linedbl;
		}

		gfxvidinfo.xchange = 1 << (RES_MAX - SAEV_config.video.hresolution);
		gfxvidinfo.ychange = linedbl ? 1 : 2;

		visible_left_start = 0;
		visible_right_stop = MAX_STOP;
		visible_top_start = 0;
		visible_bottom_stop = MAX_STOP;
		set_blanking_limits();
	}

	/* A raster line has been built in the graphics buffer. Tell the graphics code to do anything necessary to display it. */
	/* OWN flush_line() and flush_block() is not used
	function do_flush_line(vb, lineno) { //do_flush_line_1()
		if (lineno < first_drawn_line)
			first_drawn_line = lineno;
		if (lineno > last_drawn_line)
			last_drawn_line = lineno;

		if (gfxvidinfo.maxblocklines == 0) {
			SAER.video.flush_line(vb, lineno);
		} else {
			if ((last_block_line + 2) < lineno) {
				if (first_block_line != NO_BLOCK)
					SAER.video.flush_block(vb, first_block_line, last_block_line);
				first_block_line = lineno;
			}
			last_block_line = lineno;
			if (last_block_line - first_block_line >= gfxvidinfo.maxblocklines) {
				SAER.video.flush_block(vb, first_block_line, last_block_line);
				first_block_line = last_block_line = NO_BLOCK;
			}
		}
	}*/
	/*function do_flush_line(vb, lineno) { //OPT inline ok
		if (vb) do_flush_line_1(vb, lineno);
	}*/

	/* One drawing frame has been finished. Tell the graphics code about it.
	 * Note that the actual flush_screen() call is a no-op for all reasonable systems. */
	function do_flush_screen(vb, start, stop) {
		/* TODO: this flush operation is executed outside locked state! Should be corrected. (sjo 26.9.99) */
		if (vb !== gfxvidinfo.outbuffer)
			return;

		/* OWN flush_block() is not used
		if (gfxvidinfo.maxblocklines != 0 && first_block_line != NO_BLOCK)
			SAER.video.flush_block(vb, first_block_line, last_block_line); */

		SAER.video.unlockscr(vb);

		/* OWN flush_screen() is not used
		if (start <= stop)
			SAER.video.flush_screen(vb, start, stop);
		else if (isvsync_chipset())
			SAER.video.flush_screen(vb, 0, 0); //vsync mode
		*/
	}

	/* We only save hardware registers during the hardware frame. Now, when
	* drawing the frame, we expand the data into a slightly more useful form. */
	function pfield_expand_dp_bplcon() {
		var pfield_mode_changed = false;

		bplres = dp_for_drawing.bplres;
		bplplanecnt = dp_for_drawing.nr_planes;
		bplham = dp_for_drawing.ham_seen;
		bplehb = dp_for_drawing.ehb_seen;
		if ((SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) != 0 && (dp_for_drawing.bplcon2 & 0x0200) != 0)
			bplehb = false;
		issprites = dip_for_drawing.nr_sprites > 0;
		bplcolorburst = (dp_for_drawing.bplcon0 & 0x200) != 0;
		if (!bplcolorburst)
			bplcolorburst_field = false;
		//#ifdef ECS_DENISE
		var oecsshres = ecsshres;
		ecsshres = bplres == SAEC_Config_Video_HResolution_SuperHiRes && (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) != 0 && (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) == 0;
		pfield_mode_changed = oecsshres != ecsshres;
		//#endif

		plf1pri = dp_for_drawing.bplcon2 & 7;
		plf2pri = (dp_for_drawing.bplcon2 >> 3) & 7;
		plf_sprite_mask = 0xFFFF0000 << (4 * plf2pri);
		plf_sprite_mask |= (0x0000FFFF << (4 * plf1pri)) & 0xFFFF;
		plf_sprite_mask >>>= 0; //OWN
		bpldualpf = (dp_for_drawing.bplcon0 & 0x400) == 0x400;
		bpldualpfpri = (dp_for_drawing.bplcon2 & 0x40) == 0x40;

		//#ifdef AGA
		// BYPASS: HAM and EHB select bits are ignored
		if (bplbypass != ((dp_for_drawing.bplcon0 & 0x20) != 0)) {
			bpland = 0xff;
			bplbypass = (dp_for_drawing.bplcon0 & 0x20) != 0;
			pfield_mode_changed = true;
		}
		if (bplbypass) {
			if (bplham && bplplanecnt == 6)
				bpland = 0x0f;
			if (bplham && bplplanecnt == 8)
				bpland = 0xfc;
			bplham = false;
			if (bplehb)
				bpland = 31;
			bplehb = false;
		}
		bpldualpf2of = (dp_for_drawing.bplcon3 >> 10) & 7;
		sbasecol[0] = ((dp_for_drawing.bplcon4 >> 4) & 15) << 4;
		sbasecol[1] = ((dp_for_drawing.bplcon4 >> 0) & 15) << 4;
		bplxor = dp_for_drawing.bplcon4 >> 8;
		var sh = (colors_for_drawing.extra >> CE_SHRES_DELAY) & 3;
		if (sh != bpldelay_sh) {
			bpldelay_sh = sh;
			pfield_mode_changed = true;
		}
		//#endif
		ecs_genlock_features_active = (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) && ((dp_for_drawing.bplcon2 & 0x0c00) || ce_is_borderntrans(colors_for_drawing.extra)) ? 1 : 0;
		if (ecs_genlock_features_active) {
			ecs_genlock_features_colorkey = false;
			ecs_genlock_features_mask = 0;
			if (dp_for_drawing.bplcon3 & 0x0800) {
				ecs_genlock_features_mask = 1 << ((dp_for_drawing.bplcon2 >> 12) & 7);
			}
			if (dp_for_drawing.bplcon3 & 0x0400) {
				ecs_genlock_features_colorkey = true;
			}
		}
		if (pfield_mode_changed)
			pfield_set_linetoscr();
	}

	function isham(bplcon0) {
		var p = GET_PLANES(bplcon0);
		if (!(bplcon0 & 0x800))
			return 0;
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			// AGA only has 6 or 8 plane HAM
			if (p == 6 || p == 8)
				return 1;
		} else {
			// OCS/ECS also supports 5 plane HAM
			if (GET_RES_DENISE(bplcon0) > 0)
				return 0;
			if (p >= 5)
				return 1;
		}
		return 0;
	}

	function pfield_expand_dp_bplconx(regno, v) {
		if (regno == 0xffff) {
			hposblank = 1;
			return;
		}
		regno -= 0x1000;
		switch (regno) {
			case 0x100: // BPLCON0
				dp_for_drawing.bplcon0 = v;
				dp_for_drawing.bplres = GET_RES_DENISE(v);
				dp_for_drawing.nr_planes = GET_PLANES(v);
				dp_for_drawing.ham_seen = isham(v);
				break;
			case 0x104: // BPLCON2
				dp_for_drawing.bplcon2 = v;
				break;
			//#ifdef ECS_DENISE
			case 0x106: // BPLCON3
				dp_for_drawing.bplcon3 = v;
				break;
			//#endif
			//#ifdef AGA
			case 0x10c: // BPLCON4
				dp_for_drawing.bplcon4 = v;
				break;
			//#endif
		}
		pfield_expand_dp_bplcon();
		set_res_shift(lores_shift - bplres);
	}

	var drawing_color_matches = 0; //int
	//static enum {
		const color_match_acolors = 0;
		const color_match_full = 1;
	//} color_match_type;
	var color_match_type = 0;

	/* Set up colors_for_drawing to the state at the beginning of the currently drawn line.
	Try to avoid copying color tables around whenever possible. */
	function adjust_drawing_colors(ctable, need_full) {
		if (drawing_color_matches != ctable || need_full < 0) {
			if (need_full) {
				color_reg_cpy(colors_for_drawing, curr_color_tables[ctable]);
				color_match_type = color_match_full;
			} else {
				for (var i = 0; i < colors_for_drawing.acolors.length; i++)
					colors_for_drawing.acolors[i] = curr_color_tables[ctable].acolors[i];

				colors_for_drawing.extra = curr_color_tables[ctable].extra;
				color_match_type = color_match_acolors;
			}
			drawing_color_matches = ctable;
		} else if (need_full && color_match_type != color_match_full) {
			color_reg_cpy(colors_for_drawing, curr_color_tables[ctable]);
			color_match_type = color_match_full;
		}
	}

	function playfield_hard_way(worker_pfield, first, last) {
		if (first < real_playfield_start)  {
			var next = last < real_playfield_start ? last : real_playfield_start;
			var diff = next - first;
			pfield_do_linetoscr_bordersprite_aga(first, next, false);
			if (res_shift >= 0)
				diff >>= res_shift;
			else
				diff <<= res_shift;
			src_pixel += diff;
			first = next;
		}
		worker_pfield(first, last < real_playfield_end ? last : real_playfield_end, false);
		if (last > real_playfield_end)
			pfield_do_linetoscr_bordersprite_aga(real_playfield_end, last, false);
	}

	function do_color_changes(worker_border, worker_pfield, vp) {
		var lastpos = visible_left_border;
		var endpos = visible_left_border + gfxvidinfo.drawbuffer.inwidth;

		for (var i = dip_for_drawing.first_color_change; i <= dip_for_drawing.last_color_change; i++) {
			var regno = curr_color_changes[i].regno;
			var value = curr_color_changes[i].value;
			var nextpos, nextpos_in_range;

			if (i == dip_for_drawing.last_color_change)
				nextpos = endpos;
			else
				nextpos = coord_hw_to_window_x(curr_color_changes[i].linepos);

			nextpos_in_range = nextpos;
			if (nextpos > endpos)
				nextpos_in_range = endpos;

			// left hblank (left edge to hblank end)
			if (nextpos_in_range > lastpos && lastpos < hblank_left_start) {
				var t = nextpos_in_range <= hblank_left_start ? nextpos_in_range : hblank_left_start;
				worker_border(lastpos, t, true);
				lastpos = t;
			}
			// left border (hblank end to playfield start)
			if (nextpos_in_range > lastpos && lastpos < playfield_start) {
				var t = nextpos_in_range <= playfield_start ? nextpos_in_range : playfield_start;
				worker_border(lastpos, t, false);
				lastpos = t;
			}
			// playfield
			if (nextpos_in_range > lastpos && lastpos >= playfield_start && lastpos < playfield_end) {
				var t = nextpos_in_range <= playfield_end ? nextpos_in_range : playfield_end;
				if (plf2pri > 5 && !(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA))
					weird_bitplane_fix(lastpos, t);
				if (bplxor && may_require_hard_way && worker_pfield !== pfield_do_linetoscr_bordersprite_aga)
					playfield_hard_way(worker_pfield, lastpos, t);
				else
					worker_pfield(lastpos, t, false);

				lastpos = t;
			}
			// right border (playfield end to hblank start)
			if (nextpos_in_range > lastpos && lastpos >= playfield_end) {
				var t = nextpos_in_range <= hblank_right_stop ? nextpos_in_range : hblank_right_stop;
				worker_border(lastpos, t, false);
				lastpos = t;
			}
			// right hblank (hblank start to right edge, hblank start may be earlier than playfield end)
			if (nextpos_in_range > hblank_right_stop) {
				worker_border(hblank_right_stop, nextpos_in_range, true);
				lastpos = nextpos_in_range;
			}

			if (regno >= 0x1000) {
				pfield_expand_dp_bplconx(regno, value);
			} else if (regno >= 0) {
				if (regno == 0 && (value & COLOR_CHANGE_BRDBLANK)) {
					colors_for_drawing.extra &= ~(1 << CE_BORDERBLANK);
					colors_for_drawing.extra &= ~(1 << CE_BORDERNTRANS);
					colors_for_drawing.extra &= ~(1 << CE_BORDERSPRITE);
					colors_for_drawing.extra |= (value & 1) != 0 ? (1 << CE_BORDERBLANK) : 0;
					colors_for_drawing.extra |= (value & 3) == 2 ? (1 << CE_BORDERSPRITE) : 0;
					colors_for_drawing.extra |= (value & 5) == 4 ? (1 << CE_BORDERNTRANS) : 0;
				} else if (regno == 0 && (value & COLOR_CHANGE_SHRES_DELAY)) {
					colors_for_drawing.extra &= ~(1 << CE_SHRES_DELAY);
					colors_for_drawing.extra &= ~(1 << (CE_SHRES_DELAY + 1));
					colors_for_drawing.extra |= (value & 3) << CE_SHRES_DELAY;
					pfield_expand_dp_bplcon();
				} else {
					color_reg_set(colors_for_drawing, regno, value);
					colors_for_drawing.acolors[regno] = getxcolor(value);
				}
			}
			if (lastpos >= endpos)
				break;
		}
		//#if 1
		if (vp < visible_top_start || vp >= visible_bottom_stop) {
			// outside of visible area
			// Just overwrite with black. Above code needs to run because of custom registers,
			// not worth the trouble for separate code path just for max 10 lines or so
			worker_border(visible_left_border, visible_left_border + gfxvidinfo.drawbuffer.inwidth, true);
		}
		//#endif
	}

	function is_color_changes(di) {
		var regno = curr_color_changes[di.first_color_change].regno;
		var changes = di.nr_color_changes;
		return changes > 1 || (changes == 1 && regno != 0xffff && regno != -1);
	}

	//enum double_how
	const dh_buf = 0;
	const dh_line = 1;
	const dh_emerg = 2;

	function pfield_draw_line(vb, lineno, gfx_ypos, follow_ypos) {
		var border = 0;
		var do_double = 0;
		var have_color_changes;
		var dh = 0;
		var ls = linestate[lineno];

		dp_for_drawing = line_decisions[lineno];
		dip_for_drawing = curr_drawinfo[lineno];

		if (dp_for_drawing.plfleft >= 0) {
			lines_count++;
			resolution_count[dp_for_drawing.bplres]++;
		}

		switch (ls) {
		case LINE_REMEMBERED_AS_PREVIOUS: {
			// happens when program messes up with VPOSW
			if (!warned_pfield_draw_line) {
				SAEF_warn("playfield.pfield_draw_line() Shouldn't get here... this is a bug.");
				warned_pfield_draw_line++;
			}
			return;
		}
		case LINE_BLACK: {
			linestate[lineno] = LINE_REMEMBERED_AS_BLACK;
			border = -1;
			break;
		}
		case LINE_REMEMBERED_AS_BLACK:
			return;

		case LINE_AS_PREVIOUS: {
			//dp_for_drawing--; //ORG
			//dip_for_drawing--; //ORG
			dp_for_drawing = line_decisions[lineno - 1];
			dip_for_drawing = curr_drawinfo[lineno - 1];
			linestate[lineno] = LINE_DONE_AS_PREVIOUS;
			if (dp_for_drawing.plfleft < 0)
				border = 1;
			break;
		}
		case LINE_DONE_AS_PREVIOUS:
			/* fall through */
		case LINE_DONE:
			return;

		case LINE_DECIDED_DOUBLE: {
			if (follow_ypos >= 0) {
				do_double = 1;
				linestate[lineno + 1] = LINE_DONE_AS_PREVIOUS;
			}
			/* fall through */
		}
		default:
			if (dp_for_drawing.plfleft < 0)
				border = 1;
			linestate[lineno] = LINE_DONE;
			break;
		}

		have_color_changes = is_color_changes(dip_for_drawing);

		xlinebuffer = null;
		xlinebuffer_pos = 0; //OWN
		if (gfxvidinfo.drawbuffer.linemem !== null) {
			dh = dh_line;
			if (gfxvidinfo.drawbuffer.pixbytes == 2)
				xlinebuffer = new Uint16Array(gfxvidinfo.drawbuffer.linemem);
			else
				xlinebuffer = new Uint32Array(gfxvidinfo.drawbuffer.linemem);
		}
		if (xlinebuffer === null && gfxvidinfo.drawbuffer.emergmem !== null && do_double && (border == 0 || have_color_changes)) {
			dh = dh_emerg;
			if (gfxvidinfo.drawbuffer.pixbytes == 2)
				xlinebuffer = new Uint16Array(gfxvidinfo.drawbuffer.emergmem);
			else
				xlinebuffer = new Uint32Array(gfxvidinfo.drawbuffer.emergmem);
		}
		if (xlinebuffer === null) {
			dh = dh_buf;
			xlinebuffer = row_map[gfx_ypos];
		}
		//xlinebuffer -= linetoscr_x_adjust_pixbytes;
		xlinebuffer_pos -= linetoscr_x_adjust_pixels; //OWN
		//xlinebuffer_genlock = row_map_genlock[gfx_ypos] - linetoscr_x_adjust_pixels;

		if (row_map_color_burst_buffer !== null)
			row_map_color_burst_buffer[gfx_ypos] = bplcolorburst;

		if (border == 0) {
			pfield_expand_dp_bplcon();
			pfield_init_linetoscr(false);
			pfield_doline(lineno);

			adjust_drawing_colors(dp_for_drawing.ctable, dp_for_drawing.ham_seen || bplehb || ecsshres);

			/* The problem is that we must call decode_ham() BEFORE we do the sprites. */
			if (dp_for_drawing.ham_seen) {
				var ohposblank = hposblank;
				init_ham_decoding();
				do_color_changes(dummy_worker, decode_ham, lineno);
				if (have_color_changes) {
					// do_color_changes() did color changes, reset colors back to original state
					adjust_drawing_colors(dp_for_drawing.ctable, -1);
					pfield_expand_dp_bplcon();
				}
				hposblank = ohposblank;
				ham_decode_pixel = src_pixel;
				bplham = dp_for_drawing.ham_at_start;
			}

			if (dip_for_drawing.nr_sprites) {
				var i, e;
				//#ifdef AGA
				if (ce_is_bordersprite(colors_for_drawing.extra) && dp_for_drawing.bordersprite_seen && !ce_is_borderblank(colors_for_drawing.extra))
					clear_bitplane_border_aga();
				//#endif
				/*for (i = 0; i < dip_for_drawing.nr_sprites; i++) {
					//#ifdef AGA
					if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA)
						//draw_sprites_aga(curr_sprite_entries + dip_for_drawing.first_sprite_entry + i, 1);
						draw_sprites_aga(curr_sprite_entries[dip_for_drawing.first_sprite_entry + i], 1);
					else
					//#endif
						//draw_sprites_ecs(curr_sprite_entries + dip_for_drawing.first_sprite_entry + i);
						draw_sprites_ecs(curr_sprite_entries[dip_for_drawing.first_sprite_entry + i]);
				}*/
				for (i = 0; i < dip_for_drawing.nr_sprites; i++) {
					e = curr_sprite_entries[dip_for_drawing.first_sprite_entry + i];
					draw_sprites_1(e, bpldualpf, e.has_attached);
				}
			}

			//#ifdef AGA
			if (dip_for_drawing.nr_sprites && ce_is_bordersprite(colors_for_drawing.extra) && !ce_is_borderblank(colors_for_drawing.extra) && dp_for_drawing.bordersprite_seen)
				do_color_changes(pfield_do_linetoscr_bordersprite_aga, pfield_do_linetoscr_spr, lineno);
			else
			//#endif
				do_color_changes(pfield_do_fill_line, dip_for_drawing.nr_sprites ? pfield_do_linetoscr_spr : pfield_do_linetoscr, lineno);

			if (dh == dh_emerg) {
				//memcpy(row_map[gfx_ypos], xlinebuffer + linetoscr_x_adjust_pixbytes, gfxvidinfo.drawbuffer.pixbytes * gfxvidinfo.drawbuffer.inwidth);
				row_map[gfx_ypos].set(xlinebuffer.subarray(0, gfxvidinfo.drawbuffer.inwidth));
			}
			//do_flush_line(vb, gfx_ypos);
			if (do_double) {
				if (dh == dh_emerg) {
					//memcpy(row_map[follow_ypos], xlinebuffer + linetoscr_x_adjust_pixbytes, gfxvidinfo.drawbuffer.pixbytes * gfxvidinfo.drawbuffer.inwidth);
					row_map[follow_ypos].set(xlinebuffer.subarray(0, gfxvidinfo.drawbuffer.inwidth));
				} else if (dh == dh_buf) {
					//memcpy(row_map[follow_ypos], row_map[gfx_ypos], gfxvidinfo.drawbuffer.pixbytes * gfxvidinfo.drawbuffer.inwidth);
					row_map[follow_ypos].set(row_map[gfx_ypos].subarray(0, gfxvidinfo.drawbuffer.inwidth));
				}
				/*if (need_genlock_data)
					memcpy(row_map_genlock[follow_ypos], row_map_genlock[gfx_ypos], gfxvidinfo.drawbuffer.inwidth);*/

				//do_flush_line(vb, follow_ypos);
			}

			if (dip_for_drawing.nr_sprites)
				pfield_erase_hborder_sprites();

		} else if (border > 0) { // border > 0: top or bottom border
			var dosprites = false;

			adjust_drawing_colors(dp_for_drawing.ctable, 0);

			//#ifdef AGA /* this makes things complex.. */
			if (dp_for_drawing.bordersprite_seen && !ce_is_borderblank(colors_for_drawing.extra) && dip_for_drawing.nr_sprites) {
				dosprites = true;
				pfield_expand_dp_bplcon();
				pfield_init_linetoscr(true);
				pfield_erase_vborder_sprites();
			}
			//#endif

			if (!dosprites && !have_color_changes) {
				if (dp_for_drawing.plfleft < -1) {
					// blanked border line
					var tmp = hposblank;
					hposblank = 1;
					fill_line_border(lineno);
					hposblank = tmp;
				} else {
					// normal border line
					fill_line_border(lineno);
				}

				//do_flush_line(vb, gfx_ypos);
				if (do_double) {
					if (dh == dh_buf) {
						//xlinebuffer = row_map[follow_ypos] - linetoscr_x_adjust_pixbytes;
						xlinebuffer = row_map[follow_ypos];
						xlinebuffer_pos = 0 - linetoscr_x_adjust_pixels; //OWN
						//xlinebuffer_genlock = row_map_genlock[follow_ypos] - linetoscr_x_adjust_pixels;
						fill_line_border(lineno);
					}
					/* If dh == dh_line, do_flush_line will re-use the rendered line from linemem. */
					//do_flush_line(vb, follow_ypos);
				}
				return;
			}

			//#ifdef AGA
			if (dosprites) {
				for (var i = 0; i < dip_for_drawing.nr_sprites; i++) {
					//draw_sprites_aga(curr_sprite_entries + dip_for_drawing->first_sprite_entry + i, 1);
					//draw_sprites_aga(curr_sprite_entries[dip_for_drawing.first_sprite_entry + i], 1);
					var e = curr_sprite_entries[dip_for_drawing.first_sprite_entry + i];
					draw_sprites_1(e, bpldualpf, e.has_attached);
				}
				do_color_changes(pfield_do_linetoscr_bordersprite_aga, pfield_do_linetoscr_bordersprite_aga, lineno);
			/*#else
			if (0) {
			#endif*/

			} else {
				playfield_start = visible_right_border;
				playfield_end = visible_right_border;
				do_color_changes(pfield_do_fill_line, pfield_do_fill_line, lineno);
			}

			if (dh == dh_emerg) {
				//memcpy(row_map[gfx_ypos], xlinebuffer + linetoscr_x_adjust_pixbytes, gfxvidinfo.drawbuffer.pixbytes * gfxvidinfo.drawbuffer.inwidth);
				row_map[gfx_ypos].set(xlinebuffer.subarray(0, gfxvidinfo.drawbuffer.inwidth));
			}
			//do_flush_line(vb, gfx_ypos);
			if (do_double) {
				if (dh == dh_emerg) {
					//memcpy(row_map[follow_ypos], xlinebuffer + linetoscr_x_adjust_pixbytes, gfxvidinfo.drawbuffer.pixbytes * gfxvidinfo.drawbuffer.inwidth);
					row_map[follow_ypos].set(xlinebuffer.subarray(0, gfxvidinfo.drawbuffer.inwidth));
				} else if (dh == dh_buf) {
					//memcpy(row_map[follow_ypos], row_map[gfx_ypos], gfxvidinfo.drawbuffer.pixbytes * gfxvidinfo.drawbuffer.inwidth);
					row_map[follow_ypos].set(row_map[gfx_ypos].subarray(0, gfxvidinfo.drawbuffer.inwidth));
				}
				/*if (need_genlock_data)
					memcpy(row_map_genlock[follow_ypos], row_map_genlock[gfx_ypos], gfxvidinfo.drawbuffer.inwidth);*/

				//do_flush_line(vb, follow_ypos);
			}
		} else {
			// top or bottom blanking region
			var tmp = hposblank;
			hposblank = 1;
			fill_line_border(lineno);
			hposblank = tmp;
			//do_flush_line(vb, gfx_ypos);
		}
	}

	function center_image() {
		var prev_x_adjust = visible_left_border;
		var prev_y_adjust = thisframe_y_adjust;

		var w = gfxvidinfo.drawbuffer.inwidth;
		if (SAEV_config.video.xcenter && max_diwstop > 0 && !SAEV_config.video.gf[0].gfx_filter_autoscale) {
			if (max_diwstop - min_diwstart < w && SAEV_config.video.xcenter == 2)
				/* Try to center. */
				visible_left_border = Math.truncate((max_diwstop - min_diwstart - w) / 2) + min_diwstart; //ATT
			else
				visible_left_border = max_diwstop - w - Math.truncate((max_diwstop - min_diwstart - w) / 2); //ATT
			visible_left_border &= ~((xshift (1, lores_shift)) - 1);
			//#if 1
			if (!center_reset && !vertical_changed) {
				/* Would the old value be good enough? If so, leave it as it is if we want to be clever. */
				if (SAEV_config.video.xcenter == 2) {
					if (visible_left_border < prev_x_adjust && prev_x_adjust < min_diwstart && min_diwstart - visible_left_border <= 32)
						visible_left_border = prev_x_adjust;
				}
			}
			//#endif
		} else if (gfxvidinfo.drawbuffer.extrawidth) {
			visible_left_border = max_diwlastword() - w;
			if (gfxvidinfo.drawbuffer.extrawidth > 0)
				visible_left_border += gfxvidinfo.drawbuffer.extrawidth << SAEV_config.video.hresolution;
		} else {
			if (gfxvidinfo.drawbuffer.inxoffset < 0) {
				visible_left_border = 0;
			} else {
				visible_left_border = gfxvidinfo.drawbuffer.inxoffset - DISPLAY_LEFT_SHIFT;
			}
		}

		if (visible_left_border > max_diwlastword() - 32)
			visible_left_border = max_diwlastword() - 32;
		if (visible_left_border < 0)
			visible_left_border = 0;
		visible_left_border &= ~((xshift (1, lores_shift)) - 1);

		//SAEF_log("playfield.center_image() %d %d %d %d %d", max_diwlastword(), gfxvidinfo.drawbuffer.inwidth, lores_shift, SAEV_config.video.hresolution, visible_left_border);

		linetoscr_x_adjust_pixels = visible_left_border;
		linetoscr_x_adjust_pixbytes = linetoscr_x_adjust_pixels * gfxvidinfo.drawbuffer.pixbytes;

		visible_right_border = visible_left_border + w;
		if (visible_right_border > max_diwlastword())
			visible_right_border = max_diwlastword();

		var max_drawn_amiga_line_tmp = max_drawn_amiga_line;
		if (max_drawn_amiga_line_tmp > gfxvidinfo.drawbuffer.inheight)
			max_drawn_amiga_line_tmp = gfxvidinfo.drawbuffer.inheight;
		max_drawn_amiga_line_tmp >>= linedbl;

		thisframe_y_adjust = minfirstline;
		if (SAEV_config.video.ycenter && thisframe_first_drawn_line >= 0 && !SAEV_config.video.gf[0].gfx_filter_autoscale) {
			if (thisframe_last_drawn_line - thisframe_first_drawn_line < max_drawn_amiga_line_tmp && SAEV_config.video.ycenter == 2)
				thisframe_y_adjust = Math.truncate((thisframe_last_drawn_line - thisframe_first_drawn_line - max_drawn_amiga_line_tmp) / 2) + thisframe_first_drawn_line; //ATT
			else
				thisframe_y_adjust = thisframe_first_drawn_line;
			//#if 1
			/* Would the old value be good enough? If so, leave it as it is if we want to be clever. */
			if (!center_reset && !horizontal_changed) {
				if (SAEV_config.video.ycenter == 2 && thisframe_y_adjust != prev_y_adjust) {
					if (prev_y_adjust <= thisframe_first_drawn_line && prev_y_adjust + max_drawn_amiga_line_tmp > thisframe_last_drawn_line)
						thisframe_y_adjust = prev_y_adjust;
				}
			}
			//#endif
		}

		/* Make sure the value makes sense */
		if (thisframe_y_adjust + max_drawn_amiga_line_tmp > maxvpos + (maxvpos >> 1)) //ORG / 2
			thisframe_y_adjust = maxvpos + (maxvpos >> 1) - max_drawn_amiga_line_tmp;
		if (thisframe_y_adjust < 0)
			thisframe_y_adjust = 0;

		thisframe_y_adjust_real = thisframe_y_adjust << linedbl;
		max_ypos_thisframe = (maxvpos_display - minfirstline + 1) << linedbl;

		if (prev_x_adjust != visible_left_border || prev_y_adjust != thisframe_y_adjust) {
			var redraw = interlace_seen > 0 && linedbl ? 2 : 1;
			if (redraw > frame_redraw_necessary)
				frame_redraw_necessary = redraw;
		}

		max_diwstop = 0;
		min_diwstart = MAX_STOP;

		gfxvidinfo.drawbuffer.xoffset = (DISPLAY_LEFT_SHIFT << RES_MAX) + (visible_left_border << (RES_MAX - SAEV_config.video.hresolution));
		gfxvidinfo.drawbuffer.yoffset = thisframe_y_adjust << VRES_MAX;

		center_reset = false;
		horizontal_changed = false;
		vertical_changed = false;
	}

	var frame_res_cnt = 0; //int
	var autoswitch_old_resolution = 0; //int
	function init_drawing_frame() {
		var i, maxline;
		//static int frame_res_old;

		/*if (SAEV_config.video.hresolution == changed_prefs.gfx_resolution && lines_count > 0) {
			int largest_count = 0;
			int largest_count_res = 0;
			int largest_res = 0;
			for (int i = 0; i <= RES_MAX; i++) {
				if (resolution_count[i])
					largest_res = i;
				if (resolution_count[i] >= largest_count) {
					largest_count = resolution_count[i];
					largest_count_res = i;
				}
			}

			if (currprefs.gfx_autoresolution_vga && programmedmode && gfxvidinfo.gfx_resolution_reserved >= SAEC_Config_Video_HResolution_HiRes && gfxvidinfo.gfx_vresolution_reserved >= SAEC_Config_Video_VResolution_Double) {
				if (largest_res == SAEC_Config_Video_HResolution_SuperHiRes && (gfxvidinfo.gfx_resolution_reserved < SAEC_Config_Video_HResolution_SuperHiRes || gfxvidinfo.gfx_vresolution_reserved < 1)) {
					// enable full doubling/superhires support if programmed mode. It may be "half-width" only and may fit in normal display window.
					gfxvidinfo.gfx_resolution_reserved = SAEC_Config_Video_HResolution_SuperHiRes;
					gfxvidinfo.gfx_vresolution_reserved = SAEC_Config_Video_VResolution_Double;
					graphics_reset(false);
				}
				int newres = largest_res;
				if (htotal < 190)
					newres = largest_res + 1;
				if (newres < SAEC_Config_Video_HResolution_HiRes)
					newres = SAEC_Config_Video_HResolution_HiRes;
				if (newres > RES_MAX)
					newres = RES_MAX;
				if (changed_prefs.gfx_resolution != newres) {
					autoswitch_old_resolution = SAEC_Config_Video_HResolution_HiRes;
					SAEF_log("Programmed mode autores = %d -> %d (%d)", changed_prefs.gfx_resolution, newres, largest_res);
					changed_prefs.gfx_resolution = newres;
					set_config_changed();
					return;
				}
			} else if (autoswitch_old_resolution == SAEC_Config_Video_HResolution_HiRes) {
				autoswitch_old_resolution = 0;
				if (changed_prefs.gfx_resolution != SAEC_Config_Video_HResolution_HiRes) {
					changed_prefs.gfx_resolution = SAEC_Config_Video_HResolution_HiRes;
					set_config_changed();
					return;
				}
			}

			if (currprefs.gfx_autoresolution) {
				int frame_res_detected;
				int frame_res_lace_detected = frame_res_lace;

				if (currprefs.gfx_autoresolution == 1 || currprefs.gfx_autoresolution >= 100)
					frame_res_detected = largest_res;
				else if (largest_count * 100 / lines_count >= currprefs.gfx_autoresolution)
					frame_res_detected = largest_count_res;
				else
					frame_res_detected = largest_count_res - 1;
				if (frame_res_detected < 0)
					frame_res_detected = 0;
				#if 0
				static int delay;
				delay--;
				if (delay < 0) {
					delay = 50;
					SAEF_log("playfield.init_drawing_frame() %d %d, %d %d %d, %d %d, %d %d", currprefs.gfx_autoresolution, lines_count, resolution_count[0], resolution_count[1], resolution_count[2],
						largest_count, largest_count_res, frame_res_detected, frame_res_lace_detected);
				}
				#endif
				if (frame_res_detected >= 0 && frame_res_lace_detected >= 0) {
					if (frame_res_cnt > 0 && frame_res_old == frame_res_detected * 2 + frame_res_lace_detected) {
						frame_res_cnt--;
						if (frame_res_cnt == 0) {
							int m = frame_res_detected * 2 + frame_res_lace_detected;
							struct wh *dst = SAEV_config.video.apmode[0].gfx_fullscreen ? &changed_prefs.gfx_size_fs : &changed_prefs.gfx_size_win;
							while (m < 3 * 2) {
								struct wh *src = SAEV_config.video.apmode[0].gfx_fullscreen ? &currprefs.gfx_size_fs_xtra[m] : &currprefs.gfx_size_win_xtra[m];
								if ((src->width > 0 && src->height > 0) || (SAEV_config.video.api == SAEC_Config_Video_API_WebGL || SAEV_config.video.gf[0].gfx_filter > 0)) {
									int nr = m >> 1;
									int nl = (m & 1) == 0 ? 0 : 1;
									int nr_o = nr;
									int nl_o = nl;

									if (currprefs.gfx_autoresolution >= 100 && nl == 0 && nr > 0) {
										nl = 1;
									}

									if (currprefs.gfx_autoresolution_minh < 0) {
										if (nr < nl)
											nr = nl;
									} else if (nr < currprefs.gfx_autoresolution_minh) {
										nr = currprefs.gfx_autoresolution_minh;
									}
									if (currprefs.gfx_autoresolution_minv < 0) {
										if (nl < nr)
											nl = nr;
									} else if (nl < currprefs.gfx_autoresolution_minv) {
										nl = currprefs.gfx_autoresolution_minv;
									}

									if (nr > gfxvidinfo.gfx_resolution_reserved)
										nr = gfxvidinfo.gfx_resolution_reserved;
									if (nl > gfxvidinfo.gfx_vresolution_reserved)
										nl = gfxvidinfo.gfx_vresolution_reserved;

									if (changed_prefs.gfx_resolution != nr || changed_prefs.gfx_vresolution != nl) {
										changed_prefs.gfx_resolution = nr;
										changed_prefs.gfx_vresolution = nl;

										SAEF_log("playfield.init_drawing_frame() RES -> %d (%d) LINE -> %d (%d) (%d - %d, %d - %d)", nr, nr_o, nl, nl_o,
											currprefs.gfx_autoresolution_minh, currprefs.gfx_autoresolution_minv,
											gfxvidinfo.gfx_resolution_reserved, gfxvidinfo.gfx_vresolution_reserved);
										set_config_changed ();
									}
									if (src->width > 0 && src->height > 0) {
										if (memcmp (dst, src, sizeof *dst)) {
											*dst = *src;
											set_config_changed ();
										}
									}
									break;
								}
								m++;
							}
							frame_res_cnt = currprefs.gfx_autoresolution_delay;
						}
					} else {
						frame_res_old = frame_res_detected * 2 + frame_res_lace_detected;
						frame_res_cnt = currprefs.gfx_autoresolution_delay;
						if (frame_res_cnt <= 0)
							frame_res_cnt = 1;
					}
				}
			}
		}*/

		for (i = 0; i <= RES_MAX; i++)
			resolution_count[i] = 0;
		lines_count = 0;
		frame_res = -1;
		frame_res_lace = 0;

		if (can_use_lores > AUTO_LORES_FRAMES && 0) {
			lores_factor = 1;
			lores_set(0);
		} else {
			can_use_lores++;
			lores_reset();
		}

		init_hardware_for_drawing_frame();

		if (thisframe_first_drawn_line < 0)
			thisframe_first_drawn_line = minfirstline;
		if (thisframe_first_drawn_line > thisframe_last_drawn_line)
			thisframe_last_drawn_line = thisframe_first_drawn_line;

		maxline = ((maxvpos_display + 1) << linedbl) + 2;
		if (SMART_UPDATE) {
			for (i = 0; i < maxline; i++) {
				var ls = linestate[i];
				switch (ls) {
					case LINE_DONE_AS_PREVIOUS:
						linestate[i] = LINE_REMEMBERED_AS_PREVIOUS;
						break;
					case LINE_REMEMBERED_AS_BLACK:
						break;
					default:
						linestate[i] = LINE_UNDECIDED;
				}
			}
		} else {
			for (i = 0; i < maxline; i++)
				linestate[i] = LINE_UNDECIDED;
		}
		last_drawn_line = 0;
		first_drawn_line = 32767;

		//first_block_line = last_block_line = NO_BLOCK; //OWN flush_line() and flush_block() is not used
		if (frame_redraw_necessary) {
			reset_decision_table();
			custom_frame_redraw_necessary = 1;
			frame_redraw_necessary--;
		} else
			custom_frame_redraw_necessary = 0;

		center_image();

		thisframe_first_drawn_line = -1;
		thisframe_last_drawn_line = -1;

		drawing_color_matches = -1;
	}




	function putpixel(buf, bpp, x, c8, opaq) {
		if (x <= 0)
			return;

		switch (bpp) {
			case 1:
				buf[x] = c8 & 0xff;
				break;
			case 2: {
				//uae_u16 *p = (uae_u16*)buf + x; *p = (uae_u16)c8;
				buf[x] = c8 & 0xffff;
				break;
			}
			case 3: //no 24 bit yet
				break;
			case 4: {
				if (1 || opaq || SAEV_config.video.gf[0].gfx_filter == 0) {
					//uae_u32 *p = (uae_u32*)buf + x; *p = c8;
					buf[x] = c8;
				} else {
					for (var i = 0; i < 4; i++) {
						var v1 = buf[i + bpp * x];
						var v2 = (c8 >> (i * 8)) & 255;
						v1 = (v1 * 2 + v2 * 3) / 5;
						if (v1 > 255)
							v1 = 255;
						buf[i + bpp * x] = v1;
					}
				}
				break;
			}
		}
	}


	/*var statusbar_y1, statusbar_y2; //int

	[...] statusline.cpp

	static uae_u8 *status_line_ptr(int line) {
		int y;

		y = line - (gfxvidinfo.drawbuffer.outheight - TD_TOTAL_HEIGHT);
		xlinebuffer = gfxvidinfo.drawbuffer.linemem;
		if (xlinebuffer == 0)
			xlinebuffer = row_map[line];
		xlinebuffer_genlock = row_map_genlock[line];
		return xlinebuffer;
	}

	static void draw_status_line (int line, int statusy) {
		uae_u8 *buf = status_line_ptr(line);
		if (!buf)
			return;
		if (statusy < 0)
			statusline_render(buf, gfxvidinfo.drawbuffer.pixbytes, gfxvidinfo.drawbuffer.rowbytes, gfxvidinfo.drawbuffer.outwidth, TD_TOTAL_HEIGHT, xredcolors, xgreencolors, xbluecolors, NULL);
		else
			draw_status_line_single(buf, gfxvidinfo.drawbuffer.pixbytes, statusy, gfxvidinfo.drawbuffer.outwidth, xredcolors, xgreencolors, xbluecolors, NULL);
	}

	static void draw_debug_status_line (int line) {
		xlinebuffer = gfxvidinfo.drawbuffer.linemem;
		if (xlinebuffer == 0)
			xlinebuffer = row_map[line];
		xlinebuffer_genlock = row_map_genlock[line];
		debug_draw(xlinebuffer, gfxvidinfo.drawbuffer.pixbytes, line, gfxvidinfo.drawbuffer.outwidth, gfxvidinfo.drawbuffer.outheight, xredcolors, xgreencolors, xbluecolors);
	}

	const LIGHTPEN_HEIGHT = 12;
	const LIGHTPEN_WIDTH = 17;

	static const char *lightpen_cursor = {
		"------.....------"
		"------.xxx.------"
		"------.xxx.------"
		"------.xxx.------"
		".......xxx......."
		".xxxxxxxxxxxxxxx."
		".xxxxxxxxxxxxxxx."
		".......xxx......."
		"------.xxx.------"
		"------.xxx.------"
		"------.xxx.------"
		"------.....------"
	};

	var lightpen_y1, lightpen_y2; //int

	static void draw_lightpen_cursor (int x, int y, int line, int onscreen)
	{
		int i;
		const char *p;
		int color1 = onscreen ? 0xff0 : 0xf00;
		int color2 = 0x000;

		xlinebuffer = gfxvidinfo.drawbuffer.linemem;
		if (xlinebuffer == 0)
			xlinebuffer = row_map[line];
		xlinebuffer_genlock = row_map_genlock[line];

		p = lightpen_cursor + y * LIGHTPEN_WIDTH;
		for (i = 0; i < LIGHTPEN_WIDTH; i++) {
			int xx = x + i - LIGHTPEN_WIDTH / 2;
			if (*p != "-" && xx >= 0 && xx < gfxvidinfo.drawbuffer.outwidth)
				putpixel (xlinebuffer, gfxvidinfo.drawbuffer.pixbytes, xx, *p == "x" ? xcolors[color1] : xcolors[color2], 1);
			p++;
		}
	}

	static void lightpen_update (struct vidbuffer *vb)
	{
		int i;

		if (lightpen_x < LIGHTPEN_WIDTH + 1)
			lightpen_x = LIGHTPEN_WIDTH + 1;
		if (lightpen_x >= gfxvidinfo.drawbuffer.inwidth - LIGHTPEN_WIDTH - 1)
			lightpen_x = gfxvidinfo.drawbuffer.inwidth - LIGHTPEN_WIDTH - 2;
		if (lightpen_y < LIGHTPEN_HEIGHT + 1)
			lightpen_y = LIGHTPEN_HEIGHT + 1;
		if (lightpen_y >= gfxvidinfo.drawbuffer.inheight - LIGHTPEN_HEIGHT - 1)
			lightpen_y = gfxvidinfo.drawbuffer.inheight - LIGHTPEN_HEIGHT - 2;
		if (lightpen_y >= max_ypos_thisframe - LIGHTPEN_HEIGHT - 1)
			lightpen_y = max_ypos_thisframe - LIGHTPEN_HEIGHT - 2;

		lightpen_cx = (((lightpen_x + visible_left_border) >> lores_shift) >> 1) + DISPLAY_LEFT_SHIFT - DIW_DDF_OFFSET;

		lightpen_cy = lightpen_y;
		lightpen_cy >>= linedbl;
		lightpen_cy += minfirstline;

		if (lightpen_cx < 0x18)
			lightpen_cx = 0x18;
		if (lightpen_cx >= maxhpos)
			lightpen_cx -= maxhpos;
		if (lightpen_cy < minfirstline)
			lightpen_cy = minfirstline;
		if (lightpen_cy >= maxvpos)
			lightpen_cy = maxvpos - 1;

		for (i = 0; i < LIGHTPEN_HEIGHT; i++) {
			int line = lightpen_y + i - LIGHTPEN_HEIGHT / 2;
			if (line >= 0 || line < max_ypos_thisframe) {
				if (lightpen_active > 0)
					draw_lightpen_cursor (lightpen_x, i, line, lightpen_cx > 0);
				SAER.video.flush_line(vb, line);
			}
		}
		lightpen_y1 = lightpen_y - LIGHTPEN_HEIGHT / 2 - 1 + min_ypos_for_screen;
		lightpen_y2 = lightpen_y1 + LIGHTPEN_HEIGHT + 2;

		if (lightpen_active < 0)
			lightpen_active = 0;
	}*/


	const refresh_indicator_colors = [ 0x777, 0x0f0, 0x00f, 0xff0, 0xf0f ];

	function refresh_indicator_init() {
		//xfree(refresh_indicator_buffer);
		refresh_indicator_buffer = null;
		//xfree(refresh_indicator_changed);
		refresh_indicator_changed = null;
		//xfree(refresh_indicator_changed_prev);
		refresh_indicator_changed_prev = null;

		if (!SAEV_config.video.refreshIndicator)
			return;

		refresh_indicator_height = 600;
		/*refresh_indicator_buffer = xcalloc(uae_u8, MAX_PIXELS_PER_LINE * 2 * refresh_indicator_height);
		refresh_indicator_changed = xcalloc(uae_u8, refresh_indicator_height);
		refresh_indicator_changed_prev = xcalloc(uae_u8, refresh_indicator_height);*/
		refresh_indicator_buffer = new ArrayBuffer(MAX_PIXELS_PER_LINE * 2 * refresh_indicator_height);
		refresh_indicator_changed = new Uint8Array(refresh_indicator_height);
		refresh_indicator_changed_prev = new Uint8Array(refresh_indicator_height);
	}

	function refresh_indicator_update(vb) {
		for (var i = 0; i < max_ypos_thisframe; i++) {
			var i1 = i + min_ypos_for_screen;
			var line = i + thisframe_y_adjust_real;
			var whereline = amiga2aspect_line_map[i1];
			var wherenext = amiga2aspect_line_map[i1 + 1];

			if (whereline >= vb.inheight)
				break;
			if (whereline < 0)
				continue;
			if (line >= refresh_indicator_height)
				break;

			xlinebuffer = row_map[whereline];
			var pixel = refresh_indicator_changed_prev[line];
			if (wherenext >= 0)
				pixel = refresh_indicator_changed_prev[line & ~1];

			var color1 = 0;
			var color2 = 0;
			if (pixel <= 4) {
				color1 = color2 = refresh_indicator_colors[pixel];
			} else if (pixel <= 8) {
				color2 = refresh_indicator_colors[pixel - 5];
			}
			for (var x = 0; x < 8; x++) {
				putpixel(xlinebuffer, gfxvidinfo.drawbuffer.pixbytes, x, xcolors[color1], 1);
			}
			for (var x = 8; x < 16; x++) {
				putpixel(xlinebuffer, gfxvidinfo.drawbuffer.pixbytes, x, xcolors[color2], 1);
			}
		}
	}


	//const LARGEST_LINE_DEBUG = 0;
	//var xvbin = null, xvbout = null; //struct vidbuffer *

	function draw_frame2(vbin, vbout) {
		//xvbin = vbin;
		//xvbout = vbout;

		//if (LARGEST_LINE_DEBUG) var largest = 0;

		for (var i = 0; i < max_ypos_thisframe; i++) {
			var i1 = i + min_ypos_for_screen;
			var line = i + thisframe_y_adjust_real;
			var whereline = amiga2aspect_line_map[i1];
			var wherenext = amiga2aspect_line_map[i1 + 1];

			if (whereline >= vbin.inheight)
				break;
			if (whereline < 0)
				continue;
			//if (LARGEST_LINE_DEBUG && largest < whereline) largest = whereline;

			hposblank = 0;
			pfield_draw_line(vbout, line, whereline, wherenext);
		}
		//if (LARGEST_LINE_DEBUG) SAEF_log("playfield.draw_frame2() largest line %d", largest);
	}

	/*bool draw_frame (struct vidbuffer *vb) {
		uae_u8 oldstate[LINESTATE_SIZE];
		struct vidbuffer oldvb;

		memcpy (&oldvb, &gfxvidinfo.drawbuffer, sizeof (struct vidbuffer));
		memcpy (&gfxvidinfo.drawbuffer, vb, sizeof (struct vidbuffer));
		clearbuffer (vb);
		init_row_map();
		memcpy (oldstate, linestate, LINESTATE_SIZE);
		for (int i = 0; i < LINESTATE_SIZE; i++) {
			uae_u8 v = linestate[i];
			if (v == LINE_REMEMBERED_AS_PREVIOUS) {
				linestate[i - 1] = LINE_DECIDED_DOUBLE;
				v = LINE_AS_PREVIOUS;
			} else if (v == LINE_DONE_AS_PREVIOUS) {
				linestate[i - 1] = LINE_DECIDED_DOUBLE;
				v = LINE_AS_PREVIOUS;
			} else if (v == LINE_REMEMBERED_AS_BLACK) {
				v = LINE_BLACK;
			} else if (v == LINE_DONE) {
				v = LINE_DECIDED;
			}
			linestate[i] = v;
		}
		last_drawn_line = 0;
		first_drawn_line = 32767;
		drawing_color_matches = -1;
		draw_frame2(vb, NULL);
		last_drawn_line = 0;
		first_drawn_line = 32767;
		drawing_color_matches = -1;
		memcpy (linestate, oldstate, LINESTATE_SIZE);
		memcpy (&gfxvidinfo.drawbuffer, &oldvb, sizeof (struct vidbuffer));
		init_row_map();
		return true;
	}*/

	function setnativeposition(vb) {
		vb.inwidth = gfxvidinfo.drawbuffer.inwidth;
		vb.inheight = gfxvidinfo.drawbuffer.inheight;
		vb.inwidth2 = gfxvidinfo.drawbuffer.inwidth2;
		vb.inheight2 = gfxvidinfo.drawbuffer.inheight2;
		vb.outwidth = gfxvidinfo.drawbuffer.outwidth;
		vb.outheight = gfxvidinfo.drawbuffer.outheight;
	}

	function setspecialmonitorpos(vb) {
		vb.extrawidth = gfxvidinfo.drawbuffer.extrawidth;
		vb.xoffset = gfxvidinfo.drawbuffer.xoffset;
		vb.yoffset = gfxvidinfo.drawbuffer.yoffset;
		vb.inxoffset = gfxvidinfo.drawbuffer.inxoffset;
		vb.inyoffset = gfxvidinfo.drawbuffer.inyoffset;
	}

	function init_hardware_frame() {
		first_bpl_vpos = -1;
		next_lineno = 0;
		prev_lineno = -1;
		nextline_how = nln_normal;
		diwstate = DIW_WAITING_START;
		ddfstate = DIW_WAITING_START;

		if (first_bplcon0 != first_bplcon0_old) {
			vertical_changed = horizontal_changed = true;
		}
		first_bplcon0_old = first_bplcon0;

		if (first_planes_vpos != first_planes_vpos_old ||
			last_planes_vpos != last_planes_vpos_old) {
			vertical_changed = true;
		}
		first_planes_vpos_old = first_planes_vpos;
		last_planes_vpos_old = last_planes_vpos;

		if (diwfirstword_total != diwfirstword_total_old ||
			diwlastword_total != diwlastword_total_old ||
			ddffirstword_total != ddffirstword_total_old ||
			ddflastword_total != ddflastword_total_old) {
			horizontal_changed = true;
		}
		diwfirstword_total_old = diwfirstword_total;
		diwlastword_total_old = diwlastword_total;
		ddffirstword_total_old = ddffirstword_total;
		ddflastword_total_old = ddflastword_total;

		first_planes_vpos = 0;
		last_planes_vpos = 0;
		diwfirstword_total = max_diwlastword();
		diwlastword_total = 0;
		ddffirstword_total = max_diwlastword();
		ddflastword_total = 0;
		plflastline_total = 0;
		plffirstline_total = current_maxvpos();
		first_bplcon0 = 0;
		autoscale_bordercolors = 0;

		for (var i = 0; i < MAX_SPRITES; i++) {
			spr[i].ptxhpos = MAXHPOS;
			spr[i].ptxvpos2 = -1;
		}
		plf_state = plf_end;
	}

	function init_hardware_for_drawing_frame() { //global
		/* Avoid this code in the first frame after a customreset.  */
		if (prev_sprite_entries) {
			var first_pixel = prev_sprite_entries[0].first_pixel;
			var npixels = prev_sprite_entries[prev_next_sprite_entry].first_pixel - first_pixel;
			for (var i = 0; i < npixels; i++) {
				spixels[first_pixel + i] = 0;
				spixstate.bytes[first_pixel + i] = 0;
			}
		}
		prev_next_sprite_entry = next_sprite_entry;

		next_color_change = 0;
		next_sprite_entry = 0;
		next_color_entry = 0;
		remembered_color_entry = -1;

		prev_sprite_entries = sprite_entries[current_change_set];
		curr_sprite_entries = sprite_entries[current_change_set ^ 1];
		prev_color_changes = color_changes[current_change_set];
		curr_color_changes = color_changes[current_change_set ^ 1];
		prev_color_tables = color_tables[current_change_set];
		curr_color_tables = color_tables[current_change_set ^ 1];

		prev_drawinfo = line_drawinfo[current_change_set];
		curr_drawinfo = line_drawinfo[current_change_set ^ 1];
		current_change_set ^= 1;

		color_src_match = color_dest_match = -1;

		/* Use both halves of the array in alternating fashion.  */
		curr_sprite_entries[0].first_pixel = current_change_set * MAX_SPR_PIXELS;
		next_sprite_forced = 1;
	}

	function finish_drawing_frame() {
		var didflush = false;
		var vb = gfxvidinfo.drawbuffer;

		gfxvidinfo.outbuffer = vb;

		if (!SAER.video.lockscr(vb, false)) {
			notice_screen_contents_lost();
			return;
		}
		if (!SMART_UPDATE) {
			/* This isn't exactly right yet. FIXME */
			if (!interlace_seen)
				do_flush_screen(vb, first_drawn_line, last_drawn_line);
			else
				SAER.video.unlockscr();
			return;
		}

		draw_frame2(vb, vb);

		/*if (currprefs.leds_on_screen && ((currprefs.leds_on_screen & STATUSLINE_CHIPSET) && !(currprefs.leds_on_screen & STATUSLINE_TARGET))) {
			int slx, sly;
			statusline_getpos(&slx, &sly, vb->outwidth, vb->outheight);
			statusbar_y1 = sly + min_ypos_for_screen - 1;
			statusbar_y2 = statusbar_y1 + TD_TOTAL_HEIGHT + 1;
			draw_status_line(sly, -1);
			for (var i = 0; i < TD_TOTAL_HEIGHT; i++) {
				int line = sly + i;
				draw_status_line (line, i);
				do_flush_line(vb, line);
			}
		}*/

		//if (lightpen_active) lightpen_update(vb);
		if (refresh_indicator_buffer !== null) refresh_indicator_update(vb);

		/*if (currprefs.monitoremu && gfxvidinfo.tempbuffer.bufmem_allocated) {
			setspecialmonitorpos(&gfxvidinfo.tempbuffer);
			if (init_genlock_data != specialmonitor_need_genlock()) {
				init_genlock_data = specialmonitor_need_genlock();
				init_row_map();
			}
			if (emulate_specialmonitors (vb, &gfxvidinfo.tempbuffer)) {
				vb = gfxvidinfo.outbuffer = &gfxvidinfo.tempbuffer;
				if (vb->nativepositioning)
					setnativeposition(vb);
				gfxvidinfo.drawbuffer.tempbufferinuse = true;
				need_genlock_data = specialmonitor_need_genlock();
				if (!specialmonitoron) {
					compute_framesync();
				}
				specialmonitoron = true;
				pfield_set_linetoscr();
				do_flush_screen(vb, 0, vb->outheight);
				didflush = true;
			} else {
				pfield_set_linetoscr();
				need_genlock_data = false;
				if (specialmonitoron || gfxvidinfo.drawbuffer.tempbufferinuse) {
					gfxvidinfo.drawbuffer.tempbufferinuse = false;
					specialmonitoron = false;
					compute_framesync();
				}
			}
		}*/

		/*if (!currprefs.monitoremu && gfxvidinfo.tempbuffer.bufmem_allocated && ((!bplcolorburst_field && currprefs.cs_color_burst) || (currprefs.gfx_grayscale))) {
			setspecialmonitorpos(&gfxvidinfo.tempbuffer);
			emulate_grayscale(vb, &gfxvidinfo.tempbuffer);
			vb = gfxvidinfo.outbuffer = &gfxvidinfo.tempbuffer;
			if (vb->nativepositioning)
				setnativeposition(vb);
			gfxvidinfo.drawbuffer.tempbufferinuse = true;
			do_flush_screen(vb, 0, vb->outheight);
			didflush = true;
		}*/

		/*if (currprefs.genlock_image && !currprefs.monitoremu && !currprefs.cs_color_burst && gfxvidinfo.tempbuffer.bufmem_allocated && SAEV_config.chipset.genlock) {
			setspecialmonitorpos(&gfxvidinfo.tempbuffer);
			if (init_genlock_data != specialmonitor_need_genlock()) {
				need_genlock_data = init_genlock_data = specialmonitor_need_genlock();
				init_row_map();
			}
			emulate_genlock(vb, &gfxvidinfo.tempbuffer);
			vb = gfxvidinfo.outbuffer = &gfxvidinfo.tempbuffer;
			if (vb->nativepositioning)
				setnativeposition(vb);
			gfxvidinfo.drawbuffer.tempbufferinuse = true;
			do_flush_screen(vb, 0, vb->outheight);
			didflush = true;
		}*/

		/*if (!currprefs.monitoremu && gfxvidinfo.tempbuffer.bufmem_allocated && currprefs.cs_cd32fmv) {
			if (cd32_fmv_active) {
				cd32_fmv_genlock(vb, &gfxvidinfo.tempbuffer);
				vb = gfxvidinfo.outbuffer = &gfxvidinfo.tempbuffer;
				setnativeposition(vb);
				gfxvidinfo.drawbuffer.tempbufferinuse = true;
				do_flush_screen(vb, 0, vb->outheight);
				didflush = true;
			} else {
				gfxvidinfo.drawbuffer.tempbufferinuse = false;
			}
		}*/

		if (!didflush)
			do_flush_screen(vb, first_drawn_line, last_drawn_line);
	}

	function hardware_line_completed(lineno) {
		if (!SMART_UPDATE) {
			var i = lineno - thisframe_y_adjust_real;
			if (i >= 0 && i < max_ypos_thisframe) {
				var where = amiga2aspect_line_map[i + min_ypos_for_screen];
				if (where < gfxvidinfo.drawbuffer.outheight && where >= 0)
					pfield_draw_line(gfxvidinfo.drawbuffer, lineno, where, amiga2aspect_line_map[i + min_ypos_for_screen + 1]);
			}
		}
	}

	/*function check_picasso() {
		#ifdef PICASSO96
		if (SAEV_Playfield_picasso_on && picasso_redraw_necessary)
			picasso_refresh();
		picasso_redraw_necessary = 0;

		if (SAEV_Playfield_picasso_requested_on == SAEV_Playfield_picasso_on)
			return;

		SAEV_Playfield_picasso_on = SAEV_Playfield_picasso_requested_on;

		if (!SAEV_Playfield_picasso_on)
			clear_inhibit_frame(IHF_PICASSO);
		else
			set_inhibit_frame(IHF_PICASSO);

		gfx_set_picasso_state(SAEV_Playfield_picasso_on);
		picasso_enablescreen(SAEV_Playfield_picasso_requested_on);

		notice_screen_contents_lost();
		notice_new_xcolors();
		count_frame();
		#endif
	}*/

	function redraw_frame() { //global
		last_drawn_line = 0;
		first_drawn_line = 32767;
		finish_drawing_frame();
		/* OWN flush_screen() is not used
		SAER.video.flush_screen(gfxvidinfo.inbuffer, 0, 0);*/
	}

	function vsync_handle_check() { //global
		/*var changed = check_prefs_changed_gfx();
		if (changed > 0) {
			reset_drawing();
			init_row_map();
			init_aspect_maps();
			notice_screen_contents_lost();
			notice_new_xcolors();
		} else if (changed < 0) {
			reset_drawing();
			init_row_map();
			init_aspect_maps();
			notice_screen_contents_lost();
			notice_new_xcolors();
		}
		check_prefs_changed_cd();
		check_prefs_changed_audio();
		check_prefs_changed_custom();
		check_prefs_changed_cpu();
		check_picasso();
		return changed != 0;*/
		return false;
	}

	function vsync_handle_redraw(long_field, lof_changed, bplcon0p, bplcon3p) { //global
		last_redraw_point++;
		if (lof_changed || interlace_seen <= 0 || (SAEV_config.video.iscanlines && interlace_seen > 0) || last_redraw_point >= 2 || long_field || doublescan < 0) {
			last_redraw_point = 0;

			if (framecnt == 0)
				finish_drawing_frame();
			/*#if 0
			if (interlace_seen > 0) {
				interlace_seen = -1;
			} else if (interlace_seen == -1) {
				interlace_seen = 0;
				if (SAEV_config.video.scandoubler && SAEV_config.video.vresolution)
					notice_screen_contents_lost();
			}
			#endif*/

			if (SAEV_command < 0) {
				SAEV_command = -SAEV_command;
				set_inhibit_frame(IHF_QUIT_PROGRAM);
				SAEF_setSpcFlags(SAEC_spcflag_BRK | SAEC_spcflag_MODE_CHANGE);
				return;
			}

			count_frame();

			if (framecnt == 0)
				init_drawing_frame();
		}
		/* OWN flush_screen() is not used
		else {
			if (isvsync_chipset())
				SAER.video.flush_screen(gfxvidinfo.inbuffer, 0, 0); //vsync mode
		}*/

		SAER.gui.flicker_led(-1, 0, 0);
		/*#ifdef AVIOUTPUT
		if (!SAEV_Playfield_picasso_on) frame_drawn();
		#endif*/
	}

	function hsync_record_line_state(lineno, how, changed) { //global
		//uae_u8 *state = linestate + lineno;

		if (framecnt != 0)
			return;

		//changed |= frame_redraw_necessary != 0 || refresh_indicator_buffer !== null || ((lineno >= lightpen_y1 && lineno < lightpen_y2) || (lineno >= statusbar_y1 && lineno < statusbar_y2));
		changed |= (frame_redraw_necessary != 0 || refresh_indicator_buffer !== null) ? 1 : 0;
		//changed |= (frame_redraw_necessary != 0 ? 1 : 0);

		switch (how) {
		case nln_normal:
			linestate[lineno] = changed ? LINE_DECIDED : LINE_DONE;
			break;
		case nln_doubled:
			linestate[lineno] = changed ? LINE_DECIDED_DOUBLE : LINE_DONE;
			changed |= (linestate[lineno + 1] != LINE_REMEMBERED_AS_PREVIOUS ? 1 : 0);
			linestate[lineno + 1] = changed ? LINE_AS_PREVIOUS : LINE_DONE_AS_PREVIOUS;
			break;
		case nln_nblack:
			linestate[lineno] = changed ? LINE_DECIDED : LINE_DONE;
			if (linestate[lineno + 1] != LINE_REMEMBERED_AS_BLACK) {
				linestate[lineno + 1] = LINE_BLACK;
			}
			break;
		case nln_lower:
			if (lineno > 0 && linestate[lineno - 1] == LINE_UNDECIDED) {
				linestate[lineno - 1] = LINE_DECIDED; //LINE_BLACK;
			}
			linestate[lineno] = changed ? LINE_DECIDED : LINE_DONE;
			break;
		case nln_upper:
			linestate[lineno] = changed ? LINE_DECIDED : LINE_DONE;
			if (linestate[lineno + 1] == LINE_UNDECIDED ||
				linestate[lineno + 1] == LINE_REMEMBERED_AS_PREVIOUS ||
				linestate[lineno + 1] == LINE_AS_PREVIOUS)
				linestate[lineno + 1] = LINE_DECIDED; //LINE_BLACK;
			break;
		case nln_lower_black_always:
			linestate[lineno + 1] = LINE_BLACK;
			linestate[lineno] = LINE_DECIDED;
			//if (lineno == (maxvpos + lof_store) * 2 - 1)
			//	linestate[lineno] = LINE_BLACK;
			break;
		case nln_lower_black:
			changed |= (linestate[lineno] != LINE_DONE ? 1 : 0);
			linestate[lineno + 1] = LINE_DONE;
			linestate[lineno] = changed ? LINE_DECIDED : LINE_DONE;
			//if (lineno == (maxvpos + lof_store) * 2 - 1)
			//	linestate[lineno + 1] = LINE_BLACK;
			break;
		case nln_upper_black_always:
			linestate[lineno] = LINE_DECIDED;
			if (lineno > 0) {
				linestate[lineno - 1] = LINE_BLACK;
			}
			if (!interlace_seen && lineno == (maxvpos + lof_store) * 2 - 2) {
				linestate[lineno + 1] = LINE_BLACK;
			}
			break;
		case nln_upper_black:
			changed |= (linestate[lineno] != LINE_DONE ? 1 : 0);
			linestate[lineno] = changed ? LINE_DECIDED : LINE_DONE;
			if (lineno > 0) {
				linestate[lineno - 1] = LINE_DONE;
			}
			if (!interlace_seen && lineno == (maxvpos + lof_store) * 2 - 2) {
				linestate[lineno + 1] = LINE_DONE;
			}
			break;
		}
	}

	function gfxbuffer_reset() {
		gfxvidinfo.drawbuffer.flush_line = function(gfxinfo, vb, line_no) {};
		gfxvidinfo.drawbuffer.flush_block = function(gfxinfo, vb, first_line, last_line) {};
		gfxvidinfo.drawbuffer.flush_screen = function(gfxinfo, vb, first_line, last_line) {};
		gfxvidinfo.drawbuffer.flush_clear_screen = function(gfxinfo, vb) {};
		gfxvidinfo.drawbuffer.lockscr = function(gfxinfo, vb) { return 1; };
		gfxvidinfo.drawbuffer.unlockscr = function(gfxinfo, vb) {};
	}

	function notice_resolution_seen(res, lace) { //global
		if (res > frame_res)
			frame_res = res;
		if (res > 0)
			can_use_lores = 0;
		if (!frame_res_lace && lace)
			frame_res_lace = lace;
	}

	function notice_interlace_seen(lace) { //global
		var changed = false;
		// non-lace to lace switch (non-lace active at least one frame)?
		if (lace) {
			if (interlace_seen == 0) {
				changed = true;
				//SAEF_log("playfield.notice_interlace_seen() ->lace PC=%x", SAER_CPU_getPC());
			}
			interlace_seen = SAEV_config.video.vresolution ? 1 : -1;
		} else {
			if (interlace_seen) {
				changed = true;
				//SAEF_log("playfield.notice_interlace_seen() ->non-lace PC=%x", SAER_CPU_getPC());
			}
			interlace_seen = 0;
		}
		return changed;
	}

	function reset_drawing() { //global
		max_diwstop = 0;

		lores_reset();
		reset_decision_table();
		init_aspect_maps();

		oldbufmem = null; //OWN
		oldheight = 0, oldpitch = 0; //OWN
		oldgenlock = false; //OWN

		init_row_map();
		last_redraw_point = 0;

		//memset(spixels, 0, sizeof spixels);
		//memset(&spixstate, 0, sizeof spixstate);
		SAEF_memset(spixels,0, 0, 2 * MAX_SPR_PIXELS);
		SAEF_memset(spixstate.bytes,0, 0, 2 * MAX_SPR_PIXELS);

		init_drawing_frame();
		pfield_set_linetoscr();
		notice_screen_contents_lost();

		frame_res_cnt = 1; //currprefs.gfx_autoresolution_delay; //OWN
		//lightpen_y1 = lightpen_y2 = -1; //OWN

		reset_custom_limits();

		clearbuffer(gfxvidinfo.drawbuffer);
		clearbuffer(gfxvidinfo.tempbuffer);

		center_reset = true;
		specialmonitoron = false;
		bplcolorburst_field = true;

		warned_pfield_draw_line = 0; //OWN
	}

	function gen_direct_drawing_table() {
		//#ifdef AGA
		// BYPASS color table
		for (var i = 0; i < 256; i++) {
			var v = ((i << 16) | (i << 8) | i) >>> 0;
			direct_colors_for_drawing.acolors[i] = CONVERT_RGB(v);
		}
		//#endif
	}

	function drawing_init() { //global
		refresh_indicator_init();
		gen_pfield_tables();
		gen_direct_drawing_table();
		//#ifdef PICASSO96
		SAEV_Playfield_picasso_on = false;
		SAEV_Playfield_picasso_requested_on = false;
		//gfx_set_picasso_state(0);
		//#endif

		//xlinebuffer = gfxvidinfo.drawbuffer.bufmem;
		//xlinebuffer_genlock = null;
		if (gfxvidinfo.drawbuffer.bufmem !== null) {
			if (gfxvidinfo.drawbuffer.pixbytes == 2)
				xlinebuffer = new Uint16Array(gfxvidinfo.drawbuffer.bufmem);
			else
				xlinebuffer = new Uint32Array(gfxvidinfo.drawbuffer.bufmem);
		} else
			xlinebuffer = null;

		inhibit_frame = 0;
		gfxbuffer_reset();
		reset_drawing();
	}

	function isvsync_chipset() { //global
		var ap = SAEV_config.video.apmode[0];
		if (SAEV_Playfield_picasso_on || !ap.gfx_vsync)
			return 0;
		if (ap.gfx_vsyncmode == 0)
			return 1;
		if (SAEV_config.cpu.speed >= 0)
			return -1;
		return -2;
	}
	SAER_Playfield_isvsync_chipset = isvsync_chipset;

	function isvsync_rtg() { //global
		var ap = SAEV_config.video.apmode[1];
		if (!SAEV_Playfield_picasso_on || !ap.gfx_vsync)
			return 0;
		if (ap.gfx_vsyncmode == 0)
			return 1;
		if (SAEV_config.cpu.speed >= 0)
			return -1;
		return -2;
	}

	function isvsync() { //global
		if (SAEV_Playfield_picasso_on)
			return isvsync_rtg();
		else
			return isvsync_chipset();
	}
	SAER_Playfield_isvsync = isvsync;

	/* drawing code */
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/* SECT playfield defs */

	const AUTOSCALE_SPRITES = true;
	//const SPRBORDER = 0;

	const MAXHPOS_ROWS = 256;
	const MAXVPOS_LINES_ECS = 2048;
	const MAXVPOS_LINES_OCS = 512;
	const HPOS_SHIFT = 3;

	/* PAL/NTSC values */
	const MAXHPOS_PAL = 227;
	const MAXHPOS_NTSC = 227;

	const MAXVPOS_PAL = 312; // short field maxvpos
	const MAXVPOS_NTSC = 262;

	const VBLANK_ENDLINE_PAL = 26; // following endlines = first visible line
	const VBLANK_ENDLINE_NTSC = 21;

	const VBLANK_SPRITE_PAL = 25; // line when sprite DMA fetches first control words
	const VBLANK_SPRITE_NTSC = 20;
	const VBLANK_HZ_PAL = 50;
	const VBLANK_HZ_NTSC = 60;
	const VSYNC_ENDLINE_PAL = 5;
	const VSYNC_ENDLINE_NTSC = 6;
	const EQU_ENDLINE_PAL = 8;
	const EQU_ENDLINE_NTSC = 10;

	/* calculate shift depending on resolution (replaced "decided_hires ? 4 : 8") */
	//function RES_SHIFT(res) { return res == SAEC_Config_Video_HResolution_LoRes ? 8 : (res == SAEC_Config_Video_HResolution_HiRes ? 4 : 2); }

	/* get resolution from bplcon0 */
	function GET_RES_DENISE(con0) {
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE))
			con0 &= ~0x40; // SUPERHIRES
		return (con0 & 0x40) ? SAEC_Config_Video_HResolution_SuperHiRes : ((con0 & 0x8000) ? SAEC_Config_Video_HResolution_HiRes : SAEC_Config_Video_HResolution_LoRes);
	}
	function GET_RES_AGNUS(con0) {
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS))
			con0 &= ~0x40; // SUPERHIRES
		return (con0 & 0x40) ? SAEC_Config_Video_HResolution_SuperHiRes : ((con0 & 0x8000) ? SAEC_Config_Video_HResolution_HiRes : SAEC_Config_Video_HResolution_LoRes);
	}
	/* get sprite width from FMODE */
	//#define GET_SPRITEWIDTH(FMODE) ((((FMODE) >> 2) & 3) == 3 ? 64 : (((FMODE) >> 2) & 3) == 0 ? 16 : 32)
	function GET_SPRITEWIDTH(fm) {
		fm = (fm >> 2) & 3;
		return fm == 3 ? 64 : (fm == 0 ? 16 : 32);
	}

	/* Compute the number of bitplanes from a value written to BPLCON0  */
	function GET_PLANES(bplcon0) {
		if ((bplcon0 & 0x0010) && (bplcon0 & 0x7000))
			return 0; // >8 planes = 0 planes
		if (bplcon0 & 0x0010)
			return 8; // AGA 8-planes bit
		return (bplcon0 >> 12) & 7; // normal planes bits
	}

	/* playfield defs */
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/* SECT playfield code */

	function nocustom() {
		return false; //(SAEV_Playfield_picasso_on && currprefs.picasso96_nocustom);
	}

	/*#if 0
	struct customhack {
		uae_u16 v;
		int vpos, hpos;
	};
	void customhack_put (struct customhack *ch, uae_u16 v, int hpos)
	{
		ch->v = v;
		ch->vpos = vpos;
		ch->hpos = hpos;
	}

	uae_u16 customhack_get (struct customhack *ch, int hpos)
	{
		if (ch->vpos == vpos && ch->hpos == hpos) {
			ch->vpos = -1;
			return 0xffff;
		}
		return ch->v;
	}
	#endif*/

	//static unsigned int n_consecutive_skipped = 0;
	//static unsigned int total_skipped = 0;


	var hpos_offset = 0; //global int
	var vpos = 0; //global int
	var vpos_count = 0, vpos_count_diff = 0; //int
	var lof_store = 0; //global int, real bit in custom registers
	var lof_current = 0; //int, what display device thinks
	var lof_lastline = false, lof_prev_lastline = false; //bool
	var lol = 0; //int
	var next_lineno = 0, prev_lineno = 0; //int
	var nextline_how = 0; //enum nln_how
	var lof_changed = 0, lof_changing = 0, interlace_changed = 0; //int
	var lof_changed_previous_field = 0; //int
	var vposw_change = 0; //int
	var lof_lace = false; //bool
	var bplcon0_interlace_seen = false; //bool
	var scandoubled_line = 0; //int
	var vsync_rendered = false; //bool
	//-> SAEV_Playfield_frame_rendered var frame_rendered = false; //bool
	//-> SAEV_Playfield_frame_shown var frame_shown = false; //bool
	var genlockhtoggle = false; //bool
	var genlockvtoggle = false; //bool
	var graphicsbuffer_retry = false; //bool
	var scanlinecount = 0; //int

	const LOF_TOGGLES_NEEDED = 3;
	//const NLACE_CNT_NEEDED = 50;
	var lof_togglecnt_lace = 0, lof_togglecnt_nlace = 0; //, nlace_cnt = 0; //int

	/* Stupid genlock-detection prevention hack.
	* We should stop calling vsync_handler() and
	* hstop_handler() completely but it is not
	* worth the trouble..
	*/
	var vpos_previous = 0, hpos_previous = 0; //int
	var vpos_lpen = 0, hpos_lpen = 0, lightpen_triggered = 0; //int
	var lightpen_x = -1, lightpen_y = -1, lightpen_cx = 0, lightpen_cy = 0, lightpen_active = 0, lightpen_enabled = 0; //global int

	var sprtaba = null, sprtabb = null; //u32 [256]
	var sprite_ab_merge = null; //u32 [256]
	/* Tables for collision detection.  */
	var sprclx = null, clxmask = null; //u32 [16]

	/* T genlock bit in ECS Denise and AGA color registers */
	var color_regs_genlock = new Uint8Array(256); //u8

	/*
	* Hardware registers of all sorts.
	*/
	var cregs = new Uint16Array(256); //u16

	//->custom.js var last_custom_value1 = 0; //global u32

	var maxhpos = MAXHPOS_PAL; //global int
	var maxhpos_short = MAXHPOS_PAL; //global int
	var maxvpos = MAXVPOS_PAL; //global int
	var maxvpos_nom = MAXVPOS_PAL; //global int, nominal value (same as maxvpos but "faked" maxvpos in fake 60hz modes)
	var maxvpos_display = MAXVPOS_PAL; //global int, value used for display size
	var hsyncendpos = 0, hsyncstartpos = 0; //global int
	var maxvpos_total = 511; //int
	var minfirstline = VBLANK_ENDLINE_PAL; //global int
	var firstblankedline = 0; //global int
	var equ_vblank_endline = EQU_ENDLINE_PAL; //int
	var equ_vblank_toggle = true; //bool
	var vblank_hz = VBLANK_HZ_PAL, vblank_hz_stored = 0.0, vblank_hz_nom = 0.0; //global double
	//->SAEV_Playfield_fake_vblank_hz var fake_vblank_hz = 0.0; //global double
	var hblank_hz = 0.0; //global double
	var vblank_hz_lof = 0.0, vblank_hz_shf = 0.0, vblank_hz_lace = 0.0; //float
	var vblank_hz_mult = 0, vblank_hz_state = 0; //int
	var stored_chipset_refresh = null; //struct chipset_refresh *
	var doublescan = 0; //global int
	var programmedmode = false; //global bool
	//-> events.js var syncbase = 0; //global int
	var fmode_saved = 0, fmode = 0; //int
	var beamcon0 = 0, new_beamcon0 = 0; //global u16
	var varsync_changed = false; //bool
	var vtotal = MAXVPOS_PAL, htotal = MAXHPOS_PAL; //u16
	var maxvpos_stored = 0, maxhpos_stored = 0; //int
	var hsstop = 0, hbstrt = 0, hbstop = 0, vsstop = 0, vbstrt = 0, vbstop = 0, hsstrt = 0, vsstrt = 0, hcenter = 0; //u16
	var ciavsyncmode = 0; //int
	var diw_hstrt = 0, diw_hstop = 0; //int
	var diw_hcounter = 0; //int
	var refptr = 0; //u16
	var refptr_val = 0; //u32

	function sprite() {
		this.pt = 0; //uaecptr
		this.xpos = 0; //all int
		this.vstart = 0;
		this.vstop = 0;
		this.dblscan = 0; /* AGA SSCAN2 */
		this.armed = 0;
		this.dmastate = 0;
		this.dmacycle = 0;
		this.ptxhpos = 0;
		this.ptxhpos2 = 0;
		this.ptxvpos2 = 0;
		this.ignoreverticaluntilnextline = false; //bool

		this.clr = function() {
			this.pt = 0;
			this.xpos = 0;
			this.vstart = 0;
			this.vstop = 0;
			this.dblscan = 0;
			this.armed = 0;
			this.dmastate = 0;
			this.dmacycle = 0;
			this.ptxhpos = 0;
			this.ptxhpos2 = 0;
			this.ptxvpos2 = 0;
			this.ignoreverticaluntilnextline = false;
		}
	};
	const SPR0_HPOS = 0x15;

	var spr = new Array(MAX_SPRITES); //struct sprite [MAX_SPRITES]
	for (var vi = 0; vi < MAX_SPRITES; vi++)
		spr[vi] = new sprite();

	var plfstrt_sprite = 0; //int
	var sprite_ignoreverticaluntilnextline = false; //bool

	var sprite_0 = 0; //global uaecptr
	var sprite_0_width = 0, sprite_0_height = 0, sprite_0_doubled = 0; //global int
	var sprite_0_colors = new Uint32Array(4); //global u32
	var magic_sprite_mask = 0xff; //u8

	var sprite_vblank_endline = VBLANK_SPRITE_PAL; //int

	var sprctl = new Uint16Array(MAX_SPRITES); //u16
	var sprpos = new Uint16Array(MAX_SPRITES); //u16
	//#ifdef AGA
	var sprdata = new Array(MAX_SPRITES); //u16 [MAX_SPRITES][4]
	for (var vi = 0; vi < MAX_SPRITES; vi++) sprdata[vi] = new Uint16Array(4);
	var sprdatb = new Array(MAX_SPRITES); //u16 [MAX_SPRITES][4]
	for (var vi = 0; vi < MAX_SPRITES; vi++) sprdatb[vi] = new Uint16Array(4);
	/*#else
	var sprdata = new Array(MAX_SPRITES); //u16 [MAX_SPRITES][1]
	for (var vi = 0; vi < MAX_SPRITES; vi++) sprdata[vi] = new Uint16Array(1);
	var sprdatb = new Array(MAX_SPRITES); //u16 [MAX_SPRITES][1]
	for (var vi = 0; vi < MAX_SPRITES; vi++) sprdatb[vi] = new Uint16Array(1);
	#endif*/

	//var sprite_last_drawn_at = new Int32Array(MAX_SPRITES); //int
	var last_sprite_point = 0, nr_armed = 0; //int
	var sprite_width = 0, sprres = 0; //int
	var sprite_sprctlmask = 0; //int
	var sprite_buffer_res = 0; //global int

	var bpl1dat_written = false, bpl1dat_written_at_least_once = false; //bool
	var bpldmawasactive = false; //bool
	var bpl1mod = 0, bpl2mod = 0, dbpl1mod = 0, dbpl2mod = 0; //s16
	var dbpl1mod_on = 0, dbpl2mod_on = 0; //int
	var prevbpl = new Array(2); //uaecptr [2][MAXVPOS][8]
	for (var vi = 0; vi < prevbpl.length; vi++) {
		prevbpl[vi] = new Array(MAXVPOS);
		for (var vj = 0; vj < prevbpl[vi].length; vj++) {
			prevbpl[vi][vj] = new Array(8);
			for (var vk = 0; vk < prevbpl[vi][vj].length; vk++) prevbpl[vi][vj][vk] = 0;
		}
	}
	var bplpt = new Array(8); //uaecptr
	var bplptx = new Array(8); //uaecptr
	for (var vi = 0; vi < 8; vi++) {
		bplpt[vi] = 0;
		bplptx[vi] = 0;
	}

	/*#if 0
	var dbplptl[8], dbplpth[8]; //uaecptr
	var dbplptl_on[8], dbplpth_on[8], dbplptl_on2, dbplpth_on2; //int
	#endif*/
	var bitplane_line_crossing = 0; //int

	var current_colors = new color_entry(); //struct color_entry
	var bplcon0 = 0; //global uint
	var bplcon1 = 0, bplcon2 = 0, bplcon3 = 0, bplcon4 = 0; //uint
	var bplcon0d = 0, bplcon0dd = 0, bplcon0_res = 0, bplcon0_planes = 0, bplcon0_planes_limit = 0; //uint
	var diwstrt = 0, diwstop = 0, diwhigh = 0; //uint
	var diwhigh_written = 0; //int
	var ddfstrt, ddfstop = 0; //uint
	var line_cyclebased = 0, badmode = 0, diw_change = 0; //int
	var bplcon1_fetch = 0; //int
	var hpos_is_zero_bplcon1_hack = -1; //int

	/* The display and data fetch windows */
	var plffirstline = 0, plflastline = 0; //int
	var plffirstline_total = 0, plflastline_total = 0; //global int
	var autoscale_bordercolors = 0; //int
	var plfstrt = 0, plfstop = 0; //int
	var sprite_minx = 0, sprite_maxx = 0; //int
	var first_bpl_vpos = 0; //int
	var last_ddf_pix_hpos = 0; //int
	var last_decide_line_hpos = 0; //int
	var last_fetch_hpos = 0, last_sprite_hpos = 0; //int
	var diwfirstword = 0, diwlastword = 0; //int
	var last_hdiw = 0; //int
	var diwstate = 0, hdiwstate = 0, ddfstate = 0; //enum diw_states
	var bpl_hstart = 0; //int

	var first_planes_vpos = 0, last_planes_vpos = 0; //global int
	var first_bplcon0 = 0, first_bplcon0_old = 0; //int
	var first_planes_vpos_old = 0, last_planes_vpos_old = 0; //int
	var diwfirstword_total = 0, diwlastword_total = 0; //global int
	var ddffirstword_total = 0, ddflastword_total = 0; //global int
	var diwfirstword_total_old = 0, diwlastword_total_old = 0; //int
	var ddffirstword_total_old = 0, ddflastword_total_old = 0; //int
	var vertical_changed = 0, horizontal_changed = 0; //global bool
	var firstword_bplcon1 = 0; //global int

	/* Sprite collisions */
	var clxdat = 0, clxcon = 0, clxcon2 = 0, clxcon_bpl_enable = 0, clxcon_bpl_match = 0; //uint

	/* Recording of custom chip register changes.  */
	var current_change_set = 0; //int

	var sprite_entries = new Array(2); //struct sprite_entry [2][MAX_SPR_PIXELS / 16];
	for (var vi = 0; vi < sprite_entries.length; vi++) {
		sprite_entries[vi] = new Array(MAX_SPR_PIXELS >> 4);
		for (var vj = 0; vj < sprite_entries[vi].length; vj++) sprite_entries[vi][vj] = new sprite_entry();
	}

	var color_changes = new Array(2); //struct color_change [2][MAX_REG_CHANGE];
	for (var vi = 0; vi < color_changes.length; vi++) {
		color_changes[vi] = new Array(MAX_REG_CHANGE);
		for (var vj = 0; vj < color_changes[vi].length; vj++) color_changes[vi][vj] = new color_change();
	}

	var line_drawinfo = new Array(2); //struct draw_info [2][2 * (MAXVPOS + 2) + 1];
	for (var vi = 0; vi < line_drawinfo.length; vi++) {
		line_drawinfo[vi] = new Array(2 * (MAXVPOS + 2) + 1);
		for (var vj = 0; vj < line_drawinfo[vi].length; vj++) line_drawinfo[vi][vj] = new draw_info();
	}

	const COLOR_TABLE_SIZE = (MAXVPOS + 2) * 2;
	var color_tables = new Array(2); //struct color_entry [2][COLOR_TABLE_SIZE];
	for (var vi = 0; vi < color_tables.length; vi++) {
		color_tables[vi] = new Array(COLOR_TABLE_SIZE);
		for (var vj = 0; vj < color_tables[vi].length; vj++) color_tables[vi][vj] = new color_entry();
	}

	var line_decisions = new Array(2 * (MAXVPOS + 2) + 1); //struct decision [2 * (MAXVPOS + 2) + 1];
	for (var vi = 0; vi < 2 * (MAXVPOS + 2) + 1; vi++)
		line_decisions[vi] = new decision();

	var next_sprite_entry = 0; //int
	var prev_next_sprite_entry = 0; //int
	var next_sprite_forced = 1; //int

	var curr_sprite_entries = null, prev_sprite_entries = null; //struct sprite_entry *
	var curr_color_changes = null, prev_color_changes = null; //struct color_change *
	var curr_drawinfo = null, prev_drawinfo = null; //struct draw_info *
	var curr_color_tables = null, prev_color_tables = null; //struct color_entry *

	var next_color_change = 0; //int
	var next_color_entry = 0, remembered_color_entry = 0; //int
	var color_src_match = 0, color_dest_match = 0, color_compare_result = 0; //int

	var thisline_changed = 0; //u32

	/*OPT inline, ok
	#ifdef SMART_UPDATE
		#define MARK_LINE_CHANGED do { thisline_changed = 1; } while (0)
	#else
		#define MARK_LINE_CHANGED do { ; } while (0)
	#endif*/

	var thisline_decision = new decision(); //struct decision
	var fetch_cycle = 0, fetch_modulo_cycle = 0; //int
	var aga_plf_passed_stop2 = false; //bool
	var plf_start_hpos = 0, plf_end_hpos = 0; //int
	var ddfstop_written_hpos = 0; //int
	var bitplane_off_delay = 0; //int
	var ocs_agnus_ddf_enable_toggle = false; //bool
	var bpl_dma_off_when_active = 0; //int
	var bitplane_maybe_start_hpos = 0; //int
	var ddfstop_matched = false; //bool

	var cpu_accurate = true; //OWN

	//enum plfstate
	const plf_idle = 0;
	//enable passed
	const plf_passed_enable = 1;
	//ddfstrt match
	const plf_passed_start = 2;
	//active (ddfstrt + 4 match)
	const plf_active = 3;
	//inactive = ; waiting
	const plf_wait = 4;
	//ddfstop passed
	const plf_passed_stop = 5;
	//ddfstop+4 passed
	const plf_passed_stop_act = 6;
	//last block finished
	const plf_passed_stop2 = 7;
	const plf_end = 8;

	var plf_state = plf_idle;

	//enum plfrenderstate
	const plfr_idle = 0;
	const plfr_active = 1;
	const plfr_end = 2;
	const plfr_finished = 3;

	var plfr_state = plfr_idle;

	//enum fetchstate
	const fetch_not_started = 0;
	const fetch_started_first = 1;
	const fetch_started = 2;
	const fetch_was_plane0 = 3;

	var fetch_state = fetch_not_started;

	var warned_maybe_finish_last_fetch = 20; //OWN

	/*-----------------------------------------------------------------------*/
	/* OWN global functions */

	this.get_maxhpos = function() { return maxhpos; } //OWN
	this.get_maxhpos_short = function() { return maxhpos_short; } //OWN
	this.get_maxvpos = function() { return maxvpos; } //OWN
	this.get_maxvpos_nom = function() { return maxvpos_nom; } //OWN
	this.get_maxvpos_display = function() { return maxvpos_display; } //OWN
	this.get_vpos = function() { return vpos; } //OWN
	//this.set_vpos = function(v) { vpos = v; } //OWN
	//this.set_vpos_count = function(v) { vpos_count = v; } //OWN
	this.get_vblank_hz = function() { return vblank_hz; } //OWN
	//this.get_vblank_hz_state = function() { return vblank_hz_state; } //OWN
	this.get_beamcon0 = function() { return beamcon0; } //OWN

	//this.get_bplcon0 = function() { return bplcon0; } //OWN input mouse fix
	//this.get_bplcon0_res = function() { return bplcon0_res; } //OWN input mouse fix
	//this.get_diwstate = function() { return diwstate; }; //OWN

	this.set_line_cyclebased = function() { line_cyclebased = 2; }; //OWN

	this.get_slowdowndata = function() { //OWN
		return [
			thisline_decision.plfleft,
			thisline_decision.plfright - (16 << fetchmode),
			cycle_diagram_total_cycles[fetchmode][GET_RES_AGNUS(bplcon0)][GET_PLANES_LIMIT(bplcon0)],
			cycle_diagram_free_cycles[fetchmode][GET_RES_AGNUS(bplcon0)][GET_PLANES_LIMIT(bplcon0)]
		];
	};

	this.set_bitplane_maybe_start_hpos = function(hpos) { //OWN used from amiga.js
		line_cyclebased = 2; //SET_LINE_CYCLEBASED();
		bitplane_maybe_start_hpos = hpos;
	}

	/*-----------------------------------------------------------------------*/
	/* SECT helper functions */

	//#define SET_LINE_CYCLEBASED line_cyclebased = 2;
	//function SET_LINE_CYCLEBASED() { line_cyclebased = 2; } //OPT inline ok

	//#define HSYNCTIME (maxhpos * SAEC_Events_CYCLE_UNIT)
	//function HSYNCTIME() { return maxhpos * SAEC_Events_CYCLE_UNIT; } //OPT inline ok

	this.copper_cant_read = function(hpos, alloc) {
		if (hpos + 1 >= maxhpos) // first refresh slot
			return 1;
		if ((hpos == maxhpos - 3) && (maxhpos & 1) && alloc >= 0) {
			//if (alloc) SAER.events.alloc_cycle(hpos, SAEC_Events_cycle_line_COPPER);
			return -1;
		}
		return this.is_bitplane_dma(hpos);
	}

	function isecsshres() {
		return bplcon0_res == SAEC_Config_Video_HResolution_SuperHiRes && (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) && !(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA);
	}

	function nodraw() { //OPT inline
		return framecnt != 0;
	}

	function doflickerfix() {
		return SAEV_config.video.vresolution && doublescan < 0 && vpos < MAXVPOS;
	}

	/*function void setclr(*p, val) {
		if (val & 0x8000)
			*p |= val & 0x7FFF;
		else
			*p &= ~val;
	}*/



	function set_chipset_mode() {
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA)
			fmode = fmode_saved;
		else
			fmode = 0;

		sprite_width = GET_SPRITEWIDTH(fmode);
	}

	function update_mirrors() {
		aga_mode = (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) != 0;
		direct_rgb = aga_mode;
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA)
			sprite_sprctlmask = 0x01 | 0x08 | 0x10;
		else if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE)
			sprite_sprctlmask = 0x01 | 0x10;
		else
			sprite_sprctlmask = 0x01;

		set_chipset_mode();
	}




	function docols(colentry) { //struct color_entry *
		//#ifdef AGA
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			for (var i = 0; i < 256; i++) {
				var v = color_reg_get(colentry, i);
				if (v < 0 || v > 16777215)
					continue;
				colentry.acolors[i] = getxcolor(v);
			}
		} else {
		//#endif
			for (var i = 0; i < 32; i++) {
				var v = color_reg_get(colentry, i);
				if (v < 0 || v > 4095)
					continue;
				colentry.acolors[i] = getxcolor(v);
			}
		//#ifdef AGA
		}
		//#endif
	}

	function notice_new_xcolors() {
		update_mirrors();
		docols(current_colors);
		docols(colors_for_drawing);
		for (var i = 0; i < (MAXVPOS + 1) * 2; i++) {
			docols(color_tables[0][i]);
			docols(color_tables[1][i]);
		}
	}
	this.notice_new_xcolors_ext = function() {
		notice_new_xcolors();
	}

	function remember_ctable() {
		/* This can happen when program crashes very badly */
		if (next_color_entry >= COLOR_TABLE_SIZE)
			return;
		if (remembered_color_entry < 0) {
			/* The colors changed since we last recorded a color map. Record a new one. */
			//color_reg_cpy(curr_color_tables + next_color_entry, &current_colors);
			color_reg_cpy(curr_color_tables[next_color_entry], current_colors);
			remembered_color_entry = next_color_entry++;
		}
		thisline_decision.ctable = remembered_color_entry;
		if (color_src_match < 0 || color_dest_match != remembered_color_entry || line_decisions[next_lineno].ctable != color_src_match) {
			/* The remembered comparison didn"t help us - need to compare again. */
			var oldctable = line_decisions[next_lineno].ctable;
			var changed = 0;

			if (oldctable < 0) {
				changed = 1;
				color_src_match = color_dest_match = -1;
			} else {
				//color_compare_result = color_reg_cmp(&prev_color_tables[oldctable], &current_colors) != 0;
				color_compare_result = color_reg_cmp(prev_color_tables[oldctable], current_colors) != 0;
				if (color_compare_result)
					changed = 1;
				color_src_match = oldctable;
				color_dest_match = remembered_color_entry;
			}
			thisline_changed |= changed;
		} else {
			/* We know the result of the comparison */
			if (color_compare_result)
				thisline_changed = 1;
		}
	}
	function remember_ctable_for_border() {
		remember_ctable();
	}

	function get_equ_vblank_endline() {
		return equ_vblank_endline + (equ_vblank_toggle ? (lof_current ? 1 : 0) : 0);
	}

	const DDF_OFFSET = 4;
	function HARD_DDF_LIMITS_DISABLED() { return ((beamcon0 & 0x80) || (beamcon0 & 0x4000) || (bplcon0 & 0x40)); }
	function HARD_DDF_STOP() { return (HARD_DDF_LIMITS_DISABLED() ? maxhpos : 0xd4); } /* The HRM says 0xD8, but that can't work... */
	//function HARD_DDF_START() { return (HARD_DDF_LIMITS_DISABLED() ? 0x04 : 0x14); } /* Programmed rates or superhires (!) disable normal DMA limits */
	const HARD_DDF_START_REAL = 0x14;

	/* Called to determine the state of the horizontal display window state
	* machine at the current position. It might have changed since we last
	* checked.  */
	function decide_diw(hpos) {
		/* Last hpos = hpos + 0.5, eg. normal PAL end hpos is 227.5 * 2 = 455
			OCS Denise: 9 bit hdiw counter does not reset during lines 0 to 9
			(PAL) or lines 0 to 10 (NTSC). A1000 PAL: 1 to 9, NTSC: 1 to 10.
			ECS Denise and AGA: no above "features"
		*/
		var hdiw = hpos >= maxhpos ? maxhpos * 2 + 1 : hpos * 2 + 2;
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) && vpos <= get_equ_vblank_endline())
			hdiw = diw_hcounter;
		/* always mask, bad programs may have set maxhpos = 256 */
		hdiw &= 511;
		for (;;) {
			var lhdiw = hdiw;
			if (last_hdiw > lhdiw)
				lhdiw = 512;

			if (lhdiw >= diw_hstrt && last_hdiw < diw_hstrt && hdiwstate == DIW_WAITING_START) {
				if (thisline_decision.diwfirstword < 0)
					thisline_decision.diwfirstword = diwfirstword < 0 ? PIXEL_XPOS(0) : diwfirstword;
				hdiwstate = DIW_WAITING_STOP;
			}
			if (((hpos >= maxhpos && HARD_DDF_LIMITS_DISABLED()) || (lhdiw >= diw_hstop && last_hdiw < diw_hstop)) && hdiwstate == DIW_WAITING_STOP) {
				if (thisline_decision.diwlastword < 0)
					thisline_decision.diwlastword = diwlastword < 0 ? 0 : diwlastword;
				hdiwstate = DIW_WAITING_START;
			}
			if (lhdiw != 512)
				break;
			last_hdiw = 0 - 1;
		}
		last_hdiw = hdiw;
	}

	var fetchmode = 0, fetchmode_size = 0, fetchmode_mask = 0, fetchmode_bytes = 0; //int
	var real_bitplane_number = []; //[3][3][9]; //int [3][3][9]

	/* Disable bitplane DMA if planes > available DMA slots. This is needed e.g. by the Sanity WOC demo (at the "Party Effect").  */
	function GET_PLANES_LIMIT(bc0) {
		var res = GET_RES_AGNUS(bc0);
		var planes = GET_PLANES(bc0);
		return real_bitplane_number[fetchmode][res][planes];
	}

	/*#if 0
	static void reset_dbplh(int hpos, int num) {
		if (dbplpth_on[num] && hpos >= dbplpth_on[num]) {
			bplpt[num] = dbplpth[num] | (bplpt[num] & 0x0000fffe);
			dbplpth_on[num] = 0;
			dbplpth_on2--;
		}
	}
	static void reset_dbplh_all (int hpos) {
		if (dbplpth_on2) {
			for (int num = 0; num < MAX_PLANES; num++) {
				reset_dbplh(hpos, num);
			}
			dbplpth_on2 = 0;
		}
	}
	static void reset_dbpll (int hpos, int num) {
		if (dbplptl_on[num] && hpos >= dbplptl_on[num]) {
			bplpt[num] = (bplpt[num] & 0xffff0000) | dbplptl[num];
			dbplptl_on[num] = 0;
			dbplptl_on2--;
		}
	}
	static void reset_dbpll_all (int hpos) {
		if (dbplptl_on2) {
			for (int num = 0; num < MAX_PLANES; num++) {
				reset_dbpll(hpos, num);
			}
			dbplptl_on2 = 0;
		}
	}
	#endif*/

	function reset_moddelays() {
		if (dbpl1mod_on > 0) {
			bpl1mod = dbpl1mod;
			dbpl1mod_on = 0;
		}
		if (dbpl2mod_on > 0) {
			bpl2mod = dbpl2mod;
			dbpl2mod_on = 0;
		}
	}

	function add_modulo(hpos, nr) {
		var mod;

		if (dbpl1mod_on != hpos && dbpl1mod_on) {
			bpl1mod = dbpl1mod;
			dbpl1mod_on = 0;
		}
		if (dbpl2mod_on != hpos && dbpl2mod_on) {
			bpl2mod = dbpl2mod;
			dbpl2mod_on = 0;
		}
		if (fmode & 0x4000) {
			if (((diwstrt >> 8) ^ vpos) & 1)
				mod = bpl2mod;
			else
				mod = bpl1mod;
		} else if (nr & 1)
			mod = bpl2mod;
		else
			mod = bpl1mod;
		bplpt[nr] += mod;
		bplptx[nr] += mod;
		reset_moddelays();
		/*#if 0
		reset_dbpll_all (-1);
		#endif*/
	}

	function add_modulos() { //speedup
		var m1, m2;

		reset_moddelays();
		/*#if 0
		reset_dbpll_all(-1);
		#endif*/
		if (fmode & 0x4000) {
			if (((diwstrt >> 8) ^ vpos) & 1)
				m1 = m2 = bpl2mod;
			else
				m1 = m2 = bpl1mod;
		} else {
			m1 = bpl1mod;
			m2 = bpl2mod;
		}

		switch (bplcon0_planes_limit) {
			//#ifdef AGA
			case 8: bplpt[7] += m2; bplptx[7] += m2;
			case 7: bplpt[6] += m1; bplptx[6] += m1;
			//#endif
			case 6: bplpt[5] += m2; bplptx[5] += m2;
			case 5: bplpt[4] += m1; bplptx[4] += m1;
			case 4: bplpt[3] += m2; bplptx[3] += m2;
			case 3: bplpt[2] += m1; bplptx[2] += m1;
			case 2: bplpt[1] += m2; bplptx[1] += m2;
			case 1: bplpt[0] += m1; bplptx[0] += m1;
		}
	}

	function finish_playfield_line() {
		/* The latter condition might be able to happen in interlaced frames. */
		if (vpos >= minfirstline && (thisframe_first_drawn_line < 0 || vpos < thisframe_first_drawn_line))
			thisframe_first_drawn_line = vpos;
		thisframe_last_drawn_line = vpos;

		if (SMART_UPDATE) {
			if (line_decisions[next_lineno].plflinelen != thisline_decision.plflinelen
				|| line_decisions[next_lineno].plfleft != thisline_decision.plfleft
				|| line_decisions[next_lineno].bplcon0 != thisline_decision.bplcon0
				|| line_decisions[next_lineno].bplcon2 != thisline_decision.bplcon2
				//#ifdef ECS_DENISE
				|| line_decisions[next_lineno].bplcon3 != thisline_decision.bplcon3
				//#endif
				//#ifdef AGA
				|| line_decisions[next_lineno].bplcon4 != thisline_decision.bplcon4
				//#endif
			)
				thisline_changed = 1;
		} else
			thisline_changed = 1;
	}

	this.isvga = function() {
		if (!(beamcon0 & 0x80))
			return false;
		if (hblank_hz >= 20000)
			return true;
		return false;
	}
	this.ispal = function() {
		if (beamcon0 & 0x80)
			return SAEV_config.chipset.ntsc == 0;
		return maxvpos_display >= MAXVPOS_NTSC + ((MAXVPOS_PAL - MAXVPOS_NTSC) >> 1);
	}

	/*-----------------------------------------------------------------------*/
	/* SECT setup */

	/* The fetch unit mainly controls ddf stop.  It"s the number of cycles that
	are contained in an indivisible block during which ddf is active.  E.g.
	if DDF starts at 0x30, and fetchunit is 8, then possible DDF stops are
	0x30 + n * 8.  */
	var fetchunit = 0, fetchunit_mask = 0; //int
	/* The delay before fetching the same bitplane again.  Can be larger than
	the number of bitplanes; in that case there are additional empty cycles
	with no data fetch (this happens for high fetchmodes and low
	resolutions).  */
	var fetchstart = 0, fetchstart_shift = 0, fetchstart_mask = 0; //int
	/* fm_maxplane holds the maximum number of planes possible with the current
	fetch mode.  This selects the cycle diagram:
	8 planes: 73516240
	4 planes: 3120
	2 planes: 10.  */
	var fm_maxplane = 0, fm_maxplane_shift = 0; //int

	/* The corresponding values, by fetchmode and display resolution.  */
	const fetchunits = [8,8,8,0, 16,8,8,0, 32,16,8,0]; //int
	const fetchstarts = [3,2,1,0, 4,3,2,0, 5,4,3,0]; //int
	const fm_maxplanes = [3,2,1,0, 3,3,2,0, 3,3,3,0]; //int

	var cycle_diagram_table = null; //int [3][3][9][32]
	var cycle_diagram_free_cycles = null; //int [3][3][9]
	var cycle_diagram_total_cycles = null; //int [3][3][9]
	var curr_diagram = null; //int *
	//const cycle_sequences = [2,1,2,1,2,1,2,1, 4,2,3,1,4,2,3,1, 8,4,6,2,7,3,5,1]; //int
	const cycle_sequences = [[2,1,2,1,2,1,2,1], [4,2,3,1,4,2,3,1], [8,4,6,2,7,3,5,1]]; //int

	function debug_cycle_diagram() {
		var fm, res, planes, cycle, v, aa;

		for (fm = 0; fm <= 2; fm++) {
			var t = "";
			t += sprintf("FMODE %d\n=======\n", fm);
			for (res = 0; res <= 2; res++) {
				for (planes = 0; planes <= 8; planes++) {
					t += sprintf("%d: ",planes);
					for (cycle = 0; cycle < 32; cycle++) {
						v = cycle_diagram_table[fm][res][planes][cycle];
						if (v == 0) aa = "-"; else if (v > 0) aa = "1"; else aa = "X";
						t += aa;
					}
					t += sprintf("%d:%d\n", cycle_diagram_free_cycles[fm][res][planes], cycle_diagram_total_cycles[fm][res][planes]);
				}
				SAEF_log(t);
			}
		}
		fm = 0;
	}

	function create_cycle_diagram_table() {
		var fm, res, cycle, planes, rplanes, v; //int
		var fetch_start, max_planes, freecycles; //int
		var cycle_sequence; //const int *

		if (cycle_diagram_table !== null) return;

		cycle_diagram_table = new Array(3);
		cycle_diagram_free_cycles = new Array(3);
		cycle_diagram_total_cycles = new Array(3);
		real_bitplane_number = new Array(3);

		for (fm = 0; fm <= 2; fm++) {
			cycle_diagram_table[fm] = new Array(3);
			cycle_diagram_free_cycles[fm] = new Array(3);
			cycle_diagram_total_cycles[fm] = new Array(3);
			real_bitplane_number[fm] = new Array(3);

			for (res = 0; res <= 2; res++) {
				cycle_diagram_table[fm][res] = new Array(9);
				cycle_diagram_free_cycles[fm][res] = new Array(9);
				cycle_diagram_total_cycles[fm][res] = new Array(9);
				real_bitplane_number[fm][res] = new Array(9);

				max_planes = fm_maxplanes[fm * 4 + res];
				fetch_start = 1 << fetchstarts[fm * 4 + res];
				//cycle_sequence = &cycle_sequences[(max_planes - 1) * 8];
				cycle_sequence = cycle_sequences[max_planes - 1];
				max_planes = 1 << max_planes;
				for (planes = 0; planes <= 8; planes++) {
					cycle_diagram_table[fm][res][planes] = new Array(32);

					freecycles = 0;
					for (cycle = 0; cycle < 32; cycle++)
						cycle_diagram_table[fm][res][planes][cycle] = -1;
					if (planes <= max_planes) {
						for (cycle = 0; cycle < fetch_start; cycle++) {
							if (cycle < max_planes && planes >= cycle_sequence[cycle & 7]) {
								v = cycle_sequence[cycle & 7];
							} else {
								v = 0;
								freecycles++;
							}
							cycle_diagram_table[fm][res][planes][cycle] = v;
						}
					}
					cycle_diagram_free_cycles[fm][res][planes] = freecycles;
					cycle_diagram_total_cycles[fm][res][planes] = fetch_start;
					rplanes = planes;
					if (rplanes > max_planes)
						rplanes = 0;
					if (rplanes == 7 && fm == 0 && res == 0 && !(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA))
						rplanes = 4;
					real_bitplane_number[fm][res][planes] = rplanes;
				}
			}
		}
		//debug_cycle_diagram();
	}


	/* Used by the copper.  */
	var estimated_last_fetch_cycle = 0; //int
	var cycle_diagram_shift = 0; //int

	function estimate_last_fetch_cycle(hpos) {
		var fetchunit = fetchunits[fetchmode * 4 + bplcon0_res];
		// Last fetch is always max 8 even if fetchunit is larger.
		var lastfetchunit = fetchunit >= 8 ? 8 : fetchunit;

		if (plf_state < plf_passed_stop) {
			var stop;

			if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) {
				// ECS: stop wins if start == stop
				stop = plfstop + DDF_OFFSET < hpos || plfstop > HARD_DDF_STOP() ? HARD_DDF_STOP() : plfstop;
			} else {
				// OCS: start wins if start == stop
				stop = plfstop + DDF_OFFSET <= hpos || plfstop > HARD_DDF_STOP() ? HARD_DDF_STOP() : plfstop;
			}
			/* We know that fetching is up-to-date up until hpos, so we can use fetch_cycle.  */
			var fetch_cycle_at_stop = fetch_cycle + (stop - hpos + DDF_OFFSET);
			var starting_last_block_at = (fetch_cycle_at_stop + fetchunit - 1) & ~(fetchunit - 1);

			estimated_last_fetch_cycle = hpos + (starting_last_block_at - fetch_cycle) + lastfetchunit;
		} else {
			var starting_last_block_at = (fetch_cycle + fetchunit - 1) & ~(fetchunit - 1);
			if (plf_state == plf_passed_stop2)
				starting_last_block_at -= fetchunit;

			estimated_last_fetch_cycle = hpos + (starting_last_block_at - fetch_cycle) + lastfetchunit;
		}
	}

	/*-----------------------------------------------------------------------*/
	/* SECT toscr */

	var outword = new Uint32Array(MAX_PLANES); //u32
	var out_nbits = 0, out_offs = 0; //int
	var todisplay = new Uint16Array(MAX_PLANES); //u16
	var todisplay2 = new Uint16Array(MAX_PLANES); //u16
	var fetched = new Uint16Array(MAX_PLANES); //u16
	var todisplay_fetched = new Array(2); //bool
	//#ifdef AGA
	//var todisplay_aga[MAX_PLANES], todisplay2_aga[MAX_PLANES], fetched_aga[MAX_PLANES]; //u64
	var todisplay_aga_hi = new Uint32Array(MAX_PLANES);
	var todisplay_aga_lo = new Uint32Array(MAX_PLANES);
	var todisplay2_aga_hi = new Uint32Array(MAX_PLANES);
	var todisplay2_aga_lo = new Uint32Array(MAX_PLANES);
	var fetched_aga_hi = new Uint32Array(MAX_PLANES);
	var fetched_aga_lo = new Uint32Array(MAX_PLANES);
	//#endif

	/* Expansions from bplcon0/bplcon1.  */
	var toscr_res = 0, toscr_res2p = 0; //all int
	var toscr_nr_planes = 0, toscr_nr_planes2 = 0, toscr_nr_planes_agnus = 0, toscr_nr_planes_shifter = 0;
	var fetchwidth = 0;
	var toscr_delay = new Int32Array(2);
	var toscr_delay_adjusted = new Int32Array(2);
	var toscr_delay_sh = new Int32Array(2);
	var delay_cycles = 0;
	var delay_lastcycle = new Int32Array(2);
	var bplcon1_written = false; //bool

	const PLANE_RESET_HPOS = 8;
	var planesactiveatresetpoint = 0; //int

	/* The number of bits left from the last fetched words.
	This is an optimization - conceptually, we have to make sure the result is
	the same as if toscr is called in each clock cycle.  However, to speed this
	up, we accumulate display data; this variable keeps track of how much.
	Thus, once we do call toscr_nbits (which happens at least every 16 bits),
	we can do more work at once.  */
	var toscr_nbits = 0; //int

	/*#if 0 //undocumented bitplane delay hardware feature
	var delayoffset; //int
	function compute_delay_offset() {
		delayoffset = (16 << fetchmode) - (((plfstrt - HARD_DDF_START_REAL) & fetchstart_mask) << 1);
			  if (tmp ==  4) delayoffset = 4; // Loons Docs
		else if (tmp ==  8) delayoffset = 8;
		else if (tmp == 12) delayoffset = 4; //Loons Docs
		else if (tmp == 16) delayoffset = 48; //Overkill AGA
		else if (tmp == 24) delayoffset = 8; //AB 2
		else if (tmp == 32) delayoffset = 32;
		else if (tmp == 48) delayoffset = 16; //Pinball Illusions AGA, ingame
		else delayoffset = 0; //what about 40 and 56?
	}
	#endif*/

	function record_color_change2(hpos, regno, value) {
		var pos = hpos * 2;
		if (regno == 0x1000 + 0x10c)
			pos++; // BPLCON4 change needs 1 lores pixel delay
		curr_color_changes[next_color_change].linepos = pos;
		curr_color_changes[next_color_change].regno = regno;
		curr_color_changes[next_color_change].value = value;
		next_color_change++;
		curr_color_changes[next_color_change].regno = -1;
	}

	function isehb(bplcon0, bplcon2) {
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA)
			return (bplcon0 & 0x7010) == 0x6000;
		else if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE)
			return (bplcon0 & 0xFC00) == 0x6000 || (bplcon0 & 0xFC00) == 0x7000;

		return ((bplcon0 & 0xFC00) == 0x6000 || (bplcon0 & 0xFC00) == 0x7000) && !SAEV_config.chipset.deniseNoEHB;
	}

	// OCS/ECS, lores, 7 planes = 4 "real" planes + BPL5DAT and BPL6DAT as static 5th and 6th plane
	function isocs7planes() {
		return (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) == 0 && bplcon0_res == 0 && bplcon0_planes == 7;
	}

	this.is_bitplane_dma = function(hpos) { //global
		if (hpos < bpl_hstart || fetch_state == fetch_not_started || plf_state == plf_wait)
			return 0;
		if ((plf_state >= plf_end && hpos >= thisline_decision.plfright) || hpos >= estimated_last_fetch_cycle)
			return 0;
		return curr_diagram[(hpos - cycle_diagram_shift) & fetchstart_mask];
	}

	function islinetoggle() {
		if (!(beamcon0 & 0x0800) && !(beamcon0 & 0x0020) && (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS)) return true; // NTSC and !LOLDIS -> LOL toggles every line
		else if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) && SAEV_config.chipset.ntsc) return true; // hardwired NTSC Agnus
		return false;
	}

	/* Expand bplcon0/bplcon1 into the toscr_xxx variables.  */
	function compute_toscr_delay(bplcon1) {
		var delay1 = (bplcon1 & 0x0f) | ((bplcon1 & 0x0c00) >> 6);
		var delay2 = ((bplcon1 >> 4) & 0x0f) | (((bplcon1 >> 4) & 0x0c00) >> 6);
		var shdelay1 = (bplcon1 >> 8) & 3;
		var shdelay2 = (bplcon1 >> 12) & 3;
		var delaymask = fetchmode_mask >> toscr_res;

		toscr_delay[0] = (delay1 & delaymask) << toscr_res;
		toscr_delay[0] |= shdelay1 >> (RES_MAX - toscr_res);
		toscr_delay[1] = (delay2 & delaymask) << toscr_res;
		toscr_delay[1] |= shdelay2 >> (RES_MAX - toscr_res);

		if (SPEEDUP) {
			/* SPEEDUP code still needs this hack */
			var delayoffset = fetchmode_size - (((bpl_hstart - (HARD_DDF_START_REAL + DDF_OFFSET)) & fetchstart_mask) << 1);
			delay1 += delayoffset;
			delay2 += delayoffset;
			toscr_delay_adjusted[0] = (delay1 & delaymask) << toscr_res;
			toscr_delay_adjusted[0] |= shdelay1 >> (RES_MAX - toscr_res);
			toscr_delay_adjusted[1] = (delay2 & delaymask) << toscr_res;
			toscr_delay_adjusted[1] |= shdelay2 >> (RES_MAX - toscr_res);
		}
	}

	function set_delay_lastcycle() {
		if (HARD_DDF_LIMITS_DISABLED()) {
			delay_lastcycle[0] = (256 * 2) << bplcon0_res;
			delay_lastcycle[1] = (256 * 2) << bplcon0_res;
		} else {
			delay_lastcycle[0] = ((maxhpos + 1) * 2 + 0) << bplcon0_res;
			delay_lastcycle[1] = delay_lastcycle[0];
			if (islinetoggle())
				delay_lastcycle[1]++;
		}
	}

	var bpldmasetuphpos, bpldmasetuphpos_diff; //int
	var bpldmasetupphase; //int

	/* set currently active Agnus bitplane DMA sequence */
	function setup_fmodes(hpos) {
		switch (fmode & 3) {
			case 0:
				fetchmode = 0;
				break;
			case 1:
			case 2:
				fetchmode = 1;
				break;
			case 3:
				fetchmode = 2;
				break;
		}
		badmode = GET_RES_AGNUS(bplcon0) != GET_RES_DENISE(bplcon0);
		bplcon0_res = GET_RES_AGNUS(bplcon0);
		bplcon0_planes = GET_PLANES(bplcon0);
		bplcon0_planes_limit = GET_PLANES_LIMIT(bplcon0);
		fetchunit = fetchunits[fetchmode * 4 + bplcon0_res];
		fetchunit_mask = fetchunit - 1;
		fetchstart_shift = fetchstarts[fetchmode * 4 + bplcon0_res];
		fetchstart = 1 << fetchstart_shift;
		fetchstart_mask = fetchstart - 1;
		fm_maxplane_shift = fm_maxplanes[fetchmode * 4 + bplcon0_res];
		fm_maxplane = 1 << fm_maxplane_shift;
		fetch_modulo_cycle = fetchunit - fetchstart;
		fetchmode_size = 16 << fetchmode;
		fetchmode_bytes = 2 << fetchmode;
		fetchmode_mask = fetchmode_size - 1;
		set_delay_lastcycle();
		compute_toscr_delay(bplcon1);

		if (thisline_decision.plfleft < 0) {
			thisline_decision.bplres = bplcon0_res;
			thisline_decision.bplcon0 = bplcon0;
			thisline_decision.nr_planes = bplcon0_planes;
		}

		curr_diagram = cycle_diagram_table[fetchmode][bplcon0_res][bplcon0_planes_limit];

		//if (SAER.playfield.is_bitplane_dma(hpos - 1)) SAER_Events_cycle_line[hpos - 1] = SAEC_Events_cycle_line_REFRESH;

		estimate_last_fetch_cycle(hpos);
		bpldmasetuphpos = -1;
		bpldmasetupphase = 0;

		toscr_nr_planes_agnus = bplcon0_planes;
		if (isocs7planes())
			toscr_nr_planes_agnus = 6;

		line_cyclebased = 2; //SET_LINE_CYCLEBASED();
	}

	// writing to BPLCON0 adds 4 cycle delay before Agnus bitplane DMA sequence changes
	// (Note that Denise sees the change after 1 cycle)
	// AGA needs extra cycle in some specific situations (Brian The Lion "dialog") but not
	// in all situations (Superstardust weapon panel)
	//#define BPLCON_AGNUS_DELAY (3 + (SAEV_Copper_access ? 1 : 0) + (bplcon0_planes == 8 ? 1 : 0)) //OPT inline, ok
	//#define BPLCON_DENISE_DELAY (SAEV_Copper_access ? 1 : 0) //OPT inline, ok

	function maybe_setup_fmodes(hpos) {
		switch (bpldmasetupphase) {
			case 0:
				BPLCON0_Denise(hpos, bplcon0, false);
				bpldmasetupphase++;
				bpldmasetuphpos += bpldmasetuphpos_diff;
				break;
			case 1:
				setup_fmodes(hpos);
				break;
		}
	}
	function maybe_check(hpos) {
		if (bpldmasetuphpos > 0 && hpos >= bpldmasetuphpos)
			maybe_setup_fmodes(hpos);
	}

	function bpldmainitdelay(hpos) {
		line_cyclebased = 2; //SET_LINE_CYCLEBASED();
		//if (hpos + BPLCON_AGNUS_DELAY < 0x14) { //ORG
		if (hpos + 3 + (SAEV_Copper_access ? 1 : 0) + (bplcon0_planes == 8 ? 1 : 0) < 0x14) { //OWN opt inline
			BPLCON0_Denise(hpos, bplcon0, false);
			setup_fmodes(hpos);
			return;
		}
		/*ORG
		if (bpldmasetuphpos < 0) {
			bpldmasetuphpos = hpos + BPLCON_DENISE_DELAY;
			bpldmasetuphpos_diff = BPLCON_AGNUS_DELAY - BPLCON_DENISE_DELAY;
			bpldmasetupphase = 0;
			if (BPLCON_DENISE_DELAY == 0)
				maybe_setup_fmodes(hpos);
		}*/
		if (bpldmasetuphpos < 0) { //OWN opt inline
			bpldmasetuphpos = hpos + (SAEV_Copper_access ? 1 : 0);
			//bpldmasetuphpos_diff = 3 + (SAEV_Copper_access ? 1 : 0) + (bplcon0_planes == 8 ? 1 : 0) - (SAEV_Copper_access ? 1 : 0);
			bpldmasetuphpos_diff = 3 + (bplcon0_planes == 8 ? 1 : 0);
			bpldmasetupphase = 0;
			if (!SAEV_Copper_access)
				maybe_setup_fmodes(hpos);
		}

	}

	/*STATIC_INLINE void clear_fetchbuffer (uae_u32 *ptr, int nwords) {
		if (!thisline_changed) {
			for (int i = 0; i < nwords; i++) {
				if (ptr[i]) {
					thisline_changed = 1;
					break;
				}
			}
		}
		memset(ptr, 0, nwords * 4);
	}*/
	function clear_fetchbuffer(data, offs, nwords) {
		if (!thisline_changed) {
			for (var i = offs, j = offs + nwords; i < j; i++) {
				if (data[i]) {
					thisline_changed = 1;
					break;
				}
			}
		}
		//SAEF_memset(data,offs, 0, nwords);
		for (var i = offs, j = offs + nwords; i < j; i++) data[i] = 0;
	}
	function update_toscr_planes(fm) {
		// This must be called just before new bitplane block starts,
		// not when depth value changes. Depth can change early and can leave
		// 16+ pixel horizontal line of old data visible.
		if (toscr_nr_planes_agnus > thisline_decision.nr_planes) {
			if (out_offs) {
				for (var j = thisline_decision.nr_planes; j < toscr_nr_planes_agnus; j++) {
					//clear_fetchbuffer((uae_u32 *)(line_data[next_lineno] + 2 * MAX_WORDS_PER_LINE * j), out_offs);
					clear_fetchbuffer(line_data[next_lineno], MAX_WORDS_PER_LINE_FULL * j, out_offs);

					if (thisline_decision.plfleft >= 0) {
						todisplay[j] = 0;
						//#ifdef AGA
						if (fm) {
							//todisplay_aga[j] = 0;
							todisplay_aga_hi[j] = todisplay_aga_lo[j] = 0;
						}
						//#endif
					}
				}
			}
			thisline_decision.nr_planes = toscr_nr_planes_agnus;
		}
	}

	function maybe_first_bpl1dat(hpos) {
		if (thisline_decision.plfleft < 0)
			thisline_decision.plfleft = hpos;
	}

	function fetch_warn(nr, hpos) {
		//static int warned1 = 30, warned2 = 30;
		var add = fetchmode_bytes;
		if (hpos == maxhpos - 1) {
			//if (warned1 >= 0)
			{
				SAEF_warn("playfield.fetch_warn() BPL fetch conflicts with strobe refresh slot!");
				//warned1--;
			}
			add = refptr_val;
		} else {
			//if (warned2 >= 0)
			{
				//warned2--;
				SAEF_warn("playfield.fetch_warn() BPL fetch at hpos %d/%d", hpos, maxhpos);
			}
			add = refptr_val;
		}
		bitplane_line_crossing = hpos;
		/*#if 0
		line_cyclebased = vpos;
		corrupt_offset = (vpos ^ (SAEV_Events_timeframes << 12)) & 0xff00;
		for (var i = 0; i < bplcon0_planes_limit; i++) {
			uae_u16 v;
			v = bplpt[i] & 0xffff;
			v += corrupt_offset;
			bplpt[i] = (bplpt[i] & 0xffff0000) | v;
		}
		#endif*/
		return add;
	}

	function fetch(nr, fm, hpos) {
		if (nr < bplcon0_planes_limit) {
			var p;
			var add = fetchmode_bytes;

			if (hpos > maxhpos - HPOS_SHIFT && !(beamcon0 & 0x80))
				add = fetch_warn(nr, hpos);

			p = bplpt[nr];
			bplpt[nr] += add;
			bplptx[nr] += add;

			/*#if 0
			if (dbplpth_on2) reset_dbplh(hpos, nr);
			if (dbplptl_on2) reset_dbpll(hpos, nr);
			#endif*/

			if (nr == 0)
				bpl1dat_written = true;

			switch (fm) {
				case 0: {
					fetched[nr] = SAER_Memory_chipGet16_indirect(p);
					SAEV_Custom_last_value = fetched[nr];
					break;
				}
				//#ifdef AGA
				case 1: {
					//fetched_aga[nr] = SAER_Memory_chipGet32_indirect(p);
					fetched_aga_hi[nr] = 0;
					fetched_aga_lo[nr] = SAER_Memory_chipGet32_indirect(p);
					SAEV_Custom_last_value = fetched_aga_lo[nr];
					fetched[nr] = fetched_aga_lo[nr] & 0xffff;
					break;
				}
				case 2: {
					//fetched_aga[nr] = ((uae_u64)SAER_Memory_chipGet32_indirect(p)) << 32;
					//fetched_aga[nr] |= SAER_Memory_chipGet32_indirect(p + 4);
					fetched_aga_hi[nr] = SAER_Memory_chipGet32_indirect(p);
					fetched_aga_lo[nr] = SAER_Memory_chipGet32_indirect(p + 4);
					SAEV_Custom_last_value = fetched_aga_lo[nr];
					fetched[nr] = fetched_aga_lo[nr] & 0xffff;
					break;
				}
				//#endif
			}
			if (plf_state == plf_passed_stop2 && fetch_cycle >= (fetch_cycle & ~fetchunit_mask) + fetch_modulo_cycle)
				add_modulo(hpos, nr);
		}
	}

	function toscr_3_ecs(oddeven, step, nbits) {
		var i, shift = 16 - nbits;

		// if number of planes decrease (or go to zero), we still need to
		// shift all possible remaining pixels out of Denise"s shift register
		for (i = oddeven; i < thisline_decision.nr_planes; i += step)
			outword[i] <<= nbits;

		for (i = oddeven; i < toscr_nr_planes2; i += step) {
			outword[i] |= todisplay2[i] >>> shift;
			todisplay2[i] <<= nbits;
		}
	}
	//#ifdef AGA
	function toscr_3_aga(oddeven, step, nbits, fm) {
		var i, shift = fetchmode_size - nbits;
		var mask = 0xffff >> (16 - nbits);

		for (i = oddeven; i < thisline_decision.nr_planes; i += step)
			outword[i] <<= nbits;

		for (i = oddeven; i < toscr_nr_planes2; i += step) {
			//outword[i] |= (todisplay2_aga[i] >>> shift) & mask;
			if (shift < 32)
				outword[i] |= ((todisplay2_aga_hi[i] << (32 - shift)) | (todisplay2_aga_lo[i] >>> shift)) & mask; //ATT
			else
				outword[i] |= (todisplay2_aga_hi[i] >>> (shift - 32)) & mask;

			//todisplay2_aga[i] <<= nbits;
			//if (nbits < 32) {
				todisplay2_aga_hi[i] = (todisplay2_aga_hi[i] << nbits) | (todisplay2_aga_lo[i] >>> (32 - nbits)); //ATT
				todisplay2_aga_lo[i] <<= nbits;
			/*} else {
				todisplay2_aga_hi[i] = todisplay2_aga_lo[i] << (nbits - 32);
				todisplay2_aga_lo[i] = 0;
			}*/
		}
	}
	//#endif

	/*OPT inline, ok
	function toscr_2_0(nbits) { toscr_3_ecs (0, 1, nbits); }
	function toscr_2_0_oe(oddeven, step, nbits) { toscr_3_ecs (oddeven, step, nbits); }
	//#ifdef AGA
	function toscr_2_1(nbits) { toscr_3_aga (0, 1, nbits, 1); }
	function toscr_2_1_oe(oddeven, step, nbits) { toscr_3_aga (oddeven, step, nbits, 1); }
	function toscr_2_2(nbits) { toscr_3_aga (0, 1, nbits, 2); }
	function toscr_2_2_oe(oddeven, step, nbits) { toscr_3_aga (oddeven, step, nbits, 2); }
	//#endif
	function do_tosrc(oddeven, step, nbits, fm) {
		switch (fm) {
			case 0:
				if (step == 2)
					toscr_2_0_oe(oddeven, step, nbits);
				else
					toscr_2_0(nbits);
				break;
			//#ifdef AGA
			case 1:
				if (step == 2)
					toscr_2_1_oe(oddeven, step, nbits);
				else
					toscr_2_1(nbits);
				break;
			case 2:
				if (step == 2)
					toscr_2_2_oe(oddeven, step, nbits);
				else
					toscr_2_2(nbits);
				break;
			//#endif
		}
	}*/
	function do_tosrc(oddeven, step, nbits, fm) {
		if (step == 2) {
			if (fm == 0)
				toscr_3_ecs(oddeven, 2, nbits);
			else
				toscr_3_aga(oddeven, 2, nbits, fm);
		} else {
			if (fm == 0)
				toscr_3_ecs(0, 1, nbits);
			else
				toscr_3_aga(0, 1, nbits, fm);
		}
	}

	function do_delays_3_ecs(nbits) {
		var delaypos = delay_cycles & fetchmode_mask;
		for (var oddeven = 0; oddeven < 2; oddeven++) {
			var delay = toscr_delay[oddeven];
			/*#if 0
			for (var j = 0; j < nbits; j++) {
				var dp = (delay_cycles + j);
				if (dp >= (maxhpos * 2) << toscr_res)
					dp -= (maxhpos * 2) << toscr_res;
				dp &= fetchmode_mask;
				do_tosrc(oddeven, 2, 1, 0);

				if (todisplay_fetched[oddeven] && dp == delay) {
					for (var i = oddeven; i < toscr_nr_planes_shifter; i += 2) {
						todisplay2[i] = todisplay[i];
					}
					todisplay_fetched[oddeven] = false;
				}
			}
			#else*/
			if (delaypos > delay)
				delay += fetchmode_size;
			var diff = delay - delaypos;
			var nbits2 = nbits;
			if (nbits2 > diff) {
				do_tosrc(oddeven, 2, diff, 0);
				nbits2 -= diff;
				if (todisplay_fetched[oddeven]) {
					for (var i = oddeven; i < toscr_nr_planes_shifter; i += 2)
						todisplay2[i] = todisplay[i];
					todisplay_fetched[oddeven] = false;
				}
			}
			if (nbits2) do_tosrc(oddeven, 2, nbits2, 0);
			//#endif
		}
	}

	function do_delays_fast_3_ecs(nbits) {
		var delaypos = delay_cycles & fetchmode_mask;
		var delay = toscr_delay[0];
		if (delaypos > delay)
			delay += fetchmode_size;
		var diff = delay - delaypos;
		var nbits2 = nbits;
		if (nbits2 > diff) {
			do_tosrc(0, 1, diff, 0);
			nbits2 -= diff;
			if (todisplay_fetched[0]) {
				for (var i = 0; i < toscr_nr_planes_shifter; i++)
					todisplay2[i] = todisplay[i];
				todisplay_fetched[0] = false;
				todisplay_fetched[1] = false;
			}
		}
		if (nbits2) do_tosrc (0, 1, nbits2, 0);
	}

	function do_delays_3_aga (nbits, fm) {
		var delaypos = delay_cycles & fetchmode_mask;
		for (var oddeven = 0; oddeven < 2; oddeven++) {
			var delay = toscr_delay[oddeven];
			if (delaypos > delay)
				delay += fetchmode_size;
			var diff = delay - delaypos;
			var nbits2 = nbits;
			if (nbits2 > diff) {
				do_tosrc(oddeven, 2, diff, fm);
				nbits2 -= diff;
				if (todisplay_fetched[oddeven]) {
					for (var i = oddeven; i < toscr_nr_planes_shifter; i += 2) {
						//todisplay2_aga[i] = todisplay_aga[i];
						todisplay2_aga_hi[i] = todisplay_aga_hi[i];
						todisplay2_aga_lo[i] = todisplay_aga_lo[i];
					}
					todisplay_fetched[oddeven] = false;
				}
			}
			if (nbits2) do_tosrc (oddeven, 2, nbits2, fm);
		}
	}

	function do_delays_fast_3_aga (nbits, fm) {
		var delaypos = delay_cycles & fetchmode_mask;
		var delay = toscr_delay[0];
		if (delaypos > delay)
			delay += fetchmode_size;
		var diff = delay - delaypos;
		var nbits2 = nbits;
		if (nbits2 > diff) {
			do_tosrc(0, 1, diff, fm);
			nbits2 -= diff;
			if (todisplay_fetched[0]) {
				for (var i = 0; i < toscr_nr_planes_shifter; i++) {
					//todisplay2_aga[i] = todisplay_aga[i];
					todisplay2_aga_hi[i] = todisplay_aga_hi[i];
					todisplay2_aga_lo[i] = todisplay_aga_lo[i];
				}
				todisplay_fetched[0] = false;
				todisplay_fetched[1] = false;
			}
		}
		if (nbits2) do_tosrc(0, 1, nbits2, fm);
	}


	/*OPT inline, ok
	function do_delays_2_0(nbits) { do_delays_3_ecs(nbits); }
	//#ifdef AGA
	function do_delays_2_1(nbits) { do_delays_3_aga(nbits, 1); }
	function do_delays_2_2(nbits) { do_delays_3_aga(nbits, 2); }
	//#endif
	function do_delays_fast_2_0(nbits) { do_delays_fast_3_ecs(nbits); }
	//#ifdef AGA
	function do_delays_fast_2_1(nbits) { do_delays_fast_3_aga(nbits, 1); }
	function do_delays_fast_2_2(nbits) { do_delays_fast_3_aga(nbits, 2); }
	//#endif
	// slower version, odd and even delays are different or crosses maxhpos
	function do_delays(nbits, fm) {
		switch (fm) {
			case 0:
				do_delays_2_0(nbits);
				break;
			//#ifdef AGA
			case 1:
				do_delays_2_1(nbits);
				break;
			case 2:
				do_delays_2_2(nbits);
				break;
			//#endif
		}
	}*/
	function do_delays(nbits, fm) {
		if (fm == 0)
			do_delays_3_ecs(nbits);
		else
			do_delays_3_aga(nbits, fm);
	}
	// common optimized case: odd delay == even delay
	/*function do_delays_fast(nbits, fm) {
		switch (fm) {
			case 0:
				do_delays_fast_2_0(nbits);
				break;
			//#ifdef AGA
			case 1:
				do_delays_fast_2_1(nbits);
				break;
			case 2:
				do_delays_fast_2_2(nbits);
				break;
			//#endif
		}
	}
	function do_delays_fast(nbits, fm) {
		if (fm == 0)
			do_delays_fast_3_ecs(nbits);
		else
			do_delays_fast_3_aga(nbits, fm);
	}*/

	function toscr_right_edge(nbits, fm) {
		// Emulate hpos counter (delay_cycles) reseting at the end of scanline.
		// (Result is ugly shift in graphics in far right overscan)
		var diff = delay_lastcycle[lol] - delay_cycles;
		var nbits2 = nbits;
		if (nbits2 >= diff) {
			do_delays(diff, fm);
			nbits2 -= diff;
			delay_cycles = 0;
			if (hpos_is_zero_bplcon1_hack >= 0) {
				compute_toscr_delay(hpos_is_zero_bplcon1_hack);
				hpos_is_zero_bplcon1_hack = -1;
			}
			toscr_delay[0] -= 2;
			toscr_delay[0] &= fetchmode_mask;
			toscr_delay[1] -= 2;
			toscr_delay[1] &= fetchmode_mask;
		}
		if (nbits2) {
			do_delays(nbits2, fm);
			delay_cycles += nbits2;
		}
	}

	function toscr_1(nbits, fm) {
		if (delay_cycles + nbits >= delay_lastcycle[lol]) {
			toscr_right_edge(nbits, fm);
		} else if (toscr_delay[0] == toscr_delay[1]) {
			// Most common case.
			//do_delays_fast(nbits, fm); //ORG
			if (fm == 0) //OWN
				do_delays_fast_3_ecs(nbits);
			else
				do_delays_fast_3_aga(nbits, fm);

			delay_cycles += nbits;
		} else {
			do_delays(nbits, fm);
			delay_cycles += nbits;
		}

		out_nbits += nbits;
		if (out_nbits == 32) {
			/*uae_u8 *dataptr = line_data[next_lineno] + out_offs * 4;
			for (int i = 0; i < thisline_decision.nr_planes; i++) {
				uae_u32 *dataptr32 = (uae_u32 *)dataptr;
				if (*dataptr32 != outword[i]) {
					thisline_changed = 1;
					*dataptr32 = outword[i];
				}
				outword[i] = 0;
				dataptr += MAX_WORDS_PER_LINE * 2;
			}*/

			var data = line_data[next_lineno];
			var offs = out_offs;
			for (var i = 0; i < thisline_decision.nr_planes; i++) {
				if (data[offs] != outword[i]) {
					data[offs] = outword[i];
					thisline_changed = 1;
				}
				outword[i] = 0;
				offs += MAX_WORDS_PER_LINE_FULL;
			}

			out_offs++;
			out_nbits = 0;
		}
	}

	function toscr_fm0(nbits) { toscr_0(nbits, 0); }
	function toscr_fm1(nbits) { toscr_0(nbits, 1); }
	function toscr_fm2(nbits) { toscr_0(nbits, 2); }

	function toscr(nbits, fm) { //OPT recursive
		switch (fm) {
			case 0: toscr_fm0(nbits); break;
			//#ifdef AGA
			case 1: toscr_fm1(nbits); break;
			case 2: toscr_fm2(nbits); break;
			//#endif
		}
	}

	function toscr_0(nbits, fm) {
		if (nbits > 16) {
			toscr(16, fm);
			nbits -= 16;
		}
		var t = 32 - out_nbits;
		if (t < nbits) {
			toscr_1(t, fm);
			nbits -= t;
		}
		toscr_1(nbits, fm);
	}

	function flush_plane_data(fm) {
		var i = 0;

		if (out_nbits <= 16) {
			i += 16;
			toscr_1(16, fm);
		}
		if (out_nbits != 0) {
			i += 32 - out_nbits;
			toscr_1(32 - out_nbits, fm);
		}

		i += 32;
		toscr_1(16, fm);
		toscr_1(16, fm);

		if (fm == 2) {
			/* flush AGA full 64-bit shift register + possible data in todisplay */
			i += 32;
			toscr_1(16, fm);
			toscr_1(16, fm);
			i += 32;
			toscr_1(16, fm);
			toscr_1(16, fm);
		}
		return i >> (1 + toscr_res);
	}

	function flush_display(fm) {
		if (toscr_nbits > 0 && thisline_decision.plfleft >= 0)
			toscr(toscr_nbits, fm);
		toscr_nbits = 0;
	}

	/*-----------------------------------------------------------------------*/
	/* SECT fetch */

	function hack_shres_delay(hpos) {
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) && !toscr_delay_sh[0] && !toscr_delay_sh[1])
			return;
		var o0 = toscr_delay_sh[0];
		var o1 = toscr_delay_sh[1];
		var shdelay1 = (bplcon1 >> 8) & 3;
		var shdelay2 = (bplcon1 >> 12) & 3;
		toscr_delay_sh[0] = (shdelay1 & 3) >> toscr_res;
		toscr_delay_sh[1] = (shdelay2 & 3) >> toscr_res;
		if (hpos >= 0 && toscr_delay_sh[0] != o0 || toscr_delay_sh[1] != o1) {
			record_color_change(hpos, 0, COLOR_CHANGE_SHRES_DELAY | toscr_delay_sh[0]);
			current_colors.extra &= ~(1 << CE_SHRES_DELAY);
			current_colors.extra &= ~(1 << (CE_SHRES_DELAY + 1));
			current_colors.extra |= toscr_delay_sh[0] << CE_SHRES_DELAY;
			remembered_color_entry = -1;
		}
	}

	function update_denise_shifter_planes(hpos) {
		var np = GET_PLANES(bplcon0d);
		// if DMA has ended but there is still data waiting in todisplay,
		// it must be flushed out before number of planes change
		if (np < toscr_nr_planes_shifter && hpos > thisline_decision.plfright && thisline_decision.plfright && (todisplay_fetched[0] || todisplay_fetched[1])) {
			var diff = (hpos - thisline_decision.plfright) << (1 + toscr_res);
			while (diff >= 16) {
				toscr_1(16, fetchmode);
				diff -= 16;
			}
			if (diff)
				toscr_1(diff, fetchmode);
			thisline_decision.plfright += hpos - thisline_decision.plfright;
		}
		// FIXME: Samplers / Back In 90 vs Disposable Hero title screen in fast modes
		if (SAEV_config.cpu.model < SAEC_Config_CPU_Model_68020) {
			toscr_nr_planes_shifter = np;
			if (isocs7planes()) {
				if (toscr_nr_planes_shifter < 6)
					toscr_nr_planes_shifter = 6;
			}
		}
	}

	function update_denise(hpos) {
		var res = GET_RES_DENISE(bplcon0d);
		if (res != toscr_res)
			flush_display(fetchmode);
		toscr_res = GET_RES_DENISE(bplcon0d);
		toscr_res2p = 2 << toscr_res;
		delay_cycles = (hpos * 2) << toscr_res;
		if (bplcon0dd != bplcon0d) {
			record_color_change2(hpos, 0x100 + 0x1000, bplcon0d);
			bplcon0dd = bplcon0d;
		}
		toscr_nr_planes = GET_PLANES(bplcon0d);
		if (isocs7planes()) {
			if (toscr_nr_planes2 < 6)
				toscr_nr_planes2 = 6;
		} else {
			toscr_nr_planes2 = toscr_nr_planes;
		}
		toscr_nr_planes_shifter = toscr_nr_planes2;
		hack_shres_delay(hpos);
	}

	/*function fetch_start(hpos) {
		fetch_state = fetch_started;
	}*/

	function pfield_xlateptr(plpt, bytecount) {
		//if (!chipmem_check_indirect(plpt, bytecount)) {
		if (!SAER_Memory_chipCheck_indirect(plpt, bytecount)) {
			//static int count = 0; if (!count) count++, SAEF_warn("playfield.pfield_xlateptr() bad playfield pointer %08x", plpt);
			return null;
		}
		//return chipmem_xlate_indirect(plpt);
		return SAER_Memory_chipXLate_indirect(plpt);
	}

	/* Called when all planes have been fetched, i.e. when a new block
	of data is available to be displayed.  The data in fetched[] is
	moved into todisplay[].  */
	function beginning_of_plane_block(hpos, fm) {
		var i;

		if (fm == 0)
			for (i = 0; i < MAX_PLANES; i++) {
				todisplay[i] = fetched[i];
			}
		//#ifdef AGA
		else
			for (i = 0; i < MAX_PLANES; i++) {
				//todisplay_aga[i] = fetched_aga[i];
				todisplay_aga_hi[i] = fetched_aga_hi[i];
				todisplay_aga_lo[i] = fetched_aga_lo[i];
			}
		//#endif
		todisplay_fetched[0] = todisplay_fetched[1] = true;
		maybe_first_bpl1dat(hpos);
		update_denise(hpos);
		if (toscr_nr_planes_agnus > thisline_decision.nr_planes)
			update_toscr_planes(fm);
	}

	/* The usual inlining tricks - don't touch unless you know what you are doing. */
	//#if SPEEDUP
	function long_fetch_16(plane, nwords, weird_number_of_bits, dma) {
		//uae_u16 *real_pt = (uae_u16 *)pfield_xlateptr (bplpt[plane], nwords * 2);
		var real_pt = pfield_xlateptr(bplpt[plane], nwords * 2);
		//var real_pt2 = bplpt[plane] >>> 1;
		var delay = toscr_delay_adjusted[plane & 1];
		var tmp_nbits = out_nbits;
		var outval = outword[plane]; //u32
		var fetchval = fetched[plane]; //u32
		//uae_u32 *dataptr = (uae_u32 *)(line_data[next_lineno] + 2 * plane * MAX_WORDS_PER_LINE + 4 * out_offs);
		var data = line_data[next_lineno];
		var offs = MAX_WORDS_PER_LINE_FULL * plane + out_offs; //OWN

		if (dma) {
			bplpt[plane] += nwords * 2;
			bplptx[plane] += nwords * 2;
		}

		if (real_pt === null) //Don't do this, fall back on chipmem_wget instead.
			return;

		var shiftbuffer = todisplay2[plane] << delay; //u32, ATT

		while (nwords > 0) {
			var bits_left = 32 - tmp_nbits;

			shiftbuffer = (shiftbuffer | fetchval) >>> 0;

			var t = (shiftbuffer >>> delay) & 0xffff; //u32

			if (weird_number_of_bits && bits_left < 16) {
				outval = (outval << bits_left) & 0xffffffff;
				outval = (outval | (t >>> (16 - bits_left))) >>> 0;
				//thisline_changed |= *dataptr ^ outval; *dataptr++ = outval;
				thisline_changed |= (data[offs] ^ outval) >>> 0; data[offs++] = outval;
				outval = t;
				tmp_nbits = 16 - bits_left;
			} else {
				outval = (((outval << 16) & 0xffffffff) | t) >>> 0;
				tmp_nbits += 16;
				if (tmp_nbits == 32) {
					//thisline_changed |= *dataptr ^ outval; *dataptr++ = outval;
					thisline_changed |= (data[offs] ^ outval) >>> 0; data[offs++] = outval;
					tmp_nbits = 0;
				}
			}
			shiftbuffer = (shiftbuffer << 16) & 0xffffffff;
			nwords--;
			if (dma) {
				fetchval = (SAER_Memory_chipData[real_pt] << 8) | SAER_Memory_chipData[real_pt+1];
				real_pt += 2;
				//fetchval = do_get_mem_word(real_pt); real_pt++;
				//fetchval = SAER_Memory_chipGet16_indirect[real_pt]; real_pt += 2;
				//fetchval = SAER_Memory_chipData[real_pt2++]; //real_pt2++;
				/*#if 0
				if (plane == 0) fetchval ^= 0x55555555;
				#endif*/
			}
		}
		fetched[plane] = fetchval;
		todisplay2[plane] = shiftbuffer >>> delay; //ATT
		outword[plane] = outval;
	}

	//#ifdef AGA
	function long_fetch_32(plane, nwords, weird_number_of_bits, dma) {
		//uae_u32 *real_pt = (uae_u32 *)pfield_xlateptr (bplpt[plane], nwords * 2);
		var real_pt = pfield_xlateptr(bplpt[plane], nwords * 2);
		//var real_pt2 = bplpt[plane] >>> 1;
		var delay = toscr_delay_adjusted[plane & 1];
		var tmp_nbits = out_nbits;
		//var shiftbuffer; //u64
		var shiftbuffer_hi, shiftbuffer_lo;
		var outval = outword[plane]; //u32
		//var fetchval = fetched_aga[plane]; //u32
		var fetchval = fetched_aga_lo[plane]; //u32
		//uae_u32 *dataptr = (uae_u32 *)(line_data[next_lineno] + 2 * plane * MAX_WORDS_PER_LINE + 4 * out_offs);
		var data = line_data[next_lineno];
		var offs = MAX_WORDS_PER_LINE_FULL * plane + out_offs; //OWN
		var shift = 16 + delay; //int

		if (dma) {
			bplpt[plane] += nwords * 2;
			bplptx[plane] += nwords * 2;
		}

		if (real_pt === null) //Don't do this, fall back on chipmem_wget instead.
			return;

		//shiftbuffer = todisplay2_aga[plane] << delay;
		shiftbuffer_hi = todisplay2_aga_hi[plane];
		shiftbuffer_lo = todisplay2_aga_lo[plane];
		if (delay) {
			shiftbuffer_hi = (((shiftbuffer_hi << delay) & 0xffffffff) | (shiftbuffer_lo >>> (32 - delay))) >>> 0; //ATT
			shiftbuffer_lo = (shiftbuffer_lo << delay) & 0xffffffff;
		}

		while (nwords > 0) {
			//shiftbuffer |= fetchval;
			shiftbuffer_lo = (shiftbuffer_lo | fetchval) >>> 0;

			for (var i = 0; i < 2; i++) {
				var t;
				var bits_left = 32 - tmp_nbits;

				//t = (shiftbuffer >> shift) & 0xffff;
				if (shift < 32)
					t = ((shiftbuffer_hi << (32 - shift)) | (shiftbuffer_lo >>> shift)) & 0xffff;
				else
					t = (shiftbuffer_hi >>> (shift - 32)) & 0xffff;

				if (weird_number_of_bits && bits_left < 16) {
					outval = (outval << bits_left) & 0xffffffff;
					outval = (outval | (t >>> (16 - bits_left))) >>> 0;
					//thisline_changed |= *dataptr ^ outval; *dataptr++ = outval;
					thisline_changed |= (data[offs] ^ outval) >>> 0; data[offs++] = outval;
					outval = t;
					tmp_nbits = 16 - bits_left;
				} else {
					outval = (((outval << 16) & 0xffffffff) | t) >>> 0;
					tmp_nbits += 16;
					if (tmp_nbits == 32) {
						//thisline_changed |= *dataptr ^ outval; *dataptr++ = outval;
						thisline_changed |= (data[offs] ^ outval) >>> 0; data[offs++] = outval;
						tmp_nbits = 0;
					}
				}
				//shiftbuffer <<= 16;
				shiftbuffer_hi = (((shiftbuffer_hi << 16) & 0xffffffff) | (shiftbuffer_lo >>> 16)) >>> 0;
				shiftbuffer_lo = (shiftbuffer_lo << 16) & 0xffffffff;
			}
			nwords -= 2;
			if (dma) {
				fetchval = ((SAER_Memory_chipData[real_pt] << 24) | (SAER_Memory_chipData[real_pt+1] << 16) | (SAER_Memory_chipData[real_pt+2] << 8) | SAER_Memory_chipData[real_pt+3]) >>> 0;
				real_pt += 4;
				//fetchval = do_get_mem_long(real_pt); real_pt++;
				//fetchval = ((SAER_Memory_chipData[real_pt2] << 16) | SAER_Memory_chipData[real_pt2 + 1]) >>> 0; real_pt2 += 2;
				//#if 0
				//if (plane == 0) fetchval ^= 0x5555555555555555;
				//#endif
			}

		}
		//fetched_aga[plane] = fetchval;
		fetched_aga_lo[plane] = fetchval;
		//todisplay2_aga[plane] = (shiftbuffer >> delay) & 0xffffffff;
		if (delay) {
			todisplay2_aga_lo[plane] = (((shiftbuffer_hi << (32 - delay)) & 0xffffffff) | (shiftbuffer_lo >>> delay)); //ATT
			todisplay2_aga_hi[plane] = shiftbuffer_hi >>> delay;
		} else {
			todisplay2_aga_hi[plane] = shiftbuffer_hi;
			todisplay2_aga_lo[plane] = shiftbuffer_lo;
		}
		outword[plane] = outval;
	}

	/*#ifdef HAVE_UAE_U128
	//uae_u128 is available, custom shift functions not necessary
	#else*/
	/*function shift32plus(p, n) {
		var t = p[1]; //u64
		t = (t << n) | (p[0] >> (64 - n));
		p[1] = t;
	}
	function aga_shift(p, n) {
		if (n == 0) return;
		shift32plus(p, n);
		p[0] <<= n;
	}
	function shift32plus_n(p, n) {
		var t = p[0]; //u64
		t = (t >> n) | (p[1] << (64 - n));
		p[0] = t;
	}
	function aga_shift_n(p, n) {
		if (n == 0) return;
		shift32plus_n(p, n);
		p[1] >>= n;
	}*/
	//#endif

	function aga_shift(p, n) {
		if (n) {
			//p[1] = (p[1] << n) | (p[0] >> (64 - n));
			//p[0] <<= n;
			n &= 31;
			p[3] = (p[3] << n) | (p[2] >>> (32 - n));
			p[2] = (p[2] << n) | (p[1] >>> (32 - n));
			p[1] = (p[1] << n) | (p[0] >>> (32 - n));
			p[0] <<= n;
		}
	}
	function aga_shift_n(p, n) {
		if (n) {
			//p[0] = (p[0] >> n) | (p[1] << (64 - n));
			//p[1] >>= n;
			n &= 31;
			p[0] = (p[1] << (32 - n)) | (p[0] >>> n);
			p[1] = (p[2] << (32 - n)) | (p[1] >>> n);
			p[2] = (p[3] << (32 - n)) | (p[2] >>> n);
			p[3] >>>= n;
		}
	}

	function long_fetch_64(plane, nwords, weird_number_of_bits, dma) {
		//uae_u32 *real_pt = (uae_u32 *)pfield_xlateptr (bplpt[plane], nwords * 2);
		var real_pt = pfield_xlateptr(bplpt[plane], nwords * 2);
		//var real_pt2 = bplpt[plane] >>> 1;
		var delay = toscr_delay_adjusted[plane & 1];
		var tmp_nbits = out_nbits;
		/*#ifdef HAVE_UAE_U128
		uae_u128 shiftbuffer;
		#else
		uae_u64 shiftbuffer[2];
		#endif*/
		var shiftbuffer = new Uint32Array(4);
		var outval = outword[plane]; //u32
		//var fetchval = fetched_aga[plane]; //u64
		var fetchval_hi = fetched_aga_hi[plane];
		var fetchval_lo = fetched_aga_lo[plane];
		//uae_u32 *dataptr = (uae_u32 *)(line_data[next_lineno] + 2 * plane * MAX_WORDS_PER_LINE + 4 * out_offs);
		var data = line_data[next_lineno];
		var offs = MAX_WORDS_PER_LINE_FULL * plane + out_offs; //OWN
		//var shift = (64 - 16) + delay; //int
		var shift = 48 + delay; //int

		if (dma) {
			bplpt[plane] += nwords * 2;
			bplptx[plane] += nwords * 2;
		}

		if (real_pt === null) //Don't do this, fall back on chipmem_wget instead.
			return;

		/*#ifdef HAVE_UAE_U128
		shiftbuffer = todisplay2_aga[plane] << delay;
		#else
		shiftbuffer[1] = 0;
		shiftbuffer[0] = todisplay2_aga[plane];
		aga_shift(shiftbuffer, delay);
		#endif*/
		shiftbuffer[3] = 0;
		shiftbuffer[2] = 0;
		shiftbuffer[1] = todisplay2_aga_hi[plane];
		shiftbuffer[0] = todisplay2_aga_lo[plane];
		aga_shift(shiftbuffer, delay);

		while (nwords > 0) {
			/*#ifdef HAVE_UAE_U128
			shiftbuffer |= fetchval;
			#else
			shiftbuffer[0] |= fetchval;
			#endif*/
			shiftbuffer[1] |= fetchval_hi;
			shiftbuffer[0] |= fetchval_lo;

			for (var i = 0; i < 4; i++) {
				var t; //u32
				var bits_left = 32 - tmp_nbits;

				/*#ifdef HAVE_UAE_U128
				t = (shiftbuffer >> shift) & 0xffff;
				#else
				if (64 - shift > 0) {
					t = (shiftbuffer[1] << (64 - shift)) | (shiftbuffer[0] >> shift);
				} else {
					t = shiftbuffer[1] >> (shift - 64);
				}
				t &= 0xffff;
				#endif*/

				if (shift < 32)
					t = ((shiftbuffer[1] << (32 - shift)) | (shiftbuffer[0] >>> (shift -  0))) & 0xffff;
				else if (shift < 64)
					t = ((shiftbuffer[2] << (64 - shift)) | (shiftbuffer[1] >>> (shift - 32))) & 0xffff;
				else if (shift < 96)
					t = ((shiftbuffer[3] << (96 - shift)) | (shiftbuffer[2] >>> (shift - 64))) & 0xffff;
				else
					t = (shiftbuffer[3] >>> (shift - 96)) & 0xffff;

				//t = (Math.random() * 0xffff) >>> 0;

				if (weird_number_of_bits && bits_left < 16) {
					outval = (outval << bits_left) & 0xffffffff;
					outval = (outval | (t >>> (16 - bits_left))) >>> 0;
					//thisline_changed |= *dataptr ^ outval; *dataptr++ = outval;
					thisline_changed |= (data[offs] ^ outval) >>> 0; data[offs++] = outval;
					outval = t;
					tmp_nbits = 16 - bits_left;
				} else {
					outval = (((outval << 16) & 0xffffffff) | t) >>> 0;
					tmp_nbits += 16;
					if (tmp_nbits == 32) {
						//thisline_changed |= *dataptr ^ outval; *dataptr++ = outval;
						thisline_changed |= (data[offs] ^ outval) >>> 0; data[offs++] = outval;
						tmp_nbits = 0;
					}
				}
				/*#ifdef HAVE_UAE_U128
				shiftbuffer <<= 16;
				#else*/
				aga_shift(shiftbuffer, 16);
				//#endif
			}

			nwords -= 4;

			if (dma) {
				fetchval_hi = ((SAER_Memory_chipData[real_pt  ] << 24) | (SAER_Memory_chipData[real_pt+1] << 16) | (SAER_Memory_chipData[real_pt+2] << 8) | SAER_Memory_chipData[real_pt+3]) >>> 0;
				fetchval_lo = ((SAER_Memory_chipData[real_pt+4] << 24) | (SAER_Memory_chipData[real_pt+5] << 16) | (SAER_Memory_chipData[real_pt+6] << 8) | SAER_Memory_chipData[real_pt+7]) >>> 0;
				real_pt += 8;
				//fetchval = ((uae_u64)do_get_mem_long (real_pt)) << 32;
				//fetchval |= do_get_mem_long (real_pt + 1);
				//real_pt += 2;
				//fetchval_hi = SAER_Memory_chipGet32_indirect(real_pt);
				//fetchval_lo = SAER_Memory_chipGet32_indirect(real_pt + 4);
				//real_pt += 8;
				//fetchval_hi = ((SAER_Memory_chipData[real_pt2    ] << 16) | SAER_Memory_chipData[real_pt2 + 1]) >>> 0;
				//fetchval_lo = ((SAER_Memory_chipData[real_pt2 + 2] << 16) | SAER_Memory_chipData[real_pt2 + 3]) >>> 0;
				//real_pt2 += 4;

				//#if 0
				/*if (plane == 0) {
					//fetchval ^= 0x5555555555555555;
					fetchval_hi = (fetchval_hi ^ 0x55555555) >>> 0;
					fetchval_lo = (fetchval_lo ^ 0x55555555) >>> 0;
				}*/
				//#endif
			}
		}
		//fetched_aga[plane] = fetchval;
		fetched_aga_hi[plane] = fetchval_hi;
		fetched_aga_lo[plane] = fetchval_lo;

		/*#ifdef HAVE_UAE_U128
		todisplay2_aga[plane] = shiftbuffer >> delay;
		#else*/
		aga_shift_n(shiftbuffer, delay);
		//todisplay2_aga[plane] = shiftbuffer[0];
		todisplay2_aga_hi[plane] = shiftbuffer[1];
		todisplay2_aga_lo[plane] = shiftbuffer[0];
		//#endif
		outword[plane] = outval;
	}
	//#endif //AGA*/

	/*OPT inline, ok
	function long_fetch_16_0(hpos, nwords, dma) { long_fetch_16(hpos, nwords, 0, dma); }
	function long_fetch_16_1(hpos, nwords, dma) { long_fetch_16(hpos, nwords, 1, dma); }
	//#ifdef AGA
	function long_fetch_32_0(hpos, nwords, dma) { long_fetch_32(hpos, nwords, 0, dma); }
	function long_fetch_32_1(hpos, nwords, dma) { long_fetch_32(hpos, nwords, 1, dma); }
	function long_fetch_64_0(hpos, nwords, dma) { long_fetch_64(hpos, nwords, 0, dma); }
	function long_fetch_64_1(hpos, nwords, dma) { long_fetch_64(hpos, nwords, 1, dma); }
	//#endif
	function do_long_fetch(hpos, nwords, dma, fm) {
		var i;

		flush_display (fm);
		beginning_of_plane_block(hpos, fm);

		switch (fm) {
			case 0:
				if (out_nbits & 15) {
					for (i = 0; i < toscr_nr_planes; i++)
						long_fetch_16_1(i, nwords, dma);
				} else {
					for (i = 0; i < toscr_nr_planes; i++)
						long_fetch_16_0(i, nwords, dma);
				}
				break;
			//#ifdef AGA
			case 1:
				if (out_nbits & 15) {
					for (i = 0; i < toscr_nr_planes; i++)
						long_fetch_32_1(i, nwords, dma);
				} else {
					for (i = 0; i < toscr_nr_planes; i++)
						long_fetch_32_0(i, nwords, dma);
				}
				break;
			case 2:
				if (out_nbits & 15) {
					for (i = 0; i < toscr_nr_planes; i++)
						long_fetch_64_1(i, nwords, dma);
				} else {
					for (i = 0; i < toscr_nr_planes; i++)
						long_fetch_64_0(i, nwords, dma);
				}
				break;
			//#endif
		}

		out_nbits += nwords * 16;
		out_offs += out_nbits >> 5;
		out_nbits &= 31;
		delay_cycles += nwords * 16;

		if (dma && toscr_nr_planes > 0)
			fetch_state = fetch_was_plane0;
	}*/
	function do_long_fetch(hpos, nwords, dma, fm) {
		var i;

		flush_display (fm);
		beginning_of_plane_block(hpos, fm);

		switch (fm) {
			case 0:
				if (out_nbits & 15) {
					for (i = 0; i < toscr_nr_planes; i++)
						long_fetch_16(i, nwords, 1, dma);
				} else {
					for (i = 0; i < toscr_nr_planes; i++)
						long_fetch_16(i, nwords, 0, dma);
				}
				break;
			//#ifdef AGA
			case 1:
				if (out_nbits & 15) {
					for (i = 0; i < toscr_nr_planes; i++)
						long_fetch_32(i, nwords, 1, dma);
				} else {
					for (i = 0; i < toscr_nr_planes; i++)
						long_fetch_32(i, nwords, 0, dma);
				}
				break;
			case 2:
				if (out_nbits & 15) {
					for (i = 0; i < toscr_nr_planes; i++)
						long_fetch_64(i, nwords, 1, dma);
				} else {
					for (i = 0; i < toscr_nr_planes; i++)
						long_fetch_64(i, nwords, 0, dma);
				}
				break;
			//#endif
		}

		out_nbits += nwords * 16;
		out_offs += out_nbits >> 5;
		out_nbits &= 31;
		delay_cycles += nwords * 16;

		if (dma && toscr_nr_planes > 0)
			fetch_state = fetch_was_plane0;
	}
	//#endif /* SPEEDUP */

	function finish_last_fetch(pos, fm, reallylast) {
		if (thisline_decision.plfleft < 0)
			return;
		if (plfr_state >= plfr_end)
			return;
		plfr_state = plfr_end;

		flush_display(fm);
		// This may not be the last fetch, store current endpos for future use.
		// There is at least one demo that has two DDFSTRT-DDFSTOP horizontal sections
		// Subtle Shades / Nuance.
		thisline_decision.plfright = pos;

		if (!reallylast) {
			if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) {
				ddfstate = DIW_WAITING_START;
				fetch_state = fetch_not_started;
			}
		}
	}
	/* check special case where last fetch wraps to next line
	 * this makes totally corrupted and flickering display on
	 * real hardware due to refresh cycle conflicts
	 */
	function maybe_finish_last_fetch(pos, fm) {
		//static int warned = 20;
		var done = false;

		if (plf_state != plf_passed_stop2 || (fetch_state != fetch_started && fetch_state != fetch_started_first) || aga_plf_passed_stop2 || !SAEF_Custom_dmaen(SAEC_Custom_DMAF_BPLEN)) {
			finish_last_fetch(pos, fm, true);
			return;
		}
		do {
			var cycle_start = fetch_cycle & fetchstart_mask;
			switch (fm_maxplane) {
				case 8:
					switch (cycle_start) {
						case 0: fetch(7, fm, pos); break;
						case 1: fetch(3, fm, pos); break;
						case 2: fetch(5, fm, pos); break;
						case 3: fetch(1, fm, pos); break;
						case 4: fetch(6, fm, pos); break;
						case 5: fetch(2, fm, pos); break;
						case 6: fetch(4, fm, pos); break;
						case 7: fetch(0, fm, pos); break;
						default: {
							//goto end;
							finish_last_fetch(pos, fm, true); return;
						}
					}
					break;
				case 4:
					switch (cycle_start) {
						case 0: fetch(3, fm, pos); break;
						case 1: fetch(1, fm, pos); break;
						case 2: fetch(2, fm, pos); break;
						case 3: fetch(0, fm, pos); break;
						default: {
							//goto end;
							finish_last_fetch(pos, fm, true); return;
						}
					}
					break;
				case 2:
					switch (cycle_start) {
						case 0: fetch(1, fm, pos); break;
						case 1: fetch(0, fm, pos); break;
						default: {
							//goto end;
							finish_last_fetch(pos, fm, true); return;
						}
					}
					break;
			}
			fetch_cycle++;
			toscr_nbits += toscr_res2p;

			if (toscr_nbits > 16)
				toscr_nbits = 0;
			if (toscr_nbits == 16)
				flush_display(fm);
			done = true;
			bitplane_line_crossing = pos;
		} while ((fetch_cycle & fetchunit_mask) != 0);

		if (done && warned_maybe_finish_last_fetch > 0) {
			warned_maybe_finish_last_fetch--;
			SAEF_warn("playfield.maybe_finish_last_fetch() bitplane DMA crossing scanlines!");
		}
		//end:
		finish_last_fetch(pos, fm, true);
	}

	/* make sure fetch that goes beyond maxhpos is finished */
	function finish_final_fetch() {
		if (thisline_decision.plfleft < 0)
			return;

		if (plfr_state < plfr_end)
			finish_last_fetch(maxhpos, fetchmode, true);
		plfr_state = plfr_finished;

		// workaround for too long fetches that don't pass plf_passed_stop2 before end of scanline
		if (aga_plf_passed_stop2 && plf_state >= plf_passed_stop)
			plf_state = plf_end;

		// This is really the end of scanline, we can finally flush all remaining data.
		thisline_decision.plfright += flush_plane_data(fetchmode);
		thisline_decision.plflinelen = out_offs;

		finish_playfield_line();
	}

	//function one_fetch_cycle_0(pos, dma, fm) { //ORG
	function one_fetch_cycle(pos, dma, fm) {
		var bplactive = true;
		var diw = diwstate == DIW_WAITING_STOP;
		if (plf_state == plf_wait && dma && diw) {
			// same timings as when switching off, see below
			bpl_dma_off_when_active = 0;
			bplactive = false;
			if (bitplane_off_delay >= 0)
				bitplane_off_delay = !dma ? -4 : -5;
			if (bitplane_off_delay < 0) {
				bitplane_off_delay++;
				if (bitplane_off_delay == 0) {
					if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) {
						plf_state = plf_passed_stop;
					} else {
						plf_state = plf_active;
					}
				}
			}
		} else if (!dma || !diw) {
			bplactive = false;
			// dma off: turn off bitplane output after 4 cycles
			// (yes, switching DMA off won"t disable it immediately)
			// diw off: turn off bitplane output after 5 cycles
			// (Starflight / Phenomena jumping scroller in ECS)
			// This is not correctly emulated, there probably is
			// 4+ stage shift register that causes these delays.
			if (plf_state == plf_active || plf_state == plf_passed_stop || plf_state == plf_passed_stop_act) {
				bpl_dma_off_when_active = 1;
				if (bitplane_off_delay <= 0)
					bitplane_off_delay = !dma ? 4 : 5;
			}
			if (bitplane_off_delay > 0) {
				bplactive = true;
				bitplane_off_delay--;
				if (bitplane_off_delay == 0) {
					bplactive = false;
					plf_state = plf_wait;
				}
			}
		}

		if ((dma && diw) || (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS)) {
			if (plf_state != plf_wait) {
				if (pos == plfstop && ddfstop_written_hpos != pos) {
					if (plf_state < plf_passed_stop) {
						plf_state = plf_passed_stop;
					}
					plf_end_hpos = pos + DDF_OFFSET;
				} else if (pos == plf_end_hpos) {
					ddfstop_matched = true;
					if (plf_state < plf_passed_stop_act) {
						plf_state = plf_passed_stop_act;
					}
				}
			}
		}

		if ((fetch_cycle & fetchunit_mask) == 0) {
			if (plf_state == plf_passed_stop2) {
				finish_last_fetch(pos, fm, false);
				return 1;
			}
			if (plf_state == plf_passed_stop_act) {
				plf_state = plf_passed_stop2;
			}
		}

		// must be after above test, otherwise same fetch
		// block may pass both stop_act and stop2 tests.
		if (pos == HARD_DDF_STOP()) {
			if (plf_state < plf_wait) {
				plf_state = plf_passed_stop_act;
			}
		}

		maybe_check(pos);

		if (bplactive) {
			/* fetchstart_mask can be larger than fm_maxplane if FMODE > 0.  This means
			that the remaining cycles are idle; we"ll fall through the whole switch
			without doing anything.  */
			var cycle_start = fetch_cycle & fetchstart_mask;
			switch (fm_maxplane) {
				case 8:
					switch (cycle_start) {
						case 0: fetch(7, fm, pos); break;
						case 1: fetch(3, fm, pos); break;
						case 2: fetch(5, fm, pos); break;
						case 3: fetch(1, fm, pos); break;
						case 4: fetch(6, fm, pos); break;
						case 5: fetch(2, fm, pos); break;
						case 6: fetch(4, fm, pos); break;
						case 7: fetch(0, fm, pos); break;
						//#ifdef AGA
						default: {
							// if AGA: consider plf_passed_stop2 already
							// active when last plane has been written,
							// even if there is still idle cycles left
							if (plf_state == plf_passed_stop_act)
								aga_plf_passed_stop2 = true;
							//break;
						}
						//#endif
					}
					break;
				case 4:
					switch (cycle_start) {
						case 0: fetch(3, fm, pos); break;
						case 1: fetch(1, fm, pos); break;
						case 2: fetch(2, fm, pos); break;
						case 3: fetch(0, fm, pos); break;
						//#ifdef AGA
						default: {
							if (plf_state == plf_passed_stop_act)
								aga_plf_passed_stop2 = true;
							//break;
						}
						//#endif
					}
					break;
				case 2:
					switch (cycle_start) {
						case 0: fetch(1, fm, pos); break;
						case 1: fetch(0, fm, pos); break;
						//#ifdef AGA
						default: {
							if (plf_state == plf_passed_stop_act)
								aga_plf_passed_stop2 = true;
							//break;
						}
						//#endif
					}
					break;
			}
		}

		if (bpl1dat_written) {
			// do this here because if program plays with BPLCON0 during scanline
			// it is possible that one DMA BPL1DAT write is completely missed
			// and we must not draw anything at all in next dma block if this happens
			// (Disposable Hero titlescreen)
			fetch_state = fetch_was_plane0;
			bpl1dat_written = false;
		}

		fetch_cycle++;
		toscr_nbits += toscr_res2p;

		if (bplcon1_written) {
			flush_display(fm);
			compute_toscr_delay(bplcon1);
			bplcon1_written = false;
		}

		if (toscr_nbits > 16) {
			SAEF_error("one_fetch_cycle() toscr_nbits > 16 (%d)", toscr_nbits);
			toscr_nbits = 0;
		}
		if (toscr_nbits == 16)
			flush_display(fm);

		return 0;
	}
	/*OPT inline ok
	function one_fetch_cycle_fm0( pos, dma) { return one_fetch_cycle_0(pos, dma, 0); }
	function one_fetch_cycle_fm1( pos, dma) { return one_fetch_cycle_0(pos, dma, 1); }
	function one_fetch_cycle_fm2( pos, dma) { return one_fetch_cycle_0(pos, dma, 2); }
	function one_fetch_cycle(pos, dma, fm) {
		switch (fm) {
			case 0: return one_fetch_cycle_fm0(pos, dma);
			//#ifdef AGA
			case 1: return one_fetch_cycle_fm1(pos, dma);
			case 2: return one_fetch_cycle_fm2(pos, dma);
			//#endif
			default:
				SAEF_error("one_fetch_cycle() fm corrupt (%d)", fm);
				return 0;
		}
	}
	function one_fetch_cycle(pos, dma, fm) {
		return one_fetch_cycle_0(pos, dma, fm);
	}*/

	function update_fetch_x(until, fm) {
		if (nodraw())
			return;

		var pos = last_fetch_hpos;
		update_toscr_planes(fm);

		// not optimized, update_fetch_x() is extremely rarely used.
		for (; pos < until; pos++) {
			toscr_nbits += toscr_res2p;
			if (toscr_nbits > 16) {
				SAEF_error("update_fetch_x() toscr_nbits > 16 (%d)", toscr_nbits);
				toscr_nbits = 0;
			}
			if (toscr_nbits == 16)
				flush_display(fm);
		}
		if (until >= maxhpos) {
			maybe_finish_last_fetch(pos, fm);
			return;
		}
		flush_display(fm);
	}
	function update_fetch(until, fm) {
		var dma = SAEF_Custom_dmaen(SAEC_Custom_DMAF_BPLEN);

		if (nodraw() || plf_state >= plf_end)
			return;

		var pos = last_fetch_hpos;
		cycle_diagram_shift = last_fetch_hpos - fetch_cycle;

		/* First, a loop that prepares us for the speedup code.  We want to enter
		the SPEEDUP case with fetch_state == fetch_was_plane0 or it is the very
		first fetch cycle (which equals to same state as fetch_was_plane0)
		 and then unroll whole blocks, so that we end on the same fetch_state again.  */
		for (; ; pos++) {
			if (pos == until) {
				if (until >= maxhpos) {
					maybe_finish_last_fetch(pos, fm);
					return;
				}
				return;
			}

			if (fetch_state == fetch_was_plane0)
				break;
			/*#if 0
			if (fetch_state == fetch_started_first) {
				#if SPEEDUP
				if (until >= maxhpos) {
					fetch_state = fetch_was_plane0;
					break;
				}
				#endif
				fetch_state = fetch_started;
			}
			#endif*/
			fetch_state = fetch_started; //fetch_start(pos); OWN
			if (one_fetch_cycle(pos, dma, fm))
				return;
		}
		//Unrolled version of the for loop below.
		if (SPEEDUP &&
			plf_state == plf_active && !line_cyclebased && dma
			&& (fetch_cycle & fetchstart_mask) == (fm_maxplane & fetchstart_mask)
			&& !badmode
			&& toscr_nr_planes == toscr_nr_planes_agnus)
		{
			var ddfstop_to_test_ddf = HARD_DDF_STOP();
			if (plfstop >= last_fetch_hpos - DDF_OFFSET && plfstop < ddfstop_to_test_ddf)
				ddfstop_to_test_ddf = plfstop;
			var ddfstop_to_test = ddfstop_to_test_ddf + DDF_OFFSET;
			var offs = (pos - fetch_cycle) & fetchunit_mask;
			var ddf2 = ((ddfstop_to_test - offs + fetchunit - 1) & ~fetchunit_mask) + offs;
			var ddf3 = ddf2 + fetchunit;
			var stop = until < ddf2 ? until : until < ddf3 ? ddf2 : ddf3;

			var count = stop - pos;
			if (count >= fetchstart) {
				count &= ~fetchstart_mask;
				var stoppos = pos + count;

				if (thisline_decision.plfleft < 0)
					compute_toscr_delay(bplcon1);

				do_long_fetch (pos, count >> (3 - toscr_res), dma, fm);

				// This must come _after_ do_long_fetch so as not to confuse flush_display
				// into thinking the first fetch has produced any output worth emitting to
				// the screen.  But the calculation of delay_offset must happen _before_.
				maybe_first_bpl1dat (pos);

				if (pos <= plfstop && stoppos > plfstop) {
					plf_state = plf_passed_stop;
					plf_end_hpos = plfstop + DDF_OFFSET;
				}
				if (pos <= plfstop + DDF_OFFSET && stoppos > plfstop + DDF_OFFSET) {
					plf_state = plf_passed_stop_act;
					plf_end_hpos = 256 + DDF_OFFSET;
					ddfstop_matched = true;
				}
				if (pos <= HARD_DDF_STOP() && stoppos > HARD_DDF_STOP()) {
					if (plf_state < plf_wait)
						plf_state = plf_passed_stop_act;
				}
				if (pos <= ddfstop_to_test && stoppos > ddf2) {
					plf_state = plf_passed_stop2;
				}
				if (pos <= ddf2 && stoppos >= ddf2 + fm_maxplane) {
					add_modulos ();
				}
				pos += count;
				fetch_cycle += count;
			}
		}
		for (; pos < until; pos++) {
			if (fetch_state == fetch_was_plane0) {
				flush_display(fm);
				beginning_of_plane_block(pos, fm);
			}
			fetch_state = fetch_started; //fetch_start(pos); OWN

			if (one_fetch_cycle(pos, dma, fm))
				return;
		}
		if (until >= maxhpos) {
			maybe_finish_last_fetch(pos, fm);
			return;
		}
		flush_display(fm);
	}

	/*OPT inline, ok
	function update_fetch_0(hpos) { update_fetch(hpos, 0); }
	function update_fetch_1(hpos) { update_fetch(hpos, 1); }
	function update_fetch_2(hpos) { update_fetch(hpos, 2); }*/
	this.decide_fetch = function(hpos) {
		if (hpos > last_fetch_hpos) {
			if (fetch_state != fetch_not_started) {
				/*ORG
				switch (fetchmode) {
					case 0: update_fetch_0(hpos); break;
					//#ifdef AGA
					case 1: update_fetch_1(hpos); break;
					case 2: update_fetch_2(hpos); break;
					//#endif
					default: SAEF_error("decide_fetch() corrupt fetchmode (%d)", fetchmode);
				}*/
				update_fetch(hpos, fetchmode);
			} else if (bpl1dat_written_at_least_once) {
				// "PIO" mode display
				update_fetch_x(hpos, fetchmode);
				bpl1dat_written = false;
			}
			maybe_check(hpos);
			last_fetch_hpos = hpos;
		}
	}
	this.decide_fetch_safe = function(hpos) {
		if (!SAEV_Blitter_dangerous) {
			this.decide_fetch(hpos);
			SAER.blitter.decide_blitter(hpos);
		} else {
			while (hpos > last_fetch_hpos) {
				this.decide_fetch(last_fetch_hpos + 1);
				SAER.blitter.decide_blitter(last_fetch_hpos + 1);
			}
		}
	}

	function reset_bpl_vars() {
		out_nbits = 0;
		out_offs = 0;
		toscr_nbits = 0;
		thisline_decision.bplres = bplcon0_res;
	}

	function start_bpl_dma(hstart) {
		if (first_bpl_vpos < 0)
			first_bpl_vpos = vpos;

		if (doflickerfix() && interlace_seen > 0 && !scandoubled_line) {
			for (var i = 0; i < 8; i++) {
				prevbpl[lof_current][vpos][i] = bplptx[i];
				if (!lof_current && (bplcon0 & 4))
					bplpt[i] = prevbpl[1 - lof_current][vpos][i];
				if (!(bplcon0 & 4) || interlace_seen < 0)
					prevbpl[1 - lof_current][vpos][i] = prevbpl[lof_current][vpos][i] = 0;
			}
		}

		/*#if 0
		fetch_state = (fm_maxplane == fetchstart) ? fetch_started_first : fetch_started;
		#else*/
		fetch_state = fetch_started;
		//#endif
		plfr_state = plfr_active;
		ddfstate = DIW_WAITING_STOP;
		bpl_hstart = hstart;

		if (!bpldmawasactive) {
			if (last_fetch_hpos < 0)
				last_fetch_hpos = 0;
			plfstrt_sprite = hstart;
			// OCS Agnus needs at least 1 empty cycle between
			// sprite fetch and bitplane cycle sequence start.
			if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS))
				plfstrt_sprite--;
			fetch_cycle = 0;
			update_denise(last_fetch_hpos);
			if (bpl1dat_written_at_least_once && hstart > last_fetch_hpos) {
				update_fetch_x(hstart, fetchmode);
				bpl1dat_written_at_least_once = false;
			} else {
				reset_bpl_vars();
			}
			cycle_diagram_shift = hstart;
			bpldmawasactive = true;
		} else {
			flush_display(fetchmode);
			// Calculate difference between last end to new start
			var diff = (hstart - thisline_decision.plfright) << (1 + toscr_res);
			// Render all missing pixels, use toscr because previous data may still be in buffers.
			while (diff >= 16) {
				toscr_1(16, fetchmode);
				diff -= 16;
			}
			if (diff) toscr_1(diff, fetchmode);

			cycle_diagram_shift = hstart;
			update_denise(last_fetch_hpos);
			update_fetch_x(hstart, fetchmode);
		}

		last_fetch_hpos = hstart;
		estimate_last_fetch_cycle(hstart);
	}

	function cant_this_last_line() {
		// Last line..
		// ..works normally if A1000 Agnus
		if (SAEV_config.chipset.agnusDIP)
			return false;
		// ..inhibits bitplane and sprite DMA if later Agnus revision.
		return vpos + 1 >= maxvpos + lof_store;
	}

	/* This function is responsible for turning on datafetch if necessary. */
	this.decide_line = function(hpos) {
		var ecs = (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) != 0;

		/* Take care of the vertical DIW.  */
		if (vpos == plffirstline) {
			// A1000 Agnus won"t start bitplane DMA if vertical diw is zero.
			if (vpos > 0 || (vpos == 0 && !SAEV_config.chipset.agnusDIP)) {
				diwstate = DIW_WAITING_STOP;
				line_cyclebased = 2; //SET_LINE_CYCLEBASED();
			}
		}
		// last line of field can never have bitplane dma active if not A1000 Agnus.
		if (vpos == plflastline || cant_this_last_line() || (vpos == 0 && SAEV_config.chipset.agnusDIP)) {
			diwstate = DIW_WAITING_START;
			line_cyclebased = 2; //SET_LINE_CYCLEBASED();
		}

		if (hpos <= last_decide_line_hpos)
			return;

		var dma = SAEF_Custom_dmaen(SAEC_Custom_DMAF_BPLEN) != 0;
		var diw = diwstate == DIW_WAITING_STOP;

		if (ecs) {
			//if (1) {
				if (last_decide_line_hpos < plfstrt && hpos >= plfstrt) {
					ddfstop_matched = false;
				}
			//}
		} else {
			//if (1) {
				if (last_decide_line_hpos < plfstrt && hpos >= plfstrt) {
					ddfstop_matched = false;
					// plfstrt==0 works strangely (Nakudemo / Vision-X)
					if (plfstrt > -DDF_OFFSET)
						ocs_agnus_ddf_enable_toggle = false;
				}
			//}
		}

		if (fetch_state == fetch_not_started) {
			var strtpassed = false;
			var nextstate = plf_end;
			var hstart;

			hstart = last_decide_line_hpos;
			if (hstart < bitplane_maybe_start_hpos)
				hstart = bitplane_maybe_start_hpos;
			if (hstart < HARD_DDF_START_REAL + DDF_OFFSET)
				hstart = HARD_DDF_START_REAL + DDF_OFFSET;
			// DMA enabled mid-line: DDF_OFFSET delay first
			if (bitplane_maybe_start_hpos + DDF_OFFSET > hstart)
				hstart = bitplane_maybe_start_hpos + DDF_OFFSET;
			if (hstart & 1)
				hstart++;

			if (ecs) {
				// ECS DDFSTRT/STOP matching does not require DMA or DIW.
				//if (1) {
					if (last_decide_line_hpos < plfstrt && hpos >= plfstrt) {
						// active == already started because ddfstop was not detected in last line
						if (plf_state != plf_active) {
							plf_state = plf_passed_start;
							strtpassed = true;
							plf_start_hpos = plfstrt + DDF_OFFSET;
						}
					}
				//}
				//if (1) {
					if ((strtpassed && hpos >= plf_start_hpos) || (last_decide_line_hpos < plf_start_hpos && hpos >= plf_start_hpos)) {
						if (plf_state == plf_passed_start) {
							plf_state = plf_active;
							hstart = plf_start_hpos;
						}
					}
				//}
			} else {
				//if (1) {
					var start = HARD_DDF_START_REAL;
					if (last_decide_line_hpos < start && hpos >= start) {
						if (!ocs_agnus_ddf_enable_toggle)
							plf_state = plf_passed_enable;
						ocs_agnus_ddf_enable_toggle = true;
					}
				//}
				// OCS DDFSTRT/STOP matching requires DMA and DIW enabled.
				if (dma && diw) {
					if (last_decide_line_hpos < plfstrt && hpos >= plfstrt) {
						if (plf_state == plf_passed_enable) {
							plf_state = plf_passed_start;
							strtpassed = true;
							plf_start_hpos = plfstrt + DDF_OFFSET;
						}
						ocs_agnus_ddf_enable_toggle = false;
					}
				}
				if (dma && diw) {
					if ((strtpassed && hpos >= plf_start_hpos) || (last_decide_line_hpos < plf_start_hpos && hpos >= plf_start_hpos)) {
						if (plf_state == plf_passed_start) {
							plf_state = plf_active;
							hstart = plf_start_hpos;
						}
					}
				}
			}

			if (diw && dma) {
				var test = false;
				if (ecs) {
					test = (plf_state == plf_active && (hpos >= HARD_DDF_START_REAL + DDF_OFFSET || HARD_DDF_LIMITS_DISABLED()));
					if (bpl_dma_off_when_active) {
						if (plfstop < hstart) {
							test = false;
						}
					}
				} else {
					test = (plf_state == plf_active);
					// if DMA enabled mid-scanline but ddfstrt not matched (dma was off): start when ddfstop is matched
					// (Crash Landing crack intro / Scoopex)
					if (!test && last_decide_line_hpos < plfstop && hstart > plfstop) {
						if (hstart == ((bitplane_maybe_start_hpos + DDF_OFFSET + 1) & ~1)) {
							hstart = plfstop + DDF_OFFSET;
							test = true;
							nextstate = plf_passed_stop;
						}
					}
				}
				if (test) {
					start_bpl_dma(hstart);
					// if ECS: pre-set plf_end_hpos if we have already passed virtual ddfstop
					if (ecs) {
						if (last_decide_line_hpos < hstart && hstart >= plfstop && hstart - plfstop <= DDF_OFFSET) {
							plf_end_hpos = plfstop + DDF_OFFSET;
							nextstate = plf_passed_stop;
						}
						if (last_decide_line_hpos < HARD_DDF_STOP() && hstart > HARD_DDF_STOP()) {
							plf_end_hpos = HARD_DDF_STOP() + DDF_OFFSET;
							nextstate = plf_passed_stop;
						}
						if (bpl_dma_off_when_active) {
							nextstate = plf_passed_stop_act;
							bpl_dma_off_when_active = 0;
						}
					}
					if (nextstate != plf_end) {
						plf_state = nextstate;
						estimate_last_fetch_cycle(hstart);
					}
					last_decide_line_hpos = hpos;
					do_sprites(hpos);
					return;
				}

			}

			if (ecs) {
				//if (1) {
					// ddfstrt == ddfstop: ddfstrt wins.
					if (plfstrt != plfstop && last_decide_line_hpos < plfstop && hpos >= plfstop && plfstop <= maxhpos - DDF_OFFSET) {
						ddfstop_matched = true;
						if (plf_state != plf_wait && plf_state < plf_passed_stop) {
							plf_state = plf_passed_stop;
							plf_end_hpos = plfstop + DDF_OFFSET;
						}
					}
					if (last_decide_line_hpos < HARD_DDF_STOP() && hpos >= HARD_DDF_STOP()) {
						plf_state = plf_passed_stop_act;
					}
				//}
			} else {
				if (dma && diw) {
					if (last_decide_line_hpos < plfstop && hpos >= plfstop && plfstop <= maxhpos - DDF_OFFSET && plf_state != plf_wait) {
						ddfstop_matched = true;
					}
				}
			}
		}

		if (hpos > last_sprite_hpos && last_sprite_hpos < SPR0_HPOS + 4 * MAX_SPRITES)
			do_sprites(hpos);

		last_decide_line_hpos = hpos;
	}

	/*-----------------------------------------------------------------------*/
	/* SECT colors */

	/* Called when a color is about to be changed (write to a color register),
	* but the new color has not been entered into the table yet. */
	function record_color_change(hpos, regno, value) {
		if (regno < 0x1000 && nodraw())
			return;
		/* Early positions don't appear on-screen. */
		if (vpos < minfirstline)
			return;

		decide_diw(hpos);
		SAER.playfield.decide_line(hpos);

		if (thisline_decision.ctable < 0)
			remember_ctable();

		if  ((regno < 0x1000 || regno == 0x1000 + 0x10c) && hpos < HBLANK_OFFSET && !(beamcon0 & 0x80) && prev_lineno >= 0) {
			//struct draw_info *pdip = curr_drawinfo + prev_lineno;
			var pdip = curr_drawinfo[prev_lineno];
			var idx = pdip.last_color_change;
			var extrahpos = regno == 0x1000 + 0x10c ? 1 : 0;
			var lastsync = false;
			/* Move color changes in horizontal cycles 0 to HBLANK_OFFSET to end of previous line.
			Cycles 0 to HBLANK_OFFSET are visible in right border on real Amigas. (because of late hsync) */
			if (curr_color_changes[idx - 1].regno == 0xffff) {
				idx--;
				lastsync = true;
			}
			pdip.last_color_change++;
			pdip.nr_color_changes++;
			curr_color_changes[idx].linepos = (hpos + maxhpos) * 2 + extrahpos;
			curr_color_changes[idx].regno = regno;
			curr_color_changes[idx].value = value;
			if (lastsync) {
				curr_color_changes[idx + 1].linepos = hsyncstartpos * 2;
				curr_color_changes[idx + 1].regno = 0xffff;
				curr_color_changes[idx + 2].regno = -1;
			} else {
				curr_color_changes[idx + 1].regno = -1;
			}
		}
		record_color_change2(hpos, regno, value);
	}

	function isbrdblank(hpos, bplcon0, bplcon3) {
		//#ifdef ECS_DENISE
		var brdblank = (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) && (bplcon0 & 1) && (bplcon3 & 0x20);
		var brdntrans = (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) && (bplcon0 & 1) && (bplcon3 & 0x10);
		/*#else
		var brdblank = false;
		var brdntrans = false;
		#endif*/
		if (hpos >= 0 && (ce_is_borderblank(current_colors.extra) != brdblank || ce_is_borderntrans(current_colors.extra) != brdntrans)) {
			record_color_change(hpos, 0, COLOR_CHANGE_BRDBLANK | (brdblank ? 1 : 0) | (ce_is_bordersprite(current_colors.extra) ? 2 : 0) | (brdntrans ? 4 : 0));
			current_colors.extra &= ~(1 << CE_BORDERBLANK);
			current_colors.extra &= ~(1 << CE_BORDERNTRANS);
			current_colors.extra |= brdblank ? (1 << CE_BORDERBLANK) : 0;
			current_colors.extra |= brdntrans ? (1 << CE_BORDERNTRANS) : 0;
			remembered_color_entry = -1;
		}
		return brdblank;
	}
	function issprbrd(hpos, bplcon0, bplcon3) {
		//#ifdef AGA
		var brdsprt = (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) && (bplcon0 & 1) && (bplcon3 & 0x02);
		/*#else
		var brdsprt = false;
		#endif*/
		if (hpos >= 0 && ce_is_bordersprite(current_colors.extra) != brdsprt) {
			record_color_change(hpos, 0, COLOR_CHANGE_BRDBLANK | (ce_is_borderblank(current_colors.extra) ? 1 : 0) | (ce_is_borderntrans(current_colors.extra) ? 4 : 0) | (brdsprt ? 2 : 0));
			current_colors.extra &= ~(1 << CE_BORDERSPRITE);
			current_colors.extra |= brdsprt ? (1 << CE_BORDERSPRITE) : 0;
			remembered_color_entry = -1;
			if (brdsprt && !ce_is_borderblank(current_colors.extra))
				thisline_decision.bordersprite_seen = true;
		}
		return brdsprt && !ce_is_borderblank(current_colors.extra);
	}

	function record_register_change(hpos, regno, value) {
		if (regno == 0x100) { // BPLCON0
			if (value & 0x800)
				thisline_decision.ham_seen = 1;
			thisline_decision.ehb_seen = isehb(value, bplcon2);
			isbrdblank(hpos, value, bplcon3);
			issprbrd(hpos, value, bplcon3);
		} else if (regno == 0x104) { // BPLCON2
			thisline_decision.ehb_seen = isehb(bplcon0, value);
		} else if (regno == 0x106) { // BPLCON3
			isbrdblank(hpos, bplcon0, value);
			issprbrd(hpos, bplcon0, value);
		}
		record_color_change(hpos, regno + 0x1000, value);
	}

	/*-----------------------------------------------------------------------*/
	/* SECT sprites */

	//typedef int sprbuf_res_t, cclockres_t, hwres_t,	bplres_t;

	function expand_sprres(con0, con3) {
		var res;

		switch ((con3 >> 6) & 3) {
			//#ifdef ECS_DENISE
			case 0: /* ECS defaults (LORES,HIRES=LORES sprite,SHRES=HIRES sprite) */
				if ((SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) && GET_RES_DENISE(con0) == SAEC_Config_Video_HResolution_SuperHiRes)
					res = SAEC_Config_Video_HResolution_HiRes;
				else
					res = SAEC_Config_Video_HResolution_LoRes;
				break;
			//#endif
			//#ifdef AGA
			case 1:
				res = SAEC_Config_Video_HResolution_LoRes;
				break;
			case 2:
				res = SAEC_Config_Video_HResolution_HiRes;
				break;
			case 3:
				res = SAEC_Config_Video_HResolution_SuperHiRes;
				break;
			//#endif
			default:
				res = SAEC_Config_Video_HResolution_LoRes;
		}
		return res;
	}

	/* handle very rarely needed playfield collision (CLXDAT bit 0) */
	/* only known game needing this is Rotor */
	function do_playfield_collisions() {
		var bplres = bplcon0_res;
		var ddf_left = thisline_decision.plfleft * 2 << bplres;
		var hw_diwlast = coord_window_to_diw_x(thisline_decision.diwlastword);
		var hw_diwfirst = coord_window_to_diw_x(thisline_decision.diwfirstword);
		var collided, minpos, maxpos;
		//#ifdef AGA
		var planes = (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) ? 8 : 6;
		/*#else
		var planes = 6;
		#endif*/

		if (clxcon_bpl_enable == 0) {
			clxdat |= 1;
			return;
		}
		if (clxdat & 1)
			return;

		collided = false;
		minpos = thisline_decision.plfleft * 2;
		if (minpos < hw_diwfirst)
			minpos = hw_diwfirst;
		maxpos = thisline_decision.plfright * 2;
		if (maxpos > hw_diwlast)
			maxpos = hw_diwlast;

		var ldata = line_data[next_lineno];

		for (var i = minpos; i < maxpos && !collided; i += 32) {
			//var offs = ((i << bplres) - ddf_left) >> 3;
			var offs = ((i << bplres) - ddf_left) >> 5;
			var total = 0xffffffff;
			for (var j = 0; j < planes; j++) {
				var ena = (clxcon_bpl_enable >> j) & 1;
				var match = (clxcon_bpl_match >> j) & 1;
				var t = 0xffffffff;
				if (ena) {
					if (j < thisline_decision.nr_planes) {
						//t = *(uae_u32 *)(line_data[next_lineno] + offs + 2 * j * MAX_WORDS_PER_LINE);
						t = ldata[MAX_WORDS_PER_LINE_FULL * j + offs];
						t = (t ^ ((match & 1) - 1) >>> 0) >>> 0;
					} else {
						t = ((match & 1) - 1) >>> 0;
					}
				}
				total &= t;
			}
			if (total) {
				collided = true;
				/*#if 0
				{
					for (var k = 0; k < 1; k++) {
						uae_u32 *ldata = (uae_u32 *)(line_data[next_lineno] + offs + 2 * k * MAX_WORDS_PER_LINE);
						*ldata ^= 0x5555555555;
					}
				}
				#endif*/
			}
		}
		if (collided)
			clxdat |= 1;
	}

	/* Sprite-to-sprite collisions are taken care of in record_sprite.  This one does playfield/sprite collisions. */
	function do_sprite_collisions() {
		var nr_sprites = curr_drawinfo[next_lineno].nr_sprites;
		var first = curr_drawinfo[next_lineno].first_sprite_entry;
		var collision_mask = clxmask[clxcon >> 12];
		var bplres = bplcon0_res;
		var ddf_left = thisline_decision.plfleft * 2 << bplres;
		var hw_diwlast = coord_window_to_diw_x(thisline_decision.diwlastword);
		var hw_diwfirst = coord_window_to_diw_x(thisline_decision.diwfirstword);

		if (clxcon_bpl_enable == 0) {
			clxdat |= 0x1FE;
			return;
		}

		for (var i = 0; i < nr_sprites; i++) {
			//struct sprite_entry *e = curr_sprite_entries + first + i;
			var e = curr_sprite_entries[first + i];
			var minpos = e.pos;
			var maxpos = e.max;
			var minp1 = minpos >> sprite_buffer_res;
			var maxp1 = maxpos >> sprite_buffer_res;

			if (maxp1 > hw_diwlast)
				maxpos = hw_diwlast << sprite_buffer_res;
			if (maxp1 > thisline_decision.plfright * 2)
				maxpos = thisline_decision.plfright * 2 << sprite_buffer_res;
			if (minp1 < hw_diwfirst)
				minpos = hw_diwfirst << sprite_buffer_res;
			if (minp1 < thisline_decision.plfleft * 2)
				minpos = thisline_decision.plfleft * 2 << sprite_buffer_res;

			for (var j = minpos; j < maxpos; j++) {
				var sprpix = spixels[e.first_pixel + j - e.pos] & collision_mask;
				var match = true;

				if (sprpix == 0)
					continue;

				var offs = ((j << bplres) >> sprite_buffer_res) - ddf_left;
				sprpix = sprite_ab_merge[sprpix & 255] | (sprite_ab_merge[sprpix >> 8] << 2);
				sprpix <<= 1;

				var ldata = line_data[next_lineno];

				/* Loop over number of playfields.  */
				for (var k = 1; k >= 0; k--) {
					//#ifdef AGA
					var planes = (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) ? 8 : 6;
					/*#else
					var planes = 6;
					#endif*/
					if (bplcon0 & 0x400)
						match = true;
					for (var l = k; match && l < planes; l += 2) {
						var t = 0;
						if (l < thisline_decision.nr_planes) {
							//uae_u32 *ldata = (uae_u32 *)(line_data[next_lineno] + 2 * l * MAX_WORDS_PER_LINE);
							//uae_u32 word = ldata[offs >> 5];
							var word = ldata[MAX_WORDS_PER_LINE_FULL * l + (offs >> 5)];

							t = (word >>> (31 - (offs & 31))) & 1;
							/*#if 0 //debug: draw collision mask
							if (1) {
								for (var m = 0; m < 5; m++) {
									ldata = (uae_u32 *)(line_data[next_lineno] + 2 * m * MAX_WORDS_PER_LINE);
									ldata[(offs >> 5) + 1] |= 15 << (31 - (offs & 31));
								}
							}
							#endif*/
						}
						if (clxcon_bpl_enable & (1 << l)) {
							if (t != ((clxcon_bpl_match >> l) & 1))
								match = false;
						}
					}
					if (match) {
						/*#if 0 // debug: mark lines where collisions are detected
						if (0) {
							for (var l = 0; l < 5; l++) {
								uae_u32 *ldata = (uae_u32 *)(line_data[next_lineno] + 2 * l * MAX_WORDS_PER_LINE);
								ldata[(offs >> 5) + 1] |= 15 << (31 - (offs & 31));
							}
						}
						#endif*/
						clxdat |= sprpix << (k * 4);
					}
				}
			}
		}
	}

	//static void record_sprite_1 (int sprxp, uae_u16 *buf, uae_u32 datab, int num, int dbl,unsigned int mask, int do_collisions, uae_u32 collision_mask)
	function record_sprite_1(sprxp, buf, datab, num, dbl, mask, do_collisions, collision_mask) {
		var j = 0;
		while (datab) {
			var col = 0;
			var coltmp = 0;

			if ((sprxp >= sprite_minx && sprxp < sprite_maxx) || (bplcon3 & 2))
				col = (datab & 3) << (2 * num);
			/*#if 0
			if (sprxp == sprite_minx || sprxp == sprite_maxx - 1) col ^= (. () << 16) | . ();
			#endif*/

			if ((j & mask) == 0) {
				//var tmp = (*buf) | col; *buf++ = tmp;
				var tmp = spixels[buf] | col; spixels[buf++] = tmp;
				if (do_collisions) coltmp |= tmp;
				sprxp++;
			}
			if (dbl > 0) {
				//var tmp = (*buf) | col; *buf++ = tmp;
				var tmp = spixels[buf] | col; spixels[buf++] = tmp;
				if (do_collisions) coltmp |= tmp;
				sprxp++;
			}
			if (dbl > 1) {
				var tmp;
				//tmp = (*buf) | col; *buf++ = tmp;
				tmp = spixels[buf] | col; spixels[buf++] = tmp;
				if (do_collisions) coltmp |= tmp;
				//tmp = (*buf) | col; *buf++ = tmp;
				tmp = spixels[buf] | col; spixels[buf++] = tmp;
				if (do_collisions) coltmp |= tmp;
				sprxp++;
				sprxp++;
			}
			j++;
			datab >>>= 2;
			if (do_collisions) {
				coltmp &= collision_mask;
				if (coltmp) {
					var shrunk_tmp = sprite_ab_merge[coltmp & 255] | (sprite_ab_merge[coltmp >> 8] << 2);
					clxdat |= sprclx[shrunk_tmp];
				}
			}
		}
	}

	/* DATAB contains the sprite data; 16 pixels in two-bit packets.  Bits 0/1
	determine the color of the leftmost pixel, bits 2/3 the color of the next
	etc.
	This function assumes that for all sprites in a given line, SPRXP either
	stays equal or increases between successive calls.

	The data is recorded either in lores pixels (if OCS/ECS), or in hires or
	superhires pixels (if AGA).  */

	//static void record_sprite (int line, int num, int sprxp, uae_u16 *data, uae_u16 *datb, unsigned int ctl)
	function record_sprite(line, num, sprxp, data, datb, ctl) {
		//struct sprite_entry *e = curr_sprite_entries + next_sprite_entry;
		var e = curr_sprite_entries[next_sprite_entry];
		var this_sprite_entry = next_sprite_entry; //OWN
		var i;
		var word_offs;
		var collision_mask; //u32
		var width, dbl, half;
		var mask = 0; //uint
		var attachment;
		var nr2 = 0; //OWN

		half = 0;
		dbl = sprite_buffer_res - sprres;
		if (dbl < 0) {
			half = -dbl;
			dbl = 0;
			mask = 1 << half;
		}
		width = (sprite_width << sprite_buffer_res) >> sprres;
		attachment = sprctl[num | 1] & 0x80;

		/* Try to coalesce entries if they aren"t too far apart  */
		//if (!next_sprite_forced && e[-1].max + sprite_width >= sprxp) {
		if (!next_sprite_forced && curr_sprite_entries[this_sprite_entry - 1].max + sprite_width >= sprxp) {
			//e--;
			e = curr_sprite_entries[--this_sprite_entry];
		} else {
			next_sprite_entry++;
			e.pos = sprxp;
			e.has_attached = 0;
		}

		if (sprxp < e.pos) SAEF_error("record_sprite() sprxp < e.pos (%d < %d)", sprxp, e.pos);

		e.max = sprxp + width;
		//e[1].first_pixel = e->first_pixel + ((e->max - e->pos + 3) & ~3);
		curr_sprite_entries[this_sprite_entry + 1].first_pixel = e.first_pixel + ((e.max - e.pos + 3) & ~3);
		next_sprite_forced = 0;

		collision_mask = clxmask[clxcon >> 12];
		word_offs = e.first_pixel + sprxp - e.pos;

		for (i = 0; i < sprite_width; i += 16) {
			//unsigned int da = *data;
			//unsigned int db = *datb;
			var da = data[nr2];
			var db = datb[nr2];
			var datab = ((sprtaba[da & 0xFF] << 16) | sprtaba[da >> 8] | (sprtabb[db & 0xFF] << 16) | sprtabb[db >> 8]) >>> 0; //u32
			var off = (i << dbl) >> half;
			//uae_u16 *buf = spixels + word_offs + off;

			if (SAEV_config.chipset.colLevel > SAEC_Config_Chipset_ColLevel_None && collision_mask)
				record_sprite_1(sprxp + off, word_offs + off, datab, num, dbl, mask, 1, collision_mask);
			else
				record_sprite_1(sprxp + off, word_offs + off, datab, num, dbl, mask, 0, collision_mask);

			//data++; datb++;
			nr2++;
		}

		/* We have 8 bits per pixel in spixstate, two for every sprite pair.  The
		low order bit records whether the attach bit was set for this pair. */
		if (attachment && !isecsshres()) {
			//uae_u32 state = 0x01010101 << (num & ~1);
			var state = ((0x01010101 << (num & 0xfe)) >>> 0) & 0xff; //ATT
			//uae_u8 *stb1 = spixstate.bytes + word_offs;
			var stb1 = word_offs;
			for (i = 0; i < width; i += 8) {
				/*stb1[0] |= state;
				stb1[1] |= state;
				stb1[2] |= state;
				stb1[3] |= state;
				stb1[4] |= state;
				stb1[5] |= state;
				stb1[6] |= state;
				stb1[7] |= state;*/
				spixstate.bytes[stb1 + 0] |= state;
				spixstate.bytes[stb1 + 1] |= state;
				spixstate.bytes[stb1 + 2] |= state;
				spixstate.bytes[stb1 + 3] |= state;
				spixstate.bytes[stb1 + 4] |= state;
				spixstate.bytes[stb1 + 5] |= state;
				spixstate.bytes[stb1 + 6] |= state;
				spixstate.bytes[stb1 + 7] |= state;
				stb1 += 8;
			}
			e.has_attached = 1;
		}
	}

	function add_sprite(count, num, sprxp, posns, nrs) {
		var j, bestp;

		/* Sort the sprites in order of ascending X position before recording them.  */
		for (bestp = 0; bestp < count; bestp++) {
			if (posns[bestp] > sprxp)
				break;
			if (posns[bestp] == sprxp && nrs[bestp] < num)
				break;
		}
		for (j = count; j > bestp; j--) {
			posns[j] = posns[j - 1];
			nrs[j] = nrs[j - 1];
		}
		posns[j] = sprxp;
		nrs[j] = num;
	}

	function tospritexdiw(diw) {
		return coord_window_to_hw_x(diw - (DIW_DDF_OFFSET << lores_shift)) << sprite_buffer_res;
	}
	function tospritexddf(ddf) {
		return (ddf * 2 - DIW_DDF_OFFSET) << sprite_buffer_res;
	}
	function fromspritexdiw(ddf) {
		return coord_hw_to_window_x(ddf >> sprite_buffer_res) + (DIW_DDF_OFFSET << lores_shift);
	}

	function calcsprite() {
		sprite_maxx = 0x7fff;
		sprite_minx = 0;
		if (thisline_decision.diwlastword >= 0)
			sprite_maxx = tospritexdiw(thisline_decision.diwlastword);
		if (thisline_decision.diwfirstword >= 0)
			sprite_minx = tospritexdiw(thisline_decision.diwfirstword);
		if (thisline_decision.plfleft >= 0) {
			var min = tospritexddf(thisline_decision.plfleft);
			var max = tospritexddf(thisline_decision.plfright);
			if (min > sprite_minx && min < max) { /* min < max = full line ddf */
				if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) {
					sprite_minx = min;
				} else {
					if (thisline_decision.plfleft >= 0x28 || bpldmawasactive)
						sprite_minx = min;
				}
			}
			/* sprites are visible from first BPL1DAT write to end of line
			 * ECS Denise/AGA: no limits
			 * OCS Denise: BPL1DAT write only enables sprite if hpos >= 0x28 or so.
			 * (undocumented feature) */
		}
	}

	function decide_sprites(hpos, usepointx) {
		if (typeof usepointx == "undefined") var usepointx = false;
		var nrs = new Int32Array(MAX_SPRITES * 2);
		var posns = new Int32Array(MAX_SPRITES * 2);
		var width = sprite_width;
		var sscanmask = 0x100 << sprite_buffer_res;
		var gotdata = false;

		if (thisline_decision.plfleft < 0 && !(bplcon3 & 2))
			return;

		// let sprite shift register empty completely if sprite is at the very edge of right border
		var point = hpos * 2;
		if (hpos >= maxhpos)
			point += ((9 - 2) * 2) * sprite_buffer_res;

		if (nodraw() || hpos < 0x14 || nr_armed == 0 || point == last_sprite_point)
			return;

		decide_diw(hpos);
		SAER.playfield.decide_line(hpos);
		calcsprite();

		var i, count = 0;
		for (i = 0; i < MAX_SPRITES; i++) {
			var xpos = spr[i].xpos;
			var sprxp = (fmode & 0x8000) ? (xpos & ~sscanmask) : xpos;
			var hw_xp = sprxp >> sprite_buffer_res;
			var pointx = usepointx && (sprctl[i] & sprite_sprctlmask) ? 0 : 1;

			if (xpos < 0)
				continue;
			if (!spr[i].armed)
				continue;

			if (hw_xp > last_sprite_point && hw_xp <= point + pointx)
				add_sprite(count++, i, sprxp, posns, nrs);

			/* SSCAN2-bit is fun.. */
			if ((fmode & 0x8000) && !(sprxp & sscanmask)) {
				sprxp |= sscanmask;
				hw_xp = sprxp >> sprite_buffer_res;
				if (hw_xp > last_sprite_point && hw_xp <= point + pointx)
					add_sprite(count++, MAX_SPRITES + i, sprxp, posns, nrs);
			} else if (!(fmode & 0x80) && xpos >= (2 << sprite_buffer_res) && xpos <= (9 << sprite_buffer_res)) {
				// right border wrap around. SPRxCTL horizontal bits do not matter.
				sprxp += (maxhpos * 2) << sprite_buffer_res;
				hw_xp = sprxp >> sprite_buffer_res;
				if (hw_xp > last_sprite_point && hw_xp <= point + pointx)
					add_sprite(count++, MAX_SPRITES + i, sprxp, posns, nrs);

				// (not really mutually exclusive of SSCAN2-bit but not worth the trouble)
			}
		}

		for (i = 0; i < count; i++) {
			var nr = nrs[i] & (MAX_SPRITES - 1);
			record_sprite(next_lineno, nr, posns[i], sprdata[nr], sprdatb[nr], sprctl[nr]);

			if (AUTOSCALE_SPRITES) {
				/* get left and right sprite edge if brdsprt enabled */
				if (SAEF_Custom_dmaen(SAEC_Custom_DMAF_SPREN) && (bplcon0 & 1) && (bplcon3 & 0x02) && !(bplcon3 & 0x20) && nr > 0) {
					for (var j = 0, jj = 0; j < sprite_width; j += 16, jj++) {
						var nx = fromspritexdiw(posns[i] + j);
						if (sprdata[nr][jj] || sprdatb[nr][jj]) {
							if (diwfirstword_total > nx && nx >= (48 << SAEV_config.video.hresolution))
								diwfirstword_total = nx;
							if (diwlastword_total < nx + 16 && nx <= (448 << SAEV_config.video.hresolution))
								diwlastword_total = nx + 16;
						}
					}
					gotdata = true;
				}
			}
		}
		last_sprite_point = point;

		if (AUTOSCALE_SPRITES) {
			/* get upper and lower sprite position if brdsprt enabled */
			if (gotdata) {
				if (vpos < first_planes_vpos) first_planes_vpos = vpos;
				if (vpos < plffirstline_total) plffirstline_total = vpos;
				if (vpos > last_planes_vpos) last_planes_vpos = vpos;
				if (vpos > plflastline_total) plflastline_total = vpos;
			}
		}
	}
	/*function decide_sprites(hpos) { //OWN
		decide_sprites(hpos, false);
	}*/

	/*-----------------------------------------------------------------------*/
	/* SECT decisions */

	function sprites_differ(dip, dip_old) {
		var this_first = curr_sprite_entries[dip.first_sprite_entry];
		var this_last = curr_sprite_entries[dip.last_sprite_entry];
		var prev_first = prev_sprite_entries[dip_old.first_sprite_entry];
		var i;

		if (dip.nr_sprites != dip_old.nr_sprites)
			return 1;
		if (dip.nr_sprites == 0)
			return 0;

		for (i = 0; i < dip.nr_sprites; i++) {
			var this_first_i = curr_sprite_entries[dip.first_sprite_entry + i]; //OWN
			var prev_first_i = prev_sprite_entries[dip_old.first_sprite_entry + i]; //OWN
			if (
				this_first_i.pos != prev_first_i.pos ||
				this_first_i.max != prev_first_i.max ||
				this_first_i.has_attached != prev_first_i.has_attached
			) return 1;
		}

		var npixels = this_last.first_pixel + (this_last.max - this_last.pos) - this_first.first_pixel;
		for (i = 0; i < npixels; i++) {
			if (spixels[this_first.first_pixel + i] != spixels[prev_first.first_pixel + i]) return 1;
			if (spixstate.bytes[this_first.first_pixel + i] != spixstate.bytes[prev_first.first_pixel + i]) return 1;
		}
		return 0;
	}

	function color_changes_differ(dip, dip_old) {
		if (dip.nr_color_changes != dip_old.nr_color_changes)
			return 1;
		if (dip.nr_color_changes == 0)
			return 0;
		//if (memcmp(curr_color_changes + dip->first_color_change, prev_color_changes + dip_old->first_color_change, dip->nr_color_changes * sizeof *curr_color_changes) != 0) return 1;
		for (var i = 0; i < dip.nr_color_changes; i++) {
			if (cmp_color_change(curr_color_changes[dip.first_color_change], prev_color_changes[dip_old.first_color_change]) != 0) return 1;
		}
		return 0;
	}

	/* End of a horizontal scan line. Finish off all decisions that were not made yet. */
	function finish_decisions() {
		var dip;
		var dip_old;
		var dp;
		var changed;
		var hpos = maxhpos;

		if (nodraw())
			return;

		decide_diw(hpos);
		SAER.playfield.decide_line(hpos);
		SAER.playfield.decide_fetch_safe(hpos);
		finish_final_fetch();

		record_color_change2(hsyncstartpos, 0xffff, 0);
		if (thisline_decision.plfleft >= 0 && thisline_decision.plflinelen < 0) {
			if (fetch_state != fetch_not_started)
				SAEF_warn("playfield.finish_decisions() fetch_state != fetch_not_started");

			thisline_decision.plfright = thisline_decision.plfleft;
			thisline_decision.plflinelen = 0;
			thisline_decision.bplres = SAEC_Config_Video_HResolution_LoRes;
		}

		/* Large DIWSTOP values can cause the stop position never to be
		* reached, so the state machine always stays in the same state and
		* there"s a more-or-less full-screen DIW. */
		if (hdiwstate == DIW_WAITING_STOP) {
			thisline_decision.diwlastword = max_diwlastword();
			if (thisline_decision.diwfirstword < 0)
				thisline_decision.diwfirstword = min_diwlastword;
		}

		if (thisline_decision.diwfirstword != line_decisions[next_lineno].diwfirstword) {
			//MARK_LINE_CHANGED; //ORG
			if (SMART_UPDATE) thisline_changed = 1; //OWN opt inline
		}
		if (thisline_decision.diwlastword != line_decisions[next_lineno].diwlastword) {
			//MARK_LINE_CHANGED; //ORG
			if (SMART_UPDATE) thisline_changed = 1; //OWN opt inline
		}

		dip = curr_drawinfo[next_lineno];
		dip_old = prev_drawinfo[next_lineno];
		dp = line_decisions[next_lineno];
		changed = thisline_changed | custom_frame_redraw_necessary;
		if (thisline_decision.plfleft >= 0 && thisline_decision.nr_planes > 0)
			record_diw_line(thisline_decision.plfleft, diwfirstword, diwlastword);

		decide_sprites(hpos + 1);

		dip.last_sprite_entry = next_sprite_entry;
		dip.last_color_change = next_color_change;

		if (thisline_decision.ctable < 0) {
			if (thisline_decision.plfleft < 0)
				remember_ctable_for_border();
			else
				remember_ctable();
		}

		dip.nr_color_changes = next_color_change - dip.first_color_change;
		dip.nr_sprites = next_sprite_entry - dip.first_sprite_entry;

		if (thisline_decision.plfleft != line_decisions[next_lineno].plfleft)
			changed = 1;
		if (!changed && color_changes_differ(dip, dip_old))
			changed = 1;
		if (!changed && /* bitplane visible in this line OR border sprites enabled */
			(thisline_decision.plfleft >= 0 || ((thisline_decision.bplcon0 & 1) && (thisline_decision.bplcon3 & 0x02) && !(thisline_decision.bplcon3 & 0x20))) &&
			sprites_differ(dip, dip_old))
		{
			changed = 1;
		}

		if (changed) {
			thisline_changed = 1;
			// *dp = thisline_decision; //ORG
			cpy_decision(dp, thisline_decision);
		} else {
			/* The only one that may differ: */
			dp.ctable = thisline_decision.ctable;
		}

		/* leave free space for possible extra color changes at the end of line */
		next_color_change += (HBLANK_OFFSET + 1) / 2; //ATT ok, (9+1)/2

		diw_hcounter += maxhpos * 2;
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) && vpos == get_equ_vblank_endline() - 1)
			diw_hcounter++;
		if ((SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) || vpos > get_equ_vblank_endline() || (SAEV_config.chipset.agnusDIP && vpos == 0)) {
			diw_hcounter = maxhpos * 2;
			last_hdiw = 2 - 1;
		}

		if (next_color_change >= MAX_REG_CHANGE - 30) {
			SAEF_warn("playfield.finish_decisions() color_change buffer overflow!");
			next_color_change = 0;
			dip.nr_color_changes = 0;
			dip.first_color_change = 0;
			dip.last_color_change = 0;
		}
	}

	/* Set the state of all decisions to "undecided" for a new scanline. */
	function reset_decisions() {
		if (nodraw())
			return;

		toscr_nr_planes = toscr_nr_planes2 = 0;
		thisline_decision.bplres = bplcon0_res;
		thisline_decision.nr_planes = 0;
		bpl1dat_written = false;
		bpl1dat_written_at_least_once = false;

		thisline_decision.plfleft = -1;
		thisline_decision.plflinelen = -1;
		thisline_decision.ham_seen = !!(bplcon0 & 0x800);
		thisline_decision.ehb_seen = !!isehb(bplcon0, bplcon2);
		thisline_decision.ham_at_start = !!(bplcon0 & 0x800);
		thisline_decision.bordersprite_seen = issprbrd(-1, bplcon0, bplcon3);

		/* decided_res shouldn"t be touched before it"s initialized by decide_line(). */
		thisline_decision.diwfirstword = -1;
		thisline_decision.diwlastword = -1;
		if (hdiwstate == DIW_WAITING_STOP) {
			thisline_decision.diwfirstword = min_diwlastword;
			if (thisline_decision.diwfirstword != line_decisions[next_lineno].diwfirstword) {
				//MARK_LINE_CHANGED; //ORG
				if (SMART_UPDATE) thisline_changed = 1; //OWN opt inline
			}
		}
		thisline_decision.ctable = -1;

		thisline_changed = 0;
		curr_drawinfo[next_lineno].first_color_change = next_color_change;
		curr_drawinfo[next_lineno].first_sprite_entry = next_sprite_entry;
		next_sprite_forced = 1;

		last_sprite_point = 0;
		fetch_state = fetch_not_started;
		if (bpldmasetuphpos >= 0) {
			// this can happen in "too fast" modes
			BPLCON0_Denise(0, bplcon0, true);
			setup_fmodes(0);
		}
		bpldmasetuphpos = -1;
		bpldmasetupphase = 0;
		bpldmawasactive = false;
		reset_moddelays();
		/*#if 0
		reset_dbpll_all(256);
		reset_dbplh_all(256);
		#endif*/
		delay_cycles = 0;
		compute_toscr_delay(bplcon1);

		if (plf_state >= plf_passed_stop2 || plf_state == plf_wait)
			plf_state = plf_idle;

		// Only ECS Agnus can keep DDF open between lines
		if ((SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS)) {
			if (!ddfstop_matched)
				plf_state = plf_active;
		}

		bpl_hstart = 256;
		plfr_state = plfr_idle;
		plf_start_hpos = 256 + DDF_OFFSET;
		plf_end_hpos = 256 + DDF_OFFSET;
		ddfstop_written_hpos = -1;
		bitplane_maybe_start_hpos = -1;
		bitplane_off_delay = -1;

		if (line_cyclebased) {
			line_cyclebased--;
			if (!line_cyclebased)
				bpl_dma_off_when_active = 0;
		}

		//fetched[] must not be cleared (Sony VX-90 / Royal Amiga Force)
		todisplay_fetched[0] = todisplay_fetched[1] = false;
		for (var i = 0; i < MAX_PLANES; i++) {
			outword[i] = 0;
			todisplay[i] = 0;
			todisplay2[i] = 0;
		}
		//#ifdef AGA
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			for (var i = 0; i < MAX_PLANES; i++) {
				//todisplay_aga[i] = 0;
				todisplay_aga_hi[i] = todisplay_aga_lo[i] = 0;
				//todisplay2_aga[i] = 0;
				todisplay2_aga_hi[i] = todisplay2_aga_lo[i] = 0;
			}
		}
		aga_plf_passed_stop2 = false;
		//#endif

		if (bitplane_line_crossing) {
			// BPL1DAT would have been written after end of last scanline.
			// Set BPL1DAT "written at least once" state for new scanline.
			bitplane_line_crossing -= maxhpos - HPOS_SHIFT;
			if (bitplane_line_crossing > 0) {
				bpl1dat_written = true;
				bpl1dat_written_at_least_once = true;
				reset_bpl_vars();
				beginning_of_plane_block(bitplane_line_crossing, fetchmode);
			}
			bitplane_line_crossing = 0;
		} else
			reset_bpl_vars();

		last_decide_line_hpos = -(DDF_OFFSET + 1);
		last_ddf_pix_hpos = -1;
		last_sprite_hpos = -1;
		last_fetch_hpos = -1;

		if (sprite_ignoreverticaluntilnextline) {
			sprite_ignoreverticaluntilnextline = false;
			for (var i = 0; i < MAX_SPRITES; i++)
				spr[i].ignoreverticaluntilnextline = false;
		}

		/* These are for comparison. */
		thisline_decision.bplcon0 = bplcon0;
		thisline_decision.bplcon2 = bplcon2;
		//#ifdef ECS_DENISE
		thisline_decision.bplcon3 = bplcon3;
		//#endif
		//#ifdef AGA
		thisline_decision.bplcon4 = bplcon4;
		//#endif
		scanlinecount++;
	}

	/*-----------------------------------------------------------------------*/
	/* SECT vsync */

	function compute_vsynctime() { //global
		var svpos = maxvpos_nom; //double
		var shpos = maxhpos_short; //double
		var syncadjust = 1.0; //double

		SAEV_Playfield_fake_vblank_hz = 0.0;
		vblank_hz_mult = 0;
		vblank_hz_state = 1;
		if (Math.abs(SAEV_config.chipset.refreshRate) > 0.1) {
			syncadjust = SAEV_config.chipset.refreshRate / vblank_hz_nom;
			vblank_hz = SAEV_config.chipset.refreshRate;
			if (isvsync_chipset()) {
				var result = {};
				SAEF_Playfield_getvsyncrate(vblank_hz, result);
				if (result.hz != vblank_hz) {
					SAEF_Playfield_getvsyncrate(vblank_hz, result);
					vblank_hz = result.hz;
					vblank_hz_mult = result.mult;
					if (vblank_hz_mult > 0)
						vblank_hz_state = 0;
				}
			}
		}
		if (!SAEV_Playfield_fake_vblank_hz)
			SAEV_Playfield_fake_vblank_hz = vblank_hz;

		/*if (currprefs.turbo_emulation) {
			if (currprefs.turbo_emulation_limit > 0) {
				SAEV_Audio_vsynctimebase_orig = SAER.events.calc_vsynctimebase(currprefs.turbo_emulation_limit);
			} else {
				SAEV_Audio_vsynctimebase_orig = SAER.events.calc_vsynctimebase(SAEC_Events_syncbase / 1000);
			}
		} else*/
			SAEV_Audio_vsynctimebase_orig = SAER.events.calc_vsynctimebase(SAEV_Playfield_fake_vblank_hz);

		/*#if 0
		if (!SAEV_Playfield_picasso_on) updatedisplayarea();
		#endif*/

		if (islinetoggle())
			shpos += 0.5;
		if (interlace_seen)
			svpos += 0.5;
		else if (lof_current)
			svpos += 1.0;

		if (SAEV_config.audio.mode != SAEC_Config_Audio_Mode_Off) {
			var clk = svpos * shpos * SAEV_Playfield_fake_vblank_hz; //double
			SAEF_log("playfield.compute_vsynctime() %.1f*%.1f*%.6f=%.6f, syncadjust %f", svpos, shpos, SAEV_Playfield_fake_vblank_hz, clk, syncadjust);
			SAER.devices.update_sound(clk, syncadjust);
		}
		//SAER.devices.update_sync(svpos, syncadjust); //OWN cd32
	}
	this.compute_vsynctime_ext = function() {
		compute_vsynctime();
	}

	/*void getsyncregisters(uae_u16 *phsstrt, uae_u16 *phsstop, uae_u16 *pvsstrt, uae_u16 *pvsstop) {
		*phsstrt = hsstrt;
		*phsstop = hsstop;
		*pvsstrt = vsstrt;
		*pvsstop = vsstop;
	}*/

	function dumpsync() {
		//static int cnt = 100; if (cnt < 0) return; cnt--;
		SAEF_log("BEAMCON0=%04X VTOTAL=%04X  HTOTAL=%04X", new_beamcon0, vtotal, htotal);
		SAEF_log("  HSSTOP=%04X HBSTRT=%04X  HBSTOP=%04X", hsstop, hbstrt, hbstop);
		SAEF_log("  VSSTOP=%04X VBSTRT=%04X  VBSTOP=%04X", vsstop, vbstrt, vbstop);
		SAEF_log("  HSSTRT=%04X VSSTRT=%04X HCENTER=%04X", hsstrt, vsstrt, hcenter);
		SAEF_log("  HSYNCSTART=%04X HSYNCEND=%04X", hsyncstartpos, hsyncendpos);
	}

	function current_maxvpos() { //global
		return maxvpos + (lof_store ? 1 : 0);
	}
	SAER_Playfield_current_maxvpos = current_maxvpos;

	/*#if 0
	function checklacecount(lace) {
		if (!interlace_changed) {
			if (nlace_cnt >= NLACE_CNT_NEEDED && lace) {
				lof_togglecnt_lace = LOF_TOGGLES_NEEDED;
				lof_togglecnt_nlace = 0;
				nlace_cnt = 0;
			} else if (nlace_cnt <= -NLACE_CNT_NEEDED && !lace) {
				lof_togglecnt_nlace = LOF_TOGGLES_NEEDED;
				lof_togglecnt_lace = 0;
				nlace_cnt = 0;
			}
		}
		if (lace) {
			if (nlace_cnt > 0)
				nlace_cnt = 0;
			nlace_cnt--;
			if (nlace_cnt < -NLACE_CNT_NEEDED * 2)
				nlace_cnt = -NLACE_CNT_NEEDED * 2;
		} else if (!lace) {
			if (nlace_cnt < 0)
				nlace_cnt = 0;
			nlace_cnt++;
			if (nlace_cnt > NLACE_CNT_NEEDED * 2)
				nlace_cnt = NLACE_CNT_NEEDED * 2;
		}
	}
	#endif*/

	function get_chipset_refresh() { //global
		var islace = interlace_seen ? 1 : 0;
		var isntsc = (beamcon0 & 0x20) ? 0 : 1;

		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS))
			isntsc = SAEV_config.chipset.ntsc ? 1 : 0;

		for (var i = 0; i < SAEV_config.chipset.refresh.length; i++) {
			var cr = SAEV_config.chipset.refresh[i];
			if ((cr.horiz < 0 || cr.horiz == maxhpos) &&
				(cr.vert < 0 || cr.vert == maxvpos_display) &&
				(cr.ntsc < 0 || (cr.ntsc > 0 && isntsc) || (cr.ntsc == 0 && !isntsc)) &&
				(cr.lace < 0 || (cr.lace > 0 && islace) || (cr.lace == 0 && !islace)) &&
				(cr.framelength < 0 || (cr.framelength > 0 && lof_store) || (cr.framelength == 0 && !lof_store) || (cr.framelength >= 0 && islace)) &&
				((cr.rtg && SAEV_Playfield_picasso_on) || (!cr.rtg && !SAEV_Playfield_picasso_on)) &&
				(cr.vsync < 0 || (cr.vsync > 0 && isvsync_chipset()) || (cr.vsync == 0 && !isvsync_chipset())))
					return cr;
		}
		return null;
	}

	function changed_chipset_refresh() {
		return stored_chipset_refresh != get_chipset_refresh();
	}

	function compute_framesync() { //global
		var islace = interlace_seen ? 1 : 0;
		var isntsc = (beamcon0 & 0x20) ? 0 : 1;
		var found = false;
		var i;

		if (islace)
			vblank_hz = vblank_hz_lace;
		else if (lof_current)
			vblank_hz = vblank_hz_lof;
		else
			vblank_hz = vblank_hz_shf;

		var cr = get_chipset_refresh(); //struct chipset_refresh *
		while (cr !== null) {
			var v = -1.0;
			if (!SAEV_Playfield_picasso_on && !SAEV_Playfield_picasso_requested_on) {
				/*if (isvsync_chipset()) {
					if (cr.index == SAEC_Config_Chipset_CR_PAL || cr.index == SAEC_Config_Chipset_CR_NTSC) {
						if ((fabs (vblank_hz - 50) < 1 || fabs (vblank_hz - 60) < 1 || fabs (vblank_hz - 100) < 1 || fabs (vblank_hz - 120) < 1) && SAEV_config.video.apmode[0].gfx_vsync == 2 && SAEV_config.video.apmode[0].gfx_fullscreen > 0) {
							vsync_switchmode((int)vblank_hz);
						}
					}
					if (isvsync_chipset() < 0) {
						var v2 = vblank_calibrate(cr.locked ? cr.rate : vblank_hz, cr.locked);
						if (!cr.locked)
							v = v2;
					} else if (isvsync_chipset() > 0) {
						if (SAEV_config.video.apmode[0].gfx_refreshrate)
							v = abs (SAEV_config.video.apmode[0].gfx_refreshrate);
					}
				} else*/ {
					if (cr.locked == false) {
						SAEV_config.chipset.refreshRate = vblank_hz;
						//changed_prefs.chipset_refreshrate = SAEV_config.chipset.refreshRate = vblank_hz; cfgfile_parse_lines (&changed_prefs, cr.commands, -1);
						break;
					} else
						v = cr.rate;
				}
				if (v < 0)
					v = cr.rate;
				if (v > 0) {
					SAEV_config.chipset.refreshRate = v;
					//changed_prefs.chipset_refreshrate = SAEV_config.chipset.refreshRate = v; cfgfile_parse_lines (&changed_prefs, cr.commands, -1);
				}
			} else {
				if (cr.locked == false)
					v = vblank_hz;
				else
					v = cr.rate;
				SAEV_config.chipset.refreshRate = v;
				//changed_prefs.chipset_refreshrate = SAEV_config.chipset.refreshRate = v; cfgfile_parse_lines (&changed_prefs, cr.commands, -1);
			}
			found = true;
			break;
		}
		if (!found) SAEV_config.chipset.refreshRate = vblank_hz;
		//if (!found) changed_prefs.chipset_refreshrate = SAEV_config.chipset.refreshRate = vblank_hz;


		stored_chipset_refresh = cr;
		interlace_changed = 0;
		lof_togglecnt_lace = 0;
		lof_togglecnt_nlace = 0;
		//nlace_cnt = NLACE_CNT_NEEDED;
		lof_changing = 0;
		gfxvidinfo.drawbuffer.inxoffset = -1;
		gfxvidinfo.drawbuffer.inyoffset = -1;

		if (beamcon0 & 0x80) {
			var res = GET_RES_AGNUS(bplcon0);
			var vres = islace ? 1 : 0;
			var res2, vres2;

			res2 = SAEV_config.video.hresolution;
			if (doublescan > 0)
				res2++;
			if (res2 > RES_MAX)
				res2 = RES_MAX;

			vres2 = SAEV_config.video.vresolution;
			if (doublescan > 0 && !islace)
				vres2--;

			if (vres2 < 0)
				vres2 = 0;
			if (vres2 > VRES_QUAD)
				vres2 = VRES_QUAD;

			var start = hsyncstartpos; //hbstrt;
			var stop = hsyncendpos; //hbstop;

			gfxvidinfo.drawbuffer.inwidth = ((maxhpos - (maxhpos - start + DISPLAY_LEFT_SHIFT/2) + 1) * 2) << res2; //ATT ok, DISPLAY_LEFT_SHIFT/2 == 0x38/2
			gfxvidinfo.drawbuffer.inxoffset = stop * 2;

			gfxvidinfo.drawbuffer.extrawidth = 0;
			gfxvidinfo.drawbuffer.inwidth2 = gfxvidinfo.drawbuffer.inwidth;

			gfxvidinfo.drawbuffer.inheight = ((firstblankedline < maxvpos ? firstblankedline : maxvpos) - minfirstline + 1) << vres2;
			gfxvidinfo.drawbuffer.inheight2 = gfxvidinfo.drawbuffer.inheight;
		} else {
			gfxvidinfo.drawbuffer.inwidth = SAEC_Video_MAX_AMIGA_WIDTH << SAEV_config.video.hresolution;

			gfxvidinfo.drawbuffer.extrawidth = -1; //currprefs.gfx_extrawidth ? currprefs.gfx_extrawidth : -1; //OWN
			gfxvidinfo.drawbuffer.inwidth2 = gfxvidinfo.drawbuffer.inwidth;

			gfxvidinfo.drawbuffer.inheight = (maxvpos_display - minfirstline + 1) << SAEV_config.video.vresolution;
			gfxvidinfo.drawbuffer.inheight2 = gfxvidinfo.drawbuffer.inheight;
		}

		if (gfxvidinfo.drawbuffer.inwidth > gfxvidinfo.drawbuffer.width_allocated)
			gfxvidinfo.drawbuffer.inwidth = gfxvidinfo.drawbuffer.width_allocated;
		if (gfxvidinfo.drawbuffer.inwidth2 > gfxvidinfo.drawbuffer.width_allocated)
			gfxvidinfo.drawbuffer.inwidth2 = gfxvidinfo.drawbuffer.width_allocated;

		if (gfxvidinfo.drawbuffer.inheight > gfxvidinfo.drawbuffer.height_allocated)
			gfxvidinfo.drawbuffer.inheight = gfxvidinfo.drawbuffer.height_allocated;
		if (gfxvidinfo.drawbuffer.inheight2 > gfxvidinfo.drawbuffer.height_allocated)
			gfxvidinfo.drawbuffer.inheight2 = gfxvidinfo.drawbuffer.height_allocated;

		gfxvidinfo.drawbuffer.outwidth = gfxvidinfo.drawbuffer.inwidth;
		gfxvidinfo.drawbuffer.outheight = gfxvidinfo.drawbuffer.inheight;

		if (gfxvidinfo.drawbuffer.outwidth > gfxvidinfo.drawbuffer.width_allocated)
			gfxvidinfo.drawbuffer.outwidth = gfxvidinfo.drawbuffer.width_allocated;

		if (gfxvidinfo.drawbuffer.outheight > gfxvidinfo.drawbuffer.height_allocated)
			gfxvidinfo.drawbuffer.outheight = gfxvidinfo.drawbuffer.height_allocated;

		//memset(line_decisions, 0, sizeof line_decisions);
		//for (i = 0; i < sizeof (line_decisions) / sizeof *line_decisions; i++) line_decisions[i].plfleft = -2;
		for (i = 0; i < line_decisions.length; i++) {
			line_decisions[i].clr();
			line_decisions[i].plfleft = -2;
		}
		//memset(line_drawinfo, 0, sizeof line_drawinfo);
		for (i = 0; i < line_drawinfo[0].length; i++) {
			line_drawinfo[0][i].clr();
			line_drawinfo[1][i].clr();
		}

		compute_vsynctime();

		hblank_hz = (SAEV_config.chipset.ntsc ? SAEC_Playfield_CLOCK_NTSC : SAEC_Playfield_CLOCK_PAL) / (maxhpos + (islinetoggle() ? 0.5 : 0));

		SAEF_log("playfield.compute_framesync() %s mode%s%s V=%.4fHz H=%0.4fHz (%dx%d+%d) IDX=%d (%s) DSP=%d RTG=%d/%d",
			isntsc ? "NTSC" : "PAL",
			islace ? " lace" : (lof_lace ? " loflace" : ""),
			doublescan > 0 ? " dblscan" : "",
			vblank_hz,
			hblank_hz,
			maxhpos, maxvpos, lof_store ? 1 : 0,
			cr !== null ? cr.index : -1,
			cr !== null && cr.label.length ? cr.label : "<?>",
			SAEV_config.video.apmode[SAEV_Playfield_picasso_on ? 1 : 0].gfx_display,
			SAEV_Playfield_picasso_on?1:0, SAEV_Playfield_picasso_requested_on?1:0
		);

		//set_config_changed(); //OWN
		if (SAER.video.target_graphics_buffer_update())
			reset_drawing();
	}

	/* set PAL/NTSC or custom timing variables */
	function init_hz(checkvposw) {
		var isntsc, islace;
		var odbl = doublescan, omaxvpos = maxvpos;
		var ovblank = vblank_hz;
		var hzc = 0;

		if (!checkvposw)
			vpos_count = 0;

		vpos_count_diff = vpos_count;

		doublescan = 0;
		programmedmode = false;
		if ((beamcon0 & 0xA0) != (new_beamcon0 & 0xA0))
			hzc = 1;
		if (beamcon0 != new_beamcon0) {
			SAEF_log("playfield.init_hz() BEAMCON0 0x%04x -> 0x%04x", beamcon0, new_beamcon0);
			vpos_count_diff = vpos_count = 0;
		}
		beamcon0 = new_beamcon0;
		isntsc = (beamcon0 & 0x20) ? 0 : 1;
		islace = (interlace_seen) ? 1 : 0;
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS))
			isntsc = SAEV_config.chipset.ntsc ? 1 : 0;
		var clk = SAEV_config.chipset.ntsc ? SAEC_Playfield_CLOCK_NTSC : SAEC_Playfield_CLOCK_PAL;
		if (!isntsc) {
			maxvpos = MAXVPOS_PAL;
			maxhpos = MAXHPOS_PAL;
			minfirstline = VBLANK_ENDLINE_PAL;
			vblank_hz_nom = vblank_hz = VBLANK_HZ_PAL;
			sprite_vblank_endline = VBLANK_SPRITE_PAL;
			equ_vblank_endline = EQU_ENDLINE_PAL;
			equ_vblank_toggle = true;
			vblank_hz_shf = clk / ((maxvpos + 0) * maxhpos);
			vblank_hz_lof = clk / ((maxvpos + 1) * maxhpos);
			vblank_hz_lace = clk / ((maxvpos + 0.5) * maxhpos);
		} else {
			maxvpos = MAXVPOS_NTSC;
			maxhpos = MAXHPOS_NTSC;
			minfirstline = VBLANK_ENDLINE_NTSC;
			vblank_hz_nom = vblank_hz = VBLANK_HZ_NTSC;
			sprite_vblank_endline = VBLANK_SPRITE_NTSC;
			equ_vblank_endline = EQU_ENDLINE_NTSC;
			equ_vblank_toggle = false;
			vblank_hz_shf = clk / ((maxvpos + 0) * (maxhpos + 0.5));
			vblank_hz_lof = clk / ((maxvpos + 1) * (maxhpos + 0.5));
			vblank_hz_lace = clk / ((maxvpos + 0.5) * (maxhpos + 0.5));
		}

		maxvpos_nom = maxvpos;
		maxvpos_display = maxvpos;
		if (vpos_count > 0) {
			// we come here if vpos_count != maxvpos and beamcon0 didn"t change (someone poked VPOSW)
			if (vpos_count < 10)
				vpos_count = 10;
			vblank_hz = (isntsc ? 15734.0 : 15625.0) / vpos_count;
			vblank_hz_nom = vblank_hz_shf = vblank_hz_lof = vblank_hz_lace = vblank_hz;
			maxvpos_nom = vpos_count - (lof_current ? 1 : 0);
			if ((maxvpos_nom >= 256 && maxvpos_nom <= 313) || (beamcon0 & 0x80)) {
				maxvpos_display = maxvpos_nom;
			} else if (maxvpos_nom < 256) {
				maxvpos_display = 255;
			} else {
				maxvpos_display = 313;
			}
			reset_drawing();
		} else if (vpos_count == 0) {
			// mode reset
			vpos_count = maxvpos;
			vpos_count_diff = maxvpos;
		}
		firstblankedline = maxvpos + 1;

		if (beamcon0 & 0x80) {
			// programmable scanrates (ECS Agnus)
			if (vtotal >= MAXVPOS)
				vtotal = MAXVPOS - 1;
			maxvpos = vtotal + 1;
			firstblankedline = maxvpos + 1;
			if (htotal >= MAXHPOS)
				htotal = MAXHPOS - 1;
			maxhpos = htotal + 1;
			vblank_hz_nom = vblank_hz = 227.0 * 312.0 * 50.0 / (maxvpos * maxhpos);
			vblank_hz_shf = vblank_hz;
			vblank_hz_lof = 227.0 * 313.0 * 50.0 / (maxvpos * maxhpos);
			vblank_hz_lace = 227.0 * 312.5 * 50.0 / (maxvpos * maxhpos);

			if ((beamcon0 & 0x1000) && (beamcon0 & 0x0200)) { // VARVBEN + VARVSYEN
				minfirstline = vsstop > vbstop ? vsstop : vbstop;
				if (minfirstline > maxvpos >> 1) //OWN / 2
					minfirstline = vsstop > vbstop ? vbstop : vsstop;
				firstblankedline = vbstrt;
			} else if (beamcon0 & 0x0200) {
				minfirstline = vsstop;
				if (minfirstline > maxvpos >> 1) //OWN / 2
					minfirstline = 0;
			} else if (beamcon0 & 0x1000) {
				minfirstline = vbstop;
				if (minfirstline > maxvpos >> 1) //OWN / 2
					minfirstline = 0;
				firstblankedline = vbstrt;
			}

			if (minfirstline < 2)
				minfirstline = 2;
			if (minfirstline >= maxvpos)
				minfirstline = maxvpos - 1;

			if (firstblankedline < minfirstline)
				firstblankedline = maxvpos + 1;

			sprite_vblank_endline = minfirstline - 2;
			maxvpos_nom = maxvpos;
			maxvpos_display = maxvpos;
			equ_vblank_endline = -1;
			doublescan = htotal <= 164 && vtotal >= 350 ? 1 : 0;
			// if superhires and wide enough: not doublescan
			if (doublescan && htotal >= 140 && (bplcon0 & 0x0040))
				doublescan = 0;
			programmedmode = true;
			varsync_changed = true;
			vpos_count = maxvpos_nom;
			vpos_count_diff = maxvpos_nom;
			hzc = 1;
		}
		if (maxvpos_nom >= MAXVPOS)
			maxvpos_nom = MAXVPOS;
		if (maxvpos_display >= MAXVPOS)
			maxvpos_display = MAXVPOS;
		if (SAEV_config.video.scandoubler && doublescan == 0)
			doublescan = -1;
		if (doublescan != odbl || maxvpos != omaxvpos)
			hzc = 1;
		/* limit to sane values */
		if (vblank_hz < 10)
			vblank_hz = 10;
		if (vblank_hz > 300)
			vblank_hz = 300;
		maxhpos_short = maxhpos;
		set_delay_lastcycle();
		if ((beamcon0 & 0x80) && (beamcon0 & 0x0100)) {
			hsyncstartpos = hsstrt;
			hsyncendpos = hsstop;

			if ((bplcon0 & 1) && (bplcon3 & 1)) {
				if (hbstrt > maxhpos >> 1) { //OWN / 2
					if (hsyncstartpos < hbstrt)
						hsyncstartpos = hbstrt;
				} else {
					if (hsyncstartpos > hbstrt)
						hsyncstartpos = hbstrt;
				}
				if (hbstop > maxhpos >> 1) { //OWN / 2
					if (hsyncendpos > hbstop)
						hsyncendpos = hbstop;
				} else {
					if (hsyncendpos < hbstop)
						hsyncendpos = hbstop;
				}
			}
			if (hsyncstartpos < hsyncendpos)
				hsyncstartpos = maxhpos + hsyncstartpos;

			hsyncendpos--;

			if (hsyncendpos < 2)
				hsyncendpos = 2;
		} else {
			hsyncstartpos = maxhpos_short + 13;
			hsyncendpos = 24;
		}
		hpos_offset = 0;
		SAER_Events_eventtab[SAEC_Events_EV_HSYNC].oldcycles = SAEV_Events_currcycle;
		SAER_Events_eventtab[SAEC_Events_EV_HSYNC].evtime = SAEV_Events_currcycle + maxhpos * SAEC_Events_CYCLE_UNIT; //HSYNCTIME();
		SAER.events.schedule();
		if (hzc) {
			interlace_seen = islace;
			reset_drawing();
		}

		maxvpos_total = (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) ? (MAXVPOS_LINES_ECS - 1) : (MAXVPOS_LINES_OCS - 1);
		if (maxvpos_total > MAXVPOS)
			maxvpos_total = MAXVPOS;

		/*#ifdef PICASSO96
		if (!p96refresh_active) {
			maxvpos_stored = maxvpos;
			maxhpos_stored = maxhpos;
			vblank_hz_stored = vblank_hz;
		}
		#endif*/

		compute_framesync();

		/*#ifdef PICASSO96
		init_hz_p96();
		#endif*/

		if (vblank_hz != ovblank)
			SAER.video.updatedisplayarea();

		//inputdevice_tablet_strobe(); //OWN

		if (varsync_changed) {
			varsync_changed = false;
			//dumpsync();
		}
	}
	function init_hz_vposw() {
		init_hz(true);
	}
	function init_hz_normal() {
		init_hz(false);
	}



	/*
	0 0 -
	1 1 --
	2 2 -
	3 3 --
	4 4 -
	5 5 --

	0 x -+
	1 0 --
	2 1 -
	3 2 --
	4 3 -
	5 4 --
	*/
	function hsync_scandoubler() {
		if (lof_store && vpos >= maxvpos_nom - 1)
			return;

		next_lineno++;
		scandoubled_line = 1;

		var bpltmp = new Array(8);
		var bpltmpx = new Array(8);
		var i;

		for (i = 0; i < 8; i++) {
			bpltmp[i] = bplpt[i];
			bpltmpx[i] = bplptx[i];
			if (prevbpl[lof_store][vpos][i] && prevbpl[1 - lof_store][vpos][i]) {
				var diff = prevbpl[lof_store][vpos][i] - prevbpl[1 - lof_store][vpos][i];
				if (lof_store) {
					if (bplcon0 & 4)
						bplpt[i] = prevbpl[lof_store][vpos][i] - diff;
				} else {
					if (bplcon0 & 4)
						bplpt[i] = prevbpl[lof_store][vpos][i];
					else
						bplpt[i] = bplpt[i] - diff;

				}
			}
		}

		reset_decisions();
		plf_state = plf_idle;
		plfr_state = plfr_idle;

		// copy color changes
		var dip1 = curr_drawinfo[next_lineno - 1];
		for (var idx1 = dip1.first_color_change; idx1 < dip1.last_color_change; idx1++) {
			var cs2 = curr_color_changes[idx1];
			var regno = cs2.regno;
			var hpos = cs2.linepos;
			if (regno < 0x1000 && hpos < HBLANK_OFFSET && !(beamcon0 & 0x80) && prev_lineno >= 0) {
				var pdip = curr_drawinfo[next_lineno - 1];
				var idx = pdip.last_color_change;
				pdip.last_color_change++;
				pdip.nr_color_changes++;
				curr_color_changes[idx].linepos = hpos + maxhpos + 1;
				curr_color_changes[idx].regno = regno;
				curr_color_changes[idx].value = cs2.value;
				curr_color_changes[idx + 1].regno = -1;
			} else {
				var cs1 = curr_color_changes[next_color_change];
				cpy_color_change(cs1, cs2); //memcpy(cs1, cs2, sizeof (struct color_change));
				next_color_change++;
			}
		}
		curr_color_changes[next_color_change].regno = -1;

		finish_decisions();
		hsync_record_line_state(next_lineno, nln_normal, thisline_changed);
		hardware_line_completed(next_lineno);
		scandoubled_line = 0;

		for (i = 0; i < 8; i++) {
			bplpt[i] = bpltmp[i];
			bplptx[i] = bpltmpx[i];
		}
	}

	// vsync functions that are not hardware timing related
	function vsync_handler_pre() {
		if (SAEV_Events_bogusframe > 0) SAEV_Events_bogusframe--;

		/*while (handle_events()) {
			// we are paused, do all config checks but don't do any emulation
			if (vsync_handle_check()) {
				redraw_frame();
				SAER.video.render_screen(true);
				SAER.video.show_screen(0);
			}
			config_check_vsync();
		}*/

		if (SAEV_command > 0) {
			//prevent possible infinite loop at wait_cycles()
			framecnt = 0;
			reset_decisions();
			return;
		}

		//config_check_vsync();

		if (timehack_alive > 0) timehack_alive--;

		SAER.devices.vsync_pre();

		/*#ifdef PICASSO96
		if (isvsync_rtg() >= 0)
			rtg_vsync();
		#endif*/

		if (!vsync_rendered) {
			var start = SAEF_now();
			vsync_handle_redraw(lof_store, lof_changed, bplcon0, bplcon3);
			vsync_rendered = true;
			SAEV_Events_frameskiptime += SAEF_now() - start;
		}

		var frameok = SAER.events.framewait();

		if (!SAEV_Playfield_picasso_on) {
			if (!SAEV_Playfield_frame_rendered && vblank_hz_state)
				SAEV_Playfield_frame_rendered = SAER.video.render_screen(false);
			if (SAEV_Playfield_frame_rendered && !SAEV_Playfield_frame_shown)
				SAEV_Playfield_frame_shown = SAER.video.show_screen_maybe(isvsync_chipset() >= 0);
		}

		 SAER.events.fpscounter(frameok);

		vsync_rendered = false;
		SAEV_Playfield_frame_shown = false;
		SAEV_Playfield_frame_rendered = false;

		if (vblank_hz_mult > 0)
			vblank_hz_state ^= 1;
		else
			vblank_hz_state = 1;

		vsync_handle_check();

		/*#if 0
		checklacecount (bplcon0_interlace_seen || lof_lace);
		#endif*/
	}

	// emulated hardware vsync
	function vsync_handler_post() {
		/*static frame_time_t prevtime;
		SAEF_log("playfield.vsync_handler_post() %d %d %d", vsynctimebase, SAEF_now () - vsyncmintime, SAEF_now () - prevtime);
		var prevtime = SAEF_now();*/

		//if ((SAEV_Custom_intreq & 0x0020) && (SAEV_Custom_intena & 0x0020)) SAEF_warn("playfield.vsync_handler_post() vblank interrupt not cleared");

		SAER.disk.vsync();

		if (bplcon0 & 4) {
			lof_store = lof_store ? 0 : 1;
		}
		if ((bplcon0 & 2) && SAEV_config.chipset.genlock) {
			genlockvtoggle = lof_store ? 1 : 0;
		}

		if (lof_prev_lastline != lof_lastline) {
			if (lof_togglecnt_lace < LOF_TOGGLES_NEEDED)
				lof_togglecnt_lace++;
			if (lof_togglecnt_lace >= LOF_TOGGLES_NEEDED)
				lof_togglecnt_nlace = 0;
		} else {
			// only 1-2 vblanks with bplcon0 lace bit set?
			// lets check if lof has changed
			if (!(bplcon0 & 4) && lof_togglecnt_lace > 0 && lof_togglecnt_lace < LOF_TOGGLES_NEEDED && !interlace_seen) {
				lof_changed = 1;
			}
			lof_togglecnt_nlace = LOF_TOGGLES_NEEDED;
			lof_togglecnt_lace = 0;
			/*#if 0
			if (lof_togglecnt_nlace < LOF_TOGGLES_NEEDED)
				lof_togglecnt_nlace++;
			if (lof_togglecnt_nlace >= LOF_TOGGLES_NEEDED)
				lof_togglecnt_lace = 0;
			#endif*/
		}
		lof_prev_lastline = lof_lastline;
		lof_current = lof_store;
		if (lof_togglecnt_lace >= LOF_TOGGLES_NEEDED) {
			interlace_changed = notice_interlace_seen(true);
			if (interlace_changed) {
				notice_screen_contents_lost();
			}
		} else if (lof_togglecnt_nlace >= LOF_TOGGLES_NEEDED) {
			interlace_changed = notice_interlace_seen(false);
			if (interlace_changed) {
				notice_screen_contents_lost();
			}
		}
		if (lof_changing) {
			// still same? Trigger change now.
			if ((!lof_store && lof_changing < 0) || (lof_store && lof_changing > 0)) {
				lof_changed_previous_field++;
				lof_changed = 1;
				// lof toggling? decide as interlace.
				if (lof_changed_previous_field >= LOF_TOGGLES_NEEDED) {
					lof_changed_previous_field = LOF_TOGGLES_NEEDED;
					if (lof_lace == false)
						lof_lace = true;
					else
						lof_changed = 0;
				}
				if (bplcon0 & 4)
					lof_changed = 0;
			}
			lof_changing = 0;
		} else {
			lof_changed_previous_field = 0;
			lof_lace = false;
		}

		/*#ifdef PICASSO96
		if (p96refresh_active) {
			vpos_count = p96refresh_active;
			vtotal = vpos_count;
		}
		#endif*/

		SAER.devices.vsync_post();

		if (varsync_changed || (beamcon0 & (0x10 | 0x20 | 0x80 | 0x100 | 0x200)) != (new_beamcon0 & (0x10 | 0x20 | 0x80 | 0x100 | 0x200)))
			init_hz_normal();
		else if (vpos_count > 0 && Math.abs(vpos_count - vpos_count_diff) > 1 && vposw_change < 4)
			init_hz_vposw();
		else if (interlace_changed || changed_chipset_refresh() || lof_changed)
			compute_framesync();

		lof_changed = 0;
		vposw_change = 0;
		bplcon0_interlace_seen = false;

		SAER.copper.COPJMP(1, 1);

		init_hardware_frame();
	}

	/*function copper_check(n) {
		const COP_wait = 8;
		if (SAER_Copper_cop_state.state == COP_wait) {
			var vp = vpos & (((SAER_Copper_cop_state.saved_i2 >> 8) & 0x7F) | 0x80);
			if (vp < SAER_Copper_cop_state.vcmp) {
				if (SAEV_Copper_enabled_thisline)
					SAEF_error("playfield.copper_check() bug %d: vp=%d vpos=%d vcmp=%d thisline=%d", n, vp, vpos, SAER_Copper_cop_state.vcmp, SAEV_Copper_enabled_thisline);
			}
		}
	}*/

	// OPT inline
	function set_hpos() {
		maxhpos = maxhpos_short + lol;
		hpos_offset = 0;
		SAER_Events_eventtab[SAEC_Events_EV_HSYNC].evtime = SAEV_Events_currcycle + maxhpos * SAEC_Events_CYCLE_UNIT; //HSYNCTIME();
		SAER_Events_eventtab[SAEC_Events_EV_HSYNC].oldcycles = SAEV_Events_currcycle;
	}

	// this finishes current line
	function hsync_handler_pre(onvsync) {
		var hpos = SAER.events.current_hpos();

		if (!nocustom()) {
			SAER.copper.sync_copper_with_cpu(maxhpos, 0);

			const COP_read2 = 3;
			// Seven Seas scrolling quick fix hack checks if copper is going to modify BPLCON1 in next cycle.
			if (SAEV_Copper_enabled_thisline && SAER_Copper_cop_state.state == COP_read2 && (SAER_Copper_cop_state.i1 & 0x1fe) == 0x102) {
				// it did, pre-load value for Denise shifter emulation
				hpos_is_zero_bplcon1_hack = SAER_Memory_chipGet16_indirect(SAER_Copper_cop_state.ip);
				// following finish_decision() is going to finish this line it is too late when copper actually does the move
			}

			finish_decisions();
			if (thisline_decision.plfleft >= 0) {
				if (SAEV_config.chipset.colLevel > SAEC_Config_Chipset_ColLevel_Sprite_Sprite)
					do_sprite_collisions();
				if (SAEV_config.chipset.colLevel > SAEC_Config_Chipset_ColLevel_Sprite_Playfield)
					do_playfield_collisions();
			}
			hsync_record_line_state(next_lineno, nextline_how, thisline_changed);
			// reset light pen latch
			if (vpos == sprite_vblank_endline) {
				lightpen_triggered = 0;
				sprite_0 = 0;
			}
			if (lightpen_enabled && lightpen_cx > 0 && (bplcon0 & 8) && !lightpen_triggered && lightpen_cy == vpos) {
				vpos_lpen = vpos;
				hpos_lpen = lightpen_cx;
				lightpen_triggered = 1;
			}
			hardware_line_completed(next_lineno);
			if (doflickerfix() && interlace_seen > 0)
				hsync_scandoubler();

			notice_resolution_seen(GET_RES_AGNUS(bplcon0), interlace_seen != 0);
		}

		SAER.devices.hsync(onvsync);

		SAEV_Events_hsync_counter++;

		//refptr += 0x0200 * 4;
		//refptr_val += 0x0200 * 4;
		refptr += 0x0800; if (refptr > 0xffff) refptr -= 0x10000;
		refptr_val += 0x0800; if (refptr_val > 0xffffffff) refptr_val -= 0x100000000;

		if (islinetoggle())
			lol ^= 1;
		else
			lol = 0;

		vpos++;
		vpos_count++;
		if (vpos >= maxvpos_total)
			vpos = 0;
		if (onvsync) {
			vpos = 0;
			SAEV_Events_vsync_counter++;
		}

		set_hpos();
		/*{
			maxhpos = maxhpos_short + lol;
			hpos_offset = 0;
			SAER_Events_eventtab[SAEC_Events_EV_HSYNC].evtime = SAEV_Events_currcycle + maxhpos * SAEC_Events_CYCLE_UNIT; //HSYNCTIME();
			SAER_Events_eventtab[SAEC_Events_EV_HSYNC].oldcycles = SAEV_Events_currcycle;
		}*/
	}

	function is_last_line() {
		return vpos + 1 == maxvpos + lof_store;
	}

	// this prepares for new line
	var cia_hsync = 0; //int
	function hsync_handler_post(onvsync) {
		SAEV_Copper_last_hpos = 0;

		//#ifdef CPUEMU_13
		//if (SAEV_config.chipset.blitter.cycle_exact)
		//	SAER_Events_cycle_line.clr();
		//#endif

		// genlock active:
		// vertical: interlaced = toggles every other field, non-interlaced = both fields (normal)
		// horizontal: PAL = every line, NTSC = every other line
		genlockhtoggle = !genlockhtoggle;
		var ciahsyncs = !(bplcon0 & 2) || ((bplcon0 & 2) && SAEV_config.chipset.genlock && (!SAEV_config.chipset.ntsc || genlockhtoggle));
		var ciavsyncs = !(bplcon0 & 2) || ((bplcon0 & 2) && SAEV_config.chipset.genlock && genlockvtoggle);

		SAER.cia.hsync_post(ciahsyncs);
		if (ciahsyncs) {
			if (beamcon0 & (0x80 | 0x100)) {
				if (hsstop < (maxhpos & ~1) && hsstrt < maxhpos)
					SAER.cia.b_tod_handler(hsstop);
			} else
				SAER.cia.b_tod_handler(18);
		}
		if (SAEV_config.chipset.cia.tod != SAEC_Config_Chipset_CIA_TOD_VSync) {
			/*#if 0
			static uae_s32 oldtick;
			uae_s32 tick = read_system_time (); // milliseconds
			int ms = 1000 / (SAEV_config.chipset.cia.tod == SAEC_Config_Chipset_CIA_TOD_60Hz ? 60 : 50);
			if (tick - oldtick > 2000 || tick - oldtick < -2000) {
				oldtick = tick - ms;
			}
			if (tick - oldtick >= ms) {
				CIA_vsync_posthandler(1);
				oldtick += ms;
			}
			#else*/
			//static int cia_hsync;
			if (cia_hsync < maxhpos) {
				SAER.cia.a_tod_inc(cia_hsync);
				var newcount = (vblank_hz * (2 * maxvpos + (interlace_seen ? 1 : 0)) * (2 * maxhpos + (islinetoggle() ? 1 : 0))) / ((SAEV_config.chipset.cia.tod == SAEC_Config_Chipset_CIA_TOD_60Hz ? 60 : 50) * 4) >>> 0;
				cia_hsync += newcount;
			} else
				cia_hsync -= maxhpos;
			//#endif
		} else if (SAEV_config.chipset.cia.tod == SAEC_Config_Chipset_CIA_TOD_VSync && ciavsyncs) {
			// CIA-A TOD counter increases when vsync pulse ends
			if (beamcon0 & (0x80 | 0x200)) {
				if (vpos == vsstop && vsstrt <= maxvpos)
					SAER.cia.a_tod_inc(lof_store ? hsstop : hsstop + hcenter);
			} else {
				if (vpos == (SAEV_config.chipset.ntsc ? VSYNC_ENDLINE_NTSC : VSYNC_ENDLINE_PAL)) {
					SAER.cia.a_tod_inc(lof_store ? 132 : 18);
				}
			}
		}

		SAER.input.hsync(); //EMPTY

		if (!nocustom()) {
			if (!SAEV_config.chipset.blitter.cycle_exact && SAEV_Blitter_bltstate != SAEC_Blitter_bltstate_DONE && SAEF_Custom_dmaen(SAEC_Custom_DMAF_BPLEN) && diwstate == DIW_WAITING_STOP) {
				SAER.blitter.blitter_slowdown(thisline_decision.plfleft, thisline_decision.plfright - (16 << fetchmode),
					cycle_diagram_total_cycles[fetchmode][GET_RES_AGNUS(bplcon0)][GET_PLANES_LIMIT(bplcon0)],
					cycle_diagram_free_cycles[fetchmode][GET_RES_AGNUS(bplcon0)][GET_PLANES_LIMIT(bplcon0)]);
			}
		}

		if (onvsync) {
			// vpos_count >= MAXVPOS just to not crash if VPOSW writes prevent vsync completely
			if ((bplcon0 & 8) && !lightpen_triggered) {
				vpos_lpen = vpos - 1;
				hpos_lpen = maxhpos;
				lightpen_triggered = 1;
			}
			vpos = 0;
			vsync_handler_post();
			vpos_count = 0;
		}
		// A1000 DIP Agnus (8361): vblank interrupt is triggered on line 1!
		if (SAEV_config.chipset.agnusDIP) {
			if (vpos == 1)
				SAER.custom.send_interrupt(SAEC_Custom_INTF_VERTB, 1 * SAEC_Events_CYCLE_UNIT);
		} else {
			if (vpos == 0)
				SAER.custom.send_interrupt(SAEC_Custom_INTF_VERTB, 1 * SAEC_Events_CYCLE_UNIT);
		}

		// lastline - 1?
		if (vpos + 1 == maxvpos + lof_store || vpos + 1 == maxvpos + lof_store + 1)
			lof_lastline = lof_store != 0;

		//#ifdef CPUEMU_13
		/*if (SAEV_config.chipset.blitter.cycle_exact) {
			var hp = maxhpos - 1;
			for (var i = 0; i < 4; i++) {
				SAER.events.alloc_cycle(hp, i == 0 ? SAEC_Events_cycle_line_STROBE : SAEC_Events_cycle_line_REFRESH);
				hp += 2;
				if (hp >= maxhpos)
					hp -= maxhpos;
			}
		}*/
		//#endif

		SAER.events.events_dmal_hsync();

		/*#if 0
		// AF testing stuff
		static int cnt = 0;
		cnt++;
		if (cnt == 500) {
			int port_insert_custom (int inputmap_port, int devicetype, DWORD flags, const TCHAR *custom);
			//port_insert_custom (0, 2, 0, "Left=0xCB Right=0xCD Up=0xC8 Down=0xD0 Fire=0x39 Fire.autorepeat=0xD2");
			port_insert_custom (1, 2, 0, "Left=0x1E Right=0x20 Up=0x11 Down=0x1F Fire=0x38");
		} else if (0 && cnt == 1000) {
			TCHAR out[256];
			bool port_get_custom (int inputmap_port, TCHAR *out);
			port_get_custom (0, out);
			port_get_custom (1, out);
		}
		#endif*/

		if (SAEV_config.cpu.speed < 0)
			SAER.events.framewait2_maximum(is_last_line());
		else {
			if (vpos + 1 < maxvpos + lof_store && (vpos == (maxvpos_display * 1 / 3) >>> 0 || vpos == (maxvpos_display * 2 / 3) >>> 0))
				SAER.events.framewait2_normal();
		}

		if (!nocustom()) {
			var lineno = vpos;
			if (lineno >= MAXVPOS)
				lineno %= MAXVPOS;
			nextline_how = nln_normal;
			if (doflickerfix() && interlace_seen > 0) {
				lineno *= 2;
			} else if (!interlace_seen && doublescan <= 0 && SAEV_config.video.vresolution && SAEV_config.video.pscanlines > 1) {
				lineno *= 2;
				if (SAEV_Events_timeframes & 1) {
					lineno++;
					nextline_how = SAEV_config.video.pscanlines == 3 ? nln_lower_black_always : nln_lower_black;
				} else {
					nextline_how = SAEV_config.video.pscanlines == 3 ? nln_upper_black_always : nln_upper_black;
				}
			} else if ((doublescan <= 0 || interlace_seen > 0) && SAEV_config.video.vresolution && SAEV_config.video.iscanlines) {
				lineno *= 2;
				if (interlace_seen) {
					if (!lof_current) {
						lineno++;
						nextline_how = SAEV_config.video.iscanlines == 2 ? nln_lower_black_always : nln_lower_black;
					} else {
						nextline_how = SAEV_config.video.iscanlines == 2 ? nln_upper_black_always : nln_upper_black;
					}
				} else {
					nextline_how = SAEV_config.video.vresolution > SAEC_Config_Video_VResolution_NonDouble && SAEV_config.video.pscanlines == 1 ? nln_nblack : nln_doubled;
				}
			} else if (SAEV_config.video.vresolution && (doublescan <= 0 || interlace_seen > 0)) {
				lineno *= 2;
				if (interlace_seen) {
					if (!lof_current) {
						lineno++;
						nextline_how = nln_lower;
					} else {
						nextline_how = nln_upper;
					}
				} else {
					nextline_how = SAEV_config.video.vresolution > SAEC_Config_Video_VResolution_NonDouble && SAEV_config.video.pscanlines == 1 ? nln_nblack : nln_doubled;
				}
			}
			prev_lineno = next_lineno;
			next_lineno = lineno;
			reset_decisions();
		}

		/* Default to no bitplane DMA overriding sprite DMA */
		plfstrt_sprite = 0xff;
		/* See if there"s a chance of a copper wait ending this line.  */
		SAER_Copper_cop_state.hpos = 0;
		SAER.copper.compute_spcflag_copper(maxhpos);
		//copper_check(2);

		if (GET_PLANES (bplcon0) > 0 && SAEF_Custom_dmaen(SAEC_Custom_DMAF_BPLEN)) {
			if (first_bplcon0 == 0)
				first_bplcon0 = bplcon0;
			if (vpos > last_planes_vpos)
				last_planes_vpos = vpos;
			if (vpos >= minfirstline && first_planes_vpos == 0) {
				first_planes_vpos = vpos > minfirstline ? vpos - 1 : vpos;
			} else if (vpos >= current_maxvpos() - 1) {
				last_planes_vpos = current_maxvpos();
			}
		}
		if (diw_change == 0) {
			if (vpos >= first_planes_vpos && vpos <= last_planes_vpos) {
				if (diwlastword > diwlastword_total) {
					diwlastword_total = diwlastword;
					if (diwlastword_total > coord_diw_to_window_x(hsyncstartpos * 2))
						diwlastword_total = coord_diw_to_window_x(hsyncstartpos * 2);
				}
				if (diwfirstword < diwfirstword_total) {
					diwfirstword_total = diwfirstword;
					if (diwfirstword_total < coord_diw_to_window_x(hsyncendpos * 2))
						diwfirstword_total = coord_diw_to_window_x(hsyncendpos * 2);
					firstword_bplcon1 = bplcon1;
				}
			}
			if (diwstate == DIW_WAITING_STOP) {
				var f = 8 << fetchmode;
				if (plfstrt + f < ddffirstword_total + f)
					ddffirstword_total = plfstrt + f;
				if (plfstop + 2 * f > ddflastword_total + 2 * f)
					ddflastword_total = plfstop + 2 * f;
			}
			if ((plffirstline < plffirstline_total || (plffirstline_total == minfirstline && vpos > minfirstline)) && plffirstline < vpos >> 1) { //ORG / 2
				firstword_bplcon1 = bplcon1;
				if (plffirstline < minfirstline)
					plffirstline_total = minfirstline;
				else
					plffirstline_total = plffirstline;
			}
			if (plflastline > plflastline_total && plflastline > plffirstline_total && plflastline > maxvpos >> 1) //ORG / 2
				plflastline_total = plflastline;
		}
		if (diw_change > 0)
			diw_change--;

		/* fastest possible + last line and no vflip wait: render the frame as early as possible */
		if (is_last_line() && isvsync_chipset() <= -2 && !vsync_rendered && SAEV_config.video.apmode[0].gfx_vflip == 0) {
			var start = SAEF_now();
			vsync_handle_redraw(lof_store, lof_changed, bplcon0, bplcon3);
			vsync_rendered = true;
			if (vblank_hz_state)
				SAEV_Playfield_frame_rendered = SAER.video.render_screen(true);
			SAEV_Events_frameskiptime += SAEF_now() - start;
		}

		//rtg_vsynccheck();
	}

	function is_custom_vsync() {
		var vp = vpos + 1;
		var vpc = vpos_count + 1;
		/* Agnus vpos counter keeps counting until it wraps around if VPOSW writes put it past maxvpos */
		if (vp >= maxvpos_total)
			vp = 0;
		if (vp == maxvpos + lof_store || vp == maxvpos + lof_store + 1 || vpc >= MAXVPOS) {
			/* vpos_count >= MAXVPOS just to not crash if VPOSW writes prevent vsync completely */
			return true;
		}
		return false;
	}
	this.hsync_handler = function() {
		var vs = is_custom_vsync();
		hsync_handler_pre(vs);
		if (vs) {
			vsync_handler_pre();

			/* OWN ATT break the mainloop every vsync for a javascript-reflow */
			SAEF_setSpcFlags(SAEC_spcflag_BRK);
		}
		hsync_handler_post(vs);
	}

	/*-----------------------------------------------------------------------*/
	/* SECT diw */

	function calcdiw() {
		var hstrt = diwstrt & 0xFF;
		var hstop = diwstop & 0xFF;
		var vstrt = diwstrt >> 8;
		var vstop = diwstop >> 8;

		// vertical in ECS Agnus
		if (diwhigh_written && (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS)) {
			vstrt |= (diwhigh & 7) << 8;
			vstop |= ((diwhigh >> 8) & 7) << 8;
		} else {
			if ((vstop & 0x80) == 0)
				vstop |= 0x100;
		}
		// horizontal in ECS Denise
		if (diwhigh_written && (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE)) {
			hstrt |= ((diwhigh >> 5) & 1) << 8;
			hstop |= ((diwhigh >> 13) & 1) << 8;
		} else {
			hstop += 0x100;
		}

		diw_hstrt = hstrt;
		diw_hstop = hstop;

		diwfirstword = coord_diw_to_window_x(hstrt);
		diwlastword = coord_diw_to_window_x(hstop);

		if (diwfirstword >= diwlastword) {
			diwfirstword = min_diwlastword;
			diwlastword = max_diwlastword();
		}
		if (diwfirstword < min_diwlastword)
			diwfirstword = min_diwlastword;

		if (vstrt == vpos && vstop != vpos && diwstate == DIW_WAITING_START) {
			// This may start BPL DMA immediately.
			line_cyclebased = 2; //SET_LINE_CYCLEBASED();
			bitplane_maybe_start_hpos = SAER.events.current_hpos();
		}

		plffirstline = vstrt;
		plflastline = vstop;

		plfstrt = ddfstrt - DDF_OFFSET;
		plfstop = ddfstop - DDF_OFFSET;

		diw_change = 2;
	}

	/* playfield code */
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/* SECT playfield read reg */

	/*this.DENISEID = function() {
		if (SAEV_config.chipset.deniseRev >= 0)
			return SAEV_config.chipset.deniseRev;
		//#ifdef AGA
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			if (SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A4000)
				return 0xFCF8;
			return 0x00F8;
		}
		//#endif
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE)
			return 0xFFFC;
		if (SAEV_config.cpu.model == SAEC_Config_CPU_Model_68000 && SAEV_config.cpu.compatible)
			return false;

		return 0xFFFF;
	}*/
	this.DENISEID = function() {
		if (SAEV_config.chipset.deniseRev >= 0)
			return SAEV_config.chipset.deniseRev;
		//#ifdef AGA
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			if (SAEV_config.chipset.ide == SAEC_Config_Chipset_IDE_A4000)
				return 0xFCF8;
			return 0x00F8;
		}
		//#endif
		return 0xFFFC;
	}

	function islightpentriggered() {
		if (beamcon0 & 0x2000) //LPENDIS
			return false;
		return lightpen_triggered > 0;
	}
	function issyncstopped() {
		return (bplcon0 & 2) != 0 && !SAEV_config.chipset.genlock;
	}
	function GETVPOS() {
		return islightpentriggered() ? vpos_lpen : (issyncstopped() ? vpos_previous : vpos);
	}
	function GETHPOS() {
		return islightpentriggered() ? hpos_lpen : (issyncstopped() ? hpos_previous : SAER.events.current_hpos());
	}

	// fake changing hpos when rom genlock test runs and genlock is connected
	function hsyncdelay() {
		if (!SAEV_config.chipset.genlock)
			return false;
		if (SAEV_config.cpu.speed >= 0)
			return false;
		if (bplcon0 == 0x102) //(0x0100 | 0x0002))
			return true;

		return false;
	}

	// DFF006 = 0.W must be valid result but better do this only in 68000 modes (whdload black screen!)
	// HPOS is shifted by 3 cycles and VPOS increases when shifted HPOS==1
	//#define CPU_ACCURATE (SAEV_config.cpu.model < SAEC_Config_CPU_Model_68020) //OPT inline, ok
	//#define HPOS_OFFSET (CPU_ACCURATE ? HPOS_SHIFT : 0) //OPT inline, ok
	//#define VPOS_INC_DELAY (HPOS_OFFSET ? 1 : 0) //OPT inline, ok

	this.VPOSR = function() {
		var csbit = 0;
		var vp = GETVPOS();
		var hp = GETHPOS();
		var lof = lof_store;

		if (vp + 1 == maxvpos + lof_store && (hp == maxhpos - 1 || hp == maxhpos - 2)) {
			// lof toggles 2 cycles before maxhpos, so do fake toggle here.
			//if ((bplcon0 & 4) && CPU_ACCURATE)
			if ((bplcon0 & 4) && cpu_accurate)
				lof = lof ? 0 : 1;
		}
		//if (hp + HPOS_OFFSET >= maxhpos + VPOS_INC_DELAY) { //ORG
		if (hp + (cpu_accurate ? HPOS_SHIFT : 0) >= maxhpos + (cpu_accurate ? 1 : 0)) { //OWN opt inline
			vp++;
			if (vp >= maxvpos + lof_store)
				vp = 0;
		}
		vp = (vp >> 8) & 7;

		if (SAEV_config.chipset.agnusRev >= 0) {
			csbit |= SAEV_config.chipset.agnusRev << 8;
		} else {
			//#ifdef AGA
			csbit |= (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) ? 0x2300 : 0;
			//#endif
			csbit |= (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) ? 0x2000 : 0;
			/*#if 0 //apparently "8372 (Fat-hr) (agnushr),rev 5" does not exist
			if (SAEV_config.memory.chipSize > 1024 * 1024 && (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS))
				csbit |= 0x2100;
			#endif*/
			if (SAEV_config.chipset.ntsc)
				csbit |= 0x1000;
		}

		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS))
			vp &= 1;
		vp |= (lof ? 0x8000 : 0) | csbit;
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS)
			vp |= lol ? 0x80 : 0;

		hsyncdelay();
		return vp;
	}
	this.VPOSW = function(v) {
		var oldvpos = vpos;

		if (lof_store != ((v & 0x8000) ? 1 : 0)) {
			lof_store = (v & 0x8000) ? 1 : 0;
			lof_changing = lof_store ? 1 : -1;
		}
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) {
			lol = (v & 0x0080) ? 1 : 0;
			if (!islinetoggle())
				lol = 0;
		}
		if (lof_changing)
			return;
		vpos &= 0x00ff;
		v &= 7;
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS))
			v &= 1;
		vpos |= v << 8;

		if (vpos != oldvpos)
			vposw_change++;
		if (vpos < oldvpos)
			vpos = oldvpos;
	}

	/*function vposback(oldvpos) {
		if (SAER_Copper_cop_state.state == COP_wait && oldvpos == SAER_Copper_cop_state.vcmp) {
			SAEV_Copper_enabled_thisline = 0;
			SAEF_clrSpcFlags(SAEC_spcflag_COPPER);
		}
	}*/
	this.VHPOSW = function(v) {
		var oldvpos = vpos;
		var changed = false;

		/* This is not that easy, need to decouple denise and paula hpos counters
		 * from master counter.
		 * All this just to fix Upfront-CoolFridge Smooth Copper part..
		 */
		/*#if 0
		if (oldhpos != newhpos) {
			oldhpos = SAER.events.current_hpos();
			int newhpos = v & 0xff;
			if (newhpos >= maxhpos)
				newhpos = maxhpos - 1;
			hpos_offset = newhpos - oldhpos;
			//SAER_Events_eventtab[SAEC_Events_EV_HSYNC].evtime = SAEV_Events_currcycle + HSYNCTIME() - (newhpos * SAEC_Events_CYCLE_UNIT);
			SAER_Events_eventtab[SAEC_Events_EV_HSYNC].evtime = SAEV_Events_currcycle + (maxhpos * SAEC_Events_CYCLE_UNIT) - (newhpos * SAEC_Events_CYCLE_UNIT);
			SAER_Events_eventtab[SAEC_Events_EV_HSYNC].oldcycles = SAEV_Events_currcycle - newhpos * SAEC_Events_CYCLE_UNIT;
			SAER.events.schedule();
			newhpos2 = SAER.events.current_hpos();
			#ifdef CPUEMU_13
			if (SAEV_config.chipset.blitter.cycle_exact) {
				//memset(cycle_line + newhpos, 0, maxhpos - newhpos);
				SAEF_memset(cycle_line,newhpos, 0, maxhpos - newhpos);
				for (i = newhpos; i < maxhpos; i++) SAER_Events_cycle_line[i] = 0;
				int hp = maxhpos - 1, i;
				for (i = 0; i < 4; i++) {
					SAER.events.alloc_cycle(hp, i == 0 ? SAEC_Events_cycle_line_STROBE : SAEC_Events_cycle_line_REFRESH);
					hp += 2;
					if (hp >= maxhpos)
						hp -= maxhpos;
				}
			}
			#endif
			vposw_change++;
			changed = true;
		}
		#endif*/

		v >>= 8;
		vpos &= 0xff00;
		vpos |= v;
		if (vpos != oldvpos && !changed)
			vposw_change++;
		if (vpos < oldvpos)
			vpos = oldvpos;
		else if (vpos < minfirstline && oldvpos < minfirstline)
			vpos = oldvpos;

		/*#if 0
		if (vpos < oldvpos) vposback (oldvpos);
		#endif*/
	}

	var vhposr_oldhp = 0; //u16
	this.VHPOSR = function() {
		//static uae_u16 vhposr_oldhp;
		var vp = GETVPOS();
		var hp = GETHPOS();

		//hp += HPOS_OFFSET; //ORG
		if (cpu_accurate) hp += HPOS_SHIFT; //OWN opt inline
		if (hp >= maxhpos) {
			hp -= maxhpos;
			// vpos increases when hp==1, not when hp==0
			//if (hp >= VPOS_INC_DELAY) { //ORG
			if (hp >= (cpu_accurate ? 1 : 0)) { //OWN opt inline
				vp++;
				if (vp >= maxvpos + lof_store)
					vp = 0;
			}
		}
		//if (HPOS_OFFSET) { //ORG
		if (cpu_accurate) { //OWN opt inline
			hp += 1;
			if (hp >= maxhpos)
				hp -= maxhpos;
		}

		vp = (vp << 8) & 0xffff;

		if (hsyncdelay()) {
			// fake continuously changing hpos in fastest possible modes
			hp = vhposr_oldhp % maxhpos;
			vhposr_oldhp++;
			if (vhposr_oldhp > 0xffff) vhposr_oldhp = 0; //OWN handle overflow
		}

		vp |= hp;
		return vp;
	}

	this.REFPTR = function(v) {
		/*ECS Agnus:
		b15 8000: R 040
		b14 4000: R 020
		b13 2000: R 010
		b12 1000: R 008
		b11 0800: R 004
		b10 0400: R 002
		b09 0200: R 001
		b08 0100: C 080
		b07 0080: C 040
		b06 0040: C 020
		b05 0020: C 010
		b04 0010: C 008
		b03 0008: C 004
		b02 0004: C 002 C 100
		b01 0002: C 001 R 100
		b00 0001: R 080 */

		refptr = v;
		refptr_val = (v & 0xfe00) | ((v & 0x01fe) >> 1);
		if (v & 1) {
			//refptr_val |= 0x80 << 9;
			refptr_val = (refptr_val | 0x10000) >>> 0;
		}
		if (v & 2) {
			//refptr_val |= 1;
			//refptr_val |= 0x100 << 9;
			refptr_val = (refptr_val | 0x20001) >>> 0;
		}
		if (v & 4) {
			//refptr_val |= 2;
			//refptr_val |= 0x100;
			refptr_val = (refptr_val | 0x102) >>> 0;
		}
	}

	/* playfield read reg */
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/* SECT playfield reg */

	this.BEAMCON0 = function(v) {
		//if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS)) return;
		if (v != new_beamcon0) {
			new_beamcon0 = v;
			if (v & ~0x20) {
				SAEF_warn("playfield.BEAMCON0() write 0x%04x", v);
				//dumpsync();
			}
		}
		calcdiw();
	}

	function varsync() {
		//if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS)) return;
		/*#ifdef PICASSO96
		if (SAEV_Playfield_picasso_on && p96refresh_active) {
			vtotal = p96refresh_active;
			return;
		}
		#endif*/
		if (!(beamcon0 & 0x80))
			return;
		varsync_changed = true;
	}
	this.HTOTAL  = function(v) { if (htotal != v) { htotal = v & (MAXHPOS_ROWS - 1); varsync(); }}
	this.HSSTOP  = function(v) { if (hsstop != v) { hsstop = v & (MAXHPOS_ROWS - 1); varsync(); }}
	this.HBSTRT  = function(v) { if (hbstrt != v) { hbstrt = v & (MAXHPOS_ROWS - 1); varsync(); }}
	this.HBSTOP  = function(v) { if (hbstop != v) { hbstop = v & (MAXHPOS_ROWS - 1); varsync(); }}
	this.VTOTAL  = function(v) { if (vtotal != v) { vtotal = v & (MAXVPOS_LINES_ECS - 1); varsync(); }}
	this.VSSTOP  = function(v) { if (vsstop != v) { vsstop = v & (MAXVPOS_LINES_ECS - 1); varsync(); }}
	this.VBSTRT  = function(v) { if (vbstrt < v || vbstrt > (v & (MAXVPOS_LINES_ECS - 1)) + 1) { vbstrt = v & (MAXVPOS_LINES_ECS - 1); varsync(); }}
	this.VBSTOP  = function(v) { if (vbstop < v || vbstop > (v & (MAXVPOS_LINES_ECS - 1)) + 1) { vbstop = v & (MAXVPOS_LINES_ECS - 1); varsync(); }}
	this.HSSTRT  = function(v) { if (hsstrt != v) { hsstrt = v & (MAXHPOS_ROWS - 1); varsync(); }}
	this.VSSTRT  = function(v) { if (vsstrt != v) { vsstrt = v & (MAXVPOS_LINES_ECS - 1); varsync(); }}
	this.HCENTER = function(v) { if (hcenter != v) { hcenter = v & (MAXHPOS_ROWS - 1); varsync(); }}

	/*#ifdef PICASSO96
	function set_picasso_hack_rate(hz) { //global
		if (!SAEV_Playfield_picasso_on)
			return;
		vpos_count = 0;
		p96refresh_active = (maxvpos_stored * vblank_hz_stored / hz) >>> 0;
		if (SAEV_config.chipset.cia.tod == SAEC_Config_Chipset_CIA_TOD_VSync)
			SAEV_config.chipset.cia.tod = SAEV_config.chipset.ntsc ? SAEC_Config_Chipset_CIA_TOD_60Hz : SAEC_Config_Chipset_CIA_TOD_50Hz;
		if (p96refresh_active > 0) {
			new_beamcon0 |= 0x80;
		}
	}
	#endif*/

	//"Dangerous" blitter D-channel: Writing to memory which is also currently read by bitplane DMA
	this.dcheck_is_blit_dangerous = function() {
		SAER.blitter.check_is_blit_dangerous(bplpt, bplcon0_planes, 50 << bplcon0_res);
	}

	this.BPLxPTH = function(hpos, v, num) {
		this.decide_line(hpos);
		this.decide_fetch_safe(hpos);
		if (SAEV_Copper_access && this.is_bitplane_dma(hpos + 1) == num + 1) {
			/*#if 0
			if (this.is_bitplane_dma(hpos + 2)) {
				dbplpth[num] = (v << 16) & 0xffff0000;
				dbplpth_on[num] = hpos;
				dbplpth_on2++;
			}
			#endif*/
			line_cyclebased = 2; //SET_LINE_CYCLEBASED();
			return;
		}
		bplpt[num] = ((bplpt[num] & 0x0000ffff) | (v << 16)) >>> 0;
		bplptx[num] = ((bplptx[num] & 0x0000ffff) | (v << 16)) >>> 0;
		this.dcheck_is_blit_dangerous();
	}
	this.BPLxPTL = function(hpos, v, num) {
		this.decide_line(hpos);
		this.decide_fetch_safe(hpos);
		/*#if 0
		reset_dbplh (hpos, num);
		#endif*/

		/* chipset feature:
		 * BPLxPTL write and next cycle doing DMA fetch using same pointer register ->
		 * next DMA cycle uses old value.
		 * (Multiscroll / Cult)
		 *
		 * If following cycle is not BPL DMA: written value is lost
		 *
		 * last fetch block does not have this side-effect, probably due to modulo adds.
		 * Also it seems only plane 0 fetches have this feature (because of above reason!)
		 * (MoreNewStuffy / PlasmaForce)
		 */
		/* only detect copper accesses to prevent too fast CPU mode glitches */
		if (SAEV_Copper_access && this.is_bitplane_dma(hpos + 1) == num + 1) {
			/*#if 0
			if (num == 0 && plf_state >= plf_passed_stop) {
				// modulo adds use old value! Argh! (This is wrong and disabled)
				dbplptl[num] = v & 0x0000fffe;
				dbplptl_on[num] = -1;
				dbplptl_on2++;
			} else if (this.is_bitplane_dma(hpos + 2)) {
				dbplptl[num] = v & 0x0000fffe;
				dbplptl_on[num] = hpos;
				dbplptl_on2++;
			}
			#endif*/
			line_cyclebased = 2; //SET_LINE_CYCLEBASED();
			return;
		}
		bplpt[num] = ((bplpt[num] & 0xffff0000) | (v & 0x0000fffe)) >>> 0;
		bplptx[num] = ((bplptx[num] & 0xffff0000) | (v & 0x0000fffe)) >>> 0;
		this.dcheck_is_blit_dangerous();
	}

	function BPLCON0_Denise(hpos, v, immediate) {
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE))
			v &= ~0x00F1;
		else if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA))
			v &= ~0x00B0;
		v &= ~(0x0200 | 0x0100 | 0x0080 | 0x0020);

		/*#if SPRBORDER
		v |= 1;
		#endif*/
		if (bplcon0d == v && !immediate)
			return;

		bplcon0dd = -1;
		// fake unused 0x0080 bit as an EHB bit (see below)
		if (isehb(bplcon0d, bplcon2))
			v |= 0x80;
		if (immediate)
			record_register_change(hpos, 0x100, v);
		else
			record_register_change(hpos, 0x100, (bplcon0d & ~(0x800 | 0x400 | 0x80)) | (v & (0x0800 | 0x400 | 0x80 | 0x01)));

		bplcon0d = v & ~0x80;

		//#ifdef ECS_DENISE
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) {
			decide_sprites(hpos);
			sprres = expand_sprres(v, bplcon3);
		}
		//#endif
		if (thisline_decision.plfleft < 0)
			update_denise(hpos);
		else
			update_denise_shifter_planes(hpos);
	}

	this.BPLCON0 = function(hpos, v) {
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE))
			v &= ~0x00F1;
		else if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA))
			v &= ~0x00B0;
		v &= ~0x0080;

		/*#if SPRBORDER
		v |= 1;
		#endif*/
		if (bplcon0 == v)
			return;

		line_cyclebased = 2; //SET_LINE_CYCLEBASED();
		decide_diw(hpos);
		this.decide_line(hpos);
		this.decide_fetch_safe(hpos);

		if (!issyncstopped()) {
			vpos_previous = vpos;
			hpos_previous = hpos;
		}
		if (bplcon0 & 4)
			bplcon0_interlace_seen = true;

		bplcon0 = v;

		bpldmainitdelay(hpos);

		if (thisline_decision.plfleft < 0)
			BPLCON0_Denise(hpos, v, true);
	}

	this.BPLCON1 = function(hpos, v) {
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA))
			v &= 0xff;
		if (bplcon1 == v)
			return;
		line_cyclebased = 2; //SET_LINE_CYCLEBASED();
		this.decide_line(hpos);
		this.decide_fetch_safe(hpos);
		bplcon1_written = true;
		bplcon1 = v;
		hack_shres_delay(hpos);
	}

	this.BPLCON2 = function(hpos, v) {
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA))
			v &= 0x7f;
		if ((bplcon2 & 0x3fff) == (v & 0x3fff))
			return;
		this.decide_line(hpos);
		bplcon2 = v;
		record_register_change(hpos, 0x104, bplcon2);
	}

	//#ifdef ECS_DENISE
	this.BPLCON3 = function(hpos, v) {
		//if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE)) return;
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA)) {
			v &= 0x003f;
			v |= 0x0c00;
		}
		/*#if SPRBORDER
		v |= 2;
		#endif*/
		if (bplcon3 == v)
			return;
		this.decide_line(hpos);
		decide_sprites(hpos);
		bplcon3 = v;
		sprres = expand_sprres(bplcon0, bplcon3);
		record_register_change(hpos, 0x106, v);
	}
	//#endif
	//#ifdef AGA
	this.BPLCON4 = function(hpos, v) {
		//if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA)) return;
		if (bplcon4 == v)
			return;
		this.decide_line(hpos);
		bplcon4 = v;
		record_register_change(hpos, 0x10c, v);
	}
	//#endif

	function castWord(v) { //OWN ATT
		return (v & 0x8000) ? (v - 0x10000) : v;
	}
	this.BPL1MOD = function(hpos, v) {
		v &= ~1;
		if (bpl1mod != castWord(v)) {
			this.decide_line(hpos);
			this.decide_fetch_safe(hpos);
		}
		// write to BPLxMOD one cycle before
		// BPL fetch that also adds modulo:
		// Old BPLxMOD value is added.
		if (this.is_bitplane_dma(hpos + 1) & 1) {
			dbpl1mod = castWord(v);
			dbpl1mod_on = hpos + 1;
		} else {
			bpl1mod = castWord(v);
			dbpl1mod_on = 0;
		}
	}
	this.BPL2MOD = function(hpos, v) {
		v &= ~1;
		if (bpl2mod != castWord(v)) {
			this.decide_line(hpos);
			this.decide_fetch_safe(hpos);
		}
		if (this.is_bitplane_dma(hpos + 1) & 2) {
			dbpl2mod = castWord(v);
			dbpl2mod_on = hpos + 1;
		} else {
			bpl2mod = castWord(v);
			dbpl2mod_on = 0;
		}
	}

	//Needed in special OCS/ECS "7-plane" mode, also handles CPU generated bitplane data
	this.BPLxDAT = function(hpos, num, v) {
		// only BPL1DAT access can do anything visible
		if (num == 0 && hpos >= 8) {
			this.decide_line(hpos);
			this.decide_fetch_safe(hpos);
		}
		flush_display(fetchmode);
		fetched[num] = v;
		//fetched_aga[num] = v;
		fetched_aga_hi[num] = 0;
		fetched_aga_lo[num] = v;
		if (num == 0 && hpos >= 8) {
			bpl1dat_written = true;
			bpl1dat_written_at_least_once = true;
			if (thisline_decision.plfleft < 0)
				reset_bpl_vars();
			beginning_of_plane_block(hpos, fetchmode);
		}
	}

	this.DIWSTRT = function(hpos, v) {
		if (diwstrt == v && !diwhigh_written)
			return;
		decide_diw(hpos);
		this.decide_line(hpos);
		diwhigh_written = 0;
		diwstrt = v;
		calcdiw();
	}
	this.DIWSTOP = function(hpos, v) {
		if (diwstop == v && !diwhigh_written)
			return;
		decide_diw(hpos);
		this.decide_line(hpos);
		diwhigh_written = 0;
		diwstop = v;
		calcdiw();
	}

	this.DIWHIGH = function(hpos, v) {
		//if (!(SAEV_config.chipset.mask & (SAEC_Config_Chipset_Mask_ECS_DENISE | SAEC_Config_Chipset_Mask_ECS_AGNUS))) return;
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA))
			v &= ~(0x0008 | 0x0010 | 0x1000 | 0x0800);
		v &= ~(0x8000 | 0x4000 | 0x0080 | 0x0040);
		if (diwhigh_written && diwhigh == v)
			return;
		this.decide_line(hpos);
		diwhigh_written = 1;
		diwhigh = v;
		calcdiw();
	}

	this.DDFSTRT = function(hpos, v) {
		v &= 0xfe;
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS))
			v &= 0xfc;
		this.decide_line(hpos);
		line_cyclebased = 2; //SET_LINE_CYCLEBASED();
		// Move state back to passed_enable if this DDFSTRT write was done exactly when
		// it would match and start bitplane DMA.
		if (hpos == ddfstrt - DDF_OFFSET && plf_state == plf_passed_start && plf_start_hpos == hpos + DDF_OFFSET) {
			plf_state = plf_passed_enable;
			plf_start_hpos = maxhpos;
		}
		ddfstrt = v;
		calcdiw();
		if (fetch_state != fetch_not_started)
			estimate_last_fetch_cycle(hpos);

		if (ddfstop > 0xD4 && (ddfstrt & 4) == 4) {
			//static int last_warned; last_warned = (last_warned + 1) & 4095; if (last_warned == 0)
			SAEF_warn("playfield.DDFSTRT() very strange DDF values (%x %x)", ddfstrt, ddfstop);
		}
	}

	this.DDFSTOP = function(hpos, v) {
		v &= 0xfe;
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS))
			v &= 0xfc;
		this.decide_line(hpos);
		this.decide_fetch_safe(hpos);
		line_cyclebased = 2; //SET_LINE_CYCLEBASED();
		// DDFSTOP write when old DDFSTOP value match: old value matches normally.
		// Works differently than DDFSTRT which is interesting.
		if (hpos == v - DDF_OFFSET) {
			if (plf_state == plf_passed_stop && plf_end_hpos == hpos + DDF_OFFSET) {
				plf_state = plf_active;
				plf_end_hpos = 256 + DDF_OFFSET;
				// don't let one_fetch_cycle_0() to do this again
				ddfstop_written_hpos = hpos;
			}
		} else if (hpos == ddfstop - DDF_OFFSET) {
			// if old ddfstop would have matched, emulate it here
			if (plf_state == plf_active) {
				plf_state = plf_passed_stop;
				plf_end_hpos = hpos + DDF_OFFSET;
			}
		}
		ddfstop = v;
		calcdiw();
		if (fetch_state != fetch_not_started)
			estimate_last_fetch_cycle(hpos);

		if (ddfstop > 0xD4 && (ddfstrt & 4) == 4) {
			//static int last_warned; last_warned = (last_warned + 1) & 4095; if (last_warned == 0)
			SAEF_warn("playfield.DDFSTOP() very strange DDF values (%x %x)", ddfstrt, ddfstop);
		}
	}

	this.FMODE = function(hpos, v) {
		/*if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA)) {
			//if (currprefs.monitoremu) specialmonitor_store_fmode(vpos, hpos, v);
			v = 0;
		}*/
		v &= 0xC00F;
		if (fmode == v)
			return;

		line_cyclebased = 2; //SET_LINE_CYCLEBASED();
		fmode_saved = v;
		set_chipset_mode();
		bpldmainitdelay(hpos);
	}

	this.FNULL = function(v) {}

	/* playfield reg */

	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/* SECT sprite reg */

	function spr_arm(num, state) {
		switch (state) {
			case 0:
				nr_armed -= spr[num].armed;
				spr[num].armed = 0;
				break;
			default:
				nr_armed += 1 - spr[num].armed;
				spr[num].armed = 1;
		}
	}

	function sprstartstop(s) {
		if (vpos < sprite_vblank_endline || cant_this_last_line() || s.ignoreverticaluntilnextline)
			return;
		if (vpos == s.vstart)
			s.dmastate = 1;
		if (vpos == s.vstop)
			s.dmastate = 0;
	}

	function SPRxCTLPOS(num) {
		var sprxp;
		var s = spr[num];

		sprstartstop(s);
		sprxp = (sprpos[num] & 0xFF) * 2 + (sprctl[num] & 1);
		sprxp <<= sprite_buffer_res;

		//#ifdef AGA
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			sprxp |= ((sprctl[num] >> 3) & 3) >> (RES_MAX - sprite_buffer_res);
			s.dblscan = sprpos[num] & 0x80;
		}
		//#endif
		//#ifdef ECS_DENISE
		else if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) {
			sprxp |= ((sprctl[num] >> 3) & 2) >> (RES_MAX - sprite_buffer_res);
		}
		//#endif
		s.xpos = sprxp;
		s.vstart = sprpos[num] >> 8;
		s.vstart |= (sprctl[num] & 0x04) ? 0x0100 : 0;
		s.vstop = sprctl[num] >> 8;
		s.vstop |= (sprctl[num] & 0x02) ? 0x100 : 0;
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_AGNUS) {
			s.vstart |= (sprctl[num] & 0x40) ? 0x0200 : 0;
			s.vstop |= (sprctl[num] & 0x20) ? 0x0200 : 0;
		}
		sprstartstop(s);
	}

	function SPRxCTL_1(v, num, hpos) {
		if (hpos >= maxhpos - 2 && sprctl[num] != v && vpos < maxvpos - 1) {
			var s = spr[num];
			vpos++;
			sprstartstop(s);
			vpos--;
			s.ignoreverticaluntilnextline = true;
			sprite_ignoreverticaluntilnextline = true;
		}
		sprctl[num] = v;
		spr_arm(num, 0);
		SPRxCTLPOS(num);
	}
	function SPRxPOS_1(v, num, hpos) {
		if (hpos >= maxhpos - 2 && sprpos[num] != v && vpos < maxvpos - 1) {
			var s = spr[num];
			vpos++;
			sprstartstop(s);
			vpos--;
			s.ignoreverticaluntilnextline = true;
			sprite_ignoreverticaluntilnextline = true;
		}
		sprpos[num] = v;
		SPRxCTLPOS(num);
	}
	function SPRxDATA_1(v, num, hpos) {
		sprdata[num][0] = v;
		//#ifdef AGA
		sprdata[num][1] = v;
		sprdata[num][2] = v;
		sprdata[num][3] = v;
		//#endif
		spr_arm(num, 1);
	}
	function SPRxDATB_1(v, num, hpos) {
		sprdatb[num][0] = v;
		//#ifdef AGA
		sprdatb[num][1] = v;
		sprdatb[num][2] = v;
		sprdatb[num][3] = v;
		//#endif
	}

	/*
	 SPRxDATA and SPRxDATB is moved to shift register when SPRxPOS matches.

	 When copper writes to SPRxDATx exactly when SPRxPOS matches:
	 - If sprite low x bit (SPRCTL bit 0) is not set, shift register copy
		is done first (previously loaded SPRxDATx value is shown) and then
		new SPRxDATx gets stored for future use.
	 - If sprite low x bit is set, new SPRxDATx is stored, then SPRxPOS
		matches and value written to SPRxDATx is visible.

	 - Writing to SPRxPOS when SPRxPOS matches: shift register
		copy is always done first, then new SPRxPOS value is stored
		for future use. (SPRxCTL not tested)
	*/

	this.SPRxDATA = function(hpos, v, num) {
		decide_sprites(hpos, true);
		SPRxDATA_1(v, num, hpos);
	}
	this.SPRxDATB = function(hpos, v, num) {
		decide_sprites(hpos, true);
		SPRxDATB_1(v, num, hpos);
	}

	this.SPRxCTL = function(hpos, v, num) {
		decide_sprites(hpos);
		SPRxCTL_1(v, num, hpos);
	}
	this.SPRxPOS = function(hpos, v, num) {
		var s = spr[num];
		var oldvpos;

		decide_sprites(hpos);
		oldvpos = s.vstart;
		SPRxPOS_1(v, num, hpos);
		// Superfrog flashing intro bees fix.
		// if SPRxPOS is written one cycle before sprite"s first DMA slot and sprite"s vstart matches after
		// SPRxPOS write, current line"s DMA slot"s stay idle. DMA decision seems to be done 4 cycles earlier.
		if (hpos >= SPR0_HPOS + num * 4 - 4 && hpos <= SPR0_HPOS + num * 4 - 1 && oldvpos != vpos) {
			s.ptxvpos2 = vpos;
			s.ptxhpos2 = hpos + 4;
		}
	}

	this.SPRxPTH = function(hpos, v, num) {
		decide_sprites(hpos);
		if (hpos - 1 != spr[num].ptxhpos) {
			//spr[num].pt &= 0xffff;
			//spr[num].pt |= (uae_u32)v << 16;
			spr[num].pt = ((v << 16) | (spr[num].pt & 0xffff)) >>> 0;
		}
	}
	this.SPRxPTL = function(hpos, v, num) {
		decide_sprites(hpos);
		if (hpos - 1 != spr[num].ptxhpos) {
			//spr[num].pt &= ~0xffff;
			//spr[num].pt |= v & ~1;
			spr[num].pt = ((spr[num].pt & 0xffff0000) | (v & 0xfffe)) >>> 0;
		}
	}

	this.CLXCON = function(v) {
		clxcon = v;
		clxcon_bpl_enable = (v >> 6) & 63;
		clxcon_bpl_match = v & 63;
	}

	this.CLXCON2 = function(v) {
		//if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA)) return;
		clxcon2 = v;
		clxcon_bpl_enable |= v & (0x40 | 0x80);
		clxcon_bpl_match |= (v & (0x01 | 0x02)) << 6;
		clxcon_bpl_match &= 0xffffffff; //OWN
	}

	this.CLXDAT = function() {
		var v = clxdat | 0x8000;
		clxdat = 0;
		return v;
	}

	/* sprite reg */
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/* SECT color reg */

	//#ifdef AGA
	/*function dump_aga_custom() {
		var c1, c2, c3, c4;
		var rgb1, rgb2, rgb3, rgb4;

		for (c1 = 0; c1 < 64; c1++) {
			c2 = c1 + 64;
			c3 = c2 + 64;
			c4 = c3 + 64;
			rgb1 = current_colors.color_regs_aga[c1];
			rgb2 = current_colors.color_regs_aga[c2];
			rgb3 = current_colors.color_regs_aga[c3];
			rgb4 = current_colors.color_regs_aga[c4];
			SAEF_log("playfield.dump_aga_custom() %3d %08X %3d %08X %3d %08X %3d %08X", c1, rgb1, c2, rgb2, c3, rgb3, c4, rgb4);
		}
	}*/

	this.COLOR_READ = function(num) {
		if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) || !(bplcon2 & 0x0100)) return 0xffff;
		var colreg = ((bplcon3 >> 13) & 7) * 32 + num;
		var cr = (current_colors.color_regs_aga[colreg] >> 16) & 0xFF;
		var cg = (current_colors.color_regs_aga[colreg] >> 8) & 0xFF;
		var cb = current_colors.color_regs_aga[colreg] & 0xFF;
		var cval;
		if (bplcon3 & 0x200) {
			cval = ((cr & 15) << 8) | ((cg & 15) << 4) | ((cb & 15) << 0);
		} else {
			cval = ((cr >> 4) << 8) | ((cg >> 4) << 4) | ((cb >> 4) << 0);
			if (color_regs_genlock[num])
				cval |= 0x8000;
		}
		return cval;
	}
	//#endif

	function checkautoscalecol0() {
		if (!SAEV_Copper_access)
			return;
		if (vpos < 20)
			return;
		if (isbrdblank(-1, bplcon0, bplcon3))
			return;
		// autoscale if copper changes COLOR00 on top or bottom of screen
		if (vpos >= minfirstline) {
			var vpos2 = autoscale_bordercolors ? minfirstline : vpos;
			if (first_planes_vpos == 0)
				first_planes_vpos = vpos2 - 2;
			if (plffirstline_total == current_maxvpos())
				plffirstline_total = vpos2 - 2;
			if (vpos2 > last_planes_vpos || vpos2 > plflastline_total)
				plflastline_total = last_planes_vpos = vpos2 + 3;
			autoscale_bordercolors = 0;
		} else
			autoscale_bordercolors++;
	}

	this.COLOR_WRITE = function(hpos, v, num) {
		var colzero = false;
		//#ifdef AGA
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			/* writing is disabled when RDRAM=1 */
			if (bplcon2 & 0x0100)
				return;

			var colreg = ((bplcon3 >> 13) & 7) * 32 + num;
			var r = (v & 0xF00) >> 8;
			var g = (v & 0xF0) >> 4;
			var b = (v & 0xF) >> 0;
			var cr = (current_colors.color_regs_aga[colreg] >> 16) & 0xFF;
			var cg = (current_colors.color_regs_aga[colreg] >> 8) & 0xFF;
			var cb = current_colors.color_regs_aga[colreg] & 0xFF;

			if (bplcon3 & 0x200) {
				cr &= 0xF0; cr |= r;
				cg &= 0xF0; cg |= g;
				cb &= 0xF0; cb |= b;
			} else {
				cr = r + (r << 4);
				cg = g + (g << 4);
				cb = b + (b << 4);
				color_regs_genlock[colreg] = v >> 15;
			}
			var cval = ((cr << 16) | (cg << 8) | cb | (color_regs_genlock[colreg] ? 0x80000000 : 0)) >>> 0;
			if (cval && colreg == 0)
				colzero = true;

			if (cval == current_colors.color_regs_aga[colreg])
				return;

			if (colreg == 0)
				checkautoscalecol0();

			/* Call this with the old table still intact. */
			record_color_change(hpos, colreg, cval);
			remembered_color_entry = -1;
			current_colors.color_regs_aga[colreg] = cval;
			current_colors.acolors[colreg] = getxcolor(cval);
		} else {
		//#endif
			v &= 0x8fff;
			if (!(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE))
				v &= 0xfff;
			color_regs_genlock[num] = v >> 15;
			if (num && v == 0)
				colzero = true;
			if (current_colors.color_regs_ecs[num] == v)
				return;
			if (num == 0)
				checkautoscalecol0();

			/* Call this with the old table still intact. */
			record_color_change(hpos, num, v);
			remembered_color_entry = -1;
			current_colors.color_regs_ecs[num] = v;
			current_colors.acolors[num] = getxcolor(v);
		//#ifdef AGA
		}
		//#endif
	}

	/* color reg */
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/* SECT sprite do */

	function cursorsprite() {
		if (!SAEF_Custom_dmaen(SAEC_Custom_DMAF_SPREN) || first_planes_vpos == 0)
			return;
		sprite_0 = spr[0].pt;
		sprite_0_height = spr[0].vstop - spr[0].vstart;
		sprite_0_colors[0] = 0;
		sprite_0_doubled = 0;
		if (sprres == 0)
			sprite_0_doubled = 1;
		if (SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA) {
			var sbasecol = ((bplcon4 >> 4) & 15) << 4;
			sprite_0_colors[1] = current_colors.color_regs_aga[sbasecol + 1];
			sprite_0_colors[2] = current_colors.color_regs_aga[sbasecol + 2];
			sprite_0_colors[3] = current_colors.color_regs_aga[sbasecol + 3];
		} else {
			sprite_0_colors[1] = xcolors[current_colors.color_regs_ecs[17]];
			sprite_0_colors[2] = xcolors[current_colors.color_regs_ecs[18]];
			sprite_0_colors[3] = xcolors[current_colors.color_regs_ecs[19]];
		}
		sprite_0_width = sprite_width;
		/* OWN
		if (currprefs.input_tablet && currprefs.input_magic_mouse) {
			if (currprefs.input_magic_mouse_cursor == MAGICMOUSE_HOST_ONLY && mousehack_alive ())
				magic_sprite_mask &= ~1;
			else
				magic_sprite_mask |= 1;
		}*/
	}

	function sprite_fetch(s, dma, hpos, cycle, mode) {
		var data = SAEV_Custom_last_value & 0xffff;
		if (dma) {
			//if (cycle && cpu_cycle_exact) s.ptxhpos = hpos;
			data = SAEV_Custom_last_value = SAER_Memory_chipGet16_indirect(s.pt);
			//SAER.events.alloc_cycle(hpos, SAEC_Events_cycle_line_SPRITE);
		}
		s.pt += 2;
		return data;
	}
	function sprite_fetch2(s, hpos, cycle, mode) {
		var data = SAER_Memory_chipGet16_indirect(s.pt);
		s.pt += 2;
		return data;
	}

	function do_sprites_1(num, cycle, hpos) {
		var s = spr[num];
		var dma, posctl = 0;
		var data;
		// fetch both sprite pairs even if DMA was switched off between sprites
		var isdma = SAEF_Custom_dmaen(SAEC_Custom_DMAF_SPREN) || ((num & 1) && spr[num & ~1].dmacycle);

		if (cant_this_last_line())
			return;

		/*#if 0 //see SPRxCTRL below
		if (isdma && vpos == sprite_vblank_endline)
			spr_arm (num, 0);
		#endif*/

		//#ifdef AGA
		if (isdma && s.dblscan && (fmode & 0x8000) && (vpos & 1) != (s.vstart & 1) && s.dmastate) {
			spr_arm(num, 1);
			return;
		}
		//#endif

		if (vpos == s.vstart) {
			s.dmastate = 1;
			if (s.ptxvpos2 == vpos && hpos < s.ptxhpos2)
				return;
			if (num == 0 && cycle == 0)
				cursorsprite();
		}
		if (vpos == s.vstop || vpos == sprite_vblank_endline) {
			s.dmastate = 0;
		}
		if (!isdma)
			return;

		dma = hpos < plfstrt_sprite || diwstate != DIW_WAITING_STOP;
		if (vpos == s.vstop || vpos == sprite_vblank_endline) {
			s.dmastate = 0;
			posctl = 1;
			if (dma) {
				data = sprite_fetch(s, dma, hpos, cycle, 0);
				switch (sprite_width) {
					case 64:
						sprite_fetch2(s, hpos, cycle, 0);
						sprite_fetch2(s, hpos, cycle, 0);
					case 32:
						sprite_fetch2(s, hpos, cycle, 0);
						break;
				}
				if (cycle == 0) {
					SPRxPOS_1(data, num, hpos);
					s.dmacycle = 1;
				} else {
					// This is needed to disarm previous field"s sprite.
					// It can be seen on OCS Agnus + ECS Denise combination where
					// this cycle is disabled due to weird DDFTSTR=$18 copper list
					// which causes corrupted sprite to "wrap around" the display.
					SPRxCTL_1(data, num, hpos);
					s.dmastate = 0;
					sprstartstop(s);
				}
			}
			if (vpos == sprite_vblank_endline) {
				// s.vstart == sprite_vblank_endline won"t enable the sprite.
				s.dmastate = 0;
			}
		}
		if (s.dmastate && !posctl && dma) {
			var data = sprite_fetch(s, dma, hpos, cycle, 1);
			if (cycle == 0) {
				SPRxDATA_1(data, num, hpos);
				s.dmacycle = 1;
			} else {
				SPRxDATB_1(data, num, hpos);
				spr_arm(num, 1);
			}
			//#ifdef AGA
			switch (sprite_width) {
				case 64: {
					var data32 = sprite_fetch2(s, hpos, cycle, 1);
					var data641 = sprite_fetch2(s, hpos, cycle, 1);
					var data642 = sprite_fetch2(s, hpos, cycle, 1);
					if (dma) {
						if (cycle == 0) {
							sprdata[num][3] = data642;
							sprdata[num][2] = data641;
							sprdata[num][1] = data32;
						} else {
							sprdatb[num][3] = data642;
							sprdatb[num][2] = data641;
							sprdatb[num][1] = data32;
						}
					}
					break;
				}
				case 32: {
					var data32 = sprite_fetch2(s, hpos, cycle, 1);
					if (dma) {
						if (cycle == 0)
							sprdata[num][1] = data32;
						else
							sprdatb[num][1] = data32;
					}
					break;
				}
			}
			//#endif
		}
	}

	function do_sprites(hpos) {
		if (vpos < sprite_vblank_endline)
			return;

		if (doflickerfix() && interlace_seen && (next_lineno & 1))
			return;

		var maxspr = hpos;
		var minspr = last_sprite_hpos + 1;

		if (minspr >= maxspr || last_sprite_hpos == hpos)
			return;

		if (maxspr >= SPR0_HPOS + MAX_SPRITES * 4)
			maxspr = SPR0_HPOS + MAX_SPRITES * 4 - 1;
		if (minspr < SPR0_HPOS)
			minspr = SPR0_HPOS;

		if (minspr == maxspr)
			return;

		for (var i = minspr; i <= maxspr; i++) {
			var cycle = -1;
			var num = (i - SPR0_HPOS) >> 2; //ORG / 4

			switch ((i - SPR0_HPOS) & 3) {
				case 0:
					cycle = 0;
					spr[num].dmacycle = 0;
					break;
				case 2:
					cycle = 1;
					break;
			}
			if (cycle >= 0) {
				spr[num].ptxhpos = MAXHPOS;
				do_sprites_1(num, cycle, i);
			}
		}
		last_sprite_hpos = hpos;
	}

	function setup_sprites() { //ORG gen_custom_tables()
		var i;

		if (sprtaba !== null)
			return;

		sprtaba = new Uint32Array(256);
		sprtabb = new Uint32Array(256);
		sprite_ab_merge = new Uint32Array(256);
		for (i = 0; i < 256; i++) {
			sprtaba[i] = ((((i >> 7) & 1) << 0)
				| (((i >> 6) & 1) << 2)
				| (((i >> 5) & 1) << 4)
				| (((i >> 4) & 1) << 6)
				| (((i >> 3) & 1) << 8)
				| (((i >> 2) & 1) << 10)
				| (((i >> 1) & 1) << 12)
				| (((i >> 0) & 1) << 14));
			sprtabb[i] = sprtaba[i] * 2;
			sprite_ab_merge[i] = (((i & 15) ? 1 : 0) | ((i & 240) ? 2 : 0));
		}

		sprclx = new Uint32Array(16);
		clxmask = new Uint32Array(16);
		for (i = 0; i < 16; i++) {
			clxmask[i] = (((i & 1) ? 0xF : 0x3)
				| ((i & 2) ? 0xF0 : 0x30)
				| ((i & 4) ? 0xF00 : 0x300)
				| ((i & 8) ? 0xF000 : 0x3000));
			sprclx[i] = (((i & 0x3) == 0x3 ? 1 : 0)
				| ((i & 0x5) == 0x5 ? 2 : 0)
				| ((i & 0x9) == 0x9 ? 4 : 0)
				| ((i & 0x6) == 0x6 ? 8 : 0)
				| ((i & 0xA) == 0xA ? 16 : 0)
				| ((i & 0xC) == 0xC ? 32 : 0)) << 9;
		}
	}

	function reset_sprites() { //ORG init_sprites()
		//memset(sprpos, 0, sizeof sprpos);
		//memset(sprctl, 0, sizeof sprctl);
		SAEF_memset(sprpos,0, 0, MAX_SPRITES);
		SAEF_memset(sprctl,0, 0, MAX_SPRITES);
	}

	/* sprite do */
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/* SECT setup/reset */

	/* mousehack is now in "filesys boot rom" */
	function mousehack_helper_old(ctx) { //struct TrapContext *
		//SAEF_log("playfield.mousehack_helper_old()");
		return 0;
	}
	var timehack_alive = 0;
	function timehack_helper(ctx) { //struct TrapContext *
		//SAEF_log("playfield.timehack_helper()");
		//#ifdef HAVE_GETTIMEOFDAY
		if (SAER_CPU_regs.d[0] == 0)
			return timehack_alive;

		timehack_alive = 10;

		var tv = {};
		SAEF_gettimeofday(tv, null);
		SAER_Memory_put32(SAER_CPU_regs.a[0], tv.tv_sec - (((365 * 8 + 2) * 24) * 60 * 60));
		SAER_Memory_put32(SAER_CPU_regs.a[0] + 4, tv.tv_usec); //ATT +4, 32bit overflow
		return 0;
		/*#else
		return 2;
		#endif*/
	}

	this.setup = function() { //custom_init()
		//#ifdef AUTOCONFIG
		if (SAEV_AutoConf_boot_rom_type) {
			var pos = SAER.autoconf.here();

			SAER.autoconf.org(SAEV_AutoConf_base + 0xFF70);
			SAER.autoconf.calltrap(SAER.autoconf.define_trap(mousehack_helper_old, 0, "mousehack_helper_old"));
			SAER.autoconf.dw(SAEC_AutoConf_RTS);

			SAER.autoconf.org(SAEV_AutoConf_base + 0xFFA0);
			SAER.autoconf.calltrap(SAER.autoconf.define_trap(timehack_helper, 0, "timehack_helper"));
			SAER.autoconf.dw(SAEC_AutoConf_RTS);

			SAER.autoconf.org(pos);
		}
		//#endif
		setup_sprites();
		//build_blitfilltable(); //OWN in blitter.js
		drawing_init();
		create_cycle_diagram_table();
		notice_new_xcolors();
		return SAEE_None;
	}

	function reset_all_systems(hardreset) {
		SAER.events.reset(); //init_eventtab()
		/*#ifdef PICASSO96
		picasso_reset();
		#endif*/
		//#ifdef FILESYS
		//SAER.filesys.prepare_reset(); //filesys_prepare_reset() OWN empty
		SAER.filesys.reset(); //filesys_reset()
		//#endif
		//init_shm();
		SAER.memory.reset(hardreset); //memory_reset()
		//#ifdef FILESYS
		//SAER.filesys.start_threads(); //filesys_start_threads() OWN empty
		//SAER.hardfile.reset(); //hardfile_reset() OWN empty
		//#endif
		//#ifdef PARALLEL_PORT
		//SAER.parallel.reset(); //OWN empty //initparallel()
		//#endif
		//native2amiga_reset();
		SAER.dongle.reset(); //dongle_reset()
		//sampler_init();
	}

	this.custom_reset = function(hardreset, keyboardreset) {
		var i;

		//target_reset();
		reset_all_systems(hardreset);
		SAER.memory.map_dump();

		lightpen_active = -1;
		lightpen_triggered = 0;
		lightpen_cx = lightpen_cy = -1;
		nr_armed = 0;

		{
			//extra_cycle = 0; //OWN in events.js
			SAEV_Events_hsync_counter = 0;
			SAEV_Events_vsync_counter = 0;
			//SAEV_config.chipset.mask = changed_prefs.chipset_mask;
			update_mirrors();

			SAER.blitter.reset(); //blitter_reset();

			if (hardreset) {
				if (!aga_mode) {
					var c = (((SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_ECS_DENISE) && !(SAEV_config.chipset.mask & SAEC_Config_Chipset_Mask_AGA)) || SAEV_config.chipset.deniseNoEHB) ? 0xfff : 0x000;
					for (i = 0; i < 32; i++) {
						current_colors.color_regs_ecs[i] = c;
						current_colors.acolors[i] = getxcolor(c);
					}
				//#ifdef AGA
				} else {
					var c = 0;
					for (i = 0; i < 256; i++) {
						current_colors.color_regs_aga[i] = c;
						current_colors.acolors[i] = getxcolor(c);
					}
				//#endif
				}
			}

			clxdat = 0;

			/* Clear the armed flags of all sprites.  */
			for (i = 0; i < spr.length; i++) spr[i].clr(); //memset(spr, 0, sizeof spr);

			SAER.custom.reset();
			/*{
				SAEV_Custom_dmacon = 0;
				intreq_internal = 0;
				SAEV_Custom_intena = intena_internal = 0;
			}*/

			SAER.copper.clr_copcon(); //copcon = 0;

			SAER.disk.DSKLEN(0, 0);

			bplcon0 = 0;
			bplcon4 = 0x0011; /* Get AGA chipset into ECS compatibility mode */
			bplcon3 = 0x0C00;

			diwhigh = 0;
			diwhigh_written = 0;
			hdiwstate = DIW_WAITING_START; // this does not reset at vblank

			refptr = 0xffff;
			this.FMODE(0, 0);
			this.CLXCON(0);
			this.CLXCON2(0);
			setup_fmodes(0);
			sprite_width = GET_SPRITEWIDTH(fmode);
			beamcon0 = new_beamcon0 = SAEV_config.chipset.ntsc ? 0x00 : 0x20;

			SAEV_Blitter_bltstate = SAEC_Blitter_bltstate_DONE;
			SAEV_Blitter_interrupt = true;

			lof_store = lof_current = 0;
			lof_lace = false;

			reset_sprites();
		}

		SAER.devices.reset(hardreset);
		//specialmonitor_reset();

		SAEF_clrSpcFlags(~(SAEC_spcflag_BRK | SAEC_spcflag_MODE_CHANGE));

		vpos = 0;
		vpos_count = vpos_count_diff = 0;

		SAER.input.reset(); //inputdevice_reset();
		timehack_alive = 0;

		curr_sprite_entries = 0;
		prev_sprite_entries = 0;
		sprite_entries[0][0].first_pixel = 0;
		sprite_entries[1][0].first_pixel = MAX_SPR_PIXELS;
		sprite_entries[0][1].first_pixel = 0;
		sprite_entries[1][1].first_pixel = MAX_SPR_PIXELS;
		//memset(spixels, 0, 2 * MAX_SPR_PIXELS * sizeof *spixels);
		//memset(&spixstate, 0, sizeof spixstate);
		SAEF_memset(spixels,0, 0, 2 * MAX_SPR_PIXELS);
		SAEF_memset(spixstate.bytes,0, 0, 2 * MAX_SPR_PIXELS);
		toscr_delay_sh[0] = 0;
		toscr_delay_sh[1] = 0;

		SAER_Copper_cop_state.state = 0; //COP_stop;
		SAER_Copper_cop_state.movedelay = 0;
		SAER_Copper_cop_state.strobe = 0;
		SAER_Copper_cop_state.ignore_next = false;

		diwstate = DIW_WAITING_START;

		SAER.events.clr_dmal(); //dmal = 0;

		init_hz_normal();
		vpos_lpen = -1;
		lof_changing = 0;
		lof_togglecnt_nlace = lof_togglecnt_lace = 0;
		//nlace_cnt = NLACE_CNT_NEEDED; //ORG

		SAER.audio.reset();
		//must be called after audio_reset
		SAEV_Custom_adkcon = 0;
		//SAER.serial.uartbreak(0); /* unused */
		SAER.audio.update_adkmasks();

		init_hardware_frame();
		drawing_init();

		reset_decisions();

		SAEV_Events_bogusframe = 1;

		sprres = expand_sprres(bplcon0, bplcon3);
		sprite_width = GET_SPRITEWIDTH(fmode);
		setup_fmodes(0);

		/*#ifdef ACTION_REPLAY
		// Doing this here ensures we can use the "reset" command from within AR
		action_replay_reset (hardreset, keyboardreset);
		#endif*/

		if (hardreset)
			SAER.rtc.hardreset(); //rtc_hardreset();

		/*#ifdef PICASSO96
		picasso_reset();
		#endif*/

		hpos_is_zero_bplcon1_hack = -1; //OWN
		cia_hsync = 0;  //OWN
		vhposr_oldhp = 0;  //OWN

		cpu_accurate = SAEV_config.cpu.model < SAEC_Config_CPU_Model_68020; //CPU_ACCURATE(); //OWN

		warned_maybe_finish_last_fetch = 20; //OWN
	}

	this.custom_prepare = function() {
		set_hpos();
		//hsync_handler_post(true); //OWN framerate error
	}

	/* setup/reset */
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/* SECT linedraw functions */

	/* ECS SuperHires special cases */
	function shsprite(dpix, spix_val, v, spr) {
		if (!spr)
			return v;
		var sprcol = render_sprites(dpix, 0, spix_val, 0);
		if (!sprcol)
			return v;
		// good enough for now..
		var scol = colors_for_drawing.color_regs_ecs[sprcol] & 0xccc;
		scol |= scol >> 2;
		return xcolors[scol];
	}

	function linetoscr_16_sh_func(spix, dpix, stoppos, spr) {
		var buf = xlinebuffer;

		while (dpix < stoppos) {
			var spix_val1, spix_val2;
			var v;
			var off;
			spix_val1 = pixdata.apixels[spix++];
			spix_val2 = pixdata.apixels[spix++];
			off = ((spix_val2 & 3) * 4) + (spix_val1 & 3) + ((spix_val1 | spix_val2) & 16);
			v = (colors_for_drawing.color_regs_ecs[off] & 0xccc) << 0;
			v |= v >> 2;
			buf[dpix + xlinebuffer_pos] = shsprite(dpix, spix_val1, xcolors[v], spr);
			dpix++;
			v = (colors_for_drawing.color_regs_ecs[off] & 0x333) << 2;
			v |= v >> 2;
			buf[dpix + xlinebuffer_pos] = shsprite(dpix, spix_val2, xcolors[v], spr);
			dpix++;
		}
		return spix;
	}
	function linetoscr_16_sh_spr(spix, dpix, stoppos) {
		return linetoscr_16_sh_func(spix, dpix, stoppos, true);
	}
	function linetoscr_16_sh(spix, dpix, stoppos) {
		return linetoscr_16_sh_func(spix, dpix, stoppos, false);
	}

	function linetoscr_32_sh_func(spix, dpix, stoppos, spr) {
		var buf = xlinebuffer;

		while (dpix < stoppos) {
			var spix_val1, spix_val2;
			var v;
			var off;
			spix_val1 = pixdata.apixels[spix++];
			spix_val2 = pixdata.apixels[spix++];
			off = ((spix_val2 & 3) * 4) + (spix_val1 & 3) + ((spix_val1 | spix_val2) & 16);
			v = (colors_for_drawing.color_regs_ecs[off] & 0xccc) << 0;
			v |= v >> 2;
			buf[dpix + xlinebuffer_pos] = shsprite(dpix, spix_val1, xcolors[v], spr);
			dpix++;
			v = (colors_for_drawing.color_regs_ecs[off] & 0x333) << 2;
			v |= v >> 2;
			buf[dpix + xlinebuffer_pos] = shsprite(dpix, spix_val2, xcolors[v], spr);
			dpix++;
		}
		return spix;
	}
	function linetoscr_32_sh_spr(spix, dpix, stoppos) {
		return linetoscr_32_sh_func(spix, dpix, stoppos, true);
	}
	function linetoscr_32_sh(spix, dpix, stoppos) {
		return linetoscr_32_sh_func(spix, dpix, stoppos, false);
	}

	function linetoscr_32_shrink1_sh_func(spix, dpix, stoppos, spr) {
		var buf = xlinebuffer;

		while (dpix < stoppos) {
			var spix_val1, spix_val2;
			var v;
			var off;
			spix_val1 = pixdata.apixels[spix++];
			spix_val2 = pixdata.apixels[spix++];
			off = ((spix_val2 & 3) * 4) + (spix_val1 & 3) + ((spix_val1 | spix_val2) & 16);
			v = (colors_for_drawing.color_regs_ecs[off] & 0xccc) << 0;
			v |= v >> 2;
			buf[dpix + xlinebuffer_pos] = shsprite(dpix, spix_val1, xcolors[v], spr);
			dpix++;
		}
		return spix;
	}
	function linetoscr_32_shrink1_sh_spr(spix, dpix, stoppos) {
		return linetoscr_32_shrink1_sh_func(spix, dpix, stoppos, true);
	}
	function linetoscr_32_shrink1_sh(spix, dpix, stoppos) {
		return linetoscr_32_shrink1_sh_func(spix, dpix, stoppos, false);
	}

	function linetoscr_32_shrink1f_sh_func(spix, dpix, stoppos, spr) {
		var buf = xlinebuffer;

		while (dpix < stoppos) {
			var spix_val1, spix_val2, dpix_val1, dpix_val2;
			var v;
			var off;
			spix_val1 = pixdata.apixels[spix++];
			spix_val2 = pixdata.apixels[spix++];
			off = ((spix_val2 & 3) * 4) + (spix_val1 & 3) + ((spix_val1 | spix_val2) & 16);
			v = (colors_for_drawing.color_regs_ecs[off] & 0xccc) << 0;
			v |= v >> 2;
			dpix_val1 = xcolors[v];
			v = (colors_for_drawing.color_regs_ecs[off] & 0x333) << 2;
			v |= v >> 2;
			dpix_val2 = xcolors[v];
			buf[dpix + xlinebuffer_pos] = shsprite(dpix, spix_val1, merge_2pixel32 (dpix_val1, dpix_val2), spr);
			dpix++;
		}
		return spix;
	}
	function linetoscr_32_shrink1f_sh_spr(spix, dpix, stoppos) {
		return linetoscr_32_shrink1f_sh_func(spix, dpix, stoppos, true);
	}
	function linetoscr_32_shrink1f_sh(spix, dpix, stoppos) {
		return linetoscr_32_shrink1f_sh_func(spix, dpix, stoppos, false);
	}

	function linetoscr_16_shrink1_sh_func(spix, dpix, stoppos, spr) {
		var buf = xlinebuffer;

		while (dpix < stoppos) {
			var spix_val1, spix_val2;
			var v;
			var off;
			spix_val1 = pixdata.apixels[spix++];
			spix_val2 = pixdata.apixels[spix++];
			off = ((spix_val2 & 3) * 4) + (spix_val1 & 3) + ((spix_val1 | spix_val2) & 16);
			v = (colors_for_drawing.color_regs_ecs[off] & 0xccc) << 0;
			v |= v >> 2;
			buf[dpix + xlinebuffer_pos] = shsprite(dpix, spix_val1, xcolors[v], spr);
			dpix++;
		}
		return spix;
	}
	function linetoscr_16_shrink1_sh_spr(spix, dpix, stoppos) {
		return linetoscr_16_shrink1_sh_func(spix, dpix, stoppos, true);
	}
	function linetoscr_16_shrink1_sh(spix, dpix, stoppos) {
		return linetoscr_16_shrink1_sh_func(spix, dpix, stoppos, false);
	}

	function linetoscr_16_shrink1f_sh_func(spix, dpix, stoppos, spr) {
		var buf = xlinebuffer;

		while (dpix < stoppos) {
			var spix_val1, spix_val2, dpix_val1, dpix_val2;
			var v;
			var off;
			spix_val1 = pixdata.apixels[spix++];
			spix_val2 = pixdata.apixels[spix++];
			off = ((spix_val2 & 3) * 4) + (spix_val1 & 3) + ((spix_val1 | spix_val2) & 16);
			v = (colors_for_drawing.color_regs_ecs[off] & 0xccc) << 0;
			v |= v >> 2;
			dpix_val1 = xcolors[v];
			v = (colors_for_drawing.color_regs_ecs[off] & 0x333) << 2;
			v |= v >> 2;
			dpix_val2 = xcolors[v];
			buf[dpix + xlinebuffer_pos] = shsprite(dpix, spix_val1, merge_2pixel16(dpix_val1, dpix_val2), spr);
			dpix++;
		}
		return spix;
	}
	function linetoscr_16_shrink1f_sh_spr(spix, dpix, stoppos) {
		return linetoscr_16_shrink1f_sh_func(spix, dpix, stoppos, true);
	}
	function linetoscr_16_shrink1f_sh(spix, dpix, stoppos) {
		return linetoscr_16_shrink1f_sh_func(spix, dpix, stoppos, false);
	}

	function linetoscr_32_shrink2_sh_func(spix, dpix, stoppos, spr) {
		var buf = xlinebuffer;

		while (dpix < stoppos) {
			var spix_val1, spix_val2;
			var v;
			var off;
			spix_val1 = pixdata.apixels[spix++];
			spix_val2 = pixdata.apixels[spix++];
			off = ((spix_val2 & 3) * 4) + (spix_val1 & 3) + ((spix_val1 | spix_val2) & 16);
			v = (colors_for_drawing.color_regs_ecs[off] & 0xccc) << 0;
			v |= v >> 2;
			buf[dpix + xlinebuffer_pos] = shsprite(dpix, spix_val1, xcolors[v], spr);
			spix+=2;
			dpix++;
		}
		return spix;
	}
	function linetoscr_32_shrink2_sh_spr(spix, dpix, stoppos) {
		return linetoscr_32_shrink2_sh_func(spix, dpix, stoppos, true);
	}
	function linetoscr_32_shrink2_sh(spix, dpix, stoppos) {
		return linetoscr_32_shrink2_sh_func(spix, dpix, stoppos, false);
	}

	function linetoscr_32_shrink2f_sh_func(spix, dpix, stoppos, spr) {
		var buf = xlinebuffer;

		while (dpix < stoppos) {
			var spix_val1, spix_val2, dpix_val1, dpix_val2, dpix_val3, dpix_val4;
			var v;
			var off;
			spix_val1 = pixdata.apixels[spix++];
			spix_val2 = pixdata.apixels[spix++];
			off = ((spix_val2 & 3) * 4) + (spix_val1 & 3) + ((spix_val1 | spix_val2) & 16);
			v = (colors_for_drawing.color_regs_ecs[off] & 0xccc) << 0;
			v |= v >> 2;
			dpix_val1 = xcolors[v];
			v = (colors_for_drawing.color_regs_ecs[off] & 0x333) << 2;
			v |= v >> 2;
			dpix_val2 = xcolors[v];
			dpix_val3 = merge_2pixel32 (dpix_val1, dpix_val2);
			spix_val1 = pixdata.apixels[spix++];
			spix_val2 = pixdata.apixels[spix++];
			off = ((spix_val2 & 3) * 4) + (spix_val1 & 3) + ((spix_val1 | spix_val2) & 16);
			v = (colors_for_drawing.color_regs_ecs[off] & 0xccc) << 0;
			v |= v >> 2;
			dpix_val1 = xcolors[v];
			v = (colors_for_drawing.color_regs_ecs[off] & 0x333) << 2;
			v |= v >> 2;
			dpix_val2 = xcolors[v];
			dpix_val4 = merge_2pixel32 (dpix_val1, dpix_val2);
			buf[dpix + xlinebuffer_pos] = shsprite(dpix, spix_val1, merge_2pixel32(dpix_val3, dpix_val4), spr);
			dpix++;
		}
		return spix;
	}
	function linetoscr_32_shrink2f_sh_spr(spix, dpix, stoppos) {
		return linetoscr_32_shrink2f_sh_func(spix, dpix, stoppos, true);
	}
	function linetoscr_32_shrink2f_sh(spix, dpix, stoppos) {
		return linetoscr_32_shrink2f_sh_func(spix, dpix, stoppos, false);
	}

	function linetoscr_16_shrink2_sh_func(spix, dpix, stoppos, spr) {
		var buf = xlinebuffer;

		while (dpix < stoppos) {
			var spix_val1, spix_val2;
			var v;
			var off;
			spix_val1 = pixdata.apixels[spix++];
			spix_val2 = pixdata.apixels[spix++];
			off = ((spix_val2 & 3) * 4) + (spix_val1 & 3) + ((spix_val1 | spix_val2) & 16);
			v = (colors_for_drawing.color_regs_ecs[off] & 0xccc) << 0;
			v |= v >> 2;
			buf[dpix + xlinebuffer_pos] = shsprite(dpix, spix_val1, xcolors[v], spr);
			spix += 2;
			dpix++;
		}
		return spix;
	}
	function linetoscr_16_shrink2_sh_spr(spix, dpix, stoppos) {
		return linetoscr_16_shrink2_sh_func(spix, dpix, stoppos, true);
	}
	function linetoscr_16_shrink2_sh(spix, dpix, stoppos) {
		return linetoscr_16_shrink2_sh_func(spix, dpix, stoppos, false);
	}

	function linetoscr_16_shrink2f_sh_func (spix, dpix, stoppos, spr) {
		var buf = xlinebuffer;

		while (dpix < stoppos) {
			var spix_val1, spix_val2, dpix_val1, dpix_val2, dpix_val3, dpix_val4;
			var v;
			var off;
			spix_val1 = pixdata.apixels[spix++];
			spix_val2 = pixdata.apixels[spix++];
			off = ((spix_val2 & 3) * 4) + (spix_val1 & 3) + ((spix_val1 | spix_val2) & 16);
			v = (colors_for_drawing.color_regs_ecs[off] & 0xccc) << 0;
			v |= v >> 2;
			dpix_val1 = xcolors[v];
			v = (colors_for_drawing.color_regs_ecs[off] & 0x333) << 2;
			v |= v >> 2;
			dpix_val2 = xcolors[v];
			dpix_val3 = merge_2pixel32 (dpix_val1, dpix_val2);
			spix_val1 = pixdata.apixels[spix++];
			spix_val2 = pixdata.apixels[spix++];
			off = ((spix_val2 & 3) * 4) + (spix_val1 & 3) + ((spix_val1 | spix_val2) & 16);
			v = (colors_for_drawing.color_regs_ecs[off] & 0xccc) << 0;
			v |= v >> 2;
			dpix_val1 = xcolors[v];
			v = (colors_for_drawing.color_regs_ecs[off] & 0x333) << 2;
			v |= v >> 2;
			dpix_val2 = xcolors[v];
			dpix_val4 = merge_2pixel32 (dpix_val1, dpix_val2);
			buf[dpix + xlinebuffer_pos] = shsprite(dpix, spix_val1, merge_2pixel16 (dpix_val3, dpix_val4), spr);
			dpix++;
		}
		return spix;
	}
	function linetoscr_16_shrink2f_sh_spr(spix, dpix, stoppos) {
		return linetoscr_16_shrink2f_sh_func(spix, dpix, stoppos, true);
	}
	function linetoscr_16_shrink2f_sh(spix, dpix, stoppos) {
		return linetoscr_16_shrink2f_sh_func(spix, dpix, stoppos, false);
	}

	/*-----------------------------------------------------------------------*/
	/* auto-generated functions */

	function linetoscr_16(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		if (bplham) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				out_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bplehb) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_stretch1(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		}
		return spix;
	}

	function linetoscr_16_stretch2(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink1(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		if (bplham) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix += 2;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix += 2;
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix += 2;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bplehb) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix += 2;
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix += 2;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink1f(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		if (bplham) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bplehb) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink2(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		if (bplham) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix += 4;
				out_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix += 4;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix += 4;
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix += 4;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bplehb) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix += 4;
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix += 4;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink2f(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		if (bplham) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bplehb) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_stretch1_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_stretch2_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink1_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink1f_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink2_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink2f_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_aga_spronly(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (1) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var out_val = 0;
				spix++;
				out_val = p_acolors[0];
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_stretch1_aga_spronly(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (1) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var out_val = 0;
				spix++;
				out_val = p_acolors[0];
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				}
			}
		}
		return spix;
	}

	function linetoscr_16_stretch2_aga_spronly(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (1) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var out_val = 0;
				spix++;
				out_val = p_acolors[0];
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				var out_val3 = out_val;
				var out_val4 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					var sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 2].data) {
					sprcol = render_sprites(dpix + 2, 0, sprpix_val, 1);
					if (sprcol) {
						out_val3 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 3].data) {
					sprcol = render_sprites(dpix + 3, 0, sprpix_val, 1);
					if (sprcol) {
						out_val4 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val3; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val4; dpix++;
				}
			}
		}
		return spix;
	}

	function linetoscr_16_shrink1_aga_spronly(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (1) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var out_val = 0;
				spix++;
				out_val = p_acolors[0];
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink1f_aga_spronly(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (1) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var out_val = 0;
				spix++;
				out_val = p_acolors[0];
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink2_aga_spronly(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (1) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var out_val = 0;
				spix++;
				out_val = p_acolors[0];
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink2f_aga_spronly(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (1) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var out_val = 0;
				spix++;
				out_val = p_acolors[0];
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_aga(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bplehb) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_stretch1_aga(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		}
		return spix;
	}

	function linetoscr_16_stretch2_aga(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink1_aga(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix += 2;
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix += 2;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix += 2;
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix += 2;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bplehb) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix += 2;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink1f_aga(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bplehb) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink2_aga(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix += 4;
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix += 4;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix += 4;
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix += 4;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bplehb) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix += 4;
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink2f_aga(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else if (bplehb) {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		} else {
			if ((dpix + xlinebuffer_pos) & 2) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
			if (dpix >= dpix_end)
				return spix;
			var rem = (dpix_end + xlinebuffer_pos) & 2;
			if (rem)
				dpix_end--;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = ((out_val << 16) | (dpix_val & 0xFFFF)) >>> 0;
				buf[dpix + xlinebuffer_pos] = out_val >>> 16;
				buf[dpix + xlinebuffer_pos + 1] = out_val & 0xffff;
				dpix += 2;
			}
			if (rem) {
				var spix_val = 0;
				var dpix_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				buf[dpix + xlinebuffer_pos] = dpix_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_aga_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 1, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_stretch1_aga_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				}
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 1, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				}
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				}
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				}
			}
		}
		return spix;
	}

	function linetoscr_16_stretch2_aga_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				var out_val3 = out_val;
				var out_val4 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					var sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 2].data) {
					sprcol = render_sprites(dpix + 2, 0, sprpix_val, 1);
					if (sprcol) {
						out_val3 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 3].data) {
					sprcol = render_sprites(dpix + 3, 0, sprpix_val, 1);
					if (sprcol) {
						out_val4 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val3; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val4; dpix++;
				}
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				var out_val3 = out_val;
				var out_val4 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					var sprcol = render_sprites(dpix, 1, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 1, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 2].data) {
					sprcol = render_sprites(dpix + 2, 1, sprpix_val, 1);
					if (sprcol) {
						out_val3 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 3].data) {
					sprcol = render_sprites(dpix + 3, 1, sprpix_val, 1);
					if (sprcol) {
						out_val4 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val3; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val4; dpix++;
				}
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				var out_val3 = out_val;
				var out_val4 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					var sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 2].data) {
					sprcol = render_sprites(dpix + 2, 0, sprpix_val, 1);
					if (sprcol) {
						out_val3 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 3].data) {
					sprcol = render_sprites(dpix + 3, 0, sprpix_val, 1);
					if (sprcol) {
						out_val4 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val3; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val4; dpix++;
				}
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				var out_val3 = out_val;
				var out_val4 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					var sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 2].data) {
					sprcol = render_sprites(dpix + 2, 0, sprpix_val, 1);
					if (sprcol) {
						out_val3 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 3].data) {
					sprcol = render_sprites(dpix + 3, 0, sprpix_val, 1);
					if (sprcol) {
						out_val4 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val3; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val4; dpix++;
				}
			}
		}
		return spix;
	}

	function linetoscr_16_shrink1_aga_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 1, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink1f_aga_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 1, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel16(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink2_aga_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 1, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_16_shrink2f_aga_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				tmp_val2 = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				tmp_val3 = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 1, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel16(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel16(tmp_val3, dpix_val);
				dpix_val = merge_2pixel16(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_stretch1(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_stretch2(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink1(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix += 2;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix += 2;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink1f(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink2(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix += 4;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix += 4;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix += 4;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink2f(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[lookup[spix_val]];
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_stretch1_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_stretch2_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink1_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink1f_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink2_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink2f_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = ham_linebuf[spix];
				dpix_val = p_xcolors[spix_val];
				sprpix_val = pixdata.apixels[spix];
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[lookup[spix_val]];
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = p_acolors[spix_val];
				else
					dpix_val = p_xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >>> 1) & 0x777];
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 0);
					if (sprcol) {
						var spcol = p_acolors[sprcol];
						out_val = spcol;
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_aga_spronly(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (1) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var out_val = 0;
				spix++;
				out_val = p_acolors[0];
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_stretch1_aga_spronly(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (1) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var out_val = 0;
				spix++;
				out_val = p_acolors[0];
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				}
			}
		}
		return spix;
	}

	function linetoscr_32_stretch2_aga_spronly(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (1) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var out_val = 0;
				spix++;
				out_val = p_acolors[0];
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				var out_val3 = out_val;
				var out_val4 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					var sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 2].data) {
					sprcol = render_sprites(dpix + 2, 0, sprpix_val, 1);
					if (sprcol) {
						out_val3 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 3].data) {
					sprcol = render_sprites(dpix + 3, 0, sprpix_val, 1);
					if (sprcol) {
						out_val4 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val3; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val4; dpix++;
				}
			}
		}
		return spix;
	}

	function linetoscr_32_shrink1_aga_spronly(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (1) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var out_val = 0;
				spix++;
				out_val = p_acolors[0];
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink1f_aga_spronly(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (1) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var out_val = 0;
				spix++;
				out_val = p_acolors[0];
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink2_aga_spronly(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (1) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var out_val = 0;
				spix++;
				out_val = p_acolors[0];
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink2f_aga_spronly(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		if (1) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var out_val = 0;
				spix++;
				out_val = p_acolors[0];
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_aga(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_stretch1_aga(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_stretch2_aga(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink1_aga(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix += 2;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix += 2;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink1f_aga(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink2_aga(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix += 4;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix += 4;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink2f_aga(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_aga_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 1, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_stretch1_aga_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				}
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 1, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 1, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				}
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				}
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				}
			}
		}
		return spix;
	}

	function linetoscr_32_stretch2_aga_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				var out_val3 = out_val;
				var out_val4 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					var sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 2].data) {
					sprcol = render_sprites(dpix + 2, 0, sprpix_val, 1);
					if (sprcol) {
						out_val3 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 3].data) {
					sprcol = render_sprites(dpix + 3, 0, sprpix_val, 1);
					if (sprcol) {
						out_val4 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val3; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val4; dpix++;
				}
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				var out_val3 = out_val;
				var out_val4 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					var sprcol = render_sprites(dpix, 1, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 1, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 2].data) {
					sprcol = render_sprites(dpix + 2, 1, sprpix_val, 1);
					if (sprcol) {
						out_val3 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 3].data) {
					sprcol = render_sprites(dpix + 3, 1, sprpix_val, 1);
					if (sprcol) {
						out_val4 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val3; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val4; dpix++;
				}
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				var out_val3 = out_val;
				var out_val4 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					var sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 2].data) {
					sprcol = render_sprites(dpix + 2, 0, sprpix_val, 1);
					if (sprcol) {
						out_val3 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 3].data) {
					sprcol = render_sprites(dpix + 3, 0, sprpix_val, 1);
					if (sprcol) {
						out_val4 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val3; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val4; dpix++;
				}
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				out_val = dpix_val;
				{
				var out_val1 = out_val;
				var out_val2 = out_val;
				var out_val3 = out_val;
				var out_val4 = out_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					var sprcol = render_sprites(dpix, 0, sprpix_val, 1);
					if (sprcol) {
						out_val1 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 1].data) {
					sprcol = render_sprites(dpix + 1, 0, sprpix_val, 1);
					if (sprcol) {
						out_val2 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 2].data) {
					sprcol = render_sprites(dpix + 2, 0, sprpix_val, 1);
					if (sprcol) {
						out_val3 = p_acolors[sprcol];
					}
				}
				if (spritepixels[dpix + spritepixels_pos + 3].data) {
					sprcol = render_sprites(dpix + 3, 0, sprpix_val, 1);
					if (sprcol) {
						out_val4 = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val1; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val2; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val3; dpix++;
				buf[dpix + xlinebuffer_pos] = out_val4; dpix++;
				}
			}
		}
		return spix;
	}

	function linetoscr_32_shrink1_aga_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 1, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink1f_aga_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 1, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val;
				spix++;
				tmp_val = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				dpix_val = merge_2pixel32(dpix_val, tmp_val);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink2_aga_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 1, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix += 4;
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink2f_aga_spr(spix, dpix, dpix_end)
	{
		var buf = xlinebuffer;
		var sprcol = 0;
		var xor_val = bplxor;
		var and_val = bpland;
		if (bplham) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				tmp_val2 = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				spix++;
				tmp_val3 = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				spix_val = ham_linebuf[spix];
				dpix_val = CONVERT_RGB(spix_val);
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bpldualpf) {
			var lookup	= bpldualpfpri ? dblpf_ind2_aga : dblpf_ind1_aga;
			var lookup_no = bpldualpfpri ? dblpf_2nd2	 : dblpf_2nd1;
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				tmp_val2 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				spix++;
				tmp_val3 = dpix_val;
				spix_val = pixdata.apixels[spix];
				sprpix_val = spix_val;
				{
					var val = lookup[spix_val];
					if (lookup_no[spix_val])
						val += dblpfofs[bpldualpf2of];
					val ^= xor_val;
					dpix_val = p_acolors[val];
				}
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 1, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else if (bplehb) {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				if (spix_val >= 32 && spix_val < 64) {
					var c = (colors_for_drawing.color_regs_aga[spix_val - 32] >>> 1) & 0x7F7F7F;
					dpix_val = CONVERT_RGB(c);
				} else
					dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		} else {
			while (dpix < dpix_end) {
				var sprpix_val = 0;
				var spix_val = 0;
				var dpix_val = 0;
				var out_val = 0;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				{
				var tmp_val, tmp_val2, tmp_val3;
				spix++;
				tmp_val = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val2 = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				spix++;
				tmp_val3 = dpix_val;
				sprpix_val = pixdata.apixels[spix];
				spix_val = (pixdata.apixels[spix] ^ xor_val) & and_val;
				dpix_val = p_acolors[spix_val];
				tmp_val = merge_2pixel32(tmp_val, tmp_val2);
				tmp_val2 = merge_2pixel32(tmp_val3, dpix_val);
				dpix_val = merge_2pixel32(tmp_val, tmp_val2);
				spix++;
				}
				out_val = dpix_val;
				if (spritepixels[dpix + spritepixels_pos].data) {
					sprcol = render_sprites(dpix + 0, 0, sprpix_val, 1);
					if (sprcol) {
						out_val = p_acolors[sprcol];
					}
				}
				buf[dpix + xlinebuffer_pos] = out_val; dpix++;
			}
		}
		return spix;
	}

}
