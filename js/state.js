// js/state.js

// Detta objekt håller all applikationens data centralt.
// När data hämtas från databasen eller en extern tjänst (som Tink),
// sparas den här så att alla delar av programmet kan komma åt den.
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
    recurringTransactions: [],
    categories: [],
    
    // Produkt- och lagerdata
    allProducts: [],

    // NYTT: Bankdata från Tink
    bankAccounts: [], // Kommer att hålla en lista över anslutna konton
    bankTransactions: [], // Kommer att hålla transaktioner från det valda kontot
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
