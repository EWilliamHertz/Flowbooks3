// js/ui/import.js
import { writeBatch, doc, collection } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';
import { getState } from '../state.js';
import { fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, renderSpinner } from './utils.js';
import { navigateTo } from './navigation.js';
import { getCategorySuggestion } from '../services/ai.js';

export function renderImportPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <h3>Importera Transaktioner</h3>
            <p>Ladda upp en CSV-fil. Kolumner: <strong>Datum, Typ, Beskrivning, Motpart, Summa (SEK)</strong>.</p>
            <p>Vår AI-assistent kommer automatiskt att föreslå en kategori för dina utgifter.</p>
            <hr style="margin: 1rem 0;">
            <h4>Ladda upp fil</h4>
            <input type="file" id="csv-file-input" accept=".csv" style="display: block; margin-top: 1rem;">
        </div>`;
    document.getElementById('csv-file-input').addEventListener('change', handleFileSelect, false);
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
    modalContainer.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>Bearbetar fil och hämtar AI-förslag...</h3>
                ${renderSpinner()}
            </div>
        </div>`;

    try {
        const transactions = parseCSV(text);

        // Hämta AI-förslag endast för utgifter, eftersom AI:n är tränad för det.
        for (const t of transactions) {
            if (t.type.toLowerCase() === 'utgift') {
                t.suggestedCategoryId = await getCategorySuggestion(t);
            }
        }
        
        if (transactions.length > 0) {
            showImportConfirmationModal(transactions);
        } else {
            closeModal();
            showToast("Inga giltiga transaktioner hittades i filen.", "warning");
        }
    } catch (error) {
        closeModal();
        showToast(`Fel vid läsning av fil: ${error.message}`, "error");
    }
}

function parseCSV(text) {
    const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return [];
    
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const required = ['datum', 'typ', 'beskrivning', 'motpart', 'summa (sek)'];
    const idx = {
        date: header.indexOf(required[0]),
        type: header.indexOf(required[1]),
        description: header.indexOf(required[2]),
        party: header.indexOf(required[3]),
        amount: header.indexOf(required[4])
    };

    if (Object.values(idx).some(i => i === -1)) {
        throw new Error(`Filen saknar en eller flera av de obligatoriska kolumnerna: ${required.join(', ')}`);
    }
    
    const transactions = [];
    for (let i = 1; i < lines.length; i++) {
        const data = lines[i].split(',').map(d => d.trim());
        const type = data[idx.type]?.toLowerCase();
        if (type !== 'intäkt' && type !== 'utgift') continue;
        
        const amount = parseFloat(data[idx.amount]?.replace(/"/g, '').replace(/\s/g, '').replace(',', '.'));
        if (isNaN(amount)) continue;

        transactions.push({
            date: data[idx.date],
            type: type.charAt(0).toUpperCase() + type.slice(1),
            description: data[idx.description],
            party: data[idx.party] || '',
            amount: Math.abs(amount),
            id: `import-${i}`
        });
    }
    return transactions;
}

function showImportConfirmationModal(transactions) {
    const { categories } = getState();
    
    const transactionRows = transactions.map((t, index) => {
        // Skapa kategoriväljaren
        const categorySelector = `
            <select class="form-input import-category" data-transaction-index="${index}">
                <option value="">Välj kategori...</option>
                ${categories.map(cat => `<option value="${cat.id}" ${t.suggestedCategoryId === cat.id ? 'selected' : ''}>${cat.name}</option>`).join('')}
            </select>`;

        return `
        <tr>
            <td><input type="checkbox" class="import-checkbox" data-transaction-index="${index}" checked></td>
            <td>${t.date}</td>
            <td>${t.description}</td>
            <td>${t.party}</td>
            <td class="${t.type === 'Intäkt' ? 'green' : 'red'}">${t.type}</td>
            <td class="text-right">${t.amount.toFixed(2)} kr</td>
            <td>${categorySelector}</td> 
        </tr>`;
    }).join('');
    
    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content" style="max-width: 1000px;">
                <h3>Granska och bekräfta import</h3>
                <p>Bocka ur de rader du inte vill importera. Vår AI har föreslagit kategorier för utgifter.</p>
                <div style="max-height: 500px; overflow-y: auto;">
                    <table class="data-table">
                        <thead><tr><th><input type="checkbox" id="select-all-checkbox" checked></th><th>Datum</th><th>Beskrivning</th><th>Motpart</th><th>Typ</th><th class="text-right">Summa</th><th>Kategori</th></tr></thead>
                        <tbody>${transactionRows}</tbody>
                    </table>
                </div>
                <div class="modal-actions">
                    <button id="modal-cancel" class="btn btn-secondary">Avbryt</button>
                    <button id="modal-confirm-import" class="btn btn-primary">Importera valda</button>
                </div>
            </div>
        </div>`;

    document.getElementById('modal-container').innerHTML = modalHtml;
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('select-all-checkbox').addEventListener('change', (e) => {
        document.querySelectorAll('.import-checkbox').forEach(checkbox => checkbox.checked = e.target.checked);
    });
    document.getElementById('modal-confirm-import').addEventListener('click', () => handleImportConfirm(transactions));
}


async function handleImportConfirm(transactions) {
    const { currentUser, currentCompany } = getState();
    const selectedIndexes = Array.from(document.querySelectorAll('.import-checkbox:checked')).map(cb => parseInt(cb.dataset.transactionIndex));
    
    const toSave = selectedIndexes.map(index => {
        const transaction = transactions[index];
        const categorySelect = document.querySelector(`.import-category[data-transaction-index="${index}"]`);
        transaction.categoryId = categorySelect ? categorySelect.value : null;
        return transaction;
    });

    if (toSave.length === 0) {
        showToast("Inga transaktioner valda.", "warning");
        return;
    }

    const confirmBtn = document.getElementById('modal-confirm-import');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Sparar...';

    try {
        const batch = writeBatch(db);
        toSave.forEach(t => {
            const collectionName = t.type === 'Intäkt' ? 'incomes' : 'expenses';
            const docRef = doc(collection(db, collectionName));
            const data = {
                date: t.date,
                description: t.description,
                party: t.party,
                amount: t.amount,
                userId: currentUser.uid,
                companyId: currentCompany.id,
                createdAt: new Date(),
                isCorrection: false,
                // Lägg bara till categoryId om ett val har gjorts
                ...(t.categoryId && { categoryId: t.categoryId })
            };
            batch.set(docRef, data);
        });
        await batch.commit();
        await fetchAllCompanyData();
        showToast(`${toSave.length} transaktioner har importerats!`, 'success');
        closeModal();
        navigateTo('Sammanfattning');
    } catch (error) {
        showToast("Ett fel uppstod vid importen.", "error");
        console.error("Import error:", error);
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Importera valda';
    }
}
