package rendering

import _ "embed"

// WGSL sources for every pipeline, embedded from shaders/*.wgsl. Shared header
// blocks keep the bind-group contract in one place:
//
//	group 0  Frame     binding 0 FrameData (uniform)
//	group 1  Material  per-pipeline inputs (material UBO + textures, or pass
//	                   input textures)
//	group 2  Object    binding 0 ObjectData (uniform, dynamic offset);
//	                   binding 1 bones (read-only storage, skinned only)
//	group 3  Lighting  binding 0 LightingData (uniform); binding 1 lights
//	                   (read-only storage)

//go:embed shaders/common/frame.wgsl
var wgslFrame string

// ObjectData is the 256-byte per-draw slot of the object ring (see
// ObjectRing). params0..2 are pass-specific: light parameters, sprite frame,
// debug colour, post-processing settings.
//
//go:embed shaders/common/object.wgsl
var wgslObject string

//go:embed shaders/common/bones.wgsl
var wgslBones string

//go:embed shaders/common/material.wgsl
var wgslMaterial string

//go:embed shaders/common/lighting.wgsl
var wgslLighting string

//go:embed shaders/common/oct.wgsl
var wgslOct string

//go:embed shaders/common/light_funcs.wgsl
var wgslLightFuncs string

// wgslFullscreen is the vertex stage for pass.draw(3) fullscreen triangles.
//
//go:embed shaders/common/fullscreen.wgsl
var wgslFullscreen string

//go:embed shaders/common/geometry_common.wgsl
var wgslGeometryCommon string

//go:embed shaders/common/geometry_fragment.wgsl
var wgslGeometryFragment string

//go:embed shaders/common/deferred_inputs.wgsl
var wgslDeferredInputs string

//go:embed shaders/common/volume_vertex.wgsl
var wgslVolumeVertex string

//go:embed shaders/common/sampled_input.wgsl
var wgslSampledInput string

//go:embed shaders/common/sprite.wgsl
var wgslSprite string

//go:embed shaders/geometry.wgsl
var wgslGeometryBody string

//go:embed shaders/skinned_geometry.wgsl
var wgslSkinnedGeometryBody string

//go:embed shaders/entity_shadows.wgsl
var wgslEntityShadowsBody string

//go:embed shaders/skinned_entity_shadows.wgsl
var wgslSkinnedEntityShadowsBody string

//go:embed shaders/directional_light.wgsl
var wgslDirectionalLightBody string

//go:embed shaders/point_light.wgsl
var wgslPointLightBody string

//go:embed shaders/spot_light.wgsl
var wgslSpotLightBody string

//go:embed shaders/kawase_blur.wgsl
var wgslKawaseBlurBody string

//go:embed shaders/post_processing.wgsl
var wgslPostProcessingBody string

//go:embed shaders/fsr_easu.wgsl
var wgslFsrEasuBody string

//go:embed shaders/fsr_rcas.wgsl
var wgslFsrRcasBody string

//go:embed shaders/transparent.wgsl
var wgslTransparentBody string

//go:embed shaders/debug.wgsl
var wgslDebugBody string

//go:embed shaders/skinned_debug.wgsl
var wgslSkinnedDebugBody string

//go:embed shaders/billboard.wgsl
var wgslBillboardBody string

//go:embed shaders/instanced_billboard.wgsl
var wgslInstancedBillboardBody string

//go:embed shaders/particle_update.wgsl
var wgslParticleUpdateBody string

// mipmapBlitWGSL downsamples one mip level from the previous.
//
//go:embed shaders/mipmap_blit.wgsl
var mipmapBlitWGSL string

// WgslGeometry fills the G-buffer from static meshes (and the skybox).
var WgslGeometry = wgslFrame + wgslMaterial + wgslObject + wgslOct + wgslGeometryCommon + wgslGeometryBody + wgslGeometryFragment

// WgslSkinnedGeometry is WgslGeometry with storage-buffer skinning.
var WgslSkinnedGeometry = wgslFrame + wgslMaterial + wgslObject + wgslBones + wgslOct + wgslGeometryCommon + wgslSkinnedGeometryBody + wgslGeometryFragment

// WgslEntityShadows draws flattened drop shadows (probe.rgb = ambient).
var WgslEntityShadows = wgslFrame + wgslObject + wgslEntityShadowsBody

// WgslSkinnedEntityShadows flattens the skinned pose to probe.a (shadow height).
var WgslSkinnedEntityShadows = wgslFrame + wgslObject + wgslBones + wgslSkinnedEntityShadowsBody

// WgslDirectionalLight: fullscreen, params0 = direction, params1 = colour.
var WgslDirectionalLight = wgslFrame + wgslDeferredInputs + wgslObject + wgslOct + wgslFullscreen + wgslDirectionalLightBody

// WgslPointLight: sphere volume, params0 = posRange, params1 = colorIntensity.
var WgslPointLight = wgslFrame + wgslDeferredInputs + wgslObject + wgslOct + wgslLightFuncs + wgslVolumeVertex + wgslPointLightBody

// WgslSpotLight: cone volume, params0 = posRange, params1 = colorIntensity,
// params2 = dirCutoff.
var WgslSpotLight = wgslFrame + wgslDeferredInputs + wgslObject + wgslOct + wgslLightFuncs + wgslVolumeVertex + wgslSpotLightBody

// WgslKawaseBlur is the compute Kawase blur: params0.x = offset (negative =
// identity copy). Group 1: sampler, source texture, destination storage.
var WgslKawaseBlur = wgslFrame + wgslObject + wgslKawaseBlurBody

// WgslPostProcessing composites the frame. params0 = (gamma, emissiveMult,
// dirtIntensity, shadowIntensity), params1 = ambient.
var WgslPostProcessing = wgslFrame + wgslObject + wgslFullscreen + wgslPostProcessingBody

// WgslFsrEasu upscales; params0 = con0 (xy = input size, zw = output size).
var WgslFsrEasu = wgslFrame + wgslObject + wgslSampledInput + wgslFullscreen + wgslFsrEasuBody

// WgslFsrRcas sharpens; params0.x = sharpness.
var WgslFsrRcas = wgslFrame + wgslObject + wgslSampledInput + wgslFullscreen + wgslFsrRcasBody

// WgslTransparent forward-shades translucent meshes with the light storage
// buffer (points first, then spots).
var WgslTransparent = wgslFrame + wgslMaterial + wgslObject + wgslLighting + wgslLightFuncs + wgslTransparentBody

// WgslDebug draws lines in params0 (debug colour).
var WgslDebug = wgslFrame + wgslObject + wgslVolumeVertex + wgslDebugBody

// WgslSkinnedDebug is WgslDebug through the skinning matrices.
var WgslSkinnedDebug = wgslFrame + wgslObject + wgslBones + wgslSkinnedDebugBody

// WgslBillboard: params0 = (frameOffset.xy, frameScale.xy), params1.x = opacity.
var WgslBillboard = wgslFrame + wgslSprite + wgslObject + wgslBillboardBody

// WgslInstancedBillboard draws particle quads from the per-instance buffer.
var WgslInstancedBillboard = wgslFrame + wgslSprite + wgslObject + wgslInstancedBillboardBody

// WgslParticleUpdate integrates one particle per invocation and writes the
// instance record. Group 1: particles (rw), instances (rw), curve LUT.
// params0 = (dtSeconds, frameTimeMs, particleCount, lutSize).
var WgslParticleUpdate = wgslFrame + wgslObject + wgslParticleUpdateBody
