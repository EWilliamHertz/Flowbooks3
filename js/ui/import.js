// js/ui/import.js
import { writeBatch, doc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';
import { getState } from '../state.js';
import { fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, renderSpinner } from './utils.js';
import { getAIProductDetails } from '../services/ai.js';
import { t } from '../i18n.js';

let parsedCsvData = { headers: [], rows: [] };

export function renderImportPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card" style="max-width: 700px; margin: auto;">
            <h3>${t('importProductsFromCsv')}</h3>
            <p>${t('importProductsDescription')}</p>
            <hr style="margin: 1rem 0;">
            <h4>${t('uploadCsvFile')}</h4>
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
        if (lines.length < 2) throw new Error(t('fileSeemsEmptyOrIncorrect'));

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const rows = lines.slice(1).map(line => line.split(',').map(cell => cell.trim().replace(/"/g, '')));
        
        parsedCsvData = { headers, rows };
        showColumnMappingModal();

    } catch (error) {
        showToast(t('errorReadingFile').replace('{message}', error.message), "error");
    }
}

function showColumnMappingModal() {
    const flowbooksFields = [
        { key: 'name', label: t('productName'), required: true },
        { key: 'purchasePrice', label: t('purchasePriceOptional') },
        { key: 'stock', label: t('stockOptional') },
        { key: 'imageUrl', label: t('imageUrlOptional') }
    ];

    const optionsHtml = parsedCsvData.headers.map((header, index) => `<option value="${index}">${header}</option>`).join('');

    const mappingRows = flowbooksFields.map(field => `
        <tr>
            <td>${field.label} ${field.required ? '*' : ''}</td>
            <td>
                <select id="map-${field.key}" class="form-input">
                    <option value="-1">${t('doNotUseLetAiDecide')}</option>
                    ${optionsHtml}
                </select>
            </td>
        </tr>
    `).join('');

    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>${t('mapColumns')}</h3>
                <p>${t('mapColumnsDescription')}</p>
                <table class="data-table" style="margin-top:1rem;">
                    <thead><tr><th>${t('flowbooksField')}</th><th>${t('yourFileColumn')}</th></tr></thead>
                    <tbody>${mappingRows}</tbody>
                </table>
                <div class="modal-actions">
                    <button id="modal-cancel" class="btn btn-secondary">${t('cancel')}</button>
                    <button id="modal-start-ai" class="btn btn-primary">${t('startAiAnalysis')}</button>
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
        showToast(t('mustMapProductName'), "warning");
        return;
    }

    const mapping = {
        name: nameIndex,
        purchasePrice: parseInt(document.getElementById('map-purchasePrice').value),
        stock: parseInt(document.getElementById('map-stock').value),
        imageUrl: parseInt(document.getElementById('map-imageUrl').value),
    };

    const productsToAnalyze = parsedCsvData.rows.map(row => {
        return {
            name: row[mapping.name] || '',
            purchasePrice: mapping.purchasePrice !== -1 ? parseFloat(String(row[mapping.purchasePrice]).replace(',','.')) || 0 : undefined,
            stock: mapping.stock !== -1 ? parseInt(row[mapping.stock]) || 0 : undefined,
            imageUrl: mapping.imageUrl !== -1 ? row[mapping.imageUrl] || '' : undefined,
        };
    }).filter(p => p.name);

    if(productsToAnalyze.length === 0) {
        showToast(t('noProductsWithNameFound'), "error");
        closeModal();
        return;
    }

    document.getElementById('modal-container').innerHTML = `<div class="modal-overlay"><div class="modal-content"><h3>${t('analyzingProductsWithAi').replace('{count}', productsToAnalyze.length)}</h3><p>${t('thisMayTakeAWhile')}</p>${renderSpinner()}</div></div>`;
    
    const productSuggestions = await Promise.all(
        productsToAnalyze.map(async (baseProduct) => {
            const aiDetails = await getAIProductDetails(baseProduct.name);
            return {
                name: baseProduct.name,
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
            <div class="modal-content" style="max-width: 1200px; width: 95%;">
                <h3>${t('reviewAiSuggestions')}</h3>
                <p>${t('reviewAiSuggestionsDescription')}</p>
                <div style="max-height: 60vh; overflow-y: auto;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th><input type="checkbox" id="select-all-checkbox" checked></th>
                                <th>${t('name')}</th>
                                <th>${t('purchasePrice')}</th>
                                <th>${t('stock')}</th>
                                <th>${t('imageUrl')}</th>
                                <th>${t('priceBusiness')}</th>
                                <th>${t('pricePrivate')}</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div class="modal-actions">
                    <button id="modal-cancel" class="btn btn-secondary">${t('cancel')}</button>
                    <button id="modal-confirm-import" class="btn btn-primary">${t('importSelected').replace('{count}', products.length)}</button>
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
        showToast(t('noProductsSelected'), "warning");
        return;
    }
    
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('saving');

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
        showToast(t('productsImported').replace('{count}', productsToSave.length), 'success');
        closeModal();
        window.navigateTo('products');
    } catch (error) {
        showToast(t('errorDuringImport'), "error");
        console.error("Import error:", error);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}