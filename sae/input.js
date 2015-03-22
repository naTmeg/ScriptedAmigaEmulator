/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
**************************************************************************/

function Mouse() {
	this.button = [false, false, false];
	this.pos = 0;

	var cx = 0;
	var cy = 0;
	var mx = 0;
	var my = 0;
	var lx = -1;
	var ly = -1;

	this.reset = function () {
		this.button = [0, 0, 0];
		cx = cy = 0;
		lx = ly = -1;
	};

	this.mousedown = function (e) {
		e = e || window.event;
		if (!e) return;

		this.button[e.button] = true;
	};

	this.mouseup = function (e) {
		e = e || window.event;
		if (!e) return;

		this.button[e.button] = false;
	};

	this.mouseover = function (e) {
		//AMIGA.video.hideCursor(1);
		this.mousemove(e);
		lx = cx;
		ly = cy;
	};

	this.mouseout = function (e) {
		//AMIGA.video.hideCursor(0);
		this.mouseup(e);
	};

	this.mousemove = function (e) {
		e = e || window.event;
		if (!e || !AMIGA.video) return;

		if (e.pageX || e.pageY) {
			cx = e.pageX;
			cy = e.pageY;
		} else if (e.clientX || e.clientY) {
			cx = e.clientX;
			cy = e.clientY;
		}
		if (lx == -1) {
			lx = cx;
			ly = cy;
		}
		//BUG.info('USER() mousemove %d %d', cx, cy);
	};

	this.update = function() {
		if (lx != -1) {
			var dx = cx - lx;
			var dy = cy - ly;

			if (dx > 127) dx = 127; else if (dx < -127) dx = -127;
			mx += dx;
			if (mx > 255) mx -= 256; else if (mx < 0) mx += 256;

			if (dy > 127) dy = 127; else if (dy < -127) dy = -127;
			my += dy;
			if (my > 255) my -= 256; else if (my < 0) my += 256;
		} else 
			mx = my = 0;
			
		lx = cx;
		ly = cy;
	
		this.pos = (my << 8) + mx;
		//BUG.info('USER() mousemove %d %d, ps $%04x', mx, my, this.pos);
	}
}

function Joystick(type) {
	this.type = type;
	this.button = [false, false, false];
	this.state = [false, false, false, false];
	this.dir = 0;

	this.reset = function () {
		this.button = [false, false, false];
		this.state = [false, false, false, false];
	};

	this.update = function() {
		var u = this.state[1];
		var d = this.state[3];

		if (this.state[0]) u = !u;
		if (this.state[2]) d = !d;

		this.dir = d | (this.state[2] << 1) | (u << 8) | (this.state[0] << 9);
		
		/*var l = 1, r = 1, u = 1, d = 1;

		if (this.state[0]) l = 0;
		if (this.state[1]) u = 0;
		if (this.state[2]) r = 0;
		if (this.state[3]) d = 0;

		var b0 = (d ^ r) ? 1 : 0;
		var b1 = (r ^ 1) ? 2 : 0;
		var b8 = (u ^ l) ? 1 : 0;
		var b9 = (l ^ 1) ? 2 : 0;
		
		this.dir = ((b8 | b9) << 8) | (b0 | b1);*/
	}
}

