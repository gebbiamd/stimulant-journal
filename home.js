"use strict";

let state = loadState();
if (consumeOuraRedirect(state)) {
  state = loadState();
}
const AI_CHAT_STORAGE_KEY = "stimulant-journal-ai-chat-v1";
const AI_SUMMARY_STORAGE_KEY = "stimulant-journal-ai-summary-v1";
let aiChatMessages = [];

const els = {
  installButton: document.querySelector("#installButton"),
  doseForm: document.querySelector("#doseForm"),
  doseAmount: document.querySelector("#doseAmount"),
  doseTime: document.querySelector("#doseTime"),
  doseNote: document.querySelector("#doseNote"),
  doseMgHint: document.querySelector("#doseMgHint"),
  nowButton: document.querySelector("#nowButton"),
  syncOuraHomeButton: document.querySelector("#syncOuraHomeButton"),
  doseUnitLabel: document.querySelector("#doseUnitLabel"),
  headerCard: document.querySelector(".header-card"),
  tabletTrack: document.querySelector("#tabletTrack"),
  todayTotal: document.querySelector("#todayTotal"),
  todayUnit: document.querySelector("#todayUnit"),
  todayEntries: document.querySelector("#todayEntries"),
  todayLastDose: document.querySelector("#todayLastDose"),
  todayGaugeBadge: document.querySelector("#todayGaugeBadge"),
  todayGaugeLabel: document.querySelector("#todayGaugeLabel"),
  gaugeReason: document.querySelector("#gaugeReason"),
  monthTabletUsage: document.querySelector("#monthTabletUsage"),
  monthTabletUsageFill: document.querySelector("#monthTabletUsageFill"),
  rxBottleSvg: document.querySelector("#rxBottleSvg"),
  rxBottleSub: document.querySelector("#rxBottleSub"),
  lastSleepHeadline: document.querySelector("#lastSleepHeadline"),
  lastSleepDetail: document.querySelector("#lastSleepDetail"),
  lastSleepChip: document.querySelector("#lastSleepHeadline")?.closest(".stat-chip"),
  recoveryContextChip: document.querySelector("#recoveryContextChip"),
  recoveryContextLabel: document.querySelector("#recoveryContextLabel"),
  recoveryContextHeadline: document.querySelector("#recoveryContextHeadline"),
  recoveryContextDetail: document.querySelector("#recoveryContextDetail"),
  doseRecommendationHeadline: document.querySelector("#doseRecommendationHeadline"),
  doseRecommendationDetail: document.querySelector("#doseRecommendationDetail"),
  miniTrendChart: document.querySelector("#miniTrendChart"),
  miniTrendAxis: document.querySelector("#miniTrendAxis"),
  miniTrendLegend: document.querySelector("#miniTrendLegend"),
  recentList: document.querySelector("#recentList"),
  recentEmpty: document.querySelector("#recentEmpty"),
  generateSummaryButton: document.querySelector("#generateSummaryButton"),
  aiSummaryMeta: document.querySelector("#aiSummaryMeta"),
  aiSummaryBox: document.querySelector("#aiSummaryBox"),
  aiChatHistory: document.querySelector("#aiChatHistory"),
  aiChatForm: document.querySelector("#aiChatForm"),
  aiChatInput: document.querySelector("#aiChatInput"),
  aiChatSendButton: document.querySelector("#aiChatSendButton"),
  activityItemTemplate: document.querySelector("#activityItemTemplate"),
  paceGaugeMo: document.querySelector("#paceGaugeMo"),
  paceGauge7d: document.querySelector("#paceGauge7d"),
  paceGaugeMonthSub: document.querySelector("#paceGaugeMonthSub"),
  paceGaugeMonthChip: document.querySelector("#paceGaugeMonthChip"),
  paceGauge7dChip: document.querySelector("#paceGauge7dChip"),
};

function loadAiChatMessages() {
  try {
    const raw = localStorage.getItem(AI_CHAT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.role === "string" && typeof item.content === "string") : [];
  } catch {
    return [];
  }
}

function persistAiChatMessages() {
  localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(aiChatMessages.slice(-12)));
}

function loadSavedAiSummary() {
  try {
    const raw = localStorage.getItem(AI_SUMMARY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed.summary !== "string") return null;
    return {
      summary: parsed.summary,
      generatedAt: parsed.generatedAt || "",
    };
  } catch {
    return null;
  }
}

function persistAiSummary(summary, generatedAt) {
  localStorage.setItem(AI_SUMMARY_STORAGE_KEY, JSON.stringify({ summary, generatedAt }));
}

function extractRecommendationLines(summary) {
  return String(summary || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^recommendations?:/i.test(line))
    .filter((line) => {
      const normalized = line.toLowerCase();
      return (
        normalized.includes("recommend") ||
        normalized.includes("consider") ||
        normalized.includes("try ") ||
        normalized.includes("avoid") ||
        normalized.includes("limit") ||
        normalized.includes("move ") ||
        normalized.includes("watch ") ||
        normalized.includes("keep ")
      );
    })
    .slice(0, 4);
}

function ensureRecommendationsSection(summary) {
  const text = String(summary || "").trim();
  if (!text) return text;
  if (/recommendations?:/i.test(text)) return text;
  const recommendations = extractRecommendationLines(text);
  if (!recommendations.length) return text;
  return `${text}\n\nRecommendations:\n${recommendations.map((line) => `- ${line.replace(/^[-*]\s+/, "")}`).join("\n")}`;
}

