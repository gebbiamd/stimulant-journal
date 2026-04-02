"use strict";

let state = loadState();
if (consumeOuraRedirect(state)) {
  state = loadState();
}

const els = {
  settingsForm: document.querySelector("#settingsForm"),
  authStatus: document.querySelector("#authStatus"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  authCreateButton: document.querySelector("#authCreateButton"),
  authSignInButton: document.querySelector("#authSignInButton"),
  authRefreshButton: document.querySelector("#authRefreshButton"),
  authSignOutButton: document.querySelector("#authSignOutButton"),
  medicationName: document.querySelector("#medicationName"),
  doseUnit: document.querySelector("#doseUnit"),
  dailyTarget: document.querySelector("#dailyTarget"),
  monthlyTarget: document.querySelector("#monthlyTarget"),
  doseDaysTarget: document.querySelector("#doseDaysTarget"),
  mgPerTablet: document.querySelector("#mgPerTablet"),
  decayHalfLifeHours: document.querySelector("#decayHalfLifeHours"),
  vacationThreshold: document.querySelector("#vacationThreshold"),
  vacationDoseThreshold: document.querySelector("#vacationDoseThreshold"),
  vacationFrequencyDays: document.querySelector("#vacationFrequencyDays"),
  openAiRelayUrl: document.querySelector("#openAiRelayUrl"),
  openAiModel: document.querySelector("#openAiModel"),
  ouraClientId: document.querySelector("#ouraClientId"),
  refillIntervalDays: document.querySelector("#refillIntervalDays"),
  refillRequestLeadDays: document.querySelector("#refillRequestLeadDays"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  reloadEntriesButton: document.querySelector("#reloadEntriesButton"),
  entryEditorList: document.querySelector("#entryEditorList"),
  entryEditorEmpty: document.querySelector("#entryEditorEmpty"),
  ouraStatus: document.querySelector("#ouraStatus"),
  openAiStatus: document.querySelector("#openAiStatus"),
  ouraConnectButton: document.querySelector("#ouraConnectButton"),
  ouraDisconnectButton: document.querySelector("#ouraDisconnectButton"),
  trtCompoundList: document.querySelector("#trtCompoundList"),
  addTrtCompound: document.querySelector("#addTrtCompound"),
  trtStockMl: document.querySelector("#trtStockMl"),
  trtStockVials: document.querySelector("#trtStockVials"),
  trtRefillThresholdMl: document.querySelector("#trtRefillThresholdMl"),
};

let ouraConnectionStatus = { connected: false, checked: false, error: "" };

function setNotice(message, tone = "info") {
  showToast(message, tone);
}

function setBusy(button, busyLabel, isBusy) {
  if (!button) return;
  if (isBusy) {
    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.textContent;
    }
    button.textContent = busyLabel;
    button.disabled = true;
    button.classList.add("is-busy");
    return;
  }
  if (button.dataset.originalLabel) {
    button.textContent = button.dataset.originalLabel;
  }
  button.disabled = false;
  button.classList.remove("is-busy");
}

function getFriendlyAuthMessage(error) {
  const message = String(error?.message || "Something went wrong.").trim();
  const normalized = message.toLowerCase();
  if (normalized.includes("email not confirmed")) {
    return "Your account exists, but Supabase still needs the one-time email confirmation before the first sign-in.";
  }
  if (normalized.includes("invalid login credentials")) {
    return "That email/password combination did not work. If you just created the account, confirm the email first and then try again.";
  }
  if (normalized.includes("password should be at least")) {
    return "Use a password that is at least 6 characters long.";
  }
  if (normalized.includes("user already registered")) {
    return "That email already has an account. Try Sign In instead.";
  }
  return message;
}

function hydrate() {
  Object.entries(state.settings).forEach(([key, value]) => {
    if (els[key]) els[key].value = value;
  });
  if (els.authStatus) {
    els.authStatus.textContent = state.auth?.email ? state.auth.email : "Not signed in";
  }
  if (els.authEmail) {
    els.authEmail.value = state.auth?.email || "";
  }
  if (els.authPassword) {
    els.authPassword.value = "";
  }
  if (els.ouraStatus) {
    els.ouraStatus.textContent = !ouraConnectionStatus.checked
      ? "Checking..."
      : ouraConnectionStatus.error
      ? ouraConnectionStatus.error
      : ouraConnectionStatus.connected
      ? `Connected${state.integrations.oura.lastSyncAt ? `, last sync ${new Date(state.integrations.oura.lastSyncAt).toLocaleString()}` : ""}`
      : "Not connected";
  }
  if (els.openAiStatus) {
    els.openAiStatus.textContent = state.settings.openAiRelayUrl ? "Relay configured" : "Relay not configured";
  }
  renderEntryEditor();
  renderTrtCompounds();
}

async function refreshOuraConnectionStatus() {
  try {
    ouraConnectionStatus = await getOuraConnectionStatus();
  } catch (error) {
    ouraConnectionStatus = {
      connected: false,
      checked: true,
      error: "Status unavailable",
    };
    console.error("Oura status refresh failed", error);
  }
}

function formatCompactDateTimeValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = String(date.getFullYear()).slice(-2);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}/${day}/${year} ${hours}:${minutes}`;
}

function parseCompactDateTimeValue(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return parseTimestamp(text);
  const [, monthText, dayText, yearText, hourText, minuteText] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  const year = Number(yearText.length === 2 ? `20${yearText}` : yearText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const candidate = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(candidate.getTime()) ? parseTimestamp(text) : candidate.toISOString();
}

function saveStateAndSync(message) {
  state.entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  persistState(state);
  queueRemoteSync(state);
  hydrate();
  setNotice(message, "success");
}

const ENTRY_TYPE_META = {
  dose:             { label: "Dose",        emoji: "💊", color: "entry-type-dose",       hasValue: true,  valuePlaceholder: "tabs",  valueLabel: "Tabs",  isTrt: false },
  refill:           { label: "Rx Pickup",   emoji: "📦", color: "entry-type-refill",     hasValue: true,  valuePlaceholder: "tabs",  valueLabel: "Qty",   isTrt: false },
  adjustment:       { label: "Adjustment",  emoji: "⚖️", color: "entry-type-adjustment", hasValue: true,  valuePlaceholder: "tabs",  valueLabel: "Adj",   isTrt: false },
  note:             { label: "Note",        emoji: "📝", color: "entry-type-note",       hasValue: false, valuePlaceholder: "",      valueLabel: "",      isTrt: false },
  "trt-dose":       { label: "TRT Dose",    emoji: "💉", color: "entry-type-trt-dose",   hasValue: true,  valuePlaceholder: "mL",    valueLabel: "mL",    isTrt: true  },
  "trt-restock":    { label: "TRT Restock", emoji: "📦", color: "entry-type-trt-restock",hasValue: true,  valuePlaceholder: "mL",    valueLabel: "mL",    isTrt: true  },
  "trt-adjustment": { label: "TRT Adjust",  emoji: "⚖️", color: "entry-type-trt-adj",   hasValue: true,  valuePlaceholder: "mL",    valueLabel: "mL",    isTrt: true  },
};

let entryFilter = "stim"; // "stim" or "trt"

document.querySelector("#entryFilterToggle")?.addEventListener("click", (event) => {
  const btn = event.target.closest(".entry-filter-btn");
  if (!btn || btn.dataset.filter === entryFilter) return;
  entryFilter = btn.dataset.filter;
  document.querySelectorAll(".entry-filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.filter === entryFilter));
  renderEntryEditor();
});

function renderEntryEditor(showAll = false) {
  if (!els.entryEditorList || !els.entryEditorEmpty) return;
  const allEntries = [...state.entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const entries = allEntries.filter((e) => {
    const meta = ENTRY_TYPE_META[e.type];
    return entryFilter === "trt" ? meta?.isTrt : !meta?.isTrt;
  });
  els.entryEditorEmpty.classList.toggle("hidden", entries.length > 0);
  els.entryEditorList.innerHTML = "";
  if (!entries.length) return;

  const LIMIT = 10;
  const visible = showAll ? entries : entries.slice(0, LIMIT);

  const head = document.createElement("div");
  head.className = "entry-editor-head";
  head.innerHTML = `
    <span>Type</span>
    <span>Date / Time</span>
    <span>Value</span>
    <span>Note</span>
    <span></span>
  `;
  els.entryEditorList.appendChild(head);

  for (const entry of visible) {
    const meta = ENTRY_TYPE_META[entry.type] || ENTRY_TYPE_META.note;
    const row = document.createElement("article");
    row.className = "entry-editor-item";
    row.dataset.type = entry.type;

    // Value field: tablet count for stim, ml for TRT, signed for adjustments, hidden for note
    let valueHtml = "";
    if (entry.type === "adjustment") {
      const absVal = Math.abs(Number(entry.tabletCount || 0));
      valueHtml = `
        <div class="entry-editor-value">
          <div class="entry-adj-wrap">
            <select class="entry-input entry-adj-sign" data-field="adjustmentSign">
              <option value="1" ${Number(entry.tabletCount) >= 0 ? "selected" : ""}>+</option>
              <option value="-1" ${Number(entry.tabletCount) < 0 ? "selected" : ""}>−</option>
            </select>
            <input class="entry-input" data-field="tabletCount" type="number" min="0" step="0.5" value="${absVal}" />
          </div>
        </div>`;
    } else if (entry.type === "trt-adjustment") {
      const absVal = Math.abs(Number(entry.ml || 0));
      valueHtml = `
        <div class="entry-editor-value">
          <div class="entry-adj-wrap">
            <select class="entry-input entry-adj-sign" data-field="adjustmentSign">
              <option value="1" ${Number(entry.ml) >= 0 ? "selected" : ""}>+</option>
              <option value="-1" ${Number(entry.ml) < 0 ? "selected" : ""}>−</option>
            </select>
            <input class="entry-input" data-field="ml" type="number" min="0" step="0.01" value="${absVal}" placeholder="mL" />
          </div>
        </div>`;
    } else if (meta.isTrt && meta.hasValue) {
      const val = Number(entry.ml || 0);
      const compoundHint = entry.compoundName ? `<span class="entry-compound-hint">${entry.compoundName}</span>` : "";
      valueHtml = `
        <div class="entry-editor-value">
          ${compoundHint}
          <input class="entry-input" data-field="ml" type="number" min="0" step="0.01" value="${val}" placeholder="mL" />
        </div>`;
    } else if (meta.hasValue) {
      const val = Number(entry.tabletCount || 0);
      valueHtml = `
        <div class="entry-editor-value">
          <input class="entry-input" data-field="tabletCount" type="number" min="0" step="0.5" value="${val}" placeholder="0" />
        </div>`;
    } else {
      valueHtml = `<div class="entry-editor-value entry-editor-value-empty">—</div>`;
    }

    row.innerHTML = `
      <div class="entry-editor-type">
        <span class="entry-type-pill ${meta.color}">${meta.emoji} ${meta.label}</span>
      </div>
      <div class="entry-editor-time">
        <input class="entry-input entry-time-input" data-field="timestamp" type="text" inputmode="numeric" value="${formatCompactDateTimeValue(entry.timestamp)}" placeholder="M/D/YY HH:MM" />
      </div>
      ${valueHtml}
      <div class="entry-editor-note">
        <input class="entry-input" data-field="note" type="text" value="${String(entry.note || "").replace(/"/g, "&quot;")}" placeholder="${entry.type === "note" ? "Note text" : "Optional note"}" />
      </div>
      <div class="entry-editor-actions">
        <button class="ghost-button entry-icon-button entry-save-button" type="button" data-id="${entry.id}" aria-label="Save entry" title="Save">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4h11l3 3v13H5z"></path><path d="M8 4v6h8V4"></path><path d="M9 17h6"></path></svg>
        </button>
        <button class="delete-button entry-icon-button entry-delete-button" type="button" data-id="${entry.id}" aria-label="Delete entry" title="Delete">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M8 7l1 12h6l1-12"></path></svg>
        </button>
      </div>
    `;
    els.entryEditorList.appendChild(row);
  }

  if (!showAll && entries.length > LIMIT) {
    const btn = document.createElement("button");
    btn.className = "ghost-button compact-action-button";
    btn.style.cssText = "margin: 0.5rem auto; display: block;";
    btn.type = "button";
    btn.textContent = `Show all ${entries.length} entries`;
    btn.addEventListener("click", () => renderEntryEditor(true));
    els.entryEditorList.appendChild(btn);
  }
}

function saveEntryFromRow(button) {
  const row = button.closest(".entry-editor-item");
  const id = button.dataset.id;
  const entry = state.entries.find((item) => item.id === id);
  if (!row || !entry) return;

  const timestampInput = row.querySelector('[data-field="timestamp"]');
  const tabletInput = row.querySelector('[data-field="tabletCount"]');
  const signInput = row.querySelector('[data-field="adjustmentSign"]');
  const noteInput = row.querySelector('[data-field="note"]');
  const nextTimestamp = parseCompactDateTimeValue(timestampInput?.value || "");
  const nextNote = String(noteInput?.value || "").trim();

  const meta = ENTRY_TYPE_META[entry.type] || ENTRY_TYPE_META.note;
  if (meta.isTrt) {
    const mlInput = row.querySelector('[data-field="ml"]');
    const nextMl = Number.parseFloat(mlInput?.value || "");
    if (!Number.isFinite(nextMl) || nextMl < 0) {
      setNotice("TRT rows need a valid mL amount.", "error");
      return;
    }
    if (entry.type === "trt-adjustment") {
      const sign = Number(signInput?.value ?? 1);
      entry.ml = sign * nextMl;
    } else {
      entry.ml = nextMl;
    }
  } else if (entry.type === "dose") {
    const nextTabletCount = Number.parseFloat(tabletInput?.value || "");
    if (!Number.isFinite(nextTabletCount) || nextTabletCount < 0) {
      setNotice("Dose rows need a valid tablet amount.", "error");
      return;
    }
    const mgPerTablet = Number(entry.mgPerTablet || state.settings.mgPerTablet || defaultState.settings.mgPerTablet);
    entry.tabletCount = nextTabletCount;
    entry.mgPerTablet = mgPerTablet;
    entry.amount = nextTabletCount * mgPerTablet;
  } else if (entry.type === "refill") {
    const nextTabletCount = Number.parseFloat(tabletInput?.value || "");
    if (!Number.isFinite(nextTabletCount) || nextTabletCount < 0) {
      setNotice("Refill rows need a valid tablet count.", "error");
      return;
    }
    entry.tabletCount = nextTabletCount;
  } else if (entry.type === "adjustment") {
    const absVal = Number.parseFloat(tabletInput?.value || "");
    const sign = Number(signInput?.value ?? 1);
    if (!Number.isFinite(absVal) || absVal < 0) {
      setNotice("Adjustment rows need a valid tablet count.", "error");
      return;
    }
    entry.tabletCount = sign * absVal;
  }

  entry.timestamp = nextTimestamp;
  entry.note = nextNote;
  saveStateAndSync("Entry updated.");
}

// ── TRT compound editor ──────────────────────────────────────────────
function renderTrtCompounds() {
  if (!els.trtCompoundList) return;
  const compounds = state.settings.trtCompounds || [];
  els.trtCompoundList.innerHTML = "";
  if (els.trtStockMl) els.trtStockMl.value = state.settings.trtStockMl || 0;
  if (els.trtStockVials) els.trtStockVials.value = state.settings.trtStockVials || 0;
  if (els.trtRefillThresholdMl) els.trtRefillThresholdMl.value = state.settings.trtRefillThresholdMl || 2;

  for (const compound of compounds) {
    const row = document.createElement("div");
    row.className = "trt-compound-row";
    row.innerHTML = `
      <div class="trt-compound-fields">
        <label>Name<input class="entry-input" data-field="name" type="text" value="${compound.name}" /></label>
        <label>Elim. half-life (h)<input class="entry-input" data-field="halfLifeHours" type="number" min="1" step="1" value="${compound.halfLifeHours}" /></label>
        <label>Abs. half-life (h)<input class="entry-input" data-field="absorptionHalfLifeHours" type="number" min="1" step="1" value="${compound.absorptionHalfLifeHours || ""}" placeholder="optional" /></label>
        <label>mg/mL<input class="entry-input" data-field="mgPerMl" type="number" min="1" step="1" value="${compound.mgPerMl}" /></label>
      </div>
      <button class="delete-button entry-icon-button trt-delete-compound" type="button" data-id="${compound.id}" aria-label="Delete compound" title="Delete">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M8 7l1 12h6l1-12"></path></svg>
      </button>
    `;
    els.trtCompoundList.appendChild(row);
  }
}

function collectTrtCompounds() {
  if (!els.trtCompoundList) return state.settings.trtCompounds || [];
  const rows = els.trtCompoundList.querySelectorAll(".trt-compound-row");
  const compounds = [];
  for (const row of rows) {
    const name = row.querySelector('[data-field="name"]').value.trim();
    const halfLifeHours = Number(row.querySelector('[data-field="halfLifeHours"]').value) || 192;
    const absorptionHalfLifeHours = Number(row.querySelector('[data-field="absorptionHalfLifeHours"]').value) || 0;
    const mgPerMl = Number(row.querySelector('[data-field="mgPerMl"]').value) || 200;
    const deleteBtn = row.querySelector(".trt-delete-compound");
    const id = deleteBtn?.dataset.id || name.toLowerCase().replace(/\s+/g, "-");
    if (name) compounds.push({ id, name, halfLifeHours, absorptionHalfLifeHours, mgPerMl });
  }
  return compounds;
}

function saveTrtSettingsNow() {
  state.settings.trtCompounds = collectTrtCompounds();
  state.settings.trtStockMl = Number(els.trtStockMl?.value) || 0;
  state.settings.trtStockVials = Number(els.trtStockVials?.value) || 0;
  state.settings.trtRefillThresholdMl = Number(els.trtRefillThresholdMl?.value) || 2;
  persistState(state);
  queueRemoteSync(state);
}

els.addTrtCompound?.addEventListener("click", () => {
  const compounds = state.settings.trtCompounds || [];
  compounds.push({ id: crypto.randomUUID(), name: "", halfLifeHours: 192, mgPerMl: 200 });
  state.settings.trtCompounds = compounds;
  renderTrtCompounds();
});

els.trtCompoundList?.addEventListener("click", (event) => {
  const deleteBtn = event.target.closest(".trt-delete-compound");
  if (!deleteBtn) return;
  state.settings.trtCompounds = (state.settings.trtCompounds || []).filter((c) => c.id !== deleteBtn.dataset.id);
  renderTrtCompounds();
  saveTrtSettingsNow();
  setNotice("Compound removed.", "warning");
});

// Auto-save compounds on any field change
els.trtCompoundList?.addEventListener("input", () => {
  saveTrtSettingsNow();
});

// Auto-save stock fields on change
document.querySelector("#trtStockFields")?.addEventListener("input", () => {
  saveTrtSettingsNow();
});

els.settingsForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  state.settings = {
    medicationName: els.medicationName.value.trim(),
    doseUnit: (els.doseUnit.value || "mg").trim(),
    dailyTarget: Number.parseFloat(els.dailyTarget.value) || defaultState.settings.dailyTarget,
    monthlyTarget: Number.parseFloat(els.monthlyTarget.value) || defaultState.settings.monthlyTarget,
    doseDaysTarget: Number.parseInt(els.doseDaysTarget.value, 10) || defaultState.settings.doseDaysTarget,
    monthlyTablets: state.settings.monthlyTablets,
    mgPerTablet: Number.parseFloat(els.mgPerTablet.value) || defaultState.settings.mgPerTablet,
    decayHalfLifeHours:
      Number.parseFloat(els.decayHalfLifeHours.value) || defaultState.settings.decayHalfLifeHours,
    vacationThreshold: Number.parseInt(els.vacationThreshold.value, 10) || defaultState.settings.vacationThreshold,
    vacationDoseThreshold:
      Number.parseFloat(els.vacationDoseThreshold.value) || defaultState.settings.vacationDoseThreshold,
    vacationFrequencyDays:
      Number.parseInt(els.vacationFrequencyDays.value, 10) || defaultState.settings.vacationFrequencyDays,
    openAiRelayUrl: els.openAiRelayUrl?.value?.trim() ?? state.settings.openAiRelayUrl ?? "",
    openAiModel: (els.openAiModel?.value?.trim() || state.settings.openAiModel || defaultState.settings.openAiModel),
    ouraClientId: els.ouraClientId?.value?.trim() ?? state.settings.ouraClientId ?? "",
    refillIntervalDays: Number.parseInt(els.refillIntervalDays.value, 10) || defaultState.settings.refillIntervalDays,
    refillRequestLeadDays: Number.parseInt(els.refillRequestLeadDays.value, 10) || defaultState.settings.refillRequestLeadDays,
    trtCompounds: state.settings.trtCompounds || defaultState.settings.trtCompounds,
    trtStockMl: state.settings.trtStockMl || 0,
    trtStockVials: state.settings.trtStockVials || 0,
    trtRefillThresholdMl: state.settings.trtRefillThresholdMl || 2,
  };
  persistState(state);
  queueRemoteSync(state);
  hydrate();
  setNotice("Settings saved.", "success");
});

els.exportButton?.addEventListener("click", () => exportData(state));
els.importInput?.addEventListener("change", importData((nextState) => {
  state = nextState;
  hydrate();
}));
els.reloadEntriesButton?.addEventListener("click", () => {
  hydrate();
  setNotice("Reloaded entries from the current saved state.", "success");
});
els.entryEditorList?.addEventListener("click", (event) => {
  const saveButton = event.target.closest(".entry-save-button");
  if (saveButton) {
    saveEntryFromRow(saveButton);
    return;
  }
  const deleteButton = event.target.closest(".entry-delete-button");
  if (deleteButton) {
    deleteEntry(state, deleteButton.dataset.id);
    hydrate();
    setNotice("Entry deleted.", "warning");
  }
});
els.authCreateButton?.addEventListener("click", async () => {
  setBusy(els.authCreateButton, "Creating...", true);
  try {
    const data = await signUpWithEmailPassword(els.authEmail.value.trim(), els.authPassword.value);
    if (data.user && !data.session) {
      setNotice(
        "Account created. Supabase usually requires a one-time confirmation email before your first sign-in. Confirm that email, then come back and sign in here.",
        "warning"
      );
    } else {
      await loadRemoteStateInto(state);
      await refreshOuraConnectionStatus();
      setNotice("Account created and signed in.", "success");
      hydrate();
    }
  } catch (error) {
    setNotice(getFriendlyAuthMessage(error), "error");
  } finally {
    setBusy(els.authCreateButton, "Creating...", false);
  }
});
els.authSignInButton?.addEventListener("click", async () => {
  setBusy(els.authSignInButton, "Signing In...", true);
  try {
    await signInWithPassword(els.authEmail.value.trim(), els.authPassword.value);
    await loadRemoteStateInto(state);
    await refreshOuraConnectionStatus();
    setNotice("Signed in and loaded your cloud data.", "success");
    hydrate();
  } catch (error) {
    setNotice(getFriendlyAuthMessage(error), "error");
  } finally {
    setBusy(els.authSignInButton, "Signing In...", false);
  }
});
els.authRefreshButton?.addEventListener("click", async () => {
  setBusy(els.authRefreshButton, "Refreshing...", true);
  try {
    await loadRemoteStateInto(state);
    await refreshOuraConnectionStatus();
    setNotice("Loaded latest cloud data.", "success");
    hydrate();
  } catch (error) {
    setNotice(getFriendlyAuthMessage(error), "error");
  } finally {
    setBusy(els.authRefreshButton, "Refreshing...", false);
  }
});
els.authSignOutButton?.addEventListener("click", async () => {
  setBusy(els.authSignOutButton, "Signing Out...", true);
  try {
    await signOutFromSupabase(state);
    ouraConnectionStatus = { connected: false, checked: true };
    setNotice("Signed out.", "success");
    hydrate();
  } catch (error) {
    setNotice(getFriendlyAuthMessage(error), "error");
  } finally {
    setBusy(els.authSignOutButton, "Signing Out...", false);
  }
});
els.ouraConnectButton?.addEventListener("click", async () => {
  setBusy(els.ouraConnectButton, "Connecting...", true);
  try {
    await startOuraAuth(state);
  } catch (error) {
    setNotice(getFriendlyAuthMessage(error), "error");
    setBusy(els.ouraConnectButton, "Connecting...", false);
  }
});
els.ouraDisconnectButton?.addEventListener("click", async () => {
  setBusy(els.ouraDisconnectButton, "Disconnecting...", true);
  try {
    await disconnectOuraRemote(state);
    ouraConnectionStatus = { connected: false, checked: true };
    setNotice("Oura disconnected.", "success");
    hydrate();
  } catch (error) {
    setNotice(getFriendlyAuthMessage(error), "error");
  } finally {
    setBusy(els.ouraDisconnectButton, "Disconnect Oura", false);
  }
});

(async () => {
  hydrate();
  try {
    await loadRemoteStateInto(state);
    await refreshOuraConnectionStatus();
  } catch (error) {
    setNotice(getFriendlyAuthMessage(error), "error");
  }
  hydrate();
  registerServiceWorker();
})();
