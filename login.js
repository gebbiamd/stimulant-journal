// login.js — standalone sign-in page
// Runs on login.html. After a successful auth event, redirects to index.html.

(function () {
  "use strict";

  // If already signed in, go straight to the app
  const existing = loadState();
  if (existing?.auth?.email) {
    window.location.replace("./index.html");
    return;
  }

  const form = document.querySelector("#loginForm");
  const emailEl = document.querySelector("#loginEmail");
  const passwordEl = document.querySelector("#loginPassword");
  const errorEl = document.querySelector("#loginError");
  const submitBtn = document.querySelector("#loginSubmitBtn");
  const createBtn = document.querySelector("#loginCreateBtn");
  const toastEl = document.querySelector("#toastBanner");

  function showError(msg) {
    errorEl.textContent = msg;
  }

  function setBusy(busy) {
    submitBtn.disabled = busy;
    submitBtn.textContent = busy ? "Signing in…" : "Sign In";
  }

  async function storeCredential(email, password) {
    if (window.PasswordCredential) {
      try {
        const cred = new PasswordCredential({ id: email, password });
        await navigator.credentials.store(cred);
      } catch {
        /* non-critical */
      }
    }
  }

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("visible");
    setTimeout(() => toastEl.classList.remove("visible"), 3000);
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    showError("");
    setBusy(true);
    try {
      await signInWithPassword(email, password);
      await storeCredential(email, password);
      // Load remote data into local state before redirecting
      const state = loadState();
      await loadRemoteStateInto(state);
      window.location.replace("./index.html");
    } catch (err) {
      showError(err.message);
      setBusy(false);
    }
  });

  createBtn?.addEventListener("click", async () => {
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    showError("");
    try {
      const data = await signUpWithEmailPassword(email, password);
      if (data.user && !data.session) {
        showError("Check your email to confirm your account, then sign in.");
      } else {
        await storeCredential(email, password);
        const state = loadState();
        await loadRemoteStateInto(state);
        window.location.replace("./index.html");
      }
    } catch (err) {
      showError(err.message);
    }
  });
})();
