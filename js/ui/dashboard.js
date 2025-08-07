// js/ui/dashboard.js
import { getState } from '../state.js';
import { renderSpinner } from './utils.js';
import { getDocs, query, collection, where } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';

// Håller reda på skapade diagraminstanser för att kunna förstöra dem vid omritning
let monthlyChartInstance = null;
let categoryChartInstance = null;

/**
 * Förbereder och aggregerar data för att passa Chart.js-formatet.
 * @returns {object} Ett objekt innehållande data för båda diagrammen.
 */
function prepareChartData() {
    const { allIncomes, allExpenses, categories } = getState();

    // --- Data för Stapeldiagram (Intäkter vs Utgifter per månad) ---
    const monthlyData = {};
    const monthLabels = [];
    
    // Skapa etiketter för de senaste 12 månaderna
    for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const label = `${year}-${month}`;
        monthLabels.push(label);
        monthlyData[label] = { income: 0, expense: 0 };
    }

    // Aggregera intäkter per månad
    allIncomes.forEach(income => {
        if (income.date) {
            const label = income.date.substring(0, 7); // 'YYYY-MM'
            if (monthlyData[label]) {
                monthlyData[label].income += income.amount;
            }
        }
    });

    // Aggregera utgifter per månad
    allExpenses.forEach(expense => {
        if (expense.date) {
            const label = expense.date.substring(0, 7); // 'YYYY-MM'
            if (monthlyData[label]) {
                monthlyData[label].expense += expense.amount;
            }
        }
    });

    const incomeValues = monthLabels.map(label => monthlyData[label].income);
    const expenseValues = monthLabels.map(label => monthlyData[label].expense);

    // --- Data för Cirkeldiagram (Utgifter per kategori) ---
    const categoryData = {};
    allExpenses.forEach(expense => {
        const categoryId = expense.categoryId || 'uncategorized';
        categoryData[categoryId] = (categoryData[categoryId] || 0) + expense.amount;
    });

    const categoryLabels = Object.keys(categoryData).map(id => {
        if (id === 'uncategorized') return 'Okategoriserat';
        const category = categories.find(c => c.id === id);
        return category ? category.name : 'Okänd Kategori';
    });
    const categoryValues = Object.values(categoryData);

    return {
        monthly: {
            labels: monthLabels,
            incomeData: incomeValues,
            expenseData: expenseValues,
        },
        category: {
            labels: categoryLabels,
            data: categoryValues,
        }
    };
}

/**
 * Huvudfunktion för att rendera hela dashboard-vyn.
 */
export function renderDashboard() {
    const mainView = document.getElementById('main-view');
    const { allIncomes, allExpenses } = getState();

    // Förstör gamla diagraminstanser om de finns, för att undvika minnesläckor
    if (monthlyChartInstance) monthlyChartInstance.destroy();
    if (categoryChartInstance) categoryChartInstance.destroy();

    // Beräkna nyckeltal
    const totalIncome = allIncomes.reduce((sum, doc) => sum + doc.amount, 0);
    const totalExpense = allExpenses.reduce((sum, doc) => sum + doc.amount, 0);
    const profit = totalIncome - totalExpense;

    // Skapa HTML-strukturen för den nya dashboarden
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

    // Förbered data och rendera diagrammen
    const chartData = prepareChartData();
    renderMonthlyChart(chartData.monthly);
    renderCategoryChart(chartData.category);
}

/**
 * Renderar stapeldiagrammet.
 * @param {object} data - Data förberedd för stapeldiagrammet.
 */
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
                borderColor: 'rgba(46, 204, 113, 1)',
                borderWidth: 1
            }, {
                label: 'Utgifter',
                data: data.expenseData,
                backgroundColor: 'rgba(231, 76, 60, 0.7)',
                borderColor: 'rgba(231, 76, 60, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('sv-SE') + ' kr';
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renderar cirkeldiagrammet.
 * @param {object} data - Data förberedd för cirkeldiagrammet.
 */
function renderCategoryChart(data) {
    const ctx = document.getElementById('categoryPieChart').getContext('2d');
    categoryChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Utgifter',
                data: data.data,
                backgroundColor: [ // En palett med färger
                    'rgba(231, 76, 60, 0.8)',
                    'rgba(52, 152, 219, 0.8)',
                    'rgba(241, 196, 15, 0.8)',
                    'rgba(155, 89, 182, 0.8)',
                    'rgba(26, 188, 156, 0.8)',
                    'rgba(230, 126, 34, 0.8)',
                    'rgba(52, 73, 94, 0.8)'
                ],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
        }
    });
}


// Denna funktion är för företagsportalen och kan förbli oförändrad.
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
