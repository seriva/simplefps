import Settings from "../core/settings.js";
import Console from "../systems/console.js";
import { afExt, gl } from "./context.js";

// Private cached GL constants
const {
	TEXTURE_2D: _TEXTURE_2D,
	RGBA: _RGBA,
	UNSIGNED_BYTE: _UNSIGNED_BYTE,
	LINEAR: _LINEAR,
	LINEAR_MIPMAP_LINEAR: _LINEAR_MIPMAP_LINEAR,
	NEAREST: _NEAREST,
	TEXTURE_MAG_FILTER: _TEXTURE_MAG_FILTER,
	TEXTURE_MIN_FILTER: _TEXTURE_MIN_FILTER,
	TEXTURE_WRAP_S: _TEXTURE_WRAP_S,
	TEXTURE_WRAP_T: _TEXTURE_WRAP_T,
	CLAMP_TO_EDGE: _CLAMP_TO_EDGE,
	REPEAT: _REPEAT,
	UNPACK_FLIP_Y_WEBGL: _UNPACK_FLIP_Y_WEBGL,
} = gl;

class Texture {
	constructor(data) {
		// Delete existing texture if any
		if (this.texture) gl.deleteTexture(this.texture);

		this.texture = gl.createTexture();
		this.init(data);
	}

	init(data) {
		gl.bindTexture(_TEXTURE_2D, this.texture);

		// Default black texture
		gl.texImage2D(
			_TEXTURE_2D,
			0,
			_RGBA,
			1,
			1,
			0,
			_RGBA,
			_UNSIGNED_BYTE,
			new Uint8Array([0, 0, 0, 255]),
		);

		if (data.data) {
			this.loadImageTexture(data.data);
		} else {
			this.createRenderTexture(data);
		}
	}

	static setTextureParameters(isImage) {
		const filterType = isImage ? _LINEAR : _NEAREST;
		gl.texParameteri(_TEXTURE_2D, _TEXTURE_MAG_FILTER, filterType);
		gl.texParameteri(
			_TEXTURE_2D,
			_TEXTURE_MIN_FILTER,
			isImage ? _LINEAR_MIPMAP_LINEAR : filterType,
		);
	}

	loadImageTexture(imageData) {
		const image = new Image();
		image.onload = () => {
			gl.bindTexture(_TEXTURE_2D, this.texture);
			gl.texImage2D(_TEXTURE_2D, 0, _RGBA, _RGBA, _UNSIGNED_BYTE, image);

			// Set texture parameters
			Texture.setTextureParameters(true);

			// Apply anisotropic filtering if available
			if (afExt) {
				const maxAniso = gl.getParameter(afExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
				const af = Math.min(
					Math.max(Settings.anisotropicFiltering, 1),
					maxAniso,
				);
				gl.texParameterf(_TEXTURE_2D, afExt.TEXTURE_MAX_ANISOTROPY_EXT, af);
			}

			gl.generateMipmap(_TEXTURE_2D);
			// Use REPEAT mode for tiled textures (UVs can go outside 0-1 range)
			this.setTextureWrapMode(_REPEAT);
			gl.bindTexture(_TEXTURE_2D, null);

			URL.revokeObjectURL(image.src); // Clean up the blob URL
		};

		image.onerror = () => {
			Console.error("Failed to load texture image");
			gl.bindTexture(_TEXTURE_2D, null);
		};
		image.src = URL.createObjectURL(imageData);
	}

	createRenderTexture(data) {
		gl.bindTexture(_TEXTURE_2D, this.texture);
		gl.pixelStorei(_UNPACK_FLIP_Y_WEBGL, false);

		// Set texture parameters
		Texture.setTextureParameters(false);

		gl.texStorage2D(_TEXTURE_2D, 1, data.format, data.width, data.height);

		if (data.pdata && data.ptype && data.pformat) {
			gl.texSubImage2D(
				_TEXTURE_2D,
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

		this.setTextureWrapMode(_CLAMP_TO_EDGE);
	}

	bind(unit) {
		gl.activeTexture(unit);
		gl.bindTexture(_TEXTURE_2D, this.texture);
	}

	static unBind(unit) {
		gl.activeTexture(unit);
		gl.bindTexture(_TEXTURE_2D, null);
	}

	static unBindRange(startUnit, count) {
		for (let i = 0; i < count; i++) {
			gl.activeTexture(startUnit + i);
			gl.bindTexture(_TEXTURE_2D, null);
		}
	}

	setTextureWrapMode(mode) {
		gl.bindTexture(_TEXTURE_2D, this.texture);
		gl.texParameteri(_TEXTURE_2D, _TEXTURE_WRAP_S, mode);
		gl.texParameteri(_TEXTURE_2D, _TEXTURE_WRAP_T, mode);
		gl.bindTexture(_TEXTURE_2D, null);
	}

	dispose() {
		if (this.texture) {
			gl.deleteTexture(this.texture);
			this.texture = null;
		}
	}
}

export default Texture;
