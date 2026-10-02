package game

import (
	"js:./interop.d.ts"
)

const defaultLanguage = "en-US"

var translations = map[string]map[string]string{
	"en-US": {
		"YES":               "Yes",
		"NO":                "No",
		"START_GAME":        "Start game",
		"CONTINUE_GAME":     "Continue game",
		"MAIN_MENU":         "Main Menu",
		"VERSION_CHECK":     "Check for updates",
		"VERSION_NEW":       "A new version is available. Do you want to update now?",
		"SETTINGS":          "Settings",
		"BACK":              "Back",
		"RENDER_SCALE":      "Render Scale",
		"GAMMA":             "Gamma",
		"FSR":               "FSR",
		"FSR_SHARPNESS":     "FSR Sharpness",
		"PROCEDURAL_DETAIL": "Procedural Detail",
		"DIRT":              "Dirt",
		"SHOW_STATS":        "Show Render Stats",
		"GRAPHICS":          "Graphics",
		"INPUT":             "Input",
		"RENDERER":          "Renderer",
		"WEBGL":             "WebGL",
		"WEBGPU":            "WebGPU",
		"RELOAD_CONFIRM":    "Changing renderer requires a page reload. Reload now?",
		"LOOK_SENSITIVITY":  "Look Sensitivity",
		"CREDITS":           "Credits",
		"CREDITS_MAP":       "Map",
		"CREDITS_PICKUPS":   "Pickups",
		"CREDITS_WEAPONS":   "Weapons",
		"CREDITS_ROBOT":     "Robot",
	},
}

var currentLanguage = defaultLanguage

// InitTranslations initializes the active language dictionary based on navigator.language.
func InitTranslations() {
	if navigator != nil && navigator.language != nil {
		lang := navigator.language.(string)
		if _, ok := translations[lang]; ok {
			currentLanguage = lang
		}
	}
}

// SetLanguage sets the active language.
func SetLanguage(lang string) {
	currentLanguage = lang
}

// CurrentLanguage returns the active language code.
func CurrentLanguage() string {
	return currentLanguage
}

// Translate retrieves the localized string for a key, or "*UNKNOWN KEY*" if missing.
func Translate(key string) string {
	if dict, ok := translations[currentLanguage]; ok {
		if val, ok := dict[key]; ok {
			return val
		}
	}
	if currentLanguage != defaultLanguage {
		if dict, ok := translations[defaultLanguage]; ok {
			if val, ok := dict[key]; ok {
				return val
			}
		}
	}
	return "*UNKNOWN KEY*"
}
