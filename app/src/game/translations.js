import { Console } from "../engine/core/engine.js";

// ============================================================================
// Private
// ============================================================================

const _DEFAULT_LANGUAGE = "en-US";

const _translations = {
	"en-US": {
		YES: "Yes",
		NO: "No",
		CONTINUE_GAME: "Continue game",
		MAIN_MENU: "Main Menu",
		VERSION_CHECK: "Check for updates",
		VERSION_NEW: "A new version is available. Do you want to update now?",
		SETTINGS: "Settings",
		BACK: "Back",
		RENDER_SCALE: "Render Scale",
		GAMMA: "Gamma",
		FXAA: "FXAA",
		SSAO: "SSAO",
		DIRT: "Dirt",
		SHOW_STATS: "Show Render Stats",
	},
};

const _currentLanguage = (() => {
	const browserLang = navigator.language;
	return browserLang in _translations ? browserLang : _DEFAULT_LANGUAGE;
})();

Console.log(`Language ${_currentLanguage}`);

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
