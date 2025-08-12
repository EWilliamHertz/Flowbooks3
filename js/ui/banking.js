// js/ui/banking.js
import { getState, setState } from '../state.js';
import { renderSpinner, showToast, closeModal, showConfirmationModal } from './utils.js';
import { getCategorySuggestion } from '../services/ai.js';
import { saveDocument, fetchAllCompanyData } from '../services/firestore.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';

// Huvudfunktion för att rendera sidan
export function renderBankingPage() {
    const mainView = document.getElementById('main-view');

    mainView.innerHTML = `
        <div class="card">
            <div class="card-title-container" style="display: flex; justify-content: space-between; align-items: center;">
                <h3>Bankavstämning via Fil</h3>
                <button id="upload-csv-btn" class="btn btn-primary">Läs in Kontoutdrag (CSV)</button>
            </div>
            <p>Ladda ner ett kontoutdrag som en CSV-fil från din internetbank. Ladda sedan upp filen här för att automatiskt analysera och bokföra dina transaktioner.</p>
            <input type="file" id="csv-file-input" accept=".csv" style="display: none;">
        </div>
        <div id="reconciliation-container" style="margin-top: 1.5rem;">
             <div class="card text-center"><p>Väntar på att en CSV-fil ska laddas upp.</p></div>
        </div>`;

    document.getElementById('upload-csv-btn').addEventListener('click', () => {
        document.getElementById('csv-file-input').click();
    });

    document.getElementById('csv-file-input').addEventListener('change', handleFileSelect);
}

// Hanterar den valda filen
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target.result;
            const transactions = parseCsv(text);
            if (transactions.length > 0) {
                renderReconciliationView(transactions);
            } else {
                showToast("Kunde inte hitta några transaktioner i filen.", "error");
            }
        } catch (error) {
            showToast(`Fel vid tolkning av fil: ${error.message}`, "error");
        }
    };
    reader.readAsText(file, 'ISO-8859-1'); // Vanlig teckenkodning för svenska banker
}

