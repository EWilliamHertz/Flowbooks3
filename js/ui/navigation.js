// js/ui/navigation.js
import { getState, setState } from '../state.js';
import { handleSignOut } from '../services/auth.js';
import { fetchAllCompanyData, fetchInitialData } from '../services/firestore.js';
import { t, applyTranslations } from '../i18n.js';
import { checkNotifications } from './notifications.js';
import { showToast, closeModal } from './utils.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-functions.js";

import { initializeCommandPalette, openCommandPalette } from './command-palette.js';
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
import { renderMailPage } from './mail.js';
import { renderMailSettingsPage } from './mail-settings.js';
import { renderProjectsPage, renderProjectDetailView, renderProjectForm } from './projects.js';
import { renderTimeTrackingPage, renderTimeEntryForm } from './timetracking.js';
import { renderTemplatesPage, renderTemplateEditor } from './templates.js';
import { renderModal } from './components.js';
import { renderPurchaseOrdersPage, renderPurchaseOrderEditor } from './purchase-orders.js';

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
    'purchaseOrders': renderPurchaseOrdersPage,
    'projects': renderProjectsPage,
    'timetracking': renderTimeTrackingPage,
    'templates': renderTemplatesPage,
    'reports': renderReportsPage,
    'mail': renderMailPage,
    'mail-settings': renderMailSettingsPage
};

const menuConfig = {
    owner: ['allCompaniesOverview', 'overview', 'summary', 'projects', 'timetracking', 'quotes', 'invoices', 'purchaseOrders', 'mail', 'income', 'expenses', 'recurring', 'templates', 'products', 'contacts', 'reports', 'import', 'team', 'settings'],
    member: ['overview', 'summary', 'projects', 'timetracking', 'quotes', 'invoices', 'purchaseOrders', 'mail', 'income', 'expenses', 'recurring', 'templates', 'products', 'contacts', 'reports', 'settings'],
    readonly: ['overview', 'summary', 'projects', 'reports'],
};

function renderSidebarMenu() {
    const { currentCompany } = getState();
    const role = currentCompany?.role || 'member';
    const allowedPages = menuConfig[role] || menuConfig.member;
    const menuItems = allowedPages.map(pageKey => {
        const translatedText = t(pageKey);
        return `<li><a href="#" data-page="${pageKey}">${translatedText}</a></li>`;
    }).join('');
    const navList = document.querySelector('.sidebar-nav ul');
    if (navList) navList.innerHTML = menuItems;
}

export function initializeAppUI() {
    updateProfileIcon();
    setupCompanySelector();
    setupEventListeners();
    initializeCommandPalette(); 
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
        if (header) header.style.display = 'none';
    } else {
        appContainer.classList.remove('portal-view');
        if (header) header.style.display = 'flex';
    }
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const link = document.querySelector(`.sidebar-nav a[data-page="${pageKey}"]`);
    if (link) link.classList.add('active');

    renderPageContent(pageKey, id);
    document.querySelector('.sidebar')?.classList.remove('open');
    
    applyTranslations();
}
window.navigateTo = navigateTo;

function renderPageContent(pageKey, id = null) {
    const pageTitleEl = document.querySelector('.page-title');
    if (pageTitleEl) pageTitleEl.dataset.i18nKey = pageKey;

    document.getElementById('main-view').innerHTML = '';
    const newItemBtn = document.getElementById('new-item-btn');
    newItemBtn.style.display = 'none';
    newItemBtn.onclick = null;

    if (pageKey === 'contacts' && id) {
        renderContactDetailView(id);
        return;
    }
    if (pageKey === 'projects' && id) {
        renderProjectDetailView(id);
        return;
    }
    if (pageKey === 'templates' && id) {
        renderTemplateEditor(id);
        return;
    }

    const renderFunction = pageRenderers[pageKey];
    if (renderFunction) renderFunction();

    const buttonSetup = {
        income: { key: 'newIncome', action: () => renderTransactionForm('income') },
        expenses: { key: 'newExpense', action: () => renderTransactionForm('expense') },
        recurring: { key: 'newRecurring', action: () => renderRecurringTransactionForm() },
        products: { key: 'newProduct', action: () => editors.renderProductForm() },
        invoices: { key: 'newInvoice', action: () => editors.renderInvoiceEditor() },
        quotes: { key: 'newQuote', action: () => editors.renderQuoteEditor() },
        purchaseOrders: { key: 'newPurchaseOrder', action: () => renderPurchaseOrderEditor() },
        projects: { key: 'newProject', action: () => renderProjectForm() },
        timetracking: { key: 'newTimeEntry', action: () => renderTimeEntryForm() },
        templates: { key: 'newTemplate', action: () => renderTemplateEditor() },
        contacts: { key: 'newContact', action: () => editors.renderContactForm() },
    };

    if (buttonSetup[pageKey]) {
        newItemBtn.dataset.i18nKey = buttonSetup[pageKey].key;
        newItemBtn.style.display = 'block';
        newItemBtn.onclick = buttonSetup[pageKey].action;
    }
}

