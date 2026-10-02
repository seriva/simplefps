package systems

import (
	"regexp"
)

const settingsStorageKey = "settings"

// EngineSettings configures graphics, audio, display, and key bindings.
// Field names are the localStorage JSON keys; keep them stable.
type EngineSettings struct {
	IsMobile             bool
	UseWebGPU            bool
	ZNear                float32
	ZFar                 float32
	RenderScale          float32
	AnisotropicFiltering int
	Gamma                float32
	DoFSR                bool
	FsrSharpness         float32
	ProceduralDetail     bool
	EmissiveOffset       float32
	EmissiveMult         float32
	EmissiveIteration    int
	ShowStats            bool
	ShadowBlurIterations int
	ShadowBlurOffset     float32
	ShadowIntensity      float32
	LightBlurIterations  int
	DoDirt               bool
	DirtIntensity        float32

	// Controls (keyCodes)
	Forward         int
	Backwards       int
	Left            int
	Right           int
	Jump            int
	LookSensitivity float32
}

// NewDefaultSettings creates an EngineSettings configured with default values.
func NewDefaultSettings(isMobile bool) *EngineSettings {
	renderScale := float32(1.0)
	if isMobile {
		renderScale = 0.5
	}
	return &EngineSettings{
		IsMobile:             isMobile,
		UseWebGPU:            true,
		ZNear:                0.1,
		ZFar:                 8192.0,
		RenderScale:          renderScale,
		AnisotropicFiltering: 16,
		Gamma:                1.0,
		DoFSR:                !isMobile,
		FsrSharpness:         0.2,
		ProceduralDetail:     true,
		EmissiveOffset:       1.35,
		EmissiveMult:         1.75,
		EmissiveIteration:    6,
		ShowStats:            false,
		ShadowBlurIterations: 1,
		ShadowBlurOffset:     0.3,
		ShadowIntensity:      0.5,
		LightBlurIterations:  4,
		DoDirt:               true,
		DirtIntensity:        0.25,

		Forward:         87, // 'W'
		Backwards:       83, // 'S'
		Left:            65, // 'A'
		Right:           68, // 'D'
		Jump:            32, // Space
		LookSensitivity: 0.25,
	}
}

var _mobileUA = regexp.MustCompile(`(?i)Mobi|Android`)

// DetectMobile reports whether the current browser is a mobile device.
// Returns false outside a browser (tests, SSR).
func DetectMobile() bool {
	if window == nil {
		return false
	}
	nav := window.navigator
	if nav == nil {
		return false
	}
	if nav.userAgentData != nil {
		return nav.userAgentData.mobile == true
	}
	if window.matchMedia != nil && window.matchMedia("(max-width: 768px)").matches == true {
		return true
	}
	ua, ok := nav.userAgent.(string)
	return ok && _mobileUA.MatchString(ua)
}

// storage returns window.localStorage or nil when unavailable.
func storage() any {
	if window == nil {
		return nil
	}
	return window.localStorage
}

// ApplyJSON merges a stored JSON object over the current values; unknown keys are
// ignored by consumers and missing keys keep their defaults. IsMobile is never
// taken from storage.
func (s *EngineSettings) ApplyJSON(stored string) {
	isMobile := s.IsMobile
	parsed := JSON.parse(stored)
	if parsed != nil {
		Object.assign(s, parsed)
	}
	s.IsMobile = isMobile
}

// ToJSON serialises the settings for storage.
func (s *EngineSettings) ToJSON() string {
	return JSON.stringify(s).(string)
}

// Load merges stored settings over the defaults, or persists the defaults if
// nothing is stored yet. No-op outside a browser.
func (s *EngineSettings) Load() {
	st := storage()
	if st == nil {
		return
	}
	stored, ok := st.getItem(settingsStorageKey).(string)
	if ok {
		console.log("[Settings] Using stored settings")
		s.ApplyJSON(stored)
		return
	}
	console.log("[Settings] Using default settings")
	s.Save()
}

// Save persists the settings to localStorage. No-op outside a browser.
func (s *EngineSettings) Save() {
	st := storage()
	if st == nil {
		return
	}
	st.setItem(settingsStorageKey, s.ToJSON())
}

// ActiveSettings is the singleton configuration used across all engine subsystems.
var ActiveSettings = NewDefaultSettings(DetectMobile())
