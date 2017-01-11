import Utils from './utils';
import {glMatrix, mat4} from '../../node_modules/gl-matrix/dist/gl-matrix';

class Renderer {
  constructor (engine) {
    var e = this.e = engine;
    var r = this;

    //add canvas styling
    e.utils.addCSS(
        'canvas { width: 100vw; height: 100vh; display: block; z-index : 1; }'
    );

    //add canvas
    r.canvas = e.utils.addElement('canvas');

    //init canvas gl
    var gl = r.canvas.getContext( 'webgl2', { antialias: true } );
    if (!gl) {
      gl = r.canvas.getContext( 'experimental-webgl2', { antialias: true } );
    }
    if (!gl) {
      e.console.error('Failed to initialize WebGL 2.0 context');
    }
    r.gl = gl;

    //set gl basic settings
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    r.resize();

    e.console.log('Initialized renderer');





    //TEMP demo code for testing.
    //init shaders
    var vertexShaderText =
    [
        'precision mediump float;',
        '',
        'attribute vec3 vertPosition;',
        'attribute vec2 vertTexCoord;',
        'varying vec2 fragTexCoord;',
        'uniform mat4 mWorld;',
        'uniform mat4 mView;',
        'uniform mat4 mProj;',
        '',
        'void main()',
        '{',
        '  fragTexCoord = vertTexCoord;',
        '  gl_Position = mProj * mView * mWorld * vec4(vertPosition, 1.0);',
        '}'
    ].join('\n');

    var fragmentShaderText =
    [
        'precision mediump float;',
        '',
        'varying vec2 fragTexCoord;',
        'uniform sampler2D sampler;',
        '',
        'void main()',
        '{',
        '  gl_FragColor = texture2D(sampler, fragTexCoord);',
        '}'
    ].join('\n');

    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
	var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

	gl.shaderSource(vertexShader, vertexShaderText);
	gl.shaderSource(fragmentShader, fragmentShaderText);

	gl.compileShader(vertexShader);
	if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
		e.console.error('ERROR compiling vertex shader!', gl.getShaderInfoLog(vertexShader));
		return;
	}

