// js/dashboard.js
import { store } from "./store.js";
import {
  getStats, getRecentTransactions, getCategoryBreakdown,
  getMonthlyIncomeVsExpense, getDailyIncomeVsExpense, setStartingBalance, computeBalanceCentavos,
  getData,
} from "./data.js";
import { formatMoney, formatDate, pesosToCentavos } from "./utils.js";
import { openModal, closeModal, showToast } from "./ui.js";

let balanceChart, incomeExpenseChart, categoryChart, dailyDetailChart;
let currentMonthlyKeys = []; // "2026-06" etc, aligned to the currently-rendered monthly chart's bars
let detailYear, detailMonth; // which month the drill-down modal is currently showing
let categoryChartType = "income"; // which side of the ledger the Category Breakdown donut is showing
let selectedRange = "month"; // "month" | "year" | "all"

export function renderDashboard() {
  const isAdmin = store.get("isAdmin");
  const stats = getStats();

  renderStatCards(stats);
  renderDeltas(stats);
  renderBalanceSparkline();

  // Highlight active timeframe button and sync the display
  const activeBtn = document.querySelector(`#timeframeToggle [data-range='${selectedRange}']`);
  if (activeBtn) {
    document.querySelectorAll("#timeframeToggle .segmented-toggle-btn").forEach((b) => b.classList.remove("active"));
    activeBtn.classList.add("active");
  }
  updateTimeframeDisplay();

  renderIncomeExpenseChart(getMonthlyIncomeVsExpense());
  renderRecentTransactions(getRecentTransactions());
  renderQuickActions(isAdmin);

  if (window.lucide) window.lucide.createIcons();
  return null;
}

function renderStatCards(stats) {
  const map = {
    "[data-stat='balance']": stats.currentBalanceCentavos,
    "[data-stat='today-income']": stats.todayIncomeCentavos,
    "[data-stat='today-expense']": stats.todayExpenseCentavos,
    "[data-stat='monthly-income']": stats.monthlyIncomeCentavos,
    "[data-stat='monthly-expense']": stats.monthlyExpenseCentavos,
    "[data-stat='pending']": stats.pendingCollectionsCentavos,
  };
  for (const [selector, centavos] of Object.entries(map)) {
    const el = document.querySelector(selector);
    if (el) el.textContent = formatMoney(centavos);
  }
}

// An increase reads as "good" (green, up arrow) for income, but the
// same upward arrow means "bad" (red) for expenses — positiveIsGood
// flips which color an "up" delta gets per card.
const DELTA_CARDS = [
  { key: "todayIncomeDelta", selector: "[data-delta='today-income']", positiveIsGood: true },
  { key: "todayExpenseDelta", selector: "[data-delta='today-expense']", positiveIsGood: false },
  { key: "monthlyIncomeDelta", selector: "[data-delta='monthly-income']", positiveIsGood: true },
  { key: "monthlyExpenseDelta", selector: "[data-delta='monthly-expense']", positiveIsGood: false },
];

function renderDeltas(stats) {
  for (const { key, selector, positiveIsGood } of DELTA_CARDS) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const delta = stats[key];

    if (!delta) {
      el.style.display = "none";
      continue;
    }

    const isGoodDirection = delta.direction === "up" ? positiveIsGood : !positiveIsGood;
    el.style.display = "flex";
    el.className = `card-delta ${isGoodDirection ? "text-income" : "text-expense"}`;
    const icon = delta.direction === "up" ? "arrow-up" : "arrow-down";
    const label = delta.isNew ? "New" : `${Math.abs(delta.pct)}%`;
    el.innerHTML = `<i data-lucide="${icon}"></i>${label}`;
  }
  if (window.lucide) window.lucide.createIcons();
}

