//gofront:target wasm
package physics

import (
	"testing"

	"../mathx"
)

func floatApprox(a, b float32) bool {
	d := a - b
	return d < 0.001 && d > -0.001
}

func TestFPSControllerInitialization(t *testing.T) {
	spawn := mathx.Vec3{X: 10, Y: 0, Z: 20}
	ctrl := NewFPSController(&spawn, nil)

	// Half height = 30, so Y should be 30
	if ctrl.Position.X != 10 || ctrl.Position.Y != 30 || ctrl.Position.Z != 20 {
		t.Errorf("Initial position failed: got (%f, %f, %f), expected (10, 30, 20)", ctrl.Position.X, ctrl.Position.Y, ctrl.Position.Z)
	}
}

func TestFPSControllerGroundMovement(t *testing.T) {
	spawn := mathx.Vec3{X: 0, Y: 0, Z: 0}
	ctrl := NewFPSController(&spawn, nil)
	ctrl.Grounded = true

	camFwd := mathx.Vec3{X: 0, Y: 0, Z: -1}
	camRight := mathx.Vec3{X: 1, Y: 0, Z: 0}

	// Move forward: move = 1, strafe = 0
	dt := float32(1.0 / 120.0) // 120 Hz
	ctrl.move(0, 1, &camFwd, &camRight, dt)

	// Velocity.Z should be negative (forward in -Z)
	if ctrl.Velocity.Z >= 0 {
		t.Errorf("Expected negative Z velocity when moving forward, got %f", ctrl.Velocity.Z)
	}
}

func TestFPSControllerJumpAndCoyote(t *testing.T) {
	spawn := mathx.Vec3{X: 0, Y: 0, Z: 0}
	jumped := false
	ctrl := NewFPSController(&spawn, &FPSControllerConfig{
		OnJump: func() {
			jumped = true
		},
	})
	ctrl.Grounded = true

	ctrl.Jump()
	if !jumped {
		t.Errorf("Expected OnJump callback to fire")
	}
	if ctrl.Velocity.Y <= 0 {
		t.Errorf("Expected positive Y velocity after jump, got %f", ctrl.Velocity.Y)
	}
	if ctrl.Grounded {
		t.Errorf("Expected controller to be ungrounded after jump")
	}
}

func TestFPSControllerCameraSync(t *testing.T) {
	spawn := mathx.Vec3{X: 5, Y: 0, Z: 15}
	ctrl := NewFPSController(&spawn, nil)

	camPos := mathx.Vec3{}
	camDir := mathx.Vec3{X: 0, Y: 0, Z: -1}
	camUp := mathx.Vec3{X: 0, Y: 1, Z: 0}

	dt := float32(0.016)
	ctrl.syncCameraWith(&camPos, &camDir, &camUp, dt)

	// Eye offset = 56 - 30 = 26. Position.Y = 30. Total expected camPos.Y = 56
	if !floatApprox(camPos.X, 5) || !floatApprox(camPos.Y, 56) || !floatApprox(camPos.Z, 15) {
		t.Errorf("Camera position sync failed: got (%f, %f, %f), expected (5, 56, 15)", camPos.X, camPos.Y, camPos.Z)
	}
}

func TestFPSControllerNoclip(t *testing.T) {
	spawn := mathx.Vec3{X: 0, Y: 0, Z: 0}
	ctrl := NewFPSController(&spawn, nil)

	setNoclip(true)
	if !isNoclip() {
		t.Errorf("Expected Noclip to be true")
	}

	camDir := mathx.Vec3{X: 0, Y: 0, Z: 1}
	camRight := mathx.Vec3{X: 1, Y: 0, Z: 0}
	ctrl.Camera.Position.Set(10, 20, 30)
	ctrl.Camera.Direction.Copy(&camDir)

	ctrl.move(0, 1, &camDir, &camRight, 0.1)

	if ctrl.Camera.Position.Z <= 30 {
		t.Errorf("Expected Noclip move to advance camera in Z, got %f", ctrl.Camera.Position.Z)
	}

	setNoclip(false)
}

func TestFPSControllerMoveWithCamera(t *testing.T) {
	ctrl := NewFPSController(&mathx.Vec3{}, nil)
	ctrl.Grounded = true
	// Looking down -Z and slightly up: only the XZ heading counts.
	ctrl.Camera.Direction.Set(0, 0.5, -1)

	ctrl.MoveWithCamera(0, 1, float32(1.0/120.0))
	if ctrl.Velocity.Z >= 0 || !floatApprox(ctrl.Velocity.X, 0) || ctrl.Velocity.Y != 0 {
		t.Errorf("forward should move along -Z only, got (%f, %f, %f)", ctrl.Velocity.X, ctrl.Velocity.Y, ctrl.Velocity.Z)
	}

	ctrl.Velocity.Zero()
	ctrl.MoveWithCamera(1, 0, float32(1.0/120.0))
	// Right of a -Z heading is +X.
	if ctrl.Velocity.X <= 0 || !floatApprox(ctrl.Velocity.Z, 0) {
		t.Errorf("strafe right should move along +X, got (%f, %f, %f)", ctrl.Velocity.X, ctrl.Velocity.Y, ctrl.Velocity.Z)
	}
}

func TestFPSControllerSyncCameraPose(t *testing.T) {
	ctrl := NewFPSController(&mathx.Vec3{X: 5, Y: 0, Z: 15}, nil)
	ctrl.Camera.Direction.Set(0, 0, -1)
	ctrl.SyncCamera(0.016)
	p := &ctrl.Camera.Position
	if !floatApprox(p.X, 5) || !floatApprox(p.Y, 56) || !floatApprox(p.Z, 15) {
		t.Errorf("SyncCamera pose = (%f, %f, %f), expected (5, 56, 15)", p.X, p.Y, p.Z)
	}
	if !floatApprox(ctrl.Camera.Up.Y, 1) {
		t.Errorf("SyncCamera up.Y = %f, expected 1 without roll", ctrl.Camera.Up.Y)
	}
}
