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
  calendarMonthTitle: document.querySelector("#calendarMonthTitle"),
  calendarMonthSelect: document.querySelector("#calendarMonthSelect"),
  calendarGrid: document.querySelector("#calendarGrid"),
  focusedDayTitle: document.querySelector("#focusedDayTitle"),
  focusedDecayChart: document.querySelector("#focusedDecayChart"),
  focusedDecayAxis: document.querySelector("#focusedDecayAxis"),
  focusedDecayLegend: document.querySelector("#focusedDecayLegend"),
  refillStatusLabel: document.querySelector("#refillStatusLabel"),
  refillStatusHeadline: document.querySelector("#refillStatusHeadline"),
  refillStatusDetail: document.querySelector("#refillStatusDetail"),
  plannedTablets: document.querySelector("#plannedTablets"),
  estimatedUsed: document.querySelector("#estimatedUsed"),
  estimatedRemaining: document.querySelector("#estimatedRemaining"),
  syncOuraButton: document.querySelector("#syncOuraButton"),
  ouraSleepEmpty: document.querySelector("#ouraSleepEmpty"),
  ouraSleepList: document.querySelector("#ouraSleepList"),
  ouraDebugInfo: document.querySelector("#ouraDebugInfo"),
  latestReadinessScore: document.querySelector("#latestReadinessScore"),
  latestStressState: document.querySelector("#latestStressState"),
  latestResilienceLevel: document.querySelector("#latestResilienceLevel"),
  latestHeartRate: document.querySelector("#latestHeartRate"),
  latestHrv: document.querySelector("#latestHrv"),
  latestTemperatureDeviation: document.querySelector("#latestTemperatureDeviation"),
  latestSleepScore: document.querySelector("#latestSleepScore"),
  latestSleepHours: document.querySelector("#latestSleepHours"),
  latestSleepBedtime: document.querySelector("#latestSleepBedtime"),
  lateDoseSleepHours: document.querySelector("#lateDoseSleepHours"),
  earlyDoseSleepHours: document.querySelector("#earlyDoseSleepHours"),
  bedtimeSpread: document.querySelector("#bedtimeSpread"),
  sleepFrictionSummary: document.querySelector("#sleepFrictionSummary"),
  sleepPatternList: document.querySelector("#sleepPatternList"),
  doseSleepChart: document.querySelector("#doseSleepChart"),
  doseSleepLegend: document.querySelector("#doseSleepLegend"),
  timingSleepChart: document.querySelector("#timingSleepChart"),
  timingSleepLegend: document.querySelector("#timingSleepLegend"),
};

let selectedCalendarMonthKey = "";
let selectedCalendarDateKey = "";

