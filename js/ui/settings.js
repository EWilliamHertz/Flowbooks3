// js/ui/settings.js
import { getState, setState } from '../state.js';
import { showToast, closeModal, showConfirmationModal } from './utils.js';
import { updateDoc, doc, deleteDoc, addDoc, collection } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-storage.js";
import { db, storage, auth } from '../../firebase-config.js';
import { fetchAllCompanyData, fetchInitialData } from '../services/firestore.js';
import { renderMailSettingsPage } from './mail-settings.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-functions.js";
import { t } from '../i18n.js';

export function renderSettingsPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="settings-container">
            <div class="settings-tabs">
                <button class="tab-link active" data-tab="company-settings">${t('company')}</button>
                <button class="tab-link" data-tab="invoice-settings">${t('invoicesAndQuotes')}</button>
                <button class="tab-link" data-tab="email-settings">${t('email')}</button>
                <button class="tab-link" data-tab="dashboard-settings">${t('overview')}</button>
                <button class="tab-link" data-tab="account-settings">${t('account')}</button>
            </div>
            <div id="company-settings" class="tab-content active"></div>
            <div id="invoice-settings" class="tab-content"></div>
            <div id="email-settings" class="tab-content"></div>
            <div id="dashboard-settings" class="tab-content"></div>
            <div id="account-settings" class="tab-content"></div>
        </div>
    `;

    renderCompanySettings();
    renderInvoiceSettings();
    renderEmailSettings();
    renderDashboardSettingsView();
    renderAccountSettings();

    document.querySelectorAll('.tab-link').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.tab-link, .tab-content').forEach(el => el.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(button.dataset.tab).classList.add('active');
        });
    });
}

function renderCompanySettings() {
    const { currentCompany } = getState();
    const isOwner = currentCompany.role === 'owner';
    const dangerZoneHTML = isOwner ? `
        <div class="card card-danger">
            <h3>${t('dangerZone')}</h3>
            <p>${t('dangerZoneDescription')}</p>
            <button id="delete-company-btn" class="btn btn-danger" style="margin-top: 1rem;">${t('deleteThisCompany')}</button>
        </div>
    ` : '';
    document.getElementById('company-settings').innerHTML = `
        <div class="settings-grid">
            <div class="card">
                <h3>${t('companyInformation')}</h3>
                <div class="input-group">
                    <label>${t('companyName')}</label>
                    <input id="setting-company" class="form-input" value="${currentCompany.name || ''}">
                </div>
                <div class="input-group">
                    <label>${t('organizationNumber')}</label>
                    <input id="setting-org-number" class="form-input" value="${currentCompany.orgNumber || ''}" placeholder="Eg. 556677-8899">
                </div>
                 <div class="input-group">
                    <label>${t('bankgiroNumber')}</label>
                    <input id="setting-bankgiro" class="form-input" value="${currentCompany.bankgiro || ''}" placeholder="Eg. 123-4567">
                </div>
                <button id="save-company" class="btn btn-primary">${t('saveCompanyInfo')}</button>
            </div>
            <div class="card">
                <h3>${t('companyLogo')}</h3>
                <p>${t('usedOnInvoices')}</p>
                <div class="input-group"><label>${t('uploadFile')}</label><input type="file" id="logo-upload" accept="image/*"></div>
                <div class="input-group"><label>${t('pasteImageLink')}</label><input id="logo-url" class="form-input" placeholder="https://..." value="${currentCompany.logoUrl || ''}"></div>
                <button id="save-logo" class="btn btn-primary">${t('saveLogo')}</button>
            </div>
             <div class="card">
                <h3>${t('expenseCategories')}</h3>
                <p>${t('manageExpenseCategories')}</p>
                <button id="manage-categories-btn" class="btn btn-secondary" style="margin-top: 1rem;">${t('manageCategories')}</button>
            </div>
            ${dangerZoneHTML}
        </div>
    `;
    document.getElementById('save-company').addEventListener('click', saveCompanyInfo);
    document.getElementById('save-logo').addEventListener('click', saveCompanyLogo);
    document.getElementById('manage-categories-btn').addEventListener('click', renderCategoryManagerModal);
    if (isOwner) {
        document.getElementById('delete-company-btn').addEventListener('click', handleDeleteCompany);
    }
}

function renderInvoiceSettings() {
    const { currentCompany } = getState();
    document.getElementById('invoice-settings').innerHTML = `
        <div class="settings-grid">
             <div class="card">
                <h3>${t('defaultInvoiceText')}</h3>
                <p>${t('defaultInvoiceTextDescription')}</p>
                <div class="input-group"><textarea id="setting-invoice-text" class="form-input" rows="4">${currentCompany.defaultInvoiceText || ''}</textarea></div>
                <button id="save-invoice-text" class="btn btn-primary">${t('saveDefaultText')}</button>
            </div>
            <div class="card">
                <h3>${t('invoiceReminderSettings')}</h3>
                <p>${t('invoiceReminderSettingsDescription')}</p>
                <div id="reminder-settings-container"></div>
                <button id="save-reminder-settings" class="btn btn-primary" style="margin-top: 1rem;">${t('saveReminderSettings')}</button>
            </div>
        </div>
    `;
    renderReminderSettings();
    document.getElementById('save-invoice-text').addEventListener('click', saveInvoiceDefaultText);
    document.getElementById('save-reminder-settings').addEventListener('click', saveReminderSettings);
}

function renderEmailSettings() {
    document.getElementById('email-settings').innerHTML = `
        <div class="card" style="max-width: 600px; margin: auto;">
            <h3>${t('emailClientSettings')}</h3>
            <p>${t('emailClientSettingsDescription')}</p>
            <button id="manage-mail-btn" class="btn btn-secondary" style="margin-top: 1rem;">${t('manageEmailAccounts')}</button>
        </div>
    `;
    document.getElementById('manage-mail-btn').addEventListener('click', renderMailSettingsPage);
}

function renderDashboardSettingsView() {
    document.getElementById('dashboard-settings').innerHTML = `
        <div class="card">
            <h3>${t('overviewSettings')}</h3>
            <p>${t('overviewSettingsDescription')}</p>
            <div id="dashboard-settings-container"></div>
            <button id="save-dashboard-settings" class="btn btn-primary" style="margin-top: 1rem;">${t('saveOverviewSettings')}</button>
        </div>
    `;
    renderDashboardSettings();
    document.getElementById('save-dashboard-settings').addEventListener('click', saveDashboardSettings);
}

function renderAccountSettings() {
    document.getElementById('account-settings').innerHTML = `
        <div class="card card-danger" style="max-width: 600px; margin: auto;">
            <h3>${t('deleteAccount')}</h3>
            <p>${t('deleteAccountDescription')}</p>
            <button id="delete-account" class="btn btn-danger">${t('deleteMyAccount')}</button>
        </div>
    `;
    document.getElementById('delete-account').addEventListener('click', deleteAccount);
}


function renderReminderSettings() {
    const { currentCompany } = getState();
    const container = document.getElementById('reminder-settings-container');
    const settings = currentCompany.reminderSettings || {};

    container.innerHTML = `
        <div class="form-check" style="margin-bottom: 1rem;">
            <input type="checkbox" id="reminder-enabled" ${settings.enabled ? 'checked' : ''}>
            <label for="reminder-enabled"><strong>${t('enableAutomaticReminders')}</strong></label>
        </div>
        <div class="input-group">
            <input type="checkbox" id="reminder-before" ${settings.before ? 'checked' : ''}>
            <label for="reminder-before">${t('send')} <input type="number" id="reminder-days-before" value="${settings.daysBefore || 3}" style="width: 60px;"> ${t('daysBeforeDueDate')}</label>
        </div>
        <div class="input-group">
            <input type="checkbox" id="reminder-on" ${settings.on ? 'checked' : ''}>
            <label for="reminder-on">${t('sendOnDueDate')}</label>
        </div>
        <div class="input-group">
            <input type="checkbox" id="reminder-after" ${settings.after ? 'checked' : ''}>
            <label for="reminder-after">${t('send')} <input type="number" id="reminder-days-after" value="${settings.daysAfter || 7}" style="width: 60px;"> ${t('daysAfterDueDate')}</label>
        </div>
    `;
}

async function saveReminderSettings() {
    const btn = document.getElementById('save-reminder-settings');
    const { currentCompany } = getState();

    const newSettings = {
        enabled: document.getElementById('reminder-enabled').checked,
        before: document.getElementById('reminder-before').checked,
        daysBefore: parseInt(document.getElementById('reminder-days-before').value) || 3,
        on: document.getElementById('reminder-on').checked,
        after: document.getElementById('reminder-after').checked,
        daysAfter: parseInt(document.getElementById('reminder-days-after').value) || 7,
    };
    
    btn.disabled = true;
    btn.textContent = t('saving');

    try {
        await updateDoc(doc(db, 'companies', currentCompany.id), { reminderSettings: newSettings });
        setState({ currentCompany: { ...currentCompany, reminderSettings: newSettings } });
        showToast('reminderSettingsSaved', 'success');
    } catch (error) {
        console.error("Fel vid sparning av påminnelseinställningar:", error);
        showToast("couldNotSaveSettings", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = t('saveReminderSettings');
    }
}

function renderDashboardSettings() {
    const { currentCompany } = getState();
    const container = document.getElementById('dashboard-settings-container');
    
    const allWidgets = {
        metrics: 'keyFigures',
        cashFlow: 'cashFlowForecast',
        categoryExpenses: 'expensesByCategory',
        incomeVsExpense: 'incomeVsExpenses',
        unpaidInvoices: 'unpaidInvoices',
        topProducts: 'topSellingProducts'
    };

    const currentSettings = currentCompany.dashboardSettings || {
        metrics: true, cashFlow: true, categoryExpenses: true,
        incomeVsExpense: true, unpaidInvoices: false, topProducts: false
    };

    let settingsHtml = '';
    for (const key in allWidgets) {
        settingsHtml += `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" value="${key}" id="check-${key}" ${currentSettings[key] ? 'checked' : ''}>
                <label class="form-check-label" for="check-${key}">
                    ${t(allWidgets[key])}
                </label>
            </div>
        `;
    }
    container.innerHTML = settingsHtml;
}

async function saveDashboardSettings() {
    const btn = document.getElementById('save-dashboard-settings');
    const { currentCompany } = getState();
    const newSettings = {};
    
    document.querySelectorAll('#dashboard-settings-container input[type="checkbox"]').forEach(checkbox => {
        newSettings[checkbox.value] = checkbox.checked;
    });

    btn.disabled = true;
    btn.textContent = t('saving');

    try {
        await updateDoc(doc(db, 'companies', currentCompany.id), { dashboardSettings: newSettings });
        setState({ currentCompany: { ...currentCompany, dashboardSettings: newSettings } });
        showToast('overviewSettingsSaved', 'success');
    } catch (error) {
        console.error("Fel vid sparning av översiktsinställningar:", error);
        showToast("couldNotSaveSettings", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = t('saveOverviewSettings');
    }
}

async function saveInvoiceDefaultText() {
    const btn = document.getElementById('save-invoice-text');
    const defaultText = document.getElementById('setting-invoice-text').value;
    const { currentCompany } = getState();

    btn.disabled = true;
    btn.textContent = t('saving');

    try {
        await updateDoc(doc(db, 'companies', currentCompany.id), { defaultInvoiceText: defaultText });
        setState({ currentCompany: { ...currentCompany, defaultInvoiceText: defaultText } });
        showToast('defaultInvoiceTextSaved', 'success');
    } catch (error) {
        console.error("Fel vid sparning av standardtext:", error);
        showToast("couldNotSaveText", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = t('saveDefaultText');
    }
}

function renderCategoryManagerModal() {
    const { categories } = getState();
    const categoryItems = categories.map(cat => `
        <li class="category-manager-item" data-id="${cat.id}">
            <span>${cat.name}</span>
            <div class="actions">
                <button class="btn btn-sm btn-secondary btn-edit-cat">${t('edit')}</button>
                <button class="btn btn-sm btn-danger btn-delete-cat">${t('delete')}</button>
            </div>
        </li>
    `).join('');

    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>${t('manageExpenseCategories')}</h3>
                <p>${t('addEditDeleteCategories')}</p>
                
                <ul class="category-manager-list">
                    ${categoryItems.length > 0 ? categoryItems : `<li class="category-manager-item">${t('noCategoriesAdded')}</li>`}
                </ul>

                <div class="category-manager-add-form">
                    <div class="input-group">
                        <input id="new-category-name" class="form-input" placeholder="${t('newCategoryName')}">
                    </div>
                    <button id="add-category-btn" class="btn btn-primary">${t('add')}</button>
                </div>

                <div class="modal-actions" style="margin-top: 1.5rem;">
                    <button id="modal-close" class="btn btn-secondary">${t('close')}</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-container').innerHTML = modalHtml;
    document.getElementById('modal-close').addEventListener('click', closeModal);

    const addBtn = document.getElementById('add-category-btn');
    addBtn.addEventListener('click', () => handleSaveCategory(addBtn));

    document.querySelectorAll('.btn-edit-cat').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.closest('.category-manager-item');
            const categoryId = item.dataset.id;
            const category = categories.find(c => c.id === categoryId);
            const newName = prompt(t('enterNewCategoryName'), category.name);
            if (newName && newName.trim() !== "") {
                handleSaveCategory(e.target, categoryId, newName.trim());
            }
        });
    });

    document.querySelectorAll('.btn-delete-cat').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.closest('.category-manager-item');
            const categoryId = item.dataset.id;
            handleDeleteCategory(categoryId);
        });
    });
}

async function handleSaveCategory(btnElement, categoryId = null, newName = null) {
    const { currentCompany } = getState();
    const nameInput = document.getElementById('new-category-name');
    const name = newName || nameInput.value.trim();

    if (!name) {
        showToast("categoryNameCannotBeEmpty", "warning");
        return;
    }
    
    const originalText = btnElement.textContent;
    btnElement.disabled = true;
    btnElement.textContent = t('saving');

    const data = { name: name, companyId: currentCompany.id };

    try {
        if (categoryId) {
            await updateDoc(doc(db, 'categories', categoryId), { name: name });
        } else {
            await addDoc(collection(db, 'categories'), data);
        }
        
        await fetchAllCompanyData();
        renderCategoryManagerModal();
        showToast("categorySaved", "success");
        if (!categoryId && nameInput) nameInput.value = '';

    } catch (error) {
        console.error("Kunde inte spara kategori:", error);
        showToast("couldNotSaveCategory", "error");
    } finally {
        btnElement.disabled = false;
        btnElement.textContent = originalText;
    }
}

function handleDeleteCategory(categoryId) {
    showConfirmationModal(async () => {
        try {
            await deleteDoc(doc(db, 'categories', categoryId));
            await fetchAllCompanyData();
            renderCategoryManagerModal();
            showToast("categoryDeleted", "success");
        } catch (error) {
            console.error("Kunde inte radera kategori:", error);
            showToast("couldNotDeleteCategory", "error");
        }
    }, "deleteCategory", "confirmDeleteCategory");
}

async function saveCompanyInfo() {
    const btn = document.getElementById('save-company');
    const { currentUser, currentCompany } = getState();
    const newName = document.getElementById('setting-company').value;
    const newOrgNumber = document.getElementById('setting-org-number').value;
    const newBankgiro = document.getElementById('setting-bankgiro').value;

    if (!newName) {
        showToast("companyNameCannotBeEmpty", "warning");
        return;
    }
    
    btn.disabled = true;
    btn.textContent = t('saving');

    try {
        const dataToUpdate = { name: newName, orgNumber: newOrgNumber, bankgiro: newBankgiro };
        await updateDoc(doc(db, 'companies', currentCompany.id), dataToUpdate);
        await updateDoc(doc(db, 'users', currentUser.uid), { companyName: newName });
        
        setState({ 
            currentCompany: { ...currentCompany, name: newName, orgNumber: newOrgNumber, bankgiro: newBankgiro },
            userData: { ...getState().userData, companyName: newName }
        });
        document.dispatchEvent(new Event('stateUpdated'));
        showToast('companyInfoSaved', 'success');
    } catch (error) {
        console.error("Fel vid sparning:", error);
        showToast("couldNotSaveChanges", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = t('saveCompanyInfo');
    }
}

async function saveCompanyLogo() {
    const btn = document.getElementById('save-logo');
    const fileInput = document.getElementById('logo-upload');
    const urlInput = document.getElementById('logo-url');
    const file = fileInput.files[0];
    const url = urlInput.value.trim();
    const { currentCompany } = getState();
    let logoUrl = '';

    btn.disabled = true;
    btn.textContent = t('saving');

    try {
        if (file) {
            const storageRef = ref(storage, `company_logos/${currentCompany.id}/${file.name}`);
            await uploadBytes(storageRef, file);
            logoUrl = await getDownloadURL(storageRef);
        } else if (url) {
            if (!url.match(/\.(jpeg|jpg|gif|png)$/)) {
                showToast("invalidImageLink", "error");
                return;
            }
            logoUrl = url;
        } else {
            logoUrl = currentCompany.logoUrl || '';
        }
        await updateDoc(doc(db, 'companies', currentCompany.id), { logoUrl: logoUrl });
        setState({ currentCompany: { ...currentCompany, logoUrl: logoUrl } });
        showToast('logoSaved', 'success');
    } catch (error) {
        console.error("Kunde inte spara logotyp:", error);
        showToast("couldNotSaveLogo", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = t('saveLogo');
    }
}

async function deleteAccount() {
    showConfirmationModal(async () => {
        try {
            const { currentUser } = getState();
            await auth.currentUser.delete();
            showToast("accountDeleted", "info");
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Fel vid borttagning:", error);
            showToast("couldNotDeleteAccount", "error");
        }
    }, "deleteAccount", "confirmDeleteAccount", 'DELETE');
}

function handleDeleteCompany() {
    const { currentCompany } = getState();
    showConfirmationModal(async () => {
        const btn = document.getElementById('delete-company-btn');
        btn.disabled = true;
        btn.textContent = 'Deleting...';

        try {
            const deleteCompanyFunc = httpsCallable(getFunctions(), 'deleteCompany');
            await deleteCompanyFunc({ companyId: currentCompany.id });
            
            showToast("companyDeleted", "success");
            
            await fetchInitialData(getState().currentUser);
            window.navigateTo('allCompaniesOverview');

        } catch (error) {
            console.error("Failed to delete company:", error);
            showToast(error.message, "error");
            btn.disabled = false;
            btn.textContent = t('deleteThisCompany');
        }

    }, "deleteCompany", "confirmDeleteCompany", currentCompany.name);
}