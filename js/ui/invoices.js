// js/ui/invoices.js
// Hanterar all logik och rendering för faktureringssidan.
import { getState, setState } from '../state.js';
import { fetchAllCompanyData, saveDocument, deleteDocument } from '../services/firestore.js';
import { showToast, renderSpinner, showConfirmationModal, closeModal } from './utils.js';
import { navigateTo } from './navigation.js';

// Importera jsPDF-biblioteken från CDN (förutsätter att de finns i app.html)
const { jsPDF } = window.jspdf;

let invoiceItems = []; // Håller reda på raderna i faktura-redigeraren

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
    const { allInvoices } = getState(); // Antag att fakturor laddas in i state
    const container = document.getElementById('invoice-list-container');

    const rows = allInvoices.map(invoice => `
        <tr>
            <td><span class="invoice-status ${invoice.status}">${invoice.status}</span></td>
            <td>#${invoice.invoiceNumber}</td>
            <td>${invoice.customerName}</td>
            <td>${invoice.dueDate}</td>
            <td class="text-right">${invoice.total.toLocaleString('sv-SE')} kr</td>
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
                    <th class="text-right">Summa</th>
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
    const { allInvoices, allProducts } = getState();
    const invoice = invoiceId ? allInvoices.find(inv => inv.id === invoiceId) : null;
    invoiceItems = invoice ? invoice.items : [{ description: '', quantity: 1, price: 0 }];

    const mainView = document.getElementById('main-view');
    const today = new Date().toISOString().slice(0, 10);

    mainView.innerHTML = `
        <div class="invoice-editor">
            <div class="card">
                <h3>${invoiceId ? `Redigera Faktura #${invoice.invoiceNumber}` : 'Skapa Ny Faktura'}</h3>
                <div class="invoice-form-grid">
                    <div class="input-group">
                        <label>Kundnamn</label>
                        <input id="customerName" value="${invoice?.customerName || ''}">
                    </div>
                    <div class="input-group">
                        <label>Fakturadatum</label>
                        <input id="invoiceDate" type="date" value="${invoice?.invoiceDate || today}">
                    </div>
                     <div class="input-group">
                        <label>Förfallodatum</label>
                        <input id="dueDate" type="date" value="${invoice?.dueDate || today}">
                    </div>
                </div>
            </div>

            <div class="card">
                <h3 class="card-title">Fakturarader</h3>
                <div id="invoice-items-container"></div>
                <button id="add-item-btn" class="btn btn-secondary" style="margin-top: 1rem;">+ Lägg till rad</button>
            </div>
            
            <div class="invoice-actions-footer">
                <button id="save-draft-btn" class="btn btn-secondary">Spara som utkast</button>
                <button id="save-invoice-btn" class="btn btn-primary">Spara och Skicka</button>
            </div>
        </div>`;

    renderInvoiceItems();
    document.getElementById('add-item-btn').addEventListener('click', () => {
        invoiceItems.push({ description: '', quantity: 1, price: 0 });
        renderInvoiceItems();
    });
    document.getElementById('save-invoice-btn').addEventListener('click', () => saveInvoice(invoiceId));
}

/**
 * Renderar tabellen med fakturarader i redigeringsläget.
 */
function renderInvoiceItems() {
    const { allProducts } = getState();
    const container = document.getElementById('invoice-items-container');
    const productOptions = allProducts.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    const tableRows = invoiceItems.map((item, index) => `
        <tr>
            <td>
                <select class="form-input item-product" data-index="${index}">
                    <option value="">Välj produkt...</option>
                    ${productOptions}
                </select>
                <input class="form-input item-description" data-index="${index}" value="${item.description}" placeholder="Beskrivning">
            </td>
            <td><input type="number" class="form-input item-quantity" data-index="${index}" value="${item.quantity}" style="width: 80px;"></td>
            <td><input type="number" class="form-input item-price" data-index="${index}" value="${item.price}" style="width: 120px;"></td>
            <td class="text-right">${(item.quantity * item.price).toLocaleString('sv-SE')} kr</td>
            <td><button class="btn btn-sm btn-danger" data-index="${index}">X</button></td>
        </tr>
    `).join('');

    const total = invoiceItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);

    container.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Beskrivning</th><th>Antal</th><th>Pris</th><th class="text-right">Summa</th><th></th></tr></thead>
            <tbody>${tableRows}</tbody>
            <tfoot>
                <tr>
                    <td colspan="3" class="text-right"><strong>Total summa:</strong></td>
                    <td class="text-right"><strong>${total.toLocaleString('sv-SE')} kr</strong></td>
                    <td></td>
                </tr>
            </tfoot>
        </table>`;

    // Add event listeners
    container.querySelectorAll('.item-product, .item-description, .item-quantity, .item-price').forEach(input => {
        input.addEventListener('change', updateInvoiceItem);
    });
    container.querySelectorAll('.btn-danger').forEach(btn => {
        btn.addEventListener('click', removeInvoiceItem);
    });
}

