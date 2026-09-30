package game

import (
	"js:./interop.d.ts"
)

// LoadingManager manages loading screen visibility and counter.
type LoadingManager struct {
	loadingEl        any
	loadingCount     int
	forceUntilReload bool
	mounted          bool
	visible          bool
}

// NewLoadingManager creates a new unmounted LoadingManager.
func NewLoadingManager() *LoadingManager {
	return &LoadingManager{
		loadingCount: 0,
	}
}

// Mount mounts the loading styles and markup to the DOM.
func (lm *LoadingManager) Mount() {
	if document == nil || lm.mounted {
		return
	}
	gom.MountTo("body", LoadingView())
	lm.loadingEl = document.getElementById("loading")
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
	shouldBeVisible := lm.loadingCount > 0
	lm.visible = shouldBeVisible
	if lm.loadingEl != nil {
		if shouldBeVisible {
			lm.loadingEl.classList.add("visible")
		} else {
			lm.loadingEl.classList.remove("visible")
		}
	}
}

// Force keeps the loading screen visible permanently until reload.
func (lm *LoadingManager) Force() {
	lm.forceUntilReload = true
	lm.visible = true
	if lm.loadingEl != nil {
		lm.loadingEl.classList.add("visible")
	}
}

// IsVisible returns whether the loading screen is currently showing.
func (lm *LoadingManager) IsVisible() bool {
	return lm.visible
}

// LoadingCount returns the active number of in-flight resource loads.
func (lm *LoadingManager) LoadingCount() int {
	return lm.loadingCount
}

// GlobalLoading is the singleton loading manager.
var GlobalLoading = NewLoadingManager()
