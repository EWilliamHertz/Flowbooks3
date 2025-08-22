// js/ui/invoices.js
import { getState } from '../state.js';
import { fetchAllCompanyData, saveDocument } from '../services/firestore.js';
import { showToast, renderSpinner, showConfirmationModal, closeModal, showInfoModal } from './utils.js';
import { doc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';
import { editors } from './editors.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-functions.js";
import { renderBillProcessor } from './bill-processor.js';
import { getAIBillDetails } from '../services/ai.js';
import { t } from '../i18n.js';

const { jsPDF } = window.jspdf;
let invoiceItems = [];
let sourceTimeEntryIds = [];
const sendInvoiceWithAttachmentFunc = httpsCallable(getFunctions(), 'sendInvoiceWithAttachment');

export function renderInvoicesPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div id="invoice-summary-container"></div>
        <div class="card" style="margin-top: 1.5rem;">
            <div class="settings-tabs">
                <button class="tab-link active" data-tab="outgoing-invoices">${t('invoicesOut')}</button>
                <button class="tab-link" data-tab="incoming-invoices">${t('invoicesIn')}</button>
            </div>
            <div id="outgoing-invoices" class="tab-content active"></div>
            <div id="incoming-invoices" class="tab-content"></div>
        </div>`;

    renderInvoiceSummary();
    renderOutgoingInvoiceList();
    renderIncomingInvoiceList();

    document.querySelectorAll('.tab-link').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.tab-link, .tab-content').forEach(el => el.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(button.dataset.tab).classList.add('active');
        });
    });
}

function renderInvoiceSummary() {
    const { allInvoices, allBills } = getState();
    const container = document.getElementById('invoice-summary-container');

    const expectedIncome = allInvoices
        .filter(inv => inv.status !== 'Betald' && inv.status !== 'Utkast')
        .reduce((sum, inv) => sum + inv.balance, 0);

    const expectedExpense = allBills
        .filter(bill => bill.status !== 'Betald')
        .reduce((sum, bill) => sum + bill.balance, 0);
        
    const totalResult = expectedIncome - expectedExpense;

    container.innerHTML = `
        <div class="dashboard-metrics" style="grid-template-columns: repeat(3, 1fr);">
            <div class="card text-center">
                <h3>${t('expectedIncome')}</h3>
                <p class="metric-value green">${expectedIncome.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</p>
            </div>
            <div class="card text-center">
                <h3>${t('expectedExpense')}</h3>
                <p class="metric-value red">${expectedExpense.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</p>
            </div>
            <div class="card text-center">
                <h3>${t('netResult')}</h3>
                <p class="metric-value ${totalResult >= 0 ? 'blue' : 'red'}">${totalResult.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</p>
            </div>
        </div>
    `;
}

function renderOutgoingInvoiceList() {
    const { allInvoices } = getState();
    const container = document.getElementById('outgoing-invoices');
    if (!container) return;

    const rows = allInvoices.sort((a, b) => b.invoiceNumber - a.invoiceNumber).map(invoice => `
        <tr data-invoice-id="${invoice.id}">
            <td><input type="checkbox" class="invoice-select-checkbox" data-id="${invoice.id}"></td>
            <td><span class="invoice-status ${invoice.status || 'Utkast'}">${t(invoice.status || 'Utkast')}</span></td>
            <td>#${invoice.invoiceNumber}</td>
            <td>${invoice.customerName}</td>
            <td>${invoice.dueDate}</td>
            <td class="text-right">${(invoice.grandTotal || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</td>
            <td class="text-right">${(invoice.balance || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</td>
            <td>
                <div class="action-menu" style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-secondary btn-edit-invoice">${t('show')}</button>
                    ${invoice.status !== 'Utkast' ? `<button class="btn btn-sm btn-success btn-payment-invoice">${t('registerPayment')}</button>` : ''}
                </div>
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <div class="controls-container" style="padding: 0; background: none; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
            <h3 class="card-title" style="margin: 0;">${t('sentInvoices')}</h3>
            <div id="bulk-actions-container" style="display: none; gap: 0.5rem;">
                 <button id="download-selected-invoices-btn" class="btn btn-secondary">${t('downloadSelected')}</button>
                 <button id="send-selected-invoices-btn" class="btn btn-primary">${t('sendSelected')}</button>
                 <button id="delete-selected-invoices-btn" class="btn btn-danger">${t('deleteSelected')}</button>
            </div>
        </div>
        <table class="data-table" id="invoices-table">
            <thead>
                <tr>
                    <th><input type="checkbox" id="select-all-invoices"></th>
                    <th>${t('status')}</th>
                    <th>${t('invoiceNumber')}</th>
                    <th>${t('customer')}</th>
                    <th>${t('dueDate')}</th>
                    <th class="text-right">${t('totalAmount')}</th>
                    <th class="text-right">${t('remaining')}</th>
                    <th>${t('actions')}</th>
                </tr>
            </thead>
            <tbody>
                ${allInvoices.length > 0 ? rows : `<tr><td colspan="8" class="text-center">${t('noInvoicesYet')}</td></tr>`}
            </tbody>
        </table>`;
    
    attachInvoiceListEventListeners();
}

function renderIncomingInvoiceList() {
    const { allBills } = getState();
    const container = document.getElementById('incoming-invoices');
    if (!container) return;
    
    const rows = allBills.sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate)).map(bill => `
         <tr data-bill-id="${bill.id}">
            <td><span class="invoice-status ${bill.status}">${t(bill.status)}</span></td>
            <td>${bill.invoiceNumber}</td>
            <td>${bill.supplierName}</td>
            <td>${bill.dueDate}</td>
            <td class="text-right">${(bill.balance || 0).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</td>
            <td><button class="btn btn-sm btn-secondary">${t('show')}</button></td>
        </tr>
    `).join('');

    container.innerHTML = `
        <div class="controls-container" style="padding: 0; background: none; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
             <h3 class="card-title" style="margin: 0;">${t('incomingInvoices')}</h3>
             <div style="display: flex; gap: 1rem;">
                <input type="file" id="bill-upload-input" accept="application/pdf,image/*" style="display: none;">
                <button id="upload-bill-btn" class="btn btn-primary">${t('uploadInvoice')}</button>
             </div>
        </div>
        <p>${t('uploadInvoiceNotice')}</p>
        <table class="data-table" id="bills-table">
             <thead>
                <tr>
                    <th>${t('status')}</th>
                    <th>${t('invoiceNumber')}</th>
                    <th>${t('supplier')}</th>
                    <th>${t('dueDate')}</th>
                    <th class="text-right">${t('amountToPay')}</th>
                    <th>${t('actions')}</th>
                </tr>
            </thead>
            <tbody>
                ${allBills.length > 0 ? rows : `<tr><td colspan="6" class="text-center">${t('noIncomingInvoicesYet')}</td></tr>`}
            </tbody>
        </table>
    `;

    document.getElementById('upload-bill-btn').addEventListener('click', () => {
        document.getElementById('bill-upload-input').click();
    });

    document.getElementById('bill-upload-input').addEventListener('change', handleFileUpload);
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `<div class="modal-overlay"><div class="modal-content"><h3>${t('invoiceAnalysis')}</h3><p>${t('invoiceAnalysisNotice')}</p>${renderSpinner()}</div></div>`;
    
    try {
        const aiData = await getAIBillDetails(file);
        renderBillProcessor(aiData);
    } catch (error) {
        closeModal();
        showToast(t('couldNotAnalyzeInvoice', { error: error.message }), "error");
    }

    // Rensa filinput så man kan ladda upp samma fil igen
    event.target.value = '';
}

function attachInvoiceListEventListeners() {
    const table = document.getElementById('invoices-table');
    if (!table) return;

    table.addEventListener('click', (e) => {
        const invoiceId = e.target.closest('tr')?.dataset.invoiceId;
        if (!invoiceId) return;

        if (e.target.classList.contains('btn-edit-invoice')) {
            editors.renderInvoiceEditor(invoiceId);
        } else if (e.target.classList.contains('btn-payment-invoice')) {
            showPaymentModal(invoiceId);
        }
    });

    const allCheckbox = document.getElementById('select-all-invoices');
    const checkboxes = document.querySelectorAll('.invoice-select-checkbox');
    const bulkActionsContainer = document.getElementById('bulk-actions-container');
    const deleteBtn = document.getElementById('delete-selected-invoices-btn');
    const downloadBtn = document.getElementById('download-selected-invoices-btn');
    const sendBtn = document.getElementById('send-selected-invoices-btn');

    const toggleBulkActions = () => {
        const selected = document.querySelectorAll('.invoice-select-checkbox:checked');
        if (selected.length > 0) {
            bulkActionsContainer.style.display = 'flex';
            deleteBtn.textContent = t('deleteSelected', { count: selected.length });
            downloadBtn.textContent = t('downloadSelected', { count: selected.length });
            sendBtn.textContent = t('sendSelected', { count: selected.length });
        } else {
            bulkActionsContainer.style.display = 'none';
        }
    };

    if(allCheckbox){
        allCheckbox.addEventListener('change', (e) => {
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            toggleBulkActions();
        });
    }

    checkboxes.forEach(cb => cb.addEventListener('change', toggleBulkActions));

    if(deleteBtn){
        deleteBtn.addEventListener('click', () => {
            const selectedIds = Array.from(document.querySelectorAll('.invoice-select-checkbox:checked')).map(cb => cb.dataset.id);
            if (selectedIds.length > 0) {
                showConfirmationModal(async () => {
                    const batch = writeBatch(db);
                    let count = 0;
                    selectedIds.forEach(id => {
                        const invoice = getState().allInvoices.find(inv => inv.id === id);
                        if (invoice && invoice.status === 'Utkast') {
                            batch.delete(doc(db, 'invoices', id));
                            count++;
                        }
                    });
                    await batch.commit();
                    await fetchAllCompanyData();
                    renderOutgoingInvoiceList();
                    if(count > 0){
                        showToast(t('invoicesDeletedCount', { count: count }), 'success');
                    } else {
                        showToast(t('noDraftsSelectedForDeletion'), 'info');
                    }
                }, t('deleteInvoices'), t('deleteInvoicesConfirmBody'));
            }
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            const selectedIds = Array.from(document.querySelectorAll('.invoice-select-checkbox:checked')).map(cb => cb.dataset.id);
            if (selectedIds.length === 0) return;
            showToast(t('generatingPdfs', { count: selectedIds.length }), 'info');
            for (const id of selectedIds) {
                await generateInvoicePDF(id, true);
            }
        });
    }
    
    if (sendBtn) {
        sendBtn.addEventListener('click', async () => {
            const { allInvoices } = getState();
            const selectedIds = Array.from(document.querySelectorAll('.invoice-select-checkbox:checked')).map(cb => cb.dataset.id);
            const selectedInvoices = selectedIds.map(id => allInvoices.find(inv => inv.id === id)).filter(Boolean);

            const invoicesWithEmail = selectedInvoices.filter(inv => inv.customerEmail && inv.status !== 'Utkast');
            const invoicesWithoutEmail = selectedInvoices.filter(inv => !inv.customerEmail && inv.status !== 'Utkast');
            const draftInvoices = selectedInvoices.filter(inv => inv.status === 'Utkast');

            if (invoicesWithEmail.length === 0) {
                showInfoModal(t('nothingToSend'), t('nothingToSendNotice'));
                return;
            }

            let confirmationMessage = t('sendConfirmationBody', { count: invoicesWithEmail.length });
            if (invoicesWithoutEmail.length > 0) {
                const names = invoicesWithoutEmail.map(i => `#${i.invoiceNumber} (${i.customerName})`).join(', ');
                confirmationMessage += `\n\n${t('invoicesWithoutEmailNotice', { count: invoicesWithoutEmail.length, names: names })}`;
            }
            if (draftInvoices.length > 0) {
                confirmationMessage += `\n\n${t('draftInvoicesIgnored', { count: draftInvoices.length })}`;
            }
            confirmationMessage += `\n\n${t('doYouWantToProceed')}`;

            showConfirmationModal(async () => {
                const btn = document.getElementById('send-selected-invoices-btn');
                const originalText = btn.textContent;
                btn.disabled = true;
                
                let successCount = 0;
                let errorCount = 0;
                
                for (const [index, invoice] of invoicesWithEmail.entries()) {
                    btn.textContent = t('sendingInvoiceProgress', { current: index + 1, total: invoicesWithEmail.length });
                    try {
                        await sendInvoiceByEmail(invoice.id);
                        successCount++;
                    } catch (e) {
                        console.error(`Failed to send invoice #${invoice.invoiceNumber}:`, e);
                        errorCount++;
                    }
                }
                
                showToast(t('bulkSendResult', { successCount: successCount, errorCount: errorCount }), errorCount > 0 ? 'warning' : 'success');
                btn.disabled = false;
                btn.textContent = originalText;
                
            }, t('confirmSend'), confirmationMessage);
        });
    }
}

export function renderInvoiceEditor(invoiceId = null, dataFromSource = null) {
    const { allInvoices, currentCompany, allContacts } = getState();
    const invoice = invoiceId ? allInvoices.find(inv => inv.id === invoiceId) : null;
    
    sourceTimeEntryIds = [];
    if (dataFromSource) {
        invoiceItems = dataFromSource.items || [];
        if (dataFromSource.source === 'timetracking') {
            sourceTimeEntryIds = dataFromSource.timeEntryIds || [];
        }
    } else {
        invoiceItems = invoice ? JSON.parse(JSON.stringify(invoice.items)) : [];
    }
    
    const isLocked = invoice && invoice.status !== 'Utkast';

    const mainView = document.getElementById('main-view');
    const today = new Date().toISOString().slice(0, 10);
    
    let customerName = dataFromSource?.customerName || invoice?.customerName || '';
    let customerEmail = invoice?.customerEmail || allContacts.find(c => c.name === customerName)?.email || '';
    let notes = dataFromSource?.notes || invoice?.notes || currentCompany.defaultInvoiceText || '';
    
    const paymentHistoryHtml = (invoice?.payments && invoice.payments.length > 0) ? `
        <div class="card" style="margin-top: 1.5rem;">
            <h3 class="card-title">${t('paymentHistory')}</h3>
            <ul class="history-list">
                ${invoice.payments.map(p => `<li class="history-item"><span>${p.date}</span><span class="text-right green">${(p.amount || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</span></li>`).join('')}
            </ul>
        </div>` : '';
    
    const inventorySyncButton = invoiceId ? `<button id="sync-inventory-btn" class="btn btn-secondary">${t('syncInventory')}</button>` : '';

    mainView.innerHTML = `
        <div class="invoice-editor">
            <div class="card">
                <h3>${invoiceId ? `${t('invoiceNumber')} #${invoice.invoiceNumber}` : t('newInvoice')}</h3>
                ${invoice ? `<p><strong>${t('status')}:</strong> <span class="invoice-status ${invoice.status}">${t(invoice.status)}</span> | <strong>${t('remainingBalance')}:</strong> ${(invoice.balance || 0).toLocaleString('sv-SE', {style:'currency', currency: 'SEK'})}</p>` : ''}
                <div class="invoice-form-grid">
                    <div class="input-group">
                        <label>${t('customer')}</label>
                        <input id="customerName" class="form-input" value="${customerName}" ${isLocked ? 'disabled' : ''}>
                    </div>
                    <div class="input-group">
                        <label>${t('customerEmail')}</label>
                        <input id="customerEmail" type="email" class="form-input" value="${customerEmail}" ${isLocked ? 'disabled' : ''}>
                    </div>
                    <div class="input-group"><label>${t('invoiceDate')}</label><input id="invoiceDate" type="date" class="form-input" value="${invoice?.invoiceDate || today}" ${isLocked ? 'disabled' : ''}></div>
                    <div class="input-group"><label>${t('dueDate')}</label><input id="dueDate" type="date" class="form-input" value="${invoice?.dueDate || today}" ${isLocked ? 'disabled' : ''}></div>
                </div>
            </div>
            <div class="card">
                <h3 class="card-title">${t('invoiceLines')}</h3>
                <div id="invoice-items-container"></div>
                ${!isLocked ? `
                    <button id="add-item-btn" class="btn btn-secondary" style="margin-top: 1rem;">${t('addCustomLine')}</button>
                    <button id="add-product-btn" class="btn btn-primary" style="margin-top: 1rem; margin-left: 1rem;">${t('addProduct')}</button>
                ` : ''}
            </div>
            ${paymentHistoryHtml}
            <div class="card">
                <h3 class="card-title">${t('invoiceNotes')}</h3>
                <textarea id="invoice-notes" class="form-input" rows="4" placeholder="${t('invoiceNotesPlaceholder')}" ${isLocked ? 'disabled' : ''}>${notes}</textarea>
            </div>
            <div class="invoice-actions-footer">
                ${inventorySyncButton}
                <button id="back-btn" class="btn btn-secondary">${t('backToOverview')}</button>
                ${!isLocked ? `
                    <button id="save-draft-btn" class="btn btn-secondary">${t('saveDraft')}</button>
                    <button id="save-send-btn" class="btn btn-primary">${t('postInvoice')}</button>
                ` : `
                    <button id="pdf-btn" class="btn btn-secondary">${t('downloadPDF')}</button>
                    <button id="email-btn" class="btn btn-primary">${t('sendByEmail')}</button>
                `}
            </div>
        </div>`;

    renderInvoiceItems(isLocked);
    document.getElementById('back-btn').addEventListener('click', () => window.navigateTo('invoices'));

    if (invoiceId) {
        document.getElementById('sync-inventory-btn').addEventListener('click', () => syncInventoryFromInvoice(invoiceId));
    }
    
    if(!isLocked) {
        document.getElementById('add-item-btn').addEventListener('click', () => {
            invoiceItems.push({ productId: null, description: '', quantity: 1, price: 0, vatRate: 25, priceSelection: 'custom' });
            renderInvoiceItems(false);
        });
        document.getElementById('add-product-btn').addEventListener('click', showProductSelector);
        document.getElementById('save-draft-btn').addEventListener('click', (e) => saveInvoice(e.target, invoiceId, 'Utkast'));
        document.getElementById('save-send-btn').addEventListener('click', (e) => saveInvoice(e.target, invoiceId, 'Skickad'));
    } else {
        document.getElementById('pdf-btn').addEventListener('click', () => generateInvoicePDF(invoiceId));
        document.getElementById('email-btn').addEventListener('click', () => initiateSingleSendProcess(invoiceId));
    }
}

async function syncInventoryFromInvoice(invoiceId) {
    showConfirmationModal(async () => {
        const { allInvoices, allProducts } = getState();
        const invoice = allInvoices.find(inv => inv.id === invoiceId);
        if (!invoice) {
            showToast(t('couldNotFindInvoiceData'), "error");
            return;
        }

        const batch = writeBatch(db);
        const updates = [];

        invoice.items.forEach(item => {
            if (item.productId) {
                const product = allProducts.find(p => p.id === item.productId);
                if (product) {
                    const newStock = (product.stock || 0) - item.quantity;
                    const productRef = doc(db, 'products', item.productId);
                    batch.update(productRef, { stock: newStock });
                    updates.push(`${product.name}: ${product.stock} -> ${newStock}`);
                }
            }
        });
        
        if (updates.length > 0) {
            await batch.commit();
            await fetchAllCompanyData();
            showToast(t('inventorySynced'), "success");
            showInfoModal(t('inventoryUpdates'), updates.join('<br>'));
        } else {
            showToast(t('noProductsToSync'), "info");
        }
    }, t('syncInventoryConfirm'), t('syncInventoryNotice'));
}

async function initiateSingleSendProcess(invoiceId) {
    const { allInvoices } = getState();
    const invoice = allInvoices.find(inv => inv.id === invoiceId);
    const btn = document.getElementById('email-btn');
    const originalText = btn.textContent;

    const executeSend = async (email) => {
        btn.disabled = true;
        btn.textContent = t('sending');
        try {
            await sendInvoiceByEmail(invoiceId, email);
            showToast(t('emailSent'), 'success');
        } catch (error) {
            console.error("Kunde inte skicka e-post:", error);
            showToast(t('couldNotSendEmail'), 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    };

    if (invoice.customerEmail) {
        showConfirmationModal(() => executeSend(invoice.customerEmail), t('confirmSend'), t('sendConfirmationBody', { invoiceNumber: invoice.invoiceNumber, email: invoice.customerEmail }));
    } else {
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <h3>${t('emailMissing')}</h3>
                    <p>${t('emailMissingNotice', { customerName: invoice.customerName })}</p>
                    <div class="input-group">
                        <label>${t('emailAddress')}</label>
                        <input id="prompt-email-input" type="email" class="form-input" placeholder="${t('emailAddressPlaceholder')}">
                    </div>
                    <div class="modal-actions">
                        <button id="modal-cancel" class="btn btn-secondary">${t('cancel')}</button>
                        <button id="modal-save-send" class="btn btn-primary">${t('saveAndSend')}</button>
                    </div>
                </div>
            </div>`;
        
        document.getElementById('modal-cancel').addEventListener('click', closeModal);
        document.getElementById('modal-save-send').addEventListener('click', async () => {
            const newEmail = document.getElementById('prompt-email-input').value.trim();
            if (!newEmail.includes('@')) {
                showToast(t('invalidEmail'), "warning");
                return;
            }

            try {
                await updateDoc(doc(db, 'invoices', invoiceId), { customerEmail: newEmail });
                
                const currentInvoices = getState().allInvoices;
                const index = currentInvoices.findIndex(i => i.id === invoiceId);
                if (index !== -1) {
                    currentInvoices[index].customerEmail = newEmail;
                }

                closeModal();
                await executeSend(newEmail);
                renderInvoiceEditor(invoiceId);
            } catch (error) {
                showToast(t('couldNotSaveEmail'), "error");
            }
        });
    }
}

function renderInvoiceItems(isLocked = false) {
    const { allProducts } = getState();
    const container = document.getElementById('invoice-items-container');
    
    const tableRows = invoiceItems.map((item, index) => {
        let descriptionFieldHtml, priceFieldHtml, quantityFieldHtml, vatFieldHtml, deleteButtonHtml;

        deleteButtonHtml = isLocked ? '' : `<button class="btn btn-sm btn-danger" data-index="${index}">X</button>`;

        if (item.productId) {
            const product = allProducts.find(p => p.id === item.productId);
            descriptionFieldHtml = `<a href="#" class="link-to-product" data-product-id="${item.productId}">${item.description}</a>`;
            if (isLocked) {
                priceFieldHtml = `${(item.price || 0).toFixed(2)}`;
            } else if (product) {
                priceFieldHtml = `
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <select class="form-input item-price-select" data-index="${index}">
                            <option value="business" ${item.priceSelection === 'business' ? 'selected' : ''}>${t('businessPrice')} (${(product.sellingPriceBusiness || 0).toFixed(2)} kr)</option>
                            <option value="private" ${item.priceSelection === 'private' ? 'selected' : ''}>${t('privatePrice')} (${(product.sellingPricePrivate || 0).toFixed(2)} kr)</option>
                            <option value="custom" ${item.priceSelection === 'custom' ? 'selected' : ''}>${t('customPrice')}</option>
                        </select>
                        <input type="number" step="0.01" class="form-input item-price" data-index="${index}" value="${item.price || 0}" ${item.priceSelection !== 'custom' ? 'readonly' : ''}>
                    </div>`;
            } else {
                priceFieldHtml = `<input type="number" step="0.01" class="form-input item-price" data-index="${index}" value="${item.price || 0}" placeholder="0.00">`;
            }
        } else {
            descriptionFieldHtml = isLocked ? item.description : `<input class="form-input item-description" data-index="${index}" value="${item.description}" placeholder="${t('lineDescription')}">`;
            priceFieldHtml = isLocked ? (item.price || 0).toFixed(2) : `<input type="number" step="0.01" class="form-input item-price" data-index="${index}" value="${item.price || 0}" placeholder="0.00">`;
        }
        
        quantityFieldHtml = isLocked ? item.quantity : `<input type="number" class="form-input item-quantity" data-index="${index}" value="${item.quantity}" style="width: 80px;">`;
        vatFieldHtml = isLocked ? `${item.vatRate}%` : `<select class="form-input item-vatRate" data-index="${index}" style="width: 90px;"><option value="25" ${item.vatRate == 25 ? 'selected' : ''}>25%</option><option value="12" ${item.vatRate == 12 ? 'selected' : ''}>12%</option><option value="6" ${item.vatRate == 6 ? 'selected' : ''}>6%</option><option value="0" ${item.vatRate == 0 ? 'selected' : ''}>0%</option></select>`;

        return `
        <tr>
            <td>${descriptionFieldHtml}</td>
            <td>${quantityFieldHtml}</td>
            <td style="min-width: ${isLocked ? 'auto' : '320px'};">${priceFieldHtml}</td>
            <td>${vatFieldHtml}</td>
            <td class="text-right">${((item.quantity || 0) * (item.price || 0)).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</td>
            <td>${deleteButtonHtml}</td>
        </tr>`;
    }).join('');

    const subtotal = invoiceItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.price || 0)), 0);
    const totalVat = invoiceItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.price || 0) * ((item.vatRate || 0) / 100)), 0);
    const grandTotal = subtotal + totalVat;
    
    container.innerHTML = `
        <table class="data-table">
            <thead><tr><th>${t('lineDescription')}</th><th>${t('quantity')}</th><th>${t('priceExclVat')}</th><th>${t('vat')}</th><th class="text-right">${t('amount')}</th><th></th></tr></thead>
            <tbody>${tableRows}</tbody>
            <tfoot>
                <tr><td colspan="5" class="text-right"><strong>${t('subtotalExclVat')}</strong></td><td class="text-right"><strong>${subtotal.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</strong></td></tr>
                <tr><td colspan="5" class="text-right"><strong>${t('totalVat')}</strong></td><td class="text-right"><strong>${totalVat.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</strong></td></tr>
                <tr><td colspan="5" class="text-right" style="font-size: 1.2em;"><strong>${t('totalAmount')}</strong></td><td class="text-right" style="font-size: 1.2em;"><strong>${grandTotal.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</strong></td></tr>
            </tfoot>
        </table>`;
    
    if(!isLocked) {
        container.querySelectorAll('input, select').forEach(input => input.addEventListener('change', updateInvoiceItem));
        container.querySelectorAll('.btn-danger').forEach(btn => btn.addEventListener('click', removeInvoiceItem));
        container.querySelectorAll('.link-to-product').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                editors.renderProductForm(e.target.dataset.productId);
            });
        });
    }
}