function setNotice(message, tone = "info") {
  showToast(message, tone);
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

function getAvailableMonthKeys() {
  const keys = new Set();
  keys.add(`${new Date().getFullYear()}-${`${new Date().getMonth() + 1}`.padStart(2, "0")}`);
  for (const entry of getDoseEntries(state)) {
    const date = new Date(entry.timestamp);
    keys.add(`${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`);
  }
  for (const item of getSortedOuraSleep(state)) {
    const date = getOuraDisplayDate(item);
    if (!date) continue;
    keys.add(`${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`);
  }
  return Array.from(keys).sort((a, b) => b.localeCompare(a));
}

function parseMonthKey(monthKey) {
  const [year, month] = String(monthKey).split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function formatMonthKey(monthKey) {
  return parseMonthKey(monthKey).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function getDoseEntriesForMonth(monthKey) {
  const monthStart = parseMonthKey(monthKey);
  return getDoseEntries(state).filter((entry) => {
    const date = new Date(entry.timestamp);
    return date.getFullYear() === monthStart.getFullYear() && date.getMonth() === monthStart.getMonth();
  });
}

function getDefaultSelectedDateKey(monthKey) {
  const monthStart = parseMonthKey(monthKey);
  const monthEntries = getDoseEntriesForMonth(monthKey);
  if (monthEntries.length) return dateKey(monthEntries[0].timestamp);

  const today = new Date();
  if (today.getFullYear() === monthStart.getFullYear() && today.getMonth() === monthStart.getMonth()) {
    return dateKey(today);
  }
  return dateKey(monthStart);
}

function ensureCalendarState() {
  const months = getAvailableMonthKeys();
  if (!selectedCalendarMonthKey || !months.includes(selectedCalendarMonthKey)) {
    selectedCalendarMonthKey = months[0];
  }
  const selectedDate = parseLocalDateKey(selectedCalendarDateKey);
  if (
    !selectedDate ||
    selectedDate.getFullYear() !== parseMonthKey(selectedCalendarMonthKey).getFullYear() ||
    selectedDate.getMonth() !== parseMonthKey(selectedCalendarMonthKey).getMonth()
  ) {
    selectedCalendarDateKey = getDefaultSelectedDateKey(selectedCalendarMonthKey);
  }
}

function populateMonthSelect() {
  const months = getAvailableMonthKeys();
  els.calendarMonthSelect.innerHTML = months
    .map((monthKey) => `<option value="${monthKey}">${formatMonthKey(monthKey)}</option>`)
    .join("");
  els.calendarMonthSelect.value = selectedCalendarMonthKey;
}

function renderCalendar() {
  ensureCalendarState();
  populateMonthSelect();

  const monthStart = parseMonthKey(selectedCalendarMonthKey);
  const firstDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const startWeekday = firstDay.getDay();
  const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const monthEntries = getDoseEntriesForMonth(selectedCalendarMonthKey);
  const dailyTotals = new Map();

  els.calendarMonthTitle.textContent = `🗓️ ${formatMonthKey(selectedCalendarMonthKey)}`;

  for (const entry of monthEntries) {
    const key = dateKey(entry.timestamp);
    dailyTotals.set(key, (dailyTotals.get(key) || 0) + Number(entry.amount));
  }

  const cells = [];
  for (let index = 0; index < startWeekday; index += 1) cells.push(`<div class="calendar-cell empty"></div>`);
  for (let day = 1; day <= lastDay; day += 1) {
    const key = `${monthStart.getFullYear()}-${`${monthStart.getMonth() + 1}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
    const total = dailyTotals.get(key) || 0;
    const tone = total === 0 ? "none" : getDoseTone(total).tone;
    const selectedClass = key === selectedCalendarDateKey ? " selected" : "";
    cells.push(`
      <button type="button" class="calendar-cell ${tone}${selectedClass}" data-date="${key}">
        <span>${day}</span>
        <strong>${total ? formatNumber(total) : ""}</strong>
      </button>
    `);
  }

  els.calendarGrid.innerHTML = cells.join("");
}

function renderFocusedDecay() {
  const selectedDate = parseLocalDateKey(selectedCalendarDateKey);
  if (!selectedDate) {
    els.focusedDayTitle.textContent = "🎯 Select a date";
    els.focusedDecayChart.innerHTML = "";
    els.focusedDecayAxis.innerHTML = "";
    els.focusedDecayLegend.textContent = "";
    return;
  }

  const center = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12, 0, 0, 0);
  const windowStart = center.getTime() - 24 * 60 * 60 * 1000;
  const windowEnd = center.getTime() + 24 * 60 * 60 * 1000;
  const levels = getDoseDecaySeriesBetween(state, windowStart, windowEnd, 73);
  const width = 360;
  const chartTop = 24;
  const chartBottom = 168;
  const chartHeight = chartBottom - chartTop;
  const maxLevel = Math.max(...levels.map((item) => item.level), 1);
  const points = levels
    .map((item, index) => {
      const x = 20 + index * ((width - 40) / (levels.length - 1));
      const y = chartBottom - (item.level / maxLevel) * chartHeight;
      return `${x},${y}`;
    })
    .join(" ");
  const area = `20,${chartBottom} ${points} 340,${chartBottom}`;
  const axisTicks = getStaticTimeTicks(windowStart, windowEnd);
  const tickLines = axisTicks
    .map((tick) => {
      const ratio = (tick.timestamp - windowStart) / (windowEnd - windowStart);
      const x = 20 + ratio * (width - 40);
      return `<line x1="${x}" y1="${chartBottom}" x2="${x}" y2="${chartBottom + 6}" stroke="rgba(88,112,143,0.18)" stroke-width="1" />`;
    })
    .join("");
  els.focusedDecayAxis.innerHTML = axisTicks
    .map((tick) => {
      const left = ((tick.timestamp - windowStart) / (windowEnd - windowStart)) * 100;
      return `<span style="left:${left}%">${tick.label}</span>`;
    })
    .join("");

  const doseMarkers = getDoseEntries(state)
    .filter((entry) => {
      const time = new Date(entry.timestamp).getTime();
      return time >= windowStart && time <= windowEnd;
    })
    .map((entry) => {
      const ratio = (new Date(entry.timestamp).getTime() - windowStart) / (windowEnd - windowStart);
      const x = 20 + ratio * (width - 40);
      return `<line x1="${x}" y1="${chartTop}" x2="${x}" y2="${chartBottom}" stroke="rgba(255,255,255,0.72)" stroke-width="1.5" stroke-dasharray="3 4" />`;
    })
    .join("");

  const ouraSegments = getSleepOverlaySegments(state, windowStart, windowEnd);
  const nightOverlay =
    ouraSegments.length > 0
      ? ouraSegments
          .map((segment) => {
            const x = 20 + ((segment.start - windowStart) / (windowEnd - windowStart)) * (width - 40);
            const w = ((segment.end - segment.start) / (windowEnd - windowStart)) * (width - 40);
            return `<rect x="${x}" y="${chartTop}" width="${w}" height="${chartHeight}" fill="rgba(8,21,46,0.14)" rx="10" />`;
          })
          .join("")
      : (() => {
          const segments = [];
          const startDate = new Date(windowStart);
          for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
            const nightStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + dayOffset, 22, 0, 0, 0).getTime();
            const nightEnd = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + dayOffset + 1, 7, 0, 0, 0).getTime();
            const visibleStart = Math.max(nightStart, windowStart);
            const visibleEnd = Math.min(nightEnd, windowEnd);
            if (visibleEnd <= visibleStart) continue;
            const x = 20 + ((visibleStart - windowStart) / (windowEnd - windowStart)) * (width - 40);
            const w = ((visibleEnd - visibleStart) / (windowEnd - windowStart)) * (width - 40);
            segments.push(`<rect x="${x}" y="${chartTop}" width="${w}" height="${chartHeight}" fill="rgba(23,32,51,0.08)" rx="10" />`);
          }
          return segments.join("");
        })();

  els.focusedDecayChart.innerHTML = `
    <defs>
      <linearGradient id="focusedDecayArea" x1="0%" x2="0%" y1="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(39,130,255,0.30)" />
        <stop offset="100%" stop-color="rgba(39,130,255,0.04)" />
      </linearGradient>
    </defs>
    <line x1="20" y1="${chartBottom}" x2="340" y2="${chartBottom}" stroke="rgba(88,112,143,0.18)" stroke-width="1.4" />
    ${nightOverlay}
    ${doseMarkers}
    <polygon points="${area}" fill="url(#focusedDecayArea)"></polygon>
    <polyline points="${points}" fill="none" stroke="#2782ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${tickLines}
  `;

  const centerLevel = getEstimatedActiveLevel(state, center.getTime());
  els.focusedDayTitle.textContent = `🎯 48 hours around ${center.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  els.focusedDecayLegend.textContent = `Centered on 12 PM for the selected day. Estimated active level at center: ${formatNumber(centerLevel)} ${unitLabel(state)}. Shaded bands show ${ouraSegments.length ? "actual Oura sleep" : "fallback night hours"}.`;
}

function renderInventory() {
  const usage = getCurrentMonthTabletUsage(state);
  els.plannedTablets.textContent = formatNumber(usage.planned);
  els.estimatedUsed.textContent = formatNumber(usage.used);
  els.estimatedRemaining.textContent = formatNumber(usage.remaining);
}

function renderRefillStatus() {
  const refill = getRefillStatus(state);
  const chip = els.refillStatusHeadline?.closest(".refill-chip");
  if (!chip) return;
  chip.className = `stat-chip refill-chip refill-${refill.tone}`;
  els.refillStatusLabel.textContent = refill.dueDate
    ? `Due ${refill.dueDate.toLocaleDateString()}`
    : "Refill status";
  els.refillStatusHeadline.textContent = refill.headline;
  els.refillStatusDetail.textContent = refill.detail;
}

function renderLatestSleepMetrics() {
  const latestSleep = getLatestOuraSleep(state);
  if (!latestSleep) {
    els.latestSleepScore.textContent = "-";
    els.latestSleepHours.textContent = "-";
    els.latestSleepBedtime.textContent = "-";
    return;
  }
  const bedtime = latestSleep.bedtime_start ? new Date(latestSleep.bedtime_start) : null;
  const displayDate = getOuraDisplayDate(latestSleep);
  const hours = latestSleep.total_sleep_duration ? Number(latestSleep.total_sleep_duration) / 3600 : null;
  els.latestSleepScore.textContent = latestSleep.score ?? "Pending";
  els.latestSleepHours.textContent = hours ? `${formatNumber(hours)}h` : "-";
  els.latestSleepBedtime.textContent = bedtime
    ? bedtime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : displayDate
      ? displayDate.toLocaleDateString()
      : "-";
}

function renderRecoveryMetrics() {
  const recovery = getOuraRecoverySnapshot(state);
  els.latestReadinessScore.textContent = recovery.readinessScore ?? "-";
  els.latestStressState.textContent = recovery.stressSummary || "-";
  els.latestResilienceLevel.textContent = recovery.resilienceLevel || "-";
  els.latestHeartRate.textContent = Number.isFinite(recovery.latestHeartRate) ? `${formatNumber(recovery.latestHeartRate)} bpm` : "-";
  els.latestHrv.textContent = Number.isFinite(recovery.latestHrv) ? `${formatNumber(recovery.latestHrv)} ms` : "-";
  els.latestTemperatureDeviation.textContent = Number.isFinite(recovery.temperatureDeviation)
    ? `${recovery.temperatureDeviation > 0 ? "+" : ""}${formatNumber(recovery.temperatureDeviation)}`
    : "-";
}

function renderSleepFriction() {
  const friction = getSleepFrictionInsights(state, 14);
  const lateHours = friction.later.averageSleepHours;
  const earlyHours = friction.earlier.averageSleepHours;
  els.lateDoseSleepHours.textContent = Number.isFinite(lateHours) ? `${formatNumber(lateHours)}h` : "-";
  els.earlyDoseSleepHours.textContent = Number.isFinite(earlyHours) ? `${formatNumber(earlyHours)}h` : "-";
  els.bedtimeSpread.textContent = Number.isFinite(friction.bedtimeSpreadHours)
    ? `${formatNumber(friction.bedtimeSpreadHours)}h`
    : "-";

  if (!friction.count) {
    els.sleepFrictionSummary.textContent = "Sync Oura and log a few more nights to estimate what seems to hurt sleep.";
    return;
  }

  const timingMessage =
    Number.isFinite(lateHours) && Number.isFinite(earlyHours)
      ? lateHours < earlyHours
        ? `Later dose nights are averaging about ${formatNumber(earlyHours - lateHours)} fewer hours of sleep than earlier dose nights.`
        : `Later dose nights are not currently looking worse than earlier ones.`
      : "There are not enough later-vs-earlier dose nights yet for a strong timing read.";

  const bedtimeMessage = Number.isFinite(friction.bedtimeSpreadHours)
    ? friction.bedtimeSpreadHours > 2
      ? `Bedtime has been fairly irregular with about a ${formatNumber(friction.bedtimeSpreadHours)} hour spread.`
      : `Bedtime has been relatively steady within about ${formatNumber(friction.bedtimeSpreadHours)} hours.`
    : "Bedtime regularity is not available yet.";

  els.sleepFrictionSummary.textContent = `${timingMessage} ${bedtimeMessage} ${friction.shortSleepCount} short-sleep nights and ${friction.lowScoreCount} low-score nights showed up in the last ${friction.count} matched nights.`;
}

function renderSleepPatterns() {
  const cards = getSleepPatternCards(state, 14);
  els.sleepPatternList.innerHTML = "";
  for (const card of cards) {
    const item = document.createElement("article");
    item.className = "history-item";
    item.innerHTML = `
      <div>
        <strong class="history-dose">${card.title}</strong>
        <p class="history-note muted">${card.detail}</p>
      </div>
    `;
    els.sleepPatternList.appendChild(item);
  }
}

function renderOuraSleep() {
  const sleep = getSortedOuraSleep(state).slice(0, 10);
  els.ouraSleepList.innerHTML = `
    <div class="oura-table-head" aria-hidden="true">
      <span>Day</span>
      <span>Score</span>
      <span>Hours</span>
    </div>
  `;
  els.ouraSleepEmpty.classList.toggle("hidden", sleep.length > 0);
  if (els.ouraDebugInfo) {
    const newestDay = sleep[0]?.day || null;
    els.ouraDebugInfo.textContent = newestDay
      ? `Newest Oura day fetched: ${newestDay} • ${sleep.length} sleep records shown`
      : "No Oura sleep day returned yet.";
  }
  if (sleep.length > 0) {
    const lastSync = state.integrations?.oura?.lastSyncAt
      ? new Date(state.integrations.oura.lastSyncAt).toLocaleString()
      : "recently";
    setNotice(`Oura sleep records loaded. Last synced ${lastSync}.`, "success");
  }
  for (const item of sleep) {
    const entry = document.createElement("div");
    entry.className = "oura-table-row";
    const displayDate = getOuraDisplayDate(item);
    const durationHours = item.total_sleep_duration ? item.total_sleep_duration / 3600 : null;
    const scoreLabel = item.score ?? "Pending";
    const hoursLabel = durationHours ? `${formatNumber(durationHours)}h` : "-";
    entry.innerHTML = `
      <span class="oura-table-day">${displayDate ? displayDate.toLocaleDateString() : "Recent sleep"}</span>
      <strong class="oura-table-score">${scoreLabel}</strong>
      <span class="oura-table-hours">${hoursLabel}</span>
    `;
    els.ouraSleepList.appendChild(entry);
  }
}

function renderDoseSleepChart() {
  const points = getSleepDosePoints(state, 10).filter((point) => Number.isFinite(point.sleepHours));
  if (!points.length) {
    els.doseSleepChart.innerHTML = "";
    els.doseSleepLegend.textContent = "Sync Oura to compare dose totals with sleep duration.";
    return;
  }

  const width = 360;
  const chartLeft = 26;
  const chartRight = 334;
  const chartBottom = 190;
  const chartTop = 18;
  const chartWidth = chartRight - chartLeft;
  const maxDose = Math.max(...points.map((point) => point.doseTotal), 1);
  const minSleep = Math.max(0, Math.min(...points.map((point) => point.sleepHours || 0)) - 0.5);
  const maxSleep = Math.max(...points.map((point) => point.sleepHours || 0), 1) + 0.35;
  const slotWidth = chartWidth / points.length;
  const barWidth = Math.min(26, Math.max(18, slotWidth * 0.54));

  const bars = points
    .map((point, index) => {
      const x = chartLeft + index * slotWidth + (slotWidth - barWidth) / 2;
      const h = ((point.doseTotal || 0) / maxDose) * (chartBottom - chartTop);
      const y = chartBottom - h;
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(h, 4)}" rx="9" fill="rgba(18,110,235,0.72)" />`;
    })
    .join("");

  const linePoints = points
    .map((point, index) => {
      const x = chartLeft + index * slotWidth + slotWidth / 2;
      const y = chartBottom - (((point.sleepHours || 0) - minSleep) / Math.max(maxSleep - minSleep, 0.5)) * (chartBottom - chartTop);
      return `${x},${y}`;
    })
    .join(" ");

  els.doseSleepChart.innerHTML = `
    <line x1="${chartLeft}" y1="${chartTop}" x2="${chartRight}" y2="${chartTop}" stroke="rgba(33,79,142,0.08)" stroke-width="1" />
    <line x1="${chartLeft}" y1="${(chartTop + chartBottom) / 2}" x2="${chartRight}" y2="${(chartTop + chartBottom) / 2}" stroke="rgba(33,79,142,0.08)" stroke-width="1" />
    <line x1="${chartLeft}" y1="${chartBottom}" x2="${width - chartLeft}" y2="${chartBottom}" stroke="rgba(33,79,142,0.22)" stroke-width="1.5" />
    ${bars}
    <polyline points="${linePoints}" fill="none" stroke="#73efe7" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${points
      .map((point, index) => {
        const x = chartLeft + index * slotWidth + slotWidth / 2;
        const y = chartBottom - (((point.sleepHours || 0) - minSleep) / Math.max(maxSleep - minSleep, 0.5)) * (chartBottom - chartTop);
        return `<circle cx="${x}" cy="${y}" r="5.5" fill="#73efe7" />`;
      })
      .join("")}
  `;

  els.doseSleepLegend.textContent = `${getSleepInsightSummary(state)} Blue bars = total dose on the day before sleep. Teal line = hours slept.`;
}

