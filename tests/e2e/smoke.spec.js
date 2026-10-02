// Smoke test: the compiled app boots to the menu on the WebGL2 backend
// (headless Chromium has no WebGPU), starts a game, and renders a frame.
import { expect, test } from "@playwright/test";

const START_BTN = '[data-action="start"]';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem(
			"settings",
			JSON.stringify({ UseWebGPU: false, ShowStats: true }),
		);
	});
	const errors = [];
	page.on("pageerror", (e) => {
		// Pointer lock is unavailable in automation and is handled by the game.
		if (!/pointer lock/i.test(e.message)) errors.push(e.message);
	});
	page.errors = errors;

	await page.goto("/");
	await expect(page.locator(START_BTN)).toBeVisible({ timeout: 30000 });
});

test("boots to the main menu on the WebGL2 backend without errors", async ({
	page,
}) => {
	await expect(page.locator("#stats-renderer-text")).toHaveText(
		/Renderer: webgl2/,
	);
	await expect(page.locator("#console-logs")).toContainText(
		"[Arena] Loaded arena: demo",
	);
	await expect(page.locator("#menu-base")).toHaveClass(/visible/);
	expect(page.errors).toEqual([]);
});

test("start game shows the HUD and renders a non-black frame", async ({
	page,
}) => {
	await page.locator(START_BTN).click({ force: true });
	await expect(page.locator("#hud")).toHaveClass(/visible/);
	await expect(page.locator("#menu-base")).not.toHaveClass(/visible/);
	await expect(page.locator("#hud-health-val")).toHaveText("100");
	await expect(page.locator("#stats-scene-text")).toHaveText(/m:[1-9]\d*/, {
		timeout: 5000,
	});

	// The WebGL context does not preserve its drawing buffer, so read the
	// composited frame via a screenshot instead of drawImage().
	const png = await page
		.locator("canvas")
		.screenshot({ animations: "allow", timeout: 30000 });
	const litFraction = await page.evaluate(async (b64) => {
		const img = new Image();
		img.src = `data:image/png;base64,${b64}`;
		await img.decode();
		const cv = document.createElement("canvas");
		cv.width = img.width;
		cv.height = img.height;
		const ctx = cv.getContext("2d");
		ctx.drawImage(img, 0, 0);
		const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
		let lit = 0;
		for (let i = 0; i < d.length; i += 4) {
			if (d[i] + d[i + 1] + d[i + 2] > 30) lit++;
		}
		return lit / (d.length / 4);
	}, png.toString("base64"));
	expect(litFraction).toBeGreaterThan(0.05);
	expect(page.errors).toEqual([]);
});
