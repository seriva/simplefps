// Minimal declarations for browser/Node globals GoFront does not predeclare.
declare namespace Reflect {
	function construct(target: any, args: any[]): any;
}
declare var globalThis: any;
declare var process: any;
declare var navigator: any;
declare var window: any;
declare var document: any;
declare var location: any;
