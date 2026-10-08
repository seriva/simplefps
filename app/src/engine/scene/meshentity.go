package scene

import (
	"math"

	"../mathx"
	"../rendering"
	"../systems"
)

var (
	meshTempMatrix = mathx.NewMat4()
	meshScaleVec   = &mathx.Vec3{}
)

// MeshEntity renders a static or animated rigid Mesh.
type MeshEntity struct {
	Base EntityBase
	Mesh *rendering.Mesh

	// Shadow and Probe are refreshed by the Scene for visible entities;
	// mutate their fields in place.
	Shadow shadowState
	Probe  probeCache
}

// NewMeshEntity places mesh at position with a uniform scale. entityType is
// TypeMesh or TypeFPSMesh.
func NewMeshEntity(entityType int, position *mathx.Vec3, mesh *rendering.Mesh, update UpdateCallback, scale float32) *MeshEntity {
	e := &MeshEntity{Mesh: mesh}
	initBase(&e.Base, entityType, update)
	e.Base.CastShadow = false
	if position != nil {
		mathx.Mat4Translate(e.Base.BaseMatrix, e.Base.BaseMatrix, position)
	}
	meshScaleVec.Set(scale, scale, scale)
	mathx.Mat4Scale(e.Base.BaseMatrix, e.Base.BaseMatrix, meshScaleVec)
	return e
}

func (e *MeshEntity) GetBase() *EntityBase { return &e.Base }

// SetRotation applies an XYZ Euler rotation in degrees to the base matrix.
func (e *MeshEntity) SetRotation(rx, ry, rz float32) {
	if e.Base.IsStatic {
		systems.GlobalConsole.Warn("Cannot transform a static MeshEntity")
		return
	}
	m := e.Base.BaseMatrix
	mathx.Mat4RotateX(m, m, rx*float32(math.Pi)/180)
	mathx.Mat4RotateY(m, m, ry*float32(math.Pi)/180)
	mathx.Mat4RotateZ(m, m, rz*float32(math.Pi)/180)
}

func (e *MeshEntity) Update(frameTime float32) bool {
	if !e.Base.Visible {
		return true
	}
	keep := baseUpdate(e, frameTime)
	e.UpdateBoundingVolume()
	return keep
}

// Draw fills an ObjectData slot with the world matrix and ambient probe and
// issues the mesh in the given material mode.
func (e *MeshEntity) Draw(r *rendering.Renderer, mode rendering.MaterialMode) {
	if e.Mesh == nil {
		return
	}
	mathx.Mat4Multiply(meshTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	r.NextObject()
	r.ObjectWorld(meshTempMatrix)
	setObjectProbe(r, &e.Probe)
	e.Mesh.Draw(r, true, mode)
}

func (e *MeshEntity) DrawWireframe(r *rendering.Renderer) {
	if e.Mesh == nil {
		return
	}
	mathx.Mat4Multiply(meshTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	r.NextObject()
	r.ObjectWorld(meshTempMatrix)
	r.ObjectParamsVec(0, r.DebugColor())
	e.Mesh.DrawWireframe(r)
}

func (e *MeshEntity) DrawSkeleton(r *rendering.Renderer)                                  {}
func (e *MeshEntity) Simulate(r *rendering.Renderer, pass rendering.GPUComputePassEncoder) {}

// DrawShadow squashes the world matrix onto the cached ground height.
func (e *MeshEntity) DrawShadow(r *rendering.Renderer) {
	if !e.Base.CastShadow || e.Mesh == nil {
		return
	}
	if e.Shadow.HeightState != ShadowHeightValid {
		return
	}
	m := meshTempMatrix
	mathx.Mat4Multiply(m, e.Base.BaseMatrix, e.Base.AniMatrix)
	m[1] *= 0.1
	m[5] *= 0.1
	m[9] *= 0.1
	m[13] = e.Shadow.Height
	amb := r.Ambient()
	r.NextObject()
	r.ObjectWorld(m)
	r.ObjectProbe(amb[0], amb[1], amb[2], e.Shadow.Height)
	e.Mesh.Draw(r, false, rendering.ModeAll)
}

func (e *MeshEntity) Bounds() *mathx.BoundingBox { return e.Base.BoundingBox }
func (e *MeshEntity) CastsShadow() bool            { return e.Base.CastShadow }

func (e *MeshEntity) TriangleCount() int {
	if e.Mesh == nil {
		return 0
	}
	return e.Mesh.TriangleCount
}

// UpdateBoundingVolume transforms the mesh AABB by the world matrix.
func (e *MeshEntity) UpdateBoundingVolume() {
	if e.Mesh == nil || e.Mesh.BoundingBox == nil {
		return
	}
	mathx.Mat4Multiply(meshTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	if e.Base.BoundingBox == nil {
		e.Base.BoundingBox = mathx.NewBoundingBox()
	}
	e.Mesh.BoundingBox.TransformInto(meshTempMatrix, e.Base.BoundingBox)
}

func (e *MeshEntity) Dispose() {
	baseDispose(&e.Base)
	e.Mesh = nil
}

// HasTranslucent reports whether any material bound to the mesh is translucent.
func (e *MeshEntity) HasTranslucent() bool {
	if e.Mesh == nil {
		return false
	}
	for i := 0; i < len(e.Mesh.Indices); i++ {
		mat := e.Mesh.MaterialLookup[e.Mesh.Indices[i].Material]
		if mat != nil && mat.Translucent {
			return true
		}
	}
	return false
}
