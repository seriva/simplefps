// Minimal declarations for browser/Node globals GoFront does not predeclare.
declare namespace Reflect {
	function construct(target: any, args: any[]): any;
}
declare var globalThis: any;
