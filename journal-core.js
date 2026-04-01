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
    lastRefillDate: "",
    refillIntervalDays: 30,
    refillRequestLeadDays: 7,
  },
  integrations: {
    oura: {
      accessToken: "",
      expiresAt: "",
      scope: "",
      lastSyncAt: "",
      sleep: [],
      readiness: [],
      stress: [],
      resilience: [],
      heartrate: [],
      activity: [],
      workouts: [],
      spo2: [],
    },
  },
  auth: {
    email: "",
    userId: "",
  },
};

let toastTimerId = 0;

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
  if (entry.type === "refill") {
    return {
      id: entry.id || crypto.randomUUID(),
      type: "refill",
      tabletCount: Number(entry.tabletCount ?? entry.tablet_count) || 0,
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

function showToast(message, tone = "info") {
  const banner = document.querySelector("#toastBanner");
  if (!banner) return;
  banner.textContent = message;
  banner.dataset.tone = tone;
  banner.classList.add("is-visible");
  if (toastTimerId) {
    window.clearTimeout(toastTimerId);
  }
  toastTimerId = window.setTimeout(() => {
    banner.classList.remove("is-visible");
  }, 3200);
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
  let { data, error } = await client.auth.getSession();
  if (error) throw error;
  // If session is missing or nearly expired, attempt a silent token refresh
  if (!data.session || (data.session.expires_at && data.session.expires_at * 1000 <= Date.now() + 60_000)) {
    const { data: refreshed } = await client.auth.refreshSession().catch(() => ({ data: null }));
    if (refreshed?.session) data = refreshed;
  }
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
  let session = data.session || null;
  if (!session) return null;

  const expiresAtSeconds = Number(session.expires_at || 0);
  if (expiresAtSeconds && expiresAtSeconds * 1000 <= Date.now() + 60_000) {
    const { data: refreshData, error: refreshError } = await client.auth.refreshSession();
    if (refreshError) throw refreshError;
    session = refreshData.session || session;
  }

  return session;
}

function fetchSupabaseFunctionAnon(path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${SUPABASE_ANON_KEY}`);
  return fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    ...init,
    headers,
  });
}

async function fetchSupabaseFunctionWithSession(path, init = {}, options = {}) {
  const client = getSupabaseClient();
  let session = await getSupabaseSession();
  if (!session?.access_token) {
    throw new Error("Sign in with email first.");
  }

  const execute = async (token) => {
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
      ...init,
      headers,
      signal: options.signal || init.signal,
    });
  };

  let response = await execute(session.access_token);
  if (response.status !== 401 && response.status !== 403) {
    return response;
  }

  const retryText = await response.clone().text().catch(() => "");
  if (!/jwt/i.test(retryText)) {
    return response;
  }

  const { data: refreshData, error: refreshError } = await client.auth.refreshSession();
  if (refreshError || !refreshData.session?.access_token) {
    throw refreshError || new Error("Session refresh failed.");
  }

  response = await execute(refreshData.session.access_token);
  return response;
}

async function loadRemoteStateInto(state) {
  const client = getSupabaseClient();
  const user = await refreshAuthState(state);
  if (!user) return state;

  const [
    { data: settingsRows, error: settingsError },
    { data: entryRows, error: entriesError },
    { data: ouraRows },
  ] = await Promise.all([
    client.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    client.from("journal_entries").select("*").eq("user_id", user.id).order("timestamp", { ascending: false }),
    client.from("oura_cache").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  if (settingsError) throw settingsError;
  if (entriesError) throw entriesError;

  if (settingsRows) {
    state.settings = {
      ...defaultState.settings,
      ...state.settings,
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

  if (ouraRows) {
    state.integrations.oura = {
      ...state.integrations.oura,
      sleep: Array.isArray(ouraRows.sleep) ? ouraRows.sleep : state.integrations.oura.sleep,
      readiness: Array.isArray(ouraRows.readiness) ? ouraRows.readiness : state.integrations.oura.readiness,
      stress: Array.isArray(ouraRows.stress) ? ouraRows.stress : state.integrations.oura.stress,
      resilience: Array.isArray(ouraRows.resilience) ? ouraRows.resilience : state.integrations.oura.resilience,
      heartrate: Array.isArray(ouraRows.heartrate) ? ouraRows.heartrate : state.integrations.oura.heartrate,
      activity: Array.isArray(ouraRows.activity) ? ouraRows.activity : state.integrations.oura.activity,
      workouts: Array.isArray(ouraRows.workouts) ? ouraRows.workouts : state.integrations.oura.workouts,
      spo2: Array.isArray(ouraRows.spo2) ? ouraRows.spo2 : state.integrations.oura.spo2,
      lastSyncAt: ouraRows.synced_at ?? state.integrations.oura.lastSyncAt,
    };
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
    tablet_count: (entry.type === "dose" || entry.type === "refill") ? entry.tabletCount : null,
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

function parseLocalDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getOuraDisplayDate(item) {
  if (item?.day) return parseLocalDateKey(item.day);
  if (item?.bedtime_end) return new Date(item.bedtime_end);
  if (item?.bedtime_start) return new Date(item.bedtime_start);
  return null;
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
  return state.entries.filter((entry) => entry.type === "dose");
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

function getDoseDecaySeriesBetween(state, startMs, endMs, points = 73) {
  const halfLifeHours = Number(state.settings.decayHalfLifeHours) || defaultState.settings.decayHalfLifeHours;
  const decayConstant = Math.log(2) / Math.max(halfLifeHours, 0.1);
  const doseEntries = getDoseEntries(state).filter((entry) => new Date(entry.timestamp).getTime() >= startMs - 6 * halfLifeHours * 60 * 60 * 1000);
  const series = [];

  for (let index = 0; index < points; index += 1) {
    const timestamp = startMs + (index / (points - 1)) * (endMs - startMs);
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

function getStaticTimeTicks(startMs, endMs, hours = [0, 8, 16]) {
  const ticks = [];
  const cursor = startOfLocalDay(new Date(startMs - DAY_MS));
  const endBoundary = startOfLocalDay(new Date(endMs + DAY_MS));

  for (let dayMs = cursor.getTime(); dayMs <= endBoundary.getTime(); dayMs += DAY_MS) {
    const day = new Date(dayMs);
    for (const hour of hours) {
      const tickTime = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0).getTime();
      if (tickTime < startMs || tickTime > endMs) continue;
      ticks.push({
        timestamp: tickTime,
        label: new Date(tickTime).toLocaleTimeString([], { hour: "numeric" }),
      });
    }
  }

  return ticks;
}

function getRollingAverage(state, days) {
  const totals = getTotalsByDay(state, days);
  const total = totals.reduce((sum, item) => sum + item.total, 0);
  return total / days;
}

function getCurrentMonthTabletUsage(state) {
  // Refill-based tracking: anchor supply to the last logged Rx pickup
  const refillEntries = state.entries
    .filter((e) => e.type === "refill")
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (refillEntries.length > 0) {
    const lastRefill = refillEntries[0];
    const refillTimestamp = new Date(lastRefill.timestamp);
    const startingCount = Number(lastRefill.tabletCount) || 0;
    const used = state.entries
      .filter((e) => e.type === "dose" && new Date(e.timestamp) >= refillTimestamp)
      .reduce((sum, e) => sum + Number(e.tabletCount || 0), 0);
    return { used, planned: startingCount, remaining: Math.max(startingCount - used, 0) };
  }

  // Fall back to calendar month + settings when no refill has been logged
  const totalTablets = getCurrentMonthDoseEntries(state).reduce((sum, entry) => sum + Number(entry.tabletCount || 0), 0);
  const planned = Number(state.settings.monthlyTablets) || 0;
  return { used: totalTablets, planned, remaining: Math.max(planned - totalTablets, 0) };
}

function getRefillStatus(state) {
  const refillDate = parseLocalDateKey(state.settings.lastRefillDate);
  const refillIntervalDays = Number(state.settings.refillIntervalDays) || defaultState.settings.refillIntervalDays;
  const refillRequestLeadDays = Number(state.settings.refillRequestLeadDays) || defaultState.settings.refillRequestLeadDays;
  const usage = getCurrentMonthTabletUsage(state);

  if (!refillDate) {
    return {
      tone: "neutral",
      headline: "No refill date set",
      detail: "Add your last refill date in Settings to get a request reminder.",
      dueDate: null,
      requestDate: null,
      daysUntilDue: null,
      daysUntilRequest: null,
      onHand: usage.remaining,
    };
  }

  const dueDate = new Date(refillDate.getFullYear(), refillDate.getMonth(), refillDate.getDate() + refillIntervalDays);
  const requestDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate() - refillRequestLeadDays);
  const today = startOfLocalDay(new Date());
  const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / DAY_MS);
  const daysUntilRequest = Math.round((requestDate.getTime() - today.getTime()) / DAY_MS);

  if (daysUntilDue < 0) {
    return {
      tone: "red",
      headline: "Refill overdue",
      detail: `Due ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? "" : "s"} ago. About ${formatNumber(usage.remaining)} tablets estimated on hand.`,
      dueDate,
      requestDate,
      daysUntilDue,
      daysUntilRequest,
      onHand: usage.remaining,
    };
  }

  if (daysUntilRequest <= 0) {
    return {
      tone: "orange",
      headline: "Request refill now",
      detail: `Due ${dueDate.toLocaleDateString()}. Request window opened ${Math.abs(daysUntilRequest)} day${Math.abs(daysUntilRequest) === 1 ? "" : "s"} ago.`,
      dueDate,
      requestDate,
      daysUntilDue,
      daysUntilRequest,
      onHand: usage.remaining,
    };
  }

  return {
    tone: "green",
    headline: `Refill due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`,
    detail: `Ask ${refillRequestLeadDays} day${refillRequestLeadDays === 1 ? "" : "s"} early. Request window opens ${requestDate.toLocaleDateString()}.`,
    dueDate,
    requestDate,
    daysUntilDue,
    daysUntilRequest,
    onHand: usage.remaining,
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

function getDoseTone(totalMg) {
  const total = Number(totalMg) || 0;
  if (total <= 15) {
    return {
      tone: "green",
      label: "On track",
      reason: "Today is at or under 15 mg, which is still in the low-use range.",
    };
  }
  if (total <= 20) {
    return {
      tone: "lime",
      label: "Climbing",
      reason: "Today is above 15 mg and starting to push into a moderate range.",
    };
  }
  if (total <= 25) {
    return {
      tone: "yellow",
      label: "Use caution",
      reason: "Today is in the 20 to 25 mg caution range.",
    };
  }
  if (total <= 30) {
    return {
      tone: "orange",
      label: "High today",
      reason: "Today is between 25 and 30 mg, which is a high-use day.",
    };
  }
  return {
    tone: "red",
    label: "Over limit",
    reason: "Today is above 30 mg and likely to create sleep friction.",
  };
}

function getHomeGauge(state) {
  const todayDose = getTodayDoseEntries(state).reduce((sum, entry) => sum + Number(entry.amount), 0);
  const target = Number(state.settings.dailyTarget) || defaultState.settings.dailyTarget;
  const ratio = target > 0 ? todayDose / target : 0;
  return { ...getDoseTone(todayDose), ratio };
}

function getEstimatedActiveLevel(state, atTime = Date.now()) {
  const halfLifeHours = Number(state.settings.decayHalfLifeHours) || defaultState.settings.decayHalfLifeHours;
  const decayConstant = Math.log(2) / Math.max(halfLifeHours, 0.1);
  let level = 0;
  for (const entry of getDoseEntries(state)) {
    const doseTime = new Date(entry.timestamp).getTime();
    if (doseTime > atTime) continue;
    const elapsedHours = (atTime - doseTime) / (60 * 60 * 1000);
    level += Number(entry.amount) * Math.exp(-decayConstant * elapsedHours);
  }
  return level;
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

function saveRefillEntry(state, tabletCount, timestamp, note) {
  state.entries.push({
    id: crypto.randomUUID(),
    type: "refill",
    tabletCount: Number(tabletCount) || 0,
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
  return fetchSupabaseFunctionAnon("oura-authorize")
    .then((response) => response.json().catch(() => ({})).then((payload) => ({ response, payload })))
    .then(({ response, payload }) => {
      if (!response.ok || !payload?.auth_url) {
        throw new Error(payload?.error || payload?.message || `Oura connect failed: ${response.status}`);
      }
      window.location.assign(payload.auth_url);
    });
}

function disconnectOura(state) {
  state.integrations.oura = { ...defaultState.integrations.oura };
  persistState(state);
}

async function disconnectOuraRemote(state) {
  const response = await fetchSupabaseFunctionAnon("oura-disconnect", {
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Oura disconnect failed: ${response.status}`);
  }

  disconnectOura(state);
}