function showProductSelector() {
    const { allProducts } = getState();
    const modalContainer = document.getElementById('modal-container');
    const productItems = allProducts.map(p => `
        <div class="product-selector-item" data-product-id="${p.id}">
            <img src="${p.imageUrl || 'https://via.placeholder.com/40'}" alt="${p.name}">
            <div class="product-selector-item-info">
                <strong>${p.name}</strong>
                <span>${t('businessPrice')}: ${(p.sellingPriceBusiness || 0).toLocaleString('sv-SE')} kr | ${t('privatePrice')}: ${(p.sellingPricePrivate || 0).toLocaleString('sv-SE')} kr</span>
            </div>
        </div>`).join('');
    modalContainer.innerHTML = `
        <div class="modal-overlay" id="product-selector-overlay">
            <div class="modal-content">
                <h3>${t('selectProduct')}</h3>
                <div class="product-selector-dropdown show">${productItems.length > 0 ? productItems : `<p style="padding: 1rem;">${t('noProductsFound')}</p>`}</div>
                <div class="modal-actions">
                    <button id="modal-cancel" class="btn btn-secondary">${t('cancel')}</button>
                </div>
            </div>
        </div>`;
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('product-selector-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'product-selector-overlay') closeModal();
    });
    modalContainer.querySelectorAll('.product-selector-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const productId = e.currentTarget.dataset.productId;
            const product = allProducts.find(p => p.id === productId);
            if (product) {
                invoiceItems.push({
                    productId: product.id,
                    description: product.name,
                    quantity: 1,
                    price: product.sellingPriceBusiness || 0,
                    vatRate: 25,
                    priceSelection: 'business',
                    imageUrl: product.imageUrl || null
                });
                renderInvoiceItems(false);
            }
            closeModal();
        });
    });
}

