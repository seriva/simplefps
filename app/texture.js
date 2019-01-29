import Renderer from './renderer';
import Settings from './settings';

const gl = Renderer.gl;

class Texture {
    constructor(data) {
        const t = this;
        gl.deleteTexture(t.texture);
        t.texture = gl.createTexture();

        if (data.data != null) {
            // Create a texture from a file
            const image = new Image();
            image.onload = () => {
                gl.bindTexture(gl.TEXTURE_2D, t.texture);
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.RGBA,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    image
                );
                // Trilinear filtering
                gl.texParameteri(
                    gl.TEXTURE_2D,
                    gl.TEXTURE_MAG_FILTER,
                    gl.LINEAR
                );
                gl.texParameteri(
                    gl.TEXTURE_2D,
                    gl.TEXTURE_MIN_FILTER,
                    gl.LINEAR_MIPMAP_LINEAR
                );

                // Anisotropic filtering
                if (Renderer.afExt) {
                    const af = Math.min(
                        Math.max(Settings.anisotropicFiltering, 1),
                        gl.getParameter(
                            Renderer.afExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT
                        )
                    );
                    gl.texParameterf(
                        gl.TEXTURE_2D,
                        Renderer.afExt.TEXTURE_MAX_ANISOTROPY_EXT,
                        af
                    );
                }

                // Generate mipmaps
                gl.generateMipmap(gl.TEXTURE_2D);
                t.setTextureWrapMode(gl.REPEAT);
                gl.bindTexture(gl.TEXTURE_2D, null);
            };
            const blob = new Blob([new Uint8Array(data.data)], {
                type: 'image/jpeg'
            });
            const imageUrl = window.URL.createObjectURL(blob);
            image.src = imageUrl;
        } else {
            // Create a render target texture or texture from data
            gl.bindTexture(gl.TEXTURE_2D, t.texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texStorage2D(
                gl.TEXTURE_2D,
                1,
                data.format,
                data.width,
                data.height
            );
            if (
                data.pdata != null &&
                data.ptype != null &&
                data.pformat != null
            ) {
                gl.texSubImage2D(
                    gl.TEXTURE_2D,
                    0,
                    0,
                    0,
                    data.width,
                    data.height,
                    data.pformat,
                    data.ptype,
                    data.pdata
                );
            }
            t.setTextureWrapMode(gl.CLAMP_TO_EDGE);
        }
    }

    bind(unit) {
        gl.activeTexture(unit);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
    }

    unBind() {
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    setTextureWrapMode(mode) {
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mode);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, mode);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
}

export { Texture as default };
