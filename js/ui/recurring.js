// js/ui/recurring.js
import { getState } from '../state.js';
import { saveDocument, deleteDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, renderSpinner, showConfirmationModal, closeModal } from './utils.js';
import { navigateTo } from './navigation.js';
import { writeBatch, doc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';

export function renderRecurringPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <h3>Hantering av Återkommande Transaktioner</h3>
            <p>Schemalagda intäkter och utgifter som skapas automatiskt vid midnatt på sitt förfallodatum. Du kan även köra dem manuellt här.</p>
            <button id="run-recurring-btn" class="btn btn-secondary" style="margin-top: 1rem;">Kör manuellt nu</button>
        </div>
        <div class="card" style="margin-top: 1.5rem;">
            <h3>Mina Återkommande Transaktioner</h3>
            <div id="recurring-list-container">${renderSpinner()}</div>
        </div>`;
    document.getElementById('run-recurring-btn').addEventListener('click', () => runRecurringTransactions(false)); // Manuell körning är inte tyst
    renderRecurringList();
}

function renderRecurringList() {
    const { recurringTransactions } = getState();
    const container = document.getElementById('recurring-list-container');
    if (!container) return;
    const rows = recurringTransactions.map(item => `
        <tr>
            <td>${item.type === 'income' ? 'Intäkt' : 'Utgift'}</td>
            <td>${item.description}</td>
            <td class="text-right ${item.type === 'income' ? 'green' : 'red'}">${Number(item.amount).toFixed(2)} kr</td>
            <td>Varje månad</td>
            <td>${item.nextDueDate}</td>
            <td><button class="btn btn-sm btn-secondary" data-id="${item.id}" data-desc="${item.description}">Visa</button></td>
            <td><button class="btn btn-sm btn-danger" data-id="${item.id}">Ta bort</button></td>
        </tr>`).join('');
    container.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Typ</th><th>Beskrivning</th><th class="text-right">Summa</th><th>Frekvens</th><th>Nästa Datum</th><th>Historik</th><th>Åtgärd</th></tr></thead>
            <tbody>${rows.length > 0 ? rows : `<tr><td colspan="7" class="text-center">Du har inga återkommande transaktioner.</td></tr>`}</tbody>
        </table>`;
        
    container.querySelectorAll('.btn-secondary').forEach(btn => {
        btn.addEventListener('click', (e) => showHistoryModal(e.target.dataset.id, e.target.dataset.desc));
    });

    container.querySelectorAll('.btn-danger').forEach(btn => {
        btn.addEventListener('click', (e) => {
            showConfirmationModal(async () => {
                await deleteDocument('recurring', e.target.dataset.id);
                await fetchAllCompanyData();
                renderRecurringList();
                showToast('Borttagen.', 'success');
            }, "Ta bort återkommande transaktion", "Är du säker?");
        });
    });
}

export function renderRecurringTransactionForm() {
    const mainView = document.getElementById('main-view');
    const today = new Date().toISOString().slice(0, 10);
    mainView.innerHTML = `
        <div class="card" style="max-width: 600px; margin: auto;">
            <h3>Skapa Ny Återkommande Transaktion</h3>
            <div class="input-group"><label>Typ</label><select id="rec-type"><option value="expense">Utgift</option><option value="income">Intäkt</option></select></div>
            <div class="input-group"><label>Startdatum (första körning)</label><input id="rec-date" type="date" value="${today}"></div>
            <div class="input-group"><label>Beskrivning</label><input id="rec-desc" type="text"></div>
            <div class="input-group"><label>Motpart</label><input id="rec-party" type="text"></div>
            <div class="input-group"><label>Summa (SEK)</label><input id="rec-amount" type="number" placeholder="0.00"></div>
            <div class="modal-actions">
                <button id="cancel-btn" class="btn btn-secondary">Avbryt</button>
                <button id="save-btn" class="btn btn-primary">Spara</button>
            </div>
        </div>`;
    document.getElementById('save-btn').addEventListener('click', saveRecurringHandler);
    document.getElementById('cancel-btn').addEventListener('click', () => navigateTo('Återkommande'));
}

async function saveRecurringHandler() {
    const data = {
        type: document.getElementById('rec-type').value,
        nextDueDate: document.getElementById('rec-date').value,
        description: document.getElementById('rec-desc').value,
        party: document.getElementById('rec-party').value,
        amount: parseFloat(document.getElementById('rec-amount').value) || 0,
        frequency: 'monthly'
    };
    if (!data.nextDueDate || !data.description || data.amount <= 0) {
        showToast('Fyll i alla fält korrekt.', 'warning');
        return;
    }
    try {
        await saveDocument('recurring', data);
        await fetchAllCompanyData();
        navigateTo('Återkommande');
        showToast('Sparad!', 'success');
    } catch (error) {
        showToast('Ett fel uppstod.', 'error');
    }
}

