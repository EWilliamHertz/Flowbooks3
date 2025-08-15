// js/ui/dashboard.js
import { getState } from '../state.js';
import { renderSpinner } from './utils.js';
import { getDocs, query, collection, where } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';

let monthlyChartInstance = null;
let categoryChartInstance = null;
let cashFlowChartInstance = null;

export function renderDashboard() {
    if (monthlyChartInstance) monthlyChartInstance.destroy();
    if (categoryChartInstance) categoryChartInstance.destroy();
    if (cashFlowChartInstance) cashFlowChartInstance.destroy();

    const { allIncomes, allExpenses, allProducts, currentCompany } = getState();

    const totalIncome = allIncomes.reduce((sum, doc) => sum + doc.amount, 0);
    const totalExpense = allExpenses.reduce((sum, doc) => sum + doc.amount, 0);

    const privateSplitPercent = currentCompany.inventoryProjectionSplit || 60;
    const businessSplitPercent = 100 - privateSplitPercent;

    let calculatedInventoryRevenue = 0;
    allProducts.forEach(product => {
        const stock = product.stock || 0;
        const businessPrice = product.sellingPriceBusiness || 0;
        const privatePrice = product.sellingPricePrivate || 0;

        const businessValue = stock * (businessSplitPercent / 100) * businessPrice;
        const privateValue = stock * (privateSplitPercent / 100) * privatePrice;

        calculatedInventoryRevenue += businessValue + privateValue;
    });

    const projectedProfit = (totalIncome + calculatedInventoryRevenue) - totalExpense;

    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="dashboard-metrics">
            <div class="card text-center">
                <h3>Totala Intäkter</h3>
                <p class="metric-value green">${totalIncome.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</p>
            </div>
            
            <div class="card text-center">
                <h3>Beräknat Lagervärde</h3>
                <p class="metric-value green">${calculatedInventoryRevenue.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</p>
            </div>

            <div class="card text-center">
                <h3>Totala Utgifter</h3>
                <p class="metric-value red">${totalExpense.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</p>
            </div>

            <div class="card text-center" style="grid-column: 1 / -1;">
                <h3>Projicerat Resultat (inkl. lagervärde)</h3>
                <p class="metric-value ${projectedProfit >= 0 ? 'blue' : 'red'}">${projectedProfit.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</p>
            </div>
        </div>

        <div class="dashboard-charts">
            <div class="card chart-container">
                <h3 class="card-title">Kassaflödesprognos (Nästa 6 mån)</h3>
                <canvas id="cashFlowChart"></canvas>
            </div>
            <div class="card chart-container">
                <h3 class="card-title">Utgifter per Kategori</h3>
                <canvas id="categoryPieChart"></canvas>
            </div>
            <div class="card chart-container" style="grid-column: 1 / -1;">
                <h3 class="card-title">Intäkter vs Utgifter (Senaste 12 mån)</h3>
                <canvas id="monthlyBarChart"></canvas>
            </div>
        </div>
    `;

    renderAllCharts();
}

function prepareChartData() {
    const { allIncomes, allExpenses, categories, recurringTransactions } = getState();
    
    // Monthly income/expense data
    const monthlyData = {};
    const monthLabels = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const label = d.toLocaleString('sv-SE', { month: 'short', year: '2-digit' });
        monthLabels.push(label);
        const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        monthlyData[key] = { income: 0, expense: 0 };
    }
    allIncomes.forEach(income => {
        const key = income.date?.substring(0, 7);
        if (monthlyData[key]) monthlyData[key].income += income.amount;
    });
    allExpenses.forEach(expense => {
        const key = expense.date?.substring(0, 7);
        if (monthlyData[key]) monthlyData[key].expense += expense.amount;
    });
    const incomeValues = Object.values(monthlyData).map(d => d.income);
    const expenseValues = Object.values(monthlyData).map(d => d.expense);

    // Category data
    const categoryData = {};
    allExpenses.forEach(expense => {
        const categoryId = expense.categoryId || 'uncategorized';
        categoryData[categoryId] = (categoryData[categoryId] || 0) + expense.amount;
    });
    const categoryLabels = Object.keys(categoryData).map(id => {
        if (id === 'uncategorized') return 'Okategoriserat';
        return categories.find(c => c.id === id)?.name || 'Okänd Kategori';
    });
    const categoryValues = Object.values(categoryData);

    // Cash flow data
    const cashFlowLabels = [];
    const cashFlowData = { income: [], expense: [] };
    for (let i = 0; i < 6; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() + i);
        cashFlowLabels.push(d.toLocaleString('sv-SE', { month: 'short' }));
        
        const recurringIncome = recurringTransactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);
            
        const recurringExpense = recurringTransactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);

        cashFlowData.income.push(recurringIncome);
        cashFlowData.expense.push(recurringExpense);
    }

    return {
        monthly: { labels: monthLabels, incomeData: incomeValues, expenseData: expenseValues },
        category: { labels: categoryLabels, data: categoryValues },
        cashFlow: { labels: cashFlowLabels, data: cashFlowData }
    };
}

function renderAllCharts() {
    const data = prepareChartData();

    // Monthly Bar Chart
    const monthlyCtx = document.getElementById('monthlyBarChart')?.getContext('2d');
    if (monthlyCtx) {
        monthlyChartInstance = new Chart(monthlyCtx, {
            type: 'bar',
            data: { labels: data.monthly.labels, datasets: [{ label: 'Intäkter', data: data.monthly.incomeData, backgroundColor: 'rgba(46, 204, 113, 0.7)' }, { label: 'Utgifter', data: data.monthly.expenseData, backgroundColor: 'rgba(231, 76, 60, 0.7)' }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }

    // Category Pie Chart
    const categoryCtx = document.getElementById('categoryPieChart')?.getContext('2d');
    if (categoryCtx) {
        categoryChartInstance = new Chart(categoryCtx, {
            type: 'pie',
            data: { labels: data.category.labels, datasets: [{ label: 'Utgifter', data: data.category.data, backgroundColor: ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'], hoverOffset: 4 }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // Cash Flow Line Chart
    const cashFlowCtx = document.getElementById('cashFlowChart')?.getContext('2d');
    if(cashFlowCtx) {
        cashFlowChartInstance = new Chart(cashFlowCtx, {
            type: 'line',
            data: {
                labels: data.cashFlow.labels,
                datasets: [
                    {
                        label: 'Prognostiserade intäkter',
                        data: data.cashFlow.data.income,
                        borderColor: 'rgba(46, 204, 113, 1)',
                        backgroundColor: 'rgba(46, 204, 113, 0.2)',
                        fill: true,
                        tension: 0.3
                    },
                    {
                        label: 'Prognostiserade utgifter',
                        data: data.cashFlow.data.expense,
                        borderColor: 'rgba(231, 76, 60, 1)',
                        backgroundColor: 'rgba(231, 76, 60, 0.2)',
                        fill: true,
                        tension: 0.3
                    }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }
}

export async function renderAllCompaniesDashboard() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = renderSpinner();
    try {
        const { userCompanies, userData } = getState();
        const companiesDataPromises = (userCompanies || []).map(async (company) => {
            const companyId = company.id;
            const [incomesSnap, expensesSnap, productsSnap] = await Promise.all([
                getDocs(query(collection(db, 'incomes'), where('companyId', '==', companyId))),
                getDocs(query(collection(db, 'expenses'), where('companyId', '==', companyId))),
                getDocs(query(collection(db, 'products'), where('companyId', '==', companyId)))
            ]);
            const totalIncome = incomesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            const totalExpenses = expensesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            
            let inventoryValue = 0;
            const privateSplitPercent = company.inventoryProjectionSplit || 60;
            const businessSplitPercent = 100 - privateSplitPercent;
            productsSnap.docs.forEach(doc => {
                const product = doc.data();
                const stock = product.stock || 0;
                const businessPrice = product.sellingPriceBusiness || 0;
                const privatePrice = product.sellingPricePrivate || 0;
                const businessValue = stock * (businessSplitPercent / 100) * businessPrice;
                const privateValue = stock * (privateSplitPercent / 100) * privatePrice;
                inventoryValue += businessValue + privateValue;
            });

            return {
                ...company,
                totalIncome,
                totalExpenses,
                inventoryValue,
                projectedProfit: (totalIncome + inventoryValue) - totalExpenses,
                productCount: productsSnap.size,
                transactionCount: incomesSnap.size + expensesSnap.size
            };
        });

        const companiesData = await Promise.all(companiesDataPromises);
        const grandTotalProjectedProfit = companiesData.reduce((sum, company) => sum + company.projectedProfit, 0);
        
        mainView.innerHTML = `
            <div class="portal-header">
                <h1 class="logo">FlowBooks</h1>
                <p>Välkommen, ${userData.firstName}. Du har tillgång till ${companiesData.length} företag.</p>
                <div class="portal-total-profit">
                    <span>Totalt Projicerat Resultat (inkl. lagervärde):</span>
                    <strong class="${grandTotalProjectedProfit >= 0 ? 'green' : 'red'}">${grandTotalProjectedProfit.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</strong>
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
                            <div class="stat"><span class="label">Projicerat Resultat</span><span class="value ${company.projectedProfit >= 0 ? 'green' : 'red'}">${company.projectedProfit.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</span></div>
                            <div class="stat"><span class="label">Intäkter</span><span class="value green">${company.totalIncome.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</span></div>
                             <div class="stat"><span class="label">Lagervärde</span><span class="value green">${company.inventoryValue.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</span></div>
                            <div class="stat"><span class="label">Utgifter</span><span class="value red">${company.totalExpenses.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</span></div>
                        </div>
                        <div class="company-card-footer">
                            <span>${company.transactionCount} transaktioner</span>
                            <span>${company.productCount} produkter</span>
                        </div>
                    </div>`).join('')}
                 <div class="company-card add-company-card" id="add-company-btn" style="align-items: center; justify-content: center; text-align: center; cursor: pointer;">
                     <h3 style="font-size: 2.5rem; margin: 0;">+</h3>
                     <p style="margin-top: 0.5rem;">Add New Company</p>
                 </div>
            </div>`;
    } catch (error) {
        console.error('Fel vid hämtning av företagsdata för portalen:', error);
        mainView.innerHTML = '<div class="card card-danger"><h3>Kunde inte ladda företagsöversikten</h3></div>';
    }
}