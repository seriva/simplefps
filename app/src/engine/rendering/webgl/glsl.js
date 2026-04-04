// =========================================================================
// Shared GLSL code snippets (for template interpolation)
// =========================================================================

const _octEncode = /* glsl */ `
vec2 octEncode(vec3 n) {
    n /= abs(n.x) + abs(n.y) + abs(n.z);
    if (n.z < 0.0) n.xy = (1.0 - abs(n.yx)) * sign(n.xy);
    return n.xy * 0.5 + 0.5;
}`;

const _octDecode = /* glsl */ `
vec3 octDecode(vec2 f) {
    f = f * 2.0 - 1.0;
    vec3 n = vec3(f, 1.0 - abs(f.x) - abs(f.y));
    if (n.z < 0.0) n.xy = (1.0 - abs(n.yx)) * sign(n.xy);
    return normalize(n);
}`;

const _frameDataUBO = /* glsl */ `
layout(std140) uniform FrameData {
    mat4 matViewProj;
    mat4 matInvViewProj;
    mat4 matView;
    mat4 matProjection;
    vec4 cameraPosition; // .w = time
    vec4 viewportSize;   // .zw = unused
};`;

const _materialDataUBO = /* glsl */ `
layout(std140) uniform MaterialData {
    ivec4 flags; // type, doEmissive, doReflection, hasLightmap
    vec4 params; // reflectionStrength, opacity, pad, pad
};`;

// Point light falloff calculation - shared between deferred and forward paths
// Returns vec2(falloff, nDotL) to allow caller to combine with color/intensity
const _pointLightCalc = /* glsl */ `
vec2 calcPointLight(vec3 lightPos, float lightSize, vec3 fragPos, vec3 normal) {
    vec3 lightDir = lightPos - fragPos;
    float distSq = dot(lightDir, lightDir);
    float sizeSq = lightSize * lightSize;
    if (distSq > sizeSq) return vec2(0.0);
    
    float normalizedDist = sqrt(distSq) / lightSize;
    float falloff = 1.0 - smoothstep(0.0, 1.0, normalizedDist);

    vec3 L = normalize(lightDir);
    float nDotL = max(0.0, dot(normal, L));

    return vec2(falloff * falloff, nDotL);
}`;

// Spot light attenuation calculation - shared between deferred and forward paths
// Returns vec3(attenuation, spotFalloff, nDotL) to allow caller to combine
const _spotLightCalc = /* glsl */ `
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
}`;

// Skinning vertex attributes - shared between all skinned shaders
const _skinningInputs = /* glsl */ `
layout(location=4) in uvec4 aJointIndices;
layout(location=5) in vec4 aJointWeights;`;

// Skinning uniform - bone matrices array
const _skinningUniform = /* glsl */ `
uniform mat4 boneMatrices[64];`;

// Skinning calculation - computes skinMatrix from bone weights
// Requires: aJointIndices, aJointWeights, boneMatrices to be declared
const _skinningCalc = /* glsl */ `
    // Convert uint indices to int for array indexing
    ivec4 joints = ivec4(aJointIndices);
    
    // Compute skinning matrix from bone weights
    mat4 skinMatrix = 
        boneMatrices[joints.x] * aJointWeights.x +
        boneMatrices[joints.y] * aJointWeights.y +
        boneMatrices[joints.z] * aJointWeights.z +
        boneMatrices[joints.w] * aJointWeights.w;`;

// Debug fragment shader - shared between debug and skinnedDebug
const _debugFragment = /* glsl */ `#version 300 es
            precision highp float;

            layout(location=0) out vec4 fragColor;

            uniform vec4 debugColor;

            void main() {
                fragColor = debugColor;
            }`;

// Shadow fragment shader - shared between entityShadows and skinnedEntityShadows
const _shadowFragment = /* glsl */ `#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) out vec4 fragColor;

            uniform vec3 ambient;

            void main()
            {
                fragColor = vec4(ambient, 1.0);
            }`;

