import Console from './console.js';

let l = navigator.language;

const t = {
    'en-US': {
        YES: 'Yes',
        NO: 'No',
        CONTINUE_GAME: 'Continue game',
        EXIT: 'Exit',
        MAIN_MENU: 'Main Menu',
        VERSION_CHECK: 'Check for updates',
        VERSION_NEW: 'A new version is available. Do you want to update now?'
    }
};

// Fallback if the language does not exist
if (!Object.prototype.hasOwnProperty.call(t, l)) {
    l = 'en-US';
}

Console.log(`Language ${localStorage}`);

const Translations = {
    get: (key) => {
        if (!Object.prototype.hasOwnProperty.call(t[l], key)) {
            return '*UNKNOWN KEY*';
        }
        return t[l][key];
    }
};

export { Translations as default };
