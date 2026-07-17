// js/calendar.js
import { store } from "./store.js";
import { getData, addAcademicSchedule, updateAcademicSchedule, deleteAcademicSchedule } from "./data.js";
import { openTaskModal } from "./tracker.js";
import { confirmAction, showToast } from "./ui.js";

// Calendar View State
let currentYear = 2026; // Default to 2026 to showcase the pre-populated academic year perfectly
let currentMonth = 6;   // Default to July 2026
let selectedDateStr = "2026-07-20"; // Start with a selected date that has an active async day for illustration
let currentView = "academic-year"; // "month" or "academic-year" as default to match video wow-factor
let editingScheduleId = null; // Tracks which milestone we are currently editing
let isFormExpanded = false; // Tracks if the Add Milestone form is open/expanded

// Filter States (Inspired by the video)
let filterSemester = "first_sem"; // "all", "first_sem", "second_sem", "summer"
let filterCollege = "all";        // "all", "CAS", "CBA", "CCIT", "COE", "CDENT", "CEDUC"
let filterAsyncMode = "show_all";  // "show_all", "hide_all", "green", "blue"

// Advanced Category Filter States (matching the high-fidelity UI layout)
let admissionFilterMode = "start";   // "start", "whole", "hide"
let registrationFilterMode = "start"; // "start", "whole", "hide"
let showClasses = true;
let showGrades = true;
let showHolidays = true;
let showPrelimExams = true;
let showMidtermExams = true;
let showFinalExams = true;
let showAsyncMode = true;

// College Options
const collegeOptions = [
  { value: "all", label: "All Colleges" },
  { value: "CAS", label: "CAS (Arts & Sciences)" },
  { value: "CBA", label: "CBA (Business Administration)" },
  { value: "CCIT", label: "CCIT (Computer Studies)" },
  { value: "COE", label: "COE (Engineering)" },
  { value: "CDENT", label: "CDENT (Dentistry)" },
  { value: "CEDUC", label: "CEDUC (Education)" },
  { value: "CLAW", label: "CLAW (Law)" }
];

