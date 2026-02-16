import { vec3 } from "../../dependencies/gl-matrix.js";
import Console from "../systems/console.js";
import Resources from "../systems/resources.js";

// Private state
let _data = null;
let _origin = [0, 0, 0];
let _counts = [0, 0, 0];
let _step = [64, 64, 64];
let _bounds = { min: [0, 0, 0], max: [0, 0, 0] };

// Pre-allocated temp arrays for trilinear interpolation (avoid GC pressure)
const _c000 = [0, 0, 0];
const _c100 = [0, 0, 0];
const _c010 = [0, 0, 0];
const _c110 = [0, 0, 0];
const _c001 = [0, 0, 0];
const _c101 = [0, 0, 0];
const _c011 = [0, 0, 0];
const _c111 = [0, 0, 0];

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
		Console.warn("No light grid configuration found in arena config.");
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
					Console.warn(
						`LightGrid size mismatch. Config expects ${totalProbes} probes, buffer is ${buffer.byteLength} bytes. Using partial buffer.`,
					);
					_data = new Uint8Array(buffer);
				} else {
					Console.error(
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
			}
		})
		.catch((err) => {
			Console.error("Failed to load LightGrid:", err);
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
	const maxX = _counts[0] - 2;
	const maxY = _counts[1] - 2;
	const maxZ = _counts[2] - 2;
	x0 = x0 < 0 ? 0 : x0 > maxX ? maxX : x0;
	y0 = y0 < 0 ? 0 : y0 > maxY ? maxY : y0;
	z0 = z0 < 0 ? 0 : z0 > maxZ ? maxZ : z0;

	const x1 = x0 + 1;
	const y1 = y0 + 1;
	const z1 = z0 + 1;

	// Weights (fractional part, clamped)
	let wx = fx - x0;
	let wy = fy - y0;
	let wz = fz - z0;
	wx = wx < 0 ? 0 : wx > 1 ? 1 : wx;
	wy = wy < 0 ? 0 : wy > 1 ? 1 : wy;
	wz = wz < 0 ? 0 : wz > 1 ? 1 : wz;

	// Pre-compute stride values
	const strideY = _counts[0];
	const strideZ = _counts[0] * _counts[1];
	const dataLen = _data.length;

	// Helper to sample raw index into a pre-allocated array
	const getSample = (ix, iy, iz, out) => {
		const byteOffset = (iz * strideZ + iy * strideY + ix) * 3;
		if (byteOffset + 2 < dataLen) {
			out[0] = _data[byteOffset] * 0.00392156862745098; // / 255.0
			out[1] = _data[byteOffset + 1] * 0.00392156862745098;
			out[2] = _data[byteOffset + 2] * 0.00392156862745098;
		} else {
			out[0] = out[1] = out[2] = 0;
		}
	};

	// Sample 8 neighbors into pre-allocated arrays
	getSample(x0, y0, z0, _c000);
	getSample(x1, y0, z0, _c100);
	getSample(x0, y1, z0, _c010);
	getSample(x1, y1, z0, _c110);
	getSample(x0, y0, z1, _c001);
	getSample(x1, y0, z1, _c101);
	getSample(x0, y1, z1, _c011);
	getSample(x1, y1, z1, _c111);

	// Trilinear interpolation (inlined for performance)
	const wx1 = 1 - wx;
	const wy1 = 1 - wy;
	const wz1 = 1 - wz;

	// Interpolate X direction first
	const cx00_0 = _c000[0] * wx1 + _c100[0] * wx;
	const cx00_1 = _c000[1] * wx1 + _c100[1] * wx;
	const cx00_2 = _c000[2] * wx1 + _c100[2] * wx;
	const cx10_0 = _c010[0] * wx1 + _c110[0] * wx;
	const cx10_1 = _c010[1] * wx1 + _c110[1] * wx;
	const cx10_2 = _c010[2] * wx1 + _c110[2] * wx;
	const cx01_0 = _c001[0] * wx1 + _c101[0] * wx;
	const cx01_1 = _c001[1] * wx1 + _c101[1] * wx;
	const cx01_2 = _c001[2] * wx1 + _c101[2] * wx;
	const cx11_0 = _c011[0] * wx1 + _c111[0] * wx;
	const cx11_1 = _c011[1] * wx1 + _c111[1] * wx;
	const cx11_2 = _c011[2] * wx1 + _c111[2] * wx;

	// Interpolate Y direction
	const cxy0_0 = cx00_0 * wy1 + cx10_0 * wy;
	const cxy0_1 = cx00_1 * wy1 + cx10_1 * wy;
	const cxy0_2 = cx00_2 * wy1 + cx10_2 * wy;
	const cxy1_0 = cx01_0 * wy1 + cx11_0 * wy;
	const cxy1_1 = cx01_1 * wy1 + cx11_1 * wy;
	const cxy1_2 = cx01_2 * wy1 + cx11_2 * wy;

	// Interpolate Z direction (final result)
	outColor[0] = cxy0_0 * wz1 + cxy1_0 * wz;
	outColor[1] = cxy0_1 * wz1 + cxy1_1 * wz;
	outColor[2] = cxy0_2 * wz1 + cxy1_2 * wz;

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
