package game

import (
	"gofront/dom"
	"strconv"

	"../engine/systems"
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

func visibleClass(base string, visible bool) string {
	if visible {
		return base + " visible"
	}
	return base
}

// UIManager manages menu overlays, tabs, settings changes, and modal dialogs.
type UIManager struct {
	currentMenu   MenuID
	activeTab     int
	hasStarted    bool
	visible       *gom.Signal[bool]
	header        *gom.Signal[string]
	dialogVisible *gom.Signal[bool]
	dialogTitle   *gom.Signal[string]
	dialogBody    *gom.Signal[string]
	mounted       bool

	// Cached DOM elements needed for event delegation and mounting
	uiEl         dom.HTMLElement
	controlsEl   dom.HTMLElement
	dialogBtnYes dom.HTMLElement
	dialogBtnNo  dom.HTMLElement

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
		currentMenu:   MenuMain,
		activeTab:     0,
		hasStarted:    false,
		visible:       gom.NewSignal(false),
		header:        gom.NewSignal(""),
		dialogVisible: gom.NewSignal(false),
		dialogTitle:   gom.NewSignal(""),
		dialogBody:    gom.NewSignal(""),
	}
}

// Mount attaches the menu DOM and registers event listeners.
func (ui *UIManager) Mount() {
	if document == nil || ui.mounted {
		return
	}
	refs := map[string]any{}
	gom.MountTo("body", MenuView(ui.visible, ui.header, ui.dialogVisible, ui.dialogTitle, ui.dialogBody), refs)

	ui.uiEl         = refs["ui"].(dom.HTMLElement)
	ui.controlsEl   = refs["controls"].(dom.HTMLElement)
	ui.dialogBtnYes = refs["dialogBtnYes"].(dom.HTMLElement)
	ui.dialogBtnNo  = refs["dialogBtnNo"].(dom.HTMLElement)

	if ui.uiEl != nil {
		ui.uiEl.addEventListener("click", func(e dom.Event) {
			if e == nil || e.target == nil {
				return
			}
			target := e.target.(dom.HTMLElement)

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
				switch uiAction(action) {
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
		ui.uiEl.addEventListener("change", func(e dom.Event) {
			if e != nil && e.target != nil {
				ui.onSettingChange(e.target.(dom.HTMLInputElement))
			}
		}, false)

		ui.uiEl.addEventListener("input", func(e dom.Event) {
			if e != nil && e.target != nil {
				ui.onSettingInput(e.target.(dom.HTMLInputElement))
			}
		}, false)
	}

	ui.mounted = true
}

// onSettingChange applies a checkbox or render-scale change from the
// settings menu.
func (ui *UIManager) onSettingChange(target dom.HTMLInputElement) {
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
func (ui *UIManager) onSettingInput(target dom.HTMLInputElement) {
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
func sliderValue(target dom.HTMLInputElement) (float32, bool) {
	f, err := strconv.ParseFloat(target.value, 32)
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
	ui.visible.Set(true)
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

	ui.header.Set(headerText)
}

// Hide closes the menu overlay.
func (ui *UIManager) Hide() {
	ui.visible.Set(false)
}

// ShowDialog displays the modal confirmation dialog.
func (ui *UIManager) ShowDialog(title, message string, onYes, onNo func()) {
	if !ui.mounted {
		ui.Mount()
	}
	ui.dialogOnYes = onYes
	ui.dialogOnNo = onNo

	ui.dialogTitle.Set(title)
	ui.dialogBody.Set(message)
	ui.dialogVisible.Set(true)
}

// HideDialog closes the modal dialog.
func (ui *UIManager) HideDialog() {
	ui.dialogVisible.Set(false)
	ui.dialogOnYes = nil
	ui.dialogOnNo = nil
}

// IsVisible returns whether a menu overlay is currently displayed.
func (ui *UIManager) IsVisible() bool {
	return ui.visible.Get()
}

// GlobalUI is the singleton UI manager.
var GlobalUI = NewUIManager()
