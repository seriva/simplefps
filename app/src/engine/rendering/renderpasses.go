package rendering

import (
	"../physics"
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

var ActiveRenderStats = &RenderStats{}

// DebugRenderOptions controls overlay visualizations.
type DebugRenderOptions struct {
	ShowBoundingVolumes bool
	ShowWireframes      bool
	ShowLightVolumes    bool
	ShowSkeleton        bool
}

var ActiveDebugOptions = &DebugRenderOptions{}

// ClearRenderStats resets geometry metrics at the beginning of each frame.
func ClearRenderStats() {
	ActiveRenderStats.MeshCount = 0
	ActiveRenderStats.LightCount = 0
	ActiveRenderStats.TriangleCount = 0
}

// SceneSource is the minimal scene contract the renderer needs. The
// implementation lives in package scene (Phase 5); passes call back into it.
type SceneSource interface {
	Ambient(out *physics.Vec3)
	RenderWorldGeometry(r *Renderer)
	RenderFPSGeometry(r *Renderer)
	RenderShadows(r *Renderer)
	RenderLighting(r *Renderer)
	RenderTransparent(r *Renderer)
	RenderBillboards(r *Renderer)
	RenderDebug(r *Renderer)
	HasShadowCasters() bool
}

// RenderOptions carries the Settings values read by renderer.js each frame.
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
	ambientScratch    = &physics.Vec3{}
	ambientVec        = make([]float32, 3)
)

