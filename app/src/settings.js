import Utils from './utils.js';
import Console from './console.js';

const defaults = {
    // rendering
    zNear: 1,
    zFar: 256,
    renderScale: Utils.isMobile() ? 0.5 : 1.0,
    anisotropicFiltering: 16,
    gamma: 1.0,
    doFXAA: true,
    doRadiosity: !Utils.isMobile(),
    emissiveOffset: 1.5,
    emissiveMult: 3.0,
    emissiveIteration: 9,
    noiseAmmount: 0.15,
    noiseSpeed: 0.1,

    // controls
    forward: 87,
    backwards: 83,
    left: 65,
    right: 68,
    moveSpeed: 5,
    lookSensitivity: 5
};

let Settings = {};

// load possible settings from local storage
if (window.localStorage.getItem('settings') !== null) {
    Console.log('Using stored settings');
    const stored = JSON.parse(localStorage.getItem('settings'));
    Settings = { ...defaults, ...stored };
} else {
    Console.log('Using default settings');
    Settings = defaults;
    localStorage.setItem('settings', JSON.stringify(Settings));
}

Console.registerCmd('settings', Settings);
Console.registerCmd('sstore', () => {
    localStorage.setItem('settings', JSON.stringify(Settings));
});

export { Settings as default };
