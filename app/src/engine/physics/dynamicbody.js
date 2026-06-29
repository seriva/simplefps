import { Scene } from "../scene/scene.js";

const _bothSidesRayOptions = { skipBackfaces: false, collisionFilterMask: 1 };

class DynamicBody {
	constructor(position, options = {}) {
		this.position = [...position];
		this.velocity = options.velocity ? [...options.velocity] : [0, 0, 0];
		this.gravity = options.gravity ?? 300;
		this.restitution = options.restitution ?? 0.6;
		this.radius = options.radius ?? 3.0;
		this.minBounceSpeed = options.minBounceSpeed ?? 50;
		this.bounceCount = 0;

		// Callbacks
		this.onBounce = options.onBounce || null;
		this.onRest = options.onRest || null;

		this.isResting = false;
	}

	update(frameTime) {
		if (this.isResting) return;

		const dt = frameTime / 1000; // Convert to seconds

		// Apply gravity to velocity
		this.velocity[1] -= this.gravity * dt;

		// Calculate current speed
		const vx = this.velocity[0];
		const vy = this.velocity[1];
		const vz = this.velocity[2];
		const speedSq = vx * vx + vy * vy + vz * vz;
		const speed = Math.sqrt(speedSq);

		// Distance covered this frame
		const dist = speed * dt;

		// Minimum lookahead to prevent tunneling when moving slowly
		const minLookahead = 5;
		const lookahead = Math.max(dist, minLookahead);

		// Direction vectors
		const dirX = speed > 0.001 ? vx / speed : 0;
		const dirY = speed > 0.001 ? vy / speed : -1;
		const dirZ = speed > 0.001 ? vz / speed : 0;

		const result = Scene.raycastStatic(
			this.position[0],
			this.position[1],
			this.position[2],
			this.position[0] + dirX * lookahead,
			this.position[1] + dirY * lookahead,
			this.position[2] + dirZ * lookahead,
			_bothSidesRayOptions,
		);

		if (result.hasHit) {
			// Bounce!
			const hp = result.hitPointWorld;
			const hn = result.hitNormalWorld;

			this.bounceCount++;

			// If too slow, just stop (prevents floor tunneling)
			if (speed < this.minBounceSpeed) {
				this.isResting = true;
				// Move to hit point + offset to stay above surface
				this.position[0] = hp[0] + hn[0] * this.radius;
				this.position[1] = hp[1] + hn[1] * this.radius;
				this.position[2] = hp[2] + hn[2] * this.radius;
				this.velocity[0] = this.velocity[1] = this.velocity[2] = 0;

				if (this.onRest) this.onRest(this.position);
				return false;
			}

			// Reflect: v' = v - 2(v·n)n
			const dot = dirX * hn[0] + dirY * hn[1] + dirZ * hn[2];
			const rx = dirX - 2 * dot * hn[0];
			const ry = dirY - 2 * dot * hn[1];
			const rz = dirZ - 2 * dot * hn[2];

			// Apply restitution (energy loss)
			const newSpeed = speed * this.restitution;
			this.velocity[0] = rx * newSpeed;
			this.velocity[1] = ry * newSpeed;
			this.velocity[2] = rz * newSpeed;

			// Move to hit point + offset to stay above surface
			this.position[0] = hp[0] + hn[0] * this.radius;
			this.position[1] = hp[1] + hn[1] * this.radius;
			this.position[2] = hp[2] + hn[2] * this.radius;

			if (this.onBounce) this.onBounce(hp, hn, newSpeed);
		} else {
			// No hit, update position directly
			this.position[0] += vx * dt;
			this.position[1] += vy * dt;
			this.position[2] += vz * dt;
		}

		return true;
	}
}

export { DynamicBody };
