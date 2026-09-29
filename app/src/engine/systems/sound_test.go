package systems

import (
	"testing"
)

func TestSoundPlaybackLifecycle(t *testing.T) {
	snd := NewSound("sounds/shoot.wav", 0.8, 1.0, false, true)
	if snd.File != "sounds/shoot.wav" {
		t.Errorf("Expected file 'sounds/shoot.wav', got '%s'", snd.File)
	}
	if snd.Volume != 0.8 {
		t.Errorf("Expected volume 0.8, got %f", snd.Volume)
	}
	if snd.IsPlaying() {
		t.Error("Sound should not be playing before Play()")
	}

	snd.Play()
	if !snd.IsPlaying() {
		t.Error("Sound should be playing after Play()")
	}

	snd.Pause()
	if snd.IsPlaying() {
		t.Error("Sound should not be playing after Pause()")
	}

	snd.Play()
	snd.Stop()
	if snd.IsPlaying() {
		t.Error("Sound should not be playing after Stop()")
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
