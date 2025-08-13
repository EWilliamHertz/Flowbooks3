// js/ui/editors.js

// Importera alla redigeringsfunktioner från deras respektive filer
import { renderInvoiceEditor, generateInvoicePDF, markAsPaid, sendByEmail } from './invoices.js';
import { renderQuoteEditor } from './quote-editor.js';
import { renderProductForm, deleteProduct, showProductImage } from './products.js';
import { renderContactForm, deleteContact } from './contacts.js';
import { deleteQuote } from './quotes.js';

// Samla alla funktioner i ett enda objekt som vi kan exportera
export const editors = {
    renderInvoiceEditor,
    generateInvoicePDF,
    markAsPaid,
    sendByEmail,
    renderQuoteEditor,
    deleteQuote,
    renderProductForm,
    deleteProduct,
    showProductImage,
    renderContactForm,
    deleteContact
};