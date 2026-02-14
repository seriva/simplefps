import { vec3 } from "../../dependencies/gl-matrix.js";
import BoundingBox from "./boundingbox.js";
import { Octree } from "./octree.js";

const computeNormals_n = vec3.create();
const va = vec3.create();
const vb = vec3.create();
const vc = vec3.create();
const ab = vec3.create();
const cb = vec3.create();

class Trimesh {
    constructor(vertices, indices) {
        this.id = Trimesh.idCounter++;

        this.vertices = new Float32Array(vertices);
        this.indices = new Int16Array(indices);
        this.normals = new Float32Array(indices.length);
        this.aabb = new BoundingBox();
        this.scale = vec3.fromValues(1, 1, 1);
        this.tree = new Octree();

        this.updateNormals();
        this.computeLocalAABB(this.aabb);
        this.updateTree();
    }

    updateTree() {
        const tree = this.tree;
        tree.reset();
        tree.aabb.copy(this.aabb);
        const scale = this.scale;

        tree.aabb.min[0] *= 1 / scale[0];
        tree.aabb.min[1] *= 1 / scale[1];
        tree.aabb.min[2] *= 1 / scale[2];
        tree.aabb.max[0] *= 1 / scale[0];
        tree.aabb.max[1] *= 1 / scale[1];
        tree.aabb.max[2] *= 1 / scale[2];

        const triangleAABB = new BoundingBox();
        const a = vec3.create();
        const b = vec3.create();
        const c = vec3.create();
        const points = [a, b, c];

        for (let i = 0; i < this.indices.length / 3; i++) {
            const i3 = i * 3;
            this._getUnscaledVertex(this.indices[i3], a);
            this._getUnscaledVertex(this.indices[i3 + 1], b);
            this._getUnscaledVertex(this.indices[i3 + 2], c);
            triangleAABB.setFromPoints(points);
            tree.insert(triangleAABB, i);
        }
        tree.removeEmptyNodes();
    }

    updateNormals() {
        const n = computeNormals_n;
        const normals = this.normals;

        for (let i = 0; i < this.indices.length / 3; i++) {
            const i3 = i * 3;
            const a = this.indices[i3];
            const b = this.indices[i3 + 1];
            const c = this.indices[i3 + 2];
            this.getVertex(a, va);
            this.getVertex(b, vb);
            this.getVertex(c, vc);
            Trimesh.computeNormal(vb, va, vc, n);
            normals[i3] = n[0];
            normals[i3 + 1] = n[1];
            normals[i3 + 2] = n[2];
        }
    }

    getNormal(i, target) {
        const i3 = i * 3;
        vec3.set(
            target,
            this.normals[i3],
            this.normals[i3 + 1],
            this.normals[i3 + 2],
        );
        return target;
    }

    getVertex(i, out) {
        const scale = this.scale;
        this._getUnscaledVertex(i, out);
        out[0] *= scale[0];
        out[1] *= scale[1];
        out[2] *= scale[2];
        return out;
    }

    _getUnscaledVertex(i, out) {
        const i3 = i * 3;
        vec3.set(
            out,
            this.vertices[i3],
            this.vertices[i3 + 1],
            this.vertices[i3 + 2],
        );
        return out;
    }

    computeLocalAABB(aabb) {
        const l = aabb.min;
        const u = aabb.max;
        const n = this.vertices.length;
        const vertices = this.vertices;
        const s = this.scale;

        vec3.set(l, Infinity, Infinity, Infinity);
        vec3.set(u, -Infinity, -Infinity, -Infinity);

        for (let i = 0; i < n; i += 3) {
            const x = vertices[i] * s[0];
            const y = vertices[i + 1] * s[1];
            const z = vertices[i + 2] * s[2];

            if (x < l[0]) l[0] = x;
            if (x > u[0]) u[0] = x;
            if (y < l[1]) l[1] = y;
            if (y > u[1]) u[1] = y;
            if (z < l[2]) l[2] = z;
            if (z > u[2]) u[2] = z;
        }
    }

    static computeNormal(va, vb, vc, target) {
        vec3.sub(ab, vb, va);
        vec3.sub(cb, vc, vb);
        vec3.cross(target, cb, ab);
        if (vec3.length(target) > 0) {
            vec3.normalize(target, target);
        }
    }
}

Trimesh.idCounter = 0;

export { Trimesh };

