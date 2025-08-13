// js/ui/navigation.js
import { getState, setState } from '../state.js';
import { handleSignOut } from '../services/auth.js';
import { fetchAllCompanyData } from '../services/firestore.js';
import { t } from '../i18n.js';
import { checkNotifications } from './notifications.js';

// Import all page renderers
import { renderDashboard, renderAllCompaniesDashboard } from './dashboard.js';
import { renderProductsPage } from './products.js';
import { renderTransactionsPage, renderTransactionForm } from './transactions.js';
import { renderTeamPage } from './team.js';
import { renderSettingsPage } from './settings.js';
import { renderRecurringPage, renderRecurringTransactionForm } from './recurring.js';
import { renderImportPage } from './import.js';
import { renderInvoicesPage } from './invoices.js';
import { renderReceiptsPage } from './receipts.js';
import { renderReportsPage } from './reports.js';
import { renderBankingPage } from './banking.js';
import { renderContactsPage, renderContactDetailView } from './contacts.js';
import { renderQuotesPage } from './quotes.js';
import { editors } from './editors.js';

const pageRenderers = {
    'overview': renderDashboard,
    'allCompaniesOverview': renderAllCompaniesDashboard,
    'summary': () => renderTransactionsPage('summary'),
    'income': () => renderTransactionsPage('income'),
    'expenses': () => renderTransactionsPage('expense'),
    'banking': renderBankingPage,
    'scanReceipt': renderReceiptsPage,
    'products': renderProductsPage,
    'contacts': renderContactsPage,
    'team': renderTeamPage,
    'settings': renderSettingsPage,
    'recurring': renderRecurringPage,
    'import': renderImportPage,
    'invoices': renderInvoicesPage,
    'quotes': renderQuotesPage,
    'reports': renderReportsPage,
};

const menuConfig = {
    owner: ['allCompaniesOverview', 'overview', 'summary', 'quotes', 'invoices', 'income', 'expenses', 'banking', 'scanReceipt', 'recurring', 'products', 'contacts', 'reports', 'import', 'team', 'settings'],
    member: ['overview', 'summary', 'quotes', 'invoices', 'income', 'expenses', 'banking', 'scanReceipt', 'recurring', 'products', 'contacts', 'reports', 'settings'],
    readonly: ['overview', 'summary', 'reports'],
};

function renderSidebarMenu() {
    const { currentCompany } = getState();
    const role = currentCompany?.role || 'member';
    const allowedPages = menuConfig[role] || menuConfig.member;
    const menuItems = allowedPages.map(pageKey => `<li><a href="#" data-page="${pageKey}">${t(pageKey)}</a></li>`).join('');
    const navList = document.querySelector('.sidebar-nav ul');
    if (navList) navList.innerHTML = menuItems;
}

export function initializeAppUI() {
    updateProfileIcon();
    setupCompanySelector();
    setupEventListeners();
    checkNotifications();
    navigateTo('allCompaniesOverview'); 
    document.getElementById('app-container').style.visibility = 'visible';
}

function navigateTo(pageKey, id = null) {
    const appContainer = document.getElementById('app-container');
    const header = document.querySelector('.main-header');
    renderSidebarMenu();
    if (pageKey === 'allCompaniesOverview') {
        appContainer.classList.add('portal-view');
        if(header) header.style.display = 'none';
    } else {
        appContainer.classList.remove('portal-view');
        if(header) header.style.display = 'flex';
    }
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const link = document.querySelector(`.sidebar-nav a[data-page="${pageKey}"]`);
    if (link) link.classList.add('active');
    
    renderPageContent(pageKey, id);
    document.querySelector('.sidebar')?.classList.remove('open');
}
window.navigateTo = navigateTo;

