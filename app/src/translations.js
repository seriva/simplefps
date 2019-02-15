import Console from './console.js';

let language = navigator.language;

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
if (!Object.prototype.hasOwnProperty.call(t, language)) {
    language = 'en-US';
}

Console.log(`Language ${language}`);

const Translations = {
    get: (key) => {
        if (!Object.prototype.hasOwnProperty.call(t[language], key)) {
            return '*UNKNOWN KEY*';
        }
        return t[language][key];
    }
};

export { Translations as default };
