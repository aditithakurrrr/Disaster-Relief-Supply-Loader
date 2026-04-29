/**
 * ============================================================
 * DISASTER RELIEF SUPPLY LOADER — script.js
 * Algorithm: Fractional Knapsack with disaster-based priority
 * Author: Disaster Logistics Optimization System
 * ============================================================
 */

"use strict";

// ─────────────────────────────────────────────
// 1. CONSTANTS & CONFIG
// ─────────────────────────────────────────────

/**
 * Priority multipliers per disaster type and category.
 * These adjust the base priority of an item based on
 * how critical each category becomes in a given disaster.
 */
const MULTIPLIERS = {
  flood:      { Food: 1.2, Medicine: 1.3, Water: 1.5 },
  earthquake: { Food: 1.3, Medicine: 1.7, Water: 1.2 },
  drought:    { Food: 1.5, Medicine: 1.1, Water: 2.0 },
  tsunami:    { Food: 1.3, Medicine: 1.5, Water: 1.6 },
};

/** Human-readable disaster labels */
const DISASTER_LABELS = {
  flood:      "🌊 Flood",
  earthquake: "🌍 Earthquake",
  drought:    "☀️ Drought",
  tsunami:    "🌊 Tsunami",
};

/** Category color classes for table rendering */
const CATEGORY_CLASSES = {
  Food:     "cat-food",
  Medicine: "cat-medicine",
  Water:    "cat-water",
};

/** Emoji for categories */
const CATEGORY_EMOJI = {
  Food: "🍚",
  Medicine: "💊",
  Water: "💧",
};

/** Chart colors for each category */
const CHART_COLORS = {
  Food:     ["rgba(34,197,94,0.8)",  "rgba(34,197,94,1)"],
  Medicine: ["rgba(239,68,68,0.8)", "rgba(239,68,68,1)"],
  Water:    ["rgba(59,130,246,0.8)", "rgba(59,130,246,1)"],
};

/** Local storage keys */
const LS_ITEMS    = "drs_items";
const LS_DISASTER = "drs_disaster";
const LS_CAPACITY = "drs_capacity";
const LS_THEME    = "drs_theme";

// ─────────────────────────────────────────────
// 2. APPLICATION STATE
// ─────────────────────────────────────────────

/** Central state object */
let state = {
  items: [],           // Array of supply item objects
  disaster: "",        // Currently selected disaster type
  capacity: 0,         // Vehicle capacity in kg
  results: null,       // Last knapsack result
  editIndex: -1,       // Index of item being edited (-1 = none)
  chartInstance: null, // Chart.js instance reference
  theme: "dark",       // "dark" | "light"
};

// ─────────────────────────────────────────────
// 3. DOM REFERENCES
// ─────────────────────────────────────────────

const dom = {
  disasterSelect:    () => document.getElementById("disaster-type"),
  capacityInput:     () => document.getElementById("vehicle-capacity"),
  itemName:          () => document.getElementById("item-name"),
  itemCategory:      () => document.getElementById("item-category"),
  itemWeight:        () => document.getElementById("item-weight"),
  itemPriority:      () => document.getElementById("item-priority"),
  editIndex:         () => document.getElementById("edit-index"),
  formTitle:         () => document.getElementById("form-title"),
  btnAdd:            () => document.getElementById("btn-add-item"),
  btnCancelEdit:     () => document.getElementById("btn-cancel-edit"),
  btnRun:            () => document.getElementById("btn-run"),
  btnReset:          () => document.getElementById("btn-reset"),
  btnTheme:          () => document.getElementById("theme-toggle"),
  themeIconDark:     () => document.getElementById("theme-icon-dark"),
  themeIconLight:    () => document.getElementById("theme-icon-light"),
  disasterBadge:     () => document.getElementById("disaster-badge"),
  badgeLabel:        () => document.getElementById("badge-label"),
  emptyState:        () => document.getElementById("empty-state"),
  tableWrapper:      () => document.getElementById("table-wrapper"),
  itemsTbody:        () => document.getElementById("items-tbody"),
  itemCountBadge:    () => document.getElementById("item-count-badge"),
  resultsSection:    () => document.getElementById("results-section"),
  multiplierPreview: () => document.getElementById("multiplier-preview"),
  multFood:          () => document.getElementById("mult-food"),
  multMedicine:      () => document.getElementById("mult-medicine"),
  multWater:         () => document.getElementById("mult-water"),
  kpiWeight:         () => document.getElementById("kpi-weight"),
  kpiPriority:       () => document.getElementById("kpi-priority"),
  kpiEfficiency:     () => document.getElementById("kpi-efficiency"),
  kpiCapacityPct:    () => document.getElementById("kpi-capacity-pct"),
  capacityText:      () => document.getElementById("capacity-text"),
  progressFill:      () => document.getElementById("progress-fill"),
  criticalAlert:     () => document.getElementById("critical-alert"),
  criticalCatText:   () => document.getElementById("critical-category-text"),
  resultDisasterTag: () => document.getElementById("result-disaster-tag"),
  resultsTbody:      () => document.getElementById("results-tbody"),
  resultsChart:      () => document.getElementById("results-chart"),
  toastContainer:    () => document.getElementById("toast-container"),
};

