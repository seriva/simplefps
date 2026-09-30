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

func TestSettingsJSONRoundTrip(t *testing.T) {
	src := NewDefaultSettings(false)
	src.Gamma = 1.8
	src.Forward = 38
	dst := NewDefaultSettings(false)
	dst.ApplyJSON(src.ToJSON())
	if dst.Gamma != 1.8 || dst.Forward != 38 {
		t.Errorf("Round trip lost values: Gamma=%f Forward=%d", dst.Gamma, dst.Forward)
	}
	if dst.ZFar != 8192.0 {
		t.Errorf("Untouched default changed: ZFar=%f", dst.ZFar)
	}
}

func TestSettingsApplyJSONPartialAndMobile(t *testing.T) {
	s := NewDefaultSettings(true)
	// Partial object: only overrides Gamma; stored IsMobile must be ignored.
	s.ApplyJSON(`{"Gamma": 2.2, "IsMobile": false, "Unknown": 1}`)
	if s.Gamma != 2.2 {
		t.Errorf("Expected Gamma 2.2, got %f", s.Gamma)
	}
	if !s.IsMobile {
		t.Error("IsMobile must keep the detected value, not the stored one")
	}
	if s.RenderScale != 0.5 {
		t.Errorf("Missing keys must keep defaults, RenderScale=%f", s.RenderScale)
	}
}

func TestSettingsHeadless(t *testing.T) {
	// Without a window, detection is false and Load/Save are no-ops.
	if DetectMobile() {
		t.Error("DetectMobile should be false without a window")
	}
	s := NewDefaultSettings(false)
	s.Gamma = 3
	s.Load()
	s.Save()
	if s.Gamma != 3 {
		t.Errorf("Headless Load must not change values, Gamma=%f", s.Gamma)
	}
}
