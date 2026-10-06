package rendering

import (
	"../mathx"
)

const (
	BlurSourceShadow   = 0
	BlurSourceLighting = 1
	BlurSourceEmissive = 2

	MaxPointLights = 8
	MaxSpotLights  = 4

	// LightingDataSize is the LightingData UBO size in floats
	// (8 point × 2 vec4 + 4 spot × 3 vec4 + counts vec4 = 116).
	LightingDataSize = 116

	// blurIdentityOffset instructs kawaseBlur to perform an exact 1:1 copy.
	blurIdentityOffset = -1.0
)

// RenderStats records per-frame geometry and lighting metrics.
type RenderStats struct {
	MeshCount     int
	LightCount    int
	TriangleCount int
}

// Reset zeroes the metrics; Renderer.Render calls it at the start of a frame.
func (s *RenderStats) Reset() {
	s.MeshCount = 0
	s.LightCount = 0
	s.TriangleCount = 0
}

// DebugRenderOptions controls overlay visualizations.
type DebugRenderOptions struct {
	ShowBoundingVolumes bool
	ShowWireframes      bool
	ShowLightVolumes    bool
	ShowSkeleton        bool
}

// RenderOptions is the per-frame snapshot of the Settings the passes read.
// The engine fills it once per frame; it is the only path settings take into
// the renderer.
type RenderOptions struct {
	ProceduralDetail     bool
	ShadowBlurIterations int
	ShadowBlurOffset     float32
	LightBlurIterations  int
	EmissiveIterations   int
	EmissiveOffset       float32
	EmissiveMult         float32
	Gamma                float32
	DoDirt               bool
	DirtIntensity        float32
	ShadowIntensity      float32
	DoFSR                bool
	FsrSharpness         float32
	// Dirt is the lens-dirt overlay ("system/dirt.webp"); nil binds nothing.
	Dirt *Texture
}

// Package-level clear descriptors (zero per-frame allocation).
var (
	clearBlack        = &ClearOptions{Color: []float32{0, 0, 0, 1}, Depth: 1, ClearColor: true, ClearDepth: true}
	clearBlackColor   = &ClearOptions{Color: []float32{0, 0, 0, 1}, ClearColor: true}
	clearTransparent  = &ClearOptions{Color: []float32{0, 0, 0, 0}, ClearColor: true}
	clearWhite        = &ClearOptions{Color: []float32{1, 1, 1, 1}, ClearColor: true}
	clearAmbient      = &ClearOptions{Color: []float32{0, 0, 0, 1}, Depth: 1, ClearColor: true, ClearDepth: true}
	clearAmbientColor = &ClearOptions{Color: []float32{0, 0, 0, 1}, ClearColor: true}
	ambientScratch    = &mathx.Vec3{}
	ambientVec        = make([]float32, 3)
	whiteProbe        = []float32{1, 1, 1}
	debugWhite        = []float32{1, 1, 1, 1}
	debugYellow       = []float32{1, 1, 0, 1}
	// Bounding-box overlay colours per draw list.
	boundsRed     = []float32{1, 0, 0, 1}
	boundsGreen   = []float32{0, 1, 0, 1}
	boundsYellow  = []float32{1, 1, 0, 1}
	boundsBlue    = []float32{0, 0, 1, 1}
	boundsMagenta = []float32{1, 0, 1, 1}
	boundsCyan    = []float32{0, 1, 1, 1}
	boundsOrange  = []float32{1, 0.5, 0, 1}
)

