"use strict";

const STORAGE_KEY = "stimulant-journal-data-v2";
const LEGACY_STORAGE_KEY = "stimulant-journal-data-v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const SUPABASE_URL = "https://fuobbnjqvdltxcmczwft.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1b2JibmpxdmRsdHhjbWN6d2Z0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NTI4MDcsImV4cCI6MjA5MDIyODgwN30.nXxmv1_Bc2rj6Zu7yZtQwUEWGtliNL64m1KlY5Ki3O8";

const defaultState = {
  entries: [],
  settings: {
    medicationName: "",
    doseUnit: "mg",
    dailyTarget: 40,
    monthlyTarget: 300,
    doseDaysTarget: 16,
    monthlyTablets: 30,
    mgPerTablet: 10,
    decayHalfLifeHours: 10,
    vacationThreshold: 10,
    vacationDoseThreshold: 10,
    vacationFrequencyDays: 30,
    openAiRelayUrl: "",
    openAiModel: "gpt-5.4",
    ouraClientId: "",
  },
  integrations: {
    oura: {
      accessToken: "",
      expiresAt: "",
      scope: "",
      lastSyncAt: "",
      sleep: [],
    },
  },
  auth: {
    email: "",
    userId: "",
  },
};

function cloneDefaultState() {
  return {
    entries: [],
    settings: { ...defaultState.settings },
    integrations: JSON.parse(JSON.stringify(defaultState.integrations)),
    auth: { ...defaultState.auth },
  };
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const timestamp = entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString();
  if (entry.type === "note") {
    return {
      id: entry.id || crypto.randomUUID(),
      type: "note",
      timestamp,
      note: String(entry.note || "").trim(),
    };
  }
  const tabletCount =
    entry.tabletCount !== undefined && entry.tabletCount !== null
      ? Number(entry.tabletCount) || 0
      : (Number(entry.amount) || 0) / ((Number(entry.mgPerTablet) || Number(defaultState.settings.mgPerTablet)));
  const mgPerTablet =
    Number(entry.mgPerTablet) || Number(defaultState.settings.mgPerTablet);
  const amount =
    entry.amount !== undefined && entry.amount !== null
      ? Number(entry.amount) || 0
      : tabletCount * mgPerTablet;
  return {
    id: entry.id || crypto.randomUUID(),
    type: "dose",
    timestamp,
    amount,
    tabletCount,
    mgPerTablet,
    note: String(entry.note || "").trim(),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return cloneDefaultState();
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed.entries) ? parsed.entries.map(normalizeEntry).filter(Boolean) : [];
    return {
      entries: entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
      settings: { ...defaultState.settings, ...(parsed.settings || {}) },
      integrations: {
        oura: {
          ...defaultState.integrations.oura,
          ...((parsed.integrations && parsed.integrations.oura) || {}),
        },
      },
      auth: { ...defaultState.auth, ...(parsed.auth || {}) },
    };
  } catch {
    return cloneDefaultState();
  }
}

function persistState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let supabaseClient = null;
let remoteSyncPromise = Promise.resolve();

function getSupabaseClient() {
  if (!window.supabase) throw new Error("Supabase client library is not loaded.");
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return supabaseClient;
}

async function refreshAuthState(state) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const user = data.session?.user || null;
  state.auth = {
    email: user?.email || "",
    userId: user?.id || "",
  };
  persistState(state);
  return user;
}

async function getSupabaseSession() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

