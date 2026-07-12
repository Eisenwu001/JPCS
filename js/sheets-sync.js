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
  const needed = ["Transactions", "Members", "Tasks"].filter((t) => !existingTitles.includes(t));
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

  const getRoleRank = (role) => {
    if (!role) return 1000;
    const r = role.toLowerCase().trim();
    if (r === "president") return 1;
    if (r.startsWith("vice president") || r === "vp" || r.startsWith("vp")) return 2;
    if (r.startsWith("secretary")) return 3;
    if (r.startsWith("treasurer")) return 4;
    if (r.startsWith("auditor")) return 5;
    if (r.startsWith("public relations officer") || r === "pro" || r === "p.r.o.") return 6;
    if (r.startsWith("social media manager")) return 7;
    if (r.startsWith("sergeant-at-arms")) return 8;
    if (r.startsWith("1st year representative") || r === "1st year rep") return 9;
    if (r.startsWith("2nd year representative") || r === "2nd year rep") return 10;
    if (r.startsWith("3rd year representative") || r === "3rd year rep") return 11;
    if (r.startsWith("4th year representative") || r === "4th year rep") return 12;
    if (r.startsWith("special projects")) return 13;
    if (r.startsWith("membership committee")) return 14;
    return 100;
  };

  const sortedMembersForSheets = [...data.members].sort((a, b) => {
    const rankA = getRoleRank(a.officerRole);
    const rankB = getRoleRank(b.officerRole);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return (a.name || "").localeCompare(b.name || "");
  });

  const memberRows = [
    ["Name", "Officer Role", "Course", "Year Level", "Contact"],
    ...sortedMembersForSheets.map((m) => [m.name, m.officerRole || "Member", m.course || "", m.yearLevel || "", m.contact || ""]),
  ];

  const taskRows = [
    ["Title", "Description", "Status", "Priority", "Category", "Start Date", "End Date", "Created Date"],
    ...(data.tasks || []).map((t) => [
      t.title || "",
      t.description || "",
      t.status || "todo",
      t.priority || "medium",
      t.category || "general",
      t.startDate || t.dueDate || "",
      t.endDate || "",
      t.createdAt || "",
    ]),
  ];

  await writeTab(spreadsheetId, "Transactions", txnRows);
  await writeTab(spreadsheetId, "Members", memberRows);
  await writeTab(spreadsheetId, "Tasks", taskRows);

  // Fetch spreadsheet metadata to map sheet titles to sheetIds
  try {
    const meta = await sheetsApiRequest(spreadsheetId);
    const sheetIds = {};
    for (const s of meta.sheets || []) {
      sheetIds[s.properties.title] = s.properties.sheetId;
    }
    await applySheetStyles(spreadsheetId, sheetIds, txnRows.length, memberRows.length, taskRows.length);
  } catch (styleErr) {
    console.error("Successfully synced data, but some formatting styles could not be applied:", styleErr);
  }

  store.set("sheetsLastSynced", new Date());
}

