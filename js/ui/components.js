// js/ui/components.js
import { getState } from '../state.js';
import { renderTransactionForm } from './transactions.js';

export function getControlsHTML() {
    const { categories } = getState();
    const categoryOptions = categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');

    return `
        <div class="controls-container">
            <div class="search-container">
                <input type="text" id="search-input" class="form-input" placeholder="Sök transaktioner...">
            </div>
            <div class="filter-container">
                <select id="category-filter" class="form-input">
                    <option value="all">Alla Kategorier</option>
                    ${categoryOptions}
                </select>
                <button class="btn filter-btn active" data-period="all">Alla</button>
                <button class="btn filter-btn" data-period="this-month">Denna månad</button>
                <button class="btn filter-btn" data-period="last-month">Förra månaden</button>
            </div>
        </div>`;
}

export function applyFiltersAndRender(list, type) {
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const selectedCategory = categoryFilter ? categoryFilter.value : 'all';
    const activePeriodEl = document.querySelector('.filter-btn.active');
    const activePeriod = activePeriodEl ? activePeriodEl.dataset.period : 'all';
    
    let filteredList = list;

    if (searchTerm) {
        filteredList = filteredList.filter(t => 
            t.description.toLowerCase().includes(searchTerm) || 
            (t.party && t.party.toLowerCase().includes(searchTerm))
        );
    }

    if (selectedCategory !== 'all') {
        filteredList = filteredList.filter(t => t.categoryId === selectedCategory);
    }

    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    if (activePeriod === 'this-month') {
        filteredList = filteredList.filter(t => new Date(t.date) >= firstDayThisMonth);
    } else if (activePeriod === 'last-month') {
        filteredList = filteredList.filter(t => new Date(t.date) >= firstDayLastMonth && new Date(t.date) <= lastDayLastMonth);
    }

    renderTransactionTable(filteredList, type);
}

export function renderTransactionTable(transactions, type) {
    const { categories } = getState();
    const container = document.getElementById('table-container');
    if (!container) return;

    const getCategoryName = (id) => categories.find(c => c.id === id)?.name || '-';
    
    const head = `<th>Datum</th><th>Beskrivning</th><th>Kategori</th><th class="text-right">Summa (exkl. moms)</th><th class="text-right">Moms</th><th class="text-right">Total Summa</th><th>Åtgärd</th>`;
    
    const rows = transactions.map(t => {
        const amountExclVat = t.amountExclVat ?? (t.type === 'income' ? t.amount : (t.amount / (1 + (t.vatRate || 0) / 100)));
        const vatAmount = t.vatAmount ?? (t.amount - amountExclVat);
        const totalAmount = t.amount;
        const transactionType = t.type || (t.vatRate !== undefined ? 'expense' : 'income');

        return `
            <tr class="transaction-row ${transactionType} ${t.isCorrection ? 'corrected' : ''}">
                <td>${t.date}</td>
                <td>${t.description}</td>
                <td>${getCategoryName(t.categoryId)}</td>
                <td class="text-right">${Number(amountExclVat).toFixed(2)} kr</td>
                <td class="text-right">${Number(vatAmount).toFixed(2)} kr</td>
                <td class="text-right ${transactionType === 'income' ? 'green' : 'red'}"><strong>${Number(totalAmount).toFixed(2)} kr</strong></td>
                ${t.isCorrection ? '<td>Rättad</td>' : `<td><button class="btn-correction" data-id="${t.id}" data-type="${transactionType}">Korrigera</button></td>`}
            </tr>`;
    }).join('');

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