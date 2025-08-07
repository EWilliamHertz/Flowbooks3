// js/ui/settings.js
import { getState, setState } from '../state.js';
import { showToast } from './utils.js';
import { updateDoc, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-storage.js";
import { db, storage, auth } from '../../firebase-config.js';

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
                <h3>Företagslogotyp</h3>
                <p>Används på fakturor. Ladda upp en fil eller klistra in en direktlänk till en bild (t.ex. från Imgur).</p>
                <div class="input-group">
                    <label>Ladda upp fil</label>
                    <input type="file" id="logo-upload" accept="image/*">
                </div>
                 <div class="input-group">
                    <label>Eller klistra in bildlänk</label>
                    <input id="logo-url" placeholder="https://i.imgur.com/..." value="${currentCompany.logoUrl || ''}">
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
}

// ... saveCompanyLogo är oförändrad ...
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


// UPPDATERAD FUNKTION
async function saveCompanyInfo() {
    const { currentUser, currentCompany } = getState();
    const newName = document.getElementById('setting-company').value;
    const newOrgNumber = document.getElementById('setting-org-number').value; // Hämta värdet från det nya fältet

    if (!newName) {
        showToast("Företagsnamn kan inte vara tomt.", "warning");
        return;
    };

    try {
        // Skapa ett objekt med de fält som ska uppdateras
        const dataToUpdate = {
            name: newName,
            orgNumber: newOrgNumber
        };

        // Uppdatera i Firestore
        await updateDoc(doc(db, 'companies', currentCompany.id), dataToUpdate);
        await updateDoc(doc(db, 'users', currentUser.uid), { companyName: newName });
        
        // Uppdatera state lokalt
        setState({ 
            currentCompany: { ...currentCompany, name: newName, orgNumber: newOrgNumber },
            userData: { ...getState().userData, companyName: newName }
        });

        // Meddela UI att uppdatera sig, t.ex. företagsväljaren
        document.dispatchEvent(new Event('stateUpdated'));
        showToast('Företagsinformationen är sparad!', 'success');
    } catch (error) {
        console.error("Fel vid sparning:", error);
        showToast("Kunde inte spara.", "error");
    }
}


// ... deleteAccount är oförändrad ...
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