// Shared geometry fragment shader (used by both geometry and skinnedGeometry)
const _geometryFragment = /* glsl */ `#version 300 es
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


            ${_frameDataUBO}

            ${_materialDataUBO}

            uniform sampler2D colorSampler;
            uniform sampler2D emissiveSampler;
            uniform sampler2D lightmapSampler;
            uniform sampler2D reflectionSampler;
            uniform sampler2D reflectionMaskSampler;
            uniform sampler2D proceduralNoise;
            uniform bool doProceduralDetail;
            uniform vec3 uProbeColor;

            ${_octEncode}

            const int MESH = 1;
            const int SKYBOX = 2;

            void main() {
                // Early alpha test using textureLod for better performance
                vec4 color = textureLod(colorSampler, vUV, 0.0);
                if(color.a < 0.5) discard;
                
                // Initialize normal from varying
                vec3 N = normalize(vNormal);
                
                // Apply Probe Color (only for non-lightmapped objects)
                if (flags.w == 0) {
                     color.rgb *= uProbeColor;
                }
                
                // Use lightmap if available, but NOT for skybox
                if (flags.w == 1 && flags.x != SKYBOX) {
                    color *= textureLod(lightmapSampler, vLightmapUV, 0.0);
                }

                // Initialize fragEmissive to zero
                fragEmissive = vec4(0.0);

                // Combine type checks to reduce branching
                if (flags.x != SKYBOX) {
                     // Apply Detail Texture (Normal + Parallax)
                    if (doProceduralDetail && flags.w == 1) {
                        float dist = length(cameraPosition.xyz - vPosition.xyz);
                        float detailFade = 1.0 - smoothstep(100.0, 500.0, dist);

                        // Calculate TBN (Must be done in uniform control flow or close to it for better results)
                        vec3 dp1 = dFdx(vPosition.xyz);
                        vec3 dp2 = dFdy(vPosition.xyz);
                        vec2 duv1 = dFdx(vUV);
                        vec2 duv2 = dFdy(vUV);

                        if (detailFade > 0.01) {
                            vec3 dp2perp = cross(dp2, N);
                            vec3 dp1perp = cross(N, dp1);
                            vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
                            vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
                            float invmax = inversesqrt(max(dot(T,T), dot(B,B)));
                            mat3 TBN = mat3(T * invmax, B * invmax, N);
                            
                            // Parallax Mapping
                            vec3 viewDir = normalize(cameraPosition.xyz - vPosition.xyz);
                            vec3 tangentViewDir = normalize(transpose(TBN) * viewDir);
                            
                            vec2 uv1 = vUV * 4.0;
                            mat2 rot = mat2(0.829, -0.559, 0.559, 0.829); // ~34 deg
                            vec2 uv2 = rot * (vUV * 7.37) + vec2(0.43, 0.81);
                            
                            float h1 = texture(proceduralNoise, uv1).a;
                            vec2 parallaxOffset = tangentViewDir.xy * (h1 * 0.02 * detailFade);
                            
                            // Dual Layer Sampling
                            vec4 s1 = texture(proceduralNoise, uv1 - parallaxOffset);
                            vec4 s2 = texture(proceduralNoise, uv2 - parallaxOffset);
                            
                            // Blend Normals & Height
                            vec3 detailNormal = normalize((s1.rgb * 2.0 - 1.0) + (s2.rgb * 2.0 - 1.0));
                            float height = (s1.a + s2.a) * 0.5;
                            vec3 surfaceNormal = normalize(TBN * detailNormal);
                            
                            // Modulation
                            vec3 p = vPosition.xyz;
                            float macroVar = sin(p.x * 0.13 + p.z * 0.07) + sin(p.z * 0.11 - p.x * 0.05) + sin(p.y * 0.1);
                            float macroFactor = (macroVar / 3.0) * 0.5 + 0.5;
                            
                            // Occlusion
                            float occlusion = clamp(dot(surfaceNormal, N), 0.5, 1.0) * mix(0.5, 1.0, height);
                            float modFactor = detailFade * (0.3 + 0.7 * macroFactor);
                            
                            color.rgb *= mix(1.0, occlusion, modFactor);
                            N = normalize(mix(N, surfaceNormal, 0.5 * detailFade));
                        }
                    }

                    fragNormal = vec4(octEncode(N), 0.0, 0.0);
                    fragPosition = vec4(vPosition.xyz, 1.0);
                } else {
                    fragNormal = vec4(0.5, 0.5, 0.0, 0.0); // oct-encode of (0,0,1)
                    fragPosition = vec4(0.0, 0.0, 0.0, 0.0); // Skybox has no real position
                }

                // Lightmap flag: skybox counts as 1.0 (skip deferred lights), else use material flag
                float lightmapFlag = (flags.x == SKYBOX) ? 1.0 : float(flags.w);

                // Apply reflection if enabled
                if (flags.z == 1) {
                    vec4 reflMask = textureLod(reflectionMaskSampler, vUV, 0.0);
                    float maskSum = dot(reflMask.xyz, vec3(0.333333));  // Faster than multiplication
                    if (maskSum > 0.2) {
                        // Calculate view direction from camera to fragment position in world space
                        vec3 viewDir = normalize(cameraPosition.xyz - vPosition.xyz);
                        // Calculate reflection vector
                        vec3 r = reflect(-viewDir, N);
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

                fragColor = vec4((color + fragEmissive).rgb, lightmapFlag);
            }`;

