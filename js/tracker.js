// js/tracker.js
import { store } from "./store.js";
import { getData, addTask, updateTask, deleteTask } from "./data.js";
import { openModal, closeModal, confirmAction, showToast } from "./ui.js";
import { sendTaskAssignmentEmail, sendTaskDeadlineEmail, sendTaskUpdatedEmail, isValidEmail } from "./notifications.js";
import { isConnected } from "./sheets-sync.js";
import { auth } from "./firebase.js";

let editingTaskId = null;

// Helper to calculate relative date statuses cleanly (no emoji)
function getFriendlyDateStatus(startDateStr, endDateStr, status) {
  if (!startDateStr && !endDateStr) return "No dates set";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const parseDate = (str) => {
    if (!str) return null;
    const d = new Date(str);
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  };

  const startD = parseDate(startDateStr);
  const endD = parseDate(endDateStr);

  const formatDate = (d) => {
    return `${months[d.getMonth()]} ${d.getDate()}`;
  };

  if (status === "done") {
    if (endD) return `Completed on ${formatDate(endD)}`;
    if (startD) return `Completed on ${formatDate(startD)}`;
    return "Completed";
  }

  const diffDays = (d1, d2) => {
    return Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (startD && endD) {
    const daysToStart = diffDays(startD, today);
    const daysToEnd = diffDays(endD, today);

    if (daysToStart > 0) {
      if (daysToStart === 1) return `${formatDate(startD)} • Starts Tomorrow`;
      return `${formatDate(startD)} • Starts in ${daysToStart} days`;
    }

    if (daysToEnd >= 0) {
      if (daysToEnd === 0) return `${formatDate(endD)} • Due Today`;
      if (daysToEnd === 1) return `${formatDate(endD)} • 1 day left`;
      return `${formatDate(endD)} • ${daysToEnd} days left`;
    }

    return `${formatDate(endD)} • Overdue by ${Math.abs(daysToEnd)} days`;
  }

  if (startD) {
    const daysToStart = diffDays(startD, today);
    if (daysToStart === 0) return `${formatDate(startD)} • Starts Today`;
    if (daysToStart === 1) return `${formatDate(startD)} • Starts Tomorrow`;
    if (daysToStart > 1) return `${formatDate(startD)} • Starts in ${daysToStart} days`;
    return `${formatDate(startD)}`;
  }

  if (endD) {
    const daysToEnd = diffDays(endD, today);
    if (daysToEnd === 0) return `${formatDate(endD)} • Due Today`;
    if (daysToEnd === 1) return `${formatDate(endD)} • 1 day left`;
    if (daysToEnd > 1) return `${formatDate(endD)} • ${daysToEnd} days left`;
    return `${formatDate(endD)} • Overdue by ${Math.abs(daysToEnd)} days`;
  }

  return "No dates set";
}

function getInitials(name) {
  if (!name) return "??";
  const parts = name.trim().split(/[\s,]+/);
  const filtered = parts.filter(p => p.length > 0 && !p.includes("."));
  if (filtered.length >= 2) {
    return (filtered[0][0] + filtered[1][0]).toUpperCase();
  } else if (filtered.length === 1) {
    return filtered[0].substring(0, 2).toUpperCase();
  }
  return "??";
}

export function renderTracker() {
  const isAdmin = store.get("isAdmin");
  const sectionEl = document.querySelector('section[data-route="#/tracker"]');
  const data = getData();
  const tasks = data.tasks || [];
  const members = data.members || [];

  const currentUserEmail = auth.currentUser?.email?.toLowerCase().trim();

  // Local filter states
  const searchQuery = (sectionEl.querySelector("#taskSearchInput")?.value || "").toLowerCase().trim();
  const filterCategory = sectionEl.querySelector("#taskCategoryFilter")?.value || "all";
  const filterPriority = sectionEl.querySelector("#taskPriorityFilter")?.value || "all";

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    const matchesSearch = !searchQuery || 
      (t.title || "").toLowerCase().includes(searchQuery) || 
      (t.description || "").toLowerCase().includes(searchQuery);
    
    const matchesCategory = filterCategory === "all" || t.category === filterCategory;
    const matchesPriority = filterPriority === "all" || t.priority === filterPriority;

    return matchesSearch && matchesCategory && matchesPriority;
  });

  // Group tasks by status
  const todoTasks = filteredTasks.filter((t) => t.status === "todo");
  const inProgressTasks = filteredTasks.filter((t) => t.status === "in_progress");
  const doneTasks = filteredTasks.filter((t) => t.status === "done");

  // Style configurations for badges (no emoji)
  const getPriorityStyles = (priority) => {
    switch (priority) {
      case "high":
        return { color: "var(--color-expense)", bg: "rgba(220, 38, 38, 0.08)" };
      case "low":
        return { color: "var(--color-income)", bg: "rgba(22, 163, 74, 0.08)" };
      case "medium":
      default:
        return { color: "var(--color-accent)", bg: "rgba(234, 88, 12, 0.08)" };
    }
  };

  const getCategoryStyles = (category) => {
    switch (category) {
      case "treasury":
        return { color: "var(--color-info)", bg: "rgba(37, 99, 235, 0.08)" };
      case "event":
        return { color: "#7c3aed", bg: "rgba(124, 58, 237, 0.08)" };
      case "member":
        return { color: "var(--color-income)", bg: "rgba(22, 163, 74, 0.08)" };
      case "general":
      default:
        return { color: "var(--color-text-secondary)", bg: "var(--color-border)" };
    }
  };

  const renderTaskCard = (t) => {
    const prio = getPriorityStyles(t.priority);
    const cat = getCategoryStyles(t.category);
    
    // Assignees mapping
    const assigneeIds = t.assigneeIds || (t.assigneeId ? [t.assigneeId] : []);
    const assignedMembers = assigneeIds.map(id => members.find(m => m.id === id)).filter(Boolean);

    // Current user mapping
    const myMember = members.find(m => m.contact && m.contact.toLowerCase().trim() === currentUserEmail);
    const isAssignedToMe = myMember && assigneeIds.includes(myMember.id);

    // Determine ownership classification
    let ownership = { label: "General Task", color: "#9ca3af" }; // Default gray
    if (isAssignedToMe) {
      ownership = { label: "Assigned to Me", color: "#10b981" }; // Emerald Green
    } else if (assigneeIds.length >= 2) {
      ownership = { label: "Shared Task", color: "#3b82f6" }; // Royal Blue
    } else if (assigneeIds.length === 1) {
      const singleAssignee = assignedMembers[0];
      const isOfficer = singleAssignee && singleAssignee.officerRole && singleAssignee.officerRole.trim() !== "";
      if (isOfficer || t.category === "treasury" || t.category === "event" || t.category === "member") {
        ownership = { label: "Team Task", color: "#8b5cf6" }; // Vibrant Purple
      }
    }

    // Sort assignees: "You" always displayed first
    if (myMember) {
      assignedMembers.sort((a, b) => {
        if (a.id === myMember.id) return -1;
        if (b.id === myMember.id) return 1;
        return 0;
      });
    }

    // Avatar stack generation
    const maxAvatars = 3;
    const showCount = Math.min(assignedMembers.length, maxAvatars);
    const remainingCount = assignedMembers.length - showCount;

    const getAvatarBg = (name) => {
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      const colors = [
        "#4f46e5", "#0284c7", "#0891b2", "#0d9488", 
        "#059669", "#16a34a", "#ea580c", "#dc2626", 
        "#db2777", "#9333ea"
      ];
      return colors[Math.abs(hash) % colors.length];
    };

    let avatarsHtml = '<div class="avatar-stack">';
    for (let i = 0; i < showCount; i++) {
      const m = assignedMembers[i];
      const initials = getInitials(m.name);
      const bg = getAvatarBg(m.name);
      const isMe = myMember && m.id === myMember.id;
      const borderStyle = isMe ? "border: 2px solid var(--color-income); box-shadow: 0 0 4px var(--color-income);" : "";
      const tooltipText = isMe ? "You" : m.name;
      avatarsHtml += `
        <div class="avatar-stack-item" style="background-color: ${bg}; ${borderStyle}" title="${tooltipText}">
          ${isMe ? "You" : initials}
        </div>
      `;
    }
    if (remainingCount > 0) {
      avatarsHtml += `
        <div class="avatar-stack-item" style="background-color: var(--color-text-tertiary); font-size: 9px;" title="${remainingCount} more member(s)">
          +${remainingCount}
        </div>
      `;
    }
    avatarsHtml += '</div>';

    return `
      <div class="task-card-new" data-id="${t.id}" style="padding:var(--space-4); margin-bottom:var(--space-3); border-left:4px solid ${ownership.color}; display:flex; flex-direction:column; gap:12px;">
        <!-- Card Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div style="display:flex; gap:6px; align-items:center;">
            <span class="status-badge" style="background:${cat.bg}; color:${cat.color}; font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 6px; border-radius:4px;">${t.category}</span>
            <span class="status-badge" style="background:${prio.bg}; color:${prio.color}; font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 6px; border-radius:4px;">${t.priority}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px; font-size:11px; font-weight:600; color:var(--color-text-secondary);">
            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background-color:${ownership.color};"></span>
            <span>${ownership.label}</span>
          </div>
        </div>
        
        <!-- Content Section -->
        <div>
          <h4 style="margin:0 0 6px 0; font-size:14.5px; font-weight:600; color:var(--color-text-primary); line-height:1.4;">${t.title}</h4>
          ${t.description ? `<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0; line-height:1.4; word-break:break-word; white-space:pre-wrap;">${t.description}</p>` : ""}
        </div>
        
        <!-- Divider -->
        <div style="border-top:1px solid var(--color-border); margin-top:4px;"></div>

        <!-- Card Footer -->
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div style="display:flex; flex-direction:column; gap:6px;">
            <span style="display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:var(--color-text-secondary); font-weight:500;">
              <i data-lucide="calendar" style="width:13px; height:13px; opacity:0.8;"></i>
              <span>${getFriendlyDateStatus(t.startDate, t.endDate, t.status)}</span>
            </span>
            
            ${assignedMembers.length > 0 ? `
            <div style="display:flex; align-items:center; gap:8px;">
              ${avatarsHtml}
              <span style="font-size:11.5px; color:var(--color-text-secondary); font-weight:500;">
                ${assignedMembers.length === 1 
                  ? (myMember && assignedMembers[0].id === myMember.id ? "Assigned: You" : `Assigned: ${assignedMembers[0].name}`) 
                  : `Assigned: ${assignedMembers.length} members`
                }
              </span>
            </div>
            ` : `
            <span style="display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:var(--color-text-tertiary); font-weight:500;">
              <i data-lucide="user-minus" style="width:13px; height:13px; opacity:0.6;"></i>
              <span>Unassigned</span>
            </span>
            `}
          </div>
          
          ${isAdmin ? `
          <div style="display:flex; align-items:center; gap:4px; background:var(--color-bg); padding:4px; border-radius:8px; border:1px solid var(--color-border); width:fit-content; margin-top:2px;">
            ${assignedMembers.some(m => isValidEmail(m.contact)) ? `
            <button class="card-action-btn notify email-reminder-btn" data-id="${t.id}" title="Send Deadline Reminder Email" aria-label="Notify">
              <i data-lucide="mail" style="width:14px; height:14px;"></i>
            </button>
            ` : ""}
            <button class="card-action-btn cycle-status-btn" data-id="${t.id}" title="Move status (To Do -> In Progress -> Completed)" aria-label="Move">
              <i data-lucide="${t.status === "done" ? "rotate-ccw" : "arrow-right-circle"}" style="width:14px; height:14px;"></i>
            </button>
            <button class="card-action-btn edit-task-btn" data-id="${t.id}" title="Edit Task" aria-label="Edit">
              <i data-lucide="pencil" style="width:14px; height:14px;"></i>
            </button>
            <button class="card-action-btn delete delete-task-btn" data-id="${t.id}" title="Delete Task" aria-label="Delete">
              <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
            </button>
          </div>
          ` : ""}
        </div>
      </div>
    `;
  };

  sectionEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:16px;">
      <div>
        <h2 style="margin:0 0 4px;">Task Tracker</h2>
        <p style="color:var(--color-text-secondary); margin:0; font-size:14px;">
          ${isAdmin ? "Manage team tasks, assignments, and treasury todo lists." : "View tasks and assignments. Sign in as admin to manage tasks."}
        </p>
      </div>
      ${isAdmin ? `
      <div style="display:flex; gap:12px;">
        <button class="btn btn-primary" id="addTaskBtn">
          <i data-lucide="plus-circle" style="width:16px; height:16px; vertical-align:-3px; margin-right:6px;"></i>Add Task
        </button>
      </div>
      ` : ""}
    </div>

    <!-- Filter & Search Panel -->
    <div class="card" style="padding:16px; margin-bottom:24px;">
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; align-items:center;">
        <div style="position:relative;">
          <i data-lucide="search" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); width:14px; height:14px; color:var(--color-text-tertiary);"></i>
          <input type="text" id="taskSearchInput" class="form-control" placeholder="Search tasks..." value="${searchQuery || ""}" style="padding-left:36px; height:38px; margin:0;" />
        </div>
        
        <div>
          <select id="taskCategoryFilter" class="form-control" style="height:38px; margin:0;">
            <option value="all" ${filterCategory === "all" ? "selected" : ""}>All Categories</option>
            <option value="general" ${filterCategory === "general" ? "selected" : ""}>General</option>
            <option value="treasury" ${filterCategory === "treasury" ? "selected" : ""}>Treasury</option>
            <option value="event" ${filterCategory === "event" ? "selected" : ""}>Events</option>
            <option value="member" ${filterCategory === "member" ? "selected" : ""}>Members</option>
          </select>
        </div>

        <div>
          <select id="taskPriorityFilter" class="form-control" style="height:38px; margin:0;">
            <option value="all" ${filterPriority === "all" ? "selected" : ""}>All Priorities</option>
            <option value="high" ${filterPriority === "high" ? "selected" : ""}>High Priority</option>
            <option value="medium" ${filterPriority === "medium" ? "selected" : ""}>Medium Priority</option>
            <option value="low" ${filterPriority === "low" ? "selected" : ""}>Low Priority</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Kanban Board Grid -->
    <div class="kanban-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; align-items:start;">
      
      <!-- TO DO COLUMN -->
      <div class="kanban-column" style="background:rgba(0,0,0,0.02); border:1px dashed var(--color-border); border-radius:var(--radius-lg); padding:16px; min-height:450px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:8px; border-bottom:2px solid var(--color-text-tertiary);">
          <h3 style="margin:0; font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:8px;">
            <span style="width:8px; height:8px; background:var(--color-text-tertiary); border-radius:50%;"></span>
            To Do
          </h3>
          <span style="font-size:12px; font-weight:600; background:var(--color-border); color:var(--color-text-secondary); padding:2px 8px; border-radius:20px;">${todoTasks.length}</span>
        </div>
        <div class="column-cards">
          ${todoTasks.length === 0 ? `
            <div style="text-align:center; padding:40px 16px; color:var(--color-text-secondary); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px;">
              <div style="width:48px; height:48px; border-radius:50%; background:var(--color-bg); border:1px dashed var(--color-border); display:flex; align-items:center; justify-content:center; color:var(--color-text-tertiary);">
                <i data-lucide="check-square" style="width:20px; height:20px;"></i>
              </div>
              <div>
                <h5 style="margin:0 0 4px 0; font-size:14px; font-weight:600; color:var(--color-text-primary);">All caught up</h5>
                <p style="margin:0; font-size:12px; color:var(--color-text-secondary); max-width:180px; margin:0 auto; line-height:1.4;">No tasks currently pending in the backlog.</p>
              </div>
            </div>
          ` : todoTasks.map(renderTaskCard).join("")}
        </div>
      </div>

      <!-- IN PROGRESS COLUMN -->
      <div class="kanban-column" style="background:rgba(0,0,0,0.02); border:1px dashed var(--color-border); border-radius:var(--radius-lg); padding:16px; min-height:450px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:8px; border-bottom:2px solid var(--color-accent);">
          <h3 style="margin:0; font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:8px; color:var(--color-accent);">
            <span style="width:8px; height:8px; background:var(--color-accent); border-radius:50%;"></span>
            In Progress
          </h3>
          <span style="font-size:12px; font-weight:600; background:var(--color-accent-soft); color:var(--color-accent); padding:2px 8px; border-radius:20px;">${inProgressTasks.length}</span>
        </div>
        <div class="column-cards">
          ${inProgressTasks.length === 0 ? `
            <div style="text-align:center; padding:40px 16px; color:var(--color-text-secondary); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px;">
              <div style="width:48px; height:48px; border-radius:50%; background:var(--color-bg); border:1px dashed var(--color-border); display:flex; align-items:center; justify-content:center; color:var(--color-text-tertiary);">
                <i data-lucide="play" style="width:20px; height:20px;"></i>
              </div>
              <div>
                <h5 style="margin:0 0 4px 0; font-size:14px; font-weight:600; color:var(--color-text-primary);">No active work</h5>
                <p style="margin:0; font-size:12px; color:var(--color-text-secondary); max-width:180px; margin:0 auto; line-height:1.4;">Drag or move tasks here to start working on them.</p>
              </div>
            </div>
          ` : inProgressTasks.map(renderTaskCard).join("")}
        </div>
      </div>

      <!-- COMPLETED COLUMN -->
      <div class="kanban-column" style="background:rgba(0,0,0,0.02); border:1px dashed var(--color-border); border-radius:var(--radius-lg); padding:16px; min-height:450px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:8px; border-bottom:2px solid var(--color-income);">
          <h3 style="margin:0; font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:8px; color:var(--color-income);">
            <span style="width:8px; height:8px; background:var(--color-income); border-radius:50%;"></span>
            Completed
          </h3>
          <span style="font-size:12px; font-weight:600; background:rgba(22,163,116,0.1); color:var(--color-income); padding:2px 8px; border-radius:20px;">${doneTasks.length}</span>
        </div>
        <div class="column-cards">
          ${doneTasks.length === 0 ? `
            <div style="text-align:center; padding:40px 16px; color:var(--color-text-secondary); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px;">
              <div style="width:48px; height:48px; border-radius:50%; background:var(--color-bg); border:1px dashed var(--color-border); display:flex; align-items:center; justify-content:center; color:var(--color-text-tertiary);">
                <i data-lucide="sparkles" style="width:20px; height:20px;"></i>
              </div>
              <div>
                <h5 style="margin:0 0 4px 0; font-size:14px; font-weight:600; color:var(--color-text-primary);">Clean slate</h5>
                <p style="margin:0; font-size:12px; color:var(--color-text-secondary); max-width:180px; margin:0 auto; line-height:1.4;">No completed task yet</p>
              </div>
            </div>
          ` : doneTasks.map(renderTaskCard).join("")}
        </div>
      </div>

    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Wire up filter event listeners
  const searchInput = sectionEl.querySelector("#taskSearchInput");
  const categoryFilter = sectionEl.querySelector("#taskCategoryFilter");
  const priorityFilter = sectionEl.querySelector("#taskPriorityFilter");

  const triggerReRender = () => {
    renderTracker();
  };

  searchInput?.addEventListener("input", triggerReRender);
  categoryFilter?.addEventListener("change", triggerReRender);
  priorityFilter?.addEventListener("change", triggerReRender);

  if (!isAdmin) return;

  // Wire up admin action buttons
  sectionEl.querySelector("#addTaskBtn")?.addEventListener("click", () => openTaskModal());

  sectionEl.querySelectorAll(".edit-task-btn").forEach((btn) => {
    btn.addEventListener("click", () => openTaskModal(btn.dataset.id));
  });

  sectionEl.querySelectorAll(".delete-task-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const confirmed = await confirmAction("Are you sure you want to delete this task?");
      if (confirmed) {
        deleteTask(btn.dataset.id);
        showToast("Task deleted", "success");
      }
    });
  });

  sectionEl.querySelectorAll(".cycle-status-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const task = tasks.find((t) => t.id === id);
      if (!task) return;

      let nextStatus = "todo";
      if (task.status === "todo") nextStatus = "in_progress";
      else if (task.status === "in_progress") nextStatus = "done";

      updateTask(id, { status: nextStatus });
      showToast(`Task moved to ${nextStatus.replace("_", " ")}`, "success");
    });
  });

  sectionEl.querySelectorAll(".email-reminder-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      
      const taskAssigneeIds = task.assigneeIds || (task.assigneeId ? [task.assigneeId] : []);
      const assignedMembers = taskAssigneeIds.map(mid => members.find((m) => m.id === mid)).filter(Boolean);
      const emailableMembers = assignedMembers.filter(m => isValidEmail(m.contact));

      if (emailableMembers.length === 0) {
        showToast("No assignee with a valid email on this task", "error");
        return;
      }
      
      const namesList = emailableMembers.map(m => m.name).join(", ");
      const confirmed = await confirmAction(`Send a deadline reminder email to: ${namesList}?`);
      if (!confirmed) return;

      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" class="spin" style="width:13px; height:13px;"></i>`;
      if (window.lucide) window.lucide.createIcons();

      try {
        for (const member of emailableMembers) {
          await sendTaskDeadlineEmail(task, member);
        }
        showToast(`Deadline reminder email sent to ${namesList}!`, "success");
      } catch (err) {
        console.error("Failed to send deadline reminder:", err);
        showToast(`Failed to send email: ${err.message}`, "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        if (window.lucide) window.lucide.createIcons();
      }
    });
  });
}

