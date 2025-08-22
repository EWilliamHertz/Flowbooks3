// js/i18n.js
let translations = {};

// Function to fetch the language JSON file
async function fetchLanguageFile(lang) {
    try {
        const response = await fetch(`i18n/${lang}.json`);
        if (!response.ok) {
            throw new Error(`Could not load language file: ${lang}`);
        }
        return await response.json();
    } catch (error) {
        console.error(error);
        // Fallback to English if the selected language fails to load
        const fallbackResponse = await fetch(`i18n/en.json`);
        return await fallbackResponse.json();
    }
}

// Function to apply translations to the DOM
export function applyTranslations() {
    document.querySelectorAll('[data-i18n-key]').forEach(element => {
        const key = element.dataset.i18nKey;
        const translation = translations[key];
        if (translation) {
            if (element.placeholder) {
                element.placeholder = translation;
            } else {
                element.textContent = translation;
            }
        }
    });
}

// Main function to set the language
export async function setLanguage(lang) {
    translations = await fetchLanguageFile(lang);
    applyTranslations();
    document.documentElement.lang = lang;
    localStorage.setItem('userLanguage', lang);
}

// Function to be used by other modules for dynamic content
export function t(key, replacements = {}) {
    let translation = translations[key] || key;
    for (const placeholder in replacements) {
        translation = translation.replace(`{${placeholder}}`, replacements[placeholder]);
    }
    return translation;
}

// Initialize the language switcher
export function initializeLanguageSwitcher() {
    const languageSwitcher = document.querySelector('.language-switcher');
    if (languageSwitcher) {
        languageSwitcher.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link) {
                e.preventDefault();
                const lang = link.getAttribute('href').replace('#', '');
                setLanguage(lang);
            }
        });
    }
}

// Set the initial language on page load
export function loadInitialLanguage() {
    const savedLang = localStorage.getItem('userLanguage') || 'sv'; // Default to Swedish
    setLanguage(savedLang);
}