async function loadRemoteStateInto(state) {
  const client = getSupabaseClient();
  const user = await refreshAuthState(state);
  if (!user) return state;

  const [{ data: settingsRows, error: settingsError }, { data: entryRows, error: entriesError }] = await Promise.all([
    client.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    client.from("journal_entries").select("*").eq("user_id", user.id).order("timestamp", { ascending: false }),
  ]);

  if (settingsError) throw settingsError;
  if (entriesError) throw entriesError;

  if (settingsRows) {
    state.settings = {
      ...defaultState.settings,
      medicationName: settingsRows.medication_name ?? defaultState.settings.medicationName,
      doseUnit: settingsRows.dose_unit ?? defaultState.settings.doseUnit,
      dailyTarget: Number(settingsRows.daily_target ?? defaultState.settings.dailyTarget),
      monthlyTarget: Number(settingsRows.monthly_target ?? defaultState.settings.monthlyTarget),
      doseDaysTarget: Number(settingsRows.dose_days_target ?? defaultState.settings.doseDaysTarget),
      monthlyTablets: Number(settingsRows.monthly_tablets ?? defaultState.settings.monthlyTablets),
      mgPerTablet: Number(settingsRows.mg_per_tablet ?? defaultState.settings.mgPerTablet),
      decayHalfLifeHours: Number(settingsRows.decay_half_life_hours ?? defaultState.settings.decayHalfLifeHours),
      vacationThreshold: Number(settingsRows.vacation_threshold ?? defaultState.settings.vacationThreshold),
      vacationDoseThreshold: Number(settingsRows.vacation_dose_threshold ?? defaultState.settings.vacationDoseThreshold),
      vacationFrequencyDays: Number(settingsRows.vacation_frequency_days ?? defaultState.settings.vacationFrequencyDays),
      openAiRelayUrl: settingsRows.openai_relay_url ?? defaultState.settings.openAiRelayUrl,
      openAiModel: settingsRows.openai_model ?? defaultState.settings.openAiModel,
      ouraClientId: settingsRows.oura_client_id ?? defaultState.settings.ouraClientId,
    };
  }

  if (Array.isArray(entryRows)) {
    state.entries = entryRows
      .map((row) =>
        normalizeEntry({
          id: row.id,
          type: row.type,
          timestamp: row.timestamp,
          amount: row.amount,
          tabletCount: row.tablet_count,
          mgPerTablet: row.mg_per_tablet,
          note: row.note,
        })
      )
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  persistState(state);
  return state;
}

function queueRemoteSync(state) {
  remoteSyncPromise = remoteSyncPromise
    .then(() => syncStateToSupabase(state))
    .catch((error) => {
      console.error("Supabase sync failed", error);
    });
  return remoteSyncPromise;
}

async function syncStateToSupabase(state) {
  const client = getSupabaseClient();
  const user = await refreshAuthState(state);
  if (!user) return;

  const settingsPayload = {
    user_id: user.id,
    medication_name: state.settings.medicationName,
    dose_unit: state.settings.doseUnit,
    daily_target: state.settings.dailyTarget,
    monthly_target: state.settings.monthlyTarget,
    dose_days_target: state.settings.doseDaysTarget,
    monthly_tablets: state.settings.monthlyTablets,
    mg_per_tablet: state.settings.mgPerTablet,
    decay_half_life_hours: state.settings.decayHalfLifeHours,
    vacation_threshold: state.settings.vacationThreshold,
    vacation_dose_threshold: state.settings.vacationDoseThreshold,
    vacation_frequency_days: state.settings.vacationFrequencyDays,
    openai_relay_url: state.settings.openAiRelayUrl,
    openai_model: state.settings.openAiModel,
    oura_client_id: state.settings.ouraClientId,
  };

  const entryPayload = state.entries.map((entry) => ({
    id: entry.id,
    user_id: user.id,
    type: entry.type,
    timestamp: entry.timestamp,
    amount: entry.type === "dose" ? entry.amount : null,
    tablet_count: entry.type === "dose" ? entry.tabletCount : null,
    mg_per_tablet: entry.type === "dose" ? entry.mgPerTablet : null,
    note: entry.note || "",
  }));

  const { error: settingsError } = await client.from("user_settings").upsert(settingsPayload, { onConflict: "user_id" });
  if (settingsError) throw settingsError;

  const { error: deleteError } = await client.from("journal_entries").delete().eq("user_id", user.id);
  if (deleteError) throw deleteError;

  if (entryPayload.length) {
    const { error: insertError } = await client.from("journal_entries").insert(entryPayload);
    if (insertError) throw insertError;
  }
}

function getSettingsRedirectUrl() {
  return `${window.location.origin}/stimulant-journal/settings.html`;
}

function getDefaultOpenAiRelayUrl() {
  return `${SUPABASE_URL}/functions/v1/openai-summary`;
}

async function signUpWithEmailPassword(email, password) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getSettingsRedirectUrl(),
    },
  });
  if (error) throw error;
  return data;
}

async function signInWithPassword(email, password) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

async function signOutFromSupabase(state) {
  const client = getSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
  state.auth = { ...defaultState.auth };
  persistState(state);
}

function dateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseTimestamp(input) {
  if (!input) return new Date().toISOString();
  const candidate = new Date(input);
  return Number.isNaN(candidate.getTime()) ? new Date().toISOString() : candidate.toISOString();
}