function renderBalanceSparkline() {
  const canvas = document.getElementById("balanceSparkline");
  if (!canvas || !window.Chart) return;
  if (balanceChart) balanceChart.destroy();

  const monthly = getMonthlyIncomeVsExpense();
  const hasAnyActivity = monthly.income.some((v) => v > 0) || monthly.expense.some((v) => v > 0);

  // With no transactions yet, every point would be identical and the
  // line renders as a flat bar across the card — which reads as a
  // broken progress indicator, not a trend. Skip it until there's
  // something real to show.
  if (!hasAnyActivity) {
    canvas.style.display = "none";
    return;
  }
  canvas.style.display = "block";

  const running = [];
  let balance = computeBalanceCentavos() - monthly.income.reduce((a, b) => a + b, 0) + monthly.expense.reduce((a, b) => a + b, 0);
  for (let i = 0; i < monthly.income.length; i++) {
    balance += monthly.income[i] - monthly.expense[i];
    running.push(balance / 100);
  }

  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 100);
  const firstVal = running[0] || 0;
  const lastVal = running[running.length - 1] || 0;
  const isUpTrend = lastVal >= firstVal;

  if (isUpTrend) {
    gradient.addColorStop(0, "rgba(52, 211, 153, 0.18)");
    gradient.addColorStop(1, "rgba(52, 211, 153, 0)");
  } else {
    gradient.addColorStop(0, "rgba(248, 113, 113, 0.18)");
    gradient.addColorStop(1, "rgba(248, 113, 113, 0)");
  }

  balanceChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: running.map((_, i) => i),
      datasets: [{
        data: running,
        borderWidth: 3, pointRadius: 0, tension: 0.4, fill: true,
        // Each segment is colored by whether the balance rose (income
        // outpaced expenses that period) or fell, rather than a single
        // fixed color for the whole line.
        segment: {
          borderColor: (ctx) => ctx.p0.parsed.y <= ctx.p1.parsed.y
            ? "rgba(52, 211, 153, 1)"
            : "rgba(248, 113, 113, 1)",
        },
        backgroundColor: gradient,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: 0 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      // offset:false pins the first and last points to the very edges
      // of the canvas instead of the category scale's default half-step
      // inset, which was leaving a visible gap on both sides.
      scales: {
        x: { display: false, offset: false },
        y: { display: false },
      },
    },
  });
}