function updateInvoiceItem(event) {
    const { allProducts } = getState();
    const index = parseInt(event.target.dataset.index);
    const propertyClass = event.target.classList[1];
    const item = invoiceItems[index];

    if (propertyClass === 'item-price-select') {
        const selection = event.target.value;
        item.priceSelection = selection;
        const product = allProducts.find(p => p.id === item.productId);
        if (product) {
            if (selection === 'business') item.price = product.sellingPriceBusiness;
            else if (selection === 'private') item.price = product.sellingPricePrivate;
        }
    } else {
        const property = propertyClass.replace('item-', '');
        let value = event.target.value;
        if (event.target.type === 'number' || property === 'vatRate') {
            value = parseFloat(value) || 0;
        }
        item[property] = value;
        if (property === 'price' && item.productId) {
            item.priceSelection = 'custom';
        }
    }
    renderInvoiceItems(false);
}

function removeInvoiceItem(event) {
    const index = parseInt(event.target.dataset.index);
    invoiceItems.splice(index, 1);
    renderInvoiceItems(false);
}

async function saveInvoice(btn, invoiceId, status) {
    const { allInvoices } = getState();
    const subtotal = invoiceItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.price || 0)), 0);
    const totalVat = invoiceItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.price || 0) * ((item.vatRate || 0) / 100)), 0);
    const grandTotal = subtotal + totalVat;

    // Bestäm fakturanummer
    let nextInvoiceNumber;
    if (invoiceId) {
        nextInvoiceNumber = allInvoices.find(i => i.id === invoiceId).invoiceNumber;
    } else {
        const highestInvoiceNumber = allInvoices.reduce((max, inv) => inv.invoiceNumber > max ? inv.invoiceNumber : max, 0);
        nextInvoiceNumber = highestInvoiceNumber + 1;
    }

    const invoiceData = {
        customerName: document.getElementById('customerName').value,
        customerEmail: document.getElementById('customerEmail').value,
        invoiceDate: document.getElementById('invoiceDate').value,
        dueDate: document.getElementById('dueDate').value,
        items: invoiceItems,
        subtotal: subtotal,
        totalVat: totalVat,
        grandTotal: grandTotal,
        balance: grandTotal,
        payments: [],
        notes: document.getElementById('invoice-notes').value,
        status: status,
        invoiceNumber: nextInvoiceNumber
    };

    if (!invoiceData.customerName || invoiceItems.length === 0) {
        showToast(t('fillAllFieldsWarning'), "warning");
        return;
    }

    const confirmTitle = status === 'Skickad' ? t('confirmPosting') : t('saveDraft');
    const confirmMessage = status === 'Skickad' ? t('confirmPostingBody') : t('confirmSaveDraftBody');

    showConfirmationModal(async () => {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = t('saving');
        try {
            const newInvoiceId = await saveDocument('invoices', invoiceData, invoiceId);
            
            if (status === 'Skickad' && sourceTimeEntryIds.length > 0) {
                const batch = writeBatch(db);
                sourceTimeEntryIds.forEach(entryId => {
                    const entryRef = doc(db, 'timeEntries', entryId);
                    batch.update(entryRef, { isBilled: true, invoiceId: invoiceId || newInvoiceId });
                });
                await batch.commit();
            }

            if (status === 'Skickad') {
                await adjustInventoryOnSave(invoiceItems);
            }

            sourceTimeEntryIds = [];
            await fetchAllCompanyData();
            showToast(status === 'Skickad' ? t('invoicePostedAndLocked') : t('invoiceSavedDraft'), 'success');
            window.navigateTo('invoices');
        } catch (error) {
            console.error("Kunde inte spara faktura:", error);
            showToast(t('couldNotSaveInvoice'), 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }, confirmTitle, confirmMessage);
}

async function adjustInventoryOnSave(items) {
    const { allProducts } = getState();
    const batch = writeBatch(db);
    let updated = false;

    items.forEach(item => {
        if (item.productId) {
            const product = allProducts.find(p => p.id === item.productId);
            if (product) {
                const newStock = (product.stock || 0) - item.quantity;
                const productRef = doc(db, 'products', item.productId);
                batch.update(productRef, { stock: newStock });
                updated = true;
            }
        }
    });

    if (updated) {
        await batch.commit();
    }
}


function showPaymentModal(invoiceId) {
    const { allInvoices } = getState();
    const invoice = allInvoices.find(inv => inv.id === invoiceId);
    const today = new Date().toISOString().slice(0, 10);

    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>${t('registerPaymentForInvoice', { invoiceNumber: invoice.invoiceNumber })}</h3>
                <p>${t('remainingBalance')}: <strong>${(invoice.balance || 0).toLocaleString('sv-SE', {style:'currency', currency: 'SEK'})}</strong></p>
                <form id="payment-form">
                    <div class="input-group">
                        <label>${t('paymentDate')}</label>
                        <input id="payment-date" type="date" class="form-input" value="${today}">
                    </div>
                    <div class="input-group">
                        <label>${t('paymentAmount')}</label>
                        <input id="payment-amount" type="number" step="0.01" class="form-input" value="${invoice.balance || 0}" max="${invoice.balance || 0}">
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" id="modal-cancel">${t('cancel')}</button>
                        <button type="submit" class="btn btn-primary">${t('register')}</button>
                    </div>
                </form>
            </div>
        </div>`;
    document.getElementById('modal-container').innerHTML = modalHtml;
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('payment-form').addEventListener('submit', (e) => {
        e.preventDefault();
        registerPayment(invoiceId);
    });
}

async function registerPayment(invoiceId) {
    const { allInvoices } = getState();
    const invoice = allInvoices.find(inv => inv.id === invoiceId);
    
    const paymentAmount = parseFloat(document.getElementById('payment-amount').value);
    const paymentDate = document.getElementById('payment-date').value;

    if (isNaN(paymentAmount) || paymentAmount <= 0 || paymentAmount > (invoice.balance || 0)) {
        showToast(t('invalidAmount'), 'warning');
        return;
    }

    const newBalance = (invoice.balance || 0) - paymentAmount;
    const newStatus = newBalance <= 0 ? 'Betald' : 'Delvis betald';
    const newPayment = { date: paymentDate, amount: paymentAmount };
    
    const paymentRatio = paymentAmount / invoice.grandTotal;
    const paymentExclVat = invoice.subtotal * paymentRatio;
    const paymentVatAmount = invoice.totalVat * paymentRatio;

    try {
        const invoiceRef = doc(db, 'invoices', invoiceId);
        await updateDoc(invoiceRef, {
            balance: newBalance,
            status: newStatus,
            payments: [...(invoice.payments || []), newPayment]
        });
        
        const incomeData = {
            date: paymentDate,
            description: t('paymentForInvoice', { invoiceNumber: invoice.invoiceNumber }),
            party: invoice.customerName,
            amount: paymentAmount,
            amountExclVat: paymentExclVat,
            vatAmount: paymentVatAmount,
            categoryId: null,
            isCorrection: false,
            generatedFromInvoiceId: invoiceId
        };
        await saveDocument('incomes', incomeData);

        await fetchAllCompanyData();
        showToast(t('paymentRegistered'), 'success');
        closeModal();
        
        const currentPage = document.querySelector('.sidebar-nav a.active')?.dataset.page;
        if (currentPage === 'invoices') {
            renderInvoicesPage();
        } else if (document.querySelector('.invoice-editor')) {
            renderInvoiceEditor(invoiceId);
        }
        
    } catch (error) {
        console.error("Fel vid registrering av betalning:", error);
        showToast(t('couldNotRegisterPayment'), "error");
    }
}

export async function generateInvoicePDF(invoiceId, silent = false) {
    const { allInvoices, currentCompany } = getState();
    const invoice = allInvoices.find(inv => inv.id === invoiceId);
    if (!invoice) {
        if (!silent) showToast(t('couldNotFindInvoiceData'), "error");
        return;
    }

    const doc = new jsPDF();
    await createPdfContent(doc, invoice, currentCompany);
    
    if (!silent) {
        doc.save(`Faktura-${invoice.invoiceNumber}.pdf`);
    } else {
        const pdfDataUri = doc.output('datauristring');
        const link = document.createElement('a');
        link.href = pdfDataUri;
        link.download = `Faktura-${invoice.invoiceNumber}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export async function sendInvoiceByEmail(invoiceId, emailOverride = null) {
    const { allInvoices, currentCompany } = getState();
    const invoice = allInvoices.find(inv => inv.id === invoiceId);

    if (!invoice) {
        throw new Error(t('couldNotFindInvoiceData'));
    }
    
    const recipientEmail = emailOverride || invoice.customerEmail;
    if (!recipientEmail) {
        throw new Error(t('emailMissingError'));
    }

    const doc = new jsPDF();
    await createPdfContent(doc, invoice, currentCompany);
    const pdfBase64 = doc.output('datauristring').split(',')[1];

    await sendInvoiceWithAttachmentFunc({
        to: recipientEmail,
        companyId: currentCompany.id,
        subject: t('invoiceEmailSubject', { invoiceNumber: invoice.invoiceNumber, companyName: currentCompany.name }),
        body: `<p>${t('invoiceEmailBodyGreeting')},</p><p>${t('invoiceEmailBody')}</p><p>${t('invoiceEmailBodyAttachment')}</p><p>${t('invoiceEmailBodyIgnore')}</p><br><p>${t('invoiceEmailBodyClosing')},</p><p>${currentCompany.name}</p>`,
        attachments: [{
            filename: `Faktura-${invoice.invoiceNumber}.pdf`,
            content: pdfBase64,
            contentType: 'application/pdf'
        }]
    });
}

async function createPdfContent(doc, invoice, company) {
    if (company.logoUrl) {
        try {
            const response = await fetch(company.logoUrl);
            const blob = await response.blob();
            const logoBase64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const imgProps = doc.getImageProperties(logoBase64);
            const aspectRatio = imgProps.height / imgProps.width;
            const logoWidth = 40;
            const logoHeight = logoWidth * aspectRatio;
            doc.addImage(logoBase64, 'PNG', 15, 12, logoWidth, logoHeight);
        } catch (e) {
            console.error("Kunde inte ladda logotyp:", e);
            doc.setFontSize(18);
            doc.text(company.name || 'FlowBooks', 15, 20);
        }
    } else {
        doc.setFontSize(18);
        doc.text(company.name || 'FlowBooks', 15, 20);
    }
    
    doc.setFontSize(22);
    doc.text(t('invoice'), 200, 20, { align: 'right' });

    doc.setFontSize(10);
    let startY = 50;
    doc.text(`${t('from')}:`, 15, startY);
    doc.setFont(undefined, 'bold');
    doc.text(company.name || '', 15, startY += 5);
    doc.setFont(undefined, 'normal');
    doc.text(`${t('orgNumber')}: ${company.orgNumber || ''}`, 15, startY += 5);
    if(company.bankgiro) {
        doc.text(`${t('bankgiro')}: ${company.bankgiro}`, 15, startY += 5);
    }

    startY = 50;
    doc.text(`${t('invoiceTo')}:`, 130, startY);
    doc.setFont(undefined, 'bold');
    doc.text(invoice.customerName, 130, startY += 5);
    doc.setFont(undefined, 'normal');
    if (invoice.customerEmail) {
        doc.text(invoice.customerEmail, 130, startY += 5);
    }
    
    startY += 10;
    doc.text(`${t('invoiceNumber')}:`, 130, startY);
    doc.text(`${invoice.invoiceNumber}`, 200, startY, { align: 'right' });
    doc.text(`${t('invoiceDate')}:`, 130, startY += 5);
    doc.text(invoice.invoiceDate, 200, startY, { align: 'right' });
    doc.setFont(undefined, 'bold');
    doc.text(`${t('dueDate')}:`, 130, startY += 5);
    doc.text(invoice.dueDate, 200, startY, { align: 'right' });
    doc.setFont(undefined, 'normal');

    const tableBody = invoice.items.map(item => [
        item.description,
        item.quantity,
        (item.price || 0).toFixed(2),
        `${item.vatRate}%`,
        (item.quantity * (item.price || 0) * (1 + (item.vatRate || 0)/100)).toFixed(2)
    ]);

    doc.autoTable({
        startY: startY + 15,
        head: [[t('lineDescription'), t('quantity'), t('priceExclVat'), t('vat'), t('totalInclVat')]],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [44, 62, 80] },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 20, halign: 'right' },
            2: { cellWidth: 30, halign: 'right' },
            3: { cellWidth: 20, halign: 'right' },
            4: { cellWidth: 30, halign: 'right' },
        },
    });

    const finalY = doc.autoTable.previous.finalY;
    
    const summaryX = 130;
    let summaryY = finalY + 10;
    doc.setFontSize(10);
    doc.text(`${t('subtotalExclVat')}:`, summaryX, summaryY);
    doc.text(`${(invoice.subtotal || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}`, 200, summaryY, { align: 'right' });
    doc.text(`${t('totalVat')}:`, summaryX, summaryY += 6); 
    doc.text(`${(invoice.totalVat || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}`, 200, summaryY, { align: 'right' });
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`${t('amountToPay')}:`, summaryX, summaryY += 7);
    doc.text(`${(invoice.grandTotal || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}`, 200, summaryY, { align: 'right' });
    doc.setFont(undefined, 'normal');

    if(invoice.payments && invoice.payments.length > 0) {
        const totalPaid = invoice.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        doc.text(`${t('paid')}:`, summaryX, summaryY += 7);
        doc.text(`-${totalPaid.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}`, 200, summaryY, { align: 'right' });
        
        doc.setFont(undefined, 'bold');
        doc.text(`${t('remaining')}:`, summaryX, summaryY += 7);
        doc.text(`${(invoice.balance || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}`, 200, summaryY, { align: 'right' });
    }
    
    let finalYWithTotals = summaryY + 15;
    if (invoice.notes) {
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        const splitNotes = doc.splitTextToSize(invoice.notes, 185);
        doc.text(t('commentsAndTerms'), 15, finalYWithTotals);
        doc.text(splitNotes, 15, finalYWithTotals + 5);
    }
}