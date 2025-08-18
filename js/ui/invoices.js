// js/ui/invoices.js
import { getState } from '../state.js';
import { fetchAllCompanyData, saveDocument } from '../services/firestore.js';
import { showToast, renderSpinner, showConfirmationModal, closeModal } from './utils.js';
import { doc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';
import { editors } from './editors.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-functions.js";

const { jsPDF } = window.jspdf;
let invoiceItems = [];
let sourceTimeEntryIds = [];
const sendInvoiceWithAttachmentFunc = httpsCallable(getFunctions(), 'sendInvoiceWithAttachment');

export function renderInvoicesPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <div id="invoice-list-container">
                ${renderSpinner()}
            </div>
        </div>`;
    renderInvoiceList();
}

function renderInvoiceList() {
    const { allInvoices } = getState();
    const container = document.getElementById('invoice-list-container');
    if (!container) return;

    const rows = allInvoices.sort((a, b) => b.invoiceNumber - a.invoiceNumber).map(invoice => `
        <tr data-invoice-id="${invoice.id}">
            <td><input type="checkbox" class="invoice-select-checkbox" data-id="${invoice.id}"></td>
            <td><span class="invoice-status ${invoice.status || 'Utkast'}">${invoice.status || 'Utkast'}</span></td>
            <td>#${invoice.invoiceNumber}</td>
            <td>${invoice.customerName}</td>
            <td>${invoice.dueDate}</td>
            <td class="text-right">${(invoice.grandTotal || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</td>
            <td class="text-right">${(invoice.balance || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</td>
            <td>
                <div class="action-menu" style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-secondary btn-edit-invoice">Visa / Redigera</button>
                    ${invoice.status !== 'Utkast' ? `<button class="btn btn-sm btn-success btn-payment-invoice">Registrera Betalning</button>` : ''}
                </div>
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <div class="controls-container" style="padding: 0; background: none; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
            <h3 class="card-title" style="margin: 0;">Fakturor</h3>
            <div id="bulk-actions-container" style="display: none; gap: 0.5rem;">
                 <button id="download-selected-invoices-btn" class="btn btn-secondary">Ladda ner valda</button>
                 <button id="send-selected-invoices-btn" class="btn btn-primary">Skicka valda</button>
                 <button id="delete-selected-invoices-btn" class="btn btn-danger">Ta bort valda</button>
            </div>
        </div>
        <table class="data-table" id="invoices-table">
            <thead>
                <tr>
                    <th><input type="checkbox" id="select-all-invoices"></th>
                    <th>Status</th>
                    <th>Fakturanr.</th>
                    <th>Kund</th>
                    <th>Förfallodatum</th>
                    <th class="text-right">Totalsumma</th>
                    <th class="text-right">Återstår</th>
                    <th>Åtgärder</th>
                </tr>
            </thead>
            <tbody>
                ${allInvoices.length > 0 ? rows : '<tr><td colspan="8" class="text-center">Du har inga fakturor än.</td></tr>'}
            </tbody>
        </table>`;
    
    attachInvoiceListEventListeners();
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
            deleteBtn.textContent = `Ta bort valda (${selected.length})`;
            downloadBtn.textContent = `Ladda ner valda (${selected.length})`;
            sendBtn.textContent = `Skicka valda (${selected.length})`;
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
                    renderInvoiceList();
                    if(count > 0){
                        showToast(`${count} fakturautkast har tagits bort!`, 'success');
                    } else {
                        showToast('Inga utkast valdes för borttagning.', 'info');
                    }
                }, "Ta bort fakturor", `Är du säker? Endast fakturor med status "Utkast" kommer att tas bort.`);
            }
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            const selectedIds = Array.from(document.querySelectorAll('.invoice-select-checkbox:checked')).map(cb => cb.dataset.id);
            if (selectedIds.length === 0) return;

            showToast(`Genererar ${selectedIds.length} PDF-filer...`, 'info');
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
                showToast("Inga av de valda fakturorna kan skickas (antingen utkast eller saknar e-post).", "warning");
                return;
            }

            let confirmationMessage = `Du kommer nu att skicka ${invoicesWithEmail.length} fakturor.`;
            if (invoicesWithoutEmail.length > 0) {
                const names = invoicesWithoutEmail.map(i => `#${i.invoiceNumber} (${i.customerName})`).join(', ');
                confirmationMessage += `\n\nFöljande ${invoicesWithoutEmail.length} fakturor kan inte skickas eftersom de saknar e-postadress: ${names}.`;
            }
            if (draftInvoices.length > 0) {
                confirmationMessage += `\n\n${draftInvoices.length} utkast kommer att ignoreras.`;
            }
            confirmationMessage += "\n\nVill du fortsätta?";

            showConfirmationModal(async () => {
                const btn = document.getElementById('send-selected-invoices-btn');
                const originalText = btn.textContent;
                btn.disabled = true;
                
                let successCount = 0;
                let errorCount = 0;
                
                for (const [index, invoice] of invoicesWithEmail.entries()) {
                    btn.textContent = `Skickar ${index + 1}/${invoicesWithEmail.length}...`;
                    try {
                        await sendInvoiceByEmail(invoice.id);
                        successCount++;
                    } catch (e) {
                        console.error(`Failed to send invoice #${invoice.invoiceNumber}:`, e);
                        errorCount++;
                    }
                }
                
                showToast(`${successCount} fakturor skickades. ${errorCount} misslyckades.`, errorCount > 0 ? 'warning' : 'success');
                btn.disabled = false;
                btn.textContent = originalText;
                
            }, "Bekräfta utskick", confirmationMessage);
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
            <h3 class="card-title">Betalningshistorik</h3>
            <ul class="history-list">
                ${invoice.payments.map(p => `<li class="history-item"><span>${p.date}</span><span class="text-right green">${(p.amount || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</span></li>`).join('')}
            </ul>
        </div>` : '';

    mainView.innerHTML = `
        <div class="invoice-editor">
            <div class="card">
                <h3>${invoiceId ? `Faktura #${invoice.invoiceNumber}` : 'Skapa Ny Faktura'}</h3>
                ${invoice ? `<p><strong>Status:</strong> <span class="invoice-status ${invoice.status}">${invoice.status}</span> | <strong>Återstår att betala:</strong> ${(invoice.balance || 0).toLocaleString('sv-SE', {style:'currency', currency: 'SEK'})}</p>` : ''}
                <div class="invoice-form-grid">
                    <div class="input-group">
                        <label>Kundnamn</label>
                        <input id="customerName" class="form-input" value="${customerName}" ${isLocked ? 'disabled' : ''}>
                    </div>
                    <div class="input-group">
                        <label>Kundens E-post (för påminnelser)</label>
                        <input id="customerEmail" type="email" class="form-input" value="${customerEmail}" ${isLocked ? 'disabled' : ''}>
                    </div>
                    <div class="input-group"><label>Fakturadatum</label><input id="invoiceDate" type="date" class="form-input" value="${invoice?.invoiceDate || today}" ${isLocked ? 'disabled' : ''}></div>
                    <div class="input-group"><label>Förfallodatum</label><input id="dueDate" type="date" class="form-input" value="${invoice?.dueDate || today}" ${isLocked ? 'disabled' : ''}></div>
                </div>
            </div>
            <div class="card">
                <h3 class="card-title">Fakturarader</h3>
                <div id="invoice-items-container"></div>
                ${!isLocked ? `
                    <button id="add-item-btn" class="btn btn-secondary" style="margin-top: 1rem;">+ Lägg till Egen Rad</button>
                    <button id="add-product-btn" class="btn btn-primary" style="margin-top: 1rem; margin-left: 1rem;">+ Lägg till Produkt</button>
                ` : ''}
            </div>
            ${paymentHistoryHtml}
            <div class="card">
                <h3 class="card-title">Villkor och Kommentarer</h3>
                <textarea id="invoice-notes" class="form-input" rows="4" placeholder="T.ex. information om betalningsvillkor..." ${isLocked ? 'disabled' : ''}>${notes}</textarea>
            </div>
            <div class="invoice-actions-footer">
                <button id="back-btn" class="btn btn-secondary">Tillbaka till översikt</button>
                ${!isLocked ? `
                    <button id="save-draft-btn" class="btn btn-secondary">Spara som Utkast</button>
                    <button id="save-send-btn" class="btn btn-primary">Bokför Faktura</button>
                ` : `
                    <button id="pdf-btn" class="btn btn-secondary">Ladda ned PDF</button>
                    <button id="email-btn" class="btn btn-primary">Skicka via E-post</button>
                `}
            </div>
        </div>`;

    renderInvoiceItems(isLocked);
    document.getElementById('back-btn').addEventListener('click', () => window.navigateTo('invoices'));

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

async function initiateSingleSendProcess(invoiceId) {
    const { allInvoices } = getState();
    const invoice = allInvoices.find(inv => inv.id === invoiceId);
    const btn = document.getElementById('email-btn');
    const originalText = btn.textContent;

    const executeSend = async (email) => {
        btn.disabled = true;
        btn.textContent = 'Skickar...';
        try {
            await sendInvoiceByEmail(invoiceId, email);
            showToast('E-postmeddelande har skickats!', 'success');
        } catch (error) {
            console.error("Kunde inte skicka e-post:", error);
            showToast('Kunde inte skicka e-post. Kontrollera dina inställningar.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    };

    if (invoice.customerEmail) {
        showConfirmationModal(() => executeSend(invoice.customerEmail), "Bekräfta utskick", `Är du säker på att du vill skicka faktura #${invoice.invoiceNumber} till ${invoice.customerEmail}?`);
    } else {
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <h3>E-postadress saknas</h3>
                    <p>Ange en e-postadress för kunden "${invoice.customerName}" för att skicka fakturan.</p>
                    <div class="input-group">
                        <label>E-postadress</label>
                        <input id="prompt-email-input" type="email" class="form-input" placeholder="kund@exempel.se">
                    </div>
                    <div class="modal-actions">
                        <button id="modal-cancel" class="btn btn-secondary">Avbryt</button>
                        <button id="modal-save-send" class="btn btn-primary">Spara & Skicka</button>
                    </div>
                </div>
            </div>`;
        
        document.getElementById('modal-cancel').addEventListener('click', closeModal);
        document.getElementById('modal-save-send').addEventListener('click', async () => {
            const newEmail = document.getElementById('prompt-email-input').value.trim();
            if (!newEmail.includes('@')) {
                showToast("Ange en giltig e-postadress.", "warning");
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
                showToast("Kunde inte spara e-postadressen.", "error");
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
                            <option value="business" ${item.priceSelection === 'business' ? 'selected' : ''}>Företag (${(product.sellingPriceBusiness || 0).toFixed(2)} kr)</option>
                            <option value="private" ${item.priceSelection === 'private' ? 'selected' : ''}>Privat (${(product.sellingPricePrivate || 0).toFixed(2)} kr)</option>
                            <option value="custom" ${item.priceSelection === 'custom' ? 'selected' : ''}>Valfri summa</option>
                        </select>
                        <input type="number" step="0.01" class="form-input item-price" data-index="${index}" value="${item.price || 0}" ${item.priceSelection !== 'custom' ? 'readonly' : ''}>
                    </div>`;
            } else {
                priceFieldHtml = `<input type="number" step="0.01" class="form-input item-price" data-index="${index}" value="${item.price || 0}" placeholder="0.00">`;
            }
        } else {
            descriptionFieldHtml = isLocked ? item.description : `<input class="form-input item-description" data-index="${index}" value="${item.description}" placeholder="Beskrivning">`;
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
            <thead><tr><th>Beskrivning</th><th>Antal</th><th>Pris (exkl. moms)</th><th>Moms</th><th class="text-right">Summa</th><th></th></tr></thead>
            <tbody>${tableRows}</tbody>
            <tfoot>
                <tr><td colspan="5" class="text-right"><strong>Summa (exkl. moms):</strong></td><td class="text-right"><strong>${subtotal.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</strong></td></tr>
                <tr><td colspan="5" class="text-right"><strong>Moms:</strong></td><td class="text-right"><strong>${totalVat.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</strong></td></tr>
                <tr><td colspan="5" class="text-right" style="font-size: 1.2em;"><strong>Totalsumma:</strong></td><td class="text-right" style="font-size: 1.2em;"><strong>${grandTotal.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</strong></td></tr>
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
                <span>Företag: ${(p.sellingPriceBusiness || 0).toLocaleString('sv-SE')} kr | Privat: ${(p.sellingPricePrivate || 0).toLocaleString('sv-SE')} kr</span>
            </div>
        </div>`).join('');
    modalContainer.innerHTML = `
        <div class="modal-overlay" id="product-selector-overlay">
            <div class="modal-content">
                <h3>Välj en produkt</h3>
                <div class="product-selector-dropdown show">${productItems.length > 0 ? productItems : '<p style="padding: 1rem;">Inga produkter hittades.</p>'}</div>
                <div class="modal-actions">
                    <button id="modal-cancel" class="btn btn-secondary">Avbryt</button>
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
    const subtotal = invoiceItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.price || 0)), 0);
    const totalVat = invoiceItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.price || 0) * ((item.vatRate || 0) / 100)), 0);
    const grandTotal = subtotal + totalVat;

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
        invoiceNumber: invoiceId ? getState().allInvoices.find(i => i.id === invoiceId).invoiceNumber : Date.now()
    };

    if (!invoiceData.customerName || invoiceItems.length === 0) {
        showToast("Kundnamn och minst en fakturarad är obligatoriskt.", "warning");
        return;
    }

    const confirmTitle = status === 'Skickad' ? "Bokför Faktura" : "Spara Utkast";
    const confirmMessage = status === 'Skickad' ? "Fakturan kommer att låsas för redigering och markeras som skickad. Detta är en bokföringshändelse som inte kan ångras." : "Är du säker på att du vill spara detta utkast?";

    showConfirmationModal(async () => {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Sparar...";
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

            sourceTimeEntryIds = [];
            await fetchAllCompanyData();
            showToast(status === 'Skickad' ? 'Fakturan har bokförts och låsts!' : 'Utkast sparat!', 'success');
            window.navigateTo('invoices');
        } catch (error) {
            console.error("Kunde inte spara faktura:", error);
            showToast('Kunde inte spara fakturan.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }, confirmTitle, confirmMessage);
}

function showPaymentModal(invoiceId) {
    const { allInvoices } = getState();
    const invoice = allInvoices.find(inv => inv.id === invoiceId);
    const today = new Date().toISOString().slice(0, 10);

    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>Registrera Betalning för Faktura #${invoice.invoiceNumber}</h3>
                <p>Återstående belopp: <strong>${(invoice.balance || 0).toLocaleString('sv-SE', {style:'currency', currency: 'SEK'})}</strong></p>
                <form id="payment-form">
                    <div class="input-group">
                        <label>Betalningsdatum</label>
                        <input id="payment-date" type="date" class="form-input" value="${today}">
                    </div>
                    <div class="input-group">
                        <label>Belopp</label>
                        <input id="payment-amount" type="number" step="0.01" class="form-input" value="${invoice.balance || 0}" max="${invoice.balance || 0}">
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" id="modal-cancel">Avbryt</button>
                        <button type="submit" class="btn btn-primary">Registrera</button>
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
        showToast('Ange ett giltigt belopp.', 'warning');
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
            description: `Betalning för faktura #${invoice.invoiceNumber}`,
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
        showToast('Betalning registrerad!', 'success');
        closeModal();
        
        const currentPage = document.querySelector('.sidebar-nav a.active')?.dataset.page;
        if (currentPage === 'invoices') {
            renderInvoiceList();
        } else if (document.querySelector('.invoice-editor')) {
            renderInvoiceEditor(invoiceId);
        }
        
    } catch (error) {
        console.error("Fel vid registrering av betalning:", error);
        showToast("Kunde inte registrera betalning.", "error");
    }
}

export async function generateInvoicePDF(invoiceId, silent = false) {
    const { allInvoices, currentCompany } = getState();
    const invoice = allInvoices.find(inv => inv.id === invoiceId);
    if (!invoice) {
        if (!silent) showToast("Kunde inte hitta fakturadata.", "error");
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
        throw new Error("Kunde inte hitta fakturadata.");
    }
    
    const recipientEmail = emailOverride || invoice.customerEmail;
    if (!recipientEmail) {
        throw new Error("E-postadress saknas");
    }

    const doc = new jsPDF();
    await createPdfContent(doc, invoice, currentCompany);
    const pdfBase64 = doc.output('datauristring').split(',')[1];

    await sendInvoiceWithAttachmentFunc({
        to: recipientEmail,
        companyId: currentCompany.id,
        subject: `Faktura #${invoice.invoiceNumber} från ${currentCompany.name}`,
        body: `<p>Hej,</p><p>Här kommer faktura #${invoice.invoiceNumber}.</p><p>Den finns bifogad i detta mail.</p><p>Vänligen bortse från detta meddelande om betalning redan är gjord.</p><br><p>Med vänliga hälsningar,</p><p>${currentCompany.name}</p>`,
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
    doc.text('Faktura', 200, 20, { align: 'right' });

    doc.setFontSize(10);
    let startY = 50;
    doc.text(`Från:`, 15, startY);
    doc.setFont(undefined, 'bold');
    doc.text(company.name || '', 15, startY += 5);
    doc.setFont(undefined, 'normal');
    doc.text(`Org.nr: ${company.orgNumber || ''}`, 15, startY += 5);

    startY = 50;
    doc.text('Faktura till:', 130, startY);
    doc.setFont(undefined, 'bold');
    doc.text(invoice.customerName, 130, startY += 5);
    doc.setFont(undefined, 'normal');
    if (invoice.customerEmail) {
        doc.text(invoice.customerEmail, 130, startY += 5);
    }
    
    startY += 10;
    doc.text(`Fakturanummer:`, 130, startY);
    doc.text(`${invoice.invoiceNumber}`, 200, startY, { align: 'right' });
    doc.text(`Fakturadatum:`, 130, startY += 5);
    doc.text(invoice.invoiceDate, 200, startY, { align: 'right' });
    doc.setFont(undefined, 'bold');
    doc.text(`Förfallodatum:`, 130, startY += 5);
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
        head: [['Beskrivning', 'Antal', 'À-pris (exkl. moms)', 'Moms', 'Summa (inkl. moms)']],
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
    doc.text(`Summa (exkl. moms):`, summaryX, summaryY);
    doc.text(`${(invoice.subtotal || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}`, 200, summaryY, { align: 'right' });
    doc.text(`Moms:`, summaryX, summaryY += 6); 
    doc.text(`${(invoice.totalVat || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}`, 200, summaryY, { align: 'right' });
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Att betala:`, summaryX, summaryY += 7);
    doc.text(`${(invoice.grandTotal || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}`, 200, summaryY, { align: 'right' });
    doc.setFont(undefined, 'normal');

    if(invoice.payments && invoice.payments.length > 0) {
        const totalPaid = invoice.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        doc.text(`Betalt:`, summaryX, summaryY += 7);
        doc.text(`-${totalPaid.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}`, 200, summaryY, { align: 'right' });
        
        doc.setFont(undefined, 'bold');
        doc.text(`Återstår:`, summaryX, summaryY += 7);
        doc.text(`${(invoice.balance || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}`, 200, summaryY, { align: 'right' });
    }
    
    let finalYWithTotals = summaryY + 15;
    if (invoice.notes) {
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        const splitNotes = doc.splitTextToSize(invoice.notes, 185);
        doc.text("Kommentarer & Villkor:", 15, finalYWithTotals);
        doc.text(splitNotes, 15, finalYWithTotals + 5);
    }
}