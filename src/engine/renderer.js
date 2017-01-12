import Utils from './utils';
import {glMatrix, mat4} from '../../node_modules/gl-matrix/dist/gl-matrix';
import OBJ from '../../node_modules/webgl-obj-loader/webgl-obj-loader';

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
      'attribute vec3 vertNormal;',
      '',
      'varying vec2 fragTexCoord;',
      'varying vec3 fragNormal;',
      '',
      'uniform mat4 mWorld;',
      'uniform mat4 mView;',
      'uniform mat4 mProj;',
      '',
      'void main()',
      '{',
      '  fragTexCoord = vertTexCoord;',
      '  fragNormal = (mWorld * vec4(vertNormal, 0.0)).xyz;',
      '  gl_Position = mProj * mView * mWorld * vec4(vertPosition, 1.0);',
      '}'
    ].join('\n');

    var fragmentShaderText =
    [
      'precision mediump float;',

      'struct DirectionalLight',
      '{',
      ' vec3 direction;',
      '	vec3 color;',
      '};',
      '',
      'varying vec2 fragTexCoord;',
      'varying vec3 fragNormal;',
      '',
      'uniform vec3 ambientLightIntensity;',
      'uniform DirectionalLight sun;',
      'uniform sampler2D sampler;',
      '',
      'void main()',
      '{',
      ' vec3 surfaceNormal = normalize(fragNormal);',
    	' vec3 normSunDir = normalize(sun.direction);',
    	' vec4 texel = texture2D(sampler, fragTexCoord);',
    	' vec3 lightIntensity = ambientLightIntensity + sun.color * max(dot(fragNormal, normSunDir), 0.0);',
    	' gl_FragColor = vec4(texel.rgb * lightIntensity, texel.a);',
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

  	var positionAttribLocation = gl.getAttribLocation(program, 'vertPosition');
  	var texCoordAttribLocation = gl.getAttribLocation(program, 'vertTexCoord');
    var normalAttribLocation = gl.getAttribLocation(program, 'vertNormal');

    //mesh
    r.mesh = undefined;
    OBJ.downloadMeshes({
      'statue': 'resources/statue.obj'
    }, function(meshes){
       r.mesh =  meshes.statue;
       OBJ.initMeshBuffers(gl, meshes.statue);

       gl.bindBuffer(gl.ARRAY_BUFFER, r.mesh.vertexBuffer);
       gl.vertexAttribPointer(positionAttribLocation, r.mesh.vertexBuffer.itemSize, gl.FLOAT, false, 0, 0);

       gl.bindBuffer(gl.ARRAY_BUFFER, r.mesh.textureBuffer);
       gl.vertexAttribPointer(texCoordAttribLocation, r.mesh.textureBuffer.itemSize, gl.FLOAT, false, 0, 0);

       gl.bindBuffer(gl.ARRAY_BUFFER, r.mesh.normalBuffer);
       gl.vertexAttribPointer(normalAttribLocation, r.mesh.normalBuffer.itemSize, gl.FLOAT, false, 0, 0);

       gl.enableVertexAttribArray(positionAttribLocation);
       gl.enableVertexAttribArray(texCoordAttribLocation);
       gl.enableVertexAttribArray(normalAttribLocation);

       gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,r.mesh.indexBuffer);
    });

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
  	image.src = 'resources/statue.jpg';

  	//setup shader
  	gl.useProgram(program);
  	r.matWorldUniformLocation = gl.getUniformLocation(program, 'mWorld');
  	r.matViewUniformLocation = gl.getUniformLocation(program, 'mView');
  	r.matProjUniformLocation = gl.getUniformLocation(program, 'mProj');
    r.ambientUniformLocation = gl.getUniformLocation(program, 'ambientLightIntensity');
  	r.sunlightDirUniformLocation = gl.getUniformLocation(program, 'sun.direction');
  	r.sunlightIntUniformLocation = gl.getUniformLocation(program, 'sun.color');

  	r.worldMatrix = new Float32Array(16);
  	r.viewMatrix = new Float32Array(16);
  	r.projMatrix = new Float32Array(16);
  	mat4.identity(r.worldMatrix);
  	mat4.lookAt(r.viewMatrix, [0, 1, -3.2], [0, 1, 0], [0, 1, 0]);
  	mat4.perspective(this.projMatrix, glMatrix.toRadian(45), r.canvas.width / r.canvas.height, 0.1, 1000.0);

  	gl.uniformMatrix4fv(r.matWorldUniformLocation, gl.FALSE, r.worldMatrix);
  	gl.uniformMatrix4fv(r.matViewUniformLocation, gl.FALSE, r.viewMatrix);
  	gl.uniformMatrix4fv(r.matProjUniformLocation, gl.FALSE, r.projMatrix);
  	gl.uniform3f(r.ambientUniformLocation, 0.2, 0.2, 0.2);
  	gl.uniform3f(r.sunlightDirUniformLocation, 3.0, 4.0, -2.0);
  	gl.uniform3f(r.sunlightIntUniformLocation, 0.9, 0.9, 0.9);

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
    this.angle = this.angle + (frametime/1000);

    mat4.rotate(this.yRotationMatrix, this.identityMatrix, this.angle, [0, 1, 0]);
    mat4.rotate(this.xRotationMatrix, this.identityMatrix, 0, [1, 0, 0]);
    mat4.mul(this.worldMatrix, this.yRotationMatrix, this.xRotationMatrix);
    gl.uniformMatrix4fv(this.matWorldUniformLocation, gl.FALSE, this.worldMatrix);

    gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.boxTexture);

    if(this.mesh){
      gl.drawElements(gl.TRIANGLES, this.mesh.indexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
    }
  }
}

export { Renderer as default};
