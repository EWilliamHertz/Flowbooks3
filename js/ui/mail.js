// js/ui/mail.js
import { getState } from '../state.js';
import { renderSpinner, showToast } from './utils.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-functions.js";

const functions = getFunctions();
const listInboxFunc = httpsCallable(functions, 'listInbox');
const fetchEmailContentFunc = httpsCallable(functions, 'fetchEmailContent');
const sendEmailFunc = httpsCallable(functions, 'sendEmail');
const getAIEmailSuggestionFunc = httpsCallable(functions, 'getAIEmailSuggestion');

let currentView = 'inbox'; // inbox, reading, composing

export function renderMailPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div id="mail-container" class="card"></div>`;
    
    if (currentView === 'reading' || currentView === 'composing') {
        currentView = 'inbox';
    }
    renderInboxView();
}

async function renderInboxView() {
    currentView = 'inbox';
    const container = document.getElementById('mail-container');
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 class="card-title" style="margin:0;">Inbox</h3>
            <button id="new-mail-btn" class="btn btn-primary">Compose</button>
        </div>
        <div id="inbox-list">${renderSpinner()}</div>`;
    
    document.getElementById('new-mail-btn').addEventListener('click', () => renderComposeView());

    try {
        const result = await listInboxFunc();
        const emails = result.data.emails;
        const inboxList = document.getElementById('inbox-list');

        if (!emails || emails.length === 0) {
            inboxList.innerHTML = "<p>Your inbox is empty.</p>";
            return;
        }

        inboxList.innerHTML = emails.map(email => `
            <div class="history-item" data-uid="${email.uid}" style="cursor: pointer;">
                <span><strong>From:</strong> ${email.from}</span>
                <span>${email.subject || '(No Subject)'}</span>
                <span style="color: var(--text-color-light);">${new Date(email.date).toLocaleDateString()}</span>
            </div>
        `).join('');

        inboxList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => renderReadingView(item.dataset.uid));
        });

    } catch (error) {
        console.error("Could not fetch emails:", error);
        container.innerHTML = '<p>Could not load emails. Have you configured your account? <a href="#" id="goto-mail-settings">Go to Mail Settings.</a></p>';
        document.getElementById('goto-mail-settings').addEventListener('click', (e) => {
            e.preventDefault();
            window.navigateTo('mail-settings');
        });
    }
}

async function renderReadingView(emailUid) {
    currentView = 'reading';
    const container = document.getElementById('mail-container');
    container.innerHTML = renderSpinner();

    try {
        const result = await fetchEmailContentFunc({ uid: emailUid });
        const email = result.data;

        container.innerHTML = `
            <div class="email-reading-header">
                <button id="back-to-inbox-btn" class="btn btn-secondary">&larr; Back to Inbox</button>
                <div class="email-actions">
                    <button id="reply-btn" class="btn btn-primary">Reply</button>
                    <button id="forward-btn" class="btn btn-secondary">Forward</button>
                </div>
            </div>
            <hr style="margin: 1rem 0;">
            <div class="email-meta">
                <p><strong>From:</strong> ${email.from}</p>
                <p><strong>To:</strong> ${email.to}</p>
                <p><strong>Subject:</strong> ${email.subject}</p>
                <p><strong>Date:</strong> ${new Date(email.date).toLocaleString()}</p>
            </div>
            <hr style="margin: 1rem 0;">
            <div class="email-body">
                </div>
        `;
        
        // **NY, SÄKER METOD FÖR ATT VISA E-POST**
        const emailBodyContainer = container.querySelector('.email-body');
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '500px';
        iframe.style.border = 'none';
        iframe.setAttribute('sandbox', 'allow-same-origin'); // För säkerhet

        const htmlContent = `
            <html>
                <head><style>body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; } img { max-width: 100%; height: auto; }</style></head>
                <body>${email.html || ''}</body>
            </html>`;
        
        const blob = new Blob([htmlContent], { type: 'text/html' });
        iframe.src = URL.createObjectURL(blob);
        
        emailBodyContainer.appendChild(iframe);
        
        iframe.onload = () => {
            URL.revokeObjectURL(iframe.src); // Frigör minne
        };

        document.getElementById('back-to-inbox-btn').addEventListener('click', renderInboxView);
        document.getElementById('reply-btn').addEventListener('click', () => {
            const replySubject = `Re: ${email.subject}`;
            const replyBody = `<br><br><hr>On ${new Date(email.date).toLocaleString()}, ${email.from} wrote:<br><blockquote>${email.html}</blockquote>`;
            renderComposeView({ to: email.from, subject: replySubject, body: replyBody });
        });
        document.getElementById('forward-btn').addEventListener('click', () => {
            const forwardSubject = `Fwd: ${email.subject}`;
            const forwardBody = `<br><br><hr>Forwarded message:<br>From: ${email.from}<br>Date: ${new Date(email.date).toLocaleString()}<br>Subject: ${email.subject}<br>To: ${email.to}<br><br>${email.html}`;
            renderComposeView({ subject: forwardSubject, body: forwardBody });
        });

    } catch (error) {
        showToast("Could not load email content.", "error");
        console.error(error);
        renderInboxView();
    }
}

