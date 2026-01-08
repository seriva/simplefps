import Console from "../systems/console.js";

const Utils = {
	isMobile() {
		if (navigator.userAgentData?.mobile !== undefined) {
			return navigator.userAgentData.mobile;
		}
		return (
			window.matchMedia("(max-width: 768px)").matches ||
			/Mobi|Android/i.test(navigator.userAgent)
		);
	},

	async fetch(path) {
		const response = await fetch(path).catch((error) => {
			Console.error(`Fetch error for ${path}:`, error);
			throw error;
		});

		if (!response?.ok) {
			throw new Error(`HTTP error! status: ${response.status} for ${path}`);
		}

		return path.includes("webp") || path.includes("bmesh")
			? await response.blob()
			: await response.text();
	},

	dispatchEvent(event) {
		window?.dispatchEvent(new Event(event));
	},

	dispatchCustomEvent(event, detail) {
		window?.dispatchEvent(new CustomEvent(event, { detail }));
	},

	download(data, filename, type) {
		const url = URL.createObjectURL(new Blob([data], { type }));
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.style.display = "none";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	},

	wait(ms = 100) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	},
};

export default Utils;
