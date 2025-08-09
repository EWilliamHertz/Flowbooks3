// js/ui/import.js
import { writeBatch, doc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';
import { getState } from '../state.js';
import { fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, renderSpinner } from './utils.js';
import { navigateTo } from './navigation.js';
import { getAIProductDetails } from '../services/ai.js';

let parsedCsvData = { headers: [], rows: [] };

export function renderImportPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card" style="max-width: 700px; margin: auto;">
            <h3>Importera Produkter från CSV</h3>
            <p>Ladda upp en CSV-fil från din leverantör. I nästa steg får du mappa filens kolumner till FlowBooks produktfält.</p>
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

function processFileContent(text) {
    try {
        const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) throw new Error("Filen verkar vara tom eller felaktig. Den måste innehålla minst en rubrikrad och en rad med data.");

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const rows = lines.slice(1).map(line => line.split(',').map(cell => cell.trim().replace(/"/g, '')));
        
        parsedCsvData = { headers, rows };
        showColumnMappingModal();

    } catch (error) {
        showToast(`Fel vid läsning av fil: ${error.message}`, "error");
    }
}

function showColumnMappingModal() {
    const flowbooksFields = [
        { key: 'name', label: 'Produktnamn', required: true },
        { key: 'purchasePrice', label: 'Inköpspris (valfritt)' },
        { key: 'stock', label: 'Lagerantal (valfritt)' },
        { key: 'imageUrl', label: 'Bild-URL (valfritt)' }
    ];

    const optionsHtml = parsedCsvData.headers.map((header, index) => `<option value="${index}">${header}</option>`).join('');

    const mappingRows = flowbooksFields.map(field => `
        <tr>
            <td>${field.label} ${field.required ? '*' : ''}</td>
            <td>
                <select id="map-${field.key}" class="form-input">
                    <option value="-1">Använd inte / Låt AI bestämma</option>
                    ${optionsHtml}
                </select>
            </td>
        </tr>
    `).join('');

    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>Koppla Kolumner</h3>
                <p>Välj vilken kolumn från din fil som motsvarar fälten i FlowBooks. Fält du inte mappar kommer AI:n att försöka fylla i.</p>
                <table class="data-table" style="margin-top:1rem;">
                    <thead><tr><th>FlowBooks Fält</th><th>Din Fils Kolumn</th></tr></thead>
                    <tbody>${mappingRows}</tbody>
                </table>
                <div class="modal-actions">
                    <button id="modal-cancel" class="btn btn-secondary">Avbryt</button>
                    <button id="modal-start-ai" class="btn btn-primary">Starta AI-Analys</button>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('modal-container').innerHTML = modalHtml;
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-start-ai').addEventListener('click', handleStartAiAnalysis);
}

async function handleStartAiAnalysis() {
    const nameIndex = parseInt(document.getElementById('map-name').value);
    if (nameIndex === -1) {
        showToast("Du måste mappa ett fält till 'Produktnamn'.", "warning");
        return;
    }

    const mapping = {
        name: nameIndex,
        purchasePrice: parseInt(document.getElementById('map-purchasePrice').value),
        stock: parseInt(document.getElementById('map-stock').value),
        imageUrl: parseInt(document.getElementById('map-imageUrl').value),
    };

    const productsToAnalyze = parsedCsvData.rows.map(row => {
        const baseProduct = {
            name: row[mapping.name] || '',
            purchasePrice: mapping.purchasePrice !== -1 ? parseFloat(String(row[mapping.purchasePrice]).replace(',','.')) || 0 : undefined,
            stock: mapping.stock !== -1 ? parseInt(row[mapping.stock]) || 0 : undefined,
            imageUrl: mapping.imageUrl !== -1 ? row[mapping.imageUrl] || '' : undefined,
        };
        return baseProduct;
    }).filter(p => p.name);

    if(productsToAnalyze.length === 0) {
        showToast("Inga produkter med namn kunde hittas baserat på din mappning.", "error");
        closeModal();
        return;
    }

    document.getElementById('modal-container').innerHTML = `<div class="modal-overlay"><div class="modal-content"><h3>Analyserar ${productsToAnalyze.length} produkter med AI...</h3><p>Detta kan ta en liten stund.</p>${renderSpinner()}</div></div>`;
    
    const productSuggestions = await Promise.all(
        productsToAnalyze.map(async (baseProduct) => {
            const aiDetails = await getAIProductDetails(baseProduct.name);
            // Slå samman data: AI-data är grund, men data från CSV (om det finns) skriver över.
            return {
                name: baseProduct.name, // Namnet från CSV är alltid det som gäller
                purchasePrice: baseProduct.purchasePrice ?? aiDetails.purchasePrice,
                stock: baseProduct.stock ?? aiDetails.stock,
                imageUrl: baseProduct.imageUrl ?? aiDetails.imageUrl,
                sellingPriceBusiness: aiDetails.sellingPriceBusiness,
                sellingPricePrivate: aiDetails.sellingPricePrivate,
            };
        })
    );
    
    showImportConfirmationModal(productSuggestions.filter(p => p));
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
            <div class.modal-content" style="max-width: 1200px; width: 95%;">
                <h3>Granska AI-förslag</h3>
                <p>AI:n har fyllt i produktdata baserat på din mappning. Du kan redigera alla fält nedan innan du importerar.</p>
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
                    <button id="modal-confirm-import" class="btn btn-primary">Importera Valda (${products.length})</button>
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
