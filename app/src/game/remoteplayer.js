import { mat4, vec3 } from "../dependencies/gl-matrix.js";
import { MeshEntity, Scene } from "../engine/core/engine.js";

// Smooth interpolation factor

const PLAYER_SCALE = 33; // Same size as grenade launcher projectile

export class RemotePlayer {
	constructor(id, position) {
		this.id = id;

		// Use simple MeshEntity with ball for debugging
		this.mesh = new MeshEntity(
			position,
			"meshes/ball.mesh",
			null,
			PLAYER_SCALE,
		);
		this.mesh.castShadow = true;

		// Console.log(`[RemotePlayer] Created mesh at ${position}`);

		// Add to scene
		Scene.addEntities(this.mesh);

		this.targetPos = [...position];
		this.currentPos = [...position];
	}

	updateState(state) {
		// state: { pos: [x,y,z], vel: [x,y,z], rot: { yaw } }
		if (state.pos) {
			this.targetPos = state.pos;
		}
	}

	update(dt) {
		// Time-independent smoothing (approx 0.1s lag)
		const decay = 15;
		const alpha = 1 - Math.exp(-decay * dt);

		vec3.lerp(this.currentPos, this.currentPos, this.targetPos, alpha);

		// Update position via base_matrix
		mat4.identity(this.mesh.base_matrix);
		mat4.translate(
			this.mesh.base_matrix,
			this.mesh.base_matrix,
			this.currentPos,
		);
		mat4.scale(this.mesh.base_matrix, this.mesh.base_matrix, [
			PLAYER_SCALE,
			PLAYER_SCALE,
			PLAYER_SCALE,
		]);
	}

	destroy() {
		Scene.removeEntity(this.mesh);
	}
}
