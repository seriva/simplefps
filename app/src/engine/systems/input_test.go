package systems

import (
	"testing"

	"js:./interop.d.ts"
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

func TestInputAttachDispatch(t *testing.T) {
	im := NewInputManager()
	im.Attach()
	defer im.Dispose()
	if window == nil {
		// Headless: Attach/Dispose/ToggleCursor must be safe no-ops.
		im.ToggleCursor(false)
		if im.IsCursorVisible() {
			t.Error("ToggleCursor(false) should record hidden cursor")
		}
		return
	}
	// JSDOM (--dom): real events must flow through the registered listeners.
	down := Reflect.construct(window.KeyboardEvent, []any{"keydown", map[string]any{"keyCode": 87}})
	window.dispatchEvent(down)
	if !im.IsDown(87) {
		t.Error("keydown event should mark key 87 down")
	}
	up := Reflect.construct(window.KeyboardEvent, []any{"keyup", map[string]any{"keyCode": 87}})
	window.dispatchEvent(up)
	if im.IsDown(87) {
		t.Error("keyup event should mark key 87 up")
	}
	move := Reflect.construct(window.MouseEvent, []any{"mousemove", map[string]any{"movementX": 4, "movementY": -2}})
	window.dispatchEvent(move)
	im.Update()
	m := im.CursorMovement()
	if m.X != 4 || m.Y != -2 {
		t.Errorf("Expected movement (4, -2), got (%f, %f)", m.X, m.Y)
	}
	im.Dispose()
	window.dispatchEvent(down)
	if im.IsDown(87) {
		t.Error("Events after Dispose must be ignored")
	}
}

func TestClearInputEvents(t *testing.T) {
	im := NewInputManager()
	counter := 0
	im.AddKeyDownEvent(65, func() { counter++ })

	im.HandleKeyDown(65)
	if counter != 1 {
		t.Errorf("Expected counter = 1, got %d", counter)
	}

	// Verify key is pressed before clear
	if !im.IsDown(65) {
		t.Error("Key 65 should be down before ClearInputEvents")
	}

	im.ClearInputEvents()

	// After clear, pressed state should be reset
	if im.IsDown(65) {
		t.Error("ClearInputEvents should reset pressed state")
	}

	// HandleKeyDown should no longer trigger the old callback
	im.HandleKeyUp(65) // ensure clean state
	im.HandleKeyDown(65)
	if counter != 1 {
		t.Errorf("Expected counter = 1 after ClearInputEvents, got %d", counter)
	}
}

func TestResetDelta(t *testing.T) {
	im := NewInputManager()
	im.AddCursorMovement(10.0, 5.0)
	im.ResetDelta()
	im.Update()

	m := im.CursorMovement()
	if m.X != 0 || m.Y != 0 {
		t.Errorf("Expected (0, 0) after ResetDelta, got (%f, %f)", m.X, m.Y)
	}
}

func TestVirtualInputToggle(t *testing.T) {
	im := NewInputManager()

	// Desktop mode (default): virtual input should be a no-op.
	im.ToggleVirtualInput(true)
	if im.virtualInputEl != nil {
		t.Error("ToggleVirtualInput should be a no-op on desktop")
	}

	// Simulate mobile mode.
	origMobile := ActiveSettings.IsMobile
	ActiveSettings.IsMobile = true
	defer func() { ActiveSettings.IsMobile = origMobile }()

	// Without DOM, MountVirtualInput should be safe.
	im.MountVirtualInput()
	if document == nil && im.virtualInputEl != nil {
		t.Error("MountVirtualInput should not set virtualInputEl without DOM")
	}

	if document != nil {
		im.MountVirtualInput()
		if im.virtualInputEl == nil {
			t.Error("Expected virtualInputEl after MountVirtualInput in DOM mode")
		}

		im.ToggleVirtualInput(true)
		classes := im.virtualInputEl.className.(string)
		if classes == "" {
			t.Error("Expected visible class on virtual input element")
		}

		im.ToggleVirtualInput(false)

		// Full mobile markup must be present (styles come from app/style.css).
		for _, id := range []string{"look", "cursor", "joystick-base", "joystick-stick", "btn-shoot", "btn-jump"} {
			if document.getElementById(id) == nil {
				t.Errorf("Expected #%s in virtual input markup", id)
			}
		}
	}
}

func TestVirtualLookPad(t *testing.T) {
	im := NewInputManager()
	origSens := ActiveSettings.LookSensitivity
	ActiveSettings.LookSensitivity = 0.5
	defer func() { ActiveSettings.LookSensitivity = origSens }()

	// Moving without an active touch is ignored.
	im.MoveLook(50, 50)
	im.Update()
	if m := im.CursorMovement(); m.X != 0 || m.Y != 0 {
		t.Errorf("MoveLook without BeginLook should not move, got (%f, %f)", m.X, m.Y)
	}

	im.BeginLook(100, 100)
	im.MoveLook(110, 95)
	im.Update()
	// Delta (10, -5) * sensitivity 0.5 * mobile multiplier 2 = (10, -5).
	if m := im.CursorMovement(); m.X != 10 || m.Y != -5 {
		t.Errorf("Expected movement (10, -5), got (%f, %f)", m.X, m.Y)
	}

	im.EndLook()
	if m := im.CursorMovement(); m.X != 0 || m.Y != 0 {
		t.Error("EndLook should zero the frame movement")
	}
	im.MoveLook(200, 200)
	im.Update()
	if m := im.CursorMovement(); m.X != 0 || m.Y != 0 {
		t.Error("MoveLook after EndLook should be ignored")
	}
}

func TestVirtualJoystick(t *testing.T) {
	im := NewInputManager()
	var pos CursorPos

	if im.MoveJoystick(10, 10, &pos) {
		t.Error("MoveJoystick without BeginJoystick should return false")
	}
	if im.EndJoystick() {
		t.Error("EndJoystick without BeginJoystick should return false")
	}

	im.BeginJoystick(100, 100)

	// Inside dead zone: no keys.
	im.MoveJoystick(105, 100, &pos)
	if im.IsDown(ActiveSettings.Right) {
		t.Error("Dead zone drag must not press keys")
	}

	// Drag right beyond dead zone.
	im.MoveJoystick(140, 100, &pos)
	if !im.IsDown(ActiveSettings.Right) || im.IsDown(ActiveSettings.Left) {
		t.Error("Dragging right should press Right only")
	}
	if pos.X != 40 || pos.Y != 0 {
		t.Errorf("Expected stick offset (40, 0), got (%f, %f)", pos.X, pos.Y)
	}

	// Drag up (screen y decreases) -> forward; clamps to max radius.
	im.MoveJoystick(100, 0, &pos)
	if !im.IsDown(ActiveSettings.Forward) || im.IsDown(ActiveSettings.Right) {
		t.Error("Dragging up should press Forward only")
	}
	if pos.Y != -joystickMaxRadius {
		t.Errorf("Expected clamped offset -%f, got %f", joystickMaxRadius, pos.Y)
	}

	// Diagonal down-left -> backwards + left.
	im.MoveJoystick(70, 130, &pos)
	if !im.IsDown(ActiveSettings.Backwards) || !im.IsDown(ActiveSettings.Left) || im.IsDown(ActiveSettings.Forward) {
		t.Error("Dragging down-left should press Backwards and Left")
	}

	if !im.EndJoystick() {
		t.Error("EndJoystick should return true after an active drag")
	}
	if im.IsDown(ActiveSettings.Left) || im.IsDown(ActiveSettings.Backwards) {
		t.Error("EndJoystick should release movement keys")
	}
}
