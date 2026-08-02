// js/members.js
import { store } from "./store.js";
import { getData, addMember, updateMember, deleteMember, getMemberOutstandingCentavos, setParticipantPaidAmount } from "./data.js";
import { formatMoney, pesosToCentavos, formatDate } from "./utils.js";
import { openModal, closeModal, confirmAction, showToast } from "./ui.js";

let editingMemberId = null;

function getRoleRank(role) {
  if (!role) return 1000; // Regular members or blank role at the bottom
  const r = role.toLowerCase().trim();
  
  if (r === "president") return 1;
  if (r.startsWith("vice president") || r === "vp" || r.startsWith("vp")) return 2;
  if (r.startsWith("secretary")) return 3;
  if (r.startsWith("treasurer")) return 4;
  if (r.startsWith("auditor")) return 5;
  if (r.startsWith("public relations officer") || r === "pro" || r === "p.r.o.") return 6;
  if (r.startsWith("social media manager")) return 7;
  if (r.startsWith("sergeant-at-arms")) return 8;
  if (r === "coder") return 9;
  if (r.startsWith("special projects")) return 10;
  if (r.startsWith("membership committee")) return 11;
  if (r.startsWith("1st year representative") || r === "1st year rep") return 12;
  if (r.startsWith("2nd year representative") || r === "2nd year rep") return 13;
  if (r.startsWith("3rd year representative") || r === "3rd year rep") return 14;
  if (r.startsWith("4th year representative") || r === "4th year rep") return 15;
  
  // Any other officer roles
  return 100;
}

function getOfficerBadge(role) {
  if (!role) {
    return `<span style="color:var(--color-text-secondary); font-size:13px; font-weight:500;">Member</span>`;
  }
  const r = role.toLowerCase().trim();
  if (r === "member" || r === "regular member") {
    return `<span style="color:var(--color-text-secondary); font-size:13px; font-weight:500;">Member</span>`;
  }

  let bg = "rgba(107, 114, 128, 0.08)";
  let color = "var(--color-text-secondary)";
  let border = "rgba(107, 114, 128, 0.15)";

  if (r === "president") {
    bg = "rgba(168, 85, 247, 0.1)"; // Violet
    color = "#a855f7";
    border = "rgba(168, 85, 247, 0.2)";
  } else if (r.startsWith("vice president") || r === "vp" || r.startsWith("vp")) {
    bg = "rgba(99, 102, 241, 0.1)"; // Indigo
    color = "#6366f1";
    border = "rgba(99, 102, 241, 0.2)";
  } else if (r.startsWith("secretary")) {
    bg = "rgba(59, 130, 246, 0.1)"; // Blue
    color = "#3b82f6";
    border = "rgba(59, 130, 246, 0.2)";
  } else if (r.startsWith("treasurer")) {
    bg = "rgba(6, 182, 212, 0.1)"; // Cyan
    color = "#06b6d4";
    border = "rgba(6, 182, 212, 0.2)";
  } else if (r.startsWith("auditor")) {
    bg = "rgba(16, 185, 129, 0.1)"; // Green
    color = "#10b981";
    border = "rgba(16, 185, 129, 0.2)";
  } else if (r.startsWith("public relations officer") || r === "pro" || r === "p.r.o.") {
    bg = "rgba(132, 204, 22, 0.1)"; // Lime
    color = "#84cc16";
    border = "rgba(132, 204, 22, 0.2)";
  } else if (r.startsWith("social media manager")) {
    bg = "rgba(234, 179, 8, 0.1)"; // Yellow
    color = "#eab308";
    border = "rgba(234, 179, 8, 0.2)";
  } else if (r.startsWith("sergeant-at-arms")) {
    bg = "rgba(245, 158, 11, 0.1)"; // Amber
    color = "#f59e0b";
    border = "rgba(245, 158, 11, 0.2)";
  } else if (r === "coder") {
    bg = "rgba(249, 115, 22, 0.1)"; // Orange
    color = "#f97316";
    border = "rgba(249, 115, 22, 0.2)";
  } else if (r.startsWith("special projects")) {
    bg = "rgba(244, 63, 94, 0.1)"; // Rose / Orange-Red
    color = "#f43f5e";
    border = "rgba(244, 63, 94, 0.2)";
  } else if (r.startsWith("membership committee")) {
    bg = "rgba(236, 72, 153, 0.1)"; // Pink
    color = "#ec4899";
    border = "rgba(236, 72, 153, 0.2)";
  } else if (r.startsWith("1st year representative") || r === "1st year rep") {
    bg = "rgba(251, 113, 133, 0.1)"; // Light Red / Rose-400
    color = "#fb7185";
    border = "rgba(251, 113, 133, 0.2)";
  } else if (r.startsWith("2nd year representative") || r === "2nd year rep") {
    bg = "rgba(244, 63, 94, 0.1)"; // Rose-500
    color = "#f43f5e";
    border = "rgba(244, 63, 94, 0.2)";
  } else if (r.startsWith("3rd year representative") || r === "3rd year rep") {
    bg = "rgba(225, 29, 72, 0.1)"; // Rose-600
    color = "#e11d48";
    border = "rgba(225, 29, 72, 0.2)";
  } else if (r.startsWith("4th year representative") || r === "4th year rep") {
    bg = "rgba(190, 24, 74, 0.1)"; // Rose-700
    color = "#be185d";
    border = "rgba(190, 24, 74, 0.2)";
  } else if (r.includes("representative") || r.includes("rep")) {
    bg = "rgba(239, 68, 68, 0.1)"; // Red
    color = "#ef4444";
    border = "rgba(239, 68, 68, 0.2)";
  } else {
    bg = "rgba(75, 85, 99, 0.08)";
    color = "var(--color-text-primary)";
    border = "rgba(75, 85, 99, 0.15)";
  }

  return `<span class="status-badge officer-badge" style="background:${bg}; color:${color}; border:1px solid ${border}; --badge-color:${color}; font-weight:600; padding:2px 8px; border-radius:4px; font-size:12px; display:inline-block;">${role}</span>`;
}

