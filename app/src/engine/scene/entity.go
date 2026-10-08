package scene

import (
	"../collision"
	"../mathx"
	"../rendering"
)

// Entity type identifiers; EntityBase.Type selects the draw list a visible
// entity lands in.
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

// Shadow height states (shadowState.HeightState).
const (
	ShadowHeightPending = 0 // needs a raycast; must stay 0 (zero-valued shadowState is pending)
	ShadowHeightNone    = 1 // raycast found no ground
	ShadowHeightValid   = 2 // Height holds the ground Y
)

// UpdateCallback is invoked once per frame for a non-static entity; returning
// false removes the entity from the scene.
type UpdateCallback func(e Entity, frameTime float32) bool

// EntityBase carries the state shared by all entity kinds. Concrete entities
// hold it as a named field and expose it through GetBase().
type EntityBase struct {
	Type          int
	Visible       bool
	CastShadow    bool
	IsStatic      bool
	AnimationTime float32

	BaseMatrix mathx.Mat4
	AniMatrix  mathx.Mat4

	BoundingBox *mathx.BoundingBox
	Collider    *collision.Trimesh

	// UserData is free-form game state attached by the game layer.
	UserData any

	Callback UpdateCallback

	markedForRemoval bool
}

// shadowState caches the drop-shadow ground height of a mesh entity and the
// position it was last sampled at (skinned meshes re-sample on movement).
// Held as a named struct field: mutate in place, never copy it out (GoFront
// clones struct values on assignment).
type shadowState struct {
	Height      float32
	HeightState int

	SampleValid bool
	SampleX     float32
	SampleY     float32
	SampleZ     float32
	SampleFrame int
}

// probeCache holds the ambient probe colour sampled by Scene.UpdateVisibility
// for a visible mesh entity (ObjectData.probe.rgb). Three scalars
// rather than a slice so a cache is allocation-free; mutate in place.
type probeCache struct {
	R float32
	G float32
	B float32
}

// setObjectProbe writes p into the current ObjectData slot (shadow height 0).
func setObjectProbe(r *rendering.Renderer, p *probeCache) {
	r.ObjectProbe(p.R, p.G, p.B, 0)
}

// Entity is the contract the Scene drives each frame. Rendering is a separate
// concern: entities that draw also implement rendering.Drawable (lights
// rendering.LightDrawable) and are routed into the renderer's draw lists by
// Scene.UpdateVisibility.
type Entity interface {
	GetBase() *EntityBase
	// Update advances the entity by frameTime (ms); false requests removal.
	Update(frameTime float32) bool
	Dispose()
}

// initBase fills the defaults shared by all entities.
func initBase(b *EntityBase, entityType int, update UpdateCallback) {
	b.Type = entityType
	b.Visible = true
	b.CastShadow = true
	b.BaseMatrix = mathx.NewMat4()
	b.AniMatrix = mathx.NewMat4()
	b.Callback = update
}

// baseUpdate runs the update callback when the entity is visible; false
// requests removal. Entities with a bounding volume refresh it afterwards,
// also only while visible (hidden entities are skipped by culling anyway).
func baseUpdate(e Entity, frameTime float32) bool {
	b := e.GetBase()
	if !b.Visible || b.Callback == nil {
		return true
	}
	return b.Callback(e, frameTime)
}

// baseDispose clears references held by the base.
func baseDispose(b *EntityBase) {
	b.Callback = nil
	b.BoundingBox = nil
}