function renderAiSummary(summary, generatedAt = "") {
  if (!els.aiSummaryBox) return;
  if (!summary) {
    els.aiSummaryBox.innerHTML = "Generate a concise summary from recent doses, notes, and imported Oura sleep.";
    if (els.aiSummaryMeta) els.aiSummaryMeta.textContent = "";
    return;
  }
  els.aiSummaryBox.innerHTML = formatAiSummaryHtml(ensureRecommendationsSection(summary));
  if (els.aiSummaryMeta) {
    els.aiSummaryMeta.textContent = generatedAt ? `Last run ${new Date(generatedAt).toLocaleString()}` : "";
  }
}

function renderAiChat() {
  if (!els.aiChatHistory) return;
  els.aiChatHistory.innerHTML = "";
  const messages = aiChatMessages.length
    ? aiChatMessages
    : [{ role: "assistant", content: "Ask things like “How has dose timing lined up with sleep this week?” or “What stands out from the last few short-sleep nights?”" }];

  for (const message of messages) {
    const article = document.createElement("article");
    article.className = `ai-chat-message ${message.role === "user" ? "ai-chat-user" : "ai-chat-assistant"}`;
    article.innerHTML = formatAiSummaryHtml(message.content);
    els.aiChatHistory.appendChild(article);
  }
  els.aiChatHistory.scrollTop = els.aiChatHistory.scrollHeight;
}

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

// ── Tablet SVG constants ─────────────────────────────────────────────
const T_PAD = 10, T_OW = 58, T_OH = 34;
const T_SW  = T_OW + T_PAD * 2, T_SH = T_OH + T_PAD * 2;
const T_CX  = T_SW / 2, T_CY = T_SH / 2;
const T_RX  = T_OW / 2 - 1, T_RY = T_OH / 2 - 1;

function drawTabletSVG(fill, over) {
  const uid = Math.random().toString(36).slice(2, 8);
  const isRed = over && fill > 0;

  const B_LIGHT = "#a8ddf0", B_BASE = "#5ab0d0", B_DARK = "#3a8aaa", B_SPEC = "rgba(58,138,170,0.15)";
  const R_LIGHT = "#f7a0a0", R_BASE = "#d43535", R_DARK = "#a82020", R_SPEC = "rgba(168,32,32,0.12)";
  const LIGHT = isRed ? R_LIGHT : B_LIGHT;
  const BASE  = isRed ? R_BASE  : B_BASE;
  const DARK  = isRed ? R_DARK  : B_DARK;
  const SPEC  = isRed ? R_SPEC  : B_SPEC;
  const SCOL  = isRed ? "#8a1515" : "#2e7a96";
  const EF    = "rgba(0,0,0,0.06)", ES = "rgba(0,0,0,0.13)";

  let s = `<defs>
    <clipPath id="ov${uid}"><ellipse cx="${T_CX}" cy="${T_CY}" rx="${T_RX}" ry="${T_RY}"/></clipPath>
    <radialGradient id="mg${uid}" cx="50%" cy="38%" r="62%">
      <stop offset="0%"   stop-color="${LIGHT}"/>
      <stop offset="55%"  stop-color="${BASE}"/>
      <stop offset="100%" stop-color="${DARK}"/>
    </radialGradient>
    ${isRed ? `<filter id="gl${uid}" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/>
      <feColorMatrix in="blur" type="matrix"
        values="1.8 0 0 0 0.1  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 0" result="cb"/>
      <feMerge><feMergeNode in="cb"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>` : ""}
  </defs>`;

  // ghost shell
  s += `<ellipse cx="${T_CX}" cy="${T_CY}" rx="${T_RX}" ry="${T_RY}" fill="${EF}" stroke="${ES}" stroke-width="1.5"/>`;

  if (fill === 1) {
    s += `<ellipse cx="${T_CX}" cy="${T_CY}" rx="${T_RX}" ry="${T_RY}"
            fill="url(#mg${uid})" ${isRed ? `filter="url(#gl${uid})"` : ""}/>
          <ellipse cx="${T_CX}" cy="${T_CY}" rx="${T_RX}" ry="${T_RY}" fill="${SPEC}" clip-path="url(#ov${uid})"/>
          <line x1="${T_CX}" y1="${T_CY - T_RY + 4}" x2="${T_CX}" y2="${T_CY + T_RY - 4}"
                stroke="${SCOL}" stroke-width="1.8" opacity="0.5" clip-path="url(#ov${uid})"/>
          <line x1="${T_CX + 0.9}" y1="${T_CY - T_RY + 4}" x2="${T_CX + 0.9}" y2="${T_CY + T_RY - 4}"
                stroke="rgba(255,255,255,0.3)" stroke-width="0.9" clip-path="url(#ov${uid})"/>
          <ellipse cx="${T_CX}" cy="${T_CY}" rx="${T_RX}" ry="${T_RY}" fill="none" stroke="${DARK}" stroke-width="1.1" opacity="0.45"/>`;
  } else if (fill === 0.5) {
    s += `<g ${isRed ? `filter="url(#gl${uid})"` : ""}>
            <g clip-path="url(#ov${uid})">
              <rect x="${T_PAD}" y="${T_PAD}" width="${T_OW / 2}" height="${T_OH}" fill="url(#mg${uid})"/>
              <rect x="${T_PAD}" y="${T_PAD}" width="${T_OW / 2}" height="${T_OH}" fill="${SPEC}"/>
            </g>
          </g>
          <line x1="${T_CX}" y1="${T_CY - T_RY + 3}" x2="${T_CX}" y2="${T_CY + T_RY - 3}"
                stroke="${SCOL}" stroke-width="1.8" opacity="0.45" clip-path="url(#ov${uid})"/>
          <line x1="${T_CX + 0.9}" y1="${T_CY - T_RY + 3}" x2="${T_CX + 0.9}" y2="${T_CY + T_RY - 3}"
                stroke="rgba(255,255,255,0.28)" stroke-width="0.9" clip-path="url(#ov${uid})"/>
          <ellipse cx="${T_CX}" cy="${T_CY}" rx="${T_RX}" ry="${T_RY}" fill="none" stroke="${ES}" stroke-width="1.2"/>`;
  }

  return `<svg width="${T_SW}" height="${T_SH}" viewBox="0 0 ${T_SW} ${T_SH}" style="display:block;overflow:visible">${s}</svg>`;
}

