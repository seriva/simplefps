package rendering

import "../physics"

// Drawable is the only thing a render pass needs from a scene entity. The
// renderer binds the shader and GPU state for a pass, then calls one of these
// per visible entity. Implementations live in package scene.
type Drawable interface {
	// Draw issues the entity's geometry with the pass's bound shader. mode is
	// the material filter ("all"/"opaque"/"translucent").
	Draw(r *Renderer, sh *Shader, mode string)
	// DrawShadow draws the flattened drop shadow with the bound shadow shader.
	DrawShadow(r *Renderer, sh *Shader)
	// DrawWireframe draws the debug wireframe (or light volume) with the bound
	// debug shader.
	DrawWireframe(r *Renderer, sh *Shader)
	// DrawSkeleton draws joint lines for skinned entities; no-op otherwise.
	DrawSkeleton(r *Renderer, sh *Shader)
	// Bounds returns the world-space AABB for the debug overlay (nil = none).
	Bounds() *physics.BoundingBox
	TriangleCount() int
	CastsShadow() bool
}

// LightDrawable adds the data the lighting and transparent passes sort on
// and pack into the LightingData UBO.
type LightDrawable interface {
	Drawable
	// LightScore ranks the light's contribution at camPos (intensity / d²).
	LightScore(camPos *physics.Vec3) float32
	// AddToLighting appends the light to data; false when the slot type is full.
	AddToLighting(data *LightingData) bool
}

// DrawList is a fixed-capacity view over a scene bucket; Items[0:Count] is the
// live range. (A sliced []Drawable return is not an option: GoFront emits
// s[:n] as .slice(), which allocates per call.)
type DrawList struct {
	Items []Drawable
	Count int
}

// NewDrawList pre-allocates room for capacity drawables.
func NewDrawList(capacity int) *DrawList {
	return &DrawList{Items: make([]Drawable, capacity)}
}

// Reset empties the list, dropping references so entities can be collected.
func (l *DrawList) Reset() {
	for i := 0; i < l.Count; i++ {
		l.Items[i] = nil
	}
	l.Count = 0
}

// Add appends d, doubling the backing array when full.
func (l *DrawList) Add(d Drawable) {
	if l.Count >= len(l.Items) {
		newCap := len(l.Items) * 2
		if newCap < 8 {
			newCap = 8
		}
		grown := make([]Drawable, newCap)
		for i := 0; i < l.Count; i++ {
			grown[i] = l.Items[i]
		}
		l.Items = grown
	}
	l.Items[l.Count] = d
	l.Count++
}

// LightList is DrawList for LightDrawable.
type LightList struct {
	Items []LightDrawable
	Count int
}

// NewLightList pre-allocates room for capacity lights.
func NewLightList(capacity int) *LightList {
	return &LightList{Items: make([]LightDrawable, capacity)}
}

// Reset empties the list.
func (l *LightList) Reset() {
	for i := 0; i < l.Count; i++ {
		l.Items[i] = nil
	}
	l.Count = 0
}

// Add appends d, doubling the backing array when full.
func (l *LightList) Add(d LightDrawable) {
	if l.Count >= len(l.Items) {
		newCap := len(l.Items) * 2
		if newCap < 8 {
			newCap = 8
		}
		grown := make([]LightDrawable, newCap)
		for i := 0; i < l.Count; i++ {
			grown[i] = l.Items[i]
		}
		l.Items = grown
	}
	l.Items[l.Count] = d
	l.Count++
}

// SceneSource is what the renderer pulls from the scene each frame: the
// ambient colour and the culled, per-kind draw lists. Every accessor returns a
// scene-owned list refilled during Scene.Update; contents are valid until the
// next update. Pass order, shader selection and GPU state live in the renderer.
type SceneSource interface {
	Ambient(out *physics.Vec3)
	Skyboxes() *DrawList
	// Meshes is the opaque world geometry (also drawn for drop shadows).
	Meshes() *DrawList
	FPSMeshes() *DrawList
	SkinnedMeshes() *DrawList
	DirectionalLights() *DrawList
	PointLights() *LightList
	SpotLights() *LightList
	Billboards() *DrawList
	ParticleEmitters() *DrawList
	// Transparent holds translucent meshes pre-sorted back-to-front.
	Transparent() *DrawList
}

// hasShadowCasters reports whether any visible mesh or skinned mesh casts a
// drop shadow (gates the shadow blur).
func hasShadowCasters(scene SceneSource) bool {
	if scene == nil {
		return false
	}
	meshes := scene.Meshes()
	for i := 0; i < meshes.Count; i++ {
		if meshes.Items[i].CastsShadow() {
			return true
		}
	}
	skinned := scene.SkinnedMeshes()
	for i := 0; i < skinned.Count; i++ {
		if skinned.Items[i].CastsShadow() {
			return true
		}
	}
	return false
}
