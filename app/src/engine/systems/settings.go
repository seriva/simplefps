package systems

// EngineSettings configures graphics, audio, display, and key bindings.
type EngineSettings struct {
	IsMobile             bool    `json:"isMobile"`
	UseWebGPU            bool    `json:"useWebGPU"`
	ZNear                float32 `json:"zNear"`
	ZFar                 float32 `json:"zFar"`
	RenderScale          float32 `json:"renderScale"`
	AnisotropicFiltering int     `json:"anisotropicFiltering"`
	Gamma                float32 `json:"gamma"`
	DoFSR                bool    `json:"doFSR"`
	FsrSharpness         float32 `json:"fsrSharpness"`
	ProceduralDetail     bool    `json:"proceduralDetail"`
	EmissiveOffset       float32 `json:"emissiveOffset"`
	EmissiveMult         float32 `json:"emissiveMult"`
	EmissiveIteration    int     `json:"emissiveIteration"`
	ShowStats            bool    `json:"showStats"`
	ShadowBlurIterations int     `json:"shadowBlurIterations"`
	ShadowBlurOffset     float32 `json:"shadowBlurOffset"`
	ShadowIntensity      float32 `json:"shadowIntensity"`
	LightBlurIterations  int     `json:"lightBlurIterations"`
	DoDirt               bool    `json:"doDirt"`
	DirtIntensity        float32 `json:"dirtIntensity"`

	// Controls
	Forward         int     `json:"forward"`
	Backwards       int     `json:"backwards"`
	Left            int     `json:"left"`
	Right           int     `json:"right"`
	Jump            int     `json:"jump"`
	LookSensitivity float32 `json:"lookSensitivity"`
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

// ActiveSettings is the singleton configuration used across all engine subsystems.
var ActiveSettings = NewDefaultSettings(false)
