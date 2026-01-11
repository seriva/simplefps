import Settings from "../core/settings.js";
import Console from "../systems/console.js";
import { Backend } from "./backend.js";

// We import gl from backend.js to access constants like REPEAT, CLAMP_TO_EDGE, etc.
// These constants are passed to the backend, which (in WebGLBackend case) understands them directly.
// For WebGPU, the backend would need to map these constants or we'd refactor to use string constants.

class Texture {
	constructor(data) {
		this._handle = null;
		this.init(data);
	}

	// Public accessor for the backend handle (opaque to the user)
	getHandle() {
		return this._handle;
	}

	// Backward compatibility: expose the raw GL texture (if supported by backend)
	get texture() {
		return this._handle ? this._handle._glTexture : null;
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

	// Static helper to set params - handled by backend methods now, but kept for compatibility if called externally?
	// Existing code calls Texture.setTextureParameters(true/false).
	// We'll leave it as a no-op or deprecated since backend handles defaults in createTexture.
	static setTextureParameters(_isImage) {
		// Handled by backend creation logic + generateMipmaps
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

	createRenderTexture(_data) {
		// Deprecated: logic moved to init.
		// Kept only if external callers use it, but usage seems internal to old init().
	}

	bind(unit) {
		if (this._handle) {
			Backend.bindTexture(this._handle, unit);
		}
	}

	static unBind(unit) {
		Backend.unbindTexture(unit);
	}

	static unBindRange(startUnit, count) {
		for (let i = 0; i < count; i++) {
			Backend.unbindTexture(startUnit + i);
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
