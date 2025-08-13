// js/ui/quotes.js
import { getState } from '../state.js';
import { renderSpinner, showConfirmationModal, showToast } from './utils.js';
// VI TAR BORT DEN CIRKULÄRA IMPORTEN HÄRIFRÅN
import { deleteDocument, fetchAllCompanyData } from '../services/firestore.js';

export function renderQuotesPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <div id="quote-list-container">
                ${renderSpinner()}
            </div>
        </div>`;
    renderQuoteList();
}

function renderQuoteList() {
    const { allQuotes } = getState();
    const container = document.getElementById('quote-list-container');
    if (!container) return;

    const rows = allQuotes.sort((a, b) => b.quoteNumber - a.quoteNumber).map(quote => `
        <tr>
            <td><span class="invoice-status ${quote.status || 'Utkast'}">${quote.status || 'Utkast'}</span></td>
            <td>#${quote.quoteNumber}</td>
            <td>${quote.customerName}</td>
            <td>${quote.validUntilDate}</td>
            <td class="text-right">${(quote.grandTotal || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</td>
            <td>
                <div class="action-menu" style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-secondary" onclick="window.app.editors.renderQuoteEditor('${quote.id}')">Visa / Redigera</button>
                    <button class="btn btn-sm btn-danger" onclick="window.quoteFunctions.deleteQuote('${quote.id}')">Ta bort</button>
                </div>
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <h3 class="card-title">Offerter</h3>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Status</th>
                    <th>Offertnr.</th>
                    <th>Kund</th>
                    <th>Giltig till</th>
                    <th class="text-right">Summa</th>
                    <th>Åtgärder</th>
                </tr>
            </thead>
            <tbody>
                ${allQuotes.length > 0 ? rows : '<tr><td colspan="6" class="text-center">Du har inga offerter än.</td></tr>'}
            </tbody>
        </table>`;
}

async function deleteQuote(quoteId) {
    showConfirmationModal(async () => {
        try {
            await deleteDocument('quotes', quoteId);
            await fetchAllCompanyData();
            showToast('Offerten har tagits bort!', 'success');
            renderQuoteList();
        } catch (error) {
            console.error("Kunde inte ta bort offert:", error);
            showToast("Kunde inte ta bort offerten.", "error");
        }
    }, "Ta bort offert", "Är du säker på att du vill ta bort denna offert permanent?");
}

// Exponera funktioner globalt
window.quoteFunctions = {
    deleteQuote: deleteQuote,
};
