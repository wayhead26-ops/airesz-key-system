const config = window.AIRESZ_CONFIG;
const planSteps = Object.freeze({ "24H": 1, "48H": 2, "72H": 3 });
const state = {
  plan: "24H",
  provider: "linkvertise",
  providers: {},
  session: null,
  clientToken: getClientToken(),
  busy: false
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function getClientToken() {
  let token = localStorage.getItem("airesz_client_token");
  if (!token) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    token = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("airesz_client_token", token);
  }
  return token;
}

async function api(path, options = {}) {
  const response = await fetch(`${config.workerUrl.replace(/\/$/, "")}${path}`, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function setMessage(text = "", ok = false) {
  const node = $("#message");
  node.textContent = text;
  node.style.color = ok ? "#28dd8b" : "#ff6f8f";
}

function providerLabel() {
  const labels = { linkvertise: "Linkvertise", workink: "Work.ink" };
  return labels[state.provider] || state.provider;
}

function hasActiveSession() {
  return Boolean(state.session?.sessionId);
}

function updateControls() {
  const locked = hasActiveSession();
  $$(".plan").forEach((button) => {
    button.disabled = locked || state.busy;
    button.classList.toggle("session-locked", locked);
  });
  $$(".provider").forEach((button) => {
    const enabled = Boolean(state.providers[button.dataset.provider]);
    button.disabled = locked || state.busy || !enabled;
    button.classList.toggle("session-locked", locked);
    button.classList.toggle("unavailable", !enabled);
  });
  $("#startBtn").disabled = locked || state.busy || !state.providers[state.provider];
  $("#cancelBtn").classList.toggle("hidden", !locked);
  $("#cancelBtn").disabled = state.busy;
}

function updateSelection() {
  const count = planSteps[state.plan];
  const hours = state.plan.replace("H", "");
  $("#routeTitle").textContent = `${hours} hours · ${providerLabel()}`;
  $("#summaryPlan").textContent = `${hours} Hours`;
  $("#summaryProvider").textContent = providerLabel();
  $("#summarySteps").textContent = `${count} Checkpoint${count === 1 ? "" : "s"}`;
  updateProgress();
}

function updateProgress() {
  const required = state.session?.requiredSteps || planSteps[state.plan];
  const done = state.session?.completedSteps || 0;
  $("#progressText").textContent = `Progress ${done}/${required}`;
  $("#progressBar").style.width = `${required ? Math.min(100, (done / required) * 100) : 0}%`;
}

function saveSession() {
  if (state.session) localStorage.setItem("airesz_active_session", JSON.stringify(state.session));
  else localStorage.removeItem("airesz_active_session");
}

function restoreSession() {
  try {
    const saved = JSON.parse(localStorage.getItem("airesz_active_session") || "null");
    const expired = saved?.expiresAt && Number(saved.expiresAt) <= Math.floor(Date.now() / 1000);
    if (saved?.sessionId && saved?.plan && saved?.provider && !expired) {
      state.session = saved;
      state.plan = saved.plan;
      state.provider = saved.provider;
    } else if (expired) {
      localStorage.removeItem("airesz_active_session");
    }
  } catch {
    localStorage.removeItem("airesz_active_session");
  }
}

function resetRoute(options = {}) {
  state.session = null;
  saveSession();
  $("#steps").innerHTML = '<div class="empty-state">Press Start Checkpoint to begin your route.</div>';
  $("#keyBox").classList.add("hidden");
  $("#routeState").textContent = "Ready";
  $("#startBtn").innerHTML = '<span>▶</span> Start Checkpoint';
  if (!options.keepMessage) setMessage();
  updateProgress();
  updateControls();
}

function isDeadSessionError(error) {
  return error?.status === 404 || error?.status === 410;
}

function selectUi() {
  $$(".plan").forEach((node) => node.classList.toggle("active", node.dataset.plan === state.plan));
  $$(".provider").forEach((node) => node.classList.toggle("active", node.dataset.provider === state.provider));
}

async function loadProviders() {
  const data = await api("/api/providers");
  state.providers = data.providers || {};
  $$(".provider").forEach((button) => {
    const enabled = Boolean(state.providers[button.dataset.provider]);
    const subtitle = button.querySelector("small");
    if (subtitle && !enabled) subtitle.textContent = "Not configured";
  });
  if (!state.providers[state.provider] && !hasActiveSession()) {
    const first = Object.keys(state.providers).find((name) => state.providers[name]);
    if (first) state.provider = first;
  }
  selectUi();
  updateSelection();
  updateControls();
}

async function discoverActiveSession() {
  const query = new URLSearchParams({ clientToken: state.clientToken });
  const data = await api(`/api/session/active?${query}`);
  if (!data.session) return false;
  state.session = data.session;
  state.plan = data.session.plan;
  state.provider = data.session.provider;
  saveSession();
  selectUi();
  updateSelection();
  updateControls();
  return true;
}

async function startRoute() {
  if (state.busy || hasActiveSession() || !state.providers[state.provider]) return;
  state.busy = true;
  setMessage();
  $("#keyBox").classList.add("hidden");
  updateControls();
  try {
    const data = await api("/api/session/start", {
      method: "POST",
      body: { plan: state.plan, provider: state.provider, clientToken: state.clientToken }
    });
    state.session = data;
    state.plan = data.plan;
    state.provider = data.provider;
    saveSession();
    selectUi();
    updateSelection();
    $("#routeState").textContent = "In Progress";
    $("#startBtn").innerHTML = '<span>↻</span> Route Started';
    renderSteps();
    setMessage(data.resumed ? "Your previous active route has been resumed." : "Route started. Press Open on the first checkpoint.", true);
  } catch (error) {
    setMessage(error.message);
  } finally {
    state.busy = false;
    updateControls();
  }
}

function renderSteps() {
  const count = state.session?.requiredSteps || planSteps[state.plan];
  $("#steps").innerHTML = Array.from({ length: count }, (_, index) => {
    const step = index + 1;
    const done = state.session && Number(state.session.completedSteps) >= step;
    const current = state.session && Number(state.session.completedSteps) + 1 === step;
    return `<div class="step ${done ? "done" : ""}">
      <div class="step-index">${done ? "✓" : step}</div>
      <div><strong>Checkpoint ${step}</strong><small>${done ? "Verified" : current ? "The provider will return you automatically" : "Complete the previous checkpoint first"}</small></div>
      <button data-step="${step}" ${!current || done ? "disabled" : ""}>${done ? "Done" : "Open"}</button>
    </div>`;
  }).join("");
  $$('[data-step]').forEach((button) => button.addEventListener("click", () => openCheckpoint(Number(button.dataset.step))));
  updateProgress();
  updateControls();
}

async function openCheckpoint(step) {
  if (state.busy || !state.session) return;
  state.busy = true;
  setMessage("Preparing checkpoint...", true);
  updateControls();
  try {
    const data = await api("/api/session/link", {
      method: "POST",
      body: { sessionId: state.session.sessionId, clientToken: state.clientToken, step }
    });
    if (data.alreadyCompleted) {
      await refreshSession();
      state.busy = false;
      updateControls();
      return;
    }
    window.location.assign(data.url);
  } catch (error) {
    if (isDeadSessionError(error)) {
      resetRoute({ keepMessage: true });
      setMessage("This session has expired or no longer exists. Choose a new route.");
    } else {
      setMessage(error.message);
    }
    state.busy = false;
    updateControls();
  }
}

async function refreshSession() {
  if (!state.session) return null;
  const query = new URLSearchParams({
    sessionId: state.session.sessionId,
    clientToken: state.clientToken
  });
  try {
    const data = await api(`/api/session/status?${query}`);
    state.session = { ...state.session, ...data };
    state.plan = data.plan;
    state.provider = data.provider;
    saveSession();
    selectUi();
    updateSelection();
    $("#routeState").textContent = data.completedSteps >= data.requiredSteps ? "Unlocked" : "In Progress";
    renderSteps();
    if (data.completedSteps >= data.requiredSteps && !data.issued) await issueKey();
    return data;
  } catch (error) {
    if (isDeadSessionError(error)) {
      resetRoute({ keepMessage: true });
      setMessage("The session expired automatically. You can choose a new plan.");
      return null;
    }
    throw error;
  }
}

async function pollAfterReturn() {
  if (!state.session) return;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const before = Number(state.session?.completedSteps || 0);
    const data = await refreshSession();
    if (!data || data.completedSteps >= data.requiredSteps || data.completedSteps > before) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  setMessage("Provider verification is still processing. Try the checkpoint again in a few seconds.");
}

async function issueKey() {
  const data = await api("/api/key/issue", {
    method: "POST",
    body: { sessionId: state.session.sessionId, clientToken: state.clientToken }
  });
  $("#keyOutput").textContent = data.key;
  $("#expiryText").textContent = `Expires ${new Date(data.expiresAt * 1000).toLocaleString()}`;
  $("#keyBox").classList.remove("hidden");
  $("#routeState").textContent = "Unlocked";
  $("#startBtn").innerHTML = '<span>＋</span> Start Another Route';
  setMessage("Your access key has been generated successfully.", true);
  state.session = null;
  saveSession();
  updateControls();
}

async function cancelRoute() {
  if (state.busy || !state.session) return;
  const confirmed = window.confirm(`Cancel the ${state.plan} route through ${providerLabel()}? All checkpoint progress for this session will be lost.`);
  if (!confirmed) return;

  state.busy = true;
  updateControls();
  try {
    await api("/api/session/cancel", {
      method: "POST",
      body: { sessionId: state.session.sessionId, clientToken: state.clientToken }
    });
    resetRoute({ keepMessage: true });
    setMessage("Route cancelled. You can choose a new plan and provider.", true);
  } catch (error) {
    if (isDeadSessionError(error)) {
      resetRoute({ keepMessage: true });
      setMessage("The previous session has expired. You can choose a new route.", true);
    } else {
      setMessage(error.message);
    }
  } finally {
    state.busy = false;
    updateControls();
  }
}

$$(".plan").forEach((button) => button.addEventListener("click", () => {
  if (state.busy || hasActiveSession()) return;
  state.plan = button.dataset.plan;
  selectUi();
  updateSelection();
}));

$$(".provider").forEach((button) => button.addEventListener("click", () => {
  if (state.busy || hasActiveSession() || button.disabled) return;
  state.provider = button.dataset.provider;
  selectUi();
  updateSelection();
}));

$("#startBtn").addEventListener("click", startRoute);
$("#cancelBtn").addEventListener("click", cancelRoute);
$("#copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#keyOutput").textContent);
    $("#copyBtn").textContent = "Copied";
    setTimeout(() => { $("#copyBtn").textContent = "Copy"; }, 1500);
  } catch {
    setMessage("Clipboard permission was blocked.");
  }
});

$("#supportLink").href = config.supportUrl;
$("#manualSupportLink").href = config.supportUrl;

(async function init() {
  const params = new URLSearchParams(location.search);
  restoreSession();
  selectUi();
  updateSelection();
  try {
    await loadProviders();
    if (!state.session) await discoverActiveSession();
    if (state.session) {
      $("#routeState").textContent = "Resuming";
      $("#startBtn").innerHTML = '<span>↻</span> Route Started';
      renderSteps();
      const returnedFromProvider = params.has("resume") || params.has("checkpoint") || params.has("error");
      if (returnedFromProvider) await pollAfterReturn();
      else await refreshSession();
    }
    if (params.get("error")) setMessage(params.get("error"));
    history.replaceState({}, "", location.pathname + location.hash);
  } catch (error) {
    if (isDeadSessionError(error)) {
      resetRoute({ keepMessage: true });
      setMessage("The previous session has expired. Choose a new route.");
    } else {
      setMessage(error.message);
    }
  } finally {
    updateControls();
  }
})();
