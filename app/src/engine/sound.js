import Console from "./console.js";

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const load = async (file, speed = 1, volume = 1, loop = false) => {
	const response = await fetch(file);
	const arrayBuffer = await response.arrayBuffer();
	const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

	const source = audioContext.createBufferSource();
	source.buffer = audioBuffer;
	source.playbackRate.value = speed;
	source.loop = loop;

	const gainNode = audioContext.createGain();
	gainNode.gain.value = volume;

	source.connect(gainNode).connect(audioContext.destination);

	return { source, gainNode };
};

class Sound {
	#cache = {};
	#sound;
	#startTime = 0;
	#pausedAt = 0;
	#isPlaying = false;

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
				load(file, speed, volume, loop).then((sound) => {
					this.#cache[`${file}_${i}`] = sound;
				});
			}
		} else {
			load(file, speed, volume, loop).then((sound) => {
				this.#sound = sound;
			});
		}
	}

	play(resume = false) {
		if (!this.cached) {
			const newSource = audioContext.createBufferSource();
			newSource.buffer = this.#sound.source.buffer;
			newSource.playbackRate.value = this.#sound.source.playbackRate.value;
			newSource.loop = this.#sound.source.loop;
			newSource.connect(this.#sound.gainNode);

			if (resume && this.#pausedAt) {
				this.#startTime = audioContext.currentTime - this.#pausedAt;
				newSource.start(0, this.#pausedAt);
			} else {
				this.#startTime = audioContext.currentTime;
				newSource.start(0);
			}

			this.#sound.source = newSource;
			this.#isPlaying = true;
			return;
		}

		const availableIndex = Object.keys(this.#cache).find(
			(key) => this.#cache[key].source.buffer,
		);

		if (availableIndex) {
			const cachedSound = this.#cache[availableIndex];
			const newSource = audioContext.createBufferSource();
			newSource.buffer = cachedSound.source.buffer;
			newSource.playbackRate.value = cachedSound.source.playbackRate.value;
			newSource.loop = cachedSound.source.loop;
			newSource.connect(cachedSound.gainNode);

			if (resume && this.#pausedAt) {
				this.#startTime = audioContext.currentTime - this.#pausedAt;
				newSource.start(0, this.#pausedAt);
			} else {
				this.#startTime = audioContext.currentTime;
				newSource.start(0);
			}

			this.#cache[availableIndex].source = newSource;
			this.#isPlaying = true;
		}
	}

	pause() {
		if (!this.cached) {
			const elapsed = audioContext.currentTime - this.#startTime;
			this.#pausedAt = elapsed;
			this.#sound.source.stop();
			this.#isPlaying = false;
			return;
		}
		Console.warn("Cached sound can only play.");
	}

	resume() {
		if (!this.cached) {
			if (this.#pausedAt) {
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
			this.#sound.source.stop();
			this.#pausedAt = 0;
			this.#isPlaying = false;
			return;
		}
		Console.warn("Cached sound can only play.");
	}

	isPlaying() {
		return this.#isPlaying;
	}
}

export default Sound;
