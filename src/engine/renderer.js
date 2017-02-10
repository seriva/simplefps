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

        //print gl detail
        e.console.log('Initialized renderer');
        e.console.log('Renderer: ' + gl.getParameter(gl.RENDERER));
        e.console.log('Vendor: ' + gl.getParameter(gl.VENDOR));
        e.console.log('WebGL version: ' + gl.getParameter(gl.VERSION));
        e.console.log('GLSL version: ' + gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
    }

    resize () {
        var r = this;
        var gl = r.gl;
        gl.canvas.width = document.body.clientWidth;
        gl.canvas.height = document.body.clientHeight;
        gl.viewport(0, 0, r.canvas.width, r.canvas.height);
    }



    setup () {
        var r = this;
        var gl = r.gl;

        r.texture = r.e.resources.get('texture');
        r.mesh = r.e.resources.get('statue');
        r.shader =  r.e.resources.get('shader');

        r.worldMatrix = new Float32Array(16);
        r.viewMatrix = new Float32Array(16);
        r.projMatrix = new Float32Array(16);
        mat4.identity(r.worldMatrix);
        mat4.lookAt(r.viewMatrix, [0, 1, -3.2], [0, 1, 0], [0, 1, 0]);
        mat4.perspective(this.projMatrix, glMatrix.toRadian(45), r.canvas.width / r.canvas.height, 0.1, 1000.0);

        r.shader.bind();
        gl.uniformMatrix4fv(gl.getUniformLocation(r.shader.program, 'mWorld'), gl.FALSE, r.worldMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(r.shader.program, 'mView'), gl.FALSE, r.viewMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(r.shader.program, 'mProj'), gl.FALSE, r.projMatrix);
        gl.uniform3f(gl.getUniformLocation(r.shader.program, 'ambientLightIntensity'), 0.2, 0.2, 0.2);
        gl.uniform3f(gl.getUniformLocation(r.shader.program, 'sun.direction'), 3.0, 4.0, -2.0);
        gl.uniform3f(gl.getUniformLocation(r.shader.program, 'sun.color'), 0.9, 0.9, 0.9);

        r.identityMatrix = new Float32Array(16);
        mat4.identity(r.identityMatrix);
        r.angle = 0;
        window.addEventListener('resize', function () {
            r.resize();
            mat4.perspective(r.projMatrix, glMatrix.toRadian(45), r.canvas.width / r.canvas.height, 0.1, 1000.0);
            gl.uniformMatrix4fv(gl.getUniformLocation(r.shader.program, 'mProj'), gl.FALSE, r.projMatrix);
        }, false);
    }

    update (frametime) {
        var gl = this.gl;
        this.angle = this.angle + (frametime / 1000);

        mat4.rotate(this.worldMatrix, this.identityMatrix, this.angle, [0, 1, 0]);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.shader.program, 'mWorld'), gl.FALSE, this.worldMatrix);

        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

        this.texture.bind(gl.TEXTURE0);
        this.mesh.render();
        this.texture.unbind();

    }
}

export {Renderer as default};