// Pipeline-state presets. Every pass applies one on entry and stateOpaque on
// exit; stateOpaque matches the backends' initial GL state.
var (
	stateOpaque = withCullOff(&PipelineState{
		SrcFactor: BlendOne, DstFactor: BlendZero,
		DepthTest: true, DepthWrite: true, DepthFunc: DepthLEqual,
		Cull: true, CullFace: CullBack,
		ColorMask: ColorMaskAll,
	})
	// stateSkybox: depth off so the sky never occludes world geometry.
	stateSkybox = withCullOff(&PipelineState{
		SrcFactor: BlendOne, DstFactor: BlendZero,
		DepthFunc: DepthLEqual,
		Cull: true, CullFace: CullBack,
		ColorMask: ColorMaskAll,
	})
	// stateShadow: depth-tested, no depth write, polygon offset pulls the
	// flattened shadow geometry towards the camera; no culling.
	stateShadow = &PipelineState{
		SrcFactor: BlendOne, DstFactor: BlendZero,
		DepthTest: true, DepthFunc: DepthLEqual,
		CullFace: CullBack,
		PolyOffset: true, OffsetFactor: -1, OffsetUnits: -1,
		ColorMask: ColorMaskAll,
	}
	// stateLightingAdditive: light volumes accumulate with one/one blending.
	stateLightingAdditive = withCullOff(&PipelineState{
		Blend: true, SrcFactor: BlendOne, DstFactor: BlendOne,
		DepthFunc: DepthLEqual,
		Cull: true, CullFace: CullBack,
		ColorMask: ColorMaskAll,
	})
	// stateTransparent: alpha blend, depth-tested but not written, no culling.
	stateTransparent = &PipelineState{
		Blend: true, SrcFactor: BlendSrcAlpha, DstFactor: BlendOneMinusSrcAlpha,
		DepthTest: true, DepthFunc: DepthLEqual,
		CullFace: CullBack,
		ColorMask: ColorMaskAll,
	}
	// stateBillboardAdditive: stateTransparent with additive destination.
	stateBillboardAdditive = &PipelineState{
		Blend: true, SrcFactor: BlendSrcAlpha, DstFactor: BlendOne,
		DepthTest: true, DepthFunc: DepthLEqual,
		CullFace: CullBack,
		ColorMask: ColorMaskAll,
	}
	// statePostProcess: full-screen quads (blur, post-processing, FSR).
	statePostProcess = &PipelineState{
		SrcFactor: BlendOne, DstFactor: BlendZero,
		DepthFunc: DepthLEqual,
		CullFace: CullBack,
		ColorMask: ColorMaskAll,
	}
	// stateDebug: overlay lines drawn over everything.
	stateDebug = withCullOff(&PipelineState{
		SrcFactor: BlendOne, DstFactor: BlendZero,
		DepthFunc: DepthLEqual,
		Cull: true, CullFace: CullBack,
		ColorMask: ColorMaskAll,
	})
)

func sampleAmbient(scene SceneSource) {
	scene.Ambient(ambientScratch)
	ambientVec[0] = ambientScratch.X
	ambientVec[1] = ambientScratch.Y
	ambientVec[2] = ambientScratch.Z
	clearAmbient.Color[0] = ambientScratch.X
	clearAmbient.Color[1] = ambientScratch.Y
	clearAmbient.Color[2] = ambientScratch.Z
	clearAmbientColor.Color[0] = ambientScratch.X
	clearAmbientColor.Color[1] = ambientScratch.Y
	clearAmbientColor.Color[2] = ambientScratch.Z
}

// Render draws one full frame: world geometry into the G-buffer, drop
// shadows, FPS geometry, deferred lighting, transparents, emissive blur,
// post-processing, optional FSR and the debug overlay. All inputs are
// required; the frame is skipped if any is missing.
func (r *Renderer) Render(cam *CameraView, scene SceneSource, opts *RenderOptions, time float32) {
	if r.Backend == nil || cam == nil || scene == nil || opts == nil || r.GBuffer.Framebuffer == nil {
		return
	}
	b := r.Backend
	b.BeginFrame()
	r.Stats.Reset()
	r.ProceduralDetail = opts.ProceduralDetail

	sampleAmbient(scene)
	r.UpdateFrameDataUBO(cam, time, opts.ProceduralDetail)

	r.worldGeomPass(scene)
	r.shadowPass(scene)
	if opts.ShadowBlurIterations > 0 {
		r.shadowBlurPass(scene, opts)
	}
	r.fpsGeomPass(scene)
	r.lightingPass(cam, scene, opts)
	r.transparentPass(scene)
	r.blurImage(BlurSourceEmissive, opts.EmissiveIterations, opts.EmissiveOffset)
	r.postProcessingPass(opts)
	if opts.DoFSR {
		r.fsrPass(opts)
	}
	r.debugPass(scene)

	b.EndFrame()
}

