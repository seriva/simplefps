package rendering

import (
	"js:./interop.d.ts"
)

// MaterialData UBO scratch (std140, 32 bytes): ivec4 flags + vec4 params.
// materialUBOFloats is a Float32Array view over the same buffer as materialUBOInts.
var (
	materialUBOInts   = make([]int32, 8)
	materialUBOFloats []float32
)

// PackMaterialData writes m's UBO layout into the shared scratch buffer and
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

// Material represents surface properties, shader bindings, and textures for rendering.
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

	backend RenderBackend
	ubo     any
}

// NewMaterial creates a Material with default properties whose UBO lives on b.
func NewMaterial(b RenderBackend, name string) *Material {
	return &Material{
		Name:               name,
		GeomType:           1,
		ReflectionStrength: 1.0,
		Translucent:        false,
		DoubleSided:        false,
		Opacity:            1.0,
		backend:            b,
	}
}

// Bind sets texture units, updates the MaterialData UBO, and updates cull states.
func (m *Material) Bind(shader *Shader) {
	if shader == nil {
		return
	}

	// Bind textures
	if m.AlbedoTexture != nil {
		shader.SetInt("colorSampler", 0)
		m.AlbedoTexture.Bind(0)
	}
	if m.EmissiveTexture != nil {
		shader.SetInt("emissiveSampler", 1)
		m.EmissiveTexture.Bind(1)
	}
	if m.ReflectionTexture != nil {
		shader.SetInt("reflectionSampler", 2)
		m.ReflectionTexture.Bind(2)
	}
	if m.ReflectionMaskTexture != nil {
		shader.SetInt("reflectionMaskSampler", 3)
		m.ReflectionMaskTexture.Bind(3)
	}
	if m.LightmapTexture != nil {
		shader.SetInt("lightmapSampler", 4)
		m.LightmapTexture.Bind(4)
	}

	// Material UBO: 32 bytes (binding point 1)
	// ivec4 flags (geomType, doEmissive, doReflection, hasLightmap)
	// vec4 params (reflectionStrength, opacity, pad, pad)
	b := m.backend
	if m.ubo == nil && b != nil {
		m.ubo = b.CreateUBO(32, 1)
	}

	if m.ubo != nil && b != nil {
		PackMaterialData(m)
		b.UpdateUBO(m.ubo, materialUBOInts, 0)
		b.BindUniformBuffer(m.ubo)
	}
}

// Unbind detaches material textures.
func (m *Material) Unbind() {
	UnbindTextureRange(m.backend, 0, 5)
}

// Dispose releases GPU buffers owned by the material.
func (m *Material) Dispose() {
	if m.ubo != nil && m.backend != nil {
		m.backend.DeleteUBO(m.ubo)
		m.ubo = nil
	}
}
