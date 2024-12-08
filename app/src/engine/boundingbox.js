import { mat4, vec3 } from "../dependencies/gl-matrix.js";
import Camera from "./camera.js";
import { gl } from "./context.js";
import { Shaders } from "./shaders.js";

class BoundingBox {
    static #vectorPool = Array(16).fill().map(() => vec3.create());
    static #poolIndex = 0;
    static #boxBuffer = null;
    static #boxVertices = [
        // Front face
        -0.5, -0.5,  0.5,    0.5, -0.5,  0.5,
         0.5, -0.5,  0.5,    0.5,  0.5,  0.5,
         0.5,  0.5,  0.5,   -0.5,  0.5,  0.5,
        -0.5,  0.5,  0.5,   -0.5, -0.5,  0.5,
        
        // Back face
        -0.5, -0.5, -0.5,    0.5, -0.5, -0.5,
         0.5, -0.5, -0.5,    0.5,  0.5, -0.5,
         0.5,  0.5, -0.5,   -0.5,  0.5, -0.5,
        -0.5,  0.5, -0.5,   -0.5, -0.5, -0.5,
        
        // Connecting edges
        -0.5, -0.5, -0.5,   -0.5, -0.5,  0.5,
         0.5, -0.5, -0.5,    0.5, -0.5,  0.5,
         0.5,  0.5, -0.5,    0.5,  0.5,  0.5,
        -0.5,  0.5, -0.5,   -0.5,  0.5,  0.5,
    ];

    #center = vec3.create();
    #dimensions = vec3.create();
    #min;
    #max;

    static #getVector() {
        const vector = BoundingBox.#vectorPool[BoundingBox.#poolIndex];
        BoundingBox.#poolIndex = (BoundingBox.#poolIndex + 1) % BoundingBox.#vectorPool.length;
        return vector;
    }

    static fromPoints(points) {
        const min = vec3.fromValues(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        const max = vec3.fromValues(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

        for (let i = 0; i < points.length; i += 3) {
            vec3.min(min, min, vec3.fromValues(points[i], points[i + 1], points[i + 2]));
            vec3.max(max, max, vec3.fromValues(points[i], points[i + 1], points[i + 2]));
        }

        return new BoundingBox(min, max);
    }

    static dispose() {
        if (BoundingBox.#boxBuffer) {
            gl.deleteBuffer(BoundingBox.#boxBuffer);
            BoundingBox.#boxBuffer = null;
        }
    }

    constructor(min, max) {
        this.#min = vec3.clone(min);
        this.#max = vec3.clone(max);
        this.#updateCachedValues();
        this.#initializeBuffer();
    }

    #updateCachedValues() {
        vec3.add(this.#center, this.#min, this.#max);
        vec3.scale(this.#center, this.#center, 0.5);
        vec3.subtract(this.#dimensions, this.#max, this.#min);
    }

    #initializeBuffer() {
        if (!BoundingBox.#boxBuffer) {
            BoundingBox.#boxBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, BoundingBox.#boxBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(BoundingBox.#boxVertices), gl.STATIC_DRAW);
            BoundingBox.#boxBuffer.itemSize = 3;
            BoundingBox.#boxBuffer.numItems = BoundingBox.#boxVertices.length / 3;
        }
    }

    get min() { return this.#min; }
    get max() { return this.#max; }
    get center() { return this.#center; }
    get dimensions() { return this.#dimensions; }

    transform(matrix) {
        const transformedMin = BoundingBox.#getVector();
        const transformedMax = BoundingBox.#getVector();
        vec3.set(transformedMin, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        vec3.set(transformedMax, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

        const corner = BoundingBox.#getVector();
        
        for (let i = 0; i < 8; i++) {
            vec3.set(corner,
                (i & 1) ? this.#max[0] : this.#min[0],
                (i & 2) ? this.#max[1] : this.#min[1],
                (i & 4) ? this.#max[2] : this.#min[2]
            );
            
            vec3.transformMat4(corner, corner, matrix);
            vec3.min(transformedMin, transformedMin, corner);
            vec3.max(transformedMax, transformedMax, corner);
        }

        return new BoundingBox(transformedMin, transformedMax);
    }

    isVisible() {
        const p = BoundingBox.#getVector();
        const n = BoundingBox.#getVector();
        
        for (const plane of Object.values(Camera.frustumPlanes)) {
            vec3.set(p,
                plane[0] > 0 ? this.#max[0] : this.#min[0],
                plane[1] > 0 ? this.#max[1] : this.#min[1],
                plane[2] > 0 ? this.#max[2] : this.#min[2]
            );
            
            vec3.set(n,
                plane[0] > 0 ? this.#min[0] : this.#max[0],
                plane[1] > 0 ? this.#min[1] : this.#max[1],
                plane[2] > 0 ? this.#min[2] : this.#max[2]
            );

            if (vec3.dot(p, plane) + plane[3] < 0 && vec3.dot(n, plane) + plane[3] < 0) {
                return false;
            }
        }
        
        return true;
    }

    render() {
        const boxMatrix = mat4.create();
        mat4.translate(boxMatrix, boxMatrix, this.#center);
        mat4.scale(boxMatrix, boxMatrix, this.#dimensions);

        Shaders.debug.setMat4("matWorld", boxMatrix);

        gl.bindBuffer(gl.ARRAY_BUFFER, BoundingBox.#boxBuffer);
        gl.vertexAttribPointer(0, BoundingBox.#boxBuffer.itemSize, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
        gl.drawArrays(gl.LINES, 0, BoundingBox.#boxBuffer.numItems);
        gl.disableVertexAttribArray(0);
    }
}

export default BoundingBox;
