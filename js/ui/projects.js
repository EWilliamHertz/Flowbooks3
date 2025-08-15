// js/ui/projects.js
import { getState } from '../state.js';
import { saveDocument, deleteDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal, renderSpinner } from './utils.js';
import { editors } from './editors.js';

export function renderProjectsPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <div id="projects-list-container">
                ${renderSpinner()}
            </div>
        </div>
    `;
    renderProjectsList();
}

function renderProjectsList() {
    const { allProjects, allTransactions } = getState();
    const container = document.getElementById('projects-list-container');
    if (!container) return;

    const rows = allProjects.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(project => {
        const projectTransactions = allTransactions.filter(t => t.projectId === project.id);
        const income = projectTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const expense = projectTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const profit = income - expense;

        return `
            <tr data-project-id="${project.id}" style="cursor:pointer;">
                <td><strong>${project.name}</strong></td>
                <td>${project.customerName || '-'}</td>
                <td><span class="project-status ${project.status}">${project.status}</span></td>
                <td class="text-right green">${income.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</td>
                <td class="text-right red">${expense.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</td>
                <td class="text-right ${profit >= 0 ? 'blue' : 'red'}"><strong>${profit.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <h3 class="card-title">Projekt</h3>
        <p>Skapa projekt för att följa upp lönsamheten för specifika uppdrag. Klicka på ett projekt för att se detaljer.</p>
        <table class="data-table" id="projects-table" style="margin-top: 1.5rem;">
            <thead>
                <tr>
                    <th>Projektnamn</th>
                    <th>Kund</th>
                    <th>Status</th>
                    <th class="text-right">Intäkter</th>
                    <th class="text-right">Kostnader</th>
                    <th class="text-right">Resultat</th>
                </tr>
            </thead>
            <tbody>
                ${allProjects.length > 0 ? rows : '<tr><td colspan="6" class="text-center">Du har inte skapat några projekt än.</td></tr>'}
            </tbody>
        </table>`;
    
    container.querySelectorAll('tbody tr').forEach(row => {
        row.addEventListener('click', () => {
            window.navigateTo('projects', row.dataset.projectId);
        });
    });
}

export function renderProjectDetailView(projectId) {
    const { allProjects, allTransactions, categories } = getState();
    const project = allProjects.find(p => p.id === projectId);
    
    if (!project) {
        window.navigateTo('projects');
        return;
    }

    const mainView = document.getElementById('main-view');
    mainView.innerHTML = renderSpinner();

    const projectTransactions = allTransactions.filter(t => t.projectId === projectId).sort((a,b) => new Date(b.date) - new Date(a.date));
    const income = projectTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = projectTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const profit = income - expense;
    
    const getCategoryName = (id) => categories.find(c => c.id === id)?.name || '-';

    const transactionRows = projectTransactions.map(t => `
        <tr class="transaction-row ${t.type}">
            <td>${t.date}</td>
            <td>${t.description}</td>
            <td>${getCategoryName(t.categoryId)}</td>
            <td class="text-right ${t.type === 'income' ? 'green' : 'red'}">${t.amount.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</td>
        </tr>
    `).join('');

    const detailHtml = `
        <div class="project-detail-header" data-project-id="${project.id}">
            <div>
                <h2>${project.name} <span class="project-status ${project.status}">${project.status}</span></h2>
                <p style="color: var(--text-color-light);">Kund: ${project.customerName || 'Ingen kund angiven'}</p>
            </div>
            <div>
                <button class="btn btn-success btn-invoice-time">Fakturera Obetald Tid</button>
                <button class="btn btn-secondary btn-edit-project">Redigera Projekt</button>
                <button class="btn btn-danger btn-delete-project">Ta bort Projekt</button>
            </div>
        </div>
        <div class="dashboard-metrics" style="grid-template-columns: repeat(3, 1fr);">
            <div class="card text-center"><h3 class="card-title">Totala Intäkter</h3><p class="metric-value green">${income.toLocaleString('sv-SE', {style:'currency', currency: 'SEK'})}</p></div>
            <div class="card text-center"><h3 class="card-title">Totala Kostnader</h3><p class="metric-value red">${expense.toLocaleString('sv-SE', {style:'currency', currency: 'SEK'})}</p></div>
            <div class="card text-center"><h3 class="card-title">Resultat</h3><p class="metric-value ${profit >= 0 ? 'blue' : 'red'}">${profit.toLocaleString('sv-SE', {style:'currency', currency: 'SEK'})}</p></div>
        </div>
        <div class="card" style="margin-top: 1.5rem;">
            <h3 class="card-title">Kopplade Transaktioner</h3>
            <table class="data-table">
                <thead><tr><th>Datum</th><th>Beskrivning</th><th>Kategori</th><th class="text-right">Belopp</th></tr></thead>
                <tbody>${transactionRows.length > 0 ? transactionRows : '<tr><td colspan="4" class="text-center">Inga transaktioner kopplade till detta projekt.</td></tr>'}</tbody>
            </table>
        </div>
    `;

    mainView.innerHTML = detailHtml;
    
    mainView.querySelector('.btn-edit-project').addEventListener('click', () => renderProjectForm(projectId));
    mainView.querySelector('.btn-delete-project').addEventListener('click', () => deleteProject(projectId));
    mainView.querySelector('.btn-invoice-time').addEventListener('click', () => invoiceUnbilledTimeForProject(projectId));
}

function invoiceUnbilledTimeForProject(projectId) {
    const { allTimeEntries, allProjects } = getState();
    const project = allProjects.find(p => p.id === projectId);
    const unbilledEntries = allTimeEntries.filter(e => e.projectId === projectId && !e.isBilled);

    if (unbilledEntries.length === 0) {
        showToast("Det finns ingen ofakturerad tid för detta projekt.", "info");
        return;
    }
    
    showConfirmationModal(() => {
        const invoiceItems = unbilledEntries.map(entry => ({
            description: `${entry.date}: ${entry.description}`,
            quantity: entry.hours,
            price: 0,
            vatRate: 25,
            sourceTimeEntryId: entry.id
        }));

        const invoiceDataFromTime = {
            customerName: project.customerName,
            items: invoiceItems,
            source: 'timetracking',
            timeEntryIds: unbilledEntries.map(e => e.id)
        };

        editors.renderInvoiceEditor(null, invoiceDataFromTime);

    }, "Skapa Faktura?", `Detta kommer att skapa ett fakturautkast med ${unbilledEntries.length} tidsposter. Du kan justera timpris och detaljer innan du bokför.`);
}

export function renderProjectForm(projectId = null) {
    const { allProjects, allContacts } = getState();
    const project = projectId ? allProjects.find(p => p.id === projectId) : null;
    const isEdit = !!project;

    const customerOptions = allContacts
        .filter(c => c.type === 'customer')
        .map(c => `<option value="${c.name}" ${project?.customerName === c.name ? 'selected' : ''}>${c.name}</option>`)
        .join('');

    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content" onclick="event.stopPropagation()">
                <h3>${isEdit ? 'Redigera Projekt' : 'Nytt Projekt'}</h3>
                <form id="project-form">
                    <div class="input-group">
                        <label>Projektnamn *</label>
                        <input class="form-input" id="project-name" value="${project?.name || ''}" required>
                    </div>
                    <div class="input-group">
                        <label>Kund</label>
                        <select id="project-customer" class="form-input">
                            <option value="">Ingen specifik kund</option>
                            ${customerOptions}
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Status</label>
                        <select id="project-status" class="form-input">
                            <option value="Aktivt" ${project?.status === 'Aktivt' ? 'selected' : ''}>Aktivt</option>
                            <option value="Slutfört" ${project?.status === 'Slutfört' ? 'selected' : ''}>Slutfört</option>
                            <option value="Pausat" ${project?.status === 'Pausat' ? 'selected' : ''}>Pausat</option>
                        </select>
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
    document.getElementById('project-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveProjectHandler(e.target.querySelector('button[type="submit"]'), projectId);
    });
}

async function saveProjectHandler(btn, projectId) {
    const projectData = {
        name: document.getElementById('project-name').value.trim(),
        customerName: document.getElementById('project-customer').value,
        status: document.getElementById('project-status').value,
    };

    if (!projectData.name) {
        showToast("Projektnamn är obligatoriskt.", "warning");
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sparar...';

    try {
        await saveDocument('projects', projectData, projectId);
        showToast(`Projektet har ${projectId ? 'uppdaterats' : 'skapats'}!`, 'success');
        closeModal();
        await fetchAllCompanyData();
        if (projectId) {
            renderProjectDetailView(projectId);
        } else {
            renderProjectsList();
        }
    } catch (error) {
        showToast('Kunde inte spara projektet.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function deleteProject(projectId) {
    showConfirmationModal(async () => {
        try {
            await deleteDocument('projects', projectId);
            showToast('Projektet har tagits bort!', 'success');
            await fetchAllCompanyData();
            window.navigateTo('projects');
        } catch (error) {
            showToast('Kunde inte ta bort projektet. Se till att inga transaktioner är kopplade till det.', 'error');
        }
    }, "Ta bort projekt", "Är du säker? Detta kan inte ångras. Transaktioner kopplade till projektet kommer inte att raderas.");
}