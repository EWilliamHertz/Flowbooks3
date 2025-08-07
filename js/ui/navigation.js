// js/ui/navigation.js
// Hanterar all sidnavigering och rendering av sidinnehåll.
import { getState, setState } from '../state.js';
import { handleSignOut } from '../services/auth.js';
import { fetchAllCompanyData } from '../services/firestore.js';

import { renderDashboard, renderAllCompaniesDashboard } from './dashboard.js';
import { renderProductsPage, attachProductPageEventListeners } from './products.js';
// KORRIGERING HÄR: Tog bort felaktiga 'from'
import { renderTransactionsPage, renderTransactionForm } from './transactions.js';
import { renderTeamPage } from './team.js';
import { renderSettingsPage } from './settings.js';
import { renderRecurringPage, renderRecurringTransactionForm } from './recurring.js';
import { renderImportPage } from './import.js';

// Karta över sidor och deras renderingsfunktioner
const pageRenderers = {
    'Översikt': renderDashboard,
    'Översikt Alla Företag': renderAllCompaniesDashboard,
    'Sammanfattning': () => renderTransactionsPage('summary'),
    'Intäkter': () => renderTransactionsPage('income'),
    'Utgifter': () => renderTransactionsPage('expense'),
    'Produkter': renderProductsPage,
    'Team': renderTeamPage,
    'Inställningar': renderSettingsPage,
    'Återkommande': renderRecurringPage,
    'Importera': renderImportPage,
    'Fakturor': () => renderPlaceholderPage('Fakturor'),
    'Rapporter': () => renderPlaceholderPage('Rapporter'),
};

function renderPlaceholderPage(title) {
    document.getElementById('main-view').innerHTML = `
        <div class="card">
            <h3 class="card-title">${title}</h3>
            <p>Denna sektion är under utveckling.</p>
        </div>`;
}

// Initierar UI när appen har laddat all nödvändig data.
export function initializeAppUI() {
    updateProfileIcon();
    setupCompanySelector();
    setupEventListeners();
    navigateTo('Översikt'); // Starta på huvuddashboarden
    document.getElementById('app-container').style.visibility = 'visible';
}

// Funktion för att byta sida
export function navigateTo(page) {
    const appContainer = document.getElementById('app-container');
    const header = document.querySelector('.main-header');
    
    if (page === 'Översikt Alla Företag') {
        appContainer.classList.add('portal-view');
        header.style.display = 'none';
    } else {
        appContainer.classList.remove('portal-view');
        header.style.display = 'flex';
    }

    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const link = document.querySelector(`.sidebar-nav a[data-page="${page}"]`);
    if (link) link.classList.add('active');
    
    renderPageContent(page);
    document.querySelector('.sidebar')?.classList.remove('open');
}

// Renderar innehållet för den valda sidan
function renderPageContent(page) {
    document.querySelector('.page-title').textContent = page;
    document.getElementById('main-view').innerHTML = ''; 
    
    const newItemBtn = document.getElementById('new-item-btn');
    newItemBtn.style.display = 'none';
    newItemBtn.onclick = null;

    const renderFunction = pageRenderers[page];
    if (renderFunction) {
        renderFunction();
    } else {
        renderPlaceholderPage(page);
    }
    
    // Setup new item button after page content is rendered
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
    }
}

// Sätter upp alla globala event listeners
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

// Uppdaterar profilbilden/initialen
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

// Sätter upp företagsväljaren
function setupCompanySelector() {
    const { userCompanies, currentCompany } = getState();
    const selector = document.getElementById('company-selector');
    selector.innerHTML = userCompanies.map(c => `<option value="${c.id}" ${c.id === currentCompany.id ? 'selected' : ''}>${c.name}</option>`).join('');
    selector.addEventListener('change', async (e) => {
        const newCurrentCompany = userCompanies.find(c => c.id === e.target.value);
        setState({ currentCompany: newCurrentCompany });
        await fetchAllCompanyData();
        renderPageContent(document.querySelector('.sidebar-nav a.active').dataset.page);
    });
}

// Visar ett allvarligt fel som blockerar appen
export function showFatalError(message) {
    document.body.innerHTML = `
        <div class="fatal-error-container">
            <div class="card card-danger">
                <h2 class="logo">FlowBooks</h2>
                <h3>Ett allvarligt fel har uppstått</h3>
                <p>${message}</p>
                <button id="logout-btn-error" class="btn btn-primary">Logga ut</button>
            </div>
        </div>`;
    document.getElementById('logout-btn-error').addEventListener('click', handleSignOut);
}

// Gör funktionen globalt tillgänglig så den kan anropas från HTML-onclick i portalvyn
window.switchToCompany = (companyId) => {
    const { userCompanies } = getState();
    const newCurrentCompany = userCompanies.find(c => c.id === companyId);
    if (newCurrentCompany) {
        setState({ currentCompany: newCurrentCompany });
        document.getElementById('company-selector').value = companyId;
        navigateTo('Översikt');
    }
};
