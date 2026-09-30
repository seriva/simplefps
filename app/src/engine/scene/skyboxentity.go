package scene

import (
	"../physics"
	"../rendering"
)

var skyboxFaceNames = []string{"front", "back", "top", "bottom", "right", "left"}

var whiteProbe = []float32{1, 1, 1}

// SkyboxEntity renders the shared skybox cube centred on the camera. Camera
// position is supplied by the Scene (no entity↔scene coupling).
type SkyboxEntity struct {
	Base           EntityBase
	CameraPosition *physics.Vec3
}

// NewSkyboxEntity assigns skybox materials "mat_skybox_<id>_<face>" to the shared cube.
func NewSkyboxEntity(id string, update UpdateCallback) *SkyboxEntity {
	e := &SkyboxEntity{}
	initBase(&e.Base, TypeSkybox, update)
	sky := rendering.GlobalShapes.SkyBox
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

// Render draws the cube with the geometry shader (depth handled by the caller).
func (e *SkyboxEntity) Render(probeColor []float32, renderMode string, shader *rendering.Shader) {
	sh := rendering.Shaders.Geometry
	sky := rendering.GlobalShapes.SkyBox
	if sh == nil || sky == nil {
		return
	}
	e.updateMatrix()
	sh.SetMat4("matWorld", e.Base.BaseMatrix)
	sh.SetVec3("uProbeColor", whiteProbe)
	sky.RenderSingle(true, "triangles", "all", sh)
}

func (e *SkyboxEntity) RenderShadow(renderMode string, shader *rendering.Shader) {}

func (e *SkyboxEntity) RenderWireFrame() {
	if rendering.Shaders.Debug == nil || rendering.GlobalShapes.SkyBox == nil {
		return
	}
	e.updateMatrix()
	rendering.Shaders.Debug.SetMat4("matWorld", e.Base.BaseMatrix)
	rendering.GlobalShapes.SkyBox.RenderWireframe()
}

func (e *SkyboxEntity) Dispose() { baseDispose(&e.Base) }
