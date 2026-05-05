import { Console } from "./console.js";

// Private audio context
const _audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Private function to load audio
const _load = async (file, speed = 1, volume = 1, loop = false) => {
	const response = await fetch(file);
	if (!response?.ok) {
		Console.warn(`[Sound] Failed to load: ${file} (${response.status})`);
		return null;
	}
	const arrayBuffer = await response.arrayBuffer();
	const audioBuffer = await _audioContext.decodeAudioData(arrayBuffer);

	const source = _audioContext.createBufferSource();
	source.buffer = audioBuffer;
	source.playbackRate.value = speed;
	source.loop = loop;

	const gainNode = _audioContext.createGain();
	gainNode.gain.value = volume;

	source.connect(gainNode).connect(_audioContext.destination);

	return { source, gainNode };
};

class Sound {
	_cache = {};
	_sound;
	_startTime = 0;
	_pausedAt = 0;
	_isPlaying = false;
	_nextCacheIndex = 0;

	constructor({
		file,
		cached = false,
		speed = 1,
		volume = 1,
		loop = false,
		cacheSize = 5,
	}) {
		this.file = file;
		this.cached = cached;
		this.cacheSize = cacheSize;

		if (cached) {
			for (let i = 0; i < cacheSize; i++) {
				_load(file, speed, volume, loop).then((sound) => {
					this._cache[`${file}_${i}`] = sound;
				});
			}
		} else {
			_load(file, speed, volume, loop).then((sound) => {
				this._sound = sound;
			});
		}
	}

	play(resume = false) {
		if (!this.cached) {
			if (!this._sound) {
				Console.warn("[Sound] Not ready yet, skipping play");
				return;
			}
			const newSource = _audioContext.createBufferSource();
			newSource.buffer = this._sound.source.buffer;
			newSource.playbackRate.value = this._sound.source.playbackRate.value;
			newSource.loop = this._sound.source.loop;
			newSource.connect(this._sound.gainNode);

			if (resume && this._pausedAt) {
				this._startTime = _audioContext.currentTime - this._pausedAt;
				newSource.start(0, this._pausedAt);
			} else {
				this._startTime = _audioContext.currentTime;
				newSource.start(0);
			}

			this._sound.source = newSource;
			this._isPlaying = true;
			return;
		}

		const key = `${this.file}_${this._nextCacheIndex}`;
		this._nextCacheIndex = (this._nextCacheIndex + 1) % this.cacheSize;
		const cachedSound = this._cache[key];

		if (cachedSound) {
			const newSource = _audioContext.createBufferSource();
			newSource.buffer = cachedSound.source.buffer;
			newSource.playbackRate.value = cachedSound.source.playbackRate.value;
			newSource.loop = cachedSound.source.loop;
			newSource.connect(cachedSound.gainNode);

			if (resume && this._pausedAt) {
				this._startTime = _audioContext.currentTime - this._pausedAt;
				newSource.start(0, this._pausedAt);
			} else {
				this._startTime = _audioContext.currentTime;
				newSource.start(0);
			}

			this._cache[key].source = newSource;
			this._isPlaying = true;
		}
	}

	pause() {
		if (!this.cached) {
			const elapsed = _audioContext.currentTime - this._startTime;
			this._pausedAt = elapsed;
			this._sound.source.stop();
			this._isPlaying = false;
			return;
		}
		Console.warn("Cached sound can only play.");
	}

	resume() {
		if (!this.cached) {
			if (this._pausedAt) {
				this.play(true);
			} else {
				this.play();
			}
			return;
		}
		Console.warn("Cached sound can only play.");
	}

	stop() {
		if (!this.cached) {
			this._sound.source.stop();
			this._pausedAt = 0;
			this._isPlaying = false;
			return;
		}
		Console.warn("Cached sound can only play.");
	}

	isPlaying() {
		return this._isPlaying;
	}
}

export { Sound };
