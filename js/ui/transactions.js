// js/ui/transactions.js
import { getState } from '../state.js';
import { saveDocument, performCorrection, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, renderSpinner, showConfirmationModal, closeModal } from './utils.js';
import { getControlsHTML } from './components.js';
import { exportToCSV } from './utils.js';
import { writeBatch, doc, collection } from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js';
import { db } from '../../firebase-config.js';

let currentFilteredList = [];

export function renderTransactionsPage(type) {
    const mainView = document.getElementById('main-view');
    const { allTransactions, allIncomes, allExpenses } = getState();
    const title = type === 'income' ? 'Registrerade Intäkter' : (type === 'expense' ? 'Registrerade Utgifter' : 'Transaktionshistorik');
    const dataToList = type === 'income' ? allIncomes : (type === 'expense' ? allExpenses : allTransactions);

    mainView.innerHTML = `
        <div class="card">
             <div class="controls-container" style="padding: 0; background: none; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                 <h3 class="card-title" style="margin: 0;">${title}</h3>
                 <button id="export-transactions-btn" class="btn btn-secondary">Exportera till CSV</button>
            </div>
            ${getControlsHTML()}
            <div id="table-container">${renderSpinner()}</div>
        </div>`;

    setTimeout(() => {
        applyFiltersAndRender(dataToList);
        document.getElementById('export-transactions-btn').addEventListener('click', () => {
             exportToCSV(currentFilteredList.map(t => ({
                 Datum: t.date,
                 Beskrivning: t.description,
                 Motpart: t.party,
                 Typ: t.type,
                 Belopp: t.amount,
                 Moms: t.vatAmount || 0
             })), 'transaktioner.csv');
        });
        document.getElementById('search-input').addEventListener('input', () => applyFiltersAndRender(dataToList));
        document.getElementById('category-filter').addEventListener('change', () => applyFiltersAndRender(dataToList));
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelector('.filter-btn.active').classList.remove('active');
                e.target.classList.add('active');
                applyFiltersAndRender(dataToList);
            });
        });
    }, 10);
}

function applyFiltersAndRender(list) {
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const selectedCategory = categoryFilter ? categoryFilter.value : 'all';
    const activePeriodEl = document.querySelector('.filter-btn.active');
    const activePeriod = activePeriodEl ? activePeriodEl.dataset.period : 'all';
    
    let filteredList = list;

    if (searchTerm) {
        filteredList = filteredList.filter(t => 
            t.description.toLowerCase().includes(searchTerm) || 
            (t.party && t.party.toLowerCase().includes(searchTerm))
        );
    }

    if (selectedCategory !== 'all') {
        filteredList = filteredList.filter(t => t.categoryId === selectedCategory);
    }

    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    if (activePeriod === 'this-month') {
        filteredList = filteredList.filter(t => new Date(t.date) >= firstDayThisMonth);
    } else if (activePeriod === 'last-month') {
        filteredList = filteredList.filter(t => new Date(t.date) >= firstDayLastMonth && new Date(t.date) <= lastDayLastMonth);
    }

    currentFilteredList = filteredList;
    renderTransactionTable(filteredList);
}

function renderTransactionTable(transactions) {
    const { categories } = getState();
    const container = document.getElementById('table-container');
    if (!container) return;

    const getCategoryName = (id) => categories.find(c => c.id === id)?.name || '-';
    
    const head = `<th>Datum</th><th>Beskrivning</th><th>Kategori</th><th class="text-right">Summa (exkl. moms)</th><th class="text-right">Moms</th><th class="text-right">Total Summa</th><th>Åtgärd</th>`;
    
    const rows = transactions.map(t => {
        const amountExclVat = t.amountExclVat ?? (t.type === 'income' ? t.amount : (t.amount / (1 + (t.vatRate || 0) / 100)));
        const vatAmount = t.vatAmount ?? (t.amount - amountExclVat);
        const totalAmount = t.amount;
        const transactionType = t.type || (t.vatRate !== undefined ? 'expense' : 'income');

        return `
            <tr class="transaction-row ${transactionType} ${t.isCorrection ? 'corrected' : ''}">
                <td>${t.date}</td>
                <td>${t.description}</td>
                <td>${getCategoryName(t.categoryId)}</td>
                <td class="text-right">${Number(amountExclVat).toFixed(2)} kr</td>
                <td class="text-right">${Number(vatAmount).toFixed(2)} kr</td>
                <td class="text-right ${transactionType === 'income' ? 'green' : 'red'}"><strong>${Number(totalAmount).toFixed(2)} kr</strong></td>
                ${t.isCorrection ? '<td>Rättad</td>' : `<td><button class="btn-correction" data-id="${t.id}" data-type="${transactionType}">Korrigera</button></td>`}
            </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="data-table">
            <thead><tr>${head}</tr></thead>
            <tbody>${rows.length > 0 ? rows : `<tr><td colspan="7" class="text-center">Inga transaktioner att visa.</td></tr>`}</tbody>
        </table>`;
        
    container.querySelectorAll('.btn-correction').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const { allTransactions } = getState();
            const originalData = allTransactions.find(t => t.id === e.target.dataset.id);
            renderTransactionForm(e.target.dataset.type, originalData, true, e.target.dataset.id);
        });
    });
}

