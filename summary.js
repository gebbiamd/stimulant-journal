"use strict";

let state = loadState();

const els = {
  avg3: document.querySelector("#avg3"),
  avg7: document.querySelector("#avg7"),
  monthTotal: document.querySelector("#monthTotal"),
  summaryTrendChart: document.querySelector("#summaryTrendChart"),
  summaryTrendLegend: document.querySelector("#summaryTrendLegend"),
  calendarGrid: document.querySelector("#calendarGrid"),
  plannedTablets: document.querySelector("#plannedTablets"),
  estimatedUsed: document.querySelector("#estimatedUsed"),
  estimatedRemaining: document.querySelector("#estimatedRemaining"),
};

function renderHeaderMetrics() {
  const monthTotal = getCurrentMonthDoseEntries(state).reduce((sum, entry) => sum + Number(entry.amount), 0);
  els.avg3.textContent = `${formatNumber(getRollingAverage(state, 3))} ${unitLabel(state)}/day`;
  els.avg7.textContent = `${formatNumber(getRollingAverage(state, 7))} ${unitLabel(state)}/day`;
  els.monthTotal.textContent = `${formatNumber(monthTotal)} ${unitLabel(state)}`;
}

function renderSummaryTrend() {
  const totals = getTotalsByDay(state, 30);
  const width = 360;
  const maxTotal = Math.max(...totals.map((item) => item.total), 1);
  const points = totals
    .map((item, index) => {
      const x = 16 + index * ((width - 32) / (totals.length - 1));
      const y = 168 - (item.total / maxTotal) * 128;
      return `${x},${y}`;
    })
    .join(" ");
  const area = `16,168 ${points} 344,168`;
  els.summaryTrendChart.innerHTML = `
    <polygon points="${area}" fill="rgba(201,121,86,0.18)"></polygon>
    <polyline points="${points}" fill="none" stroke="#9c4f2f" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
  `;
  els.summaryTrendLegend.textContent = `30-day total: ${formatNumber(totals.reduce((sum, item) => sum + item.total, 0))} ${unitLabel(state)}`;
}

function renderCalendar() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const startWeekday = firstDay.getDay();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthEntries = getCurrentMonthDoseEntries(state);
  const dailyTotals = new Map();

  for (const entry of monthEntries) {
    const key = dateKey(entry.timestamp);
    dailyTotals.set(key, (dailyTotals.get(key) || 0) + Number(entry.amount));
  }

  const cells = [];
  for (let index = 0; index < startWeekday; index += 1) cells.push(`<div class="calendar-cell empty"></div>`);
  for (let day = 1; day <= lastDay; day += 1) {
    const key = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
    const total = dailyTotals.get(key) || 0;
    const tone = total === 0 ? "none" : total <= (Number(state.settings.vacationDoseThreshold) || 10) ? "light" : total <= (Number(state.settings.dailyTarget) || 40) ? "medium" : "heavy";
    cells.push(`
      <div class="calendar-cell ${tone}">
        <span>${day}</span>
        <strong>${total ? formatNumber(total) : ""}</strong>
      </div>
    `);
  }

  els.calendarGrid.innerHTML = cells.join("");
}

function renderInventory() {
  const usage = getCurrentMonthTabletUsage(state);
  els.plannedTablets.textContent = formatNumber(usage.planned);
  els.estimatedUsed.textContent = formatNumber(usage.used);
  els.estimatedRemaining.textContent = formatNumber(usage.remaining);
}

renderHeaderMetrics();
renderSummaryTrend();
renderCalendar();
renderInventory();
registerServiceWorker();
