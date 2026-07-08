// js/events.js
import { store } from "./store.js";
import { getData, addEvent, deleteEvent, toggleParticipantPaid, setEventSlug, setEventActive as setEventActiveLocal, addTransaction, findBestMemberMatch, markParticipantPaidFromSubmission, addMember } from "./data.js";
import { formatMoney, formatDate, pesosToCentavos } from "./utils.js";
import { openModal, closeModal, confirmAction, showToast } from "./ui.js";
import { generateUniqueSlug, publishEvent, setEventActive as setEventActiveRemote, subscribeToSubmissions, updateSubmissionStatus } from "./cloud.js";

// Tracks live Firestore listeners so they get torn down and replaced
// cleanly on every re-render, instead of silently piling up — see the
// note above renderEvents() for why this matters.
const activeSubscriptions = new Map();

// In-memory cache of event submissions so counts and the management modal can read from it
const eventSubmissionsCache = new Map();

// Managed event state
let currentManagedEventId = null;
let currentTab = "pending";
let manageSearchQuery = "";
let manageMethodFilter = "all";
let managePage = 1;
const ITEMS_PER_PAGE = 8;

function publicUrlFor(slug) {
  return `${location.origin}${location.pathname.replace(/index\.html$/, "")}event.html?slug=${slug}`;
}

