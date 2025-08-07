// js/state.js
const state = {
    currentUser: null,
    userData: null,
    userCompanies: [],
    currentCompany: null,
    allIncomes: [],
    allExpenses: [],
    allTransactions: [],
    recurringTransactions: [],
    categories: [],
    teamMembers: [],
    allProducts: [],
};

export function getState() {
    return state;
}

export function setState(newState) {
    Object.assign(state, newState);
}
