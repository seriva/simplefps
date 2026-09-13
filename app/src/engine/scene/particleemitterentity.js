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

// Internal flat particle data layout (11 floats per particle):
const P_X = 0;
const P_Y = 1;
const P_Z = 2;
const P_VX = 3;
const P_VY = 4;
const P_VZ = 5;
const P_DURATION = 6;
const P_LIFE = 7;
const P_SCALE = 8;
const P_GRAVITY = 9;
const P_ROTATION = 10;
const P_STRIDE = 11;
const INITIAL_CAPACITY = 128;

class ParticleEmitterEntity extends Entity {
	_particleData;
	_count = 0;
	_capacity = 0;
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
		this._capacity = INITIAL_CAPACITY;
		this._count = 0;
		this._particleData = new Float32Array(INITIAL_CAPACITY * P_STRIDE);
		// Pre-allocate enough capacity for a typical burst (128 particles)
		this._instanceData = new Float32Array(
			INITIAL_CAPACITY * FLOATS_PER_INSTANCE,
		);
	}

	addParticle(
		position,
		velocity,
		durationMs,
		startScale = 1.0,
		gravity = 0.0,
		rotation = 0.0,
	) {
		if (this._count >= this._capacity) {
			const newCapacity = this._capacity * 2;
			const newParticleData = new Float32Array(newCapacity * P_STRIDE);
			newParticleData.set(this._particleData);
			this._particleData = newParticleData;
			this._capacity = newCapacity;
		}

		const base = this._count * P_STRIDE;
		const p = this._particleData;
		p[base + P_X] = position[0];
		p[base + P_Y] = position[1];
		p[base + P_Z] = position[2];
		p[base + P_VX] = velocity[0];
		p[base + P_VY] = velocity[1];
		p[base + P_VZ] = velocity[2];
		p[base + P_DURATION] = durationMs;
		p[base + P_LIFE] = durationMs;
		p[base + P_SCALE] = startScale;
		p[base + P_GRAVITY] = gravity;
		p[base + P_ROTATION] = rotation;
		this._count++;
	}

	update(frameTime) {
		const dtSec = frameTime / 1000.0;
		const p = this._particleData;
		// Iterate backwards so swap-and-pop removal is safe
		for (let i = this._count - 1; i >= 0; i--) {
			const base = i * P_STRIDE;
			p[base + P_LIFE] -= frameTime;
			if (p[base + P_LIFE] > 0) {
				p[base + P_VY] -= p[base + P_GRAVITY] * dtSec;
				p[base + P_X] += p[base + P_VX] * dtSec;
				p[base + P_Y] += p[base + P_VY] * dtSec;
				p[base + P_Z] += p[base + P_VZ] * dtSec;
			} else {
				this._count--;
				if (i < this._count) {
					const lastBase = this._count * P_STRIDE;
					for (let k = 0; k < P_STRIDE; k++) {
						p[base + k] = p[lastBase + k];
					}
				}
			}
		}

		super.update(frameTime);

		// Return false when empty so the scene removes this entity.
		// For looping emitters a different lifecycle contract would be needed.
		if (this._count === 0) return false;
	}

	render() {
		const n = this._count;
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
				indexBuffer: Shapes.billboardQuad.indices[0].indexBuffer,
			});
		}

		let offset = 0;
		const p = this._particleData;
		for (let i = 0; i < n; i++) {
			const base = i * P_STRIDE;
			const durationMs = p[base + P_DURATION];
			const lifeMs = p[base + P_LIFE];
			const progress = 1.0 - lifeMs / durationMs;

			const scaleModifier = this._scaleFn ? this._scaleFn(progress) : 1.0;
			const opacityModifier = this._opacityFn ? this._opacityFn(progress) : 1.0;

			// aInstancePos
			this._instanceData[offset++] = p[base + P_X];
			this._instanceData[offset++] = p[base + P_Y];
			this._instanceData[offset++] = p[base + P_Z];
			// aInstanceScale
			this._instanceData[offset++] = p[base + P_SCALE] * scaleModifier;
			// aInstanceRotation
			this._instanceData[offset++] = p[base + P_ROTATION];
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

	dispose() {
		super.dispose();
		if (this._instanceBuffer) {
			Backend.deleteBuffer(this._instanceBuffer);
			this._instanceBuffer = null;
		}
		if (this._vertexState) {
			Backend.deleteVertexState(this._vertexState);
			this._vertexState = null;
		}
		this._count = 0;
		this._particleData = null;
		this._instanceData = null;
		this._texture = null;
	}
}

export { ParticleEmitterEntity };
