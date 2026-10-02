// Minimal declarations for browser/Node globals GoFront does not predeclare.
declare namespace Reflect {
	function construct(target: any, args: any[]): any;
}
declare var Image: any;
declare var process: any;
declare var globalThis: any;