export function renderEvents() {
  const isAdmin = store.get("isAdmin");
  const sectionEl = document.querySelector('section[data-route="#/events"]');
  const data = getData();

  // Every call to renderEvents() rebuilds the DOM for all event cards —
  // any Firestore listeners attached to the previous DOM are now
  // pointing at detached nodes. Tear them all down before rebuilding.
  activeSubscriptions.forEach((unsub) => unsub());
  activeSubscriptions.clear();

  sectionEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
      <div>
        <h2 style="margin:0 0 4px;">Events</h2>
        <p style="color:var(--color-text-secondary); margin:0; font-size:14px;">
          ${isAdmin ? "Create an event, share the link, and manage payments." : "See who's paid for each event."}
        </p>
      </div>
      ${isAdmin ? `<button class="btn btn-primary" id="addEventBtn"><i data-lucide="calendar-plus" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;"></i>Add Event</button>` : ""}
    </div>

    ${data.events.length === 0 ? `
      <div class="card empty-state">
        <i data-lucide="calendar"></i>
        <p>No events yet${isAdmin ? ". Create one to start tracking payments." : "."}</p>
      </div>` : `
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${data.events.map((event) => renderEventCard(event, data, isAdmin)).join("")}
      </div>`
    }
  `;

  if (window.lucide) window.lucide.createIcons();

  // Handle highlight from global search
  const highlightTarget = store.get("highlightTarget");
  if (highlightTarget && highlightTarget.type === "event" && highlightTarget.id) {
    const card = sectionEl.querySelector(`.event-card[data-id="${highlightTarget.id}"]`);
    if (card) {
      setTimeout(() => {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("row-highlight-flash");
        store.set("highlightTarget", null);
      }, 150);
    }
  }

  if (!isAdmin) return;

  document.getElementById("addEventBtn")?.addEventListener("click", () => openModal(document.querySelector(".event-modal-overlay")));

  sectionEl.querySelectorAll(".delete-event-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const confirmed = await confirmAction("Delete this event? Payment records tied to it will also be removed.");
      if (confirmed) {
        deleteEvent(btn.dataset.id);
        showToast("Event deleted", "success");
      }
    })
  );

  sectionEl.querySelectorAll(".paid-toggle").forEach((toggle) =>
    toggle.addEventListener("change", () => {
      toggleParticipantPaid(toggle.dataset.eventId, toggle.dataset.memberId);
    })
  );

  sectionEl.querySelectorAll(".toggle-active-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const currentlyActive = btn.dataset.active === "true";
      const nextActive = !currentlyActive;
      btn.disabled = true;
      try {
        await setEventActiveRemote(btn.dataset.slug, nextActive);
        setEventActiveLocal(btn.dataset.id, nextActive);
        showToast(nextActive ? "Submissions reopened" : "Submissions closed", "success");
      } catch (err) {
        console.error("Couldn't update event status:", err);
        showToast("Couldn't update. Check your connection", "error");
        btn.disabled = false;
      }
    })
  );

  sectionEl.querySelectorAll(".copy-link-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(btn.dataset.url);
      showToast("Link copied", "success");
    })
  );

  sectionEl.querySelectorAll(".manage-payments-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const eventId = btn.dataset.id;
      const event = data.events.find((e) => e.id === eventId);
      if (!event) return;

      currentManagedEventId = eventId;
      currentTab = "pending";
      manageSearchQuery = "";
      manageMethodFilter = "all";
      managePage = 1;

      const searchInput = document.getElementById("manageSearchInput");
      if (searchInput) searchInput.value = "";
      const methodFilter = document.getElementById("manageMethodFilter");
      if (methodFilter) methodFilter.value = "all";

      // Reset tab buttons active state
      const overlay = document.querySelector(".manage-payments-modal-overlay");
      if (overlay) {
        overlay.querySelectorAll(".tab-btn").forEach((b) => {
          if (b.dataset.tab === "pending") b.classList.add("active");
          else b.classList.remove("active");
        });
        openModal(overlay);
      }

      const submissions = eventSubmissionsCache.get(eventId) || [];
      renderSubmissionsManagement(event, submissions);
    })
  );

  // Wire a live submissions subscription for every published event —
  // updates just that event's table directly, no full re-render, so
  // approving one submission doesn't disrupt anything else on screen.
  data.events.forEach((event) => {
    if (!event.slug) return;
    const unsub = subscribeToSubmissions(event.slug, (submissions) => {
      // Cache submissions
      eventSubmissionsCache.set(event.id, submissions);

      // Update card counts
      const pendingEl = document.getElementById(`card-pending-${event.id}`);
      const rejectedEl = document.getElementById(`card-rejected-${event.id}`);

      const pendingCount = submissions.filter((s) => s.status === "pending").length;
      const rejectedCount = submissions.filter((s) => s.status === "rejected").length;

      if (pendingEl) pendingEl.textContent = pendingCount;
      if (rejectedEl) rejectedEl.textContent = rejectedCount;

      // If this is the currently managed event, live refresh the management modal
      if (currentManagedEventId === event.id) {
        renderSubmissionsManagement(event, submissions);
      }
    });
    activeSubscriptions.set(event.id, unsub);
  });
}

function renderEventCard(event, data, isAdmin) {
  const paidCount = event.participants.filter((p) => p.paid).length;
  const total = event.participants.length;

  // Pretty category label
  let categoryLabel = "General Event";
  if (event.category === "membership_fee") {
    categoryLabel = "Membership Fee";
  } else if (event.category === "officer_collection") {
    categoryLabel = "Officer Weekly Collection";
  }

  return `
    <div class="card event-card" data-id="${event.id}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom:12px;">
        <div>
          <span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--color-text-secondary); margin-bottom:6px; display:inline-block; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em;">${categoryLabel}</span>
          <h3 style="margin:0 0 4px; font-family:var(--font-display);">${event.title}</h3>
          <p style="margin:0; font-size:13px; color:var(--color-text-secondary);">
            ${formatDate(event.date)} · Fee: ${formatMoney(event.feeCentavos)}
            ${event.description ? " · " + event.description : ""}
          </p>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          ${isAdmin && event.slug ? `<span class="status-badge ${event.active === false ? "expense" : "income"}">${event.active === false ? "Closed" : "Open"}</span>` : ""}
          ${isAdmin && event.slug ? `<button class="icon-btn toggle-active-btn" data-id="${event.id}" data-slug="${event.slug}" data-active="${event.active !== false}" aria-label="${event.active === false ? "Reopen" : "Close"} submissions" title="${event.active === false ? "Reopen submissions" : "Close submissions"}"><i data-lucide="${event.active === false ? "lock-open" : "lock"}"></i></button>` : ""}
          ${isAdmin ? `<button class="icon-btn delete-event-btn" data-id="${event.id}" aria-label="Delete event"><i data-lucide="trash-2"></i></button>` : ""}
        </div>
      </div>

      <!-- Summary Stats Row -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap:12px; margin:16px 0; background:rgba(255,255,255,0.02); border:1px solid var(--color-border); padding:12px; border-radius:var(--radius-md);">
        <div style="text-align:center;">
          <p style="margin:0; font-size:11px; color:var(--color-text-secondary); text-transform:uppercase; font-weight:600; letter-spacing:0.05em;">Total Paid</p>
          <p style="margin:4px 0 0; font-size:16px; font-weight:700; color:var(--color-income);">${paidCount} / ${total} Paid</p>
        </div>
        <div style="text-align:center;">
          <p style="margin:0; font-size:11px; color:var(--color-text-secondary); text-transform:uppercase; font-weight:600; letter-spacing:0.05em;">Pending Review</p>
          <p id="card-pending-${event.id}" style="margin:4px 0 0; font-size:16px; font-weight:700; color:var(--color-accent);">—</p>
        </div>
        <div style="text-align:center;">
          <p style="margin:0; font-size:11px; color:var(--color-text-secondary); text-transform:uppercase; font-weight:600; letter-spacing:0.05em;">Rejected</p>
          <p id="card-rejected-${event.id}" style="margin:4px 0 0; font-size:16px; font-weight:700; color:var(--color-expense);">0</p>
        </div>
      </div>

      ${isAdmin && event.slug ? `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
          <button class="btn btn-primary manage-payments-btn" data-id="${event.id}" data-slug="${event.slug}" style="padding:8px 16px; font-size:13px; display:inline-flex; align-items:center; gap:6px;">
            <i data-lucide="sliders" style="width:14px; height:14px;"></i> Manage Payments
          </button>
          <button class="btn btn-secondary copy-link-btn" data-url="${publicUrlFor(event.slug)}" style="padding:8px 14px; font-size:13px; display:inline-flex; align-items:center; gap:6px;">
            <i data-lucide="copy" style="width:13px; height:13px;"></i> Copy Link
          </button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderSubmissionsManagement(event, submissions) {
  const modal = document.querySelector(".manage-payments-modal-overlay");
  if (!modal) return;

  const titleEl = document.getElementById("managePaymentsTitle");
  const subtitleEl = document.getElementById("managePaymentsSubtitle");
  const contentEl = document.getElementById("manageSubmissionsContent");
  const footerEl = document.getElementById("manageSubmissionsFooter");

  if (titleEl) titleEl.textContent = `Manage Payments: ${event.title}`;
  
  let categoryLabel = "General Event";
  if (event.category === "membership_fee") {
    categoryLabel = "Membership Fee (Auto-creates member on approval)";
  } else if (event.category === "officer_collection") {
    categoryLabel = "Officer Weekly Collection (Mark officer paid)";
  }
  if (subtitleEl) subtitleEl.textContent = `${categoryLabel} · Fee: ${formatMoney(event.feeCentavos)}`;

  // Filter submissions by current tab status
  let filtered = submissions.filter((s) => s.status === currentTab);

  // Filter by method
  if (manageMethodFilter !== "all") {
    filtered = filtered.filter((s) => s.paymentMethod === manageMethodFilter);
  }

  // Filter by search query
  if (manageSearchQuery) {
    const q = manageSearchQuery.toLowerCase();
    filtered = filtered.filter((s) => (s.name || "").toLowerCase().includes(q));
  }

  // Paginate
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  if (managePage > totalPages) managePage = totalPages;
  const startIdx = (managePage - 1) * ITEMS_PER_PAGE;
  const paginated = filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  // Render list of submissions
  if (paginated.length === 0) {
    contentEl.innerHTML = `
      <div style="text-align:center; padding:48px 0; color:var(--color-text-secondary);">
        <i data-lucide="inbox" style="width:40px; height:40px; margin-bottom:12px; stroke-width:1.5; color:rgba(255,255,255,0.15);"></i>
        <p style="margin:0; font-size:14px;">No ${currentTab} submissions match your filters.</p>
      </div>
    `;
    footerEl.innerHTML = `<span style="color:var(--color-text-secondary);">Showing 0 of 0</span>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const data = getData();
  const members = data.members || [];

  let html = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      ${paginated.map((s) => {
        const match = findBestMemberMatch(s.name);
        const suggestSelection = match && match.confidence !== "low";
        
        // Render the member match selector
        let selectHtml = "";
        if (s.status === "pending") {
          selectHtml = `
            <div style="display:flex; flex-direction:column; gap:4px; min-width:200px;">
              <label style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--color-text-secondary);">Match to Member</label>
              <select class="form-control member-match-select" data-sub-id="${s.id}" style="font-size:13px; height:36px; padding:0 8px; margin:0;">
                <option value="">No match / Guest</option>
                ${members.map((m) => `<option value="${m.id}" ${suggestSelection && match.member.id === m.id ? "selected" : ""}>${m.name}${m.nickname ? ` (${m.nickname})` : ""} · ${m.officerRole || "Member"}</option>`).join("")}
              </select>
              ${match ? `<div style="font-size:11px; color:var(--color-accent); font-weight:500;">Best Guess: ${match.member.name} (${match.confidence} confidence)</div>` : ""}
              ${event.category === "membership_fee" ? `<div style="font-size:11px; color:var(--color-text-secondary);">✨ If no match is chosen, a new Member record will be created.</div>` : ""}
              ${event.category === "officer_collection" ? `<div style="font-size:11px; color:var(--color-text-secondary);">⚠️ Make sure to match an existing officer.</div>` : ""}
            </div>
          `;
        } else {
          selectHtml = `
            <div>
              <p style="margin:0; font-size:11px; text-transform:uppercase; color:var(--color-text-secondary); font-weight:600;">Matched Member</p>
              <p style="margin:4px 0 0; font-size:13.5px; font-weight:600;">${s.matchedMemberName || "Guest / Guest Account"}</p>
            </div>
          `;
        }

        const submissionTime = s.submittedAt ? formatDate(new Date(s.submittedAt.seconds * 1000)) : "Just now";

        return `
          <div class="card" style="background:var(--color-surface); border:1px solid var(--color-border); padding:16px; display:flex; gap:20px; flex-wrap:wrap; align-items:center; justify-content:space-between; transition: border-color var(--transition-fast);">
            <div style="display:flex; gap:16px; align-items:center; flex:1; min-width:280px;">
              <!-- Proof Thumbnail -->
              ${s.proofImage ? `
                <div style="position:relative; width:64px; height:64px; border-radius:var(--radius-md); overflow:hidden; border:1px solid var(--color-border); cursor:pointer; flex-shrink:0;" class="proof-thumb" data-full="${s.proofImage}">
                  <img src="${s.proofImage}" style="width:100%; height:100%; object-fit:cover;" alt="Proof" />
                  <div style="position:absolute; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity var(--transition-fast);" class="thumb-hover-overlay">
                    <i data-lucide="eye" style="width:16px; height:16px; color:white;"></i>
                  </div>
                </div>
              ` : `
                <div style="width:64px; height:64px; border-radius:var(--radius-md); background:rgba(255,255,255,0.02); border:1px dashed var(--color-border); display:flex; align-items:center; justify-content:center; color:var(--color-text-secondary); flex-shrink:0;">
                  <i data-lucide="image-off" style="width:18px; height:18px;"></i>
                </div>
              `}
              
              <div>
                <h4 style="margin:0 0 4px; font-size:15px; font-weight:700;">${s.name}</h4>
                <p style="margin:0; font-size:12.5px; color:var(--color-text-secondary); display:flex; align-items:center; gap:8px;">
                  <span style="display:inline-flex; align-items:center; gap:4px; text-transform:capitalize;"><i data-lucide="${s.paymentMethod === 'gcash' ? 'smartphone' : 'banknote'}" style="width:12px; height:12px;"></i>${s.paymentMethod}</span>
                  · <span>${submissionTime}</span>
                </p>
              </div>
            </div>

            <!-- Member matching select -->
            <div style="flex:1; min-width:200px; max-width:300px;">
              ${selectHtml}
            </div>

            <!-- Actions block -->
            <div style="display:flex; gap:8px; align-items:center;">
              ${s.status === "pending" ? `
                <button class="btn btn-primary approve-btn" data-sub-id="${s.id}" data-event-id="${event.id}" data-name="${s.name}" style="padding:8px 16px; font-size:13px; display:inline-flex; align-items:center; gap:4px;">
                  <i data-lucide="check" style="width:14px; height:14px;"></i> Approve
                </button>
                <button class="btn btn-secondary reject-btn" data-sub-id="${s.id}" style="padding:8px 16px; font-size:13px; color:var(--color-expense); border-color:rgba(239, 68, 68, 0.2); display:inline-flex; align-items:center; gap:4px;">
                  <i data-lucide="x" style="width:14px; height:14px;"></i> Reject
                </button>
              ` : `
                <span class="status-badge ${s.status === 'paid' ? 'income' : 'expense'}" style="font-size:12px; padding:6px 12px;">
                  ${s.status === 'paid' ? 'Approved & Logged' : 'Rejected'}
                </span>
              `}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  contentEl.innerHTML = html;

  if (window.lucide) window.lucide.createIcons();

  // Highlight proof images on hover & wire click to open modal
  contentEl.querySelectorAll(".proof-thumb").forEach((thumb) => {
    thumb.addEventListener("mouseenter", () => {
      const overlay = thumb.querySelector(".thumb-hover-overlay");
      if (overlay) overlay.style.opacity = "1";
    });
    thumb.addEventListener("mouseleave", () => {
      const overlay = thumb.querySelector(".thumb-hover-overlay");
      if (overlay) overlay.style.opacity = "0";
    });
    thumb.addEventListener("click", () => {
      document.getElementById("previewImage").src = thumb.dataset.full;
      openModal(document.querySelector(".image-preview-overlay"));
    });
  });

  // Wire pagination footer
  const showingStart = startIdx + 1;
  const showingEnd = Math.min(startIdx + ITEMS_PER_PAGE, totalItems);
  footerEl.innerHTML = `
    <span style="color:var(--color-text-secondary);">Showing ${showingStart} to ${showingEnd} of ${totalItems} submissions</span>
    <div style="display:flex; gap:6px;">
      <button class="btn btn-secondary prev-page-btn" ${managePage === 1 ? "disabled" : ""} style="padding:4px 8px;"><i data-lucide="chevron-left" style="width:16px; height:16px;"></i></button>
      <span style="align-self:center; margin:0 8px; font-weight:600;">Page ${managePage} of ${totalPages}</span>
      <button class="btn btn-secondary next-page-btn" ${managePage === totalPages ? "disabled" : ""} style="padding:4px 8px;"><i data-lucide="chevron-right" style="width:16px; height:16px;"></i></button>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Attach navigation listeners
  footerEl.querySelector(".prev-page-btn")?.addEventListener("click", () => {
    if (managePage > 1) {
      managePage--;
      renderSubmissionsManagement(event, submissions);
    }
  });
  footerEl.querySelector(".next-page-btn")?.addEventListener("click", () => {
    if (managePage < totalPages) {
      managePage++;
      renderSubmissionsManagement(event, submissions);
    }
  });

  // Wire Approve and Reject buttons inside the popup
  contentEl.querySelectorAll(".approve-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const subId = btn.dataset.subId;
      const select = contentEl.querySelector(`.member-match-select[data-sub-id="${subId}"]`);
      const matchedMemberId = select?.value || null;
      let matchedMember = matchedMemberId ? getData().members.find((m) => m.id === matchedMemberId) : null;

      // Update Firebase submission status and locally cache name
      await updateSubmissionStatus(subId, "paid");

      // Add financial ledger transaction
      addTransaction({
        type: "income",
        category: event.title,
        amount: event.feeCentavos,
        note: `Payment from ${btn.dataset.name} (via public link)`,
      });

      // Implement Category-specific behaviors
      if (event.category === "membership_fee") {
        if (!matchedMember) {
          // AUTOMATICALLY CREATE NEW MEMBER
          matchedMember = addMember({
            name: btn.dataset.name,
            course: "—",
            yearLevel: "—",
            contact: "—",
            officerRole: "",
          });
          markParticipantPaidFromSubmission(event.id, matchedMember.id);
          showToast(`Created new Member record and marked paid for ${matchedMember.name}`, "success");
        } else {
          // Use matched existing member
          markParticipantPaidFromSubmission(event.id, matchedMember.id);
          showToast(`Marked existing member ${matchedMember.name} as paid`, "success");
        }
      } else if (event.category === "officer_collection") {
        if (matchedMember) {
          markParticipantPaidFromSubmission(event.id, matchedMember.id);
          showToast(`Officer ${matchedMember.name} marked paid for weekly collection`, "success");
        } else {
          showToast(`Logged collection payment of ${btn.dataset.name}, but no officer was marked paid.`, "success");
        }
      } else {
        // General Event behavior
        if (matchedMember) {
          markParticipantPaidFromSubmission(event.id, matchedMember.id);
          showToast(`Marked ${matchedMember.name} as paid`, "success");
        } else {
          showToast("Approved payment and logged guest transaction", "success");
        }
      }

      // Rerender dashboard & event views to synchronize local member additions
      renderEvents();
    });
  });

  contentEl.querySelectorAll(".reject-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await updateSubmissionStatus(btn.dataset.subId, "rejected");
      showToast("Submission rejected", "success");
      // Rerender to show change
      renderEvents();
    });
  });
}

