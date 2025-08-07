// js/ui/products.js
// KOMPLETT OCH KORREKT VERSION: Innehåller all funktionalitet: Prognosverktyg, Google Import, och standardhantering.
import { getState, setState } from '../state.js';
import { saveDocument, deleteDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal, renderSpinner } from './utils.js';
import { pickAndParseSheet } from '../services/google.js';
import { writeBatch, doc, collection, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';

let inventoryChartInstance = null; // Diagraminstans för denna sida

export function renderProductsPage() {
    // Förstör gammalt diagram om det finns för att undvika dubbletter
    if (inventoryChartInstance) {
        inventoryChartInstance.destroy();
        inventoryChartInstance = null;
    }

    const { allProducts } = getState();
    const mainView = document.getElementById('main-view');

    // Sätter upp ALLA knappar för denna sida: Ny Produkt + Importera
    const newItemBtn = document.getElementById('new-item-btn');
    newItemBtn.innerHTML = `
        <button id="add-new-product-btn" class="btn btn-primary">Ny Produkt</button>
        <button id="import-from-sheets-btn" class="btn btn-secondary" style="margin-left: 1rem;">Importera från Google Sheets</button>
    `;
    newItemBtn.style.display = 'block';
    document.getElementById('add-new-product-btn').onclick = () => renderProductForm();
    document.getElementById('import-from-sheets-btn').onclick = () => handleSheetImport();
    
    const productsHtml = allProducts.length > 0 ? `
        <table class="data-table">
            <thead><tr><th>Bild</th><th>Namn</th><th>Pris Företag (exkl. moms)</th><th>Pris Privat</th><th>Lager</th><th>Åtgärder</th></tr></thead>
            <tbody>
                ${allProducts.map(p => `
                    <tr>
                        <td>${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" class="product-thumbnail">` : '-'}</td>
                        <td><strong>${p.name}</strong></td>
                        <td>${(p.sellingPriceBusiness || 0).toLocaleString('sv-SE')} kr</td>
                        <td>${(p.sellingPricePrivate || 0).toLocaleString('sv-SE')} kr</td>
                        <td>${p.stock || 0}</td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="window.attachProductPageEventListeners.renderProductForm('${p.id}')">Redigera</button>
                            <button class="btn btn-sm btn-danger" onclick="window.attachProductPageEventListeners.deleteProduct('${p.id}')">Ta bort</button>
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table>` : 
        `<div class="empty-state"><h3>Inga produkter ännu</h3><p>Lägg till din första produkt via knapparna ovan.</p></div>`;

    mainView.innerHTML = `
        <div id="inventory-projection-container" class="card" style="margin-bottom: 1.5rem;"></div>
        <div class="card">
            <h3 class="card-title">Produktregister</h3>
            <div id="table-container">${productsHtml}</div>
        </div>`;

    renderInventoryProjection(); // Anropa funktionen som ritar upp prognosverktyget
}

/**
 * Renderar prognosverktyget för inventariets potential på produktsidan.
 */
function renderInventoryProjection() {
    const { allProducts, currentCompany } = getState();
    const container = document.getElementById('inventory-projection-container');
    
    const savedPrivateSplit = currentCompany.inventoryProjectionSplit || 60; // Standard 60% privat
    
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
    
    document.getElementById('save-projection-btn').addEventListener('click', async () => {
        const newPrivateSplit = parseFloat(privateInput.value) || 0;
        const companyRef = doc(db, 'companies', currentCompany.id);
        try {
            await updateDoc(companyRef, { inventoryProjectionSplit: newPrivateSplit });
            const updatedCompany = { ...currentCompany, inventoryProjectionSplit: newPrivateSplit };
            setState({ currentCompany: updatedCompany });
            showToast("Prognosinställning sparad!", "success");
        } catch (error) {
            console.error("Kunde inte spara prognos:", error);
            showToast("Kunde inte spara inställningen.", "error");
        }
    });

    updateProjection('private');
}

function updateInventoryChart(data) {
    const ctx = document.getElementById('inventoryPieChart').getContext('2d');
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

/**
 * Startar importflödet från Google Sheets.
 */
async function handleSheetImport() {
    try {
        showToast("Öppnar filväljare...", "info");
        const productsFromSheet = await pickAndParseSheet();
        if (productsFromSheet && productsFromSheet.length > 0) {
            showImportReviewModal(productsFromSheet);
        }
    } catch (error) {
        console.log("Import avbruten eller misslyckad:", error.message);
    }
}

/**
 * Visar en modal för att granska och bekräfta importen från Google Sheets.
 */
function showImportReviewModal(products) {
    const modalContainer = document.getElementById('modal-container');
    const rows = products.map((p, index) => `
        <tr>
            <td><input type="checkbox" class="import-checkbox" data-index="${index}" checked></td>
            <td><img src="${p.imageUrl || 'https://via.placeholder.com/40'}" alt="${p.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;"></td>
            <td>${p.name}</td>
            <td>${p.sellingPriceBusiness.toLocaleString('sv-SE')} kr</td>
            <td>${p.stock}</td>
        </tr>
    `).join('');

    modalContainer.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content" style="max-width: 800px;">
                <h3>Granska Produkter för Import</h3>
                <p>Kalkylarket måste ha rubrikerna: <strong>namn, pris, lager, bild-url</strong>. Bocka ur de produkter du inte vill importera.</p>
                <div style="max-height: 400px; overflow-y: auto;">
                    <table class="data-table">
                        <thead><tr><th>Importera?</th><th>Bild</th><th>Namn</th><th>Pris</th><th>Lager</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div class="modal-actions">
                    <button id="modal-cancel" class="btn btn-secondary">Avbryt</button>
                    <button id="modal-confirm-import" class="btn btn-primary">Importera Valda</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-confirm-import').addEventListener('click', async () => {
        const selectedIndexes = Array.from(document.querySelectorAll('.import-checkbox:checked')).map(cb => parseInt(cb.dataset.index));
        const productsToSave = selectedIndexes.map(i => products[i]);
        
        if (productsToSave.length === 0) {
            showToast("Inga produkter valda.", "warning");
            return;
        }

        const batch = writeBatch(db);
        productsToSave.forEach(product => {
            const docRef = doc(collection(db, 'products'));
            batch.set(docRef, { ...product, sellingPricePrivate: product.sellingPricePrivate || 0 });
        });

        await batch.commit();
        await fetchAllCompanyData();
        renderProductsPage();
        closeModal();
        showToast(`${productsToSave.length} produkter har importerats!`, 'success');
    });
}

/**
 * Renderar modalen för att skapa eller redigera en enskild produkt.
 */
function renderProductForm(productId = null) {
    const { allProducts } = getState();
    const product = productId ? allProducts.find(p => p.id === productId) : null;
    const isEdit = !!product;
    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content" onclick="event.stopPropagation()">
                <h3>${isEdit ? 'Redigera Produkt' : 'Ny Produkt'}</h3>
                <form id="product-form">
                    <div class="input-group"><label>Produktnamn *</label><input id="product-name" value="${product?.name || ''}" required></div>
                    <div class="input-group"><label>Bild-URL (valfritt)</label><input id="product-image-url" value="${product?.imageUrl || ''}" placeholder="https://..."></div>
                    <div class="form-grid">
                        <div class="input-group"><label>Inköpspris</label><input id="product-purchase-price" type="number" step="0.01" value="${product?.purchasePrice || ''}" placeholder="0.00"></div>
                        <div class="input-group"><label>Lagerantal</label><input id="product-stock" type="number" value="${product?.stock || 0}"></div>
                    </div>
                    <hr>
                    <div class="form-grid">
                        <div class="input-group"><label>Försäljningspris Företag (exkl. moms)</label><input id="product-selling-business" type="number" step="0.01" value="${product?.sellingPriceBusiness || ''}" placeholder="0.00"></div>
                        <div class="input-group"><label>Försäljningspris Privat</label><input id="product-selling-private" type="number" step="0.01" value="${product?.sellingPricePrivate || ''}" placeholder="0.00"></div>
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
    document.getElementById('product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveProductHandler(productId);
    });
}

/**
 * Sparar en enskild produkt till databasen.
 */
async function saveProductHandler(productId = null) {
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
    try {
        await saveDocument('products', productData, productId);
        showToast(`Produkten har ${productId ? 'uppdaterats' : 'skapats'}!`, 'success');
        closeModal();
        await fetchAllCompanyData();
        renderProductsPage();
    } catch (error) {
        console.error("Kunde inte spara produkt:", error);
        showToast('Kunde inte spara produkten.', 'error');
    }
}

/**
 * Raderar en produkt från databasen.
 */
function deleteProductHandler(productId) {
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

export const attachProductPageEventListeners = {
    renderProductForm,
    deleteProduct: deleteProductHandler,
};
window.attachProductPageEventListeners = attachProductPageEventListeners;
