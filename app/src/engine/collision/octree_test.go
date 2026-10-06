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

	hit := IntersectRayAABB(aabb, &origin, &invDir, 100.0)
	if !hit {
		t.Errorf("IntersectRayAABB should hit AABB")
	}

	// Miss ray
	missOrigin := mathx.Vec3{X: 50, Y: 50, Z: -50}
	miss := IntersectRayAABB(aabb, &missOrigin, &invDir, 100.0)
	if miss {
		t.Errorf("IntersectRayAABB should miss AABB")
	}

	// Short max distance
	shortHit := IntersectRayAABB(aabb, &origin, &invDir, 20.0)
	if shortHit {
		t.Errorf("IntersectRayAABB with short maxDist should not reach AABB")
	}
}

func TestOctreeInsertAndQuery(t *testing.T) {
	rootAABB := mathx.NewBoundingBoxFromValues(mathx.NewVec3(-100, -100, -100), mathx.NewVec3(100, 100, 100))
	oct := NewOctree(rootAABB, 4)

	elemAABB1 := mathx.NewBoundingBoxFromValues(mathx.NewVec3(10, 10, 10), mathx.NewVec3(20, 20, 20))
	elemAABB2 := mathx.NewBoundingBoxFromValues(mathx.NewVec3(-50, -50, -50), mathx.NewVec3(-40, -40, -40))

	if !oct.Insert(elemAABB1, 42, 0) {
		t.Errorf("Failed to insert element 42 into octree")
	}
	if !oct.Insert(elemAABB2, 99, 0) {
		t.Errorf("Failed to insert element 99 into octree")
	}

	queryBox := mathx.NewBoundingBoxFromValues(mathx.NewVec3(0, 0, 0), mathx.NewVec3(30, 30, 30))
	results := make([]int, 16)
	n := oct.AABBQuery(queryBox, results)

	if n != 1 || results[0] != 42 {
		t.Errorf("AABBQuery failed: expected 1 result [42], got %d results (first %d)", n, results[0])
	}
}
