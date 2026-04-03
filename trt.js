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
  trtPlannerChart: document.querySelector("#trtPlannerChart"),
  trtPlannerLegend: document.querySelector("#trtPlannerLegend"),
  trtPlannerRangeToggle: document.querySelector("#trtPlannerRangeToggle"),
  trtPlannerForm: document.querySelector("#trtPlannerForm"),
  trtPlannerCompoundSelect: document.querySelector("#trtPlannerCompoundSelect"),
  trtPlannerMlInput: document.querySelector("#trtPlannerMlInput"),
  trtPlannerFreqDays: document.querySelector("#trtPlannerFreqDays"),
  trtPlannerMaxDoses: document.querySelector("#trtPlannerMaxDoses"),
  trtPlannerScheduleList: document.querySelector("#trtPlannerScheduleList"),
};

let currentRange = "month";
let plannerRange = "month";

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
  const chartTop = 10;
  const chartBottom = 220;
  const chartHeight = chartBottom - chartTop;
  const chartLeft = 4;
  const chartRight = 398;
  const chartWidth = chartRight - chartLeft;

  // Find max level for scaling — at least 150 so empty charts look right
  const maxDataLevel = Math.max(...series.map((s) => s.level), 0);
  const rawMax = Math.max(maxDataLevel * 1.1, 150);
  // Round up to nearest clean step so axis ticks align
  const yStep = rawMax <= 200 ? 25 : rawMax <= 400 ? 50 : 100;
  const maxLevel = Math.ceil(rawMax / yStep) * yStep;

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

  // Band labels inside chart (right-aligned)
  const bandLabels = TRT_SERUM_BANDS.map((band) => {
    const mid = (band.min + Math.min(band.max, maxLevel)) / 2;
    if (mid > maxLevel) return "";
    const y = chartBottom - (mid / maxLevel) * chartHeight;
    return `<text x="${chartRight - 4}" y="${y + 3}" text-anchor="end" fill="${band.textColor}" font-size="8" font-weight="600" opacity="0.45">${band.label}</text>`;
  }).join("");

  // Y-axis labels — use clean multiples of 25 or 50
  const yTicks = [];
  for (let val = 0; val <= maxLevel; val += yStep) {
    const y = chartBottom - (val / maxLevel) * chartHeight;
    yTicks.push(`<text x="${chartLeft + 4}" y="${y - 4}" text-anchor="start" fill="rgba(90,72,56,0.45)" font-size="8">${val}</text>`);
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
    const parts = [`Current: ${currentLevel.toFixed(0)} mg/wk eq.`];
    if (peakLevel > 0) parts.push(`peak: ${peakLevel.toFixed(0)}`);
    if (troughLevel > 0 && troughLevel < Infinity) parts.push(`trough: ${troughLevel.toFixed(0)}`);
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

// ── Dose Planner ────────────────────────────────────────────────────

function getPlannerRangeMs() {
  const now = Date.now();
  const futureDays = plannerRange === "week" ? 7 : plannerRange === "month" ? 30 : 90;
  const futureMs = futureDays * DAY_MS;
  const pastMs = futureMs * 0.15;
  return { start: now - pastMs, end: now + futureMs, now };
}

function generateFuturePlannerDoses(startMs, endMs) {
  const now = Date.now();
  const schedules = state.settings.trtPlannerSchedules || [];
  const compounds = state.settings.trtCompounds || [];
  const doses = [];
  for (const sched of schedules) {
    const comp = compounds.find((c) => c.id === sched.compoundId);
    const mgPerMl = comp ? comp.mgPerMl : sched.mgPerMl || 200;
    const halfLifeHours = comp ? comp.halfLifeHours : sched.halfLifeHours || 192;
    const absorptionHalfLifeHours = comp ? (comp.absorptionHalfLifeHours || 0) : (sched.absorptionHalfLifeHours || 0);
    const mg = sched.ml * mgPerMl;
    const freqMs = sched.frequencyDays * DAY_MS;
    const maxDoses = sched.maxDoses || 0;
    let t = now;
    let count = 0;
    while (t <= endMs) {
      if (maxDoses > 0 && count >= maxDoses) break;
      doses.push({
        timestamp: new Date(t).toISOString(),
        mg,
        ml: sched.ml,
        halfLifeHours,
        absorptionHalfLifeHours,
        compoundId: sched.compoundId,
        compoundName: sched.compoundName,
      });
      count++;
      t += freqMs;
    }
  }
  return doses;
}

function getPlannerSerumSeries(plannerDoses, startMs, endMs, points = 140) {
  const series = [];
  for (let i = 0; i < points; i++) {
    const timestamp = startMs + (i / (points - 1)) * (endMs - startMs);
    let level = 0;
    for (const dose of plannerDoses) {
      const doseTime = new Date(dose.timestamp).getTime();
      if (doseTime > timestamp) continue;
      const elapsedHours = (timestamp - doseTime) / (60 * 60 * 1000);
      const mg = dose.mg;
      const ke = Math.log(2) / Math.max(dose.halfLifeHours || 192, 0.1);
      const weeklyScale = ke * 168;
      const absHL = dose.absorptionHalfLifeHours || 0;
      if (absHL > 0) {
        const ka = Math.log(2) / absHL;
        if (Math.abs(ka - ke) < 1e-6) {
          level += mg * ke * elapsedHours * Math.exp(-ke * elapsedHours) * weeklyScale;
        } else {
          level += mg * (ka / (ka - ke)) * (Math.exp(-ke * elapsedHours) - Math.exp(-ka * elapsedHours)) * weeklyScale;
        }
      } else {
        level += mg * Math.exp(-ke * elapsedHours) * weeklyScale;
      }
    }
    series.push({ timestamp, level });
  }
  return series;
}

function renderPlannerChart() {
  if (!els.trtPlannerChart) return;
  const { start, end, now } = getPlannerRangeMs();
  // Combine real historical doses with future planned doses
  const futureDoses = generateFuturePlannerDoses(start, end);
  const realDoses = getTrtDoseEntries(state).map((e) => ({
    timestamp: e.timestamp,
    mg: e.mg,
    ml: e.ml,
    halfLifeHours: e.halfLifeHours,
    absorptionHalfLifeHours: e.absorptionHalfLifeHours || 0,
    compoundId: e.compoundId,
    compoundName: e.compoundName,
  }));
  const allDoses = [...realDoses, ...futureDoses];
  const series = getPlannerSerumSeries(allDoses, start, end, 140);

  const chartTop = 10, chartBottom = 220, chartHeight = chartBottom - chartTop;
  const chartLeft = 4, chartRight = 398, chartWidth = chartRight - chartLeft;

  const maxDataLevel = Math.max(...series.map((s) => s.level), 0);
  const rawMax = Math.max(maxDataLevel * 1.1, 150);
  const yStep = rawMax <= 200 ? 25 : rawMax <= 400 ? 50 : 100;
  const maxLevel = Math.ceil(rawMax / yStep) * yStep;

  const bands = TRT_SERUM_BANDS.map((band) => {
    const bandTop = Math.max(band.min, 0);
    const bandBottom = Math.min(band.max, maxLevel);
    if (bandTop >= maxLevel) return "";
    const y1 = chartBottom - (Math.min(bandBottom, maxLevel) / maxLevel) * chartHeight;
    const y2 = chartBottom - (bandTop / maxLevel) * chartHeight;
    return `<rect x="${chartLeft}" y="${y1}" width="${chartWidth}" height="${y2 - y1}" fill="${band.color}" />`;
  }).join("");

  const bandLabels = TRT_SERUM_BANDS.map((band) => {
    const mid = (band.min + Math.min(band.max, maxLevel)) / 2;
    if (mid > maxLevel) return "";
    const y = chartBottom - (mid / maxLevel) * chartHeight;
    return `<text x="${chartRight - 4}" y="${y + 3}" text-anchor="end" fill="${band.textColor}" font-size="8" font-weight="600" opacity="0.45">${band.label}</text>`;
  }).join("");

  const yTicks = [];
  for (let val = 0; val <= maxLevel; val += yStep) {
    const y = chartBottom - (val / maxLevel) * chartHeight;
    yTicks.push(`<text x="${chartLeft + 4}" y="${y - 4}" text-anchor="start" fill="rgba(90,72,56,0.45)" font-size="8">${val}</text>`);
    yTicks.push(`<line x1="${chartLeft}" y1="${y}" x2="${chartRight}" y2="${y}" stroke="rgba(90,72,56,0.08)" stroke-width="0.5" />`);
  }

  const nowX = chartLeft + ((now - start) / (end - start)) * chartWidth;

  let points = "", area = "";
  if (series.length > 0) {
    const mapped = series.map((item) => ({
      x: chartLeft + ((item.timestamp - start) / (end - start)) * chartWidth,
      y: chartBottom - (Math.min(item.level, maxLevel) / maxLevel) * chartHeight,
      ts: item.timestamp,
    }));

    const pastPts = mapped.filter((p) => p.ts <= now);
    const futurePts = mapped.filter((p) => p.ts > now);

    if (pastPts.length > 0) {
      const pastWithNow = [...pastPts];
      if (futurePts.length > 0) pastWithNow.push({ x: nowX, y: futurePts[0].y, ts: now });
      const ptsStr = pastWithNow.map((p) => `${p.x},${p.y}`).join(" ");
      points += `<polyline points="${ptsStr}" fill="none" stroke="#2d9d78" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;
      const lastPastX = pastWithNow[pastWithNow.length - 1].x;
      area += `<polygon points="${chartLeft},${chartBottom} ${ptsStr} ${lastPastX},${chartBottom}" fill="url(#plannerGradPast)" />`;
    }

    if (futurePts.length > 0) {
      const futureWithNow = [{ x: nowX, y: futurePts[0].y, ts: now }, ...futurePts];
      const ptsStr = futureWithNow.map((p) => `${p.x},${p.y}`).join(" ");
      points += `<polyline points="${ptsStr}" fill="none" stroke="rgba(120,120,120,0.6)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="6 4" />`;
      area += `<polygon points="${nowX},${chartBottom} ${ptsStr} ${chartRight},${chartBottom}" fill="url(#plannerGradFuture)" />`;
    }
  }

  // Dose markers: real past doses (green) + future planned doses (purple)
  const realDoseMarkers = getTrtDoseEntries(state)
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
  const futureDoseMarkers = futureDoses
    .filter((d) => {
      const t = new Date(d.timestamp).getTime();
      return t >= start && t <= end;
    })
    .map((d) => {
      const t = new Date(d.timestamp).getTime();
      const x = chartLeft + ((t - start) / (end - start)) * chartWidth;
      return `<line x1="${x}" y1="${chartTop}" x2="${x}" y2="${chartBottom}" stroke="rgba(120,120,120,0.4)" stroke-width="1.5" stroke-dasharray="3 4" />`;
    })
    .join("");
  const doseMarkers = realDoseMarkers + futureDoseMarkers;

  const xTicks = getSerumXTicks(start, end);
  const xTickMarks = xTicks.map((tick) => {
    const x = chartLeft + ((tick.timestamp - start) / (end - start)) * chartWidth;
    return `<line x1="${x}" y1="${chartBottom}" x2="${x}" y2="${chartBottom + 5}" stroke="rgba(90,72,56,0.15)" stroke-width="1" />`;
  }).join("");
  const xTickLabels = xTicks.map((tick) => {
    const x = chartLeft + ((tick.timestamp - start) / (end - start)) * chartWidth;
    return `<text x="${x}" y="${chartBottom + 16}" text-anchor="middle" fill="rgba(90,72,56,0.5)" font-size="9" font-weight="600">${tick.label}</text>`;
  }).join("");

  els.trtPlannerChart.innerHTML = `
    <defs>
      <linearGradient id="plannerGradPast" x1="0%" x2="0%" y1="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(45,157,120,0.28)" />
        <stop offset="100%" stop-color="rgba(45,157,120,0.03)" />
      </linearGradient>
      <linearGradient id="plannerGradFuture" x1="0%" x2="0%" y1="0%" y2="100%">
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

  // Legend: peak and trough from future projection
  const futureSeries = series.filter((s) => s.timestamp > now);
  const peakLevel = futureSeries.length ? Math.max(...futureSeries.map((s) => s.level)) : 0;
  const troughLevel = futureSeries.length ? Math.min(...futureSeries.filter((s) => s.level > 0).map((s) => s.level)) : 0;
  if (els.trtPlannerLegend) {
    if (!futureSeries.length || peakLevel === 0) {
      els.trtPlannerLegend.textContent = "Add a schedule below to see projections";
    } else {
      const parts = [];
      if (peakLevel > 0) parts.push(`peak: ${peakLevel.toFixed(0)} mg/wk eq.`);
      if (troughLevel > 0 && troughLevel < Infinity) parts.push(`trough: ${troughLevel.toFixed(0)}`);
      els.trtPlannerLegend.textContent = parts.join(" · ");
    }
  }
}

function populatePlannerCompoundSelect() {
  if (!els.trtPlannerCompoundSelect) return;
  const compounds = state.settings.trtCompounds || [];
  els.trtPlannerCompoundSelect.innerHTML = "";
  if (!compounds.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No compounds configured";
    opt.disabled = true;
    opt.selected = true;
    els.trtPlannerCompoundSelect.appendChild(opt);
    return;
  }
  const defaultId = state.settings.trtDefaultCompoundId || "";
  for (const c of compounds) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.mgPerMl} mg/mL)`;
    if (c.id === defaultId) opt.selected = true;
    els.trtPlannerCompoundSelect.appendChild(opt);
  }
}

