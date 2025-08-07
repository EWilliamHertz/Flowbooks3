// js/ui/dashboard.js
import { getState } from '../state.js';
import { renderSpinner } from './utils.js';
import { getDocs, query, collection, where } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';

// Håller reda på skapade diagraminstanser för att kunna förstöra dem vid omritning
let monthlyChartInstance = null;
let categoryChartInstance = null;
let projectionChartInstance = null; // NYTT: Diagram för försäljningspotential

/**
 * Förbereder och aggregerar data för att passa Chart.js-formatet.
 */
function prepareChartData() {
    const { allIncomes, allExpenses, categories } = getState();

    // Data för Stapeldiagram (Intäkter vs Utgifter per månad)
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
        if (income.date) {
            const key = income.date.substring(0, 7);
            if (monthlyData[key]) monthlyData[key].income += income.amount;
        }
    });
    allExpenses.forEach(expense => {
        if (expense.date) {
            const key = expense.date.substring(0, 7);
            if (monthlyData[key]) monthlyData[key].expense += expense.amount;
        }
    });
    const incomeValues = Object.values(monthlyData).map(d => d.income);
    const expenseValues = Object.values(monthlyData).map(d => d.expense);

    // Data för Cirkeldiagram (Utgifter per kategori)
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
 * Huvudfunktion för att rendera hela dashboard-vyn.
 */
export function renderDashboard() {
    const mainView = document.getElementById('main-view');
    const { allIncomes, allExpenses, allInvoices } = getState();

    if (monthlyChartInstance) monthlyChartInstance.destroy();
    if (categoryChartInstance) categoryChartInstance.destroy();
    if (projectionChartInstance) projectionChartInstance.destroy();

    const totalIncome = allIncomes.reduce((sum, doc) => sum + doc.amount, 0);
    const totalExpense = allExpenses.reduce((sum, doc) => sum + doc.amount, 0);
    const profit = totalIncome - totalExpense;
    const totalInvoicedAmount = allInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);

    mainView.innerHTML = `
        <div class="dashboard-metrics">
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
        </div>

        <div id="sales-projection-container" class="card" style="margin-bottom: 1.5rem;"></div>

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

    const chartData = prepareChartData();
    renderMonthlyChart(chartData.monthly);
    renderCategoryChart(chartData.category);
    renderSalesProjection(totalInvoicedAmount); // Anropa den nya funktionen
}


/**
 * NY FUNKTION: Renderar den interaktiva modulen för försäljningspotential.
 * @param {number} totalSales - Den totala summan från fakturor.
 */
function renderSalesProjection(totalSales) {
    const container = document.getElementById('sales-projection-container');
    container.innerHTML = `
        <h3 class="card-title">Interaktiv Försäljningspotential</h3>
        <p>Fördela din totala fakturerade summa (${totalSales.toLocaleString('sv-SE')} kr) mellan kundtyper för att se potentiell omsättning.</p>
        <div class="projection-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: center; margin-top: 1rem;">
            <div class="projection-inputs">
                <div class="input-group">
                    <label>Andel Företag (%)</label>
                    <input type="number" id="percent-business" class="form-input" value="50">
                </div>
                <div class="input-group">
                    <label>Andel Privat (%)</label>
                    <input type="number" id="percent-private" class="form-input" value="50">
                </div>
                <div id="projection-results" style="margin-top: 1.5rem; font-size: 1.1rem;">
                    <p>Potentiell omsättning (Företag): <strong id="result-business" class="blue"></strong></p>
                    <p>Potentiell omsättning (Privat): <strong id="result-private" class="green"></strong></p>
                </div>
            </div>
            <div class="projection-chart" style="position: relative; height: 250px;">
                <canvas id="projectionPieChart"></canvas>
            </div>
        </div>`;
    
    const businessInput = document.getElementById('percent-business');
    const privateInput = document.getElementById('percent-private');

    const updateProjection = (changedInput) => {
        let businessPercent = parseFloat(businessInput.value) || 0;
        let privatePercent = parseFloat(privateInput.value) || 0;

        if (changedInput === 'business') {
            privatePercent = 100 - businessPercent;
            privateInput.value = privatePercent;
        } else {
            businessPercent = 100 - privatePercent;
            businessInput.value = businessPercent;
        }

        const businessAmount = totalSales * (businessPercent / 100);
        const privateAmount = totalSales * (privatePercent / 100);

        document.getElementById('result-business').textContent = `${businessAmount.toLocaleString('sv-SE')} kr`;
        document.getElementById('result-private').textContent = `${privateAmount.toLocaleString('sv-SE')} kr`;

        updateProjectionChart([businessAmount, privateAmount]);
    };

    businessInput.addEventListener('input', () => updateProjection('business'));
    privateInput.addEventListener('input', () => updateProjection('private'));
    
    // Initial rendering
    updateProjection('business');
}

/**
 * NY FUNKTION: Ritar och uppdaterar cirkeldiagrammet för försäljningspotential.
 * @param {number[]} data - En array med två värden: [företagssumma, privatsumma].
 */
function updateProjectionChart(data) {
    const ctx = document.getElementById('projectionPieChart').getContext('2d');
    if (projectionChartInstance) {
        projectionChartInstance.data.datasets[0].data = data;
        projectionChartInstance.update();
        return;
    }
    projectionChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Företag', 'Privat'],
            datasets: [{
                label: 'Omsättning',
                data: data,
                backgroundColor: ['rgba(74, 144, 226, 0.8)', 'rgba(46, 204, 113, 0.8)'],
                borderColor: ['rgba(74, 144, 226, 1)', 'rgba(46, 204, 113, 1)'],
                borderWidth: 1,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                }
            }
        }
    });
}


function renderMonthlyChart(data) {
    const ctx = document.getElementById('monthlyBarChart').getContext('2d');
    monthlyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Intäkter',
                data: data.incomeData,
                backgroundColor: 'rgba(46, 204, 113, 0.7)',
            }, {
                label: 'Utgifter',
                data: data.expenseData,
                backgroundColor: 'rgba(231, 76, 60, 0.7)',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });
}

function renderCategoryChart(data) {
    const ctx = document.getElementById('categoryPieChart').getContext('2d');
    categoryChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Utgifter',
                data: data.data,
                backgroundColor: ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
        }
    });
}

// Företagsportal-vyn är oförändrad
export async function renderAllCompaniesDashboard() {
    // ... (denna funktion är oförändrad)
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
