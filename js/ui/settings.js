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
                <h3>Profilbild</h3>
                <p>Ladda upp en profilbild eller logotyp.</p>
                <input type="file" id="profile-pic-upload" accept="image/*" style="margin-top: 1rem; margin-bottom: 1rem;">
                <button id="save-pic" class="btn btn-primary">Spara Bild</button>
            </div>
            <div class="card">
                <h3>Företagsinformation</h3>
                <div class="input-group">
                    <label>Företagsnamn</label>
                    <input id="setting-company" value="${currentCompany.name || ''}">
                </div>
                <button id="save-company" class="btn btn-primary">Spara</button>
            </div>
            <div class="card card-danger">
                <h3>Ta bort konto</h3>
                <p>All din data raderas permanent.</p>
                <button id="delete-account" class="btn btn-danger">Ta bort kontot permanent</button>
            </div>
        </div>`;

    document.getElementById('save-pic').addEventListener('click', saveProfileImage);
    document.getElementById('save-company').addEventListener('click', saveCompanyInfo);
    document.getElementById('delete-account').addEventListener('click', deleteAccount);
}

async function saveProfileImage() {
    const { currentUser } = getState();
    const fileInput = document.getElementById('profile-pic-upload');
    const file = fileInput.files[0];
    if (!file) return;

    const storageRef = ref(storage, `profile_images/${currentUser.uid}/${file.name}`);
    try {
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        await updateDoc(doc(db, 'users', currentUser.uid), { profileImageURL: url });
        
        setState({ userData: { ...getState().userData, profileImageURL: url } });
        document.dispatchEvent(new Event('stateUpdated')); // Notify UI to update
        showToast('Profilbilden är uppdaterad!', 'success');
    } catch (error) {
        console.error("Fel vid uppladdning:", error);
        showToast("Kunde inte spara profilbilden.", "error");
    }
}

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
            // Note: This does not delete company data, only the user.
            // More complex logic is needed to handle company deletion.
            await auth.currentUser.delete();
            showToast("Ditt konto har tagits bort.", "info");
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Fel vid borttagning:", error);
            showToast("Kunde inte ta bort kontot. Logga ut och in igen.", "error");
        }
    }
}