function renderTimingSleepChart() {
  const points = getSleepDosePoints(state, 10).filter((point) => Number.isFinite(point.sleepHours) && Number.isFinite(point.lastDoseHour));
  if (!points.length) {
    els.timingSleepChart.innerHTML = "";
    els.timingSleepLegend.textContent = "Log doses with timestamps to compare last-dose timing with sleep.";
    return;
  }

  const width = 360;
  const height = 220;
  const chartLeft = 22;
  const chartRight = 338;
  const chartTop = 22;
  const chartBottom = 184;
  const minHour = Math.min(...points.map((point) => point.lastDoseHour), 8);
  const maxHour = Math.max(...points.map((point) => point.lastDoseHour), 24);
  const minSleep = Math.min(...points.map((point) => point.sleepHours), 0);
  const maxSleep = Math.max(...points.map((point) => point.sleepHours), 10);

  const circles = points
    .map((point) => {
      const x = chartLeft + ((point.lastDoseHour - minHour) / Math.max(maxHour - minHour, 1)) * (chartRight - chartLeft);
      const y = chartBottom - ((point.sleepHours - minSleep) / Math.max(maxSleep - minSleep, 1)) * (chartBottom - chartTop);
      return `<circle cx="${x}" cy="${y}" r="7" fill="rgba(239,91,114,0.72)" stroke="rgba(255,255,255,0.85)" stroke-width="2" />`;
    })
    .join("");

  els.timingSleepChart.innerHTML = `
    <line x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight}" y2="${chartBottom}" stroke="rgba(33,79,142,0.22)" stroke-width="1.5" />
    <line x1="${chartLeft}" y1="${chartTop}" x2="${chartLeft}" y2="${chartBottom}" stroke="rgba(33,79,142,0.22)" stroke-width="1.5" />
    ${circles}
  `;

  const avgLastDoseHour = points.reduce((sum, point) => sum + point.lastDoseHour, 0) / points.length;
  els.timingSleepLegend.textContent = `Recent matched nights: ${points.length}. Later dots on the x-axis mean later last doses; higher dots mean more sleep. Average last-dose time: ${formatNumber(avgLastDoseHour)}h.`;
}

