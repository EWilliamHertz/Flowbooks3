// js/ui/components.js
import { getState } from '../state.js';
import { t } from '../i18n.js';
import { closeModal } from './utils.js';

export function getControlsHTML() {
    const { categories } = getState();
    const categoryOptions = categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');

    return `
        <div class="controls-container">
            <div class="search-container">
                <input type="text" id="search-input" class="form-input" placeholder="Sök transaktioner...">
            </div>
            <div class="filter-container">
                <select id="category-filter" class="form-input">
                    <option value="all">Alla Kategorier</option>
                    ${categoryOptions}
                </select>
                <button class="btn filter-btn active" data-period="all">Alla</button>
                <button class="btn filter-btn" data-period="this-month">Denna månad</button>
                <button class="btn filter-btn" data-period="last-month">Förra månaden</button>
            </div>
        </div>`;
}

/**
 * Generates and displays a reusable modal component.
 * @param {string} title The title of the modal.
 * @param {string} content The inner HTML content of the modal.
 * @param {Array<Object>} actions A list of button actions for the modal footer.
 * @param {boolean} hasOverlay If a semi-transparent overlay should be shown behind the modal.
 */
export function renderModal({ title = '', content = '', actions = [], hasOverlay = true }) {
    const modalContainer = document.getElementById('modal-container');
    
    const actionsHtml = actions.map(action => 
        `<button id="${action.id}" class="btn btn-${action.style}" ${action.disabled ? 'disabled' : ''}>${t(action.text)}</button>`
    ).join('');

    modalContainer.innerHTML = `
        <div class="modal-overlay" ${hasOverlay ? '' : 'style="background:none;"'}>
            <div class="modal-content" onclick="event.stopPropagation()">
                ${title ? `<h3>${title}</h3>` : ''}
                ${content}
                ${actionsHtml ? `<div class="modal-actions">${actionsHtml}</div>` : ''}
            </div>
        </div>
    `;

    actions.forEach(action => {
        if (action.handler) {
            document.getElementById(action.id)?.addEventListener('click', action.handler);
        }
    });

    document.getElementById('modal-cancel')?.addEventListener('click', () => {
        closeModal();
    });
}