	gl.compileShader(fragmentShader);
	if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
		e.console.error('ERROR compiling fragment shader!', gl.getShaderInfoLog(fragmentShader));
		return;
	}

	var program = gl.createProgram();
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		e.console.error('ERROR linking program!', gl.getProgramInfoLog(program));
		return;
	}
	gl.validateProgram(program);
	if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
		e.console.error('ERROR validating program!', gl.getProgramInfoLog(program));
		return;
	}

    //init buffers
    var boxVertices =
	[ // X, Y, Z           U, V
        // Top
        -1.0, 1.0, -1.0, 0, 0,
        -1.0, 1.0, 1.0, 0, 1,
        1.0, 1.0, 1.0, 1, 1,
        1.0, 1.0, -1.0, 1, 0,

        // Left
        -1.0, 1.0, 1.0, 0, 0,
        -1.0, -1.0, 1.0, 1, 0,
        -1.0, -1.0, -1.0, 1, 1,
        -1.0, 1.0, -1.0, 0, 1,

        // Right
        1.0, 1.0, 1.0, 1, 1,
        1.0, -1.0, 1.0, 0, 1,
        1.0, -1.0, -1.0, 0, 0,
        1.0, 1.0, -1.0, 1, 0,

        // Front
        1.0, 1.0, 1.0, 1, 1,
        1.0, -1.0, 1.0, 1, 0,
        -1.0, -1.0, 1.0, 0, 0,
        -1.0, 1.0, 1.0, 0, 1,

        // Back
        1.0, 1.0, -1.0, 0, 0,
        1.0, -1.0, -1.0, 0, 1,
        -1.0, -1.0, -1.0, 1, 1,
        -1.0, 1.0, -1.0, 1, 0,

        // Bottom
        -1.0, -1.0, -1.0, 1, 1,
        -1.0, -1.0, 1.0, 1, 0,
        1.0, -1.0, 1.0, 0, 0,
        1.0, -1.0, -1.0, 0, 1,
	];

	r.boxIndices =
	[
		// Top
		0, 1, 2,
		0, 2, 3,

		// Left
		5, 4, 6,
		6, 4, 7,

		// Right
		8, 9, 10,
		8, 10, 11,

		// Front
		13, 12, 14,
		15, 14, 12,

		// Back
		16, 17, 18,
		16, 18, 19,

		// Bottom
		21, 20, 22,
		22, 20, 23
	];

	var boxVertexBufferObject = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, boxVertexBufferObject);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(boxVertices), gl.STATIC_DRAW);

	var boxIndexBufferObject = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, boxIndexBufferObject);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.boxIndices), gl.STATIC_DRAW);

	var positionAttribLocation = gl.getAttribLocation(program, 'vertPosition');
	var texCoordAttribLocation = gl.getAttribLocation(program, 'vertTexCoord');
	gl.vertexAttribPointer(
		positionAttribLocation, // Attribute location
		3, // Number of elements per attribute
		gl.FLOAT, // Type of elements
		gl.FALSE,
		5 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
		0 // Offset from the beginning of a single vertex to this attribute
	);
	gl.vertexAttribPointer(
		texCoordAttribLocation, // Attribute location
		2, // Number of elements per attribute
		gl.FLOAT, // Type of elements
		gl.FALSE,
		5 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
		3 * Float32Array.BYTES_PER_ELEMENT // Offset from the beginning of a single vertex to this attribute
	);

	gl.enableVertexAttribArray(positionAttribLocation);
	gl.enableVertexAttribArray(texCoordAttribLocation);

    //texture
    var image = new Image();
	image.onload = function () {
        r.boxTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, r.boxTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
            gl.UNSIGNED_BYTE,
            image
        );
        gl.bindTexture(gl.TEXTURE_2D, null);
	};
	image.src = 'crate.png';

	//setup shader
	gl.useProgram(program);
	r.matWorldUniformLocation = gl.getUniformLocation(program, 'mWorld');
	r.matViewUniformLocation = gl.getUniformLocation(program, 'mView');
	r.matProjUniformLocation = gl.getUniformLocation(program, 'mProj');
	r.worldMatrix = new Float32Array(16);
	r.viewMatrix = new Float32Array(16);
	r.projMatrix = new Float32Array(16);

	mat4.identity(r.worldMatrix);
	mat4.lookAt(r.viewMatrix, [0, 0, -8], [0, 0, 0], [0, 1, 0]);
	mat4.perspective(this.projMatrix, glMatrix.toRadian(45), r.canvas.width / r.canvas.height, 0.1, 1000.0);
	gl.uniformMatrix4fv(r.matWorldUniformLocation, gl.FALSE, r.worldMatrix);
	gl.uniformMatrix4fv(r.matViewUniformLocation, gl.FALSE, r.viewMatrix);
	gl.uniformMatrix4fv(r.matProjUniformLocation, gl.FALSE, r.projMatrix);

	r.xRotationMatrix = new Float32Array(16);
	r.yRotationMatrix = new Float32Array(16);
	r.identityMatrix = new Float32Array(16);
	mat4.identity(r.identityMatrix);
    r.angle = 0;

    window.addEventListener('resize', function () {
        r.resize();
        mat4.perspective(r.projMatrix, glMatrix.toRadian(45), r.canvas.width / r.canvas.height, 0.1, 1000.0);
        gl.uniformMatrix4fv(r.matProjUniformLocation, gl.FALSE, r.projMatrix);
    }, false);
  }

  resize () {
    var r = this;
    var gl = r.gl;
    gl.canvas.width = document.body.clientWidth;
    gl.canvas.height = document.body.clientHeight;
    gl.viewport(0, 0, r.canvas.width, r.canvas.height);
  }

  update (frametime) {
    var gl = this.gl;
    this.angle = this.angle + (frametime/500);

    mat4.rotate(this.yRotationMatrix, this.identityMatrix, this.angle, [0, 1, 0]);
    mat4.rotate(this.xRotationMatrix, this.identityMatrix, this.angle / 4, [1, 0, 0]);
    mat4.mul(this.worldMatrix, this.yRotationMatrix, this.xRotationMatrix);
    gl.uniformMatrix4fv(this.matWorldUniformLocation, gl.FALSE, this.worldMatrix);

    gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

    gl.bindTexture(gl.TEXTURE_2D, this.boxTexture);
    gl.activeTexture(gl.TEXTURE0);

    gl.drawElements(gl.TRIANGLES, this.boxIndices.length, gl.UNSIGNED_SHORT, 0);
  }
}

export { Renderer as default};
