import Utils from './utils';
import Console from './console';
import Renderer from './renderer';

const gl = Renderer.gl;

class Shader {
    constructor(path, onSuccess, onError) {
        const s = this;
        const p = path;

        Utils.loadData(p,
            (data) => {
                const obj = JSON.parse(data);

                s.vertexShader = gl.createShader(gl.VERTEX_SHADER);
                s.fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

                gl.shaderSource(s.vertexShader, obj.vertex.join('\n'));
                gl.shaderSource(s.fragmentShader, obj.fragment.join('\n'));

                gl.compileShader(s.vertexShader);
                if (!gl.getShaderParameter(s.vertexShader, gl.COMPILE_STATUS)) {
                    Console.error('Error compiling vertex shader: ' + gl.getShaderInfoLog(s.vertexShader));
                }

                gl.compileShader(s.fragmentShader);
                if (!gl.getShaderParameter(s.fragmentShader, gl.COMPILE_STATUS)) {
                    Console.error('Error compiling fragment shader: ' + gl.getShaderInfoLog(s.fragmentShader));
                }

                s.program = gl.createProgram();
                gl.attachShader(s.program, s.vertexShader);
                gl.attachShader(s.program, s.fragmentShader);

                gl.linkProgram(s.program);
                if (!gl.getProgramParameter(s.program, gl.LINK_STATUS)) {
                    Console.error('Error linking program: ' + gl.getProgramInfoLog(s.program));
                }
                gl.validateProgram(s.program);
                if (!gl.getProgramParameter(s.program, gl.VALIDATE_STATUS)) {
                    Console.error('Error validating program: ' + gl.getProgramInfoLog(s.program));
                }

                onSuccess(p);
            },
            () => {
                onError(p);
            }
        );
    }

    bind() {
        gl.useProgram(this.program);
    }

    unBind() {
        gl.useProgram(null);
    }

    setMat4(id, mat) {
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, id), gl.FALSE, mat);
    }

    setVec2(id, vec) {
        gl.uniform2f(gl.getUniformLocation(this.program, id), vec[0], vec[1]);
    }

    setVec3(id, vec) {
        gl.uniform3f(gl.getUniformLocation(this.program, id), vec[0], vec[1], vec[2]);
    }

    setVec4(id, vec) {
        gl.uniform4f(gl.getUniformLocation(this.program, id), vec[0], vec[1], vec[2], vec[3]);
    }
}

export { Shader as default };
