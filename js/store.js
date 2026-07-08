// js/store.js
//
// WHY THIS FILE EXISTS (not in your original spec, added deliberately):
// Without a framework, the natural failure mode is DOM state scattered
// across every module — dashboard.js reads members.js's array directly,
// transactions.js pokes at dashboard.js's totals, etc. Six months from
// now a new treasurer's dev can't safely change anything without
// breaking something three files away.
//
// This is a ~40-line pub/sub store. Modules never read each other's
// internals — they read/write named slices of state here and subscribe
// to changes. It's not Redux, it's the smallest thing that keeps modules
// decoupled.
//
// Usage:
//   import { store } from "./store.js";
//   store.set("currentUser", { uid, role });
//   const unsub = store.subscribe("currentUser", (user) => { ... });
//   store.get("currentUser");

const state = new Map();
const listeners = new Map(); // key -> Set<callback>

function get(key) {
  return state.get(key);
}

function set(key, value) {
  state.set(key, value);
  const subs = listeners.get(key);
  if (subs) subs.forEach((cb) => cb(value));
}

function subscribe(key, callback) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(callback);
  return () => listeners.get(key).delete(callback);
}

export const store = { get, set, subscribe };
