import { mat4, vec3 } from "../dependencies/gl-matrix.js";
import {
	AnimatedBillboardEntity,
	Camera,
	MeshEntity,
	ParticleEmitterEntity,
	PointLightEntity,
	Resources,
	Scene,
} from "../engine/engine.js";
import { EXPLOSION_CONFIG, PROJECTILE_CONFIG } from "./gamedefs.js";

// ============================================================================
// Private
// ============================================================================

// Weapons use both-sided faces for projectile hits
const _bothSidesRayOptions = { skipBackfaces: false, collisionFilterMask: 1 };

// Projectile trajectory constants
const _TRAJECTORY = {
	SPEED: 900, // Units per second
	GRAVITY: 300, // Affects arc curvature
	LIFETIME: 15000, // Max lifetime in ms
};

// Track active projectiles for update
const _activeProjectiles = new Set();

// Pre-allocated vectors to avoid per-frame allocations
const _nextPos = [0, 0, 0];
const _inDir = [0, 0, 0];
const _reflectDir = [0, 0, 0];
const _projectileScaleVec = [1, 1, 1];
const _projectileRight = vec3.create();
const _worldUp = [0, 1, 0];

// Spawn a volumetric explosion cluster with light flash and flying sparks
const _spawnExplosion = (position) => {
	const entitiesList = [];

	// 1. Point light flash
	const flashColor = [1.0, 0.5, 0.1];
	const flashRadius = EXPLOSION_CONFIG.scale * 4.5;
	// Pull slightly off the wall so it illuminates the impact surface evenly
	const flashPos = [position[0], position[1], position[2] + 10];
	const flashEntity = new PointLightEntity(
		flashPos,
		flashRadius,
		flashColor,
		8, // Low initial intensity
		(entity, frameTime) => {
			// Fast decay over ~180ms
			entity.intensity -= (frameTime / 180) * 8;
			if (entity.intensity <= 0) {
				return false; // Remove light
			}
			return true;
		},
	);
	entitiesList.push(flashEntity);

	// 2. Billboard Cluster
	const clusterCount = 4;
	for (let i = 0; i < clusterCount; i++) {
		// Scattered offsets within a 22-unit radius
		const offsetX = (Math.random() - 0.5) * 22;
		const offsetY = (Math.random() - 0.5) * 22;
		const offsetZ = (Math.random() - 0.5) * 22;
		const clusterPos = [
			position[0] + offsetX,
			position[1] + offsetY,
			position[2] + offsetZ,
		];

		const clusterConfig = {
			...EXPLOSION_CONFIG,
			scale: EXPLOSION_CONFIG.scale * (0.8 + Math.random() * 0.4),
			rotation: Math.random() * Math.PI * 2, // Break up the repetition
			timeOffset: -Math.random() * 100, // Stagger explosions by up to 100ms
			scaleFn: (progress) => {
				const ease = 1.0 - (1.0 - progress) ** 3;
				return 0.2 + 0.8 * ease; // Pop outward
			},
			opacityFn: (progress) => {
				const fadeStart = 0.7;
				return progress < fadeStart
					? 1.0
					: 1.0 - (progress - fadeStart) / (1.0 - fadeStart);
			},
		};
		entitiesList.push(new AnimatedBillboardEntity(clusterPos, clusterConfig));
	}

	// 3. Flying Sparks (Particle Emitter)
	const emitter = new ParticleEmitterEntity({
		texture: "meshes/spark.webp",
		scaleFn: (progress) => 20.0 * (1.0 - progress ** 3),
		opacityFn: (progress) => 1.0 - progress,
	});

	const sparkCount = 15 + Math.floor(Math.random() * 10); // 15-24 sparks
	for (let i = 0; i < sparkCount; i++) {
		const vx = (Math.random() - 0.5) * 1000;
		const vy = (Math.random() - 0.5) * 1000 + 400; // Biased upwards bounce
		const vz = (Math.random() - 0.5) * 1000;
		const sparkDuration = 300 + Math.random() * 500; // Lifetime 300-800ms

		emitter.addParticle(
			position,
			[vx, vy, vz],
			sparkDuration,
			1.0, // Scale
			600.0, // Gravity
		);
	}
	entitiesList.push(emitter);

	Scene.addEntities(entitiesList);
	Resources.get("sounds/explosion.sfx").play();
};

