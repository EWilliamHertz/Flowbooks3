// js/services/ai.js
import { getState } from '../state.js';

const API_KEY = 'AIzaSyC9VG3fpf0VAsKfWgJE60lGWcmH6qObCN0'; // Din API-nyckel
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;

/**
 * NY, SMART FUNKTION: Föreslår en komplett produktprofil baserat på ett namn.
 * @param {string} productName - Namnet på produkten att analysera.
 * @returns {Promise<Object|null>} Ett objekt med produktdata eller null vid fel.
 */
export async function getAIProductDetails(productName) {
    const prompt = `
        Agera som en inköpsassistent för ett svenskt e-handelsföretag. Givet produktbeskrivningen: "${productName}".
        Analysera och returnera ett JSON-objekt med rimliga, uppskattade värden för följande fält:
        - name: Ett tydligt och säljande produktnamn.
        - purchasePrice: Ett uppskattat inköpspris i SEK (endast siffra).
        - stock: Ett rimligt startsaldo för lager (t.ex. 50 eller 100).
        - imageUrl: En webbsökning efter en passande, direktlänk till en högupplöst produktbild. Länken måste sluta med .jpg, .png eller .webp.
        - sellingPriceBusiness: Ett konkurrenskraftigt försäljningspris exklusive moms för företagskunder (endast siffra).
        - sellingPricePrivate: Ett konkurrenskraftigt försäljningspris inklusive moms för privatkunder (endast siffra).

        Svara med ENDAST ett giltigt JSON-objekt och ingen annan text. Exempel på svar:
        {
          "name": "Premium 130pt Top-loaders (25-pack)",
          "purchasePrice": 45,
          "stock": 100,
          "imageUrl": "https://i.ebayimg.com/images/g/J~YAAOSw2xRYjP6S/s-l1200.jpg",
          "sellingPriceBusiness": 79,
          "sellingPricePrivate": 99
        }
    `;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);
        
        const data = await response.json();
        let textResponse = data.candidates[0].content.parts[0].text;
        textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        
        return JSON.parse(textResponse);
    } catch (error) {
        console.error(`Kunde inte hämta AI-förslag för "${productName}":`, error);
        return {
            name: productName,
            purchasePrice: 0,
            stock: 0,
            imageUrl: '',
            sellingPriceBusiness: 0,
            sellingPricePrivate: 0
        };
    }
}

/**
 * Hämtar ett AI-förslag på KATEGORI för en transaktion.
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
 * Föreslår kategori baserat på tidigare, liknande transaktioner.
 */
export async function getLearnedCategorySuggestion(newTransaction, existingTransactions) {
    const { categories } = getState();
    if (categories.length === 0) return null;
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    const examples = existingTransactions
        .filter(t => t.categoryId && t.party && t.party.toLowerCase() === newTransaction.party.toLowerCase())
        .slice(0, 5) 
        .map(t => `- Transaktionen "${t.description}" från "${t.party}" kategoriserades som "${categoryMap.get(t.categoryId)}".`)
        .join('\n');

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
        return null; 
    }
}
