// js/ui/components.js
import { getState } from '../state.js';

export function getControlsHTML() {
    const { categories } = getState();
    const categoryOptions = categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');

    return `
        <div class="controls-container">
            <div class="search-container">
                <input type="text" id="search-input" class="form-input" placeholder="Sök transaktioner...">
            </div>
            <div class="filter-container">
                <select id="category-filter" class="form-input">
                    <option value="all">Alla Kategorier</option>
                    ${categoryOptions}
                </select>
                <button class="btn filter-btn active" data-period="all">Alla</button>
                <button class="btn filter-btn" data-period="this-month">Denna månad</button>
                <button class="btn filter-btn" data-period="last-month">Förra månaden</button>
            </div>
        </div>`;
}