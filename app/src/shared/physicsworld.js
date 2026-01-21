import * as CANNON from "../dependencies/cannon-es.js";

// Collision groups for filtering
export const COLLISION_GROUPS = {
	WORLD: 1,
	PLAYER: 2,
	PROJECTILE: 4,
};

const GRAVITY_SCALE = 80;
const TIME_STEP = 1 / 120;
const MAX_SUBSTEPS = 10;

export class PhysicsWorld {
	constructor(_config = {}) {
		this.world = new CANNON.World();
		this.world.broadphase = new CANNON.SAPBroadphase(this.world);
		this.world.gravity.set(0, 0, 0); // We apply gravity manually
		this.world.allowSleep = true;
		this.world.quatNormalizeSkip = 0;
		this.world.quatNormalizeFast = false;
		this.world.solver.tolerance = 0.001;
		this.world.solver.iterations = 10;

		this.gravityBodies = new Set();
		this.worldMaterial = new CANNON.Material("world");

		// Temp vector for gravity application
		this._gravityVec = new CANNON.Vec3(0, 0, 0);

		// Apply gravity manually
		this.world.addEventListener("preStep", () => {
			for (const body of this.gravityBodies) {
				const gravityScale =
					body.gravityScale !== undefined ? body.gravityScale : 1.0;

				this._gravityVec.set(
					0,
					-9.82 * GRAVITY_SCALE * body.mass * gravityScale,
					0,
				);
				body.applyForce(this._gravityVec, body.position);
			}
		});
	}

	step(dt) {
		this.world.step(TIME_STEP, dt, MAX_SUBSTEPS);
	}

	addBody(body) {
		this.world.addBody(body);
		if (body.gravityScale !== 0) {
			this.gravityBodies.add(body);
		}
	}

	removeBody(body) {
		this.world.removeBody(body);
		this.gravityBodies.delete(body);
	}

	addContactMaterial(matA, matB, options) {
		const cm = new CANNON.ContactMaterial(matA, matB, options);
		this.world.addContactMaterial(cm);
		return cm;
	}

	addTrimesh(vertices, indices) {
		// Validation
		if (!vertices || !indices) return null;

		// Convert flat vertex array to CANNON format
		const cannonVertices = [];
		for (let i = 0; i < vertices.length; i += 3) {
			cannonVertices.push(vertices[i], vertices[i + 1], vertices[i + 2]);
		}

		// Flatten all index groups into one array (double-sided: add both windings)
		const cannonIndices = [];
		for (const indexGroup of indices) {
			// Check if indexGroup is the group object or raw array
			const arr = indexGroup.array ? indexGroup.array : indexGroup;
			for (let i = 0; i < arr.length; i += 3) {
				const a = arr[i];
				const b = arr[i + 1];
				const c = arr[i + 2];
				// Original winding
				cannonIndices.push(a, b, c);
				// Reversed winding for double-sided collision
				cannonIndices.push(a, c, b);
			}
		}

		const trimesh = new CANNON.Trimesh(cannonVertices, cannonIndices);
		const body = new CANNON.Body({
			mass: 0, // Static body
			type: CANNON.Body.STATIC,
			material: this.worldMaterial,
		});
		body.addShape(trimesh);
		// Collision filter: World belongs to WORLD group, collides with EVERYTHING
		// (default mask is -1 which is everything)
		body.collisionFilterGroup = COLLISION_GROUPS.WORLD;

		this.addBody(body);
		return body;
	}

	raycastClosest(from, to, options, result) {
		return this.world.raycastClosest(from, to, options, result);
	}
}
