import { mat4, vec3 } from "../../dependencies/gl-matrix.js";
import { Backend } from "../rendering/backend.js";
import { Shaders } from "../rendering/shaders.js";
import Shapes from "../rendering/shapes.js";
import Camera from "../systems/camera.js";
import Resources from "../systems/resources.js";
import { Entity, EntityTypes } from "./entity.js";

// ============================================================================
// Animated Billboard Entity — camera-facing sprite sheet animation
// ============================================================================

// Pre-allocated temporaries to avoid per-frame allocations
const _matWorld = mat4.create();
const _right = vec3.create();
const _up = vec3.create();

class AnimatedBillboardEntity extends Entity {
	#time = 0;
	#duration;
	#gridSize;
	#frameCount;
	#scale;
	#rotation;
	#texture;
	#scaleFn;
	#opacityFn;

	constructor(position, config = {}) {
		super(EntityTypes.ANIMATED_BILLBOARD);

		if (!config.texture) {
			throw new Error("AnimatedBillboardEntity requires a texture");
		}

		this.#duration = config.duration ?? 1000;
		this.#gridSize = config.gridSize ?? 1;
		this.#frameCount = config.frameCount ?? 1;
		this.#scale = config.scale ?? 1;
		this.#rotation = config.rotation ?? 0;
		this.#time = config.timeOffset ?? 0;
		this.#texture = Resources.get(config.texture);
		this.#scaleFn = config.scaleFn ?? null;
		this.#opacityFn = config.opacityFn ?? null;

		this.position = [position[0], position[1], position[2]];
	}

	update(frameTime) {
		this.#time += frameTime;
		return this.#time < this.#duration;
	}

	render() {
		if (!this.visible || !this.#texture || this.#time < 0) return;

		const shader = Shaders.billboard;
		if (!shader) return;

		const progress = Math.min(this.#time / this.#duration, 1.0);
		const frameIndex = Math.min(
			Math.floor(progress * this.#frameCount),
			this.#frameCount - 1,
		);

		// Compute sprite sheet UV offset and scale
		const col = frameIndex % this.#gridSize;
		const row = Math.floor(frameIndex / this.#gridSize);
		const cellSize = 1.0 / this.#gridSize;

		// Fade out using opacityFn or default to 1
		const opacity = this.#opacityFn ? this.#opacityFn(progress) : 1.0;

		// Build CPU-side billboard matrix from camera view matrix
		const v = Camera.view;
		_right[0] = v[0];
		_right[1] = v[4];
		_right[2] = v[8];
		_up[0] = v[1];
		_up[1] = v[5];
		_up[2] = v[9];

		// Apply local 2D rotation around camera-facing axis
		const cosR = Math.cos(this.#rotation);
		const sinR = Math.sin(this.#rotation);

		const rx = _right[0] * cosR + _up[0] * sinR;
		const ry = _right[1] * cosR + _up[1] * sinR;
		const rz = _right[2] * cosR + _up[2] * sinR;

		const ux = -_right[0] * sinR + _up[0] * cosR;
		const uy = -_right[1] * sinR + _up[1] * cosR;
		const uz = -_right[2] * sinR + _up[2] * cosR;

		// Apply external scaling if valid
		let s = this.#scale;
		if (this.#scaleFn) {
			s = s * this.#scaleFn(progress);
		}

		const px = this.position[0];
		const py = this.position[1];
		const pz = this.position[2];

		// Column 0: right * scale
		_matWorld[0] = rx * s;
		_matWorld[1] = ry * s;
		_matWorld[2] = rz * s;
		_matWorld[3] = 0;
		// Column 1: up * scale
		_matWorld[4] = ux * s;
		_matWorld[5] = uy * s;
		_matWorld[6] = uz * s;
		_matWorld[7] = 0;
		// Column 2: dummy forward
		_matWorld[8] = 0;
		_matWorld[9] = 0;
		_matWorld[10] = s;
		_matWorld[11] = 0;
		// Column 3: translation
		_matWorld[12] = px;
		_matWorld[13] = py;
		_matWorld[14] = pz;
		_matWorld[15] = 1;

		shader.bind();

		// WebGPU expects uniforms to be passed exactly as the shader expects them
		// setMat4 handles Float32Array correctly in the backend
		shader.setMat4("matWorld", _matWorld);
		shader.setInt("colorSampler", 0);
		shader.setVec2("uFrameOffset", [col * cellSize, row * cellSize]);
		shader.setVec2("uFrameScale", [cellSize, cellSize]);
		shader.setFloat("uOpacity", opacity);

		this.#texture.bind(0);

		const quad = Shapes.billboardQuad;
		if (quad) {
			quad.renderSingle(false);
		}

		Backend.unbindTexture(0);
		Backend.unbindShader();
	}

	dispose() {
		super.dispose();
		this.#texture = null;
	}
}

export default AnimatedBillboardEntity;
