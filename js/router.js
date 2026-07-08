// js/router.js
//
// WHY: index.html hosts every module (Dashboard, Members, Transactions...)
// as a single page — reloading the whole app on every sidebar click would
// re-run Firebase auth checks and feel slow. A tiny hash router
// (#/dashboard, #/members) swaps the visible <section> without a reload,
// keeps the URL bookmarkable/shareable, and needs zero build tooling.

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