export function renderCalendar() {
  const sectionEl = document.querySelector('section[data-route="#/calendar"]');
  if (!sectionEl) return;

  // Dismiss any existing custom tooltip when re-rendering
  const existingTooltip = document.getElementById("calendar-custom-tooltip");
  if (existingTooltip) {
    existingTooltip.style.display = "none";
    existingTooltip.style.opacity = "0";
  }

  const data = getData();
  const tasks = data.tasks || [];
  const events = data.events || [];
  const schedules = data.academicSchedules || [];
  const isAdmin = store.get("isAdmin");

  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    currentView = "month";
  }

  // Format month names
  const monthsList = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Compile Agenda for Selected Date
  const selectedDayTasks = tasks.filter(t => {
    if (!t.startDate && !t.endDate) return false;
    const start = t.startDate || t.endDate;
    const end = t.endDate || t.startDate;
    return selectedDateStr >= start && selectedDateStr <= end;
  });

  const selectedDayEvents = events.filter(e => e.date === selectedDateStr);

  const selectedDaySchedules = schedules.filter(s => {
    const isWithinRange = selectedDateStr >= s.startDate && selectedDateStr <= s.endDate;
    if (!isWithinRange) return false;

    // Advanced category visibility filters
    if (s.category === "admission") {
      if (admissionFilterMode === "hide") return false;
      if (admissionFilterMode === "start") return selectedDateStr === s.startDate;
      return true;
    }
    if (s.category === "registration") {
      if (registrationFilterMode === "hide") return false;
      if (registrationFilterMode === "start") return selectedDateStr === s.startDate;
      return true;
    }
    if (s.category === "classes") return showClasses;
    if (s.category === "grades_submission") return showGrades;
    if (s.category === "holidays") return showHolidays;
    if (s.category === "async") return showAsyncMode;
    if (s.category === "exams") {
      if (s.subCategory === "prelim" && !showPrelimExams) return false;
      if (s.subCategory === "midterm" && !showMidtermExams) return false;
      if (s.subCategory === "final" && !showFinalExams) return false;
      return true;
    }
    return true;
  });

  const formattedSelectedDate = new Date(selectedDateStr).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // Check if selected date is an async day
  const activeAsyncSchedule = selectedDaySchedules.find(s => s.category === "async");

  // Render Agenda & Quick Editor Panel on the right
  let agendaHtml = `
    <!-- Selected Day Agenda Header -->
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--color-border); padding-bottom:12px; margin-bottom:16px;">
      <div>
        <h4 style="margin:0; font-size:14px; font-weight:700; color:var(--color-text-primary);">Selected Day Details</h4>
        <span style="font-size:12px; color:var(--color-text-secondary); font-weight:500;">${formattedSelectedDate}</span>
      </div>
    </div>

    <!-- Active Schedules & Milestones -->
    <div style="display:flex; flex-direction:column; gap:10px; max-height:260px; overflow-y:auto; padding-right:4px; margin-bottom:20px;">
  `;

  if (selectedDaySchedules.length === 0 && selectedDayEvents.length === 0 && selectedDayTasks.length === 0) {
    agendaHtml += `
      <div style="text-align:center; padding:24px 12px; color:var(--color-text-tertiary); display:flex; flex-direction:column; align-items:center; gap:8px;">
        <i data-lucide="info" style="width:20px; height:20px; opacity:0.5;"></i>
        <span style="font-size:12px; font-weight:500;">No schedule milestones today.</span>
      </div>
    `;
  } else {
    // 1. Render Academic Schedules
    selectedDaySchedules.forEach(s => {
      let catLabel = s.category.toUpperCase().replace("_", " ");
      let catColor = "#ea580c";
      let borderCol = "var(--color-accent)";
      let bgCol = "rgba(234, 88, 12, 0.03)";

      if (s.category === "async") {
        catColor = s.subCategory === "blue" ? "#3b82f6" : "#22c55e";
        borderCol = catColor;
        bgCol = s.subCategory === "blue" ? "rgba(59, 130, 246, 0.05)" : "rgba(34, 197, 94, 0.05)";
        catLabel = s.subCategory === "blue" ? "GE ASYNC CLASS" : "ASYNC CLASS";
      } else if (s.category === "admission") {
        catColor = "#f43f5e";
        borderCol = "#f43f5e";
        bgCol = "rgba(244, 63, 94, 0.05)";
      } else if (s.category === "registration") {
        catColor = "#3b82f6";
        borderCol = "#3b82f6";
        bgCol = "rgba(59, 130, 246, 0.05)";
      } else if (s.category === "classes") {
        catColor = "#0ea5e9";
        borderCol = "#0ea5e9";
        bgCol = "rgba(14, 165, 233, 0.05)";
      } else if (s.category === "grades_submission") {
        catColor = "#10b981";
        borderCol = "#10b981";
        bgCol = "rgba(16, 185, 129, 0.05)";
      } else if (s.category === "holidays") {
        catColor = "#ec4899";
        borderCol = "#ec4899";
        bgCol = "rgba(236, 72, 153, 0.05)";
      } else if (s.category === "exams") {
        catColor = "#a855f7";
        borderCol = "#a855f7";
        bgCol = "rgba(168, 85, 247, 0.05)";
        if (s.subCategory) catLabel = `${s.subCategory.toUpperCase()} EXAM`;
      }

      agendaHtml += `
        <div class="card" style="padding:10px; border-left:4px solid ${borderCol}; background:${bgCol}; margin:0; box-shadow:none; position:relative;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <span style="font-size:9.5px; font-weight:700; color:${catColor}; letter-spacing:0.06em;">
              ${catLabel} ${s.college !== "all" ? `• ${s.college}` : ""}
            </span>
            ${isAdmin ? `
            <div style="display:flex; align-items:center; gap:6px;">
              <button class="cal-edit-schedule-btn" data-id="${s.id}" title="Edit Milestone" style="background:none; border:none; color:var(--color-text-tertiary); cursor:pointer; padding:2px; display:flex; align-items:center; transition:color 0.15s ease;">
                <i data-lucide="edit-3" style="width:13px; height:13px;"></i>
              </button>
              <button class="cal-delete-schedule-btn" data-id="${s.id}" title="Delete Milestone" style="background:none; border:none; color:var(--color-text-tertiary); cursor:pointer; padding:2px; display:flex; align-items:center; transition:color 0.15s ease;">
                <i data-lucide="trash-2" style="width:13px; height:13px;"></i>
              </button>
            </div>
            ` : ""}
          </div>
          <h5 style="margin:4px 0 2px 0; font-size:13px; font-weight:600; color:var(--color-text-primary);">${s.title}</h5>
          ${s.description ? `<p style="margin:0; font-size:11.5px; color:var(--color-text-secondary); line-height:1.3;">${s.description}</p>` : ""}
          <div style="margin-top:4px; font-size:10px; color:var(--color-text-tertiary); display:flex; align-items:center; gap:4px;">
            <i data-lucide="calendar" style="width:10px; height:10px;"></i>
            <span>${s.startDate} ${s.endDate !== s.startDate ? `to ${s.endDate}` : ""}</span>
          </div>
        </div>
      `;
    });

    // 2. Render Team Events
    selectedDayEvents.forEach(e => {
      agendaHtml += `
        <div class="card" style="padding:10px; border-left:4px solid #7c3aed; background:rgba(124, 58, 237, 0.04); margin:0; box-shadow:none;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <span style="font-size:9.5px; font-weight:700; text-transform:uppercase; color:#7c3aed; letter-spacing:0.06em; display:flex; align-items:center; gap:3px;">
              <i data-lucide="users" style="width:10px; height:10px;"></i> Organization Event
            </span>
          </div>
          <h5 style="margin:4px 0 2px 0; font-size:13px; font-weight:600; color:var(--color-text-primary);">${e.title}</h5>
          ${e.description ? `<p style="margin:0; font-size:11.5px; color:var(--color-text-secondary); line-height:1.3;">${e.description}</p>` : ""}
          <div style="margin-top:4px; font-size:10px; font-weight:600; color:#7c3aed;">
            Fee: ${e.feeCentavos > 0 ? `₱${(e.feeCentavos / 100).toFixed(2)}` : "Free"}
          </div>
        </div>
      `;
    });

    // 3. Render Tasks
    selectedDayTasks.forEach(t => {
      const isHigh = t.priority === "high";
      const borderCol = isHigh ? "var(--color-expense)" : t.priority === "medium" ? "var(--color-accent)" : "var(--color-income)";
      const bgCol = isHigh ? "rgba(220, 38, 38, 0.03)" : t.priority === "medium" ? "rgba(234, 88, 12, 0.03)" : "rgba(22, 163, 74, 0.03)";
      agendaHtml += `
        <div class="card" style="padding:10px; border-left:4px solid ${borderCol}; background:${bgCol}; margin:0; box-shadow:none;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <span style="font-size:9.5px; font-weight:700; text-transform:uppercase; color:${borderCol}; letter-spacing:0.06em;">
              Task Tracker • ${t.priority}
            </span>
          </div>
          <h5 style="margin:4px 0 2px 0; font-size:13px; font-weight:600; color:var(--color-text-primary);">${t.title}</h5>
          ${t.description ? `<p style="margin:0; font-size:11.5px; color:var(--color-text-secondary); line-height:1.3; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${t.description}</p>` : ""}
        </div>
      `;
    });
  }

  agendaHtml += `</div>`;

  // Append clean premium CTA button to trigger modal
  if (isAdmin) {
    agendaHtml += `
      <hr style="border:0; border-top:1px dashed var(--color-border); margin:12px 0 8px 0;" />
      <button id="calOpenFormBtn" class="btn btn-sm btn-accent" style="width:100%; height:34px; font-size:12px; border-radius:6px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:none;">
        <i data-lucide="plus-circle" style="width:14px; height:14px;"></i>
        Add Academic Milestone
      </button>
    `;
  }


  // Render main layout
  const isFormOpen = isAdmin && (isFormExpanded || editingScheduleId !== null);
  sectionEl.innerHTML = `
    <style>
      .calendar-compact-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 4px;
      }
      .calendar-day-compact-cell {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        height: 48px;
        padding: 4px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        transition: all var(--transition-fast) ease;
        position: relative;
      }
      .calendar-day-compact-cell:hover {
        border-color: var(--color-accent);
        background: rgba(234, 88, 12, 0.04);
      }
      .calendar-day-compact-cell.other-month {
        opacity: 0.25;
      }
      .calendar-day-compact-cell.past-day {
        background: var(--color-bg) !important;
        opacity: 0.65;
      }
      .calendar-dots-indicator-row {
        display: flex;
        justify-content: center;
        gap: 2.5px;
        width: 100%;
        margin-top: auto;
        height: 5px;
      }
      .calendar-compact-dot {
        width: 4.5px;
        height: 4.5px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      
      /* Multi-Month Bento Layout */
      .academic-year-grid-container {
        display: grid;
        grid-template-columns: repeat(1, 1fr);
        gap: 16px;
      }
      @media (min-width: 640px) {
        .academic-year-grid-container {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (min-width: 1200px) {
        .academic-year-grid-container {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      /* High-fidelity custom capsule button & interactive legend styles */
      .capsule-btn {
        background: transparent;
        color: var(--color-text-secondary);
        border: none;
      }
      .capsule-btn:hover {
        color: var(--color-text-primary);
      }
      .capsule-btn.active {
        background: #1e1e24 !important;
        color: #ffffff !important;
      }
      [data-theme="dark"] .capsule-btn.active {
        background: rgba(255, 255, 255, 0.12) !important;
        color: #ffffff !important;
      }
      .legend-row-toggle {
        transition: all 0.15s ease;
      }
      .legend-row-toggle.inactive {
        opacity: 0.45;
      }
      .legend-row-toggle.inactive .pill-badge-all {
        background: rgba(0,0,0,0.05) !important;
        color: var(--color-text-tertiary) !important;
        border-color: transparent !important;
      }
      
      .academic-month-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: 12px;
      }

      .calendar-main-layout {
        display: grid;
        grid-template-columns: 1fr;
        gap: 20px;
        align-items: start;
      }
      @media (min-width: 1024px) {
        .calendar-main-layout {
          grid-template-columns: 1fr 340px;
        }
      }
      @media (max-width: 767px) {
        .cal-view-switcher {
          display: none !important;
        }
      }
    </style>

    <div class="calendar-main-layout">
      
      <!-- 1. LEFT SIDE: CENTRAL CALENDAR GRID -->
      <div style="display:flex; flex-direction:column; gap:16px;">
        
        <!-- Header & View Switcher -->
        <div class="card" style="padding: 16px 20px; box-shadow: none; border: 1px solid var(--color-border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h2 style="margin: 0; font-size: 18px; font-weight: 800; color: var(--color-text-primary); display: flex; align-items: center; gap: 8px;">
              <i data-lucide="calendar" style="width: 22px; height: 22px; color: var(--color-accent);"></i>
              Academic Calendar ${currentView === "academic-year" ? `(${currentYear})` : ""}
            </h2>
            <p style="color: var(--color-text-secondary); margin: 3px 0 0 0; font-size: 12.5px;">Click on any calendar day to place asynchronous highlights or manage active milestones.</p>
          </div>
          <div style="display: flex; gap: 4px; background: rgba(0,0,0,0.03); padding: 4px; border-radius: 8px; align-items: center;" class="theme-dark-bg-container cal-view-switcher">
            ${currentView === "academic-year" ? `
              <button class="btn btn-sm btn-secondary" id="calPrevYearBtn" style="height:30px; width:30px; padding:0; display:flex; align-items:center; justify-content:center; border-radius:6px; box-shadow:none; border:none; background:transparent;">
                <i data-lucide="chevron-left" style="width: 14px; height: 14px; color: var(--color-text-primary);"></i>
              </button>
              <span style="font-size: 12px; font-weight: 700; padding: 0 4px; color: var(--color-text-primary);">${currentYear}</span>
              <button class="btn btn-sm btn-secondary" id="calNextYearBtn" style="height:30px; width:30px; padding:0; display:flex; align-items:center; justify-content:center; border-radius:6px; box-shadow:none; border:none; background:transparent;">
                <i data-lucide="chevron-right" style="width: 14px; height: 14px; color: var(--color-text-primary);"></i>
              </button>
              <div style="width:1px; height:20px; background:var(--color-border); margin: 0 4px;"></div>
            ` : ""}
            <button class="btn btn-sm ${currentView === "academic-year" ? "btn-accent" : "btn-secondary"}" id="viewAcademicYearBtn" style="height:30px; font-size:11.5px; border-radius:6px; box-shadow:none;">
              12-Month Grid
            </button>
            <button class="btn btn-sm ${currentView === "month" ? "btn-accent" : "btn-secondary"}" id="viewSingleMonthBtn" style="height:30px; font-size:11.5px; border-radius:6px; box-shadow:none;">
              Single Month Focus
            </button>
          </div>
        </div>

        ${currentView === "month" ? renderSingleMonthComponent(monthsList, tasks, events, schedules) : renderAcademicYearGridComponent(monthsList, tasks, events, schedules)}

      </div>

      <!-- 2. RIGHT SIDE: STACKED SIDEBAR (Selected Day Agenda, Filters, Legends) -->
      <div style="display: flex; flex-direction: column; gap: 16px; position: sticky; top: calc(var(--topbar-height, 64px) + 20px); align-self: start; width: 100%;">
        
        <!-- AGENDA PANEL -->
        <div class="card" id="calendarDetailsPanel" style="padding: 20px; box-shadow: none; border: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 16px; width: 100%;">
          ${agendaHtml}
        </div>

        <!-- SIDEBAR FILTERS AND LEGENDS -->
        <div class="card" style="padding: 16px; box-shadow: none; border: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 16px;">
          <div>
            <h4 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 700; color: var(--color-text-secondary); letter-spacing: 0.04em; text-transform: uppercase;">Academic Semester</h4>
            <select id="filterSemesterSelect" style="width:100%; height:34px; font-size:12.5px; padding:0 8px; border-radius:6px; border:1px solid var(--color-border); background:var(--color-surface); color:var(--color-text-primary); font-weight:600;">
              <option value="all" ${filterSemester === "all" ? "selected" : ""}>All Semesters</option>
              <option value="first_sem" ${filterSemester === "first_sem" ? "selected" : ""}>First Semester</option>
              <option value="second_sem" ${filterSemester === "second_sem" ? "selected" : ""}>Second Semester</option>
              <option value="summer" ${filterSemester === "summer" ? "selected" : ""}>Summer Classes</option>
            </select>
          </div>

          <div>
            <h4 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 700; color: var(--color-text-secondary); letter-spacing: 0.04em; text-transform: uppercase;">CCS Asynchronous</h4>
            <select id="filterAsyncModeSelect" style="width:100%; height:34px; font-size:12.5px; padding:0 8px; border-radius:6px; border:1px solid var(--color-border); background:var(--color-surface); color:var(--color-text-primary); font-weight:600;">
              <option value="show_all" ${filterAsyncMode === "show_all" ? "selected" : ""}>Show All Async</option>
              <option value="hide_all" ${filterAsyncMode === "hide_all" ? "selected" : ""}>Hide All Async</option>
              <option value="green" ${filterAsyncMode === "green" ? "selected" : ""}>CCS Async</option>
              <option value="blue" ${filterAsyncMode === "blue" ? "selected" : ""}>GE Async</option>
            </select>
          </div>

          <div>
            <h4 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 700; color: var(--color-text-secondary); letter-spacing: 0.04em; text-transform: uppercase;">Legend & Categories</h4>
            
            <div style="display: flex; flex-direction: column; gap: 14px;">
              <!-- CCS Asynchronous Legend (clickable, green) -->
              <div class="legend-row-toggle ${showAsyncMode ? "active" : "inactive"}" data-toggle="async" style="padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: rgba(0,0,0,0.015); display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:#22c55e; flex-shrink:0;"></span>
                  <span style="font-size:12.5px; font-weight:700; color:var(--color-text-primary);">CCS Asynchronous</span>
                </div>
              </div>

              <!-- GE Asynchronous Legend (clickable, blue) -->
              <div class="legend-row-toggle ${showAsyncMode ? "active" : "inactive"}" data-toggle="async" style="padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: rgba(0,0,0,0.015); display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:#3b82f6; flex-shrink:0;"></span>
                  <span style="font-size:12.5px; font-weight:700; color:var(--color-text-primary);">GE Asynchronous</span>
                </div>
              </div>

              <!-- Holidays Legend (clickable, pink) -->
              <div class="legend-row-toggle ${showHolidays ? "active" : "inactive"}" data-toggle="holidays" style="padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: rgba(0,0,0,0.015); display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:#ec4899; flex-shrink:0;"></span>
                  <span style="font-size:12.5px; font-weight:700; color:var(--color-text-primary);">Holidays</span>
                </div>
              </div>

              <!-- Examinations Legend (Purple) -->
              <div style="padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: rgba(0,0,0,0.015); display: flex; flex-direction: column; gap: 10px;">
                <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-secondary);">Examinations</span>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  <!-- Prelim Exams -->
                  <div class="legend-row-toggle ${showPrelimExams ? "active" : "inactive"}" data-toggle="prelim" style="display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; cursor: pointer; border-radius:var(--radius-sm); transition: all 0.15s ease;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:#a855f7; flex-shrink:0;"></span>
                      <span style="font-size:12.5px; font-weight:700; color:var(--color-text-primary);">Prelim Exams</span>
                    </div>
                  </div>
                  <!-- Midterm Exams -->
                  <div class="legend-row-toggle ${showMidtermExams ? "active" : "inactive"}" data-toggle="midterm" style="display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; cursor: pointer; border-radius:var(--radius-sm); transition: all 0.15s ease;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:#a855f7; flex-shrink:0;"></span>
                      <span style="font-size:12.5px; font-weight:700; color:var(--color-text-primary);">Midterm Exams</span>
                    </div>
                  </div>
                  <!-- Final Exams -->
                  <div class="legend-row-toggle ${showFinalExams ? "active" : "inactive"}" data-toggle="final" style="display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; cursor: pointer; border-radius:var(--radius-sm); transition: all 0.15s ease;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:#a855f7; flex-shrink:0;"></span>
                      <span style="font-size:12.5px; font-weight:700; color:var(--color-text-primary);">Final Exams</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>

    <!-- 3. PREMIUM DIALOG MODAL OVERLAY FOR ADDING/EDITING MILESTONES -->
    ${isFormOpen ? `
      <div id="calFormModalBackdrop" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); backdrop-filter:blur(3px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;">
        <div class="card" style="width:100%; max-width:420px; padding:20px; box-shadow:0 12px 32px rgba(0,0,0,0.2); border:1px solid var(--color-border); background:var(--color-surface); border-radius:var(--radius-lg); display:flex; flex-direction:column; gap:14px; position:relative;">
          
          <button id="calFormCloseIconBtn" style="position:absolute; top:16px; right:16px; background:none; border:none; color:var(--color-text-secondary); cursor:pointer; padding:4px; display:flex; align-items:center;" title="Close dialog">
            <i data-lucide="x" style="width:16px; height:16px;"></i>
          </button>

          <h4 style="margin:0; font-size:15px; font-weight:800; color:var(--color-text-primary); display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--color-border); padding-bottom:10px;">
            <i data-lucide="${editingScheduleId ? "edit-3" : "plus-circle"}" style="width:18px; height:18px; color:var(--color-accent);"></i>
            ${editingScheduleId ? "Edit Milestone" : "Add Milestone"}
          </h4>

          <form id="calManageMilestoneForm" style="display:flex; flex-direction:column; gap:12px;">
            <!-- Category & Subcategory Row -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <div>
                <label style="display:block; font-size:10px; font-weight:700; text-transform:uppercase; color:var(--color-text-secondary); margin-bottom:4px;">Category</label>
                <select id="calFormCategory" required style="width:100%; height:34px; font-size:12px; padding:0 6px; border-radius:6px; border:1px solid var(--color-border); background:var(--color-surface); color:var(--color-text-primary); font-weight:600;">
                  <option value="async">CCS Asynchronous</option>
                  <option value="holidays">Holiday</option>
                  <option value="exams">Examination</option>
                </select>
              </div>
              <div>
                <label id="calFormSubCategoryLabel" style="display:block; font-size:10px; font-weight:700; text-transform:uppercase; color:var(--color-text-secondary); margin-bottom:4px;">Type</label>
                <select id="calFormSubCategory" style="width:100%; height:34px; font-size:12px; padding:0 6px; border-radius:6px; border:1px solid var(--color-border); background:var(--color-surface); color:var(--color-text-primary); font-weight:600;">
                </select>
              </div>
            </div>

            <!-- Title Input -->
            <div>
              <label style="display:block; font-size:10px; font-weight:700; text-transform:uppercase; color:var(--color-text-secondary); margin-bottom:4px;">Title</label>
              <input type="text" id="calFormTitle" placeholder="e.g. Independence Day, Midterms..." style="width:100%; height:34px; font-size:12.5px; padding:0 10px; border-radius:6px; border:1px solid var(--color-border); background:var(--color-surface); color:var(--color-text-primary);" />
            </div>

            <!-- Date Range Row -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <div>
                <label style="display:block; font-size:10px; font-weight:700; text-transform:uppercase; color:var(--color-text-secondary); margin-bottom:4px;">Start Date</label>
                <input type="date" id="calFormStartDate" required style="width:100%; height:34px; font-size:12px; padding:0 6px; border-radius:6px; border:1px solid var(--color-border); background:var(--color-surface); color:var(--color-text-primary);" />
              </div>
              <div>
                <label style="display:block; font-size:10px; font-weight:700; text-transform:uppercase; color:var(--color-text-secondary); margin-bottom:4px;">End Date</label>
                <input type="date" id="calFormEndDate" required style="width:100%; height:34px; font-size:12px; padding:0 6px; border-radius:6px; border:1px solid var(--color-border); background:var(--color-surface); color:var(--color-text-primary);" />
              </div>
            </div>

            <!-- Optional Description -->
            <div>
              <label style="display:block; font-size:10px; font-weight:700; text-transform:uppercase; color:var(--color-text-secondary); margin-bottom:4px;">Description (Optional)</label>
              <textarea id="calFormDescription" placeholder="Optional notes..." style="width:100%; height:50px; font-size:12px; padding:6px 10px; border-radius:6px; border:1px solid var(--color-border); background:var(--color-surface); color:var(--color-text-primary); resize:none; font-family:inherit;"></textarea>
            </div>

            <!-- Actions -->
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:6px; border-top:1px solid var(--color-border); padding-top:10px;">
              <button type="button" id="calFormCancelBtn" class="btn btn-sm btn-secondary" style="height:32px; padding:0 12px; font-size:12px; border-radius:6px; box-shadow:none;">
                Cancel
              </button>
              <button type="submit" class="btn btn-sm btn-accent" style="height:32px; padding:0 16px; font-size:12px; border-radius:6px; font-weight:700; box-shadow:none;">
                ${editingScheduleId ? "Update" : "Add Milestone"}
              </button>
            </div>
          </form>

        </div>
      </div>
    ` : ""}
  `;

  if (window.lucide) window.lucide.createIcons();

  // Populate Add/Edit Milestone Form values based on current state
  if (editingScheduleId) {
    const editSched = schedules.find(s => s.id === editingScheduleId);
    if (editSched) {
      const formCat = sectionEl.querySelector("#calFormCategory");
      const formSub = sectionEl.querySelector("#calFormSubCategory");
      const formTitle = sectionEl.querySelector("#calFormTitle");
      const formStart = sectionEl.querySelector("#calFormStartDate");
      const formEnd = sectionEl.querySelector("#calFormEndDate");
      const formDesc = sectionEl.querySelector("#calFormDescription");
      
      if (formCat) formCat.value = editSched.category;
      updateSubCategoryDropdown(formCat, formSub, editSched.subCategory);
      if (formTitle) formTitle.value = editSched.title;
      if (formStart) formStart.value = editSched.startDate;
      if (formEnd) formEnd.value = editSched.endDate;
      if (formDesc) formDesc.value = editSched.description || "";
    }
  } else {
    // New Milestone: set default dates to selectedDateStr
    const formStart = sectionEl.querySelector("#calFormStartDate");
    const formEnd = sectionEl.querySelector("#calFormEndDate");
    if (formStart) formStart.value = selectedDateStr;
    if (formEnd) formEnd.value = selectedDateStr;
    
    const formCat = sectionEl.querySelector("#calFormCategory");
    const formSub = sectionEl.querySelector("#calFormSubCategory");
    updateSubCategoryDropdown(formCat, formSub);
  }

  // Ensure Title requirement and label are updated based on the current category
  updateTitleRequired(sectionEl);

  // ATTACH EVENT HANDLERS
  attachCalendarEventHandlers(sectionEl);
}

// Sub-Component: Render Single Month Focus
function renderSingleMonthComponent(monthsList, tasks, events, schedules) {
  // Days in month calculation
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevTotalDays = new Date(currentYear, currentMonth, 0).getDate();
  const todayStr = new Date().toLocaleDateString('en-CA');

  let daysHtml = "";

  // 1. Prev Month Overlaps
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dNum = prevTotalDays - i;
    const m = currentMonth === 0 ? 11 : currentMonth - 1;
    const y = currentMonth === 0 ? currentYear - 1 : currentYear;
    const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
    daysHtml += renderCalendarCompactDay(dNum, dateStr, true, todayStr, tasks, events, schedules);
  }

  // 2. Current Month Days
  for (let dNum = 1; dNum <= totalDays; dNum++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
    daysHtml += renderCalendarCompactDay(dNum, dateStr, false, todayStr, tasks, events, schedules);
  }

  // 3. Next Month Overlaps to fill a full grid row
  const totalCells = 42;
  const currentCellCount = firstDayIndex + totalDays;
  const nextMonthCount = totalCells - currentCellCount;
  for (let dNum = 1; dNum <= nextMonthCount; dNum++) {
    const m = currentMonth === 11 ? 0 : currentMonth + 1;
    const y = currentMonth === 11 ? currentYear + 1 : currentYear;
    const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
    daysHtml += renderCalendarCompactDay(dNum, dateStr, true, todayStr, tasks, events, schedules);
  }

  return `
    <div class="card" style="padding: 20px; box-shadow: none; border: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom:1px solid var(--color-border); padding-bottom:12px;">
        <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: var(--color-text-primary); text-transform: uppercase; letter-spacing: 0.02em;">
          Focused Month
        </h3>
        <div style="display: flex; gap: 4px; align-items: center;">
          <button class="btn btn-secondary" id="calPrevMonthBtn" style="padding: 0 10px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--color-surface); border: 1px solid var(--color-border);">
            <i data-lucide="chevron-left" style="width: 14px; height: 14px;"></i>
          </button>
          <span style="font-size: 13.5px; font-weight: 700; min-width: 110px; text-align: center; color: var(--color-text-primary);">
            ${monthsList[currentMonth]} ${currentYear}
          </span>
          <button class="btn btn-secondary" id="calNextMonthBtn" style="padding: 0 10px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--color-surface); border: 1px solid var(--color-border);">
            <i data-lucide="chevron-right" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
      </div>

      <div style="background: var(--color-bg); padding: 8px; border-radius: var(--radius-md); border: 1px solid var(--color-border);">
        <!-- Weekdays Header -->
        <div style="display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-secondary); padding: 8px 0; border-bottom: 1px solid var(--color-border); margin-bottom: 8px;">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>
        <!-- Days Grid -->
        <div class="calendar-compact-grid">
          ${daysHtml}
        </div>
      </div>
    </div>
  `;
}

// Sub-Component: Render Academic Year Grid (12 Months simultaneously!)
function renderAcademicYearGridComponent(monthsList, tasks, events, schedules) {
  // We want to render a sequence of 12 months: January to December!
  const academicMonths = [
    { year: currentYear, month: 0 }, // January
    { year: currentYear, month: 1 }, // February
    { year: currentYear, month: 2 }, // March
    { year: currentYear, month: 3 }, // April
    { year: currentYear, month: 4 }, // May
    { year: currentYear, month: 5 }, // June
    { year: currentYear, month: 6 }, // July
    { year: currentYear, month: 7 }, // August
    { year: currentYear, month: 8 }, // September
    { year: currentYear, month: 9 }, // October
    { year: currentYear, month: 10 }, // November
    { year: currentYear, month: 11 }  // December
  ];

  const todayStr = new Date().toLocaleDateString('en-CA');
  let gridMonthsHtml = "";

  academicMonths.forEach(target => {
    const monthIndex = target.month;
    const yearNum = target.year;

    const firstDayIndex = new Date(yearNum, monthIndex, 1).getDay(); // 0 = Sun
    const totalDays = new Date(yearNum, monthIndex + 1, 0).getDate();
    const prevTotalDays = new Date(yearNum, monthIndex, 0).getDate();

    let monthDaysHtml = "";

    // 1. Prev Month Overlaps
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dNum = prevTotalDays - i;
      const m = monthIndex === 0 ? 11 : monthIndex - 1;
      const y = monthIndex === 0 ? yearNum - 1 : yearNum;
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
      monthDaysHtml += renderCalendarCompactDay(dNum, dateStr, true, todayStr, tasks, events, schedules);
    }

    // 2. Current Month Days
    for (let dNum = 1; dNum <= totalDays; dNum++) {
      const dateStr = `${yearNum}-${String(monthIndex + 1).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
      monthDaysHtml += renderCalendarCompactDay(dNum, dateStr, false, todayStr, tasks, events, schedules);
    }

    // 3. Next Month Overlaps to fill a full grid row (we'll pad so all months have 42 cells)
    const totalCells = 42;
    const currentCellCount = firstDayIndex + totalDays;
    const nextMonthCount = totalCells - currentCellCount;
    for (let dNum = 1; dNum <= nextMonthCount; dNum++) {
      const m = monthIndex === 11 ? 0 : monthIndex + 1;
      const y = monthIndex === 11 ? yearNum + 1 : yearNum;
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
      monthDaysHtml += renderCalendarCompactDay(dNum, dateStr, true, todayStr, tasks, events, schedules);
    }

    gridMonthsHtml += `
      <div class="academic-month-card">
        <h4 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 700; color: var(--color-text-primary); text-align: center; border-bottom: 1px solid var(--color-border); padding-bottom: 6px; letter-spacing: 0.04em;">
          ${monthsList[monthIndex]} ${yearNum}
        </h4>
        
        <!-- Weekdays Header -->
        <div style="display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-secondary); margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid rgba(0,0,0,0.05);">
          <div>Mo</div>
          <div>Tu</div>
          <div>We</div>
          <div>Th</div>
          <div>Fr</div>
          <div>Sa</div>
          <div>Su</div>
        </div>

        <div class="calendar-compact-grid">
          ${monthDaysHtml}
        </div>
      </div>
    `;
  });

  return `
    <div class="academic-year-grid-container">
      ${gridMonthsHtml}
    </div>
  `;
}

// Compact Calendar Day Rendering Logic with multi-layered visual highlighting and active filters
function renderCalendarCompactDay(dNum, dateStr, isOtherMonth, todayStr, tasks, events, schedules) {
  if (isOtherMonth) {
    return `<div class="calendar-day-compact-cell other-month" style="opacity: 0; pointer-events: none;"></div>`;
  }
  const isSelected = dateStr === selectedDateStr;
  const isToday = dateStr === todayStr;

  // 1. FILTERING & SEARCH: Find all active schedules/milestones for this day
  const daySchedules = schedules.filter(s => {
    return dateStr >= s.startDate && dateStr <= s.endDate;
  });

  // Apply visual category toggles & scope filters
  let filteredSchedules = daySchedules.filter(s => {
    // Advanced category visibility filters
    if (s.category === "async") {
      if (!showAsyncMode) return false;
    } else if (s.category === "admission") {
      if (admissionFilterMode === "hide") return false;
      if (admissionFilterMode === "start") return dateStr === s.startDate;
    } else if (s.category === "registration") {
      if (registrationFilterMode === "hide") return false;
      if (registrationFilterMode === "start") return dateStr === s.startDate;
    } else if (s.category === "classes") {
      if (!showClasses) return false;
    } else if (s.category === "grades_submission") {
      if (!showGrades) return false;
    } else if (s.category === "holidays") {
      if (!showHolidays) return false;
    } else if (s.category === "exams") {
      if (s.subCategory === "prelim" && !showPrelimExams) return false;
      if (s.subCategory === "midterm" && !showMidtermExams) return false;
      if (s.subCategory === "final" && !showFinalExams) return false;
    }

    // Filter by academic semester
    if (filterSemester !== "all" && s.semester !== "all" && s.semester !== filterSemester) {
      return false;
    }

    return true;
  });

  // Filter tasks & events
  const dayTasks = tasks.filter(t => {
    if (!t.startDate && !t.endDate) return false;
    const start = t.startDate || t.endDate;
    const end = t.endDate || t.startDate;
    return dateStr >= start && dateStr <= end;
  });

  const dayEvents = events.filter(e => e.date === dateStr);

  // Determine style classes
  let cellClasses = "calendar-day-compact-cell";
  if (isOtherMonth) {
    cellClasses += " other-month";
  } else {
    const isPast = dateStr < todayStr;
    if (isPast) {
      cellClasses += " past-day";
    }
  }
  if (isToday) cellClasses += " today";
  if (isSelected) cellClasses += " selected";

  // Compute number color dynamically based on priorities
  let numColor = "var(--color-text-primary)";
  if (isOtherMonth) {
    numColor = "rgba(120, 113, 108, 0.35)";
  } else if (isToday) {
    numColor = "var(--color-accent)";
  }

  // Priority coloring: Async (Green/Blue) > Exams (Purple) > Holidays (Pink)
  const asyncSchedule = filteredSchedules.find(s => s.category === "async");
  const examsSchedule = filteredSchedules.find(s => s.category === "exams");
  const holidaySchedule = filteredSchedules.find(s => s.category === "holidays");

  if (asyncSchedule && showAsyncMode && filterAsyncMode !== "hide_all") {
    const matchesColorType = (filterAsyncMode === "show_all" || filterAsyncMode === asyncSchedule.subCategory);
    if (matchesColorType) {
      numColor = asyncSchedule.subCategory === "blue" ? "#3b82f6" : "#22c55e"; // Blue for GE Async, Green for CCS Async
    }
  } else if (examsSchedule) {
    numColor = "#a855f7"; // Purple for Exams
  } else if (holidaySchedule && showHolidays) {
    numColor = "#ec4899"; // Pink
  }

  // Dot indicators (Events, Tasks, Exams, etc.)
  let dotsHtml = "";

  if (dayEvents.length > 0) {
    dotsHtml += `<div class="calendar-compact-dot" style="background:#7c3aed;" title="${dayEvents.length} Event(s)"></div>`;
  }

  // Prioritized task tracker indicators
  const hasHigh = dayTasks.some(t => t.priority === "high");
  const hasMedium = dayTasks.some(t => t.priority === "medium");
  if (hasHigh) {
    dotsHtml += `<div class="calendar-compact-dot" style="background:var(--color-expense);" title="High Priority Task(s)"></div>`;
  } else if (hasMedium) {
    dotsHtml += `<div class="calendar-compact-dot" style="background:var(--color-accent);" title="Medium Priority Task(s)"></div>`;
  }

  // If there are other schedules on this day but it's not asynchronously highlighted
  const nonAsyncSchedules = filteredSchedules.filter(s => s.category !== "async");
  if (nonAsyncSchedules.length > 0 && !asyncSchedule) {
    // Add tiny indicator row
    dotsHtml += `<div class="calendar-compact-dot" style="background:var(--color-accent);" title="${nonAsyncSchedules.length} Milestones"></div>`;
  }

  return `
    <div class="${cellClasses}" data-date="${dateStr}">
      <span style="font-size: 11px; font-weight: 700; color: ${numColor};">
        ${dNum}
      </span>
      <div class="calendar-dots-indicator-row">
        ${dotsHtml}
      </div>
    </div>
  `;
}

// Attach Event Handlers & Dom Actions
function attachCalendarEventHandlers(sectionEl) {
  // Navigation View toggles
  sectionEl.querySelector("#viewAcademicYearBtn")?.addEventListener("click", () => {
    currentView = "academic-year";
    renderCalendar();
  });

  sectionEl.querySelector("#viewSingleMonthBtn")?.addEventListener("click", () => {
    currentView = "month";
    renderCalendar();
  });

  // Single month navigation controls
  sectionEl.querySelector("#calPrevMonthBtn")?.addEventListener("click", () => {
    if (currentMonth === 0) {
      currentMonth = 11;
      currentYear--;
    } else {
      currentMonth--;
    }
    renderCalendar();
  });

  sectionEl.querySelector("#calNextMonthBtn")?.addEventListener("click", () => {
    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear++;
    } else {
      currentMonth++;
    }
    renderCalendar();
  });

  // Dropdown filter changes
  sectionEl.querySelector("#filterSemesterSelect")?.addEventListener("change", (e) => {
    filterSemester = e.target.value;
    renderCalendar();
  });

  sectionEl.querySelector("#filterAsyncModeSelect")?.addEventListener("change", (e) => {
    filterAsyncMode = e.target.value;
    renderCalendar();
  });

  // Capsule Filter Toggle segmented controls (Admission, Registration)
  sectionEl.querySelectorAll(".capsule-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      const mode = btn.dataset.mode;
      if (target === "admission") {
        admissionFilterMode = mode;
      } else if (target === "registration") {
        registrationFilterMode = mode;
      }
      renderCalendar();
    });
  });

  // Row Toggles for interactive legends (Classes, Grades, Holidays, Exams, Async)
  sectionEl.querySelectorAll(".legend-row-toggle").forEach(row => {
    row.addEventListener("click", () => {
      const toggle = row.dataset.toggle;
      if (toggle === "classes") {
        showClasses = !showClasses;
      } else if (toggle === "grades") {
        showGrades = !showGrades;
      } else if (toggle === "holidays") {
        showHolidays = !showHolidays;
      } else if (toggle === "async") {
        showAsyncMode = !showAsyncMode;
      } else if (toggle === "prelim") {
        showPrelimExams = !showPrelimExams;
      } else if (toggle === "midterm") {
        showMidtermExams = !showMidtermExams;
      } else if (toggle === "final") {
        showFinalExams = !showFinalExams;
      }
      renderCalendar();
    });
  });

  // Day Cell click selection & hover tooltips
  sectionEl.querySelectorAll(".calendar-day-compact-cell").forEach(cell => {
    cell.addEventListener("click", () => {
      selectedDateStr = cell.dataset.date;
      renderCalendar();
    });

    cell.addEventListener("mouseenter", () => {
      const dateStr = cell.dataset.date;
      if (!dateStr) return;

      const data = getData();
      const tasks = data.tasks || [];
      const events = data.events || [];
      const schedules = data.academicSchedules || [];

      // Filter exactly like calendar grid does
      const daySchedules = schedules.filter(s => {
        return dateStr >= s.startDate && dateStr <= s.endDate;
      });

      const filteredSchedules = daySchedules.filter(s => {
        if (s.category === "async") {
          if (!showAsyncMode) return false;
          if (filterAsyncMode === "hide_all") return false;
          if (filterAsyncMode !== "show_all" && filterAsyncMode !== s.subCategory) return false;
        } else if (s.category === "admission") {
          if (admissionFilterMode === "hide") return false;
          if (admissionFilterMode === "start") return dateStr === s.startDate;
        } else if (s.category === "registration") {
          if (registrationFilterMode === "hide") return false;
          if (registrationFilterMode === "start") return dateStr === s.startDate;
        } else if (s.category === "classes") {
          if (!showClasses) return false;
        } else if (s.category === "grades_submission") {
          if (!showGrades) return false;
        } else if (s.category === "holidays") {
          if (!showHolidays) return false;
        } else if (s.category === "exams") {
          if (s.subCategory === "prelim" && !showPrelimExams) return false;
          if (s.subCategory === "midterm" && !showMidtermExams) return false;
          if (s.subCategory === "final" && !showFinalExams) return false;
        }

        if (filterSemester !== "all" && s.semester !== "all" && s.semester !== filterSemester) {
          return false;
        }
        return true;
      });

      const dayTasks = tasks.filter(t => {
        if (!t.startDate && !t.endDate) return false;
        const start = t.startDate || t.endDate;
        const end = t.endDate || t.startDate;
        return dateStr >= start && dateStr <= end;
      });

      const dayEvents = events.filter(e => e.date === dateStr);

      // Only show tooltip if there is at least one active milestone/event/task on that day
      if (filteredSchedules.length === 0 && dayEvents.length === 0 && dayTasks.length === 0) {
        return;
      }

      // Create or locate tooltip element
      let tooltipEl = document.getElementById("calendar-custom-tooltip");
      if (!tooltipEl) {
        tooltipEl = document.createElement("div");
        tooltipEl.id = "calendar-custom-tooltip";
        tooltipEl.style.cssText = `
          position: absolute;
          z-index: 99999;
          pointer-events: none;
          background: rgba(18, 18, 18, 0.96);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 10px 14px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
          color: #ffffff;
          font-family: inherit;
          display: none;
          min-width: 180px;
          max-width: 280px;
          opacity: 0;
          transform: translateY(4px);
          transition: opacity 0.1s ease, transform 0.1s ease;
        `;
        document.body.appendChild(tooltipEl);
      }

      let itemsHtml = "";

      // Render visible academic milestones
      filteredSchedules.forEach(s => {
        let color = "#3b82f6";
        if (s.category === "async") {
          color = s.subCategory === "blue" ? "#3b82f6" : "#22c55e";
        } else if (s.category === "exams") {
          color = "#a855f7";
        } else if (s.category === "holidays") {
          color = "#ec4899";
        } else if (s.category === "admission") {
          color = "#eab308";
        } else if (s.category === "registration") {
          color = "#f97316";
        } else if (s.category === "classes") {
          color = "#06b6d4";
        } else if (s.category === "grades_submission") {
          color = "#14b8a6";
        }

        let label = s.title || "";
        if (!label) {
          if (s.category === "async") {
            label = s.subCategory === "blue" ? "GE Asynchronous" : "CCS Asynchronous";
          } else if (s.category === "exams") {
            label = s.subCategory ? `${s.subCategory.toUpperCase()} Exam` : "Examination";
          } else {
            label = s.category.replace("_", " ").toUpperCase();
          }
        }

        itemsHtml += `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${color}; flex-shrink: 0;"></span>
            <span style="font-size: 11.5px; font-weight: 500; color: #f3f4f6; line-height: 1.3;">${label}</span>
          </div>
        `;
      });

      // Render visible events
      dayEvents.forEach(e => {
        itemsHtml += `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #7c3aed; flex-shrink: 0;"></span>
            <span style="font-size: 11.5px; font-weight: 500; color: #f3f4f6; line-height: 1.3;">${e.title}</span>
          </div>
        `;
      });

      // Render visible tasks
      dayTasks.forEach(t => {
        let color = "#10b981";
        if (t.priority === "high") color = "#ef4444";
        else if (t.priority === "medium") color = "#f59e0b";

        itemsHtml += `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${color}; flex-shrink: 0;"></span>
            <span style="font-size: 11.5px; font-weight: 500; color: #f3f4f6; line-height: 1.3;">${t.title}</span>
          </div>
        `;
      });

      const formattedDate = formatTooltipDate(dateStr);
      tooltipEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 12.5px; font-weight: 700; color: #ffffff; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 6px;">
            ${formattedDate}
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${itemsHtml}
          </div>
        </div>
      `;

      // Position tooltip above the day cell
      tooltipEl.style.display = "block";
      
      const rect = cell.getBoundingClientRect();
      const tooltipWidth = tooltipEl.offsetWidth;
      const tooltipHeight = tooltipEl.offsetHeight;

      let top = rect.top + window.scrollY - tooltipHeight - 10;
      let left = rect.left + window.scrollX + (rect.width / 2) - (tooltipWidth / 2);

      if (left < 10) left = 10;
      if (left + tooltipWidth > window.innerWidth - 10) {
        left = window.innerWidth - tooltipWidth - 10;
      }
      if (top < window.scrollY + 10) {
        top = rect.bottom + window.scrollY + 10; // place below if too close to top
      }

      tooltipEl.style.top = `${top}px`;
      tooltipEl.style.left = `${left}px`;
      tooltipEl.style.opacity = "1";
      tooltipEl.style.transform = "translateY(0)";
    });

    cell.addEventListener("mouseleave", () => {
      const tooltipEl = document.getElementById("calendar-custom-tooltip");
      if (tooltipEl) {
        tooltipEl.style.opacity = "0";
        tooltipEl.style.transform = "translateY(4px)";
        tooltipEl.style.display = "none";
      }
    });
  });

  // Delete Milestone Handler
  sectionEl.querySelectorAll(".cal-delete-schedule-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const confirmed = await confirmAction("Are you sure you want to delete this schedule milestone?");
      if (confirmed) {
        deleteAcademicSchedule(id);
        if (editingScheduleId === id) {
          editingScheduleId = null;
        }
        showToast("Milestone deleted successfully", "success");
        renderCalendar();
      }
    });
  });

  // Edit Milestone Handler
  sectionEl.querySelectorAll(".cal-edit-schedule-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      editingScheduleId = id;
      renderCalendar();
    });
  });

  // Year Navigation Handlers
  sectionEl.querySelector("#calPrevYearBtn")?.addEventListener("click", () => {
    currentYear--;
    renderCalendar();
  });

  sectionEl.querySelector("#calNextYearBtn")?.addEventListener("click", () => {
    currentYear++;
    renderCalendar();
  });

  // Category change dynamically updates Sub-category and Title required status
  const formCat = sectionEl.querySelector("#calFormCategory");
  const formSub = sectionEl.querySelector("#calFormSubCategory");
  formCat?.addEventListener("change", () => {
    updateSubCategoryDropdown(formCat, formSub);
    updateTitleRequired(sectionEl);
  });

  // Milestone management form submission
  const milestoneForm = sectionEl.querySelector("#calManageMilestoneForm");
  milestoneForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const cat = sectionEl.querySelector("#calFormCategory")?.value;
    const sub = sectionEl.querySelector("#calFormSubCategory")?.value || "";
    let title = sectionEl.querySelector("#calFormTitle")?.value?.trim();
    const start = sectionEl.querySelector("#calFormStartDate")?.value;
    const end = sectionEl.querySelector("#calFormEndDate")?.value;
    const desc = sectionEl.querySelector("#calFormDescription")?.value?.trim() || "";

    // If exams or async and title is empty, auto-generate a fallback title
    if (!title && (cat === "async" || cat === "exams")) {
      if (cat === "async") {
        title = sub === "blue" ? "GE Asynchronous" : "CCS Asynchronous";
      } else if (cat === "exams") {
        if (sub === "prelim") title = "Prelim Exam";
        else if (sub === "midterm") title = "Midterm Exam";
        else if (sub === "final") title = "Final Exam";
        else title = "Examination";
      }
    }

    if (!title || !start || !end) return;

    if (editingScheduleId) {
      updateAcademicSchedule(editingScheduleId, {
        title,
        category: cat,
        subCategory: sub,
        startDate: start,
        endDate: end,
        description: desc
      });
      editingScheduleId = null;
    } else {
      addAcademicSchedule({
        title,
        category: cat,
        subCategory: sub,
        startDate: start,
        endDate: end,
        semester: "all",
        college: "all",
        description: desc
      });
    }
    isFormExpanded = false; // close modal after adding or updating
    renderCalendar();
  });

  // Cancel form edit mode
  sectionEl.querySelector("#calFormCancelBtn")?.addEventListener("click", () => {
    editingScheduleId = null;
    isFormExpanded = false; // close modal after cancelling
    renderCalendar();
  });

  // Close form edit mode via 'X' top corner button
  sectionEl.querySelector("#calFormCloseIconBtn")?.addEventListener("click", () => {
    editingScheduleId = null;
    isFormExpanded = false; // close modal
    renderCalendar();
  });

  // Backdrop click closes the modal if clicking outside the modal card
  const backdrop = sectionEl.querySelector("#calFormModalBackdrop");
  backdrop?.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      editingScheduleId = null;
      isFormExpanded = false;
      renderCalendar();
    }
  });

  // Open Add Milestone modal click handler
  sectionEl.querySelector("#calOpenFormBtn")?.addEventListener("click", () => {
    editingScheduleId = null;
    isFormExpanded = true;
    renderCalendar();
  });

}

// Helper: Dynamically update sub-category dropdown options based on selected category
function updateSubCategoryDropdown(catSelect, subSelect, selectedSubVal = "") {
  if (!catSelect || !subSelect) return;
  const cat = catSelect.value;
  subSelect.innerHTML = "";
  
  if (cat === "async") {
    subSelect.innerHTML = `
      <option value="green">CCS Async</option>
      <option value="blue">GE Async</option>
    `;
    subSelect.disabled = false;
  } else if (cat === "exams") {
    subSelect.innerHTML = `
      <option value="prelim">Prelim Exam</option>
      <option value="midterm">Midterm Exam</option>
      <option value="final">Final Exam</option>
    `;
    subSelect.disabled = false;
  } else {
    subSelect.innerHTML = `
      <option value="">No Type</option>
    `;
    subSelect.disabled = true;
  }
  
  if (selectedSubVal) {
    subSelect.value = selectedSubVal;
  }
}

// Helper: Dynamically toggle the required attribute and label for Title depending on selected category
function updateTitleRequired(sectionEl) {
  const formCat = sectionEl.querySelector("#calFormCategory");
  const formTitle = sectionEl.querySelector("#calFormTitle");
  const formTitleLabel = formTitle ? formTitle.parentElement.querySelector("label") : null;
  if (!formCat || !formTitle) return;

  const cat = formCat.value;
  if (cat === "exams" || cat === "async") {
    formTitle.removeAttribute("required");
    if (formTitleLabel) {
      formTitleLabel.innerHTML = `Title <span style="font-size:9.5px; font-weight:normal; text-transform:none; color:var(--color-text-tertiary);">(Optional)</span>`;
    }
    formTitle.placeholder = "Optional (defaults to type/category name)";
  } else {
    formTitle.setAttribute("required", "required");
    if (formTitleLabel) {
      formTitleLabel.innerHTML = `Title`;
    }
    formTitle.placeholder = "e.g. Independence Day...";
  }
}

// Helper: Format YYYY-MM-DD date into Month DD, YYYY
function formatTooltipDate(dateStr) {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parts[2];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return `${months[monthIdx]} ${String(day).padStart(2, "0")}, ${year}`;
}


