// js/ui/banking.js
import { getState, setState } from '../state.js';
import { renderSpinner, showToast, showConfirmationModal } from './utils.js';
import { renderTransactionForm } from './transactions.js';
import { saveDocument, fetchAllCompanyData } from '../services/firestore.js';
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js';
import { db } from '../../firebase-config.js';
import { getLearnedCategorySuggestion } from '../services/ai.js';
import { t } from '../i18n.js';

const EXCHANGE_TOKEN_URL = 'https://tink-exchange-token-226642349583.europe-west1.run.app';
const FETCH_DATA_URL = 'https://tink-fetch-data-226642349583.europe-west1.run.app';
const TINK_CLIENT_ID = '3062b812f1d340b986a70df838755c29';
const REDIRECT_URI = 'https://ewilliamhertz.github.io/Flowbooks3/app.html';

export function renderBankingPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <h3>${t('bankReconciliation')}</h3>
            <p>${t('connectBankAccountDescription')}</p>
            <button id="connect-bank-btn" class="btn btn-primary">${t('connectBankAccount')}</button>
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
        showToast(t('authenticationFailed'), 'error');
        container.innerHTML = `<div class="card text-center"><p>${t('couldNotFinalizeConnection')}</p></div>`;
        return;
    }

    if (!code) {
        renderAccountAndTransactionViews();
        return;
    }

    try {
        showToast(t('verifyingConnection'), "info");
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
        showToast(t('connectionSuccessFetchAccounts'), "success");

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
        showToast(t('anErrorOccurredTryAgain'), "error");
        container.innerHTML = `<div class="card text-center"><p>${t('couldNotFinalizeConnection')}</p></div>`;
    }
}

function renderAccountAndTransactionViews() {
    const { bankAccounts, bankTransactions } = getState();
    const container = document.getElementById('banking-content-container');

    if (!bankAccounts || bankAccounts.length === 0) {
        container.innerHTML = `<div class="card text-center"><p>${t('noBankAccountConnected')}</p></div>`;
        return;
    }

    const accountTabs = bankAccounts.map(acc => `
        <button class="btn filter-btn" data-account-id="${acc.id}">
            ${acc.name} (${acc.balances.booked.amount.value.toLocaleString(undefined, {style: 'currency', currency: acc.balances.booked.amount.currency})})
        </button>
    `).join('');

    container.innerHTML = `
        <div class="card">
            <h4>${t('selectAccountToReconcile')}</h4>
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

async function renderTransactionsForAccount(accountId) {
    const container = document.getElementById('transaction-list-container');
    const { bankTransactions, allInvoices, allTransactions, categories } = getState();

    const matchedBankTransactionIds = allTransactions
        .map(t => t.matchedBankTransactionId)
        .filter(Boolean);

    const transactionsForAccount = bankTransactions
        .filter(t => t.accountId === accountId && !matchedBankTransactionIds.includes(t.id))
        .sort((a, b) => new Date(b.dates.booked) - new Date(a.dates.booked));

    const transactionsWithAI = await Promise.all(transactionsForAccount.map(async t => {
        if (t.type === 'DEBIT') {
            const suggestion = await getLearnedCategorySuggestion({ description: t.descriptions.display, party: t.descriptions.display }, allTransactions);
            const categoryName = categories.find(c => c.id === suggestion)?.name;
            return { ...t, aiCategorySuggestion: categoryName, aiCategoryId: suggestion };
        }
        return t;
    }));

    const unpaidInvoices = allInvoices.filter(i => i.status === 'Skickad' || i.status === 'Delvis betald');

    const rows = transactionsWithAI.map(t => {
        const amount = t.amount.value;
        const type = t.type;
        let statusHtml = '';

        if (type === 'CREDIT') {
            const potentialMatch = unpaidInvoices.find(inv => inv.balance === amount);
            if (potentialMatch) {
                statusHtml = `
                    <div class="match-suggestion">
                        <span class="badge badge-member">${t('suggestion')}</span>
                        <span>${t('matchesInvoice')} #${potentialMatch.invoiceNumber}</span>
                        <button class="btn btn-sm btn-success btn-confirm-match" data-invoice-id="${potentialMatch.id}" data-bank-tx-id="${t.id}">${t('approve')}</button>
                    </div>`;
            }
        } else if (t.aiCategorySuggestion) {
            statusHtml = `
                <div class="match-suggestion">
                    <span class="badge badge-owner">${t('aiSuggestion')}</span>
                    <span>${t('category')}: ${t.aiCategorySuggestion}</span>
                    <button class="btn btn-sm btn-success btn-ai-match" data-bank-tx-id="${t.id}" data-category-id="${t.aiCategoryId}">${t('approveAndPost')}</button>
                </div>`;
        }

        if (!statusHtml) {
            statusHtml = `<button class="btn btn-sm btn-primary btn-book-manually" data-bank-tx-id="${t.id}">${t('bookManually')}</button>`;
        }

        return `<tr>
                    <td>${t.dates.booked}</td>
                    <td>${t.descriptions.display}</td>
                    <td class="text-right ${type === 'CREDIT' ? 'green' : 'red'}">${amount.toLocaleString(undefined, {style: 'currency', currency: t.amount.currency})}</td>
                    <td>${statusHtml}</td>
                </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="card">
            <h3 class="card-title">${t('transactionsToReconcile')}</h3>
            <table class="data-table">
                <thead><tr><th>${t('date')}</th><th>${t('description')}</th><th class="text-right">${t('amount')}</th><th>${t('actions')}</th></tr></thead>
                <tbody>${rows.length > 0 ? rows : `<tr><td colspan="4" class="text-center">${t('noNewTransactionsToReconcile')}</td></tr>`}</tbody>
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
                matchedBankTransactionId: bankTx.id
            };
            renderTransactionForm(type, prefillData);
        });
    });

    document.querySelectorAll('.btn-ai-match').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const bankTxId = e.target.dataset.bankTxId;
            const categoryId = e.target.dataset.categoryId;
            const { bankTransactions, categories } = getState();
            const bankTx = bankTransactions.find(t => t.id === bankTxId);
            const categoryName = categories.find(c => c.id === categoryId)?.name;

            const prefillData = {
                date: bankTx.dates.booked,
                description: bankTx.descriptions.display,
                party: bankTx.descriptions.display,
                amount: Math.abs(bankTx.amount.value),
                categoryId: categoryId,
                matchedBankTransactionId: bankTx.id
            };

            const type = bankTx.type === 'CREDIT' ? 'income' : 'expense';
            showConfirmationModal(async () => {
                const originalText = btn.textContent;
                btn.disabled = true;
                btn.textContent = t('saving');
                try {
                    const collectionName = type === 'income' ? 'incomes' : 'expenses';
                    await saveDocument(collectionName, prefillData);
                    await fetchAllCompanyData();
                    const activeAccountId = document.querySelector('.filter-btn.active')?.dataset.accountId;
                    if(activeAccountId) {
                        renderTransactionsForAccount(activeAccountId);
                    }
                    showToast("transactionSaved", "success");
                } catch(error) {
                    console.error("Error saving transaction:", error);
                    showToast("couldNotSave", "error");
                } finally {
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            }, t('confirmAiSuggestion'), t('confirmPostTransactionInCategory').replace('{categoryName}', categoryName));
        });
    });
}

