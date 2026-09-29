package systems

// SoundConfig contains properties deserialized from .sfx resource files.
type SoundConfig struct {
	File      string  `json:"file"`
	Cached    bool    `json:"cached"`
	Speed     float32 `json:"speed"`
	Volume    float32 `json:"volume"`
	Loop      bool    `json:"loop"`
	CacheSize int     `json:"_cacheSize"`
}

// Sound manages audio playback, volume attenuation, and playback state.
type Sound struct {
	File      string
	Cached    bool
	Speed     float32
	Volume    float32
	Loop      bool
	Playing   bool
	StartTime float64
	PausedAt  float64
}

// NewSound creates a configured Sound instance.
func NewSound(file string, volume, speed float32, loop, cached bool) *Sound {
	if volume <= 0 {
		volume = 1.0
	}
	if speed <= 0 {
		speed = 1.0
	}
	return &Sound{
		File:      file,
		Volume:    volume,
		Speed:     speed,
		Loop:      loop,
		Cached:    cached,
		Playing:   false,
		StartTime: 0,
		PausedAt:  0,
	}
}

// Play marks the sound as active and begins playback.
func (s *Sound) Play() {
	s.Playing = true
}

// Pause suspends active sound playback.
func (s *Sound) Pause() {
	s.Playing = false
}

// Stop terminates playback and resets the playback position.
func (s *Sound) Stop() {
	s.Playing = false
	s.PausedAt = 0
}

// IsPlaying returns true if the sound is currently active.
func (s *Sound) IsPlaying() bool {
	return s.Playing
}

// SetVolume updates the sound gain level.
func (s *Sound) SetVolume(volume float32) {
	s.Volume = volume
}

// SetSpeed updates the playback rate multiplier.
func (s *Sound) SetSpeed(speed float32) {
	s.Speed = speed
}
