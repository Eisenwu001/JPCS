// js/search.js
import { store } from "./store.js";
import { getData } from "./data.js";
import { router } from "./router.js";
import { formatMoney, formatDate } from "./utils.js";

export function initGlobalSearch() {
  const searchContainer = document.querySelector(".topbar-search");
  const input = searchContainer?.querySelector("input");
  if (!input) return;

  let activeIndex = -1;
  let items = [];

  // Listen for input to search
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    renderSearchResults(query);
  });

  // Handle keyboard navigation & escape/enter
  input.addEventListener("keydown", (e) => {
    const dropdown = searchContainer.querySelector(".topbar-search-results");
    if (!dropdown) return;

    items = Array.from(dropdown.querySelectorAll(".search-item"));
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActiveItem();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActiveItem();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < items.length) {
        items[activeIndex].click();
      } else {
        // If nothing is highlighted, select the first item
        items[0].click();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown();
    }
  });

  // Close dropdown on click outside
  document.addEventListener("click", (e) => {
    if (!searchContainer.contains(e.target)) {
      closeDropdown();
    }
  });

  function updateActiveItem() {
    items.forEach((item, index) => {
      if (index === activeIndex) {
        item.classList.add("selected");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("selected");
      }
    });
  }

  function closeDropdown() {
    const dropdown = searchContainer.querySelector(".topbar-search-results");
    if (dropdown) dropdown.remove();
    activeIndex = -1;
    items = [];
  }

  function renderSearchResults(query) {
    // Remove existing dropdown
    const existingDropdown = searchContainer.querySelector(".topbar-search-results");
    if (existingDropdown) existingDropdown.remove();

    activeIndex = -1;
    items = [];

    if (!query) return;

    const data = getData();
    const members = data.members || [];
    const events = data.events || [];
    const transactions = data.transactions || [];

    // Filter members
    const matchedMembers = members.filter(m => 
      (m.name || "").toLowerCase().includes(query) ||
      (m.nickname || "").toLowerCase().includes(query) ||
      (m.officerRole || "").toLowerCase().includes(query) ||
      (m.course || "").toLowerCase().includes(query)
    );

    // Filter events
    const matchedEvents = events.filter(e => 
      (e.title || "").toLowerCase().includes(query) ||
      (e.description || "").toLowerCase().includes(query)
    );

    // Filter transactions
    const matchedTransactions = transactions.filter(t => 
      (t.category || "").toLowerCase().includes(query) ||
      (t.note || "").toLowerCase().includes(query) ||
      (t.type || "").toLowerCase().includes(query)
    );

    const totalResults = matchedMembers.length + matchedEvents.length + matchedTransactions.length;

    const dropdown = document.createElement("div");
    dropdown.className = "topbar-search-results";

    if (totalResults === 0) {
      dropdown.innerHTML = `<div class="search-empty">No results found for "${query}"</div>`;
      searchContainer.appendChild(dropdown);
      return;
    }

    let html = "";

    // 1. Members group
    if (matchedMembers.length > 0) {
      html += `<div class="search-group-header">Members (${matchedMembers.length})</div>`;
      matchedMembers.forEach(m => {
        const subtitle = `${m.officerRole || "Member"} · ${m.course || "No Course"} · ${m.yearLevel || ""}`;
        html += `
          <div class="search-item" data-type="member" data-id="${m.id}">
            <div class="search-item-icon member">
              <i data-lucide="user"></i>
            </div>
            <div class="search-item-info">
              <div class="search-item-title">${m.name}${m.nickname ? ` (${m.nickname})` : ""}</div>
              <div class="search-item-subtitle">${subtitle}</div>
            </div>
          </div>
        `;
      });
    }

    // 2. Events group
    if (matchedEvents.length > 0) {
      html += `<div class="search-group-header">Events (${matchedEvents.length})</div>`;
      matchedEvents.forEach(e => {
        const subtitle = `${formatDate(e.date)} · ${e.description || "No description"}`;
        html += `
          <div class="search-item" data-type="event" data-id="${e.id}">
            <div class="search-item-icon event">
              <i data-lucide="calendar"></i>
            </div>
            <div class="search-item-info">
              <div class="search-item-title">${e.title}</div>
              <div class="search-item-subtitle">${subtitle}</div>
            </div>
            <div class="search-item-meta">
              ${formatMoney(e.feeCentavos)}
            </div>
          </div>
        `;
      });
    }

    // 3. Transactions group
    if (matchedTransactions.length > 0) {
      html += `<div class="search-group-header">Transactions (${matchedTransactions.length})</div>`;
      matchedTransactions.forEach(t => {
        const subtitle = `${formatDate(t.date)} · ${t.note || "No note"}`;
        const typeLabel = t.type === "income" ? "Inflow" : "Outflow";
        html += `
          <div class="search-item" data-type="transaction" data-id="${t.id}">
            <div class="search-item-icon transaction">
              <i data-lucide="wallet"></i>
            </div>
            <div class="search-item-info">
              <div class="search-item-title">${t.category}</div>
              <div class="search-item-subtitle">${subtitle} · ${typeLabel}</div>
            </div>
            <div class="search-item-meta ${t.type === "income" ? "text-income" : "text-expense"}">
              ${t.type === "income" ? "+" : "−"}${formatMoney(t.amount)}
            </div>
          </div>
        `;
      });
    }

    dropdown.innerHTML = html;
    searchContainer.appendChild(dropdown);

    if (window.lucide) window.lucide.createIcons();

    // Attach click events
    dropdown.querySelectorAll(".search-item").forEach(item => {
      item.addEventListener("click", () => {
        const type = item.dataset.type;
        const id = item.dataset.id;

        // Set search highlight target in store
        store.set("highlightTarget", { type, id });

        // Navigate to the correct page
        const targetHash = type === "member" ? "#/members" : type === "event" ? "#/events" : "#/transactions";
        if (window.location.hash === targetHash) {
          router.rerenderCurrent();
        } else {
          router.navigate(targetHash);
        }

        // Clear search input and close dropdown
        input.value = "";
        closeDropdown();
      });
    });
  }
}
