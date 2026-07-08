// js/events.js
import { store } from "./store.js";
import { getData, addEvent, deleteEvent, toggleParticipantPaid, setEventSlug, setEventActive as setEventActiveLocal, addTransaction, findBestMemberMatch, markParticipantPaidFromSubmission } from "./data.js";
import { formatMoney, formatDate, pesosToCentavos } from "./utils.js";
import { openModal, closeModal, confirmAction, showToast } from "./ui.js";
import { generateUniqueSlug, publishEvent, setEventActive as setEventActiveRemote, subscribeToSubmissions, updateSubmissionStatus } from "./cloud.js";

// Tracks live Firestore listeners so they get torn down and replaced
// cleanly on every re-render, instead of silently piling up — see the
// note above renderEvents() for why this matters.
const activeSubscriptions = new Map();

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
          ${isAdmin ? "Create an event, share the link, and review payment proofs." : "See who's paid for each event."}
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

  // Wire a live submissions subscription for every published event —
  // updates just that event's table directly, no full re-render, so
  // approving one submission doesn't disrupt anything else on screen.
  data.events.forEach((event) => {
    if (!event.slug) return;
    const unsub = subscribeToSubmissions(event.slug, (submissions) => {
      renderSubmissionsTable(event, submissions);
    });
    activeSubscriptions.set(event.id, unsub);
  });
}

