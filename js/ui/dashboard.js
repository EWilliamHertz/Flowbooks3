// js/ui/dashboard.js
import { getState } from '../state.js';
import { renderSpinner } from './utils.js';
import { getDocs, query, collection, where } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';

export function renderDashboard() {
    const mainView = document.getElementById('main-view');
    const { allIncomes, allExpenses } = getState();
    const totalIncome = allIncomes.reduce((sum, doc) => sum + doc.amount, 0);
    const totalExpense = allExpenses.reduce((sum, doc) => sum + doc.amount, 0);
    const profit = totalIncome - totalExpense;
    mainView.innerHTML = `
        <div class="dashboard-grid">
            <div class="card text-center">
                <h3>Totala Intäkter</h3>
                <p class="metric-value green">${totalIncome.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</p>
            </div>
            <div class="card text-center">
                <h3>Totala Utgifter</h3>
                <p class="metric-value red">${totalExpense.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</p>
            </div>
            <div class="card text-center">
                <h3>Resultat</h3>
                <p class="metric-value ${profit >= 0 ? 'blue' : 'red'}">${profit.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</p>
            </div>
        </div>`;
}

export async function renderAllCompaniesDashboard() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = renderSpinner();
    try {
        const { userCompanies, userData } = getState();
        const companiesDataPromises = userCompanies.map(async (company) => {
            const companyId = company.id;
            const [incomesSnap, expensesSnap, productsSnap] = await Promise.all([
                getDocs(query(collection(db, 'incomes'), where('companyId', '==', companyId))),
                getDocs(query(collection(db, 'expenses'), where('companyId', '==', companyId))),
                getDocs(query(collection(db, 'products'), where('companyId', '==', companyId)))
            ]);
            const totalIncome = incomesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            const totalExpenses = expensesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            return {
                ...company,
                totalIncome,
                totalExpenses,
                netProfit: totalIncome - totalExpenses,
                productCount: productsSnap.size,
                transactionCount: incomesSnap.size + expensesSnap.size
            };
        });
        const companiesData = await Promise.all(companiesDataPromises);
        const grandTotalProfit = companiesData.reduce((sum, company) => sum + company.netProfit, 0);
        mainView.innerHTML = `
            <div class="portal-header">
                <h1 class="logo">FlowBooks</h1>
                <p>Välkommen, ${userData.firstName}. Du har tillgång till ${companiesData.length} företag.</p>
                <div class="portal-total-profit">
                    <span>Totalt Nettoresultat:</span>
                    <strong class="${grandTotalProfit >= 0 ? 'green' : 'red'}">${grandTotalProfit.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</strong>
                </div>
            </div>
            <div class="company-cards-container">
                ${companiesData.map(company => `
                    <div class="company-card" onclick="window.switchToCompany('${company.id}')">
                        <div class="company-card-header">
                            <h3>${company.name}</h3>
                            <span class="badge ${company.role === 'owner' ? 'badge-owner' : 'badge-member'}">${company.role}</span>
                        </div>
                        <div class="company-card-body">
                            <div class="stat"><span class="label">Nettoresultat</span><span class="value ${company.netProfit >= 0 ? 'green' : 'red'}">${company.netProfit.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</span></div>
                            <div class="stat"><span class="label">Intäkter</span><span class="value green">${company.totalIncome.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</span></div>
                            <div class="stat"><span class="label">Utgifter</span><span class="value red">${company.totalExpenses.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</span></div>
                        </div>
                        <div class="company-card-footer">
                            <span>${company.transactionCount} transaktioner</span>
                            <span>${company.productCount} produkter</span>
                        </div>
                    </div>`).join('')}
            </div>`;
    } catch (error) {
        console.error('Fel vid hämtning av företagsdata för portalen:', error);
        mainView.innerHTML = '<div class="card card-danger"><h3>Kunde inte ladda företagsöversikten</h3></div>';
    }
}
