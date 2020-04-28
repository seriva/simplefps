import Console from './console.js';

const load = (file, speed, volume, loop) => {
    const sound = new Audio(file);
    sound.playbackRate = speed;
    sound.volume = volume;
    sound.loop = loop;
    return sound;
};

class Sound {
    constructor(data) {
        const t = this;
        t.cache = {};
        t.cacheSize = 5;
        t.file = data.file;
        t.cached = data.cached;
        t.speed = data.speed;
        t.volume = data.volume;
        t.loop = data.loop;

        if (t.cached) {
            for (let i = 0; i < t.cacheSize; i++) {
                const sound = load(t.file, t.speed, t.volume, t.loop);
                t.cache[`${t.file}_${i}`] = sound;
            }
        } else {
            t.sound = load(t.file, t.speed, t.volume, t.loop);
        }
    }

    play() {
        const t = this;
        if (t.cached) {
            let itr = 0;
            while (!t.cache[`${t.file}_${itr}`].paused) {
                itr += 1;
                if (itr > t.cacheSize - 1) return;
            }
            t.cache[`${t.file}_${itr}`].play();
        } else {
            t.sound.play();
        }
    }

    pause() {
        const t = this;
        if (!t.cached) {
            t.sound.pause();
        } else {
            Console.warn('Cached sound can only play.');
        }
    }
}

export { Sound as default };
