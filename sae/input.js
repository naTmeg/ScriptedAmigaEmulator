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
| Note: partially ported from WinUAE 3.2.x
-------------------------------------------------------------------------*/
/* global constants */

const SAEC_Input_Event_Press = 10; /*  */
const SAEC_Input_Event_MouseMove = 20; /*  */
const SAEC_Input_Event_JoystickMove = 30; /*  */

const SAEC_Input_Button_1 = 1; /* fire/left mousebutton (JOYBUTTON_1) */
const SAEC_Input_Button_2 = 2; /* 2nd/right mousebutton (JOYBUTTON_2) */
const SAEC_Input_Button_3 = 4; /* 3rd/middle mousebutton (JOYBUTTON_3) */
/*const JOYBUTTON_CD32_PLAY = 8;
const JOYBUTTON_CD32_RWD = 16;
const JOYBUTTON_CD32_FFW = 32;
const JOYBUTTON_CD32_GREEN = 64;
const JOYBUTTON_CD32_YELLOW = 128;
const JOYBUTTON_CD32_RED = 256;
const JOYBUTTON_CD32_BLUE = 512;*/

const SAEC_Input_Direction_Left = 1; //DIR_LEFT
const SAEC_Input_Direction_Right = 2; //DIR_RIGHT
const SAEC_Input_Direction_Up = 4; //DIR_UP
const SAEC_Input_Direction_Down = 8; //DIR_DOWN

/*---------------------------------*/

function SAEO_Mouse(port) {
	var prt = port;
	var lx = -1, ly = -1;

	/*---------------------------------*/

	this.reset = function() {
		lx = ly = -1;
	};

	/*---------------------------------*/

	function moveNormal(e) {
		e = e || window.event; if (e === undefined) return;

		if (e.pageX !== undefined) {
			var x = e.pageX;
			var y = e.pageY;
		} else if (e.clientX !== undefined) {
			var x = e.clientX;
			var y = e.clientY;
		} else
			return;

		if (lx != -1)
			SAER.input.registerEvent(0, SAEC_Input_Event_MouseMove, x-lx, y-ly);

		lx = x;
		ly = y;
	}
	function moveLocked(e) {
		e = e || window.event; if (e === undefined) return;

		if (e.movementX !== undefined) {
			var x = e.movementX;
			var y = e.movementY;
		} else if (e.mozMovementX !== undefined) {
			var x = e.mozMovementX;
			var y = e.mozMovementY;
		} else
			return;

		SAER.input.registerEvent(0, SAEC_Input_Event_MouseMove, x, y);
	}

	this.attach = function(el, pl) {
		el.onmousedown = function(e) {
			e = e || window.event; if (e === undefined) return;
			switch (e.button) {
				case 0: SAER.input.registerEvent(prt, SAEC_Input_Event_Press, SAEC_Input_Button_1, true); break;
				case 2: SAER.input.registerEvent(prt, SAEC_Input_Event_Press, SAEC_Input_Button_2, true); break;
				case 1: SAER.input.registerEvent(prt, SAEC_Input_Event_Press, SAEC_Input_Button_3, true); break;
			}
		};
		el.onmouseup = function(e) {
			e = e || window.event; if (e === undefined) return;
			switch (e.button) {
				case 0: SAER.input.registerEvent(prt, SAEC_Input_Event_Press, SAEC_Input_Button_1, false); break;
				case 2: SAER.input.registerEvent(prt, SAEC_Input_Event_Press, SAEC_Input_Button_2, false); break;
				case 1: SAER.input.registerEvent(prt, SAEC_Input_Event_Press, SAEC_Input_Button_3, false); break;
			}
		};
		if (pl)
			document.addEventListener("mousemove", moveLocked, false);
		else {
			el.onmouseover = function(e) {
				e = e || window.event; if (e === undefined) return;
				if (SAEV_config.video.cursor == SAEC_Config_Video_Cursor_Hide)
					SAER.video.hideCursor(true);
			};
			el.onmouseout = function(e) {
				e = e || window.event; if (e === undefined) return;
				//mouseup(e);
				if (SAEV_config.video.cursor == SAEC_Config_Video_Cursor_Hide)
					SAER.video.hideCursor(false);
			};
			el.onmousemove = function(e) {
				moveNormal(e);
			};
		}
	};

	this.dettach = function(el, pl) {
		el.onmousedown = function(e) {};
		el.onmouseup = function(e) {};
		if (pl)
			document.removeEventListener("mousemove", moveLocked, false);
		else {
			el.onmouseover = function(e) {};
			el.onmouseout = function(e) {};
			el.onmousemove = function(e) {};
		}
	};
}

function SAEO_Joystick(port) {
	var prt = port;
	var numButtons = 0, numAxes = 0;
	var buttons = [false,false,false,false,false,false,false,false,false,false];
	var direction = [false,false,false,false];
	var requestID = null;

	/*---------------------------------*/

	/* the gamepad API only supports polling not events */
	function pollGamepad() {
		var dev = SAEV_config.ports[prt].device;
		if (navigator.getGamepads)
			var pad = navigator.getGamepads()[dev];
		else if (navigator.webkitGetGamepads)
			var pad = navigator.webkitGetGamepads()[dev];
		else
			var pad = null;

		if (pad && pad.connected) {
			for (var i = 0; i < Math.min(numButtons, 10); i++) {
				if (pad.buttons[i].pressed != buttons[i]) {
					SAER.input.registerEvent(prt, SAEC_Input_Event_Press, 1 << i, pad.buttons[i].pressed);
					buttons[i] = pad.buttons[i].pressed;
				}
			}

			const trigger = 0.5;
			//var pressed = (numAxes == 4 ? pad.axes[2] : pad.axes[0]) < -trigger;
			var pressed = pad.axes[0] < -trigger;
			if (pressed != direction[0]) {
				SAER.input.registerEvent(prt, SAEC_Input_Event_JoystickMove, SAEC_Input_Direction_Left, pressed);
				direction[0] = pressed;
			}
			if (!pressed) {
				//pressed = (numAxes == 4 ? pad.axes[2] : pad.axes[0]) > trigger;
				pressed = pad.axes[0] > trigger;
				if (pressed != direction[1]) {
					SAER.input.registerEvent(prt, SAEC_Input_Event_JoystickMove, SAEC_Input_Direction_Right, pressed);
					direction[1] = pressed;
				}
			}
			//pressed = (numAxes == 4 ? pad.axes[3] : pad.axes[1]) < -trigger;
			pressed = pad.axes[1] < -trigger;
			if (pressed != direction[2]) {
				SAER.input.registerEvent(prt, SAEC_Input_Event_JoystickMove, SAEC_Input_Direction_Up, pressed);
				direction[2] = pressed;
			}
			if (!pressed) {
				//pressed = (numAxes == 4 ? pad.axes[3] : pad.axes[1]) > trigger;
				pressed = pad.axes[1] > trigger;
				if (pressed != direction[3]) {
					SAER.input.registerEvent(prt, SAEC_Input_Event_JoystickMove, SAEC_Input_Direction_Down, pressed);
					direction[3] = pressed;
				}
			}

			requestID = window.requestAnimationFrame(pollGamepad); /* next request */
		}
	}

	this.enable = function() {
		requestID = window.requestAnimationFrame(pollGamepad); /* initial request */
	}

	this.disable = function() {
		if (requestID !== null) {
			window.cancelAnimationFrame(requestID);
			requestID = null;
		}
	}

	/*---------------------------------*/

	this.reset = function() {
		var i;
		for (i = 0; i < buttons.length; i++) buttons[i] = false;
		for (i = 0; i < direction.length; i++) direction[i] = false;
		requestID = null;
	};

	this.setup = function() {
		if (SAEV_config.ports[prt].type == SAEC_Config_Ports_Type_Joy) {
			var dev = SAEV_config.ports[prt].device;
			var pad;
			if (navigator.getGamepads)
				pad = navigator.getGamepads()[dev];
			else if (navigator.webkitGetGamepads)
				pad = navigator.webkitGetGamepads()[dev];
			else
				pad = null;

			if (pad && pad.connected) {
				numButtons = pad.buttons.length;
				numAxes = pad.axes.length;

				SAEF_log("Joystick.setup() assigned controller " + pad.id + " #" + pad.index + " to port " + prt);
			} else {
				SAEF_error("Joystick.setup() chosen gamepad device with index " + dev + " was not detected.");
				return SAEE_Input_GamepadNotReady;
			}
		}
		return SAEE_None;
	};

	this.cleanup = function() {
		this.disable();
		numButtons = numAxes = 0;
	};
}

