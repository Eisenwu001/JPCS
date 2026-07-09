// js/sidebar.js
// Two different behaviors, picked by screen width, not one compromise:

import { auth } from "./firebase.js";
import { openPasswordModal, handleSignOut } from "./auth.js";
import { store } from "./store.js";
import { confirmAction } from "./ui.js";
//   - Desktop/tablet: the sidebar is a persistent icon rail, expandable
//     to full width via the chevron in its header. Your choice is
//     remembered across visits.
//   - Mobile: unchanged from before — hidden off-canvas, opened via the
//     hamburger as a full overlay with a dimmed backdrop.

const STORAGE_KEY_THEME = "jpcs-theme";
const STORAGE_KEY_RAIL = "jpcs-sidebar-expanded";
const MOBILE_QUERY = "(max-width: 768px)";

// Lucide replaces <i data-lucide="x"> with an <svg> on first render, so
// a later `.querySelector("i")` to swap the icon finds nothing and
// silently no-ops — this was quietly broken for the theme toggle before
// (the moon never became a sun after the first click). Rebuilding a
// fresh <i> tag and letting Lucide convert it again sidesteps that,
// regardless of which tag currently sits in the button.
function setIcon(container, iconName) {
  if (!container) return;
  container.innerHTML = `<i data-lucide="${iconName}"></i>`;
  if (window.lucide) window.lucide.createIcons();
}

export function initSidebar() {
  const appShell = document.querySelector(".app-shell");
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.querySelector(".sidebar-backdrop");
  const hamburger = document.querySelector(".hamburger-btn");
  const closeBtn = document.querySelector(".sidebar-close-btn");
  const railToggle = document.querySelector(".sidebar-rail-toggle");
  const navItems = document.querySelectorAll(".nav-item");
  const indicator = document.querySelector(".nav-indicator");

  function isMobile() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function moveIndicatorTo(item) {
    if (!item || !indicator) return;
    indicator.style.opacity = "1";
    indicator.style.transform = `translateY(${item.offsetTop}px)`;
  }

  // ---------- Mobile: hidden overlay drawer ----------

  function openMobileDrawer() {
    sidebar.classList.add("open");
    backdrop.classList.add("open");
    hamburger?.classList.add("is-hidden");
    moveIndicatorTo(document.querySelector(".nav-item.active"));
  }

  function closeMobileDrawer() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
    hamburger?.classList.remove("is-hidden");
  }

  hamburger?.addEventListener("click", openMobileDrawer);
  closeBtn?.addEventListener("click", closeMobileDrawer);
  backdrop?.addEventListener("click", closeMobileDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isMobile() && sidebar.classList.contains("open")) closeMobileDrawer();
  });

  // ---------- Desktop/tablet: persistent rail ----------

  function setRailExpanded(expanded) {
    appShell.classList.toggle("sidebar-expanded", expanded);
    setIcon(railToggle, expanded ? "chevrons-left" : "chevrons-right");
    localStorage.setItem(STORAGE_KEY_RAIL, expanded ? "true" : "false");
  }

  // Default collapsed (rail-only) unless the visitor has expanded it
  // before — matches the "minimal by default" spirit of the original
  // hidden-sidebar request, while still keeping icons visible always.
  setRailExpanded(localStorage.getItem(STORAGE_KEY_RAIL) === "true");

  railToggle?.addEventListener("click", () => {
    setRailExpanded(!appShell.classList.contains("sidebar-expanded"));
  });

  // ---------- Shared ----------

  window.addEventListener("resize", () => {
    // Phones rotate, browser chrome resizes — keep the active pill honest.
    moveIndicatorTo(document.querySelector(".nav-item.active"));
  });

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      navItems.forEach((el) => el.classList.remove("active"));
      item.classList.add("active");
      moveIndicatorTo(item);
      // Only the mobile drawer is meant to close on navigation — the
      // desktop rail is a persistent fixture, closing it on every click
      // would undo the point of it being always there.
      if (isMobile()) closeMobileDrawer();
    });
  });

  moveIndicatorTo(document.querySelector(".nav-item.active"));
}

export function initThemeToggle() {
  const toggleBtn = document.querySelector(".theme-toggle");
  const root = document.documentElement;

  const saved = localStorage.getItem(STORAGE_KEY_THEME);
  if (saved === "dark") root.setAttribute("data-theme", "dark");
  updateIcon();

  toggleBtn?.addEventListener("click", () => {
    const isDark = root.getAttribute("data-theme") === "dark";
    let newTheme = "dark";
    if (isDark) {
      root.removeAttribute("data-theme");
      localStorage.setItem(STORAGE_KEY_THEME, "light");
      newTheme = "light";
    } else {
      root.setAttribute("data-theme", "dark");
      localStorage.setItem(STORAGE_KEY_THEME, "dark");
    }
    updateIcon();
    document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: newTheme } }));
  });

  function updateIcon() {
    const isDark = root.getAttribute("data-theme") === "dark";
    setIcon(toggleBtn, isDark ? "sun" : "moon");
  }
}

export function initSidebarFooter() {
  const footerEl = document.getElementById("sidebarFooter");
  if (!footerEl) return;

  // Subscribe to isAdmin to dynamically re-render the footer
  store.subscribe("isAdmin", (isAdmin) => {
    const user = auth.currentUser;
    const name = (user && user.displayName) ? user.displayName : (isAdmin ? "Admin Officer" : "Guest Officer");
    const role = isAdmin ? "Full Access" : "Read-only Access";
    const initials = isAdmin ? "AD" : "GU";
    const iconName = isAdmin ? "log-out" : "log-in";

    footerEl.innerHTML = `
      <div class="footer-avatar" id="footerAvatar">${initials}</div>
      <div class="footer-info">
        <div class="footer-name">${name}</div>
        <div class="footer-role">${role}</div>
      </div>
      <button class="footer-action" id="footerAuthBtn" title="${isAdmin ? 'Sign Out' : 'Sign In'}" aria-label="${isAdmin ? 'Sign Out' : 'Sign In'}">
        <i data-lucide="${iconName}"></i>
      </button>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Wire up events
    document.getElementById("footerAuthBtn")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (isAdmin) {
        const confirm = await confirmAction("Are you sure you want to sign out?");
        if (confirm) {
          handleSignOut();
        }
      } else {
        openPasswordModal();
      }
    });
  });
}