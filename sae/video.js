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

const SAEC_Video_DEF_AMIGA_WIDTH = 360; //720 / 2;
const SAEC_Video_DEF_AMIGA_HEIGHT = 284; //568 / 2;
const SAEC_Video_MAX_AMIGA_WIDTH = 376; //752 / 2; //AMIGA_WIDTH_MAX
const SAEC_Video_MAX_AMIGA_HEIGHT = 288; //576 / 2; //AMIGA_HEIGHT_MAX

const SAEC_Video_MIN_UAE_WIDTH = 160;
const SAEC_Video_MAX_UAE_WIDTH = 3072; //max_uae_width
const SAEC_Video_MIN_UAE_HEIGHT = 128;
const SAEC_Video_MAX_UAE_HEIGHT = 2048; //max_uae_height

/*---------------------------------*/

function SAEO_Video() {
	/*-----------------------------------------------------------------------*/
	/* SECT API */
	/*-----------------------------------------------------------------------*/

	const vertexShader =
		"attribute vec2 a_position;"+
		"attribute vec2 a_texCoord;"+
		"uniform vec2 u_resolution;"+
		"varying vec2 v_texCoord;"+
		"void main() {"+
			"vec2 zeroToOne = a_position / u_resolution;"+
			"vec2 zeroToTwo = zeroToOne * 2.0;"+
			"vec2 clipSpace = zeroToTwo - 1.0;"+
			"gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);"+
			"v_texCoord = a_texCoord;"+
		"}";
	const fragmentShader =
		"precision mediump float;"+
		"uniform sampler2D u_image;"+
		"varying vec2 v_texCoord;"+
		"void main() {"+
			"gl_FragColor = texture2D(u_image, v_texCoord);"+
		"}";
	var glParams = {
		alpha: false,
		depth: false,
		stencil: false,
		antialias: false,
		premultipliedAlpha: false,
		preserveDrawingBuffer: true,
		failIfMajorPerformanceCaveat: false
	};

	function Texture(width, height, pixbytes) {
		this.width = width;
		this.width_allocated = (width + 7) & ~7;
		this.height = height;
		this.height_allocated = height;
		this.pixbytes = pixbytes;
		this.rowbytes = this.width_allocated * this.pixbytes;
		this.data = new ArrayBuffer(this.width_allocated * this.height_allocated * this.pixbytes);
	}

	function Surface(width, height, pixbytes) {
		this.width = width;
		this.width_allocated = (width + 7) & ~7;
		this.height = height;
		this.height_allocated = height;
		this.pixbytes = pixbytes;
		this.rowbytes = this.width_allocated * this.pixbytes;
		this.data = new ArrayBuffer(this.width_allocated * this.height_allocated * this.pixbytes);
		this.imageData = null;
	}

	function HWND() {
		this.canvas = null;
		this.ctx = null;
		this.texture = null;
		this.surface = null;

		this.div = null;
		this.shown = false;
		this.fullscreen = false;
	}

	function RECT() {
		this.left = 0;
		this.top = 0;
		this.right = 0;
		this.bottom = 0;
	}

	var hAmigaWnd = null, hMainWnd = null; //, hHiddenWnd, hGUIWnd; //HWND
	var amigawin_rect = new RECT();
	//var mainwin_rect = new RECT();
	//var amigawinclip_rect = new RECT();

	/*-----------------------------------------------------------------------*/

	function getShader(ctx, id) {
		var shader, source;

		if (id == "vertex") {
			shader = ctx.createShader(ctx.VERTEX_SHADER);
			source = vertexShader;
		} else if (id == "fragment") {
			shader = ctx.createShader(ctx.FRAGMENT_SHADER);
			source = fragmentShader;
		}
		ctx.shaderSource(shader, source);
		ctx.compileShader(shader);

		if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS))
			return SAEE_Video_ComphileShader;

		return shader;
	}

	function setupWebGL(ctx, width, height) {
		SAEF_log("video.setupWebGL() %dx%d", width, height);
		var vertexShader = getShader(ctx, "vertex");
		if (vertexShader === SAEE_Video_ComphileShader) return SAEE_Video_ComphileShader;
		var fragmentShader = getShader(ctx, "fragment");
		if (fragmentShader === SAEE_Video_ComphileShader) return SAEE_Video_ComphileShader;
		var program = ctx.createProgram();
		ctx.attachShader(program, vertexShader);
		ctx.attachShader(program, fragmentShader);
		ctx.linkProgram(program);
		if (!ctx.getProgramParameter(program, ctx.LINK_STATUS))
			return SAEE_Video_LinkShader;

		ctx.useProgram(program);
		ctx.program = program;

		var texCoordBuffer = ctx.createBuffer();
		ctx.bindBuffer(ctx.ARRAY_BUFFER, texCoordBuffer);
		ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([
			0.0, 0.0,
			1.0, 0.0,
			0.0, 1.0,
			0.0, 1.0,
			1.0, 0.0,
			1.0, 1.0]), ctx.STATIC_DRAW
		);
		var texCoordLocation = ctx.getAttribLocation(program, "a_texCoord");
		ctx.enableVertexAttribArray(texCoordLocation);
		ctx.vertexAttribPointer(texCoordLocation, 2, ctx.FLOAT, false, 0, 0);

		var _texture = ctx.createTexture();
		ctx.bindTexture(ctx.TEXTURE_2D, _texture);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.NEAREST);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.NEAREST);

		var resolutionLocation = ctx.getUniformLocation(program, "u_resolution");
		ctx.uniform2f(resolutionLocation, width, height);

		var buffer = ctx.createBuffer();
		ctx.bindBuffer(ctx.ARRAY_BUFFER, buffer);
		var positionLocation = ctx.getAttribLocation(program, "a_position");
		ctx.enableVertexAttribArray(positionLocation);
		ctx.vertexAttribPointer(positionLocation, 2, ctx.FLOAT, false, 0, 0);

		ctx.viewport(0, 0, width, height);

		ctx.colorMask(true, true, true, true);
		ctx.clearColor(0, 0, 0, 1);
		ctx.clear(ctx.COLOR_BUFFER_BIT);

		/*ctx.enable(ctx.BLEND);
		if (glParams.alpha)
			ctx.blendFunc(ctx.ONE, ctx.ONE_MINUS_SRC_ALPHA);
		else {
			ctx.colorMask(true, true, true, false); // disable rendering to alpha
			ctx.blendFunc(ctx.SRC_ALPHA, ctx.ONE_MINUS_SRC_ALPHA);
		}*/
		if (!glParams.alpha)
			ctx.colorMask(true, true, true, false); // disable rendering to alpha

		return SAEE_None;
	}

	function pointerLockChange() {
		var e = document.webkitPointerLockElement || document.mozPointerLockElement || document.msPointerLockElement || document.pointerLockElement;
		if (e === hAmigaWnd.canvas)
			SAER.input.mouse.attach(hAmigaWnd.canvas, true);
		else
			SAER.input.mouse.dettach(hAmigaWnd.canvas, true);
	}

	function fullscreenChange() {
		var e = document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || document.fullscreenElement;

		hAmigaWnd.fullscreen = e === hAmigaWnd.canvas;

		if (typeof SAEV_config.hook.event.screened === "function")
			SAEV_config.hook.event.screened(hAmigaWnd.fullscreen);
	}

	function CreateWindow(left, top, width, height) {
		var hWnd = new HWND();

		var el = document.getElementById(SAEV_config.video.id);
		if (el.nodeName == "CANVAS")
			hWnd.canvas = el;
		else
			hWnd.canvas = document.createElement("canvas");

		hWnd.canvas.width = width;
		hWnd.canvas.height = height;
		hWnd.canvas.style.backgroundColor = sprintf("#%06X", SAEV_config.video.backgroundColor);

		if (SAEV_config.video.api == SAEC_Config_Video_API_WebGL) {
			try {
				glParams.antialias = SAEV_config.video.antialias;
				//glParams.alpha = glParams.premultipliedAlpha = SAEV_config.video.colorMode >= 5;
				glParams.alpha = SAEV_config.video.colorMode >= 5;

				hWnd.ctx = hWnd.canvas.getContext("webgl", glParams) || hWnd.canvas.getContext("experimental-webgl", glParams);
				//hWnd.texture = new Texture(width, height, SAEV_config.video.colorMode < 5 : 2 : 4);
			} catch(e) {
				throw SAEE_Video_RequiresWegGl;
			}
		}
		else if (SAEV_config.video.api == SAEC_Config_Video_API_Canvas) {
			try {
				hWnd.ctx = hWnd.canvas.getContext("2d");
				//hWnd.surface = new Surface(width, height, 4);
				//hWnd.surface.imageData = hWnd.ctx.createImageData(width, height);
			} catch(e) {
				throw SAEE_Video_RequiresCanvas;
			}
		}
		SAEF_info("sae.video() %s mode, %dx%d pixels, %d bpp",
			SAEV_config.video.api == SAEC_Config_Video_API_WebGL ? "WebGL" : "Canvas",
			width, height, SAEV_config.video.colorMode == 2 ? 16 : 32
		);

		hWnd.canvas.oncontextmenu = function() {
			return false;
		};

		if (SAEV_config.ports[0].type == SAEC_Config_Ports_Type_Mouse) {
			if (SAEC_info.video.pointerLock && SAEV_config.video.cursor == SAEC_Config_Video_Cursor_Lock)
				hWnd.canvas.myRequestPointerLock = hWnd.canvas.webkitRequestPointerLock || hWnd.canvas.mozRequestPointerLock || hWnd.canvas.msRequestPointerLock || hWnd.canvas.requestPointerLock;
			else
				hWnd.canvas.myRequestPointerLock = null;

			if (hWnd.canvas.myRequestPointerLock !== null) {
					  if (typeof document.onwebkitpointerlockchange != "undefined") document.addEventListener("webkitpointerlockchange", pointerLockChange, false);
				else if (typeof document.onmozpointerlockchange != "undefined") document.addEventListener("mozpointerlockchange", pointerLockChange, false);
				//else if (typeof document.onmspointerlockchange != "undefined") document.addEventListener("mspointerlockchange", pointerLockChange, false); //ATT ?
				else if (typeof document.onpointerlockchange != "undefined") document.addEventListener("pointerlockchange", pointerLockChange, false);

				hWnd.canvas.onclick = function(e) {
					var e = document.webkitPointerLockElement || document.mozPointerLockElement || document.msPointerLockElement || document.pointerLockElement;
					if (e === null) hWnd.canvas.myRequestPointerLock();
				};
			} else
				SAER.input.mouse.attach(hWnd.canvas, false);
		}
		if (SAEV_config.ports[0].type == SAEC_Config_Ports_Type_Joy && SAEV_config.ports[0].device != SAEC_Config_Ports_Device_None)
			SAER.input.joystick[0].enable();
		if (SAEV_config.ports[1].type == SAEC_Config_Ports_Type_Joy && SAEV_config.ports[1].device != SAEC_Config_Ports_Device_None)
			SAER.input.joystick[1].enable();

		if (SAEC_info.video.requestFullScreen) {
			hWnd.canvas.myRequestFullscreen =
				hWnd.canvas.webkitRequestFullscreen ||
				hWnd.canvas.mozRequestFullScreen ||
				hWnd.canvas.msRequestFullscreen ||
				hWnd.canvas.requestFullScreen;

			document.myFullscreenEnabled =
				document.webkitFullscreenEnabled ||
				document.mozFullScreenEnabled ||
				document.msFullscreenEnabled ||
				document.fullscreenEnabled;

			document.myExitFullscreen =
				document.webkitExitFullscreen ||
				document.mozCancelFullScreen ||
				document.msExitFullscreen ||
				document.exitFullscreen;

				  if (typeof document.onwebkitfullscreenchange != "undefined") document.addEventListener("webkitfullscreenchange", fullscreenChange, false);
			else if (typeof document.onmozfullscreenchange != "undefined") document.addEventListener("mozfullscreenchange", fullscreenChange, false);
			else if (typeof document.onMSFullscreenChange != "undefined") document.addEventListener("MSFullscreenChange", fullscreenChange, false);
			else if (typeof document.onfullscreenchange != "undefined") document.addEventListener("fullscreenchange", fullscreenChange, false);
		}
		return hWnd;
	}

	function DestroyWindow(hWnd) {
		if (SAEC_info.video.requestFullScreen) {
				  if (typeof document.onwebkitfullscreenchange != "undefined") document.removeEventListener("webkitfullscreenchange", fullscreenChange, false);
			else if (typeof document.onmozfullscreenchange != "undefined") document.removeEventListener("mozfullscreenchange", fullscreenChange, false);
			else if (typeof document.onMSFullscreenChange != "undefined") document.removeEventListener("MSFullscreenChange", fullscreenChange, false);
			else if (typeof document.onfullscreenchange != "undefined") document.removeEventListener("fullscreenchange", fullscreenChange, false);
		}

		if (SAEV_config.ports[0].type == SAEC_Config_Ports_Type_Joy && SAEV_config.ports[0].device != SAEC_Config_Ports_Device_None)
			SAER.input.joystick[0].disable();
		if (SAEV_config.ports[1].type == SAEC_Config_Ports_Type_Joy && SAEV_config.ports[1].device != SAEC_Config_Ports_Device_None)
			SAER.input.joystick[1].disable();

		var pl = false;
		if (SAEV_config.ports[0].type == SAEC_Config_Ports_Type_Mouse) {
			if (SAEC_info.video.pointerLock && SAEV_config.video.cursor == SAEC_Config_Video_Cursor_Lock) {
				if (hWnd.canvas.myRequestPointerLock !== null) {
						  if (typeof document.onwebkitpointerlockchange != "undefined") document.removeEventListener("webkitpointerlockchange", pointerLockChange, false);
					else if (typeof document.onmozpointerlockchange != "undefined") document.removeEventListener("mozpointerlockchange", pointerLockChange, false);
					//else if (typeof document.onmspointerlockchange != "undefined") document.removeEventListener("mspointerlockchange", pointerLockChange, false); //ATT ?
					else if (typeof document.onpointerlockchange != "undefined") document.removeEventListener("pointerlockchange", pointerLockChange, false);
					hWnd.canvas.myRequestPointerLock = null;
					pl = true;
				}
			}
			if (!pl)
				SAER.input.mouse.dettach(hWnd.canvas, false);
		}
		if (SAEV_config.video.api == SAEC_Config_Video_API_WebGL)
			hWnd.texture = null;
		else if (SAEV_config.video.api == SAEC_Config_Video_API_Canvas)
			hWnd.surface = null;

		hWnd.canvas = null;
	}

	const SW_HIDE = 0;
	const SW_SHOWNORMAL = 1;
	//const SW_SHOW = 5;
	//const SW_SHOWDEFAULT = 10;

	function ShowWindow(hWnd, nCmdShow) {
		if (nCmdShow == SW_SHOWNORMAL && !hWnd.shown) {
			var el = document.getElementById(SAEV_config.video.id);
			if (el.nodeName == "DIV") {
				hWnd.div = el;
				hWnd.div.style.width = String(currentmode.native_width)+"px";
				hWnd.div.style.height = String(currentmode.native_height)+"px";
				hWnd.div.appendChild(hWnd.canvas);
			} else {
				hWnd.div = null;
				hWnd.canvas.style.width = String(currentmode.native_width)+"px";
				hWnd.canvas.style.height = String(currentmode.native_height)+"px";
			}
			hWnd.shown = true;
		}
		else if (nCmdShow == SW_HIDE && hWnd.shown) {
			if (hWnd.div !== null)
				hWnd.div.removeChild(hWnd.canvas);

			hWnd.shown = false;
		}
	}

	function GetWindowRect(hWnd, rect) {
		/*if (hWnd.shown) {
			var bcr = hWnd.canvas.getBoundingClientRect();
			rect.left = Math.floor(bcr.left);
			rect.top = Math.floor(bcr.top);
			rect.right = Math.floor(bcr.right);
			rect.bottom = Math.floor(bcr.bottom);
			console.dir(bcr);
		} else*/ {
			rect.left = (screen.width >> 1) - (currentmode.native_width >> 1); if (rect.left < 0) rect.left = 0;
			rect.top = (screen.height >> 1) - (currentmode.native_height >> 1); if (rect.top < 0) rect.top = 0;
			rect.right = rect.left + currentmode.native_width;
			rect.bottom = rect.top + currentmode.native_height;
		}
	}

	/*-----------------------------------------------------------------------*/
	/* SECT base */
	/*-----------------------------------------------------------------------*/

	const DM_FULLSCREEN = 1; //DM_DX_FULLSCREEN
	const DM_FULLWINOW = 2; //DM_W_FULLSCREEN
	//const DM_D3D_FULLSCREEN = 16;
	//const DM_PICASSO96 = 32;
	//const DM_DDRAW = 64;
	//const DM_DC = 128;
	//const DM_D3D = 256;
	const DM_CANVAS = 512; //OWN
	const DM_WEBGL = 1024; //OWN
	const DM_SWSCALE = 2048; //1024

	/* picasso96

	//enum RGBFTYPE
	const RGBFB_NONE = 0;		// no valid RGB format (should not happen)
	const RGBFB_CLUT = 1;		// palette mode = ; set colors when opening screen using tags or use SetRGB32/LoadRGB32(...)
	const RGBFB_R8G8B8 = 2;		// TrueColor RGB (8 bit each)
	const RGBFB_B8G8R8 = 3;		// TrueColor BGR (8 bit each)
	const RGBFB_R5G6B5PC = 4;	// HiColor16 (5 bit R = ; 6 bit G = ; 5 bit B), format: gggbbbbbrrrrrggg
	const RGBFB_R5G5B5PC = 5;	// HiColor15 (5 bit each), format: gggbbbbb0rrrrrgg
	const RGBFB_A8R8G8B8 = 6;	// 4 Byte TrueColor ARGB (A unused alpha channel)
	const RGBFB_A8B8G8R8 = 7;	// 4 Byte TrueColor ABGR (A unused alpha channel)
	const RGBFB_R8G8B8A8 = 8;	// 4 Byte TrueColor RGBA (A unused alpha channel)
	const RGBFB_B8G8R8A8 = 9;	// 4 Byte TrueColor BGRA (A unused alpha channel)
	const RGBFB_R5G6B5 = 10;	// HiColor16 (5 bit R = ; 6 bit G = ; 5 bit B), format: rrrrrggggggbbbbb
	const RGBFB_R5G5B5 = 11;	// HiColor15 (5 bit each), format: 0rrrrrgggggbbbbb
	const RGBFB_B5G6R5PC = 12;	// HiColor16 (5 bit R = ; 6 bit G = ; 5 bit B), format: gggrrrrrbbbbbggg
	const RGBFB_B5G5R5PC = 13;	// HiColor15 (5 bit each), format: gggrrrrr0bbbbbbgg
	const RGBFB_Y4U2V2 = 14;	// 2 Byte TrueColor YUV (CCIR recommendation CCIR601)
	const RGBFB_Y4U1V1 = 15;	// 1 Byte TrueColor ACCUPAK.
	const RGBFB_MaxFormats = 16;

	const RGBFF_NONE		= (1<<RGBFB_NONE);
	const RGBFF_CLUT		= (1<<RGBFB_CLUT);
	const RGBFF_R8G8B8	= (1<<RGBFB_R8G8B8);
	const RGBFF_B8G8R8	= (1<<RGBFB_B8G8R8);
	const RGBFF_R5G6B5PC	= (1<<RGBFB_R5G6B5PC);
	const RGBFF_R5G5B5PC	= (1<<RGBFB_R5G5B5PC);
	const RGBFF_A8R8G8B8	= (1<<RGBFB_A8R8G8B8);
	const RGBFF_A8B8G8R8	= (1<<RGBFB_A8B8G8R8);
	const RGBFF_R8G8B8A8	= (1<<RGBFB_R8G8B8A8);
	const RGBFF_B8G8R8A8	= (1<<RGBFB_B8G8R8A8);
	const RGBFF_R5G6B5	= (1<<RGBFB_R5G6B5);
	const RGBFF_R5G5B5	= (1<<RGBFB_R5G5B5);
	const RGBFF_B5G6R5PC	= (1<<RGBFB_B5G6R5PC);
	const RGBFF_B5G5R5PC	= (1<<RGBFB_B5G5R5PC);
	const RGBFF_Y4U2V2	= (1<<RGBFB_Y4U2V2);
	const RGBFF_Y4U1V1	= (1<<RGBFB_Y4U1V1);

	const MAX_PICASSO_MODES = 1; //300;
	const MAX_REFRESH_RATES = 1; //100;

	function ScreenResolution() { //struct ScreenResolution
		this.width = 0;  //in pixels
		this.height = 0; //in pixels
	}
	function PicassoResolution() { //struct PicassoResolution
		this.res = new ScreenResolution(); //struct ScreenResolution
		this.depth = 0; //depth in bytes-per-pixel
		this.residx = 0;
		this.refresh = new Array(MAX_REFRESH_RATES); //refresh-rates in Hz
		this.refreshtype = new Array(MAX_REFRESH_RATES); //0=normal,1=raw,2=lace
		this.name = "";
		this.colormodes = 0; //Bit mask of RGBFF_xxx values.
		this.rawmode = 0;
		this.lace = false; //all modes lace
	}*/

	const MAX_DISPLAYS = 1; //10
	function MultiDisplay() {
		this.primary = false;
		this.ddguid = 0; //GUID
		this.adaptername = "";
		this.adapterid = "";
		this.adapterkey = "";
		this.monitorname = "";
		this.monitorid = "";
		this.fullname = "";
		//this.DisplayModes = new Array(MAX_PICASSO_MODES); //struct PicassoResolution *
		//for (var vi = 0; vi < MAX_PICASSO_MODES; vi++) this.DisplayModes[vi] = new PicassoResolution();
		this.rect = new RECT();
	}
	var Displays = new Array(MAX_DISPLAYS);
	for (var vi = 0; vi < MAX_DISPLAYS; vi++)
		Displays[vi] = new MultiDisplay();

	function winuae_currentmode() { //struct winuae_currentmode
		this.flags = 0; //uint
		this.native_width = 0; //all int
		this.native_height = 0;
		this.native_depth;
		this.pitch = 0;
		this.current_width = 0;
		this.current_height = 0;
		this.current_depth = 0;
		this.amiga_width = 0;
		this.amiga_height = 0;
		this.initdone = 0;
		this.fullfill = 0;
		this.vsync = 0;
		this.freq = 0;
	}
	//static struct winuae_currentmode currentmodestruct, *currentmode = &currentmodestruct;
	var currentmode = new winuae_currentmode();

	var usedfilter = null; //struct uae_filter *

	//int scalepicasso;
	var screen_is_picasso = false;
	var screen_is_initialized = false;
	//static int display_change_requested;
	var wasfullwindow_a = 0, wasfullwindow_p = 0;

	/*#define SM_WINDOW 0
	#define SM_FULLSCREEN_DX 2
	#define SM_OPENGL_WINDOW 3
	#define SM_OPENGL_FULLWINDOW 9
	#define SM_OPENGL_FULLSCREEN_DX 4
	#define SM_D3D_WINDOW 5
	#define SM_D3D_FULLWINDOW 10
	#define SM_D3D_FULLSCREEN_DX 6
	#define SM_FULLWINDOW 7
	#define SM_NONE 11

	int window_led_drives, window_led_drives_end;
	int window_led_hd, window_led_hd_end;
	int window_led_joys, window_led_joys_end, window_led_joy_start;
	int window_led_msg, window_led_msg_end, window_led_msg_start;
	int window_extra_width, window_extra_height;

	static int vblankbasewait1, vblankbasewait2, vblankbasewait3, vblankbasefull, vblankbaseadjust;
	static bool vblankbaselace;
	static int vblankbaselace_chipset;
	static bool vblankthread_oddeven, vblankthread_oddeven_got;
	static int graphics_mode_changed;
	static double remembered_vblank;
	static volatile int vblankthread_mode, vblankthread_counter;
	int vsync_modechangetimeout = 10;
	*/

	/*#define VBLANKTH_KILL 0
	#define VBLANKTH_CALIBRATE 1
	#define VBLANKTH_IDLE 2
	#define VBLANKTH_ACTIVE_WAIT 3
	#define VBLANKTH_ACTIVE 4
	#define VBLANKTH_ACTIVE_START 5
	#define VBLANKTH_ACTIVE_SKIPFRAME 6
	#define VBLANKTH_ACTIVE_SKIPFRAME2 7

	volatile bool vblank_found_chipset;
	volatile bool vblank_found_rtg;
	static volatile bool vblank_found;
	static volatile int flipthread_mode;
	static HANDLE flipevent, flipevent2, vblankwaitevent;
	static volatile int flipevent_mode;
	static CRITICAL_SECTION screen_cs;
	static bool screen_cs_allocated;
	static int init_round = 0;
	*/

	/*-----------------------------------------------------------------------*/

	function isscreen() { //global
		return hMainWnd !== null;
	}
	/*function is3dmode() { //global
		//return (currentmode.flags & DM_D3D);
		return (currentmode.flags & DM_WEBGL);
	}*/

	function isfullscreen_2(p) {
		var idx = screen_is_picasso ? 1 : 0;
		return p.video.apmode[idx].gfx_fullscreen == SAEC_Config_Video_AP_Fullscreen_FULLSCREEN ? 1 : (p.video.apmode[idx].gfx_fullscreen == SAEC_Config_Video_AP_Fullscreen_FULLWINDOW ? -1 : 0);
	}
	function isfullscreen() { //global
		return isfullscreen_2(SAEV_config);
	}

	function WIN32GFX_IsPicassoScreen() { //global
		return screen_is_picasso ? 1 : 0;
	}
	/*int WIN32GFX_GetDepth (int real) {
		if (!currentmode.native_depth)
			return currentmode.current_depth;
		return real ? currentmode.native_depth : currentmode.current_depth;
	}
	int WIN32GFX_GetWidth (void) {
		return currentmode.current_width;
	}
	int WIN32GFX_GetHeight (void) {
		return currentmode.current_height;
	}*/

	/*static void clearscreen (void) {
		DirectDraw_FillPrimary();
	}*/

	function centerdstrect(dr) {
		//if (!(currentmode.flags & (DM_DX_FULLSCREEN | DM_D3D_FULLSCREEN | DM_W_FULLSCREEN)))
		if (!(currentmode.flags & (DM_FULLSCREEN | DM_FULLWINOW)))
			OffsetRect(dr, amigawin_rect.left, amigawin_rect.top);
		if (currentmode.flags & DM_FULLWINOW) {
			//if (scalepicasso && screen_is_picasso) return;
			if (usedfilter !== null && !screen_is_picasso)
				return;
			if (currentmode.fullfill && (currentmode.current_width > currentmode.native_width || currentmode.current_height > currentmode.native_height))
				return;
			OffsetRect(dr,
				Math.truncate((currentmode.native_width - currentmode.current_width) / 2),
				Math.truncate((currentmode.native_height - currentmode.current_height) / 2)
			);
		}
	}

	//int default_freq = 60;
	//HWND hStatusWnd = null;
	var scrlinebuf = null;

	function getdisplay2(p, index) {
		var max = Displays.length;
		/*if (max == 0) {
			gui_message("no display adapters! Exiting");
			exit(0);
		}*/
		var display = index < 0 ? p.video.apmode[screen_is_picasso ? 1 : 0].gfx_display - 1 : index;
		if (index >= 0 && display >= max)
			return null;
		if (display >= max)
			display = 0;
		if (display < 0)
			display = 0;
		return Displays[display];
	}
	function getdisplay(p) { //global
		return getdisplay2(p, -1);
	}

	/*function getbestmode(nextbest) {
		var i, index = -1;

		forever: { for (;;) {
			var md = getdisplay2(SAEV_config, index);
			if (md === null)
				return 0;
			var max = md.DisplayModes.length;
			var ratio = currentmode.native_width > currentmode.native_height ? 1 : 0;
			for (i = 0; i < max && md.DisplayModes[i].depth >= 0; i++) {
				var pr = md.DisplayModes[i];
				if (pr.res.width == currentmode.native_width && pr.res.height == currentmode.native_height)
					break;
			}
			if (i < max && md.DisplayModes[i].depth >= 0) {
				if (!nextbest)
					break;
				while (i < max && md.DisplayModes[i].res.width == currentmode.native_width && md.DisplayModes[i].res.height == currentmode.native_height)
					i++;
			} else
				i = 0;

			// first iterate only modes that have similar aspect ratio
			var startidx = i;
			for (; i < max && md.DisplayModes[i].depth >= 0; i++) {
				var pr = md.DisplayModes[i];
				var r = pr.res.width > pr.res.height ? 1 : 0;
				if (pr.res.width >= currentmode.native_width && pr.res.height >= currentmode.native_height && r == ratio) {
					SAEF_log("video.getbestmode() FS: %dx%d . %dx%d %d %d", currentmode.native_width, currentmode.native_height, pr.res.width, pr.res.height, ratio, index);
					currentmode.native_width = pr.res.width;
					currentmode.native_height = pr.res.height;
					currentmode.current_width = currentmode.native_width;
					currentmode.current_height = currentmode.native_height;
					//goto end;
					break forever;
				}
			}
			// still not match? check all modes
			i = startidx;
			for (; i < max && md.DisplayModes[i].depth >= 0; i++) {
				var pr = md.DisplayModes[i];
				var r = pr.res.width > pr.res.height ? 1 : 0;
				if (pr.res.width >= currentmode.native_width && pr.res.height >= currentmode.native_height) {
					SAEF_log("video.getbestmode() FS: %dx%d . %dx%d", currentmode.native_width, currentmode.native_height, pr.res.width, pr.res.height);
					currentmode.native_width = pr.res.width;
					currentmode.native_height = pr.res.height;
					currentmode.current_width = currentmode.native_width;
					currentmode.current_height = currentmode.native_height;
					//goto end;
					break forever;
				}
			}
			index++;
		}}
		//end:
		if (index >= 0) {
			SAEV_config.video.apmode[screen_is_picasso ? 1 : 0].gfx_display = index;
			//changed_prefs.gfx_apmode[screen_is_picasso ? 1 : 0].gfx_display = index;
			SAEF_warn("video.getbestmode() Can't find mode %dx%d . Monitor switched to '%s'", currentmode.native_width, currentmode.native_height, md.adaptername);
		}
		return 1;
	}*/

	/*static int getstatuswindowheight (void) {
		int def = GetSystemMetrics (SM_CYMENU) + 3;
		WINDOWINFO wi;
		HWND h = CreateWindowEx (
			0, STATUSCLASSNAME, (LPCTSTR) null, SBARS_TOOLTIPS | WS_CHILD | WS_VISIBLE,
			0, 0, 0, 0, hHiddenWnd, (HMENU) 1, hInst, null);
		if (!h)
			return def;
		wi.cbSize = sizeof wi;
		if (!GetWindowInfo (h, &wi))
			return def;
		DestroyWindow (h);
		return wi.rcWindow.bottom - wi.rcWindow.top;
	}*/

	function updatewinrect(allowfullscreen) {
		var f = isfullscreen();
		if (!allowfullscreen && f > 0)
			return;
		GetWindowRect(hAmigaWnd, amigawin_rect);
		//GetWindowRect(hAmigaWnd, amigawinclip_rect);
		//#if MOUSECLIP_LOG
		SAEF_log("video.updatewinrect() GetWindowRect %dx%d %dx%d %d", amigawin_rect.left, amigawin_rect.top, amigawin_rect.right, amigawin_rect.bottom, f);
		//#endif
		if (f == 0) {
			//changed_prefs.gfx_size_win.x = amigawin_rect.left;
			//changed_prefs.gfx_size_win.y = amigawin_rect.top;
			SAEV_config.video.size_win.x = amigawin_rect.left;
			SAEV_config.video.size_win.y = amigawin_rect.top;
		}
	}

	function gfxmode_reset() {
		usedfilter = null;
		/*if (SAEV_config.video.gf[SAEV_Playfield_picasso_on ? 1 : 0].gfx_filter > 0) {
			for (var i = 0; i < uaefilters.length; i++) {
				if (uaefilters[i].type == SAEV_config.video.gf[SAEV_Playfield_picasso_on ? 1 : 0].gfx_filter) {
					usedfilter = uaefilters[i];
					break;
				}
			}
		}*/
	}

	/*function movecursor(x, y) {
		SAEF_log("video.movecursor() %dx%d", x, y);
		//SetCursorPos(x, y);
	}*/

	//var firstwindow = true;
	//var prevsbheight = 0;
	function create_windows_2() {
		var fs = currentmode.flags & DM_FULLSCREEN;
		//var d3dfs = currentmode.flags & DM_D3D_FULLSCREEN;
		var fw = currentmode.flags & DM_FULLWINOW;
		//DWORD style = WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN | WS_CLIPSIBLINGS;
		//DWORD exstyle = (currprefs.win32_notaskbarbutton ? WS_EX_TOOLWINDOW : WS_EX_APPWINDOW) | 0;
		//DWORD flags = 0;
		var borderless = true; //currprefs.win32_borderless;
		var cyborder = 0; //GetSystemMetrics(SM_CYFRAME);
		var gap = 0;
		var x, y, w, h;
		var md = getdisplay(SAEV_config);
		var sbheight = 0; //currprefs.win32_statusbar ? getstatuswindowheight () : 0;

		/*if (hAmigaWnd !== null) { alread opened
			RECT r;
			int w, h, x, y;
			int nw, nh, nx, ny;

			if (minimized) {
				minimized = -1;
				return 1;
			}
			#if 0
			if (minimized && hMainWnd) {
				unsetminimized ();
				ShowWindow (hMainWnd, SW_SHOW);
				ShowWindow (hMainWnd, SW_RESTORE);
			}
			#endif
			GetWindowRect (hAmigaWnd, &r);
			x = r.left;
			y = r.top;
			w = r.right - r.left;
			h = r.bottom - r.top;
			nx = x;
			ny = y;

			if (screen_is_picasso) {
				nw = currentmode.current_width;
				nh = currentmode.current_height;
			} else {
				nw = SAEV_config.video.size_win.width;
				nh = SAEV_config.video.size_win.height;
			}

			if (fsw || dxfs) {
				RECT rc = md.rect;
				nx = rc.left;
				ny = rc.top;
				nw = rc.right - rc.left;
				nh = rc.bottom - rc.top;
			} else if (d3dfs) {
				RECT rc = md.rect;
				nw = currentmode.native_width;
				nh = currentmode.native_height;
				if (rc.left >= 0)
					nx = rc.left;
				else
					nx = rc.left + (rc.right - rc.left - nw);
				if (rc.top >= 0)
					ny = rc.top;
				else
					ny = rc.top + (rc.bottom - rc.top - nh);
			}
			if (w != nw || h != nh || x != nx || y != ny || sbheight != prevsbheight) {
				w = nw;
				h = nh;
				x = nx;
				y = ny;
				in_sizemove++;
				if (hMainWnd && !fsw && !dxfs && !d3dfs && !rp_isactive ()) {
					window_extra_height += (sbheight - prevsbheight);
					GetWindowRect (hMainWnd, &r);
					x = r.left;
					y = r.top;
					SetWindowPos (hMainWnd, HWND_TOP, x, y, w + window_extra_width, h + window_extra_height,
						SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOSENDCHANGING | SWP_NOZORDER);
					x = gap;
					y = gap;
				}
				SetWindowPos (hAmigaWnd, HWND_TOP, x, y, w, h,
					SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOSENDCHANGING | SWP_NOZORDER);
				in_sizemove--;
			} else {
				w = nw;
				h = nh;
				x = nx;
				y = ny;
			}
			createstatuswindow();
			createstatusline();
			updatewinrect(false);
			GetWindowRect(hMainWnd, &mainwin_rect);
			if (d3dfs || dxfs)
				movecursor (x + w / 2, y + h / 2);
			write_log (_T("window already open (%dx%d %dx%d)\n"), amigawin_rect.left, amigawin_rect.top, amigawin_rect.right - amigawin_rect.left, amigawin_rect.bottom - amigawin_rect.top);
			updatemouseclip ();
			rp_screenmode_changed ();
			prevsbheight = sbheight;
			return 1;
		}*/

		if (fw && !borderless)
			borderless = true;

		//window_led_drives = 0;
		//window_led_drives_end = 0;
		hMainWnd = null;
		x = 0; y = 0;
		if (borderless)
			sbheight = cyborder = 0;

		if (!fs) { // && !d3dfs)  {
			var rc = new RECT();
			var stored_x = 1, stored_y = sbheight + cyborder;
			//var oldx, oldy;
			var first = 2;

			//regqueryint (null, _T("MainPosX"), &stored_x);
			//regqueryint (null, _T("MainPosY"), &stored_y);

			if (borderless) {
				stored_x = SAEV_config.video.size_win.x;
				stored_y = SAEV_config.video.size_win.y;
			}

			while (first) {
				first--;
				/*if (stored_x < GetSystemMetrics (SM_XVIRTUALSCREEN))
					stored_x = GetSystemMetrics (SM_XVIRTUALSCREEN);
				if (stored_y < GetSystemMetrics (SM_YVIRTUALSCREEN) + sbheight + cyborder)
					stored_y = GetSystemMetrics (SM_YVIRTUALSCREEN) + sbheight + cyborder;

				if (stored_x > GetSystemMetrics (SM_CXVIRTUALSCREEN))
					rc.left = 1;
				else
					rc.left = stored_x;

				if (stored_y > GetSystemMetrics (SM_CYVIRTUALSCREEN))
					rc.top = 1;
				else
					rc.top = stored_y;*/
				rc.left = 0;
				rc.top = 0;

				rc.right = rc.left + gap + currentmode.current_width + gap;
				rc.bottom = rc.top + gap + currentmode.current_height + gap + sbheight;

				/*oldx = rc.left;
				oldy = rc.top;
				AdjustWindowRect (&rc, borderless ? WS_POPUP : style, FALSE);
				win_x_diff = rc.left - oldx;
				win_y_diff = rc.top - oldy;

				if (MonitorFromRect (&rc, MONITOR_DEFAULTTONULL) == null) {
					write_log (_T("window coordinates are not visible on any monitor, reseting..\n"));
					stored_x = stored_y = 0;
					continue;
				}*/
				break;
			}

			if (fw) {
				rc = SAEF_CloneObject(md.rect);
				//flags |= WS_EX_TOPMOST;
				//style = WS_POPUP;
				currentmode.native_width = rc.right - rc.left;
				currentmode.native_height = rc.bottom - rc.top;
			}
			//flags |= (currprefs.win32_alwaysontop ? WS_EX_TOPMOST : 0);

			if (!borderless) {
				/*RECT rc2;
				hMainWnd = CreateWindowEx (WS_EX_ACCEPTFILES | exstyle | flags,
					_T("PCsuxRox"), _T("WinUAE"),
					style,
					rc.left, rc.top,
					rc.right - rc.left, rc.bottom - rc.top,
					null, null, hInst, null);
				if (!hMainWnd) {
					write_log (_T("main window creation failed\n"));
					return 0;
				}
				GetWindowRect (hMainWnd, &rc2);
				window_extra_width = rc2.right - rc2.left - currentmode.current_width;
				window_extra_height = rc2.bottom - rc2.top - currentmode.current_height;*/

				//createstatuswindow();
				//createstatusline();
			} else {
				x = rc.left;
				y = rc.top;
			}
			w = currentmode.native_width;
			h = currentmode.native_height;
		} else {
			//getbestmode(0);
			w = currentmode.native_width;
			h = currentmode.native_height;
			var rc = md.rect;
			if (rc.left >= 0)
				x = rc.left;
			else
				x = rc.left + (rc.right - rc.left - w);
			if (rc.top >= 0)
				y = rc.top;
			else
				y = rc.top + (rc.bottom - rc.top - h);
		}

		/*if (rp_isactive() && !fs && !d3dfs && !fw) {
			HWND parent = rp_getparent ();
			hAmigaWnd = CreateWindowEx (fs || d3dfs ? WS_EX_ACCEPTFILES | WS_EX_TOPMOST : WS_EX_ACCEPTFILES | WS_EX_TOOLWINDOW | (currprefs.win32_alwaysontop ? WS_EX_TOPMOST : 0),
				_T("AmigaPowah"), _T("WinUAE"), WS_POPUP,
				0, 0, w, h,
				parent, null, hInst, null);
		} else*/ {
			/*hAmigaWnd = CreateWindowEx (
				((fs || d3dfs || currprefs.win32_alwaysontop) ? WS_EX_TOPMOST : WS_EX_ACCEPTFILES) | exstyle, _T("AmigaPowah"), _T("WinUAE"),
				((fs || d3dfs || currprefs.headless) ? WS_POPUP : (WS_CLIPCHILDREN | WS_CLIPSIBLINGS | (hMainWnd ? WS_VISIBLE | WS_CHILD : WS_VISIBLE | WS_POPUP | WS_SYSMENU | WS_MINIMIZEBOX))),
				x, y, w, h,
				borderless ? null : (hMainWnd ? hMainWnd : null),
				null, hInst, null
			);*/
			try {
				hAmigaWnd = CreateWindow(x, y, w, h);
			} catch(err) {
				doExit();
				return err;
			}
		}
		/*if (hAmigaWnd === null) {
			write_log (_T("creation of amiga window failed\n"));
			doExit();
			return 0;
		}*/
		if (hMainWnd === null) {
			hMainWnd = hAmigaWnd;
			//registertouch(hAmigaWnd);
		} /*else {
			registertouch(hMainWnd);
			registertouch(hAmigaWnd);
		}*/

		//updatewinrect(true);
		//GetWindowRect(hMainWnd, mainwin_rect);
		//if (fs || d3dfs) movecursor(x + w / 2, y + h / 2);

		//addnotifications(hAmigaWnd, FALSE, FALSE);
		//createblankwindows();

		/*if (hMainWnd != hAmigaWnd) {
			if (!currprefs.headless && !rp_isactive ())
				ShowWindow (hMainWnd, firstwindow ? (currprefs.win32_start_minimized ? SW_SHOWMINIMIZED : SW_SHOWDEFAULT) : SW_SHOWNORMAL);
			UpdateWindow (hMainWnd);
		}*/
		//if (!currprefs.headless && !rp_isactive ())
			ShowWindow(hAmigaWnd, SW_SHOWNORMAL);
		//UpdateWindow(hAmigaWnd);
		//setDwmEnableMMCSS (true);

		updatewinrect(true); //OWN must ba called after ShowWindow()

		//firstwindow = false;
		//prevsbheight = sbheight;
		return SAEE_None; //1;
	}

	/*function getrefreshrate(width, height) {
		var ap = SAEV_config.video.apmode[SAEV_Playfield_picasso_on ? 1 : 0];
		var freq = 0;

		if (ap.gfx_refreshrate <= 0)
			return 0;

		var md = getdisplay(SAEV_config);
		for (var i = 0; i < md.DisplayModes.length; i++) {
			var pr = md.DisplayModes[i];
			if (pr.res.width == width && pr.res.height == height) {
				for (var j = 0; j < pr.refresh.length; j++) {
					if (pr.refresh[j] == ap.gfx_refreshrate)
						return ap.gfx_refreshrate;
					if (pr.refresh[j] > freq && pr.refresh[j] < ap.gfx_refreshrate)
						freq = pr.refresh[j];
				}
			}
		}
		SAEF_log("video.getrefreshrate() Refresh rate %d not supported, using %d", ap.gfx_refreshrate, freq);
		return freq;
	}*/

	function set_ddraw_2() {
		var bits = (currentmode.current_depth + 7) & ~7;
		var width = currentmode.native_width;
		var height = currentmode.native_height;
		var ap = SAEV_config.video.apmode[SAEV_Playfield_picasso_on ? 1 : 0];
		var freq = ap.gfx_refreshrate;
		var ddrval = 0;

		var fs = (currentmode.flags & DM_FULLSCREEN) != 0;
		//var fw = (currentmode.flags & DM_FULLWINOW) != 0; unused
		//var dd = (currentmode.flags & DM_DDRAW) != 0;
		var dd = (currentmode.flags & DM_CANVAS) != 0;

		/*if (WIN32GFX_IsPicassoScreen() && (picasso96_state.Width > width || picasso96_state.Height > height)) {
			width = picasso96_state.Width;
			height = picasso96_state.Height;
		}*/

		hAmigaWnd.surface = null;
		//DirectDraw_FreeMainSurface();

		if (!dd && !fs)
			return 1;

		/*ddrval = DirectDraw_SetCooperativeLevel(hAmigaWnd, fs, true);
		if (FAILED(ddrval))
			return 0;*/

		/*if (fs)  {
			for (;;) {
				freq = getrefreshrate(width, height);
				SAEF_log("video.set_ddraw_2() trying %dx%d, bits=%d, refreshrate=%d", width, height, bits, freq);
				ddrval = DirectDraw_SetDisplayMode(width, height, bits, freq);
				if (SUCCEEDED(ddrval))
					break;
				var olderr = ddrval;
				if (freq) {
					SAEF_log("video.set_ddraw_2() failed, trying without forced refresh rate");
					freq = 0;
					DirectDraw_SetCooperativeLevel(hAmigaWnd, fs, true);
					ddrval = DirectDraw_SetDisplayMode(width, height, bits, freq);
					if (SUCCEEDED(ddrval))
						break;
				}
				if (olderr != DDERR_INVALIDMODE  && olderr != 0x80004001 && olderr != DDERR_UNSUPPORTEDMODE)
					return 0;

				return -1;
			}
			currentmode.freq = freq;
			updatewinrect(true);
		}*/

		/*if (dd) {
			ddrval = DirectDraw_CreateClipper();
			if (FAILED (ddrval))
				return 0;
			ddrval = DirectDraw_CreateMainSurface(width, height);
			if (FAILED(ddrval)) {
				SAEF_error("video.set_ddraw_2() couldn't CreateSurface() for primary because %s.", DXError(ddrval));
				return 0;
			}
			ddrval = DirectDraw_SetClipper(hAmigaWnd);
			if (FAILED(ddrval))
				return 0;
			if (DirectDraw_SurfaceLock()) {
				currentmode.pitch = DirectDraw_GetSurfacePitch();
				DirectDraw_SurfaceUnlock();
			}
		}*/
		if (dd) {
			hAmigaWnd.surface = new Surface(width, height, 4);
			hAmigaWnd.surface.imageData = hAmigaWnd.ctx.createImageData(width, height);
			currentmode.pitch = hAmigaWnd.surface.rowbytes;
		}

		SAEF_log("video.set_ddraw_2() %dx%d@%d-bytes", width, height, bits);
		return 1;
	}
	function set_ddraw() {
		var cnt = 3;
		for (;;) {
			var ret = set_ddraw_2();
			if (cnt-- <= 0)
				return 0;
			/*if (ret < 0) {
				getbestmode(1);
				continue;
			}*/
			if (ret == 0)
				return 0;
			break;
		}
		return 1;
	}

	function create_windows() {
		var err = create_windows_2();
		if (err != SAEE_None)
			return err;

		set_ddraw();
		return SAEE_None;
	}

	function allocsoftbuffer(name, buf, flags, width, height, depth) {
		buf.pixbytes = (depth + 7) >> 3; // / 8;
		buf.width_allocated = (width + 7) & ~7;
		buf.height_allocated = height;

		if (!(flags & DM_SWSCALE)) {
			if (buf !== SAER_Playfield_gfxvidinfo.drawbuffer)
				return;

			buf.bufmem = null;
			buf.bufmemend = null;
			buf.realbufmem = null;
			buf.bufmem_allocated = null;
			buf.bufmem_lockable = true;

			SAEF_log("video.allocsoftbuffer() Reserved %s temp buffer (%d*%d*%d)", name, width, height, depth);
		} else if (flags & DM_SWSCALE) {
			var w = buf.width_allocated;
			var h = buf.height_allocated;
			var size = (w * 2) * (h * 2) * buf.pixbytes;
			buf.rowbytes = w * 2 * buf.pixbytes;

			/* ORG
			buf.realbufmem = xcalloc(uae_u8, size);
			buf.bufmem = buf.realbufmem + (h / 2) * buf.rowbytes + (w / 2) * buf.pixbytes;
			buf.bufmemend = buf.realbufmem + size - buf.rowbytes;
			buf.bufmem_allocated = buf.bufmem;*/

			buf.realbufmem = new ArrayBuffer(size);
			buf.bufmem = buf.realbufmem;
			buf.bufmem_pos = (h / 2) * buf.rowbytes + (w / 2) * buf.pixbytes; ///OWN
			buf.bufmemend = buf.realbufmem;
			buf.bufmemend_pos = size - buf.rowbytes; ///OWN
			buf.bufmem_allocated = buf.bufmem;

			buf.bufmem_lockable = true;

			SAEF_log("video.allocsoftbuffer() Allocated %s temp buffer (%d*%d*%d)", name, width, height, depth);
		}
	}
	function freevidbuffer(buf) {
		//xfree (buf.realbufmem);
		//buf.realbufmem = null;
		buf.clr(); //memset(buf, 0, sizeof (struct vidbuffer));
	}

	/* Color management */
	//static xcolnr xcol8[4096];

	var red_bits = 0, green_bits = 0, blue_bits = 0, alpha_bits = 0;
	var red_shift = 0, green_shift = 0, blue_shift = 0, alpha_shift = 0;
	var alpha = 0;

	function init_colors() { //global
		var byte_swap = SAEC_LITTLE_ENDIAN;

		if (currentmode.flags & DM_WEBGL) {
			if (currentmode.current_depth == 16) { //R5G6B5
				red_bits = 5;
				green_bits = 6;
				blue_bits = 5;
				alpha_bits = 0;
				red_shift = 11;
				green_shift = 5;
				blue_shift = 0;
				alpha_shift = 0;
				alpha = 0;
				byte_swap = false;
			}
			else { //RGBA
				red_bits = 8;
				green_bits = 8;
				blue_bits = 8;
				alpha_bits = 8;
				red_shift = 24;
				green_shift = 16;
				blue_shift = 8;
				alpha_shift = 0;
				alpha = SAEV_config.video.alpha;
			}
		}
		else if (currentmode.flags & DM_CANVAS) {
			if (1) { //RGBA
				red_bits = 8;
				green_bits = 8;
				blue_bits = 8;
				alpha_bits = 8;
				red_shift = 24;
				green_shift = 16;
				blue_shift = 8;
				alpha_shift = 0;
				alpha = SAEV_config.video.alpha;
			}
			else { //RGB
				red_bits = 8;
				green_bits = 8;
				blue_bits = 8;
				alpha_bits = 0;
				red_shift = 16;
				green_shift = 8;
				blue_shift = 0;
				alpha_shift = 0;
				alpha = 0;
			}
		}
		/*else if (currentmode.flags & DM_D3D) {
			D3D_getpixelformat (currentmode.current_depth, &red_bits, &green_bits, &blue_bits, &red_shift, &green_shift, &blue_shift, &alpha_bits, &alpha_shift, &alpha);
		} else {
			red_bits = bits_in_mask(DirectDraw_GetPixelFormatBitMask(red_mask));
			green_bits = bits_in_mask(DirectDraw_GetPixelFormatBitMask(green_mask));
			blue_bits = bits_in_mask(DirectDraw_GetPixelFormatBitMask(blue_mask));
			alpha_bits = 0;
			//alpha_bits = bits_in_mask(DirectDraw_GetPixelFormatBitMask(alpha_mask)); //OWN
			red_shift = mask_shift(DirectDraw_GetPixelFormatBitMask(red_mask));
			green_shift = mask_shift(DirectDraw_GetPixelFormatBitMask(green_mask));
			blue_shift = mask_shift(DirectDraw_GetPixelFormatBitMask(blue_mask));
			alpha_shift = 0;
			//alpha_shift = mask_shift(DirectDraw_GetPixelFormatBitMask(alpha_mask)); //OWN

			if (currentmode.current_depth != currentmode.native_depth) {
				if (currentmode.current_depth == 16) {
					red_bits = 5; green_bits = 6; blue_bits = 5;
					red_shift = 11; green_shift = 5; blue_shift = 0;
				} else {
					red_bits = green_bits = blue_bits = 8;
					red_shift = 16; green_shift = 8; blue_shift = 0;
				}
			}
		}*/

		SAER.playfield.alloc_colors64k(red_bits, green_bits, blue_bits, red_shift, green_shift, blue_shift, alpha_bits, alpha_shift, alpha, byte_swap);

		SAER.playfield.notice_new_xcolors_ext();

		//S2X_configure(red_bits, green_bits, blue_bits, red_shift,green_shift, blue_shift);

		/*#ifdef AVIOUTPUT
		AVIOutput_RGBinfo (red_bits, green_bits, blue_bits, red_shift, green_shift, blue_shift);
		#endif
		Screenshot_RGBinfo (red_bits, green_bits, blue_bits, red_shift, green_shift, blue_shift);*/
	}

	/*static HWND blankwindows[MAX_DISPLAYS];
	static void closeblankwindows (void) {
		for (int i = 0; i < MAX_DISPLAYS; i++) {
			HWND h = blankwindows[i];
			if (h) {
				ShowWindow (h, SW_HIDE);
				DestroyWindow (h);
				blankwindows[i] = null;
			}
		}
	}
	static void createblankwindows (void) {
		struct MultiDisplay *mdx = getdisplay (&currprefs);
		int i;

		if (!currprefs.win32_blankmonitors)
			return;

		for (i = 0; Displays[i].monitorname; i++) {
			struct MultiDisplay *md = &Displays[i];
			TCHAR name[100];
			if (mdx == md)
				continue;
			_stprintf (name, _T("WinUAE_Blank_%d"), i);
			blankwindows[i] = CreateWindowEx (
				WS_EX_TOPMOST,
				_T("Blank"), name,
				WS_POPUP | WS_VISIBLE,
				md.rect.left, md.rect.top, md.rect.right - md.rect.left, md.rect.bottom - md.rect.top,
				null,
				null, hInst, null);
		}
	}*/

	function doInit() {
		//var fs_warning = -1;
		//var tmp_depth = 0;
		//var ret = 0;
		var err = 0;

		remembered_vblank = -1;
		if (wasfullwindow_a == 0)
			wasfullwindow_a = SAEV_config.video.apmode[0].gfx_fullscreen == SAEC_Config_Video_AP_Fullscreen_FULLWINDOW ? 1 : -1;
		if (wasfullwindow_p == 0)
			wasfullwindow_p = SAEV_config.video.apmode[1].gfx_fullscreen == SAEC_Config_Video_AP_Fullscreen_FULLWINDOW ? 1 : -1;

		gfxmode_reset();
		freevidbuffer(SAER_Playfield_gfxvidinfo.drawbuffer);
		freevidbuffer(SAER_Playfield_gfxvidinfo.tempbuffer);

		for (;;) {
			updatemodes();
			currentmode.native_depth = 0;
			//tmp_depth = currentmode.current_depth;

			if (currentmode.flags & DM_FULLWINOW) {
				var rc = getdisplay(SAEV_config).rect;
				currentmode.native_width = rc.right - rc.left;
				currentmode.native_height = rc.bottom - rc.top;
			}

			/*if (!(currentmode.flags & DM_D3D) && isfullscreen() <= 0) {
				currentmode.current_depth = DirectDraw_GetCurrentDepth();
				updatemodes();
			}
			if (!(currentmode.flags & DM_D3D) && DirectDraw_GetCurrentDepth() == currentmode.current_depth) {
				updatemodes();
			}*/
			/*if (0) { //OWN
				switch (screen.colorDepth) {
					case 32:
					case 24:
						currentmode.current_depth = 32;
						break;
					default:
						currentmode.current_depth = 16;
				}
				updatemodes();
			}*/

			/*if (!rp_isactive() && (currentmode.current_width > GetSystemMetrics(SM_CXVIRTUALSCREEN) || currentmode.current_height > GetSystemMetrics(SM_CYVIRTUALSCREEN))) {
				if (!console_logging)
					fs_warning = IDS_UNSUPPORTEDSCREENMODE_3;
			}
			if (fs_warning >= 0 && isfullscreen() <= 0) {
				TCHAR szMessage[MAX_DPATH], szMessage2[MAX_DPATH];
				WIN32GUI_LoadUIString(IDS_UNSUPPORTEDSCREENMODE, szMessage, MAX_DPATH);
				WIN32GUI_LoadUIString(fs_warning, szMessage2, MAX_DPATH);
				// Temporarily drop the DirectDraw stuff
				DirectDraw_Release();
				var tmpstr = sprintf(szMessage, szMessage2);
				gui_message (tmpstr);
				// Switch to fullscreen
				DirectDraw_Start();
				if (screen_is_picasso)
					changed_prefs.gfx_apmode[1].gfx_fullscreen = SAEV_config.video.apmode[1].gfx_fullscreen = SAEC_Config_Video_AP_Fullscreen_FULLSCREEN;
				else
					changed_prefs.gfx_apmode[0].gfx_fullscreen = SAEV_config.video.apmode[0].gfx_fullscreen = SAEC_Config_Video_AP_Fullscreen_FULLSCREEN;
				updatewinfsmode(&currprefs);
				updatewinfsmode(&changed_prefs);
				currentmode.current_depth = tmp_depth;
				updatemodes();
				ret = -2;
				goto oops;
			}*/
			if ((err = create_windows()) != SAEE_None) {
				//ret = 0; goto oops;
				doExit();
				return err;
			}

			if (screen_is_picasso) {
				break;
			} else {
				currentmode.native_depth = currentmode.current_depth;

				if (SAEV_config.video.hresolution > SAER_Playfield_gfxvidinfo.gfx_resolution_reserved)
					SAER_Playfield_gfxvidinfo.gfx_resolution_reserved = SAEV_config.video.hresolution;
				if (SAEV_config.video.vresolution > SAER_Playfield_gfxvidinfo.gfx_vresolution_reserved)
					SAER_Playfield_gfxvidinfo.gfx_vresolution_reserved = SAEV_config.video.vresolution;

				//SAER_Playfield_gfxvidinfo.drawbuffer.gfx_resolution_reserved = RES_SUPERHIRES; ORG

				//if (currentmode.flags & (DM_D3D | DM_SWSCALE)) {
				//if (currentmode.flags & (DM_WEBGL | DM_SWSCALE)) {
				if (0) {
					//if (!currprefs.gfx_autoresolution) {
						currentmode.amiga_width = SAEC_Video_MAX_AMIGA_WIDTH << SAEV_config.video.hresolution;
						currentmode.amiga_height = SAEC_Video_MAX_AMIGA_HEIGHT << SAEV_config.video.vresolution;
					/*} else {
						currentmode.amiga_width = SAEC_Video_MAX_AMIGA_WIDTH << SAER_Playfield_gfxvidinfo.gfx_resolution_reserved;
						currentmode.amiga_height = SAEC_Video_MAX_AMIGA_HEIGHT << SAER_Playfield_gfxvidinfo.gfx_vresolution_reserved;
					}*/
					/*if (SAER_Playfield_gfxvidinfo.gfx_resolution_reserved == SAEC_Config_Video_HResolution_SuperHiRes)
						currentmode.amiga_height <<= 1;
					if (currentmode.amiga_height > 1280)
						currentmode.amiga_height = 1280;*/

					SAER_Playfield_gfxvidinfo.drawbuffer.inwidth = SAER_Playfield_gfxvidinfo.drawbuffer.outwidth = currentmode.amiga_width;
					SAER_Playfield_gfxvidinfo.drawbuffer.inheight = SAER_Playfield_gfxvidinfo.drawbuffer.outheight = currentmode.amiga_height;

					if (usedfilter !== null) {
						if ((usedfilter.flags & (UAE_FILTER_MODE_16 | UAE_FILTER_MODE_32)) == (UAE_FILTER_MODE_16 | UAE_FILTER_MODE_32))
							currentmode.current_depth = currentmode.native_depth;
						else
							currentmode.current_depth = (usedfilter.flags & UAE_FILTER_MODE_32) ? 32 : 16;
					}
					currentmode.pitch = currentmode.amiga_width * (currentmode.current_depth >> 3);
				} else {
					currentmode.amiga_width = currentmode.current_width;
					currentmode.amiga_height = currentmode.current_height;
				}
				SAER_Playfield_gfxvidinfo.drawbuffer.pixbytes = currentmode.current_depth >> 3;
				SAER_Playfield_gfxvidinfo.drawbuffer.bufmem = null;
				SAER_Playfield_gfxvidinfo.drawbuffer.linemem = null;
				SAER_Playfield_gfxvidinfo.drawbuffer.rowbytes = currentmode.pitch;
				SAER_Playfield_gfxvidinfo.maxblocklines = 0; // flush_screen actually does everything
				break;
			}
		}

		/*#ifdef PICASSO96
		picasso_vidinfo.rowbytes = 0;
		picasso_vidinfo.pixbytes = currentmode.current_depth / 8;
		picasso_vidinfo.rgbformat = 0;
		picasso_vidinfo.extra_mem = 1;
		picasso_vidinfo.height = currentmode.current_height;
		picasso_vidinfo.width = currentmode.current_width;
		picasso_vidinfo.depth = currentmode.current_depth;
		picasso_vidinfo.offset = 0;
		#endif*/

		if (scrlinebuf === null) {
			//scrlinebuf = xmalloc(uae_u8, SAEC_Video_MAX_UAE_WIDTH * 4);
			scrlinebuf = new ArrayBuffer(SAEC_Video_MAX_UAE_WIDTH * 4);
		}
		SAER_Playfield_gfxvidinfo.drawbuffer.emergmem = scrlinebuf; // memcpy from system-memory to video-memory
		SAER_Playfield_gfxvidinfo.drawbuffer.realbufmem = null;
		SAER_Playfield_gfxvidinfo.drawbuffer.bufmem = null;
		SAER_Playfield_gfxvidinfo.drawbuffer.bufmem_allocated = null;
		SAER_Playfield_gfxvidinfo.drawbuffer.bufmem_lockable = false;

		SAER_Playfield_gfxvidinfo.outbuffer = SAER_Playfield_gfxvidinfo.drawbuffer;
		SAER_Playfield_gfxvidinfo.inbuffer = SAER_Playfield_gfxvidinfo.drawbuffer;

		if (!screen_is_picasso) {
			//if (SAEV_config.video.api == SAEC_Config_Video_API_Canvas && SAEV_config.video.gf[0].gfx_filter == 0)
				allocsoftbuffer("draw", SAER_Playfield_gfxvidinfo.drawbuffer, currentmode.flags, currentmode.native_width, currentmode.native_height, currentmode.current_depth);
			//else
				//allocsoftbuffer("draw", SAER_Playfield_gfxvidinfo.drawbuffer, currentmode.flags, 1600, 1280, currentmode.current_depth);

			/*if (currprefs.monitoremu || currprefs.cs_cd32fmv || (currprefs.genlock && currprefs.genlock_image) || currprefs.cs_color_burst || currprefs.gfx_grayscale) {
				allocsoftbuffer("monemu", SAER_Playfield_gfxvidinfo.tempbuffer, currentmode.flags,
					currentmode.amiga_width > 1024 ? currentmode.amiga_width : 1024,
					currentmode.amiga_height > 1024 ? currentmode.amiga_height : 1024,
					currentmode.current_depth);
			}*/
			SAER_Playfield_init_row_map();
		}
		init_colors();

		//S2X_free();
		oldtex_w = oldtex_h = -1;

		/*if (currentmode.flags & DM_D3D) {
			const TCHAR *err = D3D_init (hAmigaWnd, currentmode.native_width, currentmode.native_height, currentmode.current_depth, &currentmode.freq, screen_is_picasso ? 1 : SAEV_config.video.gf[SAEV_Playfield_picasso_on ? 1 : 0].gfx_filter_filtermode + 1);
			if (err) {
				D3D_free (true);
				gui_message (err);
				SAEV_config.video.api = SAEC_Config_Video_API_Canvas; //changed_prefs.gfx_api = SAEC_Config_Video_API_Canvas;
				SAEV_config.video.gf[SAEV_Playfield_picasso_on ? 1 : 0].gfx_filter = 0; //changed_prefs.gf[SAEV_Playfield_picasso_on ? 1 : 0].gfx_filter = 0
				currentmode.current_depth = currentmode.native_depth;
				gfxmode_reset();
				DirectDraw_Start();
				ret = -1;
				goto oops;
			}
			target_graphics_buffer_update();
			updatewinrect(true);
		}*/
		if (currentmode.flags & DM_WEBGL) {
			err = setupWebGL(hAmigaWnd.ctx, currentmode.native_width, currentmode.native_height);
			if (err != SAEE_None) {
				doExit();
				return err;
			}
			//SAER.video.target_graphics_buffer_update();
			updatewinrect(true);
		}

		screen_is_initialized = true;
		//createstatusline();
		//picasso_refresh();
		/*#ifdef RETROPLATFORM
		rp_set_hwnd_delayed();
		#endif*/

		//if (isfullscreen() != 0) setmouseactive(-1);

		return err; //1;

		/*oops:
		doExit();
		return ret;*/
	}

	function doExit() { //close_hwnds()
		screen_is_initialized = false;
		/*#ifdef AVIOUTPUT
		AVIOutput_Restart();
		#endif
		setmouseactive(0);
		#ifdef RETROPLATFORM
		rp_set_hwnd(null);
		#endif
		closeblankwindows();
		deletestatusline();
		if (hStatusWnd) {
			ShowWindow (hStatusWnd, SW_HIDE);
			DestroyWindow (hStatusWnd);
			hStatusWnd = 0;
		}*/
		if (hAmigaWnd !== null) {
			//addnotifications (hAmigaWnd, TRUE, FALSE);
			//D3D_free (true);
			ShowWindow(hAmigaWnd, SW_HIDE);
			DestroyWindow(hAmigaWnd);
			if (hAmigaWnd == hMainWnd) hMainWnd = null;
			hAmigaWnd = null;
		}
		/*if (hMainWnd) {
			ShowWindow (hMainWnd, SW_HIDE);
			DestroyWindow (hMainWnd);
			hMainWnd = null;
		}*/
	}



	this.updatedisplayarea = function() {
		/*if (!screen_is_initialized)
			return;
		if (dx_islost())
			return;

		if (currentmode.flags & DM_D3D) {
			D3D_refresh();
		}
		else if (currentmode.flags & DM_DDRAW) {
			if (!SAEV_Playfield_picasso_on && (currentmode.flags & DM_SWSCALE))
				S2X_refresh();

			DirectDraw_Flip(0);
		}*/
	}

	function updatewinfsmode(p) { //global
		//struct MultiDisplay *md;

		SAER.config.fixup_prefs_dimensions_ext(p);
		if (isfullscreen_2(p) != 0)
			p.video.size = SAEF_CloneObject(p.video.size_fs);
		else
			p.video.size = SAEF_CloneObject(p.video.size_win);

		//md = getdisplay(p);
		//set_config_changed();
	}

	function update_gfxparams() {
		updatewinfsmode(SAEV_config);
		/*#ifdef PICASSO96
		currentmode.vsync = 0;
		if (screen_is_picasso) {
			currentmode.current_width = (int)(picasso96_state.Width * currprefs.rtg_horiz_zoom_mult);
			currentmode.current_height = (int)(picasso96_state.Height * currprefs.rtg_vert_zoom_mult);
			SAEV_config.video.apmode[1].gfx_interlaced = false;
			if (currprefs.win32_rtgvblankrate == 0) {
				SAEV_config.video.apmode[1].gfx_refreshrate = SAEV_config.video.apmode[0].gfx_refreshrate;
				if (SAEV_config.video.apmode[0].gfx_interlaced) {
					SAEV_config.video.apmode[1].gfx_refreshrate *= 2;
				}
			} else if (currprefs.win32_rtgvblankrate < 0) {
				SAEV_config.video.apmode[1].gfx_refreshrate = 0;
			} else {
				SAEV_config.video.apmode[1].gfx_refreshrate = currprefs.win32_rtgvblankrate;
			}
			if (SAEV_config.video.apmode[1].gfx_vsync)
				currentmode.vsync = 1 + SAEV_config.video.apmode[1].gfx_vsyncmode;
		} else {
		#endif*/
			currentmode.current_width = SAEV_config.video.size.width;
			currentmode.current_height = SAEV_config.video.size.height;
			if (SAEV_config.video.apmode[0].gfx_vsync)
				currentmode.vsync = 1 + SAEV_config.video.apmode[0].gfx_vsyncmode;
		/*#ifdef PICASSO96
		}
		#endif*/

		currentmode.current_depth = SAEV_config.video.colorMode < 5 ? 16 : 32;
		/*if (screen_is_picasso && currprefs.win32_rtgmatchdepth && isfullscreen() > 0) {
			int pbits = picasso96_state.BytesPerPixel * 8;
			if (pbits <= 8) {
				if (currentmode.current_depth == 32)
					pbits = 32;
				else
					pbits = 16;
			}
			if (pbits == 24)
				pbits = 32;
			currentmode.current_depth = pbits;
		}*/
		currentmode.amiga_width = currentmode.current_width;
		currentmode.amiga_height = currentmode.current_height;

		/*scalepicasso = 0;
		if (screen_is_picasso) {
			if (isfullscreen () < 0) {
				if ((SAEV_config.video.gf[1].gfx_filter_autoscale == RTG_MODE_CENTER || SAEV_config.video.gf[1].gfx_filter_autoscale == RTG_MODE_SCALE || currprefs.win32_rtgallowscaling) && (picasso96_state.Width != currentmode.native_width || picasso96_state.Height != currentmode.native_height))
					scalepicasso = 1;
				if (SAEV_config.video.gf[1].gfx_filter_autoscale == RTG_MODE_CENTER)
					scalepicasso = SAEV_config.video.gf[1].gfx_filter_autoscale;
				if (!scalepicasso && currprefs.win32_rtgscaleaspectratio)
					scalepicasso = -1;
			} else if (isfullscreen () > 0) {
				if (!currprefs.win32_rtgmatchdepth) { // can't scale to different color depth
					if (currentmode.native_width > picasso96_state.Width && currentmode.native_height > picasso96_state.Height) {
						if (SAEV_config.video.gf[1].gfx_filter_autoscale)
							scalepicasso = 1;
					}
					if (SAEV_config.video.gf[1].gfx_filter_autoscale == RTG_MODE_CENTER)
						scalepicasso = SAEV_config.video.gf[1].gfx_filter_autoscale;
					if (!scalepicasso && currprefs.win32_rtgscaleaspectratio)
						scalepicasso = -1;
				}
			} else if (isfullscreen () == 0) {
				if (SAEV_config.video.gf[1].gfx_filter_autoscale == RTG_MODE_INTEGER_SCALE) {
					scalepicasso = RTG_MODE_INTEGER_SCALE;
					currentmode.current_width = SAEV_config.video.size.width;
					currentmode.current_height = SAEV_config.video.size.height;
				} else if (SAEV_config.video.gf[1].gfx_filter_autoscale == RTG_MODE_CENTER) {
					if (SAEV_config.video.size.width < picasso96_state.Width || SAEV_config.video.size.height < picasso96_state.Height) {
						if (!currprefs.win32_rtgallowscaling) {
							;
						} else if (currprefs.win32_rtgscaleaspectratio) {
							scalepicasso = -1;
							currentmode.current_width = SAEV_config.video.size.width;
							currentmode.current_height = SAEV_config.video.size.height;
						}
					} else {
						scalepicasso = 2;
						currentmode.current_width = SAEV_config.video.size.width;
						currentmode.current_height = SAEV_config.video.size.height;
					}
				} else if (SAEV_config.video.gf[1].gfx_filter_autoscale == RTG_MODE_SCALE) {
					if (SAEV_config.video.size.width > picasso96_state.Width || SAEV_config.video.size.height > picasso96_state.Height)
						scalepicasso = 1;
					if ((SAEV_config.video.size.width != picasso96_state.Width || SAEV_config.video.size.height != picasso96_state.Height) && currprefs.win32_rtgallowscaling) {
						scalepicasso = 1;
					} else if (SAEV_config.video.size.width < picasso96_state.Width || SAEV_config.video.size.height < picasso96_state.Height) {
						// no always scaling and smaller? Back to normal size
						currentmode.current_width = changed_prefs.gfx_size_win.width = picasso96_state.Width;
						currentmode.current_height = changed_prefs.gfx_size_win.height = picasso96_state.Height;
					} else if (SAEV_config.video.size.width == picasso96_state.Width || SAEV_config.video.size.height == picasso96_state.Height) {
						;
					} else if (!scalepicasso && currprefs.win32_rtgscaleaspectratio) {
						scalepicasso = -1;
					}
				} else {
					if ((SAEV_config.video.size.width != picasso96_state.Width || SAEV_config.video.size.height != picasso96_state.Height) && currprefs.win32_rtgallowscaling)
						scalepicasso = 1;
					if (!scalepicasso && currprefs.win32_rtgscaleaspectratio)
						scalepicasso = -1;
				}
			}

			if (scalepicasso > 0 && (SAEV_config.video.size.width != picasso96_state.Width || SAEV_config.video.size.height != picasso96_state.Height)) {
				currentmode.current_width = SAEV_config.video.size.width;
				currentmode.current_height = SAEV_config.video.size.height;
			}
		}*/
	}

	function updatemodes() {
		currentmode.fullfill = 0;
		//var flags = DM_DDRAW;
		var flags = DM_CANVAS;

		if (isfullscreen() > 0)
			flags |= DM_FULLSCREEN;
		else if (isfullscreen() < 0)
			flags |= DM_FULLWINOW;

		if (usedfilter !== null) {
			flags |= DM_SWSCALE;
			if (currentmode.current_depth < 15)
				currentmode.current_depth = 16;
		}
		if (SAEV_config.video.api == SAEC_Config_Video_API_WebGL) {
			flags |= DM_WEBGL;
			flags &= ~DM_CANVAS;
			//flags &= ~DM_DDRAW;
		}
		/*if (SAEV_config.video.api) {
			flags |= DM_D3D;
			if (flags & DM_FULLSCREEN) {
				flags &= ~DM_FULLSCREEN;
				flags |= DM_D3D_FULLSCREEN;
			}
			flags &= ~DM_DDRAW;
		}*/
		currentmode.flags = flags;
		if (flags & DM_SWSCALE)
			currentmode.fullfill = 1;
		if (flags & DM_FULLWINOW) {
			var rc = getdisplay(SAEV_config).rect;
			currentmode.current_width = rc.right - rc.left;
			currentmode.current_height = rc.bottom - rc.top;
		}
		currentmode.native_width = currentmode.current_width;
		currentmode.native_height = currentmode.current_height;
	}


	function open_windows(mousecapture) {
		//static bool started = false;

		//changevblankthreadmode(VBLANKTH_IDLE);

		//inputdevice_unacquire();
		//wait_keyrelease();
		//reset_sound(); //ATT maybe enable
		//in_sizemove = 0;

		updatewinfsmode(SAEV_config);

		//D3D_free(false);
		//OGL_free();

		//if (!DirectDraw_Start())
		//	return 0;

		/*init_round = 0;
		var ret = -2;
		do {
			if (ret < -1) {
				updatemodes();
				update_gfxparams();
			}
			ret = doInit();
			init_round++;
			if (ret < -9) {
				DirectDraw_Release();
				if (!DirectDraw_Start())
					return 0;
			}
		} while (ret < 0);
		if (!ret) {
			DirectDraw_Release();
			return ret;
		}*/

		updatemodes();
		update_gfxparams();
		var err = doInit();
		if (err != SAEE_None) {
			//DirectDraw_Release()
			return err;
		}


		/*var startactive = (started && mouseactive) || (!started && !currprefs.win32_start_uncaptured && !currprefs.win32_start_minimized);
		var startpaused = !started && ((currprefs.win32_start_minimized && currprefs.win32_iconified_pause) || (currprefs.win32_start_uncaptured && currprefs.win32_inactive_pause && isfullscreen () <= 0));
		var startminimized = !started && currprefs.win32_start_minimized && isfullscreen () <= 0;
		var input = 0;

		if (mousecapture && startactive)
			setmouseactive(-1);

		var upd = 0;
		if (startactive) {
			setpriority(&priorities[currprefs.win32_active_capture_priority]);
			upd = 2;
		} else if (startminimized) {
			setpriority(&priorities[currprefs.win32_iconified_priority]);
			setminimized();
			input = currprefs.win32_inactive_input;
			upd = 1;
		} else {
			setpriority(&priorities[currprefs.win32_inactive_priority]);
			input = currprefs.win32_inactive_input;
			upd = 2;
		}
		if (upd > 1)*/
		{
			for (var i = 0; i < SAEC_GUI_LED_MAX; i++)
				SAER.gui.flicker_led(i, -1, -1);
			SAER.gui.led(SAEC_GUI_LED_POWER, SAER.gui.data.powerled, SAER.gui.data.powerled_brightness);
			SAER.gui.fps(0, 0, 0);
			//if (SAER.gui.data.md >= 0) SAER.gui.led(SAEC_GUI_LED_MD, 0, -1);
			for (i = 0; i < 4; i++) {
				if (SAEV_config.floppy.drive[i].type != SAEC_Config_Floppy_Type_None)
					SAER.gui.led(SAEC_GUI_LED_DF0 + i, 0, -1);
			}
		}
		/*if (upd > 0) {
			inputdevice_acquire(TRUE);
			if (!isfocus())
				inputdevice_unacquire(true, input);
		}
		if (startpaused)
			setpaused(1);*/

		//started = true;
		return err; //ret;
	}

	function close_windows() { //global
		//changevblankthreadmode(VBLANKTH_IDLE);
		//waitflipevent();
		//setDwmEnableMMCSS(FALSE);
		//reset_sound(); //ATT maybe enable
		//S2X_free();
		freevidbuffer(SAER_Playfield_gfxvidinfo.drawbuffer);
		freevidbuffer(SAER_Playfield_gfxvidinfo.tempbuffer);
		//DirectDraw_Release();
		doExit();
	}

	/*-----------------------------------------------------------------------*/
	/* SECT */
	/*-----------------------------------------------------------------------*/

	function obtain_displays() {
		var md = Displays[0];
		md.monitorname = "Default";
		//md.rect.right = screen.width;
		//md.rect.bottom = screen.height;
		md.rect.right = screen.availWidth;
		md.rect.bottom = screen.availHeight;

		/*if (md.DisplayModes.length) { //picasso96
			var pr = md.DisplayModes[0];
			pr.res.width = screen.availWidth;
			pr.res.height = screen.availHeight;
			pr.deep = 32; //screen.colorDepth;
			pr.refresh[0] = 50;
			pr.refreshtype[0] = 0;
			pr.name = "Default";
			pr.colormodes = RGBFF_R8G8B8;
		}*/
	}
	this.obtain = function() { //graphics_setup()
		/*if (!screen_cs_allocated) {
			InitializeCriticalSection(&screen_cs);
			screen_cs_allocated = true;
		}*/
		/*#ifdef PICASSO96
		InitPicasso96();
		#endif*/

		if (!SAEV_config.video.enabled)
			return SAEE_None;

		var id = document.getElementById(SAEV_config.video.id);
		if (id === null || (id.nodeName != "DIV" && id.nodeName != "CANVAS"))
			return SAEE_Video_ElementNotFound;

		if (SAEV_config.video.api == SAEC_Config_Video_API_WebGL && !SAEC_info.video.webGL) {
			SAEF_warn("video.obtain() 'WebGL' is not available. Falling back to 'Canvas'...");
			SAEV_config.video.api = SAEC_Config_Video_API_Canvas;
			SAEV_config.video.colorMode = 5;
		}
		if (SAEV_config.video.api == SAEC_Config_Video_API_Canvas && !SAEC_info.video.canvas)
			return SAEE_Video_RequiresCanvas;

		if (SAEV_config.video.api == SAEC_Config_Video_API_Canvas && SAEV_config.video.colorMode != 5)
			SAEV_config.video.colorMode = 5;

		obtain_displays();
		return SAEE_None;
	}


	this.setup = function(mousecapture) { //graphics_init()
		if (!SAEV_config.video.enabled)
			return SAEE_None;

		oldtex_w = -1, oldtex_h = -1, oldtex_rtg = 0; //OWN
		render_ok = false; //OWN

		//systray(hHiddenWnd, TRUE);
		//systray(hHiddenWnd, FALSE);
		gfxmode_reset();
		//graphics_mode_changed = 1;
		return open_windows(mousecapture);
	}

	this.cleanup = function() { //graphics_leave()
		//changevblankthreadmode(VBLANKTH_KILL);
		close_windows();
	}

	/*function graphics_reset(forced) { //global
		if (forced)
			display_change_requested = 2;
		else // full reset if display size can't changed.
			display_change_requested = SAEV_config.video.api == SAEC_Config_Video_API_WebGL ? 3 : 2;
	}*/




	var oldtex_w = -1, oldtex_h = -1, oldtex_rtg = 0;

	this.target_graphics_buffer_update = function() {
		//static bool graphicsbuffer_retry;
		var w, h;

		//graphicsbuffer_retry = false;
		if (screen_is_picasso) {
			w = picasso96_state.Width > picasso_vidinfo.width ? picasso96_state.Width : picasso_vidinfo.width;
			h = picasso96_state.Height > picasso_vidinfo.height ? picasso96_state.Height : picasso_vidinfo.height;
		} else {
			var vb = SAER_Playfield_gfxvidinfo.drawbuffer.tempbufferinuse ? SAER_Playfield_gfxvidinfo.tempbuffer : SAER_Playfield_gfxvidinfo.drawbuffer;
			SAER_Playfield_gfxvidinfo.outbuffer = vb;
			w = vb.outwidth;
			h = vb.outheight;
		}

		if (oldtex_w == w && oldtex_h == h && oldtex_rtg == screen_is_picasso)
			return false;

		if (!w || !h) {
			oldtex_w = w;
			oldtex_h = h;
			oldtex_rtg = screen_is_picasso;
			return false;
		}

		//S2X_free();

		if (currentmode.flags & DM_WEBGL) {
			hAmigaWnd.texture = new Texture(w, h, SAER_Playfield_gfxvidinfo.drawbuffer.pixbytes);

			/*var ctx = hAmigaWnd.ctx;
			var resolutionLocation = ctx.getUniformLocation(ctx.program, "u_resolution");
			ctx.uniform2f(resolutionLocation, w, h);*/
		}
		else if (currentmode.flags & DM_CANVAS) {
			hAmigaWnd.surface = new Surface(w, h, 4);
			hAmigaWnd.surface.imageData = hAmigaWnd.ctx.createImageData(w, h);
		}
		/*else if (currentmode.flags & DM_D3D) {
			if (!D3D_alloctexture(w, h)) {
				graphicsbuffer_retry = true;
				return false;
			}
		} else {
			DirectDraw_ClearSurface(null);
		}*/

		oldtex_w = w;
		oldtex_h = h;
		oldtex_rtg = screen_is_picasso;

		SAEF_log("video.target_graphics_buffer_update() Buffer size (%d*%d) %s", w, h, screen_is_picasso ? "RTG" : "Native");

		/*if ((currentmode.flags & DM_SWSCALE) && !screen_is_picasso) {
			if (!S2X_init(currentmode.native_width, currentmode.native_height, currentmode.native_depth))
				return false;
		}*/
		return true;
	}

	/*function toggle_rtg(mode) {
		if (mode == 0) {
			if (!SAEV_Playfield_picasso_on)
				return false;
		} else if (mode > 0) {
			if (SAEV_Playfield_picasso_on)
				return false;
		}
		if (currprefs.rtgmem_type >= GFXBOARD_HARDWARE) {
			return gfxboard_toggle (mode);
		} else {
			// can always switch from RTG to custom
			if (SAEV_Playfield_picasso_requested_on && SAEV_Playfield_picasso_on) {
				SAEV_Playfield_picasso_requested_on = false;
				return true;
			}
			if (SAEV_Playfield_picasso_on)
				return false;
			// can only switch from custom to RTG if there is some mode active
			if (picasso_is_active()) {
				SAEV_Playfield_picasso_requested_on = true;
				return true;
			}
		}
		return false;
	}*/

	/*function toggle_fullscreen(mode) {
		var v = SAEV_config.video.apmode[SAEV_Playfield_picasso_on ? 1 : 0].gfx_fullscreen;
		var wfw = SAEV_Playfield_picasso_on ? wasfullwindow_p : wasfullwindow_a;

		if (mode < 0) {
			// fullscreen <> window (if in fullwindow: fullwindow <> fullscreen)
			if (v == SAEC_Config_Video_AP_Fullscreen_FULLWINDOW)
				v = SAEC_Config_Video_AP_Fullscreen_FULLSCREEN;
			else if (v == SAEC_Config_Video_AP_Fullscreen_WINDOW)
				v = SAEC_Config_Video_AP_Fullscreen_FULLSCREEN;
			else if (v == SAEC_Config_Video_AP_Fullscreen_FULLSCREEN)
				if (wfw > 0)
					v = SAEC_Config_Video_AP_Fullscreen_FULLWINDOW;
				else
					v = SAEC_Config_Video_AP_Fullscreen_WINDOW;
		} else if (mode == 0) {
			// fullscreen <> window
			if (v == SAEC_Config_Video_AP_Fullscreen_FULLSCREEN)
				v = SAEC_Config_Video_AP_Fullscreen_WINDOW;
			else
				v = SAEC_Config_Video_AP_Fullscreen_FULLSCREEN;
		} else if (mode == 1) {
			// fullscreen <> fullwindow
			if (v == SAEC_Config_Video_AP_Fullscreen_FULLSCREEN)
				v = SAEC_Config_Video_AP_Fullscreen_FULLWINDOW;
			else
				v = SAEC_Config_Video_AP_Fullscreen_FULLSCREEN;
		} else if (mode == 2) {
			// window <> fullwindow
			if (v == SAEC_Config_Video_AP_Fullscreen_FULLWINDOW)
				v = SAEC_Config_Video_AP_Fullscreen_WINDOW;
			else
				v = SAEC_Config_Video_AP_Fullscreen_FULLWINDOW;
		}
		SAEV_config.video.apmode[SAEV_Playfield_picasso_on ? 1 : 0].gfx_fullscreen = v;
		updatewinfsmode(SAEV_config);
	}
	this.toggle_fullscreen_real = function(mode) {
		close_windows();
		toggle_fullscreen(mode);
		open_windows();
	}*/

	/*HDC gethdc (void) {
		HDC hdc = 0;

		frame_missed = frame_counted = frame_errors = 0;
		frame_usage = frame_usage_avg = frame_usage_total = 0;

		if (OGL_isenabled ())
			return OGL_getDC (0);
		if (D3D_isenabled ())
			return D3D_getDC (0);
		if (FAILED(DirectDraw_GetDC(&hdc)))
			hdc = 0;
		return hdc;
	}

	void releasehdc (HDC hdc) {
		if (OGL_isenabled ()) {
			OGL_getDC (hdc);
			return;
		}
		if (D3D_isenabled ()) {
			D3D_getDC (hdc);
			return;
		}
		DirectDraw_ReleaseDC(hdc);
	}*/

	this.hideCursor = function(hide) {
		if (hAmigaWnd !== null && hAmigaWnd.shown)
			hAmigaWnd.canvas.style.cursor = hide ? "none" : "auto";
	}

	this.screen = function(screen) {
		if (SAEC_info.video.requestFullScreen && hAmigaWnd !== null) {
			if (screen && !hAmigaWnd.fullscreen) {
				if (document.myFullscreenEnabled)
					hAmigaWnd.canvas.myRequestFullscreen();
			}
			else if (!screen && hAmigaWnd.fullscreen) {
				document.myExitFullscreen();
			}
		}
	}

	/*-----------------------------------------------------------------------*/

	//var flushymin = 0, flushymax = 0;
	//const FLUSH_DIFF = 50;

	/*function flushit(vb, lineno) {
		if (SAEV_config.video.api == SAEC_Config_Video_API_Canvas)
			return;
		if (currentmode.flags & DM_SWSCALE)
			return;
		if (flushymin > lineno) {
			if (flushymin - lineno > FLUSH_DIFF && flushymax != 0) {
				D3D_flushtexture(flushymin, flushymax);
				flushymin = currentmode.amiga_height;
				flushymax = 0;
			} else {
				flushymin = lineno;
			}
		}
		if (flushymax < lineno) {
			if (lineno - flushymax > FLUSH_DIFF && flushymax != 0) {
				D3D_flushtexture(flushymin, flushymax);
				flushymin = currentmode.amiga_height;
				flushymax = 0;
			} else {
				flushymax = lineno;
			}
		}
	}*/

	this.flush_line = function(vb, lineno) {
		//SAEF_log("video.flush_line() %d", lineno);
		//flushit(vb, lineno);
	}
	this.flush_block = function(vb, first, last) {
		//SAEF_log("video.flush_block() %d - %d", first, last);
		//flushit(vb, first);
		//flushit(vb, last);
	}
	this.flush_screen = function(vb, a, b) {
		//SAEF_log("video.flush_screen() %d - %d",  a, b);
	}

	var render_ok = false; //, wait_render = false; //volatile global

	this.render_screen = function(immediate) {
		if (!SAEV_config.video.enabled) {
			render_ok = true;
			return render_ok;
		}
		//SAEF_log("video.render_screen() immediate %d", immediate ? 1 : 0);
		render_ok = false;
		//if (minimized || SAEV_Playfield_picasso_on || monitor_off || dx_islost())
		//if (SAEV_Playfield_picasso_on || dx_islost()) return render_ok;

		/*var cnt = 0;
		while (wait_render) {
			sleep_millis(1);
			cnt++;
			if (cnt > 500)
				return render_ok;
		}*/
		//flushymin = 0;
		//flushymax = currentmode.amiga_height;

		//EnterCriticalSection(&screen_cs);

		if (currentmode.flags & DM_WEBGL) {
			var ctx = hAmigaWnd.ctx;
			var tex = hAmigaWnd.texture;
			var x1 = 0;
			var x2 = tex.width;
			var y1 = 0;
			var y2 = tex.height;

			if (SAER_Playfield_gfxvidinfo.drawbuffer.pixbytes == 2)
				ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGB, tex.width, tex.height, 0, ctx.RGB, ctx.UNSIGNED_SHORT_5_6_5, new Uint16Array(tex.data));
			else
				ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, tex.width, tex.height, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array(tex.data));

			ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([x1,y1, x2,y1, x1,y2,  x1,y2, x2,y1, x2,y2]), ctx.STATIC_DRAW);
			ctx.drawArrays(ctx.TRIANGLES, 0, 6);
			render_ok = true;
		}
		else if (currentmode.flags & DM_CANVAS) {
			var sur = hAmigaWnd.surface;

			sur.imageData.data.set(new Uint8ClampedArray(sur.data));
			hAmigaWnd.ctx.putImageData(sur.imageData, 0, 0);
			render_ok = true;
		}
		/*
		else if (currentmode.flags & DM_D3D) {
			render_ok = D3D_renderframe(immediate);
		}
		else if (currentmode.flags & DM_DDRAW) {
			render_ok = true;
		}
		else if (currentmode.flags & DM_SWSCALE) {
			S2X_render();
			render_ok = true;
		}*/
		//LeaveCriticalSection(&screen_cs);
		return render_ok;
	}

	/*static void waitflipevent (void) {
		while (flipevent_mode) {
			if (WaitForSingleObject (flipevent2, 10) == WAIT_ABANDONED)
				break;
		}
	}
	static void doflipevent (int mode) {
		if (flipevent == NULL)
			return;
		waitflipevent ();
		flipevent_mode = mode;
		SetEvent (flipevent);
	}*/


	/*void show_screen_special (void) {
		EnterCriticalSection (&screen_cs);
		if (currentmode.flags & DM_D3D)
			D3D_showframe_special (1);
		LeaveCriticalSection (&screen_cs);
	}*/

	this.show_screen = function(mode) {
		if (!SAEV_config.video.enabled) {
			render_ok = false;
			return;
		}
		/*EnterCriticalSection(&screen_cs);
		if (mode == 2) {
			if (currentmode.flags & DM_D3D) {
				D3D_showframe_special(1);
			}
			LeaveCriticalSection(&screen_cs);
			return;
		}
		if (!render_ok) {
			LeaveCriticalSection(&screen_cs);
			return;
		}
		if (currentmode.flags & DM_D3D) {
			D3D_showframe();
		}
		else if (currentmode.flags & DM_SWSCALE) {
			if (!dx_islost() && !SAEV_Playfield_picasso_on) {
				DirectDraw_Flip(1);
			}
		}
		else if (currentmode.flags & DM_DDRAW) {
			if (!dx_islost() && !SAEV_Playfield_picasso_on)
				DirectDraw_Flip(1);
		}
		LeaveCriticalSection(&screen_cs);*/
		render_ok = false;
	}

	this.show_screen_maybe = function(show) {
		var ap = SAEV_config.video.apmode[SAEV_Playfield_picasso_on ? 1 : 0];
		if (!ap.gfx_vflip || ap.gfx_vsyncmode == 0 || !ap.gfx_vsync) {
			if (show) {
				this.show_screen(0);
				return true; //OWN
			}
			return false;
		}
		/*#if 0
		if (ap.gfx_vflip < 0) {
			doflipevent();
			return true;
		}
		#endif*/
		return false;
	}

	this.lockscr = function(vb, fullupdate) {
		var ret = false;

		if (!SAEV_config.video.enabled || !isscreen())
			return ret;

		//flushymin = currentmode.amiga_height;
		//flushymax = 0;

		if (currentmode.flags & DM_WEBGL) {
			vb.bufmem = hAmigaWnd.texture.data;
			vb.bufmem_pos = 0;
			vb.rowbytes = hAmigaWnd.texture.rowbytes;
			SAER_Playfield_init_row_map();
			ret = vb.bufmem !== null;
		}
		else if (currentmode.flags & DM_CANVAS) {
			vb = SAER_Playfield_gfxvidinfo.outbuffer;
			vb.bufmem = hAmigaWnd.surface.data;
			vb.bufmem_pos = 0;
			vb.rowbytes = hAmigaWnd.surface.rowbytes;
			SAER_Playfield_init_row_map();
			ret = vb.bufmem !== null;
		}
		/*else if (currentmode.flags & DM_D3D) {
			if (currentmode.flags & DM_SWSCALE) {
				ret = true;
			} else {
				ret = false;
				vb.bufmem = D3D_locktexture (&vb.rowbytes, NULL, fullupdate);
				if (vb.bufmem) {
					init_row_map();
					ret = true;
				}
			}
		}
		else if (currentmode.flags & DM_DDRAW) {
			if (!DirectDraw_SurfaceLock()) {
				dx_check();
				return false;
			}

			vb = SAER_Playfield_gfxvidinfo.outbuffer;
			vb.bufmem = DirectDraw_GetSurfacePointer();
			vb.bufmem_pos = 0;
			vb.rowbytes = DirectDraw_GetSurfacePitch();
			SAER_Playfield_init_row_map();
			//clear_inhibit_frame(IHF_WINDOWHIDDEN);
			ret = vb.bufmem !== null;
		}
		else if (currentmode.flags & DM_SWSCALE)
			ret = true;*/

		return ret;
	}

	this.unlockscr = function(vb) {
		if (!SAEV_config.video.enabled)
			return;

		if (currentmode.flags & DM_WEBGL) {
			vb.bufmem = null;
		}
		else if (currentmode.flags & DM_CANVAS) {
			vb.bufmem = null;
		}
		/*else if (currentmode.flags & DM_D3D) {
			if (currentmode.flags & DM_SWSCALE) {
				S2X_render();
			} else {
				D3D_flushtexture(flushymin, flushymax);
				vb.bufmem = null;
			}
			D3D_unlocktexture ();
		}
		else if (currentmode.flags & DM_DDRAW) {
			DirectDraw_SurfaceUnlock();
			//vb.bufmem = null;
		}
		else if (currentmode.flags & DM_SWSCALE)
			return;*/
	}

	/*bool lockscr3d(struct vidbuffer *vb) {
		if (currentmode.flags & DM_D3D) {
			if (!(currentmode.flags & DM_SWSCALE)) {
				vb.bufmem = D3D_locktexture(&vb.rowbytes, NULL, false);
				if (vb.bufmem)
					return true;
			}
		}
		return false;
	}
	void unlockscr3d(struct vidbuffer *vb) {
		if (currentmode.flags & DM_D3D) {
			if (!(currentmode.flags & DM_SWSCALE)) {
				D3D_unlocktexture();
			}
		}
	}*/

	/*this.flush_clear_screen = function(vb) {
		if (vb === null)
			return;
		if (this.lockscr(vb, true)) {
			for (var y = 0; y < vb.height_allocated; y++)
				memset(vb.bufmem + y * vb.rowbytes, 0, vb.width_allocated * vb.pixbytes);

			this.unlockscr(vb);
			this.flush_screen(vb, 0, 0);
		}
	}*/
}

/*-----------------------------------------------------------------------*/
/* global constants */

const SAEC_GUI_LED_POWER = 0;
const SAEC_GUI_LED_DF0 = 1;
const SAEC_GUI_LED_DF1 = 2;
const SAEC_GUI_LED_DF2 = 3;
const SAEC_GUI_LED_DF3 = 4;
const SAEC_GUI_LED_HD = 5;
//const SAEC_GUI_LED_CD = 6;
const SAEC_GUI_LED_FPS = 7;
const SAEC_GUI_LED_CPU = 8;
//const SAEC_GUI_LED_SND = 9;
//const SAEC_GUI_LED_MD = 10;
const SAEC_GUI_LED_MAX = 11;
//const SAEC_GUI_VISIBLE_LEDS = SAEC_GUI_LED_MAX - 1; //statusline.cpp

/*const SAEC_GUI_LED_CD_ACTIVE = 1;
const SAEC_GUI_LED_CD_ACTIVE2 = 2;
const SAEC_GUI_LED_CD_AUDIO = 4;*/

/*---------------------------------*/

function SAEO_GUI() {
	function gui_info() {
		this.drive_side = 0; /* s8, floppy side */
		this.drive_motor = [false,false,false,false]; /* motor on off */
		this.drive_track = [0,0,0,0]; /* u8, rw-head track */
		this.drive_writing = [false,false,false,false]; /* drive is writing */
		this.drive_disabled = [false,false,false,false]; /* drive is disabled */
		this.df = ["","","",""]; /* inserted image */
		this.crc32 = [0,0,0,0]; /* u32, crc32 of image */

		this.powerled = false; /* state of power led */
		this.powerled_brightness = 0; /* u8, 0 to 255 */
		this.hd = 0; /* s8, harddrive */
		this.cd = 0; /* s8, CD */
		this.md = 0; /* s8, CD32 or CDTV internal storage */

		this.cpu_halted = 0;

		this.fps = 0;
		this.fps_color = 0;
		this.idle = 0;

		this.sndbuf = 0;
		this.sndbuf_status = 0;
	}
	this.data = null; //gui_data
	//this.data = new gui_info(); //gui_data

	var resetcounter = null;
	//var resetcounter = new Array(SAEC_GUI_LED_MAX);

	/*---------------------------------*/

	this.setup = function() { //gui_init()
		this.data = new gui_info();
		this.data.cd = -1;
		this.data.hd = -1;
		this.data.md = -1; //(currprefs.cs_cd32nvram || currprefs.cs_cdtvram) ? 0 : -1;

		resetcounter = new Array(SAEC_GUI_LED_MAX);
		SAEF_memset(resetcounter,0, 0, SAEC_GUI_LED_MAX);
		return SAEE_None; //1
	}
	//this.cleanup = function() {} //gui_exit()
	//this.update = function() { return true; } //gui_update()
	//this.lock = function() {} //gui_lock()
	//this.unlock = function() {} //gui_unlock()
	//this.filename = function(num, name) {} //gui_filename()
	/*this.gui_disk_image_change = function(unitnum, name, writeprotected) {
		#ifdef RETROPLATFORM
		rp_disk_image_change(unitnum, name, writeprotected);
		#endif
	}*/

	this.flicker_led2 = function(led, unitnum, status) {
		if (led == SAEC_GUI_LED_HD)
			var old = this.data.hd;
		/*else if (led == SAEC_GUI_LED_CD)
			var old = this.data.cd;
		else if (led == SAEC_GUI_LED_MD)
			var old = this.data.md;*/
		else
			return;

		if (status < 0) {
			if (old < 0)
				this.led(led, -1, -1);
			else
				this.led(led, 0, -1);
			return;
		}
		if (status == 0 && old < 0) {
			if (led == SAEC_GUI_LED_HD)
				this.data.hd = 0;
			/*else if (led == SAEC_GUI_LED_CD)
				this.data.cd = 0;
			else if (led == SAEC_GUI_LED_MD)
				this.data.md = 0;*/

			resetcounter[led] = 0;
			this.led(led, 0, -1);
			return;
		}
		if (status == 0) {
			resetcounter[led]--;
			if (resetcounter[led] > 0)
				return;
		}
		/*#ifdef RETROPLATFORM
		if (unitnum >= 0) {
			if (led == SAEC_GUI_LED_HD)
				rp_hd_activity (unitnum, status ? 1 : 0, status == 2 ? 1 : 0);
			else if (led == SAEC_GUI_LED_CD)
				rp_cd_activity (unitnum, status);
		}
		#endif*/

		if (led == SAEC_GUI_LED_HD)
			this.data.hd = status;
		/*else if (led == SAEC_GUI_LED_CD)
			this.data.cd = status;
		else if (led == SAEC_GUI_LED_MD)
			this.data.md = status;*/

		resetcounter[led] = 6;
		if (old != status)
			this.led(led, status, -1);
	}

	this.flicker_led = function(led, unitnum, status) { //gui_flicker_led()
		if (led < 0) {
			this.flicker_led2(SAEC_GUI_LED_HD, 0, 0);
			//this.flicker_led2(SAEC_GUI_LED_CD, 0, 0);
			//if (this.data.md >= 0) this.flicker_led2(SAEC_GUI_LED_MD, 0, 0);
		} else
			this.flicker_led2(led, unitnum, status);
	}

	this.fps = function(fps, idle, color) { //gui_fps()
		this.data.fps = fps;
		this.data.idle = idle;
		this.data.fps_color = color;
		this.led(SAEC_GUI_LED_FPS, 0, -1);
		this.led(SAEC_GUI_LED_CPU, 0, -1);
		//this.led(SAEC_GUI_LED_SND, (this.data.sndbuf_status > 1 || this.data.sndbuf_status < 0) ? 0 : 1, -1);
	}

	this.led = function(led, on, brightness) { //gui_led()
		var writing = 0;

		/*indicator_leds(led, on);

		#ifdef LOGITECHLCD
		lcd_update (led, on);
		#endif

		#ifdef RETROPLATFORM
		if (led >= SAEC_GUI_LED_DF0 && led <= SAEC_GUI_LED_DF3 && !this.data.drive_disabled[led - SAEC_GUI_LED_DF0]) {
			rp_floppy_track(led - SAEC_GUI_LED_DF0, this.data.drive_track[led - SAEC_GUI_LED_DF0]);
			writing = this.data.drive_writing[led - SAEC_GUI_LED_DF0];
		}
		rp_update_leds(led, on, brightness, writing);
		#endif*/

		//if (!hStatusWnd) return;

		if (led >= SAEC_GUI_LED_DF0 && led <= SAEC_GUI_LED_DF3) {
			if (this.data.drive_writing[led - 1])
				writing = 1;

			SAEV_config.hook.led.df(led - 1, this.data.drive_disabled[led - 1], this.data.drive_track[led - 1], this.data.drive_side, on ? (writing ? 2 : 1) : 0);
		}
		else if (led == SAEC_GUI_LED_POWER) {
			SAEV_config.hook.led.power(on);
		}
		else if (led == SAEC_GUI_LED_HD) {
			if (on > 1)
				writing = 1;

			SAEV_config.hook.led.hd(on ? (writing ? 2 : 1) : 0);
		}
		/*else if (led == SAEC_GUI_LED_CD) {
		}*/
		else if (led == SAEC_GUI_LED_FPS) {
			on = 1;
			on = SAER.paused ? 0 : 1;
			SAEV_config.hook.led.fps(this.data.fps, SAER.paused);
		}
		else if (led == SAEC_GUI_LED_CPU) {
			on = SAER.paused ? 0 : 1;
			SAEV_config.hook.led.cpu(this.data.idle, SAER.paused);
		}
		/*else if (led == SAEC_GUI_LED_SND && this.data.drive_disabled[3]) {
		}
		else if (led == SAEC_GUI_LED_MD) {
		}*/

		if (on < 0)
			return;

		//output
	}

	//const LED_STRING_WIDTH = 40;
	//var drive_text = new Array(SAEC_GUI_LED_MAX);
	//for (vi = 0; vi < SAEC_GUI_LED_MAX; vi++) drive_text[vi] = "";

	this.led_string = function(led, on, brightness) { //gui_led()
		//static TCHAR drive_text[SAEC_GUI_LED_MAX * LED_STRING_WIDTH];
		//static TCHAR dfx[4][300];
		//var ptr = null, tt = null, p = null; //TCHAR *
		var pos = -1;
		var writing = 0, playing = 0, active2 = 0;
		var center = 0;

		/*indicator_leds(led, on);

		#ifdef LOGITECHLCD
		lcd_update (led, on);
		#endif

		#ifdef RETROPLATFORM
		if (led >= SAEC_GUI_LED_DF0 && led <= SAEC_GUI_LED_DF3 && !this.data.drive_disabled[led - SAEC_GUI_LED_DF0]) {
			rp_floppy_track (led - SAEC_GUI_LED_DF0, this.data.drive_track[led - SAEC_GUI_LED_DF0]);
			writing = this.data.drive_writing[led - SAEC_GUI_LED_DF0];
		}
		rp_update_leds (led, on, brightness, writing);
		#endif*/

		//if (!hStatusWnd) return;

		//tt = null;
		if (led >= SAEC_GUI_LED_DF0 && led <= SAEC_GUI_LED_DF3) {
			pos = 6 + (led - SAEC_GUI_LED_DF0);
			//ptr = drive_text + pos * LED_STRING_WIDTH;
			if (this.data.drive_disabled[led - 1])
				drive_text[pos] = "";
			else
				drive_text[pos] = sprintf("%02d", this.data.drive_track[led - 1]);

			/*p = this.data.df[led - 1];
			var j = _tcslen (p) - 1;
			if (j < 0)
				j = 0;
			while (j > 0) {
				if (p[j - 1] == '\\' || p[j - 1] == '/')
					break;
				j--;
			}
			tt = dfx[led - 1];
			tt[0] = 0;
			if (_tcslen (p + j) > 0)
				_stprintf (tt, _T("%s [CRC=%08X]"), p + j, this.data.crc32[led - 1]);*/

			center = 1;
			if (this.data.drive_writing[led - 1])
				writing = 1;

			SAEV_config.hook.led.df(led - 1, this.data.drive_disabled[led - 1], this.data.drive_track[led - 1], this.data.drive_side, on ? (writing ? 2 : 1) : 0);
		}
		else if (led == SAEC_GUI_LED_POWER) {
			pos = 3;
			//ptr = _tcscpy(drive_text + pos * LED_STRING_WIDTH, _T("Power"));
			drive_text[pos] = "Power";
			center = 1;

			SAEV_config.hook.led.power(on);
		}
		else if (led == SAEC_GUI_LED_HD) {
			pos = 4;
			//ptr = _tcscpy(drive_text + pos * LED_STRING_WIDTH, _T("HD"));
			drive_text[pos] = "HD";
			center = 1;
			if (on > 1)
				writing = 1;

			SAEV_config.hook.led.hd(on ? (writing ? 2 : 1) : 0);
		}
		/*else if (led == SAEC_GUI_LED_CD) {
			pos = 5;
			//ptr = _tcscpy(drive_text + pos * LED_STRING_WIDTH, _T("CD"));
			drive_text[pos] = "CD";
			center = 1;
			if (on >= 0) {
				if (on & SAEC_GUI_LED_CD_AUDIO)
					playing = 1;
				else if (on & SAEC_GUI_LED_CD_ACTIVE2)
					active2 = 1;
				on &= 1;
			}
		}*/
		else if (led == SAEC_GUI_LED_FPS) {
			//double fps = (double)this.data.fps / 10.0;
			var fps = this.data.fps;
			pos = 2;
			//ptr = drive_text + pos * LED_STRING_WIDTH;
			//if (fps > 999.9) fps = 999.9;
			/*if (SAEV_Playfield_picasso_on)
				drive_text[pos] = sprintf("%.1f [%.1f]", p96vblank, fps);
			else*/
				drive_text[pos] = sprintf("FPS: %.1f", fps);

			if (this.data.cpu_halted > 0) {
				drive_text[pos] = sprintf("HALT%d", this.data.cpu_halted);
				center = 1;
			}
			if (SAER.paused) {
				drive_text[pos] = "PAUSED";
				center = 1;
			}
			on = 1;

			SAEV_config.hook.led.fps(this.data.fps, SAER.paused);
		}
		else if (led == SAEC_GUI_LED_CPU) {
			var m68klabelchange = false;
			var m68label = "CPU";

			pos = 1;
			//ptr = drive_text + pos * LED_STRING_WIDTH;
			//ptr[0] = 0;
			drive_text[pos] = "";

			//p = ptr;
			/*if (is_ppc_cpu(&currprefs)) {
				_tcscat(ptr, _T("PPC: "));
				if (ppc_state == PPC_STATE_ACTIVE)
					_tcscat(ptr, _T("RUN"));
				else if (ppc_state == PPC_STATE_CRASH)
					_tcscat(ptr, _T("CRASH"));
				else if (ppc_state == PPC_STATE_SLEEP)
					_tcscat(ptr, _T("SLEEP"));
				else
					_tcscat(ptr, _T("STOP"));
				_tcscat(ptr, _T(" "));
				p = ptr + _tcslen(ptr);
				m68label = _T("68k");
				m68klabelchange = true;
			}
			int state = is_x86_cpu(&currprefs);
			if (state > 0) {
				_tcscat(ptr, _T("x86: "));
				if (state == X86_STATE_ACTIVE)
					_tcscat(ptr, _T("RUN"));
				else
					_tcscat(ptr, _T("STOP"));
				_tcscat(ptr, _T(" "));
				p = ptr + _tcslen(ptr);
				m68label = _T("68k");
				m68klabelchange = true;
			}*/
			if (this.data.cpu_halted < 0) {
				if (!m68klabelchange)
					drive_text[pos] = "STOP";
				else
					drive_text[pos] = "68k: STOP";
			} else {
				//drive_text[pos] = sprintf("%s: %.0f%%", m68label, (double)((this.data.idle) / 10.0));
				drive_text[pos] = sprintf("%s: %.0f%%", m68label, this.data.idle);
			}
			on = SAER.paused ? 0 : 1;

			SAEV_config.hook.led.cpu(this.data.idle, SAER.paused);
		}
		/*else if (led == SAEC_GUI_LED_SND && this.data.drive_disabled[3]) {
			pos = 0;
			ptr = drive_text + pos * LED_STRING_WIDTH;
			if (this.data.sndbuf_status < 3 && !SAER.paused && !sound_paused()) {
				_stprintf (ptr, _T("SND: %+.0f%%"), (double)((this.data.sndbuf) / 10.0));
			} else {
				_tcscpy (ptr, _T("SND: -"));
				center = 1;
				on = 0;
			}
		}
		else if (led == SAEC_GUI_LED_MD) {
			pos = 6 + 3;
			ptr = _tcscpy(drive_text + pos * LED_STRING_WIDTH, _T("NV"));
		}*/

		if (on < 0)
			return;

		//SAEF_log("%d %s %d", pos, drive_text[pos], on);

		/*var type = SBT_OWNERDRAW;
		if (pos >= 0) {
			ptr[_tcslen (ptr) + 1] = 0;
			if (center)
				ptr[_tcslen (ptr) + 1] |= 1;
			if (on) {
				ptr[_tcslen (ptr) + 1] |= 2;
				type |= SBT_POPOUT;
			}
			if (writing)
				ptr[_tcslen (ptr) + 1] |= 4;
			if (playing)
				ptr[_tcslen (ptr) + 1] |= 8;
			if (active2)
				ptr[_tcslen (ptr) + 1] |= 16;
			pos += window_led_joy_start;
			PostMessage (hStatusWnd, SB_SETTEXT, (WPARAM)((pos + 1) | type), (LPARAM)ptr);
			if (tt !== null)
				PostMessage (hStatusWnd, SB_SETTIPTEXT, (WPARAM)(pos + 1), (LPARAM)tt);
		}*/
	}

	//void gui_handle_events (void);
	//void gui_display (int shortcut);
}