function Keyboard() {
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
	//const RAWKEY_KP_ENTER          = 0x43;
	const RAWKEY_RETURN            = 0x44;
	const RAWKEY_ESCAPE            = 0x45;
	const RAWKEY_DELETE            = 0x46;
	//const RAWKEY_INSERT            = 0x47;
	//const RAWKEY_PAGEUP            = 0x48;
	//const RAWKEY_PAGEDOWN          = 0x49;
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
	//const RAWKEY_RALT              = 0x65;
	const RAWKEY_LAMIGA            = 0x66;
	const RAWKEY_RAMIGA            = 0x67;
	/*const RAWKEY_SCRLOCK           = 0x6B;
	const RAWKEY_PRTSCREEN         = 0x6C;
	const RAWKEY_NUMLOCK           = 0x6D;
	const RAWKEY_PAUSE             = 0x6E;
	const RAWKEY_F12               = 0x6F;
	const RAWKEY_HOME              = 0x70;
	const RAWKEY_END               = 0x71;
	const RAWKEY_MEDIA1            = 0x72;
	const RAWKEY_MEDIA2            = 0x73;
	const RAWKEY_MEDIA3            = 0x74;
	const RAWKEY_MEDIA4            = 0x75;
	const RAWKEY_MEDIA5            = 0x76;
	const RAWKEY_MEDIA6            = 0x77;
	const RAWKEY_NM_WHEEL_UP       = 0x7A;
	const RAWKEY_NM_WHEEL_DOWN     = 0x7B;
	const RAWKEY_NM_WHEEL_LEFT     = 0x7C;
	const RAWKEY_NM_WHEEL_RIGHT    = 0x7D;
	const RAWKEY_NM_BUTTON_FOURTH  = 0x7E;*/	
 	/*const RAWKEY_BAD_CODE			= 0xF9;
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
		  //19:RAWKEY_PAUSE, //pause/break	
		  20:RAWKEY_CAPSLOCK, //caps lock	
		  27:RAWKEY_ESCAPE, //escape	 	
		  32:RAWKEY_SPACE, //space	 	
		  //33:RAWKEY_PAGEUP, //page up	 	
		  //34:RAWKEY_PAGEDOWN, //page down	
		  //35:RAWKEY_END, //end	 		
		  //36:RAWKEY_HOME, //home	 		
		  37:RAWKEY_LEFT, //left arrow	
		  38:RAWKEY_UP, //up arrow	 	
		  39:RAWKEY_RIGHT, //right arrow	
		  40:RAWKEY_DOWN, //down arrow	
		  //45:RAWKEY_INSERT, //insert	 	
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
		 //144:RAWKEY_NUMLOCK, //num lock	 			
		 //145:RAWKEY_SCRLOCK, //scroll lock	 		
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
		  //19:RAWKEY_PAUSE, //pause/break	
		  20:RAWKEY_CAPSLOCK, //caps lock	
		  27:RAWKEY_ESCAPE, //escape	 	
		  32:RAWKEY_SPACE, //space	 	
		  //33:RAWKEY_PAGEUP, //page up	 	
		  //34:RAWKEY_PAGEDOWN, //page down	
		  //35:RAWKEY_END, //end	 		
		  //36:RAWKEY_HOME, //home	 		
		  37:RAWKEY_LEFT, //left arrow	
		  38:RAWKEY_UP, //up arrow	 	
		  39:RAWKEY_RIGHT, //right arrow	
		  40:RAWKEY_DOWN, //down arrow	
		  //45:RAWKEY_INSERT, //insert	 	
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
		 //144:RAWKEY_NUMLOCK, //num lock	 			
		 //145:RAWKEY_SCRLOCK, //scroll lock	 		         
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

	var keyState = new Uint8Array(MAXKEYS);
	var keyBuf = new Uint8Array(KEYBUFSIZE);
	var state = 0;
	var code = 0;
	var first = 0, last = 0;
	var capsLock = false;
	
	var hsynccnt = 0;
	this.lostsynccnt = 0;

	//for (var k in KeyEvent) document.writeln('KeyEvent.' + k + ' = ' + KeyEvent[k]+'<br />'); //FF
	for (var i = 0; i < MAXKEYS; i++) keyState[i] = false;
	for (var i = 0; i < KEYBUFSIZE; i++) keyBuf[i] = 0;
	
	function _onkeydown(e) { AMIGA.input.keyboard.handleKey(e, true); } 
	function _onkeyup(e) { AMIGA.input.keyboard.handleKey(e, false); } 

	this.setup = function () {
		/*document.onkeydown = function (e) {
		 AMIGA.input.keyboard.keydownup(e, true);
		 }
		 document.onkeyup = function (e) {
		 AMIGA.input.keyboard.keydownup(e, false);
		 }*/
		window.document.addEventListener('keydown', _onkeydown, false);
		window.document.addEventListener('keyup', _onkeyup, false);
	};

	this.cleanup = function () {
		//BUG.info('Keyboard.cleanup()');
		//document.onkeydown = null;
		//document.onkeyup = null;
		window.document.removeEventListener('keydown', _onkeydown, false);
		window.document.removeEventListener('keyup', _onkeyup, false);
	};

	this.reset = function () {
		for (var i = 0; i < MAXKEYS; i++) keyState[i] = false;
		state = 0;
		code = 0;
		first = last = 0;
		hsynccnt = 0;
		this.lostsynccnt = 0;
	};

	this.keysAvail = function () {
		return first != last;
	};

	this.nextKey = function () {
		//assert (first != last);
		var key = keyBuf[last];
		if (++last == KEYBUFSIZE) last = 0;
		return key;
	};

	this.recordKey = function (kc) {
		var next = first + 1;

		if (next == KEYBUFSIZE) next = 0;
		if (next == last) {
			BUG.info('Keyboard() buffer overrun!');
			return false;
		}
		keyBuf[first] = kc;
		first = next;
		return true;
	};
	
	this.processKey = function (code, down) {
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
		if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Joy0) {
			var l, u, r, d, f1, f2;
			switch (AMIGA.config.ports[0].move) {
				case SAEV_Config_Ports_Move_Arrows:
				{
					l = 37;
					u = 38;
					r = 39;
					d = 40;
					break;
				}
				case SAEV_Config_Ports_Move_Numpad:
				{
					l = 100;
					u = 104;
					r = 102;
					d = 101;
					break;
				}
				case SAEV_Config_Ports_Move_WASD:
				{
					l = 65;
					u = 87;
					r = 68;
					d = 83;
					break;
				}
			}
			f1 = AMIGA.config.ports[0].fire[0];
			f2 = AMIGA.config.ports[0].fire[1];
			switch (code) {
				case f1:
				{
					AMIGA.input.joystick[0].button[0] = down;
					break;
				}
				case f2:
				{
					AMIGA.input.joystick[0].button[1] = down;
					break;
				}
				case l:
				{
					AMIGA.input.joystick[0].state[0] = down;
					if (down && AMIGA.input.joystick[0].state[2]) AMIGA.input.joystick[0].state[2] = false;
					break;
				}
				case u:
				{
					AMIGA.input.joystick[0].state[1] = down;
					if (down && AMIGA.input.joystick[0].state[3]) AMIGA.input.joystick[0].state[3] = false;
					break;
				}
				case r:
				{
					AMIGA.input.joystick[0].state[2] = down;
					if (down && AMIGA.input.joystick[0].state[0]) AMIGA.input.joystick[0].state[0] = false;
					break;
				}
				case d:
				{
					AMIGA.input.joystick[0].state[3] = down;
					if (down && AMIGA.input.joystick[0].state[1]) AMIGA.input.joystick[0].state[1] = false;
					break;
				}
			}
		}
		if (AMIGA.config.ports[1].type == SAEV_Config_Ports_Type_Joy1) {
			var l, u, r, d, f1, f2;
			switch (AMIGA.config.ports[1].move) {
				case SAEV_Config_Ports_Move_Arrows:
				{
					l = 37;
					u = 38;
					r = 39;
					d = 40;
					break;
				}
				case SAEV_Config_Ports_Move_Numpad:
				{
					l = 100;
					u = 104;
					r = 102;
					d = 101;
					break;
				}
				case SAEV_Config_Ports_Move_WASD:
				{
					l = 65;
					u = 87;
					r = 68;
					d = 83;
					break;
				}
			}
			f1 = AMIGA.config.ports[1].fire[0];
			f2 = AMIGA.config.ports[1].fire[1];
			switch (code) {
				case f1:
				{
					AMIGA.input.joystick[1].button[0] = down;
					break;
				}
				case f2:
				{
					AMIGA.input.joystick[1].button[1] = down;
					break;
				}
				case l:
				{
					AMIGA.input.joystick[1].state[0] = down;
					if (down && AMIGA.input.joystick[1].state[2]) AMIGA.input.joystick[1].state[2] = false;
					break;
				}
				case u:
				{
					AMIGA.input.joystick[1].state[1] = down;
					if (down && AMIGA.input.joystick[1].state[3]) AMIGA.input.joystick[1].state[3] = false;
					break;
				}
				case r:
				{
					AMIGA.input.joystick[1].state[2] = down;
					if (down && AMIGA.input.joystick[1].state[0]) AMIGA.input.joystick[1].state[0] = false;
					break;
				}
				case d:
				{
					AMIGA.input.joystick[1].state[3] = down;
					if (down && AMIGA.input.joystick[1].state[1]) AMIGA.input.joystick[1].state[1] = false;
					break;
				}
			}
		}

		if (!AMIGA.config.keyboard.enabled)
			return;

		/* map shift-keys (team17 pinball games) */
		if (AMIGA.config.keyboard.mapShift) {
			switch (code) {
				case 37:
				{ //left arrow
					if (!down) {
						this.recordKey((RAWKEY_LSHIFT << 1) | 1);
					} else {
						this.recordKey(RAWKEY_LSHIFT << 1);
					}
					//break;
					return;
				}
				case 39:
				{ //right arrow
					if (!down) {
						this.recordKey((RAWKEY_RSHIFT << 1) | 1);
					} else {
						this.recordKey(RAWKEY_RSHIFT << 1);
					}
					//break;
					return;
				}
			}
		}

		var rawkey = false;
		if (BrowserDetect.browser == 'Firefox') {
			if (typeof(mozKeyCodeMap[code]) != 'undefined')
				rawkey = mozKeyCodeMap[code];
		} else {
			if (typeof(defKeyCodeMap[code]) != 'undefined')
				rawkey = defKeyCodeMap[code];
		}
		//BUG.info('Keyboard.processKey() code %d $%04x, rawkey $%04x', code, code, rawkey);

		if (rawkey !== false) {
			if (down)
				this.recordKey(rawkey << 1);
			else
				this.recordKey((rawkey << 1) | 1);
		}
	};
	
	this.handleKey = function (e, down) {
		e = e || window.event;
		var code = e.which ? e.which : e.keyCode;

		if (AMIGA.config.keyboard.enabled && code != 122 && code != 123) //all but F11 F12
			e.preventDefault();

		//BUG.info('Keyboard.handleKey() down %d, code %d, alt %d, shift %d, ctrl %d', down?1:0, code, e.altKey?1:0, e.shiftKey?1:0, e.ctrlKey?1:0);

		/* Ctrl-Alt fix */
		if (!down && code == 17 && keyState[18]) {
			keyState[18] = false;
			this.processKey(18, keyState[18]);
		}

		var oldstate = keyState[code];
		if (down && !keyState[code]) {
			keyState[code] = true;
		}
		else if (!down) {
			keyState[code] = false;
		}
		if (keyState[code] != oldstate) {
			this.processKey(code, keyState[code]);
		}
	};

	this.setCode = function (keycode) {
		code = ~((keycode << 1) | (keycode >> 7)) & 0xff;
	};

	this.keyReq = function () {
		this.lostsynccnt = 8 * AMIGA.playfield.maxvpos * 8;
		/* 8 frames * 8 bits */

		//AMIGA.cia.setICR(CIA_A, 8, code);
		AMIGA.cia.SetICRA(8, code);
	};

	this.hsync = function () {
		if ((this.keysAvail() || state < 3) && !this.lostsynccnt && ((++hsynccnt) & 15) == 0) {
			switch (state) {
				case 0:
					code = 0;
					state++;
					break;
				case 1:
					this.setCode(RAWKEY_INIT_POWER_UP);
					state++;
					break;
				case 2:
					this.setCode(RAWKEY_TERM_POWER_UP);
					state++;
					break;
				case 3:
					code = ~this.nextKey() & 0xff;
					break;
			}
			this.keyReq();
		}
	};

	this.vsync = function() {
		if (this.lostsynccnt > 0) {
			this.lostsynccnt -= AMIGA.playfield.maxvpos;
			if (this.lostsynccnt <= 0) {
				this.lostsynccnt = 0;
				this.keyReq();
				//BUG.info('Keyboard() lost sync');
			}
		}
	}
}

