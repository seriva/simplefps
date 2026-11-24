package game

import (
	"gofront/dom"
)

// HUD represents the reactive in-game heads-up display.
type HUD struct {
	visible *gom.Signal[bool]
	health  *gom.Signal[int]
	armor   *gom.Signal[int]
	ammo    *gom.Signal[int]

	healthIcon dom.HTMLElement
	armorIcon  dom.HTMLElement
	ammoIcon   dom.HTMLElement
	menuBtn    dom.HTMLElement

	lastHP    int
	lastArmor int
	lastAmmo  int
	mounted   bool
}

// NewHUD creates an unmounted HUD instance.
func NewHUD() *HUD {
	return &HUD{
		visible:   gom.NewSignal(false),
		health:    gom.NewSignal(100),
		armor:     gom.NewSignal(0),
		ammo:      gom.NewSignal(50),
		lastHP:    -1,
		lastArmor: -1,
		lastAmmo:  -1,
	}
}

// Mount mounts the HUD styles and DOM elements and caches imperative icon refs.
func (h *HUD) Mount(isMobile bool) {
	if document == nil || h.mounted {
		return
	}
	refs := map[string]any{}
	gom.MountTo("body", HUDView(isMobile, h.visible, h.health, h.armor, h.ammo), refs)

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
		h.health.Set(hp)
		if hp > h.lastHP && h.lastHP != -1 {
			h.animateIcon(h.healthIcon)
		}
		h.lastHP = hp
	}
	if armor != h.lastArmor {
		h.armor.Set(armor)
		if armor > h.lastArmor && h.lastArmor != -1 {
			h.animateIcon(h.armorIcon)
		}
		h.lastArmor = armor
	}
	if ammo != h.lastAmmo {
		h.ammo.Set(ammo)
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
	h.visible.Set(show)
}

// IsVisible returns whether the HUD is active.
func (h *HUD) IsVisible() bool {
	return h.visible.Get()
}

// GlobalHUD is the singleton HUD instance.
var GlobalHUD = NewHUD()
