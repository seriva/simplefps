package rendering

import (
	"js:./interop.d.ts"
)

// MaxJoints is the per-mesh joint budget of the CPU animation system; the
// GPU bone ring (BoneRingMats) is the only hard limit on the shader side.
const MaxJoints = 64

// SkinnedMesh extends Mesh with joint index and weight buffers for skeletal GPU
// skinning.
type SkinnedMesh struct {
	BaseMesh          Mesh
	GPUJointIndices   []uint8
	GPUJointWeights   []float32
	JointIndexBuffer  GPUBuffer
	JointWeightBuffer GPUBuffer
	BoneMatrixBuffer  []float32
}

// NewSkinnedMesh creates a SkinnedMesh on b with allocated vertex and joint buffers.
func NewSkinnedMesh(b *Backend, vertices, uvs, normals []float32, indices []IndexGroup, jointIndices []uint8, jointWeights []float32) *SkinnedMesh {
	sm := &SkinnedMesh{
		BaseMesh: Mesh{
			backend:          b,
			Vertices:         vertices,
			UVs:              uvs,
			Normals:          normals,
			Indices:          indices,
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
	sm.BaseMesh.InitMeshBuffers()
	if !sm.BaseMesh.gpuReady() || len(sm.BaseMesh.Vertices) == 0 {
		return
	}
	if len(sm.GPUJointIndices) > 0 && len(sm.GPUJointWeights) > 0 {
		b := sm.BaseMesh.backend
		sm.JointIndexBuffer = b.CreateByteBuffer("mesh-joints", sm.GPUJointIndices, BufferUsageVertex)
		sm.JointWeightBuffer = b.CreateFloatBuffer("mesh-weights", sm.GPUJointWeights, BufferUsageVertex)
	}
}

// HasSkinning reports whether joint buffers exist.
func (sm *SkinnedMesh) HasSkinning() bool {
	return sm.JointIndexBuffer != nil && sm.JointWeightBuffer != nil
}

// bindVertices binds the skinned vertex layout (slots 0-2 base, 3 joints, 4 weights).
func (sm *SkinnedMesh) bindVertices(r *Renderer) {
	m := &sm.BaseMesh
	r.setVertexBuffer(0, m.VertexBuffer)
	r.setVertexBuffer(1, m.UVBuffer)
	r.setVertexBuffer(2, m.NormalBuffer)
	r.setVertexBuffer(3, sm.JointIndexBuffer)
	r.setVertexBuffer(4, sm.JointWeightBuffer)
}

// Draw renders all index groups with the pass pipeline. useSkinned selects the
// skinned vertex layout (the pass pipeline must match); a skinned draw of a
// mesh without joint buffers is skipped rather than fed the wrong layout.
func (sm *SkinnedMesh) Draw(r *Renderer, applyMaterial bool, renderMode MaterialMode, useSkinned bool) {
	m := &sm.BaseMesh
	if r.Pass == nil || m.VertexBuffer == nil {
		return
	}
	if useSkinned {
		if !sm.HasSkinning() {
			return
		}
		sm.bindVertices(r)
	} else {
		m.bindVertices(r)
	}
	r.bindObject()
	m.drawGroups(r, applyMaterial, renderMode)
}

// DrawWireframe draws the debug line buffers; useSkinned selects the skinned
// layout so the wireframe follows the animated pose.
func (sm *SkinnedMesh) DrawWireframe(r *Renderer, useSkinned bool) {
	m := &sm.BaseMesh
	if r.Pass == nil || m.VertexBuffer == nil {
		return
	}
	m.EnsureWireframeBuffers()
	if useSkinned {
		if !sm.HasSkinning() {
			return
		}
		sm.bindVertices(r)
	} else {
		m.bindVertices(r)
	}
	r.bindObject()
	m.drawWireframeBuffers(r)
}

// Dispose releases GPU resources allocated for skinning and geometry.
func (sm *SkinnedMesh) Dispose() {
	b := sm.BaseMesh.backend
	if b != nil {
		b.DestroyBuffer(sm.JointIndexBuffer)
		b.DestroyBuffer(sm.JointWeightBuffer)
	}
	sm.JointIndexBuffer = nil
	sm.JointWeightBuffer = nil
	sm.BaseMesh.Dispose()
	sm.GPUJointIndices = nil
	sm.GPUJointWeights = nil
	sm.BoneMatrixBuffer = nil
}
