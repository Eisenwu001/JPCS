// js/members.js
import { store } from "./store.js";
import { getData, addMember, updateMember, deleteMember, getMemberOutstandingCentavos } from "./data.js";
import { formatMoney } from "./utils.js";
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
                    ${outstanding > 0 ? formatMoney(outstanding) : "Paid up"}
                  </td>
                  ${isAdmin ? `
                  <td style="white-space:nowrap;">
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