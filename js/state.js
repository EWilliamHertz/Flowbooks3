// js/state.js
const state = {
    // Användarinformation
    currentUser: null,
    userData: null,
    userCompanies: [],
    currentCompany: null,
    teamMembers: [],

    // Bokföringsdata
    allIncomes: [],
    allExpenses: [],
    allTransactions: [],
    allInvoices: [],
    allBills: [], // <-- LÄGG TILL DENNA RAD
    allQuotes: [], 
    recurringTransactions: [],
    categories: [],
    allContacts: [],
    allProjects: [], 
    allTimeEntries: [],
    allTemplates: [], 

    // Produkt- och lagerdata
    allProducts: [],

    // Bankdata från Tink
    bankAccounts: [],
    bankTransactions: [],
};

/**
 * En funktion för att hämta det nuvarande state-objektet.
 * @returns {Object} Hela applikationens state.
 */
export function getState() {
    return state;
}

/**
 * En funktion för att uppdatera state med ny data.
 * @param {Object} newState - Ett objekt med de nya värdena som ska slås samman med det befintliga state.
 */
export function setState(newState) {
    Object.assign(state, newState);
}