async function getOuraConnectionStatus() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetchSupabaseFunctionAnon("oura-status", {
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Oura status check timed out.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Oura status failed: ${response.status}`);
  }
  return { ...payload, checked: true };
}

async function syncOuraSleep(state) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetchSupabaseFunctionAnon("oura-sync", {
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Oura sync timed out after 15 seconds.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Oura sync failed: ${response.status}`);
  }
  state.integrations.oura.sleep = Array.isArray(payload.data) ? payload.data : [];
  state.integrations.oura.readiness = Array.isArray(payload.readiness) ? payload.readiness : [];
  state.integrations.oura.stress = Array.isArray(payload.stress) ? payload.stress : [];
  state.integrations.oura.resilience = Array.isArray(payload.resilience) ? payload.resilience : [];
  state.integrations.oura.heartrate = Array.isArray(payload.heartrate) ? payload.heartrate : [];
  state.integrations.oura.activity = Array.isArray(payload.activity) ? payload.activity : [];
  state.integrations.oura.workouts = Array.isArray(payload.workouts) ? payload.workouts : [];
  state.integrations.oura.spo2 = Array.isArray(payload.spo2) ? payload.spo2 : [];
  state.integrations.oura.lastSyncAt = new Date().toISOString();
  persistState(state);

  // Persist Oura data to Supabase so it's available on any device
  const client = getSupabaseClient();
  const user = await refreshAuthState(state);
  if (user) {
    await client.from("oura_cache").upsert({
      user_id: user.id,
      sleep: state.integrations.oura.sleep,
      readiness: state.integrations.oura.readiness,
      stress: state.integrations.oura.stress,
      resilience: state.integrations.oura.resilience,
      heartrate: state.integrations.oura.heartrate,
      activity: state.integrations.oura.activity,
      workouts: state.integrations.oura.workouts,
      spo2: state.integrations.oura.spo2,
      synced_at: state.integrations.oura.lastSyncAt,
    }, { onConflict: "user_id" });
  }

  return { sleep: state.integrations.oura.sleep, warnings: payload.sync_warnings || [] };
}