function SAEO_Keyboard() {
	const DOM_KEY_LOCATION_STANDARD = 0x00;
	const DOM_KEY_LOCATION_LEFT     = 0x01;
	const DOM_KEY_LOCATION_RIGHT    = 0x02;
	const DOM_KEY_LOCATION_NUMPAD   = 0x03;

	const RAWKEY_TILDE             = 0x00;
	const RAWKEY_1                 = 0x01;
	const RAWKEY_2                 = 0x02;
	const RAWKEY_3                 = 0x03;
	const RAWKEY_4                 = 0x04;
	const RAWKEY_5                 = 0x05;
	const RAWKEY_6                 = 0x06;
	const RAWKEY_7                 = 0x07;
	const RAWKEY_8                 = 0x08;
	const RAWKEY_9                 = 0x09;
	const RAWKEY_0                 = 0x0A;
	const RAWKEY_MINUS             = 0x0B;
	const RAWKEY_EQUAL             = 0x0C;
	//const RAWKEY_BACKSLASH         = 0x0D;
	const RAWKEY_KP_0              = 0x0F;
	const RAWKEY_Q                 = 0x10;
	const RAWKEY_W                 = 0x11;
	const RAWKEY_E                 = 0x12;
	const RAWKEY_R                 = 0x13;
	const RAWKEY_T                 = 0x14;
	const RAWKEY_Y                 = 0x15;
	const RAWKEY_U                 = 0x16;
	const RAWKEY_I                 = 0x17;
	const RAWKEY_O                 = 0x18;
	const RAWKEY_P                 = 0x19;
	const RAWKEY_LBRACKET          = 0x1A;
	const RAWKEY_RBRACKET          = 0x1B;
	const RAWKEY_KP_1              = 0x1D;
	const RAWKEY_KP_2              = 0x1E;
	const RAWKEY_KP_3              = 0x1F;
	const RAWKEY_A                 = 0x20;
	const RAWKEY_S                 = 0x21;
	const RAWKEY_D                 = 0x22;
	const RAWKEY_F                 = 0x23;
	const RAWKEY_G                 = 0x24;
	const RAWKEY_H                 = 0x25;
	const RAWKEY_J                 = 0x26;
	const RAWKEY_K                 = 0x27;
	const RAWKEY_L                 = 0x28;
	const RAWKEY_SEMICOLON         = 0x29;
	const RAWKEY_QUOTE             = 0x2A;
	const RAWKEY_2B                = 0x2B;
	const RAWKEY_KP_4              = 0x2D;
	const RAWKEY_KP_5              = 0x2E;
	const RAWKEY_KP_6              = 0x2F;
	const RAWKEY_LESSGREATER       = 0x30;
	const RAWKEY_Z                 = 0x31;
	const RAWKEY_X                 = 0x32;
	const RAWKEY_C                 = 0x33;
	const RAWKEY_V                 = 0x34;
	const RAWKEY_B                 = 0x35;
	const RAWKEY_N                 = 0x36;
	const RAWKEY_M                 = 0x37;
	const RAWKEY_COMMA             = 0x38;
	const RAWKEY_PERIOD            = 0x39;
	const RAWKEY_SLASH             = 0x3A;
	const RAWKEY_KP_DECIMAL        = 0x3C;
	const RAWKEY_KP_7              = 0x3D;
	const RAWKEY_KP_8              = 0x3E;
	const RAWKEY_KP_9              = 0x3F;
	const RAWKEY_SPACE             = 0x40;
	const RAWKEY_BACKSPACE         = 0x41;
	const RAWKEY_TAB               = 0x42;
	const RAWKEY_KP_ENTER          = 0x43;
	const RAWKEY_RETURN            = 0x44;
	const RAWKEY_ESCAPE            = 0x45;
	const RAWKEY_DELETE            = 0x46;
	const RAWKEY_INSERT            = 0x47;
	const RAWKEY_PAGEUP            = 0x48;
	const RAWKEY_PAGEDOWN          = 0x49;
	const RAWKEY_KP_MINUS          = 0x4A;
	//const RAWKEY_F11               = 0x4B;
	const RAWKEY_UP                = 0x4C;
	const RAWKEY_DOWN              = 0x4D;
	const RAWKEY_RIGHT             = 0x4E;
	const RAWKEY_LEFT              = 0x4F;
	const RAWKEY_F1                = 0x50;
	const RAWKEY_F2                = 0x51;
	const RAWKEY_F3                = 0x52;
	const RAWKEY_F4                = 0x53;
	const RAWKEY_F5                = 0x54;
	const RAWKEY_F6                = 0x55;
	const RAWKEY_F7                = 0x56;
	const RAWKEY_F8                = 0x57;
	const RAWKEY_F9                = 0x58;
	const RAWKEY_F10               = 0x59;
	const RAWKEY_KP_DIVIDE         = 0x5C;
	const RAWKEY_KP_MULTIPLY       = 0x5D;
	const RAWKEY_KP_PLUS           = 0x5E;
	const RAWKEY_HELP              = 0x5F;
	const RAWKEY_LSHIFT            = 0x60;
	const RAWKEY_RSHIFT            = 0x61;
	const RAWKEY_CAPSLOCK          = 0x62;
	const RAWKEY_CONTROL           = 0x63;
	const RAWKEY_LALT              = 0x64;
	const RAWKEY_RALT              = 0x65;
	const RAWKEY_LAMIGA            = 0x66;
	const RAWKEY_RAMIGA            = 0x67;
	const RAWKEY_SCRLOCK           = 0x6B;
	//const RAWKEY_PRTSCREEN         = 0x6C;*/
	const RAWKEY_NUMLOCK           = 0x6D;
	const RAWKEY_PAUSE             = 0x6E;
	//const RAWKEY_F12               = 0x6F;
	const RAWKEY_HOME              = 0x70;
	const RAWKEY_END               = 0x71;
	/*const RAWKEY_MEDIA1            = 0x72;
	const RAWKEY_MEDIA2            = 0x73;
	const RAWKEY_MEDIA3            = 0x74;
	const RAWKEY_MEDIA4            = 0x75;
	const RAWKEY_MEDIA5            = 0x76;
	const RAWKEY_MEDIA6            = 0x77;*/
	const RAWKEY_RESETWARNING      = 0x78;
	/*const RAWKEY_NM_WHEEL_UP       = 0x7A;
	const RAWKEY_NM_WHEEL_DOWN     = 0x7B;
	const RAWKEY_NM_WHEEL_LEFT     = 0x7C;
	const RAWKEY_NM_WHEEL_RIGHT    = 0x7D;
	const RAWKEY_NM_BUTTON_FOURTH  = 0x7E;
 	const RAWKEY_BAD_CODE			= 0xF9;
 	const RAWKEY_BUFFER_OVERFLOW	= 0xFA;
 	const RAWKEY_SELFTEST_FAILED	= 0xFC;*/
 	const RAWKEY_INIT_POWER_UP		= 0xFD;
 	const RAWKEY_TERM_POWER_UP		= 0xFE;

	const defKeyCodeMap = {
			8:RAWKEY_BACKSPACE, //backspace
			9:RAWKEY_TAB, //tab
		  13:RAWKEY_RETURN, //enter
		  16:RAWKEY_LSHIFT, //shift
		  17:RAWKEY_CONTROL, //ctrl
		  18:RAWKEY_LALT, //alt
		  19:RAWKEY_PAUSE, //pause/break
		  20:RAWKEY_CAPSLOCK, //caps lock
		  27:RAWKEY_ESCAPE, //escape
		  32:RAWKEY_SPACE, //space
		  33:RAWKEY_PAGEUP, //page up
		  34:RAWKEY_PAGEDOWN, //page down
		  35:RAWKEY_END, //end
		  36:RAWKEY_HOME, //home
		  37:RAWKEY_LEFT, //left arrow
		  38:RAWKEY_UP, //up arrow
		  39:RAWKEY_RIGHT, //right arrow
		  40:RAWKEY_DOWN, //down arrow
		  45:RAWKEY_INSERT, //insert
		  46:RAWKEY_DELETE, //delete
		  48:RAWKEY_0, //0
		  49:RAWKEY_1, //1
		  50:RAWKEY_2, //2
		  51:RAWKEY_3, //3
		  52:RAWKEY_4, //4
		  53:RAWKEY_5, //5
		  54:RAWKEY_6, //6
		  55:RAWKEY_7, //7
		  56:RAWKEY_8, //8
		  57:RAWKEY_9, //9
		  65:RAWKEY_A, //a
		  66:RAWKEY_B, //b
		  67:RAWKEY_C, //c
		  68:RAWKEY_D, //d
		  69:RAWKEY_E, //e
		  70:RAWKEY_F, //f
		  71:RAWKEY_G, //g
		  72:RAWKEY_H, //h
		  73:RAWKEY_I, //i
		  74:RAWKEY_J, //j
		  75:RAWKEY_K, //k
		  76:RAWKEY_L, //l
		  77:RAWKEY_M, //m
		  78:RAWKEY_N, //n
		  79:RAWKEY_O, //o
		  80:RAWKEY_P, //p
		  81:RAWKEY_Q, //q
		  82:RAWKEY_R, //r
		  83:RAWKEY_S, //s
		  84:RAWKEY_T, //t
		  85:RAWKEY_U, //u
		  86:RAWKEY_V, //v
		  87:RAWKEY_W, //w
		  88:RAWKEY_X, //x
		  89:RAWKEY_Z, //y
		  90:RAWKEY_Y, //z
		  91:RAWKEY_LAMIGA, //left window key
		  92:RAWKEY_RAMIGA, //right window key
		  93:RAWKEY_HELP, //select key
		  96:RAWKEY_KP_0, //numpad 0
		  97:RAWKEY_KP_1, //numpad 1
		  98:RAWKEY_KP_2, //numpad 2
		  99:RAWKEY_KP_3, //numpad 3
		 100:RAWKEY_KP_4, //numpad 4
		 101:RAWKEY_KP_5, //numpad 5
		 102:RAWKEY_KP_6, //numpad 6
		 103:RAWKEY_KP_7, //numpad 7
		 104:RAWKEY_KP_8, //numpad 8
		 105:RAWKEY_KP_9, //numpad 9
		 106:RAWKEY_KP_MULTIPLY, //multiply
		 107:RAWKEY_KP_PLUS, //add
		 109:RAWKEY_KP_MINUS, //subtract
		 110:RAWKEY_KP_DECIMAL, //decimal point
		 111:RAWKEY_KP_DIVIDE, //divide
		 112:RAWKEY_F1	, //f1
		 113:RAWKEY_F2	, //f2
		 114:RAWKEY_F3	, //f3
		 115:RAWKEY_F4	, //f4
		 116:RAWKEY_F5	, //f5
		 117:RAWKEY_F6	, //f6
		 118:RAWKEY_F7	, //f7
		 119:RAWKEY_F8	, //f8
		 120:RAWKEY_F9	, //f9
		 121:RAWKEY_F10, //f10
		 //122:RAWKEY_F11, //f11
		 //123:RAWKEY_F12, //f12
		 144:RAWKEY_NUMLOCK, //num lock
		 145:RAWKEY_SCRLOCK, //scroll lock
		 /*186:RAWKEY_SEMICOLON, //semi-colon
		 187:RAWKEY_EQUAL, //equal sign
		 188:RAWKEY_COMMA, //comma
		 189:RAWKEY_MINUS, //dash
		 190:RAWKEY_PERIOD, //period
		 191:RAWKEY_SLASH, //forward slash
		 192:RAWKEY_TILDE, //grave accent
		 219:RAWKEY_LBRACKET, //open bracket
		 220:RAWKEY_BACKSLASH, //back slash
		 221:RAWKEY_RBRACKET, //close braket
		 222:RAWKEY_QUOTE, //single quote
		 226:RAWKEY_LESSGREATER*/
		 186:RAWKEY_LBRACKET,
		 187:RAWKEY_RBRACKET,
		 188:RAWKEY_COMMA,
		 189:RAWKEY_SLASH,
		 190:RAWKEY_PERIOD,
		 191:RAWKEY_2B,
		 192:RAWKEY_SEMICOLON,
		 219:RAWKEY_MINUS,
		 220:RAWKEY_TILDE,
		 221:RAWKEY_EQUAL,
		 222:RAWKEY_QUOTE,
		 226:RAWKEY_LESSGREATER
	};
	const mozKeyCodeMap = {
			8:RAWKEY_BACKSPACE, //backspace
			9:RAWKEY_TAB, //tab
		  13:RAWKEY_RETURN, //enter
		  16:RAWKEY_LSHIFT, //shift
		  17:RAWKEY_CONTROL, //ctrl
		  18:RAWKEY_LALT, //alt
		  19:RAWKEY_PAUSE, //pause/break
		  20:RAWKEY_CAPSLOCK, //caps lock
		  27:RAWKEY_ESCAPE, //escape
		  32:RAWKEY_SPACE, //space
		  33:RAWKEY_PAGEUP, //page up
		  34:RAWKEY_PAGEDOWN, //page down
		  35:RAWKEY_END, //end
		  36:RAWKEY_HOME, //home
		  37:RAWKEY_LEFT, //left arrow
		  38:RAWKEY_UP, //up arrow
		  39:RAWKEY_RIGHT, //right arrow
		  40:RAWKEY_DOWN, //down arrow
		  45:RAWKEY_INSERT, //insert
		  46:RAWKEY_DELETE, //delete
		  48:RAWKEY_0, //0
		  49:RAWKEY_1, //1
		  50:RAWKEY_2, //2
		  51:RAWKEY_3, //3
		  52:RAWKEY_4, //4
		  53:RAWKEY_5, //5
		  54:RAWKEY_6, //6
		  55:RAWKEY_7, //7
		  56:RAWKEY_8, //8
		  57:RAWKEY_9, //9
		  60:RAWKEY_LESSGREATER,
		  63:RAWKEY_MINUS,
		  65:RAWKEY_A, //a
		  66:RAWKEY_B, //b
		  67:RAWKEY_C, //c
		  68:RAWKEY_D, //d
		  69:RAWKEY_E, //e
		  70:RAWKEY_F, //f
		  71:RAWKEY_G, //g
		  72:RAWKEY_H, //h
		  73:RAWKEY_I, //i
		  74:RAWKEY_J, //j
		  75:RAWKEY_K, //k
		  76:RAWKEY_L, //l
		  77:RAWKEY_M, //m
		  78:RAWKEY_N, //n
		  79:RAWKEY_O, //o
		  80:RAWKEY_P, //p
		  81:RAWKEY_Q, //q
		  82:RAWKEY_R, //r
		  83:RAWKEY_S, //s
		  84:RAWKEY_T, //t
		  85:RAWKEY_U, //u
		  86:RAWKEY_V, //v
		  87:RAWKEY_W, //w
		  88:RAWKEY_X, //x
		  89:RAWKEY_Z, //y
		  90:RAWKEY_Y, //z
		  91:RAWKEY_LAMIGA, //left window key
		  92:RAWKEY_RAMIGA, //right window key
		  93:RAWKEY_HELP, //select key
		  96:RAWKEY_KP_0, //numpad 0
		  97:RAWKEY_KP_1, //numpad 1
		  98:RAWKEY_KP_2, //numpad 2
		  99:RAWKEY_KP_3, //numpad 3
		 100:RAWKEY_KP_4, //numpad 4
		 101:RAWKEY_KP_5, //numpad 5
		 102:RAWKEY_KP_6, //numpad 6
		 103:RAWKEY_KP_7, //numpad 7
		 104:RAWKEY_KP_8, //numpad 8
		 105:RAWKEY_KP_9, //numpad 9
		 106:RAWKEY_KP_MULTIPLY, //multiply
		 107:RAWKEY_KP_PLUS, //add
		 109:RAWKEY_KP_MINUS, //subtract
		 110:RAWKEY_KP_DECIMAL, //decimal point
		 111:RAWKEY_KP_DIVIDE, //divide
		 112:RAWKEY_F1	, //f1
		 113:RAWKEY_F2	, //f2
		 114:RAWKEY_F3	, //f3
		 115:RAWKEY_F4	, //f4
		 116:RAWKEY_F5	, //f5
		 117:RAWKEY_F6	, //f6
		 118:RAWKEY_F7	, //f7
		 119:RAWKEY_F8	, //f8
		 120:RAWKEY_F9	, //f9
		 121:RAWKEY_F10, //f10
		 //122:RAWKEY_F11, //f11
		 //123:RAWKEY_F12, //f12
		 144:RAWKEY_NUMLOCK, //num lock
		 145:RAWKEY_SCRLOCK, //scroll lock
		 160:RAWKEY_TILDE,
		 163:RAWKEY_2B,
		 171:RAWKEY_RBRACKET,
		 173:RAWKEY_SLASH,
		 188:RAWKEY_COMMA,
		 190:RAWKEY_PERIOD,
		 192:RAWKEY_EQUAL
	};
	const MAXKEYS = 256;
	const KEYBUFSIZE = 512;
	const USECAPTURE = false; /* capturing/bubbling phase */

	var keyState = new Array(4);
	for (var vi = 0; vi < 4; vi++)
		keyState[vi] = new Uint8Array(MAXKEYS);

	var keyBuf = new Uint8Array(KEYBUFSIZE);

	var state = 0;
	var code = 0;
	var first = 0, last = 0;
	var capsLock = false;


	function keydown(e) { handleKey(e, true); }
	function keyup(e) { handleKey(e, false); }
	/*function fullscreenchange(e) {
		SAEF_log("fullscreenchange()");
	}*/

	this.setup = function() {
		if (SAEV_config.keyboard.enabled) {
			document.addEventListener("keydown", keydown, USECAPTURE);
			document.addEventListener("keyup", keyup, USECAPTURE);
			//document.addEventListener("webkitfullscreenchange", fullscreenchange);
		}
	};

	this.cleanup = function() {
		if (SAEV_config.keyboard.enabled) {
			document.removeEventListener("keydown", keydown, USECAPTURE);
			document.removeEventListener("keyup", keyup, USECAPTURE);
			//document.removeEventListener("webkitfullscreenchange", fullscreenchange);
		}
	};

	this.reset = function() {
		for (var j = 0; j < keyState.length; j++) {
			for (var i = 0; i < keyState[j].length; i++)
				keyState[j][i] = 0;
		}
		state = 0;
		code = 0;
		first = last = 0;
	};

	this.keysAvail = function() {
		return first != last;
	};

	this.nextKey = function() {
		SAEF_assert(first != last);
		var key = keyBuf[last];
		if (++last == KEYBUFSIZE) last = 0;
		return key;
	};

	function recordKey(kc) {
		var next = first + 1;

		if (next == KEYBUFSIZE) next = 0;
		if (next == last) {
			SAEF_warn("imput.recordKey() buffer overrun!");
			return false;
		}
		keyBuf[first] = kc;
		first = next;
		return true;
	};

	function processKey(loc, code, down) {
		/* Caps-lock */
		if (code == 20) {
			if (down) {
				capsLock = !capsLock;
				if (!capsLock) return;
			} else {
				if (capsLock) return;
			}
		}

		/* joystick emul */
		if (SAEV_config.ports[0].type == SAEC_Config_Ports_Type_JoyEmu) {
			var l, u, r, d, f1, f2;
			switch (SAEV_config.ports[0].move) {
				case SAEC_Config_Ports_Move_Arrows:
					l = 37;
					u = 38;
					r = 39;
					d = 40;
					break;
				case SAEC_Config_Ports_Move_Numpad:
					l = 100;
					u = 104;
					r = 102;
					d = 101;
					break;
				case SAEC_Config_Ports_Move_WASD:
					l = 65;
					u = 87;
					r = 68;
					d = 83;
					break;
			}
			f1 = SAEV_config.ports[0].fire[0];
			f2 = SAEV_config.ports[0].fire[1];
			switch (code) {
				case f1:
					SAER.input.registerEvent(0, SAEC_Input_Event_Press, SAEC_Input_Button_1, down);
					break;
				case f2:
					SAER.input.registerEvent(0, SAEC_Input_Event_Press, SAEC_Input_Button_2, down);
					break;
				case l:
					SAER.input.registerEvent(0, SAEC_Input_Event_JoystickMove, SAEC_Input_Direction_Left, down);
					break;
				case u:
					SAER.input.registerEvent(0, SAEC_Input_Event_JoystickMove, SAEC_Input_Direction_Up, down);
					break;
				case r:
					SAER.input.registerEvent(0, SAEC_Input_Event_JoystickMove, SAEC_Input_Direction_Right, down);
					break;
				case d:
					SAER.input.registerEvent(0, SAEC_Input_Event_JoystickMove, SAEC_Input_Direction_Down, down);
					break;
			}
		}
		if (SAEV_config.ports[1].type == SAEC_Config_Ports_Type_JoyEmu) {
			var l, u, r, d, f1, f2;
			switch (SAEV_config.ports[1].move) {
				case SAEC_Config_Ports_Move_Arrows:
					l = 37;
					u = 38;
					r = 39;
					d = 40;
					break;
				case SAEC_Config_Ports_Move_Numpad:
					l = 100;
					u = 104;
					r = 102;
					d = 101;
					break;
				case SAEC_Config_Ports_Move_WASD:
					l = 65;
					u = 87;
					r = 68;
					d = 83;
					break;
			}
			f1 = SAEV_config.ports[1].fire[0];
			f2 = SAEV_config.ports[1].fire[1];
			switch (code) {
				case f1:
					SAER.input.registerEvent(1, SAEC_Input_Event_Press, SAEC_Input_Button_1, down);
					break;
				case f2:
					SAER.input.registerEvent(1, SAEC_Input_Event_Press, SAEC_Input_Button_2, down);
					break;
				case l:
					SAER.input.registerEvent(1, SAEC_Input_Event_JoystickMove, SAEC_Input_Direction_Left, down);
					break;
				case u:
					SAER.input.registerEvent(1, SAEC_Input_Event_JoystickMove, SAEC_Input_Direction_Up, down);
					break;
				case r:
					SAER.input.registerEvent(1, SAEC_Input_Event_JoystickMove, SAEC_Input_Direction_Right, down);
					break;
				case d:
					SAER.input.registerEvent(1, SAEC_Input_Event_JoystickMove, SAEC_Input_Direction_Down, down);
					break;
			}
		}

		if (!SAEV_config.keyboard.enabled)
			return;

		var rawkey = false;
		if (SAEC_info.browser.id == SAEC_Info_Brower_ID_Firefox) {
			if (typeof mozKeyCodeMap[code] != "undefined")
				rawkey = mozKeyCodeMap[code];
		} else {
			if (typeof defKeyCodeMap[code] != "undefined")
				rawkey = defKeyCodeMap[code];
		}

		if (rawkey !== false) {
			switch (rawkey) {
				case RAWKEY_LSHIFT: {
					if (loc == DOM_KEY_LOCATION_RIGHT) rawkey = RAWKEY_RSHIFT;
					break;
				}
				case RAWKEY_LALT: {
					if (loc == DOM_KEY_LOCATION_RIGHT) rawkey = RAWKEY_RALT;
					break;
				}
				/*case RAWKEY_LAMIGA: {
					if (loc == DOM_KEY_LOCATION_RIGHT) rawkey = RAWKEY_RAMIGA;
					break;
				}*/
				case RAWKEY_RETURN: {
					if (loc == DOM_KEY_LOCATION_NUMPAD) rawkey = RAWKEY_KP_ENTER;
					break;
				}

			}

			//if (down) SAEF_log("Keyboard.processKey() loc %d, code %d $%04x, rawkey $%04x", loc, code, code, rawkey);

			if (down)
				recordKey(rawkey << 1);
			else
				recordKey((rawkey << 1) | 1);
		}
	};

	function handleKey(e, down) {
		e = e || window.event;
		var code = typeof e.keyCode == "undefined" ? e.which : e.keyCode;
		var loc = typeof e.location == "undefined" ? 0 : e.location;

		if (code == 122 || code == 123) //F11 F12
			return;

		e.preventDefault();

		//SAEF_log("Keyboard.handleKey() down %d, code %d, loc %d, alt %d, shift %d, ctrl %d", down?1:0, code, loc, e.ctrlKey?1:0, e.shiftKey?1:0, e.altKey?1:0, e.metaKey?1:0);

		var oldstate = keyState[loc][code];
		keyState[loc][code] = down ? 1 : 0;
		if (keyState[loc][code] != oldstate)
			processKey(loc, code, keyState[loc][code]);
	};

	this.keyPress = function(e, down) {
		handleKey(e, down);
	};
}

