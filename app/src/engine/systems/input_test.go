package systems

import (
	"testing"
)

func TestInputKeys(t *testing.T) {
	im := NewInputManager()
	if im.IsDown(87) {
		t.Error("Key 87 should initially be up")
	}

	im.HandleKeyDown(87)
	if !im.IsDown(87) {
		t.Error("Key 87 should be down")
	}

	im.HandleKeyUp(87)
	if im.IsDown(87) {
		t.Error("Key 87 should be up after keyup")
	}
}

func TestInputKeyDownEvent(t *testing.T) {
	im := NewInputManager()
	counter := 0
	im.AddKeyDownEvent(13, func() {
		counter++
	})

	im.HandleKeyDown(13)
	if counter != 1 {
		t.Errorf("Expected counter = 1, got %d", counter)
	}

	// Repeated keydown without keyup should not trigger again
	im.HandleKeyDown(13)
	if counter != 1 {
		t.Errorf("Expected counter = 1 on repeated keydown, got %d", counter)
	}

	im.HandleKeyUp(13)
	im.HandleKeyDown(13)
	if counter != 2 {
		t.Errorf("Expected counter = 2 after keyup + keydown, got %d", counter)
	}
}

func TestInputCursorDelta(t *testing.T) {
	im := NewInputManager()
	im.AddCursorMovement(10.0, -15.0)
	im.AddCursorMovement(5.0, 5.0)

	// Movement should still be 0 before Update
	m := im.CursorMovement()
	if m.X != 0 || m.Y != 0 {
		t.Errorf("Expected movement 0 before update, got (%f, %f)", m.X, m.Y)
	}

	im.Update()
	m = im.CursorMovement()
	if m.X != 15.0 || m.Y != -10.0 {
		t.Errorf("Expected movement (15, -10), got (%f, %f)", m.X, m.Y)
	}

	// Second update should clear movement since delta was consumed
	im.Update()
	m = im.CursorMovement()
	if m.X != 0 || m.Y != 0 {
		t.Errorf("Expected movement 0 on subsequent update, got (%f, %f)", m.X, m.Y)
	}
}

func TestInputCursorDeltaClamping(t *testing.T) {
	im := NewInputManager()
	im.AddCursorMovement(500.0, -500.0) // Exceeds maxCursorDelta (300.0)
	im.Update()

	m := im.CursorMovement()
	if m.X != 300.0 || m.Y != -300.0 {
		t.Errorf("Expected clamped movement (300, -300), got (%f, %f)", m.X, m.Y)
	}
}
