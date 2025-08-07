// js/ui/dashboard.js
import { getState } from '../state.js';
import { renderSpinner } from './utils.js';
import { getDocs, query, collection, where } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';

// Håller reda på skapade diagraminstanser
let monthlyChartInstance = null;
let categoryChartInstance = null;

/**
 * Huvudfunktion för att rendera hela dashboard-vyn.
 */
export function renderDashboard() {
    // Förstör gamla diagraminstanser för att undvika minnesläckor
    if (monthlyChartInstance) monthlyChartInstance.destroy();
    if (categoryChartInstance) categoryChartInstance.destroy();

    const { allIncomes, allExpenses, allProducts, currentCompany } = getState();

    // Befintliga beräkningar
    const totalIncome = allIncomes.reduce((sum, doc) => sum + doc.amount, 0);
    const totalExpense = allExpenses.reduce((sum, doc) => sum + doc.amount, 0);

    // NY, KORREKT BERÄKNING:
    // Hämta den sparade procentuella fördelningen från företagsinställningarna.
    // Använd 60% för privatkunder som standardvärde om inget är sparat.
    const privateSplitPercent = currentCompany.inventoryProjectionSplit || 60;
    const businessSplitPercent = 100 - privateSplitPercent;
    
    // Beräkna det totala potentiella värdet av lagret baserat på den sparade fördelningen.
    let calculatedInventoryRevenue = 0;
    allProducts.forEach(product => {
        const stock = product.stock || 0;
        const businessPrice = product.sellingPriceBusiness || 0;
        const privatePrice = product.sellingPricePrivate || 0;
        
        const businessValue = stock * (businessSplitPercent / 100) * businessPrice;
        const privateValue = stock * (privateSplitPercent / 100) * privatePrice;
        
        calculatedInventoryRevenue += businessValue + privateValue;
    });

    // Uppdaterad resultatberäkning som inkluderar det nya lagervärdet.
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
                <h3 class="card-title">Intäkter vs Utgifter (Senaste 12 mån)</h3>
                <canvas id="monthlyBarChart"></canvas>
            </div>
            <div class="card chart-container">
                <h3 class="card-title">Utgifter per Kategori</h3>
                <canvas id="categoryPieChart"></canvas>
            </div>
        </div>
    `;

    renderMonthlyAndCategoryCharts();
}

/**
 * Förbereder data för de primära diagrammen.
 */
function prepareChartData() {
    const { allIncomes, allExpenses, categories } = getState();
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
    return {
        monthly: { labels: monthLabels, incomeData: incomeValues, expenseData: expenseValues },
        category: { labels: categoryLabels, data: categoryValues }
    };
}

/**
 * Funktion för att rita de andra diagrammen.
 */
function renderMonthlyAndCategoryCharts() {
    const data = prepareChartData();
    const monthlyCtx = document.getElementById('monthlyBarChart')?.getContext('2d');
    if (monthlyCtx) {
        monthlyChartInstance = new Chart(monthlyCtx, {
            type: 'bar',
            data: { labels: data.monthly.labels, datasets: [{ label: 'Intäkter', data: data.monthly.incomeData, backgroundColor: 'rgba(46, 204, 113, 0.7)' }, { label: 'Utgifter', data: data.monthly.expenseData, backgroundColor: 'rgba(231, 76, 60, 0.7)' }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }

    const categoryCtx = document.getElementById('categoryPieChart')?.getContext('2d');
    if (categoryCtx) {
        categoryChartInstance = new Chart(categoryCtx, {
            type: 'pie',
            data: { labels: data.category.labels, datasets: [{ label: 'Utgifter', data: data.category.data, backgroundColor: ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'], hoverOffset: 4 }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

/**
 * Renderar företagsportalen för användare med flera företag.
 */
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
