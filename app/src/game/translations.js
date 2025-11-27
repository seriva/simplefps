import { Console } from "../engine/core/engine.js";

// Default language fallback
const DEFAULT_LANGUAGE = "en-US";

// Translation dictionary
const translations = {
	"en-US": {
		YES: "Yes",
		NO: "No",
		CONTINUE_GAME: "Continue game",
		MAIN_MENU: "Main Menu",
		VERSION_CHECK: "Check for updates",
		VERSION_NEW: "A new version is available. Do you want to update now?",
	},
};

// Get browser language or fallback to default
const currentLanguage = (() => {
	const browserLang = navigator.language;
	return browserLang in translations ? browserLang : DEFAULT_LANGUAGE;
})();

Console.log(`Language ${currentLanguage}`);

const Translations = {
	get: (key) => {
		const languageDict = translations[currentLanguage];
		return languageDict?.[key] ?? "*UNKNOWN KEY*";
	},
};

export default Translations;