export function initManagePaymentsModal() {
  const overlay = document.querySelector(".manage-payments-modal-overlay");
  if (!overlay) return;

  overlay.querySelector(".modal-close-btn")?.addEventListener("click", () => {
    closeModal(overlay);
    currentManagedEventId = null;
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeModal(overlay);
      currentManagedEventId = null;
    }
  });

  // Tab buttons navigation
  const tabButtons = overlay.querySelectorAll(".tab-btn");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      managePage = 1; // reset page
      refreshManagedEventSubmissions();
    });
  });

  // Search input
  const searchInput = document.getElementById("manageSearchInput");
  searchInput?.addEventListener("input", () => {
    manageSearchQuery = searchInput.value.trim();
    managePage = 1;
    refreshManagedEventSubmissions();
  });

  // Method filter
  const methodFilter = document.getElementById("manageMethodFilter");
  methodFilter?.addEventListener("change", () => {
    manageMethodFilter = methodFilter.value;
    managePage = 1;
    refreshManagedEventSubmissions();
  });
}

function refreshManagedEventSubmissions() {
  if (!currentManagedEventId) return;
  const data = getData();
  const event = data.events.find((e) => e.id === currentManagedEventId);
  const submissions = eventSubmissionsCache.get(currentManagedEventId) || [];
  if (event) {
    renderSubmissionsManagement(event, submissions);
  }
}


export function initEventModal() {
  const overlay = document.querySelector(".event-modal-overlay");
  overlay?.querySelector(".modal-close-btn")?.addEventListener("click", () => closeModal(overlay));
  overlay?.addEventListener("click", (e) => { if (e.target === overlay) closeModal(overlay); });

  overlay?.querySelector("form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("eventTitleInput").value.trim();
    const category = document.getElementById("eventCategorySelect").value;
    const date = document.getElementById("eventDateInput").value;
    const feeInput = document.getElementById("eventFeeInput").value;
    const description = document.getElementById("eventDescInput").value.trim();

    if (!title || !date || feeInput === "") return;

    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Publishing link...";

    const feeCentavos = pesosToCentavos(feeInput);
    let slug = null;

    try {
      slug = await generateUniqueSlug(title);
      await publishEvent({ slug, title, description, feeCentavos, date, category });
    } catch (err) {
      console.error("Couldn't publish event to Firebase:", err);
      showToast("Saved locally, but the shareable link failed. Check Firebase setup", "error");
    }

    addEvent({ title, date, feeCentavos, description, slug, category });
    showToast(slug ? "Event created and link is live" : "Event created", "success");
    closeModal(overlay);
    e.target.reset();
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Event";
  });
}