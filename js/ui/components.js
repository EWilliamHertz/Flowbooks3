// js/ui/components.js
// Innehåller återanvändbara funktioner för att rendera UI-komponenter.
import { getState } from '../state.js';
import { renderTransactionForm } from './transactions.js';

export function getControlsHTML() {
    return `
        <div class="controls-container">
            <div class="search-container">
                <input type="text" id="search-input" placeholder="Sök transaktioner...">
            </div>
            <div class="filter-container">
                <button class="btn filter-btn active" data-period="all">Alla</button>
                <button class="btn filter-btn" data-period="this-month">Denna månad</button>
                <button class="btn filter-btn" data-period="last-month">Förra månaden</button>
            </div>
        </div>`;
}

export function applyFiltersAndRender(list, type) {
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const activeFilterEl = document.querySelector('.filter-btn.active');
    const activeFilter = activeFilterEl ? activeFilterEl.dataset.period : 'all';
    
    let filteredList = list;
    if (searchTerm) {
        filteredList = filteredList.filter(t => 
            t.description.toLowerCase().includes(searchTerm) || 
            (t.party && t.party.toLowerCase().includes(searchTerm))
        );
    }

    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    if (activeFilter === 'this-month') {
        filteredList = filteredList.filter(t => new Date(t.date) >= firstDayThisMonth);
    } else if (activeFilter === 'last-month') {
        filteredList = filteredList.filter(t => new Date(t.date) >= firstDayLastMonth && new Date(t.date) <= lastDayLastMonth);
    }

    renderTransactionTable(filteredList, type);
}

export function renderTransactionTable(transactions, type) {
    const { categories } = getState();
    const container = document.getElementById('table-container');
    if (!container) return;

    const getCategoryName = (id) => categories.find(c => c.id === id)?.name || '-';
    
    let head, rows;
    if (type === 'summary') {
        head = `<th>Datum</th><th>Beskrivning</th><th>Kategori</th><th>Motpart</th><th class="text-right">Summa</th><th>Åtgärd</th>`;
        rows = transactions.map(t => `
            <tr class="transaction-row ${t.type} ${t.isCorrection ? 'corrected' : ''}">
                <td>${t.date}</td>
                <td>${t.description}</td>
                <td>${getCategoryName(t.categoryId)}</td>
                <td>${t.party || ''}</td>
                <td class="text-right ${t.type === 'income' ? 'green' : 'red'}">${Number(t.amount).toFixed(2)} kr</td>
                ${t.isCorrection ? '<td>Rättad</td>' : `<td><button class="btn-correction" data-id="${t.id}" data-type="${t.type}">Korrigera</button></td>`}
            </tr>`).join('');
    } else {
        head = `<th>Datum</th><th>Beskrivning</th><th>Kategori</th><th>Motpart</th><th class="text-right">Summa</th><th>Åtgärd</th>`;
        rows = transactions.map(data => `
            <tr class="${data.isCorrection ? 'corrected' : ''}">
                <td>${data.date}</td>
                <td>${data.description}</td>
                <td>${getCategoryName(data.categoryId)}</td>
                <td>${data.party || ''}</td>
                <td class="text-right">${Number(data.amount).toFixed(2)} kr</td>
                ${data.isCorrection ? '<td>Rättad</td>' : `<td><button class="btn-correction" data-id="${data.id}" data-type="${type}">Korrigera</button></td>`}
            </tr>`).join('');
    }

    container.innerHTML = `
        <table class="data-table">
            <thead><tr>${head}</tr></thead>
            <tbody>${rows.length > 0 ? rows : `<tr><td colspan="${head.split('</th>').length}" class="text-center">Inga transaktioner att visa.</td></tr>`}</tbody>
        </table>`;
        
    container.querySelectorAll('.btn-correction').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const { allTransactions } = getState();
            const originalData = allTransactions.find(t => t.id === e.target.dataset.id);
            renderTransactionForm(e.target.dataset.type, originalData, true, e.target.dataset.id);
        });
    });
}
