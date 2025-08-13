// js/ui/quote-editor.js
import { getState } from '../state.js';
import { fetchAllCompanyData, saveDocument } from '../services/firestore.js';
import { showToast, showConfirmationModal, closeModal } from './utils.js';

let quoteItems = [];

export function renderQuoteEditor(quoteId = null) {
    const { allQuotes, currentCompany } = getState();
    const quote = quoteId ? allQuotes.find(q => q.id === quoteId) : null;
    quoteItems = quote ? JSON.parse(JSON.stringify(quote.items)) : [];
    const isLocked = quote && quote.status !== 'Utkast';

    const mainView = document.getElementById('main-view');
    const today = new Date();
    const validUntil = new Date();
    validUntil.setDate(today.getDate() + 30);

    const todayStr = today.toISOString().slice(0, 10);
    const validUntilStr = validUntil.toISOString().slice(0, 10);
    const defaultNotes = quote ? (quote.notes || '') : (currentCompany.defaultQuoteText || 'Offerten är giltig i 30 dagar om inget annat anges.');

    mainView.innerHTML = `
        <div class="invoice-editor">
            <div class="card">
                <h3>${quoteId ? `Offert #${quote.quoteNumber}` : 'Skapa Ny Offert'}</h3>
                ${quote ? `<p><strong>Status:</strong> <span class="invoice-status ${quote.status}">${quote.status}</span></p>` : ''}
                <div class="input-group">
                    <label>Kundnamn</label>
                    <input id="customerName" class="form-input" value="${quote?.customerName || ''}" ${isLocked ? 'disabled' : ''}>
                </div>
                <div class="invoice-form-grid" style="margin-top: 1rem;">
                    <div class="input-group"><label>Offertdatum</label><input id="quoteDate" type="date" class="form-input" value="${quote?.quoteDate || todayStr}" ${isLocked ? 'disabled' : ''}></div>
                    <div class="input-group"><label>Giltig till</label><input id="validUntilDate" type="date" class="form-input" value="${quote?.validUntilDate || validUntilStr}" ${isLocked ? 'disabled' : ''}></div>
                </div>
            </div>

            <div class="card">
                <h3 class="card-title">Offertrader</h3>
                <div id="quote-items-container"></div>
                ${!isLocked ? `
                    <button id="add-item-btn" class="btn btn-secondary" style="margin-top: 1rem;">+ Lägg till Egen Rad</button>
                    <button id="add-product-btn" class="btn btn-primary" style="margin-top: 1rem; margin-left: 1rem;">+ Lägg till Produkt</button>
                ` : '<p>Offerten är låst och kan inte redigeras.</p>'}
            </div>
            
            <div class="card">
                <h3 class="card-title">Villkor och Kommentarer</h3>
                <textarea id="quote-notes" class="form-input" rows="4" placeholder="T.ex. information om leveransvillkor..." ${isLocked ? 'disabled' : ''}>${defaultNotes}</textarea>
            </div>
            
            <div class="invoice-actions-footer">
                ${!isLocked ? `
                    <button id="save-draft-btn" class="btn btn-secondary">Spara som Utkast</button>
                    <button id="save-send-btn" class="btn btn-primary">Spara och Markera som Skickad</button>
                ` : `
                    <button id="back-btn" class="btn btn-secondary">Tillbaka till översikt</button>
                    <button id="convert-to-invoice-btn" class="btn btn-success">Omvandla till Faktura</button>
                `}
            </div>
        </div>`;

    renderQuoteItems(isLocked);
    
    if(!isLocked) {
        document.getElementById('add-item-btn').addEventListener('click', () => {
            quoteItems.push({ productId: null, description: '', quantity: 1, price: 0, vatRate: 25 });
            renderQuoteItems(false);
        });
        document.getElementById('save-draft-btn').addEventListener('click', (e) => saveQuote(e.target, quoteId, 'Utkast'));
        document.getElementById('save-send-btn').addEventListener('click', (e) => saveQuote(e.target, quoteId, 'Skickad'));
    } else {
        document.getElementById('back-btn').addEventListener('click', () => window.navigateTo('Offerter'));
        document.getElementById('convert-to-invoice-btn').addEventListener('click', () => convertToInvoice(quote));
    }
}

function renderQuoteItems(isLocked = false) {
    const container = document.getElementById('quote-items-container');
    
    const tableRows = quoteItems.map((item, index) => `
        <tr>
            <td>${isLocked ? item.description : `<input class="form-input item-description" data-index="${index}" value="${item.description}" placeholder="Beskrivning">`}</td>
            <td>${isLocked ? item.quantity : `<input type="number" class="form-input item-quantity" data-index="${index}" value="${item.quantity}" style="width: 80px;">`}</td>
            <td>${isLocked ? item.price.toFixed(2) : `<input type="number" step="0.01" class="form-input item-price" data-index="${index}" value="${item.price}" placeholder="0.00">`}</td>
            <td>${isLocked ? `${item.vatRate}%` : `<select class="form-input item-vatRate" data-index="${index}" style="width: 90px;"><option value="25" ${item.vatRate == 25 ? 'selected' : ''}>25%</option><option value="12" ${item.vatRate == 12 ? 'selected' : ''}>12%</option><option value="6" ${item.vatRate == 6 ? 'selected' : ''}>6%</option><option value="0" ${item.vatRate == 0 ? 'selected' : ''}>0%</option></select>`}</td>
            <td class="text-right">${(item.quantity * item.price).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</td>
            <td>${isLocked ? '' : `<button class="btn btn-sm btn-danger" data-index="${index}">X</button>`}</td>
        </tr>`).join('');

    const subtotal = quoteItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const totalVat = quoteItems.reduce((sum, item) => sum + (item.quantity * item.price * (item.vatRate / 100)), 0);
    const grandTotal = subtotal + totalVat;
    
    container.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Beskrivning</th><th>Antal</th><th>Pris (exkl. moms)</th><th>Moms</th><th class="text-right">Summa</th><th></th></tr></thead>
            <tbody>${tableRows}</tbody>
            <tfoot>
                <tr><td colspan="4" class="text-right"><strong>Summa (exkl. moms):</strong></td><td class="text-right"><strong>${subtotal.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</strong></td><td></td></tr>
                <tr><td colspan="4" class="text-right"><strong>Moms:</strong></td><td class="text-right"><strong>${totalVat.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</strong></td><td></td></tr>
                <tr><td colspan="4" class="text-right" style="font-size: 1.2em;"><strong>Totalsumma:</strong></td><td class="text-right" style="font-size: 1.2em;"><strong>${grandTotal.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</strong></td><td></td></tr>
            </tfoot>
        </table>`;
    
    if(!isLocked) {
        container.querySelectorAll('input, select').forEach(input => input.addEventListener('change', updateQuoteItem));
        container.querySelectorAll('.btn-danger').forEach(btn => btn.addEventListener('click', removeQuoteItem));
    }
}

function updateQuoteItem(event) {
    const index = parseInt(event.target.dataset.index);
    const property = event.target.classList[1].replace('item-', '');
    let value = event.target.value;
    if (event.target.type === 'number' || property === 'vatRate') {
        value = parseFloat(value) || 0;
    }
    quoteItems[index][property] = value;
    renderQuoteItems(false);
}

function removeQuoteItem(event) {
    const index = parseInt(event.target.dataset.index);
    quoteItems.splice(index, 1);
    renderQuoteItems(false);
}

async function saveQuote(btn, quoteId, status) {
    const subtotal = quoteItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const totalVat = quoteItems.reduce((sum, item) => sum + (item.quantity * item.price * (item.vatRate / 100)), 0);
    
    const quoteData = {
        customerName: document.getElementById('customerName').value,
        quoteDate: document.getElementById('quoteDate').value,
        validUntilDate: document.getElementById('validUntilDate').value,
        items: quoteItems,
        subtotal: subtotal,
        totalVat: totalVat,
        grandTotal: subtotal + totalVat,
        notes: document.getElementById('quote-notes').value,
        status: status,
        quoteNumber: quoteId ? getState().allQuotes.find(q => q.id === quoteId).quoteNumber : Date.now()
    };

    if (!quoteData.customerName || quoteItems.length === 0) {
        showToast("Kundnamn och minst en offertrad är obligatoriskt.", "warning");
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Sparar...";
    try {
        await saveDocument('quotes', quoteData, quoteId);
        await fetchAllCompanyData();
        showToast(status === 'Skickad' ? 'Offerten har sparats och låsts!' : 'Utkast sparat!', 'success');
        window.navigateTo('Offerter');
    } catch (error) {
        console.error("Kunde inte spara offert:", error);
        showToast('Kunde inte spara offerten.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function convertToInvoice(quote) {
    showConfirmationModal(async () => {
        const invoiceDataFromQuote = {
            customerName: quote.customerName,
            items: quote.items,
            notes: quote.notes,
        };
        await saveDocument('quotes', { status: 'Accepterad' }, quote.id);
        await fetchAllCompanyData();
        window.app.editors.renderInvoiceEditor(null, invoiceDataFromQuote);
        showToast("Offerten har accepterats. Fyll i fakturadetaljer.", "success");
    }, "Omvandla till Faktura", "En ny faktura kommer att skapas baserat på denna offert. Offerten kommer att markeras som 'Accepterad'. Är du säker?");
}
