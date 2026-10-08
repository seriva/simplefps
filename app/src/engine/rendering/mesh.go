package rendering

import (
	"../mathx"
	"js:./interop.d.ts"
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
	IndexBuffer GPUBuffer
}

// WireframeBuffer caches line index buffers for debug wireframe passes.
type WireframeBuffer struct {
	Buffer GPUBuffer
	Count  int
}

// Mesh encapsulates GPU vertex buffers, index groups, and spatial bounding volume.
// Every mesh binds four vertex buffers (positions, uvs, normals, lightmap
// uvs); missing attributes are zero-filled so one vertex layout serves all
// mesh pipelines.
type Mesh struct {
	backend          *Backend
	Vertices         []float32
	UVs              []float32
	Normals          []float32
	LightmapUVs      []float32
	Indices          []IndexGroup
	VertexBuffer     GPUBuffer
	UVBuffer         GPUBuffer
	NormalBuffer     GPUBuffer
	LightmapUVBuffer GPUBuffer
	TriangleCount    int
	HasUVs           bool
	HasNormals       bool
	HasLightmapUVs   bool

	WireframeBuffers []WireframeBuffer
	BoundingBox      *mathx.BoundingBox

	// Cached materials mapped by name
	MaterialLookup map[string]*Material
}

// NewMesh creates a Mesh on b and initializes its GPU buffers and AABB.
func NewMesh(b *Backend, vertices, uvs, normals, lightmapUVs []float32, indices []IndexGroup) *Mesh {
	m := &Mesh{
		backend:          b,
		Vertices:         vertices,
		UVs:              uvs,
		Normals:          normals,
		LightmapUVs:      lightmapUVs,
		Indices:          indices,
		WireframeBuffers: make([]WireframeBuffer, 0),
		MaterialLookup:   make(map[string]*Material),
	}
	m.InitMeshBuffers()
	m.UpdateBoundingBox()
	return m
}

func (m *Mesh) gpuReady() bool {
	return m.backend != nil && m.backend.ready
}

// InitMeshBuffers allocates the vertex and index buffers.
func (m *Mesh) InitMeshBuffers() {
	m.HasUVs = len(m.UVs) > 0
	m.HasNormals = len(m.Normals) > 0
	m.HasLightmapUVs = len(m.LightmapUVs) > 0
	m.TriangleCount = 0
	for i := 0; i < len(m.Indices); i++ {
		m.TriangleCount += len(m.Indices[i].Array) / 3
	}

	if !m.gpuReady() || len(m.Vertices) == 0 {
		return
	}
	b := m.backend
	vertexCount := len(m.Vertices) / 3

	for i := 0; i < len(m.Indices); i++ {
		m.Indices[i].IndexBuffer = b.CreateIndexBuffer("mesh-indices", m.Indices[i].Array)
	}

	m.VertexBuffer = b.CreateFloatBuffer("mesh-positions", m.Vertices, BufferUsageVertex)

	uvs := m.UVs
	if !m.HasUVs {
		uvs = make([]float32, vertexCount*2)
	}
	m.UVBuffer = b.CreateFloatBuffer("mesh-uvs", uvs, BufferUsageVertex)

	normals := m.Normals
	if !m.HasNormals {
		normals = make([]float32, vertexCount*3)
	}
	m.NormalBuffer = b.CreateFloatBuffer("mesh-normals", normals, BufferUsageVertex)

	lightmapUVs := m.LightmapUVs
	if !m.HasLightmapUVs {
		lightmapUVs = make([]float32, vertexCount*2)
	}
	m.LightmapUVBuffer = b.CreateFloatBuffer("mesh-lightmap-uvs", lightmapUVs, BufferUsageVertex)
}

// UpdateBoundingBox recalculates the bounding box enclosing all mesh vertices.
func (m *Mesh) UpdateBoundingBox() {
	if len(m.Vertices) > 0 {
		m.BoundingBox = mathx.BoundingBoxFromPoints(m.Vertices)
	} else {
		m.BoundingBox = nil
	}
}

// UpdateVertexBuffer uploads fresh coordinates into the vertex buffer.
func (m *Mesh) UpdateVertexBuffer(data []float32) {
	if m.VertexBuffer != nil && m.backend != nil {
		m.backend.WriteBuffer(m.VertexBuffer, 0, data)
	}
}

// bindVertices sets the four mesh vertex buffers on the current pass.
func (m *Mesh) bindVertices(r *Renderer) {
	r.setVertexBuffer(0, m.VertexBuffer)
	r.setVertexBuffer(1, m.UVBuffer)
	r.setVertexBuffer(2, m.NormalBuffer)
	r.setVertexBuffer(3, m.LightmapUVBuffer)
}

