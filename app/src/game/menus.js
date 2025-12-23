import State from "./state.js";
import Translations from "./translations.js";
import UI from "./ui.js";
import Update from "./update.js";

// ============================================================================
// Private
// ============================================================================

// Main menu
const _mainMenu = {
	header: Translations.get("MAIN_MENU"),
	controls: [
		{
			text: Translations.get("CONTINUE_GAME"),
			callback: () => {
				State.enterGame();
			},
		},
		{
			text: Translations.get("VERSION_CHECK"),
			callback: () => {
				Update.force();
			},
		},
	],
};

// Update menu
const _updateMenu = {
	header: Translations.get("VERSION_NEW"),
	controls: [
		{
			text: Translations.get("YES"),
			callback: () => {
				Update.update();
			},
		},
		{
			text: Translations.get("NO"),
			callback: () => {
				State.enterGame();
			},
		},
	],
};

// ============================================================================
// Public API
// ============================================================================

// Register all menus
UI.register("MAIN_MENU", _mainMenu);
UI.register("UPDATE_MENU", _updateMenu);

const Menus = {};

export default Menus;
