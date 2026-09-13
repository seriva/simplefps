import { Console } from "./console.js";

// Private audio context
const _audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Cache decoded audio buffers to avoid duplicate network requests and decoding
const _audioBufferCache = new Map();

// Resume suspended AudioContext on first user interaction or on play
const _resumeAudio = () => {
	if (_audioContext.state === "suspended") {
		_audioContext.resume();
	}
};

if (typeof window !== "undefined") {
	window.addEventListener("pointerdown", _resumeAudio, {
		once: true,
		passive: true,
	});
	window.addEventListener("keydown", _resumeAudio, {
		once: true,
		passive: true,
	});
	window.addEventListener("touchstart", _resumeAudio, {
		once: true,
		passive: true,
	});
}

// Load and decode audio buffer once per file
const _loadAudioBuffer = async (file) => {
	if (_audioBufferCache.has(file)) {
		return _audioBufferCache.get(file);
	}

	const promise = (async () => {
		const response = await fetch(file);
		if (!response?.ok) {
			Console.warn(`[Sound] Failed to load: ${file} (${response.status})`);
			return null;
		}
		const arrayBuffer = await response.arrayBuffer();
		return _audioContext.decodeAudioData(arrayBuffer);
	})();

	_audioBufferCache.set(file, promise);
	return promise;
};

class Sound {
	_audioBuffer = null;
	_gainNode = null;
	_source = null;
	_startTime = 0;
	_pausedAt = 0;
	_isPlaying = false;
	_speed = 1;
	_volume = 1;
	_loop = false;

	constructor({
		file,
		cached = false,
		speed = 1,
		volume = 1,
		loop = false,
		_cacheSize = 5,
	}) {
		this.file = file;
		this.cached = cached;
		this._speed = speed;
		this._volume = volume;
		this._loop = loop;

		this._gainNode = _audioContext.createGain();
		this._gainNode.gain.value = volume;
		this._gainNode.connect(_audioContext.destination);

		_loadAudioBuffer(file).then((buffer) => {
			this._audioBuffer = buffer;
		});
	}

	play(resume = false) {
		_resumeAudio();

		if (!this._audioBuffer) {
			return;
		}

		// Non-cached sounds stop previously playing source to avoid overlapping
		if (!this.cached && this._source) {
			try {
				this._source.stop();
			} catch {
				// Ignore if already stopped
			}
		}

		const newSource = _audioContext.createBufferSource();
		newSource.buffer = this._audioBuffer;
		newSource.playbackRate.value = this._speed;
		newSource.loop = this._loop;
		newSource.connect(this._gainNode);

		if (resume && this._pausedAt) {
			this._startTime = _audioContext.currentTime - this._pausedAt;
			newSource.start(0, this._pausedAt);
		} else {
			this._startTime = _audioContext.currentTime;
			newSource.start(0);
		}

		newSource.onended = () => {
			if (this._source === newSource) {
				this._isPlaying = false;
			}
		};

		this._source = newSource;
		this._isPlaying = true;
	}

	pause() {
		if (this.cached) {
			Console.warn("Cached sound can only play.");
			return;
		}
		if (this._source && this._isPlaying) {
			const elapsed = _audioContext.currentTime - this._startTime;
			this._pausedAt = elapsed;
			try {
				this._source.stop();
			} catch {
				// Ignore if already stopped
			}
			this._isPlaying = false;
		}
	}

	resume() {
		if (this.cached) {
			Console.warn("Cached sound can only play.");
			return;
		}
		if (this._pausedAt) {
			this.play(true);
		} else {
			this.play();
		}
	}

	stop() {
		if (this.cached) {
			Console.warn("Cached sound can only play.");
			return;
		}
		if (this._source) {
			try {
				this._source.stop();
			} catch {
				// Ignore if already stopped
			}
			this._pausedAt = 0;
			this._isPlaying = false;
		}
	}

	isPlaying() {
		return this._isPlaying;
	}
}

export { Sound };
