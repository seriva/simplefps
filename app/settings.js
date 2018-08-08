import Utils from './utils';

window.settings = {
    // rendering
    renderscale: 1.0,
    dofxaa: true,

    // controls
    forward: 87,
    backwards: 83,
    left: 65,
    right: 68,
    movespeed: 5,
    looksensitivity: 5
};

// mobile for performance
if (Utils.isMobile()) {
    settings.renderscale = 0.5;
}
