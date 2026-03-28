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
  monthlyTablets: document.querySelector("#monthlyTablets"),
  mgPerTablet: document.querySelector("#mgPerTablet"),
  decayHalfLifeHours: document.querySelector("#decayHalfLifeHours"),
  vacationThreshold: document.querySelector("#vacationThreshold"),
  vacationDoseThreshold: document.querySelector("#vacationDoseThreshold"),
  vacationFrequencyDays: document.querySelector("#vacationFrequencyDays"),
  openAiRelayUrl: document.querySelector("#openAiRelayUrl"),
  openAiModel: document.querySelector("#openAiModel"),
  ouraClientId: document.querySelector("#ouraClientId"),
  lastRefillDate: document.querySelector("#lastRefillDate"),
  refillIntervalDays: document.querySelector("#refillIntervalDays"),
  refillRequestLeadDays: document.querySelector("#refillRequestLeadDays"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  tabletsOnHand: document.querySelector("#tabletsOnHand"),
  inventorySummary: document.querySelector("#inventorySummary"),
  applyInventoryButton: document.querySelector("#applyInventoryButton"),
  reloadEntriesButton: document.querySelector("#reloadEntriesButton"),
  entryEditorList: document.querySelector("#entryEditorList"),
  entryEditorEmpty: document.querySelector("#entryEditorEmpty"),
  ouraStatus: document.querySelector("#ouraStatus"),
  openAiStatus: document.querySelector("#openAiStatus"),
  ouraConnectButton: document.querySelector("#ouraConnectButton"),
  ouraDisconnectButton: document.querySelector("#ouraDisconnectButton"),
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
  if (els.tabletsOnHand && els.inventorySummary) {
    const usage = getCurrentMonthTabletUsage(state);
    els.tabletsOnHand.value = String(usage.remaining);
    els.inventorySummary.textContent = `${formatNumber(usage.remaining)} on hand • ${formatNumber(usage.used)} used this month`;
  }
  renderEntryEditor();
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

function formatDateTimeLocalValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function saveStateAndSync(message) {
  state.entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  persistState(state);
  queueRemoteSync(state);
  hydrate();
  setNotice(message, "success");
}

function renderEntryEditor() {
  if (!els.entryEditorList || !els.entryEditorEmpty) return;
  const entries = [...state.entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  els.entryEditorEmpty.classList.toggle("hidden", entries.length > 0);
  els.entryEditorList.innerHTML = "";
  if (!entries.length) return;

  const head = document.createElement("div");
  head.className = "entry-editor-head";
  head.innerHTML = `
    <span>Time</span>
    <span>Tabs</span>
    <span>Note</span>
    <span>Actions</span>
  `;
  els.entryEditorList.appendChild(head);

  for (const entry of entries) {
    const row = document.createElement("article");
    row.className = "entry-editor-item";
    const doseValue = entry.type === "dose" ? Number(entry.tabletCount || 0) : "";
    const doseLabel = entry.type === "dose"
      ? `${formatNumber(entry.amount || 0)} ${unitLabel(state)}`
      : "Note only";
    const timestampLabel = new Date(entry.timestamp).toLocaleString([], {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    row.innerHTML = `
      <div class="entry-editor-time">
        <input class="entry-input" data-field="timestamp" type="datetime-local" value="${formatDateTimeLocalValue(entry.timestamp)}" />
        <span class="field-hint muted">${timestampLabel}</span>
      </div>
      <div class="entry-editor-dose">
        <input class="entry-input" data-field="tabletCount" type="number" min="0" step="0.25" value="${doseValue}" ${entry.type === "note" ? "disabled" : ""} />
        <span class="field-hint muted">${doseLabel}</span>
      </div>
      <div class="entry-editor-note">
        <input class="entry-input" data-field="note" type="text" value="${String(entry.note || "").replace(/"/g, "&quot;")}" placeholder="${entry.type === "note" ? "Note entry" : "Optional note"}" />
      </div>
      <div class="entry-editor-actions">
        <span class="entry-type-chip">${entry.type === "dose" ? "Dose" : "Note"}</span>
        <button class="ghost-button entry-save-button" type="button" data-id="${entry.id}">Save</button>
        <button class="delete-button entry-delete-button" type="button" data-id="${entry.id}">Delete</button>
      </div>
    `;
    els.entryEditorList.appendChild(row);
  }
}

function saveEntryFromRow(button) {
  const row = button.closest(".entry-editor-item");
  const id = button.dataset.id;
  const entry = state.entries.find((item) => item.id === id);
  if (!row || !entry) return;

  const timestampInput = row.querySelector('[data-field="timestamp"]');
  const tabletInput = row.querySelector('[data-field="tabletCount"]');
  const noteInput = row.querySelector('[data-field="note"]');
  const nextTimestamp = parseTimestamp(timestampInput?.value || "");
  const nextNote = String(noteInput?.value || "").trim();

  if (entry.type === "dose") {
    const nextTabletCount = Number.parseFloat(tabletInput?.value || "");
    if (!Number.isFinite(nextTabletCount) || nextTabletCount < 0) {
      setNotice("Dose rows need a valid tablet amount.", "error");
      return;
    }
    const mgPerTablet = Number(entry.mgPerTablet || state.settings.mgPerTablet || defaultState.settings.mgPerTablet);
    entry.tabletCount = nextTabletCount;
    entry.mgPerTablet = mgPerTablet;
    entry.amount = nextTabletCount * mgPerTablet;
  }

  entry.timestamp = nextTimestamp;
  entry.note = nextNote;
  saveStateAndSync("Entry updated.");
}

els.settingsForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  state.settings = {
    medicationName: els.medicationName.value.trim(),
    doseUnit: (els.doseUnit.value || "mg").trim(),
    dailyTarget: Number.parseFloat(els.dailyTarget.value) || defaultState.settings.dailyTarget,
    monthlyTarget: Number.parseFloat(els.monthlyTarget.value) || defaultState.settings.monthlyTarget,
    doseDaysTarget: Number.parseInt(els.doseDaysTarget.value, 10) || defaultState.settings.doseDaysTarget,
    monthlyTablets: Number.parseFloat(els.monthlyTablets.value) || defaultState.settings.monthlyTablets,
    mgPerTablet: Number.parseFloat(els.mgPerTablet.value) || defaultState.settings.mgPerTablet,
    decayHalfLifeHours:
      Number.parseFloat(els.decayHalfLifeHours.value) || defaultState.settings.decayHalfLifeHours,
    vacationThreshold: Number.parseInt(els.vacationThreshold.value, 10) || defaultState.settings.vacationThreshold,
    vacationDoseThreshold:
      Number.parseFloat(els.vacationDoseThreshold.value) || defaultState.settings.vacationDoseThreshold,
    vacationFrequencyDays:
      Number.parseInt(els.vacationFrequencyDays.value, 10) || defaultState.settings.vacationFrequencyDays,
    openAiRelayUrl: els.openAiRelayUrl.value.trim(),
    openAiModel: (els.openAiModel.value || defaultState.settings.openAiModel).trim(),
    ouraClientId: els.ouraClientId.value.trim(),
    lastRefillDate: els.lastRefillDate.value || "",
    refillIntervalDays: Number.parseInt(els.refillIntervalDays.value, 10) || defaultState.settings.refillIntervalDays,
    refillRequestLeadDays: Number.parseInt(els.refillRequestLeadDays.value, 10) || defaultState.settings.refillRequestLeadDays,
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
els.applyInventoryButton?.addEventListener("click", () => {
  const onHand = Number.parseFloat(els.tabletsOnHand?.value || "");
  if (!Number.isFinite(onHand) || onHand < 0) {
    setNotice("Current tablets on hand must be zero or more.", "error");
    return;
  }
  const usage = getCurrentMonthTabletUsage(state);
  state.settings.monthlyTablets = usage.used + onHand;
  if (els.monthlyTablets) {
    els.monthlyTablets.value = String(state.settings.monthlyTablets);
  }
  saveStateAndSync("Inventory updated.");
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
