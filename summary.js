"use strict";

let state = loadState();
if (consumeOuraRedirect(state)) {
  state = loadState();
}

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
  syncOuraButton: document.querySelector("#syncOuraButton"),
  ouraSleepEmpty: document.querySelector("#ouraSleepEmpty"),
  ouraSleepList: document.querySelector("#ouraSleepList"),
  generateSummaryButton: document.querySelector("#generateSummaryButton"),
  aiSummaryBox: document.querySelector("#aiSummaryBox"),
  summaryMessage: document.querySelector("#summaryMessage"),
};

function setNotice(message, tone = "info") {
  if (!els.summaryMessage) return;
  els.summaryMessage.textContent = message;
  els.summaryMessage.dataset.tone = tone;
  els.summaryMessage.classList.remove("is-fresh");
  void els.summaryMessage.offsetWidth;
  els.summaryMessage.classList.add("is-fresh");
}

function setBusy(button, busyLabel, isBusy) {
  if (!button) return;
  if (isBusy) {
    if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
    button.classList.add("is-busy");
    return;
  }
  button.textContent = button.dataset.originalLabel || button.textContent;
  button.disabled = false;
  button.classList.remove("is-busy");
}

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
    <defs>
      <linearGradient id="summaryArea" x1="0%" x2="0%" y1="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(22,148,255,0.34)" />
        <stop offset="100%" stop-color="rgba(22,148,255,0.06)" />
      </linearGradient>
    </defs>
    <polygon points="${area}" fill="url(#summaryArea)"></polygon>
    <polyline points="${points}" fill="none" stroke="#1694ff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
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

function renderOuraSleep() {
  const sleep = getRecentOuraSleep(state).slice(0, 10);
  els.ouraSleepList.innerHTML = "";
  els.ouraSleepEmpty.classList.toggle("hidden", sleep.length > 0);
  for (const item of sleep) {
    const entry = document.createElement("article");
    entry.className = "history-item";
    const bedtime = item.bedtime_start ? new Date(item.bedtime_start) : null;
    const durationHours = item.total_sleep_duration ? item.total_sleep_duration / 3600 : null;
    entry.innerHTML = `
      <div class="history-main">
        <div>
          <strong class="history-dose">${item.score ?? "?"} sleep score</strong>
          <p class="history-time">${bedtime ? bedtime.toLocaleDateString() : "Recent sleep"}</p>
          <p class="history-note muted">${durationHours ? `${formatNumber(durationHours)} hours asleep` : "Sleep duration unavailable"}</p>
        </div>
      </div>
    `;
    els.ouraSleepList.appendChild(entry);
  }
}

els.syncOuraButton.addEventListener("click", async () => {
  setBusy(els.syncOuraButton, "Syncing Oura...", true);
  setNotice("Syncing recent Oura sleep data...", "warning");
  try {
    await syncOuraSleep(state);
    renderOuraSleep();
    setNotice("Oura sleep data synced.", "success");
  } catch (error) {
    setNotice(error.message, "error");
  } finally {
    setBusy(els.syncOuraButton, "Syncing Oura...", false);
  }
});

els.generateSummaryButton.addEventListener("click", async () => {
  setBusy(els.generateSummaryButton, "Generating...", true);
  setNotice("Generating AI summary...", "warning");
  els.aiSummaryBox.textContent = "Generating...";
  try {
    const result = await generateAiSummary(state);
    els.aiSummaryBox.textContent = result.summary || JSON.stringify(result, null, 2);
    setNotice("AI summary generated.", "success");
  } catch (error) {
    els.aiSummaryBox.textContent = error.message;
    setNotice(error.message, "error");
  } finally {
    setBusy(els.generateSummaryButton, "Generating...", false);
  }
});

(async () => {
  try {
    await loadRemoteStateInto(state);
  } catch (error) {
    els.aiSummaryBox.textContent = error.message;
    setNotice(error.message, "error");
  }
  renderHeaderMetrics();
  renderSummaryTrend();
  renderCalendar();
  renderInventory();
  renderOuraSleep();
  registerServiceWorker();
})();
