// js/public-event.js
// Drives event.html. No admin gate, no local ledger — this is the page
// a member's own phone opens from the shared link.

import { getPublicEvent, submitPayment, getSubmissionById } from "./cloud.js";
import { compressImageToDataUrl } from "./image.js";
import { formatMoney, formatDate, pesosToCentavos } from "./utils.js";

const STORAGE_KEY = "jpcs_my_submissions"; // { [eventSlug]: submissionId }

function getSlugFromUrl() {
  // Supports both a clean path (/event/membership-fee-2026, if your host
  // rewrites that to event.html) and a plain query string
  // (event.html?slug=membership-fee-2026), which works on any static
  // host with zero server configuration.
  const pathMatch = location.pathname.match(/\/event\/([a-z0-9-]+)/i);
  if (pathMatch) return pathMatch[1];
  return new URLSearchParams(location.search).get("slug");
}

function getMySubmissions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function rememberSubmission(eventSlug, submissionId) {
  const mine = getMySubmissions();
  mine[eventSlug] = submissionId;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mine));
}

async function init() {
  const card = document.getElementById("publicCard");
  const slug = getSlugFromUrl();

  if (!slug) {
    renderError(card, "No event specified. Check the link and try again.");
    return;
  }

  let event;
  try {
    event = await getPublicEvent(slug);
  } catch (err) {
    console.error(err);
    renderError(card, "Couldn't load this event. Check your connection and try again.");
    return;
  }

  if (!event) {
    renderError(card, "This event doesn't exist. Check the link and try again.");
    return;
  }

  // If this browser already submitted to this event, show that status
  // instead of jumping straight to a blank form. This only works from
  // the same browser/device that submitted — see the note in
  // renderStatus() about why that's a deliberate tradeoff, not a bug.
  const mySubmissionId = getMySubmissions()[slug];
  if (mySubmissionId) {
    try {
      const existing = await getSubmissionById(mySubmissionId);
      if (existing) {
        renderStatus(card, event, existing);
        return;
      }
    } catch (err) {
      console.error("Couldn't load previous submission, falling back to the form:", err);
    }
  }

  if (event.active === false) {
    renderError(card, "This event isn't accepting submissions right now.");
    return;
  }

  renderForm(card, event);
}

function renderError(card, message) {
  card.innerHTML = `
    <div class="public-error">
      <i data-lucide="alert-circle"></i>
      <p>${message}</p>
    </div>`;
  if (window.lucide) window.lucide.createIcons();
}

function renderStatus(card, event, submission) {
  const statusConfig = {
    pending: { icon: "clock", label: "Pending Review", note: "The treasurer hasn't reviewed this yet." },
    paid: { icon: "check-circle-2", label: "Payment Confirmed", note: "Your payment has been verified." },
    rejected: { icon: "x-circle", label: "Rejected", note: "This submission wasn't accepted. Contact your treasurer directly to sort it out." },
  }[submission.status] || { icon: "help-circle", label: submission.status, note: "" };

  card.innerHTML = `
    <h1 class="public-event-title">${event.title}</h1>
    <p class="public-event-meta">${formatDate(event.date)}</p>

    <div class="public-status public-status-${submission.status}">
      <i data-lucide="${statusConfig.icon}"></i>
      <div>
        <p class="public-status-label">${statusConfig.label}</p>
        <p class="public-status-note">${statusConfig.note}</p>
      </div>
    </div>

    <div class="public-status-details">
      <div><span>Name</span><span>${submission.name}</span></div>
      <div><span>Method</span><span style="text-transform:capitalize;">${submission.paymentMethod}</span></div>
      <div><span>Amount</span><span>${formatMoney(event.feeCentavos)}</span></div>
    </div>

    ${event.active !== false ? `<button type="button" class="btn btn-secondary" id="submitAnotherBtn" style="width:100%; margin-top:16px;">Submit a Different Payment</button>` : ""}
  `;
  if (window.lucide) window.lucide.createIcons();

  document.getElementById("submitAnotherBtn")?.addEventListener("click", () => renderForm(card, event));
}

