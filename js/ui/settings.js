// js/ui/settings.js
import { getState, setState } from '../state.js';
import { showToast, closeModal, showConfirmationModal } from './utils.js';
import { updateDoc, doc, deleteDoc, addDoc, collection } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-storage.js";
import { db, storage, auth } from '../../firebase-config.js';
import { fetchAllCompanyData } from '../services/firestore.js';

export function renderSettingsPage() {
    const { currentCompany } = getState();
    const mainView = document.getElementById('main-view'); // <-- DENNA RAD SAKNADES
    mainView.innerHTML = `
        <div class="settings-grid">
            <div class="card">
                <h3>Företagsinformation</h3>
                <div class="input-group">
                    <label>Företagsnamn</label>
                    <input id="setting-company" class="form-input" value="${currentCompany.name || ''}">
                </div>
                <div class="input-group">
                    <label>Organisationsnummer</label>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <input id="setting-org-number" class="form-input" value="${currentCompany.orgNumber || ''}" placeholder="T.ex. 556677-8899" style="flex-grow: 1;">
                        <button id="copy-org-number" class="btn btn-sm btn-secondary" title="Kopiera till urklipp">📋</button>
                    </div>
                </div>
                <button id="save-company" class="btn btn-primary">Spara Företagsinfo</button>
            </div>

            <div class="card">
                <h3>Utgiftskategorier</h3>
                <p>Hantera de kategorier som används för att klassificera dina utgifter.</p>
                <button id="manage-categories-btn" class="btn btn-secondary" style="margin-top: 1rem;">Hantera Kategorier</button>
            </div>

            <div class="card">
                <h3>Företagslogotyp</h3>
                <p>Används på fakturor.</p>
                <div class="input-group">
                    <label>Ladda upp fil</label>
                    <input type="file" id="logo-upload" accept="image/*">
                </div>
                 <div class="input-group">
                    <label>Eller klistra in bildlänk</label>
                    <input id="logo-url" class="form-input" placeholder="https://..." value="${currentCompany.logoUrl || ''}">
                </div>
                <button id="save-logo" class="btn btn-primary">Spara Logotyp</button>
            </div>
            
            <div class="card">
                <h3>Standardtext för Fakturor</h3>
                <p>Denna text (t.ex. betalningsvillkor) läggs automatiskt till på alla nya fakturor.</p>
                <div class="input-group">
                    <textarea id="setting-invoice-text" class="form-input" rows="4" placeholder="T.ex. Betalning inom 30 dagar. Dröjsmålsränta enligt lag.">${currentCompany.defaultInvoiceText || ''}</textarea>
                </div>
                <button id="save-invoice-text" class="btn btn-primary">Spara Standardtext</button>
            </div>

            <div class="card card-danger">
                <h3>Ta bort konto</h3>
                <p>Din användare raderas permanent. Företagsdata påverkas inte.</p>
                <button id="delete-account" class="btn btn-danger">Ta bort mitt konto</button>
            </div>
        </div>`;

    document.getElementById('save-company').addEventListener('click', saveCompanyInfo);
    document.getElementById('save-logo').addEventListener('click', saveCompanyLogo);
    document.getElementById('delete-account').addEventListener('click', deleteAccount);
    document.getElementById('manage-categories-btn').addEventListener('click', renderCategoryManagerModal);
    document.getElementById('copy-org-number').addEventListener('click', copyOrgNumber);
    document.getElementById('save-invoice-text').addEventListener('click', saveInvoiceDefaultText);
}

function copyOrgNumber() {
    const orgNumberInput = document.getElementById('setting-org-number');
    navigator.clipboard.writeText(orgNumberInput.value).then(() => {
        showToast("Organisationsnummer kopierat!", "success");
    }).catch(err => {
        showToast("Kunde inte kopiera.", "error");
    });
}

