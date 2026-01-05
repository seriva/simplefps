import Settings from "../core/settings.js";
import Console from "../systems/console.js";
import { getBackend, gl } from "./context.js";

// We import gl from context.js to access constants like REPEAT, CLAMP_TO_EDGE, etc.
// These constants are passed to the backend, which (in WebGLBackend case) understands them directly.
// For WebGPU, the backend would need to map these constants or we'd refactor to use string constants.

class Texture {
	constructor(data) {
		this._handle = null;
		this.init(data);
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
			this._handle = getBackend().createTexture({
				width: 1,
				height: 1,
				// format defaults to RGBA, type to UNSIGNED_BYTE
				mutable: true,
			});

			this.loadImageTexture(data.data);
		} else {
			// Render texture case
			// data contains format, width, height, etc.
			this._handle = getBackend().createTexture(data);
			getBackend().setTextureWrapMode(this._handle, "clamp-to-edge");
		}
	}

	// Static helper to set params - handled by backend methods now, but kept for compatibility if called externally?
	// Existing code calls Texture.setTextureParameters(true/false).
	// We'll leave it as a no-op or deprecated since backend handles defaults in createTexture.
	static setTextureParameters(_isImage) {
		// Handled by backend creation logic + generateMipmaps
	}

	loadImageTexture(imageData) {
		const image = new Image();
		image.onload = () => {
			if (!this._handle) return; // Disposed?

			// Upload image data (this updates the texture content and might resize usage in WebGL)
			getBackend().uploadTextureFromImage(this._handle, image);

			// Generate mipmaps
			getBackend().generateMipmaps(this._handle);

			// Apply settings
			getBackend().setTextureWrapMode(this._handle, "repeat");

			if (Settings.anisotropicFiltering > 1) {
				getBackend().setTextureAnisotropy(
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
			getBackend().bindTexture(this._handle, unit);
		}
	}

	static unBind(unit) {
		getBackend().unbindTexture(unit);
	}

	static unBindRange(startUnit, count) {
		for (let i = 0; i < count; i++) {
			getBackend().unbindTexture(startUnit + i);
		}
	}

	setTextureWrapMode(mode) {
		if (!this._handle) return;

		// Map GL constants to backend strings
		let stringMode = "repeat";
		if (mode === gl.CLAMP_TO_EDGE) stringMode = "clamp-to-edge";
		else if (mode === gl.MIRRORED_REPEAT) stringMode = "mirrored-repeat";

		getBackend().setTextureWrapMode(this._handle, stringMode);
	}

	dispose() {
		if (this._handle) {
			getBackend().disposeTexture(this._handle);
			this._handle = null;
		}
	}
}

export default Texture;
