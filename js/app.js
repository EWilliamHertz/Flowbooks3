// js/app.js
import { initializeAuthListener } from './services/auth.js';
import { initGoogleClient } from './services/google.js';
import { runRecurringTransactions } from './ui/recurring.js';

function main() {
    // Dynamiskt ladda Google-skripten
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.async = true;
    gapiScript.defer = true;
    gapiScript.onload = () => {
        window.gapi.load('client', () => {
            const GOOGLE_API_CONFIG = {
                apiKey: "AIzaSyDGamRgGYt-Bl2Mj0znqAG7uFWM9TC0VgU", 
                clientId: "226642349583-913r35jvi56ottpgg52b9odp7ba0asbs.apps.googleusercontent.com", 
                appId: "226642349583", 
            };
            initGoogleClient(GOOGLE_API_CONFIG);
        });
    };
    document.head.appendChild(gapiScript);

    const gsiScript = document.createElement('script');
    gsiScript.src = 'https://accounts.google.com/gsi/client';
    gsiScript.async = true;
    gsiScript.defer = true;
    document.head.appendChild(gsiScript);

    initializeAuthListener(async () => {
        await runRecurringTransactions(true);
    });
}

main();