function renderForm(card, event) {
  card.innerHTML = `
    <h1 class="public-event-title">${event.title}</h1>
    <p class="public-event-meta">${formatDate(event.date)}${event.description ? " · " + event.description : ""}</p>
    <div class="public-fee-badge"><i data-lucide="banknote" style="width:14px;height:14px;"></i>${formatMoney(event.feeCentavos)}</div>

    <form id="submitForm">
      <div class="form-group">
        <label for="nameInput">Full Name</label>
        <input type="text" id="nameInput" class="form-control" required autocomplete="name" />
      </div>

      <div class="form-group">
        <label>Payment Method</label>
        <div class="payment-method-options">
          <label class="payment-method-option" data-method="gcash">
            <input type="radio" name="method" value="gcash" required />
            <i data-lucide="smartphone"></i> GCash
          </label>
          <label class="payment-method-option" data-method="cash">
            <input type="radio" name="method" value="cash" />
            <i data-lucide="banknote"></i> Cash / In Person
          </label>
        </div>
      </div>

      <div class="form-group" id="proofGroup" style="display:none;">
        <label for="proofInput">Upload Proof of Payment</label>
        <label class="file-upload-zone" id="uploadZone">
          <i data-lucide="upload"></i>
          <p id="uploadLabel">Tap to upload a screenshot</p>
          <input type="file" id="proofInput" accept="image/*" style="display:none;" />
        </label>
      </div>

      <p class="form-error" id="formError">Something went wrong. Please try again.</p>

      <div class="modal-actions" style="justify-content:stretch;">
        <button type="submit" class="btn btn-primary" id="submitBtn" style="width:100%;">Submit</button>
      </div>
    </form>
  `;
  if (window.lucide) window.lucide.createIcons();

  const methodOptions = card.querySelectorAll(".payment-method-option");
  const proofGroup = document.getElementById("proofGroup");
  const proofInput = document.getElementById("proofInput");
  const uploadZone = document.getElementById("uploadZone");
  const uploadLabel = document.getElementById("uploadLabel");

  methodOptions.forEach((opt) => {
    opt.addEventListener("click", () => {
      methodOptions.forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      const isGcash = opt.dataset.method === "gcash";
      proofGroup.style.display = isGcash ? "block" : "none";
      proofInput.required = isGcash;
    });
  });

  proofInput.addEventListener("change", () => {
    const file = proofInput.files[0];
    if (file) {
      uploadLabel.textContent = file.name;
      uploadZone.classList.add("has-file");
    }
  });

  document.getElementById("submitForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("submitBtn");
    const errorEl = document.getElementById("formError");
    const name = document.getElementById("nameInput").value.trim();
    const method = card.querySelector("input[name=method]:checked")?.value;
    const proofFile = proofInput.files[0] || null;

    if (!name || !method) return;
    if (method === "gcash" && !proofFile) {
      errorEl.textContent = "Please upload proof of payment for GCash.";
      errorEl.style.display = "block";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = proofFile ? "Processing image..." : "Submitting...";
    errorEl.style.display = "none";

    try {
      let proofImageDataUrl = null;
      if (proofFile) {
        proofImageDataUrl = await compressImageToDataUrl(proofFile);
        submitBtn.textContent = "Submitting...";
      }
      const submissionId = await submitPayment({ eventSlug: event.slug, name, paymentMethod: method, proofImageDataUrl });
      rememberSubmission(event.slug, submissionId);
      renderSuccess(card);
    } catch (err) {
      console.error(err);
      errorEl.textContent = err.message?.includes("too large")
        ? err.message
        : "Couldn't submit. Check your connection and try again.";
      errorEl.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
    }
  });
}

function renderSuccess(card) {
  card.innerHTML = `
    <div class="public-success">
      <i data-lucide="check-circle-2"></i>
      <h3>Submitted!</h3>
      <p>Your payment is pending review. Reopen this same link anytime on this device to check its status.</p>
    </div>`;
  if (window.lucide) window.lucide.createIcons();
}

init();