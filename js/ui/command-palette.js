// js/ui/command-palette.js
import { getState } from '../state.js';
import { editors } from './editors.js';
import { renderTransactionForm } from './transactions.js';

let commandPaletteOpen = false;
let commands = [];
let selectedIndex = 0;

function getCommands() {
    const { allContacts } = getState();
    let dynamicCommands = [
        // Navigation
        { id: 'navigate_overview', title: 'Gå till Översikt', category: 'Navigering', action: () => window.navigateTo('overview') },
        { id: 'navigate_invoices', title: 'Gå till Fakturor', category: 'Navigering', action: () => window.navigateTo('invoices') },
        { id: 'navigate_products', title: 'Gå till Produkter', category: 'Navigering', action: () => window.navigateTo('products') },
        { id: 'navigate_contacts', title: 'Gå till Kontakter', category: 'Navigering', action: () => window.navigateTo('contacts') },
        { id: 'navigate_expenses', title: 'Gå till Utgifter', category: 'Navigering', action: () => window.navigateTo('expenses') },
        { id: 'navigate_income', title: 'Gå till Intäkter', category: 'Navigering', action: () => window.navigateTo('income') },
        { id: 'navigate_settings', title: 'Gå till Inställningar', category: 'Navigering', action: () => window.navigateTo('settings') },

        // Skapa-kommandon
        { id: 'create_invoice', title: 'Skapa Ny Faktura', category: 'Skapa', action: () => editors.renderInvoiceEditor() },
        { id: 'create_quote', title: 'Skapa Ny Offert', category: 'Skapa', action: () => editors.renderQuoteEditor() },
        { id: 'create_product', title: 'Skapa Ny Produkt', category: 'Skapa', action: () => editors.renderProductForm() },
        { id: 'create_contact', title: 'Skapa Ny Kontakt', category: 'Skapa', action: () => editors.renderContactForm() },
        { id: 'create_expense', title: 'Registrera Ny Utgift', category: 'Skapa', action: () => renderTransactionForm('expense') },
        { id: 'create_income', title: 'Registrera Ny Intäkt', category: 'Skapa', action: () => renderTransactionForm('income') },

        // Åtgärder
        { id: 'action_logout', title: 'Logga ut', category: 'Åtgärd', action: () => document.getElementById('logout-btn').click() },
    ];

    // Dynamiskt lägg till kommandon för varje kund
    allContacts.forEach(contact => {
        dynamicCommands.push({
            id: `view_contact_${contact.id}`,
            title: `Visa kund: ${contact.name}`,
            category: 'Kontakter',
            action: () => window.navigateTo('contacts', contact.id)
        });
    });

    commands = dynamicCommands;
}

function renderResults(filteredCommands) {
    const resultsContainer = document.getElementById('command-palette-results');
    if (!resultsContainer) return;

    if (filteredCommands.length === 0) {
        resultsContainer.innerHTML = `<li class="command-item">Inga resultat...</li>`;
        return;
    }

    resultsContainer.innerHTML = filteredCommands.map((cmd, index) => `
        <li class="command-item ${index === selectedIndex ? 'selected' : ''}" data-index="${index}">
            <span class="command-title">${cmd.title}</span>
            <span class="command-category">${cmd.category}</span>
        </li>
    `).join('');
}

function filterCommands(query) {
    if (!query) {
        return commands;
    }
    const lowerCaseQuery = query.toLowerCase();
    return commands.filter(cmd => cmd.title.toLowerCase().includes(lowerCaseQuery));
}

function handleInput() {
    const input = document.getElementById('command-palette-input');
    const filtered = filterCommands(input.value);
    selectedIndex = 0;
    renderResults(filtered);
}

function handleKeyDown(e) {
    const resultsContainer = document.getElementById('command-palette-results');
    const items = resultsContainer.querySelectorAll('.command-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        updateSelection(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        updateSelection(items);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        executeSelectedCommand();
    } else if (e.key === 'Escape') {
        closeCommandPalette();
    }
}

function updateSelection(items) {
    items.forEach((item, index) => {
        if (index === selectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

function executeSelectedCommand() {
    const input = document.getElementById('command-palette-input');
    const filtered = filterCommands(input.value);
    const command = filtered[selectedIndex];

    if (command && command.action) {
        command.action();
        closeCommandPalette();
    }
}

export function openCommandPalette() {
    if (commandPaletteOpen) return;
    commandPaletteOpen = true;

    getCommands(); // Uppdatera med senaste data

    const overlay = document.getElementById('command-palette-overlay');
    const input = document.getElementById('command-palette-input');

    overlay.style.display = 'flex';
    input.value = '';
    input.focus();

    selectedIndex = 0;
    renderResults(commands);

    input.addEventListener('input', handleInput);
    document.addEventListener('keydown', handleKeyDown);
}

export function closeCommandPalette() {
    if (!commandPaletteOpen) return;
    commandPaletteOpen = false;

    const overlay = document.getElementById('command-palette-overlay');
    const input = document.getElementById('command-palette-input');
    
    overlay.style.display = 'none';

    input.removeEventListener('input', handleInput);
    document.removeEventListener('keydown', handleKeyDown);
}

export function initializeCommandPalette() {
    const overlay = document.getElementById('command-palette-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeCommandPalette();
            }
        });
    }

    const resultsContainer = document.getElementById('command-palette-results');
    if (resultsContainer) {
        resultsContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.command-item');
            if (item && item.dataset.index) {
                selectedIndex = parseInt(item.dataset.index, 10);
                executeSelectedCommand();
            }
        });
    }
}