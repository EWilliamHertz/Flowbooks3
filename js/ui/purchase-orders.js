// js/ui/purchase-orders.js
import { getState } from '../state.js';
import { saveDocument, deleteDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal, renderSpinner } from './utils.js';
import { writeBatch, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js';
import { db } from '../../firebase-config.js';
import { t } from '../i18n.js';

let poItems = [];

export function renderPurchaseOrdersPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <div id="po-list-container">
                ${renderSpinner()}
            </div>
        </div>
    `;
    renderPurchaseOrderList();
}

function renderPurchaseOrderList() {
    const { allPurchaseOrders } = getState();
    const container = document.getElementById('po-list-container');
    if (!container) return;

    const rows = allPurchaseOrders.sort((a, b) => b.poNumber - a.poNumber).map(po => `
        <tr data-po-id="${po.id}">
            <td><span class="invoice-status ${po.status}">${t(po.status)}</span></td>
            <td>#${po.poNumber}</td>
            <td>${po.supplierName}</td>
            <td>${po.orderDate}</td>
            <td>${po.expectedDeliveryDate || '-'}</td>
            <td class="text-right">${(po.totalAmount || 0).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</td>
            <td>
                <div class="action-menu" style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-secondary btn-edit-po">${t('show')}</button>
                    ${po.status === 'Beställd' ? `<button class="btn btn-sm btn-success btn-receive-po">${t('receiveDelivery')}</button>` : ''}
                </div>
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <h3 class="card-title">${t('purchaseOrders')}</h3>
        <table class="data-table" id="po-table">
            <thead>
                <tr>
                    <th>${t('status')}</th>
                    <th>${t('poNumber')}</th>
                    <th>${t('supplier')}</th>
                    <th>${t('orderDate')}</th>
                    <th>${t('expectedDeliveryDate')}</th>
                    <th class="text-right">${t('totalAmount')}</th>
                    <th>${t('actions')}</th>
                </tr>
            </thead>
            <tbody>
                ${allPurchaseOrders.length > 0 ? rows : `<tr><td colspan="7" class="text-center">${t('noPurchaseOrdersYet')}</td></tr>`}
            </tbody>
        </table>`;
    
    attachPOListEventListeners();
}

function attachPOListEventListeners() {
    const table = document.getElementById('po-table');
    if (!table) return;

    table.addEventListener('click', e => {
        const poId = e.target.closest('tr')?.dataset.poId;
        if (!poId) return;

        if (e.target.classList.contains('btn-edit-po')) {
            renderPurchaseOrderEditor(poId);
        } else if (e.target.classList.contains('btn-receive-po')) {
            receivePurchaseOrder(poId);
        }
    });
}

export function renderPurchaseOrderEditor(poId = null) {
    const { allPurchaseOrders, allContacts, allProducts } = getState();
    const po = poId ? allPurchaseOrders.find(p => p.id === poId) : null;
    poItems = po ? JSON.parse(JSON.stringify(po.items)) : [];
    const isLocked = po && po.status !== 'Utkast';
    const today = new Date().toISOString().slice(0, 10);

    const supplierOptions = allContacts
        .filter(c => c.type === 'supplier')
        .map(s => `<option value="${s.id}" data-name="${s.name}" ${po?.supplierId === s.id ? 'selected' : ''}>${s.name}</option>`)
        .join('');

    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="invoice-editor">
            <div class="card">
                <h3>${poId ? `${t('purchaseOrder')} #${po.poNumber}` : t('newPurchaseOrder')}</h3>
                ${po ? `<p><strong>${t('status')}:</strong> <span class="invoice-status ${po.status}">${t(po.status)}</span></p>` : ''}
                <div class="input-group">
                    <label>${t('supplier')}</label>
                    <select id="po-supplier" class="form-input" ${isLocked ? 'disabled' : ''}>
                        <option value="">${t('selectSupplierPlaceholder')}</option>
                        ${supplierOptions}
                    </select>
                </div>
                <div class="invoice-form-grid" style="margin-top: 1rem;">
                    <div class="input-group"><label>${t('orderDate')}</label><input id="po-order-date" type="date" class="form-input" value="${po?.orderDate || today}" ${isLocked ? 'disabled' : ''}></div>
                    <div class="input-group"><label>${t('expectedDeliveryDate')}</label><input id="po-delivery-date" type="date" class="form-input" value="${po?.expectedDeliveryDate || ''}" ${isLocked ? 'disabled' : ''}></div>
                </div>
            </div>
            <div class="card">
                <h3 class="card-title">${t('poLines')}</h3>
                <div id="po-items-container"></div>
                ${!isLocked ? `<button id="add-product-btn" class="btn btn-primary" style="margin-top: 1rem;">+ ${t('addProduct')}</button>` : ''}
            </div>
            <div class="invoice-actions-footer">
                <button id="back-btn" class="btn btn-secondary">${t('back')}</button>
                ${!isLocked ? `
                    <button id="save-draft-btn" class="btn btn-secondary">${t('saveDraft')}</button>
                    <button id="save-order-btn" class="btn btn-primary">${t('placeOrder')}</button>
                ` : ''}
            </div>
        </div>`;

    renderPOItems(isLocked);
    document.getElementById('back-btn').addEventListener('click', () => window.navigateTo('purchaseOrders'));

    if (!isLocked) {
        document.getElementById('add-product-btn').addEventListener('click', showProductSelectorForPO);
        document.getElementById('save-draft-btn').addEventListener('click', e => savePurchaseOrder(e.target, poId, 'Utkast'));
        document.getElementById('save-order-btn').addEventListener('click', e => savePurchaseOrder(e.target, poId, 'Beställd'));
    }
}

function renderPOItems(isLocked = false) {
    const container = document.getElementById('po-items-container');
    const tableRows = poItems.map((item, index) => `
        <tr>
            <td>${item.productName}</td>
            <td>${isLocked ? item.quantity : `<input type="number" class="form-input item-quantity" data-index="${index}" value="${item.quantity}" style="width: 80px;">`}</td>
            <td class="text-right">${isLocked ? (item.purchasePrice || 0).toFixed(2) : `<input type="number" step="0.01" class="form-input item-price" data-index="${index}" value="${item.purchasePrice || 0}">`} kr</td>
            <td class="text-right">${((item.quantity || 0) * (item.purchasePrice || 0)).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</td>
            <td>${isLocked ? '' : `<button class="btn btn-sm btn-danger" data-index="${index}">X</button>`}</td>
        </tr>
    `).join('');

    const totalAmount = poItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.purchasePrice || 0)), 0);

    container.innerHTML = `
        <table class="data-table">
            <thead><tr><th>${t('product')}</th><th>${t('quantity')}</th><th class="text-right">${t('purchasePrice')}</th><th class="text-right">${t('totalAmount')}</th><th></th></tr></thead>
            <tbody>${tableRows}</tbody>
            <tfoot>
                <tr><td colspan="3" class="text-right" style="font-size: 1.2em;"><strong>${t('totalAmount')}</strong></td><td class="text-right" style="font-size: 1.2em;"><strong>${totalAmount.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</strong></td><td></td></tr>
            </tfoot>
        </table>`;

    if (!isLocked) {
        container.querySelectorAll('input').forEach(input => input.addEventListener('change', updatePOItem));
        container.querySelectorAll('.btn-danger').forEach(btn => btn.addEventListener('click', removePOItem));
    }
}

function updatePOItem(event) {
    const index = parseInt(event.target.dataset.index);
    const property = event.target.classList.contains('item-quantity') ? 'quantity' : 'purchasePrice';
    poItems[index][property] = parseFloat(event.target.value) || 0;
    renderPOItems(false);
}

function removePOItem(event) {
    const index = parseInt(event.target.dataset.index);
    poItems.splice(index, 1);
    renderPOItems(false);
}

function showProductSelectorForPO() {
    const { allProducts } = getState();
    const supplierId = document.getElementById('po-supplier').value;
    const productsToList = supplierId ? allProducts.filter(p => p.supplierId === supplierId) : allProducts;

    const productItems = productsToList.map(p => `
        <div class="product-selector-item" data-product-id="${p.id}">
            <img src="${p.imageUrl || 'https://via.placeholder.com/40'}" alt="${p.name}">
            <div class="product-selector-item-info">
                <strong>${p.name}</strong>
                <span>${t('price')}: ${(p.purchasePrice || 0).toLocaleString('sv-SE')} kr | ${t('productStock')}: ${p.stock}</span>
            </div>
        </div>`).join('');

    const modalHtml = `
        <div class="modal-overlay" id="product-selector-overlay">
            <div class="modal-content">
                <h3>${t('selectProduct')}</h3>
                <div class="product-selector-dropdown show">${productItems.length > 0 ? productItems : `<p style="padding: 1rem;">${t('noProductsFoundForSupplier')}</p>`}</div>
                <div class="modal-actions"><button id="modal-cancel" class="btn btn-secondary">${t('cancel')}</button></div>
            </div>
        </div>`;
    document.getElementById('modal-container').innerHTML = modalHtml;
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('product-selector-overlay').addEventListener('click', e => { if (e.target.id === 'product-selector-overlay') closeModal(); });
    
    document.querySelectorAll('.product-selector-item').forEach(item => {
        item.addEventListener('click', e => {
            const productId = e.currentTarget.dataset.productId;
            const product = allProducts.find(p => p.id === productId);
            if (product && !poItems.find(i => i.productId === productId)) {
                poItems.push({ productId: product.id, productName: product.name, quantity: 1, purchasePrice: product.purchasePrice || 0 });
                renderPOItems(false);
            }
            closeModal();
        });
    });
}

async function savePurchaseOrder(btn, poId, status) {
    const { allPurchaseOrders } = getState();
    const supplierSelect = document.getElementById('po-supplier');
    const selectedOption = supplierSelect.options[supplierSelect.selectedIndex];
    
    const supplierId = selectedOption.value;
    const supplierName = selectedOption.dataset.name;
    const totalAmount = poItems.reduce((sum, item) => sum + (item.quantity * item.purchasePrice), 0);

    let nextPoNumber;
    if (poId) {
        nextPoNumber = allPurchaseOrders.find(p => p.id === poId).poNumber;
    } else {
        const highestPoNumber = allPurchaseOrders.reduce((max, p) => p.poNumber > max ? p.poNumber : max, 0);
        nextPoNumber = highestPoNumber + 1;
    }

    const poData = {
        supplierId,
        supplierName,
        orderDate: document.getElementById('po-order-date').value,
        expectedDeliveryDate: document.getElementById('po-delivery-date').value,
        items: poItems,
        totalAmount,
        status,
        poNumber: nextPoNumber
    };

    if (!poData.supplierId || poItems.length === 0) {
        showToast(t('poSupplierAndLinesRequired'), "warning");
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('saving');
    try {
        await saveDocument('purchaseOrders', poData, poId);
        await fetchAllCompanyData();
        showToast(status === 'Beställd' ? t('poCreated') : t('poDraftSaved'), 'success');
        window.navigateTo('purchaseOrders');
    } catch (error) {
        showToast(t('couldNotSavePo'), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function receivePurchaseOrder(poId) {
    const { allPurchaseOrders, allProducts } = getState();
    const po = allPurchaseOrders.find(p => p.id === poId);
    if (!po) return;

    showConfirmationModal(async () => {
        try {
            const batch = writeBatch(db);
            
            // 1. Uppdatera lagersaldon
            po.items.forEach(item => {
                const product = allProducts.find(p => p.id === item.productId);
                if (product) {
                    const newStock = (product.stock || 0) + item.quantity;
                    batch.update(doc(db, 'products', item.productId), { stock: newStock });
                }
            });

            // 2. Skapa en utgiftspost
            const vatAmount = po.totalAmount - (po.totalAmount / 1.25); // Antar 25% moms
            const expenseData = {
                date: new Date().toISOString().slice(0, 10),
                description: t('poExpenseDescription', { poNumber: po.poNumber, supplierName: po.supplierName }),
                party: po.supplierName,
                amount: po.totalAmount,
                amountExclVat: po.totalAmount - vatAmount,
                vatRate: 25,
                vatAmount,
                categoryId: null, // Kan sättas manuellt senare
                generatedFromPOId: poId
            };
            const expenseRef = doc(db, 'expenses', `po_${poId}`); // Unikt ID
            await saveDocument('expenses', expenseData);

            // 3. Uppdatera PO status
            batch.update(doc(db, 'purchaseOrders', poId), { status: 'Mottagen' });

            await batch.commit();
            await fetchAllCompanyData();
            showToast(t('poReceivedSuccess'), 'success');
            renderPurchaseOrderList();
        } catch (error) {
            console.error(error);
            showToast(t('poReceivedError'), "error");
        }
    }, t('receiveDelivery'), t('receiveDeliveryConfirm'));
}