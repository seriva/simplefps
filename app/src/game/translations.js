import { Console } from "../engine/engine.js";

// ============================================================================
// Private
// ============================================================================

const _DEFAULT_LANGUAGE = "en-US";

const _translations = {
	"en-US": {
		YES: "Yes",
		NO: "No",
		START_GAME: "Start game",
		CONTINUE_GAME: "Continue game",
		MAIN_MENU: "Main Menu",
		VERSION_CHECK: "Check for updates",
		VERSION_NEW: "A new version is available. Do you want to update now?",
		SETTINGS: "Settings",
		BACK: "Back",
		RENDER_SCALE: "Render Scale",
		GAMMA: "Gamma",
		FXAA: "FXAA",
		PROCEDURAL_DETAIL: "Procedural Detail",
		SSAO: "SSAO",
		DIRT: "Dirt",
		SHOW_STATS: "Show Render Stats",
		GRAPHICS: "Graphics",
		INPUT: "Input",
		RENDERER: "Renderer",
		WEBGL: "WebGL",
		WEBGPU: "WebGPU",
		RELOAD_CONFIRM: "Changing renderer requires a page reload. Reload now?",
		LOOK_SENSITIVITY: "Look Sensitivity",
		CREDITS: "Credits",
		CREDITS_MAP: "Map",
		CREDITS_PICKUPS: "Pickups",
		CREDITS_WEAPONS: "Weapons",
		CREDITS_ROBOT: "Robot",
	},
};

const _currentLanguage = (() => {
	const browserLang = navigator.language;
	return browserLang in _translations ? browserLang : _DEFAULT_LANGUAGE;
})();

Console.log(`[Translations] Language ${_currentLanguage}`);

// ============================================================================
// Public API
// ============================================================================

const Translations = {
	get: (key) => {
		const languageDict = _translations[_currentLanguage];
		return languageDict?.[key] ?? "*UNKNOWN KEY*";
	},
};

export default Translations;
