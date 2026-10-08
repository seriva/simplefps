package rendering

import (
	"js:./interop.d.ts"
)

// MaterialMode filters index groups by translucency when drawing.
type MaterialMode int

const (
	ModeAll MaterialMode = iota
	ModeOpaque
	ModeTranslucent
)

// MaterialDataSize is the MaterialData uniform size in bytes
// (ivec4 flags + vec4 params).
const MaterialDataSize = 32

// Shared pack scratch: materialUBOFloats is a Float32Array view over the same
// buffer as materialUBOInts.
var (
	materialUBOInts   = make([]int32, 8)
	materialUBOFloats []float32
)

// PackMaterialData writes m's uniform layout into the shared scratch buffer and
// returns the int32 view (bytes 0..15 flags, 16..31 float params).
func PackMaterialData(m *Material) []int32 {
	if materialUBOFloats == nil {
		materialUBOFloats = Reflect.construct(globalThis.Float32Array, []any{materialUBOInts.buffer}).([]float32)
	}
	materialUBOInts[0] = int32(m.GeomType)
	materialUBOInts[1] = 0
	if m.EmissiveTexture != nil {
		materialUBOInts[1] = 1
	}
	materialUBOInts[2] = 0
	if m.ReflectionTexture != nil {
		materialUBOInts[2] = 1
	}
	materialUBOInts[3] = 0
	if m.LightmapTexture != nil {
		materialUBOInts[3] = 1
	}
	materialUBOFloats[4] = m.ReflectionStrength
	materialUBOFloats[5] = m.Opacity
	materialUBOFloats[6] = 0
	materialUBOFloats[7] = 0
	return materialUBOInts
}

// Material represents surface properties and textures. Its group-1 bind
// group is built lazily and rebuilt when any referenced texture changes.
type Material struct {
	Name               string
	GeomType           int
	ReflectionStrength float32
	Translucent        bool
	DoubleSided        bool
	Opacity            float32

	AlbedoTexture         *Texture
	EmissiveTexture       *Texture
	ReflectionTexture     *Texture
	ReflectionMaskTexture *Texture
	LightmapTexture       *Texture

	backend *Backend
	ubo     GPUBuffer
	// packed mirrors the last uploaded uniform contents.
	packed    []int32
	uploaded  bool
	bindGroup GPUBindGroup
	bgVersion int
}

// NewMaterial creates a Material with default properties whose UBO lives on b.
func NewMaterial(b *Backend, name string) *Material {
	return &Material{
		Name:               name,
		GeomType:           1,
		ReflectionStrength: 1.0,
		Opacity:            1.0,
		backend:            b,
		packed:             make([]int32, 8),
	}
}

// textureVersion sums the versions of every texture the bind group references.
func (m *Material) textureVersion(r *Renderer) int {
	return versionOf(m.AlbedoTexture) + versionOf(m.EmissiveTexture)*7 +
		versionOf(m.ReflectionTexture)*31 + versionOf(m.ReflectionMaskTexture)*127 +
		versionOf(m.LightmapTexture)*509 + versionOf(r.ProceduralNoise)*2039
}

// sync uploads the uniform when its contents changed since the last upload.
func (m *Material) sync() {
	if m.backend == nil || !m.backend.ready {
		return
	}
	PackMaterialData(m)
	changed := !m.uploaded
	for i := 0; i < 8; i++ {
		if m.packed[i] != materialUBOInts[i] {
			changed = true
			m.packed[i] = materialUBOInts[i]
		}
	}
	if !changed {
		return
	}
	if m.ubo == nil {
		m.ubo = m.backend.CreateBuffer("material-"+m.Name, MaterialDataSize, BufferUsageUniform, nil)
	}
	m.backend.WriteBuffer(m.ubo, 0, materialUBOInts)
	m.uploaded = true
}

// BindGroup returns the group-1 bind group for the material, syncing the
// uniform and rebuilding when textures changed.
func (m *Material) BindGroup(r *Renderer) GPUBindGroup {
	m.sync()
	if m.ubo == nil {
		return nil
	}
	v := m.textureVersion(r) + 1
	if m.bindGroup != nil && m.bgVersion == v {
		return m.bindGroup
	}
	b := r.Backend
	m.bindGroup = b.CreateBindGroup("material-"+m.Name, r.Layouts.Material, []any{
		bindingEntry(0, bufferBinding(m.ubo, MaterialDataSize)),
		bindingEntry(1, samplerOf(m.AlbedoTexture, b)),
		bindingEntry(2, viewOf(m.AlbedoTexture, b)),
		bindingEntry(3, viewOf(m.EmissiveTexture, b)),
		bindingEntry(4, viewOf(m.LightmapTexture, b)),
		bindingEntry(5, viewOf(r.ProceduralNoise, b)),
		bindingEntry(6, viewOf(m.ReflectionTexture, b)),
		bindingEntry(7, viewOf(m.ReflectionMaskTexture, b)),
		bindingEntry(8, samplerOf(m.LightmapTexture, b)),
	})
	m.bgVersion = v
	return m.bindGroup
}

// Invalidate forces the bind group to be rebuilt on next use (call after
// swapping textures on the material).
func (m *Material) Invalidate() {
	m.bindGroup = nil
}

// Dispose releases GPU buffers owned by the material.
func (m *Material) Dispose() {
	if m.ubo != nil && m.backend != nil {
		m.backend.DestroyBuffer(m.ubo)
		m.ubo = nil
	}
	m.bindGroup = nil
	m.uploaded = false
}