els.syncOuraButton.addEventListener("click", async () => {
  setBusy(els.syncOuraButton, "Syncing Oura...", true);
  setNotice("Syncing recent Oura sleep data...", "warning");
  try {
    const { warnings } = await syncOuraSleep(state);
    renderLatestSleepMetrics();
    renderRecoveryMetrics();
    renderSleepFriction();
    renderSleepPatterns();
    renderOuraSleep();
    renderDoseSleepChart();
    renderTimingSleepChart();
    renderCalendar();
    renderFocusedDecay();
    renderRefillStatus();
    const notice = warnings.length > 0
      ? `Oura synced (${warnings.join(", ")} unavailable).`
      : "Oura sleep data synced.";
    setNotice(notice, warnings.length > 0 ? "warning" : "success");
  } catch (error) {
    setNotice(error.message, "error");
  } finally {
    setBusy(els.syncOuraButton, "Syncing Oura...", false);
  }
});

els.calendarMonthSelect?.addEventListener("change", (event) => {
  selectedCalendarMonthKey = String(event.target.value || "");
  selectedCalendarDateKey = getDefaultSelectedDateKey(selectedCalendarMonthKey);
  renderCalendar();
  renderFocusedDecay();
});

els.calendarGrid?.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target ? target.closest("[data-date]") : null;
  if (!button) return;
  selectedCalendarDateKey = button.dataset.date;
  renderCalendar();
  renderFocusedDecay();
});

(async () => {
  try {
    await loadRemoteStateInto(state);
  } catch (error) {
    setNotice(error.message, "error");
  }
  renderHeaderMetrics();
  renderSummaryTrend();
  renderCalendar();
  renderFocusedDecay();
  renderRefillStatus();
  renderInventory();
  renderLatestSleepMetrics();
  renderRecoveryMetrics();
  renderSleepFriction();
  renderSleepPatterns();
  renderOuraSleep();
  renderDoseSleepChart();
  renderTimingSleepChart();
  registerServiceWorker();
})();
