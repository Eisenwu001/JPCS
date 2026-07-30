// js/cloud.js

import {
  collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc,
  query, where, onSnapshot, serverTimestamp, Timestamp,
} from "../assets/vendor/firebase.bundle.js";
import { db } from "./firebase.js";

export async function isAllowedAdmin(email) {
  if (!email) return false;
  try {
    const snap = await getDoc(doc(db, "admins", email));
    return snap.exists();
  } catch (err) {
    console.error("Admin check failed:", err);
    throw err;
  }
}

export function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "event";
}

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

export async function publishEvent({ slug, title, description, feeCentavos, date, category = "general", qrCodeDataUrl = null }) {
  await setDoc(doc(db, "events", slug), {
    title,
    description: description || "",
    feeCentavos,
    date,
    active: true,
    category,
    qrCodeDataUrl,
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

export async function submitPayment({ eventSlug, name, course = "", yearLevel = "", paymentMethod, proofImageDataUrl }) {
  const docRef = await addDoc(collection(db, "submissions"), {
    eventSlug,
    name: name.trim(),
    course: (course || "").trim(),
    yearLevel: (yearLevel || "").trim(),
    paymentMethod,
    proofImage: proofImageDataUrl || null,
    status: "pending",
    submittedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getSubmissionById(submissionId) {
  const snap = await getDoc(doc(db, "submissions", submissionId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function subscribeToSubmissions(eventSlug, callback) {
  const q = query(collection(db, "submissions"), where("eventSlug", "==", eventSlug));
  return onSnapshot(q, (snap) => {
    const submissions = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
    callback(submissions);
  }, (err) => {
    console.error("Submissions subscription failed:", err);
    callback([]);
  });
}

export async function updateSubmissionStatus(submissionId, status) {
  await updateDoc(doc(db, "submissions", submissionId), { status });
}