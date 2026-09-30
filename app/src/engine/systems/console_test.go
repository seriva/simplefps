package systems

import (
	"strings"
	"testing"
)

func TestConsoleManagerLogAndWarn(t *testing.T) {
	cm := NewConsoleManager()
	if cm.IsVisible() {
		t.Error("Console should initially not be visible")
	}

	cm.Log("hello world")
	logs := cm.Logs()
	if len(logs) != 1 {
		t.Fatalf("Expected 1 log, got %d", len(logs))
	}
	if logs[0].Message != "hello world" {
		t.Errorf("Expected message 'hello world', got '%s'", logs[0].Message)
	}
	if logs[0].Color != consoleTextColor {
		t.Errorf("Expected color '%s', got '%s'", consoleTextColor, logs[0].Color)
	}

	cm.Warn("warning message")
	logs = cm.Logs()
	if len(logs) != 2 {
		t.Fatalf("Expected 2 logs, got %d", len(logs))
	}
	if logs[1].Message != "warning message" || logs[1].Color != consoleWarningColor {
		t.Errorf("Unexpected warning entry: %+v", logs[1])
	}
}

func TestConsoleHistory(t *testing.T) {
	cm := NewConsoleManager()

	cm.PushHistory("cmd1")
	cm.PushHistory("cmd1") // consecutive duplicate should be ignored
	cm.PushHistory("cmd2")

	h := cm.History()
	if len(h) != 2 {
		t.Fatalf("Expected history length 2, got %d", len(h))
	}
	if h[0] != "cmd1" || h[1] != "cmd2" {
		t.Errorf("Unexpected history: %v", h)
	}
}

func TestConsoleCommands(t *testing.T) {
	cm := NewConsoleManager()

	executed := false
	var passedArgs []string

	cm.RegisterCmd("testcmd", func(args []string) string {
		executed = true
		passedArgs = args
		return "executed successfully"
	})

	res := cm.ExecuteCmd("testcmd arg1 123")
	if !executed {
		t.Error("Registered command was not executed")
	}
	if res != "executed successfully" {
		t.Errorf("Unexpected result: '%s'", res)
	}
	if len(passedArgs) != 2 || passedArgs[0] != "arg1" || passedArgs[1] != "123" {
		t.Errorf("Unexpected args: %v", passedArgs)
	}

	// Unknown command
	resUnknown := cm.ExecuteCmd("nonexistent")
	if resUnknown != "" {
		t.Errorf("Expected empty result for unknown command, got '%s'", resUnknown)
	}
}

func TestConsoleToggleAndMount(t *testing.T) {
	cm := NewConsoleManager()
	cm.Toggle()
	if !cm.IsVisible() {
		t.Error("Toggle should set visibility to true")
	}
	cm.SetVisible(false)
	if cm.IsVisible() {
		t.Error("SetVisible(false) should set visibility to false")
	}

	// Mount in test environment (safe in both headless and JSDOM)
	cm.Mount()
	if cm.mounted && document != nil {
		body := document.getElementById("console-body")
		if body == nil {
			t.Error("Expected console-body element in DOM after Mount")
		}
	}
}

func TestEscapeConsoleHTML(t *testing.T) {
	escaped := escapeConsoleHTML("<script>alert('xss') & test</script>")
	if strings.Contains(escaped, "<script>") || strings.Contains(escaped, "& ") {
		t.Errorf("HTML characters were not properly escaped: %s", escaped)
	}
}

func TestConsoleError(t *testing.T) {
	cm := NewConsoleManager()
	cm.Error("something broke")
	logs := cm.Logs()
	if len(logs) != 1 {
		t.Fatalf("Expected 1 log, got %d", len(logs))
	}
	if logs[0].Message != "something broke" {
		t.Errorf("Expected message 'something broke', got '%s'", logs[0].Message)
	}
	if logs[0].Color != consoleErrorColor {
		t.Errorf("Expected error color '%s', got '%s'", consoleErrorColor, logs[0].Color)
	}
}

func TestConsoleDispose(t *testing.T) {
	cm := NewConsoleManager()
	// Dispose before mount should be safe.
	cm.Dispose()

	cm.Mount()
	if cm.mounted && document != nil {
		cm.Dispose()
		if cm.onInput != nil {
			t.Error("Expected onInput to be nil after Dispose")
		}
		if cm.onKeyDown != nil {
			t.Error("Expected onKeyDown to be nil after Dispose")
		}
	}
}

func TestConsoleHistoryNavigation(t *testing.T) {
	cm := NewConsoleManager()
	cm.PushHistory("first")
	cm.PushHistory("second")
	cm.PushHistory("third")

	// Navigate up through history: should go third → second → first
	cm.navigateHistory(true)
	if cm.currentCommand != "third" {
		t.Errorf("Expected 'third', got '%s'", cm.currentCommand)
	}
	cm.navigateHistory(true)
	if cm.currentCommand != "second" {
		t.Errorf("Expected 'second', got '%s'", cm.currentCommand)
	}
	cm.navigateHistory(true)
	if cm.currentCommand != "first" {
		t.Errorf("Expected 'first', got '%s'", cm.currentCommand)
	}
	// At beginning, another up should stay at first
	cm.navigateHistory(true)
	if cm.currentCommand != "first" {
		t.Errorf("Expected 'first' at boundary, got '%s'", cm.currentCommand)
	}

	// Navigate down back through history
	cm.navigateHistory(false)
	if cm.currentCommand != "second" {
		t.Errorf("Expected 'second', got '%s'", cm.currentCommand)
	}
	cm.navigateHistory(false)
	if cm.currentCommand != "third" {
		t.Errorf("Expected 'third', got '%s'", cm.currentCommand)
	}
	// Past the end, should clear current command
	cm.navigateHistory(false)
	if cm.currentCommand != "" {
		t.Errorf("Expected empty command at end of history, got '%s'", cm.currentCommand)
	}
}

