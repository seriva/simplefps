import { Backend } from "../rendering/backend.js";
import { Shaders } from "../rendering/shaders.js";
import { Shapes } from "../rendering/shapes.js";
import { Texture } from "../rendering/texture.js";
import { Resources } from "../systems/resources.js";
import { Entity, EntityTypes } from "./entity.js";

// Instance layout (6 floats = 24 bytes per particle):
//   slot 2: aInstancePos      (vec3, offset  0)
//   slot 3: aInstanceScale    (float, offset 12)
//   slot 4: aInstanceRotation (float, offset 16)
//   slot 5: aInstanceOpacity  (float, offset 20)
const FLOATS_PER_INSTANCE = 6;
const STRIDE = FLOATS_PER_INSTANCE * 4; // bytes

class ParticleEmitterEntity extends Entity {
	_particles = [];
	_texture;
	_scaleFn;
	_opacityFn;
	_instanceBuffer;
	_vertexState;
	_instanceData;

	constructor(config = {}) {
		super(EntityTypes.PARTICLE_EMITTER);
		if (!config.texture) {
			throw new Error("ParticleEmitterEntity requires a texture");
		}
		this._texture = Resources.get(config.texture);
		this._scaleFn = config.scaleFn ?? null;
		this._opacityFn = config.opacityFn ?? null;
		// Pre-allocate enough capacity for a typical burst (128 particles)
		this._instanceData = new Float32Array(128 * FLOATS_PER_INSTANCE);
	}

	addParticle(
		position,
		velocity,
		durationMs,
		startScale = 1.0,
		gravity = 0.0,
		rotation = 0.0,
	) {
		this._particles.push({
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
		for (let i = this._particles.length - 1; i >= 0; i--) {
			const p = this._particles[i];
			p.lifeMs -= frameTime;
			if (p.lifeMs > 0) {
				p.vy -= p.gravity * dtSec;
				p.x += p.vx * dtSec;
				p.y += p.vy * dtSec;
				p.z += p.vz * dtSec;
			} else {
				const last = this._particles.pop();
				if (i < this._particles.length) this._particles[i] = last;
			}
		}

		super.update(frameTime);

		// Return false when empty so the scene removes this entity.
		// For looping emitters a different lifecycle contract would be needed.
		if (this._particles.length === 0) return false;
	}

	render() {
		const n = this._particles.length;
		if (!this.visible || !this._texture || n === 0) return;

		// All particles in the array are alive (update() removes dead ones)
		const requiredSize = n * FLOATS_PER_INSTANCE;

		if (!this._instanceBuffer || this._instanceData.length < requiredSize) {
			const newSize = Math.max(requiredSize * 2, 100 * FLOATS_PER_INSTANCE);
			this._instanceData = new Float32Array(newSize);

			if (this._instanceBuffer) {
				Backend.deleteBuffer(this._instanceBuffer);
			}
			if (this._vertexState) {
				Backend.deleteVertexState(this._vertexState);
			}

			this._instanceBuffer = Backend.createBuffer(this._instanceData, "vertex");
			this._vertexState = Backend.createVertexState({
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
						buffer: this._instanceBuffer,
						slot: 2,
						size: 3,
						type: "float",
						divisor: 1,
						stride: STRIDE,
						offset: 0,
					},
					{
						buffer: this._instanceBuffer,
						slot: 3,
						size: 1,
						type: "float",
						divisor: 1,
						stride: STRIDE,
						offset: 12,
					},
					{
						buffer: this._instanceBuffer,
						slot: 4,
						size: 1,
						type: "float",
						divisor: 1,
						stride: STRIDE,
						offset: 16,
					},
					{
						buffer: this._instanceBuffer,
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
			const p = this._particles[i];

			const progress = 1.0 - p.lifeMs / p.durationMs;

			const scaleModifier = this._scaleFn ? this._scaleFn(progress) : 1.0;
			const opacityModifier = this._opacityFn ? this._opacityFn(progress) : 1.0;

			// aInstancePos
			this._instanceData[offset++] = p.x;
			this._instanceData[offset++] = p.y;
			this._instanceData[offset++] = p.z;
			// aInstanceScale
			this._instanceData[offset++] = p.startScale * scaleModifier;
			// aInstanceRotation
			this._instanceData[offset++] = p.rotation;
			// aInstanceOpacity
			this._instanceData[offset++] = opacityModifier;
		}

		Backend.updateBuffer(
			this._instanceBuffer,
			this._instanceData.subarray(0, requiredSize),
		);

		Shaders.instancedBillboard.bind();
		this._texture.bind(0);

		Backend.bindVertexState(this._vertexState);
		Backend.drawInstanced(
			Shapes.billboardQuad.indices[0].indexBuffer,
			Shapes.billboardQuad.indices[0].array.length,
			n,
		);
		Backend.bindVertexState(null);

		Texture.unBind(0);
	}
}

export { ParticleEmitterEntity };
