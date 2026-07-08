// js/auth.js
//
// Two ways in now: email+password, or Google Sign-In. Since there's no
// longer one single hardcoded identity, being "signed in" isn't enough
// to be admin — ANYONE can authenticate with either method (that's how
// Google Sign-In works by nature). What actually decides admin access
// is the `admins` collection in Firestore: your email has to exist as
// a document there. That check happens twice, on purpose:
//
//   1. Here, client-side, right after sign-in — purely for UX, so a
//      signed-in-but-not-admin user doesn't see broken buttons that
//      look enabled but silently fail on every click.
//   2. Inside firestore.rules — the real enforcement. Even if this
//      file had a bug, a non-admin still couldn't read or write
//      anything, because the rule checks the same allowlist server-side.
//
// To add yourself as the first admin: Firebase Console → Firestore →
// start collection "admins" → Add document → Document ID: your exact
// email → any field (e.g. role: "admin") → Save.

import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  GoogleAuthProvider, signInWithPopup,
} from "../assets/vendor/firebase.bundle.js";
import { auth } from "./firebase.js";
import { store } from "./store.js";
import { isAllowedAdmin } from "./cloud.js";

export function initAdminGate() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      store.set("isAdmin", false);
      return;
    }
    try {
      const allowed = await isAllowedAdmin(user.email);
      store.set("isAdmin", allowed);
      if (!allowed) {
        // Signed into a real Google/Firebase account, just not one on
        // the allowlist — don't leave them silently half-signed-in.
        showModalError(`${user.email} isn't on the admin list yet. Ask an existing admin to add you in Firebase Console.`);
        await signOut(auth);
      }
    } catch (err) {
      // The allowlist check itself failed — almost always means
      // firestore.rules hasn't been published yet, or the Firestore
      // database hasn't been created in this project. This is NOT the
      // same problem as "wrong password" — don't let it look like one.
      store.set("isAdmin", false);
      showModalError("Signed in, but couldn't verify admin access. Check that firestore.rules is published and Firestore is enabled. See browser console (F12) for details.");
      await signOut(auth);
    }
  });

  document.addEventListener("keydown", (e) => {
    const comboPressed = e.ctrlKey && e.altKey && e.key.toLowerCase() === "j";
    if (comboPressed) {
      e.preventDefault();
      store.get("isAdmin") ? signOut(auth) : openPasswordModal();
    }
    if (e.key === "Escape") closePasswordModal();
  });

  const form = document.querySelector(".password-modal-form");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("adminEmailInput").value.trim();
    const password = document.getElementById("adminPasswordInput").value;
    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in...";

    try {
      await signInWithEmailAndPassword(auth, email, password);
      closePasswordModal();
    } catch (err) {
      showModalError(
        err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found"
          ? "Incorrect email or password."
          : "Sign-in failed. Check your connection and try again."
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign In";
    }
  });

  document.querySelector(".google-signin-btn")?.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      closePasswordModal();
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        showModalError("Google sign-in failed. Check your connection and try again.");
      }
    }
  });

  document.querySelector(".password-modal-overlay")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("password-modal-overlay")) closePasswordModal();
  });

  document.querySelector(".role-badge")?.addEventListener("click", () => {
    if (store.get("isAdmin")) signOut(auth);
  });
}

export function handleSignOut() {
  return signOut(auth);
}

export function openPasswordModal() {
  const overlay = document.querySelector(".password-modal-overlay");
  overlay?.classList.add("open");
  document.getElementById("adminEmailInput")?.focus();
}

export function closePasswordModal() {
  const overlay = document.querySelector(".password-modal-overlay");
  overlay?.classList.remove("open");
  const emailInput = document.getElementById("adminEmailInput");
  const passwordInput = document.getElementById("adminPasswordInput");
  if (emailInput) emailInput.value = "";
  if (passwordInput) passwordInput.value = "";
  const errorEl = document.querySelector(".password-modal-error");
  if (errorEl) errorEl.style.display = "none";
}

function showModalError(message) {
  const overlay = document.querySelector(".password-modal-overlay");
  const errorEl = document.querySelector(".password-modal-error");
  if (!overlay || !errorEl) return;
  overlay.classList.add("open"); // in case this fires from a Google popup that closed the modal already
  errorEl.textContent = message;
  errorEl.style.display = "block";
}