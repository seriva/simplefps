package game

import (
	"testing"

	"js:./interop.d.ts"
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

	sm.EnterMenu(MenuMain)
	if sm.Current != StateMenu {
		t.Errorf("Expected StateMenu, got %v", sm.Current)
	}
}

func TestStateInitAndDispose(t *testing.T) {
	sm := NewStateManager()
	sm.Init()
	sm.Dispose()
}

func TestMenuFromName(t *testing.T) {
	names := map[string]MenuID{
		"MAIN_MENU":     MenuMain,
		"SETTINGS_MENU": MenuSettings,
		"CREDITS_MENU":  MenuCredits,
		"UPDATE_MENU":   MenuUpdate,
	}
	for name, want := range names {
		if got, ok := menuFromName(name); !ok || got != want {
			t.Errorf("menuFromName(%q) = %v, %v; want %v, true", name, got, ok, want)
		}
	}
	for _, name := range []string{"", "SETINGS_MENU", "settings_menu"} {
		if got, ok := menuFromName(name); ok || got != MenuMain {
			t.Errorf("menuFromName(%q) = %v, %v; want MenuMain, false", name, got, ok)
		}
	}
}

// dispatchChangeState fires the window "changestate" CustomEvent with detail.
func dispatchChangeState(detail map[string]any) {
	window.dispatchEvent(Reflect.construct(window.CustomEvent, []any{"changestate", map[string]any{"detail": detail}}))
}

func TestChangeStateEvent(t *testing.T) {
	if window == nil || document == nil {
		return
	}
	ui, restore := useTestUI()
	defer restore()
	GlobalState.Init()
	defer GlobalState.Dispose()

	dispatchChangeState(map[string]any{"state": "menu", "menu": "SETTINGS_MENU"})
	if GlobalState.Current != StateMenu || ui.currentMenu != MenuSettings {
		t.Errorf("menu/SETTINGS_MENU: state=%v menu=%v", GlobalState.Current, ui.currentMenu)
	}
	dispatchChangeState(map[string]any{"state": "game"})
	if GlobalState.Current != StateGame {
		t.Errorf("game: state=%v", GlobalState.Current)
	}
	// No detail.menu -> main menu.
	dispatchChangeState(map[string]any{"state": "MENU"})
	if GlobalState.Current != StateMenu || ui.currentMenu != MenuMain {
		t.Errorf("menu without name: state=%v menu=%v", GlobalState.Current, ui.currentMenu)
	}
	// Unknown name -> main menu (with a console warning).
	ui.Show(MenuCredits)
	dispatchChangeState(map[string]any{"state": "menu", "menu": "SETINGS_MENU"})
	if ui.currentMenu != MenuMain {
		t.Errorf("unknown menu name: menu=%v", ui.currentMenu)
	}
}
