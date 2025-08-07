// js/ui/import.js
// KOMPLETT VERSION: Använder en avancerad AI-funktion för att föreslå alla produktattribut.
import { writeBatch, doc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';
import { getState } from '../state.js';
import { fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, renderSpinner } from './utils.js';
import { navigateTo } from './navigation.js';
import { getAIProductDetails } from '../services/ai.js'; // Använder den nya, smarta AI-funktionen

export function renderImportPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card" style="max-width: 700px; margin: auto;">
            <h3>Importera Produkter med AI</h3>
            <p>Ladda upp en enkel CSV-fil med en enda kolumn: <strong>Produktnamn</strong>. Vår AI kommer att analysera namnen och föreslå fullständiga produktprofiler inklusive priser, lager och bilder, som du sedan kan granska och justera.</p>
            <hr style="margin: 1rem 0;">
            <h4>Ladda upp CSV-fil</h4>
            <input type="file" id="product-csv-input" accept=".csv" style="display: block; margin-top: 1rem;">
        </div>`;
    document.getElementById('product-csv-input').addEventListener('change', handleFileSelect, false);
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => processFileContent(e.target.result);
    reader.readAsText(file, 'UTF-8');
}

async function processFileContent(text) {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `<div class="modal-overlay"><div class="modal-content"><h3>Analyserar produkter med AI...</h3><p>Detta kan ta en liten stund.</p>${renderSpinner()}</div></div>`;

    try {
        const productNames = parseCSV(text);
        if (productNames.length === 0) {
            closeModal();
            showToast("Inga produktnamn hittades i filen.", "warning");
            return;
        }

        // Anropa AI för varje produktnamn för att få fullständiga detaljer
        const productSuggestions = await Promise.all(
            productNames.map(name => getAIProductDetails(name))
        );
        
        showImportConfirmationModal(productSuggestions.filter(p => p)); // Filtrera bort eventuella misslyckade anrop

    } catch (error) {
        closeModal();
        showToast(`Fel vid läsning av fil: ${error.message}`, "error");
    }
}

function parseCSV(text) {
    // Förväntar sig en enkel CSV med en kolumn för produktnamn
    return text.split(/\r\n|\n/).map(line => line.trim()).filter(line => line.length > 0);
}

function showImportConfirmationModal(products) {
    const modalContainer = document.getElementById('modal-container');
    
    const rows = products.map((p, index) => `
        <tr data-index="${index}">
            <td><input type="checkbox" class="import-checkbox" checked></td>
            <td><input type="text" class="form-input" name="name" value="${p.name || ''}"></td>
            <td><input type="number" class="form-input text-right" name="purchasePrice" value="${p.purchasePrice || 0}"></td>
            <td><input type="number" class="form-input text-right" name="stock" value="${p.stock || 0}"></td>
            <td><input type="text" class="form-input" name="imageUrl" value="${p.imageUrl || ''}"></td>
            <td><input type="number" class="form-input text-right" name="sellingPriceBusiness" value="${p.sellingPriceBusiness || 0}"></td>
            <td><input type="number" class="form-input text-right" name="sellingPricePrivate" value="${p.sellingPricePrivate || 0}"></td>
        </tr>
    `).join('');

    modalContainer.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content" style="max-width: 1200px;">
                <h3>Granska AI-förslag</h3>
                <p>AI:n har fyllt i produktdata. Du kan redigera alla fält nedan innan du importerar.</p>
                <div style="max-height: 60vh; overflow-y: auto;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th><input type="checkbox" id="select-all-checkbox" checked></th>
                                <th>Namn</th>
                                <th>Inköpspris</th>
                                <th>Lager</th>
                                <th>Bild-URL</th>
                                <th>Pris Företag</th>
                                <th>Pris Privat</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div class="modal-actions">
                    <button id="modal-cancel" class="btn btn-secondary">Avbryt</button>
                    <button id="modal-confirm-import" class="btn btn-primary">Importera Valda</button>
                </div>
            </div>
        </div>`;

    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('select-all-checkbox').addEventListener('change', (e) => {
        document.querySelectorAll('.import-checkbox').forEach(checkbox => checkbox.checked = e.target.checked);
    });
    document.getElementById('modal-confirm-import').addEventListener('click', (e) => handleImportConfirm(e.target));
}

async function handleImportConfirm(btn) {
    const { currentUser, currentCompany } = getState();
    const rows = document.querySelectorAll('#modal-container tbody tr');
    const productsToSave = [];

    rows.forEach(row => {
        const checkbox = row.querySelector('.import-checkbox');
        if (checkbox.checked) {
            const productData = {};
            row.querySelectorAll('input[name]').forEach(input => {
                const name = input.name;
                const value = (input.type === 'number') ? parseFloat(input.value) || 0 : input.value;
                productData[name] = value;
            });
            productsToSave.push(productData);
        }
    });

    if (productsToSave.length === 0) {
        showToast("Inga produkter valda.", "warning");
        return;
    }
    
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sparar...';

    try {
        const batch = writeBatch(db);
        productsToSave.forEach(product => {
            const docRef = doc(collection(db, 'products'));
            const data = {
                ...product,
                userId: currentUser.uid,
                companyId: currentCompany.id,
                createdAt: serverTimestamp()
            };
            batch.set(docRef, data);
        });

        await batch.commit();
        await fetchAllCompanyData();
        showToast(`${productsToSave.length} produkter har importerats!`, 'success');
        closeModal();
        navigateTo('Produkter');
    } catch (error) {
        showToast("Ett fel uppstod vid importen.", "error");
        console.error("Import error:", error);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}
