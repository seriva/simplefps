package systems

import (
	"math"
	"strconv"

	"js:./interop.d.ts"
)

const (
	maxCursorDelta    float32 = 300.0
	joystickMaxRadius float32 = 50.0
	joystickDeadZone  float32 = 15.0
)

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

	virtualInputEl any
	lookEl         any
	cursorEl       any
	stickEl        any
	btnShootEl     any
	btnJumpEl      any

	// Touch state for the virtual look pad and joystick.
	lookActive bool
	lookLast   CursorPos
	dragActive bool
	dragStart  CursorPos
	stickPos   CursorPos
	touch      CursorPos
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

// BeginLook starts a look-pad touch at the given screen position.
func (im *InputManager) BeginLook(x, y float32) {
	im.lookActive = true
	im.lookLast.X = x
	im.lookLast.Y = y
}

// MoveLook accumulates cursor movement from a look-pad drag. Mobile uses a
// higher sensitivity multiplier for a responsive feel.
func (im *InputManager) MoveLook(x, y float32) {
	if !im.lookActive {
		return
	}
	sens := ActiveSettings.LookSensitivity * 2
	im.AddCursorMovement((x-im.lookLast.X)*sens, (y-im.lookLast.Y)*sens)
	im.lookLast.X = x
	im.lookLast.Y = y
}

// EndLook stops the look-pad touch and zeroes the current frame movement.
func (im *InputManager) EndLook() {
	im.lookActive = false
	im.cursorMovement.X = 0
	im.cursorMovement.Y = 0
}

// BeginJoystick starts a joystick drag at the given screen position.
func (im *InputManager) BeginJoystick(x, y float32) {
	im.dragActive = true
	im.dragStart.X = x
	im.dragStart.Y = y
}

func (im *InputManager) clearMovementKeys() {
	im.pressed[ActiveSettings.Forward] = false
	im.pressed[ActiveSettings.Backwards] = false
	im.pressed[ActiveSettings.Left] = false
	im.pressed[ActiveSettings.Right] = false
}

// MoveJoystick maps the drag offset from the joystick origin onto the movement
// keys and writes the clamped stick offset into pos. Returns false if no drag
// is active.
func (im *InputManager) MoveJoystick(x, y float32, pos *CursorPos) bool {
	if !im.dragActive {
		return false
	}
	xDiff := float64(x - im.dragStart.X)
	yDiff := float64(y - im.dragStart.Y)
	angle := math.Atan2(yDiff, xDiff)
	distance := float32(math.Hypot(xDiff, yDiff))
	if distance > joystickMaxRadius {
		distance = joystickMaxRadius
	}
	pos.X = distance * float32(math.Cos(angle))
	pos.Y = distance * float32(math.Sin(angle))

	deg := float32(angle * (180.0 / math.Pi))
	if deg < 0 {
		deg += 360
	}

	im.clearMovementKeys()
	if distance > joystickDeadZone {
		switch {
		case deg >= 337.5 || deg < 22.5:
			im.pressed[ActiveSettings.Right] = true
		case deg < 67.5:
			im.pressed[ActiveSettings.Right] = true
			im.pressed[ActiveSettings.Backwards] = true
		case deg < 112.5:
			im.pressed[ActiveSettings.Backwards] = true
		case deg < 157.5:
			im.pressed[ActiveSettings.Backwards] = true
			im.pressed[ActiveSettings.Left] = true
		case deg < 202.5:
			im.pressed[ActiveSettings.Left] = true
		case deg < 247.5:
			im.pressed[ActiveSettings.Left] = true
			im.pressed[ActiveSettings.Forward] = true
		case deg < 292.5:
			im.pressed[ActiveSettings.Forward] = true
		default:
			im.pressed[ActiveSettings.Forward] = true
			im.pressed[ActiveSettings.Right] = true
		}
	}
	return true
}

// EndJoystick releases the joystick and all movement keys. Returns false if no
// drag was active.
func (im *InputManager) EndJoystick() bool {
	if !im.dragActive {
		return false
	}
	im.dragActive = false
	im.clearMovementKeys()
	return true
}

// readTouch stores the primary touch (or pointer) position of ev in im.touch.
func (im *InputManager) readTouch(ev any) {
	tl := ev.targetTouches
	if tl != nil && tl.length.(int) > 0 {
		t := tl.item(0)
		im.touch.X = t.clientX.(float32)
		im.touch.Y = t.clientY.(float32)
		return
	}
	im.touch.X = ev.clientX.(float32)
	im.touch.Y = ev.clientY.(float32)
}