function renderEventCard(event, data, isAdmin) {
  const paidCount = event.participants.filter((p) => p.paid).length;
  const total = event.participants.length;

  return `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <div>
          <h3 style="margin:0 0 4px;">${event.title}</h3>
          <p style="margin:0; font-size:13px; color:var(--color-text-secondary);">
            ${formatDate(event.date)} · Fee: ${formatMoney(event.feeCentavos)}
            ${event.description ? " · " + event.description : ""}
          </p>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="status-badge income">${paidCount} / ${total} paid</span>
          ${isAdmin && event.slug ? `<span class="status-badge ${event.active === false ? "expense" : "income"}">${event.active === false ? "Closed" : "Open"}</span>` : ""}
          ${isAdmin && event.slug ? `<button class="icon-btn toggle-active-btn" data-id="${event.id}" data-slug="${event.slug}" data-active="${event.active !== false}" aria-label="${event.active === false ? "Reopen" : "Close"} submissions" title="${event.active === false ? "Reopen submissions" : "Close submissions"}"><i data-lucide="${event.active === false ? "lock-open" : "lock"}"></i></button>` : ""}
          ${isAdmin ? `<button class="icon-btn delete-event-btn" data-id="${event.id}" aria-label="Delete event"><i data-lucide="trash-2"></i></button>` : ""}
        </div>
      </div>

      ${isAdmin && event.slug ? `
        <div style="display:flex; align-items:center; gap:8px; background:var(--color-bg); border:1px solid var(--color-border); border-radius:var(--radius-sm); padding:8px 10px; margin-bottom:16px; font-size:12.5px;">
          <i data-lucide="link-2" style="width:14px;height:14px; flex-shrink:0; color:var(--color-text-secondary);"></i>
          <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--color-text-secondary);">${publicUrlFor(event.slug)}</span>
          <button class="btn btn-secondary copy-link-btn" data-url="${publicUrlFor(event.slug)}" style="padding:4px 10px; font-size:12px; flex-shrink:0;">Copy Link</button>
        </div>
      ` : ""}

      ${isAdmin ? `
        <div id="submissions-${event.id}" style="margin-bottom:16px;">
          <p style="font-size:12.5px; color:var(--color-text-secondary);">Loading submissions...</p>
        </div>
      ` : ""}

      <p style="font-size:12.5px; font-weight:600; color:var(--color-text-secondary); text-transform:uppercase; letter-spacing:0.04em; margin:0 0 8px;">Local Members</p>
      ${total === 0 ? `<p style="color:var(--color-text-secondary); font-size:13px;">No members to track yet. Add members first.</p>` : `
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th>Member</th><th style="text-align:right;">Status</th></tr></thead>
            <tbody>
              ${event.participants.map((p) => {
                const member = data.members.find((m) => m.id === p.memberId);
                if (!member) return "";
                return `
                <tr>
                  <td>${member.name}</td>
                  <td style="text-align:right;">
                    ${isAdmin ? `
                      <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-size:13px;">
                        <span class="status-badge ${p.paid ? "income" : "expense"}">${p.paid ? "Paid" : "Unpaid"}</span>
                        <input type="checkbox" class="paid-toggle" data-event-id="${event.id}" data-member-id="${member.id}" ${p.paid ? "checked" : ""} style="width:16px;height:16px;accent-color:var(--color-accent);" />
                      </label>
                    ` : `<span class="status-badge ${p.paid ? "income" : "expense"}">${p.paid ? "Paid" : "Unpaid"}</span>`}
                  </td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function renderSubmissionsTable(event, submissions) {
  const container = document.getElementById(`submissions-${event.id}`);
  if (!container) return; // card no longer on screen (nav'd away) — the subscription gets torn down on next render anyway

  if (submissions.length === 0) {
    container.innerHTML = `<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0 0 16px;">No public submissions yet.</p>`;
    return;
  }

  const members = getData().members;

  container.innerHTML = `
    <p style="font-size:12.5px; font-weight:600; color:var(--color-text-secondary); text-transform:uppercase; letter-spacing:0.04em; margin:0 0 8px;">Public Submissions</p>
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Submitted Name</th><th>Match</th><th>Method</th><th>Proof</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${submissions.map((s) => {
            const match = findBestMemberMatch(s.name);
            const suggestSelection = match && match.confidence !== "low"; // only pre-select on decent confidence — a low-confidence guess is worse than making the admin pick
            return `
            <tr>
              <td>${s.name}</td>
              <td>
                ${s.status === "pending" ? `
                  <select class="form-control member-match-select" data-sub-id="${s.id}" style="font-size:12.5px; padding:4px 8px; min-width:160px;">
                    <option value="">No match / Guest</option>
                    ${members.map((m) => `<option value="${m.id}" ${suggestSelection && match.member.id === m.id ? "selected" : ""}>${m.name}${m.nickname ? ` (${m.nickname})` : ""}</option>`).join("")}
                  </select>
                  ${match ? `<div style="font-size:11px; color:var(--color-text-secondary); margin-top:3px;">Guessed: ${match.member.name} (${match.confidence} confidence)</div>` : ""}
                ` : (s.matchedMemberName || "—")}
              </td>
              <td style="text-transform:capitalize;">${s.paymentMethod}</td>
              <td>${s.proofImage ? `<img src="${s.proofImage}" class="proof-thumb" data-full="${s.proofImage}" alt="Proof" style="width:32px;height:32px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid var(--color-border);" />` : "—"}</td>
              <td><span class="status-badge ${s.status === "paid" ? "income" : s.status === "rejected" ? "expense" : ""}" style="${s.status === "pending" ? "background:var(--color-bg);color:var(--color-text-secondary);" : ""}">${s.status}</span></td>
              <td style="white-space:nowrap;">
                ${s.status === "pending" ? `
                  <button class="btn btn-secondary approve-btn" data-sub-id="${s.id}" data-event-id="${event.id}" data-name="${s.name}" style="padding:4px 10px;font-size:12px;">Approve</button>
                  <button class="btn btn-secondary reject-btn" data-sub-id="${s.id}" style="padding:4px 10px;font-size:12px;color:var(--color-expense);">Reject</button>
                ` : ""}
              </td>
            </tr>
          `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll(".proof-thumb").forEach((thumb) =>
    thumb.addEventListener("click", () => {
      document.getElementById("previewImage").src = thumb.dataset.full;
      openModal(document.querySelector(".image-preview-overlay"));
    })
  );

  container.querySelectorAll(".approve-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const select = container.querySelector(`.member-match-select[data-sub-id="${btn.dataset.subId}"]`);
      const matchedMemberId = select?.value || null;
      const matchedMember = matchedMemberId ? getData().members.find((m) => m.id === matchedMemberId) : null;

      await updateSubmissionStatus(btn.dataset.subId, "paid");
      addTransaction({
        type: "income",
        category: event.title,
        amount: event.feeCentavos,
        note: `Payment from ${btn.dataset.name} (via public link)`,
      });

      if (matchedMember) {
        markParticipantPaidFromSubmission(event.id, matchedMember.id);
        showToast(`Marked paid, logged, and checked off ${matchedMember.name}`, "success");
      } else {
        showToast("Marked paid and logged to transactions", "success");
      }
    })
  );

  container.querySelectorAll(".reject-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await updateSubmissionStatus(btn.dataset.subId, "rejected");
      showToast("Submission rejected", "success");
    })
  );
}

export function initEventModal() {
  const overlay = document.querySelector(".event-modal-overlay");
  overlay?.querySelector(".modal-close-btn")?.addEventListener("click", () => closeModal(overlay));
  overlay?.addEventListener("click", (e) => { if (e.target === overlay) closeModal(overlay); });

  overlay?.querySelector("form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("eventTitleInput").value.trim();
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
      await publishEvent({ slug, title, description, feeCentavos, date });
    } catch (err) {
      console.error("Couldn't publish event to Firebase:", err);
      showToast("Saved locally, but the shareable link failed. Check Firebase setup", "error");
    }

    addEvent({ title, date, feeCentavos, description, slug });
    showToast(slug ? "Event created and link is live" : "Event created", "success");
    closeModal(overlay);
    e.target.reset();
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Event";
  });
}