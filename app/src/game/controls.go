package game

import (
	"gofront/dom"
	"strings"

	"../engine/systems"
	"js:./interop.d.ts"
)

// Controls wires DOM input events to game actions (controls.js).
type Controls struct {
	Weapons *WeaponSystem

	initialized bool

	onPointerLockChange func(e dom.Event)
	onPointerLockError  func(e dom.Event)
	onWindowFocus       func(e dom.Event)
	onClick             func(e dom.Event)
	onShoot             func(e dom.Event)
	onWheel             func(e dom.Event)
	onKeyUp             func(e dom.Event)
	onKeyDown           func(e dom.Event)
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
	c.onPointerLockChange = func(e dom.Event) {
		if document.pointerLockElement == nil && GlobalState.Current != StateMenu {
			GlobalState.EnterMenu(MenuMain)
		}
	}
	c.onPointerLockError = func(e dom.Event) {
		GlobalState.EnterGame()
	}
	c.onWindowFocus = func(e dom.Event) {
		if GlobalState.Current != StateMenu {
			GlobalState.EnterMenu(MenuMain)
		}
	}
	c.onClick = func(e dom.Event) {
		if !CanUseGameplayInput() {
			return
		}
		if e.(dom.MouseEvent).button > 0 {
			return
		}
		if systems.ActiveSettings.IsMobile {
			return // no tap-to-shoot on mobile
		}
		if e.target == nil {
			return
		}
		target := e.target.(dom.Element)
		if any(target.tagName) == nil || target.tagName == "" || strings.ToUpper(target.tagName) != "BODY" {
			return
		}
		c.Shoot()
	}
	c.onShoot = func(e dom.Event) {
		c.Shoot()
	}
	c.onWheel = func(e dom.Event) {
		c.Scroll(e.(dom.WheelEvent).deltaY)
	}
	c.onKeyUp = func(e dom.Event) {
		if e.(dom.KeyboardEvent).key == "Escape" {
			e.preventDefault()
			c.HandleEscape()
		}
	}
	c.onKeyDown = func(e dom.Event) {
		ke := e.(dom.KeyboardEvent)
		if ke.repeat {
			return
		}
		if ke.key == "`" || ke.key == "~" {
			// preventDefault stops the browser from typing "`" into the newly focused input.
			e.preventDefault()
			systems.GlobalConsole.Toggle()
			return
		}
		if ke.keyCode != systems.ActiveSettings.Jump || !CanUseGameplayInput() {
			return
		}
		e.preventDefault()
		window.dispatchEvent(Reflect.construct(any(window).(WindowEvents).Event, []any{"game:jump"}).(dom.Event))
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
