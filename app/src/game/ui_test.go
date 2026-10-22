package game

import (
	"fmt"
	"strings"
	"testing"

	"../engine/systems"
	"js:./interop.d.ts"
)

func TestUIModalAndMenus(t *testing.T) {
	ui := NewUIManager()
	if ui.IsVisible() {
		t.Error("UI should initially be hidden")
	}

	ui.Show(MenuMain)
	if !ui.IsVisible() {
		t.Error("UI should be visible after Show")
	}

	ui.Show(MenuSettings)
	if ui.currentMenu != MenuSettings {
		t.Errorf("Expected currentMenu MenuSettings, got %v", ui.currentMenu)
	}

	ui.Show(MenuCredits)
	if ui.currentMenu != MenuCredits {
		t.Errorf("Expected currentMenu MenuCredits, got %v", ui.currentMenu)
	}

	ui.Hide()
	if ui.IsVisible() {
		t.Error("UI should be hidden after Hide")
	}
}

func TestUIDialog(t *testing.T) {
	ui := NewUIManager()
	yesClicked := false
	noClicked := false

	ui.ShowDialog("Confirm Title", "Confirm Message", func() {
		yesClicked = true
	}, func() {
		noClicked = true
	})

	if ui.dialogOnYes == nil || ui.dialogOnNo == nil {
		t.Error("Dialog callbacks were not stored")
	}

	// Invoke the yes callback and verify it fires.
	ui.dialogOnYes()
	if !yesClicked {
		t.Error("dialogOnYes callback was not invoked")
	}

	// Re-show with a new dialog, invoke the no callback.
	ui.ShowDialog("Second", "Second message", func() {}, func() {
		noClicked = true
	})
	ui.dialogOnNo()
	if !noClicked {
		t.Error("dialogOnNo callback was not invoked")
	}

	ui.HideDialog()
	if ui.dialogOnYes != nil || ui.dialogOnNo != nil {
		t.Error("Dialog callbacks should be nil after HideDialog")
	}
}

func TestUIMountAndDom(t *testing.T) {
	ui := NewUIManager()
	ui.Mount()

	if document != nil {
		uiEl := document.getElementById("ui")
		if uiEl == nil {
			t.Error("Expected #ui in DOM after Mount")
		}
		dialog := document.getElementById("dialog-overlay")
		if dialog == nil {
			t.Error("Expected #dialog-overlay in DOM after Mount")
		}
	}
}

func TestUISettingHandlers(t *testing.T) {
	ui := NewUIManager()
	s := systems.ActiveSettings
	saved := *s
	defer func() { *s = saved }()
	notified := 0
	ui.OnSettingsChanged = func() { notified++ }

	ui.onSettingChange(map[string]any{"id": "setting-fsr", "checked": !s.DoFSR})
	if s.DoFSR == saved.DoFSR || notified != 1 {
		t.Errorf("fsr: DoFSR=%v notified=%d", s.DoFSR, notified)
	}
	ui.onSettingChange(map[string]any{"id": "setting-dirt", "checked": !s.DoDirt})
	if s.DoDirt == saved.DoDirt || notified != 1 {
		t.Errorf("dirt should not notify: DoDirt=%v notified=%d", s.DoDirt, notified)
	}
	ui.onSettingChange(map[string]any{"id": "setting-render-scale", "value": "0.75"})
	if s.RenderScale != 0.75 || notified != 2 {
		t.Errorf("render scale: %v notified=%d", s.RenderScale, notified)
	}
	ui.onSettingChange(map[string]any{"id": "setting-render-scale", "value": "abc"})
	if s.RenderScale != 0.75 || notified != 2 {
		t.Errorf("bad render scale applied: %v notified=%d", s.RenderScale, notified)
	}

	ui.onSettingInput(map[string]any{"id": "setting-gamma", "value": "1.5"})
	ui.onSettingInput(map[string]any{"id": "setting-look-sensitivity", "value": "x"})
	ui.onSettingInput(map[string]any{"id": "other"})
	if s.Gamma != 1.5 || s.LookSensitivity != saved.LookSensitivity || notified != 2 {
		t.Errorf("input: gamma=%v look=%v notified=%d", s.Gamma, s.LookSensitivity, notified)
	}
}

