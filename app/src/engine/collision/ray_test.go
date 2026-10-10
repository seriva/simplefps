//gofront:target wasm
package collision

import (
	"testing"

	"../mathx"
)

func TestRayPointInTriangle(t *testing.T) {
	a := mathx.Vec3{X: 0, Y: 0, Z: 0}
	b := mathx.Vec3{X: 10, Y: 0, Z: 0}
	c := mathx.Vec3{X: 0, Y: 0, Z: 10}

	inside := mathx.Vec3{X: 2, Y: 0, Z: 2}
	outside := mathx.Vec3{X: 10, Y: 0, Z: 10}

	if !rayPointInTriangle(&inside, &a, &b, &c) {
		t.Errorf("Point (2, 0, 2) should be inside triangle")
	}
	if rayPointInTriangle(&outside, &a, &b, &c) {
		t.Errorf("Point (10, 0, 10) should be outside triangle")
	}
}

func TestRayIntersectTrimesh(t *testing.T) {
	// Horizontal triangle at Y = 0 (CCW winding when viewed from +Y)
	verts := []float32{
		0, 0, 0,
		0, 0, 10,
		10, 0, 0,
	}
	indices := []int32{0, 1, 2}
	tm := NewTrimesh(verts, indices, nil)

	// Ray firing downward from Y = 10 to Y = -10 at (2, 2)
	from := mathx.Vec3{X: 2, Y: 10, Z: 2}
	to := mathx.Vec3{X: 2, Y: -10, Z: 2}
	ray := NewRay(&from, &to)
	ray.Mode = RayModeClosest

	ray.IntersectTrimesh(tm, nil)

	if !ray.HasHit {
		t.Fatalf("Ray should intersect trimesh floor")
	}
	if !floatApprox(ray.Result.Distance, 10.0) {
		t.Errorf("Hit distance failed: expected 10.0, got %f", ray.Result.Distance)
	}
	if !floatApprox(ray.Result.HitPointWorld.Y, 0.0) {
		t.Errorf("Hit point Y failed: expected 0.0, got %f", ray.Result.HitPointWorld.Y)
	}
	if !floatApprox(ray.Result.HitNormalWorld.Y, 1.0) {
		t.Errorf("Hit normal Y failed: expected 1.0, got %f", ray.Result.HitNormalWorld.Y)
	}
}
