// js/ui/bill-processor.js
import { getState } from '../state.js';
import { saveDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal } from './utils.js';
import { db } from '../../firebase-config.js';
import { writeBatch, doc, collection } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

let billData = {};

export function renderBillProcessor(aiData) {
    const { allContacts, allProducts } = getState();
    billData = { ...aiData, lineItems: aiData.lineItems || [] };

    // Försök att matcha leverantör
    const supplierMatch = allContacts.find(c => c.type === 'supplier' && c.name.toLowerCase() === billData.supplierName?.toLowerCase());
    billData.supplierId = supplierMatch ? supplierMatch.id : null;

    const modalContainer = document.getElementById('modal-container');
    const supplierOptions = allContacts
        .filter(c => c.type === 'supplier')
        .map(s => `<option value="${s.id}" ${s.id === billData.supplierId ? 'selected' : ''}>${s.name}</option>`)
        .join('');

    modalContainer.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content" style="max-width: 1000px; width: 95%;">
                <h3>Granska och Bekräfta Leverantörsfaktura</h3>
                <p>AI:n har tolkat din PDF. Vänligen verifiera informationen nedan och koppla produkter innan du bokför.</p>
                <div class="form-grid" style="margin-top: 1.5rem;">
                    <div class="input-group">
                        <label>Leverantör</label>
                        <select id="bill-supplier" class="form-input">${supplierOptions}</select>
                        ${!billData.supplierId ? `<button id="create-supplier-btn" class="btn btn-sm btn-secondary" style="margin-top: 5px;">Skapa "${billData.supplierName}" som ny leverantör</button>` : ''}
                    </div>
                    <div class="input-group"><label>Fakturanummer</label><input id="bill-number" class="form-input" value="${billData.invoiceNumber || ''}"></div>
                    <div class="input-group"><label>Fakturadatum</label><input id="bill-date" type="date" class="form-input" value="${billData.invoiceDate || ''}"></div>
                    <div class="input-group"><label>Förfallodatum</label><input id="bill-due-date" type="date" class="form-input" value="${billData.dueDate || ''}"></div>
                    <div class="input-group"><label>Totalbelopp (inkl. moms)</label><input id="bill-total" type="number" step="0.01" class="form-input" value="${billData.totalAmount || 0}"></div>
                    <div class="input-group"><label>Moms</label><input id="bill-vat" type="number" step="0.01" class="form-input" value="${billData.vatAmount || 0}"></div>
                </div>
                <h4 style="margin-top: 2rem;">Fakturarader</h4>
                <div id="bill-lines-container" style="max-height: 30vh; overflow-y: auto;"></div>
                <div class="modal-actions">
                    <button id="modal-cancel" class="btn btn-secondary">Avbryt</button>
                    <button id="modal-confirm-bill" class="btn btn-primary">Bokför Faktura</button>
                </div>
            </div>
        </div>`;
    
    renderBillLines();
    attachBillProcessorEventListeners();
}

function renderBillLines() {
    const { allProducts } = getState();
    const container = document.getElementById('bill-lines-container');
    
    const rows = billData.lineItems.map((item, index) => {
        // Försök matcha produkt
        const productMatch = allProducts.find(p => p.name.toLowerCase() === item.description?.toLowerCase());
        item.productId = productMatch ? productMatch.id : null;
        
        let productCell = '';
        if (item.productId) {
            productCell = `<span><i class="fas fa-check-circle green"></i> Kopplad till: ${productMatch.name}</span>`;
        } else {
            productCell = `
                <span class="red">Okänd produkt</span>
                <button class="btn btn-sm btn-secondary btn-link-product" data-index="${index}">Koppla</button>
                <button class="btn btn-sm btn-primary btn-create-product" data-index="${index}">Skapa</button>
            `;
        }

        return `
            <tr data-index="${index}">
                <td><input type="text" class="form-input item-description" value="${item.description || ''}"></td>
                <td><input type="number" class="form-input item-quantity" value="${item.quantity || 1}" style="width: 70px;"></td>
                <td class="text-right"><input type="number" step="0.01" class="form-input item-price" value="${item.unitPrice || 0}"> kr</td>
                <td>${productCell}</td>
            </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Beskrivning</th><th>Antal</th><th class="text-right">Pris/st (exkl. moms)</th><th>Produktkoppling</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

function attachBillProcessorEventListeners() {
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-confirm-bill').addEventListener('click', handleSaveBill);

    const createSupplierBtn = document.getElementById('create-supplier-btn');
    if (createSupplierBtn) {
        createSupplierBtn.addEventListener('click', async () => {
            const newSupplier = { name: billData.supplierName, type: 'supplier' };
            const newId = await saveDocument('contacts', newSupplier);
            await fetchAllCompanyData();
            billData.supplierId = newId;
            // Uppdatera UI:t för att reflektera den nya leverantören
            const supplierSelect = document.getElementById('bill-supplier');
            const options = getState().allContacts.filter(c => c.type === 'supplier').map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            supplierSelect.innerHTML = options;
            supplierSelect.value = newId;
            createSupplierBtn.remove();
        });
    }

    document.getElementById('bill-lines-container').addEventListener('click', e => {
        const index = e.target.closest('tr')?.dataset.index;
        if (index === undefined) return;
        
        if (e.target.classList.contains('btn-link-product')) {
            // Logik för att visa en sök/välj-dialog för produkter
            showToast("Funktion för att koppla till befintlig produkt kommer snart.", "info");
        } else if (e.target.classList.contains('btn-create-product')) {
            const item = billData.lineItems[index];
            const productData = {
                name: item.description,
                purchasePrice: item.unitPrice,
                supplierId: billData.supplierId,
                supplierName: billData.supplierName
            };
            // Återanvänd produktformuläret
            editors.renderProductForm(null, productData);
        }
    });
}

async function handleSaveBill() {
    // 1. Samla in all data från formuläret
    const finalBillData = {
        supplierId: document.getElementById('bill-supplier').value,
        supplierName: document.getElementById('bill-supplier').options[document.getElementById('bill-supplier').selectedIndex].text,
        invoiceNumber: document.getElementById('bill-number').value,
        invoiceDate: document.getElementById('bill-date').value,
        dueDate: document.getElementById('bill-due-date').value,
        totalAmount: parseFloat(document.getElementById('bill-total').value) || 0,
        vatAmount: parseFloat(document.getElementById('bill-vat').value) || 0,
        status: 'Obetald',
        balance: parseFloat(document.getElementById('bill-total').value) || 0,
        items: billData.lineItems // Uppdatera med eventuella ändringar
    };

    // 2. Validering
    if (!finalBillData.supplierId || !finalBillData.invoiceNumber || finalBillData.totalAmount <= 0) {
        showToast("Leverantör, fakturanummer och totalbelopp måste fyllas i.", "warning");
        return;
    }
    
    showConfirmationModal(async () => {
        try {
            // 3. Spara som en "bill"
            const billId = await saveDocument('bills', finalBillData);

            // 4. Skapa en utgift
            const expenseData = {
                date: finalBillData.invoiceDate,
                description: `Faktura #${finalBillData.invoiceNumber} från ${finalBillData.supplierName}`,
                party: finalBillData.supplierName,
                amount: finalBillData.totalAmount,
                vatAmount: finalBillData.vatAmount,
                amountExclVat: finalBillData.totalAmount - finalBillData.vatAmount,
                vatRate: (finalBillData.vatAmount / (finalBillData.totalAmount - finalBillData.vatAmount)) * 100,
                generatedFromBillId: billId
            };
            await saveDocument('expenses', expenseData);

            await fetchAllCompanyData();
            showToast("Leverantörsfakturan har bokförts!", "success");
            closeModal();
            window.navigateTo('invoices'); // Gå tillbaka till fakturasidan

        } catch (error) {
            console.error("Kunde inte spara leverantörsfaktura:", error);
            showToast("Ett fel uppstod vid bokföringen.", "error");
        }
    }, "Bokför Leverantörsfaktura", "Detta skapar en utgift och en obetald faktura i systemet. Är du säker?");
}