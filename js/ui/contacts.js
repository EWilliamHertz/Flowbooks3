// js/ui/contacts.js
import { getState } from '../state.js';
import { saveDocument, deleteDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal, renderSpinner } from './utils.js';
import { navigateTo } from './navigation.js';

// Renders the main contacts page (list view)
export function renderContactsPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <div class="controls-container" style="padding: 0; background: none; margin-bottom: 1.5rem;">
                 <h3 class="card-title" style="margin: 0;">Kontakter</h3>
                 <button id="email-selected-btn" class="btn btn-secondary" style="display: none;">Skicka e-post till valda</button>
            </div>
            <p>Hantera dina kunder och leverantörer. Klicka på en kontakt för att se detaljerad historik.</p>
            <div id="contacts-list-container" style="margin-top: 1.5rem;"></div>
        </div>
    `;
    renderContactsList();
}

// Renders the list of contacts
function renderContactsList() {
    const { allContacts } = getState();
    const container = document.getElementById('contacts-list-container');

    const rows = allContacts.map(contact => `
        <tr data-contact-id="${contact.id}" style="cursor: pointer;">
            <td><input type="checkbox" class="contact-select-checkbox" data-email="${contact.email || ''}" onclick="event.stopPropagation();"></td>
            <td><strong>${contact.name}</strong></td>
            <td>${contact.type === 'customer' ? 'Kund' : 'Leverantör'}</td>
            <td>${contact.orgNumber || '-'}</td>
            <td>${contact.email || '-'}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th><input type="checkbox" id="select-all-contacts"></th>
                    <th>Namn</th>
                    <th>Typ</th>
                    <th>Org.nr / Personnr.</th>
                    <th>E-post</th>
                </tr>
            </thead>
            <tbody>
                ${allContacts.length > 0 ? rows : '<tr><td colspan="5" class="text-center">Du har inte lagt till några kontakter än.</td></tr>'}
            </tbody>
        </table>
    `;
    
    // Event listener för att klicka på en rad och gå till detaljvyn
    container.querySelectorAll('tbody tr').forEach(row => {
        row.addEventListener('click', () => {
            navigateTo('Kontakter', row.dataset.contactId);
        });
    });

    // Event listeners för checkboxar (för massutskick)
    const allCheckbox = document.getElementById('select-all-contacts');
    const checkboxes = document.querySelectorAll('.contact-select-checkbox');
    const emailBtn = document.getElementById('email-selected-btn');

    const toggleEmailButton = () => {
        const selected = document.querySelectorAll('.contact-select-checkbox:checked');
        emailBtn.style.display = selected.length > 0 ? 'inline-block' : 'none';
    };

    allCheckbox.addEventListener('change', (e) => {
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        toggleEmailButton();
    });

    checkboxes.forEach(cb => cb.addEventListener('change', toggleEmailButton));

    emailBtn.addEventListener('click', () => {
        const selectedEmails = Array.from(document.querySelectorAll('.contact-select-checkbox:checked'))
            .map(cb => cb.dataset.email)
            .filter(email => email); // Filtrera bort tomma
        
        if (selectedEmails.length > 0) {
            window.location.href = `mailto:?bcc=${selectedEmails.join(',')}`;
        } else {
            showToast("Inga kontakter med e-postadresser valda.", "warning");
        }
    });
}

// NY FUNKTION: Renderar detaljvyn för en enskild kontakt
export function renderContactDetailView(contactId) {
    const { allContacts, allInvoices, allQuotes, allTransactions } = getState();
    const contact = allContacts.find(c => c.id === contactId);
    
    if (!contact) {
        navigateTo('Kontakter'); // Gå tillbaka om kontakten inte finns
        return;
    }

    const mainView = document.getElementById('main-view');
    mainView.innerHTML = renderSpinner(); // Visa spinner medan vi bygger vyn

    // Filtrera fram relevant historik
    const contactInvoices = allInvoices.filter(i => i.customerName === contact.name);
    const contactQuotes = allQuotes.filter(q => q.customerName === contact.name);
    const contactTransactions = allTransactions.filter(t => t.party === contact.name);

    const invoiceRows = contactInvoices.map(i => `<li><a href="#" onclick="window.app.editors.renderInvoiceEditor('${i.id}')">Faktura #${i.invoiceNumber}</a> - ${i.grandTotal.toLocaleString('sv-SE')} kr (${i.status})</li>`).join('');
    const quoteRows = contactQuotes.map(q => `<li><a href="#" onclick="window.app.editors.renderQuoteEditor('${q.id}')">Offert #${q.quoteNumber}</a> - ${q.grandTotal.toLocaleString('sv-SE')} kr (${q.status})</li>`).join('');
    const transactionRows = contactTransactions.map(t => `<li class="${t.type}">${t.date}: ${t.description} - ${t.amount.toLocaleString('sv-SE')} kr</li>`).join('');

    const detailHtml = `
        <div class="contact-detail-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <div>
                <h2>${contact.name}</h2>
                <p style="color: var(--text-color-light);">${contact.type === 'customer' ? 'Kund' : 'Leverantör'} | ${contact.email || 'Ingen e-post'} | ${contact.orgNumber || 'Inget org.nr'}</p>
            </div>
            <div>
                <button class="btn btn-secondary" onclick="window.contactFunctions.renderContactForm('${contact.id}')">Redigera</button>
                <button class="btn btn-danger" onclick="window.contactFunctions.deleteContact('${contact.id}')">Ta bort</button>
            </div>
        </div>

        <div class="settings-grid">
            <div class="card">
                <h3 class="card-title">Offerter (${contactQuotes.length})</h3>
                <ul class="history-list">${quoteRows || '<li>Inga offerter.</li>'}</ul>
            </div>
            <div class="card">
                <h3 class="card-title">Fakturor (${contactInvoices.length})</h3>
                <ul class="history-list">${invoiceRows || '<li>Inga fakturor.</li>'}</ul>
            </div>
            <div class="card" style="grid-column: 1 / -1;">
                <h3 class="card-title">Transaktioner (${contactTransactions.length})</h3>
                <ul class="history-list">${transactionRows || '<li>Inga transaktioner.</li>'}</ul>
            </div>
        </div>
    `;

    mainView.innerHTML = detailHtml;
    // Uppdatera sidans titel
    document.querySelector('.page-title').textContent = contact.name;
}