// bindGeometryShader binds sh with the per-pass uniforms shared by the
// geometry and skinned-geometry shaders.
func (r *Renderer) bindGeometryShader(sh *Shader) {
	sh.Bind()
	sh.SetInt("proceduralNoise", 5)
	if r.ProceduralDetail {
		sh.SetInt("doProceduralDetail", 1)
	} else {
		sh.SetInt("doProceduralDetail", 0)
	}
	sh.SetMat4("matWorld", r.identity)
}

// drawList draws every item of list with sh in the given material mode.
func drawList(r *Renderer, list *DrawList, sh *Shader, mode MaterialMode) {
	for i := 0; i < list.Count; i++ {
		list.Items[i].Draw(r, sh, mode)
	}
}

// drawListCounted is drawList plus mesh/triangle stats accounting.
func drawListCounted(r *Renderer, list *DrawList, sh *Shader, mode MaterialMode) {
	for i := 0; i < list.Count; i++ {
		d := list.Items[i]
		d.Draw(r, sh, mode)
		r.Stats.MeshCount++
		r.Stats.TriangleCount += d.TriangleCount()
	}
}

// drawBound binds sh, draws list in ModeAll and unbinds; skipped when the
// list is empty or the shader is missing.
func (r *Renderer) drawBound(list *DrawList, sh *Shader) {
	if sh == nil || list.Count == 0 {
		return
	}
	sh.Bind()
	drawList(r, list, sh, ModeAll)
	r.Backend.UnbindShader()
}

// worldGeomPass fills the G-buffer: skybox (depth off), opaque meshes, FPS
// meshes, then skinned meshes. FPS meshes are drawn here at full depth range
// so they occlude and receive lighting like world geometry, and again by
// fpsGeomPass in the near depth range so view models layer over the world.
func (r *Renderer) worldGeomPass(scene SceneSource) {
	b := r.Backend
	b.SetDepthRange(0.1, 1.0)
	b.BindFramebuffer(r.GBuffer.Framebuffer)
	b.SetViewport(0, 0, r.Width, r.Height)
	b.Clear(clearAmbient)
	if r.ProceduralNoise != nil {
		r.ProceduralNoise.Bind(5)
	}
	if geo := r.Shaders.Geometry; geo != nil {
		r.bindGeometryShader(geo)
		b.ApplyState(stateSkybox)
		drawList(r, scene.Skyboxes(), geo, ModeAll)
		b.ApplyState(stateOpaque)

		drawListCounted(r, scene.Meshes(), geo, ModeOpaque)
		drawList(r, scene.FPSMeshes(), geo, ModeOpaque)
		b.UnbindShader()
	}
	if skinned := r.Shaders.SkinnedGeometry; skinned != nil {
		r.bindGeometryShader(skinned)
		drawListCounted(r, scene.SkinnedMeshes(), skinned, ModeOpaque)
		b.UnbindShader()
	}
	b.ApplyState(stateOpaque)
	b.BindFramebuffer(nil)
	b.SetDepthRange(0.0, 1.0)
}

func (r *Renderer) fpsGeomPass(scene SceneSource) {
	b := r.Backend
	b.SetDepthRange(0.0, 0.1)
	b.BindFramebuffer(r.GBuffer.Framebuffer)
	b.SetViewport(0, 0, r.Width, r.Height)
	b.ApplyState(stateOpaque)
	if r.ProceduralNoise != nil {
		r.ProceduralNoise.Bind(5)
	}
	if geo := r.Shaders.Geometry; geo != nil {
		r.bindGeometryShader(geo)
		drawList(r, scene.FPSMeshes(), geo, ModeAll)
		b.UnbindShader()
	}
	b.BindFramebuffer(nil)
	b.SetDepthRange(0.0, 1.0)
}

// drawShadows binds sh with the ambient uniforms and draws every caster.
func (r *Renderer) drawShadows(list *DrawList, sh *Shader) {
	sh.Bind()
	sh.SetVec3("ambient", ambientVec)
	sh.SetVec3("uProbeColor", ambientVec)
	for i := 0; i < list.Count; i++ {
		list.Items[i].DrawShadow(r, sh)
	}
	r.Backend.UnbindShader()
}

