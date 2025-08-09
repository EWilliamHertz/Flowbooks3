// js/ui/receipts.js
import { getAIReceiptDetails } from '../services/ai.js';
import { saveDocument, fetchAllCompanyData } from '../services/firestore.js';
import { renderSpinner, showToast, closeModal } from './utils.js';
import { getState } from '../state.js';
import { navigateTo } from './navigation.js';

export function renderReceiptsPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card" style="max-width: 700px; margin: auto;">
            <h3>Skanna Kvitto med AI</h3>
            <p>Ladda upp en bild av ditt kvitto. Vår AI kommer att försöka tolka innehållet automatiskt. Vi rekommenderar bilder i formaten JPG, PNG eller WEBP.</p>
            <hr style="margin: 1rem 0;">
            <h4>Ladda upp kvitto</h4>
            <input type="file" id="receipt-file-input" accept="image/*" style="display: block; margin-top: 1rem;">
        </div>
    `;
    document.getElementById('receipt-file-input').addEventListener('change', handleReceiptFileSelect, false);
}

function handleReceiptFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Visa en laddningsmodal medan AI:n arbetar
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `<div class="modal-overlay"><div class="modal-content"><h3>Analyserar kvitto med AI...</h3><p>Detta kan ta en liten stund.</p>${renderSpinner()}</div></div>`;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const imageDataBase64 = e.target.result.split(',')[1];
        try {
            const receiptSuggestion = await getAIReceiptDetails(imageDataBase64, file.type);
            showReceiptConfirmationModal(receiptSuggestion);
        } catch (error) {
            closeModal();
            showToast(`Fel vid analys av kvitto: ${error.message}`, "error");
        }
    };
    reader.readAsDataURL(file);
}

function showReceiptConfirmationModal(suggestion) {
    const { categories } = getState();
    const categoryOptions = categories.map(cat => `<option value="${cat.id}" ${suggestion.categoryId === cat.id ? 'selected' : ''}>${cat.name}</option>`).join('');
    const today = new Date().toISOString().slice(0, 10);

    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content" style="max-width: 600px;">
                <h3>Granska AI-förslag för Kvitto</h3>
                <p>AI:n har tolkat kvittot. Vänligen verifiera och justera informationen nedan innan du sparar.</p>
                <form id="receipt-form">
                    <div class="input-group"><label>Datum</label><input class="form-input" id="receipt-date" type="date" value="${suggestion.date || today}"></div>
                    <div class="input-group"><label>Motpart</label><input class="form-input" id="receipt-party" value="${suggestion.party || ''}"></div>
                    <div class="input-group"><label>Beskrivning</label><input class="form-input" id="receipt-description" value="${suggestion.description || 'Inköp enligt kvitto'}"></div>
                    <div class="input-group"><label>Summa (inkl. moms)</label><input class="form-input" id="receipt-amount" type="number" step="0.01" value="${suggestion.amount || 0}"></div>
                    <div class="input-group"><label>Kategori</label><select id="receipt-category" class="form-input"><option value="">Välj...</option>${categoryOptions}</select></div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" id="modal-cancel">Avbryt</button>
                        <button type="submit" class="btn btn-primary">Spara som Utgift</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.getElementById('modal-container').innerHTML = modalHtml;
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('receipt-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        await saveReceiptHandler(btn);
    });
}

async function saveReceiptHandler(btn) {
    const amount = parseFloat(document.getElementById('receipt-amount').value) || 0;
    // Förutsätter 25% moms som standard om AI:n inte kan tolka den
    const vatRate = 25; 
    const vatAmount = amount - (amount / (1 + vatRate / 100));

    const expenseData = {
        date: document.getElementById('receipt-date').value,
        party: document.getElementById('receipt-party').value,
        description: document.getElementById('receipt-description').value,
        amount: amount,
        amountExclVat: amount - vatAmount,
        vatRate: vatRate,
        vatAmount: vatAmount,
        categoryId: document.getElementById('receipt-category').value || null,
        isCorrection: false
    };

    if (!expenseData.date || !expenseData.party || expenseData.amount <= 0) {
        showToast("Fyll i datum, motpart och en giltig summa.", "warning");
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sparar...';

    try {
        await saveDocument('expenses', expenseData);
        showToast('Kvittot har sparats som en utgift!', 'success');
        closeModal();
        await fetchAllCompanyData();
        navigateTo('Utgifter');
    } catch (error) {
        console.error("Kunde inte spara utgift från kvitto:", error);
        showToast('Kunde inte spara utgiften.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}