function renderPlannerScheduleList() {
  if (!els.trtPlannerScheduleList) return;
  const schedules = state.settings.trtPlannerSchedules || [];
  if (!schedules.length) {
    els.trtPlannerScheduleList.innerHTML = "";
    return;
  }
  const compounds = state.settings.trtCompounds || [];
  els.trtPlannerScheduleList.innerHTML = schedules.map((sched) => {
    const comp = compounds.find((c) => c.id === sched.compoundId);
    const mgPerMl = comp ? comp.mgPerMl : sched.mgPerMl || 200;
    const mg = (sched.ml * mgPerMl).toFixed(0);
    const name = comp ? comp.name : sched.compoundName || "Unknown";
    return `<div class="trt-planner-schedule-row" data-id="${sched.id}">
      <div class="trt-planner-schedule-info">
        <strong>${name}</strong>
        <span>${sched.ml} mL (${mg} mg) every ${sched.frequencyDays} day${sched.frequencyDays === 1 ? "" : "s"}${sched.maxDoses ? ` × ${sched.maxDoses} dose${sched.maxDoses === 1 ? "" : "s"}` : ""}</span>
      </div>
      <button class="ghost-button trt-planner-delete-btn" type="button" aria-label="Remove schedule">✕</button>
    </div>`;
  }).join("");
}

// ── Stock display ────────────────────────────────────────────────────
function renderStock() {
  const stock = getTrtStockStatus(state);
  if (els.trtStockMlDisplay) els.trtStockMlDisplay.textContent = stock.ml.toFixed(1);
  if (els.trtStockVialsDisplay) els.trtStockVialsDisplay.textContent = stock.vials;
  if (els.trtRefillAlert) els.trtRefillAlert.classList.toggle("hidden", !stock.needsRefill);
}

// ── Main render ──────────────────────────────────────────────────────
function render() {
  populateCompoundSelect();
  populatePlannerCompoundSelect();
  renderSerumChart();
  renderPlannerChart();
  renderPlannerScheduleList();
  renderStock();
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

// Planner range toggle
els.trtPlannerRangeToggle?.addEventListener("click", (event) => {
  const btn = event.target.closest(".trt-range-btn");
  if (!btn) return;
  plannerRange = btn.dataset.range;
  els.trtPlannerRangeToggle.querySelectorAll(".trt-range-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderPlannerChart();
});

// Planner form submit
els.trtPlannerForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const opt = els.trtPlannerCompoundSelect?.selectedOptions[0];
  if (!opt || !opt.value) {
    showToast("Select a compound first.", "error");
    return;
  }
  const ml = Number(els.trtPlannerMlInput?.value);
  if (!ml || ml <= 0) {
    showToast("Enter the volume in mL.", "error");
    return;
  }
  const freqDays = Number(els.trtPlannerFreqDays?.value) || 3;
  if (freqDays < 1) {
    showToast("Frequency must be at least 1 day.", "error");
    return;
  }
  const comp = (state.settings.trtCompounds || []).find((c) => c.id === opt.value);
  const maxDosesRaw = els.trtPlannerMaxDoses?.value?.trim();
  const repeatVal = maxDosesRaw === "" ? null : Math.max(0, Math.floor(Number(maxDosesRaw)));
  const schedule = {
    id: crypto.randomUUID(),
    compoundId: opt.value,
    compoundName: comp ? comp.name : opt.textContent,
    ml,
    mgPerMl: comp ? comp.mgPerMl : 200,
    halfLifeHours: comp ? comp.halfLifeHours : 192,
    absorptionHalfLifeHours: comp ? (comp.absorptionHalfLifeHours || 0) : 0,
    frequencyDays: freqDays,
    maxDoses: repeatVal !== null ? repeatVal + 1 : 0,
    startTimestamp: Date.now(),
  };
  if (!state.settings.trtPlannerSchedules) state.settings.trtPlannerSchedules = [];
  state.settings.trtPlannerSchedules.push(schedule);
  persistState(state);
  queueRemoteSync(state);

  if (els.trtPlannerMlInput) els.trtPlannerMlInput.value = "";
  if (els.trtPlannerMaxDoses) els.trtPlannerMaxDoses.value = "";
  renderPlannerChart();
  renderPlannerScheduleList();
  showToast(`Added: ${comp ? comp.name : "Compound"} ${ml} mL every ${freqDays}d${repeatVal !== null ? ` (${repeatVal === 0 ? "once" : repeatVal + 1 + " doses"})` : ""}`, "success");
});

// Planner schedule delete (event delegation)
els.trtPlannerScheduleList?.addEventListener("click", (event) => {
  const btn = event.target.closest(".trt-planner-delete-btn");
  if (!btn) return;
  const row = btn.closest(".trt-planner-schedule-row");
  const id = row?.dataset.id;
  if (!id) return;
  state.settings.trtPlannerSchedules = (state.settings.trtPlannerSchedules || []).filter((s) => s.id !== id);
  persistState(state);
  queueRemoteSync(state);
  renderPlannerChart();
  renderPlannerScheduleList();
  showToast("Schedule removed", "success");
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
