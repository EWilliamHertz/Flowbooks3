// js/ui/reports.js
import { getState } from '../state.js';
import { t } from '../i18n.js';

export function renderReportsPage() {
    const { allIncomes, allExpenses, allProducts, allContacts, allInvoices } = getState();
    const mainView = document.getElementById('main-view');

    // Momsrapport
    const totalSalesInclVat = allIncomes.reduce((sum, t) => sum + t.amount, 0);
    const outgoingVatTotal = totalSalesInclVat - (totalSalesInclVat / 1.25);
    const totalSalesExclVat = totalSalesInclVat / 1.25;
    const vatRates = [25, 12, 6, 0];
    let incomingVatTotal = 0;
    const incomingVatByRate = vatRates.reduce((acc, rate) => {
        if (rate === 0) return acc;
        const expensesForRate = allExpenses.filter(e => e.vatRate === rate);
        const totalExclVatForRate = expensesForRate.reduce((sum, e) => sum + e.amountExclVat, 0);
        const vatForRate = expensesForRate.reduce((sum, e) => sum + e.vatAmount, 0);
        incomingVatTotal += vatForRate;
        acc[rate] = { base: totalExclVatForRate, vat: vatForRate };
        return acc;
    }, {});
    const vatToPayOrReceive = outgoingVatTotal - incomingVatTotal;

    // Förenklat årsbokslut
    const totalRevenue = totalSalesExclVat;
    const totalCosts = allExpenses.reduce((sum, t) => sum + t.amountExclVat, 0);
    const profitBeforeTax = totalRevenue - totalCosts;

    // Lagerrapport
    const inventoryReport = allProducts.map(p => `
        <tr>
            <td>${p.name}</td>
            <td class="text-right">${p.stock}</td>
            <td class="text-right">${(p.purchasePrice || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</td>
            <td class="text-right">${((p.stock || 0) * (p.purchasePrice || 0)).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</td>
        </tr>
    `).join('');
    const totalInventoryValue = allProducts.reduce((sum, p) => sum + (p.stock || 0) * (p.purchasePrice || 0), 0);

    // Kundrapport
    const customerReport = allContacts.filter(c => c.type === 'customer').map(c => {
        const customerInvoices = allInvoices.filter(i => i.customerName === c.name && i.status === 'Betald');
        const totalBilled = customerInvoices.reduce((sum, i) => sum + i.grandTotal, 0);
        return { name: c.name, totalBilled };
    }).sort((a,b) => b.totalBilled - a.totalBilled).map(c => `
        <tr>
            <td>${c.name}</td>
            <td class="text-right">${c.totalBilled.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</td>
        </tr>
    `).join('');

    mainView.innerHTML = `
        <div class="settings-grid">
            <div class="card">
                <h3>${t('reportsVAT')}</h3>
                <p>${t('vatReportInfo')}</p>
                <div class="report-result">
                    <h4>${t('outgoingVat')}</h4>
                    <p><span>${t('totalSalesExclVat')}</span> <strong>${totalSalesExclVat.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                    <p><span>${t('calculatedOutgoingVat', { vatRate: 25 })}</span> <strong class="red">${outgoingVatTotal.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                    <hr>
                    <h4>${t('incomingVat')}</h4>
                    ${Object.keys(incomingVatByRate).map(rate => `
                        <p><span>${t('vatBasisForRate', { vatRate: rate })}</span> <strong>${(incomingVatByRate[rate].base || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                        <p><span>${t('incomingVatForRate', { vatRate: rate })}</span> <strong class="green">${(incomingVatByRate[rate].vat || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                    `).join('')}
                    <hr>
                    <p><span><strong>${t('totalIncomingVat')}</strong></span> <strong class="green">${incomingVatTotal.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                    <hr>
                    <h4>${t('vatResult')}</h4>
                    <p><span><strong>${t('vatResultValue')}</strong></span> <strong style="font-size: 1.2em;" class="${vatToPayOrReceive >= 0 ? 'red' : 'green'}">${vatToPayOrReceive.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})} ${vatToPayOrReceive >= 0 ? t('toPay') : t('toReceiveBack')}</strong></p>
                </div>
            </div>
            <div class="card">
                <h3>${t('reportsProfit')}</h3>
                <p>${t('profitReportInfo')}</p>
                 <div class="report-result">
                    <h4>${t('incomeStatement')}</h4>
                    <p><span>${t('totalOperatingIncome')}</span> <strong>${totalRevenue.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                    <p><span>${t('totalOperatingCosts')}</span> <strong class="red">${totalCosts.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                    <hr>
                    <p><span><strong>${t('profitBeforeFinancials')}</strong></span> <strong>${profitBeforeTax.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                 </div>
            </div>
            <div class="card" style="grid-column: 1 / -1;">
                <h3>${t('reportsInventory')}</h3>
                <table class="data-table">
                    <thead><tr><th>${t('inventoryTableProduct')}</th><th class="text-right">${t('inventoryTableStock')}</th><th class="text-right">${t('inventoryTablePurchasePrice')}</th><th class="text-right">${t('inventoryTableTotalValue')}</th></tr></thead>
                    <tbody>${inventoryReport}</tbody>
                    <tfoot><tr><td colspan="3" class="text-right"><strong>${t('totalInventoryValue')}</strong></td><td class="text-right"><strong>${totalInventoryValue.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></td></tr></tfoot>
                </table>
            </div>
            <div class="card" style="grid-column: 1 / -1;">
                <h3>${t('reportsCustomer')}</h3>
                <table class="data-table">
                    <thead><tr><th>${t('customerReportTableCustomer')}</th><th class="text-right">${t('customerReportTableTotalBilled')}</th></tr></thead>
                    <tbody>${customerReport}</tbody>
                </table>
            </div>
        </div>
    `;
}