function renderPageContent(pageKey, id = null) {
    const pageTitleEl = document.querySelector('.page-title');
    if (pageTitleEl) pageTitleEl.textContent = t(pageKey);

    document.getElementById('main-view').innerHTML = ''; 
    const newItemBtn = document.getElementById('new-item-btn');
    newItemBtn.style.display = 'none';
    newItemBtn.onclick = null;
    
    if (pageKey === 'contacts' && id) {
        renderContactDetailView(id);
        return;
    }

    const renderFunction = pageRenderers[pageKey];
    if (renderFunction) renderFunction();
    
    switch (pageKey) {
        case 'income':
            newItemBtn.textContent = t('newIncome');
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => renderTransactionForm('income');
            break;
        case 'expenses':
            newItemBtn.textContent = t('newExpense');
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => renderTransactionForm('expense');
            break;
        case 'recurring':
            newItemBtn.textContent = t('newRecurring');
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => renderRecurringTransactionForm();
            break;
        case 'products':
            newItemBtn.textContent = t('newProduct');
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => editors.renderProductForm();
            break;
        case 'invoices':
            newItemBtn.textContent = t('newInvoice');
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => editors.renderInvoiceEditor();
            break;
        case 'quotes':
            newItemBtn.textContent = t('newQuote');
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => editors.renderQuoteEditor();
            break;
        case 'contacts':
            newItemBtn.textContent = t('newContact');
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => editors.renderContactForm();
            break;
    }
}

function setupEventListeners() {
    document.querySelector('.sidebar-nav').addEventListener('click', e => {
        if (e.target.tagName === 'A' && e.target.dataset.page) {
            e.preventDefault();
            navigateTo(e.target.dataset.page);
        }
    });
    document.getElementById('user-profile-icon').addEventListener('click', () => document.getElementById('profile-dropdown').classList.toggle('show'));
    document.getElementById('logout-btn').addEventListener('click', handleSignOut);
    document.getElementById('settings-link').addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('profile-dropdown').classList.remove('show');
        navigateTo('settings');
    });
    document.getElementById('hamburger-btn').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));

    const searchInput = document.getElementById('global-search-input');
    const searchResults = document.getElementById('global-search-results');
    
    searchInput.addEventListener('input', handleGlobalSearch);
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.global-search-container')) {
            searchResults.style.display = 'none';
        }
    });
}

