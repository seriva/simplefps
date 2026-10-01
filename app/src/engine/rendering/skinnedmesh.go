package rendering

const MaxJoints = 64

// SkinnedMesh extends Mesh with joint index and weight buffers for skeletal GPU skinning.
type SkinnedMesh struct {
	BaseMesh          Mesh
	GPUJointIndices   []uint8
	GPUJointWeights   []float32
	SkinnedVAO        any
	JointIndexBuffer  any
	JointWeightBuffer any
	BoneMatrixBuffer  []float32
}

// NewSkinnedMesh creates a SkinnedMesh on b with allocated vertex and joint states.
func NewSkinnedMesh(b RenderBackend, vertices, uvs, normals []float32, indices []IndexGroup, jointIndices []uint8, jointWeights []float32) *SkinnedMesh {
	sm := &SkinnedMesh{
		BaseMesh: Mesh{
			backend:          b,
			Vertices:         vertices,
			UVs:              uvs,
			Normals:          normals,
			Indices:          indices,
			Buffers:          make([]any, 0),
			WireframeBuffers: make([]WireframeBuffer, 0),
			MaterialLookup:   make(map[string]*Material),
		},
		GPUJointIndices: jointIndices,
		GPUJointWeights: jointWeights,
	}
	sm.InitMeshBuffers()
	sm.BaseMesh.UpdateBoundingBox()
	return sm
}

// InitMeshBuffers allocates base vertex attributes as well as skinning attributes.
func (sm *SkinnedMesh) InitMeshBuffers() {
	b := sm.BaseMesh.backend
	if b == nil || len(sm.BaseMesh.Vertices) == 0 {
		return
	}

	sm.BaseMesh.InitMeshBuffers()

	if len(sm.GPUJointIndices) > 0 && len(sm.GPUJointWeights) > 0 {
		sm.JointIndexBuffer = b.CreateBuffer(sm.GPUJointIndices, "vertex")
		sm.BaseMesh.Buffers = append(sm.BaseMesh.Buffers, sm.JointIndexBuffer)

		sm.JointWeightBuffer = b.CreateBuffer(sm.GPUJointWeights, "vertex")
		sm.BaseMesh.Buffers = append(sm.BaseMesh.Buffers, sm.JointWeightBuffer)

		var singleIndexBuffer any
		if len(sm.BaseMesh.Indices) == 1 {
			singleIndexBuffer = sm.BaseMesh.Indices[0].IndexBuffer
		}

		vertexCount := len(sm.BaseMesh.Vertices) / 3
		uvs := sm.BaseMesh.UVs
		if len(uvs) == 0 {
			uvs = make([]float32, vertexCount*2)
		}
		normals := sm.BaseMesh.Normals
		if len(normals) == 0 {
			normals = make([]float32, vertexCount*3)
		}

		attrs := []VertexAttribute{
			{Buffer: sm.BaseMesh.VertexBuffer, Slot: AttrPositions, Size: 3, Type: "float"},
			{Buffer: sm.BaseMesh.UVBuffer, Slot: AttrUVs, Size: 2, Type: "float"},
			{Buffer: sm.BaseMesh.NormalBuffer, Slot: AttrNormals, Size: 3, Type: "float"},
			{Buffer: sm.JointIndexBuffer, Slot: AttrJointIndices, Size: 4, Type: "ubyte", AsInteger: true},
			{Buffer: sm.JointWeightBuffer, Slot: AttrJointWeights, Size: 4, Type: "float"},
		}

		sm.SkinnedVAO = b.CreateVertexState(&VertexStateDescriptor{
			Attributes:  attrs,
			IndexBuffer: singleIndexBuffer,
		})
	}
}

// Bind activates either the skinned VAO or base unskinned VAO.
func (sm *SkinnedMesh) Bind(useSkinned bool) {
	b := sm.BaseMesh.backend
	if b == nil {
		return
	}
	if useSkinned && sm.SkinnedVAO != nil {
		b.BindVertexState(sm.SkinnedVAO)
	} else if sm.BaseMesh.VAO != nil {
		b.BindVertexState(sm.BaseMesh.VAO)
	}
}

// RenderSingle binds the skinned (or base) VAO, draws all index groups, and unbinds.
func (sm *SkinnedMesh) RenderSingle(applyMaterial bool, mode string, renderMode string, shader *Shader, useSkinned bool) {
	sm.Bind(useSkinned)
	sm.BaseMesh.RenderIndices(applyMaterial, mode, renderMode, shader)
	sm.BaseMesh.Unbind()
}

// RenderWireframe draws the debug line buffers; useSkinned selects the skinned VAO so
// the wireframe follows the animated pose.
func (sm *SkinnedMesh) RenderWireframe(useSkinned bool) {
	if !useSkinned || sm.SkinnedVAO == nil {
		sm.BaseMesh.RenderWireframe()
		return
	}
	if sm.BaseMesh.backend == nil {
		return
	}
	sm.BaseMesh.EnsureWireframeBuffers()
	sm.Bind(true)
	sm.BaseMesh.DrawWireframeBuffers()
	sm.BaseMesh.Unbind()
}

// Dispose releases GPU resources allocated for skinning and geometry.
func (sm *SkinnedMesh) Dispose() {
	if sm.BaseMesh.backend != nil && sm.SkinnedVAO != nil {
		sm.BaseMesh.backend.DeleteVertexState(sm.SkinnedVAO)
		sm.SkinnedVAO = nil
	}
	sm.BaseMesh.Dispose()
	sm.GPUJointIndices = nil
	sm.GPUJointWeights = nil
	sm.BoneMatrixBuffer = nil
}
