"use strict";

let state = loadState();
if (consumeOuraRedirect(state)) {
  state = loadState();
}
const AI_CHAT_STORAGE_KEY = "stimulant-journal-ai-chat-v1";
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
  monthTabletUsageFill: document.querySelector("#monthTabletUsageFill"),
  lastSleepHeadline: document.querySelector("#lastSleepHeadline"),
  lastSleepDetail: document.querySelector("#lastSleepDetail"),
  doseRecommendationHeadline: document.querySelector("#doseRecommendationHeadline"),
  doseRecommendationDetail: document.querySelector("#doseRecommendationDetail"),
  miniTrendChart: document.querySelector("#miniTrendChart"),
  miniTrendAxis: document.querySelector("#miniTrendAxis"),
  miniTrendLegend: document.querySelector("#miniTrendLegend"),
  recentList: document.querySelector("#recentList"),
  recentEmpty: document.querySelector("#recentEmpty"),
  generateSummaryButton: document.querySelector("#generateSummaryButton"),
  aiSummaryBox: document.querySelector("#aiSummaryBox"),
  aiChatHistory: document.querySelector("#aiChatHistory"),
  aiChatForm: document.querySelector("#aiChatForm"),
  aiChatInput: document.querySelector("#aiChatInput"),
  aiChatSendButton: document.querySelector("#aiChatSendButton"),
  activityItemTemplate: document.querySelector("#activityItemTemplate"),
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

  els.todayTotal.textContent = formatNumber(total);
  els.todayUnit.textContent = unitLabel(state);
  els.todayEntries.textContent = `${todayEntries.length}`;
  els.todayLastDose.textContent = lastDose
    ? lastDose.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "None";
  els.todayGaugeBadge.textContent = gauge.label;
  els.todayGaugeBadge.className = `status-badge ${gauge.tone}`;
  els.headerCard.className = `card header-card gauge-${gauge.tone}`;
  els.todayGaugeLabel.textContent = `${tabletLabel(totalTablets)} today • ${Math.round(suggestedRatio * 100)}% of the 30 mg suggested cap`;
  els.gaugeReason.textContent = `${gauge.reason} Monthly tablets used: ${formatNumber(tabletUsage.used)} of ${formatNumber(tabletUsage.planned)}.`;
  els.monthTabletUsage.textContent = `${formatNumber(tabletUsage.used)} / ${formatNumber(tabletUsage.planned)}`;
  els.monthTabletUsageFill.style.width = `${tabletUsage.planned > 0 ? Math.min((tabletUsage.used / tabletUsage.planned) * 100, 100) : 0}%`;
  els.thermoFill.style.height = `${Math.min(visualRatio * 100, 100)}%`;
  els.thermoFill.className = `thermo-fill ${gauge.tone}`;
  els.targetMarker.style.bottom = `${(suggestedCap / visualMax) * 100}%`;
  els.scaleTop.textContent = `${formatNumber(visualMax)} ${unitLabel(state)}`;
  els.scaleMid.textContent = `${formatNumber(visualMax / 2)} ${unitLabel(state)}`;
  els.scaleBase.textContent = `0 ${unitLabel(state)}`;
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
  } else {
    els.lastSleepHeadline.textContent = "No Oura sleep yet";
    els.lastSleepDetail.textContent = "Connect and sync Oura in More Details.";
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

function render() {
  renderGauge();
  renderMiniTrend();
  renderRecent();
}

els.nowButton.addEventListener("click", () => {
  setDateTimeInputNow(els.doseTime);
  setNotice("Dose timestamp set to the current time.", "success");
});
els.syncOuraHomeButton?.addEventListener("click", async () => {
  setBusy(els.syncOuraHomeButton, "Syncing Oura...", true);
  setNotice("Syncing recent Oura sleep data...", "warning");
  try {
    await syncOuraSleep(state);
    render();
    setNotice("Oura sleep data synced.", "success");
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
    if (els.aiSummaryBox) {
      els.aiSummaryBox.innerHTML = formatAiSummaryHtml(result.summary || JSON.stringify(result, null, 2));
    }
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
