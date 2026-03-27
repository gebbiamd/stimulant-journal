"use strict";

const STORAGE_KEY = "stimulant-journal-data-v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 60;

const defaultState = {
  entries: [],
  settings: {
    medicationName: "",
    doseUnit: "mg",
    monthlyTarget: 300,
    vacationThreshold: 10,
  },
};

const els = {
  doseForm: document.querySelector("#doseForm"),
  settingsForm: document.querySelector("#settingsForm"),
  doseAmount: document.querySelector("#doseAmount"),
  doseTime: document.querySelector("#doseTime"),
  doseNote: document.querySelector("#doseNote"),
  nowButton: document.querySelector("#nowButton"),
  doseUnitLabel: document.querySelector("#doseUnitLabel"),
  avg3: document.querySelector("#avg3"),
  avg7: document.querySelector("#avg7"),
  monthTotal: document.querySelector("#monthTotal"),
  monthEntries: document.querySelector("#monthEntries"),
  monthUsedDays: document.querySelector("#monthUsedDays"),
  monthLongestBreak: document.querySelector("#monthLongestBreak"),
  monthLabel: document.querySelector("#monthLabel"),
  recommendationBadge: document.querySelector("#recommendationBadge"),
  recommendationTitle: document.querySelector("#recommendationTitle"),
  recommendationReason: document.querySelector("#recommendationReason"),
  historyList: document.querySelector("#historyList"),
  historyEmpty: document.querySelector("#historyEmpty"),
  historyItemTemplate: document.querySelector("#historyItemTemplate"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  medicationName: document.querySelector("#medicationName"),
  doseUnit: document.querySelector("#doseUnit"),
  monthlyTarget: document.querySelector("#monthlyTarget"),
  vacationThreshold: document.querySelector("#vacationThreshold"),
  installButton: document.querySelector("#installButton"),
};

let state = loadState();
let deferredInstallPrompt = null;

function cloneDefaultState() {
  return {
    entries: [],
    settings: { ...defaultState.settings },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaultState();
    const parsed = JSON.parse(raw);
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      settings: { ...defaultState.settings, ...(parsed.settings || {}) },
    };
  } catch {
    return cloneDefaultState();
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setCurrentTime() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  els.doseTime.value = new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseTimestamp(input) {
  if (!input) return new Date().toISOString();
  const candidate = new Date(input);
  if (Number.isNaN(candidate.getTime())) return new Date().toISOString();
  return candidate.toISOString();
}

function formatNumber(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function unitLabel() {
  return (state.settings.doseUnit || "mg").trim() || "mg";
}

function medicationLabel() {
  const value = (state.settings.medicationName || "").trim();
  const month = new Date().toLocaleString(undefined, { month: "long", year: "numeric" });
  return value ? `${month} - ${value}` : month;
}

function saveEntry(event) {
  event.preventDefault();
  const amount = Number.parseFloat(els.doseAmount.value);
  if (!Number.isFinite(amount) || amount <= 0) return;

  state.entries.push({
    id: crypto.randomUUID(),
    amount,
    timestamp: parseTimestamp(els.doseTime.value),
    note: els.doseNote.value.trim(),
  });

  state.entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  persistState();
  els.doseForm.reset();
  setCurrentTime();
  render();
}

function saveSettings(event) {
  event.preventDefault();
  state.settings = {
    medicationName: els.medicationName.value.trim(),
    doseUnit: (els.doseUnit.value || "mg").trim(),
    monthlyTarget: Number.parseFloat(els.monthlyTarget.value) || defaultState.settings.monthlyTarget,
    vacationThreshold:
      Number.parseInt(els.vacationThreshold.value, 10) || defaultState.settings.vacationThreshold,
  };
  persistState();
  render();
}

function dateKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameMonth(date, compare) {
  return date.getFullYear() === compare.getFullYear() && date.getMonth() === compare.getMonth();
}

function sumForDays(days) {
  const now = new Date();
  const start = startOfLocalDay(new Date(now.getTime() - (days - 1) * DAY_MS));
  const total = state.entries.reduce((sum, entry) => {
    const timestamp = new Date(entry.timestamp);
    return timestamp >= start ? sum + Number(entry.amount) : sum;
  }, 0);
  return total / days;
}

function getCurrentMonthEntries() {
  const now = new Date();
  return state.entries.filter((entry) => isSameMonth(new Date(entry.timestamp), now));
}

function getConsecutiveUseDays() {
  const usedDays = new Set(state.entries.map((entry) => dateKey(entry.timestamp)));
  let consecutive = 0;
  let cursor = startOfLocalDay(new Date());

  while (usedDays.has(dateKey(cursor))) {
    consecutive += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  return consecutive;
}

function getLongestBreak(entries) {
  const uniqueDays = [...new Set(entries.map((entry) => dateKey(entry.timestamp)))].sort();
  if (uniqueDays.length < 2) return 0;

  let longest = 0;
  for (let index = 1; index < uniqueDays.length; index += 1) {
    const prior = new Date(uniqueDays[index - 1]);
    const current = new Date(uniqueDays[index]);
    const daysBetween = Math.round((current - prior) / DAY_MS) - 1;
    longest = Math.max(longest, daysBetween);
  }

  return longest;
}

function getRecommendation() {
  if (!state.entries.length) {
    return {
      tone: "neutral",
      badge: "No Data",
      title: "Add your first entry",
      reason: "Once you log doses, the app will estimate recent intensity and monthly trend.",
    };
  }

  const avg3 = sumForDays(3);
  const avg7 = sumForDays(7);
  const monthEntries = getCurrentMonthEntries();
  const monthTotal = monthEntries.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const monthUsedDays = new Set(monthEntries.map((entry) => dateKey(entry.timestamp))).size;
  const consecutiveDays = getConsecutiveUseDays();
  const target = Number(state.settings.monthlyTarget) || defaultState.settings.monthlyTarget;
  const noDoseIn48Hours = Date.now() - new Date(state.entries[0].timestamp).getTime() > 2 * DAY_MS;

  if (consecutiveDays >= Number(state.settings.vacationThreshold || 10) || monthUsedDays >= 22) {
    return {
      tone: "danger",
      badge: "Vacation",
      title: "A reset may be worth considering",
      reason:
        "You have a dense recent pattern. If this reflects prescribed medication, align any change with your clinician.",
    };
  }

  if (avg7 >= avg3 * 0.9 && monthTotal > target * 1.15) {
    return {
      tone: "danger",
      badge: "Cut Back",
      title: "This month is running hot",
      reason: "Your current month total is well above your personal target and recent intake has stayed elevated.",
    };
  }

  if (avg3 > avg7 * 1.2 || monthTotal > target) {
    return {
      tone: "warn",
      badge: "Slow Down",
      title: "Recent use is trending up",
      reason: "The short-term average is above your longer view or the month total has crossed your target.",
    };
  }

  if (noDoseIn48Hours && monthTotal < target * 0.75) {
    return {
      tone: "good",
      badge: "Light Use",
      title: "Recent pattern looks light",
      reason: "You have had a recent break and the month total remains below your target.",
    };
  }

  return {
    tone: "neutral",
    badge: "Steady",
    title: "Pattern looks stable",
    reason: "Recent entries are within your current target range.",
  };
}

function renderMetrics() {
  const monthEntries = getCurrentMonthEntries();
  const monthTotal = monthEntries.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const monthUsedDays = new Set(monthEntries.map((entry) => dateKey(entry.timestamp))).size;
  const recommendation = getRecommendation();

  els.avg3.textContent = `${formatNumber(sumForDays(3))} ${unitLabel()}/day`;
  els.avg7.textContent = `${formatNumber(sumForDays(7))} ${unitLabel()}/day`;
  els.monthTotal.textContent = `${formatNumber(monthTotal)} ${unitLabel()}`;
  els.monthEntries.textContent = `${monthEntries.length}`;
  els.monthUsedDays.textContent = `${monthUsedDays}`;
  els.monthLongestBreak.textContent = `${getLongestBreak(monthEntries)} days`;
  els.monthLabel.textContent = medicationLabel();
  els.recommendationBadge.textContent = recommendation.badge;
  els.recommendationBadge.className = `status-badge ${recommendation.tone}`;
  els.recommendationTitle.textContent = recommendation.title;
  els.recommendationReason.textContent = recommendation.reason;
  els.doseUnitLabel.textContent = unitLabel();
}

function renderHistory() {
  const entries = [...state.entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, HISTORY_LIMIT);
  els.historyList.innerHTML = "";
  els.historyEmpty.classList.toggle("hidden", entries.length > 0);

  for (const entry of entries) {
    const fragment = els.historyItemTemplate.content.cloneNode(true);
    const date = new Date(entry.timestamp);
    fragment.querySelector(".history-dose").textContent = `${formatNumber(entry.amount)} ${unitLabel()}`;
    fragment.querySelector(".history-time").textContent = date.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    fragment.querySelector(".history-note").textContent = entry.note || "No note";
    fragment.querySelector(".delete-button").dataset.id = entry.id;
    els.historyList.appendChild(fragment);
  }
}

function hydrateSettings() {
  els.medicationName.value = state.settings.medicationName;
  els.doseUnit.value = state.settings.doseUnit;
  els.monthlyTarget.value = state.settings.monthlyTarget;
  els.vacationThreshold.value = state.settings.vacationThreshold;
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stimulant-journal-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      state = {
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        settings: { ...defaultState.settings, ...(parsed.settings || {}) },
      };
      state.entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      persistState();
      render();
    } catch {
      window.alert("That file could not be imported.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function deleteEntry(event) {
  const button = event.target.closest(".delete-button");
  if (!button) return;
  const { id } = button.dataset;
  state.entries = state.entries.filter((entry) => entry.id !== id);
  persistState();
  render();
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installButton.classList.remove("hidden");
  });

  els.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installButton.classList.add("hidden");
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

function render() {
  hydrateSettings();
  renderMetrics();
  renderHistory();
}

els.doseForm.addEventListener("submit", saveEntry);
els.settingsForm.addEventListener("submit", saveSettings);
els.exportButton.addEventListener("click", exportData);
els.importInput.addEventListener("change", importData);
els.historyList.addEventListener("click", deleteEntry);
els.nowButton.addEventListener("click", setCurrentTime);

render();
setCurrentTime();
setupInstallPrompt();
registerServiceWorker();