export function initTaskModal() {
  const overlay = document.querySelector(".task-modal-overlay");
  const form = document.getElementById("taskForm");
  if (!overlay || !form) return;

  // Close triggers
  overlay.querySelector(".modal-close-btn")?.addEventListener("click", () => closeModal(overlay));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(overlay); });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const title = document.getElementById("taskTitleInput").value;
    const description = document.getElementById("taskDescriptionInput").value;
    const status = document.getElementById("taskStatusSelect").value;
    const priority = document.getElementById("taskPrioritySelect").value;
    const category = document.getElementById("taskCategorySelect").value;
    const startDate = document.getElementById("taskStartDateInput") ? document.getElementById("taskStartDateInput").value : "";
    const endDate = document.getElementById("taskEndDateInput") ? document.getElementById("taskEndDateInput").value : "";
    
    // Find all checked assignees in checkbox container
    const assigneeIds = [];
    overlay.querySelectorAll('input[name="taskAssignees"]:checked').forEach((cb) => {
      assigneeIds.push(cb.value);
    });

    // Save assigneeId as the first element for backward-compatibility
    const firstAssigneeId = assigneeIds[0] || "";

    if (editingTaskId) {
      const oldTask = (getData().tasks || []).find(t => t.id === editingTaskId);
      const oldAssigneeIds = oldTask ? (oldTask.assigneeIds || (oldTask.assigneeId ? [oldTask.assigneeId] : [])) : [];

      updateTask(editingTaskId, { title, description, status, priority, category, startDate, endDate, assigneeId: firstAssigneeId, assigneeIds });
      showToast("Task updated", "success");

      // Notify assignees on edit
      if (assigneeIds.length > 0) {
        const members = getData().members || [];
        if (isConnected()) {
          assigneeIds.forEach((id) => {
            const member = members.find(m => m.id === id);
            if (member && isValidEmail(member.contact)) {
              const wasAlreadyAssigned = oldAssigneeIds.includes(id);
              if (!wasAlreadyAssigned) {
                showToast(`Sending assignment email to ${member.name}...`, "info");
                sendTaskAssignmentEmail({ title, description, status, priority, category, startDate, endDate }, member)
                  .then(() => showToast(`Assignment email sent to ${member.name}!`, "success"))
                  .catch(err => console.error(err));
              } else {
                showToast(`Sending update email to ${member.name}...`, "info");
                sendTaskUpdatedEmail({ title, description, status, priority, category, startDate, endDate }, member)
                  .then(() => showToast(`Update email sent to ${member.name}!`, "success"))
                  .catch(err => console.error(err));
              }
            }
          });
        } else {
          showToast("Connect Google Workspace in Settings to send task emails", "warning");
        }
      }
    } else {
      const task = addTask({ title, description, status, priority, category, startDate, endDate, assigneeId: firstAssigneeId, assigneeIds });
      showToast("Task added", "success");

      if (assigneeIds.length > 0) {
        const members = getData().members || [];
        if (isConnected()) {
          assigneeIds.forEach((id) => {
            const member = members.find(m => m.id === id);
            if (member && isValidEmail(member.contact)) {
              showToast(`Sending notification to ${member.name}...`, "info");
              sendTaskAssignmentEmail(task, member)
                .then(() => showToast(`Notification sent to ${member.name}!`, "success"))
                .catch(err => {
                  console.error(err);
                  showToast(`Failed to send email: ${err.message}`, "error");
                });
            }
          });
        } else {
          showToast("Connect Google Workspace in Settings to send task emails", "warning");
        }
      }
    }

    closeModal(overlay);
  });
}

