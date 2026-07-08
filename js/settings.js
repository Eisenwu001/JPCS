// js/settings.js
//
// Export/Import here is a manual safety net on top of the automatic
// Firestore sync in data.js. Firestore is the real source of truth now,
// but a local export is still worth having: a way to roll back to a
// known-good state, or move data between projects if you ever migrate
// to a different Firebase project.

import { store } from "./store.js";
import { getData } from "./data.js";
import { showToast, confirmAction } from "./ui.js";
import {
  getSheetsSyncSettings, setSpreadsheetId, isConnected,
  connectGoogleSheets, disconnectGoogleSheets, pushToSheetsNow,
} from "./sheets-sync.js";

const STORAGE_KEY = "jpcs_treasury_data";

export function renderSettings() {
  const isAdmin = store.get("isAdmin");
  const sectionEl = document.querySelector('section[data-route="#/settings"]');
  const data = getData();

  sectionEl.innerHTML = `
    <h2 style="margin:0 0 4px;">Settings</h2>
    <p style="color:var(--color-text-secondary); margin:0 0 24px; font-size:14px;">Backup and restore your data.</p>

    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin:0 0 8px;">Data Backup</h3>
      <p style="font-size:13.5px; color:var(--color-text-secondary); margin:0 0 16px;">
        Your members, events, and transactions sync automatically to the cloud.
        This backup is a local safety net on top of that. Download one regularly,
        especially before a big batch of changes.
      </p>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn btn-secondary" id="exportBtn">
          <i data-lucide="download" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;"></i>Export Backup (.json)
        </button>
        ${isAdmin ? `
          <label class="btn btn-secondary" style="cursor:pointer;">
            <i data-lucide="upload" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;"></i>Import Backup
            <input type="file" id="importInput" accept="application/json" style="display:none;" />
          </label>
        ` : ""}
      </div>
    </div>

    ${isAdmin ? renderSheetsSyncSection() : ""}

    <div class="card">
      <h3 style="margin:0 0 8px;">Current Data</h3>
      <p style="font-size:13.5px; color:var(--color-text-secondary); margin:0;">
        ${data.members.length} members · ${data.events.length} events · ${data.transactions.length} transactions
      </p>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  document.getElementById("exportBtn")?.addEventListener("click", exportBackup);
  document.getElementById("importInput")?.addEventListener("change", importBackup);
  if (isAdmin) wireSheetsSyncSection();
}

function renderSheetsSyncSection() {
  const { spreadsheetId } = getSheetsSyncSettings();
  const connected = isConnected();

  return `
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <h3 style="margin:0;">Google Sheets Sync</h3>
        <span class="status-badge ${connected ? "income" : "expense"}">${connected ? "Connected" : "Not Connected"}</span>
      </div>
      <p style="font-size:13.5px; color:var(--color-text-secondary); margin:0 0 16px;">
        Pushes your Transactions and Members tables to a Google Sheet you own,
        automatically whenever something changes while this tab is open. This is
        separate from your admin login. Connecting asks Google for one extra,
        narrow permission (write access to Sheets), nothing more.
      </p>

      <div class="form-group">
        <label for="spreadsheetIdInput">Spreadsheet ID</label>
        <input type="text" id="spreadsheetIdInput" class="form-control" placeholder="the long ID in your Sheet's URL, between /d/ and /edit" value="${spreadsheetId || ""}" />
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        ${connected
          ? `<button class="btn btn-secondary" id="disconnectSheetsBtn">Disconnect</button>
             <button class="btn btn-primary" id="syncNowBtn">Sync Now</button>`
          : `<button class="btn btn-primary" id="connectSheetsBtn">Connect Google Sheets</button>`
        }
      </div>
    </div>
  `;
}

function wireSheetsSyncSection() {
  document.getElementById("connectSheetsBtn")?.addEventListener("click", async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = "Connecting...";
    try {
      await connectGoogleSheets();
      showToast("Connected to Google Sheets", "success");
    } catch (err) {
      showToast(err.message || "Couldn't connect", "error");
    }
    renderSettings();
  });

  document.getElementById("disconnectSheetsBtn")?.addEventListener("click", () => {
    disconnectGoogleSheets();
    showToast("Disconnected", "success");
    renderSettings();
  });

  document.getElementById("spreadsheetIdInput")?.addEventListener("change", (e) => {
    setSpreadsheetId(e.target.value);
    showToast("Spreadsheet saved", "success");
  });

  document.getElementById("syncNowBtn")?.addEventListener("click", async (e) => {
    const btn = e.target;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Syncing...";
    await pushToSheetsNow();
    btn.disabled = false;
    btn.textContent = original;
  });
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(getData(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jpcs-treasury-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Backup downloaded", "success");
}

async function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;

  const confirmed = await confirmAction("Importing will replace all current data with this backup. Continue?");
  if (!confirmed) {
    e.target.value = "";
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed.members || !parsed.events || !parsed.transactions) {
      throw new Error("This doesn't look like a valid backup file.");
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    showToast("Backup restored. Reloading...", "success");
    setTimeout(() => window.location.reload(), 800);
  } catch (err) {
    showToast(err.message || "Couldn't read that file", "error");
  }
  e.target.value = "";
}