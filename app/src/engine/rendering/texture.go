package rendering

import (
	"js:./interop.d.ts"
)

// DefaultAnisotropy defines the anisotropic filtering level applied to textures.
var DefaultAnisotropy int = 16

// TextureDescriptor describes a sampled texture created by NewTexture.
type TextureDescriptor struct {
	Width   int
	Height  int
	Format  string // "" = rgba8unorm
	Mipmaps bool
	// Data is tightly packed RGBA8 pixel data uploaded into mip 0.
	Data []uint8
}

// Texture is a GPU texture plus the view and sampler bind groups refer to.
// Version increments whenever View or Sampler is replaced so cached bind
// groups can detect staleness without string keys.
type Texture struct {
	backend   *Backend
	GPU       GPUTexture
	View      GPUTextureView
	Sampler   GPUSampler
	Width     int
	Height    int
	Format    string
	MipLevels int
	Version   int

	wrap       string
	minFilter  string
	magFilter  string
	mipFilter  string
	anisotropy int

	spriteBG        GPUBindGroup
	spriteBGVersion int
}

func newTextureShell(b *Backend) *Texture {
	return &Texture{
		backend:    b,
		Format:     FormatRGBA8,
		MipLevels:  1,
		wrap:       "clamp-to-edge",
		minFilter:  "linear",
		magFilter:  "linear",
		mipFilter:  "linear",
		anisotropy: 1,
	}
}

// NewTexture creates a sampled (and optionally uploaded) texture on b.
func NewTexture(b *Backend, desc *TextureDescriptor) *Texture {
	t := newTextureShell(b)
	if b == nil || !b.ready || desc == nil {
		return t
	}
	w := desc.Width
	if w <= 0 {
		w = 1
	}
	h := desc.Height
	if h <= 0 {
		h = 1
	}
	format := desc.Format
	if format == "" {
		format = FormatRGBA8
	}
	levels := 1
	if desc.Mipmaps {
		levels = mipLevelCountFor(w, h)
	}
	t.allocate("texture", w, h, levels, format, TextureUsageTextureBinding|TextureUsageCopyDst|TextureUsageRenderAttachment)
	if desc.Data != nil {
		b.WriteTexture(t.GPU, w, h, desc.Data)
	}
	t.rebuildSampler()
	return t
}

// NewRenderTarget creates a w×h attachment texture. storage additionally
// allows compute shaders to write it (rgba8unorm only).
func NewRenderTarget(b *Backend, label string, w, h int, format string, storage bool) *Texture {
	t := newTextureShell(b)
	if b == nil || !b.ready {
		return t
	}
	usage := TextureUsageTextureBinding | TextureUsageRenderAttachment
	if format != FormatDepth {
		usage |= TextureUsageCopyDst
	}
	if storage {
		usage |= TextureUsageStorageBinding
	}
	t.allocate(label, w, h, 1, format, usage)
	t.Sampler = b.ClampSampler
	return t
}

// CreateSolidColorTexture creates a 1x1 RGBA texture on backend.
func CreateSolidColorTexture(backend *Backend, r, g, b, a uint8) *Texture {
	return NewTexture(backend, &TextureDescriptor{Width: 1, Height: 1, Data: []uint8{r, g, b, a}})
}

func (t *Texture) allocate(label string, w, h, levels int, format string, usage int) {
	if t.GPU != nil {
		t.GPU.destroy()
	}
	t.GPU = t.backend.CreateGPUTexture(label, w, h, levels, format, usage)
	t.View = t.GPU.createView(nil)
	t.Width = w
	t.Height = h
	t.Format = format
	t.MipLevels = levels
	t.Version++
}

func (t *Texture) rebuildSampler() {
	if t.backend == nil || !t.backend.ready {
		return
	}
	t.Sampler = t.backend.CreateSampler(t.wrap, t.minFilter, t.magFilter, t.mipFilter, t.anisotropy)
	t.Version++
}

