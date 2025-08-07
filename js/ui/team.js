// js/ui/team.js
import { getState } from '../state.js';
import { renderSpinner, showToast, closeModal } from './utils.js';
import { addDoc, collection, serverTimestamp, doc } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';

export function renderTeamPage() {
    const { currentCompany } = getState();
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="settings-grid">
            <div class="card">
                <h3 class="card-title">Teammedlemmar</h3>
                <p>Personer med tillgång till företaget <strong>${currentCompany.name}</strong>.</p>
                <div id="team-list-container" style="margin-top: 1.5rem;">${renderSpinner()}</div>
            </div>
            <div class="card">
                <h3 class="card-title">Bjud in ny medlem</h3>
                <p>Skapa en unik engångslänk som du kan skicka till personen du vill bjuda in. Länken leder till en anpassad registreringssida.</p>
                <button id="create-invite-btn" class="btn btn-primary" style="margin-top: 1rem;">Skapa Inbjudningslänk</button>
            </div>
        </div>`;

    renderTeamList();
    document.getElementById('create-invite-btn').addEventListener('click', handleCreateInvitationLink);
}

function renderTeamList() {
    const { teamMembers } = getState();
    const container = document.getElementById('team-list-container');
    if (!container) return;

    if (teamMembers.length === 0) {
        container.innerHTML = '<p>Du har inte bjudit in några teammedlemmar än.</p>';
        return;
    }

    const memberItems = teamMembers.map(member => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-bottom: 1px solid var(--border-color);">
            <div>
                <p style="font-weight: 600; margin: 0;">${member.firstName} ${member.lastName}</p>
                <p style="font-size: 0.9rem; color: var(--text-color-light); margin: 0;">${member.position}</p>
            </div>
            <span>${member.email}</span>
        </div>`).join('');
    container.innerHTML = memberItems;
}

/**
 * Skapar en inbjudan i Firestore och visar en unik länk.
 */
async function handleCreateInvitationLink() {
    const { currentCompany, currentUser } = getState();
    
    try {
        const invitationsRef = collection(db, 'invitations');
        const newInviteRef = doc(invitationsRef); // Skapa en referens med ett unikt ID

        await addDoc(invitationsRef, {
            id: newInviteRef.id, // Spara det unika ID:t i dokumentet
            companyId: currentCompany.id,
            companyName: currentCompany.name,
            invitedBy: currentUser.uid,
            createdAt: serverTimestamp()
        });

        const inviteLink = `${window.location.origin}${window.location.pathname.replace('app.html', '')}register.html?invite=${newInviteRef.id}`;
        
        showInvitationLinkModal(inviteLink);

    } catch (error) {
        console.error("Kunde inte skapa inbjudan:", error);
        showToast('Ett fel uppstod. Försök igen.', 'error');
    }
}

/**
 * Visar en modal med den kopierbara inbjudningslänken.
 */
function showInvitationLinkModal(link) {
    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>Inbjudningslänk Skapad!</h3>
                <p>Skicka följande länk till personen du vill bjuda in. Länken kan bara användas en gång.</p>
                <div class="input-group">
                    <input type="text" id="invite-link-input" class="form-input" value="${link}" readonly>
                </div>
                <div class="modal-actions">
                    <button id="copy-link-btn" class="btn btn-primary">Kopiera Länk</button>
                    <button id="modal-close" class="btn btn-secondary">Stäng</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modal-container').innerHTML = modalHtml;
    
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('copy-link-btn').addEventListener('click', () => {
        const linkInput = document.getElementById('invite-link-input');
        linkInput.select();
        document.execCommand('copy');
        showToast("Länken har kopierats!", "success");
    });
}