// Draw issues one indexed draw per index group with the pass pipeline and
// the current ObjectData slot. renderMode filters groups by material
// translucency; applyMaterial binds each group's material (double-sided
// materials switch to the pipeline's CullOff twin).
func (m *Mesh) Draw(r *Renderer, applyMaterial bool, renderMode MaterialMode) {
	if r.Pass == nil || m.VertexBuffer == nil {
		return
	}
	m.bindVertices(r)
	r.bindObject()
	m.drawGroups(r, applyMaterial, renderMode)
}

func (m *Mesh) drawGroups(r *Renderer, applyMaterial bool, renderMode MaterialMode) {
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
		if applyMaterial {
			if mat == nil {
				mat = r.DefaultMaterial
			}
			r.BindMaterial(mat)
			if mat.DoubleSided && r.pipeline.CullOff != nil {
				r.usePipeline(r.pipeline.CullOff)
			} else {
				r.usePipeline(r.pipeline)
			}
		} else {
			r.usePipeline(r.pipeline)
		}
		r.setIndexBuffer(idx.IndexBuffer)
		r.Pass.drawIndexed(len(idx.Array), 1, 0, 0, 0)
		r.Stats.DrawCalls++
	}
}

// DrawInstanced draws the first index group count times with instance data
// in vertex slot 2 (particle layout: quad positions, quad uvs, instances).
func (m *Mesh) DrawInstanced(r *Renderer, instances GPUBuffer, count int) {
	if r.Pass == nil || m.VertexBuffer == nil || len(m.Indices) == 0 || count <= 0 {
		return
	}
	r.setVertexBuffer(0, m.VertexBuffer)
	r.setVertexBuffer(1, m.UVBuffer)
	r.setVertexBuffer(2, instances)
	r.bindObject()
	r.usePipeline(r.pipeline)
	r.setIndexBuffer(m.Indices[0].IndexBuffer)
	r.Pass.drawIndexed(len(m.Indices[0].Array), 1*count, 0, 0, 0)
	r.Stats.DrawCalls++
}

// DrawWireframe draws the cached line index buffers with the pass pipeline.
func (m *Mesh) DrawWireframe(r *Renderer) {
	if r.Pass == nil || m.VertexBuffer == nil {
		return
	}
	m.EnsureWireframeBuffers()
	m.bindVertices(r)
	r.bindObject()
	m.drawWireframeBuffers(r)
}

func (m *Mesh) drawWireframeBuffers(r *Renderer) {
	r.usePipeline(r.pipeline)
	for i := 0; i < len(m.WireframeBuffers); i++ {
		r.setIndexBuffer(m.WireframeBuffers[i].Buffer)
		r.Pass.drawIndexed(m.WireframeBuffers[i].Count, 1, 0, 0, 0)
		r.Stats.DrawCalls++
	}
}

// EnsureWireframeBuffers lazily builds the line index buffers from the triangle groups.
func (m *Mesh) EnsureWireframeBuffers() {
	if !m.gpuReady() || len(m.WireframeBuffers) != 0 {
		return
	}
	m.WireframeBuffers = make([]WireframeBuffer, len(m.Indices))
	for i := 0; i < len(m.Indices); i++ {
		arr := m.Indices[i].Array
		linesCount := (len(arr) / 3) * 6
		lines := make([]uint32, linesCount)
		c := 0
		for j := 0; j+2 < len(arr); j += 3 {
			lines[c] = arr[j]
			lines[c+1] = arr[j+1]
			lines[c+2] = arr[j+1]
			lines[c+3] = arr[j+2]
			lines[c+4] = arr[j+2]
			lines[c+5] = arr[j]
			c += 6
		}
		m.WireframeBuffers[i].Buffer = m.backend.CreateIndexBuffer("mesh-wireframe", lines)
		m.WireframeBuffers[i].Count = linesCount
	}
}

// Dispose frees all GPU buffers.
func (m *Mesh) Dispose() {
	b := m.backend
	if b == nil {
		return
	}
	for i := 0; i < len(m.Indices); i++ {
		b.DestroyBuffer(m.Indices[i].IndexBuffer)
		m.Indices[i].IndexBuffer = nil
	}
	b.DestroyBuffer(m.VertexBuffer)
	b.DestroyBuffer(m.UVBuffer)
	b.DestroyBuffer(m.NormalBuffer)
	b.DestroyBuffer(m.LightmapUVBuffer)
	m.VertexBuffer = nil
	m.UVBuffer = nil
	m.NormalBuffer = nil
	m.LightmapUVBuffer = nil
	for i := 0; i < len(m.WireframeBuffers); i++ {
		b.DestroyBuffer(m.WireframeBuffers[i].Buffer)
	}
	m.WireframeBuffers = nil
}
