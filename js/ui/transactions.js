// js/ui/transactions.js
import { getState } from '../state.js';
import { saveDocument, performCorrection, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, renderSpinner, showConfirmationModal } from './utils.js';
import { getControlsHTML, renderTransactionTable, applyFiltersAndRender } from './components.js';
import { navigateTo } from './navigation.js';

export function renderTransactionsPage(type) {
    const mainView = document.getElementById('main-view');
    const { allTransactions, allIncomes, allExpenses } = getState();
    const title = type === 'income' ? 'Registrerade Intäkter' : (type === 'expense' ? 'Registrerade Utgifter' : 'Transaktionshistorik');
    const dataToList = type === 'income' ? allIncomes : (type === 'expense' ? allExpenses : allTransactions);

    mainView.innerHTML = `
        <div class="card">
            <h3 class="card-title">${title}</h3>
            ${getControlsHTML()}
            <div id="table-container">${renderSpinner()}</div>
        </div>`;

    setTimeout(() => {
        applyFiltersAndRender(dataToList, type);
        document.getElementById('search-input').addEventListener('input', () => applyFiltersAndRender(dataToList, type));
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelector('.filter-btn.active').classList.remove('active');
                e.target.classList.add('active');
                applyFiltersAndRender(dataToList, type);
            });
        });
    }, 10);
}

export function renderTransactionForm(type, originalData = {}, isCorrection = false, originalId = null) {
    const mainView = document.getElementById('main-view');
    const { categories } = getState();
    const title = isCorrection ? 'Korrigera Transaktion' : `Registrera Ny ${type === 'income' ? 'Intäkt' : 'Utgift'}`;
    const today = new Date().toISOString().slice(0, 10);
    const categoryOptions = categories.map(cat => `<option value="${cat.id}" ${originalData.categoryId === cat.id ? 'selected' : ''}>${cat.name}</option>`).join('');

    // NYTT: Moms-väljare för utgifter
    const vatSelectorHTML = type === 'expense' ? `
        <div class="input-group">
            <label>Moms (VAT)</label>
            <select id="trans-vat">
                <option value="0" ${originalData.vatRate === 0 ? 'selected' : ''}>0%</option>
                <option value="6" ${originalData.vatRate === 6 ? 'selected' : ''}>6%</option>
                <option value="12" ${originalData.vatRate === 12 ? 'selected' : ''}>12%</option>
                <option value="25" ${originalData.vatRate === 25 ? 'selected' : ''}>25%</option>
            </select>
        </div>` : '';

    mainView.innerHTML = `
        <div class="card" style="max-width: 600px; margin: auto;">
            <h3>${title}</h3>
            ${isCorrection ? `<p class="correction-notice">Du skapar en rättelsepost. Originalposten markeras som rättad och en omvänd post skapas.</p>` : ''}
            <div class="input-group"><label>Datum</label><input id="trans-date" type="date" value="${originalData.date || today}"></div>
            <div class="input-group"><label>Beskrivning</label><input id="trans-desc" type="text" value="${originalData.description || ''}"></div>
            <div class="input-group"><label>Kategori</label><select id="trans-category"><option value="">Välj...</option>${categoryOptions}</select></div>
            <div class="input-group"><label>Motpart</label><input id="trans-party" type="text" value="${originalData.party || ''}"></div>
            <div class="input-group"><label>Summa (inkl. moms)</label><input id="trans-amount" type="number" placeholder="0.00" value="${originalData.amount || ''}"></div>
            ${vatSelectorHTML}
            <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                <button id="cancel-btn" class="btn btn-secondary">Avbryt</button>
                <button id="save-btn" class="btn btn-primary">${isCorrection ? 'Spara Rättelse' : 'Spara'}</button>
            </div>
        </div>`;

    document.getElementById('save-btn').addEventListener('click', () => {
        const amountInclVat = parseFloat(document.getElementById('trans-amount').value) || 0;
        const vatRate = type === 'expense' ? parseFloat(document.getElementById('trans-vat').value) : 0;
        const vatAmount = amountInclVat - (amountInclVat / (1 + vatRate / 100));

        const newData = {
            date: document.getElementById('trans-date').value,
            description: document.getElementById('trans-desc').value,
            party: document.getElementById('trans-party').value,
            amount: amountInclVat, // Spara totalbeloppet inkl. moms
            amountExclVat: amountInclVat - vatAmount, // Belopp exkl. moms
            vatRate: vatRate,
            vatAmount: vatAmount,
            categoryId: document.getElementById('trans-category').value || null,
        };

        if (isCorrection) {
            handleCorrectionSave(type, originalId, originalData, newData);
        } else {
            handleSave(type, newData);
        }
    });
    document.getElementById('cancel-btn').addEventListener('click', () => navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter'));
}

async function handleSave(type, data) {
    if (!data.date || !data.description || data.amount <= 0) {
        showToast('Fyll i datum, beskrivning och en giltig summa.', 'warning');
        return;
    }
    showConfirmationModal(async () => {
        try {
            const collectionName = type === 'income' ? 'incomes' : 'expenses';
            await saveDocument(collectionName, { ...data, isCorrection: false });
            await fetchAllCompanyData();
            navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter');
            showToast("Transaktionen har sparats!", "success");
        } catch (error) {
            console.error("Fel vid sparning:", error);
            showToast("Kunde inte spara.", "error");
        }
    }, "Bekräfta Bokföring", "Enligt Bokföringslagen är detta en slutgiltig aktion.");
}

async function handleCorrectionSave(type, originalId, originalData, newData) {
    if (!newData.date || !newData.description || newData.amount <= 0) {
        showToast('Fyll i alla fält korrekt.', 'warning');
        return;
    }
    showConfirmationModal(async () => {
        try {
            await performCorrection(type, originalId, originalData, newData);
            await fetchAllCompanyData();
            navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter');
            showToast("Rättelsen har sparats.", "success");
        } catch (error) {
            console.error("Fel vid rättelse:", error);
            showToast("Kunde inte spara rättelsen.", "error");
        }
    }, "Bekräfta Rättelse", "Detta kan inte ångras.");
}
