/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
***************************************************************************
* Notes: 
*  - Ported from WinUAE 2.5.0
*  - AGA support is commented out.
*
**************************************************************************/

function Playfield() {
	function Decision() {     
		this.plfleft = 0;
		this.plfright = 0;
		this.plflinelen = 0;
		this.diwfirstword = 0;
		this.diwlastword = 0;
		this.ctable = 0;
		this.bplcon0 = 0;
		this.bplcon2 = 0;
		this.bplcon3 = 0;
/*#ifdef AGA
		this.bplcon4 = 0;
#endif*/
		this.nr_planes = 0;
		this.bplres = 0;
		this.ehb_seen = false;
		this.ham_seen = false;
		this.ham_at_start = false;

		this.clr = function () {
         this.plfleft = 0;
         this.plfright = 0;
         this.plflinelen = 0;
         this.diwfirstword = 0;
         this.diwlastword = 0;
         this.ctable = 0;
         this.bplcon0 = 0;
         this.bplcon2 = 0;
         this.bplcon3 = 0;
         /*#ifdef AGA
          this.bplcon4 = 0;
          #endif*/
         this.nr_planes = 0;
         this.bplres = 0;
         this.ehb_seen = false;
         this.ham_seen = false;
         this.ham_at_start = false;
      };

		this.set = function(src) {
			this.plfleft = src.plfleft;  
			this.plfright = src.plfright; 
			this.plflinelen = src.plflinelen;
			this.diwfirstword = src.diwfirstword;
			this.diwlastword = src.diwlastword; 
			this.ctable = src.ctable;                                                           
			this.bplcon0 = src.bplcon0;  
			this.bplcon2 = src.bplcon2;  
			this.bplcon3 = src.bplcon3;  
/*#ifdef AGA 
			this.bplcon4 = src.bplcon4;  
#endif*/ 
			this.nr_planes = src.nr_planes;
			this.bplres = src.bplres;   
			this.ehb_seen = src.ehb_seen;
			this.ham_seen = src.ham_seen;
			this.ham_at_start = src.ham_at_start;
		}
	}
	
	function ColorEntry() {
		this.color_regs_ecs = new Uint16Array(32);
//#ifndef AGA
		this.acolors = new Uint32Array(32);
/*#else
		this.acolors = new Uint32Array(256);
		this.color_regs_aga = new Uint32Array(256);
#endif*/
		this.borderblank = false;
	}

	function ColorChange() {
		this.linepos = 0;
		this.regno = 0;
		this.value = 0;

		this.set = function (v) {
         this.linepos = v.linepos;
         this.regno = v.regno;
         this.value = v.value;
      };	
		this.cmp = function(v) {
			return (this.linepos == v.linepos && this.regno == v.regno && this.value == v.value ? 0 : 1); 
		}	
	}

	function DrawInfo() {
		this.first_sprite_entry = 0; 
		this.last_sprite_entry = 0;
		this.first_color_change = 0; 
		this.last_color_change = 0;
		this.nr_color_changes = 0; 
		this.nr_sprites = 0;
	}

	function VidBuffer() {
		this.rowbytes = 0; /* Bytes per row in the memory pointed at by bufmem. */
		this.pixbytes = 0; /* Bytes per pixel. */
		/* size of this buffer */
		this.width_allocated = 0;
		this.height_allocated = 0;
		/* size of max visible image */
		this.outwidth = 0;
		this.outheight = 0;
		/* nominal size of image for centering */
		this.inwidth = 0;
		this.inheight = 0;
		/* same but doublescan multiplier included */
		this.inwidth2 = 0;
		this.inheight2 = 0;
		/* extra width, chipset hpos extra in right border */
		this.extrawidth = 0;

		//this.xoffset = 0; /* superhires pixels from left edge */
		//this.yoffset = 0; /* lines from top edge */
		this.inxoffset = 0; /* positive if sync positioning */
		//this.inyoffset = 0;
	}	

	/*---------------------------------*/
	/* drawing */	
		
	//const dblpfofs = [0, 2, 4, 8, 16, 32, 64, 128]; //DELETE

	var dblpf_ms1 = new Uint8Array(256);	
	var dblpf_ms2 = new Uint8Array(256);	
	var dblpf_ms = new Uint8Array(256);	
	var dblpf_ind1 = new Uint8Array(256);	
	var dblpf_ind2 = new Uint8Array(256);	
	var dblpf_2nd1 = new Uint8Array(256);	
	var dblpf_2nd2 = new Uint8Array(256);	
	
	var linestate = new Uint8Array((MAXVPOS + 2) * 2 + 1); //[(MAXVPOS + 2) * 2 + 1]; 
	for (var i = 0; i < linestate.length; i++)
		linestate[i] = 0;
	
	var line_data = []; //[(MAXVPOS + 2) * 2][MAX_PLANES * MAX_WORDS_PER_LINE * 2];
	for (var i = 0; i < (MAXVPOS + 2) * 2; i++) { 
		line_data[i] = []; 
		for (var j = 0; j < MAX_PLANES; j++) { 
			line_data[i][j] = new Uint32Array(MAX_WORDS_PER_LINE * 2); 
			for (var k = 0; k < MAX_WORDS_PER_LINE * 2; k++) 
				line_data[i][j][k] = 0; 
		}
	}

	var line_decisions = []; 
	for (var i = 0; i < 2 * (MAXVPOS + 2) + 1; i++)
		line_decisions[i] = new Decision();
	var color_tables = []; 
	for (var i = 0; i < 2; i++) { 
		color_tables[i] = []; 
		for (var j = 0; j < COLOR_TABLE_SIZE; j++) 
			color_tables[i][j] = new ColorEntry();
	}
	var color_changes = []; 
	for (var i = 0; i < 2; i++) { 
		color_changes[i] = []; 
		for (var j = 0; j < MAX_REG_CHANGE; j++) 
			color_changes[i][j] = new ColorChange();
	}
	var line_drawinfo = []; 
	for (var i = 0; i < 2; i++) { 
		line_drawinfo[i] = []; 
		for (var j = 0; j < 2 * (MAXVPOS + 2) + 1; j++) 
			line_drawinfo[i][j] = new DrawInfo();
	}
	
	var gfxvidinfo = {
		maxblocklines:0,
		drawbuffer: new VidBuffer(),
		gfx_resolution_reserved: 0, // reserved space for currprefs.hresolution
		gfx_vresolution_reserved: 0, // reserved space for currprefs.hresolution
		xchange: 0, /* how many superhires pixels in one pixel in buffer */
		ychange: 0 /* how many interlaced lines in one line in buffer */
	};

	var xlinebuffer = new Uint32Array(MAX_PIXELS_PER_LINE);
	for (var i = 0; i < xlinebuffer.length; i++) xlinebuffer[i] = 0; 

	var ham_linebuf = new Uint32Array(MAX_PIXELS_PER_LINE << 1);
	for (var i = 0; i < ham_linebuf.length; i++) ham_linebuf[i] = 0; 

	var apixels = new Uint8Array(MAX_PIXELS_PER_LINE << 1);
	for (var i = 0; i < apixels.length; i++) apixels[i] = 0; 
	
	var colors_for_drawing = new ColorEntry();
	var current_colors = new ColorEntry();

	var xcolors = new Uint32Array(4096);
	for (var i = 0; i < xcolors.length; i++) xcolors[i] = 0;
	
	var thisline_decision = new Decision();	
	var thisline_changed = 0;
	
	var amiga2aspect_line_map = null;
	var native2amiga_line_map = null;

	var curr_sprite_entries = null;
	var prev_sprite_entries = null;
	var curr_color_changes = null;
	var prev_color_changes = null;
	var curr_drawinfo = null;
	var prev_drawinfo = null;
	var curr_color_tables = null;
	var prev_color_tables = null;	
	var current_change_set = 0;
	
	var autoscale_bordercolors	= 0;
	var frame_redraw_necessary = 0;	
		
	var first_drawn_line = 0;
	var last_drawn_line = 0;
	var first_block_line = 0;
	var last_block_line = 0;
	var thisframe_first_drawn_line = 0;
	var thisframe_last_drawn_line = 0;
	
	var drawing_color_matches = -1;
	var linedbl = 0, linedbld = 0;	
	var min_diwstart = 0;
	var max_diwstop = 0;
	var min_ypos_for_screen = 0;
	var max_ypos_thisframe = 0;
	
	var visible_left_border = 0;	
	var visible_right_border = 0;	
	var visible_left_start = 0;
	var visible_right_stop = MAX_STOP;
	var visible_top_start = 0;
	var visible_bottom_stop = MAX_STOP;	
	var thisframe_y_adjust = 0;	
	var thisframe_y_adjust_real = 0;
	var max_drawn_amiga_line = 0;	
	var linetoscr_x_adjust_bytes = 0;	
	var last_max_ypos = 0;	
	var extra_y_adjust = 0;	
	var center_reset = true;
	this.framecnt = 0;
	var last_redraw_point = 0;
	var lores_shift = 0;
	
	var dp_for_drawing = null;
	var dip_for_drawing = null;
	var hposblank = 0;
	//var bplxor = 0;

	var playfield_start = 0, playfield_end = 0;		
	var real_playfield_start = 0, real_playfield_end = 0;
	var linetoscr_diw_start = 0, linetoscr_diw_end = 0;
	var native_ddf_left = 0, native_ddf_right = 0;

	var unpainted = 0; /* How many pixels in window coordinates which are to the left of the left border.  */
	var pixels_offset = 0;
	var src_pixel = 0, ham_src_pixel = 0;
	var ham_decode_pixel = 0;
	var ham_lastcolor = 0;

	var next_color_change = 0;
	var next_color_entry = 0;
	var remembered_color_entry = -1;
	var color_src_match = -1;
	var color_dest_match = -1;
	var color_compare_result = 0;

	var res_shift = 0;
	var bplres = 0;
	var bplplanecnt = 0;
	var bplham = false;
	var bplehb = false;
	var issprites = 0;
	var ecsshres = false;
	var plf1pri = 0;
	var plf2pri = 0;
	var plf_sprite_mask = 0;
	var bpldualpf = false;
	var bpldualpfpri = false;	
	
	/*---------------------------------*/
	/* sprites */	
	
	function Sprite() {
		this.pt = 0;
		this.xpos = 0;
		this.vstart = 0;
		this.vstop = 0;
		this.dblscan = 0; /* AGA SSCAN2 */
		this.armed = 0;
		this.dmastate = 0;
		this.dmacycle = 0;
		this.ptxhpos = 0;

		this.clr = function() {
			this.pt = 0;
			this.xpos = 0;
			this.vstart = 0;
			this.vstop = 0;
			//this.dblscan = 0;
			this.armed = 0;
			this.dmastate = 0;
			this.dmacycle = 0;
			this.ptxhpos = 0;
		}	
	}
	
	function SpriteEntry() {
		this.pos = 0;
		this.max = 0;
		this.first_pixel = 0;
		this.has_attached = false;
	}

	function SpritePixelsBuf() {
		this.attach = 0;
		this.stdata = 0;
		this.data = 0;
		
		this.clr = function() {
			this.attach = 0;
			this.stdata = 0;
			this.data = 0;
		}
	}

	var sprinit = false;
	var sprtaba = new Uint32Array(256);
	var sprtabb = new Uint32Array(256);
	var sprite_ab_merge = new Uint32Array(256);
	var sprclx = new Uint32Array(16);
	var clxmask = new Uint32Array(16);

	var sprite_offs = new Uint8Array(256);	
	var clxtab = new Uint32Array(256);	
	
	var spr = [];
	for (var i = 0; i < MAX_SPRITES; i++)
		spr[i] = new Sprite();
		
	/*union sps_union {
		uae_u8 bytes[MAX_SPR_PIXELS * 2];
		uae_u32 words[MAX_SPR_PIXELS * 2 / 4];
	};*/
	var spixstate = new Uint8Array(MAX_SPR_PIXELS << 1);	
	var spixels = new Uint16Array(MAX_SPR_PIXELS << 1);
	for (var i = 0; i < MAX_SPR_PIXELS << 1; i++)
		spixstate[i] = spixels[i] = 0;
	
	var sprite_entries = []; //[2][MAX_SPR_PIXELS / 16];
	for (var i = 0; i < 2; i++) {
		sprite_entries[i] = [];		
		for (var j = 0; j < MAX_SPR_PIXELS >> 4; j++) 
			sprite_entries[i][j] = new SpriteEntry();		
	}

	var spritepixels = []; 
	for (var i = 0; i < MAX_PIXELS_PER_LINE; i++)
		spritepixels[i] = new SpritePixelsBuf();		

	var sprctl = new Uint16Array(MAX_SPRITES);
	var sprpos = new Uint16Array(MAX_SPRITES);
	for (var i = 0; i < MAX_SPRITES; i++)
		sprctl[i] = sprpos[i] = 0;

/*#ifdef AGA
	//[MAX_SPRITES][4]
	var sprdata = [];
	var sprdatb = [];
	for (var i = 0; i < MAX_SPRITES; i++) {
		sprdata[i] = new Uint16Array(4);
		sprdatb[i] = new Uint16Array(4);
		for (var j = 0; j < 4; j++) {
			sprdata[i][j] = 0;
			sprdatb[i][j] = 0;
		}
	}
#else*/
	//[MAX_SPRITES][1]
	var sprdata = [];
	var sprdatb = [];
	for (var i = 0; i < MAX_SPRITES; i++) {
		sprdata[i] = new Uint16Array(1);
		sprdatb[i] = new Uint16Array(1);
		sprdata[i][0] = 0;
		sprdatb[i][0] = 0;
	}	
//#endif

	var clxcon = 0;
	var clxcon_bpl_enable = 0;
	var clxcon_bpl_match = 0;
	var clxcon2 = 0;
	var clxdat = 0;

	var sprres = 0;
	var nr_armed = 0;

	var sprite_buffer_res = 0;
	var sprite_vblank_endline = VBLANK_SPRITE_PAL;
	var sprite_minx = 0;
	var sprite_maxx = 0;
	var sprite_width = 0;
	var sprite_first_x = 0;
	var sprite_last_x = 0;	
				
	var sprite_0 = 0;
	var sprite_0_width = 0;
	var sprite_0_height = 0;
	var sprite_0_doubled = 0;
	var sprite_0_colors = [0,0,0,0];

	var next_sprite_entry = 0;
	var next_sprite_forced = 1;
	var prev_next_sprite_entry = 0;
	var last_sprite_point = 0;
	//var magic_sprite_mask = 0xff;

	/*---------------------------------*/
	/* playfield */	

	var bplcon0 = 0;
	var bplcon1 = 0;
	var bplcon2 = 0;
	var bplcon3 = 0;
	var bplcon4 = 0;

	var bpl1mod = 0;
	var bpl2mod = 0;
	
	var bplxdat = [0,0,0,0,0,0,0,0];
	var bplpt = [0,0,0,0,0,0,0,0];
	var bplptx = [0,0,0,0,0,0,0,0];

	var diwstrt = 0;
	var diwstop = 0;
	var ddfstrt = 0;
	var ddfstrt_old_hpos = -1;
	var ddfstop = 0;
	var ddf_change = 0;
	var diwhigh = 0;
	var diwhigh_written = false;
	
	var hdiwstate = 0;
	
	var beamcon0 = 0;
	var new_beamcon0 = 0;
	
	this.vpos = 0;
	this.vpos_count = 0;
	this.vpos_count_diff = 0;
	this.hpos = function () {
      return Math.floor((AMIGA.events.currcycle - AMIGA.events.eventtab[EV_HSYNC].oldcycles) * CYCLE_UNIT_INV);
   };	
	var vpos_previous = 0;
	var hpos_previous = 0;
	
	this.maxvpos = MAXVPOS;
	this.maxvpos_nom = MAXVPOS;
	this.maxvpos_total = MAXVPOS;
	this.maxhpos = MAXHPOS;
	this.maxhpos_short = MAXHPOS;
	
	this.lof_store = 0;
	this.lof_current = 0;
	this.lof_previous = 0;
	this.lof_changed = 0;
	this.lof_changing = 0;
	this.lol = 0;
	
	this.vblank_hz = 0;	
		
	var aga_mode = 0;
	var direct_rgb = 0;
	
	var prevbpl = []; //[2][MAXVPOS][8];	
	for (var i = 0; i < 2; i++) {
		prevbpl[i] = [];		
		for (var j = 0; j < MAXVPOS; j++) { 
			prevbpl[i][j] = new Uint32Array(8);		
			for (var k = 0; k < 8; k++) { 
				prevbpl[i][j][k] = 0;
			}
		}
	}
	
	//var scandoubled_line = 0;
	var doublescan = 0;
	var interlace_seen = 0;
	var interlace_changed = 0;
	var lof_togglecnt_nlace = 0; 
	var lof_togglecnt_lace = 0;
	var nlace_cnt = 0;
	
	var minfirstline = 0;	
	var equ_vblank_endline = 0;
	var equ_vblank_toggle = false;
	
	this.vtotal = MAXVPOS_PAL;
   this.htotal = MAXHPOS_PAL;
	this.hsstop = 0;
   this.hbstrt = 0;
   this.hbstop = 0;
	this.vsstop = 0;
   this.vbstrt = 0;
   this.vbstop = 0;
	this.hsstrt = 0;
   this.vsstrt = 0;
   this.hcenter = 0;
	var hsyncstartpos = 0;
	var hsyncendpos = 0;
	
	var diwstate = 0;
	var ddfstate = 0;
	var diw_change = 2;
	var diw_hstrt = 0;
	var diw_hstop = 0;
	var diw_hcounter = 0;
	var last_hdiw = 0;
	
	var diwfirstword = 0;
	var diwlastword = 0; 
	var plffirstline = 0;
	var plflastline = 0;

	var plfstrt = 0;
	var plfstrt_sprite = 0;
	var plfstrt_start = 0;
	var plfstop = 0;
	
	var plf_state = 0;
	
	var nextline_how = 0;
	var next_lineno = 0;
	var prev_lineno = -1;
	
	var first_bpl_vpos = 0;
	var first_planes_vpos = 0;	
	var last_planes_vpos = 0;
	var firstword_bplcon1 = 0;
	var diwfirstword_total = 0;
	var diwlastword_total = 0;
	var ddffirstword_total = 0;
	var ddflastword_total = 0;
	var plffirstline_total = 0;
	var plflastline_total = 0;
	
	/*var lightpen_active = 0;
	var lightpen_triggered = 0;
	var lightpen_cx = 0;
	var lightpen_cy = 0;
	var lightpen_y1 = -1;
	var lightpen_y2 = -1;
	var vpos_lpen = 0;
	var hpos_lpen = 0;*/

	var bplcon0_d = 0;
	var bplcon0_dd = 0;
	var bplcon1_hpos = 0;
	var bplcon1t = 0;
	var bplcon1t2 = 0;
	
	var badmode = 0;		
	var bplcon0_res = 0;
	var bplcon0_planes = 0;
	var bplcon0_planes_limit = 0;
	
	var fmode = 0;
	var fetchmode = 0;
	var fetchunit = 0;
	var fetchunit_mask = 0;
	const fetchunits = [ 8,8,8,0, 16,8,8,0, 32,16,8,0 ];
	var fetchstart = 0;
	var fetchstart_shift = 0;
	var fetchstart_mask = 0;
	const fetchstarts = [ 3,2,1,0, 4,3,2,0, 5,4,3,0 ];
	var fm_maxplane = 0;
	var fm_maxplane_shift = 0;
	const fm_maxplanes = [ 3,2,1,0, 3,3,2,0, 3,3,3,0 ];
	var real_bitplane_number = []; //[3][3][9];
	
	var fetch_state = 0;
	var fetch_cycle = 0;
	var fetch_modulo_cycle = 0;

	const cycle_sequences = [[2,1,2,1,2,1,2,1], [4,2,3,1,4,2,3,1], [8,4,6,2,7,3,5,1]];
	var cycle_diagram_shift = 0;
	var cycle_diagram_table = null; //[3][3][9][32];
	var cycle_diagram_free_cycles = []; //[3][3][9];
	var cycle_diagram_total_cycles = []; //[3][3][9];
	var curr_diagram = [];	
	
	var estimated_last_fetch_cycle = 0;	
	
	var bpldmasetuphpos = -1;
	var bpldmasetupphase = 0;

	var bpl1dat_written = false;
	var bpl1dat_written_at_least_once = false;
	var bpl1dat_early = false;
	var plfleft_real = -1;
		
	var out_nbits = 0;
	var out_offs = 0;
	var outword = new Uint32Array(MAX_PLANES);	
	var todisplay = []; //[MAX_PLANES][4];
	for (var i = 0; i < MAX_PLANES; i++) {		
		todisplay[i] = new Uint32Array(4);		
		for (var j = 0; j < 4; j++) 
			todisplay[i][j] = 0;		
	}
	var fetched = new Uint32Array(MAX_PLANES);	
	for (var i = 0; i < MAX_PLANES; i++)
		fetched[i] = 0;		
/*#ifdef AGA
	var fetched_aga0 = new Uint32Array(MAX_PLANES);	
	var fetched_aga1 = new Uint32Array(MAX_PLANES);	
#endif*/

	var toscr_res = 0;
	var toscr_nr_planes = 0;
	var toscr_nr_planes2 = 0;
	var toscr_delay1 = 0;
	var toscr_delay2 = 0;
	var toscr_nbits = 0;	

	//var fetchwidth = 0;
	var delayoffset = 0;

	var last_decide_line_hpos = -1;
	var last_ddf_pix_hpos = -1;
	var last_sprite_hpos = -1;
	var last_fetch_hpos = -1;
				
	/*-----------------------------------------------------------------------*/
	/* common */
	/*-----------------------------------------------------------------------*/
		
	/*function RES_SHIFT(res) {
		return res == RES_LORES ? 8 : (res == RES_HIRES ? 4 : 2);
	}*/
	function GET_RES_DENISE(con0) {
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_DENISE)) con0 &= ~0x40; // SUPERHIRES
		return (con0 & 0x8000) ? RES_HIRES : ((con0 & 0x40) ? RES_SUPERHIRES : RES_LORES);
	}
	function GET_RES_AGNUS(con0) {
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)) con0 &= ~0x40; // SUPERHIRES
		return (con0 & 0x8000) ? RES_HIRES : ((con0 & 0x40) ? RES_SUPERHIRES : RES_LORES);
	}
	function GET_SPRITEWIDTH(fmode) {
		return (((fmode >> 2) & 3) == 3 ? 64 : ((fmode >> 2) & 3) == 0 ? 16 : 32);
	}
	function GET_PLANES(con0) {
		if ((con0 & 0x0010) && (con0 & 0x7000)) return 0; // >8 planes = 0 planes
		if (con0 & 0x0010) return 8; // AGA 8-planes bit
		return (con0 >> 12) & 7; // normal planes bits
	}
	function GET_PLANES_LIMIT(con0) {
		var res = GET_RES_AGNUS(con0);
		var planes = GET_PLANES(con0);
		return real_bitplane_number[fetchmode][res][planes];
	}
	
	this.nodraw = function () {
      return this.framecnt != 0;
   };

	this.doflickerfix = function () {
      return AMIGA.config.video.vresolution && doublescan < 0 && this.vpos < MAXVPOS;
   };
	
 	this.current_maxvpos = function () {
      return this.maxvpos + (this.lof_store ? 1 : 0);
   };	

	this.is_custom_vsync = function () {
      var vp = this.vpos + 1;
      var vpc = this.vpos_count + 1;
      /* Agnus vpos counter keeps counting until it wraps around if VPOSW writes put it past maxvpos */
      if (vp >= this.maxvpos_total)
         vp = 0;
      /* vpos_count >= MAXVPOS just to not crash if VPOSW writes prevent vsync completely */
      return vp == this.maxvpos + this.lof_store || vp == this.maxvpos + this.lof_store + 1 || vpc >= MAXVPOS;
   };	
	
	this.is_linetoggle = function () {
      if (!(beamcon0 & 0x0800) && !(beamcon0 & 0x0020) && (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
         return true; //NTSC and !LOLDIS -> LOL toggles every line
      else if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) && AMIGA.config.video.ntsc)
         return true; //hardwired NTSC Agnus
      return false;
   };	

 	this.is_last_line = function () {
      return this.vpos + 1 == this.maxvpos + this.lof_store;
   };	

	/*-----------------------------------------------------------------------*/
	/* drawing */
	/*-----------------------------------------------------------------------*/
	
	function setup_drawing_tables() {
		for (var i = 0; i < 256; i++) {
			var plane1 = ((i >> 0) & 1) | ((i >> 1) & 2) | ((i >> 2) & 4) | ((i >> 3) & 8);
			var plane2 = ((i >> 1) & 1) | ((i >> 2) & 2) | ((i >> 3) & 4) | ((i >> 4) & 8);

			dblpf_2nd1[i] = plane1 == 0 && plane2 != 0;
			dblpf_2nd2[i] = plane2 != 0;

/*#ifdef AGA
			dblpf_ind1_aga[i] = plane1 == 0 ? plane2 : plane1;
			dblpf_ind2_aga[i] = plane2 == 0 ? plane1 : plane2;
#endif*/
			dblpf_ms1[i] = plane1 == 0 ? (plane2 == 0 ? 16 : 8) : 0;
			dblpf_ms2[i] = plane2 == 0 ? (plane1 == 0 ? 16 : 0) : 8;
			dblpf_ms[i] = i == 0 ? 16 : 8;

			if (plane2 > 0)
				plane2 += 8;
			dblpf_ind1[i] = i >= 128 ? i & 0x7F : (plane1 == 0 ? plane2 : plane1);
			dblpf_ind2[i] = i >= 128 ? i & 0x7F : (plane2 == 0 ? plane1 : plane2);
		}
	}

	this.recreate_aspect_maps = function () {
      var i, h = gfxvidinfo.drawbuffer.height_allocated;
      if (h == 0)
         return;

      linedbld = linedbl = AMIGA.config.video.vresolution;
      if (doublescan > 0 && interlace_seen <= 0) {
         linedbl = 0;
         linedbld = 1;
      }

      amiga2aspect_line_map = new Int32Array((MAXVPOS + 1) * 2 + 1);
      native2amiga_line_map = new Int32Array(h);

      var maxl = (MAXVPOS + 1) << linedbld;
      min_ypos_for_screen = minfirstline << linedbl;
      max_drawn_amiga_line = -1;
      for (i = 0; i < maxl; i++) {
         var v = i - min_ypos_for_screen;
         if (v >= h && max_drawn_amiga_line < 0)
            max_drawn_amiga_line = i - min_ypos_for_screen;
         if (i < min_ypos_for_screen || v >= h)
            v = -1;
         amiga2aspect_line_map[i] = v;
      }
      if (max_drawn_amiga_line < 0)
         max_drawn_amiga_line = maxl - min_ypos_for_screen;
      max_drawn_amiga_line >>>= linedbl;

      if (AMIGA.config.video.ycenter) {
         extra_y_adjust = (h - (this.maxvpos_nom << linedbl)) >> 1;
         if (extra_y_adjust < 0)
            extra_y_adjust = 0;
      }

      for (i = 0; i < h; i++)
         native2amiga_line_map[i] = -1;

      for (i = maxl - 1; i >= min_ypos_for_screen; i--) {
         if (amiga2aspect_line_map[i] == -1)
            continue;
         for (var j = amiga2aspect_line_map[i]; j < h && native2amiga_line_map[j] == -1; j++)
            native2amiga_line_map[j] = i >> linedbl;
      }

      gfxvidinfo.xchange = 1 << (RES_MAX - AMIGA.config.video.hresolution);
      gfxvidinfo.ychange = linedbl ? 1 : 2;

      visible_left_start = 0;
      visible_right_stop = MAX_STOP;
      visible_top_start = 0;
      visible_bottom_stop = MAX_STOP;
      //console.log('recreate_aspect_maps', amiga2aspect_line_map, native2amiga_line_map);
   };	
		
	/*---------------------------------*/

	function xlinecheck(id, start, end) {
		var xstart =  start * gfxvidinfo.drawbuffer.pixbytes;
		var xend = end * gfxvidinfo.drawbuffer.pixbytes;
		var end1 = gfxvidinfo.drawbuffer.rowbytes * gfxvidinfo.drawbuffer.height;
		var min = Math.floor(linetoscr_x_adjust_bytes / gfxvidinfo.drawbuffer.pixbytes);
		var ok = 1;

		if (xend > end1 || xstart >= end1)
			ok = 0;
		if ((xstart % gfxvidinfo.drawbuffer.rowbytes) >= gfxvidinfo.drawbuffer.width * gfxvidinfo.drawbuffer.pixbytes)
			ok = 0;
		if ((xend % gfxvidinfo.drawbuffer.rowbytes) >= gfxvidinfo.drawbuffer.width * gfxvidinfo.drawbuffer.pixbytes)
			ok = 0;
		if (xstart >= xend)
			ok = 0;
		if (xend - xstart > gfxvidinfo.drawbuffer.width * gfxvidinfo.drawbuffer.pixbytes)
			ok = 0;

		if (!ok) {
			console.log(id, start, end, min);
			BUG.info('xlinecheck() ERROR %d-%d (%dx%dx%d %d)', 
				start - min, end - min, gfxvidinfo.drawbuffer.width, gfxvidinfo.drawbuffer.height,
				gfxvidinfo.drawbuffer.pixbytes, gfxvidinfo.drawbuffer.rowbytes);
		}
	}	

	/*---------------------------------*/

	function max_diwlastword() { 
		return (0x1d4 - DISPLAY_LEFT_SHIFT + DIW_DDF_OFFSET - 1) << lores_shift;
	}

 	function xshift(x, shift) {
		return shift < 0 ? x >> (-shift) : x << shift;
	}

	function coord_hw_to_window_x(x) {
		return (x - DISPLAY_LEFT_SHIFT) << lores_shift;
	}
	function coord_window_to_hw_x(x) {
		return (x >> lores_shift) + DISPLAY_LEFT_SHIFT;
	}

	function coord_diw_to_window_x(x) {
		return (x - DISPLAY_LEFT_SHIFT + DIW_DDF_OFFSET - 1) << lores_shift;
	}
	function coord_window_to_diw_x(x) {
		return (x >> lores_shift) + DISPLAY_LEFT_SHIFT - DIW_DDF_OFFSET;
	}	
	
	/*function coord_native_to_amiga_x(x) {
		return xshift(x + visible_left_border, 1 - lores_shift) + 2 * DISPLAY_LEFT_SHIFT - 2 * DIW_DDF_OFFSET;	
	}
	function coord_native_to_amiga_y(y) {
		return native2amiga_line_map[y] + thisframe_y_adjust - minfirstline;
	}*/

	function res_shift_from_window(x) {
		return res_shift >= 0 ? x >> res_shift : x << -res_shift;
	}
	/*function res_shift_from_amiga(x) {
		return res_shift >= 0 ? x >> res_shift : x << -res_shift;
	}*/
	
	/*---------------------------------*/   
	
	this.render_screen = function (immediate) {
      if (AMIGA.config.video.enabled)
         AMIGA.video.render();
      return true;
   };
	this.show_screen = function () {
      if (AMIGA.config.video.enabled)
         AMIGA.video.show(); //flip
      return true;
   };
	
	/*function flush_line(vb, lineno) {
		AMIGA.video.drawline(lineno, xlinebuffer, linetoscr_x_adjust_bytes >> 2);
	}	
	function flush_block(vb, first_line, last_line) {
		console.log('flush_block() called', first_line, last_line);				
	}			
	function flush_screen(vb, first_line, last_line) {
		console.log('flush_screen() called', first_line, last_line);				
	}
	this.do_flush_line = function(vb, lineno) {
		if (lineno < first_drawn_line)
			first_drawn_line = lineno;
		if (lineno > last_drawn_line)
			last_drawn_line = lineno;

		if (gfxvidinfo.maxblocklines == 0)
			flush_line(vb, lineno);
		else {
			if ((last_block_line + 2) < lineno) {
				if (first_block_line != NO_BLOCK)
					flush_block(vb, first_block_line, last_block_line);
				first_block_line = lineno;
			}
			last_block_line = lineno;
			if (last_block_line - first_block_line >= gfxvidinfo.maxblocklines) {
				flush_block(vb, first_block_line, last_block_line);
				first_block_line = last_block_line = NO_BLOCK;
			}
		}
	}*/
	
	this.do_flush_line = function (vb, lineno) {
      if (lineno < first_drawn_line)
         first_drawn_line = lineno;
      if (lineno > last_drawn_line)
         last_drawn_line = lineno;

      AMIGA.video.drawline(lineno, xlinebuffer, linetoscr_x_adjust_bytes >> 2);
   };

	/*this.do_flush_screen = function(vb, start, stop) {	
		if (gfxvidinfo.maxblocklines != 0 && first_block_line != NO_BLOCK)
			flush_block(vb, first_block_line, last_block_line);
		if (start <= stop)
			flush_screen(vb, start, stop);
	}*/
	
	/*---------------------------------*/   
		
	function is_ehb(con0, con2) {
		if (AMIGA.config.chipset.mask & CSMASK_AGA)
			return ((con0 & 0x7010) == 0x6000);
		if (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE)
			return ((con0 & 0xFC00) == 0x6000 || (con0 & 0xFC00) == 0x7000);

		return ((con0 & 0xFC00) == 0x6000 || (con0 & 0xFC00) == 0x7000);// && !currprefs.cs_denisenoehb;
	}	
	
	function is_ham(con0) {
		var p = GET_PLANES(con0);
		if (!(con0 & 0x800))
			return false;
		if (AMIGA.config.chipset.mask & CSMASK_AGA) {
			// AGA only has 6 or 8 plane HAM
			if (p == 6 || p == 8)
				return true;
		} else {
			// OCS/ECS also supports 5 plane HAM
			if (GET_RES_DENISE(con0) > 0)
				return 0;
			if (p >= 5)
				return true;
		}
		return false;
	}	
	
	/*function get_sprite_mask() {
		var hi = new Uint64(0x00000000,0xFFFF0000);
		hi.lshift(4 * plf2pri);
		var lo = new Uint64(0x00000000,0x0000FFFF);
		lo.lshift(4 * plf1pri);
		hi.or(lo);
		return hi;
	}*/	
	
	this.pfield_expand_dp_bplcon = function () {
      bplres = dp_for_drawing.bplres;
      bplplanecnt = dp_for_drawing.nr_planes;
      bplham = dp_for_drawing.ham_seen;
      bplehb = dp_for_drawing.ehb_seen;
      if ((AMIGA.config.chipset.mask & CSMASK_AGA) && (dp_for_drawing.bplcon2 & 0x0200))
         bplehb = 0;
      issprites = dip_for_drawing.nr_sprites;
      ecsshres = bplres == RES_SUPERHIRES && (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) && !(AMIGA.config.chipset.mask & CSMASK_AGA);

      plf1pri = dp_for_drawing.bplcon2 & 7;
      plf2pri = (dp_for_drawing.bplcon2 >> 3) & 7;
      plf_sprite_mask = 0xFFFF0000 << (4 * plf2pri);
      plf_sprite_mask |= (0x0000FFFF << (4 * plf1pri)) & 0xFFFF;
      plf_sprite_mask >>>= 0;
      //plf_sprite_mask = get_sprite_mask();	

      bpldualpf = (dp_for_drawing.bplcon0 & 0x400) == 0x400;
      bpldualpfpri = (dp_for_drawing.bplcon2 & 0x40) == 0x40;

      /*#ifdef AGA
       bpldualpf2of = (dp_for_drawing.bplcon3 >> 10) & 7;
       sbasecol[0] = ((dp_for_drawing.bplcon4 >> 4) & 15) << 4;
       sbasecol[1] = ((dp_for_drawing.bplcon4 >> 0) & 15) << 4;
       brdsprt = !brdblank && (AMIGA.config.chipset.mask & CSMASK_AGA) && (dp_for_drawing.bplcon0 & 1) && (dp_for_drawing.bplcon3 & 0x02);
       bplxor = dp_for_drawing.bplcon4 >> 8;
       #endif*/
   };

	this.pfield_expand_dp_bplconx = function (regno, v) {
      if (regno == 0xffff) {
         //hposblank = 1; //FIXME
         return;
      }
      regno -= 0x1000;
      switch (regno) {
         case 0x100:
            dp_for_drawing.bplcon0 = v;
            dp_for_drawing.bplres = GET_RES_DENISE(v);
            dp_for_drawing.nr_planes = GET_PLANES(v);
            dp_for_drawing.ham_seen = is_ham(v);
            break;
         case 0x104:
            dp_for_drawing.bplcon2 = v;
            break;
         case 0x106:
            dp_for_drawing.bplcon3 = v;
            break;
         /*#ifdef AGA
          case 0x10c:
          dp_for_drawing.bplcon4 = v;
          break;
          #endif*/
      }
      this.pfield_expand_dp_bplcon();
      res_shift = lores_shift - bplres;
   };	
		
	this.center_image = function () {
      var prev_x_adjust = visible_left_border;
      var prev_y_adjust = thisframe_y_adjust;
      var tmp;

      var w = gfxvidinfo.drawbuffer.inwidth;
      if (AMIGA.config.video.xcenter && max_diwstop > 0) {
         if (max_diwstop - min_diwstart < w && AMIGA.config.video.xcenter == 2)
         /* Try to center. */
            visible_left_border = ((max_diwstop - min_diwstart - w) >> 1) + min_diwstart;
         else
            visible_left_border = max_diwstop - w - ((max_diwstop - min_diwstart - w) >> 1);
         visible_left_border &= ~((xshift(1, lores_shift)) - 1);

         /* Would the old value be good enough? If so, leave it as it is if we want to be clever. */
         if (AMIGA.config.video.xcenter == 2) {
            if (center_reset || (visible_left_border < prev_x_adjust && prev_x_adjust < min_diwstart && min_diwstart - visible_left_border <= 32))
               visible_left_border = prev_x_adjust;
         }
      } else if (gfxvidinfo.drawbuffer.extrawidth) {
         visible_left_border = max_diwlastword() - w;
         if (gfxvidinfo.drawbuffer.extrawidth > 0)
            visible_left_border += gfxvidinfo.drawbuffer.extrawidth << AMIGA.config.video.hresolution;
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
      visible_left_border &= ~((xshift(1, lores_shift)) - 1);

      linetoscr_x_adjust_bytes = visible_left_border * gfxvidinfo.drawbuffer.pixbytes;

      visible_right_border = visible_left_border + w;
      if (visible_right_border > max_diwlastword())
         visible_right_border = max_diwlastword();

      thisframe_y_adjust = minfirstline;
      if (AMIGA.config.video.ycenter && thisframe_first_drawn_line >= 0) {
         if (thisframe_last_drawn_line - thisframe_first_drawn_line < max_drawn_amiga_line && AMIGA.config.video.ycenter == 2)
            thisframe_y_adjust = ((thisframe_last_drawn_line - thisframe_first_drawn_line - max_drawn_amiga_line) >> 1) + thisframe_first_drawn_line;
         else
            thisframe_y_adjust = thisframe_first_drawn_line + (((thisframe_last_drawn_line - thisframe_first_drawn_line) - max_drawn_amiga_line) >> 1);

         if (AMIGA.config.video.ycenter == 2) {
            if (center_reset || (thisframe_y_adjust != prev_y_adjust
               && prev_y_adjust <= thisframe_first_drawn_line
               && prev_y_adjust + max_drawn_amiga_line > thisframe_last_drawn_line))
               thisframe_y_adjust = prev_y_adjust;
         }
      }
      if (thisframe_y_adjust + max_drawn_amiga_line > this.maxvpos_nom)
         thisframe_y_adjust = this.maxvpos_nom - max_drawn_amiga_line;
      if (thisframe_y_adjust < minfirstline)
         thisframe_y_adjust = minfirstline;

      thisframe_y_adjust_real = thisframe_y_adjust << linedbl;
      tmp = (this.maxvpos_nom - thisframe_y_adjust + 1) << linedbl;
      if (tmp != max_ypos_thisframe) {
         last_max_ypos = tmp;
         if (last_max_ypos < 0)
            last_max_ypos = 0;
      }
      max_ypos_thisframe = tmp;

      if (prev_x_adjust != visible_left_border || prev_y_adjust != thisframe_y_adjust)
         frame_redraw_necessary |= (interlace_seen > 0 && linedbl) ? 2 : 1;

      max_diwstop = 0;
      min_diwstart = MAX_STOP;

      gfxvidinfo.drawbuffer.xoffset = (DISPLAY_LEFT_SHIFT << RES_MAX) + (visible_left_border << (RES_MAX - AMIGA.config.video.hresolution));
      gfxvidinfo.drawbuffer.yoffset = thisframe_y_adjust << VRES_MAX;

      center_reset = false;
   };	
				
	/*---------------------------------*/   

	const COLOR_MATCH_ACOLORS = 1;  
	const COLOR_MATCH_FULL = 2;   
	var color_match_type = 0;
	
	this.adjust_drawing_colors = function (ctable, need_full) {
      if (FAST_COLORS) {
         if (need_full)
            color_reg_cpy(colors_for_drawing, current_colors);
         else
            color_reg_cpy_acolors(colors_for_drawing, current_colors);
         return;
      }
      if (drawing_color_matches != ctable) {
         if (need_full) {
            color_reg_cpy(colors_for_drawing, curr_color_tables[ctable]);
            color_match_type = COLOR_MATCH_FULL;
         } else {
            //memcpy (colors_for_drawing.acolors, curr_color_tables[ctable].acolors, sizeof colors_for_drawing.acolors);
            //for (var i = 0; i < colors_for_drawing.acolors.length; i++) colors_for_drawing.acolors[i] = curr_color_tables[ctable].acolors[i];	colors_for_drawing.borderblank = curr_color_tables[ctable].borderblank;
            color_reg_cpy_acolors(colors_for_drawing, curr_color_tables[ctable]);
            color_match_type = COLOR_MATCH_ACOLORS;
         }
         drawing_color_matches = ctable;
      }
      else if (need_full && color_match_type != COLOR_MATCH_FULL) {
         color_reg_cpy(colors_for_drawing, curr_color_tables[ctable]);
         color_match_type = COLOR_MATCH_FULL;
      }
   };
	
	this.do_color_changes = function (worker_border, worker_pfield, vp) {
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

         if (nextpos_in_range > lastpos) {
            if (lastpos < playfield_start) {
               var t = nextpos_in_range <= playfield_start ? nextpos_in_range : playfield_start;
               worker_border(lastpos, t, false);
               lastpos = t;
            }
         }
         if (nextpos_in_range > lastpos) {
            if (lastpos >= playfield_start && lastpos < playfield_end) {
               var t = nextpos_in_range <= playfield_end ? nextpos_in_range : playfield_end;
               worker_pfield(lastpos, t, false);
               // blank start and end that shouldn't be visible 
               if (lastpos < visible_left_start)
                  worker_border(lastpos, visible_left_start, true);
               if (t > visible_right_stop)
                  worker_border(visible_right_stop, endpos, true);
               lastpos = t;
            }
         }
         if (nextpos_in_range > lastpos) {
            if (lastpos >= playfield_end)
               worker_border(lastpos, nextpos_in_range, false);
            lastpos = nextpos_in_range;
         }

         if (regno >= 0x1000)
            this.pfield_expand_dp_bplconx(regno, value);
         else if (regno >= 0) {
            if (regno == 0 && (value & COLOR_CHANGE_BRDBLANK))
               colors_for_drawing.borderblank = (value & 1) != 0;
            else {
               color_reg_set(colors_for_drawing, regno, value);
               colors_for_drawing.acolors[regno] = getxcolor(value);
            }
         }
         if (lastpos >= endpos)
            break;
      }
      if (vp < visible_top_start || vp >= visible_bottom_stop) {
         // outside of visible area
         // Just overwrite with black. Above code needs to run because of custom registers,
         // not worth the trouble for separate code path just for max 10 lines or so
         worker_border(visible_left_border, visible_left_border + gfxvidinfo.drawbuffer.inwidth, true);
      }
   };
	
	/*---------------------------------*/   
	
	function getbgc(blank) {
/*#if 0
		if (blank)
			return xcolors[0x088];
		else if (hposblank == 1)
			return xcolors[0xf00];
		else if (hposblank == 2)
			return xcolors[0x0f0];
		else if (hposblank == 3)
			return xcolors[0x00f];
		else if (brdblank)
			return xcolors[0x880];
		//return colors_for_drawing.acolors[0];
		return xcolors[0xf0f];
#endif*/
		return (blank || hposblank || colors_for_drawing.borderblank) ? 0 : colors_for_drawing.acolors[0];
	}

	function fill_line_16(buf, start, stop, blank) {
		console.log('fill_line_16() NI', start, stop, blank);
		/*uae_u16 *b = (uae_u16 *)buf;
		var rem = 0;
		var col = getbgc(blank);
		
		if (((long)&b[start]) & 1)
			b[start++] = (uae_u16) col;
			
		if (start >= stop)
			return;
			
		if (((long)&b[stop]) & 1) {
			rem++;
			stop--;
		}
		for (var i = start; i < stop; i += 2) {
			uae_u32 *b2 = (uae_u32 *)&b[i];
			*b2 = col;
		}
		if (rem)
			b[stop] = (uae_u16)col;*/
	}
	function fill_line_32(buf, start, stop, blank) {
		var col = getbgc(blank);
		for (var i = start; i < stop; i++)
			buf[i] = col;
	}	

	function pfield_do_fill_line2(start, stop, blank) {
		switch (gfxvidinfo.drawbuffer.pixbytes) {
			case 2: fill_line_16(xlinebuffer, start, stop, blank); break;
			case 4: fill_line_32(xlinebuffer, start, stop, blank); break;
		}
	}
	function pfield_do_fill_line(start, stop, blank) {
		//console.log('pfield_do_fill_line()', start, stop, blank);
		//xlinecheck('pfield_do_fill_line', start, stop);
		if (!blank) {
			if (start < visible_left_start) {
				pfield_do_fill_line2(start, visible_left_start, true);
				start = visible_left_start;
			}
			if (stop > visible_right_stop) {
				pfield_do_fill_line2(start, visible_right_stop, false);
				blank = true;
				start = visible_right_stop;
			}
		}
		pfield_do_fill_line2(start, stop, blank);
	}
		
	function fill_line2(startpos, len) {
		//console.log('fill_line2', startpos, len);
		/*var shift = 0;
		if (gfxvidinfo.drawbuffer.pixbytes == 2) shift = 1;
		if (gfxvidinfo.drawbuffer.pixbytes == 4) shift = 2;*/

		var nints = len;// >> (2 - shift);
		var nrem = nints & 7;
		nints &= ~7;
		//int *start = (int *)(((uae_u8*)xlinebuffer) + (startpos << shift));
		var start = startpos;// << shift >> 2;
		var val = getbgc(false);
		
		/*for (; nints > 0; nints -= 8, start += 8) {
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
		}*/
		
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
	}	
	function fill_line() {
		var hs = coord_hw_to_window_x(hsyncstartpos * 2);
		if (hs >= gfxvidinfo.drawbuffer.inwidth || hposblank) {
			//hposblank = 3; //FIXME
			fill_line2(visible_left_border, gfxvidinfo.drawbuffer.inwidth);
		} else {
			fill_line2(visible_left_border, hs);
			//hposblank = 2; //FIXME
			fill_line2(visible_left_border + hs, gfxvidinfo.drawbuffer.inwidth);
		}			
	}	

	/*---------------------------------*/   
		
	this.pfield_init_linetoscr = function () {
      var ddf_left = dp_for_drawing.plfleft * 2 + DIW_DDF_OFFSET;
      var ddf_right = dp_for_drawing.plfright * 2 + DIW_DDF_OFFSET;

      native_ddf_left = coord_hw_to_window_x(ddf_left);
      native_ddf_right = coord_hw_to_window_x(ddf_right);

      linetoscr_diw_start = dp_for_drawing.diwfirstword;
      linetoscr_diw_end = dp_for_drawing.diwlastword;

      res_shift = lores_shift - bplres;

      if (dip_for_drawing.nr_sprites == 0) {
         if (linetoscr_diw_start < native_ddf_left)
            linetoscr_diw_start = native_ddf_left;
         if (linetoscr_diw_end > native_ddf_right)
            linetoscr_diw_end = native_ddf_right;
      }
      if (linetoscr_diw_end < linetoscr_diw_start)
         linetoscr_diw_end = linetoscr_diw_start;

      playfield_start = linetoscr_diw_start;
      playfield_end = linetoscr_diw_end;

      unpainted = visible_left_border < playfield_start ? 0 : visible_left_border - playfield_start;
      ham_src_pixel = MAX_PIXELS_PER_LINE + res_shift_from_window(playfield_start - native_ddf_left);
      unpainted = res_shift_from_window(unpainted);

      if (playfield_start < visible_left_border)
         playfield_start = visible_left_border;
      if (playfield_start > visible_right_border)
         playfield_start = visible_right_border;
      if (playfield_end < visible_left_border)
         playfield_end = visible_left_border;
      if (playfield_end > visible_right_border)
         playfield_end = visible_right_border;

      real_playfield_end = playfield_end;
      real_playfield_start = playfield_start;

      /*#ifdef AGA
       if (brdsprt && dip_for_drawing.nr_sprites) {
       var min = visible_right_border, max = visible_left_border, i;
       for (i = 0; i < dip_for_drawing.nr_sprites; i++) {
       var x;
       x = curr_sprite_entries[dip_for_drawing.first_sprite_entry + i].pos;
       if (x < min)
       min = x;
       x = curr_sprite_entries[dip_for_drawing.first_sprite_entry + i].max;
       if (x > max)
       max = x;
       }
       min = coord_hw_to_window_x (min >> sprite_buffer_res) + (DIW_DDF_OFFSET << lores_shift);
       max = coord_hw_to_window_x (max >> sprite_buffer_res) + (DIW_DDF_OFFSET << lores_shift);
       if (min < playfield_start)
       playfield_start = min;
       if (playfield_start < visible_left_border)
       playfield_start = visible_left_border;
       if (max > playfield_end)
       playfield_end = max;
       if (playfield_end > visible_right_border)
       playfield_end = visible_right_border;
       }
       #endif*/

      if (sprite_first_x < sprite_last_x) {
         if (sprite_first_x < 0)
            sprite_first_x = 0;
         if (sprite_last_x >= MAX_PIXELS_PER_LINE - 1)
            sprite_last_x = MAX_PIXELS_PER_LINE - 2;
         if (sprite_first_x < sprite_last_x) {
            //memset (spritepixels + sprite_first_x, 0, sizeof (struct SpritePixelsBuf) * (sprite_last_x - sprite_first_x + 1));
            for (var i = sprite_first_x; i <= sprite_last_x; i++) {
               spritepixels[i].clr();
            }
         }
      }
      sprite_last_x = 0;
      sprite_first_x = MAX_PIXELS_PER_LINE - 1;

      ddf_left -= DISPLAY_LEFT_SHIFT;
      pixels_offset = MAX_PIXELS_PER_LINE - (ddf_left << bplres);
      //ddf_left <<= bplres;
      src_pixel = MAX_PIXELS_PER_LINE + res_shift_from_window(playfield_start - native_ddf_left);

      if (dip_for_drawing.nr_sprites == 0)
         return;

      /* Must clear parts of apixels.  */
      if (linetoscr_diw_start < native_ddf_left) {
         var size = res_shift_from_window(native_ddf_left - linetoscr_diw_start);
         linetoscr_diw_start = native_ddf_left;
         //memset (apixels + MAX_PIXELS_PER_LINE - size, 0, size);
         for (var i = 0; i < size; i++) {
            apixels[MAX_PIXELS_PER_LINE - size + i] = 0;
         }
      }
      if (linetoscr_diw_end > native_ddf_right) {
         var pos = res_shift_from_window(native_ddf_right - native_ddf_left);
         var size = res_shift_from_window(linetoscr_diw_end - native_ddf_right);
         linetoscr_diw_start = native_ddf_left;
         //memset (apixels + MAX_PIXELS_PER_LINE + pos, 0, size);
         for (var i = 0; i < size; i++) {
            apixels[MAX_PIXELS_PER_LINE + pos + i] = 0;
         }
      }
   };	
		
	function dummy_worker(start, stop, blank) { }
	
	
	function linetoscr_32(spix, dpix, stoppos) {
		//uae_u32 *buf = (uae_u32 *) xlinebuffer;
      if (dp_for_drawing.ham_seen) {
			while (dpix < stoppos) {
				var dpix_val;
				var out_val;

				dpix_val = xcolors[ham_linebuf[spix]];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				dpix_val = colors_for_drawing.acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bplehb) {
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				if (spix_val <= 31)
					dpix_val = colors_for_drawing.acolors[spix_val];
				else
					dpix_val = xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else {
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				dpix_val = colors_for_drawing.acolors[spix_val];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		}

		return spix;
	}
	
	function linetoscr_32_stretch1(spix, dpix, stoppos) {
		//uae_u32 *buf = (uae_u32 *) xlinebuffer;
      if (dp_for_drawing.ham_seen) {
			while (dpix < stoppos) {
				var dpix_val;
				var out_val;

				dpix_val = xcolors[ham_linebuf[spix]];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				dpix_val = colors_for_drawing.acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bplehb) {
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				if (spix_val <= 31)
					dpix_val = colors_for_drawing.acolors[spix_val];
				else
					dpix_val = xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else {
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				dpix_val = colors_for_drawing.acolors[spix_val];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		}
		return spix;
	}
	
	function linetoscr_32_shrink1(spix, dpix, stoppos) {
		//uae_u32 *buf = (uae_u32 *) xlinebuffer;
      if (dp_for_drawing.ham_seen) {
			while (dpix < stoppos) {
				var dpix_val;
				var out_val;

				dpix_val = xcolors[ham_linebuf[spix]];
				spix += 2;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				dpix_val = colors_for_drawing.acolors[lookup[spix_val]];
				spix += 2;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bplehb) {
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				if (spix_val <= 31)
					dpix_val = colors_for_drawing.acolors[spix_val];
				else
					dpix_val = xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >> 1) & 0x777];
				spix += 2;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else {
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				dpix_val = colors_for_drawing.acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		}
		return spix;
	}	
	
	
	function linetoscr_32_spr(spix, dpix, stoppos) {
		//uae_u32 *buf = (uae_u32 *) xlinebuffer;
      var sprcol;

		if (dp_for_drawing.ham_seen) {
			while (dpix < stoppos) {
				var sprpix_val;
				var dpix_val;
				var out_val;

				dpix_val = xcolors[ham_linebuf[spix]];
				sprpix_val = dpix_val;
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
                  out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				dpix_val = colors_for_drawing.acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 1, sprpix_val, 0);
					if (sprcol) {
                  out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bplehb) {
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = colors_for_drawing.acolors[spix_val];
				else
					dpix_val = xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
                  out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		} else {
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				dpix_val = colors_for_drawing.acolors[spix_val];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
                  out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		}

		return spix;
	}	

	function linetoscr_32_stretch1_spr(spix, dpix, stoppos) {
		//uae_u32 *buf = (uae_u32 *) xlinebuffer;
      var sprcol;

		if (dp_for_drawing.ham_seen) {
			while (dpix < stoppos) {
				var sprpix_val;
				var dpix_val;
				var out_val;

				dpix_val = xcolors[ham_linebuf[spix]];
				sprpix_val = dpix_val;
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
                  out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				dpix_val = colors_for_drawing.acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 1, sprpix_val, 0);
					if (sprcol) {
                  out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bplehb) {
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = colors_for_drawing.acolors[spix_val];
				else
					dpix_val = xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
                  out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else {
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				dpix_val = colors_for_drawing.acolors[spix_val];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
                  out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink1_spr(spix, dpix, stoppos) {
		//var *buf = (var *) xlinebuffer;
      var sprcol;

		if (dp_for_drawing.ham_seen) {
			while (dpix < stoppos) {
				var sprpix_val;
				var dpix_val;
				var out_val;

				dpix_val = xcolors[ham_linebuf[spix]];
				sprpix_val = dpix_val;
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
                  out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				dpix_val = colors_for_drawing.acolors[lookup[spix_val]];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 1, sprpix_val, 0);
					if (sprcol) {
                  out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bplehb) {
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = colors_for_drawing.acolors[spix_val];
				else
					dpix_val = xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >> 1) & 0x777];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
                  out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		} else {
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				dpix_val = colors_for_drawing.acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
                  out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		}

		return spix;
	}
	

	//apixels -> xlinebuffer	
	function pfield_do_linetoscr(start, stop, blank) { 		
		//console.log('pfield_do_linetoscr()', start, stop, stop - start);
		//xlinecheck('pfield_do_linetoscr', start, stop);
		
/*#ifdef AGA		
		if (issprites && (AMIGA.config.chipset.mask & CSMASK_AGA)) {
			if (res_shift == 0) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_aga_spr (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_aga_spr (src_pixel, start, stop); break;
				}
			} else if (res_shift == 2) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch2_aga_spr (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch2_aga_spr (src_pixel, start, stop); break;
				}
			} else if (res_shift == 1) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch1_aga_spr (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch1_aga_spr (src_pixel, start, stop); break;
				}
			} else if (res_shift == -1) {
				if (currprefs.gfx_lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink1f_aga_spr (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink1f_aga_spr (src_pixel, start, stop); break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink1_aga_spr (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink1_aga_spr (src_pixel, start, stop); break;
					}
				}
			} else if (res_shift == -2) {
				if (currprefs.gfx_lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink2f_aga_spr (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink2f_aga_spr (src_pixel, start, stop); break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink2_aga_spr (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink2_aga_spr (src_pixel, start, stop); break;
					}
				}
			}
		} else if (AMIGA.config.chipset.mask & CSMASK_AGA) {
			if (res_shift == 0) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_aga (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_aga (src_pixel, start, stop); break;
				}
			} else if (res_shift == 2) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch2_aga (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch2_aga (src_pixel, start, stop); break;
				}
			} else if (res_shift == 1) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch1_aga (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch1_aga (src_pixel, start, stop); break;
				}
			} else if (res_shift == -1) {
				if (currprefs.gfx_lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink1f_aga (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink1f_aga (src_pixel, start, stop); break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink1_aga (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink1_aga (src_pixel, start, stop); break;
					}
				}
			} else if (res_shift == -2) {
				if (currprefs.gfx_lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink2f_aga (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink2f_aga (src_pixel, start, stop); break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink2_aga (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink2_aga (src_pixel, start, stop); break;
					}
				}
			}
		} else
#endif*/

/*#ifdef ECS_DENISE
		if (ecsshres) {
			if (res_shift == 0) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_sh (src_pixel, start, stop, issprites); break;
					case 4: src_pixel = linetoscr_32_sh (src_pixel, start, stop, issprites); break;
				}
			} else if (res_shift == -1) {
				if (currprefs.gfx_lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink1f_sh (src_pixel, start, stop, issprites); break;
						case 4: src_pixel = linetoscr_32_shrink1f_sh (src_pixel, start, stop, issprites); break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink1_sh (src_pixel, start, stop, issprites); break;
						case 4: src_pixel = linetoscr_32_shrink1_sh (src_pixel, start, stop, issprites); break;
					}
				}
			} else if (res_shift == -2) {
				if (currprefs.gfx_lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink2f_sh (src_pixel, start, stop, issprites); break;
						case 4: src_pixel = linetoscr_32_shrink2f_sh (src_pixel, start, stop, issprites); break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink2_sh (src_pixel, start, stop, issprites); break;
						case 4: src_pixel = linetoscr_32_shrink2_sh (src_pixel, start, stop, issprites); break;
					}
				}
			}
		} else
#endif*/

		if (issprites) {
			if (res_shift == 0) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_spr (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_spr (src_pixel, start, stop); break;
				}
			} else if (res_shift == 2) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch2_spr (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch2_spr (src_pixel, start, stop); break;
				}
			} else if (res_shift == 1) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch1_spr (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch1_spr (src_pixel, start, stop); break;
				}
			} else if (res_shift == -1) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_shrink1_spr (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_shrink1_spr (src_pixel, start, stop); break;
				}
			}
		} else {
			if (res_shift == 0) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16 (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32 (src_pixel, start, stop); break;
				}
			} else if (res_shift == 2) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch2 (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch2 (src_pixel, start, stop); break;
				}
			} else if (res_shift == 1) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch1 (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch1 (src_pixel, start, stop); break;
				}
			} else if (res_shift == -1) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_shrink1 (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_shrink1 (src_pixel, start, stop); break;
				}
			}
		}		
	}
	
	function init_ham_decoding() {
		var unpainted_amiga = unpainted;

		ham_decode_pixel = ham_src_pixel;
		ham_lastcolor = color_reg_get(colors_for_drawing, 0);

		if (!bplham) {
			if (unpainted_amiga > 0) {
				var pv = apixels[ham_decode_pixel + unpainted_amiga - 1];
/*#ifdef AGA
				if (currprefs.chipset_mask & CSMASK_AGA)
					ham_lastcolor = colors_for_drawing.color_regs_aga[pv ^ bplxor];
				else
#endif*/
				ham_lastcolor = colors_for_drawing.color_regs_ecs[pv];
			}
/*#ifdef AGA
		} else if (currprefs.chipset_mask & CSMASK_AGA) {
			if (bplplanecnt >= 7) { // AGA mode HAM8
				while (unpainted_amiga-- > 0) {
					var pv = apixels[ham_decode_pixel++] ^ bplxor;
					switch (pv & 0x3) {
						case 0x0: ham_lastcolor = colors_for_drawing.color_regs_aga[pv >> 2]; break;
						case 0x1: ham_lastcolor &= 0xFFFF03; ham_lastcolor |= (pv & 0xFC); break;
						case 0x2: ham_lastcolor &= 0x03FFFF; ham_lastcolor |= (pv & 0xFC) << 16; break;
						case 0x3: ham_lastcolor &= 0xFF03FF; ham_lastcolor |= (pv & 0xFC) << 8; break;
					}
				}
			} else { // AGA mode HAM6
				while (unpainted_amiga-- > 0) {
					var pv = apixels[ham_decode_pixel++] ^ bplxor;
					switch (pv & 0x30) {
						case 0x00: ham_lastcolor = colors_for_drawing.color_regs_aga[pv]; break;
						case 0x10: ham_lastcolor &= 0xFFFF00; ham_lastcolor |= (pv & 0xF) << 4; break;
						case 0x20: ham_lastcolor &= 0x00FFFF; ham_lastcolor |= (pv & 0xF) << 20; break;
						case 0x30: ham_lastcolor &= 0xFF00FF; ham_lastcolor |= (pv & 0xF) << 12; break;
					}
				}
			}
#endif*/
		} else {
			/* OCS/ECS mode HAM6 */
			while (unpainted_amiga-- > 0) {
				var pv = apixels[ham_decode_pixel++];
				switch (pv & 0x30) {
					case 0x00: ham_lastcolor = colors_for_drawing.color_regs_ecs[pv]; break;
					case 0x10: ham_lastcolor &= 0xFF0; ham_lastcolor |= (pv & 0xF); break;
					case 0x20: ham_lastcolor &= 0x0FF; ham_lastcolor |= (pv & 0xF) << 8; break;
					case 0x30: ham_lastcolor &= 0xF0F; ham_lastcolor |= (pv & 0xF) << 4; break;
				}
			}
		}
	}

	function decode_ham(pix, stoppos, blank) {
		var todraw_amiga = res_shift_from_window(stoppos - pix);

		if (!bplham) {
			while (todraw_amiga-- > 0) {
				var pv = apixels[ham_decode_pixel];
/*#ifdef AGA
				if (currprefs.chipset_mask & CSMASK_AGA)
					ham_lastcolor = colors_for_drawing.color_regs_aga[pv ^ bplxor];
				else
#endif*/
					ham_lastcolor = colors_for_drawing.color_regs_ecs[pv];

				ham_linebuf[ham_decode_pixel++] = ham_lastcolor;
			}
/*#ifdef AGA
		} else if (currprefs.chipset_mask & CSMASK_AGA) {
			if (bplplanecnt >= 7) { // AGA mode HAM8
				while (todraw_amiga-- > 0) {
					var pv = apixels[ham_decode_pixel] ^ bplxor;
					switch (pv & 0x3) {
						case 0x0: ham_lastcolor = colors_for_drawing.color_regs_aga[pv >> 2]; break;
						case 0x1: ham_lastcolor &= 0xFFFF03; ham_lastcolor |= (pv & 0xFC); break;
						case 0x2: ham_lastcolor &= 0x03FFFF; ham_lastcolor |= (pv & 0xFC) << 16; break;
						case 0x3: ham_lastcolor &= 0xFF03FF; ham_lastcolor |= (pv & 0xFC) << 8; break;
					}
					ham_linebuf[ham_decode_pixel++] = ham_lastcolor;
				}
			} else { // AGA mode HAM6
				while (todraw_amiga-- > 0) {
					var pv = apixels[ham_decode_pixel] ^ bplxor;
					switch (pv & 0x30) {
						case 0x00: ham_lastcolor = colors_for_drawing.color_regs_aga[pv]; break;
						case 0x10: ham_lastcolor &= 0xFFFF00; ham_lastcolor |= (pv & 0xF) << 4; break;
						case 0x20: ham_lastcolor &= 0x00FFFF; ham_lastcolor |= (pv & 0xF) << 20; break;
						case 0x30: ham_lastcolor &= 0xFF00FF; ham_lastcolor |= (pv & 0xF) << 12; break;
					}
					ham_linebuf[ham_decode_pixel++] = ham_lastcolor;
				}
			}
#endif*/
		} else {
			/* OCS/ECS mode HAM6 */
			while (todraw_amiga-- > 0) {
				var pv = apixels[ham_decode_pixel];
				switch (pv & 0x30) {
					case 0x00: ham_lastcolor = colors_for_drawing.color_regs_ecs[pv]; break;
					case 0x10: ham_lastcolor &= 0xFF0; ham_lastcolor |= (pv & 0xF); break;
					case 0x20: ham_lastcolor &= 0x0FF; ham_lastcolor |= (pv & 0xF) << 8; break;
					case 0x30: ham_lastcolor &= 0xF0F; ham_lastcolor |= (pv & 0xF) << 4; break;
				}
				ham_linebuf[ham_decode_pixel++] = ham_lastcolor;
			}
		}
	}	
		
	function weird_bitplane_fix() {
		for (var i = playfield_start >> lores_shift; i < playfield_end >> lores_shift; i++) {
			if (apixels[pixels_offset + i] > 16) apixels[pixels_offset + i] = 16;
		}
	}

   //line_data -> apixels
	this.pfield_doline_1 = function (lineno, wordcount, planes) {
      var pixels = MAX_PIXELS_PER_LINE;
      var tmp, d0, d1, d2, d3, d4, d5, d6, d7;
      var offs = 0;

      while (wordcount-- > 0) {
         d0 = d1 = d2 = d3 = d4 = d5 = d6 = d7 = 0;

         switch (planes) {
            /*#ifdef AGA
             case 8: d0 = line_data[lineno][7][offs];
             case 7: d1 = line_data[lineno][6][offs];
             #endif*/
            case 6:
               d2 = line_data[lineno][5][offs];
            case 5:
               d3 = line_data[lineno][4][offs];
            case 4:
               d4 = line_data[lineno][3][offs];
            case 3:
               d5 = line_data[lineno][2][offs];
            case 2:
               d6 = line_data[lineno][1][offs];
            case 1:
               d7 = line_data[lineno][0][offs];
         }
         offs++;

         tmp = (d0 ^ (d1 >>> 1)) & 0x55555555;
         d0 ^= tmp;
         d1 ^= (tmp << 1);
         tmp = (d2 ^ (d3 >>> 1)) & 0x55555555;
         d2 ^= tmp;
         d3 ^= (tmp << 1);
         tmp = (d4 ^ (d5 >>> 1)) & 0x55555555;
         d4 ^= tmp;
         d5 ^= (tmp << 1);
         tmp = (d6 ^ (d7 >>> 1)) & 0x55555555;
         d6 ^= tmp;
         d7 ^= (tmp << 1);

         tmp = (d0 ^ (d2 >>> 2)) & 0x33333333;
         d0 ^= tmp;
         d2 ^= (tmp << 2);
         tmp = (d1 ^ (d3 >>> 2)) & 0x33333333;
         d1 ^= tmp;
         d3 ^= (tmp << 2);
         tmp = (d4 ^ (d6 >>> 2)) & 0x33333333;
         d4 ^= tmp;
         d6 ^= (tmp << 2);
         tmp = (d5 ^ (d7 >>> 2)) & 0x33333333;
         d5 ^= tmp;
         d7 ^= (tmp << 2);

         tmp = (d0 ^ (d4 >>> 4)) & 0x0f0f0f0f;
         d0 ^= tmp;
         d4 ^= (tmp << 4);
         tmp = (d1 ^ (d5 >>> 4)) & 0x0f0f0f0f;
         d1 ^= tmp;
         d5 ^= (tmp << 4);
         tmp = (d2 ^ (d6 >>> 4)) & 0x0f0f0f0f;
         d2 ^= tmp;
         d6 ^= (tmp << 4);
         tmp = (d3 ^ (d7 >>> 4)) & 0x0f0f0f0f;
         d3 ^= tmp;
         d7 ^= (tmp << 4);

         tmp = (d0 ^ (d1 >>> 8)) & 0x00ff00ff;
         d0 ^= tmp;
         d1 ^= (tmp << 8);
         tmp = (d2 ^ (d3 >>> 8)) & 0x00ff00ff;
         d2 ^= tmp;
         d3 ^= (tmp << 8);
         tmp = (d4 ^ (d5 >>> 8)) & 0x00ff00ff;
         d4 ^= tmp;
         d5 ^= (tmp << 8);
         tmp = (d6 ^ (d7 >>> 8)) & 0x00ff00ff;
         d6 ^= tmp;
         d7 ^= (tmp << 8);

         tmp = (d0 ^ (d2 >>> 16)) & 0x0000ffff;
         d0 ^= tmp;
         d2 ^= (tmp << 16);
         tmp = (d1 ^ (d3 >>> 16)) & 0x0000ffff;
         d1 ^= tmp;
         d3 ^= (tmp << 16);
         tmp = (d4 ^ (d6 >>> 16)) & 0x0000ffff;
         d4 ^= tmp;
         d6 ^= (tmp << 16);
         tmp = (d5 ^ (d7 >>> 16)) & 0x0000ffff;
         d5 ^= tmp;
         d7 ^= (tmp << 16);

         apixels[pixels     ] = (d0 >>> 24) & 0xff;
         apixels[pixels + 1] = (d0 >>> 16) & 0xff;
         apixels[pixels + 2] = (d0 >>> 8) & 0xff;
         apixels[pixels + 3] = d0 & 0xff;
         apixels[pixels + 4] = (d4 >>> 24) & 0xff;
         apixels[pixels + 5] = (d4 >>> 16) & 0xff;
         apixels[pixels + 6] = (d4 >>> 8) & 0xff;
         apixels[pixels + 7] = d4 & 0xff;
         apixels[pixels + 8] = (d1 >>> 24) & 0xff;
         apixels[pixels + 9] = (d1 >>> 16) & 0xff;
         apixels[pixels + 10] = (d1 >>> 8) & 0xff;
         apixels[pixels + 11] = d1 & 0xff;
         apixels[pixels + 12] = (d5 >>> 24) & 0xff;
         apixels[pixels + 13] = (d5 >>> 16) & 0xff;
         apixels[pixels + 14] = (d5 >>> 8) & 0xff;
         apixels[pixels + 15] = d5 & 0xff;
         apixels[pixels + 16] = (d2 >>> 24) & 0xff;
         apixels[pixels + 17] = (d2 >>> 16) & 0xff;
         apixels[pixels + 18] = (d2 >>> 8) & 0xff;
         apixels[pixels + 19] = d2 & 0xff;
         apixels[pixels + 20] = (d6 >>> 24) & 0xff;
         apixels[pixels + 21] = (d6 >>> 16) & 0xff;
         apixels[pixels + 22] = (d6 >>> 8) & 0xff;
         apixels[pixels + 23] = d6 & 0xff;
         apixels[pixels + 24] = (d3 >>> 24) & 0xff;
         apixels[pixels + 25] = (d3 >>> 16) & 0xff;
         apixels[pixels + 26] = (d3 >>> 8) & 0xff;
         apixels[pixels + 27] = d3 & 0xff;
         apixels[pixels + 28] = (d7 >>> 24) & 0xff;
         apixels[pixels + 29] = (d7 >>> 16) & 0xff;
         apixels[pixels + 30] = (d7 >>> 8) & 0xff;
         apixels[pixels + 31] = d7 & 0xff;
         pixels += 32;

         /*apixels[pixels++] = (d0 >>> 24);			
          apixels[pixels++] = (d0 >>> 16) & 0xff;			
          apixels[pixels++] = (d0 >>> 8) & 0xff;			
          apixels[pixels++] =  d0 & 0xff;	
          apixels[pixels++] = (d4 >>> 24);			
          apixels[pixels++] = (d4 >>> 16) & 0xff;			
          apixels[pixels++] = (d4 >>> 8) & 0xff;			
          apixels[pixels++] =  d4 & 0xff;								
          apixels[pixels++] = (d1 >>> 24);			
          apixels[pixels++] = (d1 >>> 16) & 0xff;			
          apixels[pixels++] = (d1 >>> 8) & 0xff;			
          apixels[pixels++] =  d1 & 0xff;							
          apixels[pixels++] = (d5 >>> 24);			
          apixels[pixels++] = (d5 >>> 16) & 0xff;			
          apixels[pixels++] = (d5 >>> 8) & 0xff;			
          apixels[pixels++] =  d5 & 0xff;																		
          apixels[pixels++] = (d2 >>> 24);			
          apixels[pixels++] = (d2 >>> 16) & 0xff;			
          apixels[pixels++] = (d2 >>> 8) & 0xff;			
          apixels[pixels++] =  d2 & 0xff;			
          apixels[pixels++] = (d6 >>> 24);			
          apixels[pixels++] = (d6 >>> 16) & 0xff;			
          apixels[pixels++] = (d6 >>> 8) & 0xff;			
          apixels[pixels++] =  d6 & 0xff;								
          apixels[pixels++] = (d3 >>> 24);			
          apixels[pixels++] = (d3 >>> 16) & 0xff;			
          apixels[pixels++] = (d3 >>> 8) & 0xff;			
          apixels[pixels++] =  d3 & 0xff;						
          apixels[pixels++] = (d7 >>> 24);			
          apixels[pixels++] = (d7 >>> 16) & 0xff;			
          apixels[pixels++] = (d7 >>> 8) & 0xff;			
          apixels[pixels++] =  d7 & 0xff;*/
      }
   };
	
	this.pfield_doline = function (lineno) {
      if (bplplanecnt)
         this.pfield_doline_1(lineno, dp_for_drawing.plflinelen, bplplanecnt);
      else {
         for (var i = 0; i < dp_for_drawing.plflinelen * 32; i++) apixels[i] = 0; //memset (data, 0, dp_for_drawing.plflinelen * 32);   			
      }
   };
				
	this.pfield_draw_line = function (vb, lineno, gfx_ypos, follow_ypos) {
      if (!AMIGA.config.video.enabled) return;
      //console.log('pfield_draw_line', lineno, gfx_ypos, follow_ypos);		
      var border = 0;
      var do_double = 0;

      dp_for_drawing = line_decisions[lineno];
      dip_for_drawing = curr_drawinfo[lineno];

      switch (linestate[lineno]) {
         case LINE_REMEMBERED_AS_PREVIOUS:
            BUG.info('pfield_draw_line() Shouldn\'t get here... this is a bug.');
            return;
         case LINE_BLACK:
            linestate[lineno] = LINE_REMEMBERED_AS_BLACK;
            border = 2;
            break;
         case LINE_REMEMBERED_AS_BLACK:
            return;
         case LINE_AS_PREVIOUS:
            //dp_for_drawing--;
            //dip_for_drawing--;
            dp_for_drawing = line_decisions[lineno - 1];
            dip_for_drawing = curr_drawinfo[lineno - 1];
            linestate[lineno] = LINE_DONE_AS_PREVIOUS;
            if (dp_for_drawing.plfleft < 0)
               border = 1;
            break;
         case LINE_DONE_AS_PREVIOUS:
         /* fall through */
         case LINE_DONE:
            return;
         case LINE_DECIDED_DOUBLE:
            if (follow_ypos >= 0) {
               do_double = 1;
               linestate[lineno + 1] = LINE_DONE_AS_PREVIOUS;
            }
         /* fall through */
         default:
            if (dp_for_drawing.plfleft < 0)
               border = 1;
            linestate[lineno] = LINE_DONE;
            break;
      }

      if (border == 0) {
         this.pfield_expand_dp_bplcon();
         this.pfield_init_linetoscr();
         this.pfield_doline(lineno);

         this.adjust_drawing_colors(dp_for_drawing.ctable, dp_for_drawing.ham_seen || bplehb || ecsshres);

         if (dp_for_drawing.ham_seen) {
            init_ham_decoding();
            if (dip_for_drawing.nr_color_changes == 0)
               decode_ham(visible_left_border, visible_right_border, false);
            else {
               this.do_color_changes(dummy_worker, decode_ham, lineno);
               this.adjust_drawing_colors(dp_for_drawing.ctable, dp_for_drawing.ham_seen || bplehb);
            }
            bplham = dp_for_drawing.ham_at_start;
         }
         if (plf2pri > 5 && bplplanecnt == 5 && !(AMIGA.config.chipset.mask & CSMASK_AGA))
            weird_bitplane_fix();

         if (dip_for_drawing.nr_sprites) {
            /*#ifdef AGA
             if (brdsprt)
             this.clear_bitplane_border_aga();
             #endif*/
            for (var i = 0; i < dip_for_drawing.nr_sprites; i++)
               draw_sprites(curr_sprite_entries[dip_for_drawing.first_sprite_entry + i]);
         }
         this.do_color_changes(pfield_do_fill_line, pfield_do_linetoscr, lineno);

         this.do_flush_line(vb, gfx_ypos);
         if (do_double)
            this.do_flush_line(vb, follow_ypos);
      } else if (border == 1) {
         var dosprites = 0;

         this.adjust_drawing_colors(dp_for_drawing.ctable, false);

         /*#ifdef AGA
          if (brdsprt && dip_for_drawing->nr_sprites > 0) {
          dosprites = 1;
          this.pfield_expand_dp_bplcon();
          pfield_init_linetoscr ();
          memset (apixels + MAX_PIXELS_PER_LINE, colors_for_drawing.borderblank ? 0 : colors_for_drawing.acolors[0], MAX_PIXELS_PER_LINE);
          }
          #endif*/
         if (!dosprites && dip_for_drawing.nr_color_changes == 0) {
            fill_line();
            this.do_flush_line(vb, gfx_ypos);
            if (do_double)
               this.do_flush_line(vb, follow_ypos);
            return;
         }
         if (dosprites) {
            for (var i = 0; i < dip_for_drawing.nr_sprites; i++)
               this.draw_sprites(curr_sprite_entries[dip_for_drawing.first_sprite_entry + i]);
            for (var i = 0; i < apixels.length; i++) apixels[i] = 0; //memset (apixels, 0, sizeof apixels);
            //var oxor = bplxor;
            //bplxor = 0;
            this.do_color_changes(pfield_do_fill_line, pfield_do_linetoscr, lineno);
            //bplxor = oxor;
         } else {
            playfield_start = visible_right_border;
            playfield_end = visible_right_border;
            this.do_color_changes(pfield_do_fill_line, pfield_do_fill_line, lineno);
         }
         this.do_flush_line(vb, gfx_ypos);
         if (do_double)
            this.do_flush_line(vb, follow_ypos);
      } else {
         //var tmp = hposblank;
         //hposblank = brdblank;
         //hposblank = colors_for_drawing.borderblank;
         fill_line();
         this.do_flush_line(vb, gfx_ypos);
         //hposblank = tmp;
      }
   };
		
	this.init_drawing_frame = function () {
      this.init_hardware_for_drawing_frame();

      /*if (thisframe_first_drawn_line < 0)
         thisframe_first_drawn_line = minfirstline;
      if (thisframe_first_drawn_line > thisframe_last_drawn_line)
         thisframe_last_drawn_line = thisframe_first_drawn_line;*/

      var maxline = ((this.maxvpos_nom + 1) << linedbl) + 2;

      if (SMART_UPDATE) {
         for (var i = 0; i < maxline; i++) {
            switch (linestate[i]) {
               case LINE_DONE_AS_PREVIOUS:
                  linestate[i] = LINE_REMEMBERED_AS_PREVIOUS;
                  break;
               case LINE_REMEMBERED_AS_BLACK:
                  break;
               default:
                  linestate[i] = LINE_UNDECIDED;
                  break;
            }
         }
      } else {
         for (var i = 0; i < maxline; i++) linestate[i] = LINE_UNDECIDED; //memset(linestate, LINE_UNDECIDED, maxline);
      }

      last_drawn_line = 0;
      first_drawn_line = 0x7fff;

      first_block_line = last_block_line = NO_BLOCK;
      if (frame_redraw_necessary)
         frame_redraw_necessary--;

      this.center_image();

      thisframe_first_drawn_line = -1;
      thisframe_last_drawn_line = -1;

      drawing_color_matches = -1;
   };
	
	this.finish_drawing_frame = function () {
      var vb = gfxvidinfo.drawbuffer;

      if (SMART_UPDATE) {
         for (var i = 0; i < max_ypos_thisframe; i++) {
            var i1 = i + min_ypos_for_screen;
            var line = i + thisframe_y_adjust_real;

            var where2 = amiga2aspect_line_map[i1];
            if (where2 >= vb.inheight)
               break;
            if (where2 < 0)
               continue;
            hposblank = 0;
            this.pfield_draw_line(vb, line, where2, amiga2aspect_line_map[i1 + 1]);
         }
         //if (lightpen_active) lightpen_update(vb);

         //this.do_flush_screen(vb, first_drawn_line, last_drawn_line);	
      }
      /*else {
       if (!interlace_seen)
       this.do_flush_screen(vb, first_drawn_line, last_drawn_line);		
       }*/
   };
	
	this.hardware_line_completed = function (lineno) {
      if (!SMART_UPDATE) {
         var i = lineno - thisframe_y_adjust_real;
         if (i >= 0 && i < max_ypos_thisframe) {
            var where = amiga2aspect_line_map[i + min_ypos_for_screen];
            if (where < gfxvidinfo.drawbuffer.outheight && where >= 0)
               this.pfield_draw_line(null, lineno, where, amiga2aspect_line_map[i + min_ypos_for_screen + 1]);
         }
      }
   };

	this.notice_interlace_seen = function (lace) {
      var changed = false;
      if (lace) {
         if (interlace_seen == 0) {
            changed = true;
            //BUG.info('->lace');
         }
         interlace_seen = AMIGA.config.video.vresolution ? 1 : -1;
      } else {
         if (interlace_seen) {
            changed = true;
            //BUG.info('->non-lace');
         }
         interlace_seen = 0;
      }
      return changed;
   };
	
	this.notice_screen_contents_lost = function () {
      frame_redraw_necessary = 2;
   };
	
	/*---------------------------------*/

	this.reset_lores = function () {
      lores_shift = AMIGA.config.video.hresolution;
      if (doublescan > 0) {
         if (lores_shift < 2)
            lores_shift++;
      }
      sprite_buffer_res = AMIGA.config.video.hresolution;
      if (doublescan > 0 && sprite_buffer_res < RES_SUPERHIRES)
         sprite_buffer_res++;
   };	

	this.bpldmainitdelay = function (hpos) {
      var hposa = hpos + (4 + (bplcon0_planes == 8 ? 1 : 0)); //BPLCON_AGNUS_DELAY;
      ddf_change = this.vpos;
      if (hposa < 0x14) {
         this.BPLCON0_Denise(hpos, bplcon0, false);
         this.setup_fmodes(hpos);
         return;
      }
      if (bpldmasetuphpos < 0) {
         bpldmasetupphase = 0;
         bpldmasetuphpos = hpos + BPLCON_DENISE_DELAY;
      }
   };
		
	this.update_ddf_change = function () {
      ddf_change = this.vpos;
   };	

	/*---------------------------------*/
		
	this.allocsoftbuffer = function (buf, flags, width, height, depth) {
      buf.rowbytes = MAX_PIXELS_PER_LINE >> 3;
      /* for xlinecheck() */
      buf.pixbytes = Math.floor((depth + 7) / 8);
      buf.width_allocated = (width + 7) & ~7;
      buf.height_allocated = height;
   };	
	
	this.setup_drawing = function () {
      setup_drawing_tables();
      this.allocsoftbuffer(gfxvidinfo.drawbuffer, 0, VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_DEPTH);
   };

	this.cleanup_drawing = function () {
   };

	this.reset_drawing = function () {
      var i;
      max_diwstop = 0;
      this.reset_lores();
      for (i = 0; i < linestate.length; i++) linestate[i] = LINE_UNDECIDED;
      this.recreate_aspect_maps();
      last_redraw_point = 0;
      for (i = 0; i < spixels.length; i++) spixels[i] = 0; //memset(spixels, 0, sizeof spixels);       
      for (i = 0; i < spixstate.length; i++) spixstate[i] = 0; //memset(&spixstate, 0, sizeof spixstate);  	
      this.init_drawing_frame();
      this.notice_screen_contents_lost();
      //lightpen_y1 = lightpen_y2 = -1;
      center_reset = true;
   };	
	
	/*-----------------------------------------------------------------------*/
	/* sprites */
	/*-----------------------------------------------------------------------*/
	
	function setup_sprite_tables() {
		for (var i = 0; i < 256; i++) {
			sprtaba[i] =
				  (((i >> 7) & 1) << 0)
				| (((i >> 6) & 1) << 2)
				| (((i >> 5) & 1) << 4)
				| (((i >> 4) & 1) << 6)
				| (((i >> 3) & 1) << 8)
				| (((i >> 2) & 1) << 10)
				| (((i >> 1) & 1) << 12)
				| (((i >> 0) & 1) << 14);
			sprtabb[i] = sprtaba[i] << 1;
			sprite_ab_merge[i] = ((i & 15) ? 1 : 0) | ((i & 240) ? 2 : 0);
			clxtab[i] =
				((((i & 3) && (i & 12)) << 9) | 
				(((i & 3) && (i & 48)) << 10) | 
				(((i & 3) && (i & 192)) << 11) | 
				(((i & 12) && (i & 48)) << 12) | 
				(((i & 12) && (i & 192)) << 13) | 
				(((i & 48) && (i & 192)) << 14));
			sprite_offs[i] = (i & 15) ? 0 : 2;
		}
		for (var i = 0; i < 16; i++) {
			clxmask[i] = 
				  ((i & 1) ? 0xF : 0x3)
				| ((i & 2) ? 0xF0 : 0x30)
				| ((i & 4) ? 0xF00 : 0x300)
				| ((i & 8) ? 0xF000 : 0x3000);
			sprclx[i] = 
				 (((i & 0x3) == 0x3 ? 1 : 0)
				| ((i & 0x5) == 0x5 ? 2 : 0)
				| ((i & 0x9) == 0x9 ? 4 : 0)
				| ((i & 0x6) == 0x6 ? 8 : 0)
				| ((i & 0xA) == 0xA ? 16 : 0)
				| ((i & 0xC) == 0xC ? 32 : 0)) << 9;
		}
	}		
		
	function render_sprites(pos, dualpf, apixel, aga) {
		if (!DO_SPRITES) return 0; //FIXME
		var spb = spritepixels[pos];
		var v = spb.data;
		var shift_lookup = dualpf ? (bpldualpfpri ? dblpf_ms2 : dblpf_ms1) : dblpf_ms;
		var maskshift = shift_lookup[apixel];
		var plfmask = (plf_sprite_mask >>> maskshift) >>> maskshift;
		
		v &= ~plfmask;
		if (v != 0) { //|| SPRITE_DEBUG) {
			var vlo, vhi, col;
			var v1 = v & 255;
			var offs;
			if (v1 == 0)
				offs = 4 + sprite_offs[v >> 8];
			else
				offs = sprite_offs[v1];

			v >>= offs * 2;
			v &= 15;
/*#if SPRITE_DEBUG > 0
			v ^= 8;
#endif*/
			if (spb.attach && (spb.stdata & (3 << offs))) {
				col = v;
				if (aga)
					col += sbasecol[1];
				else
					col += 16;
			} else {
				vlo = v & 3;
				vhi = (v & (vlo - 1)) >> 2;
				col = (vlo | vhi);
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
		
	function draw_sprites_1(e, dualpf, has_attach) {
		//uae_u16 *buf = spixels + e.first_pixel;
		//uae_u8 *stbuf = spixstate.bytes + e.first_pixel;
		//buf -= e.pos;
		//stbuf -= e.pos;
		var pos2 = e.first_pixel - e.pos;

		var spr_pos = e.pos + ((DIW_DDF_OFFSET - DISPLAY_LEFT_SHIFT) << sprite_buffer_res);

		if (spr_pos < sprite_first_x)
			sprite_first_x = spr_pos;

		for (var pos = e.pos; pos < e.max; pos++, spr_pos++) {
			if (spr_pos >= 0 && spr_pos < MAX_PIXELS_PER_LINE) {
				//spritepixels[spr_pos].data = buf[pos];
				//spritepixels[spr_pos].stdata = stbuf[pos];
				spritepixels[spr_pos].data = spixels[pos2 + pos];
				spritepixels[spr_pos].stdata = spixstate[pos2 + pos];
				spritepixels[spr_pos].attach = has_attach;
			}
		}
		if (spr_pos > sprite_last_x)
			sprite_last_x = spr_pos;
	}

	function draw_sprites(e) {   
		if (!DO_SPRITES) return; //FIXME
		draw_sprites_1(e, bpldualpf, e.has_attached);
	}		
	
	function ecsshres_func() {
		return bplcon0_res == RES_SUPERHIRES && (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) && !(AMIGA.config.chipset.mask & CSMASK_AGA);
	}

	/* handle very rarely needed playfield collision (CLXDAT bit 0) only known game needing this is Rotor */
	this.do_playfield_collisions = function () {
      var ddf_left = thisline_decision.plfleft * 2 << bplcon0_res;
      var hw_diwlast = coord_window_to_diw_x(thisline_decision.diwlastword);
      var hw_diwfirst = coord_window_to_diw_x(thisline_decision.diwfirstword);
      var i, collided, minpos, maxpos;
      /*#ifdef AGA
       var planes = (currprefs.chipset_mask & CSMASK_AGA) ? 8 : 6;
       #else*/
      var planes = 6;
//#endif

      if (clxcon_bpl_enable == 0) {
         clxdat |= 1;
         return;
      }
      if (clxdat & 1)
         return;

      collided = 0;
      minpos = thisline_decision.plfleft * 2;
      if (minpos < hw_diwfirst)
         minpos = hw_diwfirst;
      maxpos = thisline_decision.plfright * 2;
      if (maxpos > hw_diwlast)
         maxpos = hw_diwlast;
      for (i = minpos; i < maxpos && !collided; i += 32) {
         var offs = ((i << bplcon0_res) - ddf_left) >> 3;
         var j;
         var total = 0xffffffff;
         for (j = 0; j < planes; j++) {
            var ena = (clxcon_bpl_enable >> j) & 1;
            var match = (clxcon_bpl_match >> j) & 1;
            var t = 0xffffffff;
            if (ena) {
               if (j < thisline_decision.nr_planes) {
                  //t = *(uae_u32 *)(line_data[next_lineno] + offs + 2 * j * MAX_WORDS_PER_LINE);
                  t = line_data[next_lineno][j][offs];
                  t ^= (match & 1) - 1;
               } else {
                  t = (match & 1) - 1;
               }
            }
            total &= t;
         }
         if (total) {
            collided = 1;
            /*if (1) { //debug
             for (var k = 0; k < 1; k++) {
             //uae_u32 *ldata = (uae_u32 *)(line_data[next_lineno] + offs + 2 * k * MAX_WORDS_PER_LINE); *ldata ^= 0x5555555555;
             line_data[next_lineno][k][offs] ^= 0x5555555555;
             }
             }*/
         }
      }
      if (collided)
         clxdat |= 1;
   };
	
	/* Sprite-to-sprite collisions are taken care of in record_sprite.  This one does playfield/sprite collisions. */	
	this.do_sprite_collisions = function () {
      var nr_sprites = curr_drawinfo[next_lineno].nr_sprites;
      var first = curr_drawinfo[next_lineno].first_sprite_entry;
      var collision_mask = clxmask[clxcon >> 12];
      var ddf_left = thisline_decision.plfleft * 2 << bplcon0_res;
      var hw_diwlast = coord_window_to_diw_x(thisline_decision.diwlastword);
      var hw_diwfirst = coord_window_to_diw_x(thisline_decision.diwfirstword);

      if (clxcon_bpl_enable == 0) {
         clxdat |= 0x1fe;
         return;
      }

      for (var i = 0; i < nr_sprites; i++) {
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

            if (sprpix == 0)
               continue;

            var match = 1;
            var offs = ((j << bplcon0_res) >> sprite_buffer_res) - ddf_left;
            sprpix = (sprite_ab_merge[sprpix & 255] | (sprite_ab_merge[sprpix >> 8] << 2)) << 1;

            for (var k = 1; k >= 0; k--) {
               /*#ifdef AGA
                var planes = (currprefs.chipset_mask & CSMASK_AGA) ? 8 : 6;
                #else*/
               var planes = 6;
//#endif
               if (bplcon0 & 0x400)
                  match = 1;
               for (var l = k; match && l < planes; l += 2) {
                  var t = 0;
                  if (l < thisline_decision.nr_planes) {
                     //uae_u32 *ldata = (uae_u32 *)(line_data[next_lineno] + 2 * l * MAX_WORDS_PER_LINE); var word = ldata[offs >> 5];
                     var word = line_data[next_lineno][l][offs >> 5];
                     t = (word >>> (31 - (offs & 31))) & 1;
                     /*if (1) { //debug: draw collision mask
                      for (var m = 0; m < 5; m++) {
                      //uae_u32 *ldata = (uae_u32 *)(line_data[next_lineno] + 2 * m * MAX_WORDS_PER_LINE); ldata[(offs >> 5) + 1] |= 15 << (31 - (offs & 31));
                      line_data[next_lineno][m][(offs >> 5) + 0] |= 15 << (31 - (offs & 31));							
                      }
                      }*/
                  }
                  if (clxcon_bpl_enable & (1 << l)) {
                     if (t != ((clxcon_bpl_match >> l) & 1))
                        match = 0;
                  }
               }
               if (match) {
                  /*if (1) { //debug: mark lines where collisions are detected
                   for (var l = 0; l < 5; l++) {
                   //uae_u32 *ldata = (uae_u32 *)(line_data[next_lineno] + 2 * l * MAX_WORDS_PER_LINE); ldata[(offs >> 5) + 1] |= 15 << (31 - (offs & 31));
                   line_data[next_lineno][l][(offs >> 5) + 0] |= 15 << (31 - (offs & 31));							
                   }
                   }*/
                  clxdat |= (sprpix << (k * 4));
               }
            }
         }
      }
      /*{
       static var olx;
       if (clxdat != olx) BUG.info('%d: %04x', vpos, clxdat);
       olx = clxdat;
       }*/
   };
	
	this.record_sprite_1 = function (sprxp, buf, datab, num, dbl, mask, do_collisions, collision_mask) {
      var j = 0;

      while (datab) {
         var col = 0;
         var coltmp = 0;

         if ((sprxp >= sprite_minx && sprxp < sprite_maxx) || (bplcon3 & 2))
            col = (datab & 3) << (2 * num);

         //if (sprxp == sprite_minx || sprxp == sprite_maxx - 1) col ^= Math.floor(Math.random() * 0xffffffff);

         if ((j & mask) == 0) {
            //var tmp = (*buf) | col; *buf++ = tmp;
            var tmp = spixels[buf] | col;
            spixels[buf++] = tmp;
            if (do_collisions)
               coltmp |= tmp;
            sprxp++;
         }
         if (dbl > 0) {
            //var tmp = (*buf) | col; *buf++ = tmp;
            var tmp = spixels[buf] | col;
            spixels[buf++] = tmp;
            if (do_collisions)
               coltmp |= tmp;
            sprxp++;
         }
         if (dbl > 1) {
            var tmp;
            //tmp = (*buf) | col; *buf++ = tmp;
            tmp = spixels[buf] | col;
            spixels[buf++] = tmp;
            if (do_collisions)
               coltmp |= tmp;
            //tmp = (*buf) | col; *buf++ = tmp;
            tmp = spixels[buf] | col;
            spixels[buf++] = tmp;
            if (do_collisions)
               coltmp |= tmp;
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
   };
	
	//this.record_sprite = function(line, num, sprxp, data, datb, ctl) {
	this.record_sprite = function (line, num, sprxp) {
      var e = curr_sprite_entries[next_sprite_entry];
      var word_offs;
      var collision_mask;
      var width, dbl, half;
      var mask = 0;
      var attachment;
      var i;

      //var data = 0, datb = 0;
      var this_sprite_entry = next_sprite_entry;
      var num2 = 0;

      half = 0;
      dbl = sprite_buffer_res - sprres;
      if (dbl < 0) {
         half = -dbl;
         dbl = 0;
         mask = 1 << half;
      }
      width = (sprite_width << sprite_buffer_res) >> sprres;
      attachment = sprctl[num | 1] & 0x80;

      /* Try to coalesce entries if they aren't too far apart  */
      //if (!next_sprite_forced && e[-1].max + sprite_width >= sprxp) {
      if (this_sprite_entry > 0 && !next_sprite_forced && curr_sprite_entries[this_sprite_entry - 1].max + sprite_width >= sprxp) {
         //e--;
         e = curr_sprite_entries[this_sprite_entry - 1];
         this_sprite_entry--;
         //console.log('RS',this_sprite_entry);
      } else {
         next_sprite_entry++;
         e.pos = sprxp;
         e.has_attached = 0;
      }

      if (sprxp < e.pos)
         Fatal(333, 'sprxp < e->pos');

      e.max = sprxp + width;
      //e[1].first_pixel = e.first_pixel + ((e.max - e.pos + 3) & ~3);
      curr_sprite_entries[this_sprite_entry + 1].first_pixel = e.first_pixel + ((e.max - e.pos + 3) & ~3);
      next_sprite_forced = 0;

      collision_mask = clxmask[clxcon >> 12];
      word_offs = e.first_pixel + sprxp - e.pos;

      for (i = 0; i < sprite_width; i += 16) {
         //var da = *data;
         //var db = *datb;
         //var da = sprdata[data][0];
         //var db = sprdatb[datb][0];
         var da = sprdata[num][num2];
         var db = sprdatb[num][num2];
         var datab = ((sprtaba[da & 0xFF] << 16) | sprtaba[da >> 8] | (sprtabb[db & 0xFF] << 16) | sprtabb[db >> 8]) >>> 0;
         var off = (i << dbl) >> half;
         //uae_u16 *buf = spixels + word_offs + off;
         var buf = word_offs + off;
         if (AMIGA.config.chipset.collision_level > 0 && collision_mask)
            this.record_sprite_1(sprxp + off, buf, datab, num, dbl, mask, 1, collision_mask);
         else
            this.record_sprite_1(sprxp + off, buf, datab, num, dbl, mask, 0, collision_mask);

         //*data++; *datb++;
         num2++;
      }

      /* We have 8 bits per pixel in spixstate, two for every sprite pair. 
       The low order bit records whether the attach bit was set for this pair.  */
      if (attachment && !ecsshres_func()) {
         var state = ((0x01010101 << (num & ~1)) >>> 0) & 0xff;
         /*uae_u8 *stb1 = spixstate.bytes + word_offs;
          for (i = 0; i < width; i += 8) {
          stb1[0] |= state;
          stb1[1] |= state;
          stb1[2] |= state;
          stb1[3] |= state;
          stb1[4] |= state;
          stb1[5] |= state;
          stb1[6] |= state;
          stb1[7] |= state;
          stb1 += 8;
          }*/
         var stb1 = word_offs;
         for (i = 0; i < width; i += 8) {
            spixstate[stb1 + 0] |= state;
            spixstate[stb1 + 1] |= state;
            spixstate[stb1 + 2] |= state;
            spixstate[stb1 + 3] |= state;
            spixstate[stb1 + 4] |= state;
            spixstate[stb1 + 5] |= state;
            spixstate[stb1 + 6] |= state;
            spixstate[stb1 + 7] |= state;
            stb1 += 8;
         }
         e.has_attached = 1;
      }
   };

	function tospritexdiw(diw) {
		return coord_window_to_hw_x(diw - (DIW_DDF_OFFSET << lores_shift)) << sprite_buffer_res;
	}
	function tospritexddf(ddf) {
		return (ddf << 1) << sprite_buffer_res;
	}
	/*function fromspritexdiw(ddf) {
		return coord_hw_to_window_x(ddf >> sprite_buffer_res) + (DIW_DDF_OFFSET << lores_shift);
	}*/

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
			if (min > sprite_minx && min < max) /* min < max = full line ddf */
				sprite_minx = min;
		}
	}

	function add_sprite(count, num, sprxp, posns, nrs) {
		var bestp, j;
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
	
	this.decide_sprites = function (hpos) {
      if (!DO_SPRITES) return; //FIXME
      var nrs = [], posns = [];
      var point = hpos * 2 - 3;
      //var width = sprite_width;
      var sscanmask = 0x100 << sprite_buffer_res;
      //var gotdata = 0;
      var count, i;

      if (thisline_decision.plfleft < 0 && !(bplcon3 & 2))
         return;

      if (this.nodraw() || hpos < 0x14 || nr_armed == 0 || point == last_sprite_point)
         return;

      this.decide_diw(hpos);
      this.decide_line(hpos);

      calcsprite();

      for (i = 0; i < MAX_SPRITES * 2; i++)
         nrs[i] = posns[i] = 0;

      count = 0;
      for (i = 0; i < MAX_SPRITES; i++) {
         var sprxp = (fmode & 0x8000) ? (spr[i].xpos & ~sscanmask) : spr[i].xpos;
         var hw_xp = sprxp >> sprite_buffer_res;

         if (!spr[i].armed || spr[i].xpos < 0)
            continue;
         /*if (!((debug_sprite_mask & magic_sprite_mask) & (1 << i)))
          continue;*/

         if (hw_xp > last_sprite_point && hw_xp <= point)
            add_sprite(count++, i, sprxp, posns, nrs);

         if ((fmode & 0x8000) && !(sprxp & sscanmask)) {
            sprxp |= sscanmask;
            hw_xp = sprxp >> sprite_buffer_res;
            if (hw_xp > last_sprite_point && hw_xp <= point)
               add_sprite(count++, MAX_SPRITES + i, sprxp, posns, nrs);
         }
      }
      for (i = 0; i < count; i++) {
         var nr = nrs[i] & (MAX_SPRITES - 1);
         //this.record_sprite(next_lineno, nr, posns[i], sprdata[nr], sprdatb[nr], sprctl[nr]);
         this.record_sprite(next_lineno, nr, posns[i]);

         /* get left and right sprite edge if brdsprt enabled */
         /*#if AUTOSCALE_SPRITES
          if (AMIGA.dmaen(DMAF_SPREN) && (bplcon0 & 1) && (bplcon3 & 0x02) && !(bplcon3 & 0x20) && nr > 0) {
          var j, jj;
          for (j = 0, jj = 0; j < sprite_width; j+= 16, jj++) {
          var nx = fromspritexdiw (posns[i] + j);
          if (sprdata[nr][jj] || sprdatb[nr][jj]) {
          if (diwfirstword_total > nx && nx >= (48 << currprefs.hresolution))
          diwfirstword_total = nx;
          if (diwlastword_total < nx + 16 && nx <= (448 << currprefs.hresolution))
          diwlastword_total = nx + 16;
          }
          }
          gotdata = 1;
          }
          #endif*/
      }
      last_sprite_point = point;

      /* get upper and lower sprite position if brdsprt enabled */
      /*#if AUTOSCALE_SPRITES
       if (gotdata) {
       if (vpos < first_planes_vpos)
       first_planes_vpos = vpos;
       if (vpos < plffirstline_total)
       plffirstline_total = vpos;
       if (vpos > last_planes_vpos)
       last_planes_vpos = vpos;
       if (vpos > plflastline_total)
       plflastline_total = vpos;
       }
       #endif*/
   };
	
	this.cursorsprite = function () {
      if (!AMIGA.dmaen(DMAF_SPREN) || first_planes_vpos == 0)
         return;
      sprite_0 = spr[0].pt;
      sprite_0_height = spr[0].vstop - spr[0].vstart;
      sprite_0_colors[0] = 0;
      sprite_0_doubled = 0;
      if (sprres == 0)
         sprite_0_doubled = 1;
      if (AMIGA.config.chipset.mask & CSMASK_AGA) {
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
      /*if (currprefs.input_tablet && currprefs.input_magic_mouse) {
       if (currprefs.input_magic_mouse_cursor == MAGICMOUSE_HOST_ONLY && mousehack_alive ())
       magic_sprite_mask &= ~1;
       else
       magic_sprite_mask |= 1;
       }*/
   };	
	
	function sprite_fetch(s, dma, hpos, cycle, mode) {
		var data = AMIGA.custom.last_value;
		if (dma) {
			//data = AMIGA.mem.load16_chip(s.pt);
			data = AMIGA.custom.last_value = AMIGA.mem.chip.data[s.pt >>> 1];
		}
		s.pt += 2;
		return data;
	}
	function sprite_fetch2(s, hpos, cycle, mode) {
		//var data = AMIGA.mem.load16_chip(s.pt);
		var data = AMIGA.custom.last_value = AMIGA.mem.chip.data[s.pt >>> 1];
		s.pt += 2;
		return data;
	}

	this.do_sprites_1 = function (num, cycle, hpos) {
      var s = spr[num];
      var isdma = AMIGA.dmaen(DMAF_SPREN) || ((num & 1) && spr[num & ~1].dmacycle);

      if (isdma && this.vpos == sprite_vblank_endline)
         spr_arm(num, 0);
      /*#ifdef AGA
       if (isdma && s.dblscan && (fmode & 0x8000) && (this.vpos & 1) != (s.vstart & 1) && s.dmastate) {
       spr_arm(num, 1);
       return;
       }
       #endif*/

      //if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) BUG.info('%d:%d:slot%d:%d', this.vpos, hpos, num, cycle);

      if (this.vpos == s.vstart) {
         //if (!s.dmastate && this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) BUG.info('%d:%d:SPR%d START', this.vpos, hpos, num);
         s.dmastate = 1;
         if (num == 0 && cycle == 0)
            this.cursorsprite();
      }
      if (this.vpos == s.vstop || this.vpos == sprite_vblank_endline) {
         //if (s.dmastate && this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) BUG.info('%d:%d:SPR%d STOP', this.vpos, hpos, num);
         s.dmastate = 0;
         /*#if 0
          // roots 2.0 flower zoomer bottom part missing if this enabled
          if (this.vpos == s.vstop) {
          spr_arm (num, 0);
          //return;
          }
          #endif*/
      }

      if (!isdma)
         return;
      if (cycle && !s.dmacycle)
         return;
      /* Superfrog intro flashing bee fix */

      var dma = hpos < plfstrt_sprite || diwstate != DIW_WAITING_STOP;
      var posctl = 0;

      if (this.vpos == s.vstop || this.vpos == sprite_vblank_endline) {
         s.dmastate = 0;
         posctl = 1;
         if (dma) {
            var data = sprite_fetch(s, dma, hpos, cycle, 0);
            switch (sprite_width) {
               case 64:
                  sprite_fetch2(s, hpos, cycle, 0);
                  sprite_fetch2(s, hpos, cycle, 0);
                  break;
               case 32:
                  sprite_fetch2(s, hpos, cycle, 0);
                  break;
            }
            //BUG.info('%d:%d: %04X=%04X', this.vpos, hpos, 0x140 + cycle * 2 + num * 8, data);
            if (cycle == 0) {
               this.SPRxPOS_1(data, num, hpos);
               s.dmacycle = 1;
            } else {
               this.SPRxCTL_1(data, num, hpos);
               s.dmastate = 0;
               this.sprstartstop(s);
            }
         }
         //if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) BUG.info('%d:%d:dma:P=%06X '), this.vpos, hpos, s.pt);
      }
      if (s.dmastate && !posctl && dma) {
         var data = sprite_fetch(s, dma, hpos, cycle, 1);
         //if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) BUG.info('%d:%d:dma:P=%06X '), this.vpos, hpos, s.pt);
         if (cycle == 0) {
            this.SPRxDATA_1(data, num, hpos);
            s.dmacycle = 1;
         } else {
            this.SPRxDATB_1(data, num, hpos);
            spr_arm(num, 1);
         }
         /*#ifdef AGA
          switch (sprite_width) {
          case 64: {
          var data32 = sprite_fetch2 (s, hpos, cycle, 1);
          var data641 = sprite_fetch2 (s, hpos, cycle, 1);
          var data642 = sprite_fetch2 (s, hpos, cycle, 1);
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
          }
          break;
          case 32: {
          var data32 = sprite_fetch2 (s, hpos, cycle, 1);
          if (dma) {
          if (cycle == 0)
          sprdata[num][1] = data32;
          else
          sprdatb[num][1] = data32;
          }
          }
          break;
          }
          #endif*/
      }
   };

	this.do_sprites = function (hpos) {
      if (!DO_SPRITES) return; //FIXME
      if (this.vpos < sprite_vblank_endline)
         return;

      if (this.doflickerfix() && interlace_seen && (next_lineno & 1))
         return;

      if (!CUSTOM_SIMPLE) {
         var minspr = last_sprite_hpos + 1;
         var maxspr = hpos;

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
            var num = (i - SPR0_HPOS) >> 2;
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
               this.do_sprites_1(num, cycle, i);
            }
         }
         last_sprite_hpos = hpos;
      } else {
         for (var i = 0; i < MAX_SPRITES * 2; i++) {
            spr[i >> 1].dmacycle = 1;
            this.do_sprites_1(i >> 1, i & 1, 0);
         }
      }
   };

	function expand_sprres(con0, con3) {
		switch ((con3 >> 6) & 3) {
			case 0: {
				if ((AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) && GET_RES_DENISE(con0) == RES_SUPERHIRES)
					return RES_HIRES;
				else
					return RES_LORES;
			}
/*#ifdef AGA
			case 1:
				return RES_LORES;
			case 2:
				return RES_HIRES;
			case 3:
				return RES_SUPERHIRES;
#endif*/
			default:
				return RES_LORES;
		}
	}

	function spr_arm(num, state) {
		switch (state) {
			case 0:
				nr_armed -= spr[num].armed;
				spr[num].armed = 0;
				break;
			default:
				nr_armed += 1 - spr[num].armed;
				spr[num].armed = 1;
				break;
		}    
	}

	this.sprstartstop = function (s) {
      if (this.vpos == s.vstart)
         s.dmastate = 1;
      if (this.vpos == s.vstop)
         s.dmastate = 0;
   };

	this.CLXCON = function (v) {
      clxcon = v;
      clxcon_bpl_enable = (v >> 6) & 63;
      clxcon_bpl_match = v & 63;
   };

	this.CLXCON2 = function (v) {
      if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
         return;
      clxcon2 = v;
      clxcon_bpl_enable |= v & (0x40 | 0x80);
      clxcon_bpl_match |= (v & (0x01 | 0x02)) << 6;
   };

	this.CLXDAT = function () {
      var v = clxdat | 0x8000;
      clxdat = 0;
      return v;
   };
	
	this.SPRxCTLPOS = function (num) {
      var sprxp;
      var s = spr[num];

      this.sprstartstop(s);
      sprxp = (sprpos[num] & 0xFF) * 2 + (sprctl[num] & 1);
      sprxp <<= sprite_buffer_res;
      /*#ifdef AGA
       if (AMIGA.config.chipset.mask & CSMASK_AGA) {
       sprxp |= ((sprctl[num] >> 3) & 3) >> (RES_MAX - sprite_buffer_res);
       s.dblscan = sprpos[num] & 0x80;
       } else
       #endif*/
      if (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) {
         sprxp |= ((sprctl[num] >> 3) & 2) >> (RES_MAX - sprite_buffer_res);
      }
      s.xpos = sprxp;
      s.vstart = (sprpos[num] >> 8) | ((sprctl[num] << 6) & 0x100);
      s.vstop = (sprctl[num] >> 8) | ((sprctl[num] << 7) & 0x100);
      if (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) {
         s.vstart |= (sprctl[num] << 3) & 0x200;
         s.vstop |= (sprctl[num] << 4) & 0x200;
      }
      this.sprstartstop(s);
   };

	this.SPRxCTL_1 = function (v, num, hpos) {
      //struct sprite *s = &spr[num];
      sprctl[num] = v;
      spr_arm(num, 0);
      this.SPRxCTLPOS(num);
      /*if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) {
       BUG.info('%d:%d:SPR%dCTL %04X P=%06X VSTRT=%d VSTOP=%d HSTRT=%d D=%d A=%d CP=%x PC=%x', this.vpos, hpos, num, v, s->pt, s->vstart, s->vstop, s->xpos, spr[num].dmastate, spr[num].armed, cop_state.ip, M68K_GETPC);
       }*/
   };

	this.SPRxPOS_1 = function (v, num, hpos) {
      //struct sprite *s = &spr[num];
      sprpos[num] = v;
      this.SPRxCTLPOS(num);
      /*if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) {
       BUG.info('%d:%d:SPR%dPOS %04X P=%06X VSTRT=%d VSTOP=%d HSTRT=%d D=%d A=%d CP=%x PC=%x', this.vpos, hpos, num, v, s->pt, s->vstart, s->vstop, s->xpos, spr[num].dmastate, spr[num].armed, cop_state.ip, M68K_GETPC);
       }*/
   };

	this.SPRxDATA_1 = function (v, num, hpos) {
      sprdata[num][0] = v;
      /*#ifdef AGA
       sprdata[num][1] = v;
       sprdata[num][2] = v;
       sprdata[num][3] = v;
       #endif*/
      spr_arm(num, 1);
      /*if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) {
       BUG.info('%d:%d:SPR%dDATA %04X P=%06X D=%d A=%d PC=%x', this.vpos, hpos, num, v, spr[num].pt, spr[num].dmastate, spr[num].armed, M68K_GETPC);
       }*/
   };

	this.SPRxDATB_1 = function (v, num, hpos) {
      sprdatb[num][0] = v;
      /*#ifdef AGA
       sprdatb[num][1] = v;
       sprdatb[num][2] = v;
       sprdatb[num][3] = v;
       #endif*/
      /*if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) {
       BUG.info('%d:%d:SPR%dDATB %04X P=%06X D=%d A=%d PC=%x', this.vpos, hpos, num, v, spr[num].pt, spr[num].dmastate, spr[num].armed, M68K_GETPC);
       }*/
   };
	
	this.SPRxDATA = function (hpos, v, num) {
      this.decide_sprites(hpos);
      this.SPRxDATA_1(v, num, hpos);
   };
	this.SPRxDATB = function (hpos, v, num) {
      this.decide_sprites(hpos);
      this.SPRxDATB_1(v, num, hpos);
   };
	this.SPRxCTL = function (hpos, v, num) {
      this.decide_sprites(hpos);
      this.SPRxCTL_1(v, num, hpos);
   };
	this.SPRxPOS = function (hpos, v, num) {
      this.decide_sprites(hpos);
      this.SPRxPOS_1(v, num, hpos);
   };

	this.SPRxPTH = function (hpos, v, num) {
      this.decide_sprites(hpos);
      if (hpos - 1 != spr[num].ptxhpos) {
         spr[num].pt = ((v << 16) | (spr[num].pt & 0xffff)) >>> 0;
      }
      //if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) BUG.info('%d:%d:SPR%dPTH %06X', this.vpos, hpos, num, spr[num].pt);
   };
	this.SPRxPTL = function (hpos, v, num) {
      this.decide_sprites(hpos);
      if (hpos - 1 != spr[num].ptxhpos) {
         spr[num].pt = ((spr[num].pt & 0xffff0000) | (v & 0xfffe)) >>> 0;
      }
      //if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) BUG.info('%d:%d:SPR%dPTL %06X', this.vpos, hpos, num, spr[num].pt);
   };

	this.setup_sprites = function () {
      if (!sprinit) {
         sprinit = true;
         setup_sprite_tables();
      }
   };
	
	this.cleanup_sprites = function () {
   };
	
	this.reset_sprites = function () {
      var i;
      for (i = 0; i < sprpos.length; i++) sprpos[i] = 0; //memset (sprpos, 0, sizeof sprpos);
      for (i = 0; i < sprctl.length; i++) sprctl[i] = 0; //memset (sprctl, 0, sizeof sprctl);		

      for (i = 0; i < spixels.length; i++) spixels[i] = 0; //memset(spixels, 0, sizeof spixels);       
      for (i = 0; i < spixstate.length; i++) spixstate[i] = 0; //memset(&spixstate, 0, sizeof spixstate);  
   };
	
	/*-----------------------------------------------------------------------*/
	/* playfield */
	/*-----------------------------------------------------------------------*/
	
	/*function debug_cycle_diagram() {
		var fm, res, planes, cycle, v;
		var aa, txt = '';

		for (fm = 0; fm <= 2; fm++) {
			txt += sprintf('FMODE %d\n=======\n', fm);
			for (res = 0; res <= 2; res++) {
				for (planes = 0; planes <= 8; planes++) {
					txt += sprintf('%d: ',planes);
					for (cycle = 0; cycle < 32; cycle++) {
						v = cycle_diagram_table[fm][res][planes][cycle];
						if (v == 0) aa='-'; else if (v > 0) aa='1'; else aa='X';
						txt += sprintf('%s', aa);
					}
					txt += sprintf(' %d:%d\n', cycle_diagram_free_cycles[fm][res][planes], cycle_diagram_total_cycles[fm][res][planes]);
				}
				txt += sprintf('\n');
			}
		}
		BUG.info(txt);		
	}*/
	
	function create_cycle_diagram_table() {
		var fm, res, cycle, planes, rplanes, v;
		var fetch_start, max_planes, freecycles;
		var cycle_sequence;
		var i, j, k, l;
		
		for (i = 0; i < 3; i++) {
			real_bitplane_number[i] = [];			
			cycle_diagram_free_cycles[i] = [];			
			cycle_diagram_total_cycles[i] = [];			
			for (j = 0; j < 3; j++) {
				real_bitplane_number[i][j] = [];			
				cycle_diagram_free_cycles[i][j] = [];			
				cycle_diagram_total_cycles[i][j] = [];			
				for (k = 0; k < 9; k++) {
					real_bitplane_number[i][j][k] = 0;			
					cycle_diagram_free_cycles[i][j][k] = 0;			
					cycle_diagram_total_cycles[i][j][k] = 0;			
				}
			}
		}
		cycle_diagram_table = [];			
		for (i = 0; i < 3; i++) {
			cycle_diagram_table[i] = [];			
			for (j = 0; j < 3; j++) {
				cycle_diagram_table[i][j] = [];			
				for (k = 0; k < 9; k++) {
					cycle_diagram_table[i][j][k] = [];			
					for (l = 0; l < 32; l++)
						cycle_diagram_table[i][j][k][l] = 0;			
				}
			}
		}
		
		for (fm = 0; fm <= 2; fm++) {
			for (res = 0; res <= 2; res++) {
				max_planes = fm_maxplanes[fm * 4 + res];
				fetch_start = 1 << fetchstarts[fm * 4 + res];
				cycle_sequence = cycle_sequences[max_planes - 1];
				max_planes = 1 << max_planes;
				for (planes = 0; planes <= 8; planes++) {
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
					if (rplanes == 7 && fm == 0 && res == 0 && !(AMIGA.config.chipset.mask & CSMASK_AGA))
						rplanes = 4;
					real_bitplane_number[fm][res][planes] = rplanes;
				}
			}
		}
		//debug_cycle_diagram();
	}

	/*---------------------------------*/

	function doMask(p, bits, shift) {
		/* scale to 0..255, shift to align msb with mask, and apply mask */

		//if (flashscreen) p ^= 0xff;
		var val = (p << 24) >>> 0;
		if (!bits)
			return 0;
		val >>>= (32 - bits);
		val <<= shift;

		return val >>> 0;
	}
	function doAlpha (alpha, bits, shift) {
		return ((alpha & ((1 << bits) - 1)) << shift) >>> 0;
	}
	function alloc_colors64k (rw, gw, bw, rs, gs, bs, aw, as, alpha, byte_swap) {
		//#define bswap_16(x) (((x) >> 8) | (((x) & 0xFF) << 8))
		//#define bswap_32(x) (((x) << 24) | (((x) << 8) & 0x00FF0000) | (((x) >> 8) & 0x0000FF00) | ((x) >> 24))
		var bpp = rw + gw + bw + aw;
		//var j = 256;

		//video_calc_gammatable();
		for (var i = 0; i < 4096; i++) {
			var r = ((i >> 8) << 4) | (i >> 8);
			var g = (((i >> 4) & 0xf) << 4) | ((i >> 4) & 0x0f);
			var b = ((i & 0xf) << 4) | (i & 0x0f);
			//r = gamma[r + j];
			//g = gamma[g + j];
			//b = gamma[b + j];
			xcolors[i] = (doMask(r, rw, rs) | doMask(g, gw, gs) | doMask(b, bw, bs) | doAlpha(alpha, aw, as)) >>> 0;
			if (byte_swap) {
				if (bpp <= 16)
					xcolors[i] = bswap_16(xcolors[i]);
				else
					xcolors[i] = bswap_32(xcolors[i]);
			}
			if (bpp <= 16) {
				/* Fill upper 16 bits of each colour value
				* with a copy of the colour. */
				xcolors[i] |= xcolors[i] * 0x00010001;
				xcolors[i] >>>= 0;
			}
		}
		//console.log('alloc_colors64k', xcolors);
	}	
            
	function update_mirrors() {
		aga_mode = (AMIGA.config.chipset.mask & CSMASK_AGA) != 0;
		direct_rgb = aga_mode;
	}	
	
	function docols(colentry) {
/*#ifdef AGA
		if (AMIGA.config.chipset.mask & CSMASK_AGA) {
			for (var i = 0; i < 256; i++) {
				var v = color_reg_get (colentry, i);
				if (v < 0 || v > 16777215)
					continue;
				colentry->acolors[i] = getxcolor (v);
			}
		} else {
#endif*/
			for (var i = 0; i < 32; i++) {
				var v = color_reg_get(colentry, i);
				if (v < 0 || v > 4095)
					continue;
				colentry.acolors[i] = getxcolor(v);
			}
/*#ifdef AGA
		}
#endif*/
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
	
	/*---------------------------------*/

	function getxcolor(c) {
/*#ifdef AGA
		if (direct_rgb)
			return CONVERT_RGB(c);
		else
#endif*/
		return xcolors[c];
	}

	function color_reg_get(ce, c) {
/*#ifdef AGA
		if (aga_mode)
			return ce.color_regs_aga[c];
		else
#endif*/
			return ce.color_regs_ecs[c];
	}

	function color_reg_set(ce, c, v) {
/*#ifdef AGA
		if (aga_mode)
			ce.color_regs_aga[c] = v;
		else
#endif*/
			ce.color_regs_ecs[c] = v;
	}
	
	function color_reg_cmp(ce1, ce2) {
/*#ifdef AGA
		if (aga_mode) {
			v = memcmp (ce1->color_regs_aga, ce2->color_regs_aga, sizeof (uae_u32) * 256);
		} else
#endif*/
		{
			//v = memcmp (ce1.color_regs_ecs, ce2.color_regs_ecs, sizeof (uae_u16) * 32);
			for (var i = 0; i < 32; i++) {
				if (ce1.color_regs_ecs[i] != ce2.color_regs_ecs[i])
					return 1;
			}	
			return ce1.borderblank == ce2.borderblank ? 0 : 1;
		}
	}
	
	function color_reg_cpy(dst, src) {
		dst.borderblank = src.borderblank;
/*#ifdef AGA
		if (aga_mode)
			//copy acolors and color_regs_aga
			memcpy (dst->acolors, src->acolors, sizeof(struct ColorEntry) - sizeof(uae_u16) * 32);
		else
#endif*/
		//copy first 32 acolors and color_regs_ecs
		//memcpy (dst.color_regs_ecs, src.color_regs_ecs, sizeof(struct ColorEntry));
		
		for (var i = 0; i < 32; i++) {
			dst.acolors[i] = src.acolors[i];
			dst.color_regs_ecs[i] = src.color_regs_ecs[i];
		}
		//console.log('color_reg_cpy()', dst, src);		
	}	
	
	function color_reg_cpy_acolors(dst, src) {
		dst.borderblank = src.borderblank;
		for (var i = 0; i < dst.acolors.length; i++)
			dst.acolors[i] = src.acolors[i];
	}	
	
	/*---------------------------------*/

	this.remember_ctable = function () {
      if (next_color_entry >= COLOR_TABLE_SIZE) {
         BUG.info('remember_ctable() BUG', next_color_entry);
         return;
      }
      if (remembered_color_entry < 0) {
         color_reg_cpy(curr_color_tables[next_color_entry], current_colors);
         remembered_color_entry = next_color_entry++;
      }
      thisline_decision.ctable = remembered_color_entry;

      if (color_src_match < 0 || color_dest_match != remembered_color_entry || line_decisions[next_lineno].ctable != color_src_match) {
         var oldctable = line_decisions[next_lineno].ctable;
         var changed = 0;

         if (oldctable < 0) {
            changed = 1;
            color_src_match = color_dest_match = -1;
         } else {
            color_compare_result = color_reg_cmp(prev_color_tables[oldctable], current_colors) != 0;
            if (color_compare_result)
               changed = 1;
            color_src_match = oldctable;
            color_dest_match = remembered_color_entry;
         }
         thisline_changed |= changed;
      } else {
         if (color_compare_result)
            thisline_changed = 1;
      }
   };

	this.record_color_change2 = function (hpos, regno, value) {
      //if (FAST_COLORS) //en for better?
      //return;
      var pos = hpos * 2;
      if (regno == 0x1000 + 0x10c) pos++; // BPLCON4 change needs 1 lores pixel delay
      curr_color_changes[next_color_change].linepos = pos;
      curr_color_changes[next_color_change].regno = regno;
      curr_color_changes[next_color_change++].value = value;
      curr_color_changes[next_color_change].regno = -1;
      //console.log('record_color_change2()', next_color_change); 
   };
	
	this.record_color_change = function (hpos, regno, value) {
      if (FAST_COLORS)
         return;
      if (this.vpos < minfirstline || (regno < 0x1000 && this.nodraw()))
         return;

      this.decide_diw(hpos);
      this.decide_line(hpos);

      if (thisline_decision.ctable < 0)
         this.remember_ctable();

      if ((regno < 0x1000 || regno == 0x1000 + 0x10c) && hpos < HBLANK_OFFSET && !(beamcon0 & 0x80) && prev_lineno >= 0) {
         var pdip = curr_drawinfo[prev_lineno];
         var idx = pdip.last_color_change;
         var extrahpos = regno == 0x1000 + 0x10c ? 1 : 0;
         var lastsync = false;

         if (idx > 0 && curr_color_changes[idx - 1].regno == 0xffff) {
            idx--;
            lastsync = true;
         }
         pdip.last_color_change++;
         pdip.nr_color_changes++;
         curr_color_changes[idx].linepos = (hpos + this.maxhpos) * 2 + extrahpos;
         curr_color_changes[idx].regno = regno;
         curr_color_changes[idx].value = value;
         if (lastsync) {
            curr_color_changes[idx + 1].linepos = hsyncstartpos * 2;
            curr_color_changes[idx + 1].regno = 0xffff;
            curr_color_changes[idx + 2].regno = -1;
         } else
            curr_color_changes[idx + 1].regno = -1;
      }
      this.record_color_change2(hpos, regno, value);
   };	
	
	this.isbrdblank = function (hpos, con0, con3) {
      var brdblank = (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) != 0 && (con0 & 1) != 0 && (con3 & 0x20) != 0;

      if (hpos >= 0 && current_colors.borderblank != brdblank) {
         if (!FAST_COLORS) {
            this.record_color_change(hpos, 0, (COLOR_CHANGE_BRDBLANK | (brdblank ? 1 : 0)) >>> 0);
            remembered_color_entry = -1;
         }
         current_colors.borderblank = brdblank;
      }
      return brdblank;
   };

	this.record_register_change = function (hpos, regno, value) {
      if (regno == 0x100) { // BPLCON0
         if (value & 0x800)
            thisline_decision.ham_seen = 1;
         thisline_decision.ehb_seen = is_ehb(value, bplcon2);
         this.isbrdblank(hpos, value, bplcon3);
      } else if (regno == 0x104) // BPLCON2
         thisline_decision.ehb_seen = is_ehb(bplcon0, value);
      else if (regno == 0x106) // BPLCON3
         this.isbrdblank(hpos, bplcon0, value);

      if (!FAST_COLORS)
         this.record_color_change(hpos, regno + 0x1000, value);
   };	
	
	/*---------------------------------*/	
	
	this.compute_vsynctime = function () {
      if (AMIGA.config.chipset.refreshrate > 0)
         this.vblank_hz = AMIGA.config.chipset.refreshrate;

      AMIGA.events.calc_vsynctimebase(this.vblank_hz);

      if (AMIGA.config.audio.enabled && AMIGA.config.audio.mode > 0)
         AMIGA.audio.calc_sample_evtime(this.vblank_hz, (bplcon0 & 4) ? -1 : this.lof_store, this.is_linetoggle());
   };

	this.compute_framesync = function () {
      var islace = interlace_seen ? 1 : 0;
      var isntsc = (beamcon0 & 0x20) ? 0 : 1;

      interlace_changed = 0;
      gfxvidinfo.drawbuffer.inxoffset = -1;
      gfxvidinfo.drawbuffer.inyoffset = -1;

      if (beamcon0 & 0x80) {
         //var res = GET_RES_AGNUS(bplcon0);
         //var vres = islace ? 1 : 0;
         var res2, vres2;

         res2 = AMIGA.config.video.hresolution;
         if (doublescan > 0)
            res2++;
         if (res2 > RES_MAX)
            res2 = RES_MAX;

         vres2 = AMIGA.config.video.vresolution;
         if (doublescan > 0 && !islace)
            vres2--;

         if (vres2 < 0)
            vres2 = 0;
         if (vres2 > VRES_QUAD)
            vres2 = VRES_QUAD;

         var start = this.hbstrt;
         var stop = this.hbstop;

         gfxvidinfo.drawbuffer.inwidth = (((start > stop ? (this.maxhpos - (this.maxhpos - start + stop)) : (this.maxhpos - (stop - start) + 2)) * 2) << res2);
         gfxvidinfo.drawbuffer.inxoffset = ((stop + 1) & ~1) * 2;

         gfxvidinfo.drawbuffer.extrawidth = 0;
         gfxvidinfo.drawbuffer.inwidth2 = gfxvidinfo.drawbuffer.inwidth;

         gfxvidinfo.drawbuffer.inheight = (this.maxvpos - minfirstline) << vres2;
         gfxvidinfo.drawbuffer.inheight2 = gfxvidinfo.drawbuffer.inheight;
      } else {
         gfxvidinfo.drawbuffer.inwidth = AMIGA_WIDTH_MAX << AMIGA.config.video.hresolution;
         gfxvidinfo.drawbuffer.extrawidth = AMIGA.config.video.extrawidth ? AMIGA.config.video.extrawidth : -1;
         gfxvidinfo.drawbuffer.inwidth2 = gfxvidinfo.drawbuffer.inwidth;
         gfxvidinfo.drawbuffer.inheight = (this.maxvpos_nom - minfirstline + 1) << AMIGA.config.video.vresolution;
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

      //if (target_graphics_buffer_update()) this.reset_drawing();

      for (var i = 0; i < 2 * (MAXVPOS + 2) + 1; i++) //memset (line_decisions, 0, sizeof line_decisions); 
         line_decisions[i].clr();

      this.compute_vsynctime();

      BUG.info('%s mode%s%s V=%.4fHz H=%.4fHz (%dx%d+%d)',
         isntsc ? 'NTSC' : 'PAL',
         islace ? ' lace' : '',
         doublescan > 0 ? ' dblscan' : '',
         this.vblank_hz,
         (AMIGA.config.video.ntsc ? CHIPSET_CLOCK_NTSC : CHIPSET_CLOCK_PAL) / (this.maxhpos + (this.is_linetoggle() ? 0.5 : 0)),
         this.maxhpos, this.maxvpos, this.lof_store ? 1 : 0
      );
   };

	this.init_hz = function (fullinit) {
      var isntsc, islace;
      var odbl = doublescan, omaxvpos = this.maxvpos;
      var hzc = 0;

      if (fullinit)
         this.vpos_count = 0;

      this.vpos_count_diff = this.vpos_count;

      doublescan = 0;
      //programmedmode = false;
      if ((beamcon0 & 0xA0) != (new_beamcon0 & 0xA0))
         hzc = 1;
      if (beamcon0 != new_beamcon0) {
         BUG.info('init_hz() BEAMCON0 %04x -> %04x', beamcon0, new_beamcon0);
         this.vpos_count_diff = this.vpos_count = 0;
      }
      beamcon0 = new_beamcon0;
      isntsc = (beamcon0 & 0x20) ? 0 : 1;
      islace = (interlace_seen) ? 1 : 0;
      if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
         isntsc = AMIGA.config.video.ntsc ? 1 : 0;
      if (!isntsc) {
         this.maxvpos = MAXVPOS_PAL;
         this.maxhpos = MAXHPOS_PAL;
         this.vblank_hz = VBLANK_HZ_PAL;
         minfirstline = VBLANK_ENDLINE_PAL;
         sprite_vblank_endline = VBLANK_SPRITE_PAL;
         equ_vblank_endline = EQU_ENDLINE_PAL;
         equ_vblank_toggle = true;
      } else {
         this.maxvpos = MAXVPOS_NTSC;
         this.maxhpos = MAXHPOS_NTSC;
         this.vblank_hz = VBLANK_HZ_NTSC;
         minfirstline = VBLANK_ENDLINE_NTSC;
         sprite_vblank_endline = VBLANK_SPRITE_NTSC;
         equ_vblank_endline = EQU_ENDLINE_NTSC;
         equ_vblank_toggle = false;
      }
      // long/short field refresh rate adjustment
      //this.vblank_hz >>= (AMIGA.config.video.framerate > 1 ? 1 : 0);
      this.vblank_hz = this.vblank_hz * (this.maxvpos * 2 + 1) / ((this.maxvpos + this.lof_current) * 2);

      this.maxvpos_nom = this.maxvpos;
      if (this.vpos_count > 0) {
         BUG.info('init_hz() poked VPOSW at %d', this.vpos_count);
         // we come here if this.vpos_count != this.maxvpos and beamcon0 didn't change (someone poked VPOSW)
         if (this.vpos_count < 10)
            this.vpos_count = 10;
         this.vblank_hz = (isntsc ? 15734 : 15625) / this.vpos_count;
         this.maxvpos_nom = this.vpos_count - (this.lof_current ? 1 : 0);
         this.reset_drawing();
      }
      if (beamcon0 & 0x80) {
         // programmable scanrates (ECS Agnus)
         if (this.vtotal >= MAXVPOS)
            this.vtotal = MAXVPOS - 1;
         this.maxvpos = this.vtotal + 1;
         if (this.htotal >= MAXHPOS)
            this.htotal = MAXHPOS - 1;
         this.maxhpos = this.htotal + 1;
         this.vblank_hz = 227 * 312 * 50 / (this.maxvpos * this.maxhpos);
         minfirstline = this.vsstop > this.vbstop ? this.vsstop : this.vbstop;
         if (minfirstline > this.maxvpos / 2)
            minfirstline = this.vsstop > this.vsstop ? this.vbstop : this.vsstop;
         if (minfirstline < 2)
            minfirstline = 2;
         if (minfirstline >= this.maxvpos)
            minfirstline = this.maxvpos - 1;
         sprite_vblank_endline = minfirstline - 2;
         this.maxvpos_nom = this.maxvpos;
         equ_vblank_endline = -1;
         doublescan = this.htotal <= 164 ? 1 : 0;
         //programmedmode = true;
         this.dumpsync();
         hzc = 1;
      }
      if (this.maxvpos_nom >= MAXVPOS)
         this.maxvpos_nom = MAXVPOS;
      if (AMIGA.config.video.scandoubler && doublescan == 0)
         doublescan = -1;

      if (doublescan != odbl || this.maxvpos != omaxvpos)
         hzc = 1;
      if (this.vblank_hz < 10)
         this.vblank_hz = 10;
      if (this.vblank_hz > 300)
         this.vblank_hz = 300;
      this.maxhpos_short = this.maxhpos;
      if (beamcon0 & 0x80) {
         if (this.hbstrt > this.maxhpos)
            hsyncstartpos = this.hbstrt;
         else
            hsyncstartpos = this.maxhpos + this.hbstrt;
         if (this.hbstop > this.maxhpos)
            hsyncendpos = this.maxhpos - this.hbstop;
         else
            hsyncendpos = this.hbstop;
      } else {
         hsyncstartpos = this.maxhpos_short + 13;
         hsyncendpos = 24;
      }

      AMIGA.events.eventtab[EV_HSYNC].evtime = AMIGA.events.currcycle + this.maxhpos * CYCLE_UNIT;
      AMIGA.events.eventtab[EV_HSYNC].oldcycles = AMIGA.events.currcycle;
      AMIGA.events.schedule();

      if (hzc) {
         interlace_seen = islace;
         this.reset_drawing();
      }

      this.maxvpos_total = (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) ? 2047 : 511;
      if (this.maxvpos_total > MAXVPOS)
         this.maxvpos_total = MAXVPOS;
      /*#ifdef PICASSO96
       if (!p96refresh_active) {
       maxvpos_stored = this.maxvpos;
       maxhpos_stored = this.maxhpos;
       vblank_hz_stored = this.vblank_hz;
       }
       #endif*/
      this.compute_framesync();
      /*#ifdef PICASSO96
       init_hz_p96 ();
       #endif*/
      if (fullinit)
         this.vpos_count_diff = this.maxvpos_nom;
   };
	
	this.BPLxPTH = function (hpos, v, num) {
      this.decide_line(hpos);
      this.decide_fetch(hpos);
      bplpt[num] = ((v << 16) | (bplpt[num] & 0xffff)) >>> 0;
      bplptx[num] = ((v << 16) | (bplptx[num] & 0xffff)) >>> 0;
      //BUG.info('%d:%d:BPL%dPTH %08X', hpos, this.vpos, num, bplpt[num]);
   };

	this.BPLxPTL = function (hpos, v, num) {
      this.decide_line(hpos);
      this.decide_fetch(hpos);
      //if (AMIGA.copper.access && this.is_bitplane_dma(hpos + 1) == num + 1) return;

      bplpt[num] = ((bplpt[num] & 0xffff0000) | (v & 0xfffe)) >>> 0;
      bplptx[num] = ((bplptx[num] & 0xffff0000) | (v & 0xfffe)) >>> 0;
      //BUG.info('%d:%d:BPL%dPTL %08X', hpos, this.vpos, num, bplpt[num]);
   };

	this.BPLxDAT = function (hpos, v, num) {
      if (num == 0 && hpos >= 7) {
         this.decide_line(hpos);
         this.decide_fetch(hpos);
      }
      bplxdat[num] = v;
      if (num == 0 && hpos >= 7) {
         bpl1dat_written = true;
         bpl1dat_written_at_least_once = true;
         if (thisline_decision.plfleft < 0) {
            thisline_decision.plfleft = hpos & ~3;
            this.reset_bpl_vars();
            this.compute_delay_offset();
         }
         this.update_bpldats(hpos);
      }
   };
	
	this.BPLCON0_Denise = function (hpos, v, immediate) {
      if (!(AMIGA.config.chipset.mask & CSMASK_ECS_DENISE))
         v &= ~0x00F1;
      else if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
         v &= ~0x00B0;
      v &= ~(0x0200 | 0x0100 | 0x0080 | 0x0020);
      /*#if SPRBORDER
       v |= 1;
       #endif*/
      if (bplcon0_d == v)
         return;

      bplcon0_dd = -1;
      if (is_ehb(bplcon0_d, bplcon2))
         v |= 0x80;

      if (immediate)
         this.record_register_change(hpos, 0x100, v);
      else
         this.record_register_change(hpos, 0x100, (bplcon0_d & ~(0x800 | 0x400 | 0x80)) | (v & (0x0800 | 0x400 | 0x80 | 0x01)));

      bplcon0_d = v & ~0x80;

      if (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) {
         this.decide_sprites(hpos);
         sprres = expand_sprres(v, bplcon3);
      }
      if (thisline_decision.plfleft < 0)
         this.update_denise(hpos);
   };

	this.BPLCON0 = function (hpos, v) {
      if (!(AMIGA.config.chipset.mask & CSMASK_ECS_DENISE))
         v &= ~0x00F1;
      else if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
         v &= ~0x00B0;
      v &= ~(0x0080 | 0x0020);

      /*#if SPRBORDER
       v |= 1;
       #endif*/
      if (bplcon0 == v)
         return;

      if (!this.issyncstopped()) {
         vpos_previous = this.vpos;
         hpos_previous = hpos;
      }

      if ((bplcon0 & 4) != (v & 4))
         this.checklacecount((v & 4) != 0);

      bplcon0 = v;

      this.bpldmainitdelay(hpos);

      if (thisline_decision.plfleft < 0)
         this.BPLCON0_Denise(hpos, v, true);
   };

	this.BPLCON1 = function (hpos, v) {
      if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
         v &= 0xff;
      if (bplcon1 == v)
         return;
      ddf_change = this.vpos;
      this.decide_line(hpos);
      this.decide_fetch(hpos);
      bplcon1_hpos = hpos;
      bplcon1 = v;
   };

	this.BPLCON2 = function (hpos, v) {
      if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
         v &= 0x7f;
      if (bplcon2 == v)
         return;
      this.decide_line(hpos);
      bplcon2 = v;
      this.record_register_change(hpos, 0x104, v);
   };

	this.BPLCON3 = function (hpos, v) {
      if (!(AMIGA.config.chipset.mask & CSMASK_ECS_DENISE))
         return;
      if (!(AMIGA.config.chipset.mask & CSMASK_AGA)) {
         v &= 0x003f;
         v |= 0x0c00;
      }
      /*#if SPRBORDER
       v |= 2;
       #endif*/
      if (bplcon3 == v)
         return;
      this.decide_line(hpos);
      this.decide_sprites(hpos);
      bplcon3 = v;
      sprres = expand_sprres(bplcon0, bplcon3);
      this.record_register_change(hpos, 0x106, v);
   };

/*#ifdef AGA
	this.BPLCON4 = function(hpos, v) {
		if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
			return;
		if (bplcon4 == v)
			return;
		this.decide_line(hpos);
		bplcon4 = v;
		this.record_register_change(hpos, 0x10c, v);
	}
#endif*/

	function castWord(v) { return (v & 0x8000) ? (v - 0x10000) : v; }

	this.BPL1MOD = function (hpos, v) {
      v &= ~1;
      if (bpl1mod == castWord(v))
         return;
      this.decide_line(hpos);
      this.decide_fetch(hpos);
      bpl1mod = castWord(v);
   };

	this.BPL2MOD = function (hpos, v) {
      v &= ~1;
      if (bpl2mod == castWord(v))
         return;
      this.decide_line(hpos);
      this.decide_fetch(hpos);
      bpl2mod = castWord(v);
   };
	
	this.calcdiw = function () {
      var hstrt = diwstrt & 0xFF;
      var hstop = diwstop & 0xFF;
      var vstrt = diwstrt >> 8;
      var vstop = diwstop >> 8;

      // vertical in ECS Agnus
      if (diwhigh_written && (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)) {
         vstrt |= (diwhigh & 7) << 8;
         vstop |= ((diwhigh >> 8) & 7) << 8;
      } else {
         if ((vstop & 0x80) == 0)
            vstop |= 0x100;
      }
      // horizontal in ECS Denise
      if (diwhigh_written && (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE)) {
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
         diwfirstword = 0;
         diwlastword = max_diwlastword();
      }
      if (diwfirstword < 0)
         diwfirstword = 0;

      plffirstline = vstrt;
      plflastline = vstop;

      plfstrt = ddfstrt;
      plfstop = ddfstop;
      /* probably not the correct place.. should use plf_state instead */
      if (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) {
         /* ECS/AGA and ddfstop > maxhpos == always-on display */
         if (plfstop > this.maxhpos)
            plfstrt = 0;
         if (plfstrt < HARD_DDF_START)
            plfstrt = HARD_DDF_START;
         plfstrt_start = plfstrt - 4;
      } else {
         /* OCS and ddfstrt >= ddfstop == ddfstop = max */
         if (plfstrt >= plfstop && plfstrt >= HARD_DDF_START)
            plfstop = 0xff;
         plfstrt_start = HARD_DDF_START - 2;
      }
      diw_change = 2;
      //console.log('calcdiw', hstrt,hstop,vstrt,vstop, plfstrt,plfstop);
   };

	this.DIWSTRT = function (hpos, v) {
      if (diwstrt == v && !diwhigh_written)
         return;
      this.decide_diw(hpos);
      this.decide_line(hpos);
      diwhigh_written = false;
      diwstrt = v;
      this.calcdiw();
   };

	this.DIWSTOP = function (hpos, v) {
      if (diwstop == v && !diwhigh_written)
         return;
      this.decide_diw(hpos);
      this.decide_line(hpos);
      diwhigh_written = false;
      diwstop = v;
      this.calcdiw();
   };

	this.DIWHIGH = function (hpos, v) {
      if (!(AMIGA.config.chipset.mask & (CSMASK_ECS_DENISE | CSMASK_ECS_AGNUS)))
         return;
      if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
         v &= ~(0x0008 | 0x0010 | 0x1000 | 0x0800);
      v &= ~(0x8000 | 0x4000 | 0x0080 | 0x0040);
      if (diwhigh_written && diwhigh == v)
         return;
      this.decide_line(hpos);
      diwhigh_written = true;
      diwhigh = v;
      this.calcdiw();
   };	

	this.DDFSTRT = function (hpos, v) {
      v &= 0xfe;
      if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
         v &= 0xfc;
      if (ddfstrt == v && hpos + 2 != ddfstrt)
         return;
      ddf_change = this.vpos;
      this.decide_line(hpos);
      ddfstrt_old_hpos = hpos;
      ddfstrt = v;
      this.calcdiw();
      /*if (ddfstop > 0xD4 && (ddfstrt & 4) == 4) {
       static int last_warned;
       last_warned = (last_warned + 1) & 4095;
       if (last_warned == 0) BUG.info('WARNING! Very strange DDF values (%x %x).', ddfstrt, ddfstop);
       }*/
   };

	this.DDFSTOP = function (hpos, v) {
      v &= 0xfe;
      if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
         v &= 0xfc;
      if (ddfstop == v && hpos + 2 != ddfstop)
         return;
      ddf_change = this.vpos;
      this.decide_line(hpos);
      this.decide_fetch(hpos);
      ddfstop = v;
      this.calcdiw();
      if (fetch_state != FETCH_NOT_STARTED)
         this.estimate_last_fetch_cycle(hpos);
      /*if (ddfstop > 0xD4 && (ddfstrt & 4) == 4) {
       static int last_warned;
       if (last_warned == 0) BUG.info('WARNING! Very strange DDF values (%x).', ddfstop);
       last_warned = (last_warned + 1) & 4095;
       }*/
   };
	
	this.FMODE = function (hpos, v) {
      if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
         v = 0;
      v &= 0xC00F;
      if (fmode == v)
         return;
      ddf_change = this.vpos;
      fmode = v;
      sprite_width = GET_SPRITEWIDTH(fmode);
      this.bpldmainitdelay(hpos);
   };	
	
	this.checkautoscalecol0 = function () {
      if (!AMIGA.copper.access || this.vpos < 20 || this.isbrdblank(-1, bplcon0, bplcon3))
         return;
      // autoscale if copper changes COLOR00 on top or bottom of screen
      if (this.vpos >= minfirstline) {
         var vpos2 = autoscale_bordercolors ? minfirstline : this.vpos;
         if (first_planes_vpos == 0)
            first_planes_vpos = vpos2 - 2;
         if (plffirstline_total == this.current_maxvpos())
            plffirstline_total = vpos2 - 2;
         if (vpos2 > last_planes_vpos || vpos2 > plflastline_total)
            plflastline_total = last_planes_vpos = vpos2 + 3;
         autoscale_bordercolors = 0;
      } else
         autoscale_bordercolors++;
   };
	
	this.COLOR_WRITE = function (hpos, v, num) {
      //var colzero = false;
      v &= 0xFFF;
      /*#ifdef AGA
       if (AMIGA.config.chipset.mask & CSMASK_AGA) {
       int r,g,b;
       int cr,cg,cb;
       int colreg;
       uae_u32 cval;

       if (bplcon2 & 0x0100)
       return;

       colreg = ((bplcon3 >> 13) & 7) * 32 + num;
       r = (v & 0xF00) >> 8;
       g = (v & 0xF0) >> 4;
       b = (v & 0xF) >> 0;
       cr = current_colors.color_regs_aga[colreg] >> 16;
       cg = (current_colors.color_regs_aga[colreg] >> 8) & 0xFF;
       cb = current_colors.color_regs_aga[colreg] & 0xFF;

       if (bplcon3 & 0x200) {
       cr &= 0xF0; cr |= r;
       cg &= 0xF0; cg |= g;
       cb &= 0xF0; cb |= b;
       } else {
       cr = r + (r << 4);
       cg = g + (g << 4);
       cb = b + (b << 4);
       color_regs_aga_genlock[colreg] = v >> 15;
       }
       cval = (cr << 16) | (cg << 8) | cb;
       if (cval && colreg == 0)
       colzero = true;

       if (cval == current_colors.color_regs_aga[colreg])
       return;

       if (colreg == 0)
       this.checkautoscalecol0 ();

       //Call this with the old table still intact.
       this.record_color_change (hpos, colreg, cval);
       remembered_color_entry = -1;
       current_colors.color_regs_aga[colreg] = cval;
       current_colors.acolors[colreg] = getxcolor (cval);

       } else {
       #endif*/
      //if (num && v == 0) colzero = true;

      if (!FAST_COLORS) {
         if (current_colors.color_regs_ecs[num] == v)
            return;
      }
      if (num == 0)
         this.checkautoscalecol0();

      if (!FAST_COLORS) {
         this.record_color_change(hpos, num, v);
         remembered_color_entry = -1;
      }
      current_colors.color_regs_ecs[num] = v;
      current_colors.acolors[num] = getxcolor(v);
      /*#ifdef AGA
       }
       #endif*/
   };	

	/*this.islightpentriggered = function() {
		if (beamcon0 & 0x2000) // LPENDIS
			return 0;
		return lightpen_triggered > 0;
	}
	this.GETVPOS = function() {
		return this.islightpentriggered() ? vpos_lpen : (this.issyncstopped() ? vpos_previous : this.vpos);
	}
	this.GETHPOS = function() {
		return this.islightpentriggered() ? hpos_lpen : (this.issyncstopped() ? hpos_previous : this.hpos());
	}*/
	this.issyncstopped = function () {
      return (bplcon0 & 2) != 0 && !AMIGA.config.chipset.genlock;
   };
	this.GETVPOS = function () {
      return this.issyncstopped() ? vpos_previous : this.vpos;
   };
	this.GETHPOS = function () {
      return this.issyncstopped() ? hpos_previous : this.hpos();
   };

	const HPOS_OFFSET = 3; //(currprefs.cpu_model < 68020 ? 3 : 0)
	
	this.VPOSR = function () {
      var vp = this.GETVPOS();
      var hp = this.GETHPOS();
      //var vp = this.vpos;
      //var hp = this.hpos();
      var csbit = 0;

      if (hp + HPOS_OFFSET >= this.maxhpos) {
         vp++;
         if (vp >= this.maxvpos + this.lof_store)
            vp = 0;
      }
      vp = (vp >> 8) & 7;

      if (AMIGA.config.chipset.agnus_rev >= 0)
         csbit |= AMIGA.config.chipset.agnus_rev << 8;
      else {
         /*#ifdef AGA
          csbit |= (AMIGA.config.chipset.mask & CSMASK_AGA) ? 0x2300 : 0;
          #endif*/
         csbit |= (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) ? 0x2000 : 0;
         if (AMIGA.mem.chip.size > 1024 * 1024 && (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
            csbit |= 0x2100;
         if (AMIGA.config.video.ntsc)
            csbit |= 0x1000;
      }

      if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
         vp &= 1;
      vp = vp | (this.lof_store ? 0x8000 : 0) | csbit;
      if (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)
         vp |= this.lol ? 0x80 : 0;

      //BUG.info('VPOSR $%x', vp);
      return vp;
   };

	this.VPOSW = function (v) {
      if (this.lof_store != ((v & 0x8000) ? 1 : 0)) {
         this.lof_store = (v & 0x8000) ? 1 : 0;
         this.lof_changing = this.lof_store ? 1 : -1;
      }
      if (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) {
         this.lol = (v & 0x0080) ? 1 : 0;
         if (!this.is_linetoggle())
            this.lol = 0;
      }
      if (this.lof_changing)
         return;

      v &= 7;
      if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
         v &= 1;

      this.vpos &= 0x00ff;
      this.vpos |= v << 8;
      //BUG.info('VPOSW $%x', this.vpos);
   };

	this.VHPOSW = function (v) {
      this.vpos &= 0xff00;
      this.vpos |= v >> 8;
      //BUG.info('VHPOSW %x %d', v, this.vpos);
   };

	this.VHPOSR = function () {
      var vp = this.GETVPOS();
      var hp = this.GETHPOS();
      //var vp = this.vpos;
      //var hp = this.hpos();

      hp += HPOS_OFFSET;
      if (hp >= this.maxhpos) {
         hp -= this.maxhpos;
         vp++;
         if (vp >= this.maxvpos + this.lof_store)
            vp = 0;
      }
      if (HPOS_OFFSET) {
         hp += 1;
         if (hp >= this.maxhpos)
            hp -= this.maxhpos;
      }
      vp &= 0xff;
      hp &= 0xff;

      vp <<= 8;
      vp |= hp;

      //BUG.info('VHPOSR $%x', vp);
      return vp;
   };	
	
	this.BEAMCON0 = function (v) {
      if (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) {
         if (!(AMIGA.config.chipset.mask & CSMASK_ECS_DENISE))
            v &= 0x20;

         if (v != new_beamcon0) {
            new_beamcon0 = v;
            if (v & ~0x20)
               BUG.info('BEAMCON0() $%04x written.', v);
         }
      }
   };

	this.DENISEID = function () {
      if (AMIGA.config.chipset.denise_rev >= 0)
         return [0, AMIGA.config.chipset.denise_rev];
      /*#ifdef AGA
       if (AMIGA.config.chipset.mask & CSMASK_AGA) {
       if (currprefs.cs_ide == IDE_A4000) return [0, 0xFCF8];
       return [0, 0x00F8];
       }
       #endif*/
      if (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE)
         return [0, 0xFFFC];

      if (AMIGA.config.cpu.model == 68000 && AMIGA.config.cpu.compatible)
         return [1, 0xFFFF];
      return [0, 0xFFFF];
   };	
	
	/*---------------------------------*/

	this.is_bitplane_dma = function (hpos) {
      if (hpos < plfstrt)
         return 0;
      if ((plf_state == PLF_END && hpos >= thisline_decision.plfright) || hpos >= estimated_last_fetch_cycle)
         return 0;

      return curr_diagram[(hpos - cycle_diagram_shift) & fetchstart_mask];
   };
	
	this.update_denise = function (hpos) {
      toscr_res = GET_RES_DENISE(bplcon0_d);
      if (bplcon0_dd != bplcon0_d) {
         this.record_color_change2(hpos, 0x100 + 0x1000, bplcon0_d);
         bplcon0_dd = bplcon0_d;
      }
      toscr_nr_planes = GET_PLANES(bplcon0_d);

      if (!(AMIGA.config.chipset.mask & CSMASK_AGA) && bplcon0_res == 0 && bplcon0_planes == 7) { //OCS 7 planes			
         if (toscr_nr_planes2 < 6)
            toscr_nr_planes2 = 6;
      } else
         toscr_nr_planes2 = toscr_nr_planes;
   };	
	
	this.setup_fmodes = function (hpos) {
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
      curr_diagram = cycle_diagram_table[fetchmode][bplcon0_res][bplcon0_planes_limit];
      this.estimate_last_fetch_cycle(hpos);
      bpldmasetuphpos = -1;
      bpldmasetupphase = 0;
      ddf_change = this.vpos;
   };	

	this.maybe_setup_fmodes = function (hpos) {
      switch (bpldmasetupphase) {
         case 0:
            this.BPLCON0_Denise(hpos, bplcon0, false);
            bpldmasetupphase++;
            bpldmasetuphpos += (4 + (bplcon0_planes == 8 ? 1 : 0)) - BPLCON_DENISE_DELAY;
            break;
         case 1:
            this.setup_fmodes(hpos);
            break;
      }
   };

	this.maybe_check = function (hpos) {
      if (bpldmasetuphpos > 0 && hpos >= bpldmasetuphpos)
         this.maybe_setup_fmodes(hpos);
   };	

	this.compute_delay_offset = function () {
      delayoffset = (16 << fetchmode) - (((plfstrt - HARD_DDF_START) & fetchstart_mask) << 1);
   };	
	
	this.compute_toscr_delay_1 = function (con1) {
      var delay1 = (con1 & 0x0f) | ((con1 & 0x0c00) >> 6);
      var delay2 = ((con1 >> 4) & 0x0f) | (((con1 >> 4) & 0x0c00) >> 6);
      var shdelay1 = (con1 >> 12) & 3;
      var shdelay2 = (con1 >> 8) & 3;
      var delaymask;
      var fetchwidth = 16 << fetchmode;

      delay1 += delayoffset;
      delay2 += delayoffset;
      delaymask = (fetchwidth - 1) >> toscr_res;
      toscr_delay1 = (delay1 & delaymask) << toscr_res;
      toscr_delay1 |= shdelay1 >> (RES_MAX - toscr_res);
      toscr_delay2 = (delay2 & delaymask) << toscr_res;
      toscr_delay2 |= shdelay2 >> (RES_MAX - toscr_res);
   };

	this.compute_toscr_delay = function (hpos, con1) {
      this.update_denise(hpos);
      this.compute_toscr_delay_1(con1);
   };

	this.update_toscr_planes = function () {
      if (toscr_nr_planes2 > thisline_decision.nr_planes) {
         for (var j = thisline_decision.nr_planes; j < toscr_nr_planes2; j++) {
            if (!thisline_changed) {
               for (var i = 0; i < out_offs; i++) {
                  if (line_data[next_lineno][j][i]) {
                     thisline_changed = 1;
                     break;
                  }
               }
            }
            for (var i = 0; i < out_offs; i++) line_data[next_lineno][j][i] = 0; //memset(ptr, 0, out_offs * 4);
         }
         thisline_decision.nr_planes = toscr_nr_planes2;
      }
   };

	this.maybe_first_bpl1dat = function (hpos) {
      if (thisline_decision.plfleft >= 0) {
         if (plfleft_real < 0) {
            for (var i = 0; i < MAX_PLANES; i++) {
               todisplay[i][0] = 0;
               /*#ifdef AGA
                todisplay[i][1] = 0;
                todisplay[i][2] = 0;
                todisplay[i][3] = 0;
                #endif*/
            }
            plfleft_real = hpos;
            bpl1dat_early = true;
         }
      } else {
         plfleft_real = thisline_decision.plfleft = hpos;
         this.compute_delay_offset();
      }
   }; 
	 
 	this.checklacecount = function (lace) {
      if (lace === null)
         lace = (bplcon0 & 4) != 0;

      if (!interlace_changed) {
         if (nlace_cnt >= NLACE_CNT_NEEDED && lace) {
            lof_togglecnt_lace = LOF_TOGGLES_NEEDED;
            lof_togglecnt_nlace = 0;
            //BUG.info('immediate lace');
            nlace_cnt = 0;
         } else if (nlace_cnt <= -NLACE_CNT_NEEDED && !lace) {
            lof_togglecnt_nlace = LOF_TOGGLES_NEEDED;
            lof_togglecnt_lace = 0;
            //BUG.info('immediate nlace');
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
   };
	
	var dumpcnt = 100;
	this.dumpsync = function () {
      if (dumpcnt < 0)
         return;
      dumpcnt--;
      BUG.info('BEAMCON0=%04X VTOTAL=%04X  HTOTAL=%04X', new_beamcon0, this.vtotal, this.htotal);
      BUG.info('  HSSTOP=%04X HBSTRT=%04X  HBSTOP=%04X', this.hsstop, this.hbstrt, this.hbstop);
      BUG.info('  VSSTOP=%04X VBSTRT=%04X  VBSTOP=%04X', this.vsstop, this.vbstrt, this.vbstop);
      BUG.info('  HSSTRT=%04X VSSTRT=%04X HCENTER=%04X', this.hsstrt, this.vsstrt, this.hcenter);
   };
	
	this.varsync = function () {
      //console.log('varsync()');
      if (!CUSTOM_SIMPLE) {
         if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
            return;
         if (!(beamcon0 & 0x80))
            return;
         this.vpos_count = 0;
         //this.dumpsync();
      }
   };
	
	this.count_frame = function () {
      if (++this.framecnt >= AMIGA.config.video.framerate)
         this.framecnt = 0;
   };	
	
	this.vsync_handle_redraw = function () { //(long_frame, lof_changed, bplcon0p, bplcon3p)
      last_redraw_point++;
      if (this.lof_changed || this.lof_store || interlace_seen <= 0 || doublescan < 0 || last_redraw_point >= 2) {
         last_redraw_point = 0;

         if (this.framecnt == 0)
            this.finish_drawing_frame();
         /*#if 0
          if (interlace_seen > 0)
          interlace_seen = -1;
          else if (interlace_seen == -1) {
          interlace_seen = 0;
          if (currprefs.scandoubler && currprefs.vresolution)
          notice_screen_contents_lost ();
          }
          #endif*/
         this.count_frame();

         if (this.framecnt == 0)
            this.init_drawing_frame();
      }
   };
	
	this.init_hardware_frame = function () {
      first_bpl_vpos = -1;
      next_lineno = 0;
      prev_lineno = -1;
      nextline_how = NLN_NORMAL;
      diwstate = DIW_WAITING_START;
      ddfstate = DIW_WAITING_START;
      first_planes_vpos = 0;
      last_planes_vpos = 0;
      diwfirstword_total = max_diwlastword();
      diwlastword_total = 0;
      ddffirstword_total = max_diwlastword();
      ddflastword_total = 0;
      plflastline_total = 0;
      plffirstline_total = this.current_maxvpos();
      autoscale_bordercolors = 0;
      for (var i = 0; i < MAX_SPRITES; i++)
         spr[i].ptxhpos = MAXHPOS;
   };

	this.init_hardware_for_drawing_frame = function () {
      if (prev_sprite_entries) {
         var first_pixel = prev_sprite_entries[0].first_pixel;
         var npixels = prev_sprite_entries[prev_next_sprite_entry].first_pixel - first_pixel;
         for (var i = 0; i < npixels; i++) spixels[first_pixel + i] = 0; //memset (spixels + first_pixel, 0, npixels * sizeof *spixels);
         for (var i = 0; i < npixels; i++) spixstate[first_pixel + i] = 0; //memset (spixstate.bytes + first_pixel, 0, npixels * sizeof *spixstate.bytes);
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

      curr_sprite_entries[0].first_pixel = current_change_set * MAX_SPR_PIXELS;
      next_sprite_forced = 1;
   };

	this.reset_decisions = function () {
      if (this.nodraw())
         return;

      plfleft_real = -1;
      toscr_nr_planes = toscr_nr_planes2 = 0;

      bpl1dat_written = false;
      bpl1dat_written_at_least_once = false;
      bpl1dat_early = false;

      thisline_decision.bplres = bplcon0_res;
      thisline_decision.nr_planes = 0;
      thisline_decision.plfleft = -1;
      thisline_decision.plflinelen = -1;
      thisline_decision.ham_seen = !!(bplcon0 & 0x800);
      thisline_decision.ehb_seen = !!is_ehb(bplcon0, bplcon2);
      thisline_decision.ham_at_start = !!(bplcon0 & 0x800);

      thisline_changed = 0;
      thisline_decision.diwfirstword = -1;
      thisline_decision.diwlastword = -1;
      if (hdiwstate == DIW_WAITING_STOP) {
         thisline_decision.diwfirstword = 0;
         if (SMART_UPDATE) {
            if (thisline_decision.diwfirstword != line_decisions[next_lineno].diwfirstword)
               thisline_changed = 1; //MARK_LINE_CHANGED;
         }
      }
      thisline_decision.ctable = -1;

      curr_drawinfo[next_lineno].first_color_change = next_color_change;
      curr_drawinfo[next_lineno].first_sprite_entry = next_sprite_entry;

      next_sprite_forced = 1;
      last_sprite_point = 0;
      fetch_state = FETCH_NOT_STARTED;
      bplcon1_hpos = -1;
      if (bpldmasetuphpos >= 0) {
         this.BPLCON0_Denise(0, bplcon0, true);
         this.setup_fmodes(0);
      }
      bpldmasetuphpos = -1;
      bpldmasetupphase = 0;
      ddfstrt_old_hpos = -1;

      if (plf_state > PLF_ACTIVE || (plf_state == PLF_ACTIVE && !(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)))
         plf_state = PLF_IDLE;

      /*memset (todisplay, 0, sizeof todisplay);
       memset (fetched, 0, sizeof fetched);
       memset (fetched_aga0, 0, sizeof fetched_aga0);
       memset (fetched_aga1, 0, sizeof fetched_aga1);
       memset (outword, 0, sizeof outword);*/
      for (var i = 0; i < MAX_PLANES; i++) {
         for (var j = 0; j < 4; j++)
            todisplay[i][j] = 0;

         fetched[i] = 0;
         /*#ifdef AGA
          if (AMIGA.config.chipset.mask & CSMASK_AGA) {
          fetched_aga0[i] = 0;
          fetched_aga1[i] = 0;
          }
          #endif*/
         outword[i] = 0;
      }

      last_decide_line_hpos = -1;
      last_ddf_pix_hpos = -1;
      last_sprite_hpos = -1;
      last_fetch_hpos = -1;

      thisline_decision.bplcon0 = bplcon0;
      thisline_decision.bplcon2 = bplcon2;
      thisline_decision.bplcon3 = bplcon3;
      /*#ifdef AGA
       thisline_decision.bplcon4 = bplcon4;
       #endif*/
   };

	this.record_diw_line = function (plfstrt, first, last) {
      if (last > max_diwstop)
         max_diwstop = last;
      if (first < min_diwstart) {
         min_diwstart = first;
         /*
          if (plfstrt * 2 > min_diwstart)
          min_diwstart = plfstrt * 2;
          */
      }
   };

	this.sprites_differ = function (dip, dip_old) {
      var this_first = curr_sprite_entries[dip.first_sprite_entry];
      var this_last = curr_sprite_entries[dip.last_sprite_entry];
      var prev_first = prev_sprite_entries[dip_old.first_sprite_entry];

      if (dip.nr_sprites != dip_old.nr_sprites)
         return 1;

      if (dip.nr_sprites == 0)
         return 0;

      /*for (var i = 0; i < dip.nr_sprites; i++) { //FIXME
       if (this_first[i].pos != prev_first[i].pos
       || this_first[i].max != prev_first[i].max
       || this_first[i].has_attached != prev_first[i].has_attached)
       return 1;
       }*/
      if (this_first.pos != prev_first.pos || this_first.max != prev_first.max || this_first.has_attached != prev_first.has_attached) //FIX
         return 1;

      var npixels = this_last.first_pixel + (this_last.max - this_last.pos) - this_first.first_pixel;

      //if (memcmp (spixels + this_first.first_pixel, spixels + prev_first.first_pixel, npixels * sizeof (uae_u16)) != 0) return 1;
      for (i = 0; i < npixels; i++) {
         if (spixels[this_first.first_pixel + i] != spixels[prev_first.first_pixel + i])
            return 1;
      }
      //if (memcmp (spixstate.bytes + this_first.first_pixel, spixstate.bytes + prev_first.first_pixel, npixels) != 0) return 1;
      for (i = 0; i < npixels; i++) {
         if (spixstate[this_first.first_pixel + i] != spixstate[prev_first.first_pixel + i])
            return 1;
      }
      return 0;
   };

	this.color_changes_differ = function (dip, dip_old) {
      if (dip.nr_color_changes != dip_old.nr_color_changes)
         return 1;
      if (dip.nr_color_changes == 0)
         return 0;
      //if (memcmp(curr_color_changes + dip.first_color_change, prev_color_changes + dip_old.first_color_change, dip.nr_color_changes * sizeof *curr_color_changes) != 0)
      for (i = 0; i < dip.nr_color_changes; i++) {
         if (curr_color_changes[dip.first_color_change + i].cmp(prev_color_changes[dip_old.first_color_change + i]) != 0)
            return 1;
      }
      return 0;
   };	

	this.finish_decisions = function () {
      var hpos = this.maxhpos;

      if (this.nodraw())
         return;

      this.decide_diw(hpos);
      this.decide_line(hpos);
      this.decide_fetch(hpos);

      this.record_color_change2(hsyncstartpos, 0xffff, 0);
      if (thisline_decision.plfleft >= 0 && thisline_decision.plflinelen < 0) {
         if (fetch_state != FETCH_NOT_STARTED) {
            BUG.info('finish_decisions() fetch_state=%d plfleft=%d,len=%d,vpos=%d,hpos=%d', fetch_state, thisline_decision.plfleft, thisline_decision.plflinelen, this.vpos, hpos);
            Fatal(333, 'finish_decisions() fetch_state != FETCH_NOT_STARTED');
         }
         thisline_decision.plfright = thisline_decision.plfleft;
         thisline_decision.plflinelen = 0;
         thisline_decision.bplres = RES_LORES;
      }
      if (hdiwstate == DIW_WAITING_STOP) {
         thisline_decision.diwlastword = max_diwlastword();
         if (thisline_decision.diwfirstword < 0)
            thisline_decision.diwfirstword = 0;
      }
      if (SMART_UPDATE) {
         if (thisline_decision.diwfirstword != line_decisions[next_lineno].diwfirstword)
            thisline_changed = 1; //MARK_LINE_CHANGED;
         if (thisline_decision.diwlastword != line_decisions[next_lineno].diwlastword)
            thisline_changed = 1; //MARK_LINE_CHANGED;
      }
      var dip = curr_drawinfo[next_lineno];
      var dip_old = prev_drawinfo[next_lineno];
      var dp = line_decisions[next_lineno];
      var changed = thisline_changed;
      if (thisline_decision.plfleft >= 0 && thisline_decision.nr_planes > 0)
         this.record_diw_line(thisline_decision.plfleft, diwfirstword, diwlastword);

      this.decide_sprites(hpos + 1);

      dip.last_sprite_entry = next_sprite_entry;
      dip.last_color_change = next_color_change;

      if (thisline_decision.ctable < 0)
         this.remember_ctable();

      dip.nr_color_changes = next_color_change - dip.first_color_change;
      dip.nr_sprites = next_sprite_entry - dip.first_sprite_entry;

      if (thisline_decision.plfleft != line_decisions[next_lineno].plfleft)
         changed = 1;
      if (!changed && this.color_changes_differ(dip, dip_old))
         changed = 1;
      if (!changed && /* bitplane visible in this line OR border sprites enabled */
         (thisline_decision.plfleft >= 0 || ((thisline_decision.bplcon0 & 1) && (thisline_decision.bplcon3 & 0x02) && !(thisline_decision.bplcon3 & 0x20)))
         && this.sprites_differ(dip, dip_old))
         changed = 1;

      if (changed) {
         thisline_changed = 1;
         dp.set(thisline_decision); //*dp = thisline_decision;
      } else
         line_decisions[next_lineno].ctable = thisline_decision.ctable;

      next_color_change += ((HBLANK_OFFSET + 1) >> 1);

      diw_hcounter += this.maxhpos * 2;
      if (!(AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) && this.vpos == this.get_equ_vblank_endline() - 1)
         diw_hcounter++;
      if ((AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) || this.vpos > this.get_equ_vblank_endline() || (AMIGA.config.chipset.agnus_dip && this.vpos == 0)) {
         diw_hcounter = this.maxhpos * 2;
         last_hdiw = 1; //2 - 1;
      }
      if (next_color_change >= MAX_REG_CHANGE - 30) {
         BUG.info('ColorChange buffer overflow!');
         next_color_change = 0;
         dip.nr_color_changes = 0;
         dip.first_color_change = 0;
         dip.last_color_change = 0;
      }
   };

	this.hsync_record_line_state = function (lineno, how, changed) {
      if (this.framecnt != 0)
         return;

      //changed += ((frame_redraw_necessary ? 1 : 0) + ((lineno >= lightpen_y1 && lineno <= lightpen_y2) ? 1 : 0));
      changed += (frame_redraw_necessary ? 1 : 0);

      switch (how) {
         case NLN_NORMAL:
            linestate[lineno] = changed ? LINE_DECIDED : LINE_DONE;
            break;
         case NLN_DOUBLED:
            linestate[lineno] = changed ? LINE_DECIDED_DOUBLE : LINE_DONE;
            changed += (linestate[lineno + 1] != LINE_REMEMBERED_AS_PREVIOUS ? 1 : 0);
            linestate[lineno + 1] = changed ? LINE_AS_PREVIOUS : LINE_DONE_AS_PREVIOUS;
            break;
         case NLN_NBLACK:
            linestate[lineno] = changed ? LINE_DECIDED : LINE_DONE;
            if (linestate[lineno + 1] != LINE_REMEMBERED_AS_BLACK)
               linestate[lineno + 1] = LINE_BLACK;
            break;
         case NLN_LOWER:
            if (linestate[lineno - 1] == LINE_UNDECIDED)
               linestate[lineno - 1] = LINE_DECIDED; //LINE_BLACK;
            linestate[lineno] = changed ? LINE_DECIDED : LINE_DONE;
            break;
         case NLN_UPPER:
            linestate[lineno] = changed ? LINE_DECIDED : LINE_DONE;
            if (linestate[lineno + 1] == LINE_UNDECIDED
               || linestate[lineno + 1] == LINE_REMEMBERED_AS_PREVIOUS
               || linestate[lineno + 1] == LINE_AS_PREVIOUS)
               linestate[lineno + 1] = LINE_DECIDED; //LINE_BLACK;
            break;
      }
   };	
	
	this.get_equ_vblank_endline = function () {
      return equ_vblank_endline + (equ_vblank_toggle ? (this.lof_current ? 1 : 0) : 0);
   };

	this.decide_diw = function (hpos) {
      var hdiw = hpos >= this.maxhpos ? this.maxhpos * 2 + 1 : hpos * 2 + 2;
      if (!(AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) && this.vpos <= this.get_equ_vblank_endline())
         hdiw = diw_hcounter;

      hdiw &= 511;
      for (; ;) {
         var lhdiw = hdiw;
         if (last_hdiw > lhdiw)
            lhdiw = 512;

         if (lhdiw >= diw_hstrt && last_hdiw < diw_hstrt && hdiwstate == DIW_WAITING_START) {
            if (thisline_decision.diwfirstword < 0)
               thisline_decision.diwfirstword = diwfirstword < 0 ? 0 : diwfirstword;
            hdiwstate = DIW_WAITING_STOP;
         }
         if (lhdiw >= diw_hstop && last_hdiw < diw_hstop && hdiwstate == DIW_WAITING_STOP) {
            if (thisline_decision.diwlastword < 0)
               thisline_decision.diwlastword = diwlastword < 0 ? 0 : diwlastword;
            hdiwstate = DIW_WAITING_START;
         }
         if (lhdiw != 512)
            break;
         last_hdiw = -1; //0 - 1;
      }
      last_hdiw = hdiw;
   };
	
	this.reset_bpl_vars = function (hpos) {
      out_nbits = 0;
      out_offs = 0;
      toscr_nbits = 0;
      thisline_decision.bplres = bplcon0_res;
   };

	this.start_bpl_dma = function (hpos, hstart) {
      if (first_bpl_vpos < 0)
         first_bpl_vpos = this.vpos;

      if (this.doflickerfix() && interlace_seen > 0) { //&& !scandoubled_line) {
         for (var i = 0; i < 8; i++) {
            prevbpl[this.lof_current][this.vpos][i] = bplptx[i];
            if (!this.lof_current && (bplcon0 & 4))
               bplpt[i] = prevbpl[1 - this.lof_current][this.vpos][i];
            if (!(bplcon0 & 4) || interlace_seen < 0)
               prevbpl[1 - this.lof_current][this.vpos][i] = prevbpl[this.lof_current][this.vpos][i] = 0;
         }
      }
      plfstrt_sprite = plfstrt;
      fetch_state = FETCH_STARTED;
      fetch_cycle = 0;

      ddfstate = DIW_WAITING_STOP;
      this.compute_toscr_delay(last_fetch_hpos, bplcon1);

      if (bpl1dat_written_at_least_once && hstart > last_fetch_hpos) {
         this.update_fetch_x(hstart, fetchmode);
         bpl1dat_written_at_least_once = false;
      } else
         this.reset_bpl_vars();
      /*#if 0
       if (!this.nodraw ()) {
       if (thisline_decision.plfleft >= 0) {
       out_nbits = (plfstrt - thisline_decision.plfleft) << (1 + toscr_res);
       out_offs = out_nbits >> 5;
       out_nbits &= 31;
       }
       this.update_toscr_planes();
       }
       #endif*/
      last_fetch_hpos = hstart;
      cycle_diagram_shift = hstart;
   };

	this.maybe_start_bpl_dma = function (hpos) {
      //console.log('maybe_start_bpl_dma', hpos);
      if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
         return;
      if (fetch_state != FETCH_NOT_STARTED)
         return;
      if (diwstate != DIW_WAITING_STOP)
         return;
      if (hpos <= plfstrt)
         return;
      if (hpos > plfstop - fetchunit)
         return;
      if (ddfstate != DIW_WAITING_START)
         plf_state = PLF_PASSED_STOP;

      this.start_bpl_dma(hpos, hpos);
   };

	this.decide_line = function (hpos) {
      if (this.vpos == plffirstline) {
         diwstate = DIW_WAITING_STOP;
         ddf_change = this.vpos;
      }
      if (this.vpos == plflastline) {
         diwstate = DIW_WAITING_START;
         ddf_change = this.vpos;
      }
      if (hpos <= last_decide_line_hpos)
         return;

      if (fetch_state == FETCH_NOT_STARTED && (diwstate == DIW_WAITING_STOP || (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))) {
         var ok = 0;
         if (last_decide_line_hpos < plfstrt_start && hpos >= plfstrt_start) {
            if (plf_state == PLF_IDLE)
               plf_state = PLF_START;
         }
         if (last_decide_line_hpos < plfstrt && hpos >= plfstrt) {
            if (plf_state == PLF_START)
               plf_state = PLF_ACTIVE;
            if (plf_state == PLF_ACTIVE)
               ok = 1;
            if (hpos - 2 == ddfstrt_old_hpos)
               ok = 0;
         }
         if (ok && diwstate == DIW_WAITING_STOP) {
            if (AMIGA.dmaen(DMAF_BPLEN)) {
               this.start_bpl_dma(hpos, plfstrt);
               this.estimate_last_fetch_cycle(plfstrt);
            }
            //last_decide_line_hpos = hpos;
            if (!CUSTOM_SIMPLE)
               this.do_sprites(hpos);

            return;
         }
      }
      if (!CUSTOM_SIMPLE) {
         if (hpos > last_sprite_hpos && last_sprite_hpos < SPR0_HPOS + 4 * MAX_SPRITES)
            this.do_sprites(hpos);
      }
      last_decide_line_hpos = hpos;
   };
	
	/*---------------------------------*/   
	/* to screen */
	
	this.toscr_2_ecs = function (nbits) {
      var mask = 0xffff >> (16 - nbits);
      var i;

      for (i = 0; i < toscr_nr_planes2; i += 2) {
         outword[i] <<= nbits;
         outword[i] |= (todisplay[i][0] >> (16 - nbits + toscr_delay1)) & mask;
         todisplay[i][0] <<= nbits;
      }
      for (i = 1; i < toscr_nr_planes2; i += 2) {
         outword[i] <<= nbits;
         outword[i] |= (todisplay[i][0] >> (16 - nbits + toscr_delay2)) & mask;
         todisplay[i][0] <<= nbits;
      }
   };	

	this.toscr_1 = function (nbits, fm) {
      switch (fm) {
         case 0:
            this.toscr_2_ecs(nbits);
            break;
         /*#ifdef AGA
          case 1:
          this.toscr_3_aga(nbits, 1);
          break;
          case 2:
          this.toscr_3_aga(nbits, 2);
          break;
          #endif*/
      }
      out_nbits += nbits;
      if (out_nbits == 32) {
         for (var i = 0; i < thisline_decision.nr_planes; i++) {
            if (line_data[next_lineno][i][out_offs] != outword[i]) {
               thisline_changed = 1;
               line_data[next_lineno][i][out_offs] = outword[i];
            }
            outword[i] = 0;
         }
         out_offs++;
         out_nbits = 0;
      }
   };

	this.toscr = function (nbits, fm) {
      if (nbits > 16) {
         this.toscr(16, fm);
         nbits -= 16;
      }
      var t = 32 - out_nbits;
      if (t < nbits) {
         this.toscr_1(t, fm);
         nbits -= t;
      }
      this.toscr_1(nbits, fm);
   };

	this.flush_plane_data = function (fm) {
      var i = 0;

      if (out_nbits <= 16) {
         i += 16;
         this.toscr_1(16, fm);
      }
      if (out_nbits != 0) {
         i += 32 - out_nbits;
         this.toscr_1(32 - out_nbits, fm);
      }
      i += 32;

      this.toscr_1(16, fm);
      this.toscr_1(16, fm);

      if (fm == 2) {
         // flush AGA full 64-bit shift register
         i += 32;
         this.toscr_1(16, fm);
         this.toscr_1(16, fm);
      }
      if (bpl1dat_early) {
         this.toscr_1(16, fm);
         this.toscr_1(16, fm);
      }
      return i >> (1 + toscr_res);
   };
	
	this.flush_display = function (fm) {
      if (toscr_nbits > 0 && thisline_decision.plfleft >= 0)
         this.toscr(toscr_nbits, fm);
      toscr_nbits = 0;
   };
	
	this.beginning_of_plane_block = function (hpos, fm) {
      var oleft = thisline_decision.plfleft;

      this.flush_display(fm);

      if (fm == 0)
         for (var i = 0; i < MAX_PLANES; i++) {
            todisplay[i][0] |= fetched[i];
         }
      /*#ifdef AGA
       else
       for (i = 0; i < MAX_PLANES; i++) {
       if (fm == 2)
       todisplay[i][1] = fetched_aga1[i];
       todisplay[i][0] = fetched_aga0[i];
       }
       #endif*/

      this.update_denise(hpos);
      this.maybe_first_bpl1dat(hpos);

      bplcon1t2 = bplcon1t;
      bplcon1t = bplcon1;
      if (bplcon1_hpos != hpos || oleft < 0)
         bplcon1t2 = bplcon1t;

      this.compute_toscr_delay(hpos, bplcon1t2);
   };	

	this.update_bpldats = function (hpos) {
      for (var i = 0; i < MAX_PLANES; i++) {
         /*#ifdef AGA
          fetched_aga0[i] = bplxdat[i];
          fetched_aga1[i] = 0;
          #endif*/
         fetched[i] = bplxdat[i];
      }
      this.beginning_of_plane_block(hpos, fetchmode);
   };	
	
	/*---------------------------------*/   
	/* fetch */
	
	this.finish_final_fetch = function (pos, fm) {
      if (thisline_decision.plfleft < 0 || plf_state == PLF_END)
         return;

      plf_state = PLF_END;
      ddfstate = DIW_WAITING_START;
      pos += this.flush_plane_data(fm);
      thisline_decision.plfright = pos;
      thisline_decision.plflinelen = out_offs;

      if (this.vpos >= minfirstline && (thisframe_first_drawn_line < 0 || this.vpos < thisframe_first_drawn_line))
         thisframe_first_drawn_line = this.vpos;
      thisframe_last_drawn_line = this.vpos;

      if (SMART_UPDATE) {
         if (line_decisions[next_lineno].plflinelen != thisline_decision.plflinelen
            || line_decisions[next_lineno].plfleft != thisline_decision.plfleft
            || line_decisions[next_lineno].bplcon0 != thisline_decision.bplcon0
            || line_decisions[next_lineno].bplcon2 != thisline_decision.bplcon2
            || line_decisions[next_lineno].bplcon3 != thisline_decision.bplcon3
         /*#ifdef AGA
          || line_decisions[next_lineno].bplcon4 != thisline_decision.bplcon4
          #endif*/
            ) thisline_changed = 1;
      } else
         thisline_changed = 1;
   };

	this.long_fetch_ecs = function (plane, nwords, weird_number_of_bits, dma) {
      //uae_u16 *real_pt = (uae_u16 *)pfield_xlateptr (bplpt[plane], nwords * 2);
      var real_pt = bplpt[plane];
      var delay = (plane & 1) ? toscr_delay2 : toscr_delay1;
      var tmp_nbits = out_nbits;
      var shiftbuffer = todisplay[plane][0];
      var outval = outword[plane];
      var fetchval = fetched[plane];
      //var *dataptr = (uae_u32 *)(line_data[next_lineno] + 2 * plane * MAX_WORDS_PER_LINE + 4 * out_offs);
      var dataptr = out_offs;

      if (dma) {
         bplpt[plane] += nwords * 2;
         bplptx[plane] += nwords * 2;
      }

      //if (real_pt == 0) /* @@@ Don't do this, fall back on chipmem_wget instead.  */
      //return;

      while (nwords > 0) {
         var bits_left = 32 - tmp_nbits;
         var t;

         shiftbuffer |= fetchval;

         t = (shiftbuffer >>> delay) & 0xFFFF;

         if (weird_number_of_bits && bits_left < 16) {
            //outval <<= bits_left;
            //outval |= t >>> (16 - bits_left);
            outval = ((outval << bits_left) | (t >>> (16 - bits_left))) >>> 0;
            //thisline_changed |= *dataptr ^ outval; *dataptr++ = outval;
            thisline_changed |= line_data[next_lineno][plane][dataptr] ^ outval;
            line_data[next_lineno][plane][dataptr++] = outval;
            outval = t;
            tmp_nbits = 16 - bits_left;
            //shiftbuffer <<= 16;
            shiftbuffer = (shiftbuffer << 16) >>> 0;
         } else {
            outval = ((outval << 16) | t) >>> 0;
            shiftbuffer = (shiftbuffer << 16) >>> 0;
            tmp_nbits += 16;
            if (tmp_nbits == 32) {
               //thisline_changed |= *dataptr ^ outval; *dataptr++ = outval;
               thisline_changed |= line_data[next_lineno][plane][dataptr] ^ outval;
               line_data[next_lineno][plane][dataptr++] = outval;
               tmp_nbits = 0;
            }
         }
         nwords--;
         if (dma) {
            //fetchval = do_get_mem_word (real_pt); real_pt++;
            //fetchval = AMIGA.mem.load16_chip(real_pt); real_pt += 2;
            fetchval = AMIGA.custom.last_value = AMIGA.mem.chip.data[real_pt >>> 1];
            real_pt += 2;
         }
      }
      fetched[plane] = fetchval;
      todisplay[plane][0] = shiftbuffer;
      outword[plane] = outval;
   };	

	this.do_long_fetch = function (hpos, nwords, dma, fm) {
      var i;

      this.flush_display(fm);
      switch (fm) {
         case 0:
            if (out_nbits & 15) {
               for (i = 0; i < toscr_nr_planes; i++)
                  this.long_fetch_ecs(i, nwords, 1, dma);
            } else {
               for (i = 0; i < toscr_nr_planes; i++)
                  this.long_fetch_ecs(i, nwords, 0, dma);
            }
            break;
         /*#ifdef AGA
          case 1:
          if (out_nbits & 15) {
          for (i = 0; i < toscr_nr_planes; i++)
          this.long_fetch_aga(i, nwords, 1, 1, dma);
          } else {
          for (i = 0; i < toscr_nr_planes; i++)
          this.long_fetch_aga(i, nwords, 0, 1, dma);
          }
          break;
          case 2:
          if (out_nbits & 15) {
          for (i = 0; i < toscr_nr_planes; i++)
          this.long_fetch_aga(i, nwords, 1, 2, dma);
          } else {
          for (i = 0; i < toscr_nr_planes; i++)
          this.long_fetch_aga(i, nwords, 0, 2, dma);
          }
          break;
          #endif*/
      }
      out_nbits += nwords * 16;
      out_offs += out_nbits >> 5;
      out_nbits &= 31;

      if (dma && toscr_nr_planes > 0)
         fetch_state = FETCH_WAS_PLANE0;
   };

	this.add_modulos = function () {
      var m1, m2;

      if (fmode & 0x4000) {
         if (((diwstrt >> 8) ^ this.vpos) & 1)
            m1 = m2 = bpl2mod;
         else
            m1 = m2 = bpl1mod;
      } else {
         m1 = bpl1mod;
         m2 = bpl2mod;
      }

      switch (bplcon0_planes_limit) {
         /*#ifdef AGA
          case 8: bplpt[7] += m2; bplptx[7] += m2;
          case 7: bplpt[6] += m1; bplptx[6] += m1;
          #endif*/
         case 6:
            bplpt[5] += m2;
            bplptx[5] += m2;
         case 5:
            bplpt[4] += m1;
            bplptx[4] += m1;
         case 4:
            bplpt[3] += m2;
            bplptx[3] += m2;
         case 3:
            bplpt[2] += m1;
            bplptx[2] += m1;
         case 2:
            bplpt[1] += m2;
            bplptx[1] += m2;
         case 1:
            bplpt[0] += m1;
            bplptx[0] += m1;
      }
   };	
	
	this.fetch = function (nr, fm, hpos) {
      if (nr < bplcon0_planes_limit) {
         var p = bplpt[nr];
         bplpt[nr] += (2 << fm);
         bplptx[nr] += (2 << fm);
         if (nr == 0)
            bpl1dat_written = true;

         switch (fm) {
            case 0:
               //fetched[nr] = bplxdat[nr] = last_custom_value1 = chipmem_wget_indirect (p);
               //fetched[nr] = bplxdat[nr] = AMIGA.mem.load16_chip(p);
               fetched[nr] = bplxdat[nr] = AMIGA.custom.last_value = AMIGA.mem.chip.data[p >>> 1];
               break;
            /*#ifdef AGA
             case 1:
             fetched_aga0[nr] = chipmem_lget_indirect (p);
             last_custom_value1 = (uae_u16)fetched_aga0[nr];
             break;
             case 2:
             fetched_aga1[nr] = chipmem_lget_indirect (p);
             fetched_aga0[nr] = chipmem_lget_indirect (p + 4);
             last_custom_value1 = (uae_u16)fetched_aga0[nr];
             break;
             #endif*/
         }
         if (plf_state == PLF_PASSED_STOP2 && fetch_cycle >= (fetch_cycle & ~fetchunit_mask) + fetch_modulo_cycle) {
            var mod;
            if (fmode & 0x4000) {
               if (((diwstrt >> 8) ^ this.vpos) & 1)
                  mod = bpl2mod;
               else
                  mod = bpl1mod;
            } else if (nr & 1)
               mod = bpl2mod;
            else
               mod = bpl1mod;

            bplpt[nr] += mod;
            bplptx[nr] += mod;
         }
      } else {
         if (nr < MAX_PLANES) //FIX for illegal memory access if not #ifdef AGA
            fetched[nr] = bplxdat[nr];
      }
   };

	this.one_fetch_cycle = function (pos, ddfstop_to_test, dma, fm) {
      if (plf_state < PLF_PASSED_STOP && pos == ddfstop_to_test)
         plf_state = PLF_PASSED_STOP;

      if ((fetch_cycle & fetchunit_mask) == 0) {
         if (plf_state == PLF_PASSED_STOP2) {
            this.finish_final_fetch(pos, fm);
            return 1;
         }
         if (plf_state == PLF_PASSED_STOP)
            plf_state = PLF_PASSED_STOP2;
         else if (plf_state == PLF_PASSED_STOP2)
            plf_state = PLF_END;
      }
      this.maybe_check(pos);

      if (dma) {
         var cycle_start = fetch_cycle & fetchstart_mask;
         switch (fm_maxplane) {
            case 8:
               switch (cycle_start) {
                  case 0:
                     this.fetch(7, fm, pos);
                     break;
                  case 1:
                     this.fetch(3, fm, pos);
                     break;
                  case 2:
                     this.fetch(5, fm, pos);
                     break;
                  case 3:
                     this.fetch(1, fm, pos);
                     break;
                  case 4:
                     this.fetch(6, fm, pos);
                     break;
                  case 5:
                     this.fetch(2, fm, pos);
                     break;
                  case 6:
                     this.fetch(4, fm, pos);
                     break;
                  case 7:
                     this.fetch(0, fm, pos);
                     break;
               }
               break;
            case 4:
               switch (cycle_start) {
                  case 0:
                     this.fetch(3, fm, pos);
                     break;
                  case 1:
                     this.fetch(1, fm, pos);
                     break;
                  case 2:
                     this.fetch(2, fm, pos);
                     break;
                  case 3:
                     this.fetch(0, fm, pos);
                     break;
               }
               break;
            case 2:
               switch (cycle_start) {
                  case 0:
                     this.fetch(1, fm, pos);
                     break;
                  case 1:
                     this.fetch(0, fm, pos);
                     break;
               }
               break;
         }
      }
      if (bpl1dat_written) {
         fetch_state = FETCH_WAS_PLANE0;
         bpl1dat_written = false;
      }

      fetch_cycle++;
      toscr_nbits += (2 << toscr_res);

      if (toscr_nbits > 16) {
         Fatal(333, sprintf('one_fetch_cycle() toscr_nbits > 16 (%d)', toscr_nbits));
         toscr_nbits = 0;
      }
      if (toscr_nbits == 16)
         this.flush_display(fm);

      return 0;
   };
	
	this.update_fetch = function (until, fm) {
      var dma = AMIGA.dmaen(DMAF_BPLEN);

      if (this.nodraw() || plf_state == PLF_END)
         return;

      var ddfstop_to_test = HARD_DDF_STOP;
      if (ddfstop >= last_fetch_hpos && plfstop < ddfstop_to_test)
         ddfstop_to_test = plfstop;

      this.update_toscr_planes();

      var pos = last_fetch_hpos;
      cycle_diagram_shift = last_fetch_hpos - fetch_cycle;

      for (; ; pos++) {
         if (pos == until) {
            if (until >= this.maxhpos) {
               this.finish_final_fetch(pos, fm);
               return;
            }
            this.flush_display(fm);
            return;
         }
         if (fetch_state == FETCH_WAS_PLANE0)
            break;

         fetch_state = FETCH_STARTED;
         if (this.one_fetch_cycle(pos, ddfstop_to_test, dma, fm))
            return;
      }

      // Unrolled version of the for loop below.
      if (1
         && plf_state < PLF_PASSED_STOP && ddf_change != this.vpos && ddf_change + 1 != this.vpos
         && dma
         && (fetch_cycle & fetchstart_mask) == (fm_maxplane & fetchstart_mask)
         && !badmode
         //&& (out_nbits & 15) == 0
         && toscr_nr_planes == thisline_decision.nr_planes) {
         var offs = (pos - fetch_cycle) & fetchunit_mask;
         var ddf2 = ((ddfstop_to_test - offs + fetchunit - 1) & ~fetchunit_mask) + offs;
         var ddf3 = ddf2 + fetchunit;
         var stop = until < ddf2 ? until : until < ddf3 ? ddf2 : ddf3;
         var count = stop - pos;

         if (count >= fetchstart) {
            count &= ~fetchstart_mask;

            if (thisline_decision.plfleft < 0) {
               this.compute_delay_offset();
               this.compute_toscr_delay_1(bplcon1);
            }

            this.do_long_fetch(pos, count >> (3 - toscr_res), dma, fm);

            this.maybe_first_bpl1dat(pos);

            if (pos <= ddfstop_to_test && pos + count > ddfstop_to_test)
               plf_state = PLF_PASSED_STOP;
            if (pos <= ddfstop_to_test && pos + count > ddf2)
               plf_state = PLF_PASSED_STOP2;
            if (pos <= ddf2 && pos + count >= ddf2 + fm_maxplane)
               this.add_modulos();
            pos += count;
            fetch_cycle += count;
         }
      }

      for (; pos < until; pos++) {
         if (fetch_state == FETCH_WAS_PLANE0) {
            this.beginning_of_plane_block(pos, fm);
            this.estimate_last_fetch_cycle(pos);
         }
         fetch_state = FETCH_STARTED;
         if (this.one_fetch_cycle(pos, ddfstop_to_test, dma, fm))
            return;
      }
      if (until >= this.maxhpos) {
         this.finish_final_fetch(pos, fm);
         return;
      }
      this.flush_display(fm);
   };	
	
	this.update_fetch_x = function (until, fm) {
      if (this.nodraw())
         return;

      var pos = last_fetch_hpos;
      this.update_toscr_planes();

      for (; pos < until; pos++) {
         toscr_nbits += (2 << toscr_res);
         if (toscr_nbits > 16) {
            Fatal(333, sprintf('update_fetch_x() xtoscr_nbits > 16 (%d)', toscr_nbits));
            toscr_nbits = 0;
         }
         if (toscr_nbits == 16)
            this.flush_display(fm);
      }
      if (until >= this.maxhpos) {
         this.finish_final_fetch(pos, fm);
         return;
      }
      this.flush_display(fm);
   };
		
	this.decide_fetch = function (hpos) {
      if (hpos > last_fetch_hpos) {
         if (fetch_state != FETCH_NOT_STARTED) {
            this.update_fetch(hpos, fetchmode);
            //cycle_diagram_shift = hpos - fetch_cycle;
         } else if (bpl1dat_written_at_least_once) {
            this.update_fetch_x(hpos, fetchmode);
            bpl1dat_written = false;
         }
         this.maybe_check(hpos);
         last_fetch_hpos = hpos;
      }
   };
	
	/*this.decide_fetch_ce = function (hpos) {
      if ((ddf_change == this.vpos || ddf_change + 1 == this.vpos) && this.vpos < this.current_maxvpos())
         this.decide_fetch(hpos);
   };*/
	
	this.estimate_last_fetch_cycle = function (hpos) {
      var fetchunit = fetchunits[fetchmode * 4 + bplcon0_res];

      if (plf_state < PLF_PASSED_STOP) {
         var stop = plfstop < hpos || plfstop > HARD_DDF_STOP ? HARD_DDF_STOP : plfstop;
         var fetch_cycle_at_stop = fetch_cycle + (stop - hpos);
         var starting_last_block_at = (fetch_cycle_at_stop + fetchunit - 1) & ~(fetchunit - 1);

         estimated_last_fetch_cycle = hpos + (starting_last_block_at - fetch_cycle) + fetchunit;
      } else {
         var starting_last_block_at = (fetch_cycle + fetchunit - 1) & ~(fetchunit - 1);
         if (plf_state == PLF_PASSED_STOP2)
            starting_last_block_at -= fetchunit;

         estimated_last_fetch_cycle = hpos + (starting_last_block_at - fetch_cycle) + fetchunit;
      }
   };
	
	/*---------------------------------*/   
	
	this.vsync_handler_post = function () {
      if (bplcon0 & 4)
         this.lof_store = this.lof_store ? 0 : 1;
      this.lof_current = this.lof_store;
      if (lof_togglecnt_lace >= LOF_TOGGLES_NEEDED) {
         interlace_changed = this.notice_interlace_seen(true);
         if (interlace_changed)
            this.notice_screen_contents_lost();
      } else if (lof_togglecnt_nlace >= LOF_TOGGLES_NEEDED) {
         interlace_changed = this.notice_interlace_seen(false);
         if (interlace_changed)
            this.notice_screen_contents_lost();
      }
      if (this.lof_changing) {
         // still same? Trigger change now.
         if ((!this.lof_store && this.lof_changing < 0) || (this.lof_store && this.lof_changing > 0)) {
            this.lof_changed = 1;
         }
         this.lof_changing = 0;
      }

      /*#ifdef PICASSO96
       if (p96refresh_active) {
       vpos_count = p96refresh_active;
       vtotal = vpos_count;
       }
       #endif*/

      if ((beamcon0 & (0x20 | 0x80)) != (new_beamcon0 & (0x20 | 0x80)) || (this.vpos_count > 0 && Math.abs(this.vpos_count - this.vpos_count_diff) > 1) || this.lof_changed)
         this.init_hz(false);
      else if (interlace_changed)
         this.compute_framesync();

      this.lof_changed = 0;

      AMIGA.copper.COPJMP(1, 1);

      this.init_hardware_frame();
   };	
	
	this.hsync_scandoubler = function () {
      console.log('hsync_scandoubler');
      var bpltmp = [0, 0, 0, 0, 0, 0, 0, 0], bpltmpx = [0, 0, 0, 0, 0, 0, 0, 0];

      next_lineno++;
      //scandoubled_line = 1;

      for (var i = 0; i < 8; i++) {
         bpltmp[i] = bplpt[i];
         bpltmpx[i] = bplptx[i];
         if (prevbpl[this.lof_store][this.vpos][i] && prevbpl[1 - this.lof_store][this.vpos][i]) {
            var diff = prevbpl[this.lof_store][this.vpos][i] - prevbpl[1 - this.lof_store][this.vpos][i];
            if (this.lof_store) {
               if (bplcon0 & 4)
                  bplpt[i] = prevbpl[this.lof_store][this.vpos][i] - diff;
            } else {
               if (bplcon0 & 4)
                  bplpt[i] = prevbpl[this.lof_store][this.vpos][i];
               else
                  bplpt[i] = bplpt[i] - diff;

            }
         }
      }

      this.reset_decisions();
      plf_state = PLF_IDLE;

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
            curr_color_changes[idx].linepos = hpos + this.maxhpos + 1;
            curr_color_changes[idx].regno = regno;
            curr_color_changes[idx].value = cs2.value;
            curr_color_changes[idx + 1].regno = -1;
         } else {
            var cs1 = curr_color_changes[next_color_change];
            cs1.set(cs2); //memcpy (cs1, cs2, sizeof (struct ColorChange));
            next_color_change++;
         }
      }

      curr_color_changes[next_color_change].regno = -1;

      this.finish_decisions();
      this.hsync_record_line_state(next_lineno, NLN_NORMAL, thisline_changed);
      this.hardware_line_completed(next_lineno);
      //scandoubled_line = 0;

      for (var i = 0; i < 8; i++) {
         bplpt[i] = bpltmp[i];
         bplptx[i] = bpltmpx[i];
      }
   };
	
	this.hsync_handler_pre = function () {
      this.finish_decisions();
      if (thisline_decision.plfleft >= 0) {
         if (AMIGA.config.chipset.collision_level > 1)
            this.do_sprite_collisions();
         if (AMIGA.config.chipset.collision_level > 2)
            this.do_playfield_collisions();
      }
      this.hsync_record_line_state(next_lineno, nextline_how, thisline_changed);
      if (this.vpos == sprite_vblank_endline) {
         //lightpen_triggered = 0;
         sprite_0 = 0;
      }
      /*if (lightpen_cx > 0 && (bplcon0 & 8) && !lightpen_triggered && lightpen_cy == this.vpos) {
       vpos_lpen = this.vpos;
       hpos_lpen = lightpen_cx;
       lightpen_triggered = 1;
       }*/
      this.hardware_line_completed(next_lineno);
      if (this.doflickerfix() && interlace_seen > 0)
         this.hsync_scandoubler();
   };     
		
	this.hsync_handler_pre_next_vpos = function (onvsync) {
      if (this.is_linetoggle())
         this.lol ^= 1;
      else
         this.lol = 0;

      this.vpos++;
      this.vpos_count++;
      if (this.vpos >= this.maxvpos_total)
         this.vpos = 0;
      if (onvsync) {
         this.vpos = 0;
         //vsync_counter++;
      }
      this.maxhpos = this.maxhpos_short + this.lol;
   };
		
	this.hsync_handler_post = function () {
      if (this.vpos == equ_vblank_endline + 1) {
         //if (this.lof_current != this.lof_store) {}
         if (this.lof_store != this.lof_previous) {
            if (lof_togglecnt_lace < LOF_TOGGLES_NEEDED)
               lof_togglecnt_lace++;
            if (lof_togglecnt_lace >= LOF_TOGGLES_NEEDED)
               lof_togglecnt_nlace = 0;
         } else {
            if (lof_togglecnt_nlace < LOF_TOGGLES_NEEDED)
               lof_togglecnt_nlace++;
            if (lof_togglecnt_nlace >= LOF_TOGGLES_NEEDED)
               lof_togglecnt_lace = 0;
         }
         this.lof_previous = this.lof_store;
      }
   };
			
	this.hsync_handler_post_nextline_how = function () {
      var lineno = this.vpos;
      if (lineno >= MAXVPOS)
         lineno %= MAXVPOS;
      nextline_how = NLN_NORMAL;
      if (this.doflickerfix() && interlace_seen > 0)
         lineno *= 2;
      else if (AMIGA.config.video.vresolution && (doublescan <= 0 || interlace_seen > 0)) {
         lineno *= 2;
         nextline_how = AMIGA.config.video.vresolution > VRES_NONDOUBLE && AMIGA.config.video.scanlines == false ? NLN_DOUBLED : NLN_NBLACK;
         if (interlace_seen) {
            if (!this.lof_current) {
               lineno++;
               nextline_how = NLN_LOWER;
            } else {
               nextline_how = NLN_UPPER;
            }
         }
      }
      prev_lineno = next_lineno;
      next_lineno = lineno;
      this.reset_decisions();

      plfstrt_sprite = plfstrt;
   };
	
	this.hsync_handler_post_diw_change = function () {
      if (GET_PLANES(bplcon0) > 0 && AMIGA.dmaen(DMAF_BPLEN)) {
         if (this.vpos > last_planes_vpos)
            last_planes_vpos = this.vpos;
         if (this.vpos >= minfirstline && first_planes_vpos == 0)
            first_planes_vpos = this.vpos > minfirstline ? this.vpos - 1 : this.vpos;
         else if (this.vpos >= this.current_maxvpos() - 1)
            last_planes_vpos = this.current_maxvpos();
      }
      if (diw_change == 0) {
         if (this.vpos >= first_planes_vpos && this.vpos <= last_planes_vpos) {
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
         if ((plffirstline < plffirstline_total || (plffirstline_total == minfirstline && this.vpos > minfirstline)) && plffirstline < (this.vpos >> 1)) {
            firstword_bplcon1 = bplcon1;
            if (plffirstline < minfirstline)
               plffirstline_total = minfirstline;
            else
               plffirstline_total = plffirstline;
         }
         if (plflastline > plflastline_total && plflastline > plffirstline_total && plflastline > (this.maxvpos >> 1))
            plflastline_total = plflastline;
      }
      if (diw_change > 0)
         diw_change--;
   };	
	
	/*---------------------------------*/   

	this.getDiwstate = function () {
      return diwstate;
   };
	
	this.getData = function () {
      return [
         thisline_decision.plfleft,
         thisline_decision.plfright - (16 << fetchmode),
         cycle_diagram_total_cycles[fetchmode][GET_RES_AGNUS(bplcon0)][GET_PLANES_LIMIT(bplcon0)],
         cycle_diagram_free_cycles[fetchmode][GET_RES_AGNUS(bplcon0)][GET_PLANES_LIMIT(bplcon0)]
      ];
   };
	
	/*---------------------------------*/   

	this.setup = function () {
      if (cycle_diagram_table === null)
         create_cycle_diagram_table();

      if (AMIGA.video.available == 1)
         alloc_colors64k(4, 4, 4, 8, 4, 0, 0, 0, 0, 0);
      else
         alloc_colors64k(5, 6, 5, 11, 5, 0, 0, 0, 0, 0);

      notice_new_xcolors();

      this.setup_drawing();
      this.setup_sprites();
   };

	this.cleanup = function () {
      this.cleanup_sprites();
      this.cleanup_drawing();
   };

	this.reset = function() {
		/*lightpen_active = -1;
		lightpen_triggered = 0;
		lightpen_cx = lightpen_cy = -1;*/

		update_mirrors();
		
		if (!aga_mode) {
			for (i = 0; i < 32; i++) {
				current_colors.color_regs_ecs[i] = 0;
				current_colors.acolors[i] = getxcolor(0);
			}
/*#ifdef AGA
		} else {
			for (i = 0; i < 256; i++) {
				current_colors.color_regs_aga[i] = 0;
				current_colors.acolors[i] = getxcolor(0);
			}
#endif*/
		}

		clxdat = 0;

		/* Clear the armed flags of all sprites.  */
		for (var i = 0; i < MAX_SPRITES; i++) spr[i].clr();
		nr_armed = 0;

		bplcon0 = 0;
		bplcon3 = 0x0C00;
		bplcon4 = 0x0011; // Get AGA chipset into ECS compatibility mode

		diwhigh = 0;
		diwhigh_written = false;
		hdiwstate = DIW_WAITING_START; // this does not reset at vblank

		this.FMODE(0, 0);
		this.CLXCON(0);
		this.CLXCON2(0);
		this.setup_fmodes(0);
		//sprite_width = GET_SPRITEWIDTH(fmode);
		beamcon0 = new_beamcon0 = AMIGA.config.video.ntsc ? 0x00 : 0x20;
		this.lof_store = this.lof_current = 1;

		this.vpos = 0;
		this.vpos_count = this.vpos_count_diff = 0;

		//timehack_alive = 0;

		curr_sprite_entries = null;
		prev_sprite_entries = null;
		sprite_entries[0][0].first_pixel = 0;
		sprite_entries[1][0].first_pixel = MAX_SPR_PIXELS;
		sprite_entries[0][1].first_pixel = 0;
		sprite_entries[1][1].first_pixel = MAX_SPR_PIXELS;
		for (var i = 0; i < spixels.length; i++) spixels[i] = 0; //memset (spixels, 0, 2 * MAX_SPR_PIXELS * sizeof *spixels);
		for (var i = 0; i < spixstate.length; i++) spixstate[i] = 0; //memset (&spixstate, 0, sizeof spixstate);
		
		diwstate = DIW_WAITING_START;

		this.init_hz(true);
		//vpos_lpen = -1;
		this.lof_changing = 0;
		this.lof_previous = this.lof_store;
		lof_togglecnt_nlace = lof_togglecnt_lace = 0;
		nlace_cnt = NLACE_CNT_NEEDED;

		this.reset_sprites();
		this.init_hardware_frame();
		this.reset_drawing();
		this.reset_decisions();

		sprres = expand_sprres(bplcon0, bplcon3);
		sprite_width = GET_SPRITEWIDTH(fmode);
		this.setup_fmodes(0);

/*#ifdef PICASSO96
		picasso_reset();
#endif*/
	}	
}