/**
 * Uppdaterar en fakturarad när användaren ändrar ett värde.
 */
function updateInvoiceItem(event) {
    const { allProducts } = getState();
    const index = parseInt(event.target.dataset.index);
    const property = event.target.classList[1].split('-')[1]; // 'description', 'quantity', etc.

    if (property === 'product' && event.target.value) {
        const product = allProducts.find(p => p.id === event.target.value);
        if (product) {
            invoiceItems[index].description = product.name;
            invoiceItems[index].price = product.price || 0;
        }
    } else {
        invoiceItems[index][property] = event.target.type === 'number' ? parseFloat(event.target.value) : event.target.value;
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
    const total = invoiceItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const invoiceData = {
        customerName: document.getElementById('customerName').value,
        invoiceDate: document.getElementById('invoiceDate').value,
        dueDate: document.getElementById('dueDate').value,
        items: invoiceItems,
        total: total,
        status: 'Skickad', // Simple status for now
        invoiceNumber: invoiceId ? getState().allInvoices.find(i => i.id === invoiceId).invoiceNumber : Date.now() // Simple number
    };

    try {
        await saveDocument('invoices', invoiceData, invoiceId);
        await fetchAllCompanyData();
        showToast('Faktura sparad!', 'success');
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
    if (!invoice) return;

    const doc = new jsPDF();
    
    // Lägg till logotyp om den finns
    if (currentCompany.logoUrl) {
        try {
            // Vi måste konvertera bilden till base64 för att jsPDF ska kunna hantera den säkert
            const response = await fetch(currentCompany.logoUrl);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                const base64data = reader.result;
                doc.addImage(base64data, 'JPEG', 15, 10, 40, 0);
                createPdfContent(doc, invoice, currentCompany, userData);
                doc.save(`faktura-${invoice.invoiceNumber}.pdf`);
            };
        } catch (e) {
            console.error("Kunde inte ladda logotyp:", e);
            createPdfContent(doc, invoice, currentCompany, userData);
            doc.save(`faktura-${invoice.invoiceNumber}.pdf`);
        }
    } else {
        createPdfContent(doc, invoice, currentCompany, userData);
        doc.save(`faktura-${invoice.invoiceNumber}.pdf`);
    }
}

function createPdfContent(doc, invoice, company, user) {
    // Rubrik
    doc.setFontSize(22);
    doc.text('Faktura', 140, 20);

    // Företagsinformation (Avsändare)
    doc.setFontSize(10);
    doc.text(company.name, 15, 40);
    doc.text(`Från: ${user.firstName} ${user.lastName}`, 15, 45);

    // Kundinformation
    doc.text('Faktura till:', 140, 40);
    doc.text(invoice.customerName, 140, 45);

    // Fakturadetaljer
    doc.text(`Fakturanummer: #${invoice.invoiceNumber}`, 140, 60);
    doc.text(`Fakturadatum: ${invoice.invoiceDate}`, 140, 65);
    doc.text(`Förfallodatum: ${invoice.dueDate}`, 140, 70);

    // Tabell med fakturarader
    const tableBody = invoice.items.map(item => [item.description, item.quantity, `${item.price.toFixed(2)} kr`, `${(item.quantity * item.price).toFixed(2)} kr`]);
    tableBody.push(['', '', 'Total summa:', `${invoice.total.toFixed(2)} kr`]);

    doc.autoTable({
        startY: 80,
        head: [['Beskrivning', 'Antal', 'À-pris', 'Summa']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [52, 73, 94] },
        foot: [['', '', 'Total summa:', `${invoice.total.toFixed(2)} kr`]],
        footStyles: { fontStyle: 'bold' }
    });
}

// Gör funktioner globalt tillgängliga
window.invoiceFunctions = {
    editInvoice: renderInvoiceEditor,
    generatePDF: generateInvoicePDF,
};
