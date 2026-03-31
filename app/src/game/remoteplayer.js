import { mat4, vec3 } from "../dependencies/gl-matrix.js";
import { MeshEntity, Scene } from "../engine/engine.js";
import { copyVec3, isVec3 } from "./netvalidation.js";

const PLAYER_SCALE = 33; // Same size as grenade launcher projectile
const _LERP_DECAY = 15; // ~0.1s lag at 60fps
const _PLAYER_SCALE_VEC = [PLAYER_SCALE, PLAYER_SCALE, PLAYER_SCALE];

class RemotePlayer {
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

		// Add to scene
		Scene.addEntities(this.mesh);

		this.targetPos = new Float32Array(position);
		this.currentPos = new Float32Array(position);
	}

	updateState(state) {
		// state: { pos: [x,y,z], vel: [x,y,z], rot: { yaw } }
		if (!state || !isVec3(state.pos)) return;
		copyVec3(this.targetPos, state.pos);
	}

	update(dt) {
		const alpha = 1 - Math.exp(-_LERP_DECAY * dt);

		vec3.lerp(this.currentPos, this.currentPos, this.targetPos, alpha);

		// Update position via base_matrix
		mat4.identity(this.mesh.base_matrix);
		mat4.translate(
			this.mesh.base_matrix,
			this.mesh.base_matrix,
			this.currentPos,
		);
		mat4.scale(this.mesh.base_matrix, this.mesh.base_matrix, _PLAYER_SCALE_VEC);
	}

	destroy() {
		Scene.removeEntity(this.mesh);
	}
}

export { RemotePlayer };
