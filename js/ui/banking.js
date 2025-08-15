// js/ui/banking.js
import { getState, setState } from '../state.js';
import { renderSpinner, showToast } from './utils.js';
import { renderTransactionForm } from './transactions.js';
import { saveDocument, fetchAllCompanyData } from '../services/firestore.js';
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js';
import { db } from '../../firebase-config.js';

// --- (Befintlig kod för Tink-anslutning förblir oförändrad) ---
const EXCHANGE_TOKEN_URL = 'https://tink-exchange-token-226642349583.europe-west1.run.app';
const FETCH_DATA_URL = 'https://tink-fetch-data-226642349583.europe-west1.run.app';
const TINK_CLIENT_ID = '3062b812f1d340b986a70df838755c29';
const REDIRECT_URI = 'https://ewilliamhertz.github.io/Flowbooks3/app.html';

export function renderBankingPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <h3>Bankavstämning</h3>
            <p>Anslut ditt företagskonto via Tink för att automatiskt hämta transaktioner och stämma av dem mot din bokföring.</p>
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
        renderAccountAndTransactionViews(); // Rendera vyn även om ingen kod finns
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
    const { bankAccounts, bankTransactions } = getState();
    const container = document.getElementById('banking-content-container');

    if (!bankAccounts || bankAccounts.length === 0) {
        container.innerHTML = `<div class="card text-center"><p>Inget bankkonto är anslutet än.</p></div>`;
        return;
    }

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
    const { bankTransactions, allInvoices, allTransactions } = getState();
    
    // Hitta alla transaktioner i bokföringen som redan är matchade mot en banktransaktion
    const matchedBankTransactionIds = allTransactions
        .map(t => t.matchedBankTransactionId)
        .filter(Boolean);

    const transactionsForAccount = bankTransactions
        .filter(t => t.accountId === accountId && !matchedBankTransactionIds.includes(t.id)) // Visa bara o-matchade
        .sort((a, b) => new Date(b.dates.booked) - new Date(a.dates.booked));
    
    // --- Logik för matchningsförslag ---
    const unpaidInvoices = allInvoices.filter(i => i.status === 'Skickad' || i.status === 'Delvis betald');
    
    const rows = transactionsForAccount.map(t => {
        const amount = t.amount.value;
        const type = t.type; // CREDIT (inkomst) eller DEBIT (utgift)
        let statusHtml = '';

        // Försök hitta en matchande faktura (endast för inkomster)
        if (type === 'CREDIT') {
            const potentialMatch = unpaidInvoices.find(inv => inv.balance === amount);
            if (potentialMatch) {
                statusHtml = `
                    <div class="match-suggestion">
                        <span class="badge badge-member">Förslag</span>
                        <span>Matchar faktura #${potentialMatch.invoiceNumber}</span>
                        <button class="btn btn-sm btn-success btn-confirm-match" data-invoice-id="${potentialMatch.id}" data-bank-tx-id="${t.id}">Godkänn</button>
                    </div>`;
            }
        }
        
        if (!statusHtml) {
             statusHtml = `<button class="btn btn-sm btn-primary btn-book-manually" data-bank-tx-id="${t.id}">Bokför</button>`;
        }
        
        return `<tr>
                    <td>${t.dates.booked}</td>
                    <td>${t.descriptions.display}</td>
                    <td class="text-right ${type === 'CREDIT' ? 'green' : 'red'}">${amount.toLocaleString('sv-SE', {style: 'currency', currency: t.amount.currency})}</td>
                    <td>${statusHtml}</td>
                </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="card">
            <h3 class="card-title">Transaktioner att stämma av</h3>
            <table class="data-table">
                <thead><tr><th>Datum</th><th>Beskrivning</th><th class="text-right">Belopp</th><th>Åtgärd</th></tr></thead>
                <tbody>${rows.length > 0 ? rows : '<tr><td colspan="4" class="text-center">Inga nya transaktioner att stämma av.</td></tr>'}</tbody>
            </table>
        </div>`;

    attachReconciliationEventListeners();
}

function attachReconciliationEventListeners() {
    document.querySelectorAll('.btn-confirm-match').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const invoiceId = e.target.dataset.invoiceId;
            const bankTxId = e.target.dataset.bankTxId;
            await confirmInvoiceMatch(invoiceId, bankTxId, e.target);
        });
    });

    document.querySelectorAll('.btn-book-manually').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const bankTxId = e.target.dataset.bankTxId;
            const { bankTransactions } = getState();
            const bankTx = bankTransactions.find(t => t.id === bankTxId);
            
            const type = bankTx.type === 'CREDIT' ? 'income' : 'expense';
            const prefillData = {
                date: bankTx.dates.booked,
                description: bankTx.descriptions.display,
                party: bankTx.descriptions.display,
                amount: Math.abs(bankTx.amount.value),
                matchedBankTransactionId: bankTx.id // Spara referens
            };
            renderTransactionForm(type, prefillData);
        });
    });
}

async function confirmInvoiceMatch(invoiceId, bankTxId, buttonElement) {
    const { allInvoices, bankTransactions } = getState();
    const invoice = allInvoices.find(inv => inv.id === invoiceId);
    const bankTx = bankTransactions.find(tx => tx.id === bankTxId);

    if (!invoice || !bankTx) {
        showToast("Kunde inte hitta faktura eller transaktion.", "error");
        return;
    }
    
    buttonElement.disabled = true;
    buttonElement.textContent = "Matchar...";

    try {
        const paymentAmount = Math.abs(bankTx.amount.value);
        const paymentDate = bankTx.dates.booked;
        
        const newBalance = invoice.balance - paymentAmount;
        const newStatus = newBalance <= 0 ? 'Betald' : 'Delvis betald';
        const newPayment = { date: paymentDate, amount: paymentAmount };
        
        const paymentRatio = paymentAmount / invoice.grandTotal;
        const paymentExclVat = invoice.subtotal * paymentRatio;
        const paymentVatAmount = invoice.totalVat * paymentRatio;
        
        // 1. Skapa inkomstposten
        const incomeData = {
            date: paymentDate,
            description: `Betalning för faktura #${invoice.invoiceNumber}`,
            party: invoice.customerName,
            amount: paymentAmount,
            amountExclVat: paymentExclVat,
            vatAmount: paymentVatAmount,
            categoryId: null,
            isCorrection: false,
            generatedFromInvoiceId: invoiceId,
            matchedBankTransactionId: bankTxId // Koppla till banktransaktionen
        };
        await saveDocument('incomes', incomeData);

        // 2. Uppdatera fakturan
        const invoiceRef = doc(db, 'invoices', invoiceId);
        await updateDoc(invoiceRef, {
            balance: newBalance,
            status: newStatus,
            payments: [...(invoice.payments || []), newPayment]
        });

        await fetchAllCompanyData();
        showToast(`Faktura #${invoice.invoiceNumber} har matchats och markerats som betald!`, 'success');
        
        // Rendera om listan
        const activeAccountId = document.querySelector('.filter-btn.active')?.dataset.accountId;
        if(activeAccountId) {
            renderTransactionsForAccount(activeAccountId);
        }

    } catch(error) {
        console.error("Fel vid matchning av faktura: ", error);
        showToast("Kunde inte slutföra matchningen.", "error");
        buttonElement.disabled = false;
        buttonElement.textContent = "Godkänn";
    }
}