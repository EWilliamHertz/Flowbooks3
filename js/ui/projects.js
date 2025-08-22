// js/ui/projects.js
import { getState } from '../state.js';
import { saveDocument, deleteDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal, renderSpinner } from './utils.js';
import { editors } from './editors.js';
import { t } from '../i18n.js';

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
                <td>${project.customerName || t('noCustomerSpecified')}</td>
                <td><span class="project-status ${project.status}">${t(project.status)}</span></td>
                <td class="text-right green">${income.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</td>
                <td class="text-right red">${expense.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</td>
                <td class="text-right ${profit >= 0 ? 'blue' : 'red'}"><strong>${profit.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <h3 class="card-title">${t('projectsTitle')}</h3>
        <p>${t('projectsDescription')}</p>
        <table class="data-table" id="projects-table" style="margin-top: 1.5rem;">
            <thead>
                <tr>
                    <th>${t('projectName')}</th>
                    <th>${t('projectCustomer')}</th>
                    <th>${t('projectStatus')}</th>
                    <th class="text-right">${t('projectIncome')}</th>
                    <th class="text-right">${t('projectCosts')}</th>
                    <th class="text-right">${t('projectProfit')}</th>
                </tr>
            </thead>
            <tbody>
                ${allProjects.length > 0 ? rows : `<tr><td colspan="6" class="text-center">${t('noProjectsYet')}</td></tr>`}
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
                <h2>${project.name} <span class="project-status ${project.status}">${t(project.status)}</span></h2>
                <p style="color: var(--text-color-light);">${t('customer')}: ${project.customerName || t('noCustomerSpecified')}</p>
            </div>
            <div>
                <button class="btn btn-success btn-invoice-time">${t('invoiceUnpaidTime')}</button>
                <button class="btn btn-secondary btn-edit-project">${t('editProject')}</button>
                <button class="btn btn-danger btn-delete-project">${t('deleteProject')}</button>
            </div>
        </div>
        <div class="dashboard-metrics" style="grid-template-columns: repeat(3, 1fr);">
            <div class="card text-center"><h3 class="card-title">${t('totalIncome')}</h3><p class="metric-value green">${income.toLocaleString('sv-SE', {style:'currency', currency: 'SEK'})}</p></div>
            <div class="card text-center"><h3 class="card-title">${t('totalCosts')}</h3><p class="metric-value red">${expense.toLocaleString('sv-SE', {style:'currency', currency: 'SEK'})}</p></div>
            <div class="card text-center"><h3 class="card-title">${t('projectProfit')}</h3><p class="metric-value ${profit >= 0 ? 'blue' : 'red'}">${profit.toLocaleString('sv-SE', {style:'currency', currency: 'SEK'})}</p></div>
        </div>
        <div class="card" style="margin-top: 1.5rem;">
            <h3 class="card-title">${t('linkedTransactions')}</h3>
            <table class="data-table">
                <thead><tr><th>${t('date')}</th><th>${t('description')}</th><th>${t('category')}</th><th class="text-right">${t('amount')}</th></tr></thead>
                <tbody>${transactionRows.length > 0 ? transactionRows : `<tr><td colspan="4" class="text-center">${t('noTransactionsForProject')}</td></tr>`}</tbody>
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
        showToast(t('noUnbilledTime'), "info");
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

    }, t('createInvoiceQuestion'), t('createInvoiceFromTimeNotice', { lineCount: unbilledEntries.length }));
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
                <h3>${isEdit ? t('editProject') : t('newProject')}</h3>
                <form id="project-form">
                    <div class="input-group">
                        <label>${t('projectName')} *</label>
                        <input class="form-input" id="project-name" value="${project?.name || ''}" required>
                    </div>
                    <div class="input-group">
                        <label>${t('projectCustomer')}</label>
                        <select id="project-customer" class="form-input">
                            <option value="">${t('noSpecificCustomer')}</option>
                            ${customerOptions}
                        </select>
                    </div>
                    <div class="input-group">
                        <label>${t('projectStatus')}</label>
                        <select id="project-status" class="form-input">
                            <option value="Aktivt" ${project?.status === 'Aktivt' ? 'selected' : ''}>${t('Aktivt')}</option>
                            <option value="Slutfört" ${project?.status === 'Slutfört' ? 'selected' : ''}>${t('Slutfört')}</option>
                            <option value="Pausat" ${project?.status === 'Pausat' ? 'selected' : ''}>${t('Pausat')}</option>
                        </select>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" id="modal-cancel">${t('cancel')}</button>
                        <button type="submit" class="btn btn-primary">${isEdit ? t('updateTimeEntry') : t('create')}</button>
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
        showToast(t('projectNameIsRequired'), "warning");
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('saving');

    try {
        await saveDocument('projects', projectData, projectId);
        const action = projectId ? 'uppdaterats' : 'skapats';
        showToast(t('projectUpdatedOrCreated', { action: action }), 'success');
        closeModal();
        await fetchAllCompanyData();
        if (projectId) {
            renderProjectDetailView(projectId);
        } else {
            renderProjectsList();
        }
    } catch (error) {
        showToast(t('couldNotSaveProject'), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function deleteProject(projectId) {
    showConfirmationModal(async () => {
        try {
            await deleteDocument('projects', projectId);
            showToast(t('projectDeleted'), 'success');
            await fetchAllCompanyData();
            window.navigateTo('projects');
        } catch (error) {
            showToast(t('couldNotDeleteProject'), 'error');
        }
    }, t('deleteProject'), t('deleteProjectWarning'));
}