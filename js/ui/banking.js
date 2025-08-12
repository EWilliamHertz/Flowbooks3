// js/ui/banking.js
import { getState, setState } from '../state.js';
import { renderSpinner, showToast } from './utils.js';

// === KONFIGURATION ===
const EXCHANGE_TOKEN_URL = 'https://tink-exchange-token-226642349583.europe-west1.run.app';
const FETCH_DATA_URL = 'https://tink-fetch-data-226642349583.europe-west1.run.app';
const TINK_CLIENT_ID = '3062b812f1d340b986a70df838755c29';

// UPPDATERAD REDIRECT_URI FÖR FIREBASE HOSTING
const REDIRECT_URI = 'https://flowbooks-73cd9.firebaseapp.com/app.html';

// Huvudfunktion som anropas från navigation.js
export function renderBankingPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <h3>Bankavstämning</h3>
            <p>Anslut ditt företagskonto via Tink för att automatiskt hämta transaktioner.</p>
            <button id="connect-bank-btn" class="btn btn-primary">Anslut Bank</button>
        </div>
        <div id="banking-content-container" style="margin-top: 1.5rem;">
            ${renderSpinner()}
        </div>`;

    document.getElementById('connect-bank-btn').addEventListener('click', redirectToTink);
    
    handleTinkCallback();
}

function redirectToTink() {
    const params = new URLSearchParams({
        client_id: TINK_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: 'accounts:read,transactions:read',
        response_type: 'code',
        market: 'SE',
        locale: 'sv_SE'
    });
    window.location.href = `https://link.tink.com/1.0/authorize?${params.toString()}`;
}

async function handleTinkCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    const container = document.getElementById('banking-content-container');

    if (error) {
        showToast(`Fel från Tink: ${error}`, 'error');
        container.innerHTML = `<div class="card text-center"><p>Autentiseringen misslyckades.</p></div>`;
        return;
    }

    if (!code) {
        container.innerHTML = `<div class="card text-center"><p>Inget bankkonto är anslutet än.</p></div>`;
        return;
    }

    try {
        showToast("Verifierar anslutning...", "info");
        const tokenResponse = await fetch(EXCHANGE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code })
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json();
            throw new Error(errorData.details?.error_description || 'Okänt fel vid token-utbyte');
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        window.history.replaceState({}, document.title, window.location.pathname);
        showToast("Anslutning lyckades! Hämtar konton...", "success");

        const accountsResponse = await fetch(FETCH_DATA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: accessToken, data_type: 'accounts' })
        });
        const accountsData = await accountsResponse.json();
        setState({ bankAccounts: accountsData.accounts });
        
        const transactionsResponse = await fetch(FETCH_DATA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: accessToken, data_type: 'transactions' })
        });
        const transactionsData = await transactionsResponse.json();
        setState({ bankTransactions: transactionsData.transactions });

        renderAccountAndTransactionViews();

    } catch (err) {
        console.error("Callback error:", err);
        showToast(`Ett fel uppstod: ${err.message}`, "error");
        container.innerHTML = `<div class="card text-center"><p>Kunde inte slutföra anslutningen.</p></div>`;
    }
}

function renderAccountAndTransactionViews() {
    const { bankAccounts } = getState();
    const container = document.getElementById('banking-content-container');

    const accountTabs = bankAccounts.map(acc => `
        <button class="btn filter-btn" data-account-id="${acc.id}">
            ${acc.name} (${acc.balances.booked.amount.value.toLocaleString('sv-SE', {style: 'currency', currency: acc.balances.booked.amount.currency})})
        </button>
    `).join('');

    container.innerHTML = `
        <div class="card">
            <h4>Välj konto att stämma av:</h4>
            <div class="filter-container" style="margin-top: 1rem;">${accountTabs}</div>
        </div>
        <div id="transaction-list-container" style="margin-top: 1.5rem;"></div>`;

    const accountButtons = container.querySelectorAll('.filter-btn');
    accountButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            accountButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderTransactionsForAccount(e.target.dataset.accountId);
        });
    });

    if (accountButtons.length > 0) {
        accountButtons[0].classList.add('active');
        renderTransactionsForAccount(accountButtons[0].dataset.accountId);
    }
}

function renderTransactionsForAccount(accountId) {
    const container = document.getElementById('transaction-list-container');
    const { bankTransactions } = getState();
    const transactionsForAccount = bankTransactions.filter(t => t.accountId === accountId);
    
    const rows = transactionsForAccount.map(t => {
        const amount = t.amount.value;
        const type = t.type;
        return `<tr><td>${t.dates.booked}</td><td>${t.descriptions.display}</td><td class="text-right ${type === 'CREDIT' ? 'green' : 'red'}">${amount.toLocaleString('sv-SE', {style: 'currency', currency: t.amount.currency})}</td><td><button class="btn btn-sm btn-secondary">Matcha</button></td></tr>`;
    }).join('');

    container.innerHTML = `
        <div class="card">
            <h3 class="card-title">Transaktioner att stämma av</h3>
            <table class="data-table">
                <thead><tr><th>Datum</th><th>Beskrivning</th><th class="text-right">Belopp</th><th>Åtgärd</th></tr></thead>
                <tbody>${rows.length > 0 ? rows : '<tr><td colspan="4" class="text-center">Inga transaktioner att visa.</td></tr>'}</tbody>
            </table>
        </div>`;
}
