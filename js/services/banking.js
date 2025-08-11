// js/services/banking.js
// This file handles all communication with the Tink API via our secure Firebase Functions backend.

import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-functions.js";
// We import the initialized 'functions' service from our central firebase-config file.
// This ensures we are using the same Firebase app instance everywhere.
import { functions } from '../../firebase-config.js'; 
import { showToast } from '../ui/utils.js';

// Create references to our callable cloud functions.
// This allows us to call our backend functions as if they were local functions.
const exchangeCodeFunction = httpsCallable(functions, 'exchangeCodeForToken');
const fetchBankDataFunction = httpsCallable(functions, 'fetchBankData');

/**
 * Opens the Tink Link popup window for the user to authenticate with their bank.
 * @returns {Promise<string>} A promise that resolves with an authorization_code from Tink upon success.
 */
function getAuthorizationCode() {
    return new Promise((resolve, reject) => {
        // This creates the Tink Link popup with our specific configuration.
        const tinkLink = TinkLink.create({
            // Your public client ID from the Tink Console.
            clientId: "3062b812f1d340b986a70df838755c29", 
            // The URL the user is sent back to after logging in. This MUST be registered in the Tink Console.
            // Using window.location.href makes it work for both local testing and the final deployed version.
            redirectUri: window.location.href,
            // Specify the Swedish market.
            market: 'SE',
            // Specify the Swedish language.
            locale: 'sv_SE',
            // This function is called by Tink Link when the user has successfully logged in.
            onSuccess: (data) => {
                console.log("Tink Link Success:", data);
                resolve(data.code); // We only need the temporary authorization code.
            },
            // This function is called if the user cancels or if an error occurs.
            onError: (error) => {
                console.error("Tink Link Error:", error);
                reject(error);
            }
        });
        // Open the Tink Link popup.
        tinkLink.open();
    });
}

/**
 * The main function that orchestrates the entire bank connection flow.
 * @returns {Promise<Object>} A promise that resolves with an object containing the user's accounts and transactions.
 */
export async function connectAndFetchBankData() {
    try {
        // Step 1: Open Tink Link and get the temporary authorization code.
        showToast("Vänligen logga in på din bank...", "info");
        const code = await getAuthorizationCode();
        
        // Step 2: Securely send the code to our backend to exchange it for a permanent access token.
        showToast("Verifierar anslutning...", "info");
        const tokenResult = await exchangeCodeFunction({ code: code });
        const accessToken = tokenResult.data.accessToken;

        if (!accessToken) {
            throw new Error("Kunde inte hämta access token från backend.");
        }
        
        // Step 3: Use the access token to securely fetch accounts and transactions via our backend.
        showToast("Hämtar konton och transaktioner...", "info");
        const bankDataResult = await fetchBankDataFunction({ accessToken: accessToken });
        
        // Step 4: Return the final data to the UI.
        return bankDataResult.data;

    } catch (error) {
        // If any step fails, log the error and throw it so the UI can display a message.
        console.error("Bankanslutningen misslyckades:", error);
        throw error;
    }
}