export function renderMembers() {
  const isAdmin = store.get("isAdmin");
  const sectionEl = document.querySelector('section[data-route="#/members"]');
  const data = getData();

  const sortedMembers = [...(data.members || [])].sort((a, b) => {
    const rankA = getRoleRank(a.officerRole);
    const rankB = getRoleRank(b.officerRole);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return (a.name || "").localeCompare(b.name || "");
  });

  sectionEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
      <div>
        <h2 style="margin:0 0 4px;">Members</h2>
        <p style="color:var(--color-text-secondary); margin:0; font-size:14px;">
          ${isAdmin ? "Add, edit, or remove members." : "View-only. Sign in as admin to make changes."}
        </p>
      </div>
      ${isAdmin ? `<button class="btn btn-primary" id="addMemberBtn"><i data-lucide="user-plus" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;"></i>Add Member</button>` : ""}
    </div>

    <div class="card">
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th><th>Officer Role</th><th>Course</th><th>Year</th><th>Contact</th>
              <th style="text-align:right;">Outstanding</th>
              ${isAdmin ? "<th></th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${sortedMembers.length === 0 ? `
              <tr><td colspan="${isAdmin ? 7 : 6}">
                <div class="empty-state"><i data-lucide="users"></i><p>No members yet${isAdmin ? ". Add your first one." : "."}</p></div>
              </td></tr>` : sortedMembers.map((m) => {
                const outstanding = getMemberOutstandingCentavos(m.id);
                return `
                <tr class="member-row" data-id="${m.id}">
                  <td>${m.name}${m.nickname ? ` <span style="color:var(--color-text-secondary); font-weight:400;">(${m.nickname})</span>` : ""}</td>
                  <td>${getOfficerBadge(m.officerRole)}</td>
                  <td>${m.course || "—"}</td>
                  <td>${m.yearLevel || "—"}</td>
                  <td>${m.contact || "—"}</td>
                  <td class="amount-cell ${outstanding > 0 ? "text-expense" : "text-income"}">
                    <button class="dues-btn" data-id="${m.id}" style="background:transparent; border:none; color:inherit; font:inherit; cursor:pointer; font-weight:600; text-decoration:underline; text-decoration-style:dotted;" title="Click to view dues or edit payments">
                      ${outstanding > 0 ? formatMoney(outstanding) : "Paid up"}
                    </button>
                  </td>
                  ${isAdmin ? `
                  <td style="white-space:nowrap;">
                    <button class="icon-btn edit-dues-btn" data-id="${m.id}" aria-label="Manage Dues" title="Manage Dues & Payments"><i data-lucide="receipt"></i></button>
                    <button class="icon-btn edit-member-btn" data-id="${m.id}" aria-label="Edit"><i data-lucide="pencil"></i></button>
                    <button class="icon-btn delete-member-btn" data-id="${m.id}" aria-label="Delete"><i data-lucide="trash-2"></i></button>
                  </td>` : ""}
                </tr>`;
              }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Handle highlight from global search
  const highlightTarget = store.get("highlightTarget");
  if (highlightTarget && highlightTarget.type === "member" && highlightTarget.id) {
    const row = sectionEl.querySelector(`.member-row[data-id="${highlightTarget.id}"]`);
    if (row) {
      setTimeout(() => {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("row-highlight-flash");
        store.set("highlightTarget", null);
      }, 150);
    }
  }

  // Dues / payments modal button handlers (available to all or admin)
  sectionEl.querySelectorAll(".dues-btn, .edit-dues-btn").forEach((btn) => {
    btn.addEventListener("click", () => openMemberDuesModal(btn.dataset.id));
  });

  if (!isAdmin) return;

  document.getElementById("addMemberBtn")?.addEventListener("click", () => openMemberModal());
  sectionEl.querySelectorAll(".edit-member-btn").forEach((btn) =>
    btn.addEventListener("click", () => openMemberModal(btn.dataset.id))
  );
  sectionEl.querySelectorAll(".delete-member-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const confirmed = await confirmAction("Remove this member? They'll also be removed from any event payment lists.");
      if (confirmed) {
        deleteMember(btn.dataset.id);
        showToast("Member removed", "success");
      }
    })
  );
}

function openMemberDuesModal(memberId) {
  const data = getData();
  const member = data.members.find((m) => m.id === memberId);
  if (!member) return;

  const isAdmin = store.get("isAdmin");
  const overlay = document.querySelector(".member-dues-modal-overlay");
  if (!overlay) return;

  overlay.querySelector("#memberDuesTitle").textContent = `${member.name}'s Dues & Payments`;
  overlay.querySelector("#memberDuesSubtitle").textContent = `${member.course || "Member"} ${member.yearLevel ? "· " + member.yearLevel : ""} ${member.officerRole ? "· " + member.officerRole : ""}`;

  const listEl = overlay.querySelector("#memberDuesList");

  const isOfficer = !!(member.officerRole && member.officerRole.trim() !== "");

  // Collect relevant events/collections
  const relevantEvents = data.events.filter((e) => {
    if (e.category === "membership_fee") return !isOfficer;
    if (e.category === "officer_collection") return isOfficer;
    return e.participants?.some(p => p.memberId === memberId);
  });

  if (relevantEvents.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:32px 0; color:var(--color-text-secondary);">
        <i data-lucide="check-circle" style="width:36px; height:36px; margin-bottom:8px; color:var(--color-income);"></i>
        <p style="margin:0; font-weight:600;">No active dues or fees required for this member.</p>
      </div>
    `;
  } else {
    listEl.innerHTML = relevantEvents.map((event) => {
      const p = event.participants?.find((part) => part.memberId === memberId);
      const paidCentavos = p?.paidCentavos !== undefined ? p.paidCentavos : (p?.paid ? event.feeCentavos : 0);
      const remainingCentavos = Math.max(0, event.feeCentavos - paidCentavos);

      return `
        <div class="card" style="background:var(--color-surface); border:1px solid var(--color-border); padding:16px; border-radius:var(--radius-md);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px;">
            <div>
              <h4 style="margin:0 0 4px; font-size:15px; font-weight:700;">${event.title}</h4>
              <p style="margin:0; font-size:12.5px; color:var(--color-text-secondary);">
                Fee: <strong>${formatMoney(event.feeCentavos)}</strong> · Date: ${formatDate(event.date)}
              </p>
            </div>
            <span class="status-badge ${remainingCentavos === 0 ? "income" : paidCentavos > 0 ? "warning" : "expense"}" style="font-size:12px; padding:4px 10px;">
              ${remainingCentavos === 0 ? "Fully Paid" : paidCentavos > 0 ? `Partial (${formatMoney(paidCentavos)} paid)` : "Unpaid"}
            </span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--color-border); margin-bottom:12px; font-size:13px;">
            <div>
              <span style="color:var(--color-text-secondary);">Paid:</span> <strong style="color:var(--color-income);">${formatMoney(paidCentavos)}</strong>
            </div>
            <div>
              <span style="color:var(--color-text-secondary);">Remaining:</span> <strong style="${remainingCentavos > 0 ? "color:var(--color-expense);" : "color:var(--color-income);"}">${formatMoney(remainingCentavos)}</strong>
            </div>
          </div>

          ${isAdmin ? `
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:6px; flex:1; min-width:160px;">
                <span style="font-size:13px; font-weight:600; color:var(--color-text-secondary);">₱</span>
                <input type="number" step="1" min="0" max="${(event.feeCentavos / 100)}" class="form-control paid-amount-input" data-event-id="${event.id}" value="${(paidCentavos / 100)}" style="height:36px; font-size:13px;" />
              </div>
              <button class="btn btn-primary save-paid-btn" data-event-id="${event.id}" data-fee-centavos="${event.feeCentavos}" style="padding:6px 14px; font-size:12.5px;">
                Update Paid
              </button>
              ${remainingCentavos > 0 ? `
                <button class="btn btn-secondary settle-full-btn" data-event-id="${event.id}" data-fee-centavos="${event.feeCentavos}" style="padding:6px 14px; font-size:12.5px; color:var(--color-income); border-color:rgba(22, 163, 74, 0.3);">
                  Settle All (${formatMoney(remainingCentavos)})
                </button>
              ` : ""}
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
  }

  if (window.lucide) window.lucide.createIcons();

  openModal(overlay);

  // Wire buttons inside dues modal
  if (isAdmin) {
    overlay.querySelectorAll(".save-paid-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const eventId = btn.dataset.eventId;
        const input = overlay.querySelector(`.paid-amount-input[data-event-id="${eventId}"]`);
        const valPesos = parseFloat(input.value) || 0;
        const valCentavos = pesosToCentavos(valPesos);

        setParticipantPaidAmount(eventId, memberId, valCentavos);
        showToast(`Updated payment to ₱${valPesos.toFixed(2)}`, "success");
        openMemberDuesModal(memberId);
        renderMembers();
      });
    });

    overlay.querySelectorAll(".settle-full-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const eventId = btn.dataset.eventId;
        const fullCentavos = parseInt(btn.dataset.feeCentavos, 10);

        setParticipantPaidAmount(eventId, memberId, fullCentavos);
        showToast(`Settled in full (${formatMoney(fullCentavos)})`, "success");
        openMemberDuesModal(memberId);
        renderMembers();
      });
    });
  }
}

function openMemberModal(memberId = null) {
  editingMemberId = memberId;
  const data = getData();
  const member = memberId ? data.members.find((m) => m.id === memberId) : null;
  const overlay = document.querySelector(".member-modal-overlay");

  overlay.querySelector(".modal-title").textContent = member ? "Edit Member" : "Add Member";
  overlay.querySelector("#memberNameInput").value = member?.name || "";
  overlay.querySelector("#memberNicknameInput").value = member?.nickname || "";
  overlay.querySelector("#memberOfficerRoleInput").value = member?.officerRole || "";
  overlay.querySelector("#memberCourseInput").value = member?.course || "";
  overlay.querySelector("#memberYearInput").value = member?.yearLevel || "";
  overlay.querySelector("#memberContactInput").value = member?.contact || "";

  openModal(overlay);
}

export function initMemberModal() {
  const duesOverlay = document.querySelector(".member-dues-modal-overlay");
  duesOverlay?.querySelector(".modal-close-btn")?.addEventListener("click", () => closeModal(duesOverlay));
  duesOverlay?.addEventListener("click", (e) => { if (e.target === duesOverlay) closeModal(duesOverlay); });

  const overlay = document.querySelector(".member-modal-overlay");
  overlay?.querySelector(".modal-close-btn")?.addEventListener("click", () => closeModal(overlay));
  overlay?.addEventListener("click", (e) => { if (e.target === overlay) closeModal(overlay); });

  overlay?.querySelector("form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById("memberNameInput").value.trim(),
      nickname: document.getElementById("memberNicknameInput").value.trim(),
      officerRole: document.getElementById("memberOfficerRoleInput").value.trim(),
      course: document.getElementById("memberCourseInput").value.trim(),
      yearLevel: document.getElementById("memberYearInput").value.trim(),
      contact: document.getElementById("memberContactInput").value.trim(),
    };
    if (!payload.name) return;

    if (editingMemberId) {
      updateMember(editingMemberId, payload);
      showToast("Member updated", "success");
    } else {
      addMember(payload);
      showToast("Member added", "success");
    }
    closeModal(overlay);
  });
}