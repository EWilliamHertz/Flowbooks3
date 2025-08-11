// firebase-config.js
// Importera funktioner från Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-functions.js"; // <-- NY IMPORT

// Din Firebase-konfiguration
const firebaseConfig = {
    apiKey: "AIzaSyDGamRgGYt-Bl2Mj0znqAG7uFWM9TC0VgU",
    authDomain: "flowbooks-73cd9.firebaseapp.com",
    projectId: "flowbooks-73cd9",
    storageBucket: "flowbooks-73cd9.appspot.com",
    messagingSenderId: "226642349583",
    appId: "1:226642349583:web:e2376d9283d2d3c33ddd7a"
};

// Initialisera Firebase
const app = initializeApp(firebaseConfig);

// Exportera de tjänster du behöver i andra filer
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app); // <-- NY EXPORT
