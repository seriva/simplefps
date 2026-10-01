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

	onPointerLockChange any
	onPointerLockError  any
	onWindowFocus       any
	onClick             any
	onShoot             any
	onWheel             any
	onKeyUp             any
	onKeyDown           any
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
		GlobalState.EnterMenu("MAIN_MENU")
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
	c.onPointerLockChange = func(e any) {
		if document.pointerLockElement == nil && GlobalState.Current != StateMenu {
			GlobalState.EnterMenu("MAIN_MENU")
		}
	}
	c.onPointerLockError = func(e any) {
		GlobalState.EnterGame()
	}
	c.onWindowFocus = func(e any) {
		if GlobalState.Current != StateMenu {
			GlobalState.EnterMenu("MAIN_MENU")
		}
	}
	c.onClick = func(e any) {
		if !CanUseGameplayInput() {
			return
		}
		if e.button.(float64) > 0 {
			return
		}
		if systems.ActiveSettings.IsMobile {
			return // no tap-to-shoot on mobile
		}
		if e.target == nil || e.target.tagName == nil || strings.ToUpper(e.target.tagName.(string)) != "BODY" {
			return
		}
		c.Shoot()
	}
	c.onShoot = func(e any) {
		c.Shoot()
	}
	c.onWheel = func(e any) {
		c.Scroll(e.deltaY.(float64))
	}
	c.onKeyUp = func(e any) {
		if e.key == "Escape" {
			e.preventDefault()
			c.HandleEscape()
		}
	}
	c.onKeyDown = func(e any) {
		if int(e.keyCode.(float64)) != systems.ActiveSettings.Jump || !CanUseGameplayInput() {
			return
		}
		if e.repeat == true {
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

	systems.GlobalInput.AddKeyDownEvent(192, func() { systems.GlobalConsole.Toggle() })
	systems.GlobalInput.AddKeyDownEvent(13, func() { systems.GlobalConsole.Execute() })
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
