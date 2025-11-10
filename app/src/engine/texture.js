import { afExt, gl } from "./context.js";
import Settings from "./settings.js";

// Cache frequently used GL constants
const {
	TEXTURE_2D,
	RGBA,
	UNSIGNED_BYTE,
	LINEAR,
	LINEAR_MIPMAP_LINEAR,
	NEAREST,
	TEXTURE_MAG_FILTER,
	TEXTURE_MIN_FILTER,
	TEXTURE_WRAP_S,
	TEXTURE_WRAP_T,
	CLAMP_TO_EDGE,
	REPEAT,
	UNPACK_FLIP_Y_WEBGL,
} = gl;

class Texture {
	constructor(data) {
		// Delete existing texture if any
		if (this.texture) gl.deleteTexture(this.texture);

		this.texture = gl.createTexture();
		this.init(data);
	}

	init(data) {
		gl.bindTexture(TEXTURE_2D, this.texture);

		// Default black texture
		gl.texImage2D(
			TEXTURE_2D,
			0,
			RGBA,
			1,
			1,
			0,
			RGBA,
			UNSIGNED_BYTE,
			new Uint8Array([0, 0, 0, 255]),
		);

		if (data.data) {
			this.loadImageTexture(data.data);
		} else {
			this.createRenderTexture(data);
		}
	}

	static setTextureParameters(isImage) {
		const filterType = isImage ? LINEAR : NEAREST;
		gl.texParameteri(TEXTURE_2D, TEXTURE_MAG_FILTER, filterType);
		gl.texParameteri(
			TEXTURE_2D,
			TEXTURE_MIN_FILTER,
			isImage ? LINEAR_MIPMAP_LINEAR : filterType,
		);
	}

	loadImageTexture(imageData) {
		const image = new Image();
		image.onload = () => {
			gl.bindTexture(TEXTURE_2D, this.texture);
			gl.texImage2D(TEXTURE_2D, 0, RGBA, RGBA, UNSIGNED_BYTE, image);

			// Set texture parameters
			Texture.setTextureParameters(true);

			// Apply anisotropic filtering if available
			if (afExt) {
				const maxAniso = gl.getParameter(afExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
				const af = Math.min(
					Math.max(Settings.anisotropicFiltering, 1),
					maxAniso,
				);
				gl.texParameterf(TEXTURE_2D, afExt.TEXTURE_MAX_ANISOTROPY_EXT, af);
			}

			gl.generateMipmap(TEXTURE_2D);
			// Use REPEAT mode for tiled textures (UVs can go outside 0-1 range)
			this.setTextureWrapMode(REPEAT);
			gl.bindTexture(TEXTURE_2D, null);

			URL.revokeObjectURL(image.src); // Clean up the blob URL
		};

		image.onerror = () => {
			console.error("Failed to load texture");
			gl.bindTexture(TEXTURE_2D, null);
		};

		image.src = URL.createObjectURL(imageData);
	}

	createRenderTexture(data) {
		gl.bindTexture(TEXTURE_2D, this.texture);
		gl.pixelStorei(UNPACK_FLIP_Y_WEBGL, false);

		// Set texture parameters
		Texture.setTextureParameters(false);

		gl.texStorage2D(TEXTURE_2D, 1, data.format, data.width, data.height);

		if (data.pdata && data.ptype && data.pformat) {
			gl.texSubImage2D(
				TEXTURE_2D,
				0,
				0,
				0,
				data.width,
				data.height,
				data.pformat,
				data.ptype,
				data.pdata,
			);
		}

		this.setTextureWrapMode(CLAMP_TO_EDGE);
	}

	bind(unit) {
		gl.activeTexture(unit);
		gl.bindTexture(TEXTURE_2D, this.texture);
	}

	static unBind(unit) {
		gl.activeTexture(unit);
		gl.bindTexture(TEXTURE_2D, null);
	}

	setTextureWrapMode(mode) {
		gl.bindTexture(TEXTURE_2D, this.texture);
		gl.texParameteri(TEXTURE_2D, TEXTURE_WRAP_S, mode);
		gl.texParameteri(TEXTURE_2D, TEXTURE_WRAP_T, mode);
		gl.bindTexture(TEXTURE_2D, null);
	}

	dispose() {
		if (this.texture) {
			gl.deleteTexture(this.texture);
			this.texture = null;
		}
	}
}

export default Texture;
