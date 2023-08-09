import Console from './console.js';
import { gl } from './context.js';

const glsl = (x) => x;

class Shader {
    constructor(vertex, fragment) {
        const s = this;

        s.uniformMap = {};
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
        if (id in this.uniformMap) {
            return this.uniformMap[id];
        }
        const loc = gl.getUniformLocation(this.program, id);
        this.uniformMap[id] = loc;
        return loc;
    }

    setInt(id, value) {
        gl.uniform1i(this.getUniformLocation(id), value);
    }

    setMat4(id, mat) {
        gl.uniformMatrix4fv(this.getUniformLocation(id), gl.FALSE, mat);
    }

    setFloat(id, value) {
        gl.uniform1f(this.getUniformLocation(id), value);
    }

    setVec2(id, vec) {
        gl.uniform2f(this.getUniformLocation(id), vec[0], vec[1]);
    }

    setVec3(id, vec) {
        gl.uniform3f(this.getUniformLocation(id), vec[0], vec[1], vec[2]);
    }

    setVec4(id, vec) {
        gl.uniform4f(this.getUniformLocation(id), vec[0], vec[1], vec[2], vec[3]);
    }
}

/* eslint-disable */
const Shaders = {
    geometry: new Shader(
        glsl`#version 300 es

        precision highp float;
        precision highp int;

        layout(location=0) in vec3 aPosition;
        layout(location=1) in vec2 aUV;
        layout(location=2) in vec3 aNormal;
        layout(location=3) in vec3 aOffset;

        uniform int geomType;
        uniform int doSEM;
        uniform mat4 matWorld;
        uniform mat4 matViewProj;
        
        out vec4 vPosition;
        out vec3 vNormal;
        out vec2 vUV;
        out vec2 vSemUV;

        const int MESH = 1;
        const int INSTANCED_MESHES = 2;
        
        void main() {
            vPosition = vec4(aPosition, 1.0);

            if (geomType == INSTANCED_MESHES) {
                vPosition = vPosition + vec4(aOffset, 0.0);
            }

            vUV = aUV;
            vPosition = matWorld * vPosition;
            vNormal = normalize((matWorld * vec4(aNormal, 0.0)).xyz);

            if (doSEM==1)
            {
                vec3 r = reflect( normalize( vPosition.xyz ), vNormal );
                float m = 2. * sqrt(
                  pow( r.x, 2. ) +
                  pow( r.y, 2. ) +
                  pow( r.z + 1., 2. )
                );
                vSemUV = r.xy / m + .5;
            }

            gl_Position = matViewProj * vPosition;
        }`,
        glsl`#version 300 es
    
        precision highp float;
        precision highp int;
        
        in vec4 vPosition;
        in vec3 vNormal; 
        in vec2 vUV;
        in vec2 vSemUV;

        layout(location=0) out vec4 fragPosition;
        layout(location=1) out vec4 fragNormal;
        layout(location=2) out vec4 fragColor;
        layout(location=3) out vec4 fragEmissive;

        uniform int geomType;
        uniform int doEmissive;
        uniform int doSEM;
        uniform float semMult;
        uniform sampler2D colorSampler;
        uniform sampler2D emissiveSampler;
        uniform sampler2D semSampler;
        uniform sampler2D semApplySampler;

        const int MESH = 1;
        const int INSTANCED_MESHES = 2;

        void main() {
            switch (geomType) {
            case MESH:
            case INSTANCED_MESHES:
                fragPosition = vPosition;
                fragNormal = vec4(vNormal, 0.0);
                break;
            }   
            vec4 color = texture(colorSampler, vUV);

            if (doEmissive==1) {
                fragEmissive = texture(emissiveSampler, vUV);            
            }

            if (doSEM==1)
            {
                vec4 semColor = texture(semSampler, vSemUV);
                vec4 semApply = texture(semApplySampler, vUV);
                float semSum = semApply.x * semApply.y * semApply.z;
                if (semSum > 0.2) {
                    color = mix(color, semColor * semApply, semMult);
                }
            }         

            fragColor = color + fragEmissive;
        }`
    ),
    entityShadows: new Shader(
        glsl`#version 300 es

        precision highp float;
        precision highp int;

        layout(location=0) in vec3 aPosition;

        uniform mat4 matWorld;
        uniform mat4 matViewProj;

        void main()
        {
            gl_Position = matViewProj * matWorld * vec4(aPosition, 1.0);
        }`,
        glsl`#version 300 es

        precision highp float;
        precision highp int;

        layout(location=0) out vec4 fragColor;

        uniform vec3 ambient;

        void main()
        {
            fragColor = vec4(ambient, 1.0);
        }`
    ),
    applyShadows: new Shader(
        glsl`#version 300 es

        precision highp float;

        layout(location=0) in vec3 aPosition;

        void main()
        {
            gl_Position = vec4(aPosition, 1.0);
        }`,
        glsl`#version 300 es

        precision highp float;

        layout(location=0) out vec4 fragColor;

        uniform vec2 viewportSize;
        uniform sampler2D shadowBuffer;
        
        void main()
        {
            vec2 uv = vec2(gl_FragCoord.xy / viewportSize.xy);
            fragColor = texture(shadowBuffer, uv);
        }`
    ),
    pointLight: new Shader(
        glsl`#version 300 es

        precision highp float;
        precision highp int;

        layout(location=0) in vec3 aPosition;
        layout(location=3) in vec3 aOffset;

        uniform mat4 matWorld;
        uniform mat4 matViewProj;   
        uniform int  lightType; 

        flat out vec3 offsetPosition;
        
        const int ENTITY_LIGHT = 1;
        const int INSTANCED_LIGHT = 2;

        void main()
        {
            mat4 newMatWorld = matWorld;
            if (lightType == INSTANCED_LIGHT) {
                offsetPosition = aOffset;
                newMatWorld[3][0] = aOffset.x; 
                newMatWorld[3][1] = aOffset.y; 
                newMatWorld[3][2] = aOffset.z;  
            }     
            gl_Position = matViewProj * newMatWorld * vec4(aPosition, 1.0);
        }`,
        glsl`#version 300 es

        precision highp float;
        precision highp int;

        struct PointLight 
        { 
            vec3 position;
            vec3 color;
            float size;
            float intensity;
        };

        layout(location=0) out vec4 fragColor;

        flat in vec3 offsetPosition;

        uniform PointLight pointLight;
        uniform int  lightType;    
        uniform sampler2D positionBuffer;
        uniform sampler2D normalBuffer;

        const int ENTITY_LIGHT = 1;
        const int INSTANCED_LIGHT = 2;

        void main()
        {
            ivec2 fragCoord = ivec2(gl_FragCoord.xy);
            vec3 position = texelFetch(positionBuffer, fragCoord, 0).xyz;

            vec3 lightDir;
            switch (lightType) {
            case ENTITY_LIGHT:
                lightDir = pointLight.position - position;
                break;
            case INSTANCED_LIGHT:
                lightDir = offsetPosition - position;
                break;                
            }
            
            float dist = length(lightDir);
            if (dist > pointLight.size)
                discard;
            
            vec3 n = normalize(texelFetch(normalBuffer, fragCoord, 0).xyz);
            vec3 l = normalize(lightDir);
            
            vec3 lDir = lightDir/pointLight.size;
            float atten = max(0.0, 1.0 - dot(lDir, lDir))*pointLight.intensity;
            float nDotL = max(0.0, dot(n, l));

            fragColor = vec4(pointLight.color * atten * nDotL, 1.0);
        }`
    ),
    gaussianBlur: new Shader(
        glsl`#version 300 es
    
            precision highp float;
    
            layout(location=0) in vec3 aPosition;
    
            void main()
            {
                gl_Position = vec4(aPosition, 1.0);
            }`,
        glsl`#version 300 es
    
            precision highp float;
    
            out vec4 fragColor;
            uniform sampler2D colorBuffer;
            uniform vec2 viewportSize;
            uniform vec2 direction;

            vec4 blur13(sampler2D image, vec2 uv, vec2 resolution, vec2 direction) {
                vec4 color = vec4(0.0);
                vec2 off1 = vec2(1.411764705882353) * direction;
                vec2 off2 = vec2(3.2941176470588234) * direction;
                vec2 off3 = vec2(5.176470588235294) * direction;
                color += texture(image, uv) * 0.1964825501511404;
                color += texture(image, uv + (off1 / resolution)) * 0.2969069646728344;
                color += texture(image, uv - (off1 / resolution)) * 0.2969069646728344;
                color += texture(image, uv + (off2 / resolution)) * 0.09447039785044732;
                color += texture(image, uv - (off2 / resolution)) * 0.09447039785044732;
                color += texture(image, uv + (off3 / resolution)) * 0.010381362401148057;
                color += texture(image, uv - (off3 / resolution)) * 0.010381362401148057;
                return color;
              }        

            void main()
            {
                vec2 uv = vec2(gl_FragCoord.xy / viewportSize.xy);
                fragColor = blur13(colorBuffer, uv, viewportSize.xy, direction);
            }`
    ),
    postProcessing: new Shader(
        glsl`#version 300 es
    
            precision highp float;
    
            layout(location=0) in vec3 aPosition;
    
            void main()
            {
                gl_Position = vec4(aPosition, 1.0);
            }`,
        glsl`#version 300 es
    
            precision highp float;

            layout(std140, column_major) uniform;
    
            out vec4 fragColor;
    
            uniform bool doFXAA;
            uniform bool doEmissive;
            uniform sampler2D colorBuffer;
            uniform sampler2D lightBuffer;
            uniform sampler2D positionBuffer;
            uniform sampler2D normalBuffer;
            uniform sampler2D emissiveBuffer;
            uniform sampler2D dirtBuffer;
            uniform vec2 viewportSize;
            uniform float emissiveMult;
            uniform float gamma;
            uniform float noiseAmmount;
            uniform float noiseSpeed;
            uniform float noiseTime;

            #define FXAA_REDUCE_MIN (1.0 / 128.0)
            #define FXAA_REDUCE_MUL (1.0 / 8.0)
            #define FXAA_SPAN_MAX 8.0
            #define SIN45 0.707107

            float random(vec2 n, float offset ){
                return .5 - fract(sin(dot(n.xy + vec2( offset, 0. ), vec2(12.9898, 78.233)))* 43758.5453);
            }  
            
            float applySoftLightToChannel( float base, float blend ) {
                return ((blend < 0.5) ? (2.0 * base * blend + base * base * (1.0 - 2.0 * blend)) : (sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend)));
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
                vec3 luma  = vec3(0.299, 0.587, 0.114);
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

            void main()
            {
                vec2 uv = vec2(gl_FragCoord.xy / viewportSize.xy);
                vec4 color, light, dirt;
                vec4 emissive = vec4(0.0, 0.0, 0.0, 0.0);

                if(doFXAA){
                    color = applyFXAA(gl_FragCoord.xy);
                } else {
                    color = texture(colorBuffer, uv);
                }     

                color += vec4( vec3( noiseAmmount * random( uv, .00001 * noiseSpeed * noiseTime ) ), 1.0 );          
                
                light =  texture(lightBuffer, uv);
                emissive = texture(emissiveBuffer, uv);
                dirt = texture(dirtBuffer, uv);
            
                fragColor = (color * light) + (emissive * emissiveMult);
                fragColor = vec4( 
                    applySoftLightToChannel( fragColor.r, dirt.r ),
                    applySoftLightToChannel( fragColor.g, dirt.g ),
                    applySoftLightToChannel( fragColor.b, dirt.b ),
                    applySoftLightToChannel( fragColor.a, dirt.a )
                );
                fragColor = vec4(pow(fragColor.rgb, 1.0 / vec3(gamma)), 1.0);
            }`
    )
};
/* eslint-disable */

export { Shaders, Shader };
