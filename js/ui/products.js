// js/ui/products.js
import { getState, setState } from '../state.js';
import { saveDocument, deleteDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal, renderSpinner } from './utils.js';
import { doc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';

let inventoryChartInstance = null;

export function renderProductsPage() {
    if (inventoryChartInstance) {
        inventoryChartInstance.destroy();
        inventoryChartInstance = null;
    }

    const { allProducts } = getState();
    const mainView = document.getElementById('main-view');
    
    const productsHtml = allProducts.length > 0 ? `
        <table class="data-table" id="products-table">
            <thead>
                <tr>
                    <th><input type="checkbox" id="select-all-products"></th>
                    <th>Bild</th>
                    <th>Namn</th>
                    <th>Pris Företag (exkl. moms)</th>
                    <th>Pris Privat</th>
                    <th>Lager</th>
                    <th>Åtgärder</th>
                </tr>
            </thead>
            <tbody>
                ${allProducts.map(p => `
                    <tr data-product-id="${p.id}">
                        <td><input type="checkbox" class="product-select-checkbox" data-id="${p.id}"></td>
                        <td>${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" class="product-thumbnail">` : '-'}</td>
                        <td><strong>${p.name}</strong></td>
                        <td>${(p.sellingPriceBusiness || 0).toLocaleString('sv-SE')} kr</td>
                        <td>${(p.sellingPricePrivate || 0).toLocaleString('sv-SE')} kr</td>
                        <td>${p.stock || 0}</td>
                        <td>
                            <button class="btn btn-sm btn-secondary btn-edit-product">Redigera</button>
                            <button class="btn btn-sm btn-danger btn-delete-product">Ta bort</button>
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table>` : 
        `<div class="empty-state"><h3>Inga produkter ännu</h3><p>Lägg till din första produkt via knappen "Ny Produkt" uppe till höger eller via "Importera Data" i menyn.</p></div>`;

    mainView.innerHTML = `
        <div id="inventory-projection-container" class="card" style="margin-bottom: 1.5rem;"></div>
        <div class="card">
            <div class="controls-container" style="padding: 0; background: none; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                <h3 class="card-title" style="margin: 0;">Produktregister</h3>
                <button id="delete-selected-products-btn" class="btn btn-danger" style="display: none;">Ta bort valda</button>
            </div>
            <div id="table-container">${productsHtml}</div>
        </div>`;
    
    attachProductPageEventListeners();
    renderInventoryProjection();
}

function attachProductPageEventListeners() {
    const productTable = document.getElementById('products-table');
    if (!productTable) return;

    productTable.addEventListener('click', (e) => {
        const target = e.target;
        const productId = target.closest('tr')?.dataset.productId;

        if (!productId) return;

        if (target.classList.contains('btn-edit-product')) {
            renderProductForm(productId);
        } else if (target.classList.contains('btn-delete-product')) {
            deleteProduct(productId);
        } else if (target.classList.contains('product-thumbnail')) {
            const productName = target.alt;
            const imageUrl = target.src;
            showProductImage(imageUrl, productName);
        }
    });

    const allCheckbox = document.getElementById('select-all-products');
    const checkboxes = document.querySelectorAll('.product-select-checkbox');
    const deleteBtn = document.getElementById('delete-selected-products-btn');

    const toggleDeleteButton = () => {
        const selected = document.querySelectorAll('.product-select-checkbox:checked');
        deleteBtn.style.display = selected.length > 0 ? 'inline-block' : 'none';
        deleteBtn.textContent = `Ta bort valda (${selected.length})`;
    };

    if (allCheckbox) {
        allCheckbox.addEventListener('change', (e) => {
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            toggleDeleteButton();
        });
    }

    checkboxes.forEach(cb => cb.addEventListener('change', toggleDeleteButton));

    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const selectedIds = Array.from(document.querySelectorAll('.product-select-checkbox:checked')).map(cb => cb.dataset.id);
            if (selectedIds.length > 0) {
                showConfirmationModal(async () => {
                    const batch = writeBatch(db);
                    selectedIds.forEach(id => {
                        batch.delete(doc(db, 'products', id));
                    });
                    await batch.commit();
                    await fetchAllCompanyData();
                    renderProductsPage();
                    showToast(`${selectedIds.length} produkter har tagits bort!`, 'success');
                }, "Ta bort produkter", `Är du säker på att du vill ta bort ${selectedIds.length} produkter permanent?`);
            }
        });
    }
}

function renderInventoryProjection() {
    const { allProducts, currentCompany } = getState();
    const container = document.getElementById('inventory-projection-container');
    if (!container) return;
    
    const savedPrivateSplit = currentCompany.inventoryProjectionSplit || 60;
    
    container.innerHTML = `
        <h3 class="card-title">Prognos för Inventarievärde</h3>
        <p>Ställ in en procentuell fördelning för att se hur det påverkar den potentiella omsättningen från ditt lager. Inställningen sparas och visas på Översikt-sidan.</p>
        <div class="projection-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: center; margin-top: 1rem;">
            <div class="projection-inputs">
                <div class="input-group">
                    <label>Andel såld till Privat (%)</label>
                    <input type="number" id="percent-private" class="form-input" value="${savedPrivateSplit}" min="0" max="100">
                </div>
                <div class="input-group">
                    <label>Andel såld till Företag (%)</label>
                    <input type="number" id="percent-business" class="form-input" value="${100 - savedPrivateSplit}" min="0" max="100">
                </div>
                <div id="projection-results" style="margin-top: 1.5rem; font-size: 1.1rem;">
                    <p>Potentiell omsättning (Privat): <strong id="result-private" class="green"></strong></p>
                    <p>Potentiell omsättning (Företag): <strong id="result-business" class="blue"></strong></p>
                </div>
                 <button id="save-projection-btn" class="btn btn-primary" style="margin-top: 1rem;">Spara Prognosinställning</button>
            </div>
            <div class="projection-chart" style="position: relative; height: 250px;">
                <canvas id="inventoryPieChart"></canvas>
            </div>
        </div>`;
    
    const privateInput = document.getElementById('percent-private');
    const businessInput = document.getElementById('percent-business');
    const saveBtn = document.getElementById('save-projection-btn');

    const updateProjection = (changedInput) => {
        let privatePercent = parseFloat(privateInput.value) || 0;
        let businessPercent = parseFloat(businessInput.value) || 0;

        if (changedInput === 'private') {
            if (privatePercent > 100) privatePercent = 100;
            if (privatePercent < 0) privatePercent = 0;
            businessPercent = 100 - privatePercent;
            privateInput.value = Math.round(privatePercent);
            businessInput.value = Math.round(businessPercent);
        } else {
            if (businessPercent > 100) businessPercent = 100;
            if (businessPercent < 0) businessPercent = 0;
            privatePercent = 100 - businessPercent;
            businessInput.value = Math.round(businessPercent);
            privateInput.value = Math.round(privatePercent);
        }

        let totalPrivateValue = 0;
        let totalBusinessValue = 0;
        allProducts.forEach(product => {
            const stock = product.stock || 0;
            const privatePrice = product.sellingPricePrivate || 0;
            const businessPrice = product.sellingPriceBusiness || 0;
            const privateUnits = stock * (privatePercent / 100);
            const businessUnits = stock * (businessPercent / 100);
            totalPrivateValue += privateUnits * privatePrice;
            totalBusinessValue += businessUnits * businessPrice;
        });

        document.getElementById('result-private').textContent = `${totalPrivateValue.toLocaleString('sv-SE')} kr`;
        document.getElementById('result-business').textContent = `${totalBusinessValue.toLocaleString('sv-SE')} kr`;
        updateInventoryChart([totalPrivateValue, totalBusinessValue]);
    };

    privateInput.addEventListener('input', () => updateProjection('private'));
    businessInput.addEventListener('input', () => updateProjection('business'));
    
    saveBtn.addEventListener('click', async () => {
        const newPrivateSplit = parseFloat(privateInput.value) || 0;
        const companyRef = doc(db, 'companies', currentCompany.id);
        
        saveBtn.disabled = true;
        saveBtn.textContent = 'Sparar...';

        try {
            await updateDoc(companyRef, { inventoryProjectionSplit: newPrivateSplit });
            const updatedCompany = { ...currentCompany, inventoryProjectionSplit: newPrivateSplit };
            setState({ currentCompany: updatedCompany });
            showToast("Prognosinställning sparad!", "success");
        } catch (error) {
            console.error("Kunde inte spara prognos:", error);
            showToast("Kunde inte spara inställningen.", "error");
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Spara Prognosinställning';
        }
    });

    updateProjection('private');
}

function updateInventoryChart(data) {
    const ctx = document.getElementById('inventoryPieChart')?.getContext('2d');
    if (!ctx) return;

    if (inventoryChartInstance) {
        inventoryChartInstance.data.datasets[0].data = data;
        inventoryChartInstance.update();
        return;
    }
    inventoryChartInstance = new Chart(ctx, {
        type: 'pie',
        data: { labels: ['Privat', 'Företag'], datasets: [{ data: data, backgroundColor: ['rgba(46, 204, 113, 0.8)', 'rgba(74, 144, 226, 0.8)'] }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

export function renderProductForm(productId = null) {
    const { allProducts } = getState();
    const product = productId ? allProducts.find(p => p.id === productId) : null;
    const isEdit = !!product;
    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content" onclick="event.stopPropagation()">
                <h3>${isEdit ? 'Redigera Produkt' : 'Ny Produkt'}</h3>
                <form id="product-form">
                    <div class="input-group"><label>Produktnamn *</label><input class="form-input" id="product-name" value="${product?.name || ''}" required></div>
                    <div class="input-group"><label>Bild-URL (valfritt)</label><input class="form-input" id="product-image-url" value="${product?.imageUrl || ''}" placeholder="https://..."></div>
                    <div class="form-grid">
                        <div class="input-group"><label>Inköpspris</label><input class="form-input" id="product-purchase-price" type="number" step="0.01" value="${product?.purchasePrice || ''}" placeholder="0.00"></div>
                        <div class="input-group"><label>Lagerantal</label><input class="form-input" id="product-stock" type="number" value="${product?.stock || 0}"></div>
                    </div>
                    <hr>
                    <div class="form-grid">
                        <div class="input-group"><label>Försäljningspris Företag (exkl. moms)</label><input class="form-input" id="product-selling-business" type="number" step="0.01" value="${product?.sellingPriceBusiness || ''}" placeholder="0.00"></div>
                        <div class="input-group"><label>Försäljningspris Privat</label><input class="form-input" id="product-selling-private" type="number" step="0.01" value="${product?.sellingPricePrivate || ''}" placeholder="0.00"></div>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" id="modal-cancel">Avbryt</button>
                        <button type="submit" class="btn btn-primary">${isEdit ? 'Uppdatera' : 'Skapa'}</button>
                    </div>
                </form>
            </div>
        </div>`;
    
    document.getElementById('modal-container').innerHTML = modalHtml;
    
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    
    document.getElementById('product-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        saveProductHandler(btn, productId);
    });
}

async function saveProductHandler(btn, productId = null) {
    const productData = {
        name: document.getElementById('product-name').value,
        imageUrl: document.getElementById('product-image-url').value,
        purchasePrice: parseFloat(document.getElementById('product-purchase-price').value) || 0,
        stock: parseInt(document.getElementById('product-stock').value) || 0,
        sellingPriceBusiness: parseFloat(document.getElementById('product-selling-business').value) || 0,
        sellingPricePrivate: parseFloat(document.getElementById('product-selling-private').value) || 0,
    };
    if (!productData.name) {
        showToast("Produktnamn är obligatoriskt.", "warning");
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sparar...';

    try {
        await saveDocument('products', productData, productId);
        showToast(`Produkten har ${productId ? 'uppdaterats' : 'skapats'}!`, 'success');
        closeModal();
        await fetchAllCompanyData();
        renderProductsPage();
    } catch (error) {
        console.error("Kunde inte spara produkt:", error);
        showToast('Kunde inte spara produkten.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

export function deleteProduct(productId) {
    showConfirmationModal(async () => {
        try {
            await deleteDocument('products', productId);
            showToast('Produkten har tagits bort!', 'success');
            await fetchAllCompanyData();
            renderProductsPage();
        } catch (error) {
            showToast('Kunde inte ta bort produkten.', 'error');
        }
    }, "Ta bort produkt", "Är du säker på att du vill ta bort denna produkt permanent?");
}

export function showProductImage(imageUrl, productName) {
    const modalHtml = `
        <div class="modal-overlay" id="image-modal-overlay">
            <div class="modal-content image-modal">
                <h3>${productName}</h3>
                <img src="${imageUrl}" alt="${productName}" style="max-width: 100%; max-height: 70vh; margin-top: 1rem;">
                 <div class="modal-actions" style="margin-top: 1.5rem;">
                    <button id="modal-close" class="btn btn-primary">Stäng</button>
                </div>
            </div>
        </div>`;
    document.getElementById('modal-container').innerHTML = modalHtml;
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('image-modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'image-modal-overlay') {
            closeModal();
        }
    });
}