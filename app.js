const config = window.AIRESZ_CONFIG;
const planSteps = Object.freeze({ "24H": 1, "48H": 2, "72H": 3 });
const state = {
  plan: "24H",
  provider: "linkvertise",
  providers: {},
  session: null,
  clientToken: getClientToken(),
  busy: false,
  savedKeys: loadSavedKeys(),
  historyKeys: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadSavedKeys() {
  try {
    const value = JSON.parse(localStorage.getItem("airesz_saved_keys") || "[]");
    return Array.isArray(value) ? value.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function persistSavedKeys() {
  localStorage.setItem("airesz_saved_keys", JSON.stringify(state.savedKeys.slice(0, 20)));
}

function saveIssuedKey(keyData) {
  if (!keyData?.key) return;
  const next = {
    id: keyData.id || null,
    key: keyData.key,
    prefix: keyData.prefix || keyData.key.slice(0, 20),
    plan: keyData.plan || "",
    provider: keyData.provider || "",
    issuedAt: Number(keyData.issuedAt || Math.floor(Date.now() / 1000)),
    expiresAt: keyData.expiresAt == null ? null : Number(keyData.expiresAt)
  };
  state.savedKeys = [next, ...state.savedKeys.filter(item => item.key !== next.key)].slice(0, 20);
  persistSavedKeys();
  renderMyKeys();
}

function keyStateLabel(item) {
  const now = Math.floor(Date.now() / 1000);
  if (item.state === "hwid_mismatch") return ["HWID Mismatch", "hwid-mismatch"];
  if (item.state === "revoked") return ["Revoked", "revoked"];
  if (item.state === "paused") return ["Paused", "paused"];
  if (item.state === "expired") return ["Expired", "expired"];
  if (item.expiresAt != null && Number(item.expiresAt) <= now) return ["Expired", "expired"];
  if (item.expiresAt != null && Number(item.expiresAt) - now <= 86400) return ["Expiring Soon", "expiring"];
  return ["Active", "active"];
}

function remainingText(expiresAt) {
  if (expiresAt == null) return "Lifetime";
  let seconds = Math.max(0, Number(expiresAt) - Math.floor(Date.now() / 1000));
  const days = Math.floor(seconds / 86400); seconds %= 86400;
  const hours = Math.floor(seconds / 3600); seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  if (days) return `${days}d ${hours}h remaining`;
  if (hours) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

function maskKey(key) {
  const text = String(key || "");
  if (text.length < 12) return text;
  return `${text.slice(0, 12)}…${text.slice(-4)}`;
}

function renderKeyHistoryCard(item) {
  const [label, cls] = keyStateLabel(item);
  const keyText = item.key || maskKey(item.prefix);
  const canCopy = Boolean(item.key);
  const action = item.state === "hwid_mismatch"
    ? '<span class="key-history-note">Get a new key to continue.</span>'
    : canCopy
      ? `<button class="key-history-copy" data-key="${encodeURIComponent(item.key)}">Copy Key</button>`
      : '<span class="key-history-note">Enter the key below to recover.</span>';

  return `<article class="key-history-card ${cls}">
    <div class="key-history-top"><div><span class="key-state-pill ${cls}">${label}</span><strong>${item.plan ? `${item.plan} Key` : "Airesz Key"}</strong></div><span class="key-history-time">${item.expiresAt == null ? "Lifetime" : remainingText(item.expiresAt)}</span></div>
    <code>${canCopy ? escapeHtml(item.key) : escapeHtml(keyText || "Unknown key")}</code>
    <div class="key-history-meta"><span>Issued ${item.issuedAt ? new Date(Number(item.issuedAt) * 1000).toLocaleString() : "—"}</span><span>${item.expiresAt == null ? "No expiry" : `Expires ${new Date(Number(item.expiresAt) * 1000).toLocaleString()}`}</span></div>
    <div class="key-history-actions">${action}</div>
  </article>`;
}

function bindKeyCopyButtons(root = document) {
  root.querySelectorAll(".key-history-copy").forEach(button => button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(decodeURIComponent(button.dataset.key));
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = "Copy Key"; }, 1200);
    } catch {
      setMessage("Clipboard permission was blocked.");
    }
  }));
}

function renderMyKeys() {
  const target = $("#myKeysList");
  if (!target) return;
  const merged = new Map();
  for (const item of state.historyKeys) merged.set(item.id || item.prefix, { ...item });
  for (const item of state.savedKeys) {
    const key = item.id || item.key;
    const current = merged.get(key) || {};
    merged.set(key, { ...current, ...item });
  }

  const items = [...merged.values()].sort((a, b) => Number(b.issuedAt || 0) - Number(a.issuedAt || 0));
  if (!items.length) {
    target.innerHTML = '<div class="empty-state">No saved keys yet. Generate a key and it will appear here.</div>';
    return;
  }

  const activeItems = [];
  const expiredItems = [];
  for (const item of items) {
    const [, cls] = keyStateLabel(item);
    if (cls === "expired" || cls === "revoked" || cls === "paused") expiredItems.push(item);
    else activeItems.push(item);
  }

  const activeHtml = activeItems.map(renderKeyHistoryCard).join("");
  const expiredHtml = expiredItems.length
    ? `<details class="expired-history">
        <summary><span>Expired History</span><span class="expired-history-count">${expiredItems.length}</span></summary>
        <div class="expired-history-list">${expiredItems.map(renderKeyHistoryCard).join("")}</div>
      </details>`
    : "";

  target.innerHTML = `${activeHtml}${expiredHtml}`;
  bindKeyCopyButtons(target);
}

