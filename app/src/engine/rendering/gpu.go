package rendering

// WebGPU bit-flag constants. Declared in Go rather than read from the
// GPUBufferUsage/GPUTextureUsage globals so headless tests (no WebGPU
// globals) can exercise resource creation against a fake device.
const (
	BufferUsageCopySrc = 0x0004
	BufferUsageCopyDst = 0x0008
	BufferUsageIndex   = 0x0010
	BufferUsageVertex  = 0x0020
	BufferUsageUniform = 0x0040
	BufferUsageStorage = 0x0080

	TextureUsageCopySrc          = 0x01
	TextureUsageCopyDst          = 0x02
	TextureUsageTextureBinding   = 0x04
	TextureUsageStorageBinding   = 0x08
	TextureUsageRenderAttachment = 0x10

	ShaderStageVertex   = 0x1
	ShaderStageFragment = 0x2
	ShaderStageCompute  = 0x4

	ColorWriteAll = 0xF
)

// Texture formats used by the renderer.
const (
	FormatRGBA8   = "rgba8unorm"
	FormatRGBA16F = "rgba16float"
	FormatR8      = "r8unorm"
	FormatDepth   = "depth24plus"
)

// Bind group slots (see wgsl.go for the per-group contents).
const (
	GroupFrame    = 0
	GroupMaterial = 1
	GroupObject   = 2
	GroupLighting = 3
)

// ObjectData ring layout: 256-byte slots so dynamic offsets satisfy
// minUniformBufferOffsetAlignment on every adapter.
const (
	ObjectStride = 256
	ObjectFloats = ObjectStride / 4
	// ObjectRingSlots bounds the number of draws per frame (1 MiB).
	ObjectRingSlots = 4096

	objWorld   = 0
	objProbe   = 16
	objParams0 = 20
	objParams1 = 24
	objParams2 = 28
	objMisc    = 32
)

// Bone storage ring: mat4 entries, indexed by ObjectData.misc.x.
const (
	BoneRingMats   = 8192
	BoneRingFloats = BoneRingMats * 16
)

// Light storage buffer: 3 vec4 per light.
const (
	LightFloats    = 12
	MaxSceneLights = 256
	// LightingDataFloats is the size of the LightingData uniform (ambient + counts).
	LightingDataFloats = 8
)

func mipLevelCountFor(w, h int) int {
	maxDim := w
	if h > maxDim {
		maxDim = h
	}
	levels := 1
	for maxDim > 1 {
		maxDim >>= 1
		levels++
	}
	return levels
}

func align4(n int) int {
	return (n + 3) &^ 3
}

// BindingEntry builds a GPUBindGroupEntry.
func BindingEntry(binding int, resource any) map[string]any {
	return map[string]any{"binding": binding, "resource": resource}
}

func bindingEntry(binding int, resource any) map[string]any {
	return BindingEntry(binding, resource)
}

// BufferBinding builds a GPUBufferBinding resource covering [0, size).
func BufferBinding(buffer GPUBuffer, size int) map[string]any {
	return map[string]any{"buffer": buffer, "offset": 0, "size": size}
}

func bufferBinding(buffer GPUBuffer, size int) map[string]any {
	return BufferBinding(buffer, size)
}

func layoutBuffer(binding, visibility int, kind string, dynamic bool) map[string]any {
	return map[string]any{
		"binding":    binding,
		"visibility": visibility,
		"buffer":     map[string]any{"type": kind, "hasDynamicOffset": dynamic},
	}
}

func layoutTexture(binding, visibility int, sampleType string) map[string]any {
	return map[string]any{
		"binding":    binding,
		"visibility": visibility,
		"texture":    map[string]any{"sampleType": sampleType},
	}
}

func layoutStorageTexture(binding, visibility int, format string) map[string]any {
	return map[string]any{
		"binding":        binding,
		"visibility":     visibility,
		"storageTexture": map[string]any{"access": "write-only", "format": format},
	}
}

func layoutSampler(binding, visibility int) map[string]any {
	return map[string]any{
		"binding":    binding,
		"visibility": visibility,
		"sampler":    map[string]any{"type": "filtering"},
	}
}