export function renderTransactionForm(type, originalData = {}, isCorrection = false, originalId = null) {
    const mainView = document.getElementById('main-view');
    const { categories, allProjects, allTemplates } = getState();
    const title = isCorrection ? 'Korrigera Transaktion' : `Registrera Ny ${type === 'income' ? 'Intäkt' : 'Utgift'}`;
    const today = new Date().toISOString().slice(0, 10);
    
    const categoryOptions = categories.map(cat => `<option value="${cat.id}" ${originalData.categoryId === cat.id ? 'selected' : ''}>${cat.name}</option>`).join('');
    const projectOptions = allProjects.map(proj => `<option value="${proj.id}" ${originalData.projectId === proj.id ? 'selected' : ''}>${proj.name}</option>`).join('');
    const templateOptions = allTemplates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

    const vatSelectorHTML = type === 'expense' ? `
        <div class="input-group">
            <label>Moms (VAT)</label>
            <select id="trans-vat" class="form-input">
                <option value="0" ${originalData.vatRate === 0 ? 'selected' : ''}>0%</option>
                <option value="6" ${originalData.vatRate === 6 ? 'selected' : ''}>6%</option>
                <option value="12" ${originalData.vatRate === 12 ? 'selected' : ''}>12%</option>
                <option value="25" ${originalData.vatRate === 25 || originalData.vatRate === undefined ? 'selected' : ''}>25%</option>
            </select>
        </div>` : '';

    mainView.innerHTML = `
        <div class="card" style="max-width: 600px; margin: auto;">
            <h3>${title}</h3>
            ${isCorrection ? `<p class="correction-notice">Du skapar en rättelsepost. Originalposten markeras som rättad och en omvänd post skapas.</p>` : ''}
            
            <div class="input-group">
                <label>Använd mall (valfritt)</label>
                <select id="trans-template" class="form-input">
                    <option value="">Ingen mall</option>
                    ${templateOptions}
                </select>
            </div>
            <hr>

            <div id="transaction-form-fields">
                <div class="input-group"><label>Datum</label><input id="trans-date" type="date" class="form-input" value="${originalData.date || today}"></div>
                <div class="input-group"><label>Beskrivning</label><input id="trans-desc" type="text" class="form-input" value="${originalData.description || ''}"></div>
                <div class="form-grid">
                     <div class="input-group"><label>Kategori</label><select id="trans-category" class="form-input"><option value="">Välj...</option>${categoryOptions}</select></div>
                    <div class="input-group"><label>Projekt</label><select id="trans-project" class="form-input"><option value="">Inget</option>${projectOptions}</select></div>
                </div>
                <div class="input-group"><label>Motpart</label><input id="trans-party" type="text" class="form-input" value="${originalData.party || ''}"></div>
                <div class="input-group"><label>Summa (inkl. moms)</label><input id="trans-amount" type="number" class="form-input" placeholder="0.00" value="${originalData.amount || ''}"></div>
                ${vatSelectorHTML}
            </div>

            <div id="template-fields" style="display: none;">
                 <div class="input-group"><label>Datum</label><input id="template-date" type="date" class="form-input" value="${today}"></div>
                 <div class="input-group"><label>Totalbelopp att fördela</label><input id="template-total-amount" type="number" class="form-input" placeholder="0.00"></div>
            </div>

            <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                <button id="cancel-btn" class="btn btn-secondary">Avbryt</button>
                <button id="save-btn" class="btn btn-primary">${isCorrection ? 'Spara Rättelse' : 'Spara'}</button>
            </div>
        </div>`;

    document.getElementById('trans-template').addEventListener('change', applyTemplate);
    document.getElementById('save-btn').addEventListener('click', (e) => handleSaveClick(e.target, type, isCorrection, originalId, originalData));
    document.getElementById('cancel-btn').addEventListener('click', () => window.navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter'));
}

function applyTemplate(event) {
    const templateId = event.target.value;
    const formFields = document.getElementById('transaction-form-fields');
    const templateFields = document.getElementById('template-fields');

    if (!templateId) {
        formFields.style.display = 'block';
        templateFields.style.display = 'none';
    } else {
        formFields.style.display = 'none';
        templateFields.style.display = 'block';
    }
}

async function handleSaveClick(btn, type, isCorrection, originalId, originalData) {
    const templateId = document.getElementById('trans-template').value;
    if (templateId) {
        const totalAmount = parseFloat(document.getElementById('template-total-amount').value) || 0;
        const date = document.getElementById('template-date').value;
        if (totalAmount <= 0 || !date) {
            showToast("Ange ett datum och ett giltigt totalbelopp för mallen.", "warning");
            return;
        }
        await handleSaveFromTemplate(btn, templateId, totalAmount, date);
    } else {
        const amountInclVat = parseFloat(document.getElementById('trans-amount').value) || 0;
        const vatRate = type === 'expense' ? parseFloat(document.getElementById('trans-vat').value) : 0;
        const vatAmount = amountInclVat - (amountInclVat / (1 + vatRate / 100));

        const newData = {
            date: document.getElementById('trans-date').value,
            description: document.getElementById('trans-desc').value,
            party: document.getElementById('trans-party').value,
            amount: amountInclVat,
            amountExclVat: amountInclVat - vatAmount,
            vatRate: vatRate,
            vatAmount: vatAmount,
            categoryId: document.getElementById('trans-category').value || null,
            projectId: document.getElementById('trans-project').value || null,
        };

        if (isCorrection) {
            await handleCorrectionSave(btn, type, originalId, originalData, newData);
        } else {
            await handleSave(btn, type, newData);
        }
    }
}

async function handleSaveFromTemplate(btn, templateId, totalAmount, date) {
    const { allTemplates } = getState();
    const template = allTemplates.find(t => t.id === templateId);

    showConfirmationModal(async () => {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Sparar...';
        try {
            const batch = writeBatch(db);
            
            template.lines.forEach(line => {
                const collectionName = line.type === 'income' ? 'incomes' : 'expenses';
                let lineAmount = 0;
                if (String(line.amount).includes('%')) {
                    const percentage = parseFloat(String(line.amount).replace('%', '')) / 100;
                    lineAmount = totalAmount * percentage;
                } else {
                    lineAmount = parseFloat(line.amount);
                }

                const vatRate = line.type === 'expense' ? 25 : 0;
                const vatAmount = lineAmount - (lineAmount / (1 + vatRate / 100));

                const transactionData = {
                    date: date,
                    description: line.description,
                    party: "Enligt mall: " + template.name,
                    amount: lineAmount,
                    amountExclVat: lineAmount - vatAmount,
                    vatRate: vatRate,
                    vatAmount: vatAmount,
                    categoryId: line.categoryId || null,
                    isCorrection: false,
                    generatedFromTemplateId: templateId
                };
                
                batch.set(doc(collection(db, collectionName)), transactionData);
            });

            await batch.commit();
            await fetchAllCompanyData();
            window.navigateTo('summary');
            showToast(`Transaktioner från mallen "${template.name}" har sparats!`, "success");
        } catch (error) {
            console.error("Fel vid sparning från mall:", error);
            showToast("Kunde inte spara från mall.", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }, "Bekräfta Bokföring", `Detta kommer att skapa ${template.lines.length} transaktioner baserat på mallen. Är du säker?`);
}


async function handleSave(btn, type, data) {
    if (!data.date || !data.description || data.amount <= 0) {
        showToast('Fyll i datum, beskrivning och en giltig summa.', 'warning');
        return;
    }
    showConfirmationModal(async () => {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Sparar...';
        try {
            const collectionName = type === 'income' ? 'incomes' : 'expenses';
            await saveDocument(collectionName, { ...data, isCorrection: false });
            await fetchAllCompanyData();
            window.navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter');
            showToast("Transaktionen har sparats!", "success");
        } catch (error) {
            console.error("Fel vid sparning:", error);
            showToast("Kunde inte spara.", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }, "Bekräfta Bokföring", "Enligt Bokföringslagen är detta en slutgiltig aktion.");
}

async function handleCorrectionSave(btn, type, originalId, originalData, newData) {
    if (!newData.date || !newData.description || newData.amount <= 0) {
        showToast('Fyll i alla fält korrekt.', 'warning');
        return;
    }
    showConfirmationModal(async () => {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Sparar...';
        try {
            await performCorrection(type, originalId, originalData, newData);
            await fetchAllCompanyData();
            window.navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter');
            showToast("Rättelsen har sparats.", "success");
        } catch (error) {
            console.error("Fel vid rättelse:", error);
            showToast("Kunde inte spara rättelsen.", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }, "Bekräfta Rättelse", "Detta kan inte ångras.");
}