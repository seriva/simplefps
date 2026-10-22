//gofront:target wasm
package collision

import (
	"fmt"
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

// --- Voxel grid characterization ---------------------------------------------
//
// TestSpatialHashGridCharacterization pins the exact voxel grid newSpatialHash
// builds (every key, every triangle list in stored order, voxel/ref counts,
// flat-grid flag and voxel bounds) for a fixed set of meshes. The expected
// digests were recorded from the code before the sloc-reduction Phase 2
// refactor; any change to cell assignment, per-voxel triangle order or the
// maxVoxelsPerTri cutoff changes a digest.

type gridFixture struct {
	name     string
	verts    []float32
	idx      []int32
	cellSize float32
}

// addTri appends one triangle to the fixture.
func (f *gridFixture) addTri(ax, ay, az, bx, by, bz, cx, cy, cz float32) {
	base := int32(len(f.verts) / 3)
	f.verts = append(f.verts, ax, ay, az, bx, by, bz, cx, cy, cz)
	f.idx = append(f.idx, base, base+1, base+2)
}

// addSurface appends an n×n quad grid whose vertex (s, t) for s, t in [0, size]
// is pos(s, t), as two triangles per quad.
func (f *gridFixture) addSurface(n int, size float32, mode int) {
	step := size / float32(n)
	for ti := 0; ti < n; ti++ {
		for si := 0; si < n; si++ {
			s0, s1 := float32(si)*step, float32(si+1)*step
			t0, t1 := float32(ti)*step, float32(ti+1)*step
			ax, ay, az := surfacePos(mode, s0, t0)
			bx, by, bz := surfacePos(mode, s1, t0)
			cx, cy, cz := surfacePos(mode, s0, t1)
			dx, dy, dz := surfacePos(mode, s1, t1)
			f.addTri(ax, ay, az, cx, cy, cz, dx, dy, dz)
			f.addTri(ax, ay, az, dx, dy, dz, bx, by, bz)
		}
	}
}

// surfacePos maps surface parameters to a point on one of the fixture planes.
func surfacePos(mode int, s, t float32) (float32, float32, float32) {
	switch mode {
	case 0: // wall facing X, tilted: x solved from (y, z)
		return 3 + 0.3*s - 0.2*t, s, t
	case 1: // wall facing Z, tilted: z solved from (x, y)
		return s, t, -4 + 0.25*s + 0.15*t
	default: // floor facing Y, tilted: y solved from (x, z)
		return s, 1 + 0.2*s - 0.35*t, t
	}
}

// lcg is a deterministic float32 generator in [0, 1).
type lcg struct{ state uint32 }

func (r *lcg) next() float32 {
	r.state = r.state*1664525 + 1013904223
	return float32(r.state>>8) / float32(1<<24)
}

func gridFixtures() []*gridFixture {
	var out []*gridFixture

	floor := gridFloor(16, 1600, 0)
	out = append(out, &gridFixture{name: "floor16", verts: floor.Vertices, idx: floor.Indices, cellSize: 100})
	out = append(out, &gridFixture{name: "floor16-auto", verts: floor.Vertices, idx: floor.Indices, cellSize: 0})

	wallX := &gridFixture{name: "wallX", cellSize: 1}
	wallX.addSurface(8, 20, 0)
	out = append(out, wallX)

	wallZ := &gridFixture{name: "wallZ", cellSize: 1}
	wallZ.addSurface(8, 20, 1)
	out = append(out, wallZ)

	floorY := &gridFixture{name: "floorY", cellSize: 0.75}
	floorY.addSurface(6, 12, 2)
	out = append(out, floorY)

	// 45° planes: every dominant-axis tie (|ny| == |nz|, |nx| == |ny|,
	// |nx| == |nz|, all three equal), both windings.
	ramp := &gridFixture{name: "ramp45", cellSize: 0.5}
	ramp.addTri(0, 0, 0, 0, 6, 6, 6, 0, 0)    // y = z
	ramp.addTri(0, 0, 0, 6, 0, 0, 0, 6, 6)    // y = z, flipped
	ramp.addTri(1, 1, 0, 6, 6, 0, 1, 1, 5)    // x = y
	ramp.addTri(0, 2, 0, 5, 2, 5, 5, 7, 5)    // x = z
	ramp.addTri(6, 0, 0, 0, 6, 0, 0, 0, 6)    // x + y + z = 6
	ramp.addTri(-3, 0, 0, 0, 0, -3, 0, -3, 0) // x + y + z = -3
	out = append(out, ramp)

	// Triangles large enough to hit maxVoxelsPerTri in each dominant-axis
	// branch and in the degenerate fallback.
	huge := &gridFixture{name: "huge", cellSize: 1}
	huge.addTri(0, 0, 0, 0, 7, 160, 160, 12, 0)     // Y dominant
	huge.addTri(0, 0, 0, 9, 160, 0, 14, 0, 160)     // X dominant
	huge.addTri(0, 0, 0, 160, 0, 11, 0, 160, 6)     // Z dominant
	huge.addTri(0, 0, 0, 20, 20, 20, 40, 40, 40)    // collinear, 41³ voxels
	huge.addTri(-50, 3, -50, 50, 9, -50, 50, 3, 50) // Y dominant, overlaps the others
	out = append(out, huge)

	degen := &gridFixture{name: "degenerate", cellSize: 1}
	degen.addTri(0, 0, 0, 1, 1, 1, 2, 2, 2)       // collinear
	degen.addTri(3, 3, 3, 3, 3, 3, 3, 3, 3)       // single point
	degen.addTri(0, 0, 0, 1e-5, 0, 0, 0, 1e-5, 0) // area below the 1e-7 guard
	degen.addTri(0, 0, 0, 4, 0, 0, 0, 0, 4)       // a regular floor triangle for contrast
	out = append(out, degen)

	r := &lcg{state: 12345}
	random := &gridFixture{name: "random", cellSize: 2}
	for i := 0; i < 300; i++ {
		ox, oy, oz := r.next()*40-20, r.next()*40-20, r.next()*40-20
		random.addTri(ox, oy, oz,
			ox+r.next()*12-6, oy+r.next()*12-6, oz+r.next()*12-6,
			ox+r.next()*12-6, oy+r.next()*12-6, oz+r.next()*12-6)
	}
	out = append(out, random)
	out = append(out, &gridFixture{name: "random-auto", verts: random.verts, idx: random.idx, cellSize: 0})

	return out
}

// gridDigest folds the grid into a deterministic string: a 32-bit FNV-1a hash
// over the sorted keys (decoded to voxel coordinates), each key's list length
// and its triangle ids in stored order, plus the counters, flat-grid flag and
// voxel bounds.
func gridDigest(sh *spatialHash) string {
	keys := make([]uint64, 0, len(sh.grid))
	for k := range sh.grid {
		keys = append(keys, k)
	}
	slices.Sort(keys)

	h := uint32(2166136261)
	for _, k := range keys {
		list := sh.grid[k]
		h = fnvMix(h, uint32(int32(k&voxelMask)-voxelOffset))
		h = fnvMix(h, uint32(int32((k>>21)&voxelMask)-voxelOffset))
		h = fnvMix(h, uint32(int32((k>>42)&voxelMask)-voxelOffset))
		h = fnvMix(h, uint32(len(list)))
		for _, id := range list {
			h = fnvMix(h, uint32(id))
		}
	}
	return fmt.Sprintf("h=%08x voxels=%d refs=%d flat=%t min=(%d,%d,%d) max=(%d,%d,%d) dim=(%d,%d,%d) cell=%g",
		h, sh.voxelCount, sh.totalRefs, sh.hasFlat,
		sh.minVx, sh.minVy, sh.minVz, sh.maxVx, sh.maxVy, sh.maxVz,
		sh.dimX, sh.dimY, sh.dimZ, sh.cellSize)
}

// fnvMix folds v into h byte by byte (FNV-1a, 32-bit).
func fnvMix(h, v uint32) uint32 {
	for i := 0; i < 4; i++ {
		h ^= (v >> (uint32(i) * 8)) & 0xff
		h *= 16777619
	}
	return h
}

// gridDigestWant was recorded from feat/sloc-reduction 9d5fd6b (before Phase 2).
var gridDigestWant = map[string]string{
	"floor16":      "h=71d1ed85 voxels=289 refs=2048 flat=true min=(0,0,0) max=(16,0,16) dim=(17,1,17) cell=100",
	"floor16-auto": "h=71d1ed85 voxels=289 refs=2048 flat=true min=(0,0,0) max=(16,0,16) dim=(17,1,17) cell=100",
	"wallX":        "h=5e9a3c64 voxels=653 refs=1584 flat=true min=(-1,0,0) max=(9,20,20) dim=(11,21,21) cell=1",
	"wallZ":        "h=37b627b6 voxels=609 refs=1542 flat=true min=(0,0,-4) max=(20,20,4) dim=(21,21,9) cell=1",
	"floorY":       "h=1cb96a2b voxels=440 refs=957 flat=true min=(0,-5,0) max=(16,4,16) dim=(17,10,17) cell=0.75",
	"ramp45":       "h=efb3f1f1 voxels=667 refs=932 flat=false min=(-6,-6,-6) max=(12,14,12) dim=(19,21,19) cell=0.5",
	"huge":         "h=074edb2c voxels=19178 refs=20480 flat=false min=(-50,0,-50) max=(160,160,160) dim=(211,161,211) cell=1",
	"degenerate":   "h=66aff107 voxels=34 refs=44 flat=true min=(0,0,0) max=(4,3,4) dim=(5,4,5) cell=1",
	"random":       "h=c4118f46 voxels=3379 refs=4076 flat=true min=(-13,-13,-13) max=(12,12,12) dim=(26,26,26) cell=2",
	"random-auto":  "h=7c111e49 voxels=314 refs=1042 flat=true min=(-4,-4,-4) max=(3,3,3) dim=(8,8,8) cell=6.952363967895508",
}

func TestSpatialHashGridCharacterization(t *testing.T) {
	for _, f := range gridFixtures() {
		sh := newSpatialHash(f.verts, f.idx, nil, f.cellSize)
		got := gridDigest(sh)
		want, ok := gridDigestWant[f.name]
		if !ok {
			t.Errorf("%s: no recorded digest; got %q", f.name, got)
			continue
		}
		if got != want {
			t.Errorf("%s: grid digest changed\n got  %s\n want %s", f.name, got, want)
		}
	}
}
