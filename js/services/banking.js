import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-functions.js";
import { showToast } from '../ui/utils.js';

const functions = getFunctions();
const exchangeCodeFunction = httpsCallable(functions, 'exchangeCodeForToken');
const fetchBankDataFunction = httpsCallable(functions, 'fetchBankData');

function getAuthorizationCode() {
    return new Promise((resolve, reject) => {
        const tinkLink = TinkLink.create({
            clientId: "3062b812f1d340b986a70df838755c29",
            redirectUri: window.location.href,
            market: 'SE',
            locale: 'sv_SE',
            onSuccess: (data) => resolve(data.code),
            onError: (error) => reject(error)
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
        if (!accessToken) throw new Error("Kunde inte hämta access token.");
        showToast("Hämtar konton och transaktioner...", "info");
        const bankDataResult = await fetchBankDataFunction({ accessToken: accessToken });
        return bankDataResult.data;
    } catch (error) {
        console.error("Bankanslutningen misslyckades:", error);
        throw error;
    }
}