function SAEO_Input() {
	this.mouse = new SAEO_Mouse(0);
	this.joystick = [new SAEO_Joystick(0), new SAEO_Joystick(1)];
	this.keyboard = new SAEO_Keyboard();

	//const mouse_pullup = true; /* fire/left mouse button pullup resistors enabled? */

	var mouse_x = [0,0,0,0];
	var mouse_y = [0,0,0,0];
	var mouse_frame_x = [0,0,0,0];
	var mouse_frame_y = [0,0,0,0];
	var mouse_delta = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
	var mouse_deltanoreset = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
	var joybutton = [0,0,0,0];
	var joydir = [0,0,0,0];
	var joydirpot = [[0,0],[0,0],[0,0],[0,0]];

	var oleft = [0,0,0,0];
	var oright = [0,0,0,0];
	var otop = [0,0,0,0];
	var obot = [0,0,0,0];
	var horizclear = [false,false,false,false];
	var vertclear = [false,false,false,false];

	//var parport_joystick_enabled = false; //->config
	var mouse_port = [false,false];
	var analog_port = [[false,false],[false,false]];
	var digital_port = [[false,false],[false,false]];
	//var cd32_pad_enabled = [false,false];
	//var cd32_shifter = [8,8];
	//var relativecount = [[0,0],[0,0],[0,0],[0,0]];

	var potgo_value = 0; //u16
	var pot_cap = [[0,0],[0,0]];
	var pot_dat = [[0,0],[0,0]]; //u8
	var pot_dat_act = [[0,0],[0,0]];
	const POTDAT_DELAY_PAL = 8;
	const POTDAT_DELAY_NTSC = 7;

	var input_vpos = 0, input_frame = 0;

	function input_queue_struct() {
		this.port = 0;
		this.id = 0;
		this.arg1 = 0;
		this.arg2 = 0;
		this.linecnt = 0;
		this.nextlinecnt = 0;
		/*ORG
		this.evt = 0;
		this.storedstate = 0;
		this.state = 0;
		this.max = 0;
		this.linecnt = 0;
		this.nextlinecnt = 0;
		this.custom = '';*/
	};
	const INPUT_QUEUE_SIZE = 16;
	var input_queue = null;

	/*---------------------------------*/

	/*function getbuttonstate(joy, button) { //OPT inline ok
		//return (joybutton[joy] & (1 << button)) != 0;
		return (joybutton[joy] & button) != 0;
	}*/

	/*---------------------------------*/
	/* caps */

	/* p5 is 1 or floating = cd32 2-button mode */
	/*function cd32padmode(p5dir, p5dat) {
		return (!(potgo_value & p5dir) || ((potgo_value & p5dat) && (potgo_value & p5dir))) == false;
	}*/

	/*function is_joystick_pullup(joy) {
		//return joymodes[joy] == JSEM_MODE_GAMEPAD;
		return true;
	}
	function is_mouse_pullup(joy) {
		return mouse_pullup;
	}*/

	/*function cap_charge(joy, idx, charge) { OPT inline ok
		if (charge < -1 || charge > 1)
			charge = charge * 80;
		pot_cap[joy][idx] += charge;
		if (pot_cap[joy][idx] < 0)
			pot_cap[joy][idx] = 0;
		if (pot_cap[joy][idx] > 511)
			pot_cap[joy][idx] = 511;
	}*/
	function cap_check() {
		for (var joy = 0; joy < 2; joy++) {
			for (var i = 0; i < 2; i++) {
				var pdir = 0x0200 << ((joy << 2) + (i << 1)); // output enable
				var pdat = 0x0100 << ((joy << 2) + (i << 1)); // data
				//var p5dir = 0x0200 << ((joy << 2));
				//var p5dat = 0x0100 << ((joy << 2));
				//var isbutton = getbuttonstate(joy, i == 0 ? SAEC_Input_Button_3 : SAEC_Input_Button_2);
				var isbutton = (joybutton[joy] & (i == 0 ? SAEC_Input_Button_3 : SAEC_Input_Button_2)) != 0;

				/*if (cd32_pad_enabled[joy]) {
					// only red and blue can be read if CD32 pad and only if it is in normal pad mode
					isbutton |= getbuttonstate(joy, JOYBUTTON_CD32_BLUE);
					// CD32 pad 3rd button line (P5) is always floating
					if (i == 0)
						isbutton = 0;
					if (cd32padmode(p5dir, p5dat))
						continue;
				}*/

				var dong = SAER.dongle.analogjoy(joy, i);
				var charge = 0, joypot = 0;
				if (dong >= 0) {
					isbutton = 0;
					joypot = dong;
					if (pot_cap[joy][i] < joypot)
						charge = 1; // slow charge via dongle resistor
				} else {
					/*joypot = joydirpot[joy][i];
					if (analog_port[joy][i] && pot_cap[joy][i] < joypot)
						charge = 1;*/ // slow charge via pot variable resistor
					//if ((is_joystick_pullup(joy) && digital_port[joy][i]) || (mouse_port[joy] && is_mouse_pullup(joy)))
					if (digital_port[joy][i] || mouse_port[joy])
						charge = 1; // slow charge via pull-up resistor
				}

				if (!(potgo_value & pdir)) { // input?
					if (pot_dat_act[joy][i])
						pot_dat[joy][i]++;
					// first 7 or 8 lines after potgo has been started = discharge cap
					if (pot_dat_act[joy][i] == 1) {
						if (pot_dat[joy][i] < (SAEV_config.chipset.ntsc ? POTDAT_DELAY_NTSC : POTDAT_DELAY_PAL))
							charge = -2; // fast discharge delay
						else {
							pot_dat_act[joy][i] = 2;
							pot_dat[joy][i] = 0;
						}
					}
					if (dong >= 0) {
						if (pot_dat_act[joy][i] == 2 && pot_cap[joy][i] >= joypot)
							pot_dat_act[joy][i] = 0;
					} else {
						/*if (analog_port[joy][i] && pot_dat_act[joy][i] == 2 && pot_cap[joy][i] >= joypot)
							pot_dat_act[joy][i] = 0;*/
						if ((digital_port[joy][i] || mouse_port[joy]) && pot_dat_act[joy][i] == 2) {
							if (pot_cap[joy][i] >= 10 && !isbutton)
								pot_dat_act[joy][i] = 0;
						}
					}
				} else { // output?
					charge = (potgo_value & pdat) ? 2 : -2; // fast (dis)charge if output
					if (potgo_value & pdat)
						pot_dat_act[joy][i] = 0; // instant stop if output+high
					if (isbutton)
						pot_dat[joy][i]++; // "free running" if output+low
				}

				if (isbutton)
					charge = -2; // button press overrides everything

				/*if (currprefs.cs_cdtvcd) {
					// CDTV P9 is not floating
					if (charge == 0 && !(potgo_value & pdir) && i == 1)
						charge = 2;
				}
				// CD32 pad in 2-button mode: blue button is not floating
				if (charge == 0 && cd32_pad_enabled[joy] && i == 1)
					charge = 2;*/

				// official Commodore mouse has pull-up resistors in button lines. NOTE: 3rd party mice may not have pullups!
				//if (charge == 0 && dong < 0 && digital_port[joy][i] && is_mouse_pullup(joy) && mouse_port[joy])
				/*if (charge == 0 && dong < 0 && digital_port[joy][i] && mouse_port[joy])
					charge = 2;*/
				// emulate pullup resistor if button mapped because there too many broken programs that read second button in input-mode (and most 2+ button pads have pullups)
				//if (charge == 0 && dong < 0 && digital_port[joy][i] && is_joystick_pullup(joy))
				if (charge == 0 && dong < 0 && digital_port[joy][i])
					charge = 2;

				//cap_charge(joy, i, charge);
				if (charge) {
					if (charge < -1 || charge > 1)
						charge = charge * 80;
					pot_cap[joy][i] += charge;
					if (pot_cap[joy][i] < 0)
						pot_cap[joy][i] = 0;
					if (pot_cap[joy][i] > 511)
						pot_cap[joy][i] = 511;
				}
			}
		}
	}

	/*---------------------------------*/
	/* CIA access */

	this.handle_joystick_buttons = function(pra, dra) {
		var but = 0; //u8

		cap_check();

		for (var i = 0; i < 2; i++) {
			var mask = 0x40 << i;

			/*if (cd32_pad_enabled[i]) {
				var p5dir = 0x0200 << (i * 4);
				var p5dat = 0x0100 << (i * 4);
				but |= mask;
				if (!cd32padmode(p5dir, p5dat)) {
					if (getbuttonstate(i, JOYBUTTON_CD32_RED) || getbuttonstate(i, SAEC_Input_Button_1))
						but &= ~mask;
				}
			} else*/
			{
				//if (!getbuttonstate(i, SAEC_Input_Button_1))
				if ((joybutton[i] & SAEC_Input_Button_1) == 0)
					but |= mask;

				/*if (bouncy && bouncy_cycles - SAEV_Events_currcycle > 0) {
					but &= ~mask;
					if (Math.random() > 0.5)
						but |= mask;
				}*/
				if (dra & mask)
					but = (but & ~mask) | (pra & mask);
			}
		}
		return but;
	}

	/*function parconvert(v, jd, shift) { //OPT inline ok
		if (jd & SAEC_Input_Direction_Up)		v &= ~(1 << shift);
		if (jd & SAEC_Input_Direction_Down)	v &= ~(2 << shift);
		if (jd & SAEC_Input_Direction_Left)	v &= ~(4 << shift);
		if (jd & SAEC_Input_Direction_Right)	v &= ~(8 << shift);
		return v;
	}*/
	this.handle_parport_joystick = function(port, pra, dra) {
		switch (port) {
			case 0: {
				var v = (pra & dra) | (dra ^ 0xff);
				/*if (parport_joystick_enabled) {
					//v = parconvert(v, joydir[2], 0);
					//v = parconvert(v, joydir[3], 4);

					if (joydir[2] & SAEC_Input_Direction_Up)		v &= ~1;
					if (joydir[2] & SAEC_Input_Direction_Down)	v &= ~2;
					if (joydir[2] & SAEC_Input_Direction_Left)	v &= ~4;
					if (joydir[2] & SAEC_Input_Direction_Right)	v &= ~8;

					if (joydir[3] & SAEC_Input_Direction_Up)		v &= ~16;
					if (joydir[3] & SAEC_Input_Direction_Down)	v &= ~32;
					if (joydir[3] & SAEC_Input_Direction_Left)	v &= ~64;
					if (joydir[3] & SAEC_Input_Direction_Right)	v &= ~128;
				}*/
				return v;
			}
			case 1: {
				var v = ((pra & dra) | (dra ^ 0xff)) & 0x7;
				/*if (parport_joystick_enabled) {
					if (getbuttonstate(2, SAEC_Input_Button_1))
						v &= ~4;
					if (getbuttonstate(3, SAEC_Input_Button_1))
						v &= ~1;
					if (getbuttonstate(2, SAEC_Input_Button_2) || getbuttonstate(3, SAEC_Input_Button_2))
						v &= ~2; //spare
				}*/
				return v;
			}
			default:
				//abort();
				return 0;
		}
	}

	//var oldstate = [0,0]; //fix reset
	/*this.handle_cd32_joystick_cia = function(pra, dra) {
		cap_check();
		for (var i = 0; i < 2; i++) {
			if (cd32_pad_enabled[i]) { //OWN
				var but = 0x40 << i;
				var p5dir = 0x0200 << (i * 4); // output enable P5
				var p5dat = 0x0100 << (i * 4); // data P5
				if (cd32padmode(p5dir, p5dat)) {
					if ((dra & but) && (pra & but) != oldstate[i]) {
						if (!(pra & but)) {
							cd32_shifter[i]--;
							if (cd32_shifter[i] < 0)
								cd32_shifter[i] = 0;
						}
					}
				}
			}
			oldstate[i] = dra & pra & but;
		}
	}*/

	/*---------------------------------*/
	/* mouse */

	function getvelocity(num, subnum, pct) {
		if (pct > 1000)
			pct = 1000;

		var val = mouse_delta[num][subnum];
		var v = ~~(val * pct / 1000);
		if (!v) {
			var maxvpos = SAER.playfield.get_maxvpos();

			if (val < -maxvpos >> 1)
				v = -2;
			else if (val < 0)
				v = -1;
			else if (val > maxvpos >> 1)
				v = 2;
			else if (val > 0)
				v = 1;
		}
		if (!mouse_deltanoreset[num][subnum])
			mouse_delta[num][subnum] -= v;

		return v;
	}

	/*var mxd = 0, myd = 0; //fix reset
	var mouseedge_x = 0, mouseedge_y = 0, mouseedge_time = 0;
	const MOUSEEDGE_RANGE = 100;
	const MOUSEEDGE_TIME = 2;*/
	function mouseupdate(pct, vsync) {
		//static int mxd, myd;
		const MOUSEXY_MAX = 16384;
		const max = 120;

		/*mouseedge
		if (vsync) {
			if (mxd < 0) {
				if (mouseedge_x > 0) mouseedge_x = 0; else mouseedge_x += mxd;
				mouseedge_time = MOUSEEDGE_TIME;
			}
			if (mxd > 0) {
				if (mouseedge_x < 0) mouseedge_x = 0; else mouseedge_x += mxd;
				mouseedge_time = MOUSEEDGE_TIME;
			}
			if (myd < 0) {
				if (mouseedge_y > 0) mouseedge_y = 0; else mouseedge_y += myd;
				mouseedge_time = MOUSEEDGE_TIME;
			}
			if (myd > 0) {
				if (mouseedge_y < 0) mouseedge_y = 0; else mouseedge_y += myd;
				mouseedge_time = MOUSEEDGE_TIME;
			}
			if (mouseedge_time > 0) {
				mouseedge_time--;
				if (mouseedge_time == 0)
					mouseedge_x = mouseedge_y = 0;
			}
			mxd = myd = 0;
		}*/

		for (var i = 0; i < 2; i++) {
			if (mouse_port[i]) {

				var v = getvelocity(i, 0, pct);
				//mxd += v;
				mouse_x[i] += v;
				if (mouse_x[i] < 0) {
					mouse_x[i] += MOUSEXY_MAX;
					mouse_frame_x[i] = mouse_x[i] - v;
				}
				if (mouse_x[i] >= MOUSEXY_MAX) {
					mouse_x[i] -= MOUSEXY_MAX;
					mouse_frame_x[i] = mouse_x[i] - v;
				}

				v = getvelocity(i, 1, pct);
				//myd += v;
				mouse_y[i] += v;
				if (mouse_y[i] < 0) {
					mouse_y[i] += MOUSEXY_MAX;
					mouse_frame_y[i] = mouse_y[i] - v;
				}
				if (mouse_y[i] >= MOUSEXY_MAX) {
					mouse_y[i] -= MOUSEXY_MAX;
					mouse_frame_y[i] = mouse_y[i] - v;
				}

				/*v = getvelocity(i, 2, pct);
				if (v > 0)
					record_key (0x7a << 1);
				else if (v < 0)
					record_key (0x7b << 1);*/

				if (!mouse_deltanoreset[i][2])
					mouse_delta[i][2] = 0;

				if (mouse_frame_x[i] - mouse_x[i] > max) {
					mouse_x[i] = mouse_frame_x[i] - max;
					mouse_x[i] &= MOUSEXY_MAX - 1;
				}
				if (mouse_frame_x[i] - mouse_x[i] < -max) {
					mouse_x[i] = mouse_frame_x[i] + max;
					mouse_x[i] &= MOUSEXY_MAX - 1;
				}
				if (mouse_frame_y[i] - mouse_y[i] > max)
					mouse_y[i] = mouse_frame_y[i] - max;
				if (mouse_frame_y[i] - mouse_y[i] < -max)
					mouse_y[i] = mouse_frame_y[i] + max;
			}

			if (!vsync) {
				mouse_frame_x[i] = mouse_x[i];
				mouse_frame_y[i] = mouse_y[i];
			}
		}

		/*if (lightpen_delta[0]) {
			lightpen_x += lightpen_delta[0];
			if (!lightpen_deltanoreset[0])
				lightpen_delta[0] = 0;
		}
		if (lightpen_delta[1]) {
			lightpen_y += lightpen_delta[1];
			if (!lightpen_deltanoreset[1])
				lightpen_delta[1] = 0;
		}*/
	}

	function readinput() { //readinput
		var vpos = SAER.playfield.get_vpos();
		var maxvpos = SAER_Playfield_current_maxvpos();
		var totalvpos = input_frame * maxvpos + vpos;
		var diff = totalvpos - input_vpos;
		//SAEF_log("Input.readinput() %d/%d : %d -> %d", vpos, maxvpos, diff, (diff * 1000 / maxvpos) >>> 0);
		if (diff > 0) {
			if (diff < 10)
				mouseupdate(0, false);
			else
				mouseupdate((diff * 1000 / maxvpos) >>> 0, false);
		}
		input_vpos = totalvpos;
	}

	/*---------------------------------*/

	function joymousecounter(joy) {
		var left = (joydir[joy] & SAEC_Input_Direction_Left) ? 0 : 1;
		var right = (joydir[joy] & SAEC_Input_Direction_Right) ? 0 : 1;
		var top = (joydir[joy] & SAEC_Input_Direction_Up) ? 0 : 1;
		var bot = (joydir[joy] & SAEC_Input_Direction_Down) ? 0 : 1;

		var b0 = (bot ^ right) ? 1 : 0;
		var b1 = (right ^ 1) ? 2 : 0;
		var b8 = (top ^ left) ? 1 : 0;
		var b9 = (left ^ 1) ? 2 : 0;

		var cntx = b0 | b1;
		var cnty = b8 | b9;
		var ocntx = mouse_x[joy] & 3;
		var ocnty = mouse_y[joy] & 3;

			  if (cntx == 3 && ocntx == 0) mouse_x[joy] -= 4;
		else if (cntx == 0 && ocntx == 3) mouse_x[joy] += 4;
		mouse_x[joy] = (mouse_x[joy] & 0xfc) | cntx;

			  if (cnty == 3 && ocnty == 0) mouse_y[joy] -= 4;
		else if (cnty == 0 && ocnty == 3) mouse_y[joy] += 4;
		mouse_y[joy] = (mouse_y[joy] & 0xfc) | cnty;

		if (!left || !right || !top || !bot) {
			mouse_frame_x[joy] = mouse_x[joy];
			mouse_frame_y[joy] = mouse_y[joy];
		}
	}
	function integrateEvent(ie) {
		var p = ie.port;

		switch (ie.id) {
			case SAEC_Input_Event_Press: {
				/*int old = joybutton[p] & (1 << ie.arg1);
				if (ie.arg2)
					joybutton[p] |= 1 << ie.arg1;
				else
					joybutton[p] &= ~(1 << ie.arg1);
				if (ie.data == 0 && old != (joybutton[p] & (1 << ie.data)) && currprefs.cpu_cycle_exact) {
					if (!input_record && !input_play && currprefs.input_contact_bounce) {
						bouncy = 1; // emulate contact bounce, 1st button only, others have capacitors
						bouncy_cycles = get_cycles () + CYCLE_UNIT * currprefs.input_contact_bounce;
					}
				}*/
				if (ie.arg2)
					joybutton[p] |= ie.arg1;
				else
					joybutton[p] &= ~ie.arg1;

				break;
			}
			case SAEC_Input_Event_MouseMove: {
				/*var max = 0;//100;
				var delta;
				//int deadzone = currprefs.input_joymouse_deadzone * max / 100;
				var deadzone = ~~(33 * max / 100);
				var unit = ie.data & 0x7f;

				if (max) {
					if (state <= deadzone && state >= -deadzone) {
						state = 0;
						mouse_deltanoreset[p][unit] = 0;
					} else if (state < 0) {
						state += deadzone;
						mouse_deltanoreset[p][unit] = 1;
					} else {
						state -= deadzone;
						mouse_deltanoreset[p][unit] = 1;
					}
					max -= deadzone;
					//delta = state * currprefs.input_joymouse_multiplier / max;
					delta = ~~(state * 100 / max);
				} else {
					delta = state;
					mouse_deltanoreset[p][unit] = 0;
				}
				if (ie.data & IE_CDTV) {
					delta = 0;
					if (state > 0)
						delta = JOYMOUSE_CDTV;
					else if (state < 0)
						delta = -JOYMOUSE_CDTV;
				}

				if (ie.data & IE_INVERT) delta = -delta;

				if (max)
					mouse_delta[p][unit] = delta;
				else
					mouse_delta[p][unit] += delta;*/

				mouse_deltanoreset[p][0] = 0;
				mouse_deltanoreset[p][1] = 0;
				mouse_delta[p][0] += ie.arg1;
				mouse_delta[p][1] += ie.arg2;

				break;
			}
			case SAEC_Input_Event_JoystickMove: {
				var left = oleft[p], right = oright[p], top = otop[p], bot = obot[p];

				//digital
				//if (1) {
					if (ie.arg1 & SAEC_Input_Direction_Left) {
						left = oleft[p] = ie.arg2 ? 1 : 0;
						if (horizclear[p] && left) {
							//horizclear[p] = 0;
							right = oright[p] = 0;
						}
					}
					if (ie.arg1 & SAEC_Input_Direction_Right) {
						right = oright[p] = ie.arg2 ? 1 : 0;
						if (horizclear[p] && right) {
							//horizclear[p] = 0;
							left = oleft[p] = 0;
						}
					}
					if (ie.arg1 & SAEC_Input_Direction_Up) {
						top = otop[p] = ie.arg2 ? 1 : 0;
						if (vertclear[p] && top) {
							//vertclear[p] = 0;
							bot = obot[p] = 0;
						}
					}
					if (ie.arg1 & SAEC_Input_Direction_Down) {
						bot = obot[p] = ie.arg2 ? 1 : 0;
						if (vertclear[p] && bot) {
							//vertclear[p] = 0;
							top = otop[p] = 0;
						}
					}
				/*} else {

				}*/
				mouse_deltanoreset[p][0] = 1;
				mouse_deltanoreset[p][1] = 1;
				joydir[p] = 0;
				if (left) joydir[p] |= SAEC_Input_Direction_Left;
				if (right) joydir[p] |= SAEC_Input_Direction_Right;
				if (top) joydir[p] |= SAEC_Input_Direction_Up;
				if (bot) joydir[p] |= SAEC_Input_Direction_Down;
				if (p == 0 || p == 1)
					joymousecounter(p);

				break;
			}
		}
	}

	this.hsync = function() { //inputdevice_hsync()
		cap_check();

		/*#ifdef CATWEASEL
		catweasel_hsync();
		#endif*/

		for (var i = 0; i < INPUT_QUEUE_SIZE; i++) {
			//struct input_queue_struct *iq = &input_queue[i];
			var iq = input_queue[i];
			if (iq.linecnt > 0) {
				iq.linecnt--;
				if (iq.linecnt == 0) {
					/*iq.state = iq.state ? 0 : iq.storedstate;
					if (iq.custom) handle_custom_event(iq.custom);
					if (iq.evt) handle_input_event(iq.evt, iq.state, iq.max, 0, false, true);*/
					integrateEvent(iq);
					iq.linecnt = iq.nextlinecnt;
				}
			}
		}

		/*if (bouncy && SAEV_Events_currcycle > bouncy_cycles)
			bouncy = 0;

		if (input_record && input_record != INPREC_RECORD_PLAYING) {
			if (vpos == 0)
				inputdevice_read ();
			inputdelay = 0;
		}
		if (input_play) {
			inprec_playdiskchange ();
			int nr, state, max, autofire;
			while (inprec_playevent (&nr, &state, &max, &autofire))
				handle_input_event (nr, state, max, autofire, false, true);
			if (vpos == 0)
				handle_msgpump ();
		}
		if (!input_record && !input_play) {
			static int cnt;
			if ((++cnt & 63) == 63 ) {
				inputdevice_read ();
			} else if (inputdelay > 0) {
				inputdelay--;
				if (inputdelay == 0)
					inputdevice_read ();
			}
		}*/
	}

	this.vsync = function() { //inputdevice_vsync()
		input_frame++;

		mouseupdate(0, true);

		/*struct delayed_event *de = delayed_events;
		while (de) {
			if (de->delay > 0)
				de->delay--;
			if (de->delay == 0) {
				de->delay = -1;
				if (de->event_string) {
					TCHAR *s = de->event_string;
					de->event_string = NULL;
					handle_custom_event (s);
					xfree (s);
				}
			}
			de = de->next;
		}

		if (!input_record) {
			inputdevice_read ();
			if (!input_play)
				inputdelay = uaerand () % (maxvpos <= 1 ? 1 : maxvpos - 1);
		}

		inputdevice_handle_inputcode ();
		if (mouseedge_alive > 0)
			mouseedge_alive--;

		#ifdef ARCADIA
		if (arcadia_bios) arcadia_vsync ();
		#endif

		if (mouseedge())
			mouseedge_alive = 10;

		if (mousehack_alive_cnt > 0) {
			mousehack_alive_cnt--;
			if (mousehack_alive_cnt == 0)
				setmouseactive (-1);
		} else if (mousehack_alive_cnt < 0) {
			mousehack_alive_cnt++;
			if (mousehack_alive_cnt == 0) {
				mousehack_alive_cnt = 100;
				setmouseactive (0);
				setmouseactive (1);
			}
		}
		inputdevice_checkconfig();
		*/
	}

	/*---------------------------------*/

	this.registerEvent = function(port, id, arg1, arg2) {
		if (input_queue === null || SAER.paused)
			return;
		for (var idx = 0; idx < INPUT_QUEUE_SIZE; idx++) {
			if (input_queue[idx].linecnt < 0)
				break;
		}
		if (idx == INPUT_QUEUE_SIZE) {
			SAEF_warn("Input.registerEvent() queue overflow");
			return;
		}
		var iq = input_queue[idx];
		iq.port = port;
		iq.id = id;
		iq.arg1 = arg1;
		iq.arg2 = arg2;
		iq.linecnt = 1;
		iq.nextlinecnt = -1;

		/*const linecnt = 1;
		if (linecnt < 0) {
			var maxvpos = SAER.playfield.get_maxvpos();
			iq.linecnt = maxvpos + (maxvpos >> 1);
		} else
			iq.linecnt = linecnt;

		const autofire = 0;
		iq.nextlinecnt = autofire > 0 ? linecnt : -1;*/
	};

	this.keyPress = function(e, down) {
		this.keyboard.keyPress(e, down);
	};

	/*---------------------------------*/

	this.setup = function() {
		var err;

		input_queue = new Array(INPUT_QUEUE_SIZE);
		for (var i = 0; i < INPUT_QUEUE_SIZE; i++)
			input_queue[i] = new input_queue_struct();

		this.keyboard.setup();
		if ((err = this.joystick[0].setup()) == SAEE_None) {
			if ((err = this.joystick[1].setup()) == SAEE_None) {
				mouse_port[0] = SAEV_config.ports[0].type == SAEC_Config_Ports_Type_Mouse;
				mouse_port[1] = false; /* disabled for now */
				analog_port[0][0] = analog_port[0][1] = false; /* disabled for now */
				analog_port[1][0] = analog_port[1][1] = false; /* disabled for now */
				digital_port[0][0] = digital_port[0][1] = SAEV_config.ports[0].type == SAEC_Config_Ports_Type_Joy || SAEV_config.ports[0].type == SAEC_Config_Ports_Type_JoyEmu;
				digital_port[1][0] = digital_port[1][1] = SAEV_config.ports[1].type == SAEC_Config_Ports_Type_Joy || SAEV_config.ports[1].type == SAEC_Config_Ports_Type_JoyEmu;
				return SAEE_None;
			}
			this.joystick[0].cleanup();
		}
		this.keyboard.cleanup();
		return err;
	};

	this.cleanup = function() {
		this.joystick[1].cleanup();
		this.joystick[0].cleanup();
		this.keyboard.cleanup();

		input_queue = null;
	};

	this.reset = function() {
		this.mouse.reset();
		this.joystick[0].reset();
		this.joystick[1].reset();
		this.keyboard.reset();

		for (var i = 0; i < 4; i++) {
			mouse_delta[i][0] = mouse_deltanoreset[i][0] = 0;
			//mouse_delta[i][1] = mouse_deltanoreset[i][1] = 0;
			//mouse_delta[i][2] = mouse_deltanoreset[i][2] = 0;
			joybutton[i] = 0;
			joydir[i] = 0;
			//joydirpot[i][j] = 128 / (312 * 100 / currprefs.input_analog_joystick_mult) + (128 * currprefs.input_analog_joystick_mult / 100) + currprefs.input_analog_joystick_offset;
			//joydirpot[i][0] = ~~(128 / ~~(312 * 100 / 15)) + ~~(128 * 15 / 100) + -1;
			//joydirpot[i][1] = ~~(128 / ~~(312 * 100 / 15)) + ~~(128 * 15 / 100) + -1;
			joydirpot[i][0] = joydirpot[i][1] = 0;
			oleft[i] = oright[i] = otop[i] = obot[i] = 0;
			horizclear[i] = vertclear[i] = true;
			//relativecount[i][0] = relativecount[i][1] = 0;
		}
		potgo_value = 0;
		for (var i = 0; i < 2; i++) {
			pot_dat[i][0] = pot_dat[i][1] = 0;
			//cd32_shifter[i] = 8;
		}
		input_vpos = input_frame = 0;

		for (var i = 0; i < INPUT_QUEUE_SIZE; i++)
			input_queue[i].linecnt = input_queue[i].nextlinecnt = -1;
	};

	/*---------------------------------*/

	this.POTGO = function(v) {
		//SAEF_log("Input.POTGO() $%04x", v);

		SAER.dongle.potgo(v);

		potgo_value = potgo_value & 0x5500; /* keep state of data bits */
		potgo_value |= v & 0xaa00; /* get new direction bits */

		var i, j;
		for (i = 0; i < 8; i += 2) {
			var dir = 0x0200 << i; //u16
			if (v & dir) {
				var data = 0x0100 << i; //u16
				potgo_value &= ~data;
				potgo_value |= v & data;
			}
		}
		/*for (i = 0; i < 2; i++) {
			if (cd32_pad_enabled[i]) {
				var p5dir = 0x0200 << (i * 4); // output enable P5
				var p5dat = 0x0100 << (i * 4); // data P5
				if (!(potgo_value & p5dir) || ((potgo_value & p5dat) && (potgo_value & p5dir)))
					cd32_shifter[i] = 8;
			}
		}*/
		if (v & 1) {
			for (i = 0; i < 2; i++) {
				for (j = 0; j < 2; j++) {
					pot_dat_act[i][j] = 1;
					pot_dat[i][j] = 0;
				}
			}
		}
	};

	this.POTGOR = function() {
		var v = 0;
		//var v = handle_joystick_potgor(potgo_value) & 0x5500; //OPT inline ok
		{
			v = potgo_value;

			cap_check();

			for (var i = 0; i < 2; i++) {
				var p9dir = 0x0800 << ((i << 2)); /* output enable P9 */
				var p9dat = 0x0400 << ((i << 2)); /* data P9 */
				var p5dir = 0x0200 << ((i << 2)); /* output enable P5 */
				var p5dat = 0x0100 << ((i << 2)); /* data P5 */

				/*if (cd32_pad_enabled[i] && cd32padmode(p5dir, p5dat)) {
					// p5 is floating in input-mode
					v &= ~p5dat;
					v |= potgo_value & p5dat;
					if (!(potgo_value & p9dir))
						v |= p9dat;
					// (P5 output and 1) or floating -> shift register is kept reset (Blue button)
					if (!(potgo_value & p5dir) || ((potgo_value & p5dat) && (potgo_value & p5dir)))
						cd32_shifter[i] = 8;
					// shift at 1 == return one, >1 = return button states
					if (cd32_shifter[i] == 0)
						v &= ~p9dat; // shift at zero == return zero
					if (cd32_shifter[i] >= 2 && (joybutton[i] & ((1 << JOYBUTTON_CD32_PLAY) << (cd32_shifter[i] - 2))))
						v &= ~p9dat;
				} else*/
				{
					v &= ~p5dat;
					if (pot_cap[i][0] > 100)
						v |= p5dat;

					//if (!cd32_pad_enabled[i] || !cd32padmode(p5dir, p5dat))
					//if (!cd32padmode(p5dir, p5dat))
					if (!(potgo_value & p5dir) || ((potgo_value & p5dat) && (potgo_value & p5dir))) {
						v &= ~p9dat;
						if (pot_cap[i][1] > 100)
							v |= p9dat;
					}
				}
			}
			v &= 0x5500;
		}

		v = SAER.dongle.potgor(v);
		//SAEF_log("Input.POTGOR() $%04x", v);
		return v;
	};

	this.POT0DAT = function() {
		var v = ((pot_dat[0][1] & 0xff) << 8) | (pot_dat[0][0] & 0xff);
		//SAEF_log("Input.POT0dDAT() %04x", v);
		return v;
	};

	this.POT1DAT = function() {
		var v = ((pot_dat[1][1] & 0xff) << 8) | (pot_dat[1][0] & 0xff);
		//SAEF_log("Input.POT1DAT() %04x", v);
		return v;
	};

	this.JOY0DAT = function() {
		readinput();
		var v = ((mouse_y[0] & 0xff) << 8) | (mouse_x[0] & 0xff);
		//SAEF_log("Input.JOY0DAT() %04x", v);
		v = SAER.dongle.joydat(0, v);
		return v;
	};

	this.JOY1DAT = function() {
		readinput();
		var v = ((mouse_y[1] & 0xff) << 8) | (mouse_x[1] & 0xff);
		//SAEF_log("Input.JOY1DAT() %04x", v);
		v = SAER.dongle.joydat(1, v);
		return v;
	};

	this.JOYTEST = function(v) {
		mouse_x[0] &= 3;
		mouse_y[0] &= 3;
		mouse_x[1] &= 3;
		mouse_y[1] &= 3;
		mouse_x[0] |= v & 0xFC;
		mouse_x[1] |= v & 0xFC;
		mouse_y[0] |= (v >> 8) & 0xFC;
		mouse_y[1] |= (v >> 8) & 0xFC;
		mouse_frame_x[0] = mouse_x[0];
		mouse_frame_y[0] = mouse_y[0];
		mouse_frame_x[1] = mouse_x[1];
		mouse_frame_y[1] = mouse_y[1];

		//SAER.dongle.joytest(v); /* empty */
		//SAEF_log("Input.JOYTEST() %04x", v);
	};
}
