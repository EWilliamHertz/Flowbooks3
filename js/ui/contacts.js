// js/ui/contacts.js
import { getState } from '../state.js';
import { saveDocument, deleteDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal } from './utils.js';

// Renders the main contacts page
export function renderContactsPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <h3 class="card-title">Kontakter</h3>
            <p>Hantera dina kunder och leverantörer. Denna information används för att snabbt skapa fakturor och registrera utgifter.</p>
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
        <tr>
            <td><strong>${contact.name}</strong></td>
            <td>${contact.type === 'customer' ? 'Kund' : 'Leverantör'}</td>
            <td>${contact.orgNumber || '-'}</td>
            <td>${contact.email || '-'}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="window.contactFunctions.renderContactForm('${contact.id}')">Redigera</button>
                <button class="btn btn-sm btn-danger" onclick="window.contactFunctions.deleteContact('${contact.id}')">Ta bort</button>
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Namn</th>
                    <th>Typ</th>
                    <th>Org.nr / Personnr.</th>
                    <th>E-post</th>
                    <th>Åtgärder</th>
                </tr>
            </thead>
            <tbody>
                ${allContacts.length > 0 ? rows : '<tr><td colspan="5" class="text-center">Du har inte lagt till några kontakter än.</td></tr>'}
            </tbody>
        </table>
    `;
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
        await fetchAllCompanyData(); // Refresh all data
        renderContactsList(); // Re-render the list on the page
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
            renderContactsList();
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
