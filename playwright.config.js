import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "tests/e2e",
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 2 : 0,
	timeout: 60000,
	reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
	use: {
		baseURL: "http://localhost:3131",
		trace: "on-first-retry",
		actionTimeout: 10000,
		viewport: { width: 1280, height: 720 },
		launchOptions: {
			// Headless Chromium has no WebGPU; force a software GL context so the
			// WebGL2 backend can render.
			args: [
				"--use-gl=angle",
				"--use-angle=swiftshader",
				"--ignore-gpu-blocklist",
			],
		},
	},
	webServer: {
		command: "npx gofront dev --port 3131",
		port: 3131,
		reuseExistingServer: !process.env.CI,
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
