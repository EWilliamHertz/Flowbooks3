// js/services/google.js
// Hanterar all interaktion med Google Picker och Google Sheets API.

import { showToast } from '../ui/utils.js';

// Konfigurationsvariabler - Dessa kommer fyllas i från app.js
let gapi;
let google;
let pickerApiLoaded = false;
let oAuthToken = null;

let config = {
    apiKey: null,
    clientId: null,
    appId: null,
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly',
};

/**
 * Initialiserar Google API-klienten.
 */
export function initGoogleClient(apiConfig) {
    config = { ...config, ...apiConfig };
    gapi = window.gapi;
    google = window.google;
    gapi.load('client:picker', initializePickerApi);
    gapi.client.load('sheets', 'v4');
}

function initializePickerApi() {
    pickerApiLoaded = true;
}

/**
 * Startar filväljaren (Google Picker).
 * @returns {Promise<string>} ID på den valda filen.
 */
function showPicker() {
    return new Promise((resolve, reject) => {
        const view = new google.picker.View(google.picker.ViewId.SPREADSHEETS);
        view.setMimeTypes("application/vnd.google-apps.spreadsheet");

        const picker = new google.picker.PickerBuilder()
            .setAppId(config.appId)
            .setOAuthToken(oAuthToken)
            .addView(view)
            .setDeveloperKey(config.apiKey)
            .setCallback((data) => {
                if (data[google.picker.Action.PICKED]) {
                    const doc = data[google.picker.Response.DOCUMENTS][0];
                    resolve(doc.id);
                } else if (data[google.picker.Action.CANCEL]) {
                    reject(new Error("Användaren avbröt."));
                }
            })
            .build();
        picker.setVisible(true);
    });
}

/**
 * Hämtar data från ett Google Sheet.
 * @param {string} spreadsheetId - ID på kalkylarket.
 * @returns {Promise<Array<Object>>} En lista med produktobjekt.
 */
async function getSheetData(spreadsheetId) {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'A1:E', // Läs kolumnerna A till E
        });

        const rows = response.result.values;
        if (!rows || rows.length < 2) {
            throw new Error("Kalkylarket är tomt eller innehåller bara en rubrikrad.");
        }

        const header = rows[0].map(h => h.trim().toLowerCase());
        const products = rows.slice(1).map(row => ({
            name: row[header.indexOf('namn')] || '',
            sellingPriceBusiness: parseFloat(row[header.indexOf('pris')]) || 0,
            stock: parseInt(row[header.indexOf('lager')]) || 0,
            imageUrl: row[header.indexOf('bild-url')] || '',
        }));

        return products.filter(p => p.name); // Filtrera bort tomma rader

    } catch (err) {
        console.error("Fel vid hämtning av kalkylarksdata:", err);
        throw new Error("Kunde inte läsa data från det valda kalkylarket.");
    }
}

/**
 * Huvudfunktion som orkestrerar hela importflödet.
 */
export function pickAndParseSheet() {
    return new Promise((resolve, reject) => {
        const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: config.clientId,
            scope: config.scope,
            callback: async (tokenResponse) => {
                oAuthToken = tokenResponse.access_token;
                try {
                    const fileId = await showPicker();
                    showToast("Läser in data från Google Sheet...", "info");
                    const products = await getSheetData(fileId);
                    resolve(products);
                } catch (error) {
                    showToast(error.message, "error");
                    reject(error);
                }
            },
        });

        if (oAuthToken) {
            tokenClient.requestAccessToken({ prompt: '' });
        } else {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        }
    });
}
