package scene

import (
	"../physics"
	"../rendering"
)

// Entity type identifiers (mirror entity.js EntityTypes).
const (
	TypeMesh              = 1
	TypeFPSMesh           = 2
	TypeDirectionalLight  = 3
	TypePointLight        = 4
	TypeSpotLight         = 5
	TypeSkybox            = 6
	TypeSkinnedMesh       = 7
	TypeAnimatedBillboard = 8
	TypeParticleEmitter   = 9

	// TypeCount is one past the highest entity type (for per-type tables).
	TypeCount = 10
)

// Shadow height states (MeshEntity.shadowHeight null/undefined/number in JS).
const (
	ShadowHeightPending = 0 // needs a raycast
	ShadowHeightNone    = 1 // raycast found no ground
	ShadowHeightValid   = 2 // ShadowHeight holds the ground Y
)

// UpdateCallback is invoked once per frame for a non-static entity; returning
// false removes the entity from the scene.
type UpdateCallback func(e Entity, frameTime float32) bool

// EntityBase carries the state shared by all entity kinds. Concrete entities
// embed it by composition and expose it through GetBase().
type EntityBase struct {
	Type          int
	Visible       bool
	CastShadow    bool
	ReceiveShadow bool
	IsStatic      bool
	AnimationTime float32

	BaseMatrix physics.Mat4
	AniMatrix  physics.Mat4

	BoundingBox *physics.BoundingBox
	Collider    *physics.Trimesh

	// TriangleCount feeds render stats without a type assertion.
	TriangleCount int

	// UserData is free-form game state (entity.data / linkedLight in JS).
	UserData any

	// ShadowHeight caches the drop-shadow ground Y; see ShadowHeight* states.
	ShadowHeight      float32
	ShadowHeightState int

	// ProbeColor is the ambient probe sample refreshed by Scene.Update for
	// visible mesh entities (geometry shader uProbeColor).
	ProbeColor []float32

	// Skinned shadow re-sample tracking.
	ShadowSampleValid bool
	ShadowSampleX     float32
	ShadowSampleY     float32
	ShadowSampleZ     float32
	ShadowSampleFrame int

	Callback UpdateCallback

	markedForRemoval bool
}

// Entity is the polymorphic contract the Scene drives each frame. It is a
// superset of rendering.Drawable (spelled out: GoFront does not promote
// embedded interface methods through a struct type assertion).
type Entity interface {
	GetBase() *EntityBase
	// Update advances the entity by frameTime (ms); false requests removal.
	Update(frameTime float32) bool
	UpdateBoundingVolume()
	Dispose()

	// rendering.Drawable
	Draw(r *rendering.Renderer, sh *rendering.Shader, mode string)
	DrawShadow(r *rendering.Renderer, sh *rendering.Shader)
	DrawWireframe(r *rendering.Renderer, sh *rendering.Shader)
	DrawSkeleton(r *rendering.Renderer, sh *rendering.Shader)
	Bounds() *physics.BoundingBox
	TriangleCount() int
	CastsShadow() bool
}

// initBase fills the defaults shared by all entities.
func initBase(b *EntityBase, entityType int, update UpdateCallback) {
	b.Type = entityType
	b.Visible = true
	b.CastShadow = true
	b.ReceiveShadow = true
	b.BaseMatrix = physics.NewMat4()
	b.AniMatrix = physics.NewMat4()
	b.ProbeColor = make([]float32, 3)
	b.ShadowHeightState = ShadowHeightPending
	b.Callback = update
}

// baseUpdate runs the update callback (when visible) and refreshes bounds.
func baseUpdate(e Entity, frameTime float32) bool {
	b := e.GetBase()
	if !b.Visible {
		return true
	}
	result := true
	if b.Callback != nil {
		result = b.Callback(e, frameTime)
	}
	e.UpdateBoundingVolume()
	return result
}

// baseDispose clears references held by the base.
func baseDispose(b *EntityBase) {
	b.Callback = nil
	b.BoundingBox = nil
}