func sampleAmbient(scene SceneSource) {
	ambientScratch.X = 0
	ambientScratch.Y = 0
	ambientScratch.Z = 0
	if scene != nil {
		scene.Ambient(ambientScratch)
	}
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

// Render draws one full frame following the renderer.js stage order.
// scene may be nil (pre-Phase-5), in which case scene callbacks are skipped.
func (r *Renderer) Render(cam *CameraView, scene SceneSource, opts *RenderOptions, time float32) {
	if r.Backend == nil || opts == nil || r.GBuffer.Framebuffer == nil {
		return
	}
	b := r.Backend
	b.BeginFrame()

	sampleAmbient(scene)
	r.UpdateFrameDataUBO(cam, time, opts.ProceduralDetail)

	r.worldGeomPass(scene)
	r.shadowPass(scene)
	if opts.ShadowBlurIterations > 0 {
		r.shadowBlurPass(scene, opts)
	}
	r.fpsGeomPass(scene)
	r.lightingPass(scene, opts)
	r.transparentPass(scene)
	r.blurImage(BlurSourceEmissive, opts.EmissiveIterations, opts.EmissiveOffset)
	r.postProcessingPass(opts)
	if opts.DoFSR {
		r.fsrPass(opts)
	}
	if scene != nil {
		scene.RenderDebug(r)
	}

	b.EndFrame()
}

func (r *Renderer) worldGeomPass(scene SceneSource) {
	b := r.Backend
	b.SetDepthRange(0.1, 1.0)
	b.BindFramebuffer(r.GBuffer.Framebuffer)
	b.SetViewport(0, 0, r.Width, r.Height)
	b.Clear(clearAmbient)
	if r.ProceduralNoise != nil {
		r.ProceduralNoise.Bind(5)
	}
	if scene != nil {
		scene.RenderWorldGeometry(r)
	}
	b.BindFramebuffer(nil)
	b.SetDepthRange(0.0, 1.0)
}

func (r *Renderer) fpsGeomPass(scene SceneSource) {
	b := r.Backend
	b.SetDepthRange(0.0, 0.1)
	b.BindFramebuffer(r.GBuffer.Framebuffer)
	b.SetViewport(0, 0, r.Width, r.Height)
	if r.ProceduralNoise != nil {
		r.ProceduralNoise.Bind(5)
	}
	if scene != nil {
		scene.RenderFPSGeometry(r)
	}
	b.BindFramebuffer(nil)
	b.SetDepthRange(0.0, 1.0)
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
	b.SetColorMask(true, true, true, true)
	b.SetBlendState(false, "one", "zero")
	b.SetDepthState(true, false, "lequal")
	b.SetPolygonOffset(true, -1.0, -1.0)
	b.SetCullState(false, "back")

	if scene != nil {
		scene.RenderShadows(r)
	}

	b.SetCullState(true, "back")
	b.SetPolygonOffset(false, 0, 0)
	b.SetDepthState(true, true, "lequal")
	b.BindFramebuffer(nil)
	b.SetDepthRange(0.0, 1.0)
}

func (r *Renderer) shadowBlurPass(scene SceneSource, opts *RenderOptions) {
	// WebGPU shadow blur over-smooths the target on some drivers; keep raw map.
	if r.Backend.IsWebGPU() {
		return
	}
	if scene == nil || !scene.HasShadowCasters() {
		return
	}
	r.blurImage(BlurSourceShadow, opts.ShadowBlurIterations, opts.ShadowBlurOffset)
}

func (r *Renderer) lightingPass(scene SceneSource, opts *RenderOptions) {
	b := r.Backend
	b.BindFramebuffer(r.LightBuffer.Framebuffer)
	b.SetViewport(0, 0, r.Width, r.Height)
	b.Clear(clearAmbientColor)

	r.GBuffer.WorldPosition.Bind(0)
	r.GBuffer.Normal.Bind(1)
	r.ShadowBuffer.Shadow.Bind(2)
	r.GBuffer.Color.Bind(3)

	b.SetCullState(true, "back")
	b.SetDepthState(false, false, "lequal")
	b.SetBlendState(true, "one", "one")

	if scene != nil {
		scene.RenderLighting(r)
	}

	b.SetBlendState(false, "one", "zero")
	b.SetDepthState(true, true, "lequal")
	b.SetCullState(true, "back")

	UnbindTextureRange(0, 4)
	b.BindFramebuffer(nil)

	r.blurImage(BlurSourceLighting, opts.LightBlurIterations, 0.2)
}

func (r *Renderer) transparentPass(scene SceneSource) {
	b := r.Backend
	b.BindFramebuffer(r.LightBuffer.Framebuffer)
	b.SetViewport(0, 0, r.Width, r.Height)
	b.SetDepthRange(0.1, 1.0)

	b.SetBlendState(true, "src-alpha", "one-minus-src-alpha")
	b.SetDepthState(true, false, "lequal")
	b.SetCullState(false, "back")
	if scene != nil {
		scene.RenderTransparent(r)
	}

	b.SetBlendState(true, "src-alpha", "one")
	if scene != nil {
		scene.RenderBillboards(r)
	}

	b.SetCullState(true, "back")
	b.SetDepthState(true, true, "lequal")
	b.SetBlendState(false, "one", "zero")
	b.SetDepthRange(0.0, 1.0)
	b.BindFramebuffer(nil)
}

func (r *Renderer) postProcessingPass(opts *RenderOptions) {
	b := r.Backend
	sh := Shaders.PostProcessing
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
	if GlobalShapes.ScreenQuad != nil {
		GlobalShapes.ScreenQuad.RenderSingle(false, "triangles", "all", sh)
	}

	b.UnbindShader()
	UnbindTextureRange(0, 6)
	if opts.DoFSR {
		b.BindFramebuffer(nil)
	}
}

func (r *Renderer) fsrPass(opts *RenderOptions) {
	if r.ScratchBuffer.Color == nil || r.FSRBuffer.EASU == nil || Shaders.FsrEasu == nil || Shaders.FsrRcas == nil {
		return
	}
	b := r.Backend
	nw := b.GetNativeWidth()
	nh := b.GetNativeHeight()

	b.SetDepthState(false, false, "lequal")

	b.BindFramebuffer(r.FSRBuffer.Framebuffer)
	b.SetViewport(0, 0, nw, nh)
	Shaders.FsrEasu.Bind()
	Shaders.FsrEasu.SetInt("colorBuffer", 0)
	r.fsrCon0[0] = float32(r.Width)
	r.fsrCon0[1] = float32(r.Height)
	r.fsrCon0[2] = float32(nw)
	r.fsrCon0[3] = float32(nh)
	Shaders.FsrEasu.SetVec4("con0", r.fsrCon0)
	r.ScratchBuffer.Color.Bind(0)
	if GlobalShapes.ScreenQuad != nil {
		GlobalShapes.ScreenQuad.RenderSingle(false, "triangles", "all", Shaders.FsrEasu)
	}

	b.BindFramebuffer(nil)
	b.SetViewport(0, 0, nw, nh)
	r.FSRBuffer.EASU.Bind(0)
	Shaders.FsrRcas.Bind()
	Shaders.FsrRcas.SetInt("colorBuffer", 0)
	sharp := opts.FsrSharpness
	if sharp == 0 {
		sharp = 0.2
	}
	Shaders.FsrRcas.SetFloat("sharpness", sharp)
	if GlobalShapes.ScreenQuad != nil {
		GlobalShapes.ScreenQuad.RenderSingle(false, "triangles", "all", Shaders.FsrRcas)
	}

	b.SetDepthState(true, true, "lequal")
	b.UnbindShader()
	UnbindTextureRange(0, 1)
}

// ---------------------------------------------------------------------------
// Kawase blur (renderer.js _blurImage / _swapBlur / _endBlurPass)
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
	UnbindTexture(0)
	if iterations%2 != 0 && r.blurSourceFB != nil {
		// Odd iteration count: copy scratch back to the source with an identity sample.
		b.BindFramebuffer(r.blurSourceFB)
		b.Clear(clearTransparent)
		r.ScratchBuffer.Color.Bind(0)
		Shaders.KawaseBlur.SetFloat("offset", blurIdentityOffset)
		if GlobalShapes.ScreenQuad != nil {
			GlobalShapes.ScreenQuad.RenderSingle(false, "triangles", "all", Shaders.KawaseBlur)
		}
		UnbindTexture(0)
	}
	b.BindFramebuffer(nil)
}