func (r *Renderer) shadowPass(scene SceneSource) {
	if r.ShadowBuffer.Framebuffer == nil {
		return
	}
	b := r.Backend
	b.SetDepthRange(0.1, 1.0)
	b.BindFramebuffer(r.ShadowBuffer.Framebuffer)
	b.SetViewport(0, 0, r.ShadowBuffer.Width, r.ShadowBuffer.Height)
	b.Clear(clearWhite)
	b.ApplyState(stateShadow)

	if sh := r.Shaders.EntityShadows; sh != nil {
		r.drawShadows(scene.Meshes(), sh)
	}
	if sh := r.Shaders.SkinnedEntityShadows; sh != nil {
		r.drawShadows(scene.SkinnedMeshes(), sh)
	}

	b.ApplyState(stateOpaque)
	b.BindFramebuffer(nil)
	b.SetDepthRange(0.0, 1.0)
}

func (r *Renderer) shadowBlurPass(scene SceneSource, opts *RenderOptions) {
	// WebGPU shadow blur over-smooths the target on some drivers; keep raw map.
	if r.Backend.IsWebGPU() {
		return
	}
	if !hasShadowCasters(scene) {
		return
	}
	r.blurImage(BlurSourceShadow, opts.ShadowBlurIterations, opts.ShadowBlurOffset)
}

// sortLights ranks the visible point and spot lights by contribution at the
// camera; the lighting pass draws in that order and the transparent pass
// packs the top entries into the LightingData UBO.
func (r *Renderer) sortLights(cam *CameraView, scene SceneSource) {
	camPos := &cam.Position
	r.pointSorter.Begin()
	pl := scene.PointLights()
	for i := 0; i < pl.Count; i++ {
		r.pointSorter.Add(i, pl.Items[i].LightScore(camPos))
	}
	r.pointSorter.Sort()

	r.spotSorter.Begin()
	sl := scene.SpotLights()
	for i := 0; i < sl.Count; i++ {
		r.spotSorter.Add(i, sl.Items[i].LightScore(camPos))
	}
	r.spotSorter.Sort()
}

// drawLightsSorted draws list in sorter order with sh and counts them.
func (r *Renderer) drawLightsSorted(list *LightList, sorter *LightSorter, sh *Shader) {
	sh.Bind()
	sh.SetInt("positionBuffer", 0)
	sh.SetInt("normalBuffer", 1)
	for i := 0; i < sorter.Count; i++ {
		list.Items[sorter.Entries[i].Index].Draw(r, sh, ModeAll)
		r.Stats.LightCount++
	}
	r.Backend.UnbindShader()
}

func (r *Renderer) lightingPass(cam *CameraView, scene SceneSource, opts *RenderOptions) {
	b := r.Backend
	b.BindFramebuffer(r.LightBuffer.Framebuffer)
	b.SetViewport(0, 0, r.Width, r.Height)
	b.Clear(clearAmbientColor)

	r.GBuffer.WorldPosition.Bind(0)
	r.GBuffer.Normal.Bind(1)
	r.ShadowBuffer.Shadow.Bind(2)
	r.GBuffer.Color.Bind(3)

	b.ApplyState(stateLightingAdditive)

	if dl := r.Shaders.DirectionalLight; dl != nil {
		dl.Bind()
		dl.SetInt("normalBuffer", 1)
		dl.SetInt("colorBuffer", 3)
		drawList(r, scene.DirectionalLights(), dl, ModeAll)
		b.UnbindShader()
	}
	r.sortLights(cam, scene)
	if pl := r.Shaders.PointLight; pl != nil {
		r.drawLightsSorted(scene.PointLights(), r.pointSorter, pl)
	}
	if sl := r.Shaders.SpotLight; sl != nil {
		r.drawLightsSorted(scene.SpotLights(), r.spotSorter, sl)
	}

	b.ApplyState(stateOpaque)

	UnbindTextureRange(b, 0, 4)
	b.BindFramebuffer(nil)

	r.blurImage(BlurSourceLighting, opts.LightBlurIterations, 0.2)
}