// ─────────────────────────────────────────────
// 4. CORE ALGORITHM FUNCTIONS
// ─────────────────────────────────────────────

/**
 * Calculates the adjusted priority for an item.
 * Formula: Adjusted Priority = Base Priority × Disaster Multiplier
 * If no disaster is selected, multiplier defaults to 1.
 *
 * @param {number} basePriority - Raw priority score entered by user
 * @param {string} category     - "Food" | "Medicine" | "Water"
 * @param {string} disaster     - Disaster key (e.g. "flood")
 * @returns {number} Adjusted priority value
 */
function calculateAdjustedPriority(basePriority, category, disaster) {
  const multiplier = MULTIPLIERS[disaster]?.[category] ?? 1.0;
  return parseFloat((basePriority * multiplier).toFixed(3));
}

/**
 * Runs the Fractional Knapsack algorithm on the current item list.
 *
 * Algorithm Steps:
 *  1. For each item, compute value density = adjusted priority / weight
 *  2. Sort items in descending order of value density (greedy choice)
 *  3. Iterate: add full items while capacity allows, take fraction of last item
 *
 * @param {Array}  items    - Array of item objects (must have weight, adjustedPriority)
 * @param {number} capacity - Maximum weight allowed
 * @returns {Object} result  - { selected, totalWeight, totalValue, efficiency }
 */
function runKnapsack(items, capacity) {
  // Sort by value density descending
  const sorted = [...items]
    .map((item, originalIndex) => ({ ...item, originalIndex }))
    .sort((a, b) => b.valueDensity - a.valueDensity);

  let remaining = capacity;
  let totalWeight = 0;
  let totalValue = 0;
  const selected = [];

  for (const item of sorted) {
    if (remaining <= 0) break;

    if (item.weight <= remaining) {
      // Take the full item
      selected.push({
        ...item,
        fraction:       1.0,
        takenWeight:    item.weight,
        takenValue:     item.adjustedPriority,
        isFractional:   false,
      });
      remaining    -= item.weight;
      totalWeight  += item.weight;
      totalValue   += item.adjustedPriority;
    } else {
      // Take a fraction of the item (greedy relaxation)
      const fraction = remaining / item.weight;
      const takenValue = item.adjustedPriority * fraction;

      selected.push({
        ...item,
        fraction:       parseFloat(fraction.toFixed(4)),
        takenWeight:    parseFloat(remaining.toFixed(4)),
        takenValue:     parseFloat(takenValue.toFixed(4)),
        isFractional:   true,
      });
      totalWeight += remaining;
      totalValue  += takenValue;
      remaining    = 0;
    }
  }

  const efficiency = totalWeight > 0
    ? parseFloat((totalValue / totalWeight).toFixed(3))
    : 0;

  return {
    selected,
    totalWeight:  parseFloat(totalWeight.toFixed(3)),
    totalValue:   parseFloat(totalValue.toFixed(3)),
    efficiency,
    capacity,
  };
}

/**
 * Recomputes adjusted priority and value density for every item
 * in the current state using the current disaster selection.
 */
function recalculateAllItems() {
  state.items = state.items.map(item => {
    const adj = calculateAdjustedPriority(item.basePriority, item.category, state.disaster);
    return {
      ...item,
      adjustedPriority: adj,
      valueDensity: item.weight > 0 ? parseFloat((adj / item.weight).toFixed(4)) : 0,
    };
  });
}

