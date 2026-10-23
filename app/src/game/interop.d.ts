// Minimal declarations for browser/Node globals GoFront does not predeclare.
declare namespace Reflect {
	function construct(target: any, args: any[]): any;
}
declare var globalThis: any;
declare var process: any;

// Typed DOM for the game UI (menus, HUD, loading screen, state manager,
// controls). Only the members `game` reads are declared, so gofront check
// rejects a misspelled one. GoFront enforces arity, so optional WebIDL
// parameters are declared as fixed parameters.
interface UIClassList {
	add(token: string): void;
	remove(token: string): void;
}

interface UIStyle {
	filter: string;
	transition: string;
}

interface UIElement {
	id: string;
	value: string;
	checked: boolean;
	textContent: string;
	tagName: string;
	offsetWidth: number;
	classList: UIClassList;
	style: UIStyle;
	closest(selectors: string): UIElement;
	// Returns null for an absent attribute. Every caller reads an attribute it
	// just matched with closest("[data-…]"), so it is always present; a new
	// caller must check closest() first.
	getAttribute(name: string): string;
	getBoundingClientRect(): any;
	addEventListener(type: string, listener: any, useCapture: boolean): void;
}

// One event type covers the keyboard, mouse, wheel and custom events the
// handlers read.
interface UIEvent {
	target: UIElement;
	key: string;
	keyCode: number;
	repeat: boolean;
	button: number;
	deltaY: number;
	detail: UIStateDetail;
	preventDefault(): void;
}

// detail of the window "changestate" CustomEvent.
interface UIStateDetail {
	state: string;
	menu: string;
}
