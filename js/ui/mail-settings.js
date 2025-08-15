// js/ui/mail-settings.js
import { showToast } from './utils.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-functions.js";

export function renderMailSettingsPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
    <div class="card" style="max-width: 600px; margin: auto;">
        <h3>Connect Your Email Account</h3>
        <p>Enter your business email settings manually, or upload a configuration file (.mobileconfig) from your email provider to fill in the server details automatically.</p>
        
        <div class="input-group" style="background-color: #f8f9fa; padding: 1rem; border-radius: 8px;">
            <label style="font-weight: 600;">Auto-configure by Uploading File</label>
            <input type="file" id="config-file-input" accept=".mobileconfig" style="margin-top: 0.5rem;">
        </div>

        <div class="input-group">
            <label>Email Address (Username)</label>
            <input id="mail-username" type="email" class="form-input" placeholder="ernst@flowbooks.se">
        </div>
        <div class="input-group">
            <label>Password</label>
            <input id="mail-password" type="password" class="form-input">
        </div>
        <hr>
        <h4>Advanced Server Settings (IMAP/SMTP)</h4>
        <div class="form-grid">
            <div class="input-group"><label>IMAP Server</label><input id="mail-imap-host" type="text" class="form-input" value="imap.titan.email"></div>
            <div class="input-group"><label>IMAP Port</label><input id="mail-imap-port" type="number" class="form-input" value="993"></div>
            <div class="input-group"><label>SMTP Server</label><input id="mail-smtp-host" type="text" class="form-input" value="smtp.titan.email"></div>
            <div class="input-group"><label>SMTP Port</label><input id="mail-smtp-port" type="number" class="form-input" value="465"></div>
        </div>
        <button id="save-mail-settings" class="btn btn-primary" style="margin-top: 1rem;">Save and Connect</button>
    </div>`;
    document.getElementById('save-mail-settings').addEventListener('click', saveMailSettings);
    document.getElementById('config-file-input').addEventListener('change', handleConfigFileUpload);
}

function handleConfigFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        try {
            // This is a simplified parser for the specific XML-like structure in .mobileconfig files
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(content, "application/xml");
            
            const keys = xmlDoc.getElementsByTagName('key');
            let config = {};
            for (let i = 0; i < keys.length; i++) {
                let key = keys[i].textContent;
                let valueNode = keys[i].nextElementSibling;
                if (valueNode) {
                    config[key] = valueNode.textContent;
                }
            }

            document.getElementById('mail-username').value = config.EmailAddress || '';
            document.getElementById('mail-imap-host').value = config.IncomingMailServerHostName || '';
            document.getElementById('mail-imap-port').value = config.IncomingMailServerPortNumber || '';
            document.getElementById('mail-smtp-host').value = config.OutgoingMailServerHostName || '';
            document.getElementById('mail-smtp-port').value = config.OutgoingMailServerPortNumber || '';
            
            showToast("Settings populated from file!", "success");

        } catch (error) {
            console.error("Failed to parse .mobileconfig file:", error);
            showToast("Could not read the configuration file.", "error");
        }
    };
    reader.readAsText(file);
}


async function saveMailSettings() {
    const btn = document.getElementById('save-mail-settings');
    const settings = {
        username: document.getElementById('mail-username').value,
        password: document.getElementById('mail-password').value,
        imap: { host: document.getElementById('mail-imap-host').value, port: parseInt(document.getElementById('mail-imap-port').value)},
        smtp: { host: document.getElementById('mail-smtp-host').value, port: parseInt(document.getElementById('mail-smtp-port').value)},
    };
    if (!settings.password || !settings.username) {
        showToast("Username and password are required.", "warning");
        return;
    }
    const saveCredentials = httpsCallable(getFunctions(), 'saveMailCredentials');
    btn.disabled = true;
    btn.textContent = "Connecting...";
    try {
        await saveCredentials(settings);
        showToast("Email account connected successfully!", "success");
        window.navigateTo('mail'); // Navigate to the new mail page
    } catch (error) {
        console.error("Failed to save mail settings:", error);
        showToast("Could not connect. Please check your credentials.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Save and Connect";
    }
}
