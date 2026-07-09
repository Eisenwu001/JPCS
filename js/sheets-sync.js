// js/sheets-sync.js
//
// HOW THIS WORKS: your Ctrl+Alt+J admin login (Google or email+password)
// is completely separate from this. Connecting Sheets asks Google for
// one additional, narrow permission — write access to your spreadsheets
// — via its own popup, so people who just want the simple admin login
// are never shown an extra consent screen they didn't ask for.
//
// WHAT "AUTOMATIC" ACTUALLY MEANS HERE: every local ledger change
// (add/edit/delete a transaction or member) queues a push to your
// Sheet, debounced by a few seconds so rapid edits become one write,
// not one per keystroke. This only runs while this browser tab is open
// and connected — there's no 24/7 background sync (see the README note
// on why that would need a real backend instead).
//
// TOKEN LIFETIME: Google's access token is short-lived (roughly an
// hour). There's no silent refresh — when it expires, the next push
// fails with a clear "reconnect" message instead of failing silently
// forever.

import { GoogleAuthProvider, signInWithPopup } from "../assets/vendor/firebase.bundle.js";
import { sheetsAuthInstance as auth } from "./firebase.js";
import { store } from "./store.js";
import { getData } from "./data.js";
import { showToast } from "./ui.js";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SETTINGS_KEY = "jpcs_sheets_sync_settings"; // { spreadsheetId }
const DEBOUNCE_MS = 2500;

let accessToken = null; // in-memory only — never persisted, since it's short-lived anyway
let debounceTimer = null;
let unsubscribeData = null;

export function getSheetsSyncSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function setSpreadsheetId(id) {
  const settings = getSheetsSyncSettings();
  settings.spreadsheetId = id.trim();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function isConnected() {
  return !!accessToken;
}

export async function connectGoogleSheets() {
  const provider = new GoogleAuthProvider();
  provider.addScope(SHEETS_SCOPE);
  // Forces Google to actually show the consent screen and hand back a
  // token with the Sheets scope, even if this Google account has
  // signed into this app before without it.
  provider.setCustomParameters({ prompt: "consent" });

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    accessToken = credential?.accessToken || null;
  } catch (err) {
    console.error("Sheets connection error:", err);
    if (err.code === "auth/unauthorized-domain") {
      const currentDomain = window.location.hostname;
      throw new Error(`This domain (${currentDomain}) is not authorized in your Firebase Project. Go to Firebase Console -> Authentication -> Settings -> Authorized Domains, and add "${currentDomain}" to the list.`);
    }
    if (err.code === "auth/popup-blocked") {
      throw new Error("Google Sheets sign-in popup was blocked by your browser. Please allow popups for this site and try again.");
    }
    throw new Error(err.message || "Failed to authenticate with Google. Please try again.");
  }

  if (!accessToken) {
    throw new Error("Google didn't grant Sheets access. Please try connecting again.");
  }
  return true;
}

export function disconnectGoogleSheets() {
  accessToken = null;
}

async function sheetsApiRequest(pathAndQuery, options = {}) {
  if (!accessToken) throw new Error("Not connected to Google Sheets.");

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${pathAndQuery}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    accessToken = null;
    throw new Error("Your Google Sheets connection expired. Reconnect in Settings.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 403) {
      throw new Error("Access denied (403). Make sure you checked/ticked the Google Sheets permission box on Google's permission consent screen when connecting!");
    }
    throw new Error(`Sheets API error (${res.status}). ${body.slice(0, 150)}`);
  }
  // :clear and :batchUpdate return small bodies; safe to parse as JSON either way.
  return res.json().catch(() => ({}));
}

async function ensureSheetTabsExist(spreadsheetId) {
  const meta = await sheetsApiRequest(spreadsheetId);
  const existingTitles = (meta.sheets || []).map((s) => s.properties.title);
  const needed = ["Transactions", "Members"].filter((t) => !existingTitles.includes(t));
  if (needed.length === 0) return;

  await sheetsApiRequest(`${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: needed.map((title) => ({ addSheet: { properties: { title } } })),
    }),
  });
}

async function writeTab(spreadsheetId, tabName, rows) {
  // Clear the full column range first — otherwise a shrinking dataset
  // (e.g. after deleting rows) would leave stale rows behind past
  // wherever the new, shorter data ends.
  const clearRange = `${tabName}!A:Z`;
  await sheetsApiRequest(`${spreadsheetId}/values/${encodeURIComponent(clearRange)}:clear`, { method: "POST" });
  
  const updateRange = `${tabName}!A1`;
  await sheetsApiRequest(`${spreadsheetId}/values/${encodeURIComponent(updateRange)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({
      range: updateRange,
      majorDimension: "ROWS",
      values: rows,
    }),
  });
}

async function pushNow() {
  const { spreadsheetId } = getSheetsSyncSettings();
  if (!accessToken) throw new Error("Not connected to Google Sheets. Connect in Settings first.");
  if (!spreadsheetId) throw new Error("No spreadsheet set. Paste a Spreadsheet ID in Settings first.");

  const data = getData();
  await ensureSheetTabsExist(spreadsheetId);

  const sortedTxns = [...data.transactions].sort((a, b) => (a.date < b.date ? -1 : 1));
  const txnRows = [
    ["Date", "Category", "Note", "Type", "Amount (₱)"],
    ...sortedTxns.map((t) => [
      t.date, t.category, t.note || "", t.type,
      (t.amount / 100) * (t.type === "expense" ? -1 : 1),
    ]),
  ];

  const memberRows = [
    ["Name", "Course", "Year Level", "Contact"],
    ...data.members.map((m) => [m.name, m.course || "", m.yearLevel || "", m.contact || ""]),
  ];

  await writeTab(spreadsheetId, "Transactions", txnRows);
  await writeTab(spreadsheetId, "Members", memberRows);

  store.set("sheetsLastSynced", new Date());
}

export async function pushToSheetsNow() {
  try {
    await pushNow();
    showToast("Synced to Google Sheets", "success");
    return true;
  } catch (err) {
    console.error("Sheets sync failed:", err);
    showToast(err.message || "Sheets sync failed", "error");
    return false;
  }
}

/** Call once at startup. Auto-pushes (debounced) whenever the local
 * ledger changes — but only once connected and a spreadsheet is set,
 * so this is a silent no-op for everyone who hasn't opted in. */
export function initAutoSync() {
  unsubscribeData?.();
  unsubscribeData = store.subscribe("data", () => {
    if (!accessToken) return;
    const { spreadsheetId } = getSheetsSyncSettings();
    if (!spreadsheetId) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        await pushNow();
      } catch (err) {
        console.error("Auto-sync to Sheets failed:", err);
        showToast(err.message || "Sheets sync failed. Check Settings", "error");
      }
    }, DEBOUNCE_MS);
  });
}