func (r *Renderer) blurImage(source int, iterations int, radius float32) {
	if iterations <= 0 || Shaders.KawaseBlur == nil || r.ScratchBuffer.Framebuffer == nil {
		return
	}
	b := r.Backend
	b.SetDepthState(false, false, "lequal")
	b.SetBlendState(false, "one", "zero")
	b.SetCullState(false, "back")
	Shaders.KawaseBlur.Bind()
	Shaders.KawaseBlur.SetInt("colorBuffer", 0)
	r.startBlurPass(source)
	if r.blurSource == nil {
		b.UnbindShader()
		return
	}
	for i := 0; i < iterations; i++ {
		r.swapBlur(i)
		Shaders.KawaseBlur.SetFloat("offset", float32(i+1)*radius)
		if GlobalShapes.ScreenQuad != nil {
			GlobalShapes.ScreenQuad.RenderSingle(false, "triangles", "all", Shaders.KawaseBlur)
		}
	}
	r.endBlurPass(iterations)
	b.UnbindShader()
	b.SetDepthState(true, true, "lequal")
	b.SetCullState(true, "back")
	b.SetBlendState(false, "one", "zero")
}

// ---------------------------------------------------------------------------
// Lighting UBO helpers (renderpasses.js L292-372)
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

// Add records a light's world position and intensity relative to the camera.
// Returns false when the sorter is full.
func (s *LightSorter) Add(index int, x, y, z, intensity float32, cam *physics.Vec3) bool {
	if s.Count >= len(s.Entries) {
		return false
	}
	dx := x - cam.X
	dy := y - cam.Y
	dz := z - cam.Z
	d2 := dx*dx + dy*dy + dz*dz
	if d2 == 0 {
		d2 = 1
	}
	s.Entries[s.Count].Index = index
	s.Entries[s.Count].Score = intensity / d2
	s.Count++
	return true
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

// Reset zeroes the light counts (data for unused slots is left stale, as in JS).
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
