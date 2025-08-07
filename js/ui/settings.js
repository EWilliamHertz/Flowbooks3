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
                <button id="save-company" class="btn btn-primary">Spara Namn</button>
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

async function saveCompanyLogo() {
    const fileInput = document.getElementById('logo-upload');
    const urlInput = document.getElementById('logo-url');
    const file = fileInput.files[0];
    const url = urlInput.value.trim();
    const { currentCompany } = getState();

    let logoUrl = '';

    try {
        if (file) {
            // Prioritera filuppladdning
            const storageRef = ref(storage, `company_logos/${currentCompany.id}/${file.name}`);
            await uploadBytes(storageRef, file);
            logoUrl = await getDownloadURL(storageRef);
        } else if (url) {
            // Använd länken om ingen fil valts
            // Enkel validering för att se om det är en bildlänk
            if (!url.match(/\.(jpeg|jpg|gif|png)$/)) {
                showToast("Ange en direktlänk till en bild (jpg, png, etc).", "error");
                // Försök konvertera Imgur-länk
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
            // Om båda är tomma, rensa logotypen
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

// ... (resten av filen är oförändrad) ...
async function saveCompanyInfo() {
    const { currentUser, currentCompany } = getState();
    const newName = document.getElementById('setting-company').value;
    if (!newName) return;

    try {
        await updateDoc(doc(db, 'companies', currentCompany.id), { name: newName });
        await updateDoc(doc(db, 'users', currentUser.uid), { companyName: newName });
        
        setState({ 
            currentCompany: { ...currentCompany, name: newName },
            userData: { ...getState().userData, companyName: newName }
        });
        document.dispatchEvent(new Event('stateUpdated')); // Notify UI to update
        showToast('Företagsinformationen är sparad!', 'success');
    } catch (error) {
        console.error("Fel vid sparning:", error);
        showToast("Kunde inte spara.", "error");
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
