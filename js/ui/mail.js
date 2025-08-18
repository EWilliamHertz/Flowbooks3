// js/ui/mail.js
import { getState } from '../state.js';
import { renderSpinner, showToast, closeModal } from './utils.js';
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
            <h3 class="card-title" style="margin:0;">Inkorg</h3>
            <button id="new-mail-btn" class="btn btn-primary">Skriv nytt</button>
        </div>
        <div id="inbox-list">${renderSpinner()}</div>`;
    
    document.getElementById('new-mail-btn').addEventListener('click', () => renderComposeView());

    try {
        const result = await listInboxFunc();
        const emails = result.data.emails;
        const inboxList = document.getElementById('inbox-list');

        if (!emails || emails.length === 0) {
            inboxList.innerHTML = "<p>Din inkorg är tom.</p>";
            return;
        }

        inboxList.innerHTML = emails.map(email => `
            <div class="history-item" data-uid="${email.uid}" style="cursor: pointer;">
                <span><strong>Från:</strong> ${email.from}</span>
                <span>${email.subject || '(Inget ämne)'}</span>
                <span style="color: var(--text-color-light);">${new Date(email.date).toLocaleDateString()}</span>
            </div>
        `).join('');

        inboxList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => renderReadingView(item.dataset.uid));
        });

    } catch (error) {
        console.error("Could not fetch emails:", error);
        container.innerHTML = '<p>Kunde inte ladda e-post. Har du konfigurerat ditt konto? <a href="#" id="goto-mail-settings">Gå till E-postinställningar.</a></p>';
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
                <button id="back-to-inbox-btn" class="btn btn-secondary">&larr; Tillbaka till inkorgen</button>
                <div class="email-actions">
                    <button id="reply-btn" class="btn btn-primary">Svara</button>
                    <button id="forward-btn" class="btn btn-secondary">Vidarebefordra</button>
                </div>
            </div>
            <hr style="margin: 1rem 0;">
            <div class="email-meta">
                <p><strong>Från:</strong> ${email.from}</p>
                <p><strong>Till:</strong> ${email.to}</p>
                <p><strong>Ämne:</strong> ${email.subject}</p>
                <p><strong>Datum:</strong> ${new Date(email.date).toLocaleString()}</p>
            </div>
            <hr style="margin: 1rem 0;">
            <div class="email-body">
            </div>
        `;
        
        const emailBodyContainer = container.querySelector('.email-body');
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '500px';
        iframe.style.border = 'none';
        iframe.setAttribute('sandbox', 'allow-same-origin');

        const htmlContent = `
            <html>
                <head><style>body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; } img { max-width: 100%; height: auto; }</style></head>
                <body>${email.html || ''}</body>
            </html>`;
        
        const blob = new Blob([htmlContent], { type: 'text/html' });
        iframe.src = URL.createObjectURL(blob);
        
        emailBodyContainer.appendChild(iframe);
        
        iframe.onload = () => {
            URL.revokeObjectURL(iframe.src);
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

function renderComposeView(prefill = {}) {
    currentView = 'composing';
    const container = document.getElementById('mail-container');
    
    container.innerHTML = `
        <h3>Nytt E-postmeddelande</h3>
        <div class="input-group">
            <label>Till</label>
            <div style="display: flex; gap: 0.5rem;">
                <input id="compose-to" type="text" class="form-input" placeholder="Ange e-post, separera med kommatecken" value="${prefill.to || ''}" style="flex-grow: 1;">
                <button id="add-from-contacts-btn" class="btn btn-secondary">Lägg till från kontakter</button>
            </div>
            <div id="contacts-dropdown-container" style="position: relative;"></div>
        </div>
        <div class="input-group">
            <label>Ämne</label>
            <input id="compose-subject" type="text" class="form-input" value="${prefill.subject || ''}">
        </div>
        <div class="input-group">
             <label>Meddelande</label>
             <div id="ai-helper" style="margin-bottom: 0.5rem; display: flex; gap: 0.5rem;">
                <input id="ai-prompt" type="text" class="form-input" placeholder="AI-assistent: Skriv en påminnelse om faktura #123...">
                <button id="ai-generate-btn" class="btn btn-secondary">Generera</button>
             </div>
            <textarea id="compose-body" class="form-input" rows="12">${prefill.body || ''}</textarea>
        </div>
        <div class="modal-actions">
            <button id="cancel-compose-btn" class="btn btn-secondary">Avbryt</button>
            <button id="send-mail-btn" class="btn btn-primary">Skicka</button>
        </div>
    `;
    
    document.getElementById('add-from-contacts-btn').addEventListener('click', showContactsDropdown);
    document.getElementById('cancel-compose-btn').addEventListener('click', renderInboxView);
    document.getElementById('send-mail-btn').addEventListener('click', sendEmail);
    document.getElementById('ai-generate-btn').addEventListener('click', generateAIEmail);
}

function showContactsDropdown() {
    const { allContacts } = getState();
    const container = document.getElementById('contacts-dropdown-container');

    if (container.querySelector('.product-selector-dropdown')) {
        container.innerHTML = ''; // Close if already open
        return;
    }

    const contactItems = allContacts.map(c => `
        <div class="product-selector-item" style="padding: 0.5rem;">
            <label style="display: flex; align-items: center; width: 100%; cursor: pointer;">
                <input type="checkbox" class="contact-select-checkbox" value="${c.email}" style="margin-right: 1rem;">
                <div class="product-selector-item-info">
                    <strong>${c.name}</strong>
                    <span>${c.email}</span>
                </div>
            </label>
        </div>`).join('');

    container.innerHTML = `
        <div class="product-selector-dropdown show" style="max-height: 250px;">
            <div style="padding: 0.5rem; position: sticky; top: 0; background: white;">
                <input type="text" id="contact-search-input" class="form-input" placeholder="Sök kontakter...">
                <div style="margin-top: 0.5rem; text-align: right;">
                    <button id="add-selected-contacts-btn" class="btn btn-sm btn-primary">Lägg till valda</button>
                </div>
            </div>
            <div id="contact-list-for-mail">
                ${contactItems}
            </div>
        </div>`;

    document.getElementById('contact-search-input').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        container.querySelectorAll('.product-selector-item').forEach(item => {
            const name = item.querySelector('strong')?.textContent.toLowerCase() || '';
            const email = item.querySelector('span')?.textContent.toLowerCase() || '';
            item.style.display = (name.includes(searchTerm) || email.includes(searchTerm)) ? 'block' : 'none';
        });
    });

    document.getElementById('add-selected-contacts-btn').addEventListener('click', () => {
        const toField = document.getElementById('compose-to');
        const selectedEmails = [];
        container.querySelectorAll('.contact-select-checkbox:checked').forEach(checkbox => {
            if(checkbox.value) selectedEmails.push(checkbox.value);
        });

        if (selectedEmails.length > 0) {
            const existingEmails = toField.value.split(',').map(e => e.trim()).filter(e => e);
            const newEmails = [...new Set([...existingEmails, ...selectedEmails])]; // Union to avoid duplicates
            toField.value = newEmails.join(', ');
        }
        container.innerHTML = ''; // Close dropdown
    });
}


async function sendEmail() {
    const btn = document.getElementById('send-mail-btn');
    const emailData = {
        to: document.getElementById('compose-to').value,
        subject: document.getElementById('compose-subject').value,
        body: document.getElementById('compose-body').value,
    };
    if (!emailData.to || !emailData.subject) {
        showToast("Mottagare och ämne är obligatoriskt.", "warning");
        return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Skickar...';
    try {
        await sendEmailFunc(emailData);
        showToast("E-postmeddelandet har skickats!", "success");
        renderInboxView();
    } catch (error) {
        console.error("Failed to send email:", error);
        showToast("Kunde inte skicka e-post. Kontrollera dina inställningar och försök igen.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Skicka';
    }
}

async function generateAIEmail() {
    const btn = document.getElementById('ai-generate-btn');
    const prompt = document.getElementById('ai-prompt').value;
    if (!prompt) {
        showToast("Vänligen ange en instruktion till AI-assistenten.", "warning");
        return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Tänker...';
    try {
        const result = await getAIEmailSuggestionFunc({ prompt });
        document.getElementById('compose-body').value = result.data.suggestion;
    } catch (error) {
        showToast("Kunde inte hämta AI-förslag.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generera';
    }
}