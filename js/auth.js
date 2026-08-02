// js/auth.js
// Handles admin authentication (email/password & Google) and verifies admin permissions against Firestore.

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
        showModalError(`${user.email} isn't on the admin list yet. Ask an existing admin to add you in Firebase Console.`);
        await signOut(auth);
      }
    } catch (err) {
      store.set("isAdmin", false);
      showModalError("Signed in, but couldn't verify admin access. Check that firestore.rules is published and Firestore is enabled.");
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