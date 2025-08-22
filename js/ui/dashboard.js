// js/ui/dashboard.js
import { getState } from '../state.js';
import { renderSpinner } from './utils.js';
import { getDocs, query, collection, where } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';
import { t } from '../i18n.js';

let chartInstances = {};

// Main function to render the entire dashboard
export function renderDashboard() {
    Object.values(chartInstances).forEach(chart => chart?.destroy());
    chartInstances = {};

    const { currentCompany } = getState();
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div id="dashboard-container" class="dashboard-layout"></div>`;

    const settings = currentCompany.dashboardSettings || {
        metrics: true, cashFlow: true, categoryExpenses: true,
        incomeVsExpense: true, unpaidInvoices: true, topProducts: true
    };

    const container = document.getElementById('dashboard-container');
    container.innerHTML = ''; // Clear before building

    if (settings.metrics) {
        container.innerHTML += renderMetricsWidget();
    }
    if (settings.unpaidInvoices) {
        container.innerHTML += renderUnpaidInvoicesWidget();
    }
    if (settings.topProducts) {
        container.innerHTML += renderTopProductsWidget();
    }
    if (settings.cashFlow) {
        container.innerHTML += renderChartWidget('cashFlowChart', t('cashFlowForecast6Months'));
    }
    if (settings.categoryExpenses) {
        container.innerHTML += renderChartWidget('categoryPieChart', t('expensesByCategory'));
    }
    if (settings.incomeVsExpense) {
        container.innerHTML += renderChartWidget('monthlyBarChart', t('incomeVsExpenses12Months'), 'full-width');
    }
    
    // Render charts after their canvas elements are in the DOM
    setTimeout(() => {
        if (settings.cashFlow) renderCashFlowChart();
        if (settings.categoryExpenses) renderCategoryPieChart();
        if (settings.incomeVsExpense) renderMonthlyBarChart();
    }, 0);
}

// ---- WIDGET RENDERERS ----

function renderMetricsWidget() {
    const { allIncomes, allExpenses, allProducts, allInvoices, allBills, currentCompany } = getState();
    const totalIncome = allIncomes.reduce((sum, doc) => sum + doc.amount, 0);
    const totalExpense = allExpenses.reduce((sum, doc) => sum + doc.amount, 0);

    const unpaidInvoiceBalance = allInvoices
        .filter(inv => inv.status !== 'Betald' && inv.status !== 'Utkast')
        .reduce((sum, inv) => sum + inv.balance, 0);

    const unpaidBillsBalance = allBills
        .filter(bill => bill.status !== 'Betald')
        .reduce((sum, bill) => sum + bill.balance, 0);

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
    
    const projectedProfit = (totalIncome + calculatedInventoryRevenue + unpaidInvoiceBalance) - (totalExpense + unpaidBillsBalance);

    // Using a generic currency format that adapts to the user's locale
    const formatCurrency = (amount) => amount.toLocaleString(undefined, { style: 'currency', currency: 'SEK' });

    return `
        <div class="dashboard-widget metrics-widget">
            <div class="card text-center">
                <h3>${t('totalIncome')}</h3>
                <p class="metric-value green">${formatCurrency(totalIncome)}</p>
            </div>
            <div class="card text-center">
                <h3>${t('calculatedInventoryValue')}</h3>
                <p class="metric-value green">${formatCurrency(calculatedInventoryRevenue)}</p>
            </div>
            <div class="card text-center">
                <h3>${t('totalExpenses')}</h3>
                <p class="metric-value red">${formatCurrency(totalExpense)}</p>
            </div>
            <div class="card text-center">
                <h3>${t('projectedProfit')}</h3>
                <p class="metric-value ${projectedProfit >= 0 ? 'blue' : 'red'}">${formatCurrency(projectedProfit)}</p>
            </div>
        </div>
    `;
}

function renderUnpaidInvoicesWidget() {
    const { allInvoices } = getState();
    const unpaid = allInvoices.filter(inv => inv.status === 'Skickad' || inv.status === 'Förfallen').sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const formatCurrency = (amount) => amount.toLocaleString(undefined, { style: 'currency', currency: 'SEK' });

    const rows = unpaid.slice(0, 5).map(inv => `
        <div class="list-item">
            <span>#${inv.invoiceNumber} - ${inv.customerName}</span>
            <span class="${new Date(inv.dueDate) < new Date() ? 'red' : ''}">${inv.dueDate}</span>
            <span class="text-right"><strong>${formatCurrency(inv.grandTotal)}</strong></span>
        </div>
    `).join('');
    
    return `
        <div class="dashboard-widget">
            <div class="card">
                <h3 class="card-title">${t('unpaidInvoices')}</h3>
                <div class="widget-list">
                    ${unpaid.length > 0 ? rows : `<p class="text-center">${t('noUnpaidInvoices')}</p>`}
                </div>
            </div>
        </div>
    `;
}

function renderTopProductsWidget() {
    const { allInvoices, allProducts } = getState();
    const productSales = {};
    const formatCurrency = (amount) => amount.toLocaleString(undefined, { style: 'currency', currency: 'SEK' });

    allInvoices.forEach(invoice => {
        if (invoice.status === 'Betald') {
            invoice.items.forEach(item => {
                if (item.productId) {
                    if (!productSales[item.productId]) {
                        productSales[item.productId] = { quantity: 0, revenue: 0 };
                    }
                    productSales[item.productId].quantity += item.quantity;
                    productSales[item.productId].revenue += item.quantity * item.price;
                }
            });
        }
    });

    const topProducts = Object.entries(productSales)
        .sort(([,a],[,b]) => b.revenue - a.revenue)
        .slice(0, 5)
        .map(([productId, sales]) => {
            const product = allProducts.find(p => p.id === productId);
            return {
                name: product ? product.name : t('unknownProduct'),
                ...sales
            };
        });

    const rows = topProducts.map(p => `
         <div class="list-item">
            <span>${p.name}</span>
            <span>${p.quantity} st</span>
            <span class="text-right"><strong>${formatCurrency(p.revenue)}</strong></span>
        </div>
    `).join('');

    return `
        <div class="dashboard-widget">
            <div class="card">
                <h3 class="card-title">${t('topSellingProducts')}</h3>
                <div class="widget-list">
                     ${topProducts.length > 0 ? rows : `<p class="text-center">${t('noSalesData')}</p>`}
                </div>
            </div>
        </div>
    `;
}

function renderChartWidget(canvasId, title, extraClass = '') {
    return `
        <div class="dashboard-widget ${extraClass}">
            <div class="card chart-container">
                <h3 class="card-title">${title}</h3>
                <canvas id="${canvasId}"></canvas>
            </div>
        </div>
    `;
}

// ---- CHART RENDERERS ----

function prepareChartData() {
    const { allIncomes, allExpenses, categories, recurringTransactions, allInvoices, allBills } = getState();
    
    const monthlyData = {};
    const monthLabels = Array.from({length: 12}, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (11 - i));
        const label = d.toLocaleString(document.documentElement.lang, { month: 'short', year: '2-digit' });
        const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        monthlyData[key] = { income: 0, expense: 0 };
        return label;
    });

    allIncomes.forEach(income => {
        const key = income.date?.substring(0, 7);
        if (monthlyData[key]) monthlyData[key].income += income.amount;
    });
    allExpenses.forEach(expense => {
        const key = expense.date?.substring(0, 7);
        if (monthlyData[key]) monthlyData[key].expense += expense.amount;
    });

    const categoryData = {};
    allExpenses.forEach(expense => {
        const categoryId = expense.categoryId || 'uncategorized';
        categoryData[categoryId] = (categoryData[categoryId] || 0) + expense.amount;
    });
    const categoryLabels = Object.keys(categoryData).map(id => 
        id === 'uncategorized' ? t('uncategorized') : categories.find(c => c.id === id)?.name || t('unknown'));
    
    const cashFlowLabels = [];
    const cashFlowData = { income: [], expense: [] };
    const now = new Date();

    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        cashFlowLabels.push(d.toLocaleString(document.documentElement.lang, { month: 'short' }));
        const monthKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;

        let monthlyIncome = recurringTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        let monthlyExpense = recurringTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

        allInvoices.forEach(inv => {
            if (inv.status !== 'Betald' && inv.status !== 'Utkast' && inv.dueDate) {
                const dueDateKey = inv.dueDate.substring(0, 7);
                if (dueDateKey === monthKey) {
                    monthlyIncome += inv.balance;
                }
            }
        });

        allBills.forEach(bill => {
            if (bill.status !== 'Betald' && bill.dueDate) {
                const dueDateKey = bill.dueDate.substring(0, 7);
                if (dueDateKey === monthKey) {
                    monthlyExpense += bill.balance;
                }
            }
        });
        
        cashFlowData.income.push(monthlyIncome);
        cashFlowData.expense.push(monthlyExpense);
    }

    return {
        monthly: { labels: monthLabels, incomeData: Object.values(monthlyData).map(d => d.income), expenseData: Object.values(monthlyData).map(d => d.expense) },
        category: { labels: categoryLabels, data: Object.values(categoryData) },
        cashFlow: { labels: cashFlowLabels, data: cashFlowData }
    };
}

function renderMonthlyBarChart() {
    const data = prepareChartData();
    const ctx = document.getElementById('monthlyBarChart')?.getContext('2d');
    if (ctx) {
        chartInstances.monthly = new Chart(ctx, {
            type: 'bar',
            data: { labels: data.monthly.labels, datasets: [{ label: t('income'), data: data.monthly.incomeData, backgroundColor: 'rgba(46, 204, 113, 0.7)' }, { label: t('expenses'), data: data.monthly.expenseData, backgroundColor: 'rgba(231, 76, 60, 0.7)' }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }
}

function renderCategoryPieChart() {
    const data = prepareChartData();
    const ctx = document.getElementById('categoryPieChart')?.getContext('2d');
    if (ctx) {
        chartInstances.category = new Chart(ctx, {
            type: 'pie',
            data: { labels: data.category.labels, datasets: [{ label: t('expenses'), data: data.category.data, backgroundColor: ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'], hoverOffset: 4 }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

function renderCashFlowChart() {
    const data = prepareChartData();
    const ctx = document.getElementById('cashFlowChart')?.getContext('2d');
    if(ctx) {
        chartInstances.cashFlow = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.cashFlow.labels,
                datasets: [
                    { label: t('projectedIncome'), data: data.cashFlow.data.income, borderColor: 'rgba(46, 204, 113, 1)', backgroundColor: 'rgba(46, 204, 113, 0.2)', fill: true, tension: 0.3 },
                    { label: t('projectedExpenses'), data: data.cashFlow.data.expense, borderColor: 'rgba(231, 76, 60, 1)', backgroundColor: 'rgba(231, 76, 60, 0.2)', fill: true, tension: 0.3 }
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
        const formatCurrency = (amount) => amount.toLocaleString(undefined, { style: 'currency', currency: 'SEK' });
        
        const companiesDataPromises = (userCompanies || []).map(async (company) => {
            const companyId = company.id;
            const [incomesSnap, expensesSnap, productsSnap, invoicesSnap, billsSnap] = await Promise.all([
                getDocs(query(collection(db, 'incomes'), where('companyId', '==', companyId))),
                getDocs(query(collection(db, 'expenses'), where('companyId', '==', companyId))),
                getDocs(query(collection(db, 'products'), where('companyId', '==', companyId))),
                getDocs(query(collection(db, 'invoices'), where('companyId', '==', companyId))),
                getDocs(query(collection(db, 'bills'), where('companyId', '==', companyId)))
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

            const unpaidInvoiceBalance = invoicesSnap.docs
                .map(d => d.data())
                .filter(inv => inv.status !== 'Betald' && inv.status !== 'Utkast')
                .reduce((sum, inv) => sum + inv.balance, 0);

            const unpaidBillsBalance = billsSnap.docs
                .map(d => d.data())
                .filter(bill => bill.status !== 'Betald')
                .reduce((sum, bill) => sum + bill.balance, 0);

            return {
                ...company,
                totalIncome,
                totalExpenses,
                inventoryValue,
                projectedProfit: (totalIncome + inventoryValue + unpaidInvoiceBalance) - (totalExpenses + unpaidBillsBalance),
                productCount: productsSnap.size,
                transactionCount: incomesSnap.size + expensesSnap.size
            };
        });

        const companiesData = await Promise.all(companiesDataPromises);
        const grandTotalProjectedProfit = companiesData.reduce((sum, company) => sum + company.projectedProfit, 0);
        
        mainView.innerHTML = `
            <div class="portal-header">
                <h1 class="logo">FlowBooks</h1>
                <p>${t('welcomeUser').replace('{firstName}', userData.firstName).replace('{companyCount}', companiesData.length)}</p>
                <div class="portal-total-profit">
                    <span>${t('totalProjectedProfit')}</span>
                    <strong class="${grandTotalProjectedProfit >= 0 ? 'green' : 'red'}">${formatCurrency(grandTotalProjectedProfit)}</strong>
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
                            <div class="stat"><span class="label">${t('projectedProfit')}</span><span class="value ${company.projectedProfit >= 0 ? 'green' : 'red'}">${formatCurrency(company.projectedProfit)}</span></div>
                            <div class="stat"><span class="label">${t('income')}</span><span class="value green">${formatCurrency(company.totalIncome)}</span></div>
                             <div class="stat"><span class="label">${t('inventoryValue')}</span><span class="value green">${formatCurrency(company.inventoryValue)}</span></div>
                            <div class="stat"><span class="label">${t('expenses')}</span><span class="value red">${formatCurrency(company.totalExpenses)}</span></div>
                        </div>
                        <div class="company-card-footer">
                            <span>${t('transactionsCount').replace('{count}', company.transactionCount)}</span>
                            <span>${t('productsCount').replace('{count}', company.productCount)}</span>
                        </div>
                    </div>`).join('')}
                 <div class="company-card add-company-card" id="add-company-btn" style="align-items: center; justify-content: center; text-align: center; cursor: pointer;">
                     <h3 style="font-size: 2.5rem; margin: 0;">+</h3>
                     <p style="margin-top: 0.5rem;">${t('addNewCompany')}</p>
                 </div>
            </div>`;
    } catch (error) {
        console.error('Error fetching company data for portal:', error);
        mainView.innerHTML = `<div class="card card-danger"><h3>${t('couldNotLoadCompanyOverview')}</h3></div>`;
    }
}