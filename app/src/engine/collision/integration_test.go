//gofront:target wasm
package collision

import (
	"testing"

	"../mathx"
)

// gridFloor builds an n×n quad grid at height y spanning [0, size] on X and Z,
// wound CCW when viewed from +Y (normal +Y).
func gridFloor(n int, size, y float32) *Trimesh {
	verts := make([]float32, 0, (n+1)*(n+1)*3)
	idx := make([]int32, 0, n*n*6)
	step := size / float32(n)
	for zi := 0; zi <= n; zi++ {
		for xi := 0; xi <= n; xi++ {
			verts = append(verts, float32(xi)*step, y, float32(zi)*step)
		}
	}
	row := int32(n + 1)
	for zi := 0; zi < n; zi++ {
		for xi := 0; xi < n; xi++ {
			a := int32(zi)*row + int32(xi)
			b := a + 1
			c := a + row
			d := c + 1
			idx = append(idx, a, c, d, a, d, b)
		}
	}
	tm, err := NewTrimesh(verts, idx, nil)
	if err != nil {
		panic("gridFloor: " + err.Error())
	}
	return tm
}

func TestRayIntersectSubdividedTrimesh(t *testing.T) {
	tm := gridFloor(16, 1600, 0)
	from := mathx.Vec3{X: 123, Y: 50, Z: 456}
	to := mathx.Vec3{X: 123, Y: -50, Z: 456}
	ray := NewRay(&from, &to)
	ray.Mode = RayModeClosest
	ray.IntersectTrimesh(tm, nil)
	if !ray.HasHit {
		t.Fatal("Ray should hit the subdivided floor")
	}
	hp := &ray.Result.HitPointWorld
	if !floatApprox(hp.Y, 0) || !floatApprox(hp.X, 123) || !floatApprox(hp.Z, 456) {
		t.Errorf("Hit point wrong: (%f, %f, %f)", hp.X, hp.Y, hp.Z)
	}
	if !floatApprox(ray.Result.Distance, 50) {
		t.Errorf("Expected distance 50, got %f", ray.Result.Distance)
	}
}

func TestRayIntersectTrimeshWorldMatrix(t *testing.T) {
	// A floor translated up by 100 via the world matrix must be hit at Y = 100.
	tm := gridFloor(4, 400, 0)
	m := mathx.NewMat4()
	lift := mathx.Vec3{X: 0, Y: 100, Z: 0}
	mathx.Mat4Translate(m, m, &lift)
	from := mathx.Vec3{X: 130, Y: 300, Z: 170}
	to := mathx.Vec3{X: 130, Y: -300, Z: 170}
	ray := NewRay(&from, &to)
	ray.Mode = RayModeClosest
	ray.IntersectTrimesh(tm, m)
	if !ray.HasHit {
		t.Fatal("Ray should hit the translated floor")
	}
	if !floatApprox(ray.Result.HitPointWorld.Y, 100) {
		t.Errorf("Expected world hit Y = 100, got %f", ray.Result.HitPointWorld.Y)
	}
	if !floatApprox(ray.Result.Distance, 200) {
		t.Errorf("Expected distance 200, got %f", ray.Result.Distance)
	}
}
