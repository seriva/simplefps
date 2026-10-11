package scene

import (
	"../mathx"
	"../rendering"
)

var skyboxFaceNames = []string{"front", "back", "top", "bottom", "right", "left"}

// SkyboxEntity renders a skybox cube (normally the renderer's shared
// Shapes.SkyBox) centred on the camera. Camera position is supplied by the
// Scene (no entity↔scene coupling).
type SkyboxEntity struct {
	Base           EntityBase
	Mesh           *rendering.Mesh
	CameraPosition *mathx.Vec3
}

// NewSkyboxEntity assigns skybox materials "mat_skybox_<id>_<face>" to sky's
// six index groups and renders that mesh.
func NewSkyboxEntity(id string, sky *rendering.Mesh, update UpdateCallback) *SkyboxEntity {
	e := &SkyboxEntity{Mesh: sky}
	initBase(&e.Base, TypeSkybox, update)
	if sky != nil {
		for i := 0; i < len(sky.Indices) && i < len(skyboxFaceNames); i++ {
			sky.Indices[i].Material = "mat_skybox_" + id + "_" + skyboxFaceNames[i]
		}
	}
	return e
}

func (e *SkyboxEntity) GetBase() *EntityBase { return &e.Base }
func (e *SkyboxEntity) Update(frameTime float32) bool {
	return baseUpdate(e, frameTime)
}

func (e *SkyboxEntity) updateMatrix() {
	if e.CameraPosition != nil {
		mathx.Mat4Translate(e.Base.BaseMatrix, e.Base.AniMatrix, e.CameraPosition)
	} else {
		mathx.Mat4Copy(e.Base.BaseMatrix, e.Base.AniMatrix)
	}
}

// Draw draws the cube with the skybox pipeline (depth handled by the
// renderer) centred on CameraPosition.
func (e *SkyboxEntity) Draw(r *rendering.Renderer, mode rendering.MaterialMode) {
	sky := e.Mesh
	if sky == nil {
		return
	}
	e.updateMatrix()
	r.NextObject()
	r.ObjectWorld(e.Base.BaseMatrix)
	r.ObjectProbe(1, 1, 1, 0)
	sky.Draw(r, true, rendering.ModeAll)
}

func (e *SkyboxEntity) DrawShadow(r *rendering.Renderer)                                  {}
func (e *SkyboxEntity) DrawSkeleton(r *rendering.Renderer)                                {}
func (e *SkyboxEntity) Simulate(r *rendering.Renderer, pass rendering.GPUComputePassEncoder) {}

func (e *SkyboxEntity) DrawWireframe(r *rendering.Renderer) {
	if e.Mesh == nil {
		return
	}
	e.updateMatrix()
	r.NextObject()
	r.ObjectWorld(e.Base.BaseMatrix)
	r.ObjectParamsVec(0, r.DebugColor())
	e.Mesh.DrawWireframe(r)
}

func (e *SkyboxEntity) Bounds() *mathx.BoundingBox { return e.Base.BoundingBox }
func (e *SkyboxEntity) TriangleCount() int           { return 0 }
func (e *SkyboxEntity) CastsShadow() bool            { return false }

func (e *SkyboxEntity) Dispose() {
	baseDispose(&e.Base)
	e.Mesh = nil
}
