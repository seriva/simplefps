package game

import (
	"gofront/dom"
	"strconv"
)

// HUD represents the cached direct DOM in-game heads-up display.
type HUD struct {
	hudEl      dom.HTMLElement
	healthEl   dom.HTMLElement
	armorEl    dom.HTMLElement
	ammoEl     dom.HTMLElement
	healthIcon dom.HTMLElement
	armorIcon  dom.HTMLElement
	ammoIcon   dom.HTMLElement
	menuBtn    dom.HTMLElement

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
	refs := map[string]any{}
	gom.MountTo("body", HUDView(isMobile), refs)

	h.hudEl      = refs["hud"].(dom.HTMLElement)
	h.healthEl   = refs["healthEl"].(dom.HTMLElement)
	h.armorEl    = refs["armorEl"].(dom.HTMLElement)
	h.ammoEl     = refs["ammoEl"].(dom.HTMLElement)
	h.healthIcon = refs["healthIcon"].(dom.HTMLElement)
	h.armorIcon  = refs["armorIcon"].(dom.HTMLElement)
	h.ammoIcon   = refs["ammoIcon"].(dom.HTMLElement)

	setupAnimEnd := func(iconEl dom.HTMLElement) {
		if iconEl != nil && iconEl.addEventListener != nil {
			iconEl.addEventListener("animationend", func() {
				iconEl.classList.remove("icon-animate")
			}, false)
		}
	}
	setupAnimEnd(h.healthIcon)
	setupAnimEnd(h.armorIcon)
	setupAnimEnd(h.ammoIcon)

	if isMobile {
		h.menuBtn = refs["menuBtn"].(dom.HTMLElement)
		if h.menuBtn != nil {
			h.menuBtn.addEventListener("touchend", func() {
				GlobalState.EnterMenu(MenuMain)
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

func (h *HUD) animateIcon(iconEl dom.HTMLElement) {
	if iconEl == nil {
		return
	}
	iconEl.classList.remove("icon-animate")
	if iconEl.getBoundingClientRect != nil {
		iconEl.getBoundingClientRect()
	} else {
		_ = iconEl.offsetWidth
	}
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
