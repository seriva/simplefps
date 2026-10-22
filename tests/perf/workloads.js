// Hot-path drivers shared by the A/B harness (`ab.js --self-test`,
// `js-vs-wasm.js --ab`). They mirror the plain `js-vs-wasm.js` workloads.
//
// Import this module once per A/B side with a distinct query string
// (`workloads.js?side=a`): every import is then a separate module instance
// with its own function literals, so V8 keeps separate type feedback per side.
// With one shared copy the driver loops would see both sides' object shapes,
// go polymorphic, and bias whichever side V8 checks second.

export const GRID = 32;
export const JOINTS = 64;
const DT = 1 / 120;
const TURN = 600;

function floorMesh(scale) {
	const verts = [];
	for (let z = 0; z <= GRID; z++) {
		for (let x = 0; x <= GRID; x++) verts.push(x * scale, 0, z * scale);
	}
	const indices = [];
	for (let z = 0; z < GRID; z++) {
		for (let x = 0; x < GRID; x++) {
			const i = z * (GRID + 1) + x;
			indices.push(i, i + GRID + 1, i + 1, i + 1, i + GRID + 1, i + GRID + 2);
		}
	}
	return [new Float32Array(verts), new Int32Array(indices)];
}

// physicsWorkloads drives a `physics` package build: closest-hit raycasts
// against a 2048-triangle floor with the spatial-hash Map (`raycastMap`) or
// flat (`raycastFlat`) broadphase, and the fixed-step FPS controller loop.
export function physicsWorkloads(m) {
	const [mesh, err] = m.NewTrimesh(...floorMesh(1), null);
	if (err) throw err;
	const ray = m.NewRay(new m.Vec3(0, 10, 0), new m.Vec3(0, -10, 0));
	ray.Mode = m.RayModeClosest;
	const sweep = (n) => {
		for (let i = 0; i < n; i++) {
			const x = (i % GRID) + 0.5;
			const z = (((i / GRID) | 0) % GRID) + 0.5;
			ray.From.X = x;
			ray.From.Z = z;
			ray.To.X = x;
			ray.To.Z = z;
			ray.Result.Reset();
			ray.HasHit = false;
			ray.IntersectTrimesh(mesh, null);
		}
	};
	const raycastMap = (n) => {
		mesh.SetBroadphase(0);
		sweep(n);
	};
	const raycastFlat = (n) => {
		mesh.SetBroadphase(1);
		sweep(n);
	};

	const [floor, floorErr] = m.NewTrimesh(...floorMesh(50), null);
	if (floorErr) throw floorErr;
	const world = m.NewStaticWorld();
	world.Trimesh = floor;
	const ctrl = m.NewFPSController(new m.Vec3(800, 0, 800), null);
	ctrl.Provider = world;
	const pose = ctrl.Camera;
	const camPos = new m.Vec3();
	const camDir = new m.Vec3(1, 0, 0);
	const camUp = new m.Vec3(0, 1, 0);
	const dirX = new Float64Array(TURN);
	const dirZ = new Float64Array(TURN);
	for (let i = 0; i < TURN; i++) {
		dirX[i] = Math.cos((2 * Math.PI * i) / TURN);
		dirZ[i] = Math.sin((2 * Math.PI * i) / TURN);
	}
	let frame = 0;
	const controller = (n) => {
		for (let i = 0; i < n; i++) {
			const k = frame++ % TURN;
			camDir.X = dirX[k];
			camDir.Z = dirZ[k];
			pose.Position.Copy(camPos);
			pose.Direction.Copy(camDir);
			pose.Up.Copy(camUp);
			ctrl.Update(DT);
			ctrl.MoveWithCamera(0.3, 1, DT);
			ctrl.SyncCamera(DT);
			camPos.Copy(pose.Position);
			camUp.Copy(pose.Up);
		}
	};
	return { raycastMap, raycastFlat, controller };
}

// skinningWorkloads drives an `animation` package build with a 64-joint chain
// and a 10-frame looping clip:
//   world   - Skeleton.GetWorldMatrices on a fixed pose;
//   palette - ComputeSkinningMatrices on a fixed pose + copying the palette
//             out of the shared bone buffer;
//   total   - one full frame as scene.SkinnedMeshEntity drives it
//             (AnimationPlayer.Update + ComputeSkinningMatrices + copy).
export function skinningWorkloads(m) {
	const defs = [];
	for (let i = 0; i < JOINTS; i++) {
		const d = new m.JointDef();
		d.Name = `j${i}`;
		d.Parent = i === 0 ? -1 : i - 1;
		d.Pos = new Float32Array([1, 0, 0]);
		d.Rot = new Float32Array([0, 0, 0, 1]);
		defs.push(d);
	}
	const skeleton = m.NewSkeleton(defs);
	const poses = [];
	for (let f = 0; f < 10; f++) {
		const p = m.NewPose(JOINTS);
		for (let j = 0; j < JOINTS; j++) {
			p.SetJointTransform(j, 1, f * 0.1, 0, 0, Math.sin(f) * 0.1, 0, 1);
		}
		poses.push(p);
	}
	const player = m.NewAnimationPlayer(skeleton);
	player.Play(m.NewAnimation("walk", 24, poses, null), true);
	const fixed = poses[3];
	const bones = new Float32Array(JOINTS * 16);
	const world = (n) => {
		for (let i = 0; i < n; i++) skeleton.GetWorldMatrices(fixed);
	};
	const palette = (n) => {
		for (let i = 0; i < n; i++) {
			const floats = skeleton.ComputeSkinningMatrices(fixed) * 16;
			for (let k = 0; k < floats; k++) bones[k] = m.SkinMatrices[k];
		}
	};
	const total = (n) => {
		for (let i = 0; i < n; i++) {
			const pose = player.Update(1 / 60);
			const floats = skeleton.ComputeSkinningMatrices(pose) * 16;
			for (let k = 0; k < floats; k++) bones[k] = m.SkinMatrices[k];
		}
	};
	return { world, palette, total };
}

// decoderWorkloads drives an `assets/decoder` build over real asset bytes.
export function decoderWorkloads(m, meshBytes, animBytes) {
	return {
		parseMesh: (n) => {
			for (let i = 0; i < n; i++) m.ParseBinaryMesh(meshBytes);
		},
		parseAnim: (n) => {
			for (let i = 0; i < n; i++) m.ParseBinaryAnimation("robot", animBytes);
		},
	};
}
