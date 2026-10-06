package systems

import (
	"math"
	"strconv"

	"../mathx"
	"js:./interop.d.ts"
)

// StatsOverlay renders the debug FPS / renderer / scene overlay using cached
// DOM references; text is written every frame, with fps and memory sampled
// once per second.
type StatsOverlay struct {
	visible    bool
	mounted    bool
	started    bool
	frames     int
	lastFPS    int
	prevTime   float64
	lastUpdate float64
	frameTime  float64
	memMB      int

	backendName string
	meshCount   int
	lightCount  int
	triCount    int

	items      []any
	rendererEl any
	basicEl    any
	sceneEl    any
	posEl      any
}

// NewStatsOverlay creates a hidden stats overlay.
func NewStatsOverlay() *StatsOverlay {
	return &StatsOverlay{backendName: "Unknown", items: make([]any, 0)}
}

// Mount attaches the overlay markup and styles to the document once.
func (s *StatsOverlay) Mount() {
	if document == nil || s.mounted {
		return
	}
	refs := map[string]any{}
	gom.MountTo("body", StatsView(), refs)
	s.items = append(s.items, refs["rendererItem"])
	s.items = append(s.items, refs["basicItem"])
	s.items = append(s.items, refs["sceneItem"])
	s.items = append(s.items, refs["posItem"])
	s.rendererEl = refs["renderer"]
	s.basicEl    = refs["basic"]
	s.sceneEl    = refs["scene"]
	s.posEl      = refs["pos"]
	s.mounted = true
	s.writeRenderer()
	s.applyVisibility()
}

// IsVisible reports whether the overlay is shown.
func (s *StatsOverlay) IsVisible() bool {
	return s.visible
}

// Toggle shows or hides the overlay and resets counters when shown.
func (s *StatsOverlay) Toggle(show bool) bool {
	if show {
		s.frames = 0
		s.started = false
	}
	s.visible = show
	s.applyVisibility()
	return show
}

func (s *StatsOverlay) applyVisibility() {
	for i := 0; i < len(s.items); i++ {
		el := s.items[i]
		if el == nil {
			continue
		}
		if s.visible {
			el.classList.add("visible")
		} else {
			el.classList.remove("visible")
		}
	}
}

// SetBackendName records the active renderer name.
func (s *StatsOverlay) SetBackendName(name string) {
	if name == "" {
		name = "Unknown"
	}
	s.backendName = name
	s.writeRenderer()
}

func (s *StatsOverlay) writeRenderer() {
	if s.rendererEl != nil {
		s.rendererEl.textContent = "Renderer: " + s.backendName
	}
}

// SetRenderStats records per-frame scene metrics; text is flushed by Update.
func (s *StatsOverlay) SetRenderStats(meshCount, lightCount, triangleCount int) {
	if !s.visible {
		return
	}
	s.meshCount = meshCount
	s.lightCount = lightCount
	s.triCount = triangleCount
}

// FPS returns the last measured frames per second.
func (s *StatsOverlay) FPS() int {
	return s.lastFPS
}

// Update counts a frame at time now (ms) and refreshes the overlay text.
// camPos may be nil.
func (s *StatsOverlay) Update(now float64, camPos *mathx.Vec3) {
	if !s.visible {
		return
	}
	if !s.started {
		s.started = true
		s.prevTime = now
		s.lastUpdate = now
	}
	s.frameTime = now - s.prevTime
	s.prevTime = now
	s.frames++

	// Everything refreshes every frame except fps and memory, which are
	// sampled once per second.
	if s.basicEl != nil {
		s.basicEl.textContent = strconv.Itoa(s.lastFPS) + "fps - " +
			strconv.Itoa(int(math.Round(s.frameTime))) + "ms - " +
			strconv.Itoa(s.memMB) + "mb"
	}
	if s.sceneEl != nil {
		s.sceneEl.textContent = "m:" + strconv.Itoa(s.meshCount) +
			" - l:" + strconv.Itoa(s.lightCount) +
			" - t:" + strconv.Itoa(s.triCount)
	}
	if s.posEl != nil && camPos != nil {
		s.posEl.textContent = "xyz:" + strconv.Itoa(int(math.Round(float64(camPos.X)))) +
			"," + strconv.Itoa(int(math.Round(float64(camPos.Y)))) +
			"," + strconv.Itoa(int(math.Round(float64(camPos.Z))))
	}

	if now-s.lastUpdate < 1000 {
		return
	}
	s.lastFPS = s.frames
	s.frames = 0
	s.lastUpdate = now
	if performance != nil && performance.memory != nil {
		s.memMB = int(math.Round(performance.memory.usedJSHeapSize.(float64) / 1048576))
	}
}

// GlobalStats is the singleton stats overlay.
var GlobalStats = NewStatsOverlay()
