// js/ui/settings.js
import { getState, setState } from '../state.js';
import { showToast, closeModal, showConfirmationModal } from './utils.js';
import { updateDoc, doc, deleteDoc, addDoc, collection } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-storage.js";
import { db, storage, auth } from '../../firebase-config.js';
import { fetchAllCompanyData } from '../services/firestore.js'; // Importera för att kunna uppdatera state

export function renderSettingsPage() {
    const { currentCompany } = getState();
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="settings-grid">
            <div class="card">
                <h3>Företagsinformation</h3>
                <div class="input-group">
                    <label>Företagsnamn</label>
                    <input id="setting-company" value="${currentCompany.name || ''}">
                </div>
                <div class="input-group">
                    <label>Organisationsnummer</label>
                    <input id="setting-org-number" value="${currentCompany.orgNumber || ''}" placeholder="T.ex. 556677-8899">
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
                    <input id="logo-url" placeholder="https://..." value="${currentCompany.logoUrl || ''}">
                </div>
                <button id="save-logo" class="btn btn-primary">Spara Logotyp</button>
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
    document.getElementById('manage-categories-btn').addEventListener('click', renderCategoryManagerModal); // Event listener för nya knappen
}

/**
 * NY FUNKTION: Renderar modalen för att hantera kategorier.
 */
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

    // Event listeners för modalens knappar
    document.getElementById('add-category-btn').addEventListener('click', () => handleSaveCategory());

    document.querySelectorAll('.btn-edit-cat').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.closest('.category-manager-item');
            const categoryId = item.dataset.id;
            const category = categories.find(c => c.id === categoryId);
            const newName = prompt("Ange nytt namn för kategorin:", category.name);
            if (newName && newName.trim() !== "") {
                handleSaveCategory(categoryId, newName.trim());
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

/**
 * NY FUNKTION: Sparar en ny eller uppdaterad kategori.
 */
async function handleSaveCategory(categoryId = null, newName = null) {
    const { currentCompany } = getState();
    const name = newName || document.getElementById('new-category-name').value.trim();

    if (!name) {
        showToast("Kategorinamn kan inte vara tomt.", "warning");
        return;
    }

    const data = {
        name: name,
        companyId: currentCompany.id
    };

    try {
        if (categoryId) {
            // Uppdatera befintlig
            const docRef = doc(db, 'categories', categoryId);
            await updateDoc(docRef, { name: name });
        } else {
            // Skapa ny
            await addDoc(collection(db, 'categories'), data);
        }
        
        await fetchAllCompanyData();
        renderCategoryManagerModal(); // Rita om modalen med den nya datan
        showToast("Kategori sparad!", "success");
        if (!categoryId) document.getElementById('new-category-name').value = '';

    } catch (error) {
        console.error("Kunde inte spara kategori:", error);
        showToast("Kunde inte spara kategorin.", "error");
    }
}

/**
 * NY FUNKTION: Raderar en kategori.
 */
function handleDeleteCategory(categoryId) {
    showConfirmationModal(async () => {
        try {
            await deleteDoc(doc(db, 'categories', categoryId));
            await fetchAllCompanyData();
            renderCategoryManagerModal(); // Rita om modalen
            showToast("Kategorin har tagits bort.", "success");
        } catch (error) {
            console.error("Kunde inte radera kategori:", error);
            showToast("Kunde inte ta bort kategorin.", "error");
        }
    }, "Ta bort kategori", "Är du säker? Detta kan inte ångras.");
}


// --- Resten av filen (oförändrad) ---
async function saveCompanyInfo() {
    const { currentUser, currentCompany } = getState();
    const newName = document.getElementById('setting-company').value;
    const newOrgNumber = document.getElementById('setting-org-number').value;

    if (!newName) {
        showToast("Företagsnamn kan inte vara tomt.", "warning");
        return;
    };

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
    }
}

async function saveCompanyLogo() {
    const fileInput = document.getElementById('logo-upload');
    const urlInput = document.getElementById('logo-url');
    const file = fileInput.files[0];
    const url = urlInput.value.trim();
    const { currentCompany } = getState();
    let logoUrl = '';
    try {
        if (file) {
            const storageRef = ref(storage, `company_logos/${currentCompany.id}/${file.name}`);
            await uploadBytes(storageRef, file);
            logoUrl = await getDownloadURL(storageRef);
        } else if (url) {
            if (!url.match(/\.(jpeg|jpg|gif|png)$/)) {
                showToast("Ange en direktlänk till en bild (jpg, png, etc).", "error");
                if (url.includes('imgur.com') && !url.includes('i.imgur.com')) {
                    const parts = url.split('/');
                    const imgurId = parts[parts.length - 1];
                    urlInput.value = `https://i.imgur.com/${imgurId}.png`;
                    showToast("Försökte korrigera Imgur-länk. Vänligen verifiera och spara igen.", "info");
                }
                return;
            }
            logoUrl = url;
        } else {
            logoUrl = '';
        }
        await updateDoc(doc(db, 'companies', currentCompany.id), { logoUrl: logoUrl });
        setState({ currentCompany: { ...currentCompany, logoUrl: logoUrl } });
        showToast('Logotypen har sparats!', 'success');
    } catch (error) {
        console.error("Kunde inte spara logotyp:", error);
        showToast("Kunde inte spara logotypen.", "error");
    }
}

async function deleteAccount() {
    if (prompt("Är du helt säker? Skriv 'RADERA' för att bekräfta.") === 'RADERA') {
        try {
            const { currentUser } = getState();
            await deleteDoc(doc(db, 'users', currentUser.uid));
            await auth.currentUser.delete();
            showToast("Ditt konto har tagits bort.", "info");
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Fel vid borttagning:", error);
            showToast("Kunde inte ta bort kontot. Logga ut och in igen.", "error");
        }
    }
}
