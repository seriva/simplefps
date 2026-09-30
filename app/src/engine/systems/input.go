package systems

const maxCursorDelta float32 = 300.0

// CursorPos stores 2D movement or position offsets.
type CursorPos struct {
	X float32
	Y float32
}

// KeyEvent stores a key-triggered action callback.
type KeyEvent struct {
	Key     int
	Event   func()
	Pressed bool
}

// InputManager tracks keyboard states, pointer deltas, and input bindings.
type InputManager struct {
	pressed        map[int]bool
	downEvents     []KeyEvent
	cursorDelta    CursorPos
	cursorMovement CursorPos
	visibleCursor  bool

	// Bound DOM listeners, kept so Dispose can remove them.
	onKeyDown   any
	onKeyUp     any
	onMouseMove any
}

// NewInputManager initializes a new InputManager.
func NewInputManager() *InputManager {
	return &InputManager{
		pressed:        make(map[int]bool),
		downEvents:     make([]KeyEvent, 0),
		cursorDelta:    CursorPos{X: 0, Y: 0},
		cursorMovement: CursorPos{X: 0, Y: 0},
		visibleCursor:  true,
	}
}

// IsDown returns whether a key is currently held down.
func (im *InputManager) IsDown(keyCode int) bool {
	return im.pressed[keyCode]
}

// HandleKeyDown processes a keydown event and triggers any bound single-fire actions.
func (im *InputManager) HandleKeyDown(keyCode int) {
	im.pressed[keyCode] = true
	for i := 0; i < len(im.downEvents); i++ {
		if im.downEvents[i].Key == keyCode && !im.downEvents[i].Pressed {
			if im.downEvents[i].Event != nil {
				im.downEvents[i].Event()
			}
			im.downEvents[i].Pressed = true
		}
	}
}

// HandleKeyUp processes a keyup event.
func (im *InputManager) HandleKeyUp(keyCode int) {
	im.pressed[keyCode] = false
	for i := 0; i < len(im.downEvents); i++ {
		if im.downEvents[i].Key == keyCode && im.downEvents[i].Pressed {
			im.downEvents[i].Pressed = false
		}
	}
}

// AddCursorMovement accumulates mouse delta, clamping to prevent artifacts.
func (im *InputManager) AddCursorMovement(dx, dy float32) {
	if dx > maxCursorDelta {
		dx = maxCursorDelta
	} else if dx < -maxCursorDelta {
		dx = -maxCursorDelta
	}

	if dy > maxCursorDelta {
		dy = maxCursorDelta
	} else if dy < -maxCursorDelta {
		dy = -maxCursorDelta
	}

	im.cursorDelta.X += dx
	im.cursorDelta.Y += dy
}

// AddKeyDownEvent registers a callback triggered once when a key is pressed down.
func (im *InputManager) AddKeyDownEvent(key int, event func()) {
	im.downEvents = append(im.downEvents, KeyEvent{
		Key:     key,
		Event:   event,
		Pressed: false,
	})
}

// ClearInputEvents resets all key states and registered callbacks.
func (im *InputManager) ClearInputEvents() {
	im.pressed = make(map[int]bool)
	im.downEvents = make([]KeyEvent, 0)
}

// ResetDelta clears accumulated mouse delta.
func (im *InputManager) ResetDelta() {
	im.cursorDelta.X = 0
	im.cursorDelta.Y = 0
}

// CursorMovement returns the current frame cursor delta.
func (im *InputManager) CursorMovement() *CursorPos {
	return &im.cursorMovement
}

// Update transfers accumulated delta to the active frame movement and resets delta.
func (im *InputManager) Update() {
	im.cursorMovement.X = im.cursorDelta.X
	im.cursorMovement.Y = im.cursorDelta.Y
	im.cursorDelta.X = 0
	im.cursorDelta.Y = 0
}

// IsCursorVisible returns whether the OS cursor is visible.
func (im *InputManager) IsCursorVisible() bool {
	return im.visibleCursor
}

// SetCursorVisible sets the visible state of the cursor.
func (im *InputManager) SetCursorVisible(visible bool) {
	im.visibleCursor = visible
}

// Attach registers window keyboard/mouse listeners. No-op outside a browser or
// when already attached.
func (im *InputManager) Attach() {
	if window == nil || im.onKeyDown != nil {
		return
	}
	im.onKeyDown = func(ev any) {
		im.HandleKeyDown(ev.keyCode.(int))
	}
	im.onKeyUp = func(ev any) {
		im.HandleKeyUp(ev.keyCode.(int))
	}
	im.onMouseMove = func(ev any) {
		im.AddCursorMovement(ev.movementX.(float32), ev.movementY.(float32))
	}
	window.addEventListener("keydown", im.onKeyDown, false)
	window.addEventListener("keyup", im.onKeyUp, false)
	window.addEventListener("mousemove", im.onMouseMove, false)
}

// Dispose removes the listeners registered by Attach.
func (im *InputManager) Dispose() {
	if window == nil || im.onKeyDown == nil {
		return
	}
	window.removeEventListener("keydown", im.onKeyDown, false)
	window.removeEventListener("keyup", im.onKeyUp, false)
	window.removeEventListener("mousemove", im.onMouseMove, false)
	im.onKeyDown = nil
	im.onKeyUp = nil
	im.onMouseMove = nil
}

// ToggleCursor shows the OS cursor (releasing pointer lock) or hides it
// (requesting pointer lock on document.body). No-op on mobile or without a DOM.
func (im *InputManager) ToggleCursor(show bool) {
	if ActiveSettings.IsMobile {
		return
	}
	im.visibleCursor = show
	if document == nil {
		return
	}
	if show {
		if document.exitPointerLock != nil {
			document.exitPointerLock()
		}
	} else if document.body != nil && document.body.requestPointerLock != nil {
		document.body.requestPointerLock()
	}
}

// GlobalInput is the singleton input manager.
var GlobalInput = NewInputManager()
