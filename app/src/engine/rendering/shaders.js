import { gl } from "../core/context.js";
import Console from "../systems/console.js";

// ============================================================================
// Public API
// ============================================================================

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
			Console.error(
				`Error linking program: ${gl.getProgramInfoLog(this.program)}`,
			);
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

// ============================================================================
// Private
// ============================================================================

const glsl = (x) => x;

const _ShaderSources = {
	geometry: {
		vertex: glsl`#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;
            layout(location=1) in vec2 aUV;
            layout(location=2) in vec3 aNormal;
            layout(location=3) in vec2 aLightmapUV;

            uniform mat4 matWorld;
            uniform mat4 matViewProj;

            out vec4 vPosition;
            out vec3 vNormal;
            out vec2 vUV;
            out vec2 vLightmapUV;

            const int MESH = 1;
            const int SKYBOX = 2;

            void main() {
                vPosition = matWorld * vec4(aPosition, 1.0);

                vUV = aUV;
                vLightmapUV = aLightmapUV;
                vNormal = normalize(mat3(matWorld) * aNormal);

                gl_Position = matViewProj * vPosition;
            }`,
		fragment: glsl`#version 300 es
            precision highp float;
            precision highp int;

            in vec4 vPosition;
            in vec3 vNormal;
            in vec2 vUV;
            in vec2 vLightmapUV;

            layout(location=0) out vec4 fragPosition;
            layout(location=1) out vec4 fragNormal;
            layout(location=2) out vec4 fragColor;
            layout(location=3) out vec4 fragEmissive;

            uniform int geomType;
            uniform int doEmissive;
            uniform int doSEM;
            uniform int hasLightmap;
            uniform float semMult;

            uniform vec3 cameraPosition;
            uniform sampler2D colorSampler;
            uniform sampler2D emissiveSampler;
            uniform sampler2D lightmapSampler;
            uniform sampler2D semSampler;
            uniform sampler2D semApplySampler;

            const int MESH = 1;
            const int SKYBOX = 2;

            void main() {
                // Early alpha test using textureLod for better performance
                vec4 color = textureLod(colorSampler, vUV, 0.0);
                if(color.a < 0.5) discard;
                
                // Use lightmap if available, but NOT for skybox
                if (hasLightmap == 1 && geomType != SKYBOX) {
                    color *= textureLod(lightmapSampler, vLightmapUV, 0.0);
                }

                // Initialize fragEmissive to zero
                fragEmissive = vec4(0.0);

                // Combine geomType checks to reduce branching
                if (geomType != SKYBOX) {
                    fragPosition = vPosition;
                    // Store lightmap flag in normal.w for post-processing
                    // 0.0 = use deferred lighting, 1.0 = has lightmap
                    float lightmapFlag = float(hasLightmap);
                    fragNormal = vec4(vNormal, lightmapFlag);
                } else {
                    fragNormal = vec4(0.0, 0.0, 0.0, 1.0);
                }

                // Combine SEM and emissive calculations
                if (doSEM == 1) {
                    vec4 semApply = textureLod(semApplySampler, vUV, 0.0);
                    float semSum = dot(semApply.xyz, vec3(0.333333));  // Faster than multiplication
                    if (semSum > 0.2) {
                        // Calculate view direction from camera to fragment position in world space
                        vec3 viewDir = normalize(cameraPosition - vPosition.xyz);
                        // Calculate reflection vector
                        vec3 r = reflect(-viewDir, vNormal);
                        // Convert reflection vector to equirectangular UV coordinates
                        // Using improved formula for better accuracy
                        float m = 2.0 * sqrt(dot(r.xy, r.xy) + (r.z + 1.0) * (r.z + 1.0));
                        vec2 semUV = r.xy / m + 0.5;
                        vec4 semColor = textureLod(semSampler, semUV, 0.0);
                        // Blend reflection with base color based on semApply mask and intensity
                        color = mix(color, semColor * semApply, semMult * semSum);
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
            uniform sampler2D normalBuffer;

            void main() {
                vec2 uv = gl_FragCoord.xy / viewportSize;
                vec4 normalData = texture(normalBuffer, uv);
                vec3 normal = normalData.xyz;
                float lightmapFlag = normalData.w;
                float isSkybox = normalData.w;

                // Skip lightmapped surfaces (lightmapFlag > 0.5)
                // Directional lights should only affect dynamic objects
                if (lightmapFlag > 0.5) {
                    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }

                // Calculate light intensity only if not a skybox and not lightmapped
                vec3 lightIntensity = mix(
                    directionalLight.color * max(dot(normalize(normal), normalize(directionalLight.direction)), 0.0),
                    vec3(0.0),
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

            uniform mat4 matWorld;
            uniform mat4 matViewProj;

            void main()
            {
                gl_Position = matViewProj * matWorld * vec4(aPosition, 1.0);
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

            uniform PointLight pointLight;
            uniform sampler2D positionBuffer;
            uniform sampler2D normalBuffer;

            void main() {
                ivec2 fragCoord = ivec2(gl_FragCoord.xy);
                vec3 position = texelFetch(positionBuffer, fragCoord, 0).xyz;
                vec3 normal = normalize(texelFetch(normalBuffer, fragCoord, 0).xyz);

                vec3 lightDir = pointLight.position - position;
                float distSq = dot(lightDir, lightDir);
                float sizeSq = pointLight.size * pointLight.size;

                if (distSq > sizeSq) discard;

                float normalizedDist = sqrt(distSq) / pointLight.size;
                float falloff = 1.0 - smoothstep(0.0, 1.0, normalizedDist);
                falloff = falloff * falloff;

                vec3 L = normalize(lightDir);
                float nDotL = max(0.0, dot(normal, L));

                fragColor = vec4(pointLight.color * (falloff * falloff * nDotL * pointLight.intensity), 1.0);
            }`,
	},
	spotLight: {
		vertex: glsl`#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;

            uniform mat4 matWorld;
            uniform mat4 matViewProj;

            void main() {
                gl_Position = matViewProj * matWorld * vec4(aPosition, 1.0);
            }`,
		fragment: glsl`#version 300 es
            precision highp float;
            precision highp int;

            struct SpotLight {
                vec3 position;
                vec3 direction;
                vec3 color;
                float intensity;
                float cutoff;
                float range;
            };

            layout(location=0) out vec4 fragColor;

            uniform SpotLight spotLight;
            uniform sampler2D positionBuffer;
            uniform sampler2D normalBuffer;

            void main() {
                ivec2 fragCoord = ivec2(gl_FragCoord.xy);
                vec3 position = texelFetch(positionBuffer, fragCoord, 0).xyz;
                vec3 normal = normalize(texelFetch(normalBuffer, fragCoord, 0).xyz);

                vec3 lightDir = spotLight.position - position;
                float dist = length(lightDir);

                if (dist > spotLight.range) discard;

                lightDir = normalize(lightDir);

                float spotEffect = dot(lightDir, -normalize(spotLight.direction));
                if (spotEffect < spotLight.cutoff) discard;

                float spotFalloff = (spotEffect - spotLight.cutoff) / (1.0 - spotLight.cutoff);
                spotFalloff = smoothstep(0.0, 1.0, spotFalloff);

                float attenuation = 1.0 - pow(dist / spotLight.range, 1.5);

                float nDotL = max(0.0, dot(normal, lightDir));

                fragColor = vec4(spotLight.color * (spotLight.intensity * 2.0) *
                                 attenuation * spotFalloff * nDotL, 1.0);
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
            uniform sampler2D normalBuffer;
            uniform sampler2D emissiveBuffer;
            uniform sampler2D dirtBuffer;
            uniform vec2 viewportSize;
            uniform float emissiveMult;
            uniform float gamma;
            uniform vec3 ambient;

            #define FXAA_EDGE_THRESHOLD_MIN 0.0312
            #define FXAA_EDGE_THRESHOLD_MAX 0.125
            #define FXAA_ITERATIONS 12
            #define FXAA_SUBPIX_QUALITY 0.75
            #define FXAA_SUBPIX_TRIM 0.5

            float applySoftLight(float base, float blend) {
                return (blend < 0.5)
                    ? (2.0 * base * blend + base * base * (1.0 - 2.0 * blend))
                    : (sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend));
            }

            vec4 applyFXAA(vec2 fragCoord) {
                vec2 inverseVP = 1.0 / viewportSize;
                vec2 uv = fragCoord * inverseVP;

                // Sample neighboring pixels
                vec3 rgbNW = texture(colorBuffer, uv + vec2(-1.0, -1.0) * inverseVP).rgb;
                vec3 rgbNE = texture(colorBuffer, uv + vec2(1.0, -1.0) * inverseVP).rgb;
                vec3 rgbSW = texture(colorBuffer, uv + vec2(-1.0, 1.0) * inverseVP).rgb;
                vec3 rgbSE = texture(colorBuffer, uv + vec2(1.0, 1.0) * inverseVP).rgb;
                vec3 rgbM  = texture(colorBuffer, uv).rgb;

                // Luma calculation with more accurate weights
                const vec3 luma = vec3(0.2126729, 0.7151522, 0.0721750);
                float lumaNW = dot(rgbNW, luma);
                float lumaNE = dot(rgbNE, luma);
                float lumaSW = dot(rgbSW, luma);
                float lumaSE = dot(rgbSE, luma);
                float lumaM  = dot(rgbM,  luma);

                // Compute local contrast
                float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
                float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
                float lumaRange = lumaMax - lumaMin;

                // Early exit if contrast is too low
                if (lumaRange < max(FXAA_EDGE_THRESHOLD_MIN, lumaMax * FXAA_EDGE_THRESHOLD_MAX)) {
                    return vec4(rgbM, 1.0);
                }

                // Edge detection
                vec2 dir;
                dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
                dir.y = ((lumaNW + lumaSW) - (lumaNE + lumaSE));

                float dirReduce = max(
                    (lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_SUBPIX_TRIM),
                    FXAA_EDGE_THRESHOLD_MIN
                );

                float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
                dir = min(vec2(8.0), max(vec2(-8.0), dir * rcpDirMin)) * inverseVP;

                // Sample along the gradient
                vec3 rgbA = 0.5 * (
                    texture(colorBuffer, uv + dir * (1.0/3.0 - 0.5)).rgb +
                    texture(colorBuffer, uv + dir * (2.0/3.0 - 0.5)).rgb
                );

                vec3 rgbB = rgbA * 0.5 + 0.25 * (
                    texture(colorBuffer, uv + dir * -0.5).rgb +
                    texture(colorBuffer, uv + dir * 0.5).rgb
                );

                // Compute local contrast for samples
                float lumaB = dot(rgbB, luma);

                // Choose final color based on subpixel quality
                if (lumaB < lumaMin || lumaB > lumaMax) {
                    return vec4(rgbA, 1.0);
                }

                // Subpixel antialiasing
                float lumaL = dot(rgbM, luma);
                float rangeL = abs(lumaL - lumaMin);
                float rangeH = abs(lumaL - lumaMax);
                float range = min(rangeL, rangeH);
                float rangeInv = 1.0/range;

                // Compute subpixel blend factor
                float blend = smoothstep(0.0, 1.0, range * rangeInv);
                blend = mix(blend, 1.0, FXAA_SUBPIX_QUALITY);

                // Final blend
                return vec4(mix(rgbB, rgbM, blend), 1.0);
            }

            void main() {
                vec2 uv = gl_FragCoord.xy / viewportSize;
                vec4 color = doFXAA ? applyFXAA(gl_FragCoord.xy) : texture(colorBuffer, uv);
                vec4 light = texture(lightBuffer, uv);
                vec4 normal = texture(normalBuffer, uv);
                vec4 emissive = texture(emissiveBuffer, uv);
                vec4 dirt = texture(dirtBuffer, uv);

                // Read lightmap flag from normal.w
                // 1.0 = has lightmap (additive lighting), 0.0 = dynamic object (multiplicative lighting)
                float hasLightmap = normal.w;

                // Hybrid blending:
                // - Lightmapped surfaces: color already has (albedo * lightmap), add dynamic lights
                // - Dynamic objects: color has albedo only, multiply by total lighting
                if (hasLightmap > 0.5) {
                    // Lightmapped surface: add dynamic lights on top of baked lighting
                    // Subtract ambient so we only add the dynamic contribution
                    vec3 dynamicLight = max(light.rgb - ambient, vec3(0.0));
                    fragColor = vec4(color.rgb + dynamicLight, color.a);
                } else {
                    // Dynamic object: standard deferred lighting
                    fragColor = color * light;
                }
                
                // Add emissive
                fragColor += emissive * emissiveMult;

                // Apply dirt using soft light blend mode
                // fragColor.rgb = vec3(
                //     applySoftLight(fragColor.r, dirt.r),
                //     applySoftLight(fragColor.g, dirt.g),
                //     applySoftLight(fragColor.b, dirt.b)
                // );

                fragColor.rgb = pow(fragColor.rgb, vec3(1.0 / gamma));
            }`,
	},
	glass: {
		vertex: glsl`#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;
            layout(location=1) in vec2 aUV;
            layout(location=2) in vec3 aNormal;

            uniform mat4 matWorld;
            uniform mat4 matViewProj;

            out vec2 vUV;
            out vec3 vNormal;
            out vec4 vPosition;

            void main() {
                vUV = aUV;
                vPosition = matWorld * vec4(aPosition, 1.0);
                vNormal = normalize(mat3(matWorld) * aNormal);
                gl_Position = matViewProj * vPosition;
            }`,
		fragment: glsl`#version 300 es
            precision highp float;
            precision highp int;

            in vec2 vUV;
            in vec3 vNormal;
            in vec4 vPosition;

            layout(location=0) out vec4 fragColor;

            uniform sampler2D colorSampler;
            uniform float opacity;
            
            // SEM uniforms
            uniform int doSEM;
            uniform float semMult;
            uniform sampler2D semSampler;
            uniform sampler2D semApplySampler;
            uniform vec3 cameraPosition;

            void main() {
                vec4 color = texture(colorSampler, vUV);
                
                // Apply SEM if enabled
                if (doSEM == 1) {
                    vec4 semApply = textureLod(semApplySampler, vUV, 0.0);
                    float semSum = dot(semApply.xyz, vec3(0.333333));
                    if (semSum > 0.1) { // Slightly lowered threshold
                        vec3 viewDir = normalize(cameraPosition - vPosition.xyz);
                        vec3 r = reflect(-viewDir, vNormal);
                        float m = 2.0 * sqrt(dot(r.xy, r.xy) + (r.z + 1.0) * (r.z + 1.0));
                        vec2 semUV = r.xy / m + 0.5;
                        vec4 semColor = textureLod(semSampler, semUV, 0.0);
                        color = mix(color, semColor * semApply, semMult * semSum);
                    }
                }

                fragColor = vec4(color.rgb, color.a * opacity);
            }`,
	},
	debug: {
		vertex: glsl`#version 300 es
            precision highp float;

            layout(location=0) in vec3 aPosition;

            uniform mat4 matWorld;
            uniform mat4 matViewProj;

            void main() {
                gl_Position = matViewProj * matWorld * vec4(aPosition, 1.0);
            }`,
		fragment: glsl`#version 300 es
            precision highp float;

            layout(location=0) out vec4 fragColor;

            uniform vec4 debugColor;

            void main() {
                fragColor = debugColor;
            }`,
	},
};

// Initialize all shaders immediately
const Shaders = {};
for (const [name, { vertex, fragment }] of Object.entries(_ShaderSources)) {
	try {
		Shaders[name] = new Shader(vertex, fragment);
		Console.log(`Loaded shader: ${name}`);
	} catch (error) {
		Console.error(`Failed to load shader ${name}:`, error);
	}
}

export { Shaders, Shader };
