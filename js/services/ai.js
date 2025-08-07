// js/services/ai.js
import { getState } from '../state.js';

// Din API-nyckel för Gemini
const API_KEY = 'AIzaSyC9VG3fpf0VAsKfWgJE60lGWcmH6qObCN0';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;

/**
 * Hämtar ett AI-genererat förslag på kategori för en transaktion.
 * @param {object} transaction - Transaktionsobjektet som innehåller 'description' och 'party'.
 * @returns {Promise<string|null>} ID för den föreslagna kategorin, eller null vid fel.
 */
export async function getCategorySuggestion(transaction) {
    const { categories } = getState();
    if (categories.length === 0) return null; // Kan inte föreslå om inga kategorier finns

    const categoryNames = categories.map(c => c.name).join(', ');

    // Prompten som skickas till AI:n. Den är designad för att ge ett så korrekt svar som möjligt.
    const prompt = `
        Givet följande transaktion från ett svenskt företags bokföring:
        - Beskrivning: "${transaction.description}"
        - Motpart: "${transaction.party}"

        Och de tillgängliga utgiftskategorierna:
        [${categoryNames}]

        Vilken enskild kategori från listan ovan är mest lämplig för denna transaktion?
        Svara med endast namnet på kategorin från listan. Om ingen kategori passar bra, svara med "Okategoriserat".
    `;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error('API Error:', errorBody);
            throw new Error(`API-anrop misslyckades med status: ${response.status}`);
        }

        const data = await response.json();
        const suggestedCategoryName = data.candidates[0].content.parts[0].text.trim();
        
        // Hitta kategorin som matchar AI:ns svar
        const suggestedCategory = categories.find(c => c.name.toLowerCase() === suggestedCategoryName.toLowerCase());
        
        return suggestedCategory ? suggestedCategory.id : null;

    } catch (error) {
        console.error('Kunde inte hämta AI-förslag:', error);
        return null; // Returnera null så att importen kan fortsätta utan förslag vid fel
    }
}
