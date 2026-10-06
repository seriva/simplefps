package systems

import (
	"math"
	"testing"

	"../mathx"
)

func TestCameraInit(t *testing.T) {
	cam := NewCamera()
	if cam.Position.X != 0 || cam.Position.Y != 0 || cam.Position.Z != 0 {
		t.Errorf("Expected initial position (0,0,0), got (%f, %f, %f)", cam.Position.X, cam.Position.Y, cam.Position.Z)
	}
	// Initial forward direction should be +Z (0, 0, 1)
	if math.Abs(float64(cam.Direction.X)) > 1e-4 || math.Abs(float64(cam.Direction.Y)) > 1e-4 || math.Abs(float64(cam.Direction.Z-1.0)) > 1e-4 {
		t.Errorf("Expected direction (0, 0, 1), got (%f, %f, %f)", cam.Direction.X, cam.Direction.Y, cam.Direction.Z)
	}
}

func TestCameraRotation(t *testing.T) {
	cam := NewCamera()

	// Pitch down 45 degrees
	cam.SetRotation(45.0, 0.0, 0.0)
	if math.Abs(float64(cam.Direction.Y - (-0.7071))) > 1e-3 {
		t.Errorf("Pitch 45 deg Y direction expected ~-0.7071, got %f", cam.Direction.Y)
	}

	// Yaw 90 degrees (facing right: +X)
	cam.SetRotation(0.0, 90.0, 0.0)
	if math.Abs(float64(cam.Direction.X - 1.0)) > 1e-3 {
		t.Errorf("Yaw 90 deg X direction expected ~1.0, got %f", cam.Direction.X)
	}
	if math.Abs(float64(cam.Direction.Z)) > 1e-3 {
		t.Errorf("Yaw 90 deg Z direction expected ~0.0, got %f", cam.Direction.Z)
	}

	// Pitch clamp: should not exceed 88 degrees
	cam.SetRotation(0, 0, 0)
	cam.AddRotation(100.0, 0.0)
	if cam.Rotation.X > 88.0 {
		t.Errorf("Expected pitch clamped to <= 88.0, got %f", cam.Rotation.X)
	}

	// Yaw wrap: 370 degrees wraps to 10 degrees
	cam.AddRotation(0.0, 370.0)
	if math.Abs(float64(cam.Rotation.Y-10.0)) > 1e-3 {
		t.Errorf("Expected yaw wrapped to 10.0, got %f", cam.Rotation.Y)
	}
}

func TestCameraFrustumCulling(t *testing.T) {
	cam := NewCamera()
	cam.SetProjection(60.0, 0.1, 100.0)
	cam.UpdateProjection(1.0)
	cam.SetPosition(0, 0, 0)
	cam.SetRotation(0, 0, 0) // Looking at +Z
	cam.Update()

	// Box 1: directly in front of the camera (inside frustum)
	boxIn := mathx.NewBoundingBox()
	boxIn.Min.Set(-1, -1, 5)
	boxIn.Max.Set(1, 1, 7)
	if !cam.IsBoxInFrustum(boxIn) {
		t.Error("Expected box in front of camera to be inside frustum")
	}

	// Box 2: behind the camera (-Z) (outside frustum)
	boxBehind := mathx.NewBoundingBox()
	boxBehind.Min.Set(-1, -1, -10)
	boxBehind.Max.Set(1, 1, -5)
	if cam.IsBoxInFrustum(boxBehind) {
		t.Error("Expected box behind camera to be culled from frustum")
	}

	// Box 3: far beyond the far plane (outside frustum)
	boxFar := mathx.NewBoundingBox()
	boxFar.Min.Set(-1, -1, 200)
	boxFar.Max.Set(1, 1, 205)
	if cam.IsBoxInFrustum(boxFar) {
		t.Error("Expected box past far plane to be culled from frustum")
	}
}
