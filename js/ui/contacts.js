// js/ui/contacts.js
import { getState } from '../state.js';
import { saveDocument, deleteDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal, renderSpinner } from './utils.js';
import { editors } from './editors.js';
import { writeBatch, doc } from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js';
import { db } from '../../firebase-config.js';
import { t } from '../i18n.js';

export function renderContactsPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <div class="controls-container" style="padding: 0; background: none; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                 <h3 class="card-title" style="margin: 0;">${t('contacts')}</h3>
                 <div>
                    <button id="email-selected-btn" class="btn btn-secondary" style="display: none; margin-right: 10px;">${t('emailSelectedContacts')}</button>
                    <button id="delete-selected-contacts-btn" class="btn btn-danger" style="display: none;">${t('deleteSelectedContacts')}</button>
                 </div>
            </div>
            <p>${t('contactsDescription')}</p>
            <div id="contacts-list-container" style="margin-top: 1.5rem;"></div>
        </div>
    `;
    renderContactsList();
}

function renderContactsList() {
    const { allContacts } = getState();
    const container = document.getElementById('contacts-list-container');
    if (!container) return;

    const rows = allContacts.map(contact => `
        <tr data-contact-id="${contact.id}" style="cursor: pointer;">
            <td><input type="checkbox" class="contact-select-checkbox" data-id="${contact.id}" data-email="${contact.email || ''}" onclick="event.stopPropagation();"></td>
            <td><strong>${contact.name}</strong></td>
            <td>${contact.type === 'customer' ? t('customer') : t('supplier')}</td>
            <td>${contact.orgNumber || '-'}</td>
            <td>${contact.email || '-'}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th><input type="checkbox" id="select-all-contacts"></th>
                    <th>${t('name')}</th>
                    <th>${t('contactType')}</th>
                    <th>${t('contactOrgNr')}</th>
                    <th>${t('contactEmail')}</th>
                </tr>
            </thead>
            <tbody>
                ${allContacts.length > 0 ? rows : `<tr><td colspan="5" class="text-center">${t('noContactsYet')}</td></tr>`}
            </tbody>
        </table>
    `;
    
    container.querySelectorAll('tbody tr').forEach(row => {
        row.addEventListener('click', () => {
            window.navigateTo('contacts', row.dataset.contactId);
        });
    });

    const allCheckbox = document.getElementById('select-all-contacts');
    const checkboxes = document.querySelectorAll('.contact-select-checkbox');
    const emailBtn = document.getElementById('email-selected-btn');
    const deleteBtn = document.getElementById('delete-selected-contacts-btn');

    const toggleActionButtons = () => {
        const selected = document.querySelectorAll('.contact-select-checkbox:checked');
        emailBtn.style.display = selected.length > 0 ? 'inline-block' : 'none';
        deleteBtn.style.display = selected.length > 0 ? 'inline-block' : 'none';
        if(selected.length > 0) {
            deleteBtn.textContent = `${t('deleteSelectedContacts')} (${selected.length})`;
        }
    };

    if(allCheckbox){
        allCheckbox.addEventListener('change', (e) => {
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            toggleActionButtons();
        });
    }

    checkboxes.forEach(cb => cb.addEventListener('change', toggleActionButtons));

    if(emailBtn){
        emailBtn.addEventListener('click', () => {
            const selectedEmails = Array.from(document.querySelectorAll('.contact-select-checkbox:checked'))
                .map(cb => cb.dataset.email)
                .filter(email => email);
            
            if (selectedEmails.length > 0) {
                window.location.href = `mailto:?bcc=${selectedEmails.join(',')}`;
            } else {
                showToast(t('noContactsWithEmail'), "warning");
            }
        });
    }

    if(deleteBtn){
        deleteBtn.addEventListener('click', () => {
            const selectedIds = Array.from(document.querySelectorAll('.contact-select-checkbox:checked')).map(cb => cb.dataset.id);
            if (selectedIds.length > 0) {
                showConfirmationModal(async () => {
                    const batch = writeBatch(db);
                    selectedIds.forEach(id => {
                        batch.delete(doc(db, 'contacts', id));
                    });
                    await batch.commit();
                    await fetchAllCompanyData();
                    renderContactsList();
                    showToast(t('contactsDeleted', { count: selectedIds.length }), 'success');
                }, t('deleteContactsTitle'), t('areYouSureDeleteContacts', { count: selectedIds.length }));
            }
        });
    }
}

export function renderContactDetailView(contactId) {
    const { allContacts, allInvoices, allQuotes, allTransactions } = getState();
    const contact = allContacts.find(c => c.id === contactId);
    
    if (!contact) {
        window.navigateTo('contacts');
        return;
    }

    const mainView = document.getElementById('main-view');
    mainView.innerHTML = renderSpinner();

    const contactInvoices = allInvoices.filter(i => i.customerName === contact.name);
    const contactQuotes = allQuotes.filter(q => q.customerName === contact.name);
    const contactTransactions = allTransactions.filter(t => t.party === contact.name);

    const invoiceRows = contactInvoices.map(i => `<li data-id="${i.id}" data-type="invoice"><a href="#">${t('invoice')} #${i.invoiceNumber}</a> - ${i.grandTotal.toLocaleString(undefined, {style: 'currency', currency: 'SEK'})} (${t(i.status)})</li>`).join('');
    const quoteRows = contactQuotes.map(q => `<li data-id="${q.id}" data-type="quote"><a href="#">${t('quote')} #${q.quoteNumber}</a> - ${q.grandTotal.toLocaleString(undefined, {style: 'currency', currency: 'SEK'})} (${t(q.status)})</li>`).join('');
    const transactionRows = contactTransactions.map(t => `<li class="${t.type === 'income' ? 'green' : 'red'}">${t.date}: ${t.description} - ${t.amount.toLocaleString(undefined, {style: 'currency', currency: 'SEK'})}</li>`).join('');

    const detailHtml = `
        <div class="contact-detail-header" data-contact-id="${contact.id}">
            <div style="margin-bottom: 2rem;">
                <h2>${contact.name}</h2>
                <p style="color: var(--text-color-light);">${contact.type === 'customer' ? t('customer') : t('supplier')} | ${contact.email || t('noEmail')} | ${contact.orgNumber || t('noOrgNumber')}</p>
            </div>
            <div>
                <button class="btn btn-secondary btn-edit-contact">${t('edit')}</button>
                <button class="btn btn-danger btn-delete-contact">${t('delete')}</button>
            </div>
        </div>
        <div class="settings-grid">
            <div class="card">
                <h3 class="card-title">${t('contactHistoryQuotes', { count: contactQuotes.length })}</h3>
                <ul class="history-list" id="quote-history-list">${quoteRows || `<li>${t('noQuotesFound')}</li>`}</ul>
            </div>
            <div class="card">
                <h3 class="card-title">${t('contactHistoryInvoices', { count: contactInvoices.length })}</h3>
                <ul class="history-list" id="invoice-history-list">${invoiceRows || `<li>${t('noInvoicesFound')}</li>`}</ul>
            </div>
            <div class="card" style="grid-column: 1 / -1;">
                <h3 class="card-title">${t('contactHistoryTransactions', { count: contactTransactions.length })}</h3>
                <ul class="history-list">${transactionRows || `<li>${t('noTransactionsFound')}</li>`}</ul>
            </div>
        </div>
    `;

    mainView.innerHTML = detailHtml;
    const pageTitleEl = document.querySelector('.page-title');
    if(pageTitleEl) pageTitleEl.textContent = contact.name;
    
    attachContactDetailEventListeners();
}

