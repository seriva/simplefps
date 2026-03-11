import { Backend } from "../rendering/backend.js";
import { Shaders } from "../rendering/shaders.js";
import Shapes from "../rendering/shapes.js";
import Texture from "../rendering/texture.js";
import Resources from "../systems/resources.js";
import { Entity, EntityTypes } from "./entity.js";

// Instance layout (6 floats = 24 bytes per particle):
//   slot 2: aInstancePos      (vec3, offset  0)
//   slot 3: aInstanceScale    (float, offset 12)
//   slot 4: aInstanceRotation (float, offset 16)
//   slot 5: aInstanceOpacity  (float, offset 20)
const FLOATS_PER_INSTANCE = 6;
const STRIDE = FLOATS_PER_INSTANCE * 4; // bytes

class ParticleEmitterEntity extends Entity {
	#particles = [];
	#texture;
	#scaleFn;
	#opacityFn;
	#instanceBuffer;
	#vertexState;
	#instanceData;

	constructor(config = {}) {
		super(EntityTypes.PARTICLE_EMITTER);
		if (!config.texture) {
			throw new Error("ParticleEmitterEntity requires a texture");
		}
		this.#texture = Resources.get(config.texture);
		this.#scaleFn = config.scaleFn ?? null;
		this.#opacityFn = config.opacityFn ?? null;
		// Pre-allocate enough capacity for a typical burst (128 particles)
		this.#instanceData = new Float32Array(128 * FLOATS_PER_INSTANCE);
	}

	addParticle(
		position,
		velocity,
		durationMs,
		startScale = 1.0,
		gravity = 0.0,
		rotation = 0.0,
	) {
		this.#particles.push({
			x: position[0],
			y: position[1],
			z: position[2],
			vx: velocity[0],
			vy: velocity[1],
			vz: velocity[2],
			durationMs,
			lifeMs: durationMs,
			startScale,
			gravity,
			rotation,
		});
	}

	update(frameTime) {
		const dtSec = frameTime / 1000.0;
		// Iterate backwards so swap-and-pop removal is safe
		for (let i = this.#particles.length - 1; i >= 0; i--) {
			const p = this.#particles[i];
			p.lifeMs -= frameTime;
			if (p.lifeMs > 0) {
				p.vy -= p.gravity * dtSec;
				p.x += p.vx * dtSec;
				p.y += p.vy * dtSec;
				p.z += p.vz * dtSec;
			} else {
				const last = this.#particles.pop();
				if (i < this.#particles.length) this.#particles[i] = last;
			}
		}
		// Returns false when empty — the scene can remove the emitter at that point.
		// For looping emitters a different lifecycle contract would be needed.
		return this.#particles.length > 0;
	}

	render() {
		const n = this.#particles.length;
		if (!this.visible || !this.#texture || n === 0) return;

		// All particles in the array are alive (update() removes dead ones)
		const requiredSize = n * FLOATS_PER_INSTANCE;

		if (!this.#instanceBuffer || this.#instanceData.length < requiredSize) {
			const newSize = Math.max(requiredSize * 2, 100 * FLOATS_PER_INSTANCE);
			this.#instanceData = new Float32Array(newSize);

			if (this.#instanceBuffer) {
				Backend.deleteBuffer(this.#instanceBuffer);
			}
			if (this.#vertexState) {
				Backend.deleteVertexState(this.#vertexState);
			}

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
					// Per-instance data: position, scale, rotation, opacity
					{
						buffer: this.#instanceBuffer,
						slot: 2,
						size: 3,
						type: "float",
						divisor: 1,
						stride: STRIDE,
						offset: 0,
					},
					{
						buffer: this.#instanceBuffer,
						slot: 3,
						size: 1,
						type: "float",
						divisor: 1,
						stride: STRIDE,
						offset: 12,
					},
					{
						buffer: this.#instanceBuffer,
						slot: 4,
						size: 1,
						type: "float",
						divisor: 1,
						stride: STRIDE,
						offset: 16,
					},
					{
						buffer: this.#instanceBuffer,
						slot: 5,
						size: 1,
						type: "float",
						divisor: 1,
						stride: STRIDE,
						offset: 20,
					},
				],
			});
		}

		let offset = 0;
		for (let i = 0; i < n; i++) {
			const p = this.#particles[i];

			const progress = 1.0 - p.lifeMs / p.durationMs;

			const scaleModifier = this.#scaleFn ? this.#scaleFn(progress) : 1.0;
			const opacityModifier = this.#opacityFn ? this.#opacityFn(progress) : 1.0;

			// aInstancePos
			this.#instanceData[offset++] = p.x;
			this.#instanceData[offset++] = p.y;
			this.#instanceData[offset++] = p.z;
			// aInstanceScale
			this.#instanceData[offset++] = p.startScale * scaleModifier;
			// aInstanceRotation
			this.#instanceData[offset++] = p.rotation;
			// aInstanceOpacity
			this.#instanceData[offset++] = opacityModifier;
		}

		Backend.updateBuffer(
			this.#instanceBuffer,
			this.#instanceData.subarray(0, requiredSize),
		);

		Shaders.instancedBillboard.bind();
		this.#texture.bind(0);

		Backend.bindVertexState(this.#vertexState);
		Backend.drawInstanced(
			Shapes.billboardQuad.indices[0].indexBuffer,
			Shapes.billboardQuad.indices[0].array.length,
			n,
		);
		Backend.bindVertexState(null);

		Texture.unBind(0);
	}
}

export default ParticleEmitterEntity;
