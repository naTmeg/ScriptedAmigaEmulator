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
-------------------------------------------------------------------------*/
/* errors (copied from amiga.js) */

function SAEO_Error(err, msg) {
	this.err = err;
	this.msg = msg;
}
SAEO_Error.prototype = new Error;

const SAEE_None = 0;

const SAEE_AlreadyRunning = 1;
const SAEE_NotRunning = 2;
const SAEE_NoTimer = 3;
const SAEE_NoMemory = 4;
const SAEE_Assert = 5;
const SAEE_Internal = 6;

const SAEE_Config_Invalid = 10;

const SAEE_CPU_Internal = 20;
const SAEE_CPU_Requires68020 = 21;
const SAEE_CPU_Requires680EC20 = 22;
const SAEE_CPU_Requires68030 = 23;
const SAEE_CPU_Requires68040 = 24;

/*-----------------------------------------------------------------------*/

function ScriptedDisAssembler() {
	this.cpu = new SAEO_CPU();
	var err = this.cpu.setup_da(68030);
	if (err != SAEE_None)
		throw err;

	/*---------------------------------*/

	this.getConfig = function() {
		return this.cpu.getConfig_da();
	}
	this.disassemble = function() {
		return this.cpu.disassemble();
	}
}
