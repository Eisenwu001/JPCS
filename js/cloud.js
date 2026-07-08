// js/cloud.js
//
// This is the ONE file that talks to Firebase. Everything else (the
// local members/transactions ledger in data.js) stays exactly as it
// was — untouched, still localStorage-only. Only two things move to
// Firestore, because only two things actually need to cross devices:
//
//   events      — mirrored here so a stranger's phone can look one up
//                 by its public slug without needing your admin login.
//   submissions — written by that stranger's phone, read by you.
//
// Proof-of-payment images are compressed (js/image.js) and stored as a
// base64 string directly on the submission document — no Cloud
// Storage, no Blaze plan required.

import {
  collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc,
  query, where, onSnapshot, serverTimestamp, Timestamp,
} from "../assets/vendor/firebase.bundle.js";
import { db } from "./firebase.js";

// ---------- admin allowlist ----------

/** Is this email allowed to be admin? Checked both here (for UX — don't
 * show admin controls to someone who isn't actually authorized) and,
 * far more importantly, inside firestore.rules (the real enforcement —
 * this client-side check is just a courtesy, never the security). */
export async function isAllowedAdmin(email) {
  if (!email) return false;
  try {
    const snap = await getDoc(doc(db, "admins", email));
    return snap.exists();
  } catch (err) {
    // Surfaces in the browser console (F12 → Console) — if you see this,
    // it's not "you're not an admin," it's "the check itself failed."
    // Common causes: firestore.rules not published yet, or Firestore
    // database not created in this project at all.
    console.error("Admin check failed — this means something's misconfigured, not that you're not an admin:", err);
    throw err;
  }
}

// ---------- slugs ----------

/** "Membership Fee 2026" -> "membership-fee-2026" */
export function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "event";
}

/** Appends -2, -3, etc. if the slug is already taken. Not airtight against
 * a simultaneous race (two admins publishing the same title at the same
 * instant), but there's realistically one editor, so this is enough. */
export async function generateUniqueSlug(title) {
  const base = slugify(title);
  let candidate = base;
  let n = 2;
  while (await slugExists(candidate)) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}

async function slugExists(slug) {
  const snap = await getDoc(doc(db, "events", slug));
  return snap.exists();
}

// ---------- events (public-readable mirror) ----------

/** Publishes an event so its public link works. Uses the slug as the
 * Firestore document ID directly — that's what the public page looks
 * up, no separate query needed. */
export async function publishEvent({ slug, title, description, feeCentavos, date, category = "general" }) {
  await setDoc(doc(db, "events", slug), {
    title,
    description: description || "",
    feeCentavos,
    date,
    active: true,
    category,
    createdAt: serverTimestamp(),
  });
}

export async function getPublicEvent(slug) {
  const snap = await getDoc(doc(db, "events", slug));
  return snap.exists() ? { slug: snap.id, ...snap.data() } : null;
}

export async function setEventActive(slug, active) {
  await updateDoc(doc(db, "events", slug), { active });
}

// ---------- submissions ----------

/** Called from the public page — no admin login involved. Security
 * rules (not this code) are what actually keep this safe to expose.
 * proofImageDataUrl is already-compressed (see js/image.js) before it
 * ever gets here. */
export async function submitPayment({ eventSlug, name, paymentMethod, proofImageDataUrl }) {
  const docRef = await addDoc(collection(db, "submissions"), {
    eventSlug,
    name: name.trim(),
    paymentMethod,
    proofImage: proofImageDataUrl || null,
    status: "pending",
    submittedAt: serverTimestamp(),
  });
  return docRef.id;
}

/** Fetches exactly one submission by its own ID — no login needed.
 * This is deliberately narrower than a name/email search: the security
 * rules allow "get one doc you already know the ID of" publicly, but
 * NOT "list/query the whole collection," so a stranger can check their
 * own submission (their browser remembers the ID from when they made
 * it) without being able to browse anyone else's. */
export async function getSubmissionById(submissionId) {
  const snap = await getDoc(doc(db, "submissions", submissionId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Live subscription for the admin dashboard — called only after
 * Firebase sign-in has succeeded (see auth.js), since the security
 * rules require it for read access. */
export function subscribeToSubmissions(eventSlug, callback) {
  const q = query(collection(db, "submissions"), where("eventSlug", "==", eventSlug));
  return onSnapshot(q, (snap) => {
    const submissions = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
    callback(submissions);
  }, (err) => {
    console.error("Submissions subscription failed — check you're signed in and rules are deployed:", err);
    callback([]);
  });
}

export async function updateSubmissionStatus(submissionId, status) {
  await updateDoc(doc(db, "submissions", submissionId), { status });
}