import Utils from './utils';
import { glMatrix, mat4 } from '../../node_modules/gl-matrix/dist/gl-matrix';

class Renderer {
    constructor (engine) {
        var e = this.e = engine;
        var r = this;

        //add canvas styling
        e.utils.addCSS(
            'canvas { background: #000; width: 100vw; height: 100vh; display: block; z-index : 1; }'
        );

        //add canvas
        r.canvas = e.utils.addElement('canvas');

        //init canvas gl
        var gl = r.canvas.getContext('webgl2', {
            antialias: true
        });
        if (!gl) {
            gl = r.canvas.getContext('experimental-webgl2', {
                antialias: true
            });
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

        //setup buffers


        //print gl detail
        e.console.log('Initialized renderer');
        e.console.log('Renderer: ' + gl.getParameter(gl.RENDERER));
        e.console.log('Vendor: ' + gl.getParameter(gl.VENDOR));
        e.console.log('WebGL version: ' + gl.getParameter(gl.VERSION));
        e.console.log('GLSL version: ' + gl.getParameter(gl.SHADING_LANGUAGE_VERSION));





        //TEMP demo code for testing.
        //init shaders
        var vertexShaderText = [
            'precision mediump float;',

            'attribute vec3 vertPosition;',
            'attribute vec2 vertTexCoord;',
            'attribute vec3 vertNormal;',

            'varying vec2 fragTexCoord;',
            'varying vec3 fragNormal;',

            'uniform mat4 mWorld;',
            'uniform mat4 mView;',
            'uniform mat4 mProj;',

            'void main()',
            '{',
                'fragTexCoord = vertTexCoord;',
                'fragNormal = (mWorld * vec4(vertNormal, 0.0)).xyz;',
                'gl_Position = mProj * mView * mWorld * vec4(vertPosition, 1.0);',
            '}'
        ].join('\n');

        var fragmentShaderText = [
            'precision mediump float;',

            'struct DirectionalLight',
            '{',
            ' vec3 direction;',
            '	vec3 color;',
            '};',

            'varying vec2 fragTexCoord;',
            'varying vec3 fragNormal;',

            'uniform vec3 ambientLightIntensity;',
            'uniform DirectionalLight sun;',
            'uniform sampler2D sampler;',

            'void main()',
            '{',
                'vec3 surfaceNormal = normalize(fragNormal);',
                'vec3 normSunDir = normalize(sun.direction);',
                'vec4 texel = texture2D(sampler, fragTexCoord);',
                'vec3 lightIntensity = ambientLightIntensity + sun.color * max(dot(fragNormal, normSunDir), 0.0);',
                'gl_FragColor = vec4(texel.rgb * lightIntensity, texel.a);',
            '}'
        ].join('\n');

        var vertexShader = gl.createShader(gl.VERTEX_SHADER);
        var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

        gl.shaderSource(vertexShader, vertexShaderText);
        gl.shaderSource(fragmentShader, fragmentShaderText);

        gl.compileShader(vertexShader);
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            e.console.error('Error compiling vertex shader: ' + gl.getShaderInfoLog(vertexShader));
            return;
        }

        gl.compileShader(fragmentShader);
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            e.console.error('Error compiling fragment shader: ' + gl.getShaderInfoLog(fragmentShader));
            return;
        }

        r.program = gl.createProgram();
        gl.attachShader(r.program, vertexShader);
        gl.attachShader(r.program, fragmentShader);
        gl.linkProgram(r.program);
        if (!gl.getProgramParameter(r.program, gl.LINK_STATUS)) {
            e.console.error('Error linking program: ' + gl.getProgramInfoLog(program));
            return;
        }
        gl.validateProgram(r.program);
        if (!gl.getProgramParameter(r.program, gl.VALIDATE_STATUS)) {
            e.console.error('Error validating program: ' +  gl.getProgramInfoLog(program));
            return;
        }
         gl.useProgram(r.program);

        r.worldMatrix = new Float32Array(16);
        r.viewMatrix = new Float32Array(16);
        r.projMatrix = new Float32Array(16);
        mat4.identity(r.worldMatrix);
        mat4.lookAt(r.viewMatrix, [0, 1, -3.2], [0, 1, 0], [0, 1, 0]);
        mat4.perspective(this.projMatrix, glMatrix.toRadian(45), r.canvas.width / r.canvas.height, 0.1, 1000.0);

        gl.uniformMatrix4fv(gl.getUniformLocation(r.program, 'mWorld'), gl.FALSE, r.worldMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(r.program, 'mView'), gl.FALSE, r.viewMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(r.program, 'mProj'), gl.FALSE, r.projMatrix);
        gl.uniform3f(gl.getUniformLocation(r.program, 'ambientLightIntensity'), 0.2, 0.2, 0.2);
        gl.uniform3f(gl.getUniformLocation(r.program, 'sun.direction'), 3.0, 4.0, -2.0);
        gl.uniform3f(gl.getUniformLocation(r.program, 'sun.color'), 0.9, 0.9, 0.9);

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


    setup () {
        //TEMP This is for testing
        var r = this;
        var gl = r.gl;

        this.tex = r.e.resources.get('texture');
        this.mesh = r.e.resources.get('statue');

        var positionAttribLocation = gl.getAttribLocation(r.program, 'vertPosition');
        var texCoordAttribLocation = gl.getAttribLocation(r.program, 'vertTexCoord');
        var normalAttribLocation = gl.getAttribLocation(r.program, 'vertNormal');

        gl.bindBuffer(gl.ARRAY_BUFFER, r.mesh.vertexBuffer);
        gl.vertexAttribPointer(positionAttribLocation, r.mesh.vertexBuffer.itemSize, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(positionAttribLocation);

        gl.bindBuffer(gl.ARRAY_BUFFER, r.mesh.textureBuffer);
        gl.vertexAttribPointer(texCoordAttribLocation, r.mesh.textureBuffer.itemSize, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(texCoordAttribLocation);

        gl.bindBuffer(gl.ARRAY_BUFFER, r.mesh.normalBuffer);
        gl.vertexAttribPointer(normalAttribLocation, r.mesh.normalBuffer.itemSize, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(normalAttribLocation);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, r.mesh.indexBuffer);
    }



    update (frametime) {
        var gl = this.gl;
        this.angle = this.angle + (frametime / 1000);

        mat4.rotate(this.yRotationMatrix, this.identityMatrix, this.angle, [0, 1, 0]);
        mat4.rotate(this.xRotationMatrix, this.identityMatrix, 0, [1, 0, 0]);
        mat4.mul(this.worldMatrix, this.yRotationMatrix, this.xRotationMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'mWorld'), gl.FALSE, this.worldMatrix);

        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

        this.tex.bind(gl.TEXTURE0);
        gl.drawElements(gl.TRIANGLES, this.mesh.indexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
    }
}

export {Renderer as default};