function renderIncomeExpenseChart(data) {
  const canvas = document.getElementById("incomeExpenseChart");
  if (!canvas || !window.Chart) return;
  if (incomeExpenseChart) incomeExpenseChart.destroy();

  currentMonthlyKeys = data.keys;

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const tickColor = isDark ? "rgba(255, 255, 255, 0.45)" : "rgba(28, 25, 23, 0.55)";
  const gridZeroColor = isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(28, 25, 23, 0.25)";
  const gridNormalColor = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(28, 25, 23, 0.05)";
  const tooltipBgColor = isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.95)";
  const tooltipTextColor = isDark ? "#ffffff" : "#1c1917";
  const tooltipBorderColor = isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(28, 25, 23, 0.12)";

  incomeExpenseChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: "Income",
          data: data.income.map((c) => c / 100),
          backgroundColor: "#4ac18e",
          borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
          maxBarThickness: 28,
          stack: "flow"
        },
        {
          label: "Expenses",
          data: data.expense.map((c) => -(c / 100)),
          backgroundColor: "#f25c5c",
          borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 8, bottomRight: 8 },
          maxBarThickness: 28,
          stack: "flow"
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      onClick: (evt, elements) => {
        if (elements.length === 0) return;
        openMonthFromKey(currentMonthlyKeys[elements[0].index]);
      },
      onHover: (evt, elements) => {
        evt.native.target.style.cursor = elements.length ? "pointer" : "default";
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBgColor,
          titleColor: tooltipTextColor,
          bodyColor: tooltipTextColor,
          borderColor: tooltipBorderColor,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ₱${Math.abs(ctx.parsed.y).toLocaleString()}` }
        },
      },
      scales: {
        x: {
          grid: { display: false },
          stacked: true,
          ticks: {
            color: tickColor,
            font: { family: "Inter", size: 12, weight: "500" }
          }
        },
        y: {
          stacked: true,
          grid: {
            color: (context) => {
              if (context.tick && context.tick.value === 0) {
                return gridZeroColor;
              }
              return gridNormalColor;
            },
            borderDash: (context) => {
              if (context.tick && context.tick.value === 0) {
                return [4, 4];
              }
              return [];
            },
            drawTicks: false,
          },
          ticks: {
            display: false
          },
          border: {
            display: false
          }
        },
      },
    },
  });
}

function openMonthFromKey(key) {
  if (!key) return;
  const [year, month] = key.split("-").map(Number);
  openChartDetail(year, month);
}

function openChartDetail(year, month) {
  detailYear = year;
  detailMonth = month;
  renderDailyDetailChart();
  openModal(document.querySelector(".chart-detail-overlay"));
}

function renderDailyDetailChart() {
  const canvas = document.getElementById("dailyDetailChart");
  if (!canvas || !window.Chart) return;
  if (dailyDetailChart) dailyDetailChart.destroy();

  const data = getDailyIncomeVsExpense(detailYear, detailMonth);

  document.getElementById("detailMonthLabel").textContent = data.monthLabel;
  document.getElementById("detailMonthTotals").textContent =
    `Income ${formatMoney(data.totalIncome)} · Expenses ${formatMoney(data.totalExpense)}`;

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const tickColor = isDark ? "rgba(255, 255, 255, 0.45)" : "rgba(28, 25, 23, 0.55)";
  const titleColor = isDark ? "rgba(255, 255, 255, 0.35)" : "rgba(28, 25, 23, 0.45)";
  const legendColor = isDark ? "rgba(255, 255, 255, 0.6)" : "rgba(28, 25, 23, 0.7)";
  const gridZeroColor = isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(28, 25, 23, 0.25)";
  const gridNormalColor = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(28, 25, 23, 0.05)";
  const tooltipBgColor = isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.95)";
  const tooltipTextColor = isDark ? "#ffffff" : "#1c1917";
  const tooltipBorderColor = isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(28, 25, 23, 0.12)";

  dailyDetailChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: "Income",
          data: data.income.map((c) => c / 100),
          backgroundColor: "#4ac18e",
          borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          maxBarThickness: 22,
          stack: "flow"
        },
        {
          label: "Expenses",
          data: data.expense.map((c) => -(c / 100)),
          backgroundColor: "#f25c5c",
          borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 4, bottomRight: 4 },
          maxBarThickness: 22,
          stack: "flow"
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 12,
            usePointStyle: true,
            color: legendColor,
            font: { family: "Inter", size: 11 }
          }
        },
        tooltip: {
          backgroundColor: tooltipBgColor,
          titleColor: tooltipTextColor,
          bodyColor: tooltipTextColor,
          borderColor: tooltipBorderColor,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => `Day ${items[0].label}`,
            label: (ctx) => ` ${ctx.dataset.label}: ₱${Math.abs(ctx.parsed.y).toLocaleString()}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          stacked: true,
          ticks: {
            color: tickColor,
            font: { family: "Inter", size: 11 }
          },
          title: { display: true, text: "Day of month", color: titleColor, font: { size: 11, family: "Inter" } }
        },
        y: {
          stacked: true,
          grid: {
            color: (context) => {
              if (context.tick && context.tick.value === 0) {
                return gridZeroColor;
              }
              return gridNormalColor;
            },
            borderDash: (context) => {
              if (context.tick && context.tick.value === 0) {
                return [4, 4];
              }
              return [];
            },
            drawTicks: false,
          },
          ticks: {
            color: tickColor,
            font: { family: "Inter", size: 11 },
            callback: (v) => "₱" + Math.abs(v).toLocaleString()
          },
          border: {
            display: false
          }
        },
      },
    },
  });
}

export function initChartDetailModal() {
  const overlay = document.querySelector(".chart-detail-overlay");
  overlay?.querySelector(".modal-close-btn")?.addEventListener("click", () => closeModal(overlay));
  overlay?.addEventListener("click", (e) => { if (e.target === overlay) closeModal(overlay); });

  document.getElementById("detailPrevMonth")?.addEventListener("click", () => {
    detailMonth -= 1;
    if (detailMonth < 1) { detailMonth = 12; detailYear -= 1; }
    renderDailyDetailChart();
  });

  document.getElementById("detailNextMonth")?.addEventListener("click", () => {
    detailMonth += 1;
    if (detailMonth > 12) { detailMonth = 1; detailYear += 1; }
    renderDailyDetailChart();
  });

  // The expand button and clicking empty chart space (no bar under the
  // cursor) both default to the most recently active month rather than
  // doing nothing.
  const openMostRecent = () => {
    const key = currentMonthlyKeys[currentMonthlyKeys.length - 1];
    if (key) openMonthFromKey(key);
    else {
      const now = new Date();
      openChartDetail(now.getFullYear(), now.getMonth() + 1);
    }
  };
  document.querySelector(".expand-chart-btn")?.addEventListener("click", openMostRecent);
  document.getElementById("incomeExpenseChartWrap")?.addEventListener("click", (e) => {
    // Chart.js's own onClick already handles clicks that land on a bar;
    // this only fires the fallback when the click missed every bar
    // (e.g. tapping blank space above/below the columns).
    const points = incomeExpenseChart?.getElementsAtEventForMode(e, "index", { intersect: false }, false);
    if (!points || points.length === 0) openMostRecent();
  });
}

