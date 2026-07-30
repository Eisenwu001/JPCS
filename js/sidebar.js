// js/sidebar.js
import { auth } from "./firebase.js";
import { openPasswordModal, handleSignOut } from "./auth.js";
import { store } from "./store.js";
import { confirmAction } from "./ui.js";

const STORAGE_KEY_THEME = "jpcs-theme";
const STORAGE_KEY_RAIL = "jpcs-sidebar-expanded";
const MOBILE_QUERY = "(max-width: 768px)";

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

  // Default rail state
  setRailExpanded(localStorage.getItem(STORAGE_KEY_RAIL) === "true");

  railToggle?.addEventListener("click", () => {
    setRailExpanded(!appShell.classList.contains("sidebar-expanded"));
  });

  // ---------- Shared ----------

  window.addEventListener("resize", () => {
    // Phones rotate, browser chrome resizes — keep the active pill honest.
    moveIndicatorTo(document.querySelector(".nav-item.active"));
  });

  window.addEventListener("hashchange", () => {
    setTimeout(() => {
      moveIndicatorTo(document.querySelector(".nav-item.active"));
    }, 50);
  });

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      navItems.forEach((el) => el.classList.remove("active"));
      item.classList.add("active");
      moveIndicatorTo(item);
      if (isMobile()) closeMobileDrawer();
    });
  });

  // Delay slightly to allow the router to set the correct active class on load
  setTimeout(() => {
    moveIndicatorTo(document.querySelector(".nav-item.active"));
  }, 100);
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