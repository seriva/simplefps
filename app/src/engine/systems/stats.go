package systems

import (
	"math"
	"strconv"

	"../mathx"
	"js:./interop.d.ts"
)

func statsItemClass(visible bool) string {
	if visible {
		return "stats-item visible"
	}
	return "stats-item"
}

// StatsOverlay renders the debug FPS / scene overlay using reactive signals;
// text is written every frame while visible, with fps and memory sampled
// once per second.
type StatsOverlay struct {
	visible    *gom.Signal[bool]
	basicText  *gom.Signal[string]
	sceneText  *gom.Signal[string]
	posText    *gom.Signal[string]
	mounted    bool
	started    bool
	frames     int
	lastFPS    int
	prevTime   float64
	lastUpdate float64
	frameTime  float64
	memMB      int

	meshCount  int
	lightCount int
	triCount   int
}

// NewStatsOverlay creates a hidden stats overlay.
func NewStatsOverlay() *StatsOverlay {
	return &StatsOverlay{
		visible:   gom.NewSignal(false),
		basicText: gom.NewSignal(""),
		sceneText: gom.NewSignal(""),
		posText:   gom.NewSignal(""),
	}
}

// Mount attaches the overlay markup and styles to the document once.
func (s *StatsOverlay) Mount() {
	if document == nil || s.mounted {
		return
	}
	gom.MountTo("body", StatsView(s.visible, s.basicText, s.sceneText, s.posText))
	s.mounted = true
}

// IsVisible reports whether the overlay is shown.
func (s *StatsOverlay) IsVisible() bool {
	return s.visible.Get()
}

// Toggle shows or hides the overlay and resets counters when shown.
func (s *StatsOverlay) Toggle(show bool) bool {
	if show {
		s.frames = 0
		s.started = false
	}
	s.visible.Set(show)
	return show
}

// SetRenderStats records per-frame scene metrics; text is flushed by Update.
func (s *StatsOverlay) SetRenderStats(meshCount, lightCount, triangleCount int) {
	if !s.visible.Get() {
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
	if !s.visible.Get() {
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
	s.basicText.Set(strconv.Itoa(s.lastFPS) + "fps - " +
		strconv.Itoa(int(math.Round(s.frameTime))) + "ms - " +
		strconv.Itoa(s.memMB) + "mb")
	s.sceneText.Set("m:" + strconv.Itoa(s.meshCount) +
		" - l:" + strconv.Itoa(s.lightCount) +
		" - t:" + strconv.Itoa(s.triCount))
	if camPos != nil {
		s.posText.Set("xyz:" + strconv.Itoa(int(math.Round(float64(camPos.X)))) +
			"," + strconv.Itoa(int(math.Round(float64(camPos.Y)))) +
			"," + strconv.Itoa(int(math.Round(float64(camPos.Z)))))
	}

	if now-s.lastUpdate < 1000 {
		return
	}
	s.lastFPS = s.frames
	s.frames = 0
	s.lastUpdate = now
	if performance != nil {
		perf := any(performance).(ChromePerformance)
		if perf.memory != nil {
			s.memMB = int(math.Round(perf.memory.usedJSHeapSize / 1048576))
		}
	}
}

// GlobalStats is the singleton stats overlay.
var GlobalStats = NewStatsOverlay()
