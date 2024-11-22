import Console from './console.js';

const load = (file, speed = 1, volume = 1, loop = false) => {
    const sound = new Audio(file);
    Object.assign(sound, { playbackRate: speed, volume, loop });
    return sound;
};

class Sound {
    #cache = {};

    #sound;

    constructor({
        file,
        cached = false,
        speed = 1,
        volume = 1,
        loop = false,
        cacheSize = 5
    }) {
        this.file = file;
        this.cached = cached;
        this.cacheSize = cacheSize;

        if (cached) {
            for (let i = 0; i < cacheSize; i++) {
                this.#cache[`${file}_${i}`] = load(file, speed, volume, loop);
            }
        } else {
            this.#sound = load(file, speed, volume, loop);
        }
    }

    play() {
        if (!this.cached) {
            this.#sound.play();
            return;
        }

        const availableIndex = Object.keys(this.#cache)
            .find((key) => this.#cache[key].paused);

        if (availableIndex) {
            this.#cache[availableIndex].play();
        }
    }

    pause() {
        if (!this.cached) {
            this.#sound.pause();
            return;
        }
        Console.warn('Cached sound can only play.');
    }
}

export default Sound;
