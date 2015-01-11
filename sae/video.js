/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
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
	
	this.available = 0;
	
	var width = 0;
	var height = 0;
	var size = 0;
	var scale = false;
	var pixels = null;

	var div = null;
	var canvas = null;
	var ctx = null;
	var imagedata = null;
	var video = null;
	var open = false;
	
	/*---------------------------------*/

	//this.init = function()
	{
		var test = document.createElement('canvas');
		if (test && test.getContext) {
			var test2 = test.getContext('2d'); 
			if (test2) { 
 				this.available |= SAEI_Video_Canvas2D;
				test2 = null; 
			}
		}
		test = document.createElement('canvas');
		if (test && test.getContext) {
			test2 = test.getContext('experimental-webgl', glParams) || test.getContext('webgl', glParams);
			if (test2) {
	 			this.available |= SAEI_Video_WebGL;
				test2 = null; 
			}
			test = null; 
		}
 		//console.log(this.available);		
	}		
	
	/*---------------------------------*/

	function getShader(ctx, id) {
		var shader, source;

		if (id == 'vertex') {
			shader = ctx.createShader(ctx.VERTEX_SHADER);
			source = vertexShader;
		} else if (id == 'fragment') {
			shader = ctx.createShader(ctx.FRAGMENT_SHADER);
			source = fragmentShader;
		}
		ctx.shaderSource(shader, source);
		ctx.compileShader(shader);

		if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS))
			Fatal(SAEE_Video_Shader_Error, ctx.getShaderInfoLog(shader));

		return shader;
	}

	function initGL() {
		var vertexShader = getShader(ctx, 'vertex');
		var fragmentShader = getShader(ctx, 'fragment');
		var program = ctx.createProgram();
		ctx.attachShader(program, vertexShader);
		ctx.attachShader(program, fragmentShader);
		ctx.linkProgram(program);
		if (!ctx.getProgramParameter(program, ctx.LINK_STATUS))
			Fatal(SAEE_Video_Shader_Error, 'Can\'t initialise the shaders for WebGL.');

		ctx.useProgram(program);

		var positionLocation = ctx.getAttribLocation(program, "a_position");
		var texCoordLocation = ctx.getAttribLocation(program, "a_texCoord");

		var texCoordBuffer = ctx.createBuffer();
		ctx.bindBuffer(ctx.ARRAY_BUFFER, texCoordBuffer);
		ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([
			0.0, 0.0,
			1.0, 0.0,
			0.0, 1.0,
			0.0, 1.0,
			1.0, 0.0,
			1.0, 1.0]), ctx.STATIC_DRAW);
		ctx.enableVertexAttribArray(texCoordLocation);
		ctx.vertexAttribPointer(texCoordLocation, 2, ctx.FLOAT, false, 0, 0);

		var texture = ctx.createTexture();
		ctx.bindTexture(ctx.TEXTURE_2D, texture);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.NEAREST);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.NEAREST);

		var resolutionLocation = ctx.getUniformLocation(program, "u_resolution");
		ctx.uniform2f(resolutionLocation, width, height);

		var buffer = ctx.createBuffer();
		ctx.bindBuffer(ctx.ARRAY_BUFFER, buffer);
		ctx.enableVertexAttribArray(positionLocation);
		ctx.vertexAttribPointer(positionLocation, 2, ctx.FLOAT, false, 0, 0);

		ctx.viewport(0, 0, width, height);
		ctx.clearColor(0, 0, 0, 1);
		ctx.clear(ctx.COLOR_BUFFER_BIT);
		ctx.colorMask(true, true, true, false);
	}
	
	this.setup = function () {
      if (!AMIGA.config.video.enabled) return;
      if (open) this.cleanup();

      div = document.getElementById(AMIGA.config.video.id);
      if (!div)
         Fatal(SAEE_Video_ID_Not_Found, 'Video DIV-element not found. Check your code. (Malformed-DIV-name: ' + AMIGA.config.video.id + ')');

      scale = (this.available & SAEI_Video_WebGL) ? AMIGA.config.video.scale : false;
      width = VIDEO_WIDTH << (scale ? 1 : 0);
      height = VIDEO_HEIGHT << (scale ? 1 : 0);
      size = width * height;
      //BUG.info('Video.init() %d x %d, %s mode', width, height, AMIGA.config.video.ntsc ? 'ntsc' : 'pal');

      if (this.available & SAEI_Video_Canvas2D) {
         canvas = document.createElement('canvas');
         canvas.width = width;
         canvas.height = height;
         canvas.oncontextmenu = function () {
            return false;
         };
         if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Mouse) {
            canvas.onmousedown = function (e) {
               AMIGA.input.mouse.mousedown(e);
            };
            canvas.onmouseup = function (e) {
               AMIGA.input.mouse.mouseup(e);
            };
            canvas.onmouseover = function (e) {
               AMIGA.input.mouse.mouseover(e);
            };
            canvas.onmouseout = function (e) {
               AMIGA.input.mouse.mouseout(e);
            };
            canvas.onmousemove = function (e) {
               AMIGA.input.mouse.mousemove(e);
            }
         }
         if (this.available & SAEI_Video_WebGL) {
            ctx = canvas.getContext('experimental-webgl', glParams) || canvas.getContext('webgl', glParams);
            initGL();
            pixels = new Uint16Array(size);
            for (var i = 0; i < size; i++) pixels[i] = 0;

            //this.drawpixel = drawpixel_gl;
            this.drawline = drawline_gl;
            this.render = render_gl;
            this.show = show_gl;
         } else {
            ctx = canvas.getContext('2d');
            imagedata = ctx.createImageData(width, height);
            pixels = imagedata.data;

            //this.drawpixel = drawpixel_2d;
            this.drawline = drawline_2d;
            this.render = render_2d;
            this.show = show_2d;
         }
      } else {
         if (!confirm('Cant\'t initialise "WebGL" nor "Canvas 2D". Continue without video-playback?'))
            Fatal(SAEE_Video_Canvas_Not_Supported, null);
         else
            AMIGA.config.video.enabled = false;
      }

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
      if (AMIGA.config.video.enabled)
         video.appendChild(canvas);

      div.appendChild(video);
      open = true;
   };

	this.cleanup = function () {
      if (open) {
         div.removeChild(video);
         canvas = null;
         imagedata = null;
         pixels = null;
         video = null;
         open = false;
      }
   };
	
	/*---------------------------------*/

	/*this.hideCursor = function (hide) {
      canvas.style.cursor = hide ? 'none' : 'auto';
   };*/
	
	/*this.clear_pixels = function () {
		for (var i = 0; i < size; i++) 
			pixels[i] = 0;
	}*/

	/*---------------------------------*/
	/* Canvas 2D */
	
	/*function drawpixel_2d(x, y, rgb) {
		pixels[y * width + x] = rgb;
	}*/
	
	function drawline_2d(y, data, offs) {
		var yoffs = (y * width) << 2;
		for (var x = 0, d = 0; x < width << 2; x += 4, d++) {
			pixels[yoffs + x    ] = ((data[offs + d] >> 8) & 0xf) << 4;
			pixels[yoffs + x + 1] = ((data[offs + d] >> 4) & 0xf) << 4;
			pixels[yoffs + x + 2] = ((data[offs + d] >> 0) & 0xf) << 4;
			pixels[yoffs + x + 3] = 255;
		}
	}
	
	function render_2d() {
		ctx.putImageData(imagedata, 0, 0);
	}
	
	function show_2d() {}	
	
	/*---------------------------------*/
	/* WebGL */
		
	/*function drawpixel_gl(x, y, rgb) {
		pixels[y * width + x] = rgb;
	}*/
	
	function drawline_gl(y, data, offs) {
		var yoffs = y * width;
		for (var x = 0; x < width; x++)
			pixels[yoffs + x] = data[offs + x] & 0xffff;
	}
	
	function render_gl() {
		ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGB, width, height, 0, ctx.RGB, ctx.UNSIGNED_SHORT_5_6_5, pixels);
				
		var x1 = 0;
		var x2 = width << (scale ? 1 : 0);
		var y1 = 0;
		var y2 = height << (scale ? 1 : 0);
		
		ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2]), ctx.STATIC_DRAW);
	}
	
	function show_gl() {
		ctx.drawArrays(ctx.TRIANGLES, 0, 6);
	}	
}
