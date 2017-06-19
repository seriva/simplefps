// engine imports
import Utils from './utils';

class Shader {
    constructor(path, engine, onSuccess, onError) {
        const s = this;
        const e = s.e = engine;
        const p = path;
        const gl = s.gl = e.renderer.gl;

        Utils.loadData(p,
            (data) => {
                const obj = JSON.parse(data);

                s.vertexShader = gl.createShader(gl.VERTEX_SHADER);
                s.fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

                gl.shaderSource(s.vertexShader, obj.vertex.join('\n'));
                gl.shaderSource(s.fragmentShader, obj.fragment.join('\n'));

                gl.compileShader(s.vertexShader);
                if (!gl.getShaderParameter(s.vertexShader, gl.COMPILE_STATUS)) {
                    e.console.error('Error compiling vertex shader: ' + gl.getShaderInfoLog(s.vertexShader));
                }

                gl.compileShader(s.fragmentShader);
                if (!gl.getShaderParameter(s.fragmentShader, gl.COMPILE_STATUS)) {
                    e.console.error('Error compiling fragment shader: ' + gl.getShaderInfoLog(s.fragmentShader));
                }

                s.program = gl.createProgram();
                gl.attachShader(s.program, s.vertexShader);
                gl.attachShader(s.program, s.fragmentShader);

                gl.linkProgram(s.program);
                if (!gl.getProgramParameter(s.program, gl.LINK_STATUS)) {
                    e.console.error('Error linking program: ' + gl.getProgramInfoLog(s.program));
                }
                gl.validateProgram(s.program);
                if (!gl.getProgramParameter(s.program, gl.VALIDATE_STATUS)) {
                    e.console.error('Error validating program: ' + gl.getProgramInfoLog(s.program));
                }

                onSuccess(p);
            },
            () => {
                onError(p);
            }
        );
    }

    bind() {
        const gl = this.gl;
        gl.useProgram(this.program);
    }

    unbind() {
        const gl = this.gl;
        gl.useProgram(null);
    }
}

export { Shader as default };