function getRecentOuraSleep(state) {
  return Array.isArray(state.integrations?.oura?.sleep) ? state.integrations.oura.sleep : [];
}

function getRecentOuraReadiness(state) {
  return Array.isArray(state.integrations?.oura?.readiness) ? state.integrations.oura.readiness : [];
}

function getRecentOuraStress(state) {
  return Array.isArray(state.integrations?.oura?.stress) ? state.integrations.oura.stress : [];
}

function getRecentOuraResilience(state) {
  return Array.isArray(state.integrations?.oura?.resilience) ? state.integrations.oura.resilience : [];
}

function getRecentOuraHeartrate(state) {
  return Array.isArray(state.integrations?.oura?.heartrate) ? state.integrations.oura.heartrate : [];
}

function getRecentOuraActivity(state) {
  return Array.isArray(state.integrations?.oura?.activity) ? state.integrations.oura.activity : [];
}

function getRecentOuraWorkouts(state) {
  return Array.isArray(state.integrations?.oura?.workouts) ? state.integrations.oura.workouts : [];
}

function getRecentOuraSpo2(state) {
  return Array.isArray(state.integrations?.oura?.spo2) ? state.integrations.oura.spo2 : [];
}

function getLatestByDay(items) {
  return items
    .slice()
    .sort((a, b) => String(b?.day || b?.timestamp || "").localeCompare(String(a?.day || a?.timestamp || "")))[0] || null;
}

