// Minimal declarations for browser/Node globals GoFront does not predeclare.
declare namespace Reflect {
	function construct(target: any, args: any[]): any;
}
declare var globalThis: any;
declare var process: any;

// Event constructors exposed on window (needed under jsdom where globalThis
// holds Node's Event rather than the jsdom window's).
interface WindowEvents {
	Event: any;
	CustomEvent: any;
}

// detail of the window "changestate" CustomEvent.
interface UIStateDetail {
	state: string;
	menu: string;
}