// ... (renderComposeView, sendEmail, generateAIEmail förblir oförändrade) ...
function renderComposeView(prefill = {}) {
    currentView = 'composing';
    const container = document.getElementById('mail-container');
    const { allContacts } = getState();
    const contactOptions = allContacts.map(c => `<option value="${c.email}">${c.name} (${c.email})</option>`).join('');

    container.innerHTML = `
        <h3>New Email</h3>
        <div class="input-group">
            <label>To</label>
            <input id="compose-to" type="text" class="form-input" placeholder="Enter email or select from contacts" value="${prefill.to || ''}">
            <select id="contact-select" class="form-input" style="margin-top: 0.5rem;"><option value="">Or select a contact...</option>${contactOptions}</select>
        </div>
        <div class="input-group">
            <label>Subject</label>
            <input id="compose-subject" type="text" class="form-input" value="${prefill.subject || ''}">
        </div>
        <div class="input-group">
             <label>Message</label>
             <div id="ai-helper" style="margin-bottom: 0.5rem; display: flex; gap: 0.5rem;">
                <input id="ai-prompt" type="text" class="form-input" placeholder="AI Assistant: Write a reminder about invoice #123...">
                <button id="ai-generate-btn" class="btn btn-secondary">Generate</button>
             </div>
            <textarea id="compose-body" class="form-input" rows="12">${prefill.body || ''}</textarea>
        </div>
        <div class="modal-actions">
            <button id="cancel-compose-btn" class="btn btn-secondary">Cancel</button>
            <button id="send-mail-btn" class="btn btn-primary">Send Email</button>
        </div>
    `;

    document.getElementById('contact-select').addEventListener('change', (e) => {
        const toField = document.getElementById('compose-to');
        if (e.target.value) { toField.value += (toField.value ? ',' : '') + e.target.value; }
    });

    document.getElementById('cancel-compose-btn').addEventListener('click', renderInboxView);
    document.getElementById('send-mail-btn').addEventListener('click', sendEmail);
    document.getElementById('ai-generate-btn').addEventListener('click', generateAIEmail);
}

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
    
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
        await sendEmailFunc(emailData);
        showToast("Email sent successfully!", "success");
        renderInboxView();
    } catch (error) {
        console.error("Failed to send email:", error);
        showToast("Failed to send email. Please check your settings and try again.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send Email';
    }
}

async function generateAIEmail() {
    const btn = document.getElementById('ai-generate-btn');
    const prompt = document.getElementById('ai-prompt').value;
    if (!prompt) {
        showToast("Please enter a prompt for the AI assistant.", "warning");
        return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Thinking...';
    try {
        const result = await getAIEmailSuggestionFunc({ prompt });
        document.getElementById('compose-body').value = result.data.suggestion;
    } catch (error) {
        showToast("Could not get AI suggestion.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate';
    }
}