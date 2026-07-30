// js/public-event.js
import { getPublicEvent, submitPayment, getSubmissionById } from "./cloud.js";
import { compressImageToDataUrl } from "./image.js";
import { formatMoney, formatDate, pesosToCentavos } from "./utils.js";

const STORAGE_KEY = "jpcs_my_submissions";

function getSlugFromUrl() {
  const querySlug = new URLSearchParams(location.search).get("slug");
  if (querySlug) return querySlug;
  const pathMatch = location.pathname.match(/\/event\/([a-z0-9-]+)/i);
  if (pathMatch) return pathMatch[1];
  return null;
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

  // Check for existing submission
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
      ${submission.course ? `<div><span>Course</span><span>${submission.course}</span></div>` : ""}
      ${submission.yearLevel ? `<div><span>Year Level</span><span>${submission.yearLevel}</span></div>` : ""}
      <div><span>Method</span><span style="text-transform:capitalize;">${submission.paymentMethod}</span></div>
      <div><span>Amount</span><span>${formatMoney(event.feeCentavos)}</span></div>
    </div>

    ${event.active !== false ? `<button type="button" class="btn btn-secondary" id="submitAnotherBtn" style="width:100%; margin-top:16px;">Submit a Different Payment</button>` : ""}
  `;
  if (window.lucide) window.lucide.createIcons();

  document.getElementById("submitAnotherBtn")?.addEventListener("click", () => renderForm(card, event));
}

function renderForm(card, event) {
  const isMembershipFee = event.category === "membership_fee" ||
    (event.title && event.title.toLowerCase().includes("membership")) ||
    (event.slug && event.slug.includes("membership"));

  card.innerHTML = `
    <h1 class="public-event-title">${event.title}</h1>
    <p class="public-event-meta">${formatDate(event.date)}${event.description ? " · " + event.description : ""}</p>
    <div class="public-fee-badge"><i data-lucide="banknote" style="width:14px;height:14px;"></i>${formatMoney(event.feeCentavos)}</div>

    <form id="submitForm">
      <div class="form-group">
        <label for="nameInput">Full Name <span style="color:var(--color-expense);">*</span></label>
        <input type="text" id="nameInput" class="form-control" required placeholder="e.g. Juan Dela Cruz" autocomplete="name" />
      </div>

      ${isMembershipFee ? `
      <div class="form-group">
        <label for="courseInput">Course <span style="color:var(--color-expense);">*</span></label>
        <input type="text" id="courseInput" class="form-control" required placeholder="e.g. BSCS, BSIT, BSIS" autocomplete="off" />
      </div>

      <div class="form-group">
        <label for="yearInput">Year Level <span style="color:var(--color-expense);">*</span></label>
        <select id="yearInput" class="form-control" required style="width:100%;">
          <option value="" disabled selected>Select Year Level</option>
          <option value="1st Year">1st Year</option>
          <option value="2nd Year">2nd Year</option>
          <option value="3rd Year">3rd Year</option>
          <option value="4th Year">4th Year</option>
        </select>
      </div>
      ` : ""}

      <div class="form-group">
        <label>Payment Method <span style="color:var(--color-expense);">*</span></label>
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

      <div class="form-group" id="qrCodeGroup" style="display:none; text-align:center; margin-bottom:16px;">
        <label style="display:block; margin-bottom:8px; text-align:left;">Scan QR to Pay (GCash)</label>
        <div style="background:rgba(255,255,255,0.03); padding:12px; border-radius:8px; border:1px dashed var(--color-border); display:inline-block;">
          <img id="eventQrImg" src="${event.qrCodeDataUrl || ''}" style="max-width:200px; max-height:200px; border-radius:4px; cursor:zoom-in; display:block; margin:0 auto;" />
          <p style="font-size:11px; color:var(--color-text-secondary); margin-top:6px; margin-bottom:0;">Tap QR to view full size</p>
        </div>
      </div>

      <div class="form-group" id="proofGroup" style="display:none;">
        <label for="proofInput">Upload Proof of Payment <span style="color:var(--color-expense);">*</span></label>
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
  const qrCodeGroup = document.getElementById("qrCodeGroup");
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
      if (qrCodeGroup) {
        qrCodeGroup.style.display = (isGcash && event.qrCodeDataUrl) ? "block" : "none";
      }
    });
  });

  const qrImg = document.getElementById("eventQrImg");
  const lightbox = document.getElementById("imageLightbox");
  const lightboxImg = document.getElementById("lightboxImg");

  if (qrImg && lightbox && lightboxImg) {
    qrImg.addEventListener("click", () => {
      lightboxImg.src = qrImg.src;
      lightbox.style.display = "flex";
    });

    lightbox.addEventListener("click", () => {
      lightbox.style.display = "none";
    });
  }

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
    const nameInput = document.getElementById("nameInput");
    const name = nameInput?.value.trim() || "";
    const course = isMembershipFee ? document.getElementById("courseInput")?.value.trim() || "" : "";
    const yearLevel = isMembershipFee ? document.getElementById("yearInput")?.value.trim() || "" : "";
    const method = card.querySelector("input[name=method]:checked")?.value;
    const proofFile = proofInput.files[0] || null;

    if (!name) {
      errorEl.textContent = "Please enter your full name.";
      errorEl.style.display = "block";
      nameInput?.focus();
      return;
    }

    if (isMembershipFee && (!course || !yearLevel)) {
      errorEl.textContent = "Please fill in your Course and Year Level.";
      errorEl.style.display = "block";
      return;
    }

    if (!method) {
      errorEl.textContent = "Please select a payment method.";
      errorEl.style.display = "block";
      return;
    }

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
      const submissionId = await submitPayment({
        eventSlug: event.slug,
        name,
        course,
        yearLevel,
        paymentMethod: method,
        proofImageDataUrl
      });
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
