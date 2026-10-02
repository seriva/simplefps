package physics

import (
	"testing"
)

func TestFPSControllerInitialization(t *testing.T) {
	spawn := Vec3{X: 10, Y: 0, Z: 20}
	ctrl := NewFPSController(&spawn, nil)

	// Half height = 30, so Y should be 30
	if ctrl.Position.X != 10 || ctrl.Position.Y != 30 || ctrl.Position.Z != 20 {
		t.Errorf("Initial position failed: got (%f, %f, %f), expected (10, 30, 20)", ctrl.Position.X, ctrl.Position.Y, ctrl.Position.Z)
	}
}

func TestFPSControllerGroundMovement(t *testing.T) {
	spawn := Vec3{X: 0, Y: 0, Z: 0}
	ctrl := NewFPSController(&spawn, nil)
	ctrl.Grounded = true

	camFwd := Vec3{X: 0, Y: 0, Z: -1}
	camRight := Vec3{X: 1, Y: 0, Z: 0}

	// Move forward: move = 1, strafe = 0
	dt := float32(1.0 / 120.0) // 120 Hz
	ctrl.Move(0, 1, &camFwd, &camRight, dt)

	// Velocity.Z should be negative (forward in -Z)
	if ctrl.Velocity.Z >= 0 {
		t.Errorf("Expected negative Z velocity when moving forward, got %f", ctrl.Velocity.Z)
	}
}

func TestFPSControllerJumpAndCoyote(t *testing.T) {
	spawn := Vec3{X: 0, Y: 0, Z: 0}
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
	spawn := Vec3{X: 5, Y: 0, Z: 15}
	ctrl := NewFPSController(&spawn, nil)

	camPos := Vec3{}
	camDir := Vec3{X: 0, Y: 0, Z: -1}
	camUp := Vec3{X: 0, Y: 1, Z: 0}

	dt := float32(0.016)
	ctrl.SyncCameraWith(&camPos, &camDir, &camUp, dt)

	// Eye offset = 56 - 30 = 26. Position.Y = 30. Total expected camPos.Y = 56
	if !floatApprox(camPos.X, 5) || !floatApprox(camPos.Y, 56) || !floatApprox(camPos.Z, 15) {
		t.Errorf("Camera position sync failed: got (%f, %f, %f), expected (5, 56, 15)", camPos.X, camPos.Y, camPos.Z)
	}
}

func TestFPSControllerNoclip(t *testing.T) {
	spawn := Vec3{X: 0, Y: 0, Z: 0}
	ctrl := NewFPSController(&spawn, nil)

	SetNoclip(true)
	if !IsNoclip() {
		t.Errorf("Expected Noclip to be true")
	}

	camPos := Vec3{X: 10, Y: 20, Z: 30}
	camDir := Vec3{X: 0, Y: 0, Z: 1}
	camRight := Vec3{X: 1, Y: 0, Z: 0}
	ctrl.Camera = &CameraPose{Position: &camPos, Direction: &camDir}

	ctrl.Move(0, 1, &camDir, &camRight, 0.1)

	if camPos.Z <= 30 {
		t.Errorf("Expected Noclip move to advance camera in Z, got %f", camPos.Z)
	}

	SetNoclip(false)
}
