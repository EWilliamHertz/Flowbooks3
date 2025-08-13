// js/ui/notifications.js
import { getState } from '../state.js';
import { showToast } from './utils.js';

const LOW_STOCK_THRESHOLD = 10;

export function checkNotifications() {
    checkOverdueInvoices();
    checkLowStock();
}

function checkOverdueInvoices() {
    const { allInvoices } = getState();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueInvoices = allInvoices.filter(invoice => {
        const dueDate = new Date(invoice.dueDate);
        return invoice.status === 'Skickad' && dueDate < today;
    });

    if (overdueInvoices.length > 0) {
        showToast(`Du har ${overdueInvoices.length} förfallna fakturor.`, 'warning');
    }
}

function checkLowStock() {
    const { allProducts } = getState();
    const lowStockProducts = allProducts.filter(product => product.stock < LOW_STOCK_THRESHOLD);

    if (lowStockProducts.length > 0) {
        showToast(`Du har ${lowStockProducts.length} produkter med lågt lagersaldo.`, 'warning');
    }
}
