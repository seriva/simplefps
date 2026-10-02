package game

import (
	"testing"

	"js:./interop.d.ts"
)

func TestHUDCreationAndToggle(t *testing.T) {
	hud := NewHUD()
	if hud.IsVisible() {
		t.Error("HUD should initially be hidden")
	}

	hud.Toggle(true)
	if !hud.IsVisible() {
		t.Error("HUD should be visible after Toggle(true)")
	}

	hud.Toggle(false)
	if hud.IsVisible() {
		t.Error("HUD should be hidden after Toggle(false)")
	}
}

func TestHUDMountAndUpdate(t *testing.T) {
	hud := NewHUD()
	hud.Mount(false)

	hud.Update(100, 50, 25)
	if hud.lastHP != 100 || hud.lastArmor != 50 || hud.lastAmmo != 25 {
		t.Errorf("Unexpected cached stat values: hp=%d armor=%d ammo=%d", hud.lastHP, hud.lastArmor, hud.lastAmmo)
	}

	// Repeated update with same values should be a dirty-check no-op
	hud.Update(100, 50, 25)

	if document != nil {
		hpEl := document.getElementById("hud-health-val")
		if hpEl != nil && hpEl.textContent != "100" {
			t.Errorf("Expected DOM health text '100', got '%s'", hpEl.textContent)
		}
		armorEl := document.getElementById("hud-armor-val")
		if armorEl != nil && armorEl.textContent != "50" {
			t.Errorf("Expected DOM armor text '50', got '%s'", armorEl.textContent)
		}
		ammoEl := document.getElementById("hud-ammo-val")
		if ammoEl != nil && ammoEl.textContent != "25" {
			t.Errorf("Expected DOM ammo text '25', got '%s'", ammoEl.textContent)
		}
	}
}

func TestHUDIconAnimationTrigger(t *testing.T) {
	hud := NewHUD()
	hud.Mount(false)

	// Set initial values (lastHP = -1, so first update never triggers animation)
	hud.Update(80, 30, 10)
	if hud.lastHP != 80 {
		t.Errorf("Expected lastHP = 80, got %d", hud.lastHP)
	}

	// Decrease: should NOT trigger animation (hp < lastHP)
	hud.Update(60, 20, 5)
	if hud.lastHP != 60 || hud.lastArmor != 20 || hud.lastAmmo != 5 {
		t.Error("Stats should update on decrease")
	}

	// Increase: should trigger animation path (hp > lastHP && lastHP != -1)
	// This exercises the animateIcon code path which does classList manipulation.
	hud.Update(90, 40, 15)
	if hud.lastHP != 90 || hud.lastArmor != 40 || hud.lastAmmo != 15 {
		t.Error("Stats should update on increase")
	}
}

func TestHUDMountMobile(t *testing.T) {
	hud := NewHUD()
	hud.Mount(true)

	if document != nil {
		menuBtn := document.getElementById("button-menu")
		if menuBtn == nil {
			t.Error("Expected #button-menu in DOM for mobile HUD mount")
		}
	}
}