async function saveInvoiceDefaultText() {
    const btn = document.getElementById('save-invoice-text');
    const defaultText = document.getElementById('setting-invoice-text').value;
    const { currentCompany } = getState();

    btn.disabled = true;
    btn.textContent = 'Sparar...';

    try {
        await updateDoc(doc(db, 'companies', currentCompany.id), { defaultInvoiceText: defaultText });
        setState({ currentCompany: { ...currentCompany, defaultInvoiceText: defaultText } });
        showToast('Standardtext för fakturor har sparats!', 'success');
    } catch (error) {
        console.error("Fel vid sparning av standardtext:", error);
        showToast("Kunde inte spara texten.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Spara Standardtext';
    }
}

function renderCategoryManagerModal() {
    const { categories } = getState();
    const categoryItems = categories.map(cat => `
        <li class="category-manager-item" data-id="${cat.id}">
            <span>${cat.name}</span>
            <div class="actions">
                <button class="btn btn-sm btn-secondary btn-edit-cat">Redigera</button>
                <button class="btn btn-sm btn-danger btn-delete-cat">Ta bort</button>
            </div>
        </li>
    `).join('');

    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>Hantera Utgiftskategorier</h3>
                <p>Lägg till, ändra eller ta bort kategorier.</p>
                
                <ul class="category-manager-list">
                    ${categoryItems.length > 0 ? categoryItems : '<li class="category-manager-item">Inga kategorier har lagts till.</li>'}
                </ul>

                <div class="category-manager-add-form">
                    <div class="input-group">
                        <input id="new-category-name" class="form-input" placeholder="Nytt kategorinamn...">
                    </div>
                    <button id="add-category-btn" class="btn btn-primary">Lägg till</button>
                </div>

                <div class="modal-actions" style="margin-top: 1.5rem;">
                    <button id="modal-close" class="btn btn-secondary">Stäng</button>
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
            const newName = prompt("Ange nytt namn för kategorin:", category.name);
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
        showToast("Kategorinamn kan inte vara tomt.", "warning");
        return;
    }
    
    const originalText = btnElement.textContent;
    btnElement.disabled = true;
    btnElement.textContent = 'Sparar...';

    const data = { name: name, companyId: currentCompany.id };

    try {
        if (categoryId) {
            await updateDoc(doc(db, 'categories', categoryId), { name: name });
        } else {
            await addDoc(collection(db, 'categories'), data);
        }
        
        await fetchAllCompanyData();
        renderCategoryManagerModal();
        showToast("Kategori sparad!", "success");
        if (!categoryId && nameInput) nameInput.value = '';

    } catch (error) {
        console.error("Kunde inte spara kategori:", error);
        showToast("Kunde inte spara kategorin.", "error");
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
            showToast("Kategorin har tagits bort.", "success");
        } catch (error) {
            console.error("Kunde inte radera kategori:", error);
            showToast("Kunde inte ta bort kategorin.", "error");
        }
    }, "Ta bort kategori", "Är du säker? Detta kan inte ångras.");
}

async function saveCompanyInfo() {
    const btn = document.getElementById('save-company');
    const { currentUser, currentCompany } = getState();
    const newName = document.getElementById('setting-company').value;
    const newOrgNumber = document.getElementById('setting-org-number').value;

    if (!newName) {
        showToast("Företagsnamn kan inte vara tomt.", "warning");
        return;
    }
    
    btn.disabled = true;
    btn.textContent = "Sparar...";

    try {
        const dataToUpdate = { name: newName, orgNumber: newOrgNumber };
        await updateDoc(doc(db, 'companies', currentCompany.id), dataToUpdate);
        await updateDoc(doc(db, 'users', currentUser.uid), { companyName: newName });
        
        setState({ 
            currentCompany: { ...currentCompany, name: newName, orgNumber: newOrgNumber },
            userData: { ...getState().userData, companyName: newName }
        });
        document.dispatchEvent(new Event('stateUpdated'));
        showToast('Företagsinformationen är sparad!', 'success');
    } catch (error) {
        console.error("Fel vid sparning:", error);
        showToast("Kunde inte spara.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Spara Företagsinfo";
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
    btn.textContent = "Sparar...";

    try {
        if (file) {
            const storageRef = ref(storage, `company_logos/${currentCompany.id}/${file.name}`);
            await uploadBytes(storageRef, file);
            logoUrl = await getDownloadURL(storageRef);
        } else if (url) {
            if (!url.match(/\.(jpeg|jpg|gif|png)$/)) {
                showToast("Ange en direktlänk till en bild (jpg, png, etc).", "error");
                return;
            }
            logoUrl = url;
        } else {
            logoUrl = currentCompany.logoUrl || '';
        }
        await updateDoc(doc(db, 'companies', currentCompany.id), { logoUrl: logoUrl });
        setState({ currentCompany: { ...currentCompany, logoUrl: logoUrl } });
        showToast('Logotypen har sparats!', 'success');
    } catch (error) {
        console.error("Kunde inte spara logotyp:", error);
        showToast("Kunde inte spara logotypen.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Spara Logotyp";
    }
}

async function deleteAccount() {
    showConfirmationModal(async () => {
        try {
            const { currentUser } = getState();
            await auth.currentUser.delete();
            // Notera: Dokument i firestore för användaren tas inte bort här, kan läggas till.
            showToast("Ditt konto har tagits bort.", "info");
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Fel vid borttagning:", error);
            showToast("Kunde inte ta bort kontot. Logga ut och in igen.", "error");
        }
    }, "Ta bort konto", "Är du helt säker? Skriv 'RADERA' för att bekräfta.", 'RADERA');
}