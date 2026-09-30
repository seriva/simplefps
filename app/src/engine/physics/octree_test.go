package physics

import (
	"testing"
)

func TestIntersectRayAABB(t *testing.T) {
	aabb := NewBoundingBoxFromValues(NewVec3(-10, -10, -10), NewVec3(10, 10, 10))
	origin := Vec3{X: 0, Y: 0, Z: -50}
	invDir := Vec3{X: float32(1e9), Y: float32(1e9), Z: 1.0}

	hit := IntersectRayAABB(aabb, &origin, &invDir, 100.0)
	if !hit {
		t.Errorf("IntersectRayAABB should hit AABB")
	}

	// Miss ray
	missOrigin := Vec3{X: 50, Y: 50, Z: -50}
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
	rootAABB := NewBoundingBoxFromValues(NewVec3(-100, -100, -100), NewVec3(100, 100, 100))
	oct := NewOctree(rootAABB, 4)

	elemAABB1 := NewBoundingBoxFromValues(NewVec3(10, 10, 10), NewVec3(20, 20, 20))
	elemAABB2 := NewBoundingBoxFromValues(NewVec3(-50, -50, -50), NewVec3(-40, -40, -40))

	if !oct.Insert(elemAABB1, 42, 0) {
		t.Errorf("Failed to insert element 42 into octree")
	}
	if !oct.Insert(elemAABB2, 99, 0) {
		t.Errorf("Failed to insert element 99 into octree")
	}

	queryBox := NewBoundingBoxFromValues(NewVec3(0, 0, 0), NewVec3(30, 30, 30))
	results := make([]int, 16)
	n := oct.AABBQuery(queryBox, results)

	if n != 1 || results[0] != 42 {
		t.Errorf("AABBQuery failed: expected [42], got %v", results[:n])
	}
}
