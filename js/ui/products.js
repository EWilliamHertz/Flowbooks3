// js/ui/products.js
// All UI-logik för produktsidan, nu med bild-thumbnails och all ursprunglig funktionalitet.
import { getState } from '../state.js';
import { saveDocument, deleteDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal } from './utils.js';

export function renderProductsPage() {
    const { allProducts } = getState();
    const mainView = document.getElementById('main-view');
    
    // Notera: Tabellen är något förenklad för att ge plats åt bilden. All data finns kvar i redigeringsvyn.
    const productsHtml = allProducts.length > 0 ? `
        <table class="data-table">
            <thead>
                <tr>
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
                    <tr>
                        <td>
                            ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" class="product-thumbnail">` : '-'}
                        </td>
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
        `<div class="empty-state"><h3>Inga produkter ännu</h3><p>Lägg till din första produkt genom att klicka på "Ny Produkt".</p></div>`;

    mainView.innerHTML = `
        <div class="card">
            <div id="table-container">${productsHtml}</div>
        </div>`;
}

function renderProductForm(productId = null) {
    const { allProducts } = getState();
    const product = productId ? allProducts.find(p => p.id === productId) : null;
    const isEdit = !!product;
    
    // Återställer den fullständiga modalen med ALLA fält.
    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content" onclick="event.stopPropagation()">
                <h3>${isEdit ? 'Redigera Produkt' : 'Ny Produkt'}</h3>
                <form id="product-form">
                    <div class="input-group">
                        <label>Produktnamn *</label>
                        <input id="product-name" value="${product?.name || ''}" required>
                    </div>
                    <div class="input-group">
                        <label>Bild-URL (valfritt)</label>
                        <input id="product-image-url" value="${product?.imageUrl || ''}" placeholder="https://...">
                    </div>
                    <div class="form-grid">
                        <div class="input-group">
                            <label>Inköpspris</label>
                            <input id="product-purchase-price" type="number" step="0.01" value="${product?.purchasePrice || ''}" placeholder="0.00">
                        </div>
                        <div class="input-group">
                            <label>Lagerantal</label>
                            <input id="product-stock" type="number" value="${product?.stock || 0}">
                        </div>
                    </div>
                    <hr>
                    <div class="form-grid">
                        <div class="input-group">
                            <label>Försäljningspris Företag (exkl. moms)</label>
                            <input id="product-selling-business" type="number" step="0.01" value="${product?.sellingPriceBusiness || ''}" placeholder="0.00">
                        </div>
                        <div class="input-group">
                            <label>Försäljningspris Privat</label>
                            <input id="product-selling-private" type="number" step="0.01" value="${product?.sellingPricePrivate || ''}" placeholder="0.00">
                        </div>
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
    // Säkerställer att ALL data från formuläret sparas.
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

// Gör funktioner tillgängliga globalt för onclick-anrop
export const attachProductPageEventListeners = {
    renderProductForm,
    deleteProduct: deleteProductHandler,
};
window.attachProductPageEventListeners = attachProductPageEventListeners;
