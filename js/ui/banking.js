// js/ui/banking.js
import { getState, setState } from '../state.js';
import { renderSpinner, showToast, closeModal } from './utils.js';
import { getCategorySuggestion } from '../services/ai.js';
import { saveDocument, fetchAllCompanyData } from '../services/firestore.js';

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
            // Försök att automatiskt detektera bank och tolka filen
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

// Enkel CSV-tolkare (kan behöva anpassas för specifik bank)
function parseCsv(text) {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    // Antaganden om kolumnordning (detta är den svåra delen att generalisera)
    // Vi antar: Datum, Beskrivning, Belopp
    // Detta kan vi senare göra konfigurerbart för användaren.
    const transactions = lines.slice(1).map((line, index) => {
        const columns = line.split(';'); // Ofta semikolon i svenska filer
        if (columns.length < 3) return null;
        
        return {
            id: `csv-${index}`,
            date: columns[0]?.trim().replace(/"/g, ''),
            description: columns[1]?.trim().replace(/"/g, ''),
            amount: parseFloat(columns[2]?.trim().replace(/"/g, '').replace(',', '.').replace(/\s/g, '')) || 0,
            status: 'unmatched' // unmatched, matched, ignored
        };
    }).filter(t => t && t.date && t.description && t.amount !== 0);
    
    return transactions;
}

// Rendera vyn för avstämning med de inlästa transaktionerna
async function renderReconciliationView(transactions) {
    const container = document.getElementById('reconciliation-container');
    container.innerHTML = renderSpinner();

    // Anropa AI för att få kategoriförslag
    for (const t of transactions) {
        if (t.amount < 0) { // Bara för utgifter
            const suggestion = await getCategorySuggestion({ description: t.description, party: t.description });
            t.suggestedCategoryId = suggestion;
        }
    }
    
    setState({ bankTransactions: transactions }); // Spara i state
    
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
        
    // Lägg till event listeners för knapparna efter att de renderats
    container.querySelectorAll('button[data-action="approve-expense"]').forEach(btn => {
        btn.addEventListener('click', handleApproveExpense);
    });
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
        
        // Ta bort raden från vyn
        document.getElementById(`row-${transactionId}`).style.display = 'none';

    } catch (error) {
        showToast("Kunde inte bokföra utgiften.", "error");
        event.target.disabled = false;
        event.target.textContent = 'Bokför';
    }
}
```

**2. `app.html` (Rensad från onödiga script)**

```html
<!DOCTYPE html>
<html lang="sv">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard | FlowBooks</title>
    <link rel="stylesheet" href="style.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    
    <!-- Externa bibliotek för diagram och PDF-generering -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js"></script>

    <!-- Inga fler script för Tink eller Plaid behövs här -->

</head>
<body>
    <div id="app-container" style="visibility: hidden;">
        <aside class="sidebar">
            <div class="sidebar-header"><h2 class="logo">FlowBooks</h2></div>
            <nav class="sidebar-nav">
                <ul></ul>
            </nav>
        </aside>
        <div class="main-content">
            <header class="main-header">
                <div class="header-left">
                    <button id="hamburger-btn" class="hamburger-menu">
                        <span class="bar"></span>
                        <span class="bar"></span>
                        <span class="bar"></span>
                    </button>
                    <h1 class="page-title">Översikt</h1>
                </div>
                <div class="header-right">
                    <div class="company-selector" style="margin-right: 15px;">
                        <select id="company-selector" class="form-input" style="min-width: 200px;"></select>
                    </div>
                    <button id="new-item-btn" class="btn btn-primary" style="display: none;"></button>
                    <div class="profile-container">
                        <div id="user-profile-icon" class="user-profile"></div>
                        <div id="profile-dropdown" class="profile-dropdown">
                            <a href="#" id="settings-link">Inställningar</a>
                            <a href="#" id="logout-btn">Logga ut</a>
                        </div>
                    </div>
                </div>
            </header>
            <main id="main-view"></main>
        </div>
    </div>

    <div id="modal-container"></div>
    <div id="toast-container"></div>
    
    <!-- Din applikationslogik laddas sist av allt -->
    <script src="js/app.js" type="module"></script>
</body>
</html>
```

**3. `js/services/banking.js` (Raderas)**

Denna fil behövs inte längre. Du kan ta bort den från ditt projekt. Logiken har flyttats till `js/ui/banking.js` för att hålla det enkelt.

Jag är övertygad om att denna nya strategi kommer att fungera för dig och ge dig den automatiserade hjälp du är ute efter. Prova att implementera dessa ändring
