/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
***************************************************************************
*
* TODO:
* - Faster versions of ASx/LSx/ROx/ROXx and xBCD
*
*  Notes:
* - Based on M68000PRM.pdf
* - Written from scratch.
* 
**************************************************************************/

function CPU() {
	const M_rdd		=  1; /* Register Direct Data */
	const M_rda		=  2; /* Register Direct Address */
	const M_ria		=  3; /* Register Indirect Address */
	const M_ripo	=  4; /* Register Indirect	Address with Postincrement */
	const M_ripr	=  5; /* Register Indirect	Address with Predecrement */
	const M_rid		=  6; /* Register Indirect	Address with Displacement */
	const M_rii		=  7; /* Address Register Indirect, with Index (8-Bit Displacement) */
	const M_pcid	=  8; /* Program Counter Indirect with Displacement */
	const M_pcii	=  9; /* Program Counter Indirect with Index	(8-Bit Displacement) */
	const M_absw	= 10; /* Absolute Data Addressing */
	const M_absl	= 11; /* Absolute Data Addressing */
	const M_imm		= 12; /* Immediate Data */
	const M_list	= 16; /* Ax,Dx-list for easy MOVEM debug */

	const T_RD = 1; /* Register Data */
	const T_RA = 2; /* Register Address */
	const T_AD = 3; /* Address */
	const T_IM = 4; /* Immediate */

	const ccNames = ['T', 'F', 'HI', 'LS', 'CC', 'CS', 'NE', 'EQ', 'VC', 'VS', 'PL', 'MI', 'GE', 'LT', 'GT', 'LE'];

	/* Effective Address */
	function EffAddr(m, r) {
		this.m = m; /* Mode M_ */
		this.t = 0; /* Type T_ */
		this.r = r; /* Register An/Dn */
		this.a = 0; /* Address */
		this.c = 0; /* Cycles */
	}

	/* Instruction Condition */
	function ICon(cc, dp, dr) {
		this.cc = cc; /* Condition Code */
		this.dp = dp; /* Displacement */
		this.dr = dr; /* Data Register for DBcc */
	}

	/* Instruction Paramenter */
	function IPar() {
		this.z = 0; /* size B,W,L */
		/* Filled on demand 
		this.s = new EffAddr();
		this.d = new EffAddr();
		this.c = new ICon();
		this.ms = 0;
		this.mz = 0;
		this.cyc = 0;*/
	}

	/* Instruction Definition */
	function IDef() {
		this.op = 0; /* OP-code */
		//this.pr = false; /* Privileged */
		this.mn = ''; /* Mnemonic */
		this.f = null; /* Function */
		this.p = new IPar();
	}

	/* Exception 2/3 error */
	function Exception23(num) {
		this.num = num;
	}
	Exception23.prototype = new Error;

	/*-----------------------------------------------------------------------*/

	const undef = false; /* use undef */

	var regs = {
		//d: [0, 0, 0, 0, 0, 0, 0, 0], /* Dn */
		//a: [0, 0, 0, 0, 0, 0, 0, 0], /* An */
		d: new Uint32Array(8),
		a: new Uint32Array(8),
		/* Status Register (SR) */
		t: false,
		s: false,
		intmask: 0,
		/* Condition Code Register (CCR) */
		x: false,
		n: false,
		z: false,
		v: false,
		c: false,
		usp: 0, /* User Stack Ptr (USP) */
		isp: 0, /* Interrupt Stack Ptr (ISP) */
		pc: 0, /* Program Counter (PC) */
		stopped:true
	};
	var fault = {
		op: 0,
		pc: 0,
		ad: 0,
		ia: false
	};
	var iTab = null;
	var cpu_cycle_unit = CYCLE_UNIT / 2;
	var cpu_cycles = 4 * cpu_cycle_unit;
	
	/*-----------------------------------------------------------------------*/

	this.setup = function () {
      if (iTab === null) {
         BUG.say('cpu.setup() no instruction table, generating...');
         if (!mkiTab())
            Fatal(SAEE_CPU_Internal, 'cpu.setup() error generating function table');
      } else
         BUG.say('cpu.setup() instruction table is cached');
   };

	this.reset = function (addr) {
      for (var i = 0; i < 8; i++)
         regs.d[i] = regs.a[i] = 0;

      regs.t = false;
      regs.s = true;
      regs.intmask = 7;
      regs.x = regs.n = regs.z = regs.v = regs.c = false;
      regs.usp = 0;
      regs.isp = 0;
      regs.a[7] = AMIGA.mem.load32(addr);
      regs.pc = AMIGA.mem.load32(addr + 4);
      regs.stopped = false;

      BUG.say(sprintf('cpu.reset() addr 0x%08x, A7 0x%08x, PC 0x%08x', addr, regs.a[7], regs.pc));
   };

	/*-----------------------------------------------------------------------*/

	function szChr(z) {
		switch (z) {
			case 0: return 'S';
			case 1: return 'B';
			case 2: return 'W';
			case 4: return 'L';
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.szChr() invalid size');
            return '';
		}
	}
	
	function regsStr(v, inv) {
		var out = '';
		for (var i = 0; i < 16; i++) {
			if (v & (1 << (inv ? 15-i : i))) {
				if (i < 8) {
					out += 'D'+i+' ';
				} else {
					out += 'A'+(i-8)+' ';								
				}
			}
		}
		return out;
	}	

	function castByte(v) {
		return (v & 0x80) ? (v - 0x100) : v;
	}
	function castWord(v) {
		return (v & 0x8000) ? (v - 0x10000) : v;
	}
	function castLong(v) {
		return (v & 0x80000000) ? (v - 0x100000000) : v;
	}

	function extByteToWord(v) {
		return (v & 0x80) ? (0xff00 | v) : v;
	}
	function extByte(v) {
		return (v & 0x80) ? ((0xffffff00 | v) >>> 0) : v;
	}
	function extWord(v) {
		return (v & 0x8000) ? ((0xffff0000 | v) >>> 0) : v;
	}

	function add32(a, b) {
		var r = a + b;
		return r > 0xffffffff ? r - 0x100000000 : r;
	}
	function addAuto(a, b, z) {
		var r = a + b;
		switch (z) {
			case 1: return r > 0xff ? r - 0x100 : r;
			case 2: return r > 0xffff ? r - 0x10000 : r;
			case 4: return r > 0xffffffff ? r - 0x100000000 : r;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.addAuto() invalid size');
            return 0;
		}
	}
	function sub32(a, b) {
		var r = a - b;
		return r < 0 ? r + 0x100000000 : r;
	}
	function subAuto(a, b, z) {
		var r = a - b;
		switch (z) {
			case 1: return r < 0 ? r + 0x100 : r;
			case 2: return r < 0 ? r + 0x10000 : r;
			case 4: return r < 0 ? r + 0x100000000 : r;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.subAuto() invalid size');
            return 0;
		}
	}

	function nextOPCode() {
		var op = AMIGA.mem.load16(regs.pc);
		fault.pc = regs.pc;
		fault.op = op;
		regs.pc += 2;
		return op;
	}
	function nextIWord() {
		var r = AMIGA.mem.load16(regs.pc);
		regs.pc += 2;
		return r;
	}
	function nextILong() {
		var r = AMIGA.mem.load32(regs.pc);
		regs.pc += 4;
		return r;
	}

	//var scale = 1 << ((ext & 0x600) >> 9); if (scale != 1) alert('exII() scale '+scale);
	function exII(base) {
		var ext = nextIWord();
		if (ext & 0x100) {
			Fatal(SAEE_CPU_68020_Required, 'cpu.exII() Full extension index (not a 68000 program)');
         return 0;
      } else {
			var disp = extByte(ext & 0xff);
			var r = (ext & 0x7000) >> 12;
			var reg = (ext & 0x8000) ? regs.a[r] : regs.d[r];
			if (!(ext & 0x800)) reg = extWord(reg & 0xffff);
			return add32(add32(base, disp), reg);		
		}		
	}
	
	function exEA(ea, z) {
		var dp;

		switch (ea.m) {
			case M_rdd:
				ea.a = ea.r;
				ea.t = T_RD;
				break;
			case M_rda:
				ea.a = ea.r;
				ea.t = T_RA;
				break;
			case M_ria:
				ea.a = regs.a[ea.r];
				ea.t = T_AD;
				break;
			case M_ripo:
				ea.a = regs.a[ea.r];
				ea.t = T_AD;
				regs.a[ea.r] += z;
				if (regs.a[ea.r] > 0xffffffff) {
					BUG.say(sprintf('exEA() M_ripo A%d > 2^32 ($%x)', ea.r, regs.a[ea.r]));
					regs.a[ea.r] -= 0x100000000;
					//AMIGA.cpu.diss(fault.pc, 1);
					//AMIGA.cpu.dump();  
					//exception2(regs.a[ea.r], 0);
				}
				break;
			case M_ripr:
				regs.a[ea.r] -= z;
				if (regs.a[ea.r] < 0) {
					BUG.say(sprintf('exEA() M_ripr A%d < 0 ($%x)', ea.r, regs.a[ea.r]));
					regs.a[ea.r] += 0x100000000;
					//AMIGA.cpu.diss(fault.pc, 1);
					//AMIGA.cpu.dump();  
					//exception2(regs.a[ea.r], 0);
				}
				ea.a = regs.a[ea.r];
				ea.t = T_AD;
				break;
			case M_rid:
				dp = (nextIWord());
				ea.a = add32(regs.a[ea.r], extWord(dp));
				ea.t = T_AD;
				break;
			case M_rii:
				ea.a = exII(regs.a[ea.r]);
				ea.t = T_AD;
				break;
			case M_pcid:
				dp = extWord(nextIWord());
				ea.a = add32(regs.pc - 2, dp);
				ea.t = T_AD;
				break;
			case M_pcii:
				ea.a = exII(regs.pc);
				ea.t = T_AD;
				break;
			case M_absw:
				ea.a = extWord(nextIWord());
				ea.t = T_AD;
				break;
			case M_absl:
				ea.a = nextILong();
				ea.t = T_AD;
				break;
			case M_imm: {
				if (ea.r == -1) {
					switch (z) {
						case 1: ea.a = nextIWord() & 0xff; break;
						case 2: ea.a = nextIWord(); break;
						case 4: ea.a = nextILong(); break;
						default:
							Fatal(SAEE_CPU_Internal, 'cpu.exEA() invalid size');
					}
				} else 
					ea.a = ea.r;
				ea.t = T_IM;
				break;
			}
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.exEA() invalid mode (' + ea.m + ')');
		}
		return ea;
	}

	function exEAM(ea) { /* MOVEM */
		var dp;

		switch (ea.m) {
			case M_ria:
			case M_ripo:
			case M_ripr:
				ea.a = regs.a[ea.r];
				ea.t = T_AD;
				break;
			case M_rid:
				dp = extWord(nextIWord());
				ea.a = add32(regs.a[ea.r], dp);
				ea.t = T_AD;
				break;
			case M_rii:
				ea.a = exII(regs.a[ea.r]);
				ea.t = T_AD;
				break;
			case M_pcid:
				dp = extWord(nextIWord());
				ea.a = add32(regs.pc - 2, dp);
				ea.t = T_AD;
				break;
			case M_pcii:
				ea.a = exII(regs.pc);
				ea.t = T_AD;
				break;
			case M_absw:
				ea.a = extWord(nextIWord());
				ea.t = T_AD;
				break;
			case M_absl:
				ea.a = nextILong();
				ea.t = T_AD;
				break;
			case M_list: /* M_imm */
				ea.a = nextIWord();
				ea.t = T_IM;
				break;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.exEAM() invalid mode (' + ea.m + ')');
		}
		ea.c = 0;
		return ea;
	}

	function ldEA(ea, z) {
		switch (ea.t) {
			case T_RD: {
				switch (z) {
					case 1: return regs.d[ea.a] & 0xff;
					case 2: return regs.d[ea.a] & 0xffff;
					case 4: return regs.d[ea.a];
					default:
						Fatal(SAEE_CPU_Internal, 'cpu.ldEA() T_RD invalid size');
                  return 0;
				}
			}
			case T_RA: {			
				switch (z) {
					case 2: return regs.a[ea.a] & 0xffff;
					case 4: return regs.a[ea.a];
					default:
						Fatal(SAEE_CPU_Internal, 'cpu.ldEA() T_RA invalid size');
                  return 0;
				}
			}
			case T_AD: {
				/* The USP must not be byte-aligned */
				if (ea.m == M_ripo && ea.r == 7 && z == 1) {
					//BUG.say(sprintf('ldEA() USP ADDRESS ERROR A7 $%08x', regs.a[7]));
					regs.a[7]++;
					return AMIGA.mem.load16(regs.a[7] - 2) >> 8;
				}
				if (ea.a > 0xffffff) { //&& ea.m != M_absl) {
					//BUG.say(sprintf('ldEA() BUS ERROR, $%08x > 24bit, reducing address to $%08x', ea.a, ea.a & 0xffffff));
					ea.a &= 0xffffff;
				}
				if ((ea.a & 1) && z != 1) { 
					BUG.say(sprintf('ldEA() ADDRESS ERROR $%08x, pc $%08x', ea.a, fault.pc));
					//AMIGA.cpu.diss(fault.pc-8, 20);
					//AMIGA.cpu.dump();  
					exception3(ea.a, 1);
				}	
				switch (z) {
					case 1: return AMIGA.mem.load8(ea.a);
					case 2: return AMIGA.mem.load16(ea.a);
					case 4: return AMIGA.mem.load32(ea.a);
					default:
						Fatal(SAEE_CPU_Internal, 'cpu.ldEA() T_AD invalid size');
                  return 0;
				}
			}
			case T_IM:
				return ea.a;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.ldEA() invalid type (' + ea.t + ')');
            return 0;
		}
	}

	function stEA(ea, z, v) {
		switch (ea.t) {
			case T_RD:
				switch (z) {
					case 1: regs.d[ea.a] = ((regs.d[ea.a] & 0xffffff00) | v) >>> 0; break;
					case 2: regs.d[ea.a] = ((regs.d[ea.a] & 0xffff0000) | v) >>> 0; break;
					case 4: regs.d[ea.a] = v; break;
					default:
						Fatal(SAEE_CPU_Internal, 'cpu.stEA() invalid size');
				}
				break;
			case T_RA:
				regs.a[ea.a] = v;
				break;
			case T_AD: {
				/* The USP must not be byte-aligned */
				if (ea.m == M_ripr && ea.r == 7 && z == 1) {
					//BUG.say(sprintf('stEA() USP ADDRESS ERROR A7 $%08x', regs.a[7]));
					AMIGA.mem.store16(--regs.a[7], v << 8);
					return;
				}
				if (ea.a > 0xffffff) { //&& ea.m != M_absl) {
					//BUG.say(sprintf('stEA() BUS ERROR, $%08x > 24bit, reducing address to $%08x', ea.a, ea.a & 0xffffff));
					ea.a &= 0xffffff;
				}
				if ((ea.a & 1) && z != 1) {
					BUG.say(sprintf('stEA() ADDRESS ERROR $%08x, pc $%08x', ea.a, fault.pc));
					//AMIGA.cpu.diss(fault.pc-8, 20);
					//AMIGA.cpu.dump();  
					exception3(ea.a, 1);
				}				
				switch (z) {
					case 1: AMIGA.mem.store8(ea.a, v); break;
					case 2: AMIGA.mem.store16(ea.a, v); break;
					case 4: AMIGA.mem.store32(ea.a, v); break;
					default:
						Fatal(SAEE_CPU_Internal, 'cpu.stEA() invalid size');
				}
				break;
			}
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.stEA() invalid type (' + ea.t + ')');
		}
	}

	function ccTrue(cc) {
		switch (cc) {
			case 0: return true; //T
			case 1: return false; //F
			case 2: return !regs.c && !regs.z; //HI
			case 3: return regs.c || regs.z; //LS 
			case 4: return !regs.c; //CC
			case 5: return regs.c; //CS
			case 6: return !regs.z; //NE
			case 7: return regs.z; //EQ
			case 8: return !regs.v; //VC
			case 9: return regs.v; //VV
			case 10: return !regs.n; //PL
			case 11: return regs.n; //MI
			case 12: return regs.n == regs.v; //GE
			case 13: return regs.n != regs.v; //LT
			case 14: return !regs.z && (regs.n == regs.v); //GT
			case 15: return regs.z || (regs.n != regs.v); //LE									
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.ccTrue() invalid condition code (' + cc + ')');
            return false;
		}
	}
	
	/*switch (z) {
		case 1: if (S > 0xff || D > 0xff || R > 0xff) alert('fadd 8'); break;
		case 2: if (S > 0xffff || D > 0xffff || R > 0xffff) alert('fadd 16'); break;
	}*/
	function flgAdd(S, D, R, z, isADDX) /* ADD, ADDI, ADDQ, ADDX */
	{
		var Sm, Dm, Rm;
		
		switch (z) {
			case 1:
				Sm = (S & 0x80) != 0;
				Dm = (D & 0x80) != 0;
				Rm = (R & 0x80) != 0;
				break;
			case 2:
				Sm = (S & 0x8000) != 0;
				Dm = (D & 0x8000) != 0;
				Rm = (R & 0x8000) != 0;
				break;
			case 4:
				Sm = (S & 0x80000000) != 0;
				Dm = (D & 0x80000000) != 0;
				Rm = (R & 0x80000000) != 0;
				break;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.flgAdd() invalid size');
		}	
		regs.v = (Sm && Dm && !Rm) || (!Sm && !Dm && Rm);
		regs.c = (Sm && Dm) || (!Rm && Dm) || (Sm && !Rm);
		regs.x = regs.c;
		regs.n = Rm;
		if (isADDX) {
			if (R != 0)
				regs.z = false;
		} else
			regs.z = R == 0;
	}

	/*switch (z) {
		case 1: if (S > 0xff || D > 0xff || R > 0xff) alert('fsub 8'); break;
		case 2: if (S > 0xffff || D > 0xffff || R > 0xffff) alert('fsub 16'); break;
	}*/
	function flgSub(S, D, R, z, isSUBX) /* SUB, SUBI, SUBQ, SUBX */
	{
		var Sm, Dm, Rm;
		
		switch (z) {
			case 1:
				Sm = (S & 0x80) != 0;
				Dm = (D & 0x80) != 0;
				Rm = (R & 0x80) != 0;
				break;
			case 2:
				Sm = (S & 0x8000) != 0;
				Dm = (D & 0x8000) != 0;
				Rm = (R & 0x8000) != 0;
				break;
			case 4:
				Sm = (S & 0x80000000) != 0;
				Dm = (D & 0x80000000) != 0;
				Rm = (R & 0x80000000) != 0;
				break;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.flgSub() invalid size');
		}	
		regs.v = (!Sm && Dm && !Rm) || (Sm && !Dm && Rm);
		regs.c = (Sm && !Dm) || (Rm && !Dm) || (Sm && Rm);
		regs.x = regs.c;
		regs.n = Rm;
		if (isSUBX) {
			if (R != 0)
				regs.z = false;
		} else
			regs.z = R == 0;
	}

	/*switch (z) {
		case 1: if (S > 0xff || D > 0xff || R > 0xff) alert('fcmp 8'); break;
		case 2: if (S > 0xffff || D > 0xffff || R > 0xffff) alert('fcmp 16'); break;
	}*/
	function flgCmp(S, D, R, z) /* CMP, CMPA, CMPI, CMPM */
	{
		var Sm, Dm, Rm;
		
		switch (z) {
			case 1:
				Sm = (S & 0x80) != 0;
				Dm = (D & 0x80) != 0;
				Rm = (R & 0x80) != 0;
				break;
			case 2:
				Sm = (S & 0x8000) != 0;
				Dm = (D & 0x8000) != 0;
				Rm = (R & 0x8000) != 0;
				break;
			case 4:
				Sm = (S & 0x80000000) != 0;
				Dm = (D & 0x80000000) != 0;
				Rm = (R & 0x80000000) != 0;
				break;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.flgCmp() invalid size');
		}	
		regs.v = (!Sm && Dm && !Rm) || (Sm && !Dm && Rm);
		regs.c = (Sm && !Dm) || (Rm && !Dm) || (Sm && Rm);
		regs.n = Rm;
		regs.z = R == 0;
	}
	
	/*switch (z) {
		case 1: if (D > 0xff || R > 0xff) alert('fneg 8'); break;
		case 2: if (D > 0xffff || R > 0xffff) alert('fneg 16'); break;
	}*/
	function flgNeg(D, R, z, isNEGX) /* NEG, NEGX */
	{
		var Dm, Rm;
		
		switch (z) {
			case 1:
				Dm = (D & 0x80) != 0;
				Rm = (R & 0x80) != 0;
				break;
			case 2:
				Dm = (D & 0x8000) != 0;
				Rm = (R & 0x8000) != 0;
				break;
			case 4:
				Dm = (D & 0x80000000) != 0;
				Rm = (R & 0x80000000) != 0;
				break;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.flgNeg() invalid size');
		}	
		regs.v = Dm && Rm;
		regs.c = Dm || Rm;		
		regs.x = regs.c;
		regs.n = Rm;
		if (isNEGX) {
			if (R != 0)
				regs.z = false;
		} else
			regs.z = R == 0;
	}
	
	/*switch (z) {
		case 1: if (R > 0xff) alert('flog 8'); break;
		case 2: if (R > 0xffff) alert('flog 16'); break;
	}*/
	function flgLogical(R, z) { /* AND ANDI OR ORI EOR EORI MOVE MOVEQ EXT NOT TST */
		switch (z) {
			case 1:
				regs.n = (R & 0x80) != 0;
				break;
			case 2:
				regs.n = (R & 0x8000) != 0;
				break;
			case 4:
				regs.n = (R & 0x80000000) != 0;
				break;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.flgLogical() invalid size');
		}
		regs.z = R == 0;
		regs.v = regs.c = false;
	}
	
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/* Data Movement */

	function I_EXG(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		stEA(sea, p.z, d);
		stEA(dea, p.z, s);
		//ccna
		//BUG.say(sprintf('I_EXG.%s s $%08x <-> d $%08x', szChr(p.z), s, d));
		return p.cyc;//6;
	}
		  	
	function I_LEA(p) {
		var sea = exEA(p.s, p.z);
		var dea = exEA(p.d, p.z);
		stEA(dea, p.z, sea.a);
		//ccna
		//BUG.say(sprintf('I_LEA.%s sea $%08x', szChr(p.z), sea.a));
		return p.cyc;		
	}

	function I_PEA(p) {
		var sea = exEA(p.s, p.z);
		var dea = exEA(new EffAddr(M_ripr, 7), p.z);
		stEA(dea, p.z, sea.a);
		//ccna			
		return p.cyc;		
	}

	function I_LINK(p) {
		var sea = exEA(p.s, p.z);
		var An = sea.a;
		var dea = exEA(p.d, p.z);
		var dp = ldEA(dea, p.z); if (p.z == 2) dp = extWord(dp);

		stEA(exEA(new EffAddr(M_ripr, 7), 4), 4, regs.a[An]);
		regs.a[An] = regs.a[7];
		regs.a[7] = add32(regs.a[7], dp);
		//ccna
		return p.cyc;

		/*debug
		var newsp = add32(regs.a[7], dp);
		BUG.say(sprintf('I_LINK.%s A%d, dp $%08x, oldsp $%08x, newsp $%08x', szChr(p.z), An, dp, regs.a[7], newsp));
		regs.a[7] = newsp;*/
	}

	function I_UNLK(p) {
		var sea = exEA(p.s, p.z);
		var An = sea.a;
		regs.a[7] = regs.a[An];
		regs.a[An] = ldEA(exEA(new EffAddr(M_ripo, 7), 4), 4);
		//ccna
		//BUG.say(sprintf('I_UNLK.%s A%d', szChr(p.z), An));
		return p.cyc;
	}

	function I_MOVE(p) {
		var sea = exEA(p.s, p.z);			
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		stEA(dea, p.z, s);
		flgLogical(s, p.z);
		//BUG.say(sprintf('I_MOVE.%s sm %d dm %d sa $%08x da $%08x r $%08x', szChr(p.z), p.s.m, p.d.m, sea.a, dea.a, s));				
		return p.cyc;
	}

	function I_MOVEA(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); if (p.z == 2) s = extWord(s);
		var dea = exEA(p.d, 4);
		stEA(dea, 4, s);
		//ccna
		//BUG.say(sprintf('I_MOVEA.%s s $%08x A%d', szChr(p.z), s, p.d.r));		 			
		return p.cyc;
	}

	function I_MOVEQ(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); s = extByte(s);
		var dea = exEA(p.d, p.z);
		stEA(dea, p.z, s);
		flgLogical(s, p.z);
		//BUG.say(sprintf('I_MOVEQ.%s s $%08x', szChr(p.z), s));
		return p.cyc;
	}
         		  
	function I_MOVEM_R2M(p) {
		/* p. 4-128: The MC68000 and MC68010 write the initial register value (not decremented). */
		var i, rd = [], ra = []; 
		for (i = 0; i < 8; i++) {
			rd[i] = regs.d[i];
			ra[i] = regs.a[i];
		}
		var sea = exEAM(p.s);
		var dea = exEAM(p.d);
		var n = 0, k;

		if (p.d.m == M_ripr) {
			var c = 0;
			for (var i = 0; i < 16; i++) {
				if (sea.a & (1 << i)) c++;
			}
			c *= p.z;
			regs.a[p.d.r] -= c;
			dea.a -= c;
			k = 15;
			//BUG.say(sprintf('I_MOVEM_R2M.%s M_ripr bc %d == %d bytes', szChr(p.z), bc, bc * p.z));				
		} else k = 0;

		for (var i = 0; i < 16; i++) {
			if (sea.a & (1 << (i ^ k))) {
				var r;

				if (i < 8) {
					r = rd[i];
					//BUG.say(sprintf('I_MOVEM_R2M.%s D%d d $%08x', szChr(p.z), i, r));				
				} else {
					r = ra[i - 8];
					//BUG.say(sprintf('I_MOVEM_R2M.%s A%d d $%08x', szChr(p.z), i - 8, r));									
					//if (i - 8 == p.d.r) BUG.say(sprintf('I_MOVEM_R2M.%s A%d d $%08x, WRITE OWN', szChr(p.z), i - 8, r));									
				}
				if (p.z == 2)
					r &= 0xffff;
					
				stEA(dea, p.z, r);
				dea.a += p.z;
				n++;
			}
		}
		//ccna	
		//BUG.say(sprintf('I_MOVEM_R2M.%s s $%08x d $%08x', szChr(p.z), sea.a, dea.a));
		return [p.cyc[0] + (p.z == 2 ? 4 : 8) * n, 0,0]; //FIXME	
	}
         		  
	function I_MOVEM_M2R(p) {
		var sea = exEAM(p.s);
		var dea = exEAM(p.d);
		var n = 0;

		for (var i = 0; i < 16; i++) {
			if (sea.a & (1 << i)) {
				var r = ldEA(dea, p.z); if (p.z == 2) r = extWord(r);
				dea.a += p.z;

				if (i < 8) {
					regs.d[i] = r;
					//BUG.say(sprintf('I_MOVEM_M2R.%s D%d d $%08x', szChr(p.z), i, regs.d[i]));				
				} else {
					regs.a[i - 8] = r;
					//BUG.say(sprintf('I_MOVEM_M2R.%s A%d d $%08x', szChr(p.z), i - 8, regs.a[i - 8]));									
				}
				n++;
			}
		}
		if (p.d.m == M_ripo) {
			//BUG.say(sprintf('I_MOVEM_M2R.%s RIPO old $%08x', szChr(p.z), regs.a[p.d.r]));		
			regs.a[p.d.r] = dea.a;
			//BUG.say(sprintf('I_MOVEM_M2R.%s RIPO new $%08x', szChr(p.z), regs.a[p.d.r]));		
		}
		//ccna		
		//BUG.say(sprintf('I_MOVEM_M2R.%s s $%08x d $%08x', szChr(p.z), sea.a, dea.a));		
		return [p.cyc[0] + (p.z == 2 ? 4 : 8) * n, 0,0]; //FIXME	
	}

	function I_MOVEP(p) {
		var sea = exEA(p.s, p.z);
		var dea = exEA(p.d, p.z);

		//M2R
		if (sea.m == M_rid) {
			var r;

			if (p.z == 2) {
				r = ldEA(sea, 1) << 8;
				sea.a += 2;
				r += ldEA(sea, 1);
			} else {
				r = ldEA(sea, 1) << 24;
				sea.a += 2;
				r += ldEA(sea, 1) << 16;
				sea.a += 2;
				r += ldEA(sea, 1) << 8;
				sea.a += 2;
				r += ldEA(sea, 1);
				r >>>= 0;
			}
			//BUG.say(sprintf('I_MOVEP_M2R.%s A%d addr $%08x r $%08x', szChr(p.z), dea.a, sea.a - (p.z == 2 ? 4 : 8), r));
			stEA(dea, p.z, r);
		}
		//R2M
		else {
			var r = ldEA(sea, p.z);

			if (p.z == 2) {
				stEA(dea, 1, r >> 8);
				dea.a += 2;
				stEA(dea, 1, r);
			} else {
				stEA(dea, 1, r >> 24);
				dea.a += 2;
				stEA(dea, 1, r >> 16);
				dea.a += 2;
				stEA(dea, 1, r >> 8);
				dea.a += 2;
				stEA(dea, 1, r);
			}
			//BUG.say(sprintf('I_MOVEP_R2M.%s A%d addr $%08x r $%08x', szChr(p.z), sea.a, dea.a - (p.z == 2 ? 4 : 8), r));
		}
		//ccna		
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Integer Arithmetic */
	
	function I_ADD(p) {
		var sea = exEA(p.s, p.z); 
		var s = ldEA(sea, p.z); 
		var dea = exEA(p.d, p.z); 
		var d = ldEA(dea, p.z);
		var r = addAuto(s, d, p.z);
		stEA(dea, p.z, r);
		flgAdd(s, d, r, p.z, false);
		//BUG.say(sprintf('I_ADD.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));	
		return p.cyc;	  
	}

	function I_ADDA(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); if (p.z == 2) s = extWord(s);
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4);
		var r = add32(s, d);
		stEA(dea, 4, r);
		//ccna
		//BUG.say(sprintf('I_ADDA.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));	
		return p.cyc;	  
	}

	function I_ADDI(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = addAuto(s, d, p.z);
		stEA(dea, p.z, r);
		flgAdd(s, d, r, p.z, false);
		//BUG.say(sprintf('I_ADDI.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));	
		return p.cyc;  
	}

	/*function I_ADDQ(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		if (p.d.m == M_rda) {
			var dea = exEA(p.d, 4);
			var d = ldEA(dea, 4); 
			var r = add32(s, d);
			stEA(dea, 4, r);
			//ccna
			//return 8;  			
		} else {
			var dea = exEA(p.d, p.z);
			var d = ldEA(dea, p.z);
			var r = addAuto(s, d, p.z);
			stEA(dea, p.z, r);
			flgAdd(s, d, r, p.z, false);
			//return dea.m == M_rdd ? (p.z == 4 ? 8 : 4) : (p.z == 4 ? 12 : 8) + dea.c;  
		}
		//BUG.say(sprintf('I_ADDQ.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;
	}*/

	function I_ADDQ(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = addAuto(s, d, p.z);
		stEA(dea, p.z, r);
		flgAdd(s, d, r, p.z, false); 
		//BUG.say(sprintf('I_ADDQ.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;
	}
	function I_ADDQA(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4); 
		var r = add32(s, d);
		stEA(dea, 4, r);
		//ccna	
		//BUG.say(sprintf('I_ADDQA.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;
	}

	function I_ADDX(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); 
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z); 
		var r = addAuto(s, d, p.z); if (regs.x) r = addAuto(r, 1, p.z);
		//var _x = regs.x?1:0;		
		stEA(dea, p.z, r);
		flgAdd(s, d, r, p.z, true);
		//BUG.say(sprintf('I_ADDX.%s s $%08x d $%08x xo %d xn %d r $%08x', szChr(p.z), s, d, _x, regs.x?1:0, r));
		return p.cyc;
	}

	function I_CLR(p) {
		var dea = exEA(p.d, p.z);
		//var foo = ldEA(dea, p.z); /* In the MC68000 and MC68008 a memory location is read before it is cleared. */
		stEA(dea, p.z, 0);

		regs.n = false;
		regs.z = true;
		regs.v = false;
		regs.c = false;
		//BUG.say(sprintf('I_CLR.%s', szChr(p.z)));
		return p.cyc;
	}

	function I_CMP(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(d, s, p.z);
		flgCmp(s, d, r, p.z);
		//BUG.say(sprintf('I_CMP.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));
		return p.cyc;	  
	}

	function I_CMPA(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); if (p.z == 2) s = extWord(s);
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4);
		var r = sub32(d, s);
		flgCmp(s, d, r, 4);
		//BUG.say(sprintf('I_CMPA.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));
		return p.cyc;	  
	}

	function I_CMPI(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(d, s, p.z);
		flgCmp(s, d, r, p.z);
		//BUG.say(sprintf('I_CMPI.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));
		return p.cyc;
	}

	function I_CMPM(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(d, s, p.z);
		flgCmp(s, d, r, p.z);
		//BUG.say(sprintf('I_CMPM.%s s $%08x d $%08x r $%08x | %c', szChr(p.z), s, d, r, s));
		return p.cyc;
	}

	function I_DIVS(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); s = castWord(s);
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4); d = castLong(d);

		regs.c = false;
		if (s == 0) {
			BUG.say(sprintf('I_DIVS NULL $%08x / $%08x', d, s));			
			regs.pc = fault.pc;
			return exception(5);
		} else {
			var quo = ~~(d / s);

			if (quo < 0) quo += 0x10000;

			if (quo < 0 || quo > 0xffff) {
				regs.v = true;
				//BUG.say(sprintf('I_DIVS.%s $%08x / $%08x = OVERFLOW (quo $%08x | rem $%08x)', szChr(p.z), d, s, quo, rem));			
			} else {
				var rem = d % s;

				if (rem && ((rem < 0) != (d < 0))) rem = -rem;
				if (rem < 0) rem += 0x10000;

				regs.v = false;
				regs.z = quo == 0;
				regs.n = (quo & 0x8000) != 0;

				var r = ((rem << 16) | quo) >>> 0;
				stEA(dea, 4, r);
				//BUG.say(sprintf('I_DIVS.%s $%08x / $%08x = $%08x (quo $%08x | rem $%08x)', szChr(p.z), d, s, r, quo, rem));			
			}
			return p.cyc;
		}
	}

	function I_DIVU(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4);

		regs.c = false;
		if (s == 0) {
			BUG.say(sprintf('I_DIVU NULL $%08x / $%08x', d, s));			
			regs.pc = fault.pc;
			return exception(5);
		} else {
			var quo = Math.floor(d / s);

			if (quo > 0xffff) {
				regs.v = true;
				//BUG.say(sprintf('I_DIVU.%s $%08x / $%08x = OVERFLOW (quo $%08x | rem $%08x)', szChr(p.z), d, s, quo, rem));			
			} else {
				var rem = d % s;

				if (rem && (!!(rem & 0x8000) != !!(d & 0x80000000))) {
					//var oldrem = rem;
					rem = -rem + 0x10000;	
					//BUG.say(sprintf('I_DIVU d $%08x oldrem $%08x rem $%08x', d, oldrem, rem)); 
            }
				regs.v = false;
				regs.z = quo == 0;
				regs.n = (quo & 0x8000) != 0;

				var r = ((rem << 16) | quo) >>> 0;
				stEA(dea, 4, r);
				//BUG.say(sprintf('I_DIVU.%s $%08x / $%08x = $%08x (quo $%08x | rem $%08x)', szChr(p.z), d, s, r, quo, rem));			
			}
			return p.cyc;
		}
	}

	function I_EXT(p) {
		var z = p.z == 2 ? 1 : 2;
		var dea = exEA(p.d, z);
		var d = ldEA(dea, z);
		var r = p.z == 2 ? extByteToWord(d) : extWord(d);
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_EXT.%s d $%08x r $%08x', szChr(p.z), d, r));
		return p.cyc;
	}

	function I_MULS(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); s = castWord(s);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z); d = castWord(d);
		var r = s * d;
		if (r < 0) r += 0x100000000;
		stEA(dea, 4, r);

		regs.v = false; /* not possible for 16x16 */
		regs.c = false;
		regs.n = (r & 0x80000000) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_MULS.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));
		return p.cyc;
	}

	function I_MULU(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = s * d;
		stEA(dea, 4, r);

		regs.v = false; /* not possible for 16x16 */
		regs.c = false;
		regs.n = (r & 0x80000000) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_MULU.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));
		return p.cyc;
	}

	function I_NEG(p) {
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(0, d, p.z);
		stEA(dea, p.z, r);
		flgNeg(d, r, p.z, false);
		//BUG.say(sprintf('I_NEG.%s d $%08x r $%08x', szChr(p.z), d, r));
		return p.cyc;
	}
   
	function I_NEGX(p) {
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(0, d, p.z); if (regs.x) r = subAuto(r, 1, p.z);
		stEA(dea, p.z, r);
		flgNeg(d, r, p.z, true);
		//BUG.say(sprintf('I_NEGX.%s d $%08x x %d r $%08x', szChr(p.z), d, regs.x ? 1 : 0, r));
		return p.cyc;  
	}

	function I_SUB(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(d, s, p.z);
		stEA(dea, p.z, r);
		flgSub(s, d, r, p.z, false);
		//BUG.say(sprintf('I_SUB.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));				
		return p.cyc;	  
	}

	function I_SUBA(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); if (p.z == 2) s = extWord(s);
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4);
		var r = sub32(d, s);
		stEA(dea, 4, r);
		//ccna		
		//BUG.say(sprintf('I_SUBA.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;	  
	}

	function I_SUBI(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(d, s, p.z);
		stEA(dea, p.z, r);
		flgSub(s, d, r, p.z, false);
		//BUG.say(sprintf('I_SUBI.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));				
		return p.cyc;
	}

	/*function I_SUBQ(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		if (p.d.m == M_rda) {
			var dea = exEA(p.d, 4);
			var d = ldEA(dea, 4);
			var r = sub32(d, s);
			stEA(dea, 4, r);		
			//ccna
			//return 8;  
		} else {
			var dea = exEA(p.d, p.z);
			var d = ldEA(dea, p.z);
			var r = subAuto(d, s, p.z);
			stEA(dea, p.z, r);		
			flgSub(s, d, r, p.z, false);
			//return dea.m == M_rdd ? (p.z == 4 ? 8 : 4) : (p.z == 4 ? 12 : 8) + dea.c;  
		}	
		//BUG.say(sprintf('I_SUBQ.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;
	}*/
	
	function I_SUBQ(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(d, s, p.z);
		stEA(dea, p.z, r);		
		flgSub(s, d, r, p.z, false);
		//BUG.say(sprintf('I_SUBQ.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;
	}
	function I_SUBQA(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4);
		var r = sub32(d, s);
		stEA(dea, 4, r);		
		//ccna
		//BUG.say(sprintf('I_SUBQA.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;
	}

	function I_SUBX(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(d, s, p.z); if (regs.x) r = subAuto(r, 1, p.z);
		//var _x = regs.x?1:0;		
		stEA(dea, p.z, r);
		flgSub(s, d, r, p.z, true);
		//BUG.say(sprintf('I_SUBX.%s s $%08x d $%08x xo %d xn %d r $%08x', szChr(p.z), s, d, _x, regs.x?1:0, r));
		return p.cyc;
	}
		
	/*-----------------------------------------------------------------------*/
	/* Logical */

	function I_AND(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = (s & d) >>> 0;
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_AND.%s s $%08x d $%08x r $%08x, cyc %d', szChr(p.z), s, d, r, p.cyc));		
		return p.cyc;	  
	}

	function I_ANDI(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = (s & d) >>> 0;
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_ANDI.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));			
		return p.cyc; 
	}

	function I_EOR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = (s ^ d) >>> 0;
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_EOR.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;	  
	}

	function I_EORI(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = (s ^ d) >>> 0;
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_EORI.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc; 
	}

	function I_NOT(p) {
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var m = p.z == 1 ? 0xff : (p.z == 2 ? 0xffff : 0xffffffff);
		var r = ~d & m; if (r < 0) r += 0x100000000;
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_NOT.%s d $%08x r $%08x', szChr(p.z), d, r));
		return p.cyc;
	}
		  
	function I_OR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = (s | d) >>> 0;
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_OR.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;	  
	}

	function I_ORI(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = (s | d) >>> 0;
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_ORI.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Shift and Rotate */

	function I_ASL(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;
		var v = false;
		var rm = r & p.ms;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & p.ms) != 0;
				r <<= 1;
				r = (r & p.mz) >>> 0;
				if (!v && (r & p.ms) != rm) v = true;
			}
			stEA(dea, p.z, r);
			regs.c = regs.x = c;
		} else regs.c = false;

		regs.v = v;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_ASL.%s num %d d $%08x r $%08x', szChr(p.z), s, d, r));			
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}
	
	function I_ASR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;
		var sign = (r & p.ms) ? p.ms : 0;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & 1) != 0;
				r = (sign | (r >>> 1)) >>> 0;
			}
			stEA(dea, p.z, r);
			regs.c = regs.x = c;
		} else regs.c = false;

		regs.v = false;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_ASR.%s num %d d $%08x r $%08x sign %d', szChr(p.z), s, d, r, sign));		
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}

	function I_LSL(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & p.ms) != 0;
				r <<= 1;
				r = (r & p.mz) >>> 0;
			}
			stEA(dea, p.z, r);
			regs.c = regs.x = c;
		} else regs.c = false;

		regs.v = false;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_LSL.%s num %d d $%08x r $%08x', szChr(p.z), s, d, r));		
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}

	function I_LSR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & 1) != 0;
				r >>>= 1;
			}
			stEA(dea, p.z, r);
			regs.c = regs.x = c;
		} else regs.c = false;

		regs.v = false;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_LSR.%s num %d d $%08x r $%08x', szChr(p.z), s, d, r));		
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}

	function I_ROL(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & p.ms) != 0;
				r <<= 1;
				r = (r & p.mz) >>> 0;
				if (c) r = (r | 1) >>> 0;
			}
			stEA(dea, p.z, r);
			regs.c = c;
		} else regs.c = false;

		regs.v = false;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_ROL.%s num %d d $%08x r $%08x', szChr(p.z), s, d, r));		
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}

	function I_ROR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & 1) != 0;
				r >>>= 1;
				if (c) r = (p.ms | r) >>> 0;
			}
			stEA(dea, p.z, r);
			regs.c = c;
		} else regs.c = false;

		regs.v = false;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_ROR.%s num %d d $%08x r $%08x', szChr(p.z), s, d, r));		
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}

	function I_ROXL(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;
		var x = regs.x; //var _x = x?1:0;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & p.ms) != 0;
				r <<= 1;
				r = (r & p.mz) >>> 0;
				if (x) r = (r | 1) >>> 0;
				x = c;
			}
			stEA(dea, p.z, r);
			regs.c = regs.x = c;
		} else regs.c = regs.x;

		regs.v = false;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_ROXL.%s num %d d $%08x ox %d nx %d r $%08x', szChr(p.z), s, d, _x, regs.x?1:0, r));		
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}

	function I_ROXR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;
		var x = regs.x; //var _x = x?1:0;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & 1) != 0;
				r >>>= 1;
				if (x) r = (p.ms | r) >>> 0;
				x = c;
			}
			stEA(dea, p.z, r);
			regs.c = regs.x = c;
		} else regs.c = regs.x;

		regs.v = false;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_ROXR.%s num %d d $%08x ox %d nx %d r $%08x', szChr(p.z), s, d, _x, regs.x?1:0, r));		
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}

	function I_SWAP(p) {
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4);
		var r = ((d << 16) | (d >>> 16)) >>> 0;
		stEA(dea, 4, r);

		regs.n = (r & 0x80000000) != 0;
		regs.z = r == 0;
		regs.v = false;
		regs.c = false;
		//BUG.say(sprintf('I_SWAP.%s d $%08x r $%08x', szChr(p.z), d, r));								
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Bit Manipulation */

	function I_BCHG(p) {
		var dz = p.d.m == M_rdd ? 4 : 1;
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, dz);
		var d = ldEA(dea, dz);
		var m = (1 << (s % (p.d.m == M_rdd ? 32 : 8))) >>> 0;

		var r = ((d & m) ? (d & ~m) : (d | m)) >>> 0;
		stEA(dea, dz, r);
		regs.z = (d & m) == 0;

		/*if (p.d.m == M_rdd)			
			BUG.say(sprintf('I_BCHG.%s s $%08x == m $%08x, d $%08x, r $%08x', szChr(p.z), s, m, d, r));
		else
			BUG.say(sprintf('I_BCHG.%s s $%02x == m $%02x, d $%02x, r $%02x', szChr(p.z), s, m, d, r));*/
			
		return p.cyc;
	}

	function I_BCLR(p) {
		var dz = p.d.m == M_rdd ? 4 : 1;
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, dz);
		var d = ldEA(dea, dz);
		var m = (1 << (s % (p.d.m == M_rdd ? 32 : 8))) >>> 0;

		var r = (d & ~m) >>> 0;
		stEA(dea, dz, r);
		regs.z = (d & m) == 0;

		/*if (p.d.m == M_rdd)			
			BUG.say(sprintf('I_BCLR.%s s $%08x == m $%08x, d $%08x, r $%08x', szChr(p.z), s, m, d, r));
		else
			BUG.say(sprintf('I_BCLR.%s s $%02x == m $%02x, d $%02x, r $%02x', szChr(p.z), s, m, d, r));*/
		return p.cyc;
	}

	function I_BSET(p) {
		var dz = p.d.m == M_rdd ? 4 : 1;
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, dz);
		var d = ldEA(dea, dz);
		var m = (1 << (s % (p.d.m == M_rdd ? 32 : 8))) >>> 0;

		var r = (d | m) >>> 0;
		stEA(dea, dz, r);
		regs.z = (d & m) == 0;

		/*if (p.d.m == M_rdd)			
			BUG.say(sprintf('I_BSET.%s s $%08x == m $%08x, d $%08x, r $%08x', szChr(p.z), s, m, d, r));
		else
			BUG.say(sprintf('I_BSET.%s s $%02x == m $%02x, d $%02x, r $%02x', szChr(p.z), s, m, d, r));*/
		return p.cyc;
	}

	function I_BTST(p) {
		var dz = p.d.m == M_rdd ? 4 : 1;
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, dz);
		var d = ldEA(dea, dz);
		var m = (1 << (s % (p.d.m == M_rdd ? 32 : 8))) >>> 0;

		regs.z = (d & m) == 0;
		
		/*if (p.d.m == M_rdd)			
			BUG.say(sprintf('I_BTST.%s s $%08x == m $%08x, d $%08x, r $%08x', szChr(p.z), s, m, d, r));
		else
			BUG.say(sprintf('I_BTST.%s s $%02x == m $%02x, d $%02x, r $%02x', szChr(p.z), s, m, d, r));*/
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Binary-Coded Decimal */

	function I_ABCD(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var x = regs.x ? 1 : 0;
		var c = false;

		var s_h = (s >> 4) & 0xf;
		var s_l = s & 0xf;
		var d_h = (d >> 4) & 0xf;
		var d_l = d & 0xf;

		var l = s_l + d_l + x;
		if (l > 9) {
			l -= 10;
			c = true;
		}
		var h = s_h + d_h + (c ? 1 : 0);
		c = false;
		if (h > 9) {
			h -= 10;
			c = true;
		}
		var r = (h << 4) | l;

		stEA(dea, p.z, r);

		regs.x = regs.c = c;
		if (r) regs.z = false;
		if (undef) {
			regs.n = !regs.n; //undef
			regs.v = !regs.v; //undef
		}
		//BUG.say(sprintf('I_ABCD.%s s $%02x d $%02x x %d | s_h %d s_l %d d_h %d d_l %d | r $%02x c %d', szChr(p.z), s, d, x, s_h, s_l, d_h, d_l, r, c?1:0));
		return p.cyc;
	}

	function I_NBCD(p) {
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var c = false;

		var d_h = (d >> 4) & 0xf;
		var d_l = d & 0xf;

		var l = 0 - d_l;
		if (l < 0) {
			l += 10;
			c = true;
		}
		var h = 0 - d_h - (c ? 1 : 0);
		c = false;
		if (h < 0) {
			h += 10;
			c = true;
		}
		var r = (h << 4) | l;

		stEA(dea, p.z, r);

		regs.x = regs.c = c;
		if (r) regs.z = false;
		if (undef) {
			regs.n = !regs.n; //undef
			regs.v = !regs.v; //undef
		}
		//BUG.say(sprintf('I_NBCD.%s s $%02x d $%02x x %d | s_h %d s_l %d d_h %d d_l %d | r $%02x c %d', szChr(p.z), s, d, x, s_h, s_l, d_h, d_l, r, c?1:0));
		return p.cyc;
	}

	function I_SBCD(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var x = regs.x ? 1 : 0;
		var c = false;

		var s_h = (s >> 4) & 0xf;
		var s_l = s & 0xf;
		var d_h = (d >> 4) & 0xf;
		var d_l = d & 0xf;

		var l = d_l - s_l - x;
		if (l < 0) {
			l += 10;
			c = true;
		}
		var h = d_h - s_h - (c ? 1 : 0);
		c = false;
		if (h < 0) {
			h += 10;
			c = true;
		}
		var r = (h << 4) | l;

		stEA(dea, p.z, r);

		regs.x = regs.c = c;
		if (r) regs.z = false;
		if (undef) {
			regs.n = !regs.n; //undef
			regs.v = !regs.v; //undef
		}
		//BUG.say(sprintf('I_SBCD.%s s $%02x d $%02x x %d | s_h %d s_l %d d_h %d d_l %d | r $%02x c %d', szChr(p.z), s, d, x, s_h, s_l, d_h, d_l, r, c?1:0));
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Program Control */

	function I_Bcc(p) {
		var cc = p.c.cc;
		var dp = p.c.dp;
		var dp16;
		var pc;

		if (dp == 0) dp16 = nextIWord();
		//else if (dp == 255) Fatal(SAEE_CPU_68020_Required, 'cpu.I_Bcc() Full extension index detected (not a 68000 programm)');

		if (ccTrue(cc)) {
			if (dp == 0) pc = add32(regs.pc - 2, extWord(dp16));
			else pc = add32(regs.pc, extByte(dp));
			//BUG.say(sprintf('I_Bcc pc $%08x', pc));		
			setPC(pc);
			return p.cycTaken;
		}
		//ccna
		return p.cyc;
	}
			
	function I_DBcc(p) {
		var cc = p.c.cc;
		var dp = nextIWord();
		var cyc;

		if (!ccTrue(cc)) {
			var ea = exEA(new EffAddr(M_rdd, p.c.dr), p.z);
			var dr = ldEA(ea, p.z);
			
			if (dr--) {
				var pc = add32(regs.pc - 2, extWord(dp));
				setPC(pc);
				cyc = p.cycFalseTaken;
			} else {
				dr = 0xffff;
				cyc = p.cycFalse;
			}
			stEA(ea, p.z, dr);
		} else cyc = p.cycTrue;
		//ccna
		return cyc; 
	}

	function I_Scc(p) {
		//var cc = p.s.r;
		var cc = p.c.cc;
		var dea = exEA(p.d, p.z);
		//var foo = ldEA(dea, p.z); /* In the MC68000 and MC68008 a memory location is read before it is cleared. */
		var isTrue = ccTrue(cc);
		stEA(dea, p.z, isTrue ? 0xff : 0);
		//ccna
		//BUG.say(sprintf('I_S%s, cc %d, ccTrue %d, cyc %d', ccNames[cc], cc, ccTrue(cc)?1:0, isTrue ? p.cycTrue : p.cycFalse));		
		return isTrue ? p.cycTrue : p.cycFalse;
	}

	function I_BRA(p) {
		var dp = p.c.dp;
		var pc;

		if (dp == 0) {
			dp = extWord(nextIWord());
			pc = add32(regs.pc - 2, dp);
		}
		//else if (dp == 255) Fatal(SAEE_CPU_68020_Required, 'cpu.I_BRA() Full extension index detected (not a 68000 programm)');
		else pc = add32(regs.pc, extByte(dp));

		setPC(pc);
		//ccna
		return p.cycTaken; 
	}

	function I_BSR(p) {
		var dp = p.c.dp;
		var pc;

		if (dp == 0) {
			dp = extWord(nextIWord());
			pc = add32(regs.pc - 2, dp);
		}
		//else if (dp == 255) Fatal(SAEE_CPU_68020_Required, 'cpu.I_BSR() Full extension index detected (not a 68000 programm)');
		else pc = add32(regs.pc, extByte(dp));

		stEA(exEA(new EffAddr(M_ripr, 7), 4), 4, regs.pc);
		setPC(pc);
		//ccna
		return p.cycTaken; 
	}

	function I_JMP(p) {
		var dea = exEA(p.d, p.z);	
		setPC(dea.a);
		//ccna		
		//BUG.say(sprintf('I_JMP $%08x', dea.a));		
		return p.cyc;
	}

	function I_JSR(p) {
		var dea = exEA(p.d, p.z);
		stEA(exEA(new EffAddr(M_ripr, 7), 4), 4, regs.pc);
		setPC(dea.a);
		//ccna		
		//BUG.say(sprintf('I_JSR $%08x', dea.a));			
		return p.cyc;
	}

	function I_RTR(p) {
		var ccr = ldEA(exEA(new EffAddr(M_ripo, 7), 2), 2) & 0xff;
		var pc = ldEA(exEA(new EffAddr(M_ripo, 7), 4), 4);
		setCCR(ccr);
		setPC(pc);
		//BUG.say(sprintf('I_RTR crr $%04x pc $%08x', crr, pc));		
		return p.cyc;
	}

	function I_RTS(p) {
		var pc = ldEA(exEA(new EffAddr(M_ripo, 7), 4), 4);
		//BUG.say(sprintf('I_RTS() regs.pc $%08x newpc $%08x', regs.pc, pc));	
		setPC(pc);
		//ccna                                  
		return p.cyc;
	}

	function I_TST(p) {
		var dea = exEA(p.d, p.z);
		var r = ldEA(dea, p.z); //r = extAuto(r, p.z);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_TST.%s r $%08x', szChr(p.z), r));
		return p.cyc;
	}

	function I_NOP(p) {
		//BUG.say('I_NOP');	
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* System Control - CCR */

	function I_ANDI_CCR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var d = getCCR();
		var r = s & d;
		setCCR(r);
		//BUG.say(sprintf('I_ANDI_CCR.%s val $%02x, old $%02x new $%02x', szChr(p.z), s, d, r));				
		return p.cyc;
	}

	function I_EORI_CCR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var d = getCCR();
		var r = s ^ d;
		setCCR(r);
		//BUG.say(sprintf('I_EORI_CCR.%s val $%02x, old $%02x new $%02x', szChr(p.z), s, d, r));		
		return p.cyc;
	}

	function I_ORI_CCR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var d = getCCR();
		var r = s | d;
		setCCR(r);
		//BUG.say(sprintf('I_ORI_CCR.%s val $%02x, old $%02x new $%02x', szChr(p.z), s, d, r));				
		return p.cyc;
	}

	function I_MOVE_2CCR(p) {
		var sea = exEA(p.s, p.z);
		var ccr = ldEA(sea, p.z) & 0xff;
		//BUG.say(sprintf('I_MOVE_2CCR.%s old $%02x new $%02x', szChr(p.z), getCCR(), ccr));		
		setCCR(ccr);
		return p.cyc;
	}

	/*function I_MOVE_CCR2(p) { //ups, not for the 68000
		var ccr = getCCR();
		var dea = exEA(p.d, p.z);
		stEA(dea, p.z, ccr);  	
		//ccna	
		//BUG.say(sprintf('I_MOVE_CCR2.%s $%02x', szChr(p.z), ccr));		
		return p.cyc;
	}*/

	/*-----------------------------------------------------------------------*/
	/* System Control - SR */

	function I_ANDI_SR(p) {
		if (regs.s) {
			var sea = exEA(p.s, p.z);
			var s = ldEA(sea, p.z);
			var d = getSR();
			var r = s & d;
			//BUG.say(sprintf('I_ANDI_SR.%s val $%02x, old $%02x new $%02x', szChr(p.z), s, d, r));				
			setSR(r);
			return p.cyc;
		} else {
			//BUG.say('I_ANDI_SR PRIVILIG VIOLATION');
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_EORI_SR(p) {
		if (regs.s) {
			var sea = exEA(p.s, p.z);
			var s = ldEA(sea, p.z);
			var d = getSR();
			var r = s ^ d;
			//BUG.say(sprintf('I_EORI_SR.%s val $%02x, old $%02x new $%02x', szChr(p.z), s, d, r));		
			setSR(r);
			return p.cyc;
		} else {
			//BUG.say('I_EORI_SR PRIVILIG VIOLATION');
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_ORI_SR(p) {
		if (regs.s) {
			var sea = exEA(p.s, p.z);
			var s = ldEA(sea, p.z);
			var d = getSR();
			var r = s | d;
			//BUG.say(sprintf('I_ORI_SR.%s val $%02x, old $%02x new $%02x', szChr(p.z), s, d, r));				
			setSR(r);
			return p.cyc;
		} else {
			//BUG.say('I_ORI_SR PRIVILIG VIOLATION');
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_MOVE_2SR(p) {
		if (regs.s) {
			var sea = exEA(p.s, p.z);
			var sr = ldEA(sea, p.z);
			//BUG.say(sprintf('I_MOVE_2SR.%s sr $%04x', szChr(p.z), sr));		 			
			setSR(sr);
			return p.cyc;
		} else {
			//BUG.say('I_MOVE_2SR PRIVILIG VIOLATION');						
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_MOVE_SR2(p) {
		var sr = getSR();
		var dea = exEA(p.d, p.z);
		//var foo = ldEA(dea, p.z); /* Memory destination is read before it is written to. */
		stEA(dea, p.z, sr);
		//ccna	
		//BUG.say(sprintf('I_MOVE_SR2.%s sr $%04x', szChr(p.z), sr));		 			
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* System Control - USP */

	function I_MOVE_USP2A(p) {
		if (regs.s) {
			var dea = exEA(p.d, p.z);
			stEA(dea, p.z, regs.usp);
			return p.cyc;
		} else {
			//BUG.say('I_MOVE_USP PRIVILIG VIOLATION');						
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_MOVE_A2USP(p) {
		if (regs.s) {
			var sea = exEA(p.s, p.z);
			regs.usp = ldEA(sea, p.z);
			return p.cyc;
		} else {
			//BUG.say('I_MOVE_USP PRIVILIG VIOLATION');						
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	/*-----------------------------------------------------------------------*/
	/* System Control */

	function I_CHK(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);

		//BUG.say(sprintf('I_CHK.%s s $%08x d $%08x (d>s||d<0)', szChr(p.z), s, d));

		if (undef) {
			regs.z = !regs.z; //undef
			regs.v = !regs.v; //undef
			regs.c = !regs.c; //undef
		}
		if (d > s) {
			regs.n = false;
			regs.pc = fault.pc;
			return exception(6) + p.cycTaken;
		} else if (d & 0x8000) { /* 68000 word only */
			regs.n = true;
			regs.pc = fault.pc;
			return exception(6) + p.cycTaken;
		}
		return p.cyc;
	}

	function I_ILLEGAL(p) {
		var op = fault.op;
		var pc = fault.pc;

		if (op == 0x4E7B && AMIGA.mem.load32(0x10) == 0 && (pc & 0xf80000) == 0xf80000)
			Fatal(SAEE_CPU_68020_Required, 'Your Kickstart requires a 68020');

		if ((op & 0xf000) == 0xf000) {
			BUG.say(sprintf('I_ILLEGAL exception 11, line F[1111] emulator, op $%04x, pc $%08x', op, pc));
			//AMIGA.cpu.diss(fault.pc - 8, 20);
			//AMIGA.cpu.dump();
			regs.pc = fault.pc;
			return exception(11);
		} else if ((op & 0xf000) == 0xa000) {
			BUG.say(sprintf('I_ILLEGAL exception 10, line A[1010] emulator, op $%04x, pc $%08x', op, pc));
			//AMIGA.cpu.diss(fault.pc - 8, 20);
			//AMIGA.cpu.dump();
			regs.pc = fault.pc;
			return exception(10);
		}

		BUG.say(sprintf('I_ILLEGAL exception 4, op $%04x, pc $%08x', op, pc));
		//AMIGA.cpu.diss(fault.pc - 8, 20);
		//AMIGA.cpu.dump();
		regs.pc = fault.pc;
		return exception(4);
		//ccna
	}

	function I_RESET(p) {
		if (regs.s) {
			BUG.say('I_RESET()');
			AMIGA.reset();
			return p.cyc;
		} else {
			//BUG.say('I_RESET PRIVILIG VIOLATION');
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_RTE(p) {
		if (regs.s) {
			var sr = ldEA(exEA(new EffAddr(M_ripo, 7), 2), 2);
			var pc = ldEA(exEA(new EffAddr(M_ripo, 7), 4), 4);
			setSR(sr);
			//BUG.say(sprintf('I_RTE sr $%04x newpc $%08x oldpc $%08x', sr, pc, regs.pc));		
			setPC(pc);
			return p.cyc;
		} else {
			//BUG.say('I_RTE PRIVILEG VIOLATION');		
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_STOP(p) {
		if (regs.s) {
			var sea = exEA(p.s, p.z);
			var sr = ldEA(sea, p.z);
			setSR(sr);

			regs.stopped = true;
			if ((AMIGA.spcflags & SPCFLAG_DOTRACE) == 0)
				set_special(SPCFLAG_STOP);
			
			//BUG.say(sprintf('I_STOP() new sr $%04x', regs.sr));
			return p.cyc;
		} else {
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_TRAP(p) {
		var dea = exEA(p.d, p.z);
		var vec = ldEA(dea, p.z);
		//BUG.say(sprintf('I_TRAP exception 32 + %d', vec));										
		return exception(32 + vec);
		//ccna
	}

	function I_TRAPV(p) {
		if (regs.v) {
			BUG.say('I_TRAPV exception 7');
			return exception(7);
		}
		//ccna
		return p.cyc;
	}

	function I_TAS(p) {
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = 0x80 | d;
		stEA(dea, p.z, r);
		regs.n = (d & 0x80) != 0;
		regs.z = d == 0;
		regs.v = false;
		regs.c = false;		
		BUG.say(sprintf('I_TAS.%s d $%02x r $%02x', szChr(p.z), d, r));	
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	
	function mkCyc(z, m) {
		/*switch (m) {
			case M_rdd:
			case M_rda: return 0;	
			case M_ria: return z == 4 ? 8 : 4;
			case M_ripo: return z == 4 ? 8 : 4;
			case M_ripr: return z == 4 ? 10 : 6;
			case M_rid: return z == 4 ? 12 : 8;
			case M_rii: return z == 4 ? 14 : 10;
			case M_pcid: return z == 4 ? 12 : 8;
			case M_pcii: return z == 4 ? 14 : 10;
			case M_absw: return z == 4 ? 12 : 8;
			case M_absl: return z == 4 ? 16 : 12;
			case M_imm:
			case M_list: return z == 4 ? 8 : 4;
		}*/		
		switch (m) {
			case M_rdd:
			case M_rda:  return z == 4 ? [ 0,0,0] : [ 0,0,0]; 
			case M_ria:  return z == 4 ? [ 8,2,0] : [ 4,1,0]; 
			case M_ripo: return z == 4 ? [ 8,2,0] : [ 4,1,0];
			case M_ripr: return z == 4 ? [10,2,0] : [ 6,1,0];
			case M_rid:  return z == 4 ? [12,3,0] : [ 8,2,0]; 
			case M_rii:  return z == 4 ? [14,3,0] : [10,2,0]; 
			case M_pcid: return z == 4 ? [12,3,0] : [ 8,2,0];
			case M_pcii: return z == 4 ? [14,3,0] : [10,2,0];
			case M_absw: return z == 4 ? [12,3,0] : [ 8,2,0];
			case M_absl: return z == 4 ? [16,4,0] : [12,3,0];
			case M_imm:
			case M_list: return z == 4 ? [ 8,2,0] : [ 4,1,0];
         default: return [0,0,0];
		}
	}

	function mkN(op, mn, cyc) {
		var i = new IDef();
		i.op = op;
		i.pr = false;
		i.mn = mn;
		i.f = null;
		i.p = {};
		i.p.cyc = cyc;
		return i;
	}

	function mkS(op, mn, z, s, r, cyc, add) {
		var i = new IDef();
		i.op = op;
		i.pr = false;
		i.mn = mn;
		i.f = null;
		i.p = {};
		i.p.z = z;
		i.p.s = new EffAddr(s, r);
		i.p.s.c = mkCyc(z, s);
		i.p.cyc = cyc;
		if (add) i.p.cyc[0] += i.p.s.c[0];
		i.p.cyc[1] += i.p.s.c[1];
		i.p.cyc[2] += i.p.s.c[2];
		return i;
	}

	function mkD(op, mn, z, d, r, cyc, add) {
		var i = new IDef();
		i.op = op;
		i.pr = false;
		i.mn = mn;
		i.f = null;
		i.p = {};
		i.p.z = z;
		i.p.d = new EffAddr(d, r);
		i.p.d.c = mkCyc(z, d);
		i.p.cyc = cyc;
		if (add) i.p.cyc[0] += i.p.d.c[0];
		i.p.cyc[1] += i.p.d.c[1];
		i.p.cyc[2] += i.p.d.c[2];
		return i;
	}

	function mkSD(op, mn, z, sm, sr, dm, dr, cyc, sa, da) {
		var i = new IDef();
		i.op = op;
		i.pr = false;
		i.mn = mn;
		i.f = null;
		i.p = {};
		i.p.z = z;
		i.p.ms = z == 1 ? 0x80 : (z == 2 ? 0x8000 : 0x80000000);
		i.p.mz = z == 1 ? 0xff : (z == 2 ? 0xffff : 0xffffffff);
		i.p.s = new EffAddr(sm, sr);
		i.p.d = new EffAddr(dm, dr);
		i.p.s.c = mkCyc(z, sm);
		i.p.d.c = mkCyc(z, dm);
		i.p.cyc = cyc;
		if (sa) i.p.cyc[0] += i.p.s.c[0];
		if (da) i.p.cyc[0] += i.p.d.c[0];		
		i.p.cyc[1] += i.p.s.c[1];
		i.p.cyc[2] += i.p.s.c[2];
		i.p.cyc[1] += i.p.d.c[1];		
		i.p.cyc[2] += i.p.d.c[2];		
		return i;
	}

	function mkC(op, mn, sz, cc, dp, dr, cycTaken, cyc) {
		var i = new IDef();
		i.op = op;
		i.pr = false;
		i.mn = mn;
		i.f = null;
		i.p = {};
		i.p.z = sz;
		i.p.c = new ICon(cc, dp, dr);
		if (cycTaken !== null) i.p.cycTaken = cycTaken;
		if (cyc !== null) i.p.cyc = cyc;
		return i;
	}
	
	function mkDBcc(op, mn, sz, cc, dp, dr, cycTrue, cycFalseTaken, cycFalse) {
		var i = new IDef();
		i.op = op;
		i.pr = false;
		i.mn = mn;
		i.f = null;
		i.p = {};
		i.p.z = sz;
		i.p.c = new ICon(cc, dp, dr);
		i.p.cycTrue = cycTrue;
		i.p.cycFalseTaken = cycFalseTaken;
		i.p.cycFalse = cycFalse;
		return i;
	}
	
	function mkCD(op, mn, z, cc, dp, dr, m, r, cycTrue, cycFalse, add) {
		var i = new IDef();
		i.op = op;
		i.pr = false;
		i.mn = mn;
		i.f = null;
		i.p = {};
		i.p.z = z;
		i.p.c = new ICon(cc, dp, dr);
		i.p.d = new EffAddr(m, r);
		i.p.d.c = mkCyc(z, m);
		i.p.cycTrue = cycTrue;
		i.p.cycFalse = cycFalse;
		if (add) {
			i.p.cycTrue[0] += i.p.d.c[0];
			i.p.cycFalse[0] += i.p.d.c[0];
		}
		i.p.cycTrue[1] += i.p.d.c[1];
		i.p.cycTrue[2] += i.p.d.c[2];
		i.p.cycFalse[1] += i.p.d.c[1];
		i.p.cycFalse[2] += i.p.d.c[2];
		return i;
	}
	
	function mkEA(mr, en, inv) {
		var m = (mr >> 3) & 7;
		var r = mr & 7;
		var b = inv ? (r << 3) | m : (m << 3) | r;

		if (m != 7) {
			switch (m) {
				case 0: { if (en.indexOf(M_rdd) != -1) return [b, M_rdd, r]; break; }
				case 1: { if (en.indexOf(M_rda) != -1) return [b, M_rda, r]; break; }
				case 2: { if (en.indexOf(M_ria) != -1) return [b, M_ria, r]; break; }
				case 3: { if (en.indexOf(M_ripo) != -1) return [b, M_ripo, r]; break; }
				case 4: { if (en.indexOf(M_ripr) != -1) return [b, M_ripr, r]; break; }
				case 5: { if (en.indexOf(M_rid) != -1) return [b, M_rid, r]; break; }
				case 6: { if (en.indexOf(M_rii) != -1) return [b, M_rii, r]; break; }
			}
		} else {
			if (r == 0 && en.indexOf(M_absw) != -1) return [b, M_absw, -1];
			if (r == 1 && en.indexOf(M_absl) != -1) return [b, M_absl, -1];
			if (r == 2 && en.indexOf(M_pcid) != -1) return [b, M_pcid, -1];
			if (r == 3 && en.indexOf(M_pcii) != -1) return [b, M_pcii, -1];
			if (r == 4 && en.indexOf(M_imm) != -1) return [b, M_imm, -1];
		}
		return [-1, -1, -1];
	}

	/* Start of the fun part... */
	function mkiTab() {
		var op, cnt = 0;

		iTab = new Array(0x10000);
		for (op = 0; op < 0x10000; op++) {
			iTab[op] = new IDef();
			iTab[op].op = -1;
			iTab[op].pr = false;
			iTab[op].mn = 'ILLEGAL';
			iTab[op].f = I_ILLEGAL;
			iTab[op].p = null;
		}

		//ABCD
		{
			var rm, Rx, Ry;

			for (rm = 0; rm < 2; rm++) {
				for (Rx = 0; Rx < 8; Rx++) {
					for (Ry = 0; Ry < 8; Ry++) {
						op = (12 << 12) | (Rx << 9) | (1 << 8) | (rm << 3) | Ry;

						if (iTab[op].op === -1) {
							if (rm == 0)
								iTab[op] = mkSD(op, 'ABCD', 1, M_rdd, Ry, M_rdd, Rx, [6,1,0], false, false);
							else
								iTab[op] = mkSD(op, 'ABCD', 1, M_ripr, Ry, M_ripr, Rx, [18,3,1], false, false);

							iTab[op].f = I_ABCD;
							cnt++;
						} else {
							BUG.say('OP EXISTS ABCD ' + op);
							return false;
						}
					}
				}
			}
		}
		//ADD
		{
			var z, z2, dir, en, Dn, mr, ea, cyc;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (dir = 0; dir < 2; dir++) {
					if (dir == 0) en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
					else en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];

					for (Dn = 0; Dn < 8; Dn++) {
						for (mr = 0; mr < 64; mr++) {
							ea = mkEA(mr, en, 0);
							if (ea[0] != -1) {
								if (dir == 0 && ea[1] == M_rda && z == 0) continue; //An word and long only
								
								op = (13 << 12) | (Dn << 9) | (dir << 8) | (z << 6) | ea[0];
								
  								cyc = dir == 0 ? (z2 == 4 ? (ea[1] == M_rdd || ea[1] == M_imm ? [8,1,0] : [6,1,0]) : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]);
		  								
		  						if (iTab[op].op === -1) {
									if (dir == 0)
										iTab[op] = mkSD(op, 'ADD', z2, ea[1], ea[2], M_rdd, Dn, cyc, true, false);
									else
										iTab[op] = mkSD(op, 'ADD', z2, M_rdd, Dn, ea[1], ea[2], cyc, false, true);

									iTab[op].f = I_ADD;
									cnt++;
								} else {
									BUG.say('OP EXISTS ADD ' + op);
									return false;
								}
							}
						}
					}
				}
			}
		}
		//ADDA
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var z, z2, z3, An, mr, ea;

			for (z = 0; z < 2; z++) {
				z2 = z == 0 ? 2 : 4;
				z3 = z == 0 ? 3 : 7;
				for (An = 0; An < 8; An++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							op = (13 << 12) | (An << 9) | (z3 << 6) | ea[0];

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'ADDA', z2, ea[1], ea[2], M_rda, An, z2 == 4 ? (ea[1] == M_rdd || ea[1] == M_imm ? [8,1,0] : [6,1,0]) : [8,1,0], true, false);
								iTab[op].f = I_ADDA;
								cnt++;
							} else {
								BUG.say('OP EXISTS ADDA ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//ADDI	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (6 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'ADDI', z2, M_imm, -1, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [16,3,0] : [8,2,0]) : (z2 == 4 ? [20,3,2] : [12,2,1]), false, ea[1] != M_rdd);
							iTab[op].f = I_ADDI;
							cnt++;
						} else {
							BUG.say('OP EXISTS ADDI ' + op);
							return false;
						}
					}
				}
			}
		}
		//ADDQ	
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, id, mr, ea, cyc;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (id = 0; id < 8; id++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							if (ea[1] == M_rda && z == 0) continue; //An word and long only

							op = (5 << 12) | (id << 9) | (z << 6) | ea[0];
							cyc = ea[1] == M_rda ? [8,1,0] : (ea[1] == M_rdd ? (z2 == 4 ? [8,1,0] : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]));

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'ADDQ', z2, M_imm, id == 0 ? 8 : id, ea[1], ea[2], cyc, false, ea[1] != M_rdd && ea[1] != M_rda);
								//iTab[op].f = I_ADDQ;								
								iTab[op].f = ea[1] != M_rda ? I_ADDQ : I_ADDQA;
								cnt++;
							} else {
								BUG.say('OP EXISTS ADDQ ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//ADDX
		{
			var z, z2, rm, Rx, Ry;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (rm = 0; rm < 2; rm++) {
					for (Rx = 0; Rx < 8; Rx++) {
						for (Ry = 0; Ry < 8; Ry++) {
							op = (13 << 12) | (Rx << 9) | (1 << 8) | (z << 6) | (rm << 3) | Ry;

							if (iTab[op].op === -1) {
								if (rm == 0)
									iTab[op] = mkSD(op, 'ADDX', z2, M_rdd, Ry, M_rdd, Rx, z2 == 4 ? [8,1,0] : [4,1,0], false, false);    
								else                                                                                                                     
									iTab[op] = mkSD(op, 'ADDX', z2, M_ripr, Ry, M_ripr, Rx, z2 == 4 ? [30,5,2] : [18,1,0], false, false); 

								iTab[op].f = I_ADDX;
								cnt++;
							} else {
								BUG.say('OP EXISTS ADDX ' + op + ' ' + iTab[op].mn + ' ' + iTab[op].p.s.r + ' ' + iTab[op].p.d.r);
								return false;
							}
						}
					}
				}
			}
		}
		//AND
		{
			var z, z2, dir, en, Dn, mr, ea, cyc;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (dir = 0; dir < 2; dir++) {
					if (dir == 0) en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
					else en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];

					for (Dn = 0; Dn < 8; Dn++) {
						for (mr = 0; mr < 64; mr++) {
							ea = mkEA(mr, en, 0);
							if (ea[0] != -1) {
								op = (12 << 12) | (Dn << 9) | (dir << 8) | (z << 6) | ea[0];

  								cyc = dir == 0 ? (z2 == 4 ? (ea[1] == M_rdd || ea[1] == M_imm ? [8,1,0] : [6,1,0]) : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]);

								if (iTab[op].op === -1) {
									if (dir == 0)
										iTab[op] = mkSD(op, 'AND', z2, ea[1], ea[2], M_rdd, Dn, cyc, true, false);
									else
										iTab[op] = mkSD(op, 'AND', z2, M_rdd, Dn, ea[1], ea[2], cyc, false, true);

									iTab[op].f = I_AND;
									cnt++;
								} else {
									BUG.say('OP EXISTS AND ' + op);
									return false;
								}
							}
						}
					}
				}
			}
		}
		//ANDI	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (2 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'ANDI', z2, M_imm, -1, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [16,3,0] : [8,2,0]) : (z2 == 4 ? [20,3,2] : [12,2,1]), false, ea[1] != M_rdd);
							iTab[op].f = I_ANDI;
							cnt++;
						} else {
							BUG.say('OP EXISTS ANDI ' + op);
							return false;
						}
					}
				}
			}
		}
		//ANDI_CCR	
		{
			op = 0x23C;

			if (iTab[op].op === -1) {
				iTab[op] = mkS(op, 'ANDI_CCR', 1, M_imm, -1, [20,3,0], false);
				iTab[op].f = I_ANDI_CCR;
				cnt++;
			} else {
				BUG.say('OP EXISTS ANDI ' + op);
				return false;
			}
		}
		//ANDI_SR	
		{
			op = 0x27C;

			if (iTab[op].op === -1) {
				iTab[op] = mkS(op, 'ANDI_SR', 2, M_imm, -1, [20,3,0], false);
				iTab[op].pr = true;
				iTab[op].f = I_ANDI_SR;
				cnt++;
			} else {
				BUG.say('OP EXISTS ANDI ' + op);
				return false;
			}
		}
		//ASL,ASR	
		{
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, dr, ir, cr, Dy, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);

				for (dr = 0; dr < 2; dr++) {
					for (ir = 0; ir < 2; ir++) {
						for (cr = 0; cr < 8; cr++) {
							for (Dy = 0; Dy < 8; Dy++) {
								op = (14 << 12) | (cr << 9) | (dr << 8) | (z << 6) | (ir << 5) | Dy;

								if (iTab[op].op === -1) {
									if (ir == 0)
										iTab[op] = mkSD(op, dr == 0 ? 'ASR_RI' : 'ASL_RI', z2, M_imm, cr == 0 ? 8 : cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);
									else
										iTab[op] = mkSD(op, dr == 0 ? 'ASR_RD' : 'ASL_RD', z2, M_rdd, cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);

									iTab[op].f = dr == 0 ? I_ASR : I_ASL;
									cnt++;
								} else {
									BUG.say('OP EXISTS ASx ' + op);
									return false;
								}
							}
						}
					}
				}
			}
			for (dr = 0; dr < 2; dr++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (112 << 9) | (dr << 8) | (3 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, dr == 0 ? 'ASR_M' : 'ASL_M', 2, M_imm, 1, ea[1], ea[2], [8,1,1], false, true);
							iTab[op].f = dr == 0 ? I_ASR : I_ASL;
							cnt++;
						} else {
							BUG.say('OP EXISTS ASx ' + op);
							return false;
						}
					}
				}
			}
		}
		//Bcc	
		{
			var cc, dp;

			for (cc = 2; cc < 16; cc++) {
				for (dp = 0; dp < 255; dp++) /* 0xff = long, 68020 only */
				{
					op = (6 << 12) | (cc << 8) | dp;

					if (iTab[op].op === -1) {
						iTab[op] = mkC(op, 'B' + ccNames[cc], dp == 0 ? 1 : 2, cc, dp, -1, [10,2,0], dp == 0 ? [12,1,0] : [8,1,0]);
						iTab[op].f = I_Bcc;
						cnt++;
					} else {
						BUG.say('OP EXISTS B' + ccNames[cc] + ' ' + op);
						return false;
					}
				}
			}
		}
		//BCHG
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (Dn << 9) | (5 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'BCHG1', 4, M_rdd, Dn, ea[1], ea[2], [8,1,0], false, false);
							iTab[op].f = I_BCHG;
							cnt++;
						} else {
							BUG.say('OP EXISTS BCHG1 ' + op);
							return false;
						}
					}
				}
			}
			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (33 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkSD(op, 'BCHG2', 1, M_imm, -1, ea[1], ea[2], [8,1,1], false, true);
						iTab[op].f = I_BCHG;
						cnt++;
					} else {
						BUG.say('OP EXISTS BCHG2 ' + op);
						return false;
					}
				}
			}
		}
		//BCLR
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (Dn << 9) | (6 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'BCLR1', 4, M_rdd, Dn, ea[1], ea[2], [10,1,0], false, false);
							iTab[op].f = I_BCLR;
							cnt++;
						} else {
							BUG.say('OP EXISTS BCHG1 ' + op);
							return false;
						}
					}
				}
			}
			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (34 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkSD(op, 'BCLR2', 1, M_imm, - 1, ea[1], ea[2], [8,1,1], false, true);
						iTab[op].f = I_BCLR;
						cnt++;
					} else {
						BUG.say('OP EXISTS BCLR2 ' + op);
						return false;
					}
				}
			}
		}
		//BSET
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (Dn << 9) | (7 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'BSET1', 4, M_rdd, Dn, ea[1], ea[2], [8,1,0], false, false);
							iTab[op].f = I_BSET;
							cnt++;
						} else {
							BUG.say('OP EXISTS BSET1 ' + op);
							return false;
						}
					}
				}
			}
			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (35 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkSD(op, 'BSET2', 1, M_imm, - 1, ea[1], ea[2], [8,1,1], false, true);
						iTab[op].f = I_BSET;
						cnt++;
					} else {
						BUG.say('OP EXISTS BSET2 ' + op);
						return false;
					}
				}
			}
		}
		//BTST
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (Dn << 9) | (4 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'BTST1', 4, M_rdd, Dn, ea[1], ea[2], [6,1,0], false, false);
							iTab[op].f = I_BTST;
							cnt++;
						} else {
							BUG.say('OP EXISTS BTST1 ' + op);
							return false;
						}
					}
				}
			}
			en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (32 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkSD(op, 'BTST2', 1, M_imm, -1, ea[1], ea[2], [4,1,0], false, true);
						iTab[op].f = I_BTST;
						cnt++;
					} else {
						BUG.say('OP EXISTS BTST2 ' + op);
						return false;
					}
				}
			}
		}
		//BRA	
		{
			var dp;

			for (dp = 0; dp < 255; dp++) /* 0xff = 68020 only */
			{
				op = (96 << 8) | dp;

				if (iTab[op].op === -1) {
					iTab[op] = mkC(op, 'BRA', dp == 0 ? 1 : 2, 0, dp, -1, [10,2,0], null);
					iTab[op].f = I_BRA;
					cnt++;
				} else {
					BUG.say('OP EXISTS BRA ' + op);
					return false;
				}
			}
		}
		//BSR	
		{
			var dp;

			for (dp = 0; dp < 255; dp++) /* 0xff = 68020 only */
			{
				op = (97 << 8) | dp;

				if (iTab[op].op === -1) {
					iTab[op] = mkC(op, 'BSR', dp == 0 ? 1 : 2, 1, dp, -1, [18,2,2], null);
					iTab[op].f = I_BSR;
					cnt++;
				} else {
					BUG.say('OP EXISTS BSR ' + op);
					return false;
				}
			}
		}
		//CHK	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var z2 = 2,
				z3 = 3,
				Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (4 << 12) | (Dn << 9) | (z3 << 7) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'CHK', z2, ea[1], ea[2], M_rdd, Dn, [10,1,0], true, false);
							iTab[op].f = I_CHK;
							iTab[op].p.cycTaken = iTab[op].p.s.c;
							cnt++;
						} else {
							BUG.say('OP EXISTS CHK ' + op);
							return false;
						}
					}
				}
			}
		}
		//CLR	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (66 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkD(op, 'CLR', z2, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [6,1,0] : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]), ea[1] != M_rdd);
							iTab[op].f = I_CLR;
							cnt++;
						} else {
							BUG.say('OP EXISTS CLR ' + op);
							return false;
						}
					}
				}
			}
		}
		//CMP	
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var z, z2, Dn, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (Dn = 0; Dn < 8; Dn++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							if (ea[1] == M_rda && z == 0) continue; //An word and long only
							
							op = (11 << 12) | (Dn << 9) | (z << 6) | ea[0];

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'CMP', z2, ea[1], ea[2], M_rdd, Dn, z2 == 4 ? [6,1,0] : [4,1,0], true, false);
								iTab[op].f = I_CMP;
								cnt++;
							} else {
								BUG.say('OP EXISTS CMP ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//CMPA	
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var z, z2, z3, An, mr, ea;

			for (z = 1; z < 3; z++) {
				z2 = z == 1 ? 2 : 4;
				z3 = z == 1 ? 3 : 7;
				for (An = 0; An < 8; An++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							op = (11 << 12) | (An << 9) | (z3 << 6) | ea[0];

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'CMPA', z2, ea[1], ea[2], M_rda, An, [6,1,0], true, false);
								iTab[op].f = I_CMPA;
								cnt++;
							} else {
								BUG.say('OP EXISTS CMPA ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//CMPI	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (12 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'CMPI', z2, M_imm, -1, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [14,3,0] : [8,2,0]) : (z2 == 4 ? [12,3,0] : [8,2,0]), false, ea[1] != M_rdd);
							iTab[op].f = I_CMPI;
							cnt++;
						} else {
							BUG.say('OP EXISTS CMPI ' + op);
							return false;
						}
					}
				}
			}
		}
		//CMPM
		{
			var z, z2, Ax, Ay;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (Ax = 0; Ax < 8; Ax++) {
					for (Ay = 0; Ay < 8; Ay++) {
						op = (11 << 12) | (Ax << 9) | (1 << 8) | (z << 6) | (1 << 3) | Ay;

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'CMPM', z2, M_ripo, Ay, M_ripo, Ax, z2 == 4 ? [20,5,0] : [12,3,0], false, false);
							iTab[op].f = I_CMPM;
							cnt++;
						} else {
							BUG.say('OP EXISTS CMPM ' + op + ' ' + iTab[op].mn + ' ' + iTab[op].p.s.r + ' ' + iTab[op].p.d.r);
							return false;
						}
					}
				}
			}
		}
		//DBcc
		{
			var cc, dr;

			for (cc = 0; cc < 16; cc++) {
				for (dr = 0; dr < 8; dr++) {
					op = (5 << 12) | (cc << 8) | (25 << 3) | dr;

					if (iTab[op].op === -1) {
						iTab[op] = mkDBcc(op, 'DB' + ccNames[cc], 2, cc, -1, dr, [12,2,0], [10,2,0], [14,3,0]);
						iTab[op].f = I_DBcc;
						cnt++;
					} else {
						BUG.say('OP EXISTS DBcc ' + op);
						return false;
					}
				}
			}
		}
		//DIVS	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (8 << 12) | (Dn << 9) | (7 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'DIVS', 2, ea[1], ea[2], M_rdd, Dn, [158,1,0], true, false);
							iTab[op].f = I_DIVS;
							cnt++;
						} else {
							BUG.say('OP EXISTS DIVS ' + op);
							return false;
						}
					}
				}
			}
		}
		//DIVU	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (8 << 12) | (Dn << 9) | (3 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'DIVU', 2, ea[1], ea[2], M_rdd, Dn, [140,1,0], true, false);
							iTab[op].f = I_DIVU;
							cnt++;
						} else {
							BUG.say('OP EXISTS DIVU ' + op);
							return false;
						}
					}
				}
			}
		}
		//EOR
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, z3, Dn, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				z3 = z == 0 ? 4 : (z == 1 ? 5 : 6);
				for (Dn = 0; Dn < 8; Dn++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							op = (11 << 12) | (Dn << 9) | (z3 << 6) | ea[0];

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'EOR', z2, M_rdd, Dn, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [8,1,0] : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]), false, true);
								iTab[op].f = I_EOR;
								cnt++;
							} else {
								BUG.say('OP EXISTS EOR ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//EORI	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (10 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'EORI', z2, M_imm, -1, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [16,3,0] : [8,2,0]) : (z2 == 4 ? [20,3,2] : [12,2,1]), false, ea[1] != M_rdd);
							iTab[op].f = I_EORI;
							cnt++;
						} else {
							BUG.say('OP EXISTS EORI ' + op);
							return false;
						}
					}
				}
			}
		}
		//EORI_CCR	
		{
			op = 0xA3C;

			if (iTab[op].op === -1) {
				iTab[op] = mkS(op, 'EORI_CCR', 1, M_imm, -1, [20,3,0], false);
				iTab[op].f = I_EORI_CCR;
				cnt++;
			} else {
				BUG.say('OP EXISTS EORI ' + op);
				return false;
			}
		}
		//EORI_SR	
		{
			op = 0xA7C;

			if (iTab[op].op === -1) {
				iTab[op] = mkS(op, 'EORI_SR', 2, M_imm, -1, [20,3,0], false);
				iTab[op].pr = true;
				iTab[op].f = I_EORI_SR;
				cnt++;
			} else {
				BUG.say('OP EXISTS EORI ' + op);
				return false;
			}
		}
		//EXG
		{
			var m, opm, Rx, Ry;

			for (m = 0; m < 3; m++) {
				opm = m == 0 ? 8 : (m == 1 ? 9 : 17);
				for (Rx = 0; Rx < 8; Rx++) {
					for (Ry = 0; Ry < 8; Ry++) {
						op = (12 << 12) | (Rx << 9) | (1 << 8) | (opm << 3) | Ry;

						if (iTab[op].op === -1) {
							if (m == 0)
								iTab[op] = mkSD(op, 'EXG', 4, M_rdd, Rx, M_rdd, Ry, [6,1,0], false, false);
							else if (m == 1)
								iTab[op] = mkSD(op, 'EXG', 4, M_rda, Rx, M_rda, Ry, [6,1,0], false, false);
							else
								iTab[op] = mkSD(op, 'EXG', 4, M_rdd, Rx, M_rda, Ry, [6,1,0], false, false);

							iTab[op].f = I_EXG;
							cnt++;
						} else {
							BUG.say('OP EXISTS EXG ' + op + ' ' + iTab[op].mn + ' ' + iTab[op].p.s.r + ' ' + iTab[op].p.d.r);
							return false;
						}
					}
				}
			}
		}
		//EXT
		{
			var z, z2, opm, Dn;

			for (z = 1; z < 3; z++) {
				z2 = z == 1 ? 2 : 4;
				opm = z == 1 ? 2 : 3;
				for (Dn = 0; Dn < 8; Dn++) {
					op = (36 << 9) | (opm << 6) | Dn;

					if (iTab[op].op === -1) {
						iTab[op] = mkD(op, 'EXT', z2, M_rdd, Dn, [4,1,0], false);
						iTab[op].f = I_EXT;
						cnt++;
					} else {
						BUG.say('OP EXISTS EXT ' + op + ' ' + iTab[op].mn + ' ' + iTab[op].p.s.r + ' ' + iTab[op].p.d.r);
						return false;
					}
				}
			}
		}
		//ILLEGAL	
		{
			op = 0x4AFC;

			if (iTab[op].op === -1) {
				iTab[op] = mkN(op, 'ILLEGAL', [0,0,0]);
				iTab[op].f = I_ILLEGAL;
				cnt++;
			} else {
				BUG.say('OP EXISTS ILLEGAL ' + op);
				return false;
			}
		}
		//JMP	
		{
			var en = [M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			var mr, ea, cyc;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (315 << 6) | ea[0];

					if (iTab[op].op === -1) {   
						switch (ea[1]) {
							case M_ria:  cyc = [ 8,2,0]; break;
							case M_rid:  cyc = [10,2,0]; break;
							case M_rii:  cyc = [14,3,0]; break;
							case M_pcid: cyc = [10,2,0]; break;
							case M_pcii: cyc = [14,3,0]; break;
							case M_absw: cyc = [10,2,0]; break;
							case M_absl: cyc = [12,3,0]; break;
						}		
						iTab[op] = mkD(op, 'JMP', 0, ea[1], ea[2], cyc, false);
						iTab[op].f = I_JMP;
						cnt++;
					} else {
						BUG.say('OP EXISTS JMP ' + op);
						return false;
					}
				}
			}
		}
		//JSR	
		{
			var en = [M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			var mr, ea, cyc;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (314 << 6) | ea[0];

					if (iTab[op].op === -1) {
						switch (ea[1]) {
							case M_ria:  cyc = [16,2,2]; break;
							case M_rid:  cyc = [18,2,2]; break;
							case M_rii:  cyc = [22,2,2]; break;
							case M_pcid: cyc = [18,2,2]; break;
							case M_pcii: cyc = [22,2,2]; break;
							case M_absw: cyc = [18,2,2]; break;
							case M_absl: cyc = [20,3,2]; break;
						}		
						iTab[op] = mkD(op, 'JSR', 0, ea[1], ea[2], cyc, false);
						iTab[op].f = I_JSR;
						cnt++;
					} else {
						BUG.say('OP EXISTS JSR ' + op);
						return false;
					}
				}
			}
		}
		//LEA	
		{
			var en = [M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			var An, mr, ea, cyc;

			for (An = 0; An < 8; An++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (4 << 12) | (An << 9) | (7 << 6) | ea[0];

						if (iTab[op].op === -1) {
							switch (ea[1]) {
								case M_ria:  cyc = [ 4,1,0]; break;
								case M_rid:  cyc = [ 8,2,0]; break;
								case M_rii:  cyc = [12,2,0]; break;
								case M_pcid: cyc = [ 8,2,0]; break;
								case M_pcii: cyc = [12,2,0]; break;
								case M_absw: cyc = [ 8,2,0]; break;
								case M_absl: cyc = [12,3,0]; break;
							}
							iTab[op] = mkSD(op, 'LEA', 4, ea[1], ea[2], M_rda, An, cyc, false, false);
							iTab[op].f = I_LEA;
							cnt++;
						} else {
							BUG.say('OP EXISTS LEA ' + op);
							return false;
						}
					}
				}
			}
		}
		//LINK		
		{
			var An;

			for (An = 0; An < 8; An++) {
				op = (2506 << 3) | An;

				if (iTab[op].op === -1) {
					iTab[op] = mkSD(op, 'LINK', 2, M_rda, An, M_imm, -1, [16,2,2], false, false);
					iTab[op].f = I_LINK;
					cnt++;
				} else {
					BUG.say('OP EXISTS LINK ' + op);
					return false;
				}
			}
		}
		//LSL,LSR
		{
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, dr, ir, cr, Dy, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);

				for (dr = 0; dr < 2; dr++) {
					for (ir = 0; ir < 2; ir++) {
						for (cr = 0; cr < 8; cr++) {
							for (Dy = 0; Dy < 8; Dy++) {
								op = (14 << 12) | (cr << 9) | (dr << 8) | (z << 6) | (ir << 5) | (1 << 3) | Dy;

								if (iTab[op].op === -1) {
									if (ir == 0)
										iTab[op] = mkSD(op, dr == 0 ? 'LSR_RI' : 'LSL_RI', z2, M_imm, cr == 0 ? 8 : cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);
									else
										iTab[op] = mkSD(op, dr == 0 ? 'LSR_RD' : 'LSL_RD', z2, M_rdd, cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);

									iTab[op].f = dr == 0 ? I_LSR : I_LSL;
									cnt++;
								} else {
									BUG.say('OP EXISTS LSx ' + op);
									return false;
								}
							}
						}
					}
				}
			}
			for (dr = 0; dr < 2; dr++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (113 << 9) | (dr << 8) | (3 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, dr == 0 ? 'LSR_M' : 'LSL_M', 2, M_imm, 1, ea[1], ea[2], [8,1,1], false, true);
							iTab[op].f = dr == 0 ? I_LSR : I_LSL;
							cnt++;
						} else {
							BUG.say('OP EXISTS LSx ' + op);
							return false;
						}
					}
				}
			}
		}
		//MOVE	
		{    
			var tab2 = [
				[[ 4,1,0],null,[ 8,1,1],[ 8,1,1],[ 8,1,1],[12,2,1],[14,2,1],null,null,[12,2,1],[16,3,1],null],
				[[ 4,1,0],null,[ 8,1,1],[ 8,1,1],[ 8,1,1],[12,2,1],[14,2,1],null,null,[12,2,1],[16,3,1],null],
				[[ 8,2,0],null,[12,2,1],[12,2,1],[12,2,1],[16,3,1],[18,3,1],null,null,[16,3,1],[20,4,1],null],
				[[ 8,2,0],null,[12,2,1],[12,2,1],[12,2,1],[16,3,1],[18,3,1],null,null,[16,3,1],[20,4,1],null],
				[[10,2,0],null,[14,2,1],[14,2,1],[14,2,1],[18,3,1],[20,4,1],null,null,[18,3,1],[22,4,1],null],
				[[12,3,0],null,[16,3,1],[16,3,1],[16,3,1],[20,4,1],[22,4,1],null,null,[20,4,1],[24,5,1],null],
				[[14,3,0],null,[18,3,1],[18,3,1],[18,3,1],[22,4,1],[24,4,1],null,null,[22,4,1],[26,5,1],null],
				[[12,3,0],null,[16,3,1],[16,3,1],[16,3,1],[20,4,1],[22,4,1],null,null,[20,4,1],[24,5,1],null],
				[[14,3,0],null,[18,3,1],[18,3,1],[18,3,1],[22,4,1],[24,4,1],null,null,[22,4,1],[26,5,1],null],
				[[12,3,0],null,[16,3,1],[16,3,1],[16,3,1],[20,4,1],[22,4,1],null,null,[20,4,1],[24,5,1],null],
				[[16,4,0],null,[20,4,1],[20,4,1],[20,4,1],[24,5,1],[26,5,1],null,null,[24,5,1],[28,6,1],null],
				[[ 8,2,0],null,[12,2,1],[12,2,1],[12,2,1],[16,3,1],[18,3,1],null,null,[16,3,1],[20,4,1],null]
			];	
			var tab4 = [
				[[ 4,1,0],null,[12,1,2],[12,1,2],[12,1,2],[16,2,2],[18,2,2],null,null,[16,2,2],[20,3,2],null],
				[[ 4,1,0],null,[12,1,2],[12,1,2],[12,1,2],[16,2,2],[18,2,2],null,null,[16,2,2],[20,3,2],null],
				[[12,3,0],null,[20,3,2],[20,3,2],[20,3,2],[24,4,2],[26,4,2],null,null,[24,4,2],[28,5,2],null],
				[[12,3,0],null,[20,3,2],[20,3,2],[20,3,2],[24,4,2],[26,4,2],null,null,[24,4,2],[28,5,2],null],
				[[14,3,0],null,[22,3,2],[22,3,2],[22,3,2],[26,4,2],[28,4,2],null,null,[26,4,2],[30,5,2],null],
				[[16,4,0],null,[24,4,2],[24,4,2],[24,4,2],[28,5,2],[30,5,2],null,null,[28,5,2],[32,6,2],null],
				[[18,4,0],null,[26,4,2],[26,4,2],[26,4,2],[30,5,2],[32,5,2],null,null,[30,5,2],[34,6,2],null],
				[[16,4,0],null,[24,4,2],[24,4,2],[24,4,2],[28,5,2],[30,5,2],null,null,[28,5,2],[32,5,2],null],
				[[18,4,0],null,[26,4,2],[26,4,2],[26,4,2],[30,5,2],[32,5,2],null,null,[30,5,2],[34,6,2],null],
				[[16,4,0],null,[24,4,2],[24,4,2],[24,4,2],[28,5,2],[30,5,2],null,null,[28,5,2],[32,6,2],null],
				[[20,5,0],null,[28,5,2],[28,5,2],[28,5,2],[32,6,2],[34,6,2],null,null,[32,6,2],[36,7,2],null],
				[[12,3,0],null,[20,3,2],[20,3,2],[20,3,2],[24,4,2],[26,4,2],null,null,[24,4,2],[28,5,2],null]			
			];				
			var sen = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var den = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, z3, smr, dmr, sea, dea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				z3 = z == 0 ? 1 : (z == 1 ? 3 : 2);

				for (dmr = 0; dmr < 64; dmr++) {
					dea = mkEA(dmr, den, 1);
					if (dea[0] != -1) {
						for (smr = 0; smr < 64; smr++) {
							sea = mkEA(smr, sen, 0);
							if (sea[0] != -1) {
								if (sea[1] == M_rda && z == 0) //For byte size operation, address register direct is not allowed.
									continue;
								
								op = (z3 << 12) | (dea[0] << 6) | sea[0];

								if (iTab[op].op === -1) {
									iTab[op] = mkSD(op, 'MOVE', z2, sea[1], sea[2], dea[1], dea[2], z2 == 4 ? tab4[sea[1]-1][dea[1]-1] : tab2[sea[1]-1][dea[1]-1], false, false);
									iTab[op].f = I_MOVE;
									//iTab[op].p.cyc = z2 == 4 ? tab4[sea[1]-1][dea[1]-1] : tab2[sea[1]-1][dea[1]-1];
									//if (typeof(iTab[op].p.cyc) != 'number') console.log(op, z2, sea[1], dea[1]);
									cnt++;
								} else {
									BUG.say('OP EXISTS MOVE op ' + op + ', size ' + z2 + ', sm ' + sea[1] + ', sr ' + sea[2] + ', dm ' + dea[1] + ', dr ' + dea[2]);
									return false;
								}
							}
						}
					}
				}
			}
		}
		//MOVEA	
		{
			var tab2 = [
				[ 4,1,0],
				[ 4,1,0],
				[ 8,2,0],
				[ 8,2,0],
				[10,2,0],
				[12,3,0],
				[14,3,0],
				[12,3,0],
				[14,3,0],
				[12,3,0],
				[16,4,0],
				[ 8,2,0]
			];	
			var tab4 = [
				[ 4,1,0],
				[ 4,1,0],
				[12,3,0],
				[12,3,0],
				[14,3,0],
				[16,4,0],
				[18,4,0],
				[16,4,0],
				[18,4,0],
				[16,4,0],
				[20,5,0],
				[12,3,0]			
			];	
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var z, z2, z3, An, mr, ea;

			for (z = 1; z < 3; z++) {
				z2 = z == 1 ? 2 : 4;
				z3 = z == 1 ? 3 : 2;

				for (An = 0; An < 8; An++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							op = (z3 << 12) | (An << 9) | (1 << 6) | ea[0];

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'MOVEA', z2, ea[1], ea[2], M_rda, An, z2 == 4 ? tab4[ea[1]-1] : tab2[ea[1]-1], false, false);
								iTab[op].f = I_MOVEA;
								//iTab[op].p.cyc = z2 == 4 ? tab4[ea[1]-1] : tab2[ea[1]-1];
								cnt++;
							} else {
								BUG.say('OP EXISTS MOVEA op ' + op + ', size ' + z2 + ', sm ' + sea[1] + ', sr ' + sea[2] + ', dm ' + dea[1] + ', dr ' + dea[2]);
								return false;
							}
						}
					}
				}
			}
		}
		//MOVE_CCR2 ups, not for the 68000
		/*{
			var en = [M_rdd,M_ria,M_ripo,M_ripr,M_rid,M_rii,M_absw,M_absl];
			var mr, ea;

			for (mr = 0; mr < 64; mr++)
			{
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1)
				{
					op = (267 << 6) | ea[0];  

					if (iTab[op].op === -1) {
						iTab[op] = mkD(op, 'MOVE_CCR2', 2, ea[1], ea[2], [0,0,0], false);
						iTab[op].f = I_MOVE_CCR2;
						cnt++;
					} else {
						BUG.say('OP EXISTS MOVE_CCR2 '+op);
						return false;
					}
				}
			}
		}*/
		//MOVE_2CCR	     
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var mr, ea;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (275 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkS(op, 'MOVE_2CCR', 2, ea[1], ea[2], [12,1,0], ea[1] != M_rdd);
						iTab[op].f = I_MOVE_2CCR;
						cnt++;
					} else {
						BUG.say('OP EXISTS MOVE_2CCR ' + op);
						return false;
					}
				}
			}
		}
		//MOVE_SR2
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var mr, ea;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (259 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkD(op, 'MOVE_SR2', 2, ea[1], ea[2], ea[1] == M_rdd ? [6,1,0] : [8,1,1], ea[1] != M_rdd);
						iTab[op].f = I_MOVE_SR2;
						cnt++;
					} else {
						BUG.say('OP EXISTS MOVE_SR2 ' + op);
						return false;
					}
				}
			}
		}
		//MOVE_2SR	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var mr, ea;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (283 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkS(op, 'MOVE_2SR', 2, ea[1], ea[2], [12,1,0], ea[1] != M_rdd);
						iTab[op].pr = true;
						iTab[op].f = I_MOVE_2SR;
						cnt++;
					} else {
						BUG.say('OP EXISTS MOVE_2SR ' + op);
						return false;
					}
				}
			}
		}
		//MOVE_USP
		{
			var dr, An;

			for (dr = 0; dr < 2; dr++) {
				for (An = 0; An < 8; An++) {
					op = (1254 << 4) | (dr << 3) | An;

					if (iTab[op].op === -1) {
						if (dr == 0)
							iTab[op] = mkS(op, 'MOVE_A2USP', 4, M_rda, An, [4,1,0], false);
						else
							iTab[op] = mkD(op, 'MOVE_USP2A', 4, M_rda, An, [4,1,0], false);

						iTab[op].pr = true;
						iTab[op].f = (dr == 0) ? I_MOVE_A2USP : I_MOVE_USP2A;
						cnt++;
					} else {
						BUG.say('OP EXISTS MOVE_USP ' + op);
						return false;
					}
				}
			}
		}
		//MOVEM
		/*		
		instr	size	(An)		(An)+	-(An)	d(An)	   	d(An,ix)+   d(PC)      d(PC,ix)*     xxx.W      xxx.L                    
		MOVEM	                                                                                                                  
			word	   12+4n	   12+4n	  -	  16+4n       18+4n     16+4n      18+4n          16+4n      20+4n	                  
		M->R		 (3+n/0)	 (3+n/0)	  -	(4+n/0)     (4+n/0)   (4+n/0)    (4+n/0)        (4+n/0)    (5+n/0)	                  
			long	   12+8n	   12+8n	  -	  16+8n       18+8n     16+8n      18+8n          16+8n      20+8n	                  
					(3+2n/0)	(3+2n/0)	  -    (4+2n/0)   (4+2n/0)   (4+2n/0)   (4+2n/0)     (4+2n/0)   (5+2n/0)  
					                 
		MOVEM	                                                                                                                  
			word	    8+4n	   -		  8+4n	  12+4n    14+4n     -				-              12+4n      16+4n	                        
		R->M		   (2/n)	   -		 (2/n)	  (3/n)    (3/n)     -				-              (3/n)      (4/n)	                        
			long	    8+8n	   -		  8+8n	  12+8n    14+8n     -				-              12+8n      16+8n	                        
		 			 (2/2n)	   -		(2/2n)	 (3/2n)    (3/2n)  	 -				-		         (3/2n)     (4/2n)*/
		{
			var z, z2, dr, mr, ea, cyc;

			for (z = 0; z < 2; z++) {
				z2 = z == 0 ? 2 : 4;
				for (dr = 0; dr < 2; dr++) {
					if (dr == 0) en = [M_ria, M_ripr, M_rid, M_rii, M_absw, M_absl];
					else en = [M_ria, M_ripo, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];

					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							op = (9 << 11) | (dr << 10) | (1 << 7) | (z << 6) | ea[0];

							if (iTab[op].op === -1) {
								if (dr == 0) {
									switch (ea[1]) {
										case M_ria: cyc = [8,2,0]; break;
										case M_ripr: cyc = [8,2,0]; break;
										case M_rid: cyc = [12,3,0]; break;
										case M_rii: cyc = [14,3,0]; break;
										case M_absw: cyc = [12,3,0]; break;
										case M_absl: cyc = [16,4,0]; break;
									}		
									iTab[op] = mkSD(op, 'MOVEM_R2M', z2, M_list, -1, ea[1], ea[2], cyc, false, false);
									iTab[op].f = I_MOVEM_R2M;
								} else {
									switch (ea[1]) {
										case M_ria: cyc = [12,3,0]; break;
										case M_ripo: cyc = [12,3,0]; break;
										case M_rid: cyc = [16,4,0]; break;
										case M_rii: cyc = [18,4,0]; break;
										case M_pcid: cyc = [16,4,0]; break;
										case M_pcii: cyc = [18,4,0]; break;
										case M_absw: cyc = [16,4,0]; break;
										case M_absl: cyc = [20,5,0]; break;
									}		
									iTab[op] = mkSD(op, 'MOVEM_M2R', z2, M_list, -1, ea[1], ea[2], cyc, false, false);
									iTab[op].f = I_MOVEM_M2R;
								}
								cnt++;
							} else {
								BUG.say('OP EXISTS MOVEM ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//MOVEP
		{
			var m, opm, Dn, An;

			for (m = 0; m < 4; m++) {
				opm = m + 4;
				for (Dn = 0; Dn < 8; Dn++) {
					for (An = 0; An < 8; An++) {
						op = (Dn << 9) | (opm << 6) | (1 << 3) | An;

						if (iTab[op].op === -1) {
							if (m == 0)
								iTab[op] = mkSD(op, 'MOVEP', 2, M_rid, An, M_rdd, Dn, [16,4,0], false, false);
							else if (m == 1)
								iTab[op] = mkSD(op, 'MOVEP', 4, M_rid, An, M_rdd, Dn, [24,6,0], false, false);
							else if (m == 2)
								iTab[op] = mkSD(op, 'MOVEP', 2, M_rdd, Dn, M_rid, An, [16,2,2], false, false);
							else
								iTab[op] = mkSD(op, 'MOVEP', 4, M_rdd, Dn, M_rid, An, [24,2,4], false, false);

							iTab[op].f = I_MOVEP;
							cnt++;
						} else {
							BUG.say('OP EXISTS MOVEP ' + op);
							return false;
						}
					}
				}
			}
		}
		//MOVEQ	
		{
			var Dn, d;

			for (Dn = 0; Dn < 8; Dn++) {
				for (d = 0; d < 256; d++) {
					op = (7 << 12) | (Dn << 9) | d;

					if (iTab[op].op === -1) {
						iTab[op] = mkSD(op, 'MOVEQ', 4, M_imm, d, M_rdd, Dn, [4,1,0], false, false);
						iTab[op].f = I_MOVEQ;
						cnt++;
					} else {
						BUG.say('OP EXISTS MOVEQ ' + op);
						return false;
					}
				}
			}
		}
		//MULS	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (12 << 12) | (Dn << 9) | (7 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'MULS', 2, ea[1], ea[2], M_rdd, Dn, [70,1,0], true, false);
							iTab[op].f = I_MULS;
							cnt++;
						} else {
							BUG.say('OP EXISTS MULS ' + op);
							return false;
						}
					}
				}
			}
		}
		//MULU	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (12 << 12) | (Dn << 9) | (3 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'MULU', 2, ea[1], ea[2], M_rdd, Dn, [70,1,0], true, false);
							iTab[op].f = I_MULU;
							cnt++;
						} else {
							BUG.say('OP EXISTS MULU ' + op);
							return false;
						}
					}
				}
			}
		}
		//NBCD
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var mr, ea;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (288 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkD(op, 'NBCD', 1, ea[1], ea[2], ea[1] == M_rdd ? [6,1,0] : [8,1,1], ea[1] != M_rdd);
						iTab[op].f = I_NBCD;
						cnt++;
					} else {
						BUG.say('OP EXISTS NBCD ' + op);
						return false;
					}
				}
			}
		}
		//NEG	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (68 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkD(op, 'NEG', z2, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [6,1,0] : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]), ea[1] != M_rdd);
							iTab[op].f = I_NEG;
							cnt++;
						} else {
							BUG.say('OP EXISTS NEG ' + op);
							return false;
						}
					}
				}
			}
		}
		//NEGX	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (64 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkD(op, 'NEGX', z2, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [6,1,0] : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]), ea[1] != M_rdd);
							iTab[op].f = I_NEGX;
							cnt++;
						} else {
							BUG.say('OP EXISTS NEGX ' + op);
							return false;
						}
					}
				}
			}
		}
		//NOP	
		{
			op = 0x4E71;

			if (iTab[op].op === -1) {
				iTab[op] = mkN(op, 'NOP', [4,1,0]);
				iTab[op].f = I_NOP;
				cnt++;
			} else {
				BUG.say('OP EXISTS NOP ' + op);
				return false;
			}
		}
		//NOT	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (70 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkD(op, 'NOT', z2, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [6,1,0] : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]), ea[1] != M_rdd);
							iTab[op].f = I_NOT;
							cnt++;
						} else {
							BUG.say('OP EXISTS NOT ' + op);
							return false;
						}
					}
				}
			}
		}
		//OR
		{
			var z, z2, dir, en, Dn, mr, ea, cyc;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (dir = 0; dir < 2; dir++) {
					if (dir == 0) en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
					else en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];

					for (Dn = 0; Dn < 8; Dn++) {
						for (mr = 0; mr < 64; mr++) {
							ea = mkEA(mr, en, 0);
							if (ea[0] != -1) {
								op = (8 << 12) | (Dn << 9) | (dir << 8) | (z << 6) | ea[0];

  								cyc = dir == 0 ? (z2 == 4 ? (ea[1] == M_rdd || ea[1] == M_imm ? [8,1,0] : [6,1,0]) : (ea[1] == M_rdd || ea[1] == M_imm ? [8,1,0] : [4,1,0])) : (z2 == 4 ? [12,1,2] : [8,1,1]);

								if (iTab[op].op === -1) {
									if (dir == 0)
										iTab[op] = mkSD(op, 'OR', z2, ea[1], ea[2], M_rdd, Dn, cyc, true, false);
									else
										iTab[op] = mkSD(op, 'OR', z2, M_rdd, Dn, ea[1], ea[2], cyc, false, true);

									iTab[op].f = I_OR;
									cnt++;
								} else {
									BUG.say('OP EXISTS OR ' + op);
									return false;
								}
							}
						}
					}
				}
			}
		}
		//ORI	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'ORI', z2, M_imm, -1, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [16,3,0] : [8,2,0]) : (z2 == 4 ? [20,3,2] : [12,2,1]), false, ea[1] != M_rdd);
							iTab[op].f = I_ORI;
							cnt++;
						} else {
							BUG.say('OP EXISTS ORI ' + op);
							return false;
						}
					}
				}
			}
		}
		//ORI_CCR	
		{
			op = 0x3C;

			if (iTab[op].op === -1) {
				iTab[op] = mkS(op, 'ORI_CCR', 1, M_imm, -1, [20,3,0], false);
				iTab[op].f = I_ORI_CCR;
				cnt++;
			} else {
				BUG.say('OP EXISTS ORI_CCR ' + op);
				return false;
			}
		}
		//ORI_SR	
		{
			op = 0x7C;

			if (iTab[op].op === -1) {
				iTab[op] = mkS(op, 'ORI_SR', 2, M_imm, -1, [20,3,0], false);
				iTab[op].pr = true;
				iTab[op].f = I_ORI_SR;
				cnt++;
			} else {
				BUG.say('OP EXISTS ORI_SR ' + op);
				return false;
			}
		}		 	 
		//PEA	
		{
			var en = [M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			var mr, ea, cyc;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (289 << 6) | ea[0];

					if (iTab[op].op === -1) {
						switch (ea[1]) {
							case M_ria: cyc = [12,1,2]; break;   
							case M_rid: cyc = [16,2,2]; break;
							case M_rii: cyc = [20,2,2]; break;
							case M_pcid: cyc = [16,2,2]; break;
							case M_pcii: cyc = [20,2,2]; break;
							case M_absw: cyc = [16,2,2]; break;
							case M_absl: cyc = [20,3,2]; break;
						}		
						iTab[op] = mkS(op, 'PEA', 4, ea[1], ea[2], cyc, false);
						iTab[op].f = I_PEA;
						cnt++;
					} else {
						BUG.say('OP EXISTS PEA ' + op);
						return false;
					}
				}
			}
		}
		//RESET	
		{
			op = 0x4E70;

			if (iTab[op].op === -1) {
				iTab[op] = mkN(op, 'RESET', [132,1,0]);
				iTab[op].f = I_RESET;
				cnt++;
			} else {
				BUG.say('OP EXISTS RESET ' + op);
				return false;
			}
		}
		//ROL,ROR
		{
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, dr, ir, cr, Dy, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);

				for (dr = 0; dr < 2; dr++) {
					for (ir = 0; ir < 2; ir++) {
						for (cr = 0; cr < 8; cr++) {
							for (Dy = 0; Dy < 8; Dy++) {
								op = (14 << 12) | (cr << 9) | (dr << 8) | (z << 6) | (ir << 5) | (3 << 3) | Dy;

								if (iTab[op].op === -1) {
									if (ir == 0)
										iTab[op] = mkSD(op, dr == 0 ? 'ROR_RI' : 'ROL_RI', z2, M_imm, cr == 0 ? 8 : cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);
									else
										iTab[op] = mkSD(op, dr == 0 ? 'ROR_RD' : 'ROL_RD', z2, M_rdd, cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);

									iTab[op].f = dr == 0 ? I_ROR : I_ROL;
									cnt++;
								} else {
									BUG.say('OP EXISTS ROx ' + op);
									return false;
								}
							}
						}
					}
				}
			}
			for (dr = 0; dr < 2; dr++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (115 << 9) | (dr << 8) | (3 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, dr == 0 ? 'ROR_M' : 'ROL_M', 2, M_imm, 1, ea[1], ea[2], [8,1,1], false, true);
							iTab[op].f = dr == 0 ? I_ROR : I_ROL;
							cnt++;
						} else {
							BUG.say('OP EXISTS ROx ' + op);
							return false;
						}
					}
				}
			}
		}
		//ROXL,ROXR
		{
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, dr, ir, cr, Dy, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);

				for (dr = 0; dr < 2; dr++) {
					for (ir = 0; ir < 2; ir++) {
						for (cr = 0; cr < 8; cr++) {
							for (Dy = 0; Dy < 8; Dy++) {
								op = (14 << 12) | (cr << 9) | (dr << 8) | (z << 6) | (ir << 5) | (2 << 3) | Dy;

								if (iTab[op].op === -1) {
									if (ir == 0)
										iTab[op] = mkSD(op, dr == 0 ? 'ROXR_RI' : 'ROXL_RI', z2, M_imm, cr == 0 ? 8 : cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);
									else
										iTab[op] = mkSD(op, dr == 0 ? 'ROXR_RD' : 'ROXL_RD', z2, M_rdd, cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);

									iTab[op].f = dr == 0 ? I_ROXR : I_ROXL;
									cnt++;
								} else {
									BUG.say('OP EXISTS ROx ' + op);
									return false;
								}
							}
						}
					}
				}
			}
			for (dr = 0; dr < 2; dr++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (114 << 9) | (dr << 8) | (3 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, dr == 0 ? 'ROXR_M' : 'ROXL_M', 2, M_imm, 1, ea[1], ea[2], [8,1,1], false, true);
							iTab[op].f = dr == 0 ? I_ROXR : I_ROXL;
							cnt++;
						} else {
							BUG.say('OP EXISTS ROx ' + op);
							return false;
						}
					}
				}
			}
		}
		//RTE	
		{
			op = 0x4E73;

			if (iTab[op].op === -1) {
				iTab[op] = mkN(op, 'RTE', [20,5,0]);
				iTab[op].pr = true;
				iTab[op].f = I_RTE;
				cnt++;
			} else {
				BUG.say('OP EXISTS RTE ' + op);
				return false;
			}
		}
		//RTR	
		{
			op = 0x4E77;

			if (iTab[op].op === -1) {
				iTab[op] = mkN(op, 'RTR', [20,5,0]);
				iTab[op].f = I_RTR;
				cnt++;
			} else {
				BUG.say('OP EXISTS RTR ' + op);
				return false;
			}
		}
		//RTS	
		{
			op = 0x4E75;

			if (iTab[op].op === -1) {
				iTab[op] = mkN(op, 'RTS', [16,4,0]);
				iTab[op].f = I_RTS;
				cnt++;
			} else {
				BUG.say('OP EXISTS RTS ' + op);
				return false;
			}
		}
		//SBCD
		{
			var rm, Rx, Ry;

			for (rm = 0; rm < 2; rm++) {
				for (Rx = 0; Rx < 8; Rx++) {
					for (Ry = 0; Ry < 8; Ry++) {
						op = (8 << 12) | (Ry << 9) | (1 << 8) | (rm << 3) | Rx;

						if (iTab[op].op === -1) {
							if (rm == 0)
								iTab[op] = mkSD(op, 'SBCD', 1, M_rdd, Rx, M_rdd, Ry,  [6,3,1], false, false);
							else
								iTab[op] = mkSD(op, 'SBCD', 1, M_ripr, Rx, M_ripr, Ry,  [18,3,1], false, false);

							iTab[op].f = I_SBCD;
							cnt++;
						} else {
							BUG.say('OP EXISTS SBCD ' + op);
							return false;
						}
					}
				}
			}
		}
		//Scc	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var cc, mr, ea;

			for (cc = 0; cc < 16; cc++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (5 << 12) | (cc << 8) | (3 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkCD(op, 'S' + ccNames[cc], 1, cc, -1, -1, ea[1], ea[2], ea[1] == M_rdd ? [6,1,0] : [8,1,1], ea[1] == M_rdd ? [4,1,0] : [8,1,1], ea[1] != M_rdd);
							iTab[op].f = I_Scc;
							cnt++;
						} else {
							BUG.say('OP EXISTS S' + ccNames[cc] + ' ' + op);
							return false;
						}
					}
				}
			}
		}
		//STOP	
		{
			op = 0x4E72;

			if (iTab[op].op === -1) {
				iTab[op] = mkS(op, 'STOP', 2, M_imm, -1, [4,0,0], false);
				iTab[op].pr = true;
				iTab[op].f = I_STOP;
				cnt++;
			} else {
				BUG.say('OP EXISTS STOP ' + op);
				return false;
			}
		}
		//SUB
		{
			var z, z2, dir, en, Dn, mr, ea, cyc;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (dir = 0; dir < 2; dir++) {
					if (dir == 0) en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
					else en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];

					for (Dn = 0; Dn < 8; Dn++) {
						for (mr = 0; mr < 64; mr++) {
							ea = mkEA(mr, en, 0);
							if (ea[0] != -1) {
								if (dir == 0 && ea[1] == M_rda && z == 0) //For byte-sized operation, address register direct is not allowed
								continue;

								op = (9 << 12) | (Dn << 9) | (dir << 8) | (z << 6) | ea[0];

  								cyc = dir == 0 ? (z2 == 4 ? (ea[1] == M_rdd || ea[1] == M_imm ? [8,1,0] : [6,1,0]) : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]);
								
								if (iTab[op].op === -1) {
									if (dir == 0)
										iTab[op] = mkSD(op, 'SUB', z2, ea[1], ea[2], M_rdd, Dn, cyc, true, false);
									else
										iTab[op] = mkSD(op, 'SUB', z2, M_rdd, Dn, ea[1], ea[2], cyc, false, true);

									iTab[op].f = I_SUB;
									cnt++;
								} else {
									BUG.say('OP EXISTS SUB ' + op);
									return false;
								}
							}
						}
					}
				}
			}
		}
		//SUBA
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var z, z2, z3, An, mr, ea;

			for (z = 0; z < 2; z++) {
				z2 = z == 0 ? 2 : 4;
				z3 = z == 0 ? 3 : 7;
				for (An = 0; An < 8; An++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							op = (9 << 12) | (An << 9) | (z3 << 6) | ea[0];

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'SUBA', z2, ea[1], ea[2], M_rda, An, z2 == 4 ? (ea[1] == M_rdd || ea[1] == M_imm ? [8,1,0] : [6,1,0]) : [8,1,0], true, false);
								iTab[op].f = I_SUBA;
								cnt++;
							} else {
								BUG.say('OP EXISTS SUBA ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//SUBI	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (4 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'SUBI', z2, M_imm, -1, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [16,3,0] : [8,2,0]) : (z2 == 4 ? [20,3,2] : [12,2,1]), false, ea[1] != M_rdd);
							iTab[op].f = I_SUBI;
							cnt++;
						} else {
							BUG.say('OP EXISTS SUBI ' + op);
							return false;
						}
					}
				}
			}
		}
		//SUBQ	
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, id, mr, ea, cyc;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (id = 0; id < 8; id++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							if (ea[1] == M_rda && z == 0) continue; //An word and long only
							
							op = (5 << 12) | (id << 9) | (1 << 8) | (z << 6) | ea[0];
							cyc = ea[1] == M_rda ? [8,1,0] : (ea[1] == M_rdd ? (z2 == 4 ? [8,1,0] : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]));

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'SUBQ', z2, M_imm, id == 0 ? 8 : id, ea[1], ea[2], cyc, false, ea[1] != M_rdd && ea[1] != M_rda);
								//iTab[op].f = I_SUBQ;
								iTab[op].f = ea[1] != M_rda ? I_SUBQ : I_SUBQA;
								cnt++;
							} else {
								BUG.say('OP EXISTS SUBQ ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//SUBX
		{
			var z, z2, rm, Rx, Ry;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (rm = 0; rm < 2; rm++) {
					for (Rx = 0; Rx < 8; Rx++) {
						for (Ry = 0; Ry < 8; Ry++) {
							op = (9 << 12) | (Ry << 9) | (1 << 8) | (z << 6) | (rm << 3) | Rx;

							if (iTab[op].op === -1) {
								if (rm == 0)
									iTab[op] = mkSD(op, 'SUBX', z2, M_rdd, Rx, M_rdd, Ry, z2 == 4 ? [8,1,0] : [4,1,0], false, false);
								else
									iTab[op] = mkSD(op, 'SUBX', z2, M_ripr, Rx, M_ripr, Ry, z2 == 4 ?  [30,5,2] : [18,1,0], false, false);

								iTab[op].f = I_SUBX;
								cnt++;
							} else {
								BUG.say('OP EXISTS SUBX ' + op + ' ' + iTab[op].mn + ' ' + iTab[op].p.s.r + ' ' + iTab[op].p.d.r);
								return false;
							}
						}
					}
				}
			}
		}
		//SWAP		
		{
			var Dn;

			for (Dn = 0; Dn < 8; Dn++) {
				op = (2312 << 3) | Dn;

				if (iTab[op].op === -1) {
					iTab[op] = mkD(op, 'SWAP', 2, M_rdd, Dn, [4,1,0], false);
					iTab[op].f = I_SWAP;
					cnt++;
				} else {
					BUG.say('OP EXISTS SWAP ' + op);
					return false;
				}
			}
		}
		//TAS
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var mr, ea;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (299 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkD(op, 'TAS', 1, ea[1], ea[2], ea[1] == M_rdd ? [4,1,0] : [10,1,1], ea[1] != M_rdd);
						iTab[op].f = I_TAS;
						cnt++;
					} else {
						BUG.say('OP EXISTS TAS ' + op);
						return false;
					}
				}
			}
		}
		//TRAP		
		{
			var v;

			for (v = 0; v < 16; v++) {
				op = (1252 << 4) | v;

				if (iTab[op].op === -1) {
					iTab[op] = mkD(op, 'TRAP', 0, M_imm, v, [38,4,3], false);
					iTab[op].f = I_TRAP;
					cnt++;
				} else {
					BUG.say('OP EXISTS TRAP ' + op);
					return false;
				}
			}
		}
		//TRAPV	
		{
			op = 0x4E76;

			if (iTab[op].op === -1) {
				iTab[op] = mkN(op, 'TRAPV', [4,1,0]);
				iTab[op].f = I_TRAPV;
				cnt++;
			} else {
				BUG.say('OP EXISTS TRAPV ' + op);
				return false;
			}
		}
		//TST	
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl, M_imm];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (74 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkD(op, 'TST', z2, ea[1], ea[2], [4,1,0], ea[1] != M_rdd && ea[1] != M_rda);
							iTab[op].f = I_TST;
							cnt++;
						} else {
							BUG.say('OP EXISTS TST ' + op);
							return false;
						}
					}
				}
			}
		}
		//UNLK		
		{
			var An;

			for (An = 0; An < 8; An++) {
				op = (2507 << 3) | An;

				if (iTab[op].op === -1) {
					iTab[op] = mkS(op, 'UNLK', 0, M_rda, An, [12,3,0], false);
					iTab[op].f = I_UNLK;
					cnt++;
				} else {
					BUG.say('OP EXISTS UNLK ' + op);
					return false;
				}
			}
		}
		
		//for (op = 0; op < 0x10000; op++) if (iTab[op].op !== -1 && !(iTab[op].p.cyc || iTab[op].p.cycTaken || iTab[op].p.cycTrue || iTab[op].p.cycFalse || typeof(iTab[op].p.cyc) == 'number')) console.log(iTab[op].mn, iTab[op].p.z);
		
		BUG.say(sprintf('cpu.mkiTab() build %d instructions', cnt));
		return true;
	}
	/* ...end of the fun part. */

	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/

	function printIdx(base, ar, pc) {
		var ext = AMIGA.mem.load16(pc);
		var disp = castByte(ext & 0xff);
		var r = (ext & 0x7000) >>> 12;
		var idx = (ext & 0x8000) ? regs.a[r] : regs.d[r];
		if (ext & 0x800) idx = castLong(idx);
		else idx = castWord(idx & 0xffff);
		var addr = (base + disp + idx);
		if (ar != -1)
			return sprintf('(%d,A%d,%s%d)[$%08x]', disp, ar, (ext & 0x8000) ? 'A' : 'D', r, addr);
		else
			return sprintf('(%d,PC,%s%d)[$%08x]', disp, (ext & 0x8000) ? 'A' : 'D', r, addr);
	}

	function printEA(ea, z, m, pc) {
		var dp, o = ' ';

		switch (ea.m) {
			case M_rdd:
				o += sprintf('D%d', ea.r);
				break;
			case M_rda:
				o += sprintf('A%d', ea.r);
				break;
			case M_ria:
				o += sprintf('(A%d)', ea.r);
				break;
			case M_ripo:
				o += sprintf('(A%d)+', ea.r);
				break;
			case M_ripr:
				o += sprintf('-(A%d)', ea.r);
				break;
			case M_rid:
				dp = castWord(AMIGA.mem.load16(pc)); pc += 2;
				o += sprintf('$%04x(A%d)[$%08x]', dp, ea.r, regs.a[ea.r] + dp);
				break;
			case M_rii:
				o += printIdx(regs.a[ea.r], ea.r, pc);
				break;
			case M_pcid:
				dp = castWord(AMIGA.mem.load16(pc));
				o += sprintf('$%04x(PC)[$%08x]', dp, pc + dp);
				pc += 2;
				break;
			case M_pcii:
				o += printIdx(pc, -1, pc); pc += 2;
				break;
			case M_absw:
				dp = castWord(AMIGA.mem.load16(pc)); pc += 2;
				o += sprintf('($%04x)', dp);
				break;
			case M_absl:
				dp = AMIGA.mem.load32(pc); pc += 4;
				o += sprintf('($%08x)', dp);
				break;
			case M_imm: {
				if (ea.r == -1) {
					switch (z) {
						case 1:
							dp = castByte(AMIGA.mem.load16(pc)); pc += 2;
							o += sprintf('#$%02x', dp & 0xff);
							break;
						case 2:
							dp = castWord(AMIGA.mem.load16(pc)); pc += 2;
							o += sprintf('#$%04x', dp);
							break;
						case 4:
							dp = castLong(AMIGA.mem.load32(pc)); pc += 4;
							o += sprintf('#$%08x', dp);
							break;
					}
				} else
					o += sprintf('#$%02x', castByte(ea.r));
				break;
			}
			case M_list:
				dp = AMIGA.mem.load16(pc); pc += 2;
				o += sprintf('#$%04x', dp) + ' ['+regsStr(dp, m == M_ripr)+']';
				break;
		}
		return [o, pc];
	}

	function printC(c, pc) {
		var o = ' ';

		if (c.dp != -1) {
			if (c.dp == 0) {
				var dp = castWord(AMIGA.mem.load16(pc));
				o += sprintf('$%08x', pc + dp);
				pc += 2;
			}
			/*else if (c.dp == 0xff) { //68020
				var dp = castLong(AMIGA.mem.load32(pc)); 
				o += sprintf('$%08x', pc + dp);
				pc += 4;
			}*/
			else {
				var dp = castByte(c.dp);
				o += sprintf('$%08x', pc + dp);
			}
		} else {
			var dp = castWord(AMIGA.mem.load16(pc));
			o += sprintf('D%d,$%08x', c.dr, pc + dp);
			pc += 2;
		}
		return [o, pc];
	}

	function printI(i, pc) {
		var o = i.mn;

		if (o == 'ILLEGAL') return [o, pc];

		if (i.p.z) o += '.' + szChr(i.p.z);
		o += ' ';
		if (i.p.s) {
			var ip = printEA(i.p.s, i.p.z, i.p.d ? i.p.d.m : 0, pc);
			o += ip[0];
			pc = ip[1];
		}
		if (i.p.s && i.p.d) o += ',';
		if (i.p.d) {
			var ip = printEA(i.p.d, i.p.z, i.p.s ? i.p.s.m : 0, pc);
			o += ip[0];
			pc = ip[1];
		}
		if (i.p.c) {
			var ip = printC(i.p.c, pc);
			o += ip[0];
			pc = ip[1];
		}
		return [o, pc];
	}

	this.diss = function (offset, limit) {
      var pc = offset === null ? regs.pc : offset;
      var cnt = 0;

      while (cnt++ < limit) {
         var o = '';

         o += sprintf('$%08x: ', pc);
         for (var i = 0; i < 5; i++)
            o += sprintf('$%04x ', AMIGA.mem.load16(pc + i * 2));

         var op = AMIGA.mem.load16(pc);
         pc += 2;

         var ip = printI(iTab[op], pc);
         o += ip[0];
         pc = ip[1];

         BUG.say(o);
      }
   };
	/*this.dissFault = function (limit) {
      this.diss(fault.pc, limit);
   };*/

	/*function nextIWordData(data, pc) {
		return (data[pc] << 8) | data[pc + 1];
	}
	function nextILongData(data, pc) {
		return (data[pc] << 24) | (data[pc + 1] << 16) | (data[pc + 2] << 8) | data[pc + 3];
	}
	function printIdxData(data, base, ar, pc) {
		var ext = nextIWordData(data, pc);
		var dp8 = castByte(ext & 0xff);
		var r = (ext & 0x7000) >>> 12;
		var idx = (ext & 0x8000) ? regs.a[r] : regs.d[r];
		if (ext & 0x800) idx = castLong(idx);
		else idx = castWord(idx & 0xffff);
		//dispreg <<= (dp >> 9) & 3; //68020
		var addr = (base + dp8 + idx);
		if (ar != -1)
			//return sprintf('(A%d,%s%d,%02x[$%08x][%s])', ar, (dp & 0x8000)?'A':'D', r, disp8, addr, (dp & 0x800)?'L':'W');
			return sprintf('(%d,A%d,%s%d)[$%08x]', dp8, ar, (ext & 0x8000) ? 'A' : 'D', r, addr);
		else
			//return sprintf('(PC($%08x),%s%d,%02x[$%08x][%s])', base, (dp & 0x8000)?'A':'D', r, disp8, addr, (dp & 0x800)?'L':'W');
			return sprintf('(%d,PC,%s%d)[$%08x]', dp8, (ext & 0x8000) ? 'A' : 'D', r, addr);
	}

	function printEAData(data, ea, z, pc) {
		var dp, o = ' ';

		switch (ea.m) {
			case M_rdd:
				o += sprintf('D%d', ea.r);
				break;
			case M_rda:
				o += sprintf('A%d', ea.r);
				break;
			case M_ria:
				o += sprintf('(A%d)', ea.r);
				break;
			case M_ripo:
				o += sprintf('(A%d)+', ea.r);
				break;
			case M_ripr:
				o += sprintf('-(A%d)', ea.r);
				break;
			case M_rid:
				dp = castWord(nextIWordData(data, pc)); pc += 2;
				o += sprintf('($%04x,A%d)[$%08x]', dp, ea.r, regs.a[ea.r] + dp);
				break;
			case M_rii:
				o += printIdxData(data, regs.a[ea.r], ea.r, pc);
				break;
			case M_pcid:
				dp = castWord(nextIWordData(data, pc)); pc += 2;
				o += sprintf('($%04x,PC)[$%08x]', dp, pc + dp);
				break;
			case M_pcii:
				o += printIdxData(data, pc, - 1, pc); pc += 2;
				break;
			case M_absw:
				dp = nextIWordData(data, pc); pc += 2;
				o += sprintf('($%04x).W', dp);
				break;
			case M_absl:
				dp = nextILongData(data, pc); pc += 4;
				o += sprintf('($%08x).L', dp);
				break;
			case M_imm: {
				if (ea.r == -1) {
					switch (z) {
						case 1:
							dp = castByte(nextIWordData(data, pc)); pc += 2;
							o += sprintf('#&lt;$%02x&gt;', dp & 0xff);
							break;
						case 2:
							dp = castWord(nextIWordData(data, pc)); pc += 2;
							o += sprintf('#&lt;$%04x&gt;', dp);
							break;
						case 4:
							dp = castLong(nextILongData(data, pc)); pc += 4;
							o += sprintf('#&lt;$%08x&gt;', dp);
							break;
					}
				} else
					o += sprintf('#&lt;$%02x&gt;', castByte(ea.r));
				break;
			}
			case M_list:
				dp = nextIWordData(data, pc); pc += 2;
				o += sprintf('[$%04x]', dp);
				break;
		}
		return [o, pc];
	}

	function printCData(data, c, pc) {
		var o = ' ';

		if (c.dp != -1) {
			if (c.dp == 0) {
				var dp = castWord(nextIWordData(data, pc));
				o += sprintf('$%08x', pc + dp);
				pc += 2;
			}
			else {
				var dp = castByte(c.dp);
				o += sprintf('$%08x', pc + dp);
			}
		} else {
			var dp = castWord(nextIWordData(data, pc));
			o += sprintf('D%d,$%08x', c.dr, pc + dp);
			pc += 2;
		}
		return [o, pc];
	}

	function printIData(data, i, pc) {
		var o = i.mn;

		if (o == 'ILLEGAL') return [o, pc];

		if (i.p.z) o += '.' + szChr(i.p.z);
		o += ' ';
		if (i.p.s) {
			var ip = printEAData(data, i.p.s, i.p.z, pc);
			o += ip[0];
			pc = ip[1];
		}
		if (i.p.s && i.p.d) o += ',';
		if (i.p.d) {
			var ip = printEAData(data, i.p.d, i.p.z, pc);
			o += ip[0];
			pc = ip[1];
		}
		if (i.p.c) {
			var ip = printCData(data, i.p.c, pc);
			o += ip[0];
			pc = ip[1];
		}
		return [o, pc];
	}
	this.dissData = function (data, limit) {
		var pc = 0;
		var cnt = 0;

		while (cnt++ < limit) {
			var o = '';

			o += sprintf('$%08x: ', pc);
			for (var i = 0; i < 5; i++)
				o += sprintf('$%04x ', nextIWordData(data, pc+i*2));

			var op = nextIWordData(data, pc);
			pc += 2;

			var ip = printIData(data, iTab[op], pc);
			o += ip[0];
			pc = ip[1];

			BUG.say(o);
		}
	}*/

	function getName(addr)
	{
		var c, p = 0, n = '';
		while ((c = AMIGA.mem.load8(addr + p))) {
			n += String.fromCharCode(c);
			if (p++ > 100) return '';
		}
		return n;
	}

	function getTaskName(task) {
		return getName(AMIGA.mem.load32(task + 10));
	}
	
	this.getThisTaskName = function () {
      var tn = '';
      /* Extract current task-name form SysBase */
      var sysBase = AMIGA.mem.load32(4);
      if (sysBase == 0x000676 || sysBase == 0xc00276 || sysBase == 0xc00a88 || sysBase == 0xc00560) {
         var thisTask = AMIGA.mem.load32(sysBase + 276);
         if (thisTask)
            tn = getTaskName(thisTask);
      }
      return tn;
   };
	
	this.dump = function () {
      var i, out = '', tn = 1 ? this.getThisTaskName() : '';

      for (i = 0; i < 8; i++) {
         out += sprintf('D%d $%08x ', i, regs.d[i]); //if ((i & 3) == 3) out += '<br/>';
      }
      //out += '<br/>';
      out += "\n";
      for (i = 0; i < 8; i++) {
         out += sprintf('A%d $%08x ', i, regs.a[i]); //if ((i & 3) == 3) out += '<br/>';
      }
      //out += '<br/>';
      out += "\n";
      out += sprintf('PC $%08x USP $%08x ISP $%08x ', regs.pc, regs.usp, regs.isp);
      out += sprintf('T=%d S=%d X=%d N=%d Z=%d V=%d C=%d IMASK=%d, LTASK=%s', regs.t ? 1 : 0, regs.s ? 1 : 0, regs.x ? 1 : 0, regs.n ? 1 : 0, regs.z ? 1 : 0, regs.v ? 1 : 0, regs.c ? 1 : 0, regs.intmask, tn);
      out += "\n";
      out += "\n";
      BUG.say(out);
   };

	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/

	/*function superState()
	{
		if (!regs.s) {
			regs.s = true; 
			//regs.t = false; 
			var temp = regs.usp;
			regs.usp = regs.a[7];
			regs.a[7] = temp;
			BUG.col = 2;
		}
	}

	function userState(s)
	{
		if (s) {
			var temp = regs.usp;
			regs.usp = regs.a[7];
			regs.a[7] = temp;
			BUG.col = 1;
		}
	}*/

	function getCCR() {
		return (((regs.x ? 1 : 0) << 4) | ((regs.n ? 1 : 0) << 3) | ((regs.z ? 1 : 0) << 2) | ((regs.v ? 1 : 0) << 1) | (regs.c ? 1 : 0));
	}

	function setCCR(ccr) {
		regs.x = ((ccr >> 4) & 1) == 1;
		regs.n = ((ccr >> 3) & 1) == 1;
		regs.z = ((ccr >> 2) & 1) == 1;
		regs.v = ((ccr >> 1) & 1) == 1;
		regs.c = (ccr & 1) == 1;
	}

	function getSR() {
		return (((regs.t ? 1 : 0) << 15) | ((regs.s ? 1 : 0) << 13) | (regs.intmask << 8) | ((regs.x ? 1 : 0) << 4) | ((regs.n ? 1 : 0) << 3) | ((regs.z ? 1 : 0) << 2) | ((regs.v ? 1 : 0) << 1) | (regs.c ? 1 : 0));
	}

	function setSR(sr) {
		regs.x = ((sr >> 4) & 1) == 1;
		regs.n = ((sr >> 3) & 1) == 1;
		regs.z = ((sr >> 2) & 1) == 1;
		regs.v = ((sr >> 1) & 1) == 1;
		regs.c = (sr & 1) == 1;

		var t = ((sr >> 15) & 1) == 1;
		var s = ((sr >> 13) & 1) == 1;
		var intmask = ((sr >> 8) & 7);

		if (regs.t == t && regs.s == s && regs.intmask == intmask) {
			//BUG.say('cpu.setSR() mode ok!');
			return;
		}
		    
		var olds = regs.s;
		regs.t = t;
		regs.s = s;
		regs.intmask = intmask;

		if (regs.s != olds) {
			//BUG.say(sprintf('cpu.setSR() mode switch %s', olds ? 'userstate' : 'superstate'));
			//userState(olds); 

			if (olds) {
				regs.isp = regs.a[7];
				regs.a[7] = regs.usp;

				BUG.col = 1;
			} else {
				BUG.say('cpu.setSR() mode switch to superstate!');

				regs.usp = regs.a[7];
				regs.a[7] = regs.isp;

				BUG.col = 2;
			}
		} 

		AMIGA.doint();
		//if (regs.t1 || regs.t0)
		if (regs.t)
			set_special(SPCFLAG_TRACE);
		else
			/* Keep SPCFLAG_DOTRACE, we still want a trace exception for SR-modifying instructions (including STOP).  */
			clr_special(SPCFLAG_TRACE);				
	}

	function setPC(pc) {
		if (pc & 1) {
			BUG.say(sprintf('cpu.setPC() ADDRESS ERROR pc $%08x', pc));
			AMIGA.cpu.diss(fault.pc, 1);
			//AMIGA.cpu.dump();  
			exception3(pc, 0);
		}
		else if (pc > 0xffffff) {
			BUG.say(sprintf('cpu.setPC() BUS ERROR, $%08x > 24bit, reducing address to $%08x', pc, pc & 0xffffff));
			AMIGA.cpu.diss(fault.pc, 1);
			//AMIGA.cpu.dump();  
			//exception2(pc, 0);
			pc &= 0xffffff;
		}
		else if (pc < 4) {
			BUG.say(sprintf('cpu.setPC() BUS ERROR pc $%08x', pc));
			AMIGA.cpu.diss(fault.pc, 1);
			//AMIGA.cpu.dump();  
			//exception2(pc, 0);
			//AMIGA.state = 0;
		}
		regs.pc = pc;
	}
	
	function exception_trace(n) {
		clr_special(SPCFLAG_TRACE | SPCFLAG_DOTRACE);
		//if (regs.t1 && !regs.t0) {
		if (regs.t) {
			/* trace stays pending if exception is div by zero, chk, trapv or trap #x */
			if (n == 5 || n == 6 || n == 7 || (n >= 32 && n <= 47))
				set_special(SPCFLAG_DOTRACE);
		}
		//regs.t1 = regs.t0 = regs.m = 0;
		regs.t = 0;
	}
	
	/*function exception_cycles(n) {
		var c;
		if (n < 16)
			switch (n) {
				case  0: c = [40,6,0]; break; //Reset Initial Interrupt Stack Pointer             
				case  1: c = [40,6,0]; break; //Reset Initial Program Counter                     
				case  2: c = [50,4,7]; break; //Access Fault                                      
				case  3: c = [50,4,7]; break; //Address Error                                     
				case  4: c = [34,4,3]; break; //Illegal Instruction                               
				case  5: c = [42,5,3]; break; //Integer Divide by Zero                            
				case  6: c = [44,5,3]; break; //CHK, CHK2 Instruction                             
				case  7: c = [34,4,3]; break; //FTRAPcc, TRAPcc, TRAPV Instructions               
				case  8: c = [34,4,3]; break; //Privilege Violation                               
				case  9: c = [34,4,3]; break; //Trace                                             
				case 10: c = [34,4,3]; break; //Line 1010 Emulator (Unimplemented A- Line Opcode) 
				case 11: c = [34,4,3]; break; //Line 1111 Emulator (Unimplemented F-Line Opcode)			
			}		
		else if (n >= 24 && n < 32)
			c = [44+4,5,3];
		else if (n >= 32 && n < 48)
			c = [38,4,3]; 
		else {
			BUG.say(sprintf('cpu.exception() no cycle for %d', n));
			c = [4,0,0];
		}
		return c;
	}*/

	function exception(n) {
		//BUG.say(sprintf('cpu.exception() nr %d', n));
		var olds = regs.s;

		if (n >= 24 && n < 24 + 8) {
			var oldn = n;
			n = AMIGA.mem.load8(0x00fffff1 | (n << 1));
			if (n != oldn) BUG.say(sprintf('cpu.exception() exception from %d to %d', oldn, n));
		}

		var sr = getSR();
		//superState();		
		if (!regs.s) {
			regs.s = true;
			regs.usp = regs.a[7];
			regs.a[7] = regs.isp;
			
			BUG.col = 2;
		}
 
		if (n == 2) {
			BUG.say(sprintf('cpu.exception() %d, regs.pc $%08x, fault.pc $%08x, fault.op $%04x, fault.ad $%08x, fault.ia %d', n, regs.pc, fault.pc, fault.op, fault.ad, fault.ia ? 1 : 0));

			stEA(exEA(new EffAddr(M_ripr, 7), 4), 4, regs.pc);
			stEA(exEA(new EffAddr(M_ripr, 7), 2), 2, sr);
		} else if (n == 3) {
			BUG.say(sprintf('cpu.exception() %d, regs.pc $%08x, fault.pc $%08x, fault.op $%04x, fault.ad $%08x, fault.ia %d', n, regs.pc, fault.pc, fault.op, fault.ad, fault.ia ? 1 : 0));

			var ia = fault.ia;
			var wa = 0;
			var cd = (wa ? 0 : 16) | (olds ? 4 : 0) | (ia ? 2 : 1);

			stEA(exEA(new EffAddr(M_ripr, 7), 4), 4, fault.pc);
			stEA(exEA(new EffAddr(M_ripr, 7), 2), 2, sr);
			stEA(exEA(new EffAddr(M_ripr, 7), 2), 2, fault.op);
			stEA(exEA(new EffAddr(M_ripr, 7), 4), 4, fault.ad);
			stEA(exEA(new EffAddr(M_ripr, 7), 2), 2, cd);							
		} else {
			stEA(exEA(new EffAddr(M_ripr, 7), 4), 4, regs.pc);
			stEA(exEA(new EffAddr(M_ripr, 7), 2), 2, sr);
		}
		
		var pc = AMIGA.mem.load32(n * 4);
		if (pc & 1) {
			BUG.say(sprintf('cpu.exception() ADDRESS ERROR pc $%08x', pc));
			if (n == 2 || n == 3) {
				AMIGA.reset();
				throw new Error('double address/bus-error'); 
			} else
				exception3(pc, 0);
		}
		/*else if (pc > 0xffffff) {
			BUG.say(sprintf('cpu.exception() BUS ERROR pc $%08x', pc));
			//AMIGA.cpu.diss(fault.pc, 1);
			//AMIGA.cpu.dump();  
			exception2(pc, 0);		
		}*/
		regs.pc = pc;
		
		exception_trace(n);
		return [4,0,0];//exception_cycles(n);
	}

	/*function exception2(ad) {
		fault.ad = ad;
		fault.ia = 0;
		throw new Exception23(2);
	}*/
	
	function exception3(ad, ia) {
		fault.ad = ad;
		fault.ia = ia;
		throw new Exception23(3);
	}
	
	function interrupt(nr) {
		regs.stopped = false;
		clr_special(SPCFLAG_STOP);
		//assert(nr < 8 && nr >= 0);

		exception(nr + 24);

		regs.intmask = nr;
		AMIGA.doint();
	}	

	function cycle_spc(cycles) {
		if (AMIGA.spcflags & SPCFLAG_COPPER)
			AMIGA.copper.cycle();

		while ((AMIGA.spcflags & SPCFLAG_BLTNASTY) && AMIGA.dmaen(DMAF_BLTEN) && cycles > 0) {
			var c = AMIGA.blitter.blitnasty();
			//console.log('nasty', cycles, c);
			if (c > 0) {
				cycles -= c * CYCLE_UNIT * 2;
				if (cycles < CYCLE_UNIT)
					cycles = 0;
			} else
				c = 4;

			AMIGA.events.cycle(c * CYCLE_UNIT);
			if (AMIGA.spcflags & SPCFLAG_COPPER)
				AMIGA.copper.cycle();
		}

		if (AMIGA.spcflags & SPCFLAG_DOTRACE)
			exception(9);
			
		if (AMIGA.spcflags & SPCFLAG_TRAP) {
			clr_special(SPCFLAG_TRAP);
			exception(3);
		}

		while (AMIGA.spcflags & SPCFLAG_STOP) {
			AMIGA.events.cycle(4 * CYCLE_UNIT);
			
			if (AMIGA.spcflags & SPCFLAG_COPPER)
				AMIGA.copper.cycle();

			if (AMIGA.spcflags & (SPCFLAG_INT | SPCFLAG_DOINT)) {
				clr_special(SPCFLAG_INT | SPCFLAG_DOINT);
				var intr = AMIGA.intlev();
				if (intr > 0 && intr > regs.intmask)
					interrupt(intr);
			}
			//if (AMIGA.spcflags & SPCFLAG_BRK) {
			if (AMIGA.state != ST_CYCLE) {		
				//clr_special(SPCFLAG_BRK);
				clr_special(SPCFLAG_STOP);
				regs.stopped = false;
				return true;
			}		
		}

		if (AMIGA.spcflags & SPCFLAG_TRACE) {
			if (regs.t) {
				clr_special(SPCFLAG_TRACE);
				set_special(SPCFLAG_DOTRACE);
			}
		}

		if (AMIGA.spcflags & SPCFLAG_INT) {
			clr_special(SPCFLAG_INT | SPCFLAG_DOINT);
			var intr = AMIGA.intlev();
			if (intr > 0 && intr > regs.intmask)
				interrupt(intr);
		}
		if (AMIGA.spcflags & SPCFLAG_DOINT) {
			clr_special(SPCFLAG_DOINT);
			set_special(SPCFLAG_INT);
		}
		/*if (AMIGA.spcflags & SPCFLAG_BRK) {
			clr_special(SPCFLAG_BRK);
			return true;
		}*/		
		return false;		
	}	
	
	this.cycle = function() {
		while (AMIGA.state == ST_CYCLE) {		
			AMIGA.events.cycle(cpu_cycles);

			var op = nextOPCode();	
			try {
				var cycles = iTab[op].f(iTab[op].p);
				cpu_cycles = cycles[0] * cpu_cycle_unit;	
			} catch (e) {
				if (e instanceof Exception23) {
					//BUG.info('cpu.cycle_real() USER EXCEPTION [%d]', e.num);
					var cycles = exception(e.num);
					cpu_cycles = cycles[0] * cpu_cycle_unit;	
				}
				else if (e instanceof VSync) { 
					//BUG.info('cpu.cycle_real() VSYNC [%s]', e);
					cpu_cycles = 48 * cpu_cycle_unit;	
					throw new VSync(e.error, e.message);
				} 
				else if (e instanceof FatalError) { 
					//BUG.info('cpu.cycle_real() FATAL ERROR [%s]', e);
					Fatal(e.error, e.message);
				} 
				else {  				
					Fatal(SAEE_CPU_Internal, e.message);
				}
			}
			
			if (AMIGA.spcflags)
				cycle_spc(cpu_cycles);
		}
	}	
}
