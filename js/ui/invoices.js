// js/ui/invoices.js
// KOMPLETT VERSION: Innehåller all befintlig funktionalitet PLUS den nya prisväljaren för produkter.
import { getState, setState } from '../state.js';
import { fetchAllCompanyData, saveDocument, deleteDocument } from '../services/firestore.js';
import { showToast, renderSpinner, showConfirmationModal, closeModal } from './utils.js';
import { navigateTo } from './navigation.js';

// Importera jsPDF och se till att autoTable-pluginet kan hitta det.
const { jsPDF } = window.jspdf;

// Håller reda på raderna i faktura-redigeraren
let invoiceItems = [];

/**
 * Huvudfunktion för att rendera fakturasidan.
 */
export function renderInvoicesPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <div id="invoice-list-container">
                ${renderSpinner()}
            </div>
        </div>`;
    renderInvoiceList();
}

/**
 * Renderar listan med alla fakturor.
 */
function renderInvoiceList() {
    const { allInvoices } = getState();
    const container = document.getElementById('invoice-list-container');

    const rows = allInvoices.map(invoice => `
        <tr>
            <td><span class="invoice-status ${invoice.status || 'Utkast'}">${invoice.status || 'Utkast'}</span></td>
            <td>#${invoice.invoiceNumber}</td>
            <td>${invoice.customerName}</td>
            <td>${invoice.dueDate}</td>
            <td class="text-right">${(invoice.grandTotal || invoice.total || 0).toLocaleString('sv-SE')} kr</td>
            <td>
                <div class="action-menu">
                    <button class="btn btn-sm btn-secondary" onclick="window.invoiceFunctions.editInvoice('${invoice.id}')">Visa / Redigera</button>
                    <button class="btn btn-sm btn-secondary" onclick="window.invoiceFunctions.generatePDF('${invoice.id}')">PDF</button>
                </div>
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <h3 class="card-title">Fakturor</h3>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Status</th>
                    <th>Fakturanr.</th>
                    <th>Kund</th>
                    <th>Förfallodatum</th>
                    <th class="text-right">Summa (inkl. moms)</th>
                    <th>Åtgärder</th>
                </tr>
            </thead>
            <tbody>
                ${allInvoices.length > 0 ? rows : '<tr><td colspan="6" class="text-center">Du har inga fakturor än.</td></tr>'}
            </tbody>
        </table>`;
}

/**
 * Renderar formuläret för att skapa eller redigera en faktura.
 */
export function renderInvoiceEditor(invoiceId = null) {
    const { allInvoices } = getState();
    const invoice = invoiceId ? allInvoices.find(inv => inv.id === invoiceId) : null;
    invoiceItems = invoice ? JSON.parse(JSON.stringify(invoice.items)) : []; // Klona för att undvika state-mutation

    const mainView = document.getElementById('main-view');
    const today = new Date().toISOString().slice(0, 10);

    mainView.innerHTML = `
        <div class="invoice-editor">
            <div class="card">
                <h3>${invoiceId ? `Redigera Faktura #${invoice.invoiceNumber}` : 'Skapa Ny Faktura'}</h3>
                <div class="input-group">
                    <label>Kundnamn</label>
                    <input id="customerName" class="form-input" value="${invoice?.customerName || ''}">
                </div>
                <div class="invoice-form-grid" style="margin-top: 1rem;">
                    <div class="input-group">
                        <label>Fakturadatum</label>
                        <input id="invoiceDate" type="date" class="form-input" value="${invoice?.invoiceDate || today}">
                    </div>
                    <div class="input-group">
                        <label>Förfallodatum</label>
                        <input id="dueDate" type="date" class="form-input" value="${invoice?.dueDate || today}">
                    </div>
                </div>
            </div>

            <div class="card">
                <h3 class="card-title">Fakturarader</h3>
                <div id="invoice-items-container"></div>
                <button id="add-item-btn" class="btn btn-secondary" style="margin-top: 1rem;">+ Lägg till Egen Rad</button>
                <button id="add-product-btn" class="btn btn-primary" style="margin-top: 1rem; margin-left: 1rem;">+ Lägg till Produkt</button>
            </div>
            
            <div class="invoice-actions-footer">
                <button id="save-invoice-btn" class="btn btn-primary">Spara Faktura</button>
            </div>
        </div>`;

    renderInvoiceItems();
    document.getElementById('add-item-btn').addEventListener('click', () => {
        invoiceItems.push({ productId: null, description: '', quantity: 1, price: 0, vatRate: 25, priceSelection: 'custom' });
        renderInvoiceItems();
    });
    document.getElementById('add-product-btn').addEventListener('click', showProductSelector);
    document.getElementById('save-invoice-btn').addEventListener('click', () => saveInvoice(invoiceId));
}

/**
 * Renderar tabellen med fakturarader och momssammanställning.
 */
function renderInvoiceItems() {
    const { allProducts } = getState();
    const container = document.getElementById('invoice-items-container');
    
    const tableRows = invoiceItems.map((item, index) => {
        let priceFieldHtml;
        
        // Om raden är kopplad till en produkt, visa dropdown
        if (item.productId) {
            const product = allProducts.find(p => p.id === item.productId);
            if (product) {
                priceFieldHtml = `
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <select class="form-input item-price-select" data-index="${index}">
                            <option value="business" ${item.priceSelection === 'business' ? 'selected' : ''}>Företag (${product.sellingPriceBusiness.toFixed(2)} kr)</option>
                            <option value="private" ${item.priceSelection === 'private' ? 'selected' : ''}>Privat (${product.sellingPricePrivate.toFixed(2)} kr)</option>
                            <option value="custom" ${item.priceSelection === 'custom' ? 'selected' : ''}>Valfri summa</option>
                        </select>
                        <input type="number" step="0.01" class="form-input item-price" data-index="${index}" value="${item.price}" ${item.priceSelection !== 'custom' ? 'readonly' : ''}>
                    </div>
                `;
            } else { // Om produkten raderats, återgå till vanligt fält
                 priceFieldHtml = `<input type="number" step="0.01" class="form-input item-price" data-index="${index}" value="${item.price}" placeholder="0.00">`;
            }
        } else { // Vanlig rad utan produktkoppling
            priceFieldHtml = `<input type="number" step="0.01" class="form-input item-price" data-index="${index}" value="${item.price}" placeholder="0.00">`;
        }

        return `
        <tr>
            <td><input class="form-input item-description" data-index="${index}" value="${item.description}" placeholder="Beskrivning"></td>
            <td><input type="number" class="form-input item-quantity" data-index="${index}" value="${item.quantity}" style="width: 80px;"></td>
            <td style="min-width: 320px;">${priceFieldHtml}</td>
            <td><select class="form-input item-vatRate" data-index="${index}" style="width: 90px;"><option value="25" ${item.vatRate == 25 ? 'selected' : ''}>25%</option><option value="12" ${item.vatRate == 12 ? 'selected' : ''}>12%</option><option value="6" ${item.vatRate == 6 ? 'selected' : ''}>6%</option><option value="0" ${item.vatRate == 0 ? 'selected' : ''}>0%</option></select></td>
            <td class="text-right">${(item.quantity * item.price).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</td>
            <td><button class="btn btn-sm btn-danger" data-index="${index}">X</button></td>
        </tr>`;
    }).join('');

    const subtotal = invoiceItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const totalVat = invoiceItems.reduce((sum, item) => sum + (item.quantity * item.price * (item.vatRate / 100)), 0);
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
        
    container.querySelectorAll('input, select').forEach(input => input.addEventListener('change', updateInvoiceItem));
    container.querySelectorAll('.btn-danger').forEach(btn => btn.addEventListener('click', removeInvoiceItem));
}


/**
 * Visar en modal för att välja en produkt från lagret.
 */
function showProductSelector() {
    const { allProducts } = getState();
    const modalContainer = document.getElementById('modal-container');
    const productItems = allProducts.map(p => `
        <div class="product-selector-item" data-product-id="${p.id}">
            <img src="${p.imageUrl || 'https://via.placeholder.com/40'}" alt="${p.name}">
            <div class="product-selector-item-info">
                <strong>${p.name}</strong>
                <span>Företag: ${(p.sellingPriceBusiness || 0).toLocaleString('sv-SE')} kr | Privat: ${(p.sellingPricePrivate || 0).toLocaleString('sv-SE')} kr</span>
            </div>
        </div>`).join('');
    modalContainer.innerHTML = `
        <div class="modal-overlay" id="product-selector-overlay">
            <div class="modal-content">
                <h3>Välj en produkt</h3>
                <div class="product-selector-dropdown show">${productItems.length > 0 ? productItems : '<p style="padding: 1rem;">Inga produkter hittades.</p>'}</div>
                <div class="modal-actions">
                    <button id="modal-cancel" class="btn btn-secondary">Avbryt</button>
                </div>
            </div>
        </div>`;
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('product-selector-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'product-selector-overlay') closeModal();
    });
    modalContainer.querySelectorAll('.product-selector-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const productId = e.currentTarget.dataset.productId;
            const product = allProducts.find(p => p.id === productId);
            if (product) {
                invoiceItems.push({
                    productId: product.id,
                    description: product.name,
                    quantity: 1,
                    price: product.sellingPriceBusiness || 0, // Standard till företagspris
                    vatRate: 25,
                    priceSelection: 'business' // Sätt standardvalet
                });
                renderInvoiceItems();
            }
            closeModal();
        });
    });
}

/**
 * Uppdaterar en fakturarad när användaren ändrar ett värde.
 */
function updateInvoiceItem(event) {
    const { allProducts } = getState();
    const index = parseInt(event.target.dataset.index);
    const propertyClass = event.target.classList[1];
    const item = invoiceItems[index];

    if (propertyClass === 'item-price-select') {
        const selection = event.target.value;
        item.priceSelection = selection;
        const product = allProducts.find(p => p.id === item.productId);
        if (product) {
            if (selection === 'business') {
                item.price = product.sellingPriceBusiness;
            } else if (selection === 'private') {
                item.price = product.sellingPricePrivate;
            }
        }
    } else {
        const property = propertyClass.split('-')[1];
        let value = event.target.value;
        if (event.target.type === 'number' || property === 'vatRate') {
            value = parseFloat(value) || 0;
        }
        item[property] = value;
        // Om användaren manuellt ändrar priset, sätt valet till "Valfri summa"
        if (property === 'price' && item.productId) {
            item.priceSelection = 'custom';
        }
    }
    renderInvoiceItems();
}

/**
 * Tar bort en fakturarad.
 */
function removeInvoiceItem(event) {
    const index = parseInt(event.target.dataset.index);
    invoiceItems.splice(index, 1);
    renderInvoiceItems();
}

/**
 * Sparar fakturan till Firestore.
 */
async function saveInvoice(invoiceId = null) {
    const subtotal = invoiceItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const totalVat = invoiceItems.reduce((sum, item) => sum + (item.quantity * item.price * (item.vatRate / 100)), 0);
    
    const invoiceData = {
        customerName: document.getElementById('customerName').value,
        invoiceDate: document.getElementById('invoiceDate').value,
        dueDate: document.getElementById('dueDate').value,
        items: invoiceItems,
        subtotal: subtotal,
        totalVat: totalVat,
        grandTotal: subtotal + totalVat,
        status: 'Utkast', // Alltid sparas som utkast initialt
        invoiceNumber: invoiceId ? getState().allInvoices.find(i => i.id === invoiceId).invoiceNumber : Date.now()
    };

    if (!invoiceData.customerName || invoiceItems.length === 0) {
        showToast("Kundnamn och minst en fakturarad är obligatoriskt.", "warning");
        return;
    }

    try {
        await saveDocument('invoices', invoiceData, invoiceId);
        await fetchAllCompanyData();
        showToast('Fakturan har sparats som ett utkast!', 'success');
        navigateTo('Fakturor');
    } catch (error) {
        console.error("Kunde inte spara faktura:", error);
        showToast('Kunde inte spara fakturan.', 'error');
    }
}

/**
 * Genererar och laddar ner en PDF-version av fakturan.
 */
async function generateInvoicePDF(invoiceId) {
    const { allInvoices, currentCompany, userData } = getState();
    const invoice = allInvoices.find(inv => inv.id === invoiceId);
    if (!invoice) {
        showToast("Kunde inte hitta fakturadata.", "error");
        return;
    }

    const doc = new jsPDF();
    createPdfContent(doc, invoice, currentCompany, userData);
    doc.save(`Faktura-${invoice.invoiceNumber}.pdf`);
}

/**
 * Bygger upp innehållet i PDF-dokumentet.
 */
function createPdfContent(doc, invoice, company, user) {
    doc.setFontSize(22);
    doc.text('Faktura', 190, 20, { align: 'right' });

    doc.setFontSize(10);
    doc.text(company.name || '', 15, 40);
    doc.text(`Org.nr: ${company.orgNumber || ''}`, 15, 45);
    doc.text(`Utskriven av: ${user.firstName} ${user.lastName}`, 15, 50);

    doc.text('Faktura till:', 130, 40);
    doc.text(invoice.customerName, 130, 45);

    doc.text(`Fakturanummer:`, 130, 60);
    doc.text(`${invoice.invoiceNumber}`, 190, 60, { align: 'right' });
    doc.text(`Fakturadatum:`, 130, 65);
    doc.text(invoice.invoiceDate, 190, 65, { align: 'right' });
    doc.text(`Förfallodatum:`, 130, 70);
    doc.text(invoice.dueDate, 190, 70, { align: 'right' });

    const tableBody = invoice.items.map(item => [
        item.description,
        item.quantity,
        item.price.toFixed(2),
        `${item.vatRate}%`,
        (item.quantity * item.price).toFixed(2)
    ]);

    doc.autoTable({
        startY: 85,
        head: [['Beskrivning', 'Antal', 'À-pris (SEK)', 'Moms', 'Summa (SEK)']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [44, 62, 80] },
    });

    const finalY = doc.autoTable.previous.finalY;
    doc.setFontSize(10);
    doc.text(`Summa (exkl. moms):`, 140, finalY + 10);
    doc.text(`${(invoice.subtotal || 0).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}`, 190, finalY + 10, { align: 'right' });
    doc.text(`Moms:`, 140, finalY + 16);
    doc.text(`${(invoice.totalVat || 0).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}`, 190, finalY + 16, { align: 'right' });
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Att betala:`, 140, finalY + 22);
    doc.text(`${(invoice.grandTotal || 0).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}`, 190, finalY + 22, { align: 'right' });
}

// Gör funktioner globalt tillgängliga så de kan anropas från HTML (onclick)
window.invoiceFunctions = {
    editInvoice: renderInvoiceEditor,
    generatePDF: generateInvoicePDF,
};
