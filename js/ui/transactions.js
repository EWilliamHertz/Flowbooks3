// js/ui/transactions.js
import { getState } from '../state.js';
import { saveDocument, performCorrection, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, renderSpinner, showConfirmationModal, closeModal } from './utils.js';
import { getControlsHTML } from './components.js';
import { exportToCSV } from './utils.js';
import { writeBatch, doc, collection } from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js';
import { db } from '../../firebase-config.js';
import { t } from '../i18n.js';

let currentFilteredList = [];

export function renderTransactionsPage(type) {
    const mainView = document.getElementById('main-view');
    const { allTransactions, allIncomes, allExpenses } = getState();
    const title = type === 'income' ? t('income') : (type === 'expense' ? t('expenses') : t('summary'));
    const dataToList = type === 'income' ? allIncomes : (type === 'expense' ? allExpenses : allTransactions);

    mainView.innerHTML = `
        <div class="card">
             <div class="controls-container" style="padding: 0; background: none; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                 <h3 class="card-title" style="margin: 0;">${title}</h3>
                 <button id="export-transactions-btn" class="btn btn-secondary">${t('exportToCsv')}</button>
            </div>
            ${getControlsHTML()}
            <div id="table-container">${renderSpinner()}</div>
        </div>`;

    setTimeout(() => {
        applyFiltersAndRender(dataToList);
        document.getElementById('export-transactions-btn').addEventListener('click', () => {
             // KORRIGERING: Ändrade 't' till 'transaction' i .map() för att undvika namnkollision
             exportToCSV(currentFilteredList.map(transaction => ({
                 [t('date')]: transaction.date,
                 [t('description')]: transaction.description,
                 [t('party')]: transaction.party || '',
                 [t('type')]: transaction.type,
                 [t('amount')]: transaction.amount,
                 [t('vat')]: transaction.vatAmount || 0,
                 [t('category')]: getState().categories.find(c => c.id === transaction.categoryId)?.name || '',
                 [t('project')]: getState().allProjects.find(p => p.id === transaction.projectId)?.name || ''
             })), 'transactions.csv');
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
    
    const head = `<th>${t('date')}</th><th>${t('description')}</th><th>${t('category')}</th><th class="text-right">${t('amountExclVat')}</th><th class="text-right">${t('vat')}</th><th class="text-right">${t('totalAmount')}</th><th>${t('actions')}</th>`;
    
    // KORRIGERING: Ändrade 't' till 'transaction' i .map() för att undvika namnkollision
    const rows = transactions.map(transaction => {
        const amountExclVat = transaction.amountExclVat ?? (transaction.type === 'income' ? transaction.amount : (transaction.amount / (1 + (transaction.vatRate || 0) / 100)));
        const vatAmount = transaction.vatAmount ?? (transaction.amount - amountExclVat);
        const totalAmount = transaction.amount;
        const transactionType = transaction.type || (transaction.vatRate !== undefined ? 'expense' : 'income');

        return `
            <tr class="transaction-row ${transactionType} ${transaction.isCorrection ? 'corrected' : ''}">
                <td>${transaction.date}</td>
                <td>${transaction.description}</td>
                <td>${getCategoryName(transaction.categoryId)}</td>
                <td class="text-right">${Number(amountExclVat).toFixed(2)} kr</td>
                <td class="text-right">${Number(vatAmount).toFixed(2)} kr</td>
                <td class="text-right ${transactionType === 'income' ? 'green' : 'red'}"><strong>${Number(totalAmount).toFixed(2)} kr</strong></td>
                ${transaction.isCorrection ? `<td>${t('corrected')}</td>` : `<td><button class="btn-correction" data-id="${transaction.id}" data-type="${transactionType}">${t('correct')}</button></td>`}
            </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="data-table">
            <thead><tr>${head}</tr></thead>
            <tbody>${rows.length > 0 ? rows : `<tr><td colspan="7" class="text-center">${t('noTransactionsToShow')}</td></tr>`}</tbody>
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
    const title = isCorrection ? t('correctTransaction') : `${t('registerNew')} ${type === 'income' ? t('income') : t('expense')}`;
    const today = new Date().toISOString().slice(0, 10);
    
    const categoryOptions = categories.map(cat => `<option value="${cat.id}" ${originalData.categoryId === cat.id ? 'selected' : ''}>${cat.name}</option>`).join('');
    const projectOptions = allProjects.map(proj => `<option value="${proj.id}" ${originalData.projectId === proj.id ? 'selected' : ''}>${proj.name}</option>`).join('');
    const templateOptions = allTemplates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

    const vatSelectorHTML = type === 'expense' ? `
        <div class="input-group">
            <label>${t('vat')}</label>
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
            ${isCorrection ? `<p class="correction-notice">${t('correctionNotice')}</p>` : ''}
            
            <div class="input-group">
                <label>${t('useTemplateOptional')}</label>
                <select id="trans-template" class="form-input">
                    <option value="">${t('noTemplate')}</option>
                    ${templateOptions}
                </select>
            </div>
            <hr>

            <div id="transaction-form-fields">
                <div class="input-group"><label>${t('date')}</label><input id="trans-date" type="date" class="form-input" value="${originalData.date || today}"></div>
                <div class="input-group"><label>${t('description')}</label><input id="trans-desc" type="text" class="form-input" value="${originalData.description || ''}"></div>
                <div class="form-grid">
                     <div class="input-group"><label>${t('category')}</label><select id="trans-category" class="form-input"><option value="">${t('select')}...</option>${categoryOptions}</select></div>
                    <div class="input-group"><label>${t('project')}</label><select id="trans-project" class="form-input"><option value="">${t('none')}</option>${projectOptions}</select></div>
                </div>
                <div class="input-group"><label>${t('party')}</label><input id="trans-party" type="text" class="form-input" value="${originalData.party || ''}"></div>
                <div class="input-group"><label>${t('amountInclVat')}</label><input id="trans-amount" type="number" class="form-input" placeholder="0.00" value="${originalData.amount || ''}"></div>
                ${vatSelectorHTML}
            </div>

            <div id="template-fields" style="display: none;">
                 <div class="input-group"><label>${t('date')}</label><input id="template-date" type="date" class="form-input" value="${today}"></div>
                 <div class="input-group"><label>${t('totalAmountToDistribute')}</label><input id="template-total-amount" type="number" class="form-input" placeholder="0.00"></div>
            </div>

            <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                <button id="cancel-btn" class="btn btn-secondary">${t('cancel')}</button>
                <button id="save-btn" class="btn btn-primary">${isCorrection ? t('saveCorrection') : t('save')}</button>
            </div>
        </div>`;

    document.getElementById('trans-template').addEventListener('change', applyTemplate);
    document.getElementById('save-btn').addEventListener('click', (e) => handleSaveClick(e.target, type, isCorrection, originalId, originalData));
    document.getElementById('cancel-btn').addEventListener('click', () => window.navigateTo(type === 'income' ? 'income' : 'expenses'));
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
            showToast("fillAllFieldsWarning", "warning");
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
            matchedBankTransactionId: originalData.matchedBankTransactionId || null
        };

        if (isCorrection) {
            await handleCorrectionSave(btn, type, originalId, originalData, newData);
        } else {
            await handleSave(btn, type, newData);
        }
    }
}

async function handleSaveFromTemplate(btn, templateId, totalAmount, date) {
    const { allTemplates, currentCompany, currentUser } = getState();
    const template = allTemplates.find(t => t.id === templateId);

    showConfirmationModal(async () => {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = t('saving');
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
                    party: `${t('fromTemplate')}: ${template.name}`,
                    amount: lineAmount,
                    amountExclVat: lineAmount - vatAmount,
                    vatRate: vatRate,
                    vatAmount: vatAmount,
                    categoryId: line.categoryId || null,
                    isCorrection: false,
                    generatedFromTemplateId: templateId,
                    companyId: currentCompany.id,
                    userId: currentUser.uid,
                    createdAt: new Date(),
                };
                
                const docRef = doc(collection(db, collectionName));
                batch.set(docRef, transactionData);
            });

            await batch.commit();
            await fetchAllCompanyData();
            window.navigateTo('summary');
            showToast(t('transactionsFromTemplateSaved', { templateName: template.name }), "success");
        } catch (error) {
            console.error("Error saving from template:", error);
            showToast("couldNotSaveFromTemplate", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }, "confirmBookingTitle", t('confirmTemplatePosting', { count: template.lines.length }));
}

async function handleSave(btn, type, data) {
    if (!data.date || !data.description || data.amount <= 0) {
        showToast('fillAllFieldsWarning', 'warning');
        return;
    }
    showConfirmationModal(async () => {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = t('saving');
        try {
            const collectionName = type === 'income' ? 'incomes' : 'expenses';
            await saveDocument(collectionName, { ...data, isCorrection: false });
            await fetchAllCompanyData();
            
            if(data.matchedBankTransactionId) {
                window.navigateTo('banking');
            } else {
                window.navigateTo(type === 'income' ? 'income' : 'expenses');
            }

            showToast("transactionSaved", "success");
        } catch (error) {
            console.error("Error saving:", error);
            showToast("couldNotSave", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }, "confirmBookingTitle", "confirmBookingBody");
}

async function handleCorrectionSave(btn, type, originalId, originalData, newData) {
    if (!newData.date || !newData.description || newData.amount <= 0) {
        showToast('fillAllFieldsWarning', 'warning');
        return;
    }
    showConfirmationModal(async () => {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = t('saving');
        try {
            await performCorrection(type, originalId, originalData, newData);
            await fetchAllCompanyData();
            window.navigateTo(type === 'income' ? 'income' : 'expenses');
            showToast("correctionSaved", "success");
        } catch (error) {
            console.error("Error during correction:", error);
            showToast("couldNotSaveCorrection", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }, "confirmCorrectionTitle", "confirmCorrectionBody");
}