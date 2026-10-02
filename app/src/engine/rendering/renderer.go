package rendering

import (
	"../physics"
	"js:./interop.d.ts"
)

// CameraView provides viewing transforms and position for rendering.
type CameraView struct {
	Position              physics.Vec3
	View                  physics.Mat4
	Projection            physics.Mat4
	ViewProjection        physics.Mat4
	InverseViewProjection physics.Mat4
}

// GBuffer holds the render targets and textures for deferred geometry.
type GBuffer struct {
	Framebuffer   any
	WorldPosition *Texture
	Normal        *Texture
	Color         *Texture
	Emissive      *Texture
}

// ShadowBuffer stores the shadow mask texture and its blur target.
type ShadowBuffer struct {
	Framebuffer any
	BlurFB      any
	Shadow      *Texture
	Width       int
	Height      int
}

// LightBuffer stores accumulated scene illumination.
type LightBuffer struct {
	Framebuffer any
	BlurFB      any
	Light       *Texture
}

// ScratchBuffer provides the ping-pong render target for post-processing and blur.
type ScratchBuffer struct {
	Framebuffer any
	Color       *Texture
}

// FSRBuffer holds targets for FidelityFX Super Resolution passes.
type FSRBuffer struct {
	Framebuffer any
	EASU        *Texture
}

// FrameDataSize is the std140 size of the FrameData UBO in bytes (72 floats).
const FrameDataSize = 288

// frameData is the persistent staging buffer for the FrameData UBO.
var frameData = make([]float32, 72)

// Renderer drives the multi-pass deferred rendering pipeline and owns every
// GPU-side singleton (shader catalog, primitive shapes, per-frame stats).
type Renderer struct {
	Backend RenderBackend
	Shaders *ShaderCatalog
	Shapes  *Shapes
	// Stats is reset at the start of every Render call. Pointer rather than
	// value: GoFront clones struct-typed fields on read.
	Stats *RenderStats
	Debug *DebugRenderOptions
	Width   int
	Height  int
	DoFSR   bool
	// ProceduralDetail mirrors RenderOptions.ProceduralDetail for the current
	// frame so scene passes never read settings directly.
	ProceduralDetail bool

	// Depth is shared by the G-buffer, shadow FB and light FB.
	Depth         *Texture
	GBuffer       GBuffer
	EmissiveFB    any
	ShadowBuffer  ShadowBuffer
	LightBuffer   LightBuffer
	ScratchBuffer ScratchBuffer
	FSRBuffer     FSRBuffer

	ProceduralNoise *Texture

	FrameDataUBO any
	LightingUBO  any

	// Per-frame light ordering and the LightingData staging buffer.
	pointSorter *LightSorter
	spotSorter  *LightSorter
	lighting    *LightingData
	identity    physics.Mat4

	blurSource   *Texture
	blurSourceFB any
	fsrCon0      []float32
}

// NewRenderer creates an uninitialized Renderer tied to the specified backend.
// Call InitShaders and InitShapes before Init.
func NewRenderer(backend RenderBackend) *Renderer {
	return &Renderer{
		Backend:     backend,
		Shaders:     NewShaderCatalog(),
		Shapes:      &Shapes{},
		Stats:       &RenderStats{},
		Debug:       &DebugRenderOptions{},
		pointSorter: NewLightSorter(64),
		spotSorter:  NewLightSorter(64),
		lighting:    NewLightingData(),
		identity:    physics.NewMat4(),
		fsrCon0:     make([]float32, 4),
	}
}

// InitShaders compiles the shader catalog on the backend.
func (r *Renderer) InitShaders() {
	if r.Backend != nil {
		r.Backend.InitShaders(r.Shaders)
	}
}

// InitShapes builds the shared primitive meshes on the backend.
func (r *Renderer) InitShapes() {
	r.Shapes.Init(r.Backend)
}

// Init sets up render buffers and UBOs according to viewport dimensions.
func (r *Renderer) Init(width, height int, doFSR bool) {
	if r.Backend == nil {
		return
	}
	r.Width = width
	r.Height = height
	r.DoFSR = doFSR
	r.AllocateBuffers(doFSR)

	if r.FrameDataUBO == nil {
		r.FrameDataUBO = r.Backend.CreateUBO(FrameDataSize, 0)
		r.Backend.BindUniformBuffer(r.FrameDataUBO)
	}
	if r.LightingUBO == nil {
		r.LightingUBO = r.Backend.CreateUBO(LightingDataSize*4, 2)
	}
}