function Input() {
	this.mouse = new Mouse();
	this.joystick = new Array(2);
	this.joystick[0] = new Joystick(SAEV_Config_Ports_Type_Joy0);
	this.joystick[1] = new Joystick(SAEV_Config_Ports_Type_Joy1);
	this.keyboard = new Keyboard();

	var potgo = {
		data: 0,
		count: 0
	};

	this.setup = function () {
		this.keyboard.setup();
	};
	
	this.cleanup = function () {
		this.keyboard.cleanup();
	};

	this.reset = function () {
		this.mouse.reset();
		this.joystick[0].reset();
		this.joystick[1].reset();
		this.keyboard.reset();
		potgo.data = 0;
		potgo.count = 0;
	};

	this.POTGO = function (v) {
		//BUG.info('Input.POTGO() $%04x', v);
		potgo.data = v;
	};

	this.POTGOR = function () {
		var v = (potgo.data | (potgo.data << 1)) & 0xaa00;
		v |= v >> 1;

		if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Mouse) {
			if (this.mouse.button[2]) v &= 0xfbff;
			if (this.mouse.button[1]) v &= 0xfeff;
		} else if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Joy0) {
			if (this.joystick[0].button[1]) v &= 0xfbff;
			if (this.joystick[0].button[2]) v &= 0xfeff;
		}
		if (AMIGA.config.ports[1].type == SAEV_Config_Ports_Type_Joy1) {
			if (this.joystick[1].button[1]) v &= 0xbfff;
			if (this.joystick[1].button[2]) v &= 0xefff;
		}
		//BUG.info('Input.POTGOR() $%04x', v);
		return v;
	};

	this.POT0DAT = function () {
		if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Mouse) {
			if (this.mouse.button[2]) potgo.count = (potgo.count & 0xff00) | ((potgo.count + 1) & 0xff);
			if (this.mouse.button[1]) potgo.count = (potgo.count + 0x100) & 0xffff;
		}
		//BUG.info('Input.POT0DAT() $%04x', v);
		return potgo.count;
	};

	this.POT1DAT = function () {
		//BUG.info('Input.POT1DAT() NOT IMPLEMENTED');
		return 0xffff;
	};

	this.JOY0DAT = function () {
		if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Mouse) {
			this.mouse.update();
			return this.mouse.pos;
		} else if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Joy0) {
			this.joystick[0].update();
			return this.joystick[0].dir;
		}
		return 0xffff;
	};

	this.JOY1DAT = function () {
		if (AMIGA.config.ports[1].type == SAEV_Config_Ports_Type_Mouse) {
			this.mouse.update();
			return this.mouse.pos;
		} else if (AMIGA.config.ports[1].type == SAEV_Config_Ports_Type_Joy1) {
			this.joystick[1].update();
			return this.joystick[1].dir;
		}
		return 0xffff;
	};

	this.JOYTEST = function (v) {
		//BUG.info('Input.JOYTEST() $%04x', v);
	}
}