// Update projectile - simple velocity-based physics
const _updateProjectile = (entity, frameTime) => {
	const traj = entity.trajectory;
	const scale = entity.data.meshScale || 1;

	entity.data.elapsed += frameTime;

	// Check lifetime
	if (entity.data.elapsed > _TRAJECTORY.LIFETIME) {
		_spawnExplosion(entity.trajectory.position);
		if (entity.linkedLight) {
			Scene.removeEntity(entity.linkedLight);
		}
		Scene.removeEntity(entity);
		_activeProjectiles.delete(entity);
		return false;
	}

	// Physics step
	const dt = frameTime / 1000; // Convert to seconds

	// Apply gravity to velocity
	traj.velocity[1] -= _TRAJECTORY.GRAVITY * dt;

	// Calculate next position
	_nextPos[0] = traj.position[0] + traj.velocity[0] * dt;
	_nextPos[1] = traj.position[1] + traj.velocity[1] * dt;
	_nextPos[2] = traj.position[2] + traj.velocity[2] * dt;

	// Raycast from current to next position + lookahead for slow projectiles
	const dx = _nextPos[0] - traj.position[0];
	const dy = _nextPos[1] - traj.position[1];
	const dz = _nextPos[2] - traj.position[2];
	const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

	// Minimum lookahead to prevent tunneling when moving slowly
	const minLookahead = 5;
	const lookahead = Math.max(dist, minLookahead);
	const dirX = dist > 0.01 ? dx / dist : 0;
	const dirY = dist > 0.01 ? dy / dist : -1;
	const dirZ = dist > 0.01 ? dz / dist : 0;

	const result = Scene.raycast(
		traj.position[0],
		traj.position[1],
		traj.position[2],
		traj.position[0] + dirX * lookahead,
		traj.position[1] + dirY * lookahead,
		traj.position[2] + dirZ * lookahead,
		_bothSidesRayOptions,
	);

	if (result.hasHit) {
		// Bounce!
		const hp = result.hitPointWorld;
		const hn = result.hitNormalWorld;

		traj.bounceCount++;

		// Normalize velocity for reflection
		const speed = Math.sqrt(
			traj.velocity[0] ** 2 + traj.velocity[1] ** 2 + traj.velocity[2] ** 2,
		);

		// If too slow, just stop (prevents floor tunneling)
		if (speed < 50) {
			_spawnExplosion(traj.position);
			if (entity.linkedLight) {
				Scene.removeEntity(entity.linkedLight);
			}
			Scene.removeEntity(entity);
			_activeProjectiles.delete(entity);
			return false;
		}

		_inDir[0] = traj.velocity[0] / speed;
		_inDir[1] = traj.velocity[1] / speed;
		_inDir[2] = traj.velocity[2] / speed;

		// Reflect: v' = v - 2(v·n)n
		const dot = _inDir[0] * hn[0] + _inDir[1] * hn[1] + _inDir[2] * hn[2];
		_reflectDir[0] = _inDir[0] - 2 * dot * hn[0];
		_reflectDir[1] = _inDir[1] - 2 * dot * hn[1];
		_reflectDir[2] = _inDir[2] - 2 * dot * hn[2];

		// Apply restitution (energy loss)
		const newSpeed = speed * 0.6;
		traj.velocity[0] = _reflectDir[0] * newSpeed;
		traj.velocity[1] = _reflectDir[1] * newSpeed;
		traj.velocity[2] = _reflectDir[2] * newSpeed;

		// Move to hit point + larger offset to stay above surface
		const offset = 3.0;
		traj.position[0] = hp[0] + hn[0] * offset;
		traj.position[1] = hp[1] + hn[1] * offset;
		traj.position[2] = hp[2] + hn[2] * offset;
	} else {
		// No hit, update position
		traj.position[0] = _nextPos[0];
		traj.position[1] = _nextPos[1];
		traj.position[2] = _nextPos[2];
	}

	// Build transform (no rotation)
	mat4.fromTranslation(entity.ani_matrix, traj.position);
	_projectileScaleVec[0] =
		_projectileScaleVec[1] =
		_projectileScaleVec[2] =
			scale;
	mat4.scale(entity.ani_matrix, entity.ani_matrix, _projectileScaleVec);

	// Update light
	if (entity.linkedLight) {
		mat4.fromTranslation(entity.linkedLight.ani_matrix, traj.position);
	}

	return true;
};

const _calculateSpawnPosition = (config) => {
	const p = Camera.position;
	const d = Camera.direction;

	// Calculate right vector for offset (cross product of direction and up)
	vec3.cross(_projectileRight, d, _worldUp);
	vec3.normalize(_projectileRight, _projectileRight);

	// Spawn further in front of camera to avoid collision with player/nearby geometry
	return [
		p[0] + d[0] * 30 + _projectileRight[0] * config.barrelOffset,
		p[1] + d[1] * 30 - 5,
		p[2] + d[2] * 30 + _projectileRight[2] * config.barrelOffset,
	];
};

const _createProjectile = (spawnPos, config) => {
	const entity = new MeshEntity([0, 0, 0], config.mesh, _updateProjectile);
	entity.data.meshScale = config.meshScale || 1;

	// Camera.direction is always a unit vector
	const d = Camera.direction;
	const speed = config.velocity || _TRAJECTORY.SPEED;

	entity.trajectory = {
		position: [...spawnPos],
		velocity: [d[0] * speed, d[1] * speed, d[2] * speed],
		bounceCount: 0,
	};

	_activeProjectiles.add(entity);

	const light = new PointLightEntity(
		[0, 0, 0],
		config.light.radius,
		config.light.color,
		config.light.intensity,
	);
	light.visible = true;

	entity.linkedLight = light;
	entity.data.elapsed = 0;

	return { entity, light };
};

// ============================================================================
// Public API
// ============================================================================

const Projectiles = {
	fire(config = PROJECTILE_CONFIG) {
		const spawnPos = _calculateSpawnPosition(config);
		const projectile = _createProjectile(spawnPos, config);
		Scene.addEntities([projectile.entity, projectile.light]);
	},

	reset() {
		_activeProjectiles.clear();
	},
};

export { Projectiles };
