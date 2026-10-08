// Smoke test: the compiled app boots to the menu on the WebGPU backend,
// starts a game, and renders a frame (mocked in headless environments without a GPU).
import { expect, test } from "@playwright/test";

const START_BTN = '[data-action="start"]';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem("settings", JSON.stringify({ ShowStats: true }));

		window.__isMockWebGPU = true;

		// Real GPU objects echo descriptor.label as a string and keep expando
		// props (the backend tags buffers with `_id`); the mock must do both.
		function createMock(label) {
			const fn = () => createMock();
			const props = Object.create(null);
			if (label !== undefined) props.label = label;
			return new Proxy(fn, {
				get(_target, prop) {
					if (prop === "then") return undefined;
					if (prop in props) return props[prop];
					return createMock();
				},
				set(_target, prop, value) {
					props[prop] = value;
					return true;
				},
				apply(_target, _thisArg, args) {
					const desc = args[0];
					const l =
						desc && typeof desc === "object" && typeof desc.label === "string"
							? desc.label
							: undefined;
					return createMock(l);
				},
			});
		}

		const mockDevice = createMock();
		const mockGpu = {
			getPreferredCanvasFormat: () => "rgba8unorm",
			requestAdapter: async () => ({
				requestDevice: async () => mockDevice,
			}),
		};

		try {
			Object.defineProperty(Navigator.prototype, "gpu", {
				get: () => mockGpu,
				configurable: true,
			});
		} catch {}

		const origGetContext = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (type, ...args) {
			if (type === "webgpu") {
				return {
					configure: () => {},
					getCurrentTexture: () => ({
						createView: () => createMock(),
					}),
				};
			}
			return origGetContext.call(this, type, ...args);
		};
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

test("boots to the main menu on the WebGPU backend without errors", async ({
	page,
}) => {
	await expect(page.locator("#stats-renderer-text")).toHaveText(
		/Renderer: webgpu/,
	);
	await expect(page.locator("#console-logs")).toContainText(
		"[Arena] Loaded arena: demo",
	);
	await expect(page.locator("#menu-base")).toHaveClass(/visible/);
	expect(page.errors).toEqual([]);
});

test("start game shows the HUD and scene renders", async ({ page }) => {
	await page.locator(START_BTN).click({ force: true });
	await expect(page.locator("#hud")).toHaveClass(/visible/);
	await expect(page.locator("#menu-base")).not.toHaveClass(/visible/);
	await expect(page.locator("#hud-health-val")).toHaveText("100");
	await expect(page.locator("#stats-scene-text")).toHaveText(/m:[1-9]\d*/, {
		timeout: 5000,
	});

	const isMock = await page.evaluate(() => !!window.__isMockWebGPU);
	if (!isMock) {
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
	}
	expect(page.errors).toEqual([]);
});
