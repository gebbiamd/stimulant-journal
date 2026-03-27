"use strict";

let state = loadState();
if (consumeOuraRedirect(state)) {
  state = loadState();
}

const els = {
  settingsForm: document.querySelector("#settingsForm"),
  medicationName: document.querySelector("#medicationName"),
  doseUnit: document.querySelector("#doseUnit"),
  dailyTarget: document.querySelector("#dailyTarget"),
  monthlyTarget: document.querySelector("#monthlyTarget"),
  doseDaysTarget: document.querySelector("#doseDaysTarget"),
  monthlyTablets: document.querySelector("#monthlyTablets"),
  mgPerTablet: document.querySelector("#mgPerTablet"),
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
  els.ouraStatus.textContent = state.integrations.oura.accessToken
    ? `Connected${state.integrations.oura.lastSyncAt ? `, last sync ${new Date(state.integrations.oura.lastSyncAt).toLocaleString()}` : ""}`
    : "Not connected";
  els.openAiStatus.textContent = state.settings.openAiRelayUrl ? "Relay configured" : "Relay not configured";
}

els.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.settings = {
    medicationName: els.medicationName.value.trim(),
    doseUnit: (els.doseUnit.value || "mg").trim(),
    dailyTarget: Number.parseFloat(els.dailyTarget.value) || defaultState.settings.dailyTarget,
    monthlyTarget: Number.parseFloat(els.monthlyTarget.value) || defaultState.settings.monthlyTarget,
    doseDaysTarget: Number.parseInt(els.doseDaysTarget.value, 10) || defaultState.settings.doseDaysTarget,
    monthlyTablets: Number.parseFloat(els.monthlyTablets.value) || defaultState.settings.monthlyTablets,
    mgPerTablet: Number.parseFloat(els.mgPerTablet.value) || defaultState.settings.mgPerTablet,
    vacationThreshold: Number.parseInt(els.vacationThreshold.value, 10) || defaultState.settings.vacationThreshold,
    vacationDoseThreshold:
      Number.parseFloat(els.vacationDoseThreshold.value) || defaultState.settings.vacationDoseThreshold,
    vacationFrequencyDays:
      Number.parseInt(els.vacationFrequencyDays.value, 10) || defaultState.settings.vacationFrequencyDays,
  };
  persistState(state);
  hydrate();
});

els.exportButton.addEventListener("click", () => exportData(state));
els.importInput.addEventListener("change", importData((nextState) => {
  state = nextState;
  hydrate();
}));
els.ouraConnectButton.addEventListener("click", () => startOuraAuth(state));
els.ouraDisconnectButton.addEventListener("click", () => {
  disconnectOura(state);
  hydrate();
});

hydrate();
registerServiceWorker();
