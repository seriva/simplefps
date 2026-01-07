import Console from "../../systems/console.js";

// GLSL template tag with #include preprocessing
export const glsl = (strings, ...values) => {
	let result = String.raw({ raw: strings }, ...values);
	// Replace #include "name" with actual code
	result = result.replace(/#include\s+"(\w+)"/g, (_, name) => {
		if (_ShaderIncludes[name]) {
			return _ShaderIncludes[name];
		}
		Console.error(`Unknown shader include: "${name}"`);
		return `// ERROR: Unknown include "${name}"`;
	});
	return result;
};

// Shared shader code snippets for #include preprocessing
const _ShaderIncludes = {
	frameDataUBO: glsl`
layout(std140) uniform FrameData {
    mat4 matViewProj;
    mat4 matInvViewProj;
    mat4 matView;
    mat4 matProjection;
    vec4 cameraPosition; // .w = time
    vec4 viewportSize;   // .zw = unused
};`,
	materialDataUBO: glsl`
layout(std140) uniform MaterialData {
    ivec4 flags; // type, doEmissive, doReflection, hasLightmap
    vec4 params; // reflectionStrength, opacity, pad, pad
};`,
	reconstructPosition: glsl`
vec3 reconstructPosition(vec2 uv, float depth) {
    vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 worldPos = matInvViewProj * clipPos;
    return worldPos.xyz / worldPos.w;
}`,
	// Point light falloff calculation - shared between deferred and forward paths
	// Returns vec2(falloff, nDotL) to allow caller to combine with color/intensity
	pointLightCalc: glsl`
vec2 calcPointLight(vec3 lightPos, float lightSize, vec3 fragPos, vec3 normal) {
    vec3 lightDir = lightPos - fragPos;
    float distSq = dot(lightDir, lightDir);
    float sizeSq = lightSize * lightSize;
    if (distSq > sizeSq) return vec2(0.0);
    
    float normalizedDist = sqrt(distSq) / lightSize;
    float falloff = 1.0 - smoothstep(0.0, 1.0, normalizedDist);
    falloff = falloff * falloff;
    
    vec3 L = normalize(lightDir);
    float nDotL = max(0.0, dot(normal, L));
    
    return vec2(falloff * falloff, nDotL);
}`,
	// Spot light attenuation calculation - shared between deferred and forward paths
	// Returns vec3(attenuation, spotFalloff, nDotL) to allow caller to combine
	spotLightCalc: glsl`
vec3 calcSpotLight(vec3 lightPos, vec3 lightDir, float cutoff, float range, vec3 fragPos, vec3 normal) {
    vec3 toLight = lightPos - fragPos;
    float dist = length(toLight);
    if (dist > range) return vec3(0.0);
    
    toLight = normalize(toLight);
    
    float spotEffect = dot(toLight, -normalize(lightDir));
    if (spotEffect < cutoff) return vec3(0.0);
    
    float spotFalloff = (spotEffect - cutoff) / (1.0 - cutoff);
    spotFalloff = smoothstep(0.0, 1.0, spotFalloff);
    
    float attenuation = 1.0 - pow(dist / range, 1.5);
    
    float nDotL = max(0.0, dot(normal, toLight));
    
    return vec3(attenuation, spotFalloff, nDotL);
}`,
};

