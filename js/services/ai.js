// js/services/ai.js
import { getState } from '../state.js';

const API_KEY = 'AIzaSyC9VG3fpf0VAsKfWgJE60lGWcmH6qObCN0'; // Din API-nyckel
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;

/**
 * Hämtar ett AI-förslag på KATEGORI för en transaktion (den gamla, "gissande" versionen).
 * Används som fallback om den lärande funktionen inte hittar exempel.
 */
export async function getCategorySuggestion(transaction) {
    const { categories } = getState();
    if (categories.length === 0) return null;

    const categoryNames = categories.map(c => c.name).join(', ');

    const prompt = `
        Givet följande transaktion från ett svenskt företags bokföring:
        - Beskrivning: "${transaction.description}"
        - Motpart: "${transaction.party}"
        Och de tillgängliga utgiftskategorierna: [${categoryNames}]
        Vilken enskild kategori från listan ovan är mest lämplig för denna transaktion?
        Svara med endast namnet på kategorin från listan.`;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);
        const data = await response.json();
        const suggestedCategoryName = data.candidates[0].content.parts[0].text.trim();
        const suggestedCategory = categories.find(c => c.name.toLowerCase() === suggestedCategoryName.toLowerCase());
        return suggestedCategory ? suggestedCategory.id : null;
    } catch (error) {
        console.error('Kunde inte hämta AI-förslag:', error);
        return null;
    }
}

/**
 * Hämtar ett AI-förslag på KATEGORI för en PRODUKT.
 */
export async function getProductCategorySuggestion(productName) {
    const { categories } = getState();
    if (categories.length === 0) return null;
    const categoryNames = categories.map(c => c.name).join(', ');

    const prompt = `
        En produkt med namnet "${productName}" ska importeras.
        Vilken av följande *utgiftskategorier* skulle bäst passa för INKÖP av denna typ av produkt?
        Tillgängliga kategorier: [${categoryNames}]
        Svara med endast namnet på den mest passande kategorin.`;
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
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
 * NY SMART FUNKTION: Föreslår kategori baserat på tidigare, liknande transaktioner.
 */
export async function getLearnedCategorySuggestion(newTransaction, existingTransactions) {
    const { categories } = getState();
    if (categories.length === 0) return null;
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    // Hitta relevanta exempel från historiken baserat på motpart
    const examples = existingTransactions
        .filter(t => t.categoryId && t.party && t.party.toLowerCase() === newTransaction.party.toLowerCase())
        .slice(0, 5) // Ta max 5 färska exempel
        .map(t => `- Transaktionen "${t.description}" från "${t.party}" kategoriserades som "${categoryMap.get(t.categoryId)}".`)
        .join('\n');

    // Om inga exempel finns, använd den gamla "gissande" metoden som fallback.
    if (examples.length === 0) {
        return getCategorySuggestion(newTransaction);
    }

    const prompt = `
        En ny transaktion ska kategoriseras:
        - Beskrivning: "${newTransaction.description}"
        - Motpart: "${newTransaction.party}"

        Här är exempel på hur transaktioner från SAMMA motpart har kategoriserats tidigare:
        ${examples}

        Givet dessa exempel och följande lista på tillgängliga kategorier, vilken är den mest logiska kategorin för den nya transaktionen?
        Tillgängliga kategorier: [${categories.map(c => c.name).join(', ')}]

        Svara med endast det mest passande kategorinamnet från listan.`;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        if (!response.ok) throw new Error(`API call failed`);
        const data = await response.json();
        const suggestedCategoryName = data.candidates[0].content.parts[0].text.trim();
        const suggestedCategory = categories.find(c => c.name.toLowerCase() === suggestedCategoryName.toLowerCase());
        return suggestedCategory ? suggestedCategory.id : null;
    } catch (error) {
        console.error('Kunde inte hämta lärande AI-förslag:', error);
        return null; // Fallback vid fel
    }
}
