// js/ui/dashboard.js
import { getState } from '../state.js';
import { renderSpinner } from './utils.js';
import { getDocs, query, collection, where } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';

// Håller reda på skapade diagraminstanser
let monthlyChartInstance = null;
let categoryChartInstance = null;
let inventoryChartInstance = null;

/**
 * Huvudfunktion för att rendera hela dashboard-vyn.
 */
export function renderDashboard() {
    // Förstör gamla diagraminstanser
    if (monthlyChartInstance) monthlyChartInstance.destroy();
    if (categoryChartInstance) categoryChartInstance.destroy();
    if (inventoryChartInstance) inventoryChartInstance.destroy();

    const { allIncomes, allExpenses, allProducts } = getState();

    // Befintliga beräkningar
    const totalIncome = allIncomes.reduce((sum, doc) => sum + doc.amount, 0);
    const totalExpense = allExpenses.reduce((sum, doc) => sum + doc.amount, 0);

    // NY BERÄKNING: Beräkna det totala potentiella värdet av lagret.
    // Vi använder "sellingPriceBusiness" som standard för denna huvudnyckeltal.
    const calculatedInventoryRevenue = allProducts.reduce((sum, p) => {
        return sum + ((p.stock || 0) * (p.sellingPriceBusiness || 0));
    }, 0);

    // NY RESULTATRÄKNING: Inkludera lagervärdet i resultatet.
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

        <div id="inventory-projection-container" class="card" style="margin-bottom: 1.5rem;"></div>

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
    renderInventoryProjection();
}

/**
 * Renderar prognosverktyget för inventariets potential.
 */
function renderInventoryProjection() {
    const { allProducts } = getState();
    const container = document.getElementById('inventory-projection-container');
    
    const totalStockValue = allProducts.reduce((sum, p) => sum + ((p.stock || 0) * (p.sellingPriceBusiness || 0)), 0);

    container.innerHTML = `
        <h3 class="card-title">Prognos för Inventarievärde</h3>
        <p>Se den potentiella försäljningen från ditt nuvarande lager (totalt värde ca ${totalStockValue.toLocaleString('sv-SE')} kr) genom att fördela försäljningen procentuellt.</p>
        <div class="projection-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: center; margin-top: 1rem;">
            <div class="projection-inputs">
                <div class="input-group">
                    <label>Andel såld till Företag (%)</label>
                    <input type="number" id="percent-business" class="form-input" value="50" min="0" max="100">
                </div>
                <div class="input-group">
                    <label>Andel såld till Privat (%)</label>
                    <input type="number" id="percent-private" class="form-input" value="50" min="0" max="100">
                </div>
                <div id="projection-results" style="margin-top: 1.5rem; font-size: 1.1rem;">
                    <p>Potentiell omsättning (Företag): <strong id="result-business" class="blue"></strong></p>
                    <p>Potentiell omsättning (Privat): <strong id="result-private" class="green"></strong></p>
                </div>
            </div>
            <div class="projection-chart" style="position: relative; height: 250px;">
                <canvas id="inventoryPieChart"></canvas>
            </div>
        </div>`;
    
    const businessInput = document.getElementById('percent-business');
    const privateInput = document.getElementById('percent-private');

    const updateProjection = (changedInput) => {
        let businessPercent = parseFloat(businessInput.value) || 0;
        let privatePercent = parseFloat(privateInput.value) || 0;

        if (changedInput === 'business') {
            if (businessPercent > 100) businessPercent = 100;
            if (businessPercent < 0) businessPercent = 0;
            privatePercent = 100 - businessPercent;
            businessInput.value = Math.round(businessPercent);
            privateInput.value = Math.round(privatePercent);
        } else {
            if (privatePercent > 100) privatePercent = 100;
            if (privatePercent < 0) privatePercent = 0;
            businessPercent = 100 - privatePercent;
            privateInput.value = Math.round(privatePercent);
            businessInput.value = Math.round(businessPercent);
        }

        let totalBusinessValue = 0;
        let totalPrivateValue = 0;
        allProducts.forEach(product => {
            const stock = product.stock || 0;
            const businessPrice = product.sellingPriceBusiness || 0;
            const privatePrice = product.sellingPricePrivate || 0;
            const businessUnits = stock * (businessPercent / 100);
            const privateUnits = stock * (privatePercent / 100);
            totalBusinessValue += businessUnits * businessPrice;
            totalPrivateValue += privateUnits * privatePrice;
        });

        document.getElementById('result-business').textContent = `${totalBusinessValue.toLocaleString('sv-SE')} kr`;
        document.getElementById('result-private').textContent = `${totalPrivateValue.toLocaleString('sv-SE')} kr`;
        updateInventoryChart([totalBusinessValue, totalPrivateValue]);
    };

    businessInput.addEventListener('input', () => updateProjection('business'));
    privateInput.addEventListener('input', () => updateProjection('private'));
    updateProjection('business');
}

/**
 * Ritar och uppdaterar cirkeldiagrammet för inventarieprognosen.
 */
function updateInventoryChart(data) {
    const ctx = document.getElementById('inventoryPieChart').getContext('2d');
    if (inventoryChartInstance) {
        inventoryChartInstance.data.datasets[0].data = data;
        inventoryChartInstance.update();
        return;
    }
    inventoryChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Företag', 'Privat'],
            datasets: [{
                label: 'Potentiell Omsättning',
                data: data,
                backgroundColor: ['rgba(74, 144, 226, 0.8)', 'rgba(46, 204, 113, 0.8)'],
                borderColor: ['rgba(74, 144, 226, 1)', 'rgba(46, 204, 113, 1)'],
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            if (context.parsed !== null) {
                                label += new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(context.parsed);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
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
