package systems

import (
	"strings"

	"js:./interop.d.ts"
)

const (
	consoleTextColor    = "#fff"
	consoleWarningColor = "#FF0"
	consoleErrorColor   = "#F44"
	consoleMaxLogs      = 1000
	consoleMaxHistory   = 100
)

// LogEntry represents an individual message logged to the debug console.
type LogEntry struct {
	Message string
	Color   string
}

// CommandHandler represents a function handling a console command.
type CommandHandler func(args []string) string

// ConsoleManager handles in-game debug console rendering, history, and command execution.
type ConsoleManager struct {
	visible        bool
	history        []string
	historyIndex   int
	logs           []LogEntry
	commands       map[string]CommandHandler
	currentCommand string

	// Cached DOM elements
	bodyEl    any
	contentEl any
	logsEl    any
	inputEl   any

	onKeyDown any
	onInput   any
	mounted   bool
}

// NewConsoleManager creates an unmounted ConsoleManager instance.
func NewConsoleManager() *ConsoleManager {
	return &ConsoleManager{
		visible:      false,
		history:      make([]string, 0),
		historyIndex: -1,
		logs:         make([]LogEntry, 0),
		commands:     make(map[string]CommandHandler),
	}
}

func escapeConsoleHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

// Mount mounts the debug console template and styles to the DOM.
func (cm *ConsoleManager) Mount() {
	if document == nil || cm.mounted {
		return
	}
	gom.MountTo("body", ConsoleView())

	cm.bodyEl = document.getElementById("console-body")
	cm.contentEl = document.getElementById("console-content")
	cm.logsEl = document.getElementById("console-logs")
	cm.inputEl = document.getElementById("console-input")

	if cm.inputEl != nil {
		cm.onInput = func(e any) {
			if e != nil && e.target != nil {
				cm.currentCommand = e.target.value.(string)
				cm.historyIndex = -1
			}
		}
		cm.inputEl.addEventListener("input", cm.onInput, false)

		cm.onKeyDown = func(e any) {
			if e == nil {
				return
			}
			key := e.key.(string)
			if key == "`" || key == "~" {
				e.preventDefault()
				// Stop the window-level toggle from firing on the same keypress.
				e.stopPropagation()
				cm.Toggle()
				return
			}
			if key == "Enter" {
				e.preventDefault()
				cm.Execute()
				return
			}
			if key == "ArrowUp" || key == "ArrowDown" {
				e.preventDefault()
				cm.navigateHistory(key == "ArrowUp")
				return
			}
		}
		cm.inputEl.addEventListener("keydown", cm.onKeyDown, false)
	}

	cm.mounted = true
}

func (cm *ConsoleManager) navigateHistory(up bool) {
	if len(cm.history) == 0 {
		return
	}
	hLen := len(cm.history)
	if up {
		if cm.historyIndex == -1 {
			cm.historyIndex = hLen - 1
		} else if cm.historyIndex > 0 {
			cm.historyIndex--
		}
	} else {
		if cm.historyIndex < hLen-1 {
			cm.historyIndex++
		} else {
			cm.historyIndex = -1
		}
	}

	if cm.historyIndex == -1 {
		cm.currentCommand = ""
	} else {
		cm.currentCommand = cm.history[cm.historyIndex]
	}

	if cm.inputEl != nil {
		cm.inputEl.value = cm.currentCommand
	}
}

// PushHistory appends a command to history if distinct from the previous entry.
func (cm *ConsoleManager) PushHistory(cmd string) {
	if cmd == "" {
		return
	}
	if len(cm.history) > 0 && cm.history[len(cm.history)-1] == cmd {
		return
	}
	cm.history = append(cm.history, cmd)
	if len(cm.history) > consoleMaxHistory {
		cm.history = cm.history[1:]
	}
}

// History returns a copy of recorded command history.
func (cm *ConsoleManager) History() []string {
	res := make([]string, len(cm.history))
	copy(res, cm.history)
	return res
}

// Logs returns a copy of recorded logs.
func (cm *ConsoleManager) Logs() []LogEntry {
	res := make([]LogEntry, len(cm.logs))
	copy(res, cm.logs)
	return res
}

// AddLog registers an entry and updates the DOM view if mounted.
func (cm *ConsoleManager) AddLog(message, color string) {
	entry := LogEntry{Message: message, Color: color}
	cm.logs = append(cm.logs, entry)
	if len(cm.logs) > consoleMaxLogs {
		cm.logs = cm.logs[1:]
	}
	cm.updateLogDOM()
}

