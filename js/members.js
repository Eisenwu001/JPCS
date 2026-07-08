// js/members.js
import { store } from "./store.js";
import { getData, addMember, updateMember, deleteMember, getMemberOutstandingCentavos } from "./data.js";
import { formatMoney } from "./utils.js";
import { openModal, closeModal, confirmAction, showToast } from "./ui.js";

let editingMemberId = null;

export function renderMembers() {
  const isAdmin = store.get("isAdmin");
  const sectionEl = document.querySelector('section[data-route="#/members"]');
  const data = getData();

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
            ${data.members.length === 0 ? `
              <tr><td colspan="${isAdmin ? 7 : 6}">
                <div class="empty-state"><i data-lucide="users"></i><p>No members yet${isAdmin ? ". Add your first one." : "."}</p></div>
              </td></tr>` : data.members.map((m) => {
                const outstanding = getMemberOutstandingCentavos(m.id);
                return `
                <tr class="member-row" data-id="${m.id}">
                  <td>${m.name}${m.nickname ? ` <span style="color:var(--color-text-secondary); font-weight:400;">(${m.nickname})</span>` : ""}</td>
                  <td>${m.officerRole ? `<span class="status-badge income">${m.officerRole}</span>` : `<span style="color:var(--color-text-secondary);">Member</span>`}</td>
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