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
  ouraStatus: document.querySelector("#ouraStatus"),
  openAiStatus: document.querySelector("#openAiStatus"),
  ouraConnectButton: document.querySelector("#ouraConnectButton"),
  ouraDisconnectButton: document.querySelector("#ouraDisconnectButton"),
};

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
});

els.exportButton?.addEventListener("click", () => exportData(state));
els.importInput?.addEventListener("change", importData((nextState) => {
  state = nextState;
  hydrate();
}));
els.authCreateButton?.addEventListener("click", async () => {
  try {
    await signUpWithEmailPassword(els.authEmail.value.trim(), els.authPassword.value);
    els.authMessage.textContent =
      "Account created. If Supabase asks for email confirmation, confirm once, then come back and sign in.";
  } catch (error) {
    els.authMessage.textContent = error.message;
  }
});
els.authSignInButton?.addEventListener("click", async () => {
  try {
    await signInWithPassword(els.authEmail.value.trim(), els.authPassword.value);
    await loadRemoteStateInto(state);
    els.authMessage.textContent = "Signed in and loaded your cloud data.";
    hydrate();
  } catch (error) {
    els.authMessage.textContent = error.message;
  }
});
els.authRefreshButton?.addEventListener("click", async () => {
  try {
    await loadRemoteStateInto(state);
    els.authMessage.textContent = "Loaded latest cloud data.";
    hydrate();
  } catch (error) {
    els.authMessage.textContent = error.message;
  }
});
els.authSignOutButton?.addEventListener("click", async () => {
  try {
    await signOutFromSupabase(state);
    els.authMessage.textContent = "Signed out.";
    hydrate();
  } catch (error) {
    els.authMessage.textContent = error.message;
  }
});
els.ouraConnectButton?.addEventListener("click", async () => {
  try {
    await startOuraAuth(state);
  } catch (error) {
    els.authMessage.textContent = error.message;
  }
});
els.ouraDisconnectButton?.addEventListener("click", () => {
  disconnectOura(state);
  hydrate();
});

(async () => {
  try {
    await loadRemoteStateInto(state);
  } catch (error) {
    els.authMessage.textContent = error.message;
  }
  hydrate();
  registerServiceWorker();
})();
