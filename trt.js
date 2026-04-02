"use strict";

let state = loadState();

const els = {
  trtSerumChart: document.querySelector("#trtSerumChart"),
  trtSerumLegend: document.querySelector("#trtSerumLegend"),
  trtRangeToggle: document.querySelector("#trtRangeToggle"),
  trtDoseForm: document.querySelector("#trtDoseForm"),
  trtCompoundSelect: document.querySelector("#trtCompoundSelect"),
  trtMlInput: document.querySelector("#trtMlInput"),
  trtMgPreview: document.querySelector("#trtMgPreview"),
  trtDoseNote: document.querySelector("#trtDoseNote"),
  trtUseCurrentTime: document.querySelector("#trtUseCurrentTime"),
  trtDateTimeField: document.querySelector("#trtDateTimeField"),
  trtDoseTime: document.querySelector("#trtDoseTime"),
  trtStockMlDisplay: document.querySelector("#trtStockMlDisplay"),
  trtStockVialsDisplay: document.querySelector("#trtStockVialsDisplay"),
  trtRefillAlert: document.querySelector("#trtRefillAlert"),
  trtRestockBtn: document.querySelector("#trtRestockBtn"),
  trtAdjustBtn: document.querySelector("#trtAdjustBtn"),
  trtRestockForm: document.querySelector("#trtRestockForm"),
  trtAdjustForm: document.querySelector("#trtAdjustForm"),
  trtRestockMl: document.querySelector("#trtRestockMl"),
  trtRestockVials: document.querySelector("#trtRestockVials"),
  trtAdjustMl: document.querySelector("#trtAdjustMl"),
  trtRecentList: document.querySelector("#trtRecentList"),
  trtRecentEmpty: document.querySelector("#trtRecentEmpty"),
};

let currentRange = "month";

