// Browser/Node globals GoFront does not predeclare.
declare namespace Reflect {
	function construct(target: any, args: any[]): any;
}
declare var Image: any;
declare var process: any;
declare var globalThis: any;
declare var ArrayBuffer: any;

// Static FileAPI methods on URL (not emitted on dom.URL).
interface ObjectURLAPI {
	createObjectURL(obj: any): string;
	revokeObjectURL(url: string): void;
}
