// js/ui/mail-settings.js
import { showToast } from './utils.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-functions.js";

const functions = getFunctions();
const saveCredentials = httpsCallable(functions, 'saveMailCredentials');
const getGoogleAuthUrlFunc = httpsCallable(functions, 'getGoogleAuthUrl');
const listGoogleContactsFunc = httpsCallable(functions, 'listGoogleContacts');

export function renderMailSettingsPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
    <div class="card" style="max-width: 600px; margin: auto;">
        <h3>Connect Your Email Account</h3>
        <p>For the best experience, connect with Google. Otherwise, enter your details manually.</p>
        
        <div class="input-group">
             <button id="connect-google-btn" class="btn btn-primary btn-full-width" style="background-color: #DB4437;">Connect with Google</button>
        </div>
        <hr>
        <p class="text-center" style="color: var(--text-color-light);">Or configure manually</p>

        <div class="input-group">
            <label>Email Address (Username)</label>
            <input id="mail-username" type="email" class="form-input" placeholder="ernst@flowbooks.se">
        </div>
        <div class="input-group">
            <label>Password / App Password</label>
            <input id="mail-password" type="password" class="form-input">
        </div>
        <h4>Advanced Server Settings (IMAP/SMTP)</h4>
        <div class="form-grid">
            <div class="input-group"><label>IMAP Server</label><input id="mail-imap-host" type="text" class="form-input"></div>
            <div class="input-group"><label>IMAP Port</label><input id="mail-imap-port" type="number" class="form-input" value="993"></div>
            <div class="input-group"><label>SMTP Server</label><input id="mail-smtp-host" type="text" class="form-input"></div>
            <div class="input-group"><label>SMTP Port</label><input id="mail-smtp-port" type="number" class="form-input" value="465"></div>
        </div>
        <button id="save-mail-settings" class="btn btn-primary" style="margin-top: 1rem;">Save Manual Connection</button>
        <hr>
        <div id="integrations-section">
            <h4>Integrations</h4>
            <button id="import-google-contacts-btn" class="btn btn-secondary">Import Google Contacts</button>
        </div>
    </div>`;

    document.getElementById('save-mail-settings').addEventListener('click', saveMailSettings);
    document.getElementById('connect-google-btn').addEventListener('click', connectGoogleAccount);
    document.getElementById('import-google-contacts-btn').addEventListener('click', importGoogleContacts);
}

async function saveMailSettings() {
    const btn = document.getElementById('save-mail-settings');
    const settings = {
        username: document.getElementById('mail-username').value,
        password: document.getElementById('mail-password').value,
        imap: { host: document.getElementById('mail-imap-host').value, port: parseInt(document.getElementById('mail-imap-port').value) },
        smtp: { host: document.getElementById('mail-smtp-host').value, port: parseInt(document.getElementById('mail-smtp-port').value) },
    };

    if (!settings.password || !settings.username) {
        showToast("mailSettingsIncomplete", "warning");
        return;
    }
    
    btn.disabled = true;
    btn.textContent = "Connecting...";
    try {
        await saveCredentials(settings);
        showToast("mailSettingsSaved", "success");
        window.navigateTo('mail');
    } catch (error) {
        console.error("Failed to save mail settings:", error);
        showToast("mailSettingsFailed", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Save and Connect";
    }
}

async function connectGoogleAccount() {
    try {
        const result = await getGoogleAuthUrlFunc();
        const authUrl = result.data.authUrl;
        window.open(authUrl, 'google-auth', 'width=500,height=600');
        showToast("Please complete the sign-in in the new window.", "info");
    } catch (error) {
        showToast("Could not start Google connection.", "error");
    }
}

async function importGoogleContacts() {
    const btn = document.getElementById('import-google-contacts-btn');
    btn.disabled = true;
    btn.textContent = 'Importing...';
    try {
        const result = await listGoogleContactsFunc();
        const contacts = result.data.contacts;
        // Here you would save the contacts to your Firestore database.
        showToast(`Successfully found ${contacts.length} contacts!`, 'success');
    } catch (error) {
        showToast("Could not import contacts. Is your Google account connected?", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Import Google Contacts';
    }
}