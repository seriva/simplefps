//gofront:target wasm
package collision

import (
	"slices"
	"testing"
	"time"

	"../mathx"
)

func TestSpatialHashSubdividedRayAndAABBQuery(t *testing.T) {
	// 16×16 grid = 512 triangles
	tm := gridFloor(16, 1600, 0)
	sh := newSpatialHash(tm.Vertices, tm.Indices, &tm.AABB, 100) // 100 unit cells match the 100 unit quads

	if sh.voxelCount == 0 {
		t.Fatal("Expected spatial hash to have non-zero voxel count")
	}

	for _, mode := range []spatialHashMode{spatialHashModeMap, spatialHashModeFlat} {
		sh.mode = mode

		// Ray query straight down over cell (5, 7)
		origin := mathx.Vec3{X: 550, Y: 100, Z: 750}
		dir := mathx.Vec3{X: 0, Y: -1, Z: 0}
		out := make([]int, MaxRayQueryResults)
		n := sh.rayQueryLocal(&origin, &dir, 200, out, nil)
		if n == 0 || n > 64 {
			t.Fatalf("Mode %d: Expected a small non-empty candidate set, got %d", mode, n)
		}

		want0 := 2 * (7*16 + 5)
		found := 0
		if slices.Contains(out[:n], want0) {
			found++
		}
		if slices.Contains(out[:n], want0+1) {
			found++
		}
		if found != 2 {
			t.Errorf("Mode %d: Ray candidates missing cell triangles %d/%d (found %d of 2)", mode, want0, want0+1, found)
		}

		// Verify deduplication: no duplicate triangle indices in out[:n]
		seen := make(map[int]bool)
		for _, idx := range out[:n] {
			if seen[idx] {
				t.Errorf("Mode %d: Duplicate triangle %d in query candidates", mode, idx)
			}
			seen[idx] = true
		}

		// Bounded output: 1-slot buffer clamped to 1
		small := make([]int, 1)
		if got := sh.rayQueryLocal(&origin, &dir, 200, small, nil); got != 1 {
			t.Errorf("Mode %d: Expected count clamped to len(out)=1, got %d", mode, got)
		}

		// AABB query over 2×2 cell region (cells 4..5 × 4..5)
		region := mathx.NewBoundingBoxFromValues(mathx.NewVec3(410, -1, 410), mathx.NewVec3(590, 1, 590))
		n = sh.aabbQuery(region, out)
		if n < 8 || n > 128 {
			t.Errorf("Mode %d: Expected bounded candidate set (8..128), got %d", mode, n)
		}
		for cz := 4; cz <= 5; cz++ {
			for cx := 4; cx <= 5; cx++ {
				base := 2 * (cz*16 + cx)
				s := 0
				if slices.Contains(out[:n], base) {
					s++
				}
				if slices.Contains(out[:n], base+1) {
					s++
				}
				if s != 2 {
					t.Errorf("Mode %d: aabbQuery missing cell %d,%d triangles (found %d of 2)", mode, cx, cz, s)
				}
			}
		}

		// Ray missing the mesh entirely returns 0
		sideOrigin := mathx.Vec3{X: -100, Y: 50, Z: 800}
		sideDir := mathx.Vec3{X: 0, Y: 0, Z: 1}
		if got := sh.rayQueryLocal(&sideOrigin, &sideDir, 100, out, nil); got != 0 {
			t.Errorf("Mode %d: Expected 0 candidates for ray outside grid, got %d", mode, got)
		}
	}
}

func TestRayIntersectTrimeshBroadphaseParity(t *testing.T) {
	tm := gridFloor(16, 1600, 0)
	from := mathx.Vec3{X: 123, Y: 50, Z: 456}
	to := mathx.Vec3{X: 123, Y: -50, Z: 456}

	// Verify both spatial hash modes produce identical ray hit results
	modes := []int{BroadphaseSpatialHashMap, BroadphaseSpatialHashFlat}
	for _, mode := range modes {
		tm.SetBroadphase(mode)
		ray := NewRay(&from, &to)
		ray.Mode = RayModeClosest
		ray.IntersectTrimesh(tm, nil)

		if !ray.HasHit {
			t.Fatalf("Mode %d: Ray should hit subdivided floor", mode)
		}
		hp := &ray.Result.HitPointWorld
		if !floatApprox(hp.Y, 0) || !floatApprox(hp.X, 123) || !floatApprox(hp.Z, 456) {
			t.Errorf("Mode %d: Hit point wrong: (%f, %f, %f)", mode, hp.X, hp.Y, hp.Z)
		}
		if !floatApprox(ray.Result.Distance, 50) {
			t.Errorf("Mode %d: Expected distance 50, got %f", mode, ray.Result.Distance)
		}
		if !floatApprox(ray.Result.HitNormalWorld.Y, 1.0) {
			t.Errorf("Mode %d: Expected normal Y=1.0, got %f", mode, ray.Result.HitNormalWorld.Y)
		}
	}
}

