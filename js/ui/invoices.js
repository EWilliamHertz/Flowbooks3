// js/ui/invoices.js
import { getState } from '../state.js';
import { fetchAllCompanyData, saveDocument } from '../services/firestore.js';
import { showToast, renderSpinner, showConfirmationModal, closeModal } from './utils.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';

const { jsPDF } = window.jspdf;
let invoiceItems = [];

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

function renderInvoiceList() {
    const { allInvoices } = getState();
    const container = document.getElementById('invoice-list-container');

    const rows = allInvoices.sort((a, b) => b.invoiceNumber - a.invoiceNumber).map(invoice => `
        <tr>
            <td><span class="invoice-status ${invoice.status || 'Utkast'}">${invoice.status || 'Utkast'}</span></td>
            <td>#${invoice.invoiceNumber}</td>
            <td>${invoice.customerName}</td>
            <td>${invoice.dueDate}</td>
            <td class="text-right">${(invoice.grandTotal || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</td>
            <td>
                <div class="action-menu" style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-secondary" onclick="window.app.editors.renderInvoiceEditor('${invoice.id}')">Visa / Redigera</button>
                    <button class="btn btn-sm btn-secondary" onclick="window.invoiceFunctions.generatePDF('${invoice.id}')">PDF</button>
                    ${invoice.status === 'Skickad' ? `<button class="btn btn-sm btn-success" onclick="window.invoiceFunctions.markAsPaid('${invoice.id}')">Markera Betald</button>` : ''}
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

function renderInvoiceEditor(invoiceId = null, dataFromQuote = null) {
    const { allInvoices, currentCompany } = getState();
    const invoice = invoiceId ? allInvoices.find(inv => inv.id === invoiceId) : null;
    
    if (dataFromQuote) {
        invoiceItems = dataFromQuote.items || [];
    } else {
        invoiceItems = invoice ? JSON.parse(JSON.stringify(invoice.items)) : [];
    }
    
    const isLocked = invoice && invoice.status !== 'Utkast';

    const mainView = document.getElementById('main-view');
    const today = new Date().toISOString().slice(0, 10);
    
    let customerName = '';
    if (dataFromQuote) customerName = dataFromQuote.customerName;
    else if (invoice) customerName = invoice.customerName;

    let notes = '';
    if (dataFromQuote) notes = dataFromQuote.notes;
    else if (invoice) notes = invoice.notes;
    else notes = currentCompany.defaultInvoiceText || '';


    mainView.innerHTML = `
        <div class="invoice-editor">
            <div class="card">
                <h3>${invoiceId ? `Faktura #${invoice.invoiceNumber}` : 'Skapa Ny Faktura'}</h3>
                ${invoice ? `<p><strong>Status:</strong> <span class="invoice-status ${invoice.status}">${invoice.status}</span></p>` : ''}
                <div class="input-group">
                    <label>Kundnamn</label>
                    <input id="customerName" class="form-input" value="${customerName}" ${isLocked ? 'disabled' : ''}>
                </div>
                <div class="invoice-form-grid" style="margin-top: 1rem;">
                    <div class="input-group"><label>Fakturadatum</label><input id="invoiceDate" type="date" class="form-input" value="${invoice?.invoiceDate || today}" ${isLocked ? 'disabled' : ''}></div>
                    <div class="input-group"><label>Förfallodatum</label><input id="dueDate" type="date" class="form-input" value="${invoice?.dueDate || today}" ${isLocked ? 'disabled' : ''}></div>
                </div>
            </div>

            <div class="card">
                <h3 class="card-title">Fakturarader</h3>
                <div id="invoice-items-container"></div>
                ${!isLocked ? `
                    <button id="add-item-btn" class="btn btn-secondary" style="margin-top: 1rem;">+ Lägg till Egen Rad</button>
                    <button id="add-product-btn" class="btn btn-primary" style="margin-top: 1rem; margin-left: 1rem;">+ Lägg till Produkt</button>
                ` : '<p>Fakturan är låst och kan inte redigeras.</p>'}
            </div>
            
            <div class="card">
                <h3 class="card-title">Villkor och Kommentarer</h3>
                <textarea id="invoice-notes" class="form-input" rows="4" placeholder="T.ex. information om betalningsvillkor..." ${isLocked ? 'disabled' : ''}>${notes}</textarea>
            </div>
            
            <div class="invoice-actions-footer">
                ${!isLocked ? `
                    <button id="save-draft-btn" class="btn btn-secondary">Spara som Utkast</button>
                    <button id="save-send-btn" class="btn btn-primary">Bokför och Skicka</button>
                ` : `
                    <button id="back-btn" class="btn btn-secondary">Tillbaka till översikt</button>
                    <button onclick="window.invoiceFunctions.generatePDF('${invoiceId}')" class="btn btn-secondary">Ladda ned PDF</button>
                    <button onclick="window.invoiceFunctions.sendByEmail('${invoiceId}')" class="btn btn-primary">Skicka via E-post</button>
                `}
            </div>
        </div>`;

    renderInvoiceItems(isLocked);
    
    if(!isLocked) {
        document.getElementById('add-item-btn').addEventListener('click', () => {
            invoiceItems.push({ productId: null, description: '', quantity: 1, price: 0, vatRate: 25, priceSelection: 'custom' });
            renderInvoiceItems(false);
        });
        document.getElementById('add-product-btn').addEventListener('click', showProductSelector);
        document.getElementById('save-draft-btn').addEventListener('click', (e) => saveInvoice(e.target, invoiceId, 'Utkast'));
        document.getElementById('save-send-btn').addEventListener('click', (e) => saveInvoice(e.target, invoiceId, 'Skickad'));
    } else {
        document.getElementById('back-btn').addEventListener('click', () => window.navigateTo('Fakturor'));
    }
}

function renderInvoiceItems(isLocked = false) {
    const { allProducts } = getState();
    const container = document.getElementById('invoice-items-container');
    
    const tableRows = invoiceItems.map((item, index) => {
        let descriptionFieldHtml, priceFieldHtml, quantityFieldHtml, vatFieldHtml, deleteButtonHtml;

        deleteButtonHtml = isLocked ? '' : `<button class="btn btn-sm btn-danger" data-index="${index}">X</button>`;

        if (item.productId) {
            const product = allProducts.find(p => p.id === item.productId);
            descriptionFieldHtml = `<a href="#" class="link-to-product" data-product-id="${item.productId}">${item.description}</a>`;
            if (isLocked) {
                priceFieldHtml = `${item.price.toFixed(2)}`;
            } else if (product) {
                priceFieldHtml = `
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <select class="form-input item-price-select" data-index="${index}">
                            <option value="business" ${item.priceSelection === 'business' ? 'selected' : ''}>Företag (${product.sellingPriceBusiness.toFixed(2)} kr)</option>
                            <option value="private" ${item.priceSelection === 'private' ? 'selected' : ''}>Privat (${product.sellingPricePrivate.toFixed(2)} kr)</option>
                            <option value="custom" ${item.priceSelection === 'custom' ? 'selected' : ''}>Valfri summa</option>
                        </select>
                        <input type="number" step="0.01" class="form-input item-price" data-index="${index}" value="${item.price}" ${item.priceSelection !== 'custom' ? 'readonly' : ''}>
                    </div>`;
            } else {
                priceFieldHtml = `<input type="number" step="0.01" class="form-input item-price" data-index="${index}" value="${item.price}" placeholder="0.00">`;
            }
        } else {
            descriptionFieldHtml = isLocked ? item.description : `<input class="form-input item-description" data-index="${index}" value="${item.description}" placeholder="Beskrivning">`;
            priceFieldHtml = isLocked ? item.price.toFixed(2) : `<input type="number" step="0.01" class="form-input item-price" data-index="${index}" value="${item.price}" placeholder="0.00">`;
        }
        
        quantityFieldHtml = isLocked ? item.quantity : `<input type="number" class="form-input item-quantity" data-index="${index}" value="${item.quantity}" style="width: 80px;">`;
        vatFieldHtml = isLocked ? `${item.vatRate}%` : `<select class="form-input item-vatRate" data-index="${index}" style="width: 90px;"><option value="25" ${item.vatRate == 25 ? 'selected' : ''}>25%</option><option value="12" ${item.vatRate == 12 ? 'selected' : ''}>12%</option><option value="6" ${item.vatRate == 6 ? 'selected' : ''}>6%</option><option value="0" ${item.vatRate == 0 ? 'selected' : ''}>0%</option></select>`;

        return `
        <tr>
            <td>${descriptionFieldHtml}</td>
            <td>${quantityFieldHtml}</td>
            <td style="min-width: ${isLocked ? 'auto' : '320px'};">${priceFieldHtml}</td>
            <td>${vatFieldHtml}</td>
            <td class="text-right">${(item.quantity * item.price).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</td>
            <td>${deleteButtonHtml}</td>
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
                <tr><td colspan="5" class="text-right"><strong>Summa (exkl. moms):</strong></td><td class="text-right"><strong>${subtotal.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</strong></td></tr>
                <tr><td colspan="5" class="text-right"><strong>Moms:</strong></td><td class="text-right"><strong>${totalVat.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</strong></td></tr>
                <tr><td colspan="5" class="text-right" style="font-size: 1.2em;"><strong>Totalsumma:</strong></td><td class="text-right" style="font-size: 1.2em;"><strong>${grandTotal.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</strong></td></tr>
            </tfoot>
        </table>`;
    
    if(!isLocked) {
        container.querySelectorAll('input, select').forEach(input => input.addEventListener('change', updateInvoiceItem));
        container.querySelectorAll('.btn-danger').forEach(btn => btn.addEventListener('click', removeInvoiceItem));
        container.querySelectorAll('.link-to-product').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                window.app.editors.renderProductForm(e.target.dataset.productId);
            });
        });
    }
}

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
                    price: product.sellingPriceBusiness || 0,
                    vatRate: 25,
                    priceSelection: 'business',
                    imageUrl: product.imageUrl || null
                });
                renderInvoiceItems(false);
            }
            closeModal();
        });
    });
}

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
            if (selection === 'business') item.price = product.sellingPriceBusiness;
            else if (selection === 'private') item.price = product.sellingPricePrivate;
        }
    } else {
        const property = propertyClass.replace('item-', '');
        let value = event.target.value;
        if (event.target.type === 'number' || property === 'vatRate') {
            value = parseFloat(value) || 0;
        }
        item[property] = value;
        if (property === 'price' && item.productId) {
            item.priceSelection = 'custom';
        }
    }
    renderInvoiceItems(false);
}

function removeInvoiceItem(event) {
    const index = parseInt(event.target.dataset.index);
    invoiceItems.splice(index, 1);
    renderInvoiceItems(false);
}

async function saveInvoice(btn, invoiceId, status) {
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
        notes: document.getElementById('invoice-notes').value,
        status: status,
        invoiceNumber: invoiceId ? getState().allInvoices.find(i => i.id === invoiceId).invoiceNumber : Date.now()
    };

    if (!invoiceData.customerName || invoiceItems.length === 0) {
        showToast("Kundnamn och minst en fakturarad är obligatoriskt.", "warning");
        return;
    }

    const confirmTitle = status === 'Skickad' ? "Bokför och Skicka Faktura" : "Spara Utkast";
    const confirmMessage = status === 'Skickad' ? "Fakturan kommer att låsas för redigering och markeras som skickad. Detta är en bokföringshändelse som inte kan ångras." : "Är du säker på att du vill spara detta utkast?";

    showConfirmationModal(async () => {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Sparar...";
        try {
            await saveDocument('invoices', invoiceData, invoiceId);
            await fetchAllCompanyData();
            showToast(status === 'Skickad' ? 'Fakturan har bokförts och låsts!' : 'Utkast sparat!', 'success');
            window.navigateTo('Fakturor');
        } catch (error) {
            console.error("Kunde inte spara faktura:", error);
            showToast('Kunde inte spara fakturan.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }, confirmTitle, confirmMessage);
}

async function markAsPaid(invoiceId) {
    showConfirmationModal(async () => {
        try {
            const invoiceRef = doc(db, 'invoices', invoiceId);
            await updateDoc(invoiceRef, { status: 'Betald' });
            
            const { allInvoices } = getState();
            const invoice = allInvoices.find(inv => inv.id === invoiceId);
            
            const incomeData = {
                date: new Date().toISOString().slice(0, 10),
                description: `Betalning för faktura #${invoice.invoiceNumber}`,
                party: invoice.customerName,
                amount: invoice.grandTotal,
                amountExclVat: invoice.subtotal,
                vatAmount: invoice.totalVat,
                categoryId: null,
                isCorrection: false,
                generatedFromInvoiceId: invoiceId
            };
            await saveDocument('incomes', incomeData);

            await fetchAllCompanyData();
            showToast('Fakturan har markerats som betald och en intäkt har registrerats!', 'success');
            renderInvoiceList();
        } catch (error) {
            console.error("Fel vid markering som betald:", error);
            showToast("Kunde inte uppdatera fakturastatus.", "error");
        }
    }, "Markera som Betald", "Detta kommer att skapa en motsvarande intäktspost i din bokföring. Är du säker?");
}

async function generateInvoicePDF(invoiceId) {
    const { allInvoices, currentCompany } = getState();
    const invoice = allInvoices.find(inv => inv.id === invoiceId);
    if (!invoice) {
        showToast("Kunde inte hitta fakturadata.", "error");
        return;
    }

    const doc = new jsPDF();
    await createPdfContent(doc, invoice, currentCompany);
    doc.save(`Faktura-${invoice.invoiceNumber}.pdf`);
}

function sendByEmail(invoiceId) {
    const { allInvoices, currentCompany } = getState();
    const invoice = allInvoices.find(inv => inv.id === invoiceId);
    if (!invoice) {
        showToast("Kunde inte hitta fakturadata.", "error");
        return;
    }

    showConfirmationModal(() => {
        generateInvoicePDF(invoiceId);

        const subject = `Faktura #${invoice.invoiceNumber} från ${currentCompany.name}`;
        const body = `
Hej,

Här kommer faktura #${invoice.invoiceNumber}.
Den finns bifogad i detta mail.

Med vänliga hälsningar,
${currentCompany.name}
        `;
        
        const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        
        window.location.href = mailtoLink;

    }, "Förbered E-post", "Först, ladda ner PDF-fakturan för att kunna bifoga den. Klicka på 'Bekräfta' för att starta nedladdningen.");
}

async function createPdfContent(doc, invoice, company) {
    if (company.logoUrl) {
        try {
            const response = await fetch(company.logoUrl);
            const blob = await response.blob();
            const logoBase64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const imgProps = doc.getImageProperties(logoBase64);
            const aspectRatio = imgProps.height / imgProps.width;
            const logoWidth = 40;
            const logoHeight = logoWidth * aspectRatio;
            doc.addImage(logoBase64, 'PNG', 15, 12, logoWidth, logoHeight);
        } catch (e) {
            console.error("Kunde inte ladda logotyp:", e);
            doc.setFontSize(18);
            doc.text(company.name || 'FlowBooks', 15, 20);
        }
    } else {
        doc.setFontSize(18);
        doc.text(company.name || 'FlowBooks', 15, 20);
    }
    
    doc.setFontSize(22);
    doc.text('Faktura', 200, 20, { align: 'right' });

    doc.setFontSize(10);
    let startY = 50;
    doc.text(`Från:`, 15, startY);
    doc.setFont(undefined, 'bold');
    doc.text(company.name || '', 15, startY += 5);
    doc.setFont(undefined, 'normal');
    doc.text(`Org.nr: ${company.orgNumber || ''}`, 15, startY += 5);

    startY = 50;
    doc.text('Faktura till:', 130, startY);
    doc.setFont(undefined, 'bold');
    doc.text(invoice.customerName, 130, startY += 5);
    doc.setFont(undefined, 'normal');
    
    startY += 10;
    doc.text(`Fakturanummer:`, 130, startY);
    doc.text(`${invoice.invoiceNumber}`, 200, startY, { align: 'right' });
    doc.text(`Fakturadatum:`, 130, startY += 5);
    doc.text(invoice.invoiceDate, 200, startY, { align: 'right' });
    doc.setFont(undefined, 'bold');
    doc.text(`Förfallodatum:`, 130, startY += 5);
    doc.text(invoice.dueDate, 200, startY, { align: 'right' });
    doc.setFont(undefined, 'normal');

    const tableBody = invoice.items.map(item => [
        item.description,
        item.quantity,
        item.price.toFixed(2),
        `${item.vatRate}%`,
        (item.quantity * item.price * (1 + item.vatRate/100)).toFixed(2)
    ]);

    doc.autoTable({
        startY: startY + 15,
        head: [['Beskrivning', 'Antal', 'À-pris (exkl. moms)', 'Moms', 'Summa (inkl. moms)']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [44, 62, 80] },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 20, halign: 'right' },
            2: { cellWidth: 30, halign: 'right' },
            3: { cellWidth: 20, halign: 'right' },
            4: { cellWidth: 30, halign: 'right' },
        },
    });

    const finalY = doc.autoTable.previous.finalY;
    
    const summaryX = 130;
    let summaryY = finalY + 10;
    doc.setFontSize(10);
    doc.text(`Summa (exkl. moms):`, summaryX, summaryY);
    doc.text(`${(invoice.subtotal || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}`, 200, summaryY, { align: 'right' });
    doc.text(`Moms:`, summaryX, summaryY += 6); 
    doc.text(`${(invoice.totalVat || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}`, 200, summaryY, { align: 'right' });
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Att betala:`, summaryX, summaryY += 7);
    doc.text(`${(invoice.grandTotal || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}`, 200, summaryY, { align: 'right' });
    
    let finalYWithTotals = summaryY + 15;
    if (invoice.notes) {
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text("Kommentarer & Villkor:", 15, finalYWithTotals);
        const splitNotes = doc.splitTextToSize(invoice.notes, 185);
        doc.text(splitNotes, 15, finalYWithTotals + 5);
    }
}

window.invoiceFunctions = {
    generatePDF: generateInvoicePDF,
    markAsPaid: markAsPaid,
    sendByEmail: sendByEmail,
};
window.app.editors.renderInvoiceEditor = renderInvoiceEditor;