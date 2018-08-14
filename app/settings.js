import Utils from './utils';
import Console from './console';

const Settings = {
    // rendering
    znear: 0.1,
    zfar: 1000,
    renderscale: 1.0,
    dofxaa: true,
    dossao: true,


    // controls
    forward: 87,
    backwards: 83,
    left: 65,
    right: 68,
    movespeed: 5,
    looksensitivity: 5
};

// mobile preset for better performance
if (Utils.isMobile()) {
    Console.log('Using mobile graphics preset');
    Settings.renderscale = 0.5;
}

Console.registerCmd('settings', Settings);

export { Settings as default };