// SetWrapMode configures texture edge wrapping ("repeat", "clamp-to-edge",
// "mirror-repeat").
func (t *Texture) SetWrapMode(mode string) {
	if mode == "mirrored-repeat" {
		mode = "mirror-repeat"
	}
	t.wrap = mode
	t.rebuildSampler()
}

// SetFilter configures minification, magnification, and mipmap filters.
func (t *Texture) SetFilter(minFilter, magFilter, mipFilter string) {
	t.minFilter = minFilter
	t.magFilter = magFilter
	t.mipFilter = mipFilter
	t.rebuildSampler()
}

// SetAnisotropy sets the sampler's max anisotropy.
func (t *Texture) SetAnisotropy(level int) {
	t.anisotropy = level
	t.rebuildSampler()
}

// GenerateMipmaps fills the mip chain from level 0.
func (t *Texture) GenerateMipmaps() {
	if t.backend != nil && t.GPU != nil {
		t.backend.GenerateMipmaps(t.GPU, t.Format, t.MipLevels)
	}
}

// UploadImage replaces the texture contents with a decoded image (any
// GPUImageCopyExternalImage source), reallocating with a full mip chain.
func (t *Texture) UploadImage(image any, w, h int) {
	if t.backend == nil || !t.backend.ready || image == nil || w <= 0 || h <= 0 {
		return
	}
	levels := mipLevelCountFor(w, h)
	if t.GPU == nil || t.Width != w || t.Height != h || t.MipLevels != levels {
		t.allocate("image", w, h, levels, FormatRGBA8, TextureUsageTextureBinding|TextureUsageCopyDst|TextureUsageRenderAttachment)
	}
	t.backend.CopyImageToTexture(t.GPU, image, w, h)
	t.GenerateMipmaps()
}

// LoadImageTexture decodes a Blob via an Image element and uploads it.
func (t *Texture) LoadImageTexture(imageData any) {
	if Image == nil || URL == nil {
		return
	}
	img := Reflect.construct(Image, []any{})
	img.onload = func() {
		if t.backend == nil {
			return
		}
		t.UploadImage(img, img.width.(int), img.height.(int))
		if DefaultAnisotropy > 1 {
			t.anisotropy = DefaultAnisotropy
		}
		t.rebuildSampler()
		if URL != nil && URL.revokeObjectURL != nil {
			URL.revokeObjectURL(img.src)
		}
	}
	if URL != nil && URL.createObjectURL != nil {
		img.src = URL.createObjectURL(imageData)
	}
}

// SpriteBindGroup returns the (sampler, view) bind group for the billboard
// pipelines, rebuilt when the texture changed.
func (t *Texture) SpriteBindGroup(r *Renderer) GPUBindGroup {
	if t.spriteBG == nil || t.spriteBGVersion != t.Version {
		t.spriteBG = r.Backend.CreateBindGroup("sprite", r.Layouts.Sprite, []any{
			bindingEntry(0, samplerOf(t, r.Backend)),
			bindingEntry(1, viewOf(t, r.Backend)),
		})
		t.spriteBGVersion = t.Version
	}
	return t.spriteBG
}

// viewOf returns t's view or the backend's 1x1 white fallback.
func viewOf(t *Texture, b *Backend) GPUTextureView {
	if t != nil && t.View != nil {
		return t.View
	}
	return b.DefaultTextureView
}

// samplerOf returns t's sampler or the backend's default sampler.
func samplerOf(t *Texture, b *Backend) GPUSampler {
	if t != nil && t.Sampler != nil {
		return t.Sampler
	}
	return b.DefaultSampler
}

// versionOf is 0 for nil textures.
func versionOf(t *Texture) int {
	if t == nil {
		return 0
	}
	return t.Version
}

// Dispose frees the texture from GPU memory.
func (t *Texture) Dispose() {
	if t.GPU != nil {
		t.GPU.destroy()
		t.GPU = nil
	}
	t.View = nil
	t.spriteBG = nil
	t.Version++
}