function renderCategoryChart(data, type) {
  const wrap = document.getElementById("categoryChartWrap");
  if (!wrap || !window.Chart) return;

  // Always start from a fresh canvas. Previously, an empty period
  // replaced this wrapper's innerHTML with an empty-state message and
  // never put the <canvas> back — fine the first time, but it meant
  // toggling to a type that DOES have data afterward had nothing to
  // draw into, since the canvas itself was gone for good.
  wrap.innerHTML = '<canvas id="categoryChart"></canvas>';
  const canvas = document.getElementById("categoryChart");
  if (categoryChart) categoryChart.destroy();

  if (data.labels.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><i data-lucide="pie-chart"></i><p>No ${type === "income" ? "income" : "expenses"} recorded yet.</p></div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const totalCentavos = data.values.reduce((a, b) => a + b, 0);
  const palette = type === "income"
    ? ["#ea580c", "#2563eb", "#16a34a", "#8b5cf6", "#78716c", "#0ea5e9"]
    : ["#dc2626", "#f97316", "#eab308", "#8b5cf6", "#64748b", "#0ea5e9"];

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const legendTextColor = isDark ? "rgba(255, 255, 255, 0.6)" : "rgba(28, 25, 23, 0.7)";
  const centerTextColor = isDark ? "#f5f0ea" : "#1c1917";

  categoryChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: data.labels,
      datasets: [{
        data: data.values.map((c) => c / 100),
        backgroundColor: palette,
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 10,
            usePointStyle: true,
            color: legendTextColor,
            font: { size: 11 }
          }
        }
      },
    },
    // A ring made of a single category (or a couple close in size) doesn't
    // communicate much on its own, so the total sits in the hole at the
    // center. That way the chart still earns its space even with sparse data.
    plugins: [{
      id: "donutCenterTotal",
      afterDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const centerX = (chartArea.left + chartArea.right) / 2;
        const centerY = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "600 19px Sora, sans-serif";
        ctx.fillStyle = centerTextColor;
        ctx.fillText(formatMoney(totalCentavos), centerX, centerY - 9);
        ctx.font = "600 10.5px Inter, sans-serif";
        ctx.fillStyle = "#9ca3af";
        ctx.fillText(type === "income" ? "TOTAL INCOME" : "TOTAL EXPENSES", centerX, centerY + 11);
        ctx.restore();
      },
    }],
  });
}

export function initCategoryToggle() {
  document.getElementById("categoryToggle")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-toggle-btn");
    if (!btn || btn.classList.contains("active")) return;

    document.querySelectorAll("#categoryToggle .segmented-toggle-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    categoryChartType = btn.dataset.type;
    renderCategoryChart(getFilteredCategoryBreakdown(categoryChartType, selectedRange), categoryChartType);
  });
}

export function initTimeframeToggle() {
  document.getElementById("timeframeToggle")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-toggle-btn");
    if (!btn || btn.classList.contains("active")) return;

    document.querySelectorAll("#timeframeToggle .segmented-toggle-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedRange = btn.dataset.range;
    updateTimeframeDisplay();
  });
}

function getTimeframeStats(range) {
  const data = getData();
  const transactions = data.transactions || [];
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);

  let incomeCentavos = 0;
  let expenseCentavos = 0;
  let labelSuffix = "";

  if (range === "month") {
    incomeCentavos = transactions
      .filter((t) => t.type === "income" && t.date.startsWith(currentMonth))
      .reduce((sum, t) => sum + t.amount, 0);
    expenseCentavos = transactions
      .filter((t) => t.type === "expense" && t.date.startsWith(currentMonth))
      .reduce((sum, t) => sum + t.amount, 0);
    labelSuffix = "This Month";
  } else if (range === "year") {
    incomeCentavos = transactions
      .filter((t) => t.type === "income" && t.date.startsWith(currentYear))
      .reduce((sum, t) => sum + t.amount, 0);
    expenseCentavos = transactions
      .filter((t) => t.type === "expense" && t.date.startsWith(currentYear))
      .reduce((sum, t) => sum + t.amount, 0);
    labelSuffix = "This Year";
  } else {
    incomeCentavos = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    expenseCentavos = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    labelSuffix = "All Time";
  }

  return {
    incomeCentavos,
    expenseCentavos,
    labelSuffix,
  };
}

