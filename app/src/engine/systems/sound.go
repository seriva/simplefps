package systems

import "js:./interop.d.ts"

// SoundConfig mirrors the .sfx resource file schema.
type SoundConfig struct {
	File      string
	Cached    bool
	Speed     float32
	Volume    float32
	Loop      bool
	CacheSize int
}

var (
	_audioContext     any            // lazily created AudioContext; nil without a DOM
	_audioBufferCache = map[string]any{} // file -> Promise<AudioBuffer|null>
	_audioResumeHooked bool
)

// audioContext returns the shared AudioContext, creating it on first use.
// Returns nil outside a browser or when Web Audio is unavailable.
func audioContext() any {
	if _audioContext != nil {
		return _audioContext
	}
	if window == nil {
		return nil
	}
	ctor := window.AudioContext
	if ctor == nil {
		ctor = window.webkitAudioContext
	}
	if ctor == nil {
		return nil
	}
	_audioContext = Reflect.construct(ctor, []any{})
	if !_audioResumeHooked {
		_audioResumeHooked = true
		opts := map[string]any{"once": true, "passive": true}
		window.addEventListener("pointerdown", resumeAudio, opts)
		window.addEventListener("keydown", resumeAudio, opts)
		window.addEventListener("touchstart", resumeAudio, opts)
	}
	return _audioContext
}

// resumeAudio resumes a context suspended by autoplay policy.
func resumeAudio() {
	if _audioContext != nil && _audioContext.state == "suspended" {
		_audioContext.resume()
	}
}

// loadAudioBuffer fetches and decodes a file once; concurrent callers share the promise.
func loadAudioBuffer(file string) any {
	if p, ok := _audioBufferCache[file]; ok {
		return p
	}
	p := fetchAndDecode(file)
	_audioBufferCache[file] = p
	return p
}

async func fetchAndDecode(file string) any {
	ctx := audioContext()
	if ctx == nil {
		return nil
	}
	response := await fetch(file)
	if response == nil || response.ok != true {
		console.warn("[Sound] Failed to load: " + file)
		return nil
	}
	data := await response.arrayBuffer()
	return await ctx.decodeAudioData(data)
}

// Sound manages playback of a single audio file through a per-sound gain node.
type Sound struct {
	File   string
	Cached bool
	Speed  float32
	Volume float32
	Loop   bool

	playing   bool
	startTime float64
	pausedAt  float64
	buffer    any // AudioBuffer once loaded
	gain      any // GainNode
	source    any // active AudioBufferSourceNode
}

// NewSound creates a Sound and starts loading its buffer in the background.
func NewSound(file string, volume, speed float32, loop, cached bool) *Sound {
	if volume <= 0 {
		volume = 1.0
	}
	if speed <= 0 {
		speed = 1.0
	}
	s := &Sound{
		File:   file,
		Volume: volume,
		Speed:  speed,
		Loop:   loop,
		Cached: cached,
	}
	ctx := audioContext()
	if ctx == nil {
		return s
	}
	s.gain = ctx.createGain()
	s.gain.gain.value = volume
	s.gain.connect(ctx.destination)
	loadAudioBuffer(file).then(func(buffer any) {
		s.buffer = buffer
	})
	return s
}

// NewSoundFromConfig creates a Sound from a decoded .sfx config.
func NewSoundFromConfig(cfg *SoundConfig) *Sound {
	return NewSound(cfg.File, cfg.Volume, cfg.Speed, cfg.Loop, cfg.Cached)
}

// Play starts playback from the beginning, or from the paused position when
// resume is true. Non-cached sounds stop their previous source first.
func (s *Sound) Play(resume bool) {
	s.playing = true
	ctx := audioContext()
	if ctx == nil || s.buffer == nil {
		return
	}
	resumeAudio()
	if !s.Cached && s.source != nil {
		s.source.stop()
	}
	src := ctx.createBufferSource()
	src.buffer = s.buffer
	src.playbackRate.value = s.Speed
	src.loop = s.Loop
	src.connect(s.gain)

	now := ctx.currentTime.(float64)
	if resume && s.pausedAt > 0 {
		s.startTime = now - s.pausedAt
		src.start(0, s.pausedAt)
	} else {
		s.startTime = now
		src.start(0)
	}
	src.onended = func() {
		if s.source == src {
			s.playing = false
		}
	}
	s.source = src
}

// Pause stops playback and remembers the position for Play(true).
func (s *Sound) Pause() {
	if s.Cached {
		console.warn("[Sound] Cached sound can only play.")
		return
	}
	if !s.playing {
		return
	}
	s.playing = false
	ctx := audioContext()
	if ctx == nil || s.source == nil {
		return
	}
	s.pausedAt = ctx.currentTime.(float64) - s.startTime
	s.source.stop()
}

// Stop terminates playback and resets the paused position.
func (s *Sound) Stop() {
	if s.Cached {
		console.warn("[Sound] Cached sound can only play.")
		return
	}
	s.playing = false
	s.pausedAt = 0
	if s.source != nil {
		s.source.stop()
	}
}

// IsPlaying returns true if the sound is currently active.
func (s *Sound) IsPlaying() bool {
	return s.playing
}

// PausedAt returns the playback position recorded by Pause, in seconds.
func (s *Sound) PausedAt() float64 {
	return s.pausedAt
}

// SetVolume updates the gain level.
func (s *Sound) SetVolume(volume float32) {
	s.Volume = volume
	if s.gain != nil {
		s.gain.gain.value = volume
	}
}

// SetSpeed updates the playback rate, including any source already playing.
func (s *Sound) SetSpeed(speed float32) {
	s.Speed = speed
	if s.source != nil {
		s.source.playbackRate.value = speed
	}
}