// uploadTransparentLighting packs the highest-contribution lights (sorted by
// lightingPass this frame) into the LightingData UBO.
func (r *Renderer) uploadTransparentLighting(scene SceneSource) {
	r.lighting.Reset()
	pl := scene.PointLights()
	for i := 0; i < r.pointSorter.Count && i < MaxPointLights; i++ {
		pl.Items[r.pointSorter.Entries[i].Index].AddToLighting(r.lighting)
	}
	sl := scene.SpotLights()
	for i := 0; i < r.spotSorter.Count && i < MaxSpotLights; i++ {
		sl.Items[r.spotSorter.Entries[i].Index].AddToLighting(r.lighting)
	}
	r.lighting.Upload(r)
}

func (r *Renderer) transparentPass(scene SceneSource) {
	b := r.Backend
	b.BindFramebuffer(r.LightBuffer.Framebuffer)
	b.SetViewport(0, 0, r.Width, r.Height)
	b.SetDepthRange(0.1, 1.0)

	b.ApplyState(stateTransparent)
	transparent := scene.Transparent()
	if sh := r.Shaders.Transparent; sh != nil && transparent.Count > 0 {
		sh.Bind()
		sh.SetMat4("matWorld", r.identity)
		sh.SetInt("colorSampler", 0)
		r.uploadTransparentLighting(scene)
		drawList(r, transparent, sh, ModeTranslucent)
		b.UnbindShader()
	}

	b.ApplyState(stateBillboardAdditive)
	r.drawBound(scene.Billboards(), r.Shaders.Billboard)
	r.drawBound(scene.ParticleEmitters(), r.Shaders.InstancedBillboard)

	b.ApplyState(stateOpaque)
	b.SetDepthRange(0.0, 1.0)
	b.BindFramebuffer(nil)
}

// boundsScratch is the matrix reused by drawBounds/drawLightBounds.
var boundsScratch = mathx.NewMat4()

// drawBounds draws the AABB of every item in list with the bound debug shader.
func (r *Renderer) drawBounds(list *DrawList, sh *Shader, color []float32) {
	box := r.Shapes.BoundingBoxMesh
	if box == nil || list.Count == 0 {
		return
	}
	sh.SetVec4("debugColor", color)
	for i := 0; i < list.Count; i++ {
		bb := list.Items[i].Bounds()
		if bb == nil {
			continue
		}
		sh.SetMat4("matWorld", bb.TransformMatrix(boundsScratch))
		box.RenderSingle(true, TopoLines, ModeAll, sh)
	}
}

// drawLightBounds is drawBounds for a LightList.
func (r *Renderer) drawLightBounds(list *LightList, sh *Shader, color []float32) {
	box := r.Shapes.BoundingBoxMesh
	if box == nil || list.Count == 0 {
		return
	}
	sh.SetVec4("debugColor", color)
	for i := 0; i < list.Count; i++ {
		bb := list.Items[i].Bounds()
		if bb == nil {
			continue
		}
		sh.SetMat4("matWorld", bb.TransformMatrix(boundsScratch))
		box.RenderSingle(true, TopoLines, ModeAll, sh)
	}
}

func drawWireframes(r *Renderer, list *DrawList, sh *Shader) {
	for i := 0; i < list.Count; i++ {
		list.Items[i].DrawWireframe(r, sh)
	}
}

// debugPass draws bounding boxes, wireframes, light volumes and skeletons
// straight to the backbuffer according to r.Debug.
func (r *Renderer) debugPass(scene SceneSource) {
	d := r.Debug
	if !d.ShowBoundingVolumes && !d.ShowWireframes && !d.ShowLightVolumes && !d.ShowSkeleton {
		return
	}
	sh := r.Shaders.Debug
	if sh == nil {
		return
	}
	b := r.Backend
	sh.Bind()
	b.ApplyState(stateDebug)

	if d.ShowBoundingVolumes {
		r.drawBounds(scene.Meshes(), sh, boundsRed)
		r.drawBounds(scene.FPSMeshes(), sh, boundsGreen)
		r.drawBounds(scene.DirectionalLights(), sh, boundsYellow)
		r.drawLightBounds(scene.PointLights(), sh, boundsYellow)
		r.drawLightBounds(scene.SpotLights(), sh, boundsYellow)
		r.drawBounds(scene.Skyboxes(), sh, boundsBlue)
		r.drawBounds(scene.SkinnedMeshes(), sh, boundsMagenta)
		r.drawBounds(scene.Billboards(), sh, boundsCyan)
		r.drawBounds(scene.ParticleEmitters(), sh, boundsOrange)
	}

	if d.ShowWireframes {
		sh.SetVec4("debugColor", debugWhite)
		drawWireframes(r, scene.Meshes(), sh)
		drawWireframes(r, scene.SkinnedMeshes(), sh)
		drawWireframes(r, scene.FPSMeshes(), sh)
		drawWireframes(r, scene.Skyboxes(), sh)
	}

	if d.ShowLightVolumes {
		sh.SetVec4("debugColor", debugYellow)
		pl := scene.PointLights()
		for i := 0; i < pl.Count; i++ {
			pl.Items[i].DrawWireframe(r, sh)
		}
		sl := scene.SpotLights()
		for i := 0; i < sl.Count; i++ {
			sl.Items[i].DrawWireframe(r, sh)
		}
	}

	if d.ShowSkeleton {
		skinned := scene.SkinnedMeshes()
		for i := 0; i < skinned.Count; i++ {
			skinned.Items[i].DrawSkeleton(r, sh)
		}
	}

	b.ApplyState(stateOpaque)
	b.UnbindShader()
}

