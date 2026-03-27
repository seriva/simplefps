import { mat4, vec3 } from "../../dependencies/gl-matrix.js";
import { BoundingBox } from "../physics/boundingbox.js";
import { Shaders } from "../rendering/shaders.js";
import { Shapes } from "../rendering/shapes.js";
import { Texture } from "../rendering/texture.js";
import { Camera } from "../systems/camera.js";
import { Resources } from "../systems/resources.js";
import { Entity, EntityTypes } from "./entity.js";

// Reusable temporary matrix to avoid per-frame allocations
const _tempMatrix = mat4.create();
const _worldPos = vec3.create();

class AnimatedBillboardEntity extends Entity {
	_time = 0;
	_duration;
	_gridSize;
	_frameCount;
	_scale;
	// Precomputed trig for the fixed rotation — saves two Math.cos/sin calls per frame
	_cosR;
	_sinR;
	_texture;
	_scaleFn;
	_opacityFn;

	constructor(position, config = {}) {
		super(EntityTypes.ANIMATED_BILLBOARD);

		if (!config.texture) {
			throw new Error("AnimatedBillboardEntity requires a texture");
		}

		this._duration = config.duration ?? 1000;
		this._gridSize = config.gridSize ?? 1;
		this._frameCount = config.frameCount ?? 1;
		this._scale = config.scale ?? 1;
		this._time = config.timeOffset ?? 0;
		this._texture = Resources.get(config.texture);
		this._scaleFn = config.scaleFn ?? null;
		this._opacityFn = config.opacityFn ?? null;

		// Cache rotation trig once; rotation is fixed for the lifetime of the entity
		const rotation = config.rotation ?? 0;
		this._cosR = Math.cos(rotation);
		this._sinR = Math.sin(rotation);

		// Store position in base_matrix, consistent with all other entities
		mat4.translate(this.base_matrix, this.base_matrix, position);
	}

	update(frameTime) {
		this._time += frameTime;
		return this._time < this._duration;
	}

	render() {
		// Skip if invisible, missing texture, or time hasn't started yet (negative timeOffset)
		if (!this.visible || !this._texture || this._time <= 0) return;

		const progress = Math.min(this._time / this._duration, 1.0);
		const frameIndex = Math.min(
			Math.floor(progress * this._frameCount),
			this._frameCount - 1,
		);
		const cellSize = 1.0 / this._gridSize;
		const col = frameIndex % this._gridSize;
		const row = Math.floor(frameIndex / this._gridSize);
		const opacity = this._opacityFn ? this._opacityFn(progress) : 1.0;
		const scale = this._scale * (this._scaleFn ? this._scaleFn(progress) : 1.0);

		// Extract world position from base_matrix (consistent with all other entities)
		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);
		mat4.getTranslation(_worldPos, _tempMatrix);

		// Build a billboard world matrix from camera view right/up vectors
		// Column-major mat4: view[0].xyz = right column, view[1].xyz = up column
		const v = Camera.view;
		const rx = v[0],
			ry = v[4],
			rz = v[8]; // camera right (view row 0)
		const ux = v[1],
			uy = v[5],
			uz = v[9]; // camera up    (view row 1)

		const c = this._cosR;
		const ss = this._sinR;

		// Apply in-plane rotation around the billboard normal
		const lrx = rx * c + ux * ss,
			lry = ry * c + uy * ss,
			lrz = rz * c + uz * ss;
		const lux = -rx * ss + ux * c,
			luy = -ry * ss + uy * c,
			luz = -rz * ss + uz * c;

		// Scale the billboard axes, keep forward (z col) as zero
		mat4.set(
			_tempMatrix,
			lrx * scale,
			lry * scale,
			lrz * scale,
			0,
			lux * scale,
			luy * scale,
			luz * scale,
			0,
			0,
			0,
			0,
			0,
			_worldPos[0],
			_worldPos[1],
			_worldPos[2],
			1,
		);

		const shader = Shaders.billboard;
		shader.bind();
		shader.setMat4("matWorld", _tempMatrix);
		shader.setVec2("uFrameOffset", [col * cellSize, row * cellSize]);
		shader.setVec2("uFrameScale", [cellSize, cellSize]);
		shader.setFloat("uOpacity", opacity);

		this._texture.bind(0);
		Shapes.billboardQuad.renderSingle(false);
		Texture.unBind(0);
	}

	updateBoundingVolume() {
		// Use the max possible rendered scale as the bounding radius
		// (worst case: scaleFn returns 1.0 so scale = this._scale)
		const r = this._scale;

		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);
		mat4.getTranslation(_worldPos, _tempMatrix);

		if (!this.boundingBox) {
			this.boundingBox = new BoundingBox([0, 0, 0], [1, 1, 1]);
		}

		this.boundingBox.set(
			[_worldPos[0] - r, _worldPos[1] - r, _worldPos[2] - r],
			[_worldPos[0] + r, _worldPos[1] + r, _worldPos[2] + r],
		);
	}

	dispose() {
		super.dispose();
		this._texture = null;
	}
}

export { AnimatedBillboardEntity };
