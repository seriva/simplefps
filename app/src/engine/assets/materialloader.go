package assets

import (
	"encoding/json"

	"../rendering"
)

// textureSlots lists the material texture slots in the .mat schema.
var textureSlots = []string{"albedo", "emissive", "reflection", "reflectionMask", "lightmap"}

// MaterialDef is a parsed .mat entry with inheritance already resolved. The
// texture paths are bound to loaded textures by ResourceManager.resolveLinks.
type MaterialDef struct {
	Name     string
	Textures map[string]string // slot -> resource path
	Material *rendering.Material
}

type rawMaterialEntry struct {
	Name               string            `json:"name"`
	Base               string            `json:"base"`
	Textures           map[string]string `json:"textures"`
	GeomType           *int              `json:"geomType"`
	ReflectionStrength *float32          `json:"reflectionStrength"`
	Translucent        *bool             `json:"translucent"`
	DoubleSided        bool              `json:"doubleSided"`
	Opacity            *float32          `json:"opacity"`
}

type materialLibraryDoc struct {
	Materials []rawMaterialEntry `json:"materials"`
}

// TexturePaths returns every texture path referenced by the definition.
func (d *MaterialDef) TexturePaths() []string {
	paths := make([]string, 0)
	for i := 0; i < len(textureSlots); i++ {
		if p, ok := d.Textures[textureSlots[i]]; ok && p != "" {
			paths = append(paths, p)
		}
	}
	return paths
}

// ParseMaterialLibrary decodes a .mat JSON document
// ({materials:[{name, base?, textures{...}, geomType, reflectionStrength,
// translucent, doubleSided, opacity}]}) into materials. A `base` entry merges
// the base's textures (child wins) and inherits unset scalar properties, as
// Material.loadLibrary did. Materials are created on backend b.
func ParseMaterialLibrary(b *rendering.Backend, text string) []*MaterialDef {
	defs := make([]*MaterialDef, 0)
	var doc materialLibraryDoc
	if err := json.Unmarshal([]byte(text), &doc); err != nil || len(doc.Materials) == 0 {
		return defs
	}

	byName := map[string]*rawMaterialEntry{}
	for i := 0; i < len(doc.Materials); i++ {
		m := &doc.Materials[i]
		if m.Name != "" {
			byName[m.Name] = m
		}
	}

	for i := 0; i < len(doc.Materials); i++ {
		m := &doc.Materials[i]
		if m.Name == "" {
			continue
		}
		var base *rawMaterialEntry
		if m.Base != "" {
			base = byName[m.Base]
		}

		def := &MaterialDef{
			Name:     m.Name,
			Textures: map[string]string{},
		}
		if base != nil {
			copyTextureSlots(def.Textures, base.Textures)
		}
		copyTextureSlots(def.Textures, m.Textures)

		var baseGeom *int
		var baseRefl *float32
		var baseTrans *bool
		var baseOpacity *float32
		if base != nil {
			baseGeom = base.GeomType
			baseRefl = base.ReflectionStrength
			baseTrans = base.Translucent
			baseOpacity = base.Opacity
		}

		mat := rendering.NewMaterial(b, def.Name)
		mat.GeomType = inherit(m.GeomType, baseGeom, 1)
		mat.ReflectionStrength = inherit(m.ReflectionStrength, baseRefl, float32(1.0))
		mat.Translucent = inherit(m.Translucent, baseTrans, false)
		mat.DoubleSided = m.DoubleSided
		mat.Opacity = inherit(m.Opacity, baseOpacity, float32(1.0))
		def.Material = mat

		defs = append(defs, def)
	}
	return defs
}

func inherit[T any](own *T, baseVal *T, def T) T {
	if own != nil {
		return *own
	}
	if baseVal != nil {
		return *baseVal
	}
	return def
}

func copyTextureSlots(dst map[string]string, src map[string]string) {
	if src == nil {
		return
	}
	for i := 0; i < len(textureSlots); i++ {
		slot := textureSlots[i]
		if v, ok := src[slot]; ok && v != "" {
			dst[slot] = v
		}
	}
}