function renderTabletTrack(container, taken, dailyLimit) {
  if (!container) return;
  container.innerHTML = "";
  const slots = Math.max(dailyLimit, Math.ceil(taken));
  for (let i = 0; i < slots; i++) {
    const rem  = taken - i;
    const fill = rem >= 1 ? 1 : rem >= 0.5 ? 0.5 : 0;
    const over = i >= dailyLimit && fill > 0;
    const div  = document.createElement("div");
    div.style.display = "flex";
    div.innerHTML = drawTabletSVG(fill, over);
    container.appendChild(div);
  }
  // toggle warning state on parent card
  const card = container.closest(".card");
  if (card) card.classList.toggle("gauge-over", taken > dailyLimit);
}

function renderGauge() {
  const todayEntries = getTodayDoseEntries(state);
  const total = todayEntries.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const totalTablets = todayEntries.reduce((sum, entry) => sum + Number(entry.tabletCount || 0), 0);
  const lastDose = todayEntries[0] ? new Date(todayEntries[0].timestamp) : null;
  const gauge = getHomeGauge(state);
  const tabletUsage = getCurrentMonthTabletUsage(state);
  const visualMax = 50;
  const suggestedCap = 30;
  const visualRatio = total / visualMax;
  const suggestedRatio = total / suggestedCap;

  const dailyLimit = state.settings.dailyTabletLimit || 3;
  const over = totalTablets > dailyLimit;
  const excess = +(totalTablets - dailyLimit).toFixed(1);

  renderTabletTrack(els.tabletTrack, totalTablets, dailyLimit);

  els.todayTotal.textContent = formatNumber(total);
  els.todayUnit.textContent = unitLabel(state);
  if (els.todayEntries) els.todayEntries.textContent = `${todayEntries.length}`;
  els.todayLastDose.textContent = lastDose
    ? lastDose.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "None";
  els.todayGaugeBadge.textContent = over ? `⚠️ +${excess} over` : gauge.label;
  els.todayGaugeBadge.className = `status-badge ${over ? "warning" : gauge.tone}`;
  els.headerCard.className = `card header-card gauge-${over ? "over" : gauge.tone}`;
  els.todayGaugeLabel.textContent = over
    ? `${excess} tablet${excess !== 1 ? "s" : ""} over daily limit`
    : `${tabletLabel(totalTablets)} today • ${Math.round(suggestedRatio * 100)}% of the ${suggestedCap} mg cap`;
  if (els.gaugeReason) els.gaugeReason.textContent = `${gauge.reason} Monthly tablets used: ${formatNumber(tabletUsage.used)} of ${formatNumber(tabletUsage.planned)}.`;
  els.monthTabletUsage.textContent = `${formatNumber(tabletUsage.used)} / ${formatNumber(tabletUsage.planned)}`;
  els.doseUnitLabel.textContent = "tabs";
  els.doseMgHint.textContent = "";

  const recommendation = getDoseRecommendation(state);
  els.doseRecommendationHeadline.textContent = recommendation.headline;
  els.doseRecommendationDetail.textContent = recommendation.detail;

  const latestSleep = getLatestOuraSleep(state);
  if (latestSleep && latestSleep.total_sleep_duration) {
    const sleepHours = Number(latestSleep.total_sleep_duration) / 3600;
    const bedtime = latestSleep.bedtime_start ? new Date(latestSleep.bedtime_start) : null;
    const displayDate = getOuraDisplayDate(latestSleep);
    const todayKey = dateKey(new Date());
    const displayKey = displayDate ? dateKey(displayDate) : "";
    const scoreLabel = latestSleep.score ?? "Pending";
    els.lastSleepHeadline.textContent = `${formatNumber(sleepHours)}h • score ${scoreLabel}`;
    if (displayDate && displayKey !== todayKey) {
      els.lastSleepDetail.textContent = `Newest Oura day ${displayDate.toLocaleDateString()}`;
    } else {
      els.lastSleepDetail.textContent = bedtime
        ? `Bedtime ${bedtime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : "Latest synced Oura sleep";
    }
    if (els.lastSleepChip) {
      applyScoreColor(els.lastSleepChip, Number(latestSleep.score) || null, { good: 85, ok: 70 });
    }
  } else {
    els.lastSleepHeadline.textContent = "No Oura sleep yet";
    els.lastSleepDetail.textContent = "Connect and sync Oura in More Details.";
    if (els.lastSleepChip) {
      applyScoreColor(els.lastSleepChip, null, { good: 85, ok: 70 });
    }
  }
}

function renderMiniTrend() {
  const now = Date.now();
  const windowStart = now - 48 * 60 * 60 * 1000;
  const levels = getDoseDecaySeriesBetween(state, windowStart, now, 73);
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
  const axisTicks = getStaticTimeTicks(windowStart, now);
  const ticks = axisTicks
    .map((tick) => {
      const ratio = (tick.timestamp - windowStart) / (now - windowStart);
      const x = 20 + ratio * (width - 40);
      return `<line x1="${x}" y1="${chartBottom}" x2="${x}" y2="${chartBottom + 6}" stroke="rgba(88,112,143,0.18)" stroke-width="1" />`;
    })
    .join("");
  els.miniTrendAxis.innerHTML = axisTicks
    .map((tick) => {
      const left = ((tick.timestamp - windowStart) / (now - windowStart)) * 100;
      return `<span style="left:${left}%">${tick.label}</span>`;
    })
    .join("");
  const doseMarkers = getDoseEntries(state)
    .filter((entry) => now - new Date(entry.timestamp).getTime() <= 48 * 60 * 60 * 1000)
    .map((entry) => {
      const ratio = (new Date(entry.timestamp).getTime() - windowStart) / (48 * 60 * 60 * 1000);
      const x = 20 + ratio * (width - 40);
      return `<line x1="${x}" y1="${chartTop}" x2="${x}" y2="${chartBottom}" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-dasharray="3 4" />`;
    })
    .join("");
  const nightOverlay = (() => {
    const ouraSegments = getSleepOverlaySegments(state, windowStart, now);
    if (ouraSegments.length > 0) {
      return ouraSegments
        .map((segment) => {
          const x = 20 + ((segment.start - windowStart) / (48 * 60 * 60 * 1000)) * (width - 40);
          const w = ((segment.end - segment.start) / (48 * 60 * 60 * 1000)) * (width - 40);
          return `<rect x="${x}" y="${chartTop}" width="${w}" height="${chartHeight}" fill="rgba(8,21,46,0.14)" rx="10" />`;
        })
        .join("");
    }

    const segments = [];
    const startDate = new Date(windowStart);
    for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
      const nightStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + dayOffset, 22, 0, 0, 0).getTime();
      const nightEnd = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + dayOffset + 1, 7, 0, 0, 0).getTime();
      const visibleStart = Math.max(nightStart, windowStart);
      const visibleEnd = Math.min(nightEnd, now);
      if (visibleEnd <= visibleStart) continue;
      const x = 20 + ((visibleStart - windowStart) / (48 * 60 * 60 * 1000)) * (width - 40);
      const w = ((visibleEnd - visibleStart) / (48 * 60 * 60 * 1000)) * (width - 40);
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
  const hasOuraOverlay = getSleepOverlaySegments(state, windowStart, now).length > 0;
  els.miniTrendLegend.textContent = `Estimated active level now: ${formatNumber(currentLevel)} ${unitLabel(state)} • peak over last 48h: ${formatNumber(peakLevel)} ${unitLabel(state)} • shaded bands show ${hasOuraOverlay ? "actual Oura sleep" : "night hours"} • half-life: ${formatNumber(state.settings.decayHalfLifeHours || defaultState.settings.decayHalfLifeHours)}h`;
}

function renderRecent() {
  const cutoff = Date.now() - DAY_MS * 2;
  const items = getDoseEntries(state)
    .filter((entry) => new Date(entry.timestamp).getTime() >= cutoff)
    .slice(0, 10);
  els.recentList.innerHTML = "";
  els.recentList.innerHTML = `
    <div class="recent-table-head" aria-hidden="true">
      <span>Date / time</span>
      <span>Dose</span>
    </div>
  `;
  els.recentEmpty.classList.toggle("hidden", items.length > 0);

  for (const entry of items) {
    const fragment = els.activityItemTemplate.content.cloneNode(true);
    const date = new Date(entry.timestamp);
    fragment.querySelector(".history-dose").textContent = `${tabletLabel(entry.tabletCount || 0)} • ${formatNumber(entry.amount)} ${unitLabel(state)}`;
    fragment.querySelector(".history-time").textContent = date.toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
    els.recentList.appendChild(fragment);
  }
}

function renderRecoveryContext() {
  const chip = els.recoveryContextChip;
  if (!chip) return;
  const msg = getRecoveryContextMessage(state);
  if (!msg) {
    chip.classList.add("hidden");
    return;
  }
  chip.classList.remove("hidden");
  // Clear old tone classes
  chip.className = chip.className.replace(/\btone-\w+\b/g, "").trim();
  chip.classList.add(`tone-${msg.tone}`);
  if (els.recoveryContextLabel) {
    const labels = { good: "Body signal ✅", neutral: "Body signal 💙", caution: "Body signal ⚠️", warning: "Body signal 🌡️" };
    els.recoveryContextLabel.textContent = labels[msg.tone] || "Body signal";
  }
  if (els.recoveryContextHeadline) els.recoveryContextHeadline.textContent = msg.headline;
  if (els.recoveryContextDetail) els.recoveryContextDetail.textContent = msg.detail;
}

function drawRxBottle(svg, pct, medName) {
  if (!svg) return;

  // Colour ramp: green → amber → red as supply depletes
  // pct = fraction REMAINING (1.0 = full, 0 = empty)
  function fillColor(p) {
    if (p > 0.5) {
      // green → amber  (1.0 → 0.5)
      const t = (1 - p) * 2; // 0→1
      const r = Math.round(45  + (224 - 45)  * t);
      const g = Math.round(158 + (123 - 158) * t);
      const b = Math.round(89  + (11  - 89)  * t);
      return `rgb(${r},${g},${b})`;
    } else {
      // amber → red  (0.5 → 0)
      const t = (0.5 - p) * 2; // 0→1
      const r = Math.round(224 + (201 - 224) * t);
      const g = Math.round(123 + (38  - 123) * t);
      const b = Math.round(11  + (18  - 11)  * t);
      return `rgb(${r},${g},${b})`;
    }
  }

  function darken(p) {
    if (p > 0.5) {
      const t = (1 - p) * 2;
      const r = Math.round(30  + (184 - 30)  * t);
      const g = Math.round(120 + (93  - 120) * t);
      const b = Math.round(60  + (8   - 60)  * t);
      return `rgb(${r},${g},${b})`;
    } else {
      const t = (0.5 - p) * 2;
      const r = Math.round(184 + (160 - 184) * t);
      const g = Math.round(93  + (20  - 93)  * t);
      const b = Math.round(8   + (10  - 8)   * t);
      return `rgb(${r},${g},${b})`;
    }
  }

  const FILL    = fillColor(pct);
  const DARK    = darken(pct);
  const GHOST   = "rgba(0,0,0,0.06)";
  const GSTROKE = "rgba(0,0,0,0.12)";
  const CAP1    = "#c8c8c8";
  const CAP2    = "#a0a0a0";
  const LABELBG = "rgba(255,255,255,0.6)";
  const id      = svg.id || "rxb";

  const bx = 10, bw = 70, rx = 7;
  const neckX = 22, neckW = 46, neckH = 18;
  const bodyY = 35, bodyH = 110;
  const capH  = 22;
  const innerY = bodyY + 2, innerH = bodyH - 4;
  const fillH  = Math.round(innerH * Math.max(0, Math.min(1, pct)));
  const fillY  = innerY + innerH - fillH;
  const label  = (medName || "").substring(0, 12).toUpperCase();
  const isLongLabel = label.length > 0;

  svg.innerHTML = `
    <defs>
      <clipPath id="bc${id}">
        <rect x="${bx}" y="${bodyY}" width="${bw}" height="${bodyH}" rx="${rx}" ry="${rx}"/>
      </clipPath>
      <linearGradient id="bg${id}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stop-color="${DARK}"/>
        <stop offset="45%"  stop-color="${FILL}"/>
        <stop offset="100%" stop-color="${DARK}"/>
      </linearGradient>
      <linearGradient id="fg${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="${FILL}" stop-opacity="0.92"/>
        <stop offset="100%" stop-color="${DARK}" stop-opacity="0.88"/>
      </linearGradient>
      <linearGradient id="cg${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${CAP1}"/>
        <stop offset="100%" stop-color="${CAP2}"/>
      </linearGradient>
      <linearGradient id="sh${id}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stop-color="rgba(255,255,255,0.2)"/>
        <stop offset="40%"  stop-color="rgba(255,255,255,0.04)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.07)"/>
      </linearGradient>
    </defs>

    <!-- ghost body -->
    <rect x="${bx}" y="${bodyY}" width="${bw}" height="${bodyH}"
          rx="${rx}" ry="${rx}"
          fill="${GHOST}" stroke="${GSTROKE}" stroke-width="1.5"/>

    <!-- liquid fill -->
    <g clip-path="url(#bc${id})">
      ${fillH > 0 ? `
        <rect x="${bx}" y="${fillY}" width="${bw}" height="${fillH + rx}"
              fill="url(#fg${id})"/>
        <ellipse cx="${bx + bw / 2}" cy="${fillY}" rx="${bw / 2 - 1}" ry="3.5"
                 fill="${FILL}" opacity="0.65"/>
      ` : ""}
    </g>

    <!-- bottle outline stroke -->
    <rect x="${bx}" y="${bodyY}" width="${bw}" height="${bodyH}"
          rx="${rx}" ry="${rx}"
          fill="none" stroke="url(#bg${id})" stroke-width="2.5"/>

    <!-- label -->
    <rect x="${bx + 6}" y="${bodyY + 14}" width="${bw - 12}" height="38"
          rx="4" fill="${LABELBG}" stroke="rgba(255,255,255,0.6)" stroke-width="1"/>
    <text x="${bx + bw / 2}" y="${bodyY + 27}"
          text-anchor="middle"
          font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
          font-size="8.5" font-weight="800" letter-spacing="0.5"
          fill="${DARK}">Rx</text>
    <text x="${bx + bw / 2}" y="${bodyY + 38}"
          text-anchor="middle"
          font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
          font-size="${isLongLabel ? 5.2 : 4.8}" font-weight="600"
          fill="#aaa">${isLongLabel ? label : "MONTHLY SUPPLY"}</text>

    <!-- sheen -->
    <rect x="${bx}" y="${bodyY}" width="${bw}" height="${bodyH}"
          rx="${rx}" ry="${rx}" fill="url(#sh${id})"/>

    <!-- neck -->
    <rect x="${neckX}" y="${bodyY - neckH}" width="${neckW}" height="${neckH + 4}"
          rx="4" fill="url(#bg${id})" opacity="0.85"
          stroke="${DARK}" stroke-width="1"/>

    <!-- cap -->
    <rect x="${neckX - 4}" y="${bodyY - neckH - capH + 2}" width="${neckW + 8}" height="${capH}"
          rx="6" fill="url(#cg${id})" stroke="${CAP2}" stroke-width="1"/>
    <line x1="${neckX - 2}"     y1="${bodyY - neckH - capH + 10}"
          x2="${neckX + neckW + 2}" y2="${bodyY - neckH - capH + 10}"
          stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
    <line x1="${neckX - 2}"     y1="${bodyY - neckH - capH + 15}"
          x2="${neckX + neckW + 2}" y2="${bodyY - neckH - capH + 15}"
          stroke="rgba(0,0,0,0.1)" stroke-width="0.8"/>
  `;
}

function renderRxBottle() {
  const usage   = getCurrentMonthTabletUsage(state);
  const used    = usage.used    || 0;
  const planned = usage.planned || 0;
  const remaining = Math.max(0, planned - used);
  const pct     = planned > 0 ? remaining / planned : 1;
  const medName = (state.settings.medicationName || "Rx").trim();

  drawRxBottle(els.rxBottleSvg, pct, medName);

  if (els.rxBottleSub) {
    els.rxBottleSub.textContent = planned > 0
      ? `${used} used · ${remaining} left`
      : "Set supply in Settings";
  }
}

// ── Pace Gauge ────────────────────────────────────────────────────────
const PACE_ZONES = [
  { limit: 25, color: '#2d9e6b', bg: 'rgba(45,158,107,0.13)',  label: 'On target'  },
  { limit: 30, color: '#d4900a', bg: 'rgba(212,144,10,0.12)',  label: 'Moderate'   },
  { limit: 35, color: '#d86020', bg: 'rgba(216,96,32,0.12)',   label: 'High'       },
  { limit: 45, color: '#c94040', bg: 'rgba(201,64,64,0.12)',   label: 'Over limit' },
];

function getPaceZone(v) {
  return PACE_ZONES.find(z => v <= z.limit) || PACE_ZONES[PACE_ZONES.length - 1];
}

function drawPaceGauge(svgEl, value) {
  if (!svgEl) return;
  const CX = 100, CY = 112, R = 80, TW = 15, NL = 58, MAX = 45;
  const START_DEG = 225, SWEEP = 270;
  const v = Math.min(Math.max(value, 0), MAX);
  const toRad = d => d * Math.PI / 180;
  const valToAngle = val => START_DEG - (Math.min(val, MAX) / MAX) * SWEEP;
  const pt = (deg, r = R) => [
    +(CX + r * Math.cos(toRad(deg))).toFixed(2),
    +(CY - r * Math.sin(toRad(deg))).toFixed(2),
  ];
  const zone = getPaceZone(v);
  let h = '';
  const [sx, sy] = pt(START_DEG);
  const [ex, ey] = pt(START_DEG - SWEEP);

  // Full background track — round end caps come for free
  h += `<path d="M ${sx} ${sy} A ${R} ${R} 0 1 1 ${ex} ${ey}"
    fill="none" stroke="${PACE_ZONES[PACE_ZONES.length - 1].color}" stroke-width="${TW}" stroke-linecap="round" opacity="0.22"/>`;

  // Zone arcs 1–3 (butt caps, no boundary bleed)
  let prevDeg = START_DEG;
  let [ppx, ppy] = pt(START_DEG);
  for (let i = 0; i < PACE_ZONES.length - 1; i++) {
    const z = PACE_ZONES[i];
    const ea = valToAngle(z.limit);
    const [epx, epy] = pt(ea);
    const span = Math.abs(prevDeg - ea);
    h += `<path d="M ${ppx} ${ppy} A ${R} ${R} 0 ${span > 180 ? 1 : 0} 1 ${epx} ${epy}"
      fill="none" stroke="${z.color}" stroke-width="${TW}" stroke-linecap="butt" opacity="0.22"/>`;
    prevDeg = ea;
    [ppx, ppy] = [epx, epy];
  }

  // Active fill arc
  if (v > 0.3) {
    const va = valToAngle(v);
    const [vx, vy] = pt(va);
    const span = START_DEG - va;
    h += `<path d="M ${sx} ${sy} A ${R} ${R} 0 ${span > 180 ? 1 : 0} 1 ${vx} ${vy}"
      fill="none" stroke="${zone.color}" stroke-width="${TW}" stroke-linecap="round" opacity="0.9"/>`;
  }

  // Zone boundary ticks + labels
  for (const t of [25, 30, 35]) {
    const ta = toRad(valToAngle(t));
    const inR = R - TW / 2 - 1, outR = R + TW / 2 + 3, lblR = R + TW / 2 + 14;
    const [ix, iy] = [+(CX + inR * Math.cos(ta)).toFixed(1), +(CY - inR * Math.sin(ta)).toFixed(1)];
    const [ox, oy] = [+(CX + outR * Math.cos(ta)).toFixed(1), +(CY - outR * Math.sin(ta)).toFixed(1)];
    const [lx, ly] = [+(CX + lblR * Math.cos(ta)).toFixed(1), +(CY - lblR * Math.sin(ta)).toFixed(1)];
    h += `<line x1="${ix}" y1="${iy}" x2="${ox}" y2="${oy}" stroke="rgba(255,255,255,0.92)" stroke-width="2.2"/>`;
    h += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
      font-size="7" fill="rgba(0,0,0,0.4)" font-weight="700"
      font-family="'Avenir Next',system-ui,sans-serif">${t}</text>`;
  }

  // Needle
  const na = toRad(valToAngle(v));
  const [tipX, tipY] = [+(CX + NL * Math.cos(na)).toFixed(2), +(CY - NL * Math.sin(na)).toFixed(2)];
  const bw = 3.2;
  const npts = [
    `${+(CX + Math.sin(na) * bw).toFixed(2)},${+(CY + Math.cos(na) * bw).toFixed(2)}`,
    `${+(CX - Math.sin(na) * bw).toFixed(2)},${+(CY - Math.cos(na) * bw).toFixed(2)}`,
    `${tipX},${tipY}`,
  ].join(' ');
  h += `<polygon points="${npts}" fill="rgba(0,0,0,0.14)" transform="translate(1.5,2)"/>`;
  h += `<polygon points="${npts}" fill="#2a1810"/>`;
  h += `<circle cx="${CX}" cy="${CY}" r="8" fill="#2a1810"/>`;
  h += `<circle cx="${CX}" cy="${CY}" r="3.5" fill="rgba(255,255,255,0.62)"/>`;

  // Value label
  h += `<text x="${CX}" y="${CY - 24}" text-anchor="middle"
    font-size="34" font-weight="800" fill="#1a1a2e"
    font-family="'Avenir Next Condensed','Franklin Gothic Medium',system-ui,sans-serif">${v.toFixed(1)}</text>`;
  h += `<text x="${CX}" y="${CY - 6}" text-anchor="middle"
    font-size="7.5" fill="#9e9e9e" letter-spacing="0.07em" font-weight="700"
    font-family="'Avenir Next',system-ui,sans-serif">MG / DAY</text>`;

  svgEl.innerHTML = h;
}

function renderPaceGauge() {
  const entries = getDoseEntries(state);
  const now = new Date();

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysElapsed = Math.max(1, (now - monthStart) / 86400000);
  const monthTotal = entries
    .filter(e => new Date(e.timestamp) >= monthStart)
    .reduce((s, e) => s + Number(e.amount), 0);
  const monthlyPace = monthTotal / daysElapsed;

  const weekAgo = now.getTime() - 7 * 86400000;
  const weekTotal = entries
    .filter(e => new Date(e.timestamp).getTime() >= weekAgo)
    .reduce((s, e) => s + Number(e.amount), 0);
  const weeklyAvg = weekTotal / 7;

  drawPaceGauge(els.paceGaugeMo, monthlyPace);
  drawPaceGauge(els.paceGauge7d, weeklyAvg);

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (els.paceGaugeMonthSub) {
    els.paceGaugeMonthSub.textContent = `${monthNames[now.getMonth()]} · ${Math.floor(daysElapsed)} of ${daysInMonth} days`;
  }

  const moZone = getPaceZone(monthlyPace);
  const wkZone = getPaceZone(weeklyAvg);
  if (els.paceGaugeMonthChip) {
    els.paceGaugeMonthChip.textContent = moZone.label;
    els.paceGaugeMonthChip.style.color = moZone.color;
    els.paceGaugeMonthChip.style.background = moZone.bg;
  }
  if (els.paceGauge7dChip) {
    els.paceGauge7dChip.textContent = wkZone.label;
    els.paceGauge7dChip.style.color = wkZone.color;
    els.paceGauge7dChip.style.background = wkZone.bg;
  }
}

function render() {
  renderGauge();
  renderMiniTrend();
  renderRecent();
  renderRecoveryContext();
  renderRxBottle();
  renderPaceGauge();
}

els.nowButton.addEventListener("click", () => {
  setDateTimeInputNow(els.doseTime);
  setNotice("Dose timestamp set to the current time.", "success");
});
els.syncOuraHomeButton?.addEventListener("click", async () => {
  setBusy(els.syncOuraHomeButton, "Syncing Oura...", true);
  setNotice("Syncing recent Oura sleep data...", "warning");
  try {
    const { warnings } = await syncOuraSleep(state);
    render();
    renderRecoveryContext();
    const notice = warnings.length > 0
      ? `Oura synced (${warnings.join(", ")} unavailable).`
      : "Oura sleep data synced.";
    setNotice(notice, warnings.length > 0 ? "warning" : "success");
  } catch (error) {
    setNotice(error.message, "error");
  } finally {
    setBusy(els.syncOuraHomeButton, "Syncing Oura...", false);
  }
});
els.generateSummaryButton?.addEventListener("click", async () => {
  setBusy(els.generateSummaryButton, "Generating...", true);
  setNotice("Generating AI summary...", "warning");
  if (els.aiSummaryBox) {
    els.aiSummaryBox.innerHTML = "<p>Generating...</p>";
  }
  try {
    const result = await generateAiSummary(state);
    const summaryText = result.summary || JSON.stringify(result, null, 2);
    const generatedAt = new Date().toISOString();
    persistAiSummary(summaryText, generatedAt);
    renderAiSummary(summaryText, generatedAt);
    setNotice("AI summary generated.", "success");
  } catch (error) {
    if (els.aiSummaryBox) {
      els.aiSummaryBox.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
    setNotice(error.message, "error");
  } finally {
    setBusy(els.generateSummaryButton, "Generating...", false);
  }
});
els.aiChatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = String(els.aiChatInput?.value || "").trim();
  if (!content) return;
  aiChatMessages.push({ role: "user", content });
  renderAiChat();
  persistAiChatMessages();
  els.aiChatInput.value = "";
  setBusy(els.aiChatSendButton, "Sending...", true);
  setNotice("Sending AI chat question...", "warning");
  try {
    const result = await askAiJournalChat(state, aiChatMessages);
    const answer = String(result.answer || result.summary || "No reply returned.").trim();
    aiChatMessages.push({ role: "assistant", content: answer });
    renderAiChat();
    persistAiChatMessages();
    setNotice("AI reply received.", "success");
  } catch (error) {
    aiChatMessages.push({ role: "assistant", content: `⚠️ ${error.message}` });
    renderAiChat();
    persistAiChatMessages();
    setNotice(error.message, "error");
  } finally {
    setBusy(els.aiChatSendButton, "Send", false);
  }
});
els.doseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const tabletCount = Number.parseFloat(els.doseAmount.value);
  const note = els.doseNote.value.trim();
  const hasDose = Number.isFinite(tabletCount) && tabletCount > 0;
  if (!hasDose && !note) return;
  const submitButton = els.doseForm.querySelector('button[type="submit"]');
  setBusy(submitButton, "Saving...", true);
  if (hasDose) {
    saveDoseEntry(state, tabletCount, els.doseTime.value, note);
  } else {
    saveNoteEntry(state, els.doseTime.value, note);
  }
  els.doseForm.reset();
  setDateTimeInputNow(els.doseTime);
  render();
  setNotice(hasDose ? "Dose entry saved." : "Note saved without a dose.", "success");
  setBusy(submitButton, "Saving...", false);
});