// Renders the form for adding or editing a contact in a modal
function renderContactForm(contactId = null) {
    const { allContacts } = getState();
    const contact = contactId ? allContacts.find(c => c.id === contactId) : null;
    const isEdit = !!contact;

    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content" onclick="event.stopPropagation()">
                <h3>${isEdit ? 'Redigera Kontakt' : 'Ny Kontakt'}</h3>
                <form id="contact-form">
                    <div class="input-group">
                        <label>Namn *</label>
                        <input class="form-input" id="contact-name" value="${contact?.name || ''}" required>
                    </div>
                    <div class="input-group">
                        <label>Typ</label>
                        <select id="contact-type" class="form-input">
                            <option value="customer" ${contact?.type === 'customer' ? 'selected' : ''}>Kund</option>
                            <option value="supplier" ${contact?.type === 'supplier' ? 'selected' : ''}>Leverantör</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Organisationsnummer / Personnummer</label>
                        <input class="form-input" id="contact-org-number" value="${contact?.orgNumber || ''}">
                    </div>
                    <div class="input-group">
                        <label>E-post</label>
                        <input class="form-input" id="contact-email" type="email" value="${contact?.email || ''}">
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" id="modal-cancel">Avbryt</button>
                        <button type="submit" class="btn btn-primary">${isEdit ? 'Uppdatera' : 'Skapa'}</button>
                    </div>
                </form>
            </div>
        </div>`;
    document.getElementById('modal-container').innerHTML = modalHtml;
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('contact-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        await saveContactHandler(btn, contactId);
    });
}

// Handles saving the contact data to Firestore
async function saveContactHandler(btn, contactId) {
    const contactData = {
        name: document.getElementById('contact-name').value.trim(),
        type: document.getElementById('contact-type').value,
        orgNumber: document.getElementById('contact-org-number').value.trim(),
        email: document.getElementById('contact-email').value.trim(),
    };

    if (!contactData.name) {
        showToast("Namn är obligatoriskt.", "warning");
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sparar...';

    try {
        await saveDocument('contacts', contactData, contactId);
        showToast(`Kontakten har ${contactId ? 'uppdaterats' : 'skapats'}!`, 'success');
        closeModal();
        await fetchAllCompanyData();
        // Om vi var på detaljvyn, rendera om den, annars rendera listan
        const currentPage = document.querySelector('.sidebar-nav a.active')?.dataset.page;
        const currentContactId = mainView.querySelector('.contact-detail-header') ? contactId : null;

        if (currentPage === 'Kontakter' && currentContactId) {
            renderContactDetailView(currentContactId);
        } else {
             renderContactsList();
        }
    } catch (error) {
        console.error("Kunde inte spara kontakt:", error);
        showToast('Kunde inte spara kontakten.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// Handles deleting a contact
function deleteContactHandler(contactId) {
    showConfirmationModal(async () => {
        try {
            await deleteDocument('contacts', contactId);
            showToast('Kontakten har tagits bort!', 'success');
            await fetchAllCompanyData();
            navigateTo('Kontakter'); // Gå tillbaka till listvyn efter borttagning
        } catch (error) {
            showToast('Kunde inte ta bort kontakten.', 'error');
        }
    }, "Ta bort kontakt", "Är du säker på att du vill ta bort denna kontakt permanent?");
}

// Make functions available on the window object to be called from HTML
window.contactFunctions = {
    renderContactForm,
    deleteContact: deleteContactHandler,
};