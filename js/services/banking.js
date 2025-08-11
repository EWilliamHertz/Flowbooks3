// js/services/banking.js
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-functions.js";
import { functions } from '../../firebase-config.js'; 
import { showToast } from '../ui/utils.js';

const exchangeCodeFunction = httpsCallable(functions, 'exchangeCodeForToken');
const fetchBankDataFunction = httpsCallable(functions, 'fetchBankData');

function getAuthorizationCode() {
    return new Promise((resolve, reject) => {
        console.log("Försöker skapa Tink Link med korrekt URI...");
        const tinkLink = TinkLink.create({
            clientId: "3062b812f1d340b986a70df838755c29", 
            // KORRIGERAD RAD: Använder stort 'F' för att matcha GitHub-projektet
            redirectUri: "https://ewilliamhertz.github.io/Flowbooks3/app.html",
            market: 'SE',
            locale: 'sv_SE',
            onSuccess: (data) => {
                console.log("Tink Link lyckades!", data);
                resolve(data.code);
            },
            onError: (error) => {
                console.error("Ett fel inträffade i Tink Link:", error);
                reject(error);
            }
        });
        tinkLink.open();
    });
}

export async function connectAndFetchBankData() {
    try {
        showToast("Vänligen logga in på din bank...", "info");
        const code = await getAuthorizationCode();
        showToast("Verifierar anslutning...", "info");
        const tokenResult = await exchangeCodeFunction({ code: code });
        const accessToken = tokenResult.data.accessToken;
        if (!accessToken) throw new Error("Kunde inte hämta access token från backend.");
        showToast("Hämtar konton och transaktioner...", "info");
        const bankDataResult = await fetchBankDataFunction({ accessToken: accessToken });
        return bankDataResult.data;
    } catch (error) {
        console.error("Hela bankanslutningen misslyckades:", error);
        throw error;
    }
}