function formatNumber(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function tabletLabel(count) {
  return `${formatNumber(count)} ${Number(count) === 1 ? "tablet" : "tablets"}`;
}

function unitLabel(state) {
  return (state.settings.doseUnit || "mg").trim() || "mg";
}

function getDoseEntries(state) {
  return state.entries.filter((entry) => entry.type !== "note");
}

function getNoteEntries(state) {
  return state.entries.filter((entry) => entry.type === "note");
}

function getTodayDoseEntries(state) {
  const today = dateKey(new Date());
  return getDoseEntries(state).filter((entry) => dateKey(entry.timestamp) === today);
}

function getCurrentMonthDoseEntries(state) {
  const now = new Date();
  return getDoseEntries(state).filter((entry) => {
    const date = new Date(entry.timestamp);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
}

function getTotalsByDay(state, days) {
  const today = startOfLocalDay(new Date());
  const totals = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(today.getTime() - offset * DAY_MS);
    const key = dateKey(day);
    const total = getDoseEntries(state).reduce((sum, entry) => {
      return dateKey(entry.timestamp) === key ? sum + Number(entry.amount) : sum;
    }, 0);
    totals.push({
      key,
      total,
      date: day,
      label: day.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
    });
  }

  return totals;
}

function getDoseDecaySeries(state, hours = 24, points = 49) {
  const halfLifeHours = Number(state.settings.decayHalfLifeHours) || defaultState.settings.decayHalfLifeHours;
  const decayConstant = Math.log(2) / Math.max(halfLifeHours, 0.1);
  const now = Date.now();
  const start = now - hours * 60 * 60 * 1000;
  const doseEntries = getDoseEntries(state).filter((entry) => new Date(entry.timestamp).getTime() >= start - 6 * halfLifeHours * 60 * 60 * 1000);
  const series = [];

  for (let index = 0; index < points; index += 1) {
    const timestamp = start + (index / (points - 1)) * (hours * 60 * 60 * 1000);
    let level = 0;
    for (const entry of doseEntries) {
      const doseTime = new Date(entry.timestamp).getTime();
      if (doseTime > timestamp) continue;
      const elapsedHours = (timestamp - doseTime) / (60 * 60 * 1000);
      level += Number(entry.amount) * Math.exp(-decayConstant * elapsedHours);
    }
    series.push({
      timestamp,
      level,
      label: new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric" }),
    });
  }

  return series;
}

function getRollingAverage(state, days) {
  const totals = getTotalsByDay(state, days);
  const total = totals.reduce((sum, item) => sum + item.total, 0);
  return total / days;
}

function getCurrentMonthTabletUsage(state) {
  const totalTablets = getCurrentMonthDoseEntries(state).reduce((sum, entry) => sum + Number(entry.tabletCount || 0), 0);
  const planned = Number(state.settings.monthlyTablets) || 0;
  const used = totalTablets;
  return {
    used,
    planned,
    remaining: Math.max(planned - used, 0),
  };
}

function getConsecutiveDoseDays(state) {
  const usedDays = new Set(getDoseEntries(state).map((entry) => dateKey(entry.timestamp)));
  let cursor = startOfLocalDay(new Date());
  let count = 0;

  while (usedDays.has(dateKey(cursor))) {
    count += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  return count;
}

function getHomeGauge(state) {
  const todayDose = getTodayDoseEntries(state).reduce((sum, entry) => sum + Number(entry.amount), 0);
  const target = Number(state.settings.dailyTarget) || defaultState.settings.dailyTarget;
  const ratio = target > 0 ? todayDose / target : 0;

  if (todayDose > 30) {
    return { tone: "danger", label: "Over limit", ratio, reason: "Today is over 30 mg and should be treated as a high-use day." };
  }
  if (todayDose >= 20) {
    return { tone: "warn", label: "High today", ratio, reason: "Today is in the 20-30 mg range." };
  }
  return { tone: "good", label: "On track", ratio, reason: "Today is 15 mg or below." };
}

function saveDoseEntry(state, tabletCount, timestamp, note) {
  const mgPerTablet = Number(state.settings.mgPerTablet) || defaultState.settings.mgPerTablet;
  const amount = Number(tabletCount) * mgPerTablet;
  state.entries.push({
    id: crypto.randomUUID(),
    type: "dose",
    amount,
    tabletCount: Number(tabletCount),
    mgPerTablet,
    timestamp: parseTimestamp(timestamp),
    note: String(note || "").trim(),
  });
  state.entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  persistState(state);
  queueRemoteSync(state);
}

function saveNoteEntry(state, timestamp, note) {
  state.entries.push({
    id: crypto.randomUUID(),
    type: "note",
    timestamp: parseTimestamp(timestamp),
    note: String(note || "").trim(),
  });
  state.entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  persistState(state);
  queueRemoteSync(state);
}

function deleteEntry(state, id) {
  state.entries = state.entries.filter((entry) => entry.id !== id);
  persistState(state);
  queueRemoteSync(state);
}

function exportData(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stimulant-journal-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(callback) {
  return (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const nextState = {
          entries: Array.isArray(parsed.entries) ? parsed.entries.map(normalizeEntry).filter(Boolean) : [],
          settings: { ...defaultState.settings, ...(parsed.settings || {}) },
          integrations: {
            oura: {
              ...defaultState.integrations.oura,
              ...((parsed.integrations && parsed.integrations.oura) || {}),
            },
          },
          auth: { ...defaultState.auth, ...(parsed.auth || {}) },
        };
        nextState.entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        persistState(nextState);
        queueRemoteSync(nextState);
        callback(nextState);
      } catch {
        window.alert("That file could not be imported.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  };
}

function setDateTimeInputNow(input) {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  input.value = new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

function buildOuraRedirectUri() {
  return `${SUPABASE_URL}/functions/v1/oura-callback`;
}

function consumeOuraRedirect(state) {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!hash.includes("access_token=")) return false;
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const expiresIn = Number.parseInt(params.get("expires_in") || "0", 10);
  if (!accessToken) return false;

  state.integrations.oura = {
    ...state.integrations.oura,
    accessToken,
    scope: params.get("scope") || "",
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : "",
  };
  persistState(state);
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  return true;
}

function startOuraAuth(state) {
  return getSupabaseSession().then((session) => {
    if (!session?.access_token) {
      throw new Error("Sign in with email first so the Oura connection can be linked to your account.");
    }
    const authUrl = new URL(`${SUPABASE_URL}/functions/v1/oura-authorize`);
    authUrl.searchParams.set("access_token", session.access_token);
    window.location.assign(authUrl.toString());
  });
}

function disconnectOura(state) {
  state.integrations.oura = { ...defaultState.integrations.oura };
  persistState(state);
}

async function syncOuraSleep(state) {
  const session = await getSupabaseSession();
  if (!session?.access_token) throw new Error("Sign in with email first.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/oura-sync`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Oura sync failed: ${response.status}`);
  }
  state.integrations.oura.sleep = Array.isArray(payload.data) ? payload.data : [];
  state.integrations.oura.lastSyncAt = new Date().toISOString();
  persistState(state);
  return state.integrations.oura.sleep;
}

function getRecentOuraSleep(state) {
  return Array.isArray(state.integrations?.oura?.sleep) ? state.integrations.oura.sleep : [];
}

function getSortedOuraSleep(state) {
  return getRecentOuraSleep(state)
    .filter((item) => item && (item.bedtime_start || item.day))
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.bedtime_start || a.day).getTime();
      const bTime = new Date(b.bedtime_start || b.day).getTime();
      return bTime - aTime;
    });
}

function getLatestOuraSleep(state) {
  return getSortedOuraSleep(state)[0] || null;
}

function getDoseTotalForLocalDate(state, date) {
  const key = dateKey(date);
  return getDoseEntries(state).reduce((sum, entry) => {
    return dateKey(entry.timestamp) === key ? sum + Number(entry.amount || 0) : sum;
  }, 0);
}

function getLastDoseForLocalDate(state, date) {
  const key = dateKey(date);
  return getDoseEntries(state).find((entry) => dateKey(entry.timestamp) === key) || null;
}

function getSleepDosePoints(state, limit = 14) {
  const sleep = getSortedOuraSleep(state).slice(0, limit);
  return sleep
    .map((item) => {
      const bedtime = item.bedtime_start ? new Date(item.bedtime_start) : null;
      if (!bedtime || Number.isNaN(bedtime.getTime())) return null;
      const doseDate = new Date(bedtime.getFullYear(), bedtime.getMonth(), bedtime.getDate());
      const lastDose = getLastDoseForLocalDate(state, doseDate);
      return {
        dayLabel: bedtime.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
        bedtime,
        doseTotal: getDoseTotalForLocalDate(state, doseDate),
        lastDose,
        lastDoseHour:
          lastDose ? new Date(lastDose.timestamp).getHours() + new Date(lastDose.timestamp).getMinutes() / 60 : null,
        sleepScore: Number(item.score || 0),
        sleepHours: item.total_sleep_duration ? Number(item.total_sleep_duration) / 3600 : null,
        item,
      };
    })
    .filter(Boolean);
}

function getSleepOverlaySegments(state, startMs, endMs) {
  return getSortedOuraSleep(state)
    .map((item) => {
      const start = item.bedtime_start ? new Date(item.bedtime_start).getTime() : null;
      const end = item.bedtime_end ? new Date(item.bedtime_end).getTime() : null;
      if (!start || !end || Number.isNaN(start) || Number.isNaN(end)) return null;
      if (end <= startMs || start >= endMs) return null;
      return {
        start: Math.max(start, startMs),
        end: Math.min(end, endMs),
        score: Number(item.score || 0),
      };
    })
    .filter(Boolean);
}

function getSleepInsightSummary(state) {
  const points = getSleepDosePoints(state, 14).filter((point) => Number.isFinite(point.sleepHours));
  if (points.length < 4) {
    return "Sync a few more Oura sleep records to unlock dose-vs-sleep insights.";
  }

  const sortedByDose = points.slice().sort((a, b) => a.doseTotal - b.doseTotal);
  const midpoint = Math.ceil(sortedByDose.length / 2);
  const lower = sortedByDose.slice(0, midpoint);
  const higher = sortedByDose.slice(midpoint);
  const avgHours = (items) => items.reduce((sum, item) => sum + Number(item.sleepHours || 0), 0) / items.length;
  const avgScore = (items) => items.reduce((sum, item) => sum + Number(item.sleepScore || 0), 0) / items.length;

  return `Higher-dose days averaged ${formatNumber(avgHours(higher))}h sleep and a ${formatNumber(avgScore(higher))} sleep score, versus ${formatNumber(avgHours(lower))}h and ${formatNumber(avgScore(lower))} on lower-dose days.`;
}

function getBedtimeSpreadHours(state, limit = 14) {
  const bedtimes = getSortedOuraSleep(state)
    .slice(0, limit)
    .map((item) => {
      const bedtime = item.bedtime_start ? new Date(item.bedtime_start) : null;
      if (!bedtime || Number.isNaN(bedtime.getTime())) return null;
      return bedtime.getHours() + bedtime.getMinutes() / 60;
    })
    .filter((value) => Number.isFinite(value));
  if (bedtimes.length < 2) return null;
  return Math.max(...bedtimes) - Math.min(...bedtimes);
}

function getSleepFrictionInsights(state, limit = 14) {
  const points = getSleepDosePoints(state, limit).filter((point) => Number.isFinite(point.sleepHours));
  const thresholdHour = 15;
  const later = points.filter((point) => Number.isFinite(point.lastDoseHour) && point.lastDoseHour >= thresholdHour);
  const earlier = points.filter((point) => Number.isFinite(point.lastDoseHour) && point.lastDoseHour < thresholdHour);
  const avg = (items, key) => items.length ? items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length : null;
  const shortSleep = points.filter((point) => Number(point.sleepHours || 0) < 6.5);
  const lowScore = points.filter((point) => Number(point.sleepScore || 0) > 0 && Number(point.sleepScore || 0) < 70);
  const bedtimeSpreadHours = getBedtimeSpreadHours(state, limit);

  return {
    thresholdHour,
    count: points.length,
    later: {
      count: later.length,
      averageSleepHours: avg(later, "sleepHours"),
      averageSleepScore: avg(later, "sleepScore"),
      averageDoseMg: avg(later, "doseTotal"),
    },
    earlier: {
      count: earlier.length,
      averageSleepHours: avg(earlier, "sleepHours"),
      averageSleepScore: avg(earlier, "sleepScore"),
      averageDoseMg: avg(earlier, "doseTotal"),
    },
    shortSleepCount: shortSleep.length,
    lowScoreCount: lowScore.length,
    bedtimeSpreadHours,
  };
}

function getSleepPatternCards(state, limit = 14) {
  const insights = getSleepFrictionInsights(state, limit);
  const cards = [];
  if (Number.isFinite(insights.bedtimeSpreadHours)) {
    cards.push({
      title: "Bedtime regularity",
      detail:
        insights.bedtimeSpreadHours <= 1.5
          ? `Bedtime stayed within about ${formatNumber(insights.bedtimeSpreadHours)} hours.`
          : `Bedtime swung by about ${formatNumber(insights.bedtimeSpreadHours)} hours.`,
    });
  }
  if (insights.later.count && insights.earlier.count) {
    const delta = Number(insights.earlier.averageSleepHours || 0) - Number(insights.later.averageSleepHours || 0);
    cards.push({
      title: "Dose timing",
      detail:
        Math.abs(delta) < 0.25
          ? "Later and earlier dose nights are landing in a similar sleep range."
          : delta > 0
            ? `Earlier dose nights are averaging about ${formatNumber(delta)} more hours of sleep.`
            : `Later dose nights are averaging about ${formatNumber(Math.abs(delta))} more hours of sleep.`,
    });
  }
  cards.push({
    title: "Short sleep nights",
    detail: `${insights.shortSleepCount} of the last ${insights.count || 0} matched nights were under 6.5 hours.`,
  });
  cards.push({
    title: "Low-score nights",
    detail: `${insights.lowScoreCount} of the last ${insights.count || 0} matched nights had an Oura sleep score below 70.`,
  });
  return cards;
}

function getOuraAiContext(state) {
  const sleepPoints = getSleepDosePoints(state, 14).filter((point) => Number.isFinite(point.sleepHours));
  const friction = getSleepFrictionInsights(state, 14);
  const latestSleep = getLatestOuraSleep(state);
  const averageSleepHours = sleepPoints.length
    ? sleepPoints.reduce((sum, point) => sum + Number(point.sleepHours || 0), 0) / sleepPoints.length
    : null;
  const averageSleepScore = sleepPoints.length
    ? sleepPoints.reduce((sum, point) => sum + Number(point.sleepScore || 0), 0) / sleepPoints.length
    : null;
  const lateDoseThreshold = 15;
  const lateDoseNights = sleepPoints.filter((point) => Number.isFinite(point.lastDoseHour) && point.lastDoseHour >= lateDoseThreshold);
  const earlierDoseNights = sleepPoints.filter((point) => Number.isFinite(point.lastDoseHour) && point.lastDoseHour < lateDoseThreshold);
  const summarizeGroup = (items) => {
    if (!items.length) return null;
    return {
      count: items.length,
      averageSleepHours: items.reduce((sum, point) => sum + Number(point.sleepHours || 0), 0) / items.length,
      averageSleepScore: items.reduce((sum, point) => sum + Number(point.sleepScore || 0), 0) / items.length,
      averageDoseMg: items.reduce((sum, point) => sum + Number(point.doseTotal || 0), 0) / items.length,
    };
  };

  return {
    latestSleep: latestSleep
      ? {
          score: latestSleep.score ?? null,
          hours: latestSleep.total_sleep_duration ? Number(latestSleep.total_sleep_duration) / 3600 : null,
          bedtimeStart: latestSleep.bedtime_start || null,
          bedtimeEnd: latestSleep.bedtime_end || null,
        }
      : null,
    averageSleepHours,
    averageSleepScore,
    sleepInsightSummary: getSleepInsightSummary(state),
    sleepFriction: friction,
    laterDoseComparison: {
      thresholdHour: friction.thresholdHour,
      later: summarizeGroup(lateDoseNights),
      earlier: summarizeGroup(earlierDoseNights),
    },
    matchedNights: sleepPoints.map((point) => ({
      dayLabel: point.dayLabel,
      bedtime: point.bedtime?.toISOString?.() || null,
      lastDoseTime: point.lastDose?.timestamp || null,
      lastDoseHour: point.lastDoseHour,
      doseTotalMg: point.doseTotal,
      sleepHours: point.sleepHours,
      sleepScore: point.sleepScore,
      note: point.lastDose?.note || "",
    })),
  };
}

async function generateAiSummary(state) {
  const relayUrl = (state.settings.openAiRelayUrl || "").trim() || getDefaultOpenAiRelayUrl();

  const recentEntries = state.entries.slice(0, 60);
  const payload = {
    model: state.settings.openAiModel || "gpt-5.4",
    journal: {
      settings: state.settings,
      entries: recentEntries,
      ouraSleep: getRecentOuraSleep(state).slice(0, 14),
      ouraDerived: getOuraAiContext(state),
    },
  };

  const headers = { "Content-Type": "application/json" };
  if (relayUrl === getDefaultOpenAiRelayUrl()) {
    const session = await getSupabaseSession();
    if (!session?.access_token) {
      throw new Error("Sign in with email first so the built-in AI summary can use your Supabase relay.");
    }
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const response = await fetch(relayUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI summary failed: ${response.status} ${detail}`);
  }
  return response.json();
}

function renderInstallPrompt(button) {
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    button.classList.remove("hidden");
  });

  button?.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    button.classList.add("hidden");
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
