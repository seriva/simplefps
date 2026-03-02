import { mat4 } from "../../dependencies/gl-matrix.js";
import { Backend } from "../rendering/backend.js";
import { Shaders } from "../rendering/shaders.js";
import Shapes from "../rendering/shapes.js";
import Camera from "../systems/camera.js";
import Resources from "../systems/resources.js";
import { Entity, EntityTypes } from "./entity.js";

class ParticleEmitterEntity extends Entity {
	static #tempMatrix = mat4.create();

	#particles = [];
	#texture;
	#scaleFn;
	#opacityFn;

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

		Shaders.billboard.bind();
		Shaders.billboard.setInt("colorSampler", 0);

		// Use full texture
		Shaders.billboard.setVec2("uFrameOffset", [0, 0]);
		Shaders.billboard.setVec2("uFrameScale", [1, 1]);

		this.#texture.bind(0);

		// Precompute camera axes once for the whole batch
		const v = Camera.view;
		const rx = v[0];
		const ry = v[4];
		const rz = v[8];
		const ux = v[1];
		const uy = v[5];
		const uz = v[9];

		for (let i = 0; i < this.#particles.length; i++) {
			const p = this.#particles[i];
			if (p.life <= 0) continue;

			const progress = 1.0 - p.life / p.duration;

			const scaleModifier = this.#scaleFn ? this.#scaleFn(progress) : 1.0;
			const opacityModifier = this.#opacityFn ? this.#opacityFn(progress) : 1.0;

			const s = p.startScale * scaleModifier;
			const opacity = opacityModifier;

			// Build billboard matrix
			const mat = ParticleEmitterEntity.#tempMatrix;

			// Right vector
			mat[0] = rx * s;
			mat[1] = ry * s;
			mat[2] = rz * s;
			mat[3] = 0;
			// Up vector
			mat[4] = ux * s;
			mat[5] = uy * s;
			mat[6] = uz * s;
			mat[7] = 0;
			// Forward / Identity dummy
			mat[8] = 0;
			mat[9] = 0;
			mat[10] = s;
			mat[11] = 0;
			// Translation
			mat[12] = p.pos[0];
			mat[13] = p.pos[1];
			mat[14] = p.pos[2];
			mat[15] = 1;

			Shaders.billboard.setMat4("matWorld", mat);
			Shaders.billboard.setFloat("uOpacity", opacity);

			Shapes.billboardQuad.renderSingle(false);
		}

		Backend.unbindTexture(0);
	}
}

export default ParticleEmitterEntity;
