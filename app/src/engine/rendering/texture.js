import { Console } from "../systems/console.js";
import { Settings } from "../systems/settings.js";
import { Backend } from "./backend.js";

class Texture {
	_handle = null;

	constructor(data) {
		this.filter = data.filter;
		this.wrap = data.wrap;
		this.init(data);
	}

	// Public accessor for the backend handle (opaque to the user)
	getHandle() {
		return this._handle;
	}

	init(data) {
		if (this._handle) {
			this.dispose();
		}

		if (data.data) {
			// Image texture case
			// Create a 1x1 mutable placeholder (defaults to black)
			this._handle = Backend.createTexture({
				width: 1,
				height: 1,
				// format defaults to RGBA, type to UNSIGNED_BYTE
				mutable: true,
			});

			this.loadImageTexture(data.data);
		} else {
			// Render texture case
			// data contains format, width, height, etc.
			this._handle = Backend.createTexture(data);
			Backend.setTextureWrapMode(this._handle, "clamp-to-edge");
		}
	}

	static createSolidColor(r, g, b, a = 255) {
		const texture = new Texture({});
		texture.dispose(); // Free the texture allocated by init({})
		texture._handle = Backend.createTexture({
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
			if (!this._handle) return; // Disposed?

			// Upload image data (this updates the texture content and might resize usage in WebGL)
			await Backend.uploadTextureFromImage(this._handle, image);

			// Generate mipmaps
			Backend.generateMipmaps(this._handle);

			// Apply settings
			const wrapMode = this.wrap || "repeat";
			Backend.setTextureWrapMode(this._handle, wrapMode);

			if (this.filter) {
				this.setFilter(
					this.filter.min || "linear",
					this.filter.mag || "linear",
					this.filter.mip || "linear",
				);
			}

			if (Settings.anisotropicFiltering > 1) {
				Backend.setTextureAnisotropy(
					this._handle,
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
		if (this._handle) {
			Backend.bindTexture(this._handle, unit);
		}
	}

	setTextureWrapMode(mode) {
		this.wrap = mode;
		if (!this._handle) return;
		Backend.setTextureWrapMode(this._handle, mode);
	}

	setFilter(min, mag, mip = "linear") {
		this.filter = { min, mag, mip };
		if (!this._handle) return;
		Backend.setTextureFilter(this._handle, min, mag, mip);
	}

	dispose() {
		if (this._handle) {
			Backend.disposeTexture(this._handle);
			this._handle = null;
		}
	}
}

export { Texture };
