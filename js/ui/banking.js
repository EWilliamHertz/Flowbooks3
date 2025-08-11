import { getState, setState } from '../state.js';
import { renderSpinner, showToast } from './utils.js';
import { connectAndFetchBankData } from '../services/banking.js';

export function renderBankingPage() {
    const { bankAccounts } = getState();
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <div class="card-title-container" style="display: flex; justify-content: space-between; align-items: center;">
                <h3>Bankavstämning</h3>
                <button id="connect-bank-btn" class="btn btn-primary">Anslut Bank</button>
            </div>
            <p>Anslut ditt företagskonto via Tink för att automatiskt hämta transaktioner.</p>
        </div>
        <div id="banking-content-container" style="margin-top: 1.5rem;"></div>`;
    document.getElementById('connect-bank-btn').addEventListener('click', handleConnectBank);
    if (bankAccounts && bankAccounts.length > 0) {
        renderAccountAndTransactionViews();
    } else {
        document.getElementById('banking-content-container').innerHTML = `<div class="card text-center"><p>Inget bankkonto är anslutet än.</p></div>`;
    }
}

async function handleConnectBank() {
    const btn = document.getElementById('connect-bank-btn');
    btn.disabled = true;
    btn.textContent = 'Väntar på bank...';
    try {
        const bankData = await connectAndFetchBankData();
        setState({ bankAccounts: bankData.accounts, bankTransactions: bankData.transactions });
        showToast("Bankanslutningen lyckades!", "success");
        renderAccountAndTransactionViews();
    } catch (error) {
        showToast("Bankanslutningen avbröts eller misslyckades.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Anslut Bank';
    }
}

function renderAccountAndTransactionViews() {
    const { bankAccounts } = getState();
    const container = document.getElementById('banking-content-container');
    const accountTabs = bankAccounts.map(acc => `<button class="btn filter-btn" data-account-id="${acc.id}">${acc.name} (${acc.balances.booked.amount.value.toLocaleString('sv-SE', {style: 'currency', currency: acc.balances.booked.amount.currency})})</button>`).join('');
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