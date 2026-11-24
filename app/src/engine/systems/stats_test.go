package systems

import (
	"testing"

	"../mathx"
)

func TestStatsHiddenByDefault(t *testing.T) {
	s := NewStatsOverlay()
	if s.IsVisible() {
		t.Error("Stats should start hidden")
	}
	s.SetRenderStats(5, 2, 100)
	if s.meshCount != 0 {
		t.Error("SetRenderStats must be ignored while hidden")
	}
	s.Update(1000, nil)
	s.Update(2500, nil)
	if s.FPS() != 0 {
		t.Error("Update must be ignored while hidden")
	}
}

func TestStatsFPSCounting(t *testing.T) {
	s := NewStatsOverlay()
	if !s.Toggle(true) {
		t.Error("Toggle(true) should return true")
	}
	s.SetRenderStats(5, 2, 100)
	if s.meshCount != 5 || s.lightCount != 2 || s.triCount != 100 {
		t.Error("SetRenderStats should record metrics while visible")
	}

	cam := mathx.NewVec3(1.4, 2.6, -3.5)
	// 60 frames over one second, then the flush frame.
	for i := 0; i < 60; i++ {
		s.Update(float64(i)*16.0, cam)
	}
	if s.FPS() != 0 {
		t.Error("FPS should not flush before one second has elapsed")
	}
	s.Update(1000, cam)
	if s.FPS() != 61 {
		t.Errorf("Expected 61 fps after flush, got %d", s.FPS())
	}
	if s.frames != 0 {
		t.Error("Frame counter should reset after flush")
	}

	if s.Toggle(false) {
		t.Error("Toggle(false) should return false")
	}
	if s.IsVisible() {
		t.Error("Stats should be hidden after Toggle(false)")
	}
}

func TestStatsMountDOM(t *testing.T) {
	if document == nil {
		return
	}
	document.body.innerHTML = ""
	s := NewStatsOverlay()
	s.Mount()
	basicItem := document.getElementById("stats-basic")
	sceneEl := document.getElementById("stats-scene-text")
	posEl := document.getElementById("stats-pos-text")
	if basicItem == nil || sceneEl == nil || posEl == nil {
		t.Fatal("Expected stats DOM elements after Mount")
	}
	s.Toggle(true)
	if basicItem.className != "stats-item visible" {
		t.Errorf("Expected visible class, got %q", basicItem.className)
	}
	s.SetRenderStats(3, 1, 42)
	cam := mathx.NewVec3(1.4, 2.6, -3.5)
	s.Update(0, cam)
	s.Update(1000, cam)
	if sceneEl.textContent != "m:3 - l:1 - t:42" {
		t.Errorf("Unexpected scene text %q", sceneEl.textContent)
	}
	if posEl.textContent != "xyz:1,3,-4" {
		t.Errorf("Unexpected pos text %q", posEl.textContent)
	}
	s.Toggle(false)
	if basicItem.className != "stats-item" {
		t.Errorf("Expected hidden class, got %q", basicItem.className)
	}
}
