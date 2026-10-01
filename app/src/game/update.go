package game

import (
	"../engine/systems"
	"js:./interop.d.ts"
)

// UpdateManager registers the service worker and surfaces new versions
// through the UPDATE_MENU (update.js).
type UpdateManager struct {
	newServiceWorker any
	registration     any
	refreshing       bool
	initialized      bool
}

// NewUpdateManager creates an idle update manager.
func NewUpdateManager() *UpdateManager {
	return &UpdateManager{}
}

// HasUpdate reports whether a new service worker is waiting.
func (u *UpdateManager) HasUpdate() bool {
	return u.newServiceWorker != nil
}

// Init registers ./sw.js and listens for waiting/installed workers.
func (u *UpdateManager) Init() {
	if u.initialized || navigator == nil || navigator.serviceWorker == nil {
		return
	}
	u.initialized = true

	navigator.serviceWorker.register("./sw.js").then(func(reg any) {
		systems.GlobalConsole.Log("[ServiceWorker] Registered")
		u.registration = reg
		reg.update()
		if reg.waiting != nil {
			u.newServiceWorker = reg.waiting
			GlobalState.EnterMenu("UPDATE_MENU")
			return
		}
		reg.addEventListener("updatefound", func(e any) {
			systems.GlobalConsole.Log("[ServiceWorker] Service worker update found")
			u.newServiceWorker = reg.installing
			if u.newServiceWorker == nil {
				return
			}
			u.newServiceWorker.addEventListener("statechange", func(e any) {
				if u.newServiceWorker != nil && u.newServiceWorker.state == "installed" {
					GlobalState.EnterMenu("UPDATE_MENU")
				}
			})
		})
	}).catch(func(err any) {
		systems.GlobalConsole.Error("[ServiceWorker] Registration failed")
	})

	navigator.serviceWorker.addEventListener("controllerchange", func(e any) {
		if u.refreshing {
			return
		}
		u.refreshing = true
		systems.GlobalConsole.Log("[ServiceWorker] Refreshing to load new version")
		if window != nil && window.location != nil {
			window.location.reload()
		}
	})
}

// Update activates the waiting worker (the page reloads on controllerchange),
// or returns to the game when there is nothing to update.
func (u *UpdateManager) Update() {
	if u.newServiceWorker != nil {
		GlobalLoading.Force()
		u.newServiceWorker.postMessage(map[string]any{"action": "skipWaiting"})
		return
	}
	GlobalState.EnterGame()
	systems.GlobalConsole.Log("[ServiceWorker] No new service worker found to update")
}

// Force shows the update menu if a worker is waiting, otherwise re-checks.
func (u *UpdateManager) Force() {
	if u.newServiceWorker != nil {
		GlobalState.EnterMenu("UPDATE_MENU")
		return
	}
	if u.registration != nil {
		u.registration.update()
	}
}

// GlobalUpdate is the singleton update manager.
var GlobalUpdate = NewUpdateManager()