func (r *Renderer) postProcessingPass(opts *RenderOptions) {
	b := r.Backend
	sh := r.Shaders.PostProcessing
	if sh == nil {
		return
	}
	if opts.DoFSR && r.ScratchBuffer.Framebuffer != nil {
		b.BindFramebuffer(r.ScratchBuffer.Framebuffer)
		b.SetViewport(0, 0, r.Width, r.Height)
		b.Clear(clearBlackColor)
	} else {
		b.BindFramebuffer(nil)
		b.SetViewport(0, 0, r.Width, r.Height)
		b.Clear(clearBlack)
	}
	b.ApplyState(statePostProcess)

	r.GBuffer.Color.Bind(0)
	r.LightBuffer.Light.Bind(1)
	r.GBuffer.Emissive.Bind(2)
	if opts.Dirt != nil {
		opts.Dirt.Bind(3)
	}
	r.ShadowBuffer.Shadow.Bind(4)
	r.GBuffer.Normal.Bind(5)
	sh.Bind()

	sh.SetInt("colorBuffer", 0)
	sh.SetInt("lightBuffer", 1)
	sh.SetInt("emissiveBuffer", 2)
	sh.SetInt("dirtBuffer", 3)
	sh.SetInt("shadowBuffer", 4)
	sh.SetInt("normalBuffer", 5)

	sh.SetFloat("emissiveMult", opts.EmissiveMult)
	sh.SetFloat("gamma", opts.Gamma)
	dirt := float32(0)
	if opts.DoDirt {
		dirt = opts.DirtIntensity
	}
	sh.SetFloat("dirtIntensity", dirt)
	sh.SetFloat("shadowIntensity", opts.ShadowIntensity)
	sh.SetVec3("uAmbient", ambientVec)
	if r.Shapes.ScreenQuad != nil {
		r.Shapes.ScreenQuad.RenderSingle(false, TopoTriangles, ModeAll, sh)
	}

	b.UnbindShader()
	UnbindTextureRange(b, 0, 6)
	b.ApplyState(stateOpaque)
	if opts.DoFSR {
		b.BindFramebuffer(nil)
	}
}

func (r *Renderer) fsrPass(opts *RenderOptions) {
	easu := r.Shaders.FsrEasu
	rcas := r.Shaders.FsrRcas
	if r.ScratchBuffer.Color == nil || r.FSRBuffer.EASU == nil || easu == nil || rcas == nil {
		return
	}
	b := r.Backend
	nw := b.GetNativeWidth()
	nh := b.GetNativeHeight()

	b.ApplyState(statePostProcess)

	b.BindFramebuffer(r.FSRBuffer.Framebuffer)
	b.SetViewport(0, 0, nw, nh)
	easu.Bind()
	easu.SetInt("colorBuffer", 0)
	r.fsrCon0[0] = float32(r.Width)
	r.fsrCon0[1] = float32(r.Height)
	r.fsrCon0[2] = float32(nw)
	r.fsrCon0[3] = float32(nh)
	easu.SetVec4("con0", r.fsrCon0)
	r.ScratchBuffer.Color.Bind(0)
	if r.Shapes.ScreenQuad != nil {
		r.Shapes.ScreenQuad.RenderSingle(false, TopoTriangles, ModeAll, easu)
	}

	b.BindFramebuffer(nil)
	b.SetViewport(0, 0, nw, nh)
	r.FSRBuffer.EASU.Bind(0)
	rcas.Bind()
	rcas.SetInt("colorBuffer", 0)
	sharp := opts.FsrSharpness
	if sharp == 0 {
		sharp = 0.2
	}
	rcas.SetFloat("sharpness", sharp)
	if r.Shapes.ScreenQuad != nil {
		r.Shapes.ScreenQuad.RenderSingle(false, TopoTriangles, ModeAll, rcas)
	}

	b.ApplyState(stateOpaque)
	b.UnbindShader()
	UnbindTextureRange(b, 0, 1)
}

