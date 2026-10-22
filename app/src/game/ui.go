package game

import (
	"strconv"

	"../engine/systems"
	"js:./interop.d.ts"
)

// uiAction is a menu button's data-action value, shared by menus.templ and
// the click handler.
type uiAction string

const (
	actionStart        uiAction = "start"
	actionSettings     uiAction = "settings"
	actionCredits      uiAction = "credits"
	actionVersionCheck uiAction = "version-check"
	actionBack         uiAction = "back"
	actionUpdateYes    uiAction = "update-yes"
	actionUpdateNo     uiAction = "update-no"
)

// Settings-menu input ids, shared by menus.templ and the change/input
// handlers.
const (
	settingRenderScale      = "setting-render-scale"
	settingGamma            = "setting-gamma"
	settingFSR              = "setting-fsr"
	settingFSRSharpness     = "setting-fsr-sharpness"
	settingProceduralDetail = "setting-procedural-detail"
	settingDirt             = "setting-dirt"
	settingShowStats        = "setting-show-stats"
	settingLookSensitivity  = "setting-look-sensitivity"
)

func tabClass(active bool) string {
	if active {
		return "menu-tab active"
	}
	return "menu-tab"
}

// UIManager manages menu overlays, tabs, settings changes, and modal dialogs.
type UIManager struct {
	currentMenu MenuID
	activeTab   int
	hasStarted  bool
	visible     bool
	mounted     bool

	// Cached DOM elements
	uiEl            any
	backdropEl      any
	menuBaseEl      any
	headerEl        any
	controlsEl      any
	dialogOverlayEl any
	dialogHeaderEl  any
	dialogBodyEl    any
	dialogBtnYes    any
	dialogBtnNo     any

	// Callbacks
	OnVersionCheck    func()
	OnUpdateYes       func()
	OnSettingsChanged func()
	dialogOnYes       func()
	dialogOnNo        func()
}

// NewUIManager creates an unmounted UIManager.
func NewUIManager() *UIManager {
	return &UIManager{
		currentMenu: MenuMain,
		activeTab:   0,
		hasStarted:  false,
		visible:     false,
	}
}

// Mount attaches the menu DOM and registers event listeners.
func (ui *UIManager) Mount() {
	if document == nil || ui.mounted {
		return
	}
	refs := map[string]any{}
	gom.MountTo("body", MenuView(), refs)

	ui.uiEl            = refs["ui"]
	ui.backdropEl      = refs["backdrop"]
	ui.menuBaseEl      = refs["menuBase"]
	ui.headerEl        = refs["header"]
	ui.controlsEl      = refs["controls"]
	ui.dialogOverlayEl = refs["dialogOverlay"]
	ui.dialogHeaderEl  = refs["dialogHeader"]
	ui.dialogBodyEl    = refs["dialogBody"]
	ui.dialogBtnYes    = refs["dialogBtnYes"]
	ui.dialogBtnNo     = refs["dialogBtnNo"]

	if ui.uiEl != nil {
		ui.uiEl.addEventListener("click", func(e any) {
			if e == nil || e.target == nil {
				return
			}
			target := e.target

			// Dialog buttons
			if target == ui.dialogBtnYes {
				ui.closeDialog(ui.dialogOnYes)
				return
			}
			if target == ui.dialogBtnNo {
				ui.closeDialog(ui.dialogOnNo)
				return
			}

			// Tab clicks
			tabEl := target.closest("[data-tab]")
			if tabEl != nil {
				tabIdxStr := tabEl.getAttribute("data-tab")
				if tabIdxStr == "0" {
					ui.activeTab = 0
				} else {
					ui.activeTab = 1
				}
				ui.renderCurrentMenu()
				return
			}

			// Action buttons
			btn := target.closest("[data-action]")
			if btn != nil {
				action := btn.getAttribute("data-action")
				switch action {
				case actionStart:
					ui.hasStarted = true
					GlobalState.EnterGame()
				case actionSettings:
					ui.Show(MenuSettings)
				case actionCredits:
					ui.Show(MenuCredits)
				case actionVersionCheck:
					if ui.OnVersionCheck != nil {
						ui.OnVersionCheck()
					}
				case actionBack:
					ui.Show(MenuMain)
				case actionUpdateYes:
					if ui.OnUpdateYes != nil {
						ui.OnUpdateYes()
					}
				case actionUpdateNo:
					GlobalState.EnterGame()
				}
			}
		}, false)

		// Settings input & change listener
		ui.uiEl.addEventListener("change", func(e any) {
			if e != nil && e.target != nil {
				ui.onSettingChange(e.target)
			}
		}, false)

		ui.uiEl.addEventListener("input", func(e any) {
			if e != nil && e.target != nil {
				ui.onSettingInput(e.target)
			}
		}, false)
	}

	ui.mounted = true
}

