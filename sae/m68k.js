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
| Notes:
| This file consists of two parts: high-level functions, which are ported
| from WinUAE 3.2.x and low-level functions, written from scratch.
-------------------------------------------------------------------------*/
/* global constants */

//const SAEC_CPU_halt_PPC_ONLY = -1;
  const SAEC_CPU_halt_BUS_ERROR_DOUBLE_FAULT = 1;
  const SAEC_CPU_halt_DOUBLE_FAULT = 2;
  const SAEC_CPU_halt_OPCODE_FETCH_FROM_NON_EXISTING_ADDRESS = 3;
//const SAEC_CPU_halt_ACCELERATOR_CPU_FALLBACK = 4;
//const SAEC_CPU_halt_ALL_CPUS_STOPPED = 5;
//const SAEC_CPU_halt_FAKE_DMA = 6;
  const SAEC_CPU_halt_AUTOCONFIG_CONFLICT = 7;
//const SAEC_CPU_halt_PCI_CONFLICT = 8;
//const SAEC_CPU_halt_CPU_STUCK = 9;

/*---------------------------------*/
/* global references */

/*---------------------------------*/
/* global variables */

/*---------------------------------*/

function SAEO_M68K() {
	var reset_delay = false;
	this.halted = 0;
	this.stopped = false;

	var haltloop_prevvpos = false;
	var prevtime = false;

	/*-----------------------------------------------------------------------*/

	this.setup = function() { //init_m68k()
		return SAER.cpu.setup();
	}

	function m68k_reset(hardreset) { //m68k_reset2
		SAEV_spcflags = 0;
		SAEF_setSpcFlags(SAEC_spcflag_CHECK);

		this.halted = 0;
		haltloop_prevvpos = false;
		SAER.gui.data.cpu_halted = 0;
		SAER.gui.led(SAEC_GUI_LED_CPU, 0, -1);

		reset_delay = false;
		prevtime = false;

		SAER.cpu.reset(hardreset);
		//SAER.cpu.diss(regs.pc, 16);
	}

	this.dump = function() {
		//var out = "";
		SAER.cpu.dump();
		//SAEF_log(out);
	}

	/*-----------------------------------------------------------------------*/

	this.cpureset = function() {
		 /* RESET hasn"t increased PC yet, 1 word offset */
		var ksboot = 0xf80002 - 2;

		reset_delay = SAEV_config.cpu.resetDelay;
		SAEF_setSpcFlags(SAEC_spcflag_CHECK);
		//send_internalevent(INTERNALEVENT_CPURESET);
		if (SAEV_config.cpu.compatible && SAEV_config.cpu.model <= SAEC_Config_CPU_Model_68020) {
			SAER.playfield.custom_reset(false, false);
			return;
		}
		var pc = SAER_CPU_getPC() + 2;
		var bank = SAER_Memory_getBank(pc);
		if (bank.check(pc, 2)) {
			SAEF_log("cpu.cpureset() PC=%x (%s)...", pc - 2, bank.name);
			var ins = SAER_Memory_get16(pc);
			SAER.playfield.custom_reset(false, false);
			// did memory disappear under us?
			if (bank === SAER_Memory_getBank(pc))
				return;
			// it did
			if ((ins & ~7) == 0x4ed0) {
				var addr = SAER_CPU_regs.a[ins & 7];
				if (addr < 0x80000)
					addr += 0xf80000;
				SAEF_log("cpu.cpureset() reset/jmp combination at %08x emulated -> %x", pc, addr);
				SAER.cpu.setPC_normal(addr - 2);
				return;
			}
		}
		SAEF_log("cpu.cpureset() PC=%x (%s), invalid memory -> %x.", pc, bank.name, ksboot + 2);
		SAER.playfield.custom_reset(false, false);
		SAER.cpu.setPC_normal(ksboot);
	}

	/*-----------------------------------------------------------------------*/

	this.cpu_halt = function(id) {
		// id < 0: m68k halted, PPC active.
		// id > 0: emulation halted.
		if (!this.halted) {
			SAEF_log("CPU halted: reason = %d PC=%08x", id, SAER_CPU_getPC());
			this.halted = id;
			SAER.gui.data.cpu_halted = id;
			SAER.gui.led(SAEC_GUI_LED_CPU, 0, -1);
			if (id >= 0) {
				SAER_CPU_regs.intmask = 7;
				SAER_Audio_deactivate();
			}
			SAEF_setSpcFlags(SAEC_spcflag_CHECK);
		}
	}

	function haltloop() {
		while (SAER.m68k.halted) {
			//SAEF_log("cpu.haltloop()");
			var vpos = SAER.playfield.get_vpos();
			if (vpos == 0 && haltloop_prevvpos) {
				haltloop_prevvpos = false;
				SAEF_sleep(8);
			}
			if (vpos)
				haltloop_prevvpos = true;

			SAER.events.do_cycles(8 * SAEC_Events_CYCLE_UNIT);

			if (SAEV_spcflags & SAEC_spcflag_COPPER)
				SAER.copper.cycle();

			if (SAEV_spcflags) {
				if ((SAEV_spcflags & (SAEC_spcflag_BRK | SAEC_spcflag_MODE_CHANGE)))
					return true;
			}
		}
		return false;
	}

	/*-----------------------------------------------------------------------*/

	var cpu_keyboardreset = false;
	var cpu_hardreset = true;

	this.is_keyboardreset = function() {
		return cpu_keyboardreset;
	}
	this.is_hardreset = function() {
		return cpu_hardreset;
	}

	this.m68k_pause = function() {
		if (SAEV_command == SAEC_command_Pause) {
			SAEV_command = 0;
			if (!SAER.paused) {
				SAEF_log("->pause");
				SAER.paused = true;
				SAER.pause_program(1);
			}
		}
		else if (SAEV_command == SAEC_command_Resume) {
			SAEV_command = 0;
			if (SAER.paused) {
				SAEF_log("->resume");
				SAER.pause_program(0);
				SAER.paused = false;
				prevtime = false;
			}
		}
		else if (SAEV_command == -SAEC_command_Quit ||
					SAEV_command == -SAEC_command_Reset ||
					SAEV_command == -SAEC_command_KeyboardReset ||
					SAEV_command == -SAEC_command_HardReset
		) {
			SAEF_log("->stop");
			SAER.paused = false;
		}

		if (SAER.paused)
			setTimeout(function() { SAER.m68k.m68k_pause(); }, 500);
		else
			setTimeout(function() { SAER.m68k.m68k_cycle(0, 0); }, 0);
	}

	this.m68k_cycle = function(hardboot, startup) {
		try {
			if (SAEV_command > 0) {
				cpu_keyboardreset = SAEV_command == SAEC_command_KeyboardReset;
				cpu_hardreset = ((SAEV_command == SAEC_command_HardReset ? 1 : 0) | hardboot) != 0;

				if (SAEV_command == SAEC_command_Quit) {
					this.m68k_gone();
					return;
				}
				else if (SAEV_command == SAEC_command_Pause) {
					this.m68k_pause();
					return;
				}

				SAEV_command = 0;
				hardboot = 0;

				SAEV_Events_hsync_counter = 0;
				SAEV_Events_vsync_counter = 0;
				SAEV_Events_currcycle = 0; SAER_Events_eventtab[SAEC_Events_EV_HSYNC].oldcycles = 0;

				SAER.playfield.custom_reset(cpu_hardreset, cpu_keyboardreset);
				m68k_reset(cpu_hardreset);
				if (cpu_hardreset) {
					SAER.memory.clear();
					SAEF_log("m68k.m68k_cycle() hardreset, memory cleared.");
				}

				if (SAEV_config.audio.mode == 0)
					SAER_Events_eventtab[SAEC_Events_EV_AUDIO].active = false;

				SAER.cpu.setPC_normal(SAER_CPU_regs.pc);

				//SAER.audio.check_prefs_changed_audio();

				//statusline_clear();

				if (typeof SAEV_config.hook.event.reseted === "function")
					SAEV_config.hook.event.reseted(cpu_hardreset);

				cpu_hardreset = false;
			}

			if (startup) {
				SAER.playfield.custom_prepare();
				//protect_roms(true);
				startup = 0;
			}
			SAEF_clrSpcFlags(SAEC_spcflag_MODE_CHANGE);

			if (this.halted) {
				this.cpu_halt(this.halted);
				/*if (this.halted < 0) {
					haltloop();
					//continue;
					setTimeout(function() { SAER.m68k.m68k_cycle(hardboot, startup); }, 0);
					return;
				}*/
			}

			if (prevtime !== false) // && SAEV_config.cpu.speed >= 0)
				SAEV_Events_reflowtime = SAEF_now() - prevtime;

			SAER_CPU_run_func();

			//if (SAEV_config.cpu.speed >= 0)
			prevtime = SAEF_now();

			setTimeout(function() { SAER.m68k.m68k_cycle(hardboot, startup); }, 0);
		} catch(e) {
			this.m68k_gone();
			if (e instanceof SAEO_Error) {
				if (typeof SAEV_config.hook.log.error === "function")
					SAEV_config.hook.log.error(e.err, e.msg);
				else
					alert(e.msg);
			} else
				throw e;
		}
	}
	this.m68k_go = function(may_quit) {
		var hardboot = 1;
		var startup = 1;

		//SAEF_info("m68k.m68k_go()");
		SAER.events.reset_frame_rate_hack();

		SAER.running = true;
		//this.m68k_cycle(1, 1);
		setTimeout(function() { SAER.m68k.m68k_cycle(hardboot, startup); }, 0);
	}
	this.m68k_gone = function() {
		//SAEF_info("m68k.m68k_gone()");
		//protect_roms(false);
		SAER.running = false;

		SAER.leave_program();
	}

	/*-----------------------------------------------------------------------*/

	this.m68k_setstopped = function() {
		this.stopped = true;
		/* A traced STOP instruction drops through immediately without actually stopping.  */
		if ((SAEV_spcflags & SAEC_spcflag_DOTRACE) == 0)
			SAEF_setSpcFlags(SAEC_spcflag_STOP);
		else
			this.m68k_resumestopped();
	}

	this.m68k_resumestopped = function() {
		if (this.stopped) {
			this.stopped = false;
			SAER_CPU_fill_prefetch();
			SAEF_clrSpcFlags(SAEC_spcflag_STOP);
		}
	}

	/*-----------------------------------------------------------------------*/

	this.doint = function() {
		if (SAEV_config.cpu.compatible && SAEV_config.cpu.model < SAEC_Config_CPU_Model_68020)
			SAEF_setSpcFlags(SAEC_spcflag_INT);
		else
			SAEF_setSpcFlags(SAEC_spcflag_DOINT);
	}

	this.doint_trace = function(t) { //OWN cpu.setSR()
		//this.doint();
		if (SAEV_config.cpu.compatible && SAEV_config.cpu.model < SAEC_Config_CPU_Model_68020)
			SAEF_setSpcFlags(SAEC_spcflag_INT);
		else
			SAEF_setSpcFlags(SAEC_spcflag_DOINT);
		if (t)
			SAEF_setSpcFlags(SAEC_spcflag_TRACE);
		else
			SAEF_clrSpcFlags(SAEC_spcflag_TRACE);
	}

	/*-----------------------------------------------------------------------*/

	function do_interrupt(nr) {
		this.stopped = false;
		SAEF_clrSpcFlags (SAEC_spcflag_STOP);
		SAEF_assert(nr < 8 && nr >= 0);

		for (;;) {
			SAER_CPU_exception(nr + 24);
			SAER_CPU_regs.intmask = nr;
			if (!SAEV_config.cpu.compatible)
				break;

			nr = SAER.custom.intlev();
			if (nr <= 0 || SAER_CPU_regs.intmask >= nr)
				break;
		}

		SAER.m68k.doint();
	}
	/*this.NMI = function() {
		do_interrupt(7);
	}*/

	//static uaecptr last_trace_ad = 0;
	function do_trace() {
		if (SAER_CPU_regs.t0 && SAEV_config.cpu.model >= SAEC_Config_CPU_Model_68020) {
			/* should also include TRAP, CHK, SR modification FPcc */
			/* probably never used so why bother */
			/* We can afford this to be inefficient... */
			SAER.cpu.setPC_normal(SAER_CPU_getPC());
			SAER_CPU_fill_prefetch();
			var opcode =  SAER_Memory_get16(SAER_CPU_regs.pc);
			if (opcode == 0x4e73 					/* RTE */
				|| opcode == 0x4e74 					/* RTD */
				|| opcode == 0x4e75 					/* RTS */
				|| opcode == 0x4e77 					/* RTR */
				|| opcode == 0x4e76 					/* TRAPV */
				|| (opcode & 0xffc0) == 0x4e80 	/* JSR */
				|| (opcode & 0xffc0) == 0x4ec0 	/* JMP */
				|| (opcode & 0xff00) == 0x6100	/* BSR */
				|| ((opcode & 0xf000) == 0x6000 && ccTab[(opcode >> 8) & 0xf]()) /* Bcc */
				|| ((opcode & 0xf0f0) == 0x5050 && !ccTab[(opcode >> 8) & 0xf]() && SAER_CPU_regs.d[opcode & 7] & 0xffff != 0) /* DBcc */
			) {
				//last_trace_ad = SAER_CPU_getPC();
				SAEF_clrSpcFlags(SAEC_spcflag_TRACE);
				SAEF_setSpcFlags(SAEC_spcflag_DOTRACE);
			}
		} else if (SAER_CPU_regs.t1) {
			//last_trace_ad = SAER_CPU_getPC();
			SAEF_clrSpcFlags(SAEC_spcflag_TRACE);
			SAEF_setSpcFlags(SAEC_spcflag_DOTRACE);
		}
	}

	this.do_specialties = function(cycles) {
		if (SAEV_spcflags & SAEC_spcflag_MODE_CHANGE)
			return true;

		if (SAEV_spcflags & SAEC_spcflag_CHECK) {
			if (this.halted) {
				SAEF_clrSpcFlags(SAEC_spcflag_CHECK);
				if (haltloop())
					return true;
			}
			if (reset_delay) {
				var vsynccnt = 60;
				var vsyncstate = -1;
				while (vsynccnt > 0 && SAEV_command == 0) {
					SAER.events.do_cycles(8 * SAEC_Events_CYCLE_UNIT);
					if (SAEV_spcflags & SAEC_spcflag_COPPER)
						SAER.copper.cycle();
					if (SAEV_Events_timeframes != vsyncstate) {
						vsyncstate = SAEV_Events_timeframes;
						vsynccnt--;
					}
				}
				reset_delay = false;
			}
			SAEF_clrSpcFlags(SAEC_spcflag_CHECK);
		}

		/*#ifdef ACTION_REPLAY
		#ifdef ACTION_REPLAY_HRTMON
		if ((SAEV_spcflags & SAEC_spcflag_ACTION_REPLAY) && hrtmon_flag != ACTION_REPLAY_INACTIVE) {
			int isinhrt = (SAER_CPU_getPC() >= hrtmem_start && SAER_CPU_getPC() < hrtmem_start + hrtmem_size);
			if (hrtmon_flag == ACTION_REPLAY_ACTIVE && !isinhrt)
				hrtmon_hide ();
			if (hrtmon_flag == ACTION_REPLAY_IDLE && isinhrt)
				hrtmon_breakenter ();
			if (hrtmon_flag == ACTION_REPLAY_ACTIVATE)
				hrtmon_enter ();
		}
		#endif
		if ((SAEV_spcflags & SAEC_spcflag_ACTION_REPLAY) && action_replay_flag != ACTION_REPLAY_INACTIVE) {
			if (action_replay_flag == ACTION_REPLAY_ACTIVE && !is_ar_pc_in_rom ())
				SAEF_log("PC:%p", SAER_CPU_getPC());
			if (action_replay_flag == ACTION_REPLAY_ACTIVATE || action_replay_flag == ACTION_REPLAY_DORESET)
				action_replay_enter ();
			if ((action_replay_flag == ACTION_REPLAY_HIDE || action_replay_flag == ACTION_REPLAY_ACTIVE) && !is_ar_pc_in_rom ()) {
				action_replay_hide ();
				SAEF_clrSpcFlags (SAEC_spcflag_ACTION_REPLAY);
			}
			if (action_replay_flag == ACTION_REPLAY_WAIT_PC) {
				SAEF_log("Waiting for PC: %p, current PC= %p", wait_for_pc, SAER_CPU_getPC());
				if (SAER_CPU_getPC() == wait_for_pc) {
					action_replay_flag = ACTION_REPLAY_ACTIVATE;
				}
			}
		}
		#endif*/

		if (SAEV_spcflags & SAEC_spcflag_COPPER)
			SAER.copper.cycle();

		while ((SAEV_spcflags & SAEC_spcflag_BLTNASTY) && SAEF_Custom_dmaen(SAEC_Custom_DMAF_BLTEN) && cycles > 0 && !SAEV_config.chipset.blitter.cycle_exact) {
			var c = SAER.blitter.blitnasty();
			if (c < 0)
				break;
			else if (c > 0) {
				cycles -= c * SAEC_Events_CYCLE_UNIT * 2;
				if (cycles < SAEC_Events_CYCLE_UNIT)
					cycles = 0;
			} else
				c = 4;

			SAER.events.do_cycles(c * SAEC_Events_CYCLE_UNIT);
			if (SAEV_spcflags & SAEC_spcflag_COPPER)
				SAER.copper.cycle();
		}

		if (SAEV_spcflags & SAEC_spcflag_DOTRACE)
			SAER_CPU_exception(9);

		/*if (SAEV_spcflags & SAEC_spcflag_TRAP) {
			SAEF_clrSpcFlags(SAEC_spcflag_TRAP);
			SAER_CPU_exception(3);
		}*/
		var first = true;
		while ((SAEV_spcflags & SAEC_spcflag_STOP) && !(SAEV_spcflags & SAEC_spcflag_BRK)) {
			if (!first) SAER.events.do_cycles(4 * SAEC_Events_CYCLE_UNIT);
			first = false;

			if (SAEV_spcflags & SAEC_spcflag_COPPER)
				SAER.copper.cycle();

			if (SAEV_spcflags & (SAEC_spcflag_INT | SAEC_spcflag_DOINT)) {
				var intr = SAER.custom.intlev();
				SAEF_clrSpcFlags(SAEC_spcflag_INT | SAEC_spcflag_DOINT);

				if (intr > 0 && intr > SAER_CPU_regs.intmask)
					do_interrupt(intr);
			}

			if (SAEV_spcflags & SAEC_spcflag_MODE_CHANGE) {
				this.m68k_resumestopped();
				return true;
			}
		}

		if (SAEV_spcflags & SAEC_spcflag_TRACE)
			do_trace();

		if (SAEV_spcflags & SAEC_spcflag_INT) {
			var intr = SAER.custom.intlev();
			SAEF_clrSpcFlags(SAEC_spcflag_INT | SAEC_spcflag_DOINT);
			if (intr > 0 && (intr > SAER_CPU_regs.intmask || intr == 7))
				do_interrupt(intr);
		}
		if (SAEV_spcflags & SAEC_spcflag_DOINT) {
			SAEF_clrSpcFlags(SAEC_spcflag_DOINT);
			SAEF_setSpcFlags(SAEC_spcflag_INT);
		}

		if (SAEV_spcflags & SAEC_spcflag_BRK) {
			SAEF_clrSpcFlags(SAEC_spcflag_BRK);
			return true; //OWN
		}

		return false;
	}
}
