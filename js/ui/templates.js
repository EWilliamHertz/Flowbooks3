// js/ui/templates.js
import { getState } from '../state.js';
import { saveDocument, deleteDocument, fetchAllCompanyData } from '../services/firestore.js';
import { showToast, closeModal, showConfirmationModal, renderSpinner } from './utils.js';

let templateLines = [];

export function renderTemplatesPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="card">
            <div id="templates-list-container">
                ${renderSpinner()}
            </div>
        </div>
    `;
    renderTemplatesList();
}

function renderTemplatesList() {
    const { allTemplates } = getState();
    const container = document.getElementById('templates-list-container');
    if (!container) return;

    const rows = allTemplates.map(template => `
        <tr data-template-id="${template.id}">
            <td><strong>${template.name}</strong></td>
            <td>${template.lines ? template.lines.length : 0} rader</td>
            <td>
                <button class="btn btn-sm btn-secondary btn-edit-template">Redigera</button>
                <button class="btn btn-sm btn-danger btn-delete-template">Ta bort</button>
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <h3 class="card-title">Bokföringsmallar</h3>
        <p>Skapa återanvändbara mallar för transaktioner som sker ofta, t.ex. löneutbetalningar eller försäljningsrapporter från en e-handelsplattform.</p>
        <table class="data-table" id="templates-table" style="margin-top: 1.5rem;">
            <thead>
                <tr>
                    <th>Mallnamn</th>
                    <th>Antal rader</th>
                    <th>Åtgärder</th>
                </tr>
            </thead>
            <tbody>
                ${allTemplates.length > 0 ? rows : '<tr><td colspan="3" class="text-center">Du har inte skapat några mallar än.</td></tr>'}
            </tbody>
        </table>`;

    container.querySelectorAll('.btn-edit-template').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const templateId = e.target.closest('tr').dataset.templateId;
            renderTemplateEditor(templateId);
        });
    });
    container.querySelectorAll('.btn-delete-template').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const templateId = e.target.closest('tr').dataset.templateId;
            deleteTemplate(templateId);
        });
    });
}

export function renderTemplateEditor(templateId = null) {
    const { allTemplates, categories } = getState();
    const template = templateId ? allTemplates.find(t => t.id === templateId) : null;
    templateLines = template ? JSON.parse(JSON.stringify(template.lines)) : [];

    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="template-editor">
            <div class="card">
                <h3>${templateId ? `Redigera mall: ${template.name}` : 'Skapa Ny Mall'}</h3>
                <div class="input-group">
                    <label>Mallnamn</label>
                    <input id="template-name" class="form-input" value="${template?.name || ''}">
                </div>
            </div>

            <div class="card">
                <h3 class="card-title">Mallrader</h3>
                <p>Bygg upp din mall med en eller flera rader. Du kan använda procent (%) för att fördela ett totalbelopp.</p>
                <div id="template-lines-container"></div>
                <button id="add-line-btn" class="btn btn-secondary" style="margin-top: 1rem;">+ Lägg till Rad</button>
            </div>
            
            <div class="invoice-actions-footer">
                <button id="cancel-btn" class="btn btn-secondary">Avbryt</button>
                <button id="save-template-btn" class="btn btn-primary">Spara Mall</button>
            </div>
        </div>`;

    renderTemplateLines();
    
    document.getElementById('add-line-btn').addEventListener('click', () => {
        templateLines.push({ type: 'expense', description: '', categoryId: '', amount: '100%' });
        renderTemplateLines();
    });
    document.getElementById('save-template-btn').addEventListener('click', (e) => saveTemplate(e.target, templateId));
    document.getElementById('cancel-btn').addEventListener('click', () => window.navigateTo('templates'));
}

function renderTemplateLines() {
    const container = document.getElementById('template-lines-container');
    const { categories } = getState();

    const categoryOptions = categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');

    const tableRows = templateLines.map((line, index) => `
        <tr>
            <td>
                <select class="form-input item-type" data-index="${index}">
                    <option value="expense" ${line.type === 'expense' ? 'selected' : ''}>Utgift</option>
                    <option value="income" ${line.type === 'income' ? 'selected' : ''}>Intäkt</option>
                </select>
            </td>
            <td><input class="form-input item-description" data-index="${index}" value="${line.description}" placeholder="Beskrivning"></td>
            <td>
                <select class="form-input item-categoryId" data-index="${index}">
                    <option value="">Välj kategori...</option>
                    ${categories.map(cat => `<option value="${cat.id}" ${line.categoryId === cat.id ? 'selected' : ''}>${cat.name}</option>`).join('')}
                </select>
            </td>
            <td><input class="form-input item-amount" data-index="${index}" value="${line.amount}" placeholder="Fast belopp eller %"></td>
            <td><button class="btn btn-sm btn-danger" data-index="${index}">X</button></td>
        </tr>`).join('');
    
    container.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Typ</th><th>Beskrivning</th><th>Kategori</th><th>Belopp/Andel</th><th></th></tr></thead>
            <tbody>${tableRows}</tbody>
        </table>`;
    
    container.querySelectorAll('input, select').forEach(input => input.addEventListener('change', updateTemplateLine));
    container.querySelectorAll('.btn-danger').forEach(btn => btn.addEventListener('click', removeTemplateLine));
}

function updateTemplateLine(event) {
    const index = parseInt(event.target.dataset.index);
    const property = event.target.classList[1].replace('item-', '');
    templateLines[index][property] = event.target.value;
}

function removeTemplateLine(event) {
    const index = parseInt(event.target.dataset.index);
    templateLines.splice(index, 1);
    renderTemplateLines();
}

async function saveTemplate(btn, templateId) {
    const templateData = {
        name: document.getElementById('template-name').value.trim(),
        lines: templateLines
    };

    if (!templateData.name || templateLines.length === 0) {
        showToast("Mallnamn och minst en rad är obligatoriskt.", "warning");
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Sparar...";
    try {
        await saveDocument('templates', templateData, templateId);
        await fetchAllCompanyData();
        showToast('Mallen har sparats!', 'success');
        window.navigateTo('templates');
    } catch (error) {
        showToast('Kunde inte spara mallen.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function deleteTemplate(templateId) {
    showConfirmationModal(async () => {
        try {
            await deleteDocument('templates', templateId);
            await fetchAllCompanyData();
            showToast('Mallen har tagits bort!', 'success');
            renderTemplatesList();
        } catch (error) {
            showToast('Kunde inte ta bort mallen.', 'error');
        }
    }, "Ta bort mall", "Är du säker? Detta kan inte ångras.");
}