// ─────────────────────────────────────────────
// 5. RENDER FUNCTIONS
// ─────────────────────────────────────────────

/**
 * Renders the item inventory table from state.items.
 * Shows empty state if no items exist.
 */
function renderTable() {
  const tbody = dom.itemsTbody();
  const items = state.items;

  dom.itemCountBadge().textContent = `${items.length} item${items.length !== 1 ? "s" : ""}`;

  if (items.length === 0) {
    dom.emptyState().classList.remove("hidden");
    dom.tableWrapper().classList.add("hidden");
    return;
  }

  dom.emptyState().classList.add("hidden");
  dom.tableWrapper().classList.remove("hidden");

  tbody.innerHTML = items.map((item, idx) => `
    <tr class="fade-in">
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>
        <span class="cat-badge ${CATEGORY_CLASSES[item.category]}">
          ${CATEGORY_EMOJI[item.category]} ${item.category}
        </span>
      </td>
      <td class="td-mono">${item.weight} kg</td>
      <td class="td-mono">${item.basePriority}</td>
      <td class="td-accent">${item.adjustedPriority}</td>
      <td class="td-mono">${item.valueDensity}</td>
      <td>
        <div class="td-actions">
          <button class="btn-edit" onclick="startEdit(${idx})">Edit</button>
          <button class="btn-delete" onclick="deleteItem(${idx})">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

/**
 * Renders the results section after optimization is run.
 * Populates KPIs, progress bar, selected items table, and chart.
 */
function renderResults() {
  const r = state.results;
  if (!r) return;

  const section = dom.resultsSection();
  section.classList.remove("hidden");
  section.classList.add("fade-in");

  // ── KPIs ──────────────────────────────────
  dom.kpiWeight().textContent      = `${r.totalWeight} kg`;
  dom.kpiPriority().textContent    = r.totalValue.toFixed(2);
  dom.kpiEfficiency().textContent  = r.efficiency;
  const pct = r.capacity > 0
    ? parseFloat(((r.totalWeight / r.capacity) * 100).toFixed(1))
    : 0;
  dom.kpiCapacityPct().textContent = `${pct}%`;

  // ── Capacity Progress Bar ─────────────────
  dom.capacityText().textContent = `${r.totalWeight} / ${r.capacity} kg`;
  // Delay for animation
  setTimeout(() => {
    dom.progressFill().style.width = `${Math.min(pct, 100)}%`;
  }, 80);

  // ── Disaster tag ──────────────────────────
  dom.resultDisasterTag().textContent = DISASTER_LABELS[state.disaster] || state.disaster;

  // ── Critical Category Alert ───────────────
  const critCat = getCriticalCategory(state.disaster);
  if (critCat) {
    dom.criticalCatText().textContent =
      `${CATEGORY_EMOJI[critCat]} ${critCat} — highest multiplier (×${MULTIPLIERS[state.disaster][critCat]}) for ${DISASTER_LABELS[state.disaster]}`;
    dom.criticalAlert().classList.remove("hidden");
  }

  // ── Selected Items Table ──────────────────
  dom.resultsTbody().innerHTML = r.selected.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>
        <span class="cat-badge ${CATEGORY_CLASSES[item.category]}">
          ${CATEGORY_EMOJI[item.category]}
        </span>
      </td>
      <td class="td-mono">${item.takenWeight} kg</td>
      <td class="${item.isFractional ? "fraction-partial" : "fraction-full"}">
        ${item.isFractional ? (item.fraction * 100).toFixed(1) + "%" : "100%"}
      </td>
      <td class="td-accent">${item.takenValue.toFixed(2)}</td>
    </tr>
  `).join("");

  // ── Chart ─────────────────────────────────
  renderChart(r.selected);
}

/**
 * Renders or re-renders the Chart.js pie chart showing
 * priority distribution among selected items.
 *
 * @param {Array} selected - Array of selected knapsack items
 */
