package scene

import (
	"math"

	"../physics"
	"../rendering"
)

var (
	lightTempMatrix   = physics.NewMat4()
	lightVolumeMatrix = physics.NewMat4()
	lightPos          = &physics.Vec3{}
	lightScaleVec     = &physics.Vec3{}
	lightPosRange     = make([]float32, 4)
	lightColorInt     = make([]float32, 4)
	lightDirCutoff    = make([]float32, 4)
	spotForward       = &physics.Vec3{X: 0, Y: 0, Z: -1}
	spotRotation      = &physics.Quat{}
)

// ---------------------------------------------------------------------------
// Directional light
// ---------------------------------------------------------------------------

// DirectionalLightEntity is a full-screen light with a fixed direction.
type DirectionalLightEntity struct {
	Base      EntityBase
	Direction []float32
	Color     []float32
}

// NewDirectionalLightEntity creates a directional light (direction/color are 3 floats).
func NewDirectionalLightEntity(direction, color []float32, update UpdateCallback) *DirectionalLightEntity {
	e := &DirectionalLightEntity{Direction: direction, Color: color}
	initBase(&e.Base, TypeDirectionalLight, update)
	return e
}

func (e *DirectionalLightEntity) GetBase() *EntityBase { return &e.Base }
func (e *DirectionalLightEntity) Update(frameTime float32) bool {
	return baseUpdate(e, frameTime)
}
func (e *DirectionalLightEntity) UpdateBoundingVolume() {}

// Render sets the light uniforms on the bound directionalLight shader and
// draws the screen quad.
func (e *DirectionalLightEntity) Render(probeColor []float32, renderMode string, shader *rendering.Shader) {
	sh := rendering.Shaders.DirectionalLight
	if sh == nil || rendering.GlobalShapes.ScreenQuad == nil {
		return
	}
	sh.SetVec3("directionalLight.direction", e.Direction)
	sh.SetVec3("directionalLight.color", e.Color)
	rendering.GlobalShapes.ScreenQuad.RenderSingle(false, "triangles", "all", sh)
}
func (e *DirectionalLightEntity) RenderShadow(renderMode string, shader *rendering.Shader) {}
func (e *DirectionalLightEntity) RenderWireFrame()                                       {}
func (e *DirectionalLightEntity) Dispose()                                               { baseDispose(&e.Base) }

// ---------------------------------------------------------------------------
// Point light
// ---------------------------------------------------------------------------

// PointLightEntity is a sphere-volume light positioned by its matrices.
type PointLightEntity struct {
	Base      EntityBase
	Color     []float32
	Size      float32
	Intensity float32
}

// NewPointLightEntity creates a point light at position.
func NewPointLightEntity(position *physics.Vec3, size float32, color []float32, intensity float32, update UpdateCallback) *PointLightEntity {
	e := &PointLightEntity{Color: color, Size: size, Intensity: intensity}
	initBase(&e.Base, TypePointLight, update)
	if position != nil {
		physics.Mat4Translate(e.Base.BaseMatrix, e.Base.BaseMatrix, position)
	}
	e.UpdateBoundingVolume()
	return e
}

func (e *PointLightEntity) GetBase() *EntityBase { return &e.Base }
func (e *PointLightEntity) Update(frameTime float32) bool {
	return baseUpdate(e, frameTime)
}

