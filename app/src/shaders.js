import Console from './console.js';
import { gl } from './context.js';

class Shader {
    constructor(vertex, fragment) {
        const s = this;

        s.vertexShader = gl.createShader(gl.VERTEX_SHADER);
        s.fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

        gl.shaderSource(s.vertexShader, vertex);
        gl.shaderSource(s.fragmentShader, fragment);

        gl.compileShader(s.vertexShader);
        if (!gl.getShaderParameter(s.vertexShader, gl.COMPILE_STATUS)) {
            Console.error(`Error compiling vertex shader: ${gl.getShaderInfoLog(s.vertexShader)}`);
        }

        gl.compileShader(s.fragmentShader);
        if (!gl.getShaderParameter(s.fragmentShader, gl.COMPILE_STATUS)) {
            Console.error(`Error compiling fragment shader: ${gl.getShaderInfoLog(s.fragmentShader)}`);
        }

        s.program = gl.createProgram();
        gl.attachShader(s.program, s.vertexShader);
        gl.attachShader(s.program, s.fragmentShader);

        gl.linkProgram(s.program);
        if (!gl.getProgramParameter(s.program, gl.LINK_STATUS)) {
            Console.error(`Error linking program: ${gl.getProgramInfoLog(s.program)}`);
        }
        gl.validateProgram(s.program);
        if (!gl.getProgramParameter(s.program, gl.VALIDATE_STATUS)) {
            Console.error(`Error validating program: ${gl.getProgramInfoLog(s.program)}`);
        }
    }

    bind() {
        gl.useProgram(this.program);
    }

    static unBind() {
        gl.useProgram(null);
    }

    getUniformLocation(id) {
        return gl.getUniformLocation(this.program, id);
    }

    getAttribLocation(id) {
        return gl.getAttribLocation(this.program, id);
    }

    setInt(id, value) {
        gl.uniform1i(gl.getUniformLocation(this.program, id), value);
    }

