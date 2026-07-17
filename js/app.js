// js/app.js
// Entry point loaded by index.html.

import { router } from "./router.js";
import { store } from "./store.js";
import { initSidebar, initThemeToggle, initSidebarFooter } from "./sidebar.js";
import { initAdminGate } from "./auth.js";
import { renderDashboard, initBalanceModal, initChartDetailModal, initCategoryToggle, initTimeframeToggle } from "./dashboard.js";
import { renderMembers, initMemberModal } from "./members.js";
import { renderEvents, initEventModal, initManagePaymentsModal } from "./events.js";
import { renderTransactions, initTransactionModal } from "./transactions.js";
import { renderSettings } from "./settings.js";
import { renderReports } from "./reports.js";
import { renderTracker, initTaskModal } from "./tracker.js";
import { renderCalendar } from "./calendar.js";
import { closeModal } from "./ui.js";
import { initAutoSync } from "./sheets-sync.js";
import { initCloudLedgerSync } from "./data.js";
import { initGlobalSearch } from "./search.js";

router.register("#/dashboard", () => renderDashboard());
router.register("#/members", () => renderMembers());
router.register("#/events", () => renderEvents());
router.register("#/transactions", () => renderTransactions());
router.register("#/settings", () => renderSettings());
router.register("#/reports", () => renderReports());
router.register("#/tracker", () => renderTracker());
router.register("#/calendar", () => renderCalendar());

document.addEventListener("DOMContentLoaded", () => {
  initCloudLedgerSync();
  initSidebar();
  initSidebarFooter();
  initThemeToggle();
  initAdminGate();
  initBalanceModal();
  initChartDetailModal();
  initCategoryToggle();
  initTimeframeToggle();
  initAutoSync();
  initMemberModal();
  initEventModal();
  initTransactionModal();
  initManagePaymentsModal();
  initTaskModal();
  initGlobalSearch();

  const imagePreviewOverlay = document.querySelector(".image-preview-overlay");
  imagePreviewOverlay?.querySelector(".modal-close-btn")?.addEventListener("click", () => closeModal(imagePreviewOverlay));
  imagePreviewOverlay?.addEventListener("click", (e) => { if (e.target === imagePreviewOverlay) closeModal(imagePreviewOverlay); });

  // Re-render whatever section is on screen whenever admin mode flips
  // or the underlying data changes (e.g. a payment gets marked paid).
  store.subscribe("isAdmin", (isAdmin) => {
    router.rerenderCurrent();
  });
  store.subscribe("data", () => router.rerenderCurrent());

  if (window.lucide) window.lucide.createIcons();
  router.start();
});