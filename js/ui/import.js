// js/ui/import.js
import { writeBatch, doc, collection } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';
import { getState } from '../state.js';
import { fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal } from './utils.js';
import { navigateTo } from './navigation.js';

export function renderImportPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <h3>Importera Transaktioner</h3>
            <p>Ladda upp en CSV-fil. Kolumner: <strong>Datum, Typ, Beskrivning, Motpart, Summa (SEK)</strong>.</p>
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

function processFileContent(text) {
    try {
        const transactions = parseCSV(text);
        if (transactions.length > 0) {
            showImportConfirmationModal(transactions);
        } else {
            showToast("Inga giltiga transaktioner hittades i filen.", "warning");
        }
    } catch (error) {
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
        const data = lines[i].split(',');
        const type = data[idx.type]?.trim().toLowerCase();
        if (type !== 'intäkt' && type !== 'utgift') continue;
        
        const amount = parseFloat(data[idx.amount]?.replace(/"/g, '').replace(/\s/g, '').replace(',', '.'));
        if (isNaN(amount)) continue;

        transactions.push({
            date: data[idx.date]?.trim(),
            type: type.charAt(0).toUpperCase() + type.slice(1),
            description: data[idx.description]?.trim(),
            party: data[idx.party]?.trim() || '',
            amount: Math.abs(amount),
            id: `import-${i}`
        });
    }
    return transactions;
}

function showImportConfirmationModal(transactions) {
    const transactionRows = transactions.map(t => `
        <tr>
            <td><input type="checkbox" class="import-checkbox" data-transaction-id="${t.id}" checked></td>
            <td>${t.date}</td><td>${t.description}</td><td>${t.party}</td>
            <td class="${t.type === 'Intäkt' ? 'green' : 'red'}">${t.type}</td>
            <td class="text-right">${t.amount.toFixed(2)} kr</td>
        </tr>`).join('');
    
    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content" style="max-width: 900px;">
                <h3>Granska och bekräfta import</h3>
                <p>Bocka ur de rader du inte vill importera.</p>
                <div style="max-height: 400px; overflow-y: auto;">
                    <table class="data-table">
                        <thead><tr><th><input type="checkbox" id="select-all-checkbox" checked></th><th>Datum</th><th>Beskrivning</th><th>Motpart</th><th>Typ</th><th class="text-right">Summa</th></tr></thead>
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
    const selectedIds = Array.from(document.querySelectorAll('.import-checkbox:checked')).map(cb => cb.dataset.transactionId);
    const toSave = transactions.filter(t => selectedIds.includes(t.id));
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
            batch.set(docRef, {
                date: t.date,
                description: t.description,
                party: t.party,
                amount: t.amount,
                userId: currentUser.uid,
                companyId: currentCompany.id,
                createdAt: new Date(),
                isCorrection: false
            });
        });
        await batch.commit();
        await fetchAllCompanyData();
        showToast(`${toSave.length} transaktioner har importerats!`, 'success');
        closeModal();
        navigateTo('Sammanfattning');
    } catch (error) {
        showToast("Ett fel uppstod vid importen.", "error");
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Importera valda';
    }
}
