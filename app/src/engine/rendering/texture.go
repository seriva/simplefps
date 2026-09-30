package rendering

import (
	"js:./interop.d.ts"
)

// DefaultAnisotropy defines the anisotropic filtering level applied to textures.
var DefaultAnisotropy int = 16

// Texture encapsulates a GPU texture handle with filtering and wrapping parameters.
type Texture struct {
	handle any
	filter string
	wrap   string
}

// NewTexture creates a Texture configured by the provided descriptor.
func NewTexture(desc *TextureDescriptor) *Texture {
	t := &Texture{
		wrap: "clamp-to-edge",
	}
	if ActiveBackend != nil {
		t.handle = ActiveBackend.CreateTexture(desc)
		if desc != nil && desc.Data == nil && desc.PData == nil {
			ActiveBackend.SetTextureWrapMode(t.handle, "clamp-to-edge")
		}
	}
	return t
}

// CreateSolidColorTexture creates a 1x1 RGBA texture.
func CreateSolidColorTexture(r, g, b, a uint8) *Texture {
	t := &Texture{}
	if ActiveBackend != nil {
		desc := &TextureDescriptor{
			Width:   1,
			Height:  1,
			Mutable: true,
			PData:   []uint8{r, g, b, a},
		}
		t.handle = ActiveBackend.CreateTexture(desc)
	}
	return t
}

// GetHandle returns the underlying GPU texture object.
func (t *Texture) GetHandle() any {
	return t.handle
}

// Bind activates the texture on the specified texture unit.
func (t *Texture) Bind(unit int) {
	if t.handle != nil && ActiveBackend != nil {
		ActiveBackend.BindTexture(t.handle, unit)
	}
}

// UnbindTexture detaches the texture on the given unit.
func UnbindTexture(unit int) {
	if ActiveBackend != nil {
		ActiveBackend.UnbindTexture(unit)
	}
}

// UnbindTextureRange detaches count textures starting at the given unit.
func UnbindTextureRange(start, count int) {
	if ActiveBackend != nil {
		for i := 0; i < count; i++ {
			ActiveBackend.UnbindTexture(start + i)
		}
	}
}

// SetWrapMode configures texture edge wrapping.
func (t *Texture) SetWrapMode(mode string) {
	t.wrap = mode
	if t.handle != nil && ActiveBackend != nil {
		ActiveBackend.SetTextureWrapMode(t.handle, mode)
	}
}

// SetFilter configures minification, magnification, and mipmap filters.
func (t *Texture) SetFilter(minFilter, magFilter, mipFilter string) {
	if t.handle != nil && ActiveBackend != nil {
		ActiveBackend.SetTextureFilter(t.handle, minFilter, magFilter, mipFilter)
	}
}

// LoadImageTexture uploads an HTMLImageElement or Blob to the texture.
func (t *Texture) LoadImageTexture(imageData any) {
	if Image == nil || URL == nil {
		return
	}
	img := Reflect.construct(Image, []any{})
	img.onload = func() {
		if t.handle == nil || ActiveBackend == nil {
			return
		}
		ActiveBackend.UploadTextureFromImage(t.handle, img)
		ActiveBackend.GenerateMipmaps(t.handle)
		wrapMode := t.wrap
		if wrapMode == "" {
			wrapMode = "repeat"
		}
		ActiveBackend.SetTextureWrapMode(t.handle, wrapMode)
		if DefaultAnisotropy > 1 {
			ActiveBackend.SetTextureAnisotropy(t.handle, DefaultAnisotropy)
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
	if t.handle != nil && ActiveBackend != nil {
		ActiveBackend.DisposeTexture(t.handle)
		t.handle = nil
	}
}
