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
	}
	addParticle(
		position,
		velocity,
		duration,
		color = [1, 1, 1],
		startScale = 1.0,
		gravity = 0.0,
	) {
		this.#particles.push({
			pos: new Float32Array(position),
			vel: new Float32Array(velocity),
			color: new Float32Array(color),
			duration,
			life: duration,
			startScale,
			gravity,
		});
	}

	update(frameTime) {
		let anyAlive = false;

		const dtSec = frameTime / 1000.0;

		for (let i = 0; i < this.#particles.length; i++) {
			const p = this.#particles[i];

			if (p.life > 0) {
				p.life -= frameTime;

				if (p.life > 0) {
					anyAlive = true;

					// Apply gravity
					p.vel[1] -= p.gravity * dtSec;

					// Move particle
					p.pos[0] += p.vel[0] * dtSec;
					p.pos[1] += p.vel[1] * dtSec;
					p.pos[2] += p.vel[2] * dtSec;
				}
			}
		}

		return anyAlive;
	}

	render() {
		if (!this.visible || !this.#texture || this.#particles.length === 0) return;

		let numActiveParticles = 0;
		for (let i = 0; i < this.#particles.length; i++) {
			if (this.#particles[i].life > 0) numActiveParticles++;
		}
		if (numActiveParticles === 0) return;

		const floatsPerInstance = 10;
		const requiredSize = numActiveParticles * floatsPerInstance;

		if (!this.#instanceData || this.#instanceData.length < requiredSize) {
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
		for (let i = 0; i < this.#particles.length; i++) {
			const p = this.#particles[i];
			if (p.life <= 0) continue;

			const progress = 1.0 - p.life / p.duration;

			const scaleModifier = this.#scaleFn ? this.#scaleFn(progress) : 1.0;
			const opacityModifier = this.#opacityFn ? this.#opacityFn(progress) : 1.0;

			// aInstancePos
			this.#instanceData[offset++] = p.pos[0];
			this.#instanceData[offset++] = p.pos[1];
			this.#instanceData[offset++] = p.pos[2];

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
		Shaders.instancedBillboard.setInt("colorSampler", 0);
		this.#texture.bind(0);

		Backend.bindVertexState(this.#vertexState);
		Backend.drawInstanced(
			Shapes.billboardQuad.indices[0].indexBuffer,
			Shapes.billboardQuad.indices[0].array.length,
			numActiveParticles,
		);
		Backend.bindVertexState(null);

		Backend.unbindTexture(0);
	}
}

export default ParticleEmitterEntity;
