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
	return NewTrimesh(verts, idx, nil)
}

func TestOctreeSubdividedRayAndAABBQuery(t *testing.T) {
	// 16×16 grid = 512 triangles forces the octree to subdivide (max 8 per leaf).
	tm := gridFloor(16, 1600, 0)
	tree := tm.Tree
	if len(tree.Children) == 0 {
		t.Fatal("Expected octree to subdivide for 512 triangles")
	}

	// Ray query straight down over one cell must return a small candidate set
	// containing the two triangles of that cell (cell 5,7 → tris 2*(7*16+5), +1).
	origin := mathx.Vec3{X: 550, Y: 100, Z: 750}
	dir := mathx.Vec3{X: 0, Y: -1, Z: 0}
	out := make([]int, MaxRayQueryResults)
	n := tree.RayQueryLocal(&origin, &dir, 200, out, nil)
	if n == 0 || n > 64 {
		t.Fatalf("Expected a small non-empty candidate set, got %d", n)
	}
	want0 := 2 * (7*16 + 5)
	found := 0
	for i := 0; i < n; i++ {
		if out[i] == want0 || out[i] == want0+1 {
			found++
		}
	}
	if found != 2 {
		t.Errorf("Ray candidates missing cell triangles %d/%d (found %d of 2)", want0, want0+1, found)
	}

	// Bounded output: a 1-slot buffer must never overflow and reports 1.
	small := make([]int, 1)
	if got := tree.RayQueryLocal(&origin, &dir, 200, small, nil); got != 1 {
		t.Errorf("Expected count clamped to len(out)=1, got %d", got)
	}

	// AABB query over a 2×2 cell region (cells 4..5 × 4..5) must contain those
	// 8 triangles. Octree candidates also include straddling triangles stored in
	// ancestor nodes, but the set must stay far below the full 512.
	region := mathx.NewBoundingBoxFromValues(mathx.NewVec3(410, -1, 410), mathx.NewVec3(590, 1, 590))
	n = tree.AABBQuery(region, out)
	if n < 8 || n > 128 {
		t.Errorf("Expected a bounded candidate set (8..128) for region, got %d", n)
	}
	for cz := 4; cz <= 5; cz++ {
		for cx := 4; cx <= 5; cx++ {
			base := 2 * (cz*16 + cx)
			seen := 0
			for i := 0; i < n; i++ {
				if out[i] == base || out[i] == base+1 {
					seen++
				}
			}
			if seen != 2 {
				t.Errorf("AABBQuery missing triangles of cell %d,%d (found %d of 2)", cx, cz, seen)
			}
		}
	}

	// Ray missing the mesh entirely (parallel above it) returns 0.
	sideOrigin := mathx.Vec3{X: -100, Y: 50, Z: 800}
	sideDir := mathx.Vec3{X: 0, Y: 0, Z: 1}
	if got := tree.RayQueryLocal(&sideOrigin, &sideDir, 100, out, nil); got != 0 {
		t.Errorf("Expected 0 candidates for a ray outside the tree, got %d", got)
	}
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
