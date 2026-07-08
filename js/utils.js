// js/utils.js
// Cross-cutting helpers used by every module. Two rules baked in here
// on purpose:
//   1. Money is NEVER a float in this app. Firestore stores integer
//      centavos (₱1.00 = 100). formatMoney() is the only place a peso
//      sign appears.
//   2. Dates are stored as Firestore Timestamps, formatted only at
//      render time, so sorting/filtering by date stays server-accurate.

/** Convert a peso amount typed by a user (e.g. "150.50") into integer centavos. */
export function pesosToCentavos(pesoString) {
  const value = Number(pesoString);
  if (Number.isNaN(value)) throw new Error("Invalid amount");
  return Math.round(value * 100);
}

/** Format integer centavos as a ₱-prefixed display string. */
export function formatMoney(centavos) {
  const pesos = centavos / 100;
  return `₱${pesos.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format a Firestore Timestamp (or Date) as "Jan 5, 2026". */
export function formatDate(timestamp) {
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

/** Debounce for search inputs — avoids firing a query on every keystroke. */
export function debounce(fn, delayMs = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

/** Human-readable reference number: TXN-20260701-XXXX */
export function generateReferenceNumber(prefix = "TXN") {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${datePart}-${randomPart}`;
}

/** Split an array into chunks of at most `size` — used for Firestore
 * batched writes, which cap at 500 operations per batch. */
export function chunkArray(array, size = 450) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/** Percent change from `previous` to `current`, for stat-card trend
 * indicators. Returns null when there's nothing meaningful to show
 * (both zero) — a 0% vs 0% "no change" badge is just visual noise.
 * When `previous` is zero but `current` isn't, there's no valid
 * percentage (division by zero), so this returns isNew instead of a
 * misleading number. */
export function computeDelta(current, previous) {
  if (current === 0 && previous === 0) return null;
  if (previous === 0) return { pct: null, isNew: true, direction: "up" };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct, isNew: false, direction: pct >= 0 ? "up" : "down" };
}