function renderChart(selected) {
  const canvas = dom.resultsChart();
  const ctx = canvas.getContext("2d");

  // Destroy previous chart instance to avoid overlap
  if (state.chartInstance) {
    state.chartInstance.destroy();
    state.chartInstance = null;
  }

  const labels = selected.map(i => i.name);
  const data   = selected.map(i => i.takenValue.toFixed(2));
  const colors = selected.map(i => CHART_COLORS[i.category]?.[0] ?? "rgba(148,163,184,0.7)");
  const borders= selected.map(i => CHART_COLORS[i.category]?.[1] ?? "rgba(148,163,184,1)");

  state.chartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1.5,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "55%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: getComputedStyle(document.documentElement)
              .getPropertyValue("--text-secondary").trim() || "#8890aa",
            font: { size: 11, family: "'DM Mono', monospace" },
            padding: 10,
            boxWidth: 10,
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.parsed.toFixed(2)} adj. priority`,
          },
          backgroundColor: "#13161e",
          borderColor: "#252a38",
          borderWidth: 1,
          titleColor: "#e8eaf2",
          bodyColor: "#8890aa",
        },
      },
    },
  });
}

/**
 * Updates the disaster badge in the header with the current selection.
 */
function updateDisasterBadge() {
  const badge = dom.disasterBadge();
  const label = dom.badgeLabel();

  if (!state.disaster) {
    label.textContent = "No Disaster Selected";
    badge.classList.remove("active", "hidden");
    return;
  }

  label.textContent = DISASTER_LABELS[state.disaster];
  badge.classList.remove("hidden");
  badge.classList.add("active");
}

/**
 * Shows or hides the multiplier preview panel based on disaster.
 */
function updateMultiplierPreview() {
  const preview = dom.multiplierPreview();

  if (!state.disaster) {
    preview.classList.add("hidden");
    return;
  }

  const m = MULTIPLIERS[state.disaster];
  dom.multFood().textContent     = `×${m.Food}`;
  dom.multMedicine().textContent = `×${m.Medicine}`;
  dom.multWater().textContent    = `×${m.Water}`;
  preview.classList.remove("hidden");
}

/**
 * Central UI update function — syncs all visible state.
 */
function updateUI() {
  updateDisasterBadge();
  updateMultiplierPreview();
  recalculateAllItems();
  renderTable();
  saveToLocalStorage();
}

// ─────────────────────────────────────────────
// 6. ITEM CRUD OPERATIONS
// ─────────────────────────────────────────────

/**
 * Reads form inputs, validates them, and adds or updates an item.
 * Called when the "Add Item" / "Save Edit" button is clicked.
 */
function handleAddItem() {
  const name     = dom.itemName().value.trim();
  const category = dom.itemCategory().value;
  const weight   = parseFloat(dom.itemWeight().value);
  const priority = parseFloat(dom.itemPriority().value);
  const editIdx  = parseInt(dom.editIndex().value, 10);

  // ── Validation ────────────────────────────
  if (!name)              return showToast("Item name is required.", "error");
  if (!category)          return showToast("Please select a category.", "error");
  if (!weight || weight <= 0)   return showToast("Weight must be a positive number.", "error");
  if (!priority || priority <= 0) return showToast("Priority must be a positive number.", "error");

  // ── Build item object ─────────────────────
  const adjPriority = calculateAdjustedPriority(priority, category, state.disaster);
  const valueDensity = weight > 0 ? parseFloat((adjPriority / weight).toFixed(4)) : 0;

  const item = {
    name,
    category,
    weight:           parseFloat(weight.toFixed(3)),
    basePriority:     priority,
    adjustedPriority: adjPriority,
    valueDensity,
    id:               Date.now(),
  };

  if (editIdx >= 0) {
    // Update existing item
    item.id = state.items[editIdx].id; // preserve original ID
    state.items[editIdx] = item;
    showToast(`"${name}" updated successfully.`, "success");
    cancelEdit();
  } else {
    // Add new item
    state.items.push(item);
    showToast(`"${name}" added to inventory.`, "success");
  }

  // Clear form
  clearItemForm();
  updateUI();
}

/**
 * Removes an item from state by index.
 * @param {number} idx - Index of item to delete
 */
function deleteItem(idx) {
  const name = state.items[idx]?.name ?? "Item";
  state.items.splice(idx, 1);
  showToast(`"${name}" removed.`, "info");

  // If results exist, clear them since items changed
  state.results = null;
  dom.resultsSection().classList.add("hidden");

  updateUI();
}

/**
 * Populates the form with an existing item's data for editing.
 * @param {number} idx - Index of item to edit
 */
function startEdit(idx) {
  const item = state.items[idx];
  if (!item) return;

  dom.itemName().value     = item.name;
  dom.itemCategory().value = item.category;
  dom.itemWeight().value   = item.weight;
  dom.itemPriority().value = item.basePriority;
  dom.editIndex().value    = idx;

  dom.formTitle().textContent = "Edit Supply Item";
  dom.btnAdd().innerHTML = `
    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
    Save Changes
  `;
  dom.btnCancelEdit().classList.remove("hidden");

  state.editIndex = idx;

  // Scroll to form
  document.getElementById("item-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Cancels any active edit and resets the form to "Add" mode.
 */
function cancelEdit() {
  state.editIndex = -1;
  dom.editIndex().value    = -1;
  dom.formTitle().textContent = "Add Supply Item";
  dom.btnAdd().innerHTML = `
    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"/></svg>
    Add Item
  `;
  dom.btnCancelEdit().classList.add("hidden");
  clearItemForm();
}

/**
 * Resets the item input form fields.
 */
function clearItemForm() {
  dom.itemName().value     = "";
  dom.itemCategory().value = "";
  dom.itemWeight().value   = "";
  dom.itemPriority().value = "";
}

// ─────────────────────────────────────────────
// 7. OPTIMIZATION HANDLER
// ─────────────────────────────────────────────

/**
 * Validates inputs, runs the Fractional Knapsack, and displays results.
 */
function handleRunOptimization() {
  const capacity = parseFloat(dom.capacityInput().value);

  // ── Validation ────────────────────────────
  if (!state.disaster) {
    return showToast("Please select a disaster type first.", "error");
  }
  if (!capacity || capacity <= 0) {
    return showToast("Please enter a valid vehicle capacity (kg).", "error");
  }
  if (state.items.length === 0) {
    return showToast("Add at least one supply item before optimizing.", "error");
  }

  state.capacity = capacity;

  // Ensure all items have up-to-date adjusted priorities
  recalculateAllItems();

  // Run the knapsack algorithm
  state.results = runKnapsack(state.items, capacity);

  // Render results
  renderResults();

  showToast("Optimization complete!", "success");

  // Scroll to results
  setTimeout(() => {
    dom.resultsSection().scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
}

// ─────────────────────────────────────────────
// 8. RESET
// ─────────────────────────────────────────────

/**
 * Clears all state, localStorage, and resets the UI.
 */
function handleReset() {
  if (state.items.length === 0 && !state.disaster && !state.results) {
    return showToast("Nothing to reset.", "info");
  }

  state.items    = [];
  state.disaster = "";
  state.capacity = 0;
  state.results  = null;
  state.editIndex = -1;

  dom.disasterSelect().value = "";
  dom.capacityInput().value  = "";
  clearItemForm();
  cancelEdit();

  dom.resultsSection().classList.add("hidden");
  dom.criticalAlert().classList.add("hidden");

  // Reset capacity bar
  dom.progressFill().style.width = "0%";

  // Destroy chart
  if (state.chartInstance) {
    state.chartInstance.destroy();
    state.chartInstance = null;
  }

  clearLocalStorage();
  updateUI();
  showToast("All data has been reset.", "info");
}

// ─────────────────────────────────────────────
// 9. THEME TOGGLE
// ─────────────────────────────────────────────

/**
 * Toggles dark/light mode and persists the preference.
 */
function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", state.theme);

  const isDark = state.theme === "dark";
  dom.themeIconDark().classList.toggle("hidden", !isDark);
  dom.themeIconLight().classList.toggle("hidden", isDark);

  localStorage.setItem(LS_THEME, state.theme);

  // Re-render chart with updated theme colors if present
  if (state.results) renderChart(state.results.selected);
}

// ─────────────────────────────────────────────
// 10. HELPERS
// ─────────────────────────────────────────────

/**
 * Returns the category with the highest multiplier for a given disaster.
 * Used to highlight the "most critical category" in the results.
 *
 * @param {string} disaster - Disaster key
 * @returns {string|null} Category name or null
 */
function getCriticalCategory(disaster) {
  if (!disaster || !MULTIPLIERS[disaster]) return null;
  const m = MULTIPLIERS[disaster];
  return Object.entries(m).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Displays a toast notification.
 *
 * @param {string} message - Message to display
 * @param {string} type    - "error" | "success" | "info"
 */
function showToast(message, type = "info") {
  const icons = { error: "❌", success: "✅", info: "ℹ️" };
  const container = dom.toastContainer();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span> ${escapeHtml(message)}`;

  container.appendChild(toast);

  // Auto-remove after animation completes (~3s)
  setTimeout(() => toast.remove(), 3100);
}

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str - Raw string
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─────────────────────────────────────────────
// 11. LOCAL STORAGE
// ─────────────────────────────────────────────

