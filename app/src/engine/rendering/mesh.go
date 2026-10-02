package rendering

import (
	"../physics"
)

const (
	AttrPositions    = 0
	AttrUVs          = 1
	AttrNormals      = 2
	AttrLightmapUVs  = 3
	AttrJointIndices = 4
	AttrJointWeights = 5
)

// IndexGroup stores a sub-mesh triangle index array and its bound material name.
type IndexGroup struct {
	Material    string
	Array       []uint32
	IndexBuffer any
}

// WireframeBuffer caches line index buffers for debug wireframe passes.
type WireframeBuffer struct {
	Buffer any
	Count  int
}

// Mesh encapsulates GPU vertex buffers, index groups, and spatial bounding volume.
type Mesh struct {
	backend          RenderBackend
	Vertices         []float32
	UVs              []float32
	Normals          []float32
	LightmapUVs      []float32
	Indices          []IndexGroup
	VAO              any
	VertexBuffer     any
	UVBuffer         any
	NormalBuffer     any
	LightmapUVBuffer any
	TriangleCount    int
	HasUVs           bool
	HasNormals       bool
	HasLightmapUVs   bool

	Buffers          []any
	WireframeBuffers []WireframeBuffer
	BoundingBox      *physics.BoundingBox

	// Cached materials mapped by name
	MaterialLookup map[string]*Material
}

// NewMesh creates a Mesh on b and initializes its GPU buffers and AABB.
func NewMesh(b RenderBackend, vertices, uvs, normals, lightmapUVs []float32, indices []IndexGroup) *Mesh {
	m := &Mesh{
		backend:          b,
		Vertices:         vertices,
		UVs:              uvs,
		Normals:          normals,
		LightmapUVs:      lightmapUVs,
		Indices:          indices,
		Buffers:          make([]any, 0),
		WireframeBuffers: make([]WireframeBuffer, 0),
		MaterialLookup:   make(map[string]*Material),
	}
	m.InitMeshBuffers()
	m.UpdateBoundingBox()
	return m
}

// InitMeshBuffers allocates GPU buffers and builds the Vertex Array State.
func (m *Mesh) InitMeshBuffers() {
	m.HasUVs = len(m.UVs) > 0
	m.HasNormals = len(m.Normals) > 0
	m.HasLightmapUVs = len(m.LightmapUVs) > 0
	m.TriangleCount = 0
	for i := 0; i < len(m.Indices); i++ {
		m.TriangleCount += len(m.Indices[i].Array) / 3
	}

	if m.backend == nil || len(m.Vertices) == 0 {
		return
	}
	b := m.backend

	vertexCount := len(m.Vertices) / 3
	m.Buffers = make([]any, 0)

	// Create Index Buffers
	for i := 0; i < len(m.Indices); i++ {
		buf := b.CreateBuffer(m.Indices[i].Array, UsageIndex)
		m.Indices[i].IndexBuffer = buf
		m.Buffers = append(m.Buffers, buf)
	}

	// Positions
	m.VertexBuffer = b.CreateBuffer(m.Vertices, UsageVertex)
	m.Buffers = append(m.Buffers, m.VertexBuffer)
	posAttr := VertexAttribute{
		Buffer: m.VertexBuffer,
		Slot:   AttrPositions,
		Size:   3,
		Type:   "float",
	}

	// UVs
	uvs := m.UVs
	if !m.HasUVs {
		uvs = make([]float32, vertexCount*2)
	}
	m.UVBuffer = b.CreateBuffer(uvs, UsageVertex)
	m.Buffers = append(m.Buffers, m.UVBuffer)
	uvAttr := VertexAttribute{
		Buffer: m.UVBuffer,
		Slot:   AttrUVs,
		Size:   2,
		Type:   "float",
	}

	// Normals
	normals := m.Normals
	if !m.HasNormals {
		normals = make([]float32, vertexCount*3)
	}
	m.NormalBuffer = b.CreateBuffer(normals, UsageVertex)
	m.Buffers = append(m.Buffers, m.NormalBuffer)
	normalAttr := VertexAttribute{
		Buffer: m.NormalBuffer,
		Slot:   AttrNormals,
		Size:   3,
		Type:   "float",
	}

	// Lightmap UVs (always bound, zero-filled when absent, so the shader's
	// location(3) input is always backed by a buffer).
	lightmapUVs := m.LightmapUVs
	if !m.HasLightmapUVs {
		lightmapUVs = make([]float32, vertexCount*2)
	}
	m.LightmapUVBuffer = b.CreateBuffer(lightmapUVs, UsageVertex)
	m.Buffers = append(m.Buffers, m.LightmapUVBuffer)
	attrs := []VertexAttribute{posAttr, uvAttr, normalAttr, {
		Buffer: m.LightmapUVBuffer,
		Slot:   AttrLightmapUVs,
		Size:   2,
		Type:   "float",
	}}

	var singleIndexBuffer any
	if len(m.Indices) == 1 {
		singleIndexBuffer = m.Indices[0].IndexBuffer
	}

	m.VAO = b.CreateVertexState(&VertexStateDescriptor{
		Attributes:  attrs,
		IndexBuffer: singleIndexBuffer,
	})
}