func TestUISettingsAndCreditsRows(t *testing.T) {
	if document == nil {
		return
	}
	ui := NewUIManager()
	ui.Mount()
	ui.Show(MenuSettings)
	gamma := document.getElementById("setting-gamma")
	if gamma == nil || gamma.getAttribute("min") != "0.5" || gamma.getAttribute("max") != "2.5" || gamma.getAttribute("step") != "0.1" {
		t.Fatalf("gamma slider attributes wrong")
	}
	if gamma.value != fmt.Sprintf("%0.1f", systems.ActiveSettings.Gamma) {
		t.Errorf("gamma value %v", gamma.value)
	}
	fsr := document.getElementById("setting-fsr")
	if fsr == nil || fsr.checked != systems.ActiveSettings.DoFSR {
		t.Errorf("fsr checkbox not rendered with current setting")
	}
	ui.Show(MenuCredits)
	link := document.querySelector("#menu-controls a[href='https://lvlworld.com/review/id:2562']")
	if link == nil || link.textContent != "Focal Point by Lunaran" {
		t.Errorf("credit link not rendered")
	}
}

// resetDOM empties document.body so a test's mount is the only one in the
// document: gom.Mount("#menu-controls", …) targets the first match.
func resetDOM() {
	document.body.innerHTML = ""
}

// useTestUI mounts a fresh UIManager into an empty body and installs it and a
// fresh StateManager as the globals the menu actions reach. The returned
// func restores the previous globals.
func useTestUI() (*UIManager, func()) {
	savedUI, savedState := GlobalUI, GlobalState
	resetDOM()
	ui := NewUIManager()
	ui.Mount()
	GlobalUI = ui
	GlobalState = NewStateManager()
	return ui, func() {
		GlobalUI, GlobalState = savedUI, savedState
	}
}

func TestUIRefsBound(t *testing.T) {
	if document == nil {
		return
	}
	ui, restore := useTestUI()
	defer restore()
	refs := map[string]any{
		"ui":            ui.uiEl,
		"backdrop":      ui.backdropEl,
		"menuBase":      ui.menuBaseEl,
		"header":        ui.headerEl,
		"controls":      ui.controlsEl,
		"dialogOverlay": ui.dialogOverlayEl,
		"dialogHeader":  ui.dialogHeaderEl,
		"dialogBody":    ui.dialogBodyEl,
		"dialogBtnYes":  ui.dialogBtnYes,
		"dialogBtnNo":   ui.dialogBtnNo,
	}
	for name, el := range refs {
		if el == nil {
			t.Errorf("UIManager ref %q not bound after Mount", name)
		}
	}
}

// assertNoUnknownKey fails when the rendered body shows a missing translation.
func assertNoUnknownKey(t *testing.T, screen string) {
	if strings.Contains(document.body.textContent, "*UNKNOWN KEY*") {
		t.Errorf("%s renders *UNKNOWN KEY*", screen)
	}
}

