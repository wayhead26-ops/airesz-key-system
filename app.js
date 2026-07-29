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
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function setMessage(text = "", ok = false) {
  const node = $("#message");
  node.textContent = text;
  node.style.color = ok ? "#28dd8b" : "#ff6f8f";
}

function providerLabel() {
  const labels = { linkvertise: "Linkvertise", lootlabs: "LootLabs", workink: "Work.ink" };
  return labels[state.provider] || state.provider;
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
    if (saved?.sessionId && saved?.plan && saved?.provider) {
      state.session = saved;
      state.plan = saved.plan;
      state.provider = saved.provider;
    }
  } catch {
    localStorage.removeItem("airesz_active_session");
  }
}

function resetRoute() {
  state.session = null;
  saveSession();
  $("#steps").innerHTML = '<div class="empty-state">Tekan Start Checkpoint untuk mulakan route.</div>';
  $("#keyBox").classList.add("hidden");
  $("#routeState").textContent = "Ready";
  $("#startBtn").innerHTML = '<span>▶</span> Start Checkpoint';
  setMessage();
  updateProgress();
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
    button.disabled = !enabled;
    button.classList.toggle("unavailable", !enabled);
    const subtitle = button.querySelector("small");
    if (subtitle && !enabled) subtitle.textContent = "Not configured";
  });
  if (!state.providers[state.provider]) {
    const first = Object.keys(state.providers).find((name) => state.providers[name]);
    if (first) state.provider = first;
  }
  selectUi();
  updateSelection();
}

async function startRoute() {
  if (state.busy || !state.providers[state.provider]) return;
  state.busy = true;
  setMessage();
  $("#startBtn").disabled = true;
  try {
    const data = await api("/api/session/start", {
      method: "POST",
      body: { plan: state.plan, provider: state.provider, clientToken: state.clientToken }
    });
    state.session = data;
    saveSession();
    $("#routeState").textContent = "In Progress";
    $("#startBtn").innerHTML = '<span>↻</span> Route Started';
    renderSteps();
    setMessage("Route dimulakan. Tekan Open pada checkpoint pertama.", true);
  } catch (error) {
    setMessage(error.message);
  } finally {
    state.busy = false;
    $("#startBtn").disabled = false;
  }
}

function renderSteps() {
  const count = planSteps[state.plan];
  $("#steps").innerHTML = Array.from({ length: count }, (_, index) => {
    const step = index + 1;
    const done = state.session && state.session.completedSteps >= step;
    const current = state.session && state.session.completedSteps + 1 === step;
    return `<div class="step ${done ? "done" : ""}">
      <div class="step-index">${done ? "✓" : step}</div>
      <div><strong>Checkpoint ${step}</strong><small>${done ? "Verified" : current ? "Provider akan kembali secara automatik" : "Selesaikan checkpoint sebelumnya"}</small></div>
      <button data-step="${step}" ${!current || done ? "disabled" : ""}>${done ? "Done" : "Open"}</button>
    </div>`;
  }).join("");
  $$('[data-step]').forEach((button) => button.addEventListener("click", () => openCheckpoint(Number(button.dataset.step))));
  updateProgress();
}

async function openCheckpoint(step) {
  if (state.busy || !state.session) return;
  state.busy = true;
  setMessage("Menyediakan checkpoint...", true);
  try {
    const data = await api("/api/session/link", {
      method: "POST",
      body: { sessionId: state.session.sessionId, clientToken: state.clientToken, step }
    });
    if (data.alreadyCompleted) {
      await refreshSession();
      return;
    }
    window.location.assign(data.url);
  } catch (error) {
    setMessage(error.message);
    state.busy = false;
  }
}

async function refreshSession() {
  if (!state.session) return;
  const query = new URLSearchParams({
    sessionId: state.session.sessionId,
    clientToken: state.clientToken
  });
  const data = await api(`/api/session/status?${query}`);
  state.session = { ...state.session, ...data };
  saveSession();
  $("#routeState").textContent = data.completedSteps >= data.requiredSteps ? "Unlocked" : "In Progress";
  renderSteps();
  if (data.completedSteps >= data.requiredSteps && !data.issued) await issueKey();
  return data;
}

async function pollAfterReturn() {
  if (!state.session) return;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const before = Number(state.session.completedSteps || 0);
    const data = await refreshSession();
    if (data.completedSteps >= data.requiredSteps || data.completedSteps > before) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  setMessage("Pengesahan provider masih diproses. Tekan checkpoint semula selepas beberapa saat.");
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
  $("#startBtn").innerHTML = '<span>✓</span> Key Generated';
  setMessage("Access key berjaya dijana.", true);
  state.session = null;
  saveSession();
}

$$(".plan").forEach((button) => button.addEventListener("click", () => {
  if (state.busy || state.session) return;
  state.plan = button.dataset.plan;
  selectUi();
  updateSelection();
}));

$$(".provider").forEach((button) => button.addEventListener("click", () => {
  if (state.busy || state.session || button.disabled) return;
  state.provider = button.dataset.provider;
  selectUi();
  updateSelection();
}));

$("#startBtn").addEventListener("click", startRoute);
$("#copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#keyOutput").textContent);
    $("#copyBtn").textContent = "Copied";
    setTimeout(() => { $("#copyBtn").textContent = "Copy"; }, 1500);
  } catch {
    setMessage("Clipboard permission disekat.");
  }
});

$("#supportLink").href = config.supportUrl;
$("#manualSupportLink").href = config.supportUrl;

(async function init() {
  restoreSession();
  selectUi();
  updateSelection();
  try {
    await loadProviders();
    if (state.session) {
      $("#routeState").textContent = "Resuming";
      renderSteps();
      await pollAfterReturn();
    }
    const params = new URLSearchParams(location.search);
    if (params.get("error")) setMessage(params.get("error"));
    else if (params.get("checkpoint") === "waiting") setMessage("Menunggu pengesahan LootLabs...", true);
    history.replaceState({}, "", location.pathname + location.hash);
  } catch (error) {
    setMessage(error.message);
  }
})();
