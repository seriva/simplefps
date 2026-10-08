package scene

import (
	"math"

	"../mathx"
	"../rendering"
)

var (
	lightTempMatrix   = mathx.NewMat4()
	lightVolumeMatrix = mathx.NewMat4()
	lightPos          = &mathx.Vec3{}
	lightScaleVec     = &mathx.Vec3{}
	spotForward       = &mathx.Vec3{X: 0, Y: 0, Z: -1}
	spotRotation      = &mathx.Quat{}
	// Local-space bounds of the unit light volumes built by rendering.Shapes
	// (sphere: ±1; cone: apex at origin, base at z = -1).
	pointVolumeBounds = mathx.NewBoundingBoxFromValues(&mathx.Vec3{X: -1, Y: -1, Z: -1}, &mathx.Vec3{X: 1, Y: 1, Z: 1})
	spotVolumeBounds  = mathx.NewBoundingBoxFromValues(&mathx.Vec3{X: -1, Y: -1, Z: -1}, &mathx.Vec3{X: 1, Y: 1, Z: 0})
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

// Draw writes direction/colour into params0/params1 and draws the
// fullscreen triangle with the directional-light pipeline.
func (e *DirectionalLightEntity) Draw(r *rendering.Renderer, mode rendering.MaterialMode) {
	r.NextObject()
	r.ObjectParams(0, e.Direction[0], e.Direction[1], e.Direction[2], 0)
	r.ObjectParams(1, e.Color[0], e.Color[1], e.Color[2], 1)
	r.DrawFullscreen()
}
func (e *DirectionalLightEntity) DrawShadow(r *rendering.Renderer)                                  {}
func (e *DirectionalLightEntity) DrawWireframe(r *rendering.Renderer)                               {}
func (e *DirectionalLightEntity) DrawSkeleton(r *rendering.Renderer)                                {}
func (e *DirectionalLightEntity) Simulate(r *rendering.Renderer, pass rendering.GPUComputePassEncoder) {}
func (e *DirectionalLightEntity) Bounds() *mathx.BoundingBox                                        { return e.Base.BoundingBox }
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
func NewPointLightEntity(position *mathx.Vec3, size float32, color []float32, intensity float32, update UpdateCallback) *PointLightEntity {
	e := &PointLightEntity{Color: color, Size: size, Intensity: intensity}
	initBase(&e.Base, TypePointLight, update)
	if position != nil {
		mathx.Mat4Translate(e.Base.BaseMatrix, e.Base.BaseMatrix, position)
	}
	e.UpdateBoundingVolume()
	return e
}

func (e *PointLightEntity) GetBase() *EntityBase { return &e.Base }
func (e *PointLightEntity) Update(frameTime float32) bool {
	if !e.Base.Visible {
		return true
	}
	keep := baseUpdate(e, frameTime)
	e.UpdateBoundingVolume()
	return keep
}

// WorldPosition writes the light's world position (base * ani translation).
func (e *PointLightEntity) WorldPosition(out *mathx.Vec3) {
	mathx.Mat4Multiply(lightTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	mathx.Mat4GetTranslation(out, lightTempMatrix)
}

func (e *PointLightEntity) volumeMatrix() mathx.Mat4 {
	mathx.Mat4Multiply(lightTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	mathx.Mat4GetTranslation(lightPos, lightTempMatrix)
	lightScaleVec.Set(e.Size, e.Size, e.Size)
	mathx.Mat4Scale(lightVolumeMatrix, lightTempMatrix, lightScaleVec)
	return lightVolumeMatrix
}

// Draw draws the point light volume with the point-light pipeline.
func (e *PointLightEntity) Draw(r *rendering.Renderer, mode rendering.MaterialMode) {
	volMesh := r.Shapes.PointLightVolume
	if volMesh == nil {
		return
	}
	vol := e.volumeMatrix()
	r.NextObject()
	r.ObjectWorld(vol)
	r.ObjectParams(0, lightPos.X, lightPos.Y, lightPos.Z, e.Size)
	r.ObjectParams(1, e.Color[0], e.Color[1], e.Color[2], e.Intensity)
	volMesh.Draw(r, false, rendering.ModeAll)
}

func (e *PointLightEntity) DrawShadow(r *rendering.Renderer)                                  {}
func (e *PointLightEntity) DrawSkeleton(r *rendering.Renderer)                                {}
func (e *PointLightEntity) Simulate(r *rendering.Renderer, pass rendering.GPUComputePassEncoder) {}

// DrawWireframe draws the sphere volume outline with the debug pipeline.
func (e *PointLightEntity) DrawWireframe(r *rendering.Renderer) {
	volMesh := r.Shapes.PointLightVolume
	if volMesh == nil {
		return
	}
	r.NextObject()
	r.ObjectWorld(e.volumeMatrix())
	r.ObjectParamsVec(0, r.DebugColor())
	volMesh.DrawWireframe(r)
}

func (e *PointLightEntity) Bounds() *mathx.BoundingBox { return e.Base.BoundingBox }
func (e *PointLightEntity) TriangleCount() int           { return 0 }
func (e *PointLightEntity) CastsShadow() bool            { return false }

// LightScore ranks the light by intensity over squared distance to camPos.
func (e *PointLightEntity) LightScore(camPos *mathx.Vec3) float32 {
	e.WorldPosition(lightPos)
	return rendering.ContributionScore(lightPos.X, lightPos.Y, lightPos.Z, e.Intensity, camPos)
}

// AddToLighting packs the light into the transparent-pass UBO.
func (e *PointLightEntity) AddToLighting(data *rendering.LightingData) bool {
	e.WorldPosition(lightPos)
	return data.AddPointLight(lightPos.X, lightPos.Y, lightPos.Z, e.Size, e.Color[0], e.Color[1], e.Color[2], e.Intensity)
}

// UpdateBoundingVolume fits the AABB to the transformed sphere volume.
func (e *PointLightEntity) UpdateBoundingVolume() {
	if e.Base.BoundingBox == nil {
		e.Base.BoundingBox = mathx.NewBoundingBox()
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
	Position  mathx.Vec3
	Direction mathx.Vec3
	Color     []float32
	Intensity float32
	Range     float32
	Angle     float32 // degrees (cone half-angle)
	Cutoff    float32 // cos(Angle)
}

// NewSpotLightEntity creates a spot light; angle is the cone half-angle in degrees.
func NewSpotLightEntity(position, direction *mathx.Vec3, color []float32, intensity, angle, rng float32, update UpdateCallback) *SpotLightEntity {
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
	if !e.Base.Visible {
		return true
	}
	keep := baseUpdate(e, frameTime)
	e.UpdateBoundingVolume()
	return keep
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
	mathx.Mat4Identity(m)
	mathx.Mat4Translate(m, m, &e.Position)
	spotRotation.RotationTo(spotForward, &e.Direction)
	mathx.Mat4FromQuat(lightTempMatrix, spotRotation)
	mathx.Mat4Multiply(m, m, lightTempMatrix)
	radius := float32(math.Tan(float64(e.Angle)*math.Pi/180)) * e.Range
	lightScaleVec.Set(radius, radius, e.Range)
	mathx.Mat4Scale(m, m, lightScaleVec)
}

// Draw draws the cone volume with the spot-light pipeline.
func (e *SpotLightEntity) Draw(r *rendering.Renderer, mode rendering.MaterialMode) {
	volMesh := r.Shapes.SpotlightVolume
	if volMesh == nil {
		return
	}
	mathx.Mat4Multiply(lightVolumeMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	r.NextObject()
	r.ObjectWorld(lightVolumeMatrix)
	r.ObjectParams(0, e.Position.X, e.Position.Y, e.Position.Z, e.Range)
	r.ObjectParams(1, e.Color[0], e.Color[1], e.Color[2], e.Intensity)
	r.ObjectParams(2, e.Direction.X, e.Direction.Y, e.Direction.Z, e.Cutoff)
	volMesh.Draw(r, false, rendering.ModeAll)
}

func (e *SpotLightEntity) DrawShadow(r *rendering.Renderer)                                  {}
func (e *SpotLightEntity) DrawSkeleton(r *rendering.Renderer)                                {}
func (e *SpotLightEntity) Simulate(r *rendering.Renderer, pass rendering.GPUComputePassEncoder) {}

// DrawWireframe draws the cone volume outline with the debug pipeline.
func (e *SpotLightEntity) DrawWireframe(r *rendering.Renderer) {
	volMesh := r.Shapes.SpotlightVolume
	if volMesh == nil {
		return
	}
	mathx.Mat4Multiply(lightVolumeMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	r.NextObject()
	r.ObjectWorld(lightVolumeMatrix)
	r.ObjectParamsVec(0, r.DebugColor())
	volMesh.DrawWireframe(r)
}

func (e *SpotLightEntity) Bounds() *mathx.BoundingBox { return e.Base.BoundingBox }
func (e *SpotLightEntity) TriangleCount() int           { return 0 }
func (e *SpotLightEntity) CastsShadow() bool            { return false }

// LightScore ranks the light by intensity over squared distance to camPos.
func (e *SpotLightEntity) LightScore(camPos *mathx.Vec3) float32 {
	return rendering.ContributionScore(e.Position.X, e.Position.Y, e.Position.Z, e.Intensity, camPos)
}

// AddToLighting packs the light into the transparent-pass UBO.
func (e *SpotLightEntity) AddToLighting(data *rendering.LightingData) bool {
	return data.AddSpotLight(e.Position.X, e.Position.Y, e.Position.Z, e.Range,
		e.Color[0], e.Color[1], e.Color[2], e.Intensity,
		e.Direction.X, e.Direction.Y, e.Direction.Z, e.Cutoff)
}

// UpdateBoundingVolume fits the AABB to the transformed cone volume.
func (e *SpotLightEntity) UpdateBoundingVolume() {
	if e.Base.BoundingBox == nil {
		e.Base.BoundingBox = mathx.NewBoundingBox()
	}
	mathx.Mat4Multiply(lightVolumeMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	spotVolumeBounds.TransformInto(lightVolumeMatrix, e.Base.BoundingBox)
}

func (e *SpotLightEntity) Dispose() { baseDispose(&e.Base) }