function attachContactDetailEventListeners() {
    const mainView = document.getElementById('main-view');

    mainView.addEventListener('click', e => {
        const contactId = mainView.querySelector('.contact-detail-header')?.dataset.contactId;

        if (e.target.matches('.btn-edit-contact')) {
            editors.renderContactForm(contactId);
        } else if (e.target.matches('.btn-delete-contact')) {
            deleteContact(contactId);
        }
        
        const historyItem = e.target.closest('li[data-id]');
        if (historyItem) {
            e.preventDefault();
            const id = historyItem.dataset.id;
            const type = historyItem.dataset.type;

            if (type === 'invoice') {
                editors.renderInvoiceEditor(id);
            } else if (type === 'quote') {
                editors.renderQuoteEditor(id);
            }
        }
    });
}

export function renderContactForm(contactId = null) {
    const { allContacts } = getState();
    const contact = contactId ? allContacts.find(c => c.id === contactId) : null;
    const isEdit = !!contact;

    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content" onclick="event.stopPropagation()">
                <h3>${isEdit ? t('editContact') : t('newContact')}</h3>
                <form id="contact-form">
                    <div class="input-group">
                        <label>${t('contactName')} *</label>
                        <input class="form-input" id="contact-name" value="${contact?.name || ''}" required>
                    </div>
                    <div class="input-group">
                        <label>${t('contactType')}</label>
                        <select id="contact-type" class="form-input">
                            <option value="customer" ${contact?.type === 'customer' ? 'selected' : ''}>${t('customer')}</option>
                            <option value="supplier" ${contact?.type === 'supplier' ? 'selected' : ''}>${t('supplier')}</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>${t('contactOrgNr')}</label>
                        <input class="form-input" id="contact-org-number" value="${contact?.orgNumber || ''}">
                    </div>
                    <div class="input-group">
                        <label>${t('contactEmail')}</label>
                        <input class="form-input" id="contact-email" type="email" value="${contact?.email || ''}">
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" id="modal-cancel">${t('cancel')}</button>
                        <button type="submit" class="btn btn-primary">${isEdit ? t('update') : t('create')}</button>
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

async function saveContactHandler(btn, contactId) {
    const contactData = {
        name: document.getElementById('contact-name').value.trim(),
        type: document.getElementById('contact-type').value,
        orgNumber: document.getElementById('contact-org-number').value.trim(),
        email: document.getElementById('contact-email').value.trim(),
    };

    if (!contactData.name) {
        showToast(t('contactNameRequired'), "warning");
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('saving');

    try {
        await saveDocument('contacts', contactData, contactId);
        showToast(t('contactSaved', { status: contactId ? t('contactUpdated') : t('contactCreated') }), 'success');
        closeModal();
        await fetchAllCompanyData();
        const mainView = document.getElementById('main-view');
        const isDetailView = mainView.querySelector('.contact-detail-header');

        if (isDetailView) {
            renderContactDetailView(contactId);
        } else {
            renderContactsList();
        }
    } catch (error) {
        console.error("Could not save contact:", error);
        showToast(t('couldNotSaveContact'), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

export function deleteContact(contactId) {
    showConfirmationModal(async () => {
        try {
            await deleteDocument('contacts', contactId);
            showToast(t('contactDeleted'), 'success');
            await fetchAllCompanyData();
            window.navigateTo('contacts');
        } catch (error) {
            showToast(t('couldNotDeleteContact'), 'error');
        }
    }, t('deleteContactTitle'), t('deleteContactBody'));
}