// ── Compound dropdown ────────────────────────────────────────────────
function populateCompoundSelect() {
  if (!els.trtCompoundSelect) return;
  const compounds = state.settings.trtCompounds || [];
  els.trtCompoundSelect.innerHTML = "";
  if (!compounds.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No compounds configured — add in Settings";
    opt.disabled = true;
    opt.selected = true;
    els.trtCompoundSelect.appendChild(opt);
    return;
  }
  const defaultId = state.settings.trtDefaultCompoundId || "";
  for (const c of compounds) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.mgPerMl} mg/mL)`;
    opt.dataset.mgPerMl = c.mgPerMl;
    opt.dataset.halfLifeHours = c.halfLifeHours;
    opt.dataset.absorptionHalfLifeHours = c.absorptionHalfLifeHours || 0;
    opt.dataset.name = c.name;
    if (c.id === defaultId) opt.selected = true;
    els.trtCompoundSelect.appendChild(opt);
  }
  updateMgPreview();
}

function getSelectedCompound() {
  const opt = els.trtCompoundSelect?.selectedOptions[0];
  if (!opt || !opt.value) return null;
  return {
    id: opt.value,
    name: opt.dataset.name,
    mgPerMl: Number(opt.dataset.mgPerMl) || 200,
    halfLifeHours: Number(opt.dataset.halfLifeHours) || 192,
    absorptionHalfLifeHours: Number(opt.dataset.absorptionHalfLifeHours) || 0,
  };
}

function updateMgPreview() {
  const compound = getSelectedCompound();
  const ml = Number(els.trtMlInput?.value) || 0;
  const mg = compound ? ml * compound.mgPerMl : 0;
  if (els.trtMgPreview) {
    els.trtMgPreview.textContent = `= ${mg.toFixed(0)} mg`;
    els.trtMgPreview.classList.toggle("has-value", mg > 0);
  }
}

// ── Serum Level Chart ────────────────────────────────────────────────
function getRangeMs() {
  const now = Date.now();
  const pastDays = currentRange === "week" ? 7 : currentRange === "month" ? 30 : 90;
  const pastMs = pastDays * DAY_MS;
  const futureMs = pastMs * 0.15;
  return { start: now - pastMs, end: now + futureMs, now };
}

function renderSerumChart() {
  if (!els.trtSerumChart) return;
  const { start, end, now } = getRangeMs();
  const series = getTrtSerumLevelSeries(state, start, end, 140);
  const width = 400;
  const chartTop = 10;
  const chartBottom = 220;
  const chartHeight = chartBottom - chartTop;
  const chartLeft = 40;
  const chartRight = 390;
  const chartWidth = chartRight - chartLeft;

  // Find max level for scaling — at least 200 so empty charts look right
  const maxDataLevel = Math.max(...series.map((s) => s.level), 0);
  const maxLevel = Math.max(maxDataLevel * 1.1, 200);

  // Draw color bands
  const bands = TRT_SERUM_BANDS.map((band) => {
    const bandTop = Math.max(band.min, 0);
    const bandBottom = Math.min(band.max, maxLevel);
    if (bandTop >= maxLevel) return "";
    const y1 = chartBottom - (Math.min(bandBottom, maxLevel) / maxLevel) * chartHeight;
    const y2 = chartBottom - (bandTop / maxLevel) * chartHeight;
    const h = y2 - y1;
    return `<rect x="${chartLeft}" y="${y1}" width="${chartWidth}" height="${h}" fill="${band.color}" />`;
  }).join("");

  // Band labels on right edge
  const bandLabels = TRT_SERUM_BANDS.map((band) => {
    const mid = (band.min + Math.min(band.max, maxLevel)) / 2;
    if (mid > maxLevel) return "";
    const y = chartBottom - (mid / maxLevel) * chartHeight;
    return `<text x="${chartRight + 2}" y="${y + 3}" fill="${band.textColor}" font-size="8" font-weight="600" opacity="0.7">${band.label}</text>`;
  }).join("");

  // Y-axis labels
  const yTickCount = 4;
  const yTicks = [];
  for (let i = 0; i <= yTickCount; i++) {
    const val = (maxLevel / yTickCount) * i;
    const y = chartBottom - (val / maxLevel) * chartHeight;
    yTicks.push(`<text x="${chartLeft - 4}" y="${y + 3}" text-anchor="end" fill="rgba(90,72,56,0.5)" font-size="9">${Math.round(val)}</text>`);
    yTicks.push(`<line x1="${chartLeft}" y1="${y}" x2="${chartRight}" y2="${y}" stroke="rgba(90,72,56,0.08)" stroke-width="0.5" />`);
  }

  // Plot the serum curve — split into past (green) and future (gray)
  let points = "";
  let area = "";
  const nowX = chartLeft + ((now - start) / (end - start)) * chartWidth;
  if (series.length > 0) {
    const mapped = series.map((item) => ({
      x: chartLeft + ((item.timestamp - start) / (end - start)) * chartWidth,
      y: chartBottom - (Math.min(item.level, maxLevel) / maxLevel) * chartHeight,
      ts: item.timestamp,
    }));

    // Find the boundary point at "now" by interpolation
    const pastPts = mapped.filter((p) => p.ts <= now);
    const futurePts = mapped.filter((p) => p.ts > now);

    // Build past line (green)
    if (pastPts.length > 0) {
      // Add interpolated "now" point if future data exists
      const pastWithNow = [...pastPts];
      if (futurePts.length > 0) {
        pastWithNow.push({ x: nowX, y: futurePts[0].y, ts: now });
      }
      const ptsStr = pastWithNow.map((p) => `${p.x},${p.y}`).join(" ");
      points += `<polyline points="${ptsStr}" fill="none" stroke="#2d9d78" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;
      const lastPastX = pastWithNow[pastWithNow.length - 1].x;
      area += `<polygon points="${chartLeft},${chartBottom} ${ptsStr} ${lastPastX},${chartBottom}" fill="url(#trtSerumGrad)" />`;
    }

    // Build future line (gray)
    if (futurePts.length > 0) {
      const futureWithNow = [{ x: nowX, y: futurePts[0].y, ts: now }, ...futurePts];
      const ptsStr = futureWithNow.map((p) => `${p.x},${p.y}`).join(" ");
      points += `<polyline points="${ptsStr}" fill="none" stroke="rgba(120,120,120,0.6)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="6 4" />`;
      area += `<polygon points="${nowX},${chartBottom} ${ptsStr} ${chartRight},${chartBottom}" fill="url(#trtSerumGradFuture)" />`;
    }
  }

  // Dose markers
  const doseMarkers = getTrtDoseEntries(state)
    .filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return t >= start && t <= end;
    })
    .map((e) => {
      const t = new Date(e.timestamp).getTime();
      const x = chartLeft + ((t - start) / (end - start)) * chartWidth;
      return `<line x1="${x}" y1="${chartTop}" x2="${x}" y2="${chartBottom}" stroke="rgba(45,157,120,0.5)" stroke-width="1.5" stroke-dasharray="3 4" />`;
    })
    .join("");

  // X-axis time labels
  const xTicks = getSerumXTicks(start, end);

  const xTickMarks = xTicks.map((tick) => {
    const x = chartLeft + ((tick.timestamp - start) / (end - start)) * chartWidth;
    return `<line x1="${x}" y1="${chartBottom}" x2="${x}" y2="${chartBottom + 5}" stroke="rgba(90,72,56,0.15)" stroke-width="1" />`;
  }).join("");

  const xTickLabels = xTicks.map((tick) => {
    const x = chartLeft + ((tick.timestamp - start) / (end - start)) * chartWidth;
    return `<text x="${x}" y="${chartBottom + 16}" text-anchor="middle" fill="rgba(90,72,56,0.5)" font-size="9" font-weight="600">${tick.label}</text>`;
  }).join("");

  els.trtSerumChart.innerHTML = `
    <defs>
      <linearGradient id="trtSerumGrad" x1="0%" x2="0%" y1="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(45,157,120,0.28)" />
        <stop offset="100%" stop-color="rgba(45,157,120,0.03)" />
      </linearGradient>
      <linearGradient id="trtSerumGradFuture" x1="0%" x2="0%" y1="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(120,120,120,0.15)" />
        <stop offset="100%" stop-color="rgba(120,120,120,0.02)" />
      </linearGradient>
    </defs>
    <line x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight}" y2="${chartBottom}" stroke="rgba(90,72,56,0.15)" stroke-width="1.4" />
    ${bands}
    ${bandLabels}
    ${yTicks.join("")}
    ${doseMarkers}
    ${area}
    ${points}
    <line x1="${nowX}" y1="${chartTop}" x2="${nowX}" y2="${chartBottom}" stroke="rgba(90,72,56,0.25)" stroke-width="1" stroke-dasharray="4 3" />
    ${xTickMarks}
    ${xTickLabels}
  `;


  // Legend
  // "Current" = level at now, not at end of future projection
  const pastSeries = series.filter((s) => s.timestamp <= now);
  const currentLevel = pastSeries.length ? pastSeries[pastSeries.length - 1].level : 0;
  const peakLevel = Math.max(...pastSeries.map((s) => s.level), 0);
  const troughLevel = pastSeries.length ? Math.min(...pastSeries.filter((s) => s.level > 0).map((s) => s.level)) : 0;
  if (els.trtSerumLegend) {
    const parts = [`Current: ${currentLevel.toFixed(0)} mg`];
    if (peakLevel > 0) parts.push(`peak: ${peakLevel.toFixed(0)} mg`);
    if (troughLevel > 0 && troughLevel < Infinity) parts.push(`trough: ${troughLevel.toFixed(0)} mg`);
    els.trtSerumLegend.textContent = parts.join(" · ");
  }
}