function getLatestOuraReadiness(state) {
  return getLatestByDay(getRecentOuraReadiness(state));
}

function getLatestOuraStress(state) {
  return getLatestByDay(getRecentOuraStress(state));
}

function getLatestOuraResilience(state) {
  return getLatestByDay(getRecentOuraResilience(state));
}

function getLatestOuraHeartrateSample(state) {
  const items = getRecentOuraHeartrate(state).slice().sort((a, b) => String(b?.timestamp || "").localeCompare(String(a?.timestamp || "")));
  return items[0] || null;
}

function getOuraRecoverySnapshot(state) {
  const readiness = getLatestOuraReadiness(state);
  const stress = getLatestOuraStress(state);
  const resilience = getLatestOuraResilience(state);
  const heartrate = getLatestOuraHeartrateSample(state);
  const activity = getLatestByDay(getRecentOuraActivity(state));
  const spo2 = getLatestByDay(getRecentOuraSpo2(state));

  return {
    readinessScore: Number(readiness?.score || 0) || null,
    readinessDay: readiness?.day || null,
    temperatureDeviation: Number(
      readiness?.temperature_deviation ??
      readiness?.contributors?.body_temperature ??
      readiness?.contributors?.temperature ??
      NaN
    ),
    stressSummary: stress?.stress_high ? "High" : stress?.recovery_high ? "Recovered" : stress?.day ? "Normal" : null,
    stressDay: stress?.day || null,
    resilienceLevel: resilience?.level || resilience?.resilience_level || null,
    resilienceDay: resilience?.day || null,
    latestHeartRate: Number(heartrate?.bpm || heartrate?.heart_rate || 0) || null,
    latestHeartRateAt: heartrate?.timestamp || null,
    latestHrv: Number(readiness?.contributors?.hrv_balance || heartrate?.hrv || heartrate?.rmssd || 0) || null,
    activityScore: Number(activity?.score || 0) || null,
    activityDay: activity?.day || null,
    steps: Number(activity?.steps || 0) || null,
    activeCalories: Number(activity?.active_calories || 0) || null,
    spo2Average: Number(spo2?.spo2_percentage?.average || 0) || null,
    spo2Day: spo2?.day || null,
  };
}

