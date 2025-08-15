// js/ui/mail.js
import { getState } from '../state.js';
import { renderSpinner, showToast } from './utils.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-functions.js";

// Main function to render the mail page
export function renderMailPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
    <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 class="card-title" style="margin:0;">Inbox</h3>
            <button id="new-mail-btn" class="btn btn-primary">Compose</button>
        </div>
        <div id="inbox-container">${renderSpinner()}</div>
    </div>
    <div id="compose-container" style="display:none; margin-top: 1.5rem;" class="card"></div>
    `;
    
    document.getElementById('new-mail-btn').addEventListener('click', showComposeView);
    listInbox();
}

// Fetches and displays the inbox
async function listInbox() {
    const container = document.getElementById('inbox-container');
    const listInboxFunc = httpsCallable(getFunctions(), 'listInbox');
    try {
        const result = await listInboxFunc();
        const emails = result.data.emails;
        if (!emails || emails.length === 0) {
            container.innerHTML = "<p>Your inbox is empty.</p>";
            return;
        }
        container.innerHTML = emails.map(email => `
            <div class="history-item">
                <span><strong>From:</strong> ${email.from}</span>
                <span>${email.subject}</span>
                <span style="color: var(--text-color-light);">${new Date(email.date).toLocaleDateString()}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error("Could not fetch emails:", error);
        container.innerHTML = '<p>Could not load emails. Have you configured your account? <a href="#" id="goto-mail-settings">Go to Mail Settings.</a></p>';
        document.getElementById('goto-mail-settings').addEventListener('click', (e) => {
            e.preventDefault();
            window.navigateTo('mail-settings');
        });
    }
}

// Shows the compose email form
function showComposeView() {
    document.getElementById('inbox-container').parentElement.style.display = 'none';
    const composeContainer = document.getElementById('compose-container');
    composeContainer.style.display = 'block';

    const { allContacts } = getState();
    const contactOptions = allContacts.map(c => `<option value="${c.email}">${c.name} (${c.email})</option>`).join('');

    composeContainer.innerHTML = `
        <h3>New Email</h3>
        <div class="input-group">
            <label>To</label>
            <input id="compose-to" type="text" class="form-input" placeholder="Enter email or select from contacts">
            <select id="contact-select" class="form-input" style="margin-top: 0.5rem;"><option value="">Or select a contact...</option>${contactOptions}</select>
        </div>
        <div class="input-group">
            <label>Subject</label>
            <input id="compose-subject" type="text" class="form-input">
        </div>
        <div class="input-group">
            <label>Message</label>
            <textarea id="compose-body" class="form-input" rows="10"></textarea>
        </div>
        <div class="modal-actions">
            <button id="cancel-compose-btn" class="btn btn-secondary">Cancel</button>
            <button id="send-mail-btn" class="btn btn-primary">Send Email</button>
        </div>
    `;
    
    document.getElementById('contact-select').addEventListener('change', (e) => {
        const toField = document.getElementById('compose-to');
        if (e.target.value) {
            toField.value += (toField.value ? ',' : '') + e.target.value;
        }
    });

    document.getElementById('cancel-compose-btn').addEventListener('click', () => {
        composeContainer.style.display = 'none';
        document.getElementById('inbox-container').parentElement.style.display = 'block';
    });

    document.getElementById('send-mail-btn').addEventListener('click', sendEmail);
}

// Calls the backend to send the email
async function sendEmail() {
    const btn = document.getElementById('send-mail-btn');
    const emailData = {
        to: document.getElementById('compose-to').value,
        subject: document.getElementById('compose-subject').value,
        body: document.getElementById('compose-body').value,
    };
    if (!emailData.to || !emailData.subject) {
        showToast("Recipient and subject are required.", "warning");
        return;
    }
    const sendEmailFunc = httpsCallable(getFunctions(), 'sendEmail');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
        await sendEmailFunc(emailData);
        showToast("Email sent successfully!", "success");
        document.getElementById('compose-container').style.display = 'none';
        document.getElementById('inbox-container').parentElement.style.display = 'block';
        listInbox(); // Refresh inbox after sending
    } catch (error) {
        console.error("Failed to send email:", error);
        showToast("Failed to send email. Please check your settings and try again.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send Email';
    }
}
