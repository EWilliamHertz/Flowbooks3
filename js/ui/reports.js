// js/ui/reports.js
import { getState } from '../state.js';

export function renderReportsPage() {
    const { allIncomes, allExpenses } = getState();
    const mainView = document.getElementById('main-view');

    // Beräkningar för momsrapport
    const totalSalesInclVat = allIncomes.reduce((sum, t) => sum + t.amount, 0);

    // Utgående moms (förenklad, antar att all försäljning har 25% moms)
    // En mer avancerad version skulle titta på varje intäktspost
    const outgoingVatTotal = totalSalesInclVat - (totalSalesInclVat / 1.25);
    const totalSalesExclVat = totalSalesInclVat / 1.25;

    // Ingående moms från utgifter
    const vatRates = [25, 12, 6, 0];
    let incomingVatTotal = 0;
    const incomingVatByRate = vatRates.reduce((acc, rate) => {
        if (rate === 0) return acc;
        const expensesForRate = allExpenses.filter(e => e.vatRate === rate);
        const totalExclVatForRate = expensesForRate.reduce((sum, e) => sum + e.amountExclVat, 0);
        const vatForRate = expensesForRate.reduce((sum, e) => sum + e.vatAmount, 0);
        incomingVatTotal += vatForRate;
        acc[rate] = {
            base: totalExclVatForRate,
            vat: vatForRate,
        };
        return acc;
    }, {});
    
    const vatToPayOrReceive = outgoingVatTotal - incomingVatTotal;

    // Beräkningar för förenklat årsbokslut
    const totalRevenue = totalSalesExclVat; // Intäkter är försäljning exklusive moms
    const totalCosts = allExpenses.reduce((sum, t) => sum + t.amountExclVat, 0); // Kostnader är inköp exklusive moms
    const profitBeforeTax = totalRevenue - totalCosts;

    mainView.innerHTML = `
        <div class="settings-grid">
            <div class="card">
                <h3>Momsrapport (Underlag)</h3>
                <p>Detta är en förenklad sammanställning för hela den registrerade perioden. Konsultera alltid med en redovisningsekonom för korrekt momsredovisning.</p>
                <div class="report-result">
                    <h4>Utgående moms (moms på din försäljning)</h4>
                    <p><span>Total försäljning (exkl. moms):</span> <strong>${totalSalesExclVat.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                    <p><span>Beräknad utgående moms (25%):</span> <strong class="red">${outgoingVatTotal.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                    <hr>
                    <h4>Ingående moms (avdragsgill moms på dina inköp)</h4>
                    ${Object.keys(incomingVatByRate).map(rate => `
                        <p><span>Underlag för ${rate}% moms:</span> <strong>${(incomingVatByRate[rate].base || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                        <p><span>Ingående moms (${rate}%):</span> <strong class="green">${(incomingVatByRate[rate].vat || 0).toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                    `).join('')}
                    <hr>
                    <p><span><strong>Total ingående moms:</strong></span> <strong class="green">${incomingVatTotal.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                    <hr>
                    <h4>Att betala / få tillbaka</h4>
                    <p><span><strong>Resultat:</strong></span> <strong style="font-size: 1.2em;" class="${vatToPayOrReceive >= 0 ? 'red' : 'green'}">${vatToPayOrReceive.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})} ${vatToPayOrReceive >= 0 ? '(att betala)' : '(att få tillbaka)'}</strong></p>
                </div>
            </div>
            <div class="card">
                <h3>Förenklat Årsbokslut (Underlag)</h3>
                <p>Detta är ett underlag baserat på dina registrerade transaktioner. Värdeminskningar, periodiseringar och andra justeringar är inte medräknade.</p>
                 <div class="report-result">
                    <h4>Resultaträkning</h4>
                    <p><span>Summa rörelsens intäkter:</span> <strong>${totalRevenue.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                    <p><span>Summa rörelsens kostnader:</span> <strong class="red">${totalCosts.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                    <hr>
                    <p><span><strong>Rörelseresultat före finansiella poster:</strong></span> <strong>${profitBeforeTax.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</strong></p>
                 </div>
            </div>
        </div>
    `;
}
