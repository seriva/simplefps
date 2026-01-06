import { Settings, Stats, Utils } from "../engine/core/engine.js";
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
			text: Translations.get("SETTINGS"),
			callback: () => {
				UI.show("SETTINGS_MENU");
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

// Settings menu with tabs
const _settingsMenu = {
	header: Translations.get("SETTINGS"),
	tabs: [
		{
			label: Translations.get("GRAPHICS"),
			controls: [
				{
					type: "select",
					text: Translations.get("RENDERER"),
					value: () => Settings.useWebGPU,
					options: (() => {
						const opts = [{ label: Translations.get("WEBGL"), value: false }];
						if (navigator.gpu) {
							opts.unshift({
								label: `${Translations.get("WEBGPU")} (Experimental)`,
								value: true,
							});
						}
						return opts;
					})(),
					set: (v) => {
						const doWebGPU = v === "true" || v === true;
						if (Settings.useWebGPU !== doWebGPU) {
							UI.showDialog(
								Translations.get("RENDERER"),
								Translations.get("RELOAD_CONFIRM"),
								() => {
									// Yes callback
									Settings.useWebGPU = doWebGPU;
									Settings.save();
									window.location.reload();
								},
								() => {
									// No callback - force UI refresh to revert selection
									UI.show("SETTINGS_MENU");
								},
							);
						}
					},
				},
				{
					type: "slider",
					text: Translations.get("RENDER_SCALE"),
					value: () => Settings.renderScale,
					set: (v) => {
						Settings.renderScale = parseFloat(v);
						Settings.save();
						Utils.dispatchEvent("resize");
					},
					min: 0.5,
					max: 1.0,
					step: 0.05,
				},
				{
					type: "slider",
					text: Translations.get("GAMMA"),
					value: () => Settings.gamma,
					set: (v) => {
						Settings.gamma = parseFloat(v);
						Settings.save();
					},
					min: 0.5,
					max: 2.5,
					step: 0.1,
				},
				{
					type: "checkbox",
					text: Translations.get("FXAA"),
					value: () => Settings.doFXAA,
					set: (v) => {
						Settings.doFXAA = v;
						Settings.save();
					},
				},
				{
					type: "checkbox",
					text: Translations.get("DETAIL_TEXTURE"),
					value: () => Settings.detailTexture,
					set: (v) => {
						Settings.detailTexture = v;
						Settings.save();
					},
				},
				{
					type: "checkbox",
					text: Translations.get("SSAO"),
					value: () => Settings.doSSAO,
					set: (v) => {
						Settings.doSSAO = v;
						Settings.save();
					},
				},
				{
					type: "checkbox",
					text: Translations.get("DIRT"),
					value: () => Settings.doDirt,
					set: (v) => {
						Settings.doDirt = v;
						Settings.save();
					},
				},
				{
					type: "checkbox",
					text: Translations.get("SHOW_STATS"),
					value: () => Settings.showStats,
					set: (v) => {
						Settings.showStats = v;
						Stats.toggle(v);
						Settings.save();
					},
				},
			],
		},
		{
			label: Translations.get("INPUT"),
			controls: [
				{
					type: "slider",
					text: Translations.get("LOOK_SENSITIVITY"),
					value: () => Settings.lookSensitivity,
					set: (v) => {
						Settings.lookSensitivity = parseFloat(v);
						Settings.save();
					},
					min: 0.1,
					max: 1.0,
					step: 0.05,
				},
			],
		},
	],
	bottomControls: [
		{
			text: Translations.get("BACK"),
			callback: () => {
				UI.show("MAIN_MENU");
			},
		},
	],
};

// ============================================================================
// Public API
// ============================================================================

// Register all menus
UI.register("MAIN_MENU", _mainMenu);
UI.register("SETTINGS_MENU", _settingsMenu);
UI.register("UPDATE_MENU", _updateMenu);

const Menus = {};

export default Menus;
