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
    diffuse: new Shader(
    `   #version 300 es

        precision mediump float;

        layout(location=0) in vec3 vertPosition;
        layout(location=1) in vec2 vertTexCoord;
        layout(location=2) in vec3 vertNormal;

        out vec2 fragTexCoord;
        out vec3 fragNormal;

        uniform mat4 matWorld;
        uniform mat4 matViewProj;

        void main()
        {
            fragTexCoord = vertTexCoord; 
            fragNormal = (matWorld * vec4(vertNormal, 0.0)).xyz;
            gl_Position = matViewProj * matWorld * vec4(vertPosition, 1.0);
        }`,
    `   #version 300 es

        precision mediump float;

        struct DirectionalLight 
        { 
            vec3 direction;
            vec3 diffuse;
            vec3 ambient;
        }; 

        in vec2 fragTexCoord;
        in vec3 fragNormal;

        out vec4 fragmentColor;

        uniform DirectionalLight sun;
        uniform sampler2D sampler;

        void main()
        {
            vec3 surfaceNormal = normalize(fragNormal);
            vec3 normSunDir = normalize(sun.direction);
            vec4 texel = texture(sampler, fragTexCoord);
            vec3 lightIntensity = sun.ambient + sun.diffuse * max(dot(fragNormal, normSunDir), 0.0);
            fragmentColor = vec4(texel.rgb * lightIntensity, texel.a);
        }`
    ),
    sky: new Shader(
    `   #version 300 es
        precision mediump float;

        layout(location=0) in vec3 vertPosition;
        layout(location=1) in vec2 vertTexCoord;

        out vec2 fragTexCoord;

        uniform mat4 matWorld;
        uniform mat4 matViewProj;

        void main()
        {
            fragTexCoord = vertTexCoord; 
            gl_Position = matViewProj * matWorld * vec4(vertPosition, 1.0);
        }`,
    `   #version 300 es
        precision mediump float;

        in vec2 fragTexCoord;

        out vec4 fragmentColor;

        uniform sampler2D sampler;

        void main()
        {
            fragmentColor = texture(sampler, fragTexCoord);
        }`
    )
};

export { Shaders as default };
