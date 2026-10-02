package physics

import (
	"testing"
)

func TestBoundingBoxFromPoints(t *testing.T) {
	pts := []float32{
		-10, 5, 2,
		20, -15, 8,
		3, 40, -50,
	}
	bb := BoundingBoxFromPoints(pts)
	if bb.Min.X != -10 || bb.Min.Y != -15 || bb.Min.Z != -50 {
		t.Errorf("BoundingBoxFromPoints min failed: got (%f, %f, %f)", bb.Min.X, bb.Min.Y, bb.Min.Z)
	}
	if bb.Max.X != 20 || bb.Max.Y != 40 || bb.Max.Z != 8 {
		t.Errorf("BoundingBoxFromPoints max failed: got (%f, %f, %f)", bb.Max.X, bb.Max.Y, bb.Max.Z)
	}

	var center Vec3
	bb.Center(&center)
	if !floatApprox(center.X, 5) || !floatApprox(center.Y, 12.5) || !floatApprox(center.Z, -21) {
		t.Errorf("Center failed: got (%f, %f, %f)", center.X, center.Y, center.Z)
	}
}

func TestBoundingBoxOverlapsAndContains(t *testing.T) {
	b1 := NewBoundingBoxFromValues(NewVec3(0, 0, 0), NewVec3(10, 10, 10))
	b2 := NewBoundingBoxFromValues(NewVec3(5, 5, 5), NewVec3(15, 15, 15))
	b3 := NewBoundingBoxFromValues(NewVec3(20, 20, 20), NewVec3(30, 30, 30))
	bInside := NewBoundingBoxFromValues(NewVec3(2, 2, 2), NewVec3(8, 8, 8))

	if !b1.Overlaps(b2) {
		t.Errorf("b1 should overlap b2")
	}
	if b1.Overlaps(b3) {
		t.Errorf("b1 should not overlap b3")
	}
	if !b1.Contains(bInside) {
		t.Errorf("b1 should contain bInside")
	}
	if b1.Contains(b2) {
		t.Errorf("b1 should not contain b2")
	}
}

func TestBoundingBoxTransform(t *testing.T) {
	b := NewBoundingBoxFromValues(NewVec3(-1, -1, -1), NewVec3(1, 1, 1))
	m := NewMat4()
	translation := Vec3{X: 10, Y: 20, Z: 30}
	Mat4Translate(m, m, &translation)

	transformed := b.Transform(m)
	if !floatApprox(transformed.Min.X, 9) || !floatApprox(transformed.Min.Y, 19) || !floatApprox(transformed.Min.Z, 29) {
		t.Errorf("Transform min failed: got (%f, %f, %f)", transformed.Min.X, transformed.Min.Y, transformed.Min.Z)
	}
	if !floatApprox(transformed.Max.X, 11) || !floatApprox(transformed.Max.Y, 21) || !floatApprox(transformed.Max.Z, 31) {
		t.Errorf("Transform max failed: got (%f, %f, %f)", transformed.Max.X, transformed.Max.Y, transformed.Max.Z)
	}
}

func TestBoundingBoxFrustumVisibility(t *testing.T) {
	b := NewBoundingBoxFromValues(NewVec3(-5, -5, -10), NewVec3(5, 5, -5))

	// Simple frustum planes pointing inward towards -Z, 4 floats per plane.
	// Plane: nx*x + ny*y + nz*z + d >= 0 is inside
	planes := []float32{
		1, 0, 0, 100, // left
		-1, 0, 0, 100, // right
		0, 1, 0, 100, // bottom
		0, -1, 0, 100, // top
		0, 0, -1, 0, // near (z <= 0)
		0, 0, 1, 100, // far (z >= -100)
	}

	if !b.IsVisibleWithPlanes(planes) {
		t.Errorf("BoundingBox should be visible in frustum")
	}

	// Move behind near plane (e.g. z = +10 to +20)
	bBehind := NewBoundingBoxFromValues(NewVec3(-5, -5, 10), NewVec3(5, 5, 20))
	if bBehind.IsVisibleWithPlanes(planes) {
		t.Errorf("BoundingBox behind camera should not be visible")
	}
}