export async function runRecurringTransactions(isSilent = false) {
    const { recurringTransactions, currentUser, currentCompany } = getState();
    const todayStr = new Date().toISOString().slice(0, 10);
    const toCreate = recurringTransactions.filter(item => item.nextDueDate && item.nextDueDate <= todayStr);
    
    if (toCreate.length === 0) {
        if (!isSilent) {
            showToast("Inga transaktioner att generera idag.", "info");
        }
        return;
    }
    
    const runBtn = document.getElementById('run-recurring-btn');
    if(runBtn && !isSilent) {
        runBtn.disabled = true;
        runBtn.textContent = 'Genererar...';
    }

    try {
        const batch = writeBatch(db);
        for (const item of toCreate) {
            const collectionName = item.type === 'income' ? 'incomes' : 'expenses';
            const docRef = doc(collection(db, collectionName));
            
            // Beräkna moms för automatiska utgifter (antar 25% som standard)
            let transactionData;
            if (item.type === 'expense') {
                const vatRate = 25;
                const vatAmount = item.amount - (item.amount / (1 + vatRate / 100));
                transactionData = {
                    amountExclVat: item.amount - vatAmount,
                    vatRate: vatRate,
                    vatAmount: vatAmount,
                };
            }
            
            batch.set(docRef, {
                date: item.nextDueDate,
                description: item.description,
                party: item.party,
                amount: item.amount,
                userId: currentUser.uid,
                companyId: currentCompany.id,
                createdAt: new Date(),
                isCorrection: false,
                generatedFromRecurringId: item.id,
                ...transactionData
            });
            const nextDate = new Date(item.nextDueDate);
            nextDate.setMonth(nextDate.getMonth() + 1);
            batch.update(doc(db, 'recurring', item.id), { nextDueDate: nextDate.toISOString().slice(0, 10) });
        }
        await batch.commit();
        await fetchAllCompanyData();
        
        if (!isSilent) {
             renderRecurringList();
             showToast(`${toCreate.length} transaktion(er) har skapats!`, 'success');
        } else {
            showToast(`Automatisk körning: ${toCreate.length} återkommande transaktion(er) har skapats.`, 'info');
            const currentPage = document.querySelector('.sidebar-nav a.active')?.dataset.page;
            // Om användaren är på en relevant sida, ladda om den för att visa ny data
            if (['Översikt', 'Sammanfattning', 'Intäkter', 'Utgifter', 'Återkommande'].includes(currentPage)) {
                 navigateTo(currentPage);
            }
        }
    } catch (error) {
        if (!isSilent) showToast("Ett fel uppstod vid generering.", "error");
        console.error("Fel vid automatisk körning av återkommande transaktioner:", error);
    } finally {
        if(runBtn && !isSilent) {
            runBtn.disabled = false;
            runBtn.textContent = 'Kör manuellt nu';
        }
    }
}

/**
 * NY FUNKTION: Visar en modal med historik för en återkommande transaktion.
 */
async function showHistoryModal(recurringId, description) {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>Historik för "${description}"</h3>
                <div id="history-content">${renderSpinner()}</div>
                <div class="modal-actions">
                    <button id="modal-close" class="btn btn-primary">Stäng</button>
                </div>
            </div>
        </div>`;
    
    document.getElementById('modal-close').addEventListener('click', closeModal);

    try {
        const { currentCompany } = getState();
        const incomesQuery = query(collection(db, 'incomes'), where('companyId', '==', currentCompany.id), where('generatedFromRecurringId', '==', recurringId));
        const expensesQuery = query(collection(db, 'expenses'), where('companyId', '==', currentCompany.id), where('generatedFromRecurringId', '==', recurringId));

        const [incomesSnap, expensesSnap] = await Promise.all([getDocs(incomesQuery), getDocs(expensesQuery)]);
        
        const historyItems = [
            ...incomesSnap.docs.map(doc => doc.data()),
            ...expensesSnap.docs.map(doc => doc.data())
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        const historyContent = document.getElementById('history-content');
        if (historyItems.length > 0) {
            historyContent.innerHTML = `
                <ul class="history-list">
                    ${historyItems.map(item => `
                        <li class="history-item">
                            <span>${item.date}</span>
                            <span class="text-right ${item.amount > 0 ? 'green' : 'red'}">${item.amount.toLocaleString('sv-SE')} kr</span>
                        </li>
                    `).join('')}
                </ul>`;
        } else {
            historyContent.innerHTML = '<p>Inga transaktioner har genererats från denna post än.</p>';
        }
    } catch (error) {
        console.error("Kunde inte hämta historik:", error);
        document.getElementById('history-content').innerHTML = '<p>Kunde inte ladda historik.</p>';
        showToast("Kunde inte hämta historik.", "error");
    }
}
