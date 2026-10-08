package assets

import (
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
	parsed := JSON.parse(text)
	if parsed == nil || parsed.materials == nil {
		return defs
	}
	list := parsed.materials.([]any)

	byName := map[string]any{}
	for i := 0; i < len(list); i++ {
		m := list[i]
		if m != nil && m.name != nil {
			byName[m.name.(string)] = m
		}
	}

	for i := 0; i < len(list); i++ {
		m := list[i]
		if m == nil || m.name == nil {
			continue
		}
		var base any
		if m.base != nil {
			if b, ok := byName[m.base.(string)]; ok {
				base = b
			}
		}

		def := &MaterialDef{
			Name:     m.name.(string),
			Textures: map[string]string{},
		}
		if base != nil {
			copyTextureSlots(def.Textures, base.textures)
		}
		copyTextureSlots(def.Textures, m.textures)

		mat := rendering.NewMaterial(b, def.Name)
		mat.GeomType = jsonInt(inherit(m.geomType, base, "geomType"), 1)
		mat.ReflectionStrength = jsonFloat(inherit(m.reflectionStrength, base, "reflectionStrength"), 1.0)
		mat.Translucent = jsonBool(inherit(m.translucent, base, "translucent"), false)
		mat.DoubleSided = jsonBool(m.doubleSided, false)
		mat.Opacity = jsonFloat(inherit(m.opacity, base, "opacity"), 1.0)
		def.Material = mat

		defs = append(defs, def)
	}
	return defs
}

// inherit returns own when set, otherwise the base object's field.
func inherit(own any, base any, field string) any {
	if own != nil || base == nil {
		return own
	}
	return base[field]
}

func copyTextureSlots(dst map[string]string, src any) {
	if src == nil {
		return
	}
	for i := 0; i < len(textureSlots); i++ {
		slot := textureSlots[i]
		v := src[slot]
		if v != nil {
			dst[slot] = v.(string)
		}
	}
}

func jsonInt(v any, def int) int {
	if v == nil {
		return def
	}
	return int(v.(float64))
}

func jsonFloat(v any, def float32) float32 {
	if v == nil {
		return def
	}
	return float32(v.(float64))
}

func jsonBool(v any, def bool) bool {
	if v == nil {
		return def
	}
	return v.(bool)
}

func jsonString(v any, def string) string {
	if v == nil {
		return def
	}
	return v.(string)
}
