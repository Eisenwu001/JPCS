// js/transactions.js
import { store } from "./store.js";
import { getData, addTransaction, updateTransaction, deleteTransaction } from "./data.js";
import { formatMoney, formatDate, pesosToCentavos } from "./utils.js";
import { openModal, closeModal, confirmAction, showToast } from "./ui.js";

// Persistent filter state for the active session
let filterSearch = "";
let filterType = "all";
let filterCategory = "all";
let filterSort = "newest";

export function renderTransactions() {
  const isAdmin = store.get("isAdmin");
  const sectionEl = document.querySelector('section[data-route="#/transactions"]');
  if (!sectionEl) return;

  const data = getData();

  // If outer shell isn't rendered yet, render it once to preserve focus when typing
  if (!sectionEl.querySelector(".txn-filters-bar")) {
    sectionEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <div>
          <h2 style="margin:0 0 4px;">Transactions</h2>
          <p style="color:var(--color-text-secondary); margin:0; font-size:14px;">
            Full ledger. Event payments post here automatically.
          </p>
        </div>
        ${isAdmin ? `<button class="btn btn-primary" id="addTxnBtn"><i data-lucide="plus" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;"></i>Add Transaction</button>` : ""}
      </div>

      <!-- Filters Bar -->
      <div class="txn-filters-bar" style="display: flex; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-4); align-items: center;">
        <div style="flex: 1; min-width: 200px; position: relative;">
          <input type="text" id="txnSearchInput" class="form-control" placeholder="Search category, note, vendor..." style="padding-left: 36px;" />
          <i data-lucide="search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: var(--color-text-secondary); pointer-events: none;"></i>
        </div>
        <div style="width: 140px;">
          <select id="txnTypeFilter" class="form-control" aria-label="Filter by Type">
            <option value="all">All Types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </div>
        <div style="width: 160px;">
          <select id="txnCategoryFilter" class="form-control" aria-label="Filter by Category">
            <option value="all">All Categories</option>
          </select>
        </div>
        <div style="width: 180px;">
          <select id="txnSortFilter" class="form-control" aria-label="Sort Transactions">
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="amount-high">Amount: High to Low</option>
            <option value="amount-low">Amount: Low to High</option>
          </select>
        </div>
        <button class="btn btn-secondary" id="clearTxnFiltersBtn" style="display: none; align-items: center; gap: 6px; padding: var(--space-2) var(--space-3); height: 38px;">
          <i data-lucide="filter-x" style="width: 15px; height: 15px;"></i>
          Clear
        </button>
      </div>

      <div id="txnContentArea"></div>
    `;

    // Bind event listeners for filters
    const searchIn = sectionEl.querySelector("#txnSearchInput");
    const typeFilt = sectionEl.querySelector("#txnTypeFilter");
    const catFilt = sectionEl.querySelector("#txnCategoryFilter");
    const sortFilt = sectionEl.querySelector("#txnSortFilter");
    const clearBtn = sectionEl.querySelector("#clearTxnFiltersBtn");

    searchIn.addEventListener("input", (e) => {
      filterSearch = e.target.value.trim().toLowerCase();
      applyFiltersAndRenderTable();
    });

    typeFilt.addEventListener("change", (e) => {
      filterType = e.target.value;
      applyFiltersAndRenderTable();
    });

    catFilt.addEventListener("change", (e) => {
      filterCategory = e.target.value;
      applyFiltersAndRenderTable();
    });

    sortFilt.addEventListener("change", (e) => {
      filterSort = e.target.value;
      applyFiltersAndRenderTable();
    });

    clearBtn.addEventListener("click", () => {
      filterSearch = "";
      filterType = "all";
      filterCategory = "all";
      filterSort = "newest";

      searchIn.value = "";
      typeFilt.value = "all";
      catFilt.value = "all";
      sortFilt.value = "newest";

      applyFiltersAndRenderTable();
    });

    // Addtxn button wireup
    document.getElementById("addTxnBtn")?.addEventListener("click", () => openModal(document.querySelector(".txn-modal-overlay")));
  } else {
    // Keep filter input elements updated if we've re-rendered externally (e.g. state/data sync)
    // but without clearing focus if the user is typing
    const searchIn = sectionEl.querySelector("#txnSearchInput");
    if (searchIn && document.activeElement !== searchIn) {
      searchIn.value = filterSearch;
    }
    const typeFilt = sectionEl.querySelector("#txnTypeFilter");
    if (typeFilt) typeFilt.value = filterType;
    const sortFilt = sectionEl.querySelector("#txnSortFilter");
    if (sortFilt) sortFilt.value = filterSort;
  }

  applyFiltersAndRenderTable();
}

function applyFiltersAndRenderTable() {
  const isAdmin = store.get("isAdmin");
  const data = getData();
  const txns = data.transactions || [];
  const sectionEl = document.querySelector('section[data-route="#/transactions"]');
  if (!sectionEl) return;

  const contentArea = sectionEl.querySelector("#txnContentArea");
  if (!contentArea) return;

  // 1. Populate category filter options based on all current transactions in database
  const catFilter = sectionEl.querySelector("#txnCategoryFilter");
  if (catFilter) {
    const currentVal = catFilter.value;
    const categories = Array.from(new Set(txns.map((t) => t.category))).filter(Boolean).sort();
    
    catFilter.innerHTML = `<option value="all">All Categories</option>` + 
      categories.map((c) => `<option value="${c}">${c}</option>`).join("");
    
    if (categories.includes(filterCategory)) {
      catFilter.value = filterCategory;
    } else {
      catFilter.value = "all";
      filterCategory = "all";
    }
  }

  // 2. Filter transactions
  let filtered = [...txns];

  // Search filter
  if (filterSearch) {
    filtered = filtered.filter((t) => {
      const cat = (t.category || "").toLowerCase();
      const note = (t.note || "").toLowerCase();
      return cat.includes(filterSearch) || note.includes(filterSearch);
    });
  }

  // Type filter
  if (filterType !== "all") {
    filtered = filtered.filter((t) => t.type === filterType);
  }

  // Category filter
  if (filterCategory !== "all") {
    filtered = filtered.filter((t) => t.category === filterCategory);
  }

  // 3. Sort transactions
  if (filterSort === "newest") {
    filtered.sort((a, b) => (a.date < b.date ? 1 : -1));
  } else if (filterSort === "oldest") {
    filtered.sort((a, b) => (a.date > b.date ? 1 : -1));
  } else if (filterSort === "amount-high") {
    filtered.sort((a, b) => b.amount - a.amount);
  } else if (filterSort === "amount-low") {
    filtered.sort((a, b) => a.amount - b.amount);
  }

  // Show/hide Clear Filters button
  const clearBtn = sectionEl.querySelector("#clearTxnFiltersBtn");
  const isAnyFilterActive = filterSearch !== "" || filterType !== "all" || filterCategory !== "all";
  if (clearBtn) {
    clearBtn.style.display = isAnyFilterActive ? "inline-flex" : "none";
  }

  // 4. Render main view
  if (txns.length === 0) {
    // DB is completely empty
    contentArea.innerHTML = `
      <div class="card" style="padding: 0;">
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px var(--space-4); text-align: center;">
          <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(234, 88, 12, 0.1); display: flex; align-items: center; justify-content: center; margin-bottom: var(--space-4); color: var(--color-accent); border: 1px solid rgba(234, 88, 12, 0.15);">
            <i data-lucide="receipt" style="width: 24px; height: 24px;"></i>
          </div>
          <h3 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; font-family: var(--font-display);">No transactions recorded yet</h3>
          <p style="color: var(--color-text-secondary); font-size: 13.5px; max-width: 360px; margin: 0 0 var(--space-4); line-height: 1.5;">
            There are currently no transactions logged in your organization's ledger. Add a transaction manually or approve event payments.
          </p>
          ${isAdmin ? `
          <button class="btn btn-primary" id="emptyStateAddBtn" style="display: flex; align-items: center; gap: 6px;">
            <i data-lucide="plus" style="width: 14px; height: 14px;"></i>
            Add Your First Transaction
          </button>
          ` : ""}
        </div>
      </div>
    `;

    document.getElementById("emptyStateAddBtn")?.addEventListener("click", () => {
      openModal(document.querySelector(".txn-modal-overlay"));
    });

  } else if (filtered.length === 0) {
    // Filtered results are empty
    contentArea.innerHTML = `
      <div class="card" style="padding: 0;">
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px var(--space-4); text-align: center;">
          <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(37, 99, 235, 0.1); display: flex; align-items: center; justify-content: center; margin-bottom: var(--space-4); color: var(--color-info); border: 1px solid rgba(37, 99, 235, 0.15);">
            <i data-lucide="search-code" style="width: 24px; height: 24px;"></i>
          </div>
          <h3 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; font-family: var(--font-display);">No matching transactions found</h3>
          <p style="color: var(--color-text-secondary); font-size: 13.5px; max-width: 360px; margin: 0 0 var(--space-4); line-height: 1.5;">
            We couldn't find any transactions matching your current filter criteria. Try clearing some filters or searching for something else.
          </p>
          <button class="btn btn-secondary" id="emptyStateClearBtn" style="display: flex; align-items: center; gap: 6px;">
            <i data-lucide="rotate-ccw" style="width: 14px; height: 14px;"></i>
            Reset Filters
          </button>
        </div>
      </div>
    `;

    document.getElementById("emptyStateClearBtn")?.addEventListener("click", () => {
      filterSearch = "";
      filterType = "all";
      filterCategory = "all";
      filterSort = "newest";

      const searchIn = sectionEl.querySelector("#txnSearchInput");
      const typeFilt = sectionEl.querySelector("#txnTypeFilter");
      const catFilt = sectionEl.querySelector("#txnCategoryFilter");
      const sortFilt = sectionEl.querySelector("#txnSortFilter");

      if (searchIn) searchIn.value = "";
      if (typeFilt) typeFilt.value = "all";
      if (catFilt) catFilt.value = "all";
      if (sortFilt) sortFilt.value = "newest";

      applyFiltersAndRenderTable();
    });

  } else {
    // Render the ledger table
    contentArea.innerHTML = `
      <div class="card">
        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Category</th><th>Note</th><th>Type</th><th>Date</th><th style="text-align:right;">Amount</th>${isAdmin ? "<th></th>" : ""}</tr>
            </thead>
            <tbody>
              ${filtered.map((t) => `
                <tr class="txn-row" data-id="${t.id}" style="${isAdmin ? "cursor: pointer;" : ""}">
                  <td style="font-weight: 500;">${t.category}</td>
                  <td style="color:var(--color-text-secondary); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.note || "—"}</td>
                  <td><span class="status-badge ${t.type}">${t.type === "income" ? "Income" : "Expense"}</span></td>
                  <td>${formatDate(t.date)}</td>
                  <td class="amount-cell ${t.type === "income" ? "text-income" : "text-expense"}">
                    ${t.type === "income" ? "+" : "−"}${formatMoney(t.amount)}
                  </td>
                  ${isAdmin ? `
                  <td style="text-align: right; width: 90px;" onclick="event.stopPropagation();">
                    <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                      <button class="icon-btn edit-txn-btn" data-id="${t.id}" aria-label="Edit" title="Edit Transaction" style="opacity: 0.75; transition: opacity 120ms;">
                        <i data-lucide="edit-3" style="width:14px; height:14px;"></i>
                      </button>
                      ${t.source === "manual" ? `
                      <button class="icon-btn delete-txn-btn" data-id="${t.id}" aria-label="Delete" title="Delete Transaction" style="color: var(--color-expense); opacity: 0.75; transition: opacity 120ms;">
                        <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                      </button>
                      ` : ""}
                    </div>
                  </td>
                  ` : ""}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Hook up row actions for edit modal (Admin only)
    if (isAdmin) {
      contentArea.querySelectorAll(".txn-row").forEach((row) => {
        row.addEventListener("click", () => {
          openQuickEditFor(row.dataset.id);
        });
      });

      contentArea.querySelectorAll(".edit-txn-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openQuickEditFor(btn.dataset.id);
        });
      });

      contentArea.querySelectorAll(".delete-txn-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const confirmed = await confirmAction("Delete this transaction? This can't be undone.");
          if (confirmed) {
            deleteTransaction(btn.dataset.id);
            showToast("Transaction deleted", "success");
          }
        });
      });
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

function openQuickEditFor(id) {
  const data = getData();
  const t = data.transactions.find((tx) => tx.id === id);
  if (!t) return;

  const overlay = document.querySelector(".edit-txn-modal-overlay");
  if (!overlay) return;

  const idIn = document.getElementById("editTxnIdInput");
  const typeIn = document.getElementById("editTxnTypeInput");
  const catIn = document.getElementById("editTxnCategoryInput");
  const amtIn = document.getElementById("editTxnAmountInput");
  const dateIn = document.getElementById("editTxnDateInput");
  const noteIn = document.getElementById("editTxnNoteInput");
  const warnEl = document.getElementById("editTxnWarning");

  if (idIn) idIn.value = t.id;
  if (typeIn) typeIn.value = t.type;
  if (catIn) catIn.value = t.category;
  if (amtIn) amtIn.value = (t.amount / 100).toFixed(2);
  if (dateIn) dateIn.value = t.date;
  if (noteIn) noteIn.value = t.note || "";

  if (warnEl) {
    warnEl.style.display = t.source === "event" ? "block" : "none";
  }

  openModal(overlay);
}

export function initTransactionModal() {
  const overlay = document.querySelector(".txn-modal-overlay");
  overlay?.querySelector(".modal-close-btn")?.addEventListener("click", () => closeModal(overlay));
  overlay?.addEventListener("click", (e) => { if (e.target === overlay) closeModal(overlay); });

  overlay?.querySelector("form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const type = document.getElementById("txnTypeInput").value;
    const category = document.getElementById("txnCategoryInput").value.trim();
    const amountInput = document.getElementById("txnAmountInput").value;
    const date = document.getElementById("txnDateInput").value;
    const note = document.getElementById("txnNoteInput").value.trim();

    if (!category || amountInput === "") return;

    addTransaction({ type, category, amount: pesosToCentavos(amountInput), date, note });
    showToast("Transaction added", "success");
    closeModal(overlay);
    e.target.reset();
  });

  // Initialize the Quick Edit Modal as well!
  const editOverlay = document.querySelector(".edit-txn-modal-overlay");
  editOverlay?.querySelector(".modal-close-btn")?.addEventListener("click", () => closeModal(editOverlay));
  editOverlay?.addEventListener("click", (e) => { if (e.target === editOverlay) closeModal(editOverlay); });

  editOverlay?.querySelector("form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("editTxnIdInput").value;
    const type = document.getElementById("editTxnTypeInput").value;
    const category = document.getElementById("editTxnCategoryInput").value.trim();
    const amountInput = document.getElementById("editTxnAmountInput").value;
    const date = document.getElementById("editTxnDateInput").value;
    const note = document.getElementById("editTxnNoteInput").value.trim();

    if (!id || !category || amountInput === "") return;

    updateTransaction(id, { type, category, amount: pesosToCentavos(amountInput), date, note });
    showToast("Transaction updated", "success");
    closeModal(editOverlay);
  });
}
