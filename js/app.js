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
        // När GAPI är laddat, ladda klienten
        window.gapi.load('client', () => {
            // Konfiguration för Google API med dina nycklar
            const GOOGLE_API_CONFIG = {
                apiKey: "AIzaSyDGamRgGYt-Bl2Mj0znqAG7uFWM9TC0VgU", 
                clientId: "226642349583-913r35jvi56ottpgg52b9odp7ba0asbs.apps.googleusercontent.com", 
                appId: "226642349583", 
            };
            initGoogleClient(GOOGLE_API_CONFIG);
        });
    };
    document.head.appendChild(gapiScript);

    // Ladda Google Sign-In (GSI) skriptet separat
    const gsiScript = document.createElement('script');
    gsiScript.src = 'https://accounts.google.com/gsi/client';
    gsiScript.async = true;
    gsiScript.defer = true;
    document.head.appendChild(gsiScript);

    // Starta Firebase-autentisering och skicka med en callback
    initializeAuthListener(async () => {
        // Denna kod körs efter att användaren är inloggad och all data har hämtats.
        // Kör återkommande transaktioner i "tyst" läge (visar inga toasts om inget händer).
        await runRecurringTransactions(true);
    });
}

main();
