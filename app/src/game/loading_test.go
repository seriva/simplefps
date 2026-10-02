package game

import (
	"testing"

	"js:./interop.d.ts"
)

func TestLoadingToggle(t *testing.T) {
	lm := NewLoadingManager()
	if lm.IsVisible() {
		t.Error("Loading should initially be hidden")
	}

	lm.Toggle(true)
	if !lm.IsVisible() {
		t.Error("Loading should be visible after Toggle(true)")
	}
	if lm.LoadingCount() != 1 {
		t.Errorf("Expected loading count 1, got %d", lm.LoadingCount())
	}

	lm.Toggle(true)
	if lm.LoadingCount() != 2 {
		t.Errorf("Expected loading count 2, got %d", lm.LoadingCount())
	}

	lm.Toggle(false)
	if !lm.IsVisible() {
		t.Error("Loading should still be visible with count=1")
	}

	lm.Toggle(false)
	if lm.IsVisible() {
		t.Error("Loading should be hidden when count reaches 0")
	}
}

func TestLoadingMountAndForce(t *testing.T) {
	lm := NewLoadingManager()
	lm.Mount()

	if document != nil {
		el := document.getElementById("loading")
		if el == nil {
			t.Error("Expected #loading in DOM after Mount")
		}
	}

	lm.Force()
	if !lm.IsVisible() {
		t.Error("Loading should be visible after Force")
	}

	// Toggle(false) should not hide if forced
	lm.Toggle(false)
	if !lm.IsVisible() {
		t.Error("Loading should remain visible after Force even with Toggle(false)")
	}
}
