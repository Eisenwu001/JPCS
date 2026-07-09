// js/reports.js
import { getPeriodReport } from "./data.js";
import { formatMoney, formatDate } from "./utils.js";

export function renderReports() {
  const sectionEl = document.querySelector('section[data-route="#/reports"]');

  sectionEl.innerHTML = `
    <div class="reports-intro">
      <h2 style="margin:0 0 4px;">Reports</h2>
      <p style="color:var(--color-text-secondary); margin:0 0 24px; font-size:14px;">
        Generate a summary for any period, straight from your transaction ledger.
      </p>
    </div>

    <div class="card report-controls-card" style="margin-bottom:16px;">
      <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
        <div class="form-group" style="margin:0; width:150px; flex-shrink:0;">
          <label for="reportTypeSelect">Report Type</label>
          <select id="reportTypeSelect" class="form-control">
            <option value="monthly">Monthly</option>
            <option value="semester">Semester</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div class="form-group" id="monthPickerGroup" style="margin:0; width:180px; flex-shrink:0;">
          <label for="monthPicker">Month</label>
          <input type="month" id="monthPicker" class="form-control" />
        </div>
        <div class="form-group" id="semesterPickerGroup" style="margin:0; display:none; width:180px; flex-shrink:0;">
          <label for="semesterSelect">Semester</label>
          <select id="semesterSelect" class="form-control">
            <option value="1">1st Sem (Aug – Dec)</option>
            <option value="2">2nd Sem (Jan – May)</option>
          </select>
        </div>
        <div class="form-group" id="yearInputGroup" style="margin:0; display:none; width:100px; flex-shrink:0;">
          <label for="yearInput">Year</label>
          <input type="number" id="yearInput" class="form-control" />
        </div>
        <div class="form-group" id="semYearGroup" style="margin:0; display:none; width:100px; flex-shrink:0;">
          <label for="semYearInput">Year</label>
          <input type="number" id="semYearInput" class="form-control" />
        </div>
        <button class="btn btn-primary" id="generateReportBtn" style="flex-shrink:0;">Generate</button>
        <button class="btn btn-secondary" id="printReportBtn" style="display:none; flex-shrink:0;">
          <i data-lucide="printer" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;"></i>Print / Save PDF
        </button>
      </div>
    </div>

    <div id="reportOutput"></div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const typeSelect = document.getElementById("reportTypeSelect");
  const monthGroup = document.getElementById("monthPickerGroup");
  const semGroup = document.getElementById("semesterPickerGroup");
  const yearGroup = document.getElementById("yearInputGroup");
  const semYearGroup = document.getElementById("semYearGroup");
  const monthPicker = document.getElementById("monthPicker");
  const yearInput = document.getElementById("yearInput");
  const semYearInput = document.getElementById("semYearInput");

  const now = new Date();
  monthPicker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  yearInput.value = now.getFullYear();
  semYearInput.value = now.getFullYear();

  function updateVisibleControls() {
    const type = typeSelect.value;
    monthGroup.style.display = type === "monthly" ? "block" : "none";
    semGroup.style.display = type === "semester" ? "block" : "none";
    semYearGroup.style.display = type === "semester" ? "block" : "none";
    yearGroup.style.display = type === "yearly" ? "block" : "none";
  }
  typeSelect.addEventListener("change", updateVisibleControls);
  updateVisibleControls();

  document.getElementById("generateReportBtn").addEventListener("click", () => {
    const { startISO, endISO, label } = computeRange();
    const report = getPeriodReport(startISO, endISO);
    renderReportOutput(report, label);
    document.getElementById("printReportBtn").style.display = "inline-flex";
  });

  document.getElementById("printReportBtn").addEventListener("click", () => window.print());

  function computeRange() {
    const type = typeSelect.value;

    if (type === "monthly") {
      const [year, month] = monthPicker.value.split("-").map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      return {
        startISO: `${year}-${String(month).padStart(2, "0")}-01`,
        endISO: `${year}-${String(month).padStart(2, "0")}-${lastDay}`,
        label: new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      };
    }

    if (type === "semester") {
      const year = Number(semYearInput.value);
      const sem = document.getElementById("semesterSelect").value;
      // Simplifying assumption (adjust here if your org's academic
      // calendar differs): 1st Sem = Aug–Dec, 2nd Sem = Jan–May.
      return sem === "1"
        ? { startISO: `${year}-08-01`, endISO: `${year}-12-31`, label: `1st Semester ${year}-${year + 1}` }
        : { startISO: `${year}-01-01`, endISO: `${year}-05-31`, label: `2nd Semester ${year - 1}-${year}` };
    }

    // yearly
    const year = Number(yearInput.value);
    return { startISO: `${year}-01-01`, endISO: `${year}-12-31`, label: `Year ${year}` };
  }
}

function renderReportOutput(report, periodLabel) {
  const output = document.getElementById("reportOutput");
  const incomeRows = Object.entries(report.incomeByCategory).sort((a, b) => b[1] - a[1]);
  const expenseRows = Object.entries(report.expenseByCategory).sort((a, b) => b[1] - a[1]);

  output.innerHTML = `
    <div class="card" id="reportPrintArea">
      <div style="text-align:center; margin-bottom:24px; padding-bottom:16px; border-bottom:1px solid var(--color-border);">
        <h2 style="margin:0;" class="font-display">JPCS Treasury Report</h2>
        <p style="color:var(--color-text-secondary); margin:4px 0 0;">${periodLabel}</p>
      </div>

      <div class="stat-grid" style="margin-bottom:24px;">
        <div class="card stat-card"><div class="card-label">Starting Balance</div><div class="card-value tabular-nums">${formatMoney(report.startingBalance)}</div></div>
        <div class="card stat-card"><div class="card-label">Total Income</div><div class="card-value tabular-nums text-income">${formatMoney(report.totalIncome)}</div></div>
        <div class="card stat-card"><div class="card-label">Total Expenses</div><div class="card-value tabular-nums text-expense">${formatMoney(report.totalExpense)}</div></div>
        <div class="card stat-card"><div class="card-label">Ending Balance</div><div class="card-value tabular-nums">${formatMoney(report.endingBalance)}</div></div>
      </div>

      <div class="charts-row" style="margin-bottom:24px;">
        <div>
          <h3 style="font-size:14px; margin:0 0 10px;">Income by Category</h3>
          ${incomeRows.length === 0 ? `<p style="color:var(--color-text-secondary); font-size:13px;">No income this period.</p>` : `
            <table class="data-table">
              <tbody>
                ${incomeRows.map(([cat, amt]) => `<tr><td>${cat}</td><td class="amount-cell text-income">${formatMoney(amt)}</td></tr>`).join("")}
              </tbody>
            </table>`}
        </div>
        <div>
          <h3 style="font-size:14px; margin:0 0 10px;">Expenses by Category</h3>
          ${expenseRows.length === 0 ? `<p style="color:var(--color-text-secondary); font-size:13px;">No expenses this period.</p>` : `
            <table class="data-table">
              <tbody>
                ${expenseRows.map(([cat, amt]) => `<tr><td>${cat}</td><td class="amount-cell text-expense">${formatMoney(amt)}</td></tr>`).join("")}
              </tbody>
            </table>`}
        </div>
      </div>

      <h3 style="font-size:14px; margin:0 0 10px;">All Transactions (${report.transactions.length})</h3>
      ${report.transactions.length === 0 ? `<div class="empty-state"><i data-lucide="inbox"></i><p>No transactions in this period.</p></div>` : `
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Type</th><th style="text-align:right;">Amount</th></tr></thead>
            <tbody>
              ${report.transactions.map((t) => `
                <tr>
                  <td>${formatDate(t.date)}</td>
                  <td>${t.category}</td>
                  <td style="color:var(--color-text-secondary);">${t.note || "—"}</td>
                  <td><span class="status-badge ${t.type}">${t.type === "income" ? "Income" : "Expense"}</span></td>
                  <td class="amount-cell ${t.type === "income" ? "text-income" : "text-expense"}">${t.type === "income" ? "+" : "−"}${formatMoney(t.amount)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}