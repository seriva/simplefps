import { vec3 } from "../../dependencies/gl-matrix.js";
import Resources from "../systems/resources.js";

// Private state
let _data = null;
let _origin = [0, 0, 0];
let _counts = [0, 0, 0];
let _step = [64, 64, 64];
let _bounds = { min: [0, 0, 0], max: [0, 0, 0] };

// ============================================================================
// Private Functions
// ============================================================================

const _reset = () => {
	_data = null;
	_origin = [0, 0, 0];
	_counts = [0, 0, 0];
	_step = [64, 64, 64];
	_bounds = { min: [0, 0, 0], max: [0, 0, 0] };
};

const _load = (config) => {
	_reset();

	if (!config || !config.lightGrid) {
		console.warn("No light grid configuration found in arena config.");
		return Promise.resolve();
	}

	const lgConfig = config.lightGrid;

	// Load the binary data
	const resourceName = lgConfig.src
		? lgConfig.src
		: `arenas/${config.arenaName}/lightgrid.bin`;

	return Resources.load([resourceName])
		.then(() => {
			const buffer = Resources.get(resourceName);
			if (buffer) {
				// Determine format based on size
				// We expect RGB (3 bytes per probe)
				const totalProbes =
					lgConfig.counts[0] * lgConfig.counts[1] * lgConfig.counts[2];

				if (buffer.byteLength === totalProbes * 3) {
					_data = new Uint8Array(buffer);
				} else if (buffer.byteLength >= totalProbes * 3) {
					console.warn(
						`LightGrid size mismatch. Config expects ${totalProbes} probes, buffer is ${buffer.byteLength} bytes. Using partial buffer.`,
					);
					_data = new Uint8Array(buffer);
				} else {
					console.error(
						`LightGrid size mismatch. Config expects ${totalProbes} probes, buffer is ${buffer.byteLength} bytes. Too small.`,
					);
					return;
				}

				// Only set metadata if we successfully loaded data
				_origin = lgConfig.origin;
				_counts = lgConfig.counts;
				_step = lgConfig.step;

				// Calculate bounds for safer clamping
				_bounds.min = [..._origin];
				_bounds.max = [
					_origin[0] + (_counts[0] - 1) * _step[0],
					_origin[1] + (_counts[1] - 1) * _step[1],
					_origin[2] + (_counts[2] - 1) * _step[2],
				];

				console.log("LightGrid initialized:", _counts, "Origin:", _origin);
			}
		})
		.catch((err) => {
			console.error("Failed to load LightGrid:", err);
		});
};

const _getAmbient = (position, outColor = null) => {
	if (!outColor) outColor = vec3.create();

	// Default to white if no data
	if (!_data) {
		vec3.set(outColor, 1, 1, 1);
		return outColor;
	}

	// Get position relative to origin (in Engine Space)
	const relX = position[0] - _origin[0];
	const relY = position[1] - _origin[1];
	const relZ = position[2] - _origin[2];

	// Convert to Grid Indices (Float)
	const fx = relX / _step[0];
	const fy = -relZ / _step[1];
	const fz = relY / _step[2];

	// Compute base indices and weights
	let x0 = Math.floor(fx);
	let y0 = Math.floor(fy);
	let z0 = Math.floor(fz);

	// Clamp to valid range (0 to count-2 for safe +1 access)
	x0 = Math.max(0, Math.min(x0, _counts[0] - 2));
	y0 = Math.max(0, Math.min(y0, _counts[1] - 2));
	z0 = Math.max(0, Math.min(z0, _counts[2] - 2));

	const x1 = x0 + 1;
	const y1 = y0 + 1;
	const z1 = z0 + 1;

	// Weights (fractional part)
	const wx = Math.max(0, Math.min(1, fx - x0));
	const wy = Math.max(0, Math.min(1, fy - y0));
	const wz = Math.max(0, Math.min(1, fz - z0));

	// Helper to sample raw index
	const getSample = (ix, iy, iz) => {
		const index = iz * (_counts[0] * _counts[1]) + iy * _counts[0] + ix;
		const byteOffset = index * 3;
		if (byteOffset + 2 < _data.length) {
			return [
				_data[byteOffset] / 255.0,
				_data[byteOffset + 1] / 255.0,
				_data[byteOffset + 2] / 255.0,
			];
		}
		return [0, 0, 0];
	};

	// Sample 8 neighbors
	const c000 = getSample(x0, y0, z0);
	const c100 = getSample(x1, y0, z0);
	const c010 = getSample(x0, y1, z0);
	const c110 = getSample(x1, y1, z0);
	const c001 = getSample(x0, y0, z1);
	const c101 = getSample(x1, y0, z1);
	const c011 = getSample(x0, y1, z1);
	const c111 = getSample(x1, y1, z1);

	// Interpolate
	const mix = (a, b, w) => a + (b - a) * w;

	const cx00 = [
		mix(c000[0], c100[0], wx),
		mix(c000[1], c100[1], wx),
		mix(c000[2], c100[2], wx),
	];
	const cx10 = [
		mix(c010[0], c110[0], wx),
		mix(c010[1], c110[1], wx),
		mix(c010[2], c110[2], wx),
	];
	const cx01 = [
		mix(c001[0], c101[0], wx),
		mix(c001[1], c101[1], wx),
		mix(c001[2], c101[2], wx),
	];
	const cx11 = [
		mix(c011[0], c111[0], wx),
		mix(c011[1], c111[1], wx),
		mix(c011[2], c111[2], wx),
	];

	const cxy0 = [
		mix(cx00[0], cx10[0], wy),
		mix(cx00[1], cx10[1], wy),
		mix(cx00[2], cx10[2], wy),
	];
	const cxy1 = [
		mix(cx01[0], cx11[0], wy),
		mix(cx01[1], cx11[1], wy),
		mix(cx01[2], cx11[2], wy),
	];

	outColor[0] = mix(cxy0[0], cxy1[0], wz);
	outColor[1] = mix(cxy0[1], cxy1[1], wz);
	outColor[2] = mix(cxy0[2], cxy1[2], wz);

	return outColor;
};

// ============================================================================
// Public API
// ============================================================================

const LightGrid = {
	get hasData() {
		return _data !== null;
	},
	load: _load,
	getAmbient: _getAmbient,
};

export default LightGrid;