func (cm *ConsoleManager) updateLogDOM() {
	if cm.logsEl == nil {
		return
	}
	var sb strings.Builder
	for i := 0; i < len(cm.logs); i++ {
		sb.WriteString("<span style=\"color: ")
		sb.WriteString(cm.logs[i].Color)
		sb.WriteString("\">")
		sb.WriteString(escapeConsoleHTML(cm.logs[i].Message))
		sb.WriteString("<br /></span>")
	}
	cm.logsEl.innerHTML = sb.String()
	if cm.contentEl != nil {
		cm.contentEl.scrollTop = cm.contentEl.scrollHeight
	}
}

// Log records an info log entry.
func (cm *ConsoleManager) Log(message string) {
	if console != nil && console.log != nil {
		console.log(message)
	}
	cm.AddLog(message, consoleTextColor)
}

// Warn records a warning log entry.
func (cm *ConsoleManager) Warn(message string) {
	if console != nil && console.warn != nil {
		console.warn(message)
	}
	cm.AddLog(message, consoleWarningColor)
}

// Error records an error log entry.
func (cm *ConsoleManager) Error(message string) {
	if console != nil && console.error != nil {
		console.error(message)
	}
	cm.AddLog(message, consoleErrorColor)
}

// Toggle flips the visibility of the console overlay.
func (cm *ConsoleManager) Toggle() {
	cm.SetVisible(!cm.visible)
}

// SetVisible sets the visibility of the console overlay explicitly.
func (cm *ConsoleManager) SetVisible(show bool) {
	cm.visible = show
	if cm.bodyEl != nil {
		if cm.visible {
			cm.bodyEl.classList.add("visible")
			if cm.inputEl != nil {
				cm.inputEl.disabled = false
				cm.inputEl.focus()
			}
		} else {
			cm.bodyEl.classList.remove("visible")
			if cm.inputEl != nil {
				cm.inputEl.blur()
			}
		}
	}
}

// IsVisible returns whether the debug console is active on screen.
func (cm *ConsoleManager) IsVisible() bool {
	return cm.visible
}

// RegisterCmd registers a command handler callback under a given name.
func (cm *ConsoleManager) RegisterCmd(name string, handler CommandHandler) {
	cm.commands[strings.ToLower(name)] = handler
}

// Execute executes the currently typed input command.
func (cm *ConsoleManager) Execute() string {
	return cm.ExecuteCmd(cm.currentCommand)
}

// ExecuteCmd executes the provided command string.
func (cm *ConsoleManager) ExecuteCmd(cmdLine string) string {
	cmdLine = strings.TrimSpace(cmdLine)
	if cmdLine == "" {
		return ""
	}

	cm.Log(cmdLine)
	cm.PushHistory(cmdLine)
	cm.currentCommand = ""
	if cm.inputEl != nil {
		cm.inputEl.value = ""
	}

	parts := strings.Fields(cmdLine)
	cmdName := strings.ToLower(parts[0])
	cmdArgs := parts[1:]

	// Legacy call syntax: name(arg1, arg2)
	if open := strings.Index(cmdLine, "("); open > 0 && strings.HasSuffix(cmdLine, ")") {
		cmdName = strings.ToLower(strings.TrimSpace(cmdLine[:open]))
		cmdArgs = nil
		for _, a := range strings.Split(cmdLine[open+1:len(cmdLine)-1], ",") {
			a = strings.Trim(strings.TrimSpace(a), "\"'")
			if a != "" {
				cmdArgs = append(cmdArgs, a)
			}
		}
	}

	if handler, ok := cm.commands[cmdName]; ok {
		result := handler(cmdArgs)
		if result != "" {
			cm.Log(result)
		}
		return result
	}

	cm.Warn("Unknown command: " + cmdName)
	return ""
}

// Dispose removes DOM event listeners registered by Mount.
func (cm *ConsoleManager) Dispose() {
	if cm.inputEl == nil {
		return
	}
	if cm.onInput != nil {
		cm.inputEl.removeEventListener("input", cm.onInput, false)
		cm.onInput = nil
	}
	if cm.onKeyDown != nil {
		cm.inputEl.removeEventListener("keydown", cm.onKeyDown, false)
		cm.onKeyDown = nil
	}
}

// GlobalConsole is the singleton console instance.
var GlobalConsole = NewConsoleManager()
