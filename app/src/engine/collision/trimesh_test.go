//gofront:target wasm
package collision

import (
	"errors"
	"testing"

	"../mathx"
)

func floatApprox(a, b float32) bool {
	diff := a - b
	if diff < 0 {
		diff = -diff
	}
	return diff < 0.001
}

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

	tm, err := NewTrimesh(verts, indices, nil)
	if err != nil {
		t.Fatalf("NewTrimesh failed: %v", err)
	}

	if tm.AABB.Min.X != 0 || tm.AABB.Min.Y != 0 || tm.AABB.Min.Z != 0 {
		t.Errorf("Trimesh AABB min failed: got (%f, %f, %f)", tm.AABB.Min.X, tm.AABB.Min.Y, tm.AABB.Min.Z)
	}
	if tm.AABB.Max.X != 10 || tm.AABB.Max.Y != 0 || tm.AABB.Max.Z != 10 {
		t.Errorf("Trimesh AABB max failed: got (%f, %f, %f)", tm.AABB.Max.X, tm.AABB.Max.Y, tm.AABB.Max.Z)
	}

	var normal mathx.Vec3
	tm.getNormal(0, &normal)
	// Upward normal (0, 1, 0)
	if !floatApprox(normal.X, 0) || !floatApprox(normal.Y, 1) || !floatApprox(normal.Z, 0) {
		t.Errorf("Trimesh normal failed: got (%f, %f, %f), expected (0, 1, 0)", normal.X, normal.Y, normal.Z)
	}
}

func TestTrimeshAddMeshFinalize(t *testing.T) {
	tm := NewEmptyTrimesh()

	mesh1Verts := []float32{0, 0, 0, 5, 0, 0, 5, 0, 5}
	mesh1Idx := []int32{0, 1, 2}
	if err := tm.AddMesh(mesh1Verts, mesh1Idx, nil); err != nil {
		t.Fatalf("AddMesh 1 failed: %v", err)
	}

	mesh2Verts := []float32{10, 0, 0, 20, 0, 0, 20, 0, 10}
	mesh2Idx := []int32{0, 1, 2}
	if err := tm.AddMesh(mesh2Verts, mesh2Idx, nil); err != nil {
		t.Fatalf("AddMesh 2 failed: %v", err)
	}

	if err := tm.Finalize(); err != nil {
		t.Fatalf("Finalize failed: %v", err)
	}

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

func TestTrimeshValidationErrors(t *testing.T) {
	// Invalid vertex slice length (not multiple of 3)
	_, err := NewTrimesh([]float32{1, 2, 3, 4}, []int32{0, 1, 2}, nil)
	if err == nil || !errors.Is(err, ErrInvalidVertices) {
		t.Errorf("Expected ErrInvalidVertices, got %v", err)
	}

	// Invalid indices slice length (not multiple of 3)
	_, err = NewTrimesh([]float32{1, 2, 3}, []int32{0, 1}, nil)
	if err == nil || !errors.Is(err, ErrInvalidIndices) {
		t.Errorf("Expected ErrInvalidIndices, got %v", err)
	}

	// Invalid flags length (mismatch with triangle count)
	_, err = NewTrimesh([]float32{1, 2, 3}, []int32{0, 1, 2}, []byte{1, 2})
	if err == nil || !errors.Is(err, ErrInvalidFlags) {
		t.Errorf("Expected ErrInvalidFlags, got %v", err)
	}

	// Index out of vertex bounds
	_, err = NewTrimesh([]float32{1, 2, 3}, []int32{0, 1, 5}, nil)
	if err == nil || !errors.Is(err, ErrIndexOutOfBounds) {
		t.Errorf("Expected ErrIndexOutOfBounds, got %v", err)
	}

	// AddMesh validation errors
	tmAdd := NewEmptyTrimesh()
	if err := tmAdd.AddMesh([]float32{1, 2, 3, 4}, []int32{0, 1, 2}, nil); !errors.Is(err, ErrInvalidVertices) {
		t.Errorf("Expected ErrInvalidVertices from AddMesh, got %v", err)
	}
	if err := tmAdd.AddMesh([]float32{1, 2, 3}, []int32{0, 1}, nil); !errors.Is(err, ErrInvalidIndices) {
		t.Errorf("Expected ErrInvalidIndices from AddMesh, got %v", err)
	}
	if err := tmAdd.AddMesh([]float32{1, 2, 3}, []int32{0, 1, 2}, []byte{1, 2}); !errors.Is(err, ErrInvalidFlags) {
		t.Errorf("Expected ErrInvalidFlags from AddMesh, got %v", err)
	}
	if err := tmAdd.AddMesh([]float32{1, 2, 3}, []int32{0, 1, 5}, nil); !errors.Is(err, ErrIndexOutOfBounds) {
		t.Errorf("Expected ErrIndexOutOfBounds from AddMesh, got %v", err)
	}
}

func TestCrossMeshIndexAliasing(t *testing.T) {
	// Probe: AddMesh(3 verts, [0,1,5]) then AddMesh(3 verts, [0,1,2])
	// AddMesh should reject the bad index directly.
	tm := NewEmptyTrimesh()
	err := tm.AddMesh([]float32{0, 0, 0, 1, 0, 0, 0, 1, 0}, []int32{0, 1, 5}, nil)
	if !errors.Is(err, ErrIndexOutOfBounds) {
		t.Fatalf("Expected ErrIndexOutOfBounds from AddMesh, got %v", err)
	}

	// Also verify Finalize checks per-mesh bounds if pending data has cross-mesh index aliasing
	tmDirect := NewEmptyTrimesh()
	tmDirect.pendingVertices = [][]float32{
		{0, 0, 0, 1, 0, 0, 0, 1, 0}, // 3 verts (indices 0..2)
		{2, 0, 0, 3, 0, 0, 2, 1, 0}, // 3 verts (indices 0..2)
	}
	// Mesh 0 references index 5 (which would land in mesh 1 if aliased). Total verts = 6.
	tmDirect.pendingIndices = []pendingIndexData{
		{data: []int32{0, 1, 5}, offset: 0},
		{data: []int32{0, 1, 2}, offset: 3},
	}
	tmDirect.pendingFlags = [][]byte{nil, nil}
	tmDirect.dirty = true
	if err := tmDirect.Finalize(); !errors.Is(err, ErrIndexOutOfBounds) {
		t.Fatalf("Expected ErrIndexOutOfBounds from Finalize cross-mesh aliasing, got %v", err)
	}
}
