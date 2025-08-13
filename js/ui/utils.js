// js/ui/utils.js
import { t } from '../i18n.js';

export function showToast(messageKey, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = t(messageKey); 
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

export function renderSpinner() {
    return `<div class="spinner-container"><div class="spinner"></div></div>`;
}

export function showConfirmationModal(onConfirm, titleKey, messageKey) {
    const container = document.getElementById('modal-container');
    container.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>${t(titleKey)}</h3>
                <p>${t(messageKey)}</p>
                <div class="modal-actions">
                    <button id="modal-cancel" class="btn btn-secondary">${t('cancel')}</button>
                    <button id="modal-confirm" class="btn btn-primary">${t('confirmAction')}</button>
                </div>
            </div>
        </div>`;
    document.getElementById('modal-confirm').onclick = () => { 
        container.innerHTML = ''; 
        onConfirm(); 
    };
    document.getElementById('modal-cancel').onclick = () => { 
        container.innerHTML = ''; 
    };
}

export function closeModal() {
    const container = document.getElementById('modal-container');
    if (container) {
        container.innerHTML = '';
    }
}