// WorldPosition writes the light's world position (base * ani translation).
func (e *PointLightEntity) WorldPosition(out *physics.Vec3) {
	physics.Mat4Multiply(lightTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	physics.Mat4GetTranslation(out, lightTempMatrix)
}

func (e *PointLightEntity) volumeMatrix() physics.Mat4 {
	physics.Mat4Multiply(lightTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	physics.Mat4GetTranslation(lightPos, lightTempMatrix)
	lightScaleVec.Set(e.Size, e.Size, e.Size)
	physics.Mat4Scale(lightVolumeMatrix, lightTempMatrix, lightScaleVec)
	return lightVolumeMatrix
}

// Render draws the point light volume with the bound pointLight shader.
func (e *PointLightEntity) Render(probeColor []float32, renderMode string, shader *rendering.Shader) {
	sh := rendering.Shaders.PointLight
	if !e.Base.Visible || sh == nil || rendering.GlobalShapes.PointLightVolume == nil {
		return
	}
	vol := e.volumeMatrix()
	lightPosRange[0] = lightPos.X
	lightPosRange[1] = lightPos.Y
	lightPosRange[2] = lightPos.Z
	lightPosRange[3] = e.Size
	lightColorInt[0] = e.Color[0]
	lightColorInt[1] = e.Color[1]
	lightColorInt[2] = e.Color[2]
	lightColorInt[3] = e.Intensity
	sh.SetMat4("matWorld", vol)
	sh.SetVec4("pointLight.posRange", lightPosRange)
	sh.SetVec4("pointLight.colorIntensity", lightColorInt)
	rendering.GlobalShapes.PointLightVolume.RenderSingle(false, "triangles", "all", sh)
}

func (e *PointLightEntity) RenderShadow(renderMode string, shader *rendering.Shader) {}

func (e *PointLightEntity) RenderWireFrame() {
	if !e.Base.Visible || rendering.Shaders.Debug == nil || rendering.GlobalShapes.PointLightVolume == nil {
		return
	}
	rendering.Shaders.Debug.SetMat4("matWorld", e.volumeMatrix())
	rendering.GlobalShapes.PointLightVolume.RenderWireframe()
}

func (e *PointLightEntity) UpdateBoundingVolume() {
	vol := rendering.GlobalShapes.PointLightVolume
	if vol == nil || vol.BoundingBox == nil {
		return
	}
	if e.Base.BoundingBox == nil {
		e.Base.BoundingBox = physics.NewBoundingBox()
	}
	vol.BoundingBox.TransformInto(e.volumeMatrix(), e.Base.BoundingBox)
}

func (e *PointLightEntity) Dispose() { baseDispose(&e.Base) }

// ---------------------------------------------------------------------------
// Spot light
// ---------------------------------------------------------------------------

// SpotLightEntity is a cone-volume light. Position/Direction are world-space
// and independent of the entity matrices (which are derived from them).
type SpotLightEntity struct {
	Base      EntityBase
	Position  physics.Vec3
	Direction physics.Vec3
	Color     []float32
	Intensity float32
	Range     float32
	Angle     float32 // degrees (cone half-angle)
	Cutoff    float32 // cos(Angle)
}

// NewSpotLightEntity creates a spot light; angle is the cone half-angle in degrees.
func NewSpotLightEntity(position, direction *physics.Vec3, color []float32, intensity, angle, rng float32, update UpdateCallback) *SpotLightEntity {
	e := &SpotLightEntity{Color: color, Intensity: intensity, Range: rng, Angle: angle}
	initBase(&e.Base, TypeSpotLight, update)
	if position != nil {
		e.Position.Copy(position)
	}
	if direction != nil {
		e.Direction.Copy(direction)
	}
	e.Direction.Normalize(&e.Direction)
	e.Cutoff = float32(math.Cos(float64(angle) * math.Pi / 180))
	e.updateMatrix()
	e.UpdateBoundingVolume()
	return e
}

func (e *SpotLightEntity) GetBase() *EntityBase { return &e.Base }
func (e *SpotLightEntity) Update(frameTime float32) bool {
	return baseUpdate(e, frameTime)
}

// SetPosition moves the light and rebuilds its matrix.
func (e *SpotLightEntity) SetPosition(x, y, z float32) {
	e.Position.Set(x, y, z)
	e.updateMatrix()
	e.UpdateBoundingVolume()
}

// SetDirection re-aims the light and rebuilds its matrix.
func (e *SpotLightEntity) SetDirection(x, y, z float32) {
	e.Direction.Set(x, y, z)
	e.Direction.Normalize(&e.Direction)
	e.updateMatrix()
	e.UpdateBoundingVolume()
}

// updateMatrix builds T * R(-Z -> dir) * S(radius, radius, range).
func (e *SpotLightEntity) updateMatrix() {
	m := e.Base.BaseMatrix
	physics.Mat4Identity(m)
	physics.Mat4Translate(m, m, &e.Position)
	spotRotation.RotationTo(spotForward, &e.Direction)
	physics.Mat4FromQuat(lightTempMatrix, spotRotation)
	physics.Mat4Multiply(m, m, lightTempMatrix)
	radius := float32(math.Tan(float64(e.Angle)*math.Pi/180)) * e.Range
	lightScaleVec.Set(radius, radius, e.Range)
	physics.Mat4Scale(m, m, lightScaleVec)
}

// Render draws the cone volume with the bound spotLight shader.
func (e *SpotLightEntity) Render(probeColor []float32, renderMode string, shader *rendering.Shader) {
	sh := rendering.Shaders.SpotLight
	if !e.Base.Visible || sh == nil || rendering.GlobalShapes.SpotlightVolume == nil {
		return
	}
	physics.Mat4Multiply(lightVolumeMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	lightPosRange[0] = e.Position.X
	lightPosRange[1] = e.Position.Y
	lightPosRange[2] = e.Position.Z
	lightPosRange[3] = e.Range
	lightColorInt[0] = e.Color[0]
	lightColorInt[1] = e.Color[1]
	lightColorInt[2] = e.Color[2]
	lightColorInt[3] = e.Intensity
	lightDirCutoff[0] = e.Direction.X
	lightDirCutoff[1] = e.Direction.Y
	lightDirCutoff[2] = e.Direction.Z
	lightDirCutoff[3] = e.Cutoff
	sh.SetMat4("matWorld", lightVolumeMatrix)
	sh.SetVec4("spotLight.posRange", lightPosRange)
	sh.SetVec4("spotLight.colorIntensity", lightColorInt)
	sh.SetVec4("spotLight.dirCutoff", lightDirCutoff)
	rendering.GlobalShapes.SpotlightVolume.RenderSingle(false, "triangles", "all", sh)
}

func (e *SpotLightEntity) RenderShadow(renderMode string, shader *rendering.Shader) {}

func (e *SpotLightEntity) RenderWireFrame() {
	if !e.Base.Visible || rendering.Shaders.Debug == nil || rendering.GlobalShapes.SpotlightVolume == nil {
		return
	}
	physics.Mat4Multiply(lightVolumeMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	rendering.Shaders.Debug.SetMat4("matWorld", lightVolumeMatrix)
	rendering.GlobalShapes.SpotlightVolume.RenderWireframe()
}

func (e *SpotLightEntity) UpdateBoundingVolume() {
	vol := rendering.GlobalShapes.SpotlightVolume
	if vol == nil || vol.BoundingBox == nil {
		return
	}
	if e.Base.BoundingBox == nil {
		e.Base.BoundingBox = physics.NewBoundingBox()
	}
	physics.Mat4Multiply(lightVolumeMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	vol.BoundingBox.TransformInto(lightVolumeMatrix, e.Base.BoundingBox)
}

func (e *SpotLightEntity) Dispose() { baseDispose(&e.Base) }
