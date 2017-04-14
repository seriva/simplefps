class Texture {
    constructor(path, engine, onSuccess, onError) {
        const t = this;
        const p = path;
        const e = t.e = engine;
        const gl = t.gl = e.renderer.gl;

        t.texture = gl.createTexture();

        const image = new Image();
        image.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, t.texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage2D(
                gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
                gl.UNSIGNED_BYTE,
                image
            );
            gl.bindTexture(gl.TEXTURE_2D, null);
            onSuccess(p);
        };
        image.onerror = () => {
            onError(p);
        };
        image.src = p;
    }

    bind(unit) {
        const gl = this.gl;
        gl.activeTexture(unit);
        gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    }

    unbind() {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
}

export { Texture as default };