func TestRenderedScreensHaveNoUnknownKeys(t *testing.T) {
	// Keys used only from Go (main.go's WebGPU dialog).
	for _, key := range []string{"RENDERER", "WEBGPU_REQUIRED"} {
		if Translate(key) == "*UNKNOWN KEY*" {
			t.Errorf("translation key %q missing", key)
		}
	}
	if document == nil {
		return
	}
	ui, restore := useTestUI()
	defer restore()

	ui.Show(MenuMain)
	assertNoUnknownKey(t, "main menu")
	ui.hasStarted = true
	ui.Show(MenuMain)
	assertNoUnknownKey(t, "main menu (started)")
	ui.activeTab = 0
	ui.Show(MenuSettings)
	assertNoUnknownKey(t, "settings graphics tab")
	ui.activeTab = 1
	ui.Show(MenuSettings)
	assertNoUnknownKey(t, "settings input tab")
	ui.Show(MenuCredits)
	assertNoUnknownKey(t, "credits menu")
	ui.Show(MenuUpdate)
	assertNoUnknownKey(t, "update menu")
	ui.ShowDialog(Translate("RENDERER"), Translate("WEBGPU_REQUIRED"), nil, nil)
	assertNoUnknownKey(t, "dialog")

	hud := NewHUD()
	hud.Mount(true)
	assertNoUnknownKey(t, "HUD")
	lm := NewLoadingManager()
	lm.Mount()
	assertNoUnknownKey(t, "loading screen")
}

func TestEveryMenuActionHandled(t *testing.T) {
	if document == nil {
		return
	}
	ui, restore := useTestUI()
	defer restore()
	versionChecks, updateYes := 0, 0
	ui.OnVersionCheck = func() { versionChecks++ }
	ui.OnUpdateYes = func() { updateYes++ }

	// Expected effect of each action, checked after clicking it.
	effects := map[string]func() bool{
		"start":         func() bool { return GlobalState.Current == StateGame && ui.hasStarted },
		"settings":      func() bool { return ui.currentMenu == MenuSettings },
		"credits":       func() bool { return ui.currentMenu == MenuCredits },
		"version-check": func() bool { return versionChecks == 1 },
		"back":          func() bool { return ui.currentMenu == MenuMain },
		"update-yes":    func() bool { return updateYes == 1 },
		"update-no":     func() bool { return GlobalState.Current == StateGame },
	}
	type screen struct {
		menu MenuID
		tab  int
	}
	screens := []screen{
		{MenuMain, 0}, {MenuSettings, 0}, {MenuSettings, 1},
		{MenuCredits, 0}, {MenuUpdate, 0},
	}
	seen := map[string]bool{}
	for _, sc := range screens {
		ui.activeTab = sc.tab
		ui.Show(sc.menu)
		n := int(ui.controlsEl.querySelectorAll("[data-action]").length.(float64))
		if n == 0 {
			t.Errorf("menu %v tab %d renders no actions", sc.menu, sc.tab)
		}
		// Clicking re-renders the menu, so re-show and re-query per action.
		for i := 0; i < n; i++ {
			GlobalState.Current = StateMenu
			ui.hasStarted = false
			versionChecks, updateYes = 0, 0
			ui.activeTab = sc.tab
			ui.Show(sc.menu)
			btn := ui.controlsEl.querySelectorAll("[data-action]").item(i)
			action := btn.getAttribute("data-action").(string)
			seen[action] = true
			check, ok := effects[action]
			if !ok {
				t.Errorf("menu %v: unhandled data-action %q", sc.menu, action)
				continue
			}
			btn.click()
			if !check() {
				t.Errorf("menu %v: data-action %q had no effect", sc.menu, action)
			}
		}
	}
	for action := range effects {
		if !seen[action] {
			t.Errorf("data-action %q is not rendered by any menu", action)
		}
	}
}

func TestShowMenuID(t *testing.T) {
	if document == nil {
		return
	}
	ui, restore := useTestUI()
	defer restore()
	ui.Show(MenuSettings)
	if ui.currentMenu != MenuSettings || document.getElementById("setting-gamma") == nil {
		t.Errorf("Show(MenuSettings) did not render the settings menu (currentMenu=%v)", ui.currentMenu)
	}
	ui.Show(MenuID(99))
	if document.getElementById("setting-gamma") != nil || document.querySelector("[data-action='start']") == nil {
		t.Error("Show(MenuID(99)) should render the main menu")
	}
	if ui.headerEl.textContent != Translate("MAIN_MENU") {
		t.Errorf("Show(MenuID(99)) header = %v", ui.headerEl.textContent)
	}
}