export const ShaderSources = {
	geometry: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;
            layout(location=1) in vec2 aUV;
            layout(location=2) in vec3 aNormal;
            layout(location=3) in vec2 aLightmapUV;

            ${_frameDataUBO}

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
		fragment: _geometryFragment,
	},
	skinnedGeometry: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;
            layout(location=1) in vec2 aUV;
            layout(location=2) in vec3 aNormal;
            layout(location=3) in vec2 aLightmapUV;
            ${_skinningInputs}

            ${_frameDataUBO}

            uniform mat4 matWorld;
            ${_skinningUniform}

            out vec4 vPosition;
            out vec3 vNormal;
            out vec2 vUV;
            out vec2 vLightmapUV;

            void main() {
                ${_skinningCalc}

                // Apply skinning to position and normal
                vec3 skinnedPosition = (skinMatrix * vec4(aPosition, 1.0)).xyz;
                vec3 skinnedNormal = mat3(skinMatrix) * aNormal;

                vPosition = matWorld * vec4(skinnedPosition, 1.0);
                vNormal = normalize(mat3(matWorld) * skinnedNormal);
                vUV = aUV;
                vLightmapUV = aLightmapUV;

                gl_Position = matViewProj * vPosition;
            }`,
		fragment: _geometryFragment,
	},
	entityShadows: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;

            ${_frameDataUBO}

            uniform mat4 matWorld;

            void main()
            {
                gl_Position = matViewProj * matWorld * vec4(aPosition, 1.0);
            }`,
		fragment: _shadowFragment,
	},
	skinnedEntityShadows: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;
            ${_skinningInputs}

            ${_frameDataUBO}

            uniform mat4 matWorld;
            uniform float shadowHeight;
            ${_skinningUniform}

            void main()
            {
                ${_skinningCalc}

                vec3 skinnedPosition = (skinMatrix * vec4(aPosition, 1.0)).xyz;
                // Transform to world space
                vec4 worldPos = matWorld * vec4(skinnedPosition, 1.0);
                // Flatten to shadow height
                worldPos.y = shadowHeight;
                gl_Position = matViewProj * worldPos;
            }`,
		fragment: _shadowFragment,
	},
	directionalLight: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;

            layout(location=0) in vec3 aPosition;

            void main()
            {
                gl_Position = vec4(aPosition, 1.0);
            }`,
		fragment: /* glsl */ `#version 300 es
            precision highp float;

            struct DirectionalLight {
                vec3 direction;
                vec3 color;
            };

            layout(location=0) out vec4 fragColor;

            uniform DirectionalLight directionalLight;
            uniform sampler2D normalBuffer;
            uniform sampler2D colorBuffer;

            ${_octDecode}

            void main() {
                ivec2 fragCoord = ivec2(gl_FragCoord.xy);
                float hasLightmap = texelFetch(colorBuffer, fragCoord, 0).a;

                // Skip lightmapped surfaces — directional lights only affect dynamic objects
                if (hasLightmap > 0.5) {
                    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }

                vec3 normal = octDecode(texelFetch(normalBuffer, fragCoord, 0).rg);
                vec3 lightIntensity = directionalLight.color * max(dot(normal, normalize(directionalLight.direction)), 0.0);
                fragColor = vec4(lightIntensity, 1.0);
            }`,
	},
	pointLight: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;

            ${_frameDataUBO}

            uniform mat4 matWorld;

            void main()
            {
                gl_Position = matViewProj * matWorld * vec4(aPosition, 1.0);
            }`,
		fragment: /* glsl */ `#version 300 es
            precision highp float;
            precision highp int;

			struct PointLight {
                vec3 position;
                vec3 color;
                float size;
                float intensity;
            };

            layout(location=0) out vec4 fragColor;

            ${_frameDataUBO}

            uniform PointLight pointLight;
            uniform sampler2D positionBuffer;
            uniform sampler2D normalBuffer;

            ${_octDecode}
            ${_pointLightCalc}

            void main() {
                ivec2 fragCoord = ivec2(gl_FragCoord.xy);

                vec3 position = texelFetch(positionBuffer, fragCoord, 0).rgb;
                vec3 normal = octDecode(texelFetch(normalBuffer, fragCoord, 0).rg);

                vec2 pl = calcPointLight(pointLight.position, pointLight.size, position, normal);
                if (pl.x <= 0.0) discard;
                fragColor = vec4(pointLight.color * (pl.x * pl.y * pointLight.intensity), 1.0);
            }`,
	},
	spotLight: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;

            ${_frameDataUBO}

            uniform mat4 matWorld;

            void main() {
                gl_Position = matViewProj * matWorld * vec4(aPosition, 1.0);
            }`,
		fragment: /* glsl */ `#version 300 es
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

            ${_frameDataUBO}

            uniform SpotLight spotLight;
            uniform sampler2D positionBuffer;
            uniform sampler2D normalBuffer;

            ${_octDecode}
            ${_spotLightCalc}

            void main() {
                ivec2 fragCoord = ivec2(gl_FragCoord.xy);

                vec3 position = texelFetch(positionBuffer, fragCoord, 0).rgb;
                vec3 normal = octDecode(texelFetch(normalBuffer, fragCoord, 0).rg);

                vec3 sl = calcSpotLight(spotLight.position, spotLight.direction, spotLight.cutoff, spotLight.range, position, normal);
                if (sl.x <= 0.0) discard;
                fragColor = vec4(spotLight.color * spotLight.intensity * sl.x * sl.y * sl.z, 1.0);
            }`,
	},
	kawaseBlur: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;

            layout(location=0) in vec3 aPosition;

            void main()
            {
                gl_Position = vec4(aPosition, 1.0);
            }`,
		fragment: /* glsl */ `#version 300 es
            precision highp float;

            out vec4 fragColor;

            ${_frameDataUBO}

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
		vertex: /* glsl */ `#version 300 es
            precision highp float;

            layout(location=0) in vec3 aPosition;

            void main()
            {
                gl_Position = vec4(aPosition, 1.0);
            }`,
		fragment: /* glsl */ `#version 300 es
            precision highp float;

            layout(std140, column_major) uniform;

            out vec4 fragColor;
 
            ${_frameDataUBO}
 
            uniform sampler2D colorBuffer;
            uniform sampler2D lightBuffer;
            uniform sampler2D emissiveBuffer;
            uniform sampler2D dirtBuffer;
            uniform sampler2D shadowBuffer;
            uniform sampler2D positionBuffer;

            uniform vec3 uAmbient;
            uniform float emissiveMult;
            uniform float dirtIntensity;
            uniform float shadowIntensity;
            uniform float gamma;
 
            void main() {
                vec2 uv = gl_FragCoord.xy / viewportSize.xy;
                ivec2 fragCoord = ivec2(gl_FragCoord.xy);
                
                // Use texelFetch for G-buffer reads (no filtering needed)
                vec4 color = texelFetch(colorBuffer, fragCoord, 0);
                vec4 light = texelFetch(lightBuffer, fragCoord, 0);
                vec4 emissive = texelFetch(emissiveBuffer, fragCoord, 0);
                vec4 dirt = texture(dirtBuffer, uv); // Dirt uses tiled texture, needs filtering

                // Additive dynamic lighting on top of base color
                // Both lightmapped and dynamic objects use the same model
                vec3 dynamicLight = max(light.rgb - uAmbient, vec3(0.0));
                fragColor = vec4(color.rgb + dynamicLight, 1.0);

                // Apply shadows - multiply by shadow buffer
                // Skip shadows for sky (position.w == 0 or very far distance)
                vec4 position = texelFetch(positionBuffer, fragCoord, 0);
                vec3 shadow = texelFetch(shadowBuffer, fragCoord, 0).rgb;
                if (position.w > 0.0) {
                    // Soften shadows - mix between full brightness and shadow value
                    vec3 softShadow = mix(vec3(1.0), shadow, shadowIntensity);
                    fragColor.rgb *= softShadow;
                }
                
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
	fsrEasu: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;
            layout(location=0) in vec3 aPosition;
            void main() { gl_Position = vec4(aPosition, 1.0); }`,
		fragment: /* glsl */ `#version 300 es
            precision highp float;
            out vec4 fragColor;
            uniform sampler2D colorBuffer;
            uniform vec4 con0; // xy = inputSize, zw = outputSize

            float easuWeight(vec2 sampleOff, float dirX, float dirY, float stretch) {
                float along = abs(sampleOff.x * dirX + sampleOff.y * dirY);
                float perp  = abs(sampleOff.x * dirY - sampleOff.y * dirX);
                float d = sqrt(along * along + perp * perp * stretch * stretch);
                if (d < 1.0) return (1.5 * d - 2.5) * d * d + 1.0;
                if (d < 2.0) return ((-0.5 * d + 2.5) * d - 4.0) * d + 2.0;
                return 0.0;
            }

            void main() {
                vec2 inputSize = con0.xy;
                vec2 outputSize = con0.zw;
                vec2 invInput = 1.0 / inputSize;

                // Map output pixel center to input texel space
                vec2 srcPos = gl_FragCoord.xy * inputSize / outputSize - 0.5;
                vec2 base = floor(srcPos);
                vec2 f = srcPos - base;
                vec2 tc = (base + 0.5) * invInput;
                vec2 dx = vec2(invInput.x, 0.0);
                vec2 dy = vec2(0.0, invInput.y);

                // 12-tap sampling (4x4 minus corners)
                //   b c
                // d e f g
                // h i j k
                //   l m
                vec3 b  = texture(colorBuffer, tc - dy).rgb;
                vec3 c  = texture(colorBuffer, tc + dx - dy).rgb;
                vec3 d  = texture(colorBuffer, tc - dx).rgb;
                vec3 e  = texture(colorBuffer, tc).rgb;
                vec3 fS = texture(colorBuffer, tc + dx).rgb;
                vec3 g  = texture(colorBuffer, tc + 2.0 * dx).rgb;
                vec3 h  = texture(colorBuffer, tc - dx + dy).rgb;
                vec3 iS = texture(colorBuffer, tc + dy).rgb;
                vec3 j  = texture(colorBuffer, tc + dx + dy).rgb;
                vec3 k  = texture(colorBuffer, tc + 2.0 * dx + dy).rgb;
                vec3 l  = texture(colorBuffer, tc + 2.0 * dy).rgb;
                vec3 m  = texture(colorBuffer, tc + dx + 2.0 * dy).rgb;

                // Luminance
                vec3 lw = vec3(0.299, 0.587, 0.114);
                float lb = dot(b,lw); float lc = dot(c,lw);
                float ld = dot(d,lw); float le = dot(e,lw);
                float lf = dot(fS,lw); float lg = dot(g,lw);
                float lh = dot(h,lw); float li = dot(iS,lw);
                float lj = dot(j,lw); float lk = dot(k,lw);
                float ll = dot(l,lw); float lm = dot(m,lw);

                // Edge direction from 12-tap neighborhood
                float dirX = (lc-lb) + (lf-le) + (lj-li) + (lm-ll) + (lg-ld) + (lk-lh);
                float dirY = (lh-ld) + (li-le) + (lj-lf) + (lk-lg) + (ll-lb) + (lm-lc);
                float dirLen = max(abs(dirX), abs(dirY));
                float invDirLen = 1.0 / (dirLen + 1.0e-8);
                dirX *= invDirLen;
                dirY *= invDirLen;

                // Stretch: how elongated/anisotropic the kernel should be
                float minEdge = min(min(le, lf), min(li, lj));
                float maxEdge = max(max(le, lf), max(li, lj));
                float edgeAmount = clamp((maxEdge - minEdge) / max(maxEdge, 1.0e-5), 0.0, 1.0);
                float stretch = 1.0 + edgeAmount * 0.5;

                // Positive-only anisotropic weights for all 12 taps
                float we  = easuWeight(vec2( 0.0,  0.0) - f, dirX, dirY, stretch);
                float wfS = easuWeight(vec2( 1.0,  0.0) - f, dirX, dirY, stretch);
                float wiS = easuWeight(vec2( 0.0,  1.0) - f, dirX, dirY, stretch);
                float wj  = easuWeight(vec2( 1.0,  1.0) - f, dirX, dirY, stretch);
                float wb  = easuWeight(vec2( 0.0, -1.0) - f, dirX, dirY, stretch);
                float wc  = easuWeight(vec2( 1.0, -1.0) - f, dirX, dirY, stretch);
                float wd  = easuWeight(vec2(-1.0,  0.0) - f, dirX, dirY, stretch);
                float wg  = easuWeight(vec2( 2.0,  0.0) - f, dirX, dirY, stretch);
                float wh  = easuWeight(vec2(-1.0,  1.0) - f, dirX, dirY, stretch);
                float wk  = easuWeight(vec2( 2.0,  1.0) - f, dirX, dirY, stretch);
                float wl  = easuWeight(vec2( 0.0,  2.0) - f, dirX, dirY, stretch);
                float wm  = easuWeight(vec2( 1.0,  2.0) - f, dirX, dirY, stretch);

                vec3 color = e*we + fS*wfS + iS*wiS + j*wj
                           + b*wb + c*wc + d*wd + g*wg
                           + h*wh + k*wk + l*wl + m*wm;
                float totalW = we+wfS+wiS+wj+wb+wc+wd+wg+wh+wk+wl+wm;
                color /= totalW;

                // Clamp to neighborhood min/max to prevent negative-lobe ringing artifacts
                vec3 nMin = min(min(min(b,c),min(d,e)),min(min(fS,g),min(min(h,iS),min(min(j,k),min(l,m)))));
                vec3 nMax = max(max(max(b,c),max(d,e)),max(max(fS,g),max(max(h,iS),max(max(j,k),max(l,m)))));
                color = clamp(color, nMin, nMax);

                fragColor = vec4(color, 1.0);
            }`,
	},
	fsrRcas: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;
            layout(location=0) in vec3 aPosition;
            void main() { gl_Position = vec4(aPosition, 1.0); }`,
		fragment: /* glsl */ `#version 300 es
            precision highp float;
            out vec4 fragColor;
            uniform sampler2D colorBuffer;
            uniform float sharpness; // 0.0 to 1.0

            void main() {
                ivec2 p = ivec2(gl_FragCoord.xy);
                vec3 b = texelFetch(colorBuffer, p + ivec2(0, -1), 0).rgb;
                vec3 d = texelFetch(colorBuffer, p + ivec2(-1, 0), 0).rgb;
                vec3 e = texelFetch(colorBuffer, p, 0).rgb;
                vec3 f = texelFetch(colorBuffer, p + ivec2(1, 0), 0).rgb;
                vec3 h = texelFetch(colorBuffer, p + ivec2(0, 1), 0).rgb;

                // Luma (green-weighted, matching AMD FSR reference)
                float bL = b.g * 0.5 + (b.r + b.b) * 0.25;
                float dL = d.g * 0.5 + (d.r + d.b) * 0.25;
                float eL = e.g * 0.5 + (e.r + e.b) * 0.25;
                float fL = f.g * 0.5 + (f.r + f.b) * 0.25;
                float hL = h.g * 0.5 + (h.r + h.b) * 0.25;

                // Noise detection: suppress sharpening on noisy pixels
                float nz = 0.25 * (bL + dL + fL + hL) - eL;
                float rangeL = max(max(bL, dL), max(eL, max(fL, hL)))
                             - min(min(bL, dL), min(eL, min(fL, hL)));
                float nzC = clamp(abs(nz) / max(rangeL, 1e-6), 0.0, 1.0);
                float nzW = -0.5 * nzC + 1.0;

                // Per-channel min/max of the 4-tap cross
                float mn4R = min(min(b.r, d.r), min(f.r, h.r));
                float mn4G = min(min(b.g, d.g), min(f.g, h.g));
                float mn4B = min(min(b.b, d.b), min(f.b, h.b));
                float mx4R = max(max(b.r, d.r), max(f.r, h.r));
                float mx4G = max(max(b.g, d.g), max(f.g, h.g));
                float mx4B = max(max(b.b, d.b), max(f.b, h.b));

                // peakC controls maximum sharpening from user setting
                float peakC = 1.0 / (-4.0 * sharpness + 8.0);

                // Adaptive per-pixel limiters (per-channel)
                float hitMinR = min(mn4R, e.r) / (4.0 * max(mx4R, e.r) + 1e-6);
                float hitMinG = min(mn4G, e.g) / (4.0 * max(mx4G, e.g) + 1e-6);
                float hitMinB = min(mn4B, e.b) / (4.0 * max(mx4B, e.b) + 1e-6);
                float hitMaxR = (peakC - max(mx4R, e.r)) / (4.0 * min(mn4R, e.r) + peakC);
                float hitMaxG = (peakC - max(mx4G, e.g)) / (4.0 * min(mn4G, e.g) + peakC);
                float hitMaxB = (peakC - max(mx4B, e.b)) / (4.0 * min(mn4B, e.b) + peakC);

                float lobeR = max(-hitMinR, hitMaxR);
                float lobeG = max(-hitMinG, hitMaxG);
                float lobeB = max(-hitMinB, hitMaxB);

                // Most conservative lobe across channels, clamped to non-positive
                float lobe = max(-peakC, min(max(lobeR, max(lobeG, lobeB)), 0.0));
                lobe *= nzW;

                vec3 color = (b + d + f + h) * lobe + e;
                color /= 4.0 * lobe + 1.0;

                fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
            }`,
	},
	transparent: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;
            layout(location=1) in vec2 aUV;
            layout(location=2) in vec3 aNormal;

            ${_frameDataUBO}

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
		fragment: /* glsl */ `#version 300 es
            precision highp float;
            precision highp int;

            in vec2 vUV;
            in vec3 vNormal;
            in vec4 vPosition;

            layout(location=0) out vec4 fragColor;

            ${_frameDataUBO}

            ${_materialDataUBO}

            uniform sampler2D colorSampler;
            uniform sampler2D emissiveSampler; 
            
            // Reflection uniforms
            uniform sampler2D reflectionSampler;
            uniform sampler2D reflectionMaskSampler;
            
            #define MAX_POINT_LIGHTS 8
            #define MAX_SPOT_LIGHTS 4

            // Lighting data UBO (binding point 2, std140, matches _lightingData layout)
            layout(std140) uniform LightingData {
                vec4 pointLightPositions[MAX_POINT_LIGHTS]; // xyz=pos
                vec4 pointLightColors[MAX_POINT_LIGHTS];    // xyz=color
                vec4 pointLightParams[MAX_POINT_LIGHTS];    // x=intensity, y=size
                vec4 spotLightPositions[MAX_SPOT_LIGHTS];   // xyz=pos
                vec4 spotLightDirections[MAX_SPOT_LIGHTS];  // xyz=dir
                vec4 spotLightColors[MAX_SPOT_LIGHTS];      // xyz=color
                vec4 spotLightParams[MAX_SPOT_LIGHTS];      // x=intensity, y=cutoff, z=range
                vec4 lightCounts;                           // x=numPoint, y=numSpot
            };

            ${_pointLightCalc}
            ${_spotLightCalc}

            vec3 calculatePointLight(int i, vec3 normal, vec3 fragPos) {
                vec2 pl = calcPointLight(pointLightPositions[i].xyz, pointLightParams[i].y, fragPos, normal);
                return pointLightColors[i].xyz * (pl.x * pl.y * pointLightParams[i].x);
            }

            vec3 calculateSpotLight(int i, vec3 normal, vec3 fragPos) {
                vec3 sl = calcSpotLight(spotLightPositions[i].xyz, spotLightDirections[i].xyz, spotLightParams[i].y, spotLightParams[i].z, fragPos, normal);
                return spotLightColors[i].xyz * (spotLightParams[i].x * 2.0) * sl.x * sl.y * sl.z;
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
                int numPointLights = int(lightCounts.x);
                for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
                    if (i >= numPointLights) break;
                    dynamicLighting += calculatePointLight(i, normal, fragPos);
                }

                // Add spot lights contribution
                int numSpotLights = int(lightCounts.y);
                for (int i = 0; i < MAX_SPOT_LIGHTS; i++) {
                    if (i >= numSpotLights) break;
                    dynamicLighting += calculateSpotLight(i, normal, fragPos);
                }

                // Apply base color with dynamic lighting added on top
                // Hardcoded ambient approximation (0.5) to avoid uniform issues and fix brightness
                fragColor = vec4(color.rgb * 0.5 + color.rgb * dynamicLighting, color.a);
            }`,
	},
	debug: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;

            layout(location=0) in vec3 aPosition;

            ${_frameDataUBO}

            uniform mat4 matWorld;

            void main() {
                gl_Position = matViewProj * matWorld * vec4(aPosition, 1.0);
            }`,
		fragment: _debugFragment,
	},
	skinnedDebug: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;
            precision highp int;

            layout(location=0) in vec3 aPosition;
            ${_skinningInputs}

            ${_frameDataUBO}

            uniform mat4 matWorld;
            ${_skinningUniform}

            void main() {
                ${_skinningCalc}

                // Apply skinning to position
                vec3 skinnedPosition = (skinMatrix * vec4(aPosition, 1.0)).xyz;

                gl_Position = matViewProj * matWorld * vec4(skinnedPosition, 1.0);
            }`,
		fragment: _debugFragment,
	},
	billboard: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;

            layout(location=0) in vec3 aPosition;
            layout(location=1) in vec2 aUV;

            ${_frameDataUBO}

            uniform mat4 matWorld;
            uniform vec2 uFrameOffset;
            uniform vec2 uFrameScale;

            out vec2 vUV;

            void main() {
                vec4 worldPos = matWorld * vec4(aPosition, 1.0);
                // Inset UVs slightly (1% on all sides) to prevent texture bleeding
                // from adjacent frames in the sprite sheet due to linear filtering
                vec2 insetUV = aUV * 0.98 + 0.01;
                vUV = uFrameOffset + insetUV * uFrameScale;
                gl_Position = matViewProj * worldPos;
            }`,
		fragment: /* glsl */ `#version 300 es
            precision highp float;

            in vec2 vUV;

            layout(location=0) out vec4 fragColor;

            uniform sampler2D colorSampler;
            uniform float uOpacity;

            void main() {
                vec4 color = texture(colorSampler, vUV);
                // Use luminance as alpha for additive blending fade
                float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                fragColor = vec4(color.rgb * uOpacity, lum * uOpacity);
            }`,
	},
	instancedBillboard: {
		vertex: /* glsl */ `#version 300 es
            precision highp float;

            layout(location=0) in vec3 aPosition;
            layout(location=1) in vec2 aUV;
            
            // Instanced attributes
            layout(location=2) in vec3 aInstancePos;
            layout(location=3) in float aInstanceScale;
            layout(location=4) in float aInstanceRotation;
            layout(location=5) in float aInstanceOpacity;

            ${_frameDataUBO}

            out vec2 vUV;
            out float vOpacity;

            void main() {
                // Extract camera right and up vectors from view matrix
                vec3 right = vec3(matView[0][0], matView[1][0], matView[2][0]);
                vec3 up    = vec3(matView[0][1], matView[1][1], matView[2][1]);
                
                // Apply rotation
                float c = cos(aInstanceRotation);
                float s = sin(aInstanceRotation);
                
                vec3 localRight = right * c + up * s;
                vec3 localUp    = -right * s + up * c;

                // Build world position
                vec3 worldPos = aInstancePos 
                              + localRight * aPosition.x * aInstanceScale 
                              + localUp * aPosition.y * aInstanceScale;

                vec2 insetUV = aUV * 0.98 + 0.01;
                vUV = insetUV;
                vOpacity = aInstanceOpacity;
                
                gl_Position = matViewProj * vec4(worldPos, 1.0);
            }`,
		fragment: /* glsl */ `#version 300 es
            precision highp float;

            in vec2 vUV;
            in float vOpacity;

            layout(location=0) out vec4 fragColor;

            uniform sampler2D colorSampler;

            void main() {
                vec4 color = texture(colorSampler, vUV);
                float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                fragColor = vec4(color.rgb * vOpacity, lum * vOpacity);
            }`,
	},
};
