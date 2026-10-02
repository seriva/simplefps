package rendering

import (
	"js:./interop.d.ts"
)

// DefaultAnisotropy defines the anisotropic filtering level applied to textures.
var DefaultAnisotropy int = 16

// Texture encapsulates a GPU texture handle with filtering and wrapping
// parameters, bound to the backend that created it.
type Texture struct {
	backend RenderBackend
	handle  any
	filter  string
	wrap    string
}

// NewTexture creates a Texture on b configured by the provided descriptor.
func NewTexture(b RenderBackend, desc *TextureDescriptor) *Texture {
	t := &Texture{
		backend: b,
		wrap:    "clamp-to-edge",
	}
	if b != nil {
		t.handle = b.CreateTexture(desc)
		if desc != nil && desc.Data == nil && desc.PData == nil {
			b.SetTextureWrapMode(t.handle, "clamp-to-edge")
		}
	}
	return t
}

// CreateSolidColorTexture creates a 1x1 RGBA texture on backend.
func CreateSolidColorTexture(backend RenderBackend, r, g, b, a uint8) *Texture {
	t := &Texture{backend: backend}
	if backend != nil {
		desc := &TextureDescriptor{
			Width:   1,
			Height:  1,
			Mutable: true,
			PData:   []uint8{r, g, b, a},
		}
		t.handle = backend.CreateTexture(desc)
	}
	return t
}

// GetHandle returns the underlying GPU texture object.
func (t *Texture) GetHandle() any {
	return t.handle
}

// Bind activates the texture on the specified texture unit.
func (t *Texture) Bind(unit int) {
	if t.handle != nil && t.backend != nil {
		t.backend.BindTexture(t.handle, unit)
	}
}

// UnbindTexture detaches the texture on the given unit.
func UnbindTexture(b RenderBackend, unit int) {
	if b != nil {
		b.UnbindTexture(unit)
	}
}

// UnbindTextureRange detaches count textures starting at the given unit.
func UnbindTextureRange(b RenderBackend, start, count int) {
	if b != nil {
		for i := 0; i < count; i++ {
			b.UnbindTexture(start + i)
		}
	}
}

// SetWrapMode configures texture edge wrapping.
func (t *Texture) SetWrapMode(mode string) {
	t.wrap = mode
	if t.handle != nil && t.backend != nil {
		t.backend.SetTextureWrapMode(t.handle, mode)
	}
}

// SetFilter configures minification, magnification, and mipmap filters.
func (t *Texture) SetFilter(minFilter, magFilter, mipFilter string) {
	if t.handle != nil && t.backend != nil {
		t.backend.SetTextureFilter(t.handle, minFilter, magFilter, mipFilter)
	}
}

// LoadImageTexture uploads an HTMLImageElement or Blob to the texture.
func (t *Texture) LoadImageTexture(imageData any) {
	if Image == nil || URL == nil {
		return
	}
	img := Reflect.construct(Image, []any{})
	img.onload = func() {
		b := t.backend
		if t.handle == nil || b == nil {
			return
		}
		b.UploadTextureFromImage(t.handle, img)
		b.GenerateMipmaps(t.handle)
		wrapMode := t.wrap
		if wrapMode == "" {
			wrapMode = "repeat"
		}
		b.SetTextureWrapMode(t.handle, wrapMode)
		if DefaultAnisotropy > 1 {
			b.SetTextureAnisotropy(t.handle, DefaultAnisotropy)
		}
		if URL != nil && URL.revokeObjectURL != nil {
			URL.revokeObjectURL(img.src)
		}
	}
	if URL != nil && URL.createObjectURL != nil {
		img.src = URL.createObjectURL(imageData)
	}
}

// Dispose frees the texture from GPU memory.
func (t *Texture) Dispose() {
	if t.handle != nil && t.backend != nil {
		t.backend.DisposeTexture(t.handle)
		t.handle = nil
	}
}
