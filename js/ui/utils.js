// js/ui/utils.js
// Innehåller små, återanvändbara hjälpfunktioner för UI.

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        // Lägg till en klass för att tona ut istället för att bara ta bort
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

export function renderSpinner() {
    return `<div class="spinner-container"><div class="spinner"></div></div>`;
}

export function showConfirmationModal(onConfirm, title, message) {
    const container = document.getElementById('modal-container');
    container.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="modal-actions">
                    <button id="modal-cancel" class="btn btn-secondary">Avbryt</button>
                    <button id="modal-confirm" class="btn btn-primary">Bekräfta</button>
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
