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
            <h3 class="card-title" style="margin:0;">${t('mailInbox')}</h3>
            <button id="new-mail-btn" class="btn btn-primary">${t('mailNewMail')}</button>
        </div>
        <div id="inbox-list">${renderSpinner()}</div>`;
    
    document.getElementById('new-mail-btn').addEventListener('click', () => renderComposeView());

    try {
        const result = await listInboxFunc();
        const emails = result.data.emails;
        const inboxList = document.getElementById('inbox-list');

        if (!emails || emails.length === 0) {
            inboxList.innerHTML = `<p>${t('mailNoEmails')}</p>`;
            return;
        }

        inboxList.innerHTML = emails.map(email => `
            <div class="history-item" data-uid="${email.uid}" style="cursor: pointer;">
                <span><strong>${t('mailFrom')}:</strong> ${email.from}</span>
                <span>${email.subject || `(${t('noSubject')})`}</span>
                <span style="color: var(--text-color-light);">${new Date(email.date).toLocaleDateString()}</span>
            </div>
        `).join('');

        inboxList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => renderReadingView(item.dataset.uid));
        });

    } catch (error) {
        console.error("Could not fetch emails:", error);
        container.innerHTML = `<p>${t('mailSettingsNotConfigured')} <a href="#" id="goto-mail-settings">${t('mailGoToSettings')}</a></p>`;
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
                <button id="back-to-inbox-btn" class="btn btn-secondary">&larr; ${t('mailBackToInbox')}</button>
                <div class="email-actions">
                    <button id="reply-btn" class="btn btn-primary">${t('mailReply')}</button>
                    <button id="forward-btn" class="btn btn-secondary">${t('mailForward')}</button>
                </div>
            </div>
            <hr style="margin: 1rem 0;">
            <div class="email-meta">
                <p><strong>${t('mailFrom')}:</strong> ${email.from}</p>
                <p><strong>${t('mailTo')}:</strong> ${email.to}</p>
                <p><strong>${t('mailSubject')}:</strong> ${email.subject}</p>
                <p><strong>${t('mailDate')}:</strong> ${new Date(email.date).toLocaleString()}</p>
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
            const replySubject = `${t('re')}: ${email.subject}`;
            const replyBody = `<br><br><hr>${t('onDateFromUser', { date: new Date(email.date).toLocaleString(), from: email.from })}<br><blockquote>${email.html}</blockquote>`;
            renderComposeView({ to: email.from, subject: replySubject, body: replyBody });
        });
        document.getElementById('forward-btn').addEventListener('click', () => {
            const forwardSubject = `${t('fwd')}: ${email.subject}`;
            const forwardBody = `<br><br><hr>${t('forwardedMessage')}:<br>${t('mailFrom')}: ${email.from}<br>${t('mailDate')}: ${new Date(email.date).toLocaleString()}<br>${t('mailSubject')}: ${email.subject}<br>${t('mailTo')}: ${email.to}<br><br>${email.html}`;
            renderComposeView({ subject: forwardSubject, body: forwardBody });
        });

    } catch (error) {
        showToast("mailLoadError", "error");
        console.error(error);
        renderInboxView();
    }
}

function renderComposeView(prefill = {}) {
    currentView = 'composing';
    const container = document.getElementById('mail-container');
    
    container.innerHTML = `
        <h3>${t('mailNewMail')}</h3>
        <div class="input-group">
            <label>${t('mailTo')}</label>
            <div style="display: flex; gap: 0.5rem;">
                <input id="compose-to" type="text" class="form-input" placeholder="${t('mailRecipientPlaceholder')}" value="${prefill.to || ''}" style="flex-grow: 1;">
                <button id="add-from-contacts-btn" class="btn btn-secondary">${t('mailAddFromContacts')}</button>
            </div>
            <div id="contacts-dropdown-container" style="position: relative;"></div>
        </div>
        <div class="input-group">
            <label>${t('mailSubject')}</label>
            <input id="compose-subject" type="text" class="form-input" value="${prefill.subject || ''}">
        </div>
        <div class="input-group">
             <label>${t('mailMessage')}</label>
             <div id="ai-helper" style="margin-bottom: 0.5rem; display: flex; gap: 0.5rem;">
                <input id="ai-prompt" type="text" class="form-input" placeholder="${t('mailAIAssistantPlaceholder')}">
                <button id="ai-generate-btn" class="btn btn-secondary">${t('mailAIGenerate')}</button>
             </div>
            <textarea id="compose-body" class="form-input" rows="12">${prefill.body || ''}</textarea>
        </div>
        <div class="modal-actions">
            <button id="cancel-compose-btn" class="btn btn-secondary">${t('cancel')}</button>
            <button id="send-mail-btn" class="btn btn-primary">${t('send')}</button>
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
                <input type="text" id="contact-search-input" class="form-input" placeholder="${t('searchContacts')}">
                <div style="margin-top: 0.5rem; text-align: right;">
                    <button id="add-selected-contacts-btn" class="btn btn-sm btn-primary">${t('addSelected')}</button>
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
        showToast("mailRecipientAndSubjectRequired", "warning");
        return;
    }
    
    btn.disabled = true;
    btn.textContent = t('sending');
    try {
        await sendEmailFunc(emailData);
        showToast("mailSentSuccess", "success");
        renderInboxView();
    } catch (error) {
        console.error("Failed to send email:", error);
        showToast("mailCouldNotSend", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = t('send');
    }
}

async function generateAIEmail() {
    const btn = document.getElementById('ai-generate-btn');
    const prompt = document.getElementById('ai-prompt').value;
    if (!prompt) {
        showToast("mailAIPromptRequired", "warning");
        return;
    }
    
    btn.disabled = true;
    btn.textContent = t('generating');
    try {
        const result = await getAIEmailSuggestionFunc({ prompt });
        document.getElementById('compose-body').value = result.data.suggestion;
    } catch (error) {
        showToast("mailAIGenerationFailed", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = t('mailAIGenerate');
    }
}