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
  historyKeys: [],
  historyTab: "active",
  discordToken: localStorage.getItem("airesz_discord_session") || "",
  discordUser: null
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
  if (item.state === "deleted") return ["Deleted", "revoked"];
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
  const action = item.state === "deleted"
    ? '<span class="key-history-note">This key was deleted and is no longer active.</span>'
    : item.state === "hwid_mismatch"
    ? '<span class="key-history-note">Get a new key to continue.</span>'
    : canCopy
      ? `<button class="key-history-copy" data-key="${encodeURIComponent(item.key)}">Copy Key</button>`
      : '<span class="key-history-note">Enter the key below to recover.</span>';

  const keyTitle = item.source === "giveaway" ? "Giveaway Key" : item.plan ? `${item.plan} Key` : "Airesz Key";
  return `<article class="key-history-card ${cls} ${item.source === "giveaway" ? "giveaway" : ""}">
    <div class="key-history-top"><div><span class="key-state-pill ${cls}">${label}</span><strong>${keyTitle}</strong></div><span class="key-history-time">${item.expiresAt == null ? "Lifetime" : remainingText(item.expiresAt)}</span></div>
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
    const mergedItem = { ...current, ...item };
    if (current.state === "deleted") mergedItem.state = "deleted";
    merged.set(key, mergedItem);
  }

  const items = [...merged.values()].sort((a, b) => Number(b.issuedAt || 0) - Number(a.issuedAt || 0));
  if (!items.length) {
    $("#activeKeyCount").textContent = "0";
    $("#expiredKeyCount").textContent = "0";
    $("#deletedKeyCount").textContent = "0";
    target.innerHTML = '<div class="empty-state">No active keys yet. Generate a free key or buy Lifetime access.</div>';
    return;
  }

  const groups = { active: [], expired: [], deleted: [] };
  for (const item of items) {
    const [, cls] = keyStateLabel(item);
    if (item.state === "deleted") groups.deleted.push(item);
    else if (cls === "expired" || cls === "revoked" || cls === "paused") groups.expired.push(item);
    else groups.active.push(item);
  }
  const counts = { active: groups.active.length, expired: groups.expired.length, deleted: groups.deleted.length };
  $("#activeKeyCount").textContent = counts.active;
  $("#expiredKeyCount").textContent = counts.expired;
  $("#deletedKeyCount").textContent = counts.deleted;
  $$(".key-history-tab").forEach((button) => {
    const selected = button.dataset.historyTab === state.historyTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  const selectedItems = groups[state.historyTab] || groups.active;
  const emptyLabel = state.historyTab === "deleted"
    ? "No deleted keys in your history."
    : state.historyTab === "expired"
      ? "No expired keys in your history."
      : "No active keys yet. Generate a free key or buy Lifetime access.";
  target.innerHTML = selectedItems.length
    ? selectedItems.map(renderKeyHistoryCard).join("")
    : `<div class="empty-state">${emptyLabel}</div>`;
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
  const headers = {};
  if (options.body) headers["content-type"] = "application/json";
  if (state.discordToken) headers.authorization = `Bearer ${state.discordToken}`;
  const response = await fetch(`${config.workerUrl.replace(/\/$/, "")}${path}`, {
    method: options.method || "GET",
    headers,
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

function renderDiscordIdentity() {
  const loggedIn = Boolean(state.discordUser);
  $("#identityGuest")?.classList.toggle("hidden", loggedIn);
  $("#identityUser")?.classList.toggle("hidden", !loggedIn);
  const topButton = $("#topLoginBtn");
  if (topButton) topButton.textContent = loggedIn ? state.discordUser.username : "Login with Discord";
  if (loggedIn) {
    $("#discordUsername").textContent = state.discordUser.username;
    const avatar = $("#discordAvatar");
    avatar.src = state.discordUser.avatarUrl || "assets/airesz-mark.png";
    $("#identityDescription").textContent = "Your Discord-linked keys are synced across devices. Guest checkpoint access remains available.";
    $("#keyHistoryDescription").textContent = "Showing browser keys and every key linked to your Discord account.";
  } else {
    $("#identityDescription").textContent = "Guest keys stay in this browser. Discord Login keeps linked key history available across your devices.";
    $("#keyHistoryDescription").textContent = "Guest history belongs to this browser. Login with Discord to access linked keys across devices.";
  }
}

function loginWithDiscord() {
  const returnUrl = new URL(location.href);
  returnUrl.searchParams.delete("discord_login");
  returnUrl.searchParams.delete("discord_error");
  const start = new URL(`${config.workerUrl.replace(/\/$/, "")}/api/auth/discord/start`);
  start.searchParams.set("return_to", returnUrl.toString());
  location.href = start.toString();
}

async function handleDiscordLoginReturn() {
  const params = new URLSearchParams(location.search);
  const code = params.get("discord_login");
  const loginError = params.get("discord_error");
  if (loginError) setMessage(loginError);
  if (!code) return;
  const data = await api("/api/auth/discord/exchange", { method: "POST", body: { code } });
  state.discordToken = data.token;
  state.discordUser = data.user;
  localStorage.setItem("airesz_discord_session", data.token);
  params.delete("discord_login");
  params.delete("discord_error");
  const clean = `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`;
  history.replaceState({}, "", clean);
  renderDiscordIdentity();
  setMessage(`Welcome, ${data.user.username}. Your Discord key history is connected.`, true);
}

async function restoreDiscordLogin() {
  if (!state.discordToken) { renderDiscordIdentity(); return; }
  try {
    const data = await api("/api/auth/discord/me");
    state.discordUser = data.user;
  } catch {
    state.discordToken = "";
    state.discordUser = null;
    localStorage.removeItem("airesz_discord_session");
  }
  renderDiscordIdentity();
}

async function logoutDiscord() {
  try { await api("/api/auth/discord/logout", { method: "POST", body: {} }); } catch {}
  state.discordToken = "";
  state.discordUser = null;
  state.historyKeys = [];
  localStorage.removeItem("airesz_discord_session");
  renderDiscordIdentity();
  await loadMyKeys();
  setMessage("Logged out. Guest mode is active.", true);
}

async function logoutAllDiscordDevices() {
  if (!confirm("Logout this Discord account from every Airesz Key System browser?")) return;
  try {
    await api("/api/auth/discord/logout-all", { method: "POST", body: {} });
    state.discordToken = "";
    state.discordUser = null;
    state.historyKeys = [];
    localStorage.removeItem("airesz_discord_session");
    renderDiscordIdentity();
    await loadMyKeys();
    setMessage("Logged out from all devices. Guest mode is active.", true);
  } catch (error) {
    setMessage(error.message || "Could not logout all devices.");
  }
}

async function linkLegacyLifetimePurchases() {
  if (!state.discordUser || !state.clientToken) return 0;
  const data = await api("/api/stripe/link-discord", {
    method: "POST",
    body: { clientToken: state.clientToken }
  });
  const count = Number(data.count || 0);
  if (count > 0) setMessage(`${count} previous Lifetime purchase${count === 1 ? " was" : "s were"} linked to your Discord account.`, true);
  return count;
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
  if ($("#routeTitle")) $("#routeTitle").textContent = `${hours} hours · ${providerLabel()}`;
  if ($("#summaryPlan")) $("#summaryPlan").textContent = `${hours} Hours`;
  if ($("#summaryProvider")) $("#summaryProvider").textContent = providerLabel();
  if ($("#summarySteps")) $("#summarySteps").textContent = `${count} Checkpoint${count === 1 ? "" : "s"}`;
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
$$(".key-history-tab").forEach((button) => button.addEventListener("click", () => {
  state.historyTab = button.dataset.historyTab || "active";
  renderMyKeys();
}));
$("#discordLoginBtn")?.addEventListener("click", loginWithDiscord);
$("#topLoginBtn")?.addEventListener("click", () => state.discordUser ? $(".identity-gateway")?.scrollIntoView({ behavior: "smooth" }) : loginWithDiscord());
$("#discordLogoutBtn")?.addEventListener("click", logoutDiscord);
$("#discordLogoutAllBtn")?.addEventListener("click", logoutAllDiscordDevices);
async function startLifetimeCheckout() {
  const params = new URLSearchParams(location.search);
  const discordLinkToken = params.get("discord_link") || "";
  if (!state.discordUser && !discordLinkToken) {
    localStorage.setItem("airesz_pending_lifetime_checkout", "1");
    setMessage("Login with Discord before buying Lifetime. Returning you to checkout after login…", true);
    loginWithDiscord();
    return;
  }
  const button = $("#buyLifetimeBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Opening Checkout…";
  }
  setMessage("Opening secure Stripe Checkout…", true);
  try {
    const data = await api("/api/stripe/checkout", {
      method: "POST",
      body: {
        clientToken: state.clientToken,
        ...(discordLinkToken ? { discordLinkToken } : {})
      }
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
    await handleDiscordLoginReturn();
    await restoreDiscordLogin();
    if (state.discordUser) {
      await linkLegacyLifetimePurchases();
      if (localStorage.getItem("airesz_pending_lifetime_checkout") === "1") {
        localStorage.removeItem("airesz_pending_lifetime_checkout");
        await startLifetimeCheckout();
        return;
      }
    }
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
