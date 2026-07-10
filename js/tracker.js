// js/tracker.js
import { store } from "./store.js";
import { getData, addTask, updateTask, deleteTask } from "./data.js";
import { openModal, closeModal, confirmAction, showToast } from "./ui.js";

let editingTaskId = null;

export function renderTracker() {
  const isAdmin = store.get("isAdmin");
  const sectionEl = document.querySelector('section[data-route="#/tracker"]');
  const data = getData();
  const tasks = data.tasks || [];

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

  // Inline CSS mappings for cards
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
    const borderCol = prio.color;

    return `
      <div class="card task-card" data-id="${t.id}" style="padding:var(--space-4); margin-bottom:var(--space-3); border-left:4px solid ${borderCol}; display:flex; flex-direction:column; gap:8px; background:var(--color-surface); box-shadow:var(--shadow-sm); border-radius:var(--radius-md); transition:transform 0.15s ease, box-shadow 0.15s ease;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <span class="status-badge" style="background:${cat.bg}; color:${cat.color}; font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 6px; border-radius:4px;">${t.category}</span>
          <span class="status-badge" style="background:${prio.bg}; color:${prio.color}; font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 6px; border-radius:4px;">${t.priority}</span>
        </div>
        
        <h4 style="margin:4px 0 2px; font-size:14.5px; font-weight:600; color:var(--color-text-primary); line-height:1.4;">${t.title}</h4>
        ${t.description ? `<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0; line-height:1.4; word-break:break-word; white-space:pre-wrap;">${t.description}</p>` : ""}
        
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px; padding-top:8px; border-top:1px dashed var(--color-border); font-size:11.5px; color:var(--color-text-secondary);">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <span style="display:inline-flex; align-items:center; gap:4px; font-weight:500;">
              <i data-lucide="calendar" style="width:12px; height:12px;"></i>
              ${t.startDate && t.endDate ? `${t.startDate} to ${t.endDate}` : (t.startDate ? `Starts: ${t.startDate}` : (t.endDate ? `Ends: ${t.endDate}` : (t.dueDate ? `Due: ${t.dueDate}` : "No dates set")))}
            </span>
          </div>
          
          ${isAdmin ? `
          <div style="display:flex; gap:6px;">
            <button class="icon-btn cycle-status-btn" data-id="${t.id}" title="Cycle status (To Do -> In Progress -> Completed)" aria-label="Cycle status" style="width:26px; height:26px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:var(--color-bg);">
              <i data-lucide="${t.status === "done" ? "rotate-ccw" : "arrow-right-circle"}" style="width:13px; height:13px;"></i>
            </button>
            <button class="icon-btn edit-task-btn" data-id="${t.id}" title="Edit Task" aria-label="Edit" style="width:26px; height:26px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:var(--color-bg);">
              <i data-lucide="pencil" style="width:13px; height:13px;"></i>
            </button>
            <button class="icon-btn delete-task-btn" data-id="${t.id}" title="Delete Task" aria-label="Delete" style="width:26px; height:26px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:var(--color-bg);">
              <i data-lucide="trash-2" style="width:13px; height:13px;"></i>
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
            <div style="text-align:center; padding:32px 16px; color:var(--color-text-tertiary); font-size:13px;">
              No tasks to do
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
            <div style="text-align:center; padding:32px 16px; color:var(--color-text-tertiary); font-size:13px;">
              No active tasks
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
            <div style="text-align:center; padding:32px 16px; color:var(--color-text-tertiary); font-size:13px;">
              No completed tasks
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

    if (editingTaskId) {
      updateTask(editingTaskId, { title, description, status, priority, category, startDate, endDate });
      showToast("Task updated", "success");
    } else {
      addTask({ title, description, status, priority, category, startDate, endDate });
      showToast("Task added", "success");
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
