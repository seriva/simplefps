import Camera from "./camera.js";
import Console from "./console.js";
import { css, html, Reactive } from "./reactive.js";

// Private Stats UI component
class _StatsUI extends Reactive.Component {
	constructor() {
		super();
		this._prevTime = 0;
		this._frames = 0;
		this._lastUpdate = performance.now();
	}

	state() {
		return {
			visible: this.signal(true, "stats:visible"),
			fps: this.signal(0, "stats:fps"),
			frameTime: this.signal(0, "stats:frameTime"),
			memory: this.signal(0, "stats:memory"),
			visibleMeshes: this.signal(0, "stats:visibleMeshes"),
			visibleLights: this.signal(0, "stats:visibleLights"),
			triangles: this.signal(0, "stats:triangles"),
		};
	}

	styles() {
		return css`
			#stats {
				margin: 0;
				padding: 0;
				background-color: transparent;
			}

			.stats-item {
				display: none;
			}

			.stats-item.visible {
				display: block;
			}

			#stats-basic {
				font-size: 12px;
				color: #fff;
				left: 8px;
				top: 8px;
				z-index: 2001;
				position: absolute;
			}

			#stats-scene {
				font-size: 12px;
				color: #fff;
				left: 8px;
				top: 24px;
				z-index: 2001;
				position: absolute;
			}

			#stats-pos {
				color: #fff;
				font-size: 12px;
				left: 8px;
				top: 40px;
				z-index: 2001;
				position: absolute;
			}
		`;
	}

	template() {
		return html`
			<div id="stats">
				<div id="stats-basic" class="stats-item" data-class-visible="visible">
					<span data-ref="basic"></span>
				</div>
				<div id="stats-scene" class="stats-item" data-class-visible="visible">
					<span data-ref="scene"></span>
				</div>
				<div id="stats-pos" class="stats-item" data-class-visible="visible">
					<span data-ref="pos"></span>
				</div>
			</div>
		`;
	}

	mount() {
		// Use bindMultiple for cleaner multi-signal bindings
		this.bindMultiple(
			this.refs.basic,
			[this.fps, this.frameTime, this.memory],
			([fps, frameTime, memory]) =>
				`${fps}fps - ${Math.round(frameTime)}ms - ${memory}mb`,
		);

		this.bindMultiple(
			this.refs.scene,
			[this.visibleMeshes, this.visibleLights, this.triangles],
			([meshes, lights, triangles]) =>
				`m:${meshes} - l:${lights} - t:${triangles}`,
		);

		// Camera position updates on fps change (every second)
		this.effect(() => {
			this.fps.get();
			this.refs.pos.textContent = `xyz:${Camera.position.map((v) => Math.round(v)).join(",")}`;
		});
	}

	update() {
		const now = performance.now();
		this.frameTime.set(now - (this._prevTime || now));
		this._prevTime = now;
		this._frames++;

		if (now - this._lastUpdate >= 1000) {
			this.batch(() => {
				this.fps.set(this._frames);
				this._frames = 0;
				this.memory.set(
					performance.memory
						? Math.round(performance.memory.usedJSHeapSize / 1048576)
						: 0,
				);
				this._lastUpdate = now;
			});
		}
	}

	setRenderStats(meshCount, lightCount, triangleCount) {
		this.batch(() => {
			this.visibleMeshes.set(meshCount);
			this.visibleLights.set(lightCount);
			this.triangles.set(triangleCount);
		});
	}

	toggle(show) {
		this.visible.set(show ?? !this.visible.get());
		return this.visible.get();
	}
}

// Private singleton instance
const _ui = new _StatsUI();
_ui.appendTo("body");

// Public Stats API
const Stats = {
	toggle(show) {
		return _ui.toggle(show);
	},
	update() {
		_ui.update();
	},
	setRenderStats(meshCount, lightCount, triangleCount) {
		_ui.setRenderStats(meshCount, lightCount, triangleCount);
	},
};

export default Stats;

// Register console command
Console.registerCmd("stats", Stats.toggle);