export const ShaderSources = {
	geometry: {
		vertex: glsl`#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;
            layout(location=1) in vec2 aUV;
            layout(location=2) in vec3 aNormal;
            layout(location=3) in vec2 aLightmapUV;

            #include "frameDataUBO"

            uniform mat4 matWorld;

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


            #include "frameDataUBO"

            #include "materialDataUBO"

            uniform sampler2D colorSampler;
            uniform sampler2D emissiveSampler;
            uniform sampler2D lightmapSampler;
            uniform sampler2D reflectionSampler;
            uniform sampler2D reflectionMaskSampler;
            uniform sampler2D detailNoise;
            uniform bool doDetailTexture;

            const int MESH = 1;
            const int SKYBOX = 2;

            void main() {
                // Early alpha test using textureLod for better performance
                vec4 color = textureLod(colorSampler, vUV, 0.0);
                if(color.a < 0.5) discard;
                
                // Use lightmap if available, but NOT for skybox
                if (flags.w == 1 && flags.x != SKYBOX) {
                    color *= textureLod(lightmapSampler, vLightmapUV, 0.0);
                }

                // Initialize fragEmissive to zero
                fragEmissive = vec4(0.0);

                // Combine type checks to reduce branching
                if (flags.x != SKYBOX) {
                    // Apply Detail Noise
                    if (doDetailTexture && flags.w == 1) {
                        float noise = texture(detailNoise, vUV * 4.0).r;
                        // Modulate color (0.9 to 1.1 range based on noise)
                        color.rgb *= (0.9 + 0.2 * noise);
                    }

                // Store lightmap flag in normal.w for post-processing
                    // 0.0 = use deferred lighting, 1.0 = has lightmap
                    float lightmapFlag = float(flags.w);
                    // Pack normal from [-1,1] to [0,1] for RGBA8 storage
                    fragNormal = vec4(vNormal * 0.5 + 0.5, lightmapFlag);
                    // Output world position directly (w=1.0 for RGBA format)
                    fragPosition = vec4(vPosition.xyz, 1.0);
                } else {
                    fragNormal = vec4(0.5, 0.5, 0.5, 1.0); // Packed zero normal
                    fragPosition = vec4(0.0, 0.0, 0.0, 0.0); // Skybox has no real position
                }

                // Apply reflection if enabled
                if (flags.z == 1) {
                    vec4 reflMask = textureLod(reflectionMaskSampler, vUV, 0.0);
                    float maskSum = dot(reflMask.xyz, vec3(0.333333));  // Faster than multiplication
                    if (maskSum > 0.2) {
                        // Calculate view direction from camera to fragment position in world space
                        vec3 viewDir = normalize(cameraPosition.xyz - vPosition.xyz);
                        // Calculate reflection vector
                        vec3 r = reflect(-viewDir, vNormal);
                        // Convert reflection vector to equirectangular UV coordinates
                        // Using improved formula for better accuracy with epsilon for singularity
                        float m = 2.0 * sqrt(dot(r.xy, r.xy) + (r.z + 1.0) * (r.z + 1.0)) + 0.00001;
                        vec2 reflUV = r.xy / m + 0.5;
                        vec4 reflColor = textureLod(reflectionSampler, reflUV, 0.0);
                        // Blend reflection with base color based on mask and intensity
                        color = mix(color, reflColor * reflMask, params.x * maskSum);
                    }
                }

                if (flags.y == 1) {
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

            #include "frameDataUBO"

            uniform mat4 matWorld;

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

            #include "frameDataUBO"

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
            uniform sampler2D normalBuffer;

            void main() {
                ivec2 fragCoord = ivec2(gl_FragCoord.xy);
                vec4 normalData = texelFetch(normalBuffer, fragCoord, 0);
                // Unpack normal from [0,1] to [-1,1]
                vec3 normal = normalData.xyz * 2.0 - 1.0;
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

            #include "frameDataUBO"

            uniform mat4 matWorld;

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

            #include "frameDataUBO"

            uniform PointLight pointLight;
            uniform sampler2D positionBuffer;
            uniform sampler2D normalBuffer;

            #include "pointLightCalc"

            void main() {
                ivec2 fragCoord = ivec2(gl_FragCoord.xy);
                
                vec3 position = texelFetch(positionBuffer, fragCoord, 0).rgb;
                // Unpack normal from [0,1] to [-1,1]
                vec3 normal = normalize(texelFetch(normalBuffer, fragCoord, 0).xyz * 2.0 - 1.0);

                vec2 pl = calcPointLight(pointLight.position, pointLight.size, position, normal);
                if (pl.x <= 0.0) discard;
                fragColor = vec4(pointLight.color * (pl.x * pl.y * pointLight.intensity), 1.0);
            }`,
	},
	spotLight: {
		vertex: glsl`#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;

            #include "frameDataUBO"

            uniform mat4 matWorld;

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

            #include "frameDataUBO"

            uniform SpotLight spotLight;
            uniform sampler2D positionBuffer;
            uniform sampler2D normalBuffer;

            #include "spotLightCalc"

            void main() {
                ivec2 fragCoord = ivec2(gl_FragCoord.xy);
                
                vec3 position = texelFetch(positionBuffer, fragCoord, 0).rgb;
                // Unpack normal from [0,1] to [-1,1]
                vec3 normal = normalize(texelFetch(normalBuffer, fragCoord, 0).xyz * 2.0 - 1.0);

                vec3 sl = calcSpotLight(spotLight.position, spotLight.direction, spotLight.cutoff, spotLight.range, position, normal);
                if (sl.x <= 0.0) discard;
                fragColor = vec4(spotLight.color * spotLight.intensity * sl.x * sl.y * sl.z, 1.0);
            }`,
	},
	kawaseBlur: {
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

            #include "frameDataUBO"

            uniform sampler2D colorBuffer;
            uniform float offset;

            void main()
            {
                vec2 texelSize = 1.0 / viewportSize.xy;
                vec2 uv = gl_FragCoord.xy * texelSize;
                
                // Kawase blur: sample center + 4 diagonal corners
                // This gives a pleasing blur with only 5 texture samples
                float o = offset + 0.5; // Add 0.5 to leverage bilinear filtering
                
                vec4 color = texture(colorBuffer, uv);
                color += texture(colorBuffer, uv + vec2(-o, -o) * texelSize);
                color += texture(colorBuffer, uv + vec2( o, -o) * texelSize);
                color += texture(colorBuffer, uv + vec2(-o,  o) * texelSize);
                color += texture(colorBuffer, uv + vec2( o,  o) * texelSize);
                
                fragColor = color * 0.2; // Average of 5 samples
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

            #include "frameDataUBO"

            uniform bool doFXAA;
            uniform sampler2D colorBuffer;
            uniform sampler2D lightBuffer;
            uniform sampler2D normalBuffer;
            uniform sampler2D emissiveBuffer;
            uniform sampler2D dirtBuffer;
            uniform sampler2D aoBuffer;
            uniform float emissiveMult;
            uniform float gamma;
            uniform float ssaoStrength;
            uniform float dirtIntensity;
            uniform vec3 uAmbient;

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

            // Simplified FXAA - 5 texture samples instead of 9+
            vec4 applyFXAA(vec2 fragCoord) {
                vec2 inverseVP = 1.0 / viewportSize.xy;
                vec2 uv = fragCoord * inverseVP;

                // Sample center and 4 neighbors
                vec3 rgbM = texture(colorBuffer, uv).rgb;
                vec3 rgbN = texture(colorBuffer, uv + vec2(0.0, -1.0) * inverseVP).rgb;
                vec3 rgbS = texture(colorBuffer, uv + vec2(0.0, 1.0) * inverseVP).rgb;
                vec3 rgbE = texture(colorBuffer, uv + vec2(1.0, 0.0) * inverseVP).rgb;
                vec3 rgbW = texture(colorBuffer, uv + vec2(-1.0, 0.0) * inverseVP).rgb;

                // Luma calculation
                const vec3 luma = vec3(0.299, 0.587, 0.114);
                float lumaM = dot(rgbM, luma);
                float lumaN = dot(rgbN, luma);
                float lumaS = dot(rgbS, luma);
                float lumaE = dot(rgbE, luma);
                float lumaW = dot(rgbW, luma);

                // Compute local contrast
                float lumaMin = min(lumaM, min(min(lumaN, lumaS), min(lumaE, lumaW)));
                float lumaMax = max(lumaM, max(max(lumaN, lumaS), max(lumaE, lumaW)));
                float lumaRange = lumaMax - lumaMin;

                // Early exit if contrast is too low
                if (lumaRange < max(FXAA_EDGE_THRESHOLD_MIN, lumaMax * FXAA_EDGE_THRESHOLD_MAX)) {
                    return vec4(rgbM, 1.0);
                }

                // Determine edge direction
                float edgeH = abs(lumaN + lumaS - 2.0 * lumaM);
                float edgeV = abs(lumaE + lumaW - 2.0 * lumaM);
                bool isHorizontal = edgeH > edgeV;

                // Choose blend direction
                float luma1 = isHorizontal ? lumaN : lumaW;
                float luma2 = isHorizontal ? lumaS : lumaE;
                float gradient1 = abs(luma1 - lumaM);
                float gradient2 = abs(luma2 - lumaM);
                
                vec2 stepDir = isHorizontal ? vec2(0.0, inverseVP.y) : vec2(inverseVP.x, 0.0);
                if (gradient1 < gradient2) stepDir = -stepDir;

                // Blend along edge
                vec3 rgbBlend = texture(colorBuffer, uv + stepDir * 0.5).rgb;
                float blendFactor = smoothstep(0.0, 1.0, lumaRange / lumaMax);
                
                return vec4(mix(rgbM, rgbBlend, blendFactor * 0.5), 1.0);
            }

            void main() {
                vec2 uv = gl_FragCoord.xy / viewportSize.xy;
                ivec2 fragCoord = ivec2(gl_FragCoord.xy);
                
                // Use texelFetch for G-buffer reads (no filtering needed)
                vec4 color = doFXAA ? applyFXAA(gl_FragCoord.xy) : texelFetch(colorBuffer, fragCoord, 0);
                vec4 light = texelFetch(lightBuffer, fragCoord, 0);
                // Unpack normal from [0,1] to [-1,1] (w component is still lightmap flag [0,1])
                vec4 normalData = texelFetch(normalBuffer, fragCoord, 0);
                vec3 normalVec = normalData.xyz * 2.0 - 1.0;
                vec4 normal = vec4(normalVec, normalData.w); // Keep w component as is
                vec4 emissive = texelFetch(emissiveBuffer, fragCoord, 0);
                vec4 dirt = texture(dirtBuffer, uv); // Dirt uses tiled texture, needs filtering
                vec4 ao = texelFetch(aoBuffer, fragCoord, 0);

                // Read lightmap flag from normal.w
                // 1.0 = has lightmap (additive lighting), 0.0 = dynamic object (multiplicative lighting)
                float hasLightmap = normal.w;

                // Hybrid blending:
                // - Lightmapped surfaces: color already has (albedo * lightmap), add dynamic lights
                // - Dynamic objects: color has albedo only, multiply by total lighting
                if (hasLightmap > 0.5) {
                    // Lightmapped surface: add dynamic lights on top of baked lighting
                    vec3 dynamicLight = max(light.rgb - uAmbient, vec3(0.0));
                    fragColor = vec4(color.rgb + dynamicLight, color.a);
                } else {
                    // Non-lightmapped object (FPS mesh):
                    // Use additive lighting model here too to preserve "fullbright" look for weapons
                    // This matches the behavior before refactoring where they were incorrectly treated as lightmapped
                    vec3 dynamicLight = max(light.rgb - uAmbient, vec3(0.0));
                    fragColor = vec4(color.rgb + dynamicLight, color.a);
                }
                
                // Apply SSAO with configurable strength (blend between full brightness and AO)
                float aoFactor = mix(1.0, ao.r, ssaoStrength);
                fragColor.rgb *= aoFactor;
                
                // Add emissive
                fragColor += emissive * emissiveMult;

                // Apply dirt effect with emissive protection
                if (dirtIntensity > 0.0) {
                    // Protect emissive materials from dirt overlay
                    float emissiveStrength = length(emissive.rgb);
                    float emissiveMask = 1.0 - clamp(emissiveStrength * 10.0, 0.0, 1.0);
                    
                    // Invert dirt texture (darker = more dirt) and scale by intensity
                    vec3 dirtAmount = (1.0 - dirt.rgb) * dirtIntensity;
                    dirtAmount = clamp(dirtAmount, 0.0, 1.0);
                    
                    // Apply dirt by darkening
                    vec3 dirtened = fragColor.rgb * (1.0 - dirtAmount);
                    
                    // Mix based on emissive mask (0 = emissive/no dirt, 1 = apply dirt)
                    fragColor.rgb = mix(fragColor.rgb, dirtened, emissiveMask);
                }

                fragColor.rgb = pow(fragColor.rgb, vec3(1.0 / gamma));
            }`,
	},
	transparent: {
		vertex: glsl`#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;
            layout(location=1) in vec2 aUV;
            layout(location=2) in vec3 aNormal;

            #include "frameDataUBO"

            uniform mat4 matWorld;

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

            #include "frameDataUBO"

            #include "materialDataUBO"

            uniform sampler2D colorSampler;
            uniform sampler2D emissiveSampler; 
            
            // Reflection uniforms
            uniform sampler2D reflectionSampler;
            uniform sampler2D reflectionMaskSampler;
            
            // Point lights (max 8)
            #define MAX_POINT_LIGHTS 8
            uniform int numPointLights;
            uniform vec3 pointLightPositions[MAX_POINT_LIGHTS];
            uniform vec3 pointLightColors[MAX_POINT_LIGHTS];
            uniform float pointLightSizes[MAX_POINT_LIGHTS];
            uniform float pointLightIntensities[MAX_POINT_LIGHTS];
            
            // Spot lights (max 4)
            #define MAX_SPOT_LIGHTS 4
            uniform int numSpotLights;
            uniform vec3 spotLightPositions[MAX_SPOT_LIGHTS];
            uniform vec3 spotLightDirections[MAX_SPOT_LIGHTS];
            uniform vec3 spotLightColors[MAX_SPOT_LIGHTS];
            uniform float spotLightIntensities[MAX_SPOT_LIGHTS];
            uniform float spotLightCutoffs[MAX_SPOT_LIGHTS];
            uniform float spotLightRanges[MAX_SPOT_LIGHTS];

            #include "pointLightCalc"
            #include "spotLightCalc"

            vec3 calculatePointLight(int i, vec3 normal, vec3 fragPos) {
                vec2 pl = calcPointLight(pointLightPositions[i], pointLightSizes[i], fragPos, normal);
                return pointLightColors[i] * (pl.x * pl.y * pointLightIntensities[i]);
            }

            vec3 calculateSpotLight(int i, vec3 normal, vec3 fragPos) {
                vec3 sl = calcSpotLight(spotLightPositions[i], spotLightDirections[i], spotLightCutoffs[i], spotLightRanges[i], fragPos, normal);
                return spotLightColors[i] * (spotLightIntensities[i] * 2.0) * sl.x * sl.y * sl.z;
            }

            void main() {
                vec4 color = texture(colorSampler, vUV);
                vec4 emissive = texture(emissiveSampler, vUV);
                // Simple additive emissive for now, or just to keep uniform active
                color.rgb += emissive.rgb;
                color.a *= params.y; // opacity

                // Two-sided lighting: flip normal for backfaces
                vec3 normal = normalize(vNormal);
                if (!gl_FrontFacing) normal = -normal;
                vec3 fragPos = vPosition.xyz;
                
                // Apply reflection if enabled
                if (flags.z == 1) { // doReflection
                    vec4 reflMask = textureLod(reflectionMaskSampler, vUV, 0.0);
                    float maskSum = dot(reflMask.xyz, vec3(0.333333));
                    if (maskSum > 0.1) {
                        vec3 viewDir = normalize(cameraPosition.xyz - fragPos);
                        vec3 r = reflect(-viewDir, normal);
                        // Add epsilon to prevent singularity at r.z = -1
                        float m = 2.0 * sqrt(dot(r.xy, r.xy) + (r.z + 1.0) * (r.z + 1.0)) + 0.00001;
                        vec2 reflUV = r.xy / m + 0.5;
                        vec4 reflColor = textureLod(reflectionSampler, reflUV, 0.0);
                        color = mix(color, reflColor * reflMask, params.x * maskSum); // reflectionStrength
                    }
                }

                // Calculate dynamic lighting contribution (additive on top of base)
                vec3 dynamicLighting = vec3(0.0);
                
                // Add point lights contribution
                for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
                    if (i >= numPointLights) break;
                    dynamicLighting += calculatePointLight(i, normal, fragPos);
                }
                
                // Add spot lights contribution
                for (int i = 0; i < MAX_SPOT_LIGHTS; i++) {
                    if (i >= numSpotLights) break;
                    dynamicLighting += calculateSpotLight(i, normal, fragPos);
                }

                // Apply base color with dynamic lighting added on top
                // Hardcoded ambient approximation (0.5) to avoid uniform issues and fix brightness
                fragColor = vec4(color.rgb * 0.5 + color.rgb * dynamicLighting, color.a);
            }`,
	},
	ssao: {
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
            
            #include "frameDataUBO"

            uniform sampler2D normalBuffer;
            uniform sampler2D positionBuffer;
            uniform sampler2D noiseTexture;
            uniform vec2 noiseScale;
            uniform float radius;
            uniform float bias;
            uniform vec3 uKernel[16];

            void main()
            {
                vec2 uv = gl_FragCoord.xy / viewportSize.xy;
                ivec2 fragCoord = ivec2(gl_FragCoord.xy);
                
                // Read position and normal from G-buffer
                vec3 fragPos = texelFetch(positionBuffer, fragCoord, 0).rgb;
                vec4 normalData = texelFetch(normalBuffer, fragCoord, 0);
                vec3 normal = normalData.xyz * 2.0 - 1.0;
                float hasLightmap = normalData.w;
                
                // Skip skybox or non-lightmapped objects
                if (length(normal) < 0.1 || hasLightmap < 0.5) {
                    fragColor = vec4(1.0);
                    return;
                }
                
                // Calculate linear depth for range checks
                float currentLinearDepth = length(fragPos - cameraPosition.xyz);

                // Random vector for rotation
                vec3 randomVec = texture(noiseTexture, uv * noiseScale).xyz;
                randomVec = randomVec * 2.0 - 1.0;
                
                // Create TBN matrix
                vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal));
                vec3 bitangent = cross(normal, tangent);
                mat3 TBN = mat3(tangent, bitangent, normal);
                
                float occlusion = 0.0;
                
                for(int i = 0; i < 16; ++i)
                {
                    // get sample position
                    vec3 samplePos = TBN * uKernel[i];
                    samplePos = fragPos + samplePos * radius; 
                    
                    // project sample position
                    vec4 offset = vec4(samplePos, 1.0);
                    offset = matViewProj * offset;
                    offset.xyz /= offset.w;
                    offset.xy = offset.xy * 0.5 + 0.5;
                    
                    // Read position at sample location
                    ivec2 sampleCoord = ivec2(offset.xy * viewportSize.xy);
                    vec3 sampleWorldPos = texelFetch(positionBuffer, sampleCoord, 0).rgb;
                    float sampleLinearDepth = length(sampleWorldPos - cameraPosition.xyz);
                    
                    float sampleDist = length(samplePos - cameraPosition.xyz);

                    // Range check
                    float rangeCheck = smoothstep(0.0, 1.0, radius / abs(currentLinearDepth - sampleLinearDepth));
                    
                    // Check if sample is occluded
                    occlusion += (sampleLinearDepth <= sampleDist - bias ? 1.0 : 0.0) * rangeCheck;
                }
                
                occlusion = 1.0 - (occlusion / 16.0);
                fragColor = vec4(occlusion, occlusion, occlusion, 1.0);
            }`,
	},
	debug: {
		vertex: glsl`#version 300 es
            precision highp float;

            layout(location=0) in vec3 aPosition;

            #include "frameDataUBO"

            uniform mat4 matWorld;

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