function getSerumXTicks(startMs, endMs) {
  const range = endMs - startMs;
  const ticks = [];

  if (range <= 10 * DAY_MS) {
    // Week view: daily ticks
    const cursor = new Date(startMs);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= endMs) {
      if (cursor.getTime() >= startMs) {
        ticks.push({
          timestamp: cursor.getTime(),
          label: cursor.toLocaleDateString(undefined, { weekday: "short" }),
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (range <= 40 * DAY_MS) {
    // Month view: weekly ticks
    const cursor = new Date(startMs);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= endMs) {
      if (cursor.getTime() >= startMs) {
        ticks.push({
          timestamp: cursor.getTime(),
          label: cursor.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        });
      }
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    // 3-month view: biweekly ticks
    const cursor = new Date(startMs);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= endMs) {
      if (cursor.getTime() >= startMs) {
        ticks.push({
          timestamp: cursor.getTime(),
          label: cursor.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        });
      }
      cursor.setDate(cursor.getDate() + 14);
    }
  }

  return ticks;
}

// ── Stock display ────────────────────────────────────────────────────
function renderStock() {
  const stock = getTrtStockStatus(state);
  if (els.trtStockMlDisplay) els.trtStockMlDisplay.textContent = stock.ml.toFixed(1);
  if (els.trtStockVialsDisplay) els.trtStockVialsDisplay.textContent = stock.vials;
  if (els.trtRefillAlert) els.trtRefillAlert.classList.toggle("hidden", !stock.needsRefill);
}

// ── Recent injections ────────────────────────────────────────────────
function renderRecent() {
  const doses = getTrtDoseEntries(state)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 20);

  if (els.trtRecentEmpty) els.trtRecentEmpty.classList.toggle("hidden", doses.length > 0);
  if (!els.trtRecentList) return;

  // Keep the header row, clear the rest
  const header = els.trtRecentList.querySelector(".recent-table-head");
  const headerClone = header?.cloneNode(true);
  els.trtRecentList.innerHTML = "";
  if (headerClone) els.trtRecentList.appendChild(headerClone);

  for (const dose of doses) {
    const row = document.createElement("article");
    row.className = "recent-row trt-recent-row";
    const date = new Date(dose.timestamp);
    const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const timeStr = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    row.innerHTML = `
      <p class="history-time">${dateStr} ${timeStr}</p>
      <span class="history-compound">${dose.compoundName || "Unknown"}</span>
      <strong class="history-dose">${dose.ml} mL · ${dose.mg} mg</strong>
    `;
    els.trtRecentList.appendChild(row);
  }
}

// ── Main render ──────────────────────────────────────────────────────
function render() {
  populateCompoundSelect();
  renderSerumChart();
  renderStock();
  renderRecent();
}

// ── Event listeners ──────────────────────────────────────────────────

// Range toggle
els.trtRangeToggle?.addEventListener("click", (event) => {
  const btn = event.target.closest(".trt-range-btn");
  if (!btn) return;
  currentRange = btn.dataset.range;
  els.trtRangeToggle.querySelectorAll(".trt-range-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderSerumChart();
});

// mL input → mg preview
els.trtMlInput?.addEventListener("input", updateMgPreview);
els.trtCompoundSelect?.addEventListener("change", updateMgPreview);

// Time toggle
els.trtUseCurrentTime?.addEventListener("change", () => {
  els.trtDateTimeField?.classList.toggle("hidden", els.trtUseCurrentTime.checked);
});

// Dose form submit
els.trtDoseForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const compound = getSelectedCompound();
  if (!compound) {
    showToast("Select a compound first. Add compounds in Settings.", "error");
    return;
  }
  const ml = Number(els.trtMlInput?.value);
  if (!ml || ml <= 0) {
    showToast("Enter the volume in mL.", "error");
    return;
  }
  const mg = ml * compound.mgPerMl;
  const timestamp = els.trtUseCurrentTime?.checked
    ? new Date().toISOString()
    : (els.trtDoseTime?.value || new Date().toISOString());
  const note = els.trtDoseNote?.value?.trim() || "";

  saveTrtDoseEntry(state, compound.id, compound.name, ml, mg, compound.halfLifeHours, compound.absorptionHalfLifeHours, timestamp, note);

  // Reset form
  if (els.trtMlInput) els.trtMlInput.value = "";
  if (els.trtDoseNote) els.trtDoseNote.value = "";
  updateMgPreview();
  render();
  showToast(`Logged ${ml} mL ${compound.name} (${mg.toFixed(0)} mg)`, "success");
});

// Restock toggle + form
els.trtRestockBtn?.addEventListener("click", () => {
  els.trtRestockForm?.classList.toggle("hidden");
  els.trtAdjustForm?.classList.add("hidden");
});

els.trtAdjustBtn?.addEventListener("click", () => {
  els.trtAdjustForm?.classList.toggle("hidden");
  els.trtRestockForm?.classList.add("hidden");
});

els.trtRestockForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const ml = Number(els.trtRestockMl?.value) || 0;
  const vials = Number(els.trtRestockVials?.value) || 0;
  if (ml <= 0 && vials <= 0) {
    showToast("Enter mL or vials received.", "error");
    return;
  }
  saveTrtRestockEntry(state, ml, vials, new Date().toISOString(), "");
  els.trtRestockForm.classList.add("hidden");
  if (els.trtRestockMl) els.trtRestockMl.value = "";
  if (els.trtRestockVials) els.trtRestockVials.value = "";
  render();
  showToast(`Restocked ${ml} mL, ${vials} vial(s)`, "success");
});

els.trtAdjustForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const ml = Number(els.trtAdjustMl?.value) || 0;
  if (ml === 0) {
    showToast("Enter an adjustment amount.", "error");
    return;
  }
  saveTrtAdjustmentEntry(state, ml, new Date().toISOString(), "");
  els.trtAdjustForm.classList.add("hidden");
  if (els.trtAdjustMl) els.trtAdjustMl.value = "";
  render();
  showToast(`Stock adjusted by ${ml > 0 ? "+" : ""}${ml} mL`, "success");
});

// ── Init ─────────────────────────────────────────────────────────────
(async () => {
  render();
  try {
    await loadRemoteStateInto(state);
  } catch (error) {
    console.error("Remote sync failed", error);
  }
  render();
  registerServiceWorker();
})();
