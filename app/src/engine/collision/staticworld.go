//gofront:target wasm
package collision

// StaticWorld raycasts against the merged static trimesh. It satisfies
// physics.RaycastProvider on the WASM side, so per-step controller and body
// queries never cross the JS boundary.
type StaticWorld struct {
	// Trimesh is the static collision mesh; nil means nothing to hit.
	Trimesh *Trimesh

	ray         *Ray
	defaultOpts RayOptions
}

// NewStaticWorld creates an empty static world.
func NewStaticWorld() *StaticWorld {
	return &StaticWorld{
		ray:         NewRay(nil, nil),
		defaultOpts: RayOptions{SkipBackfaces: true, CollisionFilterMask: 1, Mode: RayModeClosest},
	}
}

// RaycastStatic tests the segment against Trimesh. A nil options uses the
// defaults (skip backfaces, closest hit). The result is owned by w and only
// valid until the next call.
func (w *StaticWorld) RaycastStatic(fromX, fromY, fromZ, toX, toY, toZ float32, options *RayOptions) *RaycastResult {
	if options == nil {
		options = &w.defaultOpts
	}
	w.ray.Setup(fromX, fromY, fromZ, toX, toY, toZ, options)
	if w.Trimesh != nil {
		w.ray.IntersectTrimesh(w.Trimesh, nil)
	}
	return &w.ray.Result
}