function getRecoveryContextMessage(state) {
  const recovery = getOuraRecoverySnapshot(state);
  const latestSleep = getLatestOuraSleep(state);

  // No data at all
  const hasAnyData = recovery.readinessScore || recovery.latestHrv || latestSleep;
  if (!hasAnyData) return null;

  const readiness = recovery.readinessScore;
  const hrv = recovery.latestHrv;
  const tempDev = recovery.temperatureDeviation;
  const stress = recovery.stressSummary;
  const sleepHours = latestSleep?.total_sleep_duration ? Number(latestSleep.total_sleep_duration) / 3600 : null;
  const sleepScore = latestSleep?.score ? Number(latestSleep.score) : null;
  const spo2 = recovery.spo2Average;

  // Possible illness signal
  if (Number.isFinite(tempDev) && tempDev >= 0.8) {
    return {
      tone: "warning",
      headline: "Temperature elevated",
      detail: `Your body temp is ${tempDev > 0 ? "+" : ""}${tempDev.toFixed(1)}° from baseline. Your body may be fighting something — worth being mindful of how you feel today.`,
    };
  }

  // Low SpO2
  if (Number.isFinite(spo2) && spo2 < 94) {
    return {
      tone: "warning",
      headline: "Low blood oxygen last night",
      detail: `SpO2 averaged ${spo2.toFixed(1)}% — below the typical healthy range. Sleep quality may have been affected more than the score suggests.`,
    };
  }

  // Very low readiness
  if (Number.isFinite(readiness) && readiness < 60) {
    return {
      tone: "caution",
      headline: "Recovery is low today",
      detail: `Readiness score is ${readiness}. Stimulants may feel more intense or wear off differently. Earlier timing for your last dose could help tonight's sleep.`,
    };
  }

  // High stress
  if (stress === "High") {
    return {
      tone: "caution",
      headline: "Stress signal detected",
      detail: "Oura flagged elevated stress. Your nervous system is already working hard — be mindful of how you feel as the day progresses.",
    };
  }

  // Poor sleep
  if (Number.isFinite(sleepHours) && sleepHours < 6) {
    return {
      tone: "caution",
      headline: "Short sleep last night",
      detail: `Only ${sleepHours.toFixed(1)}h of sleep. You may feel like you need more today — try to stick close to your usual pattern and prioritize an early last dose.`,
    };
  }

  // Low sleep score (but not short)
  if (Number.isFinite(sleepScore) && sleepScore < 65) {
    return {
      tone: "caution",
      headline: "Sleep quality was low",
      detail: `Sleep score was ${sleepScore}. Quality rest matters for how stimulants feel — your response today may be less predictable.`,
    };
  }

  // Moderate readiness
  if (Number.isFinite(readiness) && readiness >= 60 && readiness < 75) {
    return {
      tone: "neutral",
      headline: "Moderate recovery",
      detail: `Readiness is ${readiness} — not fully recovered but not a red flag. A typical day is likely fine; just keep an eye on how you feel.`,
    };
  }

  // Good recovery
  if (Number.isFinite(readiness) && readiness >= 75) {
    return {
      tone: "good",
      headline: "Well recovered today",
      detail: `Readiness is ${readiness}${stress === "Recovered" ? " and stress is low" : ""}. Stimulant response is likely to be typical today.`,
    };
  }

  // Sleep only (no readiness)
  if (Number.isFinite(sleepHours) && sleepHours >= 7 && Number.isFinite(sleepScore) && sleepScore >= 75) {
    return {
      tone: "good",
      headline: "Good sleep last night",
      detail: `${sleepHours.toFixed(1)}h with a score of ${sleepScore}. Starting the day well rested.`,
    };
  }

  return null;
}

function scoreColor(score, thresholds = { good: 85, ok: 70 }) {
  if (!Number.isFinite(score)) return "";
  if (score >= thresholds.good) return "metric--good";
  if (score >= thresholds.ok) return "metric--ok";
  return "metric--poor";
}

function applyScoreColor(el, score, thresholds) {
  if (!el) return;
  el.className = el.className.replace(/\bmetric--(good|ok|poor)\b/g, "").trim();
  const cls = scoreColor(score, thresholds);
  if (cls) el.classList.add(cls);
}

