package game

import (
	"testing"
)

func TestTranslationsDefault(t *testing.T) {
	InitTranslations()

	yes := Translate("YES")
	if yes != "Yes" {
		t.Errorf("Expected 'Yes', got '%s'", yes)
	}

	start := Translate("START_GAME")
	if start != "Start game" {
		t.Errorf("Expected 'Start game', got '%s'", start)
	}

	settings := Translate("SETTINGS")
	if settings != "Settings" {
		t.Errorf("Expected 'Settings', got '%s'", settings)
	}

	unknown := Translate("NONEXISTENT_KEY")
	if unknown != "*UNKNOWN KEY*" {
		t.Errorf("Expected '*UNKNOWN KEY*', got '%s'", unknown)
	}
}

func TestTranslationsLanguageSwitch(t *testing.T) {
	orig := CurrentLanguage()
	defer SetLanguage(orig)

	SetLanguage("en-US")
	if CurrentLanguage() != "en-US" {
		t.Errorf("Expected language 'en-US', got '%s'", CurrentLanguage())
	}
	if Translate("BACK") != "Back" {
		t.Errorf("Expected 'Back', got '%s'", Translate("BACK"))
	}
}
