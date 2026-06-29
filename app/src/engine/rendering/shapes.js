import { Mesh } from "./mesh.js";

// Lazy-initialized meshes - wait for backend before creating
let _skyBox = null;
let _screenQuad = null;
let _spotlightVolume = null;
let _pointLightVolume = null;
let _boundingBox = null;
let _billboardQuad = null;
let _initialized = false;

const _initMeshes = () => {
	if (_initialized) return;
	_initialized = true;

	_skyBox = new Mesh({
		indices: [
			{
				material: "none",
				array: [0, 1, 2, 3, 0, 2],
			},
			{
				material: "none",
				array: [4, 5, 6, 7, 4, 6],
			},
			{
				material: "none",
				array: [8, 9, 10, 11, 8, 10],
			},
			{
				material: "none",
				array: [12, 13, 14, 15, 12, 14],
			},
			{
				material: "none",
				array: [16, 17, 18, 19, 16, 18],
			},
			{
				material: "none",
				array: [20, 21, 22, 23, 20, 22],
			},
		],
		vertices: [
			// Front face
			1, 1, 1, 1, -1, 1, -1, -1, 1, -1, 1, 1,
			// Back face
			1, 1, -1, -1, 1, -1, -1, -1, -1, 1, -1, -1,
			// Top face
			1, 1, 1, -1, 1, 1, -1, 1, -1, 1, 1, -1,
			// Bottom face
			1, -1, 1, 1, -1, -1, -1, -1, -1, -1, -1, 1,
			// Right face
			1, 1, 1, 1, 1, -1, 1, -1, -1, 1, -1, 1,
			// Left face
			-1, 1, 1, -1, -1, 1, -1, -1, -1, -1, 1, -1,
		],
		uvs: [
			// Front face
			0, 0, 0, 1, 1, 1, 1, 0,
			// Back face
			1, 0, 0, 0, 0, 1, 1, 1,
			// Top face
			0, 0, 0, 1, 1, 1, 1, 0,
			// Bottom face
			0, 0, 0, 1, 1, 1, 1, 0,
			// Right face
			1, 0, 0, 0, 0, 1, 1, 1,
			// Left face
			0, 0, 0, 1, 1, 1, 1, 0,
		],
	});

	_screenQuad = new Mesh({
		vertices: [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0],
		indices: [
			{
				array: [0, 1, 2, 2, 1, 3],
				material: "none",
			},
		],
	});

	{
		const SEGMENTS = 32;
		const verts = [0, 0, 0];
		const idx = [];
		for (let i = 0; i < SEGMENTS; i++) {
			const a = (i / SEGMENTS) * Math.PI * 2;
			verts.push(Math.cos(a), Math.sin(a), -1);
		}
		for (let i = 1; i <= SEGMENTS; i++) {
			const next = (i % SEGMENTS) + 1;
			idx.push(1, i, next); // base
			idx.push(0, next, i); // side
		}
		_spotlightVolume = new Mesh({
			vertices: verts,
			indices: [{ array: idx, material: "none" }],
		});
	}

	{
		const RINGS = 9;
		const SEGS = 8;
		const verts = [0, 1, 0]; // north pole = vertex 0
		const idx = [];
		for (let r = 1; r <= RINGS; r++) {
			const phi = (r / (RINGS + 1)) * Math.PI;
			const y = Math.cos(phi);
			const rr = Math.sin(phi);
			for (let s = 0; s < SEGS; s++) {
				const theta = (s / SEGS) * Math.PI * 2;
				verts.push(rr * Math.cos(theta), y, rr * Math.sin(theta));
			}
		}
		verts.push(0, -1, 0); // south pole
		const south = 1 + RINGS * SEGS;
		// top cap
		for (let s = 0; s < SEGS; s++) {
			idx.push(0, 1 + s, 1 + ((s + 1) % SEGS));
		}
		// rings
		for (let r = 0; r < RINGS - 1; r++) {
			const base = 1 + r * SEGS;
			for (let s = 0; s < SEGS; s++) {
				const a = base + s,
					b = base + ((s + 1) % SEGS);
				const c = a + SEGS,
					d = b + SEGS;
				idx.push(a, b, d, a, d, c);
			}
		}
		// bottom cap
		const lastRing = 1 + (RINGS - 1) * SEGS;
		for (let s = 0; s < SEGS; s++) {
			idx.push(south, lastRing + ((s + 1) % SEGS), lastRing + s);
		}
		_pointLightVolume = new Mesh({
			vertices: verts,
			indices: [{ material: "none", array: idx }],
		});
	}

	_boundingBox = new Mesh({
		vertices: [
			// Front face
			-0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
			0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5,

			// Back face
			-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
			0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5,

			// Connecting edges
			-0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5,
			0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5,
		],
		indices: [
			{
				array: Array.from({ length: 24 }, (_, i) => i),
				material: "none",
			},
		],
	});

	_billboardQuad = new Mesh({
		vertices: [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0],
		uvs: [0, 1, 1, 1, 0, 0, 1, 0],
		indices: [
			{
				array: [0, 1, 2, 2, 1, 3],
				material: "none",
			},
		],
	});
};

// Initialize meshes - called by Backend when ready
const init = () => {
	_initMeshes();
};

// Use a Shapes object with getters for live binding
// (Direct let variable exports don't update imports after initialization)
const Shapes = {
	get screenQuad() {
		return _screenQuad;
	},
	get skyBox() {
		return _skyBox;
	},
	get pointLightVolume() {
		return _pointLightVolume;
	},
	get spotlightVolume() {
		return _spotlightVolume;
	},
	get boundingBox() {
		return _boundingBox;
	},
	get billboardQuad() {
		return _billboardQuad;
	},
	init,
};

export { Shapes };
