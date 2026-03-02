import { Backend } from "../rendering/backend.js";
import { Shaders } from "../rendering/shaders.js";
import Shapes from "../rendering/shapes.js";
import Resources from "../systems/resources.js";
import { Entity, EntityTypes } from "./entity.js";

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
		this.#instanceData = new Float32Array(128 * 10);
	}
	addParticle(position, velocity, duration, startScale = 1.0, gravity = 0.0) {
		this.#particles.push({
			x: position[0],
			y: position[1],
			z: position[2],
			vx: velocity[0],
			vy: velocity[1],
			vz: velocity[2],
			duration,
			life: duration,
			startScale,
			gravity,
		});
	}

	update(frameTime) {
		const dtSec = frameTime / 1000.0;
		// Iterate backwards so swap-and-pop removal is safe
		for (let i = this.#particles.length - 1; i >= 0; i--) {
			const p = this.#particles[i];
			p.life -= frameTime;
			if (p.life > 0) {
				p.vy -= p.gravity * dtSec;
				p.x += p.vx * dtSec;
				p.y += p.vy * dtSec;
				p.z += p.vz * dtSec;
			} else {
				const last = this.#particles.pop();
				if (i < this.#particles.length) this.#particles[i] = last;
			}
		}
		return this.#particles.length > 0;
	}

	render() {
		const n = this.#particles.length;
		if (!this.visible || !this.#texture || n === 0) return;

		// All particles in the array are alive (update() removes dead ones)
		const floatsPerInstance = 10;
		const requiredSize = n * floatsPerInstance;

		if (!this.#instanceBuffer || this.#instanceData.length < requiredSize) {
			const newSize = Math.max(requiredSize * 2, 100 * floatsPerInstance);
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

		let offset = 0;
		for (let i = 0; i < n; i++) {
			const p = this.#particles[i];

			const progress = 1.0 - p.life / p.duration;

			const scaleModifier = this.#scaleFn ? this.#scaleFn(progress) : 1.0;
			const opacityModifier = this.#opacityFn ? this.#opacityFn(progress) : 1.0;

			// aInstancePos
			this.#instanceData[offset++] = p.x;
			this.#instanceData[offset++] = p.y;
			this.#instanceData[offset++] = p.z;

			// aInstanceScale
			this.#instanceData[offset++] = p.startScale * scaleModifier;
			// aInstanceRotation
			this.#instanceData[offset++] = p.rotation || 0.0;
			// aInstanceOpacity
			this.#instanceData[offset++] = opacityModifier;

			// aInstanceUVOffsetScale
			this.#instanceData[offset++] = 0.0;
			this.#instanceData[offset++] = 0.0;
			this.#instanceData[offset++] = 1.0;
			this.#instanceData[offset++] = 1.0;
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

		Backend.unbindTexture(0);
	}
}

export default ParticleEmitterEntity;
