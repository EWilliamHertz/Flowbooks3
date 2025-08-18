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
                <p style="white-space: pre-wrap;">${t(messageKey)}</p>
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

// NY FUNKTION FÖR TYDLIGA MEDDELANDEN
export function showInfoModal(title, message) {
    const container = document.getElementById('modal-container');
    container.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="modal-actions">
                    <button id="modal-close" class="btn btn-primary">OK</button>
                </div>
            </div>
        </div>`;
    document.getElementById('modal-close').addEventListener('click', closeModal);
}


export function closeModal() {
    const container = document.getElementById('modal-container');
    if (container) {
        container.innerHTML = '';
    }
}

export function exportToCSV(data, filename) {
    if (!data || data.length === 0) {
        showToast("Ingen data att exportera.", "warning");
        return;
    }

    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    for (const row of data) {
        const values = headers.map(header => {
            const escaped = ('' + row[header]).replace(/"/g, '""');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}