async function applySheetStyles(spreadsheetId, sheetIds, txnRowsCount, memberRowsCount, taskRowsCount) {
  const requests = [];

  const tabConfigs = [
    { name: "Transactions", id: sheetIds["Transactions"], rows: txnRowsCount, cols: 5 },
    { name: "Members", id: sheetIds["Members"], rows: memberRowsCount, cols: 5 },
    { name: "Tasks", id: sheetIds["Tasks"], rows: taskRowsCount, cols: 8 }
  ];

  for (const config of tabConfigs) {
    const { name, id, rows, cols } = config;
    if (id === undefined) continue;

    // 1. Reset formatting of a large area first to clear leftover styles from previous syncs
    requests.push({
      repeatCell: {
        range: {
          sheetId: id,
          startRowIndex: 0,
          endRowIndex: Math.max(rows + 20, 100), // clear current rows plus extra buffer
          startColumnIndex: 0,
          endColumnIndex: cols
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
            textFormat: {
              bold: false,
              fontSize: 10,
              foregroundColor: { red: 0.15, green: 0.15, blue: 0.15 },
              fontFamily: "Lexend"
            },
            horizontalAlignment: "LEFT",
            verticalAlignment: "MIDDLE",
            borders: {
              top: { style: "NONE" },
              bottom: { style: "NONE" },
              left: { style: "NONE" },
              right: { style: "NONE" }
            }
          }
        },
        fields: "userEnteredFormat"
      }
    });

    // 2. Freeze the header row
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: id,
          gridProperties: {
            frozenRowCount: 1
          }
        },
        fields: "gridProperties.frozenRowCount"
      }
    });

    // Determine custom theme header background color based on the tab
    let headerBgColor = { red: 0.15, green: 0.2, blue: 0.3 }; // default slate
    if (name === "Transactions") {
      headerBgColor = { red: 0.05, green: 0.35, blue: 0.2 }; // beautiful deep emerald green
    } else if (name === "Members") {
      headerBgColor = { red: 0.08, green: 0.3, blue: 0.65 }; // premium steel blue
    } else if (name === "Tasks") {
      headerBgColor = { red: 0.92, green: 0.35, blue: 0.05 }; // JPCS branded premium warm orange (#ea580c)
    }

    // 3. Format header row
    requests.push({
      repeatCell: {
        range: {
          sheetId: id,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: cols
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: headerBgColor,
            textFormat: {
              bold: true,
              fontSize: 11,
              foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
              fontFamily: "Lexend"
            },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE"
          }
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
      }
    });

    // 4. Format all data cells (clean borders and padding alignment)
    requests.push({
      repeatCell: {
        range: {
          sheetId: id,
          startRowIndex: 1,
          endRowIndex: rows,
          startColumnIndex: 0,
          endColumnIndex: cols
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              fontSize: 10,
              fontFamily: "Lexend"
            },
            verticalAlignment: "MIDDLE",
            borders: {
              top: { style: "SOLID", color: { red: 0.9, green: 0.9, blue: 0.9 } },
              bottom: { style: "SOLID", color: { red: 0.9, green: 0.9, blue: 0.9 } },
              left: { style: "SOLID", color: { red: 0.9, green: 0.9, blue: 0.9 } },
              right: { style: "SOLID", color: { red: 0.9, green: 0.9, blue: 0.9 } }
            }
          }
        },
        fields: "userEnteredFormat(textFormat,verticalAlignment,borders)"
      }
    });

    // 5. Apply alternating row background colors (zebra striping) for data rows
    for (let r = 2; r < rows; r += 2) {
      requests.push({
        repeatCell: {
          range: {
            sheetId: id,
            startRowIndex: r,
            endRowIndex: r + 1,
            startColumnIndex: 0,
            endColumnIndex: cols
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.97, green: 0.98, blue: 0.99 } // clean soft ice blue/gray background tint
            }
          },
          fields: "userEnteredFormat.backgroundColor"
        }
      });
    }

    // 6. Column-specific styling
    if (name === "Transactions") {
      // Columns: ["Date", "Category", "Note", "Type", "Amount (₱)"]
      // Center Date (Col 0), Category (Col 1), Type (Col 3)
      const centerCols = [0, 1, 3];
      for (const colIdx of centerCols) {
        requests.push({
          repeatCell: {
            range: { sheetId: id, startRowIndex: 1, endRowIndex: rows, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
            cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
            fields: "userEnteredFormat.horizontalAlignment"
          }
        });
      }
      // Right align and currency format Amount (Col 4)
      requests.push({
        repeatCell: {
          range: { sheetId: id, startRowIndex: 1, endRowIndex: rows, startColumnIndex: 4, endColumnIndex: 5 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: "RIGHT",
              numberFormat: {
                type: "CURRENCY",
                pattern: "₱#,##0.00;(₱#,##0.00);\"-\""
              }
            }
          },
          fields: "userEnteredFormat(horizontalAlignment,numberFormat)"
        }
      });
    } else if (name === "Members") {
      // Columns: ["Name", "Officer Role", "Course", "Year Level", "Contact"]
      // Center Course (Col 2), Year Level (Col 3)
      const centerCols = [2, 3];
      for (const colIdx of centerCols) {
        requests.push({
          repeatCell: {
            range: { sheetId: id, startRowIndex: 1, endRowIndex: rows, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
            cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
            fields: "userEnteredFormat.horizontalAlignment"
          }
        });
      }
    } else if (name === "Tasks") {
      // Columns: ["Title", "Description", "Status", "Priority", "Category", "Start Date", "End Date", "Created Date"]
      // Wrap description text
      requests.push({
        repeatCell: {
          range: { sheetId: id, startRowIndex: 1, endRowIndex: rows, startColumnIndex: 1, endColumnIndex: 2 },
          cell: { userEnteredFormat: { wrapStrategy: "WRAP" } },
          fields: "userEnteredFormat.wrapStrategy"
        }
      });
      // Center aligned columns from Status to Created Date (Cols 2 to 7)
      requests.push({
        repeatCell: {
          range: { sheetId: id, startRowIndex: 1, endRowIndex: rows, startColumnIndex: 2, endColumnIndex: 8 },
          cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
          fields: "userEnteredFormat.horizontalAlignment"
        }
      });
    }

    // 7. Explicit beautiful column sizes to guarantee perfect readable spacing without truncation
    let colWidths = [];
    if (name === "Transactions") {
      colWidths = [130, 180, 260, 110, 140];
    } else if (name === "Members") {
      colWidths = [240, 220, 110, 130, 180];
    } else if (name === "Tasks") {
      colWidths = [220, 320, 130, 110, 130, 130, 130, 130];
    }

    colWidths.forEach((width, colIdx) => {
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId: id,
            dimension: "COLUMNS",
            startIndex: colIdx,
            endIndex: colIdx + 1
          },
          properties: {
            pixelSize: width
          },
          fields: "pixelSize"
        }
      });
    });

    // 8. Custom comfortable row heights
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: id,
          dimension: "ROWS",
          startIndex: 0,
          endIndex: 1
        },
        properties: {
          pixelSize: 38
        },
        fields: "pixelSize"
      }
    });

    if (rows > 1) {
      requests.push({
        autoResizeDimensions: {
          dimensions: {
            sheetId: id,
            dimension: "ROWS",
            startIndex: 1,
            endIndex: rows
          }
        }
      });
    }
  }

  // Send the single batchUpdate request to apply all styles in one go!
  if (requests.length > 0) {
    await sheetsApiRequest(`${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests })
    });
  }
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