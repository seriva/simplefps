package game

import (
	"strconv"

	"js:./interop.d.ts"
)

// HUD represents the cached direct DOM in-game heads-up display.
type HUD struct {
	hudEl      any
	healthEl   any
	armorEl    any
	ammoEl     any
	healthIcon any
	armorIcon  any
	ammoIcon   any
	menuBtn    any

	lastHP    int
	lastArmor int
	lastAmmo  int
	visible   bool
	mounted   bool
}

// NewHUD creates an unmounted HUD instance.
func NewHUD() *HUD {
	return &HUD{
		lastHP:    -1,
		lastArmor: -1,
		lastAmmo:  -1,
		visible:   false,
	}
}

// Mount mounts the HUD styles and DOM elements and caches element references.
func (h *HUD) Mount(isMobile bool) {
	if document == nil || h.mounted {
		return
	}
	gom.MountTo("head", HUDStyles())
	gom.MountTo("body", HUDView(isMobile))

	h.hudEl = document.getElementById("hud")
	h.healthEl = document.getElementById("hud-health-val")
	h.armorEl = document.getElementById("hud-armor-val")
	h.ammoEl = document.getElementById("hud-ammo-val")
	h.healthIcon = document.getElementById("hud-health-icon")
	h.armorIcon = document.getElementById("hud-armor-icon")
	h.ammoIcon = document.getElementById("hud-ammo-icon")

	if isMobile {
		h.menuBtn = document.getElementById("button-menu")
		if h.menuBtn != nil {
			h.menuBtn.addEventListener("touchend", func() {
				GlobalState.EnterMenu("MAIN_MENU")
			}, false)
		}
	}
	h.mounted = true
}

// Update performs high-frequency updates on player stats with 0 allocations when values are unchanged.
func (h *HUD) Update(hp, armor, ammo int) {
	if hp != h.lastHP {
		if h.healthEl != nil {
			h.healthEl.textContent = strconv.Itoa(hp)
		}
		if hp > h.lastHP && h.lastHP != -1 {
			h.animateIcon(h.healthIcon)
		}
		h.lastHP = hp
	}
	if armor != h.lastArmor {
		if h.armorEl != nil {
			h.armorEl.textContent = strconv.Itoa(armor)
		}
		if armor > h.lastArmor && h.lastArmor != -1 {
			h.animateIcon(h.armorIcon)
		}
		h.lastArmor = armor
	}
	if ammo != h.lastAmmo {
		if h.ammoEl != nil {
			h.ammoEl.textContent = strconv.Itoa(ammo)
		}
		if ammo > h.lastAmmo && h.lastAmmo != -1 {
			h.animateIcon(h.ammoIcon)
		}
		h.lastAmmo = ammo
	}
}

func (h *HUD) animateIcon(iconEl any) {
	if iconEl == nil {
		return
	}
	iconEl.classList.remove("icon-animate")
	_ = iconEl.offsetWidth
	iconEl.classList.add("icon-animate")
}

// Toggle changes HUD visibility.
func (h *HUD) Toggle(show bool) {
	h.visible = show
	if h.hudEl != nil {
		if show {
			h.hudEl.classList.add("visible")
		} else {
			h.hudEl.classList.remove("visible")
		}
	}
}

// IsVisible returns whether the HUD is active.
func (h *HUD) IsVisible() bool {
	return h.visible
}

// GlobalHUD is the singleton HUD instance.
var GlobalHUD = NewHUD()
