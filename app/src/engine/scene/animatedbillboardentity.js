import { Backend } from "../rendering/backend.js";
import { Shaders } from "../rendering/shaders.js";
import Shapes from "../rendering/shapes.js";
import Resources from "../systems/resources.js";
import { Entity, EntityTypes } from "./entity.js";

// ============================================================================
// Animated Billboard Entity — camera-facing sprite sheet animation
// ============================================================================

// Temporaries completely removed as the math is mostly on the GPU now

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

	#vertexState = null;
	#instanceBuffer = null;
	#instanceData = new Float32Array(10);

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

		const shader = Shaders.instancedBillboard;
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

		let s = this.#scale;
		if (this.#scaleFn) {
			s = s * this.#scaleFn(progress);
		}

		if (!this.#vertexState) {
			this.#instanceBuffer = Backend.createBuffer(this.#instanceData, "vertex");
			this.#vertexState = Backend.createVertexState({
				attributes: [
					{
						buffer: Shapes.billboardQuad.vertexBuffer,
						slot: 0,
						size: 3,
						type: "float",
						offset: 0,
						stride: 12,
					},
					{
						buffer: Shapes.billboardQuad.uvBuffer,
						slot: 1,
						size: 2,
						type: "float",
						offset: 0,
						stride: 8,
					},
					{
						buffer: this.#instanceBuffer,
						slot: 2,
						size: 3,
						type: "float",
						divisor: 1,
						stride: 40,
						offset: 0,
					},
					{
						buffer: this.#instanceBuffer,
						slot: 3,
						size: 1,
						type: "float",
						divisor: 1,
						stride: 40,
						offset: 12,
					},
					{
						buffer: this.#instanceBuffer,
						slot: 4,
						size: 1,
						type: "float",
						divisor: 1,
						stride: 40,
						offset: 16,
					},
					{
						buffer: this.#instanceBuffer,
						slot: 5,
						size: 1,
						type: "float",
						divisor: 1,
						stride: 40,
						offset: 20,
					},
					{
						buffer: this.#instanceBuffer,
						slot: 6,
						size: 4,
						type: "float",
						divisor: 1,
						stride: 40,
						offset: 24,
					},
				],
			});
		}

		this.#instanceData[0] = this.position[0];
		this.#instanceData[1] = this.position[1];
		this.#instanceData[2] = this.position[2];

		this.#instanceData[3] = s;
		this.#instanceData[4] = this.#rotation;
		this.#instanceData[5] = opacity;

		this.#instanceData[6] = col * cellSize;
		this.#instanceData[7] = row * cellSize;
		this.#instanceData[8] = cellSize;
		this.#instanceData[9] = cellSize;

		Backend.updateBuffer(this.#instanceBuffer, this.#instanceData);

		shader.bind();
		shader.setInt("colorSampler", 0);

		this.#texture.bind(0);

		Backend.bindVertexState(this.#vertexState);
		Backend.drawInstanced(
			Shapes.billboardQuad.indices[0].indexBuffer,
			Shapes.billboardQuad.indices[0].array.length,
			1,
		);
		Backend.bindVertexState(null);

		Backend.unbindTexture(0);
		Backend.unbindShader();
	}

	dispose() {
		super.dispose();
		this.#texture = null;
		if (this.#vertexState) {
			Backend.deleteVertexState(this.#vertexState);
			this.#vertexState = null;
		}
		if (this.#instanceBuffer) {
			Backend.deleteBuffer(this.#instanceBuffer);
			this.#instanceBuffer = null;
		}
	}
}

export default AnimatedBillboardEntity;