/**
 * Persists current items, disaster, and capacity to localStorage.
 */
function saveToLocalStorage() {
  try {
    localStorage.setItem(LS_ITEMS,    JSON.stringify(state.items));
    localStorage.setItem(LS_DISASTER, state.disaster);
    localStorage.setItem(LS_CAPACITY, state.capacity);
  } catch (e) {
    console.warn("LocalStorage save failed:", e);
  }
}

/**
 * Loads previously saved state from localStorage on page load.
 */
function loadFromLocalStorage() {
  try {
    const items    = localStorage.getItem(LS_ITEMS);
    const disaster = localStorage.getItem(LS_DISASTER);
    const capacity = localStorage.getItem(LS_CAPACITY);
    const theme    = localStorage.getItem(LS_THEME);

    if (items)    state.items    = JSON.parse(items);
    if (disaster) state.disaster = disaster;
    if (capacity) state.capacity = parseFloat(capacity) || 0;
    if (theme)    state.theme    = theme;
  } catch (e) {
    console.warn("LocalStorage load failed:", e);
  }
}

/**
 * Removes all saved state from localStorage.
 */
function clearLocalStorage() {
  localStorage.removeItem(LS_ITEMS);
  localStorage.removeItem(LS_DISASTER);
  localStorage.removeItem(LS_CAPACITY);
}