async function loadMyKeys() {
  try {
    const query = new URLSearchParams({ clientToken: state.clientToken });
    const data = await api(`/api/key/history?${query}`);
    state.historyKeys = data.keys || [];
    renderMyKeys();
  } catch {
    renderMyKeys();
  }
}

async function recoverKey() {
  const input = $("#recoverKeyInput");
  const result = $("#recoverKeyResult");
  const key = input.value.trim();
  if (!key) { setMessage("Enter your old key first."); return; }

  try {
    const data = await api("/api/key/lookup", { method: "POST", body: { key } });
    saveIssuedKey(data.key);

    const [label, cls] = keyStateLabel(data.key);
    const remaining = data.key.expiresAt == null ? "Lifetime" : remainingText(data.key.expiresAt);
    const expiry = data.key.expiresAt == null
      ? "No expiry"
      : `Expires ${new Date(Number(data.key.expiresAt) * 1000).toLocaleString()}`;

    result.hidden = false;
    result.innerHTML = `
      <div class="recover-result-head">
        <span class="key-state-pill ${cls}">${escapeHtml(label)}</span>
        <strong>Key Recovered</strong>
      </div>
      <code>${escapeHtml(data.key.key)}</code>
      <div class="recover-result-meta">
        <span>${escapeHtml(data.key.plan || "Airesz Key")} · ${escapeHtml(remaining)}</span>
        <span>${escapeHtml(expiry)}</span>
      </div>
      <button class="key-history-copy recover-copy-button" type="button" data-key="${encodeURIComponent(data.key.key)}">Copy Key</button>
    `;

    bindKeyCopyButtons(result);
    setMessage("Key recovered successfully.", true);
    input.value = "";
  } catch (error) {
    result.hidden = true;
    result.innerHTML = "";
    setMessage(error.message);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;", "'":"&#39;"}[char]));
}

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
  const labels = { linkvertise: "Linkvertise", workink: "Work.ink", lootlabs: "LootLabs" };
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
    if (error?.data?.code === "KEY_GENERATE_RATE_LIMITED" || error?.data?.code === "RATE_LIMITED") {
      setMessage("Too many key generation requests. Please try again later.");
    } else {
      setMessage(error.message);
    }
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
  saveIssuedKey(data);
  await loadMyKeys();
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
$("#recoverKeyBtn")?.addEventListener("click", recoverKey);
$("#refreshMyKeysBtn")?.addEventListener("click", loadMyKeys);
$("#buyLifetimeBtn")?.addEventListener("click", startLifetimeCheckout);
async function startLifetimeCheckout() {
  const button = $("#buyLifetimeBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Opening Checkout…";
  }
  setMessage("Opening secure Stripe Checkout…", true);
  try {
    const data = await api("/api/stripe/checkout", {
      method: "POST",
      body: { clientToken: state.clientToken }
    });
    if (!data.url) throw new Error("Stripe checkout URL was not returned.");
    location.href = data.url;
  } catch (error) {
    setMessage(error.message);
    if (button) {
      button.disabled = false;
      button.textContent = "💎 Buy Lifetime · $5";
    }
  }
}

async function handleStripeReturn() {
  const params = new URLSearchParams(location.search);
  const success = params.get("stripe_success");
  const cancel = params.get("stripe_cancel");
  const sessionId = params.get("session_id");

  if (cancel === "1") {
    setMessage("Payment cancelled. No Lifetime key was created.");
    history.replaceState({}, "", location.pathname + location.hash);
    return;
  }

  if (success !== "1" || !sessionId) return;

  setMessage("Payment confirmed by Stripe. Preparing your Lifetime key…", true);
  try {
    const data = await api("/api/stripe/claim", {
      method: "POST",
      body: { clientToken: state.clientToken, sessionId }
    });
    if (!data.key) throw new Error("Lifetime key was not returned.");
    saveIssuedKey(data);
    $("#keyOutput").textContent = data.key;
    $("#expiryText").textContent = "Never expires";
    $("#keyBox").classList.remove("hidden");
    $("#routeState").textContent = "Lifetime Unlocked";
    await loadMyKeys();
    setMessage("🎉 Lifetime purchase complete. Your permanent key is ready.", true);
    location.hash = "my-keys";
  } catch (error) {
    setMessage(error.message || "We could not claim your Lifetime key yet.");
  } finally {
    history.replaceState({}, "", location.pathname + location.hash);
  }
}

(async function init() {
  const params = new URLSearchParams(location.search);
  restoreSession();
  selectUi();
  updateSelection();
  try {
    if (location.hash === "#buy-lifetime") {
      setTimeout(() => $("#buyLifetimeBtn")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    }
    await loadProviders();
    await loadMyKeys();
    await handleStripeReturn();
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
