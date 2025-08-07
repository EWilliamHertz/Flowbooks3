// js/ui/products.js
// All UI-logik för produktsidan.
import { getState } from '../state.js';
import { saveDocument, deleteDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal } from './utils.js';

export function renderProductsPage() {
    const { allProducts } = getState();
    const mainView = document.getElementById('main-view');
    
    const productsHtml = allProducts.length > 0 ? `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Bild</th>
                    <th>Namn</th>
                    <th>Typ</th>
                    <th>Pris</th>
                    <th>Lager</th>
                    <th>Åtgärder</th>
                </tr>
            </thead>
            <tbody>
                ${allProducts.map(p => `
                    <tr>
                        <td><img src="${p.imageUrl || 'https://placehold.co/40x56/eee/ccc?text=?'}" alt="${p.name}" style="width: 40px; height: 56px; object-fit: cover; border-radius: 4px;"></td>
                        <td><strong>${p.name}</strong></td>
                        <td>${p.type || 'Okänd'}</td>
                        <td>${p.price ? p.price + ' kr' : 'Ej satt'}</td>
                        <td>${p.stock || 0}</td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="attachProductPageEventListeners.renderProductForm('${p.id}')">Redigera</button>
                            <button class="btn btn-sm btn-danger" onclick="attachProductPageEventListeners.deleteProduct('${p.id}')">Ta bort</button>
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table>` : 
        `<div class="empty-state"><h3>Inga produkter ännu</h3><p>Lägg till din första produkt.</p></div>`;

    mainView.innerHTML = `
        <div class="card">
            <div id="table-container">${productsHtml}</div>
        </div>`;
}

function renderProductForm(productId = null) {
    const { allProducts } = getState();
    const product = productId ? allProducts.find(p => p.id === productId) : null;
    const isEdit = !!product;
    
    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content" onclick="event.stopPropagation()">
                <h3>${isEdit ? 'Redigera Produkt' : 'Ny Produkt'}</h3>
                <form id="product-form">
                    <div class="input-group"><label>Produktnamn</label><input id="product-name" value="${product?.name || ''}" required></div>
                    <div class="input-group"><label>Typ</label><input id="product-type" value="${product?.type || ''}"></div>
                    <div class="input-group"><label>Pris (kr)</label><input id="product-price" type="number" value="${product?.price || ''}"></div>
                    <div class="input-group"><label>Lager</label><input id="product-stock" type="number" value="${product?.stock || 0}"></div>
                    <div class="input-group"><label>Bild-URL</label><input id="product-image-url" value="${product?.imageUrl || ''}"></div>
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
        type: document.getElementById('product-type').value,
        price: parseFloat(document.getElementById('product-price').value) || null,
        stock: parseInt(document.getElementById('product-stock').value) || 0,
        imageUrl: document.getElementById('product-image-url').value,
    };
    try {
        await saveDocument('products', productData, productId);
        showToast(`Produkten har ${productId ? 'uppdaterats' : 'skapats'}!`, 'success');
        closeModal();
        await fetchAllCompanyData();
        renderProductsPage();
    } catch (error) {
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
