import Settings from "../core/settings.js";
import Console from "../systems/console.js";
import { Backend } from "./backend.js";

class Texture {
	constructor(data) {
		this._handle = null;
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
			Backend.setTextureWrapMode(this._handle, "repeat");

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
		if (!this._handle) return;
		Backend.setTextureWrapMode(this._handle, mode);
	}

	dispose() {
		if (this._handle) {
			Backend.disposeTexture(this._handle);
			this._handle = null;
		}
	}
}

export default Texture;
