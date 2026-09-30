package rendering

import (
	"testing"

	"js:./interop.d.ts"
)

func TestMaterialDataByteLayout(t *testing.T) {
	m := NewMaterial("layout")
	m.GeomType = 2
	m.EmissiveTexture = &Texture{}
	m.LightmapTexture = &Texture{}
	m.ReflectionStrength = 1.0 // 0x3f800000
	m.Opacity = 0.5            // 0x3f000000

	ints := PackMaterialData(m)
	if len(ints) != 8 {
		t.Fatalf("MaterialData must be 8 x 4 bytes, got %d", len(ints))
	}
	bytes := Reflect.construct(globalThis.Uint8Array, []any{ints.buffer}).([]uint8)
	if len(bytes) != 32 {
		t.Fatalf("MaterialData must be 32 bytes, got %d", len(bytes))
	}

	// ivec4 flags: geomType, doEmissive, doReflection, hasLightmap (little-endian int32).
	expectInt := func(offset int, v int) {
		got := int(bytes[offset]) | int(bytes[offset+1])<<8 | int(bytes[offset+2])<<16 | int(bytes[offset+3])<<24
		if got != v {
			t.Errorf("int32 at byte %d = %d, want %d", offset, got, v)
		}
	}
	expectInt(0, 2)
	expectInt(4, 1)
	expectInt(8, 0)
	expectInt(12, 1)

	// vec4 params: reflectionStrength, opacity, pad, pad (IEEE-754 float32).
	if bytes[16] != 0 || bytes[17] != 0 || bytes[18] != 0x80 || bytes[19] != 0x3f {
		t.Errorf("reflectionStrength bytes = %v", bytes[16:20])
	}
	if bytes[20] != 0 || bytes[21] != 0 || bytes[22] != 0x00 || bytes[23] != 0x3f {
		t.Errorf("opacity bytes = %v", bytes[20:24])
	}
	expectInt(24, 0)
	expectInt(28, 0)

	// The scratch buffer is shared across calls (no per-bind allocation).
	m2 := NewMaterial("other")
	var buf1 any = ints.buffer
	var buf2 any = PackMaterialData(m2).buffer
	if buf1 != buf2 {
		t.Error("PackMaterialData must reuse the package-level buffer")
	}
}

func TestMaterialBindUploadsUBO(t *testing.T) {
	mb, _ := newMockRenderer(8, 8, false, false)
	m := NewMaterial("bind")
	m.Bind(nil)
	if mb.CountArg("CreateUBO", 1) != 1 {
		t.Error("Material.Bind must create a UBO on binding point 1")
	}
	if mb.Count("UpdateUBO") != 1 {
		t.Error("Material.Bind must upload the material UBO once")
	}
	m.Bind(nil)
	if mb.CountArg("CreateUBO", 1) != 1 {
		t.Error("Material.Bind must not recreate its UBO")
	}
}
