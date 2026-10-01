package scene

import (
	"math"

	"../physics"
	"../rendering"
	"../systems"
)

var (
	meshTempMatrix = physics.NewMat4()
	meshScaleVec   = &physics.Vec3{}
)

// MeshEntity renders a static or animated rigid Mesh.
type MeshEntity struct {
	Base EntityBase
	Mesh *rendering.Mesh
}

// NewMeshEntity places mesh at position with a uniform scale. entityType is
// TypeMesh or TypeFPSMesh.
func NewMeshEntity(entityType int, position *physics.Vec3, mesh *rendering.Mesh, update UpdateCallback, scale float32) *MeshEntity {
	e := &MeshEntity{Mesh: mesh}
	initBase(&e.Base, entityType, update)
	e.Base.CastShadow = false
	if mesh != nil {
		e.Base.TriangleCount = mesh.TriangleCount
	}
	if position != nil {
		physics.Mat4Translate(e.Base.BaseMatrix, e.Base.BaseMatrix, position)
	}
	meshScaleVec.Set(scale, scale, scale)
	physics.Mat4Scale(e.Base.BaseMatrix, e.Base.BaseMatrix, meshScaleVec)
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
	physics.Mat4RotateX(m, m, rx*float32(math.Pi)/180)
	physics.Mat4RotateY(m, m, ry*float32(math.Pi)/180)
	physics.Mat4RotateZ(m, m, rz*float32(math.Pi)/180)
}

func (e *MeshEntity) Update(frameTime float32) bool {
	return baseUpdate(e, frameTime)
}

// Draw sets the world matrix and ambient probe on the bound geometry /
// transparent shader and issues the mesh in the given material mode.
func (e *MeshEntity) Draw(r *rendering.Renderer, sh *rendering.Shader, mode string) {
	if e.Mesh == nil || sh == nil {
		return
	}
	physics.Mat4Multiply(meshTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	sh.SetVec3("uProbeColor", e.Base.ProbeColor)
	sh.SetMat4("matWorld", meshTempMatrix)
	e.Mesh.RenderSingle(true, "triangles", mode, sh)
}

func (e *MeshEntity) DrawWireframe(r *rendering.Renderer, sh *rendering.Shader) {
	if e.Mesh == nil || sh == nil {
		return
	}
	physics.Mat4Multiply(meshTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	sh.SetMat4("matWorld", meshTempMatrix)
	e.Mesh.RenderWireframe()
}

func (e *MeshEntity) DrawSkeleton(r *rendering.Renderer, sh *rendering.Shader) {}

// DrawShadow squashes the world matrix onto the cached ground height.
func (e *MeshEntity) DrawShadow(r *rendering.Renderer, sh *rendering.Shader) {
	if !e.Base.CastShadow || e.Mesh == nil || sh == nil {
		return
	}
	if e.Base.ShadowHeightState != ShadowHeightValid {
		return
	}
	m := meshTempMatrix
	physics.Mat4Multiply(m, e.Base.BaseMatrix, e.Base.AniMatrix)
	m[1] *= 0.1
	m[5] *= 0.1
	m[9] *= 0.1
	m[13] = e.Base.ShadowHeight
	sh.SetMat4("matWorld", m)
	e.Mesh.RenderSingle(false, "triangles", "all", sh)
}

func (e *MeshEntity) Bounds() *physics.BoundingBox { return e.Base.BoundingBox }
func (e *MeshEntity) TriangleCount() int           { return e.Base.TriangleCount }
func (e *MeshEntity) CastsShadow() bool            { return e.Base.CastShadow }

func (e *MeshEntity) UpdateBoundingVolume() {
	if e.Mesh == nil || e.Mesh.BoundingBox == nil {
		return
	}
	physics.Mat4Multiply(meshTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	if e.Base.BoundingBox == nil {
		e.Base.BoundingBox = physics.NewBoundingBox()
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
