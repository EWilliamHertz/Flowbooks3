// js/ui/bill-processor.js
import { getState } from '../state.js';
import { saveDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal } from './utils.js';
import { db } from '../../firebase-config.js';
import { editors } from './editors.js';
import { t } from '../i18n.js';

let billData = {};

export function renderBillProcessor(aiData) {
    const { allContacts } = getState();
    billData = { ...aiData, lineItems: aiData.lineItems || [] };

    const supplierMatch = allContacts.find(c => c.type === 'supplier' && c.name.toLowerCase() === billData.supplierName?.toLowerCase());
    billData.supplierId = supplierMatch ? supplierMatch.id : null;

    const modalContainer = document.getElementById('modal-container');
    const supplierOptions = allContacts
        .filter(c => c.type === 'supplier')
        .map(s => `<option value="${s.id}" ${s.id === billData.supplierId ? 'selected' : ''}>${s.name}</option>`)
        .join('');

    modalContainer.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content" style="max-width: 1000px; width: 95%;">
                <h3>${t('reviewAndConfirmBill')}</h3>
                <p>${t('aiInterpretedYourPdf')}</p>
                <div class="form-grid" style="margin-top: 1.5rem;">
                    <div class="input-group">
                        <label>${t('supplier')}</label>
                        <select id="bill-supplier" class="form-input">${supplierOptions}</select>
                        ${!billData.supplierId ? `<button id="create-supplier-btn" class="btn btn-sm btn-secondary" style="margin-top: 5px;">${t('createSupplier').replace('{supplierName}', billData.supplierName)}</button>` : ''}
                    </div>
                    <div class="input-group"><label>${t('invoiceId')}</label><input id="bill-number" class="form-input" value="${billData.invoiceNumber || ''}"></div>
                    <div class="input-group"><label>${t('invoiceDate')}</label><input id="bill-date" type="date" class="form-input" value="${billData.invoiceDate || ''}"></div>
                    <div class="input-group"><label>${t('dueDate')}</label><input id="bill-due-date" type="date" class="form-input" value="${billData.dueDate || ''}"></div>
                    <div class="input-group"><label>${t('totalAmountInclVat')}</label><input id="bill-total" type="number" step="0.01" class="form-input" value="${billData.totalAmount || 0}"></div>
                    <div class="input-group"><label>${t('vat')}</label><input id="bill-vat" type="number" step="0.01" class="form-input" value="${billData.vatAmount || 0}"></div>
                </div>
                <h4 style="margin-top: 2rem;">${t('invoiceLines')}</h4>
                <div id="bill-lines-container" style="max-height: 30vh; overflow-y: auto;"></div>
                <div class="modal-actions">
                    <button id="modal-cancel" class="btn btn-secondary">${t('cancel')}</button>
                    <button id="modal-confirm-bill" class="btn btn-primary">${t('postInvoice')}</button>
                </div>
            </div>
        </div>`;
    
    renderBillLines();
    attachBillProcessorEventListeners();
}

function renderBillLines() {
    const { allProducts } = getState();
    const container = document.getElementById('bill-lines-container');
    
    const rows = billData.lineItems.map((item, index) => {
        const productMatch = allProducts.find(p => p.name.toLowerCase() === item.description?.toLowerCase());
        item.productId = productMatch ? productMatch.id : null;
        
        let productCell = '';
        if (item.productId) {
            productCell = `<span><i class="fas fa-check-circle green"></i> ${t('linkedTo')} ${productMatch.name}</span>`;
        } else {
            productCell = `
                <span class="red">${t('unknownProduct')}</span>
                <button class="btn btn-sm btn-secondary btn-link-product" data-index="${index}">${t('link')}</button>
                <button class="btn btn-sm btn-primary btn-create-product" data-index="${index}">${t('create')}</button>
            `;
        }

        return `
            <tr data-index="${index}">
                <td><input type="text" class="form-input item-description" value="${item.description || ''}"></td>
                <td><input type="number" class="form-input item-quantity" value="${item.quantity || 1}" style="width: 70px;"></td>
                <td class="text-right"><input type="number" step="0.01" class="form-input item-price" value="${item.unitPrice || 0}"> kr</td>
                <td>${productCell}</td>
            </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="data-table">
            <thead><tr><th>${t('description')}</th><th>${t('quantity')}</th><th class="text-right">${t('priceExclVat')}</th><th>${t('productLink')}</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

function attachBillProcessorEventListeners() {
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-confirm-bill').addEventListener('click', handleSaveBill);

    const createSupplierBtn = document.getElementById('create-supplier-btn');
    if (createSupplierBtn) {
        createSupplierBtn.addEventListener('click', async () => {
            const newSupplier = { name: billData.supplierName, type: 'supplier' };
            const newId = await saveDocument('contacts', newSupplier);
            await fetchAllCompanyData();
            billData.supplierId = newId;
            const supplierSelect = document.getElementById('bill-supplier');
            const options = getState().allContacts.filter(c => c.type === 'supplier').map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            supplierSelect.innerHTML = options;
            supplierSelect.value = newId;
            createSupplierBtn.remove();
        });
    }

    document.getElementById('bill-lines-container').addEventListener('click', e => {
        const index = e.target.closest('tr')?.dataset.index;
        if (index === undefined) return;
        
        if (e.target.classList.contains('btn-link-product')) {
            showToast(t('featureAvailableSoon'), "info");
        } else if (e.target.classList.contains('btn-create-product')) {
            const item = billData.lineItems[index];
            const productData = {
                name: item.description,
                purchasePrice: item.unitPrice,
                supplierId: billData.supplierId,
                supplierName: billData.supplierName
            };
            editors.renderProductForm(null, productData);
        }
    });
}

async function handleSaveBill() {
    const finalBillData = {
        supplierId: document.getElementById('bill-supplier').value,
        supplierName: document.getElementById('bill-supplier').options[document.getElementById('bill-supplier').selectedIndex].text,
        invoiceNumber: document.getElementById('bill-number').value,
        invoiceDate: document.getElementById('bill-date').value,
        dueDate: document.getElementById('bill-due-date').value,
        totalAmount: parseFloat(document.getElementById('bill-total').value) || 0,
        vatAmount: parseFloat(document.getElementById('bill-vat').value) || 0,
        status: 'Obetald',
        balance: parseFloat(document.getElementById('bill-total').value) || 0,
        items: billData.lineItems
    };

    if (!finalBillData.supplierId || !finalBillData.invoiceNumber || finalBillData.totalAmount <= 0) {
        showToast(t('supplierAndInvoiceNumberRequired'), "warning");
        return;
    }
    
    showConfirmationModal(async () => {
        try {
            const billId = await saveDocument('bills', finalBillData);

            const expenseData = {
                date: finalBillData.invoiceDate,
                description: `${t('invoice')} #${finalBillData.invoiceNumber} from ${finalBillData.supplierName}`,
                party: finalBillData.supplierName,
                amount: finalBillData.totalAmount,
                vatAmount: finalBillData.vatAmount,
                amountExclVat: finalBillData.totalAmount - finalBillData.vatAmount,
                vatRate: (finalBillData.vatAmount / (finalBillData.totalAmount - finalBillData.vatAmount)) * 100,
                generatedFromBillId: billId
            };
            await saveDocument('expenses', expenseData);

            await fetchAllCompanyData();
            showToast(t('billPosted'), "success");
            closeModal();
            window.navigateTo('invoices');

        } catch (error) {
            console.error("Could not save vendor bill:", error);
            showToast(t('errorPostingBill'), "error");
        }
    }, t('postVendorInvoice'), t('thisWillCreateExpense'));
}