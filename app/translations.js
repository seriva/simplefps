import Console from './console';

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
if (!t.hasOwnProperty(language)) {
    language = 'en-US';
}

Console.log('Language: ' + language);

const Translations = {
    get: (key) => {
        if (!t[language].hasOwnProperty(key)) {
            return '*UNKNOWN KEY*';
        }
        return t[language][key];
    }
};

export { Translations as default };
