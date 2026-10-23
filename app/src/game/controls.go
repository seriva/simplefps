package game

import (
	"strings"

	"../engine/systems"
	"js:./interop.d.ts"
)

// Controls wires DOM input events to game actions (controls.js).
type Controls struct {
	Weapons *WeaponSystem

	initialized bool

	onPointerLockChange func(e UIEvent)
	onPointerLockError  func(e UIEvent)
	onWindowFocus       func(e UIEvent)
	onClick             func(e UIEvent)
	onShoot             func(e UIEvent)
	onWheel             func(e UIEvent)
	onKeyUp             func(e UIEvent)
	onKeyDown           func(e UIEvent)
}

// NewControls creates controls driving weapons.
func NewControls(weapons *WeaponSystem) *Controls {
	return &Controls{Weapons: weapons}
}

// CanUseGameplayInput reports whether gameplay input is accepted.
func CanUseGameplayInput() bool {
	return GlobalState.Current == StateGame && !systems.GlobalConsole.IsVisible()
}

// HandleEscape toggles between the main menu and the game.
func (c *Controls) HandleEscape() {
	if systems.GlobalConsole.IsVisible() {
		return
	}
	if GlobalState.Current == StateGame {
		GlobalState.EnterMenu(MenuMain)
	} else if GlobalState.Current == StateMenu {
		GlobalState.EnterGame()
	}
}

// Shoot fires the current weapon when gameplay input is allowed.
func (c *Controls) Shoot() {
	if !CanUseGameplayInput() || c.Weapons == nil {
		return
	}
	c.Weapons.Shoot()
}

// Scroll cycles weapons; negative deltaY selects the previous weapon.
func (c *Controls) Scroll(deltaY float64) {
	if !CanUseGameplayInput() || c.Weapons == nil {
		return
	}
	if deltaY < 0 {
		c.Weapons.SelectPrevious()
	} else {
		c.Weapons.SelectNext()
	}
}

// Init registers the DOM listeners.
func (c *Controls) Init() {
	if window == nil || document == nil || c.initialized {
		return
	}
	c.onPointerLockChange = func(e UIEvent) {
		if document.pointerLockElement == nil && GlobalState.Current != StateMenu {
			GlobalState.EnterMenu(MenuMain)
		}
	}
	c.onPointerLockError = func(e UIEvent) {
		GlobalState.EnterGame()
	}
	c.onWindowFocus = func(e UIEvent) {
		if GlobalState.Current != StateMenu {
			GlobalState.EnterMenu(MenuMain)
		}
	}
	c.onClick = func(e UIEvent) {
		if !CanUseGameplayInput() {
			return
		}
		if e.button > 0 {
			return
		}
		if systems.ActiveSettings.IsMobile {
			return // no tap-to-shoot on mobile
		}
		if e.target == nil || e.target.tagName == nil || strings.ToUpper(e.target.tagName) != "BODY" {
			return
		}
		c.Shoot()
	}
	c.onShoot = func(e UIEvent) {
		c.Shoot()
	}
	c.onWheel = func(e UIEvent) {
		c.Scroll(e.deltaY)
	}
	c.onKeyUp = func(e UIEvent) {
		if e.key == "Escape" {
			e.preventDefault()
			c.HandleEscape()
		}
	}
	c.onKeyDown = func(e UIEvent) {
		if e.repeat {
			return
		}
		if e.key == "`" || e.key == "~" {
			// preventDefault stops the browser from typing "`" into the newly focused input.
			e.preventDefault()
			systems.GlobalConsole.Toggle()
			return
		}
		if int(e.keyCode) != systems.ActiveSettings.Jump || !CanUseGameplayInput() {
			return
		}
		e.preventDefault()
		window.dispatchEvent(Reflect.construct(globalThis.Event, []any{"game:jump"}))
	}

	document.addEventListener("pointerlockchange", c.onPointerLockChange, false)
	document.addEventListener("pointerlockerror", c.onPointerLockError)
	window.addEventListener("focus", c.onWindowFocus, false)
	window.addEventListener("click", c.onClick)
	window.addEventListener("game:shoot", c.onShoot)
	window.addEventListener("wheel", c.onWheel)
	window.addEventListener("keyup", c.onKeyUp)
	window.addEventListener("keydown", c.onKeyDown)

	c.initialized = true
}

// Dispose removes the DOM listeners.
func (c *Controls) Dispose() {
	if !c.initialized {
		return
	}
	document.removeEventListener("pointerlockchange", c.onPointerLockChange, false)
	document.removeEventListener("pointerlockerror", c.onPointerLockError)
	window.removeEventListener("focus", c.onWindowFocus, false)
	window.removeEventListener("click", c.onClick)
	window.removeEventListener("game:shoot", c.onShoot)
	window.removeEventListener("wheel", c.onWheel)
	window.removeEventListener("keyup", c.onKeyUp)
	window.removeEventListener("keydown", c.onKeyDown)
	c.initialized = false
}
