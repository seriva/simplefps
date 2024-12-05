import Console from "./console.js";
import { gl } from "./context.js";

const glsl = (x) => x;

class Shader {
    #uniformMap;

    constructor(vertex, fragment) {
        this.#uniformMap = new Map();
        this.createAndCompileShaders(vertex, fragment);
        this.createAndLinkProgram();
    }

    createAndCompileShaders(vertex, fragment) {
        // Create and compile vertex shader
        this.vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(this.vertexShader, vertex);
        gl.compileShader(this.vertexShader);
        this.checkShaderError(this.vertexShader, "vertex");

        // Create and compile fragment shader
        this.fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(this.fragmentShader, fragment);
        gl.compileShader(this.fragmentShader);
        this.checkShaderError(this.fragmentShader, "fragment");
    }

    createAndLinkProgram() {
        this.program = gl.createProgram();
        gl.attachShader(this.program, this.vertexShader);
        gl.attachShader(this.program, this.fragmentShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            Console.error(`Error linking program: ${gl.getProgramInfoLog(this.program)}`);
            this.dispose();
            return;
        }

        // Cleanup individual shaders after linking
        gl.detachShader(this.program, this.vertexShader);
        gl.detachShader(this.program, this.fragmentShader);
        gl.deleteShader(this.vertexShader);
        gl.deleteShader(this.fragmentShader);
    }

    checkShaderError(shader, type) {
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(shader);
            Console.error(`Error compiling ${type} shader: ${error}`);
            gl.deleteShader(shader);
        }
    }

    bind() {
        gl.useProgram(this.program);
    }

    static unBind() {
        gl.useProgram(null);
    }

    getUniformLocation(id) {
        let location = this.#uniformMap.get(id);
        if (location !== undefined) return location;

        location = gl.getUniformLocation(this.program, id);
        if (location === null) {
            Console.warn(`Uniform '${id}' not found in shader program`);
            this.#uniformMap.set(id, null);
            return null;
        }

        this.#uniformMap.set(id, location);
        return location;
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

    dispose() {
        if (this.program) {
            gl.deleteProgram(this.program);
            this.program = null;
        }
        this.#uniformMap.clear();
    }
}

