// js/data.js
//
// Single source of truth for all app data. Everything lives in
// localStorage under one key — this is deliberate: it means the whole
// dataset is one atomic read/write, and swapping this file's internals
// for Firestore later (multi-device sync) doesn't require touching any
// UI module, since they only ever call these exported functions.
//
// BALANCE PRINCIPLE (carried over from the original architecture plan):
// there is no raw mutable "balance" field. Balance is always derived
// from startingBalanceCentavos + the transaction ledger. "Edit Balance"
// in the UI doesn't overwrite a number — it back-solves the starting
// balance so the derived total matches what the admin typed, which
// keeps every peso traceable to a transaction.

import { store } from "./store.js";
import { computeDelta } from "./utils.js";
import { doc, setDoc, getDoc, onSnapshot } from "../assets/vendor/firebase.bundle.js";
import { db } from "./firebase.js";

const STORAGE_KEY = "jpcs_treasury_data";

function seedData() {
  return {
    orgName: "JPCS",
    startingBalanceCentavos: 0,
    members: [],
    events: [],
    transactions: [], // { id, type: 'income'|'expense', category, amount, date, note, source: 'manual'|'event', eventId?, memberId? }
    tasks: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : seedData();
    if (!parsed.tasks) parsed.tasks = [];
    return parsed;
  } catch {
    const seeded = seedData();
    return seeded;
  }
}

let state = load();
let cloudSyncReady = false; // flips true after the first Firestore snapshot is reconciled — see initCloudLedgerSync()

// Loaded from localStorage first (instant paint, works offline), then
// reconciled with Firestore the moment the first snapshot arrives —
// see initCloudLedgerSync() below. This is what makes "open the app
// on a different device" actually show real data instead of nothing.
let cloudWriteTimer = null;
const CLOUD_WRITE_DEBOUNCE_MS = 1200;

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  store.set("data", state); // notify every subscribed UI module to re-render
  scheduleCloudWrite();
}

function scheduleCloudWrite() {
  if (!cloudSyncReady) return; // don't push to Firestore before we've even loaded from it once
  clearTimeout(cloudWriteTimer);
  cloudWriteTimer = setTimeout(() => {
    pushLedgerToCloud(state).catch((err) => {
      console.error("Couldn't save to the cloud — this device's changes are only saved locally until this succeeds:", err);
    });
  }, CLOUD_WRITE_DEBOUNCE_MS);
}

// Publish once on load so modules that mount before any mutation still
// get the initial dataset via store.subscribe.
store.set("data", state);

const LEDGER_DOC_PATH = ["ledger", "main"];

async function pushLedgerToCloud(currentState) {
  await setDoc(doc(db, ...LEDGER_DOC_PATH), currentState);
}

/** Call once at startup. Loads the real ledger from Firestore (falling
 * back to whatever's cached locally until that arrives), and keeps
 * listening afterward so a change made on a different device — or a
 * different browser tab — actually shows up here too, not just changes
 * made in this tab.
 *
 * KNOWN EDGE CASE: if you edit something in the ~1 second between page
 * load and this first snapshot arriving, and the cloud already has
 * different data from another device, the cloud version wins and that
 * split-second edit is lost. Worth knowing, not worth engineering a
 * full conflict-merge system for — this is a single-editor-in-practice
 * tool, not a multi-user collaborative one. */
