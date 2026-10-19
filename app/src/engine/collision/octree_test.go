//gofront:target wasm
package collision

import (
	"testing"

	"../mathx"
)

func TestIntersectRayAABB(t *testing.T) {
	aabb := mathx.NewBoundingBoxFromValues(mathx.NewVec3(-10, -10, -10), mathx.NewVec3(10, 10, 10))
	origin := mathx.Vec3{X: 0, Y: 0, Z: -50}
	invDir := mathx.Vec3{X: float32(1e9), Y: float32(1e9), Z: 1.0}

	hit := intersectRayAABB(aabb, &origin, &invDir, 100.0)
	if !hit {
		t.Errorf("intersectRayAABB should hit AABB")
	}

	// Miss ray
	missOrigin := mathx.Vec3{X: 50, Y: 50, Z: -50}
	miss := intersectRayAABB(aabb, &missOrigin, &invDir, 100.0)
	if miss {
		t.Errorf("intersectRayAABB should miss AABB")
	}

	// Short max distance
	shortHit := intersectRayAABB(aabb, &origin, &invDir, 20.0)
	if shortHit {
		t.Errorf("intersectRayAABB with short maxDist should not reach AABB")
	}
}

func TestOctreeInsertAndQuery(t *testing.T) {
	rootAABB := mathx.NewBoundingBoxFromValues(mathx.NewVec3(-100, -100, -100), mathx.NewVec3(100, 100, 100))
	oct := newOctree(rootAABB, 4)

	elemAABB1 := mathx.NewBoundingBoxFromValues(mathx.NewVec3(10, 10, 10), mathx.NewVec3(20, 20, 20))
	elemAABB2 := mathx.NewBoundingBoxFromValues(mathx.NewVec3(-50, -50, -50), mathx.NewVec3(-40, -40, -40))

	if !oct.insert(elemAABB1, 42, 0) {
		t.Errorf("Failed to insert element 42 into octree")
	}
	if !oct.insert(elemAABB2, 99, 0) {
		t.Errorf("Failed to insert element 99 into octree")
	}

	queryBox := mathx.NewBoundingBoxFromValues(mathx.NewVec3(0, 0, 0), mathx.NewVec3(30, 30, 30))
	results := make([]int, 16)
	n := oct.aabbQuery(queryBox, results)

	if n != 1 || results[0] != 42 {
		t.Errorf("aabbQuery failed: expected 1 result [42], got %d results (first %d)", n, results[0])
	}
}

func TestOctreeStraddlingElementChildrenPreserved(t *testing.T) {
	rootAABB := mathx.NewBoundingBoxFromValues(mathx.NewVec3(-100, -100, -100), mathx.NewVec3(100, 100, 100))
	oct := newOctree(rootAABB, 4)

	// Straddling box across center (0, 0, 0)
	straddleBox := mathx.NewBoundingBoxFromValues(mathx.NewVec3(-5, -5, -5), mathx.NewVec3(5, 5, 5))
	if !oct.insert(straddleBox, 100, 0) {
		t.Fatalf("Failed to insert straddling box")
	}

	// Root should have subdivided to test children, and children should be preserved (not discarded)
	if len(oct.children) != 8 {
		t.Fatalf("Expected 8 children preserved after straddling insert, got %d", len(oct.children))
	}
	if len(oct.data) != 1 || oct.data[0] != 100 {
		t.Fatalf("Expected straddling element in root data, got count %d", len(oct.data))
	}

	// Subsequent child box should insert into existing child without re-subdividing
	childBox := mathx.NewBoundingBoxFromValues(mathx.NewVec3(10, 10, 10), mathx.NewVec3(20, 20, 20))
	if !oct.insert(childBox, 200, 0) {
		t.Fatalf("Failed to insert child box")
	}

	// Clean up empty leaves
	oct.removeEmptyNodes()

	// Query around childBox should find both or appropriate element
	queryChild := mathx.NewBoundingBoxFromValues(mathx.NewVec3(5, 5, 5), mathx.NewVec3(25, 25, 25))
	res := make([]int, 16)
	count := oct.aabbQuery(queryChild, res)
	foundChild := false
	for i := 0; i < count; i++ {
		if res[i] == 200 {
			foundChild = true
		}
	}
	if !foundChild {
		t.Errorf("Expected to find element 200, count=%d", count)
	}
}

