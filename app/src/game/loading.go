package game

// LoadingManager manages loading screen visibility and counter.
type LoadingManager struct {
	visible          *gom.Signal[bool]
	loadingCount     int
	forceUntilReload bool
	mounted          bool
}

// NewLoadingManager creates a new unmounted LoadingManager.
func NewLoadingManager() *LoadingManager {
	return &LoadingManager{
		visible:      gom.NewSignal(false),
		loadingCount: 0,
	}
}

// Mount mounts the loading styles and markup to the DOM.
func (lm *LoadingManager) Mount() {
	if document == nil || lm.mounted {
		return
	}
	gom.MountTo("body", LoadingView(lm.visible))
	lm.mounted = true
}

// Toggle increments or decrements the loading counter and updates visibility.
func (lm *LoadingManager) Toggle(visible bool) {
	if lm.forceUntilReload {
		return
	}
	if visible {
		lm.loadingCount++
	} else if lm.loadingCount > 0 {
		lm.loadingCount--
	}
	lm.visible.Set(lm.loadingCount > 0)
}

// Force keeps the loading screen visible permanently until reload.
func (lm *LoadingManager) Force() {
	lm.forceUntilReload = true
	lm.visible.Set(true)
}

// IsVisible returns whether the loading screen is currently showing.
func (lm *LoadingManager) IsVisible() bool {
	return lm.visible.Get()
}

// LoadingCount returns the active number of in-flight resource loads.
func (lm *LoadingManager) LoadingCount() int {
	return lm.loadingCount
}

// GlobalLoading is the singleton loading manager.
var GlobalLoading = NewLoadingManager()
