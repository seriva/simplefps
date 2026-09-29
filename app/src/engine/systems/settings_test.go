package systems

import (
	"testing"
)

func TestDefaultSettingsDesktop(t *testing.T) {
	s := NewDefaultSettings(false)
	if s.IsMobile {
		t.Error("Expected IsMobile = false")
	}
	if s.RenderScale != 1.0 {
		t.Errorf("Expected desktop RenderScale = 1.0, got %f", s.RenderScale)
	}
	if !s.DoFSR {
		t.Error("Expected desktop DoFSR = true")
	}
	if s.Forward != 87 {
		t.Errorf("Expected Forward = 87 (W), got %d", s.Forward)
	}
}

func TestDefaultSettingsMobile(t *testing.T) {
	s := NewDefaultSettings(true)
	if !s.IsMobile {
		t.Error("Expected IsMobile = true")
	}
	if s.RenderScale != 0.5 {
		t.Errorf("Expected mobile RenderScale = 0.5, got %f", s.RenderScale)
	}
	if s.DoFSR {
		t.Error("Expected mobile DoFSR = false")
	}
}
