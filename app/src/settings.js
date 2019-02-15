import Utils from './utils.js';
import Console from './console.js';

let Settings = {
    // rendering
    znear: 0.1,
    zfar: 1000,
    renderscale: 1.0,
    dofxaa: true,
    dossao: true,
    ssaoRadius: 64,
    ssaoBias: 0.4,
    ssaoAttenuation: [1, 2],
    anisotropicFiltering: 16,

    // controls
    forward: 87,
    backwards: 83,
    left: 65,
    right: 68,
    movespeed: 5,
    looksensitivity: 5
};

Console.log(`Env: ${window.env}`);

// load possible settings from local storage
if (window.localStorage.getItem('settings') !== null) {
    Console.log('Using stored settings');
    Settings = JSON.parse(localStorage.getItem('settings'));
} else {
    // mobile preset for better performance
    if (Utils.isMobile()) {
        Console.log('Using mobile graphics preset');
        Settings.renderscale = 0.5;
    }
    localStorage.setItem('settings', JSON.stringify(Settings));
}

Console.registerCmd('settings', Settings);
Console.registerCmd('sstore', () => {
    localStorage.setItem('settings', JSON.stringify(Settings));
});

export { Settings as default };
