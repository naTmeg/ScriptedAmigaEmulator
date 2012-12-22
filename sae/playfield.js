/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/

function Sprite(num) {
	this.num = num;
	this.pt = 0;
	this.pos = 0;
	this.ctl = 0;
	this.data = 0;
	this.datb = 0;

	this.xpos = 0;
	this.vstart = 0;
	this.vstop = 0;
	this.armed = false;
	this.dmastate = 0;
	this.dmacycle = 0;
}

function Sprites() {
	const MAX_SPRITES = 8;

	this.sprite = new Array(MAX_SPRITES);
	for (var i = 0; i < MAX_SPRITES; i++)
	this.sprite[i] = new Sprite(i);

	var spr_data = [];
	var spr_state = [];
	var spr_attach = [];

	var dblpf_ms = null;
	var dblpf_ms1 = null;
	var dblpf_ms2 = null;
	var sprite_offs = null;

	var sprtabb = null;
	var sprtaba = null;
	var sprite_ab_merge = null;
	var sprclx = null;
	var clxmask = null;

	this.nr_armed = 0;
	var sprite_vblank_endline = 0;
	var sprite_mask = 0;
	//var sprite_minx, sprite_maxx; 

	this.clxdat = 0;
	this.clxcon = 0;
	var clxcon_bpl_enable = 0;
	var clxcon_bpl_match = 0;

	this.init_sprite_tables = function() {
		//spr_data = new Array(800);
		//spr_state = new Array(800);
		//spr_attach = new Array(800);

		dblpf_ms = new Array(256);
		dblpf_ms1 = new Array(256);
		dblpf_ms2 = new Array(256);
		sprite_offs = new Array(256);

		sprtaba = new Array(256);
		sprtabb = new Array(256);
		sprite_ab_merge = new Array(256);

		for (var i = 0; i < 256; i++) {
			var plane1 = ((i >> 0) & 1) | ((i >> 1) & 2) | ((i >> 2) & 4) | ((i >> 3) & 8);
			var plane2 = ((i >> 1) & 1) | ((i >> 2) & 2) | ((i >> 3) & 4) | ((i >> 4) & 8);

			dblpf_ms[i] = i == 0 ? 16 : 8;
			dblpf_ms1[i] = plane1 == 0 ? (plane2 == 0 ? 16 : 8) : 0;
			dblpf_ms2[i] = plane2 == 0 ? (plane1 == 0 ? 16 : 0) : 8;

			sprite_offs[i] = (i & 15) ? 0 : 2;

			sprtaba[i] = ((((i >> 7) & 1) << 0) | (((i >> 6) & 1) << 2) | (((i >> 5) & 1) << 4) | (((i >> 4) & 1) << 6) | (((i >> 3) & 1) << 8) | (((i >> 2) & 1) << 10) | (((i >> 1) & 1) << 12) | (((i >> 0) & 1) << 14));
			sprtabb[i] = sprtaba[i] << 1;
			sprite_ab_merge[i] = (((i & 15) ? 1 : 0) | ((i & 240) ? 2 : 0));
		}

		sprclx = new Array(16);
		clxmask = new Array(16);

		for (var i = 0; i < 16; i++) {
			clxmask[i] = (((i & 1) ? 0xF : 0x3) | ((i & 2) ? 0xF0 : 0x30) | ((i & 4) ? 0xF00 : 0x300) | ((i & 8) ? 0xF000 : 0x3000));
			sprclx[i] = (((i & 0x3) == 0x3 ? 1 : 0) | ((i & 0x5) == 0x5 ? 2 : 0) | ((i & 0x9) == 0x9 ? 4 : 0) | ((i & 0x6) == 0x6 ? 8 : 0) | ((i & 0xA) == 0xA ? 16 : 0) | ((i & 0xC) == 0xC ? 32 : 0)) << 9;
		}
	}

	this.setup = function() {
		sprite_vblank_endline = AMIGA.config.video.ntsc ? 20 : 25;

		if (dblpf_ms == null) this.init_sprite_tables();
	}

	this.cleanup = function() {}
	this.reset = function() {}

	this.clear = function() {
		spr_data = [];
		spr_state = [];
		spr_attach = [];
	}

	this.setMask = function (pf1p, pf2p) {
		sprite_mask = 0xFFFF0000 << (4 * pf2p);
		sprite_mask &= 0xFFFFFFFF;
		sprite_mask |= (0x0000FFFF << (4 * pf1p)) & 0xFFFF;
		sprite_mask &= 0xFFFFFFFF;
	}

	this.render = function (pos, apixel) {
		if (!spr_data[pos]) return 0;

		var maskshift = AMIGA.playfield.state.dpf ? (AMIGA.playfield.state.pf2pri ? dblpf_ms2[apixel] : dblpf_ms1[apixel]) : dblpf_ms[apixel];
		var plfmask = (sprite_mask >>> maskshift) >>> maskshift;
		var v = spr_data[pos] & ~plfmask;

		if (v != 0) {
			var v1 = v & 255;
			var offs;
			var col;

			if (v1 == 0) offs = sprite_offs[v >> 8] + 4;
			else offs = sprite_offs[v1];

			v = (v >> (offs << 1)) & 15;
			//v ^= 8; /* debug */

			if (spr_attach[pos] && (spr_state[pos] & (3 << offs))) {
				col = 16 + v;
			} else {
				var vlo = v & 3;
				var vhi = (v & (vlo - 1)) >> 2;
				col = 16 + (vlo | vhi) + offs * 2;
			}
			return col;
		}
		return 0;
	}

	this.spr_plf_collision = function() {
		if (clxcon_bpl_enable == 0) {
			this.clxdat |= 0x1fe;
			return;
		}
		var collision_mask = clxmask[this.clxcon >> 12];

		for (var i = 0; i < MAX_SPRITES; i++) {
			var sprxp = (this.sprite[i].xpos - AMIGA.playfield.state.hstart + 1) * (AMIGA.playfield.state.hires ? 2 : 1);

			if (!this.sprite[i].armed || sprxp < 0) continue;

			var minpos = sprxp;
			var maxpos = sprxp + 16;

			for (var j = minpos; j < maxpos; j++) {
				var sprpix = spr_data[j] & collision_mask;
				var match = 1;

				if (sprpix == 0) continue;

				sprpix = sprite_ab_merge[sprpix & 255] | (sprite_ab_merge[sprpix >> 8] << 2);
				sprpix <<= 1;

				for (var k = 1; k >= 0; k--) {
					if (AMIGA.playfield.bplcon0 & 0x400) match = 1;

					for (var l = k; match && l < 6; l += 2) {
						if (clxcon_bpl_enable & (1 << l)) {
							var t = 0;
							if (l < AMIGA.playfield.state.planes) {
								t = (AMIGA.playfield.linedata[j] >> l) & 1;
							}
							if (t != ((clxcon_bpl_match >> l) & 1)) match = 0;
						}
					}
					if (match) {
						this.clxdat |= sprpix << (k * 4);
					}
				}
			}
		}
	}

	this.draw_1 = function (sprxp, bufpos, datab, num, dbl, mask, do_collisions, collision_mask) {
		var j = 0;
		while (datab) {
			var col = 0;
			var coltmp = 0;

			//if ((sprxp >= this.sprite_minx && sprxp < this.sprite_maxx) || (AMIGA.playfield.bplcon3 & 2))
				col = (datab & 3) << (2 * num);
			/*if (0) {
				if (sprxp == this.sprite_minx || sprxp == this.sprite_maxx - 1)
					col ^= (rand () << 16) | rand ();
			}*/
			//if ((j & mask) == 0)
			{
				var tmp = spr_data[bufpos] | col;
				spr_data[bufpos++] = tmp;
				if (do_collisions) coltmp |= tmp;
				//sprxp++;
			}
			if (dbl > 0) {
				var tmp = spr_data[bufpos] | col;
				spr_data[bufpos++] = tmp;
				if (do_collisions) coltmp |= tmp;
				//sprxp++;
			}
			j++;
			datab >>>= 2;
			if (do_collisions) {
				coltmp &= collision_mask;
				if (coltmp) {
					var shrunk_tmp = sprite_ab_merge[coltmp & 255] | (sprite_ab_merge[coltmp >> 8] << 2);
					this.clxdat |= sprclx[shrunk_tmp];
				}
			}
		}
	}

	this.draw = function() {
		//if (this.nr_armed == 0) return;

		var nrs = [], posns = [];
		var count = 0;
		var xoffs = (180 - (AMIGA.playfield.state.hlen >> 1)) << (AMIGA.playfield.state.hires ? 1 : 0);

		for (var i = 0; i < MAX_SPRITES; i++) {
			var sprxp = xoffs + ((this.sprite[i].xpos - AMIGA.playfield.state.hstart) << (AMIGA.playfield.state.hires ? 1 : 0));

			if (!this.sprite[i].armed || sprxp < 0) continue;

			var j, bestp;

			for (bestp = 0; bestp < count; bestp++) {
				if (posns[bestp] > sprxp) break;
				if (posns[bestp] == sprxp && nrs[bestp] < i) break;
			}
			for (j = count; j > bestp; j--) {
				posns[j] = posns[j - 1];
				nrs[j] = nrs[j - 1];
			}
			posns[j] = sprxp;
			nrs[j] = i;
			count++;
		}
		//if (count) { for (i = 0; i < count; i++) BUG.info('SPR n %d, x %d', nrs[i], posns[i]); BUG.info('------------'); }

		var collision_mask = clxmask[this.clxcon >> 12];

		for (i = 0; i < count; i++) {
			var sprxp = posns[i];
			var nr = nrs[i];
			var attachment = this.sprite[nr | 1].ctl & 0x80;
			var da = this.sprite[nr].data;
			var db = this.sprite[nr].datb;
			var datab = ((sprtaba[da & 0xFF] << 16) | sprtaba[da >> 8] | (sprtabb[db & 0xFF] << 16) | sprtabb[db >> 8]);
			var dbl = AMIGA.playfield.state.hires ? 1 : 0;
			var mask = 0;

			if (AMIGA.config.chipset.colLevel != SAEV_Config_Chipset_ColLevel_None && collision_mask) this.draw_1(sprxp, sprxp, datab, nr, dbl, mask, 1, collision_mask);
			else this.draw_1(sprxp, sprxp, datab, nr, dbl, mask, 0, collision_mask);

			if (attachment) {
				var state = (1 << (nr & ~1)) & 0xff;
				for (j = 0; j < 16; j++) {
					spr_state[sprxp + j] |= state;
					spr_attach[sprxp + j] = true;
				}
			}
		}
	}

	this.sprite_fetch = function(n, dma, hpos, cycle, mode) {
		var data = AMIGA.custom.last_value;
		if (dma)
			data = AMIGA.mem.load16_chip(this.sprite[n].pt);
		this.sprite[n].pt += 2;
		return data;
	}

	this.cycle_1 = function (vp, n, cycle, hpos) {
		var isdma = AMIGA.dmaen(DMAF_SPREN) || ((n & 1) && this.sprite[n & ~1].dmacycle);

		if (isdma && vp == sprite_vblank_endline) this.sprArm(n, 0);

		if (vp == this.sprite[n].vstart) {
			this.sprite[n].dmastate = 1;
			//if (n == 0 && cycle == 0) cursorsprite();
		}
		if (vp == this.sprite[n].vstop || vp == sprite_vblank_endline) {
			this.sprite[n].dmastate = 0;
			if (1) {
				// roots 2.0 flower zoomer bottom part missing if this enabled
				if (vp == this.sprite[n].vstop) {
					this.sprArm(n, 0);
					//return;
				}
			}
		}

		if (!isdma) return;
		if (cycle && !this.sprite[n].dmacycle) return; /* Superfrog intro flashing bee fix */

		var dma = hpos < AMIGA.playfield.state.dstart;
		var posctl = 0;

		if (vp == this.sprite[n].vstop || vp == sprite_vblank_endline) {
			this.sprite[n].dmastate = 0;
			posctl = 1;
			if (dma) {
				var data = this.sprite_fetch(n, dma, hpos, cycle, 0);

				if (cycle == 0) {
					this.SPRxPOS(data, n);
					this.sprite[n].dmacycle = 1;
				} else {
					this.SPRxCTL(data, n);
					this.sprite[n].dmastate = 0;
					this.sprStartStop(n);
				}
			}
		}
		if (this.sprite[n].dmastate && !posctl && dma) {
			var data = this.sprite_fetch(n, dma, hpos, cycle, 1);

			if (cycle == 0) {
				this.SPRxDATA(data, n);
				this.sprite[n].dmacycle = 1;
			} else {
				this.SPRxDATB(data, n);
				this.sprArm(n, 1);
			}
		}
	}

	this.cycle = function (hpos) {
		var vp = AMIGA.events.vpos;
		if (vp < sprite_vblank_endline) return;

		for (var i = 0; i < MAX_SPRITES * 2; i++) {
			this.sprite[i >> 1].dmacycle = 1;
			this.cycle_1(vp, i >> 1, i & 1, 0);
		}
	}

	this.sprArm = function (n, state) {
		switch (state) {
			case 0:
				this.nr_armed -= this.sprite[n].armed;
				this.sprite[n].armed = 0;
				break;
			default:
				this.nr_armed += 1 - this.sprite[n].armed;
				this.sprite[n].armed = 1;
		}
	}

	this.sprStartStop = function (n) {
		if (AMIGA.events.vpos + 1 == this.sprite[n].vstart) this.sprite[n].dmastate = 1;
		if (AMIGA.events.vpos + 1 == this.sprite[n].vstop) this.sprite[n].dmastate = 0;
	}

	this.SPRxCTLPOS = function (n) {
		this.sprStartStop(n);

		this.sprite[n].xpos = (this.sprite[n].pos & 0xff) * 2 + (this.sprite[n].ctl & 1);
		this.sprite[n].vstart = (this.sprite[n].pos >> 8) | ((this.sprite[n].ctl << 6) & 0x100);
		this.sprite[n].vstop = (this.sprite[n].ctl >> 8) | ((this.sprite[n].ctl << 7) & 0x100);
		/*if (AMIGA.config.chipset.type == SAEV_Config_Chipset_Type_ECS) {
			this.sprite[n].vstart |= (this.sprite[n].ctl << 3) & 0x200;
			this.sprite[n].vstop |= (this.sprite[n].ctl << 4) & 0x200;
		}*/
		this.sprStartStop(n);
	}

	this.SPRxCTL = function (v, n) {
		this.sprite[n].ctl = v;
		this.sprArm(n, 0);
		this.SPRxCTLPOS(n);
	}

	this.SPRxPOS = function (v, n) {
		this.sprite[n].pos = v;
		this.SPRxCTLPOS(n);
	}

	this.SPRxDATA = function (v, n) {
		this.sprite[n].data = v;
		this.sprArm(n, 1);
	}

	this.SPRxDATB = function (v, n) {
		this.sprite[n].datb = v;
	}

	this.SPRxPTH = function (v, n) {
		this.sprite[n].pt = ((v << 16) | (this.sprite[n].pt & 0xffff)) >>> 0;
	}

	this.SPRxPTL = function (v, n) {
		this.sprite[n].pt = ((this.sprite[n].pt & 0xffff0000) | v) >>> 0;
	}

	this.CLXCON = function (v) {
		this.clxcon = v;
		clxcon_bpl_enable = (v >> 6) & 63;
		clxcon_bpl_match = v & 63;
	}

	this.CLXDAT = function() {
		var v = this.clxdat | 0x8000;
		this.clxdat = 0;
		return v;
	}
}

