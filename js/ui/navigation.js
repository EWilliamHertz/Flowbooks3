// js/ui/navigation.js
import { getState, setState } from '../state.js';
import { handleSignOut } from '../services/auth.js';
import { fetchAllCompanyData } from '../services/firestore.js';

// Importera alla funktioner som renderar de olika sidorna i appen
import { renderDashboard, renderAllCompaniesDashboard } from './dashboard.js';
import { renderProductsPage, attachProductPageEventListeners } from './products.js';
import { renderTransactionsPage, renderTransactionForm } from './transactions.js';
import { renderTeamPage } from './team.js';
import { renderSettingsPage } from './settings.js';
import { renderRecurringPage, renderRecurringTransactionForm } from './recurring.js';
import { renderImportPage } from './import.js';
import { renderInvoicesPage, renderInvoiceEditor } from './invoices.js';
import { renderReceiptsPage } from './receipts.js';
import { renderReportsPage } from './reports.js';
import { renderBankingPage } from './banking.js';
import { renderContactsPage } from './contacts.js'; // <-- NY IMPORT

// Mappar en sid-sträng till funktionen som ska rendera den sidan.
const pageRenderers = {
    'Översikt': renderDashboard,
    'Översikt Alla Företag': renderAllCompaniesDashboard,
    'Sammanfattning': () => renderTransactionsPage('summary'),
    'Intäkter': () => renderTransactionsPage('income'),
    'Utgifter': () => renderTransactionsPage('expense'),
    'Bankavstämning': renderBankingPage,
    'Skanna Kvitto': renderReceiptsPage,
    'Produkter': renderProductsPage,
    'Kontakter': renderContactsPage, // <-- NY RAD
    'Team': renderTeamPage,
    'Inställningar': renderSettingsPage,
    'Återkommande': renderRecurringPage,
    'Importera': renderImportPage,
    'Fakturor': renderInvoicesPage,
    'Rapporter': renderReportsPage,
};

// Definierar vilka sidor som ska visas i menyn för olika användarroller.
const menuConfig = {
    owner: ['Översikt Alla Företag', 'Översikt', 'Sammanfattning', 'Fakturor', 'Intäkter', 'Utgifter', 'Bankavstämning', 'Skanna Kvitto', 'Återkommande', 'Produkter', 'Kontakter', 'Rapporter', 'Importera', 'Team', 'Inställningar'],
    member: ['Översikt', 'Sammanfattning', 'Fakturor', 'Intäkter', 'Utgifter', 'Bankavstämning', 'Skanna Kvitto', 'Återkommande', 'Produkter', 'Kontakter', 'Rapporter', 'Inställningar'],
    readonly: ['Översikt', 'Sammanfattning', 'Rapporter'],
};

function renderSidebarMenu() {
    const { currentCompany } = getState();
    const role = currentCompany?.role || 'member';
    const allowedPages = menuConfig[role] || menuConfig.member;
    const menuItems = allowedPages.map(page => `<li><a href="#" data-page="${page}">${page}</a></li>`).join('');
    const navList = document.querySelector('.sidebar-nav ul');
    if (navList) navList.innerHTML = menuItems;
}

export function initializeAppUI() {
    updateProfileIcon();
    setupCompanySelector();
    setupEventListeners();
    navigateTo('Översikt Alla Företag'); 
    document.getElementById('app-container').style.visibility = 'visible';
}

export function navigateTo(page) {
    const appContainer = document.getElementById('app-container');
    const header = document.querySelector('.main-header');
    renderSidebarMenu();
    if (page === 'Översikt Alla Företag') {
        appContainer.classList.add('portal-view');
        if(header) header.style.display = 'none';
    } else {
        appContainer.classList.remove('portal-view');
        if(header) header.style.display = 'flex';
    }
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const link = document.querySelector(`.sidebar-nav a[data-page="${page}"]`);
    if (link) {
        link.classList.add('active');
    } else {
        const defaultPage = page === 'Översikt Alla Företag' ? 'Översikt Alla Företag' : 'Översikt';
        const defaultLink = document.querySelector(`.sidebar-nav a[data-page="${defaultPage}"]`);
        if (defaultLink) defaultLink.classList.add('active');
        page = defaultPage;
    }
    renderPageContent(page);
    document.querySelector('.sidebar')?.classList.remove('open');
}

function renderPageContent(page) {
    document.querySelector('.page-title').textContent = page;
    document.getElementById('main-view').innerHTML = ''; 
    const newItemBtn = document.getElementById('new-item-btn');
    newItemBtn.style.display = 'none';
    newItemBtn.onclick = null;
    const renderFunction = pageRenderers[page];
    if (renderFunction) renderFunction();
    
    switch (page) {
        case 'Intäkter':
            newItemBtn.textContent = 'Ny Intäkt';
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => renderTransactionForm('income');
            break;
        case 'Utgifter':
            newItemBtn.textContent = 'Ny Utgift';
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => renderTransactionForm('expense');
            break;
        case 'Återkommande':
            newItemBtn.textContent = 'Ny Återkommande';
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => renderRecurringTransactionForm();
            break;
        case 'Produkter':
            newItemBtn.textContent = 'Ny Produkt';
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => attachProductPageEventListeners.renderProductForm();
            break;
        case 'Fakturor':
            newItemBtn.textContent = 'Ny Faktura';
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => renderInvoiceEditor();
            break;
        case 'Kontakter': // <-- NYTT CASE
            newItemBtn.textContent = 'Ny Kontakt';
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => window.contactFunctions.renderContactForm();
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
        navigateTo('Inställningar');
    });
    document.getElementById('hamburger-btn').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
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
        const currentPage = document.querySelector('.sidebar-nav a.active').dataset.page;
        navigateTo(currentPage);
    });
}

export function showFatalError(message) {
    document.body.innerHTML = `<div class="fatal-error-container"><div class="card card-danger"><h2 class="logo">FlowBooks</h2><h3>Ett allvarligt fel har uppstått</h3><p>${message}</p><button id="logout-btn-error" class="btn btn-primary">Logga ut</button></div></div>`;
    document.getElementById('logout-btn-error').addEventListener('click', handleSignOut);
}

window.switchToCompany = async (companyId) => {
    const { userCompanies } = getState();
    const newCurrentCompany = userCompanies.find(c => c.id === companyId);
    if (newCurrentCompany) {
        setState({ currentCompany: newCurrentCompany });
        await fetchAllCompanyData(); 
        document.getElementById('company-selector').value = companyId;
        navigateTo('Översikt');
    }
};