setDateTimeInputNow(els.doseTime);
renderInstallPrompt(els.installButton);
aiChatMessages = loadAiChatMessages();
renderAiChat();
const savedAiSummary = loadSavedAiSummary();
if (savedAiSummary) {
  renderAiSummary(savedAiSummary.summary, savedAiSummary.generatedAt);
}

// ── Connections sheet ──────────────────────────────────────────────
const connSheet = document.querySelector("#connectionsSheet");
const connOverlay = document.querySelector("#connectionsOverlay");
const connSignInForm = document.querySelector("#connSignInForm");
const connSupabaseAction = document.querySelector("#connSupabaseAction");

function openSheet() {
  connSheet.classList.remove("hidden");
  connOverlay.classList.remove("hidden");
  connSheet.removeAttribute("aria-hidden");
  updateConnSheet();
}
function closeSheet() {
  connSheet.classList.add("hidden");
  connOverlay.classList.add("hidden");
  connSheet.setAttribute("aria-hidden", "true");
}

function setConnRowStatus(rowEl, dotEl, status) {
  rowEl.classList.remove("status-green", "status-yellow", "status-red");
  rowEl.classList.add(`status-${status}`);
  dotEl.className = `conn-dot ${status}`;
}

function updateConnSheet() {
  const supabaseRow = document.querySelector("#connSupabaseRow");
  const supabaseDot = document.querySelector("#connSupabaseDot");
  const supabaseDetail = document.querySelector("#connSupabaseDetail");
  const ouraRow = document.querySelector("#connOuraRow");
  const ouraDot = document.querySelector("#connOuraDot");
  const ouraDetail = document.querySelector("#connOuraDetail");
  const openAiRow = document.querySelector("#connOpenAiRow");
  const openAiDot = document.querySelector("#connOpenAiDot");
  const openAiDetail = document.querySelector("#connOpenAiDetail");

  // Supabase
  const email = state.settings?.supabaseEmail || state.auth?.email;
  if (email) {
    setConnRowStatus(supabaseRow, supabaseDot, "green");
    supabaseDetail.textContent = email;
    connSupabaseAction.textContent = "Sign Out";
    connSignInForm.style.display = "none";
  } else {
    setConnRowStatus(supabaseRow, supabaseDot, "red");
    supabaseDetail.textContent = "Not signed in";
    connSupabaseAction.textContent = "Sign In";
    connSignInForm.style.display = "flex";
  }

  // Oura
  const ouraToken = state.settings?.ouraToken;
  if (ouraToken) {
    setConnRowStatus(ouraRow, ouraDot, "green");
    const lastSync = state.settings?.ouraLastSync;
    ouraDetail.textContent = lastSync ? `Last synced ${new Date(lastSync).toLocaleDateString()}` : "Connected";
  } else {
    setConnRowStatus(ouraRow, ouraDot, "red");
    ouraDetail.textContent = "Not connected";
  }

  // OpenAI
  const openAiKey = state.settings?.openAiKey;
  if (openAiKey) {
    setConnRowStatus(openAiRow, openAiDot, "green");
    openAiDetail.textContent = "API key set";
  } else {
    setConnRowStatus(openAiRow, openAiDot, "yellow");
    openAiDetail.textContent = "No API key";
  }
}