function Plane(num) {
	this.num = num;
	this.pt = 0;
	this.dat = -1;
	this.line = new Uint16Array(45);
}

function Playfield() {
	/* BPLCON0 flags */
	const BPLF_ERSY = 1 << 1;
	const BPLF_LACE = 1 << 2;
	const BPLF_LPEN = 1 << 3;
	const BPLF_GAUD = 1 << 8;
	const BPLF_COLOR = 1 << 9;
	const BPLF_DBLPF = 1 << 10;
	const BPLF_HOMOD = 1 << 11;
	const BPLF_HIRES = 1 << 15;
	/* BPLCON2 flags */
	const BPLF_PF2PRI = 1 << 6;

	this.sprites = new Sprites();

	this.plane = new Array(6);
	for (var i = 0; i < 6; i++)
	this.plane[i] = new Plane(i);

	this.color_std = new Uint16Array(32);
	this.color_ehb = new Uint16Array(32);
	for (var i = 0; i < 32; i++) this.color_std[i] = this.color_ehb[i] = 0;

	this.linedata = [];

	this.bplcon0 = 0;
	this.bplcon1 = 0;
	this.bplcon2 = 0;
	this.bplcon3 = 0;

	this.bpl1mod = 0;
	this.bpl2mod = 0;

	this.diwstrt = 0;
	this.diwstop = 0;
	this.diwhigh = -1; //ECS
	this.ddfstrt = 0;
	this.ddfstop = 0;

	this.state = {
		vstart: 0,
		vstop: 0,
		vlen: 0,
		vlenreal: 0,
		vlenrealset: 0,
		vlenrealtmp: 0,
		hstart: 0,
		hstop: 0,
		hlen: 0,
		hnum: 0,
		hpixel: 0,
		hleft: 0,
		dstart: 0,
		dstop: 0,
		dlen: 0,
		dnum: 0,
		dwords: 0,
		ddiff: 0,
		altget: false,
		hires: false,
		ilace: false,
		std: false,
		ehb: false,
		dpf: false,
		ham: false,
		planes: 0,
		delay1: 0,
		delay2: 0,
		pf2pri: false,
		pf1p: 0,
		pf2p: 0,
		colorOnly: true,
		hScale: true,
		vScale: true,
	};

	this.frame = {
		skip: false,
		skipcount: 0,
		count: 0
	};

	/* for playfield development */
	/*this.lamps = function() {
		var e = document.getElementById('lamp_hir');
		if (e) e.style.color = this.state.hires ? '#8c8' : '#888';				
		e = document.getElementById('lamp_ila');
		if (e) e.style.color = this.state.ilace ? '#8c8' : '#888';			
		e = document.getElementById('lamp_dpf');
		if (e) e.style.color = this.state.dpf ? '#8c8' : '#888';				
		e = document.getElementById('lamp_ham');
		if (e) e.style.color = this.state.ham ? '#8c8' : '#888';				
		e = document.getElementById('lamp_ehb');
		if (e) e.style.color = this.state.ehb ? '#8c8' : '#888';		
		e = document.getElementById('lamp_scr');
		if (e) e.style.color = this.state.altget ? '#8c8' : '#888';		
		e = document.getElementById('lamp_p2p');
		if (e) e.style.color = this.state.pf2pri ? '#8c8' : '#888';			
		e = document.getElementById('lamp_nPl');
		if (e) e.innerHTML = this.state.planes;		
		e = document.getElementById('lamp_dl1');
		if (e) e.innerHTML = sprintf('%02d', this.state.delay1);		
		e = document.getElementById('lamp_dl2');
		if (e) e.innerHTML = sprintf('%02d', this.state.delay2);		
		//if (this.state.hlen > 0 && this.state.hlen <= 720 && this.state.vlen > 0 && this.state.vlen <= 288)
		{
			e = document.getElementById('lamp_diw');
			if (e) e.innerHTML = sprintf('%dx%d', this.state.hlen, this.state.vlenreal);
		}
		e = document.getElementById('lamp_dff');
		if (e) e.innerHTML = sprintf('%d (%d)', this.state.dlen, this.state.ddiff);
	}*/
	
		
	this.setup = function() {
		this.create_cycle_diagram_table();
		this.sprites.setup();
	}

	this.cleanup = function() {
		this.sprites.cleanup();
	}

	this.reset = function() {
		this.state.colorOnly = true;
		this.state.hScale = true;
		this.state.vScale = true;
		
   	for (var i = 0; i < 32; i++)
   		this.color_std[i] = this.color_ehb[i] = 0;

		this.frame.skip = false;
		this.frame.skipcount = 0;
	}

	this.recalc = function() {		
		this.state.vlen = this.state.vstop - this.state.vstart;
		this.state.hlen = this.state.hstop - this.state.hstart;
		this.state.hnum = this.state.hlen >> 3;

		this.state.dlen = (this.state.dstop - this.state.dstart + 15) & ~7;
		this.state.dnum = this.state.dlen >> 3;
		this.state.ddiff = (this.state.dnum << 1) - this.state.hnum;
		if (this.state.ddiff < 0) this.state.ddiff = 0;

		//this.state.hlen = this.state.dlen << 1;
		
		this.state.hpixel = this.state.hlen << (this.state.hires ? 1 : 0);
		this.state.hleft = (180 - Math.min(this.state.hlen >> 1, this.state.dlen)) << (this.state.hires ? 1 : 0);
		this.state.dwords = this.state.dnum << (this.state.hires ? 1 : 0);	

		this.state.altget = this.state.ddiff != 0 && ((this.state.dstart >> 3) & 1) != 0;

		//this.lamps();
	}
			
	this.calcdiw = function() {
		this.state.vstart = this.diwstrt >> 8;
		this.state.vstop = this.diwstop >> 8;
		this.state.hstart = this.diwstrt & 0xff;
		this.state.hstop = this.diwstop & 0xff;
		this.state.hstart &= ~7;
		this.state.hstop &= ~7;

		if (AMIGA.config.chipset.type == SAEV_Config_Chipset_Type_ECS && this.diwhigh != -1) {
			this.state.vstart |= (this.diwhigh & 7) << 8;
			this.state.vstop |= ((this.diwhigh >> 8) & 7) << 8;
			this.state.hstart |= ((this.diwhigh >> 5) & 1) << 8;
			this.state.hstop |= ((this.diwhigh >> 13) & 1) << 8;
		} else {
			if ((this.state.vstop & 0x80) == 0) this.state.vstop |= 0x100;
			this.state.hstop += 0x100;
		}
	
		this.recalc();
		//BUG.info('Playfield.calcdiw() diwstrt $%04x diwstop $%04x | v %d-%d, h %d-%d | %d x %d', this.diwstrt, this.diwstop, this.state.vstart, this.state.vstop, this.state.hstart, this.state.hstop, this.state.hlen, this.state.vlen);
	}
	
	this.calcddf = function(stop) {
		this.state.dstart = this.ddfstrt & 0xff;
		this.state.dstop = this.ddfstop & 0xff;
		this.state.dstart &= ~3;
		this.state.dstop &= ~3;

		if (this.state.dstart < 0x18) this.state.dstart = 0x18;
		if (this.state.dstop > 0xd8) this.state.dstop = 0xd8;

		/*if (AMIGA.config.chipset.type == SAEV_Config_Chipset_Type_ECS) {
			if (this.state.dstop > AMIGA.events.maxhpos) this.state.dstart = 0;
			if (this.state.dstart < 0x18) this.state.dstart = 0x18;
		} else {
			if (this.state.dstart >= this.state.dstop && this.state.dstart >= 0x18) this.state.dstop = 0xff;
		}*/

		this.recalc();
		//BUG.info('Playfield.calcddf() ddfstrt $%04x ddfstop $%04x | plflinelen %d', this.ddfstrt, this.ddfstop, this.state.dlen);
	}

		
	this.drawpixel = function (xpos, ypos, rgb) {
		/*if (this.state.ilace) {
			if (this.state.hires)
				AMIGA.video.drawpixel(xpos, ypos, rgb);
			else {
				AMIGA.video.drawpixel(xpos*2, ypos, rgb);
				AMIGA.video.drawpixel(xpos*2+1, ypos, rgb);			
			}			
		} else {
			if (this.state.hires) {
				AMIGA.video.drawpixel(xpos, ypos*2, rgb);
				AMIGA.video.drawpixel(xpos, ypos*2+1, rgb);
			} else {
				AMIGA.video.drawpixel(xpos*2, ypos*2, rgb);
				AMIGA.video.drawpixel(xpos*2+1, ypos*2, rgb);			
				AMIGA.video.drawpixel(xpos*2, ypos*2+1, rgb);
				AMIGA.video.drawpixel(xpos*2+1, ypos*2+1, rgb);			
			}
		}*/

		if (this.state.hires)
			AMIGA.video.drawpixel(xpos, ypos, rgb);
		else
			AMIGA.video.draw2pixel(xpos << 1, ypos, rgb);
	}	
	this.drawpixel_std = function (xpos, ypos, col) {
		var spritecol = this.sprites.render(xpos, col);
		var rgb = this.color_std[spritecol ? spritecol : col];
		this.linedata[xpos] = col;
		//AMIGA.video.drawpixel(xpos, ypos, rgb);
		this.drawpixel(xpos, ypos, rgb);
	}
	
	this.drawpixel_ehb = function (xpos, ypos, col, ehb) {
		var rgb;
		var spritecol = this.sprites.render(xpos, col);
		if (spritecol) rgb = this.color_std[spritecol];
		else rgb = ehb ? this.color_ehb[col] : this.color_std[col];
		this.linedata[xpos] = col;
		//AMIGA.video.drawpixel(xpos, ypos, rgb);
		this.drawpixel(xpos, ypos, rgb);
	}

	this.drawpixel_dpf = function (xpos, ypos, col1, col2) {
		var rgb, col = this.state.pf2pri ? col2 : col1;
		var spritecol = this.sprites.render(xpos, col);
		if (spritecol)
			rgb = this.color_std[spritecol];
		else { 
			col = this.state.pf2pri ? (col2 > 0 ? (8 + col2) : col1) : (col1 > 0 ? col1 : (8 + col2));
			rgb = this.color_std[col];		
		}
		this.linedata[xpos] = col;
		//AMIGA.video.drawpixel(xpos, ypos, rgb);
		this.drawpixel(xpos, ypos, rgb);
	}

	this.drawpixel_ham_col = function (xpos, ypos, col) {
		var spritecol = this.sprites.render(xpos, col);
		var rgb = this.color_std[spritecol ? spritecol : col]	
		this.linedata[xpos] = col; 
		//AMIGA.video.drawpixel(xpos, ypos, rgb);
		this.drawpixel(xpos, ypos, rgb);
	}
	
	this.drawpixel_ham_rgb = function (xpos, ypos, rgb) {
		var spritecol = this.sprites.render(xpos, 0);
		if (spritecol) rgb = this.color_std[spritecol];			
		this.linedata[xpos] = 0;
		//AMIGA.video.drawpixel(xpos, ypos, rgb);
		this.drawpixel(xpos, ypos, rgb);
	}
	
	
	this.drawline_std = function(x, y, o) {
		var i, j, l;
		if (this.state.altget && this.state.ddiff < 4) {
			for (j = 0; j < 4; j++) AMIGA.video.drawpixel(x + j, y, this.color_std[0]);
									
			for (j = 4, l = 11; j < 16; j++, l--) {
				var col = 0;
				switch (this.state.planes) {
					case 5: 					col = ((this.plane[4].line[o] >> l) & 1);
					case 4: col = (col << 1) | ((this.plane[3].line[o] >> l) & 1);
					case 3: col = (col << 1) | ((this.plane[2].line[o] >> l) & 1);
					case 2: col = (col << 1) | ((this.plane[1].line[o] >> l) & 1);
					case 1: col = (col << 1) | ((this.plane[0].line[o] >> l) & 1);
				}
				this.drawpixel_std(x + j, y, col);				
			}
			i = 16; o++;
		} else
			i = 0;
		
		for (; i < this.state.hpixel; i += 16, o++) {
			for (j = 0, l = 15; j < 16; j++, l--) {			
				var col = 0;			
				switch (this.state.planes) {
					case 5: col = ((this.plane[4].line[o] >> l) & 1);
					case 4: col = (col << 1) | ((this.plane[3].line[o] >> l) & 1);
					case 3: col = (col << 1) | ((this.plane[2].line[o] >> l) & 1);
					case 2: col = (col << 1) | ((this.plane[1].line[o] >> l) & 1);
					case 1: col = (col << 1) | ((this.plane[0].line[o] >> l) & 1);
				}
				this.drawpixel_std(x + i + j, y, col);				
			}		
		}
	}	
	
	this.drawline_ehb = function(x, y, o) {		
		for (var i = 0; i < this.state.hpixel; i += 16, o++) {
			for (var j = 0, l = 15; j < 16; j++, l--) {
				var ehb = ((this.plane[5].line[o] >> l) & 1);
				var col = ((this.plane[4].line[o] >> l) & 1);
				col = (col << 1) | ((this.plane[3].line[o] >> l) & 1);
				col = (col << 1) | ((this.plane[2].line[o] >> l) & 1);
				col = (col << 1) | ((this.plane[1].line[o] >> l) & 1);
				col = (col << 1) | ((this.plane[0].line[o] >> l) & 1);
				this.drawpixel_ehb(x + i + j, y, col, ehb);				
			}			
		}		
	}	
	
	this.drawline_dpf = function(x, y, o) {
		for (var i = 0; i < this.state.hpixel; i += 16, o++) {
			for (var j = 0, l = 15; j < 16; j++, l--) {
				var col1 = 0, col2 = 0;
				switch (this.state.planes) {
					case 6:					 col2 = ((this.plane[5].line[o] >> l) & 1);
					case 5:					 col1 = ((this.plane[4].line[o] >> l) & 1);
					case 4: col2 = (col2 << 1) | ((this.plane[3].line[o] >> l) & 1);
					case 3: col1 = (col1 << 1) | ((this.plane[2].line[o] >> l) & 1);
					case 2: col2 = (col2 << 1) | ((this.plane[1].line[o] >> l) & 1);
					case 1: col1 = (col1 << 1) | ((this.plane[0].line[o] >> l) & 1);
				}				
				this.drawpixel_dpf(x + i + j, y, col1, col2);				
			}									
		}		
	}
	
	this.drawline_ham = function(x, y, o) {
		var opm, col, r = 0, g = 0, b = 0;
	
		for (var i = 0; i < this.state.hpixel; i += 16, o++) {
			for (var j = 0, l = 15; j < 16; j++, l--) {	
				opm = (((this.plane[5].line[o] >> l) & 1) << 1) | ((this.plane[4].line[o] >> l) & 1);
				col = ((this.plane[3].line[o] >> l) & 1);
				col = (col << 1) | ((this.plane[2].line[o] >> l) & 1);
				col = (col << 1) | ((this.plane[1].line[o] >> l) & 1);
				col = (col << 1) | ((this.plane[0].line[o] >> l) & 1);
 				switch (opm) {
					case 2: { r = col; this.drawpixel_ham_rgb(x + i + j, y, ((r << 1) << 11) | ((g << 2) << 5) | (b << 1)); break; }									
					case 3: { g = col; this.drawpixel_ham_rgb(x + i + j, y, ((r << 1) << 11) | ((g << 2) << 5) | (b << 1)); break; }								
					case 1: { b = col; this.drawpixel_ham_rgb(x + i + j, y, ((r << 1) << 11) | ((g << 2) << 5) | (b << 1)); break; }									
					default: {
						r = ((this.color_std[col] >> 11) & 31) >> 1;
						g = ((this.color_std[col] >> 5) & 63) >> 2;
						b = (this.color_std[col] & 31) >> 1;
						this.drawpixel_ham_col(x + i + j, y, col);
					}									
				}
			}			
		}		
	}	

	this.drawline_border = function(y) {
		var l = this.state.hleft;
		var w = this.state.hpixel;
		var r = this.state.hires ? VIDEO_WIDTH : VIDEO_WIDTH >> 1;
		var x, rgb = this.color_std[0];
		
		if (!this.state.hires) {
			l <<= 1;
			w <<= 1;
			r <<= 1;
		}
		AMIGA.video.drawline_from_to(0, l, y, rgb);
		AMIGA.video.drawline_from_to(l + w, r, y, rgb);
	}
	this.drawline_empty = function(y) {
		var l = this.state.hleft;
		var w = this.state.hpixel;
		var x, rgb = this.color_std[0];
		
		if (!this.state.hires) {
			l <<= 1;
			w <<= 1;
		}
		AMIGA.video.drawline_from_to(l, l + w, y, rgb);
	}
	
	this.fetchline = function() {
		var pt5 = this.plane[5].pt >>> 1;
		var pt4 = this.plane[4].pt >>> 1;
		var pt3 = this.plane[3].pt >>> 1;
		var pt2 = this.plane[2].pt >>> 1;
		var pt1 = this.plane[1].pt >>> 1;
		var pt0 = this.plane[0].pt >>> 1;                               

		if (this.state.altget) {	
			switch (this.state.planes) {
				case 6: { this.plane[5].line[0] = AMIGA.mem.chip.data[pt5] >> 8; }
				case 5: { this.plane[4].line[0] = AMIGA.mem.chip.data[pt4] >> 8; }
				case 4: { this.plane[3].line[0] = AMIGA.mem.chip.data[pt3] >> 8; }
				case 3: { this.plane[2].line[0] = AMIGA.mem.chip.data[pt2] >> 8; }
				case 2: { this.plane[1].line[0] = AMIGA.mem.chip.data[pt1] >> 8; }
				case 1: { this.plane[0].line[0] = AMIGA.mem.chip.data[pt0] >> 8; }
			}		
			for (var i = 1; i < this.state.dwords + 1; i++) {			
				switch (this.state.planes) {
					case 6: { this.plane[5].line[i] = ((AMIGA.mem.chip.data[pt5] & 0xff) << 8) | (AMIGA.mem.chip.data[++pt5] >> 8); }
					case 5: { this.plane[4].line[i] = ((AMIGA.mem.chip.data[pt4] & 0xff) << 8) | (AMIGA.mem.chip.data[++pt4] >> 8); }
					case 4: { this.plane[3].line[i] = ((AMIGA.mem.chip.data[pt3] & 0xff) << 8) | (AMIGA.mem.chip.data[++pt3] >> 8); }
					case 3: { this.plane[2].line[i] = ((AMIGA.mem.chip.data[pt2] & 0xff) << 8) | (AMIGA.mem.chip.data[++pt2] >> 8); }
					case 2: { this.plane[1].line[i] = ((AMIGA.mem.chip.data[pt1] & 0xff) << 8) | (AMIGA.mem.chip.data[++pt1] >> 8); }
					case 1: { this.plane[0].line[i] = ((AMIGA.mem.chip.data[pt0] & 0xff) << 8) | (AMIGA.mem.chip.data[++pt0] >> 8); }
				}
			}
			switch (this.state.planes) {
				case 6: { this.plane[5].line[i] = 0; }
				case 5: { this.plane[4].line[i] = 0; }
				case 4: { this.plane[3].line[i] = 0; }
				case 3: { this.plane[2].line[i] = 0; }
				case 2: { this.plane[1].line[i] = 0; }
				case 1: { this.plane[0].line[i] = 0; }
			}		
		} else {
			for (var i = 0; i < this.state.dwords; i++) {  
				switch (this.state.planes) {
					case 6: { this.plane[5].line[i] = AMIGA.mem.chip.data[pt5++]; }
					case 5: { this.plane[4].line[i] = AMIGA.mem.chip.data[pt4++]; }
					case 4: { this.plane[3].line[i] = AMIGA.mem.chip.data[pt3++]; }
					case 3: { this.plane[2].line[i] = AMIGA.mem.chip.data[pt2++]; }
					case 2: { this.plane[1].line[i] = AMIGA.mem.chip.data[pt1++]; }
					case 1: { this.plane[0].line[i] = AMIGA.mem.chip.data[pt0++]; }
				}
			}	
		}
		
		switch (this.state.planes) {
			case 6: this.plane[5].pt = pt5 << 1;
			case 5: this.plane[4].pt = pt4 << 1;
			case 4: this.plane[3].pt = pt3 << 1;
			case 3: this.plane[2].pt = pt2 << 1;
			case 2: this.plane[1].pt = pt1 << 1;
			case 1: this.plane[0].pt = pt0 << 1;
		}
	}
	
	this.scrollline = function(d1, d2) {
		var d1n = 16 - d1;
		var d2n = 16 - d2;
		for (var i = this.state.dwords - 1; i > 0; i--) {
			switch (this.state.planes) {
				case 6: { if (d2) this.plane[5].line[i] = (this.plane[5].line[i] >> d2) | (this.plane[5].line[i - 1] << d2n); }
				case 5: { if (d1) this.plane[4].line[i] = (this.plane[4].line[i] >> d1) | (this.plane[4].line[i - 1] << d1n); }
				case 4: { if (d2) this.plane[3].line[i] = (this.plane[3].line[i] >> d2) | (this.plane[3].line[i - 1] << d2n); }
				case 3: { if (d1) this.plane[2].line[i] = (this.plane[2].line[i] >> d1) | (this.plane[2].line[i - 1] << d1n); }
				case 2: { if (d2) this.plane[1].line[i] = (this.plane[1].line[i] >> d2) | (this.plane[1].line[i - 1] << d2n); }
				case 1: { if (d1) this.plane[0].line[i] = (this.plane[0].line[i] >> d1) | (this.plane[0].line[i - 1] << d1n); }
			}        
		}	
		switch (this.state.planes) {
			case 6: { if (d2) this.plane[5].line[i] = this.plane[5].line[i] >> d2; }
			case 5: { if (d1) this.plane[4].line[i] = this.plane[4].line[i] >> d1; }
			case 4: { if (d2) this.plane[3].line[i] = this.plane[3].line[i] >> d2; }
			case 3: { if (d1) this.plane[2].line[i] = this.plane[2].line[i] >> d1; }
			case 2: { if (d2) this.plane[1].line[i] = this.plane[1].line[i] >> d2; }
			case 1: { if (d1) this.plane[0].line[i] = this.plane[0].line[i] >> d1; }
		}
	}
	
	this.mod = function() {
		switch (this.state.planes) {
			case 6: this.plane[5].pt += this.bpl2mod;
			case 5: this.plane[4].pt += this.bpl1mod;
			case 4: this.plane[3].pt += this.bpl2mod;
			case 3: this.plane[2].pt += this.bpl1mod;
			case 2: this.plane[1].pt += this.bpl2mod;
			case 1: this.plane[0].pt += this.bpl1mod;
		}
	}
	
	this.hSync = function() {
		if (!this.frame.skip) {
			var x = this.state.hleft;
			var y = AMIGA.events.vpos - ((this.state.vlenreal > 256) ? this.state.vstart : 0x2c);

			if (this.state.ilace) y = y * 2 + 1 - AMIGA.events.lof;
			if (x < 0) x = 0;
			if (y < 0) y = 0; else if (y >= VIDEO_HEIGHT) y = VIDEO_HEIGHT - 1;

			if (AMIGA.events.vpos >= this.state.vstart && AMIGA.events.vpos < this.state.vstop) {
				if (this.state.planes > 0 && AMIGA.dmaen(DMAF_BPLEN)) {        
					var offs = this.state.ddiff ? (this.state.ddiff - 1) >> 1 : 0;
					if (this.state.ddiff == 2) { this.state.altget = false; offs++ };
					this.state.colorOnly = false;

					if (this.sprites.nr_armed > 0) this.sprites.draw();

					this.fetchline();
					this.mod();

					if (this.state.delay1 || this.state.delay2) {
						var d1 = this.state.hires ? ((this.state.delay1 & 7) << 1) : this.state.delay1;
						var d2 = this.state.hires ? ((this.state.delay2 & 7) << 1) : this.state.delay2;
						this.scrollline(d1, d2);
					}


					if (this.state.std) this.drawline_std(x, y, offs);
					else if (this.state.ehb) this.drawline_ehb(x, y, offs);
					else if (this.state.dpf) this.drawline_dpf(x, y, offs);
					else if (this.state.ham) this.drawline_ham(x, y, offs);
					else AMIGA.video.drawline(y, this.color_std[0]);

					this.drawline_border(y);

					if (this.state.vlenrealset == 0) {
						this.state.vlenrealset++;
						this.state.vlenrealtmp = AMIGA.events.vpos;
					}
				} else {	
					AMIGA.video.drawline(y, this.color_std[0]);
				}
			} else {
				if (this.state.vlenrealset == 1) {
					this.state.vlenrealset++;
					this.state.vlenreal = AMIGA.events.vpos - this.state.vlenrealtmp;
					//this.lamps();
				}
				AMIGA.video.drawline(y, this.color_std[0]);
			}
		}

		//AMIGA.events.eventtab[EV_RENDER].oldcycles = AMIGA.events.currcycle;
		//AMIGA.events.eventtab[EV_RENDER].evtime = AMIGA.events.currcycle + AMIGA.events.maxhpos * CYCLE_UNIT;
	}
	
	this.vSync = function() {
		if (!this.frame.skip && (!this.state.ilace || (this.state.ilace && AMIGA.events.lof == 0))) {
			AMIGA.video.draw(this.color_std[0], this.state.hScale, this.state.vScale, this.state.colorOnly);

			//if (!this.state.colorOnly) AMIGA.video.clear_pixels();
		}			

		if (this.state.ilace) { if (AMIGA.events.lof == 0) this.frame.count++; } else this.frame.count++; if (this.frame.count == AMIGA.events.hz) this.frame.count = 0;
 
      /*this.state.hires = false;
		this.state.ilace = false;
		this.state.ham = false;
		this.state.dpf = false;
		this.state.ehb = false;
		this.state.std = false;
		this.state.altget = false;
		this.state.hScale = true;
		this.state.vScale = true;*/
		
		this.state.colorOnly = true;		    
		this.state.vlenrealset = 0;
	}

	this.COLORxx = function (v, num) {
		//BUG.info('Playfield.COLOR%02d() $%04x', num, v);
		var r = (v >> 8) & 15;
		var g = (v >> 4) & 15;
		var b = v & 15;	
		this.color_std[num] = ((r << 1) << 11) | ((g << 2) << 5) | (b << 1);
		this.color_ehb[num] = (r << 11) | ((g << 1) << 5) | b;
	}
	
	this.BPLxPTx = function (v, num, hi) {
		if (hi) {
			this.plane[num].pt = ((v << 16) | (this.plane[num].pt & 0xffff)) >>> 0;
		} else {
			/*if (AMIGA.copper.access && this.is_bitplane_dma(AMIGA.events.hpos() + 1) == num + 1) {
				console.log('BPLxPTx() SKIP! ', num, AMIGA.events.hpos());
				return;
			}*/			
			this.plane[num].pt = ((this.plane[num].pt & 0xffff0000) | v) >>> 0;
		}
	}

	this.BPLxDAT = function (v, num) {
		//if (v) BUG.info('Custom.BPL%dDAT() $%04x', num, v);
		this.plane[num].dat = v;
	}
	
	/*this.BPLCON0_getRes = function (v) {
		if (AMIGA.config.chipset.type == SAEV_Config_Chipset_Type_OCS)
			v &= ~0x40;
		return (v & 0x8000) ? 2 : ((v & 0x40) ? 3 : 1);
	}*/

	this.BPLCON0_getPlanes = function (v) {
		if ((v & 0x0010) && (v & 0x7000))
			return 0;
		if (v & 0x0010)
			return 8;
		return (v >> 12) & 7;
	}
		
	this.BPLCON0 = function (v) {
		//BUG.info('Custom.BPLCON0() $%04x', v);
		//var hires_old = this.state.hires;
		var ilace_old = this.state.ilace;
		 
		if (!(this.bplcon0 & 2)) {
			AMIGA.events.vpos_previous = AMIGA.events.vpos;
			AMIGA.events.hpos_previous = AMIGA.events.hpos();
		}		

		this.bplcon0 = v;
		this.state.planes = this.BPLCON0_getPlanes(v);
		
		this.state.hires = (v & BPLF_HIRES) != 0;
		this.state.ilace = (v & BPLF_LACE) != 0;
		this.state.dpf = (v & BPLF_DBLPF) != 0;
		this.state.ham = (v & BPLF_HOMOD) != 0;			
		this.state.ehb = (this.state.planes == 6 && !this.state.dpf &&  !this.state.ham);
		this.state.std = (!this.state.ehb && !this.state.dpf && !this.state.ham);
		
		this.state.hpixel = this.state.hlen << (this.state.hires ? 1 : 0);
		this.state.hleft = (180 - Math.min(this.state.hlen >> 1, this.state.dlen)) << (this.state.hires ? 1 : 0);
		this.state.dwords = this.state.dnum << (this.state.hires ? 1 : 0);
			
		if (this.state.planes) {		
			this.state.hScale = !this.state.hires;
			this.state.vScale = !this.state.ilace;
		}

		//if (this.state.hires != hires_old) BUG.info('Custom.BPLCON0() hires change %d, vpos %d, hpos %d', this.state.hires?1:0, AMIGA.events.vpos, AMIGA.events.hpos());
		if (this.state.ilace != ilace_old) {
			//BUG.info('Custom.BPLCON0() ilace change %d, vpos %d, hpos %d', this.state.ilace?1:0, AMIGA.events.vpos, AMIGA.events.hpos());		
			if (!this.state.ilace) AMIGA.video.clear_pixels();
			AMIGA.audio.recalc_sample_evtime();		
		}	
		
		this.setup_fmodes(AMIGA.events.hpos());

		//this.lamps();
	}

	this.BPLCON1 = function (v) {
		this.bplcon1 = v;
		this.state.delay1 = v & 0xf;
		this.state.delay2 = (v >> 4) & 0xf;

		//this.lamps();
	}

	this.BPLCON2 = function (v) {
		this.bplcon2 = v;
		this.state.pf2pri = (v & BPLF_PF2PRI) != 0;
		this.state.pf1p = v & 7;
		this.state.pf2p = (v >> 3) & 7;

		this.sprites.setMask(this.state.pf1p, this.state.pf2p);

		//this.lamps();
	}

	this.BPLCON3 = function (v) {
		this.bplcon3 = v;
	}

	this.BPL1MOD = function (v) {
		//if (v) BUG.info('Custom.BPL1MOD() $%04x', v);
		this.bpl1mod = (v & 0x8000) ? (v - 0x10000) : v;
	}

	this.BPL2MOD = function (v) {
		//if (v) BUG.info('Custom.BPL2MOD() $%04x', v);
		this.bpl2mod = (v & 0x8000) ? (v - 0x10000) : v;
	}

	this.DIWSTRT = function (v) {
		//BUG.info('Custom.DIWSTRT() $%04x', v);
		this.diwstrt = v;
		this.calcdiw();
	}

	this.DIWSTOP = function (v) {
		//BUG.info('Custom.DIWSTOP() $%04x', v);
		this.diwstop = v;
		this.calcdiw();
	}

	this.DDFSTRT = function (v) {
		//BUG.info('Custom.DDFSTRT() $%04x', v);
		this.ddfstrt = v;
		this.calcddf(0);
	}

	this.DDFSTOP = function (v) {
		//BUG.info('Custom.DDFSTOP() $%04x', v);
		this.ddfstop = v;
		this.calcddf(1);
	}

	/* ECS 
	 * 7-4 Lisa/Denise/ECS Denise Revision level (decrement to bump revision level, hex F represents 0th rev. level)
	 * 3 Maintain as a 1 for future generation
	 * 2 When low indicates AA feature set (LISA)
	 * 1 When low indicates ECS feature set (LISA or ECS DENISE)
	 * 0 Maintain as a 1 for future generation
	 * 
	 * Denise ID: OCS = 0xFF, ECS = 0xFC, AGA = 0xF8
	 */
	this.DENISEID___ = function() {
		var smb = 0xff;

		var v = ((0xf - AMIGA.config.chipset.agnus_rev) << 4);
		v |= 8;
		v |= 4; /* low = AGA */
		/* v |= 2; low = ECS */
		//v |= 1;

		BUG.info('Custom.DENISEID() $%04x', (smb << 8) | v);
		return (smb << 8) | v;
	}
	
	this.DENISEID = function() {
		//if (AMIGA.config.chipset.type == SAEV_Config_Chipset_Type_AGA) return [0, 0x00F8];
		if (AMIGA.config.chipset.type == SAEV_Config_Chipset_Type_ECS) return [0, 0xFFFC];
		if (AMIGA.config.cpu.model == 68000 && (AMIGA.config.cpu.compatible || AMIGA.config.cpu.exact))
			return [1, 0xFFFF];
		return [0, 0xFFFF];
	}
	
	this.DIWHIGH = function (v) {
		//if (!(AMIGA.config.chipset.type == CHIPSET_AGA))
			v &= ~ (0x0008 | 0x0010 | 0x1000 | 0x0800);
		v &= ~ (0x8000 | 0x4000 | 0x0080 | 0x0040);

		//BUG.info('Custom.DIWHIGH() $%04x', v);
		this.diwhigh = v;
		this.calcdiw();
	}
	
 	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	
	var bplcon0_res = 0;
	var bplcon0_planes = 0;
	var bplcon0_planes_limit = 0;
	
	var real_bitplane_number = []; //[3][3][9];
	var fmode = 0;
	var fetchmode = 0;
	var fetchunits = [ 8,8,8,0, 16,8,8,0, 32,16,8,0 ];
	var fetchstarts = [ 3,2,1,0, 4,3,2,0, 5,4,3,0 ];
	var fm_maxplanes = [ 3,2,1,0, 3,3,2,0, 3,3,3,0 ];
	var fetchunit = 0;

	var fetchunit_mask = 0;
	var fetchstart_shift = 0;
	var fetchstart = 0;
	var fetchstart_mask = 0;

	var cycle_diagram_table = []; //[3][3][9][32];
	var cycle_diagram_free_cycles = []; //[3][3][9];
	var cycle_diagram_total_cycles = []; //[3][3][9];
	var cycle_sequences = [ [2,1,2,1,2,1,2,1], [4,2,3,1,4,2,3,1], [8,4,6,2,7,3,5,1] ];
	var curr_diagram = [];
	
	this.create_cycle_diagram_table = function () {
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
					if (rplanes == 7 && fm == 0 && res == 0) //&& !(currprefs.chipset_mask & CSMASK_AGA))
						rplanes = 4;
					real_bitplane_number[fm][res][planes] = rplanes;
				}
			}
		}
	}
	
	//var estimated_last_fetch_cycle = 0;	
	//var cycle_diagram_shift = 0;
	
	/*this.estimate_last_fetch_cycle = function (hpos) {
		var fetchunit = fetchunits[fetchmode * 4 + bplcon0_res];

		if (plf_state < plf_passed_stop) {
			var stop = plfstop < hpos || plfstop > HARD_DDF_STOP ? HARD_DDF_STOP : plfstop;
			var fetch_cycle_at_stop = fetch_cycle + (stop - hpos);
			var starting_last_block_at = (fetch_cycle_at_stop + fetchunit - 1) & ~(fetchunit - 1);

			estimated_last_fetch_cycle = hpos + (starting_last_block_at - fetch_cycle) + fetchunit;
		} else {
			var starting_last_block_at = (fetch_cycle + fetchunit - 1) & ~(fetchunit - 1);
			if (plf_state == plf_passed_stop2)
				starting_last_block_at -= fetchunit;

			estimated_last_fetch_cycle = hpos + (starting_last_block_at - fetch_cycle) + fetchunit;
		}
	}*/
	
	const RES_LORES = 0;
	const RES_HIRES = 1;
	const RES_SUPERHIRES = 2;

	this.GET_RES_DENISE = function (con0) {
		//if (!(currprefs.chipset_mask & CSMASK_ECS_DENISE))
			con0 &= ~0x40; // SUPERHIRES
		return (con0 & 0x8000) ? RES_HIRES : (con0 & 0x40) ? RES_SUPERHIRES : RES_LORES;
	}
	this.GET_RES_AGNUS = function (con0) {
		//if (!(currprefs.chipset_mask & CSMASK_ECS_AGNUS))
			con0 &= ~0x40; // SUPERHIRES
		return (con0 & 0x8000) ? RES_HIRES : (con0 & 0x40) ? RES_SUPERHIRES : RES_LORES;
	}
	this.GET_PLANES = function (con0) {
		if ((con0 & 0x0010) && (con0 & 0x7000))
			return 0; // >8 planes = 0 planes
		if (con0 & 0x0010)
			return 8; // AGA 8-planes bit
		return (con0 >> 12) & 7; // normal planes bits
	}
	
	this.GET_PLANES_LIMIT = function (con0) {
		var res = this.GET_RES_AGNUS (con0);
		var planes = this.GET_PLANES (con0);
		return real_bitplane_number[fetchmode][res][planes];
	}
	

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
		//badmode = GET_RES_AGNUS (bplcon0) != GET_RES_DENISE (this.bplcon0);
		bplcon0_res = this.GET_RES_AGNUS (this.bplcon0);
		bplcon0_planes = this.GET_PLANES (this.bplcon0);
		bplcon0_planes_limit = this.GET_PLANES_LIMIT (this.bplcon0);
		//console.log(bplcon0_res, bplcon0_planes, bplcon0_planes_limit);
		fetchunit = fetchunits[fetchmode * 4 + bplcon0_res];
		fetchunit_mask = fetchunit - 1;
		fetchstart_shift = fetchstarts[fetchmode * 4 + bplcon0_res];
		fetchstart = 1 << fetchstart_shift;
		fetchstart_mask = fetchstart - 1;
		/*fm_maxplane_shift = fm_maxplanes[fetchmode * 4 + bplcon0_res];
		fm_maxplane = 1 << fm_maxplane_shift;
		fetch_modulo_cycle = fetchunit - fetchstart;
		if (is_bitplane_dma (hpos - 1)) cycle_line[hpos - 1] = 1;*/
		curr_diagram = cycle_diagram_table[fetchmode][bplcon0_res][bplcon0_planes_limit];
		//console.log(curr_diagram);
		//console.log(fetchstart_mask);
		//estimate_last_fetch_cycle (hpos);
		//if (bpldmasetuphpos >= 0 && debug_dma) record_dma_event (DMA_EVENT_BPLFETCHUPDATE, hpos, vpos);
		/*bpldmasetuphpos = -1;
		bpldmasetupphase = 0;
		ddf_change = vpos;*/
		//console.log('setup_fmodes()', fetchstart, fetchstart_shift, fetchstart_mask, curr_diagram);
	}

	this.is_bitplane_dma = function (hpos) {
		if (hpos < this.state.dstart*2) //plfstrt)
			return 0;
		//if ((plf_state == plf_end && hpos >= thisline_decision.plfright) || hpos >= estimated_last_fetch_cycle)
		if (hpos >= this.state.dstop*2) //|| hpos >= estimated_last_fetch_cycle)
			return 0;

		//console.log(hpos - this.state.hstart);
		//return curr_diagram[(hpos - cycle_diagram_shift) & fetchstart_mask];
		return curr_diagram[hpos & fetchstart_mask];
	}

	this.get_data = function() {  
		return [		
			this.state.hstart,
			this.state.hstop - (16 << fetchmode),
			cycle_diagram_total_cycles[fetchmode][this.GET_RES_AGNUS(this.bplcon0)][this.GET_PLANES_LIMIT(this.bplcon0)], 
			cycle_diagram_free_cycles[fetchmode][this.GET_RES_AGNUS(this.bplcon0)][this.GET_PLANES_LIMIT(this.bplcon0)]
		]		
	}
	
}
