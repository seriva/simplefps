package systems

import (
	"testing"
)

func TestSoundDefaults(t *testing.T) {
	snd := NewSound("sounds/shoot.wav", 0, 0, false, true)
	if snd.File != "sounds/shoot.wav" {
		t.Errorf("Expected file 'sounds/shoot.wav', got '%s'", snd.File)
	}
	if snd.Volume != 1.0 || snd.Speed != 1.0 {
		t.Errorf("Non-positive volume/speed must fall back to 1.0, got %f/%f", snd.Volume, snd.Speed)
	}
	if !snd.Cached {
		t.Error("Expected Cached = true")
	}
}

func TestSoundFromConfig(t *testing.T) {
	cfg := &SoundConfig{File: "a.wav", Volume: 0.4, Speed: 1.5, Loop: true}
	snd := NewSoundFromConfig(cfg)
	if snd.File != "a.wav" || snd.Volume != 0.4 || snd.Speed != 1.5 || !snd.Loop || snd.Cached {
		t.Errorf("Config not applied: %+v", snd)
	}
}

func TestSoundPlaybackLifecycle(t *testing.T) {
	// Headless: no AudioContext, so state transitions must still be tracked.
	snd := NewSound("sounds/step.wav", 0.8, 1.0, false, false)
	if snd.IsPlaying() {
		t.Error("Sound should not be playing before Play()")
	}

	snd.Play(false)
	if !snd.IsPlaying() {
		t.Error("Sound should be playing after Play()")
	}

	snd.Pause()
	if snd.IsPlaying() {
		t.Error("Sound should not be playing after Pause()")
	}

	snd.Play(true)
	snd.Stop()
	if snd.IsPlaying() || snd.PausedAt() != 0 {
		t.Error("Stop() must clear playing state and paused position")
	}
}

func TestCachedSoundIgnoresPauseAndStop(t *testing.T) {
	snd := NewSound("sounds/shoot.wav", 1.0, 1.0, false, true)
	snd.Play(false)
	snd.Pause()
	if !snd.IsPlaying() {
		t.Error("Pause() must be ignored for cached sounds")
	}
	snd.Stop()
	if !snd.IsPlaying() {
		t.Error("Stop() must be ignored for cached sounds")
	}
}

func TestSoundVolumeAndSpeed(t *testing.T) {
	snd := NewSound("sounds/step.wav", 1.0, 1.0, false, false)
	snd.SetVolume(0.5)
	if snd.Volume != 0.5 {
		t.Errorf("Expected volume 0.5, got %f", snd.Volume)
	}

	snd.SetSpeed(1.2)
	if snd.Speed != 1.2 {
		t.Errorf("Expected speed 1.2, got %f", snd.Speed)
	}
}