func (im *InputManager) setTranslate(el any, x, y float32) {
	if el != nil {
		el.style.transform = "translate3d(" + formatPx(x) + ", " + formatPx(y) + ", 0px)"
	}
}

func formatPx(v float32) string {
	return strconv.FormatFloat(float64(v), 'f', 2, 32) + "px"
}

func (im *InputManager) bindActionButton(el any, eventName string) {
	if el == nil {
		return
	}
	release := func() {
		el.classList.remove("pressed")
	}
	el.addEventListener("touchstart", func(ev any) {
		ev.preventDefault()
		ev.stopPropagation()
		el.classList.add("pressed")
		window.dispatchEvent(Reflect.construct(window.Event, []any{eventName}))
	}, map[string]any{"passive": false})
	el.addEventListener("touchend", release, false)
	el.addEventListener("touchcancel", release, false)
}

// MountVirtualInput mounts mobile touch controls if running on mobile.
func (im *InputManager) MountVirtualInput() {
	if document == nil || !ActiveSettings.IsMobile || im.virtualInputEl != nil {
		return
	}
	gom.MountTo("body", VirtualInputView())
	im.virtualInputEl = document.getElementById("input")
	im.lookEl = document.getElementById("look")
	im.cursorEl = document.getElementById("cursor")
	im.stickEl = document.getElementById("joystick-stick")
	im.btnShootEl = document.getElementById("btn-shoot")
	im.btnJumpEl = document.getElementById("btn-jump")

	if im.lookEl != nil {
		im.lookEl.addEventListener("touchstart", func(ev any) {
			im.readTouch(ev)
			im.BeginLook(im.touch.X, im.touch.Y)
			im.moveCursorEl()
			if im.cursorEl != nil {
				im.cursorEl.style.opacity = "0.35"
			}
		}, map[string]any{"passive": true})
		im.lookEl.addEventListener("touchend", func() {
			im.EndLook()
			if im.cursorEl != nil {
				im.cursorEl.style.opacity = "0"
			}
		}, map[string]any{"passive": true})
		im.lookEl.addEventListener("touchmove", func(ev any) {
			ev.preventDefault()
			im.readTouch(ev)
			im.MoveLook(im.touch.X, im.touch.Y)
			im.moveCursorEl()
		}, map[string]any{"passive": false})
	}

	if im.stickEl != nil {
		im.stickEl.addEventListener("touchstart", func(ev any) {
			im.stickEl.classList.add("dragging")
			im.readTouch(ev)
			im.BeginJoystick(im.touch.X, im.touch.Y)
		}, false)
		im.stickEl.addEventListener("touchend", func() {
			if im.EndJoystick() {
				im.stickEl.classList.remove("dragging")
				im.setTranslate(im.stickEl, 0, 0)
			}
		}, false)
		im.stickEl.addEventListener("touchmove", func(ev any) {
			ev.preventDefault()
			im.readTouch(ev)
			if im.MoveJoystick(im.touch.X, im.touch.Y, &im.stickPos) {
				im.setTranslate(im.stickEl, im.stickPos.X, im.stickPos.Y)
			}
		}, map[string]any{"passive": false})
	}

	im.bindActionButton(im.btnShootEl, "game:shoot")
	im.bindActionButton(im.btnJumpEl, "game:jump")
}

// moveCursorEl positions the look cursor under the active touch.
func (im *InputManager) moveCursorEl() {
	if !im.lookActive || im.cursorEl == nil || window == nil {
		return
	}
	im.setTranslate(im.cursorEl, im.lookLast.X, im.lookLast.Y-window.innerHeight.(float32))
}

// ToggleVirtualInput toggles the visibility of the mobile virtual joystick controls.
func (im *InputManager) ToggleVirtualInput(show bool) {
	if !ActiveSettings.IsMobile {
		return
	}
	if im.virtualInputEl == nil {
		im.MountVirtualInput()
	}
	if im.virtualInputEl != nil {
		if show {
			im.virtualInputEl.classList.add("visible")
		} else {
			im.virtualInputEl.classList.remove("visible")
		}
	}
}

// GlobalInput is the singleton input manager.
var GlobalInput = NewInputManager()
