package systems

import (
	"testing"

	"../physics"
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

	cam := physics.NewVec3(1.4, 2.6, -3.5)
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
	s := NewStatsOverlay()
	s.Mount()
	s.SetBackendName("WebGL2")
	if s.rendererEl.textContent.(string) != "Renderer: WebGL2" {
		t.Errorf("Unexpected renderer text %q", s.rendererEl.textContent.(string))
	}
	s.Toggle(true)
	if s.items[0].className.(string) != "stats-item visible" {
		t.Errorf("Expected visible class, got %q", s.items[0].className.(string))
	}
	s.SetRenderStats(3, 1, 42)
	cam := physics.NewVec3(1.4, 2.6, -3.5)
	s.Update(0, cam)
	s.Update(1000, cam)
	if s.sceneEl.textContent.(string) != "m:3 - l:1 - t:42" {
		t.Errorf("Unexpected scene text %q", s.sceneEl.textContent.(string))
	}
	if s.posEl.textContent.(string) != "xyz:1,3,-4" {
		t.Errorf("Unexpected pos text %q", s.posEl.textContent.(string))
	}
	s.Toggle(false)
	if s.items[0].className.(string) != "stats-item" {
		t.Errorf("Expected hidden class, got %q", s.items[0].className.(string))
	}
}