document.querySelector("#connectionsButton")?.addEventListener("click", openSheet);
connOverlay?.addEventListener("click", closeSheet);

connSupabaseAction?.addEventListener("click", async () => {
  const email = state.settings?.supabaseEmail || state.auth?.email;
  if (email) {
    await signOut(state);
    updateConnSheet();
  } else {
    connSignInForm.style.display = "flex";
    document.querySelector("#connEmail")?.focus();
  }
});

connSignInForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.querySelector("#connEmail")?.value.trim();
  const password = document.querySelector("#connPassword")?.value;
  const errEl = document.querySelector("#connSignInError");
  errEl.textContent = "";
  const btn = connSignInForm.querySelector("button[type=submit]");
  setBusy(btn, "Signing in...", true);
  try {
    await signIn(state, email, password);
    state = loadState();
    updateConnSheet();
    setNotice("Signed in successfully.", "success");
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    setBusy(btn, "Signing in...", false);
  }
});

document.querySelector("#connCreateBtn")?.addEventListener("click", async () => {
  const email = document.querySelector("#connEmail")?.value.trim();
  const password = document.querySelector("#connPassword")?.value;
  const errEl = document.querySelector("#connSignInError");
  errEl.textContent = "";
  try {
    await createAccount(state, email, password);
    state = loadState();
    updateConnSheet();
    setNotice("Account created and signed in.", "success");
  } catch (err) {
    errEl.textContent = err.message;
  }
});
// ── End connections sheet ──────────────────────────────────────────

(async () => {
  try {
    await loadRemoteStateInto(state);
  } catch (error) {
    console.error(error);
    setNotice(error.message, "error");
  }
  registerServiceWorker();
  render();
})();
