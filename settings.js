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
  authMessage: document.querySelector("#authMessage"),
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
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  rawDataEditor: document.querySelector("#rawDataEditor"),
  reloadRawDataButton: document.querySelector("#reloadRawDataButton"),
  saveRawDataButton: document.querySelector("#saveRawDataButton"),
  ouraStatus: document.querySelector("#ouraStatus"),
  openAiStatus: document.querySelector("#openAiStatus"),
  ouraConnectButton: document.querySelector("#ouraConnectButton"),
  ouraDisconnectButton: document.querySelector("#ouraDisconnectButton"),
};

function setNotice(message, tone = "info") {
  if (!els.authMessage) return;
  els.authMessage.textContent = message;
  els.authMessage.dataset.tone = tone;
  els.authMessage.classList.remove("is-fresh");
  void els.authMessage.offsetWidth;
  els.authMessage.classList.add("is-fresh");
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
    els.ouraStatus.textContent = state.integrations.oura.accessToken
    ? `Connected${state.integrations.oura.lastSyncAt ? `, last sync ${new Date(state.integrations.oura.lastSyncAt).toLocaleString()}` : ""}`
    : "Not connected";
  }
  if (els.openAiStatus) {
    els.openAiStatus.textContent = state.settings.openAiRelayUrl ? "Relay configured" : "Relay not configured";
  }
  if (els.rawDataEditor) {
    els.rawDataEditor.value = JSON.stringify(state, null, 2);
  }
}

function parseRawState(raw) {
  const parsed = JSON.parse(raw);
  return {
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
els.reloadRawDataButton?.addEventListener("click", () => {
  hydrate();
  setNotice("Reloaded the current saved data into the editor.", "success");
});
els.saveRawDataButton?.addEventListener("click", () => {
  try {
    const nextState = parseRawState(els.rawDataEditor.value);
    nextState.entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    state = nextState;
    persistState(state);
    queueRemoteSync(state);
    hydrate();
    setNotice("Raw JSON saved.", "success");
  } catch (error) {
    setNotice(`Could not save raw JSON: ${getFriendlyAuthMessage(error)}`, "error");
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
els.ouraDisconnectButton?.addEventListener("click", () => {
  disconnectOura(state);
  setNotice("Oura disconnected.", "success");
  hydrate();
});

(async () => {
  try {
    await loadRemoteStateInto(state);
  } catch (error) {
    setNotice(getFriendlyAuthMessage(error), "error");
  }
  hydrate();
  registerServiceWorker();
})();
