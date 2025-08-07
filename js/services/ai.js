// js/services/ai.js
import { getState } from '../state.js';

const API_KEY = 'AIzaSyC9VG3fpf0VAsKfWgJE60lGWcmH6qObCN0';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;

/**
 * Hämtar ett AI-förslag på KATEGORI för en transaktion.
 */
export async function getCategorySuggestion(transaction) {
    // ... (denna funktion är oförändrad)
}

/**
 * NY FUNKTION: Hämtar ett AI-förslag på KATEGORI för en PRODUKT.
 * Notera: Den föreslår en *utgiftskategori*, vilket kan vara användbart för inköp.
 */
export async function getProductCategorySuggestion(productName) {
    const { categories } = getState();
    if (categories.length === 0) return null;

    const categoryNames = categories.map(c => c.name).join(', ');

    const prompt = `
        En produkt med namnet "${productName}" ska importeras till ett produktregister.
        Vilken av följande *utgiftskategorier* skulle bäst passa för inköp av denna typ av produkt?

        Tillgängliga kategorier:
        [${categoryNames}]

        Svara med endast namnet på den mest passande kategorin.
    `;
    
    try {
        const response = await fetch(API_URL, { /* ... (API-anrop som tidigare) ... */ });
        if (!response.ok) throw new Error(`API call failed`);
        const data = await response.json();
        const suggestedCategoryName = data.candidates[0].content.parts[0].text.trim();
        const suggestedCategory = categories.find(c => c.name.toLowerCase() === suggestedCategoryName.toLowerCase());
        return suggestedCategory ? suggestedCategory.id : null;
    } catch (error) {
        console.error('Kunde inte hämta AI-förslag för produkt:', error);
        return null;
    }
}

/**
 * NY, SMARTARE FUNKTION: Lär sig av tidigare transaktioner.
 */
export async function getLearnedCategorySuggestion(newTransaction, existingTransactions) {
    // ... (denna implementeras i nästa huvudsektion) ...
}
