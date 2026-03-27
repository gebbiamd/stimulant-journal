"use strict";

let state = loadState();
if (consumeOuraRedirect(state)) {
  state = loadState();
}

const els = {
  installButton: document.querySelector("#installButton"),
  doseForm: document.querySelector("#doseForm"),
  noteForm: document.querySelector("#noteForm"),
  doseAmount: document.querySelector("#doseAmount"),
  doseTime: document.querySelector("#doseTime"),
  doseNote: document.querySelector("#doseNote"),
  doseMgHint: document.querySelector("#doseMgHint"),
  noteTime: document.querySelector("#noteTime"),
  journalNote: document.querySelector("#journalNote"),
  nowButton: document.querySelector("#nowButton"),
  doseUnitLabel: document.querySelector("#doseUnitLabel"),
  thermoFill: document.querySelector("#thermoFill"),
  targetMarker: document.querySelector("#targetMarker"),
  scaleTop: document.querySelector("#scaleTop"),
  scaleMid: document.querySelector("#scaleMid"),
  scaleBase: document.querySelector("#scaleBase"),
  todayTotal: document.querySelector("#todayTotal"),
  todayUnit: document.querySelector("#todayUnit"),
  todayEntries: document.querySelector("#todayEntries"),
  todayLastDose: document.querySelector("#todayLastDose"),
  todayGaugeBadge: document.querySelector("#todayGaugeBadge"),
  todayGaugeLabel: document.querySelector("#todayGaugeLabel"),
  gaugeReason: document.querySelector("#gaugeReason"),
  monthTabletUsage: document.querySelector("#monthTabletUsage"),
  miniTrendChart: document.querySelector("#miniTrendChart"),
  miniTrendAxis: document.querySelector("#miniTrendAxis"),
  miniTrendLegend: document.querySelector("#miniTrendLegend"),
  recentList: document.querySelector("#recentList"),
  recentEmpty: document.querySelector("#recentEmpty"),
  activityItemTemplate: document.querySelector("#activityItemTemplate"),
};

function renderGauge() {
  const todayEntries = getTodayDoseEntries(state);
  const total = todayEntries.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const totalTablets = todayEntries.reduce((sum, entry) => sum + Number(entry.tabletCount || 0), 0);
  const lastDose = todayEntries[0] ? new Date(todayEntries[0].timestamp) : null;
  const gauge = getHomeGauge(state);
  const tabletUsage = getCurrentMonthTabletUsage(state);
  const dailyTarget = Number(state.settings.dailyTarget) || defaultState.settings.dailyTarget;

  els.todayTotal.textContent = formatNumber(total);
  els.todayUnit.textContent = unitLabel(state);
  els.todayEntries.textContent = `${todayEntries.length}`;
  els.todayLastDose.textContent = lastDose
    ? lastDose.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "None";
  els.todayGaugeBadge.textContent = gauge.label;
  els.todayGaugeBadge.className = `status-badge ${gauge.tone}`;
  els.todayGaugeLabel.textContent = `${tabletLabel(totalTablets)} today • ${Math.round(gauge.ratio * 100)}% of your daily mg target`;
  els.gaugeReason.textContent = `${gauge.reason} Monthly tablets used: ${formatNumber(tabletUsage.used)} of ${formatNumber(tabletUsage.planned)}.`;
  els.monthTabletUsage.textContent = `${formatNumber(tabletUsage.used)} / ${formatNumber(tabletUsage.planned)}`;
  els.thermoFill.style.height = `${Math.min(gauge.ratio * 100, 100)}%`;
  els.thermoFill.className = `thermo-fill ${gauge.tone}`;
  els.targetMarker.style.bottom = "75%";
  els.scaleTop.textContent = `${formatNumber(dailyTarget)} ${unitLabel(state)}`;
  els.scaleMid.textContent = `${formatNumber(dailyTarget / 2)} ${unitLabel(state)}`;
  els.scaleBase.textContent = `0 ${unitLabel(state)}`;
  els.doseUnitLabel.textContent = "tabs";
  els.doseMgHint.textContent = `Current conversion: 1 tablet = ${formatNumber(state.settings.mgPerTablet || defaultState.settings.mgPerTablet)} ${unitLabel(state)}.`;
}

