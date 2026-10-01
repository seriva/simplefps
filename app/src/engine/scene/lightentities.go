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
	// Local-space bounds of the unit light volumes built by rendering.Shapes
	// (sphere: ±1; cone: apex at origin, base at z = -1).
	pointVolumeBounds = physics.NewBoundingBoxFromValues(&physics.Vec3{X: -1, Y: -1, Z: -1}, &physics.Vec3{X: 1, Y: 1, Z: 1})
	spotVolumeBounds  = physics.NewBoundingBoxFromValues(&physics.Vec3{X: -1, Y: -1, Z: -1}, &physics.Vec3{X: 1, Y: 1, Z: 0})
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

// Draw sets the light uniforms on the bound directionalLight shader and
// draws the screen quad.
func (e *DirectionalLightEntity) Draw(r *rendering.Renderer, sh *rendering.Shader, mode string) {
	quad := r.Shapes.ScreenQuad
	if sh == nil || quad == nil {
		return
	}
	sh.SetVec3("directionalLight.direction", e.Direction)
	sh.SetVec3("directionalLight.color", e.Color)
	quad.RenderSingle(false, "triangles", "all", sh)
}
func (e *DirectionalLightEntity) DrawShadow(r *rendering.Renderer, sh *rendering.Shader)    {}
func (e *DirectionalLightEntity) DrawWireframe(r *rendering.Renderer, sh *rendering.Shader) {}
func (e *DirectionalLightEntity) DrawSkeleton(r *rendering.Renderer, sh *rendering.Shader)  {}
func (e *DirectionalLightEntity) Bounds() *physics.BoundingBox                             { return e.Base.BoundingBox }
func (e *DirectionalLightEntity) TriangleCount() int                                       { return 0 }
func (e *DirectionalLightEntity) CastsShadow() bool                                        { return false }
func (e *DirectionalLightEntity) Dispose()                                                 { baseDispose(&e.Base) }

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

// Draw draws the point light volume with the bound pointLight shader.
func (e *PointLightEntity) Draw(r *rendering.Renderer, sh *rendering.Shader, mode string) {
	volMesh := r.Shapes.PointLightVolume
	if sh == nil || volMesh == nil {
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
	volMesh.RenderSingle(false, "triangles", "all", sh)
}

func (e *PointLightEntity) DrawShadow(r *rendering.Renderer, sh *rendering.Shader)   {}
func (e *PointLightEntity) DrawSkeleton(r *rendering.Renderer, sh *rendering.Shader) {}

// DrawWireframe draws the sphere volume outline with the bound debug shader.
func (e *PointLightEntity) DrawWireframe(r *rendering.Renderer, sh *rendering.Shader) {
	volMesh := r.Shapes.PointLightVolume
	if sh == nil || volMesh == nil {
		return
	}
	sh.SetMat4("matWorld", e.volumeMatrix())
	volMesh.RenderWireframe()
}

func (e *PointLightEntity) Bounds() *physics.BoundingBox { return e.Base.BoundingBox }
func (e *PointLightEntity) TriangleCount() int           { return 0 }
func (e *PointLightEntity) CastsShadow() bool            { return false }

// LightScore ranks the light by intensity over squared distance to camPos.
func (e *PointLightEntity) LightScore(camPos *physics.Vec3) float32 {
	e.WorldPosition(lightPos)
	return rendering.ContributionScore(lightPos.X, lightPos.Y, lightPos.Z, e.Intensity, camPos)
}

// AddToLighting packs the light into the transparent-pass UBO.
func (e *PointLightEntity) AddToLighting(data *rendering.LightingData) bool {
	e.WorldPosition(lightPos)
	return data.AddPointLight(lightPos.X, lightPos.Y, lightPos.Z, e.Size, e.Color[0], e.Color[1], e.Color[2], e.Intensity)
}

func (e *PointLightEntity) UpdateBoundingVolume() {
	if e.Base.BoundingBox == nil {
		e.Base.BoundingBox = physics.NewBoundingBox()
	}
	pointVolumeBounds.TransformInto(e.volumeMatrix(), e.Base.BoundingBox)
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

// Draw draws the cone volume with the bound spotLight shader.
func (e *SpotLightEntity) Draw(r *rendering.Renderer, sh *rendering.Shader, mode string) {
	volMesh := r.Shapes.SpotlightVolume
	if sh == nil || volMesh == nil {
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
	volMesh.RenderSingle(false, "triangles", "all", sh)
}

func (e *SpotLightEntity) DrawShadow(r *rendering.Renderer, sh *rendering.Shader)   {}
func (e *SpotLightEntity) DrawSkeleton(r *rendering.Renderer, sh *rendering.Shader) {}

// DrawWireframe draws the cone volume outline with the bound debug shader.
func (e *SpotLightEntity) DrawWireframe(r *rendering.Renderer, sh *rendering.Shader) {
	volMesh := r.Shapes.SpotlightVolume
	if sh == nil || volMesh == nil {
		return
	}
	physics.Mat4Multiply(lightVolumeMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	sh.SetMat4("matWorld", lightVolumeMatrix)
	volMesh.RenderWireframe()
}

func (e *SpotLightEntity) Bounds() *physics.BoundingBox { return e.Base.BoundingBox }
func (e *SpotLightEntity) TriangleCount() int           { return 0 }
func (e *SpotLightEntity) CastsShadow() bool            { return false }

// LightScore ranks the light by intensity over squared distance to camPos.
func (e *SpotLightEntity) LightScore(camPos *physics.Vec3) float32 {
	return rendering.ContributionScore(e.Position.X, e.Position.Y, e.Position.Z, e.Intensity, camPos)
}

// AddToLighting packs the light into the transparent-pass UBO.
func (e *SpotLightEntity) AddToLighting(data *rendering.LightingData) bool {
	return data.AddSpotLight(e.Position.X, e.Position.Y, e.Position.Z, e.Range,
		e.Color[0], e.Color[1], e.Color[2], e.Intensity,
		e.Direction.X, e.Direction.Y, e.Direction.Z, e.Cutoff)
}

func (e *SpotLightEntity) UpdateBoundingVolume() {
	if e.Base.BoundingBox == nil {
		e.Base.BoundingBox = physics.NewBoundingBox()
	}
	physics.Mat4Multiply(lightVolumeMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	spotVolumeBounds.TransformInto(lightVolumeMatrix, e.Base.BoundingBox)
}

func (e *SpotLightEntity) Dispose() { baseDispose(&e.Base) }
