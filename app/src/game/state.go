package game

import (
	"strings"

	"../engine"
	"../engine/systems"
	"js:./interop.d.ts"
)

// GameState represents the current high-level state of the game.
type GameState int

const (
	StateMenu GameState = iota
	StateGame
	StatePaused
)

// StateToString returns the string name for a GameState.
func StateToString(s GameState) string {
	switch s {
	case StateMenu:
		return "MENU"
	case StateGame:
		return "GAME"
	case StatePaused:
		return "PAUSED"
	default:
		return "UNKNOWN"
	}
}

// StateListener is a callback function invoked on state transitions.
type StateListener func(GameState)

// StateManager orchestrates game state transitions and system notifications.
type StateManager struct {
	Current   GameState
	isBlurred bool
	listeners []StateListener
	canvasEl  any

	CanPause      func() bool
	onChangeState any
	initialized   bool
}

// NewStateManager creates a new StateManager defaulting to StateMenu.
func NewStateManager() *StateManager {
	return &StateManager{
		Current:   StateMenu,
		isBlurred: true,
		listeners: make([]StateListener, 0),
	}
}

// AddListener registers a callback invoked on each state change.
func (s *StateManager) AddListener(fn StateListener) {
	s.listeners = append(s.listeners, fn)
}

// Transition changes the current game state and invokes all listeners.
func (s *StateManager) Transition(next GameState) {
	if s.Current != next {
		s.Current = next
		isGame := next == StateGame

		// Orchestrate systems
		systems.GlobalInput.ToggleCursor(!isGame)
		systems.GlobalInput.ToggleVirtualInput(isGame)
		s.SetBlurred(!isGame)

		if isGame {
			engine.Pause(false)
		} else if s.CanPause == nil || s.CanPause() {
			engine.Pause(true)
		}

		if GlobalHUD != nil {
			GlobalHUD.Toggle(isGame)
		}

		for i := 0; i < len(s.listeners); i++ {
			s.listeners[i](next)
		}
	}
}

// EnterMenu transitions to StateMenu and requests the menu overlay to show.
func (s *StateManager) EnterMenu(menu string) {
	s.Transition(StateMenu)
	if GlobalUI != nil {
		GlobalUI.Show(menu)
	}
}

// EnterGame transitions to StateGame and hides menu overlays.
func (s *StateManager) EnterGame() {
	s.Transition(StateGame)
	if GlobalUI != nil {
		GlobalUI.Hide()
	}
}

// Pause transitions to StatePaused.
func (s *StateManager) Pause() {
	s.Transition(StatePaused)
}

// Resume transitions back to StateGame.
func (s *StateManager) Resume() {
	s.Transition(StateGame)
}

// IsBlurred returns whether the rendering canvas is currently blurred.
func (s *StateManager) IsBlurred() bool {
	return s.isBlurred
}

// SetBlurred sets the canvas blur state and updates canvas style if available.
func (s *StateManager) SetBlurred(blurred bool) {
	s.isBlurred = blurred
	canvas := s.getCanvas()
	if canvas != nil {
		if blurred {
			canvas.style.filter = "blur(8px)"
		} else {
			canvas.style.filter = "blur(0px)"
		}
	}
}

func (s *StateManager) getCanvas() any {
	if s.canvasEl == nil && document != nil {
		s.canvasEl = document.querySelector("canvas")
		if s.canvasEl != nil {
			s.canvasEl.style.transition = "filter 25ms linear"
			if s.isBlurred {
				s.canvasEl.style.filter = "blur(8px)"
			} else {
				s.canvasEl.style.filter = "blur(0px)"
			}
		}
	}
	return s.canvasEl
}

// Init registers the window changestate event listener.
func (s *StateManager) Init() {
	if window == nil || s.initialized {
		return
	}
	s.onChangeState = func(e any) {
		if e == nil || e.detail == nil {
			return
		}
		stateStr := strings.ToUpper(e.detail.state.(string))
		if stateStr == "MENU" {
			menu := "MAIN_MENU"
			if e.detail.menu != nil {
				menu = e.detail.menu.(string)
			}
			s.EnterMenu(menu)
		} else if stateStr == "GAME" {
			s.EnterGame()
		}
	}
	window.addEventListener("changestate", s.onChangeState, false)
	s.initialized = true
}

// Dispose removes the window changestate listener.
func (s *StateManager) Dispose() {
	if window == nil || !s.initialized {
		return
	}
	window.removeEventListener("changestate", s.onChangeState, false)
	s.onChangeState = nil
	s.initialized = false
}

// GlobalState is the singleton state manager.
var GlobalState = NewStateManager()
