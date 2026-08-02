// js/router.js
// Client-side hash router for single-page navigation without full page reloads.

const routes = new Map(); // "#/members" -> async render function
let activeCleanup = null;

function register(hash, renderFn) {
  routes.set(hash, renderFn);
}

async function navigate(hash) {
  if (!routes.has(hash)) hash = "#/dashboard"; // fallback for unknown routes
  window.location.hash = hash;
}

async function handleHashChange() {
  const hash = window.location.hash || "#/dashboard";
  const render = routes.get(hash) || routes.get("#/dashboard");

  // Modules can return a cleanup function (e.g. unsubscribe Firestore
  // listeners) so switching pages doesn't leak listeners in the background.
  if (typeof activeCleanup === "function") {
    activeCleanup();
    activeCleanup = null;
  }

  document.querySelectorAll("[data-route]").forEach((el) => {
    el.classList.toggle("active", el.dataset.route === hash);
  });

  if (render) activeCleanup = await render();
}

async function rerenderCurrent() {
  const hash = window.location.hash || "#/dashboard";
  const render = routes.get(hash) || routes.get("#/dashboard");
  if (render) await render();
}

function start() {
  window.addEventListener("hashchange", handleHashChange);
  handleHashChange(); // initial load
}

export const router = { register, navigate, start, rerenderCurrent };