// AllocateBuffers allocates the G-buffer, shadow, light, scratch and (optionally) FSR
// targets at the current Width/Height; called from Init and Resize.
func (r *Renderer) AllocateBuffers(doFSR bool) {
	if r.Backend == nil || r.Width <= 0 || r.Height <= 0 {
		return
	}
	r.DisposeBuffers()
	r.DoFSR = doFSR
	w := r.Width
	h := r.Height
	b := r.Backend

	r.Depth = NewTexture(b, &TextureDescriptor{Width: w, Height: h, Format: "depth24"})

	r.GBuffer.WorldPosition = NewTexture(b, &TextureDescriptor{Width: w, Height: h, Format: "rgba16f"})
	r.GBuffer.Normal = NewTexture(b, &TextureDescriptor{Width: w, Height: h, Format: "rgba8"})
	r.GBuffer.Color = NewTexture(b, &TextureDescriptor{Width: w, Height: h, Format: "rgba8"})
	r.GBuffer.Emissive = NewTexture(b, &TextureDescriptor{Width: w, Height: h, Format: "rgba8"})

	r.GBuffer.Framebuffer = r.Backend.CreateFramebuffer(&FramebufferDescriptor{
		ColorAttachments: []any{
			r.GBuffer.WorldPosition.GetHandle(),
			r.GBuffer.Normal.GetHandle(),
			r.GBuffer.Color.GetHandle(),
			r.GBuffer.Emissive.GetHandle(),
		},
		DepthAttachment: r.Depth.GetHandle(),
		Width:           w,
		Height:          h,
	})
	r.EmissiveFB = r.Backend.CreateFramebuffer(&FramebufferDescriptor{
		ColorAttachments: []any{r.GBuffer.Emissive.GetHandle()},
		Width:            w,
		Height:           h,
	})

	r.ShadowBuffer.Width = w
	r.ShadowBuffer.Height = h
	r.ShadowBuffer.Shadow = NewTexture(b, &TextureDescriptor{Width: w, Height: h, Format: "r8"})
	r.ShadowBuffer.Framebuffer = r.Backend.CreateFramebuffer(&FramebufferDescriptor{
		ColorAttachments: []any{r.ShadowBuffer.Shadow.GetHandle()},
		DepthAttachment:  r.Depth.GetHandle(),
		Width:            w,
		Height:           h,
	})
	r.ShadowBuffer.BlurFB = r.Backend.CreateFramebuffer(&FramebufferDescriptor{
		ColorAttachments: []any{r.ShadowBuffer.Shadow.GetHandle()},
		Width:            w,
		Height:           h,
	})

	r.LightBuffer.Light = NewTexture(b, &TextureDescriptor{Width: w, Height: h, Format: "rgba8"})
	r.LightBuffer.Framebuffer = r.Backend.CreateFramebuffer(&FramebufferDescriptor{
		ColorAttachments: []any{r.LightBuffer.Light.GetHandle()},
		DepthAttachment:  r.Depth.GetHandle(),
		Width:            w,
		Height:           h,
	})
	r.LightBuffer.BlurFB = r.Backend.CreateFramebuffer(&FramebufferDescriptor{
		ColorAttachments: []any{r.LightBuffer.Light.GetHandle()},
		Width:            w,
		Height:           h,
	})

	r.ScratchBuffer.Color = NewTexture(b, &TextureDescriptor{Width: w, Height: h, Format: "rgba8"})
	r.ScratchBuffer.Framebuffer = r.Backend.CreateFramebuffer(&FramebufferDescriptor{
		ColorAttachments: []any{r.ScratchBuffer.Color.GetHandle()},
		Width:            w,
		Height:           h,
	})

	if r.ProceduralNoise == nil {
		r.ProceduralNoise = NewProceduralNoiseTexture(b, DefaultAnisotropy)
	}

	if doFSR {
		nw := r.Backend.GetNativeWidth()
		nh := r.Backend.GetNativeHeight()
		if nw < 1 {
			nw = 1
		}
		if nh < 1 {
			nh = 1
		}
		r.FSRBuffer.EASU = NewTexture(b, &TextureDescriptor{Width: nw, Height: nh, Format: "rgba8"})
		r.FSRBuffer.Framebuffer = r.Backend.CreateFramebuffer(&FramebufferDescriptor{
			ColorAttachments: []any{r.FSRBuffer.EASU.GetHandle()},
			Width:            nw,
			Height:           nh,
		})
	}
}

// Resize handles window or render scale changes.
func (r *Renderer) Resize(width, height int, doFSR bool) {
	if r.Width == width && r.Height == height && r.DoFSR == doFSR {
		return
	}
	r.Width = width
	r.Height = height
	if r.Backend != nil {
		r.Backend.Resize()
	}
	r.AllocateBuffers(doFSR)
}

func (r *Renderer) deleteFB(fb any) any {
	if fb != nil {
		r.Backend.DeleteFramebuffer(fb)
	}
	return nil
}