function openTaskModal(taskId = null) {
  editingTaskId = taskId;
  const data = getData();
  const task = taskId ? (data.tasks || []).find((t) => t.id === taskId) : null;
  const overlay = document.querySelector(".task-modal-overlay");
  if (!overlay) return;

  const titleEl = document.getElementById("taskModalTitle");
  const titleInput = document.getElementById("taskTitleInput");
  const descInput = document.getElementById("taskDescriptionInput");
  const statusSelect = document.getElementById("taskStatusSelect");
  const prioritySelect = document.getElementById("taskPrioritySelect");
  const categorySelect = document.getElementById("taskCategorySelect");
  const startDateInput = document.getElementById("taskStartDateInput");
  const endDateInput = document.getElementById("taskEndDateInput");
  
  // Dynamically populate assignee checkboxes
  const assigneeContainer = document.getElementById("taskAssigneeContainer");
  if (assigneeContainer) {
    const members = data.members || [];
    if (members.length === 0) {
      assigneeContainer.innerHTML = '<span style="font-size: 12px; color: var(--color-text-tertiary);">No members found. Add members in directory first.</span>';
    } else {
      assigneeContainer.innerHTML = '';
      members.forEach((m) => {
        // Checked if current task contains this member's ID in its assigneeIds array or assigneeId field
        const isChecked = task && (task.assigneeIds ? task.assigneeIds.includes(m.id) : task.assigneeId === m.id);
        const label = document.createElement("label");
        label.style.cssText = "display: flex; align-items: center; gap: 8px; font-weight: 500; font-size: 13px; margin: 0; cursor: pointer; color: var(--color-text-primary);";
        label.innerHTML = `
          <input type="checkbox" name="taskAssignees" value="${m.id}" ${isChecked ? "checked" : ""} style="cursor: pointer; width: 14px; height: 14px; accent-color: var(--color-accent);" />
          <span>${m.name} ${m.officerRole ? `<span style="font-size: 11px; color: var(--color-text-secondary); font-weight:normal;">(${m.officerRole})</span>` : ""}</span>
        `;
        assigneeContainer.appendChild(label);
      });
    }
  }

  if (task) {
    titleEl.textContent = "Edit Task";
    titleInput.value = task.title || "";
    descInput.value = task.description || "";
    statusSelect.value = task.status || "todo";
    prioritySelect.value = task.priority || "medium";
    categorySelect.value = task.category || "general";
    if (startDateInput) startDateInput.value = task.startDate || task.dueDate || "";
    if (endDateInput) endDateInput.value = task.endDate || "";
  } else {
    titleEl.textContent = "Add Task";
    titleInput.value = "";
    descInput.value = "";
    statusSelect.value = "todo";
    prioritySelect.value = "medium";
    categorySelect.value = "general";
    if (startDateInput) startDateInput.value = "";
    if (endDateInput) endDateInput.value = "";
  }

  openModal(overlay);
}