function setupEventListeners() {
    document.querySelector('.sidebar-nav').addEventListener('click', e => {
        if (e.target.tagName === 'A' && e.target.dataset.page) {
            e.preventDefault();
            navigateTo(e.target.dataset.page);
        }
    });

    document.getElementById('main-view').addEventListener('click', e => {
        if (e.target.id === 'add-company-btn' || e.target.closest('#add-company-btn')) {
            showAddCompanyModal();
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

    document.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
            event.preventDefault();
            openCommandPalette();
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

                switch (type) {
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
                        const transaction = allTransactions.find(t => t.id === id);
                        renderModal({
                            title: t('transactionDetails'),
                            content: `
                                <p><strong>${t('date')}:</strong> ${transaction.date}</p>
                                <p><strong>${t('description')}:</strong> ${transaction.description}</p>
                                <p><strong>${t('amount')}:</strong> ${transaction.amount} kr</p>
                                <p><strong>${t('type')}:</strong> ${transaction.type === 'income' ? t('income') : t('expense')}</p>
                                <p><strong>${t('category')}:</strong> ${getState().categories.find(c => c.id === transaction.categoryId)?.name || '-'}</p>
                            `,
                            actions: [{ id: 'modal-close', text: t('close'), style: 'secondary', handler: closeModal }]
                        });
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
    selector.innerHTML = (userCompanies || []).map(c => `<option value="${c.id}" ${c.id === currentCompany.id ? 'selected' : ''}>${c.name}</option>`).join('');
    selector.addEventListener('change', async (e) => {
        const newCurrentCompany = userCompanies.find(c => c.id === e.target.value);
        setState({ currentCompany: newCurrentCompany });
        await fetchAllCompanyData();
        const currentPage = document.querySelector('.sidebar-nav a.active')?.dataset.page;
        if (currentPage) navigateTo(currentPage);
    });
}

export function showFatalError(message) {
    document.body.innerHTML = `<div class="fatal-error-container"><div class="card card-danger"><h2 class="logo">FlowBooks</h2><h3 data-i18n-key="fatalErrorTitle">${t('fatalErrorTitle')}</h3><p>${message}</p><button id="logout-btn-error" class="btn btn-primary" data-i18n-key="logout">${t('logout')}</button></div></div>`;
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

function showAddCompanyModal() {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3 data-i18n-key="addOrCreateCompany"></h3>
                <div id="create-company-section">
                    <h4 data-i18n-key="createNewCompany"></h4>
                    <div class="input-group">
                        <label data-i18n-key="newCompanyName"></label>
                        <input id="new-company-name" class="form-input" data-i18n-placeholder="companyNamePlaceholder">
                    </div>
                    <button id="create-company-btn" class="btn btn-primary" data-i18n-key="create"></button>
                </div>
                <hr style="margin: 2rem 0;">
                <div id="join-company-section">
                    <h4 data-i18n-key="joinExistingCompany"></h4>
                     <div class="input-group">
                        <label data-i18n-key="companyReferralId"></label>
                        <input id="join-company-id" class="form-input" data-i18n-placeholder="referralIdPlaceholder">
                    </div>
                    <button id="join-company-btn" class="btn btn-secondary" data-i18n-key="join"></button>
                </div>
                 <div class="modal-actions" style="margin-top: 2rem;">
                    <button id="modal-cancel" class="btn btn-secondary" data-i18n-key="cancel"></button>
                </div>
            </div>
        </div>`;

    applyTranslations();
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('create-company-btn').addEventListener('click', handleCreateCompany);
    document.getElementById('join-company-btn').addEventListener('click', handleJoinCompany);
}

async function handleCreateCompany() {
    const btn = document.getElementById('create-company-btn');
    const companyName = document.getElementById('new-company-name').value;
    if (!companyName) {
        showToast("companyNameIsRequired", "warning");
        return;
    }

    btn.disabled = true;
    btn.textContent = t('creating');

    try {
        const createNewCompanyFunc = httpsCallable(getFunctions(), 'createNewCompany');
        await createNewCompanyFunc({ companyName });
        await fetchInitialData(getState().currentUser);
        showToast("companyCreatedSuccessfully", "success");
        closeModal();
        navigateTo('allCompaniesOverview');
    } catch (error) {
        console.error("Failed to create company:", error);
        showToast("couldNotCreateCompany", "error");
        btn.disabled = false;
        btn.textContent = t('create');
    }
}

async function handleJoinCompany() {
    const btn = document.getElementById('join-company-btn');
    const companyId = document.getElementById('join-company-id').value;
    if (!companyId) {
        showToast("companyIdIsRequired", "warning");
        return;
    }

    btn.disabled = true;
    btn.textContent = t('joining');

    try {
        const joinCompanyFunc = httpsCallable(getFunctions(), 'joinCompany');
        await joinCompanyFunc({ companyId });
        await fetchInitialData(getState().currentUser);
        showToast("companyJoinedSuccessfully", "success");
        closeModal();
        navigateTo('allCompaniesOverview');
    } catch (error) {
        console.error("Failed to join company:", error);
        showToast(error.message, "error");
        btn.disabled = false;
        btn.textContent = t('join');
    }
}