function handleGlobalSearch() {
    const input = document.getElementById('global-search-input');
    const resultsContainer = document.getElementById('global-search-results');
    const searchTerm = input.value.toLowerCase();
    
    if (searchTerm.length < 2) {
        resultsContainer.style.display = 'none';
        return;
    }

    const { allContacts, allInvoices, allProducts, allQuotes, allTransactions } = getState();
    let resultsHtml = '';

    const contactResults = allContacts.filter(c => c.name.toLowerCase().includes(searchTerm));
    if (contactResults.length > 0) {
        resultsHtml += `<div class="search-category">${t('contacts')}</div>`;
        contactResults.forEach(c => {
            resultsHtml += `<a href="#" class="search-result-item" data-type="contact" data-id="${c.id}">${c.name}</a>`;
        });
    }

    const invoiceResults = allInvoices.filter(i => i.customerName.toLowerCase().includes(searchTerm) || String(i.invoiceNumber).includes(searchTerm));
     if (invoiceResults.length > 0) {
        resultsHtml += `<div class="search-category">${t('invoices')}</div>`;
        invoiceResults.forEach(i => {
            resultsHtml += `<a href="#" class="search-result-item" data-type="invoice" data-id="${i.id}">#${i.invoiceNumber} - ${i.customerName}</a>`;
        });
    }

    const quoteResults = allQuotes.filter(q => q.customerName.toLowerCase().includes(searchTerm) || String(q.quoteNumber).includes(searchTerm));
    if (quoteResults.length > 0) {
        resultsHtml += `<div class="search-category">${t('quotes')}</div>`;
        quoteResults.forEach(q => {
            resultsHtml += `<a href="#" class="search-result-item" data-type="quote" data-id="${q.id}">${t('quoteNumber')} #${q.quoteNumber} - ${q.customerName}</a>`;
        });
    }

    const productResults = allProducts.filter(p => p.name.toLowerCase().includes(searchTerm));
    if (productResults.length > 0) {
        resultsHtml += `<div class="search-category">${t('products')}</div>`;
        productResults.forEach(p => {
            resultsHtml += `<a href="#" class="search-result-item" data-type="product" data-id="${p.id}">${p.name}</a>`;
        });
    }

    const transactionResults = allTransactions.filter(t => t.description.toLowerCase().includes(searchTerm) || (t.party && t.party.toLowerCase().includes(searchTerm)));
    if (transactionResults.length > 0) {
        resultsHtml += `<div class="search-category">${t('summary')}</div>`;
        transactionResults.slice(0, 5).forEach(t => {
            resultsHtml += `<a href="#" class="search-result-item" data-type="transaction" data-id="${t.id}">${t.date}: ${t.description}</a>`;
        });
    }

    if (resultsHtml) {
        resultsContainer.innerHTML = resultsHtml;
        resultsContainer.style.display = 'block';
        
        resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const type = e.target.dataset.type;
                const id = e.target.dataset.id;
                
                resultsContainer.style.display = 'none';
                input.value = '';

                switch(type) {
                    case 'contact':
                        navigateTo('contacts', id);
                        break;
                    case 'invoice':
                        editors.renderInvoiceEditor(id);
                        break;
                    case 'quote':
                        editors.renderQuoteEditor(id);
                        break;
                    case 'product':
                        editors.renderProductForm(id);
                        break;
                    case 'transaction':
                        navigateTo('summary');
                        break;
                }
            });
        });

    } else {
        resultsContainer.innerHTML = `<div class="search-no-results">${t('noHits')}</div>`;
        resultsContainer.style.display = 'block';
    }
}

function updateProfileIcon() {
    const { userData } = getState();
    const profileIcon = document.getElementById('user-profile-icon');
    if (userData?.profileImageURL) {
        profileIcon.textContent = '';
        profileIcon.style.backgroundImage = `url(${userData.profileImageURL})`;
    } else {
        profileIcon.style.backgroundImage = '';
        const initial = userData?.companyName ? userData.companyName.charAt(0).toUpperCase() : '?';
        profileIcon.textContent = initial;
    }
}

function setupCompanySelector() {
    const { userCompanies, currentCompany } = getState();
    const selector = document.getElementById('company-selector');
    if (!selector) return;
    selector.innerHTML = userCompanies.map(c => `<option value="${c.id}" ${c.id === currentCompany.id ? 'selected' : ''}>${c.name}</option>`).join('');
    selector.addEventListener('change', async (e) => {
        const newCurrentCompany = userCompanies.find(c => c.id === e.target.value);
        setState({ currentCompany: newCurrentCompany });
        await fetchAllCompanyData();
        const currentPage = document.querySelector('.sidebar-nav a.active')?.dataset.page;
        if (currentPage) navigateTo(currentPage);
    });
}

export function showFatalError(message) {
    document.body.innerHTML = `<div class="fatal-error-container"><div class="card card-danger"><h2 class="logo">FlowBooks</h2><h3 data-i18n-key="fatalErrorTitle">Ett allvarligt fel har uppstått</h3><p>${message}</p><button id="logout-btn-error" class="btn btn-primary" data-i18n-key="logout">Logga ut</button></div></div>`;
    document.getElementById('logout-btn-error').addEventListener('click', handleSignOut);
}

window.switchToCompany = async (companyId) => {
    const { userCompanies } = getState();
    const newCurrentCompany = userCompanies.find(c => c.id === companyId);
    if (newCurrentCompany) {
        setState({ currentCompany: newCurrentCompany });
        await fetchAllCompanyData(); 
        document.getElementById('company-selector').value = companyId;
        navigateTo('overview');
    }
};
