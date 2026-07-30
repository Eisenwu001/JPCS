// js/store.js

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