// ---------------------------------------------------------------------------
// Kawase blur: ping-pongs a source texture through its BlurFB with growing
// offsets; odd iteration counts end with an identity copy back to the source.
// ---------------------------------------------------------------------------

func (r *Renderer) startBlurPass(source int) {
	switch source {
	case BlurSourceShadow:
		r.blurSource = r.ShadowBuffer.Shadow
		r.blurSourceFB = r.ShadowBuffer.BlurFB
	case BlurSourceLighting:
		r.blurSource = r.LightBuffer.Light
		r.blurSourceFB = r.LightBuffer.BlurFB
	case BlurSourceEmissive:
		r.blurSource = r.GBuffer.Emissive
		r.blurSourceFB = r.EmissiveFB
	default:
		r.blurSource = nil
		r.blurSourceFB = nil
	}
	r.Backend.SetViewport(0, 0, r.Width, r.Height)
}

func (r *Renderer) swapBlur(i int) {
	b := r.Backend
	if i%2 == 0 {
		b.BindFramebuffer(r.ScratchBuffer.Framebuffer)
		r.blurSource.Bind(0)
	} else {
		b.BindFramebuffer(r.blurSourceFB)
		r.ScratchBuffer.Color.Bind(0)
	}
	b.Clear(clearTransparent)
}

func (r *Renderer) endBlurPass(iterations int) {
	b := r.Backend
	UnbindTexture(b, 0)
	if iterations%2 != 0 && r.blurSourceFB != nil {
		// Odd iteration count: copy scratch back to the source with an identity sample.
		b.BindFramebuffer(r.blurSourceFB)
		b.Clear(clearTransparent)
		r.ScratchBuffer.Color.Bind(0)
		r.Shaders.KawaseBlur.SetFloat("offset", blurIdentityOffset)
		if r.Shapes.ScreenQuad != nil {
			r.Shapes.ScreenQuad.RenderSingle(false, TopoTriangles, ModeAll, r.Shaders.KawaseBlur)
		}
		UnbindTexture(b, 0)
	}
	b.BindFramebuffer(nil)
}

func (r *Renderer) blurImage(source int, iterations int, radius float32) {
	blur := r.Shaders.KawaseBlur
	if iterations <= 0 || blur == nil || r.ScratchBuffer.Framebuffer == nil {
		return
	}
	b := r.Backend
	b.ApplyState(statePostProcess)
	blur.Bind()
	blur.SetInt("colorBuffer", 0)
	r.startBlurPass(source)
	if r.blurSource == nil {
		b.UnbindShader()
		b.ApplyState(stateOpaque)
		return
	}
	for i := 0; i < iterations; i++ {
		r.swapBlur(i)
		blur.SetFloat("offset", float32(i+1)*radius)
		if r.Shapes.ScreenQuad != nil {
			r.Shapes.ScreenQuad.RenderSingle(false, TopoTriangles, ModeAll, blur)
		}
	}
	r.endBlurPass(iterations)
	b.UnbindShader()
	b.ApplyState(stateOpaque)
}

// ---------------------------------------------------------------------------
// Light sorting and the LightingData UBO staging buffer
// ---------------------------------------------------------------------------

// LightScore pairs a light index with its contribution score for sorting.
type LightScore struct {
	Index int
	Score float32
}

// LightSorter sorts lights by intensity/distance² without per-frame allocation.
// Entries[0:Count] are valid after Add; Sort orders them by descending Score.
type LightSorter struct {
	Entries []LightScore
	Count   int
}

