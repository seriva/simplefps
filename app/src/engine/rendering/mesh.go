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

// NewMesh creates a Mesh and initializes its GPU buffers and AABB.
func NewMesh(vertices, uvs, normals, lightmapUVs []float32, indices []IndexGroup) *Mesh {
	m := &Mesh{
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

	if ActiveBackend == nil || len(m.Vertices) == 0 {
		return
	}

	vertexCount := len(m.Vertices) / 3
	m.Buffers = make([]any, 0)

	// Create Index Buffers
	for i := 0; i < len(m.Indices); i++ {
		buf := ActiveBackend.CreateBuffer(m.Indices[i].Array, "index")
		m.Indices[i].IndexBuffer = buf
		m.Buffers = append(m.Buffers, buf)
	}

	// Positions
	m.VertexBuffer = ActiveBackend.CreateBuffer(m.Vertices, "vertex")
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
	m.UVBuffer = ActiveBackend.CreateBuffer(uvs, "vertex")
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
	m.NormalBuffer = ActiveBackend.CreateBuffer(normals, "vertex")
	m.Buffers = append(m.Buffers, m.NormalBuffer)
	normalAttr := VertexAttribute{
		Buffer: m.NormalBuffer,
		Slot:   AttrNormals,
		Size:   3,
		Type:   "float",
	}

	attrs := []VertexAttribute{posAttr, uvAttr, normalAttr}

	// Lightmap UVs
	if m.HasLightmapUVs {
		m.LightmapUVBuffer = ActiveBackend.CreateBuffer(m.LightmapUVs, "vertex")
		m.Buffers = append(m.Buffers, m.LightmapUVBuffer)
		attrs = append(attrs, VertexAttribute{
			Buffer: m.LightmapUVBuffer,
			Slot:   AttrLightmapUVs,
			Size:   2,
			Type:   "float",
		})
	}

	var singleIndexBuffer any
	if len(m.Indices) == 1 {
		singleIndexBuffer = m.Indices[0].IndexBuffer
	}

	m.VAO = ActiveBackend.CreateVertexState(&VertexStateDescriptor{
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

// Bind activates the mesh vertex array state on the active GPU backend.
func (m *Mesh) Bind() {
	if m.VAO != nil && ActiveBackend != nil {
		ActiveBackend.BindVertexState(m.VAO)
	}
}

// Unbind deactivates the vertex array state.
func (m *Mesh) Unbind() {
	if ActiveBackend != nil {
		ActiveBackend.BindVertexState(nil)
	}
}

// UpdateVertexBuffer uploads fresh coordinates into the vertex buffer.
func (m *Mesh) UpdateVertexBuffer(data []float32) {
	if m.VertexBuffer != nil && ActiveBackend != nil {
		ActiveBackend.UpdateBuffer(m.VertexBuffer, data, 0)
	}
}

// RenderSingle binds the VAO, draws indices, and unbinds.
// mode is the primitive ("triangles"/"lines"); renderMode filters index groups
// by material translucency: "all", "opaque", or "translucent".
func (m *Mesh) RenderSingle(applyMaterial bool, mode string, renderMode string, shader *Shader) {
	m.Bind()
	m.RenderIndices(applyMaterial, mode, renderMode, shader)
	m.Unbind()
}

// RenderIndices iterates over index groups and issues indexed draws.
func (m *Mesh) RenderIndices(applyMaterial bool, mode string, renderMode string, shader *Shader) {
	if ActiveBackend == nil {
		return
	}

	hadDoubleSided := false
	for i := 0; i < len(m.Indices); i++ {
		idx := &m.Indices[i]
		var mat *Material
		if idx.Material != "none" {
			mat = m.MaterialLookup[idx.Material]
		}
		translucent := mat != nil && mat.Translucent
		if renderMode == "opaque" && translucent {
			continue
		}
		if renderMode == "translucent" && !translucent {
			continue
		}
		if applyMaterial && mat != nil {
			mat.Bind(shader)
			if mat.DoubleSided {
				hadDoubleSided = true
			}
		}

		ActiveBackend.DrawIndexed(idx.IndexBuffer, len(idx.Array), 0, mode)
	}

	if hadDoubleSided {
		ActiveBackend.SetCullState(true, "back")
	}
}

// RenderWireframe renders cached lines index buffers for debug inspection.
func (m *Mesh) RenderWireframe() {
	if ActiveBackend == nil {
		return
	}
	m.Bind()
	m.EnsureWireframeBuffers()
	m.DrawWireframeBuffers()
	m.Unbind()
}

// EnsureWireframeBuffers lazily builds the line index buffers from the triangle groups.
func (m *Mesh) EnsureWireframeBuffers() {
	if ActiveBackend == nil {
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
			buf := ActiveBackend.CreateBuffer(lines, "index")
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
	if ActiveBackend == nil {
		return
	}
	for i := 0; i < len(m.WireframeBuffers); i++ {
		ActiveBackend.DrawIndexed(m.WireframeBuffers[i].Buffer, m.WireframeBuffers[i].Count, 0, "lines")
	}
}

// Dispose frees all vertex buffers and index states allocated on the GPU.
func (m *Mesh) Dispose() {
	if ActiveBackend == nil {
		return
	}
	if m.VAO != nil {
		ActiveBackend.DeleteVertexState(m.VAO)
		m.VAO = nil
	}
	for i := 0; i < len(m.Buffers); i++ {
		ActiveBackend.DeleteBuffer(m.Buffers[i])
	}
	m.Buffers = nil
	for i := 0; i < len(m.WireframeBuffers); i++ {
		ActiveBackend.DeleteBuffer(m.WireframeBuffers[i].Buffer)
	}
	m.WireframeBuffers = nil
}
