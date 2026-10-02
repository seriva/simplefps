package game

import (
	"testing"

	"js:./interop.d.ts"
)

func TestUIModalAndMenus(t *testing.T) {
	ui := NewUIManager()
	if ui.IsVisible() {
		t.Error("UI should initially be hidden")
	}

	ui.Show("MAIN_MENU")
	if !ui.IsVisible() {
		t.Error("UI should be visible after Show")
	}

	ui.Show("SETTINGS_MENU")
	if ui.currentMenu != "SETTINGS_MENU" {
		t.Errorf("Expected currentMenu 'SETTINGS_MENU', got '%s'", ui.currentMenu)
	}

	ui.Show("CREDITS_MENU")
	if ui.currentMenu != "CREDITS_MENU" {
		t.Errorf("Expected currentMenu 'CREDITS_MENU', got '%s'", ui.currentMenu)
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