// NewLightSorter pre-allocates room for capacity lights.
func NewLightSorter(capacity int) *LightSorter {
	return &LightSorter{Entries: make([]LightScore, capacity)}
}

// Begin resets the sorter for a new frame.
func (s *LightSorter) Begin() {
	s.Count = 0
}

// Add records a light's contribution score (see LightDrawable.LightScore).
// The buffer doubles when full so no visible light is ever dropped.
func (s *LightSorter) Add(index int, score float32) {
	if s.Count >= len(s.Entries) {
		newCap := len(s.Entries) * 2
		if newCap < 8 {
			newCap = 8
		}
		grown := make([]LightScore, newCap)
		for i := 0; i < s.Count; i++ {
			grown[i].Index = s.Entries[i].Index
			grown[i].Score = s.Entries[i].Score
		}
		s.Entries = grown
	}
	s.Entries[s.Count].Index = index
	s.Entries[s.Count].Score = score
	s.Count++
}

// ContributionScore is the default LightScore: intensity / distance² to cam.
func ContributionScore(x, y, z, intensity float32, cam *mathx.Vec3) float32 {
	dx := x - cam.X
	dy := y - cam.Y
	dz := z - cam.Z
	d2 := dx*dx + dy*dy + dz*dz
	if d2 == 0 {
		d2 = 1
	}
	return intensity / d2
}

// Sort orders Entries[0:Count] by descending score (in-place insertion sort;
// light counts are small and this avoids comparator closures/allocations).
func (s *LightSorter) Sort() {
	e := s.Entries
	for i := 1; i < s.Count; i++ {
		for j := i; j > 0 && e[j].Score > e[j-1].Score; j-- {
			idx := e[j].Index
			sc := e[j].Score
			e[j].Index = e[j-1].Index
			e[j].Score = e[j-1].Score
			e[j-1].Index = idx
			e[j-1].Score = sc
		}
	}
}

// LightingData is the CPU staging buffer for the LightingData UBO.
type LightingData struct {
	Data       []float32
	PointCount int
	SpotCount  int
}

// NewLightingData allocates the 116-float staging buffer.
func NewLightingData() *LightingData {
	return &LightingData{Data: make([]float32, LightingDataSize)}
}

// Reset zeroes the light counts; unused slots keep stale data, which the
// shaders never read because they loop over the uploaded counts.
func (l *LightingData) Reset() {
	l.PointCount = 0
	l.SpotCount = 0
}

// AddPointLight writes a point light (posSize, colorIntensity); returns false when full.
func (l *LightingData) AddPointLight(x, y, z, size, cr, cg, cb, intensity float32) bool {
	if l.PointCount >= MaxPointLights {
		return false
	}
	base := l.PointCount * 8
	d := l.Data
	d[base] = x
	d[base+1] = y
	d[base+2] = z
	d[base+3] = size
	d[base+4] = cr
	d[base+5] = cg
	d[base+6] = cb
	d[base+7] = intensity
	l.PointCount++
	return true
}

// AddSpotLight writes a spot light (posRange, colorIntensity, dirCutoff); returns false when full.
func (l *LightingData) AddSpotLight(x, y, z, rng, cr, cg, cb, intensity, dx, dy, dz, cutoff float32) bool {
	if l.SpotCount >= MaxSpotLights {
		return false
	}
	base := 64 + l.SpotCount*12
	d := l.Data
	d[base] = x
	d[base+1] = y
	d[base+2] = z
	d[base+3] = rng
	d[base+4] = cr
	d[base+5] = cg
	d[base+6] = cb
	d[base+7] = intensity
	d[base+8] = dx
	d[base+9] = dy
	d[base+10] = dz
	d[base+11] = cutoff
	l.SpotCount++
	return true
}

// Upload writes the counts and pushes the buffer to the renderer's LightingUBO.
func (l *LightingData) Upload(r *Renderer) {
	l.Data[112] = float32(l.PointCount)
	l.Data[113] = float32(l.SpotCount)
	if r == nil || r.Backend == nil || r.LightingUBO == nil {
		return
	}
	r.Backend.UpdateUBO(r.LightingUBO, l.Data, 0)
	r.Backend.BindUniformBuffer(r.LightingUBO)
}