async function confirmInvoiceMatch(invoiceId, bankTxId, buttonElement) {
    const { allInvoices, bankTransactions } = getState();
    const invoice = allInvoices.find(inv => inv.id === invoiceId);
    const bankTx = bankTransactions.find(tx => tx.id === bankTxId);

    if (!invoice || !bankTx) {
        showToast("couldNotFindInvoiceOrTransaction", "error");
        return;
    }

    buttonElement.disabled = true;
    buttonElement.textContent = t('matching');

    try {
        const paymentAmount = Math.abs(bankTx.amount.value);
        const paymentDate = bankTx.dates.booked;

        const newBalance = invoice.balance - paymentAmount;
        const newStatus = newBalance <= 0 ? 'Betald' : 'Delvis betald';
        const newPayment = { date: paymentDate, amount: paymentAmount };

        const paymentRatio = paymentAmount / invoice.grandTotal;
        const paymentExclVat = invoice.subtotal * paymentRatio;
        const paymentVatAmount = invoice.totalVat * paymentRatio;

        const incomeData = {
            date: paymentDate,
            description: `${t('paymentForInvoice')} #${invoice.invoiceNumber}`,
            party: invoice.customerName,
            amount: paymentAmount,
            amountExclVat: paymentExclVat,
            vatAmount: paymentVatAmount,
            categoryId: null,
            isCorrection: false,
            generatedFromInvoiceId: invoiceId,
            matchedBankTransactionId: bankTxId
        };
        await saveDocument('incomes', incomeData);

        const invoiceRef = doc(db, 'invoices', invoiceId);
        await updateDoc(invoiceRef, {
            balance: newBalance,
            status: newStatus,
            payments: [...(invoice.payments || []), newPayment]
        });

        await fetchAllCompanyData();
        showToast(t('invoiceMatchedAndPaid').replace('{invoiceNumber}', invoice.invoiceNumber), 'success');

        const activeAccountId = document.querySelector('.filter-btn.active')?.dataset.accountId;
        if(activeAccountId) {
            renderTransactionsForAccount(activeAccountId);
        }

    } catch(error) {
        console.error("Error matching invoice:", error);
        showToast("couldNotCompleteMatch", "error");
        buttonElement.disabled = false;
        buttonElement.textContent = t('approve');
    }
}