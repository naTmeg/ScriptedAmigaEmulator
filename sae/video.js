/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/

function Vide0() {
	const vertexShader = 
		'attribute vec2 a_position;'+
		'attribute vec2 a_texCoord;'+
		'uniform vec2 u_resolution;'+
		'varying vec2 v_texCoord;'+
		'void main() {'+
			'vec2 zeroToOne = a_position / u_resolution;'+
			'vec2 zeroToTwo = zeroToOne * 2.0;'+
			'vec2 clipSpace = zeroToTwo - 1.0;'+
			'gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);'+
			'v_texCoord = a_texCoord;'+
		'}';
	const fragmentShader = 
		'precision mediump float;'+
		'uniform sampler2D u_image;'+
		'varying vec2 v_texCoord;'+
		'void main() {'+
			'gl_FragColor = texture2D(u_image, v_texCoord);'+
		'}';	
	const glParams = {
		alpha: false,
		stencil: false,
		antialias: false
	};
	
	var width = 0;
	var height = 0;
	var size = 0;
	var pixels = null;

	var div = null;
	var canvas = null;
	var gl = null;
	var video = null;
	var open = false;
	
	/*---------------------------------*/

	function getShader(gl, id) {
		var shader, source;

		if (id == 'vertex') {
			shader = gl.createShader(gl.VERTEX_SHADER);
			source = vertexShader;
		} else if (id == 'fragment') {
			shader = gl.createShader(gl.FRAGMENT_SHADER);
			source = fragmentShader;
		}
		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
			Fatal(SAEE_Video_Shader_Error, gl.getShaderInfoLog(shader));

		return shader;
	}

	function initGL() {
		var vertexShader = getShader(gl, 'vertex');
		var fragmentShader = getShader(gl, 'fragment');
		var program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			Fatal(SAEE_Video_Shader_Error, 'Can\'t initialise the shaders for WebGL.');

		gl.useProgram(program);

		var positionLocation = gl.getAttribLocation(program, "a_position");
		var texCoordLocation = gl.getAttribLocation(program, "a_texCoord");

		var texCoordBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
			0.0, 0.0,
			1.0, 0.0,
			0.0, 1.0,
			0.0, 1.0,
			1.0, 0.0,
			1.0, 1.0]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(texCoordLocation);
		gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

		var texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

		var resolutionLocation = gl.getUniformLocation(program, "u_resolution");
		gl.uniform2f(resolutionLocation, width, height);

		var buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.enableVertexAttribArray(positionLocation);
		gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

		gl.viewport(0, 0, width, height);
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.colorMask(true, true, true, false);
	}
	
	this.setup = function() {
		if (!AMIGA.config.video.enabled) return;
		if (open) this.cleanup();

		width = AMIGA.config.video.scale ? VIDEO_WIDTH << 1 : VIDEO_WIDTH;
		height = AMIGA.config.video.scale ? VIDEO_HEIGHT << 1 : VIDEO_WIDTH;
		size = width * height;
		//BUG.info('Video.init() %d x %d, %s mode', width, height, AMIGA.config.video.ntsc ? 'ntsc' : 'pal');

		div = document.getElementById(AMIGA.config.video.id);
		if (!div)
			Fatal(SAEE_Video_ID_Not_Found, 'Video DIV-element not found. Check your code. (Malformed-DIV-name: '+AMIGA.config.video.id+')');

		if ((canvas = document.createElement('canvas'))) {
			canvas.width = width;
			canvas.height = height;
		} else {
			if (confirm('Can\'t create a CANVAS-element. Continue without video-playback?'))
				AMIGA.config.video.enabled = false;
			else
				Fatal(SAEE_Video_Canvas_Not_Supported, 'Can\'t create a CANVAS-element. Please update the browser.');
		}
		if (AMIGA.config.video.enabled) {
			if ((gl = canvas.getContext('experimental-webgl', glParams) || canvas.getContext('webgl', glParams)))
				initGL();
			else
				if (confirm('Can\'t initialise WebGL. Continue without video-playback?'))
					AMIGA.config.video.enabled = false;
				else
					Fatal(SAEE_Video_WebGL_Not_Avail, 'Can\'t initialise WebGL. Is WebGL enabled in the browser-config?');
		}
		if (AMIGA.config.video.enabled) {
			pixels = new Uint16Array(size);
			for (var i = 0; i < size; i++) pixels[i] = 0;
		}
		if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Mouse) {
			canvas.onmousedown = function(e) { AMIGA.input.mouse.mousedown(e); }
			canvas.onmouseup = function(e) { AMIGA.input.mouse.mouseup(e); }
			canvas.onmouseover = function(e) { AMIGA.input.mouse.mouseover(e); }
			canvas.onmouseout = function(e) { AMIGA.input.mouse.mouseout(e); }
			canvas.onmousemove = function(e) { AMIGA.input.mouse.mousemove(e); }
		}
		canvas.oncontextmenu = function() { return false; }
		
		video = document.createElement('div');
		video.style.width = width + 'px';
		video.style.height = height + 'px';
		video.style.margin = 'auto';
		video.style.webkitTouchCallout = 'none';
		video.style.webkitUserSelect = 'none';
		video.style.khtmlUserSelect = 'none';
		video.style.mozUserSelect = 'none';
		video.style.msUserSelect = 'none';
		video.style.userSelect = 'none';
		video.appendChild(canvas);
		div.appendChild(video);
		open = true;
	}

	this.cleanup = function() {
		if (open) {
			div.removeChild(video);
			canvas = null;
			pixels = null;
			video = null;
			open = false;
		}
	}
	
	/*---------------------------------*/

	this.hideCursor = function(hide) {
		canvas.style.cursor = hide ?  'none' : 'auto';
	}
	
	this.clear_pixels = function () {
		for (var i = 0; i < size; i++) 
			pixels[i] = 0;
	}

	this.drawpixel = function (x, y, rgb) {
		pixels[y * width + x] = rgb;
	}
	this.draw2pixel = function (x, y, rgb) {
		var ptr = y * width + x;
		pixels[ptr] = pixels[ptr + 1] = rgb;
	}

	this.drawline = function (y, rgb) {
		var ptr = y * width;

		for (var i = 0; i < width; i++)
			pixels[ptr++] = rgb;
	}
	this.drawline_from_to = function (x1, x2, y, rgb) {
		var ptr = y * width + x1;

		for (var i = 0; i < x2 - x1; i++)
			pixels[ptr++] = rgb;
	}

	this.draw = function (rgb, scalex, scaley, colorOnly) {
		var r = 0.0625 * (((rgb >> 11) & 31) >> 1);
		var g = 0.0625 * (((rgb >> 5) & 63) >> 2);
		var b = 0.0625 * ((rgb & 31) >> 1);

		gl.viewport(0, 0, width, height);
		gl.clearColor(r, g, b, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);

		if (!colorOnly) {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, width, height, 0, gl.RGB, gl.UNSIGNED_SHORT_5_6_5, pixels);

			var s = AMIGA.config.video.scale ? 1 : 0;
			var x1 = 0;
			//var x2 = 0 + (width << (scalex ? (s+1) : s));
			var x2 = 0 + (width << s);
			var y1 = 0;
			var y2 = 0 + (height << (scaley ? (s+1) : s));
			//var y2 = 0 + (height << s);

			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
			x1, y1, x2, y1, x1, y2,
			x1, y2, x2, y1, x2, y2]), gl.STATIC_DRAW);

			gl.drawArrays(gl.TRIANGLES, 0, 6);
		}
	}
}
