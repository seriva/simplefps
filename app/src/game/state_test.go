package game

import (
	"testing"
)

func TestStateTransitionsAndListeners(t *testing.T) {
	sm := NewStateManager()
	if sm.Current != StateMenu {
		t.Errorf("Expected initial state StateMenu, got %v", sm.Current)
	}

	var transitions []GameState
	sm.AddListener(func(state GameState) {
		transitions = append(transitions, state)
	})

	sm.Transition(StateGame)
	if sm.Current != StateGame {
		t.Errorf("Expected state StateGame, got %v", sm.Current)
	}
	if len(transitions) != 1 || transitions[0] != StateGame {
		t.Fatalf("Expected listener to record StateGame, got %v", transitions)
	}

	// Repeated transition to current state should not invoke listeners
	sm.Transition(StateGame)
	if len(transitions) != 1 {
		t.Errorf("Repeated transition should not fire listener, count=%d", len(transitions))
	}

	sm.Pause()
	if sm.Current != StatePaused {
		t.Errorf("Expected StatePaused, got %v", sm.Current)
	}
	if len(transitions) != 2 || transitions[1] != StatePaused {
		t.Fatalf("Expected listener to record StatePaused, got %v", transitions)
	}

	sm.Resume()
	if sm.Current != StateGame {
		t.Errorf("Expected StateGame after resume, got %v", sm.Current)
	}
}

func TestStateStringRepresentation(t *testing.T) {
	if StateToString(StateMenu) != "MENU" {
		t.Errorf("Expected 'MENU', got '%s'", StateToString(StateMenu))
	}
	if StateToString(StateGame) != "GAME" {
		t.Errorf("Expected 'GAME', got '%s'", StateToString(StateGame))
	}
	if StateToString(StatePaused) != "PAUSED" {
		t.Errorf("Expected 'PAUSED', got '%s'", StateToString(StatePaused))
	}
}

func TestStateBlurAndCanvas(t *testing.T) {
	sm := NewStateManager()
	if !sm.IsBlurred() {
		t.Error("Initial blur should be true")
	}

	sm.SetBlurred(false)
	if sm.IsBlurred() {
		t.Error("Blur should be false after SetBlurred(false)")
	}
}

func TestStateEnterMenuAndGame(t *testing.T) {
	sm := NewStateManager()

	sm.EnterGame()
	if sm.Current != StateGame {
		t.Errorf("Expected StateGame, got %v", sm.Current)
	}

	sm.EnterMenu("MAIN_MENU")
	if sm.Current != StateMenu {
		t.Errorf("Expected StateMenu, got %v", sm.Current)
	}
}

func TestStateInitAndDispose(t *testing.T) {
	sm := NewStateManager()
	sm.Init()
	sm.Dispose()
}