function getRecoveryInterpretations(state) {
  const snap = getOuraRecoverySnapshot(state);
  const out = {};

  // Readiness
  if (Number.isFinite(snap.readinessScore)) {
    const s = snap.readinessScore;
    out.readiness =
      s >= 85 ? "Body is primed today" :
      s >= 70 ? "Decent baseline today" :
      s >= 60 ? "Body needs more rest" :
      "High recovery debt today";
  }

  // HRV balance contributor (0-100 scale)
  if (Number.isFinite(snap.latestHrv)) {
    const h = snap.latestHrv;
    out.hrv =
      h >= 80 ? "Strong autonomic tone" :
      h >= 60 ? "HRV within normal range" :
      h >= 40 ? "Mild autonomic strain" :
      "HRV suppressed — body working hard";
  }

  // Stress
  if (snap.stressSummary) {
    out.stress =
      snap.stressSummary === "High" ? "Elevated physiological stress" :
      snap.stressSummary === "Recovered" ? "Body in recovery mode" :
      "Stress levels look balanced";
  }

  // Resilience
  if (snap.resilienceLevel) {
    const l = snap.resilienceLevel.toLowerCase();
    out.resilience =
      l === "exceptional" ? "Excellent stress recovery capacity" :
      l === "strong" ? "Good capacity to handle load" :
      l === "adequate" ? "Moderate resilience buffer" :
      "Resilience is lower than usual";
  }

  // Resting heart rate
  if (Number.isFinite(snap.latestHeartRate)) {
    const hr = snap.latestHeartRate;
    out.heartRate =
      hr <= 55 ? "Very low resting HR — well recovered" :
      hr <= 65 ? "Resting HR looks healthy" :
      hr <= 75 ? "Slightly elevated resting HR" :
      "Elevated resting HR — monitor recovery";
  }

  // Skin temperature deviation
  if (Number.isFinite(snap.temperatureDeviation)) {
    const t = snap.temperatureDeviation;
    out.temp =
      Math.abs(t) < 0.3 ? "Body temp is baseline normal" :
      t >= 0.8 ? "Elevated temp — possible illness or fatigue" :
      t >= 0.3 ? "Slightly warmer than baseline" :
      t <= -0.5 ? "Cooler than baseline — watch for illness" :
      "Temp slightly below baseline";
  }

  // Activity score
  if (Number.isFinite(snap.activityScore)) {
    const a = snap.activityScore;
    out.activity =
      a >= 85 ? "Activity target hit — great movement" :
      a >= 70 ? "Good activity levels today" :
      a >= 50 ? "Moderate movement — room to add more" :
      "Low activity today";
  }

  // Steps
  if (Number.isFinite(snap.steps)) {
    const s = snap.steps;
    out.steps =
      s >= 10000 ? "Step goal crushed" :
      s >= 7500 ? "Solid step count" :
      s >= 5000 ? "Moderate steps" :
      "Low step count today";
  }

  // SpO2
  if (Number.isFinite(snap.spo2Average)) {
    const o = snap.spo2Average;
    out.spo2 =
      o >= 97 ? "Blood oxygen excellent" :
      o >= 95 ? "Blood oxygen normal" :
      o >= 93 ? "Slightly low SpO2 — rest recommended" :
      "Low SpO2 — check sleep quality";
  }

  return out;
}

function getSleepStages(sleepItem) {
  if (!sleepItem) return null;
  const deep = Number(sleepItem.deep_sleep_duration || 0);
  const rem = Number(sleepItem.rem_sleep_duration || 0);
  const light = Number(sleepItem.light_sleep_duration || 0);
  const awake = Number(sleepItem.awake_time || 0);
  const total = deep + rem + light + awake;
  if (!total) return null;
  return {
    deep, rem, light, awake, total,
    deepPct: Math.round(deep / total * 100),
    remPct: Math.round(rem / total * 100),
    lightPct: Math.round(light / total * 100),
    awakePct: Math.round(awake / total * 100),
    deepH: deep / 3600,
    remH: rem / 3600,
    lightH: light / 3600,
    awakeH: awake / 3600,
  };
}

function mergeOuraSleepDay(existing, incoming) {
  const existingDuration = Number(existing?.total_sleep_duration || 0);
  const incomingDuration = Number(incoming?.total_sleep_duration || 0);
  const primary = incomingDuration > existingDuration ? incoming : existing;
  const secondary = primary === incoming ? existing : incoming;

  return {
    ...secondary,
    ...primary,
    day: primary?.day || secondary?.day || null,
    score: primary?.score ?? secondary?.score ?? null,
    total_sleep_duration: incomingDuration > existingDuration ? incoming.total_sleep_duration : existing.total_sleep_duration,
    time_in_bed: primary?.time_in_bed ?? secondary?.time_in_bed ?? null,
    bedtime_start: primary?.bedtime_start ?? secondary?.bedtime_start ?? null,
    bedtime_end: primary?.bedtime_end ?? secondary?.bedtime_end ?? null,
  };
}

function getNormalizedOuraSleep(state) {
  const byDay = new Map();
  for (const item of getRecentOuraSleep(state)) {
    if (!item) continue;
    const key = item.day || dateKey(getOuraDisplayDate(item) || new Date());
    const existing = byDay.get(key);
    byDay.set(key, existing ? mergeOuraSleepDay(existing, item) : item);
  }
  return Array.from(byDay.values());
}

function getSortedOuraSleep(state) {
  return getNormalizedOuraSleep(state)
    .filter((item) => item && (item.bedtime_start || item.day))
    .slice()
    .sort((a, b) => {
      const aTime = getOuraDisplayDate(a)?.getTime?.() || 0;
      const bTime = getOuraDisplayDate(b)?.getTime?.() || 0;
      return bTime - aTime;
    });
}

function getLatestOuraSleep(state) {
  return getSortedOuraSleep(state)[0] || null;
}

function getUpcomingBedtime(state) {
  const sleepItems = getSortedOuraSleep(state)
    .slice(0, 10)
    .map((item) => {
      const bedtime = item?.bedtime_start ? new Date(item.bedtime_start) : null;
      if (!bedtime || Number.isNaN(bedtime.getTime())) return null;
      let hour = bedtime.getHours() + bedtime.getMinutes() / 60;
      if (hour < 12) hour += 24;
      return hour;
    })
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const typicalHour = sleepItems.length
    ? sleepItems[Math.floor(sleepItems.length / 2)]
    : 23.5;

  const now = new Date();
  const bedtimeToday = new Date(now);
  bedtimeToday.setHours(Math.floor(typicalHour % 24), Math.round((typicalHour % 1) * 60), 0, 0);
  if (typicalHour >= 24) bedtimeToday.setDate(bedtimeToday.getDate() + 1);

  if (bedtimeToday.getTime() <= now.getTime() + 30 * 60 * 1000) {
    bedtimeToday.setDate(bedtimeToday.getDate() + 1);
  }

  return bedtimeToday;
}

