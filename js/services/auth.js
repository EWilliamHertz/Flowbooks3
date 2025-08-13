// js/services/auth.js
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { auth } from '../../firebase-config.js';
import { setState } from '../state.js';
import { fetchInitialData } from './firestore.js';
import { initializeAppUI, showFatalError } from '../ui/navigation.js';

export function initializeAuthListener(onAppInitializedCallback) {
    onAuthStateChanged(auth, async (user) => {
        if (user && user.emailVerified) {
            setState({ currentUser: user });
            const success = await fetchInitialData(user);
            if (success) {
                initializeAppUI();
                if (onAppInitializedCallback) {
                    await onAppInitializedCallback(); // Kör callback när allt är klart
                }
            } else {
                showFatalError("Ditt konto är inte korrekt konfigurerat eller saknar koppling till ett företag.");
            }
        } else if (user && !user.emailVerified) {
            window.location.href = `login.html?status=unverified&email=${encodeURIComponent(user.email)}`;
        } else {
            window.location.href = 'login.html';
        }
    });
}

export function handleSignOut() {
    signOut(auth).catch(error => console.error("Utloggningsfel:", error));
}