export function initCloudLedgerSync() {
  const ledgerRef = doc(db, ...LEDGER_DOC_PATH);

  onSnapshot(ledgerRef, (snap) => {
    // hasPendingWrites means this snapshot is just our own optimistic
    // write echoing back before the server's confirmed it — local
    // state already reflects that change, so re-applying it here would
    // only risk clobbering a newer edit made in the meantime.
    if (snap.metadata.hasPendingWrites) {
      cloudSyncReady = true;
      return;
    }

    if (snap.exists()) {
      state = snap.data();
      if (!state.tasks) state.tasks = [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      store.set("data", state);
    } else {
      // Nobody has ever synced before — seed the cloud from whatever's
      // currently local (including anything edited before this
      // resolved) instead of overwriting it with nothing.
      setDoc(ledgerRef, state).catch((err) => console.error("Couldn't create the initial cloud ledger:", err));
    }
    cloudSyncReady = true;
  }, (err) => {
    console.error("Ledger cloud sync failed — running on local data only until this resolves:", err);
  });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Derived reads ----------

export function getData() {
  return state;
}

export function computeBalanceCentavos() {
  const txnSum = state.transactions.reduce(
    (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount),
    0
  );
  return state.startingBalanceCentavos + txnSum;
}

export function computePendingCollectionsCentavos() {
  let pending = 0;
  for (const event of state.events) {
    for (const p of event.participants) {
      if (!p.paid) pending += event.feeCentavos;
    }
  }
  return pending;
}

function sumTransactions(predicate) {
  return state.transactions.filter(predicate).reduce((s, t) => s + t.amount, 0);
}

export function getStats() {
  const today = todayISO();
  const monthPrefix = today.slice(0, 7); // "2026-07"

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonthPrefix = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const todayIncome = sumTransactions((t) => t.type === "income" && t.date === today);
  const todayExpense = sumTransactions((t) => t.type === "expense" && t.date === today);
  const yesterdayIncome = sumTransactions((t) => t.type === "income" && t.date === yesterdayISO);
  const yesterdayExpense = sumTransactions((t) => t.type === "expense" && t.date === yesterdayISO);
  const monthlyIncome = sumTransactions((t) => t.type === "income" && t.date.startsWith(monthPrefix));
  const monthlyExpense = sumTransactions((t) => t.type === "expense" && t.date.startsWith(monthPrefix));
  const lastMonthIncome = sumTransactions((t) => t.type === "income" && t.date.startsWith(lastMonthPrefix));
  const lastMonthExpense = sumTransactions((t) => t.type === "expense" && t.date.startsWith(lastMonthPrefix));

  return {
    currentBalanceCentavos: computeBalanceCentavos(),
    todayIncomeCentavos: todayIncome,
    todayExpenseCentavos: todayExpense,
    monthlyIncomeCentavos: monthlyIncome,
    monthlyExpenseCentavos: monthlyExpense,
    pendingCollectionsCentavos: computePendingCollectionsCentavos(),
    todayIncomeDelta: computeDelta(todayIncome, yesterdayIncome),
    todayExpenseDelta: computeDelta(todayExpense, yesterdayExpense),
    monthlyIncomeDelta: computeDelta(monthlyIncome, lastMonthIncome),
    monthlyExpenseDelta: computeDelta(monthlyExpense, lastMonthExpense),
  };
}

export function getRecentTransactions(limit = 5) {
  return [...state.transactions]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit);
}

export function getCategoryBreakdown(type = "income") {
  const totals = {};
  for (const t of state.transactions) {
    if (t.type !== type) continue;
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  }
  return { labels: Object.keys(totals), values: Object.values(totals) };
}

export function getMonthlyIncomeVsExpense(monthsBack = 6) {
  const buckets = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      // Built from local date parts rather than d.toISOString(), which
      // converts to UTC first. In any timezone ahead of UTC (Philippines
      // is UTC+8), that conversion rolls local midnight back into the
      // previous UTC day, silently shifting every bucket's key one
      // month earlier than the label sitting next to it. That mismatch
      // is why a transaction dated Jun 21 was landing under "Jul".
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short" }),
      income: 0,
      expense: 0,
    });
  }
  for (const t of state.transactions) {
    const bucket = buckets.find((b) => b.key === t.date.slice(0, 7));
    if (bucket) bucket[t.type] += t.amount;
  }

  // Trim leading months with no activity so a young org's chart doesn't
  // stretch across a mostly blank grid. Starts one bucket before the
  // first real activity so there's still a baseline to compare against,
  // and falls back to the last two months if there's no history yet.
  let firstActive = buckets.findIndex((b) => b.income > 0 || b.expense > 0);
  if (firstActive === -1) firstActive = buckets.length - 1;
  const start = Math.max(0, firstActive - 1);
  const trimmed = buckets.slice(start);

  return {
    labels: trimmed.map((b) => b.label),
    keys: trimmed.map((b) => b.key), // e.g. "2026-06" — lets a click on a bar resolve to its exact month
    income: trimmed.map((b) => b.income),
    expense: trimmed.map((b) => b.expense),
  };
}

/** Day-by-day breakdown for one specific month — this is the "zoom in"
 * view. A monthly bar only tells you the total; this is what actually
 * answers "which day did this happen." */
export function getDailyIncomeVsExpense(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const buckets = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, income: 0, expense: 0 }));
  const prefix = `${year}-${String(month).padStart(2, "0")}`;

  for (const t of state.transactions) {
    if (!t.date.startsWith(prefix)) continue;
    const day = Number(t.date.slice(8, 10));
    if (buckets[day - 1]) buckets[day - 1][t.type] += t.amount;
  }

  return {
    labels: buckets.map((b) => String(b.day)),
    income: buckets.map((b) => b.income),
    expense: buckets.map((b) => b.expense),
    monthLabel: new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    totalIncome: buckets.reduce((s, b) => s + b.income, 0),
    totalExpense: buckets.reduce((s, b) => s + b.expense, 0),
  };
}