func TestConstructionTimeAndMemoryStats(t *testing.T) {
	// 32×32 grid = 2048 triangles (benchmark scene geometry)
	tm := gridFloor(32, 1600, 0)

	hashVoxels, hashRefs, flatCells := tm.SpatialHashStats()

	if hashVoxels == 0 || hashRefs == 0 || flatCells == 0 {
		t.Fatalf("Expected non-zero SpatialHash stats: voxels=%d refs=%d flatCells=%d", hashVoxels, hashRefs, flatCells)
	}

	// Timed build benchmark
	iterations := 50
	t1 := time.Now()
	for i := 0; i < iterations; i++ {
		tm.BuildSpatialHash(0)
	}
	hashDur := time.Since(t1)

	if hashDur <= 0 {
		t.Fatal("Timings must be positive")
	}
}

func TestRayMeshBoundarySlabNaN(t *testing.T) {
	// Triangle [(0,0,0), (10,0,0), (0,0,10)] on XZ plane
	verts := []float32{
		0, 0, 0,
		10, 0, 0,
		0, 0, 10,
	}
	indices := []int32{0, 1, 2}
	tm, err := NewTrimesh(verts, indices, nil)
	if err != nil {
		t.Fatalf("Failed to create trimesh: %v", err)
	}

	for _, mode := range []int{BroadphaseSpatialHashMap, BroadphaseSpatialHashFlat} {
		tm.SetBroadphase(mode)

		// Boundary ray exactly on min.X boundary (X = 0, Z = 5)
		fromBoundary := mathx.Vec3{X: 0, Y: 10, Z: 5}
		toBoundary := mathx.Vec3{X: 0, Y: -10, Z: 5}
		rayBoundary := NewRay(&fromBoundary, &toBoundary)
		rayBoundary.Mode = RayModeClosest
		rayBoundary.IntersectTrimesh(tm, nil)

		if !rayBoundary.HasHit {
			t.Errorf("Mode %d: Ray at X=0, Z=5 (boundary) missed geometry", mode)
		}

		// Slightly offset ray for comparison (X = 0.00001, Z = 5)
		fromOffset := mathx.Vec3{X: 0.00001, Y: 10, Z: 5}
		toOffset := mathx.Vec3{X: 0.00001, Y: -10, Z: 5}
		rayOffset := NewRay(&fromOffset, &toOffset)
		rayOffset.Mode = RayModeClosest
		rayOffset.IntersectTrimesh(tm, nil)

		if !rayOffset.HasHit {
			t.Errorf("Mode %d: Ray at X=0.00001, Z=5 missed geometry", mode)
		}
	}
}

func TestNonAxisAlignedTiltedTriangleVoxelBounds(t *testing.T) {
	// 100 quads (size 1.0) = 200 triangles on floor
	floor := gridFloor(10, 10, 0)
	verts := make([]float32, len(floor.Vertices))
	copy(verts, floor.Vertices)
	indices := make([]int32, len(floor.Indices))
	copy(indices, floor.Indices)

	// Add a single tilted ramp triangle across 300×300×300
	baseIdx := int32(len(verts) / 3)
	verts = append(verts,
		0, 0, 0,
		300, 300, 300,
		300, 0, 300,
	)
	indices = append(indices, baseIdx, baseIdx+1, baseIdx+2)

	t0 := time.Now()
	tm, err := NewTrimesh(verts, indices, nil)
	if err != nil {
		t.Fatalf("Failed to create trimesh: %v", err)
	}
	dur := time.Since(t0)

	voxels, refs, _ := tm.SpatialHashStats()
	if voxels == 0 || refs == 0 {
		t.Fatalf("Expected non-zero spatial hash stats")
	}

	// With SAT + 2D dominant projection, the single 300x300x300 triangle should NOT explode into 400,000+ refs
	if refs > 25000 {
		t.Errorf("Voxel explosion detected: expected refs <= 25000, got %d", refs)
	}

	// Construction time must be fast (well below 100ms)
	if dur > 150*time.Millisecond {
		t.Errorf("Mesh construction too slow: took %v (expected < 150ms)", dur)
	}
}

func TestSparseSceneMemoryDensityFlatGridGuard(t *testing.T) {
	// Two platforms separated by 500 units of empty space (extremely sparse)
	verts := []float32{
		// Platform 1: at (0, 0, 0)
		0, 0, 0,
		10, 0, 0,
		10, 0, 10,
		0, 0, 10,
		// Platform 2: at (500, 500, 500)
		500, 500, 500,
		510, 500, 500,
		510, 500, 510,
		500, 500, 510,
	}
	indices := []int32{
		0, 1, 2, 0, 2, 3,
		4, 5, 6, 4, 6, 7,
	}
	tm, err := NewTrimesh(verts, indices, nil)
	if err != nil {
		t.Fatalf("Failed to create trimesh: %v", err)
	}

	_, _, flatCells := tm.SpatialHashStats()
	// Flat grid must be skipped for sparse scenes (< 10% density or > 262,144 cells)
	if flatCells != 0 {
		t.Errorf("Expected flatGrid to be skipped for sparse scene, got %d flat cells", flatCells)
	}
}

func TestTrimeshAABBQuery(t *testing.T) {
	tm := gridFloor(16, 1600, 0)
	out := make([]int, 64)
	region := mathx.NewBoundingBoxFromValues(mathx.NewVec3(410, -1, 410), mathx.NewVec3(590, 1, 590))

	n := tm.AABBQuery(region, out)
	if n == 0 {
		t.Errorf("Expected non-zero candidate triangles from AABBQuery, got %d", n)
	}
}