// ─────────────────────────────────────────────
// 12. EVENT LISTENERS
// ─────────────────────────────────────────────

/**
 * Wires up all interactive elements to their handlers.
 */
function bindEvents() {
  // Disaster selection
  dom.disasterSelect().addEventListener("change", (e) => {
    state.disaster = e.target.value;
    state.results  = null;
    dom.resultsSection().classList.add("hidden");
    updateUI();
  });

  // Capacity input — live update
  dom.capacityInput().addEventListener("input", (e) => {
    state.capacity = parseFloat(e.target.value) || 0;
    saveToLocalStorage();
  });

  // Add/Save item
  dom.btnAdd().addEventListener("click", handleAddItem);

  // Cancel edit
  dom.btnCancelEdit().addEventListener("click", cancelEdit);

  // Run optimization
  dom.btnRun().addEventListener("click", handleRunOptimization);

  // Reset
  dom.btnReset().addEventListener("click", handleReset);

  // Theme toggle
  dom.btnTheme().addEventListener("click", toggleTheme);

  // Enter key submits item form
  ["item-name", "item-weight", "item-priority"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAddItem();
    });
  });
}

// ─────────────────────────────────────────────
// 13. INITIALIZATION
// ─────────────────────────────────────────────

/**
 * Bootstraps the application on DOM ready.
 * Loads saved state, syncs form fields, and renders initial UI.
 */
function init() {
  // Load persisted state
  loadFromLocalStorage();

  // Apply saved theme
  document.documentElement.setAttribute("data-theme", state.theme);
  const isDark = state.theme === "dark";
  dom.themeIconDark().classList.toggle("hidden", !isDark);
  dom.themeIconLight().classList.toggle("hidden", isDark);

  // Sync form fields with loaded state
  if (state.disaster) dom.disasterSelect().value = state.disaster;
  if (state.capacity) dom.capacityInput().value  = state.capacity;

  // Make edit/delete functions globally accessible from inline HTML
  window.deleteItem = deleteItem;
  window.startEdit  = startEdit;

  // Bind all events
  bindEvents();

  // Initial render
  updateUI();

  // Show welcome toast if no data loaded
  if (state.items.length === 0) {
    setTimeout(() => showToast("Welcome! Select a disaster and add items to begin.", "info"), 500);
  } else {
    setTimeout(() => showToast(`Loaded ${state.items.length} saved items.`, "success"), 400);
  }
}

// Start the application when DOM is fully loaded
document.addEventListener("DOMContentLoaded", init);
