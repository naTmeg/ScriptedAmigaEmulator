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
/*
RoboCop 3
- set firebutton as output
- read JOY1DAT
- pulse firebutton (high->low)
- read JOY1DAT
- JOY1DAT bit 8 must toggle

Leader Board
- JOY1DAT, both up and down active (0x0101)

B.A.T. II
- set all serial pins as output except CTS
- game pulses DTR (high->low)
- CTS must be one
- delay
- CTS must be zero

Italy '90 Soccer
- 220k resistor between pins 5 (+5v) and 7 (POTX)
- POT1DAT POTX must be between 0x32 and 0x60

Dames Grand Maitre
- read POT1
- POT1X != POT1Y
- POT1Y * 256 / POT1X must be between 450 and 500

Rugby Coach
- JOY1DAT, left, up and down active (0x0301)

Cricket Captain
- JOY0DAT bits 0 and 1:
- 10 01 11 allowed
- must continuously change state

Leviathan
- same as Leaderboard but in mouse port

Logistix/SuperBase
- second button must be high
- POT1X = 150k
- POT1Y = 100k
- POT1X * 10 / POT1Y must be between 12 and 33
*/

function SAEO_Dongle() {
	const NONE					= 0;
	const ROBOCOP3				= 1; //Joy2
	const LEADERBOARD			= 2; //Joy2
	const BAT2					= 3; //Ser
	const ITALY90				= 4; //Joy2
	const DAMESGRANDMAITRE	= 5; //Joy2
	const RUGBYCOACH			= 6; //Joy2
	const CRICKETCAPTAIN		= 7; //Joy1
	const LEVIATHAN			= 8; //Joy1
	const LOGISTIX				= 9; //Joy2

	const CYCLE_UNIT_200 = SAEC_Events_CYCLE_UNIT * 200;

	var flag = 0; //int
	var cycles = 0; //unsigned int

	/*var oldcia = new Array(2); //u8 [2][16]
	oldcia[0] =  new Uint8Array(16);
	oldcia[1] =  new Uint8Array(16);*/

	/*---------------------------------*/

	this.cia_read = function(cia, reg, val) { //dongle_cia_read()
		switch (SAEV_config.dongle) {
			case BAT2: {
				if (cia == 1 && reg == 0) {
					if (flag == 0 || SAEV_Events_currcycle > cycles + CYCLE_UNIT_200) {
						val &= ~0x10;
						flag = 0;
					} else
						val |= 0x10;
				}
				break;
			}
		}
		return val;
	}

	this.cia_write = function(cia, reg, val) { //dongle_cia_write()
		switch (SAEV_config.dongle) {
			case NONE:
				return;
			case ROBOCOP3: {
				if (cia == 0 && reg == 0 && (val & 0x80))
					flag ^= 1;
				break;
			}
			case BAT2: {
				if (cia == 1 && reg == 0 && !(val & 0x80)) {
					flag = 1;
					cycles = SAEV_Events_currcycle;
				}
				break;
			}
		}
		//oldcia[cia][reg] = val;
	}

	/*---------------------------------*/

	this.joytest = function(val) {} //dongle_joytest()

	this.joydat = function(port, val) { //dongle_joydat()
		switch (SAEV_config.dongle) {
			case NONE:
				break;
			case ROBOCOP3: {
				if (port == 1 && flag != 0)
					val += 0x100;
				break;
			}
			case LEADERBOARD: {
				if (port == 1) {
					val &= ~0x0303;
					val |= 0x0101;
				}
				break;
			}
			case LEVIATHAN: {
				if (port == 0) {
					val &= ~0x0303;
					val |= 0x0101;
				}
				break;
			}
			case RUGBYCOACH: {
				if (port == 1) {
					val &= ~0x0303;
					val|= 0x0301;
				}
				break;
			}
			case CRICKETCAPTAIN: {
				if (port == 0) {
					val &= ~0x0003;
					if (flag == 0)
						val |= 0x0001;
					else
						val |= 0x0002;
				}
				flag ^= 1;
				break;
			}
		}
		return val;
	}

	/*---------------------------------*/

	this.potgo = function(val) { //dongle_potgo()
		switch (SAEV_config.dongle) {
			case NONE:
				return;
			case ITALY90:
			case LOGISTIX:
			case DAMESGRANDMAITRE:
				//flag = (uaerand() & 7) - 3;
				flag = ((Math.random() * 8) >>> 0) - 3;
				break;
		}
	}

	this.potgor = function(val) { //dongle_potgor()
		switch (SAEV_config.dongle) {
			case LOGISTIX:
				val |= 1 << 14;
				break;
		}
		return val;
	}

	/*---------------------------------*/

	this.analogjoy = function(joy, axis) { //dongle_analogjoy()
		var v = -1; //int

		switch (SAEV_config.dongle) {
			case NONE:
				return -1;
			case ITALY90:
				if (joy == 1 && axis == 0)
					v = 73;
				break;
			case LOGISTIX:
				if (joy == 1) {
					if (axis == 0)
						v = 21;
					if (axis == 1)
						v = 10;
				}
				break;
			case DAMESGRANDMAITRE:
				if (joy == 1) {
					if (axis == 1)
						v = 80;
					if (axis == 0)
						v = 43;
				}
				break;
		}
		if (v >= 0) {
			v += flag;
			if (v < 0)
				v = 0;
		}
		return v;
	}

	/*---------------------------------*/

	this.reset = function() { //dongle_reset()
		flag = 0;
		cycles = 0; //OWN

		//memset (oldcia, 0, sizeof oldcia);
		//for (var i = 0; i < 16; i++) oldcia[0][i] = oldcia[1][i] = 0;
	}
}
