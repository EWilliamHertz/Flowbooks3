// js/ui/timetracking.js
import { getState } from '../state.js';
import { saveDocument, deleteDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal, renderSpinner } from './utils.js';
import { editors } from './editors.js';
import { writeBatch, doc } from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js';
import { db } from '../../firebase-config.js';

export function renderTimeTrackingPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <div id="timetracking-list-container">
                ${renderSpinner()}
            </div>
        </div>
    `;
    renderTimeEntriesList();
}

function renderTimeEntriesList() {
    const { allTimeEntries, allProjects, allContacts } = getState();
    const container = document.getElementById('timetracking-list-container');
    if (!container) return;

    const getProjectName = (id) => allProjects.find(p => p.id === id)?.name || '-';
    const getContactName = (id) => allContacts.find(c => c.id === id)?.name || '-';

    const rows = allTimeEntries.sort((a, b) => new Date(b.date) - new Date(a.date)).map(entry => {
        const hours = parseFloat(entry.hours || 0);
        return `
            <tr data-entry-id="${entry.id}">
                <td>${entry.date}</td>
                <td><strong>${entry.description}</strong></td>
                <td>${getContactName(entry.contactId)}</td>
                <td>${getProjectName(entry.projectId)}</td>
                <td class="text-right">${hours.toFixed(2)} tim</td>
                <td><span class="invoice-status ${entry.isBilled ? 'Betald' : 'Utkast'}">${entry.isBilled ? 'Fakturerad' : 'Ej fakturerad'}</span></td>
                <td>
                    ${!entry.isBilled ? `
                    <button class="btn btn-sm btn-secondary btn-edit-entry">Redigera</button>
                    <button class="btn btn-sm btn-danger btn-delete-entry">Ta bort</button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="controls-container" style="padding: 0; background: none; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
            <h3 class="card-title" style="margin: 0;">Tidrapportering</h3>
            <button id="invoice-unbilled-btn" class="btn btn-primary">Fakturera Vald Period</button>
        </div>
        <p>Registrera arbetade timmar här. Du kan sedan skapa fakturor baserat på ej fakturerad tid från kund- eller projektvyn.</p>
        <table class="data-table" id="timetracking-table" style="margin-top: 1.5rem;">
            <thead>
                <tr>
                    <th>Datum</th>
                    <th>Beskrivning</th>
                    <th>Kund</th>
                    <th>Projekt</th>
                    <th class="text-right">Timmar</th>
                    <th>Status</th>
                    <th>Åtgärder</th>
                </tr>
            </thead>
            <tbody>
                ${allTimeEntries.length > 0 ? rows : '<tr><td colspan="7" class="text-center">Du har inte registrerat några tidsposter än.</td></tr>'}
            </tbody>
        </table>`;

    attachTimeEntryEventListeners();
}

function attachTimeEntryEventListeners() {
    const table = document.getElementById('timetracking-table');
    if (!table) return;

    table.querySelectorAll('.btn-edit-entry').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const entryId = e.target.closest('tr').dataset.entryId;
            renderTimeEntryForm(entryId);
        });
    });

    table.querySelectorAll('.btn-delete-entry').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const entryId = e.target.closest('tr').dataset.entryId;
            deleteTimeEntry(entryId);
        });
    });
    
    // Framtida funktion: Fakturera en hel period
    document.getElementById('invoice-unbilled-btn').addEventListener('click', () => {
        showToast("Denna funktion kommer i en framtida uppdatering.", "info");
    });
}


export function renderTimeEntryForm(entryId = null) {
    const { allTimeEntries, allContacts, allProjects } = getState();
    const entry = entryId ? allTimeEntries.find(e => e.id === entryId) : null;
    const isEdit = !!entry;
    const today = new Date().toISOString().slice(0, 10);

    const customerOptions = allContacts
        .filter(c => c.type === 'customer')
        .map(c => `<option value="${c.id}" ${entry?.contactId === c.id ? 'selected' : ''}>${c.name}</option>`)
        .join('');

    const projectOptions = allProjects
        .map(p => `<option value="${p.id}" ${entry?.projectId === p.id ? 'selected' : ''}>${p.name}</option>`)
        .join('');

    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content" onclick="event.stopPropagation()">
                <h3>${isEdit ? 'Redigera Tidspost' : 'Ny Tidspost'}</h3>
                <form id="time-entry-form">
                    <div class="input-group">
                        <label>Datum *</label>
                        <input class="form-input" id="entry-date" type="date" value="${entry?.date || today}" required>
                    </div>
                     <div class="input-group">
                        <label>Beskrivning *</label>
                        <input class="form-input" id="entry-description" value="${entry?.description || ''}" required>
                    </div>
                    <div class="input-group">
                        <label>Antal timmar *</label>
                        <input class="form-input" id="entry-hours" type="number" step="0.25" value="${entry?.hours || ''}" placeholder="t.ex. 2.5" required>
                    </div>
                     <div class="form-grid">
                        <div class="input-group">
                            <label>Kund</label>
                            <select id="entry-customer" class="form-input">
                                <option value="">Ingen specifik kund</option>
                                ${customerOptions}
                            </select>
                        </div>
                        <div class="input-group">
                            <label>Projekt</label>
                            <select id="entry-project" class="form-input">
                                <option value="">Inget specifikt projekt</option>
                                ${projectOptions}
                            </select>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" id="modal-cancel">Avbryt</button>
                        <button type="submit" class="btn btn-primary">${isEdit ? 'Uppdatera' : 'Spara'}</button>
                    </div>
                </form>
            </div>
        </div>`;
    document.getElementById('modal-container').innerHTML = modalHtml;
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('time-entry-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveTimeEntryHandler(e.target.querySelector('button[type="submit"]'), entryId);
    });
}

async function saveTimeEntryHandler(btn, entryId) {
    const entryData = {
        date: document.getElementById('entry-date').value,
        description: document.getElementById('entry-description').value.trim(),
        hours: parseFloat(document.getElementById('entry-hours').value) || 0,
        contactId: document.getElementById('entry-customer').value || null,
        projectId: document.getElementById('entry-project').value || null,
        isBilled: false,
    };

    if (!entryData.date || !entryData.description || entryData.hours <= 0) {
        showToast("Fyll i datum, beskrivning och ett giltigt antal timmar.", "warning");
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sparar...';

    try {
        await saveDocument('timeEntries', entryData, entryId);
        showToast(`Tidsposten har ${entryId ? 'uppdaterats' : 'sparats'}!`, 'success');
        closeModal();
        await fetchAllCompanyData();
        renderTimeEntriesList();
    } catch (error) {
        showToast('Kunde inte spara tidsposten.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function deleteTimeEntry(entryId) {
    showConfirmationModal(async () => {
        try {
            await deleteDocument('timeEntries', entryId);
            showToast('Tidsposten har tagits bort!', 'success');
            await fetchAllCompanyData();
            renderTimeEntriesList();
        } catch (error) {
            showToast('Kunde inte ta bort tidsposten.', 'error');
        }
    }, "Ta bort Tidspost", "Är du säker? Detta kan inte ångras.");
}