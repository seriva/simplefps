package rendering

// MaterialMode filters a mesh's index groups by material translucency.
type MaterialMode string

const (
	ModeAll         MaterialMode = "all"
	ModeOpaque      MaterialMode = "opaque"
	ModeTranslucent MaterialMode = "translucent"
)

// BlendFactor is a source/destination blend factor.
type BlendFactor string

const (
	BlendZero            BlendFactor = "zero"
	BlendOne             BlendFactor = "one"
	BlendSrcAlpha        BlendFactor = "src-alpha"
	BlendOneMinusSrcAlpha BlendFactor = "one-minus-src-alpha"
	BlendDstColor        BlendFactor = "dst-color"
)

// DepthFunc is the depth comparison function (GL naming).
type DepthFunc string

const (
	DepthNever    DepthFunc = "never"
	DepthLess     DepthFunc = "less"
	DepthEqual    DepthFunc = "equal"
	DepthLEqual   DepthFunc = "lequal"
	DepthGreater  DepthFunc = "greater"
	DepthNotEqual DepthFunc = "notequal"
	DepthGEqual   DepthFunc = "gequal"
	DepthAlways   DepthFunc = "always"
)

// CullFace selects which triangle facing is discarded when culling is on.
type CullFace string

const (
	CullBack  CullFace = "back"
	CullFront CullFace = "front"
)

// Topology is the primitive type of an indexed draw.
type Topology string

const (
	TopoTriangles     Topology = "triangles"
	TopoLines         Topology = "lines"
	TopoPoints        Topology = "points"
	TopoTriangleStrip Topology = "triangle-strip"
)

// BufferUsage declares what a GPU buffer is bound as.
type BufferUsage string

const (
	UsageVertex  BufferUsage = "vertex"
	UsageIndex   BufferUsage = "index"
	UsageUniform BufferUsage = "uniform"
)

// Colour write mask bits for PipelineState.ColorMask.
const (
	ColorMaskR   uint8 = 1 << 0
	ColorMaskG   uint8 = 1 << 1
	ColorMaskB   uint8 = 1 << 2
	ColorMaskA   uint8 = 1 << 3
	ColorMaskAll uint8 = ColorMaskR | ColorMaskG | ColorMaskB | ColorMaskA
)

// PipelineState is the complete fixed-function state a pass draws with.
// Presets are built once at package init and applied by pointer; the backends
// never mutate them. ColorMask is a bitmask rather than [4]bool because GoFront
// clones arrays on every copy.
type PipelineState struct {
	Blend      bool
	SrcFactor  BlendFactor
	DstFactor  BlendFactor
	DepthTest  bool
	DepthWrite bool
	DepthFunc  DepthFunc
	Cull       bool
	CullFace   CullFace
	PolyOffset bool
	// OffsetFactor/OffsetUnits are the glPolygonOffset arguments (WebGPU maps
	// them to depthBiasSlopeScale/depthBias).
	OffsetFactor float32
	OffsetUnits  float32
	ColorMask    uint8
	// CullOff is this state with culling disabled, used for double-sided
	// materials inside a pass; nil when Cull is already false.
	CullOff *PipelineState
}

// withCullOff builds s.CullOff from s and returns s; presets with Cull set
// call it once at package init so per-draw toggles never allocate.
func withCullOff(s *PipelineState) *PipelineState {
	if !s.Cull {
		return s
	}
	s.CullOff = &PipelineState{
		Blend:        s.Blend,
		SrcFactor:    s.SrcFactor,
		DstFactor:    s.DstFactor,
		DepthTest:    s.DepthTest,
		DepthWrite:   s.DepthWrite,
		DepthFunc:    s.DepthFunc,
		Cull:         false,
		CullFace:     s.CullFace,
		PolyOffset:   s.PolyOffset,
		OffsetFactor: s.OffsetFactor,
		OffsetUnits:  s.OffsetUnits,
		ColorMask:    s.ColorMask,
	}
	return s
}