function getDoseRecommendation(state, nowMs = Date.now()) {
  const roundedNow = Math.round(nowMs / (15 * 60 * 1000)) * 15 * 60 * 1000;
  const currentLevel = getEstimatedActiveLevel(state, roundedNow);
  const upcomingBedtime = getUpcomingBedtime(state);
  const hoursUntilBedtime = (upcomingBedtime.getTime() - roundedNow) / (60 * 60 * 1000);
  const standardDose = Number(state.settings.mgPerTablet) || defaultState.settings.mgPerTablet;
  const halfLifeHours = Number(state.settings.decayHalfLifeHours) || defaultState.settings.decayHalfLifeHours;
  const predictedLevelAtBedtime = getEstimatedActiveLevel(state, upcomingBedtime.getTime());
  const predictedWithDoseAtBedtime =
    predictedLevelAtBedtime +
    standardDose * Math.exp(-(Math.log(2) / Math.max(halfLifeHours, 0.1)) * Math.max(hoursUntilBedtime, 0));

  if (hoursUntilBedtime <= 2 || predictedWithDoseAtBedtime >= 20) {
    return {
      tone: "red",
      headline: "🚨 Avoid another dose",
      detail: `About ${formatNumber(hoursUntilBedtime)}h until your expected bedtime. Another ${formatNumber(standardDose)} ${unitLabel(state)} now would leave about ${formatNumber(predictedWithDoseAtBedtime)} ${unitLabel(state)} active at bedtime.`,
      currentLevel,
      predictedWithDoseAtBedtime,
      hoursUntilBedtime,
    };
  }
  if (hoursUntilBedtime <= 5 || predictedWithDoseAtBedtime >= 12) {
    return {
      tone: "orange",
      headline: "⚠️ Use caution now",
      detail: `Current estimated active level is ${formatNumber(currentLevel)} ${unitLabel(state)}. A standard dose now likely leaves about ${formatNumber(predictedWithDoseAtBedtime)} ${unitLabel(state)} active by bedtime.`,
      currentLevel,
      predictedWithDoseAtBedtime,
      hoursUntilBedtime,
    };
  }
  return {
    tone: "green",
    headline: "🟢 Lower sleep-risk window",
    detail: `Roughly ${formatNumber(hoursUntilBedtime)}h until your expected bedtime. Current active level is about ${formatNumber(currentLevel)} ${unitLabel(state)}.`,
    currentLevel,
    predictedWithDoseAtBedtime,
    hoursUntilBedtime,
  };
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
  return getRecentOuraSleep(state)
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

function formatLocalDateTimeForAi(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLocalTimeForAi(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildAiJournalPayload(state) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  return {
    timezone,
    generatedAtLocal: formatLocalDateTimeForAi(new Date().toISOString()),
    settings: state.settings,
    entries: state.entries.slice(0, 60).map((entry) => ({
      type: entry.type,
      localDateTime: formatLocalDateTimeForAi(entry.timestamp),
      localTime: formatLocalTimeForAi(entry.timestamp),
      tabletCount: entry.type === "dose" ? Number(entry.tabletCount || 0) : null,
      amountMg: entry.type === "dose" ? Number(entry.amount || 0) : null,
      mgPerTablet: entry.type === "dose" ? Number(entry.mgPerTablet || state.settings.mgPerTablet || defaultState.settings.mgPerTablet) : null,
      note: entry.note || "",
    })),
    ouraSleep: getRecentOuraSleep(state).slice(0, 14).map((item) => ({
      day: item.day || null,
      bedtimeStartLocal: item.bedtime_start ? formatLocalDateTimeForAi(item.bedtime_start) : null,
      bedtimeEndLocal: item.bedtime_end ? formatLocalDateTimeForAi(item.bedtime_end) : null,
      sleepHours: item.total_sleep_duration ? Number(item.total_sleep_duration) / 3600 : null,
      score: Number(item.score || 0) || null,
    })),
    ouraReadiness: getRecentOuraReadiness(state).slice(0, 14).map((item) => ({
      day: item.day || null,
      score: Number(item.score || 0) || null,
      temperatureDeviation: Number(item.temperature_deviation || 0) || null,
    })),
    ouraStress: getRecentOuraStress(state).slice(0, 14),
    ouraResilience: getRecentOuraResilience(state).slice(0, 14),
    ouraHeartRate: getRecentOuraHeartrate(state).slice(0, 24),
    ouraActivity: getRecentOuraActivity(state).slice(0, 14).map((item) => ({
      day: item.day || null,
      score: Number(item.score || 0) || null,
      steps: Number(item.steps || 0) || null,
      activeCalories: Number(item.active_calories || 0) || null,
      totalCalories: Number(item.total_calories || 0) || null,
    })),
    ouraWorkouts: getRecentOuraWorkouts(state).slice(0, 14).map((item) => ({
      day: item.day || null,
      activity: item.activity || null,
      duration: item.duration || null,
      calories: Number(item.calories || 0) || null,
      intensity: item.intensity || null,
      startLocal: item.start_datetime ? formatLocalDateTimeForAi(item.start_datetime) : null,
    })),
    ouraSpo2: getRecentOuraSpo2(state).slice(0, 14).map((item) => ({
      day: item.day || null,
      average: item.spo2_percentage?.average || null,
      minimum: item.spo2_percentage?.minimum || null,
    })),
    ouraRecovery: getOuraRecoverySnapshot(state),
    ouraDerived: getOuraAiContext(state),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInlineAiText(value) {
  let text = escapeHtml(value);
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return text;
}

function formatAiSummaryHtml(summary) {
  const lines = String(summary || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return "<p>No summary returned.</p>";
  }

  const html = [];
  let inList = false;
  let inSection = false;

  const closeList = () => {
    if (inList) { html.push("</ul>"); inList = false; }
  };
  const closeSection = () => {
    closeList();
    if (inSection) { html.push("</div></details>"); inSection = false; }
  };

  for (const line of lines) {
    // ## Heading or ### Heading — open a collapsible section
    const mdHeadingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (mdHeadingMatch) {
      closeSection();
      const rawTitle = mdHeadingMatch[1];
      const title = formatInlineAiText(rawTitle);
      const isRec = /recommendations?/i.test(rawTitle);
      const cls = isRec ? "ai-section ai-section-recs" : "ai-section";
      html.push(`<details class="${cls}" open><summary class="ai-section-heading">${title}</summary><div class="ai-section-body">`);
      inSection = true;
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      if (!inList) { html.push("<ul>"); inList = true; }
      html.push(`<li>${formatInlineAiText(bulletMatch[1])}</li>`);
      continue;
    }

    closeList();

    // Standalone numbered header without ## (e.g. "1. Overall pattern")
    const numberedHeaderMatch = line.match(/^(\d+)\.\s+([^:].+)$/);
    if (numberedHeaderMatch) {
      closeSection();
      const title = formatInlineAiText(`${numberedHeaderMatch[1]}. ${numberedHeaderMatch[2]}`);
      html.push(`<details class="ai-section" open><summary class="ai-section-heading">${title}</summary><div class="ai-section-body">`);
      inSection = true;
      continue;
    }

    // Colon header (e.g. "Recommendations:" or "Key finding: text")
    const colonHeaderMatch = line.match(/^([^:]{2,60}):\s*(.*)$/);
    if (colonHeaderMatch) {
      const rawHeader = colonHeaderMatch[1];
      const isRec = /recommendations?/i.test(rawHeader);
      if (isRec) {
        closeSection();
        html.push(`<details class="ai-section ai-section-recs" open><summary class="ai-section-heading">${formatInlineAiText(rawHeader)}</summary><div class="ai-section-body">`);
        inSection = true;
        const body = colonHeaderMatch[2].trim();
        if (body) html.push(`<p>${formatInlineAiText(body)}</p>`);
      } else {
        const header = formatInlineAiText(rawHeader);
        const body = formatInlineAiText(colonHeaderMatch[2]);
        html.push(body ? `<p><strong>${header}:</strong> ${body}</p>` : `<p><strong>${header}</strong></p>`);
      }
      continue;
    }

    html.push(`<p>${formatInlineAiText(line)}</p>`);
  }

  closeSection();
  return html.join("");
}

async function generateAiSummary(state) {
  const customRelay = (state.settings.openAiRelayUrl || "").trim();
  const payload = {
    mode: "summary",
    model: state.settings.openAiModel || "gpt-5.4",
    journal: buildAiJournalPayload(state),
  };
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };

  let response;
  if (customRelay) {
    response = await fetch(customRelay, init);
  } else {
    response = await fetchSupabaseFunctionAnon("openai-summary", init);
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI summary failed: ${response.status} ${detail}`);
  }
  return response.json();
}

async function askAiJournalChat(state, messages) {
  const customRelay = (state.settings.openAiRelayUrl || "").trim();
  const payload = {
    mode: "chat",
    model: state.settings.openAiModel || "gpt-5.4",
    journal: buildAiJournalPayload(state),
    messages,
  };
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };

  let response;
  if (customRelay) {
    response = await fetch(customRelay, init);
  } else {
    response = await fetchSupabaseFunctionAnon("openai-summary", init);
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI chat failed: ${response.status} ${detail}`);
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