// UpdateBoundingBox recalculates the bounding box enclosing all mesh vertices.
func (m *Mesh) UpdateBoundingBox() {
	if len(m.Vertices) > 0 {
		m.BoundingBox = physics.BoundingBoxFromPoints(m.Vertices)
	} else {
		m.BoundingBox = nil
	}
}

// Bind activates the mesh vertex array state on its GPU backend.
func (m *Mesh) Bind() {
	if m.VAO != nil && m.backend != nil {
		m.backend.BindVertexState(m.VAO)
	}
}

// Unbind deactivates the vertex array state.
func (m *Mesh) Unbind() {
	if m.backend != nil {
		m.backend.BindVertexState(nil)
	}
}

// UpdateVertexBuffer uploads fresh coordinates into the vertex buffer.
func (m *Mesh) UpdateVertexBuffer(data []float32) {
	if m.VertexBuffer != nil && m.backend != nil {
		m.backend.UpdateBuffer(m.VertexBuffer, data, 0)
	}
}

// RenderSingle binds the VAO, draws indices, and unbinds. renderMode filters
// index groups by material translucency.
func (m *Mesh) RenderSingle(applyMaterial bool, topo Topology, renderMode MaterialMode, shader *Shader) {
	m.Bind()
	m.RenderIndices(applyMaterial, topo, renderMode, shader)
	m.Unbind()
}

// RenderIndices iterates over index groups and issues indexed draws.
// Double-sided materials draw with the current pass state's CullOff twin and
// the pass state is restored before returning.
func (m *Mesh) RenderIndices(applyMaterial bool, topo Topology, renderMode MaterialMode, shader *Shader) {
	b := m.backend
	if b == nil {
		return
	}

	passState := b.State()
	cullOff := false
	for i := 0; i < len(m.Indices); i++ {
		idx := &m.Indices[i]
		var mat *Material
		if idx.Material != "none" {
			mat = m.MaterialLookup[idx.Material]
		}
		translucent := mat != nil && mat.Translucent
		if renderMode == ModeOpaque && translucent {
			continue
		}
		if renderMode == ModeTranslucent && !translucent {
			continue
		}
		if applyMaterial && mat != nil {
			mat.Bind(shader)
			wantCullOff := mat.DoubleSided && passState != nil && passState.CullOff != nil
			if wantCullOff != cullOff {
				if wantCullOff {
					b.ApplyState(passState.CullOff)
				} else {
					b.ApplyState(passState)
				}
				cullOff = wantCullOff
			}
		}

		b.DrawIndexed(idx.IndexBuffer, len(idx.Array), 0, topo)
	}

	if cullOff {
		b.ApplyState(passState)
	}
}

// RenderWireframe renders cached lines index buffers for debug inspection.
func (m *Mesh) RenderWireframe() {
	if m.backend == nil {
		return
	}
	m.Bind()
	m.EnsureWireframeBuffers()
	m.DrawWireframeBuffers()
	m.Unbind()
}

// EnsureWireframeBuffers lazily builds the line index buffers from the triangle groups.
func (m *Mesh) EnsureWireframeBuffers() {
	if m.backend == nil {
		return
	}
	if len(m.WireframeBuffers) == 0 {
		m.WireframeBuffers = make([]WireframeBuffer, 0, len(m.Indices))
		for i := 0; i < len(m.Indices); i++ {
			arr := m.Indices[i].Array
			linesCount := (len(arr) / 3) * 6
			lines := make([]uint32, linesCount)
			c := 0
			for j := 0; j < len(arr); j += 3 {
				lines[c] = arr[j]
				lines[c+1] = arr[j+1]
				lines[c+2] = arr[j+1]
				lines[c+3] = arr[j+2]
				lines[c+4] = arr[j+2]
				lines[c+5] = arr[j]
				c += 6
			}
			buf := m.backend.CreateBuffer(lines, UsageIndex)
			m.WireframeBuffers = append(m.WireframeBuffers, WireframeBuffer{
				Buffer: buf,
				Count:  linesCount,
			})
		}
	}
}

// DrawWireframeBuffers issues the line draws for the cached wireframe buffers
// using whatever vertex state is currently bound.
func (m *Mesh) DrawWireframeBuffers() {
	if m.backend == nil {
		return
	}
	for i := 0; i < len(m.WireframeBuffers); i++ {
		m.backend.DrawIndexed(m.WireframeBuffers[i].Buffer, m.WireframeBuffers[i].Count, 0, TopoLines)
	}
}

// Dispose frees all vertex buffers and index states allocated on the GPU.
func (m *Mesh) Dispose() {
	b := m.backend
	if b == nil {
		return
	}
	if m.VAO != nil {
		b.DeleteVertexState(m.VAO)
		m.VAO = nil
	}
	for i := 0; i < len(m.Buffers); i++ {
		b.DeleteBuffer(m.Buffers[i])
	}
	m.Buffers = nil
	for i := 0; i < len(m.WireframeBuffers); i++ {
		b.DeleteBuffer(m.WireframeBuffers[i].Buffer)
	}
	m.WireframeBuffers = nil
}
