package game

import (
	"testing"
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

func TestLoadingReactiveClass(t *testing.T) {
	if document == nil {
		return
	}
	resetDOM()
	lm := NewLoadingManager()
	lm.Mount()
	el := document.getElementById("loading")
	if el == nil {
		t.Fatal("LoadingManager #loading element missing after Mount")
	}
	if el.classList.contains("visible") {
		t.Error("#loading should start without visible class")
	}
	lm.Toggle(true)
	if !el.classList.contains("visible") {
		t.Error("#loading should gain visible class on Toggle(true)")
	}
	lm.Toggle(false)
	if el.classList.contains("visible") {
		t.Error("#loading should drop visible class on Toggle(false)")
	}
	lm.Force()
	if !el.classList.contains("visible") {
		t.Error("#loading should gain visible class on Force()")
	}
}