    setMat4(id, mat) {
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, id), gl.FALSE, mat);
    }

    setFloat(id, value) {
        gl.uniform1f(gl.getUniformLocation(this.program, id), value);
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

/* eslint-disable */
const Shaders = {
    geometry: new Shader(
        `   #version 300 es

        precision highp float;
        precision highp int;

        layout(location=0) in vec3 aPosition;
        layout(location=1) in vec2 aUV;
        layout(location=2) in vec3 aNormal;
        layout(location=3) in vec3 aOffset;

        uniform int geomType;
        uniform mat4 matWorld;
        uniform mat4 matViewProj;
        
        out vec4 vPosition;
        out vec4 vNormal;
        out vec2 vUV;

        const int MESH = 1;
        const int INSTANCED_MESHES = 2;
        const int SKYBOX = 3;
        
        void main() {
            
            vPosition = vec4(aPosition, 1.0);
            switch (geomType) {
            case MESH:
                vNormal = matWorld * vec4(aNormal, 0.0);
                break;
            case INSTANCED_MESHES:
                vPosition = vPosition + vec4(aOffset, 0.0);
                vNormal = matWorld * vec4(aNormal, 0.0);
                break;                
            case SKYBOX:
                break;
            }
            vUV = aUV;
            vPosition = matWorld * vPosition;
            gl_Position = matViewProj * vPosition;
        }`,
        `   #version 300 es
    
        precision highp float;
        precision highp int;
        
        in vec4 vPosition;
        in vec4 vNormal; 
        in vec2 vUV;

        layout(location=0) out vec4 fragPosition;
        layout(location=1) out vec4 fragNormal;
        layout(location=2) out vec4 fragColor;

        uniform int geomType;
        uniform int doDetail;
        uniform float detailMult;
        uniform float detailUVMult;
        uniform sampler2D colorSampler;
        uniform sampler2D detailSampler;

        const int MESH = 1;
        const int INSTANCED_MESHES = 2;
        const int SKYBOX = 3;

        void main() {
            switch (geomType) {
            case MESH:
            case INSTANCED_MESHES:
                fragPosition = vPosition;
                fragNormal = vec4(normalize(vNormal.xyz), 0.0);
                break;
            case SKYBOX:
                fragNormal = vec4(0.0, 0.0, 0.0, 1.0);
                break;
            }   
            vec4 color = texture(colorSampler, vUV);

            if (doDetail==1)
            {
                vec2 dUV = vUV * detailUVMult;
                vec4 detail = texture(detailSampler, dUV);
                color.rgb += detail.rgb - detailMult;
            }  

            fragColor = color;
        }`
    ),
    directionalLight: new Shader(
        `   #version 300 es

        precision highp float;

        layout(location=0) in vec3 aPosition;

        const vec2 scale = vec2(0.5, 0.5);

        out vec2 vUV;

        void main()
        {
            vUV  = aPosition.xy * scale + scale;
            gl_Position = vec4(aPosition, 1.0);
        }`,
        `   #version 300 es

        precision highp float; 

        struct DirectionalLight 
        { 
            vec3 direction;
            vec3 diffuse;
            vec3 ambient;
        }; 

        in vec2 vUV;

        layout(location=0) out vec4 fragColor;

        uniform DirectionalLight directionalLight;
        uniform sampler2D positionBuffer;
        uniform sampler2D normalBuffer;
        uniform sampler2D colorBuffer;
        
        void main()
        {
            vec4 norm = texture(normalBuffer, vUV);
            vec4 color = texture(colorBuffer, vUV);
            vec3 normSunDir = normalize(directionalLight.direction);
            vec3 lightIntensity = vec3(1.0);
            if (norm.w != 1.0){
                lightIntensity = directionalLight.ambient + directionalLight.diffuse * max(dot(normalize(norm.xyz), normSunDir), 0.0);
            }
            fragColor = vec4(color.rgb * lightIntensity, 1.0);
        }`
    ),
    postProcessing: new Shader(
        `   #version 300 es
    
            precision highp float;
    
            layout(location=0) in vec3 aPosition;
    
            void main()
            {
                gl_Position = vec4(aPosition.x, aPosition.y, 1.0, 1.0);
            }`,
        `   #version 300 es
    
            precision highp float;

            struct SSAOUniforms {
                float sampleRadius;
                float bias;
                vec2 attenuation;
                vec2 depthRange;
            };

            layout(std140, column_major) uniform;
    
            out vec4 fragColor;
    
            uniform bool doFXAA;
            uniform bool doSSAO;
            uniform sampler2D colorBuffer;
            uniform sampler2D positionBuffer;
            uniform sampler2D normalBuffer;
            uniform sampler2D noiseBuffer;
            uniform vec2 viewportSize;
            uniform SSAOUniforms ssao;

            #define FXAA_REDUCE_MIN (1.0/ 128.0)
            #define FXAA_REDUCE_MUL (1.0 / 8.0)
            #define FXAA_SPAN_MAX 8.0
            #define SIN45 0.707107

            float getOcclusion(vec3 position, vec3 normal, ivec2 fragCoord) {
                vec3 occluderPosition = texelFetch(positionBuffer, fragCoord, 0).xyz;
                vec3 positionVec = occluderPosition - position;
                float intensity = max(dot(normal, normalize(positionVec)) - ssao.bias, 0.0);
                float attenuation = 1.0 / (ssao.attenuation.x + ssao.attenuation.y * length(positionVec));
                return intensity * attenuation;
            }
            
            vec4 applyFXAA(vec2 fragCoord)
            {
                vec4 color;
                vec2 inverseVP = vec2(1.0 / viewportSize.x, 1.0 / viewportSize.y);
                vec3 rgbNW = texture(colorBuffer, (fragCoord + vec2(-1.0, -1.0)) * inverseVP).xyz;
                vec3 rgbNE = texture(colorBuffer, (fragCoord + vec2(1.0, -1.0)) * inverseVP).xyz;
                vec3 rgbSW = texture(colorBuffer, (fragCoord + vec2(-1.0, 1.0)) * inverseVP).xyz;
                vec3 rgbSE = texture(colorBuffer, (fragCoord + vec2(1.0, 1.0)) * inverseVP).xyz;
                vec3 rgbM  = texture(colorBuffer, fragCoord  * inverseVP).xyz;
                vec3 luma = vec3(0.299, 0.587, 0.114);
                float lumaNW = dot(rgbNW, luma);
                float lumaNE = dot(rgbNE, luma);
                float lumaSW = dot(rgbSW, luma);
                float lumaSE = dot(rgbSE, luma);
                float lumaM  = dot(rgbM,  luma);
                float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
                float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
                
                vec2 dir;
                dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
                dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));
                
                float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) *
                                      (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
                
                float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
                dir = min(vec2(FXAA_SPAN_MAX, FXAA_SPAN_MAX),
                          max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX),
                          dir * rcpDirMin)) * inverseVP;
                  
                vec3 rgbA = 0.5 * (
                    texture(colorBuffer, fragCoord * inverseVP + dir * (1.0 / 3.0 - 0.5)).xyz +
                    texture(colorBuffer, fragCoord * inverseVP + dir * (2.0 / 3.0 - 0.5)).xyz);
                vec3 rgbB = rgbA * 0.5 + 0.25 * (
                    texture(colorBuffer, fragCoord * inverseVP + dir * -0.5).xyz +
                    texture(colorBuffer, fragCoord * inverseVP + dir * 0.5).xyz);
            
                float lumaB = dot(rgbB, luma);
                if ((lumaB < lumaMin) || (lumaB > lumaMax))
                    color = vec4(rgbA, 1.0);
                else
                    color = vec4(rgbB, 1.0);
                return color;
            }

            float applySSAO(ivec2 fragCoord)
            {
                vec3 position = texelFetch(positionBuffer, fragCoord, 0).xyz;
                vec3 normal = texelFetch(normalBuffer, fragCoord, 0).xyz;
                vec2 rand = normalize(texelFetch(noiseBuffer, fragCoord, 0).xy);
                float depth = (length(position) - ssao.depthRange.x) / 
                              (ssao.depthRange.y - ssao.depthRange.x);
                float kernelRadius = ssao.sampleRadius * (1.0 - depth);
                vec2 kernel[4];
                kernel[0] = vec2(0.0, 1.0);
                kernel[1] = vec2(1.0, 0.0);
                kernel[2] = vec2(0.0, -1.0);
                kernel[3] = vec2(-1.0, 0.0);
                float occlusion = 0.0;
                for (int i = 0; i < 4; ++i) {
                    vec2 k1 = reflect(kernel[i], rand);
                    vec2 k2 = vec2(k1.x * SIN45 - k1.y * SIN45, k1.x * SIN45 + k1.y * SIN45);
                    k1 *= kernelRadius;
                    k2 *= kernelRadius;
                    occlusion += getOcclusion(position, normal, fragCoord + ivec2(k1));
                    occlusion += getOcclusion(position, normal, fragCoord + ivec2(k2 * 0.75));
                    occlusion += getOcclusion(position, normal, fragCoord + ivec2(k1 * 0.5));
                    occlusion += getOcclusion(position, normal, fragCoord + ivec2(k2 * 0.25));
                }
                return clamp(occlusion / 16.0, 0.0, 1.0);
            }

            void main()
            {
                vec2 uv = vec2(gl_FragCoord.xy / viewportSize.xy);
                vec2 fragCoord = uv * viewportSize; 
                vec4 color;

                if(doFXAA){
                    color = applyFXAA(fragCoord);
                } else {
                    color = texture(colorBuffer, uv);
                }

                float occlusion = 0.0;
                if(doSSAO)
                {
                    occlusion = applySSAO(ivec2(fragCoord.xy));
                }

                fragColor = vec4(clamp(color.rgb - occlusion, 0.0, 1.0), 1.0);
            }`
    )
};
/* eslint-disable */

export { Shaders, Shader };
