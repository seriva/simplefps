import { mat4, vec3 } from "../dependencies/gl-matrix.js";
import { gl } from "./context.js";
import { Shaders } from "./shaders.js";

class BoundingBox {
    static #boxBuffer = null;
    static #boxVertices = [
        // Front face
        -0.5, -0.5, 0.5,  0.5, -0.5, 0.5,
        0.5, -0.5, 0.5,   0.5,  0.5, 0.5,
        0.5,  0.5, 0.5,  -0.5,  0.5, 0.5,
        -0.5,  0.5, 0.5, -0.5, -0.5, 0.5,
        
        // Back face
        -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,
        0.5, -0.5, -0.5,   0.5,  0.5, -0.5,
        0.5,  0.5, -0.5,  -0.5,  0.5, -0.5,
        -0.5,  0.5, -0.5, -0.5, -0.5, -0.5,
        
        // Connecting lines
        -0.5, -0.5, -0.5, -0.5, -0.5,  0.5,
        0.5, -0.5, -0.5,  0.5, -0.5,  0.5,
        0.5,  0.5, -0.5,  0.5,  0.5,  0.5,
        -0.5,  0.5, -0.5, -0.5,  0.5,  0.5,
    ];

    constructor(min, max) {
        this.min = vec3.clone(min);
        this.max = vec3.clone(max);
        this.updateDerivedData();
        this.initializeBuffer();
    }

    static fromPoints(points) {
        const min = vec3.fromValues(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY , Number.POSITIVE_INFINITY );
        const max = vec3.fromValues(-Number.POSITIVE_INFINITY , -Number.POSITIVE_INFINITY , -Number.POSITIVE_INFINITY );

        for (let i = 0; i < points.length; i += 3) {
            const x = points[i];
            const y = points[i + 1];
            const z = points[i + 2];

            min[0] = Math.min(min[0], x);
            min[1] = Math.min(min[1], y);
            min[2] = Math.min(min[2], z);

            max[0] = Math.max(max[0], x);
            max[1] = Math.max(max[1], y);
            max[2] = Math.max(max[2], z);
        }

        return new BoundingBox(min, max);
    }

    static combine(boxA, boxB) {
        if (!boxA) return boxB;
        if (!boxB) return boxA;

        const min = vec3.create();
        const max = vec3.create();

        for (let i = 0; i < 3; i++) {
            min[i] = Math.min(boxA.min[i], boxB.min[i]);
            max[i] = Math.max(boxA.max[i], boxB.max[i]);
        }

        return new BoundingBox(min, max);
    }

    updateDerivedData() {
        // Calculate center and dimensions
        this.center = vec3.scale(vec3.create(), vec3.add(vec3.create(), this.min, this.max), 0.5);
        this.dimensions = vec3.subtract(vec3.create(), this.max, this.min);
    }

    transform(matrix) {
        const corners = [
            vec3.fromValues(this.min[0], this.min[1], this.min[2]),
            vec3.fromValues(this.max[0], this.min[1], this.min[2]),
            vec3.fromValues(this.min[0], this.max[1], this.min[2]),
            vec3.fromValues(this.max[0], this.max[1], this.min[2]),
            vec3.fromValues(this.min[0], this.min[1], this.max[2]),
            vec3.fromValues(this.max[0], this.min[1], this.max[2]),
            vec3.fromValues(this.min[0], this.max[1], this.max[2]),
            vec3.fromValues(this.max[0], this.max[1], this.max[2]),
        ];

        const transformedMin = vec3.fromValues(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        const transformedMax = vec3.fromValues(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

        for (const corner of corners) {
            vec3.transformMat4(corner, corner, matrix);

            for (let i = 0; i < 3; i++) {
                transformedMin[i] = Math.min(transformedMin[i], corner[i]);
                transformedMax[i] = Math.max(transformedMax[i], corner[i]);
            }
        }

        return new BoundingBox(transformedMin, transformedMax);
    }

    initializeBuffer() {
        if (!BoundingBox.#boxBuffer) {
            BoundingBox.#boxBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, BoundingBox.#boxBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(BoundingBox.#boxVertices), gl.STATIC_DRAW);
            BoundingBox.#boxBuffer.itemSize = 3;
            BoundingBox.#boxBuffer.numItems = BoundingBox.#boxVertices.length / 3;
        }
    }

    render() {
        // Create matrix that scales and positions the unit cube to match the bounding box
        const boxMatrix = mat4.create();
        mat4.translate(boxMatrix, boxMatrix, this.center);
        mat4.scale(boxMatrix, boxMatrix, this.dimensions);

        // Set world matrix only
        Shaders.boundingBox.setMat4("matWorld", boxMatrix);

        // Render the box as lines
        gl.bindBuffer(gl.ARRAY_BUFFER, BoundingBox.#boxBuffer);
        gl.vertexAttribPointer(0, BoundingBox.#boxBuffer.itemSize, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
        gl.drawArrays(gl.LINES, 0, BoundingBox.#boxBuffer.numItems);
        gl.disableVertexAttribArray(0);
    }

    static dispose() {
        if (BoundingBox.#boxBuffer) {
            gl.deleteBuffer(BoundingBox.#boxBuffer);
            BoundingBox.#boxBuffer = null;
        }
    }
}

export default BoundingBox;