function renderMiniTrend() {
  const levels = getDoseDecaySeries(state, 24, 49);
  const width = 360;
  const chartTop = 24;
  const chartBottom = 168;
  const chartHeight = chartBottom - chartTop;
  const maxLevel = Math.max(...levels.map((item) => item.level), 1);
  const now = Date.now();
  const dayStart = now - 24 * 60 * 60 * 1000;
  const points = levels
    .map((item, index) => {
      const x = 20 + index * ((width - 40) / (levels.length - 1));
      const y = chartBottom - (item.level / maxLevel) * chartHeight;
      return `${x},${y}`;
    })
    .join(" ");
  const area = `20,${chartBottom} ${points} 340,${chartBottom}`;
  const tickIndexes = [0, 12, 24, 36, 48];
  const ticks = tickIndexes
    .map((index) => {
      const x = 20 + index * ((width - 40) / (levels.length - 1));
      return `<line x1="${x}" y1="${chartBottom}" x2="${x}" y2="${chartBottom + 6}" stroke="rgba(88,112,143,0.18)" stroke-width="1" />`;
    })
    .join("");
  els.miniTrendAxis.innerHTML = tickIndexes
    .map((index) => {
      const label = new Date(levels[index].timestamp).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      return `<span>${label}</span>`;
    })
    .join("");
  const doseMarkers = getDoseEntries(state)
    .filter((entry) => now - new Date(entry.timestamp).getTime() <= 24 * 60 * 60 * 1000)
    .map((entry) => {
      const ratio = (new Date(entry.timestamp).getTime() - dayStart) / (24 * 60 * 60 * 1000);
      const x = 20 + ratio * (width - 40);
      return `<line x1="${x}" y1="${chartTop}" x2="${x}" y2="${chartBottom}" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-dasharray="3 4" />`;
    })
    .join("");
  const nightOverlay = (() => {
    const segments = [];
    const startDate = new Date(dayStart);
    for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
      const nightStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + dayOffset, 22, 0, 0, 0).getTime();
      const nightEnd = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + dayOffset + 1, 7, 0, 0, 0).getTime();
      const visibleStart = Math.max(nightStart, dayStart);
      const visibleEnd = Math.min(nightEnd, now);
      if (visibleEnd <= visibleStart) continue;
      const x = 20 + ((visibleStart - dayStart) / (24 * 60 * 60 * 1000)) * (width - 40);
      const w = ((visibleEnd - visibleStart) / (24 * 60 * 60 * 1000)) * (width - 40);
      segments.push(`<rect x="${x}" y="${chartTop}" width="${w}" height="${chartHeight}" fill="rgba(23,32,51,0.08)" rx="10" />`);
    }
    return segments.join("");
  })();

  els.miniTrendChart.innerHTML = `
    <defs>
      <linearGradient id="decayArea" x1="0%" x2="0%" y1="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(39,130,255,0.30)" />
        <stop offset="100%" stop-color="rgba(39,130,255,0.04)" />
      </linearGradient>
    </defs>
    <line x1="20" y1="${chartBottom}" x2="340" y2="${chartBottom}" stroke="rgba(88,112,143,0.18)" stroke-width="1.4" />
    ${nightOverlay}
    ${doseMarkers}
    <polygon points="${area}" fill="url(#decayArea)"></polygon>
    <polyline points="${points}" fill="none" stroke="#2782ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    ${ticks}
  `;

  const currentLevel = levels[levels.length - 1]?.level || 0;
  const peakLevel = Math.max(...levels.map((item) => item.level), 0);
  els.miniTrendLegend.textContent = `Estimated active level now: ${formatNumber(currentLevel)} ${unitLabel(state)} • peak over last 24h: ${formatNumber(peakLevel)} ${unitLabel(state)} • shaded bands show night hours • half-life: ${formatNumber(state.settings.decayHalfLifeHours || defaultState.settings.decayHalfLifeHours)}h`;
}

function renderRecent() {
  const cutoff = Date.now() - DAY_MS;
  const items = state.entries.filter((entry) => new Date(entry.timestamp).getTime() >= cutoff).slice(0, 8);
  els.recentList.innerHTML = "";
  els.recentEmpty.classList.toggle("hidden", items.length > 0);

  for (const entry of items) {
    const fragment = els.activityItemTemplate.content.cloneNode(true);
    const date = new Date(entry.timestamp);
    fragment.querySelector(".history-dose").textContent =
      entry.type === "note"
        ? "Journal note"
        : `${tabletLabel(entry.tabletCount || 0)} • ${formatNumber(entry.amount)} ${unitLabel(state)}`;
    fragment.querySelector(".history-time").textContent = date.toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
    fragment.querySelector(".history-note").textContent = entry.note || "No note";
    fragment.querySelector(".delete-button").dataset.id = entry.id;
    els.recentList.appendChild(fragment);
  }
}

function render() {
  renderGauge();
  renderMiniTrend();
  renderRecent();
}

els.nowButton.addEventListener("click", () => setDateTimeInputNow(els.doseTime));
els.doseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const tabletCount = Number.parseFloat(els.doseAmount.value);
  if (!Number.isFinite(tabletCount) || tabletCount <= 0) return;
  saveDoseEntry(state, tabletCount, els.doseTime.value, els.doseNote.value);
  els.doseForm.reset();
  setDateTimeInputNow(els.doseTime);
  render();
});
els.noteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!els.journalNote.value.trim()) return;
  saveNoteEntry(state, els.noteTime.value, els.journalNote.value);
  els.noteForm.reset();
  setDateTimeInputNow(els.noteTime);
  render();
});
els.recentList.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-button");
  if (!button) return;
  deleteEntry(state, button.dataset.id);
  render();
});

setDateTimeInputNow(els.doseTime);
setDateTimeInputNow(els.noteTime);
renderInstallPrompt(els.installButton);
registerServiceWorker();
render();