// onSettingChange applies a checkbox or render-scale change from the
// settings menu.
func (ui *UIManager) onSettingChange(target any) {
	s := systems.ActiveSettings
	switch target.id {
	case settingFSR:
		s.DoFSR = target.checked
		ui.saveSettings(true)
	case settingProceduralDetail:
		s.ProceduralDetail = target.checked
		ui.saveSettings(false)
	case settingDirt:
		s.DoDirt = target.checked
		ui.saveSettings(false)
	case settingShowStats:
		s.ShowStats = target.checked
		ui.saveSettings(true)
	case settingRenderScale:
		if f, ok := sliderValue(target); ok {
			s.RenderScale = f
			ui.saveSettings(true)
		}
	}
}

// onSettingInput applies a live slider change from the settings menu.
func (ui *UIManager) onSettingInput(target any) {
	s := systems.ActiveSettings
	switch target.id {
	case settingGamma:
		if f, ok := sliderValue(target); ok {
			s.Gamma = f
			ui.saveSettings(false)
		}
	case settingFSRSharpness:
		if f, ok := sliderValue(target); ok {
			s.FsrSharpness = f
			ui.saveSettings(false)
		}
	case settingLookSensitivity:
		if f, ok := sliderValue(target); ok {
			s.LookSensitivity = f
			ui.saveSettings(false)
		}
	}
}

// sliderValue parses an input element's value; false when it is not a number.
func sliderValue(target any) (float32, bool) {
	f, err := strconv.ParseFloat(target.value.(string), 32)
	return float32(f), err == nil
}

// saveSettings persists the settings and, when notify is set, fires
// OnSettingsChanged.
func (ui *UIManager) saveSettings(notify bool) {
	systems.ActiveSettings.Save()
	if notify && ui.OnSettingsChanged != nil {
		ui.OnSettingsChanged()
	}
}

// closeDialog hides the dialog, then runs the chosen button's callback.
func (ui *UIManager) closeDialog(cb func()) {
	ui.HideDialog()
	if cb != nil {
		cb()
	}
}

// Show presents the requested menu overlay.
func (ui *UIManager) Show(menu MenuID) {
	if !ui.mounted {
		ui.Mount()
	}
	ui.currentMenu = menu
	ui.visible = true

	if ui.backdropEl != nil {
		ui.backdropEl.classList.add("visible")
	}
	if ui.menuBaseEl != nil {
		ui.menuBaseEl.classList.add("visible")
	}

	ui.renderCurrentMenu()
}

func (ui *UIManager) renderCurrentMenu() {
	if ui.controlsEl == nil {
		return
	}

	headerText := Translate("MAIN_MENU")
	switch ui.currentMenu {
	case MenuSettings:
		headerText = Translate("SETTINGS")
		gom.Mount("#menu-controls", SettingsMenuContent(
			ui.activeTab,
			systems.ActiveSettings.RenderScale,
			systems.ActiveSettings.Gamma,
			systems.ActiveSettings.DoFSR,
			systems.ActiveSettings.FsrSharpness,
			systems.ActiveSettings.ProceduralDetail,
			systems.ActiveSettings.DoDirt,
			systems.ActiveSettings.ShowStats,
			systems.ActiveSettings.LookSensitivity,
		))
	case MenuCredits:
		headerText = Translate("CREDITS")
		gom.Mount("#menu-controls", CreditsMenuContent())
	case MenuUpdate:
		headerText = Translate("VERSION_NEW")
		gom.Mount("#menu-controls", UpdateMenuContent())
	default:
		headerText = Translate("MAIN_MENU")
		gom.Mount("#menu-controls", MainMenuContent(ui.hasStarted))
	}

	if ui.headerEl != nil {
		ui.headerEl.textContent = headerText
	}
}

// Hide closes the menu overlay.
func (ui *UIManager) Hide() {
	ui.visible = false
	if ui.menuBaseEl != nil {
		ui.menuBaseEl.classList.remove("visible")
	}
	if ui.backdropEl != nil {
		ui.backdropEl.classList.remove("visible")
	}
}

// ShowDialog displays the modal confirmation dialog.
func (ui *UIManager) ShowDialog(title, message string, onYes, onNo func()) {
	if !ui.mounted {
		ui.Mount()
	}
	ui.dialogOnYes = onYes
	ui.dialogOnNo = onNo

	if ui.dialogHeaderEl != nil {
		ui.dialogHeaderEl.textContent = title
	}
	if ui.dialogBodyEl != nil {
		ui.dialogBodyEl.textContent = message
	}
	if ui.dialogOverlayEl != nil {
		ui.dialogOverlayEl.classList.add("visible")
	}
}

// HideDialog closes the modal dialog.
func (ui *UIManager) HideDialog() {
	if ui.dialogOverlayEl != nil {
		ui.dialogOverlayEl.classList.remove("visible")
	}
	ui.dialogOnYes = nil
	ui.dialogOnNo = nil
}

// IsVisible returns whether a menu overlay is currently displayed.
func (ui *UIManager) IsVisible() bool {
	return ui.visible
}

// GlobalUI is the singleton UI manager.
var GlobalUI = NewUIManager()
