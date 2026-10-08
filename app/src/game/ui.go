package game

import (
	"strconv"

	"../engine/systems"
	"js:./interop.d.ts"
)

func tabClass(active bool) string {
	if active {
		return "menu-tab active"
	}
	return "menu-tab"
}

// UIManager manages menu overlays, tabs, settings changes, and modal dialogs.
type UIManager struct {
	currentMenu string
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
	OnVersionCheck func()
	OnUpdateYes    func()
	dialogOnYes    func()
	dialogOnNo     func()
}

// NewUIManager creates an unmounted UIManager.
func NewUIManager() *UIManager {
	return &UIManager{
		currentMenu: "MAIN_MENU",
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
				cb := ui.dialogOnYes
				ui.HideDialog()
				if cb != nil {
					cb()
				}
				return
			}
			if target == ui.dialogBtnNo {
				cb := ui.dialogOnNo
				ui.HideDialog()
				if cb != nil {
					cb()
				}
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
				case "start":
					ui.hasStarted = true
					GlobalState.EnterGame()
				case "settings":
					ui.Show("SETTINGS_MENU")
				case "credits":
					ui.Show("CREDITS_MENU")
				case "version-check":
					if ui.OnVersionCheck != nil {
						ui.OnVersionCheck()
					}
				case "back":
					ui.Show("MAIN_MENU")
				case "update-yes":
					if ui.OnUpdateYes != nil {
						ui.OnUpdateYes()
					}
				case "update-no":
					GlobalState.EnterGame()
				}
			}
		}, false)

		// Settings input & change listener
		ui.uiEl.addEventListener("change", func(e any) {
			if e == nil || e.target == nil {
				return
			}
			target := e.target
			id := target.id
			if id == "setting-fsr" {
				systems.ActiveSettings.DoFSR = target.checked
				systems.ActiveSettings.Save()
			} else if id == "setting-procedural-detail" {
				systems.ActiveSettings.ProceduralDetail = target.checked
				systems.ActiveSettings.Save()
			} else if id == "setting-dirt" {
				systems.ActiveSettings.DoDirt = target.checked
				systems.ActiveSettings.Save()
			} else if id == "setting-show-stats" {
				systems.ActiveSettings.ShowStats = target.checked
				systems.ActiveSettings.Save()
			}
		}, false)

		ui.uiEl.addEventListener("input", func(e any) {
			if e == nil || e.target == nil {
				return
			}
			target := e.target
			id := target.id
			if id == "setting-render-scale" {
				if f, err := strconv.ParseFloat(target.value.(string), 32); err == nil {
					systems.ActiveSettings.RenderScale = float32(f)
					systems.ActiveSettings.Save()
				}
			} else if id == "setting-gamma" {
				if f, err := strconv.ParseFloat(target.value.(string), 32); err == nil {
					systems.ActiveSettings.Gamma = float32(f)
					systems.ActiveSettings.Save()
				}
			} else if id == "setting-fsr-sharpness" {
				if f, err := strconv.ParseFloat(target.value.(string), 32); err == nil {
					systems.ActiveSettings.FsrSharpness = float32(f)
					systems.ActiveSettings.Save()
				}
			} else if id == "setting-look-sensitivity" {
				if f, err := strconv.ParseFloat(target.value.(string), 32); err == nil {
					systems.ActiveSettings.LookSensitivity = float32(f)
					systems.ActiveSettings.Save()
				}
			}
		}, false)
	}

	ui.mounted = true
}

// Show presents the requested menu overlay.
func (ui *UIManager) Show(name string) {
	if !ui.mounted {
		ui.Mount()
	}
	if name == "" {
		name = "MAIN_MENU"
	}
	ui.currentMenu = name
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
	case "SETTINGS_MENU":
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
	case "CREDITS_MENU":
		headerText = Translate("CREDITS")
		gom.Mount("#menu-controls", CreditsMenuContent())
	case "UPDATE_MENU":
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

// HasStarted returns whether the gameplay has been initiated at least once.
func (ui *UIManager) HasStarted() bool {
	return ui.hasStarted
}

// SetStarted marks whether the game has commenced.
func (ui *UIManager) SetStarted(started bool) {
	ui.hasStarted = started
}

// GlobalUI is the singleton UI manager.
var GlobalUI = NewUIManager()
