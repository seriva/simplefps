import { mat4, vec3 } from "../dependencies/gl-matrix.js";
import {
	AnimatedBillboardEntity,
	Camera,
	DynamicBody,
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

// Projectile trajectory constants
const _TRAJECTORY = {
	SPEED: 900, // Units per second
	GRAVITY: 300, // Affects arc curvature
	LIFETIME: 15000, // Max lifetime in ms
};

// Track active projectiles for update
const _activeProjectiles = new Set();

// Pre-allocated vectors to avoid per-frame allocations
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

// Update projectile - delegates to DynamicBody
const _updateProjectile = (entity, frameTime) => {
	const scale = entity.data.meshScale || 1;

	entity.data.elapsed += frameTime;

	// Check lifetime
	if (entity.data.elapsed > _TRAJECTORY.LIFETIME) {
		_spawnExplosion(entity.physicsBody.position);
		if (entity.linkedLight) {
			Scene.removeEntity(entity.linkedLight);
		}
		Scene.removeEntity(entity);
		_activeProjectiles.delete(entity);
		return false;
	}

	// Physics step
	entity.physicsBody.update(frameTime);

	if (entity.physicsBody.isResting) {
		return false;
	}

	// Build transform (no rotation)
	mat4.fromTranslation(entity.ani_matrix, entity.physicsBody.position);
	_projectileScaleVec[0] =
		_projectileScaleVec[1] =
		_projectileScaleVec[2] =
			scale;
	mat4.scale(entity.ani_matrix, entity.ani_matrix, _projectileScaleVec);

	// Update light
	if (entity.linkedLight) {
		mat4.fromTranslation(
			entity.linkedLight.ani_matrix,
			entity.physicsBody.position,
		);
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

	entity.physicsBody = new DynamicBody(spawnPos, {
		velocity: [d[0] * speed, d[1] * speed, d[2] * speed],
		gravity: _TRAJECTORY.GRAVITY,
		restitution: 0.6,
		radius: 3.0,
		minBounceSpeed: 50,
		onRest: (pos) => {
			_spawnExplosion(pos);
			if (entity.linkedLight) {
				Scene.removeEntity(entity.linkedLight);
			}
			Scene.removeEntity(entity);
			_activeProjectiles.delete(entity);
		},
	});

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
