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
    doRadiosity: true,
    emissiveOffset: 1.5,
    emissiveMult: 3.0,
    emissiveIteration: 9,
    noiseAmmount: 0.125,
    noiseSpeed: 0.1,

    // controls
    forward: 87,
    backwards: 83,
    left: 65,
    right: 68,
    moveSpeed: 5,
    lookSensitivity: 5
};

const Settings = {};

const saveSettings = () => {
    try {
        localStorage.setItem('settings', JSON.stringify(Settings));
        return true;
    } catch (error) {
        Console.log('Failed to save settings:', error);
        return false;
    }
};

// Initialize settings
try {
    const stored = localStorage.getItem('settings');
    if (stored) {
        Console.log('Using stored settings');
        Object.assign(Settings, defaults, JSON.parse(stored));
    } else {
        Console.log('Using default settings');
        Object.assign(Settings, defaults);
        saveSettings();
    }
} catch (error) {
    Console.log('Error loading settings, using defaults:', error);
    Object.assign(Settings, defaults);
}

// Register console commands
Console.registerCmd('settings', Settings);
Console.registerCmd('sstore', saveSettings);

export default Settings;
