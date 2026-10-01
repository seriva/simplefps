package scene

import (
	"../physics"
	"../rendering"
)

var skyboxFaceNames = []string{"front", "back", "top", "bottom", "right", "left"}

var skyboxProbe = []float32{1, 1, 1}

// SkyboxEntity renders a skybox cube (normally the renderer's shared
// Shapes.SkyBox) centred on the camera. Camera position is supplied by the
// Scene (no entity↔scene coupling).
type SkyboxEntity struct {
	Base           EntityBase
	Mesh           *rendering.Mesh
	CameraPosition *physics.Vec3
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
func (e *SkyboxEntity) UpdateBoundingVolume() {}

func (e *SkyboxEntity) updateMatrix() {
	if e.CameraPosition != nil {
		physics.Mat4Translate(e.Base.BaseMatrix, e.Base.AniMatrix, e.CameraPosition)
	} else {
		physics.Mat4Copy(e.Base.BaseMatrix, e.Base.AniMatrix)
	}
}

// Draw draws the cube with the bound geometry shader (depth handled by the
// renderer) centred on CameraPosition.
func (e *SkyboxEntity) Draw(r *rendering.Renderer, sh *rendering.Shader, mode string) {
	sky := e.Mesh
	if sh == nil || sky == nil {
		return
	}
	e.updateMatrix()
	sh.SetMat4("matWorld", e.Base.BaseMatrix)
	sh.SetVec3("uProbeColor", skyboxProbe)
	sky.RenderSingle(true, "triangles", "all", sh)
}

func (e *SkyboxEntity) DrawShadow(r *rendering.Renderer, sh *rendering.Shader)   {}
func (e *SkyboxEntity) DrawSkeleton(r *rendering.Renderer, sh *rendering.Shader) {}

func (e *SkyboxEntity) DrawWireframe(r *rendering.Renderer, sh *rendering.Shader) {
	if sh == nil || e.Mesh == nil {
		return
	}
	e.updateMatrix()
	sh.SetMat4("matWorld", e.Base.BaseMatrix)
	e.Mesh.RenderWireframe()
}

func (e *SkyboxEntity) Bounds() *physics.BoundingBox { return e.Base.BoundingBox }
func (e *SkyboxEntity) TriangleCount() int           { return e.Base.TriangleCount }
func (e *SkyboxEntity) CastsShadow() bool            { return false }

func (e *SkyboxEntity) Dispose() {
	baseDispose(&e.Base)
	e.Mesh = nil
}
