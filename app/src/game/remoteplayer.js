import { vec3 } from "../dependencies/gl-matrix.js";
import { Scene, SkinnedMeshEntity } from "../engine/core/engine.js";

// Smooth interpolation factor
const LERP_FACTOR = 0.2;

export class RemotePlayer {
	constructor(id, position) {
		this.id = id;

		// Visual Mesh
		this.mesh = new SkinnedMeshEntity(
			position,
			"models/robot/robot.sbmesh",
			null,
			0.035,
		);
		this.mesh.castShadow = true;
		this.mesh.playAnimation("models/robot/robot.banim");

		console.log(`[RemotePlayer] Created mesh at ${position}`);

		// Add to scene
		Scene.addEntities(this.mesh);

		this.targetPos = [...position];
		this.currentPos = [...position];
		// this.targetRot = ...
	}

	updateState(state) {
		// state: { pos: [x,y,z], vel: [x,y,z], rot: { yaw } }
		if (state.pos) {
			this.targetPos = state.pos;
		}
		// Could use velocity for extrapolation if needed
	}

	update(dt) {
		// Simple Lerp for now
		// A better approach is using a jitter buffer and interpolating between two snapshots.
		// For prototype: fast lerp.

		vec3.lerp(this.currentPos, this.currentPos, this.targetPos, LERP_FACTOR);

		this.mesh.position[0] = this.currentPos[0];
		this.mesh.position[1] = this.currentPos[1];
		this.mesh.position[2] = this.currentPos[2];

		// TODO: Handle rotation
	}

	destroy() {
		// Remove from scene logic?
		// Scene doesn't expose 'removeEntity' easily yet?
		// Actually Scene.entities is an array.
		// We might need to implement removal in Scene or just hide it.
		// For now: Move to -10000.
		this.mesh.position[1] = -10000;
		this.mesh.active = false;
	}
}
