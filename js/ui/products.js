// js/ui/products.js
// Kombinerad version med all funktionalitet: thumbnails, Pris Privat, och Google Sheets-import.
import { getState } from '../state.js';
import { saveDocument, deleteDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal, renderSpinner } from './utils.js';
import { pickAndParseSheet } from '../services/google.js'; // Importerar vår nya tjänst
import { writeBatch, doc, collection } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';

export function renderProductsPage() {
    const { allProducts } = getState();
    const mainView = document.getElementById('main-view');

    // Sätter upp knapparna för denna sida
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

    mainView.innerHTML = `<div class="card"><div id="table-container">${productsHtml}</div></div>`;
}

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
            // Spara all relevant data från sheet, inkl. pris privat om det fanns.
            batch.set(docRef, { ...product, sellingPricePrivate: product.sellingPricePrivate || 0 });
        });

        await batch.commit();

        await fetchAllCompanyData();
        renderProductsPage();
        closeModal();
        showToast(`${productsToSave.length} produkter har importerats!`, 'success');
    });
}


// --- Den befintliga koden för att hantera enskilda produkter (oförändrad) ---
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