export function getMemberOutstandingCentavos(memberId) {
  let total = 0;
  for (const event of state.events) {
    const p = event.participants.find((p) => p.memberId === memberId);
    if (p && !p.paid) total += event.feeCentavos;
  }
  return total;
}

function normalizeName(s) {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

/** Best-guess match for a name someone typed on the public submission
 * form against your local Members list — checks both full name and
 * nickname, since "Lixter" and "Lixter Niño D. Dinawanao" should match
 * the same person. Returns null below a confidence floor rather than
 * forcing a guess — this is a SUGGESTION for the admin to confirm in
 * the review table, never applied automatically without a human
 * looking at it (see the note in events.js for why). */
export function findBestMemberMatch(submittedName) {
  const query = normalizeName(submittedName);
  if (!query) return null;

  let best = null;
  let bestScore = 0;

  for (const member of state.members) {
    const fullName = normalizeName(member.name);
    const nickname = normalizeName(member.nickname);
    let score = 0;

    if (query === fullName || (nickname && query === nickname)) {
      score = 100; // exact match on either field
    } else if (
      fullName.includes(query) || query.includes(fullName) ||
      (nickname && (nickname.includes(query) || query.includes(nickname)))
    ) {
      score = 80; // one contains the other — e.g. nickname inside full legal name
    } else {
      // Partial credit for shared words, handles reordered or
      // partially-typed names ("Dinawanao Lixter" or just "Niño").
      const queryWords = query.split(" ").filter(Boolean);
      const nameWords = fullName.split(" ").filter(Boolean);
      const overlap = queryWords.filter((w) => nameWords.includes(w)).length;
      if (overlap > 0) score = Math.round((overlap / Math.max(queryWords.length, nameWords.length)) * 60);
    }

    if (score > bestScore) {
      bestScore = score;
      best = member;
    }
  }

  if (!best || bestScore < 40) return null; // below this, a guess does more harm than good

  return { member: best, confidence: bestScore >= 80 ? "high" : bestScore >= 60 ? "medium" : "low" };
}

/** Marks a member paid for an event as a RESULT of approving a public
 * submission — separate from toggleParticipantPaid() on purpose,
 * since that function also logs a transaction, and the submission
 * approval flow already logs one itself. Calling both would double-count
 * the payment. If the member wasn't already tracked as a participant
 * (e.g. they joined after the event was created), this adds them. */
export function markParticipantPaidFromSubmission(eventId, memberId) {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return;
  let participant = event.participants.find((p) => p.memberId === memberId);
  if (!participant) {
    participant = { memberId, paid: false };
    event.participants.push(participant);
  }
  participant.paid = true;
  persist();
}

// ---------- Mutations (admin-only — enforced by the caller never
// wiring these into the DOM unless isAdmin is true, see app.js) ----------

export function setStartingBalance(newBalanceCentavos) {
  const txnSum = state.transactions.reduce(
    (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount),
    0
  );
  state.startingBalanceCentavos = newBalanceCentavos - txnSum;
  persist();
}

export function addMember({ name, course, yearLevel, contact, officerRole = "", nickname = "" }) {
  const member = { id: uid(), name, course, yearLevel, contact, officerRole, nickname, createdAt: todayISO() };
  state.members.push(member);
  persist();
  return member;
}

export function updateMember(id, updates) {
  const member = state.members.find((m) => m.id === id);
  if (member) Object.assign(member, updates);
  persist();
}

export function deleteMember(id) {
  state.members = state.members.filter((m) => m.id !== id);
  // Also drop this member from any event participant lists so the
  // ledger doesn't reference a member that no longer exists.
  for (const event of state.events) {
    event.participants = event.participants.filter((p) => p.memberId !== id);
  }
  persist();
}

export function addEvent({ title, date, feeCentavos, description, slug = null, category = "general" }) {
  const participants = state.members.map((m) => ({ memberId: m.id, paid: false }));
  const event = { id: uid(), title, date, feeCentavos, description, participants, slug, active: true, category };
  state.events.push(event);
  persist();
  return event;
}

export function setEventSlug(eventId, slug) {
  const event = state.events.find((e) => e.id === eventId);
  if (event) event.slug = slug;
  persist();
}

/** Local mirror of the Firestore "active" flag — kept in sync by the
 * caller (events.js) alongside the real cloud.js call, so the event
 * card can render Open/Closed instantly without waiting on a round
 * trip. The actual enforcement (whether the public page accepts new
 * submissions) lives in Firestore, not here. */
export function setEventActive(eventId, active) {
  const event = state.events.find((e) => e.id === eventId);
  if (event) event.active = active;
  persist();
}

export function deleteEvent(id) {
  state.events = state.events.filter((e) => e.id !== id);
  state.transactions = state.transactions.filter((t) => t.eventId !== id);
  persist();
}

/** Flip a participant's paid status. Marking paid records an income
 * transaction; un-marking removes it. This is a simplification of the
 * "append-only ledger" pattern used in the Firestore rules draft — fine
 * for a single-editor local tool, but a real multi-user backend should
 * use reversal entries instead of deleting history (see README). */
export function toggleParticipantPaid(eventId, memberId) {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return;
  const participant = event.participants.find((p) => p.memberId === memberId);
  if (!participant) return;

  participant.paid = !participant.paid;

  if (participant.paid) {
    const member = state.members.find((m) => m.id === memberId);
    state.transactions.push({
      id: uid(),
      type: "income",
      category: event.title,
      amount: event.feeCentavos,
      date: todayISO(),
      note: `Payment from ${member?.name || "Member"}`,
      source: "event",
      eventId,
      memberId,
    });
  } else {
    state.transactions = state.transactions.filter(
      (t) => !(t.source === "event" && t.eventId === eventId && t.memberId === memberId)
    );
  }
  persist();
}

export function addTransaction({ type, category, amount, date, note }) {
  state.transactions.push({
    id: uid(), type, category, amount, date: date || todayISO(), note: note || "", source: "manual",
  });
  persist();
}

export function updateTransaction(id, { type, category, amount, date, note }) {
  const t = state.transactions.find((tx) => tx.id === id);
  if (t) {
    t.type = type;
    t.category = category;
    t.amount = amount;
    t.date = date || todayISO();
    t.note = note || "";
    persist();
    return true;
  }
  return false;
}

export function deleteTransaction(id) {
  state.transactions = state.transactions.filter((t) => t.id !== id);
  persist();
}

// ---------- Reports ----------

/** Balance at the instant just before `dateISO` — i.e. everything
 * dated strictly earlier. This is what makes a report's "Starting
 * Balance" line meaningful: it's the real running balance carried in
 * from before the period started, not just zero. */
export function getBalanceAsOf(dateISO) {
  const txnSum = state.transactions
    .filter((t) => t.date < dateISO)
    .reduce((sum, t) => sum + (t.type === "income" ? t.amount : -t.amount), 0);
  return state.startingBalanceCentavos + txnSum;
}

/** Full summary for a date range (inclusive on both ends) — the one
 * function the Reports page builds everything from. */
export function getPeriodReport(startISO, endISO) {
  const transactions = state.transactions
    .filter((t) => t.date >= startISO && t.date <= endISO)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const totalIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const startingBalance = getBalanceAsOf(startISO);

  const incomeByCategory = {};
  const expenseByCategory = {};
  for (const t of transactions) {
    const bucket = t.type === "income" ? incomeByCategory : expenseByCategory;
    bucket[t.category] = (bucket[t.category] || 0) + t.amount;
  }

  return {
    startISO,
    endISO,
    transactions,
    totalIncome,
    totalExpense,
    netChange: totalIncome - totalExpense,
    startingBalance,
    endingBalance: startingBalance + totalIncome - totalExpense,
    incomeByCategory,
    expenseByCategory,
  };
}

// ---------- Task Tracker ----------

export function addTask({ title, description, status = "todo", priority = "medium", category = "general", dueDate = "" }) {
  const task = {
    id: uid(),
    title,
    description,
    status, // "todo", "in_progress", "done"
    priority, // "low", "medium", "high"
    category, // "general", "treasury", "event", "member"
    dueDate,
    createdAt: todayISO(),
    updatedAt: todayISO(),
  };
  if (!state.tasks) state.tasks = [];
  state.tasks.push(task);
  persist();
  return task;
}

export function updateTask(id, updates) {
  if (!state.tasks) state.tasks = [];
  const task = state.tasks.find((t) => t.id === id);
  if (task) {
    Object.assign(task, updates);
    task.updatedAt = todayISO();
    persist();
    return true;
  }
  return false;
}

export function deleteTask(id) {
  if (!state.tasks) state.tasks = [];
  state.tasks = state.tasks.filter((t) => t.id !== id);
  persist();
}
