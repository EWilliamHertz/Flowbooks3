// js/ui/team.js
import { getState } from '../state.js';
import { renderSpinner, showToast } from './utils.js';
import { addDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
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
                <p>Personen kan skapa ett konto för att ansluta till ditt företag.</p>
                <div class="input-group"><label for="invite-email">E-postadress</label><input type="email" id="invite-email" placeholder="namn@exempel.com"></div>
                <button id="send-invite-btn" class="btn btn-primary" style="margin-top: 1rem;">Skicka inbjudan</button>
            </div>
        </div>`;

    renderTeamList();
    document.getElementById('send-invite-btn').addEventListener('click', handleSendInvitation);
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

async function handleSendInvitation() {
    const { teamMembers, currentCompany, currentUser } = getState();
    const emailInput = document.getElementById('invite-email');
    const email = emailInput.value.trim().toLowerCase();
    
    if (!email) {
        showToast('Ange en giltig e-postadress.', 'warning');
        return;
    }

    if (teamMembers.some(member => member.email === email)) {
        showToast('Denna användare är redan medlem.', 'warning');
        return;
    }

    try {
        const invitationsRef = collection(db, 'invitations');
        const q = query(invitationsRef, where("email", "==", email), where("companyId", "==", currentCompany.id));
        const existingInvite = await getDocs(q);

        if (!existingInvite.empty) {
            showToast('En inbjudan har redan skickats till denna e-post.', 'warning');
            return;
        }

        await addDoc(invitationsRef, {
            email: email,
            companyId: currentCompany.id,
            companyName: currentCompany.name,
            invitedBy: currentUser.uid,
            createdAt: new Date()
        });

        showToast(`Inbjudan skickad till ${email}!`, 'success');
        emailInput.value = '';
    } catch (error) {
        console.error("Kunde inte skicka inbjudan:", error);
        showToast('Ett fel uppstod. Försök igen.', 'error');
    }
}
