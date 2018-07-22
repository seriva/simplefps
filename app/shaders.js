import Console from './console';
import Renderer from './renderer';

const gl = Renderer.gl;

class Shader {
    constructor(vertex, fragment) {
        const s = this;

        s.vertexShader = gl.createShader(gl.VERTEX_SHADER);
        s.fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

        gl.shaderSource(s.vertexShader, vertex);
        gl.shaderSource(s.fragmentShader, fragment);

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
    }

    bind() {
        gl.useProgram(this.program);
    }

    unBind() {
        gl.useProgram(null);
    }

    setInt(id, value) {
        gl.uniform1i(gl.getUniformLocation(this.program, id), value);
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

const Shaders = {
    gbuffer: new Shader(
    `   #version 300 es

        precision highp float;

        layout(location=0) in vec3 aPosition;
        layout(location=1) in vec2 aUV;
        layout(location=2) in vec3 aNormal;

        uniform mat4 matWorld;
        uniform mat4 matViewProj;
        
        out vec4 vPosition;
        out vec4 vNormal;
        out vec2 vUV;
        
        void main() {
            vPosition = matWorld * vec4(aPosition, 1.0);
            vNormal = matWorld * vec4(aNormal, 0.0);
            vUV = aUV;
            gl_Position = matViewProj * matWorld * vec4(aPosition, 1.0);
        }`,
    `   #version 300 es
    
        precision highp float;
        
        in vec4 vPosition;
        in vec4 vNormal; 
        in vec2 vUV;

        layout(location=0) out vec4 fragPosition;
        layout(location=1) out vec4 fragNormal;
        layout(location=2) out vec4 fragColor;

        uniform sampler2D sampler;

        void main() {
            fragPosition = vPosition;
            fragNormal = vec4(normalize(vNormal.xyz), 0.0);
            fragColor = texture(sampler, vUV);
        }`
    ),

    directionalLight: new Shader(
    `   #version 300 es

        precision highp float;

        layout(location=0) in vec2 aPosition;

        const vec2 scale = vec2(0.5, 0.5);

        out vec2 vUV;

        void main()
        {
            vUV  = aPosition * scale + scale;
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }`,
    `   #version 300 es

        precision mediump float; 

        struct DirectionalLight 
        { 
            vec3 direction;
            vec3 diffuse;
            vec3 ambient;
        }; 

        in vec2 vUV;

        out vec4 fragmentColor;

        uniform DirectionalLight sun;
        uniform sampler2D positionBuffer;
        uniform sampler2D normalBuffer;
        uniform sampler2D colorBuffer;
        
        void main()
        {
            vec3 norm = normalize(texture(normalBuffer, vUV).xyz);
            vec4 color = texture(colorBuffer, vUV);
            vec3 normSunDir = normalize(sun.direction);
            vec3 lightIntensity = sun.ambient + sun.diffuse * max(dot(norm, normSunDir), 0.0);
            fragmentColor = vec4(color.rgb * lightIntensity, 1.0);
        }`
    ),
    sky: new Shader(
    `   #version 300 es

        precision mediump float;

        layout(location=0) in vec3 aPosition;
        layout(location=1) in vec2 aUV;

        out vec2 vUV;

        uniform mat4 matWorld;
        uniform mat4 matViewProj;

        void main()
        {
            vUV = aUV; 
            gl_Position = matViewProj * matWorld * vec4(aPosition, 1.0);
        }`,
    `   #version 300 es
        precision mediump float;

        in vec2 vUV;

        out vec4 fragmentColor;

        uniform sampler2D sampler;

        void main()
        {
            fragmentColor = texture(sampler, vUV);
        }`
    )
};

export { Shaders as default };