func disposeTex(t *Texture) *Texture {
	if t != nil {
		t.Dispose()
	}
	return nil
}

// DisposeBuffers frees allocated textures and framebuffers.
func (r *Renderer) DisposeBuffers() {
	if r.Backend == nil {
		return
	}
	r.GBuffer.Framebuffer = r.deleteFB(r.GBuffer.Framebuffer)
	r.EmissiveFB = r.deleteFB(r.EmissiveFB)
	r.ShadowBuffer.Framebuffer = r.deleteFB(r.ShadowBuffer.Framebuffer)
	r.ShadowBuffer.BlurFB = r.deleteFB(r.ShadowBuffer.BlurFB)
	r.LightBuffer.Framebuffer = r.deleteFB(r.LightBuffer.Framebuffer)
	r.LightBuffer.BlurFB = r.deleteFB(r.LightBuffer.BlurFB)
	r.ScratchBuffer.Framebuffer = r.deleteFB(r.ScratchBuffer.Framebuffer)
	r.FSRBuffer.Framebuffer = r.deleteFB(r.FSRBuffer.Framebuffer)

	r.Depth = disposeTex(r.Depth)
	r.GBuffer.WorldPosition = disposeTex(r.GBuffer.WorldPosition)
	r.GBuffer.Normal = disposeTex(r.GBuffer.Normal)
	r.GBuffer.Color = disposeTex(r.GBuffer.Color)
	r.GBuffer.Emissive = disposeTex(r.GBuffer.Emissive)
	r.ShadowBuffer.Shadow = disposeTex(r.ShadowBuffer.Shadow)
	r.LightBuffer.Light = disposeTex(r.LightBuffer.Light)
	r.ScratchBuffer.Color = disposeTex(r.ScratchBuffer.Color)
	r.FSRBuffer.EASU = disposeTex(r.FSRBuffer.EASU)
}

// Dispose shuts down the renderer and deletes all GPU allocations, including
// the shared shapes.
func (r *Renderer) Dispose() {
	r.DisposeBuffers()
	r.Shapes.Dispose()
	if r.Backend != nil {
		r.ProceduralNoise = disposeTex(r.ProceduralNoise)
		if r.FrameDataUBO != nil {
			r.Backend.DeleteUBO(r.FrameDataUBO)
			r.FrameDataUBO = nil
		}
		if r.LightingUBO != nil {
			r.Backend.DeleteUBO(r.LightingUBO)
			r.LightingUBO = nil
		}
	}
}

// UpdateFrameDataUBO uploads view/projection matrices, camera position + time,
// and the viewport vec4 (width, height, proceduralDetail flag, 0).
func (r *Renderer) UpdateFrameDataUBO(camera *CameraView, time float32, proceduralDetail bool) {
	if r.FrameDataUBO == nil || r.Backend == nil || camera == nil {
		return
	}
	PackFrameData(frameData, camera, time, float32(r.Backend.GetWidth()), float32(r.Backend.GetHeight()), proceduralDetail)
	r.Backend.UpdateUBO(r.FrameDataUBO, frameData, 0)
	r.Backend.BindUniformBuffer(r.FrameDataUBO)
}

// PackFrameData writes the FrameData std140 layout into out (len >= 72).
// Index loops instead of copy(out[a:b], …): slicing allocates a view per call.
func PackFrameData(out []float32, camera *CameraView, time float32, width, height float32, proceduralDetail bool) {
	for i := 0; i < 16; i++ {
		out[i] = camera.ViewProjection[i]
		out[16+i] = camera.InverseViewProjection[i]
		out[32+i] = camera.View[i]
		out[48+i] = camera.Projection[i]
	}
	out[64] = camera.Position.X
	out[65] = camera.Position.Y
	out[66] = camera.Position.Z
	out[67] = time
	out[68] = width
	out[69] = height
	if proceduralDetail {
		out[70] = 1.0
	} else {
		out[70] = 0.0
	}
	out[71] = 0.0
}

// CaptureSnapshot renders one frame and returns the canvas as a JPEG data URL
// ("" when unavailable).
func (r *Renderer) CaptureSnapshot(cam *CameraView, scene SceneSource, opts *RenderOptions) string {
	if r.Backend == nil {
		return ""
	}
	t := float32(0)
	if performance != nil && performance.now != nil {
		ts := performance.now()
		t = float32(ts.(float64) * 0.001)
	}
	r.Render(cam, scene, opts, t)
	canvas := r.Backend.GetCanvas()
	if canvas == nil || canvas.toDataURL == nil {
		return ""
	}
	result := ""
	func() {
		defer func() {
			if rec := recover(); rec != nil {
				result = ""
			}
		}()
		result = canvas.toDataURL("image/jpeg", 0.8).(string)
	}()
	return result
}
