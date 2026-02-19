import Console from "../systems/console.js";
import Settings from "../systems/settings.js";
import { Backend } from "./backend.js";

class Texture {
	#handle = null;

	constructor(data) {
		this.init(data);
	}

	// Public accessor for the backend handle (opaque to the user)
	getHandle() {
		return this.#handle;
	}

	init(data) {
		if (this.#handle) {
			this.dispose();
		}

		if (data.data) {
			// Image texture case
			// Create a 1x1 mutable placeholder (defaults to black)
			this.#handle = Backend.createTexture({
				width: 1,
				height: 1,
				// format defaults to RGBA, type to UNSIGNED_BYTE
				mutable: true,
			});

			this.loadImageTexture(data.data);
		} else {
			// Render texture case
			// data contains format, width, height, etc.
			this.#handle = Backend.createTexture(data);
			Backend.setTextureWrapMode(this.#handle, "clamp-to-edge");
		}
	}

	static createSolidColor(r, g, b, a = 255) {
		const texture = new Texture({});
		texture.dispose(); // Free the texture allocated by init({})
		texture.#handle = Backend.createTexture({
			width: 1,
			height: 1,
			mutable: true,
			pdata: new Uint8Array([r, g, b, a]),
		});
		return texture;
	}

	static unBind(unit) {
		Backend.unbindTexture(unit);
	}

	static unBindRange(start, count) {
		for (let i = 0; i < count; i++) {
			Backend.unbindTexture(start + i);
		}
	}

	loadImageTexture(imageData) {
		const image = new Image();
		image.onload = async () => {
			if (!this.#handle) return; // Disposed?

			// Upload image data (this updates the texture content and might resize usage in WebGL)
			await Backend.uploadTextureFromImage(this.#handle, image);

			// Generate mipmaps
			Backend.generateMipmaps(this.#handle);

			// Apply settings
			Backend.setTextureWrapMode(this.#handle, "repeat");

			if (Settings.anisotropicFiltering > 1) {
				Backend.setTextureAnisotropy(
					this.#handle,
					Settings.anisotropicFiltering,
				);
			}

			URL.revokeObjectURL(image.src); // Clean up the blob URL
		};

		image.onerror = () => {
			Console.error("Failed to load texture image");
		};
		image.src = URL.createObjectURL(imageData);
	}

	bind(unit) {
		if (this.#handle) {
			Backend.bindTexture(this.#handle, unit);
		}
	}

	setTextureWrapMode(mode) {
		if (!this.#handle) return;
		Backend.setTextureWrapMode(this.#handle, mode);
	}

	dispose() {
		if (this.#handle) {
			Backend.disposeTexture(this.#handle);
			this.#handle = null;
		}
	}
}

export default Texture;
