import { mat4 } from "../../dependencies/gl-matrix.js";
import { Shaders } from "../rendering/shaders.js";
import Shapes from "../rendering/shapes.js";
import Texture from "../rendering/texture.js";
import Camera from "../systems/camera.js";
import Resources from "../systems/resources.js";
import { Entity, EntityTypes } from "./entity.js";

// Reusable temporary matrix to avoid per-frame allocations
const _tempMatrix = mat4.create();

class AnimatedBillboardEntity extends Entity {
	#time = 0;
	#duration;
	#gridSize;
	#frameCount;
	#scale;
	// Precomputed trig for the fixed rotation — saves two Math.cos/sin calls per frame
	#cosR;
	#sinR;
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
		this.#time = config.timeOffset ?? 0;
		this.#texture = Resources.get(config.texture);
		this.#scaleFn = config.scaleFn ?? null;
		this.#opacityFn = config.opacityFn ?? null;

		// Cache rotation trig once; rotation is fixed for the lifetime of the entity
		const rotation = config.rotation ?? 0;
		this.#cosR = Math.cos(rotation);
		this.#sinR = Math.sin(rotation);

		this.position = [position[0], position[1], position[2]];
	}

	update(frameTime) {
		this.#time += frameTime;
		return this.#time < this.#duration;
	}

	render() {
		// Skip if invisible, missing texture, or time hasn't started yet (negative timeOffset)
		if (!this.visible || !this.#texture || this.#time <= 0) return;

		const progress = Math.min(this.#time / this.#duration, 1.0);
		const frameIndex = Math.min(
			Math.floor(progress * this.#frameCount),
			this.#frameCount - 1,
		);
		const cellSize = 1.0 / this.#gridSize;
		const col = frameIndex % this.#gridSize;
		const row = Math.floor(frameIndex / this.#gridSize);
		const opacity = this.#opacityFn ? this.#opacityFn(progress) : 1.0;
		const scale = this.#scale * (this.#scaleFn ? this.#scaleFn(progress) : 1.0);

		// Build a billboard world matrix from camera view right/up vectors
		// Column-major mat4: view[0].xyz = right column, view[1].xyz = up column
		const v = Camera.view;
		const rx = v[0],
			ry = v[4],
			rz = v[8]; // camera right (view row 0)
		const ux = v[1],
			uy = v[5],
			uz = v[9]; // camera up    (view row 1)

		const c = this.#cosR;
		const ss = this.#sinR;

		// Apply in-plane rotation around the billboard normal
		const lrx = rx * c + ux * ss,
			lry = ry * c + uy * ss,
			lrz = rz * c + uz * ss;
		const lux = -rx * ss + ux * c,
			luy = -ry * ss + uy * c,
			luz = -rz * ss + uz * c;

		// Scale the billboard axes, keep forward (z col) as zero
		mat4.set(
			_tempMatrix,
			lrx * scale,
			lry * scale,
			lrz * scale,
			0,
			lux * scale,
			luy * scale,
			luz * scale,
			0,
			0,
			0,
			0,
			0,
			this.position[0],
			this.position[1],
			this.position[2],
			1,
		);

		const shader = Shaders.billboard;
		shader.bind();
		shader.setMat4("matWorld", _tempMatrix);
		shader.setVec2("uFrameOffset", [col * cellSize, row * cellSize]);
		shader.setVec2("uFrameScale", [cellSize, cellSize]);
		shader.setFloat("uOpacity", opacity);

		this.#texture.bind(0);
		Shapes.billboardQuad.renderSingle(false);
		Texture.unBind(0);
	}

	dispose() {
		super.dispose();
		this.#texture = null;
	}
}

export default AnimatedBillboardEntity;
