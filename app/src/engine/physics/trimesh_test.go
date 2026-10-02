package physics

import (
	"testing"
)

func TestTrimeshNormalsAndAABB(t *testing.T) {
	// A flat quad in the XZ plane at Y = 0 (CCW winding when viewed from +Y)
	verts := []float32{
		0, 0, 0,
		0, 0, 10,
		10, 0, 10,
		10, 0, 0,
	}
	indices := []int32{
		0, 1, 2,
		0, 2, 3,
	}

	tm := NewTrimesh(verts, indices, nil)

	if tm.AABB.Min.X != 0 || tm.AABB.Min.Y != 0 || tm.AABB.Min.Z != 0 {
		t.Errorf("Trimesh AABB min failed: got (%f, %f, %f)", tm.AABB.Min.X, tm.AABB.Min.Y, tm.AABB.Min.Z)
	}
	if tm.AABB.Max.X != 10 || tm.AABB.Max.Y != 0 || tm.AABB.Max.Z != 10 {
		t.Errorf("Trimesh AABB max failed: got (%f, %f, %f)", tm.AABB.Max.X, tm.AABB.Max.Y, tm.AABB.Max.Z)
	}

	var normal Vec3
	tm.GetNormal(0, &normal)
	// Upward normal (0, 1, 0)
	if !floatApprox(normal.X, 0) || !floatApprox(normal.Y, 1) || !floatApprox(normal.Z, 0) {
		t.Errorf("Trimesh normal failed: got (%f, %f, %f), expected (0, 1, 0)", normal.X, normal.Y, normal.Z)
	}
}

func TestTrimeshAddMeshFinalize(t *testing.T) {
	tm := NewEmptyTrimesh()

	mesh1Verts := []float32{0, 0, 0, 5, 0, 0, 5, 0, 5}
	mesh1Idx := []int32{0, 1, 2}
	tm.AddMesh(mesh1Verts, mesh1Idx, nil)

	mesh2Verts := []float32{10, 0, 0, 20, 0, 0, 20, 0, 10}
	mesh2Idx := []int32{0, 1, 2}
	tm.AddMesh(mesh2Verts, mesh2Idx, nil)

	tm.Finalize()

	if len(tm.Vertices) != 18 {
		t.Errorf("Finalize vertex count failed: expected 18 floats, got %d", len(tm.Vertices))
	}
	if len(tm.Indices) != 6 {
		t.Errorf("Finalize index count failed: expected 6 indices, got %d", len(tm.Indices))
	}
	// Second triangle indices should be offset by 3 vertices
	if tm.Indices[3] != 3 || tm.Indices[4] != 4 || tm.Indices[5] != 5 {
		t.Errorf("Finalize index offset failed: got [%d, %d, %d]", tm.Indices[3], tm.Indices[4], tm.Indices[5])
	}
}