// Enkel CSV-tolkare
function parseCsv(text) {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    const transactions = lines.slice(1).map((line, index) => {
        const columns = line.split(';');
        if (columns.length < 3) return null;
        
        return {
            id: `csv-${index}`,
            date: columns[0]?.trim().replace(/"/g, ''),
            description: columns[1]?.trim().replace(/"/g, ''),
            amount: parseFloat(columns[2]?.trim().replace(/"/g, '').replace(',', '.').replace(/\s/g, '')) || 0,
            status: 'unmatched'
        };
    }).filter(t => t && t.date && t.description && t.amount !== 0);
    
    return transactions;
}

// Rendera vyn för avstämning
async function renderReconciliationView(transactions) {
    const container = document.getElementById('reconciliation-container');
    container.innerHTML = renderSpinner();

    for (const t of transactions) {
        if (t.amount < 0) {
            const suggestion = await getCategorySuggestion({ description: t.description, party: t.description });
            t.suggestedCategoryId = suggestion;
        }
    }
    
    setState({ bankTransactions: transactions });
    
    const { categories } = getState();
    const categoryOptions = categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    const rows = transactions.map(t => {
        const isIncome = t.amount > 0;
        let actionHtml = '';

        if (isIncome) {
            actionHtml = `<button class="btn btn-sm btn-primary" data-id="${t.id}" data-action="match-invoice">Matcha mot Faktura</button>`;
        } else {
            const suggestedCategory = categories.find(c => c.id === t.suggestedCategoryId);
            actionHtml = `
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <select class="form-input form-input-sm" data-id="${t.id}" data-action="categorize">
                        <option value="">Välj kategori...</option>
                        ${suggestedCategory ? `<option value="${suggestedCategory.id}" selected>Förslag: ${suggestedCategory.name}</option>` : ''}
                        <option value="" disabled>---</option>
                        ${categoryOptions}
                    </select>
                    <button class="btn btn-sm btn-success" data-id="${t.id}" data-action="approve-expense">Bokför</button>
                </div>`;
        }

        return `
            <tr id="row-${t.id}">
                <td>${t.date}</td>
                <td>${t.description}</td>
                <td class="text-right ${isIncome ? 'green' : 'red'}">${t.amount.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</td>
                <td>${actionHtml}</td>
            </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="card">
            <h3 class="card-title">Transaktioner att stämma av</h3>
            <p>${transactions.length} transaktioner har lästs in. Välj en åtgärd för varje rad nedan.</p>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Datum</th>
                        <th>Beskrivning</th>
                        <th class="text-right">Belopp</th>
                        <th>Åtgärd</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
        
    container.querySelectorAll('button[data-action="approve-expense"]').forEach(btn => {
        btn.addEventListener('click', handleApproveExpense);
    });
    // NY EVENT LISTENER FÖR FAKTURAMATCHNING
    container.querySelectorAll('button[data-action="match-invoice"]').forEach(btn => {
        btn.addEventListener('click', showInvoiceMatchingModal);
    });
}

// NY FUNKTION: Visar en modal för att matcha mot fakturor
function showInvoiceMatchingModal(event) {
    const transactionId = event.target.dataset.id;
    const { bankTransactions, allInvoices } = getState();
    const transaction = bankTransactions.find(t => t.id === transactionId);

    const openInvoices = allInvoices.filter(inv => inv.status === 'Skickad');

    const invoiceRows = openInvoices.map(inv => {
        const amountDifference = Math.abs(inv.grandTotal - transaction.amount);
        const isSuggested = amountDifference < 1; // Föreslå om beloppet är nära

        return `
            <tr class="${isSuggested ? 'suggested-match' : ''}">
                <td>#${inv.invoiceNumber}</td>
                <td>${inv.customerName}</td>
                <td>${inv.dueDate}</td>
                <td class="text-right">${inv.grandTotal.toLocaleString('sv-SE')} kr</td>
                <td><button class="btn btn-sm btn-primary" onclick="window.bankingFunctions.handleMatchInvoice('${transactionId}', '${inv.id}')">Välj</button></td>
            </tr>
        `;
    }).join('');

    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content" style="max-width: 800px;">
                <h3>Matcha Inbetalning mot Faktura</h3>
                <p>Inbetalning på <strong>${transaction.amount.toLocaleString('sv-SE')} kr</strong> den ${transaction.date}. Välj vilken faktura betalningen gäller.</p>
                <table class="data-table" style="margin-top: 1rem;">
                    <thead><tr><th>Fakturanr.</th><th>Kund</th><th>Förfallodatum</th><th class="text-right">Belopp</th><th>Åtgärd</th></tr></thead>
                    <tbody>${invoiceRows.length > 0 ? invoiceRows : `<tr><td colspan="5" class="text-center">Inga obetalda fakturor hittades.</td></tr>`}</tbody>
                </table>
                 <div class="modal-actions" style="margin-top: 1.5rem;">
                    <button id="modal-close" class="btn btn-secondary">Avbryt</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modal-container').innerHTML = modalHtml;
    document.getElementById('modal-close').addEventListener('click', closeModal);
}

// NY FUNKTION: Hanterar själva matchningen
async function handleMatchInvoice(transactionId, invoiceId) {
    const { bankTransactions, allInvoices } = getState();
    const transaction = bankTransactions.find(t => t.id === transactionId);
    const invoice = allInvoices.find(inv => inv.id === invoiceId);

    const confirmMessage = `Är du säker på att du vill matcha inbetalningen på ${transaction.amount.toLocaleString('sv-SE')} kr mot faktura #${invoice.invoiceNumber}?`;

    showConfirmationModal(async () => {
        try {
            // 1. Uppdatera fakturastatus
            const invoiceRef = doc(db, 'invoices', invoiceId);
            await updateDoc(invoiceRef, { status: 'Betald' });

            // 2. Skapa intäktspost
            const incomeData = {
                date: transaction.date,
                description: `Betalning för faktura #${invoice.invoiceNumber}`,
                party: invoice.customerName,
                amount: invoice.grandTotal, // Använd fakturans totalbelopp
                amountExclVat: invoice.subtotal,
                vatAmount: invoice.totalVat,
                generatedFromInvoiceId: invoiceId,
                reconciled: true,
                isCorrection: false,
            };
            await saveDocument('incomes', incomeData);

            await fetchAllCompanyData();
            showToast("Fakturan har markerats som betald och en intäkt har skapats!", "success");
            
            // Ta bort raden från vyn och stäng modalen
            document.getElementById(`row-${transactionId}`).style.display = 'none';
            closeModal();

        } catch (error) {
            showToast("Ett fel uppstod vid matchningen.", "error");
            console.error("Fakturmatchningsfel:", error);
        }
    }, "Bekräfta Matchning", confirmMessage);
}


// Hantera när användaren klickar "Bokför" på en utgift
async function handleApproveExpense(event) {
    const transactionId = event.target.dataset.id;
    const { bankTransactions } = getState();
    const transaction = bankTransactions.find(t => t.id === transactionId);
    
    const selectElement = document.querySelector(`select[data-id="${transactionId}"]`);
    const categoryId = selectElement.value;

    if (!categoryId) {
        showToast("Vänligen välj en kategori innan du bokför.", "warning");
        return;
    }

    const amount = Math.abs(transaction.amount);
    const vatRate = 25; // Antagande, kan utvecklas
    const vatAmount = amount - (amount / (1 + vatRate / 100));

    const expenseData = {
        date: transaction.date,
        description: transaction.description,
        party: transaction.description.split(' ').slice(0, 3).join(' '), // Förenklad motpart
        amount: amount,
        amountExclVat: amount - vatAmount,
        vatRate: vatRate,
        vatAmount: vatAmount,
        categoryId: categoryId,
        isCorrection: false,
        reconciled: true // Markera som avstämd
    };

    try {
        event.target.disabled = true;
        event.target.textContent = 'Sparar...';
        await saveDocument('expenses', expenseData);
        showToast("Utgiften har bokförts!", "success");
        
        document.getElementById(`row-${transactionId}`).style.display = 'none';

    } catch (error) {
        showToast("Kunde inte bokföra utgiften.", "error");
        event.target.disabled = false;
        event.target.textContent = 'Bokför';
    }
}

// Gör nya funktioner tillgängliga globalt
window.bankingFunctions = {
    handleMatchInvoice,
};