const ShaderSources = {
    geometry: {
        vertex: glsl`#version 300 es
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
            const int SKYBOX = 3;

            void main() {
                vPosition = vec4(aPosition + (geomType == INSTANCED_MESHES ? aOffset : vec3(0.0)), 1.0);
                vPosition = matWorld * vPosition;
                
                vUV = aUV;
                vNormal = normalize(mat3(matWorld) * aNormal);

                if (doSEM == 1) {
                    vec3 r = reflect(normalize(vPosition.xyz), vNormal);
                    float m = 2.0 * sqrt(dot(r.xy, r.xy) + (r.z + 1.0) * (r.z + 1.0));
                    vSemUV = r.xy / m + 0.5;
                }

                gl_Position = matViewProj * vPosition;
            }`,
        fragment: glsl`#version 300 es
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
            const int SKYBOX = 3;

            void main() {
                // Early alpha test using textureLod for better performance
                vec4 color = textureLod(colorSampler, vUV, 0.0);
                if(color.a < 0.5) discard;

                // Initialize fragEmissive to zero
                fragEmissive = vec4(0.0);

                // Combine geomType checks to reduce branching
                if (geomType != SKYBOX) {
                    fragPosition = vPosition;
                    fragNormal = vec4(vNormal, 0.0);
                } else {
                    fragNormal = vec4(0.0, 0.0, 0.0, 1.0);
                }

                // Combine SEM and emissive calculations
                if (doSEM == 1) {
                    vec4 semApply = textureLod(semApplySampler, vUV, 0.0);
                    float semSum = dot(semApply.xyz, vec3(0.333333));  // Faster than multiplication
                    if (semSum > 0.2) {
                        vec4 semColor = textureLod(semSampler, vSemUV, 0.0);
                        color = mix(color, semColor * semApply, semMult);
                    }
                }

                if (doEmissive == 1) {
                    fragEmissive = textureLod(emissiveSampler, vUV, 0.0);
                }

                fragColor = color + fragEmissive;
            }`,
    },
    entityShadows: {
        vertex: glsl`#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;

            uniform mat4 matWorld;
            uniform mat4 matViewProj;

            void main()
            {
                gl_Position = matViewProj * matWorld * vec4(aPosition, 1.0);
            }`,
        fragment: glsl`#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) out vec4 fragColor;

            uniform vec3 ambient;

            void main()
            {
                fragColor = vec4(ambient, 1.0);
            }`,
    },
    applyShadows: {
        vertex: glsl`#version 300 es
            precision highp float;

            layout(location=0) in vec3 aPosition;

            void main()
            {
                gl_Position = vec4(aPosition, 1.0);
            }`,
        fragment: glsl`#version 300 es
            precision highp float;

            layout(location=0) out vec4 fragColor;

            uniform vec2 viewportSize;
            uniform sampler2D shadowBuffer;

            void main()
            {
                vec2 uv = vec2(gl_FragCoord.xy / viewportSize.xy);
                fragColor = texture(shadowBuffer, uv);
            }`,
    },
    directionalLight: {
        vertex: glsl`#version 300 es
            precision highp float;

            layout(location=0) in vec3 aPosition;

            void main()
            {
                gl_Position = vec4(aPosition, 1.0);
            }`,
        fragment: glsl`#version 300 es
            precision highp float;

            struct DirectionalLight {
                vec3 direction;
                vec3 color;
            };

            layout(location=0) out vec4 fragColor;

            uniform DirectionalLight directionalLight;
            uniform vec2 viewportSize;
            uniform sampler2D positionBuffer;
            uniform sampler2D normalBuffer;

            void main() {
                vec2 uv = gl_FragCoord.xy / viewportSize;
                vec3 normal = texture(normalBuffer, uv).xyz;
                float isSkybox = texture(normalBuffer, uv).w;

                // Calculate light intensity only if not a skybox
                vec3 lightIntensity = mix(
                    directionalLight.color * max(dot(normalize(normal), normalize(directionalLight.direction)), 0.0),
                    vec3(1.0),
                    isSkybox
                );

                fragColor = vec4(lightIntensity, 1.0);
            }`,
    },
    pointLight: {
        vertex: glsl`#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;
            layout(location=3) in vec3 aOffset;

            uniform mat4 matWorld;
            uniform mat4 matViewProj;
            uniform int lightType;

            flat out vec3 offsetPosition;

            void main()
            {
                // Combine matrix operations to avoid creating temporary matrix
                mat4 finalMatrix = matViewProj * matWorld;
                
                // Use direct vector addition instead of matrix manipulation for INSTANCED_LIGHT
                vec4 position = vec4(aPosition + (lightType == 2 ? aOffset : vec3(0.0)), 1.0);
                
                // Pass through offset only when needed
                offsetPosition = aOffset * float(lightType == 2);
                
                gl_Position = finalMatrix * position;
            }`,
        fragment: glsl`#version 300 es
            precision highp float;
            precision highp int;

            struct PointLight {
                vec3 position;
                vec3 color;
                float size;
                float intensity;
            };

            layout(location=0) out vec4 fragColor;

            flat in vec3 offsetPosition;

            uniform PointLight pointLight;
            uniform int lightType;
            uniform sampler2D positionBuffer;
            uniform sampler2D normalBuffer;

            const int ENTITY_LIGHT = 1;
            const int INSTANCED_LIGHT = 2;

            void main() {
                // Use direct ivec2 construction instead of conversion
                ivec2 fragCoord = ivec2(gl_FragCoord.xy);
                vec3 position = texelFetch(positionBuffer, fragCoord, 0).xyz;

                // Eliminate branch by using mix()
                vec3 lightDir = mix(
                    pointLight.position - position,  // ENTITY_LIGHT
                    offsetPosition - position,       // INSTANCED_LIGHT
                    float(lightType == INSTANCED_LIGHT)
                );

                // Early distance check using squared distance (avoid sqrt)
                float distSq = dot(lightDir, lightDir);
                float sizeSq = pointLight.size * pointLight.size;
                if (distSq > sizeSq) discard;

                // Normalize after the distance check
                vec3 n = normalize(texelFetch(normalBuffer, fragCoord, 0).xyz);
                vec3 l = inversesqrt(distSq) * lightDir;  // Normalized direction

                // Simplified attenuation calculation
                float atten = (1.0 - distSq/sizeSq) * pointLight.intensity;
                float nDotL = max(0.0, dot(n, l));

                // Combined multiplication
                fragColor = vec4(pointLight.color * (atten * nDotL), 1.0);
            }`,
    },
    gaussianBlur: {
        vertex: glsl`#version 300 es
            precision highp float;

            layout(location=0) in vec3 aPosition;

            void main()
            {
                gl_Position = vec4(aPosition, 1.0);
            }`,
        fragment: glsl`#version 300 es
            precision highp float;

            out vec4 fragColor;
            uniform sampler2D colorBuffer;
            uniform vec2 viewportSize;
            uniform vec2 direction;

            vec4 blur11(sampler2D image, vec2 uv, vec2 resolution, vec2 direction) {
                vec2 invRes = 1.0 / resolution;
                
                // Adjusted weights for a tighter blur
                const float weights[6] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216, 0.0);
                
                // Start with center sample
                vec4 color = texture(image, uv) * weights[0];
                
                // Unrolled loop for better performance
                vec2 offset1 = direction * invRes;
                vec2 offset2 = 2.0 * direction * invRes;
                vec2 offset3 = 3.0 * direction * invRes;
                vec2 offset4 = 4.0 * direction * invRes;
                vec2 offset5 = 5.0 * direction * invRes;

                color += texture(image, uv + offset1) * weights[1];
                color += texture(image, uv - offset1) * weights[1];
                color += texture(image, uv + offset2) * weights[2];
                color += texture(image, uv - offset2) * weights[2];
                color += texture(image, uv + offset3) * weights[3];
                color += texture(image, uv - offset3) * weights[3];
                color += texture(image, uv + offset4) * weights[4];
                color += texture(image, uv - offset4) * weights[4];
                color += texture(image, uv + offset5) * weights[5];
                color += texture(image, uv - offset5) * weights[5];

                return color;
            }

            void main() {
                vec2 uv = gl_FragCoord.xy * (1.0 / viewportSize.xy);
                fragColor = blur11(colorBuffer, uv, viewportSize.xy, direction);
            }`,
    },
    postProcessing: {
        vertex: glsl`#version 300 es
            precision highp float;

            layout(location=0) in vec3 aPosition;

            void main()
            {
                gl_Position = vec4(aPosition, 1.0);
            }`,
        fragment: glsl`#version 300 es
            precision highp float;

            layout(std140, column_major) uniform;

            out vec4 fragColor;

            uniform bool doFXAA;
            uniform sampler2D colorBuffer;
            uniform sampler2D lightBuffer;
            uniform sampler2D emissiveBuffer;
            uniform sampler2D dirtBuffer;
            uniform vec2 viewportSize;
            uniform float emissiveMult;
            uniform float gamma;

            #define FXAA_REDUCE_MIN (1.0 / 128.0)
            #define FXAA_REDUCE_MUL (1.0 / 8.0)
            #define FXAA_SPAN_MAX 8.0

            float applySoftLight(float base, float blend) {
                return (blend < 0.5) 
                    ? (2.0 * base * blend + base * base * (1.0 - 2.0 * blend))
                    : (sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend));
            }

            vec4 applyFXAA(vec2 fragCoord) {
                vec2 inverseVP = 1.0 / viewportSize;
                vec3 rgbNW = texture(colorBuffer, (fragCoord + vec2(-1.0, -1.0)) * inverseVP).xyz;
                vec3 rgbNE = texture(colorBuffer, (fragCoord + vec2(1.0, -1.0)) * inverseVP).xyz;
                vec3 rgbSW = texture(colorBuffer, (fragCoord + vec2(-1.0, 1.0)) * inverseVP).xyz;
                vec3 rgbSE = texture(colorBuffer, (fragCoord + vec2(1.0, 1.0)) * inverseVP).xyz;
                vec3 rgbM  = texture(colorBuffer, fragCoord * inverseVP).xyz;
                vec3 luma  = vec3(0.299, 0.587, 0.114);
                float lumaNW = dot(rgbNW, luma);
                float lumaNE = dot(rgbNE, luma);
                float lumaSW = dot(rgbSW, luma);
                float lumaSE = dot(rgbSE, luma);
                float lumaM  = dot(rgbM,  luma);
                float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
                float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));

                vec2 dir = vec2(
                    -((lumaNW + lumaNE) - (lumaSW + lumaSE)),
                    ((lumaNW + lumaSW) - (lumaNE + lumaSE))
                );

                float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
                float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
                dir = min(vec2(FXAA_SPAN_MAX), max(vec2(-FXAA_SPAN_MAX), dir * rcpDirMin)) * inverseVP;

                vec3 rgbA = 0.5 * (
                    texture(colorBuffer, fragCoord * inverseVP + dir * (1.0 / 3.0 - 0.5)).xyz +
                    texture(colorBuffer, fragCoord * inverseVP + dir * (2.0 / 3.0 - 0.5)).xyz
                );
                vec3 rgbB = rgbA * 0.5 + 0.25 * (
                    texture(colorBuffer, fragCoord * inverseVP + dir * -0.5).xyz +
                    texture(colorBuffer, fragCoord * inverseVP + dir * 0.5).xyz
                );

                return vec4((dot(rgbB, luma) < lumaMin || dot(rgbB, luma) > lumaMax) ? rgbA : rgbB, 1.0);
            }

            void main() {
                vec2 uv = gl_FragCoord.xy / viewportSize;
                vec4 color = doFXAA ? applyFXAA(gl_FragCoord.xy) : texture(colorBuffer, uv);
                vec4 light = texture(lightBuffer, uv);
                vec4 emissive = texture(emissiveBuffer, uv);
                vec4 dirt = texture(dirtBuffer, uv);

                fragColor = (color * light) + (emissive * emissiveMult);

                // Apply dirt using soft light blend mode
                fragColor.rgb = vec3(
                    applySoftLight(fragColor.r, dirt.r),
                    applySoftLight(fragColor.g, dirt.g),
                    applySoftLight(fragColor.b, dirt.b)
                );

                fragColor.rgb = pow(fragColor.rgb, vec3(1.0 / gamma));
            }`,
    },
};

// Initialize all shaders immediately
const Shaders = {};
for (const [name, { vertex, fragment }] of Object.entries(ShaderSources)) {
    try {
        Shaders[name] = new Shader(vertex, fragment);
        Console.log(`Loaded shader: ${name}`);
    } catch (error) {
        Console.error(`Failed to load shader ${name}:`, error);
    }
}

export { Shaders, Shader };
