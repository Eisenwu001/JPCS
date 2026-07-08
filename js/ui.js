// js/ui.js
// Small cross-cutting UI helpers shared by every module: toasts,
// modal open/close, and the "coming in a later build step" placeholder
// used by sections that aren't wired to Firebase yet.

export function showToast(message, type = "info") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    Object.assign(container.style, {
      position: "fixed", bottom: "20px", right: "20px", zIndex: 2000,
      display: "flex", flexDirection: "column", gap: "8px",
    });
    document.body.appendChild(container);
  }
  const colors = { info: "#2563eb", success: "#16a34a", error: "#dc2626" };
  const toast = document.createElement("div");
  toast.textContent = message;
  Object.assign(toast.style, {
    background: colors[type] || colors.info, color: "white",
    padding: "10px 16px", borderRadius: "8px", fontSize: "13.5px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)", opacity: "0",
    transition: "opacity 200ms ease",
  });
  container.appendChild(toast);
  requestAnimationFrame(() => (toast.style.opacity = "1"));
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

export function renderPlaceholderSection(sectionEl, { icon, title, note }) {
  sectionEl.innerHTML = `
    <div class="card empty-state">
      <i data-lucide="${icon}"></i>
      <h3>${title}</h3>
      <p>${note}</p>
    </div>`;
  if (window.lucide) window.lucide.createIcons();
}

export function openModal(overlayEl) {
  overlayEl?.classList.add("open");
  overlayEl?.querySelector("input, textarea, select")?.focus();
}

export function closeModal(overlayEl) {
  overlayEl?.classList.remove("open");
}

/** Lightweight confirm dialog — used before delete actions, per the
 * original spec's "confirmation dialogs before deleting records"
 * requirement. Returns a Promise<boolean>. */
export function confirmAction(message) {
  return new Promise((resolve) => {
    const overlay = document.querySelector(".confirm-modal-overlay");
    const messageEl = overlay.querySelector(".confirm-modal-message");
    const yesBtn = overlay.querySelector(".confirm-modal-yes");
    const noBtn = overlay.querySelector(".confirm-modal-no");

    messageEl.textContent = message;
    overlay.classList.add("open");

    function cleanup(result) {
      overlay.classList.remove("open");
      yesBtn.removeEventListener("click", onYes);
      noBtn.removeEventListener("click", onNo);
      resolve(result);
    }
    function onYes() { cleanup(true); }
    function onNo() { cleanup(false); }

    yesBtn.addEventListener("click", onYes);
    noBtn.addEventListener("click", onNo);
  });
}