function getFilteredCategoryBreakdown(type, range) {
  const data = getData();
  const transactions = data.transactions || [];
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);

  const totals = {};
  for (const t of transactions) {
    if (t.type !== type) continue;
    if (range === "month" && !t.date.startsWith(currentMonth)) continue;
    if (range === "year" && !t.date.startsWith(currentYear)) continue;
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  }
  return { labels: Object.keys(totals), values: Object.values(totals) };
}

function getCollectionRate() {
  const data = getData();
  const events = data.events || [];

  let totalDues = 0;
  let paidDues = 0;

  for (const event of events) {
    const fee = event.feeCentavos || 0;
    const participants = event.participants || [];
    for (const p of participants) {
      totalDues += fee;
      if (p.paid) {
        paidDues += fee;
      }
    }
  }

  const rate = totalDues > 0 ? Math.round((paidDues / totalDues) * 100) : 100;

  return {
    totalDues,
    paidDues,
    rate,
  };
}

function renderSavingsRateSubtext() {
  const data = getData();
  const transactions = data.transactions || [];
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);

  const monthlyIncome = transactions
    .filter((t) => t.type === "income" && t.date.startsWith(currentMonth))
    .reduce((sum, t) => sum + t.amount, 0);
  const monthlyExpense = transactions
    .filter((t) => t.type === "expense" && t.date.startsWith(currentMonth))
    .reduce((sum, t) => sum + t.amount, 0);

  const netSavings = monthlyIncome - monthlyExpense;
  const savingsRate = monthlyIncome > 0 ? Math.round((netSavings / monthlyIncome) * 100) : 0;

  const el = document.getElementById("balanceHeroSubtext");
  if (el) {
    const netSign = netSavings >= 0 ? "+" : "−";
    const trendIcon = netSavings >= 0 ? "trending-up" : "trending-down";

    el.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.12); padding: 2px 8px; border-radius: 12px; font-weight: 500; font-size: 12px; white-space: nowrap; flex-shrink: 0;">
        <i data-lucide="${trendIcon}" style="width: 12px; height: 12px;"></i>
        Savings Rate: ${savingsRate}%
      </span>
      <span style="display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; flex-wrap: nowrap;">
        <span style="opacity: 0.85;">Net:</span>
        <span style="font-weight: 600; color: ${netSavings >= 0 ? "#4ade80" : "#f87171"};">
          ${netSign}${formatMoney(Math.abs(netSavings))}
        </span>
        <span style="opacity: 0.75; font-size: 11.5px;">this month</span>
      </span>
    `;
    if (window.lucide) window.lucide.createIcons();
  }
}

function renderCollectionsProgress() {
  const stats = getCollectionRate();
  const wrap = document.getElementById("collectionsProgressWrap");
  const pctEl = document.getElementById("collectionsProgressPct");
  const fillEl = document.getElementById("collectionsProgressFill");

  if (wrap && pctEl && fillEl) {
    if (stats.totalDues > 0) {
      wrap.style.display = "block";
      pctEl.textContent = `${stats.rate}%`;
      fillEl.style.width = `${stats.rate}%`;
    } else {
      wrap.style.display = "none";
    }
  }
}

function updateTimeframeDisplay() {
  const rangeStats = getTimeframeStats(selectedRange);

  const incomeCard = document.querySelector("[data-stat='monthly-income']")?.closest(".stat-card");
  const expenseCard = document.querySelector("[data-stat='monthly-expense']")?.closest(".stat-card");

  if (incomeCard) {
    incomeCard.querySelector(".card-label").textContent = `${rangeStats.labelSuffix} Income`;
    incomeCard.querySelector("[data-stat='monthly-income']").textContent = formatMoney(rangeStats.incomeCentavos);

    const deltaEl = incomeCard.querySelector(".card-delta");
    if (deltaEl) {
      deltaEl.style.display = selectedRange === "month" ? "flex" : "none";
    }
  }

  if (expenseCard) {
    expenseCard.querySelector(".card-label").textContent = `${rangeStats.labelSuffix} Expenses`;
    expenseCard.querySelector("[data-stat='monthly-expense']").textContent = formatMoney(rangeStats.expenseCentavos);

    const deltaEl = expenseCard.querySelector(".card-delta");
    if (deltaEl) {
      deltaEl.style.display = selectedRange === "month" ? "flex" : "none";
    }
  }

  renderSavingsRateSubtext();
  renderCollectionsProgress();
  renderCategoryChart(getFilteredCategoryBreakdown(categoryChartType, selectedRange), categoryChartType);
}

function renderRecentTransactions(transactions) {
  const tbody = document.querySelector("#recentTransactionsTable tbody");
  if (!tbody) return;

  if (transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i data-lucide="inbox"></i><p>No transactions recorded yet.</p></div></td></tr>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  tbody.innerHTML = transactions.map((t) => {
    const initials = t.category.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    return `
    <tr>
      <td>
        <div class="table-member-cell">
          <div class="table-avatar" style="background:${t.type === "income" ? "var(--color-income)" : "var(--color-expense)"}">${initials}</div>
          <div>${t.category}</div>
        </div>
      </td>
      <td>${t.note || "—"}</td>
      <td><span class="status-badge ${t.type}">${t.type === "income" ? "Income" : "Expense"}</span></td>
      <td>${formatDate(t.date)}</td>
      <td class="amount-cell ${t.type === "income" ? "text-income" : "text-expense"}">
        ${t.type === "income" ? "+" : "−"}${formatMoney(t.amount)}
      </td>
    </tr>`;
  }).join("");
}

function renderQuickActions(isAdmin) {
  const panel = document.querySelector(".quick-actions-panel");
  if (!panel) return;

  if (!isAdmin) {
    panel.innerHTML = `<p style="color:var(--color-text-secondary); font-size:13.5px; margin:0;">You're viewing in read-only mode.</p>`;
    return;
  }

  panel.innerHTML = `
    <button class="quick-action-btn" id="qaEditBalance"><span class="qa-icon"><i data-lucide="banknote"></i></span>Edit Balance</button>
    <button class="quick-action-btn" id="qaAddEvent"><span class="qa-icon"><i data-lucide="calendar-plus"></i></span>Add Event</button>
    <button class="quick-action-btn" id="qaAddTxn"><span class="qa-icon"><i data-lucide="plus"></i></span>Add Transaction</button>
    <button class="quick-action-btn" id="qaAddMember"><span class="qa-icon"><i data-lucide="user-plus"></i></span>Add Member</button>
  `;
  if (window.lucide) window.lucide.createIcons();

  document.getElementById("qaEditBalance")?.addEventListener("click", () => {
    document.getElementById("balanceInput").value = (computeBalanceCentavos() / 100).toFixed(2);
    openModal(document.querySelector(".balance-modal-overlay"));
  });
  document.getElementById("qaAddEvent")?.addEventListener("click", () => openModal(document.querySelector(".event-modal-overlay")));
  document.getElementById("qaAddTxn")?.addEventListener("click", () => openModal(document.querySelector(".txn-modal-overlay")));
  document.getElementById("qaAddMember")?.addEventListener("click", () => openModal(document.querySelector(".member-modal-overlay")));
}

export function initBalanceModal() {
  const overlay = document.querySelector(".balance-modal-overlay");
  overlay?.querySelector(".modal-close-btn")?.addEventListener("click", () => closeModal(overlay));
  overlay?.addEventListener("click", (e) => { if (e.target === overlay) closeModal(overlay); });

  overlay?.querySelector("form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("balanceInput").value;
    if (input === "") return;
    setStartingBalance(pesosToCentavos(input));
    showToast("Balance updated", "success");
    closeModal(overlay);
  });
}

document.addEventListener("themechange", () => {
  const routeEl = document.querySelector('section[data-route="#/dashboard"]');
  if (routeEl && routeEl.classList.contains("active")) {
    renderDashboard();
    const detailOverlay = document.querySelector(".chart-detail-overlay");
    if (detailOverlay && detailOverlay.classList.contains("open")) {
      renderDailyDetailChart();
    }
  }
});