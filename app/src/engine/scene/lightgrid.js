import { vec3 } from "../../dependencies/gl-matrix.js";
import Resources from "../systems/resources.js";

const _tempVec3 = vec3.create();

class LightGrid {
	constructor() {
		this.data = null;
		this.origin = [0, 0, 0];
		this.counts = [0, 0, 0];
		this.step = [64, 64, 64];
		this.bounds = { min: [0, 0, 0], max: [0, 0, 0] };
	}

	get hasData() {
		return this.data !== null;
	}

	load(config) {
		if (!config || !config.lightGrid) {
			console.warn("No light grid configuration found in arena config.");
			return;
		}

		const lgConfig = config.lightGrid;

		// Load the binary data
		const resourceName = lgConfig.src
			? lgConfig.src
			: `arenas/${config.arenaName}/lightgrid.bin`;
		Resources.load([resourceName]).then(() => {
			const buffer = Resources.get(resourceName);
			if (buffer) {
				// Determine format based on size
				// We expect RGB (3 bytes per probe)
				const totalProbes =
					lgConfig.counts[0] * lgConfig.counts[1] * lgConfig.counts[2];
				if (buffer.byteLength === totalProbes * 3) {
					this.data = new Uint8Array(buffer);
				} else {
					console.error(
						`LightGrid size mismatch. Config expects ${totalProbes} probes, buffer is ${buffer.byteLength} bytes.`,
					);
					// Fallback: use partial buffer or error out?
					// If it's larger, we can use it.
					if (buffer.byteLength >= totalProbes * 3) {
						this.data = new Uint8Array(buffer);
					}
				}
			}
		});

		this.origin = lgConfig.origin;
		this.counts = lgConfig.counts;
		this.step = lgConfig.step;

		// Calculate bounds for safer clamping
		this.bounds.min = [...this.origin];
		this.bounds.max = [
			this.origin[0] + (this.counts[0] - 1) * this.step[0],
			this.origin[1] + (this.counts[1] - 1) * this.step[1],
			this.origin[2] + (this.counts[2] - 1) * this.step[2],
		];

		console.log("LightGrid initialized:", this.counts, "Origin:", this.origin);
	}

	/**
	 * Get ambient light color at position
	 * @param {vec3} position - World position (Engine Y-Up)
	 * @param {vec3} outColor - Optional output vector
	 * @returns {vec3} Normalized RGB color (0-1)
	 */
	getAmbient(position, outColor = null) {
		if (!outColor) outColor = vec3.create();

		// Default to black or distinct error color if no data
		if (!this.data) {
			vec3.set(outColor, 1, 1, 1);
			return outColor;
		}

		// Convert Engine Position to Grid Indices

		// The bsp2map script exports:
		// origin: [x, z, -y] (Q3 Origin transformed to "BSP Space" but scaled)
		// step: [64*scale, 64*scale, 64*scale]
		// counts: [nx, ny, nz] (Q3 dimensions)

		// Engine Coordinates: X, Y, Z
		// We need to map Engine Pos -> BSP Space relative to origin
		// BSP Space X = Engine X
		// BSP Space Y = Engine -Z
		// BSP Space Z = Engine Y

		// However, the 'origin' we saved in config.arena is:
		// q3Origin[0] * scale, // X
		// q3Origin[2] * scale, // Z (Up in Q3) -> Engine Y
		// -q3Origin[1] * scale // -Y (North in Q3) -> Engine Z

		// Wait, let's re-verify the export logic in bsp2map.js:
		/*
			lightGridConfig = {
				origin: [
				   q3Origin[0] * scale,
				   q3Origin[2] * scale,
				   -q3Origin[1] * scale
				],
				counts: lightGridRaw.counts, // [x, y, z] in Q3 axes
				step: ...
			}
		*/

		// So 'origin' is actually in ENGINE SPACE (X, Y, Z) if we map Q3 Z->Y and Q3 Y->-Z
		// So we can simpler subtract origin from position directly?

		// Let's trace Q3 axes to Grid Indices:
		// Grid Index = x + y*dx + z*dx*dy
		// Where x,y,z are indices in Q3 space.

		// Q3 X corresponds to Engine X.
		// Q3 Y corresponds to Engine -Z.
		// Q3 Z corresponds to Engine Y.

		// So:
		// 1. Get position relative to origin (in Engine Space)
		const relX = position[0] - this.origin[0];
		const relY = position[1] - this.origin[1];
		const relZ = position[2] - this.origin[2];

		// 2. Convert to Grid Indices (Float)
		// Note: Logic must match the nearest neighbor check we did:
		// idxX = relX / step[0]
		// idxY = -relZ / step[1] (Q3 Y axis logic)
		// idxZ = relY / step[2]

		const fx = relX / this.step[0];
		const fy = -relZ / this.step[1];
		const fz = relY / this.step[2];

		// 3. Compute base indices and weights
		let x0 = Math.floor(fx);
		let y0 = Math.floor(fy);
		let z0 = Math.floor(fz);

		// Clamp to valid range (0 to count-2 for safe +1 access)
		x0 = Math.max(0, Math.min(x0, this.counts[0] - 2));
		y0 = Math.max(0, Math.min(y0, this.counts[1] - 2));
		z0 = Math.max(0, Math.min(z0, this.counts[2] - 2));

		const x1 = x0 + 1;
		const y1 = y0 + 1;
		const z1 = z0 + 1;

		// Weights (fractional part)
		// We need to re-calculate fraction based on clustered x0
		// Or simply use (val - x0) but constrained 0..1
		const wx = Math.max(0, Math.min(1, fx - x0));
		const wy = Math.max(0, Math.min(1, fy - y0));
		const wz = Math.max(0, Math.min(1, fz - z0));

		// Helper to sample raw index
		const getSample = (ix, iy, iz) => {
			const index =
				iz * (this.counts[0] * this.counts[1]) + iy * this.counts[0] + ix;
			const byteOffset = index * 3;
			if (byteOffset + 2 < this.data.length) {
				return [
					this.data[byteOffset] / 255.0,
					this.data[byteOffset + 1] / 255.0,
					this.data[byteOffset + 2] / 255.0,
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

		// Interpolate X
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

		// Interpolate Y
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

		// Interpolate Z
		outColor[0] = mix(cxy0[0], cxy1[0], wz);
		outColor[1] = mix(cxy0[1], cxy1[1], wz);
		outColor[2] = mix(cxy0[2], cxy1[2], wz);

		return outColor;
